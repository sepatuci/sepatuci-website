import { Check } from "lucide-react";
import { isEmulatorPreview } from "@/lib/portal/client/firebase";
import { cn } from "@/lib/utils";

export type SetupStep = "password" | "duo" | "tour";

const LABELS: Record<SetupStep, string> = {
  password: "Password",
  duo: "Duo Mobile",
  tour: "Quick tour",
};

// The local demo has no two-step verification, so it does not promise one.
const STEPS: SetupStep[] = isEmulatorPreview ? ["password", "tour"] : ["password", "duo", "tour"];

/** Where someone is in setting up a new account. Shown only during that first run. */
const SetupProgress: React.FC<{ current: SetupStep }> = ({ current }) => {
  const at = STEPS.indexOf(current);
  if (at === -1) return null;
  return (
    <div className="mb-6 border-b border-border pb-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Setting up your account, step {at + 1} of {STEPS.length}
      </p>
      <ol className="mt-3 flex items-center gap-2">
        {STEPS.map((step, index) => (
          <li
            key={step}
            aria-current={index === at ? "step" : undefined}
            className={cn(
              "flex min-w-0 items-center gap-2",
              index === at ? "flex-1" : "flex-none sm:flex-1",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                index < at && "bg-success-subtle text-success-ink",
                index === at && "bg-accent text-accent-foreground",
                index > at && "bg-muted text-muted-foreground",
              )}
            >
              {index < at ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
            </span>
            <span
              className={cn(
                "truncate text-sm",
                // On a phone only the current step is named; the rest are numbers.
                index === at ? "text-foreground" : "hidden text-muted-foreground sm:inline",
              )}
            >
              {LABELS[step]}
              {index < at ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default SetupProgress;
