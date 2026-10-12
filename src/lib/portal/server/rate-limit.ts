/**
 * Per-account request ceilings, held in memory. They stop a runaway client or
 * a script on a signed-in account from spending the database quota quickly.
 * Each server instance keeps its own counts, so this slows abuse down rather
 * than ruling it out; docs/portal-setup.md explains what closes the gap.
 * Sign-in attempts are throttled separately by Firebase Authentication.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_TRACKED_KEYS = 5_000;

/**
 * A short ceiling for bursts and a long one for sustained use. Requests that
 * change data have their own, lower pair. The portal's own traffic stays well
 * under all four: a pledge writing for an hour makes about 60 heartbeats and
 * at most 450 autosaves.
 */
export const RATE_LIMITS = {
  perMinute: 120,
  perHour: 1_200,
  writesPerMinute: 30,
  writesPerHour: 720,
} as const;

interface Window {
  startMs: number;
  requests: number;
  writes: number;
}

interface Counter {
  minute: Window;
  hour: Window;
  /** When a refusal for this account was last written to the log. */
  loggedAtMs: number | null;
}

const counters = new Map<string, Counter>();

const fresh = (nowMs: number): Window => ({ startMs: nowMs, requests: 0, writes: 0 });

function current(window: Window, nowMs: number, lengthMs: number): Window {
  return nowMs - window.startMs >= lengthMs ? fresh(nowMs) : window;
}

function prune(nowMs: number): void {
  for (const [key, counter] of counters) {
    if (nowMs - counter.hour.startMs >= HOUR_MS) counters.delete(key);
  }
}

/**
 * Counts one request and returns false when the caller is over a ceiling.
 * Refused requests are counted too, so hammering a limit does not reset it.
 * Going over the ceiling for changes only refuses further changes: reading
 * keeps working, so the pages do not break while autosave is being held back.
 */
export function allowRequest(key: string, nowMs: number, write = false): boolean {
  const existing = counters.get(key);
  if (!existing && counters.size >= MAX_TRACKED_KEYS) prune(nowMs);

  const counter: Counter = {
    minute: current(existing?.minute ?? fresh(nowMs), nowMs, MINUTE_MS),
    hour: current(existing?.hour ?? fresh(nowMs), nowMs, HOUR_MS),
    loggedAtMs: existing?.loggedAtMs ?? null,
  };
  counters.set(key, counter);

  for (const window of [counter.minute, counter.hour]) {
    window.requests += 1;
    if (write) window.writes += 1;
  }
  const withinRequests =
    counter.minute.requests <= RATE_LIMITS.perMinute && counter.hour.requests <= RATE_LIMITS.perHour;
  const withinWrites =
    counter.minute.writes <= RATE_LIMITS.writesPerMinute &&
    counter.hour.writes <= RATE_LIMITS.writesPerHour;
  return withinRequests && (!write || withinWrites);
}

/**
 * True at most once a minute per account, so a refused account leaves one line
 * in the log to find it by instead of one per request.
 */
export function shouldLogRefusal(key: string, nowMs: number): boolean {
  const counter = counters.get(key);
  if (!counter) return false;
  if (counter.loggedAtMs !== null && nowMs - counter.loggedAtMs < MINUTE_MS) return false;
  counter.loggedAtMs = nowMs;
  return true;
}

/** For tests. */
export function resetRateLimits(): void {
  counters.clear();
}
