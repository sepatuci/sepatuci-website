/**
 * The demo data itself: who the seed makes, what it does with the extra admin
 * addresses it can be given, and the two brand-new accounts it adds for the
 * local demo when asked. Every other file starts from the default seed, so
 * what they count on is pinned here once.
 */
import { describe, expect, it } from "vitest";
import { GET as getActives } from "@/app/api/portal/admin/actives/route";
import { GET as getOverview } from "@/app/api/portal/admin/pledges/route";
import { GET as getDashboard } from "@/app/api/portal/dashboard/route";
import { POST as heartbeat } from "@/app/api/portal/heartbeat/route";
import { GET as getMe } from "@/app/api/portal/me/route";
import { POST as completeOnboarding } from "@/app/api/portal/onboarding/route";
import { POST as choosePassword } from "@/app/api/portal/password/route";
import { GET as getReviewOverview } from "@/app/api/portal/review/overview/route";
import { TEMPORARY_REUSED, looksTemporary, passwordProblem } from "@/lib/portal/password";
import { resetRateLimits } from "@/lib/portal/server/rate-limit";
import type { ActivesDto, AdminOverviewDto, DashboardDto, MeDto, ReviewOverviewDto } from "@/lib/portal/types";
import { DEMO_ACTIVES, DEMO_ADMINS, FIRST_RUN_ACTIVE, FIRST_RUN_PLEDGE, seed } from "../../scripts/portal/seed-emulator.mjs";
import {
  ADMIN_ONE,
  ADMIN_TWO,
  AVERY,
  CASEY,
  DANA,
  DEMO_PASSWORD,
  JORDAN,
  MARCUS,
  MAYA,
  OWN_PASSWORD,
  PRIYA,
  SAM,
  SEEDED_ACCOUNTS,
  SEED_TIMEOUT_MS,
  SLOW_TEST_MS,
  TEMPORARY_PASSWORD,
  call,
  claimsOf,
  countAll,
  countSessions,
  countWhere,
  docData,
  dumpPortal,
  expectIssuedBetween,
  ok,
  refused,
  signIn,
  signInFailure,
  sleep,
  storedClaims,
  temporaryClaims,
  testAuth,
  testDb,
  uidOf,
  type Session,
} from "./helpers";

/** An address of somebody's own, as PORTAL_DEMO_ADMINS would give it. Not on the server's admin list in these tests. */
const OWN_ADMIN = "own.address@example.org";
const FIRST_RUN = "casey.tran@uci.edu";
const FIRST_RUN_PASSWORD = "FNDR-EDUC-2626";
const FIRST_ACTIVE = "theo.park@uci.edu";
const FIRST_ACTIVE_PASSWORD = "SEPA-CTVE-2626";
const WRONG_PASSWORD = /INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS/;

type SeedOptions = { extraAdmins?: string[]; firstRun?: boolean };
/** The seed with every option it takes. */
const seedWith: (options: SeedOptions) => ReturnType<typeof seed> = seed;

type Dump = Awaited<ReturnType<typeof dumpPortal>>;

