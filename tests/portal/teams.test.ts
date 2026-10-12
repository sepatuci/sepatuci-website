/**
 * Admin management of teams: creating, renaming, re-forming and deleting them,
 * and placing single pledges. Tests run in order from a fresh seed, which has
 * one team, Team Atlas, with Avery and Jordan on it. Who is where after each
 * group of tests is noted at its end.
 */
import { Timestamp } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getAudit } from "@/app/api/portal/admin/audit/route";
import { GET as getResponses } from "@/app/api/portal/admin/forms/[formId]/responses/route";
import { GET as getPledgeDetail, PATCH as updatePledge } from "@/app/api/portal/admin/pledges/[uid]/route";
import { GET as getOverview, POST as createPledge } from "@/app/api/portal/admin/pledges/route";
import { DELETE as deleteTeam, PATCH as updateTeam } from "@/app/api/portal/admin/teams/[teamId]/route";
import { POST as createTeam } from "@/app/api/portal/admin/teams/route";
import { PUT as putDraft } from "@/app/api/portal/forms/[formId]/draft/route";
import { GET as getMe } from "@/app/api/portal/me/route";
import { LIMITS } from "@/lib/portal/constants";
import { resetRateLimits } from "@/lib/portal/server/rate-limit";
import type {
  AdminOverviewDto,
  AuditLogDto,
  CreatePledgeResultDto,
  FormResponsesDto,
  MeDto,
  PledgeDetailDto,
  TeamDto,
} from "@/lib/portal/types";
import {
  ADMIN_ONE,
  ADMIN_TWO,
  AVERY,
  CASEY,
  JORDAN,
  MAYA,
  RILEY,
  SAM,
  SEED_TIMEOUT_MS,
  SLOW_TEST_MS,
  TEAM_ATLAS,
  call,
  countAll,
  docData,
  docExists,
  dumpCollections,
  fieldCodes,
  ok,
  refused,
  seedPortal,
  signIn,
  storedAudit,
  testAuth,
  testDb,
  uidOf,
  type ApiResult,
  type Session,
} from "./helpers";

let admin: Session;
let adminTwo: Session;
let avery: Session;
let jordan: Session;
let maya: Session;
let sam: Session;
let rileyUid: string;
let caseyUid: string;

const create = (body: unknown, session: Session = admin): Promise<ApiResult> =>
  call(createTeam, {}, { method: "POST", token: session.token, body });
const patchTeam = (teamId: string, body: unknown, session: Session = admin): Promise<ApiResult> =>
  call(updateTeam, { teamId }, { method: "PATCH", token: session.token, body });
const removeTeam = (teamId: string, session: Session = admin): Promise<ApiResult> =>
  call(deleteTeam, { teamId }, { method: "DELETE", token: session.token });
const patchPledge = (uid: string, body: unknown): Promise<ApiResult> =>
  call(updatePledge, { uid }, { method: "PATCH", token: admin.token, body });

const overview = async (): Promise<AdminOverviewDto> => ok<AdminOverviewDto>(await call(getOverview, {}, { token: admin.token }));
/** Every team as the admin overview lists it: name and size, in the order given. */
const teamList = async (): Promise<Array<[string, number]>> => (await overview()).teams.map((team) => [team.name, team.memberCount]);
const teamOf = async (uid: string): Promise<unknown> => (await docData(`users/${uid}`))?.teamId;
/** The display names of the pledges whose profile points at this team, in alphabetical order. */
async function membersOf(teamId: string): Promise<string[]> {
  const snapshot = await testDb().collection("users").where("teamId", "==", teamId).get();
  return snapshot.docs.map((doc) => String(doc.get("displayName"))).sort();
}
const latestAudit = async () => (await storedAudit())[0];
const teamAuditCount = async (): Promise<number> => (await storedAudit()).filter((entry) => entry.action.startsWith("team.")).length;
/** What a team operation must never touch. */
const pledgeWork = () => dumpCollections(["submissions", "drafts", "punishments", "forms"]);

// Ids of the teams made along the way.
let boreal: string;
let cedar: string;
let dune: string;

beforeAll(async () => {
  await seedPortal();
  [admin, adminTwo, avery, jordan, maya, sam] = await Promise.all(
    [ADMIN_ONE, ADMIN_TWO, AVERY, JORDAN, MAYA, SAM].map((email) => signIn(email)),
  );
  [rileyUid, caseyUid] = await Promise.all([uidOf(RILEY), uidOf(CASEY)]);

  // Work in progress for each pledge, so that there is a draft of theirs for a team change to leave alone.
  for (const [session, formId, questionId] of [
    [avery, "week2synthesis", "q_insight1"],
    [maya, "week2synthesis", "q_insight1"],
    [jordan, "week2interviews", "q_surprise"],
    [sam, "week2interviews", "q_surprise"],
  ] as const) {
    const answers = { [questionId]: { kind: "text", value: `Half-written by ${session.email}` } };
    ok(await call(putDraft, { formId }, { method: "PUT", token: session.token, body: { answers } }));
  }
}, SEED_TIMEOUT_MS);

beforeEach(() => {
  resetRateLimits();
});

describe("the team in the seed", () => {
  it("leaves the checks below something of every kind to protect", async () => {
    const work = await pledgeWork();
    const paths = Object.keys(work);
    expect(paths.filter((path) => path.startsWith("drafts/"))).toHaveLength(4);
    expect(paths.filter((path) => path.startsWith("submissions/"))).toHaveLength(9);
    expect(paths.filter((path) => path.startsWith("punishments/"))).toHaveLength(2);
  });

  it("has two members, and every other pledge is on their own", async () => {
    expect(await teamList()).toEqual([["Team Atlas", 2]]);
    expect(await membersOf(TEAM_ATLAS)).toEqual(["Avery Chen", "Jordan Patel"]);
    for (const uid of [maya.uid, sam.uid, rileyUid, caseyUid]) expect(await teamOf(uid)).toBeNull();
    // Admins are never on a team.
    expect(await teamOf(admin.uid)).toBeNull();
  });
});

