"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  isThemedPath,
  readPreference,
  resolveTheme,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/portal/theme";

interface PortalTheme {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<PortalTheme | null>(null);

export function usePortalTheme(): PortalTheme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("usePortalTheme must be used inside the sign-in or portal layout.");
  return theme;
}

const DEVICE_DARK = "(prefers-color-scheme: dark)";

// On the server there is nothing to lay out. The script in <head> has already
// set the attribute by the time the browser runs this.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function storedPreference(): ThemePreference {
  try {
    return readPreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

/**
 * Keeps the theme attribute on <html> in step with the person's choice while a
 * sign-in or portal page is showing, and takes it off again when they leave
 * for the public site, which has only one look.
 */
export const PortalThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [deviceIsDark, setDeviceIsDark] = useState(true);

  useBrowserLayoutEffect(() => {
    setPreferenceState(storedPreference());
    setDeviceIsDark(window.matchMedia(DEVICE_DARK).matches);
  }, []);

  useEffect(() => {
    const media = window.matchMedia(DEVICE_DARK);
    const onDevice = () => setDeviceIsDark(media.matches);
    // Another tab changed the choice.
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) setPreferenceState(readPreference(event.newValue));
    };
    media.addEventListener("change", onDevice);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onDevice);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const resolved = resolveTheme(preference, deviceIsDark);

  useBrowserLayoutEffect(() => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, resolved);
  }, [resolved]);

  // Leaving for the public site. Moving between sign-in and the portal keeps
  // the attribute, so there is no flash in between.
  useEffect(
    () => () => {
      window.setTimeout(() => {
        if (!isThemedPath(window.location.pathname)) {
          document.documentElement.removeAttribute(THEME_ATTRIBUTE);
        }
      }, 0);
    },
    [],
  );

  // Paper is white: a response printed from dark mode should not be a black page.
  useEffect(() => {
    const toLight = () => document.documentElement.setAttribute(THEME_ATTRIBUTE, "light");
    const restore = () => document.documentElement.setAttribute(THEME_ATTRIBUTE, resolved);
    window.addEventListener("beforeprint", toLight);
    window.addEventListener("afterprint", restore);
    return () => {
      window.removeEventListener("beforeprint", toLight);
      window.removeEventListener("afterprint", restore);
    };
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable in private windows. The choice still holds for this visit.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