/** A dump with the things that differ from one seeding to the next taken out: ids, and the moment it ran. */
function shape(dump: Dump): { accounts: Array<{ email: string }>; documents: Record<string, number> } {
  const accounts = Object.values(dump.accounts)
    .map((account) => {
      const record = account as Record<string, unknown>;
      return {
        email: String(record.email),
        displayName: record.displayName,
        emailVerified: record.emailVerified,
        disabled: record.disabled,
        claims: record.claims,
        secondFactors: record.secondFactors,
        hasPassword: record.passwordHash !== null,
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));
  const documents: Record<string, number> = {};
  for (const path of Object.keys(dump.firestore)) {
    const collection = path.includes("/sessions/") ? "sessions" : path.split("/")[0];
    documents[collection] = (documents[collection] ?? 0) + 1;
  }
  return { accounts, documents };
}

describe("the demo seed", () => {
  let byDefault: ReturnType<typeof shape>;

  it(
    "makes two admins, three actives and six pledges by default, and no other admin",
    async () => {
      const seeded = await seed();
      resetRateLimits();
      expect(seeded).toEqual({
        admins: [ADMIN_ONE, ADMIN_TWO],
        extraAdmins: [],
        // Only the people who can sign in are offered: not the invited, not the disabled.
        actives: [PRIYA],
        pledges: [AVERY, JORDAN, MAYA, SAM],
        // The two brand-new accounts are only made when they are asked for.
        firstRun: null,
        firstRunActive: null,
      });
      expect(await countAll("users")).toBe(SEEDED_ACCOUNTS);
      expect((await testAuth().listUsers(1000)).users).toHaveLength(SEEDED_ACCOUNTS);
      expect(await countWhere("users", "role", "admin")).toBe(2);
      expect(await countWhere("users", "role", "active")).toBe(3);
      expect(await countWhere("users", "role", "pledge")).toBe(6);
      // Two anonymous reports from earlier days, one of them already reviewed,
      // each holding only what any report holds.
      const reports = (await testDb().collection("reports").get()).docs.map((doc) => doc.data());
      expect(reports.map((report) => report.status).sort()).toEqual(["new", "reviewed"]);
      for (const report of reports) {
        expect(Object.keys(report).sort()).toEqual(["body", "receivedOn", "reviewedAt", "reviewedBy", "status", "topic"]);
      }
      expect(await countAll("reportLimits")).toBe(0);
      for (const email of [FIRST_RUN, FIRST_ACTIVE]) {
        await expect(testAuth().getUserByEmail(email)).rejects.toMatchObject({ code: "auth/user-not-found" });
      }
      byDefault = shape(await dumpPortal());
    },
    SEED_TIMEOUT_MS,
  );

  it("puts nobody on a temporary password by default", async () => {
    const listed = await testAuth().listUsers(1000);
    for (const record of listed.users) {
      expect(record.customClaims?.temp, record.email).toBeUndefined();
      expect(record.customClaims?.tempAt, record.email).toBeUndefined();
      expect(record.customClaims?.tempNew, record.email).toBeUndefined();
    }
    const stored = JSON.stringify(await dumpPortal());
    expect(stored).not.toContain(FIRST_RUN_PASSWORD);
    expect(stored).not.toContain(FIRST_ACTIVE_PASSWORD);
    // No profile carries the fingerprint of one either.
    expect(stored).not.toContain("temporaryPassword");
  });

  it("names the three actives the helpers name, in the three states an account can be in", async () => {
    expect(DEMO_ACTIVES.map((active) => active.email)).toEqual([PRIYA, MARCUS, DANA]);
    // Set up: can sign in. Invited: no password yet. Disabled: has one, and is turned away.
    expect((await signIn(PRIYA)).uid).toBe(await uidOf(PRIYA));
    expect((await testAuth().getUserByEmail(MARCUS)).passwordHash).toBeUndefined();
    expect(await signInFailure(DANA)).toBe("USER_DISABLED");
    expect(await docData(`users/${await uidOf(DANA)}`)).toMatchObject({ role: "active", status: "disabled" });
  });

  it("has the actives who have signed in already through their welcome, and the invited one not", async () => {
    for (const email of [PRIYA, DANA]) {
      const stamp = (await docData(`users/${await uidOf(email)}`))?.onboardedAt as { toMillis(): number } | null;
      expect(stamp, email).not.toBeNull();
      expect(stamp?.toMillis(), email).toBeLessThan(Date.now() - 23 * 86_400_000);
    }
    expect((await docData(`users/${await uidOf(MARCUS)}`))?.onboardedAt).toBeNull();
    // So an admin sees the set-up active as set up, and the invited one as invited.
    const actives = ok<{ actives: Array<{ email: string; accountState: string }> }>(await call(getActives, {}, { token: (await signIn(ADMIN_ONE)).token })).actives;
    expect(Object.fromEntries(actives.map((active) => [active.email, active.accountState]))).toEqual({
      [PRIYA]: "active",
      [MARCUS]: "invited",
      [DANA]: "disabled",
    });
  });

  it(
    "adds the extra admins it is given on top of the demo ones, and changes nothing else",
    async () => {
      const seeded = await seed({ extraAdmins: [OWN_ADMIN] });
      resetRateLimits();
      expect(seeded.admins).toEqual(DEMO_ADMINS);
      expect(seeded.extraAdmins).toEqual([OWN_ADMIN]);
      expect(seeded.actives).toEqual([PRIYA]);
      expect(seeded.pledges).toEqual([AVERY, JORDAN, MAYA, SAM]);
      expect(seeded.firstRun).toBeNull();
      expect(seeded.firstRunActive).toBeNull();

      expect(await countAll("users")).toBe(SEEDED_ACCOUNTS + 1);
      expect(await countWhere("users", "role", "admin")).toBe(3);
      expect(await countWhere("users", "role", "active")).toBe(3);
      expect(await countWhere("users", "role", "pledge")).toBe(6);

      const record = await testAuth().getUserByEmail(OWN_ADMIN);
      expect(record.customClaims).toEqual({ role: "admin" });
      expect(record.emailVerified).toBe(true);
      expect(await docData(`users/${record.uid}`)).toMatchObject({ email: OWN_ADMIN, role: "admin", status: "active", displayName: "own.address" });
    },
    SEED_TIMEOUT_MS,
  );

  it("does not make an extra admin an admin by itself: the server's own list has to name them too", async () => {
    // Seeded with the admin claim, and able to sign in, but not in PORTAL_ADMIN_EMAILS here.
    const session = await signIn(OWN_ADMIN);
    for (const result of [
      await call(getMe, {}, { token: session.token }),
      await call(getOverview, {}, { token: session.token }),
      await call(getActives, {}, { token: session.token }),
    ]) {
      const body = refused(result, 403, "forbidden");
      expect(body.error).toBe("This account doesn't have access to the portal.");
    }
    // The demo admins, who are on the list, are unaffected.
    expect(ok<MeDto>(await call(getMe, {}, { token: (await signIn(ADMIN_ONE)).token })).role).toBe("admin");
  });

  it(
    "goes back to no extra admins when seeded again without any",
    async () => {
      const seeded = await seed();
      resetRateLimits();
      expect(seeded.extraAdmins).toEqual([]);
      expect(await countWhere("users", "role", "admin")).toBe(2);
      await expect(testAuth().getUserByEmail(OWN_ADMIN)).rejects.toMatchObject({ code: "auth/user-not-found" });
      // The same demo as the first time, account for account and document for document.
      expect(shape(await dumpPortal())).toEqual(byDefault);
    },
    SEED_TIMEOUT_MS,
  );
});

// The local demo asks for two more accounts: a pledge and an active nobody has signed in as,
// each still on the temporary password a chair would hand over, so that the whole first
// visit can be seen for both kinds.
describe("the demo seed, asked for a first run", () => {
  let admin: Session;
  let uid = "";
  let first: Session;
  /** When the seed was asked for, by this clock, to compare with the time it puts on the two accounts. */
  let seededFrom = 0;
  let seededBy = 0;

  it("describes those accounts for the demo to print", () => {
    expect(FIRST_RUN_PLEDGE).toMatchObject({ name: "Casey Tran", email: FIRST_RUN, temporaryPassword: FIRST_RUN_PASSWORD, signedIn: false });
    expect(FIRST_RUN_ACTIVE).toEqual({ name: "Theo Park", email: FIRST_ACTIVE, temporaryPassword: FIRST_ACTIVE_PASSWORD, signedIn: false });
    for (const [password, owner] of [
      [FIRST_RUN_PASSWORD, { email: FIRST_RUN, displayName: "Casey Tran" }],
      [FIRST_ACTIVE_PASSWORD, { email: FIRST_ACTIVE, displayName: "Theo Park" }],
    ] as const) {
      // A password of the kind the portal hands out, which nobody may keep as their own.
      expect(password).toMatch(TEMPORARY_PASSWORD);
      expect(looksTemporary(password)).toBe(true);
      expect(passwordProblem(password, owner)).toBe(TEMPORARY_REUSED);
      expect(passwordProblem(password.toLowerCase(), { ...owner, temporary: true })).toBe(TEMPORARY_REUSED);
    }
    expect(FIRST_RUN_PASSWORD).not.toBe(FIRST_ACTIVE_PASSWORD);
    // Not to be confused with the seeded pledge and active who were sent a link and have no password.
    expect(FIRST_RUN).not.toBe(CASEY);
    expect(FIRST_ACTIVE).not.toBe(MARCUS);
  });

  it(
    "adds exactly those two accounts to the default demo, and says how to sign in to each",
    async () => {
      const byDefault = shape(await dumpPortal());
      seededFrom = Date.now();
      const seeded = await seedWith({ firstRun: true });
      seededBy = Date.now();
      resetRateLimits();
      expect(seeded).toEqual({
        admins: [ADMIN_ONE, ADMIN_TWO],
        extraAdmins: [],
        // Neither is among the accounts with the demo password: each is listed on its own, with its own.
        actives: [PRIYA],
        pledges: [AVERY, JORDAN, MAYA, SAM],
        firstRun: { email: FIRST_RUN, temporaryPassword: FIRST_RUN_PASSWORD },
        firstRunActive: { email: FIRST_ACTIVE, temporaryPassword: FIRST_ACTIVE_PASSWORD },
      });

      expect(await countAll("users")).toBe(SEEDED_ACCOUNTS + 2);
      expect((await testAuth().listUsers(1000)).users).toHaveLength(SEEDED_ACCOUNTS + 2);
      expect(await countWhere("users", "role", "admin")).toBe(2);
      expect(await countWhere("users", "role", "active")).toBe(4);
      expect(await countWhere("users", "role", "pledge")).toBe(7);

      // Everything else is the default demo: the same accounts, and the same number of every kind of document but two profiles.
      const withFirstRun = shape(await dumpPortal());
      expect(withFirstRun.accounts.filter((account) => account.email !== FIRST_RUN && account.email !== FIRST_ACTIVE)).toEqual(byDefault.accounts);
      expect(withFirstRun.documents).toEqual({ ...byDefault.documents, users: byDefault.documents.users + 2 });
    },
    SEED_TIMEOUT_MS,
  );

  it("puts both on a temporary password issued as the seed ran, as accounts that have yet to be welcomed, and nobody else", async () => {
    for (const [email, role] of [
      [FIRST_RUN, "pledge"],
      [FIRST_ACTIVE, "active"],
    ] as const) {
      const claims = (await testAuth().getUserByEmail(email)).customClaims ?? null;
      // The same claims, and no others, that the portal sets on an account it starts this way.
      expect(claims, email).toEqual(temporaryClaims(role, email, true));
      expectIssuedBetween(claims, seededFrom, seededBy);
    }
    const listed = await testAuth().listUsers(1000);
    expect(listed.users.filter((other) => other.customClaims?.temp === true).map((other) => other.email).sort()).toEqual([FIRST_RUN, FIRST_ACTIVE]);
    for (const other of listed.users.filter((record) => record.email !== FIRST_RUN && record.email !== FIRST_ACTIVE)) {
      expect(Object.keys(other.customClaims ?? {}).filter((key) => key.startsWith("temp")), other.email).toEqual([]);
    }
  });

  it("makes the first a pledge who has never signed in, with nothing to their name", async () => {
    const record = await testAuth().getUserByEmail(FIRST_RUN);
    uid = record.uid;
    expect(record.emailVerified).toBe(true);
    expect(record.disabled).toBe(false);
    expect(record.displayName).toBe("Casey Tran");
    expect(record.passwordHash).toBeDefined();
    // The emulator stamps a sign-in time on an account as it is made with a password, which is
    // why the portal does not count one from the first few seconds. There has been none since.
    const madeAt = Date.parse(record.metadata.creationTime);
    expect(Date.parse(record.metadata.lastSignInTime ?? record.metadata.creationTime) - madeAt).toBeLessThan(5_000);

    const profile = await docData(`users/${uid}`);
    expect(profile).toMatchObject({
      email: FIRST_RUN,
      displayName: "Casey Tran",
      role: "pledge",
      status: "active",
      pledgeClass: "Lambda",
      teamId: null,
      onboardedAt: null,
      submitted: {},
      activity: { firstSeenAt: null, lastSeenAt: null, totalActiveSeconds: 0, sessionCount: 0, current: null },
    });
    expect(await countSessions(uid)).toBe(0);
    for (const collection of ["submissions", "drafts", "punishments"]) expect(await countWhere(collection, "uid", uid), collection).toBe(0);
    // The password itself is kept nowhere but on the sign-in account.
    expect(JSON.stringify(profile)).not.toContain(FIRST_RUN_PASSWORD);
  });

  it("makes the second an active who has never signed in, with no class, no team and no welcome yet", async () => {
    const record = await testAuth().getUserByEmail(FIRST_ACTIVE);
    expect(record.emailVerified).toBe(true);
    expect(record.disabled).toBe(false);
    expect(record.displayName).toBe("Theo Park");
    expect(record.passwordHash).toBeDefined();
    const madeAt = Date.parse(record.metadata.creationTime);
    expect(Date.parse(record.metadata.lastSignInTime ?? record.metadata.creationTime) - madeAt).toBeLessThan(5_000);

    const profile = await docData(`users/${record.uid}`);
    expect(profile).toMatchObject({
      email: FIRST_ACTIVE,
      displayName: "Theo Park",
      role: "active",
      status: "active",
      pledgeClass: null,
      teamId: null,
      onboardedAt: null,
      submitted: {},
      activity: { firstSeenAt: null, lastSeenAt: null, totalActiveSeconds: 0, sessionCount: 0, current: null },
    });
    expect(JSON.stringify(profile)).not.toContain(FIRST_ACTIVE_PASSWORD);
    for (const collection of ["submissions", "drafts", "punishments"]) expect(await countWhere(collection, "uid", record.uid), collection).toBe(0);
  });

  it("shows them to an admin as invited, among the pledges", async () => {
    admin = await signIn(ADMIN_ONE);
    const overview = ok<AdminOverviewDto>(await call(getOverview, {}, { token: admin.token }));
    expect(overview.pledges).toHaveLength(7);
    expect(overview.pledges.find((pledge) => pledge.uid === uid)).toMatchObject({
      email: FIRST_RUN,
      displayName: "Casey Tran",
      accountState: "invited",
      status: "active",
      lastSignInAt: null,
      onboardedAt: null,
      submitted: {},
    });
  });

  it("shows the active to an admin as invited, among the actives", async () => {
    const actives = ok<ActivesDto>(await call(getActives, {}, { token: admin.token })).actives;
    expect(actives).toHaveLength(4);
    expect(actives.find((active) => active.email === FIRST_ACTIVE)).toMatchObject({
      displayName: "Theo Park",
      accountState: "invited",
      status: "active",
      signInBlocked: false,
      lastSignInAt: null,
    });
  });

  it("lets them sign in with the temporary password, and do nothing but choose their own", async () => {
    expect(await signInFailure(FIRST_RUN, DEMO_PASSWORD)).toMatch(/INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS/);
    first = await signIn(FIRST_RUN, FIRST_RUN_PASSWORD);
    expect(first.uid).toBe(uid);
    // What the sign-in page reads to greet a new member: the flag, when it was issued, and that they are new.
    expect(claimsOf(first.token)).toMatchObject({ role: "pledge", issued: FIRST_RUN, temp: true, tempNew: true });
    expectIssuedBetween(claimsOf(first.token), seededFrom, seededBy);

    const before = await dumpPortal();
    for (const result of [
      await call(getMe, {}, { token: first.token }),
      await call(getDashboard, {}, { token: first.token }),
      await call(heartbeat, {}, { method: "POST", token: first.token }),
      await call(completeOnboarding, {}, { method: "POST", token: first.token }),
      await call(getOverview, {}, { token: first.token }),
    ]) {
      expect(refused(result, 403, "password_change_required").error).toBe("Choose your own password to continue.");
    }
    // The temporary password itself, and the demo password, are not ones they may choose.
    for (const password of [FIRST_RUN_PASSWORD, FIRST_RUN_PASSWORD.toLowerCase(), DEMO_PASSWORD, "casey-tran-2026"]) {
      const result = refused(await call(choosePassword, {}, { method: "POST", token: first.token, body: { password } }), 422, "invalid");
      expect(result.fields?.map((field) => `${field.path}:${field.code}`)).toEqual(["password:weak_password"]);
    }
    expect(await dumpPortal()).toEqual(before);
  });

  it(
    "takes them from there to their own password and the welcome, like any account that starts this way",
    async () => {
      await sleep(1100);
      expect(ok(await call(choosePassword, {}, { method: "POST", token: first.token, body: { password: OWN_PASSWORD } }))).toEqual({ ok: true });
      expect(await storedClaims(uid)).toEqual({ role: "pledge", issued: FIRST_RUN });
      expect(await signInFailure(FIRST_RUN, FIRST_RUN_PASSWORD)).toMatch(/INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS/);
      refused(await call(getMe, {}, { token: first.token }), 401, "session_revoked");

      const own = await signIn(FIRST_RUN, OWN_PASSWORD);
      expect(ok<MeDto>(await call(getMe, {}, { token: own.token }))).toMatchObject({
        uid,
        email: FIRST_RUN,
        displayName: "Casey Tran",
        role: "pledge",
        pledgeClass: "Lambda",
        team: null,
        onboardedAt: null,
      });
      // A pledge like the others, with the same deliverables the others were set.
      const dashboard = ok<DashboardDto>(await call(getDashboard, {}, { token: own.token }));
      expect(dashboard.forms.length).toBeGreaterThanOrEqual(3);
      expect(dashboard.progress.submitted).toBe(0);

      const welcomed = ok<{ onboardedAt: string }>(await call(completeOnboarding, {}, { method: "POST", token: own.token }));
      expect(Math.abs(Date.parse(welcomed.onboardedAt) - Date.now())).toBeLessThan(60_000);
      expect(ok<{ onboardedAt: string }>(await call(completeOnboarding, {}, { method: "POST", token: own.token }))).toEqual(welcomed);
      refused(await call(choosePassword, {}, { method: "POST", token: own.token, body: { password: "amber-window-thistle-93" } }), 409, "not_required");
    },
    SLOW_TEST_MS,
  );

  it(
    "takes the active the same way: nothing but choosing a password, then the actives' read-only view and their welcome",
    async () => {
      const theoUid = await uidOf(FIRST_ACTIVE);
      expect(await signInFailure(FIRST_ACTIVE, DEMO_PASSWORD)).toMatch(WRONG_PASSWORD);
      // Each of the two has their own: the pledge's does not open the active's account.
      expect(await signInFailure(FIRST_ACTIVE, FIRST_RUN_PASSWORD)).toMatch(WRONG_PASSWORD);
      const theo = await signIn(FIRST_ACTIVE, FIRST_ACTIVE_PASSWORD);
      expect(theo.uid).toBe(theoUid);
      expect(claimsOf(theo.token)).toMatchObject({ role: "active", issued: FIRST_ACTIVE, temp: true, tempNew: true });
      expectIssuedBetween(claimsOf(theo.token), seededFrom, seededBy);

      const before = await dumpPortal();
      for (const result of [
        await call(getMe, {}, { token: theo.token }),
        await call(getReviewOverview, {}, { token: theo.token }),
        await call(getDashboard, {}, { token: theo.token }),
        await call(completeOnboarding, {}, { method: "POST", token: theo.token }),
        await call(getActives, {}, { token: theo.token }),
      ]) {
        expect(refused(result, 403, "password_change_required").error).toBe("Choose your own password to continue.");
      }
      for (const password of [FIRST_ACTIVE_PASSWORD, FIRST_ACTIVE_PASSWORD.toLowerCase(), FIRST_RUN_PASSWORD, DEMO_PASSWORD, "theo-park-reads-all"]) {
        const result = refused(await call(choosePassword, {}, { method: "POST", token: theo.token, body: { password } }), 422, "invalid");
        expect(result.fields?.map((field) => `${field.path}:${field.code}`)).toEqual(["password:weak_password"]);
      }
      expect(await dumpPortal()).toEqual(before);

      await sleep(1100);
      expect(ok(await call(choosePassword, {}, { method: "POST", token: theo.token, body: { password: OWN_PASSWORD } }))).toEqual({ ok: true });
      expect(await storedClaims(theoUid)).toEqual({ role: "active", issued: FIRST_ACTIVE });
      expect(await signInFailure(FIRST_ACTIVE, FIRST_ACTIVE_PASSWORD)).toMatch(WRONG_PASSWORD);
      refused(await call(getReviewOverview, {}, { token: theo.token }), 401, "session_revoked");

      const own = await signIn(FIRST_ACTIVE, OWN_PASSWORD);
      expect("temp" in claimsOf(own.token) || "tempAt" in claimsOf(own.token) || "tempNew" in claimsOf(own.token)).toBe(false);
      expect(ok<MeDto>(await call(getMe, {}, { token: own.token }))).toMatchObject({ uid: theoUid, email: FIRST_ACTIVE, displayName: "Theo Park", role: "active", pledgeClass: null, team: null, onboardedAt: null });
      // An active like the others: every pledge's work to read, and nothing of a pledge's or an admin's to do.
      expect(ok<ReviewOverviewDto>(await call(getReviewOverview, {}, { token: own.token })).pledges.length).toBeGreaterThanOrEqual(5);
      refused(await call(getDashboard, {}, { token: own.token }), 403, "forbidden");
      refused(await call(getActives, {}, { token: own.token }), 403, "forbidden");

      const welcomed = ok<{ onboardedAt: string }>(await call(completeOnboarding, {}, { method: "POST", token: own.token }));
      expect(Math.abs(Date.parse(welcomed.onboardedAt) - Date.now())).toBeLessThan(60_000);
      refused(await call(choosePassword, {}, { method: "POST", token: own.token, body: { password: "amber-window-thistle-93" } }), 409, "not_required");
    },
    SLOW_TEST_MS,
  );

  it(
    "is gone again when the demo is seeded without it, and when firstRun is given as false",
    async () => {
      for (const options of [{ firstRun: false }, {}]) {
        const seeded = await seedWith(options);
        resetRateLimits();
        expect(seeded.firstRun).toBeNull();
        expect(seeded.firstRunActive).toBeNull();
        expect(await countAll("users")).toBe(SEEDED_ACCOUNTS);
        expect(await countWhere("users", "role", "pledge")).toBe(6);
        expect(await countWhere("users", "role", "active")).toBe(3);
        for (const email of [FIRST_RUN, FIRST_ACTIVE]) {
          await expect(testAuth().getUserByEmail(email)).rejects.toMatchObject({ code: "auth/user-not-found" });
        }
      }
    },
    SEED_TIMEOUT_MS,
  );

  it("can be asked for together with extra admins", async () => {
    const seeded = await seedWith({ extraAdmins: [OWN_ADMIN], firstRun: true });
    resetRateLimits();
    expect(seeded.extraAdmins).toEqual([OWN_ADMIN]);
    expect(seeded.firstRun).toEqual({ email: FIRST_RUN, temporaryPassword: FIRST_RUN_PASSWORD });
    expect(seeded.firstRunActive).toEqual({ email: FIRST_ACTIVE, temporaryPassword: FIRST_ACTIVE_PASSWORD });
    expect(await countAll("users")).toBe(SEEDED_ACCOUNTS + 3);
    expect(await countWhere("users", "role", "admin")).toBe(3);
    expect(await countWhere("users", "role", "active")).toBe(4);
    expect(await countWhere("users", "role", "pledge")).toBe(7);
    expect((await signIn(FIRST_RUN, FIRST_RUN_PASSWORD)).email).toBe(FIRST_RUN);
    expect((await signIn(FIRST_ACTIVE, FIRST_ACTIVE_PASSWORD)).email).toBe(FIRST_ACTIVE);
  });

  it(
    "issues the two a fresh three days each time it runs, so the demo's accounts never start expired",
    async () => {
      const from = Date.now();
      await seedWith({ firstRun: true });
      const by = Date.now();
      resetRateLimits();
      for (const [email, password] of [
        [FIRST_RUN, FIRST_RUN_PASSWORD],
        [FIRST_ACTIVE, FIRST_ACTIVE_PASSWORD],
      ] as const) {
        const session = await signIn(email, password);
        expectIssuedBetween(claimsOf(session.token), from, by);
        // Not expired: told to choose a password, which is what an account in its three days is told.
        refused(await call(getMe, {}, { token: session.token }), 403, "password_change_required");
      }
    },
    SEED_TIMEOUT_MS,
  );
});
