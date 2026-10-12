/**
 * Wire types for the Founder's Education portal: the shapes that cross the
 * network between the browser and /api/portal. Timestamps are UTC ISO-8601
 * strings here. Firestore Timestamps exist only inside the server layer.
 */

export type IsoDateTime = string;

export type Role = "admin" | "active" | "pledge";
/** The two kinds of account an admin creates. Admins are set up outside the portal. */
export type MemberRole = Exclude<Role, "admin">;
export type UserStatus = "active" | "disabled";
export type FormStatus = "draft" | "published" | "archived";

// ── Form definition ──────────────────────────────────────────────────────────

export interface QuestionOption {
  id: string;
  label: string;
}

interface BlockBase {
  id: string;
  title: string;
  description: string;
}

/** A title/description block that takes no answer. */
export interface SectionBlock extends BlockBase {
  type: "section";
}

interface AnswerableBase extends BlockBase {
  required: boolean;
}

export type ShortTextValidation = "none" | "number" | "email" | "url";

export interface ShortTextQuestion extends AnswerableBase {
  type: "short_text";
  validation: ShortTextValidation;
}

export interface ParagraphQuestion extends AnswerableBase {
  type: "paragraph";
}

export interface DateQuestion extends AnswerableBase {
  type: "date";
}

export interface TimeQuestion extends AnswerableBase {
  type: "time";
}

export interface MultipleChoiceQuestion extends AnswerableBase {
  type: "multiple_choice";
  options: QuestionOption[];
  allowOther: boolean;
}

export interface CheckboxesQuestion extends AnswerableBase {
  type: "checkboxes";
  options: QuestionOption[];
  allowOther: boolean;
}

export interface DropdownQuestion extends AnswerableBase {
  type: "dropdown";
  options: QuestionOption[];
}

export interface LinearScaleQuestion extends AnswerableBase {
  type: "linear_scale";
  min: 0 | 1;
  max: number;
  minLabel: string;
  maxLabel: string;
}

export type AnswerableQuestion =
  | ShortTextQuestion
  | ParagraphQuestion
  | DateQuestion
  | TimeQuestion
  | MultipleChoiceQuestion
  | CheckboxesQuestion
  | DropdownQuestion
  | LinearScaleQuestion;

export type Question = SectionBlock | AnswerableQuestion;
export type QuestionType = Question["type"];

export interface FormSettings {
  /** When the deliverable appears on pledge dashboards. Null means as soon as it is published. */
  visibleAt: IsoDateTime | null;
  /** When pledges can start filling it in. Null means as soon as it is visible. */
  opensAt: IsoDateTime | null;
  /** Deadline. Null means no deadline. */
  dueAt: IsoDateTime | null;
  /** Hard stop for late submissions. Only used when allowLate is true. */
  closesAt: IsoDateTime | null;
  allowLate: boolean;
  /** This deliverable stays locked until the pledge has turned in that one. */
  prerequisiteFormId: string | null;
  confirmationMessage: string;
}

export interface FormDefinition {
  title: string;
  description: string;
  status: FormStatus;
  questions: Question[];
  settings: FormSettings;
}

// ── Answers ──────────────────────────────────────────────────────────────────

export type Answer =
  /** short_text, paragraph, date ("YYYY-MM-DD") and time ("HH:mm"). */
  | { kind: "text"; value: string }
  /** multiple_choice and dropdown. Exactly one of optionId / other is set. */
  | { kind: "choice"; optionId: string | null; other: string | null }
  /** checkboxes. */
  | { kind: "choices"; optionIds: string[]; other: string | null }
  /** linear_scale. */
  | { kind: "scale"; value: number };

/** Keyed by question id. A missing key means the question was left blank. */
export type Answers = Record<string, Answer>;

// ── Form state for one pledge ────────────────────────────────────────────────

export type FormState =
  | "hidden"
  | "upcoming"
  | "locked"
  | "open"
  | "open_late"
  | "submitted"
  | "missed";

export type LockReason = "prerequisite_pending" | "prerequisite_missed";
export type PrerequisiteStatus = "none" | "satisfied" | "unavailable" | "pending" | "missed";

export interface SubmittedEntry {
  submittedAt: IsoDateTime;
  late: boolean;
}

/** Keyed by form id. */
export type SubmittedMap = Record<string, SubmittedEntry>;

export interface Progress {
  /** Deliverables this pledge can see. */
  total: number;
  /** Of those, the ones that have opened. */
  released: number;
  submitted: number;
  onTime: number;
  late: number;
  missed: number;
  /** Open or locked, still to be turned in. */
  outstanding: number;
  upcoming: number;
  /** submitted / released, 0 to 100. */
  completionPct: number;
}

// ── Pledge-facing responses ──────────────────────────────────────────────────

