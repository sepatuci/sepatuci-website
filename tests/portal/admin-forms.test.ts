/**
 * Admin management of deliverables, their responses and the audit log. Tests
 * run in order from a fresh seed: read-only checks first, then a deliverable is
 * built, published, edited under pledges' feet, chained, archived and deleted.
 */
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getAudit } from "@/app/api/portal/admin/audit/route";
import { DELETE as reopenResponse } from "@/app/api/portal/admin/forms/[formId]/responses/[uid]/route";
import { GET as getResponses } from "@/app/api/portal/admin/forms/[formId]/responses/route";
import { DELETE as deleteForm, GET as getAdminForm, PUT as putAdminForm } from "@/app/api/portal/admin/forms/[formId]/route";
import { GET as listForms, POST as createForm } from "@/app/api/portal/admin/forms/route";
import { GET as getDashboard } from "@/app/api/portal/dashboard/route";
import { PUT as putDraft } from "@/app/api/portal/forms/[formId]/draft/route";
import { GET as getForm } from "@/app/api/portal/forms/[formId]/route";
import { POST as submit } from "@/app/api/portal/forms/[formId]/submit/route";
import { GET as getSubmission } from "@/app/api/portal/submissions/[formId]/route";
import { ID_PATTERN, LIMITS } from "@/lib/portal/constants";
import { resetRateLimits } from "@/lib/portal/server/rate-limit";
import type {
  AdminFormDto,
  AdminFormsDto,
  Answers,
  AuditLogDto,
  DashboardDto,
  FormDefinition,
  FormResponsesDto,
  FormSettings,
  PledgeFormDto,
  Question,
  SubmissionDto,
  SubmitResultDto,
} from "@/lib/portal/types";
import {
  ADMIN_ONE,
  ADMIN_TWO,
  AVERY,
  CASEY,
  JORDAN,
  MAYA,
  SAM,
  SEED_TIMEOUT_MS,
  SLOW_TEST_MS,
  TEAM_ATLAS,
  call,
  countAll,
  countWhere,
  docData,
  docExists,
  fieldCodes,
  ok,
  refused,
  seedPortal,
  signIn,
  sleep,
  storedAudit,
  testDb,
  uidOf,
  type ApiResult,
  type Session,
} from "./helpers";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const fromNow = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();
const text = (value: string) => ({ kind: "text", value }) as const;

const INTERVIEW_ANSWERS: Answers = {
  q_count: text("4"),
  q_date: text("2026-10-05"),
  q_surprise: text("People cared more about time than money."),
  q_notes: text("https://docs.google.com/document/d/interview-notes"),
};

const CHECK_IN_QUESTIONS: Question[] = [
  { id: "q_a", type: "short_text", title: "One word for this week", description: "", required: true, validation: "none" },
  { id: "q_b", type: "paragraph", title: "Anything else?", description: "", required: false },
];
const ENERGY_QUESTION: Question = {
  id: "q_c",
  type: "linear_scale",
  title: "Energy level",
  description: "",
  required: true,
  min: 1,
  max: 5,
  minLabel: "Low",
  maxLabel: "High",
};

let admin: Session;
let adminTwo: Session;
let avery: Session;
let jordan: Session;
let maya: Session;
let sam: Session;
let caseyUid: string;

const formOf = async (formId: string): Promise<AdminFormDto> =>
  ok<AdminFormDto>(await call(getAdminForm, { formId }, { token: admin.token }));

/** A save request: the definition as read, with changes, at the version it was read at. */
function saveBody(form: AdminFormDto, changes: Partial<FormDefinition> = {}): Record<string, unknown> {
  return {
    title: form.title,
    description: form.description,
    status: form.status,
    questions: form.questions,
    settings: form.settings,
    ...changes,
    expectedVersion: form.version,
  };
}

const put = (formId: string, body: unknown, session: Session = admin): Promise<ApiResult> =>
  call(putAdminForm, { formId }, { method: "PUT", token: session.token, body });

type Changes = Partial<FormDefinition> | ((form: AdminFormDto) => Partial<FormDefinition>);

/** Reads the form, applies the changes and saves it at the version just read. */
async function edit(formId: string, changes: Changes, session: Session = admin): Promise<ApiResult> {
  const form = await formOf(formId);
  return put(formId, saveBody(form, typeof changes === "function" ? changes(form) : changes), session);
}

const withSettings = (changes: Partial<FormSettings>) => (form: AdminFormDto): Partial<FormDefinition> => ({
  settings: { ...form.settings, ...changes },
});

const responsesOf = async (formId: string): Promise<FormResponsesDto> =>
  ok<FormResponsesDto>(await call(getResponses, { formId }, { token: admin.token }));
const dashboardOf = async (session: Session): Promise<DashboardDto> =>
  ok<DashboardDto>(await call(getDashboard, {}, { token: session.token }));
const stateOn = async (session: Session, formId: string): Promise<string | null> =>
  (await dashboardOf(session)).forms.find((form) => form.id === formId)?.state ?? null;
const openForm = (session: Session, formId: string) => call(getForm, { formId }, { token: session.token });
/** Turns a deliverable in as the page does: with the version of it the pledge was shown. */
const submitAs = async (session: Session, formId: string, answers: Answers): Promise<ApiResult> => {
  const { version } = ok<PledgeFormDto>(await openForm(session, formId));
  return call(submit, { formId }, { method: "POST", token: session.token, body: { answers, formVersion: version } });
};
const latestAudit = async () => (await storedAudit())[0];

beforeAll(async () => {
  await seedPortal();
  [admin, adminTwo, avery, jordan, maya, sam] = await Promise.all(
    [ADMIN_ONE, ADMIN_TWO, AVERY, JORDAN, MAYA, SAM].map((email) => signIn(email)),
  );
  caseyUid = await uidOf(CASEY);
}, SEED_TIMEOUT_MS);

beforeEach(() => {
  resetRateLimits();
});

describe("listing deliverables", () => {
  it("summarizes every deliverable, drafts included, with response counts", async () => {
    const list = ok<AdminFormsDto>(await call(listForms, {}, { token: admin.token }));
    const summary = Object.fromEntries(
      list.forms.map((form) => [form.id, [form.status, form.questionCount, form.responseCount, form.version]]),
    );
    expect(summary).toEqual({
      week0onboarding: ["published", 4, 5, 1],
      week1reflection: ["published", 4, 2, 1],
      week2interviews: ["published", 5, 2, 1],
      week2synthesis: ["published", 4, 0, 1],
      week3mvpscope: ["published", 3, 0, 1],
      pitchfeedback: ["draft", 2, 0, 1],
    });
  });

  it("counts active pledges only, as the number who could respond", async () => {
    // Six seeded pledges, one of them disabled.
    expect(ok<AdminFormsDto>(await call(listForms, {}, { token: admin.token })).pledgeCount).toBe(5);
  });

  it("returns one deliverable in full, questions and schedule included", async () => {
    const form = await formOf("week2synthesis");
    expect(form).toMatchObject({
      id: "week2synthesis",
      title: "Week 2: Interview Synthesis",
      status: "published",
      version: 1,
      responseCount: 0,
      settings: { allowLate: false, closesAt: null, prerequisiteFormId: "week2interviews", confirmationMessage: "" },
    });
    expect(form.questions.map((question) => [question.id, question.type])).toEqual([
      ["q_insight1", "paragraph"],
      ["q_insight2", "paragraph"],
      ["q_insight3", "paragraph"],
      ["q_pivot", "multiple_choice"],
    ]);
    expect(Date.parse(form.settings.dueAt ?? "")).toBeGreaterThan(Date.now());
    expect(Date.parse(form.settings.opensAt ?? "")).toBeLessThan(Date.now());
    expect((await formOf("week0onboarding")).responseCount).toBe(5);
  });

  it("is not found for an unknown deliverable", async () => {
    refused(await call(getAdminForm, { formId: "doesnotexist" }, { token: admin.token }), 404, "not_found");
  });
});

