import { describe, expect, it } from "vitest";
import { regionSmooth } from "@/lib/regionSmooth";

/** Build 105: the shape-preserving region smooth (geometry3Sharp's RegionSmooth, ported). */
function grid(n: number, height: (x: number, y: number) => number) {
  const points = new Float64Array((n + 1) * (n + 1) * 3);
  for (let i = 0; i <= n; i += 1) for (let j = 0; j <= n; j += 1) {
    const x = -10 + (20 * i) / n, y = -10 + (20 * j) / n, k = (i * (n + 1) + j) * 3;
    points[k] = x; points[k + 1] = y; points[k + 2] = height(x, y);
  }
  const tris: number[] = [];
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const a = i * (n + 1) + j, b = a + n + 1, c = b + 1, d = a + 1;
    tris.push(a, b, c, a, c, d);
  }
  return { points, triangles: Uint32Array.from(tris) };
}
const chooseDisc = (points: Float64Array, triangles: Uint32Array, r: number) => {
  const chosen = new Uint8Array(triangles.length / 3);
  for (let t = 0; t < chosen.length; t += 1) {
    let x = 0, y = 0;
    for (let k = 0; k < 3; k += 1) { x += points[triangles[t * 3 + k] * 3]; y += points[triangles[t * 3 + k] * 3 + 1]; }
    chosen[t] = Math.hypot(x / 3, y / 3) < r ? 1 : 0;
  }
  return chosen;
};

describe("Build 105: region smooth with constraint rings", () => {
  // Bumps well inside the patch (its edge rings are held as they are, as in geometry3Sharp: noise reaching
  // them is kept there - that is what "keeps the edge's form" means).
  it("takes the bumps out of a patch and leaves everything outside it exactly as it was", () => {
    const noise = (x: number, y: number) => 0.3 * Math.sin(3 * x) * Math.cos(3 * y);
    const { points, triangles } = grid(60, (x, y) => (Math.hypot(x, y) < 3.5 ? noise(x, y) : 0));
    const before = Float64Array.from(points);
    const chosen = chooseDisc(points, triangles, 5.5);
    const moved = regionSmooth(points, triangles, chosen, { rings: 2 });
    expect(moved).toBeGreaterThan(100);
    let inside = 0, outsideChange = 0;
    for (let v = 0; v < points.length / 3; v += 1) {
      const r = Math.hypot(points[v * 3], points[v * 3 + 1]);
      const dz = Math.abs(points[v * 3 + 2] - before[v * 3 + 2]) + Math.abs(points[v * 3] - before[v * 3]);
      if (r > 6) outsideChange = Math.max(outsideChange, dz);
      if (r < 4) inside = Math.max(inside, Math.abs(points[v * 3 + 2]));
    }
    expect(outsideChange).toBe(0);
    // 0.3 mm bumps down to under 0.03 mm.
    expect(inside).toBeLessThan(0.03);
  });

  it("keeps a smooth dome a dome (it does not flatten what is already smooth)", () => {
    const dome = (x: number, y: number) => 2 * Math.max(0, 1 - (x * x + y * y) / 64);
    const { points, triangles } = grid(60, dome);
    const chosen = chooseDisc(points, triangles, 5);
    regionSmooth(points, triangles, chosen, { rings: 2 });
    let worst = 0;
    for (let v = 0; v < points.length / 3; v += 1) worst = Math.max(worst, Math.abs(points[v * 3 + 2] - dome(points[v * 3], points[v * 3 + 1])));
    expect(worst).toBeLessThan(0.15);
  });
});
