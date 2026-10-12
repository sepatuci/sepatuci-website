import { describe, expect, it } from "vitest";
import { LOCAL_ID_PATTERN } from "./constants";
import { blankQuestion, convertQuestion, describeSchedule, duplicateQuestion, moveItem } from "./form-builder";
import { validateFormDefinition } from "./form-schema";
import type { FormSettings, Question, QuestionType } from "./types";

const ANSWERABLE_TYPES: QuestionType[] = [
  "short_text",
  "paragraph",
  "multiple_choice",
  "checkboxes",
  "dropdown",
  "linear_scale",
  "date",
  "time",
];
const ALL_TYPES: QuestionType[] = ["section", ...ANSWERABLE_TYPES];

const OPTIONS = [
  { id: "o_1", label: "First" },
  { id: "o_2", label: "Second" },
];

const multipleChoice: Question = {
  id: "q_mc",
  type: "multiple_choice",
  title: "Pick one",
  description: "Any of them",
  required: true,
  allowOther: true,
  options: OPTIONS,
};
const checkboxes: Question = { ...multipleChoice, id: "q_cb", type: "checkboxes" };
const dropdown: Question = {
  id: "q_dd",
  type: "dropdown",
  title: "Pick one",
  description: "",
  required: true,
  options: OPTIONS,
};
const shortText: Question = {
  id: "q_st",
  type: "short_text",
  title: "Your link",
  description: "Paste it",
  required: true,
  validation: "url",
};
const sectionBlock: Question = { id: "q_sec", type: "section", title: "Part one", description: "Intro" };

describe("blankQuestion", () => {
  it.each(ALL_TYPES)("creates an untitled %s block with a builder-style id", (type) => {
    const question = blankQuestion(type);
    expect(question.type).toBe(type);
    expect(question.title).toBe("");
    expect(question.description).toBe("");
    expect(question.id).toMatch(/^q_[0-9a-f]{12}$/);
    expect(question.id).toMatch(LOCAL_ID_PATTERN);
  });

  it("gives every new question a different id", () => {
    const ids = new Set(Array.from({ length: 200 }, () => blankQuestion("short_text").id));
    expect(ids.size).toBe(200);
  });

  it("starts answerable questions as optional and sections without a required flag", () => {
    for (const type of ANSWERABLE_TYPES) expect(blankQuestion(type)).toMatchObject({ required: false });
    expect(blankQuestion("section")).not.toHaveProperty("required");
  });

  it.each<[QuestionType]>([["multiple_choice"], ["checkboxes"], ["dropdown"]])(
    "starts a %s question with one option",
    (type) => {
      const question = blankQuestion(type);
      if (!("options" in question)) throw new Error("expected options");
      expect(question.options).toHaveLength(1);
      expect(question.options[0].label).toBe("Option 1");
      expect(question.options[0].id).toMatch(/^o_[0-9a-f]{12}$/);
    },
  );

  it("starts a linear scale at 1 to 5 and a short answer with no validation", () => {
    expect(blankQuestion("linear_scale")).toMatchObject({ min: 1, max: 5, minLabel: "", maxLabel: "" });
    expect(blankQuestion("short_text")).toMatchObject({ validation: "none" });
  });

  it.each(ALL_TYPES)("creates a %s block that a draft can be saved with as it is", (type) => {
    const result = validateFormDefinition({
      title: "Draft",
      description: "",
      status: "draft",
      questions: [blankQuestion(type)],
      settings: {},
    });
    expect(result).toMatchObject({ ok: true });
  });

  it.each(ANSWERABLE_TYPES)("creates a %s question that can be published once it has a title", (type) => {
    const result = validateFormDefinition({
      title: "Published",
      description: "",
      status: "published",
      questions: [{ ...blankQuestion(type), title: "A question" }],
      settings: {},
    });
    expect(result).toMatchObject({ ok: true });
  });
});

