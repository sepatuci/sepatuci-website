import { describe, expect, it } from "vitest";
import { LIMITS } from "./constants";
import {
  changedQuestionTypes,
  countAnswerable,
  emptySettings,
  findPrerequisiteCycle,
  validateFormDefinition,
} from "./form-schema";
import type { FieldIssue, FormDefinition, Question } from "./types";

type Raw = Record<string, unknown>;

const rawSettings = (overrides: Raw = {}): Raw => ({
  visibleAt: null,
  opensAt: null,
  dueAt: null,
  closesAt: null,
  allowLate: false,
  prerequisiteFormId: null,
  confirmationMessage: "",
  ...overrides,
});

const shortText = (id: string, overrides: Raw = {}): Raw => ({
  id,
  type: "short_text",
  title: `Question ${id}`,
  description: "",
  required: false,
  validation: "none",
  ...overrides,
});

const choice = (id: string, overrides: Raw = {}): Raw => ({
  id,
  type: "multiple_choice",
  title: `Question ${id}`,
  description: "",
  required: false,
  allowOther: false,
  options: [
    { id: "o1", label: "Yes" },
    { id: "o2", label: "No" },
  ],
  ...overrides,
});

const scale = (id: string, overrides: Raw = {}): Raw => ({
  id,
  type: "linear_scale",
  title: `Question ${id}`,
  description: "",
  required: false,
  min: 1,
  max: 5,
  minLabel: "",
  maxLabel: "",
  ...overrides,
});

const rawForm = (overrides: Raw = {}): Raw => ({
  title: "Week 1: Reflection",
  description: "",
  status: "published",
  questions: [shortText("q1")],
  settings: rawSettings(),
  ...overrides,
});

function issuesOf(input: unknown): FieldIssue[] {
  const result = validateFormDefinition(input);
  return result.ok ? [] : result.issues;
}

function expectIssue(input: unknown, path: string, code: string): void {
  expect(validateFormDefinition(input).ok).toBe(false);
  expect(issuesOf(input)).toContainEqual(expect.objectContaining({ path, code }));
}

function expectValid(input: unknown): FormDefinition {
  const result = validateFormDefinition(input);
  if (!result.ok) throw new Error(`Expected a valid form, got ${JSON.stringify(result.issues)}`);
  return result.value;
}

const chars = (count: number): string => "x".repeat(count);

