import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH } from "./constants";
import {
  PASSWORD_MAX_LENGTH,
  TEMPORARY_REUSED,
  checkPassword,
  looksTemporary,
  normaliseTemporary,
  passwordProblem,
  temporaryCandidates,
  temporaryPassword,
  type PasswordCheck,
  type PasswordOwner,
  type PasswordRuleId,
} from "./password";

const AVERY: PasswordOwner = { email: "avery.chen@uci.edu", displayName: "Avery Chen" };
const JORDAN: PasswordOwner = { email: "jordan.patel@uci.edu", displayName: "Jordan Patel" };

const TOO_SHORT = "Use at least 10 characters.";
const TOO_LONG = "Use no more than 128 characters.";
const PERSONAL = "Leave your name and email out of your password.";
const EASY = "That password is too easy to guess. Try a few unrelated words.";
const TEMPORARY = "Choose your own password, not the temporary one.";

/** A temporary password as a chair would hand one out, and another of the same kind. */
const ISSUED = "K7QM-2XRT-9BHD";
const ANOTHER_ISSUED = "W4PN-8GZC-3FJY";

// ── Passwords of an exact length and an exact mix of characters ──────────────

type Kind = "lower" | "upper" | "digit" | "symbol";
const SOURCES: Record<Kind, { characters: string; stride: number }> = {
  // Each stride shares no factor with its length, so every character is used before any comes round again.
  lower: { characters: "abcdefghijklmnopqrstuvwxyz", stride: 7 },
  upper: { characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", stride: 11 },
  digit: { characters: "0123456789", stride: 3 },
  symbol: { characters: "!#$%&*+?@^_~", stride: 5 },
};

/**
 * A password of exactly `length` characters that takes its kinds of character
 * in turn. Nothing in it repeats within ten characters of a kind, so it is
 * never a repeated pattern and never one of the common passwords.
 */
function mixed(length: number, kinds: readonly Kind[]): string {
  let password = "";
  for (let index = 0; index < length; index += 1) {
    const { characters, stride } = SOURCES[kinds[index % kinds.length]];
    password += characters[(Math.floor(index / kinds.length) * stride) % characters.length];
  }
  return password;
}

const MIXES: ReadonlyArray<[string, readonly Kind[]]> = [
  ["lower case only", ["lower"]],
  ["digits only", ["digit"]],
  ["lower case and digits", ["lower", "digit"]],
  ["upper and lower case", ["upper", "lower"]],
  ["lower case, upper case and digits", ["lower", "upper", "digit"]],
  ["all four kinds", ["lower", "upper", "digit", "symbol"]],
];

const ruleOf = (check: PasswordCheck, id: PasswordRuleId): boolean => {
  const rule = check.rules.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`No rule called ${id}.`);
  return rule.met;
};
const met = (check: PasswordCheck): Record<string, boolean> => Object.fromEntries(check.rules.map((rule) => [rule.id, rule.met]));
const idsOf = (check: PasswordCheck): PasswordRuleId[] => check.rules.map((rule) => rule.id);
const unmet = (check: PasswordCheck): PasswordRuleId[] => check.rules.filter((rule) => !rule.met).map((rule) => rule.id);

/** Bytes that look random and are the same on every run. */
function scrambled(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state >>> 24;
  };
}

describe("the passwords these tests are built from", () => {
  it("have the length and the kinds of character asked for, and repeat nothing", () => {
    expect(mixed(10, ["lower", "digit"])).toBe("a0h3o6v9c2");
    for (const [label, kinds] of MIXES) {
      for (const length of [10, 16, 64, PASSWORD_MAX_LENGTH, PASSWORD_MAX_LENGTH + 1]) {
        const password = mixed(length, kinds);
        expect(password, label).toHaveLength(length);
        expect(/[a-z]/.test(password), label).toBe(kinds.includes("lower"));
        expect(/[A-Z]/.test(password), label).toBe(kinds.includes("upper"));
        expect(/\d/.test(password), label).toBe(kinds.includes("digit"));
        expect(/[^A-Za-z0-9]/.test(password), label).toBe(kinds.includes("symbol"));
        expect(/^(.{1,8})\1+$/.test(password), label).toBe(false);
      }
    }
  });

  it("meet every rule at every length a password may have, so that only what a test adds is ever wrong with one", () => {
    for (const [label, kinds] of MIXES) {
      for (let length = PASSWORD_MIN_LENGTH; length <= PASSWORD_MAX_LENGTH; length += 1) {
        const check = checkPassword(mixed(length, kinds));
        expect(unmet(check), `${label}, ${length} characters`).toEqual([]);
        expect(idsOf(check), `${label}, ${length} characters`).toEqual(["length", "not_personal", "not_common"]);
      }
    }
  });
});

