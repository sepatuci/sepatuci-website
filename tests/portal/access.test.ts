/**
 * Who can reach the portal API at all: tokens, the gate, request bodies, path
 * ids, the rate limit, and the deny-all Firestore rules. This file only reads
 * the seeded data; the accounts it disables or deletes are its own fixtures.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { GET as getAdminForm, PUT as putAdminForm } from "@/app/api/portal/admin/forms/[formId]/route";
import { DELETE as deleteResponse } from "@/app/api/portal/admin/forms/[formId]/responses/[uid]/route";
import { DELETE as deletePledge } from "@/app/api/portal/admin/pledges/[uid]/route";
import { GET as getOverview, POST as createPledge } from "@/app/api/portal/admin/pledges/route";
import { GET as getDashboard } from "@/app/api/portal/dashboard/route";
import { PUT as putDraft } from "@/app/api/portal/forms/[formId]/draft/route";
import { GET as getForm } from "@/app/api/portal/forms/[formId]/route";
import { POST as submit } from "@/app/api/portal/forms/[formId]/submit/route";
import { POST as heartbeat } from "@/app/api/portal/heartbeat/route";
import { GET as getMe } from "@/app/api/portal/me/route";
import { POST as completeOnboarding } from "@/app/api/portal/onboarding/route";
import { POST as choosePassword } from "@/app/api/portal/password/route";
import { GET as getReviewForm } from "@/app/api/portal/review/forms/[formId]/route";
import { GET as getReviewOverview } from "@/app/api/portal/review/overview/route";
import { POST as signOut } from "@/app/api/portal/sign-out/route";
import { GET as getSubmission } from "@/app/api/portal/submissions/[formId]/route";
import { LIMITS, TIMING } from "@/lib/portal/constants";
import { RATE_LIMITS, resetRateLimits } from "@/lib/portal/server/rate-limit";
import type { AccountState, ActiveRowDto, ActivesDto, AdminFormDto, AdminOverviewDto, MeDto, PledgeDetailDto, PledgeRowDto } from "@/lib/portal/types";
import {
  ADMIN_ONE,
  ADMIN_TWO,
  AVERY,
  FIRESTORE_HOST,
  JORDAN,
  OWN_PASSWORD,
  PRIYA,
  PROJECT_ID,
  SAM,
  SEEDED_ACCOUNTS,
  SEED_TIMEOUT_MS,
  SLOW_TEST_MS,
  TEAM_ATLAS,
  TEMPORARY_PASSWORD_MS,
  acceptTokensFrom,
  call,
  claimsOf,
  countAll,
  countWhere,
  createAccount,
  createProfile as profileFor,
  discoverRoutes,
  docData,
  docExists,
  dumpPortal,
  fieldCodes,
  ok,
  paddedJson,
  refused,
  seedPortal,
  signIn,
  signInFailure,
  sleep,
  temporaryNow,
  testAuth,
  testDb,
  uidOf,
  withClaims,
  type Session,
} from "./helpers";

const ROUTES = await discoverRoutes();
const ADMIN_ROUTES = ROUTES.filter((route) => route.need === "admin");
const PLEDGE_ROUTES = ROUTES.filter((route) => route.need === "pledge");
const ACTIVE_ROUTES = ROUTES.filter((route) => route.need === "active");
/** The one route that needs no sign-in: the code in a preview link is its credential. */
const PUBLIC_ROUTES = ROUTES.filter((route) => route.need === "public");
/** Every route a sign-in is judged on: all but that one. */
const SIGNED_IN_ROUTES = ROUTES.filter((route) => route.need !== "public");

const ROLES = ["admin", "active", "pledge"] as const;
type CallerRole = (typeof ROLES)[number];
const CALLED: Record<CallerRole, string> = { admin: "an admin", active: "an active", pledge: "a pledge" };
/** Whether a route is one this role may call at all. */
const mayCall = (role: CallerRole, need: (typeof ROUTES)[number]["need"]): boolean => need === "any" || need === "public" || need === role;
/** Every route against every role it is not for. */
const REFUSALS = ROUTES.flatMap((route) => ROLES.filter((role) => !mayCall(role, route.need)).map((role) => ({ route, role })));
/** The routes every role is let through to, whatever each then does with the request. */
const SHARED_ROUTES = ROUTES.filter((route) => route.need === "any");
const SHARED = ["GET /me", "POST /heartbeat", "POST /onboarding", "POST /password", "POST /sign-out"];
/**
 * The changes someone who is not an admin can ask for outside their own
 * deliverables: keeping their visit alive, ending it, finishing their own
 * welcome, and replacing a temporary password of their own.
 */
const SHARED_WRITES = ["POST /heartbeat", "POST /onboarding", "POST /password", "POST /sign-out"];
/** The two shared routes that answer every role alike and leave the sign-in as it is. */
const OPEN_TO_EVERYONE_ALIKE = SHARED_ROUTES.filter((route) => route.label === "GET /me" || route.label === "POST /heartbeat");
/** A password that would be accepted from an account that had one to replace. */
const A_GOOD_PASSWORD = OWN_PASSWORD;

// ── Sessions ─────────────────────────────────────────────────────────────────

let admin: Session;
let sam: Session;
let avery: Session;
let priya: Session;

beforeAll(async () => {
  await seedPortal();
  [admin, sam, avery, priya] = await Promise.all([signIn(ADMIN_ONE), signIn(SAM), signIn(AVERY), signIn(PRIYA)]);
}, SEED_TIMEOUT_MS);

/** A seeded session with the given role: the first admin, Priya, or Sam. */
const sessionAs = (role: CallerRole): Session => (role === "admin" ? admin : role === "active" ? priya : sam);

beforeEach(() => {
  resetRateLimits();
});

describe("route discovery", () => {
  it("finds every portal route handler", () => {
    expect(new Set(ROUTES.map((route) => route.path)).size).toBeGreaterThanOrEqual(30);
    expect(ROUTES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(ROUTES.map((route) => route.label)).size).toBe(ROUTES.length);
    expect(ADMIN_ROUTES.length).toBeGreaterThanOrEqual(27);
    expect(PLEDGE_ROUTES.length).toBeGreaterThanOrEqual(6);
    // The welcome is for pledges and actives, and a temporary password can be anyone's to replace.
    expect(SHARED_ROUTES.map((route) => route.label).sort()).toEqual(SHARED);
  });

  it("puts each role's routes in a folder of its own, and takes the role each route needs from where it is", () => {
    // The actives' routes: exactly these two, both reads.
    expect(ACTIVE_ROUTES.map((route) => route.label).sort()).toEqual(["GET /review/forms/[formId]", "GET /review/overview"]);
    expect(PLEDGE_ROUTES.map((route) => route.label).sort()).toEqual([
      "GET /dashboard",
      "GET /forms/[formId]",
      "GET /submissions",
      "GET /submissions/[formId]",
      "POST /forms/[formId]/submit",
      "PUT /forms/[formId]/draft",
    ]);
    for (const route of ROUTES) {
      const folder = route.path.split("/")[0];
      if (route.need === "admin") expect(folder, route.label).toBe("admin");
      else if (route.need === "active") expect(folder, route.label).toBe("review");
      else expect(["admin", "review"], route.label).not.toContain(folder);
    }
    // Every role has routes of its own, and every route is some role's, everyone's, or the one that is anyone's.
    expect(PUBLIC_ROUTES.map((route) => route.label)).toEqual(["POST /preview/redeem"]);
    expect(ADMIN_ROUTES.length + ACTIVE_ROUTES.length + PLEDGE_ROUTES.length + SHARED.length + PUBLIC_ROUTES.length).toBe(ROUTES.length);
  });

  it("finds the people and preview routes among the admin's, and the one for a preview link open to anyone", () => {
    const labels = ROUTES.map((route) => `${route.label} (${route.need})`);
    for (const expected of [
      "GET /admin/people (admin)",
      "POST /admin/people/[uid]/role (admin)",
      "GET /admin/preview (admin)",
      "POST /admin/preview (admin)",
      "DELETE /admin/preview (admin)",
      "POST /preview/redeem (public)",
    ]) {
      expect(labels).toContain(expected);
    }
  });

  it("finds the routes for managing actives among the admin's", () => {
    const labels = ROUTES.map((route) => `${route.label} (${route.need})`);
    for (const expected of [
      "GET /admin/actives (admin)",
      "POST /admin/actives (admin)",
      "PATCH /admin/actives/[uid] (admin)",
      "DELETE /admin/actives/[uid] (admin)",
      "POST /admin/actives/[uid]/invite-link (admin)",
      "POST /admin/actives/[uid]/temporary-password (admin)",
      "GET /review/overview (active)",
      "GET /review/forms/[formId] (active)",
    ]) {
      expect(labels).toContain(expected);
    }
  });

  it("finds the team, password, onboarding and sign-out routes among them", () => {
    const labels = ROUTES.map((route) => `${route.label} (${route.need})`);
    for (const expected of [
      "POST /admin/teams (admin)",
      "PATCH /admin/teams/[teamId] (admin)",
      "DELETE /admin/teams/[teamId] (admin)",
      "POST /admin/pledges/[uid]/temporary-password (admin)",
      "POST /onboarding (any)",
      "POST /password (any)",
      "POST /sign-out (any)",
    ]) {
      expect(labels).toContain(expected);
    }
  });
});

