import { describe, expect, it } from "vitest";
import { LIMITS } from "./constants";
import { NO_NAMES, UNKNOWN_PAGE, dwellSeconds, isPortalPath, pageLabel, type PageNames, type PageVisit } from "./pages";

describe("isPortalPath", () => {
  it.each([
    "/portal",
    "/portal/admin/new-members/abc123",
    "/portal/deliverables/week1",
    "/portal/account",
    "/portal/admin/activity/abc123/XYZ789",
    "/portal/history/week-1_final",
    "/portal/a/b/c/d/e/f",
  ])("accepts %s", (path) => {
    expect(isPortalPath(path)).toBe(true);
  });

  it.each<[string, string]>([
    ["a query string", "/portal/deliverables?x=1"],
    ["a fragment", "/portal#top"],
    ["a parent reference", "/portal/.."],
    ["a parent reference in the middle", "/portal/../admin"],
    ["a dot segment", "/portal/./account"],
    ["a double slash", "/portal//admin"],
    ["a trailing slash", "/portal/"],
    ["a trailing slash after a segment", "/portal/admin/"],
    ["a path outside the portal", "/admin"],
    ["the site root", "/"],
    ["a path that only starts with /portal", "/portals"],
    ["the portal in capitals", "/Portal"],
    ["no leading slash", "portal"],
    ["a dot in a segment", "/portal/a.b"],
    ["a space", "/portal/new members"],
    ["a segment that starts with a dash", "/portal/-x"],
    ["a segment that starts with an underscore", "/portal/_x"],
    ["an encoded character", "/portal/%2e%2e"],
    ["a full URL", "https://www.sepatuci.com/portal"],
    ["a newline at the end", "/portal\n"],
    ["a backslash", "/portal\\admin"],
    ["an empty string", ""],
  ])("rejects %s", (_label, path) => {
    expect(isPortalPath(path)).toBe(false);
  });

  it("accepts a segment of 64 characters and rejects one of 65", () => {
    expect(isPortalPath(`/portal/${"a".repeat(64)}`)).toBe(true);
    expect(isPortalPath(`/portal/${"a".repeat(65)}`)).toBe(false);
  });

  it("accepts a path of 200 characters and rejects one of 201, however well formed", () => {
    expect(LIMITS.pagePath).toBe(200);
    const segment = "a".repeat(64);
    const atLimit = `/portal/${segment}/${segment}/${"a".repeat(62)}`;
    const over = `/portal/${segment}/${segment}/${"a".repeat(63)}`;
    expect(atLimit).toHaveLength(200);
    expect(over).toHaveLength(201);
    expect(isPortalPath(atLimit)).toBe(true);
    expect(isPortalPath(over)).toBe(false);
  });

  it.each<[string, unknown]>([
    ["a number", 42],
    ["null", null],
    ["undefined", undefined],
    ["a boolean", true],
    ["an object with a path in it", { path: "/portal" }],
    ["a list holding a path", ["/portal"]],
    ["a String object", new String("/portal")],
  ])("rejects %s", (_label, value) => {
    expect(isPortalPath(value)).toBe(false);
  });
});