export interface MeDto {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  pledgeClass: string | null;
  createdAt: IsoDateTime | null;
  /** The pledge's own team. Null for admins and for pledges working on their own. */
  team: MyTeamDto | null;
  /** When the welcome tour was finished. Null until then, and always null for admins. */
  onboardedAt: IsoDateTime | null;
  serverNow: IsoDateTime;
}

/** What a pledge may know about their team: its name and who else is on it. Nothing more. */
export interface MyTeamDto {
  name: string;
  /** Display names of the other members, in alphabetical order. */
  teammates: string[];
}

/** Everything a pledge may know about a deliverable before opening it. Never includes questions. */
export interface FormCardDto {
  id: string;
  title: string;
  description: string;
  state: FormState;
  late: boolean;
  lockReason: LockReason | null;
  lockedByTitle: string | null;
  opensAt: IsoDateTime | null;
  dueAt: IsoDateTime | null;
  closesAt: IsoDateTime | null;
  allowLate: boolean;
  submittedAt: IsoDateTime | null;
  draftUpdatedAt: IsoDateTime | null;
  questionCount: number;
}

export type PunishmentStatus = "active" | "resolved";

export interface PunishmentDto {
  id: string;
  uid: string;
  title: string;
  details: string;
  status: PunishmentStatus;
  createdAt: IsoDateTime;
  resolvedAt: IsoDateTime | null;
}

export interface DashboardDto {
  serverNow: IsoDateTime;
  forms: FormCardDto[];
  /** Active punishments only. Empty when there are none. */
  punishments: PunishmentDto[];
  progress: Progress;
}

export interface PledgeFormDto {
  serverNow: IsoDateTime;
  card: FormCardDto;
  /** Null unless the deliverable is open for this pledge right now. */
  questions: Question[] | null;
  /**
   * Which edit of the deliverable these questions are. Sent back with the
   * response, so answers are never recorded against questions that changed
   * while the page was open.
   */
  version: number;
  draft: { answers: Answers; updatedAt: IsoDateTime } | null;
}

export interface DraftSavedDto {
  updatedAt: IsoDateTime;
}

export interface SubmitResultDto {
  serverNow: IsoDateTime;
  submittedAt: IsoDateTime;
  late: boolean;
  confirmationMessage: string;
  /** Deliverables that this submission unlocked. */
  unlocked: FormCardDto[];
}

export interface SubmissionSummaryDto {
  formId: string;
  title: string;
  submittedAt: IsoDateTime;
  late: boolean;
  durationSeconds: number;
  questionCount: number;
}

export interface SubmissionHistoryDto {
  serverNow: IsoDateTime;
  submissions: SubmissionSummaryDto[];
}

export interface SubmissionDto {
  formId: string;
  title: string;
  description: string;
  /** The questions as they were when the response was submitted. */
  questions: Question[];
  answers: Answers;
  startedAt: IsoDateTime;
  submittedAt: IsoDateTime;
  durationSeconds: number;
  activeSeconds: number;
  late: boolean;
  lateBySeconds: number;
}

// ── Admin-facing responses ───────────────────────────────────────────────────

export interface ActivityDto {
  firstSeenAt: IsoDateTime | null;
  lastSeenAt: IsoDateTime | null;
  totalActiveSeconds: number;
  sessionCount: number;
  currentSessionStartedAt: IsoDateTime | null;
}

/** invited: has not finished a first sign-in, or is on a temporary password. */
export type AccountState = "invited" | "active" | "disabled";

export interface PledgeRowDto {
  uid: string;
  email: string;
  displayName: string;
  pledgeClass: string | null;
  teamId: string | null;
  status: UserStatus;
  /**
   * Whether sign-in is actually blocked. It can be false for an account shown
   * as disabled, if an earlier change only half went through.
   */
  signInBlocked: boolean;
  accountState: AccountState;
  createdAt: IsoDateTime;
  lastSignInAt: IsoDateTime | null;
  /** When the pledge finished the welcome tour. */
  onboardedAt: IsoDateTime | null;
  activity: ActivityDto;
  submitted: SubmittedMap;
  activePunishments: number;
}

export interface AdminFormSummaryDto {
  id: string;
  title: string;
  status: FormStatus;
  settings: FormSettings;
  questionCount: number;
  responseCount: number;
  version: number;
  updatedAt: IsoDateTime;
}

export interface TeamDto {
  id: string;
  name: string;
  memberCount: number;
  createdAt: IsoDateTime;
}

export interface AdminOverviewDto {
  serverNow: IsoDateTime;
  pledges: PledgeRowDto[];
  forms: AdminFormSummaryDto[];
  /** In alphabetical order. */
  teams: TeamDto[];
}

export interface SessionDto {
  startedAt: IsoDateTime;
  endedAt: IsoDateTime | null;
  activeSeconds: number;
  current: boolean;
}

export interface PledgeDetailDto {
  serverNow: IsoDateTime;
  pledge: PledgeRowDto;
  forms: AdminFormSummaryDto[];
  submissions: SubmissionSummaryDto[];
  /** Active and resolved, newest first. */
  punishments: PunishmentDto[];
  /** Newest first. */
  sessions: SessionDto[];
  teams: TeamDto[];
}

