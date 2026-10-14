"use client";

import { useEffect, useState } from "react";
import { Check, Flag, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  PageHeader,
  useToast,
} from "@/components/PortalComponents/primitives";
import { REPORTS_CHANGED_EVENT } from "@/components/PortalComponents/report-dialog";
import { ApiError, apiFetch, errorMessage } from "@/lib/portal/client/api";
import { formatDate } from "@/lib/portal/dates";
import { REPORT_TOPIC_LABEL, formatReportDay } from "@/lib/portal/reports";
import type { ReportDto, ReportStatus, ReportsDto } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

const TABS: ReadonlyArray<{ value: ReportStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
];

const EMPTY: Record<ReportStatus, { title: string; body: string }> = {
  new: { title: "No new reports.", body: "A report sent today appears here tomorrow." },
  reviewed: { title: "Nothing reviewed yet.", body: "Reports you mark as reviewed are kept here." },
};

/** The admin Reports page: anonymous reports from the portal, new and reviewed. */
export const ReportsPanel: React.FC = () => {
  const notify = useToast();
  const [tab, setTab] = useState<ReportStatus>("new");
  // The list is kept with the tab it was loaded for, so switching tabs never
  // shows one tab's reports under the other's heading.
  const [loaded, setLoaded] = useState<{ status: ReportStatus; data: ReportsDto } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    apiFetch<ReportsDto>(`/admin/reports?status=${tab}`)
      .then((data) => {
        if (!cancelled) setLoaded({ status: tab, data });
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught : new ApiError(0, "unknown", "Something went wrong. Try again."));
      });
    return () => {
      cancelled = true;
    };
  }, [tab, attempt]);

  const reload = () => setAttempt((count) => count + 1);

  const mark = async (report: ReportDto, status: ReportStatus) => {
    if (busyId !== null) return;
    setBusyId(report.id);
    try {
      await apiFetch<{ report: ReportDto }>(`/admin/reports/${report.id}`, { method: "PATCH", body: { status } });
      // It belongs to the other tab now. The counts come back with the reload.
      setLoaded((current) =>
        current
          ? {
              ...current,
              data: { ...current.data, reports: current.data.reports.filter((item) => item.id !== report.id) },
            }
          : current,
      );
      notify(status === "reviewed" ? "Marked reviewed." : "Marked new.", "success");
      window.dispatchEvent(new Event(REPORTS_CHANGED_EVENT));
      reload();
    } catch (caught) {
      notify(errorMessage(caught), "danger");
    } finally {
      setBusyId(null);
    }
  };

  const header = (
    <PageHeader
      title="Reports"
      subtitle="Anonymous reports sent from the portal. Nothing here says who sent them. Each one appears the day after it is sent and shows only that day, never the time."
    />
  );

  const counts: Record<ReportStatus, number | null> = {
    new: loaded ? loaded.data.newCount : null,
    reviewed: loaded ? loaded.data.reviewedCount : null,
  };

  const tabs = (
    <div role="tablist" aria-label="Reports" className="mb-5 inline-flex rounded-lg border border-border p-0.5">
      {TABS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          id={`reports-tab-${option.value}`}
          aria-selected={tab === option.value}
          onClick={() => setTab(option.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            tab === option.value ? "bg-accent/20 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
          {counts[option.value] !== null ? (
            <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{counts[option.value]}</span>
          ) : null}
        </button>
      ))}
    </div>
  );

  const current = loaded?.status === tab ? loaded.data : null;
  if (error && !current) return <>{header}{tabs}<ErrorNote error={error} onRetry={reload} /></>;
  if (!current) return <>{header}{tabs}<LoadingBlock label="Loading reports" /></>;
  // A refresh that failed after the list loaded says so above what may now be out of date.
  const stale = error ? (
    <div className="mb-4">
      <ErrorNote error={error} onRetry={reload} />
    </div>
  ) : null;

  if (current.reports.length === 0) {
    return (
      <>
        {header}
        {tabs}
        {stale}
        <EmptyState icon={<Flag className="h-8 w-8" />} title={EMPTY[tab].title} body={EMPTY[tab].body} />
      </>
    );
  }

  const thisYear = String(new Date().getFullYear());

  return (
    <>
      {header}
      {tabs}
      {stale}
      <div role="tabpanel" aria-labelledby={`reports-tab-${tab}`} className="space-y-3">
        {current.reports.map((report) => {
          const busy = busyId === report.id;
          return (
            <Card key={report.id} className="min-w-0 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Chip tone={report.topic === "safety" ? "warning" : "neutral"}>
                    {report.topic ? REPORT_TOPIC_LABEL[report.topic] : "No topic"}
                  </Chip>
                  <span>Sent {formatReportDay(report.receivedOn, !report.receivedOn.startsWith(thisYear))}</span>
                  {report.status === "reviewed" && report.reviewedAt ? (
                    <span>· Reviewed {formatDate(report.reviewedAt)}</span>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => void mark(report, report.status === "new" ? "reviewed" : "new")}
                >
                  {busy ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : report.status === "new" ? (
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                  ) : (
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {report.status === "new" ? "Mark reviewed" : "Mark new"}
                </Button>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
                {report.body}
              </p>
            </Card>
          );
        })}
      </div>
    </>
  );
};
