/**
 * What the HTTP layer does when the portal's configuration is refused. These
 * need no Firebase at all: the configuration is read before anything else, so
 * a misconfigured deployment answers 503 to every request and never reaches
 * authentication or data. The rest of the HTTP layer is covered against the
 * emulators in tests/portal/access.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { POST as createPledge } from "@/app/api/portal/admin/pledges/route";
import { GET as getDashboard } from "@/app/api/portal/dashboard/route";
import { GET as getMe } from "@/app/api/portal/me/route";

const PORTAL_ENV_KEYS = [
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "GCLOUD_PROJECT",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "PORTAL_ADMIN_EMAILS",
  "VERCEL",
  "VERCEL_ENV",
];

const EMULATOR_ENV = {
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  GCLOUD_PROJECT: "demo-sep-portal",
  PORTAL_ADMIN_EMAILS: "chair.one@uci.edu",
};

/** Sets every variable the portal reads, so the machine's own environment cannot leak in. */
function portalEnv(values: Record<string, string> = {}): void {
  for (const key of PORTAL_ENV_KEYS) vi.stubEnv(key, values[key] ?? "");
  if (values.NODE_ENV) vi.stubEnv("NODE_ENV", values.NODE_ENV);
}

const noParams = { params: Promise.resolve({}) };
const request = (init: RequestInit = {}): Request => new Request("http://localhost/api/portal/under-test", init);
const withToken = { headers: { authorization: "Bearer aaa.bbb.ccc" } };

type AdminCache = typeof globalThis & { __sepPortalAdmin?: unknown };

describe("portal routes when the configuration is refused", () => {
  let logged: MockInstance<typeof console.error>;

  beforeEach(() => {
    delete (globalThis as AdminCache).__sepPortalAdmin;
    logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete (globalThis as AdminCache).__sepPortalAdmin;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("answers 503 to every request when Firebase is not configured", async () => {
    portalEnv();
    const responses = [
      await getMe(request(), noParams),
      await getMe(request(withToken), noParams),
      await getDashboard(request(withToken), noParams),
      await createPledge(
        request({
          method: "POST",
          headers: { ...withToken.headers, "content-type": "application/json" },
          body: JSON.stringify({ email: "new.pledge@uci.edu", displayName: "New Pledge" }),
        }),
        noParams,
      ),
    ];
    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "The portal isn't available right now.", code: "not_configured" });
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });

  it.each<[string, Record<string, string>]>([
    ["a production build", { ...EMULATOR_ENV, NODE_ENV: "production" }],
    ["a Vercel deployment", { ...EMULATOR_ENV, VERCEL: "1" }],
    ["a Vercel preview", { ...EMULATOR_ENV, VERCEL_ENV: "preview" }],
    ["an emulator on another machine", { ...EMULATOR_ENV, FIRESTORE_EMULATOR_HOST: "10.0.0.5:8080" }],
    ["a real project id", { ...EMULATOR_ENV, GCLOUD_PROJECT: "sep-portal-prod" }],
    ["only one emulator host", { ...EMULATOR_ENV, FIRESTORE_EMULATOR_HOST: "" }],
    ["a service account alongside the emulators", { ...EMULATOR_ENV, FIREBASE_CLIENT_EMAIL: "sa@x.iam.gserviceaccount.com" }],
  ])("answers 503 rather than trusting unsigned emulator tokens on %s", async (_label, env) => {
    portalEnv(env);
    for (const response of [await getMe(request(), noParams), await getMe(request(withToken), noParams)]) {
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "The portal isn't available right now.", code: "unsafe_environment" });
    }
  });

  it("tells the caller nothing about why, and logs the reason on the server", async () => {
    portalEnv({ ...EMULATOR_ENV, VERCEL: "1" });
    const response = await getMe(request(withToken), noParams);
    const text = await response.text();
    expect(text).not.toMatch(/emulator|Refusing|production|service account|demo-/i);

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0][0]).toBe("[Portal] Configuration error:");
    expect(String(logged.mock.calls[0][1])).toMatch(/Refusing to use the Firebase emulators/);
  });

  it("keeps refusing on later requests: a failed start-up is not cached as a success", async () => {
    portalEnv({ ...EMULATOR_ENV, NODE_ENV: "production" });
    expect((await getMe(request(), noParams)).status).toBe(503);
    expect((await getMe(request(), noParams)).status).toBe(503);
    expect((globalThis as AdminCache).__sepPortalAdmin).toBeUndefined();
  });

  it("gets past configuration with a safe local setup, so the refusals above are about the environment", async () => {
    portalEnv(EMULATOR_ENV);
    // No token, so this is answered before anything would need a running emulator.
    const response = await getMe(request(), noParams);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in to continue.", code: "unauthenticated" });
    expect(logged).not.toHaveBeenCalled();
  });
});
