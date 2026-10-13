import { randomBytes } from "node:crypto";
import type { UserRecord } from "firebase-admin/auth";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { isOnline, resolveSessionEnd } from "../activity";
import { ID_PATTERN, LIMITS, UCI_EMAIL_PATTERN } from "../constants";
import { toIso } from "../dates";
import { isRecord, readEnum, readText } from "../parse";
import { temporaryPassword } from "../password";
import { isPreviewProfile } from "../preview";
import { UNSAFE_NAME_START } from "../roster";
import type {
  AccountState,
  AdminOverviewDto,
  CreatePledgeResultDto,
  FieldIssue,
  InviteLinkDto,
  IsoDateTime,
  MemberRole,
  PledgeDetailDto,
  PledgeRowDto,
  PunishmentDto,
  PunishmentStatus,
  SessionDto,
  TemporaryPasswordDto,
  UserStatus,
} from "../types";
import type { PortalAdmin } from "./admin";
import { findTeamName, loadTeams } from "./admin-teams-service";
import { auditEntry } from "./audit";
import { HttpError, invalid } from "./http";
import type { Caller } from "./pledge-service";
import { sessionDto } from "./sessions";
import { fingerprint, nextSecond } from "./temporary-password";
import {
  activityToDto,
  activityToPure,
  collections,
  deleteMatching,
  emptyStoredActivity,
  formSummary,
  iso,
  isoOrNull,
  punishmentDto,
  submissionSummary,
  submittedToWire,
  type UserDoc,
} from "./store";

/**
 * Admin management of pledge accounts. Admin accounts are never created,
 * changed or removed here: they are set up by the project owner's setup script.
 */

export function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "";
}

export async function authRecords(admin: PortalAdmin, uids: string[]): Promise<Map<string, UserRecord>> {
  const records = new Map<string, UserRecord>();
  for (let start = 0; start < uids.length; start += 100) {
    const identifiers = uids.slice(start, start + 100).map((uid) => ({ uid }));
    const result = await admin.auth.getUsers(identifiers);
    result.users.forEach((record) => records.set(record.uid, record));
  }
  return records;
}

/** True until the person replaces a password a chair handed out with their own. */
export function onTemporaryPassword(record: UserRecord | undefined): boolean {
  return record?.customClaims?.temp === true;
}

/**
 * What a member's sign-in carries: the role, the address the account was
 * issued to, and a flag while the password is still a temporary one.
 */
export function memberClaims(
  role: MemberRole,
  email: string,
  temporary: { issuedAt: Date; brandNew: boolean } | null,
): Record<string, unknown> {
  if (!temporary) return { role, issued: email };
  return {
    role,
    issued: email,
    temp: true,
    // When it was issued, so that it stops working three days later.
    tempAt: Math.floor(temporary.issuedAt.getTime() / 1000),
    // Tells the sign-in page whether to greet a pledge or a returning one.
    ...(temporary.brandNew ? { tempNew: true } : {}),
  };
}

export const newTemporaryPassword = (): string => temporaryPassword(() => randomBytes(1)[0]);

/**
 * The last real sign-in. Some backends stamp a sign-in time when an account is
 * created, so a time within a few seconds of creation does not count.
 */
export function lastSignIn(record: UserRecord | undefined): IsoDateTime | null {
  const raw = record?.metadata.lastSignInTime;
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  const createdMs = Date.parse(record?.metadata.creationTime ?? "");
  if (Number.isFinite(createdMs) && ms - createdMs < 5_000) return null;
  return toIso(ms);
}

/** Disabled on the profile or at the sign-in: either alone keeps the person out. */
export function statusOf(profile: UserDoc, record: UserRecord | undefined): UserStatus {
  return profile.status === "disabled" || record?.disabled === true ? "disabled" : "active";
}

/**
 * "Invited" means the person has never reached the portal: no sign-in and no
 * recorded visit, or still on the temporary password they were given.
 */
export function accountStateOf(profile: UserDoc, record: UserRecord | undefined): AccountState {
  if (statusOf(profile, record) === "disabled") return "disabled";
  if (onTemporaryPassword(record)) return "invited";
  if (profile.activity.firstSeenAt === null && lastSignIn(record) === null) return "invited";
  return "active";
}

