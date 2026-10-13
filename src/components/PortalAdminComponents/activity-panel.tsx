"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity as ActivityIcon, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useServerNow } from "@/components/PortalComponents/portal-session";
import {
  ACCOUNT_CHIPS,
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  PageHeader,
  StatTile,
} from "@/components/PortalComponents/primitives";
import { useApi } from "@/lib/portal/client/use-api";
import { formatDuration, formatRelative, msOrNull } from "@/lib/portal/dates";
import type { ActivityOverviewDto, ActivityPersonDto, Role } from "@/lib/portal/types";
import { cn } from "@/lib/utils";
import AuditTable from "./audit-table";

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", active: "Active", pledge: "New member" };

type Tab = "sessions" | "log";
type RoleFilter = "all" | Role;

const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: "sessions", label: "Sessions" },
  { value: "log", label: "Admin log" },
];

const ROLE_FILTERS: ReadonlyArray<{ value: RoleFilter; label: string }> = [
  { value: "all", label: "Everyone" },
  { value: "admin", label: "Admins" },
  { value: "active", label: "Actives" },
  { value: "pledge", label: "New members" },
];

/** The day's clock, in words people use. */
export function zoneName(timeZone: string): string {
  return timeZone === "America/Los_Angeles" ? "Pacific time" : timeZone.replace(/_/g, " ");
}

/** One line on where someone is now, or when they were last around. */
export function presenceLine(person: ActivityPersonDto, nowMs: number): string {
  if (person.online) return person.currentPageLabel ? `On ${person.currentPageLabel}` : "Online now";
  const lastSeenMs = msOrNull(person.lastSeenAt);
  if (lastSeenMs !== null) return `Last seen ${formatRelative(lastSeenMs, nowMs)}`;
  const lastSignInMs = msOrNull(person.lastSignInAt);
  if (lastSignInMs !== null) return `Signed in ${formatRelative(lastSignInMs, nowMs)}, no visit recorded yet`;
  return "Never signed in";
}

/** A small labelled number, for rows that have to fit a phone. */
export const Figure: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-[4.5rem]">
    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-0.5 text-sm text-foreground">{value}</p>
  </div>
);

/** The admin Activity page: who has been in the portal, and the log of admin changes. */
export const ActivityPanel: React.FC = () => {
  const nowMs = useServerNow();
  const [tab, setTab] = useState<Tab>("sessions");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const { data, error, loading, reload } = useApi<ActivityOverviewDto>("/admin/activity");

  // "Online" and "last seen" go stale quickly, so the list refreshes itself while it is in view.
  useEffect(() => {
    if (tab !== "sessions") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [reload, tab]);

  const people = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.people ?? []).filter((person) => {
      if (roleFilter !== "all" && person.role !== roleFilter) return false;
      return (
        needle.length === 0 ||
        person.displayName.toLowerCase().includes(needle) ||
        person.email.toLowerCase().includes(needle)
      );
    });
  }, [data, query, roleFilter]);

  const header = (
    <PageHeader
      title="Activity"
      subtitle="Who has been in the portal, when, and on which pages. Open a person to see each of their sessions."
    />
  );

  const tabs = (
    <div role="tablist" aria-label="Activity view" className="mb-5 inline-flex rounded-lg border border-border p-0.5">
      {TABS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          id={`activity-tab-${option.value}`}
          aria-selected={tab === option.value}
          onClick={() => setTab(option.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            tab === option.value ? "bg-accent/20 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  if (tab === "log") {
    return (
      <>
        {header}
        {tabs}
        <AuditTable withHeader={false} />
      </>
    );
  }
  if (loading && !data) return <>{header}{tabs}<LoadingBlock label="Loading activity" /></>;
  if (error && !data) return <>{header}{tabs}<ErrorNote error={error} onRetry={reload} /></>;
  if (!data) return null;

  const everyone = data.people;
  const online = everyone.filter((person) => person.online).length;
  const activeToday = everyone.filter((person) => person.todayActiveSeconds > 0).length;
  const timeToday = everyone.reduce((sum, person) => sum + person.todayActiveSeconds, 0);
  const visited = everyone.filter((person) => person.lastSeenAt !== null).length;

  if (visited === 0) {
    return (
      <>
        {header}
        {tabs}
        <EmptyState
          icon={<ActivityIcon className="h-8 w-8" />}
          title="Nobody has been in yet"
          body="From the first sign-in, this page shows when each person was in, what they opened, and how each visit ended."
        />
      </>
    );
  }

  return (
    <>
      {header}
      {tabs}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Online now" value={String(online)} />
        <StatTile
          label="Active today"
          value={String(activeToday)}
          hint={`Of ${everyone.length} ${everyone.length === 1 ? "account" : "accounts"}`}
        />
        <StatTile label="Time today" value={formatDuration(timeToday)} hint={`Since midnight, ${zoneName(data.timeZone)}`} />
        <StatTile label="Have been in" value={String(visited)} hint="At least once" />
      </div>

      <div className="mb-3 mt-8 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search people"
            placeholder="Search by name or email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 pl-9"
          />
        </div>
        <select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(event) => {
            const chosen = ROLE_FILTERS.find((option) => option.value === event.target.value);
            setRoleFilter(chosen ? chosen.value : "all");
          }}
          className="h-10 rounded-lg border border-border bg-field px-3 text-sm text-foreground"
        >
          {ROLE_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">
          {people.length} of {everyone.length}
        </p>
      </div>

      {people.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
          No one matches{query.trim() ? <> &quot;{query.trim()}&quot;</> : " this filter"}.
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {people.map((person) => {
            const chip = ACCOUNT_CHIPS[person.accountState];
            return (
              <Link
                key={person.uid}
                href={`/portal/admin/activity/${person.uid}`}
                className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{person.displayName}</span>
                    <Chip tone={person.role === "admin" ? "accent" : "neutral"}>{ROLE_LABEL[person.role]}</Chip>
                    {person.online ? <Chip tone="success">Online now</Chip> : null}
                    {person.accountState !== "active" ? <Chip tone={chip.tone}>{chip.label}</Chip> : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{person.email}</p>
                  <p className="mt-1 text-sm text-foreground/90">{presenceLine(person, nowMs)}</p>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <Figure label="Today" value={formatDuration(person.todayActiveSeconds)} />
                  <Figure label="Total" value={formatDuration(person.totalActiveSeconds)} />
                  <Figure label="Sessions" value={String(person.sessionCount)} />
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            );
          })}
        </Card>
      )}
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        Time counts only minutes with a portal tab open and in view. The day runs by {zoneName(data.timeZone)}.
      </p>
    </>
  );
};
