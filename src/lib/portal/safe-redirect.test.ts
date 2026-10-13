import { describe, expect, it } from "vitest";
import { portalHome, safeNextPath } from "./safe-redirect";

describe("portalHome", () => {
  it("sends admins to the admin area and everyone else to the pledge dashboard", () => {
    expect(portalHome("admin")).toBe("/portal/admin");
    expect(portalHome("pledge")).toBe("/portal");
    expect(portalHome(null)).toBe("/portal");
  });

  it("sends actives to their own read-only area, which is neither of the other two", () => {
    expect(portalHome("active")).toBe("/portal/review");
    expect(portalHome("active")).not.toBe(portalHome("admin"));
    expect(portalHome("active")).not.toBe(portalHome("pledge"));
  });
});

describe("safeNextPath", () => {
  describe("for a pledge", () => {
    it.each([
      "/portal",
      "/portal/",
      "/portal/account",
      "/portal/history",
      "/portal/forms/week2interviews",
      "/portal/forms/week2interviews/",
      "/portal/forms/a_b-c/review",
    ])("keeps the portal path %s", (next) => {
      expect(safeNextPath(next, "pledge")).toBe(next);
    });

    it.each<[string, string | null | undefined]>([
      ["null", null],
      ["undefined", undefined],
      ["an empty string", ""],
      ["a protocol-relative URL", "//evil.com"],
      ["a protocol-relative URL that mentions the portal", "//evil.com/portal"],
      ["an absolute https URL", "https://evil.com/portal"],
      ["an absolute http URL", "http://evil.com"],
      ["a javascript URL", "javascript:alert(1)"],
      ["a data URL", "data:text/html,<script>alert(1)</script>"],
      ["a backslash host", "/\\evil.com"],
      ["double backslashes", "\\\\evil.com"],
      ["a backslash inside the portal path", "/portal\\evil.com"],
      ["a backslash segment", "/portal/\\evil.com"],
      ["parent traversal", "/portal/../x"],
      ["a path ending in traversal", "/portal/.."],
      ["traversal out to the admin API", "/portal/../api/portal/admin/pledges"],
      ["encoded traversal", "/portal/%2e%2e/x"],
      ["an encoded slash", "/portal/%2F%2Fevil.com"],
      ["a query string", "/portal?next=//evil.com"],
      ["a query string on a deeper path", "/portal/forms/week1?x=1"],
      ["a fragment", "/portal#//evil.com"],
      ["an empty segment that starts a host", "/portal//evil.com"],
      ["a lookalike prefix", "/portalevil"],
      ["a lookalike prefix with a dot", "/portal.evil.com"],
      ["a userinfo trick", "/portal@evil.com"],
      ["a different capitalisation", "/Portal"],
      ["a path with no leading slash", "portal"],
      ["leading whitespace", " /portal"],
      ["trailing whitespace", "/portal "],
      ["a trailing newline", "/portal\n"],
      ["a newline followed by another URL", "/portal\n//evil.com"],
      ["a tab in the path", "/portal/\t/evil.com"],
      ["a dot in a segment", "/portal/a.b"],
      ["a space in a segment", "/portal/a b"],
      ["a colon in a segment", "/portal/https:evil.com"],
      ["a path outside the portal", "/login"],
      ["the site root", "/"],
      ["the API", "/api/portal/me"],
    ])("falls back to the dashboard for %s", (_label, next) => {
      expect(safeNextPath(next, "pledge")).toBe("/portal");
    });

    it.each(["/portal/admin", "/portal/admin/", "/portal/admin/pledges", "/portal/admin/forms/week1/responses"])(
      "falls back to the dashboard for the admin path %s",
      (next) => {
        expect(safeNextPath(next, "pledge")).toBe("/portal");
      },
    );

    it("does not mistake a path that merely starts with the word admin for the admin area", () => {
      expect(safeNextPath("/portal/administrator", "pledge")).toBe("/portal/administrator");
    });

    it.each([
      "/portal/review",
      "/portal/review/",
      "/portal/review/deliverables",
      "/portal/review/deliverables/week2interviews",
      "/portal/review/pledges/abc123",
      "/portal/review/guide",
    ])("falls back to the dashboard for the actives' path %s", (next) => {
      expect(safeNextPath(next, "pledge")).toBe("/portal");
    });

    it.each(["/portal/reviewer", "/portal/reviews", "/portal/review-old", "/portal/forms/week1/review"])(
      "does not mistake %s for the actives' area",
      (next) => {
        expect(safeNextPath(next, "pledge")).toBe(next);
      },
    );
  });

  describe("for someone whose role is not known yet", () => {
    it("keeps pledge paths", () => {
      expect(safeNextPath("/portal/forms/week1", null)).toBe("/portal/forms/week1");
    });

    it("never sends them into the admin area", () => {
      expect(safeNextPath("/portal/admin", null)).toBe("/portal");
      expect(safeNextPath("/portal/admin/pledges", null)).toBe("/portal");
    });

    it("never sends them into the actives' area either", () => {
      expect(safeNextPath("/portal/review", null)).toBe("/portal");
      expect(safeNextPath("/portal/review/deliverables/week1", null)).toBe("/portal");
      expect(safeNextPath("/portal/review/pledges/abc123", null)).toBe("/portal");
    });

    it("keeps the account page, which every role shares", () => {
      expect(safeNextPath("/portal/account", null)).toBe("/portal/account");
    });

    it("falls back to the dashboard for anything unsafe", () => {
      expect(safeNextPath("//evil.com", null)).toBe("/portal");
      expect(safeNextPath(undefined, null)).toBe("/portal");
    });
  });

  describe("for an admin", () => {
    it.each(["/portal/admin", "/portal/admin/", "/portal/admin/pledges", "/portal/admin/forms/week1/responses"])(
      "keeps the admin path %s",
      (next) => {
        expect(safeNextPath(next, "admin")).toBe(next);
      },
    );

    it("keeps the account page, which admins share with pledges", () => {
      expect(safeNextPath("/portal/account", "admin")).toBe("/portal/account");
    });

    it.each(["/portal", "/portal/", "/portal/history", "/portal/forms/week1", "/portal/administrator"])(
      "sends them to the admin area instead of the pledge page %s",
      (next) => {
        expect(safeNextPath(next, "admin")).toBe("/portal/admin");
      },
    );

    it.each<[string, string | null]>([
      ["a protocol-relative URL", "//evil.com"],
      ["traversal out of the admin area", "/portal/admin/../../evil"],
      ["a query string on an admin path", "/portal/admin?next=//evil.com"],
      ["a backslash", "/portal/admin\\evil.com"],
      ["null", null],
    ])("falls back to the admin area for %s", (_label, next) => {
      expect(safeNextPath(next, "admin")).toBe("/portal/admin");
    });

    it.each(["/portal/review", "/portal/review/", "/portal/review/deliverables", "/portal/review/pledges/abc123", "/portal/reviewer"])(
      "sends them to the admin area instead of the actives' page %s",
      (next) => {
        expect(safeNextPath(next, "admin")).toBe("/portal/admin");
      },
    );
  });

  describe("for an active", () => {
    it.each([
      "/portal/review",
      "/portal/review/",
      "/portal/review/deliverables",
      "/portal/review/deliverables/week2interviews",
      "/portal/review/deliverables/week2interviews/",
      "/portal/review/pledges/abc123",
      "/portal/review/guide",
      "/portal/review/a_b-c",
    ])("keeps the actives' path %s", (next) => {
      expect(safeNextPath(next, "active")).toBe(next);
    });

    it("keeps the account page, which actives share with everyone", () => {
      expect(safeNextPath("/portal/account", "active")).toBe("/portal/account");
    });

    it.each([
      "/portal",
      "/portal/",
      "/portal/welcome",
      "/portal/guide",
      "/portal/history",
      "/portal/history/week1",
      "/portal/deliverables/week1",
      "/portal/forms/week1",
    ])("sends them to their own area instead of the pledge page %s", (next) => {
      expect(safeNextPath(next, "active")).toBe("/portal/review");
    });

    it.each([
      "/portal/admin",
      "/portal/admin/",
      "/portal/admin/actives",
      "/portal/admin/pledges/abc123",
      "/portal/admin/forms/week1/responses",
      "/portal/admin/review",
    ])("sends them to their own area instead of the admin page %s", (next) => {
      expect(safeNextPath(next, "active")).toBe("/portal/review");
    });

    it.each(["/portal/reviewer", "/portal/reviews", "/portal/review-old", "/portal/review_2", "/portal/administrator", "/portal/accounts"])(
      "sends them to their own area instead of the lookalike %s",
      (next) => {
        expect(safeNextPath(next, "active")).toBe("/portal/review");
      },
    );

    it.each<[string, string | null | undefined]>([
      ["null", null],
      ["undefined", undefined],
      ["an empty string", ""],
      ["a protocol-relative URL", "//evil.com"],
      ["a protocol-relative URL that mentions their area", "//evil.com/portal/review"],
      ["an absolute URL to their area on another site", "https://evil.com/portal/review"],
      ["traversal out of their area into the admin area", "/portal/review/../admin"],
      ["traversal out of the portal", "/portal/review/../../evil"],
      ["encoded traversal", "/portal/review/%2e%2e/admin"],
      ["a query string on one of their paths", "/portal/review?next=//evil.com"],
      ["a fragment on one of their paths", "/portal/review#/portal/admin"],
      ["a backslash", "/portal/review\\evil.com"],
      ["an empty segment that starts a host", "/portal/review//evil.com"],
      ["a different capitalisation", "/portal/Review"],
      ["a trailing newline", "/portal/review\n"],
      ["the review API", "/api/portal/review/overview"],
      ["the site root", "/"],
    ])("falls back to their own area for %s", (_label, next) => {
      expect(safeNextPath(next, "active")).toBe("/portal/review");
    });
  });

  it("only ever returns a path that starts with /portal and has no second slash at the start", () => {
    const hostile = [
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "/portal/../../evil",
      "/portal?x=//evil.com",
      "/portal/admin",
      "/portal/review",
      "/portal/review/../admin",
      "/portal/forms/ok",
      "",
    ];
    for (const role of ["admin", "active", "pledge", null] as const) {
      for (const next of hostile) {
        const result = safeNextPath(next, role);
        expect(result).toMatch(/^\/portal(\/|$)/);
        expect(result).not.toMatch(/[\\?#.:]/);
      }
    }
  });

  it("never returns a path in another role's area, whatever is asked for", () => {
    const asked = [
      "/portal",
      "/portal/account",
      "/portal/history",
      "/portal/welcome",
      "/portal/admin",
      "/portal/admin/actives",
      "/portal/review",
      "/portal/review/deliverables/week1",
      "/portal/reviewer",
      "/portal/administrator",
      "//evil.com",
      null,
    ];
    const inAdmin = /^\/portal\/admin(\/|$)/;
    const inReview = /^\/portal\/review(\/|$)/;
    for (const next of asked) {
      expect(safeNextPath(next, "pledge"), `pledge asked for ${next}`).not.toMatch(inAdmin);
      expect(safeNextPath(next, "pledge"), `pledge asked for ${next}`).not.toMatch(inReview);
      expect(safeNextPath(next, null), `unknown role asked for ${next}`).not.toMatch(inAdmin);
      expect(safeNextPath(next, null), `unknown role asked for ${next}`).not.toMatch(inReview);
      expect(safeNextPath(next, "active"), `active asked for ${next}`).not.toMatch(inAdmin);
      expect(safeNextPath(next, "admin"), `admin asked for ${next}`).not.toMatch(inReview);
      // An admin or an active is only ever sent to the shared account page or into their own area.
      expect(safeNextPath(next, "active")).toMatch(/^\/portal\/(review(\/|$)|account$)/);
      expect(safeNextPath(next, "admin")).toMatch(/^\/portal\/(admin(\/|$)|account$)/);
    }
  });
});
