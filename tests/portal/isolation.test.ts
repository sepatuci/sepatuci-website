/**
 * No cross-data leaks: a pledge can never obtain another pledge's data, with
 * or without teams. Every pledge is given text that is theirs alone, in a
 * draft, a response and a punishment, and then everything the API will send a
 * pledge is searched for anyone else's.
 *
 * The one thing a pledge is told about another pledge is the display name of
 * a teammate, in `team.teammates` of GET /me. That exception is checked
 * exactly, and nowhere else.
 *
 * Teams during the first half of this file:
 *   Team Atlas   Avery, Jordan, and Riley, whose account is disabled
 *   Team Boreal  Maya, and Casey, who has never signed in
 *   no team      Sam
 *
 * Actives are the other way round: they read every pledge's work through the
 * review routes (tests/portal/review.test.ts) and can reach nothing else. Here
 * an active is turned loose on every route that is an admin's or a pledge's.
 *
 * The file ends with a pledge and an active whom an admin has put on temporary
 * passwords. Until each has chosen their own, neither reads anything at all.
 */
import { Timestamp } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as issueActivePassword } from "@/app/api/portal/admin/actives/[uid]/temporary-password/route";
import { GET as getResponses } from "@/app/api/portal/admin/forms/[formId]/responses/route";
import { GET as getAdminForm } from "@/app/api/portal/admin/forms/[formId]/route";
import { POST as addPunishment } from "@/app/api/portal/admin/pledges/[uid]/punishments/route";
import { PATCH as updatePledge } from "@/app/api/portal/admin/pledges/[uid]/route";
import { POST as issuePledgePassword } from "@/app/api/portal/admin/pledges/[uid]/temporary-password/route";
import { GET as getOverview } from "@/app/api/portal/admin/pledges/route";
import { DELETE as deleteTeam, PATCH as updateTeam } from "@/app/api/portal/admin/teams/[teamId]/route";
import { POST as createTeam } from "@/app/api/portal/admin/teams/route";
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
import { GET as getSubmission } from "@/app/api/portal/submissions/[formId]/route";
import { GET as listSubmissions } from "@/app/api/portal/submissions/route";
import { resetRateLimits } from "@/lib/portal/server/rate-limit";
import type {
  AdminFormDto,
  Answers,
  DashboardDto,
  MeDto,
  PledgeFormDto,
  PunishmentDto,
  ReviewOverviewDto,
  SubmissionDto,
  SubmissionHistoryDto,
  TeamDto,
  TemporaryPasswordDto,
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
  OWN_PASSWORD,
  PRIYA,
  RILEY,
  SAM,
  SEEDED_ACCOUNTS,
  SEED_TIMEOUT_MS,
  SLOW_TEST_MS,
  TEAM_ATLAS,
  TEAM_ATLAS_NAME,
  TEMPORARY_PASSWORD_MS,
  ageLastHeartbeat,
  call,
  claimsOf,
  countAll,
  countWhere,
  discoverRoutes,
  docData,
  docExists,
  dumpCollections,
  dumpPortal,
  everyStoredFingerprint,
  issueTemporaryPasswordAgo,
  ok,
  refused,
  seedPortal,
  signIn,
  signInFailure,
  storedClaims,
  storedFingerprint,
  testAuth,
  testDb,
  uidOf,
  type ApiResult,
  type Handler,
  type Session,
} from "./helpers";

const DISCOVERED = await discoverRoutes();
const ADMIN_ROUTES = DISCOVERED.filter((route) => route.need === "admin");
const PLEDGE_ROUTES = DISCOVERED.filter((route) => route.need === "pledge");
/** Everything that is not an active's to call: each role's own routes, and not the five every role shares. */
const NOT_AN_ACTIVES = [...ADMIN_ROUTES, ...PLEDGE_ROUTES];
/** The two shared routes that could change something about an account: the welcome, and a temporary password. */
const ONBOARDING = DISCOVERED.filter((route) => route.label === "POST /onboarding");
const CHOOSE_PASSWORD = DISCOVERED.filter((route) => route.label === "POST /password");

const FORM_IDS = ["week0onboarding", "week1reflection", "week2interviews", "week2synthesis", "week3mvpscope", "pitchfeedback"];
const TEAM_BOREAL_NAME = "Team Boreal";

/** Text that belongs to one pledge alone, wherever it is planted. */
const mark = (kind: string, name: string): string => `MARK-${kind}-${name.split(" ")[0].toUpperCase()}-93417`;

interface Person {
  name: string;
  email: string;
  uid: string;
  /** Strings that are this person's alone, each with a description for a failure message. */
  secrets: Array<[string, string]>;
}

// Each seeded pledge's answers are different, by their position in the seed.
const SEEDED_ANSWER_TEXT: Record<string, string[]> = {
  [AVERY]: ["document/d/demo-1", "Group projects fall apart"],
  [JORDAN]: ["document/d/demo-2", "Booking time with advisors is a mess", "Late onboarding survey", "Set up the room before the Week 1 session"],
  [MAYA]: ["document/d/demo-3", "I talked to five students who work part-time"],
  [SAM]: ["Missed the Week 1 deliverable", "Present your founder reflection to the class"],
  [RILEY]: [],
  [CASEY]: [],
};

let admin: Session;
let avery: Session;
let jordan: Session;
let maya: Session;
let sam: Session;
/** The seeded active who is set up. */
let priya: Session;
/** An active who has never signed in, and one whose account is disabled. */
let marcusUid: string;
let danaUid: string;
let people: Person[];
let rileyUid: string;
let boreal: string;
/** The punishment planted for each pledge, by uid. */
const punishmentIds = new Map<string, string>();
/** A seeded deliverable as an admin reads it, for building requests an admin could really send. */
let week0: AdminFormDto;

const personOf = (uid: string): Person => {
  const found = people.find((person) => person.uid === uid);
  if (!found) throw new Error(`No fixture for ${uid}`);
  return found;
};

/**
 * Everything in `text` that belongs to someone other than `viewer`: emails,
 * uids, planted and seeded text, display names, and anything that names a team
 * or its id. `allowedNames` are display names the caller has already accounted for.
 */
function leaksIn(text: string, viewer: Session, allowedNames: readonly string[] = [], allowedTeamNames: readonly string[] = []): string[] {
  const found: string[] = [];
  for (const other of people) {
    if (other.uid === viewer.uid) continue;
    if (text.includes(other.email)) found.push(`${other.name}'s email`);
    if (text.includes(other.uid)) found.push(`${other.name}'s uid`);
    if (!allowedNames.includes(other.name) && text.includes(other.name)) found.push(`${other.name}'s name`);
    for (const [what, secret] of other.secrets) {
      if (text.includes(secret)) found.push(`${other.name}'s ${what}`);
    }
  }
  for (const teamName of [TEAM_ATLAS_NAME, TEAM_BOREAL_NAME, "Team Cedar"]) {
    if (!allowedTeamNames.includes(teamName) && text.includes(teamName)) found.push(`the name ${teamName}`);
  }
  for (const teamId of [TEAM_ATLAS, boreal]) {
    if (teamId && text.includes(teamId)) found.push(`the team id ${teamId}`);
  }
  if (/"teamId"|"memberCount"|"memberUids"/.test(text)) found.push("a team field");
  return found;
}

const asAdmin = <P extends Record<string, string>>(handler: Handler<P>, params: P, method: "POST" | "PATCH" | "DELETE", body?: unknown) =>
  call(handler, params, { method, token: admin.token, body });

/** Every read a pledge can make, with the label it is reported under. */
async function everyRead(viewer: Session): Promise<Array<[string, ApiResult]>> {
  const token = viewer.token;
  const reads: Array<[string, ApiResult]> = [
    ["GET /me", await call(getMe, {}, { token })],
    ["GET /dashboard", await call(getDashboard, {}, { token })],
    ["GET /submissions", await call(listSubmissions, {}, { token })],
  ];
  for (const formId of FORM_IDS) {
    reads.push([`GET /forms/${formId}`, await call(getForm, { formId }, { token })]);
    reads.push([`GET /submissions/${formId}`, await call(getSubmission, { formId }, { token })]);
  }
  return reads;
}

