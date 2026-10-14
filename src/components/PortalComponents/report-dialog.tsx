"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Label, Textarea } from "@/components/ui/input";
import { ApiError, apiFetch, errorMessage } from "@/lib/portal/client/api";
import { LIMITS } from "@/lib/portal/constants";
import { REPORT_TOPICS, REPORT_TOPIC_LABEL, reportLimitMessage } from "@/lib/portal/reports";
import type { ReportReceiptDto, ReportStatusDto, ReportTopic } from "@/lib/portal/types";

/** Fired on window when a report changes status, so the count in the menu follows. */
export const REPORTS_CHANGED_EVENT = "portal:reports-changed";

/** The sentence every report window ends on. */
const IN_PERSON = "If there are further problems you would like to discuss in person, reach out to e-board.";

type View =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "form"; preview: boolean }
  | { kind: "waiting"; message: string }
  | { kind: "sent"; stored: boolean };

const InPerson: React.FC = () => (
  <p className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground">{IN_PERSON}</p>
);

/**
 * The Report button in the portal header, for every role, and the window it
 * opens. It is a window rather than a page, so opening it adds nothing to the
 * activity log, and nothing typed here is kept in the browser.
 */
export const ReportButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "loading" });
  const [topic, setTopic] = useState<ReportTopic | "">("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Each opening loads afresh. An answer to an earlier opening is ignored.
  const opening = useRef(0);

  const clear = () => {
    setTopic("");
    setText("");
    setFieldErrors({});
    setFormError(null);
  };

  const load = () => {
    const attempt = ++opening.current;
    setView({ kind: "loading" });
    apiFetch<ReportStatusDto>("/reports/status")
      .then((status) => {
        if (attempt !== opening.current) return;
        setView(
          status.waitMinutes > 0
            ? { kind: "waiting", message: reportLimitMessage(status.waitMinutes) }
            : { kind: "form", preview: status.preview },
        );
      })
      .catch((caught: unknown) => {
        if (attempt !== opening.current) return;
        setView({ kind: "error", message: errorMessage(caught) });
      });
  };

  const change = (next: boolean) => {
    if (next) {
      clear();
      load();
    } else {
      opening.current += 1;
      clear();
    }
    setOpen(next);
  };

  const trimmed = text.trim().length;
  const preview = view.kind === "form" && view.preview;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || trimmed < LIMITS.reportBodyMin) return;
    // The answer belongs to this opening. If the window was closed and opened
    // again meanwhile, it must not clear or change what is on screen now.
    const attempt = opening.current;
    setBusy(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const receipt = await apiFetch<ReportReceiptDto>("/reports", {
        method: "POST",
        body: { topic: topic === "" ? null : topic, body: text },
      });
      if (attempt !== opening.current) return;
      clear();
      setView({ kind: "sent", stored: receipt.stored });
    } catch (caught) {
      if (attempt !== opening.current) return;
      if (caught instanceof ApiError && caught.code === "report_limit") {
        setView({ kind: "waiting", message: caught.message });
      } else if (caught instanceof ApiError && caught.fields.length > 0) {
        setFieldErrors(Object.fromEntries(caught.fields.map((field) => [field.path, field.message])));
      } else {
        setFormError(errorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  };

  const closeButton = (label: string) => (
    <div className="mt-6 flex justify-end">
      <DialogClose asChild>
        <Button variant="accent">{label}</Button>
      </DialogClose>
    </div>
  );

  let content: React.ReactNode;
  if (view.kind === "loading") {
    content = (
      <DialogContent title="Send an anonymous report">
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading
        </div>
      </DialogContent>
    );
  } else if (view.kind === "error") {
    content = (
      <DialogContent title="Send an anonymous report">
        <p role="alert" className="mt-4 rounded-lg border border-danger-border bg-danger-subtle px-3 py-2.5 text-sm text-danger-ink">
          {view.message}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Close</Button>
          </DialogClose>
          <Button variant="accent" onClick={load}>
            Try again
          </Button>
        </div>
      </DialogContent>
    );
  } else if (view.kind === "waiting") {
    content = (
      <DialogContent title="You sent a report recently">
        <p className="mt-4 text-sm text-foreground">{view.message}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          If something needs attention right away, go to e-board directly.
        </p>
        <InPerson />
        {closeButton("Close")}
      </DialogContent>
    );
  } else if (view.kind === "sent") {
    content = (
      <DialogContent title={view.stored ? "Report sent" : "Preview only"}>
        <div className="mt-4 flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-ink" />
          {view.stored ? (
            <div className="space-y-2 text-sm">
              <p className="text-foreground">Your report was sent.</p>
              <p className="text-muted-foreground">
                It is anonymous. Your name is not attached, and the portal does not record who sent it. The
                Founder&apos;s Education admins will see it tomorrow.
              </p>
            </div>
          ) : (
            <p className="text-sm text-foreground">Preview only. Nothing was sent.</p>
          )}
        </div>
        <InPerson />
        {closeButton("Done")}
      </DialogContent>
    );
  } else {
    content = (
      <DialogContent
        title="Send an anonymous report"
        description="Tell the Founder's Education admins about something that is not right. It is anonymous: your name is not attached, and the portal does not record who sent it."
      >
        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          {preview ? (
            <p className="rounded-lg border border-warning-border bg-warning-subtle px-3 py-2.5 text-sm text-warning-ink">
              This is a preview. Nothing you send from here is stored.
            </p>
          ) : null}
          {formError ? (
            <p
              role="alert"
              className="rounded-lg border border-danger-border bg-danger-subtle px-3 py-2.5 text-sm text-danger-ink"
            >
              {formError}
            </p>
          ) : null}
          <div>
            <Label htmlFor="report-topic">Topic</Label>
            <select
              id="report-topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value as ReportTopic | "")}
              aria-invalid={fieldErrors.topic ? true : undefined}
              className="h-10 w-full rounded-lg border border-border bg-field px-3 text-sm text-foreground"
            >
              <option value="">Choose a topic (optional)</option>
              {REPORT_TOPICS.map((value) => (
                <option key={value} value={value}>
                  {REPORT_TOPIC_LABEL[value]}
                </option>
              ))}
            </select>
            {fieldErrors.topic ? <p className="mt-1.5 text-xs text-danger-ink">{fieldErrors.topic}</p> : null}
          </div>
          <div>
            <Label htmlFor="report-body">What happened?</Label>
            <Textarea
              id="report-body"
              rows={6}
              value={text}
              maxLength={LIMITS.reportBody}
              onChange={(event) => setText(event.target.value)}
              aria-invalid={fieldErrors.body ? true : undefined}
              aria-describedby="report-body-hint"
              autoComplete="off"
            />
            <div className="mt-1.5 flex items-start justify-between gap-3 text-xs">
              <p id="report-body-hint" className={fieldErrors.body ? "text-danger-ink" : "text-muted-foreground"}>
                {fieldErrors.body ?? "Leave out details that would identify you unless you want them known."}
              </p>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {text.length.toLocaleString("en-US")} / {LIMITS.reportBody.toLocaleString("en-US")}
              </span>
            </div>
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>The admins see reports from the next day on, with only the day each was sent, never the time.</li>
            <li>You can send one report an hour.</li>
            <li>If something needs attention right away, go to e-board directly.</li>
          </ul>
          <InPerson />
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="accent" disabled={busy || trimmed < LIMITS.reportBodyMin}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send report
            </Button>
          </div>
        </form>
      </DialogContent>
    );
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <button
        type="button"
        onClick={() => change(true)}
        aria-label="Send an anonymous report"
        title="Send an anonymous report"
        className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3 print:hidden"
      >
        <Flag className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Report</span>
      </button>
      {open ? content : null}
    </Dialog>
  );
};
