import { ID_PATTERN, LIMITS, isLocalId } from "./constants";
import { parseIso, toIso } from "./dates";
import { isRecord, readBoolean, readEnum, readInteger, readText } from "./parse";
import type {
  FieldIssue,
  FormDefinition,
  FormSettings,
  FormStatus,
  IsoDateTime,
  Question,
  QuestionOption,
  QuestionType,
  ShortTextValidation,
} from "./types";

/**
 * Validation of a form definition sent by an admin. Every field is read
 * individually from untrusted input and rebuilt, so nothing unexpected in the
 * request body can reach the database.
 */

const STATUSES: readonly FormStatus[] = ["draft", "published", "archived"];
const QUESTION_TYPES: readonly QuestionType[] = [
  "section",
  "short_text",
  "paragraph",
  "multiple_choice",
  "checkboxes",
  "dropdown",
  "linear_scale",
  "date",
  "time",
];
const VALIDATIONS: readonly ShortTextValidation[] = ["none", "number", "email", "url"];

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: FieldIssue[] };

class Issues {
  readonly list: FieldIssue[] = [];

  add(path: string, code: string, message: string): void {
    this.list.push({ path, code, message });
  }
}

function text(
  issues: Issues,
  path: string,
  value: unknown,
  max: number,
  options: { multiline?: boolean; required?: boolean; label: string },
): string {
  const read = readText(value ?? "", max, options.multiline ?? false);
  if (!read.ok) {
    issues.add(
      path,
      read.reason === "too_long" ? "too_long" : "invalid",
      read.reason === "too_long"
        ? `${options.label} must be ${max} characters or fewer.`
        : `${options.label} must be text.`,
    );
    return "";
  }
  if (options.required && read.value.length === 0) {
    issues.add(path, "required", `${options.label} is required.`);
  }
  return read.value;
}

function parseOptions(issues: Issues, path: string, value: unknown): QuestionOption[] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.add(path, "required", "Add at least one option.");
    return [];
  }
  if (value.length > LIMITS.maxOptions) {
    issues.add(path, "too_many", `A question can have at most ${LIMITS.maxOptions} options.`);
    return [];
  }
  const options: QuestionOption[] = [];
  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  value.forEach((raw, index) => {
    const optionPath = `${path}[${index}]`;
    if (!isRecord(raw) || !isLocalId(raw.id)) {
      issues.add(optionPath, "invalid", "This option is malformed.");
      return;
    }
    if (seenIds.has(raw.id)) {
      issues.add(optionPath, "duplicate", "Two options share the same id.");
      return;
    }
    const label = text(issues, `${optionPath}.label`, raw.label, LIMITS.optionLabel, {
      required: true,
      label: "Option",
    });
    const key = label.toLowerCase();
    if (label && seenLabels.has(key)) {
      issues.add(`${optionPath}.label`, "duplicate", "Options must be different from each other.");
    }
    seenIds.add(raw.id);
    seenLabels.add(key);
    options.push({ id: raw.id, label });
  });
  return options;
}

function parseQuestion(
  issues: Issues,
  path: string,
  raw: unknown,
  requireTitle: boolean,
): Question | null {
  if (!isRecord(raw)) {
    issues.add(path, "invalid", "This question is malformed.");
    return null;
  }
  if (!isLocalId(raw.id)) {
    issues.add(`${path}.id`, "invalid", "This question has an invalid id.");
    return null;
  }
  const type = readEnum(raw.type, QUESTION_TYPES);
  if (!type) {
    issues.add(`${path}.type`, "invalid", "Unknown question type.");
    return null;
  }

  const base = {
    id: raw.id,
    title: text(issues, `${path}.title`, raw.title, LIMITS.questionTitle, {
      required: requireTitle,
      label: type === "section" ? "Section title" : "Question",
    }),
    description: text(
      issues,
      `${path}.description`,
      raw.description,
      LIMITS.questionDescription,
      { multiline: true, label: "Description" },
    ),
  };
  if (type === "section") return { ...base, type };

  const required = readBoolean(raw.required) ?? false;
  switch (type) {
    case "short_text":
      return {
        ...base,
        type,
        required,
        validation: readEnum(raw.validation, VALIDATIONS) ?? "none",
      };
    case "paragraph":
    case "date":
    case "time":
      return { ...base, type, required };
    case "multiple_choice":
    case "checkboxes":
      return {
        ...base,
        type,
        required,
        options: parseOptions(issues, `${path}.options`, raw.options),
        allowOther: readBoolean(raw.allowOther) ?? false,
      };
    case "dropdown":
      return {
        ...base,
        type,
        required,
        options: parseOptions(issues, `${path}.options`, raw.options),
      };
    case "linear_scale": {
      const min = readInteger(raw.min);
      const max = readInteger(raw.max);
      if (min !== 0 && min !== 1) {
        issues.add(`${path}.min`, "invalid", "A scale must start at 0 or 1.");
      }
      if (max === null || max < LIMITS.scaleMaxLow || max > LIMITS.scaleMaxHigh) {
        issues.add(
          `${path}.max`,
          "invalid",
          `A scale must end between ${LIMITS.scaleMaxLow} and ${LIMITS.scaleMaxHigh}.`,
        );
      }
      return {
        ...base,
        type,
        required,
        min: min === 0 ? 0 : 1,
        max: max ?? 5,
        minLabel: text(issues, `${path}.minLabel`, raw.minLabel, LIMITS.scaleLabel, {
          label: "Scale label",
        }),
        maxLabel: text(issues, `${path}.maxLabel`, raw.maxLabel, LIMITS.scaleLabel, {
          label: "Scale label",
        }),
      };
    }
  }
}