describe("checkPassword", () => {
  describe("what it returns", () => {
    it("lists the three rules in the order the checklist shows them, each with its wording", () => {
      const check = checkPassword("correct-horse-battery");
      expect(check.rules.map((rule) => rule.id)).toEqual(["length", "not_personal", "not_common"]);
      expect(check.rules.map((rule) => rule.label)).toEqual([
        `At least ${PASSWORD_MIN_LENGTH} characters`,
        "Doesn't contain your name or email",
        "Not a common or repeated pattern",
      ]);
      expect(Object.keys(check).sort()).toEqual(["ok", "rules", "strength", "strengthLabel"]);
    });

    it("is ok exactly when every rule is met", () => {
      expect(checkPassword("correct-horse-battery", AVERY)).toMatchObject({ ok: true });
      expect(met(checkPassword("correct-horse-battery", AVERY))).toEqual({ length: true, not_personal: true, not_common: true });

      // One rule at a time.
      for (const [password, owner, broken] of [
        ["kite-42-x", AVERY, "length"],
        ["avery-flies-kites-42", AVERY, "not_personal"],
        ["password123", AVERY, "not_common"],
        [ISSUED, AVERY, "not_temporary"],
        ["K7QM2XRT9BHD", { ...AVERY, temporary: ISSUED }, "not_temporary"],
      ] as const) {
        const check = checkPassword(password, owner);
        expect(check.ok, password).toBe(false);
        expect(unmet(check), password).toEqual([broken]);
      }
    });

    it("ticks nothing before anything has been typed", () => {
      for (const owner of [{}, AVERY]) {
        expect(checkPassword("", owner)).toEqual({
          ok: false,
          rules: [
            { id: "length", label: "At least 10 characters", met: false },
            { id: "not_personal", label: "Doesn't contain your name or email", met: false },
            { id: "not_common", label: "Not a common or repeated pattern", met: false },
          ],
          strength: 0,
          strengthLabel: "Too weak",
        });
      }
      // Nor the fourth rule, for someone replacing a temporary password.
      for (const temporary of [true, ISSUED] as const) {
        const check = checkPassword("", { ...AVERY, temporary });
        expect(check.rules.map((rule) => [rule.id, rule.met])).toEqual([
          ["length", false],
          ["not_personal", false],
          ["not_common", false],
          ["not_temporary", false],
        ]);
        expect(check).toMatchObject({ ok: false, strength: 0, strengthLabel: "Too weak" });
      }
    });

    it("needs no owner: without one, nothing counts as personal", () => {
      expect(checkPassword("avery-flies-kites-42").ok).toBe(true);
      expect(checkPassword("avery-flies-kites-42", {}).ok).toBe(true);
      expect(checkPassword("avery-flies-kites-42", { email: null, displayName: null }).ok).toBe(true);
      expect(checkPassword("avery-flies-kites-42", { email: "", displayName: "" }).ok).toBe(true);
    });

    it("lets a passphrase of ordinary words through, spaces and all", () => {
      for (const owner of [{}, AVERY, { ...AVERY, temporary: true as const }, { ...AVERY, temporary: ISSUED }]) {
        const check = checkPassword("correct horse battery staple", owner);
        expect(unmet(check)).toEqual([]);
        expect(check).toMatchObject({ ok: true, strength: 4, strengthLabel: "Very strong" });
      }
    });
  });

  describe("length", () => {
    it("is at least 10 and no more than 128", () => {
      expect(PASSWORD_MIN_LENGTH).toBe(10);
      expect(PASSWORD_MAX_LENGTH).toBe(128);
    });

    it.each<[number, boolean]>([
      [1, false],
      [9, false],
      [10, true],
      [11, true],
      [127, true],
      [128, true],
      [129, false],
      [500, false],
    ])("%i characters: met is %s", (length, expected) => {
      for (const [label, kinds] of MIXES) {
        const check = checkPassword(mixed(length, kinds));
        expect(ruleOf(check, "length"), label).toBe(expected);
        // Nothing else is wrong with these, so the length alone decides. Fewer than three
        // different characters is a repeated pattern whatever the length.
        if (length >= 3) expect(check.ok, label).toBe(expected);
      }
    });

    it("counts spaces and symbols like any other character", () => {
      expect(ruleOf(checkPassword("nine char"), "length")).toBe(false);
      expect(ruleOf(checkPassword("ten chars!"), "length")).toBe(true);
      expect(ruleOf(checkPassword(" 8 chars  "), "length")).toBe(true);
    });
  });

  describe("the owner's own name and email", () => {
    it.each<[string, string]>([
      ["their first name", "avery-flies-kites-42"],
      ["their last name, which is four letters, as a word of its own", "kites-for-chen-42"],
      ["the whole of their address before the at sign", "x-avery.chen-x-42"],
      ["their name in capitals", "AVERY-flies-kites-42"],
      ["their name in mixed case", "kites-for-cHeN-42"],
      ["their first name run into other words", "xxaveryxx-kites-42"],
      ["their last name at the very start", "chen-kites-and-tea"],
      ["their last name at the very end", "kites-and-tea-42-chen"],
    ])("refuses a password that contains %s", (_label, password) => {
      const check = checkPassword(password, AVERY);
      expect(met(check)).toEqual({ length: true, not_personal: false, not_common: true });
      expect(check.ok).toBe(false);
      // The same password is fine for somebody else.
      expect(checkPassword(password, JORDAN).ok).toBe(true);
    });

    it("goes by the name alone when there is no email, and by the email alone when there is no name", () => {
      expect(ruleOf(checkPassword("avery-flies-kites-42", { displayName: "Avery Chen" }), "not_personal")).toBe(false);
      expect(ruleOf(checkPassword("avery-flies-kites-42", { email: "avery.chen@uci.edu" }), "not_personal")).toBe(false);
      expect(ruleOf(checkPassword("kites-for-chen-42", { email: "AVERY.CHEN@UCI.EDU" }), "not_personal")).toBe(false);
    });

    describe("a word of five letters or more", () => {
      it("is caught anywhere in the password, with or without anything around it", () => {
        // "Patel" is exactly five letters.
        for (const password of ["patel-flies-kites-42", "kites-for-patel-42", "xpatelx-kites-tea-42", "kitespatelkites-42", "PATELkites-and-tea", "kites4patel2-tea-42"]) {
          expect(ruleOf(checkPassword(password, JORDAN), "not_personal"), password).toBe(false);
        }
        // "Jordan" is six.
        for (const password of ["myjordanshoes-42", "kites-JORDAN-tea-42"]) {
          expect(ruleOf(checkPassword(password, JORDAN), "not_personal"), password).toBe(false);
        }
      });

      it("is not caught when a letter of it is missing or something splits it", () => {
        for (const password of ["pate-flies-kites-42", "pat-el-flies-kites", "jorda-flies-kites-42", "jor.dan-flies-kites"]) {
          expect(ruleOf(checkPassword(password, JORDAN), "not_personal"), password).toBe(true);
        }
      });
    });

    describe("a word of three or four letters", () => {
      const CHEN: PasswordOwner = { displayName: "Avery Chen" };
      const TRAN: PasswordOwner = { displayName: "Casey Tran" };
      const KING: PasswordOwner = { displayName: "Morgan King" };
      const SAM: PasswordOwner = { email: "sam.lee@uci.edu", displayName: "Sam Lee" };

      it.each<[string, PasswordOwner, string]>([
        ["Chen may use kitchen", CHEN, "kitchen-sink-yellow"],
        ["Chen may use chenille", CHEN, "chenille-rug-yellow"],
        ["Tran may use transit", TRAN, "transit-yellow-moon"],
        ["Tran may use entrance", TRAN, "entrance-yellow-moon"],
        ["King may use walking", KING, "walking-yellow-moon"],
        ["King may use kingdom", KING, "kingdom-yellow-moon"],
        ["Sam may use same", SAM, "same-sleet-again-42"],
        ["Lee may use sleet and fleet", SAM, "sleet-fleet-yellow"],
        ["Sam Lee may run the two together, which is no word of theirs", SAM, "samlee-flies-kites"],
      ])("is not caught inside a longer word: %s", (_label, owner, password) => {
        const check = checkPassword(password, owner);
        expect(unmet(check)).toEqual([]);
        expect(check.ok).toBe(true);
      });

      it.each<[string, PasswordOwner, string]>([
        ["chen at the start", CHEN, "chen-sink-yellow-moon"],
        ["chen in the middle", CHEN, "yellow-chen-moon-kite"],
        ["chen at the end", CHEN, "yellow-moon-kite-chen"],
        ["chen between spaces", CHEN, "yellow chen moon kite"],
        ["chen between digits, which end a word like any symbol", CHEN, "kites4chen2go-and-tea"],
        ["chen in capitals", CHEN, "yellow-CHEN-moon-kite"],
        ["tran split off from the rest of transit", TRAN, "tran-sit-yellow-moon"],
        ["king before a longer word", KING, "king-walking-yellow"],
        ["sam, which is three letters", SAM, "sam-flies-kites-42"],
        ["lee, which is three letters", SAM, "kites-for-lee-42"],
        ["both halves of a short address, either side of its dot", SAM, "sam.lee-flies-kites"],
      ])("is caught as a word of its own: %s", (_label, owner, password) => {
        const check = checkPassword(password, owner);
        expect(unmet(check)).toEqual(["not_personal"]);
      });

      it("counts for three letters and for four, and not for two", () => {
        const bo: PasswordOwner = { email: "bo.wynn@uci.edu", displayName: "Bo Wynn" };
        expect(ruleOf(checkPassword("kites-for-wynn-42", bo), "not_personal")).toBe(false);
        expect(ruleOf(checkPassword("kites-for-wyn-42-x", bo), "not_personal")).toBe(true);
        // "bo" is too short to count: it turns up everywhere.
        expect(ruleOf(checkPassword("bo-flies-kites-42", bo), "not_personal")).toBe(true);
        expect(ruleOf(checkPassword("rainbow-kites-42", bo), "not_personal")).toBe(true);

        const three: PasswordOwner = { displayName: "Ann Xu" };
        expect(ruleOf(checkPassword("kites-for-ann-42", three), "not_personal")).toBe(false);
        expect(ruleOf(checkPassword("annual-kites-tea", three), "not_personal")).toBe(true);
        expect(ruleOf(checkPassword("xu-flies-kites-42", three), "not_personal")).toBe(true);
      });
    });

    describe("a name of several parts", () => {
      it("is caught by either half of a hyphenated name", () => {
        const owner: PasswordOwner = { displayName: "Mary-Jane Smith-Jones" };
        for (const password of ["kites-for-mary-42", "kites-for-jane-42", "kites-for-smith-42", "kites-for-jones-42", "xjonesx-kites-tea", "smithereens-kite-42"]) {
          expect(ruleOf(checkPassword(password, owner), "not_personal"), password).toBe(false);
        }
        // The short halves only as words of their own.
        for (const password of ["rosemary-kites-tea", "janet-flies-kites-42"]) {
          expect(ruleOf(checkPassword(password, owner), "not_personal"), password).toBe(true);
        }
      });

      it("takes every word of a longer name, however it is spaced", () => {
        const owner: PasswordOwner = { email: null, displayName: "  Maria   Elena de la Cruz " };
        for (const word of ["maria", "ELENA", "Cruz"]) {
          expect(ruleOf(checkPassword(`kites-${word}-tea-42`, owner), "not_personal"), word).toBe(false);
        }
        // "de" and "la" are too short to count: they turn up in ordinary words.
        expect(ruleOf(checkPassword("delaware-ladder-42", owner), "not_personal")).toBe(true);
        expect(ruleOf(checkPassword("de-la-kites-tea-42", owner), "not_personal")).toBe(true);
      });

      it("splits a name at anything that is not a letter: an apostrophe, a full stop, a digit", () => {
        const owner: PasswordOwner = { displayName: "Siobhán O'Neil Jr. 3rd" };
        expect(ruleOf(checkPassword("kites-for-neil-42", owner), "not_personal")).toBe(false);
        expect(ruleOf(checkPassword("kites-for-siobhán-42", owner), "not_personal")).toBe(false);
        // Neither "o", "jr" nor "rd" is long enough to count.
        expect(ruleOf(checkPassword("jr-rd-o-kites-tea-42", owner), "not_personal")).toBe(true);
      });

      it("keeps the letters of other alphabets and their accents as letters", () => {
        const owner: PasswordOwner = { displayName: "María-José Núñez" };
        expect(ruleOf(checkPassword("kites-for-núñez-42", owner), "not_personal")).toBe(false);
        expect(ruleOf(checkPassword("kites-for-JOSÉ-42", owner), "not_personal")).toBe(false);
        expect(ruleOf(checkPassword("xjoséx-kites-tea-42", owner), "not_personal")).toBe(true);
      });
    });

    describe("the address before the at sign", () => {
      it("is taken apart at dots, underscores, plus signs, hyphens and digits", () => {
        const owner: PasswordOwner = { email: "morgan_oneil+rush-team@uci.edu", displayName: null };
        for (const part of ["morgan", "oneil", "rush", "team"]) {
          expect(ruleOf(checkPassword(`kites-${part}-tea-42`, owner), "not_personal"), part).toBe(false);
        }
        expect(ruleOf(checkPassword("kites-and-tea-42", owner), "not_personal")).toBe(true);
        // The long parts anywhere, the short ones only as words of their own.
        expect(ruleOf(checkPassword("xmorganx-kites-tea", owner), "not_personal")).toBe(false);
        expect(ruleOf(checkPassword("crushing-steamer-42", owner), "not_personal")).toBe(true);

        const numbered: PasswordOwner = { email: "jsmith12@uci.edu" };
        expect(ruleOf(checkPassword("xjsmithx-kites-tea", numbered), "not_personal")).toBe(false);
        expect(ruleOf(checkPassword("kites-jsmith12-tea", numbered), "not_personal")).toBe(false);
      });

      it("counts as a whole as well, where none of its parts is long enough to", () => {
        // Parts of two letters each, so only the address itself can be what is caught.
        const owner: PasswordOwner = { email: "al.xu.42@uci.edu" };
        expect(ruleOf(checkPassword("kites-al.xu.42-tea", owner), "not_personal")).toBe(false);
        expect(ruleOf(checkPassword("KITES-AL.XU.42-TEA", owner), "not_personal")).toBe(false);
        expect(ruleOf(checkPassword("kites-al-xu-42-tea", owner), "not_personal")).toBe(true);
        expect(ruleOf(checkPassword("kites-alxu42-tea-9", owner), "not_personal")).toBe(true);
      });

      // An address of three or four characters with a digit or a dot in it is never caught at
      // all (password.ts:104-110). A short word is only looked for among the password's runs
      // of letters, and no run of letters can be "ab12".
      it("counts as a whole when it is short and not all letters, standing as a word of its own", () => {
        expect(ruleOf(checkPassword("ab12-yellow-moon", { email: "ab12@uci.edu" }), "not_personal")).toBe(false);
        expect(ruleOf(checkPassword("yellow-moon-j.li", { email: "j.li@uci.edu" }), "not_personal")).toBe(false);
      });

      it("does not count the part of the address after the at sign", () => {
        expect(ruleOf(checkPassword("kites-at-uci.edu-42", AVERY), "not_personal")).toBe(true);
        expect(ruleOf(checkPassword("uci-edu-kites-tea-42", AVERY), "not_personal")).toBe(true);
      });
    });
  });

  describe("common and repeated patterns", () => {
    it.each([
      "password123",
      "password1234",
      "passwordpassword",
      "1234567890",
      "0123456789",
      "qwertyuiop",
      "iloveyou123",
      "letmein12345",
      "welcome12345",
      "anteater123",
      "zotzotzot1",
      "ucirvine123",
      "sigmaetapi1",
      "changeme123",
      "trustno1trustno1",
      // The password every account in the local demo has.
      "portal-demo-1",
    ])("refuses %s", (password) => {
      const check = checkPassword(password);
      expect(met(check)).toEqual({ length: true, not_personal: true, not_common: false });
      expect(check.ok).toBe(false);
    });

    it("refuses them in any case", () => {
      for (const password of ["PASSWORD123", "Password123", "QwErTyUiOp", "Portal-Demo-1", "ZOTZOTZOT1", "Welcome12345", "ANTEATER123"]) {
        expect(ruleOf(checkPassword(password), "not_common"), password).toBe(false);
      }
    });

    // What a chair is told will be refused, and what will not.
    describe("the passwords the rule is there for", () => {
      it.each([
        "P@ssw0rd2026",
        "1q2w3e4r5t",
        "1qaz2wsx3edc",
        "qazwsxedcrfv",
        "baseball123",
        "sunshine123",
        "princess123",
        "starwars123",
        "aabbccddee",
        "FoundersEducation",
        "pledgeclass1",
        "Welcome2026x",
      ])("refuses %s", (password) => {
        const check = checkPassword(password);
        expect(unmet(check)).toEqual(["not_common"]);
        expect(check).toMatchObject({ ok: false, strength: 1, strengthLabel: "Weak" });
        expect(passwordProblem(password)).toBe(EASY);
        // In any case, and whoever is asking.
        expect(unmet(checkPassword(password.toUpperCase(), AVERY))).toEqual(["not_common"]);
        expect(unmet(checkPassword(password.toLowerCase(), { ...JORDAN, temporary: true }))).toEqual(["not_common"]);
      });

      it.each(["maple-harbor-violin-42", "happy-beach-22", "correct horse battery staple", "quiet-lantern-orbit-77", "transit-yellow-moon"])("accepts %s", (password) => {
        for (const owner of [{}, AVERY, JORDAN, { displayName: "Casey Tran" }, { ...AVERY, temporary: true as const }, { ...AVERY, temporary: ISSUED }]) {
          const check = checkPassword(password, owner);
          expect(unmet(check), JSON.stringify(owner)).toEqual([]);
          expect(check.ok, JSON.stringify(owner)).toBe(true);
          expect(passwordProblem(password, owner), JSON.stringify(owner)).toBeNull();
        }
      });
    });

    describe("a word that is on everyone's list", () => {
      it.each<[string, string[]]>([
        ["password", ["password123-and-a-kite", "my-Password-for-kites", "kitespasswordkites"]],
        ["qwerty", ["xqwertyuiop", "kites-qwerty-tea-42"]],
        ["letmein", ["kite-letmein-kite", "LetMeIn-kites-42"]],
        ["iloveyou", ["iloveyou-kites-42", "kites-ILoveYou-tea"]],
        ["123456", ["kite-123456-kite", "kites-and-tea-123456"]],
        ["abc123", ["kite-abc123-kite", "ABC123-kites-tea"]],
        ["zotzot", ["zotzot-kites-tea", "kites-ZotZot-tea-42"]],
        ["1q2w3e", ["1q2w3e4r5t", "kites-1Q2W3E-tea"]],
        ["1qaz2wsx", ["1qaz2wsx3edc", "kites-1QAZ2WSX-tea"]],
        ["qazwsx", ["qazwsxedcrfv", "kites-QazWsx-tea"]],
        ["zaq1", ["zaq12wsx-kites", "kites-ZAQ1-tea-x"]],
        ["founderseducation", ["FoundersEducation", "founderseducation-kites", "my-FOUNDERSEDUCATION-42"]],
        ["sigmaetapi", ["sigmaetapi1-kites", "SigmaEtaPi-kites-42", "kites-sigmaetapi"]],
        ["pledgeclass", ["pledgeclass1", "my-PledgeClass-kites", "pledgeclass-lambda"]],
      ])("refuses a password with %s anywhere in it, whatever is added around it", (_word, passwords) => {
        for (const password of passwords) {
          const check = checkPassword(password);
          expect(unmet(check), password).toEqual(["not_common"]);
        }
      });

      it("does not refuse a word that stops one character short of one of them, or is split in two", () => {
        for (const password of [
          "passwor-kites-tea",
          "qwert-kites-tea-9",
          "letmei-kites-tea-9",
          "iloveyo-kites-tea",
          "12345-kites-tea-x",
          "abc12-kites-tea-x",
          "zotzo-kites-tea-9",
          "1q2w3-kites-tea-x",
          "1qaz2ws-kites-tea",
          "qazws-kites-tea-9",
          "zaq-kites-and-tea",
          "founderseducatio-kites",
          "sigmaetap-kites-tea",
          "pledgeclas-kites-tea",
          "pass-word-kites-42",
          "zot-zot-kites-tea",
          "founders-education-kites",
          "sigma-eta-pi-kites",
          "pledge-class-kites",
        ]) {
          expect(unmet(checkPassword(password)), password).toEqual([]);
        }
      });

      // The usual stand-ins are read as the letters they replace: @ for a, 0 for o, 3 for e,
      // $ and 5 for s, and 1, ! and | for i.
      it.each<[string, string]>([
        ["an at sign for a and a nought for o", "P@ssw0rd2026"],
        ["a nought for o alone", "my-Passw0rd-for-kites"],
        ["fives for s", "pa55word-kites-tea"],
        ["dollar signs for s", "pa$$word-kites-tea"],
        ["every stand-in at once", "p@$5w0rd-kites-tea"],
        ["a three for e", "qw3rty-kites-tea-9"],
        ["a three and ones", "l3tm31n-kites-tea"],
        ["an exclamation mark for i", "!loveyou-kites-42"],
        ["a bar for i, and noughts and a three", "|l0v3y0u-kites-42"],
        ["noughts in the anteater's call", "z0tz0t-kites-tea"],
        ["stand-ins all through the programme's name", "F0und3rs3duc@t10n"],
        ["stand-ins all through the chapter's name", "S1gm@3t@P1-kites"],
        ["stand-ins in a pledge class", "pl3dg3cl@$$-kite"],
      ])("refuses one of them written with %s", (_label, password) => {
        const check = checkPassword(password);
        expect(unmet(check)).toEqual(["not_common"]);
        expect(passwordProblem(password)).toBe(EASY);
      });

      it("does not refuse a password just for having those symbols and digits in it", () => {
        for (const password of ["maple-harbor-violin-42", "quiet-lantern-orbit-77", "c0rrect-h0rse-b@ttery", "0range-kite-51-tea!", "$ilver|kite!3-harbor", "tea@5-kites@10-moon"]) {
          expect(unmet(checkPassword(password)), password).toEqual([]);
        }
      });
    });

    it("refuses the short list only as it stands: one of them inside something longer is judged on its own", () => {
      for (const password of ["anteater123-and-a-kite", "my-portal-demo-1", "changeme123-kite", "welcome12345-kite", "ucirvine123-and-tea", "trustno1-and-a-kite"]) {
        expect(unmet(checkPassword(password)), password).toEqual([]);
      }
    });

    it.each<[string, string]>([
      ["one character over and over", "aaaaaaaaaaaa"],
      ["two characters taking turns", "abababababab"],
      ["two characters in two runs", "aaaaaabbbbbb"],
      ["two digits", "1212121212"],
      ["a chunk of two", "x7x7x7x7x7x7"],
      ["a chunk of three", "abcabcabcabc"],
      ["a chunk of three with a symbol in it", "a1!a1!a1!a1!"],
      ["a chunk of four, the longest that counts", "abcdabcdabcd"],
      ["a chunk of four, in a longer password", "Zx9!Zx9!Zx9!Zx9!Zx9!"],
    ])("refuses %s", (_label, password) => {
      const check = checkPassword(password);
      expect(met(check)).toEqual({ length: true, not_personal: true, not_common: false });
      expect(check.ok).toBe(false);
    });

    it("refuses any password made of no more than two different characters, and not one made of three", () => {
      expect(ruleOf(checkPassword("aaaaaaaaab"), "not_common")).toBe(false);
      expect(ruleOf(checkPassword("abbabaabba"), "not_common")).toBe(false);
      expect(ruleOf(checkPassword("abcacbbcab"), "not_common")).toBe(true);
    });

    it("does not call a chunk of five a repeated pattern, or a pattern that stops short of the end", () => {
      expect(ruleOf(checkPassword("akmtxakmtxakmtx"), "not_common")).toBe(true);
      expect(ruleOf(checkPassword("akmakmakmakmx"), "not_common")).toBe(true);
      expect(ruleOf(checkPassword("xakmakmakmakm"), "not_common")).toBe(true);
    });

    it.each<[string, string]>([
      ["five letters", "aabbccddee"],
      ["five letters in capitals", "AABBCCDDEE"],
      ["letters in no order", "kkttxxmmqqzz"],
      ["digits", "1133557799"],
      ["letters, digits and symbols", "kk77!!xx22--"],
      ["a longer one", "ttkkxxmmqqzzwwhh"],
    ])("refuses a password with every character doubled: %s", (_label, password) => {
      const check = checkPassword(password);
      expect(unmet(check)).toEqual(["not_common"]);
    });

    it("does not call it doubled when one character is left over, or one pair does not match", () => {
      // One over, at either end.
      expect(ruleOf(checkPassword("kkttxxmmqqz"), "not_common")).toBe(true);
      expect(ruleOf(checkPassword("zkkttxxmmqq"), "not_common")).toBe(true);
      // One pair of different characters, at the end and in the middle.
      expect(ruleOf(checkPassword("kkttxxmmqqzw"), "not_common")).toBe(true);
      expect(ruleOf(checkPassword("kkttxwmmqqzz"), "not_common")).toBe(true);
      // Doubled letters with something else beside them, as in ordinary words.
      expect(unmet(checkPassword("kkttxxmmqq-kite"))).toEqual([]);
      expect(unmet(checkPassword("bookkeeper-coffee-moon"))).toEqual([]);
    });

    describe("a run of characters", () => {
      it.each<[string, string]>([
        ["six letters up the alphabet", "abcdef-kites-tea"],
        ["six letters down it", "kites-fedcba-tea"],
        ["the last six letters", "kites-uvwxyz-tea"],
        ["six letters from the middle, in capitals", "kites-HIJKLM-tea"],
        ["six digits up", "kite-456789-tea"],
        ["six digits down", "kite-987654-tea"],
        ["six along the top row of keys", "kites-wertyu-tea"],
        ["six back along it", "kites-poiuyt-tea"],
        ["six along the middle row", "kites-asdfgh-tea"],
        ["six back along it", "kites-lkjhgf-tea"],
        ["six along the bottom row", "kites-zxcvbn-tea"],
        ["six back along it", "kites-mnbvcx-tea"],
        ["six along the number row, past the nine", "kite-567890-tea"],
        ["six back along it, from the nought", "kite-098765-tea"],
        ["a run with other characters hard against it", "xxasdfghxx-kites"],
        ["a run of seven", "kites-bcdefgh-tea"],
      ])("refuses %s", (_label, password) => {
        const check = checkPassword(password);
        expect(unmet(check)).toEqual(["not_common"]);
      });

      it.each<[string, string]>([
        ["five letters up the alphabet", "abcde-kites-tea-x"],
        ["five letters down it", "kites-edcba-tea-x"],
        ["five digits", "kite-45678-tea-x"],
        ["five along a row of keys", "kites-asdfg-tea-x"],
        ["five along the bottom row", "kites-zxcvb-tea-x"],
        ["a run of six with something in the middle of it", "abc-def-kites-tea"],
        ["letters that would have to go round from z to a", "kites-xyzabc-tea"],
        ["keys that would have to go on to the next row", "kites-jklzxc-tea"],
        ["every other letter", "kites-acegik-tea"],
      ])("does not refuse %s", (_label, password) => {
        expect(unmet(checkPassword(password))).toEqual([]);
      });

      // "understudy" is refused as too easy to guess (password.ts:121-139). The letters d-e, r-s,
      // s-t and t-u follow one another in the alphabet and e-r on the top row of keys, and the
      // two kinds of neighbour are counted towards the same run, which makes "derstu" six long.
      it("does not take an ordinary word for a run because its letters chain from the alphabet onto a row of keys", () => {
        expect(unmet(checkPassword("understudy-violet-harbor"))).toEqual([]);
        expect(passwordProblem("the understudy sang at dawn")).toBeNull();
      });
    });

    describe("one word and a year", () => {
      it.each([
        "Welcome2026",
        "summer-2025!",
        "spring2026",
        "autumn 1999",
        "winter_2024!!",
        "ANTEATERS2027",
        "graduation.2028",
        // A year is refused after a word of any length, and with a letter or two after it.
        "congratulations2026",
        "Welcome2026x",
        "welcome2026xy",
        "summer-2025ab!",
        "Welcome2026x!!",
      ])("refuses %s", (password) => {
        const check = checkPassword(password);
        expect(unmet(check)).toEqual(["not_common"]);
      });

      it.each<[string, string]>([
        ["two words and a year", "two-words-2026"],
        ["a year with more after it", "summer-2025-kites"],
        ["a year in the middle of a phrase", "class-of-2027-kites"],
        ["a year before the word", "2026-summer-kites"],
        ["two words and a number", "summer-kite-4821"],
        ["a long word, a year and a word after it", "congratulations2026kites"],
      ])("does not refuse %s", (_label, password) => {
        expect(unmet(checkPassword(password))).toEqual([]);
      });
    });

    describe("one short word and a few digits", () => {
      it.each<[string, string]>([
        ["a word and three digits", "sunshine123"],
        ["the same with a capital", "Sunshine123"],
        ["the same in capitals", "SUNSHINE123"],
        ["a hyphen between them", "marigold-482"],
        ["a space between them", "marigold 482"],
        ["an underscore between them and a symbol after", "marigold_482!"],
        ["two symbols after", "sunshine123!!"],
        ["a letter after", "sunshine123x"],
        ["two letters and a symbol after", "sunshine123ab!"],
        ["one digit", "strawberry7"],
        ["four digits, the most that count", "sunshine4821"],
        ["a word of ten letters, the longest that counts", "strawberry123"],
        ["a word of six letters, with enough after it to be long enough", "violin4821x"],
      ])("refuses %s", (_label, password) => {
        const check = checkPassword(password);
        expect(unmet(check)).toEqual(["not_common"]);
        expect(passwordProblem(password)).toBe(EASY);
      });

      it.each<[string, string]>([
        ["two words and digits", "maple-harbor-42"],
        ["two words and digits, with nothing between the words and the digits", "happy-beach22"],
        ["three words and digits", "maple-harbor-violin-42"],
        ["a word of eleven letters and digits", "blueberries123"],
        ["a word and five digits", "sunshine48213"],
        ["digits before the word", "482-marigold"],
        ["digits on both sides of the word", "48-marigold-27"],
        ["a word, digits and another word", "marigold482kites"],
      ])("does not refuse %s", (_label, password) => {
        expect(unmet(checkPassword(password))).toEqual([]);
      });
    });
  });

  describe("a temporary password", () => {
    const REPLACING = "Not your temporary password";
    const SHAPED = "Not written like a temporary password";
    const fourth = (check: PasswordCheck) => check.rules.find((rule) => rule.id === "not_temporary");

    it("is a fourth rule, listed last, only for someone replacing one or typing something written like one", () => {
      // Not listed: nobody is replacing anything, and nothing looks like one.
      for (const owner of [{}, AVERY, { ...AVERY, temporary: null }, { ...AVERY, temporary: undefined }]) {
        expect(idsOf(checkPassword("correct-horse-battery", owner))).toEqual(["length", "not_personal", "not_common"]);
        expect(idsOf(checkPassword("", owner))).toEqual(["length", "not_personal", "not_common"]);
      }
      // Listed for someone replacing one, whatever they have typed so far.
      for (const temporary of [true, ISSUED, ""] as const) {
        for (const password of ["", "k", "correct-horse-battery", ISSUED]) {
          const check = checkPassword(password, { ...AVERY, temporary });
          expect(idsOf(check), password).toEqual(["length", "not_personal", "not_common", "not_temporary"]);
          expect(fourth(check)?.label, password).toBe(REPLACING);
        }
      }
      // And for anyone at all, the moment what they type is written like one.
      for (const owner of [{}, AVERY, { temporary: null }]) {
        const check = checkPassword(ISSUED, owner);
        expect(idsOf(check)).toEqual(["length", "not_personal", "not_common", "not_temporary"]);
        expect(fourth(check)).toEqual({ id: "not_temporary", label: SHAPED, met: false });
      }
    });

    it.each<[string, string]>([
      ["as it is handed out", ISSUED],
      ["in lower case", ISSUED.toLowerCase()],
      ["in mixed case", "k7Qm-2xRt-9bHd"],
      ["with spaces around it", `  ${ISSUED}  `],
      ["with a tab and a line break around it, as a paste can leave", `\t${ISSUED.toLowerCase()}\n`],
      ["the one the local demo hands a pledge", "FNDR-EDUC-2626"],
      ["the one the local demo hands an active", "SEPA-CTVE-2626"],
    ])("refuses anything written like one, whoever is asking: %s", (_label, password) => {
      const owners: PasswordOwner[] = [{}, AVERY, { temporary: null }, { temporary: true }, { temporary: ISSUED }, { temporary: ANOTHER_ISSUED }, { temporary: "" }];
      for (const owner of owners) {
        const check = checkPassword(password, owner);
        expect(unmet(check), JSON.stringify(owner)).toEqual(["not_temporary"]);
        expect(check, JSON.stringify(owner)).toMatchObject({ ok: false, strength: 1, strengthLabel: "Weak" });
        expect(passwordProblem(password, owner), JSON.stringify(owner)).toBe(TEMPORARY);
      }
    });

    it("does not take an ordinary password with hyphens in it for one", () => {
      for (const password of ["happy-beach-22", "correct-horse-battery", "blue-moon-fish", "kite-42-tea-9", "K7QM-2XRT", "K7QM-2XRT-9BHD-ABCD", "K7QM2XRT9BHD"]) {
        const check = checkPassword(password);
        expect(idsOf(check), password).toEqual(["length", "not_personal", "not_common"]);
      }
      expect(checkPassword("happy-beach-22")).toMatchObject({ ok: true });
      expect(passwordProblem("happy-beach-22")).toBeNull();
      // Nor when a temporary password is being replaced: the rule is listed, and met.
      for (const temporary of [true, ISSUED] as const) {
        const check = checkPassword("happy-beach-22", { ...AVERY, temporary });
        expect(fourth(check)).toEqual({ id: "not_temporary", label: REPLACING, met: true });
        expect(check.ok).toBe(true);
      }
    });

    describe("the one that was issued, where it is known", () => {
      const owner: PasswordOwner = { ...AVERY, temporary: ISSUED };

      it.each<[string, string]>([
        ["with the dashes taken out", "K7QM2XRT9BHD"],
        ["with the dashes taken out, in lower case", "k7qm2xrt9bhd"],
        ["with spaces for dashes", "K7QM 2XRT 9BHD"],
        ["with dots for dashes", "k7qm.2xrt.9bhd"],
        ["with underscores for dashes", "K7QM_2XRT_9BHD"],
        ["with a dash after every character", "K-7-Q-M-2-X-R-T-9-B-H-D"],
        ["with something added before it", `kite-${ISSUED}`],
        ["with something added after it", `${ISSUED}-kite`],
        ["with a character added before it", `x${ISSUED}`],
        ["with a character added after it", `${ISSUED}!`],
        ["with something added on both sides", `my ${ISSUED.toLowerCase()} kite`],
        ["with letters hard against it and no dashes", "kitesk7qm2xrt9bhdkites"],
        ["twice over", `${ISSUED}${ISSUED}`],
      ])("refuses it %s", (_label, password) => {
        const check = checkPassword(password, owner);
        expect(ruleOf(check, "not_temporary")).toBe(false);
        expect(unmet(check)).toEqual(["not_temporary"]);
        expect(passwordProblem(password, owner)).toBe(TEMPORARY);
      });

      // One or two characters dropped, changed or slipped in is still the temporary password
      // to anyone guessing. The browser knows which one was issued, so it can tell.
      it.each<[string, string]>([
        ["with its last character dropped", "K7QM2XRT9BH"],
        ["with its last character dropped and the dashes kept", "K7QM-2XRT-9BH"],
        ["with its first character dropped", "7QM2XRT9BHD"],
        ["with a character dropped from the middle", "K7QM2XT9BHD"],
        ["with its last two characters dropped", "K7QM2XRT9B"],
        ["with one character dropped from each end", "7QM2XRT9BH"],
        ["with its last character changed", "K7QM2XRT9BHE"],
        ["with its first character changed, in lower case, with spaces", "x7qm 2xrt 9bhd"],
        ["with two characters changed", "K7QM2XRT9BXY"],
        ["with one character changed at each end", "X7QM2XRT9BHY"],
        ["with a character slipped into the middle", "K7QM2XxRT9BHD"],
        ["with two characters slipped into it", "K7QxM2XRyT9BHD"],
        ["with one dropped and another changed", "7QM2XRT9BHE"],
        ["with two neighbours changed over", "K7QM2XRT9BDH"],
      ])("refuses it %s", (_label, password) => {
        const check = checkPassword(password, owner);
        expect(unmet(check)).toEqual(["not_temporary"]);
        expect(passwordProblem(password, owner)).toBe(TEMPORARY);
        // To anyone who was not given that one, it is a password like any other.
        expect(ruleOf(checkPassword(password, { ...AVERY, temporary: ANOTHER_ISSUED }), "not_temporary"), "for another").toBe(true);
        if (!looksTemporary(password)) expect(checkPassword(password, AVERY).ok).toBe(true);
      });

      it.each<[string, string]>([
        ["with three characters changed", "K7QM2XRT9XYZ"],
        ["with three characters changed, one at each end and one in the middle", "X7QM2YRT9BHZ"],
        ["with three characters slipped into it, apart from one another", "K7xQM2XyRT9BzHD"],
        ["with its last character dropped and a word added", "K7QM2XRT9BH-kite"],
        ["with its last three characters replaced by a word", "K7QM2XRT9-kite"],
        ["backwards", "DHB9TRX2MQ7K"],
        ["a different temporary password with its dashes taken out", "W4PN8GZC3FJY"],
        ["a password of their own", "correct-horse-battery"],
        ["a password of their own that is as long as it", "maple-harbor"],
      ])("does not refuse something that is not it: %s", (_label, password) => {
        const check = checkPassword(password, owner);
        expect(ruleOf(check, "not_temporary")).toBe(true);
        expect(check.ok).toBe(true);
        expect(passwordProblem(password, owner)).toBeNull();
      });

      it("counts the edits on the letters and digits alone, however either of them is written", () => {
        // The issued one in lower case with spaces, the typed one with dots and a character short.
        expect(ruleOf(checkPassword("K7QM.2XRT.9BH", { temporary: "k7qm 2xrt 9bhd" }), "not_temporary")).toBe(false);
        expect(ruleOf(checkPassword("k-7-q-m-2-x-r-t-9-b-h", { temporary: ISSUED }), "not_temporary")).toBe(false);
        // Punctuation is not an edit: any amount of it leaves the same password.
        expect(ruleOf(checkPassword("K7QM!!!2XRT???9BHD...", { temporary: ISSUED }), "not_temporary")).toBe(false);
      });

      it("refuses a different temporary password as well, for being written like one", () => {
        expect(unmet(checkPassword(ANOTHER_ISSUED, owner))).toEqual(["not_temporary"]);
        expect(unmet(checkPassword(ANOTHER_ISSUED.toLowerCase(), owner))).toEqual(["not_temporary"]);
      });

      it("reads the issued one however it is written: lower case, spaces, no dashes", () => {
        for (const temporary of [ISSUED.toLowerCase(), "K7QM 2XRT 9BHD", "K7QM2XRT9BHD", ` ${ISSUED} `]) {
          expect(ruleOf(checkPassword("kites-K7QM2XRT9BHD-tea", { temporary }), "not_temporary"), temporary).toBe(false);
          expect(ruleOf(checkPassword("correct-horse-battery", { temporary }), "not_temporary"), temporary).toBe(true);
        }
      });

      it("looks for nothing shorter than eight characters, so that an empty or a stray value refuses nothing", () => {
        // Nothing at all would be found in every password.
        for (const temporary of ["", "-", "   ", "K7Q", "K7QM-2XR"]) {
          const check = checkPassword("kites-k7qm2xrt-tea", { temporary });
          expect(ruleOf(check, "not_temporary"), JSON.stringify(temporary)).toBe(true);
          expect(check.ok, JSON.stringify(temporary)).toBe(true);
        }
        // Eight is looked for.
        expect(ruleOf(checkPassword("kites-k7qm2xrt-tea", { temporary: "K7QM-2XRT" }), "not_temporary")).toBe(false);
      });
    });

    // The server never keeps the password readable, so all it can say here is that one is
    // being replaced. Anything not written like one is left to the fingerprint it does keep.
    it("goes by the shape alone where only the fact is known", () => {
      const owner: PasswordOwner = { ...AVERY, temporary: true };
      expect(unmet(checkPassword(ISSUED, owner))).toEqual(["not_temporary"]);
      expect(unmet(checkPassword(ISSUED.toLowerCase(), owner))).toEqual(["not_temporary"]);
      // With something added, and with a character dropped or changed.
      for (const password of ["K7QM2XRT9BHD", "K7QM 2XRT 9BHD", `x${ISSUED}`, `${ISSUED}!`, "K7QM-2XRT-9BH", "K7QM2XRT9BHE", "K7QM2XxRT9BHD"]) {
        expect(ruleOf(checkPassword(password, owner), "not_temporary"), password).toBe(true);
      }
    });
  });

  describe("strength", () => {
    const strengthOf = (length: number, kinds: readonly Kind[]): number => checkPassword(mixed(length, kinds)).strength;

    // Length counts for most. Three kinds of character bring each step forward: to 13 and to 16.
    it.each<[string, readonly Kind[], Array<[number, number]>]>([
      [
        "one kind of character",
        ["lower"],
        [
          [9, 0],
          [10, 1],
          [11, 1],
          [12, 2],
          [13, 2],
          [15, 2],
          [16, 3],
          [19, 3],
          [20, 4],
          [128, 4],
        ],
      ],
      [
        "two kinds",
        ["lower", "digit"],
        [
          [9, 0],
          [10, 1],
          [11, 1],
          [12, 2],
          [13, 2],
          [15, 2],
          [16, 3],
          [19, 3],
          [20, 4],
          [128, 4],
        ],
      ],
      [
        "three kinds",
        ["lower", "upper", "digit"],
        [
          [9, 0],
          [10, 1],
          [11, 1],
          [12, 2],
          [13, 3],
          [15, 3],
          [16, 4],
          [20, 4],
          [128, 4],
        ],
      ],
      [
        "four kinds",
        ["lower", "upper", "digit", "symbol"],
        [
          [9, 0],
          [10, 1],
          [11, 1],
          [12, 2],
          [13, 3],
          [15, 3],
          [16, 4],
          [128, 4],
        ],
      ],
    ])("steps up with length for %s", (_label, kinds, steps) => {
      for (const [length, expected] of steps) expect(strengthOf(length, kinds), `${length} characters`).toBe(expected);
    });

    it("gives a long run of plain words more than a short mix of symbols", () => {
      const words = checkPassword("correct horse battery staple");
      const symbols = checkPassword("Zx9!Kq2#mB7$");
      expect(symbols).toMatchObject({ ok: true, strength: 2, strengthLabel: "Fair" });
      expect(words).toMatchObject({ ok: true, strength: 4, strengthLabel: "Very strong" });
    });

    it.each(MIXES)("never goes down as a password of %s gets longer, up to the longest allowed", (_label, kinds) => {
      let previous = 0;
      for (let length = 0; length <= PASSWORD_MAX_LENGTH; length += 1) {
        const strength = strengthOf(length, kinds);
        expect(strength, `${length} characters`).toBeGreaterThanOrEqual(previous);
        expect([0, 1, 2, 3, 4]).toContain(strength);
        previous = strength;
      }
      expect(previous).toBe(4);
    });

    it("is never higher for fewer kinds of character at the same length", () => {
      for (let length = 0; length <= PASSWORD_MAX_LENGTH; length += 1) {
        const one = strengthOf(length, ["lower"]);
        const two = strengthOf(length, ["lower", "digit"]);
        const three = strengthOf(length, ["lower", "upper", "digit"]);
        const four = strengthOf(length, ["lower", "upper", "digit", "symbol"]);
        expect([one <= two, two <= three, three <= four], `${length} characters`).toEqual([true, true, true]);
      }
    });

    it("is never above 1 when a rule is not met, however long and varied the password", () => {
      const broken: Array<[string, string, PasswordOwner]> = [
        ["one character too long", mixed(PASSWORD_MAX_LENGTH + 1, ["lower", "upper", "digit", "symbol"]), {}],
        ["far too long", mixed(400, ["lower", "upper", "digit", "symbol"]), {}],
        ["the owner's name in it", "Avery-Flies-42-Kites-At-Dawn!", AVERY],
        ["the owner's address in it", "Kites!42-avery.chen-At-Dawn", AVERY],
        ["a repeated chunk", "Zx9!Zx9!Zx9!Zx9!Zx9!Zx9!", {}],
        ["a common password", "PasswordPassword", {}],
        ["a notorious word in it", "Kites!42-Password-At-Dawn", {}],
        ["a run of keys in it", "Kites!42-asdfgh-At-Dawn", {}],
        ["the temporary password in it", `Kites!42-${ISSUED}-At-Dawn`, { temporary: ISSUED }],
        ["a temporary password", ISSUED, {}],
      ];
      for (const [label, password, owner] of broken) {
        const check = checkPassword(password, owner);
        expect(check.ok, label).toBe(false);
        expect(check.strength, label).toBe(1);
        expect(check.strengthLabel, label).toBe("Weak");
      }
      // The same passwords with nothing wrong with them score well, so it is the rule that holds them down.
      expect(checkPassword("Avery-Flies-42-Kites-At-Dawn!").strength).toBe(4);
      expect(checkPassword(`Kites!42-${ISSUED}-At-Dawn`).strength).toBe(4);
      expect(checkPassword(mixed(PASSWORD_MAX_LENGTH, ["lower", "upper", "digit", "symbol"])).strength).toBe(4);
    });

    it("is 0 for a password that is too short, whatever else is right or wrong with it", () => {
      for (const password of ["", "a", "Zx9!", "Zx9!Kq2#m", "avery", "aaaaaaaaa", "K7QM-2XRT"]) {
        expect(checkPassword(password, AVERY).strength, password).toBe(0);
        expect(checkPassword(password, { ...AVERY, temporary: ISSUED }).strength, password).toBe(0);
      }
    });

    it("names each level", () => {
      const labels = new Map<number, string>();
      for (const [, kinds] of MIXES) {
        for (let length = 0; length <= 24; length += 1) {
          const check = checkPassword(mixed(length, kinds));
          labels.set(check.strength, check.strengthLabel);
        }
      }
      expect([...labels].sort(([a], [b]) => a - b)).toEqual([
        [0, "Too weak"],
        [1, "Weak"],
        [2, "Fair"],
        [3, "Strong"],
        [4, "Very strong"],
      ]);
    });
  });
});

