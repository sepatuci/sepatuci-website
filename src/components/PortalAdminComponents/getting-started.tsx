import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Card } from "@/components/PortalComponents/primitives";
import type { AdminOverviewDto } from "@/lib/portal/types";

interface Step {
  title: string;
  detail: string;
  href: string;
  done: boolean;
  optional?: boolean;
}

function stepsFor(overview: AdminOverviewDto): Step[] {
  const { pledges, forms, teams } = overview;
  return [
    {
      title: "Add your pledges",
      detail: "One at a time or a whole class at once. Each one chooses a password and sets up Duo Mobile.",
      href: "/portal/admin",
      done: pledges.length > 0,
    },
    {
      title: "Build the first deliverable",
      detail: "Write the questions, then set when it opens and when it's due.",
      href: "/portal/admin/forms",
      done: forms.length > 0,
    },
    {
      title: "Publish it",
      detail: "Pledges only ever see deliverables you have published.",
      href: "/portal/admin/forms",
      done: forms.some((form) => form.status === "published"),
    },
    {
      title: "Read the responses",
      detail: "Each deliverable has a summary, every response in full and a spreadsheet download.",
      href: "/portal/admin/forms",
      done: forms.some((form) => form.responseCount > 0),
    },
    {
      title: "Group pledges into teams",
      detail: "Everyone starts on their own. Do this whenever teams form.",
      href: "/portal/admin/teams",
      done: teams.length > 0,
      optional: true,
    },
  ];
}

interface GettingStartedProps {
  overview: AdminOverviewDto;
  /** On the Pledges page the list goes away once the essentials are done. */
  hideWhenDone?: boolean;
}

/** A checklist for a new admin, ticked off from what actually exists in the portal. */
const GettingStarted: React.FC<GettingStartedProps> = ({ overview, hideWhenDone = false }) => {
  const steps = stepsFor(overview);
  const essentials = steps.filter((step) => !step.optional);
  const finished = essentials.filter((step) => step.done).length;
  if (hideWhenDone && finished === essentials.length) return null;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-medium text-foreground">Getting started</h2>
        <p className="text-sm text-muted-foreground">
          {finished} of {essentials.length} done
        </p>
      </div>
      <ol className="mt-4 space-y-1">
        {steps.map((step) => (
          <li key={step.title}>
            <Link
              href={step.href}
              className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted"
            >
              {step.done ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-ink" aria-hidden />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {step.title}
                  {step.optional ? (
                    <span className="ml-2 font-normal text-muted-foreground">Optional</span>
                  ) : null}
                  <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{step.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
};

export default GettingStarted;
