import { describe, expect, it } from "vitest";
import { LIMITS, PROGRAM_NAME, TIMING } from "./constants";
import {
  REPORT_TOPICS,
  REPORT_TOPIC_LABEL,
  formatReportDay,
  isReleased,
  minutesLabel,
  readReportInput,
  reportDay,
  reportLimitMessage,
  reportWaitMinutes,
} from "./reports";

const MINUTE = 60_000;
const NOW = Date.UTC(2026, 9, 13, 18, 0, 0);
const ENOUGH = "Something happened that e-board should know about.";

describe("readReportInput", () => {
  it("takes the text alone, with no topic", () => {
    expect(readReportInput({ body: ENOUGH })).toEqual({ ok: true, value: { topic: null, body: ENOUGH } });
    expect(readReportInput({ body: ENOUGH, topic: null })).toEqual({ ok: true, value: { topic: null, body: ENOUGH } });
    expect(readReportInput({ body: ENOUGH, topic: "" })).toEqual({ ok: true, value: { topic: null, body: ENOUGH } });
  });

  it("takes every listed topic and nothing else", () => {
    for (const topic of REPORT_TOPICS) {
      expect(readReportInput({ body: ENOUGH, topic })).toEqual({ ok: true, value: { topic, body: ENOUGH } });
    }
    for (const topic of ["Safety", "admin", "constructor", 3, true, {}, ["safety"]]) {
      const result = readReportInput({ body: ENOUGH, topic });
      expect(result.ok, String(topic)).toBe(false);
      if (!result.ok) expect(result.issues.map((issue) => `${issue.path}:${issue.code}`)).toEqual(["topic:invalid"]);
    }
  });

  it("needs at least a few words, and no more than the limit", () => {
    const codes = (body: unknown): string[] => {
      const result = readReportInput({ body });
      return result.ok ? [] : result.issues.map((issue) => `${issue.path}:${issue.code}`);
    };
    expect(codes(undefined)).toEqual(["body:required"]);
    expect(codes(42)).toEqual(["body:required"]);
    expect(codes("")).toEqual(["body:required"]);
    expect(codes("   \n\t  ")).toEqual(["body:required"]);
    // Characters that take no space read as nothing.
    expect(codes("​⁠﻿")).toEqual(["body:required"]);
    expect(codes("x".repeat(LIMITS.reportBodyMin - 1))).toEqual(["body:too_short"]);
    expect(codes("x".repeat(LIMITS.reportBodyMin))).toEqual([]);
    expect(codes("x".repeat(LIMITS.reportBody))).toEqual([]);
    expect(codes("x".repeat(LIMITS.reportBody + 1))).toEqual(["body:too_long"]);
    // Padding is trimmed before the length is judged.
    expect(codes(`  ${"x".repeat(LIMITS.reportBodyMin - 1)}  `)).toEqual(["body:too_short"]);
  });

  it("keeps line breaks, normalizes them and strips unsafe characters", () => {
    const result = readReportInput({ body: "First line.\r\nSecond line.\u0007‮" });
    expect(result).toEqual({ ok: true, value: { topic: null, body: "First line.\nSecond line." } });
  });

  it("reports both problems at once", () => {
    const result = readReportInput({ body: "short", topic: "unknown" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => `${issue.path}:${issue.code}`).sort()).toEqual(["body:too_short", "topic:invalid"]);
    }
  });

  it("treats anything that is not an object as empty", () => {
    for (const body of [null, undefined, "text", 1, [ENOUGH]]) {
      expect(readReportInput(body).ok).toBe(false);
    }
  });

  it("never passes along a field it was not asked for", () => {
    const result = readReportInput({ body: ENOUGH, uid: "someone", email: "a@uci.edu", receivedOn: "2000-01-01" });
    expect(result).toEqual({ ok: true, value: { topic: null, body: ENOUGH } });
  });
});

describe("REPORT_TOPIC_LABEL", () => {
  it("names each topic, the program by its own name", () => {
    expect(Object.keys(REPORT_TOPIC_LABEL).sort()).toEqual([...REPORT_TOPICS].sort());
    expect(REPORT_TOPIC_LABEL.program).toBe(PROGRAM_NAME);
  });
});

describe("reportWaitMinutes", () => {
  it("is zero with no hold, or a hold that is over", () => {
    expect(reportWaitMinutes(null, NOW)).toBe(0);
    expect(reportWaitMinutes(NOW, NOW)).toBe(0);
    expect(reportWaitMinutes(NOW - 1, NOW)).toBe(0);
    expect(reportWaitMinutes(Number.NaN, NOW)).toBe(0);
  });

  it("rounds up to whole minutes", () => {
    expect(reportWaitMinutes(NOW + TIMING.reportIntervalMs, NOW)).toBe(60);
    expect(reportWaitMinutes(NOW + 59 * MINUTE + 1, NOW)).toBe(60);
    expect(reportWaitMinutes(NOW + MINUTE, NOW)).toBe(1);
    expect(reportWaitMinutes(NOW + 1, NOW)).toBe(1);
  });

  it("ignores a hold further ahead than the portal ever writes one", () => {
    expect(reportWaitMinutes(NOW + TIMING.reportIntervalMs + 5 * MINUTE, NOW)).toBe(65);
    expect(reportWaitMinutes(NOW + TIMING.reportIntervalMs + 5 * MINUTE + 1, NOW)).toBe(0);
    expect(reportWaitMinutes(NOW + 365 * 24 * 60 * MINUTE, NOW)).toBe(0);
  });
});

describe("the wait as people read it", () => {
  it("says minutes in plain words", () => {
    expect(minutesLabel(1)).toBe("1 minute");
    expect(minutesLabel(42)).toBe("42 minutes");
    expect(reportLimitMessage(42)).toBe("You can send one report an hour. You can send another in 42 minutes.");
    // Never "0 minutes".
    expect(reportLimitMessage(0)).toBe("You can send one report an hour. You can send another in 1 minute.");
  });
});

describe("the day a report is filed under", () => {
  it("is the date where the chapter is, not in UTC", () => {
    // 03:30 UTC on the 14th is still the evening of the 13th in Irvine.
    expect(reportDay(Date.UTC(2026, 9, 14, 3, 30))).toBe("2026-10-13");
    expect(reportDay(Date.UTC(2026, 9, 14, 7, 0))).toBe("2026-10-14");
  });

  it("is shown to admins only once that day is over", () => {
    expect(isReleased("2026-10-12", "2026-10-13")).toBe(true);
    expect(isReleased("2026-10-13", "2026-10-13")).toBe(false);
    expect(isReleased("2025-12-31", "2026-01-01")).toBe(true);
    // A day from the future, which only a clock gone wrong could write, is held too.
    expect(isReleased("2026-10-14", "2026-10-13")).toBe(false);
  });

  it("reads the same in every time zone", () => {
    expect(formatReportDay("2026-10-12")).toBe("Mon, Oct 12");
    expect(formatReportDay("2026-10-12", true)).toBe("Mon, Oct 12, 2026");
    expect(formatReportDay("2026-01-01")).toBe("Thu, Jan 1");
  });

  it("shows anything that is not a stored day as it is", () => {
    expect(formatReportDay("yesterday")).toBe("yesterday");
    expect(formatReportDay("2026-1-1")).toBe("2026-1-1");
  });
});
