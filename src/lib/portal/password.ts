import { PASSWORD_MIN_LENGTH } from "./constants";

/**
 * The rules a portal password must meet, and how strong it is beyond them.
 * The browser uses this to show a checklist as someone types, and the server
 * uses the same function before it accepts a first password, so the two can
 * never disagree about what is allowed.
 */

export const PASSWORD_MAX_LENGTH = 128;

export type PasswordRuleId = "length" | "not_personal" | "not_common" | "not_temporary";

export interface PasswordRule {
  id: PasswordRuleId;
  label: string;
  met: boolean;
}

export interface PasswordCheck {
  /** True when every rule is met. */
  ok: boolean;
  rules: PasswordRule[];
  /** 0 to 4. A guide for the meter, not a rule. */
  strength: 0 | 1 | 2 | 3 | 4;
  strengthLabel: string;
}

export interface PasswordOwner {
  email?: string | null;
  displayName?: string | null;
  /**
   * Set when this password replaces a temporary one: the temporary password
   * itself where it is known (the browser, which was just given it), or true
   * where only the fact is (the server, which never keeps it readable).
   */
  temporary?: string | true | null;
}

// Passwords so common they are tried first by anyone guessing.
const COMMON = new Set([
  "passwordpassword",
  "iloveyou123",
  "welcome12345",
  "anteater123",
  "ucirvine123",
  "sigmaetapi1",
  "changeme123",
  "trustno1trustno1",
  "portal-demo-1",
]);

// Words and keyboard walks that make a password easy to guess however much is
// added around them. Compared after look-alike symbols are read as letters.
const NOTORIOUS = [
  "password",
  "qwerty",
  "letmein",
  "iloveyou",
  "123456",
  "abc123",
  "zotzot",
  "1q2w3e",
  "1qaz2wsx",
  "qazwsx",
  "zaq1",
  "founderseducation",
  "sigmaetapi",
  "pledgeclass",
];

/** Reads stand-in symbols as the letters they replace, leaving digits alone: "z@q1" is "zaq1". */
function plainSymbols(lower: string): string {
  return lower.replace(/@/g, "a").replace(/\$/g, "s").replace(/[!|]/g, "i");
}

/** The same, with stand-in digits read as letters too, so "P@ssw0rd" is seen as "password". */
function plainLetters(lower: string): string {
  return plainSymbols(lower).replace(/0/g, "o").replace(/3/g, "e").replace(/5/g, "s").replace(/1/g, "i");
}

const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];

/** How many characters in a row count as a run such as "abcdef", "654321" or "asdfgh". */
const RUN_LENGTH = 6;

const STRENGTH_LABELS = ["Too weak", "Weak", "Fair", "Strong", "Very strong"] as const;

/** The part of an email before the @, in lower case. */
const localPart = (owner: PasswordOwner): string =>
  ((owner.email ?? "").split("@")[0] ?? "").toLowerCase();

/** Words from the person's own name and email, which make an easy guess. */
function personalWords(owner: PasswordOwner): string[] {
  const words = [
    ...localPart(owner).split(/[^\p{L}]+/u),
    ...(owner.displayName ?? "").split(/[^\p{L}]+/u),
  ];
  return [...new Set(words.map((word) => word.toLowerCase()).filter((word) => word.length >= 3))];
}

/**
 * A long name is caught anywhere in the password. A short one only as a word
 * of its own, so someone called Chen can still use "kitchen". The email name is
 * also taken whole, digits and dots included, so "ab12" and "j.li" count too.
 */
function containsPersonal(password: string, owner: PasswordOwner): boolean {
  const lower = password.toLowerCase();
  const tokens = lower.split(/[^\p{L}]+/u);
  const local = localPart(owner);
  if (local.length >= 5 && lower.includes(local)) return true;
  if (local.length >= 3 && lower.split(/[^\p{L}\p{N}._]+/u).includes(local)) return true;
  return personalWords(owner).some((word) =>
    word.length >= 5 ? lower.includes(word) : tokens.includes(word),
  );
}

