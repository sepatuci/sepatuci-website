/**
 * The colours of the sign-in pages and the portal, checked from the source:
 * that the tokens in globals.css are readable against each other in both
 * themes, and that the portal's components use those tokens and not Tailwind's
 * fixed palette, which would not change with the theme.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const fromRepo = (...parts: string[]): string => path.join(REPO, ...parts);

// ── Reading the tokens out of the stylesheet ─────────────────────────────────

const STYLESHEET = readFileSync(fromRepo("src", "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const escapeForPattern = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The custom properties set by every rule whose whole selector is `selector`, later rules winning. */
function customProperties(selector: string): Map<string, string> {
  const rule = new RegExp(`(?:^|[{};])\\s*${escapeForPattern(selector)}\\s*\\{([^{}]*)\\}`, "g");
  const found = new Map<string, string>();
  for (const match of STYLESHEET.matchAll(rule)) {
    for (const declaration of match[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      found.set(declaration[1], declaration[2].trim());
    }
  }
  return found;
}

const ROOT_SELECTOR = ":root";
/** On <html> while a sign-in page or the portal is showing, in either theme. */
const PORTAL_SELECTOR = "html[data-portal-theme]";
const LIGHT_SELECTOR = 'html[data-portal-theme="light"]';
const DARK_SELECTOR = 'html[data-portal-theme="dark"]';

const ROOT = customProperties(ROOT_SELECTOR);
const PORTAL_OVERRIDES = customProperties(PORTAL_SELECTOR);
const LIGHT_OVERRIDES = customProperties(LIGHT_SELECTOR);
const DARK_OVERRIDES = customProperties(DARK_SELECTOR);

type ThemeName = "dark" | "light";
const THEMES: Record<ThemeName, Map<string, string>> = {
  // The public site, which is dark only, has the :root values and nothing else. The portal's
  // dark theme is those with the block for both themes on top, and its light theme is that
  // again with the light block on top, which is the order the browser applies them in.
  dark: new Map([...ROOT, ...PORTAL_OVERRIDES, ...DARK_OVERRIDES]),
  light: new Map([...ROOT, ...PORTAL_OVERRIDES, ...LIGHT_OVERRIDES]),
};
const THEME_NAMES: readonly ThemeName[] = ["dark", "light"];

// ── WCAG 2 contrast ──────────────────────────────────────────────────────────

type Rgb = readonly [red: number, green: number, blue: number];
/** Used to check the measuring itself. No pair below is measured against a fixed colour. */
const WHITE: Rgb = [1, 1, 1];

/**
 * A channel as a screen shows it: one of 256 levels. WCAG defines contrast on
 * these 8-bit values (RsRGB = R8bit / 255), and it is what every contrast
 * checker is given, so a ratio worked out here is the one such a tool reports.
 */
const asDisplayed = (channel: number): number => Math.round(channel * 255) / 255;

/** An opaque colour written as the tokens are: "263 83% 57%". Null for anything else. */
function parseHsl(value: string): Rgb | null {
  const match = /^(-?\d+(?:\.\d+)?)(?:deg)?\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/.exec(value);
  if (!match) return null;
  const hue = ((Number(match[1]) % 360) + 360) % 360;
  const saturation = Number(match[2]) / 100;
  const lightness = Number(match[3]) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const base = lightness - chroma / 2;
  const sector = Math.floor(hue / 60);
  const [red, green, blue] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ][sector];
  return [asDisplayed(red + base), asDisplayed(green + base), asDisplayed(blue + base)];
}

