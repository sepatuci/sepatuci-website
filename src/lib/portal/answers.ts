import { LIMITS } from "./constants";
import { isCivilDate, isCivilTime } from "./dates";
import type { ValidationResult } from "./form-schema";
import { isEmail, isHttpUrl, isNumeric, isRecord, readText } from "./parse";
import type { Answer, AnswerableQuestion, Answers, FieldIssue, Question } from "./types";

/**
 * Validation of a pledge's answers against the form definition. The server
 * runs this on every submission, so a response can never contain an option
 * that does not exist, skip a required question, or carry an unsafe link.
 */

type Normalized =
  | { ok: true; answer: Answer | null }
  | { ok: false; code: string; message: string };

const blank: Normalized = { ok: true, answer: null };
const fail = (code: string, message: string): Normalized => ({ ok: false, code, message });

function normalizeText(question: AnswerableQuestion, raw: unknown, draft: boolean): Normalized {
  if (!isRecord(raw) || raw.kind !== "text") return fail("invalid", "This answer is malformed.");
  const multiline = question.type === "paragraph";
  const max = multiline ? LIMITS.paragraph : LIMITS.shortText;
  let read = readText(raw.value, max, multiline);
  // A draft that has outgrown the limit keeps what fits instead of losing the whole answer.
  if (draft && !read.ok && read.reason === "too_long" && typeof raw.value === "string") {
    read = readText(raw.value.slice(0, max).trimEnd(), max, multiline);
  }
  if (!read.ok) {
    return read.reason === "too_long"
      ? fail("too_long", `Keep this answer to ${max} characters or fewer.`)
      : fail("invalid", "This answer is malformed.");
  }
  const value = read.value;
  if (value.length === 0) return blank;

  if (question.type === "date" && !isCivilDate(value)) {
    return fail("invalid_date", "Enter a valid date.");
  }
  if (question.type === "time" && !isCivilTime(value)) {
    return fail("invalid_time", "Enter a valid time.");
  }
  // What is typed so far is kept in a draft as it is. Whether it is a proper
  // number, email or link is only judged when the deliverable is turned in.
  if (question.type === "short_text" && !draft) {
    if (question.validation === "number" && !isNumeric(value)) {
      return fail("invalid_number", "Enter a number.");
    }
    if (question.validation === "email" && !isEmail(value)) {
      return fail("invalid_email", "Enter a valid email address.");
    }
    if (question.validation === "url" && !isHttpUrl(value)) {
      return fail("invalid_url", "Enter a full link that starts with https://");
    }
  }
  return { ok: true, answer: { kind: "text", value } };
}

function readOther(raw: unknown, allowed: boolean): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (!allowed) return { ok: false };
  const read = readText(raw, LIMITS.otherText);
  if (!read.ok) return { ok: false };
  return { ok: true, value: read.value.length > 0 ? read.value : null };
}

function normalizeChoice(question: AnswerableQuestion, raw: unknown): Normalized {
  if (question.type !== "multiple_choice" && question.type !== "dropdown") return blank;
  if (!isRecord(raw) || raw.kind !== "choice") return fail("invalid", "This answer is malformed.");

  const other = readOther(raw.other, question.type === "multiple_choice" && question.allowOther);
  if (!other.ok) return fail("invalid", "This answer is malformed.");

  const optionId = raw.optionId ?? null;
  if (optionId !== null) {
    if (typeof optionId !== "string" || !question.options.some((option) => option.id === optionId)) {
      return fail("invalid_option", "Choose one of the listed options.");
    }
    if (other.value !== null) return fail("invalid", "Choose a single option.");
    return { ok: true, answer: { kind: "choice", optionId, other: null } };
  }
  if (other.value !== null) {
    return { ok: true, answer: { kind: "choice", optionId: null, other: other.value } };
  }
  return blank;
}

