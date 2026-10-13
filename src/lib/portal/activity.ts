import { LIMITS, PORTAL_TIME_ZONE, TIMING } from "./constants";
import { civilDate } from "./day";
import type { SessionEndReason } from "./types";

/**
 * Time-on-site tracking. The browser sends a heartbeat about once a minute
 * while a portal tab is visible, and one more whenever the page changes. Each
 * beat credits the time since the previous one, capped, so a closed laptop or
 * a forgotten tab does not count as time spent. All times come from the server
 * clock.
 *
 * A session is a run of beats with no gap longer than TIMING.sessionGapMs. It
 * ends when the person signs out, or by going quiet: a tab closed, a laptop
 * shut, or a sign-in that ran out. Each session keeps the pages it visited, up
 * to LIMITS.sessionPages of them.
 */

export interface CurrentSession {
  /** The session's own document. Null only for one begun before sessions had documents. */
  sessionId: string | null;
  /** When the sign-in behind this session happened. */
  signedInAtMs: number | null;
  startedAtMs: number;
  lastSeenAtMs: number;
  activeSeconds: number;
  /** The last page reported, so the same page is not logged twice in a row. */
  lastPath: string | null;
  /** Pages logged for this session so far. */
  pageCount: number;
  /** True once the tab said it was closing and nothing has been heard since. */
  leaving: boolean;
}

export interface DayTally {
  /** A civil date in the portal's time zone, YYYY-MM-DD. */
  date: string;
  activeSeconds: number;
}

export interface Activity {
  firstSeenAtMs: number | null;
  lastSeenAtMs: number | null;
  totalActiveSeconds: number;
  sessionCount: number;
  /** The most recent session. It stays here until a later visit or a sign-out ends it. */
  current: CurrentSession | null;
  /** Activity on the most recent day there was any. */
  today: DayTally | null;
}

export interface ClosedSession {
  sessionId: string | null;
  startedAtMs: number;
  endedAtMs: number;
  endReason: SessionEndReason;
  activeSeconds: number;
}

export interface PageVisit {
  path: string;
  atMs: number;
}

export interface HeartbeatResult {
  activity: Activity;
  /** A session that this beat found to be over, or ended, and that should be closed in history. */
  closed: ClosedSession | null;
  /** True when this beat began a new session. */
  started: boolean;
  /** A page to add to the current session's log. */
  newPage: PageVisit | null;
  /** Seconds of activity this beat added. */
  credited: number;
  /** False when the beat changed nothing worth a write. */
  changed: boolean;
}

export function emptyActivity(): Activity {
  return {
    firstSeenAtMs: null,
    lastSeenAtMs: null,
    totalActiveSeconds: 0,
    sessionCount: 0,
    current: null,
    today: null,
  };
}

export interface HeartbeatOptions {
  /**
   * The tab has just become visible again. Marks the person as present without
   * crediting the time the tab spent hidden.
   */
  resume?: boolean;
  /** The tab is closing or navigating away. Nothing more may be heard from it. */
  leaving?: boolean;
  /** The portal page the tab is on, already validated by the caller. */
  path?: string | null;
  /** When the sign-in behind this beat happened. */
  signedInAtMs?: number | null;
  /** The document id to give a session this beat starts. The caller owns the ids. */
  sessionId?: string | null;
}

const unchanged = (activity: Activity): HeartbeatResult => ({
  activity,
  closed: null,
  started: false,
  newPage: null,
  credited: 0,
  changed: false,
});

/** True once nothing has been heard for longer than a session may pause. */
export function isQuiet(current: CurrentSession, nowMs: number): boolean {
  return nowMs - current.lastSeenAtMs > TIMING.sessionGapMs;
}

/**
 * How a session that has gone quiet ended, and when. The same rule serves
 * when a later beat closes it and when an admin reads it, so a session is
 * never shown as open after it stopped. Null while it is still live.
 */
export function resolveSessionEnd(current: CurrentSession, nowMs: number): ClosedSession | null {
  if (!isQuiet(current, nowMs)) return null;
  const signInRanOut =
    current.signedInAtMs !== null &&
    current.lastSeenAtMs + TIMING.sessionGapMs >= current.signedInAtMs + TIMING.maxSessionAgeMs;
  const endReason: SessionEndReason = signInRanOut ? "expired" : current.leaving ? "left" : "timed_out";
  return {
    sessionId: current.sessionId,
    startedAtMs: current.startedAtMs,
    endedAtMs: current.lastSeenAtMs,
    endReason,
    activeSeconds: current.activeSeconds,
  };
}

/**
 * How a session ended when the next beat comes from a different sign-in: the
 * old sign-in ran out, or was ended without a sign-out reaching the server (a
 * token refused after a role change, say). Either way it ended when last seen.
 */
function endedByNewSignIn(current: CurrentSession, nowMs: number): ClosedSession {
  const ranOut = current.signedInAtMs !== null && nowMs >= current.signedInAtMs + TIMING.maxSessionAgeMs;
  return {
    sessionId: current.sessionId,
    startedAtMs: current.startedAtMs,
    endedAtMs: current.lastSeenAtMs,
    endReason: ranOut ? "expired" : "signed_out",
    activeSeconds: current.activeSeconds,
  };
}

/**
 * True when this beat comes from a newer sign-in than the session in progress.
 * Only a newer one counts: a person with the portal open on two devices beats
 * from both in turn, and the older sign-in's beats then belong to the session
 * the newer one started rather than starting one of their own each time.
 */
