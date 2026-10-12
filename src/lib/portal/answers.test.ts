import { describe, expect, it } from "vitest";
import {
  answerToText,
  countAnswered,
  optionLabel,
  sanitizeDraftAnswers,
  validateAnswers,
} from "./answers";
import { LIMITS } from "./constants";
import { validateFormDefinition } from "./form-schema";
import type {
  Answers,
  CheckboxesQuestion,
  DateQuestion,
  DropdownQuestion,
  FieldIssue,
  LinearScaleQuestion,
  MultipleChoiceQuestion,
  ParagraphQuestion,
  Question,
  SectionBlock,
  ShortTextQuestion,
  TimeQuestion,
} from "./types";

const base = (id: string) => ({ id, title: `Title ${id}`, description: "", required: false });

const short = (id: string, extra: Partial<ShortTextQuestion> = {}): ShortTextQuestion => ({
  ...base(id),
  type: "short_text",
  validation: "none",
  ...extra,
});
const paragraph = (id: string, extra: Partial<ParagraphQuestion> = {}): ParagraphQuestion => ({
  ...base(id),
  type: "paragraph",
  ...extra,
});
const date = (id: string, extra: Partial<DateQuestion> = {}): DateQuestion => ({
  ...base(id),
  type: "date",
  ...extra,
});
const time = (id: string, extra: Partial<TimeQuestion> = {}): TimeQuestion => ({
  ...base(id),
  type: "time",
  ...extra,
});
const OPTIONS = [
  { id: "o_a", label: "Alpha" },
  { id: "o_b", label: "Beta" },
  { id: "o_c", label: "Gamma" },
];
const multiple = (id: string, extra: Partial<MultipleChoiceQuestion> = {}): MultipleChoiceQuestion => ({
  ...base(id),
  type: "multiple_choice",
  options: OPTIONS,
  allowOther: false,
  ...extra,
});
const checkboxes = (id: string, extra: Partial<CheckboxesQuestion> = {}): CheckboxesQuestion => ({
  ...base(id),
  type: "checkboxes",
  options: OPTIONS,
  allowOther: false,
  ...extra,
});
const dropdown = (id: string, extra: Partial<DropdownQuestion> = {}): DropdownQuestion => ({
  ...base(id),
  type: "dropdown",
  options: OPTIONS,
  ...extra,
});
const scale = (id: string, extra: Partial<LinearScaleQuestion> = {}): LinearScaleQuestion => ({
  ...base(id),
  type: "linear_scale",
  min: 1,
  max: 5,
  minLabel: "",
  maxLabel: "",
  ...extra,
});
const section = (id: string): SectionBlock => ({ id, type: "section", title: "Section", description: "" });

const text = (value: unknown) => ({ kind: "text", value });
const chars = (count: number): string => "x".repeat(count);

function issuesOf(questions: Question[], input: unknown): FieldIssue[] {
  const result = validateAnswers(questions, input);
  return result.ok ? [] : result.issues;
}

function valueOf(questions: Question[], input: unknown): Answers {
  const result = validateAnswers(questions, input);
  if (!result.ok) throw new Error(`Expected valid answers, got ${JSON.stringify(result.issues)}`);
  return result.value;
}

/** Asserts that answering `question` with `raw` is refused with exactly this code. */
function expectRefused(question: Question, raw: unknown, code: string): void {
  expect(issuesOf([question], { [question.id]: raw })).toEqual([
    expect.objectContaining({ path: `answers.${question.id}`, code }),
  ]);
}

