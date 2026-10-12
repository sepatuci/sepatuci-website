import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { readPortalEnv, type PortalEnv } from "./env";

export interface PortalAdmin {
  env: PortalEnv;
  auth: Auth;
  db: Firestore;
}

const APP_NAME = "sep-portal";

// Survives hot reloads in development, where this module is re-evaluated.
const cache = globalThis as typeof globalThis & { __sepPortalAdmin?: PortalAdmin };

/**
 * The Firebase Admin SDK, created on first use. Nothing runs at import time,
 * so the site builds and the public pages work without any Firebase settings.
 * Throws PortalConfigError when the portal is not configured.
 */
export function getPortalAdmin(): PortalAdmin {
  if (cache.__sepPortalAdmin) return cache.__sepPortalAdmin;

  const env = readPortalEnv();
  const app =
    getApps().find((candidate) => candidate.name === APP_NAME) ??
    initializeApp(
      env.serviceAccount
        ? {
            projectId: env.projectId,
            credential: cert({
              projectId: env.projectId,
              clientEmail: env.serviceAccount.clientEmail,
              privateKey: env.serviceAccount.privateKey,
            }),
          }
        : { projectId: env.projectId },
      APP_NAME,
    );

  const admin: PortalAdmin = { env, auth: getAuth(app), db: getFirestore(app) };
  cache.__sepPortalAdmin = admin;
  return admin;
}
