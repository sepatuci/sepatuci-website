/**
 * An account on a temporary password, from the moment an admin makes one to
 * the person's own password and their welcome. A pledge and an active are each
 * taken through all of it, through the routes and nothing else: created with a
 * temporary password, signed in with it, refused everything but choosing a
 * password, refused every poor choice, let in with a good one, and welcomed.
 * Then the same for an account that already existed and is given a temporary
 * password by an admin, what happens when one runs out or is cancelled by a
 * set-password link, that changing an expired account's password behind the
 * portal's back opens nothing, and last the ways an account can start.
 *
 * Tests run in order from a fresh seed. Every temporary password the file is
 * ever handed is kept, and at the end everything the portal has stored and
 * everything an admin can read is searched for each of them, and for the
 * fingerprints the portal keeps of them.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as createActiveInviteLink } from "@/app/api/portal/admin/actives/[uid]/invite-link/route";
import { PATCH as updateActive } from "@/app/api/portal/admin/actives/[uid]/route";
import { POST as issueActivePassword } from "@/app/api/portal/admin/actives/[uid]/temporary-password/route";
import { GET as listActives, POST as createActive } from "@/app/api/portal/admin/actives/route";
import { GET as getAudit } from "@/app/api/portal/admin/audit/route";
import { POST as createInviteLink } from "@/app/api/portal/admin/pledges/[uid]/invite-link/route";
import { GET as getPledgeDetail, PATCH as updatePledge } from "@/app/api/portal/admin/pledges/[uid]/route";
import { POST as issuePledgePassword } from "@/app/api/portal/admin/pledges/[uid]/temporary-password/route";
import { GET as getOverview, POST as createPledge } from "@/app/api/portal/admin/pledges/route";
import { GET as getDashboard } from "@/app/api/portal/dashboard/route";
import { POST as heartbeat } from "@/app/api/portal/heartbeat/route";
import { GET as getMe } from "@/app/api/portal/me/route";
import { POST as completeOnboarding } from "@/app/api/portal/onboarding/route";
import { POST as choosePassword } from "@/app/api/portal/password/route";
import { GET as getReviewOverview } from "@/app/api/portal/review/overview/route";
import { TIMING } from "@/lib/portal/constants";
import { PASSWORD_MAX_LENGTH, TEMPORARY_REUSED, looksTemporary, passwordProblem } from "@/lib/portal/password";
import { resetRateLimits } from "@/lib/portal/server/rate-limit";
import { matchesIssued, type StoredTemporaryPassword } from "@/lib/portal/server/temporary-password";
import type { AccountState, ActivesDto, AdminOverviewDto, DashboardDto, InviteLinkDto, MeDto, PledgeDetailDto, TemporaryPasswordDto } from "@/lib/portal/types";
import {
  ADMIN_ONE,
  ADMIN_TWO,
  AVERY,
  A_KEPT_FINGERPRINT,
  CASEY,
  DANA,
  DEMO_PASSWORD,
  HANDS_OUT_A_TEMPORARY_PASSWORD,
  MARCUS,
  MAYA,
  OWN_PASSWORD,
  PRIYA,
  RILEY,
  SAM,
  SEEDED_ACCOUNTS,
  SEED_TIMEOUT_MS,
  SLOW_TEST_MS,
  TEAM_ATLAS,
  TEMPORARY_PASSWORD,
  TEMPORARY_PASSWORD_MS,
  acceptTokensFrom,
  attachSecondFactor,
  call,
  changeOwnPassword,
  claimsOf,
  countAll,
  countWhere,
  createAccount,
  detachSecondFactors,
  discoverRoutes,
  docData,
  docExists,
  dumpPortal,
  everyStoredFingerprint,
  expectIssuedBetween,
  fieldCodes,
  fingerprintLeak,
  issueTemporaryPasswordAgo,
  ok,
  redeemResetCode,
  refused,
  renewed,
  secondFactorsOf,
  seedPortal,
  setPasswordByResetLink,
  signIn,
  signInEarlyInASecond,
  signInFailure,
  signInStopsAtSecondFactor,
  sleep,
  storedAudit,
  storedClaims,
  storedFingerprint,
  temporaryClaims,
  testAuth,
  uidOf,
  withClaims,
  type AnyHandler,
  type ApiResult,
  type Session,
} from "./helpers";

type Dump = Awaited<ReturnType<typeof dumpPortal>>;
type MemberKind = "pledge" | "active";

const ROUTES = await discoverRoutes();
const CHOOSE_PASSWORD = "POST /password";
/** Every handler a sign-in is judged on: all but the one for redeeming a preview link, which needs none. */
const SIGNED_IN_ROUTES = ROUTES.filter((route) => route.need !== "public");
/** Every handler the portal has, apart from the one for choosing a password and the one that needs no sign-in. */
const OTHER_ROUTES = SIGNED_IN_ROUTES.filter((route) => route.label !== CHOOSE_PASSWORD);

const CHANGE_REQUIRED = "Choose your own password to continue.";
/** There is no "Forgot password?" to point to any more: a password that needs changing is changed by a link from an admin. */
const NOT_REQUIRED = "This account already has its own password. Ask an active or an admin if it needs changing.";
const EXPIRED = "That temporary password has expired. Ask an admin for a new one.";
const TOO_SHORT = "Use at least 10 characters.";
const TOO_LONG = "Use no more than 128 characters.";
const PERSONAL = "Leave your name and email out of your password.";
const EASY = "That password is too easy to guess. Try a few unrelated words.";
const TEMPORARY = "Choose your own password, not the temporary one.";
const NO_SUCH_ACCOUNT = "That account doesn't exist.";
const UNSAFE_NAME = "A name can't start with a symbol.";
const LEFT_OVER = "A sign-in account with that email exists without a portal profile. Delete it in the Firebase console under Authentication, then add them again.";
const WRONG_PASSWORD = /INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS/;
const INVITE_LINK = /^http:\/\/localhost\/login\/reset\?mode=resetPassword&oobCode=[^&\s]+$/;
const WELCOME_LINK = /^http:\/\/localhost\/login\/reset\?mode=resetPassword&oobCode=[^&\s]+&welcome=1$/;
const PROFILE_KEYS = ["activity", "createdAt", "createdBy", "displayName", "email", "onboardedAt", "pledgeClass", "role", "status", "submitted", "teamId", "updatedAt"];
/** A profile also keeps a fingerprint of the temporary password, for as long as the account is on one. */
const PROFILE_KEYS_ON_TEMPORARY = [...PROFILE_KEYS, "temporaryPassword"].sort();
/** A salt and a hash of the password, and nothing else. */
const A_FINGERPRINT = A_KEPT_FINGERPRINT;

/** The part of an admin's row that a pledge's and an active's have in common. */
interface MemberRow {
  uid: string;
  email: string;
  displayName: string;
  status: string;
  signInBlocked: boolean;
  accountState: AccountState;
  lastSignInAt: string | null;
}

/** What differs between the two kinds of account an admin can make. */
interface Kind {
  role: MemberKind;
  email: string;
  displayName: string;
  /** Parts of their own name and address, which a password of theirs may not contain. */
  ownWords: [string, string];
  create: AnyHandler;
  issue: AnyHandler;
  /** The same route for the other kind of account. */
  issueAsTheOtherKind: AnyHandler;
  /** "Get password link" for this kind of account. */
  link: AnyHandler;
  /** Renaming, disabling and so on, for this kind of account. */
  update: AnyHandler;
  createdSummary: string;
  /** A read that is theirs once they are in. */
  ownRead: AnyHandler;
  /** Routes of the other roles, which stay closed to them afterwards. */
  notTheirs: AnyHandler[];
}

const asAny = (handler: unknown): AnyHandler => handler as AnyHandler;

const KINDS: Kind[] = [
  {
    role: "pledge",
    email: "rowan.ellis@uci.edu",
    displayName: "Rowan Ellis",
    ownWords: ["rowan", "ELLIS"],
    create: asAny(createPledge),
    issue: asAny(issuePledgePassword),
    issueAsTheOtherKind: asAny(issueActivePassword),
    link: asAny(createInviteLink),
    update: asAny(updatePledge),
    createdSummary: "Created account for rowan.ellis@uci.edu, starting on a temporary password",
    ownRead: asAny(getDashboard),
    notTheirs: [asAny(getOverview), asAny(getReviewOverview)],
  },
  {
    role: "active",
    email: "tessa.morgan@uci.edu",
    displayName: "Tessa Morgan",
    ownWords: ["tessa", "MORGAN"],
    create: asAny(createActive),
    issue: asAny(issueActivePassword),
    issueAsTheOtherKind: asAny(issuePledgePassword),
    link: asAny(createActiveInviteLink),
    update: asAny(updateActive),
    createdSummary: "Created an active's account for tessa.morgan@uci.edu, starting on a temporary password",
    ownRead: asAny(getReviewOverview),
    notTheirs: [asAny(getOverview), asAny(getDashboard)],
  },
];
const kindOf = (role: MemberKind): Kind => (role === "pledge" ? KINDS[0] : KINDS[1]);

/** Every temporary password this file was ever handed, to be searched for at the end. */
const handedOut: string[] = [];
const keep = (password: string): string => {
  handedOut.push(password);
  return password;
};

let admin: Session;
let adminTwo: Session;
let sam: Session;
let priya: Session;

const asAdmin = (handler: AnyHandler, params: Record<string, string>, body?: unknown): Promise<ApiResult> =>
  call(handler, params, { method: "POST", token: admin.token, body });
const choose = (session: Session, body: unknown): Promise<ApiResult> => call(choosePassword, {}, { method: "POST", token: session.token, body });
const finishWelcome = (session: Session): Promise<ApiResult> => call(completeOnboarding, {}, { method: "POST", token: session.token });
const me = async (session: Session): Promise<MeDto> => ok<MeDto>(await call(getMe, {}, { token: session.token }));

/** An account's row on the admin's page for its kind. */
async function rowOf(role: MemberKind, uid: string): Promise<MemberRow> {
  const rows: MemberRow[] =
    role === "pledge"
      ? ok<AdminOverviewDto>(await call(getOverview, {}, { token: admin.token })).pledges
      : ok<ActivesDto>(await call(listActives, {}, { token: admin.token })).actives;
  const row = rows.find((candidate) => candidate.uid === uid);
  if (!row) throw new Error(`No ${role} row for ${uid}.`);
  return row;
}

interface Created {
  keys: string[];
  row: MemberRow;
  inviteLink: string | null;
  temporaryPassword: string | null;
}

/** A create result, read the same way whichever kind of account it made. */
function created(result: ApiResult, role: MemberKind): Created {
  const body = ok<Record<string, unknown>>(result);
  return {
    keys: Object.keys(body).sort(),
    row: body[role] as MemberRow,
    inviteLink: body.inviteLink as string | null,
    temporaryPassword: body.temporaryPassword as string | null,
  };
}

/** Asks an admin route for a temporary password for an account, and keeps what comes back. */
async function issueFor(role: MemberKind, uid: string): Promise<string> {
  const result = await asAdmin(kindOf(role).issue, { uid });
  const body = ok<TemporaryPasswordDto>(result);
  expect(Object.keys(body)).toEqual(["temporaryPassword"]);
  expect(body.temporaryPassword).toMatch(TEMPORARY_PASSWORD);
  return keep(body.temporaryPassword);
}

/** An account as the dump has it, without the three things a change of password moves. */
function settled(dump: Dump, uid: string): Record<string, unknown> {
  const account = dump.accounts[uid] as Record<string, unknown>;
  return { ...account, claims: null, passwordHash: null, tokensValidAfter: null };
}

const others = (dump: Dump, uid: string): Dump["accounts"] => Object.fromEntries(Object.entries(dump.accounts).filter(([account]) => account !== uid));
const withoutAudit = (dump: Dump): Dump["firestore"] => Object.fromEntries(Object.entries(dump.firestore).filter(([path]) => !path.startsWith("auditLog/")));
const auditFor = async (uid: string) => (await storedAudit()).filter((entry) => entry.targetId === uid);

/** Every document as dumped, with the fingerprint taken off one account's profile: the one thing a change of temporary password moves there. */
function withoutFingerprint(documents: Dump["firestore"], uid: string): Dump["firestore"] {
  const path = `users/${uid}`;
  const profile = documents[path];
  if (typeof profile !== "object" || profile === null || Array.isArray(profile)) throw new Error(`No profile for ${uid} in the dump.`);
  return { ...documents, [path]: Object.fromEntries(Object.entries(profile).filter(([key]) => key !== "temporaryPassword")) };
}

/** The fingerprint a profile keeps, typed for checking against a password. */
async function keptFor(uid: string): Promise<StoredTemporaryPassword | null> {
  const kept = await storedFingerprint(uid);
  return kept === null ? null : { salt: String(kept.salt), hash: String(kept.hash) };
}

/** A fresh account on a temporary password that ran out a minute ago, with nothing else done to it. */
async function startOnExpired(role: MemberKind, email: string, displayName: string): Promise<{ uid: string; temporary: string }> {
  const started = await startOnTemporary(role, email, displayName);
  await issueTemporaryPasswordAgo(started.uid, TEMPORARY_PASSWORD_MS + 60_000);
  return started;
}

/** Every way of writing a temporary password again that the portal has to see through. */
function rewritten(temporary: string): Array<[string, string]> {
  const plain = temporary.replace(/-/g, "");
  return [
    ["with its dashes taken out", plain],
    ["with its dashes taken out, in lower case", plain.toLowerCase()],
    ["with spaces for dashes", temporary.replace(/-/g, " ")],
    ["with spaces for dashes, in lower case", temporary.replace(/-/g, " ").toLowerCase()],
    ["with a character added before it", `x${temporary}`],
    ["with a character added after it", `${temporary}!`],
    ["with words added before it", `kite and ${temporary}`],
    ["with words added after it", `${temporary.toLowerCase()} and a kite`],
    ["with something added on both sides", `my-${temporary}-kite`],
    ["with a dash after every character", [...plain].join("-")],
  ];
}

/** A fresh account of one kind on a temporary password, made through the admin's own route. */
async function startOnTemporary(role: MemberKind, email: string, displayName: string): Promise<{ uid: string; temporary: string }> {
  const made = created(await asAdmin(kindOf(role).create, {}, { email, displayName, start: "temporary_password" }), role);
  return { uid: made.row.uid, temporary: keep(made.temporaryPassword ?? "") };
}

beforeAll(async () => {
  await seedPortal();
  [admin, adminTwo, sam, priya] = await Promise.all([ADMIN_ONE, ADMIN_TWO, SAM, PRIYA].map((email) => signIn(email)));
}, SEED_TIMEOUT_MS);

beforeEach(() => {
  resetRateLimits();
});

describe("the routes", () => {
  it("include one for choosing a password, open to every role, and one for each kind of account for an admin to issue one", () => {
    const labels = ROUTES.map((route) => `${route.label} (${route.need})`);
    for (const expected of [
      "POST /password (any)",
      "POST /onboarding (any)",
      "POST /admin/pledges/[uid]/temporary-password (admin)",
      "POST /admin/actives/[uid]/temporary-password (admin)",
    ]) {
      expect(labels).toContain(expected);
    }
    expect(SIGNED_IN_ROUTES).toHaveLength(ROUTES.length - 1);
    expect(OTHER_ROUTES).toHaveLength(SIGNED_IN_ROUTES.length - 1);
    expect(OTHER_ROUTES.length).toBeGreaterThanOrEqual(44);
    // Each of them a handler of its own: every method of every path.
    expect(new Set(OTHER_ROUTES.map((route) => route.label)).size).toBe(OTHER_ROUTES.length);
    expect(new Set(OTHER_ROUTES.map((route) => route.method))).toEqual(new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]));
  });
});

