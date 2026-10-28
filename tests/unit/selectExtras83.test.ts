import { describe, expect, it } from "vitest";
import { sculptMeshOf } from "@/lib/meshSculpt";
import { edgeNeighbours, expandConnected, invertConnected, optimizeBoundary } from "@/lib/meshEditTools";

/** Two separate flat sheets (n x n squares of 1 mm), the second 10 mm to the side. */
function twoSheets(n: number) {
  const soup: number[] = [];
  for (const off of [0, 10 + n]) for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const x = i + off;
    soup.push(x, 0, j, x, 0, j + 1, x + 1, 0, j + 1, x, 0, j, x + 1, 0, j + 1, x + 1, 0, j);
  }
  return sculptMeshOf(soup);
}
const count = (c: Uint8Array) => c.reduce((s, v) => s + v, 0);
/** Triangles whose centre passes a test. */
function choose(mesh: ReturnType<typeof sculptMeshOf>, test: (x: number, z: number) => boolean) {
  const out = new Uint8Array(mesh.triangles.length / 3);
  for (let t = 0; t < out.length; t += 1) {
    let x = 0, z = 0;
    for (let k = 0; k < 3; k += 1) { const v = mesh.triangles[t * 3 + k]; x += mesh.points[v * 3] / 3; z += mesh.points[v * 3 + 2] / 3; }
    out[t] = test(x, z) ? 1 : 0;
  }
  return out;
}

describe("Meshmixer's Select extras (build 83)", () => {
  it("edge neighbours: inner triangles have three, corner ones fewer, and they are mutual", () => {
    const mesh = twoSheets(4);
    const nb = edgeNeighbours(mesh);
    for (let t = 0; t < nb.length / 3; t += 1) for (let k = 0; k < 3; k += 1) {
      const u = nb[t * 3 + k];
      if (u >= 0) expect([nb[u * 3], nb[u * 3 + 1], nb[u * 3 + 2]]).toContain(t);
    }
    expect(Array.from(nb).filter((u) => u < 0).length).toBe(2 * 4 * 4); // each sheet's rim: 16 open edges
  });

  it("Connected takes the whole of the touched sheet and none of the other", () => {
    const mesh = twoSheets(6);
    const one = choose(mesh, (x, z) => x < 1 && z < 1);
    const out = expandConnected(mesh, one);
    expect(count(out)).toBe(72);
    expect(count(choose(mesh, (x) => x > 10).map((v, t) => v & out[t]))).toBe(0);
  });

  it("Invert connected flips within the touched sheet only", () => {
    const mesh = twoSheets(6);
    const half = choose(mesh, (x) => x < 3);
    const out = invertConnected(mesh, half);
    expect(count(out)).toBe(36);
    for (let t = 0; t < out.length; t += 1) if (out[t]) expect(half[t]).toBe(0);
    expect(count(choose(mesh, (x) => x > 10).map((v, t) => v & out[t]))).toBe(0);
  });

  it("Tidy edge lets go of a lone fin and fills a notch; a block only loses its corner tips; a second pass changes nothing", () => {
    const mesh = twoSheets(10);
    const block = choose(mesh, (x, z) => x > 2 && x < 7 && z > 2 && z < 7);
    const tidy = optimizeBoundary(mesh, block);
    expect(count(block) - count(tidy)).toBeLessThanOrEqual(4);
    for (let t = 0; t < tidy.length; t += 1) if (tidy[t]) expect(block[t]).toBe(1);
    expect(Array.from(optimizeBoundary(mesh, tidy))).toEqual(Array.from(tidy));
    // A notch: one triangle missing from inside the block's edge row - two chosen neighbours, filled.
    const notched = block.slice();
    const inner = choose(mesh, (x, z) => x > 4 && x < 5 && z > 2 && z < 2.5);
    for (let t = 0; t < inner.length; t += 1) if (inner[t]) notched[t] = 0;
    const filled = optimizeBoundary(mesh, notched);
    for (let t = 0; t < inner.length; t += 1) if (inner[t]) expect(filled[t]).toBe(1);
    // A fin: a lone triangle well away from the block.
    const fin = block.slice();
    const lone = choose(mesh, (x, z) => x > 8.5 && x < 9 && z > 8 && z < 8.5);
    expect(count(lone)).toBe(1);
    for (let t = 0; t < lone.length; t += 1) if (lone[t]) fin[t] = 1;
    const finned = optimizeBoundary(mesh, fin);
    for (let t = 0; t < lone.length; t += 1) if (lone[t]) expect(finned[t]).toBe(0);
  });
});
