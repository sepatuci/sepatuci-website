"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Heading, Loader2, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Chip,
  ErrorNote,
  LoadingBlock,
  useToast,
} from "@/components/PortalComponents/primitives";
import { FormColumn, QuestionCard, TitleCard, underlineField } from "@/components/PortalFormComponents/form-chrome";
import QuestionField from "@/components/PortalFormComponents/question-field";
import { ApiError, apiFetch, errorMessage } from "@/lib/portal/client/api";
import { useApi } from "@/lib/portal/client/use-api";
import { LIMITS, PROGRAM_NAME } from "@/lib/portal/constants";
import { blankQuestion, duplicateQuestion, moveItem } from "@/lib/portal/form-builder";
import type {
  AdminFormDto,
  AdminFormsDto,
  Answers,
  FieldIssue,
  FormDefinition,
  FormStatus,
  Question,
  QuestionType,
} from "@/lib/portal/types";
import { cn } from "@/lib/utils";
import FormSettingsPanel from "./form-settings-panel";
import { STATUS_CHIPS } from "./forms-list";
import QuestionEditor from "./question-editor";
import ResponsesPanel from "./responses-panel";

type Tab = "questions" | "preview" | "responses" | "settings";

function definitionOf(form: AdminFormDto): FormDefinition {
  return {
    title: form.title,
    description: form.description,
    status: form.status,
    questions: form.questions,
    settings: form.settings,
  };
}

