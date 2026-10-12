"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/PortalComponents/primitives";
import { ApiError, apiFetch, errorMessage } from "@/lib/portal/client/api";
import type { PersonRowDto, Role } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

interface ChangeRoleDialogProps {
  /** Whose role is being changed. Null keeps the window closed. */
  person: PersonRowDto | null;
  onOpenChange: (open: boolean) => void;
  /** Called once the role has changed, so the list behind can refresh. */
  onChanged: () => void;
}

const ROLES: { value: Role; label: string; note: string }[] = [
  { value: "pledge", label: "Pledge", note: "Turns in deliverables and sees their own progress." },
  { value: "active", label: "Active", note: "Reads pledges' progress and responses, changes nothing." },
  { value: "admin", label: "Admin", note: "Manages accounts, teams, deliverables and punishments." },
];

/** What the server's refusals mean, in the admin's terms. Anything else shows the server's own message. */
const REFUSALS: Record<string, string> = {
  cannot_change_self: "You can't change your own role. Ask another admin.",
  listed_admin: "This admin is set in the portal's configuration and can't be changed here.",
  last_admin: "At least one admin has to remain.",
  same_role: "They already have that role.",
  on_temporary_password:
    "They are still on a temporary password. Wait until they have chosen their own, or send them a password link first.",
  invalid_email: "Only a UCI address can be a pledge or an active.",
};

/** Looks a refusal up by its own code only, on the error or on one of its fields. */
function refusalMessage(caught: unknown): string {
  if (caught instanceof ApiError) {
    const codes = [caught.code, ...caught.fields.map((field) => field.code)];
    const known = codes.find((code) => Object.prototype.hasOwnProperty.call(REFUSALS, code));
    if (known !== undefined) return REFUSALS[known];
  }
  return errorMessage(caught);
}

/** Moves one person between pledge, active and admin, and says what that changes for them. */
const ChangeRoleDialog: React.FC<ChangeRoleDialogProps> = ({ person, onOpenChange, onChanged }) => {
  const notify = useToast();
  const [role, setRole] = useState<Role>(person?.role ?? "pledge");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Each person starts from the role they have now.
  useEffect(() => {
    if (!person) return;
    setRole(person.role);
    setError(null);
  }, [person]);

  const unchanged = person === null || role === person.role;

  const consequences = [
    "They are signed out everywhere and get the new access at their next sign-in.",
    ...(person?.role === "pledge"
      ? [
          "Moving a pledge to active or admin takes them off their team and out of pledge progress. Their past responses stay in the deliverables' records.",
        ]
      : []),
    ...(role === "admin" ? ["Admins can change anyone's role, including yours."] : []),
  ];

  const submit = async () => {
    if (!person || busy || unchanged) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/people/${person.uid}/role`, { method: "POST", body: { role } });
      notify("Role changed.", "success");
      onChanged();
      onOpenChange(false);
    } catch (caught) {
      setError(refusalMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={person !== null} onOpenChange={(open) => (busy ? undefined : onOpenChange(open))}>
      <DialogContent
        title={`Change role for ${person?.displayName ?? ""}`}
        description="Pick what they can see and do. Their account and sign-in stay the same."
      >
        <fieldset disabled={busy} className="mt-5">
          <legend className="sr-only">Role</legend>
          <div className="space-y-2">
            {ROLES.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer gap-2.5 rounded-lg border p-3 transition-colors",
                  role === option.value ? "border-accent bg-accent-subtle" : "border-border hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="change-role"
                  value={option.value}
                  checked={role === option.value}
                  onChange={() => {
                    setRole(option.value);
                    // A refusal was about the last choice, not this one.
                    setError(null);
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">
                    {option.label}
                    {person?.role === option.value ? (
                      <span className="ml-2 text-xs text-muted-foreground">Current</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{option.note}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {consequences.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-danger-border bg-danger-subtle px-3 py-2.5 text-sm text-danger-ink"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" onClick={() => void submit()} disabled={busy || unchanged}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Change role
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChangeRoleDialog;
