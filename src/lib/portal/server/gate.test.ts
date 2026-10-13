import { describe, expect, expectTypeOf, it } from "vitest";
import { TIMING } from "../constants";
import {
  TEMPORARY_EXPIRED,
  evaluateGate,
  temporaryPasswordExpired,
  type GateClaims,
  type GateNeed,
  type GateOptions,
  type GateResult,
} from "./gate";

const ADMINS = ["chair.one@uci.edu", "chair.two@uci.edu"] as const;

/** The server clock for every check in this file. */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const SECOND = 1000;
const MINUTE = 60_000;
const HOUR = 3_600_000;
/** `auth_time` is in seconds, as Firebase sends it. */
const signedIn = (msAgo: number): number => (NOW - msAgo) / SECOND;
/** When the default claims below say the person signed in, as the gate passes it on: a minute before NOW, in milliseconds. */
const SIGNED_IN_AT_MS = NOW - 60 * SECOND;
/** `tempAt` is in seconds too: when a chair issued the temporary password. */
const issuedAt = (msAgo: number): number => (NOW - msAgo) / SECOND;
/** What an account carries while it is on a temporary password a chair issued an hour ago. */
const TEMP: Pick<GateClaims, "temp" | "tempAt"> = { temp: true, tempAt: issuedAt(HOUR) };

/** A signed-in pledge on the live site: verified email, role claim, the address it was issued to, signed in a minute ago. */
const pledge = (overrides: Partial<GateClaims> = {}): GateClaims => ({
  uid: "pledge1",
  email: "avery.chen@uci.edu",
  email_verified: true,
  role: "pledge",
  issued: "avery.chen@uci.edu",
  auth_time: signedIn(60 * SECOND),
  ...overrides,
});

const admin = (overrides: Partial<GateClaims> = {}): GateClaims => ({
  uid: "admin1",
  email: "chair.one@uci.edu",
  email_verified: true,
  role: "admin",
  auth_time: signedIn(60 * SECOND),
  ...overrides,
});

/** A signed-in active member on the live site: the same as a pledge in everything but the role. */
const active = (overrides: Partial<GateClaims> = {}): GateClaims => ({
  uid: "active1",
  email: "priya.shah@uci.edu",
  email_verified: true,
  role: "active",
  issued: "priya.shah@uci.edu",
  auth_time: signedIn(60 * SECOND),
  ...overrides,
});

const NEEDS: readonly GateNeed[] = ["any", "admin", "active", "pledge"];

const live = (need: GateNeed = "any", overrides: Partial<GateOptions> = {}): GateOptions => ({
  need,
  adminEmails: ADMINS,
  nowMs: NOW,
  issuedRequired: true,
  ...overrides,
});

/**
 * The local emulators, which differ from the live site in one thing: an
 * account made by hand there need not say which address it was issued to.
 */
const emulators = (need: GateNeed = "any", overrides: Partial<GateOptions> = {}): GateOptions =>
  live(need, { issuedRequired: false, ...overrides });

function denied(result: GateResult): { status: number; code: string; message: string } {
  if (result.ok) throw new Error(`Expected a refusal, but ${result.user.email} was let through.`);
  return { status: result.status, code: result.code, message: result.message };
}

const SESSION_EXPIRED = {
  status: 401,
  code: "session_expired",
  message: "Your session has expired. Sign in again.",
};

