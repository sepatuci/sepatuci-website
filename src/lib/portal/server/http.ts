import { ID_PATTERN, LIMITS } from "../constants";
import type { ApiErrorBody, FieldIssue } from "../types";
import { getPortalAdmin, type PortalAdmin } from "./admin";
import { PortalConfigError } from "./env";
import { evaluateGate, type AuthedUser, type GateClaims, type GateNeed } from "./gate";
import { allowRequest, shouldLogRefusal } from "./rate-limit";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: FieldIssue[],
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function invalid(fields: FieldIssue[], message = "Some fields need attention."): HttpError {
  return new HttpError(422, "invalid", message, fields);
}

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

function errorResponse(error: unknown, carriedSignIn: boolean): Response {
  if (error instanceof HttpError) {
    const body: ApiErrorBody = { error: error.message, code: error.code };
    if (error.fields) body.fields = error.fields;
    return json(body, error.status);
  }
  if (error instanceof PortalConfigError) {
    // Logged for requests that carry a sign-in, which is how a real setup
    // mistake shows up. Until the portal is connected, anonymous visits to
    // these addresses would otherwise fill the log.
    if (carriedSignIn) console.error("[Portal] Configuration error:", error.message);
    const body: ApiErrorBody = {
      error: "The portal isn't available right now.",
      code: error.code,
    };
    return json(body, 503);
  }
  // The browser gave up on the request, usually because the page was closing.
  if (error instanceof Error && (error.name === "AbortError" || error.message === "aborted")) {
    const body: ApiErrorBody = { error: "The request was cancelled.", code: "aborted" };
    return json(body, 400);
  }
  console.error("[Portal] Unhandled error:", error instanceof Error ? error.message : error);
  const body: ApiErrorBody = { error: "Something went wrong. Try again.", code: "internal" };
  return json(body, 500);
}

function firebaseErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "";
}

/**
 * Verifies the caller's ID token, including that it has not been revoked and
 * that the account is not disabled or deleted, then applies the gate.
 */
async function authenticate(
  request: Request,
  admin: PortalAdmin,
  need: GateNeed,
  nowMs: number,
  passwordSetup: boolean,
): Promise<AuthedUser> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header);
  if (!match) throw new HttpError(401, "unauthenticated", "Sign in to continue.");

  let claims: GateClaims;
  try {
    claims = await admin.auth.verifyIdToken(match[1], true);
  } catch (error) {
    switch (firebaseErrorCode(error)) {
      case "auth/user-disabled":
        throw new HttpError(401, "account_disabled", "This account has been disabled.");
      case "auth/id-token-revoked":
        throw new HttpError(401, "session_revoked", "Your session has ended. Sign in again.");
      case "auth/id-token-expired":
        throw new HttpError(401, "token_expired", "Your session has expired.");
      case "auth/user-not-found":
        throw new HttpError(401, "account_removed", "This account no longer exists.");
      case "auth/argument-error":
        // Not a token this project issued, or not a token at all.
        throw new HttpError(401, "unauthenticated", "Sign in to continue.");
      default:
        // The check itself could not be completed (a network or Google-side
        // failure). That is not the caller's doing, so it must not read as
        // "signed out": the browser would throw away their session mid-task.
        console.error("[Portal] Could not verify a sign-in:", firebaseErrorCode(error) || "unknown error");
        throw new HttpError(
          503,
          "auth_unavailable",
          "We couldn't check your sign-in just now. Try again in a moment.",
        );
    }
  }

  const result = evaluateGate(claims, {
    need,
    adminEmails: admin.env.adminEmails,
    nowMs,
    issuedRequired: admin.env.mode === "live",
    passwordSetup,
  });
  if (!result.ok) throw new HttpError(result.status, result.code, result.message);
  return result.user;
}

async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "unsupported_media_type", "Send JSON.");
  }
  const tooLarge = new HttpError(413, "too_large", "That's too much data to send at once.");
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge;

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw tooLarge;
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "bad_json", "The request wasn't valid JSON.");
  }
}

export interface RouteContext<P> {
  request: Request;
  params: P;
  admin: PortalAdmin;
  user: AuthedUser;
  /** One reading of the server clock for the whole request, taken as it arrived. */
  now: Date;
  /** Parsed JSON for requests that carry a body, otherwise undefined. Untrusted. */
  body: unknown;
}

