/**
 * A person's own account: what the portal says about them, the welcome that a
 * pledge and an active each go through once, and signing out. Tests run in
 * order from a fresh seed. Signing out ends every sign-in an account has, so
 * the tests that do it sign in again afterwards.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as createActive } from "@/app/api/portal/admin/actives/route";
import { POST as inviteLink } from "@/app/api/portal/admin/pledges/[uid]/invite-link/route";
import { GET as getOverview, POST as createPledge } from "@/app/api/portal/admin/pledges/route";
import { GET as getDashboard } from "@/app/api/portal/dashboard/route";
import { POST as heartbeat } from "@/app/api/portal/heartbeat/route";
import { GET as getMe } from "@/app/api/portal/me/route";
import { POST as completeOnboarding } from "@/app/api/portal/onboarding/route";
import { POST as signOut } from "@/app/api/portal/sign-out/route";
import { GET as listSubmissions } from "@/app/api/portal/submissions/route";
import { RATE_LIMITS, resetRateLimits } from "@/lib/portal/server/rate-limit";
import type { AdminOverviewDto, CreateActiveResultDto, CreatePledgeResultDto, InviteLinkDto, MeDto } from "@/lib/portal/types";
import {
  ADMIN_ONE,
  ADMIN_TWO,
  AVERY,
  CASEY,
  JORDAN,
  MAYA,
  PRIYA,
  SAM,
  SEED_TIMEOUT_MS,
  SLOW_TEST_MS,
  TEAM_ATLAS,
  TEAM_ATLAS_NAME,
  call,
  claimsOf,
  countAll,
  countSessions,
  createAccount,
  docData,
  docExists,
  dumpPortal,
  ok,
  redeemResetCode,
  refused,
  renewed,
  seedPortal,
  signIn,
  signInEarlyInASecond,
  signInFailure,
  sleep,
  testAuth,
  testDb,
  uidOf,
  type Session,
} from "./helpers";

let admin: Session;
let adminTwo: Session;
let avery: Session;
let jordan: Session;
let maya: Session;
let sam: Session;
let caseyUid: string;

const me = async (session: Session): Promise<MeDto> => ok<MeDto>(await call(getMe, {}, { token: session.token }));
const finishTour = (session: Session, body: unknown = {}) =>
  call(completeOnboarding, {}, { method: "POST", token: session.token, body });
const leave = (session: Session, body: unknown = {}) => call(signOut, {}, { method: "POST", token: session.token, body });
const storedMs = async (uid: string): Promise<number | null> => {
  const stamp = (await testDb().doc(`users/${uid}`).get()).get("onboardedAt") as { toMillis(): number } | null;
  return stamp ? stamp.toMillis() : null;
};

/** A pledge created through the portal who has chosen a password and never been through the tour. */
async function newPledge(email: string, displayName: string): Promise<Session> {
  const created = ok<CreatePledgeResultDto>(
    await call(createPledge, {}, { method: "POST", token: admin.token, body: { email, displayName } }),
  );
  const code = new URL(created.inviteLink ?? "").searchParams.get("oobCode") ?? "";
  expect(await redeemResetCode(code, "chosen-by-the-pledge-1")).toBe(true);
  return signIn(email, "chosen-by-the-pledge-1");
}

/** An active created through the portal who has chosen a password and not been through their welcome. */
async function newActive(email: string, displayName: string): Promise<Session> {
  const created = ok<CreateActiveResultDto>(
    await call(createActive, {}, { method: "POST", token: admin.token, body: { email, displayName } }),
  );
  const code = new URL(created.inviteLink ?? "").searchParams.get("oobCode") ?? "";
  expect(await redeemResetCode(code, "chosen-by-the-active-1")).toBe(true);
  return signIn(email, "chosen-by-the-active-1");
}