/** The form builder: Questions, Preview, Responses and Settings for one deliverable. */
const FormEditor: React.FC<{ formId: string }> = ({ formId }) => {
  const params = useSearchParams();
  const notify = useToast();
  const { data, error, loading, reload } = useApi<AdminFormDto>(`/admin/forms/${formId}`);
  const others = useApi<AdminFormsDto>("/admin/forms");

  const [saved, setSaved] = useState<AdminFormDto | null>(null);
  const [draft, setDraft] = useState<FormDefinition | null>(null);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(params.get("tab") === "responses" ? "responses" : "questions");
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});

  useEffect(() => {
    if (!data) return;
    setSaved(data);
    setDraft(definitionOf(data));
    setIssues([]);
    setConflict(false);
  }, [data]);

  const dirty = useMemo(
    () =>
      saved !== null &&
      draft !== null &&
      JSON.stringify(definitionOf(saved)) !== JSON.stringify(draft),
    [saved, draft],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const back = (
    <Link
      href="/portal/admin/forms"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      All deliverables
    </Link>
  );

  if (loading && !saved) return <>{back}<LoadingBlock label="Opening the deliverable" /></>;
  if (error && !saved) return <div className="space-y-4">{back}<ErrorNote error={error} onRetry={reload} /></div>;
  if (!saved || !draft) return null;

  // A response was deleted from the Responses tab. Only the count has changed,
  // so that is all that is refreshed: reloading the form would throw away any
  // edits that have not been saved yet.
  const refreshResponseCount = () => {
    apiFetch<AdminFormDto>(`/admin/forms/${formId}`).then(
      (latest) =>
        setSaved((current) =>
          current ? { ...current, responseCount: latest.responseCount } : current,
        ),
      () => undefined,
    );
    others.reload();
  };

  const update = (patch: Partial<FormDefinition>) => setDraft({ ...draft, ...patch });
  const setQuestions = (questions: Question[]) => update({ questions });

  const save = async (override: Partial<FormDefinition> = {}) => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await apiFetch<AdminFormDto>(`/admin/forms/${formId}`, {
        method: "PUT",
        body: { ...draft, ...override, expectedVersion: saved.version },
      });
      setSaved(result);
      setDraft(definitionOf(result));
      setIssues([]);
      notify(
        override.status === "published"
          ? "Published. Pledges will see it on schedule."
          : override.status === "draft"
            ? "Unpublished. Pledges can no longer see it."
            : "Saved.",
        "success",
      );
      others.reload();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 422) {
        setIssues(caught.fields);
        const inSettings = caught.fields.some((field) => field.path.startsWith("settings."));
        const inQuestions = caught.fields.some((field) => !field.path.startsWith("settings."));
        if (inSettings && !inQuestions) setTab("settings");
        else if (inQuestions) setTab("questions");
        notify(caught.message, "danger");
      } else if (caught instanceof ApiError && caught.code === "version_conflict") {
        setConflict(true);
      } else {
        notify(errorMessage(caught), "danger");
      }
    } finally {
      setSaving(false);
    }
  };

  const activeIndex = draft.questions.findIndex((question) => question.id === activeId);
  const insertQuestion = (type: QuestionType, afterIndex: number) => {
    if (draft.questions.length >= LIMITS.maxQuestions) return;
    const question = blankQuestion(type);
    const position = afterIndex + 1;
    setQuestions([
      ...draft.questions.slice(0, position),
      question,
      ...draft.questions.slice(position),
    ]);
    setActiveId(question.id);
  };

  const lockedTypes = new Set(saved.responseCount > 0 ? saved.questions.map((question) => question.id) : []);
  const issuesAt = (prefix: string) => issues.filter((issue) => issue.path.startsWith(prefix));
  const statusChip = STATUS_CHIPS[saved.status];
  const general = issues.filter(
    (issue) => issue.path === "questions" || issue.path === "" || issue.path === "status",
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "questions", label: "Questions" },
    { key: "preview", label: "Preview" },
    { key: "responses", label: `Responses (${saved.responseCount})` },
    { key: "settings", label: "Settings" },
  ];

  return (
    <>
      <div className="-mx-4 -mt-8 mb-6 border-b border-border bg-background/95 px-4 pb-0 pt-5 backdrop-blur sm:-mx-6 sm:-mt-10 sm:px-6 md:sticky md:top-16 md:z-40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {back}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-medium text-foreground">
                {draft.title || "Untitled deliverable"}
              </h1>
              <Chip tone={statusChip.tone}>{statusChip.label}</Chip>
              <span className="text-xs text-muted-foreground" role="status">
                {saving ? "Saving" : dirty ? "Unsaved changes" : "All changes saved"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
            {saved.status === "published" ? (
              <Button variant="ghost" onClick={() => void save({ status: "draft" })} disabled={saving}>
                Unpublish
              </Button>
            ) : (
              <Button variant="accent" onClick={() => void save({ status: "published" })} disabled={saving}>
                Publish
              </Button>
            )}
          </div>
        </div>
        <div role="tablist" aria-label="Deliverable" className="mt-4 flex gap-1 overflow-x-auto">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                "whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors",
                tab === item.key
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {conflict ? (
        <FormColumn className="mb-3">
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning-border bg-warning-subtle px-5 py-3.5 text-sm text-warning-ink"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Someone else saved this deliverable while you were editing. Reload to get their
              version. Your unsaved changes will be lost.
            </span>
            <Button variant="outline" size="sm" onClick={reload}>
              Reload
            </Button>
          </div>
        </FormColumn>
      ) : null}

      {tab === "questions" ? (
        <FormColumn>
          {saved.responseCount > 0 ? (
            <div className="rounded-lg border border-border bg-muted/40 px-5 py-3 text-sm text-muted-foreground">
              This deliverable has {saved.responseCount}{" "}
              {saved.responseCount === 1 ? "response" : "responses"}. Edits apply to pledges who
              haven&apos;t submitted yet. Existing responses keep the questions they answered.
            </div>
          ) : null}
          {general.length > 0 ? (
            <ul role="alert" className="rounded-lg border border-danger-border bg-danger-subtle px-5 py-3 text-sm text-danger-ink">
              {general.map((issue) => (
                <li key={`${issue.path}-${issue.code}`}>{issue.message}</li>
              ))}
            </ul>
          ) : null}

          <TitleCard>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent-ink">
              {PROGRAM_NAME} deliverable
            </p>
            <input
              aria-label="Deliverable title"
              placeholder="Deliverable title"
              value={draft.title}
              maxLength={LIMITS.formTitle}
              onChange={(event) => update({ title: event.target.value })}
              className={cn(underlineField, "mt-2 py-1.5 text-3xl")}
            />
            <textarea
              aria-label="Deliverable description"
              placeholder="Description: what pledges need to do, and why"
              value={draft.description}
              maxLength={LIMITS.formDescription}
              rows={Math.min(8, Math.max(2, draft.description.split("\n").length))}
              onChange={(event) => update({ description: event.target.value })}
              className={cn(underlineField, "mt-3 resize-none")}
            />
            {[...issuesAt("title"), ...issuesAt("description")].map((issue) => (
              <p key={`${issue.path}-${issue.code}`} role="alert" className="mt-2 text-sm text-danger-ink">
                {issue.message}
              </p>
            ))}
          </TitleCard>

          {draft.questions.map((question, index) => (
            <QuestionEditor
              key={question.id}
              question={question}
              index={index}
              count={draft.questions.length}
              active={question.id === activeId}
              typeLocked={lockedTypes.has(question.id)}
              issues={issuesAt(`questions[${index}]`)}
              onActivate={() => setActiveId(question.id)}
              onChange={(next) =>
                setQuestions(draft.questions.map((item) => (item.id === question.id ? next : item)))
              }
              onDuplicate={() => {
                const copy = duplicateQuestion(question);
                setQuestions([
                  ...draft.questions.slice(0, index + 1),
                  copy,
                  ...draft.questions.slice(index + 1),
                ]);
                setActiveId(copy.id);
              }}
              onRemove={() => {
                setQuestions(draft.questions.filter((item) => item.id !== question.id));
                setActiveId(null);
              }}
              onMove={(direction) =>
                setQuestions(moveItem(draft.questions, index, index + direction))
              }
              onAddAfter={(type) => insertQuestion(type, index)}
            />
          ))}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              disabled={draft.questions.length >= LIMITS.maxQuestions}
              onClick={() =>
                insertQuestion(
                  "multiple_choice",
                  activeIndex >= 0 ? activeIndex : draft.questions.length - 1,
                )
              }
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Add question
            </Button>
            <Button
              variant="ghost"
              disabled={draft.questions.length >= LIMITS.maxQuestions}
              onClick={() =>
                insertQuestion("section", activeIndex >= 0 ? activeIndex : draft.questions.length - 1)
              }
            >
              <Heading className="mr-2 h-4 w-4" />
              Add title and description
            </Button>
          </div>
        </FormColumn>
      ) : null}

      {tab === "preview" ? (
        <FormColumn>
          <div className="rounded-lg border border-border bg-muted/40 px-5 py-3 text-sm text-muted-foreground">
            This is what pledges see, including changes you haven&apos;t saved. Nothing you enter
            here is kept.
          </div>
          <TitleCard>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent-ink">
              {PROGRAM_NAME} deliverable
            </p>
            <h2 className="mt-2 text-3xl font-normal text-foreground">
              {draft.title || "Untitled deliverable"}
            </h2>
            {draft.description ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                {draft.description}
              </p>
            ) : null}
            {draft.questions.some((question) => question.type !== "section" && question.required) ? (
              <p className="mt-4 border-t border-border pt-4 text-sm text-danger-ink">
                * Indicates required question
              </p>
            ) : null}
          </TitleCard>
          {draft.questions.map((question) => (
            <QuestionCard key={question.id}>
              <QuestionField
                question={question}
                answer={previewAnswers[question.id]}
                onChange={(answer) => {
                  const next = { ...previewAnswers };
                  if (answer === undefined) delete next[question.id];
                  else next[question.id] = answer;
                  setPreviewAnswers(next);
                }}
              />
            </QuestionCard>
          ))}
          <div className="pt-2">
            <Button variant="accent" disabled className="px-6">
              Submit
            </Button>
          </div>
        </FormColumn>
      ) : null}

      {tab === "responses" ? (
        <ResponsesPanel formId={formId} focusUid={params.get("pledge")} onChanged={refreshResponseCount} />
      ) : null}

      {tab === "settings" ? (
        <FormSettingsPanel
          formId={formId}
          status={draft.status}
          settings={draft.settings}
          otherForms={others.data?.forms ?? []}
          issues={issues}
          onStatusChange={(status: FormStatus) => update({ status })}
          onChange={(settings) => update({ settings })}
        />
      ) : null}
    </>
  );
};

export default FormEditor;
