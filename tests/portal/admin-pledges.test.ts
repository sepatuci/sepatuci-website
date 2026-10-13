/**
 * Admin management of pledge accounts and punishments. Tests run in order from
 * a fresh seed: read-only checks first, then creation, then the changes that
 * disable and finally remove seeded pledges.
 */
import { Timestamp } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getResponses } from "@/app/api/portal/admin/forms/[formId]/responses/route";
import { POST as createInviteLink } from "@/app/api/portal/admin/pledges/[uid]/invite-link/route";
import { POST as addPunishment } from "@/app/api/portal/admin/pledges/[uid]/punishments/route";
import { DELETE as removePledge, GET as getPledgeDetail, PATCH as updatePledge } from "@/app/api/portal/admin/pledges/[uid]/route";
import { POST as issuePassword } from "@/app/api/portal/admin/pledges/[uid]/temporary-password/route";
import { GET as getOverview, POST as createPledge } from "@/app/api/portal/admin/pledges/route";
import { DELETE as deletePunishment, PATCH as updatePunishment } from "@/app/api/portal/admin/punishments/[id]/route";
import { GET as getDashboard } from "@/app/api/portal/dashboard/route";
import { GET as getForm } from "@/app/api/portal/forms/[formId]/route";
import { POST as heartbeat } from "@/app/api/portal/heartbeat/route";
import { GET as getMe } from "@/app/api/portal/me/route";
import { POST as completeOnboarding } from "@/app/api/portal/onboarding/route";
import { LIMITS } from "@/lib/portal/constants";
import { resetRateLimits } from "@/lib/portal/server/rate-limit";
import type {
  AdminOverviewDto,
  CreatePledgeResultDto,
  DashboardDto,
  FormResponsesDto,
  InviteLinkDto,
  MeDto,
  PledgeDetailDto,
  PledgeRowDto,
  PunishmentDto,
} from "@/lib/portal/types";
import {
  ADMIN_ONE,
  ADMIN_TWO,
  AVERY,
  A_KEPT_FINGERPRINT,
  CASEY,
  DANA,
  JORDAN,
  MARCUS,
  MAYA,
  PRIYA,
  RILEY,
  SAM,
  SEEDED_ACCOUNTS,
  SEED_TIMEOUT_MS,
  SLOW_TEST_MS,
  TEAM_ATLAS,
  TEMPORARY_PASSWORD,
  attachSecondFactor,
  call,
  countAll,
  countSessions,
  countWhere,
  detachSecondFactors,
  docData,
  docExists,
  everyStoredFingerprint,
  fieldCodes,
  fingerprintLeak,
  ok,
  redeemResetCode,
  refused,
  seedPortal,
  signIn,
  signInFailure,
  sleep,
  storedAudit,
  storedFingerprint,
  testAuth,
  testDb,
  uidOf,
  type Session,
} from "./helpers";

/** A set-password link for someone who has already been through the welcome tour. */
const INVITE_LINK = /^http:\/\/localhost\/login\/reset\?mode=resetPassword&oobCode=[^&\s]+$/;
/** The same link for someone who has not: it ends by asking for the introduction. */
const WELCOME_LINK = /^http:\/\/localhost\/login\/reset\?mode=resetPassword&oobCode=[^&\s]+&welcome=1$/;

let admin: Session;
let adminTwo: Session;
let avery: Session;
let jordan: Session;
let maya: Session;
let sam: Session;
let rileyUid: string;
let caseyUid: string;

const overview = async (): Promise<AdminOverviewDto> => ok<AdminOverviewDto>(await call(getOverview, {}, { token: admin.token }));
const rowOf = async (uid: string): Promise<PledgeRowDto> => {
  const row = (await overview()).pledges.find((pledge) => pledge.uid === uid);
  if (!row) throw new Error(`No overview row for ${uid}`);
  return row;
};
const detailOf = async (uid: string): Promise<PledgeDetailDto> =>
  ok<PledgeDetailDto>(await call(getPledgeDetail, { uid }, { token: admin.token }));
const create = (body: unknown) => call(createPledge, {}, { method: "POST", token: admin.token, body });
const patch = (uid: string, body: unknown) => call(updatePledge, { uid }, { method: "PATCH", token: admin.token, body });
const remove = (uid: string, confirm: string | null) =>
  call(removePledge, { uid }, { method: "DELETE", token: admin.token, query: confirm === null ? "" : `?confirm=${encodeURIComponent(confirm)}` });
const latestAudit = async () => (await storedAudit())[0];

beforeAll(async () => {
  await seedPortal();
  [admin, adminTwo, avery, jordan, maya, sam] = await Promise.all(
    [ADMIN_ONE, ADMIN_TWO, AVERY, JORDAN, MAYA, SAM].map((email) => signIn(email)),
  );
  [rileyUid, caseyUid] = await Promise.all([uidOf(RILEY), uidOf(CASEY)]);
}, SEED_TIMEOUT_MS);

beforeEach(() => {
  resetRateLimits();
});

describe("overview", () => {
  it("lists every pledge by name with their account state, and no admins", async () => {
    const { pledges } = await overview();
    expect(pledges.map((pledge) => [pledge.displayName, pledge.status, pledge.accountState])).toEqual([
      ["Avery Chen", "active", "active"],
      ["Casey Kim", "active", "invited"],
      ["Jordan Patel", "active", "active"],
      ["Maya Rodriguez", "active", "active"],
      ["Riley Nguyen", "disabled", "disabled"],
      ["Sam Okafor", "active", "active"],
    ]);
    expect(pledges.map((pledge) => pledge.email)).not.toContain(ADMIN_ONE);
    expect(pledges.map((pledge) => pledge.email)).not.toContain(ADMIN_TWO);
    // Nor the actives, who have accounts of the same making and are managed on a page of their own.
    for (const email of [PRIYA, MARCUS, DANA]) expect(pledges.map((pledge) => pledge.email)).not.toContain(email);
  });

  it("shows a pledge who has never signed in as invited, with no activity", async () => {
    expect(await rowOf(caseyUid)).toMatchObject({
      email: CASEY,
      accountState: "invited",
      lastSignInAt: null,
      submitted: {},
      activePunishments: 0,
      activity: { firstSeenAt: null, lastSeenAt: null, totalActiveSeconds: 0, sessionCount: 0, currentSessionStartedAt: null },
    });
  });

  // Sign-in is a password alone. A second factor attached to an account through Firebase is not
  // something the portal set up, and says nothing of whether its owner has ever reached the portal.
  it("goes by nothing but a visit or a sign-in: a second factor attached through Firebase leaves that pledge invited, and is not shown", async () => {
    const before = await rowOf(caseyUid);
    await attachSecondFactor(caseyUid);
    try {
      const row = await rowOf(caseyUid);
      expect(row).toEqual(before);
      expect(row.accountState).toBe("invited");
      expect(row).not.toHaveProperty("mfaEnrolled");
      expect((await detailOf(caseyUid)).pledge).toEqual(before);
    } finally {
      await detachSecondFactors(caseyUid);
    }
    expect(await rowOf(caseyUid)).toEqual(before);
  });

  it("carries each pledge's submissions, lateness, time on site and active punishments", async () => {
    const jordanRow = await rowOf(jordan.uid);
    expect(Object.keys(jordanRow.submitted).sort()).toEqual(["week0onboarding", "week1reflection"]);
    expect(jordanRow.submitted.week0onboarding.late).toBe(true);
    expect(jordanRow.submitted.week1reflection.late).toBe(false);
    // Jordan's only punishment is resolved.
    expect(jordanRow.activePunishments).toBe(0);
    expect(jordanRow.activity).toMatchObject({ totalActiveSeconds: 188 * 60, sessionCount: 4 });

    expect(await rowOf(sam.uid)).toMatchObject({ activePunishments: 1, pledgeClass: "Lambda" });
  });

  it("counts responses per deliverable", async () => {
    const counts = Object.fromEntries((await overview()).forms.map((form) => [form.id, form.responseCount]));
    expect(counts).toEqual({
      week0onboarding: 5,
      week1reflection: 2,
      week2interviews: 2,
      week2synthesis: 0,
      week3mvpscope: 0,
      pitchfeedback: 0,
    });
  });

  it("never includes credentials", async () => {
    const result = await call(getOverview, {}, { token: admin.token });
    expect(result.text).not.toMatch(/password|salt|oobCode|refreshToken|customClaims/i);
  });

  it("lists the teams with how many pledges are on each, and says which team each pledge is on", async () => {
    const view = await overview();
    expect(view.teams).toHaveLength(1);
    expect(view.teams[0]).toMatchObject({ id: TEAM_ATLAS, name: "Team Atlas", memberCount: 2 });
    expect(Object.keys(view.teams[0]).sort()).toEqual(["createdAt", "id", "memberCount", "name"]);
    expect(Date.parse(view.teams[0].createdAt)).toBeLessThan(Date.now() - 9 * 86_400_000);
    expect(view.pledges.map((pledge) => [pledge.displayName, pledge.teamId])).toEqual([
      ["Avery Chen", TEAM_ATLAS],
      ["Casey Kim", null],
      ["Jordan Patel", TEAM_ATLAS],
      ["Maya Rodriguez", null],
      ["Riley Nguyen", null],
      ["Sam Okafor", null],
    ]);
  });

  it("says when each pledge finished the welcome tour, and null for those who have not", async () => {
    const toured = Object.fromEntries((await overview()).pledges.map((pledge) => [pledge.displayName, pledge.onboardedAt]));
    // In the seed Jordan has signed in but not been through the tour, and Casey has never signed in.
    expect(toured["Jordan Patel"]).toBeNull();
    expect(toured["Casey Kim"]).toBeNull();
    for (const name of ["Avery Chen", "Maya Rodriguez", "Riley Nguyen", "Sam Okafor"]) {
      expect(toured[name], name).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(Date.parse(toured[name] ?? "")).toBeLessThan(Date.now() - 19 * 86_400_000);
    }
  });
});

