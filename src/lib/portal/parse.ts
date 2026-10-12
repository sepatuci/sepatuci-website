/** Helpers for narrowing untrusted `unknown` input. Nothing here trusts its argument. */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type TextResult =
  | { ok: true; value: string }
  | { ok: false; reason: "type" | "too_long" };

// ASCII control characters other than tab and newline, plus the Unicode
// bidirectional overrides that can make text render differently from how it reads.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;

/**
 * Reads a string, normalizes line endings, strips unsafe characters and trims.
 * Single-line text has newlines and tabs collapsed to spaces.
 */
export function readText(value: unknown, max: number, multiline = false): TextResult {
  if (typeof value !== "string") return { ok: false, reason: "type" };
  let text = value.replace(/\r\n?/g, "\n").replace(UNSAFE_CHARS, "");
  if (!multiline) text = text.replace(/[\n\t]+/g, " ");
  text = text.trim();
  if (text.length > max) return { ok: false, reason: "too_long" };
  return { ok: true, value: text };
}

export function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function readInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/**
 * True for absolute https URLs only. Used before rendering any pledge-supplied
 * text as a link. A name or password before the host is refused, because
 * "https://docs.google.com@elsewhere.example" reads as Google and is not.
 */
export function isHttpUrl(value: string): boolean {
  if (!/^https:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.length > 0 &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

export function isNumeric(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value);
}
