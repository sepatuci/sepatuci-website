/**
 * What an active member may read: the pledges' work, and nothing else.
 *
 * The two review routes are checked three ways. Their shape: every object has
 * exactly the keys it is meant to have, at every level. Their text: everything
 * they send is searched, as raw text, for each thing an active must never be
 * sent, and the same search is shown to find those things in what an admin is
 * sent. Their values: every figure is worked out again from the admin's data.
 *
 * On top of the seed this file adds a deliverable that was archived after Sam
 * turned it in, one that is published but not visible yet, a draft of Sam's,
 * and a marker in the response of Riley, whose account is disabled. The tests
 * run in order: everything that only reads comes first.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getAudit } from "@/app/api/portal/admin/audit/route";
import { GET as getResponses } from "@/app/api/portal/admin/forms/[formId]/responses/route";
import { GET as getAdminForm, PUT as putAdminForm } from "@/app/api/portal/admin/forms/[formId]/route";
import { GET as listAdminForms, POST as createForm } from "@/app/api/portal/admin/forms/route";
import { GET as getPledgeDetail, PATCH as updatePledge } from "@/app/api/portal/admin/pledges/[uid]/route";
import { GET as getOverview, POST as createPledge } from "@/app/api/portal/admin/pledges/route";
import { PUT as putDraft } from "@/app/api/portal/forms/[formId]/draft/route";
import { GET as getForm } from "@/app/api/portal/forms/[formId]/route";
import { POST as submit } from "@/app/api/portal/forms/[formId]/submit/route";
import { GET as getReviewForm } from "@/app/api/portal/review/forms/[formId]/route";
import { GET as getReviewOverview } from "@/app/api/portal/review/overview/route";
import { isReleased, type FormLike } from "@/lib/portal/form-state";
import { standingFor } from "@/lib/portal/progress";
import { resetRateLimits } from "@/lib/portal/server/rate-limit";
import type {
  AdminFormDto,
  AdminOverviewDto,
  CreatePledgeResultDto,
  FormDefinition,
  FormResponsesDto,
  PledgeFormDto,
  Question,
  ReviewFormDto,
  ReviewOverviewDto,
  ReviewPledgeDto,
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
  SEED_TIMEOUT_MS,
  SLOW_TEST_MS,
  TEAM_ATLAS,
  TEAM_ATLAS_NAME,
  TEMPORARY_PASSWORD,
  call,
  createAccount,
  docData,
  dumpPortal,
  everyStoredFingerprint,
  fingerprintLeak,
  ok,
  refused,
  seedPortal,
  signIn,
  storedFingerprint,
  testDb,
  uidOf,
  type ApiResult,
  type Handler,
  type Session,
} from "./helpers";

const DAY = 86_400_000;
const sorted = (value: object): string[] => Object.keys(value).sort();

// ── The exact shapes ─────────────────────────────────────────────────────────

const OVERVIEW_KEYS = ["forms", "pledges", "serverNow"];
const OVERVIEW_FORM_KEYS = ["allowLate", "closesAt", "dueAt", "id", "opensAt", "questionCount", "responseCount", "title"];
const OVERVIEW_PLEDGE_KEYS = ["byForm", "displayName", "progress", "teamName", "uid"];
const PROGRESS_KEYS = ["completionPct", "late", "missed", "onTime", "outstanding", "released", "submitted", "total", "upcoming"];
const CELL_KEYS = ["late", "state", "submittedAt"];
const FORM_VIEW_KEYS = ["form", "notTurnedIn", "responses", "serverNow"];
const FORM_KEYS = ["allowLate", "closesAt", "description", "dueAt", "id", "opensAt", "questions", "title"];
const RESPONSE_KEYS = ["answers", "displayName", "late", "lateBySeconds", "questions", "submittedAt", "teamName", "uid"];
const NOT_TURNED_IN_KEYS = ["displayName", "state", "teamName", "uid"];

/** The seeded deliverables an active may see, in the order they are due. */
const RELEASED = ["week0onboarding", "week1reflection", "week2interviews", "week2synthesis", "week3mvpscope"];
/** Published and visible, but not open: its questions are not shown to anyone yet. */
const NOT_OPEN_YET = "week3mvpscope";
const SEEDED_DRAFT = "pitchfeedback";
const NOT_AVAILABLE = { error: "That deliverable isn't available.", code: "not_found" };

// ── Things planted so that the search has something to find ──────────────────

const DRAFT_ANSWER = "MARK-DRAFT-SAM-58231";
const DISABLED_PLEDGES_ANSWER = "MARK-RESPONSE-RILEY-58231";
const ARCHIVED_TITLE = "Archived Retro 58231";
const ARCHIVED_DESCRIPTION = "Description of the archived retro 58231";
const ARCHIVED_ANSWER = "MARK-ARCHIVED-ANSWER-58231";
const FUTURE_TITLE = "Unannounced Demo Day 58231";
const FUTURE_QUESTION = "Unannounced question 58231";
const LATE_JOINER = "late.joiner@uci.edu";

const oneQuestion = (title: string): Question[] => [
  { id: "q_only", type: "short_text", title, description: "", required: true, validation: "none" },
];

/** Keys that belong to an admin's or a pledge's own view, and to no review response. */
const BANNED_KEYS = [
  "email",
  "teamId",
  "pledgeClass",
  "status",
  "signInBlocked",
  "accountState",
  "createdAt",
  "lastSignInAt",
  "onboardedAt",
  "activity",
  "sessions",
  "sessionCount",
  "totalActiveSeconds",
  "firstSeenAt",
  "lastSeenAt",
  "punishments",
  "activePunishments",
  "startedAt",
  "durationSeconds",
  "activeSeconds",
  "draft",
  "draftUpdatedAt",
  "version",
  "formVersion",
  "visibleAt",
  "prerequisiteFormId",
  "confirmationMessage",
  "settings",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "role",
  "entries",
  "actorEmail",
  "actorUid",
  "teams",
  "memberCount",
];

const SEEDED_EMAILS = [ADMIN_ONE, ADMIN_TWO, PRIYA, MARCUS, DANA, AVERY, JORDAN, MAYA, SAM, RILEY, CASEY];

let admin: Session;
let priya: Session;
let sam: Session;
let avery: Session;
let uids: Record<string, string>;
let archivedId: string;
let futureId: string;
/** Text that must never reach an active, each with what it is. Filled in once the fixtures exist. */
let secrets: Array<[string, string]>;

/**
 * Everything in `text` that an active must never be sent. Used on the review
 * responses, where it must find nothing, and on admin responses, where it must
 * find all of it.
 */
function forbiddenIn(text: string): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const email of [...SEEDED_EMAILS, LATE_JOINER]) {
    if (lower.includes(email)) found.push(`the email ${email}`);
  }
  if (/[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(text)) found.push("an email address");
  for (const [what, secret] of secrets) {
    if (text.includes(secret)) found.push(what);
  }
  for (const key of BANNED_KEYS) {
    if (text.includes(`"${key}":`)) found.push(`the key "${key}"`);
  }
  return found;
}

