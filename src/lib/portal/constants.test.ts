import { describe, expect, it } from "vitest";
import { ID_PATTERN, LOCAL_ID_PATTERN, TIMING, UCI_EMAIL_PATTERN, isLocalId } from "./constants";

// These patterns are security boundaries: ID_PATTERN decides what may be placed in a
// Firestore document path, and UCI_EMAIL_PATTERN decides who can be given an account.

describe("ID_PATTERN (ids that go into document paths)", () => {
  it.each(["a", "week2interviews", "ABCdef123", "0", "x".repeat(64), "Zk3JrT0aBcDeFgHiJkLmNoPqRsT1"])(
    "accepts %s",
    (id) => {
      expect(ID_PATTERN.test(id)).toBe(true);
    },
  );

  it.each<[string, string]>([
    ["an empty id", ""],
    ["an id of 65 characters", "x".repeat(65)],
    ["a path separator", "forms/week1"],
    ["parent traversal", ".."],
    ["a traversal path", "../users/abc"],
    ["a dot", "week1.draft"],
    ["an underscore, which separates form id from uid in response ids", "week1_uid"],
    ["a hyphen", "week-1"],
    ["a space", "week 1"],
    ["a trailing newline", "week1\n"],
    ["a leading newline", "\nweek1"],
    ["a null byte", "week1\u0000"],
    ["a percent-encoded slash", "week1%2Fx"],
    ["a non-ASCII letter", "wéek1"],
    ["a full-width digit", "week１"],
    ["Firestore's reserved form", "__name__"],
  ])("rejects %s", (_label, id) => {
    expect(ID_PATTERN.test(id)).toBe(false);
  });
});

describe("LOCAL_ID_PATTERN (question and option ids)", () => {
  it.each(["q_0a1b2c3d4e5f", "o_ffffffffffff", "q1", "A-b_C", "x".repeat(40)])("accepts %s", (id) => {
    expect(LOCAL_ID_PATTERN.test(id)).toBe(true);
  });

  it.each<[string, string]>([
    ["an empty id", ""],
    ["an id of 41 characters", "x".repeat(41)],
    ["a dot, which would be read as a nested field path", "q.title"],
    ["a slash", "q/1"],
    ["a space", "q 1"],
    ["a trailing newline", "q1\n"],
    ["a backtick", "q`1"],
    ["a square bracket", "q[0]"],
    ["a non-ASCII letter", "qé"],
    ["a leading underscore", "_q1"],
    ["a leading hyphen", "-q1"],
    ["Firestore's reserved form", "__q__"],
    ["the prototype key", "__proto__"],
  ])("rejects %s", (_label, id) => {
    expect(LOCAL_ID_PATTERN.test(id)).toBe(false);
  });
});

describe("isLocalId (ids that become keys of the stored answers)", () => {
  it.each(["q_0a1b2c3d4e5f", "o_ffffffffffff", "q1", "A-b_C", "constructor2"])("accepts %s", (id) => {
    expect(isLocalId(id)).toBe(true);
  });

  it.each(["constructor", "toString", "valueOf", "hasOwnProperty", "isPrototypeOf", "__proto__", "__q__", "q.title", ""])(
    "rejects %s, which is a key every object inherits or the pattern refuses",
    (id) => {
      expect(isLocalId(id)).toBe(false);
    },
  );

  it.each<[string, unknown]>([
    ["a number", 7],
    ["null", null],
    ["undefined", undefined],
    ["an array", ["q1"]],
  ])("rejects %s, which is not a string", (_label, id) => {
    expect(isLocalId(id)).toBe(false);
  });
});

describe("UCI_EMAIL_PATTERN (who can be given a pledge account)", () => {
  it.each(["avery.chen@uci.edu", "a@uci.edu", "peter_anteater+sep@uci.edu", "p3ter-ant%eater@uci.edu"])(
    "accepts %s",
    (email) => {
      expect(UCI_EMAIL_PATTERN.test(email)).toBe(true);
    },
  );

  it.each<[string, string]>([
    ["another domain", "avery@gmail.com"],
    ["a UCI subdomain", "avery@ics.uci.edu"],
    ["a domain that only starts with uci.edu", "avery@uci.edu.evil.example"],
    ["a domain that only ends with uci.edu", "avery@notuci.edu"],
    ["a domain where the dot is another character", "avery@uciXedu"],
    ["no local part", "@uci.edu"],
    ["two at signs", "avery@evil.example@uci.edu"],
    ["a space in the local part", "avery chen@uci.edu"],
    ["a trailing newline", "avery@uci.edu\n"],
    ["a trailing space", "avery@uci.edu "],
    ["upper case, which callers lower-case first", "Avery@UCI.EDU"],
    ["a display-name form", "Avery <avery@uci.edu>"],
    ["an empty string", ""],
  ])("rejects %s", (_label, email) => {
    expect(UCI_EMAIL_PATTERN.test(email)).toBe(false);
  });
});

describe("TIMING", () => {
  it("lets one missed heartbeat be credited in full without counting a closed laptop", () => {
    expect(TIMING.heartbeatMaxCreditSeconds * 1000).toBeGreaterThanOrEqual(TIMING.heartbeatIntervalMs);
    expect(TIMING.heartbeatMaxCreditSeconds * 1000).toBeLessThan(TIMING.sessionGapMs);
  });

  it("ignores duplicate tabs without ever ignoring a tab's own regular beat", () => {
    expect(TIMING.heartbeatMinIntervalMs).toBeLessThan(TIMING.heartbeatIntervalMs);
  });

  it("keeps a pledge shown as online across at least two heartbeats, and offline before the session ends", () => {
    expect(TIMING.onlineWindowMs).toBeGreaterThanOrEqual(2 * TIMING.heartbeatIntervalMs);
    expect(TIMING.onlineWindowMs).toBeLessThan(TIMING.sessionGapMs);
  });
});
