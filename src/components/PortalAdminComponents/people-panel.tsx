"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Search, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import {
  ACCOUNT_CHIPS,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  LinkBox,
  LoadingBlock,
  PageHeader,
  useToast,
} from "@/components/PortalComponents/primitives";
import { apiFetch, errorMessage } from "@/lib/portal/client/api";
import { useApi } from "@/lib/portal/client/use-api";
import { formatDate } from "@/lib/portal/dates";
import type {
  InviteLinkDto,
  MemberRole,
  PeopleDto,
  PersonRowDto,
  Role,
  TemporaryPasswordDto,
} from "@/lib/portal/types";
import BulkAddDialog from "./bulk-add-dialog";
import ChangeRoleDialog from "./change-role-dialog";
import CreateActiveDialog from "./create-active-dialog";
import CreatePledgeDialog from "./create-pledge-dialog";
import { EditMemberDialog } from "./edit-member-dialog";
import PreviewCard from "./preview-card";
import { CopyWarning, TemporaryPassword, useCopyGuard } from "./temporary-password-dialog";

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", active: "Active", pledge: "Pledge" };

/** The groups in the order they appear, each with its heading. */
const GROUPS: { role: Role; title: string }[] = [
  { role: "admin", title: "Admins" },
  { role: "active", title: "Actives" },
  { role: "pledge", title: "Pledges" },
];

/** Where each kind of member's account is managed. Admin accounts have no such actions. */
const ENDPOINT: Record<MemberRole, string> = { pledge: "/admin/pledges", active: "/admin/actives" };

/** The account endpoint for a member, or null for an admin. */
function accountPath(person: PersonRowDto): string | null {
  return person.role === "admin" ? null : `${ENDPOINT[person.role]}/${person.uid}`;
}

type Pending =
  | { kind: "temporary"; person: PersonRowDto }
  | { kind: "disable"; person: PersonRowDto }
  | { kind: "remove"; person: PersonRowDto };

interface Shown {
  title: string;
  note: string;
  link: string | null;
  temporary?: { password: string; name: string; email: string; isNew: boolean };
}

