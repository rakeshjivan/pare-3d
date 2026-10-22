import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { belowBedCutter, shapeBelowBed } from "@/lib/cutBelowBed";
import { buildGroupedShapeFromSelection } from "@/lib/editorBooleans";
import { meshForShape } from "@/lib/editorMeshCore";
import { checkForPrinting } from "@/lib/printCheck";
import type { WorkplaneShape } from "@/types/layerling";

const box = (elevation: number, rotationX = 0) => ({ id: "b", name: "Block", kind: "box", color: "#d41721", x: 5, z: -3, elevation, size: 20, width: 20, depth: 20, height: 20, rotation: 0, rotationX }) as unknown as WorkplaneShape;
const extent = (shape: WorkplaneShape) => {
  const ys = meshForShape(shape).vertices.map((v) => v[1]);
  return { min: Math.min(...ys), max: Math.max(...ys) };
};

describe("Cut below the bed (build 30)", () => {
  it("finds a part sunk below the plate, and not one standing on it", () => {
    expect(shapeBelowBed(box(-5))).not.toBeNull();
    expect(shapeBelowBed(box(0))).toBeNull();
    expect(shapeBelowBed(box(0.5))).toBeNull();
  });

  it("trims the part at the plate and keeps its top", async () => {
    const part = box(-5);
    const cutter = belowBedCutter(part)!;
    expect(cutter.hole).toBe(true);
    const result = await buildGroupedShapeFromSelection([part, cutter], 400000);
    const { min, max } = extent(result.group!);
    expect(min).toBeCloseTo(0, 2);
    expect(max).toBeCloseTo(15, 3);
  });

  it("is reported by Ready to print? as advice", () => {
    const issues = checkForPrinting([box(-5)], { bed: null, overhangAngle: 45, meshFor: meshForShape });
    expect(issues.find((issue) => issue.kind === "belowBed")).toMatchObject({ level: "advice", ids: ["b"] });
  });
});
