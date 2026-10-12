"use client";

import { ArrowDown, ArrowUp, Copy, Heading, PlusCircle, Trash2, X } from "lucide-react";
import { Switch } from "@/components/PortalComponents/primitives";
import { QuestionCard, underlineField } from "@/components/PortalFormComponents/form-chrome";
import { LIMITS } from "@/lib/portal/constants";
import { QUESTION_TYPE_LABELS, convertQuestion, newLocalId } from "@/lib/portal/form-builder";
import type {
  FieldIssue,
  Question,
  QuestionOption,
  QuestionType,
  ShortTextValidation,
} from "@/lib/portal/types";
import { cn } from "@/lib/utils";

interface QuestionEditorProps {
  question: Question;
  index: number;
  count: number;
  active: boolean;
  /** True once responses exist: the type can no longer change. */
  typeLocked: boolean;
  issues: FieldIssue[];
  onActivate: () => void;
  onChange: (question: Question) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onAddAfter: (type: QuestionType) => void;
}

const selectClass =
  "h-11 rounded-md border border-border bg-field px-3 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60";

const iconButton =
  "flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

const VALIDATIONS: { value: ShortTextValidation; label: string }[] = [
  { value: "none", label: "Any text" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email address" },
  { value: "url", label: "Link (https://)" },
];

const Marker: React.FC<{ type: QuestionType; index: number }> = ({ type, index }) => {
  if (type === "dropdown") {
    return <span className="w-5 shrink-0 text-sm text-muted-foreground">{index + 1}.</span>;
  }
  return (
    <span
      aria-hidden
      className={cn(
        "h-[18px] w-[18px] shrink-0 border-2 border-muted-foreground/50",
        type === "checkboxes" ? "rounded-sm" : "rounded-full",
      )}
    />
  );
};

function nextOptionLabel(options: QuestionOption[]): string {
  const taken = new Set(options.map((option) => option.label.toLowerCase()));
  let number = options.length + 1;
  while (taken.has(`option ${number}`)) number += 1;
  return `Option ${number}`;
}

/** What a question looks like when it is not the one being edited. */
const QuestionPreview: React.FC<{ question: Question }> = ({ question }) => {
  if (question.type === "section") {
    return (
      <div>
        <p className="text-lg font-medium text-foreground">{question.title || "Untitled section"}</p>
        {question.description ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{question.description}</p>
        ) : null}
      </div>
    );
  }

  let body: React.ReactNode;
  if ("options" in question) {
    const other = "allowOther" in question && question.allowOther;
    body = (
      <ul className="space-y-2">
        {question.options.map((option, index) => (
          <li key={option.id} className="flex items-center gap-3 text-sm text-foreground/90">
            <Marker type={question.type} index={index} />
            {option.label}
          </li>
        ))}
        {other ? (
          <li className="flex items-center gap-3 text-sm text-muted-foreground">
            <Marker type={question.type} index={question.options.length} />
            Other…
          </li>
        ) : null}
      </ul>
    );
  } else if (question.type === "linear_scale") {
    body = (
      <p className="text-sm text-muted-foreground">
        {question.minLabel ? `${question.minLabel} ` : ""}
        <span className="text-foreground/90">
          {question.min} to {question.max}
        </span>
        {question.maxLabel ? ` ${question.maxLabel}` : ""}
      </p>
    );
  } else {
    const hint =
      question.type === "short_text"
        ? "Short answer text"
        : question.type === "paragraph"
          ? "Long answer text"
          : question.type === "date"
            ? "Month, day, year"
            : "Time";
    body = (
      <p className="w-1/2 border-b border-dotted border-muted-foreground/40 pb-1.5 text-sm text-muted-foreground">
        {hint}
      </p>
    );
  }

  return (
    <div>
      <p className="text-base text-foreground">
        {question.title || <span className="text-muted-foreground">Untitled question</span>}
        {question.required ? <span className="ml-1 text-danger-ink">*</span> : null}
      </p>
      {question.description ? (
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{question.description}</p>
      ) : null}
      <div className="mt-4">{body}</div>
    </div>
  );
};

