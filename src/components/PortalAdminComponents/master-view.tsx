"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight, Search, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerNow } from "@/components/PortalComponents/portal-session";
import {
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  PageHeader,
  ProgressBar,
  StatTile,
  type Tone,
} from "@/components/PortalComponents/primitives";
import { isOnline } from "@/lib/portal/activity";
import { useApi } from "@/lib/portal/client/use-api";
import { formatDuration, formatRelative, msOrNull } from "@/lib/portal/dates";
import { standingFor, type Standing } from "@/lib/portal/progress";
import type {
  AccountState,
  AdminOverviewDto,
  PledgeRowDto,
} from "@/lib/portal/types";
import { cn } from "@/lib/utils";
import { ProgressMatrix } from "@/components/PortalComponents/progress-matrix";
import BulkAddDialog from "./bulk-add-dialog";
import CreatePledgeDialog from "./create-pledge-dialog";
import GettingStarted from "./getting-started";

export const ACCOUNT_CHIPS: Record<AccountState, { label: string; tone: Tone }> = {
  active: { label: "Set up", tone: "success" },
  invited: { label: "Invited", tone: "neutral" },
  needs_mfa: { label: "Needs two-step", tone: "warning" },
  disabled: { label: "Disabled", tone: "danger" },
};

type SortKey = "name" | "team" | "progress" | "seen" | "time";

interface Row extends Standing {
  pledge: PledgeRowDto;
  /** Null for a pledge working individually. */
  teamName: string | null;
  lastSeenMs: number | null;
}

/** Team filter values that are not a team id. */
const ALL_TEAMS = "all";
const NO_TEAM = "none";

const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: "name", label: "Pledge" },
  { key: "team", label: "Team" },
  { key: null, label: "Account" },
  { key: "progress", label: "Progress", className: "min-w-[13rem]" },
  { key: "seen", label: "Last seen" },
  { key: "time", label: "Time on site" },
  { key: null, label: "Sessions" },
  { key: null, label: "Punishments" },
];

function compare(a: Row, b: Row, key: SortKey): number {
  switch (key) {
    case "team":
      // Teams in name order, with individual pledges after them.
      if (a.teamName === b.teamName) return a.pledge.displayName.localeCompare(b.pledge.displayName);
      if (a.teamName === null) return 1;
      if (b.teamName === null) return -1;
      return a.teamName.localeCompare(b.teamName);
    case "progress":
      return a.progress.completionPct - b.progress.completionPct;
    case "seen":
      return (a.lastSeenMs ?? 0) - (b.lastSeenMs ?? 0);
    case "time":
      return a.pledge.activity.totalActiveSeconds - b.pledge.activity.totalActiveSeconds;
    default:
      return a.pledge.displayName.localeCompare(b.pledge.displayName);
  }
}

