/**
 * The gate as a deployed route applies it. The emulator-backed tests under
 * tests/portal run in emulator mode, where an account need not say which
 * address it was issued to, and where the token is whatever the emulator
 * makes. Here the Firebase Admin SDK is the one thing replaced:
 * `getPortalAdmin` reports live mode, its token verifier hands back whatever
 * claims the test sets, and it can read the one account and the documents the
 * test puts there. It can write nothing. Everything else, including
 * `portalRoute`, the gate, the rate limit and the fingerprint of a temporary
 * password, is the real code.
 *
 * The clock is the test's own, so the three days a temporary password lasts
 * and the fifteen minutes it may take to replace one are checked here to the
 * millisecond, which the emulator-backed tests cannot do.
 *
 * The last part of the file calls the portal's own route exports the same way:
 * to check that a sign-in with an email and a password, and nothing more, is
 * let through to every one of them that is its role's, and which of them an
 * account on a temporary password can reach, and what the one it reaches says.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TIMING } from "../constants";
import type { ApiErrorBody } from "../types";
import type { AuthedUser } from "./gate";
import { portalRoute, type RouteOptions } from "./http";
import { RATE_LIMITS, allowRequest, resetRateLimits } from "./rate-limit";
import { fingerprint } from "./temporary-password";

const stub = vi.hoisted(() => ({
  claims: {} as Record<string, unknown>,
  adminEmails: ["chair.one@uci.edu", "chair.two@uci.edu"],
  /** Every call the route made to the verifier: the token, and whether revocation was checked. */
  verified: [] as Array<[string, unknown]>,
  /** Runs inside the verifier, standing in for the time a real verification takes. */
  whileVerifying: (): void => undefined,
  /** When set, the verifier throws this instead of returning claims. */
  failure: null as unknown,
  /** The claims stored on the account itself, which a route may read apart from the token's. */
  accountClaims: {} as Record<string, unknown>,
  /** How Firebase stores the account's password, as the Admin SDK hands it back with the account. */
  accountHash: undefined as string | null | undefined,
  /** Every account a route looked up, by uid. */
  lookedUp: [] as string[],
  /** The documents a route may read, by path. None by default. */
  documents: {} as Record<string, Record<string, unknown>>,
  /** Every document a route read, by path. */
  read: [] as string[],
}));

vi.mock("./admin", () => {
  // Reading one document by its path is all that is provided. Nothing that writes is, to
  // the sign-in accounts or to the documents, so a route that tried to would fail.
  const collection = (name: string) => {
    const reference = {
      withConverter: () => reference,
      doc: (id: string) => ({
        get: async () => {
          const path = `${name}/${id}`;
          stub.read.push(path);
          const data = stub.documents[path];
          return { exists: data !== undefined, data: () => data };
        },
      }),
    };
    return reference;
  };
  return {
    getPortalAdmin: () => ({
      env: { mode: "live", adminEmails: stub.adminEmails },
      auth: {
        verifyIdToken: async (token: string, checkRevoked: unknown) => {
          stub.verified.push([token, checkRevoked]);
          stub.whileVerifying();
          if (stub.failure !== null) throw stub.failure;
          return stub.claims;
        },
        // Read by the one real route that is called past the gate below.
        getUser: async (uid: string) => {
          stub.lookedUp.push(uid);
          return { uid, displayName: "Somebody Else", customClaims: stub.accountClaims, passwordHash: stub.accountHash };
        },
      },
      db: { collection },
    }),
  };
});

const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const SECOND = 1000;
const MINUTE = 60_000;
const HOUR = 3_600_000;
const TOKEN = "aaa.bbb.ccc";
/** When the default claims below say the person signed in, as the gate hands it to the handler: a minute before NOW. */
const SIGNED_IN_AT_MS = NOW - MINUTE;
/** What an account carries while it is on a temporary password a chair issued an hour ago. */
const TEMP = { temp: true, tempAt: (NOW - HOUR) / SECOND };
/** The same, for one issued this long ago. */
const issued = (msAgo: number): { temp: true; tempAt: number } => ({ temp: true, tempAt: (NOW - msAgo) / SECOND });
const EXPIRED = { error: "That temporary password has expired. Ask an admin for a new one.", code: "temporary_password_expired" };
const SESSION_EXPIRED = { error: "Your session has expired. Sign in again.", code: "session_expired" };

/** How Firebase describes a sign-in with an email and a password, which is the only kind the portal has. */
const PASSWORD_ONLY = { sign_in_provider: "password" };
/** What it would say of an account that had an authenticator attached through Firebase directly. */
const WITH_SECOND_FACTOR = { sign_in_provider: "password", sign_in_second_factor: "totp", second_factor_identifier: "factor1" };

/** A pledge's verified token on the live site: signed in a minute ago, with their email and password. */
const pledgeClaims = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  uid: "pledge1",
  email: "avery.chen@uci.edu",
  email_verified: true,
  role: "pledge",
  issued: "avery.chen@uci.edu",
  auth_time: (NOW - 60_000) / 1000,
  firebase: PASSWORD_ONLY,
  ...overrides,
});

const adminClaims = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...pledgeClaims(),
  uid: "admin1",
  email: "chair.one@uci.edu",
  role: "admin",
  ...overrides,
});

/** An active member's verified token on the live site: the same as a pledge's in everything but the role. */
const activeClaims = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...pledgeClaims(),
  uid: "active1",
  email: "priya.shah@uci.edu",
  issued: "priya.shah@uci.edu",
  role: "active",
  ...overrides,
});

interface Reached {
  user: AuthedUser;
  nowMs: number;
  body: unknown;
}

