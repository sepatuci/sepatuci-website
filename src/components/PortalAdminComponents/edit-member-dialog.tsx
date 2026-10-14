"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/PortalComponents/primitives";
import { ApiError, apiFetch, errorMessage } from "@/lib/portal/client/api";
import { LIMITS } from "@/lib/portal/constants";
import { memberEditPatch, normalizeEmail, type MemberEditFields } from "@/lib/portal/member-edit";
import type { MemberRole } from "@/lib/portal/types";

/** The account being edited, as the page showing it knows it. */
export interface EditableMember {
  uid: string;
  role: MemberRole;
  email: string;
  displayName: string;
  pledgeClass?: string | null;
  teamId?: string | null;
}

interface TeamChoice {
  id: string;
  name: string;
}

interface EditMemberDialogProps {
  /** The account to edit. The dialog is open while this is set. */
  member: EditableMember | null;
  /** The teams to choose from. Class and team are only shown when this is passed. */
  teams?: TeamChoice[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const ENDPOINT: Record<MemberRole, string> = { pledge: "/admin/pledges", active: "/admin/actives" };
const TITLE: Record<MemberRole, string> = { pledge: "Edit pledge", active: "Edit active" };

/** What the form starts from. A team that is no longer in the list counts as none. */
function startingFields(member: EditableMember, teams: TeamChoice[] | undefined): MemberEditFields {
  const fields: MemberEditFields = { displayName: member.displayName, email: member.email };
  if (!teams) return fields;
  const teamId = member.teamId && teams.some((team) => team.id === member.teamId) ? member.teamId : "";
  return { ...fields, pledgeClass: member.pledgeClass ?? "", teamId };
}

/**
 * Changes a pledge's or an active's name and UCI email, and a pledge's class
 * and team. Only what changed is sent. A new address signs the person out, so
 * the dialog says so before it is saved.
 */
export const EditMemberDialog: React.FC<EditMemberDialogProps> = ({ member, teams, onOpenChange, onSaved }) => (
  <Dialog open={member !== null} onOpenChange={onOpenChange}>
    {member ? (
      <DialogContent title={TITLE[member.role]}>
        {/* Keyed, so each opening starts from the account as it is now. */}
        <EditMemberForm
          key={member.uid}
          member={member}
          teams={teams}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </DialogContent>
    ) : null}
  </Dialog>
);

interface EditMemberFormProps {
  member: EditableMember;
  teams: TeamChoice[] | undefined;
  onClose: () => void;
  onSaved: () => void;
}

const EditMemberForm: React.FC<EditMemberFormProps> = ({ member, teams, onClose, onSaved }) => {
  const notify = useToast();
  // Fixed when the form opens, like the draft, so a page that reloads behind
  // the dialog cannot change what counts as a change.
  const [original] = useState(() => startingFields(member, teams));
  const [draft, setDraft] = useState<MemberEditFields>(original);
  // A save that finishes after the dialog was closed must not close whatever
  // the page has opened since.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const patch = memberEditPatch(original, draft);
  const changed = Object.keys(patch).length > 0;
  const movingAddress = patch.email !== undefined;
  const complete = draft.displayName.trim().length > 0 && draft.email.trim().length > 0;

  const update = (next: Partial<MemberEditFields>) => setDraft((current) => ({ ...current, ...next }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !changed) return;
    setBusy(true);
    setFieldErrors({});
    setFormError(null);
    try {
      await apiFetch(`${ENDPOINT[member.role]}/${member.uid}`, { method: "PATCH", body: patch });
      notify(movingAddress ? "Saved. They have been signed out." : "Saved.", "success");
      onSaved();
      if (mounted.current) onClose();
    } catch (caught) {
      if (!mounted.current) {
        notify(errorMessage(caught), "danger");
      } else if (caught instanceof ApiError && caught.fields.length > 0) {
        setFieldErrors(Object.fromEntries(caught.fields.map((field) => [field.path, field.message])));
      } else {
        setFormError(errorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mt-5 space-y-4">
      {formError ? (
        <p
          role="alert"
          className="rounded-lg border border-danger-border bg-danger-subtle px-3 py-2.5 text-sm text-danger-ink"
        >
          {formError}
        </p>
      ) : null}
      <div>
        <Label htmlFor="edit-member-name">Full name</Label>
        <Input
          id="edit-member-name"
          value={draft.displayName}
          maxLength={LIMITS.displayName}
          onChange={(event) => update({ displayName: event.target.value })}
          aria-invalid={fieldErrors.displayName ? true : undefined}
          autoComplete="off"
        />
        {fieldErrors.displayName ? (
          <p className="mt-1.5 text-xs text-danger-ink">{fieldErrors.displayName}</p>
        ) : null}
      </div>
      <div>
        <Label htmlFor="edit-member-email">UCI email</Label>
        <Input
          id="edit-member-email"
          type="email"
          placeholder="name@uci.edu"
          value={draft.email}
          maxLength={254}
          onChange={(event) => update({ email: event.target.value })}
          aria-invalid={fieldErrors.email ? true : undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        {fieldErrors.email ? <p className="mt-1.5 text-xs text-danger-ink">{fieldErrors.email}</p> : null}
      </div>
      {teams ? (
        <>
          <div>
            <Label htmlFor="edit-member-class">Pledge class</Label>
            <Input
              id="edit-member-class"
              value={draft.pledgeClass ?? ""}
              maxLength={LIMITS.pledgeClass}
              onChange={(event) => update({ pledgeClass: event.target.value })}
              aria-invalid={fieldErrors.pledgeClass ? true : undefined}
              autoComplete="off"
            />
            {fieldErrors.pledgeClass ? (
              <p className="mt-1.5 text-xs text-danger-ink">{fieldErrors.pledgeClass}</p>
            ) : null}
          </div>
          {teams.length > 0 ? (
            <div>
              <Label htmlFor="edit-member-team">Team</Label>
              <select
                id="edit-member-team"
                value={draft.teamId ?? ""}
                onChange={(event) => update({ teamId: event.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-field px-3 text-sm text-foreground"
              >
                <option value="">Working individually</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              {fieldErrors.teamId ? <p className="mt-1.5 text-xs text-danger-ink">{fieldErrors.teamId}</p> : null}
            </div>
          ) : null}
        </>
      ) : null}
      {movingAddress ? (
        <p className="rounded-lg border border-warning-border bg-warning-subtle px-3 py-2.5 text-sm text-warning-ink">
          They will be signed out everywhere. From now on they sign in as{" "}
          <span className="font-medium">{normalizeEmail(draft.email)}</span>, with the same password. Check the
          address is right. If they were waiting on a set-password link, send them a new one.
        </p>
      ) : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={busy || !changed || !complete}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {movingAddress ? "Save and sign them out" : "Save"}
        </Button>
      </div>
    </form>
  );
};
