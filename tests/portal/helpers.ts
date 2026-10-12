/**
 * Shared plumbing for the emulator-backed portal tests. Nothing here is mocked:
 * tokens come from the Auth emulator, handlers are the real route exports, and
 * data lives in the Firestore emulator. Run through `npm run test:portal`.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import { expect } from "vitest";
import type { GateNeed } from "@/lib/portal/server/gate";
import { resetRateLimits } from "@/lib/portal/server/rate-limit";
import type { StoredActivity } from "@/lib/portal/server/store";
import type { ApiErrorBody, AuditEntryDto } from "@/lib/portal/types";
import { DEMO_ADMINS, DEMO_PASSWORD, seed } from "../../scripts/portal/seed-emulator.mjs";

export const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";
export const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "";
export const PROJECT_ID = process.env.GCLOUD_PROJECT ?? "";

if (!AUTH_HOST || !FIRESTORE_HOST || !PROJECT_ID.startsWith("demo-")) {
  throw new Error(
    "The portal integration tests need the Firebase emulators. Run them with `npm run test:portal`.",
  );
}

// Read once, on the first handler call, and cached for the life of the process.
process.env.PORTAL_ADMIN_EMAILS = DEMO_ADMINS.join(",");

export { DEMO_PASSWORD };
export const ADMIN_ONE = DEMO_ADMINS[0];
export const ADMIN_TWO = DEMO_ADMINS[1];
export const AVERY = "avery.chen@uci.edu";
export const JORDAN = "jordan.patel@uci.edu";
export const MAYA = "maya.rodriguez@uci.edu";
export const SAM = "sam.okafor@uci.edu";
/** Disabled in the seed. */
export const RILEY = "riley.nguyen@uci.edu";
/** Never signed in, and has no password, in the seed. */
export const CASEY = "casey.kim@uci.edu";
/** The seeded actives: read-only viewers of the pledges' work. Priya is set up and can sign in. */
export const PRIYA = "priya.shah@uci.edu";
/** Invited, never signed in, and has no password, in the seed. */
export const MARCUS = "marcus.lee@uci.edu";
/** Disabled in the seed. */
export const DANA = "dana.ortiz@uci.edu";
/** Two admins, three actives and six pledges. */
export const SEEDED_ACCOUNTS = 11;
/** The one seeded team: Avery and Jordan are on it, everyone else works on their own. */
export const TEAM_ATLAS = "teamatlas";
export const TEAM_ATLAS_NAME = "Team Atlas";

export const DAY_SECONDS = 86_400;

/** Hook and test timeouts for files that talk to the emulators. */
export const SEED_TIMEOUT_MS = 90_000;
export const SLOW_TEST_MS = 60_000;

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ── Emulator access for fixtures and for checking what was really stored ─────

function testApp(): App {
  const name = "portal-tests";
  return getApps().find((app) => app.name === name) ?? initializeApp({ projectId: PROJECT_ID }, name);
}

export const testAuth = (): Auth => getAuth(testApp());
export const testDb = (): Firestore => getFirestore(testApp());

/** Wipes both emulators and re-creates the demo data. */
export async function seedPortal(): Promise<void> {
  await seed();
  resetRateLimits();
}

/**
 * A temporary password as the portal hands one out: three groups of four, from
 * an alphabet with no I, L, O, 0 or 1.
 */
export const TEMPORARY_PASSWORD = /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;

/** A password that meets every rule for anyone in these tests, and is nobody's seeded one. */
export const OWN_PASSWORD = "quiet-harbor-lantern-47";

/** The claims stored on a sign-in account, as opposed to the ones inside a token. */
export async function storedClaims(uid: string): Promise<Record<string, unknown> | null> {
  return (await testAuth().getUser(uid)).customClaims ?? null;
}

// ── Accounts on a temporary password ─────────────────────────────────────────

export const TEMPORARY_PASSWORD_MS = 72 * 60 * 60_000;

/**
 * What the portal puts on an account while it is on a temporary password, for
 * accounts these tests make by hand: the flag, and the time it was issued in
 * seconds, which is now unless `msAgo` says otherwise.
 */
export const temporaryNow = (msAgo = 0): { temp: true; tempAt: number } => ({ temp: true, tempAt: Math.floor((Date.now() - msAgo) / 1000) });

