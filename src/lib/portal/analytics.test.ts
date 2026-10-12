import { describe, expect, it } from "vitest";
import {
  summarizeResponses,
  summarizeTiming,
  type ChoiceSummary,
  type QuestionSummary,
  type ResponseForSummary,
  type ScaleSummary,
  type TextSummary,
} from "./analytics";
import type { Answers, Question } from "./types";

const OPTIONS = [
  { id: "o_a", label: "Students" },
  { id: "o_b", label: "Small businesses" },
  { id: "o_c", label: "Large companies" },
];

const QUESTIONS: Question[] = [
  { id: "s_intro", type: "section", title: "About you", description: "" },
  { id: "q_who", type: "multiple_choice", title: "Who has this problem?", description: "", required: true, allowOther: true, options: OPTIONS },
  { id: "q_areas", type: "checkboxes", title: "Areas", description: "", required: false, allowOther: true, options: OPTIONS },
  { id: "q_year", type: "dropdown", title: "Year", description: "", required: true, options: OPTIONS },
  { id: "q_conf", type: "linear_scale", title: "Confidence", description: "", required: true, min: 1, max: 5, minLabel: "Low", maxLabel: "High" },
  { id: "q_story", type: "paragraph", title: "Story", description: "", required: false },
  { id: "q_major", type: "short_text", title: "Major", description: "", required: true, validation: "none" },
  { id: "q_when", type: "date", title: "When", description: "", required: false },
  { id: "q_at", type: "time", title: "At", description: "", required: false },
];

const response = (answers: Answers, questions: Question[] = QUESTIONS): ResponseForSummary => ({ answers, questions });

function find<K extends QuestionSummary["kind"]>(
  summaries: QuestionSummary[],
  questionId: string,
  kind: K,
): Extract<QuestionSummary, { kind: K }> {
  const summary = summaries.find((item) => item.questionId === questionId);
  if (!summary || summary.kind !== kind) throw new Error(`No ${kind} summary for ${questionId}`);
  return summary as Extract<QuestionSummary, { kind: K }>;
}