function isRepetitive(password: string): boolean {
  if (new Set(password).size <= 2) return true;
  // Every character doubled, such as "aabbccddee".
  if (/^(?:(.)\1)+$/.test(password)) return true;
  // The same short chunk over and over, such as "abcabcabcabc".
  return /^(.{1,4})\1+$/.test(password);
}

type Neighbour = (a: string, b: string, direction: 1 | -1) => boolean;

/** Next to each other in the alphabet or in the digits. */
const inOrder: Neighbour = (a, b, direction) => {
  const plain = /^[a-z0-9]$/;
  return plain.test(a) && plain.test(b) && b.charCodeAt(0) - a.charCodeAt(0) === direction;
};

/** Next to each other along a row of the keyboard. */
const onKeys: Neighbour = (a, b, direction) =>
  KEY_ROWS.some((row) => {
    const at = row.indexOf(a);
    return at !== -1 && row[at + direction] === b;
  });

/**
 * A run follows one kind of order all the way: the alphabet, or the keyboard.
 * The two are never mixed, or an ordinary word such as "understudy" would
 * count (d-e in the alphabet, e-r on the keys, r-s-t-u in the alphabet).
 */
function hasRun(lower: string): boolean {
  for (const neighbour of [inOrder, onKeys]) {
    for (const direction of [1, -1] as const) {
      let run = 1;
      for (let index = 1; index < lower.length; index += 1) {
        run = neighbour(lower[index - 1], lower[index], direction) ? run + 1 : 1;
        if (run >= RUN_LENGTH) return true;
      }
    }
  }
  return false;
}

function isCommon(password: string): boolean {
  const lower = password.toLowerCase();
  return (
    COMMON.has(lower) ||
    [lower, plainSymbols(lower), plainLetters(lower)].some((form) =>
      NOTORIOUS.some((word) => form.includes(word)),
    ) ||
    isRepetitive(password) ||
    hasRun(lower) ||
    // One word and a year, such as "Welcome2026" or "summer-2025!".
    /^[a-z]+[^a-z0-9]?(19|20)\d{2}[a-z]{0,2}[^a-z0-9]{0,2}$/.test(lower) ||
    // One short word and a few digits, such as "sunshine123".
    /^[a-z]{1,10}[^a-z0-9]?\d{1,4}[a-z]{0,2}[^a-z0-9]{0,2}$/.test(lower)
  );
}

// No letters or digits that are easy to misread when copied by hand.
const TEMPORARY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TEMPORARY_GROUPS = 3;
const TEMPORARY_GROUP_LENGTH = 4;
const TEMPORARY_SHAPE = new RegExp(
  `^[${TEMPORARY_ALPHABET}]{${TEMPORARY_GROUP_LENGTH}}(-[${TEMPORARY_ALPHABET}]{${TEMPORARY_GROUP_LENGTH}}){${TEMPORARY_GROUPS - 1}}$`,
);

/** A temporary password without its dashes, and anything else, in capitals. */
export function normaliseTemporary(password: string): string {
  return password.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * True when one string can be turned into the other with at most `limit`
 * single-character edits. Used to catch a temporary password with a character
 * dropped, changed or slipped in.
 */
function withinEdits(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length] <= limit;
}

/** True for anything written exactly like a temporary password, in either case. */
export function looksTemporary(password: string): boolean {
  return TEMPORARY_SHAPE.test(password.trim().toUpperCase());
}

/**
 * Every stretch of a password that could be a temporary password with its
 * dashes taken out. The server compares these with the fingerprint of the one
 * it issued, which catches the temporary password with something added to it.
 */