function normalizeChoices(question: AnswerableQuestion, raw: unknown): Normalized {
  if (question.type !== "checkboxes") return blank;
  if (!isRecord(raw) || raw.kind !== "choices" || !Array.isArray(raw.optionIds)) {
    return fail("invalid", "This answer is malformed.");
  }
  const other = readOther(raw.other, question.allowOther);
  if (!other.ok) return fail("invalid", "This answer is malformed.");

  const valid = new Set(question.options.map((option) => option.id));
  const chosen = new Set<string>();
  for (const optionId of raw.optionIds) {
    if (typeof optionId !== "string" || !valid.has(optionId)) {
      return fail("invalid_option", "Choose from the listed options.");
    }
    chosen.add(optionId);
  }
  if (chosen.size === 0 && other.value === null) return blank;
  // Keep the options in the order the form lists them.
  const optionIds = question.options.map((option) => option.id).filter((id) => chosen.has(id));
  return { ok: true, answer: { kind: "choices", optionIds, other: other.value } };
}

function normalizeScale(question: AnswerableQuestion, raw: unknown): Normalized {
  if (question.type !== "linear_scale") return blank;
  if (!isRecord(raw) || raw.kind !== "scale") return fail("invalid", "This answer is malformed.");
  const value = raw.value;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < question.min ||
    value > question.max
  ) {
    return fail("invalid_scale", `Choose a value from ${question.min} to ${question.max}.`);
  }
  return { ok: true, answer: { kind: "scale", value } };
}

function normalize(question: AnswerableQuestion, raw: unknown, draft = false): Normalized {
  if (raw === undefined || raw === null) return blank;
  switch (question.type) {
    case "short_text":
    case "paragraph":
    case "date":
    case "time":
      return normalizeText(question, raw, draft);
    case "multiple_choice":
    case "dropdown":
      return normalizeChoice(question, raw);
    case "checkboxes":
      return normalizeChoices(question, raw);
    case "linear_scale":
      return normalizeScale(question, raw);
  }
}

function answerable(questions: Question[]): AnswerableQuestion[] {
  return questions.filter(
    (question): question is AnswerableQuestion => question.type !== "section",
  );
}

/** Reads a key the caller sent, never one the object merely inherits. */
function own(input: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(input, key) ? input[key] : undefined;
}

/**
 * Strict validation for a submission. Answers to questions that are no longer
 * on the form are dropped, which is what happens to a draft started before an
 * admin edited the form.
 */
export function validateAnswers(questions: Question[], input: unknown): ValidationResult<Answers> {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [{ path: "answers", code: "invalid", message: "The response is malformed." }],
    };
  }
  const issues: FieldIssue[] = [];
  const answers: Answers = {};
  for (const question of answerable(questions)) {
    const path = `answers.${question.id}`;
    const normalized = normalize(question, own(input, question.id));
    if (!normalized.ok) {
      issues.push({ path, code: normalized.code, message: normalized.message });
    } else if (normalized.answer) {
      answers[question.id] = normalized.answer;
    } else if (question.required) {
      issues.push({ path, code: "required", message: "This is a required question." });
    }
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: answers };
}

/**
 * Lenient pass for autosaved drafts. Text is kept as typed, cut to the length
 * limit if need be, so saving never throws away work in progress. Anything
 * that could not belong to the form at all (an option that does not exist, a
 * value of the wrong kind, an impossible date) is dropped.
 */
export function sanitizeDraftAnswers(questions: Question[], input: unknown): Answers {
  const answers: Answers = {};
  if (!isRecord(input)) return answers;
  for (const question of answerable(questions)) {
    const normalized = normalize(question, own(input, question.id), true);
    if (normalized.ok && normalized.answer) answers[question.id] = normalized.answer;
  }
  return answers;
}

export function countAnswered(questions: Question[], answers: Answers): number {
  return answerable(questions).filter((question) => own(answers, question.id) !== undefined).length;
}

/** A response rendered as plain text, for tables and CSV export. */
export function answerToText(question: Question, answer: Answer | undefined): string {
  if (question.type === "section" || !answer) return "";
  switch (answer.kind) {
    case "text":
      return answer.value;
    case "scale":
      return String(answer.value);
    case "choice": {
      if (answer.other !== null) return `Other: ${answer.other}`;
      return optionLabel(question, answer.optionId);
    }
    case "choices": {
      const labels = answer.optionIds.map((id) => optionLabel(question, id));
      if (answer.other !== null) labels.push(`Other: ${answer.other}`);
      return labels.join("; ");
    }
  }
}

export function optionLabel(question: Question, optionId: string | null): string {
  if (optionId === null || !("options" in question)) return "";
  return question.options.find((option) => option.id === optionId)?.label ?? "(removed option)";
}