describe("passwordProblem", () => {
  const MESSAGES: Record<PasswordRuleId, string[]> = {
    length: [TOO_SHORT, TOO_LONG],
    not_personal: [PERSONAL],
    not_common: [EASY],
    not_temporary: [TEMPORARY],
  };

  it("has nothing to say about a password that meets every rule", () => {
    expect(passwordProblem("correct-horse-battery")).toBeNull();
    expect(passwordProblem("correct-horse-battery", AVERY)).toBeNull();
    expect(passwordProblem("correct-horse-battery", { ...AVERY, temporary: true })).toBeNull();
    expect(passwordProblem("correct-horse-battery", { ...AVERY, temporary: ISSUED })).toBeNull();
    expect(passwordProblem(mixed(PASSWORD_MIN_LENGTH, ["lower", "digit"]), AVERY)).toBeNull();
    expect(passwordProblem(mixed(PASSWORD_MAX_LENGTH, ["lower", "digit"]), AVERY)).toBeNull();
  });

  it("says the same thing wherever a temporary password is refused, and exports the sentence", () => {
    expect(TEMPORARY_REUSED).toBe(TEMPORARY);
  });

  describe("and checkPassword can never disagree", () => {
    const OWNERS: PasswordOwner[] = [
      {},
      AVERY,
      JORDAN,
      { email: "sam.lee@uci.edu", displayName: "Sam Lee" },
      { displayName: "Mary-Jane Smith-Jones" },
      { email: "al.xu.42@uci.edu" },
      { email: null, displayName: null, temporary: null },
      { ...AVERY, temporary: true },
      { ...AVERY, temporary: ISSUED },
      { ...JORDAN, temporary: ANOTHER_ISSUED },
      { temporary: "" },
    ];

    const WRITTEN: string[] = [
      "",
      " ",
      "short",
      "kite-42-x",
      "correct-horse-battery",
      "correct horse battery staple",
      "happy-beach-22",
      "avery-flies-kites-42",
      "kites-for-chen-42",
      "kitchen-sink-yellow",
      "x-avery.chen-x-42",
      "patel-flies-kites-42",
      "sam-flies-kites-42",
      "same-sleet-again-42",
      "kites-al.xu.42-tea",
      "kites-for-jones-42",
      "password123",
      "password123-and-a-kite",
      "portal-demo-1",
      "abcabcabcabc",
      "aaaaaaaaaaaa",
      "kites-asdfgh-tea",
      "kites-asdfg-tea-x",
      "Welcome2026",
      "two-words-2026",
      "chen-password-kite",
      ISSUED,
      ISSUED.toLowerCase(),
      ` ${ISSUED} `,
      "K7QM2XRT9BHD",
      "K7QM 2XRT 9BHD",
      `x${ISSUED}`,
      `${ISSUED}-kite`,
      ANOTHER_ISSUED,
      "W4PN8GZC3FJY",
      "AAAA-AAAA-AAAA",
      "CHEN-CHEN-CHEN",
      "FNDR-EDUC-2626",
      mixed(9, ["lower", "digit"]),
      mixed(PASSWORD_MIN_LENGTH, ["lower", "digit"]),
      mixed(PASSWORD_MAX_LENGTH, ["lower", "upper"]),
      mixed(PASSWORD_MAX_LENGTH + 1, ["lower", "upper"]),
      mixed(513, ["lower", "upper", "digit", "symbol"]),
      `avery-${mixed(PASSWORD_MAX_LENGTH, ["lower", "digit"])}`,
      `${ISSUED}${mixed(PASSWORD_MAX_LENGTH, ["lower", "digit"])}`,
    ];

    /** Passwords nobody chose: any length up to past the limit, from letters, digits and the usual separators. */
    function generated(count: number): string[] {
      const next = scrambled(20_261_011);
      const characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ0123456789-- ._!";
      const pieces = ["avery", "chen", "patel", "password", "qwerty", "asdfgh", "2026", ISSUED, "K7QM2XRT9BHD", "kite", "-", " "];
      return Array.from({ length: count }, () => {
        const length = next() % 140;
        let password = "";
        while (password.length < length) {
          // Mostly single characters, with a known word dropped in now and then.
          password += next() % 9 === 0 ? pieces[next() % pieces.length] : characters[next() % characters.length];
        }
        return password;
      });
    }

    const GENERATED = generated(600);

    it("covers every outcome with the passwords it is tried on", () => {
      const seen = new Set<string | null>();
      for (const password of [...WRITTEN, ...GENERATED]) for (const owner of OWNERS) seen.add(passwordProblem(password, owner));
      expect(seen).toEqual(new Set([null, TOO_SHORT, TOO_LONG, PERSONAL, EASY, TEMPORARY]));
      // The generated ones are not all refused, or all for the same reason.
      const forNobody = GENERATED.map((password) => passwordProblem(password));
      for (const outcome of [null, TOO_SHORT, TOO_LONG, EASY]) expect(forNobody).toContain(outcome);
      const forAvery = GENERATED.map((password) => passwordProblem(password, { ...AVERY, temporary: ISSUED }));
      for (const outcome of [null, PERSONAL, TEMPORARY]) expect(forAvery).toContain(outcome);
    });

    it("has a problem to report exactly when a rule is not met, for every password and every owner", () => {
      let compared = 0;
      for (const password of [...WRITTEN, ...GENERATED]) {
        for (const owner of OWNERS) {
          const check = checkPassword(password, owner);
          const problem = passwordProblem(password, owner);
          const label = `${JSON.stringify(password)} for ${JSON.stringify(owner)}`;
          expect(problem === null, label).toBe(check.ok);
          expect(check.ok, label).toBe(check.rules.every((rule) => rule.met));
          compared += 1;
        }
      }
      expect(compared).toBe((WRITTEN.length + GENERATED.length) * OWNERS.length);
    });

    it("reports the first rule that is not met, in the order the checklist shows them", () => {
      for (const password of [...WRITTEN, ...GENERATED]) {
        for (const owner of OWNERS) {
          const check = checkPassword(password, owner);
          const first = check.rules.find((rule) => !rule.met);
          const problem = passwordProblem(password, owner);
          const label = `${JSON.stringify(password)} for ${JSON.stringify(owner)}`;
          if (!first) expect(problem, label).toBeNull();
          else if (first.id === "length") expect(problem, label).toBe(password.length > PASSWORD_MAX_LENGTH ? TOO_LONG : TOO_SHORT);
          else expect(MESSAGES[first.id], label).toEqual([problem]);
        }
      }
    });

    it("always lists the first three rules in the same order, and the fourth exactly when it applies", () => {
      for (const password of [...WRITTEN, ...GENERATED]) {
        for (const owner of OWNERS) {
          const replacing = owner.temporary !== undefined && owner.temporary !== null;
          const expected: PasswordRuleId[] = ["length", "not_personal", "not_common"];
          if (replacing || looksTemporary(password)) expected.push("not_temporary");
          expect(idsOf(checkPassword(password, owner)), JSON.stringify(password)).toEqual(expected);
        }
      }
    });
  });

  it.each<[string, string, string]>([
    ["no password at all", "", TOO_SHORT],
    ["nine characters", mixed(9, ["lower", "digit"]), TOO_SHORT],
    ["129 characters", mixed(PASSWORD_MAX_LENGTH + 1, ["lower", "digit"]), TOO_LONG],
    ["their own first name", "avery-flies-kites-42", PERSONAL],
    ["their own last name in capitals", "KITES-FOR-CHEN-42", PERSONAL],
    ["a common password", "password123", EASY],
    ["a common password in capitals", "QWERTYUIOP", EASY],
    ["a common password with more added to it", "password123-and-a-kite", EASY],
    ["one character over and over", "zzzzzzzzzzzz", EASY],
    ["a repeated chunk", "abcdabcdabcd", EASY],
    ["a run of keys", "kites-asdfgh-tea", EASY],
    ["a word and a year", "Welcome2026", EASY],
    ["a word and a few digits", "sunshine123", EASY],
    ["a common password written with look-alike symbols", "P@ssw0rd-kites-tea", EASY],
    ["every character doubled", "kkttxxmmqqzz", EASY],
    ["the programme's own name", "FoundersEducation", EASY],
    ["a temporary password", ISSUED, TEMPORARY],
  ])("says what is wrong with %s", (_label, password, expected) => {
    expect(passwordProblem(password, AVERY)).toBe(expected);
  });

  it("says a copy of the issued temporary password with a character or two altered is the temporary one", () => {
    const owner: PasswordOwner = { ...AVERY, temporary: ISSUED };
    for (const password of ["K7QM2XRT9BH", "K7QM-2XRT-9BH", "K7QM2XRT9BHE", "K7QM2XxRT9BHD", "K7QM2XRT9BXY"]) {
      expect(passwordProblem(password, owner), password).toBe(TEMPORARY);
      // The server, which only knows that one is being replaced, has nothing to say about these.
      expect(passwordProblem(password, { ...AVERY, temporary: true }), password).toBeNull();
    }
  });

  // Anything over the limit is too long, however far over. A password of 513 characters or
  // more used to be answered as if nothing had been sent.
  it.each([129, 130, 512, 513, 514, 1024, 5000, 20_000])("says a password of %i characters is too long, not too short", (length) => {
    for (const [label, kinds] of MIXES) {
      expect(passwordProblem(mixed(length, kinds)), label).toBe(TOO_LONG);
      expect(passwordProblem(mixed(length, kinds), { ...AVERY, temporary: true }), label).toBe(TOO_LONG);
    }
    expect(passwordProblem("Kq7#vX2m".repeat(Math.ceil(length / 8)).slice(0, length))).toBe(TOO_LONG);
  });

  it("names the first thing wrong: the length, then the name, then the pattern, then the temporary password", () => {
    // Too short, and the owner's name, and a notorious word.
    expect(passwordProblem("chen-zot", AVERY)).toBe(TOO_SHORT);
    // Long enough, and still both of the others.
    expect(passwordProblem("chen-password-kite", AVERY)).toBe(PERSONAL);
    expect(passwordProblem("chen-password-kite")).toBe(EASY);
    // Too long, and the owner's name.
    expect(passwordProblem(`avery-${mixed(PASSWORD_MAX_LENGTH, ["lower", "digit"])}`, AVERY)).toBe(TOO_LONG);
    // Too long, and the temporary password.
    expect(passwordProblem(`${ISSUED}${mixed(PASSWORD_MAX_LENGTH, ["lower", "digit"])}`, { temporary: ISSUED })).toBe(TOO_LONG);
    // The owner's name, and the temporary password.
    expect(passwordProblem(`avery-${ISSUED}`, { ...AVERY, temporary: ISSUED })).toBe(PERSONAL);
    expect(passwordProblem(`avery-${ISSUED}`, { temporary: ISSUED })).toBe(TEMPORARY);
    // A notorious word, and the temporary password.
    expect(passwordProblem(`password-${ISSUED}`, { temporary: ISSUED })).toBe(EASY);
  });

  it("refuses a temporary password that breaks an earlier rule too, for the earlier reason", () => {
    // Two different characters only, which is a repeated pattern.
    expect(passwordProblem("AAAA-AAAA-AAAA")).toBe(EASY);
    expect(unmet(checkPassword("AAAA-AAAA-AAAA"))).toEqual(["not_common", "not_temporary"]);
    // The owner's own four-letter name, as a word of its own in each group.
    expect(passwordProblem("WYNN-WYNN-WYNN", { displayName: "Bo Wynn" })).toBe(PERSONAL);
    expect(unmet(checkPassword("WYNN-WYNN-WYNN", { displayName: "Bo Wynn" }))).toEqual(["not_personal", "not_temporary"]);
    // For anyone else it is refused for what it is.
    expect(passwordProblem("WYNN-WYNN-WYNN")).toBe(TEMPORARY);
  });
});

