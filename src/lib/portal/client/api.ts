import { isRecord } from "../parse";
import type { FieldIssue } from "../types";
import { getPortalAuth } from "./firebase";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: FieldIssue[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Refusals that mean this browser session is over, as opposed to one request being denied. */
const SESSION_ENDING_FORBIDDEN = new Set([
  "email_unverified",
  "email_not_allowed",
  "no_role",
  "no_profile",
  "mfa_required",
  "password_change_required",
]);

export function endsSession(error: ApiError): boolean {
  return (
    error.status === 401 || (error.status === 403 && SESSION_ENDING_FORBIDDEN.has(error.code))
  );
}

type SessionListener = (error: ApiError) => void;
let sessionListener: SessionListener | null = null;

/** The portal shell registers here so that any request can report that the session has ended. */
export function onSessionEnded(listener: SessionListener): () => void {
  sessionListener = listener;
  return () => {
    if (sessionListener === listener) sessionListener = null;
  };
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Lets the request finish while the page is closing. */
  keepalive?: boolean;
}

function readFields(value: unknown): FieldIssue[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is FieldIssue =>
      isRecord(item) &&
      typeof item.path === "string" &&
      typeof item.code === "string" &&
      typeof item.message === "string",
  );
}

/**
 * Calls a portal endpoint as the signed-in user. The path is relative to
 * /api/portal. Throws ApiError for every failure, including being offline.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const user = getPortalAuth()?.currentUser;
  if (!user) throw new ApiError(401, "unauthenticated", "Sign in to continue.");

  const method = options.method ?? "GET";
  const hasBody = method === "POST" || method === "PUT" || method === "PATCH";

  const send = async (forceRefresh: boolean): Promise<Response> => {
    let token: string;
    try {
      token = await user.getIdToken(forceRefresh);
    } catch {
      throw new ApiError(401, "session_revoked", "Your session has ended. Sign in again.");
    }
    try {
      return await fetch(`/api/portal${path}`, {
        method,
        cache: "no-store",
        keepalive: options.keepalive,
        headers: {
          authorization: `Bearer ${token}`,
          ...(hasBody ? { "content-type": "application/json" } : {}),
        },
        body: hasBody ? JSON.stringify(options.body ?? {}) : undefined,
      });
    } catch {
      throw new ApiError(0, "network", "We couldn't reach the server. Check your connection.");
    }
  };

  let response: Response;
  try {
    response = await send(false);
    // An ID token lasts an hour, so the first refusal may just mean it has expired.
    if (response.status === 401) response = await send(true);
  } catch (caught) {
    if (caught instanceof ApiError && endsSession(caught)) sessionListener?.(caught);
    throw caught;
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = isRecord(payload) ? payload : {};
    const error = new ApiError(
      response.status,
      typeof body.code === "string" ? body.code : "unknown",
      typeof body.error === "string" ? body.error : "Something went wrong. Try again.",
      readFields(body.fields),
    );
    if (endsSession(error)) sessionListener?.(error);
    throw error;
  }
  return payload as T;
}

export function errorMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : "Something went wrong. Try again.";
}
