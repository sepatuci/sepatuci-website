"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, CloudOff, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { usePortal, useServerNow } from "@/components/PortalComponents/portal-session";
import {
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  StateChip,
  useToast,
} from "@/components/PortalComponents/primitives";
import { countAnswered, validateAnswers } from "@/lib/portal/answers";
import { ApiError, apiFetch, errorMessage } from "@/lib/portal/client/api";
import { getPortalAuth } from "@/lib/portal/client/firebase";
import { useApi } from "@/lib/portal/client/use-api";
import { PROGRAM_NAME, TIMING } from "@/lib/portal/constants";
import { formatDateTime, formatRelative, msOrNull } from "@/lib/portal/dates";
import { countAnswerable } from "@/lib/portal/form-schema";
import type {
  Answer,
  Answers,
  DraftSavedDto,
  FieldIssue,
  FormCardDto,
  PledgeFormDto,
  SubmitResultDto,
} from "@/lib/portal/types";
import { FormColumn, QuestionCard, TitleCard } from "./form-chrome";
import QuestionField from "./question-field";

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

function errorsByQuestion(issues: FieldIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const id = issue.path.startsWith("answers.") ? issue.path.slice("answers.".length) : "";
    if (id && !(id in errors)) errors[id] = issue.message;
  }
  return errors;
}

const BackLink: React.FC = () => (
  <Link
    href="/portal"
    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
  >
    <ArrowLeft className="h-4 w-4" />
    All deliverables
  </Link>
);

function closedMessage(card: FormCardDto): { title: string; body: string } {
  switch (card.state) {
    case "upcoming":
      return {
        title: "This deliverable isn't open yet",
        body: card.opensAt ? `It opens ${formatDateTime(card.opensAt)}.` : "It opens soon.",
      };
    case "locked": {
      const title = "This deliverable is locked";
      // The earlier deliverable is only named once it has been released.
      const earlier = card.lockedByTitle ? `"${card.lockedByTitle}"` : "an earlier deliverable";
      if (card.lockReason === "prerequisite_missed") {
        return {
          title,
          body: `It unlocks after ${earlier}, which has closed. Talk to the Founder's Education chairs.`,
        };
      }
      return {
        title,
        body: card.lockedByTitle
          ? `Turn in ${earlier} first, and this one opens straight away.`
          : "It opens once you turn in an earlier deliverable, which hasn't been released yet.",
      };
    }
    default:
      return {
        title: "This deliverable is closed",
        body: "It's no longer accepting responses. Talk to the Founder's Education chairs if you need it reopened.",
      };
  }
}

const SaveIndicator: React.FC<{ state: SaveState; onRetry: () => void }> = ({ state, onRetry }) => {
  if (state === "idle") return null;
  if (state === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 text-xs text-warning-ink hover:text-foreground"
      >
        <CloudOff className="h-3.5 w-3.5" />
        Draft not saved. Retry
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
      {state === "saved" ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-success-ink" />
      ) : (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      )}
      {state === "saved" ? "Draft saved" : "Saving"}
    </span>
  );
};

const RETRY_FIRST_MS = 5_000;
const RETRY_MAX_MS = 60_000;

/** A request that is allowed to outlive the page can only carry a small body. */
function fitsKeepalive(answers: Answers): boolean {
  return new TextEncoder().encode(JSON.stringify(answers)).length < 50_000;
}