describe("responses", () => {
  it("lists responses oldest first with who sent them, how long they took and what they answered", async () => {
    const { form, responses } = await responsesOf("week1reflection");
    expect(form).toMatchObject({ id: "week1reflection", title: "Week 1: Founder Reflection", responseCount: 2 });
    expect(responses.map((response) => [response.displayName, response.email, response.late])).toEqual([
      ["Avery Chen", AVERY, false],
      ["Jordan Patel", JORDAN, false],
    ]);
    expect(responses[0]).toMatchObject({
      uid: avery.uid,
      formVersion: 1,
      durationSeconds: 18 * 60,
      activeSeconds: 756,
      lateBySeconds: 0,
    });
    expect(Object.keys(responses[0].answers).sort()).toEqual(["q_confidence", "q_doc", "q_problem", "q_who"]);
    expect(responses[0].questions.map((question) => question.id)).toEqual(["q_intro", "q_problem", "q_who", "q_confidence", "q_doc"]);
    expect(Date.parse(responses[0].submittedAt)).toBeLessThan(Date.parse(responses[1].submittedAt));
  });

  it("lists who has not responded and where each of them stands, leaving out disabled pledges", async () => {
    const { nonResponders } = await responsesOf("week1reflection");
    expect(nonResponders.map((pledge) => [pledge.displayName, pledge.state])).toEqual([
      ["Casey Kim", "missed"],
      ["Maya Rodriguez", "missed"],
      ["Sam Okafor", "missed"],
    ]);
  });

  it("marks late responses and by how much", async () => {
    const { responses, nonResponders } = await responsesOf("week0onboarding");
    expect(responses.map((response) => [response.displayName, response.late])).toEqual([
      ["Avery Chen", false],
      ["Maya Rodriguez", false],
      ["Riley Nguyen", false],
      ["Sam Okafor", false],
      ["Jordan Patel", true],
    ]);
    // Seeded 3 days and 37 minutes after the deadline.
    expect(responses[4].lateBySeconds).toBe(3 * 86_400 + 37 * 60);
    expect(nonResponders.map((pledge) => [pledge.displayName, pledge.state])).toEqual([["Casey Kim", "open_late"]]);
  });

  it("shows each non-responder's own state for a chained deliverable", async () => {
    const { responses, nonResponders } = await responsesOf("week2synthesis");
    expect(responses).toEqual([]);
    expect(nonResponders.map((pledge) => [pledge.displayName, pledge.state])).toEqual([
      ["Avery Chen", "open"],
      ["Casey Kim", "locked"],
      ["Jordan Patel", "locked"],
      ["Maya Rodriguez", "open"],
      ["Sam Okafor", "locked"],
    ]);
  });

  it("chases nobody for a deliverable that is still a draft", async () => {
    const { responses, nonResponders } = await responsesOf("pitchfeedback");
    expect(responses).toEqual([]);
    expect(nonResponders).toEqual([]);
  });

  it("says which team each respondent and each person still to respond is on, and lists the teams", async () => {
    const reflection = await responsesOf("week1reflection");
    expect(reflection.teams.map((team) => [team.id, team.name, team.memberCount])).toEqual([[TEAM_ATLAS, "Team Atlas", 2]]);
    expect(Date.parse(reflection.teams[0].createdAt)).toBeLessThan(Date.now());
    expect(reflection.responses.map((response) => [response.displayName, response.teamId])).toEqual([
      ["Avery Chen", TEAM_ATLAS],
      ["Jordan Patel", TEAM_ATLAS],
    ]);
    expect(reflection.nonResponders.map((pledge) => [pledge.displayName, pledge.teamId])).toEqual([
      ["Casey Kim", null],
      ["Maya Rodriguez", null],
      ["Sam Okafor", null],
    ]);

    const synthesis = await responsesOf("week2synthesis");
    expect(synthesis.nonResponders.map((pledge) => [pledge.displayName, pledge.teamId])).toEqual([
      ["Avery Chen", TEAM_ATLAS],
      ["Casey Kim", null],
      ["Jordan Patel", TEAM_ATLAS],
      ["Maya Rodriguez", null],
      ["Sam Okafor", null],
    ]);

    // A disabled pledge's response is still listed, and still says they are on no team.
    const onboarding = await responsesOf("week0onboarding");
    expect(onboarding.responses.map((response) => [response.displayName, response.teamId])).toEqual([
      ["Avery Chen", TEAM_ATLAS],
      ["Maya Rodriguez", null],
      ["Riley Nguyen", null],
      ["Sam Okafor", null],
      ["Jordan Patel", TEAM_ATLAS],
    ]);
    // The list of teams is there even for a deliverable nobody has to answer.
    expect((await responsesOf("pitchfeedback")).teams.map((team) => team.id)).toEqual([TEAM_ATLAS]);
  });

  it("is not found for an unknown deliverable", async () => {
    refused(await call(getResponses, { formId: "doesnotexist" }, { token: admin.token }), 404, "not_found");
  });
});

describe("creating a deliverable", () => {
  let blankId: string;

  it("starts a blank deliverable as an unscheduled draft with one starter question", async () => {
    const created = ok<{ id: string }>(await call(createForm, {}, { method: "POST", token: admin.token }));
    blankId = created.id;
    expect(blankId).toMatch(ID_PATTERN);

    const form = await formOf(blankId);
    expect(form).toMatchObject({
      title: "Untitled deliverable",
      description: "",
      status: "draft",
      version: 1,
      responseCount: 0,
      settings: {
        visibleAt: null,
        opensAt: null,
        dueAt: null,
        closesAt: null,
        allowLate: false,
        prerequisiteFormId: null,
        confirmationMessage: "",
      },
    });
    expect(form.questions).toHaveLength(1);
    expect(form.questions[0]).toMatchObject({ type: "multiple_choice", title: "", required: false, allowOther: false });
    expect(await latestAudit()).toMatchObject({
      action: "form.create",
      targetType: "form",
      targetId: blankId,
      actorEmail: ADMIN_ONE,
      summary: "Untitled deliverable",
    });
  });

  it("keeps the new draft invisible to pledges", async () => {
    expect(await stateOn(sam, blankId)).toBeNull();
    refused(await openForm(sam, blankId), 404, "not_found");
  });

  it("copies a deliverable as a fresh draft: same questions, no schedule, no unlock order, no responses", async () => {
    const source = await formOf("week2synthesis");
    const { id } = ok<{ id: string }>(
      await call(createForm, {}, { method: "POST", token: admin.token, body: { duplicateOf: "week2synthesis" } }),
    );
    const copy = await formOf(id);
    expect(copy).toMatchObject({
      title: "Copy of Week 2: Interview Synthesis",
      description: source.description,
      status: "draft",
      version: 1,
      responseCount: 0,
      settings: { visibleAt: null, opensAt: null, dueAt: null, closesAt: null, allowLate: false, prerequisiteFormId: null },
    });
    expect(copy.questions).toEqual(source.questions);
    expect(await latestAudit()).toMatchObject({ action: "form.duplicate", targetId: id, summary: "Copy of Week 2: Interview Synthesis" });
    expect(await formOf("week2synthesis")).toEqual(source);
  });

  it("carries the confirmation message over to a copy, and never the responses", async () => {
    const { id } = ok<{ id: string }>(
      await call(createForm, {}, { method: "POST", token: admin.token, body: { duplicateOf: "week0onboarding" } }),
    );
    const copy = await formOf(id);
    expect(copy.settings.confirmationMessage).toBe("Thanks. Welcome to Founder's Education.");
    expect(copy.responseCount).toBe(0);
    expect((await responsesOf(id)).responses).toEqual([]);
  });

  it.each<[string, string]>([
    ["an unknown deliverable", "doesnotexist"],
    ["an unsafe id", "../users"],
    ["an id built from a form and a uid", "week0onboarding_abc"],
  ])("is not found when asked to copy %s", async (_label, duplicateOf) => {
    const before = await countAll("forms");
    refused(await call(createForm, {}, { method: "POST", token: admin.token, body: { duplicateOf } }), 404, "not_found");
    expect(await countAll("forms")).toBe(before);
  });
});

