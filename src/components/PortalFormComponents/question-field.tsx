"use client";

import { AlertCircle } from "lucide-react";
import { LIMITS } from "@/lib/portal/constants";
import { formatAnswerText } from "@/lib/portal/dates";
import { isHttpUrl } from "@/lib/portal/parse";
import type { Answer, AnswerableQuestion, Question, QuestionOption } from "@/lib/portal/types";
import { cn } from "@/lib/utils";
import { underlineField } from "./form-chrome";

interface QuestionFieldProps {
  question: Question;
  answer: Answer | undefined;
  /** Omit to render the question read-only. Passing undefined as the answer clears it. */
  onChange?: (answer: Answer | undefined) => void;
  error?: string | null;
}

const choiceInput = "h-[18px] w-[18px] shrink-0 accent-accent disabled:opacity-70";

const INPUT_TYPES = { none: "text", number: "text", email: "email", url: "url" } as const;
const PLACEHOLDERS = {
  none: "Your answer",
  number: "A number",
  email: "name@example.com",
  url: "https://",
} as const;

/** Pledge-supplied text. Rendered as a link only when it is a plain http(s) address. */
const AnswerText: React.FC<{ value: string }> = ({ value }) =>
  isHttpUrl(value) ? (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-sm text-accent-ink underline underline-offset-2 hover:text-foreground"
    >
      {value}
    </a>
  ) : (
    <p className="whitespace-pre-wrap break-words text-sm text-foreground">{value}</p>
  );

const NoAnswer: React.FC = () => <p className="text-sm italic text-muted-foreground">No answer</p>;

interface OtherRowProps {
  type: "radio" | "checkbox";
  name: string;
  checked: boolean;
  value: string;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
  onText: (text: string) => void;
}

const OtherRow: React.FC<OtherRowProps> = ({
  type,
  name,
  checked,
  value,
  disabled,
  onToggle,
  onText,
}) => (
  <div className="flex items-center gap-3 py-1.5 text-sm">
    <label className="flex shrink-0 cursor-pointer items-center gap-3">
      <input
        type={type}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onToggle(event.target.checked)}
        className={choiceInput}
      />
      <span>Other:</span>
    </label>
    <input
      type="text"
      aria-label="Other answer"
      value={value}
      maxLength={LIMITS.otherText}
      disabled={disabled}
      onFocus={() => {
        if (!checked) onToggle(true);
      }}
      onChange={(event) => onText(event.target.value)}
      className={cn(underlineField, "py-1")}
    />
  </div>
);

