"use client";

import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { LinkBox } from "@/components/PortalComponents/primitives";
import { ApiError, apiFetch, errorMessage } from "@/lib/portal/client/api";
import { getPortalAuth } from "@/lib/portal/client/firebase";
import type { AccountStart, CreateActiveResultDto } from "@/lib/portal/types";
import { CopyWarning, StartChoice, TemporaryPassword, useCopyGuard } from "./temporary-password-dialog";

interface CreateActiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface Created {
  name: string;
  email: string;
  inviteLink: string | null;
  temporaryPassword: string | null;
  emailed: boolean;
}

/**
 * Creates an active's account. Either the active is emailed a one-time link to
 * choose a password (shown here too, in case the email goes astray), or the
 * admin is given a temporary password to pass on, which the active has to
 * replace the first time they sign in.
 */
const CreateActiveDialog: React.FC<CreateActiveDialogProps> = ({ open, onOpenChange, onCreated }) => {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [start, setStart] = useState<AccountStart>("link");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  // A temporary password leaves with the window, so leaving without a copy asks once.
  const guard = useCopyGuard(created?.temporaryPassword ?? null);

  const reset = () => {
    setDisplayName("");
    setEmail("");
    setFieldErrors({});
    setFormError(null);
    setCreated(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const result = await apiFetch<CreateActiveResultDto>("/admin/actives", {
        method: "POST",
        body: { displayName, email, start },
      });
      let emailed = false;
      const auth = getPortalAuth();
      if (auth && result.temporaryPassword === null) {
        // The link comes back to the sign-in page marked as a first visit. If the
        // site's address is not on Firebase's allowed list yet, a plain link is sent.
        const firstVisit = { url: `${window.location.origin}/login?welcome=1` };
        emailed = await sendPasswordResetEmail(auth, result.active.email, firstVisit)
          .catch(() => sendPasswordResetEmail(auth, result.active.email))
          .then(
            () => true,
            () => false,
          );
      }
      setCreated({
        name: result.active.displayName,
        email: result.active.email,
        inviteLink: result.inviteLink,
        temporaryPassword: result.temporaryPassword,
        emailed,
      });
      onCreated();
    } catch (caught) {
      if (caught instanceof ApiError && caught.fields.length > 0) {
        setFieldErrors(Object.fromEntries(caught.fields.map((field) => [field.path, field.message])));
      } else {
        setFormError(errorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  /** Leaves the created account behind, once the password on show has been copied or the warning seen. */
  const leave = (then: () => void) => {
    if (guard.confirm()) then();
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      {created ? (
        <DialogContent title="Account created" persistent={created.temporaryPassword !== null}>
          <div className="mt-4 flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-ink" />
            <p className="text-sm text-foreground">
              {created.name} can now sign in with{" "}
              <span className="text-accent-ink">{created.email}</span>.
            </p>
          </div>
          {created.temporaryPassword ? (
            <div className="mt-4">
              <TemporaryPassword
                password={created.temporaryPassword}
                name={created.name}
                email={created.email}
                isNew
                onCopied={guard.onCopied}
              />
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              {created.emailed
                ? "We emailed them a link to set their password. It expires in about an hour."
                : "The email couldn't be sent from here, so pass the link below to them yourself."}{" "}
              If the link expires, give them a new one from the People page.
            </p>
          )}
          {created.inviteLink ? <LinkBox link={created.inviteLink} /> : null}
          {guard.warned ? <CopyWarning /> : null}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => leave(reset)}>
              Add another
            </Button>
            <Button variant="accent" onClick={() => leave(() => close(false))}>
              {guard.warned ? "Close anyway" : "Done"}
            </Button>
          </div>
        </DialogContent>
      ) : (
        <DialogContent
          title="Add an active"
          description="They choose their own password, then see a short welcome. It happens once."
        >
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
              <Label htmlFor="new-active-name">Full name</Label>
              <Input
                id="new-active-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
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
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="accent"
                disabled={busy || displayName.trim().length === 0 || email.trim().length === 0}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create account
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
};

export default CreateActiveDialog;
