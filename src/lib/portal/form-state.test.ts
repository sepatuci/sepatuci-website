import { describe, expect, it } from "vitest";
import {
  computeFormState,
  evaluateForm,
  formStateLabel,
  hasOpened,
  isReleased,
  lateAfterMs,
  resolvePrerequisite,
  type FormLike,
  type FormStateInput,
} from "./form-state";
import type { FormSettings, FormState, PrerequisiteStatus, SubmittedMap } from "./types";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** The instant every test treats as "now" unless it says otherwise. It is the start of a minute. */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
/**
 * A deadline covers the whole of its minute: for one set at NOW this is the
 * last instant inside it, and one millisecond later is the first instant after.
 */
const END_OF_MINUTE = MINUTE - 1;
const iso = (ms: number): string => new Date(ms).toISOString();

function settings(overrides: Partial<FormSettings> = {}): FormSettings {
  return {
    visibleAt: null,
    opensAt: null,
    dueAt: null,
    closesAt: null,
    allowLate: false,
    prerequisiteFormId: null,
    confirmationMessage: "",
    ...overrides,
  };
}

function input(overrides: Partial<FormStateInput> = {}): FormStateInput {
  return {
    status: "published",
    settings: settings(),
    submission: null,
    prerequisite: "none",
    userCreatedAtMs: NOW - 60 * DAY,
    nowMs: NOW,
    ...overrides,
  };
}

function form(id: string, overrides: Partial<FormSettings> = {}, extra: Partial<FormLike> = {}): FormLike {
  return { id, title: `Title of ${id}`, status: "published", settings: settings(overrides), ...extra };
}

const stateAt = (nowMs: number, overrides: Partial<FormStateInput>): FormState =>
  computeFormState(input({ ...overrides, nowMs })).state;

