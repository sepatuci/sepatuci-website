import { Timestamp } from "firebase-admin/firestore";
import { ID_PATTERN, LIMITS } from "../constants";
import { isRecord, readText } from "../parse";
import type { FieldIssue, TeamDto } from "../types";
import { auditEntry } from "./audit";
import { HttpError, invalid } from "./http";
import type { Caller } from "./pledge-service";
import { collections, iso, type Collections, type TeamDoc } from "./store";

/**
 * Teams are a way for admins to group pledges. Every pledge starts on their
 * own and belongs to at most one team. Membership lives on the pledge's
 * profile, so removing a pledge never leaves a team pointing at nobody.
 */

const byName = (a: TeamDto, b: TeamDto): number => a.name.localeCompare(b.name);

function teamDto(id: string, team: TeamDoc, memberCount: number): TeamDto {
  return { id, name: team.name, memberCount, createdAt: iso(team.createdAt) };
}

/**
 * Every team, in alphabetical order. Callers that have already read the
 * pledges pass their team ids, which saves reading the profiles again.
 */
export async function loadTeams(
  cols: Collections,
  memberTeamIds?: ReadonlyArray<string | null>,
): Promise<TeamDto[]> {
  const teams = await cols.teams.get();
  if (teams.empty) return [];

  const teamIds =
    memberTeamIds ??
    (await cols.users.where("role", "==", "pledge").select("teamId").get()).docs.map(
      (doc) => (doc.get("teamId") as string | null | undefined) ?? null,
    );
  const counts = new Map<string, number>();
  for (const teamId of teamIds) {
    if (teamId) counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
  }
  return teams.docs.map((doc) => teamDto(doc.id, doc.data(), counts.get(doc.id) ?? 0)).sort(byName);
}

/** Null when the id is not a team that exists. */
export async function findTeamName(cols: Collections, teamId: string): Promise<string | null> {
  if (!ID_PATTERN.test(teamId)) return null;
  return (await cols.teams.doc(teamId).get()).data()?.name ?? null;
}

interface TeamInput {
  name?: string;
  /** The whole membership. */
  memberUids?: string[];
  /** Changes to the membership, leaving everyone else as they are. */
  addUids?: string[];
  removeUids?: string[];
}

const UID_LISTS = ["memberUids", "addUids", "removeUids"] as const;

function readTeamInput(body: unknown, requireName: boolean): TeamInput {
  const input = isRecord(body) ? body : {};
  const issues: FieldIssue[] = [];
  const result: TeamInput = {};

  if (input.name !== undefined || requireName) {
    const read = readText(input.name, LIMITS.teamName);
    if (!read.ok && read.reason === "too_long") {
      issues.push({
        path: "name",
        code: "too_long",
        message: `Keep the name to ${LIMITS.teamName} characters or fewer.`,
      });
    } else if (!read.ok || !read.value) {
      issues.push({ path: "name", code: "required", message: "Give the team a name." });
    } else {
      result.name = read.value;
    }
  }

  for (const key of UID_LISTS) {
    const raw = input[key];
    if (raw === undefined) continue;
    const valid =
      Array.isArray(raw) &&
      raw.length <= 400 &&
      raw.every((uid): uid is string => typeof uid === "string" && ID_PATTERN.test(uid));
    if (valid) result[key] = [...new Set(raw)];
    else issues.push({ path: key, code: "invalid", message: "Choose pledges from the list." });
  }
  const changes = [...(result.addUids ?? []), ...(result.removeUids ?? [])];
  if (result.memberUids !== undefined && changes.length > 0) {
    issues.push({
      path: "memberUids",
      code: "conflict",
      message: "Send either the whole member list or the changes to it, not both.",
    });
  }
  if (new Set(changes).size !== changes.length) {
    issues.push({
      path: "addUids",
      code: "conflict",
      message: "The same pledge can't be both added and removed.",
    });
  }

  if (issues.length > 0) throw invalid(issues);
  return result;
}

const teamNotFound = () => new HttpError(404, "not_found", "That team doesn't exist.");

/** Refuses a name another team already has, ignoring case, so two teams are never confused. */
function assertNameFree(
  teams: ReadonlyArray<{ id: string; name: string }>,
  name: string,
  ownId: string | null,
): void {
  const taken = teams.some(
    (team) => team.id !== ownId && team.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) {
    throw invalid([{ path: "name", code: "duplicate", message: "Another team already has that name." }]);
  }
}

