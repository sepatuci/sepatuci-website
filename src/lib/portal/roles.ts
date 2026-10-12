import type { Role } from "./types";

/**
 * The three kinds of people in the portal and the part of it each one uses.
 * Everything here is keyed by Role, so adding a role is a compile error until
 * every table has an entry for it, instead of quietly falling into another
 * role's branch.
 */

/** Where each role lands after signing in. */
export const ROLE_HOME: Record<Role, string> = {
  admin: "/portal/admin",
  active: "/portal/review",
  pledge: "/portal",
};

/** The line under the programme name in the header. */
export const PORTAL_LABEL: Record<Role, string> = {
  admin: "Admin portal",
  active: "Actives view",
  pledge: "Pledge portal",
};

/** How a role is described on the Account page. */
export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: "Founder's Education admin",
  active: "Active member, view only",
  pledge: "Pledge",
};

/** Pages every signed-in person shares. */
const SHARED_PATHS: readonly string[] = ["/portal/account"];

const within = (pathname: string, root: string): boolean =>
  pathname === root || pathname.startsWith(`${root}/`);

/** True when a portal path belongs to the given role's area. */
export function areaAllows(role: Role, pathname: string): boolean {
  if (SHARED_PATHS.includes(pathname)) return true;
  if (role === "admin") return within(pathname, ROLE_HOME.admin);
  if (role === "active") return within(pathname, ROLE_HOME.active);
  // The pledge area is the rest of the portal: everything that is not another role's.
  return (
    within(pathname, ROLE_HOME.pledge) &&
    !within(pathname, ROLE_HOME.admin) &&
    !within(pathname, ROLE_HOME.active)
  );
}
