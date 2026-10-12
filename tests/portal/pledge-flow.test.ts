/**
 * What a pledge can see and do: the dashboard, opening a deliverable, drafts,
 * submitting, history and time tracking. Tests run in order and build on each
 * other, starting from a fresh seed.
 *
 * Seeded standing (see scripts/portal/seed-emulator.mjs):
 *   Sam     week0 submitted on time, week1 missed, interviews open, synthesis locked, week3 upcoming
 *   Jordan  week0 submitted late, week1 submitted, interviews open, synthesis locked
 *   Maya    week0 and interviews submitted, week1 missed, synthesis open
 *   Avery   week0, week1 and interviews submitted, synthesis open
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getAdminForm } from "@/app/api/portal/admin/forms/[formId]/route";
import { DELETE as reopenResponse } from "@/app/api/portal/admin/forms/[formId]/responses/[uid]/route";
import { GET as getResponses } from "@/app/api/portal/admin/forms/[formId]/responses/route";
import { GET as getPledgeDetail } from "@/app/api/portal/admin/pledges/[uid]/route";
import { GET as getDashboard } from "@/app/api/portal/dashboard/route";
import { PUT as putDraft } from "@/app/api/portal/forms/[formId]/draft/route";
import { GET as getForm } from "@/app/api/portal/forms/[formId]/route";
import { POST as submit } from "@/app/api/portal/forms/[formId]/submit/route";
import { POST as heartbeat } from "@/app/api/portal/heartbeat/route";
import { POST as signOut } from "@/app/api/portal/sign-out/route";
import { GET as getSubmission } from "@/app/api/portal/submissions/[formId]/route";
import { GET as listSubmissions } from "@/app/api/portal/submissions/route";
import { TIMING } from "@/lib/portal/constants";
import { resetRateLimits } from "@/lib/portal/server/rate-limit";
import type {
  AdminFormDto,
  Answers,
  DashboardDto,
  DraftSavedDto,
  FormCardDto,
  FormResponsesDto,
  PledgeDetailDto,
  PledgeFormDto,
  SubmissionDto,
  SubmissionHistoryDto,
  SubmitResultDto,
} from "@/lib/portal/types";
import {
  ADMIN_ONE,
  AVERY,
  DAY_SECONDS,
  JORDAN,
  MAYA,
  SAM,
  SEED_TIMEOUT_MS,
  SLOW_TEST_MS,
  ageLastHeartbeat,
  call,
  countAll,
  countSessions,
  countWhere,
  docData,
  docExists,
  fieldCodes,
  ok,
  refused,
  seedPortal,
  signIn,
  sleep,
  testDb,
  type Session,
} from "./helpers";

const FORM_IDS = ["week0onboarding", "week1reflection", "week2interviews", "week2synthesis", "week3mvpscope", "pitchfeedback"];

const INTERVIEW_ANSWERS: Answers = {
  q_count: { kind: "text", value: "4" },
  q_date: { kind: "text", value: "2026-10-05" },
  q_time: { kind: "text", value: "14:30" },
  q_surprise: { kind: "text", value: "People cared more about time than money." },
  q_notes: { kind: "text", value: "https://docs.google.com/document/d/interview-notes" },
};

const SYNTHESIS_ANSWERS: Answers = {
  q_insight1: { kind: "text", value: "Time matters more than money." },
  q_insight2: { kind: "text", value: "Workarounds already exist." },
  q_pivot: { kind: "choice", optionId: "o_refined", other: null },
};

const ONBOARDING_ANSWERS: Answers = {
  q_major: { kind: "text", value: "Biology" },
  q_year: { kind: "choice", optionId: "o_second", other: null },
  q_interests: { kind: "choices", optionIds: ["o_health"], other: "Biotech" },
  q_experience: { kind: "scale", value: 2 },
};

let admin: Session;
let avery: Session;
let jordan: Session;
let maya: Session;
let sam: Session;

const dashboardOf = async (session: Session): Promise<DashboardDto> =>
  ok<DashboardDto>(await call(getDashboard, {}, { token: session.token }));

const cardOf = (dashboard: DashboardDto, id: string): FormCardDto => {
  const card = dashboard.forms.find((form) => form.id === id);
  if (!card) throw new Error(`No card for ${id} on the dashboard`);
  return card;
};

const openForm = (session: Session, formId: string) => call(getForm, { formId }, { token: session.token });
const saveDraft = (session: Session, formId: string, body: unknown) =>
  call(putDraft, { formId }, { method: "PUT", token: session.token, body });
const submitAs = (session: Session, formId: string, body: unknown) =>
  call(submit, { formId }, { method: "POST", token: session.token, body });

beforeAll(async () => {
  await seedPortal();
  [admin, avery, jordan, maya, sam] = await Promise.all([ADMIN_ONE, AVERY, JORDAN, MAYA, SAM].map((email) => signIn(email)));
}, SEED_TIMEOUT_MS);

beforeEach(() => {
  resetRateLimits();
});

describe("dashboard", () => {
  it("lists the deliverables that apply to the pledge, earliest deadline first, each in its state", async () => {
    const dashboard = await dashboardOf(sam);
    expect(dashboard.forms.map((form) => [form.id, form.state])).toEqual([
      ["week0onboarding", "submitted"],
      ["week1reflection", "missed"],
      ["week2interviews", "open"],
      ["week2synthesis", "locked"],
      ["week3mvpscope", "upcoming"],
    ]);
    expect(Math.abs(Date.parse(dashboard.serverNow) - Date.now())).toBeLessThan(60_000);
  });

  it("hides draft deliverables completely", async () => {
    for (const session of [sam, avery, jordan, maya]) {
      const result = await call(getDashboard, {}, { token: session.token });
      const dashboard = ok<DashboardDto>(result);
      expect(dashboard.forms.map((form) => form.id)).not.toContain("pitchfeedback");
      expect(result.text).not.toContain("Pitch Night Feedback");
      expect(result.text).not.toContain("Not visible to pledges yet");
      expect(dashboard.progress.total).toBe(5);
    }
  });

  it("never includes questions, for any deliverable in any state", async () => {
    const questionText: string[] = [];
    for (const formId of FORM_IDS) {
      const form = ok<AdminFormDto>(await call(getAdminForm, { formId }, { token: admin.token }));
      for (const question of form.questions) questionText.push(question.id, question.title);
    }
    expect(questionText.length).toBeGreaterThan(40);

    for (const session of [sam, avery, jordan, maya]) {
      const result = await call(getDashboard, {}, { token: session.token });
      const dashboard = ok<DashboardDto>(result);
      for (const card of dashboard.forms) {
        expect(card).not.toHaveProperty("questions");
        expect(card).not.toHaveProperty("settings");
      }
      expect(result.text).not.toContain('"questions"');
      for (const fragment of questionText) expect(result.text).not.toContain(fragment);
    }
  });

  it("describes each card with what a pledge may know before opening it", async () => {
    const dashboard = await dashboardOf(sam);

    expect(cardOf(dashboard, "week0onboarding")).toMatchObject({
      title: "Week 0: Onboarding Survey",
      state: "submitted",
      late: false,
      lockReason: null,
      lockedByTitle: null,
      allowLate: true,
      questionCount: 4,
      draftUpdatedAt: null,
    });
    expect(cardOf(dashboard, "week0onboarding").submittedAt).not.toBeNull();

    // Five blocks, one of which is a section.
    expect(cardOf(dashboard, "week1reflection")).toMatchObject({ state: "missed", questionCount: 4, submittedAt: null });

    const open = cardOf(dashboard, "week2interviews");
    expect(open).toMatchObject({ state: "open", late: false, allowLate: true, questionCount: 5, draftUpdatedAt: null });
    expect(Date.parse(open.dueAt ?? "")).toBeGreaterThan(Date.now());
    expect(Date.parse(open.closesAt ?? "")).toBeGreaterThan(Date.parse(open.dueAt ?? ""));

    expect(cardOf(dashboard, "week2synthesis")).toMatchObject({
      state: "locked",
      lockReason: "prerequisite_pending",
      lockedByTitle: "Week 2: Customer Discovery Interviews",
      late: false,
    });

    const upcoming = cardOf(dashboard, "week3mvpscope");
    expect(upcoming.state).toBe("upcoming");
    expect(Date.parse(upcoming.opensAt ?? "")).toBeGreaterThan(Date.now() + 2 * DAY_SECONDS * 1000);
  });

  it("summarizes progress against released deliverables", async () => {
    expect((await dashboardOf(sam)).progress).toEqual({
      total: 5,
      released: 4,
      submitted: 1,
      onTime: 1,
      late: 0,
      missed: 1,
      outstanding: 2,
      upcoming: 1,
      completionPct: 25,
    });
    expect((await dashboardOf(avery)).progress).toMatchObject({ submitted: 3, onTime: 3, missed: 0, outstanding: 1, completionPct: 75 });
  });

  it("shows a late submission as late", async () => {
    const dashboard = await dashboardOf(jordan);
    expect(cardOf(dashboard, "week0onboarding")).toMatchObject({ state: "submitted", late: true });
    expect(cardOf(dashboard, "week1reflection")).toMatchObject({ state: "submitted", late: false });
    expect(dashboard.progress).toMatchObject({ submitted: 2, onTime: 1, late: 1 });
  });

  it("unlocks a chained deliverable for pledges who have turned in its prerequisite", async () => {
    for (const session of [avery, maya]) {
      expect(cardOf(await dashboardOf(session), "week2synthesis")).toMatchObject({
        state: "open",
        lockReason: null,
        lockedByTitle: null,
      });
    }
  });

  it("shows active punishments only, and only the pledge's own", async () => {
    const samDashboard = await dashboardOf(sam);
    expect(samDashboard.punishments).toHaveLength(1);
    expect(samDashboard.punishments[0]).toMatchObject({
      uid: sam.uid,
      title: "Missed the Week 1 deliverable",
      status: "active",
      resolvedAt: null,
    });
    // Jordan's only punishment is resolved; Avery has none.
    expect((await dashboardOf(jordan)).punishments).toEqual([]);
    expect((await dashboardOf(avery)).punishments).toEqual([]);
  });
});

describe("opening a deliverable", () => {
  it("sends the questions and starts an empty draft when the deliverable is open", async () => {
    expect(await docExists(`drafts/week2interviews_${sam.uid}`)).toBe(false);
    const form = ok<PledgeFormDto>(await openForm(sam, "week2interviews"));
    expect(form.card).toMatchObject({ id: "week2interviews", state: "open", draftUpdatedAt: null });
    expect(form.questions?.map((question) => question.id)).toEqual(["q_count", "q_date", "q_time", "q_surprise", "q_notes"]);
    expect(form.draft?.answers).toEqual({});
    // The edit of the deliverable these questions belong to, which the page sends back when it submits.
    expect(form.version).toBe(1);
    expect(form.version).toBe(ok<AdminFormDto>(await call(getAdminForm, { formId: "week2interviews" }, { token: admin.token })).version);
    expect(await docData(`drafts/week2interviews_${sam.uid}`)).toMatchObject({
      formId: "week2interviews",
      uid: sam.uid,
      answers: {},
      activeSeconds: 0,
    });
  });

  it("starts the response clock once: opening again does not restart it", async () => {
    const first = await docData(`drafts/week2interviews_${sam.uid}`);
    await sleep(20);
    ok(await openForm(sam, "week2interviews"));
    const second = await docData(`drafts/week2interviews_${sam.uid}`);
    expect(second?.startedAt).toEqual(first?.startedAt);
  });

  it.each<[string, string, Partial<FormCardDto>]>([
    ["locked", "week2synthesis", { state: "locked", lockReason: "prerequisite_pending", lockedByTitle: "Week 2: Customer Discovery Interviews" }],
    ["upcoming", "week3mvpscope", { state: "upcoming", lockReason: null }],
    ["missed", "week1reflection", { state: "missed" }],
    ["already submitted", "week0onboarding", { state: "submitted", late: false }],
  ])("withholds the questions of a deliverable that is %s, and starts no clock", async (_label, formId, card) => {
    const result = await openForm(sam, formId);
    const form = ok<PledgeFormDto>(result);
    expect(form.card).toMatchObject(card);
    expect(form.questions).toBeNull();
    expect(form.draft).toBeNull();
    expect(form.version).toBe(1);
    expect(result.text).not.toMatch(/"q_[a-z0-9]+"/);
    expect(await docExists(`drafts/${formId}_${sam.uid}`)).toBe(false);
  });

  it("does not leak the text of withheld questions anywhere in the response", async () => {
    const locked = await openForm(sam, "week2synthesis");
    expect(locked.text).not.toContain("Insight 1");
    expect(locked.text).not.toContain("Did the interviews change your idea?");
    // The description is public and mentions the topic; the question titles are what must stay back.
    const upcoming = await openForm(sam, "week3mvpscope");
    expect(upcoming.text).not.toContain("What is your riskiest assumption?");
    expect(upcoming.text).not.toContain("What is in your MVP, and what did you cut?");
    expect(upcoming.text).not.toContain("How many weeks will it take to build?");
  });

  it("answers for a draft deliverable exactly as it does for one that does not exist", async () => {
    const hidden = await openForm(sam, "pitchfeedback");
    const missing = await openForm(sam, "doesnotexist");
    refused(hidden, 404, "not_found");
    refused(missing, 404, "not_found");
    expect(hidden.text).toBe(missing.text);
    expect(await docExists(`drafts/pitchfeedback_${sam.uid}`)).toBe(false);
  });
});

describe("drafts", () => {
  it("keeps what was typed in an autosave and drops only what cannot belong to the form", async () => {
    const saved = ok<DraftSavedDto>(
      await saveDraft(sam, "week2interviews", {
        answers: {
          q_count: { kind: "text", value: "  4  " },
          q_date: { kind: "text", value: "2026-02-30" },
          q_time: { kind: "text", value: "25:00" },
          q_surprise: { kind: "text", value: "They cared about time\r\nnot money\u0000" },
          q_notes: { kind: "text", value: "javascript:alert(document.cookie)" },
          q_ghost: { kind: "text", value: "not a question on this form" },
        },
        uid: avery.uid,
        formId: "week1reflection",
      }),
    );
    expect(Date.parse(saved.updatedAt)).toBeGreaterThan(Date.now() - 60_000);

    const form = ok<PledgeFormDto>(await openForm(sam, "week2interviews"));
    // Text is kept as typed, even where it would not pass when turned in: saving
    // must never throw work away. An impossible date or time, and an answer to a
    // question the form does not have, are dropped.
    expect(form.draft?.answers).toEqual({
      q_count: { kind: "text", value: "4" },
      q_surprise: { kind: "text", value: "They cared about time\nnot money" },
      q_notes: { kind: "text", value: "javascript:alert(document.cookie)" },
    });
    expect(form.draft?.updatedAt).toBe(saved.updatedAt);
    expect(form.card.draftUpdatedAt).toBe(saved.updatedAt);
  });

  it("stores the draft under the caller's own uid and form, whatever the body claims", async () => {
    const stored = await docData(`drafts/week2interviews_${sam.uid}`);
    expect(stored).toMatchObject({ uid: sam.uid, formId: "week2interviews" });
    expect(Object.keys(stored?.answers as object).sort()).toEqual(["q_count", "q_notes", "q_surprise"]);
    expect(await countWhere("drafts", "uid", avery.uid)).toBe(0);
    expect(await docExists(`drafts/week1reflection_${sam.uid}`)).toBe(false);
  });

  it("marks the deliverable as in progress on the dashboard once something is typed", async () => {
    expect(cardOf(await dashboardOf(sam), "week2interviews").draftUpdatedAt).not.toBeNull();
  });

  it("keeps each pledge's draft private to them", async () => {
    const form = ok<PledgeFormDto>(await openForm(jordan, "week2interviews"));
    expect(form.draft?.answers).toEqual({});
    expect(cardOf(await dashboardOf(jordan), "week2interviews").draftUpdatedAt).toBeNull();
  });

  // A save that carries no answers at all is a broken request, not an empty draft:
  // read as empty, it would wipe what the pledge has typed so far.
  it.each<[string, unknown]>([
    ["missing", {}],
    ["null", { answers: null }],
    ["a string", { answers: "q_count=4" }],
    ["an array", { answers: [{ kind: "text", value: "4" }] }],
    ["a number", { answers: 4 }],
  ])("refuses a save whose answers are %s, and leaves the draft as it was", async (_label, body) => {
    const before = await docData(`drafts/week2interviews_${sam.uid}`);
    expect(Object.keys(before?.answers as object)).toHaveLength(3);
    const refusal = refused(await saveDraft(sam, "week2interviews", body), 422, "invalid");
    expect(fieldCodes(refusal)).toEqual(["answers:required"]);
    expect(refusal.fields?.[0]).toMatchObject({ path: "answers" });
    expect(await docData(`drafts/week2interviews_${sam.uid}`)).toEqual(before);
    expect(cardOf(await dashboardOf(sam), "week2interviews").draftUpdatedAt).not.toBeNull();
  });

  it("clears the draft when the answers sent are an empty object", async () => {
    ok(await saveDraft(sam, "week2interviews", { answers: {} }));
    const form = ok<PledgeFormDto>(await openForm(sam, "week2interviews"));
    expect(form.draft?.answers).toEqual({});
    expect(form.card.draftUpdatedAt).toBeNull();
  });

  it.each<[string, string, number, string]>([
    ["locked", "week2synthesis", 409, "locked"],
    ["upcoming", "week3mvpscope", 409, "not_open"],
    ["missed", "week1reflection", 409, "closed"],
    ["already submitted", "week0onboarding", 409, "already_submitted"],
    ["a hidden draft", "pitchfeedback", 404, "not_found"],
    ["nonexistent", "doesnotexist", 404, "not_found"],
  ])("refuses to save a draft for a deliverable that is %s", async (_label, formId, status, code) => {
    refused(await saveDraft(sam, formId, { answers: { q_insight1: { kind: "text", value: "early" } } }), status, code);
    expect(await docExists(`drafts/${formId}_${sam.uid}`)).toBe(false);
  });
});

describe("submitting", () => {
  it.each<[string, string, number, string]>([
    ["locked", "week2synthesis", 409, "locked"],
    ["upcoming", "week3mvpscope", 409, "not_open"],
    ["missed", "week1reflection", 409, "closed"],
    ["a hidden draft", "pitchfeedback", 404, "not_found"],
    ["nonexistent", "doesnotexist", 404, "not_found"],
  ])("refuses a deliverable that is %s without validating, so nothing about its questions leaks", async (_label, formId, status, code) => {
    const body = refused(await submitAs(sam, formId, { answers: {} }), status, code);
    expect(body).not.toHaveProperty("fields");
    expect(await docExists(`submissions/${formId}_${sam.uid}`)).toBe(false);
  });

  it("rejects invalid answers with 422 and the path of every field at fault", async () => {
    const body = refused(
      await submitAs(sam, "week2interviews", {
        answers: {
          q_count: { kind: "text", value: "about four" },
          q_date: { kind: "text", value: "2026-02-30" },
          q_time: { kind: "text", value: "2pm" },
          q_notes: { kind: "text", value: "javascript:alert(1)" },
        },
        formVersion: 1,
      }),
      422,
      "invalid",
    );
    expect(body.error).toBe("Some answers need attention.");
    expect(fieldCodes(body)).toEqual([
      "answers.q_count:invalid_number",
      "answers.q_date:invalid_date",
      "answers.q_notes:invalid_url",
      "answers.q_surprise:required",
      "answers.q_time:invalid_time",
    ]);
    for (const field of body.fields ?? []) expect(field.message.length).toBeGreaterThan(0);
  });

  it("rejects a submission with no answers at all, naming each required question", async () => {
    const body = refused(await submitAs(sam, "week2interviews", { answers: {}, formVersion: 1 }), 422, "invalid");
    expect(fieldCodes(body)).toEqual([
      "answers.q_count:required",
      "answers.q_date:required",
      "answers.q_notes:required",
      "answers.q_surprise:required",
    ]);
    const missingKey = refused(await submitAs(sam, "week2interviews", { formVersion: 1 }), 422, "invalid");
    expect(fieldCodes(missingKey)).toEqual(["answers:invalid"]);
  });

  // The page says which edit of the deliverable it showed. A submission that does not
  // say is not one the page made, and is refused before its answers are looked at.
  it.each<[string, Record<string, unknown>]>([
    ["missing", {}],
    ["null", { formVersion: null }],
    ["the current version as text", { formVersion: "1" }],
    ["a boolean", { formVersion: true }],
  ])("refuses a submission whose version is %s, before judging the answers", async (_label, versionField) => {
    const body = refused(await submitAs(sam, "week2interviews", { answers: INTERVIEW_ANSWERS, ...versionField }), 422, "invalid");
    expect(body.error).toBe("Reload the deliverable and submit again.");
    expect(fieldCodes(body)).toEqual(["formVersion:required"]);
    expect(body.fields?.[0]).toMatchObject({ path: "formVersion" });
    expect(await docExists(`submissions/week2interviews_${sam.uid}`)).toBe(false);
  });

  it("stores nothing when a submission is rejected", async () => {
    expect(await docExists(`submissions/week2interviews_${sam.uid}`)).toBe(false);
    expect(cardOf(await dashboardOf(sam), "week2interviews").state).toBe("open");
    refused(await call(getSubmission, { formId: "week2interviews" }, { token: sam.token }), 404, "not_found");
  });

  describe("answered against another edit of the deliverable", () => {
    const stored = async () => ({
      submission: await docExists(`submissions/week2interviews_${sam.uid}`),
      draft: await docData(`drafts/week2interviews_${sam.uid}`),
      submitted: (await docData(`users/${sam.uid}`))?.submitted,
    });

    it.each<[string, number]>([
      ["an earlier version", 0],
      ["a later version", 2],
      ["a version far ahead", 9_999],
      ["a version that is not a whole number", 1.5],
      ["a negative version", -1],
    ])("refuses valid answers sent with %s with 409 form_changed, and stores nothing", async (_label, formVersion) => {
      const before = await stored();
      expect(before.submission).toBe(false);
      const result = await submitAs(sam, "week2interviews", { answers: INTERVIEW_ANSWERS, formVersion });
      const body = refused(result, 409, "form_changed");
      expect(body.error).toBe("This deliverable was updated while you had it open. Check your answers, then submit again.");
      expect(body).not.toHaveProperty("fields");
      expect(await stored()).toEqual(before);
      expect(cardOf(await dashboardOf(sam), "week2interviews").state).toBe("open");
    });

    it("says the deliverable changed rather than listing problems with answers to questions that may be gone", async () => {
      const body = refused(await submitAs(sam, "week2interviews", { answers: {}, formVersion: 2 }), 409, "form_changed");
      expect(body).not.toHaveProperty("fields");
      // The same answers against the current version are told what is missing.
      refused(await submitAs(sam, "week2interviews", { answers: {}, formVersion: 1 }), 422, "invalid");
    });

    it("does not let the version be used to probe a deliverable that is not open: its own refusal comes first", async () => {
      refused(await submitAs(sam, "week2synthesis", { answers: {}, formVersion: 99 }), 409, "locked");
      refused(await submitAs(sam, "week3mvpscope", { answers: {}, formVersion: 99 }), 409, "not_open");
      refused(await submitAs(sam, "week1reflection", { answers: {}, formVersion: 99 }), 409, "closed");
      refused(await submitAs(sam, "week0onboarding", { answers: {}, formVersion: 99 }), 409, "already_submitted");
      refused(await submitAs(sam, "pitchfeedback", { answers: {}, formVersion: 99 }), 404, "not_found");
    });
  });

  it("accepts a valid submission, confirms it and reports what it unlocked", async () => {
    const result = await submitAs(sam, "week2interviews", {
      answers: {
        ...INTERVIEW_ANSWERS,
        q_surprise: { kind: "text", value: "  People cared more about time than money.  " },
        q_ghost: { kind: "text", value: "not a question on this form" },
      },
      // The version the page was showing, which is the current one.
      formVersion: 1,
      late: true,
      uid: avery.uid,
      submittedAt: "2020-01-01T00:00:00.000Z",
    });
    const submitted = ok<SubmitResultDto>(result);
    expect(submitted.late).toBe(false);
    expect(submitted.confirmationMessage).toBe("Nice work. Your synthesis deliverable is now unlocked.");
    expect(Math.abs(Date.parse(submitted.submittedAt) - Date.now())).toBeLessThan(60_000);
    expect(submitted.unlocked.map((card) => [card.id, card.state])).toEqual([["week2synthesis", "open"]]);
    expect(result.text).not.toContain('"questions"');
  });

  it("stores the response under the caller, normalized, with the questions as they were", async () => {
    const stored = ok<SubmissionDto>(await call(getSubmission, { formId: "week2interviews" }, { token: sam.token }));
    expect(stored.answers).toEqual(INTERVIEW_ANSWERS);
    expect(stored).toMatchObject({
      formId: "week2interviews",
      title: "Week 2: Customer Discovery Interviews",
      late: false,
      lateBySeconds: 0,
    });
    expect(stored.questions.map((question) => question.id)).toEqual(["q_count", "q_date", "q_time", "q_surprise", "q_notes"]);
    expect(Date.parse(stored.startedAt)).toBeLessThanOrEqual(Date.parse(stored.submittedAt));
    expect(stored.durationSeconds).toBe(Math.round((Date.parse(stored.submittedAt) - Date.parse(stored.startedAt)) / 1000));

    const raw = await docData(`submissions/week2interviews_${sam.uid}`);
    expect(raw).toMatchObject({ uid: sam.uid, formId: "week2interviews", late: false });
    expect(await countWhere("submissions", "uid", avery.uid)).toBe(3);
  });

  it("removes the draft and moves the dashboard on", async () => {
    expect(await docExists(`drafts/week2interviews_${sam.uid}`)).toBe(false);
    const dashboard = await dashboardOf(sam);
    expect(cardOf(dashboard, "week2interviews")).toMatchObject({ state: "submitted", late: false, draftUpdatedAt: null });
    expect(cardOf(dashboard, "week2synthesis")).toMatchObject({ state: "open", lockReason: null, lockedByTitle: null });
    expect(dashboard.progress).toMatchObject({ submitted: 2, onTime: 2, outstanding: 1, completionPct: 50 });
  });

  it("now sends the questions of the deliverable it unlocked", async () => {
    const form = ok<PledgeFormDto>(await openForm(sam, "week2synthesis"));
    expect(form.card.state).toBe("open");
    expect(form.questions?.map((question) => question.id)).toEqual(["q_insight1", "q_insight2", "q_insight3", "q_pivot"]);
  });

  it("refuses a second submission with 409 and keeps the first", async () => {
    const again = await submitAs(sam, "week2interviews", {
      answers: { ...INTERVIEW_ANSWERS, q_count: { kind: "text", value: "99" } },
      formVersion: 1,
    });
    const body = refused(again, 409, "already_submitted");
    expect(body.error).toBe("You've already turned this in.");
    refused(await saveDraft(sam, "week2interviews", { answers: INTERVIEW_ANSWERS }), 409, "already_submitted");

    const stored = ok<SubmissionDto>(await call(getSubmission, { formId: "week2interviews" }, { token: sam.token }));
    expect(stored.answers.q_count).toEqual({ kind: "text", value: "4" });
    expect(await countWhere("submissions", "uid", sam.uid)).toBe(2);
    expect(await docExists(`drafts/week2interviews_${sam.uid}`)).toBe(false);
  });

  it(
    "accepts one of two simultaneous submissions, as from a double click, and answers the other with 409",
    async () => {
      const attempts = await Promise.all([
        submitAs(maya, "week2synthesis", { answers: { ...SYNTHESIS_ANSWERS, q_insight1: { kind: "text", value: "first click" } }, formVersion: 1 }),
        submitAs(maya, "week2synthesis", { answers: { ...SYNTHESIS_ANSWERS, q_insight1: { kind: "text", value: "second click" } }, formVersion: 1 }),
      ]);
      expect(attempts.map((attempt) => attempt.status).sort()).toEqual([200, 409]);
      const [winner, loser] = attempts[0].status === 200 ? attempts : [attempts[1], attempts[0]];
      expect(ok<SubmitResultDto>(winner).late).toBe(false);
      expect(refused(loser, 409, "already_submitted").error).toBe("You've already turned this in.");

      expect(await countWhere("submissions", "formId", "week2synthesis")).toBe(1);
      const stored = ok<SubmissionDto>(await call(getSubmission, { formId: "week2synthesis" }, { token: maya.token }));
      expect(stored.answers.q_insight1).toEqual({ kind: "text", value: winner === attempts[0] ? "first click" : "second click" });
    },
    SLOW_TEST_MS,
  );

  it(
    "records exactly one response when the same submission arrives eight times at once",
    async () => {
      const attempts = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          submitAs(jordan, "week2interviews", {
            answers: { ...INTERVIEW_ANSWERS, q_count: { kind: "text", value: String(index + 1) } },
            formVersion: 1,
          }),
        ),
      );
      expect(attempts.filter((attempt) => attempt.status === 200)).toHaveLength(1);

      // Every other attempt is told the deliverable is already turned in. One that ran out of
      // retries under the contention finds the winner's response stored and says the same.
      const losers = attempts.filter((attempt) => attempt.status !== 200);
      expect(losers).toHaveLength(7);
      expect(losers.map((loser) => loser.status)).toEqual(Array.from({ length: 7 }, () => 409));
      for (const loser of losers) {
        expect(refused(loser, 409, "already_submitted").error).toBe("You've already turned this in.");
      }

      expect(await countWhere("submissions", "uid", jordan.uid)).toBe(3);
      const responses = ok<FormResponsesDto>(await call(getResponses, { formId: "week2interviews" }, { token: admin.token }));
      expect(responses.responses.filter((response) => response.uid === jordan.uid)).toHaveLength(1);

      // The stored answer is the one from the attempt that was told it succeeded.
      const winner = attempts.findIndex((attempt) => attempt.status === 200);
      const stored = ok<SubmissionDto>(await call(getSubmission, { formId: "week2interviews" }, { token: jordan.token }));
      expect(stored.answers.q_count).toEqual({ kind: "text", value: String(winner + 1) });
      expect(cardOf(await dashboardOf(jordan), "week2interviews").state).toBe("submitted");

      // Once the burst is over, the same request gets the settled answer.
      refused(await submitAs(jordan, "week2interviews", { answers: INTERVIEW_ANSWERS, formVersion: 1 }), 409, "already_submitted");
      expect(await countWhere("submissions", "uid", jordan.uid)).toBe(3);
    },
    SLOW_TEST_MS,
  );

  describe("late work", () => {
    it("offers a past-due deliverable as late once an admin reopens it", async () => {
      ok(await call(reopenResponse, { formId: "week0onboarding", uid: maya.uid }, { method: "DELETE", token: admin.token }));
      const dashboard = await dashboardOf(maya);
      expect(cardOf(dashboard, "week0onboarding")).toMatchObject({ state: "open_late", late: true, submittedAt: null });
      const form = ok<PledgeFormDto>(await openForm(maya, "week0onboarding"));
      expect(form.card).toMatchObject({ state: "open_late", late: true });
      expect(form.questions).toHaveLength(4);
    });

    it("flags a submission after the deadline as late and records by how much", async () => {
      const submitted = ok<SubmitResultDto>(await submitAs(maya, "week0onboarding", { answers: ONBOARDING_ANSWERS, formVersion: 1 }));
      expect(submitted.late).toBe(true);
      expect(submitted.confirmationMessage).toBe("Thanks. Welcome to Founder's Education.");
      expect(submitted.unlocked).toEqual([]);

      const stored = ok<SubmissionDto>(await call(getSubmission, { formId: "week0onboarding" }, { token: maya.token }));
      expect(stored.late).toBe(true);
      // Lateness runs from the end of the minute the deadline falls in, not from the stored instant.
      const form = ok<AdminFormDto>(await call(getAdminForm, { formId: "week0onboarding" }, { token: admin.token }));
      const dueMs = Date.parse(form.settings.dueAt ?? "");
      const endOfDueMinute = Math.floor(dueMs / 60_000) * 60_000 + 59_999;
      // Whole seconds, rounded up, and never none once late.
      expect(stored.lateBySeconds).toBe(Math.max(1, Math.ceil((Date.parse(stored.submittedAt) - endOfDueMinute) / 1000)));
      // The seed sets the deadline 15 days before it ran.
      expect(stored.lateBySeconds).toBeGreaterThan(15 * DAY_SECONDS - 60);
      expect(stored.lateBySeconds).toBeLessThan(15 * DAY_SECONDS + 600);
      expect(stored.answers).toEqual(ONBOARDING_ANSWERS);
    });

    it("shows the late submission as late on the dashboard and in the progress summary", async () => {
      const dashboard = await dashboardOf(maya);
      expect(cardOf(dashboard, "week0onboarding")).toMatchObject({ state: "submitted", late: true });
      // Late: week 0. On time: the seeded interviews and the synthesis from the double-click test.
      expect(dashboard.progress).toMatchObject({ submitted: 3, onTime: 2, late: 1 });
    });
  });
});

describe("history", () => {
  it("lists the pledge's own submissions, newest first", async () => {
    const history = ok<SubmissionHistoryDto>(await call(listSubmissions, {}, { token: sam.token }));
    expect(history.submissions.map((submission) => submission.formId)).toEqual(["week2interviews", "week0onboarding"]);
    expect(history.submissions[0]).toMatchObject({
      title: "Week 2: Customer Discovery Interviews",
      late: false,
      questionCount: 5,
    });
    expect(history.submissions[1]).toMatchObject({ title: "Week 0: Onboarding Survey", late: false, questionCount: 4 });
  });

  it("returns the pledge's own response, not anyone else's, for a deliverable several pledges turned in", async () => {
    // The seed gives each pledge a different major: Sam is "Informatics", Avery "Computer Science".
    const mine = ok<SubmissionDto>(await call(getSubmission, { formId: "week0onboarding" }, { token: sam.token }));
    expect(mine.answers.q_major).toEqual({ kind: "text", value: "Informatics" });
    const averys = ok<SubmissionDto>(await call(getSubmission, { formId: "week0onboarding" }, { token: avery.token }));
    expect(averys.answers.q_major).toEqual({ kind: "text", value: "Computer Science" });
  });

  it("cannot read another pledge's response to a deliverable the caller has not turned in", async () => {
    expect(await docExists(`submissions/week1reflection_${avery.uid}`)).toBe(true);
    const direct = await call(getSubmission, { formId: "week1reflection" }, { token: sam.token });
    expect(refused(direct, 404, "not_found").error).toBe("You haven't turned this in.");
    expect(direct.text).not.toContain("Group projects fall apart");
  });

  it("ignores any uid the caller supplies", async () => {
    const withQuery = await call(getSubmission, { formId: "week1reflection" }, { token: sam.token, query: `?uid=${avery.uid}` });
    refused(withQuery, 404, "not_found");
    const own = ok<SubmissionDto>(
      await call(getSubmission, { formId: "week0onboarding" }, { token: sam.token, query: `?uid=${avery.uid}`, headers: { "x-uid": avery.uid } }),
    );
    expect(own.answers.q_major).toEqual({ kind: "text", value: "Informatics" });

    const history = ok<SubmissionHistoryDto>(await call(listSubmissions, {}, { token: sam.token, query: `?uid=${avery.uid}` }));
    expect(history.submissions.map((submission) => submission.formId)).not.toContain("week1reflection");
  });

  it("cannot reach other pledges' responses through the admin endpoints", async () => {
    refused(await call(getResponses, { formId: "week1reflection" }, { token: sam.token }), 403, "forbidden");
    refused(await call(getPledgeDetail, { uid: avery.uid }, { token: sam.token }), 403, "forbidden");
    refused(await call(getPledgeDetail, { uid: sam.uid }, { token: sam.token }), 403, "forbidden");
  });
});

describe("time tracking", () => {
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const activityOf = async (session: Session): Promise<PledgeDetailDto> =>
    ok<PledgeDetailDto>(await call(getPledgeDetail, { uid: session.uid }, { token: admin.token }));
  const beat = (session: Session, body: unknown = {}) => call(heartbeat, {}, { method: "POST", token: session.token, body });
  /** The visit in progress, as stored on the pledge's profile. */
  const visitOf = async (session: Session): Promise<Record<string, unknown> | null> => {
    const activity = (await docData(`users/${session.uid}`))?.activity as { current: Record<string, unknown> | null };
    return activity.current;
  };

  it("starts a session on the first heartbeat of a visit", async () => {
    const before = await activityOf(avery);
    expect(before.pledge.activity).toMatchObject({ sessionCount: 3, currentSessionStartedAt: null });

    expect(ok(await beat(avery))).toEqual({ ok: true });
    const after = await activityOf(avery);
    expect(after.pledge.activity.sessionCount).toBe(4);
    expect(after.pledge.activity.currentSessionStartedAt).not.toBeNull();
    expect(Math.abs(Date.parse(after.pledge.activity.lastSeenAt ?? "") - Date.now())).toBeLessThan(60_000);
    expect(after.pledge.activity.firstSeenAt).toBe(before.pledge.activity.firstSeenAt);
    expect(after.sessions.filter((session) => session.current)).toHaveLength(1);
    // The visit in progress is kept on the profile. Nothing is filed until it is known to be over.
    expect(await countSessions(avery.uid)).toBe(3);
  });

  it("ignores a second heartbeat moments later, as from another tab, whether or not it says the tab has just come back", async () => {
    const before = await activityOf(avery);
    ok(await beat(avery));
    ok(await beat(avery, { formId: "week2synthesis" }));
    ok(await beat(avery, { resume: true }));
    ok(await beat(avery, { resume: true, formId: "week2synthesis" }));
    const after = await activityOf(avery);
    expect(after.pledge.activity).toEqual(before.pledge.activity);
    expect(after.sessions).toEqual(before.sessions);
  });

  it("credits the time since the last beat to the visit and to the response that was open", async () => {
    // Opening the deliverable creates the draft that the time is credited to.
    ok(await openForm(avery, "week2synthesis"));
    const before = await activityOf(avery);
    await ageLastHeartbeat(avery.uid, 45 * SECOND);
    ok(await beat(avery, { formId: "week2synthesis" }));

    const after = await activityOf(avery);
    const credited = after.pledge.activity.totalActiveSeconds - before.pledge.activity.totalActiveSeconds;
    expect(credited).toBeGreaterThanOrEqual(45);
    expect(credited).toBeLessThanOrEqual(50);
    expect(after.pledge.activity.sessionCount).toBe(4);
    expect(after.sessions[0]).toMatchObject({ current: true, activeSeconds: credited });
    expect(await docData(`drafts/week2synthesis_${avery.uid}`)).toMatchObject({ activeSeconds: credited });
  });

  it("never credits more than 90 seconds for one beat, however long it has been", async () => {
    const before = await activityOf(avery);
    const draftBefore = await docData(`drafts/week2synthesis_${avery.uid}`);
    await ageLastHeartbeat(avery.uid, 4 * MINUTE);
    ok(await beat(avery, { formId: "week2synthesis" }));

    const after = await activityOf(avery);
    expect(after.pledge.activity.totalActiveSeconds - before.pledge.activity.totalActiveSeconds).toBe(TIMING.heartbeatMaxCreditSeconds);
    expect(after.pledge.activity.sessionCount).toBe(4);
    expect((await docData(`drafts/week2synthesis_${avery.uid}`))?.activeSeconds).toBe(Number(draftBefore?.activeSeconds) + 90);
  });

  it("marks the pledge present without crediting the time away when the tab comes back", async () => {
    const before = await activityOf(avery);
    const draftBefore = await docData(`drafts/week2synthesis_${avery.uid}`);
    await ageLastHeartbeat(avery.uid, 2 * MINUTE);
    ok(await beat(avery, { resume: true, formId: "week2synthesis" }));

    const after = await activityOf(avery);
    expect(after.pledge.activity.totalActiveSeconds).toBe(before.pledge.activity.totalActiveSeconds);
    expect(after.pledge.activity.sessionCount).toBe(4);
    expect(Math.abs(Date.parse(after.pledge.activity.lastSeenAt ?? "") - Date.now())).toBeLessThan(10_000);
    expect((await docData(`drafts/week2synthesis_${avery.uid}`))?.activeSeconds).toBe(draftBefore?.activeSeconds);
  });

  it("does not end the visit when a beat says it is the final one: that field is no longer read", async () => {
    const before = await activityOf(avery);
    await ageLastHeartbeat(avery.uid, 30 * SECOND);
    const visitBefore = await visitOf(avery);
    ok(await beat(avery, { final: true, formId: "week2synthesis" }));

    const after = await activityOf(avery);
    // It counted as an ordinary beat: the 30 seconds were credited and the visit goes on.
    const credited = after.pledge.activity.totalActiveSeconds - before.pledge.activity.totalActiveSeconds;
    expect(credited).toBeGreaterThanOrEqual(30);
    expect(credited).toBeLessThanOrEqual(35);
    expect(after.pledge.activity.sessionCount).toBe(4);
    expect(after.pledge.activity.currentSessionStartedAt).not.toBeNull();
    expect(after.sessions.filter((session) => session.current)).toHaveLength(1);
    expect((await visitOf(avery))?.startedAt).toEqual(visitBefore?.startedAt);
    expect(await countSessions(avery.uid)).toBe(3);
  });

  it(
    "keeps the same visit when the pledge signs out and straight back in",
    async () => {
      const before = await activityOf(avery);
      // Revocation is recorded to the second, so the token must be from an earlier second.
      await sleep(1100);
      // What the page does on the way out: one last beat, then the sign-out.
      ok(await beat(avery));
      ok(await call(signOut, {}, { method: "POST", token: avery.token }));
      refused(await beat(avery), 401, "session_revoked");

      // Straight back in: the first beat of the new page lands seconds after the last one.
      avery = await signIn(AVERY);
      ok(await beat(avery, { resume: true }));
      ok(await beat(avery));
      const straightBack = await activityOf(avery);
      expect(straightBack.pledge.activity).toEqual(before.pledge.activity);
      expect(straightBack.sessions.filter((session) => session.current)).toHaveLength(1);

      // Back in a minute later instead: the beat counts, and it is still the same visit.
      await ageLastHeartbeat(avery.uid, MINUTE);
      const visitBefore = await visitOf(avery);
      ok(await beat(avery, { resume: true }));
      const after = await activityOf(avery);
      expect(after.pledge.activity.sessionCount).toBe(4);
      expect(after.pledge.activity.totalActiveSeconds).toBe(before.pledge.activity.totalActiveSeconds);
      expect((await visitOf(avery))?.startedAt).toEqual(visitBefore?.startedAt);
      expect(Math.abs(Date.parse(after.pledge.activity.lastSeenAt ?? "") - Date.now())).toBeLessThan(10_000);
      expect(after.sessions).toHaveLength(before.sessions.length);
      expect(await countSessions(avery.uid)).toBe(3);
    },
    SLOW_TEST_MS,
  );

  it("keeps the same visit when the page is reloaded, or the pledge is back within five minutes", async () => {
    const before = await activityOf(avery);
    // Four and a half minutes of silence, then the first beat of the reloaded page.
    await ageLastHeartbeat(avery.uid, TIMING.sessionGapMs - 30 * SECOND);
    const visitBefore = await visitOf(avery);
    ok(await beat(avery, { resume: true }));
    ok(await beat(avery));

    const after = await activityOf(avery);
    expect(after.pledge.activity.sessionCount).toBe(4);
    expect((await visitOf(avery))?.startedAt).toEqual(visitBefore?.startedAt);
    expect(after.sessions.filter((session) => session.current)).toHaveLength(1);
    expect(after.sessions).toHaveLength(before.sessions.length);
    expect(await countSessions(avery.uid)).toBe(3);
  });

  it("starts a new visit only after more than five minutes of silence, and files the old one under the pledge's own profile", async () => {
    const before = await activityOf(avery);
    const ending = before.sessions[0];
    expect(ending.current).toBe(true);
    await ageLastHeartbeat(avery.uid, TIMING.sessionGapMs + 2 * SECOND);
    const aged = await visitOf(avery);
    ok(await beat(avery));

    const after = await activityOf(avery);
    expect(after.pledge.activity.sessionCount).toBe(5);
    // Nothing is credited for the silence.
    expect(after.pledge.activity.totalActiveSeconds).toBe(before.pledge.activity.totalActiveSeconds);
    expect(after.sessions).toHaveLength(before.sessions.length + 1);
    expect(after.sessions[0]).toMatchObject({ current: true, activeSeconds: 0 });
    expect(after.sessions[1]).toMatchObject({ current: false, activeSeconds: ending.activeSeconds });
    // The old visit ended when the pledge was last seen, not when they came back.
    expect(Date.parse(after.sessions[1].endedAt ?? "")).toBeLessThan(Date.now() - TIMING.sessionGapMs);

    expect(await countSessions(avery.uid)).toBe(4);
    const filed = await testDb().collection(`users/${avery.uid}/sessions`).orderBy("startedAt", "desc").limit(1).get();
    expect(filed.docs[0].data()).toEqual({
      uid: avery.uid,
      startedAt: aged?.startedAt,
      endedAt: aged?.lastSeenAt,
      activeSeconds: ending.activeSeconds,
    });
    // Visits are no longer kept in a collection of their own.
    expect(await countAll("sessions")).toBe(0);
  });

  it("cannot be made to mint visits by alternating rapid beats", async () => {
    const before = await activityOf(avery);
    for (let round = 0; round < 6; round += 1) {
      ok(await beat(avery, {}));
      ok(await beat(avery, { resume: true }));
      ok(await beat(avery, { final: true }));
      ok(await beat(avery, { final: true, resume: true }));
    }
    const after = await activityOf(avery);
    expect(after.pledge.activity.sessionCount).toBe(5);
    expect(after.pledge.activity.currentSessionStartedAt).toBe(before.pledge.activity.currentSessionStartedAt);
    expect(after.sessions).toHaveLength(before.sessions.length);
    expect(after.sessions.filter((session) => session.current)).toHaveLength(1);
    expect(await countSessions(avery.uid)).toBe(4);
  });

  it("shows the visit in progress as current only while the pledge was seen within the last two and a half minutes", async () => {
    expect(TIMING.onlineWindowMs).toBe(150 * SECOND);
    expect((await activityOf(avery)).sessions[0].current).toBe(true);

    // Still inside the five minutes that keep the visit open, but no longer "online".
    await ageLastHeartbeat(avery.uid, TIMING.onlineWindowMs + 5 * SECOND);
    const quiet = await activityOf(avery);
    expect(quiet.sessions.filter((session) => session.current)).toEqual([]);
    expect(quiet.sessions[0]).toMatchObject({ current: false, endedAt: quiet.pledge.activity.lastSeenAt });
    expect(quiet.pledge.activity.currentSessionStartedAt).not.toBeNull();
    expect(quiet.pledge.activity.sessionCount).toBe(5);

    ok(await beat(avery));
    const back = await activityOf(avery);
    expect(back.sessions[0].current).toBe(true);
    expect(back.pledge.activity.sessionCount).toBe(5);
  });

  it("carries the active time over to the response when it is submitted", async () => {
    const draft = await docData(`drafts/week2synthesis_${avery.uid}`);
    ok(await submitAs(avery, "week2synthesis", { answers: SYNTHESIS_ANSWERS, formVersion: 1 }));
    const stored = ok<SubmissionDto>(await call(getSubmission, { formId: "week2synthesis" }, { token: avery.token }));
    expect(stored.activeSeconds).toBe(draft?.activeSeconds);
    // 45 or so, then 90, then 30 or so: the resume beat added nothing.
    expect(stored.activeSeconds).toBeGreaterThanOrEqual(45 + 90 + 30);
    expect(stored.activeSeconds).toBeLessThanOrEqual(50 + 90 + 35);
  });

  it("treats a beat marked final as an ordinary one when no visit is in progress: it starts one", async () => {
    const before = await activityOf(jordan);
    expect(before.pledge.activity).toMatchObject({ sessionCount: 4, currentSessionStartedAt: null });
    ok(await beat(jordan, { final: true }));
    const after = await activityOf(jordan);
    expect(after.pledge.activity.sessionCount).toBe(5);
    expect(after.pledge.activity.currentSessionStartedAt).not.toBeNull();
    expect(after.sessions.filter((session) => session.current)).toHaveLength(1);
  });

  it.each<[string, unknown]>([
    ["an unsafe form id", { formId: "../users" }],
    ["a form id of the wrong type", { formId: { id: "week2synthesis" } }],
    ["another pledge's uid", { uid: "someone-else", formId: "week2interviews" }],
    ["flags that are not booleans", { final: "yes", resume: 1 }],
    ["an array", [1, 2, 3]],
  ])("tolerates a heartbeat carrying %s", async (_label, body) => {
    expect(ok(await beat(maya, body))).toEqual({ ok: true });
  });

  it("only ever credits the caller's own draft", async () => {
    // Sam has a draft of the very deliverable Avery's beats named.
    expect(await countWhere("drafts", "uid", sam.uid)).toBe(1);
    const samDraft = await docData(`drafts/week2synthesis_${sam.uid}`);
    expect(samDraft).toMatchObject({ activeSeconds: 0 });
  });

  it("only ever moves the caller's own activity", async () => {
    // Sam sent no heartbeat in this file: every beat above came from someone else.
    expect((await activityOf(sam)).pledge.activity).toMatchObject({ sessionCount: 6, currentSessionStartedAt: null, totalActiveSeconds: 47 * 60 });
    expect(await countSessions(sam.uid)).toBe(6);
  });
});
