"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  Chip,
  EmptyState,
  ErrorNote,
  LoadingBlock,
} from "@/components/PortalComponents/primitives";
import { useApi } from "@/lib/portal/client/use-api";
import { PROGRAM_NAME } from "@/lib/portal/constants";
import { formatDateTime, formatDuration } from "@/lib/portal/dates";
import type { SubmissionDto } from "@/lib/portal/types";
import { FormColumn, QuestionCard, TitleCard } from "./form-chrome";
import QuestionField from "./question-field";

/** A pledge's own turned-in response, exactly as it was submitted. */
const SubmissionView: React.FC<{ formId: string }> = ({ formId }) => {
  const { data, error, loading, reload } = useApi<SubmissionDto>(`/submissions/${formId}`);

  const back = (
    <Link
      href="/portal/history"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      History
    </Link>
  );

  if (loading && !data) return <LoadingBlock label="Loading your response" />;
  if (error && !data) {
    return (
      <FormColumn>
        {back}
        {error.status === 404 ? (
          <EmptyState title="Nothing turned in yet" body="You haven't submitted this deliverable." />
        ) : (
          <ErrorNote error={error} onRetry={reload} />
        )}
      </FormColumn>
    );
  }
  if (!data) return null;

  return (
    <FormColumn>
      {back}
      <TitleCard>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent-ink">
          {PROGRAM_NAME} deliverable
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-normal text-foreground">{data.title}</h1>
          <Chip tone={data.late ? "warning" : "success"}>{data.late ? "Submitted late" : "Submitted"}</Chip>
        </div>
        {data.description ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{data.description}</p>
        ) : null}
        <dl className="mt-4 grid gap-x-8 gap-y-2 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Turned in</dt>
            <dd className="text-foreground">{formatDateTime(data.submittedAt, true)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Time from opening to submitting</dt>
            <dd className="text-foreground">{formatDuration(data.durationSeconds)}</dd>
          </div>
          {data.late ? (
            <div>
              <dt className="text-muted-foreground">Late by</dt>
              <dd className="text-warning-ink">{formatDuration(data.lateBySeconds)}</dd>
            </div>
          ) : null}
        </dl>
      </TitleCard>

      {data.questions.map((question) => (
        <QuestionCard key={question.id}>
          <QuestionField question={question} answer={data.answers[question.id]} />
        </QuestionCard>
      ))}
    </FormColumn>
  );
};

export default SubmissionView;
