import { describe, expect, it } from "vitest";
import { parseAdminEmails, PortalConfigError, readPortalEnv } from "./env";

type Env = Record<string, string | undefined>;

/** The environment `firebase emulators:exec` provides, plus the admin list. */
const EMULATOR: Env = {
  NODE_ENV: "development",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  GCLOUD_PROJECT: "demo-sep-portal",
  PORTAL_ADMIN_EMAILS: "chair.one@uci.edu,chair.two@uci.edu",
};

const LIVE: Env = {
  NODE_ENV: "production",
  VERCEL: "1",
  VERCEL_ENV: "production",
  FIREBASE_PROJECT_ID: "sep-portal-prod",
  FIREBASE_CLIENT_EMAIL: "firebase-adminsdk-abc@sep-portal-prod.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nMIIabc\\n-----END PRIVATE KEY-----\\n",
  PORTAL_ADMIN_EMAILS: "chair.one@uci.edu",
};

function configError(env: Env): PortalConfigError {
  try {
    readPortalEnv(env);
  } catch (error) {
    if (error instanceof PortalConfigError) return error;
    throw error;
  }
  throw new Error("Expected readPortalEnv to refuse this environment, but it returned a configuration.");
}

function expectUnsafe(env: Env, reason: RegExp): void {
  const error = configError(env);
  expect(error.code).toBe("unsafe_environment");
  expect(error.message).toMatch(/^Refusing to use the Firebase emulators: /);
  expect(error.message).toMatch(reason);
}

describe("parseAdminEmails", () => {
  it("splits on commas, trims and lower-cases", () => {
    expect(parseAdminEmails(" Chair.One@UCI.edu , chair.two@uci.edu")).toEqual([
      "chair.one@uci.edu",
      "chair.two@uci.edu",
    ]);
  });

  it("drops empty entries from stray commas", () => {
    expect(parseAdminEmails(",chair.one@uci.edu,, ,chair.two@uci.edu,")).toEqual([
      "chair.one@uci.edu",
      "chair.two@uci.edu",
    ]);
  });

  it.each<[string, string | undefined]>([
    ["undefined", undefined],
    ["an empty string", ""],
    ["only whitespace and commas", " , , "],
  ])("is an empty list for %s, which leaves the portal with no admins rather than open", (_label, raw) => {
    expect(parseAdminEmails(raw)).toEqual([]);
  });
});

