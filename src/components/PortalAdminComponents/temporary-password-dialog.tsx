"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { AccountStart } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

interface TemporaryPasswordProps {
  password: string;
  /** Whose it is, for the sentence underneath. */
  name: string;
  email: string;
  /** True for a brand-new account, false when an existing one was given a new password. */
  isNew: boolean;
}

/** A short note an admin can send along with a temporary password. */
export function temporaryPasswordMessage(
  { password, name, email, isNew }: TemporaryPasswordProps,
  origin: string,
): string {
  const firstName = name.split(" ")[0] || name;
  return [
    isNew
      ? `Hi ${firstName}, your Founder's Education portal account is ready.`
      : `Hi ${firstName}, here is a new temporary password for the Founder's Education portal.`,
    `Sign in at ${origin}/login`,
    `Email: ${email}`,
    `Temporary password: ${password}`,
    "It works for 3 days. You'll choose your own password when you sign in.",
  ].join("\n");
}

/**
 * A temporary password on show for the admin to pass on. It appears once:
 * nothing stores it in a form that can be read back.
 */
export const TemporaryPassword: React.FC<TemporaryPasswordProps> = (props) => {
  const { password, name } = props;
  const [copied, setCopied] = useState<"password" | "message" | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    setCopied(null);
    setCopyFailed(false);
  }, [password]);

  const copy = async (what: "password" | "message") => {
    const message = temporaryPasswordMessage(props, window.location.origin);
    try {
      await navigator.clipboard.writeText(what === "password" ? password : message);
      setCopied(what);
      setCopyFailed(false);
    } catch {
      setCopied(null);
      setCopyFailed(true);
    }
  };

  return (
    <div>
      <p className="select-all rounded-lg border border-border bg-muted px-4 py-3 text-center font-mono text-xl tracking-widest text-foreground">
        {password}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        Pass this to {name} yourself. It works for 3 days, and their next sign-in makes them replace
        it with their own. It is shown once, so copy it now.
      </p>
      {copyFailed ? (
        <p role="alert" className="mt-2 text-sm text-danger-ink">
          Copying didn&apos;t work here. Select the password above and copy it by hand.
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void copy("password")}>
          {copied === "password" ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
          {copied === "password" ? "Copied" : "Copy password"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void copy("message")}>
          {copied === "message" ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
          {copied === "message" ? "Copied" : "Copy a message to send"}
        </Button>
      </div>
    </div>
  );
};

const STARTS: { value: AccountStart; label: string; note: string }[] = [
  {
    value: "link",
    label: "Email a link",
    note: "They choose a password from the email. Nothing for you to pass on.",
  },
  {
    value: "temporary_password",
    label: "Temporary password",
    note: "You pass it on yourself. Their first sign-in makes them replace it.",
  },
];

interface StartChoiceProps {
  value: AccountStart;
  onChange: (value: AccountStart) => void;
  /** Keeps the radio group separate when two dialogs are on one page. */
  name: string;
  disabled?: boolean;
}

/** How a new account gets its first password. */
export const StartChoice: React.FC<StartChoiceProps> = ({ value, onChange, name, disabled = false }) => (
  <fieldset disabled={disabled}>
    <legend className="mb-1.5 text-sm font-medium text-foreground">First sign-in</legend>
    <div className="grid gap-2 sm:grid-cols-2">
      {STARTS.map((start) => (
        <label
          key={start.value}
          className={cn(
            "flex cursor-pointer gap-2.5 rounded-lg border p-3 transition-colors",
            value === start.value ? "border-accent bg-accent-subtle" : "border-border hover:bg-muted",
          )}
        >
          <input
            type="radio"
            name={name}
            value={start.value}
            checked={value === start.value}
            onChange={() => onChange(start.value)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
          />
          <span className="min-w-0">
            <span className="block text-sm text-foreground">{start.label}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{start.note}</span>
          </span>
        </label>
      ))}
    </div>
  </fieldset>
);

interface TemporaryPasswordDialogProps extends TemporaryPasswordProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The same, in its own window, for an account that already exists. */
const TemporaryPasswordDialog: React.FC<TemporaryPasswordDialogProps> = ({
  open,
  onOpenChange,
  ...shown
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      title="Temporary password"
      description={`${shown.name} has been signed out everywhere. Their old password no longer works.`}
      persistent
    >
      <div className="mt-4">
        <TemporaryPassword {...shown} />
      </div>
      <div className="mt-6 flex justify-end">
        <Button variant="accent" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default TemporaryPasswordDialog;
