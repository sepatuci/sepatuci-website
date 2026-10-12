/**
 * Admin management of active members' accounts. An active is a read-only
 * viewer: created, renamed, disabled, reset and removed like a pledge, with no
 * class, team, deliverables or tracked time. Tests run in order from a fresh
 * seed: what is listed, what is refused, then one new active is taken through
 * their whole life, and last the rule that keeps the two kinds of account apart.
 */
import { Timestamp } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as createActiveInviteLink } from "@/app/api/portal/admin/actives/[uid]/invite-link/route";
import { POST as resetActiveMfa } from "@/app/api/portal/admin/actives/[uid]/reset-mfa/route";
import { DELETE as removeActive, PATCH as updateActive } from "@/app/api/portal/admin/actives/[uid]/route";
import { POST as issueActivePassword } from "@/app/api/portal/admin/actives/[uid]/temporary-password/route";
import { GET as listActives, POST as createActive } from "@/app/api/portal/admin/actives/route";
import { POST as createPledgeInviteLink } from "@/app/api/portal/admin/pledges/[uid]/invite-link/route";
import { POST as addPunishment } from "@/app/api/portal/admin/pledges/[uid]/punishments/route";
import { POST as resetPledgeMfa } from "@/app/api/portal/admin/pledges/[uid]/reset-mfa/route";
import { DELETE as removePledge, GET as getPledgeDetail, PATCH as updatePledge } from "@/app/api/portal/admin/pledges/[uid]/route";
import { POST as issuePledgePassword } from "@/app/api/portal/admin/pledges/[uid]/temporary-password/route";
import { GET as getOverview, POST as createPledge } from "@/app/api/portal/admin/pledges/route";
import { PATCH as updateTeam } from "@/app/api/portal/admin/teams/[teamId]/route";
import { POST as createTeam } from "@/app/api/portal/admin/teams/route";
import { GET as getDashboard } from "@/app/api/portal/dashboard/route";
import { POST as heartbeat } from "@/app/api/portal/heartbeat/route";
import { GET as getMe } from "@/app/api/portal/me/route";
import { POST as completeOnboarding } from "@/app/api/portal/onboarding/route";
import { GET as getReviewForm } from "@/app/api/portal/review/forms/[formId]/route";
import { GET as getReviewOverview } from "@/app/api/portal/review/overview/route";
import { LIMITS } from "@/lib/portal/constants";
import { resetRateLimits } from "@/lib/portal/server/rate-limit";
import type {
  ActiveRowDto,
  ActivesDto,
  AdminOverviewDto,
  CreateActiveResultDto,
  InviteLinkDto,
  MeDto,
  ReviewOverviewDto,
  TemporaryPasswordDto,
} from "@/lib/portal/types";
import { DEMO_ACTIVES } from "../../scripts/portal/seed-emulator.mjs";
import {
  ADMIN_ONE,
  ADMIN_TWO,
  AVERY,
  CASEY,
  DANA,
  MARCUS,
  PRIYA,
  RILEY,
  SEEDED_ACCOUNTS,
  SEED_TIMEOUT_MS,
  SLOW_TEST_MS,
  TEAM_ATLAS,
  TEMPORARY_PASSWORD,
  call,
  countAll,
  countWhere,
  docData,
  docExists,
  dumpPortal,
  everyStoredFingerprint,
  expectIssuedBetween,
  fieldCodes,
  ok,
  redeemResetCode,
  refused,
  seedPortal,
  signIn,
  signInFailure,
  sleep,
  storedAudit,
  storedFingerprint,
  temporaryClaims,
  testAuth,
  testDb,
  uidOf,
  type ApiResult,
  type Session,
} from "./helpers";

/** A set-password link for someone who has been through their welcome. */
const INVITE_LINK = /^http:\/\/localhost\/login\/reset\?mode=resetPassword&oobCode=[^&\s]+$/;
/** The same link for someone who has not: it ends by asking for the introduction. */
const WELCOME_LINK = /^http:\/\/localhost\/login\/reset\?mode=resetPassword&oobCode=[^&\s]+&welcome=1$/;

const ROW_KEYS = ["accountState", "createdAt", "displayName", "email", "lastSignInAt", "mfaEnrolled", "signInBlocked", "status", "uid"];
const PROFILE_KEYS = [
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
];
const NO_ACTIVITY = { firstSeenAt: null, lastSeenAt: null, totalActiveSeconds: 0, sessionCount: 0, current: null };
const NEW_ACTIVE = "new.active@uci.edu";
const NEW_PASSWORD = "chosen-by-the-active-1";
const NOT_FOUND = "That account doesn't exist.";

let admin: Session;
let adminTwo: Session;
let avery: Session;
let priyaUid: string;
let marcusUid: string;
let danaUid: string;
let rileyUid: string;
let caseyUid: string;

const actives = async (): Promise<ActiveRowDto[]> => ok<ActivesDto>(await call(listActives, {}, { token: admin.token })).actives;
const rowOf = async (uid: string): Promise<ActiveRowDto> => {
  const row = (await actives()).find((active) => active.uid === uid);
  if (!row) throw new Error(`No row for the active ${uid}`);
  return row;
};
const pledgeOverview = async (): Promise<AdminOverviewDto> => ok<AdminOverviewDto>(await call(getOverview, {}, { token: admin.token }));
const create = (body: unknown): Promise<ApiResult> => call(createActive, {}, { method: "POST", token: admin.token, body });
const patch = (uid: string, body: unknown): Promise<ApiResult> => call(updateActive, { uid }, { method: "PATCH", token: admin.token, body });
const remove = (uid: string, confirm: string | null): Promise<ApiResult> =>
  call(removeActive, { uid }, { method: "DELETE", token: admin.token, query: confirm === null ? "" : `?confirm=${encodeURIComponent(confirm)}` });
const invite = (uid: string): Promise<ApiResult> => call(createActiveInviteLink, { uid }, { method: "POST", token: admin.token });
const resetMfa = (uid: string): Promise<ApiResult> => call(resetActiveMfa, { uid }, { method: "POST", token: admin.token });
const issuePassword = (uid: string): Promise<ApiResult> => call(issueActivePassword, { uid }, { method: "POST", token: admin.token });
/** The temporary password this file has an admin issue to Marcus, to be searched for in the audit log. */
let issuedToMarcus = "";
const latestAudit = async () => (await storedAudit())[0];
const auditOf = async (action: string) => (await storedAudit()).filter((entry) => entry.action === action);

beforeAll(async () => {
  await seedPortal();
  [admin, adminTwo, avery] = await Promise.all([ADMIN_ONE, ADMIN_TWO, AVERY].map((email) => signIn(email)));
  [priyaUid, marcusUid, danaUid, rileyUid, caseyUid] = await Promise.all([PRIYA, MARCUS, DANA, RILEY, CASEY].map((email) => uidOf(email)));
}, SEED_TIMEOUT_MS);

beforeEach(() => {
  resetRateLimits();
});

