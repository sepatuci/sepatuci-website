"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

interface PasscodeFormProps {
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (code: string) => void;
  onCancel: () => void;
  cancelLabel?: string;
}

/** The six-digit passcode field used both when signing in and when setting up Duo Mobile. */
const PasscodeForm: React.FC<PasscodeFormProps> = ({
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
  cancelLabel = "Use a different account",
}) => {
  const [code, setCode] = useState("");
  const complete = code.length === 6;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (complete && !busy) onSubmit(code);
      }}
    >
      <Label htmlFor="portal-passcode">6-digit passcode from Duo Mobile</Label>
      <Input
        id="portal-passcode"
        name="one-time-code"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        autoFocus
        placeholder="000000"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "portal-passcode-error" : undefined}
        className="h-14 text-center font-mono text-2xl tracking-[0.5em] placeholder:tracking-[0.5em]"
      />
      {error ? (
        <p id="portal-passcode-error" role="alert" className="mt-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="accent" disabled={!complete || busy} className="mt-5 h-11 w-full">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {submitLabel}
      </Button>
      <button
        type="button"
        onClick={onCancel}
        className="mt-4 w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {cancelLabel}
      </button>
    </form>
  );
};

export default PasscodeForm;
