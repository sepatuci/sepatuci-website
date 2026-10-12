import type { FormState } from "./types";

/**
 * The wording of the welcome tour and the guide pages, kept in one place so
 * the first-visit tour and the reference page never drift apart.
 */

export interface GuideTopic {
  title: string;
  body: string;
  points: string[];
}

export const ABOUT_SEP: GuideTopic = {
  title: "What is Sigma Eta Pi?",
  body:
    "SEP is UC Irvine's entrepreneurship fraternity: student founders from every major who " +
    "build startups together and push each other to do more.",
  points: [],
};

export const ABOUT_PROGRAM: GuideTopic = {
  title: "What is Founder's Education?",
  body:
    "Founder's Education is SEP's 8-week incubator for new members. You learn to build like " +
    "a founder by doing the work, one stage at a time.",
  points: [
    "Find a real problem worth solving",
    "Interview users and understand your market",
    "Research competitors and spot your opportunity",
    "Learn fundraising, unit economics and financial planning",
    "Build a brand and a go-to-market plan",
    "Shape your pitch deck and present it",
  ],
};

export const HOW_DELIVERABLES_WORK: GuideTopic = {
  title: "How deliverables work",
  body: "Each stage ends with a deliverable: a short set of questions you answer here.",
  points: [
    "Every deliverable shows when it opens and when it's due, in your own time zone.",
    "Your answers save as you type, so you can close the page and pick up later.",
    "Submit is final. Your response moves to History, where you can read it any time.",
    "Some deliverables stay locked until you turn in an earlier one.",
    "Miss a deadline and it either closes or stays open as late. Each one says which, under its due date.",
    "Need to redo something you turned in? An admin can delete your response so you can turn it in again, while it is still open.",
  ],
};

export const BEFORE_YOU_START: GuideTopic = {
  title: "Before you start",
  body: "Six things about your account and who sees what.",
  points: [
    "Admins are the Founder's Education chairs.",
    "Admins and SEP's active members can read what you turn in. Other new members can't.",
    "Admins, and only admins, can see when you're signed in and how long you spend here.",
    "You start on your own. If an admin puts you on a team, it shows on your Account page. Deliverables are still your own; each new member turns in their own response.",
    "Sign-in is your UCI email and your password. Thirty idle minutes signs you out.",
    "Forgotten password, or a question about a deadline? Talk to a Founder's Education admin.",
  ],
};

/** One row of the label legend: a deliverable state, or another chip that appears beside one. */
export type DeliverableLabel =
  | { state: FormState; late: boolean; meaning: string }
  | { chip: string; tone: "warning"; meaning: string };

/** What each label on a deliverable means, in the order a pledge meets them. */
export const DELIVERABLE_STATES: ReadonlyArray<DeliverableLabel> = [
  { state: "upcoming", late: false, meaning: "Announced, but not open yet. You can see the dates." },
  { state: "open", late: false, meaning: "Ready for you to fill in and turn in." },
  { chip: "Due soon", tone: "warning", meaning: "Less than a day left." },
  { state: "locked", late: false, meaning: "Waiting on an earlier deliverable. Turn that one in first." },
  { state: "open_late", late: true, meaning: "The deadline has passed. You can still turn it in, marked late." },
  { state: "submitted", late: false, meaning: "Turned in. Read it any time under History." },
  { state: "submitted", late: true, meaning: "Turned in after the deadline." },
  { state: "missed", late: false, meaning: "Closed before you turned it in." },
];

/** The screens of the welcome tour, in order. */
export const WELCOME_STEPS: ReadonlyArray<{ topics: GuideTopic[]; showStates: boolean }> = [
  { topics: [ABOUT_SEP, ABOUT_PROGRAM], showStates: false },
  { topics: [HOW_DELIVERABLES_WORK], showStates: true },
  { topics: [BEFORE_YOU_START], showStates: false },
];

