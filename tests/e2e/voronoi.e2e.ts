import { beforeAll, describe, expect, it } from "vitest";
import manifoldModule from "manifold-3d";
import type { ManifoldToplevel } from "manifold-3d";
import { voronoiCells, voronoiPositions, voronoiSeeds, normalizeVoronoi } from "@/lib/voronoi";

/** Fork: Voronoi panels and patterns. */
let runtime: ManifoldToplevel;
beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
});

const volumeOf = (positions: number[]) => {
  let v = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(i, i + 9);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
};
const bounds = (positions: number[]) => {
  const axis = (k: number) => { let lo = Infinity, hi = -Infinity; for (let i = k; i < positions.length; i += 3) { lo = Math.min(lo, positions[i]); hi = Math.max(hi, positions[i]); } return [lo, hi]; };
  return { x: axis(0), y: axis(1), z: axis(2) };
};

describe("voronoi", () => {
  it("cells cover the whole area exactly once", () => {
    const seeds = voronoiSeeds(normalizeVoronoi({ width: 80, depth: 60, cells: 30 }));
    const cells = voronoiCells(seeds, 80, 60);
    const area = cells.reduce((sum, cell) => {
      let a = 0;
      cell.forEach((p, i) => { const q = cell[(i + 1) % cell.length]; a += p[0] * q[1] - q[0] * p[1]; });
      return sum + Math.abs(a) / 2;
    }, 0);
    expect(area).toBeCloseTo(80 * 60, 3);
  });

  it("the same seed gives the same pattern, another seed a different one", () => {
    const a = voronoiSeeds(normalizeVoronoi({ seed: 7 }));
    expect(voronoiSeeds(normalizeVoronoi({ seed: 7 }))).toEqual(a);
    expect(voronoiSeeds(normalizeVoronoi({ seed: 8 }))).not.toEqual(a);
  });

  it("a panel: a closed plate standing on the bed with a solid border and openings", () => {
    const { positions, openings } = voronoiPositions(runtime, { width: 80, depth: 60, thickness: 2, cells: 30, strut: 1.6, border: 4 });
    expect(openings).toBeGreaterThan(20);
    const v = volumeOf(positions);
    // A web plus border: well under the full plate, and more than the border alone.
    expect(v).toBeLessThan(80 * 60 * 2 * 0.7);
    expect(v).toBeGreaterThan((80 * 60 - 72 * 52) * 2);
    const b = bounds(positions);
    expect(b.y[0]).toBeCloseTo(0, 6);
    expect(b.y[1]).toBeCloseTo(2, 6);
    expect(b.x[1] - b.x[0]).toBeCloseTo(80, 3);
    expect(b.z[1] - b.z[0]).toBeCloseTo(60, 3);
    // Positive volume: the triangles face outwards.
    expect(v).toBeGreaterThan(0);
  });

  it("the pattern alone is the openings, a little taller than the panel", () => {
    const panel = voronoiPositions(runtime, { width: 80, depth: 60, thickness: 2, cells: 30 });
    const pattern = voronoiPositions(runtime, { width: 80, depth: 60, thickness: 2, cells: 30, mode: "pattern" });
    // Openings plus web make the full plate, per mm of height.
    expect(volumeOf(pattern.positions) / 3 + volumeOf(panel.positions) / 2).toBeCloseTo(80 * 60, 0);
  });

  it("wider struts leave less open", () => {
    const thin = volumeOf(voronoiPositions(runtime, { strut: 1 }).positions);
    const thick = volumeOf(voronoiPositions(runtime, { strut: 3 }).positions);
    expect(thick).toBeGreaterThan(thin);
  });
});