describe.each(KINDS)("$role: an account that starts on a temporary password", (kind) => {
  const { role, email, displayName } = kind;
  let uid = "";
  let temporary = "";
  /** The first sign-in, with the temporary password. */
  let first: Session;
  /** A sign-in with the password they chose. */
  let own: Session;
  let before: Dump;
  /** This clock just before and just after the account was made, to compare with the time put on it. */
  let createdFrom = 0;
  let createdBy = 0;

  describe("being created", () => {
    it("is created by an admin who asks for a temporary password, and comes back with one and no link", async () => {
      const usersBefore = await countAll("users");
      createdFrom = Date.now();
      const result = await asAdmin(kind.create, {}, { email: `  ${email.toUpperCase()} `, displayName: `  ${displayName} `, start: "temporary_password" });
      createdBy = Date.now();
      const made = created(result, role);
      expect(made.keys).toEqual([role, "inviteLink", "temporaryPassword"].sort());
      expect(made.inviteLink).toBeNull();
      expect(made.temporaryPassword).toMatch(TEMPORARY_PASSWORD);
      temporary = keep(made.temporaryPassword ?? "");
      expect(looksTemporary(temporary)).toBe(true);

      uid = made.row.uid;
      expect(made.row).toMatchObject({
        email,
        displayName,
        status: "active",
        signInBlocked: false,
        accountState: "invited",
        lastSignInAt: null,
      });
      expect(made.row).not.toHaveProperty("mfaEnrolled");
      // The password is in the response once, as its own field, and nowhere else in it.
      expect(result.text.split(temporary)).toHaveLength(2);
      expect(result.text).not.toMatch(/passwordHash|"salt"|"hash"|customClaims|oobCode|"tempAt"|"tempNew"|"temp"/);
      // Nothing of the fingerprint kept of it is sent: the one `temporaryPassword` in the response is the password.
      for (const kept of await everyStoredFingerprint()) expect(result.text).not.toContain(kept);
      expect(result.text.split("temporaryPassword")).toHaveLength(2);
      expect(await countAll("users")).toBe(usersBefore + 1);
    });

    it("has a sign-in account with that password, a verified address, and claims that say the password is temporary", async () => {
      const record = await testAuth().getUser(uid);
      expect(record.email).toBe(email);
      expect(record.displayName).toBe(displayName);
      expect(record.emailVerified).toBe(true);
      expect(record.disabled).toBe(false);
      expect(record.passwordHash).toBeDefined();
      // The flag, when the password was issued, and that the account is new. Nothing else.
      expect(record.customClaims).toEqual(temporaryClaims(role, email, true));
      expect(Object.keys(record.customClaims ?? {}).sort()).toEqual(["issued", "role", "temp", "tempAt", "tempNew"]);
      expect(record.multiFactor?.enrolledFactors ?? []).toEqual([]);
    });

    it("says when the password was issued: the moment of the request, in whole seconds", async () => {
      const claims = await storedClaims(uid);
      expectIssuedBetween(claims, createdFrom, createdBy);
      // Three days from then, to the second, is when it stops working.
      expect(TIMING.temporaryPasswordMs).toBe(TEMPORARY_PASSWORD_MS);
      expect(Number(claims?.tempAt) * 1000 + TIMING.temporaryPasswordMs).toBeGreaterThan(Date.now() + TEMPORARY_PASSWORD_MS - 60_000);
    });

    it("has a profile like any other member's, with a fingerprint of the password and not the password", async () => {
      const profile = await docData(`users/${uid}`);
      expect(profile).toMatchObject({
        email,
        displayName,
        role,
        status: "active",
        pledgeClass: null,
        teamId: null,
        onboardedAt: null,
        createdBy: admin.uid,
        submitted: {},
        activity: { firstSeenAt: null, lastSeenAt: null, totalActiveSeconds: 0, sessionCount: 0, current: null },
      });
      expect(Object.keys(profile ?? {}).sort()).toEqual(PROFILE_KEYS_ON_TEMPORARY);
      // A salt and a hash, and nothing else: nothing is kept of how Firebase stores the account's own password.
      expect(profile?.temporaryPassword).toEqual(A_FINGERPRINT);
      expect(Object.keys((profile?.temporaryPassword ?? {}) as object).sort()).toEqual(["hash", "salt"]);
      // It is of the password that was handed out, and of no other.
      const kept = await keptFor(uid);
      expect(matchesIssued(temporary, kept)).toBe(true);
      expect(matchesIssued("K7QM-2XRT-9BHD", kept)).toBe(false);
      // The password itself is not in the profile, however it is written.
      const stored = JSON.stringify(profile).toUpperCase();
      expect(stored).not.toContain(temporary);
      expect(stored).not.toContain(temporary.replace(/-/g, ""));
    });

    it("is recorded in the audit log, which says how the account starts and not what the password is", async () => {
      const entries = await auditFor(uid);
      expect(entries).toEqual([
        expect.objectContaining({
          action: `${role}.create`,
          actorUid: admin.uid,
          actorEmail: ADMIN_ONE,
          targetType: "user",
          targetId: uid,
          summary: kind.createdSummary,
        }),
      ]);
      expect(JSON.stringify(entries)).not.toContain(temporary);
    });

    it("is shown to admins as invited", async () => {
      expect(await rowOf(role, uid)).toMatchObject({ email, accountState: "invited", status: "active", lastSignInAt: null });
    });
  });

  describe("signing in with the temporary password", () => {
    it("works, and the token says the password is temporary", async () => {
      first = await signIn(email, temporary);
      expect(first.uid).toBe(uid);
      // What the sign-in page reads: the flag, and that this is a new member to greet.
      expect(claimsOf(first.token)).toMatchObject({ role, issued: email, temp: true, tempNew: true, email, email_verified: true });
      expectIssuedBetween(claimsOf(first.token), createdFrom, createdBy);
      // It is the password as handed out, to the letter.
      expect(await signInFailure(email, temporary.toLowerCase())).toMatch(WRONG_PASSWORD);
      expect(await signInFailure(email, DEMO_PASSWORD)).toMatch(WRONG_PASSWORD);
    });

    it("takes stock of everything stored, before any of the calls that should be refused", async () => {
      before = await dumpPortal();
      expect(Object.keys(before.firestore).length).toBeGreaterThanOrEqual(50);
      expect(before.accounts[uid]).toMatchObject({ email, claims: { role, issued: email, temp: true }, disabled: false });
    });

    it.each(OTHER_ROUTES)("$label refuses them: the password has to be replaced first", async (route) => {
      const attempts = [
        // As the page would call it, with a placeholder for each id.
        await call(route.handler, route.params, { method: route.method, token: first.token }),
        // And aimed at things that exist, their own account among them, with a body a route would act on.
        await call(
          route.handler,
          Object.fromEntries(Object.keys(route.params).map((name) => [name, name === "formId" ? "week2interviews" : name === "uid" ? uid : name === "teamId" ? TEAM_ATLAS : "abc123"])),
          {
            method: route.method,
            token: first.token,
            query: `?confirm=${encodeURIComponent(email)}&uid=${uid}`,
            body: { displayName: "Changed", status: "disabled", name: "Taken", memberUids: [uid], title: "Planted", answers: {}, password: OWN_PASSWORD, start: "link", email },
          },
        ),
        // Before the body or the ids are looked at.
        await call(route.handler, { formId: "../x", uid: "../x", teamId: "../x", id: "../x" }, { method: route.method, token: first.token, rawBody: "not json" }),
      ];
      for (const result of attempts) {
        const body = refused(result, 403, "password_change_required");
        expect(body.error).toBe(CHANGE_REQUIRED);
        expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
        expect(result.headers.get("cache-control")).toBe("no-store");
      }
    });

    it("changed nothing with any of those: every document and every sign-in account is exactly as it was", async () => {
      const after = await dumpPortal();
      expect(after.accounts).toEqual(before.accounts);
      expect(after.firestore).toEqual(before.firestore);
      // Not a visit, a draft or a welcome of their own, and the sign-in is still good.
      expect(await docData(`users/${uid}`)).toMatchObject({ onboardedAt: null, activity: { firstSeenAt: null, sessionCount: 0 } });
      expect(await docExists(`drafts/week2interviews_${uid}`)).toBe(false);
      expect(await storedClaims(uid)).toEqual(temporaryClaims(role, email, true));
    });

    it("is still shown to admins as invited, having signed in", async () => {
      expect((await rowOf(role, uid)).accountState).toBe("invited");
    });
  });

  describe("choosing a password", () => {
    const refusedPasswords = (): Array<[string, unknown, string]> => [
      ["nine characters", "kite-42-x", TOO_SHORT],
      ["an empty one", "", TOO_SHORT],
      ["one character more than the longest allowed", `${"correct-horse-battery-".repeat(6)}`.slice(0, PASSWORD_MAX_LENGTH + 1), TOO_LONG],
      ["four times the longest allowed", "Kq7#vX2m".repeat(PASSWORD_MAX_LENGTH / 2), TOO_LONG],
      ["their own first name", `${kind.ownWords[0]}-flies-kites-42`, PERSONAL],
      ["their own last name, in capitals", `kites-for-${kind.ownWords[1]}-42`, PERSONAL],
      ["the whole of their address before the at sign", `x-${email.split("@")[0]}-x-42`, PERSONAL],
      ["a password of 513 characters, which used to be answered as too short", `${"Kq7#vX2m".repeat(64)}x`, TOO_LONG],
      ["a password of several thousand characters", "Kq7#vX2m".repeat(700), TOO_LONG],
      ["a common password", "password1234", EASY],
      ["a common password in capitals", "QWERTYUIOP1", EASY],
      ["a common password written with look-alike symbols", "P@ssw0rd2026", EASY],
      ["the password every demo account has", DEMO_PASSWORD, EASY],
      ["a repeated chunk", "abcabcabcabc", EASY],
      ["two characters taking turns", "x7x7x7x7x7x7", EASY],
      ["every character doubled", "aabbccddee", EASY],
      ["a run of keys", "kites-asdfgh-tea", EASY],
      ["one word and a year", "Welcome2026x", EASY],
      ["one word and a few digits", "sunshine123", EASY],
      ["the programme's own name", "FoundersEducation", EASY],
      ["the temporary password itself", temporary, TEMPORARY],
      ["the temporary password in lower case", temporary.toLowerCase(), TEMPORARY],
      ["the temporary password with spaces around it", `  ${temporary} `, TEMPORARY],
      ["another password of the same shape", "K7QM-2XRT-9BHD", TEMPORARY],
      ["another password of the same shape, in lower case", "w4pn-8gzc-3fjy", TEMPORARY],
    ];

    it("is refused for each of these, with what is wrong said once, under the password field", async () => {
      const cases = refusedPasswords();
      expect(cases).toHaveLength(25);
      for (const [label, password, message] of cases) {
        resetRateLimits();
        const result = await choose(first, { password });
        const body = refused(result, 422, "invalid");
        expect(fieldCodes(body), label).toEqual(["password:weak_password"]);
        expect(body.fields, label).toEqual([{ path: "password", code: "weak_password", message }]);
        expect(Object.keys(result.body as object).sort(), label).toEqual(["code", "error", "fields"]);
        // The refusal never repeats what was sent.
        if (typeof password === "string" && password.length > 0) expect(result.text, label).not.toContain(password);
      }
    });

    // Not written like a temporary password any more, so only the fingerprint on the profile
    // can tell that each of these is the one that was handed out.
    it("is refused for the temporary password however it is rewritten: no dashes, spaces, lower case, or with something added", async () => {
      const cases = rewritten(temporary);
      expect(cases).toHaveLength(10);
      let caughtByTheFingerprintAlone = 0;
      for (const [label, password] of cases) {
        resetRateLimits();
        expect(looksTemporary(password), label).toBe(false);
        // What the rules that need no fingerprint make of it. Twelve letters and digits in a row can,
        // once in a while, also read as a word and a number, and are then refused for that instead.
        const otherwise = passwordProblem(password, { email, displayName, temporary: true });
        if (otherwise === null) caughtByTheFingerprintAlone += 1;
        else expect(label, `${password} was refused as: ${otherwise}`).toMatch(/dashes taken out/);

        const result = await choose(first, { password });
        const body = refused(result, 422, "invalid");
        expect(body.fields, label).toEqual([{ path: "password", code: "weak_password", message: otherwise ?? TEMPORARY }]);
        expect(TEMPORARY_REUSED).toBe(TEMPORARY);
        expect(Object.keys(result.body as object).sort(), label).toEqual(["code", "error", "fields"]);
        // Neither what was sent nor anything of the fingerprint it was checked against comes back.
        expect(result.text, label).not.toContain(password);
        for (const kept of await everyStoredFingerprint()) expect(result.text, label).not.toContain(kept);
      }
      // With anything between or around its groups it can only have been the fingerprint.
      expect(caughtByTheFingerprintAlone).toBeGreaterThanOrEqual(8);
    });

    it("is not refused a password of its own for looking a little like one: the fingerprint is of one password only", async () => {
      const kept = await keptFor(uid);
      expect(kept).not.toBeNull();
      for (const password of [OWN_PASSWORD, "amber-window-thistle-93", "K7QM2XRT9BHD", "another temporary W4PN8GZC3FJY"]) {
        expect(matchesIssued(password, kept), password).toBe(false);
      }
      for (const [label, password] of rewritten(temporary)) expect(matchesIssued(password, kept), label).toBe(true);
    });

    it.each<[string, unknown]>([
      ["no password field", {}],
      ["a password under another name", { newPassword: OWN_PASSWORD, pass: OWN_PASSWORD }],
      ["a number", { password: 12_345_678_901 }],
      ["null", { password: null }],
      ["true", { password: true }],
      ["a list holding a good password", { password: [OWN_PASSWORD] }],
      ["an object holding a good password", { password: { value: OWN_PASSWORD } }],
    ])("is refused for %s, as for no password at all", async (_label, body) => {
      const result = refused(await choose(first, body), 422, "invalid");
      expect(result.fields).toEqual([{ path: "password", code: "weak_password", message: TOO_SHORT }]);
    });

    it.each<[string, string]>([
      ["a list", `["${OWN_PASSWORD}"]`],
      ["a bare string", `"${OWN_PASSWORD}"`],
      ["a number", "1234567890123"],
      ["null", "null"],
    ])("is refused when the body is %s and not an object", async (_label, rawBody) => {
      const result = refused(await call(choosePassword, {}, { method: "POST", token: first.token, rawBody }), 422, "invalid");
      expect(result.fields).toEqual([{ path: "password", code: "weak_password", message: TOO_SHORT }]);
    });

    it("is refused before the password is looked at when the request itself is not acceptable", async () => {
      const good = JSON.stringify({ password: OWN_PASSWORD });
      refused(await call(choosePassword, {}, { method: "POST", token: first.token, rawBody: `{"password": "${OWN_PASSWORD}"` }), 400, "bad_json");
      refused(await call(choosePassword, {}, { method: "POST", token: first.token, rawBody: good, contentType: "text/plain" }), 415, "unsupported_media_type");
      refused(await call(choosePassword, {}, { method: "POST", token: first.token, rawBody: JSON.stringify({ password: OWN_PASSWORD, pad: "x".repeat(20_000) }) }), 413, "too_large");
      refused(await call(choosePassword, {}, { method: "POST", rawBody: good }), 401, "unauthenticated");
      refused(await call(choosePassword, {}, { method: "POST", token: "not.a.token", rawBody: good }), 401, "unauthenticated");
    });

    it("left the account on its temporary password after every one of those", async () => {
      const after = await dumpPortal();
      expect(after.accounts).toEqual(before.accounts);
      expect(after.firestore).toEqual(before.firestore);
      expect((await signIn(email, temporary)).uid).toBe(uid);
      expect(await signInFailure(email, OWN_PASSWORD)).toMatch(WRONG_PASSWORD);
    });

    it(
      "accepts a good password, and changes that account's password, flag and sessions and nothing else",
      async () => {
        // Sessions end to the second, so the first sign-in has to be from an earlier one.
        await sleep(1100);
        const result = await choose(first, {
          password: OWN_PASSWORD,
          // None of this is the caller's to say.
          uid: sam.uid,
          email: SAM,
          role: "admin",
          temp: true,
          claims: { role: "admin" },
          displayName: "Renamed",
        });
        expect(ok(result)).toEqual({ ok: true });
        expect(result.text).not.toContain(OWN_PASSWORD);

        const after = await dumpPortal();
        // Exactly the role and the address the account was issued to: the flag, the time and the greeting are gone, and nothing was added.
        expect(await storedClaims(uid)).toEqual({ role, issued: email });
        expect(after.accounts[uid]).toMatchObject({ claims: { role, issued: email }, email, displayName, disabled: false, secondFactors: 0 });
        expect((after.accounts[uid] as Record<string, unknown>).passwordHash).not.toBe((before.accounts[uid] as Record<string, unknown>).passwordHash);
        expect((after.accounts[uid] as Record<string, unknown>).tokensValidAfter).not.toBe((before.accounts[uid] as Record<string, unknown>).tokensValidAfter);
        expect(settled(after, uid)).toEqual(settled(before, uid));
        // Nobody else's account, Sam's included.
        expect(others(after, uid)).toEqual(others(before, uid));
        // The fingerprint of the temporary password went with it. It was on the profile until now.
        expect(before.firestore[`users/${uid}`]).toHaveProperty("temporaryPassword");
        expect(await storedFingerprint(uid)).toBeNull();
        expect(Object.keys((await docData(`users/${uid}`)) ?? {}).sort()).toEqual(PROFILE_KEYS);
        // That is the one thing that moved in any document: this is not an admin's action, so it is not in the audit log either.
        expect(after.firestore).toEqual(withoutFingerprint(before.firestore, uid));
      },
      SLOW_TEST_MS,
    );

    it("ends the sign-in it was made from, and the temporary password with it", async () => {
      for (const result of [await call(getMe, {}, { token: first.token }), await choose(first, { password: "amber-window-thistle-93" }), await finishWelcome(first)]) {
        expect(refused(result, 401, "session_revoked").error).toBe("Your session has ended. Sign in again.");
      }
      expect(await signInFailure(email, temporary)).toMatch(WRONG_PASSWORD);
      expect(await signInFailure(email, "amber-window-thistle-93")).toMatch(WRONG_PASSWORD);
    });

    it("lets them in with their own password: the portal knows who they are, with the welcome still to do", async () => {
      own = await signIn(email, OWN_PASSWORD);
      expect(own.uid).toBe(uid);
      const claims = claimsOf(own.token);
      expect(claims).toMatchObject({ role, issued: email });
      for (const gone of ["temp", "tempAt", "tempNew"]) expect(gone in claims, gone).toBe(false);

      // With nothing but that password: the sign-in had no second step, and the portal asks for none.
      expect(claims.firebase).toMatchObject({ sign_in_provider: "password" });
      expect(claims.firebase).not.toHaveProperty("sign_in_second_factor");
      const told = await me(own);
      expect(told).toMatchObject({ uid, email, displayName, role, team: null, onboardedAt: null });
      expect(told).not.toHaveProperty("mfaEnforced");
      ok(await call(kind.ownRead, {}, { token: own.token }));
      expect(ok(await call(heartbeat, {}, { method: "POST", token: own.token }))).toEqual({ ok: true });
      // And into nothing that is another role's.
      for (const handler of kind.notTheirs) refused(await call(handler, {}, { token: own.token }), 403, "forbidden");
    });

    it("cannot be done a second time: the account has its own password now, and keeps it", async () => {
      const dump = await dumpPortal();
      for (const body of [{ password: "amber-window-thistle-93" }, { password: OWN_PASSWORD }, { password: temporary }, {}]) {
        const result = await choose(own, body);
        expect(refused(result, 409, "not_required").error).toBe(NOT_REQUIRED);
        expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
      }
      const after = await dumpPortal();
      expect(after.accounts).toEqual(dump.accounts);
      expect(after.firestore).toEqual(dump.firestore);
      expect((await signIn(email, OWN_PASSWORD)).uid).toBe(uid);
      expect(await signInFailure(email, "amber-window-thistle-93")).toMatch(WRONG_PASSWORD);
    });
  });

  describe("the welcome", () => {
    let finishedAt = "";

    it("is recorded with the server's time the first time they finish it", async () => {
      const profileBefore = await docData(`users/${uid}`);
      expect(profileBefore).toMatchObject({ onboardedAt: null });

      const result = await finishWelcome(own);
      const body = ok<{ onboardedAt: string }>(result);
      expect(Object.keys(body)).toEqual(["onboardedAt"]);
      finishedAt = body.onboardedAt;
      expect(Math.abs(Date.parse(finishedAt) - Date.now())).toBeLessThan(60_000);

      // Nothing else on their profile moved.
      const profileAfter = await docData(`users/${uid}`);
      expect({ ...profileAfter, onboardedAt: null }).toEqual(profileBefore);
      const stored = profileAfter?.onboardedAt as { toMillis(): number };
      expect(stored.toMillis()).toBe(Date.parse(finishedAt));
      expect((await me(own)).onboardedAt).toBe(finishedAt);
    });

    it("keeps that first time however often it is finished again", async () => {
      const profile = await docData(`users/${uid}`);
      await sleep(50);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect(ok<{ onboardedAt: string }>(await finishWelcome(own))).toEqual({ onboardedAt: finishedAt });
      }
      expect(await docData(`users/${uid}`)).toEqual(profile);
      expect((await me(own)).onboardedAt).toBe(finishedAt);
    });

    it("leaves them shown to admins as set up, and wrote nothing to the audit log", async () => {
      expect(await rowOf(role, uid)).toMatchObject({ accountState: "active", status: "active", signInBlocked: false });
      // Still the one entry, for the account being made.
      expect((await auditFor(uid)).map((entry) => entry.action)).toEqual([`${role}.create`]);
    });
  });
});