describe("computeFormState", () => {
  describe("result shape for each state", () => {
    it("is open and submittable when published with no schedule at all", () => {
      expect(computeFormState(input())).toEqual({
        state: "open",
        late: false,
        canSubmit: true,
        showQuestions: true,
        lockReason: null,
      });
    });

    it("is open_late, flagged late and still submittable after the deadline when late work is accepted", () => {
      const result = computeFormState(
        input({ settings: settings({ dueAt: iso(NOW - HOUR), allowLate: true }) }),
      );
      expect(result).toEqual({
        state: "open_late",
        late: true,
        canSubmit: true,
        showQuestions: true,
        lockReason: null,
      });
    });

    it.each<[string, Partial<FormStateInput>, FormState]>([
      ["hidden (draft)", { status: "draft" }, "hidden"],
      ["upcoming", { settings: settings({ opensAt: iso(NOW + HOUR) }) }, "upcoming"],
      ["missed", { settings: settings({ dueAt: iso(NOW - HOUR) }) }, "missed"],
      ["locked", { prerequisite: "pending" }, "locked"],
      ["submitted", { submission: { submittedAt: iso(NOW - HOUR), late: false } }, "submitted"],
    ])("never exposes questions or accepts a submission when %s", (_label, overrides, expected) => {
      const result = computeFormState(input(overrides));
      expect(result.state).toBe(expected);
      expect(result.canSubmit).toBe(false);
      expect(result.showQuestions).toBe(false);
    });
  });

  describe("precedence (first matching rule wins)", () => {
    const submission = { submittedAt: iso(NOW - DAY), late: true };

    it.each<[string, Partial<FormStateInput>]>([
      ["the form was archived afterwards", { status: "archived" }],
      ["the form went back to draft", { status: "draft" }],
      ["the form is not visible yet", { settings: settings({ visibleAt: iso(NOW + DAY) }) }],
      ["the form has not opened yet", { settings: settings({ opensAt: iso(NOW + DAY) }) }],
      ["the form has closed", { settings: settings({ dueAt: iso(NOW - DAY) }) }],
      ["the deadline predates the account", { settings: settings({ dueAt: iso(NOW - 90 * DAY) }) }],
      ["the prerequisite is still pending", { prerequisite: "pending" }],
      ["the prerequisite was missed", { prerequisite: "missed" }],
    ])("1. a submission stays submitted even when %s", (_label, overrides) => {
      const result = computeFormState(input({ ...overrides, submission }));
      expect(result.state).toBe("submitted");
      expect(result.late).toBe(true);
      expect(result.lockReason).toBeNull();
    });

    it("1. carries the late flag of the submission, not of the current instant", () => {
      const onTime = computeFormState(
        input({
          submission: { submittedAt: iso(NOW - 10 * DAY), late: false },
          settings: settings({ dueAt: iso(NOW - DAY), allowLate: true }),
        }),
      );
      expect(onTime).toMatchObject({ state: "submitted", late: false });
    });

    it.each<["draft" | "archived"]>([["draft"], ["archived"]])(
      "2. a %s form is hidden even inside its open window",
      (status) => {
        const result = computeFormState(
          input({
            status,
            settings: settings({ opensAt: iso(NOW - DAY), dueAt: iso(NOW + DAY) }),
          }),
        );
        expect(result.state).toBe("hidden");
      },
    );

    it("3. before visibleAt it is hidden rather than upcoming", () => {
      expect(
        stateAt(NOW, { settings: settings({ visibleAt: iso(NOW + DAY), opensAt: iso(NOW + 2 * DAY) }) }),
      ).toBe("hidden");
    });

    it("4. a deliverable that was over before the account existed is hidden rather than missed", () => {
      const created = NOW - 5 * DAY;
      expect(
        stateAt(NOW, { userCreatedAtMs: created, settings: settings({ dueAt: iso(created - DAY) }) }),
      ).toBe("hidden");
    });

    it("5. upcoming wins over missed when a form opens after its own deadline", () => {
      expect(
        stateAt(NOW, { settings: settings({ opensAt: iso(NOW + DAY), dueAt: iso(NOW - DAY) }) }),
      ).toBe("upcoming");
    });

    it.each<[PrerequisiteStatus]>([["pending"], ["missed"]])(
      "5. upcoming wins over locked (prerequisite %s)",
      (prerequisite) => {
        expect(stateAt(NOW, { prerequisite, settings: settings({ opensAt: iso(NOW + DAY) }) })).toBe(
          "upcoming",
        );
      },
    );

    it.each<[PrerequisiteStatus]>([["pending"], ["missed"]])(
      "6. missed wins over locked (prerequisite %s)",
      (prerequisite) => {
        expect(stateAt(NOW, { prerequisite, settings: settings({ dueAt: iso(NOW - DAY) }) })).toBe(
          "missed",
        );
      },
    );

    it("7. locked wins over open_late, and a locked form is never flagged late", () => {
      const result = computeFormState(
        input({
          prerequisite: "pending",
          settings: settings({ dueAt: iso(NOW - DAY), allowLate: true }),
        }),
      );
      expect(result).toEqual({
        state: "locked",
        late: false,
        canSubmit: false,
        showQuestions: false,
        lockReason: "prerequisite_pending",
      });
    });
  });

  describe("exact boundary instants", () => {
    it("becomes visible exactly at visibleAt", () => {
      const overrides = { settings: settings({ visibleAt: iso(NOW) }) };
      expect(stateAt(NOW - 1, overrides)).toBe("hidden");
      expect(stateAt(NOW, overrides)).toBe("open");
    });

    it("opens exactly at opensAt", () => {
      const overrides = { settings: settings({ visibleAt: iso(NOW - DAY), opensAt: iso(NOW) }) };
      expect(stateAt(NOW - 1, overrides)).toBe("upcoming");
      expect(stateAt(NOW, overrides)).toBe("open");
    });

    it("is still open and on time through the whole of the due minute, and missed one millisecond after it", () => {
      const overrides = { settings: settings({ dueAt: iso(NOW) }) };
      for (const nowMs of [NOW, NOW + 1, NOW + 40_000, NOW + END_OF_MINUTE]) {
        expect(computeFormState(input({ ...overrides, nowMs }))).toMatchObject({
          state: "open",
          late: false,
          canSubmit: true,
          showQuestions: true,
        });
      }
      expect(computeFormState(input({ ...overrides, nowMs: NOW + MINUTE }))).toMatchObject({
        state: "missed",
        canSubmit: false,
        showQuestions: false,
      });
    });

    it("treats a deadline shown as 11:59 PM as covering 11:59:59.999, and as over at midnight", () => {
      const due = Date.UTC(2026, 9, 14, 23, 59, 0, 0);
      const lastInstant = Date.UTC(2026, 9, 14, 23, 59, 59, 999);
      const midnight = Date.UTC(2026, 9, 15, 0, 0, 0, 0);
      const strict = { settings: settings({ dueAt: iso(due) }) };
      expect(computeFormState(input({ ...strict, nowMs: lastInstant }))).toMatchObject({ state: "open", late: false, canSubmit: true });
      expect(computeFormState(input({ ...strict, nowMs: midnight }))).toMatchObject({ state: "missed", canSubmit: false });

      const lenient = { settings: settings({ dueAt: iso(due), allowLate: true }) };
      expect(computeFormState(input({ ...lenient, nowMs: lastInstant }))).toMatchObject({ state: "open", late: false });
      expect(computeFormState(input({ ...lenient, nowMs: midnight }))).toMatchObject({ state: "open_late", late: true, canSubmit: true });
    });

    it("turns late one millisecond after the due minute when late work is accepted", () => {
      const overrides = {
        settings: settings({ dueAt: iso(NOW), closesAt: iso(NOW + DAY), allowLate: true }),
      };
      expect(computeFormState(input({ ...overrides, nowMs: NOW }))).toMatchObject({
        state: "open",
        late: false,
      });
      expect(computeFormState(input({ ...overrides, nowMs: NOW + END_OF_MINUTE }))).toMatchObject({
        state: "open",
        late: false,
        canSubmit: true,
      });
      expect(computeFormState(input({ ...overrides, nowMs: NOW + MINUTE }))).toMatchObject({
        state: "open_late",
        late: true,
        canSubmit: true,
      });
    });

    it("still accepts late work through the whole of the closing minute, and is missed one millisecond after it", () => {
      const overrides = {
        settings: settings({ dueAt: iso(NOW - DAY), closesAt: iso(NOW), allowLate: true }),
      };
      expect(stateAt(NOW, overrides)).toBe("open_late");
      expect(stateAt(NOW + END_OF_MINUTE, overrides)).toBe("open_late");
      expect(stateAt(NOW + MINUTE, overrides)).toBe("missed");
    });

    it("ends the minute at the same instant wherever in it the stored time falls", () => {
      for (const within of [0, 1, 30_000, 59_000, END_OF_MINUTE]) {
        const due = { settings: settings({ dueAt: iso(NOW + within) }) };
        expect(stateAt(NOW + END_OF_MINUTE, due)).toBe("open");
        expect(stateAt(NOW + MINUTE, due)).toBe("missed");

        const closes = { settings: settings({ dueAt: iso(NOW - DAY), closesAt: iso(NOW + within), allowLate: true }) };
        expect(stateAt(NOW + END_OF_MINUTE, closes)).toBe("open_late");
        expect(stateAt(NOW + MINUTE, closes)).toBe("missed");
      }
    });

    it("does not stretch the start of a window: only deadlines are rounded to the end of their minute", () => {
      const visible = { settings: settings({ visibleAt: iso(NOW + 30_000) }) };
      expect(stateAt(NOW + 29_999, visible)).toBe("hidden");
      expect(stateAt(NOW + 30_000, visible)).toBe("open");
      const opens = { settings: settings({ visibleAt: iso(NOW - DAY), opensAt: iso(NOW + 30_000) }) };
      expect(stateAt(NOW + 29_999, opens)).toBe("upcoming");
      expect(stateAt(NOW + 30_000, opens)).toBe("open");
    });

    it("is open for exactly one minute when visibleAt, opensAt and dueAt are all the same instant", () => {
      const overrides = {
        settings: settings({ visibleAt: iso(NOW), opensAt: iso(NOW), dueAt: iso(NOW) }),
      };
      expect(stateAt(NOW - 1, overrides)).toBe("hidden");
      expect(stateAt(NOW, overrides)).toBe("open");
      expect(stateAt(NOW + END_OF_MINUTE, overrides)).toBe("open");
      expect(stateAt(NOW + MINUTE, overrides)).toBe("missed");
    });
  });

  describe("schedule arithmetic", () => {
    it("opens at visibleAt when opensAt is null", () => {
      const overrides = { settings: settings({ visibleAt: iso(NOW) }) };
      expect(stateAt(NOW, overrides)).toBe("open");
    });

    it("cannot open before it is visible: an earlier opensAt is raised to visibleAt", () => {
      const overrides = {
        settings: settings({ visibleAt: iso(NOW), opensAt: iso(NOW - 5 * DAY) }),
      };
      expect(stateAt(NOW - DAY, overrides)).toBe("hidden");
      expect(stateAt(NOW, overrides)).toBe("open");
    });

    it("shows as upcoming between visibleAt and opensAt", () => {
      const overrides = {
        settings: settings({ visibleAt: iso(NOW - DAY), opensAt: iso(NOW + DAY) }),
      };
      expect(stateAt(NOW, overrides)).toBe("upcoming");
    });

    it("never closes when there is no deadline", () => {
      const result = computeFormState(input({ nowMs: NOW + 3650 * DAY }));
      expect(result).toMatchObject({ state: "open", late: false, canSubmit: true });
    });

    it("accepts late work indefinitely when allowLate is on and closesAt is null", () => {
      const overrides = { settings: settings({ dueAt: iso(NOW), allowLate: true }) };
      expect(stateAt(NOW + 3650 * DAY, overrides)).toBe("open_late");
    });

    it("ignores closesAt when allowLate is off", () => {
      const overrides = {
        settings: settings({ dueAt: iso(NOW), closesAt: iso(NOW + 30 * DAY), allowLate: false }),
      };
      expect(stateAt(NOW + END_OF_MINUTE, overrides)).toBe("open");
      expect(stateAt(NOW + MINUTE, overrides)).toBe("missed");
    });

    it("never closes before the deadline: a closesAt earlier than dueAt is raised to dueAt", () => {
      const overrides = {
        settings: settings({ dueAt: iso(NOW), closesAt: iso(NOW - 5 * DAY), allowLate: true }),
      };
      expect(stateAt(NOW - DAY, overrides)).toBe("open");
      expect(stateAt(NOW, overrides)).toBe("open");
      expect(stateAt(NOW + END_OF_MINUTE, overrides)).toBe("open");
      expect(stateAt(NOW + MINUTE, overrides)).toBe("missed");
    });

    it("has no late window when closesAt falls in the same minute as dueAt", () => {
      const overrides = {
        settings: settings({ dueAt: iso(NOW + 10_000), closesAt: iso(NOW + 50_000), allowLate: true }),
      };
      expect(computeFormState(input({ ...overrides, nowMs: NOW + END_OF_MINUTE }))).toMatchObject({ state: "open", late: false });
      expect(stateAt(NOW + MINUTE, overrides)).toBe("missed");
    });

    // Documents close = max(closesAt ?? +inf, due): with no deadline, due is +inf, so a
    // closesAt on its own is never enforced. validateFormDefinition refuses this shape.
    it("does not enforce a closesAt that has no dueAt to be late against", () => {
      const overrides = { settings: settings({ closesAt: iso(NOW - DAY), allowLate: true }) };
      expect(computeFormState(input({ ...overrides, nowMs: NOW }))).toMatchObject({
        state: "open",
        late: false,
        canSubmit: true,
      });
    });
  });

  describe("late joiners", () => {
    const created = NOW - 10 * DAY;

    it("hides a deliverable whose deadline passed before the account was created", () => {
      const overrides = { userCreatedAtMs: created, settings: settings({ dueAt: iso(created - 1) }) };
      expect(stateAt(NOW, overrides)).toBe("hidden");
    });

    it("applies a deliverable to an account created inside its due minute, up to the last millisecond but one", () => {
      // The deadline covers its whole minute, so at these instants it could still be turned in.
      const dueSettings = settings({ dueAt: iso(created) });
      for (const userCreatedAtMs of [created, created + 30_000, created + END_OF_MINUTE - 1]) {
        expect(stateAt(NOW, { userCreatedAtMs, settings: dueSettings })).toBe("missed");
      }
    });

    it("hides a deliverable from an account created at the last instant of its due minute, or later", () => {
      const dueSettings = settings({ dueAt: iso(created) });
      for (const userCreatedAtMs of [created + END_OF_MINUTE, created + MINUTE, created + DAY]) {
        expect(stateAt(NOW, { userCreatedAtMs, settings: dueSettings })).toBe("hidden");
      }
    });

    it("applies a deliverable whose deadline was one millisecond after the account was created", () => {
      const overrides = { userCreatedAtMs: created, settings: settings({ dueAt: iso(created + 1) }) };
      expect(stateAt(NOW, overrides)).toBe("missed");
    });

    it("hides it even when late work is still being accepted from earlier pledges", () => {
      const overrides = {
        userCreatedAtMs: created,
        settings: settings({ dueAt: iso(created - DAY), closesAt: iso(NOW + 30 * DAY), allowLate: true }),
      };
      expect(stateAt(NOW, overrides)).toBe("hidden");
      // The same form for a pledge who was there before the deadline.
      expect(stateAt(NOW, { ...overrides, userCreatedAtMs: created - 2 * DAY })).toBe("open_late");
    });

    it("always applies a deliverable with no deadline, however old it is", () => {
      const overrides = {
        userCreatedAtMs: created,
        settings: settings({ visibleAt: iso(created - 300 * DAY), opensAt: iso(created - 300 * DAY) }),
      };
      expect(stateAt(NOW, overrides)).toBe("open");
    });

    it("shows a deliverable that opened before the account existed but is due afterwards", () => {
      const overrides = {
        userCreatedAtMs: created,
        settings: settings({ opensAt: iso(created - 5 * DAY), dueAt: iso(NOW + DAY) }),
      };
      expect(stateAt(NOW, overrides)).toBe("open");
    });
  });

  describe("prerequisite status", () => {
    const window = settings({ opensAt: iso(NOW - DAY), dueAt: iso(NOW + DAY) });

    it.each<[PrerequisiteStatus]>([["none"], ["satisfied"], ["unavailable"]])(
      "does not block when the prerequisite is %s",
      (prerequisite) => {
        expect(computeFormState(input({ settings: window, prerequisite }))).toMatchObject({
          state: "open",
          canSubmit: true,
          lockReason: null,
        });
      },
    );

    it("locks with prerequisite_pending while the prerequisite can still be turned in", () => {
      expect(computeFormState(input({ settings: window, prerequisite: "pending" }))).toMatchObject({
        state: "locked",
        lockReason: "prerequisite_pending",
        canSubmit: false,
        showQuestions: false,
      });
    });

    it("locks with prerequisite_missed once the prerequisite can no longer be turned in", () => {
      expect(computeFormState(input({ settings: window, prerequisite: "missed" }))).toMatchObject({
        state: "locked",
        lockReason: "prerequisite_missed",
        canSubmit: false,
        showQuestions: false,
      });
    });
  });
});