describe("validateFormDefinition", () => {
  describe("rebuilding from untrusted input", () => {
    it("returns the definition of a well-formed published form", () => {
      const value = expectValid(
        rawForm({
          questions: [
            { id: "s1", type: "section", title: "Part one", description: "Read first." },
            shortText("q1", { required: true, validation: "url" }),
            choice("q2", { allowOther: true }),
          ],
          settings: rawSettings({ prerequisiteFormId: "week0", confirmationMessage: "Thanks." }),
        }),
      );
      expect(value).toEqual({
        title: "Week 1: Reflection",
        description: "",
        status: "published",
        questions: [
          { id: "s1", type: "section", title: "Part one", description: "Read first." },
          {
            id: "q1",
            type: "short_text",
            title: "Question q1",
            description: "",
            required: true,
            validation: "url",
          },
          {
            id: "q2",
            type: "multiple_choice",
            title: "Question q2",
            description: "",
            required: false,
            allowOther: true,
            options: [
              { id: "o1", label: "Yes" },
              { id: "o2", label: "No" },
            ],
          },
        ],
        settings: {
          visibleAt: null,
          opensAt: null,
          dueAt: null,
          closesAt: null,
          allowLate: false,
          prerequisiteFormId: "week0",
          confirmationMessage: "Thanks.",
        },
      });
    });

    it("drops every field it does not know about, at every level", () => {
      const value = expectValid(
        rawForm({
          id: "attacker-chosen",
          version: 99,
          createdBy: "someone-else",
          responseCount: 0,
          questions: [
            choice("q1", {
              evil: true,
              options: [{ id: "o1", label: "Yes", evil: true, score: 10 }],
            }),
          ],
          settings: rawSettings({ evil: true, role: "admin" }),
        }),
      );
      expect(Object.keys(value).sort()).toEqual([
        "description",
        "questions",
        "settings",
        "status",
        "title",
      ]);
      expect(Object.keys(value.questions[0]).sort()).toEqual([
        "allowOther",
        "description",
        "id",
        "options",
        "required",
        "title",
        "type",
      ]);
      expect(value.questions[0]).toMatchObject({ options: [{ id: "o1", label: "Yes" }] });
      expect(Object.keys(value.settings).sort()).toEqual([
        "allowLate",
        "closesAt",
        "confirmationMessage",
        "dueAt",
        "opensAt",
        "prerequisiteFormId",
        "visibleAt",
      ]);
    });

    it("keeps only the fields that belong to each question type", () => {
      const stray = { options: [{ id: "o1", label: "A" }], allowOther: true, validation: "url", min: 0, max: 9 };
      const value = expectValid(
        rawForm({
          questions: [
            { id: "s", type: "section", title: "S", description: "", required: true, ...stray },
            { ...stray, id: "p", type: "paragraph", title: "P", description: "", required: true },
            { ...stray, id: "d", type: "date", title: "D", description: "", required: false },
            { ...stray, id: "t", type: "time", title: "T", description: "", required: false },
            { ...stray, id: "dd", type: "dropdown", title: "DD", description: "", required: false },
          ],
        }),
      );
      expect(value.questions).toEqual([
        { id: "s", type: "section", title: "S", description: "" },
        { id: "p", type: "paragraph", title: "P", description: "", required: true },
        { id: "d", type: "date", title: "D", description: "", required: false },
        { id: "t", type: "time", title: "T", description: "", required: false },
        {
          id: "dd",
          type: "dropdown",
          title: "DD",
          description: "",
          required: false,
          options: [{ id: "o1", label: "A" }],
        },
      ]);
    });

    it("cleans text: trims, flattens single-line fields and strips control characters", () => {
      const value = expectValid(
        rawForm({
          title: "  Week 1:\nReflection\u0000  ",
          description: "Line one\r\nLine two‮",
          questions: [shortText("q1", { title: "\tWhat is\tyour major?  " })],
        }),
      );
      expect(value.title).toBe("Week 1: Reflection");
      expect(value.description).toBe("Line one\nLine two");
      expect(value.questions[0].title).toBe("What is your major?");
    });

    it("falls back to safe defaults for wrongly typed optional flags", () => {
      const value = expectValid(
        rawForm({
          questions: [
            shortText("q1", { required: "yes", validation: "regex" }),
            choice("q2", { required: 1, allowOther: "true" }),
          ],
        }),
      );
      expect(value.questions[0]).toMatchObject({ required: false, validation: "none" });
      expect(value.questions[1]).toMatchObject({ required: false, allowOther: false });
    });

    it.each<[string, unknown]>([
      ["null", null],
      ["an array", []],
      ["a string", "form"],
      ["a number", 7],
      ["undefined", undefined],
    ])("refuses %s as a form", (_label, input) => {
      expect(validateFormDefinition(input)).toEqual({
        ok: false,
        issues: [{ path: "", code: "invalid", message: "The form is malformed." }],
      });
    });
  });

  describe("status", () => {
    it.each(["draft", "published", "archived"])("accepts %s", (status) => {
      expect(expectValid(rawForm({ status })).status).toBe(status);
    });

    it.each<[string, unknown]>([
      ["unknown", "live"],
      ["missing", undefined],
      ["wrong case", "Published"],
      ["not a string", 1],
    ])("refuses a status that is %s", (_label, status) => {
      expectIssue(rawForm({ status }), "status", "invalid");
    });
  });

  describe("title and description", () => {
    it.each<[string, unknown]>([
      ["missing", undefined],
      ["empty", ""],
      ["only whitespace", "   \n  "],
      ["null", null],
    ])("requires a title (%s), drafts included", (_label, title) => {
      expectIssue(rawForm({ title }), "title", "required");
      expectIssue(rawForm({ title, status: "draft" }), "title", "required");
    });

    it("refuses a title that is not text", () => {
      expectIssue(rawForm({ title: 42 }), "title", "invalid");
    });

    it("accepts a title of exactly the limit and refuses one character more", () => {
      expect(expectValid(rawForm({ title: chars(LIMITS.formTitle) })).title).toHaveLength(150);
      expectIssue(rawForm({ title: chars(LIMITS.formTitle + 1) }), "title", "too_long");
    });

    it("measures the title after trimming", () => {
      expectValid(rawForm({ title: `  ${chars(LIMITS.formTitle)}  ` }));
    });

    it("accepts a description of exactly the limit and refuses one character more", () => {
      expectValid(rawForm({ description: chars(LIMITS.formDescription) }));
      expectIssue(rawForm({ description: chars(LIMITS.formDescription + 1) }), "description", "too_long");
    });

    it("treats a missing description as empty", () => {
      expect(expectValid(rawForm({ description: undefined })).description).toBe("");
    });
  });

  describe("questions", () => {
    it.each<[string, unknown]>([
      ["missing", undefined],
      ["an object", { q1: shortText("q1") }],
      ["a string", "q1"],
    ])("refuses questions that are %s", (_label, questions) => {
      expectIssue(rawForm({ questions }), "questions", "invalid");
    });

    it("accepts exactly the maximum number of questions and refuses one more", () => {
      const many = (count: number) => Array.from({ length: count }, (_, i) => shortText(`q${i}`));
      expect(expectValid(rawForm({ questions: many(LIMITS.maxQuestions) })).questions).toHaveLength(60);
      expectIssue(rawForm({ questions: many(LIMITS.maxQuestions + 1) }), "questions", "too_many");
    });

    it("refuses to publish a form with no questions", () => {
      expectIssue(rawForm({ questions: [] }), "questions", "required");
    });

    it("refuses to publish a form made only of sections", () => {
      const sections = [{ id: "s1", type: "section", title: "Intro", description: "" }];
      expectIssue(rawForm({ questions: sections }), "questions", "required");
    });

    it.each(["draft", "archived"])("allows a %s form to have no questions", (status) => {
      expect(expectValid(rawForm({ status, questions: [] })).questions).toEqual([]);
    });

    it("refuses to publish with an untitled question, pointing at its index", () => {
      const questions = [shortText("q0"), shortText("q1"), shortText("q2", { title: "   " })];
      const issues = issuesOf(rawForm({ questions }));
      expect(issues).toEqual([
        { path: "questions[2].title", code: "required", message: "Question is required." },
      ]);
    });

    it("refuses to publish with an untitled section", () => {
      const questions = [{ id: "s1", type: "section", title: "", description: "" }, shortText("q1")];
      expect(issuesOf(rawForm({ questions }))).toEqual([
        { path: "questions[0].title", code: "required", message: "Section title is required." },
      ]);
    });

    it("lets a draft keep untitled questions", () => {
      const value = expectValid(
        rawForm({ status: "draft", questions: [shortText("q1", { title: "" })] }),
      );
      expect(value.questions[0].title).toBe("");
    });

    it("accepts a question title of exactly the limit and refuses one character more", () => {
      expectValid(rawForm({ questions: [shortText("q1", { title: chars(LIMITS.questionTitle) })] }));
      expectIssue(
        rawForm({ questions: [shortText("q1", { title: chars(LIMITS.questionTitle + 1) })] }),
        "questions[0].title",
        "too_long",
      );
    });

    it("refuses a question description over the limit", () => {
      expectValid(
        rawForm({ questions: [shortText("q1", { description: chars(LIMITS.questionDescription) })] }),
      );
      expectIssue(
        rawForm({ questions: [shortText("q1", { description: chars(LIMITS.questionDescription + 1) })] }),
        "questions[0].description",
        "too_long",
      );
    });

    it.each<[string, unknown]>([
      ["null", null],
      ["a string", "q1"],
      ["an array", []],
    ])("refuses a question that is %s", (_label, question) => {
      expectIssue(rawForm({ questions: [shortText("q0"), question] }), "questions[1]", "invalid");
    });

    it.each<[string, unknown]>([
      ["missing", undefined],
      ["empty", ""],
      ["with a space", "q 1"],
      ["with a slash", "q/1"],
      ["with a dot", "q.1"],
      ["longer than 40 characters", chars(41)],
      ["a number", 1],
    ])("refuses a question id that is %s", (_label, id) => {
      expectIssue(rawForm({ questions: [shortText("q0", { id })] }), "questions[0].id", "invalid");
    });

    it("accepts the ids the form builder generates", () => {
      expectValid(rawForm({ questions: [shortText("q_0a1b2c3d4e5f"), shortText(chars(40))] }));
    });

    it.each<[string, unknown]>([
      ["unknown", "file_upload"],
      ["missing", undefined],
      ["wrong case", "Short_Text"],
    ])("refuses a question type that is %s", (_label, type) => {
      expectIssue(rawForm({ questions: [shortText("q0", { type })] }), "questions[0].type", "invalid");
    });

    it("refuses two questions with the same id, pointing at the second", () => {
      const questions = [shortText("q1"), choice("q2"), shortText("q1", { title: "Again" })];
      expect(issuesOf(rawForm({ questions }))).toEqual([
        { path: "questions[2].id", code: "duplicate", message: "Two questions share the same id." },
      ]);
    });

    it("treats ids that differ only by case as different", () => {
      expectValid(rawForm({ questions: [shortText("q1"), shortText("Q1")] }));
    });
  });

  describe("options", () => {
    const withOptions = (options: unknown, type = "multiple_choice") =>
      rawForm({ questions: [choice("q1", { type, options })] });

    it.each(["multiple_choice", "checkboxes", "dropdown"])("requires at least one option on %s", (type) => {
      expectIssue(withOptions([], type), "questions[0].options", "required");
      expectIssue(withOptions(undefined, type), "questions[0].options", "required");
      expectIssue(withOptions("Yes,No", type), "questions[0].options", "required");
    });

    it("accepts exactly the maximum number of options and refuses one more", () => {
      const many = (count: number) =>
        Array.from({ length: count }, (_, i) => ({ id: `o${i}`, label: `Option ${i}` }));
      expectValid(withOptions(many(LIMITS.maxOptions)));
      expectIssue(withOptions(many(LIMITS.maxOptions + 1)), "questions[0].options", "too_many");
    });

    it.each<[string, unknown]>([
      ["not an object", "Yes"],
      ["missing its id", { label: "Yes" }],
      ["carrying an unsafe id", { id: "o 1", label: "Yes" }],
      ["carrying a numeric id", { id: 1, label: "Yes" }],
    ])("refuses an option that is %s", (_label, option) => {
      expectIssue(withOptions([{ id: "o1", label: "A" }, option]), "questions[0].options[1]", "invalid");
    });

    it("refuses two options with the same id", () => {
      expectIssue(
        withOptions([
          { id: "o1", label: "Yes" },
          { id: "o1", label: "No" },
        ]),
        "questions[0].options[1]",
        "duplicate",
      );
    });

    it("refuses a blank option label, drafts included", () => {
      const options = [{ id: "o1", label: "  " }];
      expectIssue(withOptions(options), "questions[0].options[0].label", "required");
      expectIssue(
        rawForm({ status: "draft", questions: [choice("q1", { options })] }),
        "questions[0].options[0].label",
        "required",
      );
    });

    it("refuses two options with the same label, ignoring case and surrounding space", () => {
      expectIssue(
        withOptions([
          { id: "o1", label: "Students" },
          { id: "o2", label: "  students " },
        ]),
        "questions[0].options[1].label",
        "duplicate",
      );
    });

    it("accepts an option label of exactly the limit and refuses one character more", () => {
      expectValid(withOptions([{ id: "o1", label: chars(LIMITS.optionLabel) }]));
      expectIssue(
        withOptions([{ id: "o1", label: chars(LIMITS.optionLabel + 1) }]),
        "questions[0].options[0].label",
        "too_long",
      );
    });

    it("keeps options in the order they were sent", () => {
      const value = expectValid(
        withOptions([
          { id: "o3", label: "C" },
          { id: "o1", label: "A" },
          { id: "o2", label: "B" },
        ]),
      );
      expect(value.questions[0]).toMatchObject({
        options: [
          { id: "o3", label: "C" },
          { id: "o1", label: "A" },
          { id: "o2", label: "B" },
        ],
      });
    });
  });

  describe("linear scale", () => {
    const withScale = (overrides: Raw) => rawForm({ questions: [scale("q1", overrides)] });

    it.each([0, 1])("accepts a scale starting at %i", (min) => {
      expect(expectValid(withScale({ min })).questions[0]).toMatchObject({ min });
    });

    it.each<[string, unknown]>([
      ["2", 2],
      ["-1", -1],
      ["a string", "1"],
      ["missing", undefined],
      ["a fraction", 0.5],
    ])("refuses a scale starting at %s", (_label, min) => {
      expectIssue(withScale({ min }), "questions[0].min", "invalid");
    });

    it.each([LIMITS.scaleMaxLow, 5, LIMITS.scaleMaxHigh])("accepts a scale ending at %i", (max) => {
      expect(expectValid(withScale({ max })).questions[0]).toMatchObject({ max });
    });

    it.each<[string, unknown]>([
      ["1", 1],
      ["11", 11],
      ["a fraction", 4.5],
      ["a string", "5"],
      ["missing", undefined],
      ["null", null],
    ])("refuses a scale ending at %s", (_label, max) => {
      expectIssue(withScale({ max }), "questions[0].max", "invalid");
    });

    it("accepts scale labels of exactly the limit and refuses one character more", () => {
      expectValid(withScale({ minLabel: chars(LIMITS.scaleLabel), maxLabel: chars(LIMITS.scaleLabel) }));
      expectIssue(withScale({ minLabel: chars(LIMITS.scaleLabel + 1) }), "questions[0].minLabel", "too_long");
      expectIssue(withScale({ maxLabel: chars(LIMITS.scaleLabel + 1) }), "questions[0].maxLabel", "too_long");
    });
  });

  describe("settings", () => {
    const withSettings = (overrides: Raw, form: Raw = {}) =>
      rawForm({ ...form, settings: rawSettings(overrides) });

    it.each<[string, unknown]>([
      ["missing", undefined],
      ["null", null],
      ["an array", []],
      ["a string", "none"],
    ])("refuses settings that are %s", (_label, settings) => {
      expectIssue(rawForm({ settings }), "settings", "invalid");
    });

    it("normalizes every date to a millisecond-precision UTC timestamp", () => {
      const value = expectValid(
        withSettings({
          visibleAt: "2026-10-01T00:00:00Z",
          opensAt: "2026-10-02T08:30:00.5Z",
          dueAt: "2026-10-09T06:59:59.999Z",
          closesAt: "2026-10-12T00:00:00Z",
          allowLate: true,
        }),
      );
      expect(value.settings).toMatchObject({
        visibleAt: "2026-10-01T00:00:00.000Z",
        opensAt: "2026-10-02T08:30:00.500Z",
        dueAt: "2026-10-09T06:59:59.999Z",
        closesAt: "2026-10-12T00:00:00.000Z",
      });
    });

    it.each<[string, unknown]>([
      ["null", null],
      ["undefined", undefined],
      ["an empty string", ""],
    ])("reads a date that is %s as not set", (_label, blank) => {
      const value = expectValid(
        withSettings({ visibleAt: blank, opensAt: blank, dueAt: blank, closesAt: blank, allowLate: true }),
      );
      expect(value.settings).toMatchObject({ visibleAt: null, opensAt: null, dueAt: null, closesAt: null });
    });

    it.each<[string, unknown]>([
      ["a date with no time", "2026-10-09"],
      ["a local time with no zone", "2026-10-09T10:00:00"],
      ["a time with an offset", "2026-10-09T10:00:00+00:00"],
      ["an impossible date", "2026-02-30T10:00:00Z"],
      ["free text", "next Friday"],
      ["epoch milliseconds", 1_790_000_000_000],
      ["a boolean", true],
    ])("refuses %s as a date", (_label, value) => {
      for (const key of ["visibleAt", "opensAt", "dueAt"]) {
        expectIssue(withSettings({ [key]: value }), `settings.${key}`, "invalid");
      }
      expectIssue(withSettings({ closesAt: value, allowLate: true }), "settings.closesAt", "invalid");
    });

    describe("ordering", () => {
      const early = "2026-10-01T00:00:00.000Z";
      const late = "2026-10-08T00:00:00.000Z";

      it("refuses opening before it is visible", () => {
        expect(issuesOf(withSettings({ visibleAt: late, opensAt: early }))).toEqual([
          {
            path: "settings.opensAt",
            code: "out_of_order",
            message: "Opens must not be earlier than visible from.",
          },
        ]);
      });

      it("refuses a deadline before it opens", () => {
        expectIssue(withSettings({ opensAt: late, dueAt: early }), "settings.dueAt", "out_of_order");
      });

      it("refuses a deadline before it is visible when opensAt is not set", () => {
        expectIssue(withSettings({ visibleAt: late, dueAt: early }), "settings.dueAt", "out_of_order");
      });

      it("refuses a late cut-off before the deadline", () => {
        expectIssue(
          withSettings({ dueAt: late, closesAt: early, allowLate: true }),
          "settings.closesAt",
          "out_of_order",
        );
      });

      it("refuses a late cut-off before it opens when there is no deadline between them", () => {
        expectIssue(
          withSettings({ opensAt: late, closesAt: early, allowLate: true }),
          "settings.closesAt",
          "out_of_order",
        );
      });

      it("accepts identical instants for every date", () => {
        const value = expectValid(
          withSettings({ visibleAt: early, opensAt: early, dueAt: early, closesAt: early, allowLate: true }),
        );
        expect(value.settings).toMatchObject({ visibleAt: early, opensAt: early, dueAt: early, closesAt: early });
      });

      it("accepts a schedule one millisecond apart at each step", () => {
        expectValid(
          withSettings({
            visibleAt: "2026-10-01T00:00:00.000Z",
            opensAt: "2026-10-01T00:00:00.001Z",
            dueAt: "2026-10-01T00:00:00.002Z",
            closesAt: "2026-10-01T00:00:00.003Z",
            allowLate: true,
          }),
        );
      });
    });

    describe("late cut-off", () => {
      const due = "2026-10-08T00:00:00.000Z";
      const closes = "2026-10-10T00:00:00.000Z";

      it("keeps closesAt when late responses are accepted", () => {
        const value = expectValid(withSettings({ dueAt: due, closesAt: closes, allowLate: true }));
        expect(value.settings).toMatchObject({ allowLate: true, closesAt: closes });
      });

      it("clears closesAt when late responses are not accepted", () => {
        const value = expectValid(withSettings({ dueAt: due, closesAt: closes, allowLate: false }));
        expect(value.settings).toMatchObject({ allowLate: false, closesAt: null });
      });

      it("clears closesAt, rather than reporting its order, when allowLate is off", () => {
        const value = expectValid(
          withSettings({ dueAt: closes, closesAt: due, allowLate: false }),
        );
        expect(value.settings.closesAt).toBeNull();
      });

      it("treats a non-boolean allowLate as off, which also clears closesAt", () => {
        const value = expectValid(withSettings({ dueAt: due, closesAt: closes, allowLate: "true" }));
        expect(value.settings).toMatchObject({ allowLate: false, closesAt: null });
      });

      // Nothing is late without a deadline, so a cut-off on its own would never be enforced.
      it("refuses a late cut-off when there is no deadline to be late against", () => {
        expectIssue(withSettings({ closesAt: closes, allowLate: true }), "settings.closesAt", "needs_due");
      });

      it("accepts late responses with no deadline as long as no cut-off is set", () => {
        const value = expectValid(withSettings({ allowLate: true }));
        expect(value.settings).toMatchObject({ allowLate: true, dueAt: null, closesAt: null });
      });
    });

    describe("prerequisite", () => {
      it("keeps a well-formed form id", () => {
        expect(
          expectValid(withSettings({ prerequisiteFormId: "week2interviews" })).settings.prerequisiteFormId,
        ).toBe("week2interviews");
      });

      it.each<[string, unknown]>([
        ["null", null],
        ["undefined", undefined],
        ["an empty string", ""],
      ])("reads a prerequisite that is %s as none", (_label, prerequisiteFormId) => {
        expect(expectValid(withSettings({ prerequisiteFormId })).settings.prerequisiteFormId).toBeNull();
      });

      it.each<[string, unknown]>([
        ["a path", "../users/abc"],
        ["an id with an underscore", "week2_abc"],
        ["an id with a slash", "forms/week2"],
        ["longer than 64 characters", chars(65)],
        ["a number", 2],
        ["an object", { id: "week2" }],
      ])("refuses a prerequisite that is %s", (_label, prerequisiteFormId) => {
        expectIssue(withSettings({ prerequisiteFormId }), "settings.prerequisiteFormId", "invalid");
      });
    });

    it("accepts a confirmation message of exactly the limit, keeping its line breaks", () => {
      const message = `Thanks.\n${chars(LIMITS.confirmationMessage - 8)}`;
      expect(expectValid(withSettings({ confirmationMessage: message })).settings.confirmationMessage).toBe(
        message,
      );
      expectIssue(
        withSettings({ confirmationMessage: chars(LIMITS.confirmationMessage + 1) }),
        "settings.confirmationMessage",
        "too_long",
      );
    });
  });

  it("reports every problem in one pass", () => {
    const issues = issuesOf(
      rawForm({
        title: "",
        questions: [shortText("q1", { title: "" }), choice("q2", { options: [] })],
        settings: rawSettings({ dueAt: "tomorrow", prerequisiteFormId: "../x" }),
      }),
    );
    expect(issues.map((issue) => `${issue.path}:${issue.code}`).sort()).toEqual([
      "questions[0].title:required",
      "questions[1].options:required",
      "settings.dueAt:invalid",
      "settings.prerequisiteFormId:invalid",
      "title:required",
    ]);
  });

  it("gives every issue a human-readable message", () => {
    const issues = issuesOf(rawForm({ title: "", questions: [], settings: null }));
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) expect(issue.message.length).toBeGreaterThan(0);
  });
});

