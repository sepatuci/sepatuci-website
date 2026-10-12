import { randomBytes } from "node:crypto";
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import { ID_PATTERN, LIMITS } from "../constants";
import { evaluateForm, type FormLike } from "../form-state";
import {
  changedQuestionTypes,
  emptySettings,
  findPrerequisiteCycle,
  validateFormDefinition,
} from "../form-schema";
import { isRecord } from "../parse";
import type {
  AdminFormDto,
  AdminFormsDto,
  FormResponsesDto,
  NonResponderDto,
  Question,
  ResponseRowDto,
} from "../types";
import { loadTeams } from "./admin-teams-service";
import { auditEntry } from "./audit";
import { HttpError, invalid } from "./http";
import type { Caller } from "./pledge-service";
import {
  collections,
  formLike,
  formSummary,
  iso,
  responseId,
  settingsToStored,
  settingsToWire,
  submittedToWire,
  type FormDoc,
} from "./store";

/** Admin management of deliverable forms and their responses. */

const notFound = () => new HttpError(404, "not_found", "That deliverable doesn't exist.");

const localId = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;

function toAdminForm(id: string, form: FormDoc, responseCount: number): AdminFormDto {
  return {
    id,
    title: form.title,
    description: form.description,
    status: form.status,
    questions: form.questions,
    settings: settingsToWire(form.settings),
    version: form.version,
    createdAt: iso(form.createdAt),
    updatedAt: iso(form.updatedAt),
    responseCount,
  };
}

export async function listForms({ admin, now }: Caller): Promise<AdminFormsDto> {
  const cols = collections(admin.db);
  const [formsSnap, pledgesSnap] = await Promise.all([
    cols.forms.get(),
    cols.users.where("role", "==", "pledge").get(),
  ]);
  const responseCounts = new Map<string, number>();
  for (const doc of pledgesSnap.docs) {
    for (const formId of Object.keys(doc.data().submitted)) {
      responseCounts.set(formId, (responseCounts.get(formId) ?? 0) + 1);
    }
  }
  const forms = formsSnap.docs
    .map((doc) => formSummary(doc.id, doc.data(), responseCounts.get(doc.id) ?? 0))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const activePledges = pledgesSnap.docs.filter((doc) => doc.data().status === "active").length;
  return { serverNow: now.toISOString(), forms, pledgeCount: activePledges };
}

export async function createForm({ admin, user, now }: Caller, body: unknown): Promise<{ id: string }> {
  const cols = collections(admin.db);
  const sourceId = isRecord(body) && typeof body.duplicateOf === "string" ? body.duplicateOf : null;
  const stamp = Timestamp.fromDate(now);

  let title = "Untitled deliverable";
  let description = "";
  let questions: Question[] = [
    {
      id: localId("q"),
      type: "multiple_choice",
      title: "",
      description: "",
      required: false,
      allowOther: false,
      options: [{ id: localId("o"), label: "Option 1" }],
    },
  ];
  let confirmationMessage = "";

  if (sourceId !== null) {
    if (!ID_PATTERN.test(sourceId)) throw notFound();
    const source = (await cols.forms.doc(sourceId).get()).data();
    if (!source) throw notFound();
    title = `Copy of ${source.title}`.slice(0, LIMITS.formTitle);
    description = source.description;
    questions = source.questions;
    confirmationMessage = source.settings.confirmationMessage;
  }

  // A copy starts as an unscheduled draft, so it cannot go live with stale dates.
  const ref = cols.forms.doc();
  const batch = admin.db.batch();
  batch.create(ref, {
    title,
    description,
    status: "draft",
    questions,
    settings: settingsToStored({ ...emptySettings(), confirmationMessage }),
    version: 1,
    questionsVersion: 1,
    createdAt: stamp,
    createdBy: user.uid,
    updatedAt: stamp,
    updatedBy: user.uid,
  });
  batch.create(
    cols.audit.doc(),
    auditEntry(user, now, sourceId ? "form.duplicate" : "form.create", "form", ref.id, title),
  );
  await batch.commit();
  return { id: ref.id };
}

export async function getForm({ admin }: Caller, formId: string): Promise<AdminFormDto> {
  const cols = collections(admin.db);
  const [formSnap, countSnap] = await Promise.all([
    cols.forms.doc(formId).get(),
    cols.submissions.where("formId", "==", formId).count().get(),
  ]);
  const form = formSnap.data();
  if (!form) throw notFound();
  return toAdminForm(formId, form, countSnap.data().count);
}

