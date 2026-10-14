/**
 * Changing a pledge's or an active's address from the portal. An address
 * lives in three places that must agree, the profile, the sign-in and the
 * claim recording the address the account was issued to, and every test here
 * checks all three. Accounts are made by hand, one per test, so each starts
 * from a known state.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as createActiveLink } from "@/app/api/portal/admin/actives/[uid]/invite-link/route";
import { PATCH as updateActive } from "@/app/api/portal/admin/actives/[uid]/route";
import { POST as createPledgeLink } from "@/app/api/portal/admin/pledges/[uid]/invite-link/route";
import { PATCH as updatePledge } from "@/app/api/portal/admin/pledges/[uid]/route";
import { POST as createPledge } from "@/app/api/portal/admin/pledges/route";
import { GET as getMe } from "@/app/api/portal/me/route";
import { GET as getReviewOverview } from "@/app/api/portal/review/overview/route";
import { resetRateLimits } from "@/lib/portal/server/rate-limit";
import type { MeDto, MemberRole } from "@/lib/portal/types";
import {
  ADMIN_ONE,
  DEMO_PASSWORD,
  JORDAN,
  SEED_TIMEOUT_MS,
  SLOW_TEST_MS,
  call,
  createProfile,
  docData,
  dumpPortal,
  fieldCodes,
  ok,
  refused,
  seedPortal,
  signIn,
  signInFailure,
  storedAudit,
  storedClaims,
  testAuth,
  testDb,
  uidOf,
  type Session,
} from "./helpers";

let admin: Session;

const patchPledge = (uid: string, body: unknown) =>
  call(updatePledge, { uid }, { method: "PATCH", token: admin.token, body });
const patchActive = (uid: string, body: unknown) =>
  call(updateActive, { uid }, { method: "PATCH", token: admin.token, body });
const patchMember = (role: MemberRole, uid: string, body: unknown) =>
  role === "pledge" ? patchPledge(uid, body) : patchActive(uid, body);

/** A pledge or an active made the way the portal makes one, signed in with the demo password. */
async function makeMember(
  email: string,
  role: MemberRole,
  options: { claims?: Record<string, unknown>; previewOwner?: string } = {},
): Promise<Session> {
  const record = await testAuth().createUser({
    email,
    password: DEMO_PASSWORD,
    emailVerified: true,
    displayName: "Made By Hand",
  });
  await testAuth().setCustomUserClaims(record.uid, { role, issued: email, ...options.claims });
  await createProfile(record.uid, email, role);
  if (options.previewOwner) {
    await testDb().doc(`users/${record.uid}`).update({ previewOwnerUid: options.previewOwner });
  }
  return signIn(email);
}

/** The address in each of the three places it is kept. */
async function addressesOf(uid: string): Promise<{ profile: unknown; signIn: unknown; issued: unknown }> {
  const record = await testAuth().getUser(uid);
  return {
    profile: (await docData(`users/${uid}`))?.email,
    signIn: record.email,
    issued: record.customClaims?.issued,
  };
}

const everywhere = (email: string) => ({ profile: email, signIn: email, issued: email });

/** Refuses the change and leaves every stored thing, and the person's session, exactly as it was. */
async function expectRefusedUnchanged(
  role: MemberRole,
  member: Session,
  body: unknown,
  status: number,
  code: string,
): Promise<ReturnType<typeof refused>> {
  const before = await dumpPortal();
  const refusal = refused(await patchMember(role, member.uid, body), status, code);
  expect(await dumpPortal()).toEqual(before);
  ok(await call(getMe, {}, { token: member.token }));
  return refusal;
}

beforeAll(async () => {
  await seedPortal();
  admin = await signIn(ADMIN_ONE);
}, SEED_TIMEOUT_MS);

beforeEach(() => {
  resetRateLimits();
});

