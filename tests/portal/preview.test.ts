/**
 * An admin's preview account: a sandbox pledge or active, one per admin, for
 * going through a new member's first visit. Tests run in order from a fresh
 * seed: the first admin starts a pledge preview, the link is redeemed and the
 * account taken through its first visit and a deliverable, every list the
 * portal makes is shown to be exactly as it was before the account existed,
 * the account is started over, switched to an active, and removed.
 *
 * The one route that needs no sign-in, redeeming the link, is called here
 * with no token at all, as the sign-in page calls it.
 */
import { Timestamp } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listActives } from "@/app/api/portal/admin/actives/route";
import { GET as getResponses } from "@/app/api/portal/admin/forms/[formId]/responses/route";
import { DELETE as deleteAdminForm, GET as getAdminForm, PUT as saveAdminForm } from "@/app/api/portal/admin/forms/[formId]/route";
import { GET as listForms, POST as createForm } from "@/app/api/portal/admin/forms/route";
import { GET as listPeople } from "@/app/api/portal/admin/people/route";
import { POST as addPunishment } from "@/app/api/portal/admin/pledges/[uid]/punishments/route";
import { DELETE as removePledge, GET as getPledgeDetail, PATCH as updatePledge } from "@/app/api/portal/admin/pledges/[uid]/route";
import { GET as getOverview } from "@/app/api/portal/admin/pledges/route";
import { DELETE as removePreview, GET as getPreview, POST as startPreview } from "@/app/api/portal/admin/preview/route";
import { PATCH as updateTeam } from "@/app/api/portal/admin/teams/[teamId]/route";
import { POST as createTeam } from "@/app/api/portal/admin/teams/route";
import { GET as getDashboard } from "@/app/api/portal/dashboard/route";
import { GET as getForm } from "@/app/api/portal/forms/[formId]/route";
import { POST as submit } from "@/app/api/portal/forms/[formId]/submit/route";
import { POST as heartbeat } from "@/app/api/portal/heartbeat/route";
import { GET as getMe } from "@/app/api/portal/me/route";
import { POST as completeOnboarding } from "@/app/api/portal/onboarding/route";
import { POST as choosePassword } from "@/app/api/portal/password/route";
import { POST as redeemPreview } from "@/app/api/portal/preview/redeem/route";
import { GET as getReviewForm } from "@/app/api/portal/review/forms/[formId]/route";
import { GET as getReviewOverview } from "@/app/api/portal/review/overview/route";
import { TIMING } from "@/lib/portal/constants";
import { previewAccount } from "@/lib/portal/preview";
import { hashPreviewCode, newPreviewCode } from "@/lib/portal/server/preview-codes";
import { RATE_LIMITS, resetRateLimits } from "@/lib/portal/server/rate-limit";
import type {
  AdminFormDto,
  AdminFormsDto,
  AdminOverviewDto,
  Answers,
  DashboardDto,
  FormResponsesDto,
  MeDto,
  PeopleDto,
  PledgeDetailDto,
  PledgeFormDto,
  PreviewRedeemDto,
  PreviewStartResultDto,
  PreviewStateDto,
  PreviewStatusDto,
  PunishmentDto,
} from "@/lib/portal/types";
import {
  ADMIN_ONE,
  ADMIN_TWO,
  AVERY,
  A_KEPT_FINGERPRINT,
  OWN_PASSWORD,
  PRIYA,
  SEEDED_ACCOUNTS,
  SEED_TIMEOUT_MS,
  SLOW_TEST_MS,
  TEAM_ATLAS,
  TEMPORARY_PASSWORD,
  call,
  countAll,
  countSessions,
  countWhere,
  createAccount,
  createProfile,
  docData,
  docExists,
  dumpCollections,
  dumpPortal,
  expectIssuedBetween,
  fieldCodes,
  ok,
  refused,
  seedPortal,
  signIn,
  signInFailure,
  storedAudit,
  storedClaims,
  storedFingerprint,
  temporaryClaims,
  testAuth,
  testDb,
  type ApiResult,
  type Session,
} from "./helpers";

const FORM_IDS = ["week0onboarding", "week1reflection", "week2interviews", "week2synthesis", "week3mvpscope", "pitchfeedback"];
const PREVIEW_CODE = /^[A-Za-z0-9_-]{43}$/;
/** A temporary password anywhere in a longer text, as TEMPORARY_PASSWORD only matches a whole string. */
const PASSWORD_ANYWHERE = /[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}/;
const CANT_JOIN = "A preview account can't join a team.";
const LINK_GONE = "This preview link has expired or was already used. Go back to the People page and start the preview again.";
const STATE_KEYS = ["createdAt", "displayName", "email", "role", "stage", "uid"];
const PROFILE_KEYS = ["activity", "createdAt", "createdBy", "displayName", "email", "onboardedAt", "pledgeClass", "role", "status", "submitted", "teamId", "updatedAt"];
const PREVIEW_PROFILE_KEYS = [...PROFILE_KEYS, "previewOwnerEmail", "previewOwnerUid", "temporaryPassword"].sort();
const NO_ACTIVITY = { firstSeenAt: null, lastSeenAt: null, totalActiveSeconds: 0, sessionCount: 0, current: null };

const INTERVIEWS: Answers = {
  q_count: { kind: "text", value: "3" },
  q_date: { kind: "text", value: "2026-10-09" },
  q_surprise: { kind: "text", value: "PREVIEW-ONLY-ANSWER-55120: how little people cared about the dashboard." },
  q_notes: { kind: "text", value: "https://docs.google.com/document/d/preview-interview-notes" },
};

let admin: Session;
let adminTwo: Session;
let priya: Session;
let avery: Session;

/** Everything an admin or an active can list, keyed by what it is, with the clock taken out. */
type Listings = Record<string, unknown>;

const state = (token = admin.token): Promise<ApiResult> => call(getPreview, {}, { token });
const start = (role: unknown, token = admin.token): Promise<ApiResult> =>
  call(startPreview, {}, { method: "POST", token, body: { role } });
