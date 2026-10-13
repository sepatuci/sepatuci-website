/**
 * The Activity pages: who is in the portal, each person's visits, and each
 * visit page by page. Everyone signed in is timed, admins included; a preview
 * account is nobody and never appears. Tests run in order from a fresh seed.
 */
import { Timestamp } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getActivity } from "@/app/api/portal/admin/activity/route";
import { GET as getPersonActivity } from "@/app/api/portal/admin/activity/[uid]/route";
import { GET as getSessionDetail } from "@/app/api/portal/admin/activity/[uid]/sessions/[sessionId]/route";
import { GET as getPledgeDetail } from "@/app/api/portal/admin/pledges/[uid]/route";
import { DELETE as removePreview, POST as startPreview } from "@/app/api/portal/admin/preview/route";
import { POST as heartbeat } from "@/app/api/portal/heartbeat/route";
import { GET as getMe } from "@/app/api/portal/me/route";
import { POST as choosePassword } from "@/app/api/portal/password/route";
import { POST as redeemPreview } from "@/app/api/portal/preview/redeem/route";
import { POST as signOut } from "@/app/api/portal/sign-out/route";
import { LIMITS, PORTAL_TIME_ZONE, TIMING } from "@/lib/portal/constants";
import { resetRateLimits } from "@/lib/portal/server/rate-limit";
import type {
  ActivityOverviewDto,
  ActivityPersonDetailDto,
  PledgeDetailDto,
  PreviewRedeemDto,
  PreviewStartResultDto,
  SessionDetailDto,
} from "@/lib/portal/types";
import {
  ADMIN_ONE,
  AVERY,
  CASEY,
  OWN_PASSWORD,
  PRIYA,
  SEED_TIMEOUT_MS,
  SLOW_TEST_MS,
  ageLastHeartbeat,
  ageSignIn,
  call,
  countSessions,
  createAccount,
  createProfile,
  docData,
  ok,
  refused,
  seedPortal,
  signIn,
  sleep,
  testDb,
  uidOf,
  type Session,
} from "./helpers";

const CHROME_ON_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const SAFARI_ON_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const SECOND = 1000;
const MINUTE = 60 * SECOND;

let admin: Session;
let priya: Session;
let avery: Session;
/** Seeded, never signed in and never seen: nothing of a visit on them. */
let caseyUid: string;
/** New members of this file's own, so that their visits start from nothing. */
let timer: Session;
let timerTwo: Session;

const beat = (session: Session, body: unknown = {}, userAgent = CHROME_ON_MAC) =>
  call(heartbeat, {}, { method: "POST", token: session.token, body, headers: { "user-agent": userAgent } });
const overview = async (token = admin.token) => ok<ActivityOverviewDto>(await call(getActivity, {}, { token }));
const personOf = async (uid: string, token = admin.token) =>
  ok<ActivityPersonDetailDto>(await call(getPersonActivity, { uid }, { token }));
const sessionOf = async (uid: string, sessionId: string, token = admin.token) =>
  ok<SessionDetailDto>(await call(getSessionDetail, { uid, sessionId }, { token }));
const rowOf = async (uid: string) => {
  const row = (await overview()).people.find((person) => person.uid === uid);
  if (!row) throw new Error(`${uid} is not in the overview`);
  return row;
};
/** One of a person's visits by id: ageing a visit moves its start back too, so its place in the list is no guide. */
const sessionRow = async (uid: string, sessionId: string) => {
  const row = (await personOf(uid)).sessions.find((session) => session.id === sessionId);
  if (!row) throw new Error(`${uid} has no session ${sessionId}`);
  return row;
};
/** The visit in progress, as stored on the profile. */
const currentOf = async (uid: string) =>
  ((await docData(`users/${uid}`))?.activity as { current: Record<string, unknown> | null } | undefined)?.current ?? null;
const storedSession = (uid: string, sessionId: string) => docData(`users/${uid}/sessions/${sessionId}`);