describe("changing an address", () => {
  it(
    "moves a pledge to a new address in all three places, and signs them in again with it",
    async () => {
      const pledge = await makeMember("edit.mover@uci.edu", "pledge");
      expect(ok(await patchPledge(pledge.uid, { email: "edit.moved@uci.edu" }))).toEqual({ ok: true });

      expect(await addressesOf(pledge.uid)).toEqual(everywhere("edit.moved@uci.edu"));
      const record = await testAuth().getUser(pledge.uid);
      expect(record.emailVerified).toBe(true);
      expect(record.customClaims).toEqual({ role: "pledge", issued: "edit.moved@uci.edu" });

      // Every session on the old address has ended, and the old address signs nobody in.
      refused(await call(getMe, {}, { token: pledge.token }), 401, "session_revoked");
      expect(await signInFailure("edit.mover@uci.edu")).toBe("EMAIL_NOT_FOUND");

      // The new address signs in with the same password, and the portal opens.
      const again = await signIn("edit.moved@uci.edu");
      expect(again.uid).toBe(pledge.uid);
      expect(ok<MeDto>(await call(getMe, {}, { token: again.token }))).toMatchObject({
        email: "edit.moved@uci.edu",
        role: "pledge",
      });

      expect((await storedAudit())[0]).toMatchObject({
        action: "pledge.update",
        targetType: "user",
        targetId: pledge.uid,
        actorEmail: ADMIN_ONE,
        summary: "edit.mover@uci.edu: email changed from edit.mover@uci.edu to edit.moved@uci.edu",
      });
    },
    SLOW_TEST_MS,
  );

  it(
    "moves an active the same way, and their review pages open with the new address",
    async () => {
      const active = await makeMember("edit.active@uci.edu", "active");
      ok(await patchActive(active.uid, { email: "edit.active.new@uci.edu" }));

      expect(await addressesOf(active.uid)).toEqual(everywhere("edit.active.new@uci.edu"));
      expect((await testAuth().getUser(active.uid)).customClaims).toEqual({
        role: "active",
        issued: "edit.active.new@uci.edu",
      });
      refused(await call(getReviewOverview, {}, { token: active.token }), 401, "session_revoked");

      const again = await signIn("edit.active.new@uci.edu");
      ok(await call(getReviewOverview, {}, { token: again.token }));
      expect(ok<MeDto>(await call(getMe, {}, { token: again.token })).email).toBe("edit.active.new@uci.edu");
      expect((await storedAudit())[0]).toMatchObject({ action: "active.update", targetId: active.uid });
    },
    SLOW_TEST_MS,
  );

  it(
    "keeps addresses as the portal does: trimmed and lower-cased",
    async () => {
      const pledge = await makeMember("edit.case@uci.edu", "pledge");
      ok(await patchPledge(pledge.uid, { email: "  Edit.Case.New@UCI.EDU \n" }));
      expect(await addressesOf(pledge.uid)).toEqual(everywhere("edit.case.new@uci.edu"));
    },
    SLOW_TEST_MS,
  );

  it(
    "changes the name and the address together, in one audit entry",
    async () => {
      const pledge = await makeMember("edit.both@uci.edu", "pledge");
      const entriesBefore = (await storedAudit()).length;
      ok(await patchPledge(pledge.uid, { displayName: "Both Changed", email: "edit.both.new@uci.edu" }));

      expect(await addressesOf(pledge.uid)).toEqual(everywhere("edit.both.new@uci.edu"));
      expect((await testAuth().getUser(pledge.uid)).displayName).toBe("Both Changed");
      expect((await docData(`users/${pledge.uid}`))?.displayName).toBe("Both Changed");
      const entries = await storedAudit();
      expect(entries).toHaveLength(entriesBefore + 1);
      expect(entries[0].summary).toBe("edit.both@uci.edu: name, email changed from edit.both@uci.edu to edit.both.new@uci.edu");
    },
    SLOW_TEST_MS,
  );

  it(
    "carries a temporary password still outstanding over to the new address, as it was issued",
    async () => {
      const tempAt = Math.floor(Date.now() / 1000) - 60;
      const pledge = await makeMember("edit.temp@uci.edu", "pledge", {
        claims: { temp: true, tempAt, tempNew: true },
      });
      ok(await patchPledge(pledge.uid, { email: "edit.temp.new@uci.edu" }));
      expect(await storedClaims(pledge.uid)).toEqual({
        role: "pledge",
        issued: "edit.temp.new@uci.edu",
        temp: true,
        tempAt,
        tempNew: true,
      });
    },
    SLOW_TEST_MS,
  );

  it(
    "does nothing for the same address in another case: no audit entry, and the session goes on",
    async () => {
      const pledge = await makeMember("edit.same@uci.edu", "pledge");
      const before = await dumpPortal();
      expect(ok(await patchPledge(pledge.uid, { email: " EDIT.Same@uci.edu " }))).toEqual({ ok: true });
      expect(await dumpPortal()).toEqual(before);
      ok(await call(getMe, {}, { token: pledge.token }));
    },
    SLOW_TEST_MS,
  );
});

