import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STUDIO_CHART } from "../../apps/web/src/lib/studioChart";
import { MESSAGES_EN as messages } from "../../apps/web/src/lib/messages.en";

const src = (path: string) => readFileSync(`apps/web/src/${path}`, "utf8");

describe("build 106: the studio frame", () => {
  it("charts every tooth of both arches, on pictures that ship with the app", () => {
    const upper = [17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27];
    const lower = [37, 36, 35, 34, 33, 32, 31, 41, 42, 43, 44, 45, 46, 47];
    expect(Object.keys(STUDIO_CHART.upper.teeth).map(Number).sort()).toEqual([...upper].sort());
    expect(Object.keys(STUDIO_CHART.lower.teeth).map(Number).sort()).toEqual([...lower].sort());
    for (const arch of ["upper", "lower"] as const) {
      expect(existsSync(`apps/web/public/${STUDIO_CHART[arch].src}`)).toBe(true);
      for (const tooth of Object.values(STUDIO_CHART[arch].teeth)) {
        expect(tooth.d.startsWith("M")).toBe(true);
        expect(tooth.c[0]).toBeGreaterThan(0);
        expect(tooth.c[0]).toBeLessThan(STUDIO_CHART[arch].w);
      }
    }
    // The patient's right on the left: 11 left of 21, 41 left of 31.
    expect(STUDIO_CHART.upper.teeth[11].c[0]).toBeLessThan(STUDIO_CHART.upper.teeth[21].c[0]);
    expect(STUDIO_CHART.lower.teeth[41].c[0]).toBeLessThan(STUDIO_CHART.lower.teeth[31].c[0]);
  });

  it("runs Wax-up Studio in seven steps: Import, Select teeth, Landmarks, Library, Position, Sculpt, Export", () => {
    const panel = src("components/workplane/DentalStudioPanel.tsx");
    expect(panel).toContain('["scans", "select", "teeth", "set", "place", "sculpt", "make"]');
    const names = ["scans", "select", "teeth", "set", "place", "sculpt", "make"].map((id) => messages[`waxStudio.step.${id}` as keyof typeof messages]);
    expect(names).toEqual(["Import", "Select teeth", "Landmarks", "Library", "Position", "Sculpt", "Export"]);
  });

  it("frames the studios only in test builds, and leaves CAD Studio and Dental Studio's own frame as they were", () => {
    expect(src("lib/pareFeatures.ts")).toContain("export const STUDIO_SHELL = WAXUP_ENABLED;");
    const editor = src("components/LayerlingEditor.tsx");
    expect(editor).toContain("const studioShellOn = STUDIO_SHELL && dentalWorkspace && Boolean(dentalStudio);");
    expect(editor).toContain("shell={studioShellOn}");
  });

  it("has words for everything in the frame", () => {
    const shell = src("components/workplane/StudioShell.tsx") + src("components/workplane/DentalStudioPanel.tsx") + src("components/workplane/WaxupCard.tsx");
    const used = new Set([...shell.matchAll(/"(studio\.[a-zA-Z]+)"/g)].map((match) => match[1]));
    for (const key of used) expect(messages[key as keyof typeof messages], key).toBeTruthy();
  });
});