describe("findPrerequisiteCycle", () => {
  const chain = (entries: Array<[string, string | null]>) => new Map<string, string | null>(entries);

  it("returns null when the form has no prerequisite", () => {
    expect(findPrerequisiteCycle("a", null, chain([["b", "a"]]))).toBeNull();
  });

  it("detects a form that is its own prerequisite", () => {
    expect(findPrerequisiteCycle("a", "a", chain([]))).toEqual(["a", "a"]);
  });

  it("detects a 2-node cycle", () => {
    expect(findPrerequisiteCycle("a", "b", chain([["b", "a"]]))).toEqual(["a", "b", "a"]);
  });

  it("detects a 3-node cycle", () => {
    const others = chain([
      ["b", "c"],
      ["c", "a"],
    ]);
    expect(findPrerequisiteCycle("a", "b", others)).toEqual(["a", "b", "c", "a"]);
  });

  it("returns null for a chain that ends", () => {
    const others = chain([
      ["b", "c"],
      ["c", null],
    ]);
    expect(findPrerequisiteCycle("a", "b", others)).toBeNull();
  });

  it("returns null when the prerequisite is not a known form", () => {
    expect(findPrerequisiteCycle("a", "ghost", chain([["b", "a"]]))).toBeNull();
  });

  it("is not fooled by unrelated forms that point back at this one", () => {
    const others = chain([
      ["b", null],
      ["c", "a"],
      ["d", "a"],
    ]);
    expect(findPrerequisiteCycle("a", "b", others)).toBeNull();
  });

  it("terminates, without blaming this form, on a loop that does not include it", () => {
    const others = chain([
      ["b", "c"],
      ["c", "b"],
    ]);
    expect(findPrerequisiteCycle("a", "b", others)).toBeNull();
  });

  it("finds a cycle that runs through every other form", () => {
    const size = 50;
    const others = chain(
      Array.from({ length: size }, (_, i): [string, string | null] => [
        `f${i}`,
        i === size - 1 ? "a" : `f${i + 1}`,
      ]),
    );
    const cycle = findPrerequisiteCycle("a", "f0", others);
    expect(cycle).toHaveLength(size + 2);
    expect(cycle?.[0]).toBe("a");
    expect(cycle?.[size + 1]).toBe("a");
  });

  it("returns null for a long chain with no cycle", () => {
    const size = 50;
    const others = chain(
      Array.from({ length: size }, (_, i): [string, string | null] => [
        `f${i}`,
        i === size - 1 ? null : `f${i + 1}`,
      ]),
    );
    expect(findPrerequisiteCycle("a", "f0", others)).toBeNull();
  });
});

