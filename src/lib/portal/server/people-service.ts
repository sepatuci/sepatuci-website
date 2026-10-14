import type { UserRecord } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { UCI_EMAIL_PATTERN } from "../constants";
import { isRecord, readEnum } from "../parse";
import { isPreviewProfile } from "../preview";
import type {
  AccountState,
  AdminKind,
  ChangeRoleResultDto,
  PeopleDto,
  PersonRowDto,
  Role,
  UserStatus,
} from "../types";
import {
  authRecords,
  errorCode,
  keptTemporary,
  lastSignIn,
  memberClaims,
  onTemporaryPassword,
} from "./admin-pledges-service";
import { loadTeams } from "./admin-teams-service";
import { auditEntry } from "./audit";
import { HttpError, invalid } from "./http";
import type { Caller } from "./pledge-service";
import { findPreview } from "./preview-service";
import { nextSecond } from "./temporary-password";
import { collections, iso, type UserDoc } from "./store";

/**
 * Everyone with a portal account, admins included, and the one thing that is
 * done to a person here rather than on their own page: changing their role.
 * An admin made here is a "granted" admin, told apart by a claim on their
 * sign-in; one named in the portal's configuration is "listed", and only the
 * configuration can change them.
 */

const notFound = () => new HttpError(404, "not_found", "That account doesn't exist.");

const ROLES: readonly Role[] = ["admin", "active", "pledge"];

function toPersonRow(
  uid: string,
  profile: UserDoc,
  record: UserRecord | undefined,
  caller: Caller,
): PersonRowDto {
  const lastSignInAt = lastSignIn(record);
  const status: UserStatus =
    profile.status === "disabled" || record?.disabled === true ? "disabled" : "active";

  // "Invited" means the person has never reached the portal, by any of the
  // signs the portal keeps: a sign-in, a welcome, or a recorded visit.
  let accountState: AccountState = "active";
  if (status === "disabled") accountState = "disabled";
  else if (onTemporaryPassword(record)) accountState = "invited";
  else if (lastSignInAt === null && profile.onboardedAt === null && profile.activity.firstSeenAt === null) {
    accountState = "invited";
  }

  const listed = caller.admin.env.adminEmails.includes(profile.email.toLowerCase());
  // What lets an admin in: the configured list, or the claim the portal puts on
  // an admin it made. One with neither is an admin on paper only.
  let adminKind: AdminKind | null = null;
  if (profile.role === "admin") {
    if (listed) adminKind = "listed";
    else if (record?.customClaims?.granted === true) adminKind = "granted";
  }
  const self = uid === caller.user.uid;
  return {
    uid,
    email: profile.email,
    displayName: profile.displayName,
    role: profile.role,
    status,
    signInBlocked: record ? record.disabled : status === "disabled",
    accountState,
    createdAt: iso(profile.createdAt),
    lastSignInAt,
    adminKind,
    self,
    canChangeRole: !self && !listed && status !== "disabled",
  };
}

export async function listPeople(caller: Caller): Promise<PeopleDto> {
  const { admin, user, now } = caller;
  const cols = collections(admin.db);
  const [usersSnap, preview] = await Promise.all([cols.users.get(), findPreview(admin, user.uid)]);
  // The caller's own preview account is shown on its own card, never as a person.
  const docs = usersSnap.docs.filter((doc) => !isPreviewProfile(doc.data()));
  const records = await authRecords(
    admin,
    docs.map((doc) => doc.id),
  );
  const people = docs
    .map((doc) => toPersonRow(doc.id, doc.data(), records.get(doc.id), caller))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const teams = await loadTeams(
    cols,
    docs.filter((doc) => doc.data().role === "pledge").map((doc) => doc.data().teamId),
  );
  return { serverNow: now.toISOString(), people, preview, teams };
}

/** How many admins there are apart from this one, counting only those who could act. */
function otherAdmins(admins: FirebaseFirestore.QuerySnapshot<UserDoc>, uid: string): number {
  return admins.docs.filter(
    (doc) => doc.id !== uid && doc.data().status !== "disabled" && !isPreviewProfile(doc.data()),
  ).length;
}

/**
 * Why a role change is refused, in the order the rules are applied, or null
 * when it may go ahead. Applied once before anything is touched and again on
 * the profile as the transaction reads it. The admins are only counted when
 * an admin is being stepped down.
 */
