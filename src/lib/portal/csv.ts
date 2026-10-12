import { answerToText } from "./answers";
import type { Question, ResponseRowDto } from "./types";

// Spreadsheet apps run a cell as a formula when it starts with one of these.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** Quotes one cell and defuses spreadsheet formulas in pledge-supplied text. */
export function csvCell(value: string): string {
  const safe = FORMULA_LEAD.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

type Column = { question: Question; removed: boolean };

/**
 * One row per response. The columns are the questions on the current version
 * of the form, followed by any that a response answered but that have since
 * been removed, so the download never drops something a pledge wrote. Each
 * answer is read against the questions as that pledge saw them, which keeps an
 * option's wording even after it has been renamed or deleted.
 */
export function responsesToCsv(
  questions: Question[],
  responses: readonly ResponseRowDto[],
  teamNames: ReadonlyMap<string, string> = new Map(),
): string {
  const columns: Column[] = questions
    .filter((question) => question.type !== "section")
    .map((question) => ({ question, removed: false }));
  const known = new Set(columns.map((column) => column.question.id));
  for (const response of responses) {
    for (const question of response.questions) {
      if (question.type === "section" || known.has(question.id)) continue;
      // Only worth a column if this response actually answered it.
      if (!Object.prototype.hasOwnProperty.call(response.answers, question.id)) continue;
      known.add(question.id);
      columns.push({ question, removed: true });
    }
  }

  const header = [
    "Name",
    "Email",
    "Team",
    "Submitted at (UTC)",
    "Status",
    "Minutes from open to submit",
    "Active minutes",
    ...columns.map(
      ({ question, removed }) => `${question.title || "Untitled question"}${removed ? " (removed)" : ""}`,
    ),
  ];
  const rows = responses.map((response) => {
    const asAnswered = new Map(response.questions.map((question) => [question.id, question]));
    return [
      response.displayName,
      response.email,
      (response.teamId ? teamNames.get(response.teamId) : undefined) ?? "",
      response.submittedAt,
      response.late ? "Late" : "On time",
      (response.durationSeconds / 60).toFixed(1),
      (response.activeSeconds / 60).toFixed(1),
      ...columns.map(({ question }) =>
        answerToText(asAnswered.get(question.id) ?? question, response.answers[question.id]),
      ),
    ];
  });
  return toCsv([header, ...rows]);
}
