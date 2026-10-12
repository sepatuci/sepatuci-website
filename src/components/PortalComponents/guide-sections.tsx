import { Check } from "lucide-react";
import { DELIVERABLE_STATES, type GuideTopic } from "@/lib/portal/guide";
import { StateChip } from "./primitives";

/** One topic of the guide: a heading, a short paragraph and its points. */
export const GuideTopicBlock: React.FC<{ topic: GuideTopic; headingLevel?: "h1" | "h2" }> = ({
  topic,
  headingLevel = "h2",
}) => {
  const Heading = headingLevel;
  return (
    <section>
      <Heading
        className={
          headingLevel === "h1"
            ? "text-2xl font-light tracking-tight text-foreground sm:text-3xl"
            : "text-lg font-medium text-foreground"
        }
      >
        {topic.title}
      </Heading>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{topic.body}</p>
      {topic.points.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {topic.points.map((point) => (
            <li key={point} className="flex items-start gap-3 text-sm text-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" aria-hidden />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

/** What each label on a deliverable means. */
export const StateLegend: React.FC = () => (
  <div className="rounded-xl border border-border bg-muted/30 p-4">
    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      The labels you&apos;ll see
    </p>
    <dl className="mt-3 space-y-2.5">
      {DELIVERABLE_STATES.map(({ state, late, meaning }) => (
        <div key={state} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <dt className="w-24 shrink-0">
            <StateChip state={state} late={late} />
          </dt>
          <dd className="min-w-0 flex-1 text-sm text-muted-foreground">{meaning}</dd>
        </div>
      ))}
    </dl>
  </div>
);