describe("creating a team", () => {
  describe("the name", () => {
    it.each<[string, unknown]>([
      ["no name", {}],
      ["an empty name", { name: "" }],
      ["a name that is only spaces", { name: "   " }],
      ["a name that is only control characters", { name: "\u0000\u0007" }],
      ["a name that is a number", { name: 42 }],
      ["a null name", { name: null }],
      ["a name that is a list", { name: ["Team Boreal"] }],
      ["a name that is an object", { name: { text: "Team Boreal" } }],
      ["a body that is not an object", ["Team Boreal"]],
    ])("refuses %s", async (_label, body) => {
      const refusal = refused(await create(body), 422, "invalid");
      expect(fieldCodes(refusal)).toEqual(["name:required"]);
      expect(refusal.fields?.[0].message).toBe("Give the team a name.");
    });

    it("refuses a name one character over the limit, and accepts one of exactly the limit", async () => {
      expect(LIMITS.teamName).toBe(60);
      const refusal = refused(await create({ name: "x".repeat(LIMITS.teamName + 1) }), 422, "invalid");
      expect(fieldCodes(refusal)).toEqual(["name:too_long"]);
      expect(refusal.fields?.[0].message).toBe("Keep the name to 60 characters or fewer.");

      const longest = "y".repeat(LIMITS.teamName);
      const { team } = ok<{ team: TeamDto }>(await create({ name: longest }));
      expect(team.name).toBe(longest);
      ok(await removeTeam(team.id));
    });

    it.each(["Team Atlas", "team atlas", "TEAM ATLAS", "  Team Atlas  ", "tEAM aTLAS"])(
      "refuses %j, which another team already has, whatever its case",
      async (name) => {
        const refusal = refused(await create({ name }), 422, "invalid");
        expect(fieldCodes(refusal)).toEqual(["name:duplicate"]);
        expect(refusal.fields?.[0].message).toBe("Another team already has that name.");
      },
    );
  });

  describe("the members", () => {
    const refusedMembers = async (memberUids: unknown): Promise<string | undefined> => {
      const refusal = refused(await create({ name: "Team Boreal", memberUids }), 422, "invalid");
      expect(fieldCodes(refusal)).toEqual(["memberUids:invalid"]);
      return refusal.fields?.[0].message;
    };

    it.each<[string, unknown]>([
      ["a string", "abc123"],
      ["an object", { 0: "abc123" }],
      ["a number", 5],
      ["null", null],
      ["true", true],
    ])("refuses a member list that is %s", async (_label, memberUids) => {
      expect(await refusedMembers(memberUids)).toBe("Choose pledges from the list.");
    });

    it.each<[string, unknown[]]>([
      ["a number", [42]],
      ["an empty id", [""]],
      ["a path", ["../users/abc"]],
      ["an id with an underscore", ["week0onboarding_abc"]],
      ["a nested list", [["abc123"]]],
      ["null", [null]],
      ["an id of 65 characters", ["a".repeat(65)]],
    ])("refuses a member list that contains %s", async (_label, memberUids) => {
      expect(await refusedMembers(memberUids)).toBe("Choose pledges from the list.");
    });

    it("refuses a malformed id even next to real pledges, and moves none of them", async () => {
      expect(await refusedMembers([maya.uid, sam.uid, "not/an/id"])).toBe("Choose pledges from the list.");
      expect(await teamOf(maya.uid)).toBeNull();
      expect(await teamOf(sam.uid)).toBeNull();
    });

    it("refuses a uid that is not a pledge anyone has", async () => {
      expect(await refusedMembers(["nobody123"])).toBe("Only pledge accounts that still exist can be on a team.");
      expect(await refusedMembers([maya.uid, "nobody123"])).toBe("Only pledge accounts that still exist can be on a team.");
      expect(await teamOf(maya.uid)).toBeNull();
    });

    it("refuses an admin's uid: admins cannot be put on a team", async () => {
      expect(await refusedMembers([admin.uid])).toBe("Only pledge accounts that still exist can be on a team.");
      expect(await refusedMembers([adminTwo.uid])).toBe("Only pledge accounts that still exist can be on a team.");
      expect(await refusedMembers([maya.uid, admin.uid, sam.uid])).toBe("Only pledge accounts that still exist can be on a team.");
      expect(await teamOf(admin.uid)).toBeNull();
      expect(await teamOf(adminTwo.uid)).toBeNull();
      expect(await teamOf(maya.uid)).toBeNull();
      expect(await teamOf(sam.uid)).toBeNull();
    });

    it("refuses a sign-in account that has no pledge profile", async () => {
      const record = await testAuth().createUser({ email: "no.profile.team@uci.edu", emailVerified: true });
      await testAuth().setCustomUserClaims(record.uid, { role: "pledge" });
      expect(await refusedMembers([record.uid])).toBe("Only pledge accounts that still exist can be on a team.");
      expect(await docExists(`users/${record.uid}`)).toBe(false);
      await testAuth().deleteUser(record.uid);
    });

    it("refuses more members than there could be pledges", async () => {
      const ids = Array.from({ length: 401 }, (_, index) => `fake${index}`);
      expect(await refusedMembers(ids)).toBe("Choose pledges from the list.");
    });

    it("reports a bad name and a bad member list together", async () => {
      const refusal = refused(await create({ name: " ", memberUids: "everyone" }), 422, "invalid");
      expect(fieldCodes(refusal)).toEqual(["memberUids:invalid", "name:required"]);
    });
  });

  it("created nothing, moved nobody and logged nothing for any of the refused requests above", async () => {
    expect(await countAll("teams")).toBe(1);
    expect(await teamList()).toEqual([["Team Atlas", 2]]);
    expect(await membersOf(TEAM_ATLAS)).toEqual(["Avery Chen", "Jordan Patel"]);
    // One create and one delete, for the name of exactly the limit.
    expect((await storedAudit()).filter((entry) => entry.action.startsWith("team.")).map((entry) => entry.action)).toEqual([
      "team.delete",
      "team.create",
    ]);
  });

  it("creates an empty team, trimming its name and ignoring every field it should not accept", async () => {
    const result = ok<{ team: TeamDto }>(
      await create({
        name: "  Team Boreal ",
        id: "attackerchosenid",
        memberCount: 99,
        createdBy: "someone-else",
        createdAt: "2000-01-01T00:00:00.000Z",
        role: "admin",
      }),
    );
    boreal = result.team.id;
    expect(Object.keys(result)).toEqual(["team"]);
    expect(result.team).toMatchObject({ name: "Team Boreal", memberCount: 0 });
    expect(Object.keys(result.team).sort()).toEqual(["createdAt", "id", "memberCount", "name"]);
    expect(boreal).not.toBe("attackerchosenid");
    expect(boreal).toMatch(/^[A-Za-z0-9]{1,64}$/);
    expect(Math.abs(Date.parse(result.team.createdAt) - Date.now())).toBeLessThan(60_000);
  });

  it("stores only the fields a team has, attributed to the admin who made it", async () => {
    const stored = await docData(`teams/${boreal}`);
    expect(Object.keys(stored ?? {}).sort()).toEqual(["createdAt", "createdBy", "name", "updatedAt"]);
    expect(stored).toMatchObject({ name: "Team Boreal", createdBy: admin.uid });
    expect(stored?.updatedAt).toEqual(stored?.createdAt);
  });

  it("records the creation in the audit log against the team", async () => {
    expect(await latestAudit()).toMatchObject({
      action: "team.create",
      targetType: "team",
      targetId: boreal,
      actorUid: admin.uid,
      actorEmail: ADMIN_ONE,
      summary: 'Created team "Team Boreal" with 0 members',
    });
  });

  it("creates a team with members, and puts each of them on it", async () => {
    const work = await pledgeWork();
    const { team } = ok<{ team: TeamDto }>(await create({ name: "Team Cedar", memberUids: [maya.uid, sam.uid] }));
    cedar = team.id;
    expect(team).toMatchObject({ name: "Team Cedar", memberCount: 2 });
    expect(await membersOf(cedar)).toEqual(["Maya Rodriguez", "Sam Okafor"]);
    expect(await latestAudit()).toMatchObject({ action: "team.create", targetType: "team", targetId: cedar, summary: 'Created team "Team Cedar" with 2 members' });
    // Their deliverables, drafts and punishments are exactly as they were.
    expect(await pledgeWork()).toEqual(work);
  });

  it("changes nothing on a member's profile but their team", async () => {
    const profile = await docData(`users/${maya.uid}`);
    expect(profile).toMatchObject({ teamId: cedar, email: MAYA, role: "pledge", status: "active", pledgeClass: "Lambda" });
    expect(Object.keys(profile?.submitted as object).sort()).toEqual(["week0onboarding", "week2interviews"]);
    expect(profile?.activity).toMatchObject({ sessionCount: 5, totalActiveSeconds: 141 * 60 });
    expect(profile?.onboardedAt).not.toBeNull();
    expect((await testAuth().getUser(maya.uid)).customClaims).toEqual({ role: "pledge", issued: MAYA });
  });

  it("moves a member who was on another team, counts a uid listed twice once, and says one member in the singular", async () => {
    const { team } = ok<{ team: TeamDto }>(await create({ name: "Team Dune", memberUids: [jordan.uid, jordan.uid] }));
    dune = team.id;
    expect(team.memberCount).toBe(1);
    expect(await membersOf(dune)).toEqual(["Jordan Patel"]);
    // Jordan left Team Atlas: a pledge is on one team at most.
    expect(await membersOf(TEAM_ATLAS)).toEqual(["Avery Chen"]);
    expect((await latestAudit()).summary).toBe('Created team "Team Dune" with 1 member');
  });

  it("lists the teams in alphabetical order with their sizes, on every admin page that offers them", async () => {
    const expected = [
      ["Team Atlas", 1],
      ["Team Boreal", 0],
      ["Team Cedar", 2],
      ["Team Dune", 1],
    ];
    expect(await teamList()).toEqual(expected);
    const detail = ok<PledgeDetailDto>(await call(getPledgeDetail, { uid: sam.uid }, { token: admin.token }));
    expect(detail.teams.map((team) => [team.name, team.memberCount])).toEqual(expected);
    expect(detail.pledge.teamId).toBe(cedar);
    const responses = ok<FormResponsesDto>(await call(getResponses, { formId: "week0onboarding" }, { token: admin.token }));
    expect(responses.teams.map((team) => [team.name, team.memberCount])).toEqual(expected);
    expect(Object.fromEntries(responses.responses.map((response) => [response.displayName, response.teamId]))).toEqual({
      "Avery Chen": TEAM_ATLAS,
      "Jordan Patel": dune,
      "Maya Rodriguez": cedar,
      "Riley Nguyen": null,
      "Sam Okafor": cedar,
    });
    expect(responses.nonResponders.map((pledge) => [pledge.displayName, pledge.teamId])).toEqual([["Casey Kim", null]]);
  });

  it("lets a second admin create one, under their own name in the log", async () => {
    const { team } = ok<{ team: TeamDto }>(await create({ name: "Team Elm" }, adminTwo));
    expect(await latestAudit()).toMatchObject({ action: "team.create", targetId: team.id, actorUid: adminTwo.uid, actorEmail: ADMIN_TWO });
    expect(await docData(`teams/${team.id}`)).toMatchObject({ createdBy: adminTwo.uid });
    ok(await removeTeam(team.id, adminTwo));
  });

  it(
    "creates one team, not two, when the same name arrives twice at once",
    async () => {
      const attempts = await Promise.all([create({ name: "Team Fir" }), create({ name: "team fir" }, adminTwo)]);
      expect(attempts.map((attempt) => attempt.status).sort()).toEqual([200, 422]);
      const loser = attempts.find((attempt) => attempt.status === 422);
      expect(loser && fieldCodes(refused(loser, 422, "invalid"))).toEqual(["name:duplicate"]);
      const made = (await overview()).teams.filter((team) => team.name.toLowerCase() === "team fir");
      expect(made).toHaveLength(1);
      ok(await removeTeam(made[0].id));
    },
    SLOW_TEST_MS,
  );

  describe("the most teams there can be", () => {
    const fixtures = () => testDb().collection("teams").where("createdBy", "==", "limit-fixture");

    it("allows the 60th team and refuses the 61st", async () => {
      expect(LIMITS.maxTeams).toBe(60);
      // Four teams exist. Fifty-five more, written directly, make 59.
      const existing = await countAll("teams");
      expect(existing).toBe(4);
      const stamp = Timestamp.now();
      const batch = testDb().batch();
      for (let index = 0; index < LIMITS.maxTeams - 1 - existing; index += 1) {
        batch.create(testDb().collection("teams").doc(), { name: `Filler ${index}`, createdAt: stamp, createdBy: "limit-fixture", updatedAt: stamp });
      }
      await batch.commit();
      expect(await countAll("teams")).toBe(59);

      const sixtieth = ok<{ team: TeamDto }>(await create({ name: "The Sixtieth" }));
      expect(await countAll("teams")).toBe(60);

      const auditBefore = await teamAuditCount();
      const refusal = refused(await create({ name: "One Too Many", memberUids: [caseyUid] }), 409, "too_many_teams");
      expect(refusal.error).toBe("There can be at most 60 teams.");
      expect(await countAll("teams")).toBe(60);
      expect(await teamOf(caseyUid)).toBeNull();
      expect(await teamAuditCount()).toBe(auditBefore);

      // Room for one again as soon as one is deleted.
      ok(await removeTeam(sixtieth.team.id));
      const again = ok<{ team: TeamDto }>(await create({ name: "One Too Many" }));
      ok(await removeTeam(again.team.id));
    });

    it("leaves renaming, re-forming and deleting open while the list is full", async () => {
      const stamp = Timestamp.now();
      await testDb().collection("teams").doc().create({ name: "Filler last", createdAt: stamp, createdBy: "limit-fixture", updatedAt: stamp });
      expect(await countAll("teams")).toBe(60);
      ok(await patchTeam(boreal, { name: "Team Boreal Renamed" }));
      ok(await patchTeam(boreal, { name: "Team Boreal" }));
    });

    it("clears the fixtures away", async () => {
      const snapshot = await fixtures().get();
      const batch = testDb().batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      expect(await teamList()).toEqual([
        ["Team Atlas", 1],
        ["Team Boreal", 0],
        ["Team Cedar", 2],
        ["Team Dune", 1],
      ]);
    });
  });
  // Atlas: Avery. Boreal: nobody. Cedar: Maya, Sam. Dune: Jordan. Riley and Casey on their own.
});

