"use client";

import { useState } from "react";
import { Check, Circle, Eye, EyeOff, TriangleAlert } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { checkPassword, PASSWORD_MAX_LENGTH, type PasswordOwner } from "@/lib/portal/password";
import { cn } from "@/lib/utils";

interface PasswordFieldsProps {
  password: string;
  confirm: string;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
  /** Whose password this is, so their own name and email can be ruled out. */
  owner: PasswordOwner;
  /** Lets password managers file the new password under the right account. */
  email: string;
  disabled?: boolean;
}

const METER = ["bg-muted", "bg-danger", "bg-warning", "bg-success", "bg-success"] as const;

/**
 * Choosing a new password: the rules as a live checklist, a strength meter,
 * a second field that says whether it matches, and a caps-lock warning. Used
 * wherever someone sets a password, so it always works the same way.
 */
export const PasswordFields: React.FC<PasswordFieldsProps> = ({
  password,
  confirm,
  onPassword,
  onConfirm,
  owner,
  email,
  disabled = false,
}) => {
  const [show, setShow] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [confirmLeft, setConfirmLeft] = useState(false);
  const check = checkPassword(password, owner);
  const typed = password.length > 0;
  const matches = confirm.length > 0 && confirm === password;
  // Not called a mismatch while it is still being typed: only once it is as
  // long as the first, has gone wrong along the way, or the field has been left.
  const mismatch =
    confirm.length > 0 &&
    confirm !== password &&
    (confirmLeft || confirm.length >= password.length || !password.startsWith(confirm));

  const watchCaps = (event: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(event.getModifierState("CapsLock"));

  return (
    <div>
      {/* Present for password managers, which pair a new password with a username. */}
      <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />

      <Label htmlFor="portal-new-password">New password</Label>
      <div className="relative">
        <Input
          id="portal-new-password"
          type={show ? "text" : "password"}
          name="new-password"
          autoComplete="new-password"
          value={password}
          maxLength={PASSWORD_MAX_LENGTH}
          readOnly={disabled}
          onChange={(event) => onPassword(event.target.value)}
          onKeyDown={watchCaps}
          onKeyUp={watchCaps}
          onBlur={() => setCapsLock(false)}
          aria-invalid={typed && !check.ok ? true : undefined}
          aria-describedby="portal-password-rules"
          autoFocus
          className="pr-11"
        />
        <button
          type="button"
          onClick={() => setShow((shown) => !shown)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {/* Always in the page, so that the notice is announced when it appears. */}
      <p className="text-xs text-warning-ink" role="status">
        {capsLock ? (
          <span className="mt-1.5 flex items-center gap-1.5">
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
            Caps Lock is on.
          </span>
        ) : null}
      </p>

      <div className="mt-3 flex items-center gap-3" aria-hidden={!typed}>
        <div className="flex flex-1 gap-1">
          {[1, 2, 3, 4].map((step) => (
            <span
              key={step}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                typed && check.strength >= step ? METER[check.strength] : "bg-muted",
              )}
            />
          ))}
        </div>
        <span className="w-20 text-right text-xs text-muted-foreground" role="status">
          {typed ? check.strengthLabel : ""}
        </span>
      </div>

      <ul id="portal-password-rules" className="mt-3 space-y-1.5">
        {check.rules.map((rule) => (
          <li
            key={rule.id}
            className={cn(
              "flex items-center gap-2 text-xs",
              rule.met ? "text-success-ink" : "text-muted-foreground",
            )}
          >
            {rule.met ? (
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            <span>
              {rule.label}
              <span className="sr-only">{rule.met ? " (met)" : " (not met yet)"}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        A few unrelated words make a strong password that is easy to remember.
      </p>

      <div className="mt-5">
        <Label htmlFor="portal-confirm-password">Type it again</Label>
        <Input
          id="portal-confirm-password"
          type={show ? "text" : "password"}
          name="confirm-password"
          autoComplete="new-password"
          value={confirm}
          maxLength={PASSWORD_MAX_LENGTH}
          readOnly={disabled}
          onChange={(event) => {
            setConfirmLeft(false);
            onConfirm(event.target.value);
          }}
          onKeyDown={watchCaps}
          onKeyUp={watchCaps}
          onBlur={() => {
            setCapsLock(false);
            setConfirmLeft(true);
          }}
          aria-invalid={mismatch ? true : undefined}
        />
        <p
          className={cn(
            "mt-1.5 flex min-h-4 items-center gap-1.5 text-xs",
            matches ? "text-success-ink" : "text-danger-ink",
          )}
          role="status"
        >
          {matches ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden />
              The two match.
            </>
          ) : mismatch ? (
            "These don't match yet."
          ) : null}
        </p>
      </div>
    </div>
  );
};
