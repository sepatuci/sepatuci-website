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
import { POST as redeemPreview } from "@/app/api/portal/preview/redeem/route";
import { LIMITS } from "../constants";
import { publicRoute, type PublicRouteContext } from "./http";
import { RATE_LIMITS, resetRateLimits } from "./rate-limit";

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
      // The one route that needs no sign-in is refused the same way, before anything else.
      await redeemPreview(
        request({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: "a".repeat(43) }),
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

/**
 * The wrapper for a route that needs no sign-in. The handler here is the
 * test's own and touches nothing, so with a safe local configuration the
 * request goes through without any emulator running. What is looked at is
 * what the wrapper does on either side of the handler.
 */
describe("publicRoute", () => {
  let warned: MockInstance<typeof console.warn>;
  /** Everything each call reached the handler with. */
  let reached: PublicRouteContext[];

  const echo = publicRoute({ limitKey: "echo" }, async (context) => {
    reached.push(context);
    return { ok: true, body: context.body };
  });
  const tiny = publicRoute({ limitKey: "tiny", maxBodyBytes: 20 }, async () => ({ ok: true }));

  const post = (init: { headers?: Record<string, string>; body?: string } = {}, address?: string): Promise<Response> =>
    echo(
      request({
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(address ? { "x-forwarded-for": address } : {}),
          ...init.headers,
        },
        body: init.body ?? JSON.stringify({ code: "x" }),
      }),
      noParams,
    );

  beforeEach(() => {
    delete (globalThis as AdminCache).__sepPortalAdmin;
    portalEnv(EMULATOR_ENV);
    resetRateLimits();
    reached = [];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete (globalThis as AdminCache).__sepPortalAdmin;
    resetRateLimits();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("answers without any sign-in, with the same headers as every other route", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, body: { code: "x" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("hands the handler the parsed body, the clock as the request arrived, and the portal's admin SDK", async () => {
    const before = Date.now();
    await post();
    expect(reached).toHaveLength(1);
    const [context] = reached;
    expect(context.body).toEqual({ code: "x" });
    expect(context.now.getTime()).toBeGreaterThanOrEqual(before);
    expect(context.now.getTime()).toBeLessThanOrEqual(Date.now());
    expect(context.admin.env.mode).toBe("emulator");
    expect(context.request.method).toBe("POST");
  });

  it("looks at no token: a garbage one, or a real-looking one, changes nothing", async () => {
    for (const authorization of ["Bearer garbage", "Bearer aaa.bbb.ccc", "Basic xyz"]) {
      const response = await post({ headers: { authorization } });
      expect(response.status, authorization).toBe(200);
    }
    expect(reached).toHaveLength(3);
  });

  it("wants JSON: 415 without the content type, 400 for text that is not JSON, and an empty body reads as {}", async () => {
    const noType = await echo(request({ method: "POST", body: "{}" }), noParams);
    expect(noType.status).toBe(415);
    expect(await noType.json()).toEqual({ error: "Send JSON.", code: "unsupported_media_type" });

    const notJson = await post({ body: "not json" });
    expect(notJson.status).toBe(400);
    expect(await notJson.json()).toEqual({ error: "The request wasn't valid JSON.", code: "bad_json" });

    const empty = await post({ body: "" });
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ ok: true, body: {} });
    expect(reached).toHaveLength(1);
  });

  it("holds the body to the small cap by default, and to the route's own when it names one", async () => {
    const overCap = await post({ body: `{"pad":"${"x".repeat(LIMITS.smallBodyBytes)}"}` });
    expect(overCap.status).toBe(413);
    expect(await overCap.json()).toEqual({ error: "That's too much data to send at once.", code: "too_large" });
    expect(reached).toHaveLength(0);

    const smallEnough = await tiny(request({ method: "POST", headers: { "content-type": "application/json" }, body: '{"code":"x"}' }), noParams);
    expect(smallEnough.status).toBe(200);
    const justOver = await tiny(request({ method: "POST", headers: { "content-type": "application/json" }, body: `{"code":"${"x".repeat(20)}"}` }), noParams);
    expect(justOver.status).toBe(413);
  });

  it("sends a GET through with no body, as the other wrapper does", async () => {
    const response = await echo(request({ method: "GET" }), noParams);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(reached[0].body).toBeUndefined();
  });

  it("counts every request as a change, and refuses the one past the ceiling for changes with 429", async () => {
    for (let index = 0; index < RATE_LIMITS.writesPerMinute; index += 1) {
      expect((await post()).status, String(index)).toBe(200);
    }
    const refused = await post();
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: "Too many requests. Wait a minute and try again.", code: "rate_limited" });
    expect(reached).toHaveLength(RATE_LIMITS.writesPerMinute);
    // One line in the log for it, naming the route rather than any account.
    expect(warned).toHaveBeenCalledTimes(1);
    expect(warned.mock.calls[0]).toEqual(["[Portal] Rate limit reached for the open route", "echo"]);
    expect((await post()).status).toBe(429);
    expect(warned).toHaveBeenCalledTimes(1);
  });

  it("keeps each address's count apart: one address over its ceiling holds nobody else back", async () => {
    for (let index = 0; index < RATE_LIMITS.writesPerMinute; index += 1) {
      expect((await post({}, "203.0.113.7")).status, String(index)).toBe(200);
    }
    expect((await post({}, "203.0.113.7")).status).toBe(429);
    // Another address, and a request with no address at all, are counted on their own.
    expect((await post({}, "203.0.113.8")).status).toBe(200);
    expect((await post()).status).toBe(200);
    // Only the first hop counts: a request that names another address after the first is the first's.
    expect((await post({}, "203.0.113.7, 10.0.0.1")).status).toBe(429);
    expect((await post({}, "10.0.0.1, 203.0.113.7")).status).toBe(200);
    // There is no ceiling for the route as a whole: thirty addresses, a request each, all get through.
    for (let index = 0; index < RATE_LIMITS.writesPerMinute; index += 1) {
      expect((await post({}, `10.0.1.${index}`)).status, String(index)).toBe(200);
    }
  });

  it("keeps each route's count apart", async () => {
    for (let index = 0; index < RATE_LIMITS.writesPerMinute; index += 1) await post();
    expect((await post()).status).toBe(429);
    const other = await tiny(request({ method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), noParams);
    expect(other.status).toBe(200);
  });

  it("answers 503 and runs nothing when the portal is not configured", async () => {
    portalEnv();
    const response = await post();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "The portal isn't available right now.", code: "not_configured" });
    expect(reached).toHaveLength(0);
  });

  it("turns what the handler throws into the same answers as every other route", async () => {
    const failing = publicRoute({ limitKey: "failing" }, async () => {
      throw new Error("something inside");
    });
    const response = await failing(request({ method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), noParams);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Something went wrong. Try again.", code: "internal" });
  });
});
