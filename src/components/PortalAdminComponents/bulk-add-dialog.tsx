"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { Check, CircleAlert, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ApiError, apiFetch, errorMessage } from "@/lib/portal/client/api";
import { LIMITS } from "@/lib/portal/constants";
import { getPortalAuth } from "@/lib/portal/client/firebase";
import { parseRoster, UNSAFE_NAME_START, type RosterRow } from "@/lib/portal/roster";
import type { AccountStart, MemberRole } from "@/lib/portal/types";
import { StartChoice, temporaryPasswordMessage } from "./temporary-password-dialog";

interface BulkAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: MemberRole;
  /** Called when accounts were created, so the list behind can refresh. */
  onDone: () => void;
}

type Status =
  | { state: "waiting" }
  | { state: "creating" }
  | { state: "created"; emailed: boolean; link: string | null; temporaryPassword: string | null }
  | { state: "failed"; reason: string }
  | { state: "stopped" };

/** What one run was started with. Fixed for the run, whatever is typed afterwards. */
interface Run {
  rows: RosterRow[];
  skipped: RosterRow[];
  start: AccountStart;
}

const ENDPOINT: Record<MemberRole, string> = { pledge: "/admin/pledges", active: "/admin/actives" };
const NOUN: Record<MemberRole, [string, string]> = { pledge: ["new member", "new members"], active: ["active", "actives"] };

// Accounts are created one at a time, a little apart, which keeps a long list
// under the ceiling on how quickly one admin can make changes.
const PACE_MS = 2_500;
// Roughly what one account takes, pause included, for the estimate.
const PER_ACCOUNT_MS = 4_000;

/** A spreadsheet treats a cell starting with one of these as a formula, so it is made plain text. */
const cell = (value: string): string => (UNSAFE_NAME_START.test(value) ? `'${value}` : value);