beforeAll(async () => {
  await seedPortal();
  [admin, adminTwo, avery, jordan, maya, sam] = await Promise.all(
    [ADMIN_ONE, ADMIN_TWO, AVERY, JORDAN, MAYA, SAM].map((email) => signIn(email)),
  );
  caseyUid = await uidOf(CASEY);
}, SEED_TIMEOUT_MS);

beforeEach(() => {
  resetRateLimits();
});

describe("who the portal says you are", () => {
  it("tells a pledge on a team their team's name and their teammate's name, and when they finished the tour", async () => {
    const profile = await me(avery);
    expect(profile).toMatchObject({
      uid: avery.uid,
      email: AVERY,
      displayName: "Avery Chen",
      role: "pledge",
      pledgeClass: "Lambda",
      team: { name: TEAM_ATLAS_NAME, teammates: ["Jordan Patel"] },
    });
    // The seed has Avery finishing the tour 20 days ago.
    expect(Date.parse(profile.onboardedAt ?? "")).toBeLessThan(Date.now() - 19 * 86_400_000);
    expect(Date.parse(profile.onboardedAt ?? "")).toBe(await storedMs(avery.uid));
  });

  it("tells a pledge who has not finished the tour that it is still to do", async () => {
    expect(await me(jordan)).toMatchObject({
      email: JORDAN,
      team: { name: TEAM_ATLAS_NAME, teammates: ["Avery Chen"] },
      onboardedAt: null,
    });
  });

  it("tells a pledge who works on their own that they have no team", async () => {
    for (const session of [sam, maya]) {
      const profile = await me(session);
      expect(profile.team).toBeNull();
      expect(profile.onboardedAt).not.toBeNull();
    }
  });

  it("tells an admin neither: no team, and no tour, whatever their profile holds", async () => {
    expect(await me(admin)).toMatchObject({ email: ADMIN_ONE, role: "admin", pledgeClass: null, team: null, onboardedAt: null });

    const ref = testDb().doc(`users/${admin.uid}`);
    const before = (await ref.get()).data();
    await ref.update({ onboardedAt: (await testDb().doc(`users/${avery.uid}`).get()).get("onboardedAt") });
    try {
      expect(await me(admin)).toMatchObject({ role: "admin", team: null, onboardedAt: null });
    } finally {
      await ref.set(before ?? {});
    }
  });
});

describe("what a pledge is told about their team", () => {
  it("never lists an admin as a teammate, even if an admin's profile points at the team", async () => {
    const ref = testDb().doc(`users/${adminTwo.uid}`);
    await ref.update({ teamId: TEAM_ATLAS });
    try {
      expect((await me(avery)).team).toEqual({ name: TEAM_ATLAS_NAME, teammates: ["Jordan Patel"] });
    } finally {
      await ref.update({ teamId: null });
    }
  });
});

describe("time tracking", () => {
  it("times an admin's visit like anyone's, without making them a draft of a deliverable they named", async () => {
    const before = await docData(`users/${admin.uid}`);
    const visitsBefore = await countSessions(admin.uid);
    for (const body of [{ resume: true }, {}, { formId: "week2interviews" }]) {
      expect(ok(await call(heartbeat, {}, { method: "POST", token: admin.token, body }))).toEqual({ ok: true });
    }
    const after = await docData(`users/${admin.uid}`);
    expect(after).not.toEqual(before);
    expect(after?.activity).toMatchObject({ current: expect.objectContaining({ activeSeconds: 0 }) });
    expect(await countSessions(admin.uid)).toBe(visitsBefore + 1);
    expect(await docExists(`drafts/week2interviews_${admin.uid}`)).toBe(false);
  });
});

