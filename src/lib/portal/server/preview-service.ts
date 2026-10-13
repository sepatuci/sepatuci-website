import { randomBytes } from "node:crypto";
import type { UserRecord } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { ID_PATTERN, TIMING, UCI_EMAIL_PATTERN } from "../constants";
import { isRecord, readEnum } from "../parse";
import { isPreviewProfile, previewAccount, type PreviewAccount } from "../preview";
import type {
  MemberRole,
  PreviewRedeemDto,
  PreviewStartResultDto,
  PreviewStateDto,
  PreviewStatusDto,
} from "../types";
import type { PortalAdmin } from "./admin";
import {
  authRecords,
  errorCode,
  memberClaims,
  newTemporaryPassword,
  onTemporaryPassword,
  purgeMemberData,
} from "./admin-pledges-service";
import { auditEntry } from "./audit";
import { HttpError, invalid } from "./http";
import type { Caller } from "./pledge-service";
import { hashPreviewCode, isPreviewCode, newPreviewCode, previewCodeExpired } from "./preview-codes";
import { fingerprint, nextSecond } from "./temporary-password";
import { collections, deleteMatching, emptyStoredActivity, iso, type UserDoc } from "./store";

/**
 * An admin's preview account: a sandbox pledge or active, one per admin, for
 * going through a new pledge's first visit in a separate tab. It is created
 * and reset exactly as a real account is, and left out of every list the
 * portal makes. The admin reaches it through a one-time link: until the link
 * is opened the account has a password nobody knows, and opening it is what
 * issues the temporary password, so none is ever stored or copied out.
 */

interface Sandbox {
  uid: string;
  profile: UserDoc;
  record: UserRecord | undefined;
}

const invalidCode = () =>
  new HttpError(
    404,
    "preview_code_invalid",
    "This preview link has expired or was already used. Go back to the People page and start the preview again.",
  );

/** A password nobody knows, for a preview account until its link is opened. */
const unknownPassword = (): string => randomBytes(32).toString("base64url");

/** Every preview account this admin has. One at most, apart from a start that was interrupted. */
async function findSandboxes(admin: PortalAdmin, ownerUid: string): Promise<Sandbox[]> {
  const snapshot = await collections(admin.db).users.where("previewOwnerUid", "==", ownerUid).get();
  const records = await authRecords(
    admin,
    snapshot.docs.map((doc) => doc.id),
  );
  return snapshot.docs.map((doc) => ({ uid: doc.id, profile: doc.data(), record: records.get(doc.id) }));
}

function previewState({ uid, profile, record }: Sandbox): PreviewStateDto {
  return {
    uid,
    role: profile.role === "active" ? "active" : "pledge",
    email: profile.email,
    displayName: profile.displayName,
    // Ready for a first sign-in until the temporary password has been replaced.
    stage: onTemporaryPassword(record) ? "ready" : "in_progress",
    createdAt: iso(profile.createdAt),
  };
}

/** The admin's preview account as the pages show it, or null without one. */
export async function findPreview(admin: PortalAdmin, ownerUid: string): Promise<PreviewStateDto | null> {
  const [sandbox] = await findSandboxes(admin, ownerUid);
  return sandbox ? previewState(sandbox) : null;
}

export async function getPreviewState({ admin, user }: Caller): Promise<PreviewStatusDto> {
  return { preview: await findPreview(admin, user.uid) };
}

/** What a preview profile holds, beside what any member's does. */
function ownership(caller: Caller): Pick<UserDoc, "previewOwnerUid" | "previewOwnerEmail"> {
  return { previewOwnerUid: caller.user.uid, previewOwnerEmail: caller.user.email };
}

/**
 * Makes the sign-in account. One in the way at the sandbox's own uid with no
 * profile is left over from an interrupted start and is cleared first. Any
 * other account at the address is somebody's, and the start is refused.
 */
async function createSandboxAccount(
  admin: PortalAdmin,
  target: PreviewAccount,
  password: string,
): Promise<UserRecord> {
  const request = {
    uid: target.uid,
    email: target.email,
    displayName: target.displayName,
    emailVerified: true,
    password,
  };
  try {
    return await admin.auth.createUser(request);
  } catch (error) {
    const code = errorCode(error);
    if (code !== "auth/email-already-exists" && code !== "auth/uid-already-exists") throw error;
    const inTheWay =
      code === "auth/email-already-exists"
        ? await admin.auth.getUserByEmail(target.email)
        : await admin.auth.getUser(target.uid);
    const profile = (await collections(admin.db).users.doc(inTheWay.uid).get()).data();
    if (profile !== undefined || inTheWay.uid !== target.uid) {
      throw new HttpError(
        409,
        "preview_email_taken",
        profile !== undefined && isPreviewProfile(profile)
          ? "Another admin's preview account already uses that address."
          : "An account already uses the address this preview would take.",
      );
    }
    await admin.auth.deleteUser(inTheWay.uid);
    return admin.auth.createUser(request);
  }
}

