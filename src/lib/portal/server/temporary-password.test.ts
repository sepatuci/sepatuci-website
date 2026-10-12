import { describe, expect, it } from "vitest";
import { temporaryPassword } from "../password";
import { fingerprint, matchesIssued, type StoredTemporaryPassword } from "./temporary-password";

const ISSUED = "K7QM-2XRT-9BHD";
const ANOTHER = "W4PN-8GZC-3FJY";

/**
 * A fingerprint of ISSUED as one was stored, written out in full. Profiles hold
 * these until the password is replaced, so one written before a change to this
 * module must still be recognised after it.
 */
const STORED: StoredTemporaryPassword = {
  salt: "00112233445566778899aabbccddeeff",
  hash: "fe2ea1bafaf04e0be45698d44b4544ac56c0166d66832a9ad406f9055aff8b57",
};

/** Bytes that look random and are the same on every run. */
function scrambled(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state >>> 24;
  };
}

/** Whatever a profile might hold in that field, for the values no fingerprint would ever have. */
const stored = (value: unknown): StoredTemporaryPassword => value as StoredTemporaryPassword;

describe("fingerprint", () => {
  it("is a salt and a hash, both in hex, and nothing else", () => {
    const made = fingerprint(ISSUED);
    expect(Object.keys(made).sort()).toEqual(["hash", "salt"]);
    // Sixteen bytes of salt, and a SHA-256.
    expect(made.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(made.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("takes a fresh salt each time, so the same password never gives the same fingerprint twice", () => {
    const made = Array.from({ length: 200 }, () => fingerprint(ISSUED));
    expect(new Set(made.map((one) => one.salt)).size).toBe(200);
    expect(new Set(made.map((one) => one.hash)).size).toBe(200);
    // Each of them is still a fingerprint of that password.
    for (const one of made) expect(matchesIssued(ISSUED, one)).toBe(true);
  });

  it("never contains the password, in any way of writing it", () => {
    const next = scrambled(2026);
    for (const password of [ISSUED, ANOTHER, "FNDR-EDUC-2626", ...Array.from({ length: 200 }, () => temporaryPassword(next))]) {
      const text = JSON.stringify(fingerprint(password)).toUpperCase();
      expect(text.includes(password), password).toBe(false);
      expect(text.includes(password.replace(/-/g, "")), password).toBe(false);
      // Nor is the salt or the hash simply the password in another alphabet.
      expect(text.includes(Buffer.from(password).toString("hex").toUpperCase()), password).toBe(false);
      expect(text.includes(Buffer.from(password.replace(/-/g, "")).toString("hex").toUpperCase()), password).toBe(false);
      expect(text.includes(Buffer.from(password).toString("base64").toUpperCase()), password).toBe(false);
    }
  });

  it("is taken from the password without its dashes and in capitals, so however it was written it is the same password", () => {
    for (const written of [ISSUED.toLowerCase(), "K7QM2XRT9BHD", "k7qm 2xrt 9bhd", `  ${ISSUED}  `]) {
      const made = fingerprint(written);
      expect(matchesIssued(ISSUED, made), written).toBe(true);
      expect(matchesIssued(ANOTHER, made), written).toBe(false);
    }
  });

  it("differs for passwords that differ by one character", () => {
    const made = fingerprint(ISSUED);
    for (let index = 0; index < ISSUED.length; index += 1) {
      if (ISSUED[index] === "-") continue;
      const changed = `${ISSUED.slice(0, index)}${ISSUED[index] === "Z" ? "Y" : "Z"}${ISSUED.slice(index + 1)}`;
      expect(matchesIssued(changed, made), changed).toBe(false);
    }
  });
});

describe("matchesIssued", () => {
  it.each<[string, string]>([
    ["exactly as it was handed out", ISSUED],
    ["in lower case", ISSUED.toLowerCase()],
    ["in mixed case", "k7Qm-2xRt-9bHd"],
    ["with the dashes taken out", "K7QM2XRT9BHD"],
    ["with the dashes taken out, in lower case", "k7qm2xrt9bhd"],
    ["with spaces for dashes", "K7QM 2XRT 9BHD"],
    ["with spaces around it", `  ${ISSUED}  `],
    ["with dots, underscores and slashes for dashes", "K7QM.2XRT_9BHD/"],
    ["with a dash after every character", "K-7-Q-M-2-X-R-T-9-B-H-D"],
    ["with a character added before it", `x${ISSUED}`],
    ["with a digit added before it", `7${ISSUED}`],
    ["with a character added after it", `${ISSUED}y`],
    ["with a symbol added after it", `${ISSUED}!`],
    ["with words added before it", `kite-and-tea-${ISSUED}`],
    ["with words added after it", `${ISSUED}-kite-and-tea`],
    ["with something added on both sides", `my ${ISSUED.toLowerCase()} password`],
    ["with letters hard against it on both sides and no dashes", "kitesk7qm2xrt9bhdkites"],
    ["twice over", `${ISSUED}${ISSUED}`],
    ["at the end of the longest password allowed", `${"kite-and-tea-".repeat(9).slice(0, 114)}${ISSUED}`],
  ])("recognises the issued password %s", (_label, candidate) => {
    expect(matchesIssued(candidate, STORED)).toBe(true);
    expect(matchesIssued(candidate, fingerprint(ISSUED))).toBe(true);
  });

  it.each<[string, string]>([
    ["a different temporary password", ANOTHER],
    ["a different temporary password without its dashes", "W4PN8GZC3FJY"],
    ["the first character changed", "L7QM-2XRT-9BHD"],
    ["a character in the middle changed", "K7QM-2XRS-9BHD"],
    ["the last character changed", "K7QM-2XRT-9BHE"],
    ["the last character missing", "K7QM-2XRT-9BH"],
    ["the first character missing", "7QM-2XRT-9BHD"],
    ["a character added in the middle of it", "K7QM-2XxRT-9BHD"],
    ["its groups in another order", "2XRT-K7QM-9BHD"],
    ["it backwards", "DHB9-TRX2-MQ7K"],
    ["two of its three groups", "K7QM-2XRT"],
    ["two of its groups and something else", "K7QM-2XRT-kite-and-tea"],
    ["a password of the person's own", "correct-horse-battery"],
    ["a long password that never has it", "kite-and-tea-".repeat(9)],
    ["nothing", ""],
    ["nothing but dashes", "--------------"],
  ])("does not take %s for it", (_label, candidate) => {
    expect(matchesIssued(candidate, STORED)).toBe(false);
    expect(matchesIssued(candidate, fingerprint(ISSUED))).toBe(false);
  });

  it("goes by the salt as well as the hash: a hash under another salt is nobody's", () => {
    const one = fingerprint(ISSUED);
    const two = fingerprint(ISSUED);
    expect(matchesIssued(ISSUED, { salt: one.salt, hash: two.hash })).toBe(false);
    expect(matchesIssued(ISSUED, { salt: two.salt, hash: one.hash })).toBe(false);
    expect(matchesIssued(ISSUED, { salt: STORED.salt.toUpperCase(), hash: STORED.hash })).toBe(false);
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["nothing at all", undefined],
    ["an empty object", {}],
    ["a salt and no hash", { salt: STORED.salt }],
    ["a hash and no salt", { hash: STORED.hash }],
    ["a salt that is a number", { salt: 7, hash: STORED.hash }],
    ["a hash that is a number", { salt: STORED.salt, hash: 7 }],
    ["a salt that is null", { salt: null, hash: STORED.hash }],
    ["a hash that is null", { salt: STORED.salt, hash: null }],
    ["a hash that is a list", { salt: STORED.salt, hash: [STORED.hash] }],
    ["an empty salt and an empty hash", { salt: "", hash: "" }],
    ["an empty hash", { salt: STORED.salt, hash: "" }],
    ["a hash that is not hex", { salt: STORED.salt, hash: "not a hash at all" }],
    ["a hash cut short", { salt: STORED.salt, hash: STORED.hash.slice(0, 62) }],
    ["a hash with a byte too many", { salt: STORED.salt, hash: `${STORED.hash}00` }],
    ["the password itself where the hash should be", { salt: STORED.salt, hash: ISSUED }],
    ["the password itself", ISSUED],
    ["a number", 42],
    ["true", true],
    ["a list", [STORED.salt, STORED.hash]],
  ])("is false, and does not throw, when what is stored is %s", (_label, value) => {
    for (const candidate of [ISSUED, "K7QM2XRT9BHD", `x${ISSUED}y`, "correct-horse-battery", ""]) {
      expect(matchesIssued(candidate, stored(value)), candidate).toBe(false);
    }
  });

  it("recognises every temporary password it is handed, however it is rewritten, and no other", () => {
    const next = scrambled(77);
    let previous = ANOTHER;
    for (let index = 0; index < 150; index += 1) {
      const issued = temporaryPassword(next);
      const kept = fingerprint(issued);
      const plain = issued.replace(/-/g, "");
      for (const candidate of [issued, issued.toLowerCase(), plain, plain.toLowerCase(), issued.replace(/-/g, " "), `x${issued}`, `${issued}9`, `kite ${issued.toLowerCase()} kite`]) {
        expect(matchesIssued(candidate, kept), candidate).toBe(true);
      }
      // The one handed out before it is a different password.
      expect(matchesIssued(previous, kept), previous).toBe(false);
      expect(matchesIssued(`${plain.slice(1)}${plain[0]}`, kept), "its first character moved to the end").toBe(false);
      previous = issued;
    }
  });
});