// A pledge can point their own sign-in at another mailbox through Firebase. The
// account is then no longer the one the chairs issued, so the portal refuses it
// until an admin's password link puts the address back.
describe("an account whose sign-in address is no longer the one it was issued with", () => {
  const ISSUED = "robin.vale@uci.edu";
  const MOVED = "robin.vale+elsewhere@uci.edu";
  const PASSWORD = "chosen-by-the-pledge-1";
  let robinUid = "";

  it(
    "is refused, without affecting anyone else",
    async () => {
      const robin = await newPledge(ISSUED, "Robin Vale");
      robinUid = robin.uid;
      expect((await me(robin)).email).toBe(ISSUED);

      await testAuth().updateUser(robinUid, { email: MOVED, emailVerified: true });
      const moved = await signIn(MOVED, PASSWORD);
      const refusal = refused(await call(getMe, {}, { token: moved.token }), 403, "email_not_allowed");
      expect(refusal.error).toBe("This account doesn't have access to the portal.");
      // Refused everywhere, not only where the page first asks who it is: the
      // issued address is recorded on the account when the portal creates it.
      refused(await call(getDashboard, {}, { token: moved.token }), 403, "email_not_allowed");
      refused(await call(listSubmissions, {}, { token: moved.token }), 403, "email_not_allowed");
      refused(await call(heartbeat, {}, { method: "POST", token: moved.token, body: {} }), 403, "email_not_allowed");
      expect((await me(avery)).email).toBe(AVERY);
    },
    SLOW_TEST_MS,
  );

  it(
    "is put back by the admin's password link, which is for the issued address",
    async () => {
      const stillSignedIn = await signIn(MOVED, PASSWORD);
      await sleep(1100);
      const result = ok<InviteLinkDto>(
        await call(inviteLink, { uid: robinUid }, { method: "POST", token: admin.token, body: {} }),
      );
      expect((await testAuth().getUser(robinUid)).email).toBe(ISSUED);
      // Whoever moved the address is shut out: their session is ended and the
      // password they knew no longer works with either address.
      refused(await call(getMe, {}, { token: stillSignedIn.token }), 401, "session_revoked");
      expect(await signInFailure(ISSUED, PASSWORD)).toMatch(/INVALID|PASSWORD/);
      expect(await signInFailure(MOVED, PASSWORD)).not.toBe("");
      // The record of the repair keeps the address it had been moved to.
      const entries = await testDb().collection("auditLog").where("targetId", "==", robinUid).get();
      const summaries = entries.docs.map((doc) => String(doc.get("summary")));
      expect(summaries).toContain(
        `Created a set-password link for ${ISSUED} and restored its sign-in address, which had been changed to ${MOVED}`,
      );

      const code = new URL(result.inviteLink).searchParams.get("oobCode") ?? "";
      expect(await redeemResetCode(code, "chosen-again-by-robin-2")).toBe(true);
      const back = await signIn(ISSUED, "chosen-again-by-robin-2");
      expect((await me(back)).email).toBe(ISSUED);
    },
    SLOW_TEST_MS,
  );

  // Firebase ends sign-ins by the whole second. Ended only as the address is put back, a
  // sign-in made in that same second by whoever moved it would be left standing, and once
  // renewed it would carry the issued address and open the portal. The repair waits for the
  // next second and ends them again, as issuing a temporary password does.
  it(
    "shuts out a sign-in made at the moved address in the very second the link was asked for",
    async () => {
      const issued = "wren.sato@uci.edu";
      const movedTo = "wren.sato+elsewhere@uci.edu";
      const wren = await newPledge(issued, "Wren Sato");
      await testAuth().updateUser(wren.uid, { email: movedTo, emailVerified: true });

      const lastMoment = await signInEarlyInASecond(movedTo, PASSWORD);
      const from = Date.now();
      ok<InviteLinkDto>(await call(inviteLink, { uid: wren.uid }, { method: "POST", token: admin.token, body: {} }));
      const by = Date.now();
      // The sign-in and the request were in the same second.
      expect(Math.floor(lastMoment.signedInAtMs / 1000)).toBe(Math.floor(from / 1000));
      const signedInAt = Number(claimsOf(lastMoment.token).auth_time);
      expect(signedInAt).toBe(Math.floor(from / 1000));
      expect((await testAuth().getUser(wren.uid)).email).toBe(issued);

      // Sign-ins are only honoured from a later second than that one, which the request waited for, and not much longer.
      const validFrom = Date.parse((await testAuth().getUser(wren.uid)).tokensValidAfterTime ?? "") / 1000;
      expect(validFrom).toBeGreaterThan(signedInAt);
      expect(Math.floor(by / 1000)).toBeGreaterThan(Math.floor(from / 1000));
      expect(by - from).toBeLessThan(5_000);
      for (const result of [await call(getMe, {}, { token: lastMoment.token }), await call(getDashboard, {}, { token: lastMoment.token })]) {
        expect(refused(result, 401, "session_revoked").error).toBe("Your session has ended. Sign in again.");
      }
      // Nobody has signed in since, so the emulator's renewed token is dated as Firebase's would be.
      // It names the issued address now, and must not be honoured for that.
      const again = await renewed(lastMoment);
      if (again !== null) {
        refused(await call(getMe, {}, { token: again.token }), 401, "session_revoked");
        refused(await call(getDashboard, {}, { token: again.token }), 401, "session_revoked");
      }
      // The password they knew is no use with either address.
      expect(await signInFailure(issued, PASSWORD)).toMatch(/INVALID|PASSWORD/);
      expect(await signInFailure(movedTo, PASSWORD)).not.toBe("");
    },
    SLOW_TEST_MS,
  );
});

