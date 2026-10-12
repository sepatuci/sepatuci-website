"use client";

import Link from "next/link";
import { ChevronRight, ClipboardList } from "lucide-react";
import {
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  PageHeader,
  ProgressBar,
} from "@/components/PortalComponents/primitives";
import { useServerNow } from "@/components/PortalComponents/portal-session";
import { useApi } from "@/lib/portal/client/use-api";
import { formatDateTime, msOrNull } from "@/lib/portal/dates";
import type { ReviewOverviewDto } from "@/lib/portal/types";

/** Every deliverable that has been released to pledges, with how many have turned it in. */
const ReviewDeliverables: React.FC = () => {
  const nowMs = useServerNow();
  const { data, error, loading, reload } = useApi<ReviewOverviewDto>("/review/overview");

  const header = (
    <PageHeader
      title="Deliverables"
      subtitle="What new members have been asked to turn in, and their responses."
      actions={<Chip>View only</Chip>}
    />
  );

  if (loading && !data) return <>{header}<LoadingBlock label="Loading deliverables" /></>;
  if (error && !data) return <>{header}<ErrorNote error={error} onRetry={reload} /></>;
  if (!data) return null;

  if (data.forms.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title="Nothing released yet"
          body="Deliverables appear here once an admin releases them to new members."
        />
      </>
    );
  }

  return (
    <>
      {header}
      <Card className="divide-y divide-border overflow-hidden">
        {data.forms.map((form) => {
          // Pledges the deliverable applies to: everyone who is not shown it as "not assigned".
          const applies = data.pledges.filter((pledge) => pledge.byForm[form.id]?.state !== "hidden").length;
          const opensMs = msOrNull(form.opensAt);
          const upcoming = opensMs !== null && nowMs < opensMs;
          const share = applies > 0 ? Math.round((form.responseCount / applies) * 100) : 0;
          return (
            <Link
              key={form.id}
              href={`/portal/review/deliverables/${form.id}`}
              className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 transition-colors hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1 basis-56">
                <span className="block truncate font-medium text-foreground">{form.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {upcoming
                    ? `Opens ${formatDateTime(form.opensAt, true)}`
                    : form.dueAt
                      ? `Due ${formatDateTime(form.dueAt, true)}`
                      : "No deadline"}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <ProgressBar value={share} className="w-24" label={`${form.title}: share turned in`} />
                <span className="whitespace-nowrap text-sm text-foreground">
                  {form.responseCount} of {applies}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          );
        })}
      </Card>
    </>
  );
};

export default ReviewDeliverables;