describe("saving a deliverable", () => {
  let checkInId: string;

  it("refuses a save that does not say which version it was based on", async () => {
    checkInId = ok<{ id: string }>(await call(createForm, {}, { method: "POST", token: admin.token })).id;
    const form = await formOf(checkInId);
    for (const expectedVersion of [undefined, null, "1", 1.5]) {
      const body = refused(await put(checkInId, { ...saveBody(form), expectedVersion }), 400, "bad_request");
      expect(body.error).toBe("The form version is missing.");
    }
  });

  it("refuses to publish with an untitled question or dates out of order, naming each field", async () => {
    const form = await formOf(checkInId);
    const body = refused(
      await put(
        checkInId,
        saveBody(form, {
          status: "published",
          settings: { ...form.settings, opensAt: fromNow(DAY), dueAt: fromNow(HOUR) },
        }),
      ),
      422,
      "invalid",
    );
    expect(body.error).toBe("This deliverable has problems to fix.");
    expect(fieldCodes(body)).toEqual(["questions[0].title:required", "settings.dueAt:out_of_order"]);
  });

  it("refuses to publish with no questions", async () => {
    const form = await formOf(checkInId);
    const body = refused(await put(checkInId, saveBody(form, { status: "published", questions: [] })), 422, "invalid");
    expect(fieldCodes(body)).toEqual(["questions:required"]);
  });

  it("left the draft untouched after the refused saves", async () => {
    expect(await formOf(checkInId)).toMatchObject({ status: "draft", version: 1, title: "Untitled deliverable" });
  });

  it("saves and publishes a valid deliverable, bumping its version", async () => {
    const form = await formOf(checkInId);
    const saved = ok<AdminFormDto>(
      await put(checkInId, {
        ...saveBody(form, {
          title: "  Week 4: Check-in ",
          description: "How is it going?",
          status: "published",
          questions: CHECK_IN_QUESTIONS,
          settings: {
            visibleAt: null,
            opensAt: fromNow(-HOUR),
            dueAt: fromNow(DAY),
            closesAt: fromNow(2 * DAY),
            allowLate: false,
            prerequisiteFormId: null,
            confirmationMessage: "Thanks for checking in.",
          },
        }),
        id: "attackerchosen",
        version: 99,
        createdBy: "someone-else",
        responseCount: 12,
        evil: true,
      }),
    );
    expect(saved).toMatchObject({
      id: checkInId,
      title: "Week 4: Check-in",
      description: "How is it going?",
      status: "published",
      version: 2,
      responseCount: 0,
      questions: CHECK_IN_QUESTIONS,
    });
    expect(Date.parse(saved.updatedAt)).toBeGreaterThan(Date.parse(saved.createdAt));
    expect(await latestAudit()).toMatchObject({ action: "form.publish", targetId: checkInId, summary: "Week 4: Check-in" });
  });

  it("clears the late cut-off when late responses are not accepted", async () => {
    const form = await formOf(checkInId);
    expect(form.settings).toMatchObject({ allowLate: false, closesAt: null });
    expect(form.settings.dueAt).not.toBeNull();
  });

  it("stores only the fields a deliverable has, attributed to the admin who saved it", async () => {
    const stored = await docData(`forms/${checkInId}`);
    expect(Object.keys(stored ?? {}).sort()).toEqual([
      "createdAt",
      "createdBy",
      "description",
      "questions",
      "questionsVersion",
      "settings",
      "status",
      "title",
      "updatedAt",
      "updatedBy",
      "version",
    ]);
    expect(stored).toMatchObject({ version: 2, createdBy: admin.uid, updatedBy: admin.uid });
  });

  it("shows the published deliverable to pledges straight away", async () => {
    expect(await stateOn(sam, checkInId)).toBe("open");
    const view = ok<PledgeFormDto>(await openForm(sam, checkInId));
    expect(view.questions?.map((question) => question.id)).toEqual(["q_a", "q_b"]);
    expect(view.card).toMatchObject({ title: "Week 4: Check-in", questionCount: 2 });
  });

  it("records a later edit as an update by whichever admin made it", async () => {
    const saved = ok<AdminFormDto>(await edit(checkInId, { description: "How is it going this week?" }, adminTwo));
    expect(saved.version).toBe(3);
    expect(await latestAudit()).toMatchObject({ action: "form.update", actorEmail: ADMIN_TWO, actorUid: adminTwo.uid });
    expect(await docData(`forms/${checkInId}`)).toMatchObject({ createdBy: admin.uid, updatedBy: adminTwo.uid });
  });

  it("refuses a save based on a stale version with 409 and keeps the newer one", async () => {
    const current = await formOf(checkInId);
    for (const expectedVersion of [current.version - 1, current.version + 1, 0]) {
      const body = refused(
        await put(checkInId, { ...saveBody(current, { title: "Overwritten" }), expectedVersion }),
        409,
        "version_conflict",
      );
      expect(body.error).toBe("Someone else changed this deliverable. Reload to see the latest version.");
    }
    expect(await formOf(checkInId)).toEqual(current);
  });

  it(
    "lets exactly one of two admins win when both save the same version at once",
    async () => {
      const current = await formOf(checkInId);
      const [first, second] = await Promise.all([
        put(checkInId, saveBody(current, { title: "Saved by chair one" }), admin),
        put(checkInId, saveBody(current, { title: "Saved by chair two" }), adminTwo),
      ]);
      expect([first.status, second.status].sort()).toEqual([200, 409]);
      const loser = first.status === 409 ? first : second;
      refused(loser, 409, "version_conflict");

      const after = await formOf(checkInId);
      expect(after.version).toBe(current.version + 1);
      expect(after.title).toBe(first.status === 200 ? "Saved by chair one" : "Saved by chair two");
      ok(await edit(checkInId, { title: "Week 4: Check-in" }));
    },
    SLOW_TEST_MS,
  );

  it("is not found when saving a deliverable that does not exist", async () => {
    const form = await formOf(checkInId);
    refused(await put("doesnotexist", saveBody(form)), 404, "not_found");
  });

  describe("while pledges are working on it", () => {
    /** The version Sam's page was showing when the admin changed the questions. */
    let versionSamHadOpen: number;
    const submitVersion = (session: Session, answers: Answers, formVersion: unknown) =>
      call(submit, { formId: checkInId }, { method: "POST", token: session.token, body: { answers, formVersion } });

    it("keeps a pledge's draft answers only for the questions that still exist", async () => {
      ok(
        await call(putDraft, { formId: checkInId }, {
          method: "PUT",
          token: sam.token,
          body: { answers: { q_a: text("Busy"), q_b: text("Lots going on.") } },
        }),
      );
      versionSamHadOpen = ok<PledgeFormDto>(await openForm(sam, checkInId)).version;
      expect(versionSamHadOpen).toBe((await formOf(checkInId)).version);
      ok(await edit(checkInId, { questions: [CHECK_IN_QUESTIONS[0], ENERGY_QUESTION] }));

      const view = ok<PledgeFormDto>(await openForm(sam, checkInId));
      expect(view.questions?.map((question) => question.id)).toEqual(["q_a", "q_c"]);
      expect(view.draft?.answers).toEqual({ q_a: text("Busy") });
      // Every save moves the version on by one, and the pledge's page is told the new one.
      expect(view.version).toBe(versionSamHadOpen + 1);
    });

    it("refuses a response to the version the pledge had open before the edit, and stores none of it", async () => {
      const draftBefore = await docData(`drafts/${checkInId}_${sam.uid}`);
      // Answers that would be accepted as they stand: only the version is out of date.
      const answers: Answers = { q_a: text("Busy"), q_c: { kind: "scale", value: 4 } };
      const body = refused(await submitVersion(sam, answers, versionSamHadOpen), 409, "form_changed");
      expect(body.error).toBe("This deliverable was updated while you had it open. Check your answers, then submit again.");
      expect(body).not.toHaveProperty("fields");

      expect(await docExists(`submissions/${checkInId}_${sam.uid}`)).toBe(false);
      expect(await docData(`drafts/${checkInId}_${sam.uid}`)).toEqual(draftBefore);
      expect((await docData(`users/${sam.uid}`))?.submitted).not.toHaveProperty(checkInId);
      expect(await stateOn(sam, checkInId)).toBe("open");
      expect((await responsesOf(checkInId)).responses).toEqual([]);
    });

    it("refuses the old answers against the old version too: the questions they answered are gone", async () => {
      const old: Answers = { q_a: text("Busy"), q_b: text("Lots going on.") };
      refused(await submitVersion(sam, old, versionSamHadOpen), 409, "form_changed");
      expect(await docExists(`submissions/${checkInId}_${sam.uid}`)).toBe(false);
    });

    // Moving a deadline at 11:58 PM must not bounce everyone who has the deliverable open.
    it("does not ask pledges to re-check when only the schedule or settings change, and does when a question changes", async () => {
      const question: Question = { id: "q_x", type: "short_text", title: "One thing", description: "", required: true, validation: "none" };
      const sendAs = (formId: string, formVersion: number) =>
        call(submit, { formId }, { method: "POST", token: avery.token, body: { answers: {}, formVersion } });
      const { id } = ok<{ id: string }>(await call(createForm, {}, { method: "POST", token: admin.token }));
      try {
        ok(await edit(id, { title: "Schedule-only edits", status: "published", questions: [question] }));
        const opened = ok<PledgeFormDto>(await openForm(avery, id)).version;

        const before = await formOf(id);
        ok(
          await edit(id, {
            settings: { ...before.settings, dueAt: new Date(Date.now() + 5 * DAY).toISOString(), confirmationMessage: "Thanks." },
          }),
        );
        // The admin's own version moves on, so two admins still cannot overwrite each other.
        expect((await formOf(id)).version).toBe(before.version + 1);
        expect(ok<PledgeFormDto>(await openForm(avery, id)).version).toBe(opened);
        // Avery's page is still current: this is refused for its answers, not for being out of date.
        expect(fieldCodes(refused(await sendAs(id, opened), 422, "invalid"))).toEqual(["answers.q_x:required"]);

        ok(await edit(id, { questions: [{ ...question, title: "One thing, reworded" }] }));
        refused(await sendAs(id, opened), 409, "form_changed");
        expect(ok<PledgeFormDto>(await openForm(avery, id)).version).toBeGreaterThan(opened);
      } finally {
        await call(deleteForm, { formId: id }, { method: "DELETE", token: admin.token });
      }
    });

    // The validator rebuilds every question in its own key order, and a store hands keys
    // back in its own: Firestore sorts them. The two never agree byte for byte, so what
    // decides whether pledges must re-check has to look past the order of the keys.
    it("does not take a difference in key order for a change to the questions", async () => {
      // Keys in descending order, the opposite of how the validator builds a question.
      const reversed: Question = { validation: "none", type: "short_text", title: "One thing", required: true, id: "q_x", description: "" };
      expect(Object.keys(reversed)).toEqual([...Object.keys(reversed)].sort().reverse());
      const { id } = ok<{ id: string }>(await call(createForm, {}, { method: "POST", token: admin.token }));
      try {
        ok(await edit(id, { title: "Key order", status: "published", questions: [reversed] }));
        // What the API stores is in the validator's order. The reversed order goes into the
        // store directly, as the sorted keys production Firestore hands back disagree with
        // the validator in the same way.
        await testDb().doc(`forms/${id}`).update({ questions: [reversed] });
        const before = await formOf(id);
        expect(before.questions).toEqual([reversed]);
        const opened = ok<PledgeFormDto>(await openForm(avery, id)).version;
        expect(opened).toBe(before.questionsVersion);

        ok(await edit(id, withSettings({ dueAt: fromNow(5 * DAY), confirmationMessage: "Thanks." })));
        const after = await formOf(id);
        expect(after.version).toBe(before.version + 1);
        expect(after.questionsVersion).toBe(before.questionsVersion);
        expect(ok<PledgeFormDto>(await openForm(avery, id)).version).toBe(opened);
        // Avery's page, opened before the schedule change, is still current: the response is taken.
        const submitted = ok<SubmitResultDto>(
          await call(submit, { formId: id }, { method: "POST", token: avery.token, body: { answers: { q_x: text("Done") }, formVersion: opened } }),
        );
        expect(submitted.late).toBe(false);
        expect(await docExists(`submissions/${id}_${avery.uid}`)).toBe(true);
      } finally {
        await call(reopenResponse, { formId: id, uid: avery.uid }, { method: "DELETE", token: admin.token });
        await call(deleteForm, { formId: id }, { method: "DELETE", token: admin.token });
      }
    });

    it("holds a submission to the deliverable as it is now, not as it was when the pledge started", async () => {
      const old = refused(await submitAs(sam, checkInId, { q_a: text("Busy"), q_b: text("Lots going on.") }), 422, "invalid");
      expect(fieldCodes(old)).toEqual(["answers.q_c:required"]);

      // Sent with the version the reloaded page shows, which is the current one.
      const current = ok<PledgeFormDto>(await openForm(sam, checkInId)).version;
      ok<SubmitResultDto>(
        await submitVersion(sam, { q_a: text("Busy"), q_b: text("Lots going on."), q_c: { kind: "scale", value: 4 } }, current),
      );
      const stored = ok<SubmissionDto>(await call(getSubmission, { formId: checkInId }, { token: sam.token }));
      expect(stored.answers).toEqual({ q_a: text("Busy"), q_c: { kind: "scale", value: 4 } });
      expect(stored.questions.map((question) => question.id)).toEqual(["q_a", "q_c"]);
    });

    it("keeps a response's questions as they were when the deliverable is edited afterwards", async () => {
      const versionAtSubmission = (await formOf(checkInId)).version;
      ok(
        await edit(checkInId, (form) => ({
          title: "Week 4: Check-in (edited)",
          questions: [{ ...form.questions[0], title: "Renamed question" }, form.questions[1]],
        })),
      );

      const mine = ok<SubmissionDto>(await call(getSubmission, { formId: checkInId }, { token: sam.token }));
      expect(mine.title).toBe("Week 4: Check-in");
      expect(mine.questions[0].title).toBe("One word for this week");

      const view = await responsesOf(checkInId);
      expect(view.form.title).toBe("Week 4: Check-in (edited)");
      expect(view.form.questions[0].title).toBe("Renamed question");
      expect(view.form.version).toBe(versionAtSubmission + 1);
      expect(view.responses).toHaveLength(1);
      expect(view.responses[0]).toMatchObject({ uid: sam.uid, displayName: "Sam Okafor", formVersion: versionAtSubmission });
      expect(view.responses[0].questions[0].title).toBe("One word for this week");
    });

    it("refuses to change a question's type once there is a response, and still allows other edits", async () => {
      const retyped = await edit(checkInId, (form) => ({
        questions: [{ id: "q_a", type: "paragraph", title: form.questions[0].title, description: "", required: true }, form.questions[1]],
      }));
      const body = refused(retyped, 409, "question_type_locked");
      expect(body.error).toMatch(/already has responses/);

      const edited = ok<AdminFormDto>(
        await edit(checkInId, (form) => ({
          questions: [
            { ...form.questions[0], title: "Renamed again", required: false },
            { id: "q_new", type: "date", title: "When?", description: "", required: false },
          ],
        })),
      );
      expect(edited.questions.map((question) => [question.id, question.type])).toEqual([
        ["q_a", "short_text"],
        ["q_new", "date"],
      ]);
      expect(edited.responseCount).toBe(1);
    });

    it("on unpublishing, hides it from pledges who have not turned it in and keeps it for those who have", async () => {
      expect(await stateOn(jordan, checkInId)).toBe("open");

      ok(await edit(checkInId, { status: "draft" }));
      expect(await latestAudit()).toMatchObject({ action: "form.unpublish", targetId: checkInId });

      expect(await stateOn(jordan, checkInId)).toBeNull();
      refused(await openForm(jordan, checkInId), 404, "not_found");
      expect(await stateOn(sam, checkInId)).toBe("submitted");
      ok(await call(getSubmission, { formId: checkInId }, { token: sam.token }));
    });

    it("cannot be deleted now that it has a response", async () => {
      const body = refused(await call(deleteForm, { formId: checkInId }, { method: "DELETE", token: admin.token }), 409, "has_responses");
      expect(body.error).toMatch(/Archive it instead/);
      expect(await docExists(`forms/${checkInId}`)).toBe(true);
    });
  });
});

