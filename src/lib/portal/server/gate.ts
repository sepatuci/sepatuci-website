import { TIMING, UCI_EMAIL_PATTERN } from "../constants";
import type { Role } from "../types";

/**
 * The check every portal request passes before any data is touched. This
 * module is pure: it decides from the claims of an already verified token.
 */

export interface AuthedUser {
  uid: string;
  email: string;
  role: Role;
}

/** A route is open to everyone signed in, or to exactly one role. */
export type GateNeed = "any" | Role;

/** The parts of a verified Firebase ID token that the gate reads. */
export interface GateClaims {
  uid: string;
  email?: string;
  email_verified?: boolean;
  role?: unknown;
  /** When the person signed in, in seconds. Refreshing a token does not move it. */
  auth_time?: unknown;
  /** The address a pledge account was created with. Set by the server, never by the pledge. */
  issued?: unknown;
  /** True while the account is still on a password a chair handed out. */
  temp?: unknown;
  /** When that password was issued, in seconds. It stops working three days later. */
  tempAt?: unknown;
  firebase?: { sign_in_second_factor?: unknown };
}

export interface GateOptions {
  need: GateNeed;
  mfaRequired: boolean;
  adminEmails: readonly string[];
  nowMs: number;
  /**
   * True on the live site, where every pledge account is created by the portal
   * and so carries the address it was issued to. The local emulators also hold
   * accounts made by hand, which do not.
   */
  issuedRequired: boolean;
  /**
   * True only for the route that replaces a temporary password. It is the one
   * thing an account on a temporary password may do.
   */
  passwordSetup?: boolean;
}

export type GateResult =
  | { ok: true; user: AuthedUser }
  | { ok: false; status: 401 | 403; code: string; message: string };

const deny = (code: string, message: string): GateResult => ({
  ok: false,
  status: 403,
  code,
  message,
});

const NO_ACCESS = "This account doesn't have access to the portal.";

/** How far two servers' clocks may disagree. */
const CLOCK_SLACK_MS = 5 * 60_000;

export const TEMPORARY_EXPIRED = "That temporary password has expired. Ask a chair for a new one.";

/** True when a temporary password issued at this time (in seconds) can no longer be used. */
export function temporaryPasswordExpired(issuedAtSeconds: unknown, nowMs: number): boolean {
  const issuedMs = typeof issuedAtSeconds === "number" ? issuedAtSeconds * 1000 : Number.NaN;
  if (!Number.isFinite(issuedMs)) return true;
  // A time well ahead of the clock is not one the portal wrote. It is refused
  // too, so a wrong value can never mean "does not expire".
  if (issuedMs - nowMs > CLOCK_SLACK_MS) return true;
  return nowMs - issuedMs > TIMING.temporaryPasswordMs;
}

export function evaluateGate(claims: GateClaims, options: GateOptions): GateResult {
  // A sign-in has a fixed lifetime, so a copied or forgotten session stops
  // working on its own even if nobody signs it out.
  const signedInMs = typeof claims.auth_time === "number" ? claims.auth_time * 1000 : Number.NaN;
  if (!Number.isFinite(signedInMs) || options.nowMs - signedInMs > TIMING.maxSessionAgeMs) {
    return {
      ok: false,
      status: 401,
      code: "session_expired",
      message: "Your session has expired. Sign in again.",
    };
  }

  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  if (!email || claims.email_verified !== true) return deny("email_unverified", NO_ACCESS);

  const role = claims.role;
  if (role !== "admin" && role !== "active" && role !== "pledge") return deny("no_role", NO_ACCESS);

  // The admin claim alone is not enough: the address must also be on the
  // configured list, so removing someone from the list revokes them at once.
  if (role === "admin" && !options.adminEmails.includes(email)) return deny("forbidden", NO_ACCESS);

  // Pledge and active accounts are only ever created with a UCI address, and
  // the one each was created with is recorded on the account. One that has since
  // been pointed at another mailbox is no longer the account we issued.
  if (role !== "admin") {
    const issued = typeof claims.issued === "string" ? claims.issued.toLowerCase() : null;
    const stillIssuedAddress = issued === null ? !options.issuedRequired : issued === email;
    if (!UCI_EMAIL_PATTERN.test(email) || !stillIssuedAddress) {
      return deny("email_not_allowed", NO_ACCESS);
    }
  }

  // Someone still on a temporary password chooses their own before anything
  // else. That comes before two-step verification is set up, so the route that
  // does it is the only one such an account reaches without a second factor.
  const choosingPassword = claims.temp === true && options.passwordSetup === true;
  if (claims.temp === true) {
    // A temporary password is good for three days. One left unclaimed in a
    // message or a spreadsheet stops being a way in.
    if (temporaryPasswordExpired(claims.tempAt, options.nowMs)) {
      return deny("temporary_password_expired", TEMPORARY_EXPIRED);
    }
    if (!choosingPassword) {
      return deny("password_change_required", "Choose your own password to continue.");
    }
    // Choosing the password has to follow the sign-in closely, so a screen left
    // open on a shared computer cannot be used by the next person along.
    if (options.nowMs - signedInMs > TIMING.passwordSetupMs) {
      return {
        ok: false,
        status: 401,
        code: "session_expired",
        message: "Your session has expired. Sign in again.",
      };
    }
  }

  if (options.mfaRequired && !choosingPassword) {
    const secondFactor = claims.firebase?.sign_in_second_factor;
    if (typeof secondFactor !== "string" || secondFactor.length === 0) {
      return deny("mfa_required", "Two-step verification is required.");
    }
  }

  if (options.need !== "any" && options.need !== role) {
    return deny("forbidden", "You don't have permission to do that.");
  }
  return { ok: true, user: { uid: claims.uid, email, role } };
}