describe("resolvePrerequisite", () => {
  const created = NOW - 60 * DAY;
  const resolve = (
    prerequisite: FormLike | null,
    submitted: SubmittedMap = {},
    nowMs = NOW,
    createdMs = created,
  ): PrerequisiteStatus => resolvePrerequisite("pre", prerequisite, submitted, createdMs, nowMs);

  it("is none when the form has no prerequisite", () => {
    expect(resolvePrerequisite(null, form("pre"), {}, created, NOW)).toBe("none");
  });

  it("is satisfied once the pledge has turned the prerequisite in", () => {
    const submitted = { pre: { submittedAt: iso(NOW - DAY), late: false } };
    expect(resolve(form("pre"), submitted)).toBe("satisfied");
  });

  it("stays satisfied when the prerequisite has since been deleted, archived or closed", () => {
    const submitted = { pre: { submittedAt: iso(NOW - DAY), late: true } };
    expect(resolve(null, submitted)).toBe("satisfied");
    expect(resolve(form("pre", {}, { status: "archived" }), submitted)).toBe("satisfied");
    expect(resolve(form("pre", { dueAt: iso(NOW - HOUR) }), submitted)).toBe("satisfied");
  });

  it("is unavailable when the prerequisite does not exist", () => {
    expect(resolve(null)).toBe("unavailable");
  });

  it.each<["draft" | "archived"]>([["draft"], ["archived"]])(
    "is unavailable when the prerequisite is %s",
    (status) => {
      expect(resolve(form("pre", { dueAt: iso(NOW + DAY) }, { status }))).toBe("unavailable");
    },
  );

  it("is unavailable when the prerequisite was already over before the account existed", () => {
    expect(resolve(form("pre", { dueAt: iso(created - DAY) }))).toBe("unavailable");
    expect(resolve(form("pre", { dueAt: iso(created - MINUTE) }))).toBe("unavailable");
  });

  it("counts the whole due minute when deciding whether the prerequisite predates the account", () => {
    const prerequisite = form("pre", { dueAt: iso(created) });
    // Created at the last instant of the due minute: there was never time to turn it in.
    expect(resolve(prerequisite, {}, NOW, created + END_OF_MINUTE)).toBe("unavailable");
    // Created a millisecond earlier, or at the start of that minute: it applied, and was missed.
    expect(resolve(prerequisite, {}, NOW, created + END_OF_MINUTE - 1)).toBe("missed");
    expect(resolve(prerequisite, {}, NOW, created)).toBe("missed");
  });

  it("is pending while the prerequisite is open", () => {
    expect(resolve(form("pre", { opensAt: iso(NOW - DAY), dueAt: iso(NOW + DAY) }))).toBe("pending");
  });

  it("is pending while the prerequisite is still upcoming or not yet visible", () => {
    expect(resolve(form("pre", { visibleAt: iso(NOW + DAY), dueAt: iso(NOW + 5 * DAY) }))).toBe(
      "pending",
    );
    expect(resolve(form("pre", { opensAt: iso(NOW + DAY) }))).toBe("pending");
  });

  it("is pending for a prerequisite with no deadline, however much time passes", () => {
    expect(resolve(form("pre"), {}, NOW + 3650 * DAY)).toBe("pending");
  });

  it("is pending through the whole of the prerequisite's due minute and missed one millisecond after it", () => {
    const prerequisite = form("pre", { dueAt: iso(NOW) });
    expect(resolve(prerequisite, {}, NOW)).toBe("pending");
    expect(resolve(prerequisite, {}, NOW + END_OF_MINUTE)).toBe("pending");
    expect(resolve(prerequisite, {}, NOW + MINUTE)).toBe("missed");
  });

  it("is pending through the prerequisite's late window, closing minute included, and missed after it", () => {
    const prerequisite = form("pre", {
      dueAt: iso(NOW - DAY),
      closesAt: iso(NOW + DAY),
      allowLate: true,
    });
    expect(resolve(prerequisite, {}, NOW)).toBe("pending");
    expect(resolve(prerequisite, {}, NOW + DAY)).toBe("pending");
    expect(resolve(prerequisite, {}, NOW + DAY + END_OF_MINUTE)).toBe("pending");
    expect(resolve(prerequisite, {}, NOW + DAY + MINUTE)).toBe("missed");
  });

  it("looks only at a submission of the prerequisite itself", () => {
    const submitted = { other: { submittedAt: iso(NOW - DAY), late: false } };
    expect(resolve(form("pre"), submitted)).toBe("pending");
  });
});