function toPledgeRow(
  uid: string,
  profile: UserDoc,
  record: UserRecord | undefined,
  activePunishments: number,
): PledgeRowDto {
  const status = statusOf(profile, record);
  return {
    uid,
    email: profile.email,
    displayName: profile.displayName,
    pledgeClass: profile.pledgeClass,
    teamId: profile.teamId,
    status,
    signInBlocked: record ? record.disabled : status === "disabled",
    accountState: accountStateOf(profile, record),
    createdAt: iso(profile.createdAt),
    lastSignInAt: lastSignIn(record),
    onboardedAt: isoOrNull(profile.onboardedAt),
    activity: activityToDto(profile.activity),
    submitted: submittedToWire(profile.submitted),
    activePunishments,
  };
}

/**
 * Loads an account of one kind, pledge or active. An admin is always refused.
 * An account of the other kind is reported as not found, so a pledge route can
 * never act on an active, or the other way round.
 */
export async function requireMember(
  admin: PortalAdmin,
  uid: string,
  role: MemberRole,
): Promise<{ profile: UserDoc; record: UserRecord | undefined }> {
  const profile = (await collections(admin.db).users.doc(uid).get()).data();
  if (!profile) throw new HttpError(404, "not_found", "That account doesn't exist.");

  let record: UserRecord | undefined;
  try {
    record = await admin.auth.getUser(uid);
  } catch (error) {
    if (errorCode(error) !== "auth/user-not-found") throw error;
  }

  const claimsAdmin = record?.customClaims?.role === "admin";
  const listedAdmin = admin.env.adminEmails.includes(profile.email.toLowerCase());
  if (profile.role === "admin" || claimsAdmin || listedAdmin) {
    throw new HttpError(403, "cannot_modify_admin", "Admin accounts can't be changed here.");
  }
  if (profile.role !== role) throw new HttpError(404, "not_found", "That account doesn't exist.");
  return { profile, record };
}

const requirePledge = (admin: PortalAdmin, uid: string) => requireMember(admin, uid, "pledge");

// ── Overview ─────────────────────────────────────────────────────────────────

export async function getOverview({ admin, now }: Caller): Promise<AdminOverviewDto> {
  const cols = collections(admin.db);
  const [usersSnap, formsSnap, punishmentsSnap] = await Promise.all([
    cols.users.where("role", "==", "pledge").get(),
    cols.forms.get(),
    cols.punishments.where("status", "==", "active").get(),
  ]);
  const records = await authRecords(
    admin,
    usersSnap.docs.map((doc) => doc.id),
  );

  const activeByUid = new Map<string, number>();
  for (const doc of punishmentsSnap.docs) {
    const uid = doc.data().uid;
    activeByUid.set(uid, (activeByUid.get(uid) ?? 0) + 1);
  }

  const responseCounts = new Map<string, number>();
  const pledges = usersSnap.docs.flatMap((doc) => {
    const profile = doc.data();
    // An admin's preview account is nobody's pledge, and counts towards nothing.
    if (isPreviewProfile(profile)) return [];
    for (const formId of Object.keys(profile.submitted)) {
      responseCounts.set(formId, (responseCounts.get(formId) ?? 0) + 1);
    }
    return [toPledgeRow(doc.id, profile, records.get(doc.id), activeByUid.get(doc.id) ?? 0)];
  });
  pledges.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const forms = formsSnap.docs.map((doc) =>
    formSummary(doc.id, doc.data(), responseCounts.get(doc.id) ?? 0),
  );
  const teams = await loadTeams(
    cols,
    pledges.map((pledge) => pledge.teamId),
  );
  return { serverNow: now.toISOString(), pledges, forms, teams };
}

// ── Create ───────────────────────────────────────────────────────────────────