/**
 * The claims of a portal-made account on a temporary password, for `toEqual`:
 * exactly these and no others. `brandNew` is whether the account has yet to
 * finish its welcome, which the sign-in page reads to choose its greeting.
 */
export function temporaryClaims(role: "pledge" | "active", email: string, brandNew: boolean): Record<string, unknown> {
  return { role, issued: email, temp: true, tempAt: expect.any(Number), ...(brandNew ? { tempNew: true } : {}) };
}

/** Asserts that a temporary password's time of issue, in seconds, falls between two moments of this clock. */
export function expectIssuedBetween(claims: Record<string, unknown> | null, fromMs: number, toMs: number): void {
  const tempAt = claims?.tempAt;
  expect(typeof tempAt, "tempAt is a number").toBe("number");
  expect(Number.isInteger(tempAt), "tempAt is in whole seconds").toBe(true);
  // The request's own clock is read to the millisecond and stored to the second below it.
  expect(Number(tempAt)).toBeGreaterThanOrEqual(Math.floor(fromMs / 1000));
  expect(Number(tempAt)).toBeLessThanOrEqual(Math.floor(toMs / 1000));
}

/**
 * Moves the time an account's temporary password was issued, as if that long
 * had gone by, leaving every other claim as it is. Three days cannot be waited out.
 */
export async function issueTemporaryPasswordAgo(uid: string, msAgo: number): Promise<void> {
  const claims = await storedClaims(uid);
  if (claims?.temp !== true) throw new Error(`${uid} is not on a temporary password.`);
  await testAuth().setCustomUserClaims(uid, { ...claims, tempAt: Math.floor((Date.now() - msAgo) / 1000) });
}

/**
 * What a profile keeps of a temporary password the portal issued, for `toEqual`: a salt and
 * a hash of the password. Exactly these, and nothing of how Firebase stores the account's own.
 */
export const A_KEPT_FINGERPRINT = {
  salt: expect.stringMatching(/^[0-9a-f]{32}$/),
  hash: expect.stringMatching(/^[0-9a-f]{64}$/),
};

/**
 * The fingerprint a profile keeps of the temporary password its account was last given, if
 * any: every field of it, so that one with a field too many or too few does not pass for one.
 */
export async function storedFingerprint(uid: string): Promise<Record<string, unknown> | null> {
  const kept = (await docData(`users/${uid}`))?.temporaryPassword;
  return isRecord(kept) ? { ...kept } : null;
}

/** Every salt and hash the portal has stored, to search what it sends for. */
export async function everyStoredFingerprint(): Promise<string[]> {
  const snapshot = await testDb().collection("users").get();
  return snapshot.docs.flatMap((doc) => {
    const kept: unknown = doc.get("temporaryPassword");
    return isRecord(kept) ? [String(kept.salt), String(kept.hash)] : [];
  });
}

/**
 * Sets a password through a reset link the portal had no part in, as when "Reset password"
 * is used on the account in the Firebase console: a reset code is made for the address and
 * redeemed as the reset page redeems one. True when the code was taken. Unlike the portal's
 * own "Get password link", nothing on the account but its password changes.
 */
export async function setPasswordByResetLink(email: string, newPassword: string): Promise<boolean> {
  const link = await testAuth().generatePasswordResetLink(email);
  const oobCode = new URL(link).searchParams.get("oobCode") ?? "";
  return redeemResetCode(oobCode, newPassword);
}

/**
 * Changes a signed-in account's password through Firebase itself, with nothing but the
 * session's own ID token: what `updatePassword` does in the browser SDK. No link is emailed
 * and no mailbox is involved. True when Firebase took the new password.
 */
export async function changeOwnPassword(session: Session, newPassword: string): Promise<boolean> {
  const { ok } = await postIdentity("update", { idToken: session.token, password: newPassword, returnSecureToken: true });
  return ok;
}

/**
 * A profile like the one the portal makes along with an account, for accounts
 * these tests make by hand. Without one, an account cannot replace a temporary password.
 */
export async function createProfile(uid: string, email: string, role: "pledge" | "active", displayName = "Made By Hand"): Promise<void> {
  const now = Timestamp.now();
  await testDb().doc(`users/${uid}`).set({
    email,
    displayName,
    role,
    status: "active",
    pledgeClass: null,
    teamId: null,
    onboardedAt: null,
    createdAt: now,
    createdBy: "tests",
    updatedAt: now,
    submitted: {},
    activity: { firstSeenAt: null, lastSeenAt: null, totalActiveSeconds: 0, sessionCount: 0, current: null },
  });
}

