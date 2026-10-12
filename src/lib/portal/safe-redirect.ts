import { areaAllows, ROLE_HOME } from "./roles";
import type { Role } from "./types";

const PORTAL_PATH = /^\/portal(\/[A-Za-z0-9_-]+)*\/?$/;

export function portalHome(role: Role | null): string {
  return role ? ROLE_HOME[role] : ROLE_HOME.pledge;
}

/**
 * Where to send someone after sign-in. Only plain paths inside the portal are
 * accepted, so a crafted `next` parameter can never lead to another site, and
 * only paths in the area that belongs to their role.
 */
export function safeNextPath(next: string | null | undefined, role: Role | null): string {
  const home = portalHome(role);
  if (typeof next !== "string" || !PORTAL_PATH.test(next)) return home;
  // Before the role is known, only the pledge area is a safe guess.
  return areaAllows(role ?? "pledge", next) ? next : home;
}
