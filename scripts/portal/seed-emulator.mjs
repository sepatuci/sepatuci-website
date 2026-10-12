/**
 * Fills the local Firebase emulators with demo data for the Founder's Education
 * portal: two admins, six pledges, six deliverables and a spread of responses.
 *
 * It refuses to run against anything but the emulators, so it can never touch
 * a real project. Every account here is fictional.
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { createHash, randomBytes } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

export const DEMO_PASSWORD = "portal-demo-1";

// A brand-new pledge for the local demo: never signed in, and still on the
// temporary password a chair would hand out. Signing in as them shows the whole
// first visit, starting with choosing a password. Only added when asked for.
export const FIRST_RUN_PLEDGE = {
  name: "Casey Tran",
  email: "casey.tran@uci.edu",
  temporaryPassword: "FNDR-EDUC-2626",
  signedIn: false,
  toured: false,
  activeMinutes: 0,
  submissions: {},
};

// The same for an active, to see the short welcome they get.
export const FIRST_RUN_ACTIVE = {
  name: "Theo Park",
  email: "theo.park@uci.edu",
  temporaryPassword: "SEPA-CTVE-2626",
  signedIn: false,
};
export const DEMO_ADMINS = ["chair.one@uci.edu", "chair.two@uci.edu"];

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? "";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function assertEmulator() {
  const isLocal = (host) => /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host ?? "");
  if (
    !isLocal(process.env.FIREBASE_AUTH_EMULATOR_HOST) ||
    !isLocal(process.env.FIRESTORE_EMULATOR_HOST) ||
    !PROJECT_ID.startsWith("demo-")
  ) {
    throw new Error(
      "seed-emulator only runs against the local Firebase emulators. Start it with `npm run portal:dev`.",
    );
  }
}

const option = (id, label) => ({ id, label });

function buildForms(at) {
  return {
    week0onboarding: {
      title: "Week 0: Onboarding Survey",
      description:
        "Tell us a little about yourself before Founder's Education begins. This helps us match you with a mentor.",
      status: "published",
      questions: [
        { id: "q_major", type: "short_text", title: "What is your major?", description: "", required: true, validation: "none" },
        {
          id: "q_year",
          type: "dropdown",
          title: "What year are you?",
          description: "",
          required: true,
          options: [option("o_first", "First year"), option("o_second", "Second year"), option("o_third", "Third year"), option("o_fourth", "Fourth year or above")],
        },
        {
          id: "q_interests",
          type: "checkboxes",
          title: "Which areas are you most interested in?",
          description: "Choose all that apply.",
          required: true,
          allowOther: true,
          options: [option("o_ai", "AI and software"), option("o_consumer", "Consumer products"), option("o_health", "Health"), option("o_fintech", "Fintech"), option("o_climate", "Climate")],
        },
        {
          id: "q_experience",
          type: "linear_scale",
          title: "How much startup experience do you have?",
          description: "",
          required: true,
          min: 1,
          max: 5,
          minLabel: "None yet",
          maxLabel: "Founded a company",
        },
      ],
      settings: { visibleAt: at(-21 * DAY), opensAt: at(-21 * DAY), dueAt: at(-15 * DAY), closesAt: null, allowLate: true, prerequisiteFormId: null, confirmationMessage: "Thanks. Welcome to Founder's Education." },
    },
    week1reflection: {
      title: "Week 1: Founder Reflection",
      description:
        "Reflect on this week's ideation workshop. Be specific: we read every response before the next session.",
      status: "published",
      questions: [
        { id: "q_intro", type: "section", title: "The problem you want to work on", description: "Answer from your own experience, not what you think sounds impressive." },
        { id: "q_problem", type: "paragraph", title: "Describe a problem you have personally run into that you would want to solve.", description: "", required: true },
        {
          id: "q_who",
          type: "multiple_choice",
          title: "Who has this problem most acutely?",
          description: "",
          required: true,
          allowOther: true,
          options: [option("o_students", "Students"), option("o_smb", "Small businesses"), option("o_enterprise", "Large companies"), option("o_consumers", "Everyday consumers")],
        },
        { id: "q_confidence", type: "linear_scale", title: "How confident are you that this problem is worth solving?", description: "", required: true, min: 1, max: 10, minLabel: "Not at all", maxLabel: "Completely" },
        { id: "q_doc", type: "short_text", title: "Link to your one-page write-up", description: "A Google Doc with comment access is fine.", required: false, validation: "url" },
      ],
      settings: { visibleAt: at(-14 * DAY), opensAt: at(-14 * DAY), dueAt: at(-7 * DAY), closesAt: null, allowLate: false, prerequisiteFormId: null, confirmationMessage: "Got it. We'll discuss a few of these at the next session." },
    },
    week2interviews: {
      title: "Week 2: Customer Discovery Interviews",
      description: "Log the interviews you ran this week. You need at least three before you can start the synthesis.",
      status: "published",
      questions: [
        { id: "q_count", type: "short_text", title: "How many interviews did you complete?", description: "", required: true, validation: "number" },
        { id: "q_date", type: "date", title: "When was your most recent interview?", description: "", required: true },
        { id: "q_time", type: "time", title: "What time did it start?", description: "", required: false },
        { id: "q_surprise", type: "paragraph", title: "What surprised you most?", description: "", required: true },
        { id: "q_notes", type: "short_text", title: "Link to your interview notes", description: "", required: true, validation: "url" },
      ],
      settings: { visibleAt: at(-7 * DAY), opensAt: at(-7 * DAY), dueAt: at(2 * DAY), closesAt: at(5 * DAY), allowLate: true, prerequisiteFormId: null, confirmationMessage: "Nice work. Your synthesis deliverable is now unlocked." },
    },
    week2synthesis: {
      title: "Week 2: Interview Synthesis",
      description: "Turn your interview notes into the three strongest insights. Opens once your interviews are logged.",
      status: "published",
      questions: [
        { id: "q_insight1", type: "paragraph", title: "Insight 1", description: "", required: true },
        { id: "q_insight2", type: "paragraph", title: "Insight 2", description: "", required: true },
        { id: "q_insight3", type: "paragraph", title: "Insight 3", description: "", required: false },
        {
          id: "q_pivot",
          type: "multiple_choice",
          title: "Did the interviews change your idea?",
          description: "",
          required: true,
          allowOther: false,
          options: [option("o_no", "No, they confirmed it"), option("o_refined", "They refined it"), option("o_pivot", "Yes, I'm changing direction")],
        },
      ],
      settings: { visibleAt: at(-7 * DAY), opensAt: at(-7 * DAY), dueAt: at(4 * DAY), closesAt: null, allowLate: false, prerequisiteFormId: "week2interviews", confirmationMessage: "" },
    },
    week3mvpscope: {
      title: "Week 3: MVP Scope",
      description: "Define the smallest version of your product that tests your riskiest assumption.",
      status: "published",
      questions: [
        { id: "q_assumption", type: "paragraph", title: "What is your riskiest assumption?", description: "", required: true },
        { id: "q_scope", type: "paragraph", title: "What is in your MVP, and what did you cut?", description: "", required: true },
        { id: "q_weeks", type: "short_text", title: "How many weeks will it take to build?", description: "", required: true, validation: "number" },
      ],
      settings: { visibleAt: at(-1 * DAY), opensAt: at(3 * DAY), dueAt: at(10 * DAY), closesAt: null, allowLate: false, prerequisiteFormId: null, confirmationMessage: "" },
    },
    pitchfeedback: {
      title: "Pitch Night Feedback",
      description: "Draft. Not visible to new members yet.",
      status: "draft",
      questions: [
        { id: "q_overall", type: "linear_scale", title: "How did your pitch go?", description: "", required: true, min: 1, max: 5, minLabel: "Rough", maxLabel: "Great" },
        { id: "q_improve", type: "paragraph", title: "What would you change next time?", description: "", required: false },
      ],
      settings: { visibleAt: null, opensAt: null, dueAt: null, closesAt: null, allowLate: false, prerequisiteFormId: null, confirmationMessage: "" },
    },
  };
}

const PARAGRAPHS = [
  "Group projects fall apart because nobody can see who is doing what until the night before the deadline. I have been on four teams this year and it happened on three of them.",
  "Booking time with advisors is a mess. There are three different calendars and the appointment I needed was gone by the time I found the right one.",
  "I talked to five students who work part-time. Every one of them tracks shifts and pay in their notes app because the tools their employers use are built for managers, not for them.",
  "Most people I interviewed did not describe the problem the way I expected. They cared far more about saving time than saving money.",
  "Two of the people I spoke to had already built their own workaround in a spreadsheet, which tells me the pain is real enough to act on.",
];

function answerFor(question, seed) {
  switch (question.type) {
    case "short_text":
      if (question.validation === "url") return { kind: "text", value: `https://docs.google.com/document/d/demo-${seed + 1}` };
      if (question.validation === "number") return { kind: "text", value: String(3 + (seed % 4)) };
      return { kind: "text", value: ["Computer Science", "Business Administration", "Biomedical Engineering", "Informatics", "Economics"][seed % 5] };
    case "paragraph":
      return { kind: "text", value: PARAGRAPHS[seed % PARAGRAPHS.length] };
    case "multiple_choice":
    case "dropdown":
      return { kind: "choice", optionId: question.options[seed % question.options.length].id, other: null };
    case "checkboxes": {
      const chosen = question.options.filter((_, index) => (index + seed) % 2 === 0).map((item) => item.id);
      return { kind: "choices", optionIds: chosen.length > 0 ? chosen : [question.options[0].id], other: null };
    }
    case "linear_scale":
      return { kind: "scale", value: question.min + ((seed * 2 + 3) % (question.max - question.min + 1)) };
    case "date":
      return { kind: "text", value: `2026-10-0${1 + (seed % 9)}` };
    case "time":
      return { kind: "text", value: `1${seed % 10}:30` };
    default:
      return null;
  }
}

function answersFor(form, seed) {
  const answers = {};
  for (const question of form.questions) {
    const answer = answerFor(question, seed);
    if (answer) answers[question.id] = answer;
  }
  return answers;
}

// One demo team. Everyone else works individually, which is how every pledge starts.
const DEMO_TEAM = { id: "teamatlas", name: "Team Atlas" };

// Active members, who can read the pledges' work and change nothing: one who
// is set up, one who has been invited and never signed in, and one disabled.
export const DEMO_ACTIVES = [
  { name: "Priya Shah", email: "priya.shah@uci.edu", signedIn: true },
  { name: "Marcus Lee", email: "marcus.lee@uci.edu", signedIn: false },
  { name: "Dana Ortiz", email: "dana.ortiz@uci.edu", signedIn: true, disabled: true },
];

// offsetDays: when the response was turned in, relative to now.
// toured: false leaves the welcome tour still to do, to show a first visit.
const PLEDGES = [
  { name: "Avery Chen", email: "avery.chen@uci.edu", signedIn: true, toured: true, team: true, activeMinutes: 312, submissions: { week0onboarding: -19, week1reflection: -9, week2interviews: -1 } },
  { name: "Jordan Patel", email: "jordan.patel@uci.edu", signedIn: true, toured: false, team: true, activeMinutes: 188, submissions: { week0onboarding: -12, week1reflection: -8 } },
  { name: "Maya Rodriguez", email: "maya.rodriguez@uci.edu", signedIn: true, toured: true, activeMinutes: 141, submissions: { week0onboarding: -18, week2interviews: -2 } },
  { name: "Sam Okafor", email: "sam.okafor@uci.edu", signedIn: true, toured: true, activeMinutes: 47, submissions: { week0onboarding: -16 } },
  { name: "Riley Nguyen", email: "riley.nguyen@uci.edu", signedIn: true, toured: true, disabled: true, activeMinutes: 23, submissions: { week0onboarding: -17 } },
  { name: "Casey Kim", email: "casey.kim@uci.edu", signedIn: false, activeMinutes: 0, submissions: {} },
];

async function clearEmulators() {
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const storeHost = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  await fetch(
    `http://${storeHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
}

async function signInOnce(email) {
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: DEMO_PASSWORD, returnSecureToken: true }),
    },
  );
}

/**
 * @param {{ extraAdmins?: string[], firstRun?: boolean }} [options]
 *   extraAdmins: addresses to add as admins on top of the demo ones, so someone
 *   can sign in to the local demo as themselves.
 *   firstRun: also add one pledge and one active who are brand new and still on
 *   a temporary password.
 */
