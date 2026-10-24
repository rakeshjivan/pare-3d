import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { CLICKER_BASE_HEIGHT, CLICKER_DEFAULT_GAP, CLICKER_SOCKET_DEPTH, clickerBasePart, clickerTopPart } from "@/lib/clickerParts";
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

describe("Clicker pieces (build 54, reworked in build 56)", () => {
  const base = clickerBasePart("Clicker base").shapes[0];
  const [top, stemHole] = clickerTopPart("Clicker top", "Stem hole").shapes;

  it("are closed, of the switch's size, and keep it", () => {
    for (const piece of [base, top, stemHole]) {
      expect(piece.fixedSize).toBe(true);
      expect(openEdges(piece.importedMesh!.positions)).toBe(0);
      const resized = canonicalizeShape({ ...piece, width: 40, depth: 9, height: 20, size: 40 });
      expect([resized.width, resized.depth, resized.height]).toEqual([piece.width, piece.depth, piece.height]);
    }
    expect(base.hole).toBe(true);
    expect(top.hole).toBe(false);
    expect(stemHole.hole).toBe(true);
    expect([base.width, base.depth, base.height]).toEqual([15.8, 15.9, CLICKER_BASE_HEIGHT]);
    expect([top.width, top.depth, top.height]).toEqual([5.6, 5.6, CLICKER_DEFAULT_GAP]);
    expect(clickerTopPart("t", "h", 4.5).shapes[0].height).toBe(4.5);
  });

  it("sinks the whole switch into a base, its top level with the face", async () => {
    const half = block(20);
    const cutter = canonicalizeShape({ ...base, elevation: 20 - CLICKER_BASE_HEIGHT });
    const result = await buildGroupedShapeFromSelection([half, cutter], 400000);
    expect(volume(half) - volume(result.group!)).toBeCloseTo(3418.3, 0);
    // The top housing's room: 15.8 mm square, 6.6 mm deep under the face.
    const { vertices } = meshForShape(result.group!);
    expect(vertices.some(([x, y]) => Math.abs(Math.abs(x) - 7.9) < 0.01 && Math.abs(y - (20 - 6.6)) < 0.01)).toBe(true);
  });

  it("adds the stem post to a top, as long as the gap, with the cross hole reaching into the top", async () => {
    const half = block(10);
    const post = canonicalizeShape({ ...top, elevation: 10 });
    const hole = canonicalizeShape({ ...stemHole, elevation: 10 + (stemHole.elevation ?? 0) });
    const result = await buildGroupedShapeFromSelection([half, post, hole], 400000);
    const { vertices } = meshForShape(result.group!);
    expect(Math.max(...vertices.map((v) => v[1]))).toBeCloseTo(10 + CLICKER_DEFAULT_GAP, 3);
    // The cross hole's floor: 3.8 mm in from the post's end, so 1.3 mm into the top itself.
    const floor = 10 + CLICKER_DEFAULT_GAP - CLICKER_SOCKET_DEPTH;
    expect(vertices.some(([x, y, z]) => Math.abs(Math.abs(x) - 2.17) < 0.01 && Math.abs(z) < 0.8 && Math.abs(y - floor) < 0.01)).toBe(true);
    // Added: the post less the hole; taken: the hole's part in the top.
    const cross = 2 * 4.34 * 1.45 - 1.45 * 1.45;
    const disc = 0.5 * 96 * 2.8 * 2.8 * Math.sin((2 * Math.PI) / 96);
    expect(volume(result.group!) - volume(half)).toBeCloseTo(disc * CLICKER_DEFAULT_GAP - cross * CLICKER_SOCKET_DEPTH, 0);
  });
});