/** Adds a whole list of people at once: paste, check, create, with a result for every line. */
const BulkAddDialog: React.FC<BulkAddDialogProps> = ({ open, onOpenChange, kind, onDone }) => {
  const [text, setText] = useState("");
  const [pledgeClass, setPledgeClass] = useState("");
  const [start, setStart] = useState<AccountStart>("link");
  const [run, setRun] = useState<Run | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [running, setRunning] = useState(false);
  // Stop was pressed while one account was still being created. The window
  // waits for that one, so its result is never lost.
  const [stopping, setStopping] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [copiedRow, setCopiedRow] = useState<number | null>(null);
  const [warned, setWarned] = useState(false);
  const mounted = useRef(true);
  // Each run has its own number. Stopping, or leaving the page, moves the
  // number on, and a loop that no longer holds the current one ends itself.
  const current = useRef(0);
  // The list the results on screen belong to, so a late answer from an earlier
  // run is never written over a newer one.
  const shownList = useRef<RosterRow[] | null>(null);

  const rows = useMemo(() => parseRoster(text), [text]);
  const usable = rows.filter((row) => row.problem === null);
  const [one, many] = NOUN[kind];

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current += 1;
    };
  }, []);

  const createOne = async (row: RosterRow, how: AccountStart): Promise<Status> => {
    try {
      const result = await apiFetch<{ inviteLink: string | null; temporaryPassword: string | null }>(
        ENDPOINT[kind],
        {
          method: "POST",
          body: {
            displayName: row.displayName,
            email: row.email,
            start: how,
            ...(kind === "pledge" ? { pledgeClass } : {}),
          },
        },
      );
      const auth = getPortalAuth();
      const firstVisit = { url: `${window.location.origin}/login?welcome=1` };
      const emailed =
        auth && how === "link"
          ? await sendPasswordResetEmail(auth, row.email, firstVisit)
              .catch(() => sendPasswordResetEmail(auth, row.email))
              .then(
                () => true,
                () => false,
              )
          : false;
      return {
        state: "created",
        emailed,
        link: result.inviteLink,
        temporaryPassword: result.temporaryPassword,
      };
    } catch (caught) {
      // The reason for this one line, not a general "check the form".
      const reason =
        caught instanceof ApiError ? (caught.fields[0]?.message ?? caught.message) : errorMessage(caught);
      return { state: "failed", reason };
    }
  };

  const begin = async () => {
    if (running || usable.length === 0) return;
    const mine = current.current + 1;
    current.current = mine;
    const list = usable;
    shownList.current = list;
    setRun({ rows: list, skipped: rows.filter((row) => row.problem !== null), start });
    setStatuses(list.map(() => ({ state: "waiting" })));
    setRunning(true);
    setStopping(false);
    setCopied(false);
    setCopyFailed(false);
    setCopiedRow(null);
    setWarned(false);

    // However the run ends, the window settles and the list behind refreshes.
    const finish = () => {
      if (!mounted.current || shownList.current !== list) return;
      setRunning(false);
      setStopping(false);
      onDone();
    };

    const set = (index: number, status: Status) => {
      if (shownList.current !== list) return;
      setStatuses((all) => all.map((item, at) => (at === index ? status : item)));
    };

    for (const [index, row] of list.entries()) {
      if (current.current !== mine) break;
      set(index, { state: "creating" });
      // Stopped while this one was on its way, it still counts: it was created.
      set(index, await createOne(row, start));
      if (current.current !== mine) break;
      if (index < list.length - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, PACE_MS));
      }
    }
    finish();
  };

  /**
   * Ends the run after the account being created right now. The window stays
   * on the results, so nothing created is lost from view.
   */
  const stop = () => {
    current.current += 1;
    setStopping(true);
    setStatuses((all) =>
      all.map((status) => (status.state === "waiting" ? { state: "stopped" } : status)),
    );
  };

  const created = statuses.filter((status) => status.state === "created").length;
  const failed = statuses.filter((status) => status.state === "failed").length;
  const stopped = statuses.filter((status) => status.state === "stopped").length;
  const temporary = run?.start === "temporary_password";
  const finished = run !== null && !running;

  const copyList = async () => {
    if (!run) return;
    const lines = run.rows
      .map((row, index) => {
        const status = statuses[index];
        if (status?.state !== "created") return null;
        const secret = status.temporaryPassword ?? status.link;
        return secret ? [row.displayName, row.email, secret].map(cell).join("\t") : null;
      })
      .filter((line): line is string => line !== null);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setCopyFailed(false);
      setWarned(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  };

  /** One person's password as a ready-to-send note. */
  const copyMessage = async (index: number) => {
    const row = run?.rows[index];
    const status = statuses[index];
    if (!row || status?.state !== "created" || !status.temporaryPassword) return;
    const message = temporaryPasswordMessage(
      { password: status.temporaryPassword, name: row.displayName, email: row.email, isNew: true },
      window.location.origin,
    );
    try {
      await navigator.clipboard.writeText(message);
      setCopiedRow(index);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  };

  const close = (next: boolean, discard = false) => {
    if (next) return onOpenChange(true);
    // A run in progress is ended with Stop, never by a stray click or Escape.
    if (running) return;
    // Before a run, a stray click or Escape only hides the window. The pasted
    // list is still there when it is opened again; Cancel clears it.
    if (run === null && !discard) return onOpenChange(false);
    // Temporary passwords cannot be shown again, so closing without a copy asks once.
    if (finished && temporary && created > 0 && !copied && !warned) {
      setWarned(true);
      return;
    }
    // Nothing is kept once the window closes, links and passwords included.
    shownList.current = null;
    setText("");
    setRun(null);
    setStatuses([]);
    setCopied(false);
    setCopyFailed(false);
    setCopiedRow(null);
    setWarned(false);
    onOpenChange(false);
  };

  const minutes = Math.max(1, Math.round((usable.length * PER_ACCOUNT_MS) / 60_000));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={`Add several ${many}`}
        description={
          run === null
            ? "Paste one person per line: a name and a UCI email, separated by a comma or a tab. Copying two columns from a spreadsheet works."
            : temporary
              ? `Each ${one} starts on a temporary password, which you pass on. They replace it at their first sign-in.`
              : `Each ${one} is emailed a link to choose a password. Links expire in about an hour.`
        }
        className="max-w-2xl"
      >
        {run === null ? (
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="bulk-roster">Names and emails</Label>
              <Textarea
                id="bulk-roster"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={"Avery Chen, avery.chen@uci.edu\nJordan Patel, jordan.patel@uci.edu"}
                className="min-h-36 font-mono text-xs"
                spellCheck={false}
                autoFocus
              />
              {rows.length > 0 ? (
                <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2 text-sm">
                  {rows.map((row) => (
                    <li key={row.line} className="flex items-start gap-2 px-1 py-0.5">
                      {row.problem ? (
                        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger-ink" aria-hidden />
                      ) : (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-ink" aria-hidden />
                      )}
                      <span className="min-w-0">
                        <span className="text-foreground">{row.displayName || `Line ${row.line}`}</span>
                        <span className="text-muted-foreground"> {row.email}</span>
                        {row.problem ? <span className="block text-xs text-danger-ink">{row.problem}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {kind === "pledge" ? (
              <div>
                <Label htmlFor="bulk-class">
                  Class <span className="font-normal text-muted-foreground">(optional, for everyone on the list)</span>
                </Label>
                <Input
                  id="bulk-class"
                  placeholder="Lambda"
                  value={pledgeClass}
                  maxLength={LIMITS.pledgeClass}
                  onChange={(event) => setPledgeClass(event.target.value)}
                  autoComplete="off"
                />
              </div>
            ) : null}
            <StartChoice value={start} onChange={setStart} name={`bulk-start-${kind}`} />
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground">
                {usable.length > 0
                  ? `${usable.length} ready${rows.length > usable.length ? `, ${rows.length - usable.length} to fix or skip` : ""}. About ${minutes} min.`
                  : "Nothing to add yet."}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => close(false, true)}>
                  Cancel
                </Button>
                <Button variant="accent" disabled={usable.length === 0 || running} onClick={() => void begin()}>
                  Create {usable.length || ""} {usable.length === 1 ? "account" : "accounts"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-foreground" role="status">
              {stopping
                ? "Stopping after the account being created now."
                : running
                ? `Creating accounts: ${created + failed} of ${run.rows.length}. Keep this page open.`
                : `${created} created${failed > 0 ? `, ${failed} not created` : ""}${stopped > 0 ? `, ${stopped} not started` : ""}.`}
            </p>
            <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border p-2 text-sm">
              {run.rows.map((row, index) => {
                const status = statuses[index] ?? { state: "waiting" };
                return (
                  <li key={row.email} className="flex items-start gap-2 px-1 py-0.5">
                    {status.state === "created" ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-ink" aria-hidden />
                    ) : status.state === "failed" ? (
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger-ink" aria-hidden />
                    ) : status.state === "creating" ? (
                      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                    ) : (
                      <span className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span className="min-w-0">
                      <span className="text-foreground">{row.displayName}</span>
                      <span className="text-muted-foreground"> {row.email}</span>
                      {status.state === "failed" ? (
                        <span className="block text-xs text-danger-ink">{status.reason}</span>
                      ) : status.state === "stopped" ? (
                        <span className="block text-xs text-muted-foreground">Not started.</span>
                      ) : status.state === "created" && status.temporaryPassword ? (
                        <span className="flex flex-wrap items-center gap-x-3 font-mono text-xs text-foreground">
                          {status.temporaryPassword}
                          <button
                            type="button"
                            onClick={() => void copyMessage(index)}
                            className="font-sans text-accent-ink underline-offset-2 hover:underline"
                          >
                            {copiedRow === index ? "Copied" : "Copy message"}
                          </button>
                        </span>
                      ) : status.state === "created" && !status.emailed && !temporary ? (
                        <span className="block text-xs text-warning-ink">
                          Created, but the email was not sent. Use Copy links and send theirs yourself.
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            {run.skipped.length > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Skipped: {run.skipped.map((row) => `line ${row.line} (${row.problem})`).join(", ")}
              </p>
            ) : null}
            {copyFailed ? (
              <p role="alert" className="mt-3 text-sm text-danger-ink">
                Copying didn&apos;t work here. Select what you need above and copy it by hand.
              </p>
            ) : null}
            {warned ? (
              <p role="alert" className="mt-3 rounded-lg border border-warning-border bg-warning-subtle px-3 py-2.5 text-sm text-warning-ink">
                These passwords are shown once and you haven&apos;t copied them. Copy the list, or close anyway.
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              {finished && created > 0 ? (
                <Button variant="outline" onClick={() => void copyList()}>
                  {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                  {copied ? "Copied" : temporary ? "Copy names and passwords" : "Copy links"}
                </Button>
              ) : null}
              {running ? (
                <Button variant="ghost" onClick={stop} disabled={stopping}>
                  {stopping ? "Stopping" : "Stop"}
                </Button>
              ) : (
                <Button variant="accent" onClick={() => close(false)}>
                  {warned ? "Close anyway" : "Done"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BulkAddDialog;
