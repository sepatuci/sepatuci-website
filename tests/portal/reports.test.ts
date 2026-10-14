import { DocumentReference, Timestamp, type Precondition } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchReport } from "@/app/api/portal/admin/reports/[reportId]/route";
import { GET as countReports } from "@/app/api/portal/admin/reports/count/route";
import { GET as listReports } from "@/app/api/portal/admin/reports/route";
import { POST as sendReport } from "@/app/api/portal/reports/route";
import { GET as reportStatus } from "@/app/api/portal/reports/status/route";
import { LIMITS, TIMING } from "@/lib/portal/constants";
import { reportDay } from "@/lib/portal/reports";
import { getPortalAdmin } from "@/lib/portal/server/admin";
import { resetRateLimits } from "@/lib/portal/server/rate-limit";
import { reportLimitId } from "@/lib/portal/server/report-key";
import { sweepExpiredReportLimits } from "@/lib/portal/server/report-service";
import type { ReportCountDto, ReportDto, ReportReceiptDto, ReportStatusDto, ReportsDto } from "@/lib/portal/types";
import {
  ADMIN_ONE,
  AVERY,
  JORDAN,
  MAYA,
  PRIYA,
  SAM,
  SEED_TIMEOUT_MS,
  SLOW_TEST_MS,
  call,
  createAccount,
  createProfile,
  dumpPortal,
  fieldCodes,
  ok,
  paddedJson,
  refused,
  seedPortal,
  signIn,
  storedAudit,
  testDb,
  type ApiResult,
  type Session,
} from "./helpers";

/**
 * Anonymous reports, end to end against the emulators: who may send one, the
 * hour between one person's reports, what is stored (and what is not), and
 * what admins see and when.
 */

const ENOUGH = "Something happened at the last session that e-board should know about.";
const DAY_MS = 86_400_000;
const REPORT_KEYS = ["body", "receivedOn", "reviewedAt", "reviewedBy", "status", "topic"];
const DTO_KEYS = ["body", "id", "receivedOn", "reviewedAt", "status", "topic"];

let admin: Session;
let priya: Session;
let avery: Session;
let sam: Session;
let jordan: Session;
let maya: Session;

beforeAll(async () => {
  await seedPortal();
  [admin, priya, avery, sam, jordan, maya] = await Promise.all(
    [ADMIN_ONE, PRIYA, AVERY, SAM, JORDAN, MAYA].map((email) => signIn(email)),
  );
}, SEED_TIMEOUT_MS);

beforeEach(() => {
  resetRateLimits();
});

const send = (session: Session, body: unknown) => call(sendReport, {}, { method: "POST", token: session.token, body });
const statusOf = async (session: Session) => ok<ReportStatusDto>(await call(reportStatus, {}, { token: session.token }));
const markerId = (session: Session): string => reportLimitId(getPortalAdmin().env, session.uid);
const today = (): string => reportDay(Date.now());

async function storedReports(): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const snapshot = await testDb().collection("reports").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
}

async function markerIds(): Promise<string[]> {
  return (await testDb().collection("reportLimits").get()).docs.map((doc) => doc.id).sort();
}

