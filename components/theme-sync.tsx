"use client";

import { useLayoutEffect } from "react";
import {
  applyThemePreference,
  readThemePreference,
  watchSystemTheme,
} from "@/lib/theme";

// The boot script handles first paint. This covers what it can't: Strict Mode's
// dev remount resets <html> attributes, and an OS theme change while the
// preference is "system" should follow without a reload.
export function ThemeSync() {
  useLayoutEffect(() => {
    applyThemePreference(readThemePreference());
    return watchSystemTheme(() => {
      if (readThemePreference() === "system") {
        applyThemePreference("system");
      }
    });
  }, []);

  return null;
}