describe("moving a deadline", () => {
  it("makes outstanding work late once the deadline has passed, when late responses are accepted", async () => {
    ok(await edit("week2interviews", withSettings({ dueAt: fromNow(-MINUTE), closesAt: fromNow(5 * DAY), allowLate: true })));
    expect(await stateOn(jordan, "week2interviews")).toBe("open_late");

    const submitted = ok<SubmitResultDto>(await submitAs(jordan, "week2interviews", INTERVIEW_ANSWERS));
    expect(submitted.late).toBe(true);
    const stored = ok<SubmissionDto>(await call(getSubmission, { formId: "week2interviews" }, { token: jordan.token }));
    expect(stored.late).toBe(true);
    // A deadline covers the whole of its minute, so lateness runs from the end of that minute.
    const dueMs = Date.parse((await formOf("week2interviews")).settings.dueAt ?? "");
    const endOfDueMinute = Math.floor(dueMs / MINUTE) * MINUTE + MINUTE - 1;
    const submittedMs = Date.parse(stored.submittedAt);
    expect(submittedMs).toBeGreaterThan(endOfDueMinute);
    // Whole seconds, rounded up, and never none: after the deadline is late by at least a second.
    expect(stored.lateBySeconds).toBe(Math.max(1, Math.ceil((submittedMs - endOfDueMinute) / 1000)));
    expect(stored.lateBySeconds).toBeLessThanOrEqual(Math.ceil((submittedMs - dueMs) / 1000));
    // Due a minute ago: under a minute and a bit late, never the full time since the stored instant plus more.
    expect(stored.lateBySeconds).toBeGreaterThanOrEqual(1);
    expect(stored.lateBySeconds).toBeLessThan(90);
  });

  it("closes the deliverable to everyone still outstanding when late responses are switched off", async () => {
    const saved = ok<AdminFormDto>(await edit("week2interviews", withSettings({ allowLate: false })));
    expect(saved.settings).toMatchObject({ allowLate: false, closesAt: null });

    expect(await stateOn(sam, "week2interviews")).toBe("missed");
    expect(ok<PledgeFormDto>(await openForm(sam, "week2interviews")).questions).toBeNull();
    refused(await submitAs(sam, "week2interviews", INTERVIEW_ANSWERS), 409, "closed");
    expect(await docExists(`submissions/week2interviews_${sam.uid}`)).toBe(false);
    // A pledge who already turned it in is unaffected.
    expect(await stateOn(jordan, "week2interviews")).toBe("submitted");
  });

  it("reopens it, on time, when the deadline is extended", async () => {
    ok(await edit("week2interviews", withSettings({ dueAt: fromNow(DAY) })));
    expect(await stateOn(sam, "week2interviews")).toBe("open");

    const submitted = ok<SubmitResultDto>(await submitAs(sam, "week2interviews", INTERVIEW_ANSWERS));
    expect(submitted.late).toBe(false);
    expect(submitted.unlocked.map((card) => card.id)).toEqual(["week2synthesis"]);
    expect((await responsesOf("week2interviews")).responses).toHaveLength(4);
  });
});