describe("pageLabel", () => {
  const names: PageNames = {
    forms: new Map([
      ["week1", "Week 1: Customer interviews"],
      ["f2", "Pitch deck"],
    ]),
    people: new Map([
      ["abc123", "Avery Chen"],
      ["u2", "Priya Shah"],
    ]),
  };

  it.each<[string, string]>([
    ["/portal", "Dashboard"],
    ["/portal/deliverables", "Deliverables"],
    ["/portal/history", "History"],
    ["/portal/account", "Account"],
    ["/portal/guide", "Guide"],
    ["/portal/welcome", "Welcome tour"],
    ["/portal/review", "New members"],
    ["/portal/review/deliverables", "Deliverables"],
    ["/portal/review/guide", "Guide"],
    ["/portal/review/welcome", "Welcome tour"],
    ["/portal/admin", "New members"],
    ["/portal/admin/people", "People"],
    ["/portal/admin/actives", "People"],
    ["/portal/admin/forms", "Deliverables"],
    ["/portal/admin/teams", "Teams"],
    ["/portal/admin/activity", "Activity"],
    ["/portal/admin/guide", "Admin guide"],
  ])("names the fixed page %s, with or without names to hand", (path, label) => {
    expect(pageLabel(path, names)).toBe(label);
    expect(pageLabel(path, NO_NAMES)).toBe(label);
    expect(pageLabel(path)).toBe(label);
  });

  it.each<[string, string]>([
    ["/portal/deliverables/week1", "Deliverable: Week 1: Customer interviews"],
    ["/portal/history/week1", "Response: Week 1: Customer interviews"],
    ["/portal/review/deliverables/f2", "Deliverable: Pitch deck"],
    ["/portal/admin/forms/f2", "Editor: Pitch deck"],
  ])("names %s from the deliverable's title", (path, label) => {
    expect(pageLabel(path, names)).toBe(label);
  });

  it.each<[string, string]>([
    ["/portal/review/new-members/abc123", "New member: Avery Chen"],
    ["/portal/admin/new-members/u2", "New member: Priya Shah"],
    ["/portal/admin/activity/abc123", "Activity: Avery Chen"],
    ["/portal/admin/activity/u2/session9", "Session: Priya Shah"],
  ])("names %s from the person's name", (path, label) => {
    expect(pageLabel(path, names)).toBe(label);
  });

  it.each<[string, string]>([
    ["/portal/deliverables/gone", "Deliverable: a deliverable since removed"],
    ["/portal/history/gone", "Response: a deliverable since removed"],
    ["/portal/review/deliverables/gone", "Deliverable: a deliverable since removed"],
    ["/portal/admin/forms/gone", "Editor: a deliverable since removed"],
    ["/portal/review/new-members/gone", "New member: an account since removed"],
    ["/portal/admin/new-members/gone", "New member: an account since removed"],
    ["/portal/admin/activity/gone", "Activity: an account since removed"],
    ["/portal/admin/activity/gone/session9", "Session: an account since removed"],
  ])("falls back for %s when the id has no name, without showing the id", (path, label) => {
    expect(pageLabel(path, names)).toBe(label);
    expect(pageLabel(path, NO_NAMES)).toBe(label);
    expect(pageLabel(path)).toBe(label);
    expect(pageLabel(path, names)).not.toContain("gone");
  });

  it("looks a deliverable up among the deliverables and a person among the people, never across", () => {
    const crossed: PageNames = { forms: names.people, people: names.forms };
    expect(pageLabel("/portal/deliverables/week1", crossed)).toBe("Deliverable: a deliverable since removed");
    expect(pageLabel("/portal/admin/new-members/abc123", crossed)).toBe("New member: an account since removed");
  });

  it("is not fooled by an id that is a name every object has", () => {
    expect(pageLabel("/portal/deliverables/constructor", names)).toBe("Deliverable: a deliverable since removed");
    expect(pageLabel("/portal/admin/new-members/__proto__", names)).toBe("New member: an account since removed");
    expect(pageLabel("/portal/admin/activity/toString/hasOwnProperty", names)).toBe("Session: an account since removed");
  });

  it.each([
    "/portal/nope",
    "/portal/admin/nope",
    "/portal/admin/people/u2",
    "/portal/review/new-members",
    "/portal/admin/new-members",
    "/portal/deliverables/week1/extra",
    "/portal/admin/activity/u2/session9/more",
    "/portal/admin/forms/",
    "/portal/",
    "/portal/deliverables?x=1",
    "/portal/Deliverables",
    "/PORTAL",
    "portal",
    "/elsewhere",
    "/",
    "",
  ])("is Unknown page for %s", (path) => {
    expect(pageLabel(path, names)).toBe(UNKNOWN_PAGE);
    expect(pageLabel(path)).toBe(UNKNOWN_PAGE);
  });

  it("never echoes an unknown path back", () => {
    const paths = [
      "/portal/<script>alert(1)</script>",
      "/portal/zzz",
      "javascript:alert(1)",
      "/portal/deliverables/week1/x",
      "/portal/" + "a".repeat(500),
    ];
    for (const path of paths) {
      const label = pageLabel(path, names);
      expect(label, path).toBe(UNKNOWN_PAGE);
      expect(label, path).not.toContain(path);
      expect(label, path).not.toContain("<");
    }
  });

  it("takes everything after the last slash as the id, and shows none of it", () => {
    // Such a path never reaches the log, since isPortalPath refuses it; even so, nothing of it comes back.
    for (const path of ["/portal/admin/forms/f2?mode=edit", "/portal/deliverables/week1#q3", "/portal/admin/new-members/<script>"]) {
      const label = pageLabel(path, names);
      expect(label, path).toMatch(/^(Editor|Deliverable|New member): (a deliverable|an account) since removed$/);
      expect(label, path).not.toMatch(/[?#<>=]/);
    }
  });

  it("gives every label a fixed beginning, so a title can never pass for a page of its own", () => {
    const tricky: PageNames = { forms: new Map([["f", "Dashboard"]]), people: new Map([["p", "Activity"]]) };
    expect(pageLabel("/portal/deliverables/f", tricky)).toBe("Deliverable: Dashboard");
    expect(pageLabel("/portal/admin/activity/p", tricky)).toBe("Activity: Activity");
  });
});

describe("dwellSeconds", () => {
  const T = Date.UTC(2026, 9, 1, 12, 0, 0);
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const pages: PageVisit[] = [
    { path: "/portal", atMs: T },
    { path: "/portal/deliverables", atMs: T + 45 * SECOND },
    { path: "/portal/deliverables/week1", atMs: T + 2 * MINUTE },
  ];
  const lastSeen = T + 10 * MINUTE;

  it("is the time until the next page for a page that was followed by another", () => {
    expect(dwellSeconds(pages, 0, lastSeen)).toBe(45);
    expect(dwellSeconds(pages, 1, lastSeen)).toBe(75);
  });

  it("is the time until the session was last seen for the last page", () => {
    expect(dwellSeconds(pages, 2, lastSeen)).toBe(480);
    expect(dwellSeconds(pages, 2, T + 2 * MINUTE + 1 * SECOND)).toBe(1);
  });

  it("is nought for the last page when the session was last seen as that page opened", () => {
    expect(dwellSeconds(pages, 2, pages[2].atMs)).toBe(0);
    expect(dwellSeconds([pages[0]], 0, T)).toBe(0);
  });

  it("does not go by the last-seen time for a page that was followed by another", () => {
    expect(dwellSeconds(pages, 0, T)).toBe(45);
    expect(dwellSeconds(pages, 1, T - MINUTE)).toBe(75);
  });

  it("is never negative", () => {
    expect(dwellSeconds(pages, 2, T)).toBe(0);
    expect(dwellSeconds(pages, 2, T - 24 * 60 * MINUTE)).toBe(0);
    const outOfOrder: PageVisit[] = [
      { path: "/portal", atMs: T + SECOND },
      { path: "/portal/account", atMs: T },
    ];
    expect(dwellSeconds(outOfOrder, 0, lastSeen)).toBe(0);
    expect(dwellSeconds(outOfOrder, 0, T + 300)).toBe(0);
  });

  it("rounds to the nearest second", () => {
    const after = (ms: number): PageVisit[] => [
      { path: "/portal", atMs: T },
      { path: "/portal/account", atMs: T + ms },
    ];
    expect(dwellSeconds(after(499), 0, lastSeen)).toBe(0);
    expect(dwellSeconds(after(500), 0, lastSeen)).toBe(1);
    expect(dwellSeconds(after(1499), 0, lastSeen)).toBe(1);
    expect(dwellSeconds(after(1500), 0, lastSeen)).toBe(2);
    expect(dwellSeconds([pages[0]], 0, T + 59_499)).toBe(59);
    expect(dwellSeconds([pages[0]], 0, T + 59_500)).toBe(60);
  });

  it("adds up to the length of the session", () => {
    const total = pages.reduce((sum, _page, index) => sum + dwellSeconds(pages, index, lastSeen), 0);
    expect(total).toBe(600);
  });
});
