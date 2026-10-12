/**
 * Server configuration for the portal. Two modes exist:
 *
 *  - live: a real Firebase project, authenticated with a service account.
 *  - emulator: the local Firebase emulators, used for development and tests.
 *
 * The emulators accept unsigned tokens, so emulator
 * mode is refused outright anywhere that looks like a deployment.
 */

export type PortalMode = "live" | "emulator";

export interface PortalEnv {
  mode: PortalMode;
  projectId: string;
  /** Lower-cased. An account is an admin only if its email is in this list and it carries the admin claim. */
  adminEmails: readonly string[];
  serviceAccount: { clientEmail: string; privateKey: string } | null;
}

export class PortalConfigError extends Error {
  constructor(
    readonly code: "not_configured" | "unsafe_environment",
    message: string,
  ) {
    super(message);
    this.name = "PortalConfigError";
  }
}

type EnvSource = Readonly<Record<string, string | undefined>>;

/** A loopback host and a port, and nothing else: no user info, path or spaces. */
const LOOPBACK_ADDRESS = /^(?:127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/i;

function isLoopback(hostAndPort: string): boolean {
  return LOOPBACK_ADDRESS.test(hostAndPort);
}

export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

function value(env: EnvSource, key: string): string {
  return (env[key] ?? "").trim();
}

/** Environment files often store the key with literal "\n" sequences and surrounding quotes. */
function normalizePrivateKey(raw: string): string {
  const unquoted = raw.replace(/^["']|["']$/g, "");
  return unquoted.replace(/\\n/g, "\n");
}

export function readPortalEnv(env: EnvSource = process.env): PortalEnv {
  const adminEmails = parseAdminEmails(env.PORTAL_ADMIN_EMAILS);
  // Read exactly as the Firebase SDK reads them: it treats any non-empty value,
  // even a stray space, as "use the emulator", so this check must not be more lenient.
  const authEmulator = env.FIREBASE_AUTH_EMULATOR_HOST ?? "";
  const firestoreEmulator = env.FIRESTORE_EMULATOR_HOST ?? "";

  if (authEmulator || firestoreEmulator) {
    const unsafe = (reason: string) =>
      new PortalConfigError("unsafe_environment", `Refusing to use the Firebase emulators: ${reason}`);

    if (env.NODE_ENV === "production" || env.VERCEL || env.VERCEL_ENV) {
      throw unsafe("emulator settings are present in a production environment.");
    }
    if (!authEmulator || !firestoreEmulator) {
      throw unsafe("both the Auth and Firestore emulator hosts must be set.");
    }
    if (!isLoopback(authEmulator) || !isLoopback(firestoreEmulator)) {
      throw unsafe("emulator hosts must be on this machine.");
    }
    if (value(env, "FIREBASE_PRIVATE_KEY") || value(env, "FIREBASE_CLIENT_EMAIL")) {
      throw unsafe("a service account is configured at the same time.");
    }
    const projectId =
      value(env, "FIREBASE_PROJECT_ID") ||
      value(env, "GCLOUD_PROJECT") ||
      value(env, "NEXT_PUBLIC_FIREBASE_PROJECT_ID");
    if (!projectId.startsWith("demo-")) {
      throw unsafe('the project id must start with "demo-".');
    }
    return { mode: "emulator", projectId, adminEmails, serviceAccount: null };
  }

  const projectId = value(env, "FIREBASE_PROJECT_ID");
  const clientEmail = value(env, "FIREBASE_CLIENT_EMAIL");
  const privateKey = normalizePrivateKey(value(env, "FIREBASE_PRIVATE_KEY"));
  if (!projectId || !clientEmail || !privateKey) {
    throw new PortalConfigError(
      "not_configured",
      "The portal's Firebase service account is not configured.",
    );
  }
  return { mode: "live", projectId, adminEmails, serviceAccount: { clientEmail, privateKey } };
}