export async function saveForm(
  { admin, user, now }: Caller,
  formId: string,
  body: unknown,
): Promise<AdminFormDto> {
  const expectedVersion = isRecord(body) ? body.expectedVersion : undefined;
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion)) {
    throw new HttpError(400, "bad_request", "The form version is missing.");
  }
  const validated = validateFormDefinition(body);
  if (!validated.ok) throw invalid(validated.issues, "This deliverable has problems to fix.");
  const definition = validated.value;

  const cols = collections(admin.db);
  const formRef = cols.forms.doc(formId);

  const saved = await admin.db.runTransaction(async (tx) => {
    const current = (await tx.get(formRef)).data();
    if (!current) throw notFound();
    if (current.version !== expectedVersion) {
      throw new HttpError(
        409,
        "version_conflict",
        "Someone else changed this deliverable. Reload to see the latest version.",
      );
    }

    const allForms = await tx.get(cols.forms);
    const others = allForms.docs.filter((doc) => doc.id !== formId);

    const prerequisiteId = definition.settings.prerequisiteFormId;
    if (prerequisiteId !== null) {
      const issue = (message: string) =>
        invalid([{ path: "settings.prerequisiteFormId", code: "invalid", message }]);
      if (prerequisiteId === formId) throw issue("A deliverable can't unlock itself.");
      if (!others.some((doc) => doc.id === prerequisiteId)) {
        throw issue("That deliverable no longer exists.");
      }
      const prerequisiteOf = new Map<string, string | null>(
        others.map((doc) => [doc.id, doc.data().settings.prerequisiteFormId]),
      );
      if (findPrerequisiteCycle(formId, prerequisiteId, prerequisiteOf)) {
        throw new HttpError(
          409,
          "prerequisite_cycle",
          "These deliverables would unlock each other in a loop.",
        );
      }
    }

    // Other deliverables may be waiting on this one being turned in.
    if (current.status === "published" && definition.status !== "published") {
      const dependents = others.filter(
        (doc) =>
          doc.data().status === "published" && doc.data().settings.prerequisiteFormId === formId,
      );
      if (dependents.length > 0) {
        const names = dependents.map((doc) => `"${doc.data().title}"`).join(", ");
        throw new HttpError(
          409,
          "has_dependents",
          `${names} unlocks after this one. Remove that link before taking this out of circulation.`,
        );
      }
    }

    // Once responses exist, a question keeps its type so earlier answers stay readable.
    const responded = await tx.get(cols.submissions.where("formId", "==", formId).limit(1));
    if (!responded.empty && changedQuestionTypes(current.questions, definition.questions).length > 0) {
      throw new HttpError(
        409,
        "question_type_locked",
        "This deliverable already has responses, so existing questions can't change type. Add a new question instead.",
      );
    }

    // What a pledge reads and answers. A change here is what makes someone with
    // the deliverable open check it again; a change to the schedule is not.
    const content = (form: Pick<FormDoc, "title" | "description" | "questions">) =>
      JSON.stringify([form.title, form.description, form.questions]);
    const contentChanged = content(current) !== content(definition);

    const next: FormDoc = {
      ...current,
      title: definition.title,
      description: definition.description,
      status: definition.status,
      questions: definition.questions,
      settings: settingsToStored(definition.settings),
      version: current.version + 1,
      questionsVersion: contentChanged
        ? current.version + 1
        : (current.questionsVersion ?? current.version),
      updatedAt: Timestamp.fromDate(now),
      updatedBy: user.uid,
    };
    tx.set(formRef, next);

    let action = "form.update";
    if (current.status !== next.status) {
      action =
        next.status === "published"
          ? "form.publish"
          : next.status === "archived"
            ? "form.archive"
            : "form.unpublish";
    }
    tx.create(cols.audit.doc(), auditEntry(user, now, action, "form", formId, next.title));
    return { form: next, hasResponses: !responded.empty };
  });

  const responseCount = saved.hasResponses
    ? (await cols.submissions.where("formId", "==", formId).count().get()).data().count
    : 0;
  return toAdminForm(formId, saved.form, responseCount);
}