/** How a new account gets its first password. */
export type AccountStart = "link" | "temporary_password";

export interface CreatePledgeResultDto {
  pledge: PledgeRowDto;
  inviteLink: string | null;
  /** Shown to the admin once, and only when the account starts on one. */
  temporaryPassword: string | null;
}

export interface TemporaryPasswordDto {
  temporaryPassword: string;
}

export interface InviteLinkDto {
  inviteLink: string;
}

export interface AdminFormDto extends FormDefinition {
  id: string;
  version: number;
  /** The version at which the title, description or questions last changed. */
  questionsVersion: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  responseCount: number;
}

export interface AdminFormsDto {
  serverNow: IsoDateTime;
  forms: AdminFormSummaryDto[];
  pledgeCount: number;
}

export interface ResponseRowDto {
  uid: string;
  displayName: string;
  email: string;
  teamId: string | null;
  answers: Answers;
  /** The questions as they were when this response was submitted. */
  questions: Question[];
  formVersion: number;
  startedAt: IsoDateTime;
  submittedAt: IsoDateTime;
  durationSeconds: number;
  activeSeconds: number;
  late: boolean;
  lateBySeconds: number;
}

export interface NonResponderDto {
  uid: string;
  displayName: string;
  email: string;
  teamId: string | null;
  state: FormState;
}

export interface FormResponsesDto {
  serverNow: IsoDateTime;
  form: AdminFormDto;
  responses: ResponseRowDto[];
  nonResponders: NonResponderDto[];
  teams: TeamDto[];
}

// ── Active accounts, as admins manage them ───────────────────────────────────

export interface ActiveRowDto {
  uid: string;
  email: string;
  displayName: string;
  status: UserStatus;
  /** Whether sign-in is actually blocked, as for pledges. */
  signInBlocked: boolean;
  accountState: AccountState;
  createdAt: IsoDateTime;
  lastSignInAt: IsoDateTime | null;
}

export interface ActivesDto {
  serverNow: IsoDateTime;
  actives: ActiveRowDto[];
}

export interface CreateActiveResultDto {
  active: ActiveRowDto;
  inviteLink: string | null;
  temporaryPassword: string | null;
}

// ── What an active may read ──────────────────────────────────────────────────
// Actives see the pledges' work and nothing else. These shapes are the whole of
// it: no email, account or security state, time tracking, punishments, or
// anything about a deliverable that has not been released.

export interface ReviewFormSummaryDto {
  id: string;
  title: string;
  opensAt: IsoDateTime | null;
  dueAt: IsoDateTime | null;
  closesAt: IsoDateTime | null;
  allowLate: boolean;
  questionCount: number;
  responseCount: number;
}

export interface ReviewCellDto {
  state: FormState;
  late: boolean;
  submittedAt: IsoDateTime | null;
}

export interface ReviewPledgeDto {
  uid: string;
  displayName: string;
  teamName: string | null;
  progress: Progress;
  /** Keyed by deliverable id. */
  byForm: Record<string, ReviewCellDto>;
}

export interface ReviewOverviewDto {
  serverNow: IsoDateTime;
  forms: ReviewFormSummaryDto[];
  pledges: ReviewPledgeDto[];
}

export interface ReviewResponseDto {
  uid: string;
  displayName: string;
  teamName: string | null;
  submittedAt: IsoDateTime;
  late: boolean;
  lateBySeconds: number;
  /** The questions as they were when this response was submitted. */
  questions: Question[];
  answers: Answers;
}

export interface ReviewNotTurnedInDto {
  uid: string;
  displayName: string;
  teamName: string | null;
  state: FormState;
}

export interface ReviewFormDto {
  serverNow: IsoDateTime;
  form: {
    id: string;
    title: string;
    description: string;
    opensAt: IsoDateTime | null;
    dueAt: IsoDateTime | null;
    closesAt: IsoDateTime | null;
    allowLate: boolean;
    /** Null until the deliverable opens, exactly as for a pledge. */
    questions: Question[] | null;
  };
  responses: ReviewResponseDto[];
  notTurnedIn: ReviewNotTurnedInDto[];
}

export type AuditTargetType = "user" | "form" | "submission" | "punishment" | "team";

export interface AuditEntryDto {
  id: string;
  at: IsoDateTime;
  actorEmail: string;
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  summary: string;
}

export interface AuditLogDto {
  entries: AuditEntryDto[];
  /** An opaque cursor: pass it back as `before` to load the next page. Null when there are no more. */
  nextBefore: string | null;
}

// ── Errors ───────────────────────────────────────────────────────────────────

export interface FieldIssue {
  path: string;
  code: string;
  message: string;
}

export interface ApiErrorBody {
  error: string;
  code: string;
  fields?: FieldIssue[];
}