/** A real route, built the way every handler under /api/portal is, that records what reached it. */
function route(role: RouteOptions["role"], more: Omit<RouteOptions, "role"> = {}) {
  const reached: Reached[] = [];
  const handler = portalRoute({ role, ...more }, async (context) => {
    reached.push({ user: context.user, nowMs: context.now.getTime(), body: context.body });
    return { ok: true, uid: context.user.uid };
  });
  return { handler, reached };
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

function request(method: Method = "GET", token: string | null = TOKEN): Request {
  const headers = new Headers();
  if (token !== null) headers.set("authorization", `Bearer ${token}`);
  const withBody = method === "POST" || method === "PUT" || method === "PATCH";
  if (withBody) headers.set("content-type", "application/json");
  return new Request("http://localhost/api/portal/under-test", { method, headers, body: withBody ? "{}" : undefined });
}

const noParams = { params: Promise.resolve({}) };

async function send(
  handler: ReturnType<typeof route>["handler"],
  method: Method = "GET",
  token: string | null = TOKEN,
): Promise<{ status: number; body: ApiErrorBody & Record<string, unknown>; headers: Headers }> {
  const response = await handler(request(method, token), noParams);
  return {
    status: response.status,
    body: (await response.json()) as ApiErrorBody & Record<string, unknown>,
    headers: response.headers,
  };
}

beforeEach(() => {
  // Only the clock is faked, so "now" is exact and nothing else about timing changes.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  stub.claims = pledgeClaims();
  stub.verified.length = 0;
  stub.whileVerifying = () => undefined;
  stub.failure = null;
  stub.accountClaims = {};
  stub.accountHash = undefined;
  stub.lookedUp.length = 0;
  stub.documents = {};
  stub.read.length = 0;
  resetRateLimits();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a route on the live site", () => {
  // Sign-in is a UCI email and a password. No route asks for anything more, and nothing a
  // token says of a second factor makes any difference to what it is let through to.
  describe("sign-in with an email and a password only", () => {
    const CALLERS: ReadonlyArray<["admin" | "active" | "pledge", (overrides?: Record<string, unknown>) => Record<string, unknown>, AuthedUser]> = [
      ["admin", adminClaims, { uid: "admin1", email: "chair.one@uci.edu", role: "admin", signedInAtMs: SIGNED_IN_AT_MS }],
      ["active", activeClaims, { uid: "active1", email: "priya.shah@uci.edu", role: "active", signedInAtMs: SIGNED_IN_AT_MS }],
      ["pledge", pledgeClaims, { uid: "pledge1", email: "avery.chen@uci.edu", role: "pledge", signedInAtMs: SIGNED_IN_AT_MS }],
    ];
    /** Everything a token might say of the sign-in under `firebase`. */
    const SIGN_INS: ReadonlyArray<[string, unknown]> = [
      ["names only the password provider", PASSWORD_ONLY],
      ["has no firebase claim", undefined],
      ["has an empty firebase claim", {}],
      ["carries a second factor from an authenticator app", WITH_SECOND_FACTOR],
      ["carries a second factor by text message", { sign_in_provider: "password", sign_in_second_factor: "phone" }],
      ["has an empty second factor", { sign_in_provider: "password", sign_in_second_factor: "" }],
      ["has a second factor that is not a string", { sign_in_second_factor: true }],
    ];

    it.each(SIGN_INS)("lets each of the three roles through to its own routes and the shared ones when the token %s", async (_label, firebase) => {
      for (const [role, claimsOf, user] of CALLERS) {
        stub.claims = claimsOf({ firebase });
        for (const need of ["any", role] as const) {
          const { handler, reached } = route(need);
          const result = await send(handler);
          expect(result.status, `${role} on a route for ${need}`).toBe(200);
          expect(result.body, `${role} on a route for ${need}`).toEqual({ ok: true, uid: user.uid });
          expect(reached.map((call) => call.user), `${role} on a route for ${need}`).toEqual([user]);
        }
      }
    });

    it.each(SIGN_INS)("holds each of them to its role all the same when the token %s", async (_label, firebase) => {
      for (const [role, claimsOf] of CALLERS) {
        stub.claims = claimsOf({ firebase });
        for (const need of (["admin", "active", "pledge"] as const).filter((candidate) => candidate !== role)) {
          const { handler, reached } = route(need);
          const refused = await send(handler);
          expect(refused.status, `${role} on a route for ${need}`).toBe(403);
          expect(refused.body, `${role} on a route for ${need}`).toEqual({ error: "You don't have permission to do that.", code: "forbidden" });
          expect(reached).toEqual([]);
        }
      }
    });

    it("never answers mfa_required, for reads or writes, for any role", async () => {
      for (const [role, claimsOf] of CALLERS) {
        stub.claims = claimsOf();
        const { handler, reached } = route(role);
        for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
          const result = await send(handler, method);
          expect({ role, method, status: result.status }).toEqual({ role, method, status: 200 });
          expect(result.body.code).not.toBe("mfa_required");
        }
        expect(reached).toHaveLength(5);
      }
    });

    it("has no refusal that asks for a second factor, whatever is wrong with the token", async () => {
      const wrong: Array<Record<string, unknown>> = [
        pledgeClaims({ auth_time: (NOW - 13 * HOUR) / 1000 }),
        pledgeClaims({ email_verified: false }),
        pledgeClaims({ role: "viewer" }),
        pledgeClaims({ email: "someone.else@uci.edu" }),
        activeClaims({ issued: undefined }),
        adminClaims({ email: "former.chair@uci.edu" }),
        pledgeClaims({ ...TEMP }),
        activeClaims(issued(TIMING.temporaryPasswordMs + SECOND)),
      ];
      const codes = new Set<string>();
      for (const claims of wrong) {
        for (const firebase of [PASSWORD_ONLY, undefined, {}, WITH_SECOND_FACTOR]) {
          stub.claims = { ...claims, firebase };
          for (const need of ["any", "admin", "active", "pledge"] as const) {
            const { handler, reached } = route(need);
            const result = await send(handler, "POST");
            expect(result.status).toBeGreaterThanOrEqual(401);
            expect(result.body.code).not.toBe("mfa_required");
            expect(result.body.error).not.toMatch(/two-step|second factor|verification|passcode|authenticator|duo/i);
            expect(reached).toEqual([]);
            codes.add(result.body.code);
          }
        }
      }
      // Each is refused for what is wrong with it, with or without a second factor on the sign-in.
      expect([...codes].sort()).toEqual([
        "email_not_allowed",
        "email_unverified",
        "forbidden",
        "no_role",
        "password_change_required",
        "session_expired",
        "temporary_password_expired",
      ]);
    });

    it("runs the handler as the user in the token", async () => {
      const { handler, reached } = route("pledge");
      const result = await send(handler);
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ ok: true, uid: "pledge1" });
      expect(reached).toEqual([{ user: { uid: "pledge1", email: "avery.chen@uci.edu", role: "pledge", signedInAtMs: SIGNED_IN_AT_MS }, nowMs: NOW, body: undefined }]);
    });

    it("runs an admin route for an allow-listed admin", async () => {
      stub.claims = adminClaims();
      const { handler, reached } = route("admin");
      expect((await send(handler, "POST")).status).toBe(200);
      expect(reached).toEqual([{ user: { uid: "admin1", email: "chair.one@uci.edu", role: "admin", signedInAtMs: SIGNED_IN_AT_MS }, nowMs: NOW, body: {} }]);
    });

    it("tells the handler when the person signed in, from the token's auth_time in seconds", async () => {
      for (const msAgo of [60_000, HOUR, TIMING.maxSessionAgeMs]) {
        stub.claims = pledgeClaims({ auth_time: (NOW - msAgo) / SECOND });
        const { handler, reached } = route("pledge");
        expect((await send(handler)).status).toBe(200);
        expect(reached.map((call) => call.user.signedInAtMs)).toEqual([NOW - msAgo]);
      }
    });
  });

  describe("session age", () => {
    it("refuses a sign-in that is 13 hours old with 401 session_expired, before the handler runs", async () => {
      stub.claims = pledgeClaims({ auth_time: (NOW - 13 * HOUR) / 1000 });
      for (const role of ["any", "pledge", "admin"] as const) {
        const { handler, reached } = route(role);
        const result = await send(handler);
        expect(result.status).toBe(401);
        expect(result.body).toEqual({ error: "Your session has expired. Sign in again.", code: "session_expired" });
        expect(reached).toEqual([]);
      }
    });

    it("refuses it for an admin too, and whatever else is wrong with the token", async () => {
      const old = (NOW - 13 * HOUR) / 1000;
      for (const claims of [
        adminClaims({ auth_time: old }),
        activeClaims({ auth_time: old }),
        pledgeClaims({ auth_time: old, email: "avery.chen@gmail.com" }),
        adminClaims({ auth_time: old, email: "former.chair@uci.edu" }),
        pledgeClaims({ auth_time: undefined }),
      ]) {
        stub.claims = claims;
        const { handler, reached } = route("any");
        const result = await send(handler);
        expect({ status: result.status, code: result.body.code }).toEqual({ status: 401, code: "session_expired" });
        expect(reached).toEqual([]);
      }
    });

    it("admits a sign-in exactly 12 hours old and refuses it one millisecond later", async () => {
      stub.claims = pledgeClaims({ auth_time: (NOW - TIMING.maxSessionAgeMs) / 1000 });
      const { handler, reached } = route("pledge");
      expect((await send(handler)).status).toBe(200);

      vi.setSystemTime(NOW + 1);
      const late = await send(handler);
      expect({ status: late.status, code: late.body.code }).toEqual({ status: 401, code: "session_expired" });
      expect(reached).toHaveLength(1);
    });

    it("judges a request by when it arrived, not by when its token finished being verified", async () => {
      // The sign-in turns 12 hours old as this request arrives; verifying the token then takes five seconds.
      stub.claims = pledgeClaims({ auth_time: (NOW - TIMING.maxSessionAgeMs) / 1000 });
      stub.whileVerifying = () => vi.setSystemTime(NOW + 5_000);
      const { handler, reached } = route("pledge");
      expect((await send(handler)).status).toBe(200);
      expect(reached.map((call) => call.nowMs)).toEqual([NOW]);
      expect(Date.now()).toBe(NOW + 5_000);
    });
  });

  describe("pledge email domain", () => {
    it.each(["avery.chen@gmail.com", "avery.chen@ics.uci.edu", "avery.chen@uci.edu.evil.example"])(
      "refuses a pledge whose email is %s with 403 email_not_allowed, before the handler runs",
      async (email) => {
        stub.claims = pledgeClaims({ email });
        for (const role of ["any", "pledge"] as const) {
          const { handler, reached } = route(role);
          const result = await send(handler);
          expect(result.status).toBe(403);
          expect(result.body).toEqual({ error: "This account doesn't have access to the portal.", code: "email_not_allowed" });
          expect(reached).toEqual([]);
        }
      },
    );
  });

  describe("admin allow-list", () => {
    it("refuses an admin claim that is not on the list with 403, on every kind of route, before the handler runs", async () => {
      stub.claims = adminClaims({ uid: "rogue", email: "former.chair@uci.edu" });
      for (const role of ["any", "admin", "pledge"] as const) {
        const { handler, reached } = route(role);
        const result = await send(handler);
        expect(result.status).toBe(403);
        expect(result.body).toEqual({ error: "This account doesn't have access to the portal.", code: "forbidden" });
        expect(reached).toEqual([]);
      }
    });

    it("refuses an admin the moment their address is taken off the list, and admits them again when it is put back", async () => {
      stub.claims = adminClaims({ email: "chair.two@uci.edu" });
      const { handler, reached } = route("admin");
      expect((await send(handler)).status).toBe(200);

      const removed = stub.adminEmails.splice(1, 1);
      try {
        const result = await send(handler);
        expect({ status: result.status, code: result.body.code }).toEqual({ status: 403, code: "forbidden" });
      } finally {
        stub.adminEmails.push(...removed);
      }
      expect((await send(handler)).status).toBe(200);
      expect(reached).toHaveLength(2);
    });

    it("refuses a pledge on an admin route", async () => {
      const { handler, reached } = route("admin");
      const result = await send(handler, "POST");
      expect(result.status).toBe(403);
      expect(result.body).toEqual({ error: "You don't have permission to do that.", code: "forbidden" });
      expect(reached).toEqual([]);
    });

    it("refuses an admin on a pledge route", async () => {
      stub.claims = adminClaims();
      const { handler, reached } = route("pledge");
      const result = await send(handler);
      expect({ status: result.status, code: result.body.code }).toEqual({ status: 403, code: "forbidden" });
      expect(reached).toEqual([]);
    });
  });

  // The emulator-backed tests run every review route with a real active's token, but never
  // with the issued address required. That is checked here.
  describe("active members", () => {
    it("runs a route for actives as the active in the token", async () => {
      stub.claims = activeClaims();
      const { handler, reached } = route("active");
      const result = await send(handler);
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ ok: true, uid: "active1" });
      expect(reached).toEqual([{ user: { uid: "active1", email: "priya.shah@uci.edu", role: "active", signedInAtMs: SIGNED_IN_AT_MS }, nowMs: NOW, body: undefined }]);
    });

    it("lets an active onto a route every role shares, and still as an active", async () => {
      stub.claims = activeClaims();
      const { handler, reached } = route("any");
      expect((await send(handler, "POST")).status).toBe(200);
      expect(reached.map((call) => call.user.role)).toEqual(["active"]);
    });

    it.each(["admin", "pledge"] as const)("refuses an active on a route for the %s role, for every method, before the handler runs", async (role) => {
      stub.claims = activeClaims();
      const { handler, reached } = route(role);
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
        const result = await send(handler, method);
        expect(result.status).toBe(403);
        expect(result.body).toEqual({ error: "You don't have permission to do that.", code: "forbidden" });
      }
      expect(reached).toEqual([]);
    });

    it("refuses a pledge and an allow-listed admin on a route for actives, before the handler runs", async () => {
      const { handler, reached } = route("active");
      for (const claims of [pledgeClaims(), adminClaims()]) {
        stub.claims = claims;
        const result = await send(handler);
        expect(result.status).toBe(403);
        expect(result.body).toEqual({ error: "You don't have permission to do that.", code: "forbidden" });
      }
      expect(reached).toEqual([]);
    });

    it.each<[string, Record<string, unknown>]>([
      ["an address outside UCI", { email: "priya.shah@gmail.com", issued: "priya.shah@gmail.com" }],
      ["a sign-in moved to another UCI mailbox", { email: "someone.else@uci.edu" }],
      ["a sign-in moved to an admin's mailbox", { email: "chair.one@uci.edu" }],
      ["no record of the address it was issued to", { issued: undefined }],
      ["an issued address that is not text", { issued: ["priya.shah@uci.edu"] }],
    ])("refuses an active with %s with 403 email_not_allowed, before the handler runs", async (_label, overrides) => {
      stub.claims = activeClaims(overrides);
      for (const role of ["any", "active", "admin"] as const) {
        const { handler, reached } = route(role);
        const result = await send(handler);
        expect(result.status).toBe(403);
        expect(result.body).toEqual({ error: "This account doesn't have access to the portal.", code: "email_not_allowed" });
        expect(reached).toEqual([]);
      }
    });

    it("does not make an active an admin because their own, issued address is on the admin list", async () => {
      stub.claims = activeClaims({ email: "chair.one@uci.edu", issued: "chair.one@uci.edu" });
      const admins = route("admin");
      const refusal = await send(admins.handler, "DELETE");
      expect({ status: refusal.status, code: refusal.body.code }).toEqual({ status: 403, code: "forbidden" });
      expect(admins.reached).toEqual([]);

      const actives = route("active");
      expect((await send(actives.handler)).status).toBe(200);
      expect(actives.reached.map((call) => call.user)).toEqual([{ uid: "active1", email: "chair.one@uci.edu", role: "active", signedInAtMs: SIGNED_IN_AT_MS }]);
    });

    it("refuses an active whose sign-in is 13 hours old with 401 session_expired", async () => {
      stub.claims = activeClaims({ auth_time: (NOW - 13 * HOUR) / 1000 });
      const { handler, reached } = route("active");
      const result = await send(handler);
      expect(result.status).toBe(401);
      expect(result.body).toEqual({ error: "Your session has expired. Sign in again.", code: "session_expired" });
      expect(reached).toEqual([]);
    });

    it("asks for an active's revoked or disabled account to be refused, as for everyone", async () => {
      stub.claims = activeClaims();
      const { handler } = route("active");
      await send(handler);
      expect(stub.verified).toEqual([[TOKEN, true]]);
      stub.failure = { code: "auth/user-disabled" };
      const disabled = await send(handler);
      expect({ status: disabled.status, code: disabled.body.code }).toEqual({ status: 401, code: "account_disabled" });
    });
  });

  // The emulator-backed tests take an account from a temporary password to its own, with the
  // emulators' clock and without the issued address required. Here the one thing such an
  // account may do is checked on the live site, to the millisecond: a route marked for choosing
  // a password, and only for an account whose token says it is still on a temporary one.
  describe("an account still on a temporary password", () => {
    const CHANGE_REQUIRED = { error: "Choose your own password to continue.", code: "password_change_required" };
    const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
    const KINDS_OF_ROUTE = ["any", "pledge", "active", "admin"] as const;

    const temporary: ReadonlyArray<[string, () => Record<string, unknown>, AuthedUser]> = [
      ["a pledge", () => pledgeClaims({ ...TEMP }), { uid: "pledge1", email: "avery.chen@uci.edu", role: "pledge", signedInAtMs: SIGNED_IN_AT_MS }],
      ["an active", () => activeClaims({ ...TEMP }), { uid: "active1", email: "priya.shah@uci.edu", role: "active", signedInAtMs: SIGNED_IN_AT_MS }],
    ];

    it.each(temporary)("lets %s through a route for choosing a password, as themselves", async (_label, claims, user) => {
      stub.claims = claims();
      const { handler, reached } = route("any", { passwordSetup: true });
      const result = await send(handler, "POST");
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ ok: true, uid: user.uid });
      // The handler is told who it is and nothing about the password.
      expect(reached).toEqual([{ user, nowMs: NOW, body: {} }]);
    });

    it.each(temporary)("refuses %s on every other kind of route, for every method, before the handler runs", async (_label, claims) => {
      stub.claims = claims();
      for (const role of KINDS_OF_ROUTE) {
        for (const more of [{}, { passwordSetup: false }, { alwaysAllowed: true }, { countsAsWrite: false }]) {
          const { handler, reached } = route(role, more);
          for (const method of METHODS) {
            const result = await send(handler, method);
            expect(result.status, `${method} on a route for ${role}`).toBe(403);
            expect(result.body, `${method} on a route for ${role}`).toEqual(CHANGE_REQUIRED);
            expect(result.headers.get("cache-control")).toBe("no-store");
            expect(result.headers.get("x-content-type-options")).toBe("nosniff");
          }
          expect(reached, `a route for ${role}`).toEqual([]);
        }
      }
    });

    // It is the password that is missing. Whatever the sign-in says of a second factor, and
    // whoever the token says the account is, nothing else opens until it is replaced.
    it("refuses an admin whose token carries the flag in the same way, and a token that carries a second factor", async () => {
      for (const claims of [adminClaims({ ...TEMP }), pledgeClaims({ ...TEMP, firebase: WITH_SECOND_FACTOR }), activeClaims({ ...TEMP, firebase: undefined })]) {
        stub.claims = claims;
        for (const role of KINDS_OF_ROUTE) {
          const { handler, reached } = route(role);
          const result = await send(handler);
          expect(result.status).toBe(403);
          expect(result.body).toEqual(CHANGE_REQUIRED);
          expect(reached).toEqual([]);
        }
      }
    });

    // For everyone else this route is gated like any other: by sign-in and by role.
    it("treats everyone else on that route as on any other", async () => {
      for (const claims of [
        pledgeClaims(),
        activeClaims(),
        adminClaims(),
        // A flag that is not exactly true is no flag at all.
        pledgeClaims({ temp: "true" }),
        activeClaims({ temp: 1 }),
        pledgeClaims({ temp: false }),
      ]) {
        stub.claims = claims;
        const { handler, reached } = route("any", { passwordSetup: true });
        for (const method of ["GET", "POST"] as const) {
          const result = await send(handler, method);
          expect(result.status, JSON.stringify(claims)).toBe(200);
        }
        expect(reached.map((call) => call.user.uid)).toEqual([claims.uid, claims.uid]);
      }
    });

    it("holds a route for choosing a password to its role all the same", async () => {
      stub.claims = pledgeClaims({ ...TEMP });
      for (const role of ["admin", "active"] as const) {
        const { handler, reached } = route(role, { passwordSetup: true });
        const result = await send(handler, "POST");
        expect(result.status).toBe(403);
        expect(result.body).toEqual({ error: "You don't have permission to do that.", code: "forbidden" });
        expect(reached).toEqual([]);
      }
      const own = route("pledge", { passwordSetup: true });
      expect((await send(own.handler, "POST")).status).toBe(200);
    });

    it.each<[string, Record<string, unknown>, number, string]>([
      ["a sign-in that is 13 hours old", { auth_time: (NOW - 13 * HOUR) / 1000 }, 401, "session_expired"],
      ["an address outside UCI", { email: "avery.chen@gmail.com", issued: "avery.chen@gmail.com" }, 403, "email_not_allowed"],
      ["a sign-in moved to another UCI mailbox", { email: "someone.else@uci.edu" }, 403, "email_not_allowed"],
      ["no record of the address it was issued to", { issued: undefined }, 403, "email_not_allowed"],
      ["an email that is not verified", { email_verified: false }, 403, "email_unverified"],
      ["a role the portal does not know", { role: "viewer" }, 403, "no_role"],
    ])("gives no way in through that route to an account with %s", async (_label, overrides, status, code) => {
      // Whether the temporary password is still good, has run out, or never said when it was issued:
      // each of these is what is wrong with the account first.
      for (const password of [TEMP, issued(TIMING.temporaryPasswordMs + SECOND), { temp: true }]) {
        stub.claims = pledgeClaims({ ...password, ...overrides });
        for (const more of [{ passwordSetup: true }, {}]) {
          const { handler, reached } = route("any", more);
          const result = await send(handler, "POST");
          expect({ status: result.status, code: result.body.code }).toEqual({ status, code });
          expect(reached).toEqual([]);
        }
      }
    });

    it("gives no way in to an admin claim that is not on the list, temporary password or not", async () => {
      stub.claims = adminClaims({ ...TEMP, uid: "rogue", email: "former.chair@uci.edu" });
      for (const more of [{ passwordSetup: true }, {}]) {
        const { handler, reached } = route("any", more);
        const result = await send(handler, "POST");
        expect(result.status).toBe(403);
        expect(result.body).toEqual({ error: "This account doesn't have access to the portal.", code: "forbidden" });
        expect(reached).toEqual([]);
      }
    });

    it("still refuses a revoked or disabled account there, and still checks for both", async () => {
      stub.claims = pledgeClaims({ ...TEMP });
      const { handler, reached } = route("any", { passwordSetup: true });
      for (const [thrown, code] of [
        ["auth/id-token-revoked", "session_revoked"],
        ["auth/user-disabled", "account_disabled"],
        ["auth/user-not-found", "account_removed"],
      ] as const) {
        stub.failure = { code: thrown };
        const result = await send(handler, "POST");
        expect({ status: result.status, code: result.body.code }).toEqual({ status: 401, code });
      }
      expect(reached).toEqual([]);
      expect(stub.verified).toEqual([
        [TOKEN, true],
        [TOKEN, true],
        [TOKEN, true],
      ]);
    });

    it("holds that route to the ceiling for changes: 30 a minute, and the 31st is refused", async () => {
      stub.claims = pledgeClaims({ ...TEMP });
      const { handler, reached } = route("any", { passwordSetup: true });
      for (let index = 0; index < RATE_LIMITS.writesPerMinute; index += 1) expect((await send(handler, "POST")).status).toBe(200);
      const refused = await send(handler, "POST");
      expect({ status: refused.status, code: refused.body.code }).toEqual({ status: 429, code: "rate_limited" });
      expect(reached).toHaveLength(RATE_LIMITS.writesPerMinute);
    });

    it("does not count the requests it refuses against the account", async () => {
      stub.claims = pledgeClaims({ ...TEMP });
      const elsewhere = route("any");
      for (let index = 0; index < RATE_LIMITS.writesPerMinute + 5; index += 1) expect((await send(elsewhere.handler, "POST")).status).toBe(403);
      // The whole allowance for changes is still there for choosing the password.
      const { handler } = route("any", { passwordSetup: true });
      expect((await send(handler, "POST")).status).toBe(200);
    });

    // A temporary password is good for three days from when a chair issued it. After that
    // the account is refused everywhere, the route for replacing it included.
    describe("three days after it was issued", () => {
      const LIMIT = TIMING.temporaryPasswordMs;
      const choosing = () => route("any", { passwordSetup: true });

      it("lets the account choose a password exactly 72 hours on, and refuses it one second later, and one millisecond later", async () => {
        expect(LIMIT).toBe(72 * HOUR);
        stub.claims = pledgeClaims({ ...issued(LIMIT) });
        const { handler, reached } = choosing();
        expect((await send(handler, "POST")).status).toBe(200);

        // The same token, a millisecond on.
        vi.setSystemTime(NOW + 1);
        const late = await send(handler, "POST");
        expect(late.status).toBe(403);
        expect(late.body).toEqual(EXPIRED);

        // And one issued a second earlier, at the first moment.
        vi.setSystemTime(NOW);
        stub.claims = pledgeClaims({ ...issued(LIMIT + SECOND) });
        const later = await send(handler, "POST");
        expect(later.status).toBe(403);
        expect(later.body).toEqual(EXPIRED);
        expect(reached).toHaveLength(1);
      });

      it.each(temporary)("refuses %s on every kind of route, for every method, before the handler runs", async (_label, claims) => {
        stub.claims = { ...claims(), ...issued(LIMIT + SECOND) };
        for (const role of KINDS_OF_ROUTE) {
          for (const more of [{}, { passwordSetup: true }, { passwordSetup: false }, { alwaysAllowed: true }, { countsAsWrite: false }]) {
            const { handler, reached } = route(role, more);
            for (const method of METHODS) {
              const result = await send(handler, method);
              expect(result.status, `${method} on a route for ${role}`).toBe(403);
              expect(result.body, `${method} on a route for ${role}`).toEqual(EXPIRED);
              expect(result.headers.get("cache-control")).toBe("no-store");
              expect(result.headers.get("x-content-type-options")).toBe("nosniff");
            }
            expect(reached, `a route for ${role}`).toEqual([]);
          }
        }
      });

      it("refuses an admin whose token carries the flag as well, however long ago the password ran out", async () => {
        for (const claims of [pledgeClaims(issued(LIMIT + SECOND)), activeClaims(issued(LIMIT + HOUR)), adminClaims(issued(30 * 24 * HOUR))]) {
          stub.claims = claims;
          for (const more of [{}, { passwordSetup: true }]) {
            const { handler, reached } = route("any", more);
            const result = await send(handler, "POST");
            expect(result.status).toBe(403);
            expect(result.body).toEqual(EXPIRED);
            expect(reached).toEqual([]);
          }
        }
      });

      it.each<[string, unknown]>([
        ["missing, as on an account flagged before the limit existed", undefined],
        ["null", null],
        ["a numeric string", String((NOW - HOUR) / SECOND)],
        ["a date string", new Date(NOW - HOUR).toISOString()],
        ["an object", { seconds: (NOW - HOUR) / SECOND }],
        ["true", true],
        ["nought", 0],
        ["a negative number", -5],
      ])("counts the password as expired when the time it was issued is %s", async (_label, tempAt) => {
        stub.claims = pledgeClaims({ temp: true, tempAt });
        for (const more of [{ passwordSetup: true }, {}]) {
          const { handler, reached } = route("any", more);
          const result = await send(handler, "POST");
          expect(result.status).toBe(403);
          expect(result.body).toEqual(EXPIRED);
          expect(reached).toEqual([]);
        }
      });

      // Servers' clocks differ by a little, so a time up to five minutes ahead is taken as now.
      // Anything further ahead is not a time the portal wrote, and must not mean "never expires".
      it("accepts a time exactly five minutes ahead of the clock, and refuses one a second, or a millisecond, further", async () => {
        const { handler, reached } = choosing();
        stub.claims = pledgeClaims({ ...issued(-5 * MINUTE) });
        expect((await send(handler, "POST")).status).toBe(200);
        expect((await send(route("any").handler, "POST")).body).toEqual({ error: "Choose your own password to continue.", code: "password_change_required" });

        // The clock a millisecond further behind.
        vi.setSystemTime(NOW - 1);
        expect((await send(handler, "POST")).body).toEqual(EXPIRED);
        vi.setSystemTime(NOW);

        for (const ahead of [5 * MINUTE + SECOND, HOUR, 365 * 24 * HOUR]) {
          stub.claims = pledgeClaims({ ...issued(-ahead) });
          for (const target of [handler, route("any").handler]) {
            const result = await send(target, "POST");
            expect(result.status, `${ahead} ms ahead`).toBe(403);
            expect(result.body, `${ahead} ms ahead`).toEqual(EXPIRED);
          }
        }
        expect(reached).toHaveLength(1);
      });

      it("counts a time written in milliseconds by mistake as expired", async () => {
        for (const tempAt of [NOW, NOW - HOUR, NOW - 60_000]) {
          stub.claims = pledgeClaims({ temp: true, tempAt });
          const { handler, reached } = choosing();
          const result = await send(handler, "POST");
          expect(result.status).toBe(403);
          expect(result.body).toEqual(EXPIRED);
          expect(reached).toEqual([]);
        }
      });

      it("judges it by when the request arrived, not by when its token finished being verified", async () => {
        // The three days are up as this request arrives; verifying the token then takes five seconds.
        stub.claims = pledgeClaims({ ...issued(LIMIT) });
        stub.whileVerifying = () => vi.setSystemTime(NOW + 5_000);
        const { handler, reached } = choosing();
        expect((await send(handler, "POST")).status).toBe(200);
        expect(reached.map((call) => call.nowMs)).toEqual([NOW]);
      });

      it("does not count the requests it refuses against the account", async () => {
        stub.claims = pledgeClaims({ ...issued(LIMIT + SECOND) });
        const { handler } = choosing();
        for (let index = 0; index < RATE_LIMITS.writesPerMinute + 5; index += 1) expect((await send(handler, "POST")).status).toBe(403);
        // Given a new temporary password, the account has its whole allowance to choose its own with.
        stub.claims = pledgeClaims({ ...issued(MINUTE) });
        expect((await send(handler, "POST")).status).toBe(200);
      });

      describe("order of checks", () => {
        const RAN_OUT = issued(LIMIT + SECOND);

        it("reports a sign-in more than 12 hours old first, with 401", async () => {
          stub.claims = pledgeClaims({ ...RAN_OUT, auth_time: (NOW - 13 * HOUR) / SECOND });
          for (const more of [{ passwordSetup: true }, {}]) {
            const result = await send(route("any", more).handler, "POST");
            expect(result.status).toBe(401);
            expect(result.body).toEqual(SESSION_EXPIRED);
          }
        });

        it("says the password has expired before it asks for a new one, or says the route is somebody else's", async () => {
          for (const claims of [pledgeClaims(RAN_OUT), activeClaims(RAN_OUT), adminClaims(RAN_OUT), pledgeClaims({ ...RAN_OUT, firebase: WITH_SECOND_FACTOR })]) {
            stub.claims = claims;
            for (const role of KINDS_OF_ROUTE) {
              for (const more of [{}, { passwordSetup: true }]) {
                const { handler, reached } = route(role, more);
                const result = await send(handler, "POST");
                expect(result.status, `a route for ${role}`).toBe(403);
                expect(result.body, `a route for ${role}`).toEqual(EXPIRED);
                expect(reached).toEqual([]);
              }
            }
          }
        });

        it("says so with 403 before it would turn away a sign-in too old to choose a password with", async () => {
          for (const msAgo of [TIMING.passwordSetupMs + SECOND, HOUR, TIMING.maxSessionAgeMs]) {
            stub.claims = pledgeClaims({ ...RAN_OUT, auth_time: (NOW - msAgo) / SECOND });
            const result = await send(choosing().handler, "POST");
            expect(result.status, `${msAgo} ms`).toBe(403);
            expect(result.body, `${msAgo} ms`).toEqual(EXPIRED);
          }
        });
      });
    });

    // Choosing the password has to follow the sign-in closely, so a screen left open on a
    // shared computer is no use to the next person along.
    describe("fifteen minutes after signing in", () => {
      const LIMIT = TIMING.passwordSetupMs;
      const signedIn = (msAgo: number): number => (NOW - msAgo) / SECOND;

      it("lets the account choose a password on a sign-in exactly 15 minutes old, and answers 401 a second later, and a millisecond later", async () => {
        expect(LIMIT).toBe(15 * MINUTE);
        for (const [, claims, user] of temporary) {
          stub.claims = { ...claims(), auth_time: signedIn(LIMIT) };
          const { handler, reached } = route("any", { passwordSetup: true });
          expect((await send(handler, "POST")).status).toBe(200);

          vi.setSystemTime(NOW + 1);
          const late = await send(handler, "POST");
          expect(late.status).toBe(401);
          expect(late.body).toEqual(SESSION_EXPIRED);
          vi.setSystemTime(NOW);

          stub.claims = { ...claims(), auth_time: signedIn(LIMIT + SECOND) };
          const later = await send(handler, "POST");
          expect(later.status).toBe(401);
          expect(later.body).toEqual(SESSION_EXPIRED);
          // Signed in exactly fifteen minutes before, not the minute the default claims say.
          expect(reached.map((call) => call.user)).toEqual([{ ...user, signedInAtMs: NOW - LIMIT }]);
          resetRateLimits();
        }
      });

      it("is only about choosing a password: an older sign-in is still told to choose one on every other route", async () => {
        for (const msAgo of [LIMIT + SECOND, HOUR, 11 * HOUR, TIMING.maxSessionAgeMs]) {
          stub.claims = pledgeClaims({ ...TEMP, auth_time: signedIn(msAgo) });
          for (const role of KINDS_OF_ROUTE) {
            const { handler, reached } = route(role);
            const result = await send(handler);
            expect(result.status, `${msAgo} ms`).toBe(403);
            expect(result.body, `${msAgo} ms`).toEqual(CHANGE_REQUIRED);
            expect(reached).toEqual([]);
          }
        }
      });

      it("does not hold an account with its own password to it, on that route or any other", async () => {
        for (const msAgo of [LIMIT + SECOND, HOUR, 11 * HOUR, TIMING.maxSessionAgeMs]) {
          for (const claims of [
            pledgeClaims({ auth_time: signedIn(msAgo) }),
            activeClaims({ auth_time: signedIn(msAgo) }),
            adminClaims({ auth_time: signedIn(msAgo) }),
            // A time left over from a temporary password long since replaced means nothing without the flag.
            pledgeClaims({ auth_time: signedIn(msAgo), tempAt: (NOW - 30 * 24 * HOUR) / SECOND }),
            pledgeClaims({ auth_time: signedIn(msAgo), temp: false, tempAt: "yesterday" }),
            activeClaims({ auth_time: signedIn(msAgo), temp: "true", tempAt: NOW }),
          ]) {
            stub.claims = claims;
            for (const more of [{ passwordSetup: true }, {}]) {
              const { handler, reached } = route("any", more);
              expect((await send(handler, "POST")).status, JSON.stringify(claims)).toBe(200);
              expect(reached.map((call) => call.user.uid)).toEqual([claims.uid]);
            }
            resetRateLimits();
          }
        }
      });

      it("turns the sign-in away before it says the route is somebody else's, and after it has checked the address", async () => {
        stub.claims = pledgeClaims({ ...TEMP, auth_time: signedIn(LIMIT + SECOND) });
        for (const role of ["admin", "active"] as const) {
          const result = await send(route(role, { passwordSetup: true }).handler, "POST");
          expect(result.status).toBe(401);
          expect(result.body).toEqual(SESSION_EXPIRED);
        }
        stub.claims = pledgeClaims({ ...TEMP, auth_time: signedIn(LIMIT + SECOND), email: "someone.else@uci.edu" });
        const moved = await send(route("any", { passwordSetup: true }).handler, "POST");
        expect({ status: moved.status, code: moved.body.code }).toEqual({ status: 403, code: "email_not_allowed" });
      });

      it("judges the sign-in by when the request arrived", async () => {
        stub.claims = pledgeClaims({ ...TEMP, auth_time: signedIn(LIMIT) });
        stub.whileVerifying = () => vi.setSystemTime(NOW + 5_000);
        const { handler, reached } = route("any", { passwordSetup: true });
        expect((await send(handler, "POST")).status).toBe(200);
        expect(reached.map((call) => call.nowMs)).toEqual([NOW]);
      });
    });
  });

  describe("token verification", () => {
    it("always asks for revoked and disabled accounts to be refused", async () => {
      const { handler } = route("any");
      await send(handler);
      await send(handler, "POST");
      expect(stub.verified).toEqual([
        [TOKEN, true],
        [TOKEN, true],
      ]);
    });

    // A refusal that says "signed out" makes the browser drop the session, so it is
    // only given when the token really is no good. A check that could not be
    // completed is a temporary fault and must leave the session alone.
    it.each<[string, string, string]>([
      ["auth/argument-error", "unauthenticated", "Sign in to continue."],
      ["auth/id-token-expired", "token_expired", "Your session has expired."],
      ["auth/id-token-revoked", "session_revoked", "Your session has ended. Sign in again."],
      ["auth/user-disabled", "account_disabled", "This account has been disabled."],
      ["auth/user-not-found", "account_removed", "This account no longer exists."],
    ])("answers 401 when the verifier says %s", async (thrown, code, error) => {
      stub.failure = Object.assign(new Error("verification failed"), { code: thrown });
      const { handler, reached } = route("any");
      const result = await send(handler);
      expect(result.status).toBe(401);
      expect(result.body).toEqual({ error, code });
      expect(reached).toEqual([]);
    });

    it.each<[string, unknown]>([
      ["a network failure", Object.assign(new Error("socket hang up"), { code: "app/network-error" })],
      ["a failure to fetch Google's keys", Object.assign(new Error("keys"), { code: "auth/internal-error" })],
      ["an error with no code", new Error("something else")],
      ["a thrown string", "boom"],
    ])("answers 503, not 401, when the check itself fails with %s", async (_label, thrown) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      stub.failure = thrown;
      const { handler, reached } = route("any");
      const result = await send(handler);
      expect(result.status).toBe(503);
      expect(result.body).toEqual({
        error: "We couldn't check your sign-in just now. Try again in a moment.",
        code: "auth_unavailable",
      });
      expect(reached).toEqual([]);
      // What went wrong is logged for whoever runs the site, without the token.
      expect(logged).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(logged.mock.calls)).not.toContain(TOKEN);
      logged.mockRestore();
    });

    it("does not call the verifier, or the handler, without a bearer token", async () => {
      const { handler, reached } = route("any");
      const result = await send(handler, "GET", null);
      expect(result.status).toBe(401);
      expect(result.body).toEqual({ error: "Sign in to continue.", code: "unauthenticated" });
      expect(stub.verified).toEqual([]);
      expect(reached).toEqual([]);
    });

    it("answers every refusal as uncacheable JSON with just a message and a code", async () => {
      const refusals: Array<Record<string, unknown>> = [
        pledgeClaims({ auth_time: (NOW - 13 * HOUR) / 1000 }),
        pledgeClaims({ email: "avery.chen@gmail.com" }),
        adminClaims({ email: "former.chair@uci.edu" }),
      ];
      for (const claims of refusals) {
        stub.claims = claims;
        const result = await send(route("any").handler);
        expect(Object.keys(result.body).sort()).toEqual(["code", "error"]);
        expect(result.headers.get("cache-control")).toBe("no-store");
        expect(result.headers.get("x-content-type-options")).toBe("nosniff");
      }
    });
  });

  describe("rate limit", () => {
    const statuses = async (handler: ReturnType<typeof route>["handler"], method: Method, count: number): Promise<number[]> => {
      const seen: number[] = [];
      for (let index = 0; index < count; index += 1) seen.push((await send(handler, method)).status);
      return seen;
    };

    it("allows 120 reads a minute, refuses the next, and starts again 60 seconds after the first", async () => {
      const { handler, reached } = route("pledge");
      expect(new Set(await statuses(handler, "GET", RATE_LIMITS.perMinute))).toEqual(new Set([200]));
      const refused = await send(handler);
      expect(refused.status).toBe(429);
      expect(refused.body).toEqual({ error: "Too many requests. Wait a minute and try again.", code: "rate_limited" });
      expect(reached).toHaveLength(RATE_LIMITS.perMinute);

      vi.setSystemTime(NOW + 59_999);
      expect((await send(handler)).status).toBe(429);
      vi.setSystemTime(NOW + 60_000);
      expect((await send(handler)).status).toBe(200);
    });

    it.each(["POST", "PUT", "PATCH", "DELETE"] as const)("counts %s as a write: 30 a minute, and the 31st is refused", async (method) => {
      const { handler, reached } = route("pledge");
      expect(new Set(await statuses(handler, method, RATE_LIMITS.writesPerMinute))).toEqual(new Set([200]));
      const refused = await send(handler, method);
      expect({ status: refused.status, code: refused.body.code }).toEqual({ status: 429, code: "rate_limited" });
      expect(reached).toHaveLength(RATE_LIMITS.writesPerMinute);

      vi.setSystemTime(NOW + 60_000);
      expect((await send(handler, method)).status).toBe(200);
    });

    it("does not count GET as a write: reads carry on after 30 of them", async () => {
      const { handler } = route("pledge");
      expect(new Set(await statuses(handler, "GET", RATE_LIMITS.writesPerMinute + 1))).toEqual(new Set([200]));
      // And the full write allowance is still there.
      expect(new Set(await statuses(handler, "POST", RATE_LIMITS.writesPerMinute))).toEqual(new Set([200]));
    });

    it("shares one allowance across every route and method an account calls", async () => {
      const first = route("pledge");
      const second = route("any");
      await statuses(first.handler, "POST", 10);
      await statuses(second.handler, "PUT", 10);
      await statuses(first.handler, "DELETE", 10);
      expect((await send(second.handler, "PATCH")).status).toBe(429);
    });

    it("keeps each account's count apart", async () => {
      const { handler } = route("any");
      await statuses(handler, "POST", RATE_LIMITS.writesPerMinute);
      expect((await send(handler, "POST")).status).toBe(429);

      stub.claims = pledgeClaims({ uid: "pledge2", email: "jordan.patel@uci.edu", issued: "jordan.patel@uci.edu" });
      expect((await send(handler, "POST")).status).toBe(200);
      stub.claims = adminClaims();
      expect((await send(handler, "POST")).status).toBe(200);
    });
  });
});