const remove = (token = admin.token): Promise<ApiResult> => call(removePreview, {}, { method: "DELETE", token });
/** As the sign-in page calls it: no token. */
const redeem = (code: unknown): Promise<ApiResult> => call(redeemPreview, {}, { method: "POST", body: { code } });
const people = async (token = admin.token): Promise<PeopleDto> => ok<PeopleDto>(await call(listPeople, {}, { token }));
const latestAudit = async () => (await storedAudit())[0];
const auditOf = async (action: string) => (await storedAudit()).filter((entry) => entry.action === action);

/** Every text an admin, an active, or a pledge on a team is sent, with the parts that move taken out. */
async function everyListing(): Promise<Listings> {
  const strip = (body: unknown, ...keys: string[]): Record<string, unknown> => {
    const copy: Record<string, unknown> = { ...(body as Record<string, unknown>) };
    for (const key of ["serverNow", ...keys]) delete copy[key];
    return copy;
  };
  const listings: Listings = {
    overview: strip(ok<AdminOverviewDto>(await call(getOverview, {}, { token: admin.token }))),
    actives: strip(ok(await call(listActives, {}, { token: admin.token }))),
    // The caller's own preview account is shown on the people page by design, on its own card.
    people: strip(await people(), "preview"),
    forms: strip(ok(await call(listForms, {}, { token: admin.token }))),
    reviewOverview: strip(ok(await call(getReviewOverview, {}, { token: priya.token }))),
    averysTeam: ok<MeDto>(await call(getMe, {}, { token: avery.token })).team,
  };
  for (const formId of FORM_IDS) {
    listings[`form:${formId}`] = strip(ok(await call(getAdminForm, { formId }, { token: admin.token })));
    listings[`responses:${formId}`] = strip(ok(await call(getResponses, { formId }, { token: admin.token })));
    const review = await call(getReviewForm, { formId }, { token: priya.token });
    listings[`review:${formId}`] = review.status === 200 ? strip(review.body) : review.status;
  }
  return listings;
}

/** Where a value turns up in a listing, by the listing's name. */
function listingsNaming(listings: Listings, value: string): string[] {
  return Object.entries(listings)
    .filter(([, body]) => JSON.stringify(body).includes(value))
    .map(([name]) => name);
}

beforeAll(async () => {
  await seedPortal();
  [admin, adminTwo, priya, avery] = await Promise.all([ADMIN_ONE, ADMIN_TWO, PRIYA, AVERY].map((email) => signIn(email)));
}, SEED_TIMEOUT_MS);

beforeEach(() => {
  resetRateLimits();
});

/** The lists as the seed leaves them, before any preview account exists. */
let listingsBefore: Listings;
let portalBefore: Awaited<ReturnType<typeof dumpPortal>>;

describe("before any preview", () => {
  it("takes stock of every list and everything stored", async () => {
    listingsBefore = await everyListing();
    portalBefore = await dumpPortal();
    expect(Object.keys(listingsBefore)).toHaveLength(6 + 3 * FORM_IDS.length);
    expect(Object.keys(portalBefore.accounts)).toHaveLength(SEEDED_ACCOUNTS);
  });

  it("says there is none, on the preview route and on the people page", async () => {
    expect(ok<PreviewStatusDto>(await state())).toEqual({ preview: null });
    expect((await people()).preview).toBeNull();
    expect(refused(await remove(), 404, "not_found").error).toBe("You don't have a preview account.");
  });

  it.each<[string, unknown]>([
    ["no role", undefined],
    ["an admin", "admin"],
    ["an unknown role", "viewer"],
    ["the role in the wrong case", "Pledge"],
    ["a list", ["pledge"]],
    ["a number", 1],
  ])("refuses to start with %s, and makes nothing", async (_label, role) => {
    const body = refused(await start(role), 422, "invalid");
    expect(fieldCodes(body)).toEqual(["role:invalid"]);
    expect(await countAll("users")).toBe(SEEDED_ACCOUNTS);
    expect(await countAll("previewCodes")).toBe(0);
  });

  it("is an admin's alone", async () => {
    refused(await state(priya.token), 403, "forbidden");
    refused(await start("pledge", avery.token), 403, "forbidden");
    refused(await remove(priya.token), 403, "forbidden");
    expect(await countAll("users")).toBe(SEEDED_ACCOUNTS);
  });

  // The sandbox's address is the admin's own with a tag. For an admin on another
  // domain that would be a stranger's UCI mailbox, so no sandbox is made.
  it("refuses an admin whose own address is not a UCI one, and makes nothing", async () => {
    const outside = await createAccount("advisor@example.org", { claims: { role: "admin", granted: true } });
    await createProfile(outside.uid, "advisor@example.org", "active", "Outside Advisor");
    await testDb().doc(`users/${outside.uid}`).update({ role: "admin" });
    try {
      for (const role of ["pledge", "active"]) {
        const body = refused(await start(role, outside.token), 422, "preview_needs_uci");
        expect(body.error).toBe("Previews need an admin account with a UCI address.");
        expect(body.fields).toEqual([{ path: "role", code: "invalid", message: "Previews need an admin account with a UCI address." }]);
      }
      expect(await countAll("users")).toBe(SEEDED_ACCOUNTS + 1);
      expect(await countAll("previewCodes")).toBe(0);
      expect(ok<PreviewStatusDto>(await state(outside.token))).toEqual({ preview: null });
      await expect(testAuth().getUserByEmail("advisor+preview-pledge@uci.edu")).rejects.toMatchObject({ code: "auth/user-not-found" });
      expect(await auditOf("preview.start")).toEqual([]);
    } finally {
      await testAuth().deleteUser(outside.uid);
      await testDb().doc(`users/${outside.uid}`).delete();
    }
    expect(await countAll("users")).toBe(SEEDED_ACCOUNTS);
  });
});

