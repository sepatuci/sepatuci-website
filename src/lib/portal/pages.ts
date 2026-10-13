import { LIMITS, PORTAL_PATH_PATTERN } from "./constants";

/**
 * Portal pages as the Activity views name them. A heartbeat reports the path
 * of the page the tab is on; this module says which paths are accepted and
 * what to call them.
 */

/** True for a path a heartbeat may report: a plain portal path, not too long. */
export function isPortalPath(value: unknown): value is string {
  return typeof value === "string" && value.length <= LIMITS.pagePath && PORTAL_PATH_PATTERN.test(value);
}

export interface PageNames {
  /** Deliverable titles by form id. */
  forms: ReadonlyMap<string, string>;
  /** Display names by uid. */
  people: ReadonlyMap<string, string>;
}

export const NO_NAMES: PageNames = { forms: new Map(), people: new Map() };

const FIXED: Readonly<Record<string, string>> = {
  "/portal": "Dashboard",
  "/portal/deliverables": "Deliverables",
  "/portal/history": "History",
  "/portal/account": "Account",
  "/portal/guide": "Guide",
  "/portal/welcome": "Welcome tour",
  "/portal/review": "New members",
  "/portal/review/deliverables": "Deliverables",
  "/portal/review/guide": "Guide",
  "/portal/review/welcome": "Welcome tour",
  "/portal/admin": "New members",
  "/portal/admin/people": "People",
  "/portal/admin/actives": "People",
  "/portal/admin/forms": "Deliverables",
  "/portal/admin/teams": "Teams",
  "/portal/admin/activity": "Activity",
  "/portal/admin/guide": "Admin guide",
};

const formTitle = (names: PageNames, id: string): string => names.forms.get(id) ?? "a deliverable since removed";
const personName = (names: PageNames, uid: string): string => names.people.get(uid) ?? "an account since removed";

const PATTERNS: ReadonlyArray<{ pattern: RegExp; label: (match: RegExpExecArray, names: PageNames) => string }> = [
  { pattern: /^\/portal\/deliverables\/([^/]+)$/, label: (m, n) => `Deliverable: ${formTitle(n, m[1])}` },
  { pattern: /^\/portal\/history\/([^/]+)$/, label: (m, n) => `Response: ${formTitle(n, m[1])}` },
  { pattern: /^\/portal\/review\/deliverables\/([^/]+)$/, label: (m, n) => `Deliverable: ${formTitle(n, m[1])}` },
  { pattern: /^\/portal\/review\/new-members\/([^/]+)$/, label: (m, n) => `New member: ${personName(n, m[1])}` },
  { pattern: /^\/portal\/admin\/new-members\/([^/]+)$/, label: (m, n) => `New member: ${personName(n, m[1])}` },
  { pattern: /^\/portal\/admin\/forms\/([^/]+)$/, label: (m, n) => `Editor: ${formTitle(n, m[1])}` },
  { pattern: /^\/portal\/admin\/activity\/([^/]+)$/, label: (m, n) => `Activity: ${personName(n, m[1])}` },
  { pattern: /^\/portal\/admin\/activity\/([^/]+)\/[^/]+$/, label: (m, n) => `Session: ${personName(n, m[1])}` },
];

export const UNKNOWN_PAGE = "Unknown page";

/** What to call a portal page. Unknown paths get a plain label rather than being shown raw. */
export function pageLabel(path: string, names: PageNames = NO_NAMES): string {
  // Own entries only: a name every object inherits is not a page.
  if (Object.hasOwn(FIXED, path)) return FIXED[path];
  for (const { pattern, label } of PATTERNS) {
    const match = pattern.exec(path);
    if (match) return label(match, names);
  }
  return UNKNOWN_PAGE;
}

export interface PageVisit {
  path: string;
  atMs: number;
}

/**
 * How long a page in a session's log was open: until the next page, or until
 * the session was last seen for the last one.
 */
export function dwellSeconds(pages: readonly PageVisit[], index: number, untilMs: number): number {
  const next = index + 1 < pages.length ? pages[index + 1].atMs : untilMs;
  return Math.max(0, Math.round((next - pages[index].atMs) / 1000));
}