describe("normaliseTemporary", () => {
  it("puts a temporary password in capitals and keeps only its letters and digits", () => {
    expect(normaliseTemporary(ISSUED)).toBe("K7QM2XRT9BHD");
    expect(normaliseTemporary("k7qm-2xrt-9bhd")).toBe("K7QM2XRT9BHD");
    expect(normaliseTemporary("  k7qm 2xrt\t9bhd\n")).toBe("K7QM2XRT9BHD");
    expect(normaliseTemporary("K7QM_2XRT.9BHD!")).toBe("K7QM2XRT9BHD");
    expect(normaliseTemporary("K-7-Q-M-2-X-R-T-9-B-H-D")).toBe("K7QM2XRT9BHD");
  });

  it("gives the same answer for every way of writing the same one", () => {
    const written = [ISSUED, ISSUED.toLowerCase(), "K7QM2XRT9BHD", "k7qm 2xrt 9bhd", " K7qm-2xRT-9bhd ", "(K7QM) [2XRT] {9BHD}"];
    expect(new Set(written.map(normaliseTemporary))).toEqual(new Set(["K7QM2XRT9BHD"]));
  });

  it("leaves nothing of a string with no letters or digits in it", () => {
    for (const nothing of ["", " ", "---", "\t\n", "!@#$%^&*()", "é–—"]) expect(normaliseTemporary(nothing), JSON.stringify(nothing)).toBe("");
  });

  it("keeps the characters a temporary password never has, so that a longer password is read whole", () => {
    expect(normaliseTemporary("oil-01")).toBe("OIL01");
    expect(normaliseTemporary("correct horse battery staple")).toBe("CORRECTHORSEBATTERYSTAPLE");
  });

  it("is already settled: normalising twice changes nothing", () => {
    for (const password of [ISSUED, "correct horse battery staple", "", "Kq7#vX2m"]) {
      expect(normaliseTemporary(normaliseTemporary(password))).toBe(normaliseTemporary(password));
    }
  });
});

