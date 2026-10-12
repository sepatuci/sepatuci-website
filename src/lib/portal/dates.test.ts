import { describe, expect, it } from "vitest";
import {
  formatAnswerText,
  formatDuration,
  formatRelative,
  isCivilDate,
  isCivilTime,
  isoToLocalInput,
  localInputToIso,
  msOrNull,
  parseIso,
  toIso,
} from "./dates";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("parseIso", () => {
  it.each<[string, number]>([
    ["2026-10-09T06:59:59Z", Date.UTC(2026, 9, 9, 6, 59, 59)],
    ["2026-10-09T06:59:59.5Z", Date.UTC(2026, 9, 9, 6, 59, 59, 500)],
    ["2026-10-09T06:59:59.25Z", Date.UTC(2026, 9, 9, 6, 59, 59, 250)],
    ["2026-10-09T06:59:59.999Z", Date.UTC(2026, 9, 9, 6, 59, 59, 999)],
    ["2026-01-01T00:00:00.000Z", Date.UTC(2026, 0, 1)],
    ["2026-12-31T23:59:59.999Z", Date.UTC(2026, 11, 31, 23, 59, 59, 999)],
    ["2024-02-29T12:00:00Z", Date.UTC(2024, 1, 29, 12)],
    ["1970-01-01T00:00:00Z", 0],
  ])("reads %s as epoch milliseconds", (value, ms) => {
    expect(parseIso(value)).toBe(ms);
  });

  it("round-trips what toIso writes", () => {
    const ms = Date.UTC(2026, 9, 9, 6, 59, 59, 123);
    expect(toIso(ms)).toBe("2026-10-09T06:59:59.123Z");
    expect(parseIso(toIso(ms))).toBe(ms);
  });

  it.each<[string, string]>([
    ["February 30th", "2026-02-30T00:00:00Z"],
    ["February 29th in a year that is not a leap year", "2026-02-29T00:00:00Z"],
    ["April 31st", "2026-04-31T00:00:00Z"],
    ["month 13", "2026-13-01T00:00:00Z"],
    ["month 00", "2026-00-10T00:00:00Z"],
    ["day 00", "2026-10-00T00:00:00Z"],
    ["day 32", "2026-10-32T00:00:00Z"],
    ["hour 24", "2026-10-09T24:00:00Z"],
    ["hour 25", "2026-10-09T25:00:00Z"],
    ["minute 60", "2026-10-09T10:60:00Z"],
    ["second 60", "2026-10-09T10:00:60Z"],
  ])("rejects the impossible instant %s", (_label, value) => {
    expect(parseIso(value)).toBeNull();
  });

  it.each<[string, string]>([
    ["a date with no time", "2026-10-09"],
    ["a local time with no zone", "2026-10-09T10:00:00"],
    ["a zero offset written as +00:00", "2026-10-09T10:00:00+00:00"],
    ["a non-zero offset", "2026-10-09T10:00:00-07:00"],
    ["a lower-case z", "2026-10-09T10:00:00z"],
    ["a lower-case t", "2026-10-09t10:00:00Z"],
    ["a space instead of T", "2026-10-09 10:00:00Z"],
    ["no seconds", "2026-10-09T10:00Z"],
    ["more than three fraction digits", "2026-10-09T10:00:00.1234Z"],
    ["a fraction with no digits", "2026-10-09T10:00:00.Z"],
    ["a two-digit year", "26-10-09T10:00:00Z"],
    ["a five-digit year", "12026-10-09T10:00:00Z"],
    ["a signed year", "+002026-10-09T10:00:00Z"],
    ["unpadded parts", "2026-1-9T1:0:0Z"],
    ["leading whitespace", " 2026-10-09T10:00:00Z"],
    ["trailing whitespace", "2026-10-09T10:00:00Z "],
    ["a trailing newline", "2026-10-09T10:00:00Z\n"],
    ["trailing text", "2026-10-09T10:00:00Zjunk"],
    ["an RFC 2822 date", "Fri, 09 Oct 2026 10:00:00 GMT"],
    ["epoch digits", "1791540000000"],
    ["free text", "tomorrow"],
    ["an empty string", ""],
  ])("rejects %s", (_label, value) => {
    expect(parseIso(value)).toBeNull();
  });

  it.each<[string, unknown]>([
    ["a number", 1_791_540_000_000],
    ["null", null],
    ["undefined", undefined],
    ["a Date", new Date(0)],
    ["an object", { toString: () => "2026-10-09T10:00:00Z" }],
    ["an array", ["2026-10-09T10:00:00Z"]],
    ["a boolean", true],
  ])("rejects %s", (_label, value) => {
    expect(parseIso(value)).toBeNull();
  });
});