async function refusal(
  uid: string,
  profile: UserDoc,
  record: UserRecord,
  role: Role,
  adminEmails: readonly string[],
  admins: () => Promise<FirebaseFirestore.QuerySnapshot<UserDoc>>,
): Promise<HttpError | null> {
  const email = profile.email.toLowerCase();
  if (adminEmails.includes(email)) {
    return new HttpError(
      403,
      "listed_admin",
      "This admin is set in the portal's configuration and can't be changed here.",
    );
  }
  if (profile.role === "admin" && role !== "admin" && otherAdmins(await admins(), uid) === 0) {
    return new HttpError(409, "last_admin", "At least one admin has to remain.");
  }
  if (profile.status === "disabled" || record.disabled) {
    return new HttpError(409, "account_disabled", "Re-enable the account first.");
  }
  // The role they have is the one on the profile and on their sign-in alike.
  // If an earlier change got only as far as the profile, asking for that role
  // again is how the sign-in catches up.
  if (profile.role === role && record.customClaims?.role === role) {
    return new HttpError(409, "same_role", "They already have that role.");
  }
  // A pledge or an active is only ever on a UCI address. An admin need not be.
  if (role !== "admin" && !UCI_EMAIL_PATTERN.test(email)) {
    return invalid([
      { path: "role", code: "invalid_email", message: "Only a UCI address can be a pledge or an active." },
    ]);
  }
  // A temporary password is a member's way in, and is replaced on a member's
  // routes. An admin on one would be able to do nothing, including replace it.
  if (role === "admin" && onTemporaryPassword(record)) {
    return new HttpError(
      409,
      "on_temporary_password",
      "They are still on a temporary password. Wait until they have chosen their own, or send them a password link first.",
    );
  }
  return null;
}

/**
 * What changes on the profile beside the role itself. A pledge who moves on
 * leaves their team and class; anyone taking up a member role is welcomed to
 * it afresh. Their responses stay in the deliverables' records.
 */
function rolePatch(from: Role, to: Role): Partial<Pick<UserDoc, "teamId" | "pledgeClass" | "onboardedAt">> {
  if (from === to) return {};
  return {
    ...(from === "pledge" ? { teamId: null, pledgeClass: null } : {}),
    ...(to !== "admin" ? { onboardedAt: null } : {}),
  };
}

/**
 * Gives a person another role. Every sign-in of theirs ends, and the next one
 * carries the new role. An admin made here is let in by a claim on their
 * sign-in, not by the configured list.
 */
export async function changeRole(caller: Caller, uid: string, body: unknown): Promise<ChangeRoleResultDto> {
  const { admin, user, now } = caller;
  const input = isRecord(body) ? body : {};
  const role = readEnum<Role>(input.role, ROLES);
  if (!role) throw invalid([{ path: "role", code: "invalid", message: "Choose a role." }]);
  if (uid === user.uid) {
    throw new HttpError(403, "cannot_change_self", "You can't change your own role. Ask another admin.");
  }

  const cols = collections(admin.db);
  const userRef = cols.users.doc(uid);
  const profile = (await userRef.get()).data();
  if (!profile || isPreviewProfile(profile)) throw notFound();
  let record: UserRecord;
  try {
    record = await admin.auth.getUser(uid);
  } catch (error) {
    if (errorCode(error) !== "auth/user-not-found") throw error;
    // A profile with no sign-in account has no role to sign in with.
    throw notFound();
  }
  const admins = cols.users.where("role", "==", "admin");
  const refused = await refusal(uid, profile, record, role, admin.env.adminEmails, () => admins.get());
  if (refused) throw refused;

  // Every existing sign-in ends first, so none can carry the old role on while
  // the new one is written.
  await admin.auth.revokeRefreshTokens(uid);
  const stamp = Timestamp.fromDate(now);
  const from = await admin.db.runTransaction(async (tx) => {
    const current = (await tx.get(userRef)).data();
    if (!current || isPreviewProfile(current)) throw notFound();
    // Judged again in the same step as the change, with the admins counted
    // here, so two admins stepping each other down at once cannot leave the
    // portal with none.
    const again = await refusal(uid, current, record, role, admin.env.adminEmails, () => tx.get(admins));
    if (again) throw again;
    tx.update(userRef, { role, updatedAt: stamp, ...rolePatch(current.role, role) });
    tx.create(
      cols.audit.doc(),
      auditEntry(user, now, "member.role_change", "user", uid, `${current.email}: ${current.role} to ${role}`),
    );
    return current.role;
  });

  // A temporary password still outstanding goes with them, as it was issued.
  const temporary = keptTemporary(record.customClaims);
  await admin.auth.setCustomUserClaims(
    uid,
    role === "admin" ? { role: "admin", granted: true } : memberClaims(role, profile.email, temporary),
  );
  // Once more, for a sign-in that slipped in between the steps above. From
  // here on every sign-in carries the new role.
  await nextSecond();
  await admin.auth.revokeRefreshTokens(uid);

  const after: UserDoc = { ...profile, role, updatedAt: stamp, ...rolePatch(from, role) };
  return { person: toPersonRow(uid, after, await admin.auth.getUser(uid), caller) };
}
