import Link from "next/link";
import { Check, Lock, X } from "lucide-react";
import { formStateLabel } from "@/lib/portal/form-state";
import type { FormState } from "@/lib/portal/types";
import { cn } from "@/lib/utils";
import { Card } from "./primitives";

export interface MatrixRow {
  uid: string;
  displayName: string;
  /** Keyed by deliverable id. A missing entry is treated as not assigned. */
  cells: Record<string, { state: FormState; late: boolean } | undefined>;
}

export interface MatrixForm {
  id: string;
  title: string;
}

interface ProgressMatrixProps {
  rows: MatrixRow[];
  forms: MatrixForm[];
  pledgeHref: (uid: string) => string;
  formHref: (formId: string) => string;
}

const CELL: Record<FormState, string> = {
  submitted: "bg-success text-background",
  missed: "bg-danger text-background",
  open: "border-2 border-accent bg-accent/25",
  open_late: "border-2 border-warning bg-warning-subtle",
  locked: "bg-muted-foreground/30 text-foreground",
  upcoming: "border border-dashed border-muted-foreground/50",
  hidden: "",
};

const cellClass = (state: FormState, late: boolean) =>
  state === "submitted" && late ? "bg-warning text-background" : CELL[state];

// The mark takes the page's background colour, which reads on every fill in both themes.
// Each state has a mark as well as a colour, so the grid does not depend on telling colours apart.
const Glyph: React.FC<{ state: FormState }> = ({ state }) => {
  if (state === "submitted") return <Check className="h-3.5 w-3.5" aria-hidden strokeWidth={3} />;
  if (state === "missed") return <X className="h-3.5 w-3.5" aria-hidden strokeWidth={3} />;
  if (state === "locked") return <Lock className="h-3 w-3" aria-hidden />;
  return null;
};

const LEGEND: { state: FormState; late: boolean; label: string }[] = [
  { state: "submitted", late: false, label: "Submitted" },
  { state: "submitted", late: true, label: "Submitted late" },
  { state: "open", late: false, label: "Open" },
  { state: "open_late", late: true, label: "Past due" },
  { state: "missed", late: false, label: "Missed" },
  { state: "locked", late: false, label: "Locked" },
  { state: "upcoming", late: false, label: "Upcoming" },
];

const Mark: React.FC<{ state: FormState; late: boolean; className?: string }> = ({
  state,
  late,
  className,
}) => (
  <span className={cn("flex items-center justify-center rounded", cellClass(state, late), className)}>
    <Glyph state={state} />
  </span>
);

/** Every pledge against every deliverable, one square each. */
export const ProgressMatrix: React.FC<ProgressMatrixProps> = ({ rows, forms, pledgeHref, formHref }) => (
  <Card className="overflow-hidden">
    {/* "relative" keeps the screen-reader-only labels inside the scrolling area. */}
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="sticky left-0 z-10 bg-card px-5 py-3 font-medium">
              Pledge
            </th>
            {forms.map((form) => (
              <th key={form.id} scope="col" className="px-2 py-3 font-medium" title={form.title}>
                <Link
                  href={formHref(form.id)}
                  className="block w-24 truncate normal-case tracking-normal hover:text-foreground"
                >
                  {form.title}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.uid}>
              <th scope="row" className="sticky left-0 z-10 bg-card px-5 py-3 text-left font-normal">
                <Link
                  href={pledgeHref(row.uid)}
                  className="whitespace-nowrap text-foreground hover:text-accent-ink"
                >
                  {row.displayName}
                </Link>
              </th>
              {forms.map((form) => {
                const cell = row.cells[form.id];
                const state = cell?.state ?? "hidden";
                const late = cell?.late ?? false;
                const label = formStateLabel(state, late);
                return (
                  <td key={form.id} className="px-2 py-3">
                    {state === "hidden" ? (
                      <span className="block w-24 text-muted-foreground/40" title={label}>
                        <span aria-hidden>·</span>
                        <span className="sr-only">{label}</span>
                      </span>
                    ) : (
                      <span className="block w-24" title={`${form.title}: ${label}`}>
                        <Mark state={state} late={late} className="h-5 w-5" />
                        <span className="sr-only">{label}</span>
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
      {LEGEND.map((item) => (
        <span key={item.label} className="flex items-center gap-2">
          <Mark state={item.state} late={item.late} className="h-4 w-4" />
          {item.label}
        </span>
      ))}
    </div>
  </Card>
);