export function temporaryCandidates(password: string): string[] {
  const plain = normaliseTemporary(password);
  const length = TEMPORARY_GROUPS * TEMPORARY_GROUP_LENGTH;
  const found = new Set<string>();
  for (let start = 0; start + length <= plain.length; start += 1) {
    found.add(plain.slice(start, start + length));
  }
  return [...found];
}

function strengthOf(password: string, ok: boolean): PasswordCheck["strength"] {
  if (password.length === 0) return 0;
  if (password.length < PASSWORD_MIN_LENGTH) return 0;
  if (!ok) return 1;
  // Length counts for most: a long run of plain words beats a short mix of symbols.
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((kind) => kind.test(password)).length;
  if (password.length >= 20 || (password.length >= 16 && kinds >= 3)) return 4;
  if (password.length >= 16 || (password.length >= 13 && kinds >= 3)) return 3;
  if (password.length >= 12) return 2;
  return 1;
}

export function checkPassword(password: string, owner: PasswordOwner = {}): PasswordCheck {
  const typed = password.length > 0;
  const length = password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;

  const rules: PasswordRule[] = [
    { id: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, met: length },
    {
      id: "not_personal",
      label: "Doesn't contain your name or email",
      met: typed && !containsPersonal(password, owner),
    },
    { id: "not_common", label: "Not a common or repeated pattern", met: typed && !isCommon(password) },
  ];

  // Shown to someone replacing a temporary password, and to anyone who types
  // something written like one, so that it is never a silent refusal.
  const replacing = owner.temporary !== undefined && owner.temporary !== null;
  const shaped = looksTemporary(password);
  const issued = typeof owner.temporary === "string" ? normaliseTemporary(owner.temporary) : "";
  const plain = normaliseTemporary(password);
  // The temporary password itself, with something added, or with a character or two changed.
  const reused = issued.length >= 8 && (plain.includes(issued) || withinEdits(plain, issued, 2));
  if (replacing || shaped) {
    rules.push({
      id: "not_temporary",
      label: replacing ? "Not your temporary password" : "Not written like a temporary password",
      met: typed && !shaped && !reused,
    });
  }

  const ok = rules.every((rule) => rule.met);
  const strength = strengthOf(password, ok);
  return { ok, rules, strength, strengthLabel: STRENGTH_LABELS[strength] };
}

/** What to say when a password is the temporary one, or that with something added. */
export const TEMPORARY_REUSED = "Choose your own password, not the temporary one.";

/** One sentence on why a password is refused, or null when it is fine. */
export function passwordProblem(password: string, owner: PasswordOwner = {}): string | null {
  const unmet = checkPassword(password, owner).rules.find((rule) => !rule.met);
  if (!unmet) return null;
  if (unmet.id === "length") {
    return password.length > PASSWORD_MAX_LENGTH
      ? `Use no more than ${PASSWORD_MAX_LENGTH} characters.`
      : `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (unmet.id === "not_personal") return "Leave your name and email out of your password.";
  if (unmet.id === "not_temporary") return TEMPORARY_REUSED;
  return "That password is too easy to guess. Try a few unrelated words.";
}

/**
 * A temporary password an admin can hand to someone, as three groups of four
 * such as "K7QM-2XRT-9BHD". It only has to last until the first sign-in, when
 * the person must replace it with their own. `randomByte` is injected so the
 * server can supply cryptographic randomness.
 */
export function temporaryPassword(randomByte: () => number): string {
  const groups: string[] = [];
  for (let group = 0; group < TEMPORARY_GROUPS; group += 1) {
    let part = "";
    while (part.length < TEMPORARY_GROUP_LENGTH) {
      const byte = randomByte();
      // Bytes past the last whole multiple of the alphabet are skipped, so every character is equally likely.
      if (byte < 256 - (256 % TEMPORARY_ALPHABET.length)) {
        part += TEMPORARY_ALPHABET[byte % TEMPORARY_ALPHABET.length];
      }
    }
    groups.push(part);
  }
  return groups.join("-");
}
