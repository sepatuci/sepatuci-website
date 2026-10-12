"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/portal/client/use-api";
import { TIMING } from "@/lib/portal/constants";
import { formatDate, formatDateTime, formatRelative, msOrNull } from "@/lib/portal/dates";
import type { DashboardDto, FormCardDto, PunishmentDto } from "@/lib/portal/types";
import { usePortal, useServerNow } from "./portal-session";
import {
  Card,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  Chip,
  PageHeader,
  ProgressBar,
  StateChip,
} from "./primitives";

function cardDetail(card: FormCardDto, nowMs: number): string {
  const dueMs = msOrNull(card.dueAt);
  switch (card.state) {
    case "open":
      return dueMs === null
        ? "No deadline"
        : `Due ${formatDateTime(card.dueAt)} (${formatRelative(dueMs, nowMs)}). ${
            card.allowLate ? "Late responses are accepted and marked late." : "It closes at the deadline."
          }`;
    case "open_late":
      return `Was due ${formatDateTime(card.dueAt)}. ${
        card.closesAt
          ? `Late responses close ${formatDateTime(card.closesAt)}.`
          : "Late responses are still accepted."
      }`;
    case "upcoming":
      return `Opens ${formatDateTime(card.opensAt)}${
        card.dueAt ? `, due ${formatDateTime(card.dueAt)}` : ""
      }`;
    case "locked": {
      // The earlier deliverable is only named once it has been released.
      const earlier = card.lockedByTitle ? `"${card.lockedByTitle}"` : "an earlier deliverable";
      if (card.lockReason === "prerequisite_missed") {
        return `Locked because ${earlier} closed before you turned it in. Talk to a Founder's Education admin.`;
      }
      return card.lockedByTitle
        ? `Unlocks when you turn in ${earlier}`
        : "Unlocks after an earlier deliverable that hasn't been released yet";
    }
    case "submitted":
      return `Turned in ${formatDateTime(card.submittedAt)}`;
    case "missed":
      return `Closed ${formatDateTime(
        card.allowLate ? (card.closesAt ?? card.dueAt) : card.dueAt,
      )}. If you think this is wrong, talk to a Founder's Education admin.`;
    default:
      return "";
  }
}

const DeliverableCard: React.FC<{ card: FormCardDto; nowMs: number }> = ({ card, nowMs }) => {
  const open = card.state === "open" || card.state === "open_late";
  // Anything due within a day is called out, so the nearest deadline is hard to miss.
  const dueMs = msOrNull(card.dueAt);
  const dueSoon = card.state === "open" && dueMs !== null && dueMs - nowMs < 24 * 60 * 60_000;
  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-medium text-foreground">{card.title}</h3>
          <StateChip state={card.state} late={card.late} />
          {dueSoon ? <Chip tone="warning">Due soon</Chip> : null}
        </div>
        {card.description ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{card.description}</p>
        ) : null}
        <p className="mt-2.5 text-sm text-muted-foreground">
          {cardDetail(card, nowMs)}
          {open && card.draftUpdatedAt ? " Draft saved." : ""}
        </p>
      </div>
      {open ? (
        <Button asChild variant="accent" className="w-full sm:w-auto sm:shrink-0">
          <Link href={`/portal/deliverables/${card.id}`}>
            {card.draftUpdatedAt ? "Continue" : "Start"}
          </Link>
        </Button>
      ) : null}
      {card.state === "submitted" ? (
        <Button asChild variant="outline" className="w-full sm:w-auto sm:shrink-0">
          <Link href={`/portal/history/${card.id}`}>View response</Link>
        </Button>
      ) : null}
    </Card>
  );
};

interface SectionProps {
  title: string;
  cards: FormCardDto[];
  nowMs: number;
}

const Section: React.FC<SectionProps> = ({ title, cards, nowMs }) =>
  cards.length === 0 ? null : (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
        {title} <span className="text-muted-foreground/60">({cards.length})</span>
      </h2>
      <div className="space-y-3">
        {cards.map((card) => (
          <DeliverableCard key={card.id} card={card} nowMs={nowMs} />
        ))}
      </div>
    </section>
  );