beforeAll(async () => {
  await seedPortal();
  [admin, avery, jordan, maya, sam, priya] = await Promise.all([ADMIN_ONE, AVERY, JORDAN, MAYA, SAM, PRIYA].map((email) => signIn(email)));
  const [riley, caseyUid, adminTwoUid] = await Promise.all([uidOf(RILEY), uidOf(CASEY), uidOf(ADMIN_TWO)]);
  rileyUid = riley;
  [marcusUid, danaUid] = await Promise.all([uidOf(MARCUS), uidOf(DANA)]);

  const pledges: Array<[string, string, string]> = [
    ["Avery Chen", AVERY, avery.uid],
    ["Jordan Patel", JORDAN, jordan.uid],
    ["Maya Rodriguez", MAYA, maya.uid],
    ["Sam Okafor", SAM, sam.uid],
    ["Riley Nguyen", RILEY, rileyUid],
    ["Casey Kim", CASEY, caseyUid],
  ];
  people = pledges.map(([name, email, uid]) => ({
    name,
    email,
    uid,
    secrets: [
      ["draft", mark("DRAFT", name)],
      ["response", mark("RESPONSE", name)],
      ["punishment title", mark("PUNISHMENT", name)],
      ["punishment details", mark("DETAILS", name)],
      ...SEEDED_ANSWER_TEXT[email].map((text): [string, string] => [`seeded text "${text}"`, text]),
    ],
  }));
  // Nothing about an admin belongs in a pledge's browser either.
  people.push({ name: "Demo Chair 1", email: ADMIN_ONE, uid: admin.uid, secrets: [] });
  people.push({ name: "Demo Chair 2", email: ADMIN_TWO, uid: adminTwoUid, secrets: [] });
  // Nor anything about the actives who read their work.
  people.push({ name: "Priya Shah", email: PRIYA, uid: priya.uid, secrets: [] });
  people.push({ name: "Marcus Lee", email: MARCUS, uid: marcusUid, secrets: [] });
  people.push({ name: "Dana Ortiz", email: DANA, uid: danaUid, secrets: [] });

  // Teams, made the way an admin makes them.
  ok(await asAdmin(updatePledge, { uid: rileyUid }, "PATCH", { teamId: TEAM_ATLAS }));
  boreal = ok<{ team: TeamDto }>(await asAdmin(createTeam, {}, "POST", { name: TEAM_BOREAL_NAME, memberUids: [maya.uid, caseyUid] })).team.id;

  // A punishment for every pledge, through the admin API.
  for (const [name, , uid] of pledges) {
    const added = ok<PunishmentDto>(
      await asAdmin(addPunishment, { uid }, "POST", { title: mark("PUNISHMENT", name), details: mark("DETAILS", name) }),
    );
    punishmentIds.set(uid, added.id);
  }
  resetRateLimits();

  // A response of everyone's own. All but Casey turned in week 0 in the seed.
  for (const [name, , uid] of pledges) {
    const ref = testDb().doc(`submissions/week0onboarding_${uid}`);
    if ((await ref.get()).exists) await ref.update({ "answers.q_major.value": mark("RESPONSE", name) });
  }

  // A draft of everyone's own: saved through the API by those who can sign in, on the deliverable open to them.
  const draftText = (name: string) => ({ kind: "text", value: mark("DRAFT", name) });
  for (const [session, formId, questionId] of [
    [avery, "week2synthesis", "q_insight1"],
    [maya, "week2synthesis", "q_insight1"],
    [jordan, "week2interviews", "q_surprise"],
    [sam, "week2interviews", "q_surprise"],
  ] as const) {
    ok(await call(putDraft, { formId }, { method: "PUT", token: session.token, body: { answers: { [questionId]: draftText(personOf(session.uid).name) } } }));
  }
  const now = Timestamp.now();
  for (const uid of [rileyUid, caseyUid]) {
    await testDb().doc(`drafts/week2interviews_${uid}`).set({
      formId: "week2interviews",
      uid,
      answers: { q_surprise: draftText(personOf(uid).name) },
      startedAt: now,
      updatedAt: now,
      activeSeconds: 0,
    });
  }
  resetRateLimits();
}, SEED_TIMEOUT_MS);

beforeEach(() => {
  resetRateLimits();
});

describe("the fixtures", () => {
  it("gave every pledge a draft, a response and a punishment of their own", async () => {
    expect(await countAll("drafts")).toBe(6);
    expect(await countAll("punishments")).toBe(8);
    const stored = JSON.stringify(await dumpCollections(["drafts", "submissions", "punishments"]));
    for (const person of people.filter((candidate) => candidate.secrets.length > 0)) {
      for (const [what, secret] of person.secrets) {
        // Casey has no response: they never turned anything in.
        if (person.email === CASEY && what === "response") continue;
        expect(stored, `${person.name}'s ${what}`).toContain(secret);
      }
    }
  });

  it("can be found by the search: an admin's pages do contain every pledge's text", async () => {
    const responses = await call(getResponses, { formId: "week0onboarding" }, { token: admin.token });
    const overview = await call(getOverview, {}, { token: admin.token });
    const found = leaksIn(responses.text + overview.text, sam);
    for (const expected of [
      "Avery Chen's email",
      "Avery Chen's uid",
      "Avery Chen's name",
      "Avery Chen's response",
      "Jordan Patel's response",
      "Maya Rodriguez's response",
      "Riley Nguyen's response",
      "Casey Kim's email",
      "the name Team Atlas",
      "the name Team Boreal",
      `the team id ${TEAM_ATLAS}`,
      `the team id ${boreal}`,
      "a team field",
    ]) {
      expect(found).toContain(expected);
    }
  });
});

