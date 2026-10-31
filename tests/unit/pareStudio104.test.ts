import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dentalStudioAvailable, dentalWorkIn, isPareStudio, shapeIsDental, studioOfShapes } from "../../apps/web/src/lib/pareStudio";
import type { WorkplaneShape } from "../../apps/web/src/types/layerling";

const part = (extra: Partial<WorkplaneShape> = {}) => ({ id: "a", name: "Box", kind: "box", ...extra }) as unknown as WorkplaneShape;
const mesh = (count: number) => ({ positions: new Float32Array(count) }) as unknown as WorkplaneShape["importedMesh"];

describe("build 104: the two studios", () => {
  it("knows its two studios", () => {
    expect(isPareStudio("cad")).toBe(true);
    expect(isPareStudio("dental")).toBe(true);
    expect(isPareStudio("home")).toBe(false);
    expect(isPareStudio(undefined)).toBe(false);
  });

  it("puts ordinary parts in CAD Studio", () => {
    expect(studioOfShapes([])).toBe("cad");
    expect(studioOfShapes([part(), part({ name: "Upper bracket" })])).toBe("cad");
  });

  it("puts dental work in Dental Studio, also inside a group", () => {
    expect(studioOfShapes([part({ dental: "model" })])).toBe("dental");
    expect(studioOfShapes([part({ waxFor: "x" })])).toBe("dental");
    expect(studioOfShapes([part({ groupedShapes: [part(), part({ dental: "wax" })] })])).toBe("dental");
    expect(dentalWorkIn([part({ dental: "used" })])).toBe(true);
    expect(dentalWorkIn([part()])).toBe(false);
  });

  it("recognises a scan by its name and size, not a small part named like one", () => {
    expect(shapeIsDental(part({ name: "Example_UpperJawScan", importedMesh: mesh(9 * 30000) }))).toBe(true);
    expect(shapeIsDental(part({ name: "Upper bracket", importedMesh: mesh(9 * 500) }))).toBe(false);
    expect(shapeIsDental(part({ name: "Gear", importedMesh: mesh(9 * 30000) }))).toBe(false);
    // A scan alone does not count as dental work having begun (that moves a CAD design only on purpose).
    expect(dentalWorkIn([part({ name: "Example_UpperJawScan", importedMesh: mesh(9 * 30000) })])).toBe(false);
  });

  it("lets Dental Studio open (the single place a sign-in check will go)", () => {
    expect(dentalStudioAvailable()).toBe(true);
  });

  it("ships the two Home pictures", () => {
    for (const name of ["cad-hero.webp", "dental-hero.webp"]) {
      expect(existsSync(`apps/web/public/assets/home/${name}`)).toBe(true);
    }
  });

  it("keeps Wax-up off the public Home page unless the test-build switch is on", () => {
    const launcher = readFileSync("apps/web/src/components/home/HomeLauncher.tsx", "utf8");
    const start = readFileSync("apps/web/src/components/home/StudioPage.tsx", "utf8");
    expect(launcher).toMatch(/waxupShown \? <li className="test">/);
    // Build 104: the Digital Wax-Up workflow card only with the test-build switch.
    expect(start).toMatch(/\{waxupShown \? card\("wax"\) : null\}/);
    const page = readFileSync("apps/web/src/app/page.tsx", "utf8");
    expect(page).toContain("waxupShown={WAXUP_ENABLED}");
    expect(page).not.toMatch(/waxupShown=\{true\}/);
  });
});

describe("build 104: Dental Studio's workspace", () => {
  const editor = readFileSync("apps/web/src/components/LayerlingEditor.tsx", "utf8");
  const toolbar = readFileSync("apps/web/src/components/EditorSecondaryToolbar.tsx", "utf8");
  const css = readFileSync("apps/web/src/app/dentalStudio.css", "utf8");

  it("frames only a Dental Studio design, with Wax-up only in test builds", () => {
    expect(editor).toContain('const dentalWorkspace = studio === "dental";');
    expect(editor).toMatch(/\{dentalWorkspace \? \(\s*<DentalChrome/);
    expect(editor).toContain("waxup={WAXUP_ENABLED ?");
  });

  it("keeps CAD Studio's toolbar, with the dental tools replaced by Send to Dental Studio", () => {
    expect(toolbar).toMatch(/const dentalTools = onSendToDental \? \[/);
    expect(editor).toContain('onSendToDental={onStudioChange ? () => onStudioChange("dental") : undefined}');
  });

  it("hides CAD Studio's ribbon, shape library and footer only inside the Dental Studio frame", () => {
    expect(css).toMatch(/\.studio-dental \.secondary-toolbar,/);
    expect(css).toContain("--shape-dock-width: 0px;");
    // Every rule is scoped to the frame, so CAD Studio is untouched.
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/^[^@{}\n][^{}]*\{/gm) ?? [];
    for (const selector of selectors) {
      if (/^\s*(from|to)\s*\{/.test(selector)) continue;
      expect(selector, selector).toMatch(/studio-dental|dental-chrome/);
    }
  });
});
