/**
 * Sign-in is a UCI email and a password. The portal used to ask for a passcode
 * from an authenticator app after the password, and every part of that is
 * gone: the pages, the routes, the refusal, the fields that said who had set
 * it up. This is checked from the source, file by file, so that none of it
 * comes back in a place no other test reads. Tests are left out, since they
 * are where what is gone is named.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const fromRepo = (...parts: string[]): string => path.join(REPO, ...parts);

function filesUnder(folder: string): string[] {
  return readdirSync(fromRepo(folder), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${folder}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(relative) : [relative];
  });
}

const IS_TEST = /\.test\.tsx?$/;
/** Pictures and fonts, which are not read: their bytes spell short words by chance. */
const NOT_TEXT = /\.(?:jpe?g|png|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|pdf)$/i;

/** Every file under src/ that is not a test, by its path from the repository. */
const FILES = filesUnder("src")
  .filter((file) => !IS_TEST.test(file))
  .sort();
const SOURCES = FILES.filter((file) => !NOT_TEXT.test(file)).map((file) => ({ file, lines: readFileSync(fromRepo(file), "utf8").split("\n") }));

/**
 * The words of the second step, in any letter case: the app, what the step
 * was called, what it asked for and how the code was made, the refusal for
 * going without one, the two fields that reported on it and the account
 * state for someone who had yet to set it up.
 */
const GONE = /duo|two-step|passcode|totp|mfa_required|mfaEnrolled|mfaEnforced|needs_mfa/i;

/**
 * How Firebase names a second factor in its own API. Whatever touches one
 * goes through these names, so every line that has them is listed below.
 */
const FIREBASE_SECOND_FACTOR = /multi_?factor|enrolledFactors/i;

/**
 * The one file that may touch a second factor, and the one thing it may do to
 * it, with how many times: take it off an account that had one attached
 * through Firebase directly. Once when a temporary password is issued, and
 * once when a sign-in address that was moved is put back. A line there may
 * also look at whether an account has one. Anything else, anywhere, fails.
 */
const ALLOWED_FILE = "src/lib/portal/server/admin-pledges-service.ts";
const TAKES_IT_OFF = "multiFactor: { enrolledFactors: null }";
const ALLOWED_REMOVALS = 2;
/** Reading how many an account has, and nothing else about them. */
const ONLY_LOOKS = /^const \w+ = \(record\?\.multiFactor\?\.enrolledFactors\.length \?\? 0\) > 0;$/;

interface Found {
  file: string;
  line: number;
  text: string;
}

function linesWith(pattern: RegExp): Found[] {
  return SOURCES.flatMap(({ file, lines }) =>
    lines.flatMap((text, index) => (pattern.test(text) ? [{ file, line: index + 1, text: text.trim() }] : [])),
  );
}

const located = (found: Found[]): string[] => found.map((hit) => `${hit.file}:${hit.line} ${hit.text}`);

