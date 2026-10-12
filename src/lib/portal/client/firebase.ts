import { getApps, initializeApp } from "firebase/app";
import {
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  type Auth,
} from "firebase/auth";

/**
 * The browser side of Firebase. Only Authentication is used here: the portal
 * never reads or writes the database from the browser.
 */

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "";
const APP_NAME = "sep-portal";

export const isPortalConfigured = config.apiKey.length > 0 && config.projectId.length > 0;

/**
 * True only for a local development build pointed at the emulators. A
 * production build never talks to an emulator, whatever its settings say.
 */
export const isEmulatorPreview =
  isPortalConfigured &&
  process.env.NODE_ENV !== "production" &&
  /^(127\.0\.0\.1|localhost):\d+$/.test(emulatorHost) &&
  config.projectId.startsWith("demo-");

let cached: Auth | null = null;

/** Null on the server, and when the Firebase settings are missing. */
export function getPortalAuth(): Auth | null {
  if (!isPortalConfigured || typeof window === "undefined") return null;
  if (cached) return cached;

  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) {
    cached = getAuth(existing);
    return cached;
  }

  const app = initializeApp(config, APP_NAME);
  // The session lives in this tab only and ends when the tab is closed, which
  // matters on shared and lab computers.
  cached = initializeAuth(app, { persistence: browserSessionPersistence });
  if (isEmulatorPreview) {
    connectAuthEmulator(cached, `http://${emulatorHost}`, { disableWarnings: true });
  }
  return cached;
}
