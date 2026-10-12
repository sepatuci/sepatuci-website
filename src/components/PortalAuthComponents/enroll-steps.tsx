"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import PasscodeForm from "./passcode-form";

interface EnrollStepsProps {
  stage: "intro" | "scan";
  qrUrl: string;
  secretKey: string;
  busy: boolean;
  error: string | null;
  onBegin: () => void;
  onVerify: (code: string) => void;
  onCancel: () => void;
}

const STEPS = [
  "Open Duo Mobile on your phone. It's the same app you use for UCI.",
  "Tap Add, then choose Use QR code.",
  "Scan the code on the next screen, then type in the 6-digit passcode Duo shows.",
];

/** First-time setup of two-step verification with Duo Mobile. */
const EnrollSteps: React.FC<EnrollStepsProps> = ({
  stage,
  qrUrl,
  secretKey,
  busy,
  error,
  onBegin,
  onVerify,
  onCancel,
}) => {
  const [copied, setCopied] = useState(false);

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(secretKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (stage === "intro") {
    return (
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-ink">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <h2 className="text-xl font-medium text-foreground">Set up two-step verification</h2>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          The portal needs a passcode from Duo Mobile each time you sign in. Setting it up takes
          about a minute, and you only do it once.
        </p>
        <ol className="mt-5 space-y-3">
          {STEPS.map((step, index) => (
            <li key={step} className="flex gap-3 text-sm text-foreground/90">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs text-muted-foreground">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        <Button variant="accent" onClick={onBegin} disabled={busy} className="mt-6 h-11 w-full">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Continue
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-medium text-foreground">Scan with Duo Mobile</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        In Duo Mobile, tap Add, choose Use QR code, and point your camera here.
      </p>

      <div className="mt-5 flex justify-center">
        <div className="rounded-xl bg-white p-3">
          <QRCodeSVG value={qrUrl} size={176} level="M" title="Two-step verification QR code" />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
        <p className="text-xs text-muted-foreground">
          Can&apos;t scan? In Duo Mobile choose to enter a key instead, and type this one:
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all font-mono text-sm text-foreground">
            {secretKey.replace(/(.{4})/g, "$1 ").trim()}
          </code>
          <button
            type="button"
            onClick={copyKey}
            aria-label="Copy the setup key"
            className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {copied ? <Check className="h-4 w-4 text-success-ink" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="mt-6">
        <PasscodeForm
          submitLabel="Finish setup"
          busy={busy}
          error={error}
          onSubmit={onVerify}
          onCancel={onCancel}
          cancelLabel="Sign out"
        />
      </div>
    </div>
  );
};

export default EnrollSteps;