describe("the welcome is not for admins", () => {
  it("refuses an admin, and leaves their profile alone", async () => {
    const profiles = [await docData(`users/${admin.uid}`), await docData(`users/${adminTwo.uid}`)];
    for (const session of [admin, adminTwo]) {
      const result = await finishWelcome(session);
      expect(refused(result, 403, "forbidden").error).toBe("You don't have permission to do that.");
      expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
    }
    expect([await docData(`users/${admin.uid}`), await docData(`users/${adminTwo.uid}`)]).toEqual(profiles);
    expect((await me(admin)).onboardedAt).toBeNull();
  });

  it("refuses an account with a role and no profile, pledge or active, without making one", async () => {
    for (const [email, role] of [
      ["welcome.no.profile@uci.edu", "pledge"],
      ["welcome.no.profile.active@uci.edu", "active"],
    ] as const) {
      const session = await createAccount(email, { claims: { role } });
      refused(await finishWelcome(session), 403, "no_profile");
      expect(await docExists(`users/${session.uid}`)).toBe(false);
    }
  });
});

describe("choosing a password, for an account that already has its own", () => {
  it.each<[string, () => Session, string]>([
    ["a pledge of long standing", () => sam, SAM],
    ["an active of long standing", () => priya, PRIYA],
    ["an admin", () => admin, ADMIN_ONE],
  ])("tells %s there is nothing to do, whatever password is sent, and changes nothing", async (_label, session, email) => {
    const before = await dumpPortal();
    for (const body of [{ password: OWN_PASSWORD }, { password: "short" }, { password: "K7QM-2XRT-9BHD" }, {}]) {
      const result = await choose(session(), body);
      expect(refused(result, 409, "not_required").error).toBe(NOT_REQUIRED);
      expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
    }
    const after = await dumpPortal();
    expect(after.accounts).toEqual(before.accounts);
    expect(after.firestore).toEqual(before.firestore);
    // The password they have still works, the one they sent does not, and they are still signed in.
    expect((await signIn(email)).uid).toBe(session().uid);
    expect(await signInFailure(email, OWN_PASSWORD)).toMatch(WRONG_PASSWORD);
    expect((await me(session())).email).toBe(email);
  });

  it("goes by the account and not by the token: a token that still carries the flag gets the same answer", async () => {
    // Rowan chose a password above. A token saying otherwise is refused nothing by the gate, and
    // is still told there is nothing to do, because the account itself is read.
    const rowan = await signIn(KINDS[0].email, OWN_PASSWORD);
    const issuedNow = Math.floor(Date.now() / 1000);
    const stale: Session = { ...rowan, token: withClaims(rowan.token, { temp: true, tempAt: issuedNow }) };
    expect(refused(await choose(stale, { password: "amber-window-thistle-93" }), 409, "not_required").error).toBe(NOT_REQUIRED);
    expect((await signIn(KINDS[0].email, OWN_PASSWORD)).uid).toBe(rowan.uid);
    // That token is refused everything else, as any token with the flag is.
    refused(await call(getMe, {}, { token: stale.token }), 403, "password_change_required");

    // And one that carries the flag with no time, or with one long past, is told the password has expired, there
    // too: the gate says so before the account is read, whatever is sent.
    const before = await dumpPortal();
    for (const tempAt of [undefined, issuedNow - TEMPORARY_PASSWORD_MS / 1000 - 60]) {
      const expired = withClaims(rowan.token, { temp: true, tempAt });
      expect(refused(await call(getMe, {}, { token: expired }), 403, "temporary_password_expired").error).toBe(EXPIRED);
      for (const body of [{ password: "amber-window-thistle-93" }, { password: OWN_PASSWORD }, { password: "short" }, {}]) {
        expect(refused(await choose({ ...rowan, token: expired }, body), 403, "temporary_password_expired").error).toBe(EXPIRED);
      }
    }
    expect(await dumpPortal()).toEqual(before);
    expect((await signIn(KINDS[0].email, OWN_PASSWORD)).uid).toBe(rowan.uid);
    expect(await signInFailure(KINDS[0].email, "amber-window-thistle-93")).toMatch(WRONG_PASSWORD);
    expect(await storedClaims(rowan.uid)).toEqual({ role: "pledge", issued: KINDS[0].email });
  });
});

// Anything over the limit is too long, however far over. A password of 513 characters or
// more used to be treated as no password at all, and the person told it was too short.
describe("a password that is far too long", () => {
  it("is refused as too long, not as too short", async () => {
    const { temporary } = await startOnTemporary("pledge", "long.password@uci.edu", "Long Password");
    const session = await signIn("long.password@uci.edu", temporary);

    const justOver = refused(await choose(session, { password: "Kq7#vX2m".repeat(64).slice(0, PASSWORD_MAX_LENGTH * 4) }), 422, "invalid");
    expect(justOver.fields?.[0].message).toBe(TOO_LONG);
    // One character more than that used to turn the message into the one for a password that is too short.
    for (const length of [PASSWORD_MAX_LENGTH * 4 + 1, 1024, 4096, 15_000]) {
      const farOver = refused(await choose(session, { password: "Kq7#vX2m".repeat(Math.ceil(length / 8)).slice(0, length) }), 422, "invalid");
      expect(farOver.fields, `${length} characters`).toEqual([{ path: "password", code: "weak_password", message: TOO_LONG }]);
    }
    // And it is still the account's temporary password that signs in.
    expect((await signIn("long.password@uci.edu", temporary)).uid).toBe(session.uid);
  });
});

