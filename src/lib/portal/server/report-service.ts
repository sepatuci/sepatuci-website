import { Timestamp } from "firebase-admin/firestore";
import { LIMITS, TIMING } from "../constants";
import { isRecord, readEnum } from "../parse";
import { isPreviewProfile } from "../preview";
import {
  REPORT_TOPIC_LABEL,
  formatReportDay,
  isReleased,
  readReportInput,
  reportDay,
  reportLimitMessage,
  reportWaitMinutes,
} from "../reports";
import type {
  ReportCountDto,
  ReportDto,
  ReportReceiptDto,
  ReportStatus,
  ReportStatusDto,
  ReportsDto,
} from "../types";
import type { PortalAdmin } from "./admin";
import { errorCode } from "./admin-pledges-service";
import { auditEntry } from "./audit";
import { HttpError, invalid } from "./http";
import type { Caller } from "./pledge-service";
import { reportLimitId } from "./report-key";
import { collections, reportDto, type ReportDoc } from "./store";

/**
 * Anonymous reports. Sending one writes the report and the hour-long hold on
 * the sender's next one in a single step, and nothing else: no audit entry,
 * no log line and nothing on the sender's profile. The report records the day
 * it was sent, and admins only see it from the next day, so it cannot be
 * matched to who was online when it arrived.
 */

const STATUSES: readonly ReportStatus[] = ["new", "reviewed"];
const INTERVAL_MINUTES = Math.ceil(TIMING.reportIntervalMs / 60_000);

/** Whether the caller may send a report now, and whether they are an admin's preview. */
export async function getReportStatus({ admin, user, now }: Caller): Promise<ReportStatusDto> {
  const cols = collections(admin.db);
  const [profile, marker] = await Promise.all([
    cols.users.doc(user.uid).get(),
    cols.reportLimits.doc(reportLimitId(admin.env, user.uid)).get(),
  ]);
  const until = marker.data()?.until.toMillis() ?? null;
  const waitMinutes = reportWaitMinutes(until, now.getTime());
  // The caller's own hold, once its hour is up, goes now. Nobody else's is
  // touched here: how long this took must say nothing about anyone else.
  if (marker.exists && marker.updateTime && waitMinutes === 0) {
    await marker.ref.delete({ lastUpdateTime: marker.updateTime }).catch(() => undefined);
  }
  const data = profile.data();
  if (data && isPreviewProfile(data)) return { waitMinutes: 0, preview: true };
  return { waitMinutes, preview: false };
}

/**
 * Stores a report, unless the caller sent one within the hour. From an admin's
 * preview account nothing is stored and nothing is held back.
 */
export async function submitReport({ admin, user, now }: Caller, body: unknown): Promise<ReportReceiptDto> {
  const read = readReportInput(body);
  if (!read.ok) throw invalid(read.issues);

  const cols = collections(admin.db);
  const profile = (await cols.users.doc(user.uid).get()).data();
  if (profile && isPreviewProfile(profile)) return { stored: false, waitMinutes: 0 };

  const nowMs = now.getTime();
  const markerRef = cols.reportLimits.doc(reportLimitId(admin.env, user.uid));
  const report: ReportDoc = {
    topic: read.value.topic,
    body: read.value.body,
    receivedOn: reportDay(nowMs),
    status: "new",
    reviewedAt: null,
    reviewedBy: null,
  };
  try {
    // The hold is read and written in the same step as the report, so two
    // reports sent at once from one account cannot both get through.
    await admin.db.runTransaction(async (tx) => {
      const marker = (await tx.get(markerRef)).data();
      const wait = reportWaitMinutes(marker ? marker.until.toMillis() : null, nowMs);
      if (wait > 0) throw new HttpError(429, "report_limit", reportLimitMessage(wait));
      tx.set(markerRef, { until: Timestamp.fromMillis(nowMs + TIMING.reportIntervalMs) });
      tx.create(cols.reports.doc(), report);
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // Handled here rather than by the route wrapper, which would log the
    // error's message. Only the code is logged, and nothing about the sender.
    console.error("[Portal] A report could not be saved:", errorCode(error) || "unknown error");
    throw new HttpError(503, "report_unavailable", "Your report couldn't be sent just now. Try again in a moment.");
  }

  // Only here, in the answer to someone sending a report, which each account
  // can do once an hour. Anywhere that can be asked again and again, how long
  // a sweep took could tell when someone else's hour ran out.
  await sweepExpiredReportLimits(admin, now);
  return { stored: true, waitMinutes: INTERVAL_MINUTES };
}

/**
 * Deletes holds whose hour is up, so none outlasts its purpose. Each is
 * deleted only if it has not been written since it was read, so a hold
 * renewed in the meantime stays. It is housekeeping: a failure is ignored.
 */
export async function sweepExpiredReportLimits(admin: PortalAdmin, now: Date): Promise<void> {
  try {
    const expired = await collections(admin.db)
      .reportLimits.where("until", "<=", Timestamp.fromDate(now))
      .limit(100)
      .get();
    await Promise.allSettled(expired.docs.map((doc) => doc.ref.delete({ lastUpdateTime: doc.updateTime })));
  } catch (error) {
    console.warn("[Portal] Could not clear expired report holds:", errorCode(error) || "unknown error");
  }
}

/**
 * The reports with one status that admins can see, newest day first: every
 * one sent before today, by id and day only. Today's are dropped before
 * anything is counted or cut short, so one arriving changes nothing an admin
 * can see. An equality filter alone needs no composite index, and reading the
 * day alone keeps this light however many reports there are. Reports from the
 * same day are put in id order, which is random and says nothing about which
 * was sent first.
 */
async function releasedReports(
  admin: PortalAdmin,
  status: ReportStatus,
  today: string,
): Promise<{ id: string; receivedOn: string }[]> {
  const snapshot = await collections(admin.db).reports.where("status", "==", status).select("receivedOn").get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, receivedOn: doc.get("receivedOn") as unknown }))
    .filter((report): report is { id: string; receivedOn: string } =>
      typeof report.receivedOn === "string" && isReleased(report.receivedOn, today),
    )
    .sort((a, b) =>
      a.receivedOn === b.receivedOn ? a.id.localeCompare(b.id) : a.receivedOn < b.receivedOn ? 1 : -1,
    );
}

