"use client";

import Link from "next/link";
import { ChevronRight, History } from "lucide-react";
import { useApi } from "@/lib/portal/client/use-api";
import { formatDateTime, formatDuration } from "@/lib/portal/dates";
import type { SubmissionHistoryDto } from "@/lib/portal/types";
import { Card, Chip, EmptyState, ErrorNote, LoadingBlock, PageHeader } from "./primitives";

/** Every deliverable the pledge has turned in, newest first. */
const HistoryList: React.FC = () => {
  const { data, error, loading, reload } = useApi<SubmissionHistoryDto>("/submissions");
  const header = (
    <PageHeader
      title="History"
      subtitle="Everything you've turned in for Founder's Education, exactly as you submitted it."
    />
  );

  if (loading && !data) return <>{header}<LoadingBlock label="Loading your history" /></>;
  if (error && !data) return <>{header}<ErrorNote error={error} onRetry={reload} /></>;
  if (!data) return null;

  if (data.submissions.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={<History className="h-8 w-8" />}
          title="Nothing turned in yet"
          body="Everything you submit is kept here."
        />
      </>
    );
  }

  return (
    <>
      {header}
      <Card className="divide-y divide-border overflow-hidden">
        {data.submissions.map((submission) => (
          <Link
            key={submission.formId}
            href={`/portal/history/${submission.formId}`}
            className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{submission.title}</span>
                <Chip tone={submission.late ? "warning" : "success"}>
                  {submission.late ? "Late" : "On time"}
                </Chip>
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Turned in {formatDateTime(submission.submittedAt, true)} · took{" "}
                {formatDuration(submission.durationSeconds)} · {submission.questionCount}{" "}
                {submission.questionCount === 1 ? "question" : "questions"}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </Card>
    </>
  );
};

export default HistoryList;
