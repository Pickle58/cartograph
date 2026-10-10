// The preference lives in localStorage and is applied by an inline script
// before first paint. A cookie read on the server would make the root layout
// dynamic and push every route behind a Suspense boundary.
//
// Two attributes on <html>: `data-theme` is the resolved light/dark the colour
// tokens key off; `data-theme-preference` is what the user picked, so the
// control can show it without waiting for hydration.

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_STORAGE_KEY = "cartograph-theme";
export const THEME_CHANGE_EVENT = "cartograph-theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  const resolved =
    preference === "system"
      ? matchMedia(DARK_QUERY).matches
        ? "dark"
        : "light"
      : preference;
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  applyThemePreference(preference);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function watchSystemTheme(onChange: () => void): () => void {
  const query = matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// Same logic as readThemePreference + applyThemePreference, inlined because it
// has to run during HTML parsing, before any bundle has loaded.
export const themeBootScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(p!=="light"&&p!=="dark")p="system";var r=document.documentElement;r.dataset.theme=p==="system"?(matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches?"dark":"light"):p;r.dataset.themePreference=p}catch(e){}})()`;
