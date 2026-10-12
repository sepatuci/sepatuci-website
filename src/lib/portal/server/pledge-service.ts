import { FieldPath, FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";
import { applyHeartbeat } from "../activity";
import { sanitizeDraftAnswers, validateAnswers } from "../answers";
import { ID_PATTERN, TIMING } from "../constants";
import { evaluateForm, lateAfterMs, type EvaluatedForm, type FormLike } from "../form-state";
import { countAnswerable } from "../form-schema";
import { isRecord } from "../parse";
import { passwordProblem, TEMPORARY_REUSED } from "../password";
import { computeProgress } from "../progress";
import type {
  DashboardDto,
  DraftSavedDto,
  FormCardDto,
  FormState,
  IsoDateTime,
  MeDto,
  MyTeamDto,
  PledgeFormDto,
  SubmissionDto,
  SubmissionHistoryDto,
  SubmitResultDto,
  SubmittedMap,
} from "../types";
import type { PortalAdmin } from "./admin";
import { TEMPORARY_EXPIRED, temporaryPasswordExpired, type AuthedUser } from "./gate";
import { HttpError, invalid } from "./http";
import { matchesIssued, nextSecond } from "./temporary-password";
import {
  activityToPure,
  activityToStored,
  collections,
  formLike,
  iso,
  punishmentDto,
  responseId,
  settingsToWire,
  submissionSummary,
  submittedToWire,
  type Collections,
  type FormDoc,
  type UserDoc,
} from "./store";

/**
 * Everything a signed-in pledge can do. The uid always comes from the verified
 * token, never from the request, so one pledge can never reach another's data.
 */

export interface Caller {
  admin: PortalAdmin;
  user: AuthedUser;
  now: Date;
}

const notFound = () => new HttpError(404, "not_found", "That deliverable doesn't exist.");
const noProfile = () =>
  new HttpError(403, "no_profile", "This account isn't set up for the portal yet.");

function notOpen(state: FormState): HttpError {
  switch (state) {
    case "submitted":
      return new HttpError(409, "already_submitted", "You've already turned this in.");
    case "locked":
      return new HttpError(409, "locked", "Turn in the earlier deliverable to unlock this one.");
    case "upcoming":
      return new HttpError(409, "not_open", "This deliverable hasn't opened yet.");
    default:
      return new HttpError(409, "closed", "This deliverable is closed.");
  }
}

/**
 * Which edit of the questions a form is on. Changing only the schedule or the
 * settings does not move it, so fixing a deadline never makes pledges who have
 * the deliverable open re-check their answers.
 */
const contentVersion = (form: FormDoc): number => form.questionsVersion ?? form.version;

interface PledgeContext {
  submitted: SubmittedMap;
  createdAtMs: number;
}

function pledgeContext(profile: UserDoc): PledgeContext {
  return { submitted: submittedToWire(profile.submitted), createdAtMs: profile.createdAt.toMillis() };
}

function toCard(
  id: string,
  form: FormDoc,
  evaluated: EvaluatedForm,
  submittedAt: IsoDateTime | null,
  draftUpdatedAt: IsoDateTime | null,
): FormCardDto {
  const settings = settingsToWire(form.settings);
  return {
    id,
    title: form.title,
    description: form.description,
    state: evaluated.state,
    late: evaluated.late,
    lockReason: evaluated.lockReason,
    // A deliverable that has not been released yet is not named, even as the reason for a lock.
    lockedByTitle: evaluated.lockedByVisible ? evaluated.lockedByTitle : null,
    opensAt: settings.opensAt ?? settings.visibleAt,
    dueAt: settings.dueAt,
    closesAt: settings.closesAt,
    allowLate: settings.allowLate,
    submittedAt,
    draftUpdatedAt,
    questionCount: countAnswerable(form.questions),
  };
}

// ── Profile and time tracking ────────────────────────────────────────────────

/**
 * The pledge's own team: its name and the names of the other members. This is
 * the only place a pledge is told anything about another pledge, and it is
 * limited to people an admin has placed on the same team.
 */
async function myTeam(cols: Collections, uid: string, teamId: string | null): Promise<MyTeamDto | null> {
  if (!teamId) return null;
  const [team, members] = await Promise.all([
    cols.teams.doc(teamId).get(),
    cols.users.where("teamId", "==", teamId).select("displayName", "status", "role").get(),
  ]);
  const name = team.data()?.name;
  if (!name) return null;
  const teammates = members.docs
    .filter(
      (doc) => doc.id !== uid && doc.get("role") === "pledge" && doc.get("status") !== "disabled",
    )
    .map((doc) => String(doc.get("displayName") ?? ""))
    .filter((displayName) => displayName.length > 0)
    .sort((a, b) => a.localeCompare(b));
  return { name, teammates };
}

export async function getMe({ admin, user, now }: Caller): Promise<MeDto> {
  const cols = collections(admin.db);
  const profile = (await cols.users.doc(user.uid).get()).data();
  // Pledges and actives are accounts the chairs created, so each must have a
  // profile that agrees with its sign-in: the same role, and the address it
  // was issued with. "Get password link" on their page puts a moved address back.
  if (user.role !== "admin") {
    if (!profile) throw noProfile();
    if (profile.role !== user.role || profile.email.toLowerCase() !== user.email) {
      throw new HttpError(403, "email_not_allowed", "This account doesn't have access to the portal.");
    }
  }
  const isPledge = user.role === "pledge" && profile !== undefined;
  const isMember = user.role !== "admin" && profile !== undefined;
  return {
    uid: user.uid,
    email: user.email,
    displayName: profile?.displayName || user.email,
    role: user.role,
    pledgeClass: profile?.pledgeClass ?? null,
    createdAt: profile ? iso(profile.createdAt) : null,
    team: isPledge ? await myTeam(cols, user.uid, profile.teamId) : null,
    onboardedAt: isMember && profile.onboardedAt ? iso(profile.onboardedAt) : null,
    mfaEnforced: admin.env.mode === "live",
    serverNow: now.toISOString(),
  };
}

/**
 * Replaces a temporary password with one the person chose. This is the only
 * thing an account on a temporary password can do, and the only account that
 * can do it: everyone else changes their password through the emailed link,
 * which proves they still hold the mailbox.
 */
export async function replaceTemporaryPassword(
  { admin, user, now }: Caller,
  body: unknown,
): Promise<{ ok: true }> {
  // Read from the account itself, not the token, so a finished change cannot be repeated.
  const record = await admin.auth.getUser(user.uid);
  const claims = record.customClaims ?? {};
  if (user.role === "admin" || claims.temp !== true) {
    throw new HttpError(
      409,
      "not_required",
      "This account already has its own password. Use Forgot password to change it.",
    );
  }
  if (temporaryPasswordExpired(claims.tempAt, now.getTime())) {
    throw new HttpError(403, "temporary_password_expired", TEMPORARY_EXPIRED);
  }
  const userRef = collections(admin.db).users.doc(user.uid);
  const profile = (await userRef.get()).data();
  if (!profile) throw noProfile();

  const raw = isRecord(body) ? body.password : undefined;
  const password = typeof raw === "string" ? raw : "";
  // The name on the profile, which only a chair can change, is the one ruled out.
  const problem =
    passwordProblem(password, {
      email: user.email,
      displayName: profile.displayName,
      temporary: true,
    }) ?? (matchesIssued(password, profile.temporaryPassword) ? TEMPORARY_REUSED : null);
  if (problem) throw invalid([{ path: "password", code: "weak_password", message: problem }]);

  // The password first, then the flag. If clearing the flag fails, the next
  // sign-in is simply asked again; the other order could leave the account
  // unflagged and still on the password the chair handed out.
  await admin.auth.updateUser(user.uid, { password });
  // Anyone else signed in on the temporary password is signed out before the
  // flag comes off, so a second session cannot carry on as a full one.
  await nextSecond();
  await admin.auth.revokeRefreshTokens(user.uid);
  await admin.auth.setCustomUserClaims(user.uid, { role: user.role, issued: user.email });
  await userRef.update({ temporaryPassword: FieldValue.delete() });
  // Every earlier sign-in ends. The browser signs in again with the new password.
  await admin.auth.revokeRefreshTokens(user.uid);
  return { ok: true };
}

/** Records that someone has been through their welcome. The first time is the one kept. */
export async function completeOnboarding({ admin, user, now }: Caller): Promise<{ onboardedAt: IsoDateTime }> {
  if (user.role === "admin") {
    throw new HttpError(403, "forbidden", "You don't have permission to do that.");
  }
  const userRef = collections(admin.db).users.doc(user.uid);
  return admin.db.runTransaction(async (tx) => {
    const profile = (await tx.get(userRef)).data();
    if (!profile) throw noProfile();
    if (profile.onboardedAt) return { onboardedAt: iso(profile.onboardedAt) };
    tx.update(userRef, { onboardedAt: Timestamp.fromDate(now) });
    return { onboardedAt: now.toISOString() };
  });
}

/**
 * Signing out ends the sign-in everywhere, not only in the browser that asked:
 * every token issued before now stops being accepted.
 */
export async function endSession(caller: Caller): Promise<{ ok: true }> {
  // Ending the sign-in comes first, so nothing can hold it up. The last stretch
  // of the visit is then credited in the same request, if that works.
  await caller.admin.auth.revokeRefreshTokens(caller.user.uid);
  await recordHeartbeat(caller, {}).catch(() => undefined);
  return { ok: true };
}

export async function recordHeartbeat(
  { admin, user, now }: Caller,
  body: unknown,
): Promise<{ ok: true }> {
  // Only pledges are timed. Nothing is recorded about how admins use the portal.
  if (user.role !== "pledge") return { ok: true };
  const input = isRecord(body) ? body : {};
  const options = { resume: input.resume === true };
  const formId =
    typeof input.formId === "string" && ID_PATTERN.test(input.formId) ? input.formId : null;

  const cols = collections(admin.db);
  const userRef = cols.users.doc(user.uid);
  const draftRef = formId ? cols.drafts.doc(responseId(formId, user.uid)) : null;
  const nowMs = now.getTime();

  await admin.db.runTransaction(async (tx) => {
    const profile = (await tx.get(userRef)).data();
    if (!profile) return;
    const draftExists = draftRef ? (await tx.get(draftRef)).exists : false;

    const outcome = applyHeartbeat(activityToPure(profile.activity), nowMs, options);
    if (!outcome.changed) return;

    tx.update(userRef, { activity: activityToStored(outcome.activity) });
    if (outcome.closed) {
      tx.create(cols.sessions(user.uid).doc(), {
        uid: user.uid,
        startedAt: Timestamp.fromMillis(outcome.closed.startedAtMs),
        endedAt: Timestamp.fromMillis(outcome.closed.endedAtMs),
        activeSeconds: outcome.closed.activeSeconds,
      });
    }
    // Time spent with a deliverable open counts towards its response time.
    if (draftRef && draftExists && outcome.credited > 0) {
      tx.update(draftRef, { activeSeconds: FieldValue.increment(outcome.credited) });
    }
  });
  return { ok: true };
}

// ── Dashboard ────────────────────────────────────────────────────────────────

const byDueThenTitle = (a: FormCardDto, b: FormCardDto): number => {
  if (a.dueAt !== b.dueAt) {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return a.dueAt < b.dueAt ? -1 : 1;
  }
  return a.title.localeCompare(b.title);
};

export async function getDashboard({ admin, user, now }: Caller): Promise<DashboardDto> {
  const cols = collections(admin.db);
  // Drafts and archived deliverables are never shown to a pledge, so they are
  // not read: the cost of this page does not grow with every term's leftovers.
  const [profileSnap, publishedSnap, draftsSnap, punishmentsSnap] = await Promise.all([
    cols.users.doc(user.uid).get(),
    cols.forms.where("status", "==", "published").get(),
    cols.drafts.where("uid", "==", user.uid).get(),
    cols.punishments.where("uid", "==", user.uid).get(),
  ]);
  const profile = profileSnap.data();
  if (!profile) throw noProfile();

  // The exception is one the pledge turned in before it was withdrawn: that stays in their list.
  const published = new Set(publishedSnap.docs.map((doc) => doc.id));
  const withdrawnIds = Object.keys(profile.submitted).filter(
    (id) => ID_PATTERN.test(id) && !published.has(id),
  );
  const withdrawn =
    withdrawnIds.length > 0
      ? await admin.db.getAll(...withdrawnIds.map((id) => cols.forms.doc(id)))
      : [];
  const formDocs: Array<{ id: string; form: FormDoc }> = publishedSnap.docs.map((doc) => ({
    id: doc.id,
    form: doc.data(),
  }));
  for (const doc of withdrawn) {
    const form = doc.data() as FormDoc | undefined;
    if (form) formDocs.push({ id: doc.id, form });
  }

  const pledge = pledgeContext(profile);
  const nowMs = now.getTime();
  const formsById = new Map<string, FormLike>(
    formDocs.map(({ id, form }) => [id, formLike(id, form)]),
  );
  // A draft only counts as "in progress" once something has been typed into it.
  const draftUpdatedAt = new Map<string, IsoDateTime>();
  for (const doc of draftsSnap.docs) {
    const draft = doc.data();
    if (Object.keys(draft.answers).length > 0) draftUpdatedAt.set(draft.formId, iso(draft.updatedAt));
  }

  const forms: FormCardDto[] = [];
  for (const { id, form } of formDocs) {
    const like = formsById.get(id);
    if (!like) continue;
    const evaluated = evaluateForm(like, formsById, pledge.submitted, pledge.createdAtMs, nowMs);
    if (evaluated.state === "hidden") continue;
    forms.push(
      toCard(
        id,
        form,
        evaluated,
        pledge.submitted[id]?.submittedAt ?? null,
        evaluated.canSubmit ? (draftUpdatedAt.get(id) ?? null) : null,
      ),
    );
  }
  forms.sort(byDueThenTitle);

  const punishments = punishmentsSnap.docs
    .filter((doc) => doc.data().status === "active")
    .map((doc) => punishmentDto(doc.id, doc.data()))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return { serverNow: now.toISOString(), forms, punishments, progress: computeProgress(forms) };
}

// ── One deliverable ──────────────────────────────────────────────────────────

interface FormView {
  form: FormDoc;
  like: FormLike;
  pledge: PledgeContext;
  evaluated: EvaluatedForm;
}

/** Loads a form and works out what it is to this pledge right now, inside a transaction. */
async function loadFormView(
  tx: Transaction,
  cols: Collections,
  formId: string,
  uid: string,
  nowMs: number,
): Promise<FormView> {
  const form = (await tx.get(cols.forms.doc(formId))).data();
  if (!form) throw notFound();
  const profile = (await tx.get(cols.users.doc(uid))).data();
  if (!profile) throw noProfile();

  const like = formLike(formId, form);
  const formsById = new Map<string, FormLike>([[formId, like]]);
  const prerequisiteId = form.settings.prerequisiteFormId;
  if (prerequisiteId && ID_PATTERN.test(prerequisiteId)) {
    const prerequisite = (await tx.get(cols.forms.doc(prerequisiteId))).data();
    if (prerequisite) formsById.set(prerequisiteId, formLike(prerequisiteId, prerequisite));
  }

  const pledge = pledgeContext(profile);
  const evaluated = evaluateForm(like, formsById, pledge.submitted, pledge.createdAtMs, nowMs);
  // A deliverable the pledge cannot see is indistinguishable from one that does not exist.
  if (evaluated.state === "hidden") throw notFound();
  return { form, like, pledge, evaluated };
}

export async function getPledgeForm(
  { admin, user, now }: Caller,
  formId: string,
): Promise<PledgeFormDto> {
  const cols = collections(admin.db);
  const draftRef = cols.drafts.doc(responseId(formId, user.uid));
  const stamp = Timestamp.fromDate(now);

  return admin.db.runTransaction(async (tx) => {
    const view = await loadFormView(tx, cols, formId, user.uid, now.getTime());
    const open = view.evaluated.showQuestions;
    let draft = (await tx.get(draftRef)).data() ?? null;

    // The first time a pledge opens a deliverable is when its response clock starts.
    if (open && !draft) {
      draft = {
        formId,
        uid: user.uid,
        answers: {},
        startedAt: stamp,
        updatedAt: stamp,
        activeSeconds: 0,
      };
      tx.create(draftRef, draft);
    }

    const answers = open && draft ? sanitizeDraftAnswers(view.form.questions, draft.answers) : null;
    const hasProgress = answers !== null && Object.keys(answers).length > 0;
    return {
      serverNow: now.toISOString(),
      card: toCard(
        formId,
        view.form,
        view.evaluated,
        view.pledge.submitted[formId]?.submittedAt ?? null,
        hasProgress && draft ? iso(draft.updatedAt) : null,
      ),
      // Questions are only ever sent while the deliverable is open to this pledge.
      questions: open ? view.form.questions : null,
      version: contentVersion(view.form),
      draft: answers !== null && draft ? { answers, updatedAt: iso(draft.updatedAt) } : null,
    };
  });
}

export async function saveDraft(
  { admin, user, now }: Caller,
  formId: string,
  body: unknown,
): Promise<DraftSavedDto> {
  const answersInput = isRecord(body) ? body.answers : undefined;
  const cols = collections(admin.db);
  const draftRef = cols.drafts.doc(responseId(formId, user.uid));
  const stamp = Timestamp.fromDate(now);

  await admin.db.runTransaction(async (tx) => {
    const view = await loadFormView(tx, cols, formId, user.uid, now.getTime());
    if (!view.evaluated.canSubmit) throw notOpen(view.evaluated.state);
    const existing = await tx.get(draftRef);
    const answers = sanitizeDraftAnswers(view.form.questions, answersInput);
    if (existing.exists) {
      tx.update(draftRef, { answers, updatedAt: stamp });
    } else {
      tx.create(draftRef, {
        formId,
        uid: user.uid,
        answers,
        startedAt: stamp,
        updatedAt: stamp,
        activeSeconds: 0,
      });
    }
  });
  return { updatedAt: now.toISOString() };
}

export async function submitForm(
  { admin, user, now }: Caller,
  formId: string,
  body: unknown,
): Promise<SubmitResultDto> {
  const answersInput = isRecord(body) ? body.answers : undefined;
  const answeredVersion = isRecord(body) ? body.formVersion : undefined;
  const cols = collections(admin.db);
  const submissionRef = cols.submissions.doc(responseId(formId, user.uid));
  const draftRef = cols.drafts.doc(responseId(formId, user.uid));
  const nowMs = now.getTime();
  const submittedAt = Timestamp.fromDate(now);

  // The transaction is what makes a double click, or two tabs, produce exactly one submission.
  const attempt = admin.db.runTransaction(async (tx) => {
    const view = await loadFormView(tx, cols, formId, user.uid, nowMs);
    const existing = await tx.get(submissionRef);
    const draft = (await tx.get(draftRef)).data();

    if (existing.exists) throw notOpen("submitted");
    if (!view.evaluated.canSubmit) throw notOpen(view.evaluated.state);
    // The page says which edit of the deliverable was answered. If an admin has
    // changed it since, the pledge reviews the new version before it is recorded.
    if (typeof answeredVersion === "number" && answeredVersion !== contentVersion(view.form)) {
      throw new HttpError(
        409,
        "form_changed",
        "This deliverable was updated while you had it open. Check your answers, then submit again.",
      );
    }

    const validated = validateAnswers(view.form.questions, answersInput);
    if (!validated.ok) throw invalid(validated.issues, "Some answers need attention.");

    const late = view.evaluated.late;
    const lateFromMs = lateAfterMs(view.like.settings);
    const startedAtMs = Math.min(draft?.startedAt.toMillis() ?? nowMs, nowMs);

    tx.create(submissionRef, {
      formId,
      uid: user.uid,
      answers: validated.value,
      formSnapshot: {
        title: view.form.title,
        description: view.form.description,
        questions: view.form.questions,
        version: view.form.version,
      },
      startedAt: Timestamp.fromMillis(startedAtMs),
      submittedAt,
      durationSeconds: Math.round((nowMs - startedAtMs) / 1000),
      activeSeconds: draft?.activeSeconds ?? 0,
      late,
      lateBySeconds: late && lateFromMs !== null ? Math.round((nowMs - lateFromMs) / 1000) : 0,
    });
    tx.update(cols.users.doc(user.uid), new FieldPath("submitted", formId), { submittedAt, late });
    if (draft) tx.delete(draftRef);

    return { late, view };
  });
  const outcome = await attempt.catch(async (error: unknown) => {
    // A request that loses the race can fail on contention instead of reaching the
    // check above. If the response is stored by then, the answer is the same.
    if (!(error instanceof HttpError) && (await submissionRef.get()).exists) {
      throw notOpen("submitted");
    }
    throw error;
  });

  // Deliverables chained to this one may have just opened. The response is
  // already stored, so a failure here must not be reported as a failed submit.
  const dependents = await cols.forms
    .where("settings.prerequisiteFormId", "==", formId)
    .get()
    .then((snapshot) => snapshot.docs)
    .catch(() => []);
  const submitted: SubmittedMap = {
    ...outcome.view.pledge.submitted,
    [formId]: { submittedAt: now.toISOString(), late: outcome.late },
  };
  const formsById = new Map<string, FormLike>([[formId, outcome.view.like]]);
  const unlocked: FormCardDto[] = [];
  for (const doc of dependents) {
    const like = formLike(doc.id, doc.data());
    const evaluated = evaluateForm(
      like,
      formsById,
      submitted,
      outcome.view.pledge.createdAtMs,
      nowMs,
    );
    if (evaluated.canSubmit) unlocked.push(toCard(doc.id, doc.data(), evaluated, null, null));
  }

  return {
    serverNow: now.toISOString(),
    submittedAt: now.toISOString(),
    late: outcome.late,
    confirmationMessage: outcome.view.form.settings.confirmationMessage,
    unlocked: unlocked.sort(byDueThenTitle),
  };
}

// ── History ──────────────────────────────────────────────────────────────────

export async function listSubmissions({ admin, user, now }: Caller): Promise<SubmissionHistoryDto> {
  const snapshot = await collections(admin.db).submissions.where("uid", "==", user.uid).get();
  const submissions = snapshot.docs
    .map((doc) => submissionSummary(doc.data()))
    .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  return { serverNow: now.toISOString(), submissions };
}

export async function getSubmission({ admin, user }: Caller, formId: string): Promise<SubmissionDto> {
  const snapshot = await collections(admin.db)
    .submissions.doc(responseId(formId, user.uid))
    .get();
  const submission = snapshot.data();
  if (!submission) throw new HttpError(404, "not_found", "You haven't turned this in.");
  return {
    formId: submission.formId,
    title: submission.formSnapshot.title,
    description: submission.formSnapshot.description,
    questions: submission.formSnapshot.questions,
    answers: submission.answers,
    startedAt: iso(submission.startedAt),
    submittedAt: iso(submission.submittedAt),
    durationSeconds: submission.durationSeconds,
    activeSeconds: submission.activeSeconds,
    late: submission.late,
    lateBySeconds: submission.lateBySeconds,
  };
}