describe("unlock order", () => {
  const prerequisite = (formId: string | null) => withSettings({ prerequisiteFormId: formId });

  it("refuses a deliverable that unlocks itself", async () => {
    const body = refused(await edit("week3mvpscope", prerequisite("week3mvpscope")), 422, "invalid");
    expect(fieldCodes(body)).toEqual(["settings.prerequisiteFormId:invalid"]);
    expect(body.fields?.[0].message).toBe("A deliverable can't unlock itself.");
  });

  it("refuses a prerequisite that does not exist or is not a safe id", async () => {
    const missing = refused(await edit("week3mvpscope", prerequisite("doesnotexist")), 422, "invalid");
    expect(missing.fields?.[0]).toMatchObject({ path: "settings.prerequisiteFormId", message: "That deliverable no longer exists." });
    const unsafe = refused(await edit("week3mvpscope", prerequisite("../users")), 422, "invalid");
    expect(unsafe.fields?.[0]).toMatchObject({ path: "settings.prerequisiteFormId", message: "Choose a valid deliverable." });
  });

  // Until the earlier deliverable is released there is nothing to turn in, so this one
  // would simply be open, and then lock later without anyone having changed it.
  it("refuses a prerequisite that is still a draft, naming the one to publish first", async () => {
    const draft = await formOf("pitchfeedback");
    expect(draft.status).toBe("draft");
    const body = refused(await edit("week3mvpscope", prerequisite("pitchfeedback")), 422, "invalid");
    expect(fieldCodes(body)).toEqual(["settings.prerequisiteFormId:invalid"]);
    expect(body.fields?.[0]).toMatchObject({
      path: "settings.prerequisiteFormId",
      message: `Publish "${draft.title}" first, then choose it here.`,
    });
    expect((await formOf("week3mvpscope")).settings.prerequisiteFormId).toBeNull();
  });

  // A draft that already points at one that is not published may still be edited: the
  // choice is judged when it is made, and again when the draft is published.
  it("lets a draft that already waits on an unpublished deliverable be edited, and refuses to publish it", async () => {
    const gate = ok<{ id: string }>(await call(createForm, {}, { method: "POST", token: admin.token })).id;
    const waiting = ok<{ id: string }>(await call(createForm, {}, { method: "POST", token: admin.token })).id;
    try {
      ok(await edit(gate, { title: "Gate", status: "published", questions: [CHECK_IN_QUESTIONS[0]] }));
      ok(
        await edit(waiting, (form) => ({
          title: "Waits on the gate",
          status: "draft",
          questions: [CHECK_IN_QUESTIONS[0]],
          settings: { ...form.settings, prerequisiteFormId: gate },
        })),
      );
      // Taking the gate out of circulation is allowed: nothing published waits on it.
      ok(await edit(gate, { status: "draft" }));

      const reworded = ok<AdminFormDto>(await edit(waiting, (form) => ({ questions: [{ ...form.questions[0], title: "Reworded" }] })));
      expect(reworded.settings.prerequisiteFormId).toBe(gate);
      expect(reworded.questions[0].title).toBe("Reworded");

      const publish = refused(await edit(waiting, { status: "published" }), 422, "invalid");
      expect(fieldCodes(publish)).toEqual(["settings.prerequisiteFormId:invalid"]);
      expect(publish.fields?.[0].message).toBe('Publish "Gate" first, then choose it here.');
      expect(await formOf(waiting)).toMatchObject({ status: "draft", settings: { prerequisiteFormId: gate } });

      // Choosing it afresh is refused on a draft too.
      ok(await edit(waiting, withSettings({ prerequisiteFormId: null })));
      const chosen = refused(await edit(waiting, withSettings({ prerequisiteFormId: gate })), 422, "invalid");
      expect(fieldCodes(chosen)).toEqual(["settings.prerequisiteFormId:invalid"]);
      expect((await formOf(waiting)).settings.prerequisiteFormId).toBeNull();
    } finally {
      await call(deleteForm, { formId: waiting }, { method: "DELETE", token: admin.token });
      await call(deleteForm, { formId: gate }, { method: "DELETE", token: admin.token });
    }
  });

  it("refuses a 2-deliverable loop", async () => {
    // week2synthesis already unlocks after week2interviews.
    const body = refused(await edit("week2interviews", prerequisite("week2synthesis")), 409, "prerequisite_cycle");
    expect(body.error).toBe("These deliverables would unlock each other in a loop.");
  });

  it("accepts a longer chain, then refuses the save that would close it into a 3-deliverable loop", async () => {
    // week3mvpscope -> week2synthesis -> week2interviews
    const chained = ok<AdminFormDto>(await edit("week3mvpscope", prerequisite("week2synthesis")));
    expect(chained.settings.prerequisiteFormId).toBe("week2synthesis");
    refused(await edit("week2interviews", prerequisite("week3mvpscope")), 409, "prerequisite_cycle");
  });

  it("left the deliverables that were refused exactly as they were", async () => {
    expect((await formOf("week2interviews")).settings.prerequisiteFormId).toBeNull();
    expect((await formOf("week2synthesis")).settings.prerequisiteFormId).toBe("week2interviews");
  });
});