/**
 * A brand-new preview account, made as a member's account is. It is flagged
 * as being on a temporary password from the start, so that until its link is
 * opened it can reach nothing even if the password it has were known.
 */
async function createSandbox(caller: Caller, target: PreviewAccount, role: MemberRole): Promise<Sandbox> {
  const { admin, user, now } = caller;
  const password = unknownPassword();
  const record = await createSandboxAccount(admin, target, password);
  const stamp = Timestamp.fromDate(now);
  const profile: UserDoc = {
    email: target.email,
    displayName: target.displayName,
    role,
    status: "active",
    pledgeClass: null,
    teamId: null,
    onboardedAt: null,
    createdAt: stamp,
    createdBy: user.uid,
    updatedAt: stamp,
    submitted: {},
    activity: emptyStoredActivity(),
    temporaryPassword: fingerprint(password),
    ...ownership(caller),
  };
  try {
    await admin.auth.setCustomUserClaims(
      record.uid,
      memberClaims(role, target.email, { issuedAt: now, brandNew: true }),
    );
    await collections(admin.db).users.doc(record.uid).create(profile);
  } catch (error) {
    // Never leave a sign-in account behind without its portal profile.
    await admin.auth.deleteUser(record.uid).catch(() => undefined);
    throw error;
  }
  // Read again, so that the account's claims, set above, are on the record handed back.
  return { uid: record.uid, profile, record: await admin.auth.getUser(record.uid) };
}

/**
 * Puts an existing preview account back to the start, keeping its uid: as
 * when a temporary password is issued, every sign-in ends first and the flag
 * goes on before the password, and in between everything it did is deleted.
 */
async function resetSandbox(
  caller: Caller,
  sandbox: Sandbox,
  target: PreviewAccount,
  role: MemberRole,
): Promise<Sandbox> {
  const { admin, user, now } = caller;
  const { uid } = sandbox;
  const cols = collections(admin.db);
  const password = unknownPassword();

  // The address a role's sandbox takes can change between versions of the
  // portal. If somebody else holds the new one, the move below would fail
  // halfway, so it is refused before anything is undone.
  if (target.email !== sandbox.record?.email) {
    const holder = await admin.auth.getUserByEmail(target.email).catch((error: unknown) => {
      if (errorCode(error) === "auth/user-not-found") return null;
      throw error;
    });
    if (holder !== null && holder.uid !== uid) {
      throw new HttpError(409, "preview_email_taken", "An account already uses the address this preview would take.");
    }
  }

  await admin.auth.revokeRefreshTokens(uid);
  await purgeMemberData(admin, uid);
  await admin.auth.setCustomUserClaims(
    uid,
    memberClaims(role, target.email, { issuedAt: now, brandNew: true }),
  );
  const stamp = Timestamp.fromDate(now);
  const fresh: UserDoc = {
    email: target.email,
    displayName: target.displayName,
    role,
    status: "active",
    pledgeClass: null,
    teamId: null,
    onboardedAt: null,
    createdAt: stamp,
    createdBy: user.uid,
    updatedAt: stamp,
    submitted: {},
    activity: emptyStoredActivity(),
    temporaryPassword: fingerprint(password),
    ...ownership(caller),
  };
  await cols.users.doc(uid).set(fresh);
  await admin.auth.updateUser(uid, {
    email: target.email,
    emailVerified: true,
    displayName: target.displayName,
    disabled: false,
    password,
  });
  // Once more, for a sign-in that slipped in between the steps above.
  await nextSecond();
  await admin.auth.revokeRefreshTokens(uid);
  return { uid, profile: fresh, record: await admin.auth.getUser(uid) };
}

/** Deletes a preview account and everything it did, and says so in the log. */
async function deleteSandbox({ admin, user, now }: Caller, sandbox: Sandbox): Promise<void> {
  try {
    await admin.auth.deleteUser(sandbox.uid);
  } catch (error) {
    if (errorCode(error) !== "auth/user-not-found") throw error;
  }
  await purgeMemberData(admin, sandbox.uid);
  const cols = collections(admin.db);
  const batch = admin.db.batch();
  batch.delete(cols.users.doc(sandbox.uid));
  batch.create(
    cols.audit.doc(),
    auditEntry(
      user,
      now,
      "preview.remove",
      "user",
      sandbox.uid,
      `Removed the preview account ${sandbox.profile.email}`,
    ),
  );
  await batch.commit();
}

/**
 * Starts, or starts over, the caller's preview of a role. The account is made
 * or reset, every earlier link of the caller's stops working, and one new
 * link is handed back. The code reaches neither the log nor the database.
 */
