/**
 * The response headers that next.config.mjs sets, worked out for a few real
 * paths. The rules are matched with Next's own matcher, built the way Next
 * builds it for custom headers, and applied in order with a later rule's value
 * replacing an earlier one's, which is what the router does.
 */
import { modifyRouteRegex } from "next/dist/lib/redirect-status";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config.mjs";

async function rules(): Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>> {
  if (typeof nextConfig.headers !== "function") throw new Error("next.config.mjs has no headers().");
  return nextConfig.headers();
}

/** Every header the configuration sends for a path, by lower-cased name. */
async function headersFor(pathname: string): Promise<Record<string, string>> {
  const sent: Record<string, string> = {};
  for (const rule of await rules()) {
    const matches = getPathMatch(rule.source, { strict: true, removeUnnamedParams: true, regexModifier: (regex) => modifyRouteRegex(regex) });
    if (!matches(pathname)) continue;
    for (const { key, value } of rule.headers) sent[key.toLowerCase()] = value;
  }
  return sent;
}

/** A Content-Security-Policy as its directives, by name. */
function directives(policy: string | undefined): Record<string, string> {
  return Object.fromEntries(
    (policy ?? "")
      .split(";")
      .map((directive) => directive.trim())
      .filter((directive) => directive.length > 0)
      .map((directive) => {
        const [name, ...values] = directive.split(/\s+/);
        return [name, values.join(" ")];
      }),
  );
}

const PUBLIC_PAGES = ["/", "/rush", "/blog/some-post"];
const PRIVATE_PAGES = ["/login", "/login/reset", "/portal", "/portal/admin", "/portal/admin/pledges/abc123"];

describe("the headers next.config.mjs sets", () => {
  // The sign-in page is reached from the public pages without a fresh page load, so a
  // frame around the home page would otherwise carry over to it.
  it.each([...PUBLIC_PAGES, ...PRIVATE_PAGES, "/api/portal/me"])("forbid framing %s, in both the old way and the new", async (pathname) => {
    const sent = await headersFor(pathname);
    expect(sent["x-frame-options"]).toBe("DENY");
    expect(directives(sent["content-security-policy"])["frame-ancestors"]).toBe("'none'");
  });

  it.each(PUBLIC_PAGES)("send %s those two and nothing else: a public page stays in search results and keeps its referrer", async (pathname) => {
    const sent = await headersFor(pathname);
    expect(Object.keys(sent).sort()).toEqual(["content-security-policy", "x-frame-options"]);
    expect(directives(sent["content-security-policy"])).toEqual({ "frame-ancestors": "'none'" });
  });

  it.each(PRIVATE_PAGES)("keep the stricter set for %s", async (pathname) => {
    const sent = await headersFor(pathname);
    expect(sent).toEqual({
      "x-frame-options": "DENY",
      "content-security-policy": sent["content-security-policy"],
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow",
      "x-content-type-options": "nosniff",
    });
    // The rule for every path does not replace the fuller policy of these pages.
    expect(directives(sent["content-security-policy"])).toEqual({
      "frame-ancestors": "'none'",
      "base-uri": "'self'",
      "form-action": "'self'",
      "object-src": "'none'",
    });
  });

  it("treat a path that only starts like one of those as the public page it is", async () => {
    for (const pathname of ["/loginx", "/portal-news", "/portals/admin"]) {
      expect(Object.keys(await headersFor(pathname)).sort(), pathname).toEqual(["content-security-policy", "x-frame-options"]);
    }
  });

  it("keep the portal's API out of caches and search results, and unframed like everything else", async () => {
    expect(await headersFor("/api/portal/admin/pledges")).toEqual({
      "x-frame-options": "DENY",
      "content-security-policy": "frame-ancestors 'none'",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex",
    });
  });
});
