"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServerNow } from "@/components/PortalComponents/portal-session";
import {
  ACCOUNT_CHIPS,
  Card,
  Chip,
  ErrorNote,
  LoadingBlock,
  PageHeader,
  StatTile,
} from "@/components/PortalComponents/primitives";
import { useApi } from "@/lib/portal/client/use-api";
import { LIMITS } from "@/lib/portal/constants";
import { formatDateTime, formatDuration, formatRelative, msOrNull } from "@/lib/portal/dates";
import type { ActivityPersonDetailDto, ActivitySessionDto, SessionEndReason } from "@/lib/portal/types";
import { Figure, presenceLine, ROLE_LABEL } from "./activity-panel";

export const END_LABELS: Record<SessionEndReason, string> = {
  signed_out: "Signed out",
  idle: "Signed out after being idle",
  left: "Closed the tab",
  timed_out: "Went quiet",
  expired: "Sign-in expired",
};

/** How a session ended, or that it is still going. */
export function endLine(session: ActivitySessionDto, nowMs: number): string {
  if (session.endReason) return END_LABELS[session.endReason];
  const lastSeenMs = msOrNull(session.lastSeenAt);
  return `Still open, last seen ${lastSeenMs === null ? "just now" : formatRelative(lastSeenMs, nowMs)}`;
}

/** From the first beat to the last one heard, in seconds. */
export function sessionLengthSeconds(session: ActivitySessionDto): number {
  const startMs = msOrNull(session.startedAt) ?? 0;
  const endMs = msOrNull(session.endedAt) ?? msOrNull(session.lastSeenAt) ?? startMs;
  return Math.max(0, (endMs - startMs) / 1000);
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="mb-3 mt-10 text-sm font-medium uppercase tracking-wider text-muted-foreground">{children}</h2>
);

/** One person's sessions, newest first, each opening to the pages they visited. */
export const ActivityPerson: React.FC<{ uid: string }> = ({ uid }) => {
  const nowMs = useServerNow();
  const { data, error, loading, reload } = useApi<ActivityPersonDetailDto>(`/admin/activity/${uid}`);

  const back = (
    <Link
      href="/portal/admin/activity"
      className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      All activity
    </Link>
  );

  if (loading && !data) return <>{back}<LoadingBlock label="Loading activity" /></>;
  if (error && !data) return <>{back}<ErrorNote error={error} onRetry={reload} /></>;
  if (!data) return null;

  const { person, sessions } = data;
  const chip = ACCOUNT_CHIPS[person.accountState];

  return (
    <>
      {back}
      <PageHeader
        title={person.displayName}
        subtitle={person.email}
        actions={
          person.role === "pledge" ? (
            <Button variant="outline" asChild>
              <Link href={`/portal/admin/pledges/${person.uid}`}>Pledge&apos;s page</Link>
            </Button>
          ) : undefined
        }
      />
      <div className="-mt-4 mb-6 flex flex-wrap items-center gap-2">
        <Chip tone={person.role === "admin" ? "accent" : "neutral"}>{ROLE_LABEL[person.role]}</Chip>
        <Chip tone={chip.tone}>{chip.label}</Chip>
        {person.online ? <Chip tone="success">Online now</Chip> : null}
        <span className="text-sm text-muted-foreground">{presenceLine(person, nowMs)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Time today" value={formatDuration(person.todayActiveSeconds)} />
        <StatTile label="Total time" value={formatDuration(person.totalActiveSeconds)} />
        <StatTile label="Sessions" value={String(person.sessionCount)} />
        <StatTile
          label="Last signed in"
          value={person.lastSignInAt ? formatDateTime(person.lastSignInAt) : "Never"}
          hint={person.firstSeenAt ? `First visit ${formatDateTime(person.firstSeenAt, true)}` : undefined}
        />
      </div>

      <SectionTitle>Sessions</SectionTitle>
      {sessions.length === 0 ? (
        <Card className="px-5 py-8 text-center text-sm text-muted-foreground">
          {person.displayName} hasn&apos;t opened the portal yet.
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/portal/admin/activity/${person.uid}/${session.id}`}
              className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-sm text-foreground">
                  {formatDateTime(session.startedAt, true)}
                  <span className="text-muted-foreground"> to </span>
                  {session.endedAt ? formatDateTime(session.endedAt, true) : "now"}
                  {session.current ? <Chip tone="success" className="ml-2">Open</Chip> : null}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {endLine(session, nowMs)}
                  {session.device ? ` on ${session.device}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <Figure label="Length" value={formatDuration(sessionLengthSeconds(session))} />
                <Figure label="Active" value={formatDuration(session.activeSeconds)} />
                <Figure label="Pages" value={String(session.pageCount)} />
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </Card>
      )}
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        &quot;Active&quot; counts only time with the portal tab open and in view.
        {sessions.length >= LIMITS.sessionHistory
          ? ` Only the most recent ${LIMITS.sessionHistory} sessions are shown.`
          : ""}
      </p>
    </>
  );
};
