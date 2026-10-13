import type { UserRecord } from "firebase-admin/auth";
import { isOnline, resolveSessionEnd, type CurrentSession } from "../activity";
import { ID_PATTERN, LIMITS, PORTAL_TIME_ZONE } from "../constants";
import { civilDate } from "../day";
import { dwellSeconds, pageLabel, type PageNames, type PageVisit } from "../pages";
import { isPreviewProfile } from "../preview";
import type {
  ActivityOverviewDto,
  ActivityPersonDetailDto,
  ActivityPersonDto,
  SessionDetailDto,
  SessionPageDto,
} from "../types";
import type { PortalAdmin } from "./admin";
import { accountStateOf, authRecords, lastSignIn, statusOf } from "./admin-pledges-service";
import { HttpError } from "./http";
import type { Caller } from "./pledge-service";
import { activitySessionDto, viewSession } from "./sessions";
import {
  activityToPure,
  collections,
  iso,
  isoOrNull,
  sessionFromData,
  type Collections,
  type SessionDoc,
  type UserDoc,
} from "./store";

/**
 * What admins see of everyone's time in the portal: who is in right now and
 * on which page, each person's visits, and each visit page by page. Preview
 * accounts are nobody's, and are left out everywhere here.
 */

const noAccount = () => new HttpError(404, "not_found", "That account doesn't exist.");
const noSession = () => new HttpError(404, "not_found", "That session doesn't exist.");

interface Person {
  uid: string;
  profile: UserDoc;
  record: UserRecord | undefined;
}

/** Deliverable titles by id, read without the rest of each form. */
async function formTitles(cols: Collections): Promise<Map<string, string>> {
  const snapshot = await cols.forms.select("title").get();
  const titles = new Map<string, string>();
  snapshot.docs.forEach((doc) => {
    const title: unknown = doc.get("title");
    if (typeof title === "string") titles.set(doc.id, title);
  });
  return titles;
}

/** Everything the page labels need: the deliverable titles and the display names. */
async function pageNames(cols: Collections, people: ReadonlyMap<string, string>): Promise<PageNames> {
  return { forms: await formTitles(cols), people };
}

const namesFrom = (profiles: FirebaseFirestore.QuerySnapshot<UserDoc>): Map<string, string> =>
  new Map(profiles.docs.map((doc) => [doc.id, doc.data().displayName]));

/** Display names alone, for the pages that need nothing more of the profiles. */
async function displayNames(cols: Collections): Promise<Map<string, string>> {
  const snap = await cols.users.select("displayName").get();
  return new Map(
    snap.docs.map((doc) => {
      const name: unknown = doc.get("displayName");
      return [doc.id, typeof name === "string" ? name : ""];
    }),
  );
}

/** The visit in progress, while it is still live. */
function liveSession(current: CurrentSession | null, nowMs: number): CurrentSession | null {
  return current !== null && resolveSessionEnd(current, nowMs) === null ? current : null;
}

function personDto(person: Person, names: PageNames, day: string, nowMs: number): ActivityPersonDto {
  const { uid, profile, record } = person;
  const activity = activityToPure(profile.activity);
  const live = liveSession(activity.current, nowMs);
  const online = live !== null && isOnline(live.lastSeenAtMs, nowMs);
  const path = online && live !== null ? live.lastPath : null;
  return {
    uid,
    email: profile.email,
    displayName: profile.displayName,
    role: profile.role,
    status: statusOf(profile, record),
    accountState: accountStateOf(profile, record),
    online,
    currentPath: path,
    currentPageLabel: path === null ? null : pageLabel(path, names),
    currentSessionId: online && live !== null ? live.sessionId : null,
    firstSeenAt: isoOrNull(profile.activity.firstSeenAt),
    lastSeenAt: isoOrNull(profile.activity.lastSeenAt),
    lastSignInAt: lastSignIn(record),
    todayActiveSeconds: activity.today?.date === day ? activity.today.activeSeconds : 0,
    totalActiveSeconds: activity.totalActiveSeconds,
    sessionCount: activity.sessionCount,
  };
}

/** Online first, then the most recently seen, then by name. */
function byPresence(a: ActivityPersonDto, b: ActivityPersonDto): number {
  if (a.online !== b.online) return a.online ? -1 : 1;
  const seenA = a.lastSeenAt ?? "";
  const seenB = b.lastSeenAt ?? "";
  if (seenA !== seenB) return seenA > seenB ? -1 : 1;
  return a.displayName.localeCompare(b.displayName);
}