function luminance([red, green, blue]: Rgb): number {
  const linear = (channel: number): number =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function contrast(one: Rgb, other: Rgb): number {
  const [lighter, darker] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function colourOf(theme: ThemeName, token: string): Rgb {
  const value = THEMES[theme].get(token);
  if (value === undefined) throw new Error(`--${token} is not defined for the ${theme} theme in globals.css.`);
  const colour = parseHsl(value);
  if (!colour) throw new Error(`--${token} is "${value}" in the ${theme} theme, which is not an opaque "H S% L%" colour.`);
  return colour;
}

const ratioOf = (theme: ThemeName, foreground: string, background: string): number =>
  contrast(colourOf(theme, foreground), colourOf(theme, background));

/** Body text, WCAG 1.4.3. */
const TEXT_MINIMUM = 4.5;
/** Fills, marks and the edges of controls, WCAG 1.4.11. */
const NON_TEXT_MINIMUM = 3;

const INKS = ["accent-ink", "success-ink", "warning-ink", "danger-ink"] as const;
const STATUS_FILLS = ["success", "warning", "danger"] as const;

interface Pair {
  foreground: string;
  background: string;
  minimum: number;
}

const PAIRS: Pair[] = [
  ...["foreground", "muted-foreground", ...INKS].flatMap((foreground) =>
    ["background", "card"].map((background) => ({ foreground, background, minimum: TEXT_MINIMUM })),
  ),
  // Each ink is also the text of its own tinted badge and notice.
  ...INKS.map((ink) => ({ foreground: ink, background: ink.replace(/-ink$/, "-subtle"), minimum: TEXT_MINIMUM })),
  { foreground: "accent-foreground", background: "accent", minimum: TEXT_MINIMUM },
  ...STATUS_FILLS.map((fill) => ({ foreground: fill, background: "card", minimum: NON_TEXT_MINIMUM })),
  // --input is the border of a control (border-input).
  { foreground: "input", background: "card", minimum: NON_TEXT_MINIMUM },
  // The tick or cross in a square of the progress grid is drawn in the page's own colour on a
  // solid status fill ("bg-success text-background"). The mark is what tells the states apart
  // without relying on colour, so it has to show.
  ...STATUS_FILLS.map((fill) => ({ foreground: "background", background: fill, minimum: NON_TEXT_MINIMUM })),
];

const titleOf = (key: string, minimum: number): string => `${key} is at least ${minimum}:1`;

describe("the measuring itself", () => {
  it("gives the reference contrast ratios", () => {
    const black: Rgb = [0, 0, 0];
    expect(contrast(black, WHITE)).toBeCloseTo(21, 5);
    expect(contrast(WHITE, WHITE)).toBe(1);
    // The order of the two colours does not matter.
    expect(contrast(WHITE, black)).toBe(contrast(black, WHITE));
    // #767676 is the lightest grey that passes for text on white.
    const grey: Rgb = [0x76 / 255, 0x76 / 255, 0x76 / 255];
    expect(contrast(grey, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(grey, WHITE)).toBeLessThan(4.6);
  });

  it("reads the token notation as the colour it names", () => {
    const close = (value: string, expected: Rgb): void => {
      const colour = parseHsl(value);
      if (!colour) throw new Error(`${value} did not parse.`);
      colour.forEach((channel, index) => expect(channel).toBeCloseTo(expected[index], 2));
    };
    close("0 0% 100%", [1, 1, 1]);
    close("0 0% 0%", [0, 0, 0]);
    close("0 100% 50%", [1, 0, 0]);
    close("120 100% 50%", [0, 1, 0]);
    close("240 100% 50%", [0, 0, 1]);
    close("60 100% 50%", [1, 1, 0]);
    close("300 100% 25%", [0.5, 0, 0.5]);
    // Tailwind's violet-600, #7c3aed, which the accent is.
    close("262.1 83.3% 57.8%", [0x7c / 255, 0x3a / 255, 0xed / 255]);
  });

  it("measures each colour as a screen shows it, to the nearest of 256 levels a channel", () => {
    const hex = (value: string): string => {
      const colour = parseHsl(value);
      if (!colour) throw new Error(`${value} did not parse.`);
      for (const channel of colour) expect(Number.isInteger(Math.round(channel * 255 * 1e9) / 1e9), value).toBe(true);
      return `#${colour.map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`;
    };
    expect(hex("262.1 83.3% 57.8%")).toBe("#7c3aed");
    expect(hex("0 0% 100%")).toBe("#ffffff");
    expect(hex("0 0% 46.3%")).toBe("#767676");
    // The light theme's page and its warning fill, the pair that sits closest to its minimum.
    expect(hex("240 20% 98%")).toBe("#f9f9fb");
    expect(hex("32 95% 44%")).toBe("#db7706");
    // Those two as a contrast checker reports them: 3.00:1, and not below it.
    const ratio = contrast([0xf9 / 255, 0xf9 / 255, 0xfb / 255], [0xdb / 255, 0x77 / 255, 0x06 / 255]);
    expect(ratio).toBeGreaterThanOrEqual(3);
    expect(ratio).toBeLessThan(3.01);
  });

  it("does not take a translucent colour, a gradient or a length for an opaque colour", () => {
    for (const value of ["0 0% 0% / 0.7", "240 10% 10% / 0.45", "0.75rem", "#7c3aed", "radial-gradient(ellipse at top, #0f0528 0%, #000000 55%)", ""]) {
      expect(parseHsl(value)).toBeNull();
    }
  });
});

describe("the theme tokens in globals.css", () => {
  const TOKENS = [
    "background",
    "foreground",
    "card",
    "muted-foreground",
    "accent",
    "accent-foreground",
    "input",
    "field",
    "accent-subtle",
    "accent-border",
    "accent-ink",
    ...STATUS_FILLS.flatMap((fill) => [fill, `${fill}-subtle`, `${fill}-border`, `${fill}-ink`]),
  ];

  it("defines every portal colour for dark mode in :root, as an opaque colour", () => {
    for (const token of TOKENS) {
      expect(parseHsl(ROOT.get(token) ?? ""), `--${token} in :root`).not.toBeNull();
    }
  });

  // The public site's own controls are drawn with the :root values, so the border the portal
  // needs is set where only the portal sees it.
  it("gives the portal its own control border in the block for both themes, and leaves :root to the public site", () => {
    expect(parseHsl(PORTAL_OVERRIDES.get("input") ?? ""), `--input in ${PORTAL_SELECTOR}`).not.toBeNull();
    expect(ROOT.get("input")).toBe("10 8% 9%");
    expect(PORTAL_OVERRIDES.get("input")).not.toBe(ROOT.get("input"));
    // On the public site that border is as faint as it always was; in the portal it can be seen.
    const publicBorder = parseHsl(ROOT.get("input") ?? "");
    const publicCard = parseHsl(ROOT.get("card") ?? "");
    if (!publicBorder || !publicCard) throw new Error("--input and --card must be opaque colours in :root.");
    expect(contrast(publicBorder, publicCard)).toBeLessThan(1.5);
    expect(ratioOf("dark", "input", "card")).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM);
  });

  it("sets nothing for both themes that light mode does not set again, and sets it for light afterwards", () => {
    // The block for both themes applies to a light page too, and carries a dark value.
    expect(PORTAL_OVERRIDES.size).toBeGreaterThan(0);
    for (const token of PORTAL_OVERRIDES.keys()) {
      expect(LIGHT_OVERRIDES.has(token), `--${token} in light mode`).toBe(true);
      expect(LIGHT_OVERRIDES.get(token), `--${token}`).not.toBe(PORTAL_OVERRIDES.get(token));
    }
    // The two selectors weigh the same, so the later rule is the one that counts.
    const startOf = (selector: string): number => STYLESHEET.search(new RegExp(`${escapeForPattern(selector)}\\s*\\{`));
    expect(startOf(ROOT_SELECTOR)).toBeGreaterThanOrEqual(0);
    expect(startOf(PORTAL_SELECTOR)).toBeGreaterThan(startOf(ROOT_SELECTOR));
    expect(startOf(LIGHT_SELECTOR)).toBeGreaterThan(startOf(PORTAL_SELECTOR));
  });

  it("defines the overlay in both themes, as a translucent colour", () => {
    for (const theme of THEME_NAMES) {
      expect(THEMES[theme].get("overlay"), theme).toMatch(/^\d+ \d+% \d+% \/ 0?\.\d+$/);
    }
  });

  it("overrides every colour for light mode, so nothing dark is left behind on a light page", () => {
    const colours = [...ROOT].filter(([, value]) => parseHsl(value) !== null).map(([token]) => token);
    expect(colours.length).toBeGreaterThanOrEqual(30);
    const missing = [...colours, "overlay"].filter((token) => !LIGHT_OVERRIDES.has(token));
    expect(missing).toEqual([]);
    for (const token of TOKENS) {
      expect(parseHsl(LIGHT_OVERRIDES.get(token) ?? ""), `--${token} in light mode`).not.toBeNull();
    }
  });

  it("really has two themes: the page, the card and the text are different colours in each", () => {
    for (const token of ["background", "foreground", "card", "muted-foreground", "field", ...INKS]) {
      expect(THEMES.light.get(token), token).not.toBe(THEMES.dark.get(token));
    }
    expect(luminance(colourOf("dark", "background"))).toBeLessThan(0.05);
    expect(luminance(colourOf("light", "background"))).toBeGreaterThan(0.85);
  });

  it("has only the one dark theme: the .dark class repeats :root for every token it sets", () => {
    const repeated = customProperties(".dark");
    expect(repeated.size).toBeGreaterThan(0);
    for (const [token, value] of repeated) expect(value, `--${token}`).toBe(ROOT.get(token));
  });
});

describe("contrast of the theme tokens", () => {
  const cases = THEME_NAMES.flatMap((theme) =>
    PAIRS.map((pair) => {
      const key = `${theme}: ${pair.foreground} on ${pair.background}`;
      return { ...pair, theme, title: titleOf(key, pair.minimum) };
    }),
  );

  it("covers text, inks, the accent button, the status fills, the control border and the mark on a fill, in both themes", () => {
    expect(cases).toHaveLength(48);
    expect(new Set(cases.map((item) => item.title)).size).toBe(48);
    // The mark in the progress grid, on each of the three fills, in each theme.
    expect(cases.filter((item) => item.foreground === "background").map((item) => `${item.theme}: ${item.background}`)).toEqual([
      "dark: success",
      "dark: warning",
      "dark: danger",
      "light: success",
      "light: warning",
      "light: danger",
    ]);
  });

  // One test per pair, each under its full name, so a failure says which pair and which theme.
  for (const { title, theme, foreground, background, minimum } of cases) {
    it(title, () => {
      const ratio = ratioOf(theme, foreground, background);
      expect(ratio, `${theme}: --${foreground} on --${background} measures ${ratio.toFixed(3)}:1`).toBeGreaterThanOrEqual(minimum);
    });
  }

  it("measures the control border in each theme against that theme's own card", () => {
    // Dark takes it from the block for both themes, light from its own block: not from :root.
    expect(THEMES.dark.get("input")).toBe(PORTAL_OVERRIDES.get("input"));
    expect(THEMES.light.get("input")).toBe(LIGHT_OVERRIDES.get("input"));
    expect(THEMES.light.get("input")).not.toBe(THEMES.dark.get("input"));
    // A border lighter than a dark card, and darker than a light one.
    expect(luminance(colourOf("dark", "input"))).toBeGreaterThan(luminance(colourOf("dark", "card")));
    expect(luminance(colourOf("light", "input"))).toBeLessThan(luminance(colourOf("light", "card")));
  });

});

// ── The components use the tokens ────────────────────────────────────────────

/** The folders whose pages carry the theme. */
const THEMED_FOLDERS = [
  ...readdirSync(fromRepo("src", "components"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^Portal.*Components$/.test(entry.name))
    .map((entry) => path.join("src", "components", entry.name)),
  path.join("src", "app", "login"),
  path.join("src", "app", "portal"),
].sort();

function tsxFiles(folder: string): string[] {
  return readdirSync(fromRepo(folder), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(folder, entry.name);
    if (entry.isDirectory()) return tsxFiles(relative);
    return entry.name.endsWith(".tsx") ? [relative] : [];
  });
}

const SOURCES = THEMED_FOLDERS.flatMap(tsxFiles)
  .sort()
  .map((file) => ({ file: file.split(path.sep).join("/"), lines: readFileSync(fromRepo(file), "utf8").split("\n") }));

/** Every utility that takes a colour. */
const COLOUR_UTILITY =
  "(?:text|bg|border(?:-[trblxyse])?|ring|ring-offset|accent|fill|stroke|outline|decoration|divide|caret|placeholder|shadow|from|via|to)";
const PALETTE =
  "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";
/** For example "text-red-400", "hover:bg-emerald-500/10" or "border-t-amber-300". */
const PALETTE_UTILITY = new RegExp(`(?<![\\w-])${COLOUR_UTILITY}-${PALETTE}-\\d{2,3}(?![\\w-])`, "g");
/** For example "bg-black", "text-white" or "border-white/10". */
const NEUTRAL_UTILITY = new RegExp(`(?<![\\w-])${COLOUR_UTILITY}-(?:black|white)(?![\\w-])`, "g");
/** For example "bg-[#0f0528]" or "text-[rgb(255,0,0)]": a colour written out where a token belongs. */
const WRITTEN_OUT_COLOUR = new RegExp(`(?<![\\w-])${COLOUR_UTILITY}-\\[(?:#|rgba?\\(|hsla?\\((?!var\\())[^\\]]*\\]`, "g");

interface Use {
  file: string;
  line: number;
  utility: string;
  text: string;
}

function uses(pattern: RegExp): Use[] {
  return SOURCES.flatMap(({ file, lines }) =>
    lines.flatMap((text, index) => [...text.matchAll(pattern)].map((match) => ({ file, line: index + 1, utility: match[0], text }))),
  );
}

const located = (found: Use[]): string[] => found.map((use) => `${use.file}:${use.line} ${use.utility}`);

/**
 * The only fixed neutrals the portal means to have, each with how many times
 * it appears. Anything else, and any extra copy of these, fails.
 */
const ALLOWED_NEUTRALS: Record<string, number> = {
  // A QR code has to be dark on white to scan, in either theme.
  "src/components/PortalAuthComponents/enroll-steps.tsx bg-white": 1,
  // The thumb of a switch, on its accent or grey track.
  "src/components/PortalComponents/primitives.tsx bg-white": 1,
};

const PROGRESS_GRID = "src/components/PortalComponents/progress-matrix.tsx";
/** The colour of the tick or cross on a solid status fill: the page's own, which changes with the theme. */
const MARK_UTILITY = /(?<![\w-])text-background(?![\w/-])/g;
/** A status colour used as a solid fill: "bg-success", and not "bg-success-subtle" or "bg-success/20". */
const SOLID_STATUS_FILL = /(?<![\w-])bg-(?:success|warning|danger)(?![\w/-])/g;

describe("the portal's components use the theme tokens", () => {
  it("looks through every component and page that carries the theme", () => {
    expect(THEMED_FOLDERS.map((folder) => folder.split(path.sep).join("/"))).toEqual([
      "src/app/login",
      "src/app/portal",
      "src/components/PortalAdminComponents",
      "src/components/PortalAuthComponents",
      "src/components/PortalComponents",
      "src/components/PortalFormComponents",
      "src/components/PortalReviewComponents",
    ]);
    expect(SOURCES.length).toBeGreaterThanOrEqual(60);
    for (const folder of THEMED_FOLDERS) {
      const prefix = `${folder.split(path.sep).join("/")}/`;
      expect(SOURCES.some((source) => source.file.startsWith(prefix)), folder).toBe(true);
    }
    // They do use colour utilities, so finding none from the palette below is not for want of any.
    const tokenUtility = new RegExp(`(?<![\\w-])${COLOUR_UTILITY}-(?:foreground|muted-foreground|card|border|accent-ink|success-ink|danger-ink|warning-ink)(?![\\w-])`, "g");
    expect(uses(tokenUtility).length).toBeGreaterThan(200);
  });

  it("can find what it is looking for", () => {
    const sample = [
      "text-red-400",
      "hover:bg-emerald-500/10",
      "border-amber-300",
      "border-t-violet-600",
      "ring-blue-500",
      "ring-offset-slate-900",
      "accent-green-600",
      "fill-yellow-50",
      "stroke-zinc-700",
      "dark:from-purple-900",
      "divide-gray-200",
      "placeholder-neutral-500",
    ];
    for (const utility of sample) expect(utility.match(PALETTE_UTILITY), utility).not.toBeNull();
    for (const utility of ["bg-black", "text-white", "border-white/10", "hover:bg-black/40", "ring-white"]) {
      expect(utility.match(NEUTRAL_UTILITY), utility).not.toBeNull();
    }
    for (const utility of ["bg-[#0f0528]", "text-[rgb(255,0,0)]", "border-[hsl(0_0%_100%)]"]) {
      expect(utility.match(WRITTEN_OUT_COLOUR), utility).not.toBeNull();
    }
    // Token utilities, and words that merely contain a colour's name, are left alone.
    const fine = [
      "text-danger-ink",
      "bg-success-subtle",
      "border-warning-border",
      "bg-accent/15",
      "text-foreground",
      "bg-card",
      "border-border",
      "bg-field",
      "bg-overlay",
      "text-sm",
      "border-2",
      "to-do-100",
      "whitespace-nowrap",
      "bg-[hsl(var(--card))]",
      "my-text-red-400",
      "text-red-400-ish",
    ];
    for (const utility of fine) {
      expect(utility.match(PALETTE_UTILITY), utility).toBeNull();
      expect(utility.match(NEUTRAL_UTILITY), utility).toBeNull();
      expect(utility.match(WRITTEN_OUT_COLOUR), utility).toBeNull();
    }
  });

  it("uses no utility from Tailwind's fixed palette, which would stay the same colour in both themes", () => {
    expect(located(uses(PALETTE_UTILITY))).toEqual([]);
  });

  it("writes no colour out by hand in a utility", () => {
    expect(located(uses(WRITTEN_OUT_COLOUR))).toEqual([]);
  });

  it("uses fixed black or white only in the two places that are meant to be the same in both themes", () => {
    const counted: Record<string, number> = {};
    for (const use of uses(NEUTRAL_UTILITY)) {
      const key = `${use.file} ${use.utility}`;
      counted[key] = (counted[key] ?? 0) + 1;
    }
    expect(counted).toEqual(ALLOWED_NEUTRALS);
    expect(Object.keys(counted)).toHaveLength(2);
    // Both are backings, not text: nothing in the portal is written in fixed black or white.
    expect(located(uses(NEUTRAL_UTILITY)).filter((use) => !use.endsWith(" bg-white"))).toEqual([]);
  });

  it("draws the mark in the progress grid in the page's colour, on a solid status fill and nowhere else", () => {
    const marks = uses(MARK_UTILITY).filter((use) => use.file === PROGRESS_GRID);
    expect(marks).toHaveLength(3);
    const marked: string[] = [];
    for (const use of marks) {
      const classes = /"([^"]*\btext-background\b[^"]*)"/.exec(use.text)?.[1].split(/\s+/) ?? [];
      const fills = classes.filter((name) => name.startsWith("bg-"));
      expect(fills, `${use.file}:${use.line}`).toHaveLength(1);
      expect(["bg-success", "bg-warning", "bg-danger"], `${use.file}:${use.line}`).toContain(fills[0]);
      marked.push(fills[0]);
    }
    // One for each of the three fills whose contrast with the mark is measured above.
    expect(marked.sort()).toEqual(STATUS_FILLS.map((fill) => `bg-${fill}`).sort());
  });

  it("puts that colour on every solid status fill in the progress grid, so none is left with a mark that cannot be seen", () => {
    const fills = uses(SOLID_STATUS_FILL).filter((use) => use.file === PROGRESS_GRID);
    expect(fills).toHaveLength(3);
    for (const use of fills) {
      const classes = new RegExp(`"([^"]*\\b${use.utility}\\b[^"]*)"`).exec(use.text)?.[1].split(/\s+/) ?? [];
      expect(classes, `${use.file}:${use.line}`).toContain("text-background");
      expect(classes.filter((name) => name.startsWith("text-")), `${use.file}:${use.line}`).toEqual(["text-background"]);
    }
  });

  it("can tell a solid status fill and the mark's colour from the utilities that only look like them", () => {
    for (const utility of ["bg-success", "bg-warning", "hover:bg-danger"]) expect(utility.match(SOLID_STATUS_FILL), utility).not.toBeNull();
    for (const utility of ["bg-success-subtle", "bg-warning/20", "bg-danger-border", "border-danger", "text-success", "my-bg-success"]) {
      expect(utility.match(SOLID_STATUS_FILL), utility).toBeNull();
    }
    for (const utility of ["text-background", "hover:text-background"]) expect(utility.match(MARK_UTILITY), utility).not.toBeNull();
    for (const utility of ["text-background/80", "bg-background", "text-background-x", "ring-offset-background"]) {
      expect(utility.match(MARK_UTILITY), utility).toBeNull();
    }
  });
});