describe("pledge detail", () => {
  it("gathers one pledge's standing, responses, punishments and visits", async () => {
    const detail = await detailOf(sam.uid);
    expect(detail.pledge).toMatchObject({ uid: sam.uid, email: SAM, displayName: "Sam Okafor", activePunishments: 1 });
    expect(detail.forms).toHaveLength(6);
    expect(Object.fromEntries(detail.forms.map((form) => [form.id, form.responseCount]))).toMatchObject({
      week0onboarding: 1,
      week1reflection: 0,
    });
    expect(detail.submissions.map((submission) => submission.formId)).toEqual(["week0onboarding"]);
    expect(detail.punishments.map((punishment) => [punishment.title, punishment.status])).toEqual([
      ["Missed the Week 1 deliverable", "active"],
    ]);
    // The seed gives Sam six past visits.
    expect(detail.sessions).toHaveLength(6);
    expect(detail.sessions.every((session) => !session.current)).toBe(true);
    const starts = detail.sessions.map((session) => Date.parse(session.startedAt));
    expect(starts).toEqual([...starts].sort((a, b) => b - a));
  });

  it("includes resolved punishments, which the pledge no longer sees", async () => {
    const detail = await detailOf(jordan.uid);
    expect(detail.punishments).toHaveLength(1);
    expect(detail.punishments[0]).toMatchObject({ title: "Late onboarding survey", status: "resolved" });
    expect(detail.punishments[0].resolvedAt).not.toBeNull();
    expect(detail.pledge.activePunishments).toBe(0);
  });

  it("is not found for an unknown uid", async () => {
    const body = refused(await call(getPledgeDetail, { uid: "nobody123" }, { token: admin.token }), 404, "not_found");
    expect(body.error).toBe("That account doesn't exist.");
  });

  it("says which team the pledge is on, and lists every team to choose from", async () => {
    const onTeam = await detailOf(jordan.uid);
    expect(onTeam.pledge).toMatchObject({ teamId: TEAM_ATLAS, onboardedAt: null });
    expect(onTeam.teams.map((team) => [team.id, team.name, team.memberCount])).toEqual([[TEAM_ATLAS, "Team Atlas", 2]]);

    const onTheirOwn = await detailOf(sam.uid);
    expect(onTheirOwn.pledge.teamId).toBeNull();
    expect(onTheirOwn.pledge.onboardedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(onTheirOwn.teams).toEqual(onTeam.teams);
  });

  describe("visit history", () => {
    const HOUR = 3_600_000;
    const visits = () => testDb().collection(`users/${caseyUid}/sessions`);
    /** Visit number `index` started that many hours before `base`, and lasted `index + 1` seconds. */
    const visitAt = (base: number, index: number) => ({
      uid: caseyUid,
      startedAt: Timestamp.fromMillis(base - index * HOUR),
      endedAt: Timestamp.fromMillis(base - index * HOUR + 60_000),
      activeSeconds: index + 1,
    });
    let base: number;

    it("returns every visit while there are no more than 200", async () => {
      base = Date.now() - 24 * HOUR;
      const batch = testDb().batch();
      for (let index = 0; index < LIMITS.sessionHistory; index += 1) batch.create(visits().doc(), visitAt(base, index));
      await batch.commit();

      const detail = await detailOf(caseyUid);
      expect(detail.sessions).toHaveLength(200);
      expect(detail.sessions.map((session) => session.activeSeconds)).toEqual(Array.from({ length: 200 }, (_, index) => index + 1));
      expect(detail.sessions.every((session) => !session.current)).toBe(true);
    });

    it("returns only the 200 most recent, newest first, once there are more", async () => {
      const batch = testDb().batch();
      for (let index = LIMITS.sessionHistory; index < LIMITS.sessionHistory + 7; index += 1) batch.create(visits().doc(), visitAt(base, index));
      await batch.commit();
      expect(await countSessions(caseyUid)).toBe(207);

      const detail = await detailOf(caseyUid);
      expect(detail.sessions).toHaveLength(LIMITS.sessionHistory);
      // The seven oldest are left out; the rest are in order from the latest back.
      expect(detail.sessions.map((session) => session.activeSeconds)).toEqual(Array.from({ length: 200 }, (_, index) => index + 1));
      const starts = detail.sessions.map((session) => Date.parse(session.startedAt));
      expect(starts).toEqual([...starts].sort((a, b) => b - a));
      // Visits written before pages, reasons and devices were kept read back with those parts empty.
      expect(detail.sessions[0]).toEqual({
        id: expect.any(String),
        startedAt: new Date(base).toISOString(),
        endedAt: new Date(base + 60_000).toISOString(),
        endReason: "timed_out",
        activeSeconds: 1,
        pageCount: 0,
        device: "",
        current: false,
      });
    });

    it("counts the visit in progress among the 200, at the top, and marks it current while the pledge is around", async () => {
      const now = Timestamp.now();
      await testDb().doc(`users/${caseyUid}`).update({
        "activity.firstSeenAt": now,
        "activity.lastSeenAt": now,
        "activity.sessionCount": 208,
        "activity.current": { startedAt: Timestamp.fromMillis(now.toMillis() - 120_000), lastSeenAt: now, activeSeconds: 120 },
      });

      const detail = await detailOf(caseyUid);
      expect(detail.sessions).toHaveLength(LIMITS.sessionHistory);
      expect(detail.sessions[0]).toMatchObject({ current: true, activeSeconds: 120, endedAt: now.toDate().toISOString() });
      expect(detail.sessions.filter((session) => session.current)).toHaveLength(1);
      // One fewer of the stored visits fits: the 199 most recent.
      expect(detail.sessions.slice(1).map((session) => session.activeSeconds)).toEqual(Array.from({ length: 199 }, (_, index) => index + 1));
    });

    it("shows nobody else's visits, and leaves theirs out of everyone else's history", async () => {
      expect((await detailOf(sam.uid)).sessions).toHaveLength(6);
      expect((await detailOf(jordan.uid)).sessions).toHaveLength(4);
      const caseyStarts = new Set((await detailOf(caseyUid)).sessions.map((session) => session.startedAt));
      for (const session of (await detailOf(sam.uid)).sessions) expect(caseyStarts.has(session.startedAt)).toBe(false);
    });

    it("puts the pledge back as the seed left them, for the tests that follow", async () => {
      const all = await visits().get();
      const batch = testDb().batch();
      all.docs.forEach((doc) => batch.delete(doc.ref));
      batch.update(testDb().doc(`users/${caseyUid}`), {
        activity: { firstSeenAt: null, lastSeenAt: null, totalActiveSeconds: 0, sessionCount: 0, current: null },
      });
      await batch.commit();
      expect(await countSessions(caseyUid)).toBe(0);
      expect(await rowOf(caseyUid)).toMatchObject({ accountState: "invited", activity: { sessionCount: 0, currentSessionStartedAt: null } });
    });
  });
});

describe("creating a pledge", () => {
  it.each<[string, unknown]>([
    ["a Gmail address", "new.pledge@gmail.com"],
    ["a UCI subdomain", "new.pledge@ics.uci.edu"],
    ["a domain that only starts with uci.edu", "new.pledge@uci.edu.evil.example"],
    ["a domain that only ends with uci.edu", "new.pledge@notuci.edu"],
    ["two addresses", "new.pledge@uci.edu,other@uci.edu"],
    ["a display-name form", "New Pledge <new.pledge@uci.edu>"],
    ["no address", ""],
    ["a missing field", undefined],
    ["a number", 12345],
    ["an object", { address: "new.pledge@uci.edu" }],
  ])("refuses an email that is %s", async (_label, email) => {
    const body = refused(await create({ email, displayName: "New Pledge" }), 422, "invalid");
    expect(fieldCodes(body)).toEqual(["email:invalid_email"]);
    expect(body.fields?.[0].message).toBe("Use a @uci.edu email address.");
  });

  it.each([ADMIN_ONE, ADMIN_TWO, "Chair.Two@UCI.edu", "  chair.one@uci.edu  "])(
    "refuses the admin address %s",
    async (email) => {
      const body = refused(await create({ email, displayName: "Not A Pledge" }), 422, "invalid");
      expect(fieldCodes(body)).toEqual(["email:is_admin"]);
    },
  );

  it("requires a name, and reports it together with a bad email", async () => {
    expect(fieldCodes(refused(await create({ email: "new.pledge@uci.edu" }), 422, "invalid"))).toEqual(["displayName:required"]);
    expect(fieldCodes(refused(await create({ email: "new.pledge@uci.edu", displayName: "   " }), 422, "invalid"))).toEqual([
      "displayName:required",
    ]);
    expect(fieldCodes(refused(await create({ email: "nope", displayName: "" }), 422, "invalid"))).toEqual([
      "displayName:required",
      "email:invalid_email",
    ]);
  });

  it("refuses a name or class over the length limit", async () => {
    const longName = await create({ email: "new.pledge@uci.edu", displayName: "x".repeat(LIMITS.displayName + 1) });
    expect(refused(longName, 422, "invalid").fields?.map((field) => field.path)).toEqual(["displayName"]);
    const longClass = await create({ email: "new.pledge@uci.edu", displayName: "New Pledge", pledgeClass: "x".repeat(LIMITS.pledgeClass + 1) });
    expect(fieldCodes(refused(longClass, 422, "invalid"))).toEqual(["pledgeClass:too_long"]);
  });

  // The page that adds a whole class refuses these before it sends them. The server refuses
  // them too, because a name ends up in a spreadsheet next to a password link.
  it.each<[string, string]>([
    ["an equals sign", '=HYPERLINK("https://evil.example")'],
    ["a plus sign", "+1 949 555 0100"],
    ["a hyphen", "-New Pledge"],
    ["an at sign", "@newpledge"],
    ["an equals sign after padding", "   =1+1"],
    ["an equals sign after a tab", "\t=1+1"],
    ["an equals sign after a line break", "\r\n=1+1"],
  ])("refuses a name that starts with %s, however the account is to start", async (_label, displayName) => {
    for (const more of [{}, { start: "link" }, { start: "temporary_password" }]) {
      const body = refused(await create({ email: "new.pledge@uci.edu", displayName, pledgeClass: "Mu", ...more }), 422, "invalid");
      expect(fieldCodes(body)).toEqual(["displayName:invalid"]);
      expect(body.fields?.[0].message).toBe("A name can't start with a symbol.");
    }
  });

  it("does not mind one of those symbols anywhere but the start of a name", async () => {
    // Refused for the address alone, which is not one: the name is not among what is wrong.
    for (const displayName of ["Anne-Marie O'Neil", "Avery (AJ) Chen", "A = B", "'=Avery"]) {
      const body = refused(await create({ email: "nope", displayName }), 422, "invalid");
      expect(fieldCodes(body), displayName).toEqual(["email:invalid_email"]);
    }
  });

  it.each([AVERY, "Avery.Chen@UCI.EDU", RILEY, CASEY])("refuses %s, which already has an account", async (email) => {
    const body = refused(await create({ email, displayName: "Duplicate" }), 409, "email_exists");
    expect(body.error).toBe("An account with that email already exists.");
  });

  it("created nothing for any of the refused requests above", async () => {
    expect(await countAll("users")).toBe(SEEDED_ACCOUNTS);
    expect((await overview()).pledges).toHaveLength(6);
    await expect(testAuth().getUserByEmail("new.pledge@uci.edu")).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect((await storedAudit()).filter((entry) => entry.action === "pledge.create")).toEqual([]);
    expect((await testAuth().getUserByEmail(AVERY)).displayName).toBe("Avery Chen");
  });

  let created: CreatePledgeResultDto;

  it("creates an active pledge and ignores every field it should not accept", async () => {
    created = ok<CreatePledgeResultDto>(
      await create({
        email: "  New.Pledge@UCI.edu ",
        displayName: "  New Pledge ",
        pledgeClass: " Mu ",
        role: "admin",
        status: "disabled",
        uid: "attackerchosenuid",
        emailVerified: false,
        password: "chosen-by-the-admin",
        customClaims: { role: "admin" },
        submitted: { week0onboarding: { submittedAt: "2026-01-01T00:00:00.000Z", late: false } },
        activity: { totalActiveSeconds: 999_999, sessionCount: 99 },
        createdAt: "2000-01-01T00:00:00.000Z",
        createdBy: "someone-else",
      }),
    );
    expect(created.pledge).toMatchObject({
      email: "new.pledge@uci.edu",
      displayName: "New Pledge",
      pledgeClass: "Mu",
      status: "active",
      accountState: "invited",
      lastSignInAt: null,
      submitted: {},
      activePunishments: 0,
      activity: { firstSeenAt: null, lastSeenAt: null, totalActiveSeconds: 0, sessionCount: 0, currentSessionStartedAt: null },
    });
    expect(created.pledge.uid).not.toBe("attackerchosenuid");
    expect(Math.abs(Date.parse(created.pledge.createdAt) - Date.now())).toBeLessThan(60_000);
    // By link, as nothing else was asked for: the password in the request was not used, and none is handed back.
    expect(Object.keys(created).sort()).toEqual(["inviteLink", "pledge", "temporaryPassword"]);
    expect(created.temporaryPassword).toBeNull();
  });

  it("stores a pledge profile, and only the fields a profile has", async () => {
    const profile = await docData(`users/${created.pledge.uid}`);
    expect(profile).toMatchObject({
      email: "new.pledge@uci.edu",
      displayName: "New Pledge",
      role: "pledge",
      status: "active",
      pledgeClass: "Mu",
      createdBy: admin.uid,
      submitted: {},
      activity: { firstSeenAt: null, lastSeenAt: null, totalActiveSeconds: 0, sessionCount: 0, current: null },
      // A new pledge starts on their own, with the welcome tour still to do.
      teamId: null,
      onboardedAt: null,
    });
    expect(Object.keys(profile ?? {}).sort()).toEqual([
      "activity",
      "createdAt",
      "createdBy",
      "displayName",
      "email",
      "onboardedAt",
      "pledgeClass",
      "role",
      "status",
      "submitted",
      "teamId",
      "updatedAt",
    ]);
    expect(created.pledge).toMatchObject({ teamId: null, onboardedAt: null });
  });

  it("creates a sign-in account with the pledge role, a verified email and no password", async () => {
    const record = await testAuth().getUser(created.pledge.uid);
    expect(record.email).toBe("new.pledge@uci.edu");
    // The role, and the address the account was issued to, which every request is checked against.
    expect(record.customClaims).toEqual({ role: "pledge", issued: "new.pledge@uci.edu" });
    expect(record.emailVerified).toBe(true);
    expect(record.disabled).toBe(false);
    expect(record.passwordHash).toBeUndefined();
    expect(await signInFailure("new.pledge@uci.edu", "chosen-by-the-admin")).toMatch(/INVALID|PASSWORD/);
  });

  it("returns a set-password link on this site that carries a one-time code and asks for the welcome introduction", async () => {
    expect(created.inviteLink).toMatch(WELCOME_LINK);
    expect(created.inviteLink?.endsWith("&welcome=1")).toBe(true);
    const link = new URL(created.inviteLink ?? "");
    expect(link.origin).toBe("http://localhost");
    expect(link.pathname).toBe("/login/reset");
    expect([...link.searchParams.keys()]).toEqual(["mode", "oobCode", "welcome"]);
    expect(link.searchParams.get("welcome")).toBe("1");
    expect(link.searchParams.get("oobCode")?.length).toBeGreaterThan(10);
  });

  it("records the creation in the audit log, without the link", async () => {
    const entries = (await storedAudit()).filter((entry) => entry.action === "pledge.create");
    expect(entries).toEqual([
      expect.objectContaining({
        actorUid: admin.uid,
        actorEmail: ADMIN_ONE,
        targetType: "user",
        targetId: created.pledge.uid,
        summary: "Created account for new.pledge@uci.edu",
      }),
    ]);
    const code = new URL(created.inviteLink ?? "").searchParams.get("oobCode") ?? "missing";
    expect(JSON.stringify(await storedAudit())).not.toContain(code);
  });

  it("lets the new pledge choose a password with that link and use the portal as a pledge, never as an admin", async () => {
    const code = new URL(created.inviteLink ?? "").searchParams.get("oobCode") ?? "";
    expect(await redeemResetCode(code, "chosen-by-the-pledge-1")).toBe(true);
    const session = await signIn("new.pledge@uci.edu", "chosen-by-the-pledge-1");
    expect(session.uid).toBe(created.pledge.uid);

    expect(ok<MeDto>(await call(getMe, {}, { token: session.token }))).toMatchObject({
      role: "pledge",
      displayName: "New Pledge",
      pledgeClass: "Mu",
      team: null,
      onboardedAt: null,
    });
    refused(await call(getOverview, {}, { token: session.token }), 403, "forbidden");
    refused(await call(createPledge, {}, { method: "POST", token: session.token, body: {} }), 403, "forbidden");
  });

  it("shows a pledge who joined today only the deliverables that are not already over", async () => {
    const session = await signIn("new.pledge@uci.edu", "chosen-by-the-pledge-1");
    const dashboard = ok<DashboardDto>(await call(getDashboard, {}, { token: session.token }));
    expect(dashboard.forms.map((form) => [form.id, form.state])).toEqual([
      ["week2interviews", "open"],
      ["week2synthesis", "locked"],
      ["week3mvpscope", "upcoming"],
    ]);
    expect(dashboard.progress).toMatchObject({ total: 3, missed: 0, outstanding: 2, upcoming: 1 });
    refused(await call(getForm, { formId: "week1reflection" }, { token: session.token }), 404, "not_found");
  });

  it("accepts a pledge with no class", async () => {
    const result = ok<CreatePledgeResultDto>(await create({ email: "no.class@uci.edu", displayName: "No Class" }));
    expect(result.pledge.pledgeClass).toBeNull();
    expect(result.inviteLink).toMatch(WELCOME_LINK);
  });
});

describe("set-password links", () => {
  const linkFor = async (uid: string): Promise<string> =>
    ok<InviteLinkDto>(await call(createInviteLink, { uid }, { method: "POST", token: admin.token })).inviteLink;

  it("ends the link with the welcome introduction only for a pledge who has not been through the tour", async () => {
    // Casey has never signed in; Jordan has, but has not finished the tour.
    expect(await linkFor(caseyUid)).toMatch(WELCOME_LINK);
    expect(await linkFor(jordan.uid)).toMatch(WELCOME_LINK);
    // Sam and Maya finished it long ago: theirs is a plain password reset.
    for (const uid of [sam.uid, maya.uid]) {
      const link = await linkFor(uid);
      expect(link).toMatch(INVITE_LINK);
      expect(link).not.toContain("welcome");
      expect([...new URL(link).searchParams.keys()]).toEqual(["mode", "oobCode"]);
    }
  });

  it("stops adding the welcome introduction once the pledge has finished the tour", async () => {
    const newPledge = await signIn("new.pledge@uci.edu", "chosen-by-the-pledge-1");
    expect(await linkFor(newPledge.uid)).toMatch(WELCOME_LINK);
    ok(await call(completeOnboarding, {}, { method: "POST", token: newPledge.token }));
    const link = await linkFor(newPledge.uid);
    expect(link).toMatch(INVITE_LINK);
    expect(link.endsWith("&welcome=1")).toBe(false);
  });

  it("creates a fresh link for a pledge who has not signed in yet, and audits it without the link", async () => {
    const before = await countAll("auditLog");
    const { inviteLink } = ok<InviteLinkDto>(await call(createInviteLink, { uid: caseyUid }, { method: "POST", token: admin.token }));
    expect(inviteLink).toMatch(WELCOME_LINK);

    expect(await countAll("auditLog")).toBe(before + 1);
    const entry = await latestAudit();
    expect(entry).toMatchObject({
      action: "pledge.invite_link",
      targetType: "user",
      targetId: caseyUid,
      summary: `Created a set-password link for ${CASEY}`,
    });
    expect(JSON.stringify(entry)).not.toContain(new URL(inviteLink).searchParams.get("oobCode"));
  });

  it("refuses a disabled pledge", async () => {
    const body = refused(await call(createInviteLink, { uid: rileyUid }, { method: "POST", token: admin.token }), 409, "account_disabled");
    expect(body.error).toBe("Re-enable the account before inviting.");
  });

  it("is not found for an unknown uid", async () => {
    refused(await call(createInviteLink, { uid: "nobody123" }, { method: "POST", token: admin.token }), 404, "not_found");
  });
});

describe("admin accounts cannot be changed from inside the portal", () => {
  const attempts = (uid: string, email: string) => [
    ["disable", () => patch(uid, { status: "disabled" })],
    ["rename", () => patch(uid, { displayName: "Renamed" })],
    ["remove", () => remove(uid, email)],
    ["create a set-password link", () => call(createInviteLink, { uid }, { method: "POST", token: admin.token })],
    ["issue a temporary password", () => call(issuePassword, { uid }, { method: "POST", token: admin.token })],
    ["punish", () => call(addPunishment, { uid }, { method: "POST", token: admin.token, body: { title: "Nope" } })],
    ["inspect", () => call(getPledgeDetail, { uid }, { token: admin.token })],
  ] as const;

  it("refuses every action against another admin", async () => {
    const auditBefore = await countAll("auditLog");
    for (const [label, attempt] of attempts(adminTwo.uid, ADMIN_TWO)) {
      const body = refused(await attempt(), 403, "cannot_modify_admin");
      expect(body.error, label).toBe("Admin accounts can't be changed here.");
    }
    expect(await countAll("auditLog")).toBe(auditBefore);
  });

  it("refuses every action against the admin's own account", async () => {
    for (const [, attempt] of attempts(admin.uid, ADMIN_ONE)) refused(await attempt(), 403, "cannot_modify_admin");
  });

  it("left both admins exactly as they were", async () => {
    for (const session of [admin, adminTwo]) {
      const record = await testAuth().getUser(session.uid);
      expect(record.disabled).toBe(false);
      expect(record.customClaims).toEqual({ role: "admin" });
      expect(await docData(`users/${session.uid}`)).toMatchObject({ role: "admin", status: "active" });
      expect(await countWhere("punishments", "uid", session.uid)).toBe(0);
      expect(ok<MeDto>(await call(getMe, {}, { token: session.token })).role).toBe("admin");
    }
    ok(await call(getOverview, {}, { token: adminTwo.token }));
    // Neither was given a temporary password: the one each had still signs in.
    for (const email of [ADMIN_ONE, ADMIN_TWO]) expect((await signIn(email)).email).toBe(email);
  });
});

describe("editing a pledge", () => {
  it("updates the name and class, in the profile and the sign-in account, and audits what changed", async () => {
    expect(ok(await patch(sam.uid, { displayName: "  Samuel Okafor ", pledgeClass: "Nu" }))).toEqual({ ok: true });
    expect(await rowOf(sam.uid)).toMatchObject({ displayName: "Samuel Okafor", pledgeClass: "Nu", status: "active" });
    expect((await testAuth().getUser(sam.uid)).displayName).toBe("Samuel Okafor");
    expect(await latestAudit()).toMatchObject({
      action: "pledge.update",
      targetType: "user",
      targetId: sam.uid,
      actorEmail: ADMIN_ONE,
      summary: `${SAM}: name, class`,
    });
    // The pledge's existing session is unaffected by an edit.
    expect(ok<MeDto>(await call(getMe, {}, { token: sam.token })).displayName).toBe("Samuel Okafor");
  });

  it("clears the class when it is sent empty", async () => {
    ok(await patch(sam.uid, { pledgeClass: "" }));
    expect((await rowOf(sam.uid)).pledgeClass).toBeNull();
    expect((await latestAudit()).summary).toBe(`${SAM}: class`);
  });

  it("writes nothing, and no audit entry, when nothing actually changes", async () => {
    const before = await countAll("auditLog");
    const profileBefore = await docData(`users/${sam.uid}`);
    ok(await patch(sam.uid, { displayName: "Samuel Okafor", pledgeClass: null, status: "active" }));
    ok(await patch(sam.uid, {}));
    expect(await countAll("auditLog")).toBe(before);
    expect(await docData(`users/${sam.uid}`)).toEqual(profileBefore);
  });

  it("ignores fields an admin may not set, such as role, email and submissions", async () => {
    const before = await countAll("auditLog");
    ok(
      await patch(sam.uid, {
        role: "admin",
        email: ADMIN_ONE,
        uid: admin.uid,
        submitted: {},
        activity: { totalActiveSeconds: 0 },
        createdAt: "2000-01-01T00:00:00.000Z",
      }),
    );
    const profile = await docData(`users/${sam.uid}`);
    expect(profile).toMatchObject({ role: "pledge", email: SAM });
    expect(Object.keys(profile?.submitted as object)).toEqual(["week0onboarding"]);
    expect((await testAuth().getUser(sam.uid)).customClaims).toEqual({ role: "pledge", issued: SAM });
    expect(await countAll("auditLog")).toBe(before);
    refused(await call(getOverview, {}, { token: (await signIn(SAM)).token }), 403, "forbidden");
  });

  it.each<[string, unknown, string[]]>([
    ["an empty name", { displayName: "  " }, ["displayName:required"]],
    ["a name that is not text", { displayName: 42 }, ["displayName:required"]],
    ["a class over the limit", { pledgeClass: "x".repeat(LIMITS.pledgeClass + 1) }, ["pledgeClass:too_long"]],
    ["an unknown status", { status: "suspended" }, ["status:invalid"]],
    ["several problems at once", { displayName: "", status: "deleted" }, ["displayName:required", "status:invalid"]],
  ])("refuses %s and changes nothing", async (_label, body, fields) => {
    const before = await docData(`users/${sam.uid}`);
    expect(fieldCodes(refused(await patch(sam.uid, body), 422, "invalid"))).toEqual(fields);
    expect(await docData(`users/${sam.uid}`)).toEqual(before);
  });

  it("is not found for an unknown uid", async () => {
    refused(await patch("nobody123", { displayName: "Ghost" }), 404, "not_found");
  });
});

describe("disabling and re-enabling", () => {
  let before: Session;

  it(
    "cuts a disabled pledge off on their very next request",
    async () => {
      before = await signIn(JORDAN);
      ok(await call(getMe, {}, { token: before.token }));
      // Lets the re-enable test below tell revoked sessions apart: revocation is recorded to the second.
      await sleep(1100);

      expect(ok(await patch(jordan.uid, { status: "disabled" }))).toEqual({ ok: true });

      for (const token of [before.token, jordan.token]) {
        const me = refused(await call(getMe, {}, { token }), 401, "account_disabled");
        expect(me.error).toBe("This account has been disabled.");
        refused(await call(getDashboard, {}, { token }), 401, "account_disabled");
        refused(await call(heartbeat, {}, { method: "POST", token }), 401, "account_disabled");
      }
    },
    SLOW_TEST_MS,
  );

  it("blocks new sign-ins for the disabled pledge", async () => {
    expect(await signInFailure(JORDAN)).toBe("USER_DISABLED");
    expect((await testAuth().getUser(jordan.uid)).disabled).toBe(true);
  });

  it("shows the pledge as disabled, keeps their responses and audits the action", async () => {
    expect(await rowOf(jordan.uid)).toMatchObject({ status: "disabled", accountState: "disabled" });
    expect(await docData(`users/${jordan.uid}`)).toMatchObject({ status: "disabled", role: "pledge" });
    expect(await countWhere("submissions", "uid", jordan.uid)).toBe(2);
    expect(await latestAudit()).toMatchObject({
      action: "pledge.disable",
      targetId: jordan.uid,
      summary: `${JORDAN}: disabled the account`,
    });
  });

  it("stops chasing a disabled pledge for deliverables they have not turned in", async () => {
    const responses = ok<FormResponsesDto>(await call(getResponses, { formId: "week2interviews" }, { token: admin.token }));
    const chased = responses.nonResponders.map((pledge) => pledge.email);
    expect(chased).not.toContain(JORDAN);
    expect(chased).toContain(SAM);
  });

  it("does not hand out a set-password link while the account is disabled", async () => {
    refused(await call(createInviteLink, { uid: jordan.uid }, { method: "POST", token: admin.token }), 409, "account_disabled");
  });

  it("lets a re-enabled pledge sign in again, but does not bring their old sessions back", async () => {
    ok(await patch(jordan.uid, { status: "active" }));
    expect(await latestAudit()).toMatchObject({ action: "pledge.enable", summary: `${JORDAN}: re-enabled the account` });
    expect(await rowOf(jordan.uid)).toMatchObject({ status: "active", accountState: "active" });

    for (const token of [before.token, jordan.token]) {
      refused(await call(getMe, {}, { token }), 401, "session_revoked");
    }
    const fresh = await signIn(JORDAN);
    expect(ok<MeDto>(await call(getMe, {}, { token: fresh.token })).email).toBe(JORDAN);
    expect(ok<DashboardDto>(await call(getDashboard, {}, { token: fresh.token })).progress.submitted).toBe(2);
  });

  it("keeps the pledge on their team, and their tour and punishments as they were, through being disabled and re-enabled", async () => {
    expect(await docData(`users/${jordan.uid}`)).toMatchObject({ teamId: TEAM_ATLAS, onboardedAt: null, status: "active" });
    expect(await countWhere("punishments", "uid", jordan.uid)).toBe(1);
  });

  describe("when the sign-in account and the profile disagree", () => {
    // Reached when an account is disabled in the Firebase console, or when an earlier change
    // got as far as the sign-in account and failed before it reached the profile.
    it("shows a pledge as disabled when only the sign-in account is disabled", async () => {
      await testAuth().updateUser(maya.uid, { disabled: true });
      expect(await docData(`users/${maya.uid}`)).toMatchObject({ status: "active" });
      expect(await rowOf(maya.uid)).toMatchObject({ status: "disabled", accountState: "disabled" });
      expect((await detailOf(maya.uid)).pledge.status).toBe("disabled");
      expect(await signInFailure(MAYA)).toBe("USER_DISABLED");
    });

    it("re-enables the sign-in account on request, even though the profile already says active", async () => {
      const auditBefore = await countAll("auditLog");
      expect(ok(await patch(maya.uid, { status: "active" }))).toEqual({ ok: true });

      expect((await testAuth().getUser(maya.uid)).disabled).toBe(false);
      expect(await docData(`users/${maya.uid}`)).toMatchObject({ status: "active" });
      expect(await rowOf(maya.uid)).toMatchObject({ status: "active", accountState: "active" });
      expect(await countAll("auditLog")).toBe(auditBefore + 1);
      expect(await latestAudit()).toMatchObject({
        action: "pledge.enable",
        targetType: "user",
        targetId: maya.uid,
        summary: `${MAYA}: re-enabled the account`,
      });

      maya = await signIn(MAYA);
      expect(ok<MeDto>(await call(getMe, {}, { token: maya.token })).email).toBe(MAYA);
    });

    it("then treats a second request to enable as nothing to do", async () => {
      const auditBefore = await countAll("auditLog");
      ok(await patch(maya.uid, { status: "active" }));
      expect(await countAll("auditLog")).toBe(auditBefore);
      expect((await testAuth().getUser(maya.uid)).disabled).toBe(false);
    });

    it("re-enables it together with other changes in the same request", async () => {
      await testAuth().updateUser(maya.uid, { disabled: true });
      ok(await patch(maya.uid, { status: "active", pledgeClass: "Nu" }));
      expect((await testAuth().getUser(maya.uid)).disabled).toBe(false);
      expect(await docData(`users/${maya.uid}`)).toMatchObject({ status: "active", pledgeClass: "Nu" });
      expect((await latestAudit()).summary).toBe(`${MAYA}: class, re-enabled the account`);
      ok(await patch(maya.uid, { pledgeClass: "Lambda" }));
      maya = await signIn(MAYA);
    });

    it("leaves a sign-in account disabled when the request does not ask for a status", async () => {
      await testAuth().updateUser(maya.uid, { disabled: true });
      ok(await patch(maya.uid, { displayName: "Maya R." }));
      expect((await testAuth().getUser(maya.uid)).disabled).toBe(true);
      expect(await signInFailure(MAYA)).toBe("USER_DISABLED");

      ok(await patch(maya.uid, { displayName: "Maya Rodriguez", status: "active" }));
      expect((await testAuth().getUser(maya.uid)).disabled).toBe(false);
      maya = await signIn(MAYA);
    });

    it("disables the sign-in account on request when the profile already says disabled but sign-in still works", async () => {
      // The mirror image: the profile says disabled, the sign-in account does not. The admin
      // pages show this pledge as disabled, yet they can sign in and use the portal.
      const record = await testAuth().createUser({ email: "half.disabled@uci.edu", password: "portal-demo-1", emailVerified: true, displayName: "Half Disabled" });
      await testAuth().setCustomUserClaims(record.uid, { role: "pledge" });
      const seeded = await docData(`users/${sam.uid}`);
      await testDb().doc(`users/${record.uid}`).set({
        ...seeded,
        email: "half.disabled@uci.edu",
        displayName: "Half Disabled",
        status: "disabled",
        teamId: null,
        submitted: {},
      });
      try {
        const session = await signIn("half.disabled@uci.edu");
        expect(ok<MeDto>(await call(getMe, {}, { token: session.token })).email).toBe("half.disabled@uci.edu");
        expect(await rowOf(record.uid)).toMatchObject({ status: "disabled", accountState: "disabled" });

        expect(ok(await patch(record.uid, { status: "disabled" }))).toEqual({ ok: true });

        // Having been told the account is disabled, sign-in must really be cut off.
        expect((await testAuth().getUser(record.uid)).disabled).toBe(true);
        expect(await signInFailure("half.disabled@uci.edu")).toBe("USER_DISABLED");
        refused(await call(getMe, {}, { token: session.token }), 401, "account_disabled");
      } finally {
        await testAuth().deleteUser(record.uid);
        await testDb().doc(`users/${record.uid}`).delete();
      }
    });
  });
});

describe("punishments", () => {
  const punish = (uid: string, body: unknown) => call(addPunishment, { uid }, { method: "POST", token: admin.token, body });
  const edit = (id: string, body: unknown) => call(updatePunishment, { id }, { method: "PATCH", token: admin.token, body });
  const samDashboard = async (): Promise<DashboardDto> => ok<DashboardDto>(await call(getDashboard, {}, { token: sam.token }));
  let added: PunishmentDto;

  it("adds an active punishment that the pledge sees at once, newest first", async () => {
    added = ok<PunishmentDto>(
      await punish(sam.uid, {
        title: "  Late to session ",
        details: "Bring snacks.\r\nFor everyone.",
        status: "resolved",
        uid: avery.uid,
        createdBy: "someone-else",
      }),
    );
    expect(added).toMatchObject({
      uid: sam.uid,
      title: "Late to session",
      details: "Bring snacks.\nFor everyone.",
      status: "active",
      resolvedAt: null,
    });
    expect(await docData(`punishments/${added.id}`)).toMatchObject({ uid: sam.uid, createdBy: admin.uid, resolvedBy: null });
    expect((await samDashboard()).punishments.map((punishment) => punishment.title)).toEqual([
      "Late to session",
      "Missed the Week 1 deliverable",
    ]);
    expect(await latestAudit()).toMatchObject({
      action: "punishment.add",
      targetType: "punishment",
      targetId: added.id,
      summary: `${SAM}: Late to session`,
    });
    expect((await rowOf(sam.uid)).activePunishments).toBe(2);
  });

  it("does not show one pledge's punishment to another", async () => {
    expect(await countWhere("punishments", "uid", avery.uid)).toBe(0);
    expect(ok<DashboardDto>(await call(getDashboard, {}, { token: avery.token })).punishments).toEqual([]);
  });

  it.each<[string, unknown, string[]]>([
    ["no title", { details: "Something" }, ["title:required"]],
    ["a blank title", { title: "   " }, ["title:required"]],
    ["a title that is not text", { title: 5 }, ["title:required"]],
    ["a title over the limit", { title: "x".repeat(LIMITS.punishmentTitle + 1) }, ["title:too_long"]],
    ["details over the limit", { title: "Fine", details: "x".repeat(LIMITS.punishmentDetails + 1) }, ["details:too_long"]],
  ])("refuses a punishment with %s", async (_label, body, fields) => {
    expect(fieldCodes(refused(await punish(sam.uid, body), 422, "invalid"))).toEqual(fields);
    expect(await countWhere("punishments", "uid", sam.uid)).toBe(2);
  });

  it("accepts a title and details of exactly the limits", async () => {
    const result = ok<PunishmentDto>(
      await punish(caseyUid, { title: "x".repeat(LIMITS.punishmentTitle), details: "y".repeat(LIMITS.punishmentDetails) }),
    );
    expect(result.title).toHaveLength(LIMITS.punishmentTitle);
    ok(await call(deletePunishment, { id: result.id }, { method: "DELETE", token: admin.token }));
  });

  it("is not found when the pledge does not exist", async () => {
    refused(await punish("nobody123", { title: "Ghost" }), 404, "not_found");
  });

  it("hides a punishment from the pledge once it is resolved, and keeps it for admins", async () => {
    const resolved = ok<PunishmentDto>(await edit(added.id, { status: "resolved" }));
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedAt).not.toBeNull();
    expect(await docData(`punishments/${added.id}`)).toMatchObject({ status: "resolved", resolvedBy: admin.uid });

    expect((await samDashboard()).punishments.map((punishment) => punishment.title)).toEqual(["Missed the Week 1 deliverable"]);
    const detail = await detailOf(sam.uid);
    expect(detail.punishments.map((punishment) => [punishment.title, punishment.status])).toEqual([
      ["Late to session", "resolved"],
      ["Missed the Week 1 deliverable", "active"],
    ]);
    expect(detail.pledge.activePunishments).toBe(1);
    expect(await latestAudit()).toMatchObject({ action: "punishment.resolve", targetId: added.id, summary: "Late to session" });
  });

  it("shows it to the pledge again when it is reopened", async () => {
    const reopened = ok<PunishmentDto>(await edit(added.id, { status: "active" }));
    expect(reopened).toMatchObject({ status: "active", resolvedAt: null });
    expect(await docData(`punishments/${added.id}`)).toMatchObject({ resolvedBy: null });
    expect((await samDashboard()).punishments).toHaveLength(2);
    expect((await latestAudit()).action).toBe("punishment.reopen");
  });

  it("edits the wording without touching the status", async () => {
    const edited = ok<PunishmentDto>(await edit(added.id, { title: "Late to two sessions", details: "" }));
    expect(edited).toMatchObject({ title: "Late to two sessions", details: "", status: "active", uid: sam.uid });
    expect(await latestAudit()).toMatchObject({ action: "punishment.update", summary: "Late to two sessions" });
  });

  it.each<[string, unknown, string[]]>([
    ["an unknown status", { status: "forgiven" }, ["status:invalid"]],
    ["a blank title", { title: "  " }, ["title:required"]],
    ["a title over the limit", { title: "x".repeat(LIMITS.punishmentTitle + 1) }, ["title:too_long"]],
  ])("refuses an edit with %s and changes nothing", async (_label, body, fields) => {
    const before = await docData(`punishments/${added.id}`);
    expect(fieldCodes(refused(await edit(added.id, body), 422, "invalid"))).toEqual(fields);
    expect(await docData(`punishments/${added.id}`)).toEqual(before);
  });

  it("cannot move a punishment to another pledge", async () => {
    ok(await edit(added.id, { uid: avery.uid }));
    expect(await docData(`punishments/${added.id}`)).toMatchObject({ uid: sam.uid });
  });

  it("removes a punishment for good, and is not found afterwards", async () => {
    expect(ok(await call(deletePunishment, { id: added.id }, { method: "DELETE", token: admin.token }))).toEqual({ ok: true });
    expect(await docExists(`punishments/${added.id}`)).toBe(false);
    expect((await samDashboard()).punishments).toHaveLength(1);
    expect(await latestAudit()).toMatchObject({ action: "punishment.remove", targetId: added.id, summary: "Late to two sessions" });

    refused(await call(deletePunishment, { id: added.id }, { method: "DELETE", token: admin.token }), 404, "not_found");
    refused(await edit(added.id, { status: "resolved" }), 404, "not_found");
  });
});