async function buildInviteLink(
  admin: PortalAdmin,
  email: string,
  origin: string,
  firstTime: boolean,
): Promise<string | null> {
  try {
    const link = await admin.auth.generatePasswordResetLink(email);
    const code = new URL(link).searchParams.get("oobCode");
    if (!code) return null;
    // A first-time link opens with a short introduction to the setup steps.
    const welcome = firstTime ? "&welcome=1" : "";
    return `${origin}/login/reset?mode=resetPassword&oobCode=${encodeURIComponent(code)}${welcome}`;
  } catch {
    return null;
  }
}

/**
 * Creates a pledge or an active. The two differ only in what the account is
 * for: a pledge can be given a class and a team, an active has neither.
 */
export async function createMember(
  { admin, user, now }: Caller,
  body: unknown,
  origin: string,
  role: MemberRole,
): Promise<{
  record: UserRecord;
  profile: UserDoc;
  inviteLink: string | null;
  temporaryPassword: string | null;
}> {
  const input = isRecord(body) ? body : {};
  const issues: FieldIssue[] = [];

  const start = input.start ?? "link";
  if (start !== "link" && start !== "temporary_password") {
    issues.push({ path: "start", code: "invalid", message: "Choose how this account starts." });
  }
  const temporary = start === "temporary_password";

  const emailRead = readText(input.email, 254);
  const email = emailRead.ok ? emailRead.value.toLowerCase() : "";
  if (!UCI_EMAIL_PATTERN.test(email)) {
    issues.push({ path: "email", code: "invalid_email", message: "Use a @uci.edu email address." });
  } else if (admin.env.adminEmails.includes(email)) {
    issues.push({ path: "email", code: "is_admin", message: "That address belongs to an admin." });
  }

  const nameRead = readText(input.displayName, LIMITS.displayName);
  const displayName = nameRead.ok ? nameRead.value : "";
  if (!displayName) {
    issues.push({ path: "displayName", code: "required", message: `Enter the ${role}'s name.` });
  } else if (UNSAFE_NAME_START.test(displayName)) {
    issues.push({ path: "displayName", code: "invalid", message: "A name can't start with a symbol." });
  }

  const classRead = readText(role === "pledge" ? (input.pledgeClass ?? "") : "", LIMITS.pledgeClass);
  if (!classRead.ok) {
    issues.push({ path: "pledgeClass", code: "too_long", message: "That class name is too long." });
  }
  const pledgeClass = classRead.ok && classRead.value ? classRead.value : null;

  const cols = collections(admin.db);
  // A new pledge starts on their own unless an existing team is chosen for them.
  let teamId: string | null = null;
  if (role === "pledge" && input.teamId !== undefined && input.teamId !== null && input.teamId !== "") {
    const found = typeof input.teamId === "string" ? await findTeamName(cols, input.teamId) : null;
    if (found === null) issues.push({ path: "teamId", code: "invalid", message: "Choose a team from the list." });
    else teamId = input.teamId as string;
  }
  if (issues.length > 0) throw invalid(issues);

  // Normally no password is set here: the person chooses their own through the
  // emailed link, which is also what proves they control the address. The other
  // way in is a temporary password, which they must replace at their first sign-in.
  const firstPassword = temporary ? newTemporaryPassword() : null;
  let record: UserRecord;
  try {
    record = await admin.auth.createUser({
      email,
      displayName,
      emailVerified: true,
      ...(firstPassword ? { password: firstPassword } : {}),
    });
  } catch (error) {
    if (errorCode(error) === "auth/email-already-exists") {
      // A sign-in account with no portal profile is left over from a failed
      // attempt. It is in none of the portal's lists, so say where to clear it.
      const existing = await admin.auth.getUserByEmail(email).catch(() => null);
      const leftOver = existing !== null && !(await cols.users.doc(existing.uid).get()).exists;
      throw new HttpError(
        409,
        "email_exists",
        leftOver
          ? "A sign-in account with that email exists without a portal profile. Delete it in the Firebase console under Authentication, then add them again."
          : "An account with that email already exists.",
      );
    }
    throw error;
  }

  const stamp = Timestamp.fromDate(now);
  const profile: UserDoc = {
    email,
    displayName,
    role,
    status: "active",
    pledgeClass,
    teamId,
    onboardedAt: null,
    createdAt: stamp,
    createdBy: user.uid,
    updatedAt: stamp,
    submitted: {},
    activity: emptyStoredActivity(),
    ...(firstPassword ? { temporaryPassword: fingerprint(firstPassword) } : {}),
  };
  try {
    // The address is recorded alongside the role, so every request can check
    // that the sign-in still belongs to the mailbox this account was issued to.
    await admin.auth.setCustomUserClaims(
      record.uid,
      memberClaims(role, email, temporary ? { issuedAt: now, brandNew: true } : null),
    );
    const batch = admin.db.batch();
    batch.create(cols.users.doc(record.uid), profile);
    batch.create(
      cols.audit.doc(),
      auditEntry(
        user,
        now,
        `${role}.create`,
        "user",
        record.uid,
        `${role === "pledge" ? "Created account" : "Created an active's account"} for ${email}${
          temporary ? ", starting on a temporary password" : ""
        }`,
      ),
    );
    await batch.commit();
  } catch (error) {
    // Never leave a sign-in account behind without its portal profile.
    await admin.auth.deleteUser(record.uid).catch(() => undefined);
    throw error;
  }

  return {
    record,
    profile,
    inviteLink: temporary ? null : await buildInviteLink(admin, email, origin, true),
    temporaryPassword: firstPassword,
  };
}

