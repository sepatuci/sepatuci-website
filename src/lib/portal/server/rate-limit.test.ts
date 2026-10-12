import { beforeEach, describe, expect, it } from "vitest";
import { RATE_LIMITS, allowRequest, resetRateLimits, shouldLogRefusal } from "./rate-limit";

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const CEILING = RATE_LIMITS.perMinute;
const WRITE_CEILING = RATE_LIMITS.writesPerMinute;

/** Makes `count` requests at `nowMs` and returns how many were allowed. */
function burst(key: string, count: number, nowMs: number, write = false): number {
  let allowed = 0;
  for (let index = 0; index < count; index += 1) {
    if (allowRequest(key, nowMs, write)) allowed += 1;
  }
  return allowed;
}

/**
 * Makes `perMinute` requests at the start of each of `minutes` consecutive
 * minutes from `fromMs`, and returns how many were allowed.
 */
function fullMinutes(key: string, minutes: number, fromMs: number, perMinute: number, write = false): number {
  let allowed = 0;
  for (let minute = 0; minute < minutes; minute += 1) {
    allowed += burst(key, perMinute, fromMs + minute * MINUTE_MS, write);
  }
  return allowed;
}

describe("RATE_LIMITS", () => {
  it("is the documented set of ceilings", () => {
    expect(RATE_LIMITS).toEqual({ perMinute: 120, perHour: 1200, writesPerMinute: 30, writesPerHour: 720 });
  });

  it("makes each hourly ceiling a whole number of minutes at the minute ceiling, and lower than a full hour of them", () => {
    expect(RATE_LIMITS.perHour / RATE_LIMITS.perMinute).toBe(10);
    expect(RATE_LIMITS.writesPerHour / RATE_LIMITS.writesPerMinute).toBe(24);
    expect(RATE_LIMITS.writesPerMinute).toBeLessThan(RATE_LIMITS.perMinute);
    expect(RATE_LIMITS.writesPerHour).toBeLessThan(RATE_LIMITS.perHour);
  });
});