describe.each<[MemberKind, string, AccountState]>([
  ["pledge", MAYA, "active"],
  ["active", PRIYA, "active"],
])("an admin issues a temporary password to a %s who is set up", (role, email, stateBefore) => {
  const kind = kindOf(role);
  let uid = "";
  /** A sign-in with the password they had, from well before the admin asked. */
  let earlier: Session;
  /** Another, made in the very second the admin asked. */
  let inTheSameSecond: Awaited<ReturnType<typeof signInEarlyInASecond>>;
  let temporary = "";
  let before: Dump;
  let onTemporary: Session;
  let issuedFrom = 0;
  let issuedBy = 0;

  it(
    "gives back a new temporary password and nothing else, and that password signs in straight away",
    async () => {
      uid = await uidOf(email);
      expect((await rowOf(role, uid)).accountState).toBe(stateBefore);
      earlier = await signIn(email);
      expect((await me(earlier)).email).toBe(email);
      before = await dumpPortal();
      expect(before.firestore[`users/${uid}`]).not.toHaveProperty("temporaryPassword");

      // No waiting for the clock to move on: the next sign-in and the request fall in the same second.
      inTheSameSecond = await signInEarlyInASecond(email);
      issuedFrom = Date.now();
      temporary = await issueFor(role, uid);
      issuedBy = Date.now();
      expect(looksTemporary(temporary)).toBe(true);

      // Nor any waiting afterwards: the password just handed out signs in, and the portal honours the sign-in.
      onTemporary = await signIn(email, temporary);
      expect(refused(await call(getMe, {}, { token: onTemporary.token }), 403, "password_change_required").error).toBe(CHANGE_REQUIRED);
      const weak = refused(await choose(onTemporary, { password: "short" }), 422, "invalid");
      expect(weak.fields).toEqual([{ path: "password", code: "weak_password", message: TOO_SHORT }]);
    },
    SLOW_TEST_MS,
  );

  it("puts the flag on the account, changes its password and ends its sessions, and touches nothing else of theirs or anyone's", async () => {
    const after = await dumpPortal();
    // They were welcomed long ago, so the next sign-in is not greeted as a new member's: the flag and the time, and no more.
    const claims = await storedClaims(uid);
    expect(claims).toEqual(temporaryClaims(role, email, false));
    expect(claims).not.toHaveProperty("tempNew");
    expectIssuedBetween(claims, issuedFrom, issuedBy);
    expect((after.accounts[uid] as Record<string, unknown>).passwordHash).not.toBe((before.accounts[uid] as Record<string, unknown>).passwordHash);
    expect((after.accounts[uid] as Record<string, unknown>).tokensValidAfter).not.toBe((before.accounts[uid] as Record<string, unknown>).tokensValidAfter);
    expect(settled(after, uid)).toEqual(settled(before, uid));
    expect(others(after, uid)).toEqual(others(before, uid));
    // A fingerprint of the new password is on their profile, and is of that password.
    expect((await docData(`users/${uid}`))?.temporaryPassword).toEqual(A_FINGERPRINT);
    expect(matchesIssued(temporary, await keptFor(uid))).toBe(true);
    // The rest of their profile and their work are as they were. The one new document is the audit entry.
    expect(withoutFingerprint(withoutAudit(after), uid)).toEqual(withoutAudit(before));
    expect(Object.keys(after.firestore)).toHaveLength(Object.keys(before.firestore).length + 1);
  });

  // Firebase ends sign-ins by the whole second, so ending them once, as the request arrives,
  // leaves one made in that same second. The portal waits for the next second and ends them again.
  it("ends a sign-in made with the old password in the very second it was asked for", async () => {
    expect(Math.floor(inTheSameSecond.signedInAtMs / 1000)).toBe(Math.floor(issuedFrom / 1000));
    const signedInAt = Number(claimsOf(inTheSameSecond.token).auth_time);
    expect(signedInAt).toBe(Math.floor(issuedFrom / 1000));
    // Sign-ins are now only honoured from a later second than that one.
    const validFrom = Date.parse((await testAuth().getUser(uid)).tokensValidAfterTime ?? "") / 1000;
    expect(validFrom).toBeGreaterThan(signedInAt);
    // Which the request waited for: it took it into the next second, and not much longer than that.
    expect(Math.floor(issuedBy / 1000)).toBeGreaterThan(Math.floor(issuedFrom / 1000));
    expect(issuedBy - issuedFrom).toBeLessThan(5_000);

    for (const result of [
      await call(getMe, {}, { token: inTheSameSecond.token }),
      await call(kind.ownRead, {}, { token: inTheSameSecond.token }),
      await choose(inTheSameSecond, { password: OWN_PASSWORD }),
    ]) {
      expect(refused(result, 401, "session_revoked").error).toBe("Your session has ended. Sign in again.");
    }
    // So nobody chose a password with it: the account is still on the one the admin was handed.
    expect(await storedClaims(uid)).toEqual(temporaryClaims(role, email, false));
    expect(await signInFailure(email, OWN_PASSWORD)).toMatch(WRONG_PASSWORD);
  });

  it("records it in the audit log, without the password", async () => {
    const [entry] = await auditFor(uid);
    expect(entry).toMatchObject({
      action: `${role}.temporary_password`,
      actorUid: admin.uid,
      actorEmail: ADMIN_ONE,
      targetType: "user",
      targetId: uid,
      summary: `Issued a temporary password for ${email}`,
    });
    expect(JSON.stringify(await storedAudit())).not.toContain(temporary);
  });

  it("stops the password they had, and the sign-in they had, from working", async () => {
    expect(await signInFailure(email)).toMatch(WRONG_PASSWORD);
    for (const result of [await call(getMe, {}, { token: earlier.token }), await call(kind.ownRead, {}, { token: earlier.token }), await choose(earlier, { password: OWN_PASSWORD })]) {
      refused(result, 401, "session_revoked");
    }
  });

  it("lets them sign in with the temporary one, to choose a password and nothing else", async () => {
    onTemporary = await signIn(email, temporary);
    expect(claimsOf(onTemporary.token)).toMatchObject({ role, issued: email, temp: true });
    expectIssuedBetween(claimsOf(onTemporary.token), issuedFrom, issuedBy);
    // Someone who has been through their welcome is not greeted as new.
    expect("tempNew" in claimsOf(onTemporary.token)).toBe(false);
    for (const result of [
      await call(getMe, {}, { token: onTemporary.token }),
      await call(kind.ownRead, {}, { token: onTemporary.token }),
      await call(heartbeat, {}, { method: "POST", token: onTemporary.token }),
      await finishWelcome(onTemporary),
    ]) {
      expect(refused(result, 403, "password_change_required").error).toBe(CHANGE_REQUIRED);
    }
  });

  it("shows them to admins as invited until the password is replaced", async () => {
    expect(await rowOf(role, uid)).toMatchObject({ email, accountState: "invited", status: "active", signInBlocked: false });
    if (role === "pledge") {
      const detail = ok<PledgeDetailDto>(await call(getPledgeDetail, { uid }, { token: admin.token }));
      expect(detail.pledge.accountState).toBe("invited");
      // What they have turned in is still theirs, and still counted.
      expect(detail.submissions.map((submission) => submission.formId).sort()).toEqual(["week0onboarding", "week2interviews"]);
    }
  });

  it(
    "issues a different one each time, and the one before stops working at once",
    async () => {
      const first = { password: temporary, kept: await keptFor(uid), claims: await storedClaims(uid) };
      // Signed in on the first temporary password in the very second the second is asked for.
      const lastMoment = await signInEarlyInASecond(email, temporary);
      const from = Date.now();
      const second = await issueFor(role, uid);
      expect(second).not.toBe(temporary);
      expect(await signInFailure(email, temporary)).toMatch(WRONG_PASSWORD);
      // Neither session on the first one can choose a password with it now.
      for (const session of [onTemporary, lastMoment]) {
        refused(await choose(session, { password: OWN_PASSWORD }), 401, "session_revoked");
        refused(await call(getMe, {}, { token: session.token }), 401, "session_revoked");
      }
      expect((await auditFor(uid)).filter((entry) => entry.action === `${role}.temporary_password`)).toHaveLength(2);

      // The three days start again, and the fingerprint is of the new password and no longer of the old.
      const claims = await storedClaims(uid);
      expect(claims).toEqual(temporaryClaims(role, email, false));
      expectIssuedBetween(claims, from, Date.now());
      expect(Number(claims?.tempAt)).toBeGreaterThanOrEqual(Number(first.claims?.tempAt));
      const kept = await keptFor(uid);
      expect(kept).not.toEqual(first.kept);
      expect(matchesIssued(second, kept)).toBe(true);
      expect(matchesIssued(first.password, kept)).toBe(false);
      // It is a fingerprint and no more than one, as the first was: a new salt, a new hash.
      expect(await storedFingerprint(uid)).toEqual(A_FINGERPRINT);

      temporary = second;
      onTemporary = await signIn(email, temporary);
      // So the first one, rewritten, would be a password like any other. The second, rewritten, is not.
      const spaced = second.replace(/-/g, " ");
      expect(refused(await choose(onTemporary, { password: spaced }), 422, "invalid").fields).toEqual([{ path: "password", code: "weak_password", message: TEMPORARY }]);
    },
    SLOW_TEST_MS,
  );

  it(
    "goes back to how it was once they choose their own: set up, with everything they had",
    async () => {
      expect(ok(await choose(onTemporary, { password: OWN_PASSWORD }))).toEqual({ ok: true });
      expect(await storedClaims(uid)).toEqual({ role, issued: email });
      expect(await storedFingerprint(uid)).toBeNull();
      expect((await rowOf(role, uid)).accountState).toBe(stateBefore);

      const back = await signIn(email, OWN_PASSWORD);
      const profile = await me(back);
      expect(profile).toMatchObject({ uid, email, role });
      // They were welcomed long ago, and are not asked again.
      expect(Date.parse(profile.onboardedAt ?? "")).toBeLessThan(Date.now() - 19 * 86_400_000);
      if (role === "pledge") expect(ok<DashboardDto>(await call(getDashboard, {}, { token: back.token })).progress.submitted).toBe(2);
      else ok(await call(getReviewOverview, {}, { token: back.token }));
      // Neither the password they had before nor either temporary one is any use.
      for (const password of [DEMO_PASSWORD, temporary]) expect(await signInFailure(email, password)).toMatch(WRONG_PASSWORD);
      refused(await choose(back, { password: "amber-window-thistle-93" }), 409, "not_required");
      // The sign-in this file keeps for Priya ended with her old password. It is replaced for what follows.
      if (email === PRIYA) priya = back;
    },
    SLOW_TEST_MS,
  );
});

describe("issuing a temporary password to someone who was sent a link and never used it", () => {
  it.each<[MemberKind, string]>([
    ["pledge", CASEY],
    ["active", MARCUS],
  ])("gives a %s who has no password one to start with", async (role, email) => {
    const uid = await uidOf(email);
    expect((await testAuth().getUser(uid)).passwordHash).toBeUndefined();
    expect((await rowOf(role, uid)).accountState).toBe("invited");

    const from = Date.now();
    const temporary = await issueFor(role, uid);
    // They have yet to be welcomed, so the sign-in page is told to greet a new member.
    const claims = await storedClaims(uid);
    expect(claims).toEqual(temporaryClaims(role, email, true));
    expectIssuedBetween(claims, from, Date.now());
    expect(matchesIssued(temporary, await keptFor(uid))).toBe(true);
    expect((await rowOf(role, uid)).accountState).toBe("invited");

    const session = await signIn(email, temporary);
    expect(claimsOf(session.token)).toMatchObject({ temp: true, tempNew: true });
    refused(await call(getMe, {}, { token: session.token }), 403, "password_change_required");
    expect(ok(await choose(session, { password: OWN_PASSWORD }))).toEqual({ ok: true });
    expect(await storedClaims(uid)).toEqual({ role, issued: email });
    expect(await storedFingerprint(uid)).toBeNull();
    expect((await me(await signIn(email, OWN_PASSWORD))).onboardedAt).toBeNull();
  });
});

// The sign-in page greets someone on a temporary password as a new member or as a returning
// one. It goes by a claim, which is set when the password is issued from whether the account
// has finished its welcome: a second temporary password does not make anyone new again.
describe("who a temporary password says is new", () => {
  it.each(KINDS)(
    "$role: new at creation and until the welcome is finished, however many passwords are issued, and never after",
    async (kind) => {
      const email = `greeting.${kind.role}@uci.edu`;
      const { uid, temporary: atCreation } = await startOnTemporary(kind.role, email, "Hollis Varga");
      expect(await storedClaims(uid)).toEqual(temporaryClaims(kind.role, email, true));

      // A second one before they have ever signed in: still new.
      const second = await issueFor(kind.role, uid);
      expect(await storedClaims(uid)).toEqual(temporaryClaims(kind.role, email, true));
      expect(await signInFailure(email, atCreation)).toMatch(WRONG_PASSWORD);

      // They choose a password, and leave before the welcome. A third: still new.
      expect(ok(await choose(await signIn(email, second), { password: OWN_PASSWORD }))).toEqual({ ok: true });
      expect((await docData(`users/${uid}`))?.onboardedAt).toBeNull();
      const third = await issueFor(kind.role, uid);
      expect(await storedClaims(uid)).toEqual(temporaryClaims(kind.role, email, true));
      expect(claimsOf((await signIn(email, third)).token)).toMatchObject({ temp: true, tempNew: true });

      // This time they finish the welcome. A fourth: a returning member, with no such claim at all.
      expect(ok(await choose(await signIn(email, third), { password: OWN_PASSWORD }))).toEqual({ ok: true });
      ok(await finishWelcome(await signIn(email, OWN_PASSWORD)));
      const fourth = await issueFor(kind.role, uid);
      const claims = await storedClaims(uid);
      expect(claims).toEqual(temporaryClaims(kind.role, email, false));
      expect(Object.keys(claims ?? {}).sort()).toEqual(["issued", "role", "temp", "tempAt"]);
      const returning = claimsOf((await signIn(email, fourth)).token);
      expect(returning).toMatchObject({ temp: true });
      expect("tempNew" in returning).toBe(false);
    },
    SLOW_TEST_MS,
  );
});

describe("issuing a temporary password is refused", () => {
  let before: Dump;
  let auditBefore = 0;
  let uids: Record<string, string>;

  it("takes stock first", async () => {
    uids = Object.fromEntries(await Promise.all([RILEY, DANA, AVERY, SAM, PRIYA, MARCUS].map(async (email) => [email, await uidOf(email)] as const)));
    before = await dumpPortal();
    auditBefore = await countAll("auditLog");
    expect(before.accounts[uids[RILEY]]).toMatchObject({ disabled: true });
    expect(before.accounts[uids[DANA]]).toMatchObject({ disabled: true });
  });

  it.each<[MemberKind, string]>([
    ["pledge", RILEY],
    ["active", DANA],
  ])("for a disabled %s, who has to be re-enabled first", async (role, email) => {
    const result = await asAdmin(kindOf(role).issue, { uid: uids[email] });
    expect(refused(result, 409, "account_disabled").error).toBe("Re-enable the account first.");
    expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
    expect(await storedClaims(uids[email])).toEqual({ role, issued: email });
    expect(await signInFailure(email)).toBe("USER_DISABLED");
  });

  it.each<[string, MemberKind, string]>([
    ["a pledge who is set up", "active", AVERY],
    ["a pledge who is disabled", "active", RILEY],
    ["an active who is set up", "pledge", PRIYA],
    ["an active who is disabled", "pledge", DANA],
  ])("for %s, through the route for the other kind: the account is not there", async (_label, routeFor, email) => {
    const result = await asAdmin(kindOf(routeFor).issue, { uid: uids[email] });
    expect(refused(result, 404, "not_found").error).toBe(NO_SUCH_ACCOUNT);
    expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
    expect(result.text).not.toContain(email);
    // Word for word what a uid nobody has gets.
    const unknown = await asAdmin(kindOf(routeFor).issue, { uid: "nobody123" });
    expect(unknown.status).toBe(404);
    expect(result.text).toBe(unknown.text);
  });

  it("for a uid that could not be one", async () => {
    for (const kind of KINDS) {
      for (const uid of ["../users/abc", "", "a".repeat(65), "__name__"]) {
        expect(refused(await asAdmin(kind.issue, { uid }), 404, "not_found").error).toBe("Not found.");
      }
    }
  });

  it("for an admin, on either route, their own account or the other's", async () => {
    for (const kind of KINDS) {
      for (const target of [admin, adminTwo]) {
        const result = await asAdmin(kind.issue, { uid: target.uid });
        expect(refused(result, 403, "cannot_modify_admin").error).toBe("Admin accounts can't be changed here.");
      }
    }
    for (const [session, email] of [
      [admin, ADMIN_ONE],
      [adminTwo, ADMIN_TWO],
    ] as const) {
      expect(await storedClaims(session.uid)).toEqual({ role: "admin" });
      expect((await signIn(email)).uid).toBe(session.uid);
      expect((await me(session)).role).toBe("admin");
    }
  });

  it("when a pledge or an active asks, for themself or for anyone", async () => {
    for (const kind of KINDS) {
      for (const caller of [sam, priya]) {
        for (const target of [caller.uid, uids[AVERY], uids[MARCUS], admin.uid, "nobody123"]) {
          const result = await call(kind.issue, { uid: target }, { method: "POST", token: caller.token, body: {} });
          expect(refused(result, 403, "forbidden").error).toBe("You don't have permission to do that.");
          expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
        }
      }
      refused(await call(kind.issue, { uid: uids[AVERY] }, { method: "POST" }), 401, "unauthenticated");
    }
  });

  it("and none of those requests changed anything, or left a mark in the audit log", async () => {
    const after = await dumpPortal();
    expect(after.accounts).toEqual(before.accounts);
    expect(after.firestore).toEqual(before.firestore);
    expect(await countAll("auditLog")).toBe(auditBefore);
    expect((await signIn(AVERY)).uid).toBe(uids[AVERY]);
    expect((await me(sam)).email).toBe(SAM);
  });
});