describe("the welcome tour", () => {
  let finishedAt: string;

  it("is recorded, with the server's time, when a pledge finishes it", async () => {
    expect(await storedMs(jordan.uid)).toBeNull();
    const result = await finishTour(jordan);
    const body = ok<{ onboardedAt: string }>(result);
    expect(Object.keys(body)).toEqual(["onboardedAt"]);
    finishedAt = body.onboardedAt;
    expect(Math.abs(Date.parse(finishedAt) - Date.now())).toBeLessThan(60_000);

    expect(await storedMs(jordan.uid)).toBe(Date.parse(finishedAt));
    expect((await me(jordan)).onboardedAt).toBe(finishedAt);
  });

  it("shows admins that the pledge has finished it", async () => {
    const overview = ok<AdminOverviewDto>(await call(getOverview, {}, { token: admin.token }));
    expect(overview.pledges.find((pledge) => pledge.uid === jordan.uid)?.onboardedAt).toBe(finishedAt);
    // Nobody else's changed: Casey has still not been through it.
    expect(overview.pledges.find((pledge) => pledge.uid === caseyUid)?.onboardedAt).toBeNull();
  });

  it("keeps the first time when it is finished again", async () => {
    const before = await docData(`users/${jordan.uid}`);
    await sleep(50);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(ok<{ onboardedAt: string }>(await finishTour(jordan)).onboardedAt).toBe(finishedAt);
    }
    expect(await docData(`users/${jordan.uid}`)).toEqual(before);
    expect((await me(jordan)).onboardedAt).toBe(finishedAt);
  });

  it("gives a pledge who finished it long ago that same time back, and changes nothing", async () => {
    const before = await dumpPortal();
    const seeded = (await me(sam)).onboardedAt;
    expect(ok<{ onboardedAt: string }>(await finishTour(sam)).onboardedAt).toBe(seeded);
    expect(Date.parse(seeded ?? "")).toBeLessThan(Date.now() - 19 * 86_400_000);
    expect(await dumpPortal()).toEqual(before);
  });

  it("takes nothing from the request: a pledge cannot choose the time, or finish it for someone else", async () => {
    const session = await newPledge("tour.taker@uci.edu", "Tour Taker");
    const profileBefore = await docData(`users/${session.uid}`);
    const result = ok<{ onboardedAt: string }>(
      await finishTour(session, {
        onboardedAt: "2000-01-01T00:00:00.000Z",
        uid: caseyUid,
        email: CASEY,
        role: "admin",
        status: "disabled",
        teamId: "teamatlas",
      }),
    );
    expect(Math.abs(Date.parse(result.onboardedAt) - Date.now())).toBeLessThan(60_000);

    // Only the caller's own tour was recorded, and nothing else on their profile moved.
    const profileAfter = await docData(`users/${session.uid}`);
    expect({ ...profileAfter, onboardedAt: null }).toEqual(profileBefore);
    expect(await storedMs(session.uid)).toBe(Date.parse(result.onboardedAt));
    expect(await storedMs(caseyUid)).toBeNull();
    expect(await docData(`users/${caseyUid}`)).toMatchObject({ role: "pledge", status: "active", teamId: null });
  });

  it(
    "records one time, and gives it to every request, when several arrive at once",
    async () => {
      const session = await newPledge("tour.twice@uci.edu", "Tour Twice");
      const results = await Promise.all(Array.from({ length: 5 }, () => finishTour(session)));
      const times = results.map((result) => ok<{ onboardedAt: string }>(result).onboardedAt);
      const stored = await storedMs(session.uid);
      expect(stored).not.toBeNull();
      expect(times).toEqual(Array.from({ length: 5 }, () => new Date(stored ?? 0).toISOString()));
    },
    SLOW_TEST_MS,
  );

  it("is not open to admins, and leaves their profile alone", async () => {
    const before = await docData(`users/${admin.uid}`);
    expect(refused(await finishTour(admin), 403, "forbidden").error).toBe("You don't have permission to do that.");
    refused(await finishTour(adminTwo), 403, "forbidden");
    // Whatever the request says about who is asking.
    refused(await finishTour(admin, { role: "pledge", uid: jordan.uid }), 403, "forbidden");
    expect(await docData(`users/${admin.uid}`)).toEqual(before);
    expect((await me(admin)).onboardedAt).toBeNull();
  });

  describe("for an active", () => {
    let active: Session;
    let finishedAt: string;

    it("is still to do for an active who has just chosen a password", async () => {
      active = await newActive("welcome.active@uci.edu", "Welcome Active");
      expect(await me(active)).toMatchObject({ role: "active", email: "welcome.active@uci.edu", pledgeClass: null, team: null, onboardedAt: null });
      expect(await storedMs(active.uid)).toBeNull();
    });

    it("is recorded with the server's time when they finish it, and takes nothing from the request", async () => {
      const profileBefore = await docData(`users/${active.uid}`);
      const result = ok<{ onboardedAt: string }>(
        await finishTour(active, { onboardedAt: "2000-01-01T00:00:00.000Z", uid: jordan.uid, email: JORDAN, role: "pledge", status: "disabled" }),
      );
      expect(Object.keys(result)).toEqual(["onboardedAt"]);
      finishedAt = result.onboardedAt;
      expect(Math.abs(Date.parse(finishedAt) - Date.now())).toBeLessThan(60_000);

      // Only their own welcome was recorded, and nothing else on their profile moved.
      const profileAfter = await docData(`users/${active.uid}`);
      expect({ ...profileAfter, onboardedAt: null }).toEqual(profileBefore);
      expect(profileAfter).toMatchObject({ role: "active", status: "active", teamId: null });
      expect(await storedMs(active.uid)).toBe(Date.parse(finishedAt));
      expect(await docData(`users/${jordan.uid}`)).toMatchObject({ role: "pledge", status: "active" });
    });

    it("is told to them from then on, and keeps the first time when finished again", async () => {
      expect((await me(active)).onboardedAt).toBe(finishedAt);
      const before = await docData(`users/${active.uid}`);
      await sleep(50);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect(ok<{ onboardedAt: string }>(await finishTour(active)).onboardedAt).toBe(finishedAt);
      }
      expect(await docData(`users/${active.uid}`)).toEqual(before);
      // This active has never sent a beat, so nothing of a visit has been recorded.
      expect(before?.activity).toEqual({ firstSeenAt: null, lastSeenAt: null, totalActiveSeconds: 0, sessionCount: 0, current: null });
      expect(await countSessions(active.uid)).toBe(0);
    });

    it("gives an active who finished it long ago that same time back, and changes nothing", async () => {
      const priya = await signIn(PRIYA);
      const before = await dumpPortal();
      const seeded = (await me(priya)).onboardedAt;
      expect(Date.parse(seeded ?? "")).toBeLessThan(Date.now() - 23 * 86_400_000);
      expect(ok<{ onboardedAt: string }>(await finishTour(priya)).onboardedAt).toBe(seeded);
      expect(await dumpPortal()).toEqual(before);
    });

    it(
      "records one time, and gives it to every request, when several arrive at once",
      async () => {
        const session = await newActive("welcome.twice@uci.edu", "Welcome Twice");
        const results = await Promise.all(Array.from({ length: 5 }, () => finishTour(session)));
        const times = results.map((result) => ok<{ onboardedAt: string }>(result).onboardedAt);
        const stored = await storedMs(session.uid);
        expect(stored).not.toBeNull();
        expect(times).toEqual(Array.from({ length: 5 }, () => new Date(stored ?? 0).toISOString()));
      },
      SLOW_TEST_MS,
    );

    it("refuses an active account that has no portal profile, without creating one", async () => {
      const session = await createAccount("welcome.no.profile@uci.edu", { claims: { role: "active" } });
      refused(await finishTour(session), 403, "no_profile");
      expect(await docExists(`users/${session.uid}`)).toBe(false);
    });
  });

  it("refuses a pledge account that has no portal profile, without creating one", async () => {
    const session = await createAccount("tour.no.profile@uci.edu", { claims: { role: "pledge" } });
    refused(await finishTour(session), 403, "no_profile");
    expect(await docExists(`users/${session.uid}`)).toBe(false);
  });

  it("writes nothing to the audit log, which is for what admins do", async () => {
    const before = await countAll("auditLog");
    ok(await finishTour(jordan));
    ok(await finishTour(sam));
    expect(await countAll("auditLog")).toBe(before);
  });
});

