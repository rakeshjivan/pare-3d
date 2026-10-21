import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { buildGroupedShapeFromSelection } from "@/lib/editorBooleans";
import { meshForShape } from "@/lib/editorMeshCore";
import type { WorkplaneShape } from "@/types/layerling";

function box(id: string, width: number, depth: number, height: number, elevation = 0, hole = false, x = 0, z = 0): WorkplaneShape {
  return { id, name: id, kind: "box", color: "#d41721", x, z, elevation, size: Math.max(width, depth), width, depth, height, rotation: 0, ...(hole ? { hole: true } : {}) } as unknown as WorkplaneShape;
}

function topHeights(shape: WorkplaneShape) {
  const v = meshForShape(shape).vertices;
  return [...new Set(v.map((p) => Number(p[1].toFixed(4))))].sort((a, b) => a - b);
}

describe("holes cut exactly as deep as they are set (build 23)", () => {
  it("a 5 mm deep pocket over the whole top of a 20 mm box leaves 15 mm", async () => {
    const result = await buildGroupedShapeFromSelection([box("solid", 20, 20, 20), box("pocket", 20, 20, 5.2, 15, true)], 200000);
    expect(result.group).toBeTruthy();
    const heights = topHeights(result.group!);
    expect(Math.max(...heights)).toBeCloseTo(15, 2);
  });

  it("a blind hole in the middle is 5 mm deep, not 5.05", async () => {
    const result = await buildGroupedShapeFromSelection([box("solid", 20, 20, 20), box("hole", 6, 6, 6, 15, true)], 200000);
    const heights = topHeights(result.group!);
    // The floor of the hole: the only level between 0 and 20.
    const floor = heights.filter((y) => y > 0.01 && y < 19.99);
    expect(floor.length).toBe(1);
    expect(floor[0]).toBeCloseTo(15, 2);
  });

  it("a hole exactly as tall as the box still cuts right through (no skin)", async () => {
    const result = await buildGroupedShapeFromSelection([box("solid", 20, 20, 20), box("through", 6, 6, 20, 0, true)], 200000);
    const v = meshForShape(result.group!).vertices;
    // No surface left at the centre: no vertex inside the hole's footprint away from its walls.
    const inside = v.filter((p) => Math.abs(p[0]) < 2.9 && Math.abs(p[2]) < 2.9);
    expect(inside.length).toBe(0);
  });
});
