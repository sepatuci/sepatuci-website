import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { ID_PATTERN, LIMITS } from "../constants";
import { parseIso } from "../dates";
import type { AuditLogDto, AuditTargetType } from "../types";
import type { PortalAdmin } from "./admin";
import type { AuthedUser } from "./gate";
import { collections, iso, type AuditDoc } from "./store";

/** Builds the record of an admin action. Never include secrets such as invite links. */
export function auditEntry(
  actor: AuthedUser,
  now: Date,
  action: string,
  targetType: AuditTargetType,
  targetId: string,
  summary: string,
): AuditDoc {
  return {
    at: Timestamp.fromDate(now),
    actorUid: actor.uid,
    actorEmail: actor.email,
    action,
    targetType,
    targetId,
    summary: summary.slice(0, 300),
  };
}

export async function writeAudit(admin: PortalAdmin, entry: AuditDoc): Promise<void> {
  await collections(admin.db).audit.add(entry);
}

const CURSOR_SEPARATOR = "~";

interface AuditCursor {
  at: Timestamp;
  /** The last entry already shown. Without it the cursor is a plain point in time. */
  id: string | null;
}

/** Reads `<time>` or `<time>~<entry id>`. Anything else is ignored and gives the first page. */
function readCursor(before: string | null): AuditCursor | null {
  if (!before) return null;
  const [time, id, ...rest] = before.split(CURSOR_SEPARATOR);
  const ms = parseIso(time);
  if (ms === null || rest.length > 0) return null;
  if (id === undefined) return { at: Timestamp.fromMillis(ms), id: null };
  return ID_PATTERN.test(id) ? { at: Timestamp.fromMillis(ms), id } : null;
}

export async function listAudit(admin: PortalAdmin, before: string | null): Promise<AuditLogDto> {
  const pageSize = LIMITS.auditPageSize;
  let query = collections(admin.db).audit.orderBy("at", "desc");
  const cursor = readCursor(before);
  if (cursor?.id) {
    // Entries written in the same millisecond are told apart by id, so a page
    // boundary that falls between them neither repeats nor skips any.
    query = query.orderBy(FieldPath.documentId(), "desc").startAfter(cursor.at, cursor.id);
  } else if (cursor) {
    query = query.where("at", "<", cursor.at);
  }

  const snapshot = await query.limit(pageSize + 1).get();
  const page = snapshot.docs.slice(0, pageSize);
  const entries = page.map((doc) => {
    const entry = doc.data();
    return {
      id: doc.id,
      at: iso(entry.at),
      actorEmail: entry.actorEmail,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      summary: entry.summary,
    };
  });
  const hasMore = snapshot.docs.length > pageSize;
  const last = entries[entries.length - 1];
  return {
    entries,
    nextBefore: hasMore && last ? `${last.at}${CURSOR_SEPARATOR}${last.id}` : null,
  };
}