export async function uidOf(email: string): Promise<string> {
  return (await testAuth().getUserByEmail(email)).uid;
}

export async function docExists(path: string): Promise<boolean> {
  return (await testDb().doc(path).get()).exists;
}

export async function docData(path: string): Promise<Record<string, unknown> | null> {
  const snapshot = await testDb().doc(path).get();
  return snapshot.exists ? (snapshot.data() ?? null) : null;
}

export async function countWhere(collection: string, field: string, value: string): Promise<number> {
  return (await testDb().collection(collection).where(field, "==", value).count().get()).data().count;
}

export async function countAll(collection: string): Promise<number> {
  return (await testDb().collection(collection).count().get()).data().count;
}

/** How many finished visits are stored for a pledge, under their own profile. */
export async function countSessions(uid: string): Promise<number> {
  return (await testDb().collection(`users/${uid}/sessions`).count().get()).data().count;
}

/**
 * Moves a pledge's visit so far into the past by `ms`, as if that much time
 * had gone by since their last heartbeat. The tests cannot wait out the real
 * intervals, which run to minutes.
 */
export async function ageLastHeartbeat(uid: string, ms: number): Promise<void> {
  const ref = testDb().doc(`users/${uid}`);
  const activity = (await ref.get()).get("activity") as StoredActivity | undefined;
  if (!activity?.lastSeenAt || !activity.current) {
    throw new Error(`${uid} has no visit in progress to age.`);
  }
  const earlier = (timestamp: Timestamp): Timestamp => Timestamp.fromMillis(timestamp.toMillis() - ms);
  await ref.update({
    "activity.lastSeenAt": earlier(activity.lastSeenAt),
    "activity.current.startedAt": earlier(activity.current.startedAt),
    "activity.current.lastSeenAt": earlier(activity.current.lastSeenAt),
  });
}

// ── Snapshots, for proving that something changed nothing ────────────────────

type Plain = string | number | boolean | null | Plain[] | { [key: string]: Plain };

/** Firestore data as plain values, with timestamps written out, so that two reads compare and diff cleanly. */
function plain(value: unknown): Plain {
  if (value instanceof Timestamp) return `timestamp:${value.toDate().toISOString()}`;
  if (Array.isArray(value)) return value.map(plain);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return String(value);
}

export const PORTAL_COLLECTIONS = ["users", "teams", "forms", "drafts", "submissions", "punishments", "auditLog", "previewCodes"] as const;
export type PortalCollection = (typeof PORTAL_COLLECTIONS)[number];

/** Every document of the named collections, keyed by its full path. */
export async function dumpCollections(names: readonly PortalCollection[]): Promise<Record<string, Plain>> {
  const dump: Record<string, Plain> = {};
  for (const name of names) {
    const snapshot = await testDb().collection(name).get();
    for (const doc of snapshot.docs) dump[doc.ref.path] = plain(doc.data());
  }
  return dump;
}

/** Everything the portal stores: every collection, every pledge's visit history, and the sign-in accounts. */
export async function dumpPortal(): Promise<{ firestore: Record<string, Plain>; accounts: Record<string, Plain> }> {
  const firestore = await dumpCollections(PORTAL_COLLECTIONS);
  const sessions = await testDb().collectionGroup("sessions").get();
  for (const doc of sessions.docs) firestore[doc.ref.path] = plain(doc.data());

  const accounts: Record<string, Plain> = {};
  const listed = await testAuth().listUsers(1000);
  for (const record of listed.users) {
    accounts[record.uid] = plain({
      email: record.email ?? null,
      displayName: record.displayName ?? null,
      emailVerified: record.emailVerified,
      disabled: record.disabled,
      claims: record.customClaims ?? null,
      // Changes when the account's sessions are revoked.
      tokensValidAfter: record.tokensValidAfterTime ?? null,
      passwordHash: record.passwordHash ?? null,
      secondFactors: record.multiFactor?.enrolledFactors.length ?? 0,
    });
  }
  return { firestore, accounts };
}

// ── Signing in ───────────────────────────────────────────────────────────────

export interface Session {
  email: string;
  uid: string;
  token: string;
}

