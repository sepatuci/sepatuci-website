import { formatDateTime } from "./dates";
import type { FormSettings, Question, QuestionOption, QuestionType } from "./types";

/** Pure helpers behind the form builder. */

export const QUESTION_TYPE_LABELS: Record<Exclude<QuestionType, "section">, string> = {
  short_text: "Short answer",
  paragraph: "Paragraph",
  multiple_choice: "Multiple choice",
  checkboxes: "Checkboxes",
  dropdown: "Dropdown",
  linear_scale: "Linear scale",
  date: "Date",
  time: "Time",
};

export function newLocalId(prefix: "q" | "o"): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

const firstOption = (): QuestionOption[] => [{ id: newLocalId("o"), label: "Option 1" }];

export function blankQuestion(type: QuestionType): Question {
  return convertQuestion({ id: newLocalId("q"), type: "section", title: "", description: "" }, type);
}

/** Changes a question's type, keeping whatever carries over: its text, its required flag, its options. */
export function convertQuestion(question: Question, type: QuestionType): Question {
  const base = { id: question.id, title: question.title, description: question.description };
  if (type === "section") return { ...base, type };

  const required = question.type === "section" ? false : question.required;
  const options = "options" in question ? question.options : firstOption();
  switch (type) {
    case "short_text":
      return { ...base, type, required, validation: "none" };
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
        options,
        allowOther: "allowOther" in question ? question.allowOther : false,
      };
    case "dropdown":
      return { ...base, type, required, options };
    case "linear_scale":
      return { ...base, type, required, min: 1, max: 5, minLabel: "", maxLabel: "" };
  }
}

/** A copy with fresh ids, so the copy and the original never share answers. */
export function duplicateQuestion(question: Question): Question {
  const copy = { ...question, id: newLocalId("q") };
  if ("options" in copy) {
    return { ...copy, options: copy.options.map((option) => ({ ...option, id: newLocalId("o") })) };
  }
  return copy;
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** The schedule in plain sentences, so an admin can check it reads the way they meant. */
export function describeSchedule(settings: FormSettings, prerequisiteTitle: string | null): string[] {
  const lines: string[] = [];
  lines.push(
    settings.visibleAt
      ? `Appears on pledge dashboards ${formatDateTime(settings.visibleAt, true)}.`
      : "Appears on pledge dashboards as soon as it is published.",
  );
  lines.push(
    settings.opensAt
      ? `Can be started from ${formatDateTime(settings.opensAt, true)}.`
      : "Can be started as soon as it appears.",
  );
  lines.push(settings.dueAt ? `Due ${formatDateTime(settings.dueAt, true)}.` : "Has no deadline.");
  if (settings.allowLate) {
    lines.push(
      settings.closesAt
        ? `Late responses are accepted until ${formatDateTime(settings.closesAt, true)} and marked late.`
        : "Late responses are accepted with no cut-off and marked late.",
    );
  } else if (settings.dueAt) {
    lines.push("Closes at the deadline. Late responses are not accepted.");
  }
  if (prerequisiteTitle) {
    lines.push(`Stays locked for each pledge until they turn in "${prerequisiteTitle}".`);
  }
  return lines;
}
