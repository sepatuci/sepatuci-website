import { describe, expect, it } from "vitest";
import { PORTAL_LABEL, ROLE_DESCRIPTION, ROLE_HOME, areaAllows } from "./roles";
import type { Role } from "./types";

const ROLES: readonly Role[] = ["admin", "active", "pledge"];

/** Which roles a path belongs to, in the order admin, active, pledge. */
type Allowed = readonly [admin: boolean, active: boolean, pledge: boolean];
const ADMIN_ONLY: Allowed = [true, false, false];
const ACTIVE_ONLY: Allowed = [false, true, false];
const PLEDGE_ONLY: Allowed = [false, false, true];
const EVERYONE: Allowed = [true, true, true];
const NOBODY: Allowed = [false, false, false];

const allowedFor = (pathname: string): Allowed =>
  [areaAllows("admin", pathname), areaAllows("active", pathname), areaAllows("pledge", pathname)] as const;

describe("areaAllows", () => {
  describe("the admin area", () => {
    it.each([
      "/portal/admin",
      "/portal/admin/",
      "/portal/admin/actives",
      "/portal/admin/activity",
      "/portal/admin/forms",
      "/portal/admin/forms/week2interviews",
      "/portal/admin/guide",
      "/portal/admin/pledges/abc123",
      "/portal/admin/teams",
      // Not pages that exist, but still inside the area: nobody else may be sent there.
      "/portal/admin/review",
      "/portal/admin/account",
    ])("%s belongs to admins alone", (pathname) => {
      expect(allowedFor(pathname)).toEqual(ADMIN_ONLY);
    });
  });

  describe("the actives' area", () => {
    it.each([
      "/portal/review",
      "/portal/review/",
      "/portal/review/deliverables",
      "/portal/review/deliverables/week2interviews",
      "/portal/review/guide",
      "/portal/review/pledges/abc123",
      "/portal/review/admin",
      "/portal/review/account",
    ])("%s belongs to actives alone", (pathname) => {
      expect(allowedFor(pathname)).toEqual(ACTIVE_ONLY);
    });
  });

  describe("the pledge area: the rest of the portal", () => {
    it.each([
      "/portal",
      "/portal/",
      "/portal/welcome",
      "/portal/guide",
      "/portal/history",
      "/portal/history/week2interviews",
      "/portal/deliverables/week2interviews",
      "/portal/some-page-added-later",
    ])("%s belongs to pledges alone", (pathname) => {
      expect(allowedFor(pathname)).toEqual(PLEDGE_ONLY);
    });

    it.each([
      // Deeper segments named after another role's area do not move a page into it.
      "/portal/deliverables/admin",
      "/portal/deliverables/review",
      "/portal/history/review/admin",
    ])("%s is still a pledge page, though a later segment names another area", (pathname) => {
      expect(allowedFor(pathname)).toEqual(PLEDGE_ONLY);
    });
  });

  describe("the shared account page", () => {
    it("is open to all three roles", () => {
      expect(allowedFor("/portal/account")).toEqual(EVERYONE);
    });

    it("is the only page they share: the welcome tour and the guides each belong to one role", () => {
      expect(allowedFor("/portal/welcome")).toEqual(PLEDGE_ONLY);
      expect(allowedFor("/portal/guide")).toEqual(PLEDGE_ONLY);
      expect(allowedFor("/portal/admin/guide")).toEqual(ADMIN_ONLY);
      expect(allowedFor("/portal/review/guide")).toEqual(ACTIVE_ONLY);
    });

    it.each(["/portal/accounts", "/portal/account-settings", "/portal/accountant"])(
      "does not extend to the lookalike %s, which is an ordinary pledge path",
      (pathname) => {
        expect(allowedFor(pathname)).toEqual(PLEDGE_ONLY);
      },
    );
  });

  describe("lookalikes of another role's area", () => {
    it.each([
      "/portal/reviewer",
      "/portal/reviews",
      "/portal/review-old",
      "/portal/review_2",
      "/portal/reviewdeliverables",
      "/portal/administrator",
      "/portal/admins",
      "/portal/admin-tools",
      "/portal/admin_2",
      "/portal/adminforms",
    ])("%s only starts with the name of an area, so it is an ordinary pledge path", (pathname) => {
      expect(allowedFor(pathname)).toEqual(PLEDGE_ONLY);
    });

    it.each(["/portal/Admin", "/portal/ADMIN/pledges", "/portal/Review", "/portal/REVIEW/guide"])(
      "%s differs in case, so it is not the area it resembles",
      (pathname) => {
        expect(areaAllows("admin", pathname)).toBe(false);
        expect(areaAllows("active", pathname)).toBe(false);
      },
    );
  });

  describe("outside the portal", () => {
    it.each([
      "",
      "/",
      "/login",
      "/login/reset",
      "/api/portal/me",
      "/api/portal/review/overview",
      "/api/portal/admin/pledges",
      "/admin",
      "/review",
      "/account",
      "/portalx",
      "/portal-admin",
      "/portal.admin",
      "/Portal",
      "/Portal/admin",
      "portal",
      "portal/admin",
      "portal/review",
      " /portal",
      "//portal/admin",
      "/blog/portal/review",
    ])("%j belongs to nobody", (pathname) => {
      expect(allowedFor(pathname)).toEqual(NOBODY);
    });
  });

  it("puts every path under /portal in exactly one role's area, apart from the shared account page", () => {
    const paths = [
      "/portal",
      "/portal/welcome",
      "/portal/guide",
      "/portal/history",
      "/portal/deliverables/a",
      "/portal/admin",
      "/portal/admin/forms/a",
      "/portal/review",
      "/portal/review/pledges/a",
      "/portal/reviewer",
      "/portal/administrator",
    ];
    for (const pathname of paths) {
      const owners = ROLES.filter((role) => areaAllows(role, pathname));
      expect(owners, pathname).toHaveLength(1);
    }
    expect(ROLES.filter((role) => areaAllows(role, "/portal/account"))).toEqual(ROLES);
  });
});

describe("ROLE_HOME", () => {
  it("lands each role on a different page", () => {
    expect(ROLE_HOME).toEqual({ admin: "/portal/admin", active: "/portal/review", pledge: "/portal" });
    expect(new Set(Object.values(ROLE_HOME)).size).toBe(ROLES.length);
  });

  it.each(ROLES)("lands the %s role inside its own area and in nobody else's", (role) => {
    for (const other of ROLES) {
      expect(areaAllows(other, ROLE_HOME[role]), `${other} at the ${role} home`).toBe(other === role);
    }
  });
});

describe("the wording for each role", () => {
  // A copied entry would show one role another's label in the header or on the Account page.
  it("has a header label and an account description for every role, none of them shared or blank", () => {
    for (const table of [PORTAL_LABEL, ROLE_DESCRIPTION]) {
      expect(Object.keys(table).sort()).toEqual([...ROLES].sort());
      const wording = ROLES.map((role) => table[role]);
      expect(wording.every((text) => text.trim().length > 0)).toBe(true);
      expect(new Set(wording).size).toBe(ROLES.length);
    }
  });
});