export async function createPledge(
  caller: Caller,
  body: unknown,
  origin: string,
): Promise<CreatePledgeResultDto> {
  const created = await createMember(caller, body, origin, "pledge");
  return {
    pledge: toPledgeRow(created.record.uid, created.profile, created.record, 0),
    inviteLink: created.inviteLink,
    temporaryPassword: created.temporaryPassword,
  };
}

// ── Detail ───────────────────────────────────────────────────────────────────

export async function getPledgeDetail({ admin, now }: Caller, uid: string): Promise<PledgeDetailDto> {
  const { profile, record } = await requirePledge(admin, uid);
  const cols = collections(admin.db);
  const [formsSnap, submissionsSnap, punishmentsSnap, sessionsSnap, teams] = await Promise.all([
    cols.forms.get(),
    cols.submissions.where("uid", "==", uid).get(),
    cols.punishments.where("uid", "==", uid).get(),
    // Only the most recent are shown, so only those are read.
    cols.sessions(uid).orderBy("startedAt", "desc").limit(LIMITS.sessionHistory).get(),
    loadTeams(cols),
  ]);

  const punishments = punishmentsSnap.docs
    .map((doc) => punishmentDto(doc.id, doc.data()))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const nowMs = now.getTime();
  const current = activityToPure(profile.activity).current;
  // Each session has a document of its own, open or closed. The one in
  // progress is "current" only while the person is actually still around.
  const sessions: SessionDto[] = sessionsSnap.docs.map((doc) => sessionDto(doc.id, doc.data(), current, nowMs));
  // A visit begun before sessions had documents is still only on the profile.
  if (current && current.sessionId === null) {
    sessions.push({
      id: null,
      startedAt: toIso(current.startedAtMs),
      endedAt: toIso(current.lastSeenAtMs),
      endReason: resolveSessionEnd(current, nowMs)?.endReason ?? null,
      activeSeconds: current.activeSeconds,
      pageCount: 0,
      device: "",
      current: isOnline(current.lastSeenAtMs, nowMs),
    });
  }
  sessions.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  return {
    serverNow: now.toISOString(),
    pledge: toPledgeRow(uid,
      profile,
      record,
      punishments.filter((punishment) => punishment.status === "active").length,
    ),
    forms: formsSnap.docs.map((doc) =>
      formSummary(doc.id, doc.data(), profile.submitted[doc.id] ? 1 : 0),
    ),
    submissions: submissionsSnap.docs
      .map((doc) => submissionSummary(doc.data()))
      .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1)),
    punishments,
    // An admin's preview account is in no activity view, so nothing links to
    // its sessions from here either.
    sessions: isPreviewProfile(profile) ? [] : sessions.slice(0, LIMITS.sessionHistory),
    teams,
  };
}

// ── Update, disable, remove ──────────────────────────────────────────────────

export const updatePledge = (caller: Caller, uid: string, body: unknown) =>
  updateMember(caller, uid, body, "pledge");