describe("the list of actives", () => {
  it("has the three the seed makes, by name, and none of the pledges or admins", async () => {
    const rows = await actives();
    expect(rows.map((row) => [row.displayName, row.email, row.uid])).toEqual([
      ["Dana Ortiz", DANA, danaUid],
      ["Marcus Lee", MARCUS, marcusUid],
      ["Priya Shah", PRIYA, priyaUid],
    ]);
    expect(rows.map((row) => row.email).sort()).toEqual(DEMO_ACTIVES.map((active) => active.email).sort());
    expect(await countWhere("users", "role", "active")).toBe(3);
    expect(await countAll("users")).toBe(SEEDED_ACCOUNTS);
  });

  it("gives each row exactly the fields of an account: no class, team, tour, time on site or deliverables", async () => {
    const result = await call(listActives, {}, { token: admin.token });
    const body = ok<ActivesDto>(result);
    expect(Object.keys(body).sort()).toEqual(["actives", "serverNow"]);
    for (const row of body.actives) expect(Object.keys(row).sort(), row.displayName).toEqual(ROW_KEYS);
    expect(result.text).not.toMatch(/"pledgeClass"|"teamId"|"onboardedAt"|"activity"|"submitted"|"activePunishments"/);
    expect(Date.parse(body.serverNow)).toBeGreaterThan(Date.now() - 60_000);
  });

  it("never includes credentials", async () => {
    const result = await call(listActives, {}, { token: admin.token });
    expect(result.text).not.toMatch(/password|salt|oobCode|refreshToken|customClaims/i);
  });

  it("shows the invited active as invited, with no sign-in, and the disabled one as disabled and blocked", async () => {
    expect(await rowOf(marcusUid)).toMatchObject({
      status: "active",
      accountState: "invited",
      signInBlocked: false,
      mfaEnrolled: false,
      lastSignInAt: null,
    });
    expect((await testAuth().getUser(marcusUid)).passwordHash).toBeUndefined();
    expect(await rowOf(danaUid)).toMatchObject({ status: "disabled", accountState: "disabled", signInBlocked: true });
    expect(await signInFailure(DANA)).toBe("USER_DISABLED");
  });

  // An active has no visit history to go by, as a pledge has, and the seed signs Priya in
  // in the same moment it creates her, which is too soon to count as a sign-in. What says
  // she is set up is that she has been through her welcome, which the seed records.
  it("shows the active the seed sets up as set up, not as invited", async () => {
    const row = await rowOf(priyaUid);
    expect((await testAuth().getUser(priyaUid)).passwordHash).toBeDefined();
    expect(row).toMatchObject({ accountState: "active", status: "active", signInBlocked: false, mfaEnrolled: false });
    expect((await docData(`users/${priyaUid}`))?.onboardedAt).not.toBeNull();
  });

  // Each of the three on its own is enough to say the person has reached the portal.
  it("calls an active invited only while they have no second factor, no sign-in and no welcome behind them", async () => {
    const ref = testDb().doc(`users/${marcusUid}`);
    expect(await rowOf(marcusUid)).toMatchObject({ accountState: "invited", mfaEnrolled: false, lastSignInAt: null });
    expect((await ref.get()).get("onboardedAt")).toBeNull();

    await ref.update({ onboardedAt: Timestamp.now() });
    try {
      expect(await rowOf(marcusUid)).toMatchObject({ accountState: "active", mfaEnrolled: false, lastSignInAt: null });
    } finally {
      await ref.update({ onboardedAt: null });
    }
    expect((await rowOf(marcusUid)).accountState).toBe("invited");

    await testAuth().updateUser(marcusUid, { multiFactor: { enrolledFactors: [{ uid: "factor1", phoneNumber: "+15555550100", displayName: "Phone", factorId: "phone" }] } });
    try {
      expect(await rowOf(marcusUid)).toMatchObject({ accountState: "active", mfaEnrolled: true, lastSignInAt: null });
    } finally {
      await testAuth().updateUser(marcusUid, { multiFactor: { enrolledFactors: null } });
    }
    expect(await rowOf(marcusUid)).toMatchObject({ accountState: "invited", mfaEnrolled: false });
  });

  it("gives every seeded active the claims and the profile the portal itself would have written", async () => {
    for (const [email, uid, welcomed] of [
      [PRIYA, priyaUid, true],
      [MARCUS, marcusUid, false],
      [DANA, danaUid, true],
    ] as const) {
      expect((await testAuth().getUser(uid)).customClaims, email).toEqual({ role: "active", issued: email });
      const profile = await docData(`users/${uid}`);
      expect(profile, email).toMatchObject({ email, role: "active", pledgeClass: null, teamId: null, submitted: {}, activity: NO_ACTIVITY });
      expect(Object.keys(profile ?? {}).sort(), email).toEqual(PROFILE_KEYS);
      // The two who have signed in have been through their welcome. Marcus, who was only invited, has it to do.
      const finished = (profile?.onboardedAt ?? null) as { toMillis(): number } | null;
      if (welcomed) expect(finished?.toMillis(), email).toBeLessThan(Date.now() - 23 * 86_400_000);
      else expect(finished, email).toBeNull();
    }
  });

  it("is kept apart from the pledges: none of the three is among them, and no pledge is listed here", async () => {
    const overview = await pledgeOverview();
    expect(overview.pledges).toHaveLength(6);
    const pledgeUids = overview.pledges.map((pledge) => pledge.uid);
    for (const uid of [priyaUid, marcusUid, danaUid]) expect(pledgeUids).not.toContain(uid);
    const activeUids = (await actives()).map((row) => row.uid);
    for (const uid of [...pledgeUids, admin.uid, adminTwo.uid]) expect(activeUids).not.toContain(uid);
  });

  it("is an admin's alone: a pledge is refused it", async () => {
    refused(await call(listActives, {}, { token: avery.token }), 403, "forbidden");
    refused(await call(createActive, {}, { method: "POST", token: avery.token, body: { email: "by.a.pledge@uci.edu", displayName: "By A Pledge" } }), 403, "forbidden");
    await expect(testAuth().getUserByEmail("by.a.pledge@uci.edu")).rejects.toMatchObject({ code: "auth/user-not-found" });
  });
});

