/**
 * The People page: everyone with a portal account, and changing a person's
 * role. Tests run in order from a fresh seed: what is listed, every reason a
 * change is refused, then real changes in every direction, each followed
 * through to what the person can reach afterwards, and last the admin made
 * here being let in by a claim rather than the configured list.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listActives } from "@/app/api/portal/admin/actives/route";
import { POST as changeRole } from "@/app/api/portal/admin/people/[uid]/role/route";
import { GET as listPeople } from "@/app/api/portal/admin/people/route";
import { GET as getOverview, POST as createPledge } from "@/app/api/portal/admin/pledges/route";
import { DELETE as removePreview, POST as startPreview } from "@/app/api/portal/admin/preview/route";
import { GET as getDashboard } from "@/app/api/portal/dashboard/route";
import { GET as getMe } from "@/app/api/portal/me/route";
import { POST as choosePassword } from "@/app/api/portal/password/route";
import { GET as getReviewOverview } from "@/app/api/portal/review/overview/route";
import { resetRateLimits } from "@/lib/portal/server/rate-limit";
import type {
  ActivesDto,
  AdminOverviewDto,
  ChangeRoleResultDto,
  CreatePledgeResultDto,
  MeDto,
  PeopleDto,
  PersonRowDto,
  PreviewStartResultDto,
} from "@/lib/portal/types";
import { DEMO_ACTIVES } from "../../scripts/portal/seed-emulator.mjs";
import {
  ADMIN_ONE,
  ADMIN_TWO,
  AVERY,
  CASEY,
  DANA,
  JORDAN,
  MARCUS,
  MAYA,
  OWN_PASSWORD,
  PRIYA,
  RILEY,
  SAM,
  SEEDED_ACCOUNTS,
  SEED_TIMEOUT_MS,
  SLOW_TEST_MS,
  TEAM_ATLAS,
  call,
  countAll,
  countWhere,
  createAccount,
  createProfile,
  docData,
  dumpPortal,
  fieldCodes,
  ok,
  refused,
  seedPortal,
  signIn,
  sleep,
  storedAudit,
  storedClaims,
  storedFingerprint,
  temporaryClaims,
  testAuth,
  testDb,
  uidOf,
  type ApiResult,
  type Session,
} from "./helpers";

const ROW_KEYS = ["accountState", "adminKind", "canChangeRole", "createdAt", "displayName", "email", "lastSignInAt", "role", "self", "signInBlocked", "status", "uid"];
const NOT_FOUND = "That account doesn't exist.";

let admin: Session;
let adminTwo: Session;
let priya: Session;
let avery: Session;

const people = async (token = admin.token): Promise<PeopleDto> => ok<PeopleDto>(await call(listPeople, {}, { token }));
const rowOf = async (uid: string, token = admin.token): Promise<PersonRowDto> => {
  const row = (await people(token)).people.find((person) => person.uid === uid);
  if (!row) throw new Error(`No row for ${uid}`);
  return row;
};
const change = (uid: string, role: unknown, token = admin.token): Promise<ApiResult> =>
  call(changeRole, { uid }, { method: "POST", token, body: { role } });
const latestAudit = async () => (await storedAudit())[0];

beforeAll(async () => {
  await seedPortal();
  [admin, adminTwo, priya, avery] = await Promise.all([ADMIN_ONE, ADMIN_TWO, PRIYA, AVERY].map((email) => signIn(email)));
}, SEED_TIMEOUT_MS);

beforeEach(() => {
  resetRateLimits();
});

describe("the list of people", () => {
  it("has everyone the seed makes, by name: two admins, three actives and six pledges", async () => {
    const result = await call(listPeople, {}, { token: admin.token });
    const body = ok<PeopleDto>(result);
    expect(Object.keys(body).sort()).toEqual(["people", "preview", "serverNow", "teams"]);
    expect(body.people).toHaveLength(SEEDED_ACCOUNTS);
    expect(body.people.map((person) => person.displayName)).toEqual([...body.people.map((person) => person.displayName)].sort((a, b) => a.localeCompare(b)));
    expect(body.people.filter((person) => person.role === "admin").map((person) => person.email).sort()).toEqual([ADMIN_ONE, ADMIN_TWO]);
    expect(body.people.filter((person) => person.role === "active").map((person) => person.email).sort()).toEqual(DEMO_ACTIVES.map((active) => active.email).sort());
    expect(body.people.filter((person) => person.role === "pledge")).toHaveLength(6);
    expect(body.preview).toBeNull();
    expect(body.teams).toEqual([expect.objectContaining({ id: TEAM_ATLAS, memberCount: 2 })]);
    expect(Date.parse(body.serverNow)).toBeGreaterThan(Date.now() - 60_000);
  });

  it("gives each row exactly the fields of an account, and never a credential", async () => {
    const result = await call(listPeople, {}, { token: admin.token });
    for (const row of ok<PeopleDto>(result).people) expect(Object.keys(row).sort(), row.displayName).toEqual(ROW_KEYS);
    expect(result.text).not.toMatch(/password|salt|oobCode|refreshToken|customClaims|"activity"|"submitted"/i);
  });

  it("marks the caller's own row, and the admins as listed, which nobody can change here", async () => {
    const rows = (await people()).people;
    const me = rows.find((person) => person.uid === admin.uid);
    const other = rows.find((person) => person.uid === adminTwo.uid);
    expect(me).toMatchObject({ role: "admin", adminKind: "listed", self: true, canChangeRole: false });
    expect(other).toMatchObject({ role: "admin", adminKind: "listed", self: false, canChangeRole: false });
    expect(rows.filter((person) => person.self)).toHaveLength(1);
    // Seen from the other admin, the rows swap.
    expect((await rowOf(adminTwo.uid, adminTwo.token)).self).toBe(true);
    expect((await rowOf(admin.uid, adminTwo.token)).self).toBe(false);
  });

  it("says who can be changed: members who are not disabled", async () => {
    const rows = (await people()).people;
    for (const row of rows.filter((person) => person.role !== "admin")) {
      expect(row.adminKind, row.email).toBeNull();
      expect(row.canChangeRole, row.email).toBe(row.status !== "disabled");
    }
    expect(rows.filter((person) => !person.canChangeRole).map((person) => person.email).sort()).toEqual([ADMIN_ONE, ADMIN_TWO, DANA, RILEY].sort());
  });

  it("shows the same account states as the pledge and active pages", async () => {
    const [overview, actives, rows] = [
      ok<AdminOverviewDto>(await call(getOverview, {}, { token: admin.token })),
      ok<ActivesDto>(await call(listActives, {}, { token: admin.token })),
      (await people()).people,
    ];
    for (const pledge of overview.pledges) {
      const row = rows.find((person) => person.uid === pledge.uid);
      expect(row, pledge.email).toMatchObject({ email: pledge.email, displayName: pledge.displayName, role: "pledge", status: pledge.status, accountState: pledge.accountState, signInBlocked: pledge.signInBlocked, lastSignInAt: pledge.lastSignInAt });
    }
    for (const active of actives.actives) {
      const row = rows.find((person) => person.uid === active.uid);
      expect(row, active.email).toMatchObject({ email: active.email, role: "active", status: active.status, accountState: active.accountState });
    }
    expect((await rowOf(await uidOf(CASEY))).accountState).toBe("invited");
    expect((await rowOf(await uidOf(RILEY)))).toMatchObject({ status: "disabled", accountState: "disabled", signInBlocked: true });
  });

  it("leaves the caller's preview account out of the people, and shows it beside them", async () => {
    const started = ok<PreviewStartResultDto>(await call(startPreview, {}, { method: "POST", token: admin.token, body: { role: "pledge" } }));
    try {
      const body = await people();
      expect(body.people.map((person) => person.uid)).not.toContain(started.preview.uid);
      expect(body.people).toHaveLength(SEEDED_ACCOUNTS);
      expect(body.preview).toEqual(started.preview);
      // Nor can it be given a role.
      expect(refused(await change(started.preview.uid, "active"), 404, "not_found").error).toBe(NOT_FOUND);
      expect(refused(await change(started.preview.uid, "active", adminTwo.token), 404, "not_found").error).toBe(NOT_FOUND);
    } finally {
      ok(await call(removePreview, {}, { method: "DELETE", token: admin.token }));
    }
  });

  it("is an admin's alone", async () => {
    refused(await call(listPeople, {}, { token: priya.token }), 403, "forbidden");
    refused(await call(listPeople, {}, { token: avery.token }), 403, "forbidden");
    refused(await change(avery.uid, "active", priya.token), 403, "forbidden");
    refused(await change(priya.uid, "pledge", avery.token), 403, "forbidden");
  });
});

describe("a role change that is refused", () => {
  let before: Awaited<ReturnType<typeof dumpPortal>>;
  let auditBefore: number;
  let onTemporaryUid: string;
  let outsideUid: string;

  it("takes stock first, and makes two accounts the seed lacks", async () => {
    // A pledge still on a temporary password, made as the portal makes one.
    const made = ok<CreatePledgeResultDto>(await call(createPledge, {}, { method: "POST", token: admin.token, body: { email: "on.temporary@uci.edu", displayName: "On Temporary", start: "temporary_password" } }));
    onTemporaryUid = made.pledge.uid;
    // A granted admin outside UCI, as one made from the portal could be, since admins need no UCI address.
    const outside = await createAccount("advisor@example.org", { claims: { role: "admin", granted: true } });
    outsideUid = outside.uid;
    await createProfile(outsideUid, "advisor@example.org", "active", "Outside Advisor");
    await testDb().doc(`users/${outsideUid}`).update({ role: "admin" });
    expect((await rowOf(outsideUid))).toMatchObject({ role: "admin", adminKind: "granted", canChangeRole: true });

    before = await dumpPortal();
    auditBefore = await countAll("auditLog");
  });

  // What lets an admin in is the configured list or the claim the portal puts on one it made.
  // An admin on paper alone, with neither, is shown as neither, and the page copes.
  it("tells a granted admin by the claim on their sign-in, not by their profile", async () => {
    expect(await rowOf(outsideUid)).toMatchObject({ role: "admin", adminKind: "granted" });
    await testAuth().setCustomUserClaims(outsideUid, { role: "admin" });
    try {
      expect(await rowOf(outsideUid)).toMatchObject({ role: "admin", adminKind: null, canChangeRole: true });
    } finally {
      await testAuth().setCustomUserClaims(outsideUid, { role: "admin", granted: true });
    }
    expect(await rowOf(outsideUid)).toMatchObject({ adminKind: "granted" });
  });

  it.each<[string, unknown]>([
    ["no role", undefined],
    ["an unknown role", "owner"],
    ["the role in the wrong case", "Admin"],
    ["a list", ["admin"]],
    ["a number", 1],
  ])("refuses %s with 422", async (_label, role) => {
    const body = refused(await change(avery.uid, role), 422, "invalid");
    expect(fieldCodes(body)).toEqual(["role:invalid"]);
  });

  it("refuses the caller's own role, whatever it is set to", async () => {
    for (const role of ["admin", "active", "pledge"]) {
      const body = refused(await change(admin.uid, role), 403, "cannot_change_self");
      expect(body.error).toBe("You can't change your own role. Ask another admin.");
    }
  });

  it("refuses an admin named in the configuration, in either direction", async () => {
    for (const role of ["active", "pledge", "admin"]) {
      const body = refused(await change(adminTwo.uid, role), 403, "listed_admin");
      expect(body.error).toBe("This admin is set in the portal's configuration and can't be changed here.");
    }
    // Even by the other listed admin.
    refused(await change(admin.uid, "pledge", adminTwo.token), 403, "listed_admin");
  });

  it("refuses a disabled account", async () => {
    for (const [email, role] of [[RILEY, "active"], [DANA, "pledge"], [DANA, "admin"]] as const) {
      const body = refused(await change(await uidOf(email), role), 409, "account_disabled");
      expect(body.error).toBe("Re-enable the account first.");
    }
  });

  it("refuses the role the person already has", async () => {
    for (const [uid, role] of [[avery.uid, "pledge"], [priya.uid, "active"], [outsideUid, "admin"]] as const) {
      const body = refused(await change(uid, role), 409, "same_role");
      expect(body.error).toBe("They already have that role.");
    }
  });

  it("refuses to make an account outside UCI a pledge or an active", async () => {
    for (const role of ["pledge", "active"]) {
      const body = refused(await change(outsideUid, role), 422, "invalid");
      expect(fieldCodes(body)).toEqual(["role:invalid_email"]);
      expect(body.fields?.[0].message).toBe("Only a UCI address can be a pledge or an active.");
    }
  });

  it("refuses to make an admin of someone still on a temporary password", async () => {
    const body = refused(await change(onTemporaryUid, "admin"), 409, "on_temporary_password");
    expect(body.error).toBe("They are still on a temporary password. Wait until they have chosen their own, or send them a password link first.");
    expect(await storedClaims(onTemporaryUid)).toEqual(temporaryClaims("pledge", "on.temporary@uci.edu", true));
  });

  it("is not found for a uid nobody has, or one that is not an account", async () => {
    for (const uid of ["nobody123", TEAM_ATLAS, "week0onboarding"]) {
      expect(refused(await change(uid, "active"), 404, "not_found").error).toBe(NOT_FOUND);
    }
    refused(await change("../x", "active"), 404, "not_found");
  });

  it("refuses to step the only admin down", async () => {
    // Seen from a caller whose own profile does not count: a granted admin with none.
    const lone = await createAccount("lone.caller@uci.edu", { claims: { role: "admin", granted: true } });
    const listedRefs = [admin.uid, adminTwo.uid].map((uid) => testDb().doc(`users/${uid}`));
    for (const ref of listedRefs) await ref.update({ status: "disabled" });
    try {
      const body = refused(await change(outsideUid, "pledge", lone.token), 409, "last_admin");
      expect(body.error).toBe("At least one admin has to remain.");
      expect(await docData(`users/${outsideUid}`)).toMatchObject({ role: "admin" });
      expect(await storedClaims(outsideUid)).toEqual({ role: "admin", granted: true });
    } finally {
      for (const ref of listedRefs) await ref.update({ status: "active" });
      await testAuth().deleteUser(lone.uid);
    }
  });

  it("changed nothing for any of those: every document and every sign-in account is exactly as it was", async () => {
    const after = await dumpPortal();
    expect(after.firestore).toEqual(before.firestore);
    // Nobody's sessions were ended either: every refusal came before anything was touched.
    expect(after.accounts).toEqual(before.accounts);
    expect(await countAll("auditLog")).toBe(auditBefore);
  });
});

describe("a pledge who becomes an active", () => {
  let result: ChangeRoleResultDto;
  let earlier: Session;

  it(
    "changes the role, takes them off their team, ends their sessions, and says so",
    async () => {
      expect(await docData(`users/${avery.uid}`)).toMatchObject({ role: "pledge", teamId: TEAM_ATLAS });
      earlier = await signIn(AVERY);
      ok(await call(getDashboard, {}, { token: earlier.token }));
      await sleep(1100);

      const response = await change(avery.uid, "active");
      result = ok<ChangeRoleResultDto>(response);
      expect(Object.keys(result)).toEqual(["person"]);
      expect(Object.keys(result.person).sort()).toEqual(ROW_KEYS);
      expect(result.person).toMatchObject({ uid: avery.uid, email: AVERY, displayName: "Avery Chen", role: "active", status: "active", adminKind: null, self: false, canChangeRole: true });

      // Off the team and out of the class, and welcomed afresh as an active.
      expect(await docData(`users/${avery.uid}`)).toMatchObject({ role: "active", teamId: null, pledgeClass: null, onboardedAt: null, displayName: "Avery Chen" });
      expect(await storedClaims(avery.uid)).toEqual({ role: "active", issued: AVERY });
      expect(await latestAudit()).toMatchObject({
        action: "member.role_change",
        targetType: "user",
        targetId: avery.uid,
        actorEmail: ADMIN_ONE,
        summary: `${AVERY}: pledge to active`,
      });
      for (const token of [earlier.token, avery.token]) refused(await call(getMe, {}, { token }), 401, "session_revoked");
    },
    SLOW_TEST_MS,
  );

  it("keeps their responses, and leaves the team with one member", async () => {
    expect(await countWhere("submissions", "uid", avery.uid)).toBe(3);
    expect(await countWhere("users", "teamId", TEAM_ATLAS)).toBe(1);
    expect((await people()).teams).toEqual([expect.objectContaining({ id: TEAM_ATLAS, memberCount: 1 })]);
    expect(ok<MeDto>(await call(getMe, {}, { token: (await signIn(JORDAN)).token })).team?.teammates).toEqual([]);
  });

  it("lets them in as an active at the next sign-in, and as nothing else", async () => {
    avery = await signIn(AVERY);
    expect(ok<MeDto>(await call(getMe, {}, { token: avery.token }))).toMatchObject({ role: "active", team: null, pledgeClass: null, onboardedAt: null });
    ok(await call(getReviewOverview, {}, { token: avery.token }));
    refused(await call(getDashboard, {}, { token: avery.token }), 403, "forbidden");
    refused(await call(listPeople, {}, { token: avery.token }), 403, "forbidden");
  });

  it("moves them from the pledges' list to the actives'", async () => {
    expect(ok<AdminOverviewDto>(await call(getOverview, {}, { token: admin.token })).pledges.map((pledge) => pledge.email)).not.toContain(AVERY);
    expect(ok<ActivesDto>(await call(listActives, {}, { token: admin.token })).actives.map((active) => active.email)).toContain(AVERY);
    expect(await rowOf(avery.uid)).toMatchObject({ role: "active", adminKind: null });
  });
});

describe("an active who becomes an admin", () => {
  it(
    "is let in by a claim, not the list, and can then do everything an admin can",
    async () => {
      const welcomed = (await docData(`users/${priya.uid}`))?.onboardedAt;
      expect(welcomed).not.toBeNull();
      const result = ok<ChangeRoleResultDto>(await change(priya.uid, "admin"));
      expect(result.person).toMatchObject({ uid: priya.uid, role: "admin", adminKind: "granted", canChangeRole: true, self: false });
      expect(await storedClaims(priya.uid)).toEqual({ role: "admin", granted: true });
      // An admin has no welcome of their own, so the one they had is left as it was.
      expect(await docData(`users/${priya.uid}`)).toMatchObject({ role: "admin", teamId: null, onboardedAt: welcomed });
      expect((await latestAudit()).summary).toBe(`${PRIYA}: active to admin`);
      refused(await call(getMe, {}, { token: priya.token }), 401, "session_revoked");

      priya = await signIn(PRIYA);
      expect(ok<MeDto>(await call(getMe, {}, { token: priya.token }))).toMatchObject({ role: "admin", email: PRIYA });
      const asAdmin = await people(priya.token);
      expect(asAdmin.people.find((person) => person.uid === priya.uid)).toMatchObject({ self: true, adminKind: "granted", canChangeRole: false });
      ok(await call(getOverview, {}, { token: priya.token }));
      refused(await call(getReviewOverview, {}, { token: priya.token }), 403, "forbidden");
      expect(ok<ActivesDto>(await call(listActives, {}, { token: admin.token })).actives.map((active) => active.email)).not.toContain(PRIYA);
    },
    SLOW_TEST_MS,
  );

  it("can change anyone's role, including a listed admin's not at all, and their own not at all", async () => {
    refused(await change(priya.uid, "active", priya.token), 403, "cannot_change_self");
    refused(await change(admin.uid, "active", priya.token), 403, "listed_admin");
    // Another admin can change them back and forth: a granted admin is not listed.
    expect((await rowOf(priya.uid, adminTwo.token)).canChangeRole).toBe(true);
  });

  it("is stepped down to a pledge by another admin, and loses the claim with the role", async () => {
    const result = ok<ChangeRoleResultDto>(await change(priya.uid, "pledge", adminTwo.token));
    expect(result.person).toMatchObject({ role: "pledge", adminKind: null });
    expect(await storedClaims(priya.uid)).toEqual({ role: "pledge", issued: PRIYA });
    // A pledge's welcome is not the one an active had: it is theirs to go through.
    expect(await docData(`users/${priya.uid}`)).toMatchObject({ role: "pledge", onboardedAt: null });
    expect((await latestAudit())).toMatchObject({ actorEmail: ADMIN_TWO, summary: `${PRIYA}: admin to pledge` });
    refused(await call(getMe, {}, { token: priya.token }), 401, "session_revoked");
    priya = await signIn(PRIYA);
    refused(await call(listPeople, {}, { token: priya.token }), 403, "forbidden");
    ok(await call(getDashboard, {}, { token: priya.token }));
    expect(ok<AdminOverviewDto>(await call(getOverview, {}, { token: admin.token })).pledges.map((pledge) => pledge.email)).toContain(PRIYA);
  });
});

describe("a member on a temporary password who moves between the member roles", () => {
  it("keeps the temporary password, as it was issued, in the new role", async () => {
    const uid = await uidOf("on.temporary@uci.edu");
    const before = await storedClaims(uid);
    expect(before).toEqual(temporaryClaims("pledge", "on.temporary@uci.edu", true));
    const fingerprintBefore = await storedFingerprint(uid);

    const result = ok<ChangeRoleResultDto>(await change(uid, "active"));
    expect(result.person).toMatchObject({ role: "active", accountState: "invited" });
    expect(await storedClaims(uid)).toEqual({ ...before, role: "active" });
    expect(await storedFingerprint(uid)).toEqual(fingerprintBefore);
    expect((await latestAudit()).summary).toBe("on.temporary@uci.edu: pledge to active");
    // Still refused the admin role while on it, and still able to choose a password, now as an active.
    refused(await change(uid, "admin"), 409, "on_temporary_password");
  });
});

// A change that got as far as the profile and no further leaves the sign-in on the
// old role. Asking for the profile's role again is how the sign-in catches up.
describe("a change that was only half applied", () => {
  it("is not refused as the same role when the sign-in disagrees with the profile, and rewrites the sign-in", async () => {
    const mayaUid = await uidOf(MAYA);
    expect(await docData(`users/${mayaUid}`)).toMatchObject({ role: "pledge" });
    await testAuth().setCustomUserClaims(mayaUid, { role: "admin", granted: true });
    // With the profile and the sign-in agreeing, the same role is refused as before.
    refused(await change(avery.uid, "active"), 409, "same_role");

    const profileBefore = await docData(`users/${mayaUid}`);
    const result = ok<ChangeRoleResultDto>(await change(mayaUid, "pledge"));
    expect(result.person).toMatchObject({ uid: mayaUid, role: "pledge", adminKind: null });
    expect(await storedClaims(mayaUid)).toEqual({ role: "pledge", issued: MAYA });
    // The role is the one they had, so nothing else about them moves: the same class, team and welcome.
    expect({ ...(await docData(`users/${mayaUid}`)), updatedAt: null }).toEqual({ ...profileBefore, updatedAt: null });
    expect(await latestAudit()).toMatchObject({ action: "member.role_change", targetId: mayaUid, summary: `${MAYA}: pledge to pledge` });
    // And now it is the same role in both places, so asking again is refused.
    refused(await change(mayaUid, "pledge"), 409, "same_role");
  });
});

describe("an admin who becomes an active, and a pledge who becomes an admin", () => {
  it("takes the granted admin outside UCI nowhere but admin, and a pledge straight to admin", async () => {
    const outsideUid = await uidOf("advisor@example.org");
    refused(await change(outsideUid, "active"), 422, "invalid");

    const samUid = await uidOf(SAM);
    const result = ok<ChangeRoleResultDto>(await change(samUid, "admin"));
    expect(result.person).toMatchObject({ role: "admin", adminKind: "granted" });
    expect(await storedClaims(samUid)).toEqual({ role: "admin", granted: true });
    const sam = await signIn(SAM);
    ok(await call(listPeople, {}, { token: sam.token }));
    // And back to an active, with a member's claims.
    ok(await change(samUid, "active"));
    expect(await storedClaims(samUid)).toEqual({ role: "active", issued: SAM });
    expect(await docData(`users/${samUid}`)).toMatchObject({ role: "active", teamId: null });
  });

  it("recorded one entry per change, each naming the person and both roles", async () => {
    const entries = (await storedAudit()).filter((entry) => entry.action === "member.role_change");
    expect(entries.map((entry) => entry.summary)).toEqual([
      `${SAM}: admin to active`,
      `${SAM}: pledge to admin`,
      `${MAYA}: pledge to pledge`,
      "on.temporary@uci.edu: pledge to active",
      `${PRIYA}: admin to pledge`,
      `${PRIYA}: active to admin`,
      `${AVERY}: pledge to active`,
    ]);
    for (const entry of entries) expect(entry.targetType).toBe("user");
    expect(entries.map((entry) => entry.actorEmail)).toEqual([ADMIN_ONE, ADMIN_ONE, ADMIN_ONE, ADMIN_ONE, ADMIN_TWO, ADMIN_ONE, ADMIN_ONE]);
  });

  it("left the accounts it did not touch as the seed made them", async () => {
    for (const email of [MAYA, CASEY, MARCUS]) {
      const uid = await uidOf(email);
      const role = email === MARCUS ? "active" : "pledge";
      expect(await storedClaims(uid), email).toEqual({ role, issued: email });
      expect(await docData(`users/${uid}`), email).toMatchObject({ role });
    }
    expect(await countAll("users")).toBe(SEEDED_ACCOUNTS + 2);
  });
});