describe("refusing an address", () => {
  it(
    "refuses anything but a UCI address, and the form a preview's address takes",
    async () => {
      const pledge = await makeMember("edit.refused@uci.edu", "pledge");
      for (const email of ["edit.refused@gmail.com", "edit.refused@ics.uci.edu", "", "not an address", 42, null]) {
        const body = await expectRefusedUnchanged("pledge", pledge, { email }, 422, "invalid");
        expect(fieldCodes(body)).toEqual(["email:invalid_email"]);
      }
      const body = await expectRefusedUnchanged(
        "pledge",
        pledge,
        { email: "chair.one+preview-pledge@uci.edu" },
        422,
        "invalid",
      );
      expect(fieldCodes(body)).toEqual(["email:invalid_email"]);
    },
    SLOW_TEST_MS,
  );

  it(
    "refuses an admin's address",
    async () => {
      const pledge = await makeMember("edit.notadmin@uci.edu", "pledge");
      const body = await expectRefusedUnchanged("pledge", pledge, { email: ADMIN_ONE.toUpperCase() }, 422, "invalid");
      expect(fieldCodes(body)).toEqual(["email:is_admin"]);
    },
    SLOW_TEST_MS,
  );

  it(
    "refuses an address another account signs in with, and says so on the field",
    async () => {
      const pledge = await makeMember("edit.taken@uci.edu", "pledge");
      const body = await expectRefusedUnchanged("pledge", pledge, { email: JORDAN }, 409, "email_exists");
      expect(fieldCodes(body)).toEqual(["email:email_exists"]);
    },
    SLOW_TEST_MS,
  );

  it(
    "refuses an address held only by another account's profile",
    async () => {
      await createProfile("editHeldOnlyByProfile", "edit.held@uci.edu", "pledge");
      const pledge = await makeMember("edit.holder@uci.edu", "pledge");
      await expectRefusedUnchanged("pledge", pledge, { email: "edit.held@uci.edu" }, 409, "email_exists");
    },
    SLOW_TEST_MS,
  );

  it(
    "refuses to move a preview account, whose address is made from its admin's",
    async () => {
      const preview = await makeMember("edit.preview@uci.edu", "pledge", { previewOwner: admin.uid });
      await expectRefusedUnchanged("pledge", preview, { email: "edit.preview.new@uci.edu" }, 403, "preview_account");
    },
    SLOW_TEST_MS,
  );

  it(
    "refuses an account with no sign-in, which has nothing to move",
    async () => {
      await createProfile("editProfileOnly", "edit.profileonly@uci.edu", "pledge");
      const before = await dumpPortal();
      refused(await patchPledge("editProfileOnly", { email: "edit.profileonly.new@uci.edu" }), 409, "no_sign_in");
      expect(await dumpPortal()).toEqual(before);
    },
    SLOW_TEST_MS,
  );

  it(
    "never changes an admin, and a pledge's address only through the pledge route",
    async () => {
      const pledge = await makeMember("edit.kind@uci.edu", "pledge");
      const before = await dumpPortal();
      refused(await patchPledge(admin.uid, { email: "edit.admin.new@uci.edu" }), 403, "cannot_modify_admin");
      refused(await patchActive(admin.uid, { email: "edit.admin.new@uci.edu" }), 403, "cannot_modify_admin");
      refused(await patchActive(pledge.uid, { email: "edit.kind.new@uci.edu" }), 404, "not_found");
      expect(await dumpPortal()).toEqual(before);
      ok(await call(getMe, {}, { token: pledge.token }));
    },
    SLOW_TEST_MS,
  );

  it(
    "is never given to a new account when it is tagged for an admin's preview",
    async () => {
      const before = await dumpPortal();
      const result = await call(createPledge, {}, {
        method: "POST",
        token: admin.token,
        body: { displayName: "Not A Preview", email: "edit.owner+preview-pledge@uci.edu", start: "temporary_password" },
      });
      expect(fieldCodes(refused(result, 422, "invalid"))).toEqual(["email:invalid_email"]);
      expect(await dumpPortal()).toEqual(before);
    },
    SLOW_TEST_MS,
  );

  it(
    "is refused to everyone but an admin",
    async () => {
      const pledge = await makeMember("edit.self@uci.edu", "pledge");
      const before = await dumpPortal();
      refused(
        await call(updatePledge, { uid: pledge.uid }, { method: "PATCH", token: pledge.token, body: { email: "edit.self.new@uci.edu" } }),
        403,
        "forbidden",
      );
      expect(await dumpPortal()).toEqual(before);
    },
    SLOW_TEST_MS,
  );
});

