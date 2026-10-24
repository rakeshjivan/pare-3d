import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { CLICKER_DEFAULT_GAP, CLICKER_GAPS, CLICKER_TOP_HEIGHT, clickerBaseDepth, clickerBasePart, clickerTopPart } from "@/lib/clickerParts";
import { buildGroupedShapeFromSelection } from "@/lib/editorBooleans";
import { meshForShape } from "@/lib/editorMeshCore";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";

const block = (height: number) => ({ id: "b", name: "Half", kind: "box", color: "#d41721", x: 0, z: 0, elevation: 0, size: 30, width: 30, depth: 30, height, rotation: 0 }) as unknown as WorkplaneShape;

function volume(shape: WorkplaneShape) {
  const { vertices, faces } = meshForShape(shape);
  let sum = 0;
  for (const [a, b, c] of faces) {
    const [p, q, r] = [vertices[a], vertices[b], vertices[c]];
    sum += p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0]);
  }
  return Math.abs(sum / 6);
}

/** Every edge of a closed solid is used by exactly two triangles. */
function openEdges(positions: number[]) {
  const key = (i: number) => positions.slice(i * 3, i * 3 + 3).map((v) => v.toFixed(4)).join(",");
  const edges = new Map<string, number>();
  for (let t = 0; t < positions.length / 9; t += 1) {
    const corners = [key(t * 3), key(t * 3 + 1), key(t * 3 + 2)];
    for (let e = 0; e < 3; e += 1) {
      const pair = [corners[e], corners[(e + 1) % 3]].sort().join("|");
      edges.set(pair, (edges.get(pair) ?? 0) + 1);
    }
  }
  return [...edges.values()].filter((count) => count !== 2).length;
}

describe("Clicker cutters (build 54, reworked in build 57)", () => {
  const base = clickerBasePart("Clicker base").shapes[0];
  const top = clickerTopPart("Clicker top").shapes[0];

  it("are closed holes of the switch's size that keep it", () => {
    for (const cutter of [top, ...CLICKER_GAPS.map((gap) => clickerBasePart("b", gap).shapes[0])]) {
      expect(cutter.hole).toBe(true);
      expect(cutter.fixedSize).toBe(true);
      expect(openEdges(cutter.importedMesh!.positions)).toBe(0);
      const resized = canonicalizeShape({ ...cutter, width: 40, depth: 9, height: 20, size: 40 });
      expect([resized.width, resized.depth, resized.height]).toEqual([cutter.width, cutter.depth, cutter.height]);
    }
    expect([base.width, base.depth, base.height]).toEqual([15.8, 15.9, clickerBaseDepth(CLICKER_DEFAULT_GAP)]);
    expect(clickerBaseDepth(2.5)).toBe(12.8);
    expect(clickerBasePart("b", 4.5).shapes[0].height).toBe(10.8);
    expect([top.width, top.depth, top.height]).toEqual([13.9, 15.5, CLICKER_TOP_HEIGHT]);
  });

  it("sinks the switch into a base so only the gap stands out", async () => {
    const half = block(20);
    const cutter = canonicalizeShape({ ...base, elevation: 20 - base.height });
    const result = await buildGroupedShapeFromSelection([half, cutter], 400000);
    expect(volume(half) - volume(result.group!)).toBeCloseTo(2794.2, 0);
    // The top housing's room: 15.8 mm square, from the face down to the plate's level (6.6 mm less the gap).
    const { vertices } = meshForShape(result.group!);
    expect(vertices.some(([x, y]) => Math.abs(Math.abs(x) - 7.9) < 0.01 && Math.abs(y - (20 - (6.6 - CLICKER_DEFAULT_GAP))) < 0.01)).toBe(true);
  });

  it("cuts the kit's recess into a top and leaves the dowel with its cross hole standing", async () => {
    const half = block(10);
    const cutter = canonicalizeShape({ ...top, elevation: 10 - CLICKER_TOP_HEIGHT });
    const result = await buildGroupedShapeFromSelection([half, cutter], 400000);
    expect(volume(half) - volume(result.group!)).toBeCloseTo(468.0, 0);
    const { vertices } = meshForShape(result.group!);
    // The dowel, 5.77 mm across, its end level with the face.
    expect(vertices.filter(([x, y, z]) => Math.abs(Math.hypot(x, z) - 5.77 / 2) < 0.05 && y > 6.9 && y < 10.01).length).toBeGreaterThan(20);
  });
});
