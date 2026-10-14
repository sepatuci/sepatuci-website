import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PortalConfigError, type PortalEnv } from "./env";
import { reportLimitId } from "./report-key";

const live = (privateKey: string): PortalEnv => ({
  mode: "live",
  projectId: "sep-example",
  adminEmails: [],
  serviceAccount: { clientEmail: "portal@sep-example.iam.gserviceaccount.com", privateKey },
});
const emulator: PortalEnv = { mode: "emulator", projectId: "demo-sep-portal", adminEmails: [], serviceAccount: null };

describe("reportLimitId", () => {
  it("is the same for the same account and key, and a 64-character hex id", () => {
    const id = reportLimitId(live("key-one"), "uidAlpha");
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(reportLimitId(live("key-one"), "uidAlpha")).toBe(id);
  });

  it("differs for every account and for every key", () => {
    const ids = new Set([
      reportLimitId(live("key-one"), "uidAlpha"),
      reportLimitId(live("key-one"), "uidBravo"),
      reportLimitId(live("key-two"), "uidAlpha"),
      reportLimitId(emulator, "uidAlpha"),
    ]);
    expect(ids.size).toBe(4);
  });

  it("does not contain the account, and is not a plain hash of it", () => {
    const id = reportLimitId(live("key-one"), "uidAlpha");
    expect(id).not.toContain("uidAlpha");
    expect(id).not.toBe(createHash("sha256").update("uidAlpha").digest("hex"));
    // Nor the private key used directly: it is used through a key of its own.
    expect(id).not.toBe(createHmac("sha256", "key-one").update("uidAlpha").digest("hex"));
  });

  it("works in the emulators, which have no key", () => {
    expect(reportLimitId(emulator, "uidAlpha")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses to run live without a key", () => {
    const broken: PortalEnv = { ...live("unused"), serviceAccount: null };
    expect(() => reportLimitId(broken, "uidAlpha")).toThrow(PortalConfigError);
  });
});