const SCHEDULE_FIELDS = [
  { key: "visibleAt", label: "Visible from" },
  { key: "opensAt", label: "Opens" },
  { key: "dueAt", label: "Due" },
  { key: "closesAt", label: "Late submissions close" },
] as const;

function parseSettings(issues: Issues, raw: unknown): FormSettings {
  const source = isRecord(raw) ? raw : {};
  if (!isRecord(raw)) issues.add("settings", "invalid", "Settings are missing.");

  const allowLate = readBoolean(source.allowLate) ?? false;
  const times: Record<(typeof SCHEDULE_FIELDS)[number]["key"], IsoDateTime | null> = {
    visibleAt: null,
    opensAt: null,
    dueAt: null,
    closesAt: null,
  };
  for (const { key, label } of SCHEDULE_FIELDS) {
    const value = source[key];
    if (value === null || value === undefined || value === "") continue;
    const ms = parseIso(value);
    if (ms === null) {
      issues.add(`settings.${key}`, "invalid", `${label} is not a valid date and time.`);
      continue;
    }
    times[key] = toIso(ms);
  }
  // The late cut-off only means something when late submissions are accepted.
  if (!allowLate) times.closesAt = null;
  if (times.closesAt !== null && times.dueAt === null) {
    issues.add(
      "settings.closesAt",
      "needs_due",
      "Set a due date first. A response can only be late once there is a deadline.",
    );
  }

  let previous: { label: string; ms: number } | null = null;
  for (const { key, label } of SCHEDULE_FIELDS) {
    const iso = times[key];
    if (iso === null) continue;
    const ms = parseIso(iso) ?? 0;
    if (previous && ms < previous.ms) {
      issues.add(
        `settings.${key}`,
        "out_of_order",
        `${label} must not be earlier than ${previous.label.toLowerCase()}.`,
      );
    }
    previous = { label, ms };
  }

  let prerequisiteFormId: string | null = null;
  const prerequisite = source.prerequisiteFormId;
  if (prerequisite !== null && prerequisite !== undefined && prerequisite !== "") {
    if (typeof prerequisite === "string" && ID_PATTERN.test(prerequisite)) {
      prerequisiteFormId = prerequisite;
    } else {
      issues.add("settings.prerequisiteFormId", "invalid", "Choose a valid deliverable.");
    }
  }

  return {
    ...times,
    allowLate,
    prerequisiteFormId,
    confirmationMessage: text(
      issues,
      "settings.confirmationMessage",
      source.confirmationMessage,
      LIMITS.confirmationMessage,
      { multiline: true, label: "Confirmation message" },
    ),
  };
}

export function validateFormDefinition(input: unknown): ValidationResult<FormDefinition> {
  const issues = new Issues();
  if (!isRecord(input)) {
    issues.add("", "invalid", "The form is malformed.");
    return { ok: false, issues: issues.list };
  }

  const status = readEnum(input.status, STATUSES);
  if (!status) issues.add("status", "invalid", "Unknown form status.");
  const publishing = status === "published";

  const title = text(issues, "title", input.title, LIMITS.formTitle, {
    required: true,
    label: "Title",
  });
  const description = text(issues, "description", input.description, LIMITS.formDescription, {
    multiline: true,
    label: "Description",
  });

  const questions: Question[] = [];
  if (!Array.isArray(input.questions)) {
    issues.add("questions", "invalid", "Questions are missing.");
  } else if (input.questions.length > LIMITS.maxQuestions) {
    issues.add(
      "questions",
      "too_many",
      `A deliverable can have at most ${LIMITS.maxQuestions} questions.`,
    );
  } else {
    const seen = new Set<string>();
    input.questions.forEach((raw, index) => {
      const question = parseQuestion(issues, `questions[${index}]`, raw, publishing);
      if (!question) return;
      if (seen.has(question.id)) {
        issues.add(`questions[${index}].id`, "duplicate", "Two questions share the same id.");
        return;
      }
      seen.add(question.id);
      questions.push(question);
    });
  }

  if (publishing && !questions.some((question) => question.type !== "section")) {
    issues.add("questions", "required", "Add at least one question before publishing.");
  }

  const settings = parseSettings(issues, input.settings);

  if (issues.list.length > 0 || !status) return { ok: false, issues: issues.list };
  return { ok: true, value: { title, description, status, questions, settings } };
}

/**
 * Follows the prerequisite chain starting from `prerequisiteFormId`. Returns the
 * ids on the loop when it leads back to `formId`, otherwise null.
 */
export function findPrerequisiteCycle(
  formId: string,
  prerequisiteFormId: string | null,
  prerequisiteOf: ReadonlyMap<string, string | null>,
): string[] | null {
  const path = [formId];
  let current = prerequisiteFormId;
  for (let steps = 0; current !== null && steps <= prerequisiteOf.size + 1; steps += 1) {
    if (current === formId) return [...path, formId];
    if (path.includes(current)) return null;
    path.push(current);
    current = prerequisiteOf.get(current) ?? null;
  }
  return null;
}

/** Ids of questions whose type differs between two versions of a form. */
export function changedQuestionTypes(previous: Question[], next: Question[]): string[] {
  const previousTypes = new Map(previous.map((question) => [question.id, question.type]));
  return next
    .filter((question) => {
      const before = previousTypes.get(question.id);
      return before !== undefined && before !== question.type;
    })
    .map((question) => question.id);
}

export function countAnswerable(questions: Question[]): number {
  return questions.filter((question) => question.type !== "section").length;
}

export function emptySettings(): FormSettings {
  return {
    visibleAt: null,
    opensAt: null,
    dueAt: null,
    closesAt: null,
    allowLate: false,
    prerequisiteFormId: null,
    confirmationMessage: "",
  };
}
