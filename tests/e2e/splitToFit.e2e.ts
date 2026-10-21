import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { layOutOnPlate, planSplitToFit, splitToFit } from "@/lib/splitToFit";
import { meshForShape } from "@/lib/editorMeshCore";
import type { WorkplaneShape } from "@/types/layerling";

const bed = { width: 180, depth: 180, height: 180 };
function box(width: number, depth: number, height: number): WorkplaneShape {
  return { id: "big", name: "Big", kind: "box", color: "#d41721", x: 0, z: 0, elevation: 0, size: Math.max(width, depth), width, depth, height, rotation: 0 } as unknown as WorkplaneShape;
}
function extent(shape: WorkplaneShape) {
  const v = meshForShape(shape).vertices;
  const span = (i: number) => Math.max(...v.map((p) => p[i])) - Math.min(...v.map((p) => p[i]));
  return { x: span(0), y: span(1), z: span(2), minY: Math.min(...v.map((p) => p[1])) };
}

describe("split to fit (build 21)", () => {
  it("plans the fewest equal cuts in each direction", () => {
    expect(planSplitToFit({ minX: -150, maxX: 150, minY: 0, maxY: 20, minZ: -20, maxZ: 20 }, bed)).toEqual([{ axis: "x", position: 0 }]);
    expect(planSplitToFit({ minX: 0, maxX: 100, minY: 0, maxY: 400, minZ: 0, maxZ: 50 }, bed).map((cut) => cut.axis)).toEqual(["y", "y"]);
    expect(planSplitToFit({ minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 100 }, bed)).toEqual([]);
  });

  it("cuts a 300 mm bar into two pieces that fit, with a dowel, and lays them on the plate", async () => {
    const result = await splitToFit(box(300, 40, 20), bed);
    expect(result.status).toBe("done");
    if (result.status !== "done") return;
    expect(result.pieces).toHaveLength(2);
    result.pieces.forEach((piece) => expect(extent(piece).x).toBeLessThanOrEqual(174 + 0.01));
    expect(result.pins.length).toBeGreaterThanOrEqual(1);
    const laid = layOutOnPlate([...result.pieces, ...result.pins], 180);
    laid.forEach((piece) => expect(extent(piece).minY).toBeCloseTo(0, 3));
  });

  it("leaves a part that already fits alone", async () => {
    expect((await splitToFit(box(100, 100, 50), bed)).status).toBe("fits");
  });
});
