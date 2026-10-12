import { describe, expect, it } from "vitest";
import { ID_PATTERN, UCI_EMAIL_PATTERN } from "./constants";
import { isPreviewProfile, previewAccount } from "./preview";

/** A uid as Firebase makes one: twenty-eight letters and digits. */
const ADMIN_UID = "Kq7mN2pR8sT4vW6xY9zA1bC3dE5f";

describe("isPreviewProfile", () => {
  it("is true only for a profile whose owner is a non-empty string", () => {
    expect(isPreviewProfile({ previewOwnerUid: ADMIN_UID })).toBe(true);
    expect(isPreviewProfile({ previewOwnerUid: "x" })).toBe(true);
  });

  it.each<[string, unknown]>([
    ["no owner at all", undefined],
    ["an empty owner", ""],
    ["a null owner", null],
    ["a number", 7],
    ["true", true],
    ["a list", [ADMIN_UID]],
    ["an object", { uid: ADMIN_UID }],
  ])("is false for %s", (_label, previewOwnerUid) => {
    expect(isPreviewProfile({ previewOwnerUid })).toBe(false);
  });

  it("is false for a profile with nothing of the kind on it", () => {
    expect(isPreviewProfile({})).toBe(false);
    expect(isPreviewProfile({ previewOwnerEmail: "chair.one@uci.edu" } as { previewOwnerUid?: unknown })).toBe(false);
  });
});

describe("previewAccount", () => {
  it("names the account after the role and the admin, so each admin has one per role", () => {
    expect(previewAccount("chair.one@uci.edu", ADMIN_UID, "pledge")).toEqual({
      uid: `previewpledge${ADMIN_UID}`,
      email: "chair.one+preview-pledge@uci.edu",
      displayName: "Preview Pledge",
    });
    expect(previewAccount("chair.one@uci.edu", ADMIN_UID, "active")).toEqual({
      uid: `previewactive${ADMIN_UID}`,
      email: "chair.one+preview-active@uci.edu",
      displayName: "Preview Active",
    });
  });

  it("is the same every time, and different for two admins and for the two roles", () => {
    const one = previewAccount("chair.one@uci.edu", ADMIN_UID, "pledge");
    expect(previewAccount("chair.one@uci.edu", ADMIN_UID, "pledge")).toEqual(one);
    const two = previewAccount("chair.two@uci.edu", "anotherAdminUid123", "pledge");
    expect(two.uid).not.toBe(one.uid);
    expect(two.email).not.toBe(one.email);
    const active = previewAccount("chair.one@uci.edu", ADMIN_UID, "active");
    expect(active.uid).not.toBe(one.uid);
    expect(active.email).not.toBe(one.email);
  });

  it("makes a uid that can be a document id, whatever the admin's own uid holds", () => {
    for (const adminUid of [ADMIN_UID, "abc", "with-dashes_and.dots", "has/slash", "x".repeat(200), "ünïcödé"]) {
      for (const role of ["pledge", "active"] as const) {
        const { uid } = previewAccount("chair.one@uci.edu", adminUid, role);
        expect(uid, adminUid).toMatch(ID_PATTERN);
        expect(uid.startsWith(`preview${role}`), adminUid).toBe(true);
      }
    }
    expect(previewAccount("chair.one@uci.edu", "with-dashes_and.dots", "pledge").uid).toBe("previewpledgewithdashesanddots");
  });

  it("refuses an admin uid with nothing usable in it rather than make an id that is not one", () => {
    expect(() => previewAccount("chair.one@uci.edu", "", "pledge")).toThrow(/preview uid/);
    expect(() => previewAccount("chair.one@uci.edu", "---", "pledge")).toThrow(/preview uid/);
  });

  // The function itself does not judge the admin's domain: the server refuses to start a
  // preview for an admin outside UCI before it is ever called for one.
  it("puts the account on the UCI domain, tagged, whatever domain it is given", () => {
    for (const adminEmail of ["chair.one@uci.edu", "advisor@example.org", "Chair.One@UCI.EDU"]) {
      const { email } = previewAccount(adminEmail, ADMIN_UID, "pledge");
      expect(email, adminEmail).toMatch(UCI_EMAIL_PATTERN);
      expect(email.endsWith("+preview-pledge@uci.edu"), adminEmail).toBe(true);
    }
    expect(previewAccount("advisor@example.org", ADMIN_UID, "active").email).toBe("advisor+preview-active@uci.edu");
  });

  it("lower-cases the admin's local part and keeps only the characters an address may have", () => {
    expect(previewAccount("Chair.One@UCI.EDU", ADMIN_UID, "pledge").email).toBe("chair.one+preview-pledge@uci.edu");
    expect(previewAccount("o'neil_%-x@uci.edu", ADMIN_UID, "pledge").email).toBe("oneil_%-x+preview-pledge@uci.edu");
    expect(previewAccount("chair one@uci.edu", ADMIN_UID, "pledge").email).toBe("chairone+preview-pledge@uci.edu");
  });

  // Mail to a tagged address goes to the mailbox before the tag, so the sandbox's
  // address is made from that part alone: the admin's own mailbox, with one tag.
  it("drops a tag the admin's own address carries, so the preview's tag is the only one", () => {
    expect(previewAccount("chair.one+portal@uci.edu", ADMIN_UID, "pledge").email).toBe("chair.one+preview-pledge@uci.edu");
    expect(previewAccount("a+b@uci.edu", ADMIN_UID, "pledge").email).toBe("a+preview-pledge@uci.edu");
    expect(previewAccount("a+b+c@uci.edu", ADMIN_UID, "active").email).toBe("a+preview-active@uci.edu");
    expect(previewAccount("chair.one+preview-pledge@uci.edu", ADMIN_UID, "pledge").email).toBe("chair.one+preview-pledge@uci.edu");
  });

  it("falls back to a plain name when nothing of the local part can be kept", () => {
    expect(previewAccount("+@uci.edu", ADMIN_UID, "pledge").email).toBe("admin+preview-pledge@uci.edu");
    expect(previewAccount("+b@uci.edu", ADMIN_UID, "pledge").email).toBe("admin+preview-pledge@uci.edu");
    expect(previewAccount("@uci.edu", ADMIN_UID, "active").email).toBe("admin+preview-active@uci.edu");
  });
});