describe("evaluateGate", () => {
  describe("letting people through", () => {
    it("admits a pledge with a verified email and the pledge role", () => {
      expect(evaluateGate(pledge(), live("pledge"))).toEqual({
        ok: true,
        user: { uid: "pledge1", email: "avery.chen@uci.edu", role: "pledge", signedInAtMs: SIGNED_IN_AT_MS },
      });
    });

    it("admits an allow-listed admin with a verified email and the admin role", () => {
      expect(evaluateGate(admin(), live("admin"))).toEqual({
        ok: true,
        user: { uid: "admin1", email: "chair.one@uci.edu", role: "admin", signedInAtMs: SIGNED_IN_AT_MS },
      });
    });

    it("admits either role to a route that any signed-in user may call", () => {
      expect(evaluateGate(pledge(), live("any"))).toMatchObject({ ok: true, user: { role: "pledge" } });
      expect(evaluateGate(admin(), live("any"))).toMatchObject({ ok: true, user: { role: "admin" } });
    });

    it("returns the email lower-cased", () => {
      const result = evaluateGate(pledge({ email: "Avery.Chen@UCI.edu" }), live());
      expect(result).toMatchObject({ ok: true, user: { email: "avery.chen@uci.edu" } });
    });

    it("matches an admin against the allowlist without regard to the case of the token's email", () => {
      expect(evaluateGate(admin({ email: "Chair.One@UCI.EDU" }), live("admin"))).toMatchObject({
        ok: true,
        user: { email: "chair.one@uci.edu", role: "admin" },
      });
    });

    it("returns only uid, email, role and the sign-in time, whatever else the token carries", () => {
      const claims = { ...pledge(), admin: true, name: "Avery", picture: "x" } as GateClaims;
      const result = evaluateGate(claims, live());
      expect(result).toEqual({ ok: true, user: { uid: "pledge1", email: "avery.chen@uci.edu", role: "pledge", signedInAtMs: SIGNED_IN_AT_MS } });
    });

    it("reports when the person signed in as the token's auth_time, in milliseconds", () => {
      for (const claimsOf of [pledge, admin, active]) {
        for (const msAgo of [0, 60 * SECOND, HOUR, TIMING.maxSessionAgeMs]) {
          const claims = claimsOf({ auth_time: signedIn(msAgo) });
          const result = evaluateGate(claims, live());
          expect(result.ok, `${String(claims.role)} signed in ${msAgo} ms ago`).toBe(true);
          if (!result.ok) continue;
          expect(result.user.signedInAtMs).toBe((claims.auth_time as number) * 1000);
          expect(result.user.signedInAtMs).toBe(NOW - msAgo);
        }
      }
      // A fraction of a second in the token is kept, and a time a moment ahead of the clock is taken as it is.
      expect(evaluateGate(pledge({ auth_time: signedIn(HOUR) + 0.25 }), live())).toMatchObject({ user: { signedInAtMs: NOW - HOUR + 250 } });
      expect(evaluateGate(pledge({ auth_time: signedIn(-5 * SECOND) }), live())).toMatchObject({ user: { signedInAtMs: NOW + 5 * SECOND } });
    });

    it("does not move the sign-in time when the token is refreshed", () => {
      // A refreshed token carries a new iat and exp, and the same auth_time.
      const refreshed = { ...pledge({ auth_time: signedIn(HOUR) }), iat: NOW / SECOND, exp: NOW / SECOND + 3600 } as GateClaims;
      expect(evaluateGate(refreshed, live())).toMatchObject({ ok: true, user: { signedInAtMs: NOW - HOUR } });
      expect(evaluateGate(refreshed, live("any", { nowMs: NOW + HOUR }))).toMatchObject({ ok: true, user: { signedInAtMs: NOW - HOUR } });
    });
  });

  describe("session age", () => {
    it("admits a sign-in that is exactly 12 hours old, and refuses it one millisecond later", () => {
      expect(TIMING.maxSessionAgeMs).toBe(12 * HOUR);
      const claims = pledge({ auth_time: signedIn(TIMING.maxSessionAgeMs) });
      expect(evaluateGate(claims, live()).ok).toBe(true);
      expect(denied(evaluateGate(claims, live("any", { nowMs: NOW + 1 })))).toEqual(SESSION_EXPIRED);
    });

    it("refuses with 401, not 403, so the client signs the user out rather than showing an error", () => {
      const result = evaluateGate(pledge({ auth_time: signedIn(13 * HOUR) }), live());
      expect(denied(result)).toEqual(SESSION_EXPIRED);
    });

    it("measures age from when the person signed in, however recently the token was refreshed", () => {
      // A refreshed token carries a new iat and exp, and the same auth_time.
      const refreshed = { ...pledge({ auth_time: signedIn(12 * HOUR + SECOND) }), iat: NOW / SECOND, exp: NOW / SECOND + 3600 };
      expect(denied(evaluateGate(refreshed as GateClaims, live())).code).toBe("session_expired");
    });

    it("applies to admins and pledges alike, on every kind of route", () => {
      const old = signedIn(TIMING.maxSessionAgeMs + SECOND);
      for (const need of ["any", "pledge", "admin"] as const) {
        expect(denied(evaluateGate(pledge({ auth_time: old }), live(need)))).toEqual(SESSION_EXPIRED);
        expect(denied(evaluateGate(admin({ auth_time: old }), live(need)))).toEqual(SESSION_EXPIRED);
      }
    });

    it("applies in the emulators too", () => {
      for (const claims of [pledge({ auth_time: signedIn(13 * HOUR) }), pledge({ auth_time: signedIn(13 * HOUR), issued: undefined })]) {
        expect(denied(evaluateGate(claims, emulators()))).toEqual(SESSION_EXPIRED);
      }
    });

    it.each<[string, unknown]>([
      ["no auth_time claim", undefined],
      ["a null auth_time", null],
      ["an auth_time that is a numeric string", String(signedIn(60 * SECOND))],
      ["an auth_time that is a date string", new Date(NOW - 60 * SECOND).toISOString()],
      ["an auth_time that is an object", { seconds: signedIn(60 * SECOND) }],
      ["an auth_time that is a boolean", true],
      ["an auth_time that is not a number at all", Number.NaN],
      ["an infinite auth_time", Number.POSITIVE_INFINITY],
      ["a negative infinite auth_time", Number.NEGATIVE_INFINITY],
    ])("refuses a token with %s", (_label, authTime) => {
      for (const claims of [pledge({ auth_time: authTime }), admin({ auth_time: authTime })]) {
        expect(denied(evaluateGate(claims, live()))).toEqual(SESSION_EXPIRED);
      }
    });

    it("reads auth_time as seconds: a value in milliseconds is not mistaken for a fresh sign-in from 1970", () => {
      // 13 hours ago, in seconds, is refused; the same instant must not pass by being read in another unit.
      expect(denied(evaluateGate(pledge({ auth_time: signedIn(13 * HOUR) }), live())).code).toBe("session_expired");
      expect(denied(evaluateGate(pledge({ auth_time: 0 }), live())).code).toBe("session_expired");
    });
  });

  describe("email", () => {
    it.each<[string, Partial<GateClaims>]>([
      ["no email claim", { email: undefined }],
      ["an empty email", { email: "" }],
      ["an email that is not a string", { email: 42 as unknown as string }],
      ["an unverified email", { email_verified: false }],
      ["no email_verified claim", { email_verified: undefined }],
      ["email_verified as the string \"true\"", { email_verified: "true" as unknown as boolean }],
      ["email_verified as 1", { email_verified: 1 as unknown as boolean }],
    ])("refuses a token with %s", (_label, overrides) => {
      expect(denied(evaluateGate(pledge(overrides), live()))).toEqual({
        status: 403,
        code: "email_unverified",
        message: "This account doesn't have access to the portal.",
      });
    });

    it("refuses an allow-listed admin whose email is not verified", () => {
      expect(denied(evaluateGate(admin({ email_verified: false }), live("admin"))).code).toBe("email_unverified");
    });
  });

  describe("pledge email domain", () => {
    it.each<[string, string]>([
      ["a Gmail address", "avery.chen@gmail.com"],
      ["a UCI subdomain", "avery.chen@ics.uci.edu"],
      ["a domain that only starts with uci.edu", "avery.chen@uci.edu.evil.example"],
      ["a domain that only ends with uci.edu", "avery.chen@notuci.edu"],
      ["two at signs", "avery.chen@evil.example@uci.edu"],
      ["a space in the local part", "avery chen@uci.edu"],
      ["a trailing space", "avery.chen@uci.edu "],
      ["a trailing newline", "avery.chen@uci.edu\n"],
      ["no local part", "@uci.edu"],
    ])("refuses a pledge whose email is %s", (_label, email) => {
      for (const need of ["any", "pledge"] as const) {
        expect(denied(evaluateGate(pledge({ email }), live(need)))).toEqual({
          status: 403,
          code: "email_not_allowed",
          message: "This account doesn't have access to the portal.",
        });
      }
    });

    it("refuses it in the emulators too, whether or not the account says where it was issued", () => {
      for (const issued of ["avery.chen@uci.edu", "avery.chen@gmail.com", undefined]) {
        const outside = pledge({ email: "avery.chen@gmail.com", issued });
        expect(denied(evaluateGate(outside, emulators("pledge"))).code, String(issued)).toBe("email_not_allowed");
      }
    });

    it("admits a UCI address whatever its case, because it is lower-cased first", () => {
      expect(evaluateGate(pledge({ email: "AVERY.CHEN@UCI.EDU" }), live("pledge"))).toMatchObject({
        ok: true,
        user: { email: "avery.chen@uci.edu" },
      });
    });

    it("does not apply to admins: an allow-listed admin outside UCI is admitted", () => {
      const outside = admin({ email: "advisor@example.org" });
      const options = live("admin", { adminEmails: ["advisor@example.org"] });
      expect(evaluateGate(outside, options)).toEqual({
        ok: true,
        user: { uid: "admin1", email: "advisor@example.org", role: "admin", signedInAtMs: SIGNED_IN_AT_MS },
      });
    });

    it("does not let the admin list stand in for the domain: a listed non-UCI address with the pledge role is refused", () => {
      const listed = pledge({ email: "advisor@example.org" });
      const options = live("any", { adminEmails: ["advisor@example.org"] });
      expect(denied(evaluateGate(listed, options)).code).toBe("email_not_allowed");
    });
  });

  // The address an account was created with is recorded on it by the server. A
  // pledge can repoint their own sign-in through Firebase, even to another UCI
  // mailbox, and the account is then no longer the one that was issued.
  describe("the address a pledge account was issued with", () => {
    it("admits a pledge whose sign-in address is still the issued one, whatever the case", () => {
      for (const issued of ["avery.chen@uci.edu", "Avery.Chen@UCI.edu"]) {
        expect(evaluateGate(pledge({ issued }), live("pledge"))).toMatchObject({ ok: true });
      }
    });

    it.each(["avery.chen+elsewhere@uci.edu", "someone.else@uci.edu"])(
      "refuses a pledge whose sign-in has moved to %s, on every kind of route",
      (email) => {
        for (const need of ["any", "pledge"] as const) {
          expect(denied(evaluateGate(pledge({ email, issued: "avery.chen@uci.edu" }), live(need)))).toEqual({
            status: 403,
            code: "email_not_allowed",
            message: "This account doesn't have access to the portal.",
          });
        }
      },
    );

    it("refuses it in the emulators too: an address that is on record is held to, required or not", () => {
      const moved = pledge({ email: "avery.chen+elsewhere@uci.edu", issued: "avery.chen@uci.edu" });
      expect(denied(evaluateGate(moved, emulators("pledge"))).code).toBe("email_not_allowed");
      expect(denied(evaluateGate(moved, live("pledge"))).code).toBe("email_not_allowed");
    });

    // On the live site every pledge account is made by the portal, so one with
    // no record of its issued address is not one of ours.
    it.each<[string, unknown]>([
      ["no record of it", undefined],
      ["a null", null],
      ["a number", 7],
      ["a list", ["avery.chen@uci.edu"]],
      ["an empty string", ""],
    ])("refuses a pledge account with %s on the live site", (_label, issued) => {
      expect(denied(evaluateGate(pledge({ issued }), live("pledge"))).code).toBe("email_not_allowed");
    });

    it.each<[string, unknown]>([
      ["no record of it", undefined],
      ["a null", null],
      ["a number", 7],
    ])("falls back to the UCI rule alone in the emulators for a hand-made account with %s", (_label, issued) => {
      expect(evaluateGate(pledge({ issued }), emulators("pledge"))).toMatchObject({ ok: true });
      expect(denied(evaluateGate(pledge({ issued, email: "avery.chen@gmail.com" }), emulators("pledge"))).code).toBe(
        "email_not_allowed",
      );
    });

    it("does not apply to admins, who are held to the allow-list", () => {
      expect(evaluateGate(admin({ issued: "someone.else@uci.edu" }), live("admin"))).toMatchObject({ ok: true });
    });
  });

  describe("role", () => {
    it.each<[string, unknown]>([
      ["no role claim", undefined],
      ["a null role", null],
      ["an unknown role", "superuser"],
      ["the right role in the wrong case", "Admin"],
      ["a role with padding", " pledge"],
      ["a list of roles", ["admin"]],
      ["a role object", { admin: true }],
      ["a boolean", true],
    ])("refuses a token with %s", (_label, role) => {
      expect(denied(evaluateGate(pledge({ role }), live()))).toEqual({
        status: 403,
        code: "no_role",
        message: "This account doesn't have access to the portal.",
      });
    });
  });

  describe("admin allowlist", () => {
    it("refuses an admin claim whose email is not on the list, even on a route open to anyone", () => {
      const rogue = admin({ uid: "rogue", email: "former.chair@uci.edu" });
      for (const need of ["any", "admin", "pledge"] as const) {
        expect(denied(evaluateGate(rogue, live(need)))).toEqual({
          status: 403,
          code: "forbidden",
          message: "This account doesn't have access to the portal.",
        });
      }
    });

    it("refuses every admin when the list is empty", () => {
      expect(denied(evaluateGate(admin(), live("admin", { adminEmails: [] }))).code).toBe("forbidden");
    });

    it("revokes an admin as soon as their address leaves the list", () => {
      expect(evaluateGate(admin({ email: "chair.two@uci.edu" }), live("admin")).ok).toBe(true);
      const afterRemoval = live("admin", { adminEmails: ["chair.one@uci.edu"] });
      expect(denied(evaluateGate(admin({ email: "chair.two@uci.edu" }), afterRemoval)).code).toBe("forbidden");
    });

    it("requires an exact address, not a lookalike", () => {
      for (const email of ["chair.one@uci.edu.evil.example", "xchair.one@uci.edu", "chair.one+x@uci.edu", "chair.one@uci.ed"]) {
        expect(denied(evaluateGate(admin({ email }), live("admin"))).code).toBe("forbidden");
      }
    });

    it("does not make a pledge an admin just because their address is on the list", () => {
      const listedPledge = pledge({ email: "chair.one@uci.edu", issued: "chair.one@uci.edu" });
      expect(evaluateGate(listedPledge, live("any"))).toMatchObject({ ok: true, user: { role: "pledge" } });
      expect(denied(evaluateGate(listedPledge, live("admin"))).code).toBe("forbidden");
    });

    it("does not apply the list to pledges", () => {
      expect(evaluateGate(pledge(), live("pledge", { adminEmails: [] })).ok).toBe(true);
    });
  });

  // An admin made from inside the portal is not on the list. Their sign-in
  // says so with a claim only the server writes.
  describe("granted admins", () => {
    const granted = (overrides: Partial<GateClaims> = {}): GateClaims =>
      admin({ uid: "granted1", email: "former.pledge@uci.edu", granted: true, ...overrides });

    it("admits an admin off the list whose sign-in says the role was granted, to admin routes and shared ones", () => {
      for (const need of ["any", "admin"] as const) {
        expect(evaluateGate(granted(), live(need))).toEqual({
          ok: true,
          user: { uid: "granted1", email: "former.pledge@uci.edu", role: "admin", signedInAtMs: SIGNED_IN_AT_MS },
        });
        expect(evaluateGate(granted(), emulators(need)).ok).toBe(true);
      }
      expect(evaluateGate(granted(), live("admin", { adminEmails: [] })).ok).toBe(true);
    });

    it("admits them outside UCI too, as it does a listed admin", () => {
      expect(evaluateGate(granted({ email: "advisor@example.org" }), live("admin"))).toMatchObject({
        ok: true,
        user: { email: "advisor@example.org", role: "admin" },
      });
    });

    it.each<[string, unknown]>([
      ["the string \"true\"", "true"],
      ["1", 1],
      ["false", false],
      ["null", null],
      ["an object", { granted: true }],
      ["a list", [true]],
      ["\"yes\"", "yes"],
    ])("takes nothing but true for the claim: %s leaves an unlisted admin refused", (_label, value) => {
      expect(denied(evaluateGate(granted({ granted: value }), live("admin")))).toEqual({
        status: 403,
        code: "forbidden",
        message: "This account doesn't have access to the portal.",
      });
    });

    it("is neither here nor there for a listed admin, who is admitted either way", () => {
      expect(evaluateGate(admin({ granted: true }), live("admin")).ok).toBe(true);
      expect(evaluateGate(admin({ granted: false }), live("admin")).ok).toBe(true);
    });

    it("does not make a pledge or an active an admin: the role claim still decides, and the claim is then ignored", () => {
      for (const need of NEEDS) {
        const asPledge = evaluateGate(pledge({ granted: true }), live(need));
        expect(asPledge, need).toEqual(evaluateGate(pledge(), live(need)));
        const asActive = evaluateGate(active({ granted: true }), live(need));
        expect(asActive, need).toEqual(evaluateGate(active(), live(need)));
      }
      expect(denied(evaluateGate(pledge({ granted: true }), live("admin"))).code).toBe("forbidden");
    });

    it("holds a granted admin to everything else: a verified email, a sign-in under 12 hours old, and the route's role", () => {
      expect(denied(evaluateGate(granted({ email_verified: false }), live("admin"))).code).toBe("email_unverified");
      expect(denied(evaluateGate(granted({ auth_time: signedIn(13 * HOUR) }), live("admin")))).toEqual(SESSION_EXPIRED);
      expect(denied(evaluateGate(granted(), live("pledge"))).code).toBe("forbidden");
      expect(denied(evaluateGate(granted(), live("active"))).code).toBe("forbidden");
      expect(denied(evaluateGate(granted({ ...TEMP }), live("admin"))).code).toBe("password_change_required");
    });

    it("returns only uid, email, role and the sign-in time for them too: the claim itself is not passed on", () => {
      expect(evaluateGate(granted(), live("admin"))).toEqual({
        ok: true,
        user: { uid: "granted1", email: "former.pledge@uci.edu", role: "admin", signedInAtMs: SIGNED_IN_AT_MS },
      });
    });
  });

  // Sign-in is a UCI email and a password, and nothing more. What Firebase says
  // about how the person signed in, under `firebase` in the token, is not read:
  // a second factor is neither asked for nor a way past anything.
  describe("sign-in with an email and a password only", () => {
    const CALLERS: ReadonlyArray<["admin" | "active" | "pledge", (overrides?: Partial<GateClaims>) => GateClaims]> = [
      ["admin", admin],
      ["active", active],
      ["pledge", pledge],
    ];
    /** As Firebase describes a sign-in with an email and a password, and nothing else. */
    const PASSWORD_ONLY = { sign_in_provider: "password", identities: { email: ["someone@uci.edu"] } };
    /** Everything a token might say under `firebase`, beside saying nothing. */
    const SIGN_INS: ReadonlyArray<[string, unknown]> = [
      ["only the password provider", PASSWORD_ONLY],
      ["a second factor from an authenticator app", { ...PASSWORD_ONLY, sign_in_second_factor: "totp", second_factor_identifier: "factor1" }],
      ["a second factor by text message", { ...PASSWORD_ONLY, sign_in_second_factor: "phone", second_factor_identifier: "factor2" }],
      ["a second factor and no provider", { sign_in_second_factor: "totp" }],
      ["an empty second factor", { ...PASSWORD_ONLY, sign_in_second_factor: "" }],
      ["a second factor that is not text", { ...PASSWORD_ONLY, sign_in_second_factor: true }],
      ["a null second factor", { ...PASSWORD_ONLY, sign_in_second_factor: null }],
      ["nothing in it", {}],
      ["null", null],
      ["text where an object belongs", "totp"],
    ];
    /** The same claims with that under `firebase`, where the gate's own type has no such field. */
    const saying = (claims: GateClaims, firebase: unknown): GateClaims => ({ ...claims, firebase }) as GateClaims;

    /** One of each thing that can be right or wrong with an account, for a caller of any role. */
    const accounts = (claimsOf: (overrides?: Partial<GateClaims>) => GateClaims): GateClaims[] => [
      claimsOf(),
      claimsOf({ ...TEMP }),
      claimsOf({ ...TEMP, auth_time: signedIn(TIMING.passwordSetupMs + SECOND) }),
      claimsOf({ temp: true, tempAt: issuedAt(TIMING.temporaryPasswordMs + SECOND) }),
      claimsOf({ auth_time: signedIn(TIMING.maxSessionAgeMs + SECOND) }),
      claimsOf({ email_verified: false }),
      claimsOf({ role: "viewer" }),
      claimsOf({ email: "someone.else@uci.edu" }),
      claimsOf({ email: "someone@gmail.com", issued: "someone@gmail.com" }),
      claimsOf({ issued: undefined }),
    ];
    const everyKindOfRoute = (need: GateNeed): GateOptions[] => [
      live(need),
      live(need, { passwordSetup: true }),
      emulators(need),
      emulators(need, { passwordSetup: true }),
    ];
    const answerOf = (result: GateResult): string => (result.ok ? "ok" : result.code);

    it("gives a token the same answer whatever it says of a second factor, for every role on every kind of route", () => {
      let compared = 0;
      const answers = new Set<string>();
      for (const [role, claimsOf] of CALLERS) {
        for (const need of NEEDS) {
          for (const options of everyKindOfRoute(need)) {
            for (const claims of accounts(claimsOf)) {
              // With no `firebase` claim at all, which is all the gate's own type allows.
              const plain = evaluateGate(claims, options);
              answers.add(answerOf(plain));
              for (const [said, firebase] of SIGN_INS) {
                expect(evaluateGate(saying(claims, firebase), options), `${role} on a route for ${need}, with ${said}`).toEqual(plain);
                compared += 1;
              }
            }
          }
        }
      }
      expect(compared).toBe(3 * 4 * 4 * 10 * SIGN_INS.length);
      // Every answer the gate has was among those compared, so none of them turns on the second factor.
      expect([...answers].sort()).toEqual([
        "email_not_allowed",
        "email_unverified",
        "forbidden",
        "no_role",
        "ok",
        "password_change_required",
        "session_expired",
        "temporary_password_expired",
      ]);
    });

    it("admits a sign-in with a password alone to its own routes and the shared ones, for all three roles", () => {
      for (const [role, claimsOf] of CALLERS) {
        const expected = { ok: true, user: { uid: claimsOf().uid, email: claimsOf().email, role, signedInAtMs: SIGNED_IN_AT_MS } };
        for (const claims of [claimsOf(), saying(claimsOf(), PASSWORD_ONLY), saying(claimsOf(), {}), saying(claimsOf(), { sign_in_second_factor: "" })]) {
          for (const need of ["any", role] as const) {
            expect(evaluateGate(claims, live(need)), `${role} on a route for ${need}`).toEqual(expected);
            expect(evaluateGate(claims, emulators(need)), `${role} on a route for ${need}`).toEqual(expected);
          }
        }
      }
    });

    it("lets a second factor past nothing: the route's role and the account's own state are judged just the same", () => {
      const WITH_FACTOR = { ...PASSWORD_ONLY, sign_in_second_factor: "totp", second_factor_identifier: "factor1" };
      const NOT_YOURS = { status: 403, code: "forbidden", message: "You don't have permission to do that." };
      for (const [role, claimsOf] of CALLERS) {
        for (const need of NEEDS.filter((candidate) => candidate !== "any" && candidate !== role)) {
          expect(denied(evaluateGate(saying(claimsOf(), WITH_FACTOR), live(need))), `${role} on a route for ${need}`).toEqual(NOT_YOURS);
        }
        // Nor past a temporary password: that still has to be replaced first.
        expect(denied(evaluateGate(saying(claimsOf({ ...TEMP }), WITH_FACTOR), live(role))).code, role).toBe("password_change_required");
        expect(denied(evaluateGate(saying(claimsOf({ auth_time: signedIn(13 * HOUR) }), WITH_FACTOR), live(role))).code, role).toBe("session_expired");
      }
      expect(denied(evaluateGate(saying(pledge({ email: "someone.else@uci.edu" }), WITH_FACTOR), live("pledge"))).code).toBe("email_not_allowed");
      expect(denied(evaluateGate(saying(admin({ email: "former.chair@uci.edu" }), WITH_FACTOR), live("admin"))).code).toBe("forbidden");
    });

    it("never asks for a second factor: no refusal it gives is mfa_required, or speaks of one", () => {
      let refusals = 0;
      for (const [, claimsOf] of CALLERS) {
        for (const need of NEEDS) {
          for (const options of everyKindOfRoute(need)) {
            for (const claims of accounts(claimsOf)) {
              for (const firebase of [undefined, ...SIGN_INS.map(([, said]) => said)]) {
                const result = evaluateGate(firebase === undefined ? claims : saying(claims, firebase), options);
                if (result.ok) continue;
                expect(result.code).not.toBe("mfa_required");
                expect(result.code).not.toMatch(/mfa|factor|totp|passcode/i);
                expect(result.message).not.toMatch(/two-step|second factor|verification|passcode|authenticator|duo/i);
                refusals += 1;
              }
            }
          }
        }
      }
      expect(refusals).toBeGreaterThan(1000);
    });

    // The option that used to turn the second factor on is gone from the gate's
    // options. A caller that still passed it would change nothing.
    it("ignores a stray mfaRequired among the options, whatever it is set to", () => {
      const withStray = (options: GateOptions, mfaRequired: unknown): GateOptions => ({ ...options, mfaRequired }) as unknown as GateOptions;
      for (const [role, claimsOf] of CALLERS) {
        for (const need of NEEDS) {
          for (const options of everyKindOfRoute(need)) {
            for (const claims of [claimsOf(), saying(claimsOf(), PASSWORD_ONLY), saying(claimsOf(), { sign_in_second_factor: "totp" }), claimsOf({ ...TEMP })]) {
              const usual = evaluateGate(claims, options);
              for (const mfaRequired of [true, false, "true", 1, null]) {
                expect(evaluateGate(claims, withStray(options, mfaRequired)), `${role} on a route for ${need}, with mfaRequired ${String(mfaRequired)}`).toEqual(usual);
              }
            }
          }
        }
        // Set to true, a sign-in with a password alone is still let through to its own routes.
        expect(evaluateGate(saying(claimsOf(), PASSWORD_ONLY), withStray(live(role), true)), role).toEqual({
          ok: true,
          user: { uid: claimsOf().uid, email: claimsOf().email, role, signedInAtMs: SIGNED_IN_AT_MS },
        });
      }
    });

    it("has no place in its types for either: the options have no mfaRequired, and the claims it reads no firebase", () => {
      expectTypeOf<GateOptions>().not.toHaveProperty("mfaRequired");
      expectTypeOf<GateClaims>().not.toHaveProperty("firebase");
      // The keys it does have, so that the two lines above are not true of a type with none.
      expectTypeOf<GateOptions>().toHaveProperty("issuedRequired");
      expectTypeOf<GateClaims>().toHaveProperty("auth_time");
    });
  });

  describe("role needed by the route", () => {
    it("refuses a pledge on an admin route", () => {
      expect(denied(evaluateGate(pledge(), live("admin")))).toEqual({
        status: 403,
        code: "forbidden",
        message: "You don't have permission to do that.",
      });
    });

    it("refuses an admin on a pledge route", () => {
      expect(denied(evaluateGate(admin(), live("pledge")))).toEqual({
        status: 403,
        code: "forbidden",
        message: "You don't have permission to do that.",
      });
    });

    it("enforces the route's role in the emulators just the same", () => {
      expect(denied(evaluateGate(pledge(), emulators("admin"))).code).toBe("forbidden");
      expect(denied(evaluateGate(admin(), emulators("pledge"))).code).toBe("forbidden");
      // An account made by hand, with no record of where it was issued, is held to its role as well.
      expect(denied(evaluateGate(pledge({ issued: undefined }), emulators("admin"))).code).toBe("forbidden");
    });
  });

  describe("order of checks", () => {
    const expired = signedIn(TIMING.maxSessionAgeMs + SECOND);

    it.each<[string, GateClaims, GateNeed]>([
      ["an unverified email", pledge({ auth_time: expired, email_verified: false }), "any"],
      ["a missing email", pledge({ auth_time: expired, email: undefined }), "any"],
      ["a missing role", pledge({ auth_time: expired, role: undefined }), "any"],
      ["an admin claim that is not on the list", admin({ auth_time: expired, email: "former.chair@uci.edu" }), "admin"],
      ["a pledge email outside UCI", pledge({ auth_time: expired, email: "avery.chen@gmail.com" }), "pledge"],
      ["the wrong role for the route", pledge({ auth_time: expired }), "admin"],
      ["nothing but a uid", { uid: "x" }, "admin"],
    ])("reports an expired session before %s", (_label, claims, need) => {
      expect(denied(evaluateGate(claims, live(need)))).toEqual(SESSION_EXPIRED);
    });

    it("reports an unverified email before the role and the lists", () => {
      const claims: GateClaims = { uid: "x", email: "x@gmail.com", email_verified: false, auth_time: signedIn(60 * SECOND) };
      expect(denied(evaluateGate(claims, live("admin"))).code).toBe("email_unverified");
    });

    it("reports a missing role before the allowlist or the email domain", () => {
      const claims: GateClaims = { uid: "x", email: "x@gmail.com", email_verified: true, auth_time: signedIn(60 * SECOND) };
      expect(denied(evaluateGate(claims, live("admin"))).code).toBe("no_role");
    });

    it("reports an unlisted admin as forbidden, not as a disallowed email, even when it is outside UCI", () => {
      const rogue = admin({ email: "former.chair@gmail.com" });
      expect(denied(evaluateGate(rogue, live("admin")))).toEqual({
        status: 403,
        code: "forbidden",
        message: "This account doesn't have access to the portal.",
      });
    });

    it("reports a pledge email outside UCI before a wrong role for the route", () => {
      expect(denied(evaluateGate(pledge({ email: "avery.chen@gmail.com" }), live("admin"))).code).toBe("email_not_allowed");
    });
  });

  // The third role: active members, who read the pledges' work and change nothing.
  describe("active members", () => {
    const FORBIDDEN = {
      status: 403,
      code: "forbidden",
      message: "You don't have permission to do that.",
    };
    const NOT_ALLOWED = {
      status: 403,
      code: "email_not_allowed",
      message: "This account doesn't have access to the portal.",
    };

    it("admits an active on a route for actives, as an active and with nothing but uid, email, role and the sign-in time", () => {
      expect(evaluateGate(active(), live("active"))).toEqual({
        ok: true,
        user: { uid: "active1", email: "priya.shah@uci.edu", role: "active", signedInAtMs: SIGNED_IN_AT_MS },
      });
    });

    it("admits an active on a route that any signed-in user may call", () => {
      expect(evaluateGate(active(), live("any"))).toEqual({
        ok: true,
        user: { uid: "active1", email: "priya.shah@uci.edu", role: "active", signedInAtMs: SIGNED_IN_AT_MS },
      });
    });

    it.each(["admin", "pledge"] as const)("refuses an active on a route for the %s role", (need) => {
      expect(denied(evaluateGate(active(), live(need)))).toEqual(FORBIDDEN);
    });

    it("refuses an admin and a pledge on a route for actives", () => {
      expect(denied(evaluateGate(admin(), live("active")))).toEqual(FORBIDDEN);
      expect(denied(evaluateGate(pledge(), live("active")))).toEqual(FORBIDDEN);
    });

    it("lets each of the three roles onto its own routes and the shared ones, and onto no other", () => {
      const callers: Array<[GateNeed, GateClaims]> = [
        ["admin", admin()],
        ["active", active()],
        ["pledge", pledge()],
      ];
      for (const [role, claims] of callers) {
        for (const need of NEEDS) {
          const result = evaluateGate(claims, live(need));
          const expected = need === "any" || need === role;
          expect(result.ok, `${role} on a route for ${need}`).toBe(expected);
          if (result.ok) expect(result.user.role).toBe(role);
          else expect(denied(result)).toEqual(FORBIDDEN);
        }
      }
    });

    it("enforces the route's role for an active in the emulators just the same", () => {
      for (const claims of [active(), active({ issued: undefined })]) {
        expect(evaluateGate(claims, emulators("active")).ok).toBe(true);
        expect(denied(evaluateGate(claims, emulators("admin")))).toEqual(FORBIDDEN);
        expect(denied(evaluateGate(claims, emulators("pledge")))).toEqual(FORBIDDEN);
      }
    });

    it.each<[string, string]>([
      ["a Gmail address", "priya.shah@gmail.com"],
      ["a UCI subdomain", "priya.shah@ics.uci.edu"],
      ["a domain that only starts with uci.edu", "priya.shah@uci.edu.evil.example"],
      ["a domain that only ends with uci.edu", "priya.shah@notuci.edu"],
      ["two at signs", "priya.shah@evil.example@uci.edu"],
      ["a trailing space", "priya.shah@uci.edu "],
      ["no local part", "@uci.edu"],
    ])("refuses an active whose email is %s, on every kind of route", (_label, email) => {
      // Issued to the same address, so the only thing wrong with it is the domain.
      for (const need of NEEDS) {
        expect(denied(evaluateGate(active({ email, issued: email }), live(need))), need).toEqual(NOT_ALLOWED);
      }
    });

    it("refuses a non-UCI active in the emulators too", () => {
      expect(denied(evaluateGate(active({ email: "priya.shah@gmail.com", issued: undefined }), emulators("active")))).toEqual(NOT_ALLOWED);
    });

    it("admits an active whose sign-in address is still the issued one, whatever the case", () => {
      for (const issued of ["priya.shah@uci.edu", "Priya.Shah@UCI.edu"]) {
        expect(evaluateGate(active({ issued }), live("active"))).toMatchObject({ ok: true, user: { role: "active" } });
      }
      expect(evaluateGate(active({ email: "PRIYA.SHAH@UCI.EDU" }), live("active"))).toMatchObject({
        ok: true,
        user: { email: "priya.shah@uci.edu" },
      });
    });

    it.each(["priya.shah+elsewhere@uci.edu", "someone.else@uci.edu"])(
      "refuses an active whose sign-in has moved to %s, on every kind of route",
      (email) => {
        for (const need of NEEDS) {
          const moved = active({ email, issued: "priya.shah@uci.edu" });
          expect(denied(evaluateGate(moved, live(need))), need).toEqual(NOT_ALLOWED);
        }
      },
    );

    it("refuses a moved active in the emulators too: an address that is on record is held to, required or not", () => {
      const moved = active({ email: "someone.else@uci.edu", issued: "priya.shah@uci.edu" });
      expect(denied(evaluateGate(moved, emulators("active"))).code).toBe("email_not_allowed");
      expect(denied(evaluateGate(moved, live("active"))).code).toBe("email_not_allowed");
    });

    it.each<[string, unknown]>([
      ["no record of it", undefined],
      ["a null", null],
      ["a number", 7],
      ["a list", ["priya.shah@uci.edu"]],
      ["an empty string", ""],
    ])("refuses an active account with %s for its issued address on the live site", (_label, issued) => {
      expect(denied(evaluateGate(active({ issued }), live("active")))).toEqual(NOT_ALLOWED);
    });

    it("falls back to the UCI rule alone in the emulators for a hand-made active with no issued address", () => {
      expect(evaluateGate(active({ issued: undefined }), emulators("active"))).toMatchObject({ ok: true, user: { role: "active" } });
    });

    it("does not make an active an admin just because their address is on the admin list", () => {
      const listed = active({ email: "chair.one@uci.edu", issued: "chair.one@uci.edu" });
      expect(evaluateGate(listed, live("any"))).toMatchObject({ ok: true, user: { role: "active" } });
      expect(evaluateGate(listed, live("active"))).toMatchObject({ ok: true, user: { role: "active" } });
      expect(denied(evaluateGate(listed, live("admin")))).toEqual(FORBIDDEN);
      expect(denied(evaluateGate(listed, live("pledge")))).toEqual(FORBIDDEN);
    });

    it("does not let the admin list stand in for the domain or the issued address of an active", () => {
      const options = (need: GateNeed) => live(need, { adminEmails: ["advisor@example.org", "chair.one@uci.edu"] });
      const outside = active({ email: "advisor@example.org", issued: "advisor@example.org" });
      expect(denied(evaluateGate(outside, options("any")))).toEqual(NOT_ALLOWED);
      expect(denied(evaluateGate(outside, options("admin")))).toEqual(NOT_ALLOWED);
      // An active's account repointed at an admin's mailbox is still a moved account, not an admin.
      const repointed = active({ email: "chair.one@uci.edu", issued: "priya.shah@uci.edu" });
      expect(denied(evaluateGate(repointed, options("admin")))).toEqual(NOT_ALLOWED);
      expect(denied(evaluateGate(repointed, options("any")))).toEqual(NOT_ALLOWED);
    });

    it("does not hold actives to the admin list", () => {
      expect(evaluateGate(active(), live("active", { adminEmails: [] })).ok).toBe(true);
    });

    it("expires an active's sign-in after 12 hours, on every kind of route", () => {
      const old = signedIn(TIMING.maxSessionAgeMs + SECOND);
      for (const need of NEEDS) {
        expect(denied(evaluateGate(active({ auth_time: old }), live(need)))).toEqual(SESSION_EXPIRED);
      }
      expect(evaluateGate(active({ auth_time: signedIn(TIMING.maxSessionAgeMs) }), live("active")).ok).toBe(true);
    });

    it("refuses an active whose email is not verified", () => {
      expect(denied(evaluateGate(active({ email_verified: false }), live("active"))).code).toBe("email_unverified");
    });

    it.each<[string, unknown]>([
      ["the right role in the wrong case", "Active"],
      ["the plural", "actives"],
      ["a role with padding", " active"],
      ["a list holding the role", ["active"]],
      ["a made-up read-only role", "viewer"],
    ])("does not take %s for the active role", (_label, role) => {
      expect(denied(evaluateGate(active({ role }), live("any"))).code).toBe("no_role");
      expect(denied(evaluateGate(active({ role }), live("active"))).code).toBe("no_role");
    });

    it("reports an active's address outside UCI before a wrong role for the route", () => {
      const outside = active({ email: "priya.shah@gmail.com", issued: "priya.shah@gmail.com" });
      expect(denied(evaluateGate(outside, live("admin"))).code).toBe("email_not_allowed");
      expect(denied(evaluateGate(outside, live("pledge"))).code).toBe("email_not_allowed");
    });
  });

  // An account that an admin started on a temporary password. Until the person
  // has replaced it, the one thing the account may do is replace it.
  describe("an account still on a temporary password", () => {
    const CHANGE_REQUIRED = {
      status: 403,
      code: "password_change_required",
      message: "Choose your own password to continue.",
    };
    const FORBIDDEN = { status: 403, code: "forbidden", message: "You don't have permission to do that." };
    const NO_ACCESS = "This account doesn't have access to the portal.";
    const EXPIRED = {
      status: 403,
      code: "temporary_password_expired",
      message: "That temporary password has expired. Ask an admin for a new one.",
    };

    type Caller = "admin" | "active" | "pledge";
    const CALLERS: ReadonlyArray<[Caller, (overrides?: Partial<GateClaims>) => GateClaims]> = [
      ["admin", admin],
      ["active", active],
      ["pledge", pledge],
    ];
    /** The route for choosing a password, and every other route. */
    const choosing = (need: GateNeed = "any", overrides: Partial<GateOptions> = {}): GateOptions =>
      live(need, { passwordSetup: true, ...overrides });

    it("is refused every route that is not for choosing a password, whoever it is and whatever the route is for", () => {
      for (const [role, claimsOf] of CALLERS) {
        for (const need of NEEDS) {
          const claims = claimsOf({ ...TEMP });
          for (const options of [live(need), live(need, { passwordSetup: false }), emulators(need), emulators(need, { passwordSetup: false })]) {
            expect(denied(evaluateGate(claims, options)), `${role} on a route for ${need}`).toEqual(CHANGE_REQUIRED);
          }
        }
      }
    });

    it("is let through the route for choosing a password, on the live site", () => {
      for (const [role, claimsOf] of CALLERS) {
        const claims = claimsOf({ ...TEMP });
        const result = evaluateGate(claims, choosing("any"));
        // As themselves, and with nothing about the password in what the route is given.
        expect(result, role).toEqual({ ok: true, user: { uid: claims.uid, email: claims.email, role, signedInAtMs: SIGNED_IN_AT_MS } });
      }
    });

    it("is let through that route in the emulators too, made by the portal or by hand", () => {
      for (const [role, claimsOf] of CALLERS) {
        for (const claims of [claimsOf({ ...TEMP }), claimsOf({ ...TEMP, issued: undefined })]) {
          expect(evaluateGate(claims, emulators("any", { passwordSetup: true })), role).toEqual({
            ok: true,
            user: { uid: claims.uid, email: claims.email, role, signedInAtMs: SIGNED_IN_AT_MS },
          });
        }
      }
    });

    it("changes nothing for an account that is not on a temporary password: the route's flag alone does nothing", () => {
      let compared = 0;
      for (const [role, claimsOf] of CALLERS) {
        for (const need of NEEDS) {
          for (const base of [live(need), emulators(need)]) {
            const claims = claimsOf();
            const plain = evaluateGate(claims, base);
            expect(evaluateGate(claims, { ...base, passwordSetup: true }), `${role} on a route for ${need}`).toEqual(plain);
            expect(evaluateGate(claims, { ...base, passwordSetup: false }), `${role} on a route for ${need}`).toEqual(plain);
            // With its own password the account is let through to that route as to any other: by its role.
            expect(plain.ok, `${role} on a route for ${need}`).toBe(need === "any" || need === role);
            compared += 1;
          }
        }
      }
      expect(compared).toBe(3 * 4 * 2);
    });

    it("still holds the route for choosing a password to the role it is for", () => {
      for (const [role, claimsOf] of CALLERS) {
        for (const need of NEEDS) {
          const result = evaluateGate(claimsOf({ ...TEMP }), choosing(need));
          if (need === "any" || need === role) expect(result, `${role} on a route for ${need}`).toMatchObject({ ok: true, user: { role } });
          else expect(denied(result), `${role} on a route for ${need}`).toEqual(FORBIDDEN);
        }
      }
    });

    // Every combination, with what is expected written out as plain rules in the
    // order the gate applies them.
    it("gives the same answer as those rules for every role, route, flag, age of the password and age of the sign-in, live and in the emulators", () => {
      /** When the temporary password was issued: an hour ago, exactly three days ago, a second more, or never said. */
      const ISSUED: ReadonlyArray<[string, unknown, boolean]> = [
        ["an hour ago", issuedAt(HOUR), false],
        ["exactly three days ago", issuedAt(TIMING.temporaryPasswordMs), false],
        ["three days and a second ago", issuedAt(TIMING.temporaryPasswordMs + SECOND), true],
        ["never said", undefined, true],
      ];
      /** When they signed in: a minute ago, exactly fifteen minutes ago, or a second more. */
      const SIGNED_IN: ReadonlyArray<[string, number, boolean]> = [
        ["a minute ago", signedIn(MINUTE), false],
        ["exactly fifteen minutes ago", signedIn(TIMING.passwordSetupMs), false],
        ["fifteen minutes and a second ago", signedIn(TIMING.passwordSetupMs + SECOND), true],
      ];

      let checked = 0;
      const seen = new Set<string>();
      for (const [role, claimsOf] of CALLERS) {
        for (const need of NEEDS) {
          for (const temp of [true, false]) {
            for (const passwordSetup of [true, false, undefined]) {
              for (const issuedRequired of [true, false]) {
                for (const [issued, tempAt, ranOut] of ISSUED) {
                  for (const [since, authTime, stale] of SIGNED_IN) {
                    // An account with its own password may still carry a stray time. It means nothing there.
                    const claims = claimsOf({ ...(temp ? { temp: true } : {}), tempAt, auth_time: authTime });
                    const result = evaluateGate(claims, live(need, { issuedRequired, passwordSetup }));
                    const label = JSON.stringify({ role, need, temp, passwordSetup, issuedRequired, issued, since });

                    const choosingPassword = temp && passwordSetup === true;
                    let expected: string;
                    if (temp && ranOut) expected = "temporary_password_expired";
                    else if (temp && !choosingPassword) expected = "password_change_required";
                    else if (temp && stale) expected = "session_expired";
                    else if (need !== "any" && need !== role) expected = "forbidden";
                    else expected = "ok";

                    if (expected === "ok") expect(result, label).toEqual({ ok: true, user: { uid: claims.uid, email: claims.email, role, signedInAtMs: authTime * SECOND } });
                    else if (expected === "temporary_password_expired") expect(denied(result), label).toEqual(EXPIRED);
                    else if (expected === "password_change_required") expect(denied(result), label).toEqual(CHANGE_REQUIRED);
                    else if (expected === "session_expired") expect(denied(result), label).toEqual(SESSION_EXPIRED);
                    else expect(denied(result), label).toEqual(FORBIDDEN);
                    seen.add(expected);
                    checked += 1;
                  }
                }
              }
            }
          }
        }
      }
      expect(checked).toBe(3 * 4 * 2 * 3 * 2 * 4 * 3);
      expect(seen).toEqual(new Set(["ok", "temporary_password_expired", "password_change_required", "session_expired", "forbidden"]));
    });

    // A temporary password is good for three days from when a chair issued it.
    describe("three days after it was issued", () => {
      const LIMIT = TIMING.temporaryPasswordMs;
      const bothRoutes = (need: GateNeed = "any"): GateOptions[] => [live(need), choosing(need), emulators(need), emulators(need, { passwordSetup: true })];

      it("lasts 72 hours, and choosing a password has to follow the sign-in within 15 minutes", () => {
        expect(TIMING.temporaryPasswordMs).toBe(72 * HOUR);
        expect(TIMING.passwordSetupMs).toBe(15 * MINUTE);
        expect(TEMPORARY_EXPIRED).toBe("That temporary password has expired. Ask an admin for a new one.");
      });

      it("still works exactly 72 hours on, and has expired one second later, and one millisecond later", () => {
        const atLimit = issuedAt(LIMIT);
        expect(temporaryPasswordExpired(atLimit, NOW)).toBe(false);
        expect(temporaryPasswordExpired(issuedAt(LIMIT + SECOND), NOW)).toBe(true);
        expect(temporaryPasswordExpired(atLimit, NOW + 1)).toBe(true);
        expect(temporaryPasswordExpired(issuedAt(LIMIT - SECOND), NOW)).toBe(false);

        for (const [role, claimsOf] of CALLERS) {
          // At the limit: the account can still choose a password, and still do nothing else.
          const claims = claimsOf({ temp: true, tempAt: atLimit });
          expect(evaluateGate(claims, choosing()), role).toEqual({ ok: true, user: { uid: claims.uid, email: claims.email, role, signedInAtMs: SIGNED_IN_AT_MS } });
          expect(denied(evaluateGate(claims, live())), role).toEqual(CHANGE_REQUIRED);
          // The same token a millisecond later, and one issued a second earlier.
          expect(denied(evaluateGate(claims, choosing("any", { nowMs: NOW + 1 }))), role).toEqual(EXPIRED);
          expect(denied(evaluateGate(claims, live("any", { nowMs: NOW + 1 }))), role).toEqual(EXPIRED);
          expect(denied(evaluateGate(claimsOf({ temp: true, tempAt: issuedAt(LIMIT + SECOND) }), choosing())), role).toEqual(EXPIRED);
        }
      });

      it("is refused on every route once it has expired, the one for choosing a password included, whoever it is", () => {
        let checked = 0;
        for (const [role, claimsOf] of CALLERS) {
          for (const need of NEEDS) {
            for (const tempAt of [issuedAt(LIMIT + SECOND), issuedAt(LIMIT + HOUR), issuedAt(30 * 24 * HOUR)]) {
              for (const options of bothRoutes(need)) {
                const result = evaluateGate(claimsOf({ temp: true, tempAt }), options);
                expect(denied(result), `${role} on a route for ${need}`).toEqual(EXPIRED);
                checked += 1;
              }
            }
          }
        }
        expect(checked).toBe(3 * 4 * 3 * 4);
      });

      it("is 403, not 401: signing in again with the same password would change nothing", () => {
        const result = evaluateGate(pledge({ temp: true, tempAt: issuedAt(LIMIT + SECOND) }), choosing());
        expect(result).toEqual({ ok: false, ...EXPIRED });
      });

      it.each<[string, unknown]>([
        ["no time at all, as on an account flagged before the limit existed", undefined],
        ["a null", null],
        ["a numeric string", String(issuedAt(HOUR))],
        ["a date string", new Date(NOW - HOUR).toISOString()],
        ["a Date", new Date(NOW - HOUR)],
        ["an object", { seconds: issuedAt(HOUR) }],
        ["a list holding the time", [issuedAt(HOUR)]],
        ["true", true],
        ["false", false],
        ["something that is not a number", Number.NaN],
        ["infinity", Number.POSITIVE_INFINITY],
        ["minus infinity", Number.NEGATIVE_INFINITY],
        ["nought", 0],
        ["a negative number", -1],
      ])("counts as expired when the time is %s", (_label, tempAt) => {
        expect(temporaryPasswordExpired(tempAt, NOW)).toBe(true);
        for (const [role, claimsOf] of CALLERS) {
          for (const options of bothRoutes()) {
            expect(denied(evaluateGate(claimsOf({ temp: true, tempAt }), options)), role).toEqual(EXPIRED);
          }
        }
      });

      it("reads the time in seconds, with or without a fraction", () => {
        expect(temporaryPasswordExpired(issuedAt(71 * HOUR), NOW)).toBe(false);
        expect(temporaryPasswordExpired(issuedAt(73 * HOUR), NOW)).toBe(true);
        expect(temporaryPasswordExpired(issuedAt(LIMIT) + 0.25, NOW)).toBe(false);
        expect(temporaryPasswordExpired(issuedAt(LIMIT) - 0.25, NOW)).toBe(true);
      });

      // Two servers' clocks need not agree to the second, so a password issued by one may reach
      // another a moment "before" it was issued. Up to five minutes ahead, it has not expired.
      describe("a time ahead of the server's clock", () => {
        const SLACK = 5 * MINUTE;

        it.each<[string, number]>([
          ["this very moment", 0],
          ["a second from now", SECOND],
          ["a minute from now", MINUTE],
          ["a second short of five minutes from now", SLACK - SECOND],
          ["exactly five minutes from now", SLACK],
        ])("has not expired when it was issued %s", (_label, ahead) => {
          const tempAt = issuedAt(-ahead);
          expect(temporaryPasswordExpired(tempAt, NOW)).toBe(false);
          for (const [role, claimsOf] of CALLERS) {
            const claims = claimsOf({ temp: true, tempAt });
            expect(evaluateGate(claims, choosing()), role).toEqual({ ok: true, user: { uid: claims.uid, email: claims.email, role, signedInAtMs: SIGNED_IN_AT_MS } });
            expect(denied(evaluateGate(claims, live())), role).toEqual(CHANGE_REQUIRED);
          }
        });

        // Further ahead than that is not a time the portal wrote, and must never mean "does not expire".
        it.each<[string, number]>([
          ["five minutes and a second from now", SLACK + SECOND],
          ["six minutes from now", 6 * MINUTE],
          ["an hour from now", HOUR],
          ["three days from now", TIMING.temporaryPasswordMs],
          ["a year from now", 365 * 24 * HOUR],
          ["a thousand years from now", 1000 * 365 * 24 * HOUR],
        ])("counts as expired when it was issued %s, on every route", (_label, ahead) => {
          const tempAt = issuedAt(-ahead);
          expect(temporaryPasswordExpired(tempAt, NOW)).toBe(true);
          for (const [role, claimsOf] of CALLERS) {
            for (const need of NEEDS) {
              for (const options of bothRoutes(need)) {
                expect(denied(evaluateGate(claimsOf({ temp: true, tempAt }), options)), `${role} on a route for ${need}`).toEqual(EXPIRED);
              }
            }
          }
        });

        it("turns at five minutes to the millisecond: the same time is refused by a clock one millisecond further behind", () => {
          const tempAt = issuedAt(-SLACK);
          expect(temporaryPasswordExpired(tempAt, NOW)).toBe(false);
          expect(temporaryPasswordExpired(tempAt, NOW - 1)).toBe(true);
          expect(temporaryPasswordExpired(tempAt, NOW + 1)).toBe(false);

          const claims = pledge({ temp: true, tempAt });
          expect(evaluateGate(claims, choosing()).ok).toBe(true);
          expect(denied(evaluateGate(claims, choosing("any", { nowMs: NOW - 1 })))).toEqual(EXPIRED);
          expect(denied(evaluateGate(claims, live("any", { nowMs: NOW - 1 })))).toEqual(EXPIRED);
        });

        it("counts a time written in milliseconds by mistake as expired, not as one that never will", () => {
          // What Date.now() gives, where seconds were wanted: read as seconds it is tens of thousands of years off.
          for (const inMilliseconds of [NOW, NOW - HOUR, NOW - TIMING.temporaryPasswordMs - SECOND, NOW + HOUR, Date.UTC(2020, 0, 1)]) {
            expect(temporaryPasswordExpired(inMilliseconds, NOW), String(inMilliseconds)).toBe(true);
            for (const [role, claimsOf] of CALLERS) {
              for (const options of bothRoutes()) {
                expect(denied(evaluateGate(claimsOf({ temp: true, tempAt: inMilliseconds }), options)), role).toEqual(EXPIRED);
              }
            }
          }
          // The same instants in seconds are what they say they are.
          expect(temporaryPasswordExpired((NOW - HOUR) / SECOND, NOW)).toBe(false);
          expect(temporaryPasswordExpired((NOW - TIMING.temporaryPasswordMs - SECOND) / SECOND, NOW)).toBe(true);
        });

        it("is no way to stretch the three days: at most five minutes are gained", () => {
          // Issued "five minutes from now", the password is still gone three days after that time.
          const tempAt = issuedAt(-SLACK);
          expect(temporaryPasswordExpired(tempAt, NOW + SLACK + TIMING.temporaryPasswordMs)).toBe(false);
          expect(temporaryPasswordExpired(tempAt, NOW + SLACK + TIMING.temporaryPasswordMs + 1)).toBe(true);
        });
      });

      it("goes by the request's own clock, not by anything else in the token", () => {
        const claims = { ...pledge({ temp: true, tempAt: issuedAt(LIMIT + SECOND) }), iat: NOW / SECOND, exp: NOW / SECOND + 3600 } as GateClaims;
        expect(denied(evaluateGate(claims, choosing()))).toEqual(EXPIRED);
        // The same claims three days and a second earlier were fine.
        expect(evaluateGate({ ...claims, auth_time: signedIn(LIMIT + 2 * SECOND) }, choosing("any", { nowMs: NOW - LIMIT - SECOND })).ok).toBe(true);
      });
    });

    // The password has to be chosen soon after signing in, so a screen left open on
    // a shared computer is no use to the next person along.
    describe("fifteen minutes after signing in", () => {
      const LIMIT = TIMING.passwordSetupMs;

      it("lets the account choose a password on a sign-in exactly 15 minutes old, and not one second or one millisecond older", () => {
        for (const [role, claimsOf] of CALLERS) {
          const atLimit = claimsOf({ ...TEMP, auth_time: signedIn(LIMIT) });
          for (const options of [choosing(), emulators("any", { passwordSetup: true })]) {
            expect(evaluateGate(atLimit, options), role).toEqual({ ok: true, user: { uid: atLimit.uid, email: atLimit.email, role, signedInAtMs: NOW - LIMIT } });
            expect(denied(evaluateGate(atLimit, { ...options, nowMs: NOW + 1 })), role).toEqual(SESSION_EXPIRED);
            expect(denied(evaluateGate(claimsOf({ ...TEMP, auth_time: signedIn(LIMIT + SECOND) }), options)), role).toEqual(SESSION_EXPIRED);
          }
          expect(evaluateGate(claimsOf({ ...TEMP, auth_time: signedIn(LIMIT - SECOND) }), choosing()).ok, role).toBe(true);
        }
      });

      it("answers 401, with the same words as any expired session, so the browser asks them to sign in again", () => {
        const result = evaluateGate(pledge({ ...TEMP, auth_time: signedIn(16 * MINUTE) }), choosing());
        expect(result).toEqual({ ok: false, status: 401, code: "session_expired", message: "Your session has expired. Sign in again." });
      });

      it("is only about choosing a password: on any other route the answer is still to choose one", () => {
        for (const [role, claimsOf] of CALLERS) {
          for (const need of NEEDS) {
            for (const msAgo of [LIMIT + SECOND, 16 * MINUTE, HOUR, 11 * HOUR, TIMING.maxSessionAgeMs]) {
              const claims = claimsOf({ ...TEMP, auth_time: signedIn(msAgo) });
              for (const options of [live(need), live(need, { passwordSetup: false }), emulators(need)]) {
                expect(denied(evaluateGate(claims, options)), `${role} on a route for ${need}`).toEqual(CHANGE_REQUIRED);
              }
            }
          }
        }
      });

      it("does not apply to an account with its own password, on that route or any other", () => {
        let compared = 0;
        for (const [role, claimsOf] of CALLERS) {
          for (const need of NEEDS) {
            for (const msAgo of [LIMIT + SECOND, 16 * MINUTE, HOUR, 11 * HOUR, TIMING.maxSessionAgeMs]) {
              for (const base of [live(need), emulators(need)]) {
                const fresh = evaluateGate(claimsOf(), base);
                const claims = claimsOf({ auth_time: signedIn(msAgo) });
                // The same answer as for a fresh sign-in, apart from when it says the person signed in.
                const asFresh: GateResult = fresh.ok ? { ...fresh, user: { ...fresh.user, signedInAtMs: NOW - msAgo } } : fresh;
                expect(evaluateGate(claims, { ...base, passwordSetup: true }), `${role} on a route for ${need}`).toEqual(asFresh);
                expect(evaluateGate(claims, base), `${role} on a route for ${need}`).toEqual(asFresh);
                compared += 1;
              }
            }
          }
          // Signed in eleven hours ago, with a password of their own: let through the route for choosing a password like any other.
          expect(evaluateGate(claimsOf({ auth_time: signedIn(11 * HOUR) }), choosing("any")), role).toMatchObject({ ok: true, user: { role } });
        }
        expect(compared).toBe(3 * 4 * 5 * 2);
      });

      it("is not reset by a refreshed token: it is the sign-in that is timed", () => {
        const refreshed = { ...pledge({ ...TEMP, auth_time: signedIn(LIMIT + SECOND) }), iat: NOW / SECOND, exp: NOW / SECOND + 3600 } as GateClaims;
        expect(denied(evaluateGate(refreshed, choosing()))).toEqual(SESSION_EXPIRED);
      });

      it("counts a sign-in dated a moment ahead of the server's clock as fresh", () => {
        const ahead = pledge({ ...TEMP, auth_time: signedIn(-5 * SECOND) });
        expect(evaluateGate(ahead, choosing()).ok).toBe(true);
      });
    });

    // An account with its own password may still carry the time its last temporary
    // one was issued, or anything else under that name. Without the flag it means nothing.
    describe("the time on an account that is not on a temporary password", () => {
      const TIMES: ReadonlyArray<[string, unknown]> = [
        ["three days and a second ago", issuedAt(TIMING.temporaryPasswordMs + SECOND)],
        ["a year ago", issuedAt(365 * 24 * HOUR)],
        ["an hour ago", issuedAt(HOUR)],
        ["an hour from now", issuedAt(-HOUR)],
        ["nought", 0],
        ["text", "yesterday"],
        ["null", null],
        ["not a number", Number.NaN],
      ];

      it.each(TIMES)("is ignored when it is %s: the account uses the portal as usual", (_label, tempAt) => {
        for (const [role, claimsOf] of CALLERS) {
          for (const need of NEEDS) {
            for (const more of [{}, { passwordSetup: true }, { issuedRequired: false }]) {
              for (const temp of [undefined, false, "true", 1, null]) {
                const usual = evaluateGate(claimsOf(), live(need, more));
                expect(evaluateGate(claimsOf({ temp, tempAt }), live(need, more)), `${role} on a route for ${need}`).toEqual(usual);
              }
            }
          }
          expect(evaluateGate(claimsOf({ tempAt }), live(role)), role).toMatchObject({ ok: true, user: { role } });
        }
      });

      // Nor does the greeting a new member's account carries: it is for the sign-in page, not for the gate.
      it.each(TIMES)("is ignored along with the greeting when it is %s", (_label, tempAt) => {
        for (const [role, claimsOf] of CALLERS) {
          const greeted = claimsOf({ tempAt, tempNew: true } as Partial<GateClaims>);
          for (const need of NEEDS) {
            for (const options of [live(need), choosing(need)]) {
              expect(evaluateGate(greeted, options), `${role} on a route for ${need}`).toEqual(evaluateGate(claimsOf(), options));
            }
          }
        }
      });
    });

    describe("order of checks", () => {
      const expired = signedIn(TIMING.maxSessionAgeMs + SECOND);
      const BOTH_KINDS_OF_ROUTE: ReadonlyArray<[string, (need?: GateNeed) => GateOptions]> = [
        ["an ordinary route", (need = "any") => live(need)],
        ["the route for choosing a password", (need = "any") => choosing(need)],
      ];

      it.each(BOTH_KINDS_OF_ROUTE)("reports an expired session first, with 401, on %s", (_label, options) => {
        for (const [role, claimsOf] of CALLERS) {
          expect(denied(evaluateGate(claimsOf({ ...TEMP, auth_time: expired }), options())), role).toEqual(SESSION_EXPIRED);
          expect(denied(evaluateGate(claimsOf({ ...TEMP, auth_time: undefined }), options())), role).toEqual(SESSION_EXPIRED);
        }
        // And before the temporary password is looked at, however long ago that ran out.
        for (const tempAt of [issuedAt(TIMING.temporaryPasswordMs + HOUR), undefined, "soon"]) {
          expect(denied(evaluateGate(pledge({ temp: true, tempAt, auth_time: expired }), options()))).toEqual(SESSION_EXPIRED);
        }
        // Exactly at the limit is still a sign-in, and gets the answer for a temporary password.
        const atLimit = pledge({ ...TEMP, auth_time: signedIn(TIMING.maxSessionAgeMs) });
        expect(denied(evaluateGate(atLimit, live()))).toEqual(CHANGE_REQUIRED);
        expect(denied(evaluateGate({ ...atLimit, tempAt: issuedAt(TIMING.temporaryPasswordMs + SECOND) }, options()))).toEqual(EXPIRED);
      });

      it.each(BOTH_KINDS_OF_ROUTE)("reports an unverified email, and a missing role, before the temporary password on %s", (_label, options) => {
        expect(denied(evaluateGate(pledge({ ...TEMP, email_verified: false }), options())).code).toBe("email_unverified");
        expect(denied(evaluateGate(active({ ...TEMP, email: undefined }), options())).code).toBe("email_unverified");
        expect(denied(evaluateGate(pledge({ ...TEMP, role: undefined }), options())).code).toBe("no_role");
        expect(denied(evaluateGate(active({ ...TEMP, role: "viewer" }), options())).code).toBe("no_role");
      });

      it.each(BOTH_KINDS_OF_ROUTE)("refuses an admin who is not on the list as forbidden, not as needing a new password, on %s", (_label, options) => {
        const rogue = admin({ ...TEMP, uid: "rogue", email: "former.chair@uci.edu" });
        for (const need of NEEDS) {
          expect(denied(evaluateGate(rogue, options(need))), need).toEqual({ status: 403, code: "forbidden", message: NO_ACCESS });
        }
        expect(denied(evaluateGate(admin({ ...TEMP }), { ...options("admin"), adminEmails: [] })).code).toBe("forbidden");
      });

      it.each(BOTH_KINDS_OF_ROUTE)("refuses an address outside UCI as not allowed, on %s", (_label, options) => {
        for (const email of ["avery.chen@gmail.com", "avery.chen@ics.uci.edu", "avery.chen@uci.edu.evil.example"]) {
          for (const claims of [pledge({ ...TEMP, email, issued: email }), active({ ...TEMP, email, issued: email })]) {
            for (const need of NEEDS) {
              expect(denied(evaluateGate(claims, options(need))), `${email} on a route for ${need}`).toEqual({
                status: 403,
                code: "email_not_allowed",
                message: NO_ACCESS,
              });
            }
          }
        }
      });

      it.each(BOTH_KINDS_OF_ROUTE)("refuses a sign-in that is no longer at the address it was issued to, on %s", (_label, options) => {
        const moved: GateClaims[] = [
          pledge({ ...TEMP, email: "someone.else@uci.edu" }),
          pledge({ ...TEMP, issued: "someone.else@uci.edu" }),
          active({ ...TEMP, email: "priya.shah+elsewhere@uci.edu" }),
          active({ ...TEMP, email: "chair.one@uci.edu" }),
          // On the live site an account with no record of the address is not one the portal made.
          pledge({ ...TEMP, issued: undefined }),
          active({ ...TEMP, issued: null }),
          pledge({ ...TEMP, issued: "" }),
        ];
        for (const claims of moved) {
          expect(denied(evaluateGate(claims, options())), JSON.stringify(claims)).toEqual({
            status: 403,
            code: "email_not_allowed",
            message: NO_ACCESS,
          });
        }
      });

      it("refuses those in the emulators as well, where an account made by hand may have no issued address", () => {
        for (const passwordSetup of [true, false]) {
          const options = emulators("any", { passwordSetup });
          expect(denied(evaluateGate(pledge({ ...TEMP, email: "avery.chen@gmail.com", issued: undefined }), options)).code).toBe("email_not_allowed");
          expect(denied(evaluateGate(pledge({ ...TEMP, email: "someone.else@uci.edu" }), options)).code).toBe("email_not_allowed");
        }
        // A hand-made account with a UCI address and the flag is treated like any other on a temporary password.
        const handMade = pledge({ ...TEMP, issued: undefined });
        expect(denied(evaluateGate(handMade, emulators("any")))).toEqual(CHANGE_REQUIRED);
        expect(evaluateGate(handMade, emulators("any", { passwordSetup: true })).ok).toBe(true);
      });

      it("asks for a new password before it says a route is somebody else's, so the account learns nothing about routes", () => {
        expect(denied(evaluateGate(pledge({ ...TEMP }), live("admin")))).toEqual(CHANGE_REQUIRED);
        expect(denied(evaluateGate(pledge({ ...TEMP }), live("active")))).toEqual(CHANGE_REQUIRED);
        expect(denied(evaluateGate(active({ ...TEMP }), live("admin")))).toEqual(CHANGE_REQUIRED);
        expect(denied(evaluateGate(active({ ...TEMP }), live("pledge")))).toEqual(CHANGE_REQUIRED);
        expect(denied(evaluateGate(admin({ ...TEMP }), live("pledge")))).toEqual(CHANGE_REQUIRED);
      });

      // Everything above comes before the three days are looked at, and everything below after.
      describe("for a temporary password that has expired", () => {
        const RAN_OUT: Pick<GateClaims, "temp" | "tempAt"> = { temp: true, tempAt: issuedAt(TIMING.temporaryPasswordMs + SECOND) };

        it.each(BOTH_KINDS_OF_ROUTE)("reports an unverified email, and a missing role, first on %s", (_label, options) => {
          expect(denied(evaluateGate(pledge({ ...RAN_OUT, email_verified: false }), options())).code).toBe("email_unverified");
          expect(denied(evaluateGate(active({ ...RAN_OUT, email: undefined }), options())).code).toBe("email_unverified");
          expect(denied(evaluateGate(pledge({ ...RAN_OUT, role: undefined }), options())).code).toBe("no_role");
          expect(denied(evaluateGate(active({ ...RAN_OUT, role: "viewer" }), options())).code).toBe("no_role");
        });

        it.each(BOTH_KINDS_OF_ROUTE)("refuses an admin who is not on the list as forbidden first, on %s", (_label, options) => {
          const rogue = admin({ ...RAN_OUT, uid: "rogue", email: "former.chair@uci.edu" });
          for (const need of NEEDS) {
            expect(denied(evaluateGate(rogue, options(need))), need).toEqual({ status: 403, code: "forbidden", message: NO_ACCESS });
          }
        });

        it.each(BOTH_KINDS_OF_ROUTE)("refuses an address outside UCI, or one the account was not issued to, first, on %s", (_label, options) => {
          const notAllowed: GateClaims[] = [
            pledge({ ...RAN_OUT, email: "avery.chen@gmail.com", issued: "avery.chen@gmail.com" }),
            active({ ...RAN_OUT, email: "priya.shah@ics.uci.edu", issued: "priya.shah@ics.uci.edu" }),
            pledge({ ...RAN_OUT, email: "someone.else@uci.edu" }),
            active({ ...RAN_OUT, issued: "someone.else@uci.edu" }),
            pledge({ ...RAN_OUT, issued: undefined }),
          ];
          for (const claims of notAllowed) {
            expect(denied(evaluateGate(claims, options())), JSON.stringify(claims)).toEqual({ status: 403, code: "email_not_allowed", message: NO_ACCESS });
          }
          // In the emulators a hand-made account has no issued address, and is told its password has expired.
          expect(denied(evaluateGate(pledge({ ...RAN_OUT, issued: undefined }), { ...options(), issuedRequired: false }))).toEqual(EXPIRED);
        });

        it("says so before it asks for a new password, on every route that is not for choosing one", () => {
          for (const [role, claimsOf] of CALLERS) {
            for (const need of NEEDS) {
              expect(denied(evaluateGate(claimsOf({ ...RAN_OUT }), live(need))), `${role} on a route for ${need}`).toEqual(EXPIRED);
            }
          }
        });

        it("says so before it turns away a sign-in that is too old to choose a password with", () => {
          for (const msAgo of [TIMING.passwordSetupMs + SECOND, HOUR, TIMING.maxSessionAgeMs]) {
            const claims = pledge({ ...RAN_OUT, auth_time: signedIn(msAgo) });
            expect(denied(evaluateGate(claims, choosing())), `${msAgo} ms`).toEqual(EXPIRED);
          }
          // With the password still good, the same sign-ins are the ones turned away.
          expect(denied(evaluateGate(pledge({ ...TEMP, auth_time: signedIn(HOUR) }), choosing()))).toEqual(SESSION_EXPIRED);
        });

        it("says so before it says a route is somebody else's, on the route for choosing a password as on any other", () => {
          for (const [role, claimsOf] of CALLERS) {
            for (const need of NEEDS.filter((candidate) => candidate !== "any" && candidate !== role)) {
              for (const options of [live(need), choosing(need)]) {
                expect(denied(evaluateGate(claimsOf({ ...RAN_OUT }), options)), `${role} on a route for ${need}`).toEqual(EXPIRED);
              }
              // With the password still good, that route is the one answer that says whose it is.
              expect(denied(evaluateGate(claimsOf({ ...TEMP }), choosing(need))), `${role} on a route for ${need}`).toEqual(FORBIDDEN);
            }
          }
        });
      });

      it("turns away a sign-in that is too old to choose a password with before it says the route is somebody else's", () => {
        const stale = signedIn(TIMING.passwordSetupMs + SECOND);
        expect(denied(evaluateGate(pledge({ ...TEMP, auth_time: stale }), choosing("admin")))).toEqual(SESSION_EXPIRED);
        expect(denied(evaluateGate(active({ ...TEMP, auth_time: stale }), choosing("pledge")))).toEqual(SESSION_EXPIRED);
        // Fresh, the same accounts are told the route is not theirs.
        expect(denied(evaluateGate(pledge({ ...TEMP }), choosing("admin")))).toEqual(FORBIDDEN);
        expect(denied(evaluateGate(active({ ...TEMP }), choosing("pledge")))).toEqual(FORBIDDEN);
      });

      it("checks the address before the age of the sign-in on the route for choosing a password", () => {
        const stale = signedIn(TIMING.passwordSetupMs + SECOND);
        expect(denied(evaluateGate(pledge({ ...TEMP, auth_time: stale, email: "someone.else@uci.edu" }), choosing())).code).toBe("email_not_allowed");
        expect(denied(evaluateGate(pledge({ ...TEMP, auth_time: stale, email_verified: false }), choosing())).code).toBe("email_unverified");
        expect(denied(evaluateGate(admin({ ...TEMP, auth_time: stale, email: "former.chair@uci.edu" }), choosing())).code).toBe("forbidden");
      });
    });

    describe("a flag that is not exactly true", () => {
      const NOT_TRUE: ReadonlyArray<[string, unknown]> = [
        ["the text \"true\"", "true"],
        ["the number 1", 1],
        ["the text \"1\"", "1"],
        ["the text \"yes\"", "yes"],
        ["an object", { temp: true }],
        ["a list holding true", [true]],
        ["an empty list", []],
        ["false", false],
        ["0", 0],
        ["null", null],
        ["nothing", undefined],
      ];

      it.each(NOT_TRUE)("is ignored when it is %s: the account uses the portal as usual", (_label, temp) => {
        for (const [role, claimsOf] of CALLERS) {
          for (const need of NEEDS) {
            const claims = claimsOf({ temp });
            expect(evaluateGate(claims, live(need)), `${role} on a route for ${need}`).toEqual(evaluateGate(claimsOf(), live(need)));
          }
          expect(evaluateGate(claimsOf({ temp }), live(role)), role).toEqual({
            ok: true,
            user: { uid: claimsOf().uid, email: claimsOf().email, role, signedInAtMs: SIGNED_IN_AT_MS },
          });
        }
      });

      // The route for choosing a password is open to it as to any account with its own password: by
      // its role, and however long ago it signed in. Nothing about that route is for a flag like this.
      it.each(NOT_TRUE)("is no temporary password on the route for choosing one either, when it is %s", (_label, temp) => {
        for (const [role, claimsOf] of CALLERS) {
          for (const need of NEEDS) {
            const claims = claimsOf({ temp, tempAt: issuedAt(TIMING.temporaryPasswordMs + SECOND), auth_time: signedIn(HOUR) });
            const result = evaluateGate(claims, choosing(need));
            if (need === "any" || need === role) expect(result, `${role} on a route for ${need}`).toEqual({ ok: true, user: { uid: claims.uid, email: claims.email, role, signedInAtMs: NOW - HOUR } });
            else expect(denied(result), `${role} on a route for ${need}`).toEqual(FORBIDDEN);
          }
        }
      });
    });
  });

  it("refuses with 403 for every reason except an expired session, which is 401", () => {
    const refusals = [
      evaluateGate(pledge({ ...TEMP }), live()),
      evaluateGate(active({ ...TEMP }), live("active")),
      evaluateGate(admin({ ...TEMP }), live("admin")),
      evaluateGate(active({ email: "priya.shah@gmail.com" }), live()),
      evaluateGate(active(), live("admin")),
      evaluateGate(active(), live("pledge")),
      evaluateGate(pledge(), live("active")),
      evaluateGate(pledge({ email_verified: false }), live()),
      evaluateGate(pledge({ role: undefined }), live()),
      evaluateGate(admin({ email: "x@uci.edu" }), live()),
      evaluateGate(pledge({ email: "avery.chen@gmail.com" }), live()),
      evaluateGate(pledge(), live("admin")),
      // A temporary password that has run out, on any route and on the one for replacing it.
      evaluateGate(pledge({ temp: true, tempAt: issuedAt(TIMING.temporaryPasswordMs + SECOND) }), live()),
      evaluateGate(active({ temp: true, tempAt: undefined }), live("any", { passwordSetup: true })),
    ];
    for (const refusal of refusals) expect(denied(refusal).status).toBe(403);
    // Six reasons, and no seventh: nothing is refused for want of a second factor.
    expect(new Set(refusals.map((refusal) => denied(refusal).code))).toEqual(
      new Set(["password_change_required", "temporary_password_expired", "email_not_allowed", "forbidden", "email_unverified", "no_role"]),
    );
    // A sign-in that is too old, whether for the portal or for choosing a password.
    const tooOld = [
      evaluateGate(pledge({ auth_time: undefined }), live()),
      evaluateGate(pledge({ auth_time: signedIn(TIMING.maxSessionAgeMs + SECOND) }), live()),
      evaluateGate(pledge({ ...TEMP, auth_time: signedIn(TIMING.passwordSetupMs + SECOND) }), live("any", { passwordSetup: true })),
    ];
    for (const refusal of tooOld) expect(denied(refusal)).toEqual(SESSION_EXPIRED);
  });
});