describe("temporaryCandidates", () => {
  it("finds nothing in a password with fewer than twelve letters and digits", () => {
    expect(temporaryCandidates("")).toEqual([]);
    expect(temporaryCandidates("K7QM")).toEqual([]);
    // Eleven, with and without its dashes.
    expect(temporaryCandidates("K7QM2XRT9BH")).toEqual([]);
    expect(temporaryCandidates("K7QM-2XRT-9BH")).toEqual([]);
    // Fourteen characters, of which only eleven count.
    expect(temporaryCandidates("K7QM---2XRT9BH")).toEqual([]);
    expect(temporaryCandidates("!!!!!!!!!!!!!!!!")).toEqual([]);
  });

  it("finds exactly the one stretch in a password of twelve, however it is written", () => {
    for (const password of [ISSUED, ISSUED.toLowerCase(), "K7QM2XRT9BHD", "k7qm 2xrt 9bhd", "  K7QM_2XRT.9BHD!  "]) {
      expect(temporaryCandidates(password), password).toEqual(["K7QM2XRT9BHD"]);
    }
  });

  it("finds every stretch of twelve in a longer password, in order: one more for each character added", () => {
    expect(temporaryCandidates(`x${ISSUED}`)).toEqual(["XK7QM2XRT9BH", "K7QM2XRT9BHD"]);
    expect(temporaryCandidates(`${ISSUED}y`)).toEqual(["K7QM2XRT9BHD", "7QM2XRT9BHDY"]);
    expect(temporaryCandidates(`x${ISSUED}y`)).toEqual(["XK7QM2XRT9BH", "K7QM2XRT9BHD", "7QM2XRT9BHDY"]);

    const sixteen = "abcd-EFGH-jkmn-pqrs";
    expect(temporaryCandidates(sixteen)).toEqual(["ABCDEFGHJKMN", "BCDEFGHJKMNP", "CDEFGHJKMNPQ", "DEFGHJKMNPQR", "EFGHJKMNPQRS"]);

    for (const length of [12, 13, 20, 64, 128]) {
      const password = mixed(length, ["lower", "digit"]);
      const found = temporaryCandidates(password);
      expect(found, `${length} characters`).toHaveLength(length - 11);
      found.forEach((candidate, start) => expect(candidate).toBe(password.toUpperCase().slice(start, start + 12)));
    }
  });

  it("gives each stretch once, however often it comes round", () => {
    expect(temporaryCandidates("AAAAAAAAAAAA")).toEqual(["AAAAAAAAAAAA"]);
    expect(temporaryCandidates("aaaaaaaaaaaaaaaaaaaa")).toEqual(["AAAAAAAAAAAA"]);
    // Two characters taking turns make two different stretches, not nine.
    expect(temporaryCandidates("abababababababababab")).toEqual(["ABABABABABAB", "BABABABABABA"]);
    // The same temporary password twice over: twelve different stretches before they repeat.
    const twice = temporaryCandidates(`${ISSUED} ${ISSUED}`);
    expect(twice).toHaveLength(12);
    expect(new Set(twice).size).toBe(12);
    expect(twice[0]).toBe("K7QM2XRT9BHD");
  });

  it("only ever gives stretches of twelve capitals and digits", () => {
    const next = scrambled(5);
    for (let index = 0; index < 50; index += 1) {
      const password = `${temporaryPassword(next)} and ${temporaryPassword(next).toLowerCase()}!`;
      const found = temporaryCandidates(password);
      expect(found.length).toBeGreaterThan(0);
      expect(new Set(found).size).toBe(found.length);
      for (const candidate of found) expect(candidate).toMatch(/^[A-Z0-9]{12}$/);
    }
  });

  it("always includes a temporary password that is anywhere in what was typed", () => {
    const next = scrambled(11);
    for (let index = 0; index < 100; index += 1) {
      const issued = temporaryPassword(next);
      const plain = normaliseTemporary(issued);
      for (const typed of [issued, issued.toLowerCase(), plain, issued.replace(/-/g, " "), `kite${issued}`, `${issued}kite`, `my ${issued.toLowerCase()} password`]) {
        expect(temporaryCandidates(typed), typed).toContain(plain);
      }
    }
  });
});