describe("what a pledge on a team is told about it", () => {
  const meOf = async (session: Session): Promise<{ me: MeDto; text: string }> => {
    const result = await call(getMe, {}, { token: session.token });
    return { me: ok<MeDto>(result), text: result.text };
  };

  it("is the team's name and the other members' display names, and nothing more", async () => {
    const { me } = await meOf(avery);
    expect(me.team).toEqual({ name: TEAM_ATLAS_NAME, teammates: ["Jordan Patel"] });
    expect(Object.keys(me.team ?? {}).sort()).toEqual(["name", "teammates"]);
    for (const teammate of me.team?.teammates ?? []) expect(typeof teammate).toBe("string");
  });

  it.each<[string, () => Session, string, string[]]>([
    ["Avery", () => avery, TEAM_ATLAS_NAME, ["Jordan Patel"]],
    ["Jordan", () => jordan, TEAM_ATLAS_NAME, ["Avery Chen"]],
    ["Maya", () => maya, TEAM_BOREAL_NAME, ["Casey Kim"]],
  ])("tells %s their own team and teammates only", async (_label, session, teamName, teammates) => {
    const { me, text } = await meOf(session());
    expect(me.team).toEqual({ name: teamName, teammates });
    // With the one allowed exception set aside, nothing of anyone else's is in the response.
    expect(leaksIn(text, session(), teammates, [teamName])).toEqual([]);
  });

  it("never lists the caller among their own teammates", async () => {
    for (const session of [avery, jordan, maya]) {
      const { me } = await meOf(session);
      expect(me.team?.teammates).not.toContain(me.displayName);
      expect(me.team?.teammates).not.toContain(personOf(session.uid).name);
    }
  });

  it("carries no email, uid or team id: of a teammate, of the team, or of anyone", async () => {
    for (const session of [avery, jordan, maya]) {
      const { text } = await meOf(session);
      for (const other of people.filter((person) => person.uid !== session.uid)) {
        expect(text, `${other.name}'s email`).not.toContain(other.email);
        expect(text, `${other.name}'s uid`).not.toContain(other.uid);
      }
      expect(text).not.toContain(TEAM_ATLAS);
      expect(text).not.toContain(boreal);
      expect(text).not.toMatch(/"teamId"|"memberCount"|"createdBy"/);
    }
  });

  it("leaves out a member whose account is disabled", async () => {
    // Riley is on Team Atlas and disabled.
    expect(await countWhere("users", "teamId", TEAM_ATLAS)).toBe(3);
    for (const session of [avery, jordan]) {
      const { me, text } = await meOf(session);
      expect(me.team?.teammates).not.toContain("Riley Nguyen");
      expect(text).not.toContain("Riley");
    }
  });

  it(
    "drops a member from their teammates' view the moment they are disabled, and shows them again once re-enabled",
    async () => {
      ok(await asAdmin(updatePledge, { uid: jordan.uid }, "PATCH", { status: "disabled" }));
      const whileDisabled = await meOf(avery);
      expect(whileDisabled.me.team).toEqual({ name: TEAM_ATLAS_NAME, teammates: [] });
      expect(whileDisabled.text).not.toContain("Jordan");

      ok(await asAdmin(updatePledge, { uid: jordan.uid }, "PATCH", { status: "active" }));
      expect((await meOf(avery)).me.team).toEqual({ name: TEAM_ATLAS_NAME, teammates: ["Jordan Patel"] });
      jordan = await signIn(JORDAN);
    },
    SLOW_TEST_MS,
  );

  it("lists several teammates in alphabetical order, each seeing the others and not themselves", async () => {
    ok(await asAdmin(updatePledge, { uid: sam.uid }, "PATCH", { teamId: TEAM_ATLAS }));
    try {
      expect((await meOf(sam)).me.team).toEqual({ name: TEAM_ATLAS_NAME, teammates: ["Avery Chen", "Jordan Patel"] });
      expect((await meOf(avery)).me.team).toEqual({ name: TEAM_ATLAS_NAME, teammates: ["Jordan Patel", "Sam Okafor"] });
      expect((await meOf(jordan)).me.team).toEqual({ name: TEAM_ATLAS_NAME, teammates: ["Avery Chen", "Sam Okafor"] });
      // A pledge on the other team sees none of them.
      expect((await meOf(maya)).me.team).toEqual({ name: TEAM_BOREAL_NAME, teammates: ["Casey Kim"] });
    } finally {
      ok(await asAdmin(updatePledge, { uid: sam.uid }, "PATCH", { teamId: null }));
    }
    expect((await meOf(sam)).me.team).toBeNull();
  });

  it("tells a pledge who is not on a team nothing about any team or its members", async () => {
    const { me, text } = await meOf(sam);
    expect(me.team).toBeNull();
    expect(leaksIn(text, sam)).toEqual([]);
    expect(text).not.toMatch(/Atlas|Boreal|teammates":\[\"/);
  });

  it("tells an admin nothing about teams through this route either", async () => {
    const { me } = await meOf(admin);
    expect(me.team).toBeNull();
  });
});

describe("everything a pledge can read", () => {
  const VIEWERS: Array<[string, () => Session, string[], string[]]> = [
    ["Avery, on Team Atlas", () => avery, ["Jordan Patel"], [TEAM_ATLAS_NAME]],
    ["Jordan, on Team Atlas", () => jordan, ["Avery Chen"], [TEAM_ATLAS_NAME]],
    ["Maya, on Team Boreal", () => maya, ["Casey Kim"], [TEAM_BOREAL_NAME]],
    ["Sam, on no team", () => sam, [], []],
  ];

  it.each(VIEWERS)("contains nothing of anyone else's for %s", async (_label, session, teammates, teamNames) => {
    const reads = await everyRead(session());
    expect(reads).toHaveLength(15);
    for (const [label, result] of reads) {
      // Teammates' names, and the team's name, are allowed in GET /me and nowhere else.
      const found = label === "GET /me" ? leaksIn(result.text, session(), teammates, teamNames) : leaksIn(result.text, session());
      expect(found, label).toEqual([]);
    }
  });

  it.each(VIEWERS)("puts teammates' names in team.teammates of GET /me and nowhere else in it, for %s", async (_label, session, teammates) => {
    const result = await call(getMe, {}, { token: session().token });
    const me = ok<MeDto>(result);
    expect(me.team?.teammates ?? []).toEqual(teammates);
    // Take the one allowed field away and no other pledge's name is left anywhere in the response.
    const rest = JSON.stringify({ ...me, team: me.team ? { ...me.team, teammates: [] } : null });
    for (const other of people.filter((person) => person.uid !== session().uid)) {
      expect(rest, other.name).not.toContain(other.name);
    }
  });

  it.each(VIEWERS)("does contain the pledge's own draft, response and punishment, for %s", async (_label, session) => {
    const mine = personOf(session().uid);
    const text = (await everyRead(session())).map(([, result]) => result.text).join("\n");
    for (const [what, secret] of mine.secrets.slice(0, 4)) expect(text, `own ${what}`).toContain(secret);
    expect(text).toContain(mine.email);
    expect(text).toContain(mine.uid);
  });

  it.each(VIEWERS)("answers with the caller's own data whatever uid the request names, for %s", async (_label, session) => {
    const viewer = session();
    const others = people.filter((person) => person.uid !== viewer.uid);
    for (const other of others.slice(0, 6)) {
      const naming = { token: viewer.token, query: `?uid=${other.uid}&email=${encodeURIComponent(other.email)}`, headers: { "x-uid": other.uid, "x-user-id": other.uid } };
      for (const result of [
        await call(getMe, {}, naming),
        await call(getDashboard, {}, naming),
        await call(listSubmissions, {}, naming),
        await call(getForm, { formId: "week2interviews" }, naming),
        await call(getSubmission, { formId: "week0onboarding" }, naming),
      ]) {
        const found = leaksIn(result.text, viewer, people.map((person) => person.name), [TEAM_ATLAS_NAME, TEAM_BOREAL_NAME]);
        expect(found).toEqual([]);
      }
      expect(ok<MeDto>(await call(getMe, {}, naming)).uid).toBe(viewer.uid);
    }
  });

  it.each(VIEWERS)("is refused a response or draft addressed by another pledge's uid, for %s", async (_label, session) => {
    const viewer = session();
    // The other pledges: five of them, three deliverables, two ways of addressing each.
    for (const other of people.filter((person) => person.uid !== viewer.uid && person.secrets.length > 0)) {
      for (const formId of ["week0onboarding", "week2interviews", "week2synthesis"]) {
        for (const composed of [`${formId}_${other.uid}`, other.uid]) {
          const opened = await call(getForm, { formId: composed }, { token: viewer.token });
          const read = await call(getSubmission, { formId: composed }, { token: viewer.token });
          refused(opened, 404, "not_found");
          refused(read, 404, "not_found");
          expect(leaksIn(opened.text + read.text, viewer)).toEqual([]);
        }
      }
    }
  });

  it("lists exactly the caller's own responses and punishments", async () => {
    const expected: Array<[Session, string[]]> = [
      [avery, ["week0onboarding", "week1reflection", "week2interviews"]],
      [jordan, ["week0onboarding", "week1reflection"]],
      [maya, ["week0onboarding", "week2interviews"]],
      [sam, ["week0onboarding"]],
    ];
    for (const [session, formIds] of expected) {
      const history = ok<SubmissionHistoryDto>(await call(listSubmissions, {}, { token: session.token }));
      expect(history.submissions.map((submission) => submission.formId).sort()).toEqual(formIds);

      const dashboard = ok<DashboardDto>(await call(getDashboard, {}, { token: session.token }));
      expect(dashboard.punishments.every((punishment) => punishment.uid === session.uid)).toBe(true);
      expect(dashboard.punishments.map((punishment) => punishment.title)).toContain(mark("PUNISHMENT", personOf(session.uid).name));
      // One planted for everyone. Sam also has the active one from the seed; Jordan's seeded one is resolved.
      expect(dashboard.punishments).toHaveLength(session === sam ? 2 : 1);
    }
  });

  it("sends nothing of anyone else's back from the writes a pledge can make", async () => {
    for (const [session, formId, questionId] of [
      [avery, "week2synthesis", "q_insight1"],
      [sam, "week2interviews", "q_surprise"],
    ] as const) {
      const answers = { [questionId]: { kind: "text", value: mark("DRAFT", personOf(session.uid).name) } };
      const results = [
        await call(putDraft, { formId }, { method: "PUT", token: session.token, body: { answers } }),
        await call(heartbeat, {}, { method: "POST", token: session.token, body: { formId } }),
        await call(completeOnboarding, {}, { method: "POST", token: session.token }),
        // Refused: required answers are missing. The refusal lists fields, not people.
        await call(submit, { formId }, { method: "POST", token: session.token, body: { answers, formVersion: 1 } }),
      ];
      expect(results.map((result) => result.status)).toEqual([200, 200, 200, 422]);
      for (const result of results) expect(leaksIn(result.text, session)).toEqual([]);
    }
  });
});

describe("two pledges on the same team", () => {
  const INTERVIEWS: Answers = {
    q_count: { kind: "text", value: "4" },
    q_date: { kind: "text", value: "2026-10-05" },
    q_surprise: { kind: "text", value: mark("SECOND-RESPONSE", "Jordan Patel") },
    q_notes: { kind: "text", value: "https://docs.google.com/document/d/jordans-own-notes" },
  };
  const SYNTHESIS: Answers = {
    q_insight1: { kind: "text", value: mark("SECOND-RESPONSE", "Avery Chen") },
    q_insight2: { kind: "text", value: "Workarounds already exist." },
    q_pivot: { kind: "choice", optionId: "o_refined", other: null },
  };
  /** Every way a request can name somebody else. */
  const naming = (other: Session) => ({
    query: `?uid=${other.uid}&as=${other.uid}`,
    headers: { "x-uid": other.uid, "x-forwarded-user": other.email },
  });

  it("really are on the same team", async () => {
    expect((await docData(`users/${avery.uid}`))?.teamId).toBe(TEAM_ATLAS);
    expect((await docData(`users/${jordan.uid}`))?.teamId).toBe(TEAM_ATLAS);
    expect(ok<MeDto>(await call(getMe, {}, { token: avery.token })).team?.teammates).toEqual(["Jordan Patel"]);
  });

  it("cannot turn a deliverable in as the other: it is stored under the one who sent it", async () => {
    // Avery has turned the interviews in; Jordan has not.
    const averysBefore = await docData(`submissions/week2interviews_${avery.uid}`);
    expect(averysBefore).not.toBeNull();

    const result = await call(submit, { formId: "week2interviews" }, {
      method: "POST",
      token: jordan.token,
      body: { answers: INTERVIEWS, formVersion: 1, uid: avery.uid, userId: avery.uid, email: AVERY, teamId: TEAM_ATLAS },
      ...naming(avery),
    });
    ok(result);
    expect(leaksIn(result.text, jordan)).toEqual([]);

    const stored = await docData(`submissions/week2interviews_${jordan.uid}`);
    expect(stored).toMatchObject({ uid: jordan.uid, formId: "week2interviews" });
    expect(JSON.stringify(stored)).toContain(mark("SECOND-RESPONSE", "Jordan Patel"));
    // Avery's own response to the same deliverable is untouched.
    expect(await docData(`submissions/week2interviews_${avery.uid}`)).toEqual(averysBefore);
    expect(await countWhere("submissions", "uid", avery.uid)).toBe(3);
    expect(await countWhere("submissions", "uid", jordan.uid)).toBe(3);
  });

  it("cannot overwrite the other's response by turning the same deliverable in again in their name", async () => {
    const jordansBefore = await docData(`submissions/week2interviews_${jordan.uid}`);
    const attempt = await call(submit, { formId: "week2interviews" }, {
      method: "POST",
      token: avery.token,
      body: { answers: { ...INTERVIEWS, q_surprise: { kind: "text", value: "Overwritten by a teammate" } }, formVersion: 1, uid: jordan.uid },
      ...naming(jordan),
    });
    // Avery already turned it in, so this is Avery's own second attempt and nothing more.
    refused(attempt, 409, "already_submitted");
    expect(await docData(`submissions/week2interviews_${jordan.uid}`)).toEqual(jordansBefore);
  });

  it("cannot save a draft as the other: both now have the same deliverable open, and each draft stays its owner's", async () => {
    // Turning the interviews in unlocked the synthesis for Jordan, which Avery already had open.
    const jordansDraft = { q_insight1: { kind: "text", value: mark("SECOND-DRAFT", "Jordan Patel") } };
    ok(await call(putDraft, { formId: "week2synthesis" }, { method: "PUT", token: jordan.token, body: { answers: jordansDraft } }));
    const jordansBefore = await docData(`drafts/week2synthesis_${jordan.uid}`);

    const averysDraft = { q_insight1: { kind: "text", value: mark("SECOND-DRAFT", "Avery Chen") } };
    ok(
      await call(putDraft, { formId: "week2synthesis" }, {
        method: "PUT",
        token: avery.token,
        body: { answers: averysDraft, uid: jordan.uid, formId: "week2synthesis", userId: jordan.uid },
        ...naming(jordan),
      }),
    );

    expect(await docData(`drafts/week2synthesis_${jordan.uid}`)).toEqual(jordansBefore);
    expect(await docData(`drafts/week2synthesis_${avery.uid}`)).toMatchObject({ uid: avery.uid, answers: averysDraft });
    expect(await countWhere("drafts", "uid", jordan.uid)).toBe(1);
    expect(await countWhere("drafts", "uid", avery.uid)).toBe(1);
  });

  it("each open that deliverable and get their own draft back, never the other's", async () => {
    for (const [mine, theirs, name, otherName] of [
      [avery, jordan, "Avery Chen", "Jordan Patel"],
      [jordan, avery, "Jordan Patel", "Avery Chen"],
    ] as const) {
      for (const options of [{ token: mine.token }, { token: mine.token, ...naming(theirs) }]) {
        const result = await call(getForm, { formId: "week2synthesis" }, options);
        const view = ok<PledgeFormDto>(result);
        expect(view.draft?.answers).toEqual({ q_insight1: { kind: "text", value: mark("SECOND-DRAFT", name) } });
        expect(result.text).not.toContain(mark("SECOND-DRAFT", otherName));
        expect(leaksIn(result.text, mine)).toEqual([]);
      }
    }
  });

  it("each read their own response to a deliverable both turned in, never the other's", async () => {
    for (const formId of ["week0onboarding", "week1reflection", "week2interviews"]) {
      const averys = await call(getSubmission, { formId }, { token: avery.token, ...naming(jordan) });
      const jordans = await call(getSubmission, { formId }, { token: jordan.token, ...naming(avery) });
      ok<SubmissionDto>(averys);
      ok<SubmissionDto>(jordans);
      expect(averys.text).not.toBe(jordans.text);
      expect(leaksIn(averys.text, avery)).toEqual([]);
      expect(leaksIn(jordans.text, jordan)).toEqual([]);
    }
    const averysInterviews = await call(getSubmission, { formId: "week2interviews" }, { token: avery.token });
    expect(averysInterviews.text).not.toContain(mark("SECOND-RESPONSE", "Jordan Patel"));
    expect(averysInterviews.text).toContain("Group projects fall apart");
  });

  it("cannot read a response the other has turned in and they have not", async () => {
    ok(await call(submit, { formId: "week2synthesis" }, { method: "POST", token: avery.token, body: { answers: SYNTHESIS, formVersion: 1, uid: jordan.uid } }));
    expect(await docExists(`submissions/week2synthesis_${avery.uid}`)).toBe(true);
    expect(await docExists(`submissions/week2synthesis_${jordan.uid}`)).toBe(false);

    for (const options of [{ token: jordan.token }, { token: jordan.token, ...naming(avery) }]) {
      const result = await call(getSubmission, { formId: "week2synthesis" }, options);
      expect(refused(result, 404, "not_found").error).toBe("You haven't turned this in.");
      expect(result.text).not.toContain(mark("SECOND-RESPONSE", "Avery Chen"));
    }
    const history = await call(listSubmissions, {}, { token: jordan.token, ...naming(avery) });
    expect(ok<SubmissionHistoryDto>(history).submissions.map((submission) => submission.formId)).not.toContain("week2synthesis");
    // Jordan's own dashboard still shows it as theirs to do.
    const card = ok<DashboardDto>(await call(getDashboard, {}, { token: jordan.token })).forms.find((form) => form.id === "week2synthesis");
    expect(card).toMatchObject({ state: "open", submittedAt: null });
  });

  it("see only their own punishments", async () => {
    for (const [mine, name, otherName] of [
      [avery, "Avery Chen", "Jordan Patel"],
      [jordan, "Jordan Patel", "Avery Chen"],
    ] as const) {
      const result = await call(getDashboard, {}, { token: mine.token });
      const dashboard = ok<DashboardDto>(result);
      expect(dashboard.punishments.map((punishment) => punishment.title)).toEqual([mark("PUNISHMENT", name)]);
      expect(result.text).not.toContain(mark("PUNISHMENT", otherName));
      expect(result.text).not.toContain(mark("DETAILS", otherName));
    }
  });

  it("cannot credit time to the other's draft, or move the other's activity, with a heartbeat that names them", async () => {
    ok(await call(heartbeat, {}, { method: "POST", token: avery.token }));
    await ageLastHeartbeat(avery.uid, 60_000);
    const jordansDraft = await docData(`drafts/week2synthesis_${jordan.uid}`);
    const jordansProfile = await docData(`users/${jordan.uid}`);

    // Avery has no draft of the synthesis any more, having turned it in; Jordan does.
    ok(
      await call(heartbeat, {}, {
        method: "POST",
        token: avery.token,
        body: { formId: "week2synthesis", uid: jordan.uid, userId: jordan.uid },
        ...naming(jordan),
      }),
    );
    // The minute was credited to Avery, and to nothing of Jordan's.
    const averysActivity = (await docData(`users/${avery.uid}`))?.activity as { totalActiveSeconds: number };
    expect(averysActivity.totalActiveSeconds).toBeGreaterThanOrEqual(312 * 60 + 60);
    expect(await docData(`drafts/week2synthesis_${jordan.uid}`)).toEqual(jordansDraft);
    expect(await docData(`users/${jordan.uid}`)).toEqual(jordansProfile);
  });

  it("cannot finish the welcome tour for the other", async () => {
    // Jordan has not been through it; Avery has.
    expect((await docData(`users/${jordan.uid}`))?.onboardedAt).toBeNull();
    ok(await call(completeOnboarding, {}, { method: "POST", token: avery.token, body: { uid: jordan.uid }, ...naming(jordan) }));
    expect((await docData(`users/${jordan.uid}`))?.onboardedAt).toBeNull();
    expect(ok<MeDto>(await call(getMe, {}, { token: jordan.token })).onboardedAt).toBeNull();
  });

  it("still read nothing of each other's after all of that", async () => {
    for (const [session, teammates] of [
      [avery, ["Jordan Patel"]],
      [jordan, ["Avery Chen"]],
    ] as const) {
      for (const [label, result] of await everyRead(session)) {
        const found = label === "GET /me" ? leaksIn(result.text, session, teammates, [TEAM_ATLAS_NAME]) : leaksIn(result.text, session);
        expect(found, label).toEqual([]);
        expect(result.text, label).not.toContain(mark("SECOND-DRAFT", teammates[0]));
        expect(result.text, label).not.toContain(mark("SECOND-RESPONSE", teammates[0]));
      }
    }
  });
});

/** What a planted answer says, so it can be found if a request that should be refused stores it. */
const PLANTED_ANSWER = "Planted by a caller who should have been refused";
/** A password that would be accepted, so it can be tried afterwards on every account a request named. */
const PLANTED_PASSWORD = "planted-harbor-lantern-47";

/**
 * A request the right caller could really send to this route, aimed at
 * `victim`: their uid in the path, the query, the headers and the body, and a
 * body that an admin's or a pledge's route would act on.
 */
function hostile(route: (typeof DISCOVERED)[number], caller: Session, victim: { uid: string }, formId = "week0onboarding") {
  const params: Record<string, string> = {};
  for (const name of Object.keys(route.params)) {
    if (name === "formId") params[name] = formId;
    else if (name === "uid") params[name] = victim.uid;
    else if (name === "teamId") params[name] = TEAM_ATLAS;
    else if (name === "id") params[name] = punishmentIds.get(victim.uid) ?? "";
    else if (name === "sessionId") params[name] = "abc123";
    else throw new Error(`No value for the route parameter ${name}: add one here so the new route is covered.`);
  }
  return call(route.handler, params, {
    method: route.method,
    token: caller.token,
    query: `?confirm=${encodeURIComponent(personOf(victim.uid).email)}&uid=${victim.uid}`,
    headers: { "x-uid": victim.uid },
    body: {
      // Teams.
      name: "Taken Over",
      memberUids: [victim.uid],
      teamId: null,
      // Pledges, actives and punishments.
      email: "planted.by.a.pledge@uci.edu",
      displayName: "Planted By A Pledge",
      status: "disabled",
      title: week0.title,
      details: "Planted by a pledge",
      // Deliverables.
      description: "Rewritten by a pledge",
      questions: week0.questions,
      settings: week0.settings,
      expectedVersion: week0.version,
      duplicateOf: "week0onboarding",
      // How a new account starts, and a password for an account that is choosing one.
      start: "temporary_password",
      password: PLANTED_PASSWORD,
      // A pledge's own draft or response, in somebody else's name.
      uid: victim.uid,
      answers: { q_surprise: { kind: "text", value: PLANTED_ANSWER } },
    },
  });
}

describe("the admin routes, called by a pledge", () => {
  let before: Awaited<ReturnType<typeof dumpPortal>>;

  it("takes stock first", async () => {
    week0 = ok<AdminFormDto>(await call(getAdminForm, { formId: "week0onboarding" }, { token: admin.token }));
    before = await dumpPortal();
    expect(Object.keys(before.firestore).length).toBeGreaterThan(60);
    expect(Object.keys(before.accounts)).toHaveLength(SEEDED_ACCOUNTS);
    expect(ADMIN_ROUTES.length).toBeGreaterThanOrEqual(32);
    expect(ADMIN_ROUTES.map((route) => route.label)).toEqual(
      expect.arrayContaining([
        "POST /admin/teams",
        "PATCH /admin/teams/[teamId]",
        "DELETE /admin/teams/[teamId]",
        "POST /admin/actives",
        "PATCH /admin/actives/[uid]",
        "DELETE /admin/actives/[uid]",
        // A pledge who could reach either of these could make themself an admin, or sign in as a sandbox.
        "POST /admin/people/[uid]/role",
        "POST /admin/preview",
        // A pledge who could reach either of these could take over anybody's account.
        "POST /admin/pledges/[uid]/temporary-password",
        "POST /admin/actives/[uid]/temporary-password",
      ]),
    );
  });

  it.each(ADMIN_ROUTES)("$label refuses a pledge who is on the team it would change", async (route) => {
    const result = await hostile(route, avery, jordan);
    const body = refused(result, 403, "forbidden");
    expect(body.error).toBe("You don't have permission to do that.");
    expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
    expect(leaksIn(result.text, avery)).toEqual([]);
  });

  it.each(ADMIN_ROUTES)("$label refuses a pledge who is on no team", async (route) => {
    const result = await hostile(route, sam, avery);
    refused(result, 403, "forbidden");
    expect(leaksIn(result.text, sam)).toEqual([]);
  });

  it.each(ADMIN_ROUTES)("$label refuses a pledge acting on their own account", async (route) => {
    refused(await hostile(route, maya, maya), 403, "forbidden");
  });

  // The actives' accounts are managed through admin routes too: a pledge cannot reach an active through any of them.
  it.each(ADMIN_ROUTES)("$label refuses a pledge aiming at an active", async (route) => {
    const result = await hostile(route, sam, priya);
    refused(result, 403, "forbidden");
    expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
    expect(leaksIn(result.text, sam)).toEqual([]);
  });

  it("changed nothing: every document and every sign-in account is exactly as it was", async () => {
    const after = await dumpPortal();
    expect(after.accounts).toEqual(before.accounts);
    expect(after.firestore).toEqual(before.firestore);
    expect(await docData(`teams/${TEAM_ATLAS}`)).toMatchObject({ name: TEAM_ATLAS_NAME });
    expect(await countAll("teams")).toBe(2);
    expect(await docExists(`punishments/${punishmentIds.get(jordan.uid)}`)).toBe(true);
  });

  it("would have changed things for an admin: the same requests are accepted from one", async () => {
    const teamRoute = ADMIN_ROUTES.find((route) => route.label === "POST /admin/teams");
    const renameRoute = ADMIN_ROUTES.find((route) => route.label === "PATCH /admin/teams/[teamId]");
    if (!teamRoute || !renameRoute) throw new Error("The team routes were not discovered.");

    // The request that was refused above, word for word, with an admin's token instead.
    const created = ok<{ team: TeamDto }>(await hostile(teamRoute, admin, jordan));
    expect(created.team).toMatchObject({ name: "Taken Over", memberCount: 1 });
    expect((await docData(`users/${jordan.uid}`))?.teamId).toBe(created.team.id);
    ok(await asAdmin(deleteTeam, { teamId: created.team.id }, "DELETE"));

    ok(await hostile(renameRoute, admin, jordan));
    expect(await docData(`teams/${TEAM_ATLAS}`)).toMatchObject({ name: "Taken Over" });
    expect((await docData(`users/${avery.uid}`))?.teamId).toBeNull();

    // Put Team Atlas back as it was for what follows.
    ok(await asAdmin(updateTeam, { teamId: TEAM_ATLAS }, "PATCH", { name: TEAM_ATLAS_NAME, memberUids: [avery.uid, jordan.uid, rileyUid] }));
    expect(await countWhere("users", "teamId", TEAM_ATLAS)).toBe(3);
  });
});

// Finishing the welcome and replacing a temporary password are open to every role, because
// each is about the caller's own account. Neither takes anything from the request about whose.
describe("the welcome and the password, asked for in somebody else's name", () => {
  let before: Awaited<ReturnType<typeof dumpPortal>>;
  const CALLERS: Array<[string, () => Session]> = [
    ["a pledge on a team", () => avery],
    ["a pledge on no team", () => sam],
    ["an active", () => priya],
  ];
  /** A teammate who has not been welcomed, a pledge who has never signed in, an active with no password, and an admin. */
  const victims = (): Array<{ uid: string }> => [jordan, { uid: people.find((person) => person.email === CASEY)?.uid ?? "" }, { uid: marcusUid }, admin];

  it("takes stock first", async () => {
    before = await dumpPortal();
    expect(ONBOARDING).toHaveLength(1);
    expect(CHOOSE_PASSWORD).toHaveLength(1);
    // None of the callers is on a temporary password, and each finished their own welcome in the seed.
    for (const [, session] of CALLERS) {
      expect((before.accounts[session().uid] as { claims: Record<string, unknown> }).claims.temp).toBeUndefined();
      expect((await docData(`users/${session().uid}`))?.onboardedAt).not.toBeNull();
    }
    expect((await docData(`users/${jordan.uid}`))?.onboardedAt).toBeNull();
  });

  it.each(CALLERS)("POST /password from %s sets nobody's password, whoever the request names", async (_label, session) => {
    for (const victim of victims()) {
      const result = await hostile(CHOOSE_PASSWORD[0], session(), victim);
      const body = refused(result, 409, "not_required");
      expect(body.error).toBe("This account already has its own password. Ask an active or an admin if it needs changing.");
      expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
      expect(leaksIn(result.text, session())).toEqual([]);
    }
  });

  it.each(CALLERS)("POST /onboarding from %s finishes nobody's welcome but their own, which was finished long ago", async (_label, session) => {
    const own = (await docData(`users/${session().uid}`))?.onboardedAt as { toMillis(): number };
    for (const victim of victims()) {
      const result = await hostile(ONBOARDING[0], session(), victim);
      expect(ok<{ onboardedAt: string }>(result)).toEqual({ onboardedAt: new Date(own.toMillis()).toISOString() });
      expect(leaksIn(result.text, session())).toEqual([]);
    }
  });

  it("changed nothing: nobody was welcomed, and nobody's password is the one that was sent", async () => {
    const after = await dumpPortal();
    expect(after.accounts).toEqual(before.accounts);
    expect(after.firestore).toEqual(before.firestore);
    for (const uid of [jordan.uid, marcusUid]) expect((await docData(`users/${uid}`))?.onboardedAt, uid).toBeNull();
    // Marcus and Casey have no password at all in the seed, and still have none.
    for (const email of [AVERY, JORDAN, SAM, PRIYA, MARCUS, CASEY, ADMIN_ONE]) {
      expect(await signInFailure(email, PLANTED_PASSWORD), email).not.toBe("");
    }
    for (const uid of [marcusUid, people.find((person) => person.email === CASEY)?.uid ?? ""]) {
      expect((await testAuth().getUser(uid)).passwordHash, uid).toBeUndefined();
    }
    // The passwords they had still work.
    for (const email of [AVERY, JORDAN, PRIYA, ADMIN_ONE]) expect((await signIn(email)).email).toBe(email);
  });
});

describe("every route that is an admin's or a pledge's, called by an active", () => {
  let before: Awaited<ReturnType<typeof dumpPortal>>;

  it("takes stock first", async () => {
    before = await dumpPortal();
    expect(Object.keys(before.firestore).length).toBeGreaterThan(60);
    expect(Object.keys(before.accounts)).toHaveLength(SEEDED_ACCOUNTS);
    // Every admin route and every pledge route: nothing is left out but the reads that are an
    // active's own, the routes every role shares, two of which are tried just above, and the
    // one route that needs no sign-in at all.
    expect(NOT_AN_ACTIVES).toHaveLength(DISCOVERED.length - 8);
    expect(DISCOVERED.filter((route) => !NOT_AN_ACTIVES.includes(route)).map((route) => route.label).sort()).toEqual([
      "GET /me",
      "GET /review/forms/[formId]",
      "GET /review/overview",
      "POST /heartbeat",
      "POST /onboarding",
      "POST /password",
      "POST /preview/redeem",
      "POST /sign-out",
    ]);
    expect(PLEDGE_ROUTES.map((route) => route.label)).toEqual(
      expect.arrayContaining(["PUT /forms/[formId]/draft", "POST /forms/[formId]/submit", "GET /dashboard", "GET /submissions"]),
    );
    expect(NOT_AN_ACTIVES.map((route) => route.label)).toEqual(
      expect.arrayContaining(["POST /admin/pledges/[uid]/temporary-password", "POST /admin/actives/[uid]/temporary-password"]),
    );
    // The active really is one, and can read what is theirs to read.
    expect(ok<MeDto>(await call(getMe, {}, { token: priya.token })).role).toBe("active");
  });

  it.each(NOT_AN_ACTIVES)("$label refuses an active aiming at a pledge", async (route) => {
    // A deliverable that is open to the pledge: a draft or a response would be stored if this got through.
    const result = await hostile(route, priya, jordan, "week2synthesis");
    const body = refused(result, 403, "forbidden");
    expect(body.error).toBe("You don't have permission to do that.");
    expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
    expect(leaksIn(result.text, priya)).toEqual([]);
  });

  it.each(NOT_AN_ACTIVES)("$label refuses an active aiming at a pledge who has never signed in", async (route) => {
    const result = await hostile(route, priya, { uid: people.find((person) => person.email === CASEY)?.uid ?? "" }, "week2interviews");
    refused(result, 403, "forbidden");
    expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
  });

  it.each(NOT_AN_ACTIVES)("$label refuses an active aiming at another active", async (route) => {
    const result = await hostile(route, priya, { uid: marcusUid }, "week2interviews");
    const body = refused(result, 403, "forbidden");
    expect(body.error).toBe("You don't have permission to do that.");
    expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
    expect(leaksIn(result.text, priya)).toEqual([]);
  });

  it.each(NOT_AN_ACTIVES)("$label refuses an active acting on their own account", async (route) => {
    const result = await hostile(route, priya, priya, "week2interviews");
    refused(result, 403, "forbidden");
    expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
  });

  it("changed nothing: every document and every sign-in account is exactly as it was", async () => {
    const after = await dumpPortal();
    expect(after.accounts).toEqual(before.accounts);
    expect(after.firestore).toEqual(before.firestore);
    expect(JSON.stringify(after)).not.toContain(PLANTED_ANSWER);
    // No draft, response or punishment of the active's own, and nobody added, renamed or welcomed.
    for (const collection of ["drafts", "submissions", "punishments"]) {
      expect(await countWhere(collection, "uid", priya.uid), collection).toBe(0);
    }
    expect(await docData(`users/${priya.uid}`)).toMatchObject({ role: "active", status: "active", displayName: "Priya Shah", teamId: null });
    expect(await docData(`users/${marcusUid}`)).toMatchObject({ role: "active", status: "active", displayName: "Marcus Lee", onboardedAt: null });
    await expect(testAuth().getUserByEmail("planted.by.a.pledge@uci.edu")).rejects.toMatchObject({ code: "auth/user-not-found" });
    // And nobody was put on a temporary password, or given the one the requests carried.
    for (const account of Object.values(after.accounts)) expect(JSON.stringify(account)).not.toMatch(/"temp"/);
    expect(JSON.stringify(after)).not.toContain(PLANTED_PASSWORD);
  });

  it("would have changed things for a pledge: the same request, with a pledge's token, is stored as theirs", async () => {
    const draftRoute = PLEDGE_ROUTES.find((route) => route.label === "PUT /forms/[formId]/draft");
    if (!draftRoute) throw new Error("The draft route was not discovered.");
    const own = await docData(`drafts/week2interviews_${sam.uid}`);
    try {
      // The request that was refused above, word for word, from a pledge the deliverable is open to.
      ok(await hostile(draftRoute, sam, jordan, "week2interviews"));
      expect(await docData(`drafts/week2interviews_${sam.uid}`)).toMatchObject({ uid: sam.uid, answers: { q_surprise: { kind: "text", value: PLANTED_ANSWER } } });
    } finally {
      // Sam's own draft goes back as it was, for what follows.
      if (own) await testDb().doc(`drafts/week2interviews_${sam.uid}`).set(own);
    }
    expect(await docData(`drafts/week2interviews_${sam.uid}`)).toEqual(own);
  });
});

describe("what an active is told about themself", () => {
  const ME_KEYS = ["createdAt", "displayName", "email", "onboardedAt", "pledgeClass", "preview", "role", "serverNow", "team", "uid"];

  it("is their own name, email and role, and when they finished their welcome, with no class or team", async () => {
    const result = await call(getMe, {}, { token: priya.token });
    const me = ok<MeDto>(result);
    expect(Object.keys(me).sort()).toEqual(ME_KEYS);
    expect(me).toMatchObject({
      uid: priya.uid,
      email: PRIYA,
      displayName: "Priya Shah",
      role: "active",
      pledgeClass: null,
      team: null,
    });
    expect(me.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Date.parse(me.serverNow)).toBeGreaterThan(Date.now() - 60_000);
    // Their own welcome, as stored on their own profile.
    const stored = (await docData(`users/${priya.uid}`))?.onboardedAt as { toMillis(): number };
    expect(Date.parse(me.onboardedAt ?? "")).toBe(stored.toMillis());
    expect(stored.toMillis()).toBeLessThan(Date.now() - 23 * 86_400_000);
  });

  it("is told the welcome is still to do when it is, and never a pledge's or an admin's", async () => {
    const ref = testDb().doc(`users/${priya.uid}`);
    const finished = (await ref.get()).get("onboardedAt") as unknown;
    await ref.update({ onboardedAt: null });
    try {
      expect(ok<MeDto>(await call(getMe, {}, { token: priya.token })).onboardedAt).toBeNull();
      // Avery, a pledge, finished the tour in the seed. That is theirs and stays theirs.
      expect(ok<MeDto>(await call(getMe, {}, { token: avery.token })).onboardedAt).not.toBeNull();
    } finally {
      await ref.update({ onboardedAt: finished });
    }
    expect(ok<MeDto>(await call(getMe, {}, { token: priya.token })).onboardedAt).not.toBeNull();
    expect(ok<MeDto>(await call(getMe, {}, { token: admin.token })).onboardedAt).toBeNull();
  });

  it("carries their own email and nobody else's, and nothing of any pledge, admin or other active", async () => {
    const result = await call(getMe, {}, { token: priya.token });
    expect(result.text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g)).toEqual([PRIYA]);
    expect(leaksIn(result.text, priya)).toEqual([]);
    expect(result.text).not.toMatch(/"teamId"|"teammates"|"submitted"|"activity"|"status"|"claims"/);
  });

  it("answers with the caller's own account whatever uid the request names", async () => {
    for (const other of people.filter((person) => person.uid !== priya.uid)) {
      const naming = { token: priya.token, query: `?uid=${other.uid}&email=${encodeURIComponent(other.email)}&role=admin`, headers: { "x-uid": other.uid, "x-role": "admin" } };
      const result = await call(getMe, {}, naming);
      expect(ok<MeDto>(result)).toMatchObject({ uid: priya.uid, email: PRIYA, role: "active" });
      expect(leaksIn(result.text, priya)).toEqual([]);
    }
  });

  it("is told of no team, and is nobody's teammate, even with a team written straight onto their profile", async () => {
    const ref = testDb().doc(`users/${priya.uid}`);
    await ref.update({ teamId: TEAM_ATLAS });
    try {
      const result = await call(getMe, {}, { token: priya.token });
      expect(ok<MeDto>(result).team).toBeNull();
      expect(leaksIn(result.text, priya)).toEqual([]);
      // The pledges on that team are not told of an active among them.
      const averys = await call(getMe, {}, { token: avery.token });
      expect(ok<MeDto>(averys).team?.teammates).not.toContain("Priya Shah");
      expect(averys.text).not.toContain("Priya");
    } finally {
      await ref.update({ teamId: null });
    }
  });

  it("refuses an active whose profile says pledge, and lets them back in when it says active again", async () => {
    const ref = testDb().doc(`users/${priya.uid}`);
    await ref.update({ role: "pledge" });
    try {
      const result = await call(getMe, {}, { token: priya.token });
      const body = refused(result, 403, "email_not_allowed");
      expect(body.error).toBe("This account doesn't have access to the portal.");
      expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
      expect(result.text).not.toContain(PRIYA);
      // The profile does not make them a pledge either: the pledge routes go by the sign-in.
      refused(await call(getDashboard, {}, { token: priya.token }), 403, "forbidden");
      refused(await call(submit, { formId: "week2interviews" }, { method: "POST", token: priya.token, body: { answers: {} } }), 403, "forbidden");
    } finally {
      await ref.update({ role: "active" });
    }
    expect(ok<MeDto>(await call(getMe, {}, { token: priya.token })).role).toBe("active");
  });

  it("refuses an active whose profile says admin: a profile cannot promote anyone", async () => {
    const ref = testDb().doc(`users/${priya.uid}`);
    await ref.update({ role: "admin" });
    try {
      refused(await call(getMe, {}, { token: priya.token }), 403, "email_not_allowed");
      refused(await call(getOverview, {}, { token: priya.token }), 403, "forbidden");
    } finally {
      await ref.update({ role: "active" });
    }
  });

  it("refuses an active whose profile was issued to a different address", async () => {
    const ref = testDb().doc(`users/${priya.uid}`);
    await ref.update({ email: "someone.else@uci.edu" });
    try {
      const result = await call(getMe, {}, { token: priya.token });
      refused(result, 403, "email_not_allowed");
      expect(result.text).not.toContain("someone.else@uci.edu");
    } finally {
      await ref.update({ email: PRIYA });
    }
    expect(ok<MeDto>(await call(getMe, {}, { token: priya.token })).email).toBe(PRIYA);
  });

  it("refuses a pledge whose profile says active, the other way round", async () => {
    const ref = testDb().doc(`users/${sam.uid}`);
    await ref.update({ role: "active" });
    try {
      refused(await call(getMe, {}, { token: sam.token }), 403, "email_not_allowed");
    } finally {
      await ref.update({ role: "pledge" });
    }
    expect(ok<MeDto>(await call(getMe, {}, { token: sam.token })).role).toBe("pledge");
  });
});