/** Changes a pledge's or an active's name or status, and a pledge's class or team. */
export async function updateMember(
  { admin, user, now }: Caller,
  uid: string,
  body: unknown,
  role: MemberRole,
): Promise<{ ok: true }> {
  const { profile, record } = await requireMember(admin, uid, role);
  const input = isRecord(body) ? body : {};
  const issues: FieldIssue[] = [];
  const changes: string[] = [];
  const patch: Partial<Pick<UserDoc, "displayName" | "pledgeClass" | "status" | "teamId">> = {};
  const cols = collections(admin.db);
  // Whether sign-in is really blocked, which can differ from the profile if the
  // account was changed in the Firebase console or an earlier update half-failed.
  const signInBlocked = record ? record.disabled : profile.status === "disabled";

  if (input.displayName !== undefined) {
    const read = readText(input.displayName, LIMITS.displayName);
    if (!read.ok || !read.value) {
      issues.push({ path: "displayName", code: "required", message: "Enter a name." });
    } else if (UNSAFE_NAME_START.test(read.value)) {
      issues.push({ path: "displayName", code: "invalid", message: "A name can't start with a symbol." });
    } else if (read.value !== profile.displayName) {
      patch.displayName = read.value;
      changes.push("name");
    }
  }
  if (role === "pledge" && input.pledgeClass !== undefined) {
    const read = readText(input.pledgeClass ?? "", LIMITS.pledgeClass);
    if (!read.ok) {
      issues.push({ path: "pledgeClass", code: "too_long", message: "That class name is too long." });
    } else if ((read.value || null) !== profile.pledgeClass) {
      patch.pledgeClass = read.value || null;
      changes.push("class");
    }
  }
  if (input.status !== undefined) {
    const status = readEnum<UserStatus>(input.status, ["active", "disabled"]);
    if (!status) {
      issues.push({ path: "status", code: "invalid", message: "Unknown status." });
    } else if (status !== profile.status || (status === "disabled") !== signInBlocked) {
      // Applied whenever either side disagrees with what was asked for, so
      // "Disable" always blocks sign-in and "Re-enable" always restores it.
      patch.status = status;
      changes.push(status === "disabled" ? "disabled the account" : "re-enabled the account");
    }
  }
  if (role === "pledge" && input.teamId !== undefined) {
    const wanted = input.teamId === "" ? null : input.teamId;
    if (wanted === null) {
      if (profile.teamId !== null) {
        patch.teamId = null;
        changes.push("removed from their team");
      }
    } else if (isPreviewProfile(profile)) {
      // A preview account is one admin's sandbox: real pledges never see it as a teammate.
      issues.push({ path: "teamId", code: "invalid", message: "A preview account can't join a team." });
    } else if (typeof wanted !== "string" || !ID_PATTERN.test(wanted)) {
      issues.push({ path: "teamId", code: "invalid", message: "Choose a team from the list." });
    } else if (wanted !== profile.teamId) {
      const teamName = await findTeamName(cols, wanted);
      if (teamName === null) {
        issues.push({ path: "teamId", code: "invalid", message: "That team no longer exists." });
      } else {
        patch.teamId = wanted;
        changes.push(`moved to team "${teamName}"`);
      }
    }
  }
  if (issues.length > 0) throw invalid(issues);
  if (changes.length === 0) return { ok: true };

  // Sign-in is cut off first, so a failure afterwards can never leave access open.
  if (patch.status !== undefined) {
    await admin.auth.updateUser(uid, { disabled: patch.status === "disabled" });
    if (patch.status === "disabled") await admin.auth.revokeRefreshTokens(uid);
  }
  if (patch.displayName !== undefined) {
    await admin.auth.updateUser(uid, { displayName: patch.displayName });
  }

  const action =
    patch.status === "disabled"
      ? `${role}.disable`
      : patch.status === "active"
        ? `${role}.enable`
        : `${role}.update`;
  const joiningTeam = typeof patch.teamId === "string" ? patch.teamId : null;
  await admin.db.runTransaction(async (tx) => {
    // The team is checked again here, in the same step as the move, so a team
    // deleted a moment ago cannot be left with a member.
    if (joiningTeam && !(await tx.get(cols.teams.doc(joiningTeam))).exists) {
      throw invalid([{ path: "teamId", code: "invalid", message: "That team no longer exists." }]);
    }
    tx.update(cols.users.doc(uid), { ...patch, updatedAt: Timestamp.fromDate(now) });
    tx.create(
      cols.audit.doc(),
      auditEntry(user, now, action, "user", uid, `${profile.email}: ${changes.join(", ")}`),
    );
  });
  return { ok: true };
}

