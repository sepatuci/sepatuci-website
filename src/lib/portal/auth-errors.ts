/**
 * User-facing wording for Firebase Auth errors. Sign-in failures are
 * deliberately vague so the page never confirms whether an email has an account.
 */

export type AuthStep = "sign_in" | "passcode" | "enroll" | "forgot" | "reset";

export function authErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "unknown";
}

const NETWORK = "We couldn't reach the server. Check your connection and try again.";
const THROTTLED = "Too many attempts. Wait a few minutes, then try again.";
const BAD_PASSCODE = "That passcode didn't match. Check Duo Mobile and enter the current 6-digit code.";

const SHARED: Record<string, string> = {
  "auth/network-request-failed": NETWORK,
  "auth/too-many-requests": THROTTLED,
  "auth/quota-exceeded": THROTTLED,
};

const BY_STEP: Record<AuthStep, Record<string, string>> = {
  sign_in: {
    "auth/user-disabled":
      "This account has been disabled. Contact the Founder's Education chairs if you think this is a mistake.",
  },
  passcode: {
    "auth/invalid-verification-code": BAD_PASSCODE,
    "auth/missing-code": BAD_PASSCODE,
    "auth/totp-challenge-timeout": "That took too long. Sign in again to get a fresh prompt.",
    "auth/code-expired": "That took too long. Sign in again to get a fresh prompt.",
  },
  enroll: {
    "auth/invalid-verification-code": BAD_PASSCODE,
    "auth/missing-code": BAD_PASSCODE,
    "auth/requires-recent-login":
      "For your security, sign in again to finish setting up two-step verification.",
    "auth/unverified-email":
      "Your email isn't verified yet. Ask the Founder's Education chairs to re-send your invitation.",
    "auth/maximum-second-factor-count-exceeded":
      "Two-step verification is already set up on this account.",
    "auth/second-factor-already-in-use": "Two-step verification is already set up on this account.",
  },
  forgot: {
    "auth/invalid-email": "Enter a valid email address.",
    "auth/missing-email": "Enter your email address.",
  },
  reset: {
    "auth/expired-action-code": "This link has expired. Request a new one below.",
    "auth/invalid-action-code": "This link is no longer valid. Request a new one below.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/user-not-found": "This link is no longer valid. Request a new one below.",
    "auth/weak-password": "Choose a stronger password.",
    "auth/password-does-not-meet-requirements": "That password doesn't meet the requirements.",
  },
};

const FALLBACK: Record<AuthStep, string> = {
  sign_in: "Incorrect email or password.",
  passcode: "We couldn't verify that passcode. Try again.",
  enroll: "We couldn't finish setting up two-step verification. Try again.",
  forgot: "We couldn't send the email. Try again in a moment.",
  reset: "We couldn't update your password. Try again.",
};

export function describeAuthError(error: unknown, step: AuthStep): string {
  const code = authErrorCode(error);
  return BY_STEP[step][code] ?? SHARED[code] ?? FALLBACK[step];
}

/** True when the reset link itself is unusable and the user needs a new one. */
export function isDeadResetLink(error: unknown): boolean {
  return [
    "auth/expired-action-code",
    "auth/invalid-action-code",
    "auth/user-disabled",
    "auth/user-not-found",
  ].includes(authErrorCode(error));
}
