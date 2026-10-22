import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { flexiChainParts, normalizeFlexiChain } from "@/lib/flexiJoint";
import { getManifoldRuntime, meshForShape } from "@/lib/editorMeshCore";
import type { WorkplaneShape } from "@/types/layerling";

async function solidOf(shape: WorkplaneShape) {
  const runtime = await getManifoldRuntime();
  const mesh = meshForShape(shape);
  const m = new runtime.Mesh({ numProp: 3, vertProperties: new Float32Array(mesh.vertices.flat()), triVerts: new Uint32Array(mesh.faces.flat()) });
  m.merge();
  return new runtime.Manifold(m);
}

/** The segment as it prints: its solids merged, its holes taken out. */
async function segmentSolid(shapes: WorkplaneShape[]) {
  const runtime = await getManifoldRuntime();
  let solid = null as null | InstanceType<typeof runtime.Manifold>;
  for (const shape of shapes.filter((entry) => !entry.hole)) {
    const piece = await solidOf(shape);
    solid = solid ? solid.add(piece) : piece;
  }
  for (const shape of shapes.filter((entry) => entry.hole)) solid = solid!.subtract(await solidOf(shape));
  return solid!;
}

describe("Flexi chain - print-in-place joints (build 30)", () => {
  it("keeps every segment apart from its neighbours, one solid each, flat on the plate", async () => {
    const parts = flexiChainParts({ segments: 4 }, "Flexi");
    expect(parts).toHaveLength(4);
    const solids = [];
    for (const part of parts) {
      const solid = await segmentSolid(part.shapes);
      expect(solid.status()).toBe("NoError");
      // One piece: a pin that came loose from its prongs would be a second piece.
      expect(solid.decompose().length).toBe(1);
      expect(solid.boundingBox().min[1]).toBeCloseTo(0, 3);
      solids.push(solid);
    }
    for (let i = 0; i < solids.length - 1; i += 1) {
      const overlap = solids[i].intersect(solids[i + 1]);
      expect(overlap.volume()).toBeLessThan(1e-6);
    }
  });

  it("leaves the clearance between the tongue and the prongs over and under it", async () => {
    const o = normalizeFlexiChain({ segments: 2, clearance: 0.4 });
    const [a, b] = flexiChainParts(o, "Flexi");
    const sa = await segmentSolid(a.shapes);
    const sb = await segmentSolid(b.shapes);
    const runtime = await getManifoldRuntime();
    // Move B a little less than the clearance up, down and sideways: it must still clear A.
    for (const [dx, dy, dz] of [[0, 0.3, 0], [0, -0.3, 0], [0.3, 0, 0], [-0.3, 0, 0], [0, 0, 0.3]]) {
      const moved = sb.translate([dx, dy, dz]);
      expect(sa.intersect(moved).volume()).toBeLessThan(1e-6);
    }
    void runtime;
  });
});