describe("renaming a team", () => {
  it("changes the name everywhere, and says what it was called before in the log", async () => {
    const before = await docData(`teams/${boreal}`);
    expect(ok(await patchTeam(boreal, { name: "  Team Birch " }))).toEqual({ ok: true });

    const after = await docData(`teams/${boreal}`);
    expect(after).toMatchObject({ name: "Team Birch", createdBy: admin.uid });
    expect(after?.createdAt).toEqual(before?.createdAt);
    expect((after?.updatedAt as Timestamp).toMillis()).toBeGreaterThan((before?.updatedAt as Timestamp).toMillis());
    expect((await teamList()).map(([name]) => name)).toEqual(["Team Atlas", "Team Birch", "Team Cedar", "Team Dune"]);
    expect(await latestAudit()).toMatchObject({
      action: "team.update",
      targetType: "team",
      targetId: boreal,
      actorEmail: ADMIN_ONE,
      summary: 'Team "Team Boreal": renamed to "Team Birch"',
    });
  });

  it("tells the team's members the new name", async () => {
    ok(await patchTeam(cedar, { name: "Team Cypress" }));
    expect(ok<MeDto>(await call(getMe, {}, { token: maya.token })).team).toEqual({ name: "Team Cypress", teammates: ["Sam Okafor"] });
    ok(await patchTeam(cedar, { name: "Team Cedar" }));
    expect(ok<MeDto>(await call(getMe, {}, { token: sam.token })).team).toEqual({ name: "Team Cedar", teammates: ["Maya Rodriguez"] });
  });

  it.each(["Team Cedar", "team cedar", "TEAM DUNE", " Team Atlas "])("refuses %j, which another team has", async (name) => {
    const refusal = refused(await patchTeam(boreal, { name }), 422, "invalid");
    expect(fieldCodes(refusal)).toEqual(["name:duplicate"]);
    expect(await docData(`teams/${boreal}`)).toMatchObject({ name: "Team Birch" });
  });

  it("allows a team's own name in a different case", async () => {
    ok(await patchTeam(boreal, { name: "TEAM birch" }));
    expect(await docData(`teams/${boreal}`)).toMatchObject({ name: "TEAM birch" });
    expect((await latestAudit()).summary).toBe('Team "Team Birch": renamed to "TEAM birch"');
    ok(await patchTeam(boreal, { name: "Team Birch" }));
  });

  it.each<[string, unknown, string]>([
    ["an empty name", { name: "" }, "name:required"],
    ["a blank name", { name: "   " }, "name:required"],
    ["a name that is not text", { name: 7 }, "name:required"],
    ["a null name", { name: null }, "name:required"],
    ["a name over the limit", { name: "x".repeat(LIMITS.teamName + 1) }, "name:too_long"],
  ])("refuses %s and leaves the team as it was", async (_label, body, code) => {
    const before = await docData(`teams/${boreal}`);
    expect(fieldCodes(refused(await patchTeam(boreal, body), 422, "invalid"))).toEqual([code]);
    expect(await docData(`teams/${boreal}`)).toEqual(before);
  });

  it("accepts a new name of exactly the limit", async () => {
    ok(await patchTeam(boreal, { name: "z".repeat(LIMITS.teamName) }));
    ok(await patchTeam(boreal, { name: "Team Birch" }));
  });

  it("does not need a name: a request without one leaves it alone", async () => {
    ok(await patchTeam(boreal, {}));
    ok(await patchTeam(boreal, { memberUids: [] }));
    expect(await docData(`teams/${boreal}`)).toMatchObject({ name: "Team Birch" });
  });

  it("writes nothing, and no audit entry, when the name is the one it already has", async () => {
    const before = await docData(`teams/${boreal}`);
    const auditBefore = await countAll("auditLog");
    ok(await patchTeam(boreal, { name: "Team Birch" }));
    ok(await patchTeam(boreal, { name: "  Team Birch  " }));
    ok(await patchTeam(boreal, {}));
    ok(await patchTeam(boreal, { id: "other", createdBy: "someone-else", memberCount: 12 }));
    expect(await docData(`teams/${boreal}`)).toEqual(before);
    expect(await countAll("auditLog")).toBe(auditBefore);
  });
});