describe("what an admin does to teams", () => {
  const WORK = ["submissions", "drafts", "punishments"] as const;
  let work: Awaited<ReturnType<typeof dumpCollections>>;
  let views: string;
  let profiles: Record<string, Record<string, unknown>>;
  let cedar: string;

  /** What each pledge sees of their own work, with the clock reading taken out. */
  async function pledgeViews(): Promise<string> {
    const seen: unknown[] = [];
    for (const session of [avery, jordan, maya, sam]) {
      const dashboard = ok<DashboardDto>(await call(getDashboard, {}, { token: session.token }));
      const history = ok<SubmissionHistoryDto>(await call(listSubmissions, {}, { token: session.token }));
      const draft = ok<PledgeFormDto>(await call(getForm, { formId: "week2synthesis" }, { token: session.token }));
      seen.push({ forms: dashboard.forms, punishments: dashboard.punishments, progress: dashboard.progress, submissions: history.submissions, draft: draft.draft, card: draft.card });
    }
    return JSON.stringify(seen);
  }

  /** Every pledge profile without the two fields a team change is allowed to move. */
  async function profilesWithoutTeam(): Promise<Record<string, Record<string, unknown>>> {
    const snapshot = await testDb().collection("users").get();
    return Object.fromEntries(
      snapshot.docs.map((doc) => [
        doc.id,
        Object.fromEntries(Object.entries(doc.data()).filter(([field]) => field !== "teamId" && field !== "updatedAt")),
      ]),
    );
  }

  const unchanged = async (step: string): Promise<void> => {
    expect(await dumpCollections(WORK), step).toEqual(work);
    expect(await profilesWithoutTeam(), step).toEqual(profiles);
  };

  it("takes stock first", async () => {
    views = await pledgeViews();
    work = await dumpCollections(WORK);
    profiles = await profilesWithoutTeam();
    expect(Object.keys(work).length).toBeGreaterThan(20);
  });

  it("creating a team with members alters none of their responses, drafts or punishments", async () => {
    cedar = ok<{ team: TeamDto }>(await asAdmin(createTeam, {}, "POST", { name: "Team Cedar", memberUids: [sam.uid, jordan.uid] })).team.id;
    expect((await docData(`users/${jordan.uid}`))?.teamId).toBe(cedar);
    await unchanged("create");
  });

  it("renaming it and choosing its members again alters none", async () => {
    ok(await asAdmin(updateTeam, { teamId: cedar }, "PATCH", { name: "Team Cypress" }));
    await unchanged("rename");
    ok(await asAdmin(updateTeam, { teamId: cedar }, "PATCH", { name: "Team Cedar", memberUids: [sam.uid, maya.uid] }));
    expect((await docData(`users/${maya.uid}`))?.teamId).toBe(cedar);
    expect((await docData(`users/${jordan.uid}`))?.teamId).toBeNull();
    await unchanged("re-form");
    ok(await asAdmin(updateTeam, { teamId: cedar }, "PATCH", { memberUids: [] }));
    await unchanged("empty");
  });

  it("moving single pledges between teams, and off them, alters none", async () => {
    for (const teamId of [cedar, boreal, TEAM_ATLAS, null, cedar]) {
      ok(await asAdmin(updatePledge, { uid: avery.uid }, "PATCH", { teamId }));
      await unchanged(`move to ${String(teamId)}`);
    }
    ok(await asAdmin(updatePledge, { uid: jordan.uid }, "PATCH", { teamId: cedar }));
    await unchanged("move teammate");
  });

  it("shows each pledge exactly the same work as before, whichever team they are on now", async () => {
    expect(await pledgeViews()).toBe(views);
    // Avery and Jordan are on Team Cedar together now, and still read nothing of each other's.
    expect(ok<MeDto>(await call(getMe, {}, { token: avery.token })).team).toEqual({ name: "Team Cedar", teammates: ["Jordan Patel"] });
    for (const [session, teammate] of [
      [avery, "Jordan Patel"],
      [jordan, "Avery Chen"],
    ] as const) {
      for (const [label, result] of await everyRead(session)) {
        const found = label === "GET /me" ? leaksIn(result.text, session, [teammate], ["Team Cedar"]) : leaksIn(result.text, session);
        expect(found, label).toEqual([]);
      }
    }
  });

  it("deleting teams alters none, and leaves every former member with all their work", async () => {
    for (const teamId of [cedar, boreal, TEAM_ATLAS]) {
      ok(await asAdmin(deleteTeam, { teamId }, "DELETE"));
      await unchanged(`delete ${teamId}`);
    }
    expect(await countAll("teams")).toBe(0);
    expect(await countWhere("users", "role", "pledge")).toBe(6);
    expect(await pledgeViews()).toBe(views);
    for (const session of [avery, jordan, maya, sam]) {
      expect(await countWhere("punishments", "uid", session.uid)).toBeGreaterThanOrEqual(1);
      expect(await countWhere("submissions", "uid", session.uid)).toBeGreaterThanOrEqual(1);
    }
  });

  it("leaves no pledge able to see another's name once there are no teams", async () => {
    for (const session of [avery, jordan, maya, sam]) {
      expect(ok<MeDto>(await call(getMe, {}, { token: session.token })).team).toBeNull();
      for (const [label, result] of await everyRead(session)) {
        expect(leaksIn(result.text, session), label).toEqual([]);
        expect(result.text, label).not.toMatch(/Atlas|Boreal|Cedar/);
      }
    }
  });
});

