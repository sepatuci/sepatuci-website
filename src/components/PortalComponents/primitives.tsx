"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertCircle, Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import type { ApiError } from "@/lib/portal/client/api";
import { PROGRAM_NAME } from "@/lib/portal/constants";
import { formStateLabel } from "@/lib/portal/form-state";
import type { AccountState, FormState } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

/** Small building blocks shared by every portal screen. */

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("rounded-xl border border-border bg-card", className)} {...props} />
);

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

/** Every page names the programme, so it is always clear these are Founder's Education deliverables. */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => (
  <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-[0.25em] text-accent-ink">
        {PROGRAM_NAME}
      </p>
      <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">{title}</h1>
      {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </div>
);

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  accent: "border-accent/40 bg-accent/15 text-accent-ink",
  success: "border-success-border bg-success-subtle text-success-ink",
  warning: "border-warning-border bg-warning-subtle text-warning-ink",
  danger: "border-danger-border bg-danger-subtle text-danger-ink",
};

interface ChipProps {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}

export const Chip: React.FC<ChipProps> = ({ tone = "neutral", className, children }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
      TONES[tone],
      className,
    )}
  >
    {children}
  </span>
);

export function stateTone(state: FormState, late: boolean): Tone {
  switch (state) {
    case "open":
      return "accent";
    case "open_late":
      return "warning";
    case "submitted":
      return late ? "warning" : "success";
    case "missed":
      return "danger";
    default:
      return "neutral";
  }
}

export const StateChip: React.FC<{ state: FormState; late: boolean }> = ({ state, late }) => (
  <Chip tone={stateTone(state, late)}>{formStateLabel(state, late)}</Chip>
);

/** What each account state is called on screen. "Active" is a role here, so a working account is "Set up". */
export const ACCOUNT_CHIPS: Record<AccountState, { label: string; tone: Tone }> = {
  active: { label: "Set up", tone: "success" },
  invited: { label: "Invited", tone: "neutral" },
  disabled: { label: "Disabled", tone: "danger" },
};

/** Shows a one-time link with a copy button. */
export const LinkBox: React.FC<{ link: string }> = ({ link }) => {
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

export const LoadingBlock: React.FC<{ label?: string }> = ({ label = "Loading" }) => (
  <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground" role="status">
    <Loader2 className="h-6 w-6 animate-spin" />
    <span className="text-sm">{label}</span>
  </div>
);

interface ErrorNoteProps {
  error: ApiError;
  onRetry?: () => void;
}

export const ErrorNote: React.FC<ErrorNoteProps> = ({ error, onRetry }) => (
  <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center" role="alert">
    <AlertCircle className="h-7 w-7 text-danger-ink" />
    <p className="text-sm text-foreground">{error.message}</p>
    {onRetry ? (
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    ) : null}
  </Card>
);

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, body, action }) => (
  <Card className="flex flex-col items-center px-6 py-14 text-center">
    {icon ? <div className="mb-3 text-muted-foreground">{icon}</div> : null}
    <p className="text-base font-medium text-foreground">{title}</p>
    {body ? <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{body}</p> : null}
    {action ? <div className="mt-5">{action}</div> : null}
  </Card>
);

interface ProgressBarProps {
  /** 0 to 100. */
  value: number;
  className?: string;
  label: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ value, className, label }) => {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label}
      className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}
    >
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${clamped}%` }} />
    </div>
  );
};

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
}

export const StatTile: React.FC<StatTileProps> = ({ label, value, hint }) => (
  <Card className="px-5 py-4">
    <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-1.5 text-2xl font-light text-foreground">{value}</p>
    {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
  </Card>
);

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
      checked ? "bg-accent" : "bg-muted-foreground/30",
    )}
  >
    <span
      className={cn(
        "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
        checked ? "left-[18px]" : "left-0.5",
      )}
    />
  </button>
);

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
  confirmDisabled?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
  children,
  confirmDisabled = false,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent title={title} description={description}>
      {children}
      <div className="mt-6 flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button
          variant={destructive ? "destructive" : "accent"}
          onClick={onConfirm}
          disabled={busy || confirmDisabled}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {confirmLabel}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

// ── Toasts ───────────────────────────────────────────────────────────────────

type ToastTone = "neutral" | "success" | "danger";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

type Notify = (message: string, tone?: ToastTone) => void;

const ToastContext = createContext<Notify>(() => undefined);

export const useToast = (): Notify => useContext(ToastContext);

const TOAST_TONES: Record<ToastTone, string> = {
  neutral: "border-border bg-secondary text-foreground",
  success: "border-success-border bg-success-subtle text-success-ink",
  danger: "border-danger-border bg-danger-subtle text-danger-ink",
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const notify = useCallback<Notify>((message, tone = "neutral") => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      {/* Two live regions, both present from the start so a screen reader
          announces whatever lands in them. Problems interrupt; the rest wait. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[300] flex flex-col items-center gap-2 px-4">
        {(["assertive", "polite"] as const).map((urgency) => (
          <div key={urgency} aria-live={urgency} className="flex flex-col items-center gap-2">
            {toasts
              .filter((toast) => (toast.tone === "danger") === (urgency === "assertive"))
              .map((toast) => (
                <div
                  key={toast.id}
                  className={cn(
                    "pointer-events-auto max-w-md rounded-lg border px-4 py-2.5 text-sm shadow-xl",
                    TOAST_TONES[toast.tone],
                  )}
                >
                  {toast.message}
                </div>
              ))}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