describe("evaluateForm", () => {
  const created = NOW - 60 * DAY;
  const byId = (...forms: FormLike[]): Map<string, FormLike> =>
    new Map(forms.map((item) => [item.id, item]));

  it("locks behind an unsubmitted prerequisite and names it", () => {
    const pre = form("pre", { dueAt: iso(NOW + DAY) });
    const next = form("next", { prerequisiteFormId: "pre" });
    expect(evaluateForm(next, byId(pre, next), {}, created, NOW)).toEqual({
      state: "locked",
      late: false,
      canSubmit: false,
      showQuestions: false,
      lockReason: "prerequisite_pending",
      prerequisite: "pending",
      lockedByTitle: "Title of pre",
      lockedByVisible: true,
    });
  });

  it("reports prerequisite_missed, still naming the prerequisite, once it has closed", () => {
    const pre = form("pre", { dueAt: iso(NOW - DAY) });
    const next = form("next", { prerequisiteFormId: "pre" });
    expect(evaluateForm(next, byId(pre, next), {}, created, NOW)).toMatchObject({
      state: "locked",
      lockReason: "prerequisite_missed",
      prerequisite: "missed",
      lockedByTitle: "Title of pre",
      lockedByVisible: true,
    });
  });

  describe("a prerequisite the pledge cannot see yet", () => {
    const next = form("next", { prerequisiteFormId: "pre" });

    it("still locks, and still carries the title for admin views, but is marked as not visible", () => {
      const pre = form("pre", { visibleAt: iso(NOW + DAY), dueAt: iso(NOW + 5 * DAY) });
      expect(evaluateForm(next, byId(pre, next), {}, created, NOW)).toEqual({
        state: "locked",
        late: false,
        canSubmit: false,
        showQuestions: false,
        lockReason: "prerequisite_pending",
        prerequisite: "pending",
        lockedByTitle: "Title of pre",
        lockedByVisible: false,
      });
    });

    it("becomes visible exactly at the prerequisite's visibleAt", () => {
      const pre = form("pre", { visibleAt: iso(NOW), dueAt: iso(NOW + DAY) });
      const forms = byId(pre, next);
      expect(evaluateForm(next, forms, {}, created, NOW - 1)).toMatchObject({ state: "locked", lockedByVisible: false });
      expect(evaluateForm(next, forms, {}, created, NOW)).toMatchObject({ state: "locked", lockedByVisible: true });
    });

    it("goes by when the prerequisite is visible, not by when it opens", () => {
      const pre = form("pre", { visibleAt: iso(NOW - DAY), opensAt: iso(NOW + DAY), dueAt: iso(NOW + 5 * DAY) });
      expect(evaluateForm(next, byId(pre, next), {}, created, NOW)).toMatchObject({
        state: "locked",
        lockedByTitle: "Title of pre",
        lockedByVisible: true,
      });
    });

    it("counts a prerequisite with no visibleAt as visible from the start", () => {
      const pre = form("pre");
      expect(evaluateForm(next, byId(pre, next), {}, created, NOW)).toMatchObject({ state: "locked", lockedByVisible: true });
    });

    it.each<[string, FormLike, SubmittedMap]>([
      ["open because the prerequisite was turned in", form("next", { prerequisiteFormId: "pre" }), { pre: { submittedAt: iso(NOW - HOUR), late: false } }],
      ["upcoming", form("next", { prerequisiteFormId: "pre", opensAt: iso(NOW + DAY) }), {}],
      ["missed", form("next", { prerequisiteFormId: "pre", dueAt: iso(NOW - DAY) }), {}],
      ["submitted", form("next", { prerequisiteFormId: "pre" }), { next: { submittedAt: iso(NOW - HOUR), late: false } }],
      ["hidden", form("next", { prerequisiteFormId: "pre" }, { status: "draft" }), {}],
    ])("is never marked visible, or named, when the form is %s rather than locked", (_label, dependent, submitted) => {
      const pre = form("pre", { dueAt: iso(NOW + DAY) });
      expect(evaluateForm(dependent, byId(pre, dependent), submitted, created, NOW)).toMatchObject({
        lockedByTitle: null,
        lockedByVisible: false,
      });
    });

    it("is not marked visible when the prerequisite does not block at all", () => {
      const only = byId(next);
      expect(evaluateForm(next, only, {}, created, NOW)).toMatchObject({
        state: "open",
        prerequisite: "unavailable",
        lockedByTitle: null,
        lockedByVisible: false,
      });
    });
  });

  it("opens once the prerequisite is turned in, and no longer names it", () => {
    const pre = form("pre", { dueAt: iso(NOW + DAY) });
    const next = form("next", { prerequisiteFormId: "pre" });
    const submitted = { pre: { submittedAt: iso(NOW - HOUR), late: false } };
    expect(evaluateForm(next, byId(pre, next), submitted, created, NOW)).toMatchObject({
      state: "open",
      canSubmit: true,
      prerequisite: "satisfied",
      lockedByTitle: null,
    });
  });

  it.each<[string, FormLike | null]>([
    ["missing from the collection", null],
    ["a draft", form("pre", {}, { status: "draft" })],
    ["archived", form("pre", {}, { status: "archived" })],
    ["over before the account existed", form("pre", { dueAt: iso(created - DAY) })],
  ])("is not blocked by a prerequisite that is %s", (_label, pre) => {
    const next = form("next", { prerequisiteFormId: "pre" });
    const forms = pre ? byId(pre, next) : byId(next);
    expect(evaluateForm(next, forms, {}, created, NOW)).toMatchObject({
      state: "open",
      canSubmit: true,
      prerequisite: "unavailable",
      lockReason: null,
      lockedByTitle: null,
    });
  });

  it("reads the form's own submission from the submitted map", () => {
    const next = form("next", { prerequisiteFormId: "pre" });
    const submitted = { next: { submittedAt: iso(NOW - HOUR), late: true } };
    expect(evaluateForm(next, byId(next), submitted, created, NOW)).toMatchObject({
      state: "submitted",
      late: true,
      lockedByTitle: null,
    });
  });

  it("only names the prerequisite while the form is actually locked", () => {
    const pre = form("pre", { dueAt: iso(NOW + DAY) });
    const upcoming = form("next", { prerequisiteFormId: "pre", opensAt: iso(NOW + DAY) });
    expect(evaluateForm(upcoming, byId(pre, upcoming), {}, created, NOW)).toMatchObject({
      state: "upcoming",
      prerequisite: "pending",
      lockedByTitle: null,
    });
  });

  it("terminates on a prerequisite cycle and locks both forms", () => {
    const a = form("a", { prerequisiteFormId: "b" });
    const b = form("b", { prerequisiteFormId: "a" });
    const forms = byId(a, b);
    expect(evaluateForm(a, forms, {}, created, NOW).state).toBe("locked");
    expect(evaluateForm(b, forms, {}, created, NOW).state).toBe("locked");
  });

  it("does not follow the chain: only the direct prerequisite matters", () => {
    const first = form("first", { dueAt: iso(NOW + DAY) });
    const second = form("second", { prerequisiteFormId: "first" });
    const third = form("third", { prerequisiteFormId: "second" });
    const submitted = { second: { submittedAt: iso(NOW - HOUR), late: false } };
    expect(evaluateForm(third, byId(first, second, third), submitted, created, NOW).state).toBe(
      "open",
    );
  });
});

