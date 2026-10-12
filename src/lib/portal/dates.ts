import type { IsoDateTime } from "./types";

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/**
 * Parses a UTC ISO-8601 timestamp strictly. Returns epoch milliseconds, or null
 * for anything else, including impossible dates such as February 30th.
 */
export function parseIso(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_UTC.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 19) === value.slice(0, 19) ? ms : null;
}

export function toIso(ms: number): IsoDateTime {
  return new Date(ms).toISOString();
}

/** Milliseconds for a timestamp that is already known to be valid, or null when absent. */
export function msOrNull(value: IsoDateTime | null): number | null {
  return value === null ? null : parseIso(value);
}

/** A calendar date with no time zone, "YYYY-MM-DD". */
export function isCivilDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Date.UTC reads a year under 100 as 19xx, so the year is set on its own.
  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(year);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** A wall-clock time with no time zone, "HH:mm". */
export function isCivilTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// ── Display ──────────────────────────────────────────────────────────────────

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const DATE_TIME_WITH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const DATE_ONLY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const TIME_ONLY = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

/** "Wed, Oct 14, 11:59 PM" in the viewer's time zone. */
export function formatDateTime(value: IsoDateTime | null, withYear = false): string {
  const ms = msOrNull(value);
  if (ms === null) return "";
  return (withYear ? DATE_TIME_WITH_YEAR : DATE_TIME).format(ms);
}

export function formatDate(value: IsoDateTime | null): string {
  const ms = msOrNull(value);
  return ms === null ? "" : DATE_ONLY.format(ms);
}

export function formatTime(value: IsoDateTime | null): string {
  const ms = msOrNull(value);
  return ms === null ? "" : TIME_ONLY.format(ms);
}

const RELATIVE_STEPS: ReadonlyArray<{ limit: number; divisor: number; unit: string }> = [
  { limit: 3_600_000, divisor: 60_000, unit: "minute" },
  { limit: 86_400_000, divisor: 3_600_000, unit: "hour" },
  { limit: 30 * 86_400_000, divisor: 86_400_000, unit: "day" },
  { limit: 365 * 86_400_000, divisor: 30 * 86_400_000, unit: "month" },
];

/** "in 3 days", "2 hours ago", "just now". */
export function formatRelative(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  const distance = Math.abs(diff);
  if (distance < 60_000) return diff >= 0 ? "in under a minute" : "just now";
  const step = RELATIVE_STEPS.find((candidate) => distance < candidate.limit);
  const count = step
    ? Math.max(1, Math.floor(distance / step.divisor))
    : Math.max(1, Math.floor(distance / (365 * 86_400_000)));
  const unit = step ? step.unit : "year";
  const label = `${count} ${unit}${count === 1 ? "" : "s"}`;
  return diff >= 0 ? `in ${label}` : `${label} ago`;
}

/** "3d 02h", "2h 05m", "12m", "45s". Rolls into days from 24 hours. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${String(hours % 24).padStart(2, "0")}h`;
}

// ── <input type="datetime-local"> ────────────────────────────────────────────

/** The value for a datetime-local input, in the viewer's time zone. */
export function isoToLocalInput(value: IsoDateTime | null): string {
  const ms = msOrNull(value);
  if (ms === null) return "";
  const date = new Date(ms);
  const pad = (part: number) => String(part).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Reads a datetime-local value as the viewer's local time. Null when empty or invalid. */
export function localInputToIso(value: string): IsoDateTime | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? toIso(ms) : null;
}

/**
 * A date or time answer the way people read it ("Oct 3, 2026", "12:30 PM").
 * These answers are stored as plain "2026-10-03" and "12:30", with no time
 * zone, so they are formatted as written. Any other answer is returned as it is.
 */
export function formatAnswerText(questionType: string, value: string): string {
  if (questionType === "date" && isCivilDate(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  if (questionType === "time" && isCivilTime(value)) {
    const [hour, minute] = value.split(":").map(Number);
    return new Date(Date.UTC(2000, 0, 1, hour, minute)).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    });
  }
  return value;
}