// ── The portal's own routes, as they are exported ────────────────────────────

type RealHandler = (request: Request, route: { params: Promise<Record<string, string>> }) => Promise<Response>;

interface RealRoute {
  /** For example "POST /admin/pledges/[uid]/temporary-password". */
  label: string;
  method: Method;
  handler: RealHandler;
  params: Record<string, string>;
}

const API_ROOT = fileURLToPath(new URL("../../../app/api/portal", import.meta.url));

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

/** Every handler under /api/portal, found on disk, so that a route added later is checked here too. */
async function realRoutes(): Promise<RealRoute[]> {
  const found: RealRoute[] = [];
  for (const file of routeFiles(API_ROOT).sort()) {
    const relative = path.relative(API_ROOT, path.dirname(file)).split(path.sep).join("/");
    const params = Object.fromEntries(
      relative
        .split("/")
        .filter((segment) => /^\[.+\]$/.test(segment))
        .map((segment) => [segment.slice(1, -1), "abc123"]),
    );
    const exported: Record<string, unknown> = await import(/* @vite-ignore */ file);
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
      const handler = exported[method];
      if (typeof handler === "function") found.push({ label: `${method} /${relative}`, method, handler: handler as RealHandler, params });
    }
  }
  return found;
}

const REAL_ROUTES = await realRoutes();
const CHOOSE_PASSWORD = "POST /password";
/** The one route that needs no sign-in: the code in a preview link is its credential. */
const REDEEM_PREVIEW = "POST /preview/redeem";
/** Every route a sign-in is judged on, which is every route but that one. */
const SIGNED_IN_ROUTES = REAL_ROUTES.filter((candidate) => candidate.label !== REDEEM_PREVIEW);

