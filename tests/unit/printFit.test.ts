import { describe, expect, it } from "vitest";
import { applyPrintFit, appliedPrintFit, printFitSupported } from "@/components/workplane/PrintFitCard";
import type { WorkplaneShape } from "@/types/layerling";

const hole = (patch: Partial<WorkplaneShape> = {}) =>
  ({ id: "h1", kind: "cylinder", hole: true, width: 5, depth: 5, height: 10, size: 5, x: 0, y: 0, z: 0, ...patch }) as unknown as WorkplaneShape;

describe("Print fit for holes", () => {
  it("works on single straight holes only", () => {
    expect(printFitSupported(hole())).toBe(true);
    expect(printFitSupported(hole({ hole: false }))).toBe(false);
    expect(printFitSupported(hole({ groupedShapes: [hole()] } as Partial<WorkplaneShape>))).toBe(false);
  });

  it("grows the hole by the clearance and does not stack when switching fits", () => {
    let shape = hole({ id: "h2" });
    const snug = applyPrintFit(shape, 0.2);
    expect(snug.width).toBeCloseTo(5.2);
    expect(snug.depth).toBeCloseTo(5.2);
    shape = { ...shape, ...snug };
    const loose = applyPrintFit(shape, 0.4);
    expect(loose.width).toBeCloseTo(5.4);
    shape = { ...shape, ...loose };
    const exact = applyPrintFit(shape, 0);
    expect(exact.width).toBeCloseTo(5);
    expect(appliedPrintFit({ ...shape, ...exact })).toBe(0);
  });

  it("stays right after Undo: the clearance follows the hole's size", () => {
    const drawn = hole({ id: "h3" });
    const snug = { ...drawn, ...applyPrintFit(drawn, 0.2) };
    applyPrintFit(snug, 0.4);
    // Undo puts the snug size back; Exact must return to the drawn 5 mm, not 4.8.
    expect(appliedPrintFit(snug)).toBe(0.2);
    expect(applyPrintFit(snug, 0).width).toBeCloseTo(5);
    // A size Print fit never made counts as drawn.
    expect(appliedPrintFit(hole({ id: "h3", width: 7, depth: 7 }))).toBeUndefined();
  });
});
