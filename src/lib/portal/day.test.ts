import { describe, expect, it } from "vitest";
import { PORTAL_TIME_ZONE } from "./constants";
import { civilDate } from "./day";

const LA = "America/Los_Angeles";
const DAY_MS = 24 * 60 * 60_000;
/** The last millisecond of an hour, as Date.UTC takes it. */
const END = [59, 59, 999] as const;

describe("civilDate", () => {
  it("is asked for the chapter's zone by the rest of the portal", () => {
    expect(PORTAL_TIME_ZONE).toBe(LA);
  });

  describe("in Los Angeles", () => {
    it("is still the day before at midnight UTC", () => {
      expect(civilDate(Date.UTC(2026, 9, 2, 0, 0, 0), LA)).toBe("2026-10-01");
      expect(civilDate(Date.UTC(2026, 9, 2, 3, 30, 0), LA)).toBe("2026-10-01");
      expect(civilDate(Date.UTC(2026, 0, 1, 0, 0, 0), LA)).toBe("2025-12-31");
    });

    it("turns over at 07:00 UTC while daylight time is in force", () => {
      expect(civilDate(Date.UTC(2026, 9, 2, 6, ...END), LA)).toBe("2026-10-01");
      expect(civilDate(Date.UTC(2026, 9, 2, 7, 0, 0), LA)).toBe("2026-10-02");
    });

    it("turns over at 08:00 UTC in winter", () => {
      expect(civilDate(Date.UTC(2026, 0, 15, 7, ...END), LA)).toBe("2026-01-14");
      expect(civilDate(Date.UTC(2026, 0, 15, 8, 0, 0), LA)).toBe("2026-01-15");
    });

    it("has a 23 hour day when the clocks go forward on 8 March 2026", () => {
      expect(civilDate(Date.UTC(2026, 2, 8, 7, ...END), LA)).toBe("2026-03-07");
      expect(civilDate(Date.UTC(2026, 2, 8, 8, 0, 0), LA)).toBe("2026-03-08");
      // Two in the morning becomes three. Either side of the skipped hour is the same day.
      expect(civilDate(Date.UTC(2026, 2, 8, 9, ...END), LA)).toBe("2026-03-08");
      expect(civilDate(Date.UTC(2026, 2, 8, 10, 0, 0), LA)).toBe("2026-03-08");
      // The day ends an hour sooner, by UTC, than it began.
      expect(civilDate(Date.UTC(2026, 2, 9, 6, ...END), LA)).toBe("2026-03-08");
      expect(civilDate(Date.UTC(2026, 2, 9, 7, 0, 0), LA)).toBe("2026-03-09");
    });

    it("has a 25 hour day when the clocks go back on 1 November 2026", () => {
      expect(civilDate(Date.UTC(2026, 10, 1, 6, ...END), LA)).toBe("2026-10-31");
      expect(civilDate(Date.UTC(2026, 10, 1, 7, 0, 0), LA)).toBe("2026-11-01");
      // Half past one comes round twice, once in each kind of time.
      expect(civilDate(Date.UTC(2026, 10, 1, 8, 30, 0), LA)).toBe("2026-11-01");
      expect(civilDate(Date.UTC(2026, 10, 1, 9, 30, 0), LA)).toBe("2026-11-01");
      // 07:00 UTC, which was midnight the day before, is now eleven at night.
      expect(civilDate(Date.UTC(2026, 10, 2, 7, 0, 0), LA)).toBe("2026-11-01");
      expect(civilDate(Date.UTC(2026, 10, 2, 7, ...END), LA)).toBe("2026-11-01");
      expect(civilDate(Date.UTC(2026, 10, 2, 8, 0, 0), LA)).toBe("2026-11-02");
    });
  });

  describe("in a zone east of UTC", () => {
    it("is already the next day in Tokyo from 15:00 UTC", () => {
      expect(civilDate(Date.UTC(2026, 9, 1, 14, ...END), "Asia/Tokyo")).toBe("2026-10-01");
      expect(civilDate(Date.UTC(2026, 9, 1, 15, 0, 0), "Asia/Tokyo")).toBe("2026-10-02");
      expect(civilDate(Date.UTC(2026, 9, 1, 23, 0, 0), "Asia/Tokyo")).toBe("2026-10-02");
    });

    it("has reached the new year in Auckland while Los Angeles is still in the old one", () => {
      const noonUtc = Date.UTC(2026, 11, 31, 12, 0, 0);
      expect(civilDate(noonUtc, "Pacific/Auckland")).toBe("2027-01-01");
      expect(civilDate(noonUtc, "UTC")).toBe("2026-12-31");
      expect(civilDate(noonUtc, LA)).toBe("2026-12-31");
    });
  });

  it("is the UTC date in UTC", () => {
    expect(civilDate(Date.UTC(2026, 9, 1, 23, ...END), "UTC")).toBe("2026-10-01");
    expect(civilDate(Date.UTC(2026, 9, 2, 0, 0, 0), "UTC")).toBe("2026-10-02");
  });

  it("pads the month and the day to two digits", () => {
    expect(civilDate(Date.UTC(2026, 0, 5, 12, 0, 0), "UTC")).toBe("2026-01-05");
    expect(civilDate(Date.UTC(2026, 0, 1, 12, 0, 0), LA)).toBe("2026-01-01");
    expect(civilDate(Date.UTC(2026, 8, 9, 12, 0, 0), LA)).toBe("2026-09-09");
    expect(civilDate(Date.UTC(2026, 11, 25, 12, 0, 0), LA)).toBe("2026-12-25");
  });

  it("is always YYYY-MM-DD, every day of the year, in every zone", () => {
    const FORMAT = /^\d{4}-\d{2}-\d{2}$/;
    const start = Date.UTC(2026, 0, 1, 12, 0, 0);
    for (const zone of [LA, "UTC", "Asia/Tokyo", "Pacific/Auckland", "Europe/London"]) {
      for (let day = 0; day < 400; day += 1) {
        expect(civilDate(start + day * DAY_MS, zone), `${zone}, day ${day}`).toMatch(FORMAT);
      }
    }
  });

  it("sorts as text in the order of the days, with no day repeated or skipped", () => {
    const start = Date.UTC(2026, 0, 1, 12, 0, 0);
    const days = Array.from({ length: 400 }, (_, index) => civilDate(start + index * DAY_MS, LA));
    expect([...days].sort()).toEqual(days);
    expect(new Set(days).size).toBe(400);
    expect(days[0]).toBe("2026-01-01");
    expect(days[365]).toBe("2027-01-01");
  });
});