// Sign-in is a UCI email and a password. There used to be a second step after the password, and
// with it two routes for an admin to reset it, a field on /me that said whether it was asked
// for, a field on every row that said who had set it up, and an account state for someone who
// had not. None of that is left for a response to carry or a request to reach.
describe("sign-in with an email and a password only", () => {
  /**
   * What a response would have to say to say anything of a second step. Each is long enough, or
   * has a character no id has, that it cannot turn up by chance in the ids a response carries.
   */
  const SECOND_STEP = /mfaEnrolled|mfaEnforced|needs_mfa|mfa_required|reset_mfa|two-step|second factor|secondFactor|passcode|authenticator/i;
  const ME_KEYS = ["createdAt", "displayName", "email", "onboardedAt", "pledgeClass", "preview", "role", "serverNow", "team", "uid"];
  const PLEDGE_ROW_KEYS = [
    "uid",
    "email",
    "displayName",
    "pledgeClass",
    "teamId",
    "status",
    "signInBlocked",
    "accountState",
    "createdAt",
    "lastSignInAt",
    "onboardedAt",
    "activity",
    "submitted",
    "activePunishments",
  ].sort();
  const ACTIVE_ROW_KEYS = ["uid", "email", "displayName", "status", "signInBlocked", "accountState", "createdAt", "lastSignInAt"].sort();
  const routeOf = (label: string): (typeof ROUTES)[number] => {
    const found = ROUTES.find((route) => route.label === label);
    if (!found) throw new Error(`${label} was not discovered.`);
    return found;
  };

  it("is what every session in this file is: a sign-in with a password, and no second factor", () => {
    for (const role of ROLES) {
      const signedInWith = claimsOf(sessionAs(role).token).firebase as Record<string, unknown>;
      expect(signedInWith.sign_in_provider, role).toBe("password");
      expect(signedInWith, role).not.toHaveProperty("sign_in_second_factor");
    }
  });

  it("has forty-six route handlers at thirty-four paths, and none of them is for a second factor", () => {
    expect(ROUTES).toHaveLength(46);
    expect(new Set(ROUTES.map((route) => route.path)).size).toBe(34);
    expect(ROUTES.filter((route) => /mfa|factor|totp|passcode|two-step|enrol/i.test(route.path)).map((route) => route.label)).toEqual([]);
    const labels = ROUTES.map((route) => route.label);
    for (const gone of ["POST /admin/pledges/[uid]/reset-mfa", "POST /admin/actives/[uid]/reset-mfa"]) expect(labels).not.toContain(gone);
    // What an admin can still do to an account's sign-in: a link, or a temporary password.
    expect(labels.filter((label) => /^POST \/admin\/(pledges|actives)\/\[uid\]\//.test(label)).sort()).toEqual([
      "POST /admin/actives/[uid]/invite-link",
      "POST /admin/actives/[uid]/temporary-password",
      "POST /admin/pledges/[uid]/invite-link",
      "POST /admin/pledges/[uid]/punishments",
      "POST /admin/pledges/[uid]/temporary-password",
    ]);
  });

  it.each(["admin/pledges/[uid]/reset-mfa", "admin/actives/[uid]/reset-mfa"])(
    "has nothing at %s for a request to reach: there is no route there to load",
    async (gone) => {
      const missing = `@/app/api/portal/${gone}/route`;
      await expect(import(/* @vite-ignore */ missing)).rejects.toThrow();
      // The same lookup finds the route beside it, so it is the route that is missing and not the lookup.
      const beside = `@/app/api/portal/${gone.replace("reset-mfa", "temporary-password")}/route`;
      const exported: Record<string, unknown> = await import(/* @vite-ignore */ beside);
      expect(Object.keys(exported)).toEqual(["POST"]);
    },
  );

  it("tells nobody whether a second step is asked for: GET /me has exactly these fields for every role", async () => {
    expectTypeOf<MeDto>().not.toHaveProperty("mfaEnforced");
    for (const role of ROLES) {
      const result = await call(getMe, {}, { token: sessionAs(role).token });
      const me = ok<MeDto>(result);
      expect(Object.keys(me).sort(), role).toEqual(ME_KEYS);
      expect(me, role).not.toHaveProperty("mfaEnforced");
      expect(result.text, role).not.toMatch(SECOND_STEP);
    }
  });

  it("says of no pledge or active whether they have a second factor: an admin's rows have exactly these fields", async () => {
    expectTypeOf<PledgeRowDto>().not.toHaveProperty("mfaEnrolled");
    expectTypeOf<ActiveRowDto>().not.toHaveProperty("mfaEnrolled");

    const overview = await call(getOverview, {}, { token: admin.token });
    const pledges = ok<AdminOverviewDto>(overview).pledges;
    expect(pledges).toHaveLength(6);
    for (const row of pledges) {
      expect(Object.keys(row).sort(), row.displayName).toEqual(PLEDGE_ROW_KEYS);
      expect(row, row.displayName).not.toHaveProperty("mfaEnrolled");
    }

    const listed = await call(routeOf("GET /admin/actives").handler, {}, { token: admin.token });
    const actives = ok<ActivesDto>(listed).actives;
    expect(actives).toHaveLength(3);
    for (const row of actives) {
      expect(Object.keys(row).sort(), row.displayName).toEqual(ACTIVE_ROW_KEYS);
      expect(row, row.displayName).not.toHaveProperty("mfaEnrolled");
    }

    // The same row on a pledge's own page, and nothing of a second step anywhere in what was sent.
    const detail = await call(routeOf("GET /admin/pledges/[uid]").handler, { uid: sam.uid }, { token: admin.token });
    expect(Object.keys(ok<PledgeDetailDto>(detail).pledge).sort()).toEqual(PLEDGE_ROW_KEYS);
    for (const result of [overview, listed, detail]) expect(result.text).not.toMatch(SECOND_STEP);
  });

  it("has three account states, and no fourth for someone who has yet to set a second step up", async () => {
    expectTypeOf<AccountState>().toEqualTypeOf<"invited" | "active" | "disabled">();
    const pledges = ok<AdminOverviewDto>(await call(getOverview, {}, { token: admin.token })).pledges;
    const actives = ok<ActivesDto>(await call(routeOf("GET /admin/actives").handler, {}, { token: admin.token })).actives;
    // The seed has someone in each of the three, among the pledges and among the actives.
    expect([...new Set(pledges.map((row) => row.accountState))].sort()).toEqual(["active", "disabled", "invited"]);
    expect([...new Set(actives.map((row) => row.accountState))].sort()).toEqual(["active", "disabled", "invited"]);
    const states: string[] = [...pledges, ...actives].map((row) => row.accountState);
    expect(states).not.toContain("needs_mfa");
  });

  it("is in no audit entry an admin can read: nothing was ever reset", async () => {
    const result = await call(routeOf("GET /admin/audit").handler, {}, { token: admin.token });
    expect(result.status).toBe(200);
    expect(result.text).not.toMatch(/reset_mfa/);
    expect(result.text).not.toMatch(SECOND_STEP);
  });
});