function fromNewerSignIn(current: CurrentSession, options: HeartbeatOptions): boolean {
  return (
    typeof options.signedInAtMs === "number" &&
    current.signedInAtMs !== null &&
    options.signedInAtMs > current.signedInAtMs
  );
}

/** The day's tally for an instant: carried on within the same civil date, started afresh on a new one. */
function tallyFor(activity: Activity, nowMs: number): DayTally {
  const date = civilDate(nowMs, PORTAL_TIME_ZONE);
  return activity.today !== null && activity.today.date === date ? activity.today : { date, activeSeconds: 0 };
}

const credit = (elapsedMs: number): number =>
  Math.min(Math.round(elapsedMs / 1000), TIMING.heartbeatMaxCreditSeconds);

export function applyHeartbeat(
  activity: Activity,
  nowMs: number,
  options: HeartbeatOptions = {},
): HeartbeatResult {
  const current = activity.current;
  const firstSeenAtMs = activity.firstSeenAtMs ?? nowMs;
  const path = options.path ?? null;
  const leaving = options.leaving === true;
  const today = tallyFor(activity, nowMs);

  // No session yet, the last one went quiet long enough to have ended, or this
  // beat comes from a new sign-in, which is a new session whatever the gap.
  if (!current || isQuiet(current, nowMs) || fromNewerSignIn(current, options)) {
    return {
      activity: {
        firstSeenAtMs,
        lastSeenAtMs: nowMs,
        totalActiveSeconds: activity.totalActiveSeconds,
        sessionCount: activity.sessionCount + 1,
        current: {
          sessionId: options.sessionId ?? null,
          signedInAtMs: options.signedInAtMs ?? null,
          startedAtMs: nowMs,
          lastSeenAtMs: nowMs,
          activeSeconds: 0,
          lastPath: path,
          pageCount: path === null ? 0 : 1,
          leaving,
        },
        today,
      },
      closed: current ? (resolveSessionEnd(current, nowMs) ?? endedByNewSignIn(current, nowMs)) : null,
      started: true,
      newPage: path === null ? null : { path, atMs: nowMs },
      credited: 0,
      changed: true,
    };
  }

  const elapsedMs = Math.max(0, nowMs - current.lastSeenAtMs);
  const pageChanged = path !== null && path !== current.lastPath;
  // Past the cap the page is still remembered as the last one, so it is not
  // logged again later, but it is not added to the log.
  const newPage = pageChanged && current.pageCount < LIMITS.sessionPages ? { path, atMs: nowMs } : null;
  const withPage: CurrentSession = {
    ...current,
    lastPath: pageChanged ? path : current.lastPath,
    pageCount: current.pageCount + (newPage ? 1 : 0),
    leaving,
  };

  if (elapsedMs < TIMING.heartbeatMinIntervalMs) {
    // Too soon to credit time. Only a change of page, or the tab saying it is
    // leaving, is worth a write; the time is credited by the next full beat.
    if (!pageChanged && leaving === current.leaving) return unchanged(activity);
    return {
      activity: { ...activity, current: withPage, today },
      closed: null,
      started: false,
      newPage,
      credited: 0,
      changed: true,
    };
  }

  const credited = options.resume === true ? 0 : credit(elapsedMs);
  return {
    activity: {
      firstSeenAtMs,
      lastSeenAtMs: nowMs,
      totalActiveSeconds: activity.totalActiveSeconds + credited,
      sessionCount: activity.sessionCount,
      current: { ...withPage, lastSeenAtMs: nowMs, activeSeconds: current.activeSeconds + credited },
      today: { date: today.date, activeSeconds: today.activeSeconds + credited },
    },
    closed: null,
    started: false,
    newPage,
    credited,
    changed: true,
  };
}

/**
 * Ends the current session on request: choosing "Sign out", or a tab signing
 * itself out after sitting idle. The last stretch of the visit is credited
 * first. A session that had already gone quiet is closed by the quiet rules
 * instead, so the reason recorded is always what actually happened.
 */
export function endSession(
  activity: Activity,
  nowMs: number,
  reason: Extract<SessionEndReason, "signed_out" | "idle">,
): HeartbeatResult {
  const current = activity.current;
  if (!current) return unchanged(activity);
  const today = tallyFor(activity, nowMs);

  const quiet = resolveSessionEnd(current, nowMs);
  if (quiet) {
    return {
      activity: { ...activity, current: null, today },
      closed: quiet,
      started: false,
      newPage: null,
      credited: 0,
      changed: true,
    };
  }

  const elapsedMs = Math.max(0, nowMs - current.lastSeenAtMs);
  const credited = elapsedMs < TIMING.heartbeatMinIntervalMs ? 0 : credit(elapsedMs);
  return {
    activity: {
      firstSeenAtMs: activity.firstSeenAtMs ?? nowMs,
      lastSeenAtMs: nowMs,
      totalActiveSeconds: activity.totalActiveSeconds + credited,
      sessionCount: activity.sessionCount,
      current: null,
      today: { date: today.date, activeSeconds: today.activeSeconds + credited },
    },
    closed: {
      sessionId: current.sessionId,
      startedAtMs: current.startedAtMs,
      endedAtMs: nowMs,
      endReason: reason,
      activeSeconds: current.activeSeconds + credited,
    },
    started: false,
    newPage: null,
    credited,
    changed: true,
  };
}

export function isOnline(lastSeenAtMs: number | null, nowMs: number): boolean {
  return lastSeenAtMs !== null && nowMs - lastSeenAtMs <= TIMING.onlineWindowMs;
}
