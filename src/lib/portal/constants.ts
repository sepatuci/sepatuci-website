/** Limits and timings shared by the portal client and server. */

export const LIMITS = {
  formTitle: 150,
  formDescription: 2000,
  questionTitle: 300,
  questionDescription: 1000,
  optionLabel: 200,
  scaleLabel: 60,
  confirmationMessage: 500,
  maxQuestions: 60,
  maxOptions: 30,
  scaleMaxLow: 2,
  scaleMaxHigh: 10,
  shortText: 500,
  paragraph: 5000,
  otherText: 500,
  displayName: 80,
  pledgeClass: 40,
  punishmentTitle: 120,
  punishmentDetails: 2000,
  teamName: 60,
  maxTeams: 60,
  /** The most sessions shown on a pledge's page. */
  sessionHistory: 200,
  /** Request body caps, in bytes. */
  smallBodyBytes: 16_000,
  answersBodyBytes: 400_000,
  formBodyBytes: 400_000,
  auditPageSize: 50,
} as const;

export const TIMING = {
  heartbeatIntervalMs: 60_000,
  /** Beats closer together than this are ignored, so several open tabs do not multiply writes. */
  heartbeatMinIntervalMs: 20_000,
  /** The most time one beat can credit. Covers a throttled background tab without counting long gaps. */
  heartbeatMaxCreditSeconds: 90,
  /** A gap longer than this starts a new session. */
  sessionGapMs: 5 * 60_000,
  /** A pledge counts as online if they were seen this recently. */
  onlineWindowMs: 150_000,
  idleSignOutMs: 30 * 60_000,
  /** A sign-in is good for this long, however active the tab is. The server enforces it. */
  maxSessionAgeMs: 12 * 60 * 60_000,
  /** A temporary password works for this long after a chair issues it. */
  temporaryPasswordMs: 72 * 60 * 60_000,
  /** Replacing a temporary password has to follow the sign-in this closely. */
  passwordSetupMs: 15 * 60_000,
  /** A draft saves this long after the last keystroke, */
  draftSaveDebounceMs: 4000,
  /** at least this often while someone types without pausing, */
  draftSaveMaxWaitMs: 20_000,
  /** and never more often than this, which keeps a long writing session well inside the write ceiling. */
  draftSaveMinIntervalMs: 8_000,
  /** How often an open dashboard checks for changes while it is in view. */
  dashboardRefreshMs: 5 * 60_000,
} as const;

export const PASSWORD_MIN_LENGTH = 10;

/** Pledge accounts must use a UCI address. */
export const UCI_EMAIL_PATTERN = /^[a-z0-9._%+-]+@uci\.edu$/;

/** Firestore document ids and Firebase uids that are safe to place in a document path. */
export const ID_PATTERN = /^[A-Za-z0-9]{1,64}$/;

/**
 * Ids of questions and options, generated in the form builder. They start with a
 * letter or digit, which keeps out the `__name__` form that Firestore reserves.
 */
export const LOCAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

/**
 * Question ids become the keys of the stored answers, so a name that every
 * object inherits, such as "constructor", is refused along with anything
 * outside the pattern.
 */
export function isLocalId(value: unknown): value is string {
  return typeof value === "string" && LOCAL_ID_PATTERN.test(value) && !(value in Object.prototype);
}

export const PORTAL_NAME = "Founder's Education Portal";
export const PROGRAM_NAME = "Founder's Education";
export const ORG_NAME = "Sigma Eta Pi at UC Irvine";
export const TOTP_ISSUER = "SEP at UCI";