describe("starting a preview as a pledge", () => {
  let started: PreviewStartResultDto;
  let uid: string;
  let email: string;

  it("makes the account and hands back a one-time code and the account's state", async () => {
    const from = Date.now();
    const result = await start("pledge");
    started = ok<PreviewStartResultDto>(result);
    expect(Object.keys(started).sort()).toEqual(["code", "expiresAt", "preview"]);
    expect(started.code).toMatch(PREVIEW_CODE);
    expect(Date.parse(started.expiresAt) - from).toBeGreaterThanOrEqual(TIMING.previewCodeMs - 1000);
    expect(Date.parse(started.expiresAt) - Date.now()).toBeLessThanOrEqual(TIMING.previewCodeMs);

    const expected = previewAccount(ADMIN_ONE, admin.uid, "pledge");
    ({ uid, email } = expected);
    expect(uid).toBe(`previewpledge${admin.uid}`);
    expect(email).toBe("chair.one+preview-pledge@uci.edu");
    expect(Object.keys(started.preview).sort()).toEqual(STATE_KEYS);
    expect(started.preview).toMatchObject({ uid, role: "pledge", email, displayName: "Preview Pledge", stage: "ready" });
    expect(Math.abs(Date.parse(started.preview.createdAt) - Date.now())).toBeLessThan(60_000);
    // No password is in the answer: none exists yet. Opening the link is what makes one.
    expect(result.text).not.toMatch(PASSWORD_ANYWHERE);
    expect(result.text).not.toMatch(/temporaryPassword|salt|hash/);
  });

  it("stores a pledge's profile, marked as the admin's, with the fingerprint of its temporary password", async () => {
    const profile = await docData(`users/${uid}`);
    expect(profile).toMatchObject({
      email,
      displayName: "Preview Pledge",
      role: "pledge",
      status: "active",
      pledgeClass: null,
      teamId: null,
      onboardedAt: null,
      createdBy: admin.uid,
      submitted: {},
      activity: NO_ACTIVITY,
      previewOwnerUid: admin.uid,
      previewOwnerEmail: ADMIN_ONE,
    });
    expect(Object.keys(profile ?? {}).sort()).toEqual(PREVIEW_PROFILE_KEYS);
    expect(await storedFingerprint(uid)).toEqual(A_KEPT_FINGERPRINT);
    expect(await countAll("users")).toBe(SEEDED_ACCOUNTS + 1);
  });

  it("makes a sign-in account on a temporary password, with a new pledge's claims", async () => {
    const record = await testAuth().getUser(uid);
    expect(record.email).toBe(email);
    expect(record.displayName).toBe("Preview Pledge");
    expect(record.emailVerified).toBe(true);
    expect(record.disabled).toBe(false);
    expect(record.passwordHash).toBeDefined();
    expect(record.customClaims).toEqual(temporaryClaims("pledge", email, true));
  });

  it("stores only the hash of the code, naming the account it opens, for five minutes, and no password at all", async () => {
    expect(await countAll("previewCodes")).toBe(1);
    const stored = await docData(`previewCodes/${hashPreviewCode(started.code)}`);
    expect(Object.keys(stored ?? {}).sort()).toEqual(["email", "expiresAt", "ownerUid", "role", "uid"]);
    expect(stored).toMatchObject({ ownerUid: admin.uid, uid, email, role: "pledge" });
    const expiresAt = stored?.expiresAt as Timestamp;
    expect(expiresAt.toMillis()).toBe(Date.parse(started.expiresAt));
    // Neither the code nor any temporary password is anywhere in the database.
    const everything = JSON.stringify(await dumpCollections(["users", "previewCodes", "auditLog"]));
    expect(everything).not.toContain(started.code);
    expect(everything).not.toMatch(PASSWORD_ANYWHERE);
  });

  it("records the start, without the code", async () => {
    expect(await latestAudit()).toMatchObject({
      action: "preview.start",
      targetType: "user",
      targetId: uid,
      actorUid: admin.uid,
      actorEmail: ADMIN_ONE,
      summary: `Started a preview as a new pledge, ${email}`,
    });
    const log = JSON.stringify(await storedAudit());
    expect(log).not.toContain(started.code);
    expect(log).not.toMatch(PASSWORD_ANYWHERE);
  });

  it("shows it on the preview route and the people page, to its owner alone", async () => {
    expect(ok<PreviewStatusDto>(await state())).toEqual({ preview: started.preview });
    expect((await people()).preview).toEqual(started.preview);
    // The other admin has none, sees none, and has none to remove.
    expect(ok<PreviewStatusDto>(await state(adminTwo.token))).toEqual({ preview: null });
    expect((await people(adminTwo.token)).preview).toBeNull();
    refused(await remove(adminTwo.token), 404, "not_found");
    expect(await docExists(`users/${uid}`)).toBe(true);
  });

  it("is in no list, and on nobody's page, from the moment it exists", async () => {
    const now = await everyListing();
    expect(now).toEqual(listingsBefore);
    for (const value of [uid, email, "Preview Pledge"]) expect(listingsNaming(now, value), value).toEqual([]);
  });
});

