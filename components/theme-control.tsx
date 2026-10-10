"use client";

import { useSyncExternalStore } from "react";
import {
  readThemePreference,
  setThemePreference,
  THEME_CHANGE_EVENT,
  THEME_PREFERENCES,
  type ThemePreference,
} from "@/lib/theme";

const LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}

// The highlighted option is drawn by CSS from `data-theme-preference` on
// <html>, which the boot script sets before paint. React state only drives
// aria-pressed, which is null on the server and corrected after hydration.
export function ThemeControl() {
  const current = useSyncExternalStore(
    subscribe,
    readThemePreference,
    () => null,
  );

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex h-6 items-stretch rounded border border-border"
    >
      {THEME_PREFERENCES.map((preference) => (
        <button
          key={preference}
          type="button"
          data-theme-option={preference}
          aria-pressed={current === null ? undefined : current === preference}
          onClick={() => setThemePreference(preference)}
          className="theme-option px-2 text-[11px] text-muted hover:text-fg"
        >
          {LABELS[preference]}
        </button>
      ))}
    </div>
  );
}