export interface RouteOptions {
  role: GateNeed;
  maxBodyBytes?: number;
  /**
   * Whether the request is held to the lower ceiling for changes. By default
   * every method except GET is. Turning a deliverable in opts out, so it is
   * never refused because of the autosaves that came before it.
   */
  countsAsWrite?: boolean;
  /**
   * Counted against the ceilings but never refused by them. Only signing out
   * uses this: ending a session has to work even for an account that someone
   * else is flooding with requests.
   */
  alwaysAllowed?: boolean;
  /**
   * Open to an account that is still on a temporary password, which every
   * other route refuses. Only the route that replaces that password sets this.
   */
  passwordSetup?: boolean;
}

type RouteHandler<P> = (context: RouteContext<P>) => Promise<object>;

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH"]);

/**
 * Wraps a portal route handler. Every handler under /api/portal is exported
 * through this function, which is what guarantees that no route can be reached
 * without a verified token and the right role.
 */
export function portalRoute<P extends Record<string, string> = Record<string, never>>(
  options: RouteOptions,
  handler: RouteHandler<P>,
) {
  return async (request: Request, route: { params: Promise<P> }): Promise<Response> => {
    // Read before anything slow, so a request is judged by when it arrived:
    // one sent just before a deadline is not pushed past it by the sign-in check.
    const now = new Date();
    try {
      const admin = getPortalAdmin();
      const user = await authenticate(
        request,
        admin,
        options.role,
        now.getTime(),
        options.passwordSetup === true,
      );
      const write = options.countsAsWrite ?? request.method !== "GET";
      if (!allowRequest(user.uid, now.getTime(), write) && options.alwaysAllowed !== true) {
        // One line per account per minute, so an admin can find who to look at.
        if (shouldLogRefusal(user.uid, now.getTime())) {
          console.warn("[Portal] Rate limit reached for account", user.uid);
        }
        throw new HttpError(429, "rate_limited", "Too many requests. Wait a minute and try again.");
      }

      // Routes without a dynamic segment are given no params at all.
      const params = ((await route.params) ?? {}) as P;
      // Ids go straight into document paths, so anything unexpected is treated as not found.
      for (const segment of Object.values(params)) {
        if (!ID_PATTERN.test(segment)) throw new HttpError(404, "not_found", "Not found.");
      }

      const body = METHODS_WITH_BODY.has(request.method)
        ? await readJsonBody(request, options.maxBodyBytes ?? LIMITS.smallBodyBytes)
        : undefined;

      return json(await handler({ request, params, admin, user, now, body }));
    } catch (error) {
      return errorResponse(error, request.headers.has("authorization"));
    }
  };
}

export interface PublicRouteOptions {
  maxBodyBytes?: number;
  /** What the route's requests are counted under. Each route open to everyone has its own. */
  limitKey: string;
}

export interface PublicRouteContext {
  request: Request;
  admin: PortalAdmin;
  /** One reading of the server clock for the whole request, taken as it arrived. */
  now: Date;
  /** Parsed JSON for requests that carry a body, otherwise undefined. Untrusted. */
  body: unknown;
}

type PublicRouteHandler = (context: PublicRouteContext) => Promise<object>;

/**
 * The caller's address, or "unknown" without one. The first hop of
 * x-forwarded-for is the client on Vercel, which overwrites that header rather
 * than appending to it. Behind a proxy that appends, it is whatever the client
 * sent, and the ceiling below is then only as good as the proxy.
 */
function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0].trim();
  return first.length > 0 ? first.slice(0, 64) : "unknown";
}

/**
 * Wraps a route that needs no sign-in. The only one is redeeming a preview
 * link, whose code is the credential. With no account to count against,
 * requests are counted against the caller's address, under the ceilings for
 * changes, which are the lower pair. There is no ceiling for the route as a
 * whole: one would let an anonymous flood shut the route for everyone.
 */
export function publicRoute(options: PublicRouteOptions, handler: PublicRouteHandler) {
  return async (request: Request, _route?: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const now = new Date();
    try {
      const admin = getPortalAdmin();
      const key = `${options.limitKey}:${clientAddress(request)}`;
      if (!allowRequest(key, now.getTime(), true)) {
        // One line per address per minute, naming the route rather than any account.
        if (shouldLogRefusal(key, now.getTime())) {
          console.warn("[Portal] Rate limit reached for the open route", options.limitKey);
        }
        throw new HttpError(429, "rate_limited", "Too many requests. Wait a minute and try again.");
      }
      const body = METHODS_WITH_BODY.has(request.method)
        ? await readJsonBody(request, options.maxBodyBytes ?? LIMITS.smallBodyBytes)
        : undefined;
      return json(await handler({ request, admin, now, body }));
    } catch (error) {
      return errorResponse(error, request.headers.has("authorization"));
    }
  };
}
