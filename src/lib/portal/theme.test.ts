import vm from "node:vm";
import { describe, expect, it } from "vitest";
import {
  THEME_ATTRIBUTE,
  THEME_BOOT_SCRIPT,
  THEME_LABELS,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  isThemedPath,
  readPreference,
  resolveTheme,
  type ThemePreference,
} from "./theme";

describe("readPreference", () => {
  it("keeps the two choices a person can store", () => {
    expect(readPreference("light")).toBe("light");
    expect(readPreference("dark")).toBe("dark");
  });

  it.each<[string, string | null | undefined]>([
    ["nothing stored", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["the word system", "system"],
    ["a choice in capitals", "LIGHT"],
    ["a choice in mixed case", "Dark"],
    ["a choice with padding", " dark"],
    ["a choice with a trailing newline", "light\n"],
    ["a JSON string", '"dark"'],
    ["another app's value", "auto"],
    ["a boolean written as text", "true"],
  ])("follows the device for %s", (_label, raw) => {
    expect(readPreference(raw)).toBe("system");
  });

  it("only ever returns one of the three preferences", () => {
    for (const raw of ["light", "dark", "system", "", "x", null, undefined]) {
      expect(THEME_PREFERENCES).toContain(readPreference(raw));
    }
    expect([...THEME_PREFERENCES].sort()).toEqual(["dark", "light", "system"]);
    expect(Object.keys(THEME_LABELS).sort()).toEqual([...THEME_PREFERENCES].sort());
  });
});

describe("resolveTheme", () => {
  it.each<[ThemePreference, boolean, "light" | "dark"]>([
    ["system", true, "dark"],
    ["system", false, "light"],
    ["light", true, "light"],
    ["light", false, "light"],
    ["dark", true, "dark"],
    ["dark", false, "dark"],
  ])("with the choice %s on a device whose dark setting is %s, shows %s", (preference, deviceIsDark, expected) => {
    expect(resolveTheme(preference, deviceIsDark)).toBe(expected);
  });
});

const THEMED_PATHS = [
  "/login",
  "/login/",
  // No longer a page of its own. An old bookmark of it, like any address under /login with
  // no page, is answered in the sign-in frame, and so has to be themed like the rest.
  "/login/forgot",
  "/login/forgot/",
  "/login/no/such/page",
  "/login/reset",
  "/portal",
  "/portal/",
  "/portal/account",
  "/portal/admin",
  "/portal/admin/pledges/abc123",
  "/portal/review",
  "/portal/review/deliverables/week2interviews",
  "/portal/welcome",
];

const PUBLIC_PATHS = [
  "",
  "/",
  "/blog",
  "/people",
  "/rush",
  "/loginx",
  "/login-help",
  "/logins",
  "/portals",
  "/portal-old",
  "/portalx/admin",
  "/Login",
  "/Portal",
  "/PORTAL/admin",
  "/blog/login",
  "/blog/portal",
  "/api/portal/me",
  "/api/login",
  "login",
  "portal/account",
  " /portal",
];

describe("isThemedPath", () => {
  it.each(THEMED_PATHS)("themes %s", (pathname) => {
    expect(isThemedPath(pathname)).toBe(true);
  });

  it.each(PUBLIC_PATHS)("leaves the public path %j alone", (pathname) => {
    expect(isThemedPath(pathname)).toBe(false);
  });
});

// ── The script that runs in <head> before the page is painted ────────────────

interface BootOptions {
  pathname: string;
  /** What localStorage holds under the theme key. */
  stored?: string | null;
  deviceIsDark?: boolean;
  /** Storage is blocked, as in some private windows: reading it throws. */
  storageThrows?: boolean;
  /** A browser with no matchMedia at all. */
  noMatchMedia?: boolean;
  /** No location.pathname to read. */
  noLocation?: boolean;
}

interface BootResult {
  /** Every attribute the script set on <html>, by name. */
  attributes: Record<string, string>;
  /** How many times it wrote to <html>. */
  writes: number;
  storageKeysRead: string[];
  mediaQueries: string[];
  /** Names the script left behind on the global object. */
  leakedGlobals: string[];
}

/** Runs the boot script as a browser would, in a context of its own with only the four globals it needs. */
function boot(options: BootOptions): BootResult {
  const result: BootResult = { attributes: {}, writes: 0, storageKeysRead: [], mediaQueries: [], leakedGlobals: [] };
  const sandbox: Record<string, unknown> = {
    localStorage: {
      getItem(key: string): string | null {
        result.storageKeysRead.push(key);
        if (options.storageThrows) throw new Error("The operation is insecure.");
        return options.stored ?? null;
      },
    },
    document: {
      documentElement: {
        setAttribute(name: string, value: string): void {
          result.writes += 1;
          result.attributes[name] = value;
        },
      },
    },
  };
  if (!options.noLocation) sandbox.location = { pathname: options.pathname };
  if (!options.noMatchMedia) {
    sandbox.matchMedia = (query: string): { matches: boolean } => {
      result.mediaQueries.push(query);
      return { matches: options.deviceIsDark ?? false };
    };
  }
  const provided = new Set(Object.keys(sandbox));
  const context = vm.createContext(sandbox);
  vm.runInContext(THEME_BOOT_SCRIPT, context);
  result.leakedGlobals = Object.keys(sandbox).filter((name) => !provided.has(name));
  return result;
}

const STORED_VALUES: Array<[string, string | null]> = [
  ["nothing stored", null],
  ["light stored", "light"],
  ["dark stored", "dark"],
  ["system stored", "system"],
  ["an empty string stored", ""],
  ["a choice in capitals stored", "LIGHT"],
  ["a choice with padding stored", " dark"],
  ["another app's value stored", "auto"],
];
const DEVICES: Array<[string, boolean]> = [
  ["a dark device", true],
  ["a light device", false],
];

describe("THEME_BOOT_SCRIPT", () => {
  describe("on the sign-in and portal pages", () => {
    const cases = STORED_VALUES.flatMap(([storedLabel, stored]) =>
      DEVICES.map(([deviceLabel, deviceIsDark]) => ({ storedLabel, stored, deviceLabel, deviceIsDark })),
    );

    it.each(cases)(
      "sets the theme resolveTheme gives for $storedLabel on $deviceLabel, on every themed path",
      ({ stored, deviceIsDark }) => {
        const expected = resolveTheme(readPreference(stored), deviceIsDark);
        for (const pathname of THEMED_PATHS) {
          const result = boot({ pathname, stored, deviceIsDark });
          expect(result.attributes, pathname).toEqual({ [THEME_ATTRIBUTE]: expected });
          expect(result.writes, pathname).toBe(1);
        }
      },
    );

    it("lets a stored choice win over the device, in both directions", () => {
      expect(boot({ pathname: "/portal", stored: "light", deviceIsDark: true }).attributes[THEME_ATTRIBUTE]).toBe("light");
      expect(boot({ pathname: "/portal", stored: "dark", deviceIsDark: false }).attributes[THEME_ATTRIBUTE]).toBe("dark");
    });

    it("reads the choice from the key the portal writes it under, and asks the device about dark mode", () => {
      const result = boot({ pathname: "/login", stored: null, deviceIsDark: true });
      expect(result.storageKeysRead).toEqual([THEME_STORAGE_KEY]);
      expect(result.mediaQueries).toEqual(["(prefers-color-scheme: dark)"]);
    });

    it("only ever sets light or dark, the two values the stylesheet has rules for", () => {
      for (const [, stored] of STORED_VALUES) {
        for (const [, deviceIsDark] of DEVICES) {
          const value = boot({ pathname: "/portal/account", stored, deviceIsDark }).attributes[THEME_ATTRIBUTE];
          expect(["light", "dark"]).toContain(value);
        }
      }
    });

    it.each(DEVICES)("follows the device when storage is blocked, on %s", (_label, deviceIsDark) => {
      const result = boot({ pathname: "/portal", storageThrows: true, deviceIsDark });
      expect(result.attributes).toEqual({ [THEME_ATTRIBUTE]: resolveTheme("system", deviceIsDark) });
    });

    it("still applies a stored choice in a browser with no matchMedia", () => {
      expect(boot({ pathname: "/portal", stored: "light", noMatchMedia: true }).attributes).toEqual({ [THEME_ATTRIBUTE]: "light" });
      expect(boot({ pathname: "/portal", stored: "dark", noMatchMedia: true }).attributes).toEqual({ [THEME_ATTRIBUTE]: "dark" });
    });

    it("fails quietly, leaving the page as it was, when there is no choice and no way to ask the device", () => {
      expect(() => boot({ pathname: "/portal", stored: null, noMatchMedia: true })).not.toThrow();
      expect(boot({ pathname: "/portal", stored: null, noMatchMedia: true }).writes).toBe(0);
    });
  });

  describe("on the public site, which is dark only", () => {
    it.each(PUBLIC_PATHS)("does nothing at all on %j", (pathname) => {
      for (const [, stored] of STORED_VALUES) {
        for (const [, deviceIsDark] of DEVICES) {
          const result = boot({ pathname, stored, deviceIsDark });
          expect(result.writes).toBe(0);
          expect(result.attributes).toEqual({});
          // It does not even look at the person's choice or their device.
          expect(result.storageKeysRead).toEqual([]);
          expect(result.mediaQueries).toEqual([]);
        }
      }
    });

    it("does nothing, and does not throw, when the address cannot be read", () => {
      expect(() => boot({ pathname: "/portal", noLocation: true, stored: "light" })).not.toThrow();
      expect(boot({ pathname: "/portal", noLocation: true, stored: "light" }).writes).toBe(0);
    });
  });

  it("agrees with isThemedPath about which pages carry a theme", () => {
    for (const pathname of [...THEMED_PATHS, ...PUBLIC_PATHS]) {
      const themed = boot({ pathname, stored: "light", deviceIsDark: true }).writes > 0;
      expect(themed, pathname).toBe(isThemedPath(pathname));
    }
  });

  it("leaves nothing behind on the page's global object", () => {
    for (const pathname of ["/portal", "/login", "/", "/blog"]) {
      expect(boot({ pathname, stored: "dark", deviceIsDark: false }).leakedGlobals, pathname).toEqual([]);
    }
  });

  it("can be placed inside a script tag as it is", () => {
    // It is written into <head> as raw text, where either of these would end the script early.
    expect(THEME_BOOT_SCRIPT).not.toMatch(/<\/script|<!--/i);
    expect(THEME_BOOT_SCRIPT).not.toContain("\n");
    expect(() => new vm.Script(THEME_BOOT_SCRIPT)).not.toThrow();
  });
});
