import { describe, expect, it } from "vitest";
import { SURFACE_TEXTURE_PATTERNS, textureMeshPositions } from "@/lib/surfaceTexture";

/* Fork (build 55): surface textures stay closed, keep the part standing flat and keep its sharp edges. */

/** A box 20 x 10 x 20 mm standing on y = 0, as world triangles (outward faces). */
function box(w = 20, h = 10, d = 20): number[] {
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const p = [[x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0], [x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1]];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]];
  const out: number[] = [];
  for (const [a, b, c, e] of quads) out.push(...p[a], ...p[b], ...p[c], ...p[a], ...p[c], ...p[e]);
  return out;
}

function openEdges(positions: ArrayLike<number>) {
  const key = (i: number) => `${positions[i * 3].toFixed(5)},${positions[i * 3 + 1].toFixed(5)},${positions[i * 3 + 2].toFixed(5)}`;
  const edges = new Map<string, number>();
  for (let t = 0; t < positions.length / 9; t += 1) {
    const k = [key(t * 3), key(t * 3 + 1), key(t * 3 + 2)];
    for (let e = 0; e < 3; e += 1) {
      const pair = [k[e], k[(e + 1) % 3]].sort().join("|");
      edges.set(pair, (edges.get(pair) ?? 0) + 1);
    }
  }
  return [...edges.values()].filter((count) => count !== 2).length;
}

function volume(p: ArrayLike<number>) {
  let sum = 0;
  for (let i = 0; i < p.length; i += 9) {
    sum += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6]);
  }
  return sum / 6;
}

function bounds(p: ArrayLike<number>) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k += 1) { min[k] = Math.min(min[k], p[i + k]); max[k] = Math.max(max[k], p[i + k]); }
  return { min, max };
}

describe("Surface textures (build 55)", () => {
  it.each(SURFACE_TEXTURE_PATTERNS.filter((pattern) => pattern !== "picture"))("%s stays closed, pressed in, and stands flat", (pattern) => {
    const source = box();
    const result = textureMeshPositions(source, { pattern, size: 3, depth: 0.6, direction: "in", top: false, maxTriangles: 200_000 });
    expect(result.triangles).toBeGreaterThan(1000);
    expect(openEdges(result.positions)).toBe(0);
    // Pressed in: smaller than the box, never bigger, and still standing on y = 0.
    expect(volume(result.positions)).toBeLessThan(volume(source));
    expect(volume(result.positions)).toBeGreaterThan(volume(source) * 0.85);
    const { min, max } = bounds(result.positions);
    expect(min[1]).toBeCloseTo(0, 5);
    expect(max[0]).toBeLessThanOrEqual(10 + 1e-6);
    expect(max[1]).toBeLessThanOrEqual(10 + 1e-6);
    // The bottom stays flat: every corner at the bottom is still at y = 0.
    let below = 0;
    for (let i = 1; i < result.positions.length; i += 3) if (result.positions[i] < -1e-6) below += 1;
    expect(below).toBe(0);
  });

  it("raised adds the depth outside, and the top is textured only when asked", () => {
    const out = textureMeshPositions(box(), { pattern: "ribs", size: 2, depth: 0.5, direction: "out", top: false, maxTriangles: 200_000 });
    expect(bounds(out.positions).max[0]).toBeGreaterThan(10.2);
    expect(bounds(out.positions).max[1]).toBeCloseTo(10, 5);
    const topToo = textureMeshPositions(box(), { pattern: "ribs", size: 2, depth: 0.5, direction: "out", top: true, maxTriangles: 200_000 });
    expect(bounds(topToo.positions).max[1]).toBeGreaterThan(10.2);
  });

  it("keeps to its triangle budget, saying when it had to go coarse", () => {
    const result = textureMeshPositions(box(200, 100, 200), { pattern: "knurl", size: 1, depth: 0.3, direction: "in", top: false, maxTriangles: 50_000 });
    expect(result.triangles).toBeLessThan(220_000);
    expect(result.coarse).toBe(true);
    expect(openEdges(result.positions)).toBe(0);
  });
});
