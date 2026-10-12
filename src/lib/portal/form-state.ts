import { msOrNull } from "./dates";
import type {
  FormSettings,
  FormState,
  FormStatus,
  LockReason,
  PrerequisiteStatus,
  SubmittedEntry,
  SubmittedMap,
} from "./types";

/**
 * What a deliverable looks like to one pledge at one instant. The server runs
 * this with its own clock to decide what a pledge may see and submit; the admin
 * views run the same function to show each pledge's status.
 */

export interface FormStateInput {
  status: FormStatus;
  settings: FormSettings;
  submission: SubmittedEntry | null;
  prerequisite: PrerequisiteStatus;
  /** Deliverables that were already due before the account existed do not apply to it. */
  userCreatedAtMs: number;
  nowMs: number;
}

export interface FormStateResult {
  state: FormState;
  /** For a submission: it was late. For an open deliverable: submitting now would be late. */
  late: boolean;
  canSubmit: boolean;
  showQuestions: boolean;
  lockReason: LockReason | null;
}

interface Schedule {
  visibleMs: number;
  opensMs: number;
  dueMs: number;
  /** After this instant nothing more is accepted. */
  closeMs: number;
}

const MINUTE_MS = 60_000;

/**
 * Deadlines are set and shown to the minute, so one shown as 11:59 PM covers
 * the whole of that minute: a response sent at 11:59:40 is still on time.
 */
function endOfMinute(ms: number | null): number {
  if (ms === null) return Number.POSITIVE_INFINITY;
  return Math.floor(ms / MINUTE_MS) * MINUTE_MS + MINUTE_MS - 1;
}

function formSchedule(settings: FormSettings): Schedule {
  const visibleMs = msOrNull(settings.visibleAt) ?? Number.NEGATIVE_INFINITY;
  const opensMs = Math.max(msOrNull(settings.opensAt) ?? visibleMs, visibleMs);
  const dueMs = endOfMinute(msOrNull(settings.dueAt));
  const lateUntilMs = endOfMinute(msOrNull(settings.closesAt));
  const closeMs = settings.allowLate ? Math.max(lateUntilMs, dueMs) : dueMs;
  return { visibleMs, opensMs, dueMs, closeMs };
}

/** True when the deliverable was already over before this account was created. */
function predatesAccount(schedule: Schedule, userCreatedAtMs: number): boolean {
  const deadline = Number.isFinite(schedule.dueMs) ? schedule.dueMs : schedule.closeMs;
  return deadline <= userCreatedAtMs;
}

const result = (
  state: FormState,
  overrides: Partial<Omit<FormStateResult, "state">> = {},
): FormStateResult => ({
  state,
  late: false,
  canSubmit: false,
  showQuestions: false,
  lockReason: null,
  ...overrides,
});

export function computeFormState(input: FormStateInput): FormStateResult {
  const { status, settings, submission, prerequisite, userCreatedAtMs, nowMs } = input;

  // A turned-in deliverable stays in the pledge's history whatever happens to the form later.
  if (submission) return result("submitted", { late: submission.late });
  if (status !== "published") return result("hidden");

  const schedule = formSchedule(settings);
  if (nowMs < schedule.visibleMs) return result("hidden");
  if (predatesAccount(schedule, userCreatedAtMs)) return result("hidden");
  if (nowMs < schedule.opensMs) return result("upcoming");
  if (nowMs > schedule.closeMs) return result("missed");

  if (prerequisite === "pending") {
    return result("locked", { lockReason: "prerequisite_pending" });
  }
  if (prerequisite === "missed") {
    return result("locked", { lockReason: "prerequisite_missed" });
  }

  if (nowMs > schedule.dueMs) {
    return result("open_late", { late: true, canSubmit: true, showQuestions: true });
  }
  return result("open", { canSubmit: true, showQuestions: true });
}

export interface FormLike {
  id: string;
  title: string;
  status: FormStatus;
  settings: FormSettings;
}

/**
 * Where a pledge stands on the deliverable that gates another one. This looks
 * only at the prerequisite's own schedule and never follows its chain, so a
 * cycle in the data cannot loop.
 */
export function resolvePrerequisite(
  prerequisiteFormId: string | null,
  prerequisiteForm: FormLike | null,
  submitted: SubmittedMap,
  userCreatedAtMs: number,
  nowMs: number,
): PrerequisiteStatus {
  if (prerequisiteFormId === null) return "none";
  if (submitted[prerequisiteFormId]) return "satisfied";
  // A prerequisite the pledge can never complete must not block them forever.
  if (!prerequisiteForm || prerequisiteForm.status !== "published") return "unavailable";

  const schedule = formSchedule(prerequisiteForm.settings);
  if (predatesAccount(schedule, userCreatedAtMs)) return "unavailable";
  if (nowMs > schedule.closeMs) return "missed";
  return "pending";
}

export interface EvaluatedForm extends FormStateResult {
  prerequisite: PrerequisiteStatus;
  lockedByTitle: string | null;
  /**
   * False while the deliverable this one waits on has not been released yet.
   * Its title is then not something the pledge should be shown.
   */
  lockedByVisible: boolean;
}

/** True once a published deliverable has reached its "visible from" time. */
export function isReleased(settings: FormSettings, nowMs: number): boolean {
  return nowMs >= formSchedule(settings).visibleMs;
}

/** True once a deliverable has reached its opening time, which is when its questions may be shown. */
export function hasOpened(settings: FormSettings, nowMs: number): boolean {
  return nowMs >= formSchedule(settings).opensMs;
}

/** The instant after which a response counts as late. Null when there is no deadline. */
export function lateAfterMs(settings: FormSettings): number | null {
  const dueMs = formSchedule(settings).dueMs;
  return Number.isFinite(dueMs) ? dueMs : null;
}

/** Resolves the prerequisite and computes the state in one step. */
export function evaluateForm(
  form: FormLike,
  formsById: ReadonlyMap<string, FormLike>,
  submitted: SubmittedMap,
  userCreatedAtMs: number,
  nowMs: number,
): EvaluatedForm {
  const prerequisiteId = form.settings.prerequisiteFormId;
  const prerequisiteForm = prerequisiteId ? (formsById.get(prerequisiteId) ?? null) : null;
  const prerequisite = resolvePrerequisite(
    prerequisiteId,
    prerequisiteForm,
    submitted,
    userCreatedAtMs,
    nowMs,
  );
  const state = computeFormState({
    status: form.status,
    settings: form.settings,
    submission: submitted[form.id] ?? null,
    prerequisite,
    userCreatedAtMs,
    nowMs,
  });
  const locked = state.state === "locked" && prerequisiteForm !== null;
  return {
    ...state,
    prerequisite,
    lockedByTitle: locked ? prerequisiteForm.title : null,
    lockedByVisible: locked && nowMs >= formSchedule(prerequisiteForm.settings).visibleMs,
  };
}

const STATE_LABELS: Record<FormState, string> = {
  hidden: "Not assigned",
  upcoming: "Upcoming",
  locked: "Locked",
  open: "Open",
  open_late: "Past due",
  submitted: "Submitted",
  missed: "Missed",
};

export function formStateLabel(state: FormState, late: boolean): string {
  if (state === "submitted") return late ? "Submitted late" : "Submitted";
  return STATE_LABELS[state];
}