describe("msOrNull", () => {
  it("is null for no timestamp", () => {
    expect(msOrNull(null)).toBeNull();
  });

  it("reads a valid timestamp", () => {
    expect(msOrNull("2026-10-09T06:59:59.000Z")).toBe(Date.UTC(2026, 9, 9, 6, 59, 59));
  });

  it("is null for a timestamp that does not parse", () => {
    expect(msOrNull("2026-02-30T00:00:00Z")).toBeNull();
  });
});

describe("isCivilDate", () => {
  it.each(["2026-10-09", "2026-01-01", "2026-12-31", "2024-02-29", "2000-02-29", "1999-12-31"])(
    "accepts %s",
    (value) => {
      expect(isCivilDate(value)).toBe(true);
    },
  );

  // Date.UTC reads a year under 100 as 19xx, which would make 0099 a leap year and 0000 not one.
  it.each(["0000-01-01", "0000-02-29", "0001-01-01", "0099-12-31", "0004-02-29", "0100-01-01"])(
    "accepts %s, in a year under 100 as written",
    (value) => {
      expect(isCivilDate(value)).toBe(true);
    },
  );

  it.each(["0099-02-29", "0001-02-29", "0100-02-29", "0099-13-01", "0000-02-30"])(
    "rejects %s, which does not exist in that year",
    (value) => {
      expect(isCivilDate(value)).toBe(false);
    },
  );

  it.each([
    "2026-02-30",
    "2026-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-10",
    "2026-10-00",
    "2026-10-32",
    "2026-1-9",
    "26-10-09",
    "10/09/2026",
    "2026-10-09T00:00:00Z",
    "2026-10-09 ",
    " 2026-10-09",
    "2026-10-09\n",
    "20261009",
    "",
  ])("rejects %s", (value) => {
    expect(isCivilDate(value)).toBe(false);
  });
});

describe("isCivilTime", () => {
  it.each(["00:00", "00:59", "09:30", "12:00", "19:05", "23:59"])("accepts %s", (value) => {
    expect(isCivilTime(value)).toBe(true);
  });

  it.each(["24:00", "25:10", "12:60", "9:30", "09:5", "09:30:00", "0930", "09.30", "09:30 ", " 09:30", "09:30\n", "9:30 AM", "noon", ""])(
    "rejects %s",
    (value) => {
      expect(isCivilTime(value)).toBe(false);
    },
  );
});

describe("formatRelative", () => {
  const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

  it.each<[string, number, string]>([
    ["the same instant", 0, "in under a minute"],
    ["59.999 seconds ahead", 59_999, "in under a minute"],
    ["exactly one minute ahead", MINUTE, "in 1 minute"],
    ["90 seconds ahead", 90 * SECOND, "in 1 minute"],
    ["two minutes ahead", 2 * MINUTE, "in 2 minutes"],
    ["just under an hour ahead", HOUR - 1, "in 59 minutes"],
    ["exactly an hour ahead", HOUR, "in 1 hour"],
    ["just under two hours ahead", 2 * HOUR - 1, "in 1 hour"],
    ["two hours ahead", 2 * HOUR, "in 2 hours"],
    ["just under a day ahead", DAY - 1, "in 23 hours"],
    ["exactly a day ahead", DAY, "in 1 day"],
    ["three days ahead", 3 * DAY, "in 3 days"],
    ["just under 30 days ahead", 30 * DAY - 1, "in 29 days"],
    ["exactly 30 days ahead", 30 * DAY, "in 1 month"],
    ["59 days ahead", 59 * DAY, "in 1 month"],
    ["60 days ahead", 60 * DAY, "in 2 months"],
    ["364 days ahead", 364 * DAY, "in 12 months"],
    ["exactly 365 days ahead", 365 * DAY, "in 1 year"],
    ["729 days ahead", 729 * DAY, "in 1 year"],
    ["730 days ahead", 730 * DAY, "in 2 years"],
  ])("describes %s as %s", (_label, offset, expected) => {
    expect(formatRelative(NOW + offset, NOW)).toBe(expected);
  });

  it.each<[string, number, string]>([
    ["one millisecond ago", 1, "just now"],
    ["59.999 seconds ago", 59_999, "just now"],
    ["exactly one minute ago", MINUTE, "1 minute ago"],
    ["five minutes ago", 5 * MINUTE, "5 minutes ago"],
    ["exactly an hour ago", HOUR, "1 hour ago"],
    ["two hours ago", 2 * HOUR, "2 hours ago"],
    ["a day ago", DAY, "1 day ago"],
    ["a week ago", 7 * DAY, "7 days ago"],
    ["45 days ago", 45 * DAY, "1 month ago"],
    ["400 days ago", 400 * DAY, "1 year ago"],
  ])("describes %s as %s", (_label, offset, expected) => {
    expect(formatRelative(NOW - offset, NOW)).toBe(expected);
  });
});