/** The admin home: every pledge, where they stand, and how much they have been using the portal. */
const MasterView: React.FC = () => {
  const nowMs = useServerNow();
  const { data, error, loading, reload } = useApi<AdminOverviewDto>("/admin/pledges");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"table" | "matrix">("table");
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({
    key: "name",
    ascending: true,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [teamFilter, setTeamFilter] = useState<string>(ALL_TEAMS);

  // "Online" and "last seen" go stale quickly, so the page refreshes itself,
  // except under an open dialog, where the list changing would be a distraction.
  const dialogOpen = createOpen || bulkOpen;
  useEffect(() => {
    if (dialogOpen) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [reload, dialogOpen]);

  const publishedForms = useMemo(
    () =>
      (data?.forms ?? [])
        .filter((form) => form.status === "published")
        .sort((a, b) => {
          const [dueA, dueB] = [a.settings.dueAt, b.settings.dueAt];
          if (dueA === dueB) return a.title.localeCompare(b.title);
          if (dueA === null) return 1;
          if (dueB === null) return -1;
          return dueA < dueB ? -1 : 1;
        }),
    [data],
  );

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const teamNames = new Map(data.teams.map((team) => [team.id, team.name]));
    return data.pledges.map((pledge) => ({
      pledge,
      teamName: (pledge.teamId ? teamNames.get(pledge.teamId) : undefined) ?? null,
      lastSeenMs: msOrNull(pledge.activity.lastSeenAt),
      ...standingFor(pledge, data.forms, nowMs),
    }));
  }, [data, nowMs]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (teamFilter === NO_TEAM && row.teamName !== null) return false;
      if (teamFilter !== ALL_TEAMS && teamFilter !== NO_TEAM && row.pledge.teamId !== teamFilter) {
        return false;
      }
      return (
        needle.length === 0 ||
        row.pledge.displayName.toLowerCase().includes(needle) ||
        row.pledge.email.toLowerCase().includes(needle)
      );
    });
    return [...filtered].sort((a, b) => compare(a, b, sort.key) * (sort.ascending ? 1 : -1));
  }, [rows, query, sort, teamFilter]);

  const header = (
    <PageHeader
      title="Pledges"
      subtitle="Everyone in Founder's Education, their deliverables and their activity."
      actions={
        <>
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            Add several
          </Button>
          <Button variant="accent" onClick={() => setCreateOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add pledge
          </Button>
        </>
      }
    />
  );
  // Keyed, so the dialogs stay mounted (and keep what they are showing) when
  // the page behind them changes from its empty state to the full list.
  const dialog = (
    <Fragment key="dialogs">
      <CreatePledgeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={reload}
        teams={data?.teams ?? []}
      />
      <BulkAddDialog open={bulkOpen} onOpenChange={setBulkOpen} kind="pledge" onDone={reload} />
    </Fragment>
  );

  if (loading && !data) return <>{header}<LoadingBlock label="Loading pledges" /></>;
  if (error && !data) return <>{header}<ErrorNote error={error} onRetry={reload} /></>;
  if (!data) return null;

  const enabled = rows.filter((row) => row.pledge.status === "active");
  const average =
    enabled.length > 0
      ? Math.round(enabled.reduce((sum, row) => sum + row.progress.completionPct, 0) / enabled.length)
      : 0;
  const outstanding = enabled.reduce((sum, row) => sum + row.progress.outstanding, 0);
  const punishments = rows.reduce((sum, row) => sum + row.pledge.activePunishments, 0);
  const online = rows.filter((row) => isOnline(row.lastSeenMs, nowMs)).length;

  if (rows.length === 0) {
    return (
      <>
        {header}
        <div className="mb-5">
          <GettingStarted overview={data} />
        </div>
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No pledges yet"
          body="Add pledges one at a time, or paste the whole class at once. Each one chooses their own password."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => setBulkOpen(true)}>
                Add several
              </Button>
              <Button variant="accent" onClick={() => setCreateOpen(true)}>
                Add the first pledge
              </Button>
            </div>
          }
        />
        {dialog}
      </>
    );
  }

  const hasTeams = data.teams.length > 0;
  // A team that was deleted while it was the filter falls back to showing everyone.
  const filterGone =
    teamFilter !== ALL_TEAMS && teamFilter !== NO_TEAM && !data.teams.some((team) => team.id === teamFilter);
  if (filterGone) setTeamFilter(ALL_TEAMS);
  const columns = hasTeams ? COLUMNS : COLUMNS.filter((column) => column.key !== "team");

  return (
    <>
      {header}
      <div className="mb-5 empty:hidden">
        <GettingStarted overview={data} hideWhenDone />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Pledges"
          value={String(enabled.length)}
          hint={rows.length > enabled.length ? `${rows.length - enabled.length} disabled` : undefined}
        />
        <StatTile label="Average completion" value={`${average}%`} hint="Of released deliverables" />
        <StatTile label="Outstanding" value={String(outstanding)} hint="Deliverables still to turn in" />
        <StatTile label="Active punishments" value={String(punishments)} />
        {/* The fifth tile spans the row on a phone, so none is left on its own. */}
        <div className="col-span-2 lg:col-span-1">
          <StatTile label="Online now" value={String(online)} />
        </div>
      </div>

      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search pledges"
            placeholder="Search by name or email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 pl-9"
          />
        </div>
        {hasTeams ? (
          <select
            aria-label="Filter by team"
            value={teamFilter}
            onChange={(event) => setTeamFilter(event.target.value)}
            className="h-10 rounded-lg border border-border bg-field px-3 text-sm text-foreground"
          >
            <option value={ALL_TEAMS}>All teams</option>
            <option value={NO_TEAM}>Working individually</option>
            {data.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        ) : null}
        <div role="tablist" aria-label="View" className="flex rounded-lg border border-border p-0.5">
          {(["table", "matrix"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={view === option}
              onClick={() => setView(option)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                view === option
                  ? "bg-accent/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option === "table" ? "Overview" : "Progress matrix"}
            </button>
          ))}
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
          No pledges match{query.trim() ? <> &quot;{query}&quot;</> : " this filter"}.
        </Card>
      ) : view === "matrix" ? (
        <ProgressMatrix
          rows={visibleRows.map((row) => ({
            uid: row.pledge.uid,
            displayName: row.pledge.displayName,
            cells: row.byForm,
          }))}
          forms={publishedForms}
          pledgeHref={(uid) => `/portal/admin/pledges/${uid}`}
          formHref={(formId) => `/portal/admin/forms/${formId}`}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  {columns.map((column) => {
                    const key = column.key;
                    const sorted = key !== null && sort.key === key;
                    return (
                      <th
                        key={column.label}
                        scope="col"
                        aria-sort={sorted ? (sort.ascending ? "ascending" : "descending") : undefined}
                        className={cn("px-5 py-3 font-medium", column.className)}
                      >
                        {key === null ? (
                          column.label
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setSort((current) => ({
                                key,
                                ascending:
                                  current.key === key ? !current.ascending : key === "name" || key === "team",
                              }))
                            }
                            className="flex items-center gap-1 uppercase tracking-wider hover:text-foreground"
                          >
                            {column.label}
                            {sorted ? (
                              sort.ascending ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : (
                                <ArrowDown className="h-3 w-3" />
                              )
                            ) : null}
                          </button>
                        )}
                      </th>
                    );
                  })}
                  <th scope="col" className="w-10 px-2 py-3">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleRows.map(({ pledge, teamName, progress, lastSeenMs }) => {
                  const chip = ACCOUNT_CHIPS[pledge.accountState];
                  const href = `/portal/admin/pledges/${pledge.uid}`;
                  return (
                    <tr key={pledge.uid} className="transition-colors hover:bg-muted/40">
                      <td className="px-5 py-3.5">
                        <Link href={href} className="block">
                          <span className="block font-medium text-foreground">{pledge.displayName}</span>
                          <span className="block text-xs text-muted-foreground">{pledge.email}</span>
                        </Link>
                      </td>
                      {hasTeams ? (
                        <td className="whitespace-nowrap px-5 py-3.5">
                          {teamName ?? <span className="text-muted-foreground">Individual</span>}
                        </td>
                      ) : null}
                      <td className="px-5 py-3.5">
                        <Chip tone={chip.tone}>{chip.label}</Chip>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <ProgressBar
                            value={progress.completionPct}
                            className="w-24"
                            label={`${pledge.displayName}: deliverables turned in`}
                          />
                          <span className="whitespace-nowrap text-foreground">
                            {progress.submitted}/{progress.released}
                          </span>
                        </div>
                        {progress.late + progress.missed > 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {[
                              progress.late > 0 ? `${progress.late} late` : null,
                              progress.missed > 0 ? `${progress.missed} missed` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-muted-foreground">
                        {isOnline(lastSeenMs, nowMs) ? (
                          <span className="flex items-center gap-2 text-success-ink">
                            <span className="h-2 w-2 rounded-full bg-success" />
                            Online
                          </span>
                        ) : lastSeenMs !== null ? (
                          formatRelative(lastSeenMs, nowMs)
                        ) : (
                          "Never"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-foreground">
                        {formatDuration(pledge.activity.totalActiveSeconds)}
                      </td>
                      <td className="px-5 py-3.5 text-foreground">{pledge.activity.sessionCount}</td>
                      <td className="px-5 py-3.5">
                        {pledge.activePunishments > 0 ? (
                          <Chip tone="danger">{pledge.activePunishments} active</Chip>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </td>
                      <td className="px-2 py-3.5">
                        <Link
                          href={href}
                          aria-label={`Open ${pledge.displayName}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {dialog}
    </>
  );
};

export default MasterView;
