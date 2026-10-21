export const APP_THEME_STORAGE_KEY = "layerling.theme";

export const APP_THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "graphite", label: "Graphite" },
  { value: "classic", label: "Classic" },
] as const;

export type AppThemePreference = (typeof APP_THEME_OPTIONS)[number]["value"];
/**
 * Fork: the choices offered. Light is always the blue Classic look and dark the neutral Graphite
 * one; the warm beige and orange palettes are not offered. "classic" and "graphite" stay valid
 * values so a stored choice still reads, and resolve to light and dark.
 */
export const APP_THEME_CHOICES = APP_THEME_OPTIONS.filter((option) => option.value === "system" || option.value === "light" || option.value === "dark");
/**
 * Graphite is the dark theme with neutral grey surfaces instead of the warm
 * brown ones. It resolves to "dark", so everything that only asks light or
 * dark keeps working; the palette on top only swaps colours.
 */
export type ResolvedAppTheme = "light" | "dark";
export type AppThemePalette = "default" | "graphite" | "classic";

export function appThemePalette(preference: AppThemePreference, prefersDark?: boolean): AppThemePalette {
  const dark = prefersDark ?? (typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false);
  return resolveAppTheme(preference, dark) === "dark" ? "graphite" : "classic";
}

export function normalizeAppThemePreference(value: unknown): AppThemePreference {
  return value === "light" || value === "dark" || value === "graphite" || value === "classic" || value === "system" ? value : "light";
}

export function resolveAppTheme(preference: AppThemePreference, prefersDark: boolean): ResolvedAppTheme {
  if (preference === "system") return prefersDark ? "dark" : "light";
  // Classic is the light theme in cool greys with a blue accent.
  if (preference === "classic") return "light";
  return preference === "graphite" ? "dark" : preference;
}

export function readStoredAppTheme(storage: Pick<Storage, "getItem"> | null | undefined): AppThemePreference {
  if (!storage) return "light";
  try {
    return normalizeAppThemePreference(storage.getItem(APP_THEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}

/** Whether this browser has a theme on record, even "system": someone chose it, or it has been applied before. */
export function hasStoredAppTheme(storage: Pick<Storage, "getItem"> | null | undefined): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(APP_THEME_STORAGE_KEY) !== null;
  } catch {
    return true;
  }
}

export function storeAppTheme(
  storage: Pick<Storage, "setItem"> | null | undefined,
  preference: AppThemePreference,
) {
  if (!storage) return;
  try {
    storage.setItem(APP_THEME_STORAGE_KEY, preference);
  } catch {
    // The selected theme still applies for this session when storage is unavailable.
  }
}

export function applyAppTheme(preference: AppThemePreference, prefersDark?: boolean) {
  if (typeof document === "undefined") return;
  const systemPrefersDark = prefersDark ?? (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false
  );
  const resolved = resolveAppTheme(preference, systemPrefersDark);
  document.documentElement.dataset.theme = resolved;
  const palette = appThemePalette(preference, systemPrefersDark);
  if (palette === "default") delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = palette;
  document.documentElement.style.colorScheme = resolved;
  if (palette === "graphite") {
    ensureGraphiteStylesheet();
    // Fork: Graphite's accents in blue, after it.
    ensurePaletteStylesheet(CLASSIC_DARK_STYLESHEET_ID, CLASSIC_DARK_STYLESHEET_HREF);
  }
  if (palette === "classic") ensurePaletteStylesheet(CLASSIC_STYLESHEET_ID, CLASSIC_STYLESHEET_HREF);
}

export const GRAPHITE_STYLESHEET_ID = "layerling-graphite-theme";
// Root-relative like every other asset: a relative path resolved against the
// current URL and missed on any page not at the root (the 404 page, say). The
// version query keeps a cached stylesheet from an older release out, since
// the file is regenerated from globals.css under the same name every build.
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION;
export const GRAPHITE_STYLESHEET_HREF = `/assets/theme/graphite-theme.css${appVersion ? `?v=${appVersion}` : ""}`;

/**
 * Graphite's colours live in a generated stylesheet that is only fetched once
 * someone picks the theme. It goes last in <head> so it follows globals.css;
 * its rules only match while data-palette="graphite" is set, so it can stay
 * when the theme is switched away again.
 */
function ensureGraphiteStylesheet() {
  ensurePaletteStylesheet(GRAPHITE_STYLESHEET_ID, GRAPHITE_STYLESHEET_HREF);
}

export const CLASSIC_STYLESHEET_ID = "layerling-classic-theme";
export const CLASSIC_STYLESHEET_HREF = `/assets/theme/classic-theme.css${appVersion ? `?v=${appVersion}` : ""}`;
export const CLASSIC_DARK_STYLESHEET_ID = "layerling-classic-dark-theme";
export const CLASSIC_DARK_STYLESHEET_HREF = `/assets/theme/classic-dark-theme.css${appVersion ? `?v=${appVersion}` : ""}`;

function ensurePaletteStylesheet(id: string, href: string) {
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

const themeListeners = new Set<() => void>();
let currentThemePreference: AppThemePreference =
  typeof window !== "undefined" ? readStoredAppTheme(window.localStorage) : "light";

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handleMediaChange = () => {
    if (currentThemePreference === "system") {
      applyAppTheme("system", media.matches);
      themeListeners.forEach((listener) => listener());
    }
  };
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", handleMediaChange);
  } else if (typeof (media as unknown as { addListener?: (cb: () => void) => void }).addListener === "function") {
    (media as unknown as { addListener: (cb: () => void) => void }).addListener(handleMediaChange);
  }
}

export function subscribeToAppTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

export function getAppThemePreference(): AppThemePreference {
  return currentThemePreference;
}

export function setAppTheme(preference: AppThemePreference, persist = true) {
  currentThemePreference = preference;
  if (persist && typeof window !== "undefined") {
    storeAppTheme(window.localStorage, preference);
  }
  applyAppTheme(preference);
  themeListeners.forEach((listener) => listener());
}