describe("signing out", () => {
  let second: Session;

  it(
    "ends the sign-in on the server: the token that asked is refused from then on",
    async () => {
      second = await signIn(SAM);
      ok(await call(getMe, {}, { token: second.token }));
      // Revocation is recorded to the second, so the token must be from an earlier second.
      await sleep(1100);

      expect(ok(await leave(second))).toEqual({ ok: true });

      const refusal = refused(await call(getMe, {}, { token: second.token }), 401, "session_revoked");
      expect(refusal.error).toBe("Your session has ended. Sign in again.");
      refused(await call(getDashboard, {}, { token: second.token }), 401, "session_revoked");
      refused(await call(listSubmissions, {}, { token: second.token }), 401, "session_revoked");
      refused(await call(heartbeat, {}, { method: "POST", token: second.token }), 401, "session_revoked");
      refused(await finishTour(second), 401, "session_revoked");
    },
    SLOW_TEST_MS,
  );

  it("ends it everywhere, not only in the browser that asked: an earlier sign-in of the same pledge stops too", async () => {
    refused(await call(getMe, {}, { token: sam.token }), 401, "session_revoked");
    refused(await call(getDashboard, {}, { token: sam.token }), 401, "session_revoked");
  });

  it("cannot be repeated with the token it ended", async () => {
    refused(await leave(second), 401, "session_revoked");
    refused(await leave(sam), 401, "session_revoked");
  });

  it("leaves every other account signed in, teammates included", async () => {
    expect((await me(avery)).email).toBe(AVERY);
    expect((await me(jordan)).email).toBe(JORDAN);
    expect((await me(maya)).email).toBe(MAYA);
    expect((await me(admin)).email).toBe(ADMIN_ONE);
    ok(await call(getOverview, {}, { token: adminTwo.token }));
  });

  it("does not disable the account or touch anything the pledge has stored", async () => {
    const record = await testAuth().getUser(sam.uid);
    expect(record.disabled).toBe(false);
    expect(record.customClaims).toEqual({ role: "pledge", issued: SAM });
    expect(await docData(`users/${sam.uid}`)).toMatchObject({ email: SAM, status: "active", role: "pledge" });
  });

  it("lets the pledge straight back in with a new sign-in", async () => {
    sam = await signIn(SAM);
    expect((await me(sam)).email).toBe(SAM);
    ok(await call(getDashboard, {}, { token: sam.token }));
    // The tokens from before stay dead.
    refused(await call(getMe, {}, { token: second.token }), 401, "session_revoked");
  });

  it(
    "changes nothing in the database, and nothing about any account but the caller's sign-in",
    async () => {
      await sleep(1100);
      const before = await dumpPortal();
      ok(await leave(sam));
      const after = await dumpPortal();

      expect(after.firestore).toEqual(before.firestore);
      const { [sam.uid]: mineBefore, ...othersBefore } = before.accounts;
      const { [sam.uid]: mineAfter, ...othersAfter } = after.accounts;
      expect(othersAfter).toEqual(othersBefore);
      // Only the moment from which this account's tokens count has moved.
      expect(mineAfter).not.toEqual(mineBefore);
      expect({ ...(mineAfter as object), tokensValidAfter: null }).toEqual({ ...(mineBefore as object), tokensValidAfter: null });
      sam = await signIn(SAM);
    },
    SLOW_TEST_MS,
  );

  it(
    "only ever signs out the caller, whatever uid or email the request names",
    async () => {
      await sleep(1100);
      ok(await leave(maya, { uid: avery.uid, email: AVERY, uids: [avery.uid, jordan.uid, admin.uid] }));
      const named = await call(signOut, {}, {
        method: "POST",
        token: jordan.token,
        body: {},
        query: `?uid=${avery.uid}`,
        headers: { "x-uid": avery.uid },
      });
      ok(named);

      refused(await call(getMe, {}, { token: maya.token }), 401, "session_revoked");
      refused(await call(getMe, {}, { token: jordan.token }), 401, "session_revoked");
      expect((await me(avery)).email).toBe(AVERY);
      expect((await me(admin)).email).toBe(ADMIN_ONE);
      [maya, jordan] = await Promise.all([signIn(MAYA), signIn(JORDAN)]);
    },
    SLOW_TEST_MS,
  );

  it(
    "works for an admin too, and leaves the other admin signed in",
    async () => {
      await sleep(1100);
      expect(ok(await leave(adminTwo))).toEqual({ ok: true });
      refused(await call(getOverview, {}, { token: adminTwo.token }), 401, "session_revoked");
      refused(await call(getMe, {}, { token: adminTwo.token }), 401, "session_revoked");
      ok(await call(getOverview, {}, { token: admin.token }));

      const again = await signIn(ADMIN_TWO);
      expect((await me(again)).role).toBe("admin");
    },
    SLOW_TEST_MS,
  );

  it("writes nothing to the audit log", async () => {
    const before = await countAll("auditLog");
    const throwaway = await signIn(AVERY);
    ok(await leave(throwaway));
    expect(await countAll("auditLog")).toBe(before);
  });

  // Ending a session has to work even while someone else is flooding the account.
  it(
    "still works for an account that is over its request ceilings",
    async () => {
      const session = await signIn(SAM);
      const beat = () => call(heartbeat, {}, { method: "POST", token: session.token, body: {} });
      for (let index = 0; index < RATE_LIMITS.writesPerMinute; index += 1) ok(await beat());
      refused(await beat(), 429, "rate_limited");
      // Firebase ends sessions to the second, so the sign-out must fall in a later second than the sign-in.
      await sleep(1100);

      expect(ok(await leave(session))).toEqual({ ok: true });
      refused(await call(getMe, {}, { token: session.token }), 401, "session_revoked");
      sam = await signIn(SAM);
    },
    SLOW_TEST_MS,
  );
});