describe("choosing a team's members", () => {
  it("adds the pledges on the list who were not members, moving them off any other team", async () => {
    const work = await pledgeWork();
    ok(await patchTeam(TEAM_ATLAS, { memberUids: [avery.uid, maya.uid, caseyUid] }));
    expect(await membersOf(TEAM_ATLAS)).toEqual(["Avery Chen", "Casey Kim", "Maya Rodriguez"]);
    // Maya came from Team Cedar, which keeps Sam.
    expect(await membersOf(cedar)).toEqual(["Sam Okafor"]);
    expect(await latestAudit()).toMatchObject({
      action: "team.update",
      targetType: "team",
      targetId: TEAM_ATLAS,
      summary: 'Team "Team Atlas": added 2',
    });
    expect(await pledgeWork()).toEqual(work);
  });

  it("makes the team exactly the list: members left off it go back to working on their own", async () => {
    ok(await patchTeam(TEAM_ATLAS, { memberUids: [maya.uid] }));
    expect(await membersOf(TEAM_ATLAS)).toEqual(["Maya Rodriguez"]);
    expect(await teamOf(avery.uid)).toBeNull();
    expect(await teamOf(caseyUid)).toBeNull();
    expect((await latestAudit()).summary).toBe('Team "Team Atlas": removed 2');
    // They are on no team at all now, not on some other one.
    expect(ok<MeDto>(await call(getMe, {}, { token: avery.token })).team).toBeNull();
  });

  it("adds and removes in one request, and counts both in the log", async () => {
    ok(await patchTeam(TEAM_ATLAS, { memberUids: [avery.uid, jordan.uid] }));
    expect(await membersOf(TEAM_ATLAS)).toEqual(["Avery Chen", "Jordan Patel"]);
    expect(await teamOf(maya.uid)).toBeNull();
    // Jordan came from Team Dune, which is now empty and still there.
    expect(await membersOf(dune)).toEqual([]);
    expect(await docExists(`teams/${dune}`)).toBe(true);
    expect((await latestAudit()).summary).toBe('Team "Team Atlas": added 2, removed 1');
  });

  it("renames and re-forms in one request", async () => {
    ok(await patchTeam(dune, { name: "Team Delta", memberUids: [maya.uid, rileyUid] }));
    expect(await docData(`teams/${dune}`)).toMatchObject({ name: "Team Delta" });
    expect(await membersOf(dune)).toEqual(["Maya Rodriguez", "Riley Nguyen"]);
    expect((await latestAudit()).summary).toBe('Team "Team Dune": renamed to "Team Delta", added 2');
  });

  it("empties a team with an empty list, and keeps the team", async () => {
    ok(await patchTeam(dune, { memberUids: [] }));
    expect(await membersOf(dune)).toEqual([]);
    expect(await teamOf(maya.uid)).toBeNull();
    expect(await teamOf(rileyUid)).toBeNull();
    expect((await teamList()).find(([name]) => name === "Team Delta")).toEqual(["Team Delta", 0]);
    expect((await latestAudit()).summary).toBe('Team "Team Delta": removed 2');
  });

  it("writes nothing, and no audit entry, when the list is who is already on it", async () => {
    const before = await dumpCollections(["users", "teams"]);
    const auditBefore = await countAll("auditLog");
    ok(await patchTeam(TEAM_ATLAS, { memberUids: [jordan.uid, avery.uid] }));
    ok(await patchTeam(TEAM_ATLAS, { memberUids: [avery.uid, jordan.uid, avery.uid] }));
    ok(await patchTeam(TEAM_ATLAS, { name: "Team Atlas", memberUids: [avery.uid, jordan.uid] }));
    ok(await patchTeam(dune, { memberUids: [] }));
    expect(await dumpCollections(["users", "teams"])).toEqual(before);
    expect(await countAll("auditLog")).toBe(auditBefore);
  });

  it.each<[string, (uids: { admin: string; avery: string }) => unknown]>([
    ["a list that is not a list", () => "everyone"],
    ["a null list", () => null],
    ["a malformed id", ({ avery: uid }) => [uid, "../users/x"]],
    ["a uid that is not a pledge", ({ avery: uid }) => [uid, "nobody123"]],
    ["an admin's uid", ({ avery: uid, admin: adminUid }) => [uid, adminUid]],
    ["only an admin's uid", ({ admin: adminUid }) => [adminUid]],
  ])("refuses %s and changes nobody's team", async (_label, memberUids) => {
    const before = await dumpCollections(["users", "teams"]);
    const auditBefore = await countAll("auditLog");
    const refusal = refused(await patchTeam(TEAM_ATLAS, { memberUids: memberUids({ admin: admin.uid, avery: avery.uid }) }), 422, "invalid");
    expect(fieldCodes(refusal)).toEqual(["memberUids:invalid"]);
    expect(await dumpCollections(["users", "teams"])).toEqual(before);
    expect(await countAll("auditLog")).toBe(auditBefore);
  });

  it("does not rename the team when the member list in the same request is refused", async () => {
    refused(await patchTeam(TEAM_ATLAS, { name: "Team Renamed Anyway", memberUids: [admin.uid] }), 422, "invalid");
    expect(await docData(`teams/${TEAM_ATLAS}`)).toMatchObject({ name: "Team Atlas" });
    expect(await membersOf(TEAM_ATLAS)).toEqual(["Avery Chen", "Jordan Patel"]);
  });

  it("is not found for a team that does not exist, and creates none", async () => {
    const teams = await countAll("teams");
    const refusal = refused(await patchTeam("nosuchteam", { name: "Ghost", memberUids: [sam.uid] }), 404, "not_found");
    expect(refusal.error).toBe("That team doesn't exist.");
    refused(await patchTeam("nosuchteam", {}), 404, "not_found");
    expect(await countAll("teams")).toBe(teams);
    expect(await docExists("teams/nosuchteam")).toBe(false);
    expect(await teamOf(sam.uid)).toBe(cedar);
  });

  it.each(["../users", "team_atlas", "team-atlas", "", "a".repeat(65)])("treats the unsafe team id %j as not found", async (teamId) => {
    refused(await patchTeam(teamId, { name: "Ghost" }), 404, "not_found");
    refused(await removeTeam(teamId), 404, "not_found");
    expect(await docData(`teams/${TEAM_ATLAS}`)).toMatchObject({ name: "Team Atlas" });
  });
  // Atlas: Avery, Jordan. Birch: nobody. Cedar: Sam. Delta: nobody. Maya, Riley and Casey on their own.
});