// An admin can put any pledge or active back on a temporary password. Until the person has
// replaced it, the account reads nothing: not the pledges' work, and not its own.
describe("an account on a temporary password reads nothing, its own work included", () => {
  const CHANGE_REQUIRED = "Choose your own password to continue.";
  let before: Awaited<ReturnType<typeof dumpPortal>>;
  const EXPIRED = "That temporary password has expired. Ask an admin for a new one.";
  /** Maya, who has responses, a draft and a punishment of her own, and Priya, who can read every pledge's work. */
  let mayaOnTemporary: Session;
  let priyaOnTemporary: Session;
  /** What each was handed, by email. */
  let temporaryPasswords: Record<string, string> = {};

  function expectNothing(label: string, result: ApiResult, viewer: Session, because: "password_change_required" | "temporary_password_expired" = "password_change_required"): void {
    const body = refused(result, 403, because);
    expect(body.error, label).toBe(because === "password_change_required" ? CHANGE_REQUIRED : EXPIRED);
    expect(Object.keys(result.body as object).sort(), label).toEqual(["code", "error"]);
    expect(leaksIn(result.text, viewer), label).toEqual([]);
    // Nor anything of the caller's own.
    const own = personOf(viewer.uid);
    for (const [what, secret] of own.secrets) expect(result.text, `${label}: their own ${what}`).not.toContain(secret);
    for (const value of [own.email, own.uid, own.name]) expect(result.text, label).not.toContain(value);
  }

  it(
    "starts with both able to read what is theirs, and an admin putting each on a temporary password",
    async () => {
      const mine = personOf(maya.uid);
      const reads = (await everyRead(maya)).map(([, result]) => result.text).join("\n");
      for (const [what, secret] of mine.secrets.slice(0, 4)) expect(reads, `own ${what}`).toContain(secret);
      expect(ok<ReviewOverviewDto>(await call(getReviewOverview, {}, { token: priya.token })).pledges.map((pledge) => pledge.displayName)).toContain("Avery Chen");

      const forMaya = ok<TemporaryPasswordDto>(await asAdmin(issuePledgePassword, { uid: maya.uid }, "POST")).temporaryPassword;
      const forPriya = ok<TemporaryPasswordDto>(await asAdmin(issueActivePassword, { uid: priya.uid }, "POST")).temporaryPassword;
      temporaryPasswords = { [MAYA]: forMaya, [PRIYA]: forPriya };
      mayaOnTemporary = await signIn(MAYA, forMaya);
      priyaOnTemporary = await signIn(PRIYA, forPriya);
      expect(claimsOf(mayaOnTemporary.token)).toMatchObject({ role: "pledge", issued: MAYA, temp: true });
      expect(claimsOf(priyaOnTemporary.token)).toMatchObject({ role: "active", issued: PRIYA, temp: true });
      // Each profile now carries a fingerprint of the password, which is one more thing nobody is to be sent.
      for (const uid of [maya.uid, priya.uid]) expect(await storedFingerprint(uid)).toEqual(A_KEPT_FINGERPRINT);
      before = await dumpPortal();
    },
    SLOW_TEST_MS,
  );

  it("refuses the pledge every read a pledge has: who they are, the dashboard, every deliverable, their history and every response", async () => {
    const reads = await everyRead(mayaOnTemporary);
    expect(reads).toHaveLength(15);
    for (const [label, result] of reads) expectNothing(label, result, mayaOnTemporary);
  });

  it("refuses the pledge every change a pledge can make, and stores none of it", async () => {
    const token = mayaOnTemporary.token;
    const answers = { q_insight1: { kind: "text", value: PLANTED_ANSWER } };
    const writes: Array<[string, ApiResult]> = [
      ["PUT /forms/week2synthesis/draft", await call(putDraft, { formId: "week2synthesis" }, { method: "PUT", token, body: { answers } })],
      ["POST /forms/week2synthesis/submit", await call(submit, { formId: "week2synthesis" }, { method: "POST", token, body: { answers } })],
      ["POST /heartbeat", await call(heartbeat, {}, { method: "POST", token, body: { formId: "week2synthesis", resume: true } })],
      ["POST /onboarding", await call(completeOnboarding, {}, { method: "POST", token })],
    ];
    for (const [label, result] of writes) expectNothing(label, result, mayaOnTemporary);
    expect(JSON.stringify(await docData(`drafts/week2synthesis_${maya.uid}`))).not.toContain(PLANTED_ANSWER);
    expect(await docExists(`submissions/week2synthesis_${maya.uid}`)).toBe(false);
  });

  it("refuses the active every read an active has: the overview, and every deliverable", async () => {
    const token = priyaOnTemporary.token;
    const reads: Array<[string, ApiResult]> = [
      ["GET /me", await call(getMe, {}, { token })],
      ["GET /review/overview", await call(getReviewOverview, {}, { token })],
    ];
    for (const formId of FORM_IDS) reads.push([`GET /review/forms/${formId}`, await call(getReviewForm, { formId }, { token })]);
    expect(reads).toHaveLength(8);
    for (const [label, result] of reads) {
      expectNothing(label, result, priyaOnTemporary);
      // Not one pledge's name, which is the least a review response carries.
      expect(result.text, label).not.toMatch(/Avery|Jordan|Maya|Sam Okafor|Casey/);
    }
  });

  it("refuses each of them the other roles' reads in the same words, so the refusal says nothing about what exists", async () => {
    const formId = "week0onboarding";
    for (const viewer of [mayaOnTemporary, priyaOnTemporary]) {
      const token = viewer.token;
      const reads: Array<[string, ApiResult]> = [
        ["GET /dashboard", await call(getDashboard, {}, { token })],
        ["GET /forms/[formId]", await call(getForm, { formId }, { token })],
        ["GET /submissions", await call(listSubmissions, {}, { token })],
        ["GET /submissions/[formId]", await call(getSubmission, { formId }, { token })],
        ["GET /review/overview", await call(getReviewOverview, {}, { token })],
        ["GET /review/forms/[formId]", await call(getReviewForm, { formId }, { token })],
        ["GET /admin/pledges", await call(getOverview, {}, { token })],
        ["GET /admin/forms/[formId]/responses", await call(getResponses, { formId }, { token })],
        ["GET /forms/[formId] for a deliverable that does not exist", await call(getForm, { formId: "doesnotexist" }, { token })],
        ["GET /forms/[formId] with an id that could not be one", await call(getForm, { formId: "../x" }, { token })],
      ];
      for (const [label, result] of reads) expectNothing(label, result, viewer);
      // One answer for all of them, byte for byte.
      expect(new Set(reads.map(([, result]) => result.text)).size).toBe(1);
    }
  });

  it("changed nothing with any of that: no draft was opened, no visit recorded, nobody welcomed", async () => {
    const after = await dumpPortal();
    expect(after.accounts).toEqual(before.accounts);
    expect(after.firestore).toEqual(before.firestore);
    expect(JSON.stringify(after)).not.toContain(PLANTED_ANSWER);
  });

  it("sent neither of them anything of the fingerprint kept of their temporary password, or of anyone's", async () => {
    const kept = await everyStoredFingerprint();
    // A salt and a hash for each of the two.
    expect(kept).toHaveLength(4);
    const reads: Array<[string, ApiResult]> = [...(await everyRead(mayaOnTemporary)), ...(await everyRead(priyaOnTemporary))];
    // And what an admin reads of the two of them, which is built from the profiles the fingerprints are on.
    reads.push(["GET /admin/pledges", await call(getOverview, {}, { token: admin.token })]);
    reads.push(["GET /admin/forms/[formId]/responses", await call(getResponses, { formId: "week0onboarding" }, { token: admin.token })]);
    for (const [label, result] of reads) {
      for (const value of kept) expect(result.text.includes(value), `${label}: a stored salt or hash`).toBe(false);
      for (const password of Object.values(temporaryPasswords)) expect(result.text.toUpperCase(), label).not.toContain(password);
      expect(result.text, label).not.toMatch(/temporaryPassword|"salt"|"hash"/);
    }
  });

  // Three days on, the temporary password stops working. The account is then told so, in
  // other words than before, and is still sent nothing: not its own work, and not which
  // routes or deliverables exist.
  it(
    "reads nothing once the temporary password has run out either, on any route, the one for replacing it included",
    async () => {
      for (const uid of [maya.uid, priya.uid]) await issueTemporaryPasswordAgo(uid, TEMPORARY_PASSWORD_MS + 60_000);
      const mayaLate = await signIn(MAYA, temporaryPasswords[MAYA]);
      const priyaLate = await signIn(PRIYA, temporaryPasswords[PRIYA]);
      const stock = await dumpPortal();

      for (const viewer of [mayaLate, priyaLate]) {
        const token = viewer.token;
        const formId = "week0onboarding";
        const answers = { q_insight1: { kind: "text", value: PLANTED_ANSWER } };
        const calls: Array<[string, ApiResult]> = [
          ...(await everyRead(viewer)),
          ["GET /review/overview", await call(getReviewOverview, {}, { token })],
          ["GET /review/forms/[formId]", await call(getReviewForm, { formId }, { token })],
          ["GET /admin/pledges", await call(getOverview, {}, { token })],
          ["GET /admin/forms/[formId]/responses", await call(getResponses, { formId }, { token })],
          ["GET /forms/[formId] for a deliverable that does not exist", await call(getForm, { formId: "doesnotexist" }, { token })],
          ["PUT /forms/week2synthesis/draft", await call(putDraft, { formId: "week2synthesis" }, { method: "PUT", token, body: { answers } })],
          ["POST /forms/week2synthesis/submit", await call(submit, { formId: "week2synthesis" }, { method: "POST", token, body: { answers } })],
          ["POST /heartbeat", await call(heartbeat, {}, { method: "POST", token, body: { formId: "week2synthesis", resume: true } })],
          ["POST /onboarding", await call(completeOnboarding, {}, { method: "POST", token })],
          ["POST /password", await call(choosePassword, {}, { method: "POST", token, body: { password: OWN_PASSWORD } })],
        ];
        expect(calls.length).toBeGreaterThanOrEqual(25);
        for (const [label, result] of calls) expectNothing(label, result, viewer, "temporary_password_expired");
        // One answer for all of them, byte for byte: nothing in it says what was asked for.
        expect(new Set(calls.map(([, result]) => result.text)).size).toBe(1);
      }

      // Nothing was stored, chosen or recorded.
      expect(await dumpPortal()).toEqual(stock);
      expect(JSON.stringify(stock)).not.toContain(PLANTED_ANSWER);
      for (const email of [MAYA, PRIYA]) expect(await signInFailure(email, OWN_PASSWORD)).toMatch(/INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS/);

      // The three days are put back as they were, for what follows.
      for (const uid of [maya.uid, priya.uid]) {
        await issueTemporaryPasswordAgo(uid, 0);
        expect(await storedClaims(uid)).toMatchObject({ temp: true });
      }
    },
    SLOW_TEST_MS,
  );

  it(
    "gives each of them their reading back once they have chosen a password of their own",
    async () => {
      for (const session of [mayaOnTemporary, priyaOnTemporary]) {
        expect(ok(await call(choosePassword, {}, { method: "POST", token: session.token, body: { password: OWN_PASSWORD } }))).toEqual({ ok: true });
      }
      [maya, priya] = await Promise.all([signIn(MAYA, OWN_PASSWORD), signIn(PRIYA, OWN_PASSWORD)]);

      const mine = personOf(maya.uid);
      const reads = await everyRead(maya);
      const text = reads.map(([, result]) => result.text).join("\n");
      for (const [what, secret] of mine.secrets.slice(0, 4)) expect(text, `own ${what}`).toContain(secret);
      // Her own again, and still nobody else's.
      for (const [label, result] of reads) expect(leaksIn(result.text, maya), label).toEqual([]);

      const overview = ok<ReviewOverviewDto>(await call(getReviewOverview, {}, { token: priya.token }));
      expect(overview.pledges.map((pledge) => pledge.displayName)).toEqual(expect.arrayContaining(["Avery Chen", "Maya Rodriguez", "Sam Okafor"]));
      ok(await call(getReviewForm, { formId: "week0onboarding" }, { token: priya.token }));
    },
    SLOW_TEST_MS,
  );
});
