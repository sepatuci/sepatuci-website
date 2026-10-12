import { LIMITS, UCI_EMAIL_PATTERN } from "./constants";

/**
 * Reads a pasted list of people, one per line, so a whole class can be added
 * at once. Each line needs a name and a UCI email in either order, separated
 * by a comma or a tab (which is what pasting from a spreadsheet gives), or
 * written as "Name <email>".
 */

export interface RosterRow {
  /** The line it came from, counting from 1, for pointing at problems. */
  line: number;
  displayName: string;
  email: string;
  /** Why this line cannot be used, or null when it is fine. */
  problem: string | null;
}

/**
 * A spreadsheet treats a cell that starts with one of these as a formula. Names
 * are copied out next to set-password links, so they must never start with one.
 */
export const UNSAFE_NAME_START = /^[=+\-@\t\r]/;

/** One word of a name: letters, with the marks names carry. No digits or spaces. */
const SINGLE_WORD = /^\p{L}[\p{L}'’.-]*$/u;

/** Starts with a letter and has no digits, which keeps phone numbers and ids out of the name. */
const LOOKS_LIKE_A_NAME = /^\p{L}[^\d]*$/u;

/** The most people one paste may add. Larger lists are better split up. */
export const ROSTER_MAX = 100;

export function parseRoster(text: string): RosterRow[] {
  const rows: RosterRow[] = [];
  const seen = new Set<string>();

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line.length === 0) return;

    const parts = line
      .replace(/[<>]/g, ",")
      .split(/[,\t;]/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const emails = parts.filter((part) => part.includes("@"));
    const names = parts.filter((part) => !part.includes("@"));
    const email = (emails[0] ?? "").toLowerCase();
    // First and last name often sit in two columns. Two single words are put
    // together; anything else extra (a phone number, a major, a second email)
    // is refused, never folded into the name, because names are shown to other people.
    const splitName = names.length === 2 && names.every((part) => SINGLE_WORD.test(part));
    const displayName = (splitName ? names.join(" ") : (names[0] ?? "")).replace(/\s+/g, " ");

    let problem: string | null = null;
    if (emails.length === 0) problem = "No email on this line.";
    else if (emails.length > 1) problem = "More than one email on this line.";
    else if (!UCI_EMAIL_PATTERN.test(email)) problem = "Not a @uci.edu address.";
    else if (names.length === 0) problem = "No name on this line.";
    else if (names.length > 1 && !splitName) problem = "Too many columns. Keep just the name and the email.";
    else if (UNSAFE_NAME_START.test(displayName)) problem = "A name can't start with a symbol.";
    else if (!LOOKS_LIKE_A_NAME.test(displayName)) problem = "That doesn't look like a name.";
    else if (displayName.length > LIMITS.displayName) problem = "That name is too long.";
    else if (seen.has(email)) problem = "This address is on the list twice.";
    if (email) seen.add(email);

    rows.push({ line: index + 1, displayName, email, problem });
  });

  // Only lines that can be used count towards the limit, so a header row or a
  // typo does not push a real person off the end.
  let usable = 0;
  return rows.map((row) => {
    if (row.problem !== null) return row;
    usable += 1;
    return usable > ROSTER_MAX
      ? { ...row, problem: `Only ${ROSTER_MAX} people can be added at once.` }
      : row;
  });
}