export const deletePledge = (caller: Caller, uid: string, confirmEmail: string | null) =>
  removeMember(caller, uid, confirmEmail, "pledge");

/** Deletes a pledge's or an active's account and everything attached to it. */
export async function removeMember(
  { admin, user, now }: Caller,
  uid: string,
  confirmEmail: string | null,
  role: MemberRole,
): Promise<{ ok: true }> {
  const { profile } = await requireMember(admin, uid, role);
  if ((confirmEmail ?? "").trim().toLowerCase() !== profile.email.toLowerCase()) {
    throw invalid([
      { path: "confirm", code: "mismatch", message: `Type the ${role}'s email address to confirm.` },
    ]);
  }

  try {
    await admin.auth.deleteUser(uid);
  } catch (error) {
    if (errorCode(error) !== "auth/user-not-found") throw error;
  }

  // The profile goes last, so an interrupted removal can simply be run again.
  await purgeMemberData(admin, uid);
  const cols = collections(admin.db);
  const batch = admin.db.batch();
  batch.delete(cols.users.doc(uid));
  batch.create(
    cols.audit.doc(),
    auditEntry(user, now, `${role}.remove`, "user", uid, `Removed ${profile.email} and all their data`),
  );
  await batch.commit();
  return { ok: true };
}

/**
 * Deletes everything attached to a member's account other than the profile
 * itself: their responses, drafts, punishments and visit history. Removing an
 * account does this, and so does starting a preview account over.
 */
export async function purgeMemberData(admin: PortalAdmin, uid: string): Promise<void> {
  const cols = collections(admin.db);
  for (const collection of [cols.submissions, cols.drafts, cols.punishments]) {
    await deleteMatching(admin.db, collection.where("uid", "==", uid));
  }
  await deleteMatching(admin.db, cols.sessions(uid));
}

export const createInviteLink = (caller: Caller, uid: string, origin: string) =>
  createMemberInviteLink(caller, uid, origin, "pledge");

/**
 * Replaces an account's password with a temporary one for a chair to pass on.
 * Every session ends, and the next sign-in must choose a new password before
 * the portal opens.
 */
export async function issueTemporaryPassword(
  { admin, user, now }: Caller,
  uid: string,
  role: MemberRole,
): Promise<TemporaryPasswordDto> {
  const { profile, record } = await requireMember(admin, uid, role);
  if (profile.status === "disabled") {
    throw new HttpError(409, "account_disabled", "Re-enable the account first.");
  }
  // As with a password link, an account pointed at another mailbox is put back
  // on the address it was issued with.
  const moved = record !== undefined && record.email?.toLowerCase() !== profile.email.toLowerCase();
  // The portal signs in with a password alone. An authenticator attached to the
  // account through Firebase directly would lock its owner out, so one that is
  // there is removed. Nothing is sent about it for the usual account, which has none.
  const hasAuthenticator = (record?.multiFactor?.enrolledFactors.length ?? 0) > 0;
  const password = newTemporaryPassword();
  // Every existing sign-in ends first, so none of them can pick up the flag
  // set below and use it to choose a password of its own.
  await admin.auth.revokeRefreshTokens(uid);
  // The flag goes on before the password. If a later step fails, the person
  // is only asked to confirm the password they already have, which is harmless.
  // The other order could leave a temporary password in place for good.
  await admin.auth.setCustomUserClaims(
    uid,
    memberClaims(role, profile.email, { issuedAt: now, brandNew: profile.onboardedAt === null }),
  );
  await collections(admin.db).users.doc(uid).update({ temporaryPassword: fingerprint(password) });
  await admin.auth.updateUser(uid, {
    email: profile.email,
    emailVerified: true,
    password,
    ...(moved || hasAuthenticator ? { multiFactor: { enrolledFactors: null } } : {}),
  });
  // Once more, for a sign-in with the old password that slipped in between the
  // steps above. From here on only the new password signs in, and nobody has it yet.
  await nextSecond();
  await admin.auth.revokeRefreshTokens(uid);
  // The password itself is a credential and is deliberately left out of the log.
  await collections(admin.db).audit.add(
    auditEntry(
      user,
      now,
      `${role}.temporary_password`,
      "user",
      uid,
      `Issued a temporary password for ${profile.email}${moved ? ", and put the sign-in address back" : ""}`,
    ),
  );
  return { temporaryPassword: password };
}

