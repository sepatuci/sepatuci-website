"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  StateChip,
} from "@/components/PortalComponents/primitives";
import { percent, SummaryCard } from "@/components/PortalComponents/response-summary";
import { FormColumn, QuestionCard, TitleCard } from "@/components/PortalFormComponents/form-chrome";
import QuestionField from "@/components/PortalFormComponents/question-field";
import { summarizeResponses } from "@/lib/portal/analytics";
import { useApi } from "@/lib/portal/client/use-api";
import { PROGRAM_NAME } from "@/lib/portal/constants";
import { formatDateTime } from "@/lib/portal/dates";
import { QUESTION_TYPE_LABELS } from "@/lib/portal/form-builder";
import type { Question, ReviewFormDto } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

type View = "summary" | "individual" | "missing" | "questions";

/** A question as it was asked: its wording, what kind of answer it takes, and any options. */
const QuestionPreview: React.FC<{ question: Question }> = ({ question }) => (
  <>
    <p className="text-base text-foreground">
      {question.title || "Untitled"}
      {question.type !== "section" && question.required ? (
        <span className="text-danger-ink"> *</span>
      ) : null}
    </p>
    {question.description ? (
      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{question.description}</p>
    ) : null}
    {question.type !== "section" ? (
      <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">
        {QUESTION_TYPE_LABELS[question.type]}
      </p>
    ) : null}
    {"options" in question ? (
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
        {question.options.map((option) => (
          <li key={option.id}>{option.label}</li>
        ))}
      </ul>
    ) : null}
  </>
);

/** One deliverable as an active sees it: the responses, who is still missing, and the questions. */
const ReviewForm: React.FC<{ formId: string }> = ({ formId }) => {
  const params = useSearchParams();
  const focusUid = params.get("pledge");
  const { data, error, loading, reload } = useApi<ReviewFormDto>(`/review/forms/${formId}`);
  const [view, setView] = useState<View>(focusUid ? "individual" : "summary");
  const [selectedUid, setSelectedUid] = useState<string | null>(focusUid);

  const responses = useMemo(() => data?.responses ?? [], [data]);
  const summaries = useMemo(
    () => (data?.form.questions ? summarizeResponses(data.form.questions, responses) : []),
    [data, responses],
  );

  // Keep the Individual view pointing at a response that exists.
  useEffect(() => {
    if (responses.length === 0) return;
    if (!selectedUid || !responses.some((response) => response.uid === selectedUid)) {
      setSelectedUid(responses[0].uid);
    }
  }, [responses, selectedUid]);

  const back = (
    <Link
      href="/portal/review/deliverables"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      All deliverables
    </Link>
  );

  if (loading && !data) return <FormColumn>{back}<LoadingBlock label="Loading responses" /></FormColumn>;
  if (error && !data) {
    return (
      <FormColumn>
        {back}
        {error.status === 404 ? (
          <EmptyState
            title="This deliverable isn't available"
            body="It may not have been released yet, or the link is wrong."
          />
        ) : (
          <ErrorNote error={error} onRetry={reload} />
        )}
      </FormColumn>
    );
  }
  if (!data) return null;

  const { form, notTurnedIn } = data;
  const expected = responses.length + notTurnedIn.length;
  const late = responses.filter((response) => response.late).length;
  const selectedIndex = Math.max(
    0,
    responses.findIndex((response) => response.uid === selectedUid),
  );
  const selected = responses[selectedIndex];

  const tabs: { key: View; label: string }[] = [
    { key: "summary", label: "Summary" },
    { key: "individual", label: "Individual" },
    { key: "missing", label: `Not turned in (${notTurnedIn.length})` },
    { key: "questions", label: "Questions" },
  ];

  return (
    <FormColumn>
      {back}
      <TitleCard>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent-ink">
            {PROGRAM_NAME} deliverable
          </p>
          <Chip>View only</Chip>
        </div>
        <h1 className="mt-2 text-3xl font-normal text-foreground">{form.title}</h1>
        {form.description ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{form.description}</p>
        ) : null}
        <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
          {form.dueAt ? `Due ${formatDateTime(form.dueAt, true)}. ` : "No deadline. "}
          {form.allowLate ? "Late responses are accepted and marked late." : "It closes at the deadline."}
        </p>
      </TitleCard>

      <Card className="px-6 py-5">
        <p className="text-3xl font-light text-foreground">
          {responses.length} {responses.length === 1 ? "response" : "responses"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {expected > 0
            ? `${percent(responses.length, expected)}% of the ${expected} ${
                expected === 1 ? "pledge" : "pledges"
              } this applies to${late > 0 ? ` · ${late} late` : ""}`
            : "No pledges have been assigned this yet"}
        </p>
        <div role="tablist" aria-label="View" className="mt-5 flex flex-wrap gap-1 border-t border-border pt-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={view === tab.key}
              onClick={() => setView(tab.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                view === tab.key
                  ? "bg-accent-subtle text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Card>

      {view === "missing" ? (
        notTurnedIn.length === 0 ? (
          <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
            Everyone this applies to has turned it in.
          </Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {notTurnedIn.map((pledge) => (
              <Link
                key={pledge.uid}
                href={`/portal/review/pledges/${pledge.uid}`}
                className="flex items-center justify-between gap-3 px-6 py-3.5 transition-colors hover:bg-muted/50"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">{pledge.displayName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {pledge.teamName ?? "Working individually"}
                  </span>
                </span>
                <StateChip state={pledge.state} late={false} />
              </Link>
            ))}
          </Card>
        )
      ) : view === "questions" ? (
        form.questions === null ? (
          <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
            The questions are shown once this deliverable opens
            {form.opensAt ? `, ${formatDateTime(form.opensAt, true)}` : ""}.
          </Card>
        ) : (
          form.questions.map((question) => (
            <QuestionCard key={question.id}>
              <QuestionPreview question={question} />
            </QuestionCard>
          ))
        )
      ) : responses.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-8 w-8" />}
          title="No responses yet"
          body="Responses appear here as pledges turn this in."
        />
      ) : view === "summary" ? (
        summaries.map((summary) => (
          <SummaryCard
            key={summary.questionId}
            summary={summary}
            questionType={form.questions?.find((question) => question.id === summary.questionId)?.type}
          />
        ))
      ) : selected ? (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <div className="min-w-0">
              <select
                aria-label="Choose a response"
                value={selected.uid}
                onChange={(event) => setSelectedUid(event.target.value)}
                className="h-10 max-w-full rounded-lg border border-border bg-field px-3 text-sm text-foreground"
              >
                {responses.map((response) => (
                  <option key={response.uid} value={response.uid}>
                    {response.displayName}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-muted-foreground">
                {selected.teamName ? `${selected.teamName} · ` : ""}
                Turned in {formatDateTime(selected.submittedAt, true)}
                {selected.late ? " · late" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-label="Previous response"
                disabled={selectedIndex === 0}
                onClick={() => setSelectedUid(responses[selectedIndex - 1].uid)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {selectedIndex + 1} of {responses.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-label="Next response"
                disabled={selectedIndex === responses.length - 1}
                onClick={() => setSelectedUid(responses[selectedIndex + 1].uid)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </Card>
          {selected.questions.map((question) => (
            <QuestionCard key={question.id}>
              <QuestionField question={question} answer={selected.answers[question.id]} />
            </QuestionCard>
          ))}
        </>
      ) : null}
    </FormColumn>
  );
};

export default ReviewForm;