export async function deleteForm({ admin, user, now }: Caller, formId: string): Promise<{ ok: true }> {
  const cols = collections(admin.db);
  const formRef = cols.forms.doc(formId);

  await admin.db.runTransaction(async (tx) => {
    const form = (await tx.get(formRef)).data();
    if (!form) throw notFound();

    const responded = await tx.get(cols.submissions.where("formId", "==", formId).limit(1));
    if (!responded.empty) {
      throw new HttpError(
        409,
        "has_responses",
        "This deliverable has responses. Archive it instead to keep the history.",
      );
    }
    const dependents = await tx.get(
      cols.forms.where("settings.prerequisiteFormId", "==", formId).limit(1),
    );
    if (!dependents.empty) {
      throw new HttpError(
        409,
        "has_dependents",
        `"${dependents.docs[0].data().title}" unlocks after this one. Remove that link first.`,
      );
    }
    const drafts = await tx.get(cols.drafts.where("formId", "==", formId).limit(400));

    drafts.docs.forEach((doc) => tx.delete(doc.ref));
    tx.delete(formRef);
    tx.create(cols.audit.doc(), auditEntry(user, now, "form.delete", "form", formId, form.title));
  });
  return { ok: true };
}

// ── Responses ────────────────────────────────────────────────────────────────

export async function getResponses({ admin, now }: Caller, formId: string): Promise<FormResponsesDto> {
  const cols = collections(admin.db);
  const [formsSnap, submissionsSnap, pledgesSnap] = await Promise.all([
    cols.forms.get(),
    cols.submissions.where("formId", "==", formId).get(),
    cols.users.where("role", "==", "pledge").get(),
  ]);
  const formDoc = formsSnap.docs.find((doc) => doc.id === formId);
  if (!formDoc) throw notFound();
  const form = formDoc.data();

  const profiles = new Map(pledgesSnap.docs.map((doc) => [doc.id, doc.data()]));
  const responses: ResponseRowDto[] = submissionsSnap.docs
    .map((doc) => {
      const submission = doc.data();
      const profile = profiles.get(submission.uid);
      return {
        uid: submission.uid,
        displayName: profile?.displayName ?? "Former pledge",
        email: profile?.email ?? "",
        teamId: profile?.teamId ?? null,
        answers: submission.answers,
        questions: submission.formSnapshot.questions,
        formVersion: submission.formSnapshot.version,
        startedAt: iso(submission.startedAt),
        submittedAt: iso(submission.submittedAt),
        durationSeconds: submission.durationSeconds,
        activeSeconds: submission.activeSeconds,
        late: submission.late,
        lateBySeconds: submission.lateBySeconds,
      };
    })
    .sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1));

  const formsById = new Map<string, FormLike>(
    formsSnap.docs.map((doc) => [doc.id, formLike(doc.id, doc.data())]),
  );
  const like = formLike(formId, form);
  const nowMs = now.getTime();
  const responded = new Set(responses.map((response) => response.uid));
  const nonResponders: NonResponderDto[] = [];
  for (const doc of pledgesSnap.docs) {
    if (responded.has(doc.id)) continue;
    const profile = doc.data();
    // A disabled account cannot turn anything in, so it is not chased for it.
    if (profile.status === "disabled") continue;
    const evaluated = evaluateForm(
      like,
      formsById,
      submittedToWire(profile.submitted),
      profile.createdAt.toMillis(),
      nowMs,
    );
    // Pledges this deliverable does not apply to are not counted as missing.
    if (evaluated.state === "hidden" || evaluated.state === "submitted") continue;
    nonResponders.push({
      uid: doc.id,
      displayName: profile.displayName,
      email: profile.email,
      teamId: profile.teamId,
      state: evaluated.state,
    });
  }
  nonResponders.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return {
    serverNow: now.toISOString(),
    form: toAdminForm(formId, form, responses.length),
    responses,
    nonResponders,
    teams: await loadTeams(
      cols,
      pledgesSnap.docs.map((doc) => doc.data().teamId),
    ),
  };
}

/** Removes one pledge's response so that they can turn the deliverable in again. */
export async function deleteResponse(
  { admin, user, now }: Caller,
  formId: string,
  uid: string,
): Promise<{ ok: true }> {
  const cols = collections(admin.db);
  const submissionRef = cols.submissions.doc(responseId(formId, uid));
  const userRef = cols.users.doc(uid);

  await admin.db.runTransaction(async (tx) => {
    const submission = (await tx.get(submissionRef)).data();
    if (!submission) throw new HttpError(404, "not_found", "That response doesn't exist.");
    const profile = (await tx.get(userRef)).data();

    tx.delete(submissionRef);
    if (profile) tx.update(userRef, new FieldPath("submitted", formId), FieldValue.delete());
    tx.create(
      cols.audit.doc(),
      auditEntry(
        user,
        now,
        "response.reopen",
        "submission",
        responseId(formId, uid),
        `Reopened "${submission.formSnapshot.title}" for ${profile?.email ?? uid}`,
      ),
    );
  });
  return { ok: true };
}