describe("putting a half-finished change right", () => {
  it(
    "finishes a change that moved the sign-in but not the profile when it is saved again",
    async () => {
      const pledge = await makeMember("edit.half@uci.edu", "pledge");
      // As an interrupted change would leave it: the sign-in and its claim on
      // the new address, the profile still on the old one. The person is locked out.
      await testAuth().updateUser(pledge.uid, { email: "edit.half.new@uci.edu" });
      await testAuth().setCustomUserClaims(pledge.uid, { role: "pledge", issued: "edit.half.new@uci.edu" });

      ok(await patchPledge(pledge.uid, { email: "edit.half.new@uci.edu" }));
      expect(await addressesOf(pledge.uid)).toEqual(everywhere("edit.half.new@uci.edu"));
      const again = await signIn("edit.half.new@uci.edu");
      ok(await call(getMe, {}, { token: again.token }));
    },
    SLOW_TEST_MS,
  );

  it(
    "will not carry on a sign-in that was moved to another address outside the portal, until a password link puts it back",
    async () => {
      const pledge = await makeMember("edit.stray@uci.edu", "pledge");
      // Whoever moved it may know the password, so it is not moved on, or back, with that password.
      await testAuth().updateUser(pledge.uid, { email: "edit.stray.elsewhere@uci.edu" });
      const before = await dumpPortal();
      for (const email of ["edit.stray@uci.edu", "edit.stray.new@uci.edu"]) {
        refused(await patchPledge(pledge.uid, { email }), 409, "sign_in_moved");
      }
      expect(await dumpPortal()).toEqual(before);

      // A password link puts the address back and replaces the password. Then the change goes through.
      ok(await call(createPledgeLink, { uid: pledge.uid }, { method: "POST", token: admin.token }));
      expect(await addressesOf(pledge.uid)).toEqual(everywhere("edit.stray@uci.edu"));
      expect(await signInFailure("edit.stray@uci.edu")).toMatch(/INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS/);
      ok(await patchPledge(pledge.uid, { email: "edit.stray.new@uci.edu" }));
      expect(await addressesOf(pledge.uid)).toEqual(everywhere("edit.stray.new@uci.edu"));
    },
    SLOW_TEST_MS,
  );

  it(
    "puts right a claim that names another address when the same address is saved again",
    async () => {
      const pledge = await makeMember("edit.claimonly@uci.edu", "pledge");
      // As a put-back that moved the sign-in but not its claim would leave it:
      // the profile and the sign-in agree, and the person is locked out.
      await testAuth().setCustomUserClaims(pledge.uid, { role: "pledge", issued: "edit.claimonly.other@uci.edu" });
      refused(await call(getMe, {}, { token: (await signIn("edit.claimonly@uci.edu")).token }), 403, "email_not_allowed");

      ok(await patchPledge(pledge.uid, { email: "edit.claimonly@uci.edu" }));
      expect(await addressesOf(pledge.uid)).toEqual(everywhere("edit.claimonly@uci.edu"));
      expect(await storedClaims(pledge.uid)).toEqual({ role: "pledge", issued: "edit.claimonly@uci.edu" });
      expect((await storedAudit())[0].summary).toBe(
        "edit.claimonly@uci.edu: sign-in address put back to edit.claimonly@uci.edu",
      );
      ok(await call(getMe, {}, { token: (await signIn("edit.claimonly@uci.edu")).token }));
    },
    SLOW_TEST_MS,
  );

  it(
    "lets a set-password link put right a claim that names another address",
    async () => {
      const active = await makeMember("edit.claim@uci.edu", "active");
      await testAuth().setCustomUserClaims(active.uid, { role: "active", issued: "edit.claim.other@uci.edu" });
      refused(await call(getMe, {}, { token: (await signIn("edit.claim@uci.edu")).token }), 403, "email_not_allowed");

      ok(await call(createActiveLink, { uid: active.uid }, { method: "POST", token: admin.token }));
      expect(await addressesOf(active.uid)).toEqual(everywhere("edit.claim@uci.edu"));
      expect(await storedClaims(active.uid)).toEqual({ role: "active", issued: "edit.claim@uci.edu" });
      ok(await call(getMe, {}, { token: (await signIn("edit.claim@uci.edu")).token }));
    },
    SLOW_TEST_MS,
  );

  it(
    "keeps a set-password link that restores a moved sign-in from leaving a stale claim behind",
    async () => {
      const pledge = await makeMember("edit.restore@uci.edu", "pledge");
      await testAuth().updateUser(pledge.uid, { email: "edit.restore.moved@uci.edu" });
      await testAuth().setCustomUserClaims(pledge.uid, { role: "pledge", issued: "edit.restore.moved@uci.edu" });

      ok(await call(createPledgeLink, { uid: pledge.uid }, { method: "POST", token: admin.token }));
      expect(await addressesOf(pledge.uid)).toEqual(everywhere("edit.restore@uci.edu"));
    },
    SLOW_TEST_MS,
  );
});

