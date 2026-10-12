import type { Answer, Answers, AnswerableQuestion, Question } from "./types";

/** Aggregation of responses for the admin "Responses" tab. */

export interface Bucket {
  label: string;
  count: number;
}

interface SummaryBase {
  questionId: string;
  title: string;
  required: boolean;
  /** How many responses answered this question. */
  answered: number;
}

export interface ChoiceSummary extends SummaryBase {
  kind: "choice";
  /** True for checkboxes, where one response can count in several buckets. */
  multiple: boolean;
  buckets: Bucket[];
  otherResponses: string[];
}

export interface ScaleSummary extends SummaryBase {
  kind: "scale";
  buckets: Bucket[];
  average: number | null;
  minLabel: string;
  maxLabel: string;
}

export interface TextSummary extends SummaryBase {
  kind: "text";
  responses: string[];
}

export type QuestionSummary = ChoiceSummary | ScaleSummary | TextSummary;

export interface ResponseForSummary {
  answers: Answers;
  /** The questions as they were when the response was submitted. */
  questions: Question[];
}

const REMOVED_OPTION = "(removed option)";

function snapshotLabel(response: ResponseForSummary, questionId: string, optionId: string): string {
  const snapshot = response.questions.find((question) => question.id === questionId);
  if (!snapshot || !("options" in snapshot)) return REMOVED_OPTION;
  return snapshot.options.find((option) => option.id === optionId)?.label ?? REMOVED_OPTION;
}

function summarizeChoice(
  question: Extract<AnswerableQuestion, { options: unknown }>,
  responses: readonly ResponseForSummary[],
): ChoiceSummary {
  const counts = new Map<string, number>(question.options.map((option) => [option.label, 0]));
  const currentLabels = new Map(question.options.map((option) => [option.id, option.label]));
  const otherResponses: string[] = [];
  let answered = 0;

  const bump = (response: ResponseForSummary, optionId: string) => {
    const label = currentLabels.get(optionId) ?? snapshotLabel(response, question.id, optionId);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  };

  for (const response of responses) {
    const answer: Answer | undefined = response.answers[question.id];
    if (!answer) continue;
    if (answer.kind === "choice") {
      answered += 1;
      if (answer.optionId !== null) bump(response, answer.optionId);
      if (answer.other !== null) otherResponses.push(answer.other);
    } else if (answer.kind === "choices") {
      answered += 1;
      answer.optionIds.forEach((optionId) => bump(response, optionId));
      if (answer.other !== null) otherResponses.push(answer.other);
    }
  }

  const buckets = [...counts].map(([label, count]) => ({ label, count }));
  if (otherResponses.length > 0) buckets.push({ label: "Other", count: otherResponses.length });
  return {
    kind: "choice",
    questionId: question.id,
    title: question.title,
    required: question.required,
    multiple: question.type === "checkboxes",
    answered,
    buckets,
    otherResponses,
  };
}

function summarizeScale(
  question: Extract<AnswerableQuestion, { type: "linear_scale" }>,
  responses: readonly ResponseForSummary[],
): ScaleSummary {
  const counts = new Map<number, number>();
  for (let value = question.min; value <= question.max; value += 1) counts.set(value, 0);
  let answered = 0;
  let sum = 0;
  for (const response of responses) {
    const answer = response.answers[question.id];
    if (!answer || answer.kind !== "scale") continue;
    answered += 1;
    sum += answer.value;
    counts.set(answer.value, (counts.get(answer.value) ?? 0) + 1);
  }
  return {
    kind: "scale",
    questionId: question.id,
    title: question.title,
    required: question.required,
    answered,
    buckets: [...counts]
      .sort(([a], [b]) => a - b)
      .map(([value, count]) => ({ label: String(value), count })),
    average: answered > 0 ? Math.round((sum / answered) * 100) / 100 : null,
    minLabel: question.minLabel,
    maxLabel: question.maxLabel,
  };
}

function summarizeText(
  question: AnswerableQuestion,
  responses: readonly ResponseForSummary[],
): TextSummary {
  const values: string[] = [];
  for (const response of responses) {
    const answer = response.answers[question.id];
    if (answer && answer.kind === "text") values.push(answer.value);
  }
  return {
    kind: "text",
    questionId: question.id,
    title: question.title,
    required: question.required,
    answered: values.length,
    responses: values,
  };
}

/** One summary per answerable question on the current version of the form, in form order. */
export function summarizeResponses(
  questions: Question[],
  responses: readonly ResponseForSummary[],
): QuestionSummary[] {
  const summaries: QuestionSummary[] = [];
  for (const question of questions) {
    switch (question.type) {
      case "section":
        break;
      case "multiple_choice":
      case "checkboxes":
      case "dropdown":
        summaries.push(summarizeChoice(question, responses));
        break;
      case "linear_scale":
        summaries.push(summarizeScale(question, responses));
        break;
      default:
        summaries.push(summarizeText(question, responses));
    }
  }
  return summaries;
}

export interface TimingSummary {
  count: number;
  onTime: number;
  late: number;
  /** From first opening the deliverable to submitting it. Null when there are no responses. */
  averageDurationSeconds: number | null;
  medianDurationSeconds: number | null;
  fastestDurationSeconds: number | null;
  slowestDurationSeconds: number | null;
  /** Time with the deliverable actually open in a visible tab. */
  averageActiveSeconds: number | null;
}

function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function mean(values: number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function summarizeTiming(
  responses: ReadonlyArray<{ durationSeconds: number; activeSeconds: number; late: boolean }>,
): TimingSummary {
  const count = responses.length;
  const late = responses.filter((response) => response.late).length;
  if (count === 0) {
    return {
      count: 0,
      onTime: 0,
      late: 0,
      averageDurationSeconds: null,
      medianDurationSeconds: null,
      fastestDurationSeconds: null,
      slowestDurationSeconds: null,
      averageActiveSeconds: null,
    };
  }
  const durations = responses.map((response) => response.durationSeconds).sort((a, b) => a - b);
  return {
    count,
    onTime: count - late,
    late,
    averageDurationSeconds: mean(durations),
    medianDurationSeconds: median(durations),
    fastestDurationSeconds: durations[0],
    slowestDurationSeconds: durations[durations.length - 1],
    averageActiveSeconds: mean(responses.map((response) => response.activeSeconds)),
  };
}
