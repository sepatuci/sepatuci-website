"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Check, Link2, Lock, Pencil, ShieldOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useServerNow } from "@/components/PortalComponents/portal-session";
import {
  Card,
  Chip,
  ConfirmDialog,
  ErrorNote,
  LoadingBlock,
  ProgressBar,
  StatTile,
  StateChip,
  useToast,
} from "@/components/PortalComponents/primitives";
import { isOnline } from "@/lib/portal/activity";
import { apiFetch, errorMessage } from "@/lib/portal/client/api";
import { useApi } from "@/lib/portal/client/use-api";
import { LIMITS, PROGRAM_NAME } from "@/lib/portal/constants";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatRelative,
  msOrNull,
} from "@/lib/portal/dates";
import { standingFor } from "@/lib/portal/progress";
import type {
  InviteLinkDto,
  PledgeDetailDto,
  PunishmentDto,
  TemporaryPasswordDto,
} from "@/lib/portal/types";
import { ACCOUNT_CHIPS } from "./master-view";
import TemporaryPasswordDialog from "./temporary-password-dialog";

type Pending = "disable" | "temporary_password" | "remove" | "edit" | null;

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="mb-3 mt-10 text-sm font-medium uppercase tracking-wider text-muted-foreground">
    {children}
  </h2>
);

