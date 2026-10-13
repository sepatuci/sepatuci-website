/**
 * A short description of the browser a session used, such as "Chrome on
 * macOS", from a fixed vocabulary. It is made from the User-Agent header when
 * a session starts; the header itself is never stored.
 */

const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  // "HeadlessChrome/" is Chrome too.
  [/(?:\b|Headless)Chrome\/|\bCriOS\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMacintosh\b|\bMac OS X\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

export const UNKNOWN_DEVICE = "Unknown device";

export function deviceLabel(userAgent: string | null | undefined): string {
  if (typeof userAgent !== "string") return UNKNOWN_DEVICE;
  const agent = userAgent.slice(0, 512);
  const browser = BROWSERS.find(([pattern]) => pattern.test(agent))?.[1] ?? null;
  const system = SYSTEMS.find(([pattern]) => pattern.test(agent))?.[1] ?? null;
  if (browser && system) return `${browser} on ${system}`;
  if (browser) return browser;
  if (system) return `A browser on ${system}`;
  return UNKNOWN_DEVICE;
}