describe("readPortalEnv", () => {
  describe("emulator mode", () => {
    it("is used when both emulators are local and the project is a demo project", () => {
      expect(readPortalEnv(EMULATOR)).toEqual({
        mode: "emulator",
        projectId: "demo-sep-portal",
        adminEmails: ["chair.one@uci.edu", "chair.two@uci.edu"],
        serviceAccount: null,
      });
    });

    it("is used under the test runner's NODE_ENV and when NODE_ENV is not set", () => {
      expect(readPortalEnv({ ...EMULATOR, NODE_ENV: "test" }).mode).toBe("emulator");
      expect(readPortalEnv({ ...EMULATOR, NODE_ENV: undefined }).mode).toBe("emulator");
    });

    it.each<[string, string, string]>([
      ["127.0.0.1", "127.0.0.1:9099", "127.0.0.1:8080"],
      ["localhost", "localhost:9099", "localhost:8080"],
      ["upper-case LOCALHOST", "LOCALHOST:9099", "Localhost:8080"],
      ["IPv6 loopback in brackets", "[::1]:9099", "[::1]:8080"],
      ["a mix of loopback names", "localhost:9099", "[::1]:8080"],
      ["one-digit and five-digit ports", "127.0.0.1:1", "localhost:65535"],
    ])("accepts %s as this machine", (_label, auth, firestore) => {
      const env = { ...EMULATOR, FIREBASE_AUTH_EMULATOR_HOST: auth, FIRESTORE_EMULATOR_HOST: firestore };
      expect(readPortalEnv(env).mode).toBe("emulator");
    });

    it.each<[string, Env]>([
      ["FIREBASE_PROJECT_ID", { FIREBASE_PROJECT_ID: "demo-from-firebase", GCLOUD_PROJECT: undefined }],
      ["GCLOUD_PROJECT", { GCLOUD_PROJECT: "demo-from-gcloud" }],
      ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", { GCLOUD_PROJECT: undefined, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-from-public" }],
    ])("takes the project id from %s", (_key, overrides) => {
      const projectId = Object.values(overrides).find((value) => value !== undefined);
      expect(readPortalEnv({ ...EMULATOR, ...overrides }).projectId).toBe(projectId);
    });

    it("prefers FIREBASE_PROJECT_ID, then GCLOUD_PROJECT, then the public id", () => {
      const all = {
        ...EMULATOR,
        FIREBASE_PROJECT_ID: "demo-first",
        GCLOUD_PROJECT: "demo-second",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-third",
      };
      expect(readPortalEnv(all).projectId).toBe("demo-first");
      expect(readPortalEnv({ ...all, FIREBASE_PROJECT_ID: undefined }).projectId).toBe("demo-second");
    });
  });

  describe("refusing emulator mode (fail closed)", () => {
    it("refuses when NODE_ENV is production", () => {
      expectUnsafe({ ...EMULATOR, NODE_ENV: "production" }, /production environment/);
    });

    it.each<[string, Env]>([
      ["VERCEL is set", { VERCEL: "1" }],
      ["VERCEL_ENV is production", { VERCEL_ENV: "production" }],
      ["VERCEL_ENV is preview", { VERCEL_ENV: "preview" }],
      ["VERCEL_ENV is development", { VERCEL_ENV: "development" }],
      ["VERCEL is set to a falsy-looking value", { VERCEL: "0" }],
    ])("refuses when %s", (_label, overrides) => {
      expectUnsafe({ ...EMULATOR, ...overrides }, /production environment/);
    });

    it("refuses when only the Auth emulator host is set", () => {
      expectUnsafe({ ...EMULATOR, FIRESTORE_EMULATOR_HOST: undefined }, /both the Auth and Firestore emulator hosts/);
    });

    it("refuses when only the Firestore emulator host is set", () => {
      expectUnsafe({ ...EMULATOR, FIREBASE_AUTH_EMULATOR_HOST: undefined }, /both the Auth and Firestore emulator hosts/);
    });

    it("refuses when the other host is present but empty", () => {
      expectUnsafe({ ...EMULATOR, FIRESTORE_EMULATOR_HOST: "" }, /both the Auth and Firestore emulator hosts/);
      expectUnsafe({ ...EMULATOR, FIREBASE_AUTH_EMULATOR_HOST: "" }, /both the Auth and Firestore emulator hosts/);
    });

    // The Firebase SDK treats any non-empty value as "use the emulator", spaces included,
    // so a host that is only whitespace is a host, and not one on this machine.
    it.each<[string, string]>([
      ["spaces", "   "],
      ["a single space", " "],
      ["a tab", "\t"],
      ["a line break", "\n"],
    ])("refuses a host that is only %s, rather than reading it as unset", (_label, blank) => {
      expectUnsafe({ ...EMULATOR, FIRESTORE_EMULATOR_HOST: blank }, /must be on this machine/);
      expectUnsafe({ ...EMULATOR, FIREBASE_AUTH_EMULATOR_HOST: blank }, /must be on this machine/);
      expectUnsafe({ ...EMULATOR, FIREBASE_AUTH_EMULATOR_HOST: blank, FIRESTORE_EMULATOR_HOST: undefined }, /both the Auth and Firestore emulator hosts/);
      expectUnsafe({ ...EMULATOR, FIREBASE_AUTH_EMULATOR_HOST: undefined, FIRESTORE_EMULATOR_HOST: blank }, /both the Auth and Firestore emulator hosts/);
    });

    it("refuses a whitespace-only emulator host next to a complete live configuration, instead of going live", () => {
      const local = { ...LIVE, NODE_ENV: "development", VERCEL: undefined, VERCEL_ENV: undefined };
      expect(readPortalEnv(local).mode).toBe("live");
      for (const key of ["FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST"]) {
        expect(configError({ ...local, [key]: " " }).code).toBe("unsafe_environment");
        expect(configError({ ...LIVE, [key]: " " }).code).toBe("unsafe_environment");
      }
    });

    it.each<[string, string]>([
      ["a LAN address", "192.168.1.20:9099"],
      ["a public hostname", "emulator.example.com:9099"],
      ["the wildcard address", "0.0.0.0:9099"],
      ["a hostname that only starts with a loopback address", "127.0.0.1.evil.example:9099"],
      ["a hostname that only ends with localhost", "notlocalhost:9099"],
      ["a subdomain of localhost", "evil.localhost:9099"],
      ["userinfo in front of a remote host", "localhost@evil.example:9099"],
      ["another address in 127.0.0.0/8", "127.0.0.2:9099"],
      ["IPv6 loopback without brackets", "::1"],
      ["a URL rather than host:port", "http://localhost:9099"],
    ])("refuses an Auth emulator host that is %s", (_label, host) => {
      expectUnsafe({ ...EMULATOR, FIREBASE_AUTH_EMULATOR_HOST: host }, /must be on this machine/);
    });

    it("refuses a Firestore emulator host that is not on this machine", () => {
      expectUnsafe({ ...EMULATOR, FIRESTORE_EMULATOR_HOST: "10.0.0.5:8080" }, /must be on this machine/);
    });

    // Each must be exactly a loopback host and a port. The value is handed to the Firebase
    // SDK as it stands, so anything that could be read as another host is refused.
    const NOT_EXACTLY_HOST_AND_PORT: Array<[string, string]> = [
      ["a leading space", " 127.0.0.1:9099"],
      ["a trailing space", "127.0.0.1:9099 "],
      ["spaces on both sides", " 127.0.0.1:9099 "],
      ["a trailing line break", "127.0.0.1:9099\n"],
      ["a leading tab", "\tlocalhost:9099"],
      ["a space inside", "127.0.0.1 :9099"],
      ["no port", "127.0.0.1"],
      ["localhost with no port", "localhost"],
      ["bracketed IPv6 loopback with no port", "[::1]"],
      ["a colon and no port", "localhost:"],
      ["a port that is not a number", "localhost:http"],
      ["a port of six digits", "127.0.0.1:123456"],
      ["a negative port", "127.0.0.1:-1"],
      ["two ports", "127.0.0.1:9099:8080"],
      ["a path", "127.0.0.1:9099/"],
      ["a longer path", "localhost:9099/emulator/v1"],
      ["a query", "localhost:9099?x=1"],
      ["a fragment", "localhost:9099#x"],
      ["a user name", "user@127.0.0.1:9099"],
      ["a user name and password", "user:password@localhost:9099"],
      ["a loopback address used as the user name of a remote host", "127.0.0.1:9099@evil.example"],
      ["a loopback address and port used as the user name of a remote host and port", "localhost:9099@evil.example:9099"],
      ["a scheme", "http://127.0.0.1:9099"],
      ["a second host after a comma", "127.0.0.1:9099,evil.example:9099"],
      ["a second host on a new line", "127.0.0.1:9099\nevil.example:9099"],
      ["a remote host on the first of two lines", "evil.example:9099\n127.0.0.1:9099"],
      ["a trailing dot", "localhost.:9099"],
      ["IPv6 loopback written out in full", "[0:0:0:0:0:0:0:1]:9099"],
      ["the loopback address in decimal", "2130706433:9099"],
    ];

    it.each(NOT_EXACTLY_HOST_AND_PORT)("refuses an Auth emulator host with %s", (_label, host) => {
      expectUnsafe({ ...EMULATOR, FIREBASE_AUTH_EMULATOR_HOST: host }, /must be on this machine/);
    });

    it.each(NOT_EXACTLY_HOST_AND_PORT)("refuses a Firestore emulator host with %s", (_label, host) => {
      expectUnsafe({ ...EMULATOR, FIRESTORE_EMULATOR_HOST: host }, /must be on this machine/);
    });

    it.each<[string, Env]>([
      ["a private key", { FIREBASE_PRIVATE_KEY: LIVE.FIREBASE_PRIVATE_KEY }],
      ["a client email", { FIREBASE_CLIENT_EMAIL: LIVE.FIREBASE_CLIENT_EMAIL }],
      ["a full service account", { FIREBASE_PRIVATE_KEY: LIVE.FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL: LIVE.FIREBASE_CLIENT_EMAIL }],
    ])("refuses when %s is configured at the same time", (_label, overrides) => {
      expectUnsafe({ ...EMULATOR, ...overrides }, /service account is configured/);
    });

    it.each<[string, Env]>([
      ["a real project id", { GCLOUD_PROJECT: "sep-portal-prod" }],
      ["a project id that only contains demo-", { GCLOUD_PROJECT: "sep-demo-portal" }],
      ["a project id in the wrong case", { GCLOUD_PROJECT: "Demo-portal" }],
      ["no project id at all", { GCLOUD_PROJECT: undefined }],
      ["a real FIREBASE_PROJECT_ID that outranks a demo GCLOUD_PROJECT", { FIREBASE_PROJECT_ID: "sep-portal-prod" }],
    ])("refuses %s", (_label, overrides) => {
      expectUnsafe({ ...EMULATOR, ...overrides }, /must start with "demo-"/);
    });

    it("refuses a complete live configuration that also has emulator hosts", () => {
      const error = configError({
        ...LIVE,
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      });
      expect(error.code).toBe("unsafe_environment");
    });

    it("refuses even one stray emulator host on a deployment, rather than falling back to live mode", () => {
      expect(configError({ ...LIVE, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }).code).toBe("unsafe_environment");
      expect(configError({ ...LIVE, FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" }).code).toBe("unsafe_environment");
    });

    it("throws a PortalConfigError that carries its name", () => {
      const error = configError({ ...EMULATOR, NODE_ENV: "production" });
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("PortalConfigError");
    });
  });

  describe("live mode", () => {
    it("is used when a service account is configured and no emulator host is set", () => {
      expect(readPortalEnv(LIVE)).toEqual({
        mode: "live",
        projectId: "sep-portal-prod",
        adminEmails: ["chair.one@uci.edu"],
        serviceAccount: {
          clientEmail: "firebase-adminsdk-abc@sep-portal-prod.iam.gserviceaccount.com",
          privateKey: "-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----\n",
        },
      });
    });

    it("turns the literal \\n sequences of an env file into real line breaks", () => {
      const key = readPortalEnv(LIVE).serviceAccount?.privateKey ?? "";
      expect(key).not.toContain("\\n");
      expect(key.split("\n")).toEqual(["-----BEGIN PRIVATE KEY-----", "MIIabc", "-----END PRIVATE KEY-----", ""]);
    });

    it.each<[string, string]>([
      ["double", '"'],
      ["single", "'"],
    ])("strips %s quotes left around the key", (_label, quote) => {
      const env = { ...LIVE, FIREBASE_PRIVATE_KEY: `${quote}-----BEGIN PRIVATE KEY-----\\nMIIabc${quote}` };
      expect(readPortalEnv(env).serviceAccount?.privateKey).toBe("-----BEGIN PRIVATE KEY-----\nMIIabc");
    });

    it("leaves a key that already has real line breaks alone", () => {
      const key = "-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----";
      expect(readPortalEnv({ ...LIVE, FIREBASE_PRIVATE_KEY: key }).serviceAccount?.privateKey).toBe(key);
    });

    it("trims whitespace around the project id and client email", () => {
      const env = { ...LIVE, FIREBASE_PROJECT_ID: "  sep-portal-prod\n", FIREBASE_CLIENT_EMAIL: " sa@x.iam.gserviceaccount.com " };
      expect(readPortalEnv(env)).toMatchObject({
        projectId: "sep-portal-prod",
        serviceAccount: { clientEmail: "sa@x.iam.gserviceaccount.com" },
      });
    });

    it("works outside production too, for running the site locally against the real project", () => {
      const env = { ...LIVE, NODE_ENV: "development", VERCEL: undefined, VERCEL_ENV: undefined };
      expect(readPortalEnv(env).mode).toBe("live");
    });

    it.each(["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"])(
      "is not_configured when %s is missing or blank",
      (key) => {
        expect(configError({ ...LIVE, [key]: undefined }).code).toBe("not_configured");
        expect(configError({ ...LIVE, [key]: "" }).code).toBe("not_configured");
        expect(configError({ ...LIVE, [key]: "   " }).code).toBe("not_configured");
      },
    );

    it("is not_configured for an empty environment", () => {
      expect(configError({}).code).toBe("not_configured");
    });

    it("does not accept GCLOUD_PROJECT or the public id in place of FIREBASE_PROJECT_ID", () => {
      const env = {
        ...LIVE,
        FIREBASE_PROJECT_ID: undefined,
        GCLOUD_PROJECT: "sep-portal-prod",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "sep-portal-prod",
      };
      expect(configError(env).code).toBe("not_configured");
    });

    it("never mentions the private key in its error message", () => {
      const error = configError({ ...LIVE, FIREBASE_CLIENT_EMAIL: undefined });
      expect(error.message).not.toContain("MIIabc");
    });

    it("configures no admins when the list is missing, rather than failing open", () => {
      expect(readPortalEnv({ ...LIVE, PORTAL_ADMIN_EMAILS: undefined }).adminEmails).toEqual([]);
    });
  });
});
