"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServerNow } from "@/components/PortalComponents/portal-session";
import {
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  PageHeader,
  ProgressBar,
  StatTile,
  useToast,
} from "@/components/PortalComponents/primitives";
import { apiFetch, errorMessage } from "@/lib/portal/client/api";
import { useApi } from "@/lib/portal/client/use-api";
import { standingFor } from "@/lib/portal/progress";
import type { AdminOverviewDto, PledgeRowDto, TeamDto } from "@/lib/portal/types";
import TeamDialog from "./team-dialog";

interface Member {
  pledge: PledgeRowDto;
  completionPct: number;
}

/** The average of the members who can still turn work in. Disabled accounts are left out. */
function teamCompletion(members: Member[]): number {
  const counted = members.filter((member) => member.pledge.status !== "disabled");
  if (counted.length === 0) return 0;
  return Math.round(counted.reduce((sum, member) => sum + member.completionPct, 0) / counted.length);
}

const MemberList: React.FC<{ members: Member[] }> = ({ members }) => (
  <ul className="divide-y divide-border">
    {members.map(({ pledge, completionPct }) => (
      <li key={pledge.uid} className="flex items-center justify-between gap-4 px-5 py-3">
        <Link
          href={`/portal/admin/pledges/${pledge.uid}`}
          className="min-w-0 flex-1 truncate text-sm text-foreground hover:text-accent-ink"
        >
          {pledge.displayName}
          {pledge.status === "disabled" ? (
            <span className="ml-2 text-xs text-muted-foreground">Disabled</span>
          ) : null}
        </Link>
        <span className="flex w-36 shrink-0 items-center gap-2">
          <ProgressBar value={completionPct} label={`${pledge.displayName}: ${completionPct}% turned in`} className="flex-1" />
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{completionPct}%</span>
        </span>
      </li>
    ))}
  </ul>
);

/** Where admins create teams and decide who is on them. Everyone starts on their own. */
const TeamsPanel: React.FC = () => {
  const nowMs = useServerNow();
  const notify = useToast();
  const { data, error, loading, reload } = useApi<AdminOverviewDto>("/admin/pledges");
  const [editing, setEditing] = useState<TeamDto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [removing, setRemoving] = useState<TeamDto | null>(null);
  const [busy, setBusy] = useState(false);

  const members = useMemo<Member[]>(() => {
    if (!data) return [];
    return data.pledges.map((pledge) => ({
      pledge,
      completionPct: standingFor(pledge, data.forms, nowMs).progress.completionPct,
    }));
  }, [data, nowMs]);

  const header = (
    <PageHeader
      title="Teams"
      subtitle="Group pledges into teams. Everyone starts solo and can be moved at any time."
      actions={
        <Button
          variant="accent"
          disabled={!data}
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          New team
        </Button>
      }
    />
  );

  if (loading && !data) return <>{header}<LoadingBlock label="Loading teams" /></>;
  if (error && !data) return <>{header}<ErrorNote error={error} onRetry={reload} /></>;
  if (!data) return null;

  const teamIds = new Set(data.teams.map((team) => team.id));
  const individual = members.filter((member) => !member.pledge.teamId || !teamIds.has(member.pledge.teamId));

  const remove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/teams/${removing.id}`, { method: "DELETE" });
      notify(`Team "${removing.name}" deleted. Its members are individual again.`, "success");
      setRemoving(null);
      reload();
    } catch (caught) {
      notify(errorMessage(caught), "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {header}

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatTile label="Teams" value={String(data.teams.length)} />
        <StatTile label="Pledges on a team" value={String(members.length - individual.length)} />
        <StatTile label="Working individually" value={String(individual.length)} />
      </div>

      {data.teams.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No teams yet"
          body="Everyone is working solo. When teams form, create them here and pick who's on each. Joining a team doesn't change anyone's deliverables."
          action={
            <Button
              variant="accent"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              Create the first team
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {data.teams.map((team) => {
            const onTeam = members.filter((member) => member.pledge.teamId === team.id);
            const completion = teamCompletion(onTeam);
            return (
              <Card key={team.id} className="overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-medium text-foreground">{team.name}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {onTeam.length} {onTeam.length === 1 ? "member" : "members"}
                      {onTeam.length > 0 ? ` · ${completion}% turned in on average` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${team.name}`}
                      onClick={() => {
                        setEditing(team);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${team.name}`}
                      onClick={() => setRemoving(team)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {onTeam.length > 0 ? (
                  <MemberList members={onTeam} />
                ) : (
                  <p className="px-5 py-6 text-sm text-muted-foreground">
                    Nobody is on this team yet. Choose Edit to add members.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {data.teams.length > 0 ? (
        <section className="mt-10">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Working individually
            </h2>
            <Chip>{individual.length}</Chip>
          </div>
          {individual.length > 0 ? (
            <Card className="overflow-hidden">
              <MemberList members={individual} />
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Every pledge is on a team.</p>
          )}
        </section>
      ) : null}

      <TeamDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        team={editing}
        pledges={data.pledges}
        teams={data.teams}
        onSaved={(message) => {
          notify(message, "success");
          reload();
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={`Delete ${removing?.name ?? "team"}?`}
        description="Its members go back to working individually. Their accounts, responses and progress are not touched."
        confirmLabel="Delete team"
        destructive
        busy={busy}
        onConfirm={() => void remove()}
      />
    </>
  );
};

export default TeamsPanel;
