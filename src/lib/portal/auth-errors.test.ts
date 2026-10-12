import { describe, expect, expectTypeOf, it } from "vitest";
import { authErrorCode, describeAuthError, isDeadResetLink, type AuthStep } from "./auth-errors";

const firebaseError = (code: string): Error & { code: string } => Object.assign(new Error(`Firebase: (${code}).`), { code });

/**
 * Every step there is: signing in with an email and a password, and setting a password from
 * a link. There is no second step after the password, and no step for asking for a link.
 */
const STEPS: AuthStep[] = ["sign_in", "reset"];
const FALLBACK: Record<AuthStep, string> = {
  sign_in: "Incorrect email or password.",
  reset: "We couldn't update your password. Try again.",
};

/**
 * What Firebase says when a second factor is involved. The portal has none, so it has
 * nothing to say about any of them beyond what it says of any failure at that step.
 */
const SECOND_FACTOR_CODES = [
  "auth/multi-factor-auth-required",
  "auth/invalid-verification-code",
  "auth/missing-code",
  "auth/totp-challenge-timeout",
  "auth/code-expired",
  "auth/requires-recent-login",
  "auth/unverified-email",
  "auth/maximum-second-factor-count-exceeded",
  "auth/second-factor-already-in-use",
  "auth/multi-factor-info-not-found",
  "auth/missing-multi-factor-session",
  "auth/unsupported-first-factor",
];

/** Every code a page has a message for at some step, and a few it has none for. */
const CODES = [
  "auth/wrong-password",
  "auth/user-not-found",
  "auth/user-disabled",
  "auth/invalid-credential",
  "auth/invalid-email",
  "auth/missing-email",
  ...SECOND_FACTOR_CODES,
  "auth/expired-action-code",
  "auth/invalid-action-code",
  "auth/weak-password",
  "auth/password-does-not-meet-requirements",
  "auth/network-request-failed",
  "auth/too-many-requests",
  "auth/quota-exceeded",
  "auth/internal-error",
  "auth/unexpected",
];

describe("authErrorCode", () => {
  it("reads the code from a Firebase error", () => {
    expect(authErrorCode(firebaseError("auth/wrong-password"))).toBe("auth/wrong-password");
    expect(authErrorCode({ code: "auth/too-many-requests" })).toBe("auth/too-many-requests");
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["undefined", undefined],
    ["a string", "auth/wrong-password"],
    ["a plain Error", new Error("boom")],
    ["an object with a numeric code", { code: 400 }],
    ["an object with a null code", { code: null }],
    ["an empty object", {}],
  ])("is unknown for %s", (_label, error) => {
    expect(authErrorCode(error)).toBe("unknown");
  });
});

