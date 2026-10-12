"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  ProgressBar,
  StateChip,
} from "@/components/PortalComponents/primitives";
import { useApi } from "@/lib/portal/client/use-api";
import { PROGRAM_NAME } from "@/lib/portal/constants";
import { formatDateTime } from "@/lib/portal/dates";
import type { ReviewOverviewDto } from "@/lib/portal/types";

/** One pledge, as an active sees them: their progress and what they have turned in. */
const ReviewPledge: React.FC<{ uid: string }> = ({ uid }) => {
  const { data, error, loading, reload } = useApi<ReviewOverviewDto>("/review/overview");

  const back = (
    <Link
      href="/portal/review"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      All new members
    </Link>
  );

  if (loading && !data) return <>{back}<LoadingBlock label="Loading new member" /></>;
  if (error && !data) return <div className="space-y-4">{back}<ErrorNote error={error} onRetry={reload} /></div>;
  if (!data) return null;

  const pledge = data.pledges.find((candidate) => candidate.uid === uid);
  if (!pledge) {
    return (
      <div className="space-y-4">
        {back}
        <EmptyState title="This new member isn't in the list" body="They may have been removed, or the link is wrong." />
      </div>
    );
  }

  const { progress } = pledge;
  const assigned = data.forms.filter((form) => pledge.byForm[form.id]?.state !== "hidden");

  return (
    <>
      {back}
      <div className="mb-8 mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-accent-ink">{PROGRAM_NAME} new member</p>
          <Chip>View only</Chip>
        </div>
        <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">{pledge.displayName}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{pledge.teamName ?? "Working individually"}</p>
      </div>

      <Card className="p-5">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className="text-foreground">
            {progress.submitted} of {progress.released} turned in
          </span>
        </div>
        <ProgressBar
          value={progress.completionPct}
          className="mt-3"
          label={`${pledge.displayName}: deliverables turned in`}
        />
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["On time", progress.onTime],
            ["Late", progress.late],
            ["Missed", progress.missed],
            ["Outstanding", progress.outstanding],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-xl font-light text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <h2 className="mb-3 mt-10 text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Deliverables
      </h2>
      {assigned.length === 0 ? (
        <Card className="px-5 py-8 text-center text-sm text-muted-foreground">
          Nothing has been released to this new member yet.
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {assigned.map((form) => {
            const cell = pledge.byForm[form.id];
            if (!cell) return null;
            return (
              <div key={form.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{form.title}</span>
                    <StateChip state={cell.state} late={cell.late} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {cell.submittedAt
                      ? `Turned in ${formatDateTime(cell.submittedAt, true)}`
                      : form.dueAt
                        ? `Due ${formatDateTime(form.dueAt, true)}`
                        : "No deadline"}
                  </p>
                </div>
                {cell.state === "submitted" ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/portal/review/deliverables/${form.id}?member=${pledge.uid}`}>
                      Read response
                    </Link>
                  </Button>
                ) : null}
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
};

export default ReviewPledge;