describe("summarizeResponses", () => {
  it("returns one summary per answerable question, in form order, skipping sections", () => {
    const summaries = summarizeResponses(QUESTIONS, []);
    expect(summaries.map((summary) => `${summary.questionId}:${summary.kind}`)).toEqual([
      "q_who:choice",
      "q_areas:choice",
      "q_year:choice",
      "q_conf:scale",
      "q_story:text",
      "q_major:text",
      "q_when:text",
      "q_at:text",
    ]);
  });

  it("carries each question's title and required flag", () => {
    const summaries = summarizeResponses(QUESTIONS, []);
    expect(find(summaries, "q_who", "choice")).toMatchObject({ title: "Who has this problem?", required: true });
    expect(find(summaries, "q_story", "text")).toMatchObject({ title: "Story", required: false });
  });

  it("shows every option with a zero count, and no averages, when there are no responses", () => {
    const summaries = summarizeResponses(QUESTIONS, []);
    const choice: ChoiceSummary = find(summaries, "q_who", "choice");
    expect(choice).toMatchObject({
      answered: 0,
      multiple: false,
      otherResponses: [],
      buckets: [
        { label: "Students", count: 0 },
        { label: "Small businesses", count: 0 },
        { label: "Large companies", count: 0 },
      ],
    });
    const scale: ScaleSummary = find(summaries, "q_conf", "scale");
    expect(scale.average).toBeNull();
    expect(scale.answered).toBe(0);
    expect(find(summaries, "q_story", "text")).toMatchObject({ answered: 0, responses: [] });
  });

  describe("single-choice questions", () => {
    const responses = [
      response({ q_who: { kind: "choice", optionId: "o_a", other: null } }),
      response({ q_who: { kind: "choice", optionId: "o_a", other: null } }),
      response({ q_who: { kind: "choice", optionId: "o_c", other: null } }),
      response({ q_who: { kind: "choice", optionId: null, other: "Nonprofits" } }),
      response({}),
    ];

    it("counts each response in the option it chose, in option order", () => {
      const summary = find(summarizeResponses(QUESTIONS, responses), "q_who", "choice");
      expect(summary.buckets).toEqual([
        { label: "Students", count: 2 },
        { label: "Small businesses", count: 0 },
        { label: "Large companies", count: 1 },
        { label: "Other", count: 1 },
      ]);
    });

    it("counts who answered, leaving out those who skipped", () => {
      expect(find(summarizeResponses(QUESTIONS, responses), "q_who", "choice").answered).toBe(4);
    });

    it("lists what people wrote under Other", () => {
      expect(find(summarizeResponses(QUESTIONS, responses), "q_who", "choice").otherResponses).toEqual(["Nonprofits"]);
    });

    it("adds no Other bucket when nobody used it", () => {
      const summary = find(summarizeResponses(QUESTIONS, responses.slice(0, 3)), "q_who", "choice");
      expect(summary.buckets.map((bucket) => bucket.label)).toEqual(["Students", "Small businesses", "Large companies"]);
    });

    it("treats a dropdown the same way", () => {
      const summary = find(
        summarizeResponses(QUESTIONS, [response({ q_year: { kind: "choice", optionId: "o_b", other: null } })]),
        "q_year",
        "choice",
      );
      expect(summary).toMatchObject({ multiple: false, answered: 1 });
      expect(summary.buckets[1]).toEqual({ label: "Small businesses", count: 1 });
    });
  });

  describe("checkboxes", () => {
    const responses = [
      response({ q_areas: { kind: "choices", optionIds: ["o_a", "o_b"], other: null } }),
      response({ q_areas: { kind: "choices", optionIds: ["o_a"], other: "Robotics" } }),
      response({ q_areas: { kind: "choices", optionIds: [], other: "Space" } }),
      response({}),
    ];

    it("counts one response in every option it ticked", () => {
      const summary = find(summarizeResponses(QUESTIONS, responses), "q_areas", "choice");
      expect(summary.multiple).toBe(true);
      expect(summary.buckets).toEqual([
        { label: "Students", count: 2 },
        { label: "Small businesses", count: 1 },
        { label: "Large companies", count: 0 },
        { label: "Other", count: 2 },
      ]);
    });

    it("counts responses, not ticks, as answered", () => {
      const summary = find(summarizeResponses(QUESTIONS, responses), "q_areas", "choice");
      expect(summary.answered).toBe(3);
      expect(summary.otherResponses).toEqual(["Robotics", "Space"]);
    });
  });

  describe("options that changed after responses came in", () => {
    const oldQuestions: Question[] = QUESTIONS.map((question) =>
      question.id === "q_who" && question.type === "multiple_choice"
        ? { ...question, options: [...OPTIONS, { id: "o_gone", label: "Governments" }] }
        : question,
    );

    it("counts a renamed option under its current label", () => {
      const renamed: Question[] = QUESTIONS.map((question) =>
        question.id === "q_who" && question.type === "multiple_choice"
          ? { ...question, options: [{ id: "o_a", label: "University students" }, OPTIONS[1], OPTIONS[2]] }
          : question,
      );
      const summary = find(
        summarizeResponses(renamed, [response({ q_who: { kind: "choice", optionId: "o_a", other: null } })]),
        "q_who",
        "choice",
      );
      expect(summary.buckets[0]).toEqual({ label: "University students", count: 1 });
      expect(summary.buckets.map((bucket) => bucket.label)).not.toContain("Students");
    });

    it("counts a removed option under the label it had when the response was submitted", () => {
      const summary = find(
        summarizeResponses(QUESTIONS, [
          response({ q_who: { kind: "choice", optionId: "o_gone", other: null } }, oldQuestions),
          response({ q_who: { kind: "choice", optionId: "o_gone", other: null } }, oldQuestions),
        ]),
        "q_who",
        "choice",
      );
      expect(summary.answered).toBe(2);
      expect(summary.buckets).toContainEqual({ label: "Governments", count: 2 });
    });

    it("falls back to a placeholder when the option is in neither version", () => {
      const summary = find(
        summarizeResponses(QUESTIONS, [response({ q_who: { kind: "choice", optionId: "o_unknown", other: null } })]),
        "q_who",
        "choice",
      );
      expect(summary.buckets).toContainEqual({ label: "(removed option)", count: 1 });
    });
  });

  describe("linear scales", () => {
    const scaleResponses = (...values: number[]) =>
      values.map((value) => response({ q_conf: { kind: "scale", value } }));

    it("has one bucket per point on the scale, lowest first, including empty ones", () => {
      const summary = find(summarizeResponses(QUESTIONS, scaleResponses(5, 2, 5)), "q_conf", "scale");
      expect(summary.buckets).toEqual([
        { label: "1", count: 0 },
        { label: "2", count: 1 },
        { label: "3", count: 0 },
        { label: "4", count: 0 },
        { label: "5", count: 2 },
      ]);
      expect(summary).toMatchObject({ answered: 3, minLabel: "Low", maxLabel: "High" });
    });

    it.each<[number[], number]>([
      [[4], 4],
      [[1, 2], 1.5],
      [[1, 2, 2], 1.67],
      [[1, 1, 2], 1.33],
      [[5, 5, 5, 5], 5],
    ])("averages %j to %d, rounded to two decimals", (values, average) => {
      expect(find(summarizeResponses(QUESTIONS, scaleResponses(...values)), "q_conf", "scale").average).toBe(average);
    });

    it("includes the zero point on a scale that starts at 0 and averages it in", () => {
      const zeroBased: Question[] = [
        { id: "q_conf", type: "linear_scale", title: "NPS", description: "", required: true, min: 0, max: 3, minLabel: "", maxLabel: "" },
      ];
      const summary = find(summarizeResponses(zeroBased, scaleResponses(0, 0, 3)), "q_conf", "scale");
      expect(summary.buckets.map((bucket) => bucket.label)).toEqual(["0", "1", "2", "3"]);
      expect(summary.buckets[0].count).toBe(2);
      expect(summary.average).toBe(1);
    });

    it("keeps a value from before the scale was shortened, in order", () => {
      const summary = find(summarizeResponses(QUESTIONS, scaleResponses(9, 3)), "q_conf", "scale");
      expect(summary.buckets.map((bucket) => bucket.label)).toEqual(["1", "2", "3", "4", "5", "9"]);
      expect(summary.answered).toBe(2);
    });
  });

  describe("text questions", () => {
    it("lists the answers in response order", () => {
      const summary: TextSummary = find(
        summarizeResponses(QUESTIONS, [
          response({ q_major: { kind: "text", value: "Informatics" } }),
          response({}),
          response({ q_major: { kind: "text", value: "Economics" } }),
        ]),
        "q_major",
        "text",
      );
      expect(summary).toMatchObject({ answered: 2, responses: ["Informatics", "Economics"] });
    });

    it("summarizes paragraph, date and time questions as text", () => {
      const summaries = summarizeResponses(QUESTIONS, [
        response({
          q_story: { kind: "text", value: "Line one\nLine two" },
          q_when: { kind: "text", value: "2026-10-05" },
          q_at: { kind: "text", value: "14:30" },
        }),
      ]);
      expect(find(summaries, "q_story", "text").responses).toEqual(["Line one\nLine two"]);
      expect(find(summaries, "q_when", "text").responses).toEqual(["2026-10-05"]);
      expect(find(summaries, "q_at", "text").responses).toEqual(["14:30"]);
    });
  });

  it("ignores an answer of the wrong kind for the question's current type", () => {
    const summaries = summarizeResponses(QUESTIONS, [
      response({
        q_conf: { kind: "text", value: "5" },
        q_major: { kind: "scale", value: 5 },
        q_who: { kind: "text", value: "Students" },
      }),
    ]);
    expect(find(summaries, "q_conf", "scale")).toMatchObject({ answered: 0, average: null });
    expect(find(summaries, "q_major", "text").answered).toBe(0);
    expect(find(summaries, "q_who", "choice").answered).toBe(0);
  });

  it("ignores answers to questions that are no longer on the form", () => {
    const summaries = summarizeResponses(QUESTIONS, [response({ q_removed: { kind: "text", value: "old" } })]);
    expect(summaries.every((summary) => summary.answered === 0)).toBe(true);
  });
});

