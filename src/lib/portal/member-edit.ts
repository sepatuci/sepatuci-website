import { PREVIEW_ADDRESS_TAG } from "./preview";

/**
 * Editing a pledge's or an active's account. Pure and shared with the browser:
 * the edit dialog sends only what changed, and the server reads an address
 * the same way the dialog compares one.
 */

/** An address as the portal keeps it: trimmed and lower-cased. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** True for an address in the form the portal gives an admin's preview accounts. */
export function isPreviewAddress(email: string): boolean {
  return normalizeEmail(email).includes(PREVIEW_ADDRESS_TAG);
}

/** What the dialog edits. Class and team are only there for a pledge. */
export interface MemberEditFields {
  displayName: string;
  email: string;
  pledgeClass?: string;
  /** The team's id, or "" for working individually. */
  teamId?: string;
}

/** The body of the update request: only the fields that changed. */
export interface MemberEditPatch {
  displayName?: string;
  email?: string;
  pledgeClass?: string;
  teamId?: string | null;
}

/**
 * The fields of `draft` that differ from `original`. A team is only sent when
 * it was changed here, so saving a name never undoes a move made from the
 * Teams page in the meantime.
 */
export function memberEditPatch(original: MemberEditFields, draft: MemberEditFields): MemberEditPatch {
  const patch: MemberEditPatch = {};
  if (draft.displayName.trim() !== original.displayName.trim()) patch.displayName = draft.displayName.trim();
  if (normalizeEmail(draft.email) !== normalizeEmail(original.email)) patch.email = normalizeEmail(draft.email);
  if (draft.pledgeClass !== undefined && draft.pledgeClass.trim() !== (original.pledgeClass ?? "").trim()) {
    patch.pledgeClass = draft.pledgeClass.trim();
  }
  if (draft.teamId !== undefined && draft.teamId !== (original.teamId ?? "")) {
    patch.teamId = draft.teamId === "" ? null : draft.teamId;
  }
  return patch;
}