/** A read of a review route, as Priya unless another session is given. */
const asActive = <P extends Record<string, string>>(handler: Handler<P>, params: P, session: Session = priya): Promise<ApiResult> =>
  call(handler, params, { token: session.token });

const reviewOverview = async (): Promise<ReviewOverviewDto> => ok<ReviewOverviewDto>(await asActive(getReviewOverview, {}));
const reviewForm = async (formId: string): Promise<ReviewFormDto> => ok<ReviewFormDto>(await asActive(getReviewForm, { formId }));
const adminOverview = async (): Promise<AdminOverviewDto> => ok<AdminOverviewDto>(await call(getOverview, {}, { token: admin.token }));
const adminForm = async (formId: string): Promise<AdminFormDto> =>
  ok<AdminFormDto>(await call(getAdminForm, { formId }, { token: admin.token }));
const adminResponses = async (formId: string): Promise<FormResponsesDto> =>
  ok<FormResponsesDto>(await call(getResponses, { formId }, { token: admin.token }));

/** Saves a deliverable as an admin does: the definition as read, with changes, at the version it was read at. */
async function editForm(formId: string, changes: (form: AdminFormDto) => Partial<FormDefinition>): Promise<AdminFormDto> {
  const form = await adminForm(formId);
  const body = {
    title: form.title,
    description: form.description,
    status: form.status,
    questions: form.questions,
    settings: form.settings,
    ...changes(form),
    expectedVersion: form.version,
  };
  return ok<AdminFormDto>(await call(putAdminForm, { formId }, { method: "PUT", token: admin.token, body }));
}

async function newForm(definition: (form: AdminFormDto) => Partial<FormDefinition>): Promise<string> {
  const { id } = ok<{ id: string }>(await call(createForm, {}, { method: "POST", token: admin.token }));
  await editForm(id, definition);
  return id;
}

/** The released deliverables, worked out from what an admin is shown and nothing an active is sent. */
function releasedFrom(overview: AdminOverviewDto, nowMs: number): FormLike[] {
  return overview.forms
    .filter((form) => form.status === "published" && isReleased(form.settings, nowMs))
    .map((form) => ({ id: form.id, title: form.title, status: form.status, settings: form.settings }));
}

/** Checks every cell and every total of the review overview against the admin's data for the same pledges. */
async function expectOverviewToMatchTheAdmins(): Promise<{ review: ReviewOverviewDto; admins: AdminOverviewDto }> {
  const review = await reviewOverview();
  const admins = await adminOverview();
  const nowMs = Date.parse(review.serverNow);
  const released = releasedFrom(admins, nowMs);
  const releasedIds = released.map((form) => form.id).sort();
  expect(review.forms.map((form) => form.id).sort()).toEqual(releasedIds);

  const expectedPledges = admins.pledges.filter((pledge) => pledge.status !== "disabled");
  expect(review.pledges.map((pledge) => pledge.uid).sort()).toEqual(expectedPledges.map((pledge) => pledge.uid).sort());

  for (const pledge of review.pledges) {
    const row = admins.pledges.find((candidate) => candidate.uid === pledge.uid);
    if (!row) throw new Error(`${pledge.displayName} is in the review overview and not in the admin's.`);
    const standing = standingFor({ submitted: row.submitted, createdAt: row.createdAt }, released, nowMs);

    expect(sorted(pledge.byForm), pledge.displayName).toEqual(releasedIds);
    for (const formId of releasedIds) {
      expect(pledge.byForm[formId], `${pledge.displayName} on ${formId}`).toEqual({
        state: standing.byForm[formId].state,
        late: standing.byForm[formId].late,
        submittedAt: row.submitted[formId]?.submittedAt ?? null,
      });
    }
    expect(pledge.progress, pledge.displayName).toEqual(standing.progress);
    expect(pledge.displayName).toBe(row.displayName);
    const team = admins.teams.find((candidate) => candidate.id === row.teamId);
    expect(pledge.teamName, pledge.displayName).toBe(team?.name ?? null);
  }
  return { review, admins };
}

beforeAll(async () => {
  await seedPortal();
  [admin, priya, sam, avery] = await Promise.all([ADMIN_ONE, PRIYA, SAM, AVERY].map((email) => signIn(email)));
  uids = Object.fromEntries(await Promise.all(SEEDED_EMAILS.map(async (email) => [email, await uidOf(email)] as const)));

  // A deliverable that was published, turned in by Sam, and then archived.
  archivedId = await newForm(() => ({
    title: ARCHIVED_TITLE,
    description: ARCHIVED_DESCRIPTION,
    status: "published",
    questions: oneQuestion("Archived question 58231"),
  }));
  ok(
    await call(submit, { formId: archivedId }, {
      method: "POST",
      token: sam.token,
      body: {
        answers: { q_only: { kind: "text", value: ARCHIVED_ANSWER } },
        formVersion: (await adminForm(archivedId)).questionsVersion,
      },
    }),
  );
  await editForm(archivedId, () => ({ status: "archived" }));

  // One that is published and will appear on dashboards in two days.
  futureId = await newForm((form) => ({
    title: FUTURE_TITLE,
    status: "published",
    questions: oneQuestion(FUTURE_QUESTION),
    settings: { ...form.settings, visibleAt: new Date(Date.now() + 2 * DAY).toISOString() },
  }));

  // A draft of Sam's, saved the way a pledge saves one.
  ok(
    await call(putDraft, { formId: "week2interviews" }, {
      method: "PUT",
      token: sam.token,
      body: { answers: { q_surprise: { kind: "text", value: DRAFT_ANSWER } } },
    }),
  );

  // Riley's account is disabled. Their one response is marked, so it can be told from anyone else's.
  await testDb().doc(`submissions/week0onboarding_${uids[RILEY]}`).update({ "answers.q_major.value": DISABLED_PLEDGES_ANSWER });

  secrets = [
    ["a draft answer", DRAFT_ANSWER],
    ["the disabled pledge's response", DISABLED_PLEDGES_ANSWER],
    ["the disabled pledge's name", "Riley Nguyen"],
    ["the disabled pledge's uid", uids[RILEY]],
    ["a punishment title", "Missed the Week 1 deliverable"],
    ["a punishment's details", "Present your founder reflection to the class"],
    ["a resolved punishment's title", "Late onboarding survey"],
    ["a resolved punishment's details", "Set up the room before the Week 1 session"],
    ["the draft deliverable's title", "Pitch Night Feedback"],
    ["the draft deliverable's description", "Not visible to new members yet"],
    ["a question of the draft deliverable", "How did your pitch go?"],
    ["the draft deliverable's id", SEEDED_DRAFT],
    ["the archived deliverable's title", ARCHIVED_TITLE],
    ["the archived deliverable's description", ARCHIVED_DESCRIPTION],
    ["a response to the archived deliverable", ARCHIVED_ANSWER],
    ["the archived deliverable's id", archivedId],
    ["the unreleased deliverable's title", FUTURE_TITLE],
    ["a question of the unreleased deliverable", FUTURE_QUESTION],
    ["the unreleased deliverable's id", futureId],
    ["a confirmation message", "Welcome to Founder's Education"],
    ["a pledge class", "Lambda"],
    ["a team id", TEAM_ATLAS],
    ["an admin's name", "Demo Chair"],
    ["an admin's uid", uids[ADMIN_ONE]],
    ["the other admin's uid", uids[ADMIN_TWO]],
    ["an active's name", "Priya Shah"],
    ["an invited active's name", "Marcus Lee"],
    ["a disabled active's name", "Dana Ortiz"],
    ["an active's uid", uids[PRIYA]],
    ["an invited active's uid", uids[MARCUS]],
    ["a disabled active's uid", uids[DANA]],
  ];
  resetRateLimits();
}, SEED_TIMEOUT_MS);

