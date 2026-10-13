"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useServerNow } from "@/components/PortalComponents/portal-session";
import { Card, Chip, ErrorNote, LoadingBlock, PageHeader, StatTile } from "@/components/PortalComponents/primitives";
import { useApi } from "@/lib/portal/client/use-api";
import { formatDateTime, formatDuration, formatRelative, msOrNull } from "@/lib/portal/dates";
import type { SessionDetailDto } from "@/lib/portal/types";
import { cn } from "@/lib/utils";
import { END_LABELS, sessionLengthSeconds } from "./activity-person";

interface Entry {
  key: string;
  at: string;
  title: string;
  /** The page's path, or another small detail under the title. */
  detail: string | null;
  /** How long the page stayed open. */
  dwellSeconds: number | null;
  current: boolean;
}

/** One session, as a timeline: the sign-in, every page in order, and how it ended. */
export const ActivitySession: React.FC<{ uid: string; sessionId: string }> = ({ uid, sessionId }) => {
  const nowMs = useServerNow();
  const { data, error, loading, reload } = useApi<SessionDetailDto>(`/admin/activity/${uid}/sessions/${sessionId}`);

  const back = (
    <Link
      href={`/portal/admin/activity/${uid}`}
      className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      All sessions
    </Link>
  );

  if (loading && !data) return <>{back}<LoadingBlock label="Loading the session" /></>;
  if (error && !data) return <>{back}<ErrorNote error={error} onRetry={reload} /></>;
  if (!data) return null;

  const { person, session, pages, pageLogFull } = data;
  const lastSeenMs = msOrNull(session.lastSeenAt);

  const entries: Entry[] = [];
  if (session.signedInAt) {
    entries.push({
      key: "signed-in",
      at: session.signedInAt,
      title: "Signed in",
      detail: session.device || null,
      dwellSeconds: null,
      current: false,
    });
  }
  entries.push({
    key: "started",
    at: session.startedAt,
    title: "Session started",
    detail: session.signedInAt ? null : session.device || null,
    dwellSeconds: null,
    current: false,
  });
  for (const [index, page] of pages.entries()) {
    entries.push({
      key: `page-${index}`,
      at: page.at,
      title: page.label,
      detail: page.path,
      dwellSeconds: page.dwellSeconds,
      current: page.current,
    });
  }
  if (session.endReason) {
    entries.push({
      key: "ended",
      at: session.endedAt ?? session.lastSeenAt,
      title: END_LABELS[session.endReason],
      detail: null,
      dwellSeconds: null,
      current: false,
    });
  } else {
    entries.push({
      key: "open",
      at: session.lastSeenAt,
      title: "Still open",
      detail: `Last seen ${lastSeenMs === null ? "just now" : formatRelative(lastSeenMs, nowMs)}`,
      dwellSeconds: null,
      current: true,
    });
  }

  return (
    <>
      {back}
      <PageHeader
        title={person.displayName}
        subtitle={`Session of ${formatDateTime(session.startedAt, true)}${session.device ? `, ${session.device}` : ""}`}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Length" value={formatDuration(sessionLengthSeconds(session))} />
        <StatTile label="Active" value={formatDuration(session.activeSeconds)} hint="Tab open and in view" />
        <StatTile label="Pages" value={String(session.pageCount)} />
        <StatTile
          label="Ended"
          value={session.endReason ? END_LABELS[session.endReason] : "Still open"}
          hint={session.endedAt ? formatDateTime(session.endedAt, true) : undefined}
        />
      </div>

      <h2 className="mb-3 mt-10 text-sm font-medium uppercase tracking-wider text-muted-foreground">Timeline</h2>
      <Card className="px-5 py-5">
        {pages.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">No pages were recorded for this session.</p>
        ) : null}
        <ol className="relative ml-1.5 border-l border-border">
          {entries.map((entry) => (
            <li key={entry.key} className="relative pb-6 pl-6 last:pb-0">
              <span
                aria-hidden
                className={cn(
                  "absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border",
                  entry.current ? "border-success-border bg-success-subtle" : "border-border bg-card",
                )}
              />
              <p className="text-xs text-muted-foreground">{formatDateTime(entry.at, true)}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-foreground">
                {entry.title}
                {entry.current && entry.dwellSeconds !== null ? <Chip tone="success">Now</Chip> : null}
              </p>
              {entry.detail ? (
                <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">{entry.detail}</p>
              ) : null}
              {entry.dwellSeconds !== null ? (
                <p className="mt-0.5 text-xs text-muted-foreground">Open for {formatDuration(entry.dwellSeconds)}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>
      {pageLogFull ? (
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          Page log full: later pages were counted but not listed.
        </p>
      ) : null}
    </>
  );
};