// What the Teams page sends. It lists only the pledges the admin ticked or unticked,
// so a page that is out of date cannot undo a move someone else made in the meantime.
describe("changing a team's members without sending the whole list", () => {
  // Atlas: Avery, Jordan. Cedar: Sam. Maya, Riley and Casey on their own.
  it("adds the pledges named and leaves everyone else where they are", async () => {
    const work = await pledgeWork();
    ok(await patchTeam(TEAM_ATLAS, { addUids: [maya.uid] }));
    expect(await membersOf(TEAM_ATLAS)).toEqual(["Avery Chen", "Jordan Patel", "Maya Rodriguez"]);
    expect(await membersOf(cedar)).toEqual(["Sam Okafor"]);
    expect(await latestAudit()).toMatchObject({ action: "team.update", targetId: TEAM_ATLAS, summary: 'Team "Team Atlas": added 1' });
    expect(await pledgeWork()).toEqual(work);
  });

  it("moves a pledge who is on another team", async () => {
    ok(await patchTeam(TEAM_ATLAS, { addUids: [sam.uid] }));
    expect(await teamOf(sam.uid)).toBe(TEAM_ATLAS);
    expect(await membersOf(cedar)).toEqual([]);
  });

  it("keeps a member another admin added while this admin's page was out of date", async () => {
    // Admin two adds Casey. Admin one, whose page still shows the earlier members, renames the team.
    ok(await patchTeam(TEAM_ATLAS, { addUids: [caseyUid] }, adminTwo));
    ok(await patchTeam(TEAM_ATLAS, { name: "Team Atlas Prime", addUids: [], removeUids: [] }));
    expect(await membersOf(TEAM_ATLAS)).toEqual(["Avery Chen", "Casey Kim", "Jordan Patel", "Maya Rodriguez", "Sam Okafor"]);
    expect((await latestAudit()).summary).toBe('Team "Team Atlas": renamed to "Team Atlas Prime"');
    ok(await patchTeam(TEAM_ATLAS, { name: "Team Atlas" }));
  });

  it("removes only the pledges named, and ignores one who is not on this team or no longer exists", async () => {
    ok(await patchTeam(cedar, { addUids: [sam.uid] }));
    // Sam is on Cedar now, Riley was never on Atlas, and "nobody123" is not an account.
    ok(await patchTeam(TEAM_ATLAS, { removeUids: [maya.uid, caseyUid, sam.uid, rileyUid, "nobody123"] }));
    expect(await membersOf(TEAM_ATLAS)).toEqual(["Avery Chen", "Jordan Patel"]);
    expect(await teamOf(sam.uid)).toBe(cedar);
    expect(await teamOf(maya.uid)).toBeNull();
    expect(await teamOf(caseyUid)).toBeNull();
    expect((await latestAudit()).summary).toBe('Team "Team Atlas": removed 2');
  });

  it("writes nothing, and no audit entry, when the changes are already true", async () => {
    const before = await dumpCollections(["users", "teams"]);
    const auditBefore = await countAll("auditLog");
    ok(await patchTeam(TEAM_ATLAS, { addUids: [avery.uid, jordan.uid], removeUids: [maya.uid] }));
    ok(await patchTeam(TEAM_ATLAS, { addUids: [], removeUids: [] }));
    expect(await dumpCollections(["users", "teams"])).toEqual(before);
    expect(await countAll("auditLog")).toBe(auditBefore);
  });

  it.each<[string, (uids: { admin: string; avery: string; maya: string }) => unknown, string[]]>([
    ["an admin's uid to add", ({ admin: uid }) => ({ addUids: [uid] }), ["addUids:invalid"]],
    ["a uid to add that is not an account", () => ({ addUids: ["nobody123"] }), ["addUids:invalid"]],
    ["an add list that is not a list", () => ({ addUids: "everyone" }), ["addUids:invalid"]],
    ["a malformed id to remove", () => ({ removeUids: ["../users/x"] }), ["removeUids:invalid"]],
    ["the same pledge added and removed", ({ maya: uid }) => ({ addUids: [uid], removeUids: [uid] }), ["addUids:conflict"]],
    [
      "the whole list together with changes to it",
      ({ avery: uid, maya: other }) => ({ memberUids: [uid], addUids: [other] }),
      ["memberUids:conflict"],
    ],
  ])("refuses %s and changes nobody's team", async (_label, body, codes) => {
    const before = await dumpCollections(["users", "teams"]);
    const auditBefore = await countAll("auditLog");
    const refusal = refused(
      await patchTeam(TEAM_ATLAS, body({ admin: admin.uid, avery: avery.uid, maya: maya.uid })),
      422,
      "invalid",
    );
    expect(fieldCodes(refusal)).toEqual(codes);
    expect(await dumpCollections(["users", "teams"])).toEqual(before);
    expect(await countAll("auditLog")).toBe(auditBefore);
  });
  // Atlas: Avery, Jordan. Cedar: Sam. Maya, Riley and Casey on their own, as before.
});