describe("validateAnswers", () => {
  describe("the response as a whole", () => {
    it.each<[string, unknown]>([
      ["null", null],
      ["undefined", undefined],
      ["an array", []],
      ["a string", "answers"],
      ["a number", 3],
    ])("refuses a response that is %s", (_label, input) => {
      expect(validateAnswers([short("q1")], input)).toEqual({
        ok: false,
        issues: [{ path: "answers", code: "invalid", message: "The response is malformed." }],
      });
    });

    it("accepts an empty response when nothing is required", () => {
      expect(validateAnswers([short("q1"), scale("q2"), checkboxes("q3")], {})).toEqual({
        ok: true,
        value: {},
      });
    });

    it("drops answers to questions that are not on the form", () => {
      const value = valueOf([short("q1")], {
        q1: text("kept"),
        q_removed: text("from an older version of the form"),
        constructor: text("not a question"),
      });
      expect(value).toEqual({ q1: { kind: "text", value: "kept" } });
    });

    it("never treats a section as something to answer", () => {
      const value = valueOf([section("s1"), short("q1")], { s1: text("sneaky"), q1: text("ok") });
      expect(Object.keys(value)).toEqual(["q1"]);
    });

    it("reports every problem at once, in form order", () => {
      const questions = [
        short("q1", { required: true }),
        short("q2", { validation: "url" }),
        scale("q3", { required: true }),
        multiple("q4"),
      ];
      const issues = issuesOf(questions, {
        q2: text("javascript:alert(1)"),
        q3: { kind: "scale", value: 9 },
        q4: { kind: "choice", optionId: "o_zzz", other: null },
      });
      expect(issues.map((issue) => `${issue.path}:${issue.code}`)).toEqual([
        "answers.q1:required",
        "answers.q2:invalid_url",
        "answers.q3:invalid_scale",
        "answers.q4:invalid_option",
      ]);
    });

    it("returns nothing but the issues when any answer is refused", () => {
      const result = validateAnswers([short("q1"), short("q2", { required: true })], { q1: text("fine") });
      expect(result).toEqual({
        ok: false,
        issues: [{ path: "answers.q2", code: "required", message: "This is a required question." }],
      });
    });

    it("rebuilds each answer, dropping any extra fields on it", () => {
      const value = valueOf([short("q1"), multiple("q2"), checkboxes("q3"), scale("q4")], {
        q1: { kind: "text", value: "hi", html: "<b>hi</b>" },
        q2: { kind: "choice", optionId: "o_a", other: null, score: 100 },
        q3: { kind: "choices", optionIds: ["o_a"], other: null, score: 100 },
        q4: { kind: "scale", value: 3, weight: 2 },
      });
      expect(value).toEqual({
        q1: { kind: "text", value: "hi" },
        q2: { kind: "choice", optionId: "o_a", other: null },
        q3: { kind: "choices", optionIds: ["o_a"], other: null },
        q4: { kind: "scale", value: 3 },
      });
    });
  });

  describe("required questions", () => {
    const requiredOfEachType: Question[] = [
      short("q", { required: true }),
      paragraph("q", { required: true }),
      date("q", { required: true }),
      time("q", { required: true }),
      multiple("q", { required: true, allowOther: true }),
      checkboxes("q", { required: true, allowOther: true }),
      dropdown("q", { required: true }),
      scale("q", { required: true }),
    ];

    it.each(requiredOfEachType.map((question) => [question.type, question] as const))(
      "refuses a missing answer to a required %s question",
      (_type, question) => {
        expectRefused(question, undefined, "required");
        expectRefused(question, null, "required");
      },
    );

    it.each<[string, Question, unknown]>([
      ["short text of only spaces", short("q", { required: true }), text("   ")],
      ["paragraph of only line breaks", paragraph("q", { required: true }), text("\n\r\n \t")],
      ["short text of only invisible control characters", short("q", { required: true }), text("\u0000‮")],
      ["choice with nothing picked", multiple("q", { required: true }), { kind: "choice", optionId: null, other: null }],
      ["choice whose Other is blank", multiple("q", { required: true, allowOther: true }), { kind: "choice", optionId: null, other: "  " }],
      ["dropdown with nothing picked", dropdown("q", { required: true }), { kind: "choice", optionId: null, other: null }],
      ["checkboxes with none ticked", checkboxes("q", { required: true }), { kind: "choices", optionIds: [], other: null }],
      ["checkboxes whose Other is blank", checkboxes("q", { required: true, allowOther: true }), { kind: "choices", optionIds: [], other: " " }],
    ])("counts a %s as not answered", (_label, question, raw) => {
      expectRefused(question, raw, "required");
    });

    it("simply omits the same blank answers when the question is optional", () => {
      const questions = [short("q1"), multiple("q2"), checkboxes("q3"), paragraph("q4")];
      const value = valueOf(questions, {
        q1: text("   "),
        q2: { kind: "choice", optionId: null, other: null },
        q3: { kind: "choices", optionIds: [], other: null },
        q4: null,
      });
      expect(value).toEqual({});
    });
  });

  describe("text answers", () => {
    it("trims a short answer and flattens line breaks and tabs to spaces", () => {
      const value = valueOf([short("q1")], { q1: text("  Computer\tScience\r\nand Maths  ") });
      expect(value.q1).toEqual({ kind: "text", value: "Computer Science and Maths" });
    });

    it("keeps line breaks in a paragraph, normalizing CRLF", () => {
      const value = valueOf([paragraph("q1")], { q1: text("First line\r\nSecond line\rThird") });
      expect(value.q1).toEqual({ kind: "text", value: "First line\nSecond line\nThird" });
    });

    it("strips control characters and bidirectional overrides", () => {
      const value = valueOf([short("q1")], { q1: text("safe\u0000\u0007‮text⁦") });
      expect(value.q1).toEqual({ kind: "text", value: "safetext" });
    });

    it("accepts a short answer of exactly the limit and refuses one character more", () => {
      const value = valueOf([short("q1")], { q1: text(chars(LIMITS.shortText)) });
      expect(value.q1).toEqual({ kind: "text", value: chars(500) });
      expectRefused(short("q1"), text(chars(LIMITS.shortText + 1)), "too_long");
    });

    it("accepts a paragraph of exactly the limit and refuses one character more", () => {
      valueOf([paragraph("q1")], { q1: text(chars(LIMITS.paragraph)) });
      expectRefused(paragraph("q1"), text(chars(LIMITS.paragraph + 1)), "too_long");
    });

    it("holds a short answer to the short limit, not the paragraph limit", () => {
      expectRefused(short("q1"), text(chars(LIMITS.shortText + 1)), "too_long");
      valueOf([paragraph("q1")], { q1: text(chars(LIMITS.shortText + 1)) });
    });

    it("refuses oversized text on date and time questions as too long", () => {
      expectRefused(date("q1"), text(chars(LIMITS.shortText + 1)), "too_long");
      expectRefused(time("q1"), text(chars(LIMITS.shortText + 1)), "too_long");
    });

    it.each<[string, unknown]>([
      ["a bare string", "hello"],
      ["a number", 42],
      ["an array", ["hello"]],
      ["the wrong kind", { kind: "scale", value: 3 }],
      ["a choice", { kind: "choice", optionId: "o_a", other: null }],
      ["no kind", { value: "hello" }],
      ["a non-string value", { kind: "text", value: 42 }],
      ["a nested object as value", { kind: "text", value: { toString: "x" } }],
      ["no value", { kind: "text" }],
    ])("refuses %s as a text answer", (_label, raw) => {
      for (const question of [short("q1"), paragraph("q1"), date("q1"), time("q1")]) {
        expectRefused(question, raw, "invalid");
      }
    });

    describe("number validation", () => {
      const question = short("q1", { validation: "number" });

      it.each(["0", "42", "-3", "3.5", "-0.25", "007"])("accepts %s", (value) => {
        expect(valueOf([question], { q1: text(value) }).q1).toEqual({ kind: "text", value });
      });

      it.each(["three", "4 interviews", "1e5", "1,000", ".5", "5.", "+5", "0x10", "Infinity", "NaN", "1.2.3", "--1"])(
        "refuses %s",
        (value) => {
          expectRefused(question, text(value), "invalid_number");
        },
      );

      it("accepts a number with surrounding space, which is trimmed first", () => {
        expect(valueOf([question], { q1: text("  4  ") }).q1).toEqual({ kind: "text", value: "4" });
      });
    });

    describe("email validation", () => {
      const question = short("q1", { validation: "email" });

      it.each(["avery.chen@uci.edu", "a+b@example.co.uk"])("accepts %s", (value) => {
        expect(valueOf([question], { q1: text(value) }).q1).toEqual({ kind: "text", value });
      });

      it.each(["avery", "avery@", "@uci.edu", "avery@uci", "a b@uci.edu", "a@b@uci.edu"])(
        "refuses %s",
        (value) => {
          expectRefused(question, text(value), "invalid_email");
        },
      );
    });

    describe("link validation", () => {
      const question = short("q1", { validation: "url" });

      it.each([
        "https://docs.google.com/document/d/abc123/edit?usp=sharing#heading=h.1",
        "https://example.org",
        "HTTPS://EXAMPLE.ORG/Path",
        "https://localhost:3000/x",
        "https://medium.com/@someone/a-post",
      ])("accepts %s", (value) => {
        expect(valueOf([question], { q1: text(value) }).q1).toEqual({ kind: "text", value });
      });

      it.each([
        "http://example.org",
        "HTTP://docs.google.com/document/d/abc",
        "http://localhost:3000/x",
      ])("refuses %s, which is not https", (value) => {
        expectRefused(question, text(value), "invalid_url");
      });

      it.each([
        "https://docs.google.com@elsewhere.example/document/d/abc",
        "https://user:password@example.org",
        "https://user@example.org",
      ])("refuses %s, which carries a name or password before the host", (value) => {
        expectRefused(question, text(value), "invalid_url");
      });

      it("tells the pledge that a link has to start with https://", () => {
        const [issue] = issuesOf([question], { q1: text("http://example.org") });
        expect(issue.message).toBe("Enter a full link that starts with https://");
      });

      // A draft is work in progress: what has been typed is kept, and the link is
      // only judged when the deliverable is turned in. It is never rendered as a
      // link from a draft, only shown back in the text box.
      it("keeps such a link in an autosaved draft as typed, while still refusing it on submit", () => {
        const deceptive = "https://docs.google.com@elsewhere.example";
        const draft = sanitizeDraftAnswers([question, short("q2")], {
          q1: text(deceptive),
          q2: text("kept"),
        });
        expect(draft).toEqual({
          q1: { kind: "text", value: deceptive },
          q2: { kind: "text", value: "kept" },
        });
        expect(sanitizeDraftAnswers([question], { q1: text("http://example.org") })).toEqual({
          q1: { kind: "text", value: "http://example.org" },
        });
        expectRefused(question, text(deceptive), "invalid_url");
      });

      it.each([
        "javascript:alert(1)",
        "JavaScript:alert(document.cookie)",
        "  javascript:alert(1)",
        "java\tscript:alert(1)",
        "javascript://example.org/%0Aalert(1)",
        "data:text/html,<script>alert(1)</script>",
        "vbscript:msgbox(1)",
        "file:///etc/passwd",
        "ftp://example.org/file",
        "mailto:someone@example.org",
        "//evil.example/path",
        "/portal/admin",
        "www.example.org",
        "docs.google.com/document/d/abc",
        "https://",
        "https:example.org",
        "http//example.org",
        "notes",
      ])("refuses %s", (value) => {
        expectRefused(question, text(value), "invalid_url");
      });

      it("does not apply link rules to a plain short answer", () => {
        const value = valueOf([short("q1")], { q1: text("javascript:alert(1)") });
        expect(value.q1).toEqual({ kind: "text", value: "javascript:alert(1)" });
      });
    });

    describe("dates", () => {
      it.each(["2026-10-05", "2024-02-29", "1999-12-31"])("accepts %s", (value) => {
        expect(valueOf([date("q1")], { q1: text(value) }).q1).toEqual({ kind: "text", value });
      });

      it.each([
        "2026-02-30",
        "2026-02-29",
        "2026-13-01",
        "2026-00-10",
        "2026-10-00",
        "2026-10-32",
        "10/05/2026",
        "2026-1-5",
        "2026-10-05T10:00",
        "tomorrow",
      ])("refuses %s", (value) => {
        expectRefused(date("q1"), text(value), "invalid_date");
      });
    });

    describe("times", () => {
      it.each(["00:00", "09:30", "23:59"])("accepts %s", (value) => {
        expect(valueOf([time("q1")], { q1: text(value) }).q1).toEqual({ kind: "text", value });
      });

      it.each(["24:00", "9:30", "12:60", "12:5", "12:30:00", "noon", "1230", "12.30"])("refuses %s", (value) => {
        expectRefused(time("q1"), text(value), "invalid_time");
      });
    });
  });

  describe("multiple choice", () => {
    it("accepts an option that is on the form", () => {
      const value = valueOf([multiple("q1")], { q1: { kind: "choice", optionId: "o_b", other: null } });
      expect(value.q1).toEqual({ kind: "choice", optionId: "o_b", other: null });
    });

    it("accepts an answer that leaves `other` out entirely", () => {
      const value = valueOf([multiple("q1")], { q1: { kind: "choice", optionId: "o_b" } });
      expect(value.q1).toEqual({ kind: "choice", optionId: "o_b", other: null });
    });

    it.each<[string, unknown]>([
      ["an id from another question", "o_zzz"],
      ["a label instead of an id", "Alpha"],
      ["an id in the wrong case", "O_A"],
      ["an empty string", ""],
      ["a number", 0],
      ["an array", ["o_a"]],
      ["an object", { id: "o_a" }],
    ])("refuses an optionId that is %s", (_label, optionId) => {
      expectRefused(multiple("q1"), { kind: "choice", optionId, other: null }, "invalid_option");
    });

    it("accepts a trimmed Other answer when the question allows it", () => {
      const question = multiple("q1", { allowOther: true });
      const value = valueOf([question], { q1: { kind: "choice", optionId: null, other: "  Nonprofits \n" } });
      expect(value.q1).toEqual({ kind: "choice", optionId: null, other: "Nonprofits" });
    });

    it("refuses an Other answer when the question does not allow it", () => {
      expectRefused(multiple("q1"), { kind: "choice", optionId: null, other: "Nonprofits" }, "invalid");
    });

    it("refuses an Other answer alongside a valid option when Other is not allowed", () => {
      expectRefused(multiple("q1"), { kind: "choice", optionId: "o_a", other: "Nonprofits" }, "invalid");
    });

    it("refuses an option and an Other answer set at once", () => {
      const question = multiple("q1", { allowOther: true });
      expect(issuesOf([question], { q1: { kind: "choice", optionId: "o_a", other: "Nonprofits" } })).toEqual([
        { path: "answers.q1", code: "invalid", message: "Choose a single option." },
      ]);
    });

    it("reads an option with a blank Other as just the option", () => {
      const question = multiple("q1", { allowOther: true });
      const value = valueOf([question], { q1: { kind: "choice", optionId: "o_a", other: "   " } });
      expect(value.q1).toEqual({ kind: "choice", optionId: "o_a", other: null });
    });

    it("accepts an Other answer of exactly the limit and refuses one character more", () => {
      const question = multiple("q1", { allowOther: true });
      valueOf([question], { q1: { kind: "choice", optionId: null, other: chars(LIMITS.otherText) } });
      expectRefused(question, { kind: "choice", optionId: null, other: chars(LIMITS.otherText + 1) }, "invalid");
    });

    it.each<[string, unknown]>([
      ["a number", 5],
      ["an object", { value: "x" }],
      ["an array", ["x"]],
      ["true", true],
    ])("refuses an Other answer that is %s", (_label, other) => {
      const question = multiple("q1", { allowOther: true });
      expectRefused(question, { kind: "choice", optionId: null, other }, "invalid");
    });

    it.each<[string, unknown]>([
      ["a bare option id", "o_a"],
      ["a checkbox answer", { kind: "choices", optionIds: ["o_a"], other: null }],
      ["a text answer", { kind: "text", value: "Alpha" }],
      ["an array", ["o_a"]],
    ])("refuses %s", (_label, raw) => {
      expectRefused(multiple("q1"), raw, "invalid");
    });
  });

  describe("dropdown", () => {
    it("accepts an option that is on the form", () => {
      const value = valueOf([dropdown("q1")], { q1: { kind: "choice", optionId: "o_c", other: null } });
      expect(value.q1).toEqual({ kind: "choice", optionId: "o_c", other: null });
    });

    it("refuses an option that is not on the form", () => {
      expectRefused(dropdown("q1"), { kind: "choice", optionId: "o_zzz", other: null }, "invalid_option");
    });

    it("never accepts an Other answer", () => {
      expectRefused(dropdown("q1"), { kind: "choice", optionId: null, other: "Something else" }, "invalid");
    });
  });

  describe("checkboxes", () => {
    it("accepts options on the form and stores them in form order, without repeats", () => {
      const value = valueOf([checkboxes("q1")], {
        q1: { kind: "choices", optionIds: ["o_c", "o_a", "o_c", "o_a"], other: null },
      });
      expect(value.q1).toEqual({ kind: "choices", optionIds: ["o_a", "o_c"], other: null });
    });

    it("refuses the whole answer when any option is not on the form", () => {
      expectRefused(checkboxes("q1"), { kind: "choices", optionIds: ["o_a", "o_zzz"], other: null }, "invalid_option");
    });

    it.each<[string, unknown]>([
      ["a number", 1],
      ["null", null],
      ["a nested array", ["o_a"]],
      ["an object", { id: "o_a" }],
    ])("refuses a ticked option that is %s", (_label, member) => {
      expectRefused(checkboxes("q1"), { kind: "choices", optionIds: [member], other: null }, "invalid_option");
    });

    it.each<[string, unknown]>([
      ["a single id instead of a list", "o_a"],
      ["missing", undefined],
      ["an object", { o_a: true }],
    ])("refuses optionIds that are %s", (_label, optionIds) => {
      expectRefused(checkboxes("q1"), { kind: "choices", optionIds, other: null }, "invalid");
    });

    it("accepts Other on its own when the question allows it", () => {
      const question = checkboxes("q1", { allowOther: true, required: true });
      const value = valueOf([question], { q1: { kind: "choices", optionIds: [], other: " Robotics " } });
      expect(value.q1).toEqual({ kind: "choices", optionIds: [], other: "Robotics" });
    });

    it("accepts Other together with ticked options", () => {
      const question = checkboxes("q1", { allowOther: true });
      const value = valueOf([question], { q1: { kind: "choices", optionIds: ["o_b"], other: "Robotics" } });
      expect(value.q1).toEqual({ kind: "choices", optionIds: ["o_b"], other: "Robotics" });
    });

    it("refuses Other when the question does not allow it", () => {
      expectRefused(checkboxes("q1"), { kind: "choices", optionIds: ["o_a"], other: "Robotics" }, "invalid");
    });

    it("refuses an Other answer over the limit", () => {
      const question = checkboxes("q1", { allowOther: true });
      expectRefused(question, { kind: "choices", optionIds: [], other: chars(LIMITS.otherText + 1) }, "invalid");
    });

    it("refuses a single-choice answer", () => {
      expectRefused(checkboxes("q1"), { kind: "choice", optionId: "o_a", other: null }, "invalid");
    });
  });

  describe("linear scale", () => {
    it.each([1, 3, 5])("accepts %i on a 1 to 5 scale", (value) => {
      expect(valueOf([scale("q1")], { q1: { kind: "scale", value } }).q1).toEqual({ kind: "scale", value });
    });

    it("accepts 0 on a scale that starts at 0, including when required", () => {
      const question = scale("q1", { min: 0, max: 10, required: true });
      expect(valueOf([question], { q1: { kind: "scale", value: 0 } }).q1).toEqual({ kind: "scale", value: 0 });
      expect(valueOf([question], { q1: { kind: "scale", value: 10 } }).q1).toEqual({ kind: "scale", value: 10 });
    });

    it.each<[string, unknown]>([
      ["below the minimum", 0],
      ["above the maximum", 6],
      ["a fraction", 2.5],
      ["a numeric string", "3"],
      ["NaN", Number.NaN],
      ["Infinity", Number.POSITIVE_INFINITY],
      ["null", null],
      ["missing", undefined],
    ])("refuses a value that is %s", (_label, value) => {
      expectRefused(scale("q1"), { kind: "scale", value }, "invalid_scale");
    });

    it.each<[string, unknown]>([
      ["a bare number", 3],
      ["a text answer", { kind: "text", value: "3" }],
    ])("refuses %s", (_label, raw) => {
      expectRefused(scale("q1"), raw, "invalid");
    });
  });

  // Question ids are the keys of the answers object, so an id such as "constructor" or
  // "__proto__" collides with a key every object inherits. The form validator refuses
  // those ids, and answers are read by own key only, so neither layer relies on the other.
  describe("question ids that collide with inherited object keys", () => {
    const inherited = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"];

    it.each([...inherited, "__q__"])("does not let a deliverable be saved with the question id %s", (id) => {
      const result = validateFormDefinition({
        title: "Form",
        description: "",
        status: "published",
        questions: [{ id, type: "short_text", title: "Q", description: "", required: false, validation: "none" }],
        settings: {},
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toContainEqual(expect.objectContaining({ path: "questions[0].id", code: "invalid" }));
      }
    });

    it.each(inherited)("reads a blank optional question with the id %s as blank, not malformed", (id) => {
      expect(validateAnswers([short(id)], JSON.parse("{}"))).toEqual({ ok: true, value: {} });
      expect(sanitizeDraftAnswers([short(id)], JSON.parse("{}"))).toEqual({});
      expect(countAnswered([short(id)], {})).toBe(0);
    });
  });
});

describe("sanitizeDraftAnswers", () => {
  const questions: Question[] = [
    section("s1"),
    short("q_name", { required: true }),
    short("q_link", { validation: "url" }),
    date("q_date"),
    multiple("q_pick", { required: true }),
    checkboxes("q_ticks"),
    scale("q_scale"),
    paragraph("q_story", { required: true }),
  ];

  it("keeps typed text as it is and drops only what could not belong to the form", () => {
    const draft = sanitizeDraftAnswers(questions, {
      s1: text("section"),
      q_name: text("  Avery  "),
      // Not a usable link yet, but it is what the pledge has typed so far.
      q_link: text("docs.google.com/my-doc"),
      q_date: text("2026-02-30"),
      q_pick: { kind: "choice", optionId: "o_zzz", other: null },
      q_ticks: { kind: "choices", optionIds: ["o_b", "o_a"], other: null },
      q_scale: { kind: "scale", value: 99 },
      q_ghost: text("not on the form"),
    });
    expect(draft).toEqual({
      q_name: { kind: "text", value: "Avery" },
      q_link: { kind: "text", value: "docs.google.com/my-doc" },
      q_ticks: { kind: "choices", optionIds: ["o_a", "o_b"], other: null },
    });
  });

  // Saving must never throw away work in progress: the earlier behaviour dropped
  // the whole answer, and the page still said "Draft saved".
  it("keeps the part of an over-long answer that fits instead of losing all of it", () => {
    const tooLong = "x".repeat(LIMITS.paragraph + 250);
    const draft = sanitizeDraftAnswers(questions, {
      q_story: text(tooLong),
      q_name: text("y".repeat(LIMITS.shortText + 1)),
    });
    expect(draft.q_story).toEqual({ kind: "text", value: "x".repeat(LIMITS.paragraph) });
    expect(draft.q_name).toEqual({ kind: "text", value: "y".repeat(LIMITS.shortText) });
  });

  it("keeps text that is not a number or an email yet in a draft, and refuses it on submit", () => {
    const amount = short("q_amount", { validation: "number" });
    const contact = short("q_contact", { validation: "email" });
    expect(
      sanitizeDraftAnswers([amount, contact], { q_amount: text("about 3"), q_contact: text("avery@") }),
    ).toEqual({
      q_amount: { kind: "text", value: "about 3" },
      q_contact: { kind: "text", value: "avery@" },
    });
    expectRefused(amount, text("about 3"), "invalid_number");
    expectRefused(contact, text("avery@"), "invalid_email");
  });

  it("still drops a value of the wrong kind for a text question", () => {
    expect(sanitizeDraftAnswers(questions, { q_name: { kind: "scale", value: 3 } })).toEqual({});
    expect(sanitizeDraftAnswers(questions, { q_name: { kind: "text", value: 42 } })).toEqual({});
  });

  it("does not mind required questions being unanswered", () => {
    expect(sanitizeDraftAnswers(questions, {})).toEqual({});
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["undefined", undefined],
    ["an array", [text("x")]],
    ["a string", "draft"],
  ])("returns an empty draft for input that is %s", (_label, input) => {
    expect(sanitizeDraftAnswers(questions, input)).toEqual({});
  });

  it("agrees with validateAnswers on a response that is fully valid", () => {
    const input = {
      q_name: text("Avery"),
      q_pick: { kind: "choice", optionId: "o_a", other: null },
      q_story: text("Line one\nLine two"),
    };
    expect(sanitizeDraftAnswers(questions, input)).toEqual(valueOf(questions, input));
  });
});

describe("countAnswered", () => {
  it("counts answerable questions that have an answer", () => {
    const questions: Question[] = [section("s1"), short("q1"), short("q2"), scale("q3")];
    const answers: Answers = {
      q1: { kind: "text", value: "a" },
      q3: { kind: "scale", value: 0 },
      s1: { kind: "text", value: "ignored" },
      q_old: { kind: "text", value: "ignored" },
    };
    expect(countAnswered(questions, answers)).toBe(2);
    expect(countAnswered(questions, {})).toBe(0);
    expect(countAnswered([], answers)).toBe(0);
  });
});

describe("answerToText", () => {
  it("renders text and scale answers as they are", () => {
    expect(answerToText(short("q"), { kind: "text", value: "Informatics" })).toBe("Informatics");
    expect(answerToText(scale("q"), { kind: "scale", value: 0 })).toBe("0");
    expect(answerToText(scale("q"), { kind: "scale", value: 7 })).toBe("7");
  });

  it("renders a choice by its label", () => {
    expect(answerToText(multiple("q"), { kind: "choice", optionId: "o_b", other: null })).toBe("Beta");
    expect(answerToText(dropdown("q"), { kind: "choice", optionId: "o_c", other: null })).toBe("Gamma");
  });

  it("renders an Other choice with a prefix", () => {
    expect(answerToText(multiple("q"), { kind: "choice", optionId: null, other: "Nonprofits" })).toBe(
      "Other: Nonprofits",
    );
  });

  it("renders checkboxes as a semicolon-separated list, with Other last", () => {
    const answer = { kind: "choices", optionIds: ["o_a", "o_c"], other: "Robotics" } as const;
    expect(answerToText(checkboxes("q"), { ...answer, optionIds: [...answer.optionIds] })).toBe(
      "Alpha; Gamma; Other: Robotics",
    );
    expect(answerToText(checkboxes("q"), { kind: "choices", optionIds: ["o_b"], other: null })).toBe("Beta");
    expect(answerToText(checkboxes("q"), { kind: "choices", optionIds: [], other: "Robotics" })).toBe(
      "Other: Robotics",
    );
  });

  it("marks an option that has since been removed from the form", () => {
    expect(answerToText(multiple("q"), { kind: "choice", optionId: "o_gone", other: null })).toBe(
      "(removed option)",
    );
    expect(answerToText(checkboxes("q"), { kind: "choices", optionIds: ["o_a", "o_gone"], other: null })).toBe(
      "Alpha; (removed option)",
    );
  });

  it("is empty for a missing answer and for a section", () => {
    expect(answerToText(short("q"), undefined)).toBe("");
    expect(answerToText(section("s"), { kind: "text", value: "x" })).toBe("");
  });
});

describe("optionLabel", () => {
  it("returns the label of an option on the question", () => {
    expect(optionLabel(dropdown("q"), "o_a")).toBe("Alpha");
  });

  it("is empty for no option and for questions that have no options", () => {
    expect(optionLabel(dropdown("q"), null)).toBe("");
    expect(optionLabel(short("q"), "o_a")).toBe("");
    expect(optionLabel(section("s"), "o_a")).toBe("");
  });

  it("marks an unknown option as removed", () => {
    expect(optionLabel(dropdown("q"), "o_gone")).toBe("(removed option)");
  });
});
