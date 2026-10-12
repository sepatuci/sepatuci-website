import { evaluateForm, hasOpened, isReleased, type FormLike } from "../form-state";
import { countAnswerable } from "../form-schema";
import { computeProgress } from "../progress";
import type {
  ReviewCellDto,
  ReviewFormDto,
  ReviewFormSummaryDto,
  ReviewNotTurnedInDto,
  ReviewOverviewDto,
  ReviewPledgeDto,
  ReviewResponseDto,
} from "../types";
import { HttpError } from "./http";
import type { Caller } from "./pledge-service";
import {
  collections,
  formLike,
  iso,
  settingsToWire,
  submittedToWire,
  type Collections,
  type FormDoc,
} from "./store";

/**
 * What an active member may read: the pledges' work, and nothing else. This is
 * a separate service with its own response shapes on purpose. Every value sent
 * is put there by name below, so a field added to an admin response can never
 * reach an active by accident.
 *
 * Left out by design: emails, account and security state, time on site and
 * time taken, punishments, drafts, disabled pledges, and any deliverable that
 * is not published and released. Nothing here writes, and nothing reads the
 * sign-in accounts.
 */

// A deliverable an active may not see is indistinguishable from one that does not exist.
const notFound = () => new HttpError(404, "not_found", "That deliverable isn't available.");

const byDueThenTitle = (
  a: { dueAt: string | null; title: string },
  b: { dueAt: string | null; title: string },
): number => {
  if (a.dueAt !== b.dueAt) {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return a.dueAt < b.dueAt ? -1 : 1;
  }
  return a.title.localeCompare(b.title);
};

async function teamNames(cols: Collections): Promise<Map<string, string>> {
  const teams = await cols.teams.get();
  return new Map(teams.docs.map((doc) => [doc.id, doc.data().name]));
}

/**
 * The token says "active", and the profile must agree: an account whose profile
 * is missing, disabled, of another kind or for another address gets nothing.
 */
async function requireActiveProfile({ admin, user }: Caller): Promise<void> {
  const profile = (await collections(admin.db).users.doc(user.uid).get()).data();
  const valid =
    profile !== undefined &&
    profile.role === "active" &&
    profile.status !== "disabled" &&
    profile.email.toLowerCase() === user.email;
  if (!valid) {
    throw new HttpError(403, "email_not_allowed", "This account doesn't have access to the portal.");
  }
}

export async function getReviewOverview(caller: Caller): Promise<ReviewOverviewDto> {
  await requireActiveProfile(caller);
  const { admin, now } = caller;
  const cols = collections(admin.db);
  const nowMs = now.getTime();
  const [formsSnap, pledgesSnap, teams] = await Promise.all([
    cols.forms.where("status", "==", "published").get(),
    cols.users.where("role", "==", "pledge").get(),
    teamNames(cols),
  ]);

  const published = new Map<string, FormLike>(
    formsSnap.docs.map((doc) => [doc.id, formLike(doc.id, doc.data())]),
  );
  // Released means a pledge could already see it on their own dashboard.
  const released: Array<{ id: string; form: FormDoc; like: FormLike }> = [];
  for (const doc of formsSnap.docs) {
    const like = published.get(doc.id);
    if (like && isReleased(like.settings, nowMs)) released.push({ id: doc.id, form: doc.data(), like });
  }

  const responseCounts = new Map<string, number>();
  const pledges: ReviewPledgeDto[] = [];
  for (const doc of pledgesSnap.docs) {
    const profile = doc.data();
    if (profile.status === "disabled") continue;
    const submitted = submittedToWire(profile.submitted);
    const byForm: Record<string, ReviewCellDto> = {};
    for (const { id, like } of released) {
      const evaluated = evaluateForm(like, published, submitted, profile.createdAt.toMillis(), nowMs);
      byForm[id] = {
        state: evaluated.state,
        late: evaluated.late,
        submittedAt: submitted[id]?.submittedAt ?? null,
      };
      if (evaluated.state === "submitted") responseCounts.set(id, (responseCounts.get(id) ?? 0) + 1);
    }
    pledges.push({
      uid: doc.id,
      displayName: profile.displayName,
      teamName: (profile.teamId ? teams.get(profile.teamId) : undefined) ?? null,
      progress: computeProgress(Object.values(byForm)),
      byForm,
    });
  }
  pledges.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const forms: ReviewFormSummaryDto[] = released
    .map(({ id, form }) => {
      const settings = settingsToWire(form.settings);
      return {
        id,
        title: form.title,
        opensAt: settings.opensAt ?? settings.visibleAt,
        dueAt: settings.dueAt,
        closesAt: settings.closesAt,
        allowLate: settings.allowLate,
        questionCount: countAnswerable(form.questions),
        responseCount: responseCounts.get(id) ?? 0,
      };
    })
    .sort(byDueThenTitle);

  return { serverNow: now.toISOString(), forms, pledges };
}