describe("redeeming the link", () => {
  let code: string;
  let redeemed: PreviewRedeemDto;

  it.each<[string, unknown]>([
    ["no code", undefined],
    ["an empty code", ""],
    ["a number", 12345],
    ["a code that was never made", newPreviewCode()],
    ["a code one character short", "a".repeat(42)],
    ["a code with a character outside the alphabet", `${"a".repeat(42)}+`],
    ["a list", [newPreviewCode()]],
  ])("refuses %s with 404, all alike, and keeps the real code", async (_label, bad) => {
    const body = refused(await redeem(bad), 404, "preview_code_invalid");
    expect(body.error).toBe(LINK_GONE);
    expect(Object.keys(body).sort()).toEqual(["code", "error"]);
    expect(await countAll("previewCodes")).toBe(1);
  });

  it("refuses a body that is not an object just the same", async () => {
    for (const rawBody of ["[1, 2]", '"abc"', "null"]) {
      refused(await call(redeemPreview, {}, { method: "POST", rawBody }), 404, "preview_code_invalid");
    }
  });

  it("hands the sign-in out to whoever has the code, with no token, exactly once, issuing the password on the spot", async () => {
    // Started over so that this file holds the code: the account is reset, which is its own test below.
    const again = ok<PreviewStartResultDto>(await start("pledge"));
    code = again.code;
    const { uid } = again.preview;
    expect(await countAll("previewCodes")).toBe(1);
    const fingerprintBefore = await storedFingerprint(uid);
    const passwordBefore = (await testAuth().getUser(uid)).passwordHash;

    const from = Date.now();
    const result = await redeem(code);
    redeemed = ok<PreviewRedeemDto>(result);
    expect(Object.keys(redeemed).sort()).toEqual(["email", "role", "temporaryPassword"]);
    expect(redeemed).toMatchObject({ email: again.preview.email, role: "pledge" });
    expect(redeemed.temporaryPassword).toMatch(TEMPORARY_PASSWORD);
    expect(await countAll("previewCodes")).toBe(0);

    // The account was given that password just now, as an admin would give one: a new
    // flag with the time of issue, a new fingerprint, and a new password on the account.
    const claims = await storedClaims(uid);
    expect(claims).toEqual(temporaryClaims("pledge", redeemed.email, true));
    expectIssuedBetween(claims, from, Date.now());
    expect(await storedFingerprint(uid)).toEqual(A_KEPT_FINGERPRINT);
    expect(await storedFingerprint(uid)).not.toEqual(fingerprintBefore);
    expect((await testAuth().getUser(uid)).passwordHash).not.toBe(passwordBefore);
    // Still nowhere at rest.
    expect(JSON.stringify(await dumpCollections(["users", "previewCodes", "auditLog"]))).not.toMatch(PASSWORD_ANYWHERE);

    expect(refused(await redeem(code), 404, "preview_code_invalid").error).toBe(LINK_GONE);
    expect(await storedClaims(uid)).toEqual(claims);
  });

  it("the password it handed out is the account's", async () => {
    const session = await signIn(redeemed.email, redeemed.temporaryPassword);
    expect(session.uid).toBe(`previewpledge${admin.uid}`);
  });

  // The code names the account it was made for. If that account is no longer the
  // preview it was, or is not that admin's, the code is spent and nothing is issued.
  it("spends a code whose account is not the preview it was made for, and issues nothing", async () => {
    const averyBefore = await testAuth().getUser(avery.uid);
    const theirs = ok<PreviewStartResultDto>(await start("pledge", adminTwo.token));
    const pointedAtAvery = testDb().doc(`previewCodes/${hashPreviewCode(theirs.code)}`);
    await pointedAtAvery.update({ uid: avery.uid, email: AVERY });
    expect(refused(await redeem(theirs.code), 404, "preview_code_invalid").error).toBe(LINK_GONE);
    expect((await pointedAtAvery.get()).exists).toBe(false);
    // Avery's sign-in is exactly as it was: the same password, claims and sessions.
    const averyAfter = await testAuth().getUser(avery.uid);
    expect(averyAfter.passwordHash).toBe(averyBefore.passwordHash);
    expect(averyAfter.customClaims).toEqual({ role: "pledge", issued: AVERY });
    expect(averyAfter.tokensValidAfterTime).toBe(averyBefore.tokensValidAfterTime);
    expect(await storedFingerprint(avery.uid)).toBeNull();
    ok(await call(getMe, {}, { token: avery.token }));

    // Pointed at a preview account that is another admin's, it is refused just the same.
    const again = ok<PreviewStartResultDto>(await start("pledge", adminTwo.token));
    const theirClaims = await storedClaims(again.preview.uid);
    await testDb().doc(`previewCodes/${hashPreviewCode(again.code)}`).update({ ownerUid: admin.uid });
    refused(await redeem(again.code), 404, "preview_code_invalid");
    expect(await countWhere("previewCodes", "ownerUid", admin.uid)).toBe(0);
    expect(await storedClaims(again.preview.uid)).toEqual(theirClaims);
    // And at an account that does not exist at all.
    const gone = ok<PreviewStartResultDto>(await start("pledge", adminTwo.token));
    await testDb().doc(`previewCodes/${hashPreviewCode(gone.code)}`).update({ uid: "nobody123" });
    refused(await redeem(gone.code), 404, "preview_code_invalid");
    expect(await countAll("previewCodes")).toBe(0);
  });

  it("refuses a code that has expired, and deletes it", async () => {
    const theirs = ok<PreviewStartResultDto>(await start("pledge", adminTwo.token));
    const ref = testDb().doc(`previewCodes/${hashPreviewCode(theirs.code)}`);
    await ref.update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    expect(refused(await redeem(theirs.code), 404, "preview_code_invalid").error).toBe(LINK_GONE);
    expect((await ref.get()).exists).toBe(false);
    // Their account is still there to start over with.
    expect(ok<PreviewStatusDto>(await state(adminTwo.token)).preview).toMatchObject({ role: "pledge", stage: "ready" });
  });

  it("refuses a code that says it expires impossibly far ahead, which the portal never wrote", async () => {
    const theirs = ok<PreviewStartResultDto>(await start("pledge", adminTwo.token));
    await testDb().doc(`previewCodes/${hashPreviewCode(theirs.code)}`).update({ expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60_000) });
    refused(await redeem(theirs.code), 404, "preview_code_invalid");
    expect(await countWhere("previewCodes", "ownerUid", adminTwo.uid)).toBe(0);
  });

  it("is held to a ceiling per address: the request past the ceiling for changes is refused, whatever it sends", async () => {
    resetRateLimits();
    for (let index = 0; index < RATE_LIMITS.writesPerMinute; index += 1) {
      refused(await redeem(newPreviewCode()), 404, "preview_code_invalid");
    }
    const refusal = refused(await redeem(newPreviewCode()), 429, "rate_limited");
    expect(refusal.error).toBe("Too many requests. Wait a minute and try again.");
    // Another address is not held back by it: one flooding client does not shut the route for everyone.
    refused(await call(redeemPreview, {}, { method: "POST", body: { code: newPreviewCode() }, headers: { "x-forwarded-for": "203.0.113.9" } }), 404, "preview_code_invalid");
  });

  it("leaves the other admin's account for them to remove", async () => {
    expect(ok(await remove(adminTwo.token))).toEqual({ ok: true });
    expect(ok<PreviewStatusDto>(await state(adminTwo.token))).toEqual({ preview: null });
    expect(await countAll("users")).toBe(SEEDED_ACCOUNTS + 1);
  });
});