export async function createTeam(
  { admin, user, now }: Caller,
  body: unknown,
): Promise<{ team: TeamDto }> {
  const input = readTeamInput(body, true);
  const name = input.name ?? "";
  const memberUids = input.memberUids ?? [];
  const cols = collections(admin.db);
  const teamRef = cols.teams.doc();
  const stamp = Timestamp.fromDate(now);
  const team: TeamDoc = { name, createdAt: stamp, createdBy: user.uid, updatedAt: stamp };

  await admin.db.runTransaction(async (tx) => {
    const existing = await tx.get(cols.teams);
    if (existing.size >= LIMITS.maxTeams) {
      throw new HttpError(409, "too_many_teams", `There can be at most ${LIMITS.maxTeams} teams.`);
    }
    assertNameFree(
      existing.docs.map((doc) => ({ id: doc.id, name: doc.data().name })),
      name,
      null,
    );
    const members = await readPledges(tx, cols, memberUids, "memberUids");

    tx.create(teamRef, team);
    for (const uid of members) tx.update(cols.users.doc(uid), { teamId: teamRef.id, updatedAt: stamp });
    tx.create(
      cols.audit.doc(),
      auditEntry(
        user,
        now,
        "team.create",
        "team",
        teamRef.id,
        `Created team "${name}" with ${members.length} ${members.length === 1 ? "member" : "members"}`,
      ),
    );
  });
  return { team: teamDto(teamRef.id, team, memberUids.length) };
}

/** Checks that every uid is a pledge profile, inside the transaction that will change them. */
async function readPledges(
  tx: FirebaseFirestore.Transaction,
  cols: Collections,
  uids: string[],
  path: (typeof UID_LISTS)[number],
): Promise<string[]> {
  if (uids.length === 0) return [];
  const snapshots = await tx.getAll(...uids.map((uid) => cols.users.doc(uid)));
  const unknown = snapshots.some((snapshot) => snapshot.data()?.role !== "pledge");
  if (unknown) {
    throw invalid([
      { path, code: "invalid", message: "Only pledge accounts that still exist can be on a team." },
    ]);
  }
  return uids;
}

/**
 * Renames a team and changes who is on it. `memberUids` makes the team exactly
 * that list. `addUids` and `removeUids` change only the pledges named, which
 * is what the admin screens send, so two admins editing at once do not undo
 * each other's moves.
 */
export async function updateTeam(
  { admin, user, now }: Caller,
  teamId: string,
  body: unknown,
): Promise<{ ok: true }> {
  const input = readTeamInput(body, false);
  const cols = collections(admin.db);
  const teamRef = cols.teams.doc(teamId);
  const stamp = Timestamp.fromDate(now);

  await admin.db.runTransaction(async (tx) => {
    const existing = await tx.get(cols.teams);
    const team = existing.docs.find((doc) => doc.id === teamId)?.data();
    if (!team) throw teamNotFound();

    const changes: string[] = [];
    if (input.name !== undefined && input.name !== team.name) {
      assertNameFree(
        existing.docs.map((doc) => ({ id: doc.id, name: doc.data().name })),
        input.name,
        teamId,
      );
      changes.push(`renamed to "${input.name}"`);
    }

    let joining: string[] = [];
    let leaving: string[] = [];
    const membership =
      input.memberUids !== undefined || input.addUids !== undefined || input.removeUids !== undefined;
    if (membership) {
      const current = new Set(
        (await tx.get(cols.users.where("teamId", "==", teamId))).docs.map((doc) => doc.id),
      );
      if (input.memberUids !== undefined) {
        const wanted = new Set(await readPledges(tx, cols, input.memberUids, "memberUids"));
        joining = [...wanted].filter((uid) => !current.has(uid));
        leaving = [...current].filter((uid) => !wanted.has(uid));
      } else {
        const adding = await readPledges(tx, cols, input.addUids ?? [], "addUids");
        joining = adding.filter((uid) => !current.has(uid));
        // Someone already moved elsewhere, or removed altogether, is simply left alone.
        leaving = (input.removeUids ?? []).filter((uid) => current.has(uid));
      }
      if (joining.length > 0) changes.push(`added ${joining.length}`);
      if (leaving.length > 0) changes.push(`removed ${leaving.length}`);
    }
    if (changes.length === 0) return;

    tx.update(teamRef, { name: input.name ?? team.name, updatedAt: stamp });
    for (const uid of joining) tx.update(cols.users.doc(uid), { teamId, updatedAt: stamp });
    for (const uid of leaving) tx.update(cols.users.doc(uid), { teamId: null, updatedAt: stamp });
    tx.create(
      cols.audit.doc(),
      auditEntry(user, now, "team.update", "team", teamId, `Team "${team.name}": ${changes.join(", ")}`),
    );
  });
  return { ok: true };
}

/** Removes a team. Its members go back to working on their own; nothing of theirs is deleted. */
export async function deleteTeam({ admin, user, now }: Caller, teamId: string): Promise<{ ok: true }> {
  const cols = collections(admin.db);
  const teamRef = cols.teams.doc(teamId);
  const stamp = Timestamp.fromDate(now);

  await admin.db.runTransaction(async (tx) => {
    const team = (await tx.get(teamRef)).data();
    if (!team) throw teamNotFound();
    const members = await tx.get(cols.users.where("teamId", "==", teamId));

    for (const doc of members.docs) tx.update(doc.ref, { teamId: null, updatedAt: stamp });
    tx.delete(teamRef);
    tx.create(
      cols.audit.doc(),
      auditEntry(
        user,
        now,
        "team.delete",
        "team",
        teamId,
        `Deleted team "${team.name}" (${members.size} ${members.size === 1 ? "member" : "members"} now individual)`,
      ),
    );
  });
  return { ok: true };
}