const identityUrl = (method: string): string =>
  `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:${method}?key=demo-api-key`;

async function postIdentity(method: string, payload: Record<string, unknown>): Promise<{ ok: boolean; body: unknown }> {
  const response = await fetch(identityUrl(method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { ok: response.ok, body: (await response.json()) as unknown };
}

/** Signs in through the Auth emulator, exactly as the browser SDK would, and returns the ID token. */
export async function signIn(email: string, password: string = DEMO_PASSWORD): Promise<Session> {
  const { ok, body } = await postIdentity("signInWithPassword", { email, password, returnSecureToken: true });
  if (!ok || !isRecord(body) || typeof body.idToken !== "string" || typeof body.localId !== "string") {
    throw new Error(`Could not sign in as ${email}: ${JSON.stringify(body)}`);
  }
  return { email, uid: body.localId, token: body.idToken };
}

/** A sign-in together with the token the browser keeps to renew it. */
export interface RenewableSession extends Session {
  refreshToken: string;
  /** When the sign-in was made, by this clock, in milliseconds. */
  signedInAtMs: number;
}

/** Signs in and keeps the refresh token too, for following a session past its first ID token. */
export async function signInKeeping(email: string, password: string = DEMO_PASSWORD): Promise<RenewableSession> {
  const { ok, body } = await postIdentity("signInWithPassword", { email, password, returnSecureToken: true });
  if (!ok || !isRecord(body) || typeof body.idToken !== "string" || typeof body.localId !== "string" || typeof body.refreshToken !== "string") {
    throw new Error(`Could not sign in as ${email}: ${JSON.stringify(body)}`);
  }
  return { email, uid: body.localId, token: body.idToken, refreshToken: body.refreshToken, signedInAtMs: Date.now() };
}

/**
 * Renews a session's ID token the way the browser SDK does every hour, which is
 * when a session picks up claims that changed after it signed in. Null when
 * the session cannot be renewed.
 *
 * The emulator is not Firebase here, in two ways that matter. It renews any
 * session it is asked to, signed out or not. And it dates the renewed token by
 * the account's latest sign-in, whichever session that was, where Firebase
 * keeps the session's own. So a renewed token only stands in for the real one
 * when nobody has signed in to the account since: use it straight after the
 * sign-in it renews, and for nothing that a later sign-in would change.
 */
export async function renewed(session: RenewableSession): Promise<Session | null> {
  const response = await fetch(`http://${AUTH_HOST}/securetoken.googleapis.com/v1/token?key=demo-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: session.refreshToken }),
  });
  const body = (await response.json()) as unknown;
  if (!response.ok || !isRecord(body) || typeof body.id_token !== "string") return null;
  return { email: session.email, uid: session.uid, token: body.id_token };
}

/**
 * Waits for a new clock second to have just begun. Firebase ends sign-ins by
 * the whole second, so what a test does next, if it is quick, all falls within one.
 */
export async function startOfSecond(): Promise<void> {
  await sleep(1000 - (Date.now() % 1000) + 15);
}

/**
 * Signs in during the first part of a clock second, and says so only when it
 * managed to: the sign-in's own time is that second, and most of the second is
 * still to come. A request sent straight afterwards reaches the server within it.
 */
export async function signInEarlyInASecond(email: string, password: string = DEMO_PASSWORD): Promise<RenewableSession> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await startOfSecond();
    const session = await signInKeeping(email, password);
    const now = Date.now();
    if (now % 1000 < 350 && Number(claimsOf(session.token).auth_time) === Math.floor(now / 1000)) return session;
  }
  throw new Error(`Could not sign in as ${email} early enough in a clock second.`);
}

// ── A second factor, which the portal does not use ───────────────────────────

/**
 * A second factor as the Admin SDK attaches one to an account. The emulator
 * can hold one that works by text message. It has no authenticator-app kind.
 */
export const A_SECOND_FACTOR = { uid: "factor1", phoneNumber: "+15555550100", displayName: "Phone", factorId: "phone" };

/** How many second factors an account has attached. */
export async function secondFactorsOf(uid: string): Promise<number> {
  return (await testAuth().getUser(uid)).multiFactor?.enrolledFactors.length ?? 0;
}

/**
 * Attaches a second factor to an account through Firebase itself, behind the
 * portal's back. The portal has no way to do this, and no screen that asks for one.
 */
export async function attachSecondFactor(uid: string): Promise<void> {
  await testAuth().updateUser(uid, { multiFactor: { enrolledFactors: [A_SECOND_FACTOR] } });
  if ((await secondFactorsOf(uid)) !== 1) throw new Error(`The emulator did not keep a second factor on ${uid}.`);
}

/** Takes every second factor off an account through Firebase itself, to leave it as it was found. */
export async function detachSecondFactors(uid: string): Promise<void> {
  await testAuth().updateUser(uid, { multiFactor: { enrolledFactors: null } });
}

/**
 * True when the right email and password get no sign-in, only a challenge for
 * a second step: what Firebase answers for an account with a second factor
 * attached. The portal has no second step, so such an account cannot get in.
 */
export async function signInStopsAtSecondFactor(email: string, password: string = DEMO_PASSWORD): Promise<boolean> {
  const { ok, body } = await postIdentity("signInWithPassword", { email, password, returnSecureToken: true });
  return ok && isRecord(body) && typeof body.mfaPendingCredential === "string" && body.idToken === undefined;
}

/** The Auth emulator's error code for a sign-in that is expected to fail, e.g. "USER_DISABLED". */
export async function signInFailure(email: string, password: string = DEMO_PASSWORD): Promise<string> {
  const { ok, body } = await postIdentity("signInWithPassword", { email, password, returnSecureToken: true });
  if (ok) throw new Error(`Expected sign-in as ${email} to fail, but it succeeded.`);
  const error = isRecord(body) && isRecord(body.error) ? body.error.message : null;
  return typeof error === "string" ? error : JSON.stringify(body);
}

/** Completes a set-password link the way the reset page does. */
export async function redeemResetCode(oobCode: string, newPassword: string): Promise<boolean> {
  const { ok } = await postIdentity("resetPassword", { oobCode, newPassword });
  return ok;
}

/** Creates a sign-in account directly, for cases the portal itself would never create. */
export async function createAccount(
  email: string,
  options: { verified?: boolean; claims?: Record<string, unknown> } = {},
): Promise<Session> {
  const record = await testAuth().createUser({
    email,
    password: DEMO_PASSWORD,
    emailVerified: options.verified ?? true,
  });
  if (options.claims) await testAuth().setCustomUserClaims(record.uid, options.claims);
  return signIn(email);
}

/** Rebuilds an emulator ID token with some claims changed. Emulator tokens are unsigned. */
export function withClaims(token: string, changes: Record<string, unknown>): string {
  const [header, payload] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  const encoded = Buffer.from(JSON.stringify({ ...claims, ...changes })).toString("base64url");
  return `${header}.${encoded}.`;
}

/**
 * Makes the Auth emulator accept this account's tokens from `ms` further back.
 * An account's tokens count from the moment it was created or last signed out,
 * and every account here was created seconds ago, so without this a token that
 * says its sign-in was hours ago is refused as revoked before the portal's own
 * rule about the age of a sign-in is ever reached.
 */
export async function acceptTokensFrom(uid: string, msAgo: number): Promise<void> {
  const response = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify({ localId: uid, validSince: String(Math.floor((Date.now() - msAgo) / 1000)) }),
  });
  if (!response.ok) throw new Error(`Could not move the token start time for ${uid}: ${await response.text()}`);
}

/** The claims inside an ID token. */
export function claimsOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
}

// ── Calling route handlers ───────────────────────────────────────────────────

export type Handler<P> = (request: Request, route: { params: Promise<P> }) => Promise<Response>;

export interface CallOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Sent as `Authorization: Bearer <token>`. Omit for an anonymous request. */
  token?: string;
  /** The whole Authorization header, for malformed credentials. Wins over `token`. */
  authorization?: string;
  /** Serialized as JSON. Requests with a body default to `{}`, like the portal's own client. */
  body?: unknown;
  /** Sent exactly as given instead of `body`. */
  rawBody?: string;
  /** Defaults to application/json for requests with a body. Null sends no Content-Type at all. */
  contentType?: string | null;
  headers?: Record<string, string>;
  /** Including the leading "?". */
  query?: string;
}

export interface ApiResult {
  status: number;
  body: unknown;
  text: string;
  headers: Headers;
}

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

// ── What no response may carry ───────────────────────────────────────────────

/** Every key of a JSON value at any depth, with what it holds. */
function keysWithin(value: unknown, found: Array<[string, unknown]> = []): Array<[string, unknown]> {
  if (Array.isArray(value)) value.forEach((item) => keysWithin(item, found));
  else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      found.push([key, item]);
      keysWithin(item, found);
    }
  }
  return found;
}

/**
 * The only routes that send a temporary password: the two that create an
 * account, which say `null` when it starts by link, the two that issue one,
 * and the one that trades a preview link for the preview account's.
 */
export const HANDS_OUT_A_TEMPORARY_PASSWORD: readonly string[] = [
  "POST /admin/pledges",
  "POST /admin/actives",
  "POST /admin/pledges/[uid]/temporary-password",
  "POST /admin/actives/[uid]/temporary-password",
  "POST /preview/redeem",
];

/**
 * A profile keeps a fingerprint of the temporary password its account was last
 * given, as a salt and a hash under `temporaryPassword`, and that never leaves
 * the server. Says what is wrong with a response body that carries any of it,
 * or a `temporaryPassword` it should not, and null when there is nothing.
 */
export function fingerprintLeak(body: unknown, handsOutATemporaryPassword: boolean): string | null {
  for (const [key, value] of keysWithin(body)) {
    if (key === "salt" || key === "hash") return `it has a "${key}"`;
    if (key !== "temporaryPassword") continue;
    // The portal keeps nothing of the account's own password beside the fingerprint. Were it to,
    // under `account`, that would be no more for sending than the rest. The name is harmless
    // anywhere else, so it is looked for only here, and said first so that it goes by its own name.
    if (isRecord(value) && "account" in value) return 'its "temporaryPassword" has an "account"';
    if (!handsOutATemporaryPassword) return 'it has a "temporaryPassword", and is not from a route that hands one out';
    if (value !== null && !(typeof value === "string" && TEMPORARY_PASSWORD.test(value))) {
      return 'its "temporaryPassword" is not a temporary password';
    }
  }
  return null;
}

let routeLabels: Promise<Map<unknown, string>> | null = null;

/** Which route a handler is, by the function itself. Null for a handler that is not one of the portal's. */
async function labelOf(handler: unknown): Promise<string | null> {
  routeLabels ??= discoverRoutes().then((routes) => new Map(routes.map((route) => [route.handler as unknown, route.label])));
  return (await routeLabels).get(handler) ?? null;
}

/**
 * Calls a route handler export directly with a real Request, as Next.js would.
 * Every response that comes back, whatever its status and whichever test asked
 * for it, is checked for the fingerprint of a temporary password.
 */
export async function call<P extends Record<string, string>>(
  handler: Handler<P>,
  params: P,
  options: CallOptions = {},
): Promise<ApiResult> {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers);
  if (options.authorization !== undefined) headers.set("authorization", options.authorization);
  else if (options.token !== undefined) headers.set("authorization", `Bearer ${options.token}`);

  let body: string | undefined;
  if (BODY_METHODS.has(method)) {
    body = options.rawBody ?? JSON.stringify(options.body ?? {});
    if (options.contentType !== null) headers.set("content-type", options.contentType ?? "application/json");
  }

  const request = new Request(`http://localhost/api/portal/under-test${options.query ?? ""}`, {
    method,
    headers,
    body,
  });
  // A body-less or typeless request must really carry no Content-Type.
  if (options.contentType === null) request.headers.delete("content-type");

  const response = await handler(request, { params: Promise.resolve(params) });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    parsed = null;
  }

  const label = await labelOf(handler);
  const leak = fingerprintLeak(parsed, label !== null && HANDS_OUT_A_TEMPORARY_PASSWORD.includes(label));
  expect(leak, `${label ?? "a handler that is not one of the portal's routes"} answered ${response.status}, and ${leak}: ${text.slice(0, 300)}`).toBeNull();

  return { status: response.status, body: parsed, text, headers: response.headers };
}