export const ADMIN_TOPICS: GuideTopic[] = [
  {
    title: "Accounts",
    body:
      "You create every account, one at a time or a whole class with Add several. Each person " +
      "chooses a password, then sees a short welcome. It happens once.",
    points: [
      "Email a link: they choose a password from the email. Links last about an hour.",
      "Temporary password: you pass it on yourself. It works for 3 days, and their next sign-in makes them replace it.",
      "Invited: they have not finished signing in for the first time, or are on a temporary password.",
      "Set up: ready to use. Disabled: signed out and blocked, with all their work kept.",
      "Removing an account deletes it and everything attached to it, for good.",
      "Locked out? Send a new password link or give a new temporary password, from the new member's page or the People page.",
    ],
  },
  {
    title: "People",
    body:
      "The People page lists everyone with a portal account: admins, actives and new members. " +
      "Accounts of every role are managed there, and roles can be changed there too.",
    points: [
      "Actives are SEP members who can follow the class. They see names, teams, progress and what new members have turned in.",
      "Actives never see punishments, time on site, emails or unreleased deliverables, and they change nothing.",
      "Change role moves someone between new member, active and admin. They are signed out everywhere and get the new access at their next sign-in.",
      "A new member made an active or an admin comes off their team and out of the progress views. Their past responses stay in the deliverables' records.",
      "The preview buttons let you go through a new member's first visit yourself, in a separate tab, without touching real members.",
    ],
  },
  {
    title: "Deliverables",
    body: "Write the questions, set the schedule, then publish. New members never see a draft.",
    points: [
      "Visible from: when it appears on dashboards as coming up.",
      "Opens: when new members can start it. Before then they see the title and dates, never the questions.",
      "Due: the deadline, to the minute. With late responses on, later ones are accepted and marked late.",
      "Unlock order: keep it locked for each new member until they turn in another deliverable.",
      "Editing a published deliverable only affects new members who have not turned it in yet.",
    ],
  },
  {
    title: "Responses",
    body:
      "Each deliverable's Responses tab has a summary, every response in full, who is still " +
      "missing, and a spreadsheet download.",
    points: [
      "Response time is measured from when a new member first opens the deliverable.",
      "Delete and reopen removes one response so the person can turn it in again.",
    ],
  },
  {
    title: "Teams",
    body:
      "Everyone starts on their own. When teams form, create them on the Teams page and move " +
      "new members in. One team per person.",
    points: [
      "Teams group the New members view and the responses, so you can follow each team's progress.",
      "A new member sees the name of their team and the names of their teammates, and nothing else about them.",
      "Deliverables are still turned in by each new member, whether or not they are on a team.",
      "Deleting a team keeps its members and all their work. They go back to working individually.",
    ],
  },
  {
    title: "Punishments and privacy",
    body:
      "New members are not told about punishments anywhere in the portal. One appears as a notice " +
      "on their dashboard only once you assign it, and stays until you resolve it. Explain them in person.",
    points: [
      "New members can only ever see their own responses, notices and account.",
      "Actives can read responses, which may include whatever a new member typed into an answer.",
      "Everything every admin does is recorded under Activity.",
      "Time on site counts only time with a portal tab open and in view.",
    ],
  },
];

export const ACTIVE_TOPICS: GuideTopic[] = [
  {
    title: "What you can see",
    body:
      "As an active you can follow how the class is doing and read what they turn in. " +
      "Everything here is view only.",
    points: [
      "New members: each one, their team, and how many deliverables they have turned in.",
      "Deliverables: every released deliverable, a summary of the answers, and each response in full.",
      "Not turned in: who still owes a deliverable, and whether they are late or locked.",
      "The Refresh button on the New members page pulls the latest. Nothing updates on its own.",
    ],
  },
  {
    title: "What stays with the admins",
    body: "Some things are for the Founder's Education admins only, and are not shown to actives.",
    points: [
      "Punishments, and anything about a new member's standing beyond their deliverables.",
      "When a new member is signed in and how long they spend in the portal.",
      "Email addresses and account details.",
      "Deliverables that are still being written or have not been released.",
    ],
  },
  {
    title: "Reading responses well",
    body: "New members write these for the admins and for you. Treat them the way you would want yours treated.",
    points: [
      "Responses can include personal detail. Keep them inside SEP.",
      "If something in a response worries you, tell an admin.",
      "You cannot edit, reopen or delete anything. If something looks wrong, an admin can fix it.",
      "If a new member asks you about a forgotten password, pass it on to an admin. Only admins can give a new one.",
    ],
  },
];

/** The screens an active sees once, on their first visit: one topic each. */
export const ACTIVE_WELCOME_STEPS: ReadonlyArray<{ topics: GuideTopic[]; showStates: boolean }> =
  ACTIVE_TOPICS.map((topic) => ({ topics: [topic], showStates: false }));
