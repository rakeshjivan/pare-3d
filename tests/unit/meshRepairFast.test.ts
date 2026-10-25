import { describe, expect, it } from "vitest";
import { meshHealth, weldTriangles } from "@/lib/meshRepair";
import { flattenThreeMfMeshes, unflattenThreeMfMeshes } from "@/lib/threemfFlat";

/**
 * Build 68: the import check welds corners and counts edges in typed hash tables instead of Maps of
 * strings. These compare it with the string version it replaced, on a soup with doubled corners,
 * collapsed triangles, openings and a broken edge.
 */
function referenceHealth(positions: number[]) {
  const index = new Map<string, number>();
  const triangles: number[][] = [];
  const corner = (o: number) => {
    const key = `${Math.round(positions[o] * 1e4)},${Math.round(positions[o + 1] * 1e4)},${Math.round(positions[o + 2] * 1e4)}`;
    let id = index.get(key);
    if (id === undefined) { id = index.size; index.set(key, id); }
    return id;
  };
  for (let o = 0; o + 8 < positions.length; o += 9) {
    const a = corner(o), b = corner(o + 3), c = corner(o + 6);
    if (a === b || b === c || a === c) continue;
    triangles.push([a, b, c]);
  }
  const uses = new Map<string, number>();
  for (const [a, b, c] of triangles) for (const [p, q] of [[a, b], [b, c], [c, a]]) {
    const key = p < q ? `${p}_${q}` : `${q}_${p}`;
    uses.set(key, (uses.get(key) ?? 0) + 1);
  }
  let open = 0, broken = 0;
  for (const count of uses.values()) { if (count === 1) open += 1; else if (count > 2) broken += 1; }
  return { triangles, points: index.size, open, broken, degenerate: positions.length / 9 - triangles.length };
}

function soup(seed: number) {
  let state = seed;
  const random = () => ((state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const grid: number[][] = [];
  for (let i = 0; i < 40; i += 1) grid.push([Math.round(random() * 20) / 4, Math.round(random() * 20) / 4, Math.round(random() * 20) / 4]);
  const positions: number[] = [];
  for (let t = 0; t < 600; t += 1) {
    const a = grid[Math.floor(random() * grid.length)], b = grid[Math.floor(random() * grid.length)];
    const c = random() < 0.05 ? a : grid[Math.floor(random() * grid.length)];
    // A hair of float noise below the weld grid, so corners still join.
    positions.push(...a.map((v) => v + 1e-7), ...b, ...c);
  }
  return positions;
}

describe("fast mesh check (build 68)", () => {
  it("welds and counts exactly as the string version did", () => {
    for (const seed of [1, 7, 42, 1234]) {
      const positions = soup(seed);
      const reference = referenceHealth(positions);
      const welded = weldTriangles(positions);
      expect(welded.triangles).toEqual(reference.triangles);
      expect(welded.points.length).toBe(reference.points);
      const health = meshHealth(positions);
      expect(health.openEdges).toBe(reference.open);
      expect(health.brokenEdges).toBe(reference.broken);
      expect(health.degenerate).toBe(reference.degenerate);
      expect(health.watertight).toBe(reference.open === 0 && reference.broken === 0);
    }
  });

  it("finds a closed tetrahedron watertight and one missing face open", () => {
    const p = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const faces = [[0, 2, 1], [0, 1, 3], [1, 2, 3], [0, 3, 2]];
    const positions = faces.flatMap((face) => face.flatMap((i) => p[i]));
    expect(meshHealth(positions)).toMatchObject({ watertight: true, openEdges: 0, openings: 0 });
    expect(meshHealth(positions.slice(9))).toMatchObject({ watertight: false, openEdges: 3, openings: 1 });
  });
});

describe("3MF bodies made flat for the worker (build 68)", () => {
  it("come back as they went", () => {
    const meshes = [{ name: "a", color: "#ff0000", vertices: [[0, 1, 2], [3, 4, 5], [6, 7, 8]] as [number, number, number][], faces: [[0, 1, 2]] as [number, number, number][] }];
    expect(unflattenThreeMfMeshes(flattenThreeMfMeshes(meshes))).toEqual(meshes);
  });
});
