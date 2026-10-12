"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  Chip,
  ConfirmDialog,
  ErrorNote,
  LoadingBlock,
  StateChip,
  useToast,
} from "@/components/PortalComponents/primitives";
import { FormColumn, QuestionCard } from "@/components/PortalFormComponents/form-chrome";
import QuestionField from "@/components/PortalFormComponents/question-field";
import { percent, SummaryCard } from "@/components/PortalComponents/response-summary";
import { summarizeResponses, summarizeTiming } from "@/lib/portal/analytics";
import { apiFetch, errorMessage } from "@/lib/portal/client/api";
import { useApi } from "@/lib/portal/client/use-api";
import { responsesToCsv } from "@/lib/portal/csv";
import { formatDateTime, formatDuration } from "@/lib/portal/dates";
import type { FormResponsesDto, ResponseRowDto } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

type View = "summary" | "individual" | "missing";

function downloadCsv(filename: string, csv: string) {
  // The byte-order mark makes Excel read the file as UTF-8.
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

interface ResponsesPanelProps {
  formId: string;
  /** Opens the Individual view on this pledge's response. */
  focusUid: string | null;
  onChanged: () => void;
}

/** Responses to one deliverable: totals, per-question charts, each response, and who is missing. */
/** Team filter values that are not a team id. */
const ALL_TEAMS = "all";
const NO_TEAM = "none";

const ResponsesPanel: React.FC<ResponsesPanelProps> = ({ formId, focusUid, onChanged }) => {
  const notify = useToast();
  const { data, error, loading, reload } = useApi<FormResponsesDto>(`/admin/forms/${formId}/responses`);
  const [view, setView] = useState<View>(focusUid ? "individual" : "summary");
  const [selectedUid, setSelectedUid] = useState<string | null>(focusUid);
  const [reopening, setReopening] = useState<ResponseRowDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [teamFilter, setTeamFilter] = useState(ALL_TEAMS);

  // Everything below (the summary, the timings, the download) follows the team chosen.
  const inTeam = useMemo(() => {
    const known = new Set((data?.teams ?? []).map((team) => team.id));
    return (teamId: string | null): boolean => {
      if (teamFilter === ALL_TEAMS) return true;
      const onTeam = teamId !== null && known.has(teamId);
      return teamFilter === NO_TEAM ? !onTeam : teamId === teamFilter;
    };
  }, [data, teamFilter]);
  const responses = useMemo(
    () => (data?.responses ?? []).filter((response) => inTeam(response.teamId)),
    [data, inTeam],
  );
  const nonResponders = useMemo(
    () => (data?.nonResponders ?? []).filter((pledge) => inTeam(pledge.teamId)),
    [data, inTeam],
  );
  const teamNames = useMemo(
    () => new Map((data?.teams ?? []).map((team) => [team.id, team.name])),
    [data],
  );
  const summaries = useMemo(
    () => (data ? summarizeResponses(data.form.questions, responses) : []),
    [data, responses],
  );
  const timing = useMemo(() => summarizeTiming(responses), [responses]);

  // Keep the Individual view pointing at a response that still exists.
  useEffect(() => {
    if (responses.length === 0) return;
    if (!selectedUid || !responses.some((response) => response.uid === selectedUid)) {
      setSelectedUid(responses[0].uid);
    }
  }, [responses, selectedUid]);

  if (loading && !data) return <LoadingBlock label="Loading responses" />;
  if (error && !data) {
    return (
      <FormColumn>
        <ErrorNote error={error} onRetry={reload} />
      </FormColumn>
    );
  }
  if (!data) return null;

  const expected = responses.length + nonResponders.length;
  const selectedIndex = Math.max(
    0,
    responses.findIndex((response) => response.uid === selectedUid),
  );
  const selected = responses[selectedIndex];

  const reopen = async () => {
    if (!reopening || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/forms/${formId}/responses/${reopening.uid}`, { method: "DELETE" });
      notify(`${reopening.displayName}'s response was deleted.`, "success");
      setReopening(null);
      reload();
      onChanged();
    } catch (caught) {
      notify(errorMessage(caught), "danger");
    } finally {
      setBusy(false);
    }
  };

  const tabs: { key: View; label: string }[] = [
    { key: "summary", label: "Summary" },
    { key: "individual", label: "Individual" },
    { key: "missing", label: `Not turned in (${nonResponders.length})` },
  ];

  return (
    <FormColumn>
      <Card className="px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-3xl font-light text-foreground">
              {responses.length} {responses.length === 1 ? "response" : "responses"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {expected > 0
                ? `${percent(responses.length, expected)}% of the ${expected} ${
                    expected === 1 ? "new member" : "new members"
                  } this applies to`
                : "No new members have been assigned this yet"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data.teams.length > 0 ? (
              <select
                aria-label="Filter responses by team"
                value={teamFilter}
                onChange={(event) => setTeamFilter(event.target.value)}
                className="h-9 rounded-lg border border-border bg-field px-3 text-sm text-foreground"
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
            <Button
              variant="outline"
              size="sm"
              disabled={responses.length === 0}
              onClick={() =>
                downloadCsv(
                  `${data.form.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "responses"}.csv`,
                  responsesToCsv(data.form.questions, responses, teamNames),
                )
              }
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download CSV
            </Button>
          </div>
        </div>
        {responses.length > 0 ? (
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">On time</dt>
              <dd className="mt-0.5 text-xl font-light text-foreground">{timing.onTime}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Late</dt>
              <dd className="mt-0.5 text-xl font-light text-foreground">{timing.late}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Typical time to finish</dt>
              <dd className="mt-0.5 text-xl font-light text-foreground">
                {formatDuration(timing.medianDurationSeconds ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fastest / slowest</dt>
              <dd className="mt-0.5 text-xl font-light text-foreground">
                {formatDuration(timing.fastestDurationSeconds ?? 0)} /{" "}
                {formatDuration(timing.slowestDurationSeconds ?? 0)}
              </dd>
            </div>
          </dl>
        ) : null}
        <div role="tablist" aria-label="Responses view" className="mt-5 flex gap-1 border-t border-border pt-3">
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
                  ? "bg-accent/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Card>

      {view === "missing" ? (
        nonResponders.length === 0 ? (
          <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
            Everyone this applies to has turned it in.
          </Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {nonResponders.map((pledge) => (
              <Link
                key={pledge.uid}
                href={`/portal/admin/new-members/${pledge.uid}`}
                className="flex items-center justify-between gap-3 px-6 py-3.5 transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">{pledge.displayName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {pledge.email}
                    {pledge.teamId && teamNames.has(pledge.teamId) ? ` · ${teamNames.get(pledge.teamId)}` : ""}
                  </span>
                </span>
                <StateChip state={pledge.state} late={false} />
              </Link>
            ))}
          </Card>
        )
      ) : responses.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-14 text-center">
          <Inbox className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-base font-medium text-foreground">Waiting for responses</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Responses appear here as new members turn this in.
          </p>
        </Card>
      ) : view === "summary" ? (
        summaries.map((summary) => (
          <SummaryCard
            key={summary.questionId}
            summary={summary}
            questionType={data.form.questions.find((question) => question.id === summary.questionId)?.type}
          />
        ))
      ) : selected ? (
        <>
          <Card className="px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous response"
                  disabled={selectedIndex === 0}
                  onClick={() => setSelectedUid(responses[selectedIndex - 1].uid)}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <select
                  aria-label="Choose a response"
                  value={selected.uid}
                  onChange={(event) => setSelectedUid(event.target.value)}
                  className="h-10 max-w-[16rem] rounded-md border border-border bg-field px-3 text-sm text-foreground focus:border-accent focus:outline-none"
                >
                  {responses.map((response) => (
                    <option key={response.uid} value={response.uid}>
                      {response.displayName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label="Next response"
                  disabled={selectedIndex === responses.length - 1}
                  onClick={() => setSelectedUid(responses[selectedIndex + 1].uid)}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <span className="text-sm text-muted-foreground">
                  {selectedIndex + 1} of {responses.length}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setReopening(selected)}>
                Delete and reopen
              </Button>
            </div>
            <dl className="mt-4 grid gap-x-8 gap-y-2 border-t border-border pt-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">New member</dt>
                <dd>
                  <Link
                    href={`/portal/admin/new-members/${selected.uid}`}
                    className="text-foreground hover:text-accent-ink"
                  >
                    {selected.displayName}
                  </Link>{" "}
                  <span className="text-muted-foreground">{selected.email}</span>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Turned in</dt>
                <dd className="flex flex-wrap items-center gap-2 text-foreground">
                  {formatDateTime(selected.submittedAt, true)}
                  <Chip tone={selected.late ? "warning" : "success"}>
                    {selected.late ? `Late by ${formatDuration(selected.lateBySeconds)}` : "On time"}
                  </Chip>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">From first opening it to submitting</dt>
                <dd className="text-foreground">{formatDuration(selected.durationSeconds)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Active time on the deliverable</dt>
                <dd className="text-foreground">{formatDuration(selected.activeSeconds)}</dd>
              </div>
            </dl>
            {selected.formVersion < data.form.questionsVersion ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Shown as the deliverable was when this was submitted. Its questions have been
                edited since.
              </p>
            ) : null}
          </Card>
          {selected.questions.map((question) => (
            <QuestionCard key={question.id}>
              <QuestionField question={question} answer={selected.answers[question.id]} />
            </QuestionCard>
          ))}
        </>
      ) : null}

      <ConfirmDialog
        open={reopening !== null}
        onOpenChange={(open) => {
          if (!open) setReopening(null);
        }}
        title="Delete this response?"
        description={`${reopening?.displayName ?? "The new member"} will be able to turn this in again, if it is still open. The deleted response can't be recovered.`}
        confirmLabel="Delete and reopen"
        destructive
        busy={busy}
        onConfirm={() => void reopen()}
      />
    </FormColumn>
  );
};

export default ResponsesPanel;
