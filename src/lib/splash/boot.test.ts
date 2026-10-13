import vm from "node:vm";
import { describe, expect, it } from "vitest";
import {
  SPLASH_ATTRIBUTE,
  SPLASH_BOOT_SCRIPT,
  SPLASH_HARD_TIMEOUT_MS,
  SPLASH_MASK_CSS,
  SPLASH_MASK_ID,
  SPLASH_SEEN_KEY,
  shouldPlaySplash,
} from "./boot";

const THEMED_PATHS = ["/login", "/login/", "/login/reset", "/portal", "/portal/", "/portal/admin/activity", "/portal/welcome"];
const PUBLIC_PATHS = ["/", "/blog", "/people", "/rush", "/founderseducation", "/loginx", "/portals", "/Login", "/blog/portal", ""];

describe("shouldPlaySplash", () => {
  it.each(PUBLIC_PATHS)("plays on the public path %j", (pathname) => {
    expect(shouldPlaySplash({ pathname, reducedMotion: false })).toBe(true);
  });

  it.each(THEMED_PATHS)("never plays on %s", (pathname) => {
    expect(shouldPlaySplash({ pathname, reducedMotion: false })).toBe(false);
  });

  it("never plays for someone who asked for less motion", () => {
    for (const pathname of [...PUBLIC_PATHS, ...THEMED_PATHS]) {
      expect(shouldPlaySplash({ pathname, reducedMotion: true }), pathname).toBe(false);
    }
  });
});

// ── The script that runs in <head> before the page is painted ────────────────

interface BootOptions {
  pathname: string;
  reducedMotion?: boolean;
  /** sessionStorage is blocked, as in some private windows: every call throws. */
  storageThrows?: boolean;
  noMatchMedia?: boolean;
  noLocation?: boolean;
}

interface StyleNode {
  id: string;
  textContent: string;
}

interface BootResult {
  attributes: Record<string, string>;
  attributeWrites: number;
  storageSet: Array<[string, string]>;
  storageRemoved: string[];
  stylesAppended: StyleNode[];
  timeouts: Array<{ ms: number; run: () => void }>;
  mediaQueries: string[];
  leakedGlobals: string[];
}

/** Runs the boot script as a browser would, in a context of its own with only the globals it needs. */
function boot(options: BootOptions): BootResult {
  const result: BootResult = {
    attributes: {},
    attributeWrites: 0,
    storageSet: [],
    storageRemoved: [],
    stylesAppended: [],
    timeouts: [],
    mediaQueries: [],
    leakedGlobals: [],
  };
  const documentElement = {
    setAttribute(name: string, value: string): void {
      result.attributeWrites += 1;
      result.attributes[name] = value;
    },
    getAttribute(name: string): string | null {
      return result.attributes[name] ?? null;
    },
    hasAttribute(name: string): boolean {
      return name in result.attributes;
    },
    removeAttribute(name: string): void {
      delete result.attributes[name];
    },
  };
  const sandbox: Record<string, unknown> = {
    sessionStorage: {
      setItem(key: string, value: string): void {
        if (options.storageThrows) throw new Error("The operation is insecure.");
        result.storageSet.push([key, value]);
      },
      removeItem(key: string): void {
        if (options.storageThrows) throw new Error("The operation is insecure.");
        result.storageRemoved.push(key);
      },
    },
    document: {
      documentElement,
      createElement(tagName: string): StyleNode & { tagName: string } {
        return { tagName, id: "", textContent: "" };
      },
      head: {
        appendChild(node: StyleNode): void {
          result.stylesAppended.push({ id: node.id, textContent: node.textContent });
        },
      },
    },
    setTimeout(run: () => void, ms: number): number {
      result.timeouts.push({ ms, run });
      return result.timeouts.length;
    },
  };
  if (!options.noLocation) sandbox.location = { pathname: options.pathname };
  if (!options.noMatchMedia) {
    sandbox.matchMedia = (query: string): { matches: boolean } => {
      result.mediaQueries.push(query);
      return { matches: options.reducedMotion ?? false };
    };
  }
  const provided = new Set(Object.keys(sandbox));
  const context = vm.createContext(sandbox);
  vm.runInContext(SPLASH_BOOT_SCRIPT, context);
  result.leakedGlobals = Object.keys(sandbox).filter((name) => !provided.has(name));
  return result;
}

