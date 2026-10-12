"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, RefreshCw, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  PageHeader,
  ProgressBar,
  StatTile,
} from "@/components/PortalComponents/primitives";
import { ProgressMatrix } from "@/components/PortalComponents/progress-matrix";
import { useApi } from "@/lib/portal/client/use-api";
import type { ReviewOverviewDto, ReviewPledgeDto } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

const ALL_TEAMS = "all";
const NO_TEAM = "none";

const pledgeHref = (uid: string) => `/portal/review/new-members/${uid}`;

const Standing: React.FC<{ pledge: ReviewPledgeDto }> = ({ pledge }) => {
  const { progress } = pledge;
  const notes = [
    progress.late > 0 ? `${progress.late} late` : null,
    progress.missed > 0 ? `${progress.missed} missed` : null,
  ].filter(Boolean);
  return (
    <div>
      <div className="flex items-center gap-3">
        <ProgressBar
          value={progress.completionPct}
          className="w-24"
          label={`${pledge.displayName}: deliverables turned in`}
        />
        <span className="whitespace-nowrap text-sm text-foreground">
          {progress.submitted}/{progress.released}
        </span>
      </div>
      {notes.length > 0 ? <p className="mt-1 text-xs text-muted-foreground">{notes.join(" · ")}</p> : null}
    </div>
  );
};

/** The actives' home: every pledge and where they stand. Nothing here can be changed. */
const ReviewOverview: React.FC = () => {
  const { data, error, loading, reload } = useApi<ReviewOverviewDto>("/review/overview");
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState(ALL_TEAMS);
  const [view, setView] = useState<"list" | "grid">("list");

  const teams = useMemo(() => {
    const names = (data?.pledges ?? [])
      .map((pledge) => pledge.teamName)
      .filter((name): name is string => name !== null);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.pledges ?? []).filter((pledge) => {
      if (team === NO_TEAM && pledge.teamName !== null) return false;
      if (team !== ALL_TEAMS && team !== NO_TEAM && pledge.teamName !== team) return false;
      return needle.length === 0 || pledge.displayName.toLowerCase().includes(needle);
    });
  }, [data, query, team]);

  const header = (
    <PageHeader
      title="New members"
      subtitle="Where every new member stands on their Founder's Education deliverables."
      actions={
        <>
          <Chip>View only</Chip>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </>
      }
    />
  );

  if (loading && !data) return <>{header}<LoadingBlock label="Loading new members" /></>;
  if (error && !data) return <>{header}<ErrorNote error={error} onRetry={reload} /></>;
  if (!data) return null;

  const { pledges, forms } = data;
  if (pledges.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No new members yet"
          body="When an admin adds this class's new members, they show up here."
        />
      </>
    );
  }

  const average = Math.round(
    pledges.reduce((sum, pledge) => sum + pledge.progress.completionPct, 0) / pledges.length,
  );
  const turnedIn = pledges.reduce((sum, pledge) => sum + pledge.progress.submitted, 0);
  const outstanding = pledges.reduce((sum, pledge) => sum + pledge.progress.outstanding, 0);

  return (
    <>
      {header}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="New members" value={String(pledges.length)} />
        <StatTile label="Average completion" value={`${average}%`} hint="Of released deliverables" />
        <StatTile label="Turned in" value={String(turnedIn)} hint="Responses so far" />
        <StatTile label="Outstanding" value={String(outstanding)} hint="Still to turn in" />
      </div>

      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search new members"
              placeholder="Search by name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 pl-9"
            />
          </div>
          {teams.length > 0 ? (
            <select
              aria-label="Filter by team"
              value={team}
              onChange={(event) => setTeam(event.target.value)}
              className="h-10 rounded-lg border border-border bg-field px-3 text-sm text-foreground"
            >
              <option value={ALL_TEAMS}>All teams</option>
              <option value={NO_TEAM}>Working individually</option>
              {teams.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div role="tablist" aria-label="View" className="flex rounded-lg border border-border p-0.5">
          {(["list", "grid"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={view === option}
              onClick={() => setView(option)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                view === option
                  ? "bg-accent-subtle text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option === "list" ? "List" : "Progress grid"}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted-foreground">No new member matches.</Card>
      ) : view === "grid" ? (
        <ProgressMatrix
          rows={shown.map((pledge) => ({
            uid: pledge.uid,
            displayName: pledge.displayName,
            cells: pledge.byForm,
          }))}
          forms={forms}
          pledgeHref={pledgeHref}
          formHref={(formId) => `/portal/review/deliverables/${formId}`}
        />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {shown.map((pledge) => (
            <Link
              key={pledge.uid}
              href={pledgeHref(pledge.uid)}
              className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 transition-colors hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1 basis-40">
                <span className="block truncate font-medium text-foreground">{pledge.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {pledge.teamName ?? "Working individually"}
                </span>
              </span>
              <Standing pledge={pledge} />
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </Card>
      )}
    </>
  );
};

export default ReviewOverview;