// An account can be pointed at another mailbox through Firebase, and can have a second factor
// attached there too. Whoever did either may not be its owner, and the portal signs in with a
// password alone, so a temporary password puts the address back and takes the second factor off.
describe("issuing a temporary password to an account whose sign-in address was moved", () => {
  const ISSUED = "quinn.avila@uci.edu";
  const MOVED = "quinn.avila+elsewhere@uci.edu";
  let uid = "";
  let temporary = "";

  it(
    "puts the address back, removes the second factor, and says so in the audit log",
    async () => {
      const made = created(await asAdmin(kindOf("pledge").create, {}, { email: ISSUED, displayName: "Quinn Avila" }), "pledge");
      uid = made.row.uid;
      const code = new URL(made.inviteLink ?? "").searchParams.get("oobCode") ?? "";
      expect(await redeemResetCode(code, "chosen-by-quinn-first-1")).toBe(true);
      await testAuth().updateUser(uid, { email: MOVED, emailVerified: true });
      await attachSecondFactor(uid);

      temporary = await issueFor("pledge", uid);

      const record = await testAuth().getUser(uid);
      expect(record.email).toBe(ISSUED);
      expect(record.emailVerified).toBe(true);
      expect(record.multiFactor?.enrolledFactors ?? []).toEqual([]);
      // Quinn chose a password by link and never finished the welcome, so is still greeted as new.
      expect(record.customClaims).toEqual(temporaryClaims("pledge", ISSUED, true));
      expect(matchesIssued(temporary, await keptFor(uid))).toBe(true);
      expect((await auditFor(uid))[0]).toMatchObject({
        action: "pledge.temporary_password",
        summary: `Issued a temporary password for ${ISSUED}, and put the sign-in address back`,
      });
    },
    SLOW_TEST_MS,
  );

  it("leaves the address it was moved to with no way in, and the issued one with the temporary password", async () => {
    expect(await signInFailure(MOVED, temporary)).not.toBe("");
    expect(await signInFailure(MOVED, "chosen-by-quinn-first-1")).not.toBe("");
    expect(await signInFailure(ISSUED, "chosen-by-quinn-first-1")).toMatch(WRONG_PASSWORD);

    const session = await signIn(ISSUED, temporary);
    expect(claimsOf(session.token)).toMatchObject({ email: ISSUED, issued: ISSUED, temp: true });
    expect(ok(await choose(session, { password: OWN_PASSWORD }))).toEqual({ ok: true });
    expect((await me(await signIn(ISSUED, OWN_PASSWORD))).email).toBe(ISSUED);
  });

  // The address is where it should be this time. A second factor is taken off all the same: with
  // one on, the right password gets no sign-in, and the portal has no second step to finish one.
  it(
    "takes a second factor off an account whose address was not moved as well, and the password it hands back signs in",
    async () => {
      // Quinn chose this password a moment ago, and signs in with it.
      expect((await signIn(ISSUED, OWN_PASSWORD)).uid).toBe(uid);
      await attachSecondFactor(uid);
      try {
        // The same password now gets a challenge for a second step, and no sign-in.
        expect(await signInStopsAtSecondFactor(ISSUED, OWN_PASSWORD)).toBe(true);
        await expect(signIn(ISSUED, OWN_PASSWORD)).rejects.toThrow(/Could not sign in/);
        expect((await dumpPortal()).accounts[uid]).toMatchObject({ email: ISSUED, secondFactors: 1 });

        const handedBack = await issueFor("pledge", uid);

        const record = await testAuth().getUser(uid);
        expect(record.email).toBe(ISSUED);
        expect(record.multiFactor?.enrolledFactors ?? []).toEqual([]);
        expect(await secondFactorsOf(uid)).toBe(0);
        expect((await dumpPortal()).accounts[uid]).toMatchObject({ email: ISSUED, secondFactors: 0 });
        // The entry is the one any temporary password leaves: the address was not moved, and nothing is said of the factor.
        expect((await auditFor(uid))[0]).toMatchObject({ action: "pledge.temporary_password", summary: `Issued a temporary password for ${ISSUED}` });

        // The password that was handed back signs in, with no second step, as far as choosing a password.
        expect(await signInStopsAtSecondFactor(ISSUED, handedBack)).toBe(false);
        const session = await signIn(ISSUED, handedBack);
        expect(session.uid).toBe(uid);
        const claims = claimsOf(session.token);
        expect(claims).toMatchObject({ email: ISSUED, issued: ISSUED, temp: true, firebase: { sign_in_provider: "password" } });
        expect(claims.firebase).not.toHaveProperty("sign_in_second_factor");
        expect(refused(await call(getMe, {}, { token: session.token }), 403, "password_change_required").error).toBe(CHANGE_REQUIRED);
        // And the one from before the factor was attached is no use to anyone now.
        expect(await signInFailure(ISSUED, OWN_PASSWORD)).toMatch(WRONG_PASSWORD);
        expect(await rowOf("pledge", uid)).toMatchObject({ email: ISSUED, accountState: "invited", signInBlocked: false });
      } finally {
        // So that what follows starts from an account with no second factor, whatever happened above.
        await detachSecondFactors(uid);
      }
    },
    SLOW_TEST_MS,
  );

  // Quinn is on a temporary password again. The portal cannot see an emailed link being used,
  // so the link itself takes the temporary password's place: nobody is left to choose twice.
  it("is not a dead end for someone who is then sent a set-password link instead: the link cancels the temporary password", async () => {
    const outstanding = await issueFor("pledge", uid);
    expect(await storedClaims(uid)).toEqual(temporaryClaims("pledge", ISSUED, true));

    const { inviteLink } = ok<InviteLinkDto>(await asAdmin(asAny(createInviteLink), { uid }));
    expect(await storedClaims(uid)).toEqual({ role: "pledge", issued: ISSUED });
    expect(await storedFingerprint(uid)).toBeNull();
    expect(await signInFailure(ISSUED, outstanding)).toMatch(WRONG_PASSWORD);

    const code = new URL(inviteLink).searchParams.get("oobCode") ?? "";
    expect(await redeemResetCode(code, "chosen-through-the-link-9")).toBe(true);
    const session = await signIn(ISSUED, "chosen-through-the-link-9");
    for (const gone of ["temp", "tempAt", "tempNew"]) expect(gone in claimsOf(session.token), gone).toBe(false);
    // Straight in, with the password chosen through the link, and nothing more to choose.
    expect((await me(session)).email).toBe(ISSUED);
    refused(await choose(session, { password: "amber-window-thistle-93" }), 409, "not_required");
    expect((await signIn(ISSUED, "chosen-through-the-link-9")).uid).toBe(uid);
  });
});

// "Get password link" on an account that is on a temporary password. The link takes the
// temporary password's place: that password stops working, and the account is no longer
// held at choosing one, so whoever follows the link chooses once and is in.
describe.each(KINDS)("$role: a set-password link for an account on a temporary password", (kind) => {
  const { role } = kind;
  const email = `sent.a.link.${role}@uci.edu`;
  const displayName = "Imani Brooks";
  let uid = "";
  let temporary = "";
  /** Signed in with the temporary password well before the link was asked for. */
  let onTemporary: Session;
  let before: Dump;
  let inviteLink = "";

  it(
    "gives back a link and nothing else, as for any account",
    async () => {
      ({ uid, temporary } = await startOnTemporary(role, email, displayName));
      onTemporary = await signIn(email, temporary);
      refused(await call(getMe, {}, { token: onTemporary.token }), 403, "password_change_required");
      before = await dumpPortal();
      expect(before.firestore[`users/${uid}`]).toHaveProperty("temporaryPassword");
      // Sessions end to the second, so that sign-in has to be from an earlier one.
      await sleep(1100);

      const result = await asAdmin(kind.link, { uid });
      const body = ok<InviteLinkDto>(result);
      expect(Object.keys(body)).toEqual(["inviteLink"]);
      // They have not been welcomed, so it is the link that opens with the introduction.
      expect(body.inviteLink).toMatch(WELCOME_LINK);
      inviteLink = body.inviteLink;
      expect(result.text).not.toContain(temporary);
      expect(result.text).not.toMatch(/temporaryPassword|"salt"|"hash"|"temp"/);
    },
    SLOW_TEST_MS,
  );

  it("cancels the temporary password: it no longer signs in, however it is written", async () => {
    for (const password of [temporary, temporary.toLowerCase(), temporary.replace(/-/g, ""), DEMO_PASSWORD, OWN_PASSWORD]) {
      expect(await signInFailure(email, password), password).toMatch(WRONG_PASSWORD);
    }
  });

  it("takes the flag, the time and the greeting off the account, and the fingerprint off the profile, and touches nothing else of theirs or anyone's", async () => {
    const after = await dumpPortal();
    // Exactly the role and the address it was issued to, as on an account that never had a temporary password.
    expect(await storedClaims(uid)).toEqual({ role, issued: email });
    expect(await storedFingerprint(uid)).toBeNull();
    expect(Object.keys((await docData(`users/${uid}`)) ?? {}).sort()).toEqual(PROFILE_KEYS);

    expect((after.accounts[uid] as Record<string, unknown>).passwordHash).not.toBe((before.accounts[uid] as Record<string, unknown>).passwordHash);
    expect((after.accounts[uid] as Record<string, unknown>).tokensValidAfter).not.toBe((before.accounts[uid] as Record<string, unknown>).tokensValidAfter);
    expect(settled(after, uid)).toEqual(settled(before, uid));
    expect(others(after, uid)).toEqual(others(before, uid));
    // The rest of the profile is as it was. The one new document is the audit entry.
    expect(withoutAudit(after)).toEqual(withoutFingerprint(withoutAudit(before), uid));
    expect(Object.keys(after.firestore)).toHaveLength(Object.keys(before.firestore).length + 1);
  });

  it("ends the sign-in that was made with the temporary password", async () => {
    for (const result of [
      await call(getMe, {}, { token: onTemporary.token }),
      await call(kind.ownRead, {}, { token: onTemporary.token }),
      await choose(onTemporary, { password: OWN_PASSWORD }),
    ]) {
      expect(refused(result, 401, "session_revoked").error).toBe("Your session has ended. Sign in again.");
    }
    expect(await signInFailure(email, OWN_PASSWORD)).toMatch(WRONG_PASSWORD);
  });

  it("says in the audit log that the link cancelled a temporary password, without the password or the link", async () => {
    const entries = await auditFor(uid);
    expect(entries.map((entry) => entry.action)).toEqual([`${role}.invite_link`, `${role}.create`]);
    expect(entries[0]).toMatchObject({
      action: `${role}.invite_link`,
      actorUid: admin.uid,
      actorEmail: ADMIN_ONE,
      targetType: "user",
      targetId: uid,
      summary: `Created a set-password link for ${email}, which cancelled their temporary password`,
    });
    const text = JSON.stringify(entries);
    expect(text.toUpperCase()).not.toContain(temporary);
    expect(text).not.toContain(new URL(inviteLink).searchParams.get("oobCode"));
  });

  it("lets whoever follows the link choose a password once, and be in: nothing is asked of them again", async () => {
    const code = new URL(inviteLink).searchParams.get("oobCode") ?? "";
    expect(await redeemResetCode(code, OWN_PASSWORD)).toBe(true);
    const session = await signIn(email, OWN_PASSWORD);
    expect(session.uid).toBe(uid);
    const claims = claimsOf(session.token);
    expect(claims).toMatchObject({ role, issued: email });
    for (const gone of ["temp", "tempAt", "tempNew"]) expect(gone in claims, gone).toBe(false);

    expect(await me(session)).toMatchObject({ uid, email, displayName, role, onboardedAt: null });
    ok(await call(kind.ownRead, {}, { token: session.token }));
    for (const handler of kind.notTheirs) refused(await call(handler, {}, { token: session.token }), 403, "forbidden");
    // There is no temporary password to replace.
    expect(refused(await choose(session, { password: "amber-window-thistle-93" }), 409, "not_required").error).toBe(NOT_REQUIRED);
    ok(await finishWelcome(session));
  });

  // Now the account has its own password, and a link is what it always was.
  it(
    "leaves an account that is not on a temporary password exactly as it was: its password, its sessions, its claims and its profile",
    async () => {
      const signedIn = await signIn(email, OWN_PASSWORD);
      const dump = await dumpPortal();
      await sleep(1100);

      const result = await asAdmin(kind.link, { uid });
      const body = ok<InviteLinkDto>(result);
      expect(Object.keys(body)).toEqual(["inviteLink"]);
      // Welcomed by now, so the plain link.
      expect(body.inviteLink).toMatch(INVITE_LINK);

      const after = await dumpPortal();
      // Not one thing about the sign-in account moved: the same password, the same sessions, the same claims.
      expect(after.accounts).toEqual(dump.accounts);
      expect(withoutAudit(after)).toEqual(withoutAudit(dump));
      expect(Object.keys(after.firestore)).toHaveLength(Object.keys(dump.firestore).length + 1);
      expect((await signIn(email, OWN_PASSWORD)).uid).toBe(uid);
      expect((await me(signedIn)).email).toBe(email);
      ok(await call(kind.ownRead, {}, { token: signedIn.token }));
      // And the log says a link was made, and nothing about a temporary password.
      expect((await auditFor(uid))[0]).toMatchObject({ action: `${role}.invite_link`, summary: `Created a set-password link for ${email}` });
    },
    SLOW_TEST_MS,
  );

});

// The link ends sign-ins once, as the request arrives. Firebase ends them by the whole
// second, so one made with the temporary password in that same second is left standing
// (admin-pledges-service.ts:716-721): there is no wait for the next second and no second
// sign-out, as there is when a new temporary password is issued (:664-665). Its token still
// says the account is on a temporary password, so the portal holds it at choosing one. Once
// the browser renews it, it carries the account's new claims instead, and opens the portal
// to someone who signed in with the cancelled password and never chose one.
describe("a set-password link, asked for in the very second someone signs in with the temporary password it cancels", () => {
  it(
    "ends that sign-in too, as issuing a new temporary password does, for a pledge and for an active",
    async () => {
      for (const kind of KINDS) {
        const email = `same.second.${kind.role}@uci.edu`;
        const { uid, temporary } = await startOnTemporary(kind.role, email, "Noor Castell");
        const lastMoment = await signInEarlyInASecond(email, temporary);
        const from = Date.now();
        ok<InviteLinkDto>(await asAdmin(kind.link, { uid }));
        // The sign-in and the request were in the same second.
        expect(Math.floor(lastMoment.signedInAtMs / 1000)).toBe(Math.floor(from / 1000));
        // The temporary password was cancelled all the same.
        expect(await storedClaims(uid)).toEqual({ role: kind.role, issued: email });
        expect(await signInFailure(email, temporary)).toMatch(WRONG_PASSWORD);

        // Sign-ins are only honoured from a later second than the one this was made in.
        const signedInAt = Number(claimsOf(lastMoment.token).auth_time);
        const validFrom = Date.parse((await testAuth().getUser(uid)).tokensValidAfterTime ?? "") / 1000;
        expect(validFrom, kind.role).toBeGreaterThan(signedInAt);
        for (const result of [await call(getMe, {}, { token: lastMoment.token }), await choose(lastMoment, { password: OWN_PASSWORD })]) {
          expect(refused(result, 401, "session_revoked").error, kind.role).toBe("Your session has ended. Sign in again.");
        }
        // Nobody has signed in since, so the emulator's renewed token is dated as Firebase's would be.
        // It no longer carries the flag, and must not be honoured either.
        const again = await renewed(lastMoment);
        if (again !== null) {
          refused(await call(getMe, {}, { token: again.token }), 401, "session_revoked");
          refused(await call(kind.ownRead, {}, { token: again.token }), 401, "session_revoked");
        }
      }
    },
    SLOW_TEST_MS,
  );
});

