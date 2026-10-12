/**
 * Light and dark mode for the sign-in pages and the portal. The public site is
 * dark only and is never themed: the theme is an attribute on <html> that is
 * present only while one of these pages is showing.
 */

export const THEME_STORAGE_KEY = "sep-portal-theme";
export const THEME_ATTRIBUTE = "data-portal-theme";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "Match device",
  light: "Light",
  dark: "Dark",
};

/** Anything that is not a stored choice means "follow the device". */
export function readPreference(raw: string | null | undefined): ThemePreference {
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function resolveTheme(preference: ThemePreference, deviceIsDark: boolean): ResolvedTheme {
  if (preference === "system") return deviceIsDark ? "dark" : "light";
  return preference;
}

/** The pages that carry a theme: sign-in and everything under the portal. */
export function isThemedPath(pathname: string): boolean {
  return ["/login", "/portal"].some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

/**
 * Runs in <head> before anything is painted, so a page never flashes in the
 * wrong theme. It mirrors readPreference, resolveTheme and isThemedPath above;
 * theme.test.ts runs it against them to keep the two from drifting.
 */
export const THEME_BOOT_SCRIPT =
  `(function(){try{` +
  `var p=location.pathname;` +
  `if(!(p==='/login'||p.indexOf('/login/')===0||p==='/portal'||p.indexOf('/portal/')===0))return;` +
  `var t=null;try{t=localStorage.getItem('${THEME_STORAGE_KEY}')}catch(e){}` +
  `var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);` +
  `document.documentElement.setAttribute('${THEME_ATTRIBUTE}',d?'dark':'light');` +
  `}catch(e){}})();`;