describe("looksTemporary", () => {
  it.each(["K7QM-2XRT-9BHD", "k7qm-2xrt-9bhd", "  K7QM-2XRT-9BHD  ", "AAAA-AAAA-AAAA", "2222-9999-ZZZZ", "FNDR-EDUC-2626", "SEPA-CTVE-2626"])("is true for %j", (password) => {
    expect(looksTemporary(password)).toBe(true);
  });

  it.each<[string, string]>([
    ["nothing", ""],
    ["two groups", "K7QM-2XRT"],
    ["four groups", "K7QM-2XRT-9BHD-ABCD"],
    ["a group of three", "K7QM-2XR-9BHD"],
    ["a group of five", "K7QM-2XRTT-9BHD"],
    ["no hyphens", "K7QM2XRT9BHD"],
    ["spaces for hyphens", "K7QM 2XRT 9BHD"],
    ["underscores for hyphens", "K7QM_2XRT_9BHD"],
    ["a space inside it", "K7QM-2X RT-9BHD"],
    ["one character more", "K7QM-2XRT-9BHDX"],
    ["a symbol", "K7QM-2XRT-9BH!"],
    ["an ordinary password", "correct-horse-battery"],
    ["an ordinary password with two hyphens", "happy-beach-22"],
  ])("is false for %s", (_label, password) => {
    expect(looksTemporary(password)).toBe(false);
  });

  // None of these can ever be handed out, so none needs refusing.
  it.each(["I", "L", "O", "0", "1"])("is false for a password of the right shape with the easily misread %s in it", (character) => {
    for (const password of [`${character}7QM-2XRT-9BHD`, `K7QM-2X${character}T-9BHD`, `K7QM-2XRT-9BH${character}`]) {
      expect(looksTemporary(password), password).toBe(false);
      expect(looksTemporary(password.toLowerCase()), password).toBe(false);
    }
  });
});

