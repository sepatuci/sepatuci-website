import { describe, expect, it } from "vitest";
import {
  applyHeartbeat,
  emptyActivity,
  endSession,
  isOnline,
  isQuiet,
  resolveSessionEnd,
  type Activity,
  type ClosedSession,
  type CurrentSession,
  type HeartbeatOptions,
  type HeartbeatResult,
} from "./activity";
import { LIMITS, TIMING } from "./constants";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
/** The day T0 falls on in Los Angeles, where it is five in the morning. */
const DAY = "2026-10-01";

/** The parts of a session that beats without options leave at their defaults. */
const PLAIN = { sessionId: null, signedInAtMs: null, lastPath: null, pageCount: 0, leaving: false } as const;

/** A session begun at `startedAtMs` by beats without options, last seen at `lastSeenAtMs`. */
function session(startedAtMs: number, lastSeenAtMs: number, activeSeconds: number, more: Partial<CurrentSession> = {}): CurrentSession {
  return { ...PLAIN, startedAtMs, lastSeenAtMs, activeSeconds, ...more };
}

/** The tally for T0's day. */
const today = (activeSeconds: number): Activity["today"] => ({ date: DAY, activeSeconds });

/** A session of beats without options that went quiet, as the gap closes it. */
const timedOut = (startedAtMs: number, endedAtMs: number, activeSeconds: number): ClosedSession => ({
  sessionId: null,
  startedAtMs,
  endedAtMs,
  endReason: "timed_out",
  activeSeconds,
});

/** The result of a beat that changed nothing: the same activity object, untouched. */
const unchanged = (activity: Activity): HeartbeatResult => ({
  activity,
  closed: null,
  started: false,
  newPage: null,
  credited: 0,
  changed: false,
});

/** An activity with one session in progress that started and was last seen at `at`. */
function started(at = T0): Activity {
  return applyHeartbeat(emptyActivity(), at).activity;
}

/** Applies ordinary beats at each offset from T0 and returns the final activity. */
function run(offsets: number[], from: Activity = emptyActivity()): Activity {
  return offsets.reduce((activity, offset) => applyHeartbeat(activity, T0 + offset).activity, from);
}

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