describe("creating an active", () => {
  it.each<[string, unknown]>([
    ["a Gmail address", "new.active@gmail.com"],
    ["a UCI subdomain", "new.active@ics.uci.edu"],
    ["a domain that only starts with uci.edu", "new.active@uci.edu.evil.example"],
    ["a domain that only ends with uci.edu", "new.active@notuci.edu"],
    ["two addresses", "new.active@uci.edu,other@uci.edu"],
    ["a display-name form", "New Active <new.active@uci.edu>"],
    ["no address", ""],
    ["a missing field", undefined],
    ["a number", 12345],
  ])("refuses an email that is %s", async (_label, email) => {
    const body = refused(await create({ email, displayName: "New Active" }), 422, "invalid");
    expect(fieldCodes(body)).toEqual(["email:invalid_email"]);
    expect(body.fields?.[0].message).toBe("Use a @uci.edu email address.");
  });

  it.each([ADMIN_ONE, ADMIN_TWO, "Chair.Two@UCI.edu", "  chair.one@uci.edu  "])("refuses the admin address %s", async (email) => {
    const body = refused(await create({ email, displayName: "Not An Active" }), 422, "invalid");
    expect(fieldCodes(body)).toEqual(["email:is_admin"]);
    expect(body.fields?.[0].message).toBe("That address belongs to an admin.");
  });

  it("requires a name, says whose name is missing, and reports it together with a bad email", async () => {
    const missing = refused(await create({ email: NEW_ACTIVE }), 422, "invalid");
    expect(fieldCodes(missing)).toEqual(["displayName:required"]);
    expect(missing.fields?.[0].message).toBe("Enter the active's name.");
    expect(fieldCodes(refused(await create({ email: NEW_ACTIVE, displayName: "   " }), 422, "invalid"))).toEqual(["displayName:required"]);
    expect(fieldCodes(refused(await create({ email: NEW_ACTIVE, displayName: 42 }), 422, "invalid"))).toEqual(["displayName:required"]);
    expect(fieldCodes(refused(await create({ email: "nope", displayName: "" }), 422, "invalid"))).toEqual(["displayName:required", "email:invalid_email"]);
  });

  it("refuses a name over the length limit, and accepts none of the body when it is not an object", async () => {
    const longName = await create({ email: NEW_ACTIVE, displayName: "x".repeat(LIMITS.displayName + 1) });
    expect(refused(longName, 422, "invalid").fields?.map((field) => field.path)).toEqual(["displayName"]);
    const notAnObject = await call(createActive, {}, { method: "POST", token: admin.token, rawBody: "[1, 2, 3]" });
    expect(fieldCodes(refused(notAnObject, 422, "invalid"))).toEqual(["displayName:required", "email:invalid_email"]);
  });

  // Names are copied out next to set-password links and temporary passwords, and a
  // spreadsheet runs a cell that starts with one of these as a formula.
  it.each<[string, string]>([
    ["an equals sign", '=HYPERLINK("https://evil.example")'],
    ["a plus sign", "+1 949 555 0100"],
    ["a hyphen", "-New Active"],
    ["an at sign", "@newactive"],
    ["an equals sign after padding", "   =1+1"],
    ["an equals sign after a tab", "\t=1+1"],
    ["an equals sign after a line break", "\r\n=1+1"],
  ])("refuses a name that starts with %s, however the account is to start", async (_label, displayName) => {
    for (const more of [{}, { start: "link" }, { start: "temporary_password" }]) {
      const body = refused(await create({ email: NEW_ACTIVE, displayName, ...more }), 422, "invalid");
      expect(fieldCodes(body)).toEqual(["displayName:invalid"]);
      expect(body.fields?.[0].message).toBe("A name can't start with a symbol.");
    }
  });

  it("reports a name like that together with a bad email and a bad start", async () => {
    const body = refused(await create({ email: "nope", displayName: "=cmd", start: "later" }), 422, "invalid");
    expect(fieldCodes(body)).toEqual(["displayName:invalid", "email:invalid_email", "start:invalid"]);
  });

  it.each([AVERY, "Avery.Chen@UCI.EDU", RILEY, CASEY])("refuses %s, which is already a pledge's address", async (email) => {
    const body = refused(await create({ email, displayName: "Already A Pledge" }), 409, "email_exists");
    expect(body.error).toBe("An account with that email already exists.");
  });

  it.each([PRIYA, "Priya.Shah@UCI.EDU", MARCUS, DANA])("refuses %s, which is already an active's address", async (email) => {
    refused(await create({ email, displayName: "Already An Active" }), 409, "email_exists");
  });

  it("created nothing, and changed nobody, for any of the refused requests above", async () => {
    expect(await countAll("users")).toBe(SEEDED_ACCOUNTS);
    expect(await actives()).toHaveLength(3);
    expect((await pledgeOverview()).pledges).toHaveLength(6);
    await expect(testAuth().getUserByEmail(NEW_ACTIVE)).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect(await auditOf("active.create")).toEqual([]);
    // The pledge whose address was offered is still a pledge, and the active still an active.
    expect(await docData(`users/${avery.uid}`)).toMatchObject({ role: "pledge", displayName: "Avery Chen", teamId: TEAM_ATLAS });
    expect((await testAuth().getUser(avery.uid)).customClaims).toEqual({ role: "pledge", issued: AVERY });
    expect((await testAuth().getUserByEmail(PRIYA)).displayName).toBe("Priya Shah");
    expect(ok<MeDto>(await call(getMe, {}, { token: avery.token })).role).toBe("pledge");
  });

  let created: CreateActiveResultDto;

  it("creates an active, and ignores every field it should not accept", async () => {
    const result = await create({
      email: "  New.Active@UCI.edu ",
      displayName: "  New Active ",
      // A class and a team are a pledge's.
      pledgeClass: "Mu",
      teamId: TEAM_ATLAS,
      role: "admin",
      status: "disabled",
      uid: "attackerchosenuid",
      emailVerified: false,
      password: "chosen-by-the-admin",
      customClaims: { role: "admin" },
      onboardedAt: "2026-01-01T00:00:00.000Z",
      submitted: { week0onboarding: { submittedAt: "2026-01-01T00:00:00.000Z", late: false } },
      activity: { totalActiveSeconds: 999_999, sessionCount: 99 },
      createdAt: "2000-01-01T00:00:00.000Z",
      createdBy: "someone-else",
    });
    created = ok<CreateActiveResultDto>(result);
    // By link, as it was not asked for otherwise: there is no temporary password to show.
    expect(Object.keys(created).sort()).toEqual(["active", "inviteLink", "temporaryPassword"]);
    expect(created.temporaryPassword).toBeNull();
    expect(Object.keys(created.active).sort()).toEqual(ROW_KEYS);
    expect(created.active).toMatchObject({
      email: NEW_ACTIVE,
      displayName: "New Active",
      status: "active",
      signInBlocked: false,
      accountState: "invited",
      mfaEnrolled: false,
      lastSignInAt: null,
    });
    expect(created.active.uid).not.toBe("attackerchosenuid");
    expect(Math.abs(Date.parse(created.active.createdAt) - Date.now())).toBeLessThan(60_000);
    expect(result.text).not.toMatch(/"pledgeClass"|"teamId"|"Mu"/);
  });

  it("stores an active's profile: the role, no class, no team, and only the fields a profile has", async () => {
    const profile = await docData(`users/${created.active.uid}`);
    expect(profile).toMatchObject({
      email: NEW_ACTIVE,
      displayName: "New Active",
      role: "active",
      status: "active",
      pledgeClass: null,
      teamId: null,
      onboardedAt: null,
      createdBy: admin.uid,
      submitted: {},
      activity: NO_ACTIVITY,
    });
    expect(Object.keys(profile ?? {}).sort()).toEqual(PROFILE_KEYS);
  });

  it("creates a sign-in account with the active role and the address it was issued to, a verified email and no password", async () => {
    const record = await testAuth().getUser(created.active.uid);
    expect(record.email).toBe(NEW_ACTIVE);
    expect(record.displayName).toBe("New Active");
    expect(record.customClaims).toEqual({ role: "active", issued: NEW_ACTIVE });
    expect(record.emailVerified).toBe(true);
    expect(record.disabled).toBe(false);
    expect(record.passwordHash).toBeUndefined();
    expect(await signInFailure(NEW_ACTIVE, "chosen-by-the-admin")).toMatch(/INVALID|PASSWORD/);
  });

  it("returns a set-password link on this site that carries a one-time code and asks for the introduction", async () => {
    expect(created.inviteLink).toMatch(WELCOME_LINK);
    const link = new URL(created.inviteLink ?? "");
    expect(link.origin).toBe("http://localhost");
    expect(link.pathname).toBe("/login/reset");
    expect([...link.searchParams.keys()]).toEqual(["mode", "oobCode", "welcome"]);
    expect(link.searchParams.get("oobCode")?.length).toBeGreaterThan(10);
  });

  it("records the creation in the audit log as an active's, without the link", async () => {
    expect(await auditOf("active.create")).toEqual([
      expect.objectContaining({
        actorUid: admin.uid,
        actorEmail: ADMIN_ONE,
        targetType: "user",
        targetId: created.active.uid,
        summary: `Created an active's account for ${NEW_ACTIVE}`,
      }),
    ]);
    expect(await auditOf("pledge.create")).toEqual([]);
    const code = new URL(created.inviteLink ?? "").searchParams.get("oobCode") ?? "missing";
    expect(JSON.stringify(await storedAudit())).not.toContain(code);
  });

  it("put nobody on the team that was named, and added nobody to the pledges", async () => {
    const overview = await pledgeOverview();
    expect(overview.teams.map((team) => [team.id, team.memberCount])).toEqual([[TEAM_ATLAS, 2]]);
    expect(await countWhere("users", "teamId", TEAM_ATLAS)).toBe(2);
    expect(overview.pledges).toHaveLength(6);
    expect(overview.pledges.map((pledge) => pledge.email)).not.toContain(NEW_ACTIVE);
    expect((await actives()).map((row) => row.displayName)).toEqual(["Dana Ortiz", "Marcus Lee", "New Active", "Priya Shah"]);
  });

  it("ignores a class and a team that a pledge would be refused for, because an active has neither", async () => {
    const body = { displayName: "No Class Or Team", pledgeClass: "x".repeat(LIMITS.pledgeClass + 1), teamId: "nosuchteam" };
    // The same body is refused for a pledge: both fields are read there.
    const asPledge = refused(await call(createPledge, {}, { method: "POST", token: admin.token, body: { ...body, email: "class.and.team@uci.edu" } }), 422, "invalid");
    expect(fieldCodes(asPledge)).toEqual(["pledgeClass:too_long", "teamId:invalid"]);

    const asActive = ok<CreateActiveResultDto>(await create({ ...body, email: "class.and.team@uci.edu" }));
    expect(await docData(`users/${asActive.active.uid}`)).toMatchObject({ role: "active", pledgeClass: null, teamId: null });
    const oddTypes = ok<CreateActiveResultDto>(await create({ email: "odd.types@uci.edu", displayName: "Odd Types", pledgeClass: 42, teamId: { id: TEAM_ATLAS } }));
    expect(await docData(`users/${oddTypes.active.uid}`)).toMatchObject({ role: "active", pledgeClass: null, teamId: null });
    expect(await countWhere("users", "teamId", TEAM_ATLAS)).toBe(2);
  });
});