/** Shown only when the pledge has at least one active punishment. */
const PunishmentAlert: React.FC<{ punishments: PunishmentDto[] }> = ({ punishments }) => (
  <div role="alert" className="mb-8 rounded-xl border border-danger-border bg-danger-subtle p-5">
    <div className="flex items-center gap-2.5 text-danger-ink">
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <h2 className="text-base font-medium">
        {punishments.length === 1
          ? "You have a punishment"
          : `You have ${punishments.length} punishments`}
      </h2>
    </div>
    <ul className="mt-4 space-y-4">
      {punishments.map((punishment) => (
        <li key={punishment.id} className="border-l-2 border-danger-border pl-4">
          <p className="text-sm font-medium text-foreground">{punishment.title}</p>
          {punishment.details ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-danger-ink/90">{punishment.details}</p>
          ) : null}
          <p className="mt-1.5 text-xs text-danger-ink/70">Assigned {formatDate(punishment.createdAt)}</p>
        </li>
      ))}
    </ul>
    <p className="mt-4 text-xs text-danger-ink/70">
      {punishments.length === 1
        ? "It stays here until an admin marks it resolved."
        : "They stay here until an admin marks them resolved."}{" "}
      Questions? Talk to a Founder&apos;s Education admin.
    </p>
  </div>
);

const PledgeDashboard: React.FC = () => {
  const { me } = usePortal();
  const nowMs = useServerNow();
  const { data, error, loading, reload } = useApi<DashboardDto>("/dashboard");

  // Deliverables open and close on a schedule, so the list refreshes itself:
  // every few minutes while it is in view, and when the pledge comes back to
  // the tab after a while away. A hidden tab asks for nothing.
  const refreshedAt = useRef(Date.now());
  useEffect(() => {
    const refresh = (minimumAgeMs: number) => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - refreshedAt.current < minimumAgeMs) return;
      refreshedAt.current = Date.now();
      reload();
    };
    const timer = window.setInterval(() => refresh(0), TIMING.dashboardRefreshMs);
    const onVisibility = () => refresh(60_000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reload]);

  const firstName = me.displayName.split(" ")[0] || me.displayName;
  const header = (
    <PageHeader
      title="Deliverables"
      subtitle={`Hi ${firstName}. These are your Founder's Education deliverables.${
        me.team ? ` You're on ${me.team.name}.` : ""
      }`}
    />
  );

  if (loading && !data) return <>{header}<LoadingBlock label="Loading your deliverables" /></>;
  if (error && !data) return <>{header}<ErrorNote error={error} onRetry={reload} /></>;
  if (!data) return null;

  const { forms, progress, punishments } = data;
  const of = (...states: FormCardDto["state"][]) =>
    forms.filter((card) => states.includes(card.state));
  const done = of("submitted").sort((a, b) =>
    (a.submittedAt ?? "") < (b.submittedAt ?? "") ? 1 : -1,
  );

  return (
    <>
      {header}
      {punishments.length > 0 ? <PunishmentAlert punishments={punishments} /> : null}

      {forms.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title="Nothing to turn in yet"
          body="When an admin releases a deliverable, it shows up here."
        />
      ) : (
        <>
          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-muted-foreground">Your progress</p>
              <p className="text-sm text-foreground">
                {progress.submitted} of {progress.released} turned in
              </p>
            </div>
            <ProgressBar
              value={progress.completionPct}
              className="mt-3"
              label="Deliverables turned in"
            />
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              {[
                { label: "Outstanding", value: progress.outstanding },
                { label: "On time", value: progress.onTime },
                { label: "Late", value: progress.late },
                { label: "Missed", value: progress.missed },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="text-muted-foreground">{stat.label}</dt>
                  <dd className="mt-0.5 text-xl font-light text-foreground">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Section title="To do" cards={of("open", "open_late")} nowMs={nowMs} />
          <Section title="Locked" cards={of("locked")} nowMs={nowMs} />
          <Section title="Coming up" cards={of("upcoming")} nowMs={nowMs} />
          <Section title="Turned in" cards={done} nowMs={nowMs} />
          <Section title="Missed" cards={of("missed")} nowMs={nowMs} />
        </>
      )}
    </>
  );
};

export default PledgeDashboard;