describe("formStateLabel", () => {
  it.each<[FormState, boolean, string]>([
    ["hidden", false, "Not assigned"],
    ["upcoming", false, "Upcoming"],
    ["locked", false, "Locked"],
    ["open", false, "Open"],
    ["open_late", true, "Past due"],
    ["missed", false, "Missed"],
    ["submitted", false, "Submitted"],
    ["submitted", true, "Submitted late"],
  ])("labels %s (late=%s) as %s", (state, late, label) => {
    expect(formStateLabel(state, late)).toBe(label);
  });

  it("only mentions lateness for a submission", () => {
    expect(formStateLabel("open", true)).toBe("Open");
    expect(formStateLabel("missed", true)).toBe("Missed");
  });
});

describe("lateAfterMs", () => {
  it("is null when there is no deadline", () => {
    expect(lateAfterMs(settings())).toBeNull();
    expect(lateAfterMs(settings({ closesAt: iso(NOW), allowLate: true }))).toBeNull();
  });

  it("is the last millisecond of the due minute", () => {
    const due = Date.UTC(2026, 9, 14, 23, 59, 0, 0);
    expect(lateAfterMs(settings({ dueAt: iso(due) }))).toBe(Date.UTC(2026, 9, 14, 23, 59, 59, 999));
    expect(lateAfterMs(settings({ dueAt: iso(NOW) }))).toBe(NOW + END_OF_MINUTE);
  });

  it("is the same instant wherever in the minute the stored time falls", () => {
    for (const within of [0, 1, 999, 30_500, END_OF_MINUTE]) {
      expect(lateAfterMs(settings({ dueAt: iso(NOW + within) }))).toBe(NOW + END_OF_MINUTE);
    }
    expect(lateAfterMs(settings({ dueAt: iso(NOW + MINUTE) }))).toBe(NOW + MINUTE + END_OF_MINUTE);
    expect(lateAfterMs(settings({ dueAt: iso(NOW - 1) }))).toBe(NOW - 1);
  });

  it("does not depend on whether late work is accepted or when it closes", () => {
    const expected = NOW + END_OF_MINUTE;
    expect(lateAfterMs(settings({ dueAt: iso(NOW), allowLate: false }))).toBe(expected);
    expect(lateAfterMs(settings({ dueAt: iso(NOW), allowLate: true }))).toBe(expected);
    expect(lateAfterMs(settings({ dueAt: iso(NOW), allowLate: true, closesAt: iso(NOW + DAY) }))).toBe(expected);
  });

  it("is exactly the instant computeFormState uses: on time at it, late one millisecond after", () => {
    const lenient = settings({ dueAt: iso(NOW + 17_000), allowLate: true });
    const boundary = lateAfterMs(lenient);
    if (boundary === null) throw new Error("Expected a deadline.");
    expect(computeFormState(input({ settings: lenient, nowMs: boundary }))).toMatchObject({ state: "open", late: false });
    expect(computeFormState(input({ settings: lenient, nowMs: boundary + 1 }))).toMatchObject({ state: "open_late", late: true });
  });
});

