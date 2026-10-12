/**
 * User-facing wording for Firebase Auth errors. Sign-in failures are
 * deliberately vague so the page never confirms whether an email has an account.
 */

export type AuthStep = "sign_in" | "reset";

export function authErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "unknown";
}

const NETWORK = "We couldn't reach the server. Check your connection and try again.";
const THROTTLED = "Too many attempts. Wait a few minutes, then try again.";

const SHARED: Record<string, string> = {
  "auth/network-request-failed": NETWORK,
  "auth/too-many-requests": THROTTLED,
  "auth/quota-exceeded": THROTTLED,
};

const BY_STEP: Record<AuthStep, Record<string, string>> = {
  sign_in: {
    "auth/user-disabled":
      "This account has been disabled. Contact a Founder's Education admin if you think this is a mistake.",
  },
  reset: {
    "auth/expired-action-code": "This link has expired.",
    "auth/invalid-action-code": "This link is no longer valid.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/user-not-found": "This link is no longer valid.",
    "auth/weak-password": "Choose a stronger password.",
    "auth/password-does-not-meet-requirements": "That password doesn't meet the requirements.",
  },
};

const FALLBACK: Record<AuthStep, string> = {
  sign_in: "Incorrect email or password.",
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
