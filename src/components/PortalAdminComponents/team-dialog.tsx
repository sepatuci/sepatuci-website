"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { ApiError, apiFetch, errorMessage } from "@/lib/portal/client/api";
import { LIMITS } from "@/lib/portal/constants";
import type { PledgeRowDto, TeamDto } from "@/lib/portal/types";

interface TeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The team being edited, or null to create one. */
  team: TeamDto | null;
  pledges: PledgeRowDto[];
  teams: TeamDto[];
  onSaved: (message: string) => void;
}

/** Names a team and picks who is on it. Used for both a new team and an existing one. */
const TeamDialog: React.FC<TeamDialogProps> = ({ open, onOpenChange, team, pledges, teams, onSaved }) => {
  const [name, setName] = useState("");
  const [members, setMembers] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Who was ticked when the dialog opened. Saving sends only what was changed
  // from this, so it never undoes a move another admin made in the meantime.
  const opened = useRef<ReadonlySet<string>>(new Set());
  const latestPledges = useRef(pledges);
  latestPledges.current = pledges;

  // Start from the team as it is each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const current = new Set(
      team
        ? latestPledges.current.filter((pledge) => pledge.teamId === team.id).map((pledge) => pledge.uid)
        : [],
    );
    opened.current = current;
    setName(team?.name ?? "");
    setMembers(current);
    setSearch("");
    setNameError(null);
    setFormError(null);
  }, [open, team]);

  const teamNames = useMemo(() => new Map(teams.map((item) => [item.id, item.name])), [teams]);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pledges.filter(
      (pledge) =>
        term.length === 0 ||
        pledge.displayName.toLowerCase().includes(term) ||
        pledge.email.toLowerCase().includes(term),
    );
  }, [pledges, search]);

  const toggle = (uid: string) => {
    const next = new Set(members);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setMembers(next);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNameError(null);
    setFormError(null);
    try {
      if (team) {
        await apiFetch(`/admin/teams/${team.id}`, {
          method: "PATCH",
          body: {
            ...(name.trim() !== team.name ? { name } : {}),
            addUids: [...members].filter((uid) => !opened.current.has(uid)),
            removeUids: [...opened.current].filter((uid) => !members.has(uid)),
          },
        });
      } else {
        await apiFetch("/admin/teams", { method: "POST", body: { name, memberUids: [...members] } });
      }
      onSaved(team ? "Team updated." : `Team "${name.trim()}" created.`);
      onOpenChange(false);
    } catch (caught) {
      const fields = caught instanceof ApiError ? caught.fields : [];
      const nameIssue = fields.find((field) => field.path === "name");
      if (nameIssue) setNameError(nameIssue.message);
      else setFormError(fields[0]?.message ?? errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={team ? "Edit team" : "New team"}>
        <form onSubmit={submit} noValidate className="mt-4 space-y-5">
          {formError ? (
            <p role="alert" className="rounded-lg border border-danger-border bg-danger-subtle px-3 py-2.5 text-sm text-danger-ink">
              {formError}
            </p>
          ) : null}

          <div>
            <Label htmlFor="team-name">Team name</Label>
            <Input
              id="team-name"
              value={name}
              maxLength={LIMITS.teamName}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={nameError ? true : undefined}
              autoComplete="off"
              autoFocus
            />
            {nameError ? <p className="mt-1.5 text-xs text-danger-ink">{nameError}</p> : null}
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-foreground">
              Members <span className="font-normal text-muted-foreground">({members.size} chosen)</span>
            </legend>
            <p className="mt-0.5 text-xs text-muted-foreground">
              A pledge is on one team at a time. Choosing someone from another team moves them here.
            </p>
            {pledges.length > 8 ? (
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search pledges"
                  placeholder="Search pledges"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                />
              </div>
            ) : null}
            <div className="mt-3 max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1.5">
              {shown.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  {pledges.length === 0 ? "Add pledges first, then put them on teams." : "No pledge matches."}
                </p>
              ) : (
                shown.map((pledge) => {
                  const elsewhere =
                    pledge.teamId && pledge.teamId !== team?.id ? teamNames.get(pledge.teamId) : undefined;
                  return (
                    <label
                      key={pledge.uid}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={members.has(pledge.uid)}
                        onChange={() => toggle(pledge.uid)}
                        className="h-4 w-4 shrink-0 accent-accent"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">
                          {pledge.displayName}
                          {pledge.status === "disabled" ? (
                            <span className="ml-2 text-xs text-muted-foreground">Disabled</span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {elsewhere ? `Currently on ${elsewhere}` : pledge.email}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" disabled={busy || name.trim().length === 0}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {team ? "Save team" : "Create team"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TeamDialog;