// Three days after it was issued a temporary password stops working. The account is then
// refused everywhere, the route for replacing the password included, until a chair issues
// a new one or sends a link.
describe.each(KINDS)("$role: a temporary password that has run out", (kind) => {
  const { role } = kind;
  const email = `ran.out.${role}@uci.edu`;
  const displayName = "Odalys Finch";
  let uid = "";
  let temporary = "";
  /** Signed in while the password was still good. */
  let inTime: Session;
  /** Signed in after it ran out. */
  let late: Session;
  let before: Dump;

  it("is good ten minutes short of three days after it was issued", async () => {
    ({ uid, temporary } = await startOnTemporary(role, email, displayName));
    await issueTemporaryPasswordAgo(uid, TEMPORARY_PASSWORD_MS - 10 * 60_000);
    inTime = await signIn(email, temporary);
    expect(refused(await call(getMe, {}, { token: inTime.token }), 403, "password_change_required").error).toBe(CHANGE_REQUIRED);
    const weak = refused(await choose(inTime, { password: "short" }), 422, "invalid");
    expect(weak.fields).toEqual([{ path: "password", code: "weak_password", message: TOO_SHORT }]);
  });

  it("still signs in a minute past three days, to an account that is refused every route there is", async () => {
    await issueTemporaryPasswordAgo(uid, TEMPORARY_PASSWORD_MS + 60_000);
    // The password is still the account's password. What it opens is nothing.
    late = await signIn(email, temporary);
    expect(late.uid).toBe(uid);
    before = await dumpPortal();

    expect(ROUTES.map((route) => route.label)).toContain(CHOOSE_PASSWORD);
    for (const route of SIGNED_IN_ROUTES) {
      const params = Object.fromEntries(Object.keys(route.params).map((name) => [name, name === "formId" ? "week2interviews" : name === "uid" ? uid : name === "teamId" ? TEAM_ATLAS : "abc123"]));
      const attempts = [
        await call(route.handler, route.params, { method: route.method, token: late.token }),
        await call(route.handler, params, { method: route.method, token: late.token, query: `?confirm=${encodeURIComponent(email)}`, body: { password: OWN_PASSWORD, displayName: "Changed", status: "disabled", answers: {} } }),
      ];
      for (const result of attempts) {
        const body = refused(result, 403, "temporary_password_expired");
        expect(body.error, route.label).toBe(EXPIRED);
        expect(Object.keys(result.body as object).sort(), route.label).toEqual(["code", "error"]);
        expect(result.headers.get("cache-control"), route.label).toBe("no-store");
      }
    }
  });

  it("refuses a password chosen on a sign-in from before it ran out as well: the account itself is asked, not only the token", async () => {
    // That token was made while the password was good, and still says so.
    expect(Number(claimsOf(inTime.token).tempAt) * 1000).toBeGreaterThan(Date.now() - TEMPORARY_PASSWORD_MS);
    const result = await choose(inTime, { password: OWN_PASSWORD });
    expect(refused(result, 403, "temporary_password_expired").error).toBe(EXPIRED);
    expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
    // On any other route it is told what its own claims say.
    refused(await call(getMe, {}, { token: inTime.token }), 403, "password_change_required");
  });

  // The gate answers for a sign-in made after the password ran out, and the route itself for one
  // made before, which reads the account. Neither answer depends on anything that was sent.
  it("is told the same on the route for choosing a password whatever it sends: a good password, a poor one, the temporary one, or nothing", async () => {
    expect(await storedFingerprint(uid)).toEqual(A_FINGERPRINT);

    const bodies: unknown[] = [
      { password: OWN_PASSWORD },
      { password: "amber-window-thistle-93" },
      { password: "short" },
      { password: "" },
      { password: temporary },
      { password: temporary.toLowerCase() },
      ...rewritten(temporary).map(([, password]) => ({ password })),
      { password: `${kind.ownWords[0]}-flies-kites-42` },
      { password: 12_345_678_901 },
      { password: null },
      { newPassword: OWN_PASSWORD },
      {},
    ];
    expect(bodies).toHaveLength(21);
    for (const session of [late, inTime]) {
      for (const body of bodies) {
        resetRateLimits();
        const result = await choose(session, body);
        expect(refused(result, 403, "temporary_password_expired").error, JSON.stringify(body)).toBe(EXPIRED);
        expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
      }
    }
    // A body that is not an object at all gets the same answer, as does one with every field a caller might try.
    for (const rawBody of [`["${OWN_PASSWORD}"]`, `"${OWN_PASSWORD}"`, "null", "1234567890123"]) {
      refused(await call(choosePassword, {}, { method: "POST", token: late.token, rawBody }), 403, "temporary_password_expired");
    }
    const pushed = await choose(late, { password: OWN_PASSWORD, changed: true, account: "changed", temp: false, tempAt: Math.floor(Date.now() / 1000), expired: false });
    expect(refused(pushed, 403, "temporary_password_expired").error).toBe(EXPIRED);
  });

  it("changed nothing with any of that: the account is as it was, nobody chose a password, and nothing was recorded", async () => {
    const after = await dumpPortal();
    expect(after.accounts).toEqual(before.accounts);
    expect(after.firestore).toEqual(before.firestore);
    expect(await signInFailure(email, OWN_PASSWORD)).toMatch(WRONG_PASSWORD);
    expect((await signIn(email, temporary)).uid).toBe(uid);
    expect((await auditFor(uid)).map((entry) => entry.action)).toEqual([`${role}.create`]);
    // An admin still sees someone who has yet to get in.
    expect(await rowOf(role, uid)).toMatchObject({ accountState: "invited", status: "active", signInBlocked: false });
  });

  it(
    "is usable again once a chair issues a new one: three more days, and the old password is gone",
    async () => {
      const from = Date.now();
      const fresh = await issueFor(role, uid);
      const claims = await storedClaims(uid);
      expect(claims).toEqual(temporaryClaims(role, email, true));
      expectIssuedBetween(claims, from, Date.now());
      expect(await signInFailure(email, temporary)).toMatch(WRONG_PASSWORD);
      refused(await call(getMe, {}, { token: late.token }), 401, "session_revoked");

      const session = await signIn(email, fresh);
      expect(refused(await call(getMe, {}, { token: session.token }), 403, "password_change_required").error).toBe(CHANGE_REQUIRED);
      expect(ok(await choose(session, { password: OWN_PASSWORD }))).toEqual({ ok: true });
      expect(await storedClaims(uid)).toEqual({ role, issued: email });
      const own = await signIn(email, OWN_PASSWORD);
      expect(await me(own)).toMatchObject({ uid, email, displayName, role });
      ok(await call(kind.ownRead, {}, { token: own.token }));
    },
    SLOW_TEST_MS,
  );

  it(
    "is usable again after a set-password link instead: the link cancels the expired password, and the gate lets them in",
    async () => {
      const other = `ran.out.then.link.${role}@uci.edu`;
      const started = await startOnTemporary(role, other, "Odalys Finch");
      await issueTemporaryPasswordAgo(started.uid, 30 * 86_400_000);
      const expired = await signIn(other, started.temporary);
      expect(refused(await call(getMe, {}, { token: expired.token }), 403, "temporary_password_expired").error).toBe(EXPIRED);
      expect(refused(await choose(expired, { password: OWN_PASSWORD }), 403, "temporary_password_expired").error).toBe(EXPIRED);
      await sleep(1100);

      const { inviteLink } = ok<InviteLinkDto>(await asAdmin(kind.link, { uid: started.uid }));
      expect(await storedClaims(started.uid)).toEqual({ role, issued: other });
      expect(await storedFingerprint(started.uid)).toBeNull();
      expect((await auditFor(started.uid))[0].summary).toBe(`Created a set-password link for ${other}, which cancelled their temporary password`);
      expect(await signInFailure(other, started.temporary)).toMatch(WRONG_PASSWORD);
      refused(await call(getMe, {}, { token: expired.token }), 401, "session_revoked");

      expect(await redeemResetCode(new URL(inviteLink).searchParams.get("oobCode") ?? "", OWN_PASSWORD)).toBe(true);
      const session = await signIn(other, OWN_PASSWORD);
      expect(await me(session)).toMatchObject({ uid: started.uid, email: other, role, onboardedAt: null });
      ok(await call(kind.ownRead, {}, { token: session.token }));
      refused(await choose(session, { password: "amber-window-thistle-93" }), 409, "not_required");
    },
    SLOW_TEST_MS,
  );

  // Fifteen minutes cannot be waited out, so the token says its sign-in was that long ago,
  // which is what a tab left open on a shared computer would send.
  it(
    "cannot choose a password on a sign-in more than 15 minutes old, and can on one just under",
    async () => {
      const idle = `left.open.${role}@uci.edu`;
      const started = await startOnTemporary(role, idle, "Odalys Finch");
      const session = await signIn(idle, started.temporary);
      await acceptTokensFrom(started.uid, 86_400_000);
      const signedIn = Number(claimsOf(session.token).auth_time);
      const aged = (ms: number): Session => ({ ...session, token: withClaims(session.token, { auth_time: signedIn - ms / 1000 }) });

      for (const ms of [TIMING.passwordSetupMs + 60_000, 3_600_000, TIMING.maxSessionAgeMs - 60_000]) {
        const result = await choose(aged(ms), { password: OWN_PASSWORD });
        expect(refused(result, 401, "session_expired").error, `${ms} ms`).toBe("Your session has expired. Sign in again.");
      }
      expect(await signInFailure(idle, OWN_PASSWORD)).toMatch(WRONG_PASSWORD);
      expect(await storedClaims(started.uid)).toEqual(temporaryClaims(role, idle, true));
      // Elsewhere that sign-in is told to choose a password, as it would be at any age.
      refused(await call(getMe, {}, { token: aged(TIMING.passwordSetupMs + 60_000).token }), 403, "password_change_required");

      // A minute inside the limit it goes through.
      expect(ok(await choose(aged(TIMING.passwordSetupMs - 60_000), { password: OWN_PASSWORD }))).toEqual({ ok: true });
      expect((await signIn(idle, OWN_PASSWORD)).uid).toBe(started.uid);
    },
    SLOW_TEST_MS,
  );
});

// Firebase knows nothing of the three days. It signs in whoever has a temporary password,
// however long ago that ran out, and it changes an account's password for whoever is signed
// in to it: `updatePassword` in the browser SDK. A password can be reset from the Firebase
// console as well. None of that is a chair issuing a new one. The flag and the time of issue
// are the portal's, and they stay as they were, so the account is still on a temporary
// password that has run out and is refused everywhere, the route for choosing a password
// included. Were that route ever to let such an account through, whoever found a temporary
// password in an old message could change it themself and walk in.

/** A password put on an account by some means other than the portal. It meets every rule here, and is nobody else's. */
const SET_ELSEWHERE = "set-behind-its-back-17";

/** An account whose temporary password has run out, and a sign-in made with that password since. */
interface ExpiredAccount {
  uid: string;
  email: string;
  holder: Session;
}

/** Every way an account's password changes with no chair and no route of the portal's involved. True when Firebase took it. */
const WITHOUT_A_CHAIR: ReadonlyArray<[string, string, (account: ExpiredAccount) => Promise<boolean>]> = [
  ["by whoever is signed in with the expired password, through Firebase itself", "by.holder", ({ holder }) => changeOwnPassword(holder, SET_ELSEWHERE)],
  [
    "with the Admin SDK, standing in for a reset from the Firebase console",
    "by.console",
    async ({ uid }) => {
      await testAuth().updateUser(uid, { password: SET_ELSEWHERE });
      return true;
    },
  ],
  ["through a reset link the portal had no part in, redeemed as the reset page redeems one", "by.outside.link", ({ email }) => setPasswordByResetLink(email, SET_ELSEWHERE)],
];
const changedEmail = (slug: string, role: MemberKind): string => `changed.${slug}.${role}@uci.edu`;

describe.each(KINDS)("$role: a temporary password that ran out, on an account whose password was then changed", (kind) => {
  const { role } = kind;

  describe.each(WITHOUT_A_CHAIR)("%s", (_way, slug, change) => {
    const email = changedEmail(slug, role);
    const displayName = "Wendell Arroyo";
    let uid = "";
    let temporary = "";
    /** Signed in with the temporary password after it ran out. */
    let holder: Session;
    /** Signed in with the password the account was given since. */
    let again: Session;
    let before: Dump;

    const hashIn = (dump: Dump): unknown => (dump.accounts[uid] as Record<string, unknown>).passwordHash;

    it("is shut out like any expired account, though Firebase still signs it in with the password that ran out", async () => {
      ({ uid, temporary } = await startOnExpired(role, email, displayName));
      // Firebase takes the password: only the portal knows it ran out.
      holder = await signIn(email, temporary);
      expect(holder.uid).toBe(uid);
      expect(refused(await call(getMe, {}, { token: holder.token }), 403, "temporary_password_expired").error).toBe(EXPIRED);
      expect(refused(await choose(holder, { password: OWN_PASSWORD }), 403, "temporary_password_expired").error).toBe(EXPIRED);
    });

    it("takes the new password and is otherwise the account it was: its flag, its expired time and its fingerprint have not moved", async () => {
      const claims = await storedClaims(uid);
      const kept = await storedFingerprint(uid);
      const dump = await dumpPortal();
      expect(claims).toEqual(temporaryClaims(role, email, true));
      expect(kept).toEqual(A_FINGERPRINT);
      // A password the portal would have taken, had it been asked.
      expect(passwordProblem(SET_ELSEWHERE, { email, displayName, temporary: true })).toBeNull();

      expect(await change({ uid, email, holder })).toBe(true);

      // Firebase knows nothing of the portal's flag. The account still says its temporary password ran out.
      expect(await storedClaims(uid)).toEqual(claims);
      expect(await storedFingerprint(uid)).toEqual(kept);
      const after = await dumpPortal();
      expect(after.firestore).toEqual(dump.firestore);
      expect(others(after, uid)).toEqual(others(dump, uid));
      expect(settled(after, uid)).toEqual(settled(dump, uid));
      // The password did change: Firebase stores another, and the temporary one signs nobody in.
      expect(hashIn(after)).not.toBe(hashIn(dump));
      expect(await signInFailure(email, temporary)).toMatch(WRONG_PASSWORD);
    });

    it("signs in with that password, to a token that still says the temporary password ran out", async () => {
      again = await signIn(email, SET_ELSEWHERE);
      expect(again.uid).toBe(uid);
      const claims = claimsOf(again.token);
      expect(claims).toMatchObject({ role, issued: email, temp: true, tempNew: true, email, email_verified: true });
      expect(Number(claims.tempAt) * 1000).toBeLessThan(Date.now() - TEMPORARY_PASSWORD_MS);
      // So that a token saying its sign-in was hours ago is judged by the portal, below, and not turned away by the emulator first.
      await acceptTokensFrom(uid, 86_400_000);
      before = await dumpPortal();
    });

    it("is refused every route there is, the one for choosing a password included, with 403 temporary_password_expired", async () => {
      expect(ROUTES.map((route) => route.label)).toContain(CHOOSE_PASSWORD);
      expect(ROUTES.length).toBeGreaterThanOrEqual(40);
      for (const route of SIGNED_IN_ROUTES) {
        const params = Object.fromEntries(Object.keys(route.params).map((name) => [name, name === "formId" ? "week2interviews" : name === "uid" ? uid : name === "teamId" ? TEAM_ATLAS : "abc123"]));
        const attempts = [
          await call(route.handler, route.params, { method: route.method, token: again.token }),
          await call(route.handler, params, { method: route.method, token: again.token, query: `?confirm=${encodeURIComponent(email)}`, body: { password: OWN_PASSWORD, displayName: "Changed", status: "disabled", answers: {} } }),
        ];
        for (const result of attempts) {
          const body = refused(result, 403, "temporary_password_expired");
          expect(body.error, route.label).toBe(EXPIRED);
          expect(Object.keys(result.body as object).sort(), route.label).toEqual(["code", "error"]);
          expect(result.headers.get("cache-control"), route.label).toBe("no-store");
        }
      }
    });

    it("is told the same on the route for choosing a password whatever it sends, and whatever its token says of the three days or of its sign-in", async () => {
      const bodies: unknown[] = [
        { password: OWN_PASSWORD },
        // The password the account has now, which is the one a sign-in page would send on.
        { password: SET_ELSEWHERE },
        { password: "amber-window-thistle-93" },
        { password: "short" },
        { password: temporary },
        { password: temporary.replace(/-/g, "").toLowerCase() },
        { password: null },
        { newPassword: OWN_PASSWORD },
        // None of this is the caller's to say.
        { password: OWN_PASSWORD, changed: true, account: "changed", temp: false, tempAt: Math.floor(Date.now() / 1000), expired: false },
        {},
      ];
      // A token from before the three days were up still says the password is good. The gate lets
      // it through to the route, and the route asks the account, which says otherwise.
      const inTime: Session = { ...again, token: withClaims(again.token, { tempAt: Math.floor(Date.now() / 1000) - 3600 }) };
      refused(await call(getMe, {}, { token: inTime.token }), 403, "password_change_required");

      for (const session of [again, inTime]) {
        for (const body of bodies) {
          resetRateLimits();
          const result = await choose(session, body);
          expect(refused(result, 403, "temporary_password_expired").error, JSON.stringify(body)).toBe(EXPIRED);
          expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
        }
      }
      for (const rawBody of [`["${OWN_PASSWORD}"]`, `"${OWN_PASSWORD}"`, "null"]) {
        refused(await call(choosePassword, {}, { method: "POST", token: again.token, rawBody }), 403, "temporary_password_expired");
      }

      // A sign-in too old to choose a password with is told the password has expired, not that
      // the session has: signing in again would change nothing.
      const signedIn = Number(claimsOf(again.token).auth_time);
      for (const ms of [TIMING.passwordSetupMs + 60_000, 3_600_000, TIMING.maxSessionAgeMs - 60_000]) {
        const aged = withClaims(again.token, { auth_time: signedIn - ms / 1000 });
        const result = await call(choosePassword, {}, { method: "POST", token: aged, body: { password: OWN_PASSWORD } });
        expect(refused(result, 403, "temporary_password_expired").error, `${ms} ms`).toBe(EXPIRED);
        refused(await call(getMe, {}, { token: aged }), 403, "temporary_password_expired");
      }
    });

    it("wrote nothing with any of that: every document and every sign-in account is exactly as it was, and nobody chose a password", async () => {
      const after = await dumpPortal();
      expect(after.accounts).toEqual(before.accounts);
      expect(after.firestore).toEqual(before.firestore);
      expect(await storedClaims(uid)).toEqual(temporaryClaims(role, email, true));
      expect(await storedFingerprint(uid)).toEqual(A_FINGERPRINT);
      expect((await auditFor(uid)).map((entry) => entry.action)).toEqual([`${role}.create`]);
      // The password that was set is still the account's, and still opens nothing. No other was chosen.
      for (const password of [OWN_PASSWORD, "amber-window-thistle-93", temporary]) expect(await signInFailure(email, password), password).toMatch(WRONG_PASSWORD);
      const stillOut = await signIn(email, SET_ELSEWHERE);
      expect(refused(await call(getMe, {}, { token: stillOut.token }), 403, "temporary_password_expired").error).toBe(EXPIRED);
      refused(await call(kind.ownRead, {}, { token: stillOut.token }), 403, "temporary_password_expired");
      // An admin still sees someone who has yet to get in.
      expect(await rowOf(role, uid)).toMatchObject({ accountState: "invited", status: "active", signInBlocked: false });
    });
  });

  // The way back in is the one there always was: an admin. Either of the two things an admin
  // can do replaces the password that was set, so whoever set it gains nothing by having done so.
  describe("and is usable again only once an admin steps in", () => {
    const displayName = "Wendell Arroyo";

    it(
      "with a new temporary password: three more days, the password that was set is gone, and they choose their own",
      async () => {
        const email = changedEmail(WITHOUT_A_CHAIR[0][1], role);
        const uid = await uidOf(email);
        const shutOut = await signIn(email, SET_ELSEWHERE);
        expect(refused(await call(getMe, {}, { token: shutOut.token }), 403, "temporary_password_expired").error).toBe(EXPIRED);

        const from = Date.now();
        const fresh = await issueFor(role, uid);
        const claims = await storedClaims(uid);
        expect(claims).toEqual(temporaryClaims(role, email, true));
        expectIssuedBetween(claims, from, Date.now());
        expect(await storedFingerprint(uid)).toEqual(A_FINGERPRINT);
        expect(matchesIssued(fresh, await keptFor(uid))).toBe(true);
        // Neither the password that was set nor the sign-in made with it is any use now.
        expect(await signInFailure(email, SET_ELSEWHERE)).toMatch(WRONG_PASSWORD);
        for (const result of [await call(getMe, {}, { token: shutOut.token }), await choose(shutOut, { password: OWN_PASSWORD })]) {
          refused(result, 401, "session_revoked");
        }

        const session = await signIn(email, fresh);
        expect(refused(await call(getMe, {}, { token: session.token }), 403, "password_change_required").error).toBe(CHANGE_REQUIRED);
        expect(ok(await choose(session, { password: OWN_PASSWORD }))).toEqual({ ok: true });
        expect(await storedClaims(uid)).toEqual({ role, issued: email });
        expect(await storedFingerprint(uid)).toBeNull();
        const own = await signIn(email, OWN_PASSWORD);
        expect(await me(own)).toMatchObject({ uid, email, displayName, role, onboardedAt: null });
        ok(await call(kind.ownRead, {}, { token: own.token }));
        expect((await auditFor(uid)).map((entry) => entry.action)).toEqual([`${role}.temporary_password`, `${role}.create`]);
      },
      SLOW_TEST_MS,
    );

    it(
      'with "Get password link": the flag comes off, the password that was set goes with it, and the link is the only way in',
      async () => {
        const email = changedEmail(WITHOUT_A_CHAIR[1][1], role);
        const uid = await uidOf(email);
        const shutOut = await signIn(email, SET_ELSEWHERE);
        expect(refused(await call(getMe, {}, { token: shutOut.token }), 403, "temporary_password_expired").error).toBe(EXPIRED);
        await sleep(1100);

        const { inviteLink } = ok<InviteLinkDto>(await asAdmin(kind.link, { uid }));
        expect(await storedClaims(uid)).toEqual({ role, issued: email });
        expect(await storedFingerprint(uid)).toBeNull();
        expect((await auditFor(uid))[0].summary).toBe(`Created a set-password link for ${email}, which cancelled their temporary password`);
        // With the flag off, the password that was set would have opened the portal. It signs nobody in.
        expect(await signInFailure(email, SET_ELSEWHERE)).toMatch(WRONG_PASSWORD);
        refused(await call(getMe, {}, { token: shutOut.token }), 401, "session_revoked");
        refused(await call(kind.ownRead, {}, { token: shutOut.token }), 401, "session_revoked");

        expect(await redeemResetCode(new URL(inviteLink).searchParams.get("oobCode") ?? "", OWN_PASSWORD)).toBe(true);
        const session = await signIn(email, OWN_PASSWORD);
        expect(await me(session)).toMatchObject({ uid, email, displayName, role, onboardedAt: null });
        ok(await call(kind.ownRead, {}, { token: session.token }));
        refused(await choose(session, { password: "amber-window-thistle-93" }), 409, "not_required");
        expect(await signInFailure(email, SET_ELSEWHERE)).toMatch(WRONG_PASSWORD);
      },
      SLOW_TEST_MS,
    );
  });
});

