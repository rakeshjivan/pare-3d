import { describe, expect, it, vi } from "vitest";
import {
  APP_THEME_STORAGE_KEY,
  applyAppTheme,
  appThemePalette,
  GRAPHITE_STYLESHEET_HREF,
  GRAPHITE_STYLESHEET_ID,
  normalizeAppThemePreference,
  readStoredAppTheme,
  resolveAppTheme,
  storeAppTheme,
} from "@/lib/appTheme";

describe("application theme preference", () => {
  it("normalizes stored values and resolves the system theme", () => {
    expect(normalizeAppThemePreference("light")).toBe("light");
    expect(normalizeAppThemePreference("dark")).toBe("dark");
    expect(normalizeAppThemePreference("unexpected")).toBe("light"); // fork default
    expect(resolveAppTheme("system", true)).toBe("dark");
    expect(resolveAppTheme("system", false)).toBe("light");
    expect(resolveAppTheme("light", true)).toBe("light");
  });

  it("persists the selected preference and safely falls back for invalid storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    storeAppTheme(storage, "dark");
    expect(values.get(APP_THEME_STORAGE_KEY)).toBe("dark");
    expect(readStoredAppTheme(storage)).toBe("dark");
    values.set(APP_THEME_STORAGE_KEY, "neon");
    expect(readStoredAppTheme(storage)).toBe("light"); // fork default
  });

  it("offers graphite as a dark theme with a neutral palette", () => {
    expect(normalizeAppThemePreference("graphite")).toBe("graphite");
    expect(resolveAppTheme("graphite", false)).toBe("dark");
    expect(resolveAppTheme("graphite", true)).toBe("dark");
    // Fork: light is always the blue Classic palette, dark always Graphite.
    expect(appThemePalette("graphite", false)).toBe("graphite");
    expect(appThemePalette("dark", false)).toBe("graphite");
    expect(appThemePalette("system", true)).toBe("graphite");
    expect(appThemePalette("system", false)).toBe("classic");
    expect(appThemePalette("light", true)).toBe("classic");
  });

  it("links the dark stylesheets once dark is in use, and only once", () => {
    const appended: Array<{ id: string; rel: string; href: string }> = [];
    const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
    const fakeDocument = {
      documentElement: root,
      head: { appendChild: (node: { id: string; rel: string; href: string }) => appended.push(node) },
      createElement: () => ({ id: "", rel: "", href: "" }),
      getElementById: (id: string) => appended.find((node) => node.id === id) ?? null,
    };
    vi.stubGlobal("document", fakeDocument);
    try {
      applyAppTheme("light", false);
      expect(root.dataset).toMatchObject({ theme: "light", palette: "classic" });
      applyAppTheme("dark", false);
      applyAppTheme("graphite", true);
      expect(appended.filter((node) => node.id === GRAPHITE_STYLESHEET_ID)).toEqual([{ id: GRAPHITE_STYLESHEET_ID, rel: "stylesheet", href: GRAPHITE_STYLESHEET_HREF }]);
      expect(appended.filter((node) => node.id === "layerling-classic-dark-theme")).toHaveLength(1);
      expect(root.dataset).toMatchObject({ theme: "dark", palette: "graphite" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("links the graphite stylesheet from the site root, versioned with the app", async () => {
    // Relative, it resolved against the current URL and missed on any page not
    // at the root; unversioned, a cached copy from an older release could stay.
    expect(GRAPHITE_STYLESHEET_HREF.startsWith("/assets/theme/graphite-theme.css")).toBe(true);
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.18.5");
    try {
      const theme = await import("@/lib/appTheme");
      expect(theme.GRAPHITE_STYLESHEET_HREF).toBe("/assets/theme/graphite-theme.css?v=1.18.5");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