describe("isReleased", () => {
  it("is true at any time for a deliverable with no visible-from time", () => {
    for (const nowMs of [0, NOW - 365 * DAY, NOW, NOW + 365 * DAY]) {
      expect(isReleased(settings(), nowMs)).toBe(true);
    }
  });

  it("turns true at the visible-from instant exactly: false one millisecond before, true at it", () => {
    const scheduled = settings({ visibleAt: iso(NOW) });
    expect(isReleased(scheduled, NOW - DAY)).toBe(false);
    expect(isReleased(scheduled, NOW - 1)).toBe(false);
    expect(isReleased(scheduled, NOW)).toBe(true);
    expect(isReleased(scheduled, NOW + 1)).toBe(true);
    expect(isReleased(scheduled, NOW + DAY)).toBe(true);
  });

  it("does not round the visible-from time to the minute, as a deadline is", () => {
    const scheduled = settings({ visibleAt: iso(NOW + 30_500) });
    expect(isReleased(scheduled, NOW + 30_499)).toBe(false);
    expect(isReleased(scheduled, NOW + 30_500)).toBe(true);
  });

  it("depends on the visible-from time alone: not on when it opens, is due or closes", () => {
    const visible = { visibleAt: iso(NOW - HOUR) };
    for (const rest of [
      { opensAt: iso(NOW + DAY) },
      { opensAt: iso(NOW - DAY) },
      { dueAt: iso(NOW - MINUTE) },
      { dueAt: iso(NOW - MINUTE), allowLate: true, closesAt: iso(NOW - 1) },
      { prerequisiteFormId: "first" },
    ]) {
      expect(isReleased(settings({ ...visible, ...rest }), NOW)).toBe(true);
      expect(isReleased(settings({ visibleAt: iso(NOW + HOUR), ...rest }), NOW)).toBe(false);
    }
  });

  it("is not brought forward by an opening time that is earlier than the visible-from time", () => {
    const backwards = settings({ visibleAt: iso(NOW + HOUR), opensAt: iso(NOW - HOUR) });
    expect(isReleased(backwards, NOW)).toBe(false);
    expect(isReleased(backwards, NOW + HOUR)).toBe(true);
  });

  it("stays true after the deliverable has closed", () => {
    expect(isReleased(settings({ visibleAt: iso(NOW - 30 * DAY), dueAt: iso(NOW - 20 * DAY) }), NOW)).toBe(true);
  });
});