beforeAll(async () => {
  await seedPortal();
  [admin, priya, avery] = await Promise.all([ADMIN_ONE, PRIYA, AVERY].map((email) => signIn(email)));
  caseyUid = await uidOf(CASEY);
  timer = await createAccount("timer.one@uci.edu", { claims: { role: "pledge", issued: "timer.one@uci.edu" } });
  await createProfile(timer.uid, "timer.one@uci.edu", "pledge", "Timer One");
  timerTwo = await createAccount("timer.two@uci.edu", { claims: { role: "pledge", issued: "timer.two@uci.edu" } });
  await createProfile(timerTwo.uid, "timer.two@uci.edu", "pledge", "Timer Two");
}, SEED_TIMEOUT_MS);

beforeEach(() => {
  resetRateLimits();
});

describe("who may look", () => {
  it("is admins only, on all three routes", async () => {
    for (const session of [avery, priya]) {
      refused(await call(getActivity, {}, { token: session.token }), 403, "forbidden");
      refused(await call(getPersonActivity, { uid: avery.uid }, { token: session.token }), 403, "forbidden");
      refused(await call(getSessionDetail, { uid: avery.uid, sessionId: "abc123" }, { token: session.token }), 403, "forbidden");
    }
    refused(await call(getActivity, {}, {}), 401, "unauthenticated");
  });

  it("is not found for an unknown account, an unsafe uid, or an unknown session", async () => {
    expect(refused(await call(getPersonActivity, { uid: "nobody123" }, { token: admin.token }), 404, "not_found").error).toBe("That account doesn't exist.");
    expect(refused(await call(getSessionDetail, { uid: avery.uid, sessionId: "nope123" }, { token: admin.token }), 404, "not_found").error).toBe(
      "That session doesn't exist.",
    );
    for (const uid of ["../users", "a b"]) {
      refused(await call(getPersonActivity, { uid }, { token: admin.token }), 404, "not_found");
      refused(await call(getSessionDetail, { uid, sessionId: "abc123" }, { token: admin.token }), 404, "not_found");
    }
    for (const sessionId of ["../x", ""]) {
      refused(await call(getSessionDetail, { uid: avery.uid, sessionId }, { token: admin.token }), 404, "not_found");
    }
  });
});

