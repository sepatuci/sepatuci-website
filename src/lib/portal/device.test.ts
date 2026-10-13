import { describe, expect, it } from "vitest";
import { UNKNOWN_DEVICE, deviceLabel } from "./device";

/** Every label the module can produce. Nothing outside this set is ever shown. */
const BROWSERS = ["Edge", "Opera", "Samsung Internet", "Firefox", "Chrome", "Safari"];
const SYSTEMS = ["iPhone", "iPad", "Android", "Windows", "ChromeOS", "macOS", "Linux"];
const VOCABULARY = new Set<string>([
  UNKNOWN_DEVICE,
  ...BROWSERS,
  ...SYSTEMS.map((system) => `A browser on ${system}`),
  ...BROWSERS.flatMap((browser) => SYSTEMS.map((system) => `${browser} on ${system}`)),
]);

/** Real User-Agent headers, and what each is called. */
const AGENTS: ReadonlyArray<[string, string, string]> = [
  ["Chrome on macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", "Chrome on macOS"],
  ["Safari on iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Safari on iPhone"],
  ["Chrome on iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1", "Chrome on iPhone"],
  ["Firefox on Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0", "Firefox on Windows"],
  ["Edge on Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0", "Edge on Windows"],
  ["the old Edge on Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36 Edge/18.19582", "Edge on Windows"],
  ["Samsung Internet on Android", "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36", "Samsung Internet on Android"],
  ["Chrome on ChromeOS", "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", "Chrome on ChromeOS"],
  ["Safari on iPad", "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Safari on iPad"],
  // An iPad asking for desktop sites calls itself a Mac, and there is nothing in the header to say otherwise.
  ["Safari on an iPad that asks for desktop sites", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", "Safari on macOS"],
  ["Safari on macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15", "Safari on macOS"],
  ["Chrome on Android", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36", "Chrome on Android"],
  ["Chrome on Linux", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", "Chrome on Linux"],
  ["Firefox on macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:130.0) Gecko/20100101 Firefox/130.0", "Firefox on macOS"],
  ["Firefox on iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15", "Firefox on iPhone"],
  ["Edge on Android", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 EdgA/129.0.0.0", "Edge on Android"],
  ["Edge on iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/129.0.0.0 Mobile/15E148 Safari/605.1.15", "Edge on iPhone"],
  ["Opera on Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/115.0.0.0", "Opera on Windows"],
];

const BOTS: ReadonlyArray<[string, string]> = [
  ["a search engine's crawler", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
  ["another crawler", "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"],
  ["a command-line client", "curl/8.7.1"],
  ["a Python script", "python-requests/2.32.3"],
  ["a made-up name", "SEP-Portal-Checker/1.0"],
];

describe("deviceLabel", () => {
  it.each(AGENTS)("names %s", (_label, agent, expected) => {
    expect(deviceLabel(agent)).toBe(expected);
  });

  it("names the browser alone when the system is not one it knows", () => {
    expect(deviceLabel("Mozilla/5.0 (PlayStation; PlayStation 5/8.60) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")).toBe("Safari");
    expect(deviceLabel("Mozilla/5.0 (X11; FreeBSD amd64; rv:130.0) Gecko/20100101 Firefox/130.0")).toBe("Firefox");
  });

  it("says a browser on the system when the browser is not one it knows", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("A browser on Windows");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("A browser on iPhone");
    expect(deviceLabel("Dalvik/2.1.0 (Linux; U; Android 14; Pixel 8 Build/AP2A.240805.005)")).toBe("A browser on Android");
  });

  it.each(BOTS)("is Unknown device for %s", (_label, agent) => {
    expect(deviceLabel(agent)).toBe(UNKNOWN_DEVICE);
  });

  it("is Unknown device for an empty header, or one that is only spaces", () => {
    expect(deviceLabel("")).toBe(UNKNOWN_DEVICE);
    expect(deviceLabel("   ")).toBe(UNKNOWN_DEVICE);
  });

  it("is Unknown device when there is no header at all", () => {
    expect(deviceLabel(null)).toBe(UNKNOWN_DEVICE);
    expect(deviceLabel(undefined)).toBe(UNKNOWN_DEVICE);
  });

  it("is Unknown device for a header that is not text", () => {
    for (const value of [42, true, {}, [], ["Chrome/129.0"], Symbol("ua")] as unknown[]) {
      expect(deviceLabel(value as string)).toBe(UNKNOWN_DEVICE);
    }
  });

  it("reads a word, not a fragment: a name buried inside another word does not count", () => {
    expect(deviceLabel("NotChrome/1.0 (XWindows)")).toBe(UNKNOWN_DEVICE);
    expect(deviceLabel("MyFirefox/1.0")).toBe(UNKNOWN_DEVICE);
  });

  describe("a 10,000 character header", () => {
    const LONG = 10_000;

    it("is answered at once, from the fixed vocabulary, whatever it is made of", () => {
      const headers = [
        "A".repeat(LONG),
        "(".repeat(LONG),
        "Chrome/".repeat(LONG).slice(0, LONG),
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 ".repeat(100).slice(0, LONG),
        `${" ".repeat(LONG - 5)}Edg/1`,
      ];
      const began = performance.now();
      for (const header of headers) {
        expect(header).toHaveLength(LONG);
        const label = deviceLabel(header);
        expect(VOCABULARY.has(label), label).toBe(true);
        expect(label).not.toContain(header);
      }
      expect(performance.now() - began).toBeLessThan(1000);
    });

    it("reads only its beginning, so a name far along it does not count", () => {
      const padded = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${"x".repeat(LONG)} Chrome/129.0.0.0`;
      expect(deviceLabel(padded)).toBe("A browser on Windows");
      expect(deviceLabel(`${"x".repeat(LONG)} Chrome/129.0.0.0 Windows`)).toBe(UNKNOWN_DEVICE);
    });
  });

  it("never repeats any part of the header: no version, no company, no punctuation", () => {
    const headers = [...AGENTS.map(([, agent]) => agent), ...BOTS.map(([, agent]) => agent), "   ", "A".repeat(10_000)];
    for (const header of headers) {
      const label = deviceLabel(header);
      expect(label, header).not.toContain(header);
      expect(label, header).not.toMatch(/\d/);
      expect(label, header).not.toMatch(/[/();+]/);
      expect(label, header).not.toMatch(/Mozilla|AppleWebKit|Gecko|KHTML|compatible/);
      expect(VOCABULARY.has(label), label).toBe(true);
    }
  });
});