export const issuePledgeTemporaryPassword = (caller: Caller, uid: string) =>
  issueTemporaryPassword(caller, uid, "pledge");

export async function createMemberInviteLink(
  { admin, user, now }: Caller,
  uid: string,
  origin: string,
  role: MemberRole,
): Promise<InviteLinkDto> {
  const { profile, record } = await requireMember(admin, uid, role);
  if (profile.status === "disabled") {
    throw new HttpError(409, "account_disabled", "Re-enable the account before inviting.");
  }
  // The sign-in address is put back to the one this account was issued with,
  // in case it was pointed at another mailbox. Whoever moved it may not have
  // been the pledge, so every session is ended, the password is replaced with
  // one nobody knows and any authenticator attached through Firebase is
  // removed: the only way back in is the link below, which goes to the issued
  // address.
  let movedFrom: string | null = null;
  if (record && record.email?.toLowerCase() !== profile.email.toLowerCase()) {
    movedFrom = record.email ?? "no address";
    await admin.auth.revokeRefreshTokens(uid);
    await admin.auth.updateUser(uid, {
      email: profile.email,
      emailVerified: true,
      password: randomBytes(24).toString("base64url"),
      multiFactor: { enrolledFactors: null },
    });
    // Once more, for a sign-in that slipped in between the two steps above.
    await nextSecond();
    await admin.auth.revokeRefreshTokens(uid);
  }
  // A link takes the place of a temporary password that is still outstanding:
  // that password stops working, and the account is no longer held at the
  // choose-a-password step. The password goes first, so a failure part-way
  // never leaves a temporary password in place without its flag.
  const cancelledTemporary = movedFrom === null && onTemporaryPassword(record);
  if (cancelledTemporary) {
    await admin.auth.revokeRefreshTokens(uid);
    await admin.auth.updateUser(uid, { password: randomBytes(24).toString("base64url") });
    // From here the temporary password signs nobody in. Anyone who used it a
    // moment ago is signed out before the flag comes off.
    await nextSecond();
    await admin.auth.revokeRefreshTokens(uid);
    await admin.auth.setCustomUserClaims(uid, memberClaims(role, profile.email, null));
    await collections(admin.db).users.doc(uid).update({ temporaryPassword: FieldValue.delete() });
  } else if (movedFrom !== null && onTemporaryPassword(record)) {
    // The repair above already replaced the password. Only the flag is left.
    await admin.auth.setCustomUserClaims(uid, memberClaims(role, profile.email, null));
    await collections(admin.db).users.doc(uid).update({ temporaryPassword: FieldValue.delete() });
  }
  // A first-time link opens with the setup steps, for anyone who has not been
  // through their welcome yet.
  const firstTime = profile.onboardedAt === null;
  const inviteLink = await buildInviteLink(admin, profile.email, origin, firstTime);
  if (!inviteLink) {
    throw new HttpError(502, "invite_failed", "We couldn't create a link. Try again in a moment.");
  }
  // The link itself is a credential and is deliberately left out of the log.
  await collections(admin.db).audit.add(
    auditEntry(
      user,
      now,
      `${role}.invite_link`,
      "user",
      uid,
      movedFrom
        ? `Created a set-password link for ${profile.email} and restored its sign-in address, which had been changed to ${movedFrom}`
        : `Created a set-password link for ${profile.email}${
            cancelledTemporary ? ", which cancelled their temporary password" : ""
          }`,
    ),
  );
  return { inviteLink };
}