describe("the first beat of a visit", () => {
  let sessionId: string;

  it("opens a session document at once, with the device and the page, and nothing is over yet", async () => {
    expect(await countSessions(timer.uid)).toBe(0);
    expect(ok(await beat(timer, { path: "/portal" }))).toEqual({ ok: true });

    const current = await currentOf(timer.uid);
    expect(current).toMatchObject({ activeSeconds: 0, lastPath: "/portal", pageCount: 1, leaving: false });
    expect(typeof current?.sessionId).toBe("string");
    sessionId = current?.sessionId as string;
    expect(current?.signedInAt).toBeInstanceOf(Timestamp);
    expect(await countSessions(timer.uid)).toBe(1);

    const stored = await storedSession(timer.uid, sessionId);
    expect(stored).toMatchObject({
      uid: timer.uid,
      endedAt: null,
      endReason: null,
      activeSeconds: 0,
      device: "Chrome on macOS",
      pageCount: 1,
    });
    expect(stored?.pages).toEqual([{ path: "/portal", at: current?.lastSeenAt }]);
    expect(stored?.signedInAt).toEqual(current?.signedInAt);
    expect(stored?.startedAt).toEqual(current?.startedAt);
  });

  it("shows in the overview as online, on that page, with the day in the chapter's time zone", async () => {
    const body = await overview();
    expect(Object.keys(body).sort()).toEqual(["day", "people", "serverNow", "timeZone"]);
    expect(body.timeZone).toBe(PORTAL_TIME_ZONE);
    expect(body.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const row = body.people.find((person) => person.uid === timer.uid);
    expect(row).toMatchObject({
      displayName: "Timer One",
      role: "pledge",
      online: true,
      currentPath: "/portal",
      currentPageLabel: "Dashboard",
      currentSessionId: sessionId,
      todayActiveSeconds: 0,
      totalActiveSeconds: 0,
      sessionCount: 1,
      accountState: "active",
    });
    expect(Date.parse(row?.lastSeenAt ?? "")).toBeGreaterThan(Date.now() - MINUTE);
    expect(body.people[0].online).toBe(true);
  });

  it("is the one session on the person's page, still open, and its page is the current one", async () => {
    const detail = await personOf(timer.uid);
    expect(detail.person.uid).toBe(timer.uid);
    expect(detail.sessions).toHaveLength(1);
    expect(detail.sessions[0]).toMatchObject({
      id: sessionId,
      endedAt: null,
      endReason: null,
      activeSeconds: 0,
      pageCount: 1,
      device: "Chrome on macOS",
      current: true,
    });
    expect(detail.sessions[0].signedInAt).not.toBeNull();
    expect("pages" in detail.sessions[0]).toBe(false);

    const session = await sessionOf(timer.uid, sessionId);
    expect(session.session).toEqual(detail.sessions[0]);
    expect(session.pages).toEqual([{ path: "/portal", label: "Dashboard", at: expect.any(String), dwellSeconds: 0, current: true }]);
    expect(session.pageLogFull).toBe(false);
  });

  it("never sends the browser's own description, only the short label", async () => {
    const texts = [JSON.stringify(await overview()), JSON.stringify(await personOf(timer.uid)), JSON.stringify(await sessionOf(timer.uid, sessionId))];
    for (const text of texts) {
      expect(text).not.toContain("Mozilla");
      expect(text).not.toContain("AppleWebKit");
    }
    for (const text of texts.slice(1)) expect(text).toContain("Chrome on macOS");
  });
});

describe("pages", () => {
  let sessionId: string;

  it("logs a change of page straight away, without crediting time for a beat that comes too soon", async () => {
    sessionId = (await currentOf(timer.uid))?.sessionId as string;
    const before = await personOf(timer.uid);
    ok(await beat(timer, { path: "/portal/deliverables/week2interviews" }));
    const after = await personOf(timer.uid);
    expect(after.person.totalActiveSeconds).toBe(before.person.totalActiveSeconds);
    expect(after.sessions[0].pageCount).toBe(2);
    const pages = (await sessionOf(timer.uid, sessionId)).pages;
    expect(pages.map((page) => page.path)).toEqual(["/portal", "/portal/deliverables/week2interviews"]);
    expect(pages[1].label).toMatch(/^Deliverable: .+/);
    expect(pages[1].label).not.toContain("since removed");
    expect(pages[1].current).toBe(true);
    expect(pages[0].current).toBe(false);
  });

  it("logs the same page once, however many beats say it", async () => {
    ok(await beat(timer, { path: "/portal/deliverables/week2interviews" }));
    ok(await beat(timer, { path: "/portal/deliverables/week2interviews", resume: true }));
    expect((await personOf(timer.uid)).sessions[0].pageCount).toBe(2);
    expect((await sessionOf(timer.uid, sessionId)).pages).toHaveLength(2);
  });

  it("ignores a path that is not a plain portal page", async () => {
    for (const path of ["/portal/deliverables/x?y=1", "/portal/a#b", "/login", "/portal/..", "//portal", "/portal/", "/portal" + "/abcdefghij".repeat(20), "/portal/" + "x".repeat(LIMITS.pagePath), 7, null, { path: "/portal" }]) {
      ok(await beat(timer, { path }));
    }
    expect((await personOf(timer.uid)).sessions[0].pageCount).toBe(2);
  });

  it("says how long each page was open, up to the next one or until the person was last seen", async () => {
    await ageLastHeartbeat(timer.uid, 30 * SECOND);
    ok(await beat(timer, { path: "/portal/history" }));
    const pages = (await sessionOf(timer.uid, sessionId)).pages;
    expect(pages.map((page) => page.path)).toEqual(["/portal", "/portal/deliverables/week2interviews", "/portal/history"]);
    expect(pages[1].dwellSeconds).toBeGreaterThanOrEqual(29);
    expect(pages[1].dwellSeconds).toBeLessThanOrEqual(32);
    expect(pages[2]).toMatchObject({ label: "History", dwellSeconds: 0, current: true });
    // That beat came after a pause, so the time was credited and the day's tally began.
    const row = await rowOf(timer.uid);
    expect(row.totalActiveSeconds).toBeGreaterThanOrEqual(30);
    expect(row.todayActiveSeconds).toBe(row.totalActiveSeconds);
  });

  it("stops logging at the cap, keeps counting, and says the log is full", async () => {
    const filler = Array.from({ length: LIMITS.sessionPages - 2 }, (_, index) => ({
      path: `/portal/history/p${index}`,
      at: Timestamp.now(),
    }));
    await testDb().doc(`users/${timer.uid}/sessions/${sessionId}`).update({ pages: filler, pageCount: filler.length });
    await testDb().doc(`users/${timer.uid}`).update({ "activity.current.pageCount": filler.length, "activity.current.lastPath": filler[filler.length - 1].path });

    ok(await beat(timer, { path: "/portal/account" }));
    ok(await beat(timer, { path: "/portal/guide" }));
    expect((await personOf(timer.uid)).sessions[0].pageCount).toBe(LIMITS.sessionPages);
    ok(await beat(timer, { path: "/portal/history/beyond" }));
    ok(await beat(timer, { path: "/portal/history/further" }));
    const detail = await sessionOf(timer.uid, sessionId);
    expect(detail.session.pageCount).toBe(LIMITS.sessionPages);
    expect(detail.pages).toHaveLength(LIMITS.sessionPages);
    expect(detail.pages[detail.pages.length - 1].path).toBe("/portal/guide");
    expect(detail.pageLogFull).toBe(true);
    // The page they are on is still known, even though it is not in the log.
    expect((await rowOf(timer.uid)).currentPath).toBe("/portal/history/further");
  });
});

describe("how visits end", () => {
  it("ends with a sign-out, which also ends the sign-in everywhere, and the next beat starts a new visit", async () => {
    const before = await personOf(timer.uid);
    const open = before.sessions[0];
    expect(open.current).toBe(true);
    await sleep(1100);
    ok(await call(signOut, {}, { method: "POST", token: timer.token }));

    expect(await currentOf(timer.uid)).toBeNull();
    const after = await personOf(timer.uid);
    expect(after.sessions[0]).toMatchObject({ id: open.id, endReason: "signed_out", current: false, pageCount: open.pageCount });
    expect(Date.parse(after.sessions[0].endedAt ?? "")).toBeGreaterThan(Date.now() - 10 * SECOND);
    expect((await rowOf(timer.uid))).toMatchObject({ online: false, currentPath: null, currentSessionId: null, sessionCount: 1 });
    refused(await beat(timer), 401, "session_revoked");

    timer = await signIn("timer.one@uci.edu");
    ok(await beat(timer, { path: "/portal" }, SAFARI_ON_IPHONE));
    const again = await personOf(timer.uid);
    expect(again.person.sessionCount).toBe(2);
    expect(again.sessions).toHaveLength(2);
    expect(again.sessions[0]).toMatchObject({ current: true, device: "Safari on iPhone", pageCount: 1 });
    expect(again.sessions[1].id).toBe(open.id);
    expect(await countSessions(timer.uid)).toBe(2);
  }, SLOW_TEST_MS);

  it("ends with an idle beat that leaves the sign-in itself alone", async () => {
    const open = (await personOf(timer.uid)).sessions[0];
    ok(await beat(timer, { idle: true }));
    expect((await personOf(timer.uid)).sessions[0]).toMatchObject({ id: open.id, endReason: "idle", current: false });
    expect(await currentOf(timer.uid)).toBeNull();
    // The same sign-in still works: another tab may be in the middle of something.
    ok(await call(getMe, {}, { token: timer.token }));
    ok(await beat(timer, { path: "/portal" }));
    expect((await personOf(timer.uid)).person.sessionCount).toBe(3);
  });

  it("changes nothing on an idle beat with no visit in progress, and a sign-out with a body still ends the sign-in", async () => {
    ok(await beat(timer, { idle: true }));
    expect(await currentOf(timer.uid)).toBeNull();
    ok(await beat(timer, { idle: true }));
    expect(await currentOf(timer.uid)).toBeNull();
    expect((await personOf(timer.uid)).person.sessionCount).toBe(3);
    // The sign-out route takes no reason: whatever is sent, it ends the sign-in everywhere.
    // Revocation is to the second, so the token must be at least that old.
    await sleep(1100);
    ok(await call(signOut, {}, { method: "POST", token: timer.token, body: { reason: "idle" } }));
    refused(await beat(timer), 401, "session_revoked");
    timer = await signIn("timer.one@uci.edu");
  });

  it("is read as having gone quiet, from the moment the person was last seen, before any beat says so", async () => {
    ok(await beat(timer, { path: "/portal" }));
    const open = (await personOf(timer.uid)).sessions[0];
    expect(open.current).toBe(true);
    await ageLastHeartbeat(timer.uid, TIMING.sessionGapMs + 2 * SECOND);
    const quiet = await sessionRow(timer.uid, open.id);
    expect(quiet).toMatchObject({ endReason: "timed_out", current: false });
    expect(Date.parse(quiet.endedAt ?? "")).toBeLessThan(Date.now() - TIMING.sessionGapMs);
    expect((await rowOf(timer.uid))).toMatchObject({ online: false, currentPath: null });
    // The document itself is only closed by the next beat, which starts a new visit.
    expect((await storedSession(timer.uid, open.id))?.endedAt).toBeNull();
    ok(await beat(timer, { path: "/portal" }));
    expect(await storedSession(timer.uid, open.id)).toMatchObject({ endReason: "timed_out" });
    expect((await personOf(timer.uid)).person.sessionCount).toBe(5);
  });

  it("is read as closed when the last thing the tab said was that it was leaving", async () => {
    ok(await beat(timer, { path: "/portal/history", leaving: true }));
    expect(await currentOf(timer.uid)).toMatchObject({ leaving: true });
    // Heard from again: not leaving after all.
    await ageLastHeartbeat(timer.uid, 25 * SECOND);
    ok(await beat(timer, { path: "/portal/history" }));
    expect(await currentOf(timer.uid)).toMatchObject({ leaving: false });
    ok(await beat(timer, { path: "/portal/account", leaving: true }));
    const leaving = (await currentOf(timer.uid))?.sessionId as string;
    await ageLastHeartbeat(timer.uid, TIMING.sessionGapMs + 2 * SECOND);
    expect(await sessionRow(timer.uid, leaving)).toMatchObject({ endReason: "left", current: false });
    ok(await beat(timer, { path: "/portal" }));
    expect(await sessionRow(timer.uid, leaving)).toMatchObject({ endReason: "left" });
    expect(await storedSession(timer.uid, leaving)).toMatchObject({ endReason: "left" });
  });

  it("is read as expired when the sign-in behind it had run out", async () => {
    const open = (await currentOf(timer.uid))?.sessionId as string;
    await ageSignIn(timer.uid, TIMING.maxSessionAgeMs + MINUTE);
    await ageLastHeartbeat(timer.uid, TIMING.sessionGapMs + 2 * SECOND);
    const expired = await sessionRow(timer.uid, open);
    expect(expired).toMatchObject({ endReason: "expired", current: false });
    expect(Date.parse(expired.signedInAt ?? "")).toBeLessThan(Date.now() - TIMING.maxSessionAgeMs);
  });

  it("is not minted by beats alone: a beat within the gap carries the visit on", async () => {
    const before = (await personOf(timer.uid)).person.sessionCount;
    ok(await beat(timer, { path: "/portal" }));
    const started = before + 1;
    for (let round = 0; round < 5; round += 1) {
      ok(await beat(timer, { path: `/portal/history/r${round}` }));
      ok(await beat(timer, { resume: true }));
      ok(await beat(timer, { leaving: true }));
    }
    expect((await personOf(timer.uid)).person.sessionCount).toBe(started);
  });
});

describe("everyone is timed", () => {
  it("lists an admin and an active once they have been seen, online and on their page", async () => {
    ok(await beat(admin, { path: "/portal/admin/activity" }));
    ok(await beat(priya, { path: "/portal/review" }, SAFARI_ON_IPHONE));
    const body = await overview();
    expect(body.people.find((person) => person.uid === admin.uid)).toMatchObject({
      role: "admin",
      online: true,
      currentPath: "/portal/admin/activity",
      currentPageLabel: "Activity",
      sessionCount: 1,
    });
    expect(body.people.find((person) => person.uid === priya.uid)).toMatchObject({
      role: "active",
      online: true,
      currentPageLabel: "Pledges",
      sessionCount: 1,
    });
    expect((await personOf(admin.uid)).sessions[0]).toMatchObject({ current: true, device: "Chrome on macOS" });
    expect((await personOf(priya.uid)).sessions[0]).toMatchObject({ current: true, device: "Safari on iPhone" });
    // Online first, then the rest by when they were last seen.
    const online = body.people.filter((person) => person.online).length;
    expect(body.people.slice(0, online).every((person) => person.online)).toBe(true);
    expect(body.people.slice(online).every((person) => !person.online)).toBe(true);
  });

  it("lists everyone with an account, the never-seen included, and labels a page by the person it is about", async () => {
    ok(await beat(admin, { path: `/portal/admin/pledges/${avery.uid}` }));
    const body = await overview();
    expect(body.people.map((person) => person.uid)).toContain(caseyUid);
    expect(body.people.find((person) => person.uid === caseyUid)).toMatchObject({
      online: false,
      currentPath: null,
      sessionCount: 0,
      lastSeenAt: null,
      accountState: "invited",
    });
    expect(body.people.find((person) => person.uid === admin.uid)?.currentPageLabel).toBe("Pledge: Avery Chen");
  });

  it("still lists a pledge's visit on their own page, the open one first", async () => {
    ok(await beat(avery, { path: "/portal" }));
    const detail = ok<PledgeDetailDto>(await call(getPledgeDetail, { uid: avery.uid }, { token: admin.token }));
    expect(detail.sessions[0]).toMatchObject({ current: true, endReason: null, pageCount: 1, device: "Chrome on macOS" });
    expect(typeof detail.sessions[0].id).toBe("string");
    expect(detail.sessions.slice(1).every((session) => session.id !== null && session.endReason === "timed_out" && !session.current)).toBe(true);
  });
});

describe("a preview account", () => {
  let sandboxUid: string;

  it("is nobody: its beats are kept but it is in no list, and its page is not found", async () => {
    const started = ok<PreviewStartResultDto>(await call(startPreview, {}, { method: "POST", token: admin.token, body: { role: "pledge" } }));
    sandboxUid = started.preview.uid;
    const redeemed = ok<PreviewRedeemDto>(await call(redeemPreview, {}, { method: "POST", body: { code: started.code } }));
    const temporary = await signIn(redeemed.email, redeemed.temporaryPassword);
    ok(await call(choosePassword, {}, { method: "POST", token: temporary.token, body: { password: OWN_PASSWORD } }));
    const sandbox = await signIn(redeemed.email, OWN_PASSWORD);
    ok(await beat(sandbox, { path: "/portal" }));
    expect(await countSessions(sandboxUid)).toBe(1);

    expect((await overview()).people.map((person) => person.uid)).not.toContain(sandboxUid);
    refused(await call(getPersonActivity, { uid: sandboxUid }, { token: admin.token }), 404, "not_found");
    refused(await call(getSessionDetail, { uid: sandboxUid, sessionId: (await currentOf(sandboxUid))?.sessionId as string }, { token: admin.token }), 404, "not_found");
    ok(await call(removePreview, {}, { method: "DELETE", token: admin.token }));
  }, SLOW_TEST_MS);
});

describe("a long history", () => {
  const HOUR = 3_600_000;

  it("lists only the two hundred most recent visits, newest first, and none of their pages", async () => {
    const visits = testDb().collection(`users/${caseyUid}/sessions`);
    const base = Date.now() - 24 * HOUR;
    let batch = testDb().batch();
    for (let index = 0; index < LIMITS.sessionHistory + 5; index += 1) {
      batch.create(visits.doc(), {
        uid: caseyUid,
        signedInAt: Timestamp.fromMillis(base - index * HOUR - MINUTE),
        startedAt: Timestamp.fromMillis(base - index * HOUR),
        lastSeenAt: Timestamp.fromMillis(base - index * HOUR + MINUTE),
        endedAt: Timestamp.fromMillis(base - index * HOUR + MINUTE),
        endReason: "timed_out",
        activeSeconds: index + 1,
        device: "Chrome on macOS",
        pages: [{ path: "/portal", at: Timestamp.fromMillis(base - index * HOUR) }],
        pageCount: 1,
      });
      if ((index + 1) % 100 === 0) {
        await batch.commit();
        batch = testDb().batch();
      }
    }
    await batch.commit();
    expect(await countSessions(caseyUid)).toBe(LIMITS.sessionHistory + 5);

    const detail = await personOf(caseyUid);
    expect(detail.sessions).toHaveLength(LIMITS.sessionHistory);
    expect(detail.sessions.map((session) => session.activeSeconds)).toEqual(Array.from({ length: LIMITS.sessionHistory }, (_, index) => index + 1));
    expect(detail.sessions.every((session) => !("pages" in session) && session.pageCount === 1 && session.endReason === "timed_out")).toBe(true);
    expect(JSON.stringify(detail)).not.toContain('"pages"');
  }, SLOW_TEST_MS);

  it("reads a visit from before pages and reasons were kept as a plain, finished one", async () => {
    const ref = testDb().collection(`users/${caseyUid}/sessions`).doc();
    const startedAt = Timestamp.fromMillis(Date.now() - 2 * HOUR);
    await ref.set({ uid: caseyUid, startedAt, endedAt: Timestamp.fromMillis(startedAt.toMillis() + MINUTE), activeSeconds: 42 });
    const session = await sessionOf(caseyUid, ref.id);
    expect(session.session).toMatchObject({
      id: ref.id,
      signedInAt: null,
      endReason: "timed_out",
      activeSeconds: 42,
      pageCount: 0,
      device: "",
      current: false,
    });
    expect(session.pages).toEqual([]);
    expect(session.pageLogFull).toBe(false);
  });
});

describe("a visit begun before visits had documents", () => {
  it("gets a document of its own on the next beat, keeping its start", async () => {
    // Seen three minutes ago: inside the five that keep a visit open, past the window that counts as online.
    const startedAt = Timestamp.fromMillis(Date.now() - 4 * MINUTE);
    const lastSeenAt = Timestamp.fromMillis(Date.now() - 3 * MINUTE);
    await testDb().doc(`users/${timerTwo.uid}`).update({
      "activity.firstSeenAt": startedAt,
      "activity.lastSeenAt": lastSeenAt,
      "activity.sessionCount": 1,
      "activity.current": { startedAt, lastSeenAt, activeSeconds: 60 },
    });
    expect((await personOf(timerTwo.uid)).person).toMatchObject({ online: false, sessionCount: 1 });
    expect((await personOf(timerTwo.uid)).sessions).toEqual([]);

    ok(await beat(timerTwo, { path: "/portal" }));
    const current = await currentOf(timerTwo.uid);
    expect(current).toMatchObject({ startedAt, pageCount: 1, lastPath: "/portal" });
    expect(typeof current?.sessionId).toBe("string");
    expect(await storedSession(timerTwo.uid, current?.sessionId as string)).toMatchObject({
      startedAt,
      endedAt: null,
      device: "Chrome on macOS",
      pageCount: 1,
    });
    expect((await personOf(timerTwo.uid)).sessions).toHaveLength(1);
    const row = await rowOf(timerTwo.uid);
    expect(row).toMatchObject({ online: true, currentPath: "/portal", sessionCount: 1 });
    expect(row.totalActiveSeconds).toBeGreaterThanOrEqual(60);
  });
});