describe("tokens", () => {
  it.each(SIGNED_IN_ROUTES)("$label refuses a request with no token", async ({ handler, method, params }) => {
    refused(await call(handler, params, { method }), 401, "unauthenticated");
  });

  it.each(SIGNED_IN_ROUTES)("$label refuses a garbage token", async ({ handler, method, params }) => {
    refused(await call(handler, params, { method, token: "not.a.token" }), 401, "unauthenticated");
  });

  it.each(PUBLIC_ROUTES)("$label is open to anyone: it is judged on what it sends, with no token or a garbage one alike", async ({ handler, method, params }) => {
    for (const token of [undefined, "not.a.token", sam.token]) {
      const result = await call(handler, params, { method, token, body: { code: "not-a-code" } });
      refused(result, 404, "preview_code_invalid");
      expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
    }
  });

  it.each<[string, (session: Session) => string]>([
    ["a single word", () => "Bearer garbage"],
    ["three dotted parts that are not a JWT", () => "Bearer aaa.bbb.ccc"],
    ["an empty bearer", () => "Bearer "],
    ["only the scheme", () => "Bearer"],
    ["a Basic credential", () => "Basic c2FtOnBvcnRhbC1kZW1vLTE="],
    ["a real token under a lower-case scheme", (session) => `bearer ${session.token}`],
    ["a real token with no scheme", (session) => session.token],
    ["a real token followed by a second one", (session) => `Bearer ${session.token} ${session.token}`],
    ["a real token with a character outside the JWT alphabet", (session) => `Bearer ${session.token}!`],
    ["a real token cut short", (session) => `Bearer ${session.token.slice(0, -40)}`],
    ["a real token with its payload removed", (session) => `Bearer ${session.token.split(".")[0]}..`],
    ["the user's uid instead of a token", (session) => `Bearer ${session.uid}`],
  ])("refuses %s", async (_label, authorization) => {
    refused(await call(getMe, {}, { authorization: authorization(sam) }), 401, "unauthenticated");
  });

  it("accepts the same token when it is well formed, so the refusals above are about the token", async () => {
    const me = ok<MeDto>(await call(getMe, {}, { token: sam.token }));
    expect(me).toMatchObject({
      uid: sam.uid,
      email: SAM,
      displayName: "Sam Okafor",
      role: "pledge",
      pledgeClass: "Lambda",
      team: null,
    });
    expect(Date.parse(me.serverNow)).toBeGreaterThan(Date.now() - 60_000);
    expect(me.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(me.onboardedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(me.preview).toBeNull();
    expect(Object.keys(me).sort()).toEqual([
      "createdAt",
      "displayName",
      "email",
      "onboardedAt",
      "pledgeClass",
      "preview",
      "role",
      "serverNow",
      "team",
      "uid",
    ]);
  });

  it("refuses an expired token with a code that tells the client to refresh it", async () => {
    const hourAgo = Math.floor(Date.now() / 1000) - 3600;
    const expired = withClaims(sam.token, { iat: hourAgo - 3600, exp: hourAgo });
    refused(await call(getMe, {}, { token: expired }), 401, "token_expired");
  });

  it("refuses a token minted for a different Firebase project", async () => {
    const foreign = withClaims(sam.token, {
      aud: "some-other-project",
      iss: "https://securetoken.google.com/some-other-project",
    });
    refused(await call(getMe, {}, { token: foreign }), 401, "unauthenticated");
  });
});

describe("roles", () => {
  let before: Awaited<ReturnType<typeof dumpPortal>>;

  it("takes stock of everything stored, before any call that should be refused", async () => {
    before = await dumpPortal();
    // The seed as it stands: every profile, deliverable, response, punishment, team, visit and audit entry.
    expect(Object.keys(before.firestore).length).toBeGreaterThanOrEqual(50);
    expect(Object.keys(before.firestore).filter((path) => path.startsWith("submissions/"))).toHaveLength(9);
    expect(Object.keys(before.accounts)).toHaveLength(SEEDED_ACCOUNTS);
  });

  describe("every route, against every role it is not for", () => {
    // Each role's own routes and the shared ones are let through; every other pairing is here.
    it("is two refusals for each route that belongs to one role, and none for the routes everyone shares or the one anyone may call", () => {
      expect(REFUSALS).toHaveLength(2 * (SIGNED_IN_ROUTES.length - SHARED.length));
      for (const role of ROLES) {
        const own = ROUTES.filter((route) => route.need === role).length;
        expect(REFUSALS.filter((cell) => cell.role === role), role).toHaveLength(SIGNED_IN_ROUTES.length - SHARED.length - own);
      }
      expect(REFUSALS.filter((cell) => cell.route.need === "any")).toEqual([]);
      expect(REFUSALS.filter((cell) => cell.route.need === "public")).toEqual([]);
      // The new routes for issuing a temporary password are among those an active and a pledge are refused.
      for (const role of ["active", "pledge"] as const) {
        const refusedLabels = REFUSALS.filter((cell) => cell.role === role).map((cell) => cell.route.label);
        expect(refusedLabels).toContain("POST /admin/pledges/[uid]/temporary-password");
        expect(refusedLabels).toContain("POST /admin/actives/[uid]/temporary-password");
      }
    });

    for (const { route, role } of REFUSALS) {
      it(`${route.label} refuses ${CALLED[role]}`, async () => {
        const result = await call(route.handler, route.params, { method: route.method, token: sessionAs(role).token });
        const body = refused(result, 403, "forbidden");
        expect(body.error).toBe("You don't have permission to do that.");
        expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
      });
    }

    it("changed nothing: the whole database and every sign-in account are exactly as they were", async () => {
      const after = await dumpPortal();
      expect(after.accounts).toEqual(before.accounts);
      expect(after.firestore).toEqual(before.firestore);
    });
  });

  describe("what an active may do", () => {
    it("is read, and nothing else: every route under review/ exports GET alone", () => {
      const modules = new Map(ROUTES.filter((route) => route.path.startsWith("review/")).map((route) => [route.path, route.moduleExports]));
      expect([...modules.keys()].sort()).toEqual(["review/forms/[formId]", "review/overview"]);
      for (const [path, exported] of modules) expect(exported, path).toEqual(["GET"]);
      expect(ACTIVE_ROUTES.every((route) => route.method === "GET")).toBe(true);
    });

    it("includes no route that changes anything, other than the four that are about the caller's own sign-in and welcome", () => {
      // The one route open to anyone is a change too, but of nothing an active has: it spends a preview link.
      const changes = SIGNED_IN_ROUTES.filter((route) => route.method !== "GET");
      expect(changes.length).toBeGreaterThanOrEqual(25);
      expect(changes.filter((route) => mayCall("active", route.need)).map((route) => route.label).sort()).toEqual(SHARED_WRITES);
      // Each of the others was called by an active above, and refused.
      const refusedForAnActive = new Set(REFUSALS.filter((cell) => cell.role === "active").map((cell) => cell.route.label));
      for (const route of changes.filter((candidate) => !SHARED_WRITES.includes(candidate.label))) {
        expect(refusedForAnActive.has(route.label), route.label).toBe(true);
      }
      expect(refusedForAnActive.size).toBe(SIGNED_IN_ROUTES.length - SHARED.length - ACTIVE_ROUTES.length);
    });

    it.each(SIGNED_IN_ROUTES.filter((route) => route.method !== "GET" && !SHARED_WRITES.includes(route.label)))(
      "$label is refused to an active whatever it is sent, before the body or the ids are looked at",
      async ({ handler, method }) => {
        const attempts = [
          await call(handler, { formId: "week2interviews", uid: sam.uid, teamId: TEAM_ATLAS, id: "abc123" }, { method, token: priya.token, body: { displayName: "By An Active", status: "disabled", answers: {} } }),
          await call(handler, { formId: "../x", uid: "../x", teamId: "../x", id: "../x" }, { method, token: priya.token, rawBody: "not json" }),
          await call(handler, { formId: "week2interviews", uid: priya.uid, teamId: TEAM_ATLAS, id: "abc123" }, { method, token: priya.token, rawBody: paddedJson(LIMITS.smallBodyBytes + 1) }),
        ];
        for (const result of attempts) refused(result, 403, "forbidden");
      },
    );

    // Of the four that are let through, two could change something other than the caller's
    // own visit. Neither does, for an active who is set up.
    it("POST /password changes nothing for an active who has their own password, whatever it is sent", async () => {
      const bodies = [{ password: A_GOOD_PASSWORD }, { password: A_GOOD_PASSWORD, uid: sam.uid, email: SAM, role: "admin", temp: true }, { password: "short" }, {}];
      for (const body of bodies) {
        const result = await call(choosePassword, {}, { method: "POST", token: priya.token, body, query: `?uid=${sam.uid}`, headers: { "x-uid": sam.uid } });
        const refusal = refused(result, 409, "not_required");
        expect(refusal.error).toBe("This account already has its own password. Ask an active or an admin if it needs changing.");
        expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
      }
      // Her password is the one she had, and nobody's has become the one that was sent.
      expect((await signIn(PRIYA)).uid).toBe(priya.uid);
      for (const email of [PRIYA, SAM]) expect(await signInFailure(email, A_GOOD_PASSWORD)).toMatch(/INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS/);
    });

    it("POST /onboarding is an active's own welcome: naming a pledge finishes nothing for the pledge", async () => {
      // In the seed Jordan has not been through the tour, and Priya finished her welcome 24 days ago.
      const jordanUid = await uidOf(JORDAN);
      expect((await docData(`users/${jordanUid}`))?.onboardedAt).toBeNull();
      const finished = (await docData(`users/${priya.uid}`))?.onboardedAt as { toMillis(): number };
      const result = await call(completeOnboarding, {}, {
        method: "POST",
        token: priya.token,
        body: { uid: jordanUid, email: JORDAN, onboardedAt: "2000-01-01T00:00:00.000Z" },
        query: `?uid=${jordanUid}`,
        headers: { "x-uid": jordanUid },
      });
      const body = ok<{ onboardedAt: string }>(result);
      expect(Object.keys(body)).toEqual(["onboardedAt"]);
      // Her own time comes back, not a new one and not the one that was sent.
      expect(Date.parse(body.onboardedAt)).toBe(finished.toMillis());
      expect(Date.parse(body.onboardedAt)).toBeLessThan(Date.now() - 23 * 86_400_000);
      expect((await docData(`users/${jordanUid}`))?.onboardedAt).toBeNull();
    });

    it("left everything as it was after those as well", async () => {
      const after = await dumpPortal();
      expect(after.accounts).toEqual(before.accounts);
      expect(after.firestore).toEqual(before.firestore);
    });
  });

  describe("each role's own routes", () => {
    // Reads only, with placeholder ids: enough to show the gate lets the right role through.
    const READS = ROUTES.filter((route) => route.method === "GET").flatMap((route) =>
      ROLES.filter((role) => mayCall(role, route.need)).map((role) => ({ route, role })),
    );

    it("are at least one read for every role", () => {
      for (const role of ROLES) expect(READS.filter((cell) => cell.role === role && cell.route.need === role).length, role).toBeGreaterThanOrEqual(2);
      expect(READS.filter((cell) => cell.route.need === "any")).toHaveLength(3);
    });

    for (const { route, role } of READS) {
      it(`${route.label} lets ${CALLED[role]} through`, async () => {
        const result = await call(route.handler, route.params, { token: sessionAs(role).token });
        // A route with an id in its path is given one that nothing has, and says so.
        if (Object.keys(route.params).length > 0) refused(result, 404, "not_found");
        else ok(result);
      });
    }
  });

  it("has two shared routes that answer every role alike", () => {
    expect(OPEN_TO_EVERYONE_ALIKE.map((route) => route.label).sort()).toEqual(["GET /me", "POST /heartbeat"]);
  });

  it.each(OPEN_TO_EVERYONE_ALIKE)("$label lets all three roles in", async ({ handler, method, params }) => {
    ok(await call(handler, params, { method, token: admin.token }));
    ok(await call(handler, params, { method, token: sam.token }));
    ok(await call(handler, params, { method, token: priya.token }));
  });

  // The welcome and the temporary password are let through for every role and then decided
  // by who is asking. Signing out is shared too, and is tried below with throwaway sign-ins.
  it("lets a pledge and an active finish their welcome, and refuses an admin, who has none", async () => {
    const before = await dumpPortal();
    // Sam and Priya finished theirs in the seed, so they are given that time back.
    for (const session of [sam, priya]) {
      const body = ok<{ onboardedAt: string }>(await call(completeOnboarding, {}, { method: "POST", token: session.token }));
      expect(Date.parse(body.onboardedAt)).toBeLessThan(Date.now() - 19 * 86_400_000);
    }
    const result = await call(completeOnboarding, {}, { method: "POST", token: admin.token });
    // In the same words as any route that is not the caller's.
    expect(refused(result, 403, "forbidden").error).toBe("You don't have permission to do that.");
    expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
    expect(await dumpPortal()).toEqual(before);
  });

  it("lets all three roles as far as choosing a password, and tells each that theirs is already their own", async () => {
    const before = await dumpPortal();
    for (const session of [admin, sam, priya]) {
      const result = await call(choosePassword, {}, { method: "POST", token: session.token, body: { password: A_GOOD_PASSWORD } });
      expect(refused(result, 409, "not_required").error).toBe("This account already has its own password. Ask an active or an admin if it needs changing.");
      expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
    }
    expect(await dumpPortal()).toEqual(before);
    for (const email of [ADMIN_ONE, SAM, PRIYA]) expect((await signIn(email)).email).toBe(email);
  });

  it("tells each role who they are", async () => {
    expect(ok<MeDto>(await call(getMe, {}, { token: admin.token }))).toMatchObject({
      uid: admin.uid,
      email: ADMIN_ONE,
      role: "admin",
      team: null,
      onboardedAt: null,
    });
    expect(ok<MeDto>(await call(getMe, {}, { token: sam.token })).role).toBe("pledge");
    const active = ok<MeDto>(await call(getMe, {}, { token: priya.token }));
    expect(active).toMatchObject({
      uid: priya.uid,
      email: PRIYA,
      displayName: "Priya Shah",
      role: "active",
      pledgeClass: null,
      team: null,
    });
    // An active has a welcome of their own, and the seed has Priya through hers 24 days ago.
    expect(Date.parse(active.onboardedAt ?? "")).toBeLessThan(Date.now() - 23 * 86_400_000);
  });

  it("times nobody but pledges: a heartbeat from an active, as from an admin, stores nothing", async () => {
    const profiles = async () => [await docData(`users/${priya.uid}`), await docData(`users/${admin.uid}`)];
    const stored = await profiles();
    expect(ok(await call(heartbeat, {}, { method: "POST", token: priya.token, body: { formId: "week2interviews", resume: true } }))).toEqual({ ok: true });
    expect(ok(await call(heartbeat, {}, { method: "POST", token: admin.token }))).toEqual({ ok: true });
    expect(await profiles()).toEqual(stored);
    expect(await docExists(`drafts/week2interviews_${priya.uid}`)).toBe(false);
  });

  it("lets all three roles sign out", async () => {
    // Throwaway sign-ins: the other admin, and a pledge and an active account of this test's own.
    const otherAdmin = await signIn(ADMIN_TWO);
    const pledge = await createAccount("signing.out@uci.edu", { claims: { role: "pledge" } });
    const active = await createAccount("signing.out.active@uci.edu", { claims: { role: "active" } });
    expect(ok(await call(signOut, {}, { method: "POST", token: otherAdmin.token }))).toEqual({ ok: true });
    expect(ok(await call(signOut, {}, { method: "POST", token: pledge.token }))).toEqual({ ok: true });
    expect(ok(await call(signOut, {}, { method: "POST", token: active.token }))).toEqual({ ok: true });
  });

  it("left the data untouched after every refused admin call above", async () => {
    const overview = ok<AdminOverviewDto>(await call(getOverview, {}, { token: admin.token }));
    expect(overview.pledges).toHaveLength(6);
    expect(overview.forms).toHaveLength(6);
    expect(overview.teams.map((team) => [team.id, team.name, team.memberCount])).toEqual([[TEAM_ATLAS, "Team Atlas", 2]]);
    expect(await countAll("submissions")).toBe(9);
    expect(await countAll("punishments")).toBe(2);
    expect(await countAll("teams")).toBe(1);
    expect(await countWhere("users", "teamId", TEAM_ATLAS)).toBe(2);
    expect(await countWhere("users", "role", "active")).toBe(3);
    expect(await countAll("users")).toBe(SEEDED_ACCOUNTS);
  });
});

describe("the gate, with real tokens", () => {
  it("refuses an account whose email is not verified", async () => {
    const session = await createAccount("unverified.pledge@uci.edu", { verified: false, claims: { role: "pledge" } });
    refused(await call(getMe, {}, { token: session.token }), 403, "email_unverified");
    refused(await call(getDashboard, {}, { token: session.token }), 403, "email_unverified");
  });

  it("refuses an account with no role", async () => {
    const session = await createAccount("no.role@uci.edu");
    refused(await call(getMe, {}, { token: session.token }), 403, "no_role");
    refused(await call(heartbeat, {}, { method: "POST", token: session.token }), 403, "no_role");
  });

  it("refuses an account with a role the portal does not know", async () => {
    const session = await createAccount("made.up.role@uci.edu", { claims: { role: "superuser", admin: true } });
    refused(await call(getMe, {}, { token: session.token }), 403, "no_role");
    refused(await call(getOverview, {}, { token: session.token }), 403, "no_role");
  });

  it("refuses an admin claim whose email is not on the allowlist, on every kind of route", async () => {
    const session = await createAccount("former.chair@uci.edu", { claims: { role: "admin" } });
    for (const result of [
      await call(getOverview, {}, { token: session.token }),
      await call(getMe, {}, { token: session.token }),
      await call(heartbeat, {}, { method: "POST", token: session.token }),
      await call(getDashboard, {}, { token: session.token }),
    ]) {
      const body = refused(result, 403, "forbidden");
      expect(body.error).toBe("This account doesn't have access to the portal.");
    }
  });

  it("refuses a pledge who has a sign-in account but no portal profile", async () => {
    const session = await createAccount("no.profile@uci.edu", { claims: { role: "pledge" } });
    refused(await call(getMe, {}, { token: session.token }), 403, "no_profile");
    refused(await call(getDashboard, {}, { token: session.token }), 403, "no_profile");
    refused(await call(getForm, { formId: "week2interviews" }, { token: session.token }), 403, "no_profile");
  });

  it.each(["outside.pledge@gmail.com", "outside.pledge@ics.uci.edu", "outside.pledge@uci.edu.example.org"])(
    "refuses a pledge account whose email is %s, on every route a pledge could call",
    async (email) => {
      const session = await createAccount(email, { claims: { role: "pledge" } });
      for (const result of [
        await call(getMe, {}, { token: session.token }),
        await call(getDashboard, {}, { token: session.token }),
        await call(heartbeat, {}, { method: "POST", token: session.token }),
        await call(getForm, { formId: "week2interviews" }, { token: session.token }),
        await call(getOverview, {}, { token: session.token }),
      ]) {
        const body = refused(result, 403, "email_not_allowed");
        expect(body.error).toBe("This account doesn't have access to the portal.");
      }
    },
  );

  it.each(["outside.active@gmail.com", "outside.active@ics.uci.edu", "outside.active@uci.edu.example.org"])(
    "refuses an active account whose email is %s, on every route an active could call",
    async (email) => {
      const session = await createAccount(email, { claims: { role: "active" } });
      for (const result of [
        await call(getMe, {}, { token: session.token }),
        await call(getReviewOverview, {}, { token: session.token }),
        await call(getReviewForm, { formId: "week0onboarding" }, { token: session.token }),
        await call(heartbeat, {}, { method: "POST", token: session.token }),
        await call(getOverview, {}, { token: session.token }),
      ]) {
        const body = refused(result, 403, "email_not_allowed");
        expect(body.error).toBe("This account doesn't have access to the portal.");
        expect(result.text).not.toContain("Avery");
      }
    },
  );

  it.each(["priya.shah@gmail.com", "someone.else@uci.edu", "priya.shah+elsewhere@uci.edu"])(
    "refuses a seeded active whose address has since been pointed at %s",
    async (email) => {
      // The same account and uid as Priya, with a token that carries a different, verified address.
      const moved = withClaims(priya.token, { email });
      for (const result of [
        await call(getReviewOverview, {}, { token: moved }),
        await call(getReviewForm, { formId: "week0onboarding" }, { token: moved }),
        await call(getMe, {}, { token: moved }),
      ]) {
        refused(result, 403, "email_not_allowed");
        expect(result.text).not.toContain("Avery");
      }
      ok(await call(getReviewOverview, {}, { token: priya.token }));
    },
  );

  it("refuses an active who has a sign-in account but no portal profile when they ask who they are", async () => {
    const session = await createAccount("no.profile.active@uci.edu", { claims: { role: "active" } });
    refused(await call(getMe, {}, { token: session.token }), 403, "no_profile");
  });

  it("refuses an account with the active role and an unverified email", async () => {
    const session = await createAccount("unverified.active@uci.edu", { verified: false, claims: { role: "active" } });
    refused(await call(getMe, {}, { token: session.token }), 403, "email_unverified");
    refused(await call(getReviewOverview, {}, { token: session.token }), 403, "email_unverified");
  });

  // tests/portal/first-run.test.ts takes a portal-made account through all of this. These are
  // accounts made by hand, with real tokens, for the order of the checks and the exact flag.
  describe("an account whose claims say its password is temporary", () => {
    const choose = (session: Session) => call(choosePassword, {}, { method: "POST", token: session.token, body: { password: A_GOOD_PASSWORD } });
    const WRONG_PASSWORD = /INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS/;
    const EXPIRED = "That temporary password has expired. Ask an admin for a new one.";

    /**
     * The profile every account the portal makes has, for an account made here by hand.
     * Without one an account cannot replace a temporary password. They are taken away again
     * afterwards: the rest of this file counts on the seeded profiles alone.
     */
    const madeByHand: string[] = [];
    const createProfile = async (uid: string, email: string, role: "pledge" | "active"): Promise<void> => {
      await profileFor(uid, email, role);
      madeByHand.push(uid);
    };
    afterAll(async () => {
      await Promise.all(madeByHand.map((uid) => testDb().doc(`users/${uid}`).delete()));
    });

    it("is refused everything but choosing a password, with a code that says what to do", async () => {
      for (const role of ["pledge", "active"] as const) {
        // Issued just now, and with the profile every account the portal makes has.
        const session = await createAccount(`flagged.${role}@uci.edu`, { claims: { role, ...temporaryNow() } });
        await createProfile(session.uid, session.email, role);
        for (const result of [
          await call(getMe, {}, { token: session.token }),
          await call(getDashboard, {}, { token: session.token }),
          await call(getReviewOverview, {}, { token: session.token }),
          await call(heartbeat, {}, { method: "POST", token: session.token }),
          await call(signOut, {}, { method: "POST", token: session.token }),
          await call(getOverview, {}, { token: session.token }),
        ]) {
          const body = refused(result, 403, "password_change_required");
          expect(body.error).toBe("Choose your own password to continue.");
          expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
        }
        // The one route it reaches replaces the password and takes the flag off.
        expect(ok(await choose(session))).toEqual({ ok: true });
        expect((await testAuth().getUser(session.uid)).customClaims).toEqual({ role, issued: session.email });
        expect((await signIn(session.email, A_GOOD_PASSWORD)).uid).toBe(session.uid);
        expect(await signInFailure(session.email)).toMatch(/INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS/);
      }
    });

    it.each<[string, unknown]>([
      ["the text \"true\"", "true"],
      ["the number 1", 1],
      ["an object", { set: true }],
    ])("is treated as any other account when the flag is %s and not true itself", async (label, temp) => {
      const session = await createAccount(`not.flagged.${String(label).replace(/[^a-z0-9]/g, "")}@uci.edu`, { claims: { role: "pledge", temp } });
      // Let through the gate, and so as far as a pledge with no profile gets.
      refused(await call(getMe, {}, { token: session.token }), 403, "no_profile");
      expect(ok(await call(heartbeat, {}, { method: "POST", token: session.token }))).toEqual({ ok: true });
      // And told it has no temporary password to replace: the one it has is kept.
      refused(await choose(session), 409, "not_required");
      expect((await signIn(session.email)).uid).toBe(session.uid);
      expect((await testAuth().getUser(session.uid)).customClaims).toEqual({ role: "pledge", temp });
    });

    // Each of these is wrong with the account whether its temporary password is still good,
    // has run out, or never said when it was issued, and is what the account is told first.
    it.each<[string, string, Record<string, unknown>, boolean, string]>([
      ["an address outside UCI", "flagged.outside@gmail.com", { role: "pledge" }, true, "email_not_allowed"],
      ["an address outside UCI and the active role", "flagged.outside.active@ics.uci.edu", { role: "active" }, true, "email_not_allowed"],
      ["a record of having been issued to another address", "flagged.moved@uci.edu", { role: "pledge", issued: "someone.else@uci.edu" }, true, "email_not_allowed"],
      ["an admin claim that is not on the list", "flagged.chair@uci.edu", { role: "admin" }, true, "forbidden"],
      ["an email that is not verified", "flagged.unverified@uci.edu", { role: "pledge" }, false, "email_unverified"],
      ["a role the portal does not know", "flagged.viewer@uci.edu", { role: "viewer" }, true, "no_role"],
    ])("gets no way in through that route for an account with %s", async (_label, email, base, verified, code) => {
      const session = await createAccount(email, { verified, claims: { ...base, ...temporaryNow() } });
      for (const password of [temporaryNow(), temporaryNow(TEMPORARY_PASSWORD_MS + 60_000), { temp: true }]) {
        const claims = { ...base, ...password };
        await testAuth().setCustomUserClaims(session.uid, claims);
        const again = await signIn(email);
        for (const result of [await choose(again), await call(getMe, {}, { token: again.token }), await call(heartbeat, {}, { method: "POST", token: again.token })]) {
          const body = refused(result, 403, code);
          expect(body.error).toBe("This account doesn't have access to the portal.");
        }
        // Its password is the one it had, and its claims are untouched.
        expect((await signIn(email)).uid).toBe(session.uid);
        expect(await signInFailure(email, A_GOOD_PASSWORD)).toMatch(WRONG_PASSWORD);
        expect((await testAuth().getUser(session.uid)).customClaims).toEqual(claims);
      }
    });

    it("gets no way in through that route on a sign-in more than 12 hours old", async () => {
      const session = await createAccount("flagged.old@uci.edu", { claims: { role: "pledge", ...temporaryNow() } });
      await createProfile(session.uid, session.email, "pledge");
      await acceptTokensFrom(session.uid, 2 * 86_400_000);
      const old = withClaims(session.token, { auth_time: Number(claimsOf(session.token).auth_time) - (TIMING.maxSessionAgeMs + 60_000) / 1000 });
      refused(await call(choosePassword, {}, { method: "POST", token: old, body: { password: A_GOOD_PASSWORD } }), 401, "session_expired");
      expect(await signInFailure("flagged.old@uci.edu", A_GOOD_PASSWORD)).toMatch(WRONG_PASSWORD);
      // The same request on the sign-in as it really is goes through.
      expect(ok(await choose(session))).toEqual({ ok: true });
    });

    // Choosing the password has to follow the sign-in within 15 minutes. A token that says its
    // sign-in was longer ago than that is what a tab left open on a shared computer would send.
    it("cannot choose a password on a sign-in more than 15 minutes old, and can on one just under", async () => {
      expect(TIMING.passwordSetupMs).toBe(15 * 60_000);
      const session = await createAccount("flagged.idle@uci.edu", { claims: { role: "pledge", ...temporaryNow() } });
      await createProfile(session.uid, session.email, "pledge");
      await acceptTokensFrom(session.uid, 86_400_000);
      const signedIn = Number(claimsOf(session.token).auth_time);
      const aged = (ms: number): string => withClaims(session.token, { auth_time: signedIn - ms / 1000 });

      for (const ms of [TIMING.passwordSetupMs + 60_000, 3_600_000, TIMING.maxSessionAgeMs - 60_000]) {
        const result = await call(choosePassword, {}, { method: "POST", token: aged(ms), body: { password: A_GOOD_PASSWORD } });
        const body = refused(result, 401, "session_expired");
        expect(body.error, `${ms} ms`).toBe("Your session has expired. Sign in again.");
        expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
      }
      // Nothing was chosen: the password and the flag are as they were.
      expect(await signInFailure(session.email, A_GOOD_PASSWORD)).toMatch(WRONG_PASSWORD);
      expect((await testAuth().getUser(session.uid)).customClaims).toMatchObject({ role: "pledge", temp: true });

      // That limit is for choosing a password. Everywhere else the same sign-in is still told to choose one.
      for (const ms of [TIMING.passwordSetupMs + 60_000, 3_600_000]) {
        refused(await call(getMe, {}, { token: aged(ms) }), 403, "password_change_required");
        refused(await call(heartbeat, {}, { method: "POST", token: aged(ms) }), 403, "password_change_required");
      }

      // A minute inside the limit, the request is judged on the password it sent, and then goes through.
      const nearly = aged(TIMING.passwordSetupMs - 60_000);
      const weak = refused(await call(choosePassword, {}, { method: "POST", token: nearly, body: { password: "short" } }), 422, "invalid");
      expect(fieldCodes(weak)).toEqual(["password:weak_password"]);
      expect(ok(await call(choosePassword, {}, { method: "POST", token: nearly, body: { password: A_GOOD_PASSWORD } }))).toEqual({ ok: true });
      expect((await signIn(session.email, A_GOOD_PASSWORD)).uid).toBe(session.uid);
    });

    it("does not hold an account with its own password to those 15 minutes, or to any time left on it", async () => {
      // Sam, signed in an hour ago and then eleven: told there is nothing to do, not that the session is over.
      const signedIn = Number(claimsOf(sam.token).auth_time);
      await acceptTokensFrom(sam.uid, 86_400_000);
      for (const ms of [TIMING.passwordSetupMs + 60_000, 3_600_000, 11 * 3_600_000]) {
        const aged = withClaims(sam.token, { auth_time: signedIn - ms / 1000 });
        refused(await call(choosePassword, {}, { method: "POST", token: aged, body: { password: A_GOOD_PASSWORD } }), 409, "not_required");
        expect(ok<MeDto>(await call(getMe, {}, { token: aged })).uid).toBe(sam.uid);
      }
      // A time under that name, without the flag, means nothing: long ago, in the future, or not a time.
      for (const tempAt of [0, Math.floor(Date.now() / 1000) - 30 * 86_400, Math.floor(Date.now() / 1000) + 86_400, "yesterday", null]) {
        for (const temp of [undefined, false, "true"]) {
          const token = withClaims(sam.token, { temp, tempAt });
          expect(ok<MeDto>(await call(getMe, {}, { token })).uid, JSON.stringify({ temp, tempAt })).toBe(sam.uid);
          ok(await call(getDashboard, {}, { token }));
        }
      }
      expect((await signIn(SAM)).uid).toBe(sam.uid);
    });

    describe("once the three days are up", () => {
      const everyKindOfRoute = async (token: string) => [
        await call(getMe, {}, { token }),
        await call(getDashboard, {}, { token }),
        await call(getReviewOverview, {}, { token }),
        await call(heartbeat, {}, { method: "POST", token }),
        await call(completeOnboarding, {}, { method: "POST", token }),
        await call(signOut, {}, { method: "POST", token }),
        await call(getOverview, {}, { token }),
        await call(choosePassword, {}, { method: "POST", token, body: { password: A_GOOD_PASSWORD } }),
        await call(choosePassword, {}, { method: "POST", token, body: {} }),
      ];

      it.each<[string, () => Record<string, unknown>]>([
        ["a minute past three days ago", () => temporaryNow(TEMPORARY_PASSWORD_MS + 60_000)],
        ["a month ago", () => temporaryNow(30 * 86_400_000)],
        ["never, as far as the account says", () => ({ temp: true })],
        ["at a time that is text", () => ({ temp: true, tempAt: String(Math.floor(Date.now() / 1000)) })],
        ["at a time that is null", () => ({ temp: true, tempAt: null })],
        ["an hour from now", () => temporaryNow(-3_600_000)],
        ["at a time written in milliseconds", () => ({ temp: true, tempAt: Date.now() })],
      ])("is refused every route, the one for choosing a password included, when it was issued %s", async (label, password) => {
        for (const role of ["pledge", "active"] as const) {
          const email = `expired.${role}.${label.replace(/[^a-z]/g, "")}@uci.edu`;
          const claims = { role, ...password() };
          const session = await createAccount(email, { claims });
          await createProfile(session.uid, email, role);
          const before = await dumpPortal();

          for (const result of await everyKindOfRoute(session.token)) {
            const body = refused(result, 403, "temporary_password_expired");
            expect(body.error).toBe(EXPIRED);
            expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
            expect(result.headers.get("cache-control")).toBe("no-store");
          }
          // Nothing was chosen, recorded or ended: the account and every document are as they were.
          expect(await dumpPortal()).toEqual(before);
          expect((await signIn(email)).uid).toBe(session.uid);
          expect(await signInFailure(email, A_GOOD_PASSWORD)).toMatch(WRONG_PASSWORD);
        }
      });

      it("is still good a minute short of three days, and a minute ahead of the server's clock", async () => {
        for (const [label, msAgo] of [
          ["nearly", TEMPORARY_PASSWORD_MS - 60_000],
          ["ahead", -60_000],
        ] as const) {
          const email = `flagged.${label}@uci.edu`;
          const session = await createAccount(email, { claims: { role: "pledge", ...temporaryNow(msAgo) } });
          await createProfile(session.uid, email, "pledge");
          refused(await call(getMe, {}, { token: session.token }), 403, "password_change_required");
          expect(ok(await choose(session))).toEqual({ ok: true });
          expect((await testAuth().getUser(session.uid)).customClaims).toEqual({ role: "pledge", issued: email });
        }
      });

      // The token is up to an hour behind the account. A password that ran out since the
      // token was made is not replaced with it: the account itself is asked as well.
      it("goes by the account as well as the token: a token from before it ran out cannot choose a password either", async () => {
        const email = "expired.since@uci.edu";
        const session = await createAccount(email, { claims: { role: "pledge", ...temporaryNow() } });
        await createProfile(session.uid, email, "pledge");
        // The account's three days run out. The token, made a moment ago, still says otherwise.
        await testAuth().setCustomUserClaims(session.uid, { role: "pledge", ...temporaryNow(TEMPORARY_PASSWORD_MS + 60_000) });
        expect(claimsOf(session.token).tempAt).toBeGreaterThan(Date.now() / 1000 - 120);

        const result = await choose(session);
        expect(refused(result, 403, "temporary_password_expired").error).toBe(EXPIRED);
        expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
        expect(await signInFailure(email, A_GOOD_PASSWORD)).toMatch(WRONG_PASSWORD);
        expect((await testAuth().getUser(session.uid)).customClaims).toMatchObject({ temp: true });
        // On every other route that token is told what its own claims say.
        refused(await call(getMe, {}, { token: session.token }), 403, "password_change_required");
      });

      it("reports a sign-in more than 12 hours old first, with 401, and a moved address first, with 403", async () => {
        const email = "expired.and.old@uci.edu";
        const session = await createAccount(email, { claims: { role: "pledge", ...temporaryNow(TEMPORARY_PASSWORD_MS + 60_000) } });
        await acceptTokensFrom(session.uid, 2 * 86_400_000);
        const old = withClaims(session.token, { auth_time: Number(claimsOf(session.token).auth_time) - (TIMING.maxSessionAgeMs + 60_000) / 1000 });
        refused(await call(choosePassword, {}, { method: "POST", token: old, body: { password: A_GOOD_PASSWORD } }), 401, "session_expired");
        refused(await call(getMe, {}, { token: old }), 401, "session_expired");

        const moved = withClaims(session.token, { email: "someone.else@gmail.com" });
        refused(await call(choosePassword, {}, { method: "POST", token: moved, body: { password: A_GOOD_PASSWORD } }), 403, "email_not_allowed");
        // And says the password has expired before it would turn away a sign-in too old to choose one with,
        // on that route as on any other: signing in again would change nothing.
        for (const secondsAgo of [TIMING.passwordSetupMs / 1000 + 60, 3600]) {
          const stale = withClaims(session.token, { auth_time: Number(claimsOf(session.token).auth_time) - secondsAgo });
          const result = await call(choosePassword, {}, { method: "POST", token: stale, body: { password: A_GOOD_PASSWORD } });
          expect(refused(result, 403, "temporary_password_expired").error).toBe(EXPIRED);
          expect(refused(await call(getMe, {}, { token: stale }), 403, "temporary_password_expired").error).toBe(EXPIRED);
          refused(await call(heartbeat, {}, { method: "POST", token: stale }), 403, "temporary_password_expired");
        }
        // Nothing was chosen by any of those.
        expect(await signInFailure(email, A_GOOD_PASSWORD)).toMatch(WRONG_PASSWORD);
        expect((await testAuth().getUser(session.uid)).customClaims).toMatchObject({ role: "pledge", temp: true });
      });

      // The three days are weighed before the profile is looked for, by the gate and by the route
      // itself, so an account made outside the portal is told what any expired account is.
      it("tells an expired account with no profile that its password has expired, not that it is not set up", async () => {
        for (const role of ["pledge", "active"] as const) {
          const email = `expired.no.profile.${role}@uci.edu`;
          // In time when it signs in, so that this token gets past the gate and as far as the route.
          const early = await createAccount(email, { claims: { role, ...temporaryNow() } });
          expect(refused(await call(choosePassword, {}, { method: "POST", token: early.token, body: { password: A_GOOD_PASSWORD } }), 403, "no_profile").error).toBe(
            "This account isn't set up for the portal yet.",
          );
          await testAuth().setCustomUserClaims(early.uid, { role, ...temporaryNow(TEMPORARY_PASSWORD_MS + 60_000) });
          // A token made since is stopped at the gate.
          const late = await signIn(email);
          expect(claimsOf(late.token).tempAt).toBeLessThan(Date.now() / 1000 - TEMPORARY_PASSWORD_MS / 1000);

          for (const session of [early, late]) {
            for (const body of [{ password: A_GOOD_PASSWORD }, { password: "short" }, {}]) {
              const result = await call(choosePassword, {}, { method: "POST", token: session.token, body });
              expect(refused(result, 403, "temporary_password_expired").error).toBe(EXPIRED);
              expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
            }
          }
          expect(refused(await call(getMe, {}, { token: late.token }), 403, "temporary_password_expired").error).toBe(EXPIRED);
          expect(await docExists(`users/${early.uid}`)).toBe(false);
          expect(await signInFailure(email, A_GOOD_PASSWORD)).toMatch(WRONG_PASSWORD);
          expect((await testAuth().getUser(early.uid)).customClaims).toMatchObject({ role, temp: true });
        }
      });

      // Firebase changes a password for whoever is signed in, and from its console. Neither is a
      // chair issuing a new one, and an account made by hand gains no more by it than one the portal made.
      it("does not let an expired account through because its password has been changed since", async () => {
        const email = "expired.then.changed@uci.edu";
        const session = await createAccount(email, { claims: { role: "pledge", ...temporaryNow(TEMPORARY_PASSWORD_MS + 60_000) } });
        await createProfile(session.uid, email, "pledge");
        await testAuth().updateUser(session.uid, { password: "set-since-then-elsewhere-4" });
        const again = await signIn(email, "set-since-then-elsewhere-4");
        const before = await dumpPortal();
        for (const body of [{ password: A_GOOD_PASSWORD }, { password: "set-since-then-elsewhere-4" }, { password: "short" }, {}]) {
          const result = await call(choosePassword, {}, { method: "POST", token: again.token, body });
          expect(refused(result, 403, "temporary_password_expired").error).toBe(EXPIRED);
        }
        expect(refused(await call(getMe, {}, { token: again.token }), 403, "temporary_password_expired").error).toBe(EXPIRED);
        expect(await dumpPortal()).toEqual(before);
        expect((await signIn(email, "set-since-then-elsewhere-4")).uid).toBe(session.uid);
        expect(await signInFailure(email, A_GOOD_PASSWORD)).toMatch(WRONG_PASSWORD);
      });
    });

    it("cannot choose a password without a profile: an account made outside the portal is told it is not set up", async () => {
      for (const role of ["pledge", "active"] as const) {
        const email = `flagged.no.profile.${role}@uci.edu`;
        const session = await createAccount(email, { claims: { role, ...temporaryNow() } });
        for (const body of [{ password: A_GOOD_PASSWORD }, { password: "short" }, {}]) {
          const result = await call(choosePassword, {}, { method: "POST", token: session.token, body });
          expect(refused(result, 403, "no_profile").error).toBe("This account isn't set up for the portal yet.");
          expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
        }
        // No profile was made for it, and it is still on the password and the flag it had.
        expect(await docExists(`users/${session.uid}`)).toBe(false);
        expect((await signIn(email)).uid).toBe(session.uid);
        expect(await signInFailure(email, A_GOOD_PASSWORD)).toMatch(WRONG_PASSWORD);
        expect((await testAuth().getUser(session.uid)).customClaims).toMatchObject({ role, temp: true });
      }
    });
  });

  it("refuses a seeded pledge whose address has since been pointed at another mailbox", async () => {
    // The same account and uid as Sam, with a token that carries a different, verified address.
    const moved = withClaims(sam.token, { email: "sam.okafor@gmail.com" });
    refused(await call(getDashboard, {}, { token: moved }), 403, "email_not_allowed");
    refused(await call(submit, { formId: "week2interviews" }, { method: "POST", token: moved, body: { answers: {} } }), 403, "email_not_allowed");
    expect(await docExists(`submissions/week2interviews_${sam.uid}`)).toBe(false);
    ok(await call(getDashboard, {}, { token: sam.token }));
  });
});

describe("how long a sign-in lasts", () => {
  const signedInAt = (token: string): number => Number(claimsOf(token).auth_time);
  const aged = (session: Session, ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const claims = claimsOf(session.token);
    // A token refreshed just now from a sign-in that long ago: new iat and exp, old auth_time.
    return withClaims(session.token, { auth_time: Number(claims.auth_time) - seconds });
  };

  beforeAll(async () => {
    // As for accounts that have existed for more than a day, so that a sign-in from hours
    // ago is one the emulator still honours and the portal's own limit is what decides.
    await acceptTokensFrom(sam.uid, 2 * 86_400_000);
    await acceptTokensFrom(admin.uid, 2 * 86_400_000);
    await acceptTokensFrom(priya.uid, 2 * 86_400_000);
  });

  it("is not cut short by the emulator: a sign-in from an hour ago is honoured", async () => {
    expect(ok<MeDto>(await call(getMe, {}, { token: aged(sam, 3_600_000) })).uid).toBe(sam.uid);
    ok(await call(getOverview, {}, { token: aged(admin, 3_600_000) }));
  });

  it("carries the time of sign-in in every token, in seconds", async () => {
    for (const session of [sam, admin]) {
      const authTime = signedInAt(session.token);
      expect(Number.isInteger(authTime)).toBe(true);
      expect(Math.abs(authTime * 1000 - Date.now())).toBeLessThan(120_000);
    }
  });

  it("refuses a pledge whose sign-in is more than 12 hours old, with a 401 that sends them to sign in again", async () => {
    const old = aged(sam, TIMING.maxSessionAgeMs + 60_000);
    for (const result of [
      await call(getMe, {}, { token: old }),
      await call(getDashboard, {}, { token: old }),
      await call(heartbeat, {}, { method: "POST", token: old }),
      await call(getOverview, {}, { token: old }),
    ]) {
      const body = refused(result, 401, "session_expired");
      expect(body.error).toBe("Your session has expired. Sign in again.");
    }
  });

  it("refuses an admin whose sign-in is more than 12 hours old", async () => {
    const old = aged(admin, TIMING.maxSessionAgeMs + 60_000);
    refused(await call(getOverview, {}, { token: old }), 401, "session_expired");
    refused(await call(createPledge, {}, { method: "POST", token: old, body: { email: "late.admin@uci.edu", displayName: "Too Late" } }), 401, "session_expired");
    await expect(testAuth().getUserByEmail("late.admin@uci.edu")).rejects.toMatchObject({ code: "auth/user-not-found" });
  });

  it("refuses an active whose sign-in is more than 12 hours old, and accepts one just under", async () => {
    const old = aged(priya, TIMING.maxSessionAgeMs + 60_000);
    for (const result of [
      await call(getReviewOverview, {}, { token: old }),
      await call(getReviewForm, { formId: "week0onboarding" }, { token: old }),
      await call(getMe, {}, { token: old }),
    ]) {
      const body = refused(result, 401, "session_expired");
      expect(body.error).toBe("Your session has expired. Sign in again.");
    }
    ok(await call(getReviewOverview, {}, { token: aged(priya, TIMING.maxSessionAgeMs - 60_000) }));
  });

  it("still accepts a sign-in that is just under 12 hours old", async () => {
    const nearly = aged(sam, TIMING.maxSessionAgeMs - 60_000);
    expect(ok<MeDto>(await call(getMe, {}, { token: nearly })).uid).toBe(sam.uid);
  });

  it("refuses a token that does not say when its sign-in was", async () => {
    refused(await call(getMe, {}, { token: withClaims(sam.token, { auth_time: undefined }) }), 401, "session_expired");
  });

  it("refuses a token whose sign-in time is text, even the text of a time that would pass as a number", async () => {
    const asText = String(signedInAt(sam.token));
    refused(await call(getMe, {}, { token: withClaims(sam.token, { auth_time: asText }) }), 401, "session_expired");
    refused(await call(getDashboard, {}, { token: withClaims(sam.token, { auth_time: asText }) }), 401, "session_expired");
  });

  it("stores nothing for a write that arrives on an expired sign-in", async () => {
    const old = aged(sam, TIMING.maxSessionAgeMs + 60_000);
    const body = { answers: { q_count: { kind: "text", value: "4" } } };
    refused(await call(putDraft, { formId: "week2interviews" }, { method: "PUT", token: old, body }), 401, "session_expired");
    refused(await call(submit, { formId: "week2interviews" }, { method: "POST", token: old, body }), 401, "session_expired");
    expect(await docExists(`submissions/week2interviews_${sam.uid}`)).toBe(false);
    expect((await docData(`drafts/week2interviews_${sam.uid}`))?.answers ?? {}).toEqual({});
  });

  it("reports an expired sign-in before a role the route does not allow", async () => {
    refused(await call(getOverview, {}, { token: aged(sam, 13 * 3_600_000) }), 401, "session_expired");
    refused(await call(getDashboard, {}, { token: aged(admin, 13 * 3_600_000) }), 401, "session_expired");
  });
});

describe("accounts that stop being valid", () => {
  it(
    "refuses a disabled account on its very next call, and a revoked or deleted one after that",
    async () => {
      const session = await createAccount("short.lived@uci.edu", { claims: { role: "pledge" } });
      const beat = () => call(heartbeat, {}, { method: "POST", token: session.token });
      ok(await beat());

      await testAuth().updateUser(session.uid, { disabled: true });
      const disabled = refused(await beat(), 401, "account_disabled");
      expect(disabled.error).toBe("This account has been disabled.");

      await testAuth().updateUser(session.uid, { disabled: false });
      ok(await beat());

      // Revocation is recorded to the second, so the token must be from an earlier second.
      await sleep(1100);
      await testAuth().revokeRefreshTokens(session.uid);
      refused(await beat(), 401, "session_revoked");

      const fresh = await signIn(session.email);
      ok(await call(heartbeat, {}, { method: "POST", token: fresh.token }));

      await testAuth().deleteUser(session.uid);
      refused(await call(heartbeat, {}, { method: "POST", token: fresh.token }), 401, "account_removed");
    },
    SLOW_TEST_MS,
  );
});

describe("request bodies", () => {
  const post = (options: Parameters<typeof call>[2]) => call(heartbeat, {}, { method: "POST", token: sam.token, ...options });

  describe("content type", () => {
    it.each<[string, string | null]>([
      ["no Content-Type", null],
      ["text/plain", "text/plain"],
      ["a form post", "application/x-www-form-urlencoded"],
      ["multipart", "multipart/form-data; boundary=x"],
      ["text/json", "text/json"],
    ])("refuses %s", async (_label, contentType) => {
      refused(await post({ contentType, rawBody: "{}" }), 415, "unsupported_media_type");
    });

    it.each(["application/json", "application/json; charset=utf-8", "APPLICATION/JSON"])("accepts %s", async (contentType) => {
      expect(ok(await post({ contentType, rawBody: "{}" }))).toEqual({ ok: true });
    });
  });

  describe("JSON", () => {
    it.each<[string, string]>([
      ["plain text", "final=true"],
      ["truncated JSON", '{"final": tr'],
      ["single-quoted JSON", "{'final': true}"],
      ["a trailing comma", '{"final": true,}'],
      ["JavaScript", "undefined"],
      ["XML", "<final>true</final>"],
    ])("refuses %s", async (_label, rawBody) => {
      const body = refused(await post({ rawBody }), 400, "bad_json");
      expect(body.error).toBe("The request wasn't valid JSON.");
    });

    it("treats an empty body as an empty object", async () => {
      expect(ok(await post({ rawBody: "" }))).toEqual({ ok: true });
    });

    it.each<[string, string]>([
      ["an array", "[1, 2, 3]"],
      ["a string", '"final"'],
      ["a number", "42"],
      ["null", "null"],
      ["true", "true"],
    ])("turns valid JSON that is %s into a validation error, not a crash", async (_label, rawBody) => {
      const submitted = refused(
        await call(submit, { formId: "week2interviews" }, { method: "POST", token: sam.token, rawBody }),
        422,
        "invalid",
      );
      // A body that is not an object cannot say which version was answered, which is asked first.
      expect(fieldCodes(submitted)).toEqual(["formVersion:required"]);

      const created = refused(await call(createPledge, {}, { method: "POST", token: admin.token, rawBody }), 422, "invalid");
      expect(fieldCodes(created)).toEqual(["displayName:required", "email:invalid_email"]);

      refused(
        await call(putAdminForm, { formId: "week3mvpscope" }, { method: "PUT", token: admin.token, rawBody }),
        400,
        "bad_request",
      );
    });
  });

  describe("size", () => {
    it("accepts a body of exactly the small limit and refuses one byte more", async () => {
      expect(ok(await post({ rawBody: paddedJson(LIMITS.smallBodyBytes) }))).toEqual({ ok: true });
      const body = refused(await post({ rawBody: paddedJson(LIMITS.smallBodyBytes + 1) }), 413, "too_large");
      expect(body.error).toBe("That's too much data to send at once.");
    });

    it("counts bytes, not characters", async () => {
      const euros = JSON.stringify({ pad: "€".repeat(6000) });
      expect(euros.length).toBeLessThan(LIMITS.smallBodyBytes);
      expect(Buffer.byteLength(euros, "utf8")).toBeGreaterThan(LIMITS.smallBodyBytes);
      refused(await post({ rawBody: euros }), 413, "too_large");
    });

    it("refuses on the declared Content-Length alone", async () => {
      const result = await post({ rawBody: "{}", headers: { "content-length": String(LIMITS.smallBodyBytes + 1) } });
      refused(result, 413, "too_large");
    });

    it("gives answers a larger allowance than other requests, with its own ceiling", async () => {
      const draft = (bytes: number) =>
        call(putDraft, { formId: "week2interviews" }, { method: "PUT", token: sam.token, rawBody: paddedJson(bytes, { answers: {} }) });
      ok(await draft(LIMITS.smallBodyBytes * 4));
      ok(await draft(LIMITS.answersBodyBytes));
      refused(await draft(LIMITS.answersBodyBytes + 1), 413, "too_large");
    });

    it("refuses an oversized submission without storing anything", async () => {
      const rawBody = paddedJson(LIMITS.answersBodyBytes + 1, { answers: {} });
      refused(await call(submit, { formId: "week2interviews" }, { method: "POST", token: sam.token, rawBody }), 413, "too_large");
      expect(await docExists(`submissions/week2interviews_${sam.uid}`)).toBe(false);
    });

    it("refuses an oversized form definition and leaves the form as it was", async () => {
      const before = ok<AdminFormDto>(await call(getAdminForm, { formId: "week3mvpscope" }, { token: admin.token }));
      const rawBody = paddedJson(LIMITS.formBodyBytes + 1, { ...before, expectedVersion: before.version, title: "Changed" });
      refused(await call(putAdminForm, { formId: "week3mvpscope" }, { method: "PUT", token: admin.token, rawBody }), 413, "too_large");
      const after = ok<AdminFormDto>(await call(getAdminForm, { formId: "week3mvpscope" }, { token: admin.token }));
      expect(after).toMatchObject({ title: before.title, version: before.version });
    });

    it("checks who is asking before it looks at the body", async () => {
      const rawBody = paddedJson(LIMITS.smallBodyBytes + 1);
      refused(await call(heartbeat, {}, { method: "POST", rawBody }), 401, "unauthenticated");
      refused(await call(createPledge, {}, { method: "POST", token: sam.token, rawBody }), 403, "forbidden");
      refused(await call(createPledge, {}, { method: "POST", token: sam.token, rawBody: "not json" }), 403, "forbidden");
    });
  });
});

describe("path ids", () => {
  const UNSAFE_IDS: Array<[string, string]> = [
    ["parent traversal", ".."],
    ["a path into another collection", "../users/abc"],
    ["a nested path", "week2interviews/extra"],
    ["an encoded slash", "week2interviews%2Fextra"],
    ["a dot", "week2.interviews"],
    ["an underscore", "week2_interviews"],
    ["a hyphen", "week2-interviews"],
    ["a space", "week2 interviews"],
    ["a trailing newline", "week2interviews\n"],
    ["a null byte", "week2interviews\u0000"],
    ["a non-ASCII letter", "wéek2interviews"],
    ["an empty id", ""],
    ["65 characters", "a".repeat(65)],
    ["Firestore's reserved name", "__name__"],
    ["a prototype key", "__proto__"],
  ];

  it.each(UNSAFE_IDS)("treats a form id with %s as not found", async (_label, formId) => {
    const body = refused(await call(getForm, { formId }, { token: sam.token }), 404, "not_found");
    expect(body.error).toBe("Not found.");
  });

  it.each(UNSAFE_IDS)("treats a pledge uid with %s as not found, deleting nothing", async (_label, uid) => {
    refused(await call(deletePledge, { uid }, { method: "DELETE", token: admin.token, query: "?confirm=sam.okafor@uci.edu" }), 404, "not_found");
    // Two admins, three actives and six pledges, as seeded.
    expect(await countAll("users")).toBe(SEEDED_ACCOUNTS);
  });

  it("refuses when any one id in the path is unsafe", async () => {
    const bad = `${sam.uid}/../../users/${sam.uid}`;
    refused(await call(deleteResponse, { formId: "week0onboarding", uid: bad }, { method: "DELETE", token: admin.token }), 404, "not_found");
    refused(await call(deleteResponse, { formId: "../forms", uid: sam.uid }, { method: "DELETE", token: admin.token }), 404, "not_found");
    expect(await docExists(`submissions/week0onboarding_${sam.uid}`)).toBe(true);
  });

  it("does not let a pledge address another pledge's response by building its document id", async () => {
    expect(await docExists(`submissions/week1reflection_${avery.uid}`)).toBe(true);
    const composed = `week1reflection_${avery.uid}`;
    refused(await call(getSubmission, { formId: composed }, { token: sam.token }), 404, "not_found");
    refused(await call(getForm, { formId: composed }, { token: sam.token }), 404, "not_found");
  });

  it("accepts an id of exactly 64 safe characters, which is then simply not found as a form", async () => {
    const body = refused(await call(getForm, { formId: "a".repeat(64) }, { token: sam.token }), 404, "not_found");
    expect(body.error).toBe("That deliverable doesn't exist.");
  });

  it("refuses an unsafe id before it reads the body", async () => {
    const result = await call(submit, { formId: "../x" }, { method: "POST", token: sam.token, rawBody: "not json" });
    refused(result, 404, "not_found");
  });

  it("tells an anonymous or wrong-role caller nothing about ids", async () => {
    refused(await call(getForm, { formId: "../x" }, {}), 401, "unauthenticated");
    refused(await call(deletePledge, { uid: "../x" }, { method: "DELETE", token: sam.token }), 403, "forbidden");
  });
});

describe("responses", () => {
  it("are never cacheable and never sniffed, on success and on every kind of error", async () => {
    const results = [
      await call(getMe, {}, { token: sam.token }),
      await call(getMe, {}, {}),
      await call(getOverview, {}, { token: sam.token }),
      await call(getForm, { formId: "../x" }, { token: sam.token }),
      await call(heartbeat, {}, { method: "POST", token: sam.token, rawBody: "not json" }),
      await call(heartbeat, {}, { method: "POST", token: sam.token, contentType: "text/plain", rawBody: "{}" }),
      await call(submit, { formId: "week2interviews" }, { method: "POST", token: sam.token, body: { answers: {} } }),
    ];
    expect(results.map((result) => result.status)).toEqual([200, 401, 403, 404, 400, 415, 422]);
    for (const result of results) {
      expect(result.headers.get("cache-control")).toBe("no-store");
      expect(result.headers.get("x-content-type-options")).toBe("nosniff");
      expect(result.headers.get("content-type")).toMatch(/^application\/json/);
    }
  });

  it("describe an error with a message and a code, and nothing about the server's internals", async () => {
    const results = [
      await call(getMe, {}, {}),
      await call(getMe, {}, { token: "not.a.token" }),
      await call(getOverview, {}, { token: sam.token }),
      await call(getForm, { formId: "doesnotexist" }, { token: sam.token }),
    ];
    for (const result of results) {
      expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
      expect(result.text).not.toMatch(/firebase|firestore|stack|\bat \w+ \(|node_modules/i);
    }
  });
});

describe("rate limit", () => {
  it(
    "allows 120 requests a minute from one account, refuses the next, and leaves other accounts alone",
    async () => {
      const statuses: number[] = [];
      for (let batch = 0; batch < 6; batch += 1) {
        const results = await Promise.all(Array.from({ length: 20 }, () => call(getMe, {}, { token: sam.token })));
        statuses.push(...results.map((result) => result.status));
      }
      expect(statuses).toHaveLength(RATE_LIMITS.perMinute);
      expect(statuses.every((status) => status === 200)).toBe(true);

      const body = refused(await call(getMe, {}, { token: sam.token }), 429, "rate_limited");
      expect(body.error).toBe("Too many requests. Wait a minute and try again.");
      refused(await call(getDashboard, {}, { token: sam.token }), 429, "rate_limited");

      ok(await call(getMe, {}, { token: avery.token }));
      ok(await call(getMe, {}, { token: admin.token }));
    },
    SLOW_TEST_MS,
  );

  it(
    "allows 30 writes a minute from one account, refuses the next, and leaves other accounts alone",
    async () => {
      const beat = (session: Session) => call(heartbeat, {}, { method: "POST", token: session.token });
      const statuses: number[] = [];
      for (let index = 0; index < RATE_LIMITS.writesPerMinute; index += 1) statuses.push((await beat(sam)).status);
      expect(statuses).toHaveLength(30);
      expect(statuses.every((status) => status === 200)).toBe(true);

      const body = refused(await beat(sam), 429, "rate_limited");
      expect(body.error).toBe("Too many requests. Wait a minute and try again.");

      ok(await beat(avery));
      ok(await beat(admin));
    },
    SLOW_TEST_MS,
  );

  it(
    "counts every method that is not GET as a write, across routes, except turning a deliverable in",
    async () => {
      const draft = () =>
        call(putDraft, { formId: "week2interviews" }, { method: "PUT", token: sam.token, body: { answers: {} } });
      const beat = () => call(heartbeat, {}, { method: "POST", token: sam.token });
      // 15 PUTs and 15 POSTs: thirty writes between two routes.
      for (let index = 0; index < RATE_LIMITS.writesPerMinute / 2; index += 1) {
        ok(await draft());
        ok(await beat());
      }
      const answers = { q_count: { kind: "text", value: "4" } };
      refused(await call(putDraft, { formId: "week2interviews" }, { method: "PUT", token: sam.token, body: { answers } }), 429, "rate_limited");
      expect((await docData(`drafts/week2interviews_${sam.uid}`))?.answers).toEqual({});
      // A submit is never held back by the autosaves before it. This one gets past the
      // ceiling and is judged on its answers, which are incomplete.
      const submitted = refused(
        await call(submit, { formId: "week2interviews" }, { method: "POST", token: sam.token, body: { answers, formVersion: 1 } }),
        422,
        "invalid",
      );
      expect(fieldCodes(submitted)).toContain("answers.q_surprise:required");
      expect(await docExists(`submissions/week2interviews_${sam.uid}`)).toBe(false);
      // Reading carries on while further changes are refused.
      ok(await call(getMe, {}, { token: sam.token }));
    },
    SLOW_TEST_MS,
  );

  it("does not count reads as writes: an account can still write after more than 30 reads", async () => {
    for (let index = 0; index < RATE_LIMITS.writesPerMinute + 5; index += 1) ok(await call(getMe, {}, { token: sam.token }));
    ok(await call(heartbeat, {}, { method: "POST", token: sam.token }));
  });

  it("refuses an admin's writes on the same terms", async () => {
    const beat = () => call(heartbeat, {}, { method: "POST", token: admin.token });
    for (let index = 0; index < RATE_LIMITS.writesPerMinute; index += 1) ok(await beat());
    refused(await beat(), 429, "rate_limited");
    const refusedCreate = await call(createPledge, {}, {
      method: "POST",
      token: admin.token,
      body: { email: "over.limit@uci.edu", displayName: "Over Limit" },
    });
    refused(refusedCreate, 429, "rate_limited");
    await expect(testAuth().getUserByEmail("over.limit@uci.edu")).rejects.toMatchObject({ code: "auth/user-not-found" });
  });

  it("does not count requests that were refused before the account was known", async () => {
    for (let index = 0; index < 300; index += 1) await call(getMe, {}, { token: "not.a.token" });
    for (let index = 0; index < 60; index += 1) await call(heartbeat, {}, { method: "POST", token: "not.a.token" });
    ok(await call(getMe, {}, { token: sam.token }));
    ok(await call(heartbeat, {}, { method: "POST", token: sam.token }));
  });
});

describe("Firestore rules: no direct access from a browser", () => {
  const documents = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

  async function firestore(pathAndQuery: string, token: string | null, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
    const response = await fetch(`${documents}${pathAndQuery}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    return { status: response.status, body: (await response.json()) as unknown };
  }

  function expectDenied(result: { status: number; body: unknown }): void {
    expect(result.status, JSON.stringify(result.body)).toBe(403);
    expect(JSON.stringify(result.body)).toContain("PERMISSION_DENIED");
  }

  it("the documents really are there: the emulator's owner token can read them", async () => {
    const profile = await firestore(`/users/${sam.uid}`, "owner");
    expect(profile.status).toBe(200);
    expect(JSON.stringify(profile.body)).toContain(SAM);
    expect((await firestore(`/submissions/week0onboarding_${sam.uid}`, "owner")).status).toBe(200);
    expect((await firestore("/forms/week2interviews", "owner")).status).toBe(200);
    const team = await firestore(`/teams/${TEAM_ATLAS}`, "owner");
    expect(team.status).toBe(200);
    expect(JSON.stringify(team.body)).toContain("Team Atlas");
    const visits = await firestore(`/users/${sam.uid}/sessions`, "owner");
    expect(visits.status).toBe(200);
    expect(JSON.stringify(visits.body)).toContain("activeSeconds");
  });

  it("a pledge on a team cannot read the team, or a teammate's profile, directly", async () => {
    expectDenied(await firestore(`/teams/${TEAM_ATLAS}`, avery.token));
    const jordanUid = (await testAuth().getUserByEmail("jordan.patel@uci.edu")).uid;
    expectDenied(await firestore(`/users/${jordanUid}`, avery.token));
    expectDenied(await firestore(`/users/${jordanUid}/sessions`, avery.token));
  });

  it.each<[string, (session: Session) => string]>([
    ["their own profile", (session) => `/users/${session.uid}`],
    ["another pledge's profile", () => `/users/${avery.uid}`],
    ["the list of users", () => "/users"],
    ["a published form, questions included", () => "/forms/week2interviews"],
    ["a draft form", () => "/forms/pitchfeedback"],
    ["the list of forms", () => "/forms"],
    ["their own submission", (session) => `/submissions/week0onboarding_${session.uid}`],
    ["another pledge's submission", () => `/submissions/week1reflection_${avery.uid}`],
    ["the list of submissions", () => "/submissions"],
    ["the audit log", () => "/auditLog"],
    ["punishments", () => "/punishments"],
    ["drafts", () => "/drafts"],
    ["sessions", () => "/sessions"],
    ["their own visit history", (session) => `/users/${session.uid}/sessions`],
    ["another pledge's visit history", () => `/users/${avery.uid}/sessions`],
    ["the list of teams", () => "/teams"],
    ["a team they are not on", () => `/teams/${TEAM_ATLAS}`],
  ])("a signed-in pledge cannot read %s", async (_label, pathFor) => {
    expectDenied(await firestore(pathFor(sam), sam.token));
  });

  it.each<[string, (session: Session) => string]>([
    ["their own profile", (session) => `/users/${session.uid}`],
    ["a pledge's profile", () => `/users/${avery.uid}`],
    ["the list of users", () => "/users"],
    ["a released deliverable, questions included", () => "/forms/week2interviews"],
    ["a draft deliverable", () => "/forms/pitchfeedback"],
    ["a pledge's response, which the review routes do show them", () => `/submissions/week1reflection_${avery.uid}`],
    ["the list of responses", () => "/submissions"],
    ["drafts", () => "/drafts"],
    ["punishments", () => "/punishments"],
    ["the audit log", () => "/auditLog"],
    ["a pledge's visit history", () => `/users/${avery.uid}/sessions`],
    ["the list of teams", () => "/teams"],
  ])("a signed-in active cannot read %s", async (_label, pathFor) => {
    expectDenied(await firestore(pathFor(priya), priya.token));
  });

  it("an active cannot write: no promoting themselves, and no touching a pledge's work", async () => {
    const promote = await firestore(`/users/${priya.uid}?updateMask.fieldPaths=role`, priya.token, {
      method: "PATCH",
      body: JSON.stringify({ fields: { role: { stringValue: "admin" } } }),
    });
    expectDenied(promote);
    expectDenied(await firestore(`/submissions/week1reflection_${avery.uid}`, priya.token, { method: "DELETE" }));
    expectDenied(await firestore(`/punishments?documentId=fromanactive`, priya.token, { method: "POST", body: JSON.stringify({ fields: { uid: { stringValue: avery.uid } } }) }));
    expect(await docData(`users/${priya.uid}`)).toMatchObject({ role: "active" });
    expect(await docExists(`submissions/week1reflection_${avery.uid}`)).toBe(true);
    expect(await docExists("punishments/fromanactive")).toBe(false);
  });

  it("a signed-in portal admin cannot read directly either", async () => {
    expectDenied(await firestore(`/users/${admin.uid}`, admin.token));
    expectDenied(await firestore("/auditLog", admin.token));
    expectDenied(await firestore("/submissions", admin.token));
  });

  it("an anonymous caller cannot read", async () => {
    expectDenied(await firestore(`/users/${sam.uid}`, null));
    expectDenied(await firestore("/forms", null));
  });

  it("a pledge cannot query a collection", async () => {
    const response = await fetch(`${documents}:runQuery`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${sam.token}` },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "submissions" }], limit: 5 } }),
    });
    const text = await response.text();
    expect(text).toContain("PERMISSION_DENIED");
    expect(text).not.toContain("formSnapshot");
  });

  it("a pledge cannot query everyone's visit history as a collection group, or the members of a team", async () => {
    const run = async (structuredQuery: Record<string, unknown>): Promise<string> => {
      const response = await fetch(`${documents}:runQuery`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${avery.token}` },
        body: JSON.stringify({ structuredQuery }),
      });
      return response.text();
    };
    const visits = await run({ from: [{ collectionId: "sessions", allDescendants: true }], limit: 5 });
    expect(visits).toContain("PERMISSION_DENIED");
    expect(visits).not.toContain("activeSeconds");

    const teammates = await run({
      from: [{ collectionId: "users" }],
      where: { fieldFilter: { field: { fieldPath: "teamId" }, op: "EQUAL", value: { stringValue: TEAM_ATLAS } } },
    });
    expect(teammates).toContain("PERMISSION_DENIED");
    expect(teammates).not.toContain("jordan.patel@uci.edu");
  });

  it("a pledge cannot write: no promoting themselves, forging a submission, or editing history", async () => {
    const promote = await firestore(`/users/${sam.uid}?updateMask.fieldPaths=role`, sam.token, {
      method: "PATCH",
      body: JSON.stringify({ fields: { role: { stringValue: "admin" } } }),
    });
    expectDenied(promote);

    const forge = await firestore(`/submissions?documentId=week2interviews_${sam.uid}`, sam.token, {
      method: "POST",
      body: JSON.stringify({ fields: { formId: { stringValue: "week2interviews" }, uid: { stringValue: sam.uid } } }),
    });
    expectDenied(forge);

    expectDenied(await firestore("/auditLog", sam.token, { method: "POST", body: JSON.stringify({ fields: {} }) }));
    expectDenied(await firestore(`/punishments/anything`, sam.token, { method: "DELETE" }));
    expectDenied(await firestore("/forms/week1reflection", sam.token, { method: "DELETE" }));

    // Nor put themselves on a team, rename one, or mark their own welcome tour as done.
    const joinTeam = await firestore(`/users/${sam.uid}?updateMask.fieldPaths=teamId`, sam.token, {
      method: "PATCH",
      body: JSON.stringify({ fields: { teamId: { stringValue: TEAM_ATLAS } } }),
    });
    expectDenied(joinTeam);
    const renameTeam = await firestore(`/teams/${TEAM_ATLAS}?updateMask.fieldPaths=name`, avery.token, {
      method: "PATCH",
      body: JSON.stringify({ fields: { name: { stringValue: "Renamed by a pledge" } } }),
    });
    expectDenied(renameTeam);
    expectDenied(await firestore(`/teams?documentId=teamofmyown`, sam.token, { method: "POST", body: JSON.stringify({ fields: { name: { stringValue: "Mine" } } }) }));
    expect(await docData(`users/${sam.uid}`)).toMatchObject({ teamId: null });
    expect(await docData(`teams/${TEAM_ATLAS}`)).toMatchObject({ name: "Team Atlas" });
    expect(await countAll("teams")).toBe(1);

    expect(await docData(`users/${sam.uid}`)).toMatchObject({ role: "pledge" });
    expect(await docExists(`submissions/week2interviews_${sam.uid}`)).toBe(false);
    expect(await docExists("forms/week1reflection")).toBe(true);
    expect(await countWhere("auditLog", "action", "form.publish")).toBe(1);
  });
});
