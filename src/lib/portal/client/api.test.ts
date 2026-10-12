/**
 * Which refusals from the API mean the browser's session is over, so that the
 * portal signs the person out and sends them back to the sign-in page, and
 * which only mean that one request was turned down.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetchPublic, endsSession, onSessionEnded } from "./api";

const refusal = (status: number, code: string): ApiError => new ApiError(status, code, "Refused.");

describe("endsSession", () => {
  it.each(["unauthenticated", "session_expired", "session_revoked", "token_expired", "account_disabled", "account_removed", "anything_else"])(
    "ends the session for a 401, whatever its code: %s",
    (code) => {
      expect(endsSession(refusal(401, code))).toBe(true);
    },
  );

  it.each(["email_unverified", "email_not_allowed", "no_role", "no_profile"])(
    "ends the session for a 403 that says the account itself may not use the portal: %s",
    (code) => {
      expect(endsSession(refusal(403, code))).toBe(true);
    },
  );

  // An account put back on a temporary password while its owner is signed in: every route
  // refuses it until the password is replaced, which happens on the sign-in page.
  it("ends the session for a 403 that says the password must be replaced first", () => {
    expect(endsSession(refusal(403, "password_change_required"))).toBe(true);
  });

  it.each(["forbidden", "cannot_modify_admin", "unknown", "", "PASSWORD_CHANGE_REQUIRED", "password_change"])(
    "leaves the session alone for a 403 that is only about the one request: %j",
    (code) => {
      expect(endsSession(refusal(403, code))).toBe(false);
    },
  );

  // Sign-in is an email and a password. The server has no refusal for a missing second factor
  // any more, so the browser has no code for one that it treats as the end of a session.
  it("knows of no refusal for a missing second factor: the code that was one is like any it has never heard of", () => {
    for (const status of [401, 403, 409, 422]) {
      expect(endsSession(refusal(status, "mfa_required")), String(status)).toBe(endsSession(refusal(status, "never_heard_of")));
    }
    expect(endsSession(refusal(403, "mfa_required"))).toBe(false);
  });

  it.each<[number, string]>([
    [0, "network"],
    [400, "bad_json"],
    [404, "not_found"],
    // Asking to replace a password that is already the person's own.
    [409, "not_required"],
    [409, "password_change_required"],
    [422, "invalid"],
    [429, "rate_limited"],
    [500, "internal"],
    // The sign-in could not be checked just now. That is not the same as being signed out.
    [503, "auth_unavailable"],
    [503, "no_profile"],
  ])("leaves the session alone for a %i %s", (status, code) => {
    expect(endsSession(refusal(status, code))).toBe(false);
  });
});

/** What the browser's fetch answered, for the one route that needs no sign-in. */
function answering(status: number, payload: unknown): ReturnType<typeof vi.fn> {
  return vi.fn(async () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }));
}

describe("apiFetchPublic", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts JSON to the portal API with no token, and hands back what came", async () => {
    const fetched = answering(200, { email: "chair.one+preview-new-member@uci.edu", temporaryPassword: "K7QM-2XRT-9BHD", role: "pledge" });
    vi.stubGlobal("fetch", fetched);
    const result = await apiFetchPublic<{ email: string }>("/preview/redeem", { code: "abc" });
    expect(result.email).toBe("chair.one+preview-new-member@uci.edu");

    expect(fetched).toHaveBeenCalledTimes(1);
    const [url, init] = fetched.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/portal/preview/redeem");
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(init.body).toBe(JSON.stringify({ code: "abc" }));
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.has("authorization")).toBe(false);
  });

  it("sends {} for a missing body", async () => {
    const fetched = answering(200, {});
    vi.stubGlobal("fetch", fetched);
    await apiFetchPublic("/preview/redeem", undefined);
    expect((fetched.mock.calls[0] as [string, RequestInit])[1].body).toBe("{}");
  });

  it("throws an ApiError with the server's status, code and message for a refusal", async () => {
    vi.stubGlobal("fetch", answering(404, { error: "This preview link has expired or was already used.", code: "preview_code_invalid" }));
    await expect(apiFetchPublic("/preview/redeem", { code: "x" })).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      code: "preview_code_invalid",
      message: "This preview link has expired or was already used.",
      fields: [],
    });
  });

  it("falls back to a generic message and code for a refusal with no readable body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    await expect(apiFetchPublic("/preview/redeem", {})).rejects.toMatchObject({ status: 502, code: "unknown", message: "Something went wrong. Try again." });
  });

  it("reports being offline as a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(apiFetchPublic("/preview/redeem", {})).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("never ends the session: a 401 or a 403 here is a refusal of the request, and the listener is not told", async () => {
    const listener = vi.fn();
    const stop = onSessionEnded(listener);
    try {
      for (const [status, code] of [[401, "unauthenticated"], [403, "email_not_allowed"], [403, "password_change_required"]] as const) {
        vi.stubGlobal("fetch", answering(status, { error: "No.", code }));
        await expect(apiFetchPublic("/preview/redeem", {})).rejects.toMatchObject({ status, code });
      }
      expect(listener).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });
});