describe("changedQuestionTypes", () => {
  const question = (id: string, type: Question["type"]): Question => {
    const base = { id, title: id, description: "" };
    if (type === "section") return { ...base, type };
    if (type === "short_text") return { ...base, type, required: false, validation: "none" };
    if (type === "paragraph" || type === "date" || type === "time") return { ...base, type, required: false };
    if (type === "linear_scale") {
      return { ...base, type, required: false, min: 1, max: 5, minLabel: "", maxLabel: "" };
    }
    if (type === "dropdown") return { ...base, type, required: false, options: [] };
    return { ...base, type, required: false, options: [], allowOther: false };
  };

  it("is empty when nothing changed type", () => {
    const questions = [question("a", "short_text"), question("b", "date")];
    expect(changedQuestionTypes(questions, questions)).toEqual([]);
  });

  it("lists the ids whose type differs", () => {
    const before = [question("a", "short_text"), question("b", "date"), question("c", "dropdown")];
    const after = [question("a", "paragraph"), question("b", "date"), question("c", "multiple_choice")];
    expect(changedQuestionTypes(before, after)).toEqual(["a", "c"]);
  });

  it("ignores questions that were added or removed", () => {
    const before = [question("a", "short_text"), question("gone", "date")];
    const after = [question("a", "short_text"), question("new", "time")];
    expect(changedQuestionTypes(before, after)).toEqual([]);
  });

  it("ignores reordering and edits that keep the type", () => {
    const before = [question("a", "short_text"), question("b", "date")];
    const after = [{ ...question("b", "date"), title: "Renamed" }, question("a", "short_text")];
    expect(changedQuestionTypes(before, after)).toEqual([]);
  });

  it("counts turning a question into a section, and a section into a question", () => {
    const before = [question("a", "short_text"), question("s", "section")];
    const after = [question("a", "section"), question("s", "paragraph")];
    expect(changedQuestionTypes(before, after)).toEqual(["a", "s"]);
  });
});

describe("countAnswerable", () => {
  it("counts every block except sections", () => {
    const value = expectValid(
      rawForm({
        questions: [
          { id: "s1", type: "section", title: "Intro", description: "" },
          shortText("q1"),
          { id: "s2", type: "section", title: "More", description: "" },
          choice("q2"),
          scale("q3"),
        ],
      }),
    );
    expect(countAnswerable(value.questions)).toBe(3);
    expect(countAnswerable([])).toBe(0);
  });
});

describe("emptySettings", () => {
  it("has no schedule, no late window, no prerequisite and no message", () => {
    expect(emptySettings()).toEqual({
      visibleAt: null,
      opensAt: null,
      dueAt: null,
      closesAt: null,
      allowLate: false,
      prerequisiteFormId: null,
      confirmationMessage: "",
    });
  });

  it("returns a fresh object each time", () => {
    const first = emptySettings();
    first.allowLate = true;
    expect(emptySettings().allowLate).toBe(false);
  });

  it("is accepted by the validator unchanged", () => {
    expect(expectValid(rawForm({ settings: emptySettings() })).settings).toEqual(emptySettings());
  });
});