describe("sending a report", () => {
  it("is open to every role, one report each, and answers with the hour to wait", async () => {
    const before = await storedReports();
    for (const session of [admin, priya, avery]) {
      expect(await statusOf(session)).toEqual({ waitMinutes: 0, preview: false });
      const receipt = ok<ReportReceiptDto>(await send(session, { body: ENOUGH, topic: "conduct" }));
      expect(receipt).toEqual({ stored: true, waitMinutes: 60 });
    }
    expect(await storedReports()).toHaveLength(before.length + 3);
  });

  it("stores the topic, the text and the day, and nothing that says who sent it", async () => {
    const fresh = (await storedReports()).filter((report) => report.data.receivedOn === today());
    expect(fresh).toHaveLength(3);
    for (const { data } of fresh) {
      expect(Object.keys(data).sort()).toEqual(REPORT_KEYS);
      expect(data).toMatchObject({ topic: "conduct", body: ENOUGH, status: "new", reviewedAt: null, reviewedBy: null });
      const stored = JSON.stringify(data);
      for (const sender of [admin, priya, avery]) {
        expect(stored).not.toContain(sender.uid);
        expect(stored).not.toContain(sender.email);
      }
    }
  });

  it("holds each sender back with a document that does not say whose it is", async () => {
    const ids = await markerIds();
    expect(ids).toEqual([markerId(admin), markerId(priya), markerId(avery)].sort());
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{64}$/);
      for (const sender of [admin, priya, avery]) expect(id).not.toContain(sender.uid);
      const data = (await testDb().doc(`reportLimits/${id}`).get()).data() ?? {};
      expect(Object.keys(data)).toEqual(["until"]);
      const untilMs = (data.until as Timestamp).toMillis();
      expect(untilMs).toBeGreaterThan(Date.now() + TIMING.reportIntervalMs - 2 * 60_000);
      expect(untilMs).toBeLessThanOrEqual(Date.now() + TIMING.reportIntervalMs);
    }
  });

  it("refuses a second report within the hour and stores nothing", async () => {
    const before = await dumpPortal();
    const refusal = refused(await send(avery, { body: `${ENOUGH} Again.` }), 429, "report_limit");
    expect(refusal.error).toMatch(/^You can send one report an hour\. You can send another in (59|60) minutes\.$/);
    expect(await dumpPortal()).toEqual(before);
    const status = await statusOf(avery);
    expect(status.preview).toBe(false);
    expect([59, 60]).toContain(status.waitMinutes);
  });

  it("does not hold anyone else back", async () => {
    ok<ReportReceiptDto>(await send(sam, { body: ENOUGH }));
    const untitled = (await storedReports()).filter((report) => report.data.topic === null && report.data.receivedOn === today());
    expect(untitled).toHaveLength(1);
  });

  it("writes nothing else: no audit entry, nothing on any profile, no session", async () => {
    const before = await dumpPortal();
    const audit = await storedAudit();
    ok<ReportReceiptDto>(await send(jordan, { body: ENOUGH, topic: "safety" }));
    const after = await dumpPortal();
    expect(after.accounts).toEqual(before.accounts);
    const changed = Object.keys(after.firestore).filter(
      (path) => JSON.stringify(after.firestore[path]) !== JSON.stringify(before.firestore[path]),
    );
    expect(changed.map((path) => path.split("/")[0]).sort()).toEqual(["reportLimits", "reports"]);
    expect(Object.keys(before.firestore).filter((path) => !(path in after.firestore))).toEqual([]);
    expect(await storedAudit()).toEqual(audit);
  });

  it("logs nothing about the sender", async () => {
    const fresh = await createAccount("quiet.sender@uci.edu", { claims: { role: "pledge" } });
    await createProfile(fresh.uid, fresh.email, "pledge");
    const spies = (["log", "info", "warn", "error"] as const).map((level) => vi.spyOn(console, level));
    try {
      ok<ReportReceiptDto>(await send(fresh, { body: ENOUGH }));
      refused(await send(fresh, { body: ENOUGH }), 429, "report_limit");
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("lets exactly one of several reports sent at once through", async () => {
    const before = (await storedReports()).length;
    const results = await Promise.all(Array.from({ length: 5 }, () => send(maya, { body: ENOUGH })));
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    for (const result of results.filter((candidate) => candidate.status !== 200)) {
      // Turned away by the hold, or, if the database gave up on the contested write, asked to try again.
      expect(["429:report_limit", "503:report_unavailable"]).toContain(
        `${result.status}:${(result.body as { code?: string }).code}`,
      );
    }
    expect(await storedReports()).toHaveLength(before + 1);
  }, SLOW_TEST_MS);
});

describe("the hour", () => {
  it("lets the sender report again once it is up, and clears the hold that was holding them back", async () => {
    await testDb().doc(`reportLimits/${markerId(avery)}`).update({ until: Timestamp.fromMillis(Date.now() - 1000) });
    expect(await statusOf(avery)).toEqual({ waitMinutes: 0, preview: false });
    expect(await markerIds()).not.toContain(markerId(avery));
    // Holds still in force are left alone.
    expect(await markerIds()).toContain(markerId(priya));

    ok<ReportReceiptDto>(await send(avery, { body: ENOUGH }));
    expect(await markerIds()).toContain(markerId(avery));
  });

  it("ignores a hold no server could have written, so nobody is locked out by it", async () => {
    await testDb().doc(`reportLimits/${markerId(sam)}`).update({ until: Timestamp.fromMillis(Date.now() + 30 * DAY_MS) });
    expect((await statusOf(sam)).waitMinutes).toBe(0);
    ok<ReportReceiptDto>(await send(sam, { body: ENOUGH }));
    expect([59, 60]).toContain((await statusOf(sam)).waitMinutes);
  });
});

describe("what is refused before anything is written", () => {
  it("refuses empty, short, long and mistyped reports", async () => {
    const before = await dumpPortal();
    const cases: Array<[unknown, string[]]> = [
      [{}, ["body:required"]],
      [{ body: "   " }, ["body:required"]],
      [{ body: "Too short" }, ["body:too_short"]],
      [{ body: "x".repeat(LIMITS.reportBody + 1) }, ["body:too_long"]],
      [{ body: ENOUGH, topic: "admins" }, ["topic:invalid"]],
      [{ body: 12, topic: 3 }, ["body:required", "topic:invalid"]],
    ];
    for (const [body, codes] of cases) {
      expect(fieldCodes(refused(await send(priya, body), 422, "invalid"))).toEqual(codes);
    }
    expect(await dumpPortal()).toEqual(before);
  });

  it("refuses a body that is not JSON, or too large", async () => {
    refused(
      await call(sendReport, {}, { method: "POST", token: priya.token, rawBody: ENOUGH, contentType: "text/plain" }),
      415,
      "unsupported_media_type",
    );
    refused(
      await call(sendReport, {}, { method: "POST", token: priya.token, rawBody: paddedJson(LIMITS.smallBodyBytes + 1, { body: ENOUGH }) }),
      413,
      "too_large",
    );
  });

  it("refuses anyone who is not signed in", async () => {
    refused(await call(sendReport, {}, { method: "POST", body: { body: ENOUGH } }), 401, "unauthenticated");
    refused(await call(reportStatus, {}, {}), 401, "unauthenticated");
  });
});

describe("an admin's preview account", () => {
  let preview: Session;

  beforeAll(async () => {
    preview = await createAccount("sandbox.owner+preview-pledge@uci.edu", { claims: { role: "pledge" } });
    await createProfile(preview.uid, preview.email, "pledge", "Preview Pledge");
    await testDb().doc(`users/${preview.uid}`).update({ previewOwnerUid: admin.uid, previewOwnerEmail: admin.email });
  });

  it("goes through the whole dialog, but nothing is stored and nothing is held back", async () => {
    expect(await statusOf(preview)).toEqual({ waitMinutes: 0, preview: true });
    const before = await dumpPortal();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(ok<ReportReceiptDto>(await send(preview, { body: ENOUGH }))).toEqual({ stored: false, waitMinutes: 0 });
    }
    expect(await dumpPortal()).toEqual(before);
  });

  it("is still told when what it sent would be refused", async () => {
    expect(fieldCodes(refused(await send(preview, { body: "short" }), 422, "invalid"))).toEqual(["body:too_short"]);
  });
});

