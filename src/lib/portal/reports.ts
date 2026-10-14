import { LIMITS, PORTAL_TIME_ZONE, PROGRAM_NAME, TIMING } from "./constants";
import { civilDate } from "./day";
import { isRecord, readEnum, readText } from "./parse";
import type { FieldIssue, ReportTopic } from "./types";

/**
 * Anonymous reports. Anyone signed in can send one an hour. What is kept is
 * the topic, the text and the day it was sent: nothing about who sent it, and
 * not the time of day, which could be matched to who was online.
 */

export const REPORT_TOPICS: readonly ReportTopic[] = ["conduct", "safety", "program", "other"];

export const REPORT_TOPIC_LABEL: Record<ReportTopic, string> = {
  conduct: "Someone's behavior",
  safety: "Safety or wellbeing",
  program: PROGRAM_NAME,
  other: "Something else",
};

export interface ReportInput {
  topic: ReportTopic | null;
  body: string;
}

export type ReportInputResult = { ok: true; value: ReportInput } | { ok: false; issues: FieldIssue[] };

/** Reads a report as sent. The topic is optional; the text is not. */
export function readReportInput(body: unknown): ReportInputResult {
  const input = isRecord(body) ? body : {};
  const issues: FieldIssue[] = [];

  let topic: ReportTopic | null = null;
  if (input.topic !== undefined && input.topic !== null && input.topic !== "") {
    topic = readEnum(input.topic, REPORT_TOPICS);
    if (topic === null) {
      issues.push({ path: "topic", code: "invalid", message: "Choose a topic from the list." });
    }
  }

  const read = readText(input.body, LIMITS.reportBody, true);
  let text = "";
  if (!read.ok && read.reason === "too_long") {
    issues.push({
      path: "body",
      code: "too_long",
      message: `Keep it to ${LIMITS.reportBody.toLocaleString("en-US")} characters.`,
    });
  } else if (!read.ok || read.value.length === 0) {
    issues.push({ path: "body", code: "required", message: "Write what you want to report." });
  } else if (read.value.length < LIMITS.reportBodyMin) {
    issues.push({ path: "body", code: "too_short", message: "Add a little more detail." });
  } else {
    text = read.value;
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: { topic, body: text } };
}

// A marker can only ever be written one interval ahead. One further out than
// this, with room for clocks that disagree, is not one the portal wrote and
// must not block anyone.
const CLOCK_SLACK_MS = 5 * 60_000;

/** Whole minutes until another report may be sent, rounded up. Zero when one may be sent now. */
export function reportWaitMinutes(untilMs: number | null, nowMs: number): number {
  if (untilMs === null || !Number.isFinite(untilMs)) return 0;
  if (untilMs <= nowMs) return 0;
  if (untilMs - nowMs > TIMING.reportIntervalMs + CLOCK_SLACK_MS) return 0;
  return Math.ceil((untilMs - nowMs) / 60_000);
}

export function minutesLabel(minutes: number): string {
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** What someone who has already sent a report this hour is told. */
export function reportLimitMessage(waitMinutes: number): string {
  return `You can send one report an hour. You can send another in ${minutesLabel(Math.max(1, waitMinutes))}.`;
}

/** The day a report is filed under: the date where the chapter is. */
export function reportDay(nowMs: number): string {
  return civilDate(nowMs, PORTAL_TIME_ZONE);
}

/**
 * Admins see a report from the day after it was sent. Shown the moment it
 * arrived, it could be matched to whoever was online just then.
 */
export function isReleased(receivedOn: string, today: string): boolean {
  return receivedOn < today;
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "Mon, Oct 12" for a stored YYYY-MM-DD day, the same wherever it is read. */
export function formatReportDay(day: string, withYear = false): string {
  const match = DAY_PATTERN.exec(day);
  if (!match) return day;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(date);
}