describe("summarizeTiming", () => {
  const timed = (durationSeconds: number, activeSeconds = durationSeconds, late = false) => ({
    durationSeconds,
    activeSeconds,
    late,
  });

  it("has no figures when there are no responses", () => {
    expect(summarizeTiming([])).toEqual({
      count: 0,
      onTime: 0,
      late: 0,
      averageDurationSeconds: null,
      medianDurationSeconds: null,
      fastestDurationSeconds: null,
      slowestDurationSeconds: null,
      averageActiveSeconds: null,
    });
  });

  it("summarizes a single response", () => {
    expect(summarizeTiming([timed(600, 420, true)])).toEqual({
      count: 1,
      onTime: 0,
      late: 1,
      averageDurationSeconds: 600,
      medianDurationSeconds: 600,
      fastestDurationSeconds: 600,
      slowestDurationSeconds: 600,
      averageActiveSeconds: 420,
    });
  });

  it("splits on-time from late", () => {
    expect(summarizeTiming([timed(1), timed(2, 2, true), timed(3), timed(4, 4, true), timed(5)])).toMatchObject({
      count: 5,
      onTime: 3,
      late: 2,
    });
  });

  it("takes the middle value as the median of an odd number of responses, whatever their order", () => {
    expect(summarizeTiming([timed(900), timed(100), timed(300)]).medianDurationSeconds).toBe(300);
  });

  it("takes the rounded mean of the two middle values for an even number of responses", () => {
    expect(summarizeTiming([timed(100), timed(400), timed(200), timed(301)]).medianDurationSeconds).toBe(251);
  });

  it("is not thrown off by one very slow response, unlike the average", () => {
    const summary = summarizeTiming([timed(60), timed(70), timed(80), timed(90), timed(86_400)]);
    expect(summary.medianDurationSeconds).toBe(80);
    expect(summary.averageDurationSeconds).toBe(17_340);
    expect(summary.fastestDurationSeconds).toBe(60);
    expect(summary.slowestDurationSeconds).toBe(86_400);
  });

  it("rounds the averages to whole seconds", () => {
    const summary = summarizeTiming([timed(10, 1), timed(11, 2)]);
    expect(summary.averageDurationSeconds).toBe(11);
    expect(summary.averageActiveSeconds).toBe(2);
  });

  it("averages active time separately from elapsed time", () => {
    expect(summarizeTiming([timed(1000, 100), timed(3000, 300)])).toMatchObject({
      averageDurationSeconds: 2000,
      averageActiveSeconds: 200,
    });
  });

  it("does not reorder the responses it was given", () => {
    const responses = [timed(300), timed(100), timed(200)];
    summarizeTiming(responses);
    expect(responses.map((item) => item.durationSeconds)).toEqual([300, 100, 200]);
  });
});