describe("the preview account's first visit", () => {
  let uid: string;
  let email: string;
  let temporary: string;
  let session: Session;

  it("starts with the link, as a new pledge would", async () => {
    const started = ok<PreviewStartResultDto>(await start("pledge"));
    ({ uid, email } = started.preview);
    const redeemed = ok<PreviewRedeemDto>(await redeem(started.code));
    temporary = redeemed.temporaryPassword;
    session = await signIn(email, temporary);
    expect(session.uid).toBe(uid);
  });

  it("is refused everything until it chooses a password", async () => {
    refused(await call(getMe, {}, { token: session.token }), 403, "password_change_required");
    refused(await call(getDashboard, {}, { token: session.token }), 403, "password_change_required");
    refused(await call(listPeople, {}, { token: session.token }), 403, "password_change_required");
    expect(ok<PreviewStatusDto>(await state()).preview?.stage).toBe("ready");
  });

  it(
    "chooses a password, signs in again, and is told it is a preview and whose",
    async () => {
      expect(ok(await call(choosePassword, {}, { method: "POST", token: session.token, body: { password: OWN_PASSWORD } }))).toEqual({ ok: true });
      expect(await signInFailure(email, temporary)).toMatch(/INVALID|PASSWORD/);
      session = await signIn(email, OWN_PASSWORD);
      expect(await storedClaims(uid)).toEqual({ role: "pledge", issued: email });
      expect(await storedFingerprint(uid)).toBeNull();

      const me = ok<MeDto>(await call(getMe, {}, { token: session.token }));
      expect(me).toMatchObject({
        uid,
        email,
        displayName: "Preview Pledge",
        role: "pledge",
        pledgeClass: null,
        team: null,
        onboardedAt: null,
        preview: { ownerEmail: ADMIN_ONE, role: "pledge" },
      });
      expect(Object.keys(me.preview ?? {}).sort()).toEqual(["ownerEmail", "role"]);
      // And the admin's card moves on.
      expect(ok<PreviewStatusDto>(await state()).preview).toMatchObject({ uid, stage: "in_progress" });
      expect((await people()).preview?.stage).toBe("in_progress");
    },
    SLOW_TEST_MS,
  );

  it("tells nobody else they are a preview: every real account answers null", async () => {
    for (const token of [admin.token, priya.token, avery.token]) {
      expect(ok<MeDto>(await call(getMe, {}, { token })).preview).toBeNull();
    }
  });

  it("goes through the welcome and the dashboard, and turns a deliverable in", async () => {
    ok(await call(completeOnboarding, {}, { method: "POST", token: session.token }));
    ok(await call(heartbeat, {}, { method: "POST", token: session.token, body: { formId: "week2interviews" } }));
    const dashboard = ok<DashboardDto>(await call(getDashboard, {}, { token: session.token }));
    const interviews = dashboard.forms.find((form) => form.id === "week2interviews");
    expect(interviews?.state).toBe("open");
    const form = ok<PledgeFormDto>(await call(getForm, { formId: "week2interviews" }, { token: session.token }));
    ok(await call(submit, { formId: "week2interviews" }, { method: "POST", token: session.token, body: { answers: INTERVIEWS, formVersion: form.version } }));
    expect(await countWhere("submissions", "uid", uid)).toBe(1);
    expect((await docData(`users/${uid}`))?.onboardedAt).not.toBeNull();
  });

  it("can be punished from its own page, which opens as any pledge's does", async () => {
    const punishment = ok<PunishmentDto>(await call(addPunishment, { uid }, { method: "POST", token: admin.token, body: { title: "Preview punishment", details: "" } }));
    expect(punishment.uid).toBe(uid);
    const detail = ok<PledgeDetailDto>(await call(getPledgeDetail, { uid }, { token: admin.token }));
    expect(detail.pledge).toMatchObject({ uid, email, displayName: "Preview Pledge", teamId: null, activePunishments: 1 });
    expect(detail.submissions.map((submission) => submission.formId)).toEqual(["week2interviews"]);
    expect(detail.punishments).toHaveLength(1);
    const dashboard = ok<DashboardDto>(await call(getDashboard, {}, { token: session.token }));
    expect(dashboard.punishments.map((item) => item.title)).toEqual(["Preview punishment"]);
  });

  // The proof that the sandbox is nobody's pledge: with a response, a welcome, a
  // visit and a punishment behind it, every list is exactly as the seed left it.
  it("is in no list, now that it has done everything a pledge does", async () => {
    const now = await everyListing();
    expect(now).toEqual(listingsBefore);
    for (const value of [uid, email, "Preview Pledge", "PREVIEW-ONLY-ANSWER-55120", "Preview punishment"]) {
      expect(listingsNaming(now, value), value).toEqual([]);
    }
  });

  it("is on nobody's team, and refused one", async () => {
    const own = refused(await call(updatePledge, { uid }, { method: "PATCH", token: admin.token, body: { teamId: TEAM_ATLAS } }), 422, "invalid");
    expect(fieldCodes(own)).toEqual(["teamId:invalid"]);
    expect(own.fields?.[0].message).toBe(CANT_JOIN);
    // Taking it off a team it is not on is nothing, and renaming it is allowed.
    ok(await call(updatePledge, { uid }, { method: "PATCH", token: admin.token, body: { teamId: "" } }));

    const made = refused(await call(createTeam, {}, { method: "POST", token: admin.token, body: { name: "Team With A Preview", memberUids: [uid] } }), 422, "invalid");
    expect(fieldCodes(made)).toEqual(["memberUids:invalid"]);
    expect(made.fields?.[0].message).toBe(CANT_JOIN);
    const added = refused(await call(updateTeam, { teamId: TEAM_ATLAS }, { method: "PATCH", token: admin.token, body: { addUids: [uid] } }), 422, "invalid");
    expect(added.fields?.[0].message).toBe(CANT_JOIN);
    const whole = refused(await call(updateTeam, { teamId: TEAM_ATLAS }, { method: "PATCH", token: admin.token, body: { memberUids: [avery.uid, uid] } }), 422, "invalid");
    expect(whole.fields?.[0].message).toBe(CANT_JOIN);

    expect((await docData(`users/${uid}`))?.teamId).toBeNull();
    expect(await countAll("teams")).toBe(1);
    expect(await countWhere("users", "teamId", TEAM_ATLAS)).toBe(2);
  });

  it("counts for nothing on a deliverable's own page, locks no question's type, and does not keep it from being deleted", async () => {
    // A deliverable of its own to answer, so that nothing of the seed's changes.
    const { id } = ok<{ id: string }>(await call(createForm, {}, { method: "POST", token: admin.token, body: {} }));
    const draft = ok<AdminFormDto>(await call(getAdminForm, { formId: id }, { token: admin.token }));
    const question = { id: "q_one", type: "short_text", title: "One thing you learned", description: "", required: true, validation: "none" };
    const definition = { title: "Preview-only deliverable", description: "", status: "published", questions: [question], settings: draft.settings };
    const published = ok<AdminFormDto>(await call(saveAdminForm, { formId: id }, { method: "PUT", token: admin.token, body: { ...definition, expectedVersion: draft.version } }));
    expect(published).toMatchObject({ status: "published", responseCount: 0 });

    const form = ok<PledgeFormDto>(await call(getForm, { formId: id }, { token: session.token }));
    expect(form.card.state).toBe("open");
    ok(await call(submit, { formId: id }, { method: "POST", token: session.token, body: { answers: { q_one: { kind: "text", value: "PREVIEW-ONLY-ANSWER-55121" } }, formVersion: form.version } }));
    // The response is marked as a preview's. A real one carries no such mark.
    expect(await docData(`submissions/${id}_${uid}`)).toMatchObject({ uid, formId: id, preview: true });
    expect(await docData(`submissions/week0onboarding_${avery.uid}`)).not.toHaveProperty("preview");
    expect(await docData(`submissions/week2interviews_${uid}`)).toMatchObject({ preview: true });

    // It counts for nothing, on the deliverable's own page, in the list, and among the responses.
    expect(ok<AdminFormDto>(await call(getAdminForm, { formId: id }, { token: admin.token })).responseCount).toBe(0);
    const listed = ok<AdminFormsDto>(await call(listForms, {}, { token: admin.token })).forms.find((candidate) => candidate.id === id);
    expect(listed?.responseCount).toBe(0);
    const responses = ok<FormResponsesDto>(await call(getResponses, { formId: id }, { token: admin.token }));
    expect(responses.responses).toEqual([]);
    expect(responses.form.responseCount).toBe(0);
    expect(JSON.stringify(responses)).not.toContain(uid);

    // The question may still change type, as it could before the response.
    const retyped = await call(saveAdminForm, { formId: id }, {
      method: "PUT",
      token: admin.token,
      body: { ...definition, questions: [{ id: "q_one", type: "paragraph", title: "One thing you learned", description: "", required: true }], expectedVersion: published.version },
    });
    const changed = ok<AdminFormDto>(retyped);
    expect(changed.questions[0].type).toBe("paragraph");
    expect(changed.responseCount).toBe(0);

    // And it can be deleted, which takes the preview's response with it.
    expect(ok(await call(deleteAdminForm, { formId: id }, { method: "DELETE", token: admin.token }))).toEqual({ ok: true });
    expect(await docExists(`forms/${id}`)).toBe(false);
    expect(await docExists(`submissions/${id}_${uid}`)).toBe(false);
    expect(await everyListing()).toEqual(listingsBefore);
  });

  it("stays out of a team's count and its members' view even when put on one by hand", async () => {
    const ref = testDb().doc(`users/${uid}`);
    await ref.update({ teamId: TEAM_ATLAS });
    try {
      expect(await countWhere("users", "teamId", TEAM_ATLAS)).toBe(3);
      expect((await people()).teams).toEqual([expect.objectContaining({ id: TEAM_ATLAS, memberCount: 2 })]);
      expect(ok<AdminOverviewDto>(await call(getOverview, {}, { token: admin.token })).teams[0].memberCount).toBe(2);
      expect(ok<MeDto>(await call(getMe, {}, { token: avery.token })).team?.teammates).toEqual(["Jordan Patel"]);
      // Setting the team's whole membership to what it is changes nothing, and does not count the preview as leaving.
      const auditBefore = await countAll("auditLog");
      ok(await call(updateTeam, { teamId: TEAM_ATLAS }, { method: "PATCH", token: admin.token, body: { memberUids: [avery.uid, (await people()).people.find((person) => person.displayName === "Jordan Patel")?.uid ?? ""] } }));
      expect(await countAll("auditLog")).toBe(auditBefore);
    } finally {
      await ref.update({ teamId: null });
    }
  });
});