describe("hasOpened", () => {
  it("is true at any time for a deliverable with no schedule", () => {
    for (const nowMs of [0, NOW - 365 * DAY, NOW, NOW + 365 * DAY]) {
      expect(hasOpened(settings(), nowMs)).toBe(true);
    }
  });

  it("turns true at the opening instant exactly: false one millisecond before, true at it", () => {
    const scheduled = settings({ opensAt: iso(NOW) });
    expect(hasOpened(scheduled, NOW - DAY)).toBe(false);
    expect(hasOpened(scheduled, NOW - 1)).toBe(false);
    expect(hasOpened(scheduled, NOW)).toBe(true);
    expect(hasOpened(scheduled, NOW + 1)).toBe(true);
  });

  it("opens when it becomes visible if no opening time is set", () => {
    const scheduled = settings({ visibleAt: iso(NOW) });
    expect(hasOpened(scheduled, NOW - 1)).toBe(false);
    expect(hasOpened(scheduled, NOW)).toBe(true);
  });

  it("is released but not open between the visible-from time and the opening time", () => {
    const scheduled = settings({ visibleAt: iso(NOW - DAY), opensAt: iso(NOW + DAY) });
    expect([isReleased(scheduled, NOW - DAY - 1), hasOpened(scheduled, NOW - DAY - 1)]).toEqual([false, false]);
    expect([isReleased(scheduled, NOW - DAY), hasOpened(scheduled, NOW - DAY)]).toEqual([true, false]);
    expect([isReleased(scheduled, NOW), hasOpened(scheduled, NOW)]).toEqual([true, false]);
    expect([isReleased(scheduled, NOW + DAY - 1), hasOpened(scheduled, NOW + DAY - 1)]).toEqual([true, false]);
    expect([isReleased(scheduled, NOW + DAY), hasOpened(scheduled, NOW + DAY)]).toEqual([true, true]);
  });

  it("never opens before it is visible, even when the opening time is the earlier of the two", () => {
    const backwards = settings({ visibleAt: iso(NOW + HOUR), opensAt: iso(NOW - HOUR) });
    expect(hasOpened(backwards, NOW)).toBe(false);
    expect(hasOpened(backwards, NOW + HOUR - 1)).toBe(false);
    expect(hasOpened(backwards, NOW + HOUR)).toBe(true);
  });

  it("stays true once the deliverable is past due or closed: its questions were shown, and still may be", () => {
    const over = settings({ opensAt: iso(NOW - 10 * DAY), dueAt: iso(NOW - 5 * DAY) });
    expect(hasOpened(over, NOW)).toBe(true);
    expect(computeFormState(input({ settings: over })).state).toBe("missed");
    const lateClosed = settings({ opensAt: iso(NOW - 10 * DAY), dueAt: iso(NOW - 5 * DAY), allowLate: true, closesAt: iso(NOW - DAY) });
    expect(hasOpened(lateClosed, NOW)).toBe(true);
  });

  it("does not depend on a prerequisite, which is a matter for each pledge", () => {
    expect(hasOpened(settings({ opensAt: iso(NOW - HOUR), prerequisiteFormId: "first" }), NOW)).toBe(true);
  });
});