/** The page a pledge fills a deliverable in on. Drafts save themselves as they type. */
const FormFiller: React.FC<{ formId: string }> = ({ formId }) => {
  const { me } = usePortal();
  const nowMs = useServerNow();
  const notify = useToast();
  const { data, error, loading, reload } = useApi<PledgeFormDto>(`/forms/${formId}`);

  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResultDto | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const latest = useRef<Answers>({});
  const adopted = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  /** When the oldest edit that has not been saved yet was made. */
  const unsavedSince = useRef<number | null>(null);
  const lastSaveAt = useRef(0);
  /** True from an edit until a save that includes it has succeeded. */
  const dirty = useRef(false);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const saveAgain = useRef(false);
  /** Set while the tab is being hidden, so the save is allowed to outlive the page. */
  const leaving = useRef(false);
  const retryDelay = useRef(RETRY_FIRST_MS);
  const turnedIn = useRef(false);
  const mounted = useRef(true);
  const persistRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  /** True while the deliverable is being fetched again after it changed underneath the pledge. */
  const [refreshing, setRefreshing] = useState(false);

  // Take the saved draft once per load, never over what the pledge is typing.
  useEffect(() => {
    if (!data || adopted.current === data.serverNow) return;
    adopted.current = data.serverNow;
    const initial = data.draft?.answers ?? {};
    latest.current = initial;
    setAnswers(initial);
    setErrors({});
    setSaveState(data.card.draftUpdatedAt ? "saved" : "idle");
  }, [data]);

  useEffect(() => {
    if (!loading) setRefreshing(false);
  }, [loading]);

  // One save runs at a time. If two overlapped, a slow one finishing last
  // would put older answers back while the page said "Draft saved". A save that
  // fails is retried on its own, because the pledge may never look at the
  // indicator again before leaving.
  const persist = useCallback((): Promise<boolean> => {
    const stopped = () => turnedIn.current || !mounted.current;
    if (stopped()) return Promise.resolve(false);
    if (inFlight.current) {
      saveAgain.current = true;
      return inFlight.current;
    }
    const run = async (): Promise<boolean> => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      setSaveState("saving");
      try {
        do {
          saveAgain.current = false;
          // Never send one person's answers under another person's sign-in.
          if (getPortalAuth()?.currentUser?.uid !== me.uid) return false;
          const sending = latest.current;
          dirty.current = false;
          unsavedSince.current = null;
          lastSaveAt.current = Date.now();
          await apiFetch<DraftSavedDto>(`/forms/${formId}/draft`, {
            method: "PUT",
            body: { answers: sending },
            keepalive: leaving.current && fitsKeepalive(sending),
          });
        } while (saveAgain.current && !stopped());
        retryDelay.current = RETRY_FIRST_MS;
        if (!stopped()) setSaveState(saveTimer.current === null ? "saved" : "pending");
        return true;
      } catch (caught) {
        if (stopped()) return false;
        if (caught instanceof ApiError && (caught.status === 404 || caught.status === 409)) {
          // It closed, was withdrawn, or was turned in from another tab. Nothing
          // more can be saved, so show the deliverable as it is now.
          dirty.current = false;
          setSaveState("idle");
          setRefreshing(true);
          adopted.current = null;
          reload();
          return false;
        }
        dirty.current = true;
        setSaveState("error");
        if (retryDelay.current === RETRY_FIRST_MS) {
          notify("Your draft isn't saving right now. We'll keep trying, so keep this page open.", "danger");
        }
        saveTimer.current = window.setTimeout(() => {
          saveTimer.current = null;
          void persistRef.current();
        }, retryDelay.current);
        retryDelay.current = Math.min(retryDelay.current * 2, RETRY_MAX_MS);
        return false;
      }
    };
    const started = run().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = started;
    return started;
  }, [formId, me.uid, notify, reload]);
  persistRef.current = persist;

  const cancelPendingSave = () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
  };

  // Saves a few seconds after the last keystroke, at least every so often for
  // someone who types without pausing, and never in quick succession.
  const scheduleSave = useCallback(() => {
    const now = Date.now();
    dirty.current = true;
    unsavedSince.current ??= now;
    setSaveState("pending");
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    const untilMaxWait = TIMING.draftSaveMaxWaitMs - (now - unsavedSince.current);
    const sinceLastSave = now - lastSaveAt.current;
    const delay = Math.max(
      Math.min(TIMING.draftSaveDebounceMs, untilMaxWait),
      TIMING.draftSaveMinIntervalMs - sinceLastSave,
      0,
    );
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void persistRef.current();
    }, delay);
  }, []);

  const update = (questionId: string, answer: Answer | undefined) => {
    const next = { ...latest.current };
    if (answer === undefined) delete next[questionId];
    else next[questionId] = answer;
    latest.current = next;
    setAnswers(next);
    if (questionId in errors) {
      const remaining = { ...errors };
      delete remaining[questionId];
      setErrors(remaining);
    }
    scheduleSave();
  };

  // Switching to another tab, or closing this one, saves straight away. Coming
  // back online retries anything that could not be saved.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden" || !dirty.current) return;
      leaving.current = true;
      void persistRef.current().finally(() => {
        leaving.current = false;
      });
    };
    const onOnline = () => {
      if (dirty.current) void persistRef.current();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // Leaving the page mid-edit still saves what was typed.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (!dirty.current || turnedIn.current) return;
      if (getPortalAuth()?.currentUser?.uid !== me.uid) return;
      const answers = latest.current;
      void apiFetch(`/forms/${formId}/draft`, {
        method: "PUT",
        body: { answers },
        keepalive: fitsKeepalive(answers),
      }).catch(() => undefined);
    };
  }, [formId, me.uid]);

  // Anything not safely stored yet, a failed save included, warns before the tab closes.
  useEffect(() => {
    if (saveState !== "pending" && saveState !== "saving" && saveState !== "error") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  // Turning a deliverable in cannot be undone, so the button checks the
  // answers and then asks before anything is sent.
  const askToSubmit = () => {
    if (!data?.questions || submitting || refreshing) return;
    const validated = validateAnswers(data.questions, latest.current);
    if (validated.ok) {
      setConfirmOpen(true);
      return;
    }
    const found = errorsByQuestion(validated.issues);
    setErrors(found);
    const first = data.questions.find((question) => question.id in found);
    if (first) {
      document.getElementById(`question-${first.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const submit = async () => {
    setConfirmOpen(false);
    if (!data?.questions || submitting || refreshing) return;
    const validated = validateAnswers(data.questions, latest.current);
    if (!validated.ok) {
      const found = errorsByQuestion(validated.issues);
      setErrors(found);
      const first = data.questions.find((question) => question.id in found);
      if (first) {
        document
          .getElementById(`question-${first.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    cancelPendingSave();
    setSubmitting(true);
    try {
      const outcome = await apiFetch<SubmitResultDto>(`/forms/${formId}/submit`, {
        method: "POST",
        body: { answers: validated.value, formVersion: data.version },
      });
      turnedIn.current = true;
      dirty.current = false;
      setSaveState("idle");
      setResult(outcome);
      window.scrollTo({ top: 0 });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "form_changed") {
        // An admin edited the questions meanwhile. Keep what was typed, then
        // show the questions as they are now so the pledge can check them.
        // Typing is paused until they arrive, so nothing is overwritten.
        notify(caught.message, "danger");
        setRefreshing(true);
        if (await persist()) {
          adopted.current = null;
          reload();
        } else {
          setRefreshing(false);
        }
      } else if (caught instanceof ApiError && (caught.status === 409 || caught.status === 404)) {
        // It closed, locked, was withdrawn or was already turned in while this page was open.
        notify(
          caught.status === 404 ? "This deliverable is no longer available." : caught.message,
          "danger",
        );
        dirty.current = false;
        setSaveState("idle");
        setRefreshing(true);
        adopted.current = null;
        reload();
      } else {
        if (caught instanceof ApiError && caught.status === 422 && caught.fields.length > 0) {
          setErrors(errorsByQuestion(caught.fields));
          notify("Some answers need attention.", "danger");
        } else {
          notify(errorMessage(caught), "danger");
        }
        // The save that was due was set aside for the submit, so it is put back.
        scheduleSave();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const clearForm = () => {
    latest.current = {};
    setAnswers({});
    setErrors({});
    setClearOpen(false);
    scheduleSave();
  };

  if (loading && !data) return <LoadingBlock label="Opening the deliverable" />;
  if (error && !data) {
    return (
      <FormColumn>
        <BackLink />
        {error.status === 404 ? (
          <EmptyState
            title="This deliverable isn't available"
            body="It may not have been released to you yet, or the link is wrong."
          />
        ) : (
          <ErrorNote error={error} onRetry={reload} />
        )}
      </FormColumn>
    );
  }
  if (!data) return null;
  const { card, questions } = data;

  if (result) {
    return (
      <FormColumn>
        <TitleCard>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent-ink">
            {PROGRAM_NAME} deliverable
          </p>
          <h1 className="mt-2 text-3xl font-normal text-foreground">{card.title}</h1>
          <p className="mt-4 flex items-center gap-2 text-sm text-foreground">
            <CheckCircle2 className="h-5 w-5 text-success-ink" />
            Your response has been recorded{result.late ? ", and marked late" : ""}.
          </p>
          {result.confirmationMessage ? (
            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
              {result.confirmationMessage}
            </p>
          ) : null}
          <p className="mt-3 text-sm text-muted-foreground">
            Turned in {formatDateTime(result.submittedAt)} by {me.displayName}.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/portal/history/${formId}`}>
              <Button variant="outline">View your response</Button>
            </Link>
            <Link href="/portal">
              <Button variant="accent">Back to deliverables</Button>
            </Link>
          </div>
        </TitleCard>

        {result.unlocked.length > 0 ? (
          <QuestionCard>
            <p className="text-sm font-medium text-foreground">
              {result.unlocked.length === 1 ? "This unlocked your next deliverable" : "This unlocked more deliverables"}
            </p>
            <ul className="mt-3 space-y-2">
              {result.unlocked.map((next) => (
                <li key={next.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">{next.title}</span>
                    {next.dueAt ? (
                      <span className="block text-xs text-muted-foreground">
                        Due {formatDateTime(next.dueAt)}
                      </span>
                    ) : null}
                  </span>
                  <Link href={`/portal/deliverables/${next.id}`}>
                    <Button variant="accent" size="sm">
                      Start
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          </QuestionCard>
        ) : null}
      </FormColumn>
    );
  }

  if (!questions) {
    const submitted = card.state === "submitted";
    const message = submitted
      ? {
          title: "You've turned this in",
          body: card.submittedAt ? `Submitted ${formatDateTime(card.submittedAt)}.` : "",
        }
      : closedMessage(card);
    return (
      <FormColumn>
        <BackLink />
        <TitleCard>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent-ink">
            {PROGRAM_NAME} deliverable
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-normal text-foreground">{card.title}</h1>
            <StateChip state={card.state} late={card.late} />
          </div>
          <div className="mt-5 flex items-start gap-3">
            {submitted ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-ink" />
            ) : (
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">{message.title}</p>
              {message.body ? <p className="mt-1 text-sm text-muted-foreground">{message.body}</p> : null}
            </div>
          </div>
          {submitted ? (
            <Link href={`/portal/history/${formId}`} className="mt-6 inline-block">
              <Button variant="accent">View your response</Button>
            </Link>
          ) : null}
        </TitleCard>
      </FormColumn>
    );
  }

  const dueMs = msOrNull(card.dueAt);
  const total = countAnswerable(questions);
  const answered = countAnswered(questions, answers);
  const hasRequired = questions.some((question) => question.type !== "section" && question.required);

  return (
    <FormColumn>
      <div className="flex items-center justify-between gap-3">
        <BackLink />
        <SaveIndicator state={saveState} onRetry={() => void persist()} />
      </div>
      {saveState === "error" ? (
        <div
          role="alert"
          className="sticky top-20 z-20 rounded-lg border border-warning-border bg-warning-subtle px-5 py-3 text-sm text-warning-ink"
        >
          Your latest changes aren&apos;t saved yet. We&apos;re retrying, so keep this page open and
          check your connection.
        </div>
      ) : null}

      <TitleCard>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent-ink">
          {PROGRAM_NAME} deliverable
        </p>
        <h1 className="mt-2 text-3xl font-normal text-foreground">{card.title}</h1>
        {card.description ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{card.description}</p>
        ) : null}
        <div className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
          <p>
            Signed in as <span className="text-foreground">{me.email}</span>. Your response is
            recorded under your name.
          </p>
          {dueMs !== null ? (
            <p className="mt-1">
              {card.state === "open_late" ? "Was due " : "Due "}
              <span className="text-foreground">{formatDateTime(card.dueAt)}</span>
              {card.state === "open" ? ` (${formatRelative(dueMs, nowMs)})` : ""}
              {card.state === "open"
                ? card.allowLate
                  ? ". After that it can still be turned in, marked late."
                  : ". It closes at the deadline."
                : ""}
            </p>
          ) : null}
          {hasRequired ? <p className="mt-3 text-danger-ink">* Indicates required question</p> : null}
        </div>
      </TitleCard>

      {card.state === "open_late" ? (
        <div
          role="status"
          className="rounded-lg border border-warning-border bg-warning-subtle px-5 py-3.5 text-sm text-warning-ink"
        >
          This deliverable is past due. You can still turn it in, but it will be marked late
          {card.closesAt ? `. Late responses close ${formatDateTime(card.closesAt)}.` : "."}
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          askToSubmit();
        }}
        // Turning a deliverable in is final, so Enter in an answer never does
        // it by accident. Only the Submit button submits.
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
        }}
        className="space-y-3"
      >
        <fieldset disabled={refreshing} className="m-0 min-w-0 space-y-3 border-0 p-0">
          <legend className="sr-only">Questions</legend>
          {questions.map((question) => (
            <QuestionCard
              key={question.id}
              id={`question-${question.id}`}
              invalid={question.id in errors}
            >
              <QuestionField
                question={question}
                answer={answers[question.id]}
                onChange={(answer) => update(question.id, answer)}
                error={errors[question.id] ?? null}
              />
            </QuestionCard>
          ))}
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-4">
            <Button type="submit" variant="accent" disabled={submitting || refreshing} className="px-6">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit
            </Button>
            <span className="text-sm text-muted-foreground">
              {answered} of {total} answered
            </span>
          </div>
          <button
            type="button"
            onClick={() => setClearOpen(true)}
            disabled={answered === 0 || submitting}
            className="rounded px-2 py-1 text-sm text-accent-ink transition-colors hover:bg-accent/10 disabled:opacity-40"
          >
            Clear form
          </button>
        </div>
        <p className="pt-2 text-xs text-muted-foreground">
          Once you submit, your response can&apos;t be changed. Your draft is saved automatically
          until then.
        </p>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Turn this in?"
        description={`You answered ${answered} of ${total} ${total === 1 ? "question" : "questions"}.${
          card.state === "open_late" || (dueMs !== null && nowMs > dueMs + 59_999)
            ? " The deadline has passed, so it will be marked late."
            : ""
        } Once you submit, your response can't be changed.`}
        confirmLabel="Submit"
        busy={submitting}
        onConfirm={() => void submit()}
      />

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent
          title="Clear form?"
          description="This removes all of your answers from every question and can't be undone."
        >
          <div className="mt-6 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="accent" onClick={clearForm}>
              Clear form
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </FormColumn>
  );
};

export default FormFiller;
