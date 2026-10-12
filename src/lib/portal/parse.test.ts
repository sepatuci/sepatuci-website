import { describe, expect, it } from "vitest";
import { isEmail, isHttpUrl, isNumeric, isRecord, readBoolean, readEnum, readInteger, readText } from "./parse";

describe("isRecord", () => {
  it.each<[string, unknown]>([
    ["a plain object", { a: 1 }],
    ["an empty object", {}],
    ["an object with no prototype", Object.create(null)],
  ])("accepts %s", (_label, value) => {
    expect(isRecord(value)).toBe(true);
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["undefined", undefined],
    ["an array", [1, 2]],
    ["an empty array", []],
    ["a string", "{}"],
    ["a number", 1],
    ["a boolean", true],
    ["a function", () => ({})],
  ])("rejects %s", (_label, value) => {
    expect(isRecord(value)).toBe(false);
  });
});

describe("readText", () => {
  it("returns a plain string unchanged", () => {
    expect(readText("Informatics", 100)).toEqual({ ok: true, value: "Informatics" });
  });

  it.each<[string, unknown]>([
    ["a number", 42],
    ["null", null],
    ["undefined", undefined],
    ["an array", ["a"]],
    ["an object", { toString: () => "a" }],
    ["a boolean", false],
  ])("refuses %s as not text", (_label, value) => {
    expect(readText(value, 100)).toEqual({ ok: false, reason: "type" });
  });

  it("trims surrounding whitespace", () => {
    expect(readText("  \t hello \n ", 100)).toEqual({ ok: true, value: "hello" });
    expect(readText("   ", 100)).toEqual({ ok: true, value: "" });
  });

  it("flattens line breaks and tabs to single spaces in single-line text", () => {
    expect(readText("one\ntwo\r\nthree\tfour\n\n\nfive", 100)).toEqual({
      ok: true,
      value: "one two three four five",
    });
  });

  it("keeps line breaks and tabs in multi-line text, normalizing CRLF and lone CR to LF", () => {
    expect(readText("one\r\ntwo\rthree\n\tfour", 100, true)).toEqual({
      ok: true,
      value: "one\ntwo\nthree\n\tfour",
    });
  });

  it("strips ASCII control characters", () => {
    expect(readText("a\u0000b\u0007c\u001Bd\u007Fe", 100)).toEqual({ ok: true, value: "abcde" });
    expect(readText("a\u000Bb\u000Cc", 100, true)).toEqual({ ok: true, value: "abc" });
  });

  it("strips bidirectional override and isolate characters", () => {
    const hostile = "invoice‮fdp.exe‬ ⁦x⁩‪‫‭⁧⁨";
    expect(readText(hostile, 100)).toEqual({ ok: true, value: "invoicefdp.exe x" });
  });

  it("leaves ordinary non-ASCII text alone", () => {
    // The last character sits outside the basic plane, so it takes two code units.
    expect(readText("Zoë Nguyễn 山田 𝒳", 100)).toEqual({ ok: true, value: "Zoë Nguyễn 山田 𝒳" });
  });

  it("accepts text of exactly the limit and refuses one character more", () => {
    expect(readText("x".repeat(10), 10)).toEqual({ ok: true, value: "x".repeat(10) });
    expect(readText("x".repeat(11), 10)).toEqual({ ok: false, reason: "too_long" });
  });

  it("measures length after cleaning, so padding and stripped characters do not count", () => {
    expect(readText(`   ${"x".repeat(10)}   `, 10)).toEqual({ ok: true, value: "x".repeat(10) });
    expect(readText(`${"x".repeat(10)}\u0000\u0000‮`, 10)).toEqual({ ok: true, value: "x".repeat(10) });
  });

  it("accepts an empty string", () => {
    expect(readText("", 10)).toEqual({ ok: true, value: "" });
  });
});

describe("readBoolean and readInteger", () => {
  it("accept only real booleans", () => {
    expect(readBoolean(true)).toBe(true);
    expect(readBoolean(false)).toBe(false);
    for (const value of ["true", 1, 0, null, undefined, {}]) expect(readBoolean(value)).toBeNull();
  });

  it("accept only real integers", () => {
    expect(readInteger(0)).toBe(0);
    expect(readInteger(-3)).toBe(-3);
    expect(readInteger(10)).toBe(10);
    for (const value of [4.5, "4", Number.NaN, Number.POSITIVE_INFINITY, null, undefined, true, [4]]) {
      expect(readInteger(value)).toBeNull();
    }
  });
});