export async function startPreview(caller: Caller, body: unknown): Promise<PreviewStartResultDto> {
  const { admin, user, now } = caller;
  const input = isRecord(body) ? body : {};
  const role = readEnum<MemberRole>(input.role, ["pledge", "active"]);
  if (!role) {
    throw invalid([{ path: "role", code: "invalid", message: "Choose whether to preview as a pledge or an active." }]);
  }
  // The sandbox's address is the admin's own with a tag. On any other domain
  // that would be some stranger's UCI mailbox, and a reset email from Firebase
  // would hand them the account.
  if (!UCI_EMAIL_PATTERN.test(user.email)) {
    const message = "Previews need an admin account with a UCI address.";
    throw new HttpError(422, "preview_needs_uci", message, [{ path: "role", code: "invalid", message }]);
  }

  const target = previewAccount(user.email, user.uid, role);
  const cols = collections(admin.db);
  // Every earlier link of the caller's goes first, so none can be opened
  // against an account that is being reset underneath it.
  await deleteMatching(admin.db, cols.previewCodes.where("ownerUid", "==", user.uid));
  const existing = await findSandboxes(admin, user.uid);
  // One preview account per admin: one for the other role goes next.
  for (const sandbox of existing) {
    if (sandbox.uid !== target.uid) await deleteSandbox(caller, sandbox);
  }
  const current = existing.find((sandbox) => sandbox.uid === target.uid);
  const sandbox = current
    ? await resetSandbox(caller, current, target, role)
    : await createSandbox(caller, target, role);

  const code = newPreviewCode();
  const expiresAt = new Date(now.getTime() + TIMING.previewCodeMs);
  const batch = admin.db.batch();
  batch.create(cols.previewCodes.doc(hashPreviewCode(code)), {
    ownerUid: user.uid,
    uid: target.uid,
    email: target.email,
    role,
    expiresAt: Timestamp.fromDate(expiresAt),
  });
  batch.create(
    cols.audit.doc(),
    auditEntry(
      user,
      now,
      "preview.start",
      "user",
      target.uid,
      `${current ? "Started over" : "Started"} a preview as a new ${role}, ${target.email}`,
    ),
  );
  await batch.commit();

  return { code, expiresAt: expiresAt.toISOString(), preview: previewState(sandbox) };
}

/** Deletes the caller's preview account, everything it did, and any link to it. */
export async function removePreview(caller: Caller): Promise<{ ok: true }> {
  const { admin, user } = caller;
  const sandboxes = await findSandboxes(admin, user.uid);
  if (sandboxes.length === 0) {
    throw new HttpError(404, "not_found", "You don't have a preview account.");
  }
  for (const sandbox of sandboxes) await deleteSandbox(caller, sandbox);
  await deleteMatching(admin.db, collections(admin.db).previewCodes.where("ownerUid", "==", user.uid));
  return { ok: true };
}

/**
 * Trades the code from a preview link for the account's address and a
 * temporary password, issued on the spot exactly as an admin issues one. Open
 * to anyone, since the code is the credential: it works once, acts only on
 * the preview account it was made for, as that account is now, and every way
 * it can fail is answered alike.
 */
export async function redeemPreview(
  admin: PortalAdmin,
  body: unknown,
  now: Date,
): Promise<PreviewRedeemDto> {
  const code = isRecord(body) ? body.code : undefined;
  if (!isPreviewCode(code)) throw invalidCode();
  const cols = collections(admin.db);
  const ref = cols.previewCodes.doc(hashPreviewCode(code));
  // The transaction is what makes a link work exactly once, however many tabs
  // open it at the same moment. The code is spent whatever is found.
  const found = await admin.db.runTransaction(async (tx) => {
    const stored = (await tx.get(ref)).data();
    if (!stored) return null;
    const profile = ID_PATTERN.test(stored.uid)
      ? (await tx.get(cols.users.doc(stored.uid))).data()
      : undefined;
    tx.delete(ref);
    const stillTheSame =
      profile !== undefined &&
      isPreviewProfile(profile) &&
      profile.previewOwnerUid === stored.ownerUid &&
      profile.email === stored.email &&
      profile.role === stored.role;
    return stillTheSame ? { stored, profile } : null;
  });
  const expiresAtMs = found?.stored.expiresAt instanceof Timestamp ? found.stored.expiresAt.toMillis() : Number.NaN;
  if (!found || previewCodeExpired(expiresAtMs, now.getTime())) throw invalidCode();

  const { uid, email, role } = found.stored;
  const password = newTemporaryPassword();
  try {
    // As when an admin issues one: every sign-in ends, the flag goes on before
    // the password, and once more afterwards for a sign-in that slipped in between.
    await admin.auth.revokeRefreshTokens(uid);
    await admin.auth.setCustomUserClaims(
      uid,
      memberClaims(role, email, { issuedAt: now, brandNew: found.profile.onboardedAt === null }),
    );
    await cols.users.doc(uid).update({ temporaryPassword: fingerprint(password) });
    await admin.auth.updateUser(uid, { email, emailVerified: true, password });
    await nextSecond();
    await admin.auth.revokeRefreshTokens(uid);
  } catch (error) {
    // Whoever holds the link is told nothing about the account. The failure is logged for the admin to find.
    console.error("[Portal] Could not issue a preview password:", errorCode(error) || "unknown error");
    throw invalidCode();
  }
  return { email, temporaryPassword: password, role };
}
