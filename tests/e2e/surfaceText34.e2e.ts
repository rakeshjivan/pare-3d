import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { getManifoldRuntime } from "@/lib/editorMeshCore";
import { surfaceTextPositions, SURFACE_TEXT_OVERSHOOT, SURFACE_TEXT_SINK } from "@/lib/surfaceText";
import { weldTriangles } from "@/lib/meshRepair";

const soup = (m: { getMesh(): { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array } }) => {
  const mesh = m.getMesh();
  return [...mesh.triVerts].flatMap((i) => [mesh.vertProperties[i * mesh.numProp], mesh.vertProperties[i * mesh.numProp + 1], mesh.vertProperties[i * mesh.numProp + 2]]);
};

describe("text on any surface (build 34)", () => {
  async function solid(p: number[]) {
    const m = await getManifoldRuntime();
    const w = weldTriangles(p);
    return new m.Manifold(new m.Mesh({ numProp: 3, vertProperties: new Float32Array(w.points.flat()), triVerts: new Uint32Array(w.triangles.flat()) }));
  }

  it("lays raised letters on a sphere so they hug it, and they join it as one closed body", async () => {
    const m = await getManifoldRuntime();
    const ball = m.Manifold.sphere(30, 128);
    // "Letters": a 30 x 8 plate, 1.5 thick, lying flat as the editor builds text.
    const letters = soup(m.Manifold.cube([30, 1.5, 8], true).translate([0, 0.75, 0]));
    const result = await surfaceTextPositions(letters, soup(ball), { origin: { x: 0, y: 0, z: 30 }, normal: { x: 0, y: 0, z: 1 } }, { depth: 1.5, mode: "raised", letterHeight: 8 });
    expect(result.offSurface).toBe(0);
    const text = await solid(result.positions);
    expect(text.status()).toBe("NoError");
    // Every point lies between just inside the sphere and the depth outside it (measured from the centre).
    let minR = Infinity, maxR = -Infinity;
    for (let i = 0; i < result.positions.length; i += 3) {
      const r = Math.hypot(result.positions[i], result.positions[i + 1], result.positions[i + 2]);
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    }
    expect(minR).toBeGreaterThan(30 - SURFACE_TEXT_SINK - 0.15);
    expect(maxR).toBeLessThan(30 + 1.5 + 0.15);
    const joined = m.Manifold.union(ball, text);
    expect(joined.status()).toBe("NoError");
    expect(joined.volume()).toBeGreaterThan(ball.volume());
  });

  it("cuts letters into a curved surface, and says when they run off the part", async () => {
    const m = await getManifoldRuntime();
    const ball = m.Manifold.sphere(20, 96);
    const letters = soup(m.Manifold.cube([16, 1 + SURFACE_TEXT_OVERSHOOT, 6], true).translate([0, (1 + SURFACE_TEXT_OVERSHOOT) / 2, 0]));
    const cut = await surfaceTextPositions(letters, soup(ball), { origin: { x: 0, y: 20, z: 0 }, normal: { x: 0, y: 1, z: 0 } }, { depth: 1, mode: "engraved", letterHeight: 6 });
    const hole = await solid(cut.positions);
    const engraved = m.Manifold.difference(ball, hole);
    expect(engraved.status()).toBe("NoError");
    expect(engraved.volume()).toBeLessThan(ball.volume() - 30);
    // Long text on a small ball runs off it.
    const long = soup(m.Manifold.cube([80, 1, 6], true).translate([0, 0.5, 0]));
    const off = await surfaceTextPositions(long, soup(ball), { origin: { x: 0, y: 0, z: 20 }, normal: { x: 0, y: 0, z: 1 } }, { depth: 1, mode: "raised", letterHeight: 6 });
    expect(off.offSurface).toBeGreaterThan(0.2);
  });
});
