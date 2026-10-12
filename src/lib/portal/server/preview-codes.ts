import { createHash, randomBytes } from "node:crypto";
import { TIMING } from "../constants";

/**
 * The code in a preview link. It is the only secret in the link: whoever has
 * it is handed the preview account's address and temporary password, once.
 * Only its hash is stored, so a copy of the database holds no usable link.
 */

/** Thirty-two random bytes, as base64url writes them. */
const PREVIEW_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** How far two servers' clocks may disagree. */
const CLOCK_SLACK_MS = 5 * 60_000;

export function newPreviewCode(): string {
  return randomBytes(32).toString("base64url");
}

/** True for text that has the shape of a code this module makes. Anything else is not worth hashing. */
export function isPreviewCode(value: unknown): value is string {
  return typeof value === "string" && PREVIEW_CODE_PATTERN.test(value);
}

/** The document id a code is stored under. */
export function hashPreviewCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * True when a code that expires at this time (in milliseconds) can no longer
 * be used. It is gone from the moment it expires. A time further ahead than
 * a fresh code could ever be is not one the portal wrote, and is refused too,
 * so a wrong value can never mean "does not expire".
 */
export function previewCodeExpired(expiresAtMs: unknown, nowMs: number): boolean {
  if (typeof expiresAtMs !== "number" || !Number.isFinite(expiresAtMs)) return true;
  if (expiresAtMs - nowMs > TIMING.previewCodeMs + CLOCK_SLACK_MS) return true;
  return nowMs >= expiresAtMs;
}
