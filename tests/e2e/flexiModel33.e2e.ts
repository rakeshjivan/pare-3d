import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { getManifoldRuntime } from "@/lib/editorMeshCore";
import { flexiModelSegments } from "@/lib/flexiModel";
import { weldTriangles } from "@/lib/meshRepair";

const soup = (m: { getMesh(): { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array } }) => {
  const mesh = m.getMesh();
  return [...mesh.triVerts].flatMap((i) => [mesh.vertProperties[i * mesh.numProp], mesh.vertProperties[i * mesh.numProp + 1], mesh.vertProperties[i * mesh.numProp + 2]]);
};

describe("flexi any model (build 33)", () => {
  async function solids(segments: number[][]) {
    const m = await getManifoldRuntime();
    return segments.map((p) => {
      const w = weldTriangles(p);
      return new m.Manifold(new m.Mesh({ numProp: 3, vertProperties: new Float32Array(w.points.flat()), triVerts: new Uint32Array(w.triangles.flat()) }));
    });
  }

  it("cuts a bar into segments that are closed, apart by the clearance, and still a whole toy", async () => {
    const m = await getManifoldRuntime();
    const bar = m.Manifold.cube([120, 12, 22]).translate([-60, 0, -11]);
    const result = await flexiModelSegments(soup(bar), { segments: 6, clearance: 0.4 });
    expect(result.joints).toBe(5);
    expect(result.segments).toHaveLength(6);
    const parts = await solids(result.segments);
    parts.forEach((part) => {
      expect(part.status()).toBe("NoError");
      expect(part.volume()).toBeGreaterThan(1000);
    });
    for (let i = 0; i < parts.length; i += 1) {
      for (let j = i + 1; j < parts.length; j += 1) {
        const shared = m.Manifold.intersection(parts[i], parts[j]);
        expect(shared.isEmpty() || shared.volume() < 1e-3).toBe(true);
        if (j === i + 1) expect(parts[i].minGap(parts[j], 1)).toBeGreaterThan(0.3);
      }
    }
  });

  it("cuts along z for a model that is longer that way, and refuses one too thin", async () => {
    const m = await getManifoldRuntime();
    const long = m.Manifold.cube([20, 10, 100]).translate([-10, 0, -50]);
    const result = await flexiModelSegments(soup(long), { segments: 4 });
    expect(result.axis).toBe("z");
    expect(result.joints).toBe(3);
    const thin = m.Manifold.cube([100, 2, 20]);
    await expect(flexiModelSegments(soup(thin), { segments: 4 })).rejects.toThrow(/too thin/);
  });
});