beforeEach(() => {
  resetRateLimits();
});

/** Every response the review API gives an active: the overview, each released deliverable, and each refusal. */
async function everyReviewResponse(): Promise<Array<[string, ApiResult]>> {
  const responses: Array<[string, ApiResult]> = [["GET /review/overview", await asActive(getReviewOverview, {})]];
  for (const formId of [...RELEASED, SEEDED_DRAFT, archivedId, futureId, "doesnotexist"]) {
    responses.push([`GET /review/forms/${formId}`, await asActive(getReviewForm, { formId })]);
  }
  return responses;
}

describe("the fixtures", () => {
  it("are really stored: the draft, the archived deliverable and its response, the unreleased one, the disabled pledge's response", async () => {
    expect(JSON.stringify(await docData(`drafts/week2interviews_${uids[SAM]}`))).toContain(DRAFT_ANSWER);
    expect(await docData(`forms/${archivedId}`)).toMatchObject({ title: ARCHIVED_TITLE, status: "archived" });
    expect(JSON.stringify(await docData(`submissions/${archivedId}_${uids[SAM]}`))).toContain(ARCHIVED_ANSWER);
    expect(await docData(`forms/${futureId}`)).toMatchObject({ title: FUTURE_TITLE, status: "published" });
    expect(await docData(`forms/${SEEDED_DRAFT}`)).toMatchObject({ title: "Pitch Night Feedback", status: "draft" });
    expect(JSON.stringify(await docData(`submissions/week0onboarding_${uids[RILEY]}`))).toContain(DISABLED_PLEDGES_ANSWER);
    expect(await docData(`users/${uids[RILEY]}`)).toMatchObject({ status: "disabled", role: "pledge" });
  });

  it("can be found by the search: what an admin is sent contains every one of them", async () => {
    const sent = [
      await call(getOverview, {}, { token: admin.token }),
      await call(listAdminForms, {}, { token: admin.token }),
      await call(getAudit, {}, { token: admin.token }),
      await call(getPledgeDetail, { uid: uids[SAM] }, { token: admin.token }),
      await call(getPledgeDetail, { uid: uids[JORDAN] }, { token: admin.token }),
      await call(getResponses, { formId: "week0onboarding" }, { token: admin.token }),
      await call(getResponses, { formId: archivedId }, { token: admin.token }),
      await call(getAdminForm, { formId: SEEDED_DRAFT }, { token: admin.token }),
      await call(getAdminForm, { formId: futureId }, { token: admin.token }),
    ];
    for (const result of sent) expect(result.status).toBe(200);
    const found = forbiddenIn(sent.map((result) => result.text).join("\n"));

    for (const email of [ADMIN_ONE, AVERY, JORDAN, MAYA, SAM, RILEY, CASEY]) expect(found).toContain(`the email ${email}`);
    expect(found).toContain("an email address");
    // No admin response carries a draft, or says who the admins and the actives are by name
    // or uid: those are searched for in the pledge's own view and in what is stored, below.
    const elsewhere = /^a draft answer$|admin's|active's/;
    const sentToAdmins = secrets.filter(([what]) => !elsewhere.test(what)).map(([what]) => what);
    expect(sentToAdmins).toHaveLength(21);
    for (const what of sentToAdmins) expect(found, what).toContain(what);
    const keysElsewhere = ["draft", "draftUpdatedAt", "role", "updatedBy", "createdBy", "actorUid"];
    for (const key of BANNED_KEYS.filter((candidate) => !keysElsewhere.includes(candidate))) {
      expect(found, key).toContain(`the key "${key}"`);
    }
  });

  it("can be found by the search in a pledge's own view too: the draft, and the keys that go with it", async () => {
    const own = await call(getForm, { formId: "week2interviews" }, { token: sam.token });
    expect(ok<PledgeFormDto>(own).draft?.answers).toEqual({ q_surprise: { kind: "text", value: DRAFT_ANSWER } });
    const found = forbiddenIn(own.text);
    expect(found).toContain("a draft answer");
    expect(found).toContain('the key "draft"');
    expect(found).toContain('the key "draftUpdatedAt"');
    expect(found).toContain('the key "version"');
  });

  it("can be found by the search in what is stored about the actives and the admins", async () => {
    const stored = JSON.stringify(await dumpPortal());
    const found = forbiddenIn(stored);
    for (const email of SEEDED_EMAILS) expect(found).toContain(`the email ${email}`);
    for (const [what] of secrets) expect(found, what).toContain(what);
    for (const key of ["role", "createdBy", "updatedBy", "actorUid"]) expect(found).toContain(`the key "${key}"`);
  });
});