describe("placing one pledge", () => {
  it("moves a pledge onto a team, and logs it against the pledge", async () => {
    expect(ok(await patchPledge(maya.uid, { teamId: cedar }))).toEqual({ ok: true });
    expect(await teamOf(maya.uid)).toBe(cedar);
    expect(await latestAudit()).toMatchObject({
      action: "pledge.update",
      targetType: "user",
      targetId: maya.uid,
      summary: `${MAYA}: moved to team "Team Cedar"`,
    });
    expect((await teamList()).find(([name]) => name === "Team Cedar")).toEqual(["Team Cedar", 2]);
  });

  it("moves a pledge from one team straight to another", async () => {
    ok(await patchPledge(maya.uid, { teamId: boreal }));
    expect(await teamOf(maya.uid)).toBe(boreal);
    expect(await membersOf(cedar)).toEqual(["Sam Okafor"]);
    expect((await latestAudit()).summary).toBe(`${MAYA}: moved to team "Team Birch"`);
  });

  it("writes nothing, and no audit entry, when the pledge is already on that team", async () => {
    const before = await docData(`users/${maya.uid}`);
    const auditBefore = await countAll("auditLog");
    ok(await patchPledge(maya.uid, { teamId: boreal }));
    expect(await docData(`users/${maya.uid}`)).toEqual(before);
    expect(await countAll("auditLog")).toBe(auditBefore);
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["an empty string", ""],
  ])("takes a pledge off their team when the team is %s", async (_label, teamId) => {
    ok(await patchPledge(maya.uid, { teamId: boreal }));
    ok(await patchPledge(maya.uid, { teamId }));
    expect(await teamOf(maya.uid)).toBeNull();
    expect(await latestAudit()).toMatchObject({ action: "pledge.update", targetId: maya.uid, summary: `${MAYA}: removed from their team` });

    // Asking again for someone already on their own is nothing to do.
    const auditBefore = await countAll("auditLog");
    ok(await patchPledge(maya.uid, { teamId }));
    expect(await countAll("auditLog")).toBe(auditBefore);
  });

  it.each<[string, unknown, string]>([
    ["a team that does not exist", "nosuchteam", "That team no longer exists."],
    ["an unsafe id", "../teams/x", "Choose a team from the list."],
    ["a team's name instead of its id", "Team Cedar", "Choose a team from the list."],
    ["a number", 42, "Choose a team from the list."],
    ["a list", ["abc"], "Choose a team from the list."],
    ["an object", { id: "abc" }, "Choose a team from the list."],
    ["false", false, "Choose a team from the list."],
  ])("refuses %s as the team, and leaves the pledge where they were", async (_label, teamId, message) => {
    const before = await docData(`users/${sam.uid}`);
    const refusal = refused(await patchPledge(sam.uid, { teamId }), 422, "invalid");
    expect(fieldCodes(refusal)).toEqual(["teamId:invalid"]);
    expect(refusal.fields?.[0].message).toBe(message);
    expect(await docData(`users/${sam.uid}`)).toEqual(before);
    expect(await teamOf(sam.uid)).toBe(cedar);
  });

  it("changes nothing else when the team is refused alongside a valid change", async () => {
    const before = await docData(`users/${sam.uid}`);
    const refusal = refused(await patchPledge(sam.uid, { displayName: "Renamed Anyway", teamId: "nosuchteam" }), 422, "invalid");
    expect(fieldCodes(refusal)).toEqual(["teamId:invalid"]);
    expect(await docData(`users/${sam.uid}`)).toEqual(before);
    expect((await testAuth().getUser(sam.uid)).displayName).toBe("Sam Okafor");
  });

  it("changes the team together with other fields, and names each change in the log", async () => {
    ok(await patchPledge(caseyUid, { pledgeClass: "Mu", teamId: cedar }));
    expect(await docData(`users/${caseyUid}`)).toMatchObject({ pledgeClass: "Mu", teamId: cedar });
    expect((await latestAudit()).summary).toBe(`${CASEY}: class, moved to team "Team Cedar"`);
    ok(await patchPledge(caseyUid, { pledgeClass: "Lambda", teamId: null }));
  });

  it("can place a disabled pledge, who is then counted but not shown to teammates", async () => {
    ok(await patchPledge(rileyUid, { teamId: TEAM_ATLAS }));
    expect((await teamList()).find(([name]) => name === "Team Atlas")).toEqual(["Team Atlas", 3]);
    expect(ok<MeDto>(await call(getMe, {}, { token: avery.token })).team).toEqual({ name: "Team Atlas", teammates: ["Jordan Patel"] });
    ok(await patchPledge(rileyUid, { teamId: null }));
  });

  it("cannot put an admin on a team", async () => {
    refused(await patchPledge(adminTwo.uid, { teamId: cedar }), 403, "cannot_modify_admin");
    refused(await patchPledge(admin.uid, { teamId: cedar }), 403, "cannot_modify_admin");
    expect(await teamOf(adminTwo.uid)).toBeNull();
    expect(await teamOf(admin.uid)).toBeNull();
  });

  it("is not found for a pledge that does not exist", async () => {
    refused(await patchPledge("nobody123", { teamId: cedar }), 404, "not_found");
  });
  // Atlas: Avery, Jordan. Birch: nobody. Cedar: Sam. Delta: nobody. Maya, Riley and Casey on their own.
});