describe("two changes at once", () => {
  it(
    "gives an address to only one of two accounts moved to it at the same moment",
    async () => {
      const [first, second] = [
        await makeMember("edit.race.one@uci.edu", "pledge"),
        await makeMember("edit.race.two@uci.edu", "pledge"),
      ];
      const results = await Promise.all([
        patchPledge(first.uid, { email: "edit.race.prize@uci.edu" }),
        patchPledge(second.uid, { email: "edit.race.prize@uci.edu" }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
      const loser = results[0].status === 200 ? second : first;
      const winner = loser === first ? second : first;
      refused(results[winner === first ? 1 : 0], 409, "email_exists");

      expect(await addressesOf(winner.uid)).toEqual(everywhere("edit.race.prize@uci.edu"));
      expect(await addressesOf(loser.uid)).toEqual(everywhere(loser.email));
      expect(await uidOf("edit.race.prize@uci.edu")).toBe(winner.uid);
      // The account that lost keeps its sessions: nothing about it changed.
      ok(await call(getMe, {}, { token: loser.token }));
    },
    SLOW_TEST_MS,
  );

  it(
    "leaves one account agreeing everywhere when two admins move it to different addresses at once",
    async () => {
      const pledge = await makeMember("edit.tug@uci.edu", "pledge");
      const targets = ["edit.tug.one@uci.edu", "edit.tug.two@uci.edu"];
      const results = await Promise.all(targets.map((email) => patchPledge(pledge.uid, { email })));

      const statuses = results.map((result) => result.status);
      expect(statuses).toContain(200);
      const stored = (await docData(`users/${pledge.uid}`))?.email;
      expect(targets).toContain(stored);
      expect(await addressesOf(pledge.uid)).toEqual(everywhere(String(stored)));
      for (const result of results) {
        if (result.status !== 200) refused(result, 409, "conflict");
      }
    },
    SLOW_TEST_MS,
  );
});