function Options({
  question,
  answer,
  onChange,
}: {
  question: Extract<AnswerableQuestion, { options: QuestionOption[] }>;
  answer: Answer | undefined;
  onChange?: (answer: Answer | undefined) => void;
}) {
  const disabled = !onChange;
  const name = `question-${question.id}`;

  if (question.type === "dropdown") {
    const selected = answer?.kind === "choice" ? (answer.optionId ?? "") : "";
    return (
      <select
        aria-label={question.title}
        value={selected}
        disabled={disabled}
        onChange={(event) =>
          onChange?.(
            event.target.value
              ? { kind: "choice", optionId: event.target.value, other: null }
              : undefined,
          )
        }
        className="h-11 w-full max-w-xs rounded-md border border-border bg-field px-3 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-70"
      >
        <option value="">Choose</option>
        {question.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (question.type === "multiple_choice") {
    const choice = answer?.kind === "choice" ? answer : null;
    return (
      <div role="radiogroup" aria-label={question.title}>
        {question.options.map((option) => (
          <label key={option.id} className="flex cursor-pointer items-center gap-3 py-1.5 text-sm">
            <input
              type="radio"
              name={name}
              checked={choice?.optionId === option.id}
              disabled={disabled}
              onChange={() => onChange?.({ kind: "choice", optionId: option.id, other: null })}
              className={choiceInput}
            />
            <span>{option.label}</span>
          </label>
        ))}
        {question.allowOther ? (
          <OtherRow
            type="radio"
            name={name}
            checked={choice !== null && choice.optionId === null && choice.other !== null}
            value={choice?.other ?? ""}
            disabled={disabled}
            onToggle={() => onChange?.({ kind: "choice", optionId: null, other: choice?.other ?? "" })}
            onText={(text) => onChange?.({ kind: "choice", optionId: null, other: text })}
          />
        ) : null}
        {choice && !question.required && !disabled ? (
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={() => onChange?.(undefined)}
              className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Clear selection
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const choices = answer?.kind === "choices" ? answer : null;
  const selected = new Set(choices?.optionIds ?? []);
  const emit = (optionIds: string[], other: string | null) =>
    onChange?.(
      optionIds.length === 0 && other === null ? undefined : { kind: "choices", optionIds, other },
    );
  return (
    <div role="group" aria-label={question.title}>
      {question.options.map((option) => (
        <label key={option.id} className="flex cursor-pointer items-center gap-3 py-1.5 text-sm">
          <input
            type="checkbox"
            checked={selected.has(option.id)}
            disabled={disabled}
            onChange={(event) => {
              const next = new Set(selected);
              if (event.target.checked) next.add(option.id);
              else next.delete(option.id);
              emit(
                question.options.map((item) => item.id).filter((id) => next.has(id)),
                choices?.other ?? null,
              );
            }}
            className={choiceInput}
          />
          <span>{option.label}</span>
        </label>
      ))}
      {question.allowOther ? (
        <OtherRow
          type="checkbox"
          name={name}
          checked={choices !== null && choices.other !== null}
          value={choices?.other ?? ""}
          disabled={disabled}
          onToggle={(checked) => emit([...selected], checked ? (choices?.other ?? "") : null)}
          onText={(text) => emit([...selected], text)}
        />
      ) : null}
    </div>
  );
}

function Control({
  question,
  answer,
  onChange,
}: {
  question: AnswerableQuestion;
  answer: Answer | undefined;
  onChange?: (answer: Answer | undefined) => void;
}) {
  const readOnly = !onChange;
  const text = answer?.kind === "text" ? answer.value : "";
  const setText = (value: string) =>
    onChange?.(value.length > 0 ? { kind: "text", value } : undefined);

  switch (question.type) {
    case "short_text":
      if (readOnly) return text ? <AnswerText value={text} /> : <NoAnswer />;
      return (
        <input
          type={INPUT_TYPES[question.validation]}
          inputMode={question.validation === "number" ? "decimal" : undefined}
          aria-label={question.title}
          placeholder={PLACEHOLDERS[question.validation]}
          value={text}
          maxLength={LIMITS.shortText}
          onChange={(event) => setText(event.target.value)}
          className={cn(underlineField, "sm:w-1/2")}
        />
      );
    case "paragraph":
      if (readOnly) return text ? <AnswerText value={text} /> : <NoAnswer />;
      return (
        <>
          <textarea
            aria-label={question.title}
            placeholder="Your answer"
            value={text}
            maxLength={LIMITS.paragraph}
            rows={Math.min(12, Math.max(2, text.split("\n").length))}
            onChange={(event) => setText(event.target.value)}
            className={cn(underlineField, "resize-y")}
          />
          {/* The limit only matters to someone close to it, so the count stays out of the way until then. */}
          {text.length >= LIMITS.paragraph * 0.8 ? (
            <p
              className={cn(
                "mt-1.5 text-xs",
                text.length >= LIMITS.paragraph ? "text-warning-ink" : "text-muted-foreground",
              )}
            >
              {text.length.toLocaleString()} of {LIMITS.paragraph.toLocaleString()} characters
              {text.length >= LIMITS.paragraph ? ". That's the limit, so anything more won't be kept." : ""}
            </p>
          ) : null}
        </>
      );
    case "date":
    case "time":
      if (readOnly) {
        return text ? <AnswerText value={formatAnswerText(question.type, text)} /> : <NoAnswer />;
      }
      return (
        <input
          type={question.type}
          aria-label={question.title}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className={cn(underlineField, "w-auto")}
        />
      );
    case "linear_scale": {
      const values = Array.from(
        { length: question.max - question.min + 1 },
        (_, index) => question.min + index,
      );
      const selected = answer?.kind === "scale" ? answer.value : null;
      return (
        <div
          role="radiogroup"
          aria-label={question.title}
          className="flex items-end gap-4 overflow-x-auto pb-1"
        >
          {question.minLabel ? (
            <span className="shrink-0 pb-0.5 text-sm text-muted-foreground">{question.minLabel}</span>
          ) : null}
          {values.map((value) => (
            <label key={value} className="flex cursor-pointer flex-col items-center gap-2.5 text-sm">
              <span>{value}</span>
              <input
                type="radio"
                name={`question-${question.id}`}
                checked={selected === value}
                disabled={readOnly}
                onChange={() => onChange?.({ kind: "scale", value })}
                className={choiceInput}
              />
            </label>
          ))}
          {question.maxLabel ? (
            <span className="shrink-0 pb-0.5 text-sm text-muted-foreground">{question.maxLabel}</span>
          ) : null}
        </div>
      );
    }
    default:
      return <Options question={question} answer={answer} onChange={onChange} />;
  }
}

/** One question as a pledge sees it, either fillable or as a read-only record of an answer. */
const QuestionField: React.FC<QuestionFieldProps> = ({ question, answer, onChange, error }) => {
  if (question.type === "section") {
    return (
      <div>
        <h3 className="text-lg font-medium text-foreground">{question.title || "Untitled section"}</h3>
        {question.description ? (
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">
            {question.description}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <p className="text-base text-foreground">
        {question.title || "Untitled question"}
        {question.required ? (
          <span className="ml-1 text-danger-ink" aria-label="required">
            *
          </span>
        ) : null}
      </p>
      {question.description ? (
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
          {question.description}
        </p>
      ) : null}
      <div className="mt-4">
        <Control question={question} answer={answer} onChange={onChange} />
      </div>
      {error ? (
        <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-danger-ink">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
};

export default QuestionField;