describe("convertQuestion", () => {
  it.each(ALL_TYPES)("keeps the id, title and description when converting to %s", (type) => {
    expect(convertQuestion(shortText, type)).toMatchObject({
      id: "q_st",
      type,
      title: "Your link",
      description: "Paste it",
    });
  });

  it.each(ANSWERABLE_TYPES)("keeps the required flag when converting to %s", (type) => {
    expect(convertQuestion(shortText, type)).toMatchObject({ required: true });
    expect(convertQuestion({ ...shortText, required: false }, type)).toMatchObject({ required: false });
  });

  it("makes a converted section optional", () => {
    for (const type of ANSWERABLE_TYPES) {
      expect(convertQuestion(sectionBlock, type)).toMatchObject({ required: false });
    }
  });

  it("reduces any question to a bare section", () => {
    for (const question of [shortText, multipleChoice, dropdown]) {
      expect(convertQuestion(question, "section")).toEqual({
        id: question.id,
        type: "section",
        title: question.title,
        description: question.description,
      });
    }
  });

  it("carries options between the three choice types", () => {
    expect(convertQuestion(multipleChoice, "dropdown")).toMatchObject({ options: OPTIONS });
    expect(convertQuestion(multipleChoice, "checkboxes")).toMatchObject({ options: OPTIONS });
    expect(convertQuestion(dropdown, "multiple_choice")).toMatchObject({ options: OPTIONS });
    expect(convertQuestion(checkboxes, "multiple_choice")).toMatchObject({ options: OPTIONS });
  });

  it("carries allowOther between multiple choice and checkboxes", () => {
    expect(convertQuestion(multipleChoice, "checkboxes")).toMatchObject({ allowOther: true });
    expect(convertQuestion(checkboxes, "multiple_choice")).toMatchObject({ allowOther: true });
  });

  it("drops allowOther for a dropdown, and turns it off when coming back from one", () => {
    expect(convertQuestion(multipleChoice, "dropdown")).not.toHaveProperty("allowOther");
    expect(convertQuestion(dropdown, "multiple_choice")).toMatchObject({ allowOther: false });
    expect(convertQuestion(dropdown, "checkboxes")).toMatchObject({ allowOther: false });
  });

  it("gives a text question one fresh option when it becomes a choice", () => {
    const converted = convertQuestion(shortText, "multiple_choice");
    if (!("options" in converted)) throw new Error("expected options");
    expect(converted.options).toHaveLength(1);
    expect(converted.options[0].label).toBe("Option 1");
    expect(converted.options[0].id).toMatch(LOCAL_ID_PATTERN);
    expect(converted).toMatchObject({ allowOther: false });
  });

  it("drops options, allowOther and scale settings when a choice becomes text", () => {
    expect(convertQuestion(multipleChoice, "paragraph")).toEqual({
      id: "q_mc",
      type: "paragraph",
      title: "Pick one",
      description: "Any of them",
      required: true,
    });
    expect(convertQuestion(multipleChoice, "date")).not.toHaveProperty("options");
    expect(convertQuestion(multipleChoice, "time")).not.toHaveProperty("allowOther");
  });

  it("drops link validation when a short answer becomes something else and back", () => {
    const there = convertQuestion(shortText, "paragraph");
    expect(there).not.toHaveProperty("validation");
    expect(convertQuestion(there, "short_text")).toMatchObject({ validation: "none" });
  });

  it("gives a new linear scale the default 1 to 5 range", () => {
    expect(convertQuestion(multipleChoice, "linear_scale")).toEqual({
      id: "q_mc",
      type: "linear_scale",
      title: "Pick one",
      description: "Any of them",
      required: true,
      min: 1,
      max: 5,
      minLabel: "",
      maxLabel: "",
    });
  });

  it("does not change the question it was given", () => {
    const original = structuredClone(multipleChoice);
    for (const type of ALL_TYPES) convertQuestion(multipleChoice, type);
    expect(multipleChoice).toEqual(original);
  });

  it.each(ANSWERABLE_TYPES)("produces a %s question the validator accepts", (type) => {
    for (const source of [shortText, multipleChoice, dropdown, sectionBlock]) {
      const result = validateFormDefinition({
        title: "Form",
        description: "",
        status: "published",
        questions: [convertQuestion(source, type)],
        settings: {},
      });
      expect(result).toMatchObject({ ok: true });
    }
  });
});

describe("duplicateQuestion", () => {
  it("copies a question under a new id", () => {
    const copy = duplicateQuestion(shortText);
    expect(copy.id).not.toBe(shortText.id);
    expect(copy.id).toMatch(/^q_[0-9a-f]{12}$/);
    expect({ ...copy, id: shortText.id }).toEqual(shortText);
  });

  it("gives every option a new id while keeping labels and order", () => {
    const copy = duplicateQuestion(multipleChoice);
    if (!("options" in copy)) throw new Error("expected options");
    expect(copy.options.map((option) => option.label)).toEqual(["First", "Second"]);
    const originalIds = new Set(OPTIONS.map((option) => option.id));
    for (const option of copy.options) {
      expect(originalIds.has(option.id)).toBe(false);
      expect(option.id).toMatch(/^o_[0-9a-f]{12}$/);
    }
    expect(new Set(copy.options.map((option) => option.id)).size).toBe(2);
    expect(copy).toMatchObject({ type: "multiple_choice", required: true, allowOther: true, title: "Pick one" });
  });

  it("leaves the original untouched", () => {
    const original = structuredClone(multipleChoice);
    duplicateQuestion(multipleChoice);
    expect(multipleChoice).toEqual(original);
  });

  it("produces a copy that can sit beside the original in one form", () => {
    const result = validateFormDefinition({
      title: "Form",
      description: "",
      status: "published",
      questions: [multipleChoice, duplicateQuestion(multipleChoice), sectionBlock, duplicateQuestion(sectionBlock)],
      settings: {},
    });
    expect(result).toMatchObject({ ok: true });
  });
});

