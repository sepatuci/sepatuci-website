import { describe, expect, it } from "vitest";
import { LIMITS } from "./constants";
import { ROSTER_MAX, UNSAFE_NAME_START, parseRoster, type RosterRow } from "./roster";

const AVERY: RosterRow = { line: 1, displayName: "Avery Chen", email: "avery.chen@uci.edu", problem: null };

const TWO_EMAILS = "More than one email on this line.";
const TOO_MANY_COLUMNS = "Too many columns. Keep just the name and the email.";
const STARTS_WITH_A_SYMBOL = "A name can't start with a symbol.";
const NOT_A_NAME = "That doesn't look like a name.";

const FIRST_NAMES = ["Avery", "Jordan", "Maya", "Sam", "Riley", "Casey", "Priya", "Marcus", "Dana", "Rowan"] as const;

/** A surname for every number, different each time and with no digit in it: Aa, Ab ... Az, Ba ... */
const surname = (index: number): string => `${String.fromCharCode(65 + (Math.floor(index / 26) % 26))}${String.fromCharCode(97 + (index % 26))}`;

/** One person as "Name, email". The address carries the number; the name, like any real one, has none. */
const person = (index: number): string => `${FIRST_NAMES[index % FIRST_NAMES.length]} ${surname(index)}, person${index}@uci.edu`;

/** `count` different people, one per line, as "Name, email". */
const people = (count: number, from = 0): string[] => Array.from({ length: count }, (_, index) => person(from + index));

const usable = (rows: RosterRow[]): RosterRow[] => rows.filter((row) => row.problem === null);

describe("the people these tests are built from", () => {
  it("are all different, with a name that is nothing but letters and an address that is theirs alone", () => {
    const lines = people(ROSTER_MAX * 3);
    const names = lines.map((line) => line.split(", ")[0]);
    const emails = lines.map((line) => line.split(", ")[1]);
    expect(new Set(names).size).toBe(ROSTER_MAX * 3);
    expect(new Set(emails).size).toBe(ROSTER_MAX * 3);
    for (const name of names) expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]$/);
    expect(person(0)).toBe("Avery Aa, person0@uci.edu");
    expect(person(27)).toBe("Marcus Bb, person27@uci.edu");
  });
});