export async function listActivity({ admin, now }: Caller): Promise<ActivityOverviewDto> {
  const cols = collections(admin.db);
  const usersSnap = await cols.users.get();
  const docs = usersSnap.docs.filter((doc) => !isPreviewProfile(doc.data()));
  const [records, names] = await Promise.all([
    authRecords(
      admin,
      docs.map((doc) => doc.id),
    ),
    pageNames(cols, namesFrom(usersSnap)),
  ]);
  const nowMs = now.getTime();
  const day = civilDate(nowMs, PORTAL_TIME_ZONE);
  const people = docs
    .map((doc) => personDto({ uid: doc.id, profile: doc.data(), record: records.get(doc.id) }, names, day, nowMs))
    .sort(byPresence);
  return { serverNow: now.toISOString(), day, timeZone: PORTAL_TIME_ZONE, people };
}

/** The person behind a uid, or not found. A preview account is nobody. */
async function requirePerson(admin: PortalAdmin, cols: Collections, uid: string): Promise<Person> {
  if (!ID_PATTERN.test(uid)) throw noAccount();
  const profile = (await cols.users.doc(uid).get()).data();
  if (!profile || isPreviewProfile(profile)) throw noAccount();
  const record = (await authRecords(admin, [uid])).get(uid);
  return { uid, profile, record };
}

const SESSION_SUMMARY_FIELDS = [
  "uid",
  "signedInAt",
  "startedAt",
  "lastSeenAt",
  "endedAt",
  "endReason",
  "activeSeconds",
  "device",
  "pageCount",
] as const;

export async function getPersonActivity({ admin, now }: Caller, uid: string): Promise<ActivityPersonDetailDto> {
  const cols = collections(admin.db);
  const person = await requirePerson(admin, cols, uid);
  const [people, sessionsSnap] = await Promise.all([
    displayNames(cols),
    // The page logs are left out: the newest two hundred visits are a list, not a timeline.
    cols
      .sessions(uid)
      .orderBy("startedAt", "desc")
      .limit(LIMITS.sessionHistory)
      .select(...SESSION_SUMMARY_FIELDS)
      .get(),
  ]);
  const names = await pageNames(cols, people);
  const nowMs = now.getTime();
  const day = civilDate(nowMs, PORTAL_TIME_ZONE);
  const current = activityToPure(person.profile.activity).current;
  const sessions = sessionsSnap.docs.map((doc) => activitySessionDto(doc.id, sessionFromData(doc.data()), current, nowMs));
  return {
    serverNow: now.toISOString(),
    person: personDto(person, names, day, nowMs),
    sessions,
  };
}

function pagesOf(session: SessionDoc, live: boolean, untilMs: number, names: PageNames): SessionPageDto[] {
  const visits: PageVisit[] = session.pages.map((visit) => ({ path: visit.path, atMs: visit.at.toMillis() }));
  return visits.map((visit, index) => ({
    path: visit.path,
    label: pageLabel(visit.path, names),
    at: iso(session.pages[index].at),
    dwellSeconds: dwellSeconds(visits, index, untilMs),
    current: live && index === visits.length - 1,
  }));
}

export async function getSessionDetail(
  { admin, now }: Caller,
  uid: string,
  sessionId: string,
): Promise<SessionDetailDto> {
  const cols = collections(admin.db);
  const person = await requirePerson(admin, cols, uid);
  if (!ID_PATTERN.test(sessionId)) throw noSession();
  const [people, sessionSnap] = await Promise.all([displayNames(cols), cols.sessions(uid).doc(sessionId).get()]);
  const session = sessionSnap.data();
  if (!session) throw noSession();
  const names = await pageNames(cols, people);
  const nowMs = now.getTime();
  const day = civilDate(nowMs, PORTAL_TIME_ZONE);
  const current = activityToPure(person.profile.activity).current;
  const view = viewSession(sessionId, session, current, nowMs);
  const untilMs = view.endedAtMs ?? session.lastSeenAt.toMillis();
  return {
    serverNow: now.toISOString(),
    person: personDto(person, names, day, nowMs),
    session: activitySessionDto(sessionId, session, current, nowMs),
    pages: pagesOf(session, view.live, untilMs, names),
    pageLogFull: session.pageCount >= LIMITS.sessionPages,
  };
}
