import { describe, expect, it } from "vitest";
import {
  applyHeartbeat,
  emptyActivity,
  isOnline,
  type Activity,
  type ClosedSession,
  type HeartbeatOptions,
} from "./activity";
import { TIMING } from "./constants";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);

/** An activity with one session in progress that started and was last seen at `at`. */
function started(at = T0): Activity {
  return applyHeartbeat(emptyActivity(), at).activity;
}

/** Applies ordinary beats at each offset from T0 and returns the final activity. */
function run(offsets: number[], from: Activity = emptyActivity()): Activity {
  return offsets.reduce((activity, offset) => applyHeartbeat(activity, T0 + offset).activity, from);
}

describe("emptyActivity", () => {
  it("starts with nothing recorded", () => {
    expect(emptyActivity()).toEqual({
      firstSeenAtMs: null,
      lastSeenAtMs: null,
      totalActiveSeconds: 0,
      sessionCount: 0,
      current: null,
    });
  });

  it("returns a fresh object each time", () => {
    const first = emptyActivity();
    first.sessionCount = 5;
    expect(emptyActivity().sessionCount).toBe(0);
  });
});

describe("applyHeartbeat", () => {
  describe("first beat", () => {
    it("starts the first session and credits nothing", () => {
      expect(applyHeartbeat(emptyActivity(), T0)).toEqual({
        activity: {
          firstSeenAtMs: T0,
          lastSeenAtMs: T0,
          totalActiveSeconds: 0,
          sessionCount: 1,
          current: { startedAtMs: T0, lastSeenAtMs: T0, activeSeconds: 0 },
        },
        closed: null,
        credited: 0,
        changed: true,
      });
    });
  });

  describe("crediting time", () => {
    it("credits the time since the previous beat", () => {
      const result = applyHeartbeat(started(), T0 + MINUTE);
      expect(result.credited).toBe(60);
      expect(result.changed).toBe(true);
      expect(result.closed).toBeNull();
      expect(result.activity).toEqual({
        firstSeenAtMs: T0,
        lastSeenAtMs: T0 + MINUTE,
        totalActiveSeconds: 60,
        sessionCount: 1,
        current: { startedAtMs: T0, lastSeenAtMs: T0 + MINUTE, activeSeconds: 60 },
      });
    });

    it("accumulates across beats in the same session", () => {
      const activity = run([0, MINUTE, 2 * MINUTE, 3 * MINUTE]);
      expect(activity.totalActiveSeconds).toBe(180);
      expect(activity.current?.activeSeconds).toBe(180);
      expect(activity.sessionCount).toBe(1);
    });

    it.each<[string, number, number]>([
      ["exactly at the cap", 90 * SECOND, 90],
      ["one second past the cap", 91 * SECOND, 90],
      ["a throttled background tab, 4 minutes", 4 * MINUTE, 90],
      ["exactly the session gap, 5 minutes", TIMING.sessionGapMs, 90],
    ])("credits at most 90 seconds per beat: %s", (_label, elapsed, credited) => {
      const result = applyHeartbeat(started(), T0 + elapsed);
      expect(result.credited).toBe(credited);
      expect(result.activity.totalActiveSeconds).toBe(credited);
      expect(result.activity.sessionCount).toBe(1);
    });

    it("credits one second less than the cap in full", () => {
      expect(applyHeartbeat(started(), T0 + 89 * SECOND).credited).toBe(89);
    });

    it("rounds the credit to the nearest second", () => {
      expect(applyHeartbeat(started(), T0 + 59_400).credited).toBe(59);
      expect(applyHeartbeat(started(), T0 + 59_600).credited).toBe(60);
    });
  });

  describe("beats that arrive too close together", () => {
    it("ignores a beat less than 20 seconds after the last one", () => {
      const before = started();
      const result = applyHeartbeat(before, T0 + TIMING.heartbeatMinIntervalMs - 1);
      expect(result).toEqual({ activity: before, closed: null, credited: 0, changed: false });
      expect(result.activity).toBe(before);
    });

    it("accepts a beat exactly 20 seconds after the last one", () => {
      const result = applyHeartbeat(started(), T0 + TIMING.heartbeatMinIntervalMs);
      expect(result.changed).toBe(true);
      expect(result.credited).toBe(20);
    });

    it("does not lose the ignored time: the next accepted beat credits from the last accepted one", () => {
      const activity = run([0, 10 * SECOND, 15 * SECOND, 30 * SECOND]);
      expect(activity.totalActiveSeconds).toBe(30);
      expect(activity.lastSeenAtMs).toBe(T0 + 30 * SECOND);
    });
  });

  describe("several tabs open at once", () => {
    it("credits wall-clock time once when two tabs beat at the same instants", () => {
      const twoTabs = [0, 0, MINUTE, MINUTE, 2 * MINUTE, 2 * MINUTE, 3 * MINUTE, 3 * MINUTE];
      const activity = run(twoTabs);
      expect(activity.totalActiveSeconds).toBe(180);
      expect(activity.sessionCount).toBe(1);
    });

    it("credits wall-clock time once when a second tab beats half a second behind the first", () => {
      const offsets = [0, 1, 2, 3, 4, 5].flatMap((minute) => [minute * MINUTE, minute * MINUTE + 500]);
      expect(run(offsets).totalActiveSeconds).toBe(300);
    });

    it("credits wall-clock time once when two tabs beat 30 seconds out of phase", () => {
      const tabA = [0, 1, 2, 3, 4, 5].map((minute) => minute * MINUTE);
      const tabB = [0, 1, 2, 3, 4].map((minute) => minute * MINUTE + 30 * SECOND);
      const merged = [...tabA, ...tabB].sort((a, b) => a - b);
      const activity = run(merged);
      expect(activity.totalActiveSeconds).toBe(300);
      expect(activity.sessionCount).toBe(1);
    });

    it("never credits more than the time that actually passed, however many tabs beat", () => {
      const offsets: number[] = [];
      for (let ms = 0; ms <= 10 * MINUTE; ms += 7 * SECOND) offsets.push(ms);
      const last = offsets[offsets.length - 1];
      expect(run(offsets).totalActiveSeconds).toBeLessThanOrEqual(last / SECOND);
    });
  });

  describe("session rollover", () => {
    it("continues the session when the gap is exactly 5 minutes", () => {
      const result = applyHeartbeat(started(), T0 + TIMING.sessionGapMs);
      expect(result.closed).toBeNull();
      expect(result.activity.sessionCount).toBe(1);
      expect(result.activity.current?.startedAtMs).toBe(T0);
    });

    it("starts a new session one millisecond past the 5 minute gap", () => {
      const before = run([0, MINUTE]);
      const now = T0 + MINUTE + TIMING.sessionGapMs + 1;
      const result = applyHeartbeat(before, now);
      expect(result).toEqual({
        activity: {
          firstSeenAtMs: T0,
          lastSeenAtMs: now,
          totalActiveSeconds: 60,
          sessionCount: 2,
          current: { startedAtMs: now, lastSeenAtMs: now, activeSeconds: 0 },
        },
        closed: { startedAtMs: T0, endedAtMs: T0 + MINUTE, activeSeconds: 60 },
        credited: 0,
        changed: true,
      });
    });

    it("ends the old session when it was last seen, not when the pledge came back", () => {
      const before = run([0, MINUTE, 2 * MINUTE]);
      const result = applyHeartbeat(before, T0 + 8 * 60 * MINUTE);
      expect(result.closed).toEqual({ startedAtMs: T0, endedAtMs: T0 + 2 * MINUTE, activeSeconds: 120 });
      expect(result.credited).toBe(0);
      expect(result.activity.totalActiveSeconds).toBe(120);
    });

    it("keeps the first-seen time across sessions", () => {
      const activity = run([0, MINUTE, 60 * MINUTE, 61 * MINUTE, 24 * 60 * MINUTE]);
      expect(activity.firstSeenAtMs).toBe(T0);
      expect(activity.sessionCount).toBe(3);
      expect(activity.totalActiveSeconds).toBe(120);
    });
  });

  describe("resume beats (the tab became visible again)", () => {
    it("credits nothing but marks the pledge as present", () => {
      const result = applyHeartbeat(started(), T0 + 3 * MINUTE, { resume: true });
      expect(result.credited).toBe(0);
      expect(result.changed).toBe(true);
      expect(result.closed).toBeNull();
      expect(result.activity).toEqual({
        firstSeenAtMs: T0,
        lastSeenAtMs: T0 + 3 * MINUTE,
        totalActiveSeconds: 0,
        sessionCount: 1,
        current: { startedAtMs: T0, lastSeenAtMs: T0 + 3 * MINUTE, activeSeconds: 0 },
      });
    });

    it("means the next beat only credits time since the tab came back", () => {
      const resumed = applyHeartbeat(started(), T0 + 4 * MINUTE, { resume: true }).activity;
      const result = applyHeartbeat(resumed, T0 + 4 * MINUTE + 30 * SECOND);
      expect(result.credited).toBe(30);
      expect(result.activity.totalActiveSeconds).toBe(30);
    });

    it("is ignored, like any other beat, when it arrives less than 20 seconds after the last one", () => {
      const before = started();
      for (const elapsed of [0, 1, 5 * SECOND, TIMING.heartbeatMinIntervalMs - 1]) {
        const result = applyHeartbeat(before, T0 + elapsed, { resume: true });
        expect(result).toEqual({ activity: before, closed: null, credited: 0, changed: false });
        expect(result.activity).toBe(before);
      }
    });

    it("is accepted exactly 20 seconds after the last beat, and still credits nothing", () => {
      const result = applyHeartbeat(started(), T0 + TIMING.heartbeatMinIntervalMs, { resume: true });
      expect(result.changed).toBe(true);
      expect(result.credited).toBe(0);
      expect(result.closed).toBeNull();
      expect(result.activity.lastSeenAtMs).toBe(T0 + TIMING.heartbeatMinIntervalMs);
      expect(result.activity.totalActiveSeconds).toBe(0);
    });

    it("does not lose time when it is ignored: the next ordinary beat credits from the last accepted one", () => {
      const before = run([0, MINUTE]);
      const ignored = applyHeartbeat(before, T0 + MINUTE + 5 * SECOND, { resume: true });
      expect(ignored.changed).toBe(false);
      const next = applyHeartbeat(ignored.activity, T0 + 2 * MINUTE);
      expect(next.credited).toBe(60);
      expect(next.activity.totalActiveSeconds).toBe(120);
    });

    it("continues the session when the tab was hidden for exactly the gap", () => {
      const before = run([0, MINUTE]);
      const result = applyHeartbeat(before, T0 + MINUTE + TIMING.sessionGapMs, { resume: true });
      expect(result.closed).toBeNull();
      expect(result.credited).toBe(0);
      expect(result.activity.sessionCount).toBe(1);
      expect(result.activity.current?.startedAtMs).toBe(T0);
    });

    it("starts a new session when the tab was hidden for longer than the gap", () => {
      const before = run([0, MINUTE]);
      const now = T0 + 30 * MINUTE;
      const result = applyHeartbeat(before, now, { resume: true });
      expect(result.closed).toEqual({ startedAtMs: T0, endedAtMs: T0 + MINUTE, activeSeconds: 60 });
      expect(result.credited).toBe(0);
      expect(result.activity.sessionCount).toBe(2);
      expect(result.activity.current).toEqual({ startedAtMs: now, lastSeenAtMs: now, activeSeconds: 0 });
    });

    it("starts the first session when it is the first beat ever", () => {
      expect(applyHeartbeat(emptyActivity(), T0, { resume: true })).toEqual({
        activity: {
          firstSeenAtMs: T0,
          lastSeenAtMs: T0,
          totalActiveSeconds: 0,
          sessionCount: 1,
          current: { startedAtMs: T0, lastSeenAtMs: T0, activeSeconds: 0 },
        },
        closed: null,
        credited: 0,
        changed: true,
      });
    });
  });

  describe("a session ends only by going quiet", () => {
    /** Applies each beat in turn and returns the final activity and every session that was closed. */
    function play(
      beats: Array<[number, HeartbeatOptions?]>,
      from: Activity = emptyActivity(),
    ): { activity: Activity; closed: ClosedSession[] } {
      const closed: ClosedSession[] = [];
      let activity = from;
      for (const [offset, options] of beats) {
        const result = applyHeartbeat(activity, T0 + offset, options);
        activity = result.activity;
        if (result.closed) closed.push(result.closed);
      }
      return { activity, closed };
    }

    it("keeps the latest session on the activity, still open, after the last beat of a visit", () => {
      const { activity, closed } = play([[0], [MINUTE], [2 * MINUTE]]);
      expect(closed).toEqual([]);
      expect(activity.current).toEqual({ startedAtMs: T0, lastSeenAtMs: T0 + 2 * MINUTE, activeSeconds: 120 });
    });

    it("has no option that closes a session: every beat inside the gap leaves it open", () => {
      const before = run([0, MINUTE]);
      for (const options of [undefined, {}, { resume: true }, { resume: false }]) {
        for (const elapsed of [0, 5 * SECOND, TIMING.heartbeatMinIntervalMs, 2 * MINUTE, TIMING.sessionGapMs]) {
          const result = applyHeartbeat(before, T0 + MINUTE + elapsed, options);
          expect(result.closed).toBeNull();
          expect(result.activity.sessionCount).toBe(1);
          expect(result.activity.current?.startedAtMs).toBe(T0);
        }
      }
    });

    it("ignores a field named final: the session stays open and the beat is treated as an ordinary one", () => {
      // Callers written against the old interface may still send it.
      const options = { final: true } as HeartbeatOptions;
      const before = run([0, MINUTE]);
      const result = applyHeartbeat(before, T0 + MINUTE + 45 * SECOND, options);
      expect(result).toEqual(applyHeartbeat(before, T0 + MINUTE + 45 * SECOND));
      expect(result.closed).toBeNull();
      expect(result.activity.current).not.toBeNull();
      expect(result.credited).toBe(45);
    });

    it("does not start a new session when the page is reloaded moments after the last beat", () => {
      // A reload sends a first beat from the new page, then carries on once a minute.
      const { activity, closed } = play([[0], [MINUTE], [MINUTE + 3 * SECOND], [2 * MINUTE + 3 * SECOND]]);
      expect(closed).toEqual([]);
      expect(activity.sessionCount).toBe(1);
      expect(activity.current?.startedAtMs).toBe(T0);
      expect(activity.totalActiveSeconds).toBe(123);
    });

    it("does not start a new session when the pledge signs out and back in within five minutes", () => {
      const away = TIMING.sessionGapMs;
      const { activity, closed } = play([[0], [MINUTE], [MINUTE + away], [2 * MINUTE + away]]);
      expect(closed).toEqual([]);
      expect(activity.sessionCount).toBe(1);
      expect(activity.current?.startedAtMs).toBe(T0);
      // The time away is credited only up to the cap, never in full.
      expect(activity.totalActiveSeconds).toBe(60 + TIMING.heartbeatMaxCreditSeconds + 60);
    });

    it("does start one when they come back one millisecond past five minutes", () => {
      const away = TIMING.sessionGapMs + 1;
      const { activity, closed } = play([[0], [MINUTE], [MINUTE + away]]);
      expect(closed).toEqual([{ startedAtMs: T0, endedAtMs: T0 + MINUTE, activeSeconds: 60 }]);
      expect(activity.sessionCount).toBe(2);
      expect(activity.current).toEqual({ startedAtMs: T0 + MINUTE + away, lastSeenAtMs: T0 + MINUTE + away, activeSeconds: 0 });
    });

    it("cannot be made to mint sessions by alternating rapid beats", () => {
      // An hour of beats every 250 ms, alternating ordinary and resume.
      const beats: Array<[number, HeartbeatOptions?]> = [];
      for (let ms = 0, index = 0; ms <= 60 * MINUTE; ms += 250, index += 1) {
        beats.push([ms, index % 2 === 0 ? {} : { resume: true }]);
      }
      const { activity, closed } = play(beats);
      expect(closed).toEqual([]);
      expect(activity.sessionCount).toBe(1);
      expect(activity.current?.startedAtMs).toBe(T0);
      expect(activity.totalActiveSeconds).toBeLessThanOrEqual(60 * 60);
    });

    it("cannot be made to mint sessions by any pattern of beats spaced up to 4 minutes 40 seconds apart", () => {
      // An ignored beat does not move the last-seen time, so the gap is measured from the
      // last beat that counted, which can be up to 20 seconds before the last one sent.
      const widest = TIMING.sessionGapMs - TIMING.heartbeatMinIntervalMs;
      expect(widest).toBe(280 * SECOND);
      const spacings = [1, 999, 19_999, 20_000, 20_001, 89_000, 90_000, 4 * MINUTE, widest, 19_999, widest];
      const beats: Array<[number, HeartbeatOptions?]> = [];
      let offset = 0;
      for (let index = 0; index < 440; index += 1) {
        beats.push([offset, index % 3 === 0 ? { resume: true } : undefined]);
        offset += spacings[index % spacings.length];
      }
      const { activity, closed } = play(beats);
      expect(closed).toEqual([]);
      expect(activity.sessionCount).toBe(1);
      expect(activity.current?.startedAtMs).toBe(T0);
    });

    it("mints at most one session per gap, however the beats are timed", () => {
      // The fastest possible: one beat a millisecond past the gap, every time.
      const step = TIMING.sessionGapMs + 1;
      const beats: Array<[number, HeartbeatOptions?]> = Array.from({ length: 12 }, (_, index) => [index * step]);
      const { activity, closed } = play(beats);
      expect(activity.sessionCount).toBe(12);
      expect(closed).toHaveLength(11);
      // Each of those sessions is a single beat: nothing was credited for any of them.
      expect(activity.totalActiveSeconds).toBe(0);
      expect(closed.every((session) => session.activeSeconds === 0 && session.endedAtMs === session.startedAtMs)).toBe(true);
      // Padding the same hour with thousands of extra beats adds none.
      const padded: Array<[number, HeartbeatOptions?]> = [];
      for (let ms = 0; ms <= 11 * step; ms += SECOND) padded.push([ms, ms % 2 === 0 ? {} : { resume: true }]);
      expect(play(padded).activity.sessionCount).toBe(1);
    });
  });

  describe("robustness", () => {
    it("never credits negative time when the clock steps backwards", () => {
      const before = run([0, MINUTE]);
      const ordinary = applyHeartbeat(before, T0 + 30 * SECOND);
      expect(ordinary.changed).toBe(false);
      expect(ordinary.credited).toBe(0);
      expect(ordinary.activity).toBe(before);

      const resumed = applyHeartbeat(before, T0 + 30 * SECOND, { resume: true });
      expect(resumed.changed).toBe(false);
      expect(resumed.credited).toBe(0);
      expect(resumed.closed).toBeNull();
      expect(resumed.activity.totalActiveSeconds).toBe(60);
    });

    it("does not mutate the activity it is given", () => {
      const before = run([0, MINUTE]);
      const snapshot = structuredClone(before);
      applyHeartbeat(before, T0 + 2 * MINUTE);
      applyHeartbeat(before, T0 + MINUTE + 5 * SECOND, { resume: true });
      applyHeartbeat(before, T0 + 2 * MINUTE, { resume: true });
      applyHeartbeat(before, T0 + 60 * MINUTE);
      applyHeartbeat(before, T0 + 60 * MINUTE, { resume: true });
      expect(before).toEqual(snapshot);
    });

    it("treats only literal true as resume", () => {
      const ordinary = applyHeartbeat(started(), T0 + 30 * SECOND);
      expect(ordinary.credited).toBe(30);
      expect(applyHeartbeat(started(), T0 + 30 * SECOND, { resume: false })).toEqual(ordinary);
      expect(applyHeartbeat(started(), T0 + 30 * SECOND, { resume: undefined })).toEqual(ordinary);
      expect(applyHeartbeat(started(), T0 + 30 * SECOND, { resume: 1 as unknown as boolean })).toEqual(ordinary);
      expect(applyHeartbeat(started(), T0 + 30 * SECOND, { resume: "true" as unknown as boolean })).toEqual(ordinary);
      expect(applyHeartbeat(started(), T0 + 30 * SECOND, { resume: true }).credited).toBe(0);
    });

    it("keeps the total equal to the sum of every session's time", () => {
      const script: Array<[number, HeartbeatOptions]> = [
        [0, {}],
        [MINUTE, {}],
        [2 * MINUTE, {}],
        [2 * MINUTE + 10 * SECOND, {}],
        [6 * MINUTE, { resume: true }],
        [7 * MINUTE, {}],
        [7 * MINUTE + 5 * SECOND, { resume: true }],
        [7 * MINUTE + 40 * SECOND, {}],
        [20 * MINUTE, {}],
        [21 * MINUTE, {}],
        [40 * MINUTE, {}],
        [41 * MINUTE, {}],
        [41 * MINUTE + 5 * SECOND, {}],
        [50 * MINUTE, { resume: true }],
        [60 * MINUTE, { resume: true }],
        [61 * MINUTE + 30 * SECOND, {}],
      ];
      let activity = emptyActivity();
      const closed: ClosedSession[] = [];
      let credited = 0;
      for (const [offset, options] of script) {
        const result = applyHeartbeat(activity, T0 + offset, options);
        activity = result.activity;
        credited += result.credited;
        if (result.closed) closed.push(result.closed);
      }
      const inClosed = closed.reduce((sum, session) => sum + session.activeSeconds, 0);
      const inCurrent = activity.current?.activeSeconds ?? 0;
      expect(inClosed + inCurrent).toBe(activity.totalActiveSeconds);
      expect(credited).toBe(activity.totalActiveSeconds);
      // Sessions: 0 to 7:40, 20 to 21, 40 to 41, 50, and 60 onwards, which is still open.
      expect(closed).toHaveLength(4);
      expect(activity.current).not.toBeNull();
      expect(closed.length + 1).toBe(activity.sessionCount);
      expect(activity.totalActiveSeconds).toBe(60 + 60 + 0 + 60 + 40 + 60 + 60 + 0 + 0 + 90);
      for (const session of closed) expect(session.endedAtMs).toBeGreaterThanOrEqual(session.startedAtMs);
    });
  });
});

describe("isOnline", () => {
  it("is false for a pledge who has never been seen", () => {
    expect(isOnline(null, T0)).toBe(false);
  });

  it("is true up to and including the online window", () => {
    expect(isOnline(T0, T0)).toBe(true);
    expect(isOnline(T0, T0 + TIMING.onlineWindowMs)).toBe(true);
  });

  it("is false one millisecond past the online window", () => {
    expect(isOnline(T0, T0 + TIMING.onlineWindowMs + 1)).toBe(false);
  });

  it("covers two missed heartbeats but not a closed laptop", () => {
    expect(isOnline(T0, T0 + 2 * TIMING.heartbeatIntervalMs)).toBe(true);
    expect(isOnline(T0, T0 + TIMING.sessionGapMs)).toBe(false);
  });
});