describe("what admins see", () => {
  it("is only reports from before today: today's are held back until tomorrow", async () => {
    const list = ok<ReportsDto>(await call(listReports, {}, { token: admin.token }));
    // The two seeded reports, from earlier days. None of the ones sent above.
    expect(list.newCount).toBe(1);
    expect(list.reviewedCount).toBe(1);
    expect(list.reports).toHaveLength(1);
    for (const report of list.reports) {
      expect(Object.keys(report).sort()).toEqual(DTO_KEYS);
      expect(report.receivedOn < today()).toBe(true);
      expect(report.status).toBe("new");
    }
    expect(ok<ReportCountDto>(await call(countReports, {}, { token: admin.token }))).toEqual({ newCount: 1 });
    const reviewed = ok<ReportsDto>(await call(listReports, {}, { token: admin.token, query: "?status=reviewed" }));
    expect(reviewed.reports.map((report) => report.status)).toEqual(["reviewed"]);
    expect(reviewed.reports[0].reviewedAt).not.toBeNull();
  });

  it("shows a report from the day after it was sent, newest day first", async () => {
    const todays = (await storedReports()).filter((report) => report.data.topic === "safety");
    expect(todays).toHaveLength(1);
    await testDb().doc(`reports/${todays[0].id}`).update({ receivedOn: reportDay(Date.now() - DAY_MS) });

    const list = ok<ReportsDto>(await call(listReports, {}, { token: admin.token }));
    expect(list.newCount).toBe(2);
    expect(list.reports[0]).toMatchObject({ id: todays[0].id, topic: "safety", body: ENOUGH, status: "new", reviewedAt: null });
    expect(list.reports[0].receivedOn > list.reports[1].receivedOn).toBe(true);
    expect(ok<ReportCountDto>(await call(countReports, {}, { token: admin.token }))).toEqual({ newCount: 2 });
  });

  it("refuses an unknown filter", async () => {
    refused(await call(listReports, {}, { token: admin.token, query: "?status=all" }), 422, "invalid");
  });

  it("is for admins only", async () => {
    for (const session of [priya, avery]) {
      refused(await call(listReports, {}, { token: session.token }), 403, "forbidden");
      refused(await call(countReports, {}, { token: session.token }), 403, "forbidden");
      refused(
        await call(patchReport, { reportId: "abc123" }, { method: "PATCH", token: session.token, body: { status: "reviewed" } }),
        403,
        "forbidden",
      );
    }
  });
});

