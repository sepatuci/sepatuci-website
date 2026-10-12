import { describe, expect, it } from "vitest";
import { authErrorCode, describeAuthError, isDeadResetLink, type AuthStep } from "./auth-errors";

const firebaseError = (code: string): Error & { code: string } => Object.assign(new Error(`Firebase: (${code}).`), { code });

const STEPS: AuthStep[] = ["sign_in", "passcode", "enroll", "forgot", "reset"];

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

  describe("passcode", () => {
    it.each(["auth/invalid-verification-code", "auth/missing-code"])("explains a wrong passcode for %s", (code) => {
      expect(describeAuthError(firebaseError(code), "passcode")).toMatch(/passcode didn't match/);
    });

    it.each(["auth/totp-challenge-timeout", "auth/code-expired"])("asks to sign in again for %s", (code) => {
      expect(describeAuthError(firebaseError(code), "passcode")).toMatch(/Sign in again/);
    });

    it("falls back to a passcode message", () => {
      expect(describeAuthError(firebaseError("auth/unexpected"), "passcode")).toBe(
        "We couldn't verify that passcode. Try again.",
      );
    });
  });

  describe("enrolling a second factor", () => {
    it("explains a wrong passcode", () => {
      expect(describeAuthError(firebaseError("auth/invalid-verification-code"), "enroll")).toMatch(
        /passcode didn't match/,
      );
    });

    it("asks for a fresh sign-in when Firebase requires one", () => {
      expect(describeAuthError(firebaseError("auth/requires-recent-login"), "enroll")).toMatch(/sign in again/);
    });

    it.each(["auth/maximum-second-factor-count-exceeded", "auth/second-factor-already-in-use"])(
      "says two-step is already set up for %s",
      (code) => {
        expect(describeAuthError(firebaseError(code), "enroll")).toMatch(/already set up/);
      },
    );

    it("falls back to an enrolment message", () => {
      expect(describeAuthError(firebaseError("auth/unexpected"), "enroll")).toBe(
        "We couldn't finish setting up two-step verification. Try again.",
      );
    });
  });

  describe("forgot password", () => {
    it("asks for a valid or present email", () => {
      expect(describeAuthError(firebaseError("auth/invalid-email"), "forgot")).toBe("Enter a valid email address.");
      expect(describeAuthError(firebaseError("auth/missing-email"), "forgot")).toBe("Enter your email address.");
    });

    it("does not say that no account matches the address", () => {
      const message = describeAuthError(firebaseError("auth/user-not-found"), "forgot");
      expect(message).toBe("We couldn't send the email. Try again in a moment.");
      expect(message).not.toMatch(/account|exist|found|registered/i);
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

    it("falls back to a reset message", () => {
      expect(describeAuthError(firebaseError("auth/unexpected"), "reset")).toBe(
        "We couldn't update your password. Try again.",
      );
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
    expect(describeAuthError(firebaseError("auth/expired-action-code"), "forgot")).toBe(
      "We couldn't send the email. Try again in a moment.",
    );
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
