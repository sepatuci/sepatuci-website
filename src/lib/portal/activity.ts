import { TIMING } from "./constants";

/**
 * Time-on-site tracking. The browser sends a heartbeat about once a minute
 * while a portal tab is visible. Each beat credits the time since the previous
 * one, capped, so a closed laptop or a forgotten tab does not count as time
 * spent. All times come from the server clock.
 *
 * A session is a run of beats with no gap longer than TIMING.sessionGapMs. It
 * ends only by going quiet, never on request, so reloading a page or signing
 * out and straight back in continues the same session instead of starting a
 * new one, and a script cannot mint sessions faster than one per gap.
 */

export interface CurrentSession {
  startedAtMs: number;
  lastSeenAtMs: number;
  activeSeconds: number;
}

export interface Activity {
  firstSeenAtMs: number | null;
  lastSeenAtMs: number | null;
  totalActiveSeconds: number;
  sessionCount: number;
  /** The most recent session. It stays here until a later visit shows that it ended. */
  current: CurrentSession | null;
}

export interface ClosedSession {
  startedAtMs: number;
  endedAtMs: number;
  activeSeconds: number;
}

export interface HeartbeatResult {
  activity: Activity;
  /** A session that this beat found to be over and that should be written to history. */
  closed: ClosedSession | null;
  /** Seconds of activity this beat added. */
  credited: number;
  /** False when the beat arrived too soon after the last one to be worth a write. */
  changed: boolean;
}

export function emptyActivity(): Activity {
  return {
    firstSeenAtMs: null,
    lastSeenAtMs: null,
    totalActiveSeconds: 0,
    sessionCount: 0,
    current: null,
  };
}

export interface HeartbeatOptions {
  /**
   * The tab has just become visible again. Marks the pledge as present without
   * crediting the time the tab spent hidden.
   */
  resume?: boolean;
}

export function applyHeartbeat(
  activity: Activity,
  nowMs: number,
  options: HeartbeatOptions = {},
): HeartbeatResult {
  const current = activity.current;
  const firstSeenAtMs = activity.firstSeenAtMs ?? nowMs;

  // No session yet, or the last one went quiet long enough to have ended.
  if (!current || nowMs - current.lastSeenAtMs > TIMING.sessionGapMs) {
    return {
      activity: {
        firstSeenAtMs,
        lastSeenAtMs: nowMs,
        totalActiveSeconds: activity.totalActiveSeconds,
        sessionCount: activity.sessionCount + 1,
        current: { startedAtMs: nowMs, lastSeenAtMs: nowMs, activeSeconds: 0 },
      },
      closed: current
        ? {
            startedAtMs: current.startedAtMs,
            endedAtMs: current.lastSeenAtMs,
            activeSeconds: current.activeSeconds,
          }
        : null,
      credited: 0,
      changed: true,
    };
  }

  const elapsedMs = Math.max(0, nowMs - current.lastSeenAtMs);
  if (elapsedMs < TIMING.heartbeatMinIntervalMs) {
    return { activity, closed: null, credited: 0, changed: false };
  }

  const credited =
    options.resume === true
      ? 0
      : Math.min(Math.round(elapsedMs / 1000), TIMING.heartbeatMaxCreditSeconds);
  return {
    activity: {
      firstSeenAtMs,
      lastSeenAtMs: nowMs,
      totalActiveSeconds: activity.totalActiveSeconds + credited,
      sessionCount: activity.sessionCount,
      current: {
        startedAtMs: current.startedAtMs,
        lastSeenAtMs: nowMs,
        activeSeconds: current.activeSeconds + credited,
      },
    },
    closed: null,
    credited,
    changed: true,
  };
}

export function isOnline(lastSeenAtMs: number | null, nowMs: number): boolean {
  return lastSeenAtMs !== null && nowMs - lastSeenAtMs <= TIMING.onlineWindowMs;
}