describe("a deliverable that waits on one pledges cannot see yet", () => {
  const UNRELEASED_TITLE = "Unannounced Demo Day Signup";
  const UNRELEASED_DESCRIPTION = "Details of the surprise showcase.";
  let gateId: string;
  let waitingId: string;

  const schedule = (changes: Partial<FormSettings>): FormSettings => ({
    visibleAt: null,
    opensAt: null,
    dueAt: null,
    closesAt: null,
    allowLate: false,
    prerequisiteFormId: null,
    confirmationMessage: "",
    ...changes,
  });

  it("locks it for the pledge without naming the one it waits on", async () => {
    gateId = ok<{ id: string }>(await call(createForm, {}, { method: "POST", token: admin.token })).id;
    ok(
      await edit(gateId, {
        title: UNRELEASED_TITLE,
        description: UNRELEASED_DESCRIPTION,
        status: "published",
        questions: [CHECK_IN_QUESTIONS[0]],
        settings: schedule({ visibleAt: fromNow(DAY), dueAt: fromNow(5 * DAY) }),
      }),
    );
    waitingId = ok<{ id: string }>(await call(createForm, {}, { method: "POST", token: admin.token })).id;
    ok(
      await edit(waitingId, {
        title: "Demo Day Reflection",
        status: "published",
        questions: [CHECK_IN_QUESTIONS[0]],
        settings: schedule({ prerequisiteFormId: gateId }),
      }),
    );

    for (const session of [sam, avery]) {
      const result = await call(getDashboard, {}, { token: session.token });
      const dashboard = ok<DashboardDto>(result);
      expect(dashboard.forms.find((form) => form.id === waitingId)).toMatchObject({
        title: "Demo Day Reflection",
        state: "locked",
        lockReason: "prerequisite_pending",
        lockedByTitle: null,
      });
      expect(dashboard.forms.map((form) => form.id)).not.toContain(gateId);
      expect(result.text).not.toContain(UNRELEASED_TITLE);
      expect(result.text).not.toContain(UNRELEASED_DESCRIPTION);
      expect(result.text).not.toContain(gateId);
    }
  });

  it("does not name it when the pledge opens the locked deliverable, or tries to turn it in", async () => {
    const opened = await openForm(sam, waitingId);
    const view = ok<PledgeFormDto>(opened);
    expect(view.card).toMatchObject({ state: "locked", lockReason: "prerequisite_pending", lockedByTitle: null });
    expect(view.questions).toBeNull();
    expect(opened.text).not.toContain(UNRELEASED_TITLE);
    expect(opened.text).not.toContain(gateId);

    const attempt = await submitAs(sam, waitingId, { q_a: text("Early") });
    expect(refused(attempt, 409, "locked").error).toBe("Turn in the earlier deliverable to unlock this one.");
    expect(attempt.text).not.toContain(UNRELEASED_TITLE);

    // The unreleased deliverable itself is as good as nonexistent to a pledge.
    const hidden = await openForm(sam, gateId);
    refused(hidden, 404, "not_found");
    expect(hidden.text).toBe((await openForm(sam, "doesnotexist")).text);
  });

  it("still shows admins what it waits on and who is held up", async () => {
    expect((await formOf(waitingId)).settings.prerequisiteFormId).toBe(gateId);
    expect((await formOf(gateId)).title).toBe(UNRELEASED_TITLE);
    const { nonResponders } = await responsesOf(waitingId);
    expect(nonResponders.map((pledge) => [pledge.displayName, pledge.state])).toEqual([
      ["Avery Chen", "locked"],
      ["Casey Kim", "locked"],
      ["Jordan Patel", "locked"],
      ["Maya Rodriguez", "locked"],
      ["Sam Okafor", "locked"],
    ]);
    // Nobody is chased for the unreleased one yet.
    expect((await responsesOf(gateId)).nonResponders).toEqual([]);
  });

  it("names it to the pledge as soon as it is released", async () => {
    ok(await edit(gateId, withSettings({ visibleAt: fromNow(-MINUTE) })));
    const dashboard = await dashboardOf(sam);
    expect(dashboard.forms.find((form) => form.id === waitingId)).toMatchObject({
      state: "locked",
      lockReason: "prerequisite_pending",
      lockedByTitle: UNRELEASED_TITLE,
    });
    expect(dashboard.forms.find((form) => form.id === gateId)).toMatchObject({ state: "open", title: UNRELEASED_TITLE });
    expect(ok<PledgeFormDto>(await openForm(sam, waitingId)).card.lockedByTitle).toBe(UNRELEASED_TITLE);
  });

  it(
    "accepts a response as on time for the rest of the due minute, after the stored due time has passed",
    async () => {
      // The requests below have to land in one clock minute, so this never starts near the end of one.
      if (Date.now() % MINUTE > 40_000) await sleep(MINUTE - (Date.now() % MINUTE) + 250);
      const startOfMinute = Math.floor(Date.now() / MINUTE) * MINUTE;
      if (Date.now() - startOfMinute < 2_000) await sleep(2_000);
      // One second into this minute, stored as the start of it: an instant that has already gone by.
      const due = new Date(startOfMinute + 1_000).toISOString();
      const storedDue = new Date(startOfMinute).toISOString();
      const saved = ok<AdminFormDto>(await edit(gateId, withSettings({ dueAt: due })));
      expect(saved.settings).toMatchObject({ dueAt: storedDue, allowLate: false });
      expect(Date.now()).toBeGreaterThan(Date.parse(due));

      expect(await stateOn(sam, gateId)).toBe("open");
      expect(ok<PledgeFormDto>(await openForm(sam, gateId)).card).toMatchObject({ state: "open", late: false, dueAt: storedDue });

      const submitted = ok<SubmitResultDto>(await submitAs(sam, gateId, { q_a: text("Ready") }));
      expect(submitted.late).toBe(false);
      expect(submitted.unlocked.map((card) => card.id)).toEqual([waitingId]);

      const stored = ok<SubmissionDto>(await call(getSubmission, { formId: gateId }, { token: sam.token }));
      expect(stored).toMatchObject({ late: false, lateBySeconds: 0 });
      expect(Date.parse(stored.submittedAt)).toBeGreaterThan(Date.parse(due));
      expect(Date.parse(stored.submittedAt)).toBeLessThan(startOfMinute + MINUTE);
      const mine = (await responsesOf(gateId)).responses.find((response) => response.uid === sam.uid);
      expect(mine).toMatchObject({ late: false, lateBySeconds: 0 });
    },
    SLOW_TEST_MS,
  );

  it("closes it, with late responses off, once the due minute is over", async () => {
    // The last instant of the minute before this one: its minute has ended, however recently.
    const startOfMinute = Math.floor(Date.now() / MINUTE) * MINUTE;
    ok(await edit(gateId, withSettings({ dueAt: new Date(startOfMinute - 1).toISOString() })));
    expect(await stateOn(jordan, gateId)).toBe("missed");
    refused(await submitAs(jordan, gateId, { q_a: text("Too late") }), 409, "closed");
    expect(await docExists(`submissions/${gateId}_${jordan.uid}`)).toBe(false);
    // Missing the one it waited on leaves the other locked, and says why.
    expect((await dashboardOf(jordan)).forms.find((form) => form.id === waitingId)).toMatchObject({
      state: "locked",
      lockReason: "prerequisite_missed",
      lockedByTitle: UNRELEASED_TITLE,
    });
  });

  it(
    "counts a response in the first second after the due minute as a second late, never none",
    async () => {
      // The submission below lands just after a minute boundary, so it follows the end of
      // the due minute by well under a second: the case a rounded count would call no time late.
      let boundary = Math.floor(Date.now() / MINUTE) * MINUTE + MINUTE;
      if (boundary - Date.now() < 5_000) boundary += MINUTE;
      // Due at the last instant before the boundary. Stored to the minute, its minute still ends there.
      const due = new Date(boundary - 1).toISOString();
      ok(await edit(gateId, withSettings({ dueAt: due, closesAt: fromNow(DAY), allowLate: true })));
      expect(await stateOn(jordan, gateId)).toBe("open");

      await sleep(boundary - Date.now() + 20);
      const submitted = ok<SubmitResultDto>(await submitAs(jordan, gateId, { q_a: text("Just after") }));
      expect(submitted.late).toBe(true);

      const stored = ok<SubmissionDto>(await call(getSubmission, { formId: gateId }, { token: jordan.token }));
      const endOfDueMinute = boundary - 1;
      const submittedMs = Date.parse(stored.submittedAt);
      expect(submittedMs).toBeGreaterThan(endOfDueMinute);
      expect(submittedMs - endOfDueMinute).toBeLessThan(5_000);
      expect(stored.lateBySeconds).toBe(Math.max(1, Math.ceil((submittedMs - endOfDueMinute) / 1000)));
      expect(stored.lateBySeconds).toBeGreaterThanOrEqual(1);
      const mine = (await responsesOf(gateId)).responses.find((response) => response.uid === jordan.uid);
      expect(mine).toMatchObject({ late: true, lateBySeconds: stored.lateBySeconds });
    },
    // Waits for the next minute to begin, which can be most of a minute away.
    SEED_TIMEOUT_MS,
  );
});

describe("question types once there are responses", () => {
  it("refuses to change the type of a question pledges have already answered", async () => {
    const before = await formOf("week0onboarding");
    const asParagraph = await edit("week0onboarding", (form) => ({
      questions: form.questions.map((question) =>
        question.id === "q_major" ? { id: "q_major", type: "paragraph", title: question.title, description: "", required: true } : question,
      ),
    }));
    refused(asParagraph, 409, "question_type_locked");

    const asSection = await edit("week0onboarding", (form) => ({
      questions: form.questions.map((question) =>
        question.id === "q_experience" ? { id: "q_experience", type: "section", title: question.title, description: "" } : question,
      ),
    }));
    refused(asSection, 409, "question_type_locked");
    expect(await formOf("week0onboarding")).toEqual(before);
  });

  it("still allows renaming, adding and removing questions", async () => {
    const saved = ok<AdminFormDto>(
      await edit("week0onboarding", (form) => ({
        title: "Week 0: Onboarding Survey (v2)",
        questions: [
          ...form.questions.filter((question) => question.id !== "q_interests"),
          { id: "q_extra", type: "short_text", title: "Anything we should know?", description: "", required: false, validation: "none" },
        ],
      })),
    );
    expect(saved.questions.map((question) => question.id)).toEqual(["q_major", "q_year", "q_experience", "q_extra"]);
    expect(saved).toMatchObject({ version: 2, responseCount: 5 });
  });

  it("allows any type change on a deliverable with no responses yet", async () => {
    const saved = ok<AdminFormDto>(
      await edit("week3mvpscope", (form) => ({
        questions: form.questions.map((question) =>
          question.id === "q_weeks"
            ? { id: "q_weeks", type: "linear_scale", title: question.title, description: "", required: true, min: 1, max: 10, minLabel: "", maxLabel: "" }
            : question,
        ),
      })),
    );
    expect(saved.questions.find((question) => question.id === "q_weeks")?.type).toBe("linear_scale");
  });
});

describe("taking a deliverable out of circulation", () => {
  it.each(["archived", "draft"] as const)(
    "refuses to move a deliverable to %s while a published one unlocks after it",
    async (status) => {
      const body = refused(await edit("week2interviews", { status }), 409, "has_dependents");
      expect(body.error).toContain('"Week 2: Interview Synthesis"');
      expect((await formOf("week2interviews")).status).toBe("published");
    },
  );

  it("archives it once that link is removed, keeping it for pledges who turned it in", async () => {
    ok(await edit("week2synthesis", withSettings({ prerequisiteFormId: null })));
    const archived = ok<AdminFormDto>(await edit("week2interviews", { status: "archived" }));
    expect(archived).toMatchObject({ status: "archived", responseCount: 4 });
    expect(await latestAudit()).toMatchObject({ action: "form.archive", targetId: "week2interviews" });

    for (const session of [avery, maya, jordan, sam]) expect(await stateOn(session, "week2interviews")).toBe("submitted");
    ok(await call(getSubmission, { formId: "week2interviews" }, { token: maya.token }));
  });

  it("stops chasing pledges for an archived deliverable, and keeps its responses for admins", async () => {
    const view = await responsesOf("week2interviews");
    expect(view.responses).toHaveLength(4);
    expect(view.nonResponders).toEqual([]);
  });

  it("is not blocked by a deliverable that depends on it but is only a draft", async () => {
    ok(await edit("pitchfeedback", withSettings({ prerequisiteFormId: "week1reflection" })));
    const archived = ok<AdminFormDto>(await edit("week1reflection", { status: "archived" }));
    expect(archived.status).toBe("archived");
    // Avery turned it in; Sam never did.
    expect(await stateOn(avery, "week1reflection")).toBe("submitted");
    expect(await stateOn(sam, "week1reflection")).toBeNull();
  });
});