/** One question in the form builder: a preview until it is selected, then an editor. */
const QuestionEditor: React.FC<QuestionEditorProps> = ({
  question,
  index,
  count,
  active,
  typeLocked,
  issues,
  onActivate,
  onChange,
  onDuplicate,
  onRemove,
  onMove,
  onAddAfter,
}) => {
  const issueList =
    issues.length > 0 ? (
      <ul className="mt-4 space-y-1">
        {issues.map((issue) => (
          <li key={`${issue.path}-${issue.code}`} role="alert" className="text-sm text-danger-ink">
            {issue.message}
          </li>
        ))}
      </ul>
    ) : null;

  if (!active) {
    return (
      <QuestionCard
        role="button"
        tabIndex={0}
        aria-label={`Edit ${question.type === "section" ? "section" : "question"} ${index + 1}`}
        invalid={issues.length > 0}
        onClick={onActivate}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onActivate();
          }
        }}
        className="cursor-pointer transition-colors hover:border-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <QuestionPreview question={question} />
        {issueList}
      </QuestionCard>
    );
  }

  const isSection = question.type === "section";
  const hasOptions = "options" in question;

  const setOptions = (options: QuestionOption[]) => {
    if (hasOptions) onChange({ ...question, options });
  };

  return (
    <div className="relative">
      <QuestionCard active invalid={issues.length > 0}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <input
            aria-label={isSection ? "Section title" : "Question"}
            placeholder={isSection ? "Section title" : "Question"}
            value={question.title}
            maxLength={LIMITS.questionTitle}
            onChange={(event) => onChange({ ...question, title: event.target.value })}
            autoFocus
            className="min-w-0 flex-1 rounded-t-md border-0 border-b border-border bg-muted/60 px-3 py-3 text-base text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:shadow-[0_1px_0_0_hsl(var(--accent))] focus:outline-none"
          />
          {isSection ? (
            <span className="flex h-11 items-center px-1 text-sm text-muted-foreground">
              Title and description
            </span>
          ) : (
            <div className="sm:w-52">
              <select
                aria-label="Question type"
                value={question.type}
                disabled={typeLocked}
                title={typeLocked ? "The type can't change once there are responses" : undefined}
                onChange={(event) => onChange(convertQuestion(question, event.target.value as QuestionType))}
                className={cn(selectClass, "w-full")}
              >
                {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {typeLocked ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Type can&apos;t change once there are responses. Add a new question instead.
                </p>
              ) : null}
            </div>
          )}
        </div>

        <textarea
          aria-label="Description"
          placeholder="Description (optional)"
          value={question.description}
          maxLength={LIMITS.questionDescription}
          rows={Math.min(6, Math.max(1, question.description.split("\n").length))}
          onChange={(event) => onChange({ ...question, description: event.target.value })}
          className={cn(underlineField, "mt-3 resize-none")}
        />

        {hasOptions ? (
          <div className="mt-5 space-y-2">
            {question.options.map((option, optionIndex) => (
              <div key={option.id} className="flex items-center gap-3">
                <Marker type={question.type} index={optionIndex} />
                <input
                  aria-label={`Option ${optionIndex + 1}`}
                  value={option.label}
                  maxLength={LIMITS.optionLabel}
                  onChange={(event) =>
                    setOptions(
                      question.options.map((item) =>
                        item.id === option.id ? { ...item, label: event.target.value } : item,
                      ),
                    )
                  }
                  className={cn(underlineField, "py-1.5")}
                />
                <button
                  type="button"
                  aria-label={`Remove option ${optionIndex + 1}`}
                  disabled={question.options.length <= 1}
                  onClick={() => setOptions(question.options.filter((item) => item.id !== option.id))}
                  className={iconButton}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {"allowOther" in question && question.allowOther ? (
              <div className="flex items-center gap-3">
                <Marker type={question.type} index={question.options.length} />
                <span className="flex-1 border-b border-dotted border-muted-foreground/40 py-1.5 text-sm text-muted-foreground">
                  Other…
                </span>
                <button
                  type="button"
                  aria-label='Remove the "Other" option'
                  onClick={() => onChange({ ...question, allowOther: false })}
                  className={iconButton}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            <div className="flex items-center gap-3 pt-1 text-sm">
              <Marker type={question.type} index={question.options.length} />
              <button
                type="button"
                disabled={question.options.length >= LIMITS.maxOptions}
                onClick={() =>
                  setOptions([
                    ...question.options,
                    { id: newLocalId("o"), label: nextOptionLabel(question.options) },
                  ])
                }
                className="text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                Add option
              </button>
              {"allowOther" in question && !question.allowOther ? (
                <>
                  <span className="text-muted-foreground/60">or</span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...question, allowOther: true })}
                    className="text-accent-ink hover:text-foreground"
                  >
                    add &quot;Other&quot;
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {question.type === "linear_scale" ? (
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <select
                aria-label="Scale starts at"
                value={question.min}
                onChange={(event) => onChange({ ...question, min: event.target.value === "0" ? 0 : 1 })}
                className={selectClass}
              >
                <option value={0}>0</option>
                <option value={1}>1</option>
              </select>
              to
              <select
                aria-label="Scale ends at"
                value={question.max}
                onChange={(event) => onChange({ ...question, max: Number(event.target.value) })}
                className={selectClass}
              >
                {Array.from(
                  { length: LIMITS.scaleMaxHigh - LIMITS.scaleMaxLow + 1 },
                  (_, offset) => LIMITS.scaleMaxLow + offset,
                ).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            {(
              [
                { key: "minLabel", value: question.min },
                { key: "maxLabel", value: question.max },
              ] as const
            ).map((end) => (
              <div key={end.key} className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-sm text-muted-foreground">{end.value}</span>
                <input
                  aria-label={`Label for ${end.value}`}
                  placeholder="Label (optional)"
                  value={question[end.key]}
                  maxLength={LIMITS.scaleLabel}
                  onChange={(event) => onChange({ ...question, [end.key]: event.target.value })}
                  className={cn(underlineField, "py-1.5 sm:w-1/2")}
                />
              </div>
            ))}
          </div>
        ) : null}

        {question.type === "short_text" ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <label htmlFor={`validation-${question.id}`}>Pledges must enter</label>
            <select
              id={`validation-${question.id}`}
              value={question.validation}
              onChange={(event) =>
                onChange({ ...question, validation: event.target.value as ShortTextValidation })
              }
              className={selectClass}
            >
              {VALIDATIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {question.type === "paragraph" || question.type === "date" || question.type === "time" ? (
          <p className="mt-5 w-1/2 border-b border-dotted border-muted-foreground/40 pb-1.5 text-sm text-muted-foreground">
            {question.type === "paragraph"
              ? "Long answer text"
              : question.type === "date"
                ? "Month, day, year"
                : "Time"}
          </p>
        ) : null}

        {issueList}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Move up"
              title="Move up"
              disabled={index === 0}
              onClick={() => onMove(-1)}
              className={iconButton}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Move down"
              title="Move down"
              disabled={index === count - 1}
              onClick={() => onMove(1)}
              className={iconButton}
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Duplicate"
              title="Duplicate"
              disabled={count >= LIMITS.maxQuestions}
              onClick={onDuplicate}
              className={iconButton}
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Delete"
              title="Delete"
              onClick={onRemove}
              className={iconButton}
            >
              <Trash2 className="h-4 w-4" />
            </button>
            {!isSection ? (
              <>
                <span aria-hidden className="mx-2 h-6 w-px bg-border" />
                <span className="mr-2 text-sm text-foreground">Required</span>
                <Switch
                  label="Required"
                  checked={question.required}
                  onChange={(required) => onChange({ ...question, required })}
                />
              </>
            ) : null}
          </div>
        </div>
      </QuestionCard>

      <div className="absolute left-full top-0 ml-3 hidden flex-col gap-1 rounded-lg border border-border bg-card p-1.5 lg:flex">
        <button
          type="button"
          aria-label="Add question below"
          title="Add question"
          disabled={count >= LIMITS.maxQuestions}
          onClick={() => onAddAfter("multiple_choice")}
          className={iconButton}
        >
          <PlusCircle className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Add title and description below"
          title="Add title and description"
          disabled={count >= LIMITS.maxQuestions}
          onClick={() => onAddAfter("section")}
          className={iconButton}
        >
          <Heading className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default QuestionEditor;