// A name is copied out next to a set-password link or a temporary password, and a
// spreadsheet runs a cell that starts with one of these as a formula. Creating an account
// has always refused such a name. Renaming one refuses it too.
describe.each(KINDS)("$role: renaming an account to a name a spreadsheet would run", (kind) => {
  const { role, email, displayName } = kind;
  const rename = (uid: string, body: unknown): Promise<ApiResult> => call(kind.update, { uid }, { method: "PATCH", token: admin.token, body });

  it.each<[string, string]>([
    ["an equals sign", '=HYPERLINK("https://evil.example")'],
    ["a plus sign", "+1 949 555 0100"],
    ["a hyphen", "-Renamed"],
    ["an at sign", "@renamed"],
    ["an equals sign after padding", "   =1+1"],
    ["an equals sign after a tab", "\t=1+1"],
    ["an equals sign after a line break", "\r\n=cmd|' /C calc'!A0"],
  ])("refuses a name that starts with %s, and changes nothing", async (_label, name) => {
    const uid = await uidOf(email);
    const before = await dumpPortal();

    const result = await rename(uid, { displayName: name });
    const body = refused(result, 422, "invalid");
    expect(body.fields).toEqual([{ path: "displayName", code: "invalid", message: UNSAFE_NAME }]);
    expect(Object.keys(result.body as object).sort()).toEqual(["code", "error", "fields"]);

    // Neither the profile nor the sign-in account took the name, and nothing was logged.
    const after = await dumpPortal();
    expect(after.accounts).toEqual(before.accounts);
    expect(after.firestore).toEqual(before.firestore);
    expect((await testAuth().getUser(uid)).displayName).toBe(displayName);
  });

  it("refuses it along with whatever else is wrong with the request, and does none of what was right about it", async () => {
    const uid = await uidOf(email);
    const before = await dumpPortal();
    const body = refused(await rename(uid, { displayName: "=cmd", status: "gone" }), 422, "invalid");
    expect(fieldCodes(body)).toEqual(["displayName:invalid", "status:invalid"]);
    // A change that would have been fine on its own is not made beside a name that is not.
    refused(await rename(uid, { displayName: "+Renamed", status: "disabled" }), 422, "invalid");
    expect(await dumpPortal()).toEqual(before);
    expect((await signIn(email, OWN_PASSWORD)).email).toBe(email);
  });

  it("refuses it for an account of this kind only: through the other kind's route the account is not there", async () => {
    const uid = await uidOf(email);
    const other = kindOf(role === "pledge" ? "active" : "pledge");
    const result = await call(other.update, { uid }, { method: "PATCH", token: admin.token, body: { displayName: "=cmd" } });
    expect(refused(result, 404, "not_found").error).toBe(NO_SUCH_ACCOUNT);
  });

  it("still takes a name with one of those symbols anywhere but the start, and writes it to the profile and the sign-in account", async () => {
    const uid = await uidOf(email);
    for (const name of ["Anne-Marie O'Neil", "Rowan = Ellis", "R. Ellis-Morgan (+1)", displayName]) {
      expect(ok(await rename(uid, { displayName: `  ${name} ` }))).toEqual({ ok: true });
      expect((await docData(`users/${uid}`))?.displayName).toBe(name);
      expect((await testAuth().getUser(uid)).displayName).toBe(name);
    }
    expect((await auditFor(uid))[0]).toMatchObject({ action: `${role}.update`, summary: `${email}: name` });
  });
});

// A failed attempt to add someone can leave a sign-in account behind with no profile. It is
// in none of the portal's lists, so the admin is told where to find it.
describe.each(KINDS)("$role: adding someone whose address has a sign-in account and no profile", (kind) => {
  const { role } = kind;
  const email = `left.over.${role}@uci.edu`;
  let leftOverUid = "";

  it("is refused, and says where to delete the account that is in the way, however the new one was to start", async () => {
    const record = await testAuth().createUser({ email, password: "left-behind-earlier-1", emailVerified: true });
    leftOverUid = record.uid;
    const before = await dumpPortal();

    for (const more of [{}, { start: "link" }, { start: "temporary_password" }]) {
      const result = await asAdmin(kind.create, {}, { email: `  ${email.toUpperCase()} `, displayName: "Left Over", ...more });
      expect(refused(result, 409, "email_exists").error).toBe(LEFT_OVER);
      expect(Object.keys(result.body as object).sort()).toEqual(["code", "error"]);
      // No temporary password was made for an account that was not.
      expect(result.text).not.toMatch(/[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}/);
      expect(result.text).not.toContain(leftOverUid);
    }
    // The account in the way was not touched, given a profile, or logged.
    expect(await dumpPortal()).toEqual(before);
    expect(await docExists(`users/${leftOverUid}`)).toBe(false);
    expect((await testAuth().getUser(leftOverUid)).customClaims ?? null).toBeNull();
    expect((await signIn(email, "left-behind-earlier-1")).uid).toBe(leftOverUid);
  });

  it("says the same through the other kind's route: the address is taken whichever kind is asked for", async () => {
    const other = kindOf(role === "pledge" ? "active" : "pledge");
    expect(refused(await asAdmin(other.create, {}, { email, displayName: "Left Over" }), 409, "email_exists").error).toBe(LEFT_OVER);
  });

  it("says only that the address is taken when the account has a profile, as it always has", async () => {
    for (const taken of [AVERY, PRIYA, kind.email]) {
      const result = await asAdmin(kind.create, {}, { email: taken, displayName: "Taken", start: "temporary_password" });
      expect(refused(result, 409, "email_exists").error).toBe("An account with that email already exists.");
    }
  });

  it("works once that account has been deleted, as the message says", async () => {
    await testAuth().deleteUser(leftOverUid);
    const made = created(await asAdmin(kind.create, {}, { email, displayName: "Left Over", start: "temporary_password" }), role);
    keep(made.temporaryPassword ?? "");
    expect(made.row).toMatchObject({ email, displayName: "Left Over", accountState: "invited" });
    expect(made.row.uid).not.toBe(leftOverUid);
    expect(await storedClaims(made.row.uid)).toEqual(temporaryClaims(role, email, true));
    expect(await docExists(`users/${made.row.uid}`)).toBe(true);
  });
});

describe("how an account starts", () => {
  it.each<[string, unknown]>([
    ["a word that is not one of the two", "password"],
    ["half of the right word", "temporary"],
    ["the right word in capitals", "TEMPORARY_PASSWORD"],
    ["the right word with padding", " temporary_password "],
    ["an empty string", ""],
    ["a number", 1],
    ["true", true],
    ["a list holding the right word", ["temporary_password"]],
    ["an object", { kind: "temporary_password" }],
  ])("is refused when start is %s, and nothing is created", async (_label, start) => {
    const usersBefore = await countAll("users");
    const auditBefore = await countAll("auditLog");
    for (const kind of KINDS) {
      const email = `bad.start.${kind.role}@uci.edu`;
      const body = refused(await asAdmin(kind.create, {}, { email, displayName: "Bad Start", start }), 422, "invalid");
      expect(body.fields).toEqual([{ path: "start", code: "invalid", message: "Choose how this account starts." }]);
      await expect(testAuth().getUserByEmail(email)).rejects.toMatchObject({ code: "auth/user-not-found" });
    }
    expect(await countAll("users")).toBe(usersBefore);
    expect(await countAll("auditLog")).toBe(auditBefore);
  });

  it("reports a bad start along with everything else that is wrong with the request", async () => {
    for (const kind of KINDS) {
      const body = refused(await asAdmin(kind.create, {}, { email: "nope", displayName: "", start: "later" }), 422, "invalid");
      expect(fieldCodes(body)).toEqual(["displayName:required", "email:invalid_email", "start:invalid"]);
    }
  });

  it.each<[string, Record<string, unknown>]>([
    ["nothing is said about it", {}],
    ["it is link", { start: "link" }],
    ["it is null", { start: null }],
  ])("is by link when %s: no temporary password, and no flag on the account", async (_label, more) => {
    for (const kind of KINDS) {
      const email = `by.link.${Object.keys(more).length}${String(more.start ?? "x")}.${kind.role}@uci.edu`;
      const result = await asAdmin(kind.create, {}, { email, displayName: "By Link", ...more });
      const made = created(result, kind.role);
      expect(made.keys).toEqual([kind.role, "inviteLink", "temporaryPassword"].sort());
      expect(made.temporaryPassword).toBeNull();
      expect(made.inviteLink).toMatch(WELCOME_LINK);
      expect(made.row).toMatchObject({ email, accountState: "invited", lastSignInAt: null });

      const record = await testAuth().getUser(made.row.uid);
      expect(record.customClaims).toEqual({ role: kind.role, issued: email });
      expect(record.passwordHash).toBeUndefined();
      // No temporary password was made, so there is no fingerprint of one on the profile.
      expect(await storedFingerprint(made.row.uid)).toBeNull();
      expect(Object.keys((await docData(`users/${made.row.uid}`)) ?? {}).sort()).toEqual(PROFILE_KEYS);
      const [entry] = await auditFor(made.row.uid);
      expect(entry.summary).not.toMatch(/temporary/i);

      // The link works as it always has, and the account it opens is never asked to choose again.
      const code = new URL(made.inviteLink ?? "").searchParams.get("oobCode") ?? "";
      expect(await redeemResetCode(code, OWN_PASSWORD)).toBe(true);
      const session = await signIn(email, OWN_PASSWORD);
      expect("temp" in claimsOf(session.token)).toBe(false);
      expect((await me(session)).email).toBe(email);
      refused(await choose(session, { password: "amber-window-thistle-93" }), 409, "not_required");
    }
  });

  it("does not put a temporary password on an account that already exists when the address is taken", async () => {
    const before = await dumpPortal();
    for (const kind of KINDS) {
      for (const email of [AVERY, PRIYA, "Sam.Okafor@UCI.edu"]) {
        const result = await asAdmin(kind.create, {}, { email, displayName: "Taken", start: "temporary_password" });
        expect(refused(result, 409, "email_exists").error).toBe("An account with that email already exists.");
        expect(result.text).not.toMatch(/[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}/);
      }
      const adminAddress = refused(await asAdmin(kind.create, {}, { email: ADMIN_TWO, displayName: "Taken", start: "temporary_password" }), 422, "invalid");
      expect(fieldCodes(adminAddress)).toEqual(["email:is_admin"]);
    }
    const after = await dumpPortal();
    expect(after.accounts).toEqual(before.accounts);
    expect(after.firestore).toEqual(before.firestore);
    expect((await signIn(AVERY)).email).toBe(AVERY);
  });

  it("gives a pledge who starts on a temporary password their class and team like any other", async () => {
    const result = await asAdmin(kindOf("pledge").create, {}, { email: "with.team@uci.edu", displayName: "With Team", pledgeClass: "Mu", teamId: TEAM_ATLAS, start: "temporary_password" });
    const made = created(result, "pledge");
    keep(made.temporaryPassword ?? "");
    expect(await docData(`users/${made.row.uid}`)).toMatchObject({ role: "pledge", pledgeClass: "Mu", teamId: TEAM_ATLAS });
    ok(await call(updatePledge, { uid: made.row.uid }, { method: "PATCH", token: admin.token, body: { teamId: null } }));
    expect(await countWhere("users", "teamId", TEAM_ATLAS)).toBe(2);
  });

  it("is never the same password twice", async () => {
    const made: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const result = await asAdmin(kindOf("active").create, {}, { email: `unique.${index}@uci.edu`, displayName: "Unique Start", start: "temporary_password" });
      made.push(keep(created(result, "active").temporaryPassword ?? ""));
    }
    expect(new Set(made).size).toBe(5);
    for (const password of made) expect(password).toMatch(TEMPORARY_PASSWORD);
    // Each has a fingerprint of its own password under a salt of its own.
    const kept = await Promise.all([0, 1, 2, 3, 4].map(async (index) => keptFor(await uidOf(`unique.${index}@uci.edu`))));
    expect(new Set(kept.map((one) => one?.salt)).size).toBe(5);
    expect(new Set(kept.map((one) => one?.hash)).size).toBe(5);
    made.forEach((password, index) => {
      expect(matchesIssued(password, kept[index]), `its own, ${index}`).toBe(true);
      expect(matchesIssued(password, kept[(index + 1) % 5]), `another's, ${index}`).toBe(false);
    });
  });
});