describe("who may read the review routes", () => {
  it("lets an active read the overview and a deliverable", async () => {
    ok(await asActive(getReviewOverview, {}));
    ok(await asActive(getReviewForm, { formId: "week0onboarding" }));
  });

  it("refuses an admin and a pledge, on both routes, with the same words as any route that is not theirs", async () => {
    for (const session of [admin, sam, avery]) {
      for (const result of [await asActive(getReviewOverview, {}, session), await asActive(getReviewForm, { formId: "week0onboarding" }, session)]) {
        const body = refused(result, 403, "forbidden");
        expect(body.error).toBe("You don't have permission to do that.");
        expect(sorted(result.body as object)).toEqual(["code", "error"]);
        expect(result.text).not.toContain("Avery Chen");
      }
    }
  });

  it("refuses a request with no sign-in at all", async () => {
    refused(await call(getReviewOverview, {}, {}), 401, "unauthenticated");
    refused(await call(getReviewForm, { formId: "week0onboarding" }, {}), 401, "unauthenticated");
  });

  it("sends nothing that a browser or a proxy may keep", async () => {
    for (const result of [await asActive(getReviewOverview, {}), await asActive(getReviewForm, { formId: "week0onboarding" }), await asActive(getReviewForm, { formId: SEEDED_DRAFT })]) {
      expect(result.headers.get("cache-control")).toBe("no-store");
      expect(result.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });

  // The sign-in says "active". Before any pledge's work is sent, the account's profile has
  // to say so too: that it exists, is an active's, is not disabled, and is for this address.
  describe("when the profile does not back the sign-in", () => {
    const NOT_ALLOWED = { error: "This account doesn't have access to the portal.", code: "email_not_allowed" };

    /** Both routes, for a deliverable that is released, one that is a draft, and one that does not exist. */
    async function expectNothing(session: Session, label: string): Promise<void> {
      const results = [
        await asActive(getReviewOverview, {}, session),
        await asActive(getReviewForm, { formId: "week0onboarding" }, session),
        await asActive(getReviewForm, { formId: SEEDED_DRAFT }, session),
        await asActive(getReviewForm, { formId: "doesnotexist" }, session),
      ];
      for (const result of results) {
        expect(result.status, label).toBe(403);
        expect(result.body, label).toEqual(NOT_ALLOWED);
        expect(forbiddenIn(result.text), label).toEqual([]);
        expect(result.text, label).not.toMatch(/Avery|Jordan|Maya|Okafor|Casey|Week \d|Atlas/);
        expect(result.headers.get("cache-control"), label).toBe("no-store");
      }
      // The same answer whether or not the deliverable exists: nothing is learned about any of them.
      expect(new Set(results.map((result) => result.text)).size, label).toBe(1);
    }

    it("refuses an account with the active role and no portal profile at all", async () => {
      const byHand = await createAccount("no.profile.reviewer@uci.edu", { claims: { role: "active" } });
      await expectNothing(byHand, "no issued address");
      // With the claims the portal itself writes, and still no profile.
      const asIssued = await createAccount("no.profile.issued@uci.edu", { claims: { role: "active", issued: "no.profile.issued@uci.edu" } });
      await expectNothing(asIssued, "issued address");
      expect(await docData(`users/${byHand.uid}`)).toBeNull();
      expect(await docData(`users/${asIssued.uid}`)).toBeNull();
    });

    it.each<[string, Record<string, unknown>]>([
      ["says they are a pledge", { role: "pledge" }],
      ["says they are an admin", { role: "admin" }],
      ["has a role the portal does not know", { role: "viewer" }],
      ["is disabled, though the sign-in still works", { status: "disabled" }],
      ["is for another address", { email: "someone.else@uci.edu" }],
      ["is for a pledge's address", { email: AVERY }],
      ["is for an admin's address", { email: ADMIN_ONE }],
    ])("refuses the seeded active while their profile %s, and lets them back in once it is put right", async (label, change) => {
      const ref = testDb().doc(`users/${priya.uid}`);
      const original = (await ref.get()).data();
      if (!original) throw new Error("Priya has no profile to change.");
      await ref.update(change);
      try {
        await expectNothing(priya, label);
      } finally {
        await ref.set(original);
      }
      expect(await docData(`users/${priya.uid}`)).toEqual(original);
      ok(await asActive(getReviewOverview, {}));
      ok(await asActive(getReviewForm, { formId: "week0onboarding" }));
    });

    it("refuses a pledge's profile under a sign-in that claims to be an active", async () => {
      // An account made by hand with the active role, and the profile a pledge would have.
      const session = await createAccount("claims.active.profile.pledge@uci.edu", { claims: { role: "active" } });
      const sams = (await testDb().doc(`users/${uids[SAM]}`).get()).data() ?? {};
      await testDb().doc(`users/${session.uid}`).set({ ...sams, email: session.email, displayName: "Not An Active", role: "pledge", submitted: {}, teamId: null });
      try {
        await expectNothing(session, "profile says pledge");
      } finally {
        await testDb().doc(`users/${session.uid}`).delete();
      }
    });

    it("goes by the address whatever its case, as the sign-in does", async () => {
      const ref = testDb().doc(`users/${priya.uid}`);
      await ref.update({ email: "Priya.Shah@UCI.EDU" });
      try {
        ok(await asActive(getReviewOverview, {}));
        ok(await asActive(getReviewForm, { formId: "week0onboarding" }));
      } finally {
        await ref.update({ email: PRIYA });
      }
    });

    it("left the pledges and the review as they were", async () => {
      await expectOverviewToMatchTheAdmins();
      expect((await reviewOverview()).pledges.map((pledge) => pledge.displayName)).toContain("Avery Chen");
    });
  });
});

describe("the overview", () => {
  it("has exactly the keys it is meant to have, at every level", async () => {
    const overview = await reviewOverview();
    expect(sorted(overview)).toEqual(OVERVIEW_KEYS);
    expect(overview.forms.length).toBeGreaterThan(0);
    expect(overview.pledges.length).toBeGreaterThan(0);
    for (const form of overview.forms) expect(sorted(form), form.id).toEqual(OVERVIEW_FORM_KEYS);
    for (const pledge of overview.pledges) {
      expect(sorted(pledge), pledge.displayName).toEqual(OVERVIEW_PLEDGE_KEYS);
      expect(sorted(pledge.progress), pledge.displayName).toEqual(PROGRESS_KEYS);
      expect(sorted(pledge.byForm), pledge.displayName).toEqual([...RELEASED].sort());
      for (const cell of Object.values(pledge.byForm)) expect(sorted(cell), pledge.displayName).toEqual(CELL_KEYS);
    }
  });

  it("lists the released deliverables in the order they are due, and no draft, archived or unreleased one", async () => {
    const overview = await reviewOverview();
    expect(overview.forms.map((form) => form.id)).toEqual(RELEASED);
    expect(overview.forms.map((form) => form.title)).toEqual([
      "Week 0: Onboarding Survey",
      "Week 1: Founder Reflection",
      "Week 2: Customer Discovery Interviews",
      "Week 2: Interview Synthesis",
      "Week 3: MVP Scope",
    ]);
    // Eight deliverables exist. An admin is shown all of them.
    expect((await adminOverview()).forms.map((form) => form.id).sort()).toEqual([...RELEASED, SEEDED_DRAFT, archivedId, futureId].sort());
  });

  it("gives each deliverable's schedule and counts as the admin's data has them", async () => {
    const overview = await reviewOverview();
    const admins = await adminOverview();
    for (const form of overview.forms) {
      const full = admins.forms.find((candidate) => candidate.id === form.id);
      if (!full) throw new Error(`${form.id} is not in the admin's overview.`);
      expect(form, form.id).toEqual({
        id: full.id,
        title: full.title,
        opensAt: full.settings.opensAt ?? full.settings.visibleAt,
        dueAt: full.settings.dueAt,
        closesAt: full.settings.closesAt,
        allowLate: full.settings.allowLate,
        questionCount: full.questionCount,
        responseCount: form.responseCount,
      });
    }
    expect(Object.fromEntries(overview.forms.map((form) => [form.id, form.questionCount]))).toEqual({
      week0onboarding: 4,
      week1reflection: 4,
      week2interviews: 5,
      week2synthesis: 4,
      week3mvpscope: 3,
    });
    expect(Date.parse(overview.serverNow)).toBeGreaterThan(Date.now() - 60_000);
  });

  it("counts the responses an active can read: the disabled pledge's is not among them", async () => {
    const overview = await reviewOverview();
    expect(Object.fromEntries(overview.forms.map((form) => [form.id, form.responseCount]))).toEqual({
      // Five pledges turned this in. One of them is disabled.
      week0onboarding: 4,
      week1reflection: 2,
      week2interviews: 2,
      week2synthesis: 0,
      week3mvpscope: 0,
    });
    expect((await adminOverview()).forms.find((form) => form.id === "week0onboarding")?.responseCount).toBe(5);
  });

  it("lists every pledge who can take part, by name, with their team's name", async () => {
    const overview = await reviewOverview();
    expect(overview.pledges.map((pledge) => [pledge.displayName, pledge.uid, pledge.teamName])).toEqual([
      ["Avery Chen", uids[AVERY], TEAM_ATLAS_NAME],
      ["Casey Kim", uids[CASEY], null],
      ["Jordan Patel", uids[JORDAN], TEAM_ATLAS_NAME],
      ["Maya Rodriguez", uids[MAYA], null],
      ["Sam Okafor", uids[SAM], null],
    ]);
  });

  it("leaves the disabled pledge out altogether", async () => {
    const result = await asActive(getReviewOverview, {});
    const overview = ok<ReviewOverviewDto>(result);
    expect(overview.pledges.map((pledge) => pledge.uid)).not.toContain(uids[RILEY]);
    expect(result.text).not.toContain("Riley");
    expect(result.text).not.toContain(uids[RILEY]);
    // An admin still sees them.
    expect((await adminOverview()).pledges.map((pledge) => pledge.uid)).toContain(uids[RILEY]);
  });

  it("shows a pledge who was invited and has never signed in, with nothing turned in", async () => {
    const casey = (await reviewOverview()).pledges.find((pledge) => pledge.uid === uids[CASEY]);
    expect(casey?.progress).toEqual({
      total: 5,
      released: 4,
      submitted: 0,
      onTime: 0,
      late: 0,
      missed: 1,
      outstanding: 3,
      upcoming: 1,
      completionPct: 0,
    });
    expect(casey?.byForm).toEqual({
      week0onboarding: { state: "open_late", late: true, submittedAt: null },
      week1reflection: { state: "missed", late: false, submittedAt: null },
      week2interviews: { state: "open", late: false, submittedAt: null },
      week2synthesis: { state: "locked", late: false, submittedAt: null },
      week3mvpscope: { state: "upcoming", late: false, submittedAt: null },
    });
  });

  it("shows what each of the others has turned in, on time or late", async () => {
    const overview = await reviewOverview();
    const of = (email: string): ReviewPledgeDto => {
      const pledge = overview.pledges.find((candidate) => candidate.uid === uids[email]);
      if (!pledge) throw new Error(`${email} is not in the overview.`);
      return pledge;
    };
    expect(of(AVERY).progress).toMatchObject({ total: 5, released: 4, submitted: 3, onTime: 3, late: 0, missed: 0, outstanding: 1, upcoming: 1, completionPct: 75 });
    expect(Object.fromEntries(Object.entries(of(AVERY).byForm).map(([id, cell]) => [id, cell.state]))).toEqual({
      week0onboarding: "submitted",
      week1reflection: "submitted",
      week2interviews: "submitted",
      week2synthesis: "open",
      week3mvpscope: "upcoming",
    });
    // Jordan turned the onboarding survey in three days late.
    expect(of(JORDAN).byForm.week0onboarding).toMatchObject({ state: "submitted", late: true });
    expect(of(JORDAN).progress).toMatchObject({ submitted: 2, onTime: 1, late: 1 });
    // Sam's response to the archived deliverable counts for nothing here: it is not one an active sees.
    expect(of(SAM).progress).toMatchObject({ total: 5, submitted: 1, missed: 1 });
    expect(sorted(of(SAM).byForm)).not.toContain(archivedId);
    for (const pledge of overview.pledges) {
      for (const [formId, cell] of Object.entries(pledge.byForm)) {
        if (cell.state === "submitted") expect(cell.submittedAt, `${pledge.displayName} ${formId}`).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        else expect(cell.submittedAt, `${pledge.displayName} ${formId}`).toBeNull();
      }
    }
  });

  it("gives every cell and every total exactly as standingFor works them out from the admin's data", async () => {
    const { review, admins } = await expectOverviewToMatchTheAdmins();
    // Not an empty comparison: five pledges, five deliverables each.
    expect(review.pledges).toHaveLength(5);
    expect(review.pledges.flatMap((pledge) => Object.keys(pledge.byForm))).toHaveLength(25);
    expect(admins.pledges).toHaveLength(6);
  });

  it("answers the same whatever the request asks for", async () => {
    const plain = await reviewOverview();
    const asked = ok<ReviewOverviewDto>(
      await call(getReviewOverview, {}, {
        token: priya.token,
        query: `?include=disabled,drafts&status=draft&uid=${uids[RILEY]}&role=admin&all=1`,
        headers: { "x-role": "admin", "x-uid": uids[ADMIN_ONE] },
      }),
    );
    expect({ ...asked, serverNow: "" }).toEqual({ ...plain, serverNow: "" });
  });
});

describe("one deliverable", () => {
  it("has exactly the keys it is meant to have, at every level", async () => {
    let responses = 0;
    let missing = 0;
    for (const formId of RELEASED) {
      const view = await reviewForm(formId);
      expect(sorted(view), formId).toEqual(FORM_VIEW_KEYS);
      expect(sorted(view.form), formId).toEqual(FORM_KEYS);
      for (const response of view.responses) expect(sorted(response), `${formId} ${response.displayName}`).toEqual(RESPONSE_KEYS);
      for (const pledge of view.notTurnedIn) expect(sorted(pledge), `${formId} ${pledge.displayName}`).toEqual(NOT_TURNED_IN_KEYS);
      responses += view.responses.length;
      missing += view.notTurnedIn.length;
    }
    expect(responses).toBe(8);
    expect(missing).toBeGreaterThan(8);
  });

  it("gives the deliverable's title, description, schedule and questions as the admin's data has them", async () => {
    for (const formId of RELEASED.filter((id) => id !== NOT_OPEN_YET)) {
      const view = await reviewForm(formId);
      const full = await adminForm(formId);
      expect(view.form, formId).toEqual({
        id: formId,
        title: full.title,
        description: full.description,
        opensAt: full.settings.opensAt ?? full.settings.visibleAt,
        dueAt: full.settings.dueAt,
        closesAt: full.settings.closesAt,
        allowLate: full.settings.allowLate,
        questions: full.questions,
      });
      expect(view.form.questions?.length).toBeGreaterThan(2);
    }
  });

  it("gives each response in full: the questions as they were answered, the answers, and how late it was", async () => {
    for (const formId of ["week0onboarding", "week1reflection", "week2interviews"]) {
      const view = await reviewForm(formId);
      const full = await adminResponses(formId);
      const readable = full.responses.filter((response) => response.uid !== uids[RILEY]);
      expect(view.responses, formId).toEqual(
        readable.map((response) => ({
          uid: response.uid,
          displayName: response.displayName,
          teamName: response.teamId === TEAM_ATLAS ? TEAM_ATLAS_NAME : null,
          submittedAt: response.submittedAt,
          late: response.late,
          lateBySeconds: response.lateBySeconds,
          questions: response.questions,
          answers: response.answers,
        })),
      );
      const times = view.responses.map((response) => Date.parse(response.submittedAt));
      expect(times).toEqual([...times].sort((a, b) => a - b));
    }
    const onboarding = await reviewForm("week0onboarding");
    expect(onboarding.responses.map((response) => response.displayName).sort()).toEqual(["Avery Chen", "Jordan Patel", "Maya Rodriguez", "Sam Okafor"]);
    const jordans = onboarding.responses.find((response) => response.uid === uids[JORDAN]);
    expect(jordans).toMatchObject({ late: true, teamName: TEAM_ATLAS_NAME });
    expect(jordans?.lateBySeconds).toBeGreaterThan(2 * 86_400);
    expect(JSON.stringify((await reviewForm("week2interviews")).responses)).toContain("Group projects fall apart");
  });

  it("leaves out the disabled pledge's response, and does not list them as missing anywhere", async () => {
    // An admin is sent it.
    const full = await call(getResponses, { formId: "week0onboarding" }, { token: admin.token });
    expect(full.text).toContain(DISABLED_PLEDGES_ANSWER);
    expect(ok<FormResponsesDto>(full).responses).toHaveLength(5);

    for (const formId of RELEASED) {
      const result = await asActive(getReviewForm, { formId });
      const view = ok<ReviewFormDto>(result);
      expect(view.responses.map((response) => response.uid), formId).not.toContain(uids[RILEY]);
      expect(view.notTurnedIn.map((pledge) => pledge.uid), formId).not.toContain(uids[RILEY]);
      expect(result.text, formId).not.toContain(DISABLED_PLEDGES_ANSWER);
      expect(result.text, formId).not.toContain("Riley");
      expect(result.text, formId).not.toContain(uids[RILEY]);
    }
  });

  it("lists everyone else who has not turned it in, by name, with where they stand", async () => {
    const reflection = await reviewForm("week1reflection");
    expect(reflection.notTurnedIn).toEqual([
      { uid: uids[CASEY], displayName: "Casey Kim", teamName: null, state: "missed" },
      { uid: uids[MAYA], displayName: "Maya Rodriguez", teamName: null, state: "missed" },
      { uid: uids[SAM], displayName: "Sam Okafor", teamName: null, state: "missed" },
    ]);
    const synthesis = await reviewForm("week2synthesis");
    expect(synthesis.responses).toEqual([]);
    expect(synthesis.notTurnedIn.map((pledge) => [pledge.displayName, pledge.teamName, pledge.state])).toEqual([
      ["Avery Chen", TEAM_ATLAS_NAME, "open"],
      ["Casey Kim", null, "locked"],
      ["Jordan Patel", TEAM_ATLAS_NAME, "locked"],
      ["Maya Rodriguez", null, "open"],
      ["Sam Okafor", null, "locked"],
    ]);
  });

  it("accounts for every pledge of the overview exactly once, under the state the overview gives them", async () => {
    const overview = await reviewOverview();
    for (const formId of RELEASED) {
      const view = await reviewForm(formId);
      const responded = view.responses.map((response) => response.uid);
      const missing = new Map(view.notTurnedIn.map((pledge) => [pledge.uid, pledge.state]));
      expect(new Set(responded).size, formId).toBe(responded.length);
      for (const pledge of overview.pledges) {
        const cell = pledge.byForm[formId];
        const where = `${pledge.displayName} on ${formId}`;
        if (cell.state === "submitted") {
          expect(responded, where).toContain(pledge.uid);
          expect(missing.has(pledge.uid), where).toBe(false);
          expect(view.responses.find((response) => response.uid === pledge.uid)).toMatchObject({ submittedAt: cell.submittedAt, late: cell.late });
        } else if (cell.state === "hidden") {
          expect(responded, where).not.toContain(pledge.uid);
          expect(missing.has(pledge.uid), where).toBe(false);
        } else {
          expect(responded, where).not.toContain(pledge.uid);
          expect(missing.get(pledge.uid), where).toBe(cell.state);
        }
      }
      // And nobody who is not in the overview.
      const known = new Set(overview.pledges.map((pledge) => pledge.uid));
      for (const uid of [...responded, ...missing.keys()]) expect(known.has(uid), `${uid} on ${formId}`).toBe(true);
    }
  });

  it("lists exactly as many responses as the overview counts", async () => {
    const overview = await reviewOverview();
    for (const form of overview.forms) {
      expect((await reviewForm(form.id)).responses, form.id).toHaveLength(form.responseCount);
    }
    expect(overview.forms.reduce((total, form) => total + form.responseCount, 0)).toBe(8);
  });

  describe("before it opens", () => {
    it("gives the title and the schedule, and no questions", async () => {
      const result = await asActive(getReviewForm, { formId: NOT_OPEN_YET });
      const view = ok<ReviewFormDto>(result);
      const full = await adminForm(NOT_OPEN_YET);
      expect(view.form).toEqual({
        id: NOT_OPEN_YET,
        title: "Week 3: MVP Scope",
        description: full.description,
        opensAt: full.settings.opensAt,
        dueAt: full.settings.dueAt,
        closesAt: null,
        allowLate: false,
        questions: null,
      });
      expect(Date.parse(view.form.opensAt ?? "")).toBeGreaterThan(Date.now() + DAY);
      expect(view.responses).toEqual([]);
      // Not one question, by its wording or its id, anywhere in what was sent.
      expect(full.questions.map((question) => question.title)).toContain("What is your riskiest assumption?");
      for (const question of full.questions) {
        expect(result.text).not.toContain(question.title);
        expect(result.text).not.toContain(question.id);
      }
    });

    it("says how many questions there will be in the overview, and nothing of what they are", async () => {
      const result = await asActive(getReviewOverview, {});
      expect(ok<ReviewOverviewDto>(result).forms.find((form) => form.id === NOT_OPEN_YET)).toMatchObject({ questionCount: 3, responseCount: 0 });
      expect(result.text).not.toContain("What is your riskiest assumption?");
      expect(result.text).not.toContain("q_assumption");
      expect(result.text).not.toContain('"questions"');
    });

    it("is the same rule a pledge is held to: neither is shown the questions", async () => {
      const pledges = ok<PledgeFormDto>(await call(getForm, { formId: NOT_OPEN_YET }, { token: sam.token }));
      expect(pledges.card.state).toBe("upcoming");
      expect(pledges.questions).toBeNull();
      expect((await reviewForm(NOT_OPEN_YET)).form.questions).toBeNull();
    });
  });
});

describe("deliverables an active may not see", () => {
  const unavailable = (): Array<[string, string]> => [
    ["a draft", SEEDED_DRAFT],
    ["an archived deliverable that has a response", archivedId],
    ["a published deliverable that is not visible yet", futureId],
    ["an id that was never a deliverable", "doesnotexist"],
    ["another id that was never a deliverable", "a".repeat(64)],
  ];

  it("are refused with one and the same answer, whether they exist or not", async () => {
    const results: ApiResult[] = [];
    for (const [label, formId] of unavailable()) {
      const result = await asActive(getReviewForm, { formId });
      expect(result.status, label).toBe(404);
      expect(result.body, label).toEqual(NOT_AVAILABLE);
      results.push(result);
    }
    // Byte for byte, and header for header.
    expect(new Set(results.map((result) => result.text)).size).toBe(1);
    expect(new Set(results.map((result) => JSON.stringify([...result.headers.entries()].sort()))).size).toBe(1);
  });

  it("really do exist, for the three that do: an admin can open each of them", async () => {
    expect((await adminForm(SEEDED_DRAFT)).status).toBe("draft");
    expect(await adminForm(archivedId)).toMatchObject({ status: "archived", responseCount: 1 });
    const future = await adminForm(futureId);
    expect(future.status).toBe("published");
    expect(Date.parse(future.settings.visibleAt ?? "")).toBeGreaterThan(Date.now() + DAY);
  });

  it("are refused whatever the request adds", async () => {
    for (const [label, formId] of unavailable().slice(0, 3)) {
      const result = await call(getReviewForm, { formId }, {
        token: priya.token,
        query: "?status=published&preview=1&force=true&visibleAt=2000-01-01T00:00:00.000Z",
        headers: { "x-role": "admin" },
      });
      expect(result.status, label).toBe(404);
      expect(result.body, label).toEqual(NOT_AVAILABLE);
    }
  });

  it.each<[string, string]>([
    ["a response's document id", "week0onboarding_x"],
    ["a path into another collection", "../users/abc"],
    ["an encoded slash", "week0onboarding%2Fextra"],
    ["an empty id", ""],
    ["65 characters", "a".repeat(65)],
  ])("treats %s as not found, and says nothing more", async (_label, formId) => {
    const result = await asActive(getReviewForm, { formId });
    refused(result, 404, "not_found");
    expect(sorted(result.body as object)).toEqual(["code", "error"]);
  });

  it("does not let an active reach a pledge's response by building its document id", async () => {
    const composed = `week0onboarding_${uids[RILEY]}`;
    refused(await asActive(getReviewForm, { formId: composed }), 404, "not_found");
  });
});

describe("everything a review response contains", () => {
  it("has none of what an active must never be sent: no email, no punishment, no draft, no account or time data", async () => {
    const responses = await everyReviewResponse();
    expect(responses).toHaveLength(10);
    expect(responses.map(([, result]) => result.status)).toEqual([200, 200, 200, 200, 200, 200, 404, 404, 404, 404]);
    for (const [label, result] of responses) {
      expect(forbiddenIn(result.text), label).toEqual([]);
    }
  });

  it("has no email address of any kind, and none of the active's own account either", async () => {
    for (const [label, result] of await everyReviewResponse()) {
      expect(result.text, label).not.toMatch(/@uci\.edu/i);
      expect(result.text, label).not.toContain("@");
      expect(result.text, label).not.toContain(priya.uid);
      expect(result.text, label).not.toContain("Priya");
    }
  });

  it("does contain the pledges' work, so the search above was looking at real responses", async () => {
    const text = (await everyReviewResponse()).map(([, result]) => result.text).join("\n");
    for (const expected of ["Avery Chen", "Casey Kim", "Group projects fall apart", "document/d/demo-1", TEAM_ATLAS_NAME, "Week 3: MVP Scope", uids[SAM]]) {
      expect(text).toContain(expected);
    }
  });

  it("is made only of the keys the review shapes name", async () => {
    // Keys of the questions and answers a pledge's response is made of, which an active reads in full.
    const QUESTION_AND_ANSWER_KEYS = [
      "allowOther",
      "description",
      "id",
      "kind",
      "label",
      "max",
      "maxLabel",
      "min",
      "minLabel",
      "optionId",
      "optionIds",
      "options",
      "other",
      "required",
      "title",
      "type",
      "validation",
      "value",
    ];
    const allowed = new Set([
      ...OVERVIEW_KEYS,
      ...OVERVIEW_FORM_KEYS,
      ...OVERVIEW_PLEDGE_KEYS,
      ...PROGRESS_KEYS,
      ...CELL_KEYS,
      ...FORM_VIEW_KEYS,
      ...FORM_KEYS,
      ...RESPONSE_KEYS,
      ...NOT_TURNED_IN_KEYS,
      ...QUESTION_AND_ANSWER_KEYS,
      "code",
      "error",
    ]);
    const idKeys = new Set([...RELEASED, "q_major", "q_year", "q_interests", "q_experience", "q_problem", "q_who", "q_confidence", "q_doc", "q_count", "q_date", "q_time", "q_surprise", "q_notes"]);
    const seen = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (typeof value === "object" && value !== null) {
        for (const [key, item] of Object.entries(value)) {
          seen.add(key);
          walk(item);
        }
      }
    };
    for (const [, result] of await everyReviewResponse()) walk(result.body);
    const unexpected = [...seen].filter((key) => !allowed.has(key) && !idKeys.has(key)).sort();
    expect(unexpected).toEqual([]);
    for (const banned of BANNED_KEYS) expect(seen.has(banned), banned).toBe(false);
  });
});

describe("reading changes nothing", () => {
  it("leaves every document and every sign-in account exactly as it was, after every review request", async () => {
    const before = await dumpPortal();
    expect(Object.keys(before.firestore).length).toBeGreaterThan(60);
    for (let round = 0; round < 3; round += 1) await everyReviewResponse();
    const after = await dumpPortal();
    expect(after.firestore).toEqual(before.firestore);
    expect(after.accounts).toEqual(before.accounts);
  });

  it("starts no response clock and no draft for the active, as opening a deliverable does for a pledge", async () => {
    await reviewForm("week2synthesis");
    expect(await docData(`drafts/week2synthesis_${priya.uid}`)).toBeNull();
    expect((await docData(`users/${priya.uid}`))?.activity).toEqual({
      firstSeenAt: null,
      lastSeenAt: null,
      totalActiveSeconds: 0,
      sessionCount: 0,
      current: null,
    });
  });
});

// ── From here on the tests change things, and watch the review follow ────────

describe("as things change", () => {
  it("shows the questions once the deliverable opens", async () => {
    await editForm(NOT_OPEN_YET, (form) => ({ settings: { ...form.settings, opensAt: new Date(Date.now() - 60_000).toISOString() } }));
    const view = await reviewForm(NOT_OPEN_YET);
    const full = await adminForm(NOT_OPEN_YET);
    expect(view.form.questions).toEqual(full.questions);
    expect(view.form.questions?.map((question) => question.title)).toContain("What is your riskiest assumption?");
    expect(view.notTurnedIn.every((pledge) => pledge.state === "open")).toBe(true);
    await expectOverviewToMatchTheAdmins();
  });

  it("lists a deliverable from the moment it is visible, and not a moment before", async () => {
    expect((await reviewOverview()).forms.map((form) => form.id)).not.toContain(futureId);
    await editForm(futureId, (form) => ({ settings: { ...form.settings, visibleAt: new Date(Date.now() - 60_000).toISOString() } }));

    const { review } = await expectOverviewToMatchTheAdmins();
    expect(review.forms.map((form) => form.title)).toContain(FUTURE_TITLE);
    const view = await reviewForm(futureId);
    expect(sorted(view.form)).toEqual(FORM_KEYS);
    expect(view.form.questions?.map((question) => question.title)).toEqual([FUTURE_QUESTION]);
    expect(view.notTurnedIn).toHaveLength(5);

    // And it goes again when it is taken back to a draft.
    await editForm(futureId, () => ({ status: "draft" }));
    expect((await reviewOverview()).forms.map((form) => form.id)).not.toContain(futureId);
    const gone = await asActive(getReviewForm, { formId: futureId });
    expect(gone.status).toBe(404);
    expect(gone.body).toEqual(NOT_AVAILABLE);
  });

  it("does not bring an archived deliverable back by anything short of publishing it", async () => {
    expect((await asActive(getReviewForm, { formId: archivedId })).status).toBe(404);
    await editForm(archivedId, () => ({ status: "published" }));
    const view = await reviewForm(archivedId);
    expect(view.responses.map((response) => response.uid)).toEqual([uids[SAM]]);
    expect(JSON.stringify(view.responses)).toContain(ARCHIVED_ANSWER);
    await expectOverviewToMatchTheAdmins();

    await editForm(archivedId, () => ({ status: "archived" }));
    const gone = await asActive(getReviewForm, { formId: archivedId });
    expect(gone.body).toEqual(NOT_AVAILABLE);
    expect((await asActive(getReviewOverview, {})).text).not.toContain(ARCHIVED_TITLE);
  });

  it("shows a pledge who joined today only the deliverables that still apply to them", async () => {
    const created = ok<CreatePledgeResultDto>(
      await call(createPledge, {}, { method: "POST", token: admin.token, body: { email: LATE_JOINER, displayName: "Late Joiner", pledgeClass: "Mu" } }),
    );
    const { review } = await expectOverviewToMatchTheAdmins();
    const joiner = review.pledges.find((pledge) => pledge.uid === created.pledge.uid);
    expect(joiner).toMatchObject({ displayName: "Late Joiner", teamName: null });
    // The two that were already over before the account existed are not theirs to miss.
    expect(joiner?.byForm.week0onboarding.state).toBe("hidden");
    expect(joiner?.byForm.week1reflection.state).toBe("hidden");
    expect(joiner?.progress).toMatchObject({ total: 3, submitted: 0, missed: 0 });
    expect((await reviewForm("week1reflection")).notTurnedIn.map((pledge) => pledge.uid)).not.toContain(created.pledge.uid);
    expect((await reviewForm("week2interviews")).notTurnedIn.map((pledge) => pledge.uid)).toContain(created.pledge.uid);

    for (const [label, result] of await everyReviewResponse()) expect(forbiddenIn(result.text), label).toEqual([]);
  });

  it(
    "drops a pledge, their responses and their place among the missing the moment they are disabled, and restores them when re-enabled",
    async () => {
      const jordan = uids[JORDAN];
      ok(await call(updatePledge, { uid: jordan }, { method: "PATCH", token: admin.token, body: { status: "disabled" } }));

      const whileDisabled = await asActive(getReviewOverview, {});
      const overview = ok<ReviewOverviewDto>(whileDisabled);
      expect(overview.pledges.map((pledge) => pledge.uid)).not.toContain(jordan);
      expect(whileDisabled.text).not.toContain("Jordan");
      expect(Object.fromEntries(overview.forms.map((form) => [form.id, form.responseCount]))).toMatchObject({
        week0onboarding: 3,
        week1reflection: 1,
      });
      for (const formId of ["week0onboarding", "week1reflection", "week2interviews", "week2synthesis"]) {
        const result = await asActive(getReviewForm, { formId });
        const view = ok<ReviewFormDto>(result);
        expect(view.responses.map((response) => response.uid), formId).not.toContain(jordan);
        expect(view.notTurnedIn.map((pledge) => pledge.uid), formId).not.toContain(jordan);
        expect(result.text, formId).not.toContain("Jordan");
        expect(result.text, formId).not.toContain("document/d/demo-2");
        expect(view.responses, formId).toHaveLength(overview.forms.find((form) => form.id === formId)?.responseCount ?? -1);
      }
      await expectOverviewToMatchTheAdmins();

      ok(await call(updatePledge, { uid: jordan }, { method: "PATCH", token: admin.token, body: { status: "active" } }));
      const { review } = await expectOverviewToMatchTheAdmins();
      expect(review.pledges.map((pledge) => pledge.uid)).toContain(jordan);
      expect(review.forms.find((form) => form.id === "week0onboarding")?.responseCount).toBe(4);
      expect((await reviewForm("week1reflection")).responses.map((response) => response.uid)).toContain(jordan);
    },
    SLOW_TEST_MS,
  );

  it("follows a pledge's team as an admin moves them, by name only", async () => {
    ok(await call(updatePledge, { uid: uids[SAM] }, { method: "PATCH", token: admin.token, body: { teamId: TEAM_ATLAS } }));
    const moved = await asActive(getReviewOverview, {});
    expect(ok<ReviewOverviewDto>(moved).pledges.find((pledge) => pledge.uid === uids[SAM])?.teamName).toBe(TEAM_ATLAS_NAME);
    expect(moved.text).not.toContain(`"${TEAM_ATLAS}"`);
    expect((await reviewForm("week0onboarding")).responses.find((response) => response.uid === uids[SAM])?.teamName).toBe(TEAM_ATLAS_NAME);

    ok(await call(updatePledge, { uid: uids[SAM] }, { method: "PATCH", token: admin.token, body: { teamId: null } }));
    expect((await reviewOverview()).pledges.find((pledge) => pledge.uid === uids[SAM])?.teamName).toBeNull();
  });

  it("still sends nothing an active must not see, after all of that", async () => {
    for (const [label, result] of await everyReviewResponse()) expect(forbiddenIn(result.text), label).toEqual([]);
  });

  // A profile keeps a fingerprint of the temporary password its account was given. A review
  // response is built from the pledges' profiles, so it is searched for every one of them.
  it("sends nothing of a temporary password or of the fingerprint kept of it, for a pledge who is on one", async () => {
    const result = await call(createPledge, {}, { method: "POST", token: admin.token, body: { email: "on.temporary@uci.edu", displayName: "Wren Halloran", start: "temporary_password" } });
    const made = ok<CreatePledgeResultDto>(result);
    expect(made.temporaryPassword).toMatch(TEMPORARY_PASSWORD);
    expect(await storedFingerprint(made.pledge.uid)).toEqual(A_KEPT_FINGERPRINT);
    // The salt and the hash of the one account that is on a temporary password.
    const kept = await everyStoredFingerprint();
    expect(kept).toHaveLength(2);

    const responses = await everyReviewResponse();
    // The new pledge is among those the overview is of.
    expect(responses.map(([, response]) => response.text).join("\n")).toContain("Wren Halloran");
    expect(responses.filter(([, response]) => response.status === 200).length).toBeGreaterThanOrEqual(4);
    for (const [label, response] of responses) {
      // Found or not: a deliverable an active may not see answers 404, and that says nothing either.
      for (const value of kept) expect(response.text.includes(value), `${label}: a stored salt or hash`).toBe(false);
      expect(response.text.toUpperCase(), label).not.toContain(made.temporaryPassword ?? "none");
      expect(response.text, label).not.toMatch(/temporaryPassword|"salt"|"hash"|"temp"|"tempAt"|"tempNew"/);
      expect(fingerprintLeak(response.body, false), label).toBeNull();
      expect(forbiddenIn(response.text), label).toEqual([]);
    }
  });
});