const sendTo = async (target: RealRoute): Promise<{ status: number; body: ApiErrorBody & Record<string, unknown> }> => {
  const response = await target.handler(request(target.method), { params: Promise.resolve(target.params) });
  return { status: response.status, body: (await response.json()) as ApiErrorBody & Record<string, unknown> };
};

// Every handler the portal has, called as each of the three roles with a token from a sign-in
// with an email and a password. What a handler then does is not looked at here: with nothing
// behind it to read from or write to, most can only fail. What is looked at is whether the
// request got past the gate, and that is told from the account's allowance of requests, which
// a request is counted against only once the gate has let it through.
describe("the portal's own routes on the live site, for a sign-in with an email and a password", () => {
  const ROLES = ["admin", "active", "pledge"] as const;
  type CallerRole = (typeof ROLES)[number];
  const CALLERS: Record<CallerRole, (overrides?: Record<string, unknown>) => Record<string, unknown>> = {
    admin: adminClaims,
    active: activeClaims,
    pledge: pledgeClaims,
  };
  /** The routes every role is let through to. Every other route is one role's alone. */
  const SHARED = ["GET /me", "POST /heartbeat", "POST /onboarding", "POST /password", "POST /sign-out"];
  /** Who a route is for, going by the folder it is in: /admin for admins, /review for actives. */
  const needOf = (label: string): "any" | "public" | CallerRole => {
    if (label === REDEEM_PREVIEW) return "public";
    const folder = label.slice(label.indexOf("/") + 1).split("/")[0];
    if (folder === "admin") return "admin";
    if (folder === "review") return "active";
    return SHARED.includes(label) ? "any" : "pledge";
  };
  const mayCall = (role: CallerRole, label: string): boolean => needOf(label) === "any" || needOf(label) === role;
  const NOT_YOURS = { error: "You don't have permission to do that.", code: "forbidden" };

  /**
   * How many of the account's requests for this minute have been used. The gate comes
   * before the count, so after one request this is 1 if the gate let it through and 0 if not.
   */
  const counted = (uid: string): number => {
    let left = 0;
    // A whole minute's worth is asked for: all of it is still there, or all but what was used.
    for (let index = 0; index < RATE_LIMITS.perMinute; index += 1) if (allowRequest(uid, NOW)) left += 1;
    return RATE_LIMITS.perMinute - left;
  };

  let muted: Array<{ mockRestore: () => void }> = [];

  beforeEach(() => {
    // A handler with nothing behind it fails, and says so in the log. That is not what is being looked at.
    muted = [vi.spyOn(console, "error").mockImplementation(() => undefined), vi.spyOn(console, "warn").mockImplementation(() => undefined)];
  });

  afterEach(() => {
    for (const spy of muted) spy.mockRestore();
  });

  it("are forty-nine, none of them for a second factor, and each one role's, everyone's, or the one that is anyone's", () => {
    const labels = REAL_ROUTES.map((candidate) => candidate.label);
    expect(labels).toHaveLength(49);
    expect(labels.filter((label) => /mfa|factor|totp|passcode|two-step|enrol/i.test(label))).toEqual([]);
    expect(labels).not.toContain("POST /admin/pledges/[uid]/reset-mfa");
    expect(labels).not.toContain("POST /admin/actives/[uid]/reset-mfa");
    expect(labels.filter((label) => needOf(label) === "any").sort()).toEqual(SHARED);
    expect(labels.filter((label) => needOf(label) === "active").sort()).toEqual(["GET /review/forms/[formId]", "GET /review/overview"]);
    expect(labels.filter((label) => needOf(label) === "pledge")).toHaveLength(6);
    expect(labels.filter((label) => needOf(label) === "admin")).toHaveLength(35);
    expect(labels).toEqual(
      expect.arrayContaining(["GET /admin/activity", "GET /admin/activity/[uid]", "GET /admin/activity/[uid]/sessions/[sessionId]"]),
    );
    expect(labels.filter((label) => needOf(label) === "public")).toEqual([REDEEM_PREVIEW]);
    expect(SIGNED_IN_ROUTES).toHaveLength(48);
  });

  // The one route open to anyone is reached with no token at all, and its requests are
  // counted against the caller's address and the route, never against an account.
  it("let the route for a preview link through with no sign-in, and count it against nobody's account", async () => {
    const redeem = REAL_ROUTES.find((candidate) => candidate.label === REDEEM_PREVIEW);
    if (!redeem) throw new Error(`${REDEEM_PREVIEW} was not found among the routes.`);
    resetRateLimits();
    stub.claims = pledgeClaims();
    stub.verified.length = 0;
    const anonymous = new Request("http://localhost/api/portal/preview/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "not-a-code" }),
    });
    const response = await redeem.handler(anonymous, { params: Promise.resolve({}) });
    // Judged on the code it sent, which is not one: the request got through the wrapper.
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "This preview link has expired or was already used. Go back to the People page and start the preview again.",
      code: "preview_code_invalid",
    });
    expect(stub.verified).toEqual([]);
    expect(counted("pledge1")).toBe(0);
    // With a token it is the same: the token is not looked at.
    resetRateLimits();
    expect((await sendTo(redeem)).status).toBe(404);
    expect(stub.verified).toEqual([]);
    expect(counted("pledge1")).toBe(0);
  });

  it("can tell a request the gate let through from one it did not", async () => {
    const me = REAL_ROUTES.find((candidate) => candidate.label === "GET /me");
    if (!me) throw new Error("GET /me was not found among the routes.");
    expect(counted("pledge1")).toBe(0);
    resetRateLimits();
    await sendTo(me);
    expect(counted("pledge1")).toBe(1);
    // Refused by the gate, for a sign-in that is too old: nothing is counted.
    resetRateLimits();
    stub.claims = pledgeClaims({ auth_time: (NOW - 13 * HOUR) / SECOND });
    expect((await sendTo(me)).body.code).toBe("session_expired");
    expect(counted("pledge1")).toBe(0);
  });

  it.each(SIGNED_IN_ROUTES)("$label lets it through for the role the route is for, and for no other", async (target) => {
    for (const role of ROLES) {
      // Whatever the token says of a second factor: nothing, as here, or that there was one.
      for (const firebase of [PASSWORD_ONLY, undefined, WITH_SECOND_FACTOR]) {
        resetRateLimits();
        stub.read.length = 0;
        stub.lookedUp.length = 0;
        stub.claims = CALLERS[role]({ firebase });
        const uid = String(stub.claims.uid);
        const result = await sendTo(target);
        const label = `${role}, with ${JSON.stringify(firebase)}`;

        expect(result.body.code, label).not.toBe("mfa_required");
        expect(JSON.stringify(result.body), label).not.toMatch(/two-step|second factor|verification|passcode|authenticator|duo/i);
        if (mayCall(role, target.label)) {
          expect(counted(uid), label).toBe(1);
        } else {
          expect(result.status, label).toBe(403);
          expect(result.body, label).toEqual(NOT_YOURS);
          expect(counted(uid), label).toBe(0);
          // Refused before the handler ran: it looked nothing up.
          expect(stub.read, label).toEqual([]);
          expect(stub.lookedUp, label).toEqual([]);
        }
      }
    }
  });

  it("leaves every role with routes of its own that a password alone opens", () => {
    for (const role of ROLES) {
      const own = SIGNED_IN_ROUTES.filter((candidate) => needOf(candidate.label) === role);
      expect(own.length, role).toBeGreaterThanOrEqual(2);
      expect(own.every((candidate) => mayCall(role, candidate.label)), role).toBe(true);
      expect(SIGNED_IN_ROUTES.filter((candidate) => mayCall(role, candidate.label)), role).toHaveLength(own.length + SHARED.length);
    }
  });
});