// Every response in every one of these files goes through `call`, which refuses one that
// carries a salt or a hash, or a temporary password from a route that hands none out.
describe("the check every response goes through", () => {
  const ISSUED = "K7QM-2XRT-9BHD";
  const KEPT = { salt: "00112233445566778899aabbccddeeff", hash: "fe2ea1bafaf04e0be45698d44b4544ac56c0166d66832a9ad406f9055aff8b57" };
  /** What a record of the account's own password would look like beside a fingerprint, under `account`. The portal keeps none. */
  const MARK = "754a92e9278c560f2a862c43ce719de9dc2417bb65d65b94718ed7db5376093f";

  it("passes what the portal does send: a password from the routes that hand one out, and none from the rest", () => {
    expect(fingerprintLeak({ ok: true }, false)).toBeNull();
    expect(fingerprintLeak(null, false)).toBeNull();
    expect(fingerprintLeak({ pledges: [{ uid: "a", displayName: "Salt Hash", email: "salt.hash@uci.edu" }] }, false)).toBeNull();
    expect(fingerprintLeak({ pledge: { uid: "a" }, inviteLink: null, temporaryPassword: ISSUED }, true)).toBeNull();
    expect(fingerprintLeak({ active: { uid: "a" }, inviteLink: "http://localhost/login/reset", temporaryPassword: null }, true)).toBeNull();
    expect(fingerprintLeak({ temporaryPassword: ISSUED }, true)).toBeNull();
  });

  it("catches a fingerprint, or either half of one, wherever in a response it is", () => {
    expect(fingerprintLeak({ pledge: { uid: "a", temporaryPassword: KEPT } }, true)).toMatch(/salt|not a temporary password/);
    expect(fingerprintLeak({ pledge: { uid: "a", temporaryPassword: KEPT } }, false)).not.toBeNull();
    expect(fingerprintLeak({ pledges: [{ uid: "a" }, { uid: "b", salt: KEPT.salt }] }, true)).toMatch(/"salt"/);
    expect(fingerprintLeak([{ deep: [{ deeper: { hash: KEPT.hash } }] }], false)).toMatch(/"hash"/);
    expect(fingerprintLeak({ error: "x", code: "y", fields: [{ path: "password", hash: KEPT.hash }] }, false)).toMatch(/"hash"/);
  });

  it("catches anything of the account's own password under `temporaryPassword`, with a fingerprint beside it or on its own", () => {
    const HAS_A_MARK = /its "temporaryPassword" has an "account"/;
    // From a route that hands a password out and from one that does not, at any depth, and whatever it holds.
    for (const handsOut of [true, false]) {
      expect(fingerprintLeak({ temporaryPassword: { account: MARK } }, handsOut)).toMatch(HAS_A_MARK);
      expect(fingerprintLeak({ temporaryPassword: { account: null } }, handsOut)).toMatch(HAS_A_MARK);
      expect(fingerprintLeak({ pledge: { uid: "a", temporaryPassword: { account: MARK } } }, handsOut)).toMatch(HAS_A_MARK);
      expect(fingerprintLeak([{ deep: [{ deeper: { temporaryPassword: { account: MARK } } }] }], handsOut)).toMatch(HAS_A_MARK);
      expect(fingerprintLeak({ pledges: [{ uid: "a" }, { uid: "b", temporaryPassword: { ...KEPT, account: MARK } }] }, handsOut)).toMatch(HAS_A_MARK);
      // With a fingerprint beside it, the response is refused whichever part is noticed first.
      expect(fingerprintLeak({ active: { temporaryPassword: { account: MARK, ...KEPT } } }, handsOut)).not.toBeNull();
    }
    // Under any other name the word is harmless, and is not taken for one.
    expect(fingerprintLeak({ account: "avery.chen@uci.edu", pledges: [{ uid: "a", account: { state: "invited" } }] }, false)).toBeNull();
    expect(fingerprintLeak({ temporaryPassword: ISSUED, account: MARK }, true)).toBeNull();
  });

  it("catches a temporary password from a route that hands none out, and anything else under that name from one that does", () => {
    expect(fingerprintLeak({ temporaryPassword: ISSUED }, false)).toMatch(/not from a route that hands one out/);
    expect(fingerprintLeak({ pledge: { temporaryPassword: null } }, false)).toMatch(/not from a route that hands one out/);
    expect(fingerprintLeak({ temporaryPassword: {} }, true)).toMatch(/not a temporary password/);
    expect(fingerprintLeak({ temporaryPassword: KEPT.hash }, true)).toMatch(/not a temporary password/);
    expect(fingerprintLeak({ temporaryPassword: "quiet-harbor-lantern-47" }, true)).toMatch(/not a temporary password/);
  });

  it("names the five routes that hand one out, and they are routes the portal has", () => {
    expect([...HANDS_OUT_A_TEMPORARY_PASSWORD].sort()).toEqual([
      "POST /admin/actives",
      "POST /admin/actives/[uid]/temporary-password",
      "POST /admin/pledges",
      "POST /admin/pledges/[uid]/temporary-password",
      "POST /preview/redeem",
    ]);
    const labels = ROUTES.map((route) => route.label);
    for (const label of HANDS_OUT_A_TEMPORARY_PASSWORD) expect(labels).toContain(label);
  });

  it("is applied by `call` itself: a handler that answered with a fingerprint would fail the test that called it", async () => {
    const leaking: AnyHandler = async () => Response.json({ pledges: [{ uid: "a", salt: KEPT.salt, hash: KEPT.hash }] });
    await expect(call(leaking, {})).rejects.toThrow(/it has a "salt"/);
    const refusing: AnyHandler = async () => Response.json({ error: "No.", code: "forbidden", hash: KEPT.hash }, { status: 403 });
    await expect(call(refusing, {})).rejects.toThrow(/answered 403, and it has a "hash"/);
    const handingOut: AnyHandler = async () => Response.json({ temporaryPassword: ISSUED });
    await expect(call(handingOut, {})).rejects.toThrow(/not from a route that hands one out/);
    const marking: AnyHandler = async () => Response.json({ pledge: { uid: "a", temporaryPassword: { account: MARK } } });
    await expect(call(marking, {})).rejects.toThrow(/answered 200, and its "temporaryPassword" has an "account"/);
    // On a refusal as on an answer, and with a fingerprint beside it.
    const refusingWithAMark: AnyHandler = async () => Response.json({ error: "No.", code: "temporary_password_expired", temporaryPassword: { ...KEPT, account: MARK } }, { status: 403 });
    await expect(call(refusingWithAMark, {})).rejects.toThrow(/answered 403, and its "temporaryPassword" has an "account"/);
    const harmless: AnyHandler = async () => Response.json({ ok: true });
    expect((await call(harmless, {})).body).toEqual({ ok: true });
  });
});

describe("nothing keeps a temporary password", () => {
  it("was handed a good many of them in this file, all different", () => {
    expect(handedOut.length).toBeGreaterThanOrEqual(30);
    expect(new Set(handedOut).size).toBe(handedOut.length);
    for (const password of handedOut) expect(password).toMatch(TEMPORARY_PASSWORD);
  });

  it("keeps a fingerprint for each account that is still on one, on its profile and nowhere else", async () => {
    const dump = await dumpPortal();
    const listed = await testAuth().listUsers(1000);
    const onTemporary = listed.users.filter((record) => record.customClaims?.temp === true).map((record) => record.uid).sort();
    expect(onTemporary.length).toBeGreaterThanOrEqual(6);

    const withFingerprint = Object.entries(dump.firestore)
      .filter(([, document]) => JSON.stringify(document).includes("temporaryPassword"))
      .map(([path]) => path)
      .sort();
    // Exactly the profiles of the accounts on a temporary password: no other document of any kind, and no profile of anyone else.
    expect(withFingerprint).toEqual(onTemporary.map((uid) => `users/${uid}`).sort());
    for (const uid of onTemporary) expect((await docData(`users/${uid}`))?.temporaryPassword, uid).toEqual(A_FINGERPRINT);

    // And not one fingerprint is of a password that is no longer anybody's.
    const kept = await Promise.all(onTemporary.map((uid) => keptFor(uid)));
    const stillGood = handedOut.filter((password) => kept.some((one) => matchesIssued(password, one)));
    expect(stillGood).toHaveLength(onTemporary.length);
    // No sign-in account carries one: a fingerprint is no claim.
    expect(JSON.stringify(dump.accounts)).not.toMatch(/temporaryPassword|"salt"|"hash"/);
    // Nor either half of one, other than on the profile it belongs to.
    const everyKept = await everyStoredFingerprint();
    expect(everyKept).toHaveLength(onTemporary.length * 2);
    const accounts = JSON.stringify(dump.accounts);
    const documents = Object.entries(dump.firestore).map(([path, document]): [string, string] => [path, JSON.stringify(document)]);
    for (const value of everyKept) {
      expect(accounts.includes(value), "on a sign-in account").toBe(false);
      const holding = documents.filter(([, text]) => text.includes(value)).map(([path]) => path);
      expect(holding, "in the documents").toHaveLength(1);
      expect(holding[0]).toMatch(/^users\/[^/]+$/);
    }
  });

  it("has none of them in the audit log, or in any other document the portal stores", async () => {
    const dump = await dumpPortal();
    const audit = JSON.stringify(await storedAudit());
    const stored = JSON.stringify(dump.firestore);
    expect((await storedAudit()).filter((entry) => /\.create$|\.temporary_password$/.test(entry.action)).length).toBeGreaterThanOrEqual(handedOut.length);
    for (const password of handedOut) {
      expect(audit.toUpperCase().includes(password), password).toBe(false);
      expect(stored.toUpperCase().includes(password), password).toBe(false);
    }
    // Nor anything shaped like one.
    expect(audit).not.toMatch(/[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}/);
    expect(audit).not.toMatch(/passwordHash|oobCode/);
    // Nor anything of the fingerprints, or of how Firebase stores anyone's password.
    for (const value of await everyStoredFingerprint()) expect(audit.includes(value)).toBe(false);
    expect(audit).not.toMatch(/fakeHash|fakeSalt/);
    // What Firebase stores of a password is in no document at all, a profile included.
    expect(stored).not.toMatch(/fakeHash|fakeSalt|passwordHash/);
  });

  it("has none of them on a sign-in account, other than as the password it is", async () => {
    const dump = await dumpPortal();
    // The emulator keeps a password readable inside its stand-in for a hash, so that one field is left out.
    const accounts = JSON.stringify(Object.values(dump.accounts).map((account) => ({ ...(account as Record<string, unknown>), passwordHash: null })));
    for (const password of handedOut) expect(accounts.toUpperCase().includes(password), password).toBe(false);
  });

  it("sends none of them back, and nothing of the fingerprints kept of them, in anything anyone reads afterwards", async () => {
    // Someone who is still on a temporary password, so that there is a fingerprint on the very profile each read is of.
    const onTemporary = await uidOf("with.team@uci.edu");
    const onTemporaryActive = await uidOf("unique.0@uci.edu");
    expect(await storedFingerprint(onTemporary)).toEqual(A_FINGERPRINT);
    expect(await storedFingerprint(onTemporaryActive)).toEqual(A_FINGERPRINT);
    // A salt and a hash for each account that is on one.
    const kept = await everyStoredFingerprint();
    expect(kept.length).toBeGreaterThanOrEqual(12);
    expect(kept.length % 2).toBe(0);
    for (const value of kept) expect(value).toMatch(/^[0-9a-f]{32}([0-9a-f]{32})?$/);

    const reader = await signIn(PRIYA, OWN_PASSWORD);
    const sent: Array<[string, ApiResult]> = [
      ["GET /admin/pledges", await call(getOverview, {}, { token: admin.token })],
      ["GET /admin/actives", await call(listActives, {}, { token: admin.token })],
      ["GET /admin/audit", await call(getAudit, {}, { token: admin.token })],
      ["GET /admin/pledges/[uid] for Maya", await call(getPledgeDetail, { uid: await uidOf(MAYA) }, { token: admin.token })],
      ["GET /admin/pledges/[uid] for Rowan", await call(getPledgeDetail, { uid: await uidOf(KINDS[0].email) }, { token: admin.token })],
      ["GET /admin/pledges/[uid] for someone on a temporary password", await call(getPledgeDetail, { uid: onTemporary }, { token: admin.token })],
      // Renaming them answers with nothing of the profile it changed.
      ["PATCH /admin/pledges/[uid]", await call(updatePledge, { uid: onTemporary }, { method: "PATCH", token: admin.token, body: { pledgeClass: "Nu" } })],
      ["PATCH /admin/actives/[uid]", await call(updateActive, { uid: onTemporaryActive }, { method: "PATCH", token: admin.token, body: { displayName: "Unique Start Renamed" } })],
      // What an active, a pledge and an admin read of themselves and of the pledges.
      ["GET /review/overview", await call(getReviewOverview, {}, { token: reader.token })],
      ["GET /me for an active", await call(getMe, {}, { token: reader.token })],
      ["GET /me for a pledge", await call(getMe, {}, { token: sam.token })],
      ["GET /dashboard", await call(getDashboard, {}, { token: sam.token })],
      ["GET /me for an admin", await call(getMe, {}, { token: admin.token })],
    ];
    for (const [label, result] of sent) {
      expect(result.status, label).toBe(200);
      for (const password of handedOut) expect(result.text.toUpperCase().includes(password), `${label}: ${password}`).toBe(false);
      for (const value of kept) expect(result.text.includes(value), `${label}: a stored salt or hash`).toBe(false);
      expect(result.text, label).not.toMatch(/passwordHash|"temp"|"tempAt"|"tempNew"|temporaryPassword|"salt"|"hash"|fakeHash|fakeSalt/);
      expect(fingerprintLeak(result.body, false), label).toBeNull();
    }
    // The person on the temporary password is among those the reads were of.
    expect(sent[0][1].text).toContain("with.team@uci.edu");
    expect(sent[1][1].text).toContain("unique.0@uci.edu");
    expect(sent[5][1].text).toContain("with.team@uci.edu");
  });

  it("has no read, asked for by an admin, a pledge or an active, that sends one or anything of its fingerprint", async () => {
    // Every route that reads, with ids of things that exist, one of them someone on a temporary password.
    const made = await startOnTemporary("pledge", "scanned.everywhere@uci.edu", "Scanned Everywhere");
    const reader = await signIn(PRIYA, OWN_PASSWORD);
    let called = 0;
    for (const route of ROUTES.filter((candidate) => candidate.method === "GET")) {
      const params = Object.fromEntries(Object.keys(route.params).map((name) => [name, name === "formId" ? "week0onboarding" : name === "uid" ? made.uid : name === "teamId" ? TEAM_ATLAS : "abc123"]));
      for (const session of [admin, sam, reader]) {
        resetRateLimits();
        // `call` fails the test if any of these carries a salt, a hash or a temporary password.
        const result = await call(route.handler, params, { method: route.method, token: session.token });
        expect(HANDS_OUT_A_TEMPORARY_PASSWORD, route.label).not.toContain(route.label);
        expect(result.text.toUpperCase(), route.label).not.toContain(made.temporary);
        for (const value of await everyStoredFingerprint()) expect(result.text.includes(value), route.label).toBe(false);
        called += 1;
      }
    }
    expect(called).toBeGreaterThanOrEqual(13 * 3);
  });

  it("left the seeded accounts it did not touch as the seed made them", async () => {
    expect(await storedClaims(await uidOf(AVERY))).toEqual({ role: "pledge", issued: AVERY });
    expect(await storedClaims(await uidOf(SAM))).toEqual({ role: "pledge", issued: SAM });
    expect((await signIn(SAM)).uid).toBe(sam.uid);
    expect(await countWhere("users", "role", "admin")).toBe(2);
    expect(await countAll("users")).toBeGreaterThan(SEEDED_ACCOUNTS);
  });
});
