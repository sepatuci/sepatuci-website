/**
 * Which refusals from the API mean the browser's session is over, so that the
 * portal signs the person out and sends them back to the sign-in page, and
 * which only mean that one request was turned down.
 */
import { describe, expect, it } from "vitest";
import { ApiError, endsSession } from "./api";

const refusal = (status: number, code: string): ApiError => new ApiError(status, code, "Refused.");

describe("endsSession", () => {
  it.each(["unauthenticated", "session_expired", "session_revoked", "token_expired", "account_disabled", "account_removed", "anything_else"])(
    "ends the session for a 401, whatever its code: %s",
    (code) => {
      expect(endsSession(refusal(401, code))).toBe(true);
    },
  );

  it.each(["email_unverified", "email_not_allowed", "no_role", "no_profile", "mfa_required"])(
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

  it.each<[number, string]>([
    [0, "network"],
    [400, "bad_json"],
    [404, "not_found"],
    // Asking to replace a password that is already the person's own.
    [409, "not_required"],
    [409, "password_change_required"],
    [422, "invalid"],
    [422, "mfa_required"],
    [429, "rate_limited"],
    [500, "internal"],
    // The sign-in could not be checked just now. That is not the same as being signed out.
    [503, "auth_unavailable"],
    [503, "no_profile"],
  ])("leaves the session alone for a %i %s", (status, code) => {
    expect(endsSession(refusal(status, code))).toBe(false);
  });
});