export async function seed({ extraAdmins = [], firstRun = false } = {}) {
  assertEmulator();
  await clearEmulators();

  const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const now = Date.now();
  const at = (offsetMs) => Timestamp.fromMillis(now + offsetMs);
  const forms = buildForms(at);
  const batch = db.batch();

  const emptyActivity = { firstSeenAt: null, lastSeenAt: null, totalActiveSeconds: 0, sessionCount: 0, current: null };

  let firstAdminUid = "";
  const adminAccounts = [
    ...DEMO_ADMINS.map((email, index) => ({ email, displayName: `Demo Chair ${index + 1}` })),
    ...extraAdmins.map((email) => ({ email, displayName: email.split("@")[0] })),
  ];
  for (const [index, { email, displayName }] of adminAccounts.entries()) {
    const record = await auth.createUser({ email, password: DEMO_PASSWORD, emailVerified: true, displayName });
    await auth.setCustomUserClaims(record.uid, { role: "admin" });
    if (index === 0) firstAdminUid = record.uid;
    batch.set(db.collection("users").doc(record.uid), {
      email,
      displayName,
      role: "admin",
      status: "active",
      pledgeClass: null,
      teamId: null,
      onboardedAt: null,
      createdAt: at(-30 * DAY),
      createdBy: "seed",
      updatedAt: at(-30 * DAY),
      submitted: {},
      activity: emptyActivity,
    });
  }

  batch.set(db.collection("teams").doc(DEMO_TEAM.id), {
    name: DEMO_TEAM.name,
    createdAt: at(-10 * DAY),
    createdBy: firstAdminUid,
    updatedAt: at(-10 * DAY),
  });

  for (const [formId, form] of Object.entries(forms)) {
    batch.set(db.collection("forms").doc(formId), {
      ...form,
      version: 1,
      createdAt: at(-22 * DAY),
      createdBy: firstAdminUid,
      updatedAt: at(-2 * DAY),
      updatedBy: firstAdminUid,
    });
  }

  // What the portal adds to an account that starts on a temporary password.
  const temporaryClaims = { temp: true, tempAt: Math.floor(now / 1000), tempNew: true };
  // And what it keeps on the profile until the password is replaced: a salted
  // fingerprint, made the same way as in src/lib/portal/server/temporary-password.ts.
  const fingerprintOf = (temporaryPassword) => {
    const salt = randomBytes(16).toString("hex");
    const plain = temporaryPassword.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return { salt, hash: createHash("sha256").update(`${salt}:${plain}`).digest("hex") };
  };

  const actives = firstRun ? [...DEMO_ACTIVES, FIRST_RUN_ACTIVE] : DEMO_ACTIVES;
  for (const active of actives) {
    const firstPassword = active.signedIn ? DEMO_PASSWORD : (active.temporaryPassword ?? null);
    const record = await auth.createUser({
      email: active.email,
      emailVerified: true,
      displayName: active.name,
      ...(firstPassword ? { password: firstPassword } : {}),
    });
    // Same claims the portal sets when an admin creates an active.
    await auth.setCustomUserClaims(record.uid, {
      role: "active",
      issued: active.email,
      ...(active.temporaryPassword ? temporaryClaims : {}),
    });
    if (active.signedIn) await signInOnce(active.email);
    if (active.disabled) await auth.updateUser(record.uid, { disabled: true });
    batch.set(db.collection("users").doc(record.uid), {
      email: active.email,
      displayName: active.name,
      role: "active",
      status: active.disabled ? "disabled" : "active",
      pledgeClass: null,
      teamId: null,
      // An active who has signed in has already been through their welcome.
      onboardedAt: active.signedIn ? at(-24 * DAY) : null,
      createdAt: at(-25 * DAY),
      createdBy: firstAdminUid,
      updatedAt: at(-25 * DAY),
      submitted: {},
      activity: emptyActivity,
      ...(active.temporaryPassword ? { temporaryPassword: fingerprintOf(active.temporaryPassword) } : {}),
    });
  }

  const pledges = firstRun ? [...PLEDGES, FIRST_RUN_PLEDGE] : PLEDGES;
  for (const [pledgeIndex, pledge] of pledges.entries()) {
    const firstPassword = pledge.signedIn ? DEMO_PASSWORD : (pledge.temporaryPassword ?? null);
    const record = await auth.createUser({
      email: pledge.email,
      emailVerified: true,
      displayName: pledge.name,
      ...(firstPassword ? { password: firstPassword } : {}),
    });
    // Same claims the portal sets when an admin creates a pledge.
    await auth.setCustomUserClaims(record.uid, {
      role: "pledge",
      issued: pledge.email,
      ...(pledge.temporaryPassword ? temporaryClaims : {}),
    });
    if (pledge.signedIn) await signInOnce(pledge.email);
    if (pledge.disabled) await auth.updateUser(record.uid, { disabled: true });

    const submitted = {};
    for (const [formId, offsetDays] of Object.entries(pledge.submissions)) {
      const form = forms[formId];
      const submittedAt = at(offsetDays * DAY + pledgeIndex * 37 * MINUTE);
      const dueAt = form.settings.dueAt;
      const late = dueAt !== null && submittedAt.toMillis() > dueAt.toMillis();
      const durationSeconds = (18 + pledgeIndex * 7) * 60;
      submitted[formId] = { submittedAt, late };
      batch.set(db.collection("submissions").doc(`${formId}_${record.uid}`), {
        formId,
        uid: record.uid,
        answers: answersFor(form, pledgeIndex),
        formSnapshot: { title: form.title, description: form.description, questions: form.questions, version: 1 },
        startedAt: Timestamp.fromMillis(submittedAt.toMillis() - durationSeconds * 1000),
        submittedAt,
        durationSeconds,
        activeSeconds: Math.round(durationSeconds * 0.7),
        late,
        lateBySeconds: late ? Math.round((submittedAt.toMillis() - dueAt.toMillis()) / 1000) : 0,
      });
    }

    const sessionCount = pledge.signedIn ? 3 + pledgeIndex : 0;
    const perSession = sessionCount > 0 ? Math.round((pledge.activeMinutes * 60) / sessionCount) : 0;
    for (let session = 0; session < sessionCount; session += 1) {
      const startedAt = at(-(session * 2 + 1) * DAY - pledgeIndex * HOUR);
      batch.set(db.collection("users").doc(record.uid).collection("sessions").doc(), {
        uid: record.uid,
        startedAt,
        endedAt: Timestamp.fromMillis(startedAt.toMillis() + perSession * 1300),
        activeSeconds: perSession,
      });
    }

    batch.set(db.collection("users").doc(record.uid), {
      email: pledge.email,
      displayName: pledge.name,
      role: "pledge",
      status: pledge.disabled ? "disabled" : "active",
      pledgeClass: "Lambda",
      teamId: pledge.team ? DEMO_TEAM.id : null,
      onboardedAt: pledge.toured ? at(-20 * DAY) : null,
      createdAt: at(-21 * DAY),
      createdBy: firstAdminUid,
      updatedAt: at(-21 * DAY),
      submitted,
      activity: pledge.signedIn
        ? {
            firstSeenAt: at(-20 * DAY),
            lastSeenAt: at(-1 * DAY - pledgeIndex * HOUR),
            totalActiveSeconds: pledge.activeMinutes * 60,
            sessionCount,
            current: null,
          }
        : emptyActivity,
      ...(pledge.temporaryPassword ? { temporaryPassword: fingerprintOf(pledge.temporaryPassword) } : {}),
    });

    if (pledge.email === "sam.okafor@uci.edu") {
      batch.set(db.collection("punishments").doc(), {
        uid: record.uid,
        title: "Missed the Week 1 deliverable",
        details: "Present your founder reflection to the class at the start of the next session.",
        status: "active",
        createdAt: at(-6 * DAY),
        createdBy: firstAdminUid,
        resolvedAt: null,
        resolvedBy: null,
      });
    }
    if (pledge.email === "jordan.patel@uci.edu") {
      batch.set(db.collection("punishments").doc(), {
        uid: record.uid,
        title: "Late onboarding survey",
        details: "Set up the room before the Week 1 session.",
        status: "resolved",
        createdAt: at(-11 * DAY),
        createdBy: firstAdminUid,
        resolvedAt: at(-9 * DAY),
        resolvedBy: firstAdminUid,
      });
    }
  }

  batch.set(db.collection("auditLog").doc(), {
    at: at(-22 * DAY),
    actorUid: firstAdminUid,
    actorEmail: DEMO_ADMINS[0],
    action: "form.publish",
    targetType: "form",
    targetId: "week0onboarding",
    summary: "Week 0: Onboarding Survey",
  });

  await batch.commit();
  return {
    admins: DEMO_ADMINS,
    extraAdmins,
    actives: DEMO_ACTIVES.filter((active) => active.signedIn && !active.disabled).map((active) => active.email),
    pledges: PLEDGES.filter((pledge) => pledge.signedIn && !pledge.disabled).map((pledge) => pledge.email),
    firstRun: firstRun
      ? { email: FIRST_RUN_PLEDGE.email, temporaryPassword: FIRST_RUN_PLEDGE.temporaryPassword }
      : null,
    firstRunActive: firstRun
      ? { email: FIRST_RUN_ACTIVE.email, temporaryPassword: FIRST_RUN_ACTIVE.temporaryPassword }
      : null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await seed();
  process.stdout.write(`Seeded ${result.admins.length} admins and ${PLEDGES.length} new members.\n`);
}