describe("the portal's own routes on the live site, for an account still on a temporary password", () => {
  const choosePassword = (): RealRoute => {
    const found = REAL_ROUTES.find((candidate) => candidate.label === CHOOSE_PASSWORD);
    if (!found) throw new Error(`${CHOOSE_PASSWORD} was not found among the routes.`);
    return found;
  };

  /** Sends POST /password a body of the test's own, as the browser would. */
  const choose = async (body: unknown): Promise<{ status: number; body: ApiErrorBody & Record<string, unknown> }> => {
    const sent = new Request("http://localhost/api/portal/password", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const response = await choosePassword().handler(sent, { params: Promise.resolve({}) });
    return { status: response.status, body: (await response.json()) as ApiErrorBody & Record<string, unknown> };
  };
  const weak = (message: string) => ({
    error: "Some fields need attention.",
    code: "invalid",
    fields: [{ path: "password", code: "weak_password", message }],
  });

  const ISSUED = "K7QM-2XRT-9BHD";
  const PROFILE = "users/pledge1";

  beforeEach(() => {
    // A first sign-in with the password a chair handed out.
    stub.claims = pledgeClaims({ ...TEMP });
    stub.accountClaims = { role: "pledge", issued: "avery.chen@uci.edu", ...TEMP };
    // Their profile, with the fingerprint of the password they were handed.
    stub.documents = {
      [PROFILE]: { email: "avery.chen@uci.edu", displayName: "Rowan Ellis", role: "pledge", status: "active", temporaryPassword: fingerprint(ISSUED) },
    };
  });

  it("finds every route, and the one for choosing a password among them", () => {
    expect(REAL_ROUTES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(REAL_ROUTES.map((candidate) => candidate.label)).size).toBe(REAL_ROUTES.length);
    expect(REAL_ROUTES.map((candidate) => candidate.label)).toEqual(
      expect.arrayContaining([CHOOSE_PASSWORD, "GET /me", "POST /onboarding", "POST /sign-out", "GET /dashboard", "GET /review/overview", "GET /admin/pledges"]),
    );
    // The one route that needs no sign-in is left out below: it has no sign-in to refuse.
    expect(SIGNED_IN_ROUTES).toHaveLength(REAL_ROUTES.length - 1);
  });

  it.each(SIGNED_IN_ROUTES.filter((candidate) => candidate.label !== CHOOSE_PASSWORD))(
    "$label refuses it with 403 password_change_required",
    async (target) => {
      const result = await sendTo(target);
      expect(result.status).toBe(403);
      expect(result.body).toEqual({ error: "Choose your own password to continue.", code: "password_change_required" });

      // And the same for an active, and for either of them whatever the token says of a second factor.
      for (const claims of [activeClaims({ ...TEMP }), pledgeClaims({ ...TEMP, firebase: undefined }), activeClaims({ ...TEMP, firebase: WITH_SECOND_FACTOR })]) {
        stub.claims = claims;
        const again = await sendTo(target);
        expect({ status: again.status, code: again.body.code }).toEqual({ status: 403, code: "password_change_required" });
      }
    },
  );

  it.each(SIGNED_IN_ROUTES)("$label refuses it with 403 temporary_password_expired once the three days are up", async (target) => {
    // A pledge and an active, a second past the limit, a month past it and with no time at all.
    for (const claims of [
      pledgeClaims(issued(TIMING.temporaryPasswordMs + SECOND)),
      activeClaims(issued(TIMING.temporaryPasswordMs + SECOND)),
      pledgeClaims({ ...issued(30 * 24 * HOUR), firebase: WITH_SECOND_FACTOR }),
      activeClaims({ temp: true }),
    ]) {
      stub.claims = claims;
      const result = await sendTo(target);
      expect(result.status).toBe(403);
      expect(result.body).toEqual(EXPIRED);
    }
    // Before anything about the account was read: neither its profile nor the account itself.
    expect(stub.read).toEqual([]);
    expect(stub.lookedUp).toEqual([]);
  });

  it("POST /password is the one it reaches: the request gets as far as being judged on the password it sent", async () => {
    // The request sends no password, so the answer is about the password. Nothing is written.
    const result = await sendTo(choosePassword());
    expect(result.status).toBe(422);
    expect(result.body).toEqual(weak("Use at least 10 characters."));
    expect(stub.read).toEqual([PROFILE]);
  });

  it("POST /password turns away a sign-in more than 15 minutes old, with 401, before it reads anything", async () => {
    stub.claims = pledgeClaims({ ...TEMP, auth_time: (NOW - TIMING.passwordSetupMs - SECOND) / SECOND });
    const result = await choose({ password: "quiet-harbor-lantern-47" });
    expect(result.status).toBe(401);
    expect(result.body).toEqual(SESSION_EXPIRED);
    expect(stub.read).toEqual([]);

    // Exactly 15 minutes old, it is judged on its password like any other.
    stub.claims = pledgeClaims({ ...TEMP, auth_time: (NOW - TIMING.passwordSetupMs) / SECOND });
    expect((await choose({ password: "short" })).body).toEqual(weak("Use at least 10 characters."));
  });

  // The token is at most an hour behind the account. The account itself is asked as well,
  // so a password that ran out since the token was made is not replaced with it.
  it("POST /password checks the time on the account itself as well as the one in the token", async () => {
    for (const tempAt of [(NOW - TIMING.temporaryPasswordMs - SECOND) / SECOND, undefined, "soon", NOW, (NOW + HOUR) / SECOND]) {
      stub.accountClaims = { role: "pledge", issued: "avery.chen@uci.edu", temp: true, tempAt };
      const result = await choose({ password: "quiet-harbor-lantern-47" });
      expect(result.status, String(tempAt)).toBe(403);
      expect(result.body, String(tempAt)).toEqual(EXPIRED);
    }
    // The account was asked each time, and that settled it: the profile was not read.
    expect(stub.lookedUp).toEqual(["pledge1", "pledge1", "pledge1", "pledge1", "pledge1"]);
    expect(stub.read).toEqual([]);
    // Exactly at the limit on the account, the request goes on to the password.
    stub.accountClaims = { role: "pledge", issued: "avery.chen@uci.edu", ...issued(TIMING.temporaryPasswordMs) };
    expect((await choose({ password: "short" })).body).toEqual(weak("Use at least 10 characters."));
    expect(stub.read).toEqual([PROFILE]);
  });

  // Firebase changes an account's password for whoever is signed in to it, and signs in whoever
  // has a temporary password however long ago it ran out. A password changed that way is not one
  // a chair issued, so it is no reason to let an expired account choose its own here.
  it("POST /password refuses an expired account whatever has become of its password since, and reads no profile to decide", async () => {
    const RAN_OUT = issued(TIMING.temporaryPasswordMs + SECOND);
    const HASH_AT_ISSUE = "lSrfV15cpx95/sZS2W9c9Kp6i/LVgQNDNC/qzrCnh1SAyZvqmZqAjTdn3aoItz+VHjoZilo78198JAdRuid5lQ==";
    const HASH_SINCE = "b3RoZXItaGFzaC1mb3ItdGhlLXNhbWUtYWNjb3VudA==";
    // A profile that says, beside the fingerprint, how the password was stored when it was issued.
    const marked = { ...fingerprint(ISSUED), account: "754a92e9278c560f2a862c43ce719de9dc2417bb65d65b94718ed7db5376093f", accountHash: HASH_AT_ISSUE };
    const profiles: Array<Record<string, unknown>> = [fingerprint(ISSUED), marked].map((temporaryPassword) => ({
      email: "avery.chen@uci.edu",
      displayName: "Rowan Ellis",
      role: "pledge",
      status: "active",
      temporaryPassword,
    }));
    const bodies = [{ password: "quiet-harbor-lantern-47" }, { password: "short" }, { password: ISSUED }, {}];
    let asked = 0;

    for (const profile of profiles) {
      stub.documents = { [PROFILE]: profile };
      for (const accountHash of [HASH_SINCE, HASH_AT_ISSUE, "", null, undefined]) {
        stub.accountHash = accountHash;
        // The account says it ran out, whether the token is from before that or after.
        stub.accountClaims = { role: "pledge", issued: "avery.chen@uci.edu", ...RAN_OUT };
        for (const inToken of [RAN_OUT, TEMP]) {
          stub.claims = pledgeClaims({ ...inToken });
          for (const body of bodies) {
            resetRateLimits();
            const result = await choose(body);
            expect(result.status, JSON.stringify({ accountHash, inToken, body })).toBe(403);
            expect(result.body, JSON.stringify({ accountHash, inToken, body })).toEqual(EXPIRED);
            asked += 1;
          }
        }
      }
    }
    expect(asked).toBe(2 * 5 * 2 * 4);
    // No profile was read for any of them. The account was looked up only for a token that was still in time.
    expect(stub.read).toEqual([]);
    expect(stub.lookedUp).toHaveLength(asked / 2);

    // The same account in time is judged on its password, changed or not.
    stub.accountClaims = { role: "pledge", issued: "avery.chen@uci.edu", ...TEMP };
    stub.accountHash = HASH_SINCE;
    expect((await choose({ password: "short" })).body).toEqual(weak("Use at least 10 characters."));
  });

  it("POST /password refuses an account with no profile, whatever password it sends", async () => {
    stub.documents = {};
    for (const body of [{ password: "quiet-harbor-lantern-47" }, { password: "short" }, {}]) {
      const result = await choose(body);
      expect(result.status).toBe(403);
      expect(result.body).toEqual({ error: "This account isn't set up for the portal yet.", code: "no_profile" });
    }
    expect(stub.read).toEqual([PROFILE, PROFILE, PROFILE]);
  });

  it("POST /password rules out the name on the profile, which only a chair can change, not the one on the sign-in account", async () => {
    // The profile says Rowan Ellis. The sign-in account says Somebody Else.
    expect((await choose({ password: "rowan-flies-kites-42" })).body).toEqual(weak("Leave your name and email out of your password."));
    expect((await choose({ password: "kites-for-ELLIS-42" })).body).toEqual(weak("Leave your name and email out of your password."));
    // Their address counts too, from the token.
    expect((await choose({ password: "avery-flies-kites-42" })).body).toEqual(weak("Leave your name and email out of your password."));
    // The other name is no name of theirs: this one is refused for the word after it instead.
    expect((await choose({ password: "somebody-password-kite" })).body).toEqual(weak("That password is too easy to guess. Try a few unrelated words."));
  });

  it.each<[string, string]>([
    ["as it was handed out", ISSUED],
    ["in lower case", ISSUED.toLowerCase()],
    ["with the dashes taken out", "K7QM2XRT9BHD"],
    ["with the dashes taken out, in lower case", "k7qm2xrt9bhd"],
    ["with spaces for dashes", "K7QM 2XRT 9BHD"],
    ["with a character added before it", `x${ISSUED}`],
    ["with characters added after it", `${ISSUED}-kite`],
    ["inside a longer password", `my ${ISSUED.toLowerCase()} kite`],
    ["a different one of the same shape", "W4PN-8GZC-3FJY"],
  ])("POST /password refuses the temporary password %s", async (_label, password) => {
    const result = await choose({ password });
    expect(result.status).toBe(422);
    expect(result.body).toEqual(weak("Choose your own password, not the temporary one."));
    // Nothing of the fingerprint, or of what was sent, comes back.
    expect(JSON.stringify(result.body)).not.toMatch(/salt|hash/);
    expect(JSON.stringify(result.body)).not.toContain(password);
  });

  it("POST /password answers everyone else that there is nothing to do", async () => {
    stub.accountClaims = { role: "pledge", issued: "avery.chen@uci.edu" };
    for (const claims of [pledgeClaims(), activeClaims(), adminClaims(), pledgeClaims({ temp: "true" }), pledgeClaims({ firebase: WITH_SECOND_FACTOR })]) {
      stub.claims = claims;
      const result = await sendTo(choosePassword());
      expect(result.status).toBe(409);
      expect(result.body.code).toBe("not_required");
    }
  });

  it("POST /password tells an account that already has its own password that there is nothing to do, in these words", async () => {
    stub.claims = pledgeClaims();
    stub.accountClaims = { role: "pledge", issued: "avery.chen@uci.edu" };
    const result = await sendTo(choosePassword());
    expect(result.status).toBe(409);
    expect(result.body).toEqual({
      error: "This account already has its own password. Ask an active or an admin if it needs changing.",
      code: "not_required",
    });
  });
});