/** Everything about one pledge, and every action an admin can take on their account. */
const PledgeDetail: React.FC<{ uid: string }> = ({ uid }) => {
  const router = useRouter();
  const notify = useToast();
  const nowMs = useServerNow();
  const { data, error, loading, reload } = useApi<PledgeDetailDto>(`/admin/pledges/${uid}`);

  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [editName, setEditName] = useState("");
  const [editClass, setEditClass] = useState("");
  const [punishTitle, setPunishTitle] = useState("");
  const [punishDetails, setPunishDetails] = useState("");
  const [reopen, setReopen] = useState<{ formId: string; title: string } | null>(null);
  const [removing, setRemoving] = useState<PunishmentDto | null>(null);
  const [editTeam, setEditTeam] = useState("");
  const [shownLink, setShownLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [temporary, setTemporary] = useState<string | null>(null);

  const standing = useMemo(
    () => (data ? standingFor(data.pledge, data.forms, nowMs) : null),
    [data, nowMs],
  );

  const back = (
    <Link
      href="/portal/admin"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      All pledges
    </Link>
  );

  if (loading && !data) return <>{back}<LoadingBlock label="Loading pledge" /></>;
  if (error && !data) return <div className="space-y-4">{back}<ErrorNote error={error} onRetry={reload} /></div>;
  if (!data || !standing) return null;

  const { pledge } = data;
  const chip = ACCOUNT_CHIPS[pledge.accountState];
  const disabled = pledge.status === "disabled";
  const lastSeenMs = msOrNull(pledge.activity.lastSeenAt);
  const submissions = new Map(data.submissions.map((submission) => [submission.formId, submission]));
  const assigned = data.forms
    .filter((form) => standing.byForm[form.id]?.state !== "hidden")
    .sort((a, b) => {
      const [dueA, dueB] = [a.settings.dueAt, b.settings.dueAt];
      if (dueA === dueB) return a.title.localeCompare(b.title);
      if (dueA === null) return 1;
      if (dueB === null) return -1;
      return dueA < dueB ? -1 : 1;
    });

  /** Runs one admin action, reports the outcome, and refreshes the page. */
  const run = async (action: () => Promise<unknown>, success: string, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      notify(success, "success");
      setPending(null);
      after?.();
      reload();
    } catch (caught) {
      notify(errorMessage(caught), "danger");
    } finally {
      setBusy(false);
    }
  };

  // The link is shown rather than copied straight away: browsers only allow
  // copying in direct response to a click, and by the time it arrives that click is over.
  const createPasswordLink = () =>
    run(async () => {
      const result = await apiFetch<InviteLinkDto>(`/admin/pledges/${uid}/invite-link`, {
        method: "POST",
      });
      setLinkCopied(false);
      setShownLink(result.inviteLink);
    }, "Set-password link created. It expires in about an hour.");

  const createTemporaryPassword = () =>
    run(async () => {
      const result = await apiFetch<TemporaryPasswordDto>(`/admin/pledges/${uid}/temporary-password`, {
        method: "POST",
      });
      setTemporary(result.temporaryPassword);
    }, "Temporary password created.");

  const copyShownLink = async () => {
    if (!shownLink) return;
    try {
      await navigator.clipboard.writeText(shownLink);
      setLinkCopied(true);
    } catch {
      notify("Copying didn't work here. Select the link and copy it by hand.", "danger");
    }
  };

  const teamName = data.teams.find((team) => team.id === pledge.teamId)?.name ?? null;

  const addPunishment = (event: React.FormEvent) => {
    event.preventDefault();
    void run(
      () =>
        apiFetch(`/admin/pledges/${uid}/punishments`, {
          method: "POST",
          body: { title: punishTitle, details: punishDetails },
        }),
      "Punishment added. The pledge will see it on their dashboard.",
      () => {
        setPunishTitle("");
        setPunishDetails("");
      },
    );
  };

  return (
    <>
      {back}
      <div className="mb-8 mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-accent-ink">
            {PROGRAM_NAME} pledge
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-light tracking-tight text-foreground">{pledge.displayName}</h1>
            <Chip tone={chip.tone}>{chip.label}</Chip>
            {isOnline(lastSeenMs, nowMs) ? <Chip tone="success">Online</Chip> : null}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {pledge.email}
            {pledge.pledgeClass ? ` · ${pledge.pledgeClass} class` : ""} ·{" "}
            {teamName ?? "Working individually"} · added{" "}
            {formatDate(pledge.createdAt)} ·{" "}
            {pledge.onboardedAt
              ? `welcome tour finished ${formatDate(pledge.onboardedAt)}`
              : "has not been through the welcome tour yet"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditName(pledge.displayName);
              setEditClass(pledge.pledgeClass ?? "");
              setEditTeam(teamName ? (pledge.teamId ?? "") : "");
              setPending("edit");
            }}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={createPasswordLink} disabled={busy || disabled}>
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            Get password link
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPending("temporary_password")}
            disabled={busy || disabled}
          >
            <Lock className="mr-1.5 h-3.5 w-3.5" />
            Temporary password
          </Button>
          {/* Both follow whether sign-in is really blocked. An account that is
              only marked disabled gets both, so it can be put right either way. */}
          {disabled || pledge.signInBlocked ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(
                  () => apiFetch(`/admin/pledges/${uid}`, { method: "PATCH", body: { status: "active" } }),
                  "Account re-enabled.",
                )
              }
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Re-enable
            </Button>
          ) : null}
          {pledge.signInBlocked ? null : (
            <Button variant="outline" size="sm" onClick={() => setPending("disable")}>
              <Ban className="mr-1.5 h-3.5 w-3.5" />
              Disable
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="border-danger-border text-danger-ink hover:bg-danger-subtle hover:text-danger-ink"
            onClick={() => {
              setConfirmEmail("");
              setPending("remove");
            }}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      </div>

      {disabled && !pledge.signInBlocked ? (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-warning-border bg-warning-subtle px-5 py-3.5 text-sm text-warning-ink"
        >
          Marked disabled, but sign-in is still on, so this account still works. Disable blocks it.
          Re-enable makes it a normal account again.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card className="col-span-2 px-5 py-4 lg:col-span-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Completion</p>
          <p className="mt-1.5 text-2xl font-light text-foreground">
            {standing.progress.completionPct}%
          </p>
          <ProgressBar
            value={standing.progress.completionPct}
            className="mt-2"
            label="Deliverables turned in"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {standing.progress.submitted} of {standing.progress.released} turned in
            {standing.progress.late > 0 ? `, ${standing.progress.late} late` : ""}
            {standing.progress.missed > 0 ? `, ${standing.progress.missed} missed` : ""}
          </p>
        </Card>
        <StatTile
          label="Time on site"
          value={formatDuration(pledge.activity.totalActiveSeconds)}
          hint="With the portal open and in view"
        />
        <StatTile label="Sessions" value={String(pledge.activity.sessionCount)} />
        <StatTile
          label="Last seen"
          value={lastSeenMs === null ? "Never" : formatRelative(lastSeenMs, nowMs)}
          hint={lastSeenMs === null ? undefined : formatDateTime(pledge.activity.lastSeenAt)}
        />
        <StatTile
          label="Last sign-in"
          value={pledge.lastSignInAt ? formatDate(pledge.lastSignInAt) : "Never"}
        />
      </div>

      <SectionTitle>Deliverables</SectionTitle>
      {assigned.length === 0 ? (
        <Card className="px-5 py-8 text-center text-sm text-muted-foreground">
          No deliverables have been released to this pledge.
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {assigned.map((form) => {
            const evaluated = standing.byForm[form.id];
            const submission = submissions.get(form.id);
            return (
              <div key={form.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/portal/admin/forms/${form.id}`}
                      className="text-sm font-medium text-foreground hover:text-accent-ink"
                    >
                      {form.title}
                    </Link>
                    <StateChip state={evaluated.state} late={evaluated.late} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {submission
                      ? `Turned in ${formatDateTime(submission.submittedAt, true)} · took ${formatDuration(submission.durationSeconds)}`
                      : form.settings.dueAt
                        ? `Due ${formatDateTime(form.settings.dueAt, true)}`
                        : "No deadline"}
                    {evaluated.lockedByTitle ? ` · waiting on "${evaluated.lockedByTitle}"` : ""}
                  </p>
                </div>
                {submission ? (
                  <div className="flex gap-2">
                    <Link href={`/portal/admin/forms/${form.id}?tab=responses&pledge=${uid}`}>
                      <Button variant="outline" size="sm">
                        View response
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReopen({ formId: form.id, title: form.title })}
                    >
                      Reopen
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </Card>
      )}

      <SectionTitle>Punishments</SectionTitle>
      <Card className="p-5">
        <form onSubmit={addPunishment} className="space-y-3">
          <div>
            <Label htmlFor="punishment-title">Add a punishment</Label>
            <Input
              id="punishment-title"
              placeholder="What is it for?"
              maxLength={LIMITS.punishmentTitle}
              value={punishTitle}
              onChange={(event) => setPunishTitle(event.target.value)}
            />
          </div>
          <Textarea
            aria-label="Punishment details"
            placeholder="What the pledge needs to do (optional). They will see this on their dashboard."
            maxLength={LIMITS.punishmentDetails}
            value={punishDetails}
            onChange={(event) => setPunishDetails(event.target.value)}
            className="min-h-20"
          />
          <div className="flex justify-end">
            <Button type="submit" variant="accent" disabled={busy || punishTitle.trim().length === 0}>
              Add punishment
            </Button>
          </div>
        </form>
      </Card>
      {data.punishments.length > 0 ? (
        <Card className="mt-3 divide-y divide-border overflow-hidden">
          {data.punishments.map((punishment) => {
            const active = punishment.status === "active";
            return (
              <div key={punishment.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{punishment.title}</p>
                    <Chip tone={active ? "danger" : "neutral"}>{active ? "Active" : "Resolved"}</Chip>
                  </div>
                  {punishment.details ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {punishment.details}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Added {formatDate(punishment.createdAt)}
                    {punishment.resolvedAt ? ` · resolved ${formatDate(punishment.resolvedAt)}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          apiFetch(`/admin/punishments/${punishment.id}`, {
                            method: "PATCH",
                            body: { status: active ? "resolved" : "active" },
                          }),
                        active ? "Punishment resolved." : "Punishment reopened.",
                      )
                    }
                  >
                    {active ? "Mark resolved" : "Reopen"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setRemoving(punishment)}>
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      ) : null}

      <SectionTitle>Sessions</SectionTitle>
      {data.sessions.length === 0 ? (
        <Card className="px-5 py-8 text-center text-sm text-muted-foreground">
          This pledge hasn&apos;t opened the portal yet.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">Time in</th>
                  <th scope="col" className="px-5 py-3 font-medium">Time out</th>
                  <th scope="col" className="px-5 py-3 font-medium">Length</th>
                  <th scope="col" className="px-5 py-3 font-medium">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.sessions.map((session) => {
                  const startMs = msOrNull(session.startedAt) ?? 0;
                  const endMs = msOrNull(session.endedAt) ?? startMs;
                  const live = session.current && isOnline(endMs, nowMs);
                  return (
                    <tr key={`${session.startedAt}-${session.current}`}>
                      <td className="whitespace-nowrap px-5 py-3 text-foreground">
                        {formatDateTime(session.startedAt, true)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-foreground">
                        {live ? <Chip tone="success">Online now</Chip> : formatDateTime(session.endedAt, true)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                        {formatDuration((endMs - startMs) / 1000)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                        {formatDuration(session.activeSeconds)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        &quot;Active&quot; counts only time with the portal tab open and in view.
      </p>

      <Dialog open={pending === "edit"} onOpenChange={(open) => setPending(open ? "edit" : null)}>
        <DialogContent title="Edit pledge">
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () =>
                  apiFetch(`/admin/pledges/${uid}`, {
                    method: "PATCH",
                    // The team is only sent when it was changed here, so saving a name
                    // never undoes a move made from the Teams page in the meantime.
                    body: {
                      displayName: editName,
                      pledgeClass: editClass,
                      ...(editTeam !== (teamName ? (pledge.teamId ?? "") : "") ? { teamId: editTeam || null } : {}),
                    },
                  }),
                "Saved.",
              );
            }}
          >
            <div>
              <Label htmlFor="edit-pledge-name">Full name</Label>
              <Input
                id="edit-pledge-name"
                value={editName}
                maxLength={LIMITS.displayName}
                onChange={(event) => setEditName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-pledge-class">Pledge class</Label>
              <Input
                id="edit-pledge-class"
                value={editClass}
                maxLength={LIMITS.pledgeClass}
                onChange={(event) => setEditClass(event.target.value)}
              />
            </div>
            {data.teams.length > 0 ? (
              <div>
                <Label htmlFor="edit-pledge-team">Team</Label>
                <select
                  id="edit-pledge-team"
                  value={editTeam}
                  onChange={(event) => setEditTeam(event.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-field px-3 text-sm text-foreground"
                >
                  <option value="">Working individually</option>
                  {data.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="accent" disabled={busy || editName.trim().length === 0}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={shownLink !== null} onOpenChange={(open) => (open ? undefined : setShownLink(null))}>
        <DialogContent
          title="Set-password link"
          description={`Send this only to ${pledge.displayName}. It works once and expires in about an hour.`}
        >
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{shownLink}</code>
            <Button variant="outline" size="sm" onClick={() => void copyShownLink()}>
              {linkCopied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
              {linkCopied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="mt-6 flex justify-end">
            <DialogClose asChild>
              <Button variant="accent">Done</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>

      <TemporaryPasswordDialog
        open={temporary !== null}
        onOpenChange={(open) => (open ? undefined : setTemporary(null))}
        password={temporary ?? ""}
        name={pledge.displayName}
        email={pledge.email}
        isNew={false}
      />
      <ConfirmDialog
        open={pending === "temporary_password"}
        onOpenChange={(open) => setPending(open ? "temporary_password" : null)}
        title={`Give ${pledge.displayName} a temporary password?`}
        description="They are signed out everywhere and their current password stops working. You pass the new one on, and they choose their own the next time they sign in."
        confirmLabel="Create temporary password"
        busy={busy}
        onConfirm={() => void createTemporaryPassword()}
      />
      <ConfirmDialog
        open={pending === "disable"}
        onOpenChange={(open) => setPending(open ? "disable" : null)}
        title={`Disable ${pledge.displayName}?`}
        description="They are signed out immediately and can't sign in again until you re-enable the account. Their responses are kept."
        confirmLabel="Disable account"
        destructive
        busy={busy}
        onConfirm={() =>
          void run(
            () => apiFetch(`/admin/pledges/${uid}`, { method: "PATCH", body: { status: "disabled" } }),
            "Account disabled.",
          )
        }
      />

      <ConfirmDialog
        open={pending === "remove"}
        onOpenChange={(open) => setPending(open ? "remove" : null)}
        title={`Remove ${pledge.displayName}?`}
        description="Deletes the account and everything attached to it: responses, drafts, sessions and punishments. It can't be undone. To keep the history, disable it instead."
        confirmLabel="Remove permanently"
        destructive
        busy={busy}
        confirmDisabled={confirmEmail.trim().toLowerCase() !== pledge.email.toLowerCase()}
        onConfirm={() => {
          if (busy) return;
          setBusy(true);
          apiFetch(`/admin/pledges/${uid}?confirm=${encodeURIComponent(confirmEmail.trim())}`, {
            method: "DELETE",
          })
            .then(() => {
              notify(`${pledge.displayName} was removed.`, "success");
              router.replace("/portal/admin");
            })
            .catch((caught: unknown) => {
              notify(errorMessage(caught), "danger");
              setBusy(false);
            });
        }}
      >
        <div className="mt-4">
          <Label htmlFor="remove-confirm">Type {pledge.email} to confirm</Label>
          <Input
            id="remove-confirm"
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={reopen !== null}
        onOpenChange={(open) => {
          if (!open) setReopen(null);
        }}
        title="Reopen this deliverable?"
        description={`This deletes ${pledge.displayName}'s response to "${reopen?.title ?? ""}" so they can turn it in again, if it is still open. It can't be undone.`}
        confirmLabel="Delete response and reopen"
        destructive
        busy={busy}
        onConfirm={() => {
          if (!reopen) return;
          void run(
            () => apiFetch(`/admin/forms/${reopen.formId}/responses/${uid}`, { method: "DELETE" }),
            "Response deleted. The deliverable is open to them again.",
            () => setReopen(null),
          );
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Remove this punishment?"
        description="It disappears from the pledge's dashboard and from this history. To keep a record, mark it resolved instead."
        confirmLabel="Remove"
        destructive
        busy={busy}
        onConfirm={() => {
          if (!removing) return;
          void run(
            () => apiFetch(`/admin/punishments/${removing.id}`, { method: "DELETE" }),
            "Punishment removed.",
            () => setRemoving(null),
          );
        }}
      />

      {disabled ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldOff className="h-4 w-4" />
          This account is disabled. Its history is kept until you remove it.
        </p>
      ) : null}
    </>
  );
};

export default PledgeDetail;
