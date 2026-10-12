"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_LABELS, THEME_PREFERENCES, type ThemePreference } from "@/lib/portal/theme";
import { cn } from "@/lib/utils";
import { usePortalTheme } from "./portal-theme";

/**
 * A one-press switch between light and dark, for page headers. Both icons are
 * always in the page and the theme decides which one shows, so the button is
 * right from the first paint, before this component has run in the browser.
 */
export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { resolved, setPreference } = usePortalTheme();
  return (
    <button
      type="button"
      onClick={() => setPreference(resolved === "dark" ? "light" : "dark")}
      aria-label="Switch between light and dark mode"
      title="Switch between light and dark mode"
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground print:hidden",
        className,
      )}
    >
      <Sun className="portal-when-dark h-4 w-4" aria-hidden />
      <Moon className="portal-when-light h-4 w-4" aria-hidden />
    </button>
  );
};

const ICONS: Record<ThemePreference, React.ReactNode> = {
  system: <Monitor className="h-4 w-4" aria-hidden />,
  light: <Sun className="h-4 w-4" aria-hidden />,
  dark: <Moon className="h-4 w-4" aria-hidden />,
};

/** The full choice, including following the device. Used on the Account page. */
export const ThemeChoice: React.FC = () => {
  const { preference, setPreference } = usePortalTheme();
  return (
    <div role="radiogroup" aria-label="Appearance" className="flex rounded-lg border border-border p-0.5">
      {THEME_PREFERENCES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={preference === option}
          onClick={() => setPreference(option)}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
            preference === option
              ? "bg-accent-subtle text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {ICONS[option]}
          {THEME_LABELS[option]}
        </button>
      ))}
    </div>
  );
};