describe("creating a pledge straight onto a team", () => {
  const createOn = (email: string, teamId: unknown) =>
    call(createPledge, {}, { method: "POST", token: admin.token, body: { email, displayName: "New Teammate", teamId } });

  it("puts the new pledge on the team chosen for them", async () => {
    const created = ok<CreatePledgeResultDto>(await createOn("new.teammate@uci.edu", cedar));
    expect(created.pledge).toMatchObject({ email: "new.teammate@uci.edu", teamId: cedar, onboardedAt: null });
    expect(await teamOf(created.pledge.uid)).toBe(cedar);
    expect(await membersOf(cedar)).toEqual(["New Teammate", "Sam Okafor"]);
    expect((await teamList()).find(([name]) => name === "Team Cedar")).toEqual(["Team Cedar", 2]);
    // Their teammate sees them by name straight away.
    expect(ok<MeDto>(await call(getMe, {}, { token: sam.token })).team).toEqual({ name: "Team Cedar", teammates: ["New Teammate"] });
  });

  it.each<[string, unknown]>([
    ["no team", undefined],
    ["a null team", null],
    ["an empty team", ""],
  ])("starts the new pledge on their own when given %s", async (label, teamId) => {
    const email = `solo.${label.replace(/[^a-z]/g, "")}@uci.edu`;
    const created = ok<CreatePledgeResultDto>(await createOn(email, teamId));
    expect(created.pledge.teamId).toBeNull();
    expect(await teamOf(created.pledge.uid)).toBeNull();
  });

  it.each<[string, unknown]>([
    ["a team that does not exist", "nosuchteam"],
    ["an unsafe id", "../teams/x"],
    ["a team's name instead of its id", "Team Cedar"],
    ["a number", 42],
    ["a list", ["abc"]],
    ["true", true],
  ])("refuses %s as the team, and creates no account", async (label, teamId) => {
    const email = `refused.${label.replace(/[^a-z]/g, "")}@uci.edu`;
    const users = await countAll("users");
    const refusal = refused(await createOn(email, teamId), 422, "invalid");
    expect(fieldCodes(refusal)).toEqual(["teamId:invalid"]);
    expect(refusal.fields?.[0].message).toBe("Choose a team from the list.");
    expect(await countAll("users")).toBe(users);
    await expect(testAuth().getUserByEmail(email)).rejects.toMatchObject({ code: "auth/user-not-found" });
  });

  it("reports a bad team together with a bad email and a missing name", async () => {
    const refusal = refused(
      await call(createPledge, {}, { method: "POST", token: admin.token, body: { email: "nope", teamId: "nosuchteam" } }),
      422,
      "invalid",
    );
    expect(fieldCodes(refusal)).toEqual(["displayName:required", "email:invalid_email", "teamId:invalid"]);
  });
  // Atlas: Avery, Jordan. Birch: nobody. Cedar: Sam, New Teammate. Delta: nobody.
});

