import {
  Timestamp,
  type CollectionReference,
  type DocumentData,
  type Firestore,
  type FirestoreDataConverter,
  type PartialWithFieldValue,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import type { StoredTemporaryPassword } from "./temporary-password";
import type { Activity } from "../activity";
import { msOrNull, toIso } from "../dates";
import type { FormLike } from "../form-state";
import { countAnswerable } from "../form-schema";
import type {
  ActivityDto,
  AdminFormSummaryDto,
  Answers,
  AuditTargetType,
  FormSettings,
  FormStatus,
  IsoDateTime,
  MemberRole,
  PunishmentDto,
  PunishmentStatus,
  Question,
  Role,
  SubmittedMap,
  SubmissionSummaryDto,
  SessionEndReason,
  UserStatus,
} from "../types";

/**
 * Firestore document shapes and the mapping between them and the wire types.
 * This is the only place where Firestore Timestamps appear.
 */

export type StoredSubmitted = Record<string, { submittedAt: Timestamp; late: boolean }>;

export type StoredCurrentSession = {
  /** The session's document under users/{uid}/sessions. Null for one begun before sessions had documents. */
  sessionId: string | null;
  signedInAt: Timestamp | null;
  startedAt: Timestamp;
  lastSeenAt: Timestamp;
  activeSeconds: number;
  lastPath: string | null;
  pageCount: number;
  leaving: boolean;
};

export type StoredActivity = {
  firstSeenAt: Timestamp | null;
  lastSeenAt: Timestamp | null;
  totalActiveSeconds: number;
  sessionCount: number;
  current: StoredCurrentSession | null;
  /** Seconds of activity on one civil date in the portal's time zone. Absent until the first beat. */
  today?: { date: string; activeSeconds: number } | null;
};

export type UserDoc = {
  email: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  pledgeClass: string | null;
  /** The team this pledge has been placed in. Null while they work on their own. */
  teamId: string | null;
  /** When the pledge finished the welcome tour. Null until then. */
  onboardedAt: Timestamp | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  /** Keyed by form id. Lets dashboards and the master view avoid reading every submission. */
  submitted: StoredSubmitted;
  activity: StoredActivity;
  /**
   * A fingerprint of the temporary password this account was last given, kept
   * only until it is replaced. It never leaves the server.
   */
  temporaryPassword?: StoredTemporaryPassword | null;
  /**
   * Set only on an admin's preview account: the uid and address of the admin
   * it belongs to. Such an account is in none of the portal's lists and can
   * never join a team. `isPreviewProfile` in ../preview is the one test for it.
   */
  previewOwnerUid?: string;
  previewOwnerEmail?: string;
};

/**
 * A one-time link to sign in as a preview account, keyed by the hash of the
 * code in the link. It names the account and nothing more: the temporary
 * password is made when the link is opened, so none is ever at rest here.
 * Redeeming it deletes it, and it expires a few minutes after it is made.
 */
export type PreviewCodeDoc = {
  ownerUid: string;
  uid: string;
  email: string;
  role: MemberRole;
  expiresAt: Timestamp;
};

export type TeamDoc = {
  name: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
};

export type StoredSettings = {
  visibleAt: Timestamp | null;
  opensAt: Timestamp | null;
  dueAt: Timestamp | null;
  closesAt: Timestamp | null;
  allowLate: boolean;
  prerequisiteFormId: string | null;
  confirmationMessage: string;
};

export type FormDoc = {
  title: string;
  description: string;
  status: FormStatus;
  questions: Question[];
  settings: StoredSettings;
  version: number;
  /**
   * The version at which the title, description or questions last changed.
   * Absent on forms saved before this field existed, which fall back to `version`.
   */
  questionsVersion?: number;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
};

export type DraftDoc = {
  formId: string;
  uid: string;
  answers: Answers;
  /** Server time when the pledge first opened the deliverable. */
  startedAt: Timestamp;
  updatedAt: Timestamp;
  activeSeconds: number;
};

export type SubmissionDoc = {
  formId: string;
  uid: string;
  answers: Answers;
  /** The form as it was at submission, so history survives later edits. */
  formSnapshot: { title: string; description: string; questions: Question[]; version: number };
  startedAt: Timestamp;
  submittedAt: Timestamp;
  durationSeconds: number;
  activeSeconds: number;
  late: boolean;
  lateBySeconds: number;
  /**
   * True on a response from an admin's preview account, which counts towards
   * nothing. Absent, never false, on every real response.
   */
  preview?: true;
};

export type PunishmentDoc = {
  uid: string;
  title: string;
  details: string;
  status: PunishmentStatus;
  createdAt: Timestamp;
  createdBy: string;
  resolvedAt: Timestamp | null;
  resolvedBy: string | null;
};

export type StoredPageVisit = { path: string; at: Timestamp };

/** One session, written when it starts and kept up to date by each beat until it ends. */
export type SessionDoc = {
  uid: string;
  signedInAt: Timestamp | null;
  startedAt: Timestamp;
  lastSeenAt: Timestamp;
  /** Null while the session is open. */
  endedAt: Timestamp | null;
  endReason: SessionEndReason | null;
  activeSeconds: number;
  /** "Chrome on macOS" and the like. Empty for sessions recorded before it was kept. */
  device: string;
  /** In order of visiting, at most LIMITS.sessionPages. */
  pages: StoredPageVisit[];
  pageCount: number;
};

export type AuditDoc = {
  at: Timestamp;
  actorUid: string;
  actorEmail: string;
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  summary: string;
};

export function emptyStoredActivity(): StoredActivity {
  return {
    firstSeenAt: null,
    lastSeenAt: null,
    totalActiveSeconds: 0,
    sessionCount: 0,
    current: null,
  };
}

function converter<T extends DocumentData>(
  fromData: (data: DocumentData) => T,
): FirestoreDataConverter<T> {
  return {
    toFirestore: (model: PartialWithFieldValue<T>): DocumentData => model as DocumentData,
    fromFirestore: (snapshot: QueryDocumentSnapshot): T => fromData(snapshot.data()),
  };
}

const passthrough = <T extends DocumentData>() => converter<T>((data) => data as T);

// Accounts created before a field existed still read back with a usable value.
const userConverter = converter<UserDoc>((data) => ({
  ...(data as UserDoc),
  pledgeClass: (data.pledgeClass as string | null | undefined) ?? null,
  teamId: (data.teamId as string | null | undefined) ?? null,
  onboardedAt: (data.onboardedAt as Timestamp | null | undefined) ?? null,
  submitted: (data.submitted as StoredSubmitted | undefined) ?? {},
  activity: (data.activity as StoredActivity | undefined) ?? emptyStoredActivity(),
}));

// Sessions recorded before pages, reasons and devices were kept read back
// whole, and so do partial reads that leave the page log out.
export function sessionFromData(data: DocumentData): SessionDoc {
  const endedAt = (data.endedAt as Timestamp | null | undefined) ?? null;
  // A document a merge write landed on after its start was lost still reads.
  const startedAt =
    (data.startedAt as Timestamp | undefined) ??
    (data.lastSeenAt as Timestamp | undefined) ??
    endedAt ??
    Timestamp.fromMillis(0);
  return {
    uid: typeof data.uid === "string" ? data.uid : "",
    signedInAt: (data.signedInAt as Timestamp | null | undefined) ?? null,
    startedAt,
    lastSeenAt: (data.lastSeenAt as Timestamp | undefined) ?? endedAt ?? startedAt,
    endedAt,
    endReason:
      (data.endReason as SessionEndReason | null | undefined) ?? (endedAt ? "timed_out" : null),
    activeSeconds: typeof data.activeSeconds === "number" ? data.activeSeconds : 0,
    device: typeof data.device === "string" ? data.device : "",
    pages: Array.isArray(data.pages) ? (data.pages as StoredPageVisit[]) : [],
    pageCount: typeof data.pageCount === "number" ? data.pageCount : 0,
  };
}

const sessionConverter = converter<SessionDoc>(sessionFromData);

export interface Collections {
  users: CollectionReference<UserDoc>;
  forms: CollectionReference<FormDoc>;
  drafts: CollectionReference<DraftDoc>;
  submissions: CollectionReference<SubmissionDoc>;
  punishments: CollectionReference<PunishmentDoc>;
  teams: CollectionReference<TeamDoc>;
  /**
   * A pledge's finished sessions, kept under their own profile so the most
   * recent ones can be read in order without a composite index.
   */
  sessions: (uid: string) => CollectionReference<SessionDoc>;
  audit: CollectionReference<AuditDoc>;
  previewCodes: CollectionReference<PreviewCodeDoc>;
}

export function collections(db: Firestore): Collections {
  return {
    users: db.collection("users").withConverter(userConverter),
    forms: db.collection("forms").withConverter(passthrough<FormDoc>()),
    drafts: db.collection("drafts").withConverter(passthrough<DraftDoc>()),
    submissions: db.collection("submissions").withConverter(passthrough<SubmissionDoc>()),
    punishments: db.collection("punishments").withConverter(passthrough<PunishmentDoc>()),
    teams: db.collection("teams").withConverter(passthrough<TeamDoc>()),
    sessions: (uid) => db.collection("users").doc(uid).collection("sessions").withConverter(sessionConverter),
    audit: db.collection("auditLog").withConverter(passthrough<AuditDoc>()),
    previewCodes: db.collection("previewCodes").withConverter(passthrough<PreviewCodeDoc>()),
  };
}

/** One document per pledge per deliverable, for both drafts and submissions. */
export function responseId(formId: string, uid: string): string {
  return `${formId}_${uid}`;
}

// ── Timestamps ───────────────────────────────────────────────────────────────

export function iso(timestamp: Timestamp): IsoDateTime {
  return toIso(timestamp.toMillis());
}

export function isoOrNull(timestamp: Timestamp | null | undefined): IsoDateTime | null {
  return timestamp ? iso(timestamp) : null;
}

export function timestampOrNull(value: IsoDateTime | null): Timestamp | null {
  const ms = msOrNull(value);
  return ms === null ? null : Timestamp.fromMillis(ms);
}

// ── Wire mapping ─────────────────────────────────────────────────────────────

export function settingsToWire(settings: StoredSettings): FormSettings {
  return {
    visibleAt: isoOrNull(settings.visibleAt),
    opensAt: isoOrNull(settings.opensAt),
    dueAt: isoOrNull(settings.dueAt),
    closesAt: isoOrNull(settings.closesAt),
    allowLate: settings.allowLate,
    prerequisiteFormId: settings.prerequisiteFormId,
    confirmationMessage: settings.confirmationMessage,
  };
}

export function settingsToStored(settings: FormSettings): StoredSettings {
  return {
    visibleAt: timestampOrNull(settings.visibleAt),
    opensAt: timestampOrNull(settings.opensAt),
    dueAt: timestampOrNull(settings.dueAt),
    closesAt: timestampOrNull(settings.closesAt),
    allowLate: settings.allowLate,
    prerequisiteFormId: settings.prerequisiteFormId,
    confirmationMessage: settings.confirmationMessage,
  };
}

export function submittedToWire(submitted: StoredSubmitted): SubmittedMap {
  const wire: SubmittedMap = {};
  for (const [formId, entry] of Object.entries(submitted)) {
    wire[formId] = { submittedAt: iso(entry.submittedAt), late: entry.late };
  }
  return wire;
}

// A profile's current session from before pages and sign-in times were kept
// reads back with those parts empty, and carries on from there.
export function activityToPure(activity: StoredActivity): Activity {
  const current = activity.current;
  return {
    firstSeenAtMs: activity.firstSeenAt?.toMillis() ?? null,
    lastSeenAtMs: activity.lastSeenAt?.toMillis() ?? null,
    totalActiveSeconds: activity.totalActiveSeconds,
    sessionCount: activity.sessionCount,
    current: current
      ? {
          sessionId: typeof current.sessionId === "string" ? current.sessionId : null,
          signedInAtMs: current.signedInAt?.toMillis() ?? null,
          startedAtMs: current.startedAt.toMillis(),
          lastSeenAtMs: current.lastSeenAt.toMillis(),
          activeSeconds: current.activeSeconds,
          lastPath: typeof current.lastPath === "string" ? current.lastPath : null,
          pageCount: typeof current.pageCount === "number" ? current.pageCount : 0,
          leaving: current.leaving === true,
        }
      : null,
    today: activity.today ?? null,
  };
}

const fromMs = (ms: number | null): Timestamp | null =>
  ms === null ? null : Timestamp.fromMillis(ms);

export function activityToStored(activity: Activity): StoredActivity {
  return {
    firstSeenAt: fromMs(activity.firstSeenAtMs),
    lastSeenAt: fromMs(activity.lastSeenAtMs),
    totalActiveSeconds: activity.totalActiveSeconds,
    sessionCount: activity.sessionCount,
    current: activity.current
      ? {
          sessionId: activity.current.sessionId,
          signedInAt: fromMs(activity.current.signedInAtMs),
          startedAt: Timestamp.fromMillis(activity.current.startedAtMs),
          lastSeenAt: Timestamp.fromMillis(activity.current.lastSeenAtMs),
          activeSeconds: activity.current.activeSeconds,
          lastPath: activity.current.lastPath,
          pageCount: activity.current.pageCount,
          leaving: activity.current.leaving,
        }
      : null,
    today: activity.today,
  };
}

export function activityToDto(activity: StoredActivity): ActivityDto {
  return {
    firstSeenAt: isoOrNull(activity.firstSeenAt),
    lastSeenAt: isoOrNull(activity.lastSeenAt),
    totalActiveSeconds: activity.totalActiveSeconds,
    sessionCount: activity.sessionCount,
    currentSessionStartedAt: isoOrNull(activity.current?.startedAt),
  };
}

export function formLike(id: string, form: FormDoc): FormLike {
  return { id, title: form.title, status: form.status, settings: settingsToWire(form.settings) };
}

export function formSummary(id: string, form: FormDoc, responseCount: number): AdminFormSummaryDto {
  return {
    id,
    title: form.title,
    status: form.status,
    settings: settingsToWire(form.settings),
    questionCount: countAnswerable(form.questions),
    responseCount,
    version: form.version,
    updatedAt: iso(form.updatedAt),
  };
}

export function punishmentDto(id: string, punishment: PunishmentDoc): PunishmentDto {
  return {
    id,
    uid: punishment.uid,
    title: punishment.title,
    details: punishment.details,
    status: punishment.status,
    createdAt: iso(punishment.createdAt),
    resolvedAt: isoOrNull(punishment.resolvedAt),
  };
}

export function submissionSummary(submission: SubmissionDoc): SubmissionSummaryDto {
  return {
    formId: submission.formId,
    title: submission.formSnapshot.title,
    submittedAt: iso(submission.submittedAt),
    late: submission.late,
    durationSeconds: submission.durationSeconds,
    questionCount: countAnswerable(submission.formSnapshot.questions),
  };
}

/**
 * Deletes every document a query matches, a page at a time, so neither the
 * read nor the write grows with the size of the collection.
 */
export async function deleteMatching(
  db: Firestore,
  query: FirebaseFirestore.Query,
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const snapshot = await query.limit(400).get();
    if (snapshot.empty) return deleted;
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;
  }
}
