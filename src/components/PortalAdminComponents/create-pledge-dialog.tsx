"use client";

import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { Check, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { ApiError, apiFetch, errorMessage } from "@/lib/portal/client/api";
import { getPortalAuth } from "@/lib/portal/client/firebase";
import type { AccountStart, CreatePledgeResultDto, TeamDto } from "@/lib/portal/types";
import { StartChoice, TemporaryPassword } from "./temporary-password-dialog";

interface CreatePledgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  /** Existing teams. With none, the pledge simply starts on their own. */
  teams: TeamDto[];
}

interface Created {
  name: string;
  email: string;
  inviteLink: string | null;
  temporaryPassword: string | null;
  emailed: boolean;
}

/**
 * Creates a pledge account. Either the pledge is emailed a one-time link to
 * choose a password (shown here too, in case the email goes astray), or the
 * admin is given a temporary password to pass on, which the pledge has to
 * replace the first time they sign in.
 */
const CreatePledgeDialog: React.FC<CreatePledgeDialogProps> = ({
  open,
  onOpenChange,
  onCreated,
  teams,
}) => {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [pledgeClass, setPledgeClass] = useState("");
  const [teamId, setTeamId] = useState("");
  const [start, setStart] = useState<AccountStart>("link");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = (keepClass: boolean) => {
    setDisplayName("");
    setEmail("");
    if (!keepClass) {
      setPledgeClass("");
      setTeamId("");
    }
    setFieldErrors({});
    setFormError(null);
    setCreated(null);
    setCopied(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const result = await apiFetch<CreatePledgeResultDto>("/admin/pledges", {
        method: "POST",
        body: { displayName, email, pledgeClass, teamId: teamId || null, start },
      });
      let emailed = false;
      const auth = getPortalAuth();
      if (auth && result.temporaryPassword === null) {
        // The link comes back to the sign-in page marked as a first visit. If the
        // site's address is not on Firebase's allowed list yet, a plain link is sent.
        const firstVisit = { url: `${window.location.origin}/login?welcome=1` };
        try {
          await sendPasswordResetEmail(auth, result.pledge.email, firstVisit).catch(() =>
            sendPasswordResetEmail(auth, result.pledge.email),
          );
          emailed = true;
        } catch {
          emailed = false;
        }
      }
      setCreated({
        name: result.pledge.displayName,
        email: result.pledge.email,
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

  const copyLink = async () => {
    if (!created?.inviteLink) return;
    try {
      await navigator.clipboard.writeText(created.inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const close = (next: boolean) => {
    if (!next) reset(false);
    onOpenChange(next);
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
              />
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              {created.emailed
                ? "We emailed them a link to set their password. It expires in about an hour."
                : "The email couldn't be sent from here, so pass the link below to them yourself."}{" "}
              If the link expires, give them a new one from their page.
            </p>
          )}
          {created.inviteLink ? (
            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">
                One-time set-password link. Send it only to {created.name}.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                  {created.inviteLink}
                </code>
                <Button variant="outline" size="sm" onClick={copyLink}>
                  {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => reset(true)}>
              Add another
            </Button>
            <Button variant="accent" onClick={() => close(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      ) : (
        <DialogContent
          title="Add a pledge"
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
              <Label htmlFor="new-pledge-name">Full name</Label>
              <Input
                id="new-pledge-name"
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
              <Label htmlFor="new-pledge-email">UCI email</Label>
              <Input
                id="new-pledge-email"
                type="email"
                placeholder="name@uci.edu"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={fieldErrors.email ? true : undefined}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
              {fieldErrors.email ? (
                <p className="mt-1.5 text-xs text-danger-ink">{fieldErrors.email}</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="new-pledge-class">
                Pledge class <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="new-pledge-class"
                placeholder="Lambda"
                value={pledgeClass}
                onChange={(event) => setPledgeClass(event.target.value)}
                aria-invalid={fieldErrors.pledgeClass ? true : undefined}
                autoComplete="off"
              />
              {fieldErrors.pledgeClass ? (
                <p className="mt-1.5 text-xs text-danger-ink">{fieldErrors.pledgeClass}</p>
              ) : null}
            </div>
            {teams.length > 0 ? (
              <div>
                <Label htmlFor="new-pledge-team">
                  Team <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <select
                  id="new-pledge-team"
                  value={teamId}
                  onChange={(event) => setTeamId(event.target.value)}
                  aria-invalid={fieldErrors.teamId ? true : undefined}
                  className="h-10 w-full rounded-lg border border-border bg-field px-3 text-sm text-foreground"
                >
                  <option value="">Working individually</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.teamId ? (
                  <p className="mt-1.5 text-xs text-danger-ink">{fieldErrors.teamId}</p>
                ) : null}
              </div>
            ) : null}
            <StartChoice value={start} onChange={setStart} name="new-pledge-start" disabled={busy} />
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

export default CreatePledgeDialog;