describe("marking a report", () => {
  const released = async (): Promise<ReportDto> => {
    const list = ok<ReportsDto>(await call(listReports, {}, { token: admin.token }));
    const report = list.reports.find((candidate) => candidate.topic === "safety");
    if (!report) throw new Error("The released report is missing.");
    return report;
  };
  const mark = (reportId: string, status: unknown) =>
    call(patchReport, { reportId }, { method: "PATCH", token: admin.token, body: { status } });

  it("marks it reviewed once, and records that in the audit log without the text", async () => {
    const report = await released();
    const auditBefore = await storedAudit();
    const marked = ok<{ report: ReportDto }>(await mark(report.id, "reviewed")).report;
    expect(marked).toMatchObject({ id: report.id, status: "reviewed" });
    expect(marked.reviewedAt).not.toBeNull();
    expect((await testDb().doc(`reports/${report.id}`).get()).data()).toMatchObject({ status: "reviewed", reviewedBy: admin.uid });

    const audit = await storedAudit();
    expect(audit).toHaveLength(auditBefore.length + 1);
    expect(audit[0]).toMatchObject({ action: "report.review", targetType: "report", targetId: report.id, actorUid: admin.uid });
    expect(audit[0].summary).toMatch(/^Report sent .+, Safety or wellbeing$/);
    expect(audit[0].summary).not.toContain(ENOUGH);

    // Again: nothing changes and nothing more is recorded.
    ok(await mark(report.id, "reviewed"));
    expect(await storedAudit()).toHaveLength(auditBefore.length + 1);
    expect(ok<ReportCountDto>(await call(countReports, {}, { token: admin.token }))).toEqual({ newCount: 1 });
  });

  it("can put it back to new", async () => {
    const list = ok<ReportsDto>(await call(listReports, {}, { token: admin.token, query: "?status=reviewed" }));
    const report = list.reports.find((candidate) => candidate.topic === "safety");
    if (!report) throw new Error("The reviewed report is missing.");
    const reopened = ok<{ report: ReportDto }>(await mark(report.id, "new")).report;
    expect(reopened).toMatchObject({ status: "new", reviewedAt: null });
    expect((await testDb().doc(`reports/${report.id}`).get()).data()).toMatchObject({ status: "new", reviewedAt: null, reviewedBy: null });
    expect((await storedAudit())[0]).toMatchObject({ action: "report.reopen", targetId: report.id });
  });

  it("cannot reach a report from today or an unknown one, or set an unknown status", async () => {
    const fromToday = (await storedReports()).find((report) => report.data.receivedOn === today());
    if (!fromToday) throw new Error("No report from today.");
    const report = await released();
    const before = await dumpPortal();
    refused(await mark(fromToday.id, "reviewed"), 404, "not_found");
    refused(await mark("nosuchreport", "reviewed"), 404, "not_found");
    refused(await mark("../x", "reviewed"), 404, "not_found");
    refused(await mark(report.id, "deleted"), 422, "invalid");
    expect(await dumpPortal()).toEqual(before);
  });
});

