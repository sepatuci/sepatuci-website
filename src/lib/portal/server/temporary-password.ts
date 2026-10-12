import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { normaliseTemporary, temporaryCandidates } from "../password";

/**
 * A fingerprint of the temporary password an account was given. The password
 * itself is shown to the chair once and never stored. The fingerprint is kept
 * on the profile until the password is replaced, so the server can refuse a
 * "new" password that is the temporary one with the dashes taken out or a
 * character added. A temporary password is random and long enough that its
 * fingerprint cannot be worked backwards.
 */
export interface StoredTemporaryPassword {
  salt: string;
  hash: string;
}

function digest(salt: string, plain: string): Buffer {
  return createHash("sha256").update(`${salt}:${plain}`).digest();
}

export function fingerprint(temporaryPassword: string): StoredTemporaryPassword {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: digest(salt, normaliseTemporary(temporaryPassword)).toString("hex") };
}

/** True when the candidate is, or contains, the temporary password the fingerprint was taken from. */
export function matchesIssued(
  candidate: string,
  stored: StoredTemporaryPassword | null | undefined,
): boolean {
  if (!stored || typeof stored.salt !== "string" || typeof stored.hash !== "string") return false;
  const expected = Buffer.from(stored.hash, "hex");
  return temporaryCandidates(candidate).some((part) => {
    const actual = digest(stored.salt, part);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

/**
 * Firebase ends sign-ins by the whole second: one made in the same second as
 * the call survives it. Waiting for the next second first closes that gap.
 */
export async function nextSecond(): Promise<void> {
  const wait = 1000 - (Date.now() % 1000) + 25;
  await new Promise((resolve) => setTimeout(resolve, wait));
}
