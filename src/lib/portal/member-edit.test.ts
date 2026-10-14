import { describe, expect, it } from "vitest";
import { isPreviewAddress, memberEditPatch, normalizeEmail, type MemberEditFields } from "./member-edit";
import { previewAccount } from "./preview";

const PLEDGE: MemberEditFields = {
  displayName: "Avery Chen",
  email: "avery.chen@uci.edu",
  pledgeClass: "Alpha",
  teamId: "team1",
};
const ACTIVE: MemberEditFields = { displayName: "Priya Shah", email: "priya.shah@uci.edu" };

describe("normalizeEmail", () => {
  it("trims and lower-cases an address", () => {
    expect(normalizeEmail("  Avery.Chen@UCI.EDU \n")).toBe("avery.chen@uci.edu");
  });

  it("leaves an address already in the portal's form alone", () => {
    expect(normalizeEmail("avery.chen@uci.edu")).toBe("avery.chen@uci.edu");
  });
});

describe("isPreviewAddress", () => {
  it("is true for the address the portal gives every kind of preview", () => {
    expect(isPreviewAddress(previewAccount("chair.one@uci.edu", "abc123", "pledge").email)).toBe(true);
    expect(isPreviewAddress(previewAccount("chair.one@uci.edu", "abc123", "active").email)).toBe(true);
  });

  it("is true whatever the case the address was typed in", () => {
    expect(isPreviewAddress("Chair.One+Preview-Pledge@uci.edu")).toBe(true);
  });

  it("is false for ordinary addresses, including ones with another tag", () => {
    expect(isPreviewAddress("avery.chen@uci.edu")).toBe(false);
    expect(isPreviewAddress("avery+fe@uci.edu")).toBe(false);
    expect(isPreviewAddress("preview@uci.edu")).toBe(false);
  });
});

describe("memberEditPatch", () => {
  it("is empty when nothing changed", () => {
    expect(memberEditPatch(PLEDGE, { ...PLEDGE })).toEqual({});
    expect(memberEditPatch(ACTIVE, { ...ACTIVE })).toEqual({});
  });

  it("sends a new name, trimmed", () => {
    expect(memberEditPatch(PLEDGE, { ...PLEDGE, displayName: "  Avery Lin " })).toEqual({ displayName: "Avery Lin" });
  });

  it("ignores spaces added around an unchanged name", () => {
    expect(memberEditPatch(PLEDGE, { ...PLEDGE, displayName: " Avery Chen  " })).toEqual({});
  });

  it("sends a new address in the portal's form", () => {
    expect(memberEditPatch(ACTIVE, { ...ACTIVE, email: " Priya.S@UCI.edu " })).toEqual({ email: "priya.s@uci.edu" });
  });

  it("treats a change of case or spacing in the address as no change", () => {
    expect(memberEditPatch(ACTIVE, { ...ACTIVE, email: "PRIYA.SHAH@uci.edu " })).toEqual({});
  });

  it("sends a pledge's class, trimmed, and an emptied class as empty", () => {
    expect(memberEditPatch(PLEDGE, { ...PLEDGE, pledgeClass: " Beta " })).toEqual({ pledgeClass: "Beta" });
    expect(memberEditPatch(PLEDGE, { ...PLEDGE, pledgeClass: "" })).toEqual({ pledgeClass: "" });
  });

  it("sends a team only when it was changed", () => {
    expect(memberEditPatch(PLEDGE, { ...PLEDGE, teamId: "team2" })).toEqual({ teamId: "team2" });
    expect(memberEditPatch(PLEDGE, { ...PLEDGE, displayName: "Avery Lin" })).not.toHaveProperty("teamId");
  });

  it("sends leaving a team as null", () => {
    expect(memberEditPatch(PLEDGE, { ...PLEDGE, teamId: "" })).toEqual({ teamId: null });
  });

  it("joins a team from working individually", () => {
    expect(memberEditPatch({ ...PLEDGE, teamId: "" }, { ...PLEDGE, teamId: "team3" })).toEqual({ teamId: "team3" });
  });

  it("never sends class or team for an account the form shows neither for", () => {
    const patch = memberEditPatch(ACTIVE, { ...ACTIVE, displayName: "Priya S" });
    expect(patch).toEqual({ displayName: "Priya S" });
  });

  it("has no key at all for a field left alone, so an untouched form has nothing to save", () => {
    // The dialog enables Save on the patch's keys, so a key holding undefined would count as a change.
    for (const draft of [{ ...PLEDGE }, { ...PLEDGE, displayName: " Avery Chen ", email: "AVERY.CHEN@uci.edu" }]) {
      expect(Object.keys(memberEditPatch(PLEDGE, draft))).toEqual([]);
    }
  });

  it("compares the address on record in the portal's form too", () => {
    expect(memberEditPatch({ ...ACTIVE, email: " Priya.Shah@UCI.edu" }, { ...ACTIVE, email: "priya.shah@uci.edu" })).toEqual({});
  });

  it("treats a change of case in a name as a change, unlike in an address", () => {
    expect(memberEditPatch(PLEDGE, { ...PLEDGE, displayName: "avery chen" })).toStrictEqual({ displayName: "avery chen" });
  });

  it("sends an emptied name as empty, so the server refuses it rather than it being dropped", () => {
    expect(memberEditPatch(PLEDGE, { ...PLEDGE, displayName: "   " })).toStrictEqual({ displayName: "" });
  });

  it("treats a class of only spaces as no class", () => {
    expect(memberEditPatch({ ...PLEDGE, pledgeClass: "" }, { ...PLEDGE, pledgeClass: "   " })).toStrictEqual({});
    expect(memberEditPatch(PLEDGE, { ...PLEDGE, pledgeClass: "   " })).toStrictEqual({ pledgeClass: "" });
    expect(memberEditPatch({ ...PLEDGE, pledgeClass: " Alpha " }, { ...PLEDGE, pledgeClass: "Alpha" })).toStrictEqual({});
  });

  it("reads a class and team missing from the record as empty", () => {
    const bare: MemberEditFields = { displayName: PLEDGE.displayName, email: PLEDGE.email };
    expect(memberEditPatch(bare, { ...bare, pledgeClass: "", teamId: "" })).toStrictEqual({});
    expect(memberEditPatch(bare, { ...bare, pledgeClass: "Alpha", teamId: "team1" })).toStrictEqual({
      pledgeClass: "Alpha",
      teamId: "team1",
    });
  });

  it("sends every changed field together", () => {
    expect(
      memberEditPatch(PLEDGE, {
        displayName: "Avery Lin",
        email: "avery.lin@uci.edu",
        pledgeClass: "Beta",
        teamId: "",
      }),
    ).toEqual({ displayName: "Avery Lin", email: "avery.lin@uci.edu", pledgeClass: "Beta", teamId: null });
  });
});