describe("a report dated after today", () => {
  const listed = async (status: string): Promise<ReportsDto> =>
    ok<ReportsDto>(await call(listReports, {}, { token: admin.token, query: `?status=${status}` }));

  // Only a server clock gone wrong could store one. It is held back like one from today.
  it("is never listed, counted or reachable, whatever its status", async () => {
    const [newBefore, reviewedBefore] = [await listed("new"), await listed("reviewed")];
    const countBefore = ok<ReportCountDto>(await call(countReports, {}, { token: admin.token }));

    const ahead: string[] = [];
    for (const [status, receivedOn] of [
      ["new", reportDay(Date.now() + DAY_MS)],
      ["reviewed", "2999-01-01"],
    ] as const) {
      const ref = testDb().collection("reports").doc();
      await ref.set({
        topic: "other",
        body: ENOUGH,
        receivedOn,
        status,
        reviewedAt: status === "reviewed" ? Timestamp.now() : null,
        reviewedBy: status === "reviewed" ? admin.uid : null,
      });
      ahead.push(ref.id);
    }

    expect(await listed("new")).toEqual(newBefore);
    expect(await listed("reviewed")).toEqual(reviewedBefore);
    expect(ok<ReportCountDto>(await call(countReports, {}, { token: admin.token }))).toEqual(countBefore);

    const before = await dumpPortal();
    for (const reportId of ahead) {
      for (const status of ["reviewed", "new"]) {
        refused(
          await call(patchReport, { reportId }, { method: "PATCH", token: admin.token, body: { status } }),
          404,
          "not_found",
        );
      }
    }
    expect(await dumpPortal()).toEqual(before);
  });
});

describe("clearing holds that are over", () => {
  it("never deletes a hold renewed between the sweep reading it as over and deleting it", async () => {
    const path = `reportLimits/${markerId(priya)}`;
    await testDb().doc(path).set({ until: Timestamp.fromMillis(Date.now() - 1000) });
    const reportsBefore = (await storedReports()).length;

    // Priya sends a report in the gap: after the sweep has read her hold as
    // over, and before its delete reaches the database. The delete itself is
    // the real one.
    const realDelete = DocumentReference.prototype.delete;
    const sentInTheGap: ApiResult[] = [];
    let gapTaken = false;
    const spy = vi
      .spyOn(DocumentReference.prototype, "delete")
      .mockImplementation(async function (this: DocumentReference, precondition?: Precondition) {
        if (this.path === path && !gapTaken) {
          gapTaken = true;
          sentInTheGap.push(await send(priya, { body: ENOUGH }));
        }
        return realDelete.call(this, precondition);
      });
    try {
      await sweepExpiredReportLimits(getPortalAdmin(), new Date());
    } finally {
      spy.mockRestore();
    }

    expect(sentInTheGap).toHaveLength(1);
    expect(ok<ReportReceiptDto>(sentInTheGap[0])).toEqual({ stored: true, waitMinutes: 60 });
    expect(await markerIds()).toContain(markerId(priya));
    expect([59, 60]).toContain((await statusOf(priya)).waitMinutes);
    refused(await send(priya, { body: ENOUGH }), 429, "report_limit");
    expect(await storedReports()).toHaveLength(reportsBefore + 1);
  });
});