describe("allowRequest", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  describe("requests per minute", () => {
    it("allows exactly 120 requests in a window and refuses the 121st", () => {
      expect(burst("uid1", CEILING, T0)).toBe(120);
      expect(allowRequest("uid1", T0)).toBe(false);
    });

    it("keeps refusing for the rest of the window", () => {
      burst("uid1", CEILING, T0);
      expect(burst("uid1", 500, T0 + 1_000)).toBe(0);
      expect(allowRequest("uid1", T0 + MINUTE_MS - 1)).toBe(false);
    });

    it("starts a fresh window exactly 60 seconds after the first request", () => {
      burst("uid1", CEILING + 50, T0);
      expect(allowRequest("uid1", T0 + MINUTE_MS - 1)).toBe(false);
      expect(allowRequest("uid1", T0 + MINUTE_MS)).toBe(true);
      expect(burst("uid1", CEILING - 1, T0 + MINUTE_MS)).toBe(CEILING - 1);
      expect(allowRequest("uid1", T0 + MINUTE_MS)).toBe(false);
    });

    it("measures the window from its first request, not from the most recent one", () => {
      allowRequest("uid1", T0);
      burst("uid1", CEILING - 1, T0 + MINUTE_MS - 1);
      expect(allowRequest("uid1", T0 + MINUTE_MS - 1)).toBe(false);
      expect(allowRequest("uid1", T0 + MINUTE_MS)).toBe(true);
    });

    it("counts requests spread across the window, not just bursts", () => {
      let allowed = 0;
      for (let index = 0; index < 300; index += 1) {
        if (allowRequest("uid1", T0 + index * 100)) allowed += 1;
      }
      expect(allowed).toBe(CEILING);
    });

    it("does not earn a request back by hammering: nothing more is allowed until the window rolls over", () => {
      burst("uid1", CEILING, T0);
      expect(burst("uid1", 500, T0 + 30_000)).toBe(0);
      expect(allowRequest("uid1", T0 + MINUTE_MS - 1)).toBe(false);
      // The next window has its full allowance: the refused attempts are not carried into it.
      expect(burst("uid1", CEILING, T0 + MINUTE_MS)).toBe(CEILING);
      expect(allowRequest("uid1", T0 + MINUTE_MS)).toBe(false);
    });

    it("never refuses an account that stays at the minute ceiling for the 10 minutes the hourly ceiling allows", () => {
      for (let window = 0; window < 10; window += 1) {
        expect(burst("uid1", CEILING, T0 + window * MINUTE_MS)).toBe(CEILING);
      }
    });
  });

  describe("requests per hour", () => {
    it("allows exactly 1200 requests in an hour and refuses the 1201st, even in a fresh minute", () => {
      expect(fullMinutes("uid1", 10, T0, CEILING)).toBe(1_200);
      // A new minute with nothing spent in it: only the hourly ceiling can refuse this.
      expect(allowRequest("uid1", T0 + 10 * MINUTE_MS)).toBe(false);
    });

    it("allows the 1200th request of the hour and refuses the one after it", () => {
      expect(fullMinutes("uid1", 9, T0, CEILING)).toBe(9 * CEILING);
      expect(burst("uid1", CEILING - 1, T0 + 9 * MINUTE_MS)).toBe(CEILING - 1);
      expect(allowRequest("uid1", T0 + 10 * MINUTE_MS)).toBe(true);
      expect(allowRequest("uid1", T0 + 10 * MINUTE_MS)).toBe(false);
    });

    it("keeps refusing until exactly one hour after the first request of the hour", () => {
      fullMinutes("uid1", 20, T0, CEILING);
      expect(allowRequest("uid1", T0 + 45 * MINUTE_MS)).toBe(false);
      expect(allowRequest("uid1", T0 + HOUR_MS - 1)).toBe(false);
      expect(allowRequest("uid1", T0 + HOUR_MS)).toBe(true);
    });

    it("measures the hour from its first request, not from the most recent one", () => {
      burst("uid1", 2, T0);
      // 1198 more, the last of them one millisecond before the hour is up.
      expect(fullMinutes("uid1", 9, T0 + 30 * MINUTE_MS, CEILING)).toBe(9 * CEILING);
      expect(burst("uid1", CEILING - 2, T0 + HOUR_MS - 1)).toBe(CEILING - 2);
      // The 1201st of the hour, with room to spare in its minute.
      expect(allowRequest("uid1", T0 + HOUR_MS - 1)).toBe(false);
      expect(allowRequest("uid1", T0 + HOUR_MS)).toBe(true);
    });

    it("counts requests the minute ceiling refused: a client that hammers past the hourly ceiling is held for the hour", () => {
      // 120 allowed, 1081 refused, all in one minute. The hour has now seen 1201 requests.
      expect(burst("uid1", RATE_LIMITS.perHour + 1, T0)).toBe(CEILING);
      expect(allowRequest("uid1", T0 + MINUTE_MS)).toBe(false);
      expect(allowRequest("uid1", T0 + 59 * MINUTE_MS)).toBe(false);
      expect(burst("uid1", CEILING, T0 + HOUR_MS)).toBe(CEILING);
    });

    it("counts requests the minute ceiling refused, to the request: 1200 attempts leave nothing, 1199 leave one", () => {
      expect(burst("uid1", RATE_LIMITS.perHour - 1, T0)).toBe(CEILING);
      expect(allowRequest("uid1", T0 + MINUTE_MS)).toBe(true);
      expect(allowRequest("uid1", T0 + MINUTE_MS)).toBe(false);
    });
  });

  describe("writes", () => {
    it("allows exactly 30 writes in a minute and refuses the 31st", () => {
      expect(burst("uid1", WRITE_CEILING, T0, true)).toBe(30);
      expect(allowRequest("uid1", T0, true)).toBe(false);
    });

    it("keeps refusing writes for the rest of the window, however many are attempted", () => {
      burst("uid1", WRITE_CEILING, T0, true);
      expect(burst("uid1", 50, T0 + 1_000, true)).toBe(0);
      expect(allowRequest("uid1", T0 + MINUTE_MS - 1, true)).toBe(false);
    });

    it("starts a fresh write window exactly 60 seconds after the first request", () => {
      burst("uid1", WRITE_CEILING + 5, T0, true);
      expect(allowRequest("uid1", T0 + MINUTE_MS - 1, true)).toBe(false);
      expect(allowRequest("uid1", T0 + MINUTE_MS, true)).toBe(true);
      expect(burst("uid1", WRITE_CEILING - 1, T0 + MINUTE_MS, true)).toBe(WRITE_CEILING - 1);
      expect(allowRequest("uid1", T0 + MINUTE_MS, true)).toBe(false);
    });

    it("counts a write as a request as well: 30 writes leave 90 reads in the minute", () => {
      expect(burst("uid1", WRITE_CEILING, T0, true)).toBe(WRITE_CEILING);
      expect(burst("uid1", CEILING - WRITE_CEILING, T0)).toBe(CEILING - WRITE_CEILING);
      expect(allowRequest("uid1", T0)).toBe(false);
    });

    it("does not count reads against the write ceiling", () => {
      expect(burst("uid1", CEILING - WRITE_CEILING, T0)).toBe(CEILING - WRITE_CEILING);
      expect(burst("uid1", WRITE_CEILING, T0, true)).toBe(WRITE_CEILING);
    });

    it("refuses a write once the request ceiling is reached, even with no writes made", () => {
      burst("uid1", CEILING, T0);
      expect(allowRequest("uid1", T0, true)).toBe(false);
    });

    it("treats a call without the write flag as a read", () => {
      expect(burst("uid1", WRITE_CEILING + 1, T0)).toBe(WRITE_CEILING + 1);
    });

    it("allows exactly 720 writes in an hour and refuses the 721st, even in a fresh minute", () => {
      expect(fullMinutes("uid1", 24, T0, WRITE_CEILING, true)).toBe(720);
      expect(allowRequest("uid1", T0 + 24 * MINUTE_MS, true)).toBe(false);
    });

    it("allows the 720th write of the hour and refuses the one after it", () => {
      expect(fullMinutes("uid1", 23, T0, WRITE_CEILING, true)).toBe(23 * WRITE_CEILING);
      expect(burst("uid1", WRITE_CEILING - 1, T0 + 23 * MINUTE_MS, true)).toBe(WRITE_CEILING - 1);
      expect(allowRequest("uid1", T0 + 24 * MINUTE_MS, true)).toBe(true);
      expect(allowRequest("uid1", T0 + 24 * MINUTE_MS, true)).toBe(false);
    });

    it("keeps refusing writes until exactly one hour after the first request of the hour", () => {
      fullMinutes("uid1", 24, T0, WRITE_CEILING, true);
      expect(allowRequest("uid1", T0 + HOUR_MS - 1, true)).toBe(false);
      expect(allowRequest("uid1", T0 + HOUR_MS, true)).toBe(true);
    });

    it("counts a write the minute ceiling refused against the hour's writes", () => {
      // 30 allowed and 10 refused in the first minute: the hour has seen 40 write attempts.
      expect(burst("uid1", WRITE_CEILING + 10, T0, true)).toBe(WRITE_CEILING);
      expect(fullMinutes("uid1", 22, T0 + MINUTE_MS, WRITE_CEILING, true)).toBe(22 * WRITE_CEILING);
      // 700 so far. Twenty more reach 720; the next is refused with only 20 spent in its minute.
      expect(burst("uid1", 20, T0 + 23 * MINUTE_MS, true)).toBe(20);
      expect(allowRequest("uid1", T0 + 23 * MINUTE_MS, true)).toBe(false);
    });

    it("counts a write the write ceiling refused against the hour's requests", () => {
      // 30 allowed and 1 refused: the hour has seen 31 requests, none of them reads.
      expect(burst("uid1", WRITE_CEILING + 1, T0, true)).toBe(WRITE_CEILING);
      expect(fullMinutes("uid1", 9, T0 + MINUTE_MS, CEILING)).toBe(9 * CEILING);
      // 1111 so far. 89 more reach 1200; the next is refused with only 89 spent in its minute.
      expect(burst("uid1", 89, T0 + 10 * MINUTE_MS)).toBe(89);
      expect(allowRequest("uid1", T0 + 10 * MINUTE_MS)).toBe(false);
    });

    // Autosave being held back must not break the pages: reading carries on.
    it("keeps allowing reads after the write ceiling is passed, in the minute and in the hour", () => {
      expect(burst("uid1", WRITE_CEILING + 10, T0, true)).toBe(WRITE_CEILING);
      expect(allowRequest("uid1", T0, true)).toBe(false);
      expect(allowRequest("uid1", T0)).toBe(true);

      resetRateLimits();
      // 24 full minutes of writes use up the hour's writes, and 720 of its 1200 requests.
      expect(fullMinutes("uid2", 24, T0, WRITE_CEILING, true)).toBe(RATE_LIMITS.writesPerHour);
      expect(allowRequest("uid2", T0 + 30 * MINUTE_MS, true)).toBe(false);
      expect(allowRequest("uid2", T0 + 30 * MINUTE_MS)).toBe(true);
    });

    it("counts write attempts as requests in the minute: after 120 of them a read is refused too", () => {
      expect(burst("uid1", CEILING, T0, true)).toBe(WRITE_CEILING);
      expect(allowRequest("uid1", T0)).toBe(false);
    });
  });

  describe("keys", () => {
    it("counts each account separately", () => {
      burst("uid1", CEILING + 10, T0);
      expect(allowRequest("uid1", T0)).toBe(false);
      expect(burst("uid2", CEILING, T0)).toBe(CEILING);
      expect(allowRequest("uid2", T0)).toBe(false);
      expect(allowRequest("uid3", T0)).toBe(true);
    });

    it("counts each account's writes separately", () => {
      burst("uid1", WRITE_CEILING + 10, T0, true);
      expect(burst("uid2", WRITE_CEILING, T0, true)).toBe(WRITE_CEILING);
      expect(allowRequest("uid2", T0, true)).toBe(false);
    });

    it("counts each account's hour separately", () => {
      fullMinutes("uid1", 20, T0, CEILING);
      expect(allowRequest("uid1", T0 + 20 * MINUTE_MS)).toBe(false);
      expect(allowRequest("uid2", T0 + 20 * MINUTE_MS)).toBe(true);
    });

    it("does not confuse keys that are prefixes of each other", () => {
      burst("uid", CEILING + 1, T0);
      expect(allowRequest("uid1", T0)).toBe(true);
    });

    it("forgets everything on reset", () => {
      burst("uid1", RATE_LIMITS.perHour + 1, T0, true);
      resetRateLimits();
      expect(allowRequest("uid1", T0)).toBe(true);
      expect(allowRequest("uid1", T0, true)).toBe(true);
    });

    it("still serves a new account when thousands of others are being tracked", () => {
      for (let index = 0; index < 5_000; index += 1) allowRequest(`busy${index}`, T0);
      expect(allowRequest("newcomer", T0 + 1)).toBe(true);
      expect(allowRequest("newcomer", T0 + 2)).toBe(true);
    });

    it("keeps enforcing the ceiling on an active account while stale ones are being cleared out", () => {
      // Counters are kept for an hour. The stale accounts were last seen an hour ago; the
      // active one has just used up its minute.
      for (let index = 0; index < 4_999; index += 1) allowRequest(`stale${index}`, T0);
      burst("active", CEILING, T0 + HOUR_MS - 10);
      // A new key at capacity triggers the clear-out of counters whose hour has passed.
      expect(allowRequest("newcomer", T0 + HOUR_MS)).toBe(true);
      expect(allowRequest("active", T0 + HOUR_MS)).toBe(false);
    });

    it("does not let a flood of other accounts wipe out the hourly count of one that is over it", () => {
      fullMinutes("heavy", 20, T0, CEILING);
      for (let index = 0; index < 5_000; index += 1) allowRequest(`other${index}`, T0 + 30 * MINUTE_MS);
      expect(allowRequest("heavy", T0 + 30 * MINUTE_MS + 1)).toBe(false);
    });
  });
});

describe("shouldLogRefusal", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("says yes once a minute for an account, however many requests are refused", () => {
    burst("uid1", CEILING + 50, T0);
    expect(shouldLogRefusal("uid1", T0)).toBe(true);
    expect(shouldLogRefusal("uid1", T0 + 1)).toBe(false);
    expect(shouldLogRefusal("uid1", T0 + MINUTE_MS - 1)).toBe(false);
    expect(shouldLogRefusal("uid1", T0 + MINUTE_MS)).toBe(true);
  });

  it("keeps each account's line separate, and has nothing to say about an account it has not seen", () => {
    burst("uid1", CEILING + 1, T0);
    burst("uid2", CEILING + 1, T0);
    expect(shouldLogRefusal("uid1", T0)).toBe(true);
    expect(shouldLogRefusal("uid2", T0)).toBe(true);
    expect(shouldLogRefusal("stranger", T0)).toBe(false);
  });
});