export async function getReviewForm(caller: Caller, formId: string): Promise<ReviewFormDto> {
  await requireActiveProfile(caller);
  const { admin, now } = caller;
  const cols = collections(admin.db);
  const nowMs = now.getTime();
  const form = (await cols.forms.doc(formId).get()).data();
  if (!form || form.status !== "published") throw notFound();
  const like = formLike(formId, form);
  if (!isReleased(like.settings, nowMs)) throw notFound();

  const prerequisiteId = form.settings.prerequisiteFormId;
  const [submissionsSnap, pledgesSnap, teams, prerequisite] = await Promise.all([
    cols.submissions.where("formId", "==", formId).get(),
    cols.users.where("role", "==", "pledge").get(),
    teamNames(cols),
    prerequisiteId ? cols.forms.doc(prerequisiteId).get() : Promise.resolve(null),
  ]);

  const formsById = new Map<string, FormLike>([[formId, like]]);
  const prerequisiteForm = prerequisite?.data();
  if (prerequisiteId && prerequisiteForm) {
    formsById.set(prerequisiteId, formLike(prerequisiteId, prerequisiteForm));
  }

  // Only pledges who can still take part. A disabled or removed pledge's
  // response is not shown, and they are not listed as missing.
  const pledges = new Map(
    pledgesSnap.docs
      .map((doc) => [doc.id, doc.data()] as const)
      .filter(([, profile]) => profile.status !== "disabled"),
  );
  const teamOf = (teamId: string | null): string | null =>
    (teamId ? teams.get(teamId) : undefined) ?? null;

  const responses: ReviewResponseDto[] = [];
  const responded = new Set<string>();
  for (const doc of submissionsSnap.docs) {
    const submission = doc.data();
    const profile = pledges.get(submission.uid);
    if (!profile) continue;
    responded.add(submission.uid);
    responses.push({
      uid: submission.uid,
      displayName: profile.displayName,
      teamName: teamOf(profile.teamId),
      submittedAt: iso(submission.submittedAt),
      late: submission.late,
      lateBySeconds: submission.lateBySeconds,
      questions: submission.formSnapshot.questions,
      answers: submission.answers,
    });
  }
  responses.sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1));

  const notTurnedIn: ReviewNotTurnedInDto[] = [];
  for (const [uid, profile] of pledges) {
    if (responded.has(uid)) continue;
    const evaluated = evaluateForm(
      like,
      formsById,
      submittedToWire(profile.submitted),
      profile.createdAt.toMillis(),
      nowMs,
    );
    // A deliverable that never applied to this pledge is not something they missed.
    if (evaluated.state === "hidden" || evaluated.state === "submitted") continue;
    notTurnedIn.push({
      uid,
      displayName: profile.displayName,
      teamName: teamOf(profile.teamId),
      state: evaluated.state,
    });
  }
  notTurnedIn.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const settings = settingsToWire(form.settings);
  return {
    serverNow: now.toISOString(),
    form: {
      id: formId,
      title: form.title,
      description: form.description,
      opensAt: settings.opensAt ?? settings.visibleAt,
      dueAt: settings.dueAt,
      closesAt: settings.closesAt,
      allowLate: settings.allowLate,
      // As for a pledge: the questions are not shown before the deliverable opens.
      questions: hasOpened(like.settings, nowMs) ? form.questions : null,
    },
    responses,
    notTurnedIn,
  };
}
