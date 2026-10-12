import { cn } from "@/lib/utils";

/**
 * The frame every deliverable form sits in: a narrow centred column of cards,
 * led by a title card with a coloured band along its top edge.
 */

export const FormColumn: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => <div className={cn("mx-auto w-full max-w-[770px] space-y-3", className)} {...props} />;

export const TitleCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="overflow-hidden rounded-lg border border-border bg-card">
    <div className="h-2.5 bg-accent" />
    <div className="px-6 pb-6 pt-5">{children}</div>
  </div>
);

interface QuestionCardProps extends React.HTMLAttributes<HTMLDivElement> {
  invalid?: boolean;
  /** Draws the accent bar down the left edge of the card being edited. */
  active?: boolean;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  invalid = false,
  active = false,
  className,
  children,
  ...props
}) => (
  <div
    className={cn(
      "relative overflow-hidden rounded-lg border bg-card px-6 py-6",
      invalid ? "border-danger" : "border-border",
      className,
    )}
    {...props}
  >
    {active ? <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-accent" /> : null}
    {children}
  </div>
);

/** A text field with only a bottom rule, which thickens in the accent colour on focus. */
export const underlineField =
  "w-full border-0 border-b border-border bg-transparent px-0 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 transition-shadow focus:border-accent focus:shadow-[0_1px_0_0_hsl(var(--accent))] focus:outline-none disabled:cursor-not-allowed disabled:opacity-70";
