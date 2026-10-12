import { ID_PATTERN } from "./constants";
import type { MemberRole } from "./types";

/**
 * An admin's preview account: a sandbox pledge or active for going through a
 * new member's first visit. This module is pure and shared with the browser.
 * The one thing that marks a profile as a preview is `previewOwnerUid`, and
 * every list the portal makes leaves such profiles out.
 */

/** True for a profile that is an admin's preview account. Only a non-empty owner counts. */
export function isPreviewProfile(profile: { previewOwnerUid?: unknown }): boolean {
  return typeof profile.previewOwnerUid === "string" && profile.previewOwnerUid.length > 0;
}

export interface PreviewAccount {
  uid: string;
  email: string;
  displayName: string;
}

/** The most a uid may be, less the longest prefix put in front of an admin's. */
const UID_ROOM = 64 - "previewactive".length;

/**
 * The account an admin's preview of a role is: the same one every time, so an
 * admin has at most one sandbox per role and starting over finds it again.
 * The uid is built to satisfy ID_PATTERN whatever the admin's own uid holds.
 * The address is the admin's own with a tag, on the UCI domain that every
 * member account must be on, and lower-cased as the portal keeps addresses.
 * A tag the admin's own address carries is dropped first, so the sandbox's
 * mail goes where the admin's does. The server only makes a sandbox for an
 * admin whose address is on that domain, so that is the admin's own mailbox.
 */
export function previewAccount(adminEmail: string, adminUid: string, role: MemberRole): PreviewAccount {
  const owner = adminUid.replace(/[^A-Za-z0-9]/g, "").slice(0, UID_ROOM);
  const uid = `preview${role}${owner}`;
  // Nothing of the admin's uid left would make every such admin share one sandbox.
  if (owner.length === 0 || !ID_PATTERN.test(uid)) {
    throw new Error("A preview uid could not be made from this admin's uid.");
  }

  const localPart = adminEmail
    .toLowerCase()
    .split("@")[0]
    .split("+")[0]
    .replace(/[^a-z0-9._%-]/g, "");
  const email = `${localPart || "admin"}+preview-${role}@uci.edu`;
  return {
    uid,
    email,
    displayName: role === "pledge" ? "Preview Pledge" : "Preview Active",
  };
}