describe("parseRoster", () => {
  describe("the ways a line can be written", () => {
    it.each<[string, string]>([
      ["a name, a comma and an email", "Avery Chen, avery.chen@uci.edu"],
      ["a comma with no space", "Avery Chen,avery.chen@uci.edu"],
      ["a tab, as pasted from a spreadsheet", "Avery Chen\tavery.chen@uci.edu"],
      ["a semicolon", "Avery Chen; avery.chen@uci.edu"],
      ["the form an email program writes", "Avery Chen <avery.chen@uci.edu>"],
      ["that form with no space before the bracket", "Avery Chen<avery.chen@uci.edu>"],
      ["the email first, then a comma", "avery.chen@uci.edu, Avery Chen"],
      ["the email first, then a tab", "avery.chen@uci.edu\tAvery Chen"],
      ["first and last name in separate spreadsheet columns", "Avery\tChen\tavery.chen@uci.edu"],
      ["the email between two columns of the name", "Avery\tavery.chen@uci.edu\tChen"],
      ["padding around the line and each part", "   Avery Chen  ,   avery.chen@uci.edu   "],
      ["a trailing comma", "Avery Chen, avery.chen@uci.edu,"],
      ["an empty spreadsheet column", "Avery Chen\t\tavery.chen@uci.edu"],
      ["runs of spaces inside the name", "Avery    Chen, avery.chen@uci.edu"],
    ])("reads %s", (_label, line) => {
      expect(parseRoster(line)).toEqual([AVERY]);
    });

    it("lower-cases the email and leaves the name as it was typed", () => {
      expect(parseRoster("avery CHEN, Avery.Chen@UCI.EDU")).toEqual([
        { line: 1, displayName: "avery CHEN", email: "avery.chen@uci.edu", problem: null },
      ]);
    });

    it("keeps a name of several words, accents and punctuation", () => {
      expect(parseRoster("María-José O'Neil de la Cruz, mj.oneil+fe@uci.edu")).toEqual([
        { line: 1, displayName: "María-José O'Neil de la Cruz", email: "mj.oneil+fe@uci.edu", problem: null },
      ]);
    });
  });

  describe("lines", () => {
    it("returns nothing for an empty paste, or one that is only blank lines", () => {
      expect(parseRoster("")).toEqual([]);
      expect(parseRoster("\n\n   \n\t\n")).toEqual([]);
    });

    it("skips blank lines, and numbers each row by the line it came from", () => {
      const rows = parseRoster("\nAvery Chen, avery.chen@uci.edu\n\n   \nJordan Patel\tjordan.patel@uci.edu\n");
      expect(rows).toEqual([
        { line: 2, displayName: "Avery Chen", email: "avery.chen@uci.edu", problem: null },
        { line: 5, displayName: "Jordan Patel", email: "jordan.patel@uci.edu", problem: null },
      ]);
    });

    it("reads Windows line endings, leaving no carriage return in a name or an email", () => {
      const rows = parseRoster("Avery Chen, avery.chen@uci.edu\r\navery.two@uci.edu, Avery Two\r\n");
      expect(rows).toEqual([
        { line: 1, displayName: "Avery Chen", email: "avery.chen@uci.edu", problem: null },
        { line: 2, displayName: "Avery Two", email: "avery.two@uci.edu", problem: null },
      ]);
    });

    it("reads a list that mixes every form, in the order it was pasted", () => {
      const rows = parseRoster(
        ["Avery Chen, avery.chen@uci.edu", "Jordan Patel\tjordan.patel@uci.edu", "Maya Rodriguez <maya.rodriguez@uci.edu>", "sam.okafor@uci.edu; Sam Okafor"].join("\n"),
      );
      expect(rows.map((row) => [row.line, row.displayName, row.email, row.problem])).toEqual([
        [1, "Avery Chen", "avery.chen@uci.edu", null],
        [2, "Jordan Patel", "jordan.patel@uci.edu", null],
        [3, "Maya Rodriguez", "maya.rodriguez@uci.edu", null],
        [4, "Sam Okafor", "sam.okafor@uci.edu", null],
      ]);
    });
  });

  describe("lines that cannot be used", () => {
    it.each<[string, string]>([
      ["only a name", "Avery Chen"],
      ["a name and a class, as in a header row", "Name, Class"],
      ["a spreadsheet header", "Name\tEmail"],
    ])("says there is no email on a line with %s", (_label, line) => {
      const [row] = parseRoster(line);
      expect(row.problem).toBe("No email on this line.");
      expect(row.email).toBe("");
    });

    it.each<[string, string]>([
      ["a Gmail address", "Avery Chen, avery.chen@gmail.com"],
      ["a UCI subdomain", "Avery Chen, avery.chen@ics.uci.edu"],
      ["a domain that only starts with uci.edu", "Avery Chen, avery.chen@uci.edu.evil.example"],
      ["a domain that only ends with uci.edu", "Avery Chen, avery.chen@notuci.edu"],
      ["an address with a space in it", "Avery Chen, avery chen@uci.edu"],
      ["an address with nothing before the at sign", "Avery Chen, @uci.edu"],
      ["a mailto link", "Avery Chen, mailto:avery.chen@uci.edu"],
    ])("refuses %s", (_label, line) => {
      const [row] = parseRoster(line);
      expect(row.problem).toBe("Not a @uci.edu address.");
      expect(row.displayName).toBe("Avery Chen");
    });

    it.each<[string, string]>([
      ["only an email", "avery.chen@uci.edu"],
      ["an email in brackets and nothing else", "<avery.chen@uci.edu>"],
      ["an email and empty columns", "\t, avery.chen@uci.edu ,,"],
    ])("says there is no name on a line with %s", (_label, line) => {
      expect(parseRoster(line)).toEqual([
        { line: 1, displayName: "", email: "avery.chen@uci.edu", problem: "No name on this line." },
      ]);
    });

    it("accepts a name of exactly the longest length an account may have, and refuses one character more", () => {
      const longest = "x".repeat(LIMITS.displayName);
      expect(parseRoster(`${longest}, long.name@uci.edu`)).toEqual([
        { line: 1, displayName: longest, email: "long.name@uci.edu", problem: null },
      ]);
      const [tooLong] = parseRoster(`${longest}x, long.name@uci.edu`);
      expect(tooLong.problem).toBe("That name is too long.");
      expect(tooLong.displayName).toHaveLength(LIMITS.displayName + 1);
    });

    it("measures a name after its spacing has been tidied, as the account will store it", () => {
      const spaced = `${"x".repeat(40)}${" ".repeat(30)}${"y".repeat(39)}`;
      expect(spaced.length).toBeGreaterThan(LIMITS.displayName);
      const [row] = parseRoster(`${spaced}, long.name@uci.edu`);
      expect(row.displayName).toHaveLength(LIMITS.displayName);
      expect(row.problem).toBeNull();
    });

    it("reports the first thing wrong with a line: the address, then the name, then a repeat", () => {
      expect(parseRoster("someone@gmail.com")[0].problem).toBe("Not a @uci.edu address.");
      expect(parseRoster(`${"x".repeat(LIMITS.displayName + 1)}, someone@gmail.com`)[0].problem).toBe("Not a @uci.edu address.");
      // A second address comes before anything else about either of them, and before the name.
      expect(parseRoster("someone@gmail.com, other@yahoo.com")[0].problem).toBe(TWO_EMAILS);
      expect(parseRoster("=cmd, avery.chen@uci.edu, avery.c@gmail.com")[0].problem).toBe(TWO_EMAILS);
      // An address outside UCI comes before a name that would be refused.
      expect(parseRoster("=cmd, someone@gmail.com")[0].problem).toBe("Not a @uci.edu address.");
      expect(parseRoster("Av3ry Chen, someone@gmail.com")[0].problem).toBe("Not a @uci.edu address.");
      expect(parseRoster("Avery Chen, Lambda, someone@gmail.com")[0].problem).toBe("Not a @uci.edu address.");
      // An extra column comes before how the name starts, what is in it and how long it is.
      expect(parseRoster(`=cmd, ${"x".repeat(LIMITS.displayName + 1)}, avery.chen@uci.edu`)[0].problem).toBe(TOO_MANY_COLUMNS);
      expect(parseRoster("Av3ry Chen, Lambda, avery.chen@uci.edu")[0].problem).toBe(TOO_MANY_COLUMNS);
      expect(parseRoster(`=${"x".repeat(LIMITS.displayName + 1)}, avery.chen@uci.edu`)[0].problem).toBe(STARTS_WITH_A_SYMBOL);
      // A symbol at the start comes before a digit further on, and a digit before the length.
      expect(parseRoster("=Av3ry Chen, avery.chen@uci.edu")[0].problem).toBe(STARTS_WITH_A_SYMBOL);
      expect(parseRoster(`${"x".repeat(LIMITS.displayName)}9, avery.chen@uci.edu`)[0].problem).toBe(NOT_A_NAME);
      // A repeat comes last: the line's own problem is reported the second time too.
      const repeated = parseRoster(
        "Avery Chen, avery.chen@uci.edu\nAvery Chen, Lambda, avery.chen@uci.edu\n=Avery, avery.chen@uci.edu\nAvery Chen 2, avery.chen@uci.edu",
      );
      expect(repeated.map((row) => row.problem)).toEqual([null, TOO_MANY_COLUMNS, STARTS_WITH_A_SYMBOL, NOT_A_NAME]);
    });

    // A display name is shown to teammates and to every active, who are never meant to be
    // sent anyone's email address. A roster with a school and a personal address in two
    // columns used to yield an account named "Avery Chen avery.c@gmail.com".
    it.each<[string, string]>([
      ["a school and a personal address in two columns", "Avery Chen\tavery.chen@uci.edu\tavery.c@gmail.com"],
      ["the personal address first", "Avery Chen, avery.c@gmail.com, avery.chen@uci.edu"],
      ["two UCI addresses", "Jordan Patel, jordan.patel@uci.edu, maya.rodriguez@uci.edu"],
      ["the same address twice", "Avery Chen, avery.chen@uci.edu, avery.chen@uci.edu"],
      ["an address in brackets and another after it", "Avery Chen <avery.chen@uci.edu>, avery.c@gmail.com"],
      ["two addresses and no name", "avery.chen@uci.edu, avery.c@gmail.com"],
      ["an address on either side of the name", "avery.chen@uci.edu; Avery Chen; avery.c@gmail.com"],
      ["a name that is an at sign and a handle", "@averychen, avery.chen@uci.edu"],
    ])("refuses a line with %s, and puts no address in the name", (_label, line) => {
      const [row] = parseRoster(line);
      expect(row.problem).toBe(TWO_EMAILS);
      expect(row.displayName).not.toContain("@");
      expect(usable(parseRoster(line))).toEqual([]);
    });

    it("never offers a name with an email address in it, however the addresses are arranged", () => {
      const lines = [
        "Avery Chen\tavery.chen@uci.edu\tavery.c@gmail.com",
        "Jordan Patel, jordan.patel@uci.edu, maya.rodriguez@uci.edu",
        "sam.okafor@uci.edu, Sam Okafor, sam@example.org",
        "Maya Rodriguez <maya.rodriguez@uci.edu> <maya@example.org>",
        "Riley Nguyen, riley.nguyen@uci.edu",
      ];
      const rows = parseRoster(lines.join("\n"));
      expect(rows).toHaveLength(5);
      for (const row of rows) expect(row.displayName, `line ${row.line}`).not.toContain("@");
      expect(usable(rows).map((row) => [row.line, row.displayName])).toEqual([[5, "Riley Nguyen"]]);
    });

    it.each<[string, string, string]>([
      ["a phone number", "Avery Chen\t949-555-0100\tavery.chen@uci.edu", "Avery Chen"],
      ["a major", "Avery Chen, Computer Science, avery.chen@uci.edu", "Avery Chen"],
      ["a class after a full name", "Avery Chen\tLambda\tavery.chen@uci.edu", "Avery Chen"],
      ["a graduation year", "Avery Chen; 2027; avery.chen@uci.edu", "Avery Chen"],
      ["a student number after a first name", "Avery\t12345678\tavery.chen@uci.edu", "Avery"],
      ["a last name with a number in it", "Avery\tChen2\tavery.chen@uci.edu", "Avery"],
      ["a first, a middle and a last name in three columns", "Avery\tQuinn\tChen\tavery.chen@uci.edu", "Avery"],
      ["a first name and a two-word last name in two columns", "Avery\tvan Chen\tavery.chen@uci.edu", "Avery"],
      ["the name twice", "Avery Chen, Avery Chen, avery.chen@uci.edu", "Avery Chen"],
      ["a formula with a comma in it", "=SUM(1,2), avery.chen@uci.edu", "=SUM(1"],
      ["a first name that starts with a symbol", "=Avery\tChen\tavery.chen@uci.edu", "=Avery"],
    ])("refuses a line with %s, and folds nothing into the name", (_label, line, firstPart) => {
      expect(parseRoster(line)).toEqual([{ line: 1, displayName: firstPart, email: "avery.chen@uci.edu", problem: TOO_MANY_COLUMNS }]);
    });

    it.each<[string, string, string]>([
      ["plain", "Avery\tChen\tavery.chen@uci.edu", "Avery Chen"],
      ["with the email between them", "Avery, avery.chen@uci.edu, Chen", "Avery Chen"],
      ["with accents and a hyphen", "María-José\tNúñez\tavery.chen@uci.edu", "María-José Núñez"],
      ["with a straight apostrophe", "Siobhán; O'Neil; avery.chen@uci.edu", "Siobhán O'Neil"],
      ["with a curly apostrophe", "Siobhán\tO’Neil\tavery.chen@uci.edu", "Siobhán O’Neil"],
      ["with an initial", "Avery\tC.\tavery.chen@uci.edu", "Avery C."],
      ["of one letter each", "A\tC\tavery.chen@uci.edu", "A C"],
    ])("joins a first and a last name in two columns, %s", (_label, line, displayName) => {
      expect(parseRoster(line)).toEqual([{ line: 1, displayName, email: "avery.chen@uci.edu", problem: null }]);
    });

    // A spreadsheet runs a cell that starts with one of these as a formula, and names are
    // copied out of the portal next to set-password links.
    it.each<[string, string]>([
      ["an equals sign", "=HYPERLINK(\"https://evil.example\")"],
      ["an equals sign after padding", "   =1+1"],
      ["a plus sign", "+1 949 555 0100"],
      ["a hyphen", "-Avery Chen"],
      ["a hyphen and a formula", "-2+3"],
    ])("refuses a name that starts with %s", (_label, name) => {
      for (const line of [`${name}, avery.chen@uci.edu`, `avery.chen@uci.edu\t${name}`, `${name} <avery.chen@uci.edu>`]) {
        const [row] = parseRoster(line);
        expect(row.problem, line).toBe(STARTS_WITH_A_SYMBOL);
        expect(row.email, line).toBe("avery.chen@uci.edu");
      }
    });

    it("accepts a name with one of those symbols anywhere but the start", () => {
      for (const name of ["Anne-Marie O'Neil", "Avery (AJ) Chen", "J. R. Chen-Okafor", "Avery = Chen", "Avery+Chen", "Avery -Chen"]) {
        expect(parseRoster(`${name}, avery.chen@uci.edu`), name).toEqual([{ line: 1, displayName: name, email: "avery.chen@uci.edu", problem: null }]);
      }
    });

    // A phone number, a student number or a graduation year in the name column would
    // otherwise become what the person is called everywhere in the portal.
    describe("a name that does not look like one", () => {
      it.each<[string, string]>([
        ["a digit at the start", "3M Chen"],
        ["a digit at the end", "Avery Chen2"],
        ["a digit in the middle of a word", "Av3ry Chen"],
        ["a digit on its own", "Avery 2 Chen"],
        ["a graduation year after it", "Avery Chen 2027"],
        ["a student number and nothing else", "12345678"],
        ["a phone number and nothing else", "949-555-0100"],
        ["a phone number with its area code in brackets", "(949) 555-0100"],
        ["an opening bracket at the start", "(Avery) Chen"],
        ["an apostrophe at the start, as a spreadsheet marks text", "'=Avery"],
        ["a quotation mark at the start", '"Avery" Chen'],
        ["a full stop at the start", ".Avery Chen"],
        ["an underscore at the start", "_Avery Chen"],
        ["a slash at the start", "/Avery Chen"],
        ["a picture at the start", "🙂 Avery Chen"],
      ])("refuses %s, and keeps the line as it was typed for pointing at", (_label, name) => {
        for (const line of [`${name}, avery.chen@uci.edu`, `avery.chen@uci.edu\t${name}`, `${name} <avery.chen@uci.edu>`]) {
          expect(parseRoster(line), line).toEqual([{ line: 1, displayName: name, email: "avery.chen@uci.edu", problem: NOT_A_NAME }]);
        }
      });

      it.each([
        "Avery Chen",
        "avery chen",
        "A",
        "Ávery Chen",
        "Élodie Dupont",
        "Åsa Lindqvist",
        "Łukasz Nowak",
        "Олег Петров",
        "张伟",
        "José María de la Cruz",
        "Anne-Marie O'Neil",
        "D’Angelo Russo",
        "J. R. Chen-Okafor",
        "Avery (AJ) Chen",
        "Avery Chen Jr.",
        "Avery Chen III",
        "Avery Chen PhD",
      ])("accepts %j: it starts with a letter, of any alphabet, and has no digit in it", (name) => {
        expect(parseRoster(`${name}, avery.chen@uci.edu`)).toEqual([{ line: 1, displayName: name, email: "avery.chen@uci.edu", problem: null }]);
      });

      it("goes by the name alone: a digit in the address is nobody's problem", () => {
        expect(parseRoster("Avery Chen, avery.chen2@uci.edu\nJordan Patel\tjpatel27@uci.edu")).toEqual([
          { line: 1, displayName: "Avery Chen", email: "avery.chen2@uci.edu", problem: null },
          { line: 2, displayName: "Jordan Patel", email: "jpatel27@uci.edu", problem: null },
        ]);
      });

      it("is asked after how the name starts, so a formula or a phone number with a plus is still called a symbol", () => {
        for (const name of ['=HYPERLINK("https://evil.example/1")', "=1+1", "+1 949 555 0100", "-2+3", "-Avery 2"]) {
          expect(parseRoster(`${name}, avery.chen@uci.edu`)[0].problem, name).toBe(STARTS_WITH_A_SYMBOL);
        }
      });

      it("is asked before the length, at the limit and one past it", () => {
        const longest = "x".repeat(LIMITS.displayName - 1);
        // Exactly the longest name allowed, ending in a digit: it is the digit that is wrong with it.
        expect(parseRoster(`${longest}7, long.name@uci.edu`)[0].problem).toBe(NOT_A_NAME);
        expect(parseRoster(`${longest}x7, long.name@uci.edu`)[0].problem).toBe(NOT_A_NAME);
        expect(parseRoster(`7${longest}x, long.name@uci.edu`)[0].problem).toBe(NOT_A_NAME);
        // Without the digit the same lengths are fine, and then too long.
        expect(parseRoster(`${longest}x, long.name@uci.edu`)[0].problem).toBeNull();
        expect(parseRoster(`${longest}xx, long.name@uci.edu`)[0].problem).toBe("That name is too long.");
      });

      it("is asked of a first and a last name in two columns once they are put together", () => {
        // Two single words are joined, so neither can carry a digit: a column with one is an extra column.
        expect(parseRoster("Avery\tChen\tavery.chen@uci.edu")[0].problem).toBeNull();
        expect(parseRoster("Avery\tChen2\tavery.chen@uci.edu")[0].problem).toBe(TOO_MANY_COLUMNS);
        expect(parseRoster("4very\tChen\tavery.chen@uci.edu")[0].problem).toBe(TOO_MANY_COLUMNS);
      });

      it("does not offer the line for creation, and leaves the lines around it alone", () => {
        const rows = parseRoster(["Avery Chen 2027, avery.chen@uci.edu", "Jordan Patel, jordan.patel@uci.edu", "949-555-0100, maya.rodriguez@uci.edu"].join("\n"));
        expect(rows.map((row) => [row.line, row.problem])).toEqual([
          [1, NOT_A_NAME],
          [2, null],
          [3, NOT_A_NAME],
        ]);
        expect(usable(rows)).toEqual([{ line: 2, displayName: "Jordan Patel", email: "jordan.patel@uci.edu", problem: null }]);
      });
    });

    it("names the characters a name may not start with, for the server to refuse them too", () => {
      for (const start of ["=", "+", "-", "@", "\t", "\r"]) expect(UNSAFE_NAME_START.test(`${start}Avery Chen`), JSON.stringify(start)).toBe(true);
      for (const name of ["Avery Chen", "avery", "Ávery", "3M", "'=Avery", "(Avery)", " =Avery", "A=B", "A+B", "A-B", "A@B", ""]) {
        expect(UNSAFE_NAME_START.test(name), JSON.stringify(name)).toBe(false);
      }
    });

    it("keeps an unusable line in the result, in its place, so it can be pointed at", () => {
      const rows = parseRoster("Avery Chen, avery.chen@uci.edu\nJordan Patel\nMaya Rodriguez, maya.rodriguez@uci.edu");
      expect(rows.map((row) => [row.line, row.problem])).toEqual([
        [1, null],
        [2, "No email on this line."],
        [3, null],
      ]);
    });
  });

  describe("the same address twice", () => {
    it("keeps the first and marks each later one, whatever name it is under", () => {
      const rows = parseRoster(
        ["Avery Chen, avery.chen@uci.edu", "Jordan Patel, jordan.patel@uci.edu", "A. Chen, avery.chen@uci.edu", "Avery again <avery.chen@uci.edu>"].join("\n"),
      );
      expect(rows.map((row) => row.problem)).toEqual([
        null,
        null,
        "This address is on the list twice.",
        "This address is on the list twice.",
      ]);
      expect(usable(rows).map((row) => row.email)).toEqual(["avery.chen@uci.edu", "jordan.patel@uci.edu"]);
    });

    it("treats addresses that differ only in case as the same", () => {
      const rows = parseRoster("Avery Chen, avery.chen@uci.edu\nAvery Chen, Avery.Chen@UCI.edu");
      expect(rows.map((row) => row.problem)).toEqual([null, "This address is on the list twice."]);
      expect(rows[1].email).toBe("avery.chen@uci.edu");
    });

    it("does not confuse two people who share a name", () => {
      const rows = parseRoster("Alex Kim, alex.kim1@uci.edu\nAlex Kim, alex.kim2@uci.edu");
      expect(rows.map((row) => row.problem)).toEqual([null, null]);
    });

    it("never offers the same address for creation twice", () => {
      const rows = parseRoster([...people(5), ...people(5), ...people(3)].join("\n"));
      const emails = usable(rows).map((row) => row.email);
      expect(emails).toHaveLength(5);
      expect(new Set(emails).size).toBe(5);
    });
  });

  describe(`the cap of ${ROSTER_MAX} at once`, () => {
    it("is 100", () => {
      expect(ROSTER_MAX).toBe(100);
    });

    it("accepts a list of exactly the cap", () => {
      const rows = parseRoster(people(ROSTER_MAX).join("\n"));
      expect(rows).toHaveLength(ROSTER_MAX);
      expect(usable(rows)).toHaveLength(ROSTER_MAX);
    });

    it("marks everyone after the cap, and keeps them in the result", () => {
      const rows = parseRoster(people(ROSTER_MAX + 3).join("\n"));
      expect(rows).toHaveLength(ROSTER_MAX + 3);
      expect(usable(rows)).toHaveLength(ROSTER_MAX);
      expect(usable(rows).map((row) => row.line)).toEqual(Array.from({ length: ROSTER_MAX }, (_, index) => index + 1));
      for (const row of rows.slice(ROSTER_MAX)) {
        expect(row.problem).toBe("Only 100 people can be added at once.");
        expect(row.email).toMatch(/^person\d+@uci\.edu$/);
      }
    });

    it("never offers more than the cap for creation, however long the paste", () => {
      expect(usable(parseRoster(people(ROSTER_MAX * 3).join("\n")))).toHaveLength(ROSTER_MAX);
    });

    it("does not count blank lines towards the cap", () => {
      const spaced = people(ROSTER_MAX).flatMap((line) => [line, "", "   "]);
      const rows = parseRoster(spaced.join("\n"));
      expect(rows).toHaveLength(ROSTER_MAX);
      expect(usable(rows)).toHaveLength(ROSTER_MAX);
      expect(rows[ROSTER_MAX - 1].line).toBe((ROSTER_MAX - 1) * 3 + 1);
    });

    it("keeps a line's own problem past the cap, rather than blaming the cap", () => {
      const rows = parseRoster([...people(ROSTER_MAX), "No Email Here", "Outsider, outsider@gmail.com", person(0), "Agent 47, agent.fortyseven@uci.edu"].join("\n"));
      expect(rows.slice(ROSTER_MAX).map((row) => row.problem)).toEqual([
        "No email on this line.",
        "Not a @uci.edu address.",
        "This address is on the list twice.",
        NOT_A_NAME,
      ]);
    });

    // The cap is on people added, not on lines pasted: a line that cannot be used takes nobody's place.
    it("lets a full list of 100 people through when the paste also has a spreadsheet header row", () => {
      const rows = parseRoster(["Name\tEmail", ...people(ROSTER_MAX)].join("\n"));
      expect(rows[0].problem).toBe("No email on this line.");
      expect(usable(rows)).toHaveLength(ROSTER_MAX);
      expect(rows.map((row) => row.problem)).not.toContain("Only 100 people can be added at once.");
    });

    it("counts only the lines that can be used, whatever is wrong with the others and wherever they are", () => {
      const unusable = [
        "Name\tEmail",
        "No Email Here",
        "Outsider, outsider@gmail.com",
        "nameless@uci.edu",
        person(0),
        "Two Emails, two.emails@uci.edu, two@example.org",
        "Extra Column, Lambda, extra.column@uci.edu",
        "=Formula, formula@uci.edu",
        "Agent 47, agent.fortyseven@uci.edu",
        `${"x".repeat(LIMITS.displayName + 1)}, long.name@uci.edu`,
      ];
      // One unusable line before every person, 100 times over, and all of them again at the end.
      const lines = people(ROSTER_MAX).flatMap((person, index) => [unusable[index % unusable.length], person]);
      const rows = parseRoster([...lines, ...unusable].join("\n"));

      expect(rows).toHaveLength(2 * ROSTER_MAX + unusable.length);
      expect(usable(rows).map((row) => row.email)).toEqual(Array.from({ length: ROSTER_MAX }, (_, index) => `person${index}@uci.edu`));
      expect(rows.map((row) => row.problem)).not.toContain("Only 100 people can be added at once.");
      // Each of the others keeps its own problem.
      expect(new Set(rows.slice(-unusable.length).map((row) => row.problem))).toEqual(
        new Set([
          "No email on this line.",
          "Not a @uci.edu address.",
          "No name on this line.",
          "This address is on the list twice.",
          TWO_EMAILS,
          TOO_MANY_COLUMNS,
          STARTS_WITH_A_SYMBOL,
          NOT_A_NAME,
          "That name is too long.",
        ]),
      );
    });

    it("turns away exactly the people after the hundredth who could have been added, by where they are among those", () => {
      const lines = ["Name\tEmail", ...people(50), "No Email Here", "Outsider, outsider@gmail.com", ...people(53, 50)];
      const rows = parseRoster(lines.join("\n"));
      expect(usable(rows)).toHaveLength(ROSTER_MAX);
      expect(usable(rows).map((row) => row.email).slice(-1)).toEqual(["person99@uci.edu"]);
      const turnedAway = rows.filter((row) => row.problem === "Only 100 people can be added at once.");
      expect(turnedAway.map((row) => [row.line, row.email])).toEqual([
        [104, "person100@uci.edu"],
        [105, "person101@uci.edu"],
        [106, "person102@uci.edu"],
      ]);
    });

    it("does not let a repeat of someone already turned away take a place either", () => {
      const rows = parseRoster([...people(ROSTER_MAX + 1), person(ROSTER_MAX)].join("\n"));
      expect(rows.slice(ROSTER_MAX).map((row) => row.problem)).toEqual([
        "Only 100 people can be added at once.",
        "This address is on the list twice.",
      ]);
      expect(usable(rows)).toHaveLength(ROSTER_MAX);
    });
  });
});