describe("SPLASH_BOOT_SCRIPT", () => {
  describe("on a public page", () => {
    it.each(PUBLIC_PATHS)("marks the splash pending, masks the page and arms the backstop on %j", (pathname) => {
      const result = boot({ pathname });
      expect(result.attributes).toEqual({ [SPLASH_ATTRIBUTE]: "pending" });
      expect(result.attributeWrites).toBe(1);
      expect(result.stylesAppended).toEqual([{ id: SPLASH_MASK_ID, textContent: SPLASH_MASK_CSS }]);
      expect(result.timeouts).toHaveLength(1);
      expect(result.timeouts[0].ms).toBe(SPLASH_HARD_TIMEOUT_MS);
    });

    it("clears the seen flag, so a refresh plays the splash again", () => {
      const result = boot({ pathname: "/" });
      expect(result.storageRemoved).toEqual([SPLASH_SEEN_KEY]);
      expect(result.storageSet).toEqual([]);
    });

    it("writes a mask that hides the page only while pending and shows the shell while the attribute lasts", () => {
      expect(SPLASH_MASK_CSS).toContain(`html[${SPLASH_ATTRIBUTE}="pending"] body>*:not([data-splash-screen]){opacity:0!important;pointer-events:none}`);
      expect(SPLASH_MASK_CSS).toContain(`html[${SPLASH_ATTRIBUTE}] [data-splash-screen]{display:block}`);
    });

    it("lifts the attribute when the backstop fires, whatever state the splash is in", () => {
      for (const state of ["pending", "handoff"]) {
        const result = boot({ pathname: "/" });
        result.attributes[SPLASH_ATTRIBUTE] = state;
        result.timeouts[0].run();
        expect(result.attributes, state).toEqual({});
      }
    });

    it("is harmless when the backstop fires after the splash has already lifted the attribute", () => {
      const result = boot({ pathname: "/" });
      delete result.attributes[SPLASH_ATTRIBUTE];
      expect(() => result.timeouts[0].run()).not.toThrow();
      expect(result.attributes).toEqual({});
    });

    it("still plays when storage is blocked", () => {
      const result = boot({ pathname: "/", storageThrows: true });
      expect(result.attributes).toEqual({ [SPLASH_ATTRIBUTE]: "pending" });
      expect(result.stylesAppended).toHaveLength(1);
      expect(result.timeouts).toHaveLength(1);
    });

    it("still plays in a browser with no matchMedia", () => {
      const result = boot({ pathname: "/", noMatchMedia: true });
      expect(result.attributes).toEqual({ [SPLASH_ATTRIBUTE]: "pending" });
    });

    it("asks the device about reduced motion, and nothing else", () => {
      expect(boot({ pathname: "/" }).mediaQueries).toEqual(["(prefers-reduced-motion: reduce)"]);
    });
  });

  describe("when the splash must not play", () => {
    it.each(THEMED_PATHS)("only marks it as seen on %s", (pathname) => {
      const result = boot({ pathname });
      expect(result.storageSet).toEqual([[SPLASH_SEEN_KEY, "true"]]);
      expect(result.storageRemoved).toEqual([]);
      expect(result.attributeWrites).toBe(0);
      expect(result.attributes).toEqual({});
      expect(result.stylesAppended).toEqual([]);
      expect(result.timeouts).toEqual([]);
    });

    it.each(PUBLIC_PATHS)("only marks it as seen for someone who asked for less motion, on %j", (pathname) => {
      const result = boot({ pathname, reducedMotion: true });
      expect(result.storageSet).toEqual([[SPLASH_SEEN_KEY, "true"]]);
      expect(result.attributes).toEqual({});
      expect(result.stylesAppended).toEqual([]);
      expect(result.timeouts).toEqual([]);
    });

    it("does nothing, and does not throw, when the address cannot be read", () => {
      expect(() => boot({ pathname: "/", noLocation: true })).not.toThrow();
      const result = boot({ pathname: "/", noLocation: true });
      expect(result.attributes).toEqual({});
      expect(result.stylesAppended).toEqual([]);
      expect(result.timeouts).toEqual([]);
    });
  });

  it("agrees with shouldPlaySplash about when the splash plays", () => {
    for (const pathname of [...THEMED_PATHS, ...PUBLIC_PATHS]) {
      for (const reducedMotion of [false, true]) {
        const played = boot({ pathname, reducedMotion }).attributeWrites > 0;
        expect(played, `${pathname} reduced=${reducedMotion}`).toBe(shouldPlaySplash({ pathname, reducedMotion }));
      }
    }
  });

  it("leaves nothing behind on the page's global object", () => {
    for (const pathname of ["/", "/blog", "/portal", "/login"]) {
      expect(boot({ pathname }).leakedGlobals, pathname).toEqual([]);
    }
  });

  it("can be placed inside a script tag as it is", () => {
    expect(SPLASH_BOOT_SCRIPT).not.toMatch(/<\/script|<!--/i);
    expect(SPLASH_BOOT_SCRIPT).not.toContain("\n");
    expect(() => new vm.Script(SPLASH_BOOT_SCRIPT)).not.toThrow();
  });
});