describe("formatDuration", () => {
  it.each<[number, string]>([
    [0, "0s"],
    [1, "1s"],
    [45, "45s"],
    [59, "59s"],
    [59.4, "59s"],
    [59.5, "1m"],
    [60, "1m"],
    [119, "1m"],
    [120, "2m"],
    [720, "12m"],
    [3599, "59m"],
    [3600, "1h 00m"],
    [3660, "1h 01m"],
    [7500, "2h 05m"],
    [35_999, "9h 59m"],
    [86_399, "23h 59m"],
    [86_400, "1d 00h"],
    [74 * 60 * 60, "3d 02h"],
    [360_000, "4d 04h"],
  ])("formats %d seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it("never shows a negative duration", () => {
    expect(formatDuration(-5)).toBe("0s");
    expect(formatDuration(-3600)).toBe("0s");
  });
});

// These run in whatever time zone the machine is in, so they assert relationships
// that hold in every zone rather than fixed wall-clock strings. The instants are
// well away from any daylight-saving change.
describe("isoToLocalInput and localInputToIso", () => {
  const instants = [
    "2026-01-15T18:30:00.000Z",
    "2026-07-15T03:05:00.000Z",
    "2026-10-09T06:59:00.000Z",
    "2026-12-31T23:59:00.000Z",
  ];

  it.each(instants)("writes %s in the shape a datetime-local input expects", (iso) => {
    expect(isoToLocalInput(iso)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it.each(instants)("writes %s as the viewer's own wall-clock time", (iso) => {
    const local = new Date(iso);
    const pad = (part: number) => String(part).padStart(2, "0");
    expect(isoToLocalInput(iso)).toBe(
      `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`,
    );
  });

  it.each(instants)("round-trips %s through the input and back", (iso) => {
    expect(localInputToIso(isoToLocalInput(iso))).toBe(iso);
  });

  it("drops seconds and milliseconds, which the input cannot show", () => {
    expect(localInputToIso(isoToLocalInput("2026-10-09T06:59:45.123Z"))).toBe("2026-10-09T06:59:00.000Z");
  });

  it("is empty for no timestamp or one that does not parse", () => {
    expect(isoToLocalInput(null)).toBe("");
    expect(isoToLocalInput("yesterday")).toBe("");
    expect(isoToLocalInput("2026-02-30T00:00:00Z")).toBe("");
  });

  it("reads an input value as local time", () => {
    expect(localInputToIso("2026-10-09T10:15")).toBe(new Date(2026, 9, 9, 10, 15).toISOString());
  });

  it("accepts a value with seconds", () => {
    expect(localInputToIso("2026-10-09T10:15:30")).toBe(new Date(2026, 9, 9, 10, 15, 30).toISOString());
  });

  it("produces a timestamp the server's strict parser accepts", () => {
    const iso = localInputToIso("2026-10-09T10:15");
    expect(iso).not.toBeNull();
    expect(parseIso(iso)).toBe(new Date(2026, 9, 9, 10, 15).getTime());
  });

  it.each<[string, string]>([
    ["an empty input", ""],
    ["a date with no time", "2026-10-09"],
    ["a space instead of T", "2026-10-09 10:15"],
    ["a UTC suffix", "2026-10-09T10:15Z"],
    ["an offset", "2026-10-09T10:15+01:00"],
    ["milliseconds", "2026-10-09T10:15:30.500"],
    ["month 13", "2026-13-09T10:15"],
    ["hour 25", "2026-10-09T25:15"],
    ["free text", "next Friday at 5"],
  ])("is null for %s", (_label, value) => {
    expect(localInputToIso(value)).toBeNull();
  });
});

// The clock's own narrow or non-breaking space before AM/PM, written as a plain one.
const plainSpaces = (text: string): string => text.replace(/\s/g, " ");

describe("formatAnswerText", () => {
  describe("a date answer", () => {
    it.each<[string, string]>([
      ["2026-10-03", "Oct 3, 2026"],
      ["2026-01-01", "Jan 1, 2026"],
      ["2026-12-31", "Dec 31, 2026"],
      ["2024-02-29", "Feb 29, 2024"],
      ["2026-07-15", "Jul 15, 2026"],
      ["1999-11-09", "Nov 9, 1999"],
    ])("writes %s as %s", (value, expected) => {
      expect(formatAnswerText("date", value)).toBe(expected);
    });

    it.each<[string, string]>([
      ["a day that does not exist", "2026-02-30"],
      ["February 29th outside a leap year", "2026-02-29"],
      ["month 13", "2026-13-01"],
      ["a US-style date", "10/03/2026"],
      ["a date with a time", "2026-10-03T12:30"],
      ["a full timestamp", "2026-10-03T00:00:00.000Z"],
      ["a date without leading zeros", "2026-1-3"],
      ["padding", " 2026-10-03"],
      ["free text", "next Friday"],
      ["a time", "12:30"],
      ["nothing", ""],
    ])("leaves %s exactly as it was written", (_label, value) => {
      expect(formatAnswerText("date", value)).toBe(value);
    });
  });

  describe("a time answer", () => {
    it.each<[string, string]>([
      ["12:30", "12:30 PM"],
      ["00:00", "12:00 AM"],
      ["00:05", "12:05 AM"],
      ["09:00", "9:00 AM"],
      ["11:59", "11:59 AM"],
      ["12:00", "12:00 PM"],
      ["13:07", "1:07 PM"],
      ["23:59", "11:59 PM"],
    ])("writes %s as %s", (value, expected) => {
      expect(plainSpaces(formatAnswerText("time", value))).toBe(expected);
    });

    it.each<[string, string]>([
      ["hour 24", "24:00"],
      ["minute 60", "12:60"],
      ["a time without leading zeros", "9:5"],
      ["a time with seconds", "12:30:00"],
      ["a 12-hour time", "12:30 PM"],
      ["a date", "2026-10-03"],
      ["free text", "after lunch"],
      ["nothing", ""],
    ])("leaves %s exactly as it was written", (_label, value) => {
      expect(formatAnswerText("time", value)).toBe(value);
    });
  });

  describe("any other answer", () => {
    it.each(["short_text", "paragraph", "multiple_choice", "checkboxes", "dropdown", "linear_scale", "section", "", "DATE", "Time"])(
      "is returned untouched for a %j question, even when it looks like a date or a time",
      (questionType) => {
        for (const value of ["2026-10-03", "12:30", "Computer Science", "", "  spaced  ", "line one\nline two"]) {
          expect(formatAnswerText(questionType, value)).toBe(value);
        }
      },
    );
  });

  // These answers have no time zone: "2026-10-03" is the 3rd wherever it is read.
  describe("wherever the viewer is", () => {
    const original = process.env.TZ;
    const inZone = <T,>(zone: string, read: () => T): T => {
      process.env.TZ = zone;
      try {
        return read();
      } finally {
        if (original === undefined) delete process.env.TZ;
        else process.env.TZ = original;
      }
    };
    // From UTC-11 to UTC+14, the two ends of the day.
    const ZONES = ["Pacific/Pago_Pago", "America/Los_Angeles", "UTC", "Asia/Kolkata", "Pacific/Kiritimati"];

    it("really is run in different zones: the same instant falls on different days in them", () => {
      const instant = Date.UTC(2026, 9, 3, 11, 30);
      const days = ZONES.map((zone) => inZone(zone, () => new Date(instant).getDate()));
      expect(new Set(days).size).toBeGreaterThan(1);
    });

    it.each(ZONES)("writes a date and a time the same way in %s", (zone) => {
      expect(inZone(zone, () => formatAnswerText("date", "2026-10-03"))).toBe("Oct 3, 2026");
      expect(inZone(zone, () => formatAnswerText("date", "2026-01-01"))).toBe("Jan 1, 2026");
      expect(inZone(zone, () => formatAnswerText("date", "2026-12-31"))).toBe("Dec 31, 2026");
      expect(inZone(zone, () => plainSpaces(formatAnswerText("time", "00:05")))).toBe("12:05 AM");
      expect(inZone(zone, () => plainSpaces(formatAnswerText("time", "23:59")))).toBe("11:59 PM");
    });

    it("does not move a time across a daylight-saving change", () => {
      // 02:30 does not exist on the morning the clocks go forward in Los Angeles.
      expect(inZone("America/Los_Angeles", () => plainSpaces(formatAnswerText("time", "02:30")))).toBe("2:30 AM");
    });
  });
});
