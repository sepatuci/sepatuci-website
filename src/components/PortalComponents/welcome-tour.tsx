"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import SetupProgress from "@/components/PortalAuthComponents/setup-progress";
import { errorMessage } from "@/lib/portal/client/api";
import { ORG_NAME } from "@/lib/portal/constants";
import { ACTIVE_WELCOME_STEPS, WELCOME_STEPS } from "@/lib/portal/guide";
import { ROLE_HOME } from "@/lib/portal/roles";
import { cn } from "@/lib/utils";
import { GuideTopicBlock, StateLegend } from "./guide-sections";
import { usePortal } from "./portal-session";
import { Card, useToast } from "./primitives";

/**
 * The first thing a new member sees. A pledge is told what SEP and Founder's
 * Education are and how the portal works; an active is told what they can see
 * and what they cannot. Finishing or skipping it opens the rest of the portal,
 * and it does not come back on later visits. The Guide page has the same content.
 */
const WelcomeTour: React.FC = () => {
  const { me, completeOnboarding } = usePortal();
  const router = useRouter();
  const notify = useToast();
  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);

  // Each screen starts at its top, which matters on a phone after a long one.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [index]);

  const viewer = me.role === "active";
  const steps = viewer ? ACTIVE_WELCOME_STEPS : WELCOME_STEPS;
  const step = steps[index];
  const last = index === steps.length - 1;
  const firstName = me.displayName.split(" ")[0] || me.displayName;

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await completeOnboarding();
      router.replace(ROLE_HOME[me.role]);
    } catch (caught) {
      notify(errorMessage(caught), "danger");
      setFinishing(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* The same steps the choose-a-password page showed, so the two agree on where this sits. */}
      {me.onboardedAt === null ? <SetupProgress current="tour" /> : null}
      <p className="text-xs font-medium uppercase tracking-[0.25em] text-accent-ink">{ORG_NAME}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {index === 0
          ? `Welcome, ${firstName}. ${viewer ? "One minute" : "Two minutes"} on how this works, then you're in.`
          : `Step ${index + 1} of ${steps.length}`}
      </p>

      <Card className="mt-6 p-6 sm:p-8">
        <div className="space-y-8" aria-live="polite">
          {step.topics.map((topic, position) => (
            <GuideTopicBlock key={topic.title} topic={topic} headingLevel={position === 0 ? "h1" : "h2"} />
          ))}
          {step.showStates ? <StateLegend /> : null}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">
          <ol className="flex items-center gap-1.5" aria-label="Progress through the introduction">
            {steps.map((_, position) => (
              <li
                key={position}
                aria-current={position === index ? "step" : undefined}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  position === index ? "w-6 bg-accent" : "w-1.5 bg-muted-foreground/40",
                )}
              >
                <span className="sr-only">
                  Step {position + 1}
                  {position === index ? ", current" : ""}
                </span>
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-2">
            {index > 0 ? (
              <Button variant="ghost" onClick={() => setIndex(index - 1)} disabled={finishing}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
            ) : null}
            {last ? (
              <Button variant="accent" onClick={() => void finish()} disabled={finishing}>
                {finishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {viewer ? "Go to the pledges" : "Go to my deliverables"}
              </Button>
            ) : (
              <Button variant="accent" onClick={() => setIndex(index + 1)}>
                Next
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {last ? null : (
        <button
          type="button"
          onClick={() => void finish()}
          disabled={finishing}
          className="mt-4 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Skip the introduction
        </button>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        It&apos;s all under Guide if you want it later.
      </p>
    </div>
  );
};

export default WelcomeTour;
