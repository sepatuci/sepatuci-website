import { describe, expect, it } from "vitest";
import type { FormLike } from "./form-state";
import { computeProgress, standingFor } from "./progress";
import type { FormSettings, FormState } from "./types";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const iso = (ms: number): string => new Date(ms).toISOString();

const card = (state: FormState, late = false) => ({ state, late });

describe("computeProgress", () => {
  it("is all zeros with no deliverables, without dividing by zero", () => {
    expect(computeProgress([])).toEqual({
      total: 0,
      released: 0,
      submitted: 0,
      onTime: 0,
      late: 0,
      missed: 0,
      outstanding: 0,
      upcoming: 0,
      completionPct: 0,
    });
  });

  it("counts each state into its bucket", () => {
    const progress = computeProgress([
      card("submitted"),
      card("submitted"),
      card("submitted", true),
      card("missed"),
      card("open"),
      card("open_late", true),
      card("locked"),
      card("upcoming"),
      card("upcoming"),
      card("hidden"),
    ]);
    expect(progress).toEqual({
      total: 9,
      released: 7,
      submitted: 3,
      onTime: 2,
      late: 1,
      missed: 1,
      outstanding: 3,
      upcoming: 2,
      completionPct: 43,
    });
  });

  it("leaves hidden deliverables out of every number", () => {
    expect(computeProgress([card("hidden"), card("hidden")]).total).toBe(0);
    expect(computeProgress([card("hidden"), card("submitted")])).toMatchObject({
      total: 1,
      released: 1,
      completionPct: 100,
    });
  });

  it("does not count an open deliverable as late just because submitting now would be", () => {
    const progress = computeProgress([card("open_late", true)]);
    expect(progress.late).toBe(0);
    expect(progress.outstanding).toBe(1);
  });

  it("measures completion against released deliverables only, so upcoming ones do not drag it down", () => {
    const progress = computeProgress([card("submitted"), card("upcoming"), card("upcoming"), card("upcoming")]);
    expect(progress).toMatchObject({ total: 4, released: 1, completionPct: 100 });
  });

  it("is 0% when everything is still upcoming", () => {
    expect(computeProgress([card("upcoming"), card("upcoming")])).toMatchObject({
      total: 2,
      released: 0,
      completionPct: 0,
    });
  });

  it.each<[number, number, number]>([
    [1, 3, 33],
    [2, 3, 67],
    [1, 8, 13],
    [1, 200, 1],
    [199, 200, 100],
  ])("rounds %i of %i submitted to %i%%", (submitted, released, pct) => {
    const cards = [
      ...Array.from({ length: submitted }, () => card("submitted")),
      ...Array.from({ length: released - submitted }, () => card("open")),
    ];
    expect(computeProgress(cards).completionPct).toBe(pct);
  });

  it("counts late and on-time submissions towards completion alike", () => {
    expect(computeProgress([card("submitted", true), card("submitted"), card("missed"), card("locked")])).toMatchObject({
      submitted: 2,
      onTime: 1,
      late: 1,
      completionPct: 50,
    });
  });

  it("always satisfies total = submitted + missed + outstanding + upcoming", () => {
    const states: FormState[] = ["hidden", "upcoming", "locked", "open", "open_late", "submitted", "missed"];
    const cards = states.flatMap((state, index) => Array.from({ length: index + 1 }, () => card(state, index % 2 === 0)));
    const progress = computeProgress(cards);
    expect(progress.submitted + progress.missed + progress.outstanding + progress.upcoming).toBe(progress.total);
    expect(progress.onTime + progress.late).toBe(progress.submitted);
    expect(progress.released).toBe(progress.total - progress.upcoming);
  });
});

describe("standingFor", () => {
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
  const form = (id: string, overrides: Partial<FormSettings> = {}, status: FormLike["status"] = "published"): FormLike => ({
    id,
    title: `Title of ${id}`,
    status,
    settings: settings(overrides),
  });

  // The same shape as the demo data: one closed, one open, one chained, one upcoming, one draft.
  const forms: FormLike[] = [
    form("week0", { opensAt: iso(NOW - 21 * DAY), dueAt: iso(NOW - 15 * DAY), allowLate: true }),
    form("week1", { opensAt: iso(NOW - 14 * DAY), dueAt: iso(NOW - 7 * DAY) }),
    form("interviews", { opensAt: iso(NOW - 7 * DAY), dueAt: iso(NOW + 2 * DAY) }),
    form("synthesis", { opensAt: iso(NOW - 7 * DAY), dueAt: iso(NOW + 4 * DAY), prerequisiteFormId: "interviews" }),
    form("week3", { visibleAt: iso(NOW - DAY), opensAt: iso(NOW + 3 * DAY), dueAt: iso(NOW + 10 * DAY) }),
    form("draft", {}, "draft"),
  ];
  const states = (standing: ReturnType<typeof standingFor>): Record<string, FormState> =>
    Object.fromEntries(Object.entries(standing.byForm).map(([id, evaluated]) => [id, evaluated.state]));

  it("evaluates every form for the pledge, resolving prerequisites between them", () => {
    const pledge = {
      createdAt: iso(NOW - 21 * DAY),
      submitted: { week0: { submittedAt: iso(NOW - 12 * DAY), late: true } },
    };
    const standing = standingFor(pledge, forms, NOW);
    expect(states(standing)).toEqual({
      week0: "submitted",
      week1: "missed",
      interviews: "open",
      synthesis: "locked",
      week3: "upcoming",
      draft: "hidden",
    });
    expect(standing.byForm.synthesis).toMatchObject({
      lockReason: "prerequisite_pending",
      lockedByTitle: "Title of interviews",
    });
    expect(standing.progress).toEqual({
      total: 5,
      released: 4,
      submitted: 1,
      onTime: 0,
      late: 1,
      missed: 1,
      outstanding: 2,
      upcoming: 1,
      completionPct: 25,
    });
  });

  it("unlocks the chained form once its prerequisite is turned in", () => {
    const pledge = {
      createdAt: iso(NOW - 21 * DAY),
      submitted: {
        week0: { submittedAt: iso(NOW - 19 * DAY), late: false },
        week1: { submittedAt: iso(NOW - 9 * DAY), late: false },
        interviews: { submittedAt: iso(NOW - DAY), late: false },
      },
    };
    const standing = standingFor(pledge, forms, NOW);
    expect(standing.byForm.synthesis.state).toBe("open");
    expect(standing.progress).toMatchObject({ submitted: 3, onTime: 3, outstanding: 1, completionPct: 75 });
  });

  it("does not hold a pledge who joined late to deliverables that were already over", () => {
    const pledge = { createdAt: iso(NOW - DAY), submitted: {} };
    const standing = standingFor(pledge, forms, NOW);
    expect(states(standing)).toEqual({
      week0: "hidden",
      week1: "hidden",
      interviews: "open",
      synthesis: "locked",
      week3: "upcoming",
      draft: "hidden",
    });
    expect(standing.progress).toMatchObject({ total: 3, missed: 0, outstanding: 2, upcoming: 1 });
  });

  it("is empty when there are no forms", () => {
    const standing = standingFor({ createdAt: iso(NOW), submitted: {} }, [], NOW);
    expect(standing.byForm).toEqual({});
    expect(standing.progress.total).toBe(0);
  });

  it("treats an unreadable creation date as the earliest possible, so nothing is hidden by it", () => {
    const standing = standingFor({ createdAt: "not a date", submitted: {} }, forms, NOW);
    expect(standing.byForm.week1.state).toBe("missed");
    expect(standing.byForm.week0.state).toBe("open_late");
  });
});