describe("deleting a deliverable", () => {
  it("refuses when it has responses", async () => {
    const body = refused(await call(deleteForm, { formId: "week0onboarding" }, { method: "DELETE", token: admin.token }), 409, "has_responses");
    expect(body.error).toBe("This deliverable has responses. Archive it instead to keep the history.");
    expect(await docExists("forms/week0onboarding")).toBe(true);
    expect(await countWhere("submissions", "formId", "week0onboarding")).toBe(5);
  });

  it("refuses when another deliverable unlocks after it", async () => {
    // Set up in "unlock order": week3mvpscope unlocks after week2synthesis, which has no responses.
    const body = refused(await call(deleteForm, { formId: "week2synthesis" }, { method: "DELETE", token: admin.token }), 409, "has_dependents");
    expect(body.error).toBe('"Week 3: MVP Scope" unlocks after this one. Remove that link first.');
    expect(await docExists("forms/week2synthesis")).toBe(true);
  });

  it("deletes a deliverable with no responses, along with the drafts pledges had started", async () => {
    const { id } = ok<{ id: string }>(await call(createForm, {}, { method: "POST", token: admin.token }));
    ok(
      await edit(id, {
        title: "Short-lived",
        status: "published",
        questions: [CHECK_IN_QUESTIONS[0]],
      }),
    );
    ok(await openForm(jordan, id));
    ok(await call(putDraft, { formId: id }, { method: "PUT", token: maya.token, body: { answers: { q_a: text("Half done") } } }));
    expect(await countWhere("drafts", "formId", id)).toBe(2);

    expect(ok(await call(deleteForm, { formId: id }, { method: "DELETE", token: admin.token }))).toEqual({ ok: true });
    expect(await docExists(`forms/${id}`)).toBe(false);
    expect(await countWhere("drafts", "formId", id)).toBe(0);
    expect(await latestAudit()).toMatchObject({ action: "form.delete", targetType: "form", targetId: id, summary: "Short-lived" });

    expect(await stateOn(jordan, id)).toBeNull();
    refused(await openForm(jordan, id), 404, "not_found");
    refused(await call(getAdminForm, { formId: id }, { token: admin.token }), 404, "not_found");
    refused(await call(deleteForm, { formId: id }, { method: "DELETE", token: admin.token }), 404, "not_found");
  });

  it("is not found for a deliverable that never existed", async () => {
    refused(await call(deleteForm, { formId: "doesnotexist" }, { method: "DELETE", token: admin.token }), 404, "not_found");
  });
});

// Question ids become field names in the stored answers. Firestore reserves names of the
// form __x__, and names such as "constructor" collide with keys every object inherits, so
// a deliverable that uses one is refused when it is saved, before any pledge can answer it.
describe("question ids the database cannot store answers under", () => {
  it.each(["__q__", "__proto__", "constructor"])("refuses to save a deliverable with the question id %s", async (questionId) => {
    const { id } = ok<{ id: string }>(await call(createForm, {}, { method: "POST", token: admin.token }));
    try {
      const saved = await edit(id, {
        title: "Reserved question id",
        status: "published",
        questions: [{ id: questionId, type: "short_text", title: "Anything", description: "", required: false, validation: "none" }],
      });
      refused(saved, 422, "invalid");
      // Nothing of the refused save is stored: the deliverable is still the untouched draft.
      expect(await docData(`forms/${id}`)).toMatchObject({ status: "draft", title: "Untitled deliverable", version: 1 });
    } finally {
      await call(deleteForm, { formId: id }, { method: "DELETE", token: admin.token });
    }
  });
});

describe("reopening a response", () => {
  const reopen = (formId: string, uid: string) => call(reopenResponse, { formId, uid }, { method: "DELETE", token: admin.token });

  it("deletes the response and lets the pledge turn the deliverable in again", async () => {
    expect(await stateOn(maya, "week0onboarding")).toBe("submitted");
    expect(ok(await reopen("week0onboarding", maya.uid))).toEqual({ ok: true });

    expect(await docExists(`submissions/week0onboarding_${maya.uid}`)).toBe(false);
    expect(Object.keys((await docData(`users/${maya.uid}`))?.submitted as object)).toEqual(["week2interviews"]);
    refused(await call(getSubmission, { formId: "week0onboarding" }, { token: maya.token }), 404, "not_found");
    // The deadline passed two weeks ago and late responses are accepted, so it comes back as late.
    expect(await stateOn(maya, "week0onboarding")).toBe("open_late");
  });

  it("moves the pledge from the responses to the people still to respond", async () => {
    const view = await responsesOf("week0onboarding");
    expect(view.responses.map((response) => response.email)).not.toContain(MAYA);
    expect(view.responses).toHaveLength(4);
    expect(view.nonResponders.map((pledge) => [pledge.displayName, pledge.state])).toEqual([
      ["Casey Kim", "open_late"],
      ["Maya Rodriguez", "open_late"],
    ]);
  });

  it("audits the reopening against the deliverable as the pledge answered it", async () => {
    expect(await latestAudit()).toMatchObject({
      action: "response.reopen",
      targetType: "submission",
      targetId: `week0onboarding_${maya.uid}`,
      actorEmail: ADMIN_ONE,
      summary: `Reopened "Week 0: Onboarding Survey" for ${MAYA}`,
    });
  });

  it("leaves every other response alone", async () => {
    expect(await docExists(`submissions/week0onboarding_${sam.uid}`)).toBe(true);
    expect(await docExists(`submissions/week2interviews_${maya.uid}`)).toBe(true);
    expect(await stateOn(sam, "week0onboarding")).toBe("submitted");
  });

  it("accepts the pledge's new response, against the questions as they are now, and marks it late", async () => {
    const submitted = ok<SubmitResultDto>(
      await submitAs(maya, "week0onboarding", {
        q_major: text("Biology"),
        q_year: { kind: "choice", optionId: "o_second", other: null },
        q_experience: { kind: "scale", value: 2 },
        q_extra: text("Switched majors."),
      }),
    );
    expect(submitted.late).toBe(true);
    const view = await responsesOf("week0onboarding");
    const mine = view.responses.find((response) => response.uid === maya.uid);
    expect(mine).toMatchObject({ late: true, formVersion: 2 });
    expect(mine?.answers.q_extra).toEqual(text("Switched majors."));
    expect(view.responses).toHaveLength(5);
  });

  it("is not found when there is no such response, and audits nothing", async () => {
    const before = await countAll("auditLog");
    const body = refused(await reopen("week0onboarding", caseyUid), 404, "not_found");
    expect(body.error).toBe("That response doesn't exist.");
    refused(await reopen("doesnotexist", sam.uid), 404, "not_found");
    refused(await reopen("week0onboarding", "nobody123"), 404, "not_found");
    expect(await countAll("auditLog")).toBe(before);
  });
});

