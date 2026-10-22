import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { getManifoldRuntime } from "@/lib/editorMeshCore";
import { checkFit, hullPositions } from "@/lib/partTools";
import { roundMeshPositions } from "@/lib/meshRound";
import type { WorkplaneShape } from "@/types/layerling";

const box = (id: string, x: number, size = 10, extra: Partial<WorkplaneShape> = {}) => ({ id, name: id, kind: "box", color: "#d41721", x, z: 0, elevation: 0, size, width: size, depth: size, height: size, rotation: 0, ...extra }) as unknown as WorkplaneShape;
const cylinder = (id: string, x: number, d: number, h: number) => ({ id, name: id, kind: "cylinder", color: "#d41721", x, z: 0, elevation: 0, size: d, width: d, depth: d, height: h, rotation: 0, sides: 64 }) as unknown as WorkplaneShape;
const volume = (p: number[]) => {
  let v = 0;
  for (let i = 0; i < p.length; i += 9) v += (p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6])) / 6;
  return v;
};
const soup = (m: { getMesh(): { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array } }) => {
  const mesh = m.getMesh();
  return [...mesh.triVerts].flatMap((i) => [mesh.vertProperties[i * mesh.numProp], mesh.vertProperties[i * mesh.numProp + 1], mesh.vertProperties[i * mesh.numProp + 2]]);
};

describe("hull, fit check and mesh rounding (build 33)", () => {
  it("wraps two cylinders into a rounded slot", async () => {
    const positions = await hullPositions([cylinder("a", 0, 10, 5), cylinder("b", 30, 10, 5)]);
    expect(positions).not.toBeNull();
    // Two half discs and the 30 x 10 between them, 5 high: (π·25 + 300)·5 ≈ 1893.
    expect(volume(positions!)).toBeGreaterThan(1850);
    expect(volume(positions!)).toBeLessThan(1900);
  });

  it("finds an overlap with its volume, and a gap under the clearance", async () => {
    const overlap = await checkFit([box("a", 0), box("b", 8)], 0.4);
    expect(overlap.findings).toHaveLength(1);
    expect(overlap.findings[0]).toMatchObject({ kind: "overlap" });
    expect(overlap.findings[0].overlap).toBeCloseTo(200, 0);
    expect(volume(overlap.findings[0].positions!)).toBeCloseTo(200, 0);

    const tight = await checkFit([box("a", 0), box("b", 10.2)], 0.4);
    expect(tight.findings).toHaveLength(1);
    expect(tight.findings[0].kind).toBe("tight");
    expect(tight.findings[0].gap).toBeCloseTo(0.2, 2);

    const fine = await checkFit([box("a", 0), box("b", 10.6)], 0.4);
    expect(fine.findings).toHaveLength(0);
    // Far apart: not even tested.
    const far = await checkFit([box("a", 0), box("b", 100)], 0.4);
    expect(far.pairs).toBe(0);
  });

  it("does not call faces laid against each other an overlap", async () => {
    const touching = await checkFit([box("a", 0), box("b", 10)], 0);
    expect(touching.findings).toHaveLength(0);
  });

  it("rounds a box's edges to about the radius asked for, and an inside edge too", async () => {
    const m = await getManifoldRuntime();
    const cube = m.Manifold.cube([20, 20, 20], true);
    const rounded = await roundMeshPositions(soup(cube), 3, "outside");
    // A 20 mm cube with 3 mm round edges and corners: 7573 mm³.
    expect(volume(rounded.positions)).toBeGreaterThan(7530);
    expect(volume(rounded.positions)).toBeLessThan(7620);
    const L = m.Manifold.union(m.Manifold.cube([30, 10, 10]), m.Manifold.cube([10, 30, 10]));
    const filled = await roundMeshPositions(soup(L), 2, "inside");
    // The inside corner gains a 2 mm fillet along 10 mm: 2²(1 - π/4)·10 ≈ 8.6 mm³.
    expect(volume(filled.positions) - 5000).toBeGreaterThan(5);
    expect(volume(filled.positions) - 5000).toBeLessThan(12);
  });

  it("leaves a smooth part alone and refuses a radius too small for the part", async () => {
    const m = await getManifoldRuntime();
    const ball = m.Manifold.sphere(20, 128);
    const p = soup(ball);
    expect(volume((await roundMeshPositions(p, 2)).positions)).toBeCloseTo(volume(p), -1);
    await expect(roundMeshPositions(soup(m.Manifold.cube([300, 300, 300])), 0.3)).rejects.toThrow(/too small/);
  });
});