/** Asserts a 200 and returns the body typed as the DTO the caller expects. */
export function ok<T>(result: ApiResult): T {
  expect(result.status, `expected 200, got ${result.status}: ${result.text}`).toBe(200);
  return result.body as T;
}

/** Asserts an error response with this status and code, and returns its body. */
export function refused(result: ApiResult, status: number, code: string): ApiErrorBody {
  const body = isRecord(result.body) ? result.body : {};
  expect({ status: result.status, code: body.code }, result.text).toEqual({ status, code });
  expect(typeof body.error).toBe("string");
  return result.body as ApiErrorBody;
}

/** `path:code` for each field issue of a 422, sorted, for compact comparisons. */
export function fieldCodes(body: ApiErrorBody): string[] {
  return (body.fields ?? []).map((field) => `${field.path}:${field.code}`).sort();
}

// ── Audit log ────────────────────────────────────────────────────────────────

/** Reads audit entries straight from Firestore, newest first, to check what admin actions recorded. */
export async function storedAudit(): Promise<Array<Omit<AuditEntryDto, "at"> & { actorUid: string }>> {
  const snapshot = await testDb().collection("auditLog").orderBy("at", "desc").get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      actorUid: String(data.actorUid),
      actorEmail: String(data.actorEmail),
      action: String(data.action),
      targetType: data.targetType as AuditEntryDto["targetType"],
      targetId: String(data.targetId),
      summary: String(data.summary),
    };
  });
}

