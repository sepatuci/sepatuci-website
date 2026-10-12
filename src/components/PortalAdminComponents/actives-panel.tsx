"use client";

import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { Check, Copy, Loader2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import {
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  PageHeader,
  useToast,
  type Tone,
} from "@/components/PortalComponents/primitives";
import { ApiError, apiFetch, errorMessage } from "@/lib/portal/client/api";
import { getPortalAuth } from "@/lib/portal/client/firebase";
import { useApi } from "@/lib/portal/client/use-api";
import { formatDate } from "@/lib/portal/dates";
import BulkAddDialog from "./bulk-add-dialog";
import { StartChoice, TemporaryPassword } from "./temporary-password-dialog";
import type {
  AccountState,
  ActiveRowDto,
  ActivesDto,
  CreateActiveResultDto,
  AccountStart,
  InviteLinkDto,
  TemporaryPasswordDto,
} from "@/lib/portal/types";

// "Active" already means the role here, so a working account is called "Set up".
const STATE_CHIPS: Record<AccountState, { label: string; tone: Tone }> = {
  active: { label: "Set up", tone: "success" },
  invited: { label: "Invited", tone: "neutral" },
  needs_mfa: { label: "Needs two-step", tone: "warning" },
  disabled: { label: "Disabled", tone: "danger" },
};

type Pending =
  | { kind: "temporary"; active: ActiveRowDto }
  | { kind: "reset"; active: ActiveRowDto }
  | { kind: "disable"; active: ActiveRowDto }
  | { kind: "remove"; active: ActiveRowDto };

/** Shows a one-time set-password link with a copy button. */
const LinkBox: React.FC<{ link: string }> = ({ link }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{link}</code>
      <Button variant="outline" size="sm" onClick={() => void copy()}>
        {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
};

/** Where admins add and manage active members, who can read pledges' work and change nothing. */
const ActivesPanel: React.FC = () => {
  const notify = useToast();
  const { data, error, loading, reload } = useApi<ActivesDto>("/admin/actives");
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [start, setStart] = useState<AccountStart>("link");
  const [shown, setShown] = useState<{
    title: string;
    note: string;
    link: string | null;
    temporary?: { password: string; name: string; email: string; isNew: boolean };
  } | null>(null);

  const header = (
    <PageHeader
      title="Actives"
      subtitle="Active members can read pledges' progress and responses. They can't change anything."
      actions={
        <>
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            Add several
          </Button>
          <Button variant="accent" onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add active
          </Button>
        </>
      }
    />
  );

  const closeAdd = (open: boolean) => {
    setAddOpen(open);
    if (!open) {
      setName("");
      setEmail("");
      setFieldErrors({});
    }
  };

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFieldErrors({});
    try {
      const result = await apiFetch<CreateActiveResultDto>("/admin/actives", {
        method: "POST",
        body: { displayName: name, email, start },
      });
      let emailed = false;
      const auth = getPortalAuth();
      if (auth && result.temporaryPassword === null) {
        const firstVisit = { url: `${window.location.origin}/login?welcome=1` };
        emailed = await sendPasswordResetEmail(auth, result.active.email, firstVisit)
          .catch(() => sendPasswordResetEmail(auth, result.active.email))
          .then(
            () => true,
            () => false,
          );
      }
      closeAdd(false);
      if (result.temporaryPassword) {
        setShown({
          title: "Account created",
          note: `${result.active.displayName} can now sign in with ${result.active.email}.`,
          link: null,
          temporary: {
            password: result.temporaryPassword,
            name: result.active.displayName,
            email: result.active.email,
            isNew: true,
          },
        });
        reload();
        return;
      }
      setShown({
        title: "Account created",
        note: emailed
          ? `${result.active.displayName} was emailed a link to choose a password. It expires in about an hour. The same link is below in case the email goes astray.`
          : `The email couldn't be sent from here, so pass this link to ${result.active.displayName} yourself. It expires in about an hour.`,
        link: result.inviteLink,
      });
      reload();
    } catch (caught) {
      if (caught instanceof ApiError && caught.fields.length > 0) {
        setFieldErrors(Object.fromEntries(caught.fields.map((field) => [field.path, field.message])));
      } else {
        notify(errorMessage(caught), "danger");
      }
    } finally {
      setBusy(false);
    }
  };

  /** Runs one action on an account, reports the outcome and refreshes the list. */
  const run = async (action: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      notify(success, "success");
      setPending(null);
      reload();
    } catch (caught) {
      notify(errorMessage(caught), "danger");
    } finally {
      setBusy(false);
    }
  };

  const passwordLink = (active: ActiveRowDto) =>
    run(async () => {
      const result = await apiFetch<InviteLinkDto>(`/admin/actives/${active.uid}/invite-link`, {
        method: "POST",
      });
      setShown({
        title: "Set-password link",
        note: `Send this only to ${active.displayName}. It works once and expires in about an hour.`,
        link: result.inviteLink,
      });
    }, "Set-password link created.");

  const temporaryPassword = (active: ActiveRowDto) =>
    run(async () => {
      const result = await apiFetch<TemporaryPasswordDto>(
        `/admin/actives/${active.uid}/temporary-password`,
        { method: "POST" },
      );
      setShown({
        title: "Temporary password",
        note: `${active.displayName} has been signed out everywhere. Their old password no longer works.`,
        link: null,
        temporary: {
          password: result.temporaryPassword,
          name: active.displayName,
          email: active.email,
          isNew: false,
        },
      });
    }, "Temporary password created.");

  if (loading && !data) return <>{header}<LoadingBlock label="Loading actives" /></>;
  if (error && !data) return <>{header}<ErrorNote error={error} onRetry={reload} /></>;
  if (!data) return null;

  return (
    <>
      {header}
      {data.actives.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No actives yet"
          body="Add an active with their name and UCI email. They choose a password, then set up Duo Mobile."
          action={
            <Button variant="accent" onClick={() => setAddOpen(true)}>
              Add the first active
            </Button>
          }
        />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {data.actives.map((active) => {
            const chip = STATE_CHIPS[active.accountState];
            return (
              <div key={active.uid} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{active.displayName}</span>
                    <Chip tone={chip.tone}>{chip.label}</Chip>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {active.email} · added {formatDate(active.createdAt)}
                    {active.lastSignInAt ? ` · last signed in ${formatDate(active.lastSignInAt)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || active.status === "disabled"}
                    onClick={() => void passwordLink(active)}
                  >
                    Get password link
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || active.status === "disabled"}
                    onClick={() => setPending({ kind: "temporary", active })}
                  >
                    Temporary password
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPending({ kind: "reset", active })}>
                    Reset two-step
                  </Button>
                  {active.signInBlocked ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => apiFetch(`/admin/actives/${active.uid}`, { method: "PATCH", body: { status: "active" } }),
                          "Account re-enabled.",
                        )
                      }
                    >
                      Re-enable
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setPending({ kind: "disable", active })}>
                      Disable
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-danger-border text-danger-ink hover:bg-danger-subtle hover:text-danger-ink"
                    onClick={() => {
                      setConfirmEmail("");
                      setPending({ kind: "remove", active });
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <BulkAddDialog open={bulkOpen} onOpenChange={setBulkOpen} kind="active" onDone={reload} />

      <Dialog open={addOpen} onOpenChange={closeAdd}>
        <DialogContent
          title="Add an active"
          description="They choose their own password, set up Duo Mobile, then see a short welcome. It happens once."
        >
          <form onSubmit={add} noValidate className="mt-5 space-y-4">
            <div>
              <Label htmlFor="new-active-name">Full name</Label>
              <Input
                id="new-active-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={fieldErrors.displayName ? true : undefined}
                autoComplete="off"
                autoFocus
              />
              {fieldErrors.displayName ? (
                <p className="mt-1.5 text-xs text-danger-ink">{fieldErrors.displayName}</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="new-active-email">UCI email</Label>
              <Input
                id="new-active-email"
                type="email"
                placeholder="name@uci.edu"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={fieldErrors.email ? true : undefined}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
              {fieldErrors.email ? <p className="mt-1.5 text-xs text-danger-ink">{fieldErrors.email}</p> : null}
            </div>
            <StartChoice value={start} onChange={setStart} name="new-active-start" disabled={busy} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => closeAdd(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="accent"
                disabled={busy || name.trim().length === 0 || email.trim().length === 0}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create account
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={shown !== null} onOpenChange={(open) => (open ? undefined : setShown(null))}>
        <DialogContent
          title={shown?.title ?? ""}
          description={shown?.note}
          persistent={shown?.temporary !== undefined}
        >
          {shown?.link ? <LinkBox link={shown.link} /> : null}
          {shown?.temporary ? (
            <div className="mt-4">
              <TemporaryPassword {...shown.temporary} />
            </div>
          ) : null}
          <div className="mt-6 flex justify-end">
            <DialogClose asChild>
              <Button variant="accent">Done</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pending?.kind === "temporary"}
        onOpenChange={(open) => (open ? undefined : setPending(null))}
        title={`Give ${pending?.active.displayName ?? "them"} a temporary password?`}
        description="They are signed out everywhere and their current password stops working. You pass the new one on, and they choose their own the next time they sign in."
        confirmLabel="Create temporary password"
        busy={busy}
        onConfirm={() => pending && void temporaryPassword(pending.active)}
      />
      <ConfirmDialog
        open={pending?.kind === "reset"}
        onOpenChange={(open) => (open ? undefined : setPending(null))}
        title="Reset two-step verification?"
        description={`${pending?.active.displayName ?? "They"} will be signed out and will set up Duo Mobile again the next time they sign in.`}
        confirmLabel="Reset two-step"
        busy={busy}
        onConfirm={() =>
          pending &&
          void run(
            () => apiFetch(`/admin/actives/${pending.active.uid}/reset-mfa`, { method: "POST" }),
            "Two-step verification reset.",
          )
        }
      />
      <ConfirmDialog
        open={pending?.kind === "disable"}
        onOpenChange={(open) => (open ? undefined : setPending(null))}
        title={`Disable ${pending?.active.displayName ?? "this account"}?`}
        description="They are signed out immediately and can't sign in again until you re-enable the account."
        confirmLabel="Disable account"
        destructive
        busy={busy}
        onConfirm={() =>
          pending &&
          void run(
            () => apiFetch(`/admin/actives/${pending.active.uid}`, { method: "PATCH", body: { status: "disabled" } }),
            "Account disabled.",
          )
        }
      />
      <ConfirmDialog
        open={pending?.kind === "remove"}
        onOpenChange={(open) => (open ? undefined : setPending(null))}
        title={`Remove ${pending?.active.displayName ?? "this account"}?`}
        description="Deletes the account for good. To let them back in later, you would add them again."
        confirmLabel="Remove account"
        destructive
        busy={busy}
        confirmDisabled={confirmEmail.trim().toLowerCase() !== (pending?.active.email ?? "").toLowerCase()}
        onConfirm={() =>
          pending &&
          void run(
            () =>
              apiFetch(
                `/admin/actives/${pending.active.uid}?confirm=${encodeURIComponent(confirmEmail.trim())}`,
                { method: "DELETE" },
              ),
            "Account removed.",
          )
        }
      >
        <div className="mt-4">
          <Label htmlFor="confirm-remove-active">Type their email to confirm</Label>
          <Input
            id="confirm-remove-active"
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
            placeholder={pending?.active.email}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
      </ConfirmDialog>
    </>
  );
};

export default ActivesPanel;
