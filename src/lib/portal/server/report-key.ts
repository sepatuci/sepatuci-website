import { createHmac } from "node:crypto";
import { PortalConfigError, type PortalEnv } from "./env";

/**
 * The id of the document that holds back an account's next report for an
 * hour. It is a keyed hash of the account, so someone browsing the database
 * cannot tell whose it is, or work it out by hashing each account in turn,
 * without the server's key. The key is derived from the service account's
 * private key under its own label, so it is never used for anything else.
 */

const LABEL = "sep-fe-portal:report-limit:v1";
// The emulators have no secret, and nothing in them is real.
const EMULATOR_SECRET = "emulator-only-report-limit-secret";

export function reportLimitId(env: PortalEnv, uid: string): string {
  const secret = env.serviceAccount?.privateKey ?? (env.mode === "emulator" ? EMULATOR_SECRET : null);
  if (secret === null) {
    throw new PortalConfigError("not_configured", "The portal has no service account key.");
  }
  const key = createHmac("sha256", secret).update(LABEL).digest();
  return createHmac("sha256", key).update(uid).digest("hex");
}