/** A JSON body of exactly `bytes` bytes that every handler will otherwise accept. */
export function paddedJson(bytes: number, fields: Record<string, unknown> = {}): string {
  const shell = JSON.stringify({ ...fields, pad: "" });
  const padding = bytes - Buffer.byteLength(shell, "utf8");
  if (padding < 0) throw new Error(`Cannot build a ${bytes}-byte body from these fields.`);
  return JSON.stringify({ ...fields, pad: "x".repeat(padding) });
}

// ── Every route handler on disk, so a route added later is covered automatically ──

export type AnyHandler = Handler<Record<string, string>>;
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** Who a route is for: one role, anyone signed in, or, for the one route that needs no sign-in, anyone at all. */
export type RouteNeed = GateNeed | "public";

export interface DiscoveredRoute {
  /** For example "PATCH /admin/teams/[teamId]". */
  label: string;
  /** The route's path under /api/portal, for example "admin/teams/[teamId]". */
  path: string;
  method: Method;
  handler: AnyHandler;
  /** The names of the dynamic segments, each given a placeholder id. */
  params: Record<string, string>;
  /** Who the route is for, going by where it is: one role, anyone signed in, or anyone at all. */
  need: RouteNeed;
  /** Everything the route's module exports, handler or not. */
  moduleExports: string[];
}