describe("nothing is left of two-step verification in the source", () => {
  it("looks through every file under src/ that is not a test or a picture", () => {
    expect(FILES.length).toBeGreaterThan(300);
    expect(SOURCES.length).toBeGreaterThan(150);
    expect(SOURCES.some((source) => IS_TEST.test(source.file))).toBe(false);
    // What it leaves unread is pictures. Anything else is read, whatever kind of file it is.
    const unread = new Set(FILES.filter((file) => NOT_TEXT.test(file)).map((file) => path.extname(file).toLowerCase()));
    expect([...unread].sort()).toEqual(expect.arrayContaining([".jpg", ".png"]));
    for (const kind of [".ts", ".tsx", ".css", ".mdx"]) expect(SOURCES.some((source) => source.file.endsWith(kind)), kind).toBe(true);
    // Among what it reads are the places the second step used to live.
    for (const file of [
      "src/lib/portal/server/gate.ts",
      "src/lib/portal/server/http.ts",
      "src/lib/portal/server/admin-pledges-service.ts",
      "src/lib/portal/server/admin-actives-service.ts",
      "src/lib/portal/auth-errors.ts",
      "src/lib/portal/client/api.ts",
      "src/lib/portal/constants.ts",
      "src/lib/portal/types.ts",
      "src/lib/portal/guide.ts",
      "src/components/PortalAuthComponents/login-flow.tsx",
      "src/app/api/portal/me/route.ts",
    ]) {
      expect(SOURCES.map((source) => source.file), file).toContain(file);
    }
  });

  it("can find what it is looking for, in any letter case", () => {
    const gone = [
      "Check Duo Mobile and enter the current 6-digit code.",
      "open DUO on your phone",
      "Two-step verification is required.",
      "TWO-STEP",
      "That passcode didn't match.",
      "PasscodeForm",
      'export const TOTP_ISSUER = "SEP at UCI";',
      "TotpMultiFactorGenerator",
      'return deny("mfa_required", message);',
      "MFA_REQUIRED",
      "mfaEnrolled: boolean;",
      "mfaenrolled",
      "mfaEnforced: false,",
      'export type AccountState = "invited" | "needs_mfa" | "active" | "disabled";',
    ];
    for (const text of gone) expect(GONE.test(text), text).toBe(true);
    // The lines that take a second factor off an account have none of those words in them, and
    // neither does what the sign-in page is told by Firebase about an account that has one.
    const fine = [`${TAKES_IT_OFF},`, 'authErrorCode(caught) === "auth/multi-factor-auth-required"', "Sign-in is your UCI email and your password.", "two steps", "pass a code"];
    for (const text of fine) expect(GONE.test(text), text).toBe(false);

    for (const text of [`${TAKES_IT_OFF},`, "record.multiFactor?.enrolledFactors.length", "getMultiFactorResolver(auth, error)", "TotpMultiFactorGenerator", "multi_factor"]) {
      expect(FIREBASE_SECOND_FACTOR.test(text), text).toBe(true);
    }
    for (const text of ['"auth/multi-factor-auth-required"', "a second factor", "factorial"]) expect(FIREBASE_SECOND_FACTOR.test(text), text).toBe(false);

    // A line that only looks, and lines that would do more than look.
    expect(ONLY_LOOKS.test("const hasAuthenticator = (record?.multiFactor?.enrolledFactors.length ?? 0) > 0;")).toBe(true);
    for (const text of [
      "const mfaEnrolled = (record?.multiFactor?.enrolledFactors.length ?? 0) > 0; row.enrolled = mfaEnrolled;",
      "await admin.auth.updateUser(uid, { multiFactor: { enrolledFactors: [factor] } });",
      "const factors = record.multiFactor.enrolledFactors;",
    ]) {
      expect(ONLY_LOOKS.test(text), text).toBe(false);
    }
  });

  it("names Duo, two-step verification, a passcode or TOTP nowhere, and none of the fields and codes that went with them", () => {
    expect(located(linesWith(GONE))).toEqual([]);
  });

  it("has no file named for any of it either", () => {
    expect(FILES.filter((file) => GONE.test(file) || /reset-mfa|enroll|\bmfa\b|qr-?code/i.test(file))).toEqual([]);
    for (const removed of [
      "src/components/PortalAuthComponents/enroll-steps.tsx",
      "src/components/PortalAuthComponents/passcode-form.tsx",
      "src/app/api/portal/admin/pledges/[uid]/reset-mfa",
      "src/app/api/portal/admin/actives/[uid]/reset-mfa",
    ]) {
      expect(existsSync(fromRepo(removed)), removed).toBe(false);
    }
  });

  it("touches a second factor in one file only, and only to take one off an account, in two places", () => {
    const hits = linesWith(FIREBASE_SECOND_FACTOR);
    // Nowhere but the one server file: no page, no route, no other service.
    expect(located(hits.filter((hit) => hit.file !== ALLOWED_FILE))).toEqual([]);

    const removals = hits.filter((hit) => hit.text.includes(TAKES_IT_OFF));
    expect(located(removals)).toHaveLength(ALLOWED_REMOVALS);
    // Every other line there only looks at whether the account has one.
    const others = hits.filter((hit) => !hit.text.includes(TAKES_IT_OFF));
    expect(located(others.filter((hit) => !ONLY_LOOKS.test(hit.text)))).toEqual([]);
    // And nothing puts one on: the only thing `enrolledFactors` is ever set to is null.
    expect(located(linesWith(/enrolledFactors\s*:(?!\s*null\b)/))).toEqual([]);

    // The allowed text is not among the words that are gone, so it is no way round the search for those.
    expect(GONE.test(TAKES_IT_OFF)).toBe(false);
    expect(GONE.test(ALLOWED_FILE)).toBe(false);
  });

  // The page that set the second step up drew a QR code with a package of its own.
  it("draws no QR code: the package for one is not a dependency, and nothing imports it", () => {
    const manifest = JSON.parse(readFileSync(fromRepo("package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
    const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies });
    expect(dependencies.length).toBeGreaterThan(20);
    expect(dependencies.filter((name) => /qr/i.test(name))).toEqual([]);
    expect(located(linesWith(/qrcode|qr-code/i))).toEqual([]);
  });

  // Run against the real project by hand, so it is read here and not run. Left on, any
  // signed-in account could attach an authenticator the portal has no screen to ask about.
  it("has the setup script switch multi-factor sign-in off for the project, and never on", () => {
    const script = readFileSync(fromRepo("scripts", "portal", "setup-project.mjs"), "utf8");
    const states = [...script.matchAll(/multiFactorConfig:\s*\{\s*state:\s*"([A-Z]+)"/g)].map((match) => match[1]);
    expect(states).toEqual(["DISABLED"]);
    expect(script).not.toMatch(/"ENABLED"|"MANDATORY"/);
    expect(GONE.test(script)).toBe(false);
  });
});
