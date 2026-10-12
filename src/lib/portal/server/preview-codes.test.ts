import { describe, expect, it } from "vitest";
import { TIMING } from "../constants";
import { hashPreviewCode, isPreviewCode, newPreviewCode, previewCodeExpired } from "./preview-codes";

/** The server clock for every check in this file. */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const SECOND = 1000;
const MINUTE = 60_000;
const HOUR = 3_600_000;
/** The five minutes two servers' clocks may disagree by. */
const SLACK = 5 * MINUTE;
/** When a code made right now expires. */
const FRESH = NOW + TIMING.previewCodeMs;

describe("newPreviewCode", () => {
  it("is thirty-two random bytes written in base64url: forty-three characters from that alphabet", () => {
    const code = newPreviewCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(code, "base64url")).toHaveLength(32);
    expect(isPreviewCode(code)).toBe(true);
  });

  it("never repeats", () => {
    const made = new Set(Array.from({ length: 500 }, () => newPreviewCode()));
    expect(made.size).toBe(500);
  });
});

describe("isPreviewCode", () => {
  it.each<[string, unknown]>([
    ["nothing", undefined],
    ["null", null],
    ["an empty string", ""],
    ["a number", 42],
    ["a code one character short", "a".repeat(42)],
    ["a code one character long", "a".repeat(44)],
    ["a code with a character outside the alphabet", `${"a".repeat(42)}+`],
    ["a code with padding", `${"a".repeat(42)}=`],
    ["a code with a space", `${"a".repeat(21)} ${"a".repeat(21)}`],
    ["a code in a list", ["a".repeat(43)]],
    ["a code in an object", { code: "a".repeat(43) }],
  ])("is false for %s", (_label, value) => {
    expect(isPreviewCode(value)).toBe(false);
  });

  it("is true for anything of the right shape, not only codes this module made", () => {
    expect(isPreviewCode("a".repeat(43))).toBe(true);
    expect(isPreviewCode(`${"A".repeat(20)}-_${"9".repeat(21)}`)).toBe(true);
  });
});

describe("hashPreviewCode", () => {
  it("is a SHA-256 in hex, the same for the same code and different for another", () => {
    const code = newPreviewCode();
    const hash = hashPreviewCode(code);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPreviewCode(code)).toBe(hash);
    expect(hashPreviewCode(newPreviewCode())).not.toBe(hash);
  });

  it("does not contain the code, so a stored hash gives no link away", () => {
    const code = newPreviewCode();
    expect(hashPreviewCode(code)).not.toContain(code);
    expect(hashPreviewCode(code)).not.toContain(Buffer.from(code, "base64url").toString("hex"));
  });

  it("is the hash a stored id was made with: one written before a change to this module must still be found", () => {
    expect(hashPreviewCode("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(
      "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a",
    );
  });
});

describe("previewCodeExpired", () => {
  it("lasts five minutes", () => {
    expect(TIMING.previewCodeMs).toBe(5 * MINUTE);
  });

  it("has not expired before its time, and has from that very moment", () => {
    expect(previewCodeExpired(FRESH, NOW)).toBe(false);
    expect(previewCodeExpired(FRESH, FRESH - 1)).toBe(false);
    expect(previewCodeExpired(FRESH, FRESH)).toBe(true);
    expect(previewCodeExpired(FRESH, FRESH + 1)).toBe(true);
    expect(previewCodeExpired(FRESH, FRESH + HOUR)).toBe(true);
  });

  it("counts a code that expired a second ago, a minute ago, or a day ago as gone", () => {
    for (const ago of [SECOND, MINUTE, 24 * HOUR]) expect(previewCodeExpired(NOW - ago, NOW), String(ago)).toBe(true);
  });

  // Two servers' clocks need not agree, so a fresh code may reach a server whose
  // clock is a little behind the one that wrote it.
  it("allows a code written by a clock up to five minutes ahead", () => {
    for (const ahead of [0, SECOND, MINUTE, SLACK - SECOND, SLACK]) {
      expect(previewCodeExpired(FRESH + ahead, NOW), String(ahead)).toBe(false);
    }
  });

  it("counts a code that expires further ahead than a fresh one could as expired, not as one that never will", () => {
    for (const ahead of [SLACK + SECOND, 6 * MINUTE, HOUR, 24 * HOUR, 365 * 24 * HOUR]) {
      expect(previewCodeExpired(FRESH + ahead, NOW), String(ahead)).toBe(true);
    }
  });

  it("turns at five minutes past a fresh code's expiry, to the millisecond", () => {
    const furthest = FRESH + SLACK;
    expect(previewCodeExpired(furthest, NOW)).toBe(false);
    expect(previewCodeExpired(furthest + 1, NOW)).toBe(true);
    expect(previewCodeExpired(furthest, NOW - 1)).toBe(true);
  });

  it.each<[string, unknown]>([
    ["nothing", undefined],
    ["null", null],
    ["a numeric string", String(FRESH)],
    ["a date string", new Date(FRESH).toISOString()],
    ["a Date", new Date(FRESH)],
    ["an object", { seconds: FRESH / SECOND }],
    ["a list holding the time", [FRESH]],
    ["true", true],
    ["something that is not a number", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
    ["minus infinity", Number.NEGATIVE_INFINITY],
  ])("counts as expired when the time is %s", (_label, expiresAt) => {
    expect(previewCodeExpired(expiresAt, NOW)).toBe(true);
  });

  it("reads the time in milliseconds: one in seconds is long gone", () => {
    expect(previewCodeExpired(FRESH / SECOND, NOW)).toBe(true);
    expect(previewCodeExpired(0, NOW)).toBe(true);
  });
});
