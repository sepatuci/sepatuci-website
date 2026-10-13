import { isOnline, resolveSessionEnd, type CurrentSession } from "../activity";
import { toIso } from "../dates";
import type { ActivitySessionDto, SessionDto, SessionEndReason } from "../types";
import { iso, isoOrNull, type SessionDoc } from "./store";

/**
 * How a stored session reads at one instant. An open document whose visit
 * has gone quiet is presented as ended by the quiet rules, so that nobody is
 * shown as still around after they stopped.
 */
export interface SessionView {
  /** Null only while the visit is still live. */
  endedAtMs: number | null;
  endReason: SessionEndReason | null;
  /** Open, and nothing has been heard for less than a visit may pause. */
  live: boolean;
  /** Live, and the person was seen within the online window. */
  online: boolean;
}

export function viewSession(
  id: string,
  session: SessionDoc,
  current: CurrentSession | null,
  nowMs: number,
): SessionView {
  if (session.endedAt !== null) {
    return {
      endedAtMs: session.endedAt.toMillis(),
      endReason: session.endReason ?? "timed_out",
      live: false,
      online: false,
    };
  }
  // Open in its document, but the visit in progress only while the profile still points at it.
  if (current === null || current.sessionId !== id) {
    return { endedAtMs: session.lastSeenAt.toMillis(), endReason: "timed_out", live: false, online: false };
  }
  const resolved = resolveSessionEnd(current, nowMs);
  if (resolved) return { endedAtMs: resolved.endedAtMs, endReason: resolved.endReason, live: false, online: false };
  return { endedAtMs: null, endReason: null, live: true, online: isOnline(current.lastSeenAtMs, nowMs) };
}

/** A session as the new member's own page lists it. The visit in progress shows when it was last seen. */
export function sessionDto(
  id: string,
  session: SessionDoc,
  current: CurrentSession | null,
  nowMs: number,
): SessionDto {
  const view = viewSession(id, session, current, nowMs);
  return {
    id,
    startedAt: iso(session.startedAt),
    endedAt: view.endedAtMs === null ? iso(session.lastSeenAt) : toIso(view.endedAtMs),
    endReason: view.endReason,
    activeSeconds: session.activeSeconds,
    pageCount: session.pageCount,
    device: session.device,
    current: view.online,
  };
}

/** A session as the Activity pages list it. */
export function activitySessionDto(
  id: string,
  session: SessionDoc,
  current: CurrentSession | null,
  nowMs: number,
): ActivitySessionDto {
  const view = viewSession(id, session, current, nowMs);
  return {
    id,
    signedInAt: isoOrNull(session.signedInAt),
    startedAt: iso(session.startedAt),
    lastSeenAt: iso(session.lastSeenAt),
    endedAt: view.endedAtMs === null ? null : toIso(view.endedAtMs),
    endReason: view.endReason,
    activeSeconds: session.activeSeconds,
    pageCount: session.pageCount,
    device: session.device,
    current: view.live,
  };
}