describe("readEnum", () => {
  const STATUSES = ["draft", "published", "archived"] as const;

  it("returns a value that is in the list", () => {
    expect(readEnum("published", STATUSES)).toBe("published");
  });

  it.each<[string, unknown]>([
    ["a value not in the list", "deleted"],
    ["the right value in the wrong case", "Published"],
    ["a value with padding", " published"],
    ["an empty string", ""],
    ["a number", 1],
    ["null", null],
    ["undefined", undefined],
    ["an array holding a valid value", ["published"]],
    ["an object", { value: "published" }],
  ])("is null for %s", (_label, value) => {
    expect(readEnum(value, STATUSES)).toBeNull();
  });

  it("does not accept the names of array methods or properties", () => {
    expect(readEnum("length", STATUSES)).toBeNull();
    expect(readEnum("includes", STATUSES)).toBeNull();
  });
});

describe("isHttpUrl", () => {
  it.each([
    "https://example.org",
    "https://docs.google.com/document/d/1AbC_dEf-123/edit?usp=sharing#heading=h.abc",
    "HTTPS://EXAMPLE.ORG",
    "Https://Example.org/Path",
    "https://example.org:8443/path",
    "https://localhost:3000",
    "https://127.0.0.1/x",
    "https://sub.domain.example.co.uk/a/b/c",
    "https://example.org/path with spaces",
  ])("accepts %s", (value) => {
    expect(isHttpUrl(value)).toBe(true);
  });

  it.each([
    "http://example.org",
    "Http://Example.org/Path",
    "HTTP://EXAMPLE.ORG",
    "http://localhost:3000",
    "http://127.0.0.1/x",
    "http://docs.google.com/document/d/abc",
    "http://",
    "http//example.org",
    "httpx://example.org",
    "shttp://example.org",
    "https+http://example.org",
  ])("rejects %s, which is not https", (value) => {
    expect(isHttpUrl(value)).toBe(false);
  });

  // "https://docs.google.com@elsewhere.example" reads as Google and goes elsewhere.
  it.each([
    "https://docs.google.com@elsewhere.example",
    "https://docs.google.com@elsewhere.example/document/d/abc",
    "https://docs.google.com:443@elsewhere.example",
    "https://user@example.org",
    "https://user:password@example.org",
    "https://user:@example.org",
    "https://:password@example.org",
    "https://a%40b@example.org",
    "HTTPS://USER@EXAMPLE.ORG",
    "https://user@example.org:8443/path?x=1#y",
  ])("rejects %s, which carries a name or password before the host", (value) => {
    expect(isHttpUrl(value)).toBe(false);
  });

  it.each([
    "https://medium.com/@someone/a-post",
    "https://example.org/path@host",
    "https://example.org/?to=someone@example.com",
    "https://example.org/#section@anchor",
    "https://example.org/a%40b",
  ])("accepts %s, where the at sign comes after the host", (value) => {
    expect(isHttpUrl(value)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "javascript://example.org/%0Aalert(1)",
    " https://example.org",
    "\thttps://example.org",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.org",
    "ws://example.org",
    "wss://example.org",
    "mailto:someone@example.org",
    "tel:+19495550100",
    "blob:https://example.org/uuid",
    "//example.org",
    "/relative/path",
    "example.org",
    "www.example.org",
    "https://",
    "https:example.org",
    "https:/example.org",
    "https://exa mple.org",
    "",
  ])("rejects %s", (value) => {
    expect(isHttpUrl(value)).toBe(false);
  });
});

describe("isEmail", () => {
  it.each(["avery.chen@uci.edu", "a@b.co", "first+tag@sub.example.org", "UPPER@EXAMPLE.ORG"])(
    "accepts %s",
    (value) => {
      expect(isEmail(value)).toBe(true);
    },
  );

  it.each([
    "avery",
    "avery@",
    "@uci.edu",
    "avery@uci",
    "avery@.edu",
    "avery chen@uci.edu",
    "avery@uci .edu",
    "avery@@uci.edu",
    "a@b@uci.edu",
    "avery@uci.edu\n",
    "",
  ])("rejects %s", (value) => {
    expect(isEmail(value)).toBe(false);
  });

  it("accepts an address of exactly 254 characters and rejects one more", () => {
    const domain = "@example.org";
    expect(isEmail("a".repeat(254 - domain.length) + domain)).toBe(true);
    expect(isEmail("a".repeat(255 - domain.length) + domain)).toBe(false);
  });
});

describe("isNumeric", () => {
  it.each(["0", "7", "42", "-42", "3.14", "-0.5", "0.0", "007", "123456789012345678901234567890"])(
    "accepts %s",
    (value) => {
      expect(isNumeric(value)).toBe(true);
    },
  );

  it.each(["", " ", "abc", "4 interviews", "1e5", "1,000", ".5", "5.", "+5", "--5", "5-", "1.2.3", "0x1F", "Infinity", "NaN", " 5", "5 ", "5\n", "٥"])(
    "rejects %j",
    (value) => {
      expect(isNumeric(value)).toBe(false);
    },
  );
});