describe("moveItem", () => {
  const items = ["a", "b", "c", "d"];

  it.each<[number, number, string[]]>([
    [0, 1, ["b", "a", "c", "d"]],
    [0, 3, ["b", "c", "d", "a"]],
    [3, 0, ["d", "a", "b", "c"]],
    [2, 1, ["a", "c", "b", "d"]],
    [1, 1, ["a", "b", "c", "d"]],
  ])("moves index %i to index %i", (from, to, expected) => {
    expect(moveItem(items, from, to)).toEqual(expected);
  });

  it.each<[number, number]>([
    [-1, 0],
    [0, -1],
    [4, 0],
    [0, 4],
    [99, 99],
  ])("leaves the order alone for out-of-range move %i to %i", (from, to) => {
    expect(moveItem(items, from, to)).toEqual(items);
  });

  it("returns a new array and never changes the one it was given", () => {
    const moved = moveItem(items, 0, 2);
    expect(moved).not.toBe(items);
    expect(items).toEqual(["a", "b", "c", "d"]);
    expect(moveItem(items, 9, 9)).not.toBe(items);
  });

  it("copes with an empty list", () => {
    expect(moveItem([], 0, 0)).toEqual([]);
  });
});

describe("describeSchedule", () => {
  const settings = (overrides: Partial<FormSettings> = {}): FormSettings => ({
    visibleAt: null,
    opensAt: null,
    dueAt: null,
    closesAt: null,
    allowLate: false,
    prerequisiteFormId: null,
    confirmationMessage: "",
    ...overrides,
  });
  // Mid-month and midday UTC, so the year reads the same in every time zone.
  const VISIBLE = "2026-06-10T12:00:00.000Z";
  const OPENS = "2026-06-12T12:00:00.000Z";
  const DUE = "2026-06-15T12:00:00.000Z";
  const CLOSES = "2026-06-18T12:00:00.000Z";

  it("describes a form with no schedule", () => {
    expect(describeSchedule(settings(), null)).toEqual([
      "Appears on new member dashboards as soon as it is published.",
      "Can be started as soon as it appears.",
      "Has no deadline.",
    ]);
  });

  it("describes each date that is set, with its year", () => {
    const lines = describeSchedule(settings({ visibleAt: VISIBLE, opensAt: OPENS, dueAt: DUE }), null);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^Appears on new member dashboards Jun \d{1,2}, 2026, .+\.$/);
    expect(lines[1]).toMatch(/^Can be started from Jun \d{1,2}, 2026, .+\.$/);
    expect(lines[2]).toMatch(/^Due Jun \d{1,2}, 2026, .+\.$/);
    expect(lines[3]).toBe("Closes at the deadline. Late responses are not accepted.");
  });

  it("says when late responses stop being accepted", () => {
    const lines = describeSchedule(settings({ dueAt: DUE, closesAt: CLOSES, allowLate: true }), null);
    expect(lines[3]).toMatch(/^Late responses are accepted until Jun \d{1,2}, 2026, .+ and marked late\.$/);
    expect(lines).not.toContain("Closes at the deadline. Late responses are not accepted.");
  });

  it("says when late responses are accepted with no cut-off", () => {
    const lines = describeSchedule(settings({ dueAt: DUE, allowLate: true }), null);
    expect(lines[3]).toBe("Late responses are accepted with no cut-off and marked late.");
  });

  it("does not mention closing at a deadline that does not exist", () => {
    const lines = describeSchedule(settings({ opensAt: OPENS }), null);
    expect(lines).toHaveLength(3);
    expect(lines.join(" ")).not.toMatch(/late|Closes/i);
  });

  it("names the deliverable that unlocks this one, last", () => {
    const lines = describeSchedule(settings({ dueAt: DUE, prerequisiteFormId: "week2" }), "Week 2: Interviews");
    expect(lines[lines.length - 1]).toBe('Stays locked for each new member until they turn in "Week 2: Interviews".');
  });

  it("says nothing about unlocking when there is no prerequisite title", () => {
    const lines = describeSchedule(settings({ prerequisiteFormId: "week2" }), null);
    expect(lines.join(" ")).not.toContain("locked");
  });
});