export async function listReports({ admin, now }: Caller, statusParam: string | null): Promise<ReportsDto> {
  const status = readEnum<ReportStatus>(statusParam ?? "new", STATUSES);
  if (!status) throw invalid([{ path: "status", code: "invalid", message: "Unknown status." }]);

  const cols = collections(admin.db);
  const today = reportDay(now.getTime());
  const [fresh, reviewed] = await Promise.all([
    releasedReports(admin, "new", today),
    releasedReports(admin, "reviewed", today),
  ]);
  // Only the reports on show are read in full, in the order chosen above.
  const shown = (status === "new" ? fresh : reviewed).slice(0, LIMITS.reportList);
  const snapshots = await Promise.all(shown.map(({ id }) => cols.reports.doc(id).get()));
  const reports: ReportDto[] = [];
  for (const snapshot of snapshots) {
    const doc = snapshot.data();
    // One marked a moment ago belongs to the other list now.
    if (doc && doc.status === status) reports.push(reportDto(snapshot.id, doc));
  }
  return { reports, newCount: fresh.length, reviewedCount: reviewed.length };
}

/** How many reports admins can see that nobody has marked reviewed yet. */
export async function countNewReports({ admin, now }: Caller): Promise<ReportCountDto> {
  return { newCount: (await releasedReports(admin, "new", reportDay(now.getTime()))).length };
}

/** Marks a report reviewed, or new again. The audit entry names the day and topic, never the text. */
export async function setReportStatus(
  { admin, user, now }: Caller,
  id: string,
  body: unknown,
): Promise<{ report: ReportDto }> {
  const input = isRecord(body) ? body : {};
  const status = readEnum<ReportStatus>(input.status, STATUSES);
  if (!status) throw invalid([{ path: "status", code: "invalid", message: "Choose new or reviewed." }]);

  const cols = collections(admin.db);
  const ref = cols.reports.doc(id);
  const today = reportDay(now.getTime());
  return admin.db.runTransaction(async (tx) => {
    const doc = (await tx.get(ref)).data();
    // A report from today is not shown yet, so it cannot be acted on either.
    if (!doc || !isReleased(doc.receivedOn, today)) {
      throw new HttpError(404, "not_found", "That report doesn't exist.");
    }
    if (doc.status === status) return { report: reportDto(id, doc) };

    const reviewed = status === "reviewed";
    const patch = {
      status,
      reviewedAt: reviewed ? Timestamp.fromDate(now) : null,
      reviewedBy: reviewed ? user.uid : null,
    };
    tx.update(ref, patch);
    const topic = doc.topic ? `, ${REPORT_TOPIC_LABEL[doc.topic]}` : "";
    tx.create(
      cols.audit.doc(),
      auditEntry(
        user,
        now,
        reviewed ? "report.review" : "report.reopen",
        "report",
        id,
        `Report sent ${formatReportDay(doc.receivedOn, true)}${topic}`,
      ),
    );
    return { report: reportDto(id, { ...doc, ...patch }) };
  });
}