describe("describeAuthError", () => {
  describe("sign-in", () => {
    it.each([
      "auth/wrong-password",
      "auth/user-not-found",
      "auth/invalid-credential",
      "auth/invalid-login-credentials",
      "auth/invalid-email",
      "auth/missing-password",
      "auth/internal-error",
      "auth/something-new",
    ])("gives the same vague message for %s, so it never reveals whether the account exists", (code) => {
      expect(describeAuthError(firebaseError(code), "sign_in")).toBe("Incorrect email or password.");
    });

    it("gives that same message for errors that are not from Firebase at all", () => {
      expect(describeAuthError(new Error("boom"), "sign_in")).toBe("Incorrect email or password.");
      expect(describeAuthError(null, "sign_in")).toBe("Incorrect email or password.");
      expect(describeAuthError("auth/user-not-found", "sign_in")).toBe("Incorrect email or password.");
    });

    it("tells a disabled account that it is disabled", () => {
      expect(describeAuthError(firebaseError("auth/user-disabled"), "sign_in")).toMatch(/has been disabled/);
    });
  });

  // Sign-in is a UCI email and a password. The step that asked for a passcode after the
  // password, and the one that set that up, are gone, and their wording with them.
  describe("the second step that is gone", () => {
    it("leaves two steps, signing in and setting a password from a link, and no other", () => {
      expectTypeOf<AuthStep>().toEqualTypeOf<"sign_in" | "reset">();
      // Each has a wording of its own for a failure it knows nothing more about.
      expect(STEPS.map((step) => describeAuthError(firebaseError("auth/unexpected"), step))).toEqual([FALLBACK.sign_in, FALLBACK.reset]);
      expect(FALLBACK.sign_in).not.toBe(FALLBACK.reset);
    });

    it.each(SECOND_FACTOR_CODES)("has nothing of its own to say about %s: it is described as any other failure of the step", (code) => {
      for (const step of STEPS) expect(describeAuthError(firebaseError(code), step), step).toBe(FALLBACK[step]);
      // And it is no reason to call a set-password link dead.
      expect(isDeadResetLink(firebaseError(code))).toBe(false);
    });

    it("mentions Duo, a passcode, a code or two-step verification in no message, at either step, whatever went wrong", () => {
      const thrown: unknown[] = [...CODES.map(firebaseError), new Error("boom"), null, undefined, "auth/invalid-verification-code", { code: 400 }];
      const messages = new Set<string>();
      for (const step of STEPS) {
        for (const error of thrown) {
          const message = describeAuthError(error, step);
          expect(message, `${step}: ${authErrorCode(error)}`).not.toMatch(/duo|passcode|pass code|two-step|2-step|two step|two-factor|second factor|verification|authenticator|6-digit|\bcode\b|totp|mfa/i);
          messages.add(message);
        }
      }
      // Every message the two steps have was among them: eight that are a step's own, and two that both share.
      expect([...messages].sort()).toEqual(
        [
          FALLBACK.sign_in,
          FALLBACK.reset,
          "This account has been disabled. Contact the Founder's Education chairs if you think this is a mistake.",
          "This account has been disabled.",
          "This link has expired.",
          "This link is no longer valid.",
          "Choose a stronger password.",
          "That password doesn't meet the requirements.",
          "We couldn't reach the server. Check your connection and try again.",
          "Too many attempts. Wait a few minutes, then try again.",
        ].sort(),
      );
    });
  });

  describe("reset password", () => {
    it.each<[string, RegExp]>([
      ["auth/expired-action-code", /expired/],
      ["auth/invalid-action-code", /no longer valid/],
      ["auth/user-not-found", /no longer valid/],
      ["auth/user-disabled", /disabled/],
      ["auth/weak-password", /stronger password/],
      ["auth/password-does-not-meet-requirements", /doesn't meet the requirements/],
    ])("explains %s", (code, pattern) => {
      expect(describeAuthError(firebaseError(code), "reset")).toMatch(pattern);
    });

    // A link that cannot be used is said to be so, in one sentence. What to do about it is the
    // page's to say, because the answer is a person and not a button.
    it.each<[string, string]>([
      ["auth/expired-action-code", "This link has expired."],
      ["auth/invalid-action-code", "This link is no longer valid."],
      ["auth/user-not-found", "This link is no longer valid."],
      ["auth/user-disabled", "This account has been disabled."],
    ])("says of a link that is no use, for %s, exactly that and no more", (code, message) => {
      expect(describeAuthError(firebaseError(code), "reset")).toBe(message);
      expect(isDeadResetLink(firebaseError(code))).toBe(true);
    });

    it("falls back to a reset message", () => {
      expect(describeAuthError(firebaseError("auth/unexpected"), "reset")).toBe(
        "We couldn't update your password. Try again.",
      );
    });

    // There is nowhere on the site to ask for a link any more. A message that told someone
    // to request one, or pointed below itself at a button that is gone, would send them nowhere.
    it("never tells the person to request a new link, whatever went wrong", () => {
      const thrown: unknown[] = [...CODES.map(firebaseError), new Error("boom"), null, undefined, "auth/expired-action-code", { code: 400 }];
      expect(thrown.length).toBeGreaterThanOrEqual(28);
      for (const error of thrown) {
        const message = describeAuthError(error, "reset");
        expect(message, authErrorCode(error)).not.toMatch(/request/i);
        expect(message, authErrorCode(error)).not.toMatch(/\bbelow\b|new one|new link|forgot/i);
      }
    });

    it("does not say whether an account goes with the link when there is none", () => {
      const message = describeAuthError(firebaseError("auth/user-not-found"), "reset");
      expect(message).not.toMatch(/account|exist|found|registered/i);
      // Word for word what a link that was simply used up gets.
      expect(message).toBe(describeAuthError(firebaseError("auth/invalid-action-code"), "reset"));
    });
  });

  // The page for asking for a link by email is gone, and its step with it.
  describe("asking for a link", () => {
    it("has no wording of its own left: an address that is wrong or missing is described as any other failure of the step it happens at", () => {
      for (const code of ["auth/invalid-email", "auth/missing-email"]) {
        expect(describeAuthError(firebaseError(code), "sign_in"), code).toBe("Incorrect email or password.");
        expect(describeAuthError(firebaseError(code), "reset"), code).toBe("We couldn't update your password. Try again.");
      }
    });

    it("is mentioned by no message at any step: none speaks of sending an email, or of a forgotten password", () => {
      for (const step of STEPS) {
        for (const error of [...CODES.map(firebaseError), new Error("boom"), null]) {
          const message = describeAuthError(error, step);
          expect(message, `${step}: ${authErrorCode(error)}`).not.toMatch(/forgot|send the email|couldn't send|request a new|enter (a valid|your) email/i);
        }
      }
    });
  });

  describe("problems that are the same at every step", () => {
    it.each(STEPS)("reports a network failure during %s", (step) => {
      expect(describeAuthError(firebaseError("auth/network-request-failed"), step)).toMatch(/couldn't reach the server/);
    });

    it.each(STEPS)("reports throttling during %s", (step) => {
      expect(describeAuthError(firebaseError("auth/too-many-requests"), step)).toMatch(/Too many attempts/);
      expect(describeAuthError(firebaseError("auth/quota-exceeded"), step)).toMatch(/Too many attempts/);
    });
  });

  it("uses a message meant for one step only at that step", () => {
    expect(describeAuthError(firebaseError("auth/weak-password"), "sign_in")).toBe("Incorrect email or password.");
    expect(describeAuthError(firebaseError("auth/invalid-verification-code"), "sign_in")).toBe(
      "Incorrect email or password.",
    );
    // What is said of a dead link is for the page that opens links, and for no other.
    for (const code of ["auth/expired-action-code", "auth/invalid-action-code"]) {
      expect(describeAuthError(firebaseError(code), "sign_in"), code).toBe("Incorrect email or password.");
      expect(describeAuthError(firebaseError(code), "reset"), code).not.toBe("We couldn't update your password. Try again.");
    }
    // A disabled account is told so at both, and whom to contact only where it tried to sign in.
    expect(describeAuthError(firebaseError("auth/user-disabled"), "sign_in")).toMatch(/Contact the Founder's Education chairs/);
    expect(describeAuthError(firebaseError("auth/user-disabled"), "reset")).toBe("This account has been disabled.");
  });

  it("never leaks the raw Firebase code or message", () => {
    for (const step of STEPS) {
      for (const code of ["auth/wrong-password", "auth/internal-error", "auth/unexpected", "auth/user-not-found"]) {
        const message = describeAuthError(firebaseError(code), step);
        expect(message).not.toContain("auth/");
        expect(message).not.toContain("Firebase");
      }
    }
  });
});

describe("isDeadResetLink", () => {
  it.each(["auth/expired-action-code", "auth/invalid-action-code", "auth/user-disabled", "auth/user-not-found"])(
    "is true for %s, where only a new link will help",
    (code) => {
      expect(isDeadResetLink(firebaseError(code))).toBe(true);
    },
  );

  it.each<[string, unknown]>([
    ["a weak password, which the user can fix on the same link", firebaseError("auth/weak-password")],
    ["a password that misses the requirements", firebaseError("auth/password-does-not-meet-requirements")],
    ["a network failure", firebaseError("auth/network-request-failed")],
    ["throttling", firebaseError("auth/too-many-requests")],
    ["an unknown error", new Error("boom")],
    ["null", null],
  ])("is false for %s", (_label, error) => {
    expect(isDeadResetLink(error)).toBe(false);
  });
});