describe("starting over", () => {
  let uid: string;
  let email: string;
  let earlier: Session;

  it("keeps the uid, wipes everything the account did, and ends its sessions", async () => {
    const before = ok<PreviewStatusDto>(await state()).preview as PreviewStateDto;
    ({ uid, email } = before);
    earlier = await signIn(email, OWN_PASSWORD);
    ok(await call(getMe, {}, { token: earlier.token }));
    expect(await countWhere("submissions", "uid", uid)).toBe(1);
    expect(await countWhere("punishments", "uid", uid)).toBe(1);

    const started = ok<PreviewStartResultDto>(await start("pledge"));
    expect(started.preview).toMatchObject({ uid, email, role: "pledge", stage: "ready", displayName: "Preview Pledge" });
    expect(await countAll("users")).toBe(SEEDED_ACCOUNTS + 1);

    for (const collection of ["submissions", "punishments", "drafts"]) expect(await countWhere(collection, "uid", uid), collection).toBe(0);
    expect(await countSessions(uid)).toBe(0);
    const profile = await docData(`users/${uid}`);
    expect(profile).toMatchObject({ onboardedAt: null, submitted: {}, activity: NO_ACTIVITY, teamId: null, status: "active", displayName: "Preview Pledge", previewOwnerUid: admin.uid });
    expect(Object.keys(profile ?? {}).sort()).toEqual(PREVIEW_PROFILE_KEYS);
    expect(await storedFingerprint(uid)).toEqual(A_KEPT_FINGERPRINT);
    expect(await storedClaims(uid)).toEqual(temporaryClaims("pledge", email, true));

    refused(await call(getMe, {}, { token: earlier.token }), 401, "session_revoked");
    expect(await signInFailure(email, OWN_PASSWORD)).toMatch(/INVALID|PASSWORD/);
    expect(await latestAudit()).toMatchObject({ action: "preview.start", targetId: uid, summary: `Started over a preview as a new pledge, ${email}` });
    // The link works for the fresh password.
    const redeemed = ok<PreviewRedeemDto>(await redeem(started.code));
    expect((await signIn(redeemed.email, redeemed.temporaryPassword)).uid).toBe(uid);
  });

  it("replaces an unused link: only the newest code works", async () => {
    const first = ok<PreviewStartResultDto>(await start("pledge"));
    const second = ok<PreviewStartResultDto>(await start("pledge"));
    expect(second.code).not.toBe(first.code);
    expect(await countAll("previewCodes")).toBe(1);
    refused(await redeem(first.code), 404, "preview_code_invalid");
    ok(await redeem(second.code));
    expect(await countAll("previewCodes")).toBe(0);
  });

  it("as the other role removes the pledge's account and makes an active's", async () => {
    const started = ok<PreviewStartResultDto>(await start("active"));
    const expected = previewAccount(ADMIN_ONE, admin.uid, "active");
    expect(started.preview).toMatchObject({ uid: expected.uid, email: expected.email, role: "active", displayName: "Preview Active", stage: "ready" });
    expect(expected.uid).toBe(`previewactive${admin.uid}`);

    expect(await docExists(`users/${uid}`)).toBe(false);
    await expect(testAuth().getUser(uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect(await countAll("users")).toBe(SEEDED_ACCOUNTS + 1);
    expect(await docData(`users/${expected.uid}`)).toMatchObject({ role: "active", previewOwnerUid: admin.uid, previewOwnerEmail: ADMIN_ONE, teamId: null });
    expect(await storedClaims(expected.uid)).toEqual(temporaryClaims("active", expected.email, true));

    // Both entries carry the one request's clock, so between the two the order is not told by time.
    const [removal, beginning] = (await storedAudit()).slice(0, 2).sort((a, b) => a.action.localeCompare(b.action));
    expect(removal).toMatchObject({ action: "preview.remove", targetId: uid, summary: `Removed the preview account ${email}` });
    expect(beginning).toMatchObject({ action: "preview.start", targetId: expected.uid, summary: `Started a preview as a new active, ${expected.email}` });
    expect((await people()).preview).toEqual(started.preview);

    // Signed in as the active, told it is a preview, and reading the pledges' work.
    const redeemed = ok<PreviewRedeemDto>(await redeem(started.code));
    expect(redeemed.role).toBe("active");
    const session = await signIn(redeemed.email, redeemed.temporaryPassword);
    ok(await call(choosePassword, {}, { method: "POST", token: session.token, body: { password: OWN_PASSWORD } }));
    const again = await signIn(expected.email, OWN_PASSWORD);
    expect(ok<MeDto>(await call(getMe, {}, { token: again.token }))).toMatchObject({ role: "active", preview: { ownerEmail: ADMIN_ONE, role: "active" } });
    ok(await call(getReviewOverview, {}, { token: again.token }));
    refused(await call(getDashboard, {}, { token: again.token }), 403, "forbidden");
    ({ uid, email } = expected);
  });

  it("is in no list as an active either", async () => {
    const now = await everyListing();
    expect(now).toEqual(listingsBefore);
    for (const value of [uid, email, "Preview Active"]) expect(listingsNaming(now, value), value).toEqual([]);
  });
});

describe("when the address is in the way", () => {
  const theirs = () => previewAccount(ADMIN_TWO, adminTwo.uid, "pledge");

  it("refuses to start when a real account has the address, says so, and makes nothing", async () => {
    // A real pledge, as it happens, at the address the other admin's preview would take. The portal
    // no longer gives such an address to a new account, but one made before that, or in the
    // Firebase console, can still hold it.
    const record = await testAuth().createUser({ email: theirs().email, emailVerified: true });
    await createProfile(record.uid, theirs().email, "pledge", "Really A Pledge");
    const made = { pledge: { uid: record.uid } };
    try {
      const usersBefore = await countAll("users");
      const auditBefore = await countAll("auditLog");
      const result = refused(await start("pledge", adminTwo.token), 409, "preview_email_taken");
      expect(result.error).toBe("An account already uses the address this preview would take.");
      expect(await countAll("users")).toBe(usersBefore);
      expect(await countAll("auditLog")).toBe(auditBefore);
      expect(await countWhere("previewCodes", "ownerUid", adminTwo.uid)).toBe(0);
      expect(ok<PreviewStatusDto>(await state(adminTwo.token))).toEqual({ preview: null });
      expect(await docData(`users/${made.pledge.uid}`)).toMatchObject({ role: "pledge", displayName: "Really A Pledge" });
    } finally {
      ok(await call(removePledge, { uid: made.pledge.uid }, { method: "DELETE", token: admin.token, query: `?confirm=${encodeURIComponent(theirs().email)}` }));
    }
  });

  it("says whose it is when the address is another admin's preview account", async () => {
    // Another admin's sandbox at that address, as one would be if two admins shared a local part.
    const record = await testAuth().createUser({ email: theirs().email, emailVerified: true });
    await createProfile(record.uid, theirs().email, "pledge", "Preview Pledge");
    await testDb().doc(`users/${record.uid}`).update({ previewOwnerUid: admin.uid, previewOwnerEmail: ADMIN_ONE });
    try {
      const result = refused(await start("pledge", adminTwo.token), 409, "preview_email_taken");
      expect(result.error).toBe("Another admin's preview account already uses that address.");
      expect(ok<PreviewStatusDto>(await state(adminTwo.token))).toEqual({ preview: null });
      expect(await docExists(`users/${record.uid}`)).toBe(true);
    } finally {
      await testAuth().deleteUser(record.uid);
      await testDb().doc(`users/${record.uid}`).delete();
    }
  });

  // A sandbox made by an earlier version of the portal carries that version's
  // address. Starting over moves it to the current one, unless somebody else
  // holds that address: then nothing of the sandbox is undone.
  it("refuses to start over into an address somebody else holds, and undoes nothing", async () => {
    const started = ok<PreviewStartResultDto>(await start("pledge", adminTwo.token));
    const { uid, email } = started.preview;
    const earlierAddress = email.replace("+preview-pledge@", "+preview-new-member@");
    await testAuth().updateUser(uid, { email: earlierAddress });
    await testDb().doc(`users/${uid}`).update({ email: earlierAddress });
    const stranger = await testAuth().createUser({ email, emailVerified: true });
    try {
      const usersBefore = await countAll("users");
      const auditBefore = await countAll("auditLog");
      const result = refused(await start("pledge", adminTwo.token), 409, "preview_email_taken");
      expect(result.error).toBe("An account already uses the address this preview would take.");
      expect(await countAll("users")).toBe(usersBefore);
      expect(await countAll("auditLog")).toBe(auditBefore);
      expect((await testAuth().getUser(uid)).email).toBe(earlierAddress);
      expect(await docData(`users/${uid}`)).toMatchObject({ email: earlierAddress, previewOwnerUid: adminTwo.uid, status: "active" });
      // The earlier link went before the attempt, as every start over takes it away first.
      expect(await countWhere("previewCodes", "ownerUid", adminTwo.uid)).toBe(0);
      expect((ok<PreviewStatusDto>(await state(adminTwo.token)).preview as PreviewStateDto).uid).toBe(uid);
    } finally {
      await testAuth().deleteUser(stranger.uid);
      ok(await remove(adminTwo.token));
    }
    expect(ok<PreviewStatusDto>(await state(adminTwo.token))).toEqual({ preview: null });
  });

  // An unopened link from before a start over names an account that is being reset
  // underneath it: it is taken away first, so it never hands out a password that no longer works.
  it("takes an earlier link away before starting over, not after", async () => {
    const first = ok<PreviewStartResultDto>(await start("pledge", adminTwo.token));
    expect(await countWhere("previewCodes", "ownerUid", adminTwo.uid)).toBe(1);
    const second = ok<PreviewStartResultDto>(await start("pledge", adminTwo.token));
    expect(await countWhere("previewCodes", "ownerUid", adminTwo.uid)).toBe(1);
    expect(await docExists(`previewCodes/${hashPreviewCode(first.code)}`)).toBe(false);
    refused(await redeem(first.code), 404, "preview_code_invalid");
    const redeemed = ok<PreviewRedeemDto>(await redeem(second.code));
    expect((await signIn(redeemed.email, redeemed.temporaryPassword)).uid).toBe(second.preview.uid);
    ok(await remove(adminTwo.token));
  });

  it("clears a sign-in account of its own that was left without a profile, and goes on", async () => {
    await testAuth().createUser({ uid: theirs().uid, email: theirs().email, emailVerified: true });
    const started = ok<PreviewStartResultDto>(await start("pledge", adminTwo.token));
    expect(started.preview.uid).toBe(theirs().uid);
    expect(await docData(`users/${theirs().uid}`)).toMatchObject({ previewOwnerUid: adminTwo.uid });
    expect((await testAuth().getUser(theirs().uid)).customClaims).toEqual(temporaryClaims("pledge", theirs().email, true));
    ok(await remove(adminTwo.token));
  });
});

describe("removing the preview account", () => {
  it("deletes the account, everything it did and any link, and says so", async () => {
    const before = ok<PreviewStatusDto>(await state()).preview as PreviewStateDto;
    const session = await signIn(before.email, OWN_PASSWORD);
    ok(await start("active"));
    expect(await countAll("previewCodes")).toBe(1);

    expect(ok(await remove())).toEqual({ ok: true });
    expect(await docExists(`users/${before.uid}`)).toBe(false);
    await expect(testAuth().getUser(before.uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect(await countAll("previewCodes")).toBe(0);
    expect(await countAll("users")).toBe(SEEDED_ACCOUNTS);
    expect(await latestAudit()).toMatchObject({
      action: "preview.remove",
      targetType: "user",
      targetId: before.uid,
      actorEmail: ADMIN_ONE,
      summary: `Removed the preview account ${before.email}`,
    });
    expect(ok<PreviewStatusDto>(await state())).toEqual({ preview: null });
    expect((await people()).preview).toBeNull();
    refused(await call(getMe, {}, { token: session.token }), 401, "account_removed");
    expect(refused(await remove(), 404, "not_found").error).toBe("You don't have a preview account.");
  });

  it("left every seeded account and document exactly as the seed made them, the log aside", async () => {
    const after = await dumpPortal();
    const withoutLog = (dump: typeof after) => Object.fromEntries(Object.entries(dump.firestore).filter(([path]) => !path.startsWith("auditLog/")));
    expect(withoutLog(after)).toEqual(withoutLog(portalBefore));
    expect(after.accounts).toEqual(portalBefore.accounts);
    expect(await everyListing()).toEqual(listingsBefore);
  });

  it("recorded every start and removal, and nothing of any password or code", async () => {
    const actions = (await storedAudit()).map((entry) => entry.action).filter((action) => action.startsWith("preview."));
    expect(new Set(actions)).toEqual(new Set(["preview.start", "preview.remove"]));
    expect(actions.filter((action) => action === "preview.start").length).toBeGreaterThanOrEqual(8);
    const log = JSON.stringify(await storedAudit());
    expect(log).not.toMatch(PASSWORD_ANYWHERE);
    expect(log).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });
});