describe("deleting a team", () => {
  /** Every deliverable, draft, response and punishment as they stood before any team was deleted. */
  let work: Awaited<ReturnType<typeof pledgeWork>>;

  it("sends its members back to working on their own, and deletes nothing of theirs", async () => {
    work = await pledgeWork();
    const samBefore = await docData(`users/${sam.uid}`);
    expect(ok(await removeTeam(cedar))).toEqual({ ok: true });

    expect(await docExists(`teams/${cedar}`)).toBe(false);
    expect(await membersOf(cedar)).toEqual([]);
    expect(await teamOf(sam.uid)).toBeNull();
    expect((await teamList()).map(([name]) => name)).toEqual(["Team Atlas", "Team Birch", "Team Delta"]);

    // Every deliverable, draft, response and punishment is exactly as it was.
    expect(await pledgeWork()).toEqual(work);
    const samAfter = await docData(`users/${sam.uid}`);
    expect({ ...samAfter, teamId: cedar, updatedAt: samBefore?.updatedAt }).toEqual(samBefore);
    expect((await testAuth().getUser(sam.uid)).disabled).toBe(false);
  });

  it("tells its former members they have no team", async () => {
    const result = await call(getMe, {}, { token: sam.token });
    expect(ok<MeDto>(result).team).toBeNull();
    expect(result.text).not.toContain("Team Cedar");
    expect(result.text).not.toContain("New Teammate");
  });

  it("records the deletion against the team, with how many members it had", async () => {
    expect(await latestAudit()).toMatchObject({
      action: "team.delete",
      targetType: "team",
      targetId: cedar,
      actorEmail: ADMIN_ONE,
      summary: 'Deleted team "Team Cedar" (2 members now individual)',
    });
  });

  it("says one member in the singular, and none for an empty team", async () => {
    ok(await patchTeam(dune, { memberUids: [maya.uid] }));
    ok(await removeTeam(dune));
    expect((await latestAudit()).summary).toBe('Deleted team "Team Delta" (1 member now individual)');
    expect(await teamOf(maya.uid)).toBeNull();

    ok(await removeTeam(boreal));
    expect((await latestAudit()).summary).toBe('Deleted team "Team Birch" (0 members now individual)');
  });

  it("leaves every other team and its members alone", async () => {
    expect(await teamList()).toEqual([["Team Atlas", 2]]);
    expect(await membersOf(TEAM_ATLAS)).toEqual(["Avery Chen", "Jordan Patel"]);
    expect(ok<MeDto>(await call(getMe, {}, { token: jordan.token })).team).toEqual({ name: "Team Atlas", teammates: ["Avery Chen"] });
  });

  it("has deleted nothing of anyone's across all three deletions: each draft, response and punishment is as it was", async () => {
    // Sam and Maya were each on a team that was deleted, and each had a draft in progress.
    expect(Object.keys(work)).toContain(`drafts/week2interviews_${sam.uid}`);
    expect(Object.keys(work)).toContain(`drafts/week2synthesis_${maya.uid}`);
    expect(await pledgeWork()).toEqual(work);
  });

  it("is not found a second time, or for a team that never existed, and logs nothing", async () => {
    const auditBefore = await countAll("auditLog");
    const refusal = refused(await removeTeam(cedar), 404, "not_found");
    expect(refusal.error).toBe("That team doesn't exist.");
    refused(await removeTeam("nosuchteam"), 404, "not_found");
    expect(await countAll("auditLog")).toBe(auditBefore);
    expect(await countAll("teams")).toBe(1);
  });

  it("frees the name for a new team", async () => {
    const { team } = ok<{ team: TeamDto }>(await create({ name: "Team Cedar" }));
    expect(team.id).not.toBe(cedar);
    expect(team.memberCount).toBe(0);
    ok(await removeTeam(team.id));
  });

  it("no longer lists the deleted team against anyone on the admin pages", async () => {
    const view = await overview();
    expect(view.pledges.filter((pledge) => pledge.teamId !== null).map((pledge) => pledge.displayName)).toEqual(["Avery Chen", "Jordan Patel"]);
    const responses = ok<FormResponsesDto>(await call(getResponses, { formId: "week0onboarding" }, { token: admin.token }));
    expect(responses.teams.map((team) => team.id)).toEqual([TEAM_ATLAS]);
    expect(responses.responses.find((response) => response.uid === sam.uid)?.teamId).toBeNull();
  });
});

describe("a pledge whose team is gone but whose profile still points at it", () => {
  // Not reachable through the portal, which clears the profile in the same step. Reads must cope with it anyway.
  it("is told they have no team, and is not shown anyone else whose profile points there", async () => {
    await testDb().doc(`users/${sam.uid}`).update({ teamId: "ghostteam" });
    await testDb().doc(`users/${maya.uid}`).update({ teamId: "ghostteam" });
    try {
      const result = await call(getMe, {}, { token: sam.token });
      expect(ok<MeDto>(result).team).toBeNull();
      expect(result.text).not.toContain("Maya");
      // The admin overview still lists the one real team, with the right size.
      expect(await teamList()).toEqual([["Team Atlas", 2]]);
    } finally {
      await testDb().doc(`users/${sam.uid}`).update({ teamId: null });
      await testDb().doc(`users/${maya.uid}`).update({ teamId: null });
    }
  });
});

describe("the audit trail of team changes", () => {
  it("has an entry for every kind of change, each against a team and made by an admin", async () => {
    const entries = (await storedAudit()).filter((entry) => entry.action.startsWith("team."));
    expect(new Set(entries.map((entry) => entry.action))).toEqual(new Set(["team.create", "team.update", "team.delete"]));
    for (const entry of entries) {
      expect(entry.targetType).toBe("team");
      expect(entry.targetId).toMatch(/^[A-Za-z0-9]{1,64}$/);
      expect([admin.uid, adminTwo.uid]).toContain(entry.actorUid);
      expect([ADMIN_ONE, ADMIN_TWO]).toContain(entry.actorEmail);
      expect(entry.summary.length).toBeGreaterThan(0);
    }
  });

  it("shows them on the activity page with the team as the target", async () => {
    const page = ok<AuditLogDto>(await call(getAudit, {}, { token: admin.token }));
    const teamEntries = page.entries.filter((entry) => entry.targetType === "team");
    expect(teamEntries.length).toBeGreaterThan(5);
    expect(teamEntries.every((entry) => entry.action.startsWith("team."))).toBe(true);
  });

  it("never names a pledge's email or uid in a team entry: only how many were added or removed", async () => {
    const text = JSON.stringify((await storedAudit()).filter((entry) => entry.action.startsWith("team.")).map((entry) => entry.summary));
    for (const fragment of [AVERY, JORDAN, MAYA, SAM, RILEY, CASEY, avery.uid, jordan.uid, maya.uid, sam.uid, rileyUid, caseyUid]) {
      expect(text).not.toContain(fragment);
    }
  });
});
