import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { getManifoldRuntime } from "@/lib/editorMeshCore";
import { curveLetterPoint, surfaceTextPositions, SURFACE_TEXT_OVERSHOOT, SURFACE_TEXT_SINK } from "@/lib/surfaceText";
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
    // Build 40: long text on a small ball no longer runs off it - past the part that faces the
    // spot it carries on round the ball, every point still hugging it.
    const long = soup(m.Manifold.cube([80, 1, 6], true).translate([0, 0.5, 0]));
    const round = await surfaceTextPositions(long, soup(ball), { origin: { x: 0, y: 0, z: 20 }, normal: { x: 0, y: 0, z: 1 } }, { depth: 1, mode: "raised", letterHeight: 6 });
    expect(round.offSurface).toBe(0);
    let minR = Infinity, maxR = -Infinity;
    for (let i = 0; i < round.positions.length; i += 3) {
      const r = Math.hypot(round.positions[i], round.positions[i + 1], round.positions[i + 2]);
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    }
    expect(minR).toBeGreaterThan(20 - SURFACE_TEXT_SINK - 0.3);
    expect(maxR).toBeLessThan(21 + 0.3);
    // Text running off an open edge still says so: a lone square sheet, text far wider than it.
    const sheet = [-5, 0, -5, 5, 0, 5, 5, 0, -5, -5, 0, -5, -5, 0, 5, 5, 0, 5];
    const off = await surfaceTextPositions(long, sheet, { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } }, { depth: 1, mode: "raised", letterHeight: 6 });
    expect(off.offSurface).toBeGreaterThan(0.2);
  });

  it("folds letters that run past an edge down onto the next face, never dropping onto a lower step (build 40)", async () => {
    const m = await getManifoldRuntime();
    // A 20 mm wide block on a wide base 10 mm lower; text 36 mm wide clicked on the block's top.
    const block = m.Manifold.union(m.Manifold.cube([20, 20, 20]).translate([-10, 0, -10]), m.Manifold.cube([80, 10, 40]).translate([-40, 0, -20]));
    const letters = soup(m.Manifold.cube([36, 1, 6], true).translate([0, 0.5, 0]));
    const result = await surfaceTextPositions(letters, soup(block), { origin: { x: 0, y: 20, z: 0 }, normal: { x: 0, y: 1, z: 0 } }, { depth: 1, mode: "raised", letterHeight: 6 });
    expect(result.offSurface).toBe(0);
    let minY = Infinity, folded = 0;
    for (let i = 0; i < result.positions.length; i += 3) {
      const [x, y] = [result.positions[i], result.positions[i + 1]];
      minY = Math.min(minY, y);
      // Every point past the top's edge lies on the block's side, from just inside it to the depth out.
      if (Math.abs(x) > 10 + 1.05) throw new Error(`a letter stands off the side at x ${x}`);
      if (y < 20 - SURFACE_TEXT_SINK - 0.05) {
        folded += 1;
        expect(Math.abs(x)).toBeGreaterThan(10 - SURFACE_TEXT_SINK - 0.05);
      }
    }
    expect(folded).toBeGreaterThan(0);
    // 8 mm of each end folds down the side: it stops above the base, 10 mm down.
    expect(minY).toBeGreaterThan(10);
    expect(minY).toBeLessThan(13);
    const text = await solid(result.positions);
    expect(text.decompose()).toHaveLength(1);
    expect(m.Manifold.union(block, text).decompose()).toHaveLength(1);
  });

  it("wraps a long line of text right round a cylinder, every point the right distance from its axis (build 35)", async () => {
    const m = await getManifoldRuntime();
    const can = m.Manifold.cylinder(40, 20, 20, 128).rotate([-90, 0, 0]); // upright along y, radius 20
    // 100 mm of "text" round a 126 mm circumference: most of the way round.
    const letters = soup(m.Manifold.cube([100, 1, 6], true).translate([0, 0.5, 0]));
    const result = await surfaceTextPositions(letters, soup(can), { origin: { x: 0, y: 20, z: 20 }, normal: { x: 0, y: 0, z: 1 } }, { depth: 1, mode: "raised", letterHeight: 6, shape: "wrap" });
    expect(result.offSurface).toBe(0);
    let minR = Infinity, maxR = -Infinity, back = 0;
    for (let i = 0; i < result.positions.length; i += 3) {
      const r = Math.hypot(result.positions[i], result.positions[i + 2]);
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      if (result.positions[i + 2] < -10) back += 1;
    }
    expect(minR).toBeGreaterThan(20 - SURFACE_TEXT_SINK - 0.1);
    expect(maxR).toBeLessThan(21 + 0.1);
    expect(back).toBeGreaterThan(0); // it reached round the back
    const text = await solid(result.positions);
    expect(text.status()).toBe("NoError");
    expect(m.Manifold.union(can, text).decompose()).toHaveLength(1);
  });

  it("bends the line into an arc, and lays it flat on request (build 35)", () => {
    // A rainbow: the ends lower than the middle, the length kept along the arc.
    const [u0, v0] = curveLetterPoint(0, 0, 50, 40);
    const [u1, v1] = curveLetterPoint(20, 0, 50, 40);
    expect(u0).toBeCloseTo(0);
    expect(v0).toBeCloseTo(0);
    expect(v1).toBeLessThan(-3);
    expect(u1).toBeLessThan(20);
    const [, smile] = curveLetterPoint(20, 0, -50, 40);
    expect(smile).toBeGreaterThan(3);
    expect(curveLetterPoint(7, 2, 0, 40)).toEqual([7, 2]);
  });

  it("stands flat text on the plane touching the part (build 35)", async () => {
    const m = await getManifoldRuntime();
    const ball = m.Manifold.sphere(30, 96);
    const letters = soup(m.Manifold.cube([20, 1, 6], true).translate([0, 0.5, 0]));
    const result = await surfaceTextPositions(letters, soup(ball), { origin: { x: 0, y: 0, z: 30 }, normal: { x: 0, y: 0, z: 1 } }, { depth: 1, mode: "raised", letterHeight: 6, shape: "flat" });
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 2; i < result.positions.length; i += 3) { minZ = Math.min(minZ, result.positions[i]); maxZ = Math.max(maxZ, result.positions[i]); }
    expect(minZ).toBeCloseTo(30 - SURFACE_TEXT_SINK, 3);
    expect(maxZ).toBeCloseTo(31, 3);
  });
});