// ── Punishments ──────────────────────────────────────────────────────────────

interface PunishmentInput {
  title?: string;
  details?: string;
  status?: PunishmentStatus;
}

function readPunishment(body: unknown, requireTitle: boolean): PunishmentInput {
  const input = isRecord(body) ? body : {};
  const issues: FieldIssue[] = [];
  const result: PunishmentInput = {};

  if (input.title !== undefined || requireTitle) {
    const read = readText(input.title, LIMITS.punishmentTitle);
    if (!read.ok || !read.value) {
      issues.push({
        path: "title",
        code: read.ok || read.reason === "type" ? "required" : "too_long",
        message:
          !read.ok && read.reason === "too_long"
            ? `Keep the title to ${LIMITS.punishmentTitle} characters or fewer.`
            : "Enter a title.",
      });
    } else {
      result.title = read.value;
    }
  }
  if (input.details !== undefined) {
    const read = readText(input.details ?? "", LIMITS.punishmentDetails, true);
    if (!read.ok) {
      issues.push({
        path: "details",
        code: "too_long",
        message: `Keep the details to ${LIMITS.punishmentDetails} characters or fewer.`,
      });
    } else {
      result.details = read.value;
    }
  }
  if (input.status !== undefined) {
    const status = readEnum<PunishmentStatus>(input.status, ["active", "resolved"]);
    if (!status) issues.push({ path: "status", code: "invalid", message: "Unknown status." });
    else result.status = status;
  }
  if (issues.length > 0) throw invalid(issues);
  return result;
}

export async function addPunishment(
  { admin, user, now }: Caller,
  uid: string,
  body: unknown,
): Promise<PunishmentDto> {
  const { profile } = await requirePledge(admin, uid);
  const input = readPunishment(body, true);
  const cols = collections(admin.db);
  const ref = cols.punishments.doc();
  const punishment = {
    uid,
    title: input.title ?? "",
    details: input.details ?? "",
    status: "active" as const,
    createdAt: Timestamp.fromDate(now),
    createdBy: user.uid,
    resolvedAt: null,
    resolvedBy: null,
  };
  const batch = admin.db.batch();
  batch.create(ref, punishment);
  batch.create(
    cols.audit.doc(),
    auditEntry(user, now, "punishment.add", "punishment", ref.id, `${profile.email}: ${punishment.title}`),
  );
  await batch.commit();
  return punishmentDto(ref.id, punishment);
}

export async function updatePunishment(
  { admin, user, now }: Caller,
  id: string,
  body: unknown,
): Promise<PunishmentDto> {
  const input = readPunishment(body, false);
  const cols = collections(admin.db);
  const ref = cols.punishments.doc(id);

  return admin.db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data();
    if (!current) throw new HttpError(404, "not_found", "That punishment doesn't exist.");

    const next = { ...current };
    if (input.title !== undefined) next.title = input.title;
    if (input.details !== undefined) next.details = input.details;
    if (input.status !== undefined && input.status !== current.status) {
      next.status = input.status;
      next.resolvedAt = input.status === "resolved" ? Timestamp.fromDate(now) : null;
      next.resolvedBy = input.status === "resolved" ? user.uid : null;
    }
    tx.set(ref, next);
    const action =
      next.status !== current.status
        ? next.status === "resolved"
          ? "punishment.resolve"
          : "punishment.reopen"
        : "punishment.update";
    tx.create(cols.audit.doc(), auditEntry(user, now, action, "punishment", id, next.title));
    return punishmentDto(id, next);
  });
}

export async function deletePunishment({ admin, user, now }: Caller, id: string): Promise<{ ok: true }> {
  const cols = collections(admin.db);
  const ref = cols.punishments.doc(id);
  await admin.db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data();
    if (!current) throw new HttpError(404, "not_found", "That punishment doesn't exist.");
    tx.delete(ref);
    tx.create(
      cols.audit.doc(),
      auditEntry(user, now, "punishment.remove", "punishment", id, current.title),
    );
  });
  return { ok: true };
}