/** Everyone with a portal account, grouped by role, with every action an admin can take on an account. */
const PeoplePanel: React.FC = () => {
  const notify = useToast();
  const { data, error, loading, reload } = useApi<PeopleDto>("/admin/people");
  const [query, setQuery] = useState("");
  const [pledgeOpen, setPledgeOpen] = useState(false);
  const [activeOpen, setActiveOpen] = useState(false);
  const [bulkChoosing, setBulkChoosing] = useState(false);
  const [bulkKind, setBulkKind] = useState<MemberRole>("pledge");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<PersonRowDto | null>(null);
  const [editTarget, setEditTarget] = useState<PersonRowDto | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  // A temporary password leaves with the window, so closing without a copy asks once.
  const guard = useCopyGuard(shown?.temporary?.password ?? null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const people = (data?.people ?? []).filter(
      (person) =>
        needle.length === 0 ||
        person.displayName.toLowerCase().includes(needle) ||
        person.email.toLowerCase().includes(needle),
    );
    return GROUPS.map((group) => ({
      ...group,
      people: people
        .filter((person) => person.role === group.role)
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    })).filter((group) => group.people.length > 0);
  }, [data, query]);

  const startBulk = (kind: MemberRole) => {
    setBulkKind(kind);
    setBulkChoosing(false);
    setBulkOpen(true);
  };

  const header = (
    <PageHeader
      title="People"
      subtitle="Everyone with a portal account: admins, actives and pledges. Edit names and emails, change roles, reset passwords and add accounts here."
      actions={
        <>
          <Button variant="outline" onClick={() => setBulkChoosing(true)}>
            Add several
          </Button>
          <Button variant="outline" onClick={() => setActiveOpen(true)}>
            Add active
          </Button>
          <Button variant="accent" onClick={() => setPledgeOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add pledge
          </Button>
        </>
      }
    />
  );

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

  const passwordLink = (person: PersonRowDto, path: string) =>
    run(async () => {
      const result = await apiFetch<InviteLinkDto>(`${path}/invite-link`, { method: "POST" });
      setShown({
        title: "Set-password link",
        note: `Send this only to ${person.displayName}. It works once and expires in about an hour.`,
        link: result.inviteLink,
      });
    }, "Set-password link created.");

  const temporaryPassword = (person: PersonRowDto, path: string) =>
    run(async () => {
      const result = await apiFetch<TemporaryPasswordDto>(`${path}/temporary-password`, { method: "POST" });
      setShown({
        title: "Temporary password",
        note: `${person.displayName} has been signed out everywhere. Their old password no longer works.`,
        link: null,
        temporary: {
          password: result.temporaryPassword,
          name: person.displayName,
          email: person.email,
          isNew: false,
        },
      });
    }, "Temporary password created.");

  const setStatus = (path: string, status: "active" | "disabled") =>
    run(
      () => apiFetch(path, { method: "PATCH", body: { status } }),
      status === "active" ? "Account re-enabled." : "Account disabled.",
    );

  // Keyed, so the dialogs stay mounted (and keep what they are showing) when
  // the page behind them changes from its empty state to the full list.
  const dialogs = (
    <Fragment key="dialogs">
      <CreatePledgeDialog
        open={pledgeOpen}
        onOpenChange={setPledgeOpen}
        onCreated={reload}
        teams={data?.teams ?? []}
      />
      <CreateActiveDialog open={activeOpen} onOpenChange={setActiveOpen} onCreated={reload} />
      <BulkAddDialog key={bulkKind} open={bulkOpen} onOpenChange={setBulkOpen} kind={bulkKind} onDone={reload} />
      <Dialog open={bulkChoosing} onOpenChange={setBulkChoosing}>
        <DialogContent
          title="Add several"
          description="Paste a list of names and UCI emails. Which kind of account are they?"
        >
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => startBulk("pledge")}>
              Pledges
            </Button>
            <Button variant="outline" onClick={() => startBulk("active")}>
              Actives
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ChangeRoleDialog
        person={roleTarget}
        onOpenChange={(open) => (open ? undefined : setRoleTarget(null))}
        onChanged={reload}
      />
      <EditMemberDialog
        member={
          editTarget && editTarget.role !== "admin"
            ? {
                uid: editTarget.uid,
                role: editTarget.role,
                email: editTarget.email,
                displayName: editTarget.displayName,
              }
            : null
        }
        onOpenChange={(open) => (open ? undefined : setEditTarget(null))}
        onSaved={reload}
      />
    </Fragment>
  );

  if (loading && !data) return <>{header}<LoadingBlock label="Loading people" /></>;
  if (error && !data) return <>{header}<ErrorNote error={error} onRetry={reload} /></>;
  if (!data) return null;

  const preview = (
    <div className="mb-5">
      <PreviewCard preview={data.preview} onChanged={reload} />
    </div>
  );

  if (data.people.length === 0) {
    return (
      <>
        {header}
        {preview}
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No accounts yet"
          body="Add pledges and actives with their name and UCI email. Each one chooses their own password at their first sign-in."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => setBulkChoosing(true)}>
                Add several
              </Button>
              <Button variant="accent" onClick={() => setPledgeOpen(true)}>
                Add the first pledge
              </Button>
            </div>
          }
        />
        {dialogs}
      </>
    );
  }

  return (
    <>
      {header}
      {preview}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search people"
            placeholder="Search by name or email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {data.people.length} {data.people.length === 1 ? "account" : "accounts"}
        </p>
      </div>

      {visible.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
          No one matches &quot;{query.trim()}&quot;.
        </Card>
      ) : (
        <div className="space-y-6">
          {visible.map((group) => (
            <section key={group.role} aria-labelledby={`people-${group.role}`}>
              <h2
                id={`people-${group.role}`}
                className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground"
              >
                {group.title}
                <span className="ml-2 font-normal normal-case tracking-normal">{group.people.length}</span>
              </h2>
              <Card className="divide-y divide-border overflow-hidden">
                {group.people.map((person) => {
                  const chip = ACCOUNT_CHIPS[person.accountState];
                  const path = accountPath(person);
                  const meta = [
                    person.email,
                    person.createdAt ? `added ${formatDate(person.createdAt)}` : null,
                    person.lastSignInAt ? `last signed in ${formatDate(person.lastSignInAt)}` : "never signed in",
                  ].filter((part): part is string => part !== null);
                  return (
                    <div key={person.uid} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
                      <div className="min-w-0 flex-1 basis-56">
                        <div className="flex flex-wrap items-center gap-2">
                          {person.role === "pledge" ? (
                            <Link
                              href={`/portal/admin/pledges/${person.uid}`}
                              className="font-medium text-foreground hover:text-accent-ink"
                            >
                              {person.displayName}
                            </Link>
                          ) : (
                            <span className="font-medium text-foreground">{person.displayName}</span>
                          )}
                          <Chip tone={person.role === "admin" ? "accent" : "neutral"}>
                            {ROLE_LABEL[person.role]}
                          </Chip>
                          <Chip tone={chip.tone}>{chip.label}</Chip>
                          {person.self ? <Chip>You</Chip> : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta.join(" · ")}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/portal/admin/activity/${person.uid}`}>Activity</Link>
                        </Button>
                        {path !== null ? (
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => setEditTarget(person)}>
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            Edit
                          </Button>
                        ) : null}
                        {person.canChangeRole ? (
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => setRoleTarget(person)}>
                            Change role
                          </Button>
                        ) : null}
                        {path !== null ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy || person.status === "disabled"}
                              onClick={() => setPending({ kind: "temporary", person })}
                            >
                              Temporary password
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy || person.status === "disabled"}
                              onClick={() => void passwordLink(person, path)}
                            >
                              Get password link
                            </Button>
                            {/* Both follow whether sign-in is really blocked. An account that is
                                only marked disabled gets both, so it can be put right either way. */}
                            {person.status === "disabled" || person.signInBlocked ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => void setStatus(path, "active")}
                              >
                                Re-enable
                              </Button>
                            ) : null}
                            {person.signInBlocked ? null : (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => setPending({ kind: "disable", person })}
                              >
                                Disable
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-danger-border text-danger-ink hover:bg-danger-subtle hover:text-danger-ink"
                              disabled={busy}
                              onClick={() => {
                                setConfirmEmail("");
                                setPending({ kind: "remove", person });
                              }}
                            >
                              Remove
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}

      {dialogs}

      <Dialog open={shown !== null} onOpenChange={(open) => (open ? undefined : setShown(null))}>
        <DialogContent
          title={shown?.title ?? ""}
          description={shown?.note}
          persistent={shown?.temporary !== undefined}
        >
          {shown?.link ? <LinkBox link={shown.link} /> : null}
          {shown?.temporary ? (
            <div className="mt-4">
              <TemporaryPassword {...shown.temporary} onCopied={guard.onCopied} />
            </div>
          ) : null}
          {guard.warned ? <CopyWarning /> : null}
          <div className="mt-6 flex justify-end">
            <Button
              variant="accent"
              onClick={() => {
                if (guard.confirm()) setShown(null);
              }}
            >
              {guard.warned ? "Close anyway" : "Done"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pending?.kind === "temporary"}
        onOpenChange={(open) => (open ? undefined : setPending(null))}
        title={`Give ${pending?.person.displayName ?? "them"} a temporary password?`}
        description="They are signed out everywhere and their current password stops working. You pass the new one on, and they choose their own the next time they sign in."
        confirmLabel="Create temporary password"
        busy={busy}
        onConfirm={() => {
          if (!pending) return;
          const path = accountPath(pending.person);
          if (path !== null) void temporaryPassword(pending.person, path);
        }}
      />
      <ConfirmDialog
        open={pending?.kind === "disable"}
        onOpenChange={(open) => (open ? undefined : setPending(null))}
        title={`Disable ${pending?.person.displayName ?? "this account"}?`}
        description={
          pending?.person.role === "pledge"
            ? "They are signed out immediately and can't sign in again until you re-enable the account. Their responses are kept."
            : "They are signed out immediately and can't sign in again until you re-enable the account."
        }
        confirmLabel="Disable account"
        destructive
        busy={busy}
        onConfirm={() => {
          if (!pending) return;
          const path = accountPath(pending.person);
          if (path !== null) void setStatus(path, "disabled");
        }}
      />
      <ConfirmDialog
        open={pending?.kind === "remove"}
        onOpenChange={(open) => (open ? undefined : setPending(null))}
        title={`Remove ${pending?.person.displayName ?? "this account"}?`}
        description={
          pending?.person.role === "pledge"
            ? "Deletes the account and everything attached to it: responses, drafts, sessions and punishments. It can't be undone. To keep the history, disable it instead."
            : "Deletes the account for good. To let them back in later, you would add them again."
        }
        confirmLabel={pending?.person.role === "pledge" ? "Remove permanently" : "Remove account"}
        destructive
        busy={busy}
        confirmDisabled={confirmEmail.trim().toLowerCase() !== (pending?.person.email ?? "").toLowerCase()}
        onConfirm={() => {
          if (!pending) return;
          const path = accountPath(pending.person);
          if (path === null) return;
          void run(
            () =>
              apiFetch(`${path}?confirm=${encodeURIComponent(confirmEmail.trim())}`, { method: "DELETE" }),
            "Account removed.",
          );
        }}
      >
        <div className="mt-4">
          <Label htmlFor="confirm-remove-person">Type their email to confirm</Label>
          <Input
            id="confirm-remove-person"
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
            placeholder={pending?.person.email}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
      </ConfirmDialog>
    </>
  );
};

export default PeoplePanel;