describe("temporaryPassword", () => {
  /** The 31 characters a temporary password is made of: no I, L, O, 0 or 1. */
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const SHAPE = /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;
  /** Bytes from here up are thrown away: 248 is the last whole multiple of 31 below 256. */
  const REJECTED_FROM = 248;

  /** Hands out the given bytes in order, and counts how many were asked for. */
  function stream(bytes: readonly number[]): { next: () => number; taken: () => number } {
    let position = 0;
    return {
      next: () => {
        if (position >= bytes.length) throw new Error(`The stream ran out after ${bytes.length} bytes.`);
        const byte = bytes[position];
        position += 1;
        return byte;
      },
      taken: () => position,
    };
  }

  /** 0, 1, 2 ... 255, 0, 1 ... for ever. */
  function counting(): { next: () => number; taken: () => number } {
    let position = 0;
    return {
      next: () => {
        const byte = position % 256;
        position += 1;
        return byte;
      },
      taken: () => position,
    };
  }

  it("is three groups of four, joined by hyphens", () => {
    expect(temporaryPassword(stream(Array.from({ length: 12 }, () => 0)).next)).toBe("AAAA-AAAA-AAAA");
    expect(temporaryPassword(stream([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).next)).toBe("ABCD-EFGH-JKMN");
    const source = stream([12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
    expect(temporaryPassword(source.next)).toBe("PQRS-TUVW-XYZ2");
    // Twelve characters from twelve usable bytes: nothing is wasted.
    expect(source.taken()).toBe(12);
  });

  it("uses each of its 31 characters, and none of the ones that are easily misread", () => {
    expect(ALPHABET).toHaveLength(31);
    const source = stream(Array.from({ length: 36 }, (_, index) => index));
    const made = [temporaryPassword(source.next), temporaryPassword(source.next), temporaryPassword(source.next)].join("");
    expect(made).toBe("ABCD-EFGH-JKMNPQRS-TUVW-XYZ23456-789A-BCDE");
    expect([...new Set(made.replace(/-/g, ""))].sort().join("")).toBe([...ALPHABET].sort().join(""));
    expect(made).not.toMatch(/[ILO01]/);
  });

  it("turns a byte into a character by its remainder, up to the last byte it accepts", () => {
    const twelve = (byte: number): string => temporaryPassword(stream(Array.from({ length: 12 }, () => byte)).next);
    expect(twelve(30)).toBe("9999-9999-9999");
    expect(twelve(31)).toBe("AAAA-AAAA-AAAA");
    expect(twelve(61)).toBe("9999-9999-9999");
    expect(twelve(REJECTED_FROM - 31)).toBe("AAAA-AAAA-AAAA");
    expect(twelve(REJECTED_FROM - 1)).toBe("9999-9999-9999");
  });

  it("skips every byte from 248 up, so no character is more likely than another", () => {
    // Each byte that must be skipped, with a usable one after it. Without the skipping,
    // 248 to 255 would come out as A to H and the password would be made of those.
    const bytes = [248, 8, 249, 9, 250, 10, 251, 11, 252, 12, 253, 13, 254, 14, 255, 15, 16, 17, 18, 19];
    const source = stream(bytes);
    expect(temporaryPassword(source.next)).toBe("JKMN-PQRS-TUVW");
    expect(source.taken()).toBe(bytes.length);
  });

  it("keeps asking until it has twelve usable bytes", () => {
    const source = stream([...Array.from({ length: 40 }, (_, index) => REJECTED_FROM + (index % 8)), ...Array.from({ length: 12 }, () => 5)]);
    expect(temporaryPassword(source.next)).toBe("FFFF-FFFF-FFFF");
    expect(source.taken()).toBe(52);
  });

  it("gives every character exactly the same share of an even run of bytes", () => {
    // Three times round every byte value. 248 of each 256 are used, and 62 passwords of
    // twelve characters use exactly three rounds' worth: 744.
    const source = counting();
    const made = Array.from({ length: 62 }, () => temporaryPassword(source.next));
    expect(source.taken()).toBe(3 * 256 - 8);

    const counts = new Map<string, number>();
    for (const character of made.join("").replace(/-/g, "")) counts.set(character, (counts.get(character) ?? 0) + 1);
    expect([...counts.keys()].sort().join("")).toBe([...ALPHABET].sort().join(""));
    // Taking the remainder of every byte, with none skipped, would favour A to H, the first eight.
    expect([...new Set(counts.values())]).toEqual([24]);
  });

  it("always has the same shape, whatever bytes it is given", () => {
    for (const seed of [1, 2, 3, 20_261_011]) {
      const next = scrambled(seed);
      for (let index = 0; index < 250; index += 1) {
        const password = temporaryPassword(next);
        expect(password).toMatch(SHAPE);
        expect(password).toHaveLength(14);
      }
    }
  });

  it("makes passwords that looksTemporary recognises, every one", () => {
    const next = scrambled(7);
    const source = counting();
    for (let index = 0; index < 500; index += 1) {
      for (const password of [temporaryPassword(next), temporaryPassword(source.next)]) {
        expect(looksTemporary(password), password).toBe(true);
        expect(looksTemporary(password.toLowerCase()), password).toBe(true);
        expect(looksTemporary(` ${password} `), password).toBe(true);
      }
    }
  });

  it("never makes a password that anyone would be allowed to keep", () => {
    const next = scrambled(99);
    for (let index = 0; index < 500; index += 1) {
      const password = temporaryPassword(next);
      expect(passwordProblem(password), password).toBe(TEMPORARY);
      for (const owner of [AVERY, JORDAN, { ...AVERY, temporary: true as const }, { ...AVERY, temporary: password }]) {
        for (const typed of [password, password.toLowerCase(), ` ${password} `]) {
          const check = checkPassword(typed, owner);
          expect(check.ok, typed).toBe(false);
          expect(ruleOf(check, "not_temporary"), typed).toBe(false);
          expect(passwordProblem(typed, owner), typed).not.toBeNull();
        }
      }
    }
  });

  it("is not one its owner can keep by rewriting it either, when the browser knows which one they were given", () => {
    const next = scrambled(314);
    for (let index = 0; index < 300; index += 1) {
      const issued = temporaryPassword(next);
      const owner: PasswordOwner = { ...AVERY, temporary: issued };
      const plain = issued.replace(/-/g, "");
      const rewritten = [
        plain,
        plain.toLowerCase(),
        issued.replace(/-/g, " "),
        `x${issued}`,
        `${issued}!`,
        `kite-${issued.toLowerCase()}-kite`,
        // A character or two short, at either end and in the middle.
        plain.slice(0, -1),
        plain.slice(1),
        plain.slice(0, -2),
        issued.slice(0, -1),
        `${plain.slice(0, 5)}${plain.slice(6)}`,
        // A character slipped in.
        `${plain.slice(0, 6)}-x-${plain.slice(6)}`,
      ];
      for (const typed of rewritten) {
        const check = checkPassword(typed, owner);
        expect(ruleOf(check, "not_temporary"), typed).toBe(false);
        expect(check.ok, typed).toBe(false);
      }
    }
  });

  it("makes a different password from different bytes", () => {
    const next = scrambled(42);
    const made = new Set(Array.from({ length: 200 }, () => temporaryPassword(next)));
    expect(made.size).toBe(200);
  });
});