describe("emptyActivity", () => {
  it("starts with nothing recorded", () => {
    expect(emptyActivity()).toEqual({
      firstSeenAtMs: null,
      lastSeenAtMs: null,
      totalActiveSeconds: 0,
      sessionCount: 0,
      current: null,
      today: null,
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
          current: session(T0, T0, 0),
          today: today(0),
        },
        closed: null,
        started: true,
        newPage: null,
        credited: 0,
        changed: true,
      });
    });

    it("gives the session the id and sign-in time it is handed, and logs the page as its first", () => {
      expect(applyHeartbeat(emptyActivity(), T0, { sessionId: "s1", signedInAtMs: T0 - MINUTE, path: "/portal" })).toEqual({
        activity: {
          firstSeenAtMs: T0,
          lastSeenAtMs: T0,
          totalActiveSeconds: 0,
          sessionCount: 1,
          current: session(T0, T0, 0, { sessionId: "s1", signedInAtMs: T0 - MINUTE, lastPath: "/portal", pageCount: 1 }),
          today: today(0),
        },
        closed: null,
        started: true,
        newPage: { path: "/portal", atMs: T0 },
        credited: 0,
        changed: true,
      });
    });

    it("records a missing id or sign-in time as null", () => {
      for (const options of [{}, { sessionId: undefined, signedInAtMs: undefined }, { sessionId: null, signedInAtMs: null }]) {
        expect(applyHeartbeat(emptyActivity(), T0, options).activity.current).toEqual(session(T0, T0, 0));
      }
    });
  });

  describe("crediting time", () => {
    it("credits the time since the previous beat", () => {
      const result = applyHeartbeat(started(), T0 + MINUTE);
      expect(result.credited).toBe(60);
      expect(result.changed).toBe(true);
      expect(result.started).toBe(false);
      expect(result.closed).toBeNull();
      expect(result.activity).toEqual({
        firstSeenAtMs: T0,
        lastSeenAtMs: T0 + MINUTE,
        totalActiveSeconds: 60,
        sessionCount: 1,
        current: session(T0, T0 + MINUTE, 60),
        today: today(60),
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

    it("keeps the session's id, sign-in time and pages while crediting", () => {
      const before = applyHeartbeat(emptyActivity(), T0, { sessionId: "s1", signedInAtMs: T0, path: "/portal" }).activity;
      expect(applyHeartbeat(before, T0 + MINUTE).activity.current).toEqual(
        session(T0, T0 + MINUTE, 60, { sessionId: "s1", signedInAtMs: T0, lastPath: "/portal", pageCount: 1 }),
      );
    });
  });

  describe("beats that arrive too close together", () => {
    it("ignores a beat less than 20 seconds after the last one", () => {
      const before = started();
      const result = applyHeartbeat(before, T0 + TIMING.heartbeatMinIntervalMs - 1);
      expect(result).toEqual(unchanged(before));
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

    it("logs each tab's page once when two tabs on different pages beat in turn", () => {
      // Each beat reports a different page from the one before, so each is a page visit.
      const { activity } = play([
        [0, { path: "/portal" }],
        [0, { path: "/portal/account" }],
        [MINUTE, { path: "/portal" }],
        [MINUTE, { path: "/portal/account" }],
      ]);
      expect(activity.current?.pageCount).toBe(4);
      expect(activity.totalActiveSeconds).toBe(60);
    });
  });

  describe("session rollover", () => {
    it("continues the session when the gap is exactly 5 minutes", () => {
      const result = applyHeartbeat(started(), T0 + TIMING.sessionGapMs);
      expect(result.closed).toBeNull();
      expect(result.started).toBe(false);
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
          current: session(now, now, 0),
          today: today(60),
        },
        closed: timedOut(T0, T0 + MINUTE, 60),
        started: true,
        newPage: null,
        credited: 0,
        changed: true,
      });
    });

    it("ends the old session when it was last seen, not when the person came back", () => {
      const before = run([0, MINUTE, 2 * MINUTE]);
      const result = applyHeartbeat(before, T0 + 8 * HOUR);
      expect(result.closed).toEqual(timedOut(T0, T0 + 2 * MINUTE, 120));
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
    it("credits nothing but marks the person as present", () => {
      const result = applyHeartbeat(started(), T0 + 3 * MINUTE, { resume: true });
      expect(result.credited).toBe(0);
      expect(result.changed).toBe(true);
      expect(result.closed).toBeNull();
      expect(result.activity).toEqual({
        firstSeenAtMs: T0,
        lastSeenAtMs: T0 + 3 * MINUTE,
        totalActiveSeconds: 0,
        sessionCount: 1,
        current: session(T0, T0 + 3 * MINUTE, 0),
        today: today(0),
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
        expect(result).toEqual(unchanged(before));
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
      expect(result.closed).toEqual(timedOut(T0, T0 + MINUTE, 60));
      expect(result.started).toBe(true);
      expect(result.credited).toBe(0);
      expect(result.activity.sessionCount).toBe(2);
      expect(result.activity.current).toEqual(session(now, now, 0));
    });

    it("starts the first session when it is the first beat ever", () => {
      expect(applyHeartbeat(emptyActivity(), T0, { resume: true })).toEqual({
        activity: {
          firstSeenAtMs: T0,
          lastSeenAtMs: T0,
          totalActiveSeconds: 0,
          sessionCount: 1,
          current: session(T0, T0, 0),
          today: today(0),
        },
        closed: null,
        started: true,
        newPage: null,
        credited: 0,
        changed: true,
      });
    });

    it("logs a change of page like any other beat", () => {
      const before = applyHeartbeat(emptyActivity(), T0, { path: "/portal" }).activity;
      const result = applyHeartbeat(before, T0 + 3 * MINUTE, { resume: true, path: "/portal/account" });
      expect(result.credited).toBe(0);
      expect(result.newPage).toEqual({ path: "/portal/account", atMs: T0 + 3 * MINUTE });
      expect(result.activity.current).toMatchObject({ lastPath: "/portal/account", pageCount: 2 });
    });
  });

  describe("pages", () => {
    const onPage = (path: string, at = T0): Activity => applyHeartbeat(emptyActivity(), at, { path }).activity;

    it("logs the page the first beat reports as the session's first page", () => {
      const result = applyHeartbeat(emptyActivity(), T0, { path: "/portal" });
      expect(result.started).toBe(true);
      expect(result.newPage).toEqual({ path: "/portal", atMs: T0 });
      expect(result.activity.current).toEqual(session(T0, T0, 0, { lastPath: "/portal", pageCount: 1 }));
    });

    it("does not log the same page again on the next beat", () => {
      const result = applyHeartbeat(onPage("/portal"), T0 + MINUTE, { path: "/portal" });
      expect(result.newPage).toBeNull();
      expect(result.credited).toBe(60);
      expect(result.changed).toBe(true);
      expect(result.activity.current).toEqual(session(T0, T0 + MINUTE, 60, { lastPath: "/portal", pageCount: 1 }));
    });

    it("is unchanged by a beat under 20 seconds that reports the same page", () => {
      const before = onPage("/portal");
      const result = applyHeartbeat(before, T0 + 5 * SECOND, { path: "/portal" });
      expect(result).toEqual(unchanged(before));
      expect(result.activity).toBe(before);
    });

    it("logs a change of page under 20 seconds, crediting nothing and leaving the last-seen time where it was", () => {
      const before = onPage("/portal");
      const result = applyHeartbeat(before, T0 + 5 * SECOND, { path: "/portal/deliverables" });
      expect(result).toEqual({
        activity: { ...before, current: session(T0, T0, 0, { lastPath: "/portal/deliverables", pageCount: 2 }) },
        closed: null,
        started: false,
        newPage: { path: "/portal/deliverables", atMs: T0 + 5 * SECOND },
        credited: 0,
        changed: true,
      });
      expect(result.activity.lastSeenAtMs).toBe(T0);
      expect(result.activity.current?.lastSeenAtMs).toBe(T0);
    });

    it("credits from the last full beat once one follows an early change of page", () => {
      const moved = applyHeartbeat(onPage("/portal"), T0 + 5 * SECOND, { path: "/portal/deliverables" }).activity;
      const result = applyHeartbeat(moved, T0 + MINUTE, { path: "/portal/deliverables" });
      expect(result.credited).toBe(60);
      expect(result.newPage).toBeNull();
      expect(result.activity.totalActiveSeconds).toBe(60);
      expect(result.activity.current).toEqual(session(T0, T0 + MINUTE, 60, { lastPath: "/portal/deliverables", pageCount: 2 }));
    });

    it("logs a change of page after 20 seconds and credits the time as well", () => {
      const result = applyHeartbeat(onPage("/portal"), T0 + MINUTE, { path: "/portal/account" });
      expect(result).toEqual({
        activity: {
          firstSeenAtMs: T0,
          lastSeenAtMs: T0 + MINUTE,
          totalActiveSeconds: 60,
          sessionCount: 1,
          current: session(T0, T0 + MINUTE, 60, { lastPath: "/portal/account", pageCount: 2 }),
          today: today(60),
        },
        closed: null,
        started: false,
        newPage: { path: "/portal/account", atMs: T0 + MINUTE },
        credited: 60,
        changed: true,
      });
    });

    it("logs a change of page exactly 20 seconds on, with the time", () => {
      const result = applyHeartbeat(onPage("/portal"), T0 + TIMING.heartbeatMinIntervalMs, { path: "/portal/account" });
      expect(result.credited).toBe(20);
      expect(result.newPage).toEqual({ path: "/portal/account", atMs: T0 + TIMING.heartbeatMinIntervalMs });
    });

    it("keeps the last page when a beat reports none", () => {
      for (const options of [undefined, {}, { path: null }, { path: undefined }, { resume: true }]) {
        const result = applyHeartbeat(onPage("/portal"), T0 + MINUTE, options);
        expect(result.newPage).toBeNull();
        expect(result.activity.current).toMatchObject({ lastPath: "/portal", pageCount: 1 });
      }
    });

    it("starts a session on no page when the first beat reports none, and logs the first page it hears of", () => {
      const first = applyHeartbeat(emptyActivity(), T0);
      expect(first.newPage).toBeNull();
      expect(first.activity.current).toMatchObject({ lastPath: null, pageCount: 0 });
      const result = applyHeartbeat(first.activity, T0 + MINUTE, { path: "/portal" });
      expect(result.newPage).toEqual({ path: "/portal", atMs: T0 + MINUTE });
      expect(result.activity.current).toMatchObject({ lastPath: "/portal", pageCount: 1 });
    });

    it("counts a return to an earlier page as a new visit", () => {
      const away = applyHeartbeat(onPage("/portal"), T0 + MINUTE, { path: "/portal/account" }).activity;
      const back = applyHeartbeat(away, T0 + 2 * MINUTE, { path: "/portal" });
      expect(back.newPage).toEqual({ path: "/portal", atMs: T0 + 2 * MINUTE });
      expect(back.activity.current?.pageCount).toBe(3);
    });

    it("starts the next session's log afresh with the page the beat reports", () => {
      const result = applyHeartbeat(onPage("/portal/account"), T0 + HOUR, { path: "/portal/account" });
      expect(result.started).toBe(true);
      expect(result.newPage).toEqual({ path: "/portal/account", atMs: T0 + HOUR });
      expect(result.activity.current).toEqual(session(T0 + HOUR, T0 + HOUR, 0, { lastPath: "/portal/account", pageCount: 1 }));
    });

    describe("the cap on pages logged", () => {
      const CAP = LIMITS.sessionPages;
      /** When the last page inside the cap was logged. */
      const LAST_IN = T0 + (CAP - 1) * MINUTE;

      /** A session that has logged exactly as many pages as may be kept, one a minute. */
      function full(): Activity {
        let activity = onPage("/portal/p0");
        for (let index = 1; index < CAP; index += 1) {
          const result = applyHeartbeat(activity, T0 + index * MINUTE, { path: `/portal/p${index}` });
          expect(result.newPage).toEqual({ path: `/portal/p${index}`, atMs: T0 + index * MINUTE });
          activity = result.activity;
        }
        return activity;
      }

      it("is 300 pages", () => {
        expect(CAP).toBe(300);
      });

      it("logs every page up to the cap", () => {
        expect(full().current).toMatchObject({ lastPath: `/portal/p${CAP - 1}`, pageCount: CAP });
      });

      it("logs no page past the cap, but still remembers the page and credits the time", () => {
        const result = applyHeartbeat(full(), LAST_IN + MINUTE, { path: "/portal/over" });
        expect(result.newPage).toBeNull();
        expect(result.credited).toBe(60);
        expect(result.changed).toBe(true);
        expect(result.activity.current).toMatchObject({ lastPath: "/portal/over", pageCount: CAP });
      });

      it("stays at the cap however many more pages are seen", () => {
        let activity = full();
        for (let index = 0; index < 50; index += 1) {
          const result = applyHeartbeat(activity, LAST_IN + (index + 1) * MINUTE, { path: `/portal/over${index}` });
          expect(result.newPage).toBeNull();
          activity = result.activity;
        }
        expect(activity.current?.pageCount).toBe(CAP);
        expect(activity.current?.lastPath).toBe("/portal/over49");
        expect(activity.sessionCount).toBe(1);
      });

      it("still treats the same page as unchanged past the cap, and a change of page as a write", () => {
        const over = applyHeartbeat(full(), LAST_IN + MINUTE, { path: "/portal/over" }).activity;
        expect(applyHeartbeat(over, LAST_IN + MINUTE + 5 * SECOND, { path: "/portal/over" })).toEqual(unchanged(over));
        const early = applyHeartbeat(over, LAST_IN + MINUTE + 5 * SECOND, { path: "/portal/other" });
        expect(early.changed).toBe(true);
        expect(early.newPage).toBeNull();
        expect(early.activity.current).toMatchObject({ lastPath: "/portal/other", pageCount: CAP });
      });

      it("starts the next session's log afresh", () => {
        const now = LAST_IN + TIMING.sessionGapMs + 1;
        const result = applyHeartbeat(full(), now, { path: "/portal" });
        expect(result.started).toBe(true);
        expect(result.newPage).toEqual({ path: "/portal", atMs: now });
        expect(result.activity.current).toMatchObject({ lastPath: "/portal", pageCount: 1 });
      });
    });
  });

  describe("leaving (the tab said it was closing)", () => {
    it("is kept from a beat that says so, which is worth a write even under 20 seconds, crediting nothing", () => {
      const before = run([0, MINUTE]);
      const result = applyHeartbeat(before, T0 + MINUTE + 5 * SECOND, { leaving: true });
      expect(result).toEqual({
        activity: { ...before, current: session(T0, T0 + MINUTE, 60, { leaving: true }) },
        closed: null,
        started: false,
        newPage: null,
        credited: 0,
        changed: true,
      });
      expect(result.activity.lastSeenAtMs).toBe(T0 + MINUTE);
    });

    it("is cleared by a later beat that is not leaving, even under 20 seconds", () => {
      const left = applyHeartbeat(run([0, MINUTE]), T0 + MINUTE + 5 * SECOND, { leaving: true }).activity;
      for (const options of [undefined, {}, { leaving: false }, { resume: true }]) {
        const result = applyHeartbeat(left, T0 + MINUTE + 10 * SECOND, options);
        expect(result.changed).toBe(true);
        expect(result.credited).toBe(0);
        expect(result.activity.current).toEqual(session(T0, T0 + MINUTE, 60));
      }
    });

    it("is not worth another write when the tab says so twice", () => {
      const left = applyHeartbeat(run([0, MINUTE]), T0 + MINUTE + 5 * SECOND, { leaving: true }).activity;
      const again = applyHeartbeat(left, T0 + MINUTE + 10 * SECOND, { leaving: true });
      expect(again).toEqual(unchanged(left));
      expect(again.activity).toBe(left);
    });

    it("credits the time like any beat when it is 20 seconds or more after the last", () => {
      const result = applyHeartbeat(run([0, MINUTE]), T0 + 2 * MINUTE, { leaving: true });
      expect(result.credited).toBe(60);
      expect(result.activity.lastSeenAtMs).toBe(T0 + 2 * MINUTE);
      expect(result.activity.current).toEqual(session(T0, T0 + 2 * MINUTE, 120, { leaving: true }));
    });

    it("is cleared by a full beat that is not leaving", () => {
      const left = applyHeartbeat(run([0, MINUTE]), T0 + 2 * MINUTE, { leaving: true }).activity;
      expect(applyHeartbeat(left, T0 + 3 * MINUTE).activity.current).toEqual(session(T0, T0 + 3 * MINUTE, 180));
    });

    it("is recorded on the first beat of a session as well", () => {
      expect(applyHeartbeat(emptyActivity(), T0, { leaving: true }).activity.current).toEqual(session(T0, T0, 0, { leaving: true }));
      const result = applyHeartbeat(run([0, MINUTE]), T0 + HOUR, { leaving: true });
      expect(result.started).toBe(true);
      expect(result.activity.current?.leaving).toBe(true);
    });

    it("can go with a change of page on the same beat", () => {
      const before = applyHeartbeat(emptyActivity(), T0, { path: "/portal" }).activity;
      const result = applyHeartbeat(before, T0 + 5 * SECOND, { leaving: true, path: "/portal/account" });
      expect(result.newPage).toEqual({ path: "/portal/account", atMs: T0 + 5 * SECOND });
      expect(result.activity.current).toMatchObject({ leaving: true, lastPath: "/portal/account", pageCount: 2 });
    });

    it("takes nothing but true to mean leaving", () => {
      const before = run([0, MINUTE]);
      for (const leaving of [false, undefined, 1, "true", "yes", null]) {
        const options = { leaving } as unknown as HeartbeatOptions;
        expect(applyHeartbeat(before, T0 + MINUTE + 5 * SECOND, options)).toEqual(unchanged(before));
      }
    });

    it("does not end the session: the tab may yet come back", () => {
      const left = applyHeartbeat(run([0, MINUTE]), T0 + MINUTE + 5 * SECOND, { leaving: true });
      expect(left.closed).toBeNull();
      const back = applyHeartbeat(left.activity, T0 + 2 * MINUTE);
      expect(back.closed).toBeNull();
      expect(back.started).toBe(false);
      expect(back.activity.sessionCount).toBe(1);
      expect(back.credited).toBe(60);
    });
  });

  describe("no beat ends a session except by the gap, or by coming from a newer sign-in", () => {
    it("keeps the latest session on the activity, still open, after the last beat of a visit", () => {
      const { activity, closed } = play([[0], [MINUTE], [2 * MINUTE]]);
      expect(closed).toEqual([]);
      expect(activity.current).toEqual(session(T0, T0 + 2 * MINUTE, 120));
    });

    it("has no option that closes a session: every beat inside the gap leaves it open", () => {
      const before = run([0, MINUTE]);
      const everyKind: Array<HeartbeatOptions | undefined> = [
        undefined,
        {},
        { resume: true },
        { resume: false },
        { leaving: true },
        { path: "/portal/account" },
        { leaving: true, path: "/portal/account", resume: true },
        { sessionId: "s9" },
        { signedInAtMs: null },
        // The session has no sign-in time of its own, so a beat that brings one is not from another sign-in.
        { signedInAtMs: T0, sessionId: "s9" },
      ];
      for (const options of everyKind) {
        for (const elapsed of [0, 5 * SECOND, TIMING.heartbeatMinIntervalMs, 2 * MINUTE, TIMING.sessionGapMs]) {
          const result = applyHeartbeat(before, T0 + MINUTE + elapsed, options);
          expect(result.closed).toBeNull();
          expect(result.started).toBe(false);
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

    it("does not start a new session when the person is away for exactly five minutes", () => {
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
      expect(closed).toEqual([timedOut(T0, T0 + MINUTE, 60)]);
      expect(activity.sessionCount).toBe(2);
      expect(activity.current).toEqual(session(T0 + MINUTE + away, T0 + MINUTE + away, 0));
    });

    it("cannot be made to mint sessions by alternating rapid beats", () => {
      // An hour of beats every 250 ms, alternating ordinary, resume, leaving and a change of page.
      const beats: Array<[number, HeartbeatOptions?]> = [];
      const kinds: HeartbeatOptions[] = [{}, { resume: true }, { leaving: true }, { path: "/portal" }, { path: "/portal/account" }];
      for (let ms = 0, index = 0; ms <= 60 * MINUTE; ms += 250, index += 1) {
        beats.push([ms, kinds[index % kinds.length]]);
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
      expect(closed.every((session) => session.endReason === "timed_out")).toBe(true);
      // Padding the same hour with thousands of extra beats adds none.
      const padded: Array<[number, HeartbeatOptions?]> = [];
      for (let ms = 0; ms <= 11 * step; ms += SECOND) padded.push([ms, ms % 2 === 0 ? {} : { resume: true }]);
      expect(play(padded).activity.sessionCount).toBe(1);
    });
  });

  describe("closing a quiet session on the next beat", () => {
    const FIRST: HeartbeatOptions = { sessionId: "s1", signedInAtMs: T0 - HOUR, path: "/portal" };
    const NEXT: HeartbeatOptions = { sessionId: "s2", signedInAtMs: T0 + 2 * HOUR, path: "/portal/account" };
    const QUIET = T0 + MINUTE + TIMING.sessionGapMs + 1;

    it("closes it as timed out and starts a new session with the beat's id, sign-in time and page", () => {
      const before = play([[0, FIRST], [MINUTE, { path: "/portal" }]]).activity;
      expect(applyHeartbeat(before, QUIET, NEXT)).toEqual({
        activity: {
          firstSeenAtMs: T0,
          lastSeenAtMs: QUIET,
          totalActiveSeconds: 60,
          sessionCount: 2,
          current: session(QUIET, QUIET, 0, { sessionId: "s2", signedInAtMs: T0 + 2 * HOUR, lastPath: "/portal/account", pageCount: 1 }),
          today: today(60),
        },
        closed: { sessionId: "s1", startedAtMs: T0, endedAtMs: T0 + MINUTE, endReason: "timed_out", activeSeconds: 60 },
        started: true,
        newPage: { path: "/portal/account", atMs: QUIET },
        credited: 0,
        changed: true,
      });
    });

    it("closes it as left when the tab had said it was leaving", () => {
      const before = play([[0, FIRST], [MINUTE, { leaving: true }]]).activity;
      const result = applyHeartbeat(before, QUIET, NEXT);
      expect(result.closed).toEqual({ sessionId: "s1", startedAtMs: T0, endedAtMs: T0 + MINUTE, endReason: "left", activeSeconds: 60 });
      expect(result.started).toBe(true);
      expect(result.activity.sessionCount).toBe(2);
      expect(result.activity.current?.leaving).toBe(false);
    });

    it("closes it as expired when the sign-in ran out, even if the tab was leaving", () => {
      const signedInAtMs = T0 + MINUTE + TIMING.sessionGapMs - TIMING.maxSessionAgeMs;
      const before = play([[0, { ...FIRST, signedInAtMs }], [MINUTE, { leaving: true }]]).activity;
      const result = applyHeartbeat(before, QUIET, NEXT);
      expect(result.closed).toEqual({ sessionId: "s1", startedAtMs: T0, endedAtMs: T0 + MINUTE, endReason: "expired", activeSeconds: 60 });
      expect(result.started).toBe(true);
      expect(result.activity.current?.signedInAtMs).toBe(T0 + 2 * HOUR);
    });

    it("closes a session begun before sessions had documents with no id, and gives the new one its own", () => {
      const result = applyHeartbeat(run([0, MINUTE]), T0 + HOUR, NEXT);
      expect(result.closed).toEqual(timedOut(T0, T0 + MINUTE, 60));
      expect(result.activity.current?.sessionId).toBe("s2");
    });

    it("closes it the same whatever the beat that finds it carries", () => {
      const before = play([[0, FIRST], [MINUTE]]).activity;
      for (const options of [undefined, {}, { resume: true }, { leaving: true }, NEXT]) {
        const result = applyHeartbeat(before, QUIET, options);
        expect(result.closed).toEqual({ sessionId: "s1", startedAtMs: T0, endedAtMs: T0 + MINUTE, endReason: "timed_out", activeSeconds: 60 });
        expect(result.started).toBe(true);
        expect(result.activity.sessionCount).toBe(2);
      }
    });
  });

  describe("a beat from a newer sign-in", () => {
    const OLD_SIGN_IN = T0 - HOUR;
    const FIRST: HeartbeatOptions = { sessionId: "s1", signedInAtMs: OLD_SIGN_IN, path: "/portal" };
    /** A session from the old sign-in: two beats a minute apart, on the dashboard. */
    const before = (): Activity => play([[0, FIRST], [MINUTE, { path: "/portal" }]]).activity;
    /** Thirty seconds after the old session's last beat, well inside the gap. */
    const NOW = T0 + MINUTE + 30 * SECOND;
    const NEW_SIGN_IN = NOW - 5 * SECOND;
    const NEXT: HeartbeatOptions = { sessionId: "s2", signedInAtMs: NEW_SIGN_IN, path: "/portal/account" };
    const CLOSED_OLD: ClosedSession = { sessionId: "s1", startedAtMs: T0, endedAtMs: T0 + MINUTE, endReason: "signed_out", activeSeconds: 60 };

    it("starts a new session 30 seconds after the last beat, closing the old one as signed out when it was last seen", () => {
      expect(applyHeartbeat(before(), NOW, NEXT)).toEqual({
        activity: {
          firstSeenAtMs: T0,
          lastSeenAtMs: NOW,
          totalActiveSeconds: 60,
          sessionCount: 2,
          current: session(NOW, NOW, 0, { sessionId: "s2", signedInAtMs: NEW_SIGN_IN, lastPath: "/portal/account", pageCount: 1 }),
          today: today(60),
        },
        closed: CLOSED_OLD,
        started: true,
        newPage: { path: "/portal/account", atMs: NOW },
        credited: 0,
        changed: true,
      });
    });

    it("does so whatever the gap: a millisecond on, under 20 seconds, and at exactly the session gap", () => {
      for (const elapsed of [1, 5 * SECOND, TIMING.heartbeatMinIntervalMs, TIMING.sessionGapMs]) {
        const now = T0 + MINUTE + elapsed;
        const result = applyHeartbeat(before(), now, NEXT);
        expect(result.started, String(elapsed)).toBe(true);
        expect(result.closed, String(elapsed)).toEqual(CLOSED_OLD);
        expect(result.credited, String(elapsed)).toBe(0);
        expect(result.activity.sessionCount, String(elapsed)).toBe(2);
        expect(result.activity.current, String(elapsed)).toMatchObject({ sessionId: "s2", signedInAtMs: NEW_SIGN_IN, startedAtMs: now, activeSeconds: 0 });
      }
    });

    it("logs the page as the new session's first even when it is the page the old one was on", () => {
      const result = applyHeartbeat(before(), NOW, { ...NEXT, path: "/portal" });
      expect(result.newPage).toEqual({ path: "/portal", atMs: NOW });
      expect(result.activity.current).toMatchObject({ lastPath: "/portal", pageCount: 1 });
    });

    it("credits the old session nothing for the stretch since its last beat, which a plain beat would have", () => {
      expect(applyHeartbeat(before(), T0 + 2 * MINUTE).credited).toBe(60);
      const result = applyHeartbeat(before(), T0 + 2 * MINUTE, NEXT);
      expect(result.credited).toBe(0);
      expect(result.closed?.activeSeconds).toBe(60);
      expect(result.activity.totalActiveSeconds).toBe(60);
      expect(result.activity.today).toEqual(today(60));
    });

    it("closes the old session as expired when its sign-in is 12 hours old by now, and as signed out a millisecond short of that", () => {
      const cases: ReadonlyArray<[number, ClosedSession["endReason"]]> = [
        [TIMING.maxSessionAgeMs, "expired"],
        [TIMING.maxSessionAgeMs + HOUR, "expired"],
        [TIMING.maxSessionAgeMs - 1, "signed_out"],
      ];
      for (const [ago, endReason] of cases) {
        const old = play([[0, { ...FIRST, signedInAtMs: NOW - ago }], [MINUTE, { path: "/portal" }]]).activity;
        const result = applyHeartbeat(old, NOW, NEXT);
        expect(result.closed, String(ago)).toEqual({ ...CLOSED_OLD, endReason });
        expect(result.started, String(ago)).toBe(true);
        expect(result.activity.current?.signedInAtMs, String(ago)).toBe(NEW_SIGN_IN);
      }
    });

    it("closes the old session as signed out even if its tab had said it was leaving", () => {
      const left = applyHeartbeat(before(), T0 + MINUTE + 5 * SECOND, { leaving: true }).activity;
      const result = applyHeartbeat(left, NOW, NEXT);
      expect(result.closed).toEqual(CLOSED_OLD);
      expect(result.activity.current?.leaving).toBe(false);
    });

    it("continues the session for a beat with the same sign-in time, whatever id or page it carries", () => {
      const sameSignIn: HeartbeatOptions[] = [
        { signedInAtMs: OLD_SIGN_IN },
        { sessionId: "s1", signedInAtMs: OLD_SIGN_IN },
        { sessionId: "s9", signedInAtMs: OLD_SIGN_IN, path: "/portal/account" },
        { sessionId: "s9", signedInAtMs: OLD_SIGN_IN, resume: true, leaving: true },
      ];
      for (const options of sameSignIn) {
        const result = applyHeartbeat(before(), T0 + 2 * MINUTE, options);
        expect(result.closed, JSON.stringify(options)).toBeNull();
        expect(result.started, JSON.stringify(options)).toBe(false);
        expect(result.activity.sessionCount, JSON.stringify(options)).toBe(1);
        // The id a beat carries is for a session it starts. A session that carries on keeps its own.
        expect(result.activity.current, JSON.stringify(options)).toMatchObject({ sessionId: "s1", signedInAtMs: OLD_SIGN_IN, startedAtMs: T0 });
      }
    });

    it("continues the session for a beat that does not say when it signed in", () => {
      const saysNothing: Array<HeartbeatOptions | undefined> = [
        undefined,
        {},
        { signedInAtMs: undefined },
        { signedInAtMs: null },
        { sessionId: "s2" },
        { sessionId: "s2", signedInAtMs: null, path: "/portal/account" },
      ];
      for (const options of saysNothing) {
        const result = applyHeartbeat(before(), T0 + 2 * MINUTE, options);
        expect(result.closed, JSON.stringify(options)).toBeNull();
        expect(result.started, JSON.stringify(options)).toBe(false);
        expect(result.credited, JSON.stringify(options)).toBe(60);
        expect(result.activity.sessionCount, JSON.stringify(options)).toBe(1);
        expect(result.activity.current, JSON.stringify(options)).toMatchObject({ sessionId: "s1", signedInAtMs: OLD_SIGN_IN, startedAtMs: T0, activeSeconds: 120 });
      }
    });

    it("continues a session begun before sign-in times were kept, and leaves it without one", () => {
      const legacy = run([0, MINUTE]);
      const result = applyHeartbeat(legacy, T0 + 2 * MINUTE, NEXT);
      expect(result.closed).toBeNull();
      expect(result.started).toBe(false);
      expect(result.credited).toBe(60);
      expect(result.newPage).toEqual({ path: "/portal/account", atMs: T0 + 2 * MINUTE });
      expect(result.activity.sessionCount).toBe(1);
      expect(result.activity.current).toEqual(session(T0, T0 + 2 * MINUTE, 120, { lastPath: "/portal/account", pageCount: 1 }));
    });

    it("gives a quiet old session the quiet reason, not signed out", () => {
      const QUIET = T0 + MINUTE + TIMING.sessionGapMs + 1;
      const timedOutResult = applyHeartbeat(before(), QUIET, NEXT);
      expect(timedOutResult.closed).toEqual({ ...CLOSED_OLD, endReason: "timed_out" });
      expect(timedOutResult.activity.current).toMatchObject({ sessionId: "s2", signedInAtMs: NEW_SIGN_IN, startedAtMs: QUIET });

      const left = play([[0, FIRST], [MINUTE, { leaving: true }]]).activity;
      expect(applyHeartbeat(left, QUIET, NEXT).closed).toEqual({ ...CLOSED_OLD, endReason: "left" });

      const ranOut = play([[0, { ...FIRST, signedInAtMs: T0 + MINUTE + TIMING.sessionGapMs - TIMING.maxSessionAgeMs }], [MINUTE]]).activity;
      expect(applyHeartbeat(ranOut, QUIET, NEXT).closed).toEqual({ ...CLOSED_OLD, endReason: "expired" });
    });

    it("ends each session in turn when sign-ins follow one another", () => {
      const { activity, closed } = play([
        [0, FIRST],
        [MINUTE, { path: "/portal" }],
        [90 * SECOND, NEXT],
        [2 * MINUTE + 30 * SECOND, { signedInAtMs: NEW_SIGN_IN }],
        [3 * MINUTE, { sessionId: "s3", signedInAtMs: T0 + 3 * MINUTE - SECOND, path: "/portal" }],
      ]);
      expect(closed).toEqual([
        CLOSED_OLD,
        { sessionId: "s2", startedAtMs: T0 + 90 * SECOND, endedAtMs: T0 + 2 * MINUTE + 30 * SECOND, endReason: "signed_out", activeSeconds: 60 },
      ]);
      expect(activity.sessionCount).toBe(3);
      expect(activity.current).toMatchObject({ sessionId: "s3", startedAtMs: T0 + 3 * MINUTE, activeSeconds: 0, pageCount: 1 });
      expect(activity.totalActiveSeconds).toBe(120);
    });

    it("turns on the sign-in being newer, to the millisecond", () => {
      for (const [delta, starts] of [
        [1, true],
        [0, false],
        [-1, false],
        [-HOUR, false],
      ] as const) {
        const result = applyHeartbeat(before(), NOW, { ...NEXT, signedInAtMs: OLD_SIGN_IN + delta });
        expect(result.started, String(delta)).toBe(starts);
        expect(result.closed === null, String(delta)).toBe(!starts);
        expect(result.activity.sessionCount, String(delta)).toBe(starts ? 2 : 1);
        expect(result.activity.current?.signedInAtMs, String(delta)).toBe(starts ? OLD_SIGN_IN + delta : OLD_SIGN_IN);
      }
    });

    describe("a beat from an older sign-in", () => {
      const NEWER_SIGN_IN = T0 - MINUTE;
      /** A session the newer sign-in started: two beats a minute apart, on the dashboard. */
      const newer = (): Activity => play([[0, { sessionId: "s2", signedInAtMs: NEWER_SIGN_IN, path: "/portal" }], [MINUTE, { path: "/portal" }]]).activity;
      const OLDER: HeartbeatOptions = { sessionId: "s1", signedInAtMs: OLD_SIGN_IN, path: "/portal/account" };
      const QUIET = T0 + MINUTE + TIMING.sessionGapMs + 1;

      it("continues the session within the gap, crediting the stretch and logging the page, and the session keeps its own id and sign-in", () => {
        expect(applyHeartbeat(newer(), T0 + 2 * MINUTE, OLDER)).toEqual({
          activity: {
            firstSeenAtMs: T0,
            lastSeenAtMs: T0 + 2 * MINUTE,
            totalActiveSeconds: 120,
            sessionCount: 1,
            current: session(T0, T0 + 2 * MINUTE, 120, { sessionId: "s2", signedInAtMs: NEWER_SIGN_IN, lastPath: "/portal/account", pageCount: 2 }),
            today: today(120),
          },
          closed: null,
          started: false,
          newPage: { path: "/portal/account", atMs: T0 + 2 * MINUTE },
          credited: 60,
          changed: true,
        });
      });

      it("is held to the usual rules within the gap: under 20 seconds it is a write only for a change of page or leaving", () => {
        const current = newer();
        expect(applyHeartbeat(current, T0 + MINUTE + 5 * SECOND, { ...OLDER, path: "/portal" })).toEqual(unchanged(current));
        const moved = applyHeartbeat(current, T0 + MINUTE + 5 * SECOND, OLDER);
        expect(moved.started).toBe(false);
        expect(moved.changed).toBe(true);
        expect(moved.credited).toBe(0);
        expect(moved.newPage).toEqual({ path: "/portal/account", atMs: T0 + MINUTE + 5 * SECOND });
        expect(moved.activity.current).toMatchObject({ sessionId: "s2", signedInAtMs: NEWER_SIGN_IN, lastSeenAtMs: T0 + MINUTE });
      });

      it("continues the session at exactly the gap, and credits at most 90 seconds", () => {
        const result = applyHeartbeat(newer(), T0 + MINUTE + TIMING.sessionGapMs, OLDER);
        expect(result.started).toBe(false);
        expect(result.closed).toBeNull();
        expect(result.credited).toBe(90);
        expect(result.activity.sessionCount).toBe(1);
      });

      it("starts a fresh session by the quiet rule once the newer sign-in's session has gone quiet, carrying its own sign-in time", () => {
        expect(applyHeartbeat(newer(), QUIET, OLDER)).toEqual({
          activity: {
            firstSeenAtMs: T0,
            lastSeenAtMs: QUIET,
            totalActiveSeconds: 60,
            sessionCount: 2,
            current: session(QUIET, QUIET, 0, { sessionId: "s1", signedInAtMs: OLD_SIGN_IN, lastPath: "/portal/account", pageCount: 1 }),
            today: today(60),
          },
          closed: { sessionId: "s2", startedAtMs: T0, endedAtMs: T0 + MINUTE, endReason: "timed_out", activeSeconds: 60 },
          started: true,
          newPage: { path: "/portal/account", atMs: QUIET },
          credited: 0,
          changed: true,
        });
      });

      it("gives the quiet session its own reason: left when its tab was leaving, expired when its sign-in had run out", () => {
        const left = play([[0, { sessionId: "s2", signedInAtMs: NEWER_SIGN_IN }], [MINUTE, { leaving: true }]]).activity;
        expect(applyHeartbeat(left, QUIET, OLDER).closed).toEqual({ sessionId: "s2", startedAtMs: T0, endedAtMs: T0 + MINUTE, endReason: "left", activeSeconds: 60 });
        const ranOut = play([[0, { sessionId: "s2", signedInAtMs: T0 + MINUTE + TIMING.sessionGapMs - TIMING.maxSessionAgeMs }], [MINUTE]]).activity;
        // Older still than that sign-in, so the beat continues nothing and starts afresh by the quiet rule.
        const olderStill: HeartbeatOptions = { ...OLDER, signedInAtMs: T0 - TIMING.maxSessionAgeMs };
        expect(applyHeartbeat(ranOut, QUIET, olderStill).closed?.endReason).toBe("expired");
      });

      it("then lets the newer sign-in's next beat start a session of its own again, since it is the newer one once more", () => {
        const fresh = applyHeartbeat(newer(), QUIET, OLDER).activity;
        const result = applyHeartbeat(fresh, QUIET + 30 * SECOND, { sessionId: "s3", signedInAtMs: NEWER_SIGN_IN, path: "/portal" });
        expect(result.started).toBe(true);
        expect(result.closed).toEqual({ sessionId: "s1", startedAtMs: QUIET, endedAtMs: QUIET, endReason: "signed_out", activeSeconds: 0 });
        expect(result.activity.sessionCount).toBe(3);
        expect(result.activity.current).toMatchObject({ sessionId: "s3", signedInAtMs: NEWER_SIGN_IN });
      });
    });

    it("gives a person with the portal open on two devices one session, not one per beat", () => {
      // A laptop signed in thirty seconds before a phone. Each beats once a minute, half a minute apart, for an hour.
      const LAPTOP: HeartbeatOptions = { sessionId: "laptop", signedInAtMs: T0 - 30 * SECOND, path: "/portal" };
      const PHONE: HeartbeatOptions = { sessionId: "phone", signedInAtMs: T0, path: "/portal/deliverables" };
      const beats: Array<[number, HeartbeatOptions]> = [];
      for (let minute = 0; minute < 60; minute += 1) beats.push([minute * MINUTE, LAPTOP], [minute * MINUTE + 30 * SECOND, PHONE]);
      expect(beats).toHaveLength(120);

      const credited: number[] = [];
      const closed: ClosedSession[] = [];
      let activity = emptyActivity();
      for (const [offset, options] of beats) {
        const result = applyHeartbeat(activity, T0 + offset, options);
        credited.push(result.credited);
        activity = result.activity;
        if (result.closed) closed.push(result.closed);
      }

      // The phone's first beat, from the newer sign-in, is the one and only boundary.
      expect(closed).toEqual([{ sessionId: "laptop", startedAtMs: T0, endedAtMs: T0, endReason: "signed_out", activeSeconds: 0 }]);
      expect(activity.sessionCount).toBe(2);
      expect(activity.current).toMatchObject({ sessionId: "phone", signedInAtMs: T0, startedAtMs: T0 + 30 * SECOND, lastSeenAtMs: T0 + 59 * MINUTE + 30 * SECOND });
      // Every beat after those two credits the half minute since the last, from either device.
      expect(credited.slice(0, 2)).toEqual([0, 0]);
      expect(credited.slice(2)).toEqual(Array.from({ length: 118 }, () => 30));
      expect(activity.totalActiveSeconds).toBe(118 * 30);
      expect(activity.current?.activeSeconds).toBe(118 * 30);
      // Both devices' pages are in the one log, alternating, so every beat after the boundary is a page.
      expect(activity.current?.pageCount).toBe(1 + 118);
      expect(activity.today).toEqual(today(118 * 30));
    });

    it("does not mutate the activity it is given", () => {
      const old = before();
      const snapshot = structuredClone(old);
      applyHeartbeat(old, NOW, NEXT);
      applyHeartbeat(old, T0 + MINUTE + 1, NEXT);
      expect(old).toEqual(snapshot);
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

      const moved = applyHeartbeat(before, T0 + 30 * SECOND, { path: "/portal" });
      expect(moved.credited).toBe(0);
      expect(moved.activity.lastSeenAtMs).toBe(T0 + MINUTE);
    });

    it("does not mutate the activity it is given", () => {
      const before = play([[0, { sessionId: "s1", signedInAtMs: T0, path: "/portal" }], [MINUTE]]).activity;
      const snapshot = structuredClone(before);
      applyHeartbeat(before, T0 + 2 * MINUTE);
      applyHeartbeat(before, T0 + MINUTE + 5 * SECOND, { resume: true });
      applyHeartbeat(before, T0 + MINUTE + 5 * SECOND, { path: "/portal/account" });
      applyHeartbeat(before, T0 + MINUTE + 5 * SECOND, { leaving: true });
      applyHeartbeat(before, T0 + 2 * MINUTE, { resume: true, path: "/portal/account", leaving: true });
      applyHeartbeat(before, T0 + 60 * MINUTE);
      applyHeartbeat(before, T0 + 60 * MINUTE, { resume: true, sessionId: "s2", signedInAtMs: T0 + HOUR, path: "/portal" });
      applyHeartbeat(before, T0 + 24 * HOUR);
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
        [0, { path: "/portal" }],
        [MINUTE, {}],
        [2 * MINUTE, { path: "/portal/account" }],
        [2 * MINUTE + 10 * SECOND, { path: "/portal" }],
        [6 * MINUTE, { resume: true }],
        [7 * MINUTE, {}],
        [7 * MINUTE + 5 * SECOND, { resume: true }],
        [7 * MINUTE + 40 * SECOND, { leaving: true }],
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
      expect(closed.map((session) => session.endReason)).toEqual(["left", "timed_out", "timed_out", "timed_out"]);
      expect(activity.current).not.toBeNull();
      expect(closed.length + 1).toBe(activity.sessionCount);
      expect(activity.totalActiveSeconds).toBe(60 + 60 + 0 + 60 + 40 + 60 + 60 + 0 + 0 + 90);
      expect(activity.today).toEqual(today(activity.totalActiveSeconds));
      for (const session of closed) expect(session.endedAtMs).toBeGreaterThanOrEqual(session.startedAtMs);
    });
  });
});

describe("isQuiet", () => {
  it("is false up to and including the gap after the last beat, and true one millisecond past it", () => {
    const current = session(T0, T0 + MINUTE, 60);
    expect(isQuiet(current, T0 + MINUTE)).toBe(false);
    expect(isQuiet(current, T0 + MINUTE + TIMING.sessionGapMs)).toBe(false);
    expect(isQuiet(current, T0 + MINUTE + TIMING.sessionGapMs + 1)).toBe(true);
  });

  it("goes by when the session was last seen, not by when it started", () => {
    const current = session(T0, T0 + HOUR, 3600);
    expect(isQuiet(current, T0 + HOUR + TIMING.sessionGapMs)).toBe(false);
    expect(isQuiet(current, T0 + HOUR + TIMING.sessionGapMs + 1)).toBe(true);
  });

  it("is false when the clock has stepped backwards", () => {
    expect(isQuiet(session(T0, T0 + MINUTE, 60), T0)).toBe(false);
  });
});

describe("resolveSessionEnd", () => {
  const LAST_SEEN = T0 + MINUTE;
  const QUIET = LAST_SEEN + TIMING.sessionGapMs + 1;
  /** A session with its own document, signed in an hour before T0, live at T0 + MINUTE. */
  const live = (more: Partial<CurrentSession> = {}): CurrentSession =>
    session(T0, LAST_SEEN, 60, { sessionId: "s1", signedInAtMs: T0 - HOUR, ...more });
  /** The sign-in time at which the sign-in had just run out when the session could first have timed out. */
  const RAN_OUT = LAST_SEEN + TIMING.sessionGapMs - TIMING.maxSessionAgeMs;

  it("is null while the session is live, up to and including the gap, whatever else is true of it", () => {
    for (const now of [LAST_SEEN, LAST_SEEN + SECOND, LAST_SEEN + TIMING.sessionGapMs]) {
      expect(resolveSessionEnd(live(), now)).toBeNull();
      expect(resolveSessionEnd(live({ leaving: true }), now)).toBeNull();
      expect(resolveSessionEnd(live({ signedInAtMs: RAN_OUT }), now)).toBeNull();
      expect(resolveSessionEnd(live({ signedInAtMs: T0 - 2 * TIMING.maxSessionAgeMs, leaving: true }), now)).toBeNull();
    }
  });

  it("is timed_out one millisecond past the gap, ended when the session was last seen", () => {
    expect(resolveSessionEnd(live(), QUIET)).toEqual({
      sessionId: "s1",
      startedAtMs: T0,
      endedAtMs: LAST_SEEN,
      endReason: "timed_out",
      activeSeconds: 60,
    });
  });

  it("ends when the session was last seen however much later it is read", () => {
    for (const now of [QUIET, QUIET + HOUR, QUIET + 30 * 24 * HOUR]) {
      expect(resolveSessionEnd(live(), now)?.endedAtMs).toBe(LAST_SEEN);
    }
  });

  it("is left when the tab had said it was leaving", () => {
    expect(resolveSessionEnd(live({ leaving: true }), QUIET)).toEqual({
      sessionId: "s1",
      startedAtMs: T0,
      endedAtMs: LAST_SEEN,
      endReason: "left",
      activeSeconds: 60,
    });
  });

  it("is expired when the sign-in had run out by the time the session could have timed out", () => {
    expect(resolveSessionEnd(live({ signedInAtMs: RAN_OUT }), QUIET)?.endReason).toBe("expired");
    expect(resolveSessionEnd(live({ signedInAtMs: RAN_OUT - HOUR }), QUIET)?.endReason).toBe("expired");
    expect(resolveSessionEnd(live({ signedInAtMs: RAN_OUT }), QUIET)?.endedAtMs).toBe(LAST_SEEN);
  });

  it("is expired rather than left when both apply", () => {
    expect(resolveSessionEnd(live({ signedInAtMs: RAN_OUT, leaving: true }), QUIET)?.endReason).toBe("expired");
    expect(resolveSessionEnd(live({ signedInAtMs: RAN_OUT - HOUR, leaving: true }), QUIET)?.endReason).toBe("expired");
  });

  it("is timed_out, or left, while the sign-in had a millisecond to go", () => {
    expect(resolveSessionEnd(live({ signedInAtMs: RAN_OUT + 1 }), QUIET)?.endReason).toBe("timed_out");
    expect(resolveSessionEnd(live({ signedInAtMs: RAN_OUT + 1, leaving: true }), QUIET)?.endReason).toBe("left");
  });

  it("judges the sign-in by when the session was last seen, not by when it is read", () => {
    // Signed in eleven hours before the last beat, the sign-in had an hour to go: timed out, however long ago.
    const current = live({ signedInAtMs: LAST_SEEN - 11 * HOUR });
    expect(resolveSessionEnd(current, QUIET + 24 * HOUR)?.endReason).toBe("timed_out");
    expect(resolveSessionEnd(current, QUIET + 365 * 24 * HOUR)?.endReason).toBe("timed_out");
  });

  it("is never expired for a session whose sign-in time is not known", () => {
    expect(resolveSessionEnd(live({ signedInAtMs: null }), QUIET)?.endReason).toBe("timed_out");
    expect(resolveSessionEnd(live({ signedInAtMs: null, leaving: true }), QUIET)?.endReason).toBe("left");
    expect(resolveSessionEnd(live({ signedInAtMs: null }), QUIET + 365 * 24 * HOUR)?.endReason).toBe("timed_out");
  });

  it("carries a missing id as null", () => {
    expect(resolveSessionEnd(live({ sessionId: null }), QUIET)?.sessionId).toBeNull();
  });

  it("agrees with what a later beat records", () => {
    for (const more of [{}, { leaving: true }, { signedInAtMs: RAN_OUT }, { signedInAtMs: RAN_OUT, leaving: true }, { signedInAtMs: null, leaving: true }]) {
      const current = live(more);
      const activity: Activity = { firstSeenAtMs: T0, lastSeenAtMs: LAST_SEEN, totalActiveSeconds: 60, sessionCount: 1, current, today: today(60) };
      expect(applyHeartbeat(activity, QUIET).closed).toEqual(resolveSessionEnd(current, QUIET));
    }
  });
});

describe("endSession", () => {
  it("changes nothing when there is no session to end", () => {
    const signedOut = endSession(run([0, MINUTE]), T0 + 2 * MINUTE, "signed_out").activity;
    for (const activity of [emptyActivity(), signedOut]) {
      for (const reason of ["signed_out", "idle"] as const) {
        const result = endSession(activity, T0 + HOUR, reason);
        expect(result).toEqual(unchanged(activity));
        expect(result.activity).toBe(activity);
      }
    }
  });

  it("closes a live session with the given reason, ended now, crediting the last stretch", () => {
    expect(endSession(run([0, MINUTE]), T0 + 2 * MINUTE, "signed_out")).toEqual({
      activity: {
        firstSeenAtMs: T0,
        lastSeenAtMs: T0 + 2 * MINUTE,
        totalActiveSeconds: 120,
        sessionCount: 1,
        current: null,
        today: today(120),
      },
      closed: { sessionId: null, startedAtMs: T0, endedAtMs: T0 + 2 * MINUTE, endReason: "signed_out", activeSeconds: 120 },
      started: false,
      newPage: null,
      credited: 60,
      changed: true,
    });
  });

  it("records a sign-out after sitting idle as idle", () => {
    const result = endSession(run([0, MINUTE]), T0 + 2 * MINUTE, "idle");
    expect(result.closed?.endReason).toBe("idle");
    expect(result.credited).toBe(60);
    expect(result.activity.current).toBeNull();
  });

  it("carries the session's id and leaves the page log as it was", () => {
    const before = play([[0, { sessionId: "s1", signedInAtMs: T0, path: "/portal" }], [MINUTE, { path: "/portal/account" }]]).activity;
    const result = endSession(before, T0 + 2 * MINUTE, "signed_out");
    expect(result.closed).toEqual({ sessionId: "s1", startedAtMs: T0, endedAtMs: T0 + 2 * MINUTE, endReason: "signed_out", activeSeconds: 120 });
    expect(result.newPage).toBeNull();
    expect(result.started).toBe(false);
  });

  it("credits nothing when the last beat was under 20 seconds ago, but still ends the session now", () => {
    const now = T0 + MINUTE + TIMING.heartbeatMinIntervalMs - 1;
    expect(endSession(run([0, MINUTE]), now, "signed_out")).toEqual({
      activity: {
        firstSeenAtMs: T0,
        lastSeenAtMs: now,
        totalActiveSeconds: 60,
        sessionCount: 1,
        current: null,
        today: today(60),
      },
      closed: { sessionId: null, startedAtMs: T0, endedAtMs: now, endReason: "signed_out", activeSeconds: 60 },
      started: false,
      newPage: null,
      credited: 0,
      changed: true,
    });
  });

  it("credits exactly 20 seconds at the minimum interval, and at most 90", () => {
    const before = run([0, MINUTE]);
    expect(endSession(before, T0 + MINUTE + TIMING.heartbeatMinIntervalMs, "signed_out").credited).toBe(20);
    expect(endSession(before, T0 + MINUTE + 89 * SECOND, "signed_out").credited).toBe(89);
    expect(endSession(before, T0 + MINUTE + 90 * SECOND, "signed_out").credited).toBe(90);
    expect(endSession(before, T0 + MINUTE + 4 * MINUTE, "signed_out").credited).toBe(90);
    expect(endSession(before, T0 + MINUTE + TIMING.sessionGapMs, "idle").credited).toBe(90);
  });

  it("rounds the last stretch to the nearest second", () => {
    expect(endSession(started(), T0 + 59_400, "signed_out").credited).toBe(59);
    expect(endSession(started(), T0 + 59_600, "signed_out").credited).toBe(60);
  });

  it("ends a session the moment it starts, crediting nothing", () => {
    const result = endSession(started(), T0, "signed_out");
    expect(result.closed).toEqual({ sessionId: null, startedAtMs: T0, endedAtMs: T0, endReason: "signed_out", activeSeconds: 0 });
    expect(result.activity.current).toBeNull();
    expect(result.activity.sessionCount).toBe(1);
  });

  it("never credits negative time when the clock steps backwards", () => {
    const result = endSession(run([0, MINUTE]), T0 + 30 * SECOND, "signed_out");
    expect(result.credited).toBe(0);
    expect(result.closed?.activeSeconds).toBe(60);
    expect(result.activity.totalActiveSeconds).toBe(60);
  });

  describe("a session that had already gone quiet", () => {
    it("is closed by the quiet rules, not as a sign-out, and the person is not marked as seen", () => {
      const before = run([0, MINUTE]);
      const result = endSession(before, T0 + MINUTE + TIMING.sessionGapMs + 1, "signed_out");
      expect(result).toEqual({
        activity: { ...before, current: null },
        closed: timedOut(T0, T0 + MINUTE, 60),
        started: false,
        newPage: null,
        credited: 0,
        changed: true,
      });
      expect(result.activity.lastSeenAtMs).toBe(T0 + MINUTE);
    });

    it("is closed as left when the tab had said it was leaving", () => {
      const left = applyHeartbeat(run([0, MINUTE]), T0 + 2 * MINUTE, { leaving: true }).activity;
      const result = endSession(left, T0 + 2 * MINUTE + TIMING.sessionGapMs + 1, "idle");
      expect(result.closed).toEqual({ sessionId: null, startedAtMs: T0, endedAtMs: T0 + 2 * MINUTE, endReason: "left", activeSeconds: 120 });
      expect(result.activity.current).toBeNull();
      expect(result.credited).toBe(0);
    });

    it("is closed as expired when the sign-in had run out", () => {
      const signedInAtMs = T0 + MINUTE + TIMING.sessionGapMs - TIMING.maxSessionAgeMs;
      const before = play([[0, { sessionId: "s1", signedInAtMs }], [MINUTE]]).activity;
      const result = endSession(before, T0 + MINUTE + TIMING.sessionGapMs + 1, "signed_out");
      expect(result.closed).toEqual({ sessionId: "s1", startedAtMs: T0, endedAtMs: T0 + MINUTE, endReason: "expired", activeSeconds: 60 });
      expect(result.activity.current).toBeNull();
    });

    it("is still a sign-out up to and including the gap", () => {
      const result = endSession(run([0, MINUTE]), T0 + MINUTE + TIMING.sessionGapMs, "signed_out");
      expect(result.closed?.endReason).toBe("signed_out");
      expect(result.closed?.endedAtMs).toBe(T0 + MINUTE + TIMING.sessionGapMs);
      expect(result.credited).toBe(90);
    });

    it("agrees with resolveSessionEnd", () => {
      const before = play([[0, { sessionId: "s1", signedInAtMs: T0 }], [MINUTE, { leaving: true }]]).activity;
      const now = T0 + HOUR;
      expect(endSession(before, now, "signed_out").closed).toEqual(resolveSessionEnd(before.current as CurrentSession, now));
    });
  });

  it("is not changed by the sign-in behind the session: one with a sign-in time is ended by the reason given, like any other", () => {
    const before = play([[0, { sessionId: "s1", signedInAtMs: T0 - HOUR, path: "/portal" }], [MINUTE]]).activity;
    expect(endSession(before, T0 + 2 * MINUTE, "signed_out")).toEqual({
      activity: {
        firstSeenAtMs: T0,
        lastSeenAtMs: T0 + 2 * MINUTE,
        totalActiveSeconds: 120,
        sessionCount: 1,
        current: null,
        today: today(120),
      },
      closed: { sessionId: "s1", startedAtMs: T0, endedAtMs: T0 + 2 * MINUTE, endReason: "signed_out", activeSeconds: 120 },
      started: false,
      newPage: null,
      credited: 60,
      changed: true,
    });
    expect(endSession(before, T0 + 2 * MINUTE, "idle").closed?.endReason).toBe("idle");
    // A sign-in that is old by now makes no difference to a sign-out: it is the quiet rules alone that may say expired.
    const old = play([[0, { sessionId: "s1", signedInAtMs: T0 - TIMING.maxSessionAgeMs }], [MINUTE]]).activity;
    expect(endSession(old, T0 + 2 * MINUTE, "signed_out").closed?.endReason).toBe("signed_out");
    // And once signed out, a beat from any sign-in starts afresh and closes nothing.
    const out = endSession(before, T0 + 2 * MINUTE, "signed_out").activity;
    const back = applyHeartbeat(out, T0 + 3 * MINUTE, { sessionId: "s2", signedInAtMs: T0 + 2 * MINUTE + 30 * SECOND });
    expect(back.closed).toBeNull();
    expect(back.started).toBe(true);
    expect(back.activity.sessionCount).toBe(2);
  });

  it("leaves the person signed out: the next beat starts a new session and closes nothing", () => {
    const out = endSession(run([0, MINUTE]), T0 + 2 * MINUTE, "signed_out").activity;
    const back = applyHeartbeat(out, T0 + 3 * MINUTE, { sessionId: "s2" });
    expect(back.closed).toBeNull();
    expect(back.started).toBe(true);
    expect(back.credited).toBe(0);
    expect(back.activity.sessionCount).toBe(2);
    expect(back.activity.current).toEqual(session(T0 + 3 * MINUTE, T0 + 3 * MINUTE, 0, { sessionId: "s2" }));
    expect(back.activity.totalActiveSeconds).toBe(120);
    expect(back.activity.firstSeenAtMs).toBe(T0);
  });

  it("does not mutate the activity it is given", () => {
    const before = play([[0, { sessionId: "s1", signedInAtMs: T0, path: "/portal" }], [MINUTE]]).activity;
    const snapshot = structuredClone(before);
    endSession(before, T0 + 2 * MINUTE, "signed_out");
    endSession(before, T0 + MINUTE + 5 * SECOND, "idle");
    endSession(before, T0 + HOUR, "signed_out");
    endSession(before, T0 + 24 * HOUR, "idle");
    expect(before).toEqual(snapshot);
  });

  it("keeps the total equal to the sum of every session's time across sign-outs", () => {
    const closed: ClosedSession[] = [];
    let credited = 0;
    const note = (result: HeartbeatResult): Activity => {
      credited += result.credited;
      if (result.closed) closed.push(result.closed);
      return result.activity;
    };
    let activity = emptyActivity();
    activity = note(applyHeartbeat(activity, T0, { sessionId: "s1", path: "/portal" }));
    activity = note(applyHeartbeat(activity, T0 + MINUTE));
    activity = note(endSession(activity, T0 + MINUTE + 30 * SECOND, "signed_out"));
    activity = note(applyHeartbeat(activity, T0 + 10 * MINUTE, { sessionId: "s2" }));
    activity = note(applyHeartbeat(activity, T0 + 11 * MINUTE));
    activity = note(endSession(activity, T0 + 11 * MINUTE + 5 * SECOND, "idle"));
    activity = note(applyHeartbeat(activity, T0 + 20 * MINUTE, { sessionId: "s3" }));
    activity = note(applyHeartbeat(activity, T0 + 21 * MINUTE));
    activity = note(endSession(activity, T0 + HOUR, "signed_out"));
    activity = note(applyHeartbeat(activity, T0 + 2 * HOUR, { sessionId: "s4" }));

    expect(closed.map((session) => [session.sessionId, session.endReason, session.activeSeconds])).toEqual([
      ["s1", "signed_out", 90],
      ["s2", "idle", 60],
      ["s3", "timed_out", 60],
    ]);
    expect(activity.sessionCount).toBe(4);
    expect(activity.current?.sessionId).toBe("s4");
    expect(activity.totalActiveSeconds).toBe(210);
    expect(credited).toBe(210);
    expect(closed.reduce((sum, session) => sum + session.activeSeconds, 0) + (activity.current?.activeSeconds ?? 0)).toBe(210);
  });
});

describe("the day's tally", () => {
  /** Midnight in Los Angeles at the start of 2 October 2026, which is 07:00 UTC. */
  const MIDNIGHT = Date.UTC(2026, 9, 2, 7, 0, 0);

  /** Applies ordinary beats at each instant and returns the tally after each, and the final activity. */
  function tallies(beats: number[]): { seen: Array<Activity["today"]>; activity: Activity } {
    let activity = emptyActivity();
    const seen = beats.map((at) => {
      activity = applyHeartbeat(activity, at).activity;
      return activity.today;
    });
    return { seen, activity };
  }

  it("begins on the first beat with nothing credited yet", () => {
    expect(applyHeartbeat(emptyActivity(), T0).activity.today).toEqual(today(0));
  });

  it("adds up the time credited within one civil day in Los Angeles", () => {
    const { seen } = tallies([T0, T0 + MINUTE, T0 + 2 * MINUTE, T0 + 2 * MINUTE + 10 * SECOND, T0 + 3 * MINUTE]);
    expect(seen).toEqual([today(0), today(60), today(120), today(120), today(180)]);
  });

  it("carries on across a new session on the same day", () => {
    const activity = run([0, MINUTE, HOUR, HOUR + MINUTE]);
    expect(activity.today).toEqual(today(120));
    expect(activity.sessionCount).toBe(2);
  });

  it("starts over at midnight in Los Angeles, while the total carries on", () => {
    const { seen, activity } = tallies([MIDNIGHT - 3 * MINUTE, MIDNIGHT - 2 * MINUTE, MIDNIGHT - MINUTE, MIDNIGHT, MIDNIGHT + MINUTE]);
    expect(seen).toEqual([
      { date: "2026-10-01", activeSeconds: 0 },
      { date: "2026-10-01", activeSeconds: 60 },
      { date: "2026-10-01", activeSeconds: 120 },
      { date: "2026-10-02", activeSeconds: 60 },
      { date: "2026-10-02", activeSeconds: 120 },
    ]);
    expect(activity.totalActiveSeconds).toBe(240);
    expect(activity.sessionCount).toBe(1);
  });

  it("turns at midnight to the millisecond", () => {
    expect(applyHeartbeat(emptyActivity(), MIDNIGHT - 1).activity.today?.date).toBe("2026-10-01");
    expect(applyHeartbeat(emptyActivity(), MIDNIGHT).activity.today?.date).toBe("2026-10-02");
  });

  it("does not start over at midnight UTC", () => {
    const utcMidnight = Date.UTC(2026, 9, 2, 0, 0, 0);
    const { seen } = tallies([utcMidnight - MINUTE, utcMidnight, utcMidnight + MINUTE]);
    expect(seen).toEqual([
      { date: "2026-10-01", activeSeconds: 0 },
      { date: "2026-10-01", activeSeconds: 60 },
      { date: "2026-10-01", activeSeconds: 120 },
    ]);
  });

  it("puts a stretch that straddles midnight on the day its beat arrives", () => {
    const { seen } = tallies([MIDNIGHT - 30 * SECOND, MIDNIGHT + 30 * SECOND]);
    expect(seen).toEqual([
      { date: "2026-10-01", activeSeconds: 0 },
      { date: "2026-10-02", activeSeconds: 60 },
    ]);
  });

  it("starts over on a later day, forgetting the days between", () => {
    const { seen } = tallies([T0, T0 + MINUTE, T0 + 7 * 24 * HOUR, T0 + 7 * 24 * HOUR + MINUTE]);
    expect(seen).toEqual([today(0), today(60), { date: "2026-10-08", activeSeconds: 0 }, { date: "2026-10-08", activeSeconds: 60 }]);
  });

  describe("on the day the clocks go back", () => {
    // 1 November 2026 in Los Angeles is 25 hours long. It begins at 07:00 UTC; the next day begins at 08:00 UTC.
    const NEXT_MIDNIGHT = Date.UTC(2026, 10, 2, 8, 0, 0);

    it("ends at midnight Pacific Standard Time, an hour later by UTC than the day before began", () => {
      expect(applyHeartbeat(emptyActivity(), Date.UTC(2026, 10, 1, 7, 0, 0)).activity.today?.date).toBe("2026-11-01");
      expect(applyHeartbeat(emptyActivity(), Date.UTC(2026, 10, 2, 7, 0, 0)).activity.today?.date).toBe("2026-11-01");
      const { seen } = tallies([NEXT_MIDNIGHT - 2 * MINUTE, NEXT_MIDNIGHT - MINUTE, NEXT_MIDNIGHT, NEXT_MIDNIGHT + MINUTE]);
      expect(seen).toEqual([
        { date: "2026-11-01", activeSeconds: 0 },
        { date: "2026-11-01", activeSeconds: 60 },
        { date: "2026-11-02", activeSeconds: 60 },
        { date: "2026-11-02", activeSeconds: 120 },
      ]);
    });

    it("counts both passes through the repeated hour on the same day", () => {
      const halfPastOneDaylight = Date.UTC(2026, 10, 1, 8, 30, 0);
      const halfPastOneStandard = Date.UTC(2026, 10, 1, 9, 30, 0);
      const { seen, activity } = tallies([halfPastOneDaylight, halfPastOneDaylight + MINUTE, halfPastOneStandard, halfPastOneStandard + MINUTE]);
      expect(seen).toEqual([
        { date: "2026-11-01", activeSeconds: 0 },
        { date: "2026-11-01", activeSeconds: 60 },
        // An hour of silence: a new session, so nothing credited by this beat.
        { date: "2026-11-01", activeSeconds: 60 },
        { date: "2026-11-01", activeSeconds: 120 },
      ]);
      expect(activity.sessionCount).toBe(2);
    });
  });

  it("is left alone by a beat that changes nothing", () => {
    const before = run([0, MINUTE]);
    expect(applyHeartbeat(before, T0 + MINUTE + 5 * SECOND).activity.today).toBe(before.today);
  });

  it("is kept by a resume beat, which credits nothing", () => {
    const before = run([0, MINUTE]);
    expect(applyHeartbeat(before, T0 + 3 * MINUTE, { resume: true }).activity.today).toEqual(today(60));
  });

  it("moves to the new day on an early change of page, which credits nothing", () => {
    const before = applyHeartbeat(emptyActivity(), MIDNIGHT - 10 * SECOND, { path: "/portal" }).activity;
    const result = applyHeartbeat(before, MIDNIGHT, { path: "/portal/account" });
    expect(result.credited).toBe(0);
    expect(result.activity.today).toEqual({ date: "2026-10-02", activeSeconds: 0 });
  });

  it("credits the last stretch of a sign-out to the day the sign-out happens", () => {
    const before = tallies([MIDNIGHT - 2 * MINUTE, MIDNIGHT - MINUTE]).activity;
    expect(before.today).toEqual({ date: "2026-10-01", activeSeconds: 60 });
    const result = endSession(before, MIDNIGHT, "signed_out");
    expect(result.credited).toBe(60);
    expect(result.activity.today).toEqual({ date: "2026-10-02", activeSeconds: 60 });
    expect(result.activity.totalActiveSeconds).toBe(120);
  });

  it("shows the new day, with nothing yet, when a quiet session is closed by a sign-out on a later day", () => {
    const result = endSession(run([0, MINUTE]), T0 + 24 * HOUR, "signed_out");
    expect(result.credited).toBe(0);
    expect(result.activity.today).toEqual({ date: "2026-10-02", activeSeconds: 0 });
    expect(result.activity.totalActiveSeconds).toBe(60);
  });

  it("is carried on from the stored tally when the activity already has one for the day", () => {
    const stored: Activity = { ...run([0, MINUTE]), today: { date: DAY, activeSeconds: 1000 } };
    expect(applyHeartbeat(stored, T0 + 2 * MINUTE).activity.today).toEqual(today(1060));
  });
});

describe("isOnline", () => {
  it("is false for a person who has never been seen", () => {
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