const API_ROOT = fileURLToPath(new URL("../../src/app/api/portal", import.meta.url));
/**
 * The routes that every role is let through to. Two of them then decide for
 * themselves: the welcome is for pledges and actives, and choosing a password
 * is only for an account that is still on a temporary one.
 */
const OPEN_TO_ANY_ROLE = new Set(["me", "heartbeat", "sign-out", "onboarding", "password"]);
/**
 * The routes that need no sign-in at all. Only the one that trades a preview
 * link for the preview account's sign-in, where the code in the link is the
 * credential. Every test that calls every route with a token leaves these out.
 */
export const PUBLIC_ROUTES = new Set(["preview/redeem"]);

/**
 * Each role's routes sit in a folder of their own: /admin for admins and
 * /review for actives. Everything else that is not shared is a pledge's.
 */
function needOf(relative: string): RouteNeed {
  if (PUBLIC_ROUTES.has(relative)) return "public";
  if (relative.startsWith("admin/")) return "admin";
  if (relative.startsWith("review/")) return "active";
  return OPEN_TO_ANY_ROLE.has(relative) ? "any" : "pledge";
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

export async function discoverRoutes(): Promise<DiscoveredRoute[]> {
  const routes: DiscoveredRoute[] = [];
  for (const file of routeFiles(API_ROOT).sort()) {
    const relative = path.relative(API_ROOT, path.dirname(file)).split(path.sep).join("/");
    const params = Object.fromEntries(
      relative
        .split("/")
        .filter((segment) => /^\[.+\]$/.test(segment))
        .map((segment) => [segment.slice(1, -1), "abc123"]),
    );
    const need = needOf(relative);
    const exports: Record<string, unknown> = await import(/* @vite-ignore */ file);
    const moduleExports = Object.keys(exports).sort();
    for (const method of METHODS) {
      const handler = exports[method];
      if (typeof handler === "function") {
        routes.push({ label: `${method} /${relative}`, path: relative, method, handler: handler as AnyHandler, params, need, moduleExports });
      }
    }
  }
  return routes;
}