describe("removing a pledge", () => {
  let auditBefore: number;

  it("first gives the pledge a draft, a visit and a punishment, so there is something of every kind to remove", async () => {
    ok(await call(getForm, { formId: "week2synthesis" }, { token: avery.token }));
    ok(await call(heartbeat, {}, { method: "POST", token: avery.token }));
    ok(await call(addPunishment, { uid: avery.uid }, { method: "POST", token: admin.token, body: { title: "To be removed" } }));

    expect(await countWhere("submissions", "uid", avery.uid)).toBe(3);
    expect(await countWhere("drafts", "uid", avery.uid)).toBe(1);
    // Three finished visits under the profile, and the one in progress beside them.
    expect(await countSessions(avery.uid)).toBe(4);
    expect((await detailOf(avery.uid)).sessions).toHaveLength(4);
    expect(await countWhere("punishments", "uid", avery.uid)).toBe(1);
    // Avery is also on a team, with Jordan.
    expect(await docData(`users/${avery.uid}`)).toMatchObject({ teamId: TEAM_ATLAS });
    expect(ok<MeDto>(await call(getMe, {}, { token: (await signIn(JORDAN)).token })).team).toEqual({ name: "Team Atlas", teammates: ["Avery Chen"] });
    auditBefore = await countAll("auditLog");
  });

  it.each<[string, string | null]>([
    ["no confirmation", null],
    ["an empty confirmation", ""],
    ["another pledge's email", SAM],
    ["the admin's own email", ADMIN_ONE],
    ["the pledge's name", "Avery Chen"],
    ["the pledge's uid", "uid"],
    ["only part of the email", "avery.chen"],
    ["the email with extra text", `${AVERY}x`],
  ])("refuses to remove with %s", async (_label, confirm) => {
    const value = confirm === "uid" ? avery.uid : confirm;
    const body = refused(await remove(avery.uid, value), 422, "invalid");
    expect(fieldCodes(body)).toEqual(["confirm:mismatch"]);
  });

  it("removed nothing while the confirmation was wrong", async () => {
    expect(ok<MeDto>(await call(getMe, {}, { token: avery.token })).email).toBe(AVERY);
    expect(await countWhere("submissions", "uid", avery.uid)).toBe(3);
    expect(await countAll("auditLog")).toBe(auditBefore);
  });

  it("removes the pledge when the confirmation matches their email, ignoring case and padding", async () => {
    expect(ok(await remove(avery.uid, "  AVERY.CHEN@uci.edu "))).toEqual({ ok: true });
  });

  it("deletes everything that belonged to them", async () => {
    expect(await docExists(`users/${avery.uid}`)).toBe(false);
    for (const collection of ["submissions", "drafts", "punishments"]) {
      expect(await countWhere(collection, "uid", avery.uid), collection).toBe(0);
    }
    // Their visit history sits under the profile, and goes with it.
    expect(await countSessions(avery.uid)).toBe(0);
    expect((await testDb().collectionGroup("sessions").where("uid", "==", avery.uid).count().get()).data().count).toBe(0);
    await expect(testAuth().getUser(avery.uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
  });

  it("takes them off their team: the team stays, one smaller, and their teammate no longer sees their name", async () => {
    const view = await overview();
    expect(view.teams.map((team) => [team.id, team.name, team.memberCount])).toEqual([[TEAM_ATLAS, "Team Atlas", 1]]);
    expect(await countWhere("users", "teamId", TEAM_ATLAS)).toBe(1);
    const teammate = await call(getMe, {}, { token: (await signIn(JORDAN)).token });
    expect(ok<MeDto>(teammate).team).toEqual({ name: "Team Atlas", teammates: [] });
    expect(teammate.text).not.toContain("Avery");
  });

  it("ends their session and their ability to sign in", async () => {
    refused(await call(getMe, {}, { token: avery.token }), 401, "account_removed");
    refused(await call(getDashboard, {}, { token: avery.token }), 401, "account_removed");
    expect(await signInFailure(AVERY)).toBe("EMAIL_NOT_FOUND");
  });

  it("drops them from the admin views and the response counts", async () => {
    const view = await overview();
    expect(view.pledges.map((pledge) => pledge.email)).not.toContain(AVERY);
    expect(Object.fromEntries(view.forms.map((form) => [form.id, form.responseCount]))).toMatchObject({
      week0onboarding: 4,
      week1reflection: 1,
      week2interviews: 1,
    });
    refused(await call(getPledgeDetail, { uid: avery.uid }, { token: admin.token }), 404, "not_found");
    const responses = ok<FormResponsesDto>(await call(getResponses, { formId: "week0onboarding" }, { token: admin.token }));
    expect(responses.responses.map((response) => response.email)).not.toContain(AVERY);
    expect(responses.responses).toHaveLength(4);
  });

  it("leaves every other pledge's data alone", async () => {
    expect(await countWhere("submissions", "uid", sam.uid)).toBe(1);
    expect(await countWhere("submissions", "uid", jordan.uid)).toBe(2);
    expect(await countWhere("submissions", "uid", maya.uid)).toBe(2);
    expect(await countWhere("punishments", "uid", sam.uid)).toBe(1);
    expect(await countSessions(sam.uid)).toBe(6);
    expect(await countSessions(jordan.uid)).toBe(4);
    expect(await docData(`users/${jordan.uid}`)).toMatchObject({ teamId: TEAM_ATLAS });
    expect(ok<MeDto>(await call(getMe, {}, { token: sam.token })).email).toBe(SAM);
  });

  it("audits the removal, and is not found a second time", async () => {
    expect(await countAll("auditLog")).toBe(auditBefore + 1);
    expect(await latestAudit()).toMatchObject({
      action: "pledge.remove",
      targetType: "user",
      targetId: avery.uid,
      actorEmail: ADMIN_ONE,
      summary: `Removed ${AVERY} and all their data`,
    });
    refused(await remove(avery.uid, AVERY), 404, "not_found");
  });

  it("frees the address, so the pledge can be invited again from scratch", async () => {
    const again = ok<CreatePledgeResultDto>(await create({ email: AVERY, displayName: "Avery Chen" }));
    expect(again.pledge.uid).not.toBe(avery.uid);
    expect(again.pledge.submitted).toEqual({});
    // Nothing of the old account comes back with the address: not the team, not the finished tour.
    expect(again.pledge).toMatchObject({ teamId: null, onboardedAt: null });
    expect(again.inviteLink).toMatch(WELCOME_LINK);
    expect((await overview()).teams[0].memberCount).toBe(1);
  });
});

describe("accounts that only partly look like pledges", () => {
  const profile = (email: string, role: string) => ({
    email,
    displayName: "Edge Case",
    role,
    status: "active",
    pledgeClass: null,
    createdAt: Timestamp.now(),
    createdBy: "test",
    updatedAt: Timestamp.now(),
    submitted: {},
    activity: { firstSeenAt: null, lastSeenAt: null, totalActiveSeconds: 0, sessionCount: 0, current: null },
  });

  it("refuses to change an account whose token role is admin, even if its profile says pledge", async () => {
    const email = "claims.admin@uci.edu";
    const record = await testAuth().createUser({ email, emailVerified: true });
    await testAuth().setCustomUserClaims(record.uid, { role: "admin" });
    await testDb().doc(`users/${record.uid}`).set(profile(email, "pledge"));

    refused(await patch(record.uid, { status: "disabled" }), 403, "cannot_modify_admin");
    refused(await remove(record.uid, email), 403, "cannot_modify_admin");
    refused(await call(createInviteLink, { uid: record.uid }, { method: "POST", token: admin.token }), 403, "cannot_modify_admin");
    refused(await call(issuePassword, { uid: record.uid }, { method: "POST", token: admin.token }), 403, "cannot_modify_admin");
    const after = await testAuth().getUser(record.uid);
    expect(after.disabled).toBe(false);
    // Still an admin's claims, and still no password: none was set for it.
    expect(after.customClaims).toEqual({ role: "admin" });
    expect(after.passwordHash).toBeUndefined();
    expect(await docExists(`users/${record.uid}`)).toBe(true);
  });

  it("refuses to change an account whose profile role is admin, even if its token says pledge", async () => {
    const email = "profile.admin@uci.edu";
    const record = await testAuth().createUser({ email, emailVerified: true });
    await testAuth().setCustomUserClaims(record.uid, { role: "pledge" });
    await testDb().doc(`users/${record.uid}`).set(profile(email, "admin"));

    refused(await patch(record.uid, { status: "disabled" }), 403, "cannot_modify_admin");
    refused(await remove(record.uid, email), 403, "cannot_modify_admin");
    expect((await testAuth().getUser(record.uid)).disabled).toBe(false);
    expect(await docExists(`users/${record.uid}`)).toBe(true);
  });
});

describe("audit trail", () => {
  it("attributes every entry written in this file to the admin who acted", async () => {
    const entries = (await storedAudit()).filter((entry) => entry.actorUid !== "seed" && entry.action !== "form.publish");
    expect(entries.length).toBeGreaterThan(10);
    for (const entry of entries) {
      expect(entry.actorUid).toBe(admin.uid);
      expect(entry.actorEmail).toBe(ADMIN_ONE);
      expect(entry.summary.length).toBeGreaterThan(0);
    }
  });

  it("never stores a set-password code or link", async () => {
    const text = JSON.stringify(await storedAudit());
    expect(text).not.toMatch(/oobCode|login\/reset|resetPassword/);
  });
});

// A profile keeps a fingerprint of the temporary password its account was given, as a salt
// and a hash. An admin's pages are built from the profiles, and are sent none of it.
describe("a pledge who is on a temporary password", () => {
  const FINGERPRINT = A_KEPT_FINGERPRINT;
  let uid = "";
  let handedOut = "";

  it("is created with the password in the response once, and nothing of its fingerprint", async () => {
    const result = await create({ email: "kept.to.itself@uci.edu", displayName: "Linden Okoro", pledgeClass: "Nu", start: "temporary_password" });
    const made = ok<CreatePledgeResultDto>(result);
    uid = made.pledge.uid;
    handedOut = made.temporaryPassword ?? "";
    expect(handedOut).toMatch(TEMPORARY_PASSWORD);
    expect(result.text.split(handedOut)).toHaveLength(2);
    expect(result.text.split("temporaryPassword")).toHaveLength(2);

    // The fingerprint is on the profile, and the row an admin is sent has the same keys as any pledge's.
    expect(await storedFingerprint(uid)).toEqual(FINGERPRINT);
    const anyoneElse = (await overview()).pledges.find((pledge) => pledge.uid !== uid);
    expect(Object.keys(made.pledge).sort()).toEqual(Object.keys(anyoneElse ?? {}).sort());
    expect(Object.keys(await rowOf(uid)).sort()).toEqual(Object.keys(made.pledge).sort());
    for (const kept of await everyStoredFingerprint()) expect(result.text.includes(kept)).toBe(false);
    expect(result.text).not.toMatch(/"salt"|"hash"|"temp"|"tempAt"|"tempNew"/);
  });

  it("is shown to an admin in the overview, on their page, among the responses and in the log with none of it", async () => {
    const kept = await everyStoredFingerprint();
    // A salt and a hash for each account that is on a temporary password here.
    expect(kept.length).toBeGreaterThanOrEqual(2);
    expect(kept.length % 2).toBe(0);
    const sent: Array<[string, Awaited<ReturnType<typeof call>>]> = [
      ["GET /admin/pledges", await call(getOverview, {}, { token: admin.token })],
      ["GET /admin/pledges/[uid]", await call(getPledgeDetail, { uid }, { token: admin.token })],
      ["GET /admin/forms/[formId]/responses", await call(getResponses, { formId: "week0onboarding" }, { token: admin.token })],
      ["PATCH /admin/pledges/[uid]", await patch(uid, { pledgeClass: "Xi" })],
      ["POST /admin/pledges/[uid]/punishments", await call(addPunishment, { uid }, { method: "POST", token: admin.token, body: { title: "Missed a session" } })],
    ];
    for (const [label, result] of sent) {
      expect(result.status, label).toBe(200);
      for (const value of kept) expect(result.text.includes(value), `${label}: a stored salt or hash`).toBe(false);
      expect(result.text.toUpperCase(), label).not.toContain(handedOut);
      expect(result.text, label).not.toMatch(/temporaryPassword|"salt"|"hash"|"temp"|"tempAt"|"tempNew"|passwordHash/);
      expect(fingerprintLeak(result.body, false), label).toBeNull();
    }
    // They are in what was read, as someone who has yet to get in.
    expect(await rowOf(uid)).toMatchObject({ email: "kept.to.itself@uci.edu", accountState: "invited", pledgeClass: "Xi" });
    expect((await detailOf(uid)).pledge.accountState).toBe("invited");
    // Changing their class left the fingerprint where it was.
    expect(await storedFingerprint(uid)).toEqual(FINGERPRINT);
    const log = JSON.stringify(await storedAudit());
    for (const value of kept) expect(log.includes(value)).toBe(false);
    expect(log.toUpperCase()).not.toContain(handedOut);
  });

  it("takes the fingerprint with them when they are removed", async () => {
    ok(await remove(uid, "kept.to.itself@uci.edu"));
    expect(await docExists(`users/${uid}`)).toBe(false);
    expect(await storedFingerprint(uid)).toBeNull();
    expect(JSON.stringify(await storedAudit()).toUpperCase()).not.toContain(handedOut);
    await expect(testAuth().getUser(uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
  });
});
