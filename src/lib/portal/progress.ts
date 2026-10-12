import { parseIso } from "./dates";
import { evaluateForm, type EvaluatedForm, type FormLike } from "./form-state";
import type { FormState, IsoDateTime, Progress, SubmittedMap } from "./types";

export interface Standing {
  /** Keyed by form id. */
  byForm: Record<string, EvaluatedForm>;
  progress: Progress;
}

/** Where one pledge stands on every deliverable, for the admin views. */
export function standingFor(
  pledge: { submitted: SubmittedMap; createdAt: IsoDateTime },
  forms: readonly FormLike[],
  nowMs: number,
): Standing {
  const formsById = new Map(forms.map((form) => [form.id, form]));
  const createdAtMs = parseIso(pledge.createdAt) ?? 0;
  const byForm: Record<string, EvaluatedForm> = {};
  for (const form of forms) {
    byForm[form.id] = evaluateForm(form, formsById, pledge.submitted, createdAtMs, nowMs);
  }
  return { byForm, progress: computeProgress(Object.values(byForm)) };
}

/** Summarizes one pledge's standing across every deliverable they can see. */
export function computeProgress(
  forms: ReadonlyArray<{ state: FormState; late: boolean }>,
): Progress {
  const progress: Progress = {
    total: 0,
    released: 0,
    submitted: 0,
    onTime: 0,
    late: 0,
    missed: 0,
    outstanding: 0,
    upcoming: 0,
    completionPct: 0,
  };

  for (const form of forms) {
    if (form.state === "hidden") continue;
    progress.total += 1;
    switch (form.state) {
      case "submitted":
        progress.submitted += 1;
        if (form.late) progress.late += 1;
        else progress.onTime += 1;
        break;
      case "missed":
        progress.missed += 1;
        break;
      case "upcoming":
        progress.upcoming += 1;
        break;
      case "open":
      case "open_late":
      case "locked":
        progress.outstanding += 1;
        break;
    }
  }

  progress.released = progress.total - progress.upcoming;
  progress.completionPct =
    progress.released > 0 ? Math.round((progress.submitted / progress.released) * 100) : 0;
  return progress;
}