describe("isReleased and hasOpened, against what a pledge is shown", () => {
  // Every pairing of "visible from" and "opens", each before, at and after now, and unset.
  const OFFSETS: Array<number | null> = [null, -DAY, -1, 0, 1, DAY];
  const at = (offset: number | null): string | null => (offset === null ? null : iso(NOW + offset));
  const schedules = OFFSETS.flatMap((visible) =>
    OFFSETS.map((opens) => ({
      label: `visible ${visible ?? "unset"}, opens ${opens ?? "unset"}`,
      scheduled: settings({ visibleAt: at(visible), opensAt: at(opens) }),
    })),
  );

  it.each(schedules)("agrees with computeFormState for $label", ({ scheduled }) => {
    // A pledge whose account is older than every schedule here, with nothing turned in and no prerequisite.
    const state = computeFormState(input({ settings: scheduled, userCreatedAtMs: NOW - 60 * DAY })).state;
    // Released is exactly "on the pledge's dashboard"; opened is exactly "no longer just announced".
    expect(isReleased(scheduled, NOW)).toBe(state !== "hidden");
    expect(hasOpened(scheduled, NOW)).toBe(state !== "hidden" && state !== "upcoming");
    expect(state === "upcoming").toBe(isReleased(scheduled, NOW) && !hasOpened(scheduled, NOW));
  });

  it("shows questions to a pledge only once hasOpened is true", () => {
    for (const { scheduled } of schedules) {
      const result = computeFormState(input({ settings: scheduled, userCreatedAtMs: NOW - 60 * DAY }));
      if (result.showQuestions) expect(hasOpened(scheduled, NOW)).toBe(true);
      if (!hasOpened(scheduled, NOW)) expect(result.showQuestions).toBe(false);
    }
  });

  it("can never be opened without being released", () => {
    for (const { scheduled } of schedules) {
      for (const nowMs of [NOW - 2 * DAY, NOW - 1, NOW, NOW + 1, NOW + 2 * DAY]) {
        if (hasOpened(scheduled, nowMs)) expect(isReleased(scheduled, nowMs)).toBe(true);
      }
    }
  });
});
