import type { UserRecord } from "firebase-admin/auth";
import type {
  AccountState,
  ActiveRowDto,
  ActivesDto,
  CreateActiveResultDto,
  InviteLinkDto,
  UserStatus,
} from "../types";
import {
  authRecords,
  createMember,
  createMemberInviteLink,
  issueTemporaryPassword,
  lastSignIn,
  onTemporaryPassword,
  removeMember,
  updateMember,
} from "./admin-pledges-service";
import type { Caller } from "./pledge-service";
import { collections, iso, type UserDoc } from "./store";

/**
 * Admin management of active members' accounts. An active is a read-only
 * viewer: they are created, disabled and removed exactly like a pledge, but
 * have no class, team, deliverables or tracked time.
 */

function toActiveRow(
  uid: string,
  profile: UserDoc,
  record: UserRecord | undefined,
): ActiveRowDto {
  const lastSignInAt = lastSignIn(record);
  const status: UserStatus =
    profile.status === "disabled" || record?.disabled === true ? "disabled" : "active";

  let accountState: AccountState = "active";
  if (status === "disabled") accountState = "disabled";
  else if (onTemporaryPassword(record)) accountState = "invited";
  // "Invited" means they have never reached the portal: no sign-in, and they
  // have not been through the welcome.
  else if (lastSignInAt === null && profile.onboardedAt === null) {
    accountState = "invited";
  }

  return {
    uid,
    email: profile.email,
    displayName: profile.displayName,
    status,
    signInBlocked: record ? record.disabled : status === "disabled",
    accountState,
    createdAt: iso(profile.createdAt),
    lastSignInAt,
  };
}

export async function listActives({ admin, now }: Caller): Promise<ActivesDto> {
  const snapshot = await collections(admin.db).users.where("role", "==", "active").get();
  const records = await authRecords(
    admin,
    snapshot.docs.map((doc) => doc.id),
  );
  const actives = snapshot.docs
    .map((doc) => toActiveRow(doc.id, doc.data(), records.get(doc.id)))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { serverNow: now.toISOString(), actives };
}

export async function createActive(
  caller: Caller,
  body: unknown,
  origin: string,
): Promise<CreateActiveResultDto> {
  const created = await createMember(caller, body, origin, "active");
  return {
    active: toActiveRow(created.record.uid, created.profile, created.record),
    inviteLink: created.inviteLink,
    temporaryPassword: created.temporaryPassword,
  };
}

export const updateActive = (caller: Caller, uid: string, body: unknown): Promise<{ ok: true }> =>
  updateMember(caller, uid, body, "active");

export const removeActive = (
  caller: Caller,
  uid: string,
  confirmEmail: string | null,
): Promise<{ ok: true }> => removeMember(caller, uid, confirmEmail, "active");

export const issueActiveTemporaryPassword = (caller: Caller, uid: string) =>
  issueTemporaryPassword(caller, uid, "active");

export const createActiveInviteLink = (
  caller: Caller,
  uid: string,
  origin: string,
): Promise<InviteLinkDto> => createMemberInviteLink(caller, uid, origin, "active");
