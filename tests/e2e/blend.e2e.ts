import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { blendShape, DEFAULT_BLEND, facingFaces, normalizeBlend } from "@/lib/blend";
import { buildGroupedShapeFromSelection } from "@/lib/editorBooleans";
import { meshForShape, getManifoldRuntime } from "@/lib/editorMeshCore";
import type { WorkplaneShape } from "@/types/layerling";

function cylinder(id: string, diameter: number, height: number, elevation: number, x = 0): WorkplaneShape {
  return { id, name: id, kind: "cylinder", color: "#d41721", x, z: 0, elevation, size: diameter, width: diameter, depth: diameter, height, rotation: 0, sides: 64 } as unknown as WorkplaneShape;
}
function box(id: string, size: number, height: number, elevation: number, x = 0): WorkplaneShape {
  return { id, name: id, kind: "box", color: "#d41721", x, z: 0, elevation, size, width: size, depth: size, height, rotation: 0 } as unknown as WorkplaneShape;
}
function bounds(shape: WorkplaneShape) {
  const v = meshForShape(shape).vertices;
  const min = (i: number) => Math.min(...v.map((p) => p[i]));
  const max = (i: number) => Math.max(...v.map((p) => p[i]));
  return { minY: min(1), maxY: max(1), minX: min(0), maxX: max(0) };
}
async function isClosedSolid(shape: WorkplaneShape) {
  const runtime = await getManifoldRuntime();
  const mesh = meshForShape(shape);
  const vertProperties = new Float32Array(mesh.vertices.flat());
  const triVerts = new Uint32Array(mesh.faces.flat());
  const manifoldMesh = new runtime.Mesh({ numProp: 3, vertProperties, triVerts });
  manifoldMesh.merge();
  const solid = new runtime.Manifold(manifoldMesh);
  const ok = solid.status() === "NoError" && solid.volume() > 0;
  solid.delete();
  return ok;
}

describe("Blend joins two bodies with a smooth piece (build 25)", () => {
  it("finds the facing ends of two stacked cylinders", () => {
    const pair = facingFaces(cylinder("big", 30, 10, 0), cylinder("small", 12, 10, 30));
    expect(pair).not.toBeNull();
    expect(pair!.a.normal.y).toBeCloseTo(1, 3);
    expect(pair!.b.normal.y).toBeCloseTo(-1, 3);
  });

  it("builds a closed piece from face to face, reaching a little into each", async () => {
    const a = cylinder("big", 30, 10, 0);
    const b = cylinder("small", 12, 10, 30);
    const pair = facingFaces(a, b)!;
    const piece = blendShape(pair.a, pair.b, DEFAULT_BLEND, { name: "Blend", color: "#888" })!;
    const box3 = bounds(piece);
    expect(box3.minY).toBeCloseTo(9.8, 2);
    expect(box3.maxY).toBeCloseTo(30.2, 2);
    expect(box3.maxX - box3.minX).toBeCloseTo(30, 0);
    expect(await isClosedSolid(piece)).toBe(true);
    const joined = await buildGroupedShapeFromSelection([a, b, piece], 400000);
    expect(joined.group).toBeTruthy();
    const all = bounds(joined.group!);
    expect(all.minY).toBeCloseTo(0, 2);
    expect(all.maxY).toBeCloseTo(40, 2);
  });

  it("joins a box to a cylinder that is off to one side, still closed", async () => {
    const a = box("block", 20, 10, 0);
    const b = cylinder("pin", 10, 10, 35, 15);
    const pair = facingFaces(a, b)!;
    for (const smoothness of [0, 50, 100]) {
      const piece = blendShape(pair.a, pair.b, normalizeBlend({ smoothness }), { name: "Blend", color: "#888" })!;
      expect(await isClosedSolid(piece)).toBe(true);
    }
  });

  it("finds nothing when no flat faces face each other", () => {
    expect(facingFaces(box("a", 10, 10, 0), box("b", 10, 10, 0, 0))).toBeNull();
  });
});

describe("Blend ignores the strips of a round side (build 25)", () => {
  it("joins the ends of two cylinders even when one is off to the side", () => {
    const a = { ...cylinder("left", 20, 10, 0), sides: 100 } as WorkplaneShape;
    const b = { ...cylinder("right", 12, 10, 35, 40), sides: 100 } as WorkplaneShape;
    const pair = facingFaces(a, b)!;
    expect(pair.a.normal.y).toBeCloseTo(1, 3);
    expect(pair.b.normal.y).toBeCloseTo(-1, 3);
  });
});