describe("set-password links for actives", () => {
  it("creates a fresh link for an active who has never signed in, ending with the introduction, and audits it without the link", async () => {
    const before = await countAll("auditLog");
    const { inviteLink } = ok<InviteLinkDto>(await invite(marcusUid));
    expect(inviteLink).toMatch(WELCOME_LINK);
    expect([...new URL(inviteLink).searchParams.keys()]).toEqual(["mode", "oobCode", "welcome"]);

    expect(await countAll("auditLog")).toBe(before + 1);
    const entry = await latestAudit();
    expect(entry).toMatchObject({
      action: "active.invite_link",
      targetType: "user",
      targetId: marcusUid,
      actorEmail: ADMIN_ONE,
      summary: `Created a set-password link for ${MARCUS}`,
    });
    expect(JSON.stringify(entry)).not.toContain(new URL(inviteLink).searchParams.get("oobCode"));
  });

  it("refuses a disabled active", async () => {
    const body = refused(await invite(danaUid), 409, "account_disabled");
    expect(body.error).toBe("Re-enable the account before inviting.");
  });

  it("is not found for an unknown uid", async () => {
    expect(refused(await invite("nobody123"), 404, "not_found").error).toBe(NOT_FOUND);
  });
});

describe("one active, from invitation to removal", () => {
  let uid: string;
  let session: Session;
  /** A sign-in from before the account was disabled. */
  let earlier: Session;

  it("still shows them as invited, and still asks for the introduction, until they first sign in", async () => {
    uid = await uidOf(NEW_ACTIVE);
    expect(await rowOf(uid)).toMatchObject({ accountState: "invited", lastSignInAt: null });
    expect(ok<InviteLinkDto>(await invite(uid)).inviteLink).toMatch(WELCOME_LINK);
    expect(ok<InviteLinkDto>(await invite(uid)).inviteLink).toMatch(WELCOME_LINK);
  });

  it(
    "lets them choose a password with the link, sign in, and read the pledges' work",
    async () => {
      // A sign-in stamped within a few seconds of the account being made is not
      // counted as one, so this one is made to fall clearly after that.
      const madeAt = Date.parse((await rowOf(uid)).createdAt);
      await sleep(Math.max(0, madeAt + 7_000 - Date.now()));

      const { inviteLink } = ok<InviteLinkDto>(await invite(uid));
      const code = new URL(inviteLink).searchParams.get("oobCode") ?? "";
      expect(await redeemResetCode(code, NEW_PASSWORD)).toBe(true);
      session = await signIn(NEW_ACTIVE, NEW_PASSWORD);
      expect(session.uid).toBe(uid);

      const overview = ok<ReviewOverviewDto>(await call(getReviewOverview, {}, { token: session.token }));
      expect(overview.pledges.map((pledge) => pledge.displayName)).toContain("Avery Chen");
      expect(overview.forms.length).toBeGreaterThan(0);
      ok(await call(getReviewForm, { formId: "week0onboarding" }, { token: session.token }));
    },
    SLOW_TEST_MS,
  );

  it("tells them who they are: an active, with no class or team, and their welcome still to do", async () => {
    const result = await call(getMe, {}, { token: session.token });
    expect(ok<MeDto>(result)).toMatchObject({
      uid,
      email: NEW_ACTIVE,
      displayName: "New Active",
      role: "active",
      pledgeClass: null,
      team: null,
      onboardedAt: null,
      mfaEnforced: false,
    });
  });

  it("lets them into nothing that is an admin's or a pledge's", async () => {
    refused(await call(listActives, {}, { token: session.token }), 403, "forbidden");
    refused(await call(getOverview, {}, { token: session.token }), 403, "forbidden");
    refused(await call(getDashboard, {}, { token: session.token }), 403, "forbidden");
    // Not even to rename, re-invite or remove themself.
    refused(await call(updateActive, { uid }, { method: "PATCH", token: session.token, body: { displayName: "Promoted" } }), 403, "forbidden");
    refused(await call(createActiveInviteLink, { uid }, { method: "POST", token: session.token }), 403, "forbidden");
    refused(await call(removeActive, { uid }, { method: "DELETE", token: session.token, query: `?confirm=${NEW_ACTIVE}` }), 403, "forbidden");
    expect(await docData(`users/${uid}`)).toMatchObject({ displayName: "New Active", role: "active", status: "active" });
  });

  it("records nothing about how they use the portal: a heartbeat from an active is accepted and stores nothing", async () => {
    const before = await docData(`users/${uid}`);
    expect(ok(await call(heartbeat, {}, { method: "POST", token: session.token, body: { formId: "week2interviews" } }))).toEqual({ ok: true });
    expect(await docData(`users/${uid}`)).toEqual(before);
    expect(before?.activity).toEqual(NO_ACTIVITY);
    expect((await testDb().collection(`users/${uid}/sessions`).count().get()).data().count).toBe(0);
  });

  it("shows them as set up once they have signed in, and still adds the introduction to their link while the welcome is to do", async () => {
    const row = await rowOf(uid);
    expect(row).toMatchObject({ status: "active", accountState: "active", signInBlocked: false });
    expect(row.lastSignInAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // An active has a welcome of their own now, and has not been through it yet.
    expect((await docData(`users/${uid}`))?.onboardedAt).toBeNull();
    expect(ok<InviteLinkDto>(await invite(uid)).inviteLink).toMatch(WELCOME_LINK);
  });

  it("records their welcome when they finish it, tells them so, and stops adding the introduction to their link", async () => {
    const before = await docData(`users/${uid}`);
    const finished = ok<{ onboardedAt: string }>(await call(completeOnboarding, {}, { method: "POST", token: session.token }));
    expect(Math.abs(Date.parse(finished.onboardedAt) - Date.now())).toBeLessThan(60_000);
    // Only that moved on their profile, and asking again gives the same time back.
    expect({ ...(await docData(`users/${uid}`)), onboardedAt: null }).toEqual(before);
    expect(ok<{ onboardedAt: string }>(await call(completeOnboarding, {}, { method: "POST", token: session.token }))).toEqual(finished);
    expect(ok<MeDto>(await call(getMe, {}, { token: session.token })).onboardedAt).toBe(finished.onboardedAt);

    const { inviteLink } = ok<InviteLinkDto>(await invite(uid));
    expect(inviteLink).toMatch(INVITE_LINK);
    expect(inviteLink).not.toContain("welcome");
    expect([...new URL(inviteLink).searchParams.keys()]).toEqual(["mode", "oobCode"]);
    // The admin's row for an active still carries nothing about the welcome.
    expect(Object.keys(await rowOf(uid)).sort()).toEqual(ROW_KEYS);
  });

  it("renames them, in the profile and the sign-in account, and audits what changed", async () => {
    expect(ok(await patch(uid, { displayName: "  Renamed Active " }))).toEqual({ ok: true });
    expect(await rowOf(uid)).toMatchObject({ displayName: "Renamed Active", status: "active", email: NEW_ACTIVE });
    expect((await testAuth().getUser(uid)).displayName).toBe("Renamed Active");
    expect(await latestAudit()).toMatchObject({
      action: "active.update",
      targetType: "user",
      targetId: uid,
      actorEmail: ADMIN_ONE,
      summary: `${NEW_ACTIVE}: name`,
    });
    // Their existing session is unaffected by an edit.
    expect(ok<MeDto>(await call(getMe, {}, { token: session.token })).displayName).toBe("Renamed Active");
  });

  it("writes nothing, and no audit entry, when nothing actually changes", async () => {
    const auditBefore = await countAll("auditLog");
    const profileBefore = await docData(`users/${uid}`);
    ok(await patch(uid, { displayName: "Renamed Active", status: "active" }));
    ok(await patch(uid, {}));
    expect(await countAll("auditLog")).toBe(auditBefore);
    expect(await docData(`users/${uid}`)).toEqual(profileBefore);
  });

  it("ignores a class and a team in an edit, valid or not, and writes nothing for them", async () => {
    const auditBefore = await countAll("auditLog");
    const profileBefore = await docData(`users/${uid}`);
    for (const body of [
      { pledgeClass: "Nu", teamId: TEAM_ATLAS },
      { pledgeClass: "x".repeat(LIMITS.pledgeClass + 1) },
      { teamId: "nosuchteam" },
      { teamId: 42, pledgeClass: { name: "Nu" } },
    ]) {
      expect(ok(await patch(uid, body))).toEqual({ ok: true });
    }
    expect(await docData(`users/${uid}`)).toEqual(profileBefore);
    expect(profileBefore).toMatchObject({ pledgeClass: null, teamId: null });
    expect(await countAll("auditLog")).toBe(auditBefore);
    expect(await countWhere("users", "teamId", TEAM_ATLAS)).toBe(2);
    // The first of those bodies does change a pledge: both fields are read on the pledge route.
    ok(await call(updatePledge, { uid: caseyUid }, { method: "PATCH", token: admin.token, body: { pledgeClass: "Nu", teamId: TEAM_ATLAS } }));
    expect(await docData(`users/${caseyUid}`)).toMatchObject({ pledgeClass: "Nu", teamId: TEAM_ATLAS });
    ok(await call(updatePledge, { uid: caseyUid }, { method: "PATCH", token: admin.token, body: { pledgeClass: "Lambda", teamId: null } }));
  });

  it("renames them and still ignores the class and team sent in the same request", async () => {
    ok(await patch(uid, { displayName: "New Active", pledgeClass: "Nu", teamId: TEAM_ATLAS }));
    expect(await docData(`users/${uid}`)).toMatchObject({ displayName: "New Active", pledgeClass: null, teamId: null });
    expect((await latestAudit()).summary).toBe(`${NEW_ACTIVE}: name`);
  });

  it("ignores fields an admin may not set, such as role, email and uid", async () => {
    const auditBefore = await countAll("auditLog");
    ok(await patch(uid, { role: "admin", email: ADMIN_ONE, uid: admin.uid, submitted: { week0onboarding: {} }, createdAt: "2000-01-01T00:00:00.000Z" }));
    expect(await docData(`users/${uid}`)).toMatchObject({ role: "active", email: NEW_ACTIVE, submitted: {} });
    expect((await testAuth().getUser(uid)).customClaims).toEqual({ role: "active", issued: NEW_ACTIVE });
    expect(await countAll("auditLog")).toBe(auditBefore);
  });

  it.each<[string, unknown, string[]]>([
    ["an empty name", { displayName: "  " }, ["displayName:required"]],
    ["a name that is not text", { displayName: 42 }, ["displayName:required"]],
    ["an unknown status", { status: "suspended" }, ["status:invalid"]],
    ["several problems at once", { displayName: "", status: "deleted" }, ["displayName:required", "status:invalid"]],
  ])("refuses %s and changes nothing", async (_label, body, fields) => {
    const before = await docData(`users/${uid}`);
    expect(fieldCodes(refused(await patch(uid, body), 422, "invalid"))).toEqual(fields);
    expect(await docData(`users/${uid}`)).toEqual(before);
  });

  it(
    "cuts them off on their very next request when they are disabled",
    async () => {
      earlier = await signIn(NEW_ACTIVE, NEW_PASSWORD);
      ok(await call(getReviewOverview, {}, { token: earlier.token }));
      // Lets the re-enable test below tell revoked sessions apart: revocation is recorded to the second.
      await sleep(1100);

      expect(ok(await patch(uid, { status: "disabled" }))).toEqual({ ok: true });

      for (const token of [earlier.token, session.token]) {
        const overview = refused(await call(getReviewOverview, {}, { token }), 401, "account_disabled");
        expect(overview.error).toBe("This account has been disabled.");
        refused(await call(getReviewForm, { formId: "week0onboarding" }, { token }), 401, "account_disabled");
        refused(await call(getMe, {}, { token }), 401, "account_disabled");
        refused(await call(heartbeat, {}, { method: "POST", token }), 401, "account_disabled");
      }
    },
    SLOW_TEST_MS,
  );

  it("blocks new sign-ins, shows them as disabled, and audits the action", async () => {
    expect(await signInFailure(NEW_ACTIVE, NEW_PASSWORD)).toBe("USER_DISABLED");
    expect((await testAuth().getUser(uid)).disabled).toBe(true);
    expect(await rowOf(uid)).toMatchObject({ status: "disabled", accountState: "disabled", signInBlocked: true });
    expect(await docData(`users/${uid}`)).toMatchObject({ status: "disabled", role: "active" });
    expect(await latestAudit()).toMatchObject({
      action: "active.disable",
      targetType: "user",
      targetId: uid,
      summary: `${NEW_ACTIVE}: disabled the account`,
    });
  });

  it("does not hand out a set-password link while the account is disabled", async () => {
    refused(await invite(uid), 409, "account_disabled");
  });

  it("lets them sign in again once re-enabled, but does not bring their old sessions back", async () => {
    ok(await patch(uid, { status: "active" }));
    expect(await latestAudit()).toMatchObject({ action: "active.enable", targetId: uid, summary: `${NEW_ACTIVE}: re-enabled the account` });
    expect(await rowOf(uid)).toMatchObject({ status: "active", accountState: "active", signInBlocked: false });

    for (const token of [earlier.token, session.token]) {
      refused(await call(getReviewOverview, {}, { token }), 401, "session_revoked");
      refused(await call(getMe, {}, { token }), 401, "session_revoked");
    }
    session = await signIn(NEW_ACTIVE, NEW_PASSWORD);
    expect(ok<MeDto>(await call(getMe, {}, { token: session.token }))).toMatchObject({ email: NEW_ACTIVE, role: "active" });
    ok(await call(getReviewOverview, {}, { token: session.token }));
  });

  it("re-enables the sign-in account on request when only it was disabled, as for a pledge", async () => {
    await testAuth().updateUser(uid, { disabled: true });
    expect(await docData(`users/${uid}`)).toMatchObject({ status: "active" });
    expect(await rowOf(uid)).toMatchObject({ status: "disabled", accountState: "disabled", signInBlocked: true });

    const auditBefore = await countAll("auditLog");
    ok(await patch(uid, { status: "active" }));
    expect((await testAuth().getUser(uid)).disabled).toBe(false);
    expect(await countAll("auditLog")).toBe(auditBefore + 1);
    expect((await latestAudit()).action).toBe("active.enable");
    session = await signIn(NEW_ACTIVE, NEW_PASSWORD);
  });

  it(
    "resets their two-step verification: signs them out everywhere, keeps the account, and audits it",
    async () => {
      const before = await signIn(NEW_ACTIVE, NEW_PASSWORD);
      ok(await call(getReviewOverview, {}, { token: before.token }));
      await sleep(1100);

      expect(ok(await resetMfa(uid))).toEqual({ ok: true });

      refused(await call(getReviewOverview, {}, { token: before.token }), 401, "session_revoked");
      refused(await call(getMe, {}, { token: session.token }), 401, "session_revoked");
      const record = await testAuth().getUser(uid);
      expect(record.disabled).toBe(false);
      expect(record.multiFactor?.enrolledFactors ?? []).toEqual([]);
      expect(record.customClaims).toEqual({ role: "active", issued: NEW_ACTIVE });
      expect(await docData(`users/${uid}`)).toMatchObject({ role: "active", status: "active" });
      expect(await latestAudit()).toMatchObject({
        action: "active.reset_mfa",
        targetType: "user",
        targetId: uid,
        summary: `Reset two-step verification for ${NEW_ACTIVE}`,
      });

      session = await signIn(NEW_ACTIVE, NEW_PASSWORD);
      ok(await call(getReviewOverview, {}, { token: session.token }));
    },
    SLOW_TEST_MS,
  );

  it.each<[string, string | null]>([
    ["no confirmation", null],
    ["an empty confirmation", ""],
    ["another active's email", PRIYA],
    ["a pledge's email", AVERY],
    ["the admin's own email", ADMIN_ONE],
    ["their name", "New Active"],
    ["their uid", "uid"],
    ["only part of the email", "new.active"],
    ["the email with extra text", `${NEW_ACTIVE}x`],
  ])("refuses to remove them with %s", async (_label, confirm) => {
    const body = refused(await remove(uid, confirm === "uid" ? uid : confirm), 422, "invalid");
    expect(fieldCodes(body)).toEqual(["confirm:mismatch"]);
    expect(body.fields?.[0].message).toBe("Type the active's email address to confirm.");
  });

  it("removed nothing while the confirmation was wrong", async () => {
    expect(ok<MeDto>(await call(getMe, {}, { token: session.token })).email).toBe(NEW_ACTIVE);
    expect(await docExists(`users/${uid}`)).toBe(true);
    expect(await auditOf("active.remove")).toEqual([]);
  });

  it("removes them when the confirmation matches their email, ignoring case and padding", async () => {
    const pledgesBefore = await dumpPortal();
    const auditBefore = await countAll("auditLog");
    expect(ok(await remove(uid, "  NEW.ACTIVE@uci.edu "))).toEqual({ ok: true });

    expect(await docExists(`users/${uid}`)).toBe(false);
    await expect(testAuth().getUser(uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect((await actives()).map((row) => row.email)).not.toContain(NEW_ACTIVE);
    expect(await countAll("auditLog")).toBe(auditBefore + 1);
    expect(await latestAudit()).toMatchObject({
      action: "active.remove",
      targetType: "user",
      targetId: uid,
      actorEmail: ADMIN_ONE,
      summary: `Removed ${NEW_ACTIVE} and all their data`,
    });

    // Nothing of anyone else's went with them: every other document and account is as it was.
    const after = await dumpPortal();
    const withoutThem = (dump: typeof after) => ({
      firestore: Object.fromEntries(Object.entries(dump.firestore).filter(([path]) => path !== `users/${uid}` && !path.startsWith("auditLog/"))),
      accounts: Object.fromEntries(Object.entries(dump.accounts).filter(([account]) => account !== uid)),
    });
    expect(withoutThem(after)).toEqual(withoutThem(pledgesBefore));
    expect(await countAll("submissions")).toBe(9);
    expect(await countAll("punishments")).toBe(2);
  });

  it("ends their session and their ability to sign in, and is not found a second time", async () => {
    refused(await call(getReviewOverview, {}, { token: session.token }), 401, "account_removed");
    refused(await call(getMe, {}, { token: session.token }), 401, "account_removed");
    expect(await signInFailure(NEW_ACTIVE, NEW_PASSWORD)).toBe("EMAIL_NOT_FOUND");
    expect(refused(await remove(uid, NEW_ACTIVE), 404, "not_found").error).toBe(NOT_FOUND);
    refused(await patch(uid, { displayName: "Ghost" }), 404, "not_found");
  });

  it("frees the address, so the same person can be invited again from scratch", async () => {
    const again = ok<CreateActiveResultDto>(await create({ email: NEW_ACTIVE, displayName: "New Active" }));
    expect(again.active.uid).not.toBe(uid);
    expect(again.active).toMatchObject({ accountState: "invited", lastSignInAt: null });
    expect(again.inviteLink).toMatch(WELCOME_LINK);
    // The old password does not come back with the address.
    expect(await signInFailure(NEW_ACTIVE, NEW_PASSWORD)).toMatch(/INVALID|PASSWORD/);
  });
});

describe("the two kinds of account are kept apart", () => {
  let before: Awaited<ReturnType<typeof dumpPortal>>;
  let auditBefore: number;

  /** Everything a pledge route can be asked to do to an account. */
  const onPledgeRoutes = (uid: string, email: string): Array<[string, () => Promise<ApiResult>]> => [
    ["inspect", () => call(getPledgeDetail, { uid }, { token: admin.token })],
    ["rename", () => call(updatePledge, { uid }, { method: "PATCH", token: admin.token, body: { displayName: "Renamed As A Pledge" } })],
    ["disable", () => call(updatePledge, { uid }, { method: "PATCH", token: admin.token, body: { status: "disabled" } })],
    ["re-enable", () => call(updatePledge, { uid }, { method: "PATCH", token: admin.token, body: { status: "active" } })],
    ["give a class", () => call(updatePledge, { uid }, { method: "PATCH", token: admin.token, body: { pledgeClass: "Nu" } })],
    ["put on a team", () => call(updatePledge, { uid }, { method: "PATCH", token: admin.token, body: { teamId: TEAM_ATLAS } })],
    ["send nothing at all", () => call(updatePledge, { uid }, { method: "PATCH", token: admin.token, body: {} })],
    ["remove", () => call(removePledge, { uid }, { method: "DELETE", token: admin.token, query: `?confirm=${encodeURIComponent(email)}` })],
    ["reset two-step", () => call(resetPledgeMfa, { uid }, { method: "POST", token: admin.token })],
    ["create a set-password link", () => call(createPledgeInviteLink, { uid }, { method: "POST", token: admin.token })],
    ["issue a temporary password", () => call(issuePledgePassword, { uid }, { method: "POST", token: admin.token })],
    ["punish", () => call(addPunishment, { uid }, { method: "POST", token: admin.token, body: { title: "Not a pledge", details: "Planted on an active" } })],
  ];

  /** Everything an actives route can be asked to do to an account. */
  const onActivesRoutes = (uid: string, email: string): Array<[string, () => Promise<ApiResult>]> => [
    ["rename", () => patch(uid, { displayName: "Renamed As An Active" })],
    ["disable", () => patch(uid, { status: "disabled" })],
    ["re-enable", () => patch(uid, { status: "active" })],
    ["send nothing at all", () => patch(uid, {})],
    ["remove", () => remove(uid, email)],
    ["reset two-step", () => resetMfa(uid)],
    ["create a set-password link", () => invite(uid)],
    ["issue a temporary password", () => issuePassword(uid)],
  ];

  it("takes stock first", async () => {
    before = await dumpPortal();
    auditBefore = await countAll("auditLog");
    expect(Object.keys(before.firestore).length).toBeGreaterThan(60);
  });

  it.each<[string, () => [string, string]]>([
    ["an active who is set up", () => [priyaUid, PRIYA]],
    ["an active who has never signed in", () => [marcusUid, MARCUS]],
    ["a disabled active", () => [danaUid, DANA]],
  ])("every pledge route says %s does not exist", async (_label, target) => {
    const [uid, email] = target();
    for (const [action, attempt] of onPledgeRoutes(uid, email)) {
      const result = await attempt();
      const body = refused(result, 404, "not_found");
      expect(body.error, action).toBe(NOT_FOUND);
      expect(Object.keys(result.body as object).sort(), action).toEqual(["code", "error"]);
      // Nothing about the account it is, either.
      expect(result.text, action).not.toContain(email);
      expect(result.text, action).not.toMatch(/active/i);
    }
  });

  it("refuses to put an active on a team through the team routes, in any of the three ways", async () => {
    for (const uid of [priyaUid, marcusUid, danaUid]) {
      const created = refused(await call(createTeam, {}, { method: "POST", token: admin.token, body: { name: "Team With An Active", memberUids: [uid] } }), 422, "invalid");
      expect(fieldCodes(created)).toEqual(["memberUids:invalid"]);
      expect(created.fields?.[0].message).toBe("Only pledge accounts that still exist can be on a team.");
      // Alongside a real pledge, the whole request is refused: nobody is moved.
      const whole = await call(updateTeam, { teamId: TEAM_ATLAS }, { method: "PATCH", token: admin.token, body: { memberUids: [avery.uid, uid] } });
      expect(fieldCodes(refused(whole, 422, "invalid"))).toEqual(["memberUids:invalid"]);
      const added = await call(updateTeam, { teamId: TEAM_ATLAS }, { method: "PATCH", token: admin.token, body: { addUids: [uid] } });
      expect(fieldCodes(refused(added, 422, "invalid"))).toEqual(["addUids:invalid"]);
    }
    expect(await countAll("teams")).toBe(1);
    expect(await countWhere("users", "teamId", TEAM_ATLAS)).toBe(2);
  });

  it.each<[string, () => [string, string]]>([
    ["a pledge who is set up", () => [avery.uid, AVERY]],
    ["a pledge who has never signed in", () => [caseyUid, CASEY]],
    ["a disabled pledge", () => [rileyUid, RILEY]],
  ])("every actives route says %s does not exist", async (_label, target) => {
    const [uid, email] = target();
    for (const [action, attempt] of onActivesRoutes(uid, email)) {
      const result = await attempt();
      const body = refused(result, 404, "not_found");
      expect(body.error, action).toBe(NOT_FOUND);
      expect(Object.keys(result.body as object).sort(), action).toEqual(["code", "error"]);
      expect(result.text, action).not.toContain(email);
      expect(result.text, action).not.toMatch(/pledge/i);
    }
  });

  it("does not make a second account of the other kind at an address that is already taken", async () => {
    for (const email of [PRIYA, "Marcus.Lee@UCI.edu", DANA]) {
      const asPledge = await call(createPledge, {}, { method: "POST", token: admin.token, body: { email, displayName: "Also A Pledge", pledgeClass: "Mu" } });
      expect(refused(asPledge, 409, "email_exists").error).toBe("An account with that email already exists.");
    }
    for (const email of [AVERY, "Casey.Kim@UCI.edu", RILEY]) {
      refused(await create({ email, displayName: "Also An Active" }), 409, "email_exists");
    }
  });

  it("answers for the other kind of account exactly as it does for a uid nobody has", async () => {
    const unknown = await patch("nobody123", { displayName: "Ghost" });
    const pledge = await patch(avery.uid, { displayName: "Ghost" });
    expect(pledge.status).toBe(unknown.status);
    expect(pledge.text).toBe(unknown.text);

    const unknownPledge = await call(updatePledge, { uid: "nobody123" }, { method: "PATCH", token: admin.token, body: { displayName: "Ghost" } });
    const active = await call(updatePledge, { uid: priyaUid }, { method: "PATCH", token: admin.token, body: { displayName: "Ghost" } });
    expect(active.status).toBe(unknownPledge.status);
    expect(active.text).toBe(unknownPledge.text);
  });

  it("still refuses every action against an admin with 403, on the actives routes as on the pledge routes", async () => {
    for (const [uid, email] of [
      [adminTwo.uid, ADMIN_TWO],
      [admin.uid, ADMIN_ONE],
    ] as const) {
      // Twenty requests for each admin, and forty between them: more changes than one account may make in a minute.
      resetRateLimits();
      for (const [action, attempt] of [...onActivesRoutes(uid, email), ...onPledgeRoutes(uid, email)]) {
        const body = refused(await attempt(), 403, "cannot_modify_admin");
        expect(body.error, action).toBe("Admin accounts can't be changed here.");
      }
    }
  });

  it("wrote nothing for any of those: every document and every sign-in account is exactly as it was", async () => {
    const after = await dumpPortal();
    expect(after.accounts).toEqual(before.accounts);
    expect(after.firestore).toEqual(before.firestore);
    expect(await countAll("auditLog")).toBe(auditBefore);
    expect(await countAll("punishments")).toBe(2);
    for (const uid of [priyaUid, marcusUid, danaUid]) expect(await countWhere("punishments", "uid", uid), uid).toBe(0);
    // Nobody was put on a temporary password by a route for the other kind of account, or by one aimed at an admin.
    for (const account of Object.values(after.accounts)) expect(JSON.stringify(account)).not.toMatch(/"temp"/);
    // Both admins can still sign in and act, with the passwords they had.
    ok(await call(listActives, {}, { token: adminTwo.token }));
    expect(ok<MeDto>(await call(getMe, {}, { token: admin.token })).role).toBe("admin");
    for (const email of [ADMIN_ONE, ADMIN_TWO, AVERY, PRIYA]) expect((await signIn(email)).email).toBe(email);
  });

  it("would have acted on the right kind of account: the same requests are accepted there", async () => {
    // Each kind through its own routes, with the request that was just refused through the other's.
    ok(await call(updatePledge, { uid: caseyUid }, { method: "PATCH", token: admin.token, body: { displayName: "Renamed As A Pledge" } }));
    expect(await docData(`users/${caseyUid}`)).toMatchObject({ displayName: "Renamed As A Pledge", role: "pledge" });
    ok(await call(updatePledge, { uid: caseyUid }, { method: "PATCH", token: admin.token, body: { displayName: "Casey Kim" } }));
    ok(await call(addPunishment, { uid: caseyUid }, { method: "POST", token: admin.token, body: { title: "Not a pledge", details: "Planted on an active" } }));
    expect(await countWhere("punishments", "uid", caseyUid)).toBe(1);

    ok(await patch(marcusUid, { displayName: "Renamed As An Active" }));
    expect(await docData(`users/${marcusUid}`)).toMatchObject({ displayName: "Renamed As An Active", role: "active" });
    ok(await patch(marcusUid, { displayName: "Marcus Lee" }));
    ok(await resetMfa(marcusUid));
    ok(await patch(danaUid, { status: "active" }));
    expect(await rowOf(danaUid)).toMatchObject({ status: "active", signInBlocked: false });
    ok(await patch(danaUid, { status: "disabled" }));

    // And a temporary password, through the route for the kind of account it is.
    const issuedFrom = Date.now();
    const issued = ok<TemporaryPasswordDto>(await issuePassword(marcusUid));
    expect(Object.keys(issued)).toEqual(["temporaryPassword"]);
    expect(issued.temporaryPassword).toMatch(TEMPORARY_PASSWORD);
    issuedToMarcus = issued.temporaryPassword;
    // The flag, the time it was issued, and that Marcus has yet to be welcomed. Nothing else.
    const claims = (await testAuth().getUser(marcusUid)).customClaims ?? null;
    expect(claims).toEqual(temporaryClaims("active", MARCUS, true));
    expectIssuedBetween(claims, issuedFrom, Date.now());
    // A fingerprint of it is kept on his profile, and is in nothing an admin is sent.
    expect(await storedFingerprint(marcusUid)).toEqual({ salt: expect.stringMatching(/^[0-9a-f]{32}$/), hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const listed = await call(listActives, {}, { token: admin.token });
    for (const kept of await everyStoredFingerprint()) expect(listed.text).not.toContain(kept);
    expect(listed.text).not.toMatch(/temporaryPassword|"salt"|"hash"|"tempAt"|"tempNew"/);
    expect(await rowOf(marcusUid)).toMatchObject({ accountState: "invited", status: "active" });
    expect((await signIn(MARCUS, issuedToMarcus)).uid).toBe(marcusUid);
    expect(await latestAudit()).toMatchObject({
      action: "active.temporary_password",
      targetType: "user",
      targetId: marcusUid,
      actorEmail: ADMIN_ONE,
      summary: `Issued a temporary password for ${MARCUS}`,
    });
  });

  it("removes a seeded active through the actives route, with their own email as the confirmation", async () => {
    expect(fieldCodes(refused(await remove(danaUid, AVERY), 422, "invalid"))).toEqual(["confirm:mismatch"]);
    ok(await remove(danaUid, DANA));
    expect(await docExists(`users/${danaUid}`)).toBe(false);
    expect((await actives()).map((row) => row.email)).not.toContain(DANA);
    expect((await pledgeOverview()).pledges).toHaveLength(6);
  });
});

describe("accounts that only partly look like actives", () => {
  const profile = (email: string, role: string) => ({
    email,
    displayName: "Edge Case",
    role,
    status: "active",
    pledgeClass: null,
    teamId: null,
    onboardedAt: null,
    createdAt: Timestamp.now(),
    createdBy: "test",
    updatedAt: Timestamp.now(),
    submitted: {},
    activity: NO_ACTIVITY,
  });

  it("refuses to change an account whose token role is admin, even if its profile says active", async () => {
    const email = "claims.admin.active@uci.edu";
    const record = await testAuth().createUser({ email, emailVerified: true });
    await testAuth().setCustomUserClaims(record.uid, { role: "admin" });
    await testDb().doc(`users/${record.uid}`).set(profile(email, "active"));

    refused(await patch(record.uid, { status: "disabled" }), 403, "cannot_modify_admin");
    refused(await remove(record.uid, email), 403, "cannot_modify_admin");
    refused(await resetMfa(record.uid), 403, "cannot_modify_admin");
    refused(await invite(record.uid), 403, "cannot_modify_admin");
    refused(await issuePassword(record.uid), 403, "cannot_modify_admin");
    const after = await testAuth().getUser(record.uid);
    expect(after.disabled).toBe(false);
    // Still an admin's claims, and still no password: none was set for it.
    expect(after.customClaims).toEqual({ role: "admin" });
    expect(after.passwordHash).toBeUndefined();
    expect(await docExists(`users/${record.uid}`)).toBe(true);
  });

  it("refuses to change an account whose profile role is admin, even if its token says active", async () => {
    const email = "profile.admin.active@uci.edu";
    const record = await testAuth().createUser({ email, emailVerified: true });
    await testAuth().setCustomUserClaims(record.uid, { role: "active", issued: email });
    await testDb().doc(`users/${record.uid}`).set(profile(email, "admin"));

    refused(await patch(record.uid, { status: "disabled" }), 403, "cannot_modify_admin");
    refused(await remove(record.uid, email), 403, "cannot_modify_admin");
    refused(await issuePassword(record.uid), 403, "cannot_modify_admin");
    const after = await testAuth().getUser(record.uid);
    expect(after.disabled).toBe(false);
    expect(after.customClaims).toEqual({ role: "active", issued: email });
    expect(after.passwordHash).toBeUndefined();
    expect(await docExists(`users/${record.uid}`)).toBe(true);
  });

  it("does not list an account as an active because its token says so: the profile decides", async () => {
    const email = "claims.only.active@uci.edu";
    const record = await testAuth().createUser({ email, emailVerified: true });
    await testAuth().setCustomUserClaims(record.uid, { role: "active", issued: email });
    await testDb().doc(`users/${record.uid}`).set(profile(email, "pledge"));

    expect((await actives()).map((row) => row.email)).not.toContain(email);
    refused(await patch(record.uid, { displayName: "Not An Active" }), 404, "not_found");
    expect(await docData(`users/${record.uid}`)).toMatchObject({ displayName: "Edge Case" });
  });
});

describe("audit trail", () => {
  it("has an entry of its own for everything that was done to an active, under the active's action names", async () => {
    const actions = new Set((await storedAudit()).map((entry) => entry.action).filter((action) => action.startsWith("active.")));
    expect([...actions].sort()).toEqual([
      "active.create",
      "active.disable",
      "active.enable",
      "active.invite_link",
      "active.remove",
      "active.reset_mfa",
      "active.temporary_password",
      "active.update",
    ]);
  });

  it("recorded nothing done to an active under a pledge's action name", async () => {
    const activeEmails = [PRIYA, MARCUS, DANA, NEW_ACTIVE, "class.and.team@uci.edu", "odd.types@uci.edu"];
    const pledgeActions = (await storedAudit()).filter((entry) => entry.action.startsWith("pledge."));
    for (const entry of pledgeActions) {
      for (const email of activeEmails) expect(entry.summary, entry.action).not.toContain(email);
    }
  });

  it("attributes every entry written in this file to the admin who acted", async () => {
    const entries = (await storedAudit()).filter((entry) => entry.actorUid !== "seed" && entry.action !== "form.publish");
    expect(entries.length).toBeGreaterThan(10);
    for (const entry of entries) {
      expect(entry.actorUid).toBe(admin.uid);
      expect(entry.actorEmail).toBe(ADMIN_ONE);
      expect(entry.targetType === "user" || entry.targetType === "punishment").toBe(true);
      expect(entry.summary.length).toBeGreaterThan(0);
    }
  });

  it("never stores a set-password code or link", async () => {
    expect(JSON.stringify(await storedAudit())).not.toMatch(/oobCode|login\/reset|resetPassword/);
  });

  it("never stores a temporary password either: the entry says one was issued, and to whom", async () => {
    expect(issuedToMarcus).toMatch(TEMPORARY_PASSWORD);
    const text = JSON.stringify(await storedAudit());
    expect(text).toContain(`Issued a temporary password for ${MARCUS}`);
    expect(text.toUpperCase()).not.toContain(issuedToMarcus);
    expect(text).not.toMatch(/[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}/);
  });
});
