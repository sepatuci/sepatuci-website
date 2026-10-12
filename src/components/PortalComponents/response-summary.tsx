"use client";

import { QuestionCard } from "@/components/PortalFormComponents/form-chrome";
import type { Bucket, QuestionSummary } from "@/lib/portal/analytics";
import { formatAnswerText } from "@/lib/portal/dates";
import { isHttpUrl } from "@/lib/portal/parse";
import type { QuestionType } from "@/lib/portal/types";

interface SummaryCardProps {
  summary: QuestionSummary;
  /** Lets date and time answers be shown the way people read them. */
  questionType?: QuestionType;
}

export const percent = (count: number, total: number) => (total > 0 ? Math.round((count / total) * 100) : 0);

const BarList: React.FC<{ buckets: Bucket[]; total: number }> = ({ buckets, total }) => (
  <ul className="space-y-3">
    {buckets.map((bucket) => (
      <li key={bucket.label}>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 break-words text-foreground">{bucket.label}</span>
          <span className="shrink-0 text-muted-foreground">
            {bucket.count} ({percent(bucket.count, total)}%)
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${percent(bucket.count, total)}%` }}
          />
        </div>
      </li>
    ))}
  </ul>
);

const Histogram: React.FC<{ buckets: Bucket[] }> = ({ buckets }) => {
  const peak = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return (
    <div className="flex h-36 items-end gap-2">
      {buckets.map((bucket) => (
        <div key={bucket.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-xs text-muted-foreground">{bucket.count}</span>
          <div
            className="w-full max-w-12 rounded-t bg-accent"
            style={{ height: `${Math.max(2, (bucket.count / peak) * 70)}%` }}
          />
          <span className="text-xs text-foreground">{bucket.label}</span>
        </div>
      ))}
    </div>
  );
};

/** One question's answers across every response: bars for choices, a histogram for scales, a list for text. */
export const SummaryCard: React.FC<SummaryCardProps> = ({ summary, questionType = "short_text" }) => (
  <QuestionCard>
    <p className="text-base text-foreground">{summary.title || "Untitled question"}</p>
    <p className="mt-0.5 text-xs text-muted-foreground">
      {summary.answered} {summary.answered === 1 ? "response" : "responses"}
    </p>
    <div className="mt-5">
      {summary.answered === 0 ? (
        <p className="text-sm text-muted-foreground">No responses to this question yet.</p>
      ) : summary.kind === "choice" ? (
        <>
          <BarList buckets={summary.buckets} total={summary.answered} />
          {summary.multiple ? (
            <p className="mt-3 text-xs text-muted-foreground">
              New members could choose more than one, so percentages can add up to more than 100.
            </p>
          ) : null}
          {summary.otherResponses.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                &quot;Other&quot; answers
              </p>
              <ul className="mt-2 space-y-1.5">
                {summary.otherResponses.map((text, index) => (
                  <li key={`${index}-${text}`} className="rounded-md bg-muted/60 px-3 py-2 text-sm text-foreground">
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : summary.kind === "scale" ? (
        <>
          <Histogram buckets={summary.buckets} />
          <p className="mt-4 text-sm text-muted-foreground">
            Average <span className="text-foreground">{summary.average}</span>
            {summary.minLabel || summary.maxLabel
              ? ` · ${summary.buckets[0]?.label} = ${summary.minLabel || "lowest"}, ${
                  summary.buckets[summary.buckets.length - 1]?.label
                } = ${summary.maxLabel || "highest"}`
              : ""}
          </p>
        </>
      ) : (
        <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {summary.responses.map((text, index) => (
            <li
              key={`${index}-${text.slice(0, 24)}`}
              className="whitespace-pre-wrap break-words rounded-md bg-muted/60 px-3 py-2 text-sm text-foreground"
            >
              {/* Only plain http(s) addresses become links. Everything else stays text. */}
              {isHttpUrl(text) ? (
                <a
                  href={text}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-accent-ink underline underline-offset-2 hover:text-foreground"
                >
                  {text}
                </a>
              ) : (
                formatAnswerText(questionType, text)
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  </QuestionCard>
);