// A stored response holds the answers and a copy of the questions, and a Firestore
// document may not exceed one mebibyte. The pledge is told, instead of the save failing.
describe("a response too large to store", () => {
  const PARAGRAPHS: Question[] = Array.from({ length: LIMITS.maxQuestions }, (_, index) => ({
    id: `q${index}`,
    type: "paragraph",
    title: `P${index}`,
    description: "",
    required: false,
  }));
  /** What the response would take up in the store: the answers and the questions as they are. */
  const storedBytes = (answers: Answers, questions: Question[]): number =>
    Buffer.byteLength(JSON.stringify(answers)) + Buffer.byteLength(JSON.stringify(questions));
  /** An answer of `length` three-byte characters to every paragraph, the last one `lastLength` long. */
  const answersOf = (length: number, lastLength = length): Answers =>
    Object.fromEntries(
      PARAGRAPHS.map((question, index) => [question.id, text("字".repeat(index === PARAGRAPHS.length - 1 ? lastLength : length))]),
    );
  let formId: string;

  afterAll(async () => {
    await call(reopenResponse, { formId, uid: sam.uid }, { method: "DELETE", token: admin.token });
    await call(deleteForm, { formId }, { method: "DELETE", token: admin.token });
  });

  it("refuses answers that, together with the questions, would not fit, and says what to do", async () => {
    formId = ok<{ id: string }>(await call(createForm, {}, { method: "POST", token: admin.token })).id;
    ok(await edit(formId, { title: "Sixty paragraphs", status: "published", questions: PARAGRAPHS }));
    const { questions } = await formOf(formId);

    // Sixty answers of five thousand three-byte characters: 900 KB of answers alone.
    const tooMuch = answersOf(LIMITS.paragraph);
    expect(storedBytes(tooMuch, questions)).toBeGreaterThan(LIMITS.submissionStoredBytes);
    // Within what one request may carry, so it is the stored size that is refused, not the request.
    expect(Buffer.byteLength(JSON.stringify({ answers: tooMuch, formVersion: 1 }))).toBeLessThan(LIMITS.answersBodyBytes);

    const body = refused(await submitAs(sam, formId, tooMuch), 422, "invalid");
    expect(body.error).toBe("Some answers need attention.");
    expect(body.fields).toEqual([
      { path: "answers", code: "too_long", message: "Your answers are too long to store together. Shorten the longest ones and try again." },
    ]);
    expect(await docExists(`submissions/${formId}_${sam.uid}`)).toBe(false);
    expect(await stateOn(sam, formId)).toBe("open");
  });

  it("stores the same answers once they are shortened just enough to fit", async () => {
    const { questions } = await formOf(formId);
    const over = storedBytes(answersOf(LIMITS.paragraph), questions) - LIMITS.submissionStoredBytes;
    // Each character is three bytes: this many fewer in the last answer lands within the limit by under three.
    const fits = answersOf(LIMITS.paragraph, LIMITS.paragraph - Math.ceil(over / 3));
    expect(storedBytes(fits, questions)).toBeLessThanOrEqual(LIMITS.submissionStoredBytes);
    expect(storedBytes(fits, questions)).toBeGreaterThan(LIMITS.submissionStoredBytes - 3);

    ok<SubmitResultDto>(await submitAs(sam, formId, fits));
    const stored = ok<SubmissionDto>(await call(getSubmission, { formId }, { token: sam.token }));
    expect(stored.answers).toEqual(fits);
    expect(await stateOn(sam, formId)).toBe("submitted");
  });
});

describe("audit log", () => {
  const page = async (query = "", session: Session = admin): Promise<AuditLogDto> =>
    ok<AuditLogDto>(await call(getAudit, {}, { token: session.token, query }));

  /** Follows nextBefore until the log runs out and returns every entry seen, newest first. */
  async function allEntries(): Promise<AuditLogDto["entries"]> {
    const entries: AuditLogDto["entries"] = [];
    let query = "";
    for (let pages = 0; pages < 20; pages += 1) {
      const result = await page(query);
      entries.push(...result.entries);
      if (result.nextBefore === null) return entries;
      query = `?before=${encodeURIComponent(result.nextBefore)}`;
    }
    throw new Error("The audit log never reached its last page.");
  }

  /** Every entry id in the log, in order. */
  const walk = async (): Promise<string[]> => (await allEntries()).map((entry) => entry.id);

  const fixture = (at: number, label: string) => ({
    at: Timestamp.fromMillis(at),
    actorUid: admin.uid,
    actorEmail: ADMIN_ONE,
    action: "test.fixture",
    targetType: "form" as const,
    targetId: "fixture",
    summary: label,
  });

  it("records every kind of change made to deliverables and responses in this file", async () => {
    const actions = (await allEntries()).map((entry) => entry.action);
    for (const action of [
      "form.create",
      "form.duplicate",
      "form.publish",
      "form.update",
      "form.unpublish",
      "form.archive",
      "form.delete",
      "response.reopen",
    ]) {
      expect(actions, action).toContain(action);
    }
  });

  it("returns entries newest first with who did what to what, and no internal ids of the actor", async () => {
    const { entries } = await page();
    expect(entries.length).toBeGreaterThan(15);
    const times = entries.map((entry) => Date.parse(entry.at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual(["action", "actorEmail", "at", "id", "summary", "targetId", "targetType"]);
      expect([ADMIN_ONE, ADMIN_TWO]).toContain(entry.actorEmail);
    }
    // The oldest entry, on whichever page the log ends, is the one the seed wrote.
    const everything = await allEntries();
    expect(everything).toHaveLength(await countAll("auditLog"));
    expect(everything[everything.length - 1]).toMatchObject({ action: "form.publish", targetId: "week0onboarding" });
  });

  it("is readable by every admin and by no pledge", async () => {
    expect((await page("", adminTwo)).entries.length).toBeGreaterThan(15);
    for (const session of [sam, avery, jordan, maya]) {
      refused(await call(getAudit, {}, { token: session.token }), 403, "forbidden");
    }
    refused(await call(getAudit, {}, {}), 401, "unauthenticated");
  });

  it("does not let a pledge's actions appear as audit entries of their own making", async () => {
    const pledgeUids = new Set([sam.uid, avery.uid, jordan.uid, maya.uid]);
    for (const entry of await storedAudit()) expect(pledgeUids.has(entry.actorUid)).toBe(false);
  });

  it("returns only entries strictly older than the `before` cursor", async () => {
    const { entries } = await page();
    const cursor = entries[2].at;
    const older = await page(`?before=${encodeURIComponent(cursor)}`);
    // Everything but the three newest, or as much of that as fits on a page.
    expect(older.entries.length).toBe(Math.min(LIMITS.auditPageSize, (await countAll("auditLog")) - 3));
    for (const entry of older.entries) expect(Date.parse(entry.at)).toBeLessThan(Date.parse(cursor));
    expect(older.entries[0].id).toBe(entries[3].id);
  });

  it.each(["?before=yesterday", "?before=", "?before=2026-02-30T00:00:00Z", "?before=1791540000000"])(
    "ignores the malformed cursor %s and returns the first page",
    async (query) => {
      expect((await page(query)).entries.map((entry) => entry.id)).toEqual((await page()).entries.map((entry) => entry.id));
    },
  );

  it("pages through a long log 50 at a time without repeating or skipping an entry", async () => {
    const batch = testDb().batch();
    const base = Date.UTC(2020, 0, 1);
    for (let index = 0; index < 60; index += 1) {
      batch.create(testDb().collection("auditLog").doc(), fixture(base + index * MINUTE, `old ${index}`));
    }
    await batch.commit();
    const total = await countAll("auditLog");
    expect(total).toBeGreaterThan(LIMITS.auditPageSize);

    const first = await page();
    expect(first.entries).toHaveLength(LIMITS.auditPageSize);
    expect(first.nextBefore).not.toBeNull();

    const ids = await walk();
    expect(ids).toHaveLength(total);
    expect(new Set(ids).size).toBe(total);
  });

  it("offers a further page only when there is one", async () => {
    // The 60 old fixtures sit one minute apart from 2020-01-01T00:00Z.
    const before = (minute: number) => page(`?before=${encodeURIComponent(new Date(Date.UTC(2020, 0, 1, 0, minute)).toISOString())}`);

    const partial = await before(10);
    expect(partial.entries).toHaveLength(10);
    expect(partial.nextBefore).toBeNull();

    const exactlyOnePage = await before(LIMITS.auditPageSize);
    expect(exactlyOnePage.entries).toHaveLength(LIMITS.auditPageSize);
    expect(exactlyOnePage.nextBefore).toBeNull();

    const onePageAndOne = await before(LIMITS.auditPageSize + 1);
    expect(onePageAndOne.entries).toHaveLength(LIMITS.auditPageSize);
    expect(onePageAndOne.nextBefore).not.toBeNull();

    expect(await page(`?before=${encodeURIComponent("2019-01-01T00:00:00.000Z")}`)).toEqual({ entries: [], nextBefore: null });
  });

  // The cursor carries the id of the last entry as well as its time, so entries that share
  // that millisecond with it and did not fit on the page come back on the next one.
  it("does not skip entries that share a timestamp with the last entry of a page", async () => {
    const tied = Date.now() + DAY;
    const refs = Array.from({ length: LIMITS.auditPageSize + 2 }, () => testDb().collection("auditLog").doc());
    const batch = testDb().batch();
    // 49 entries at distinct, newer instants, then three that share one instant: the
    // first of the three is the 50th entry, and the other two belong on the next page.
    refs.forEach((ref, index) => {
      const at = index < LIMITS.auditPageSize - 1 ? tied + (LIMITS.auditPageSize - index) * MINUTE : tied;
      batch.create(ref, fixture(at, `tie ${index}`));
    });
    await batch.commit();
    try {
      const total = await countAll("auditLog");
      const ids = await walk();
      const tiedIds = refs.slice(LIMITS.auditPageSize - 1).map((ref) => ref.id);
      expect(ids.filter((id) => tiedIds.includes(id)).sort()).toEqual([...tiedIds].sort());
      expect(new Set(ids).size).toBe(total);
    } finally {
      const cleanup = testDb().batch();
      refs.forEach((ref) => cleanup.delete(ref));
      await cleanup.commit();
    }
  });
});
