import { describe, expect, it } from "vitest";
import { stableStringify } from "./stable-json";

describe("stableStringify", () => {
  it("gives the same string for the same object in a different key order", () => {
    const declared = { id: "q1", title: "Name", description: "", type: "short_text", required: true };
    const fromStore = { description: "", id: "q1", required: true, title: "Name", type: "short_text" };
    expect(JSON.stringify(declared)).not.toBe(JSON.stringify(fromStore));
    expect(stableStringify(declared)).toBe(stableStringify(fromStore));
  });

  it("sorts keys inside arrays and nested objects", () => {
    const a = [{ b: { y: 1, x: [{ n: 1, m: 2 }] }, a: null }];
    const b = [{ a: null, b: { x: [{ m: 2, n: 1 }], y: 1 } }];
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(stableStringify(a)).toBe('[{"a":null,"b":{"x":[{"m":2,"n":1}],"y":1}}]');
  });

  it("still tells different content apart", () => {
    expect(stableStringify({ title: "A", questions: [] })).not.toBe(
      stableStringify({ title: "B", questions: [] }),
    );
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
    expect(stableStringify({ required: true })).not.toBe(stableStringify({ required: false }));
  });

  it("leaves primitives and undefined as JSON.stringify does", () => {
    expect(stableStringify("x")).toBe('"x"');
    expect(stableStringify(3)).toBe("3");
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
});
