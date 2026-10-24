import { describe, expect, it } from "vitest";
import { tidyForFile } from "@/lib/dentalMesh";

/** Edge uses after joining corners at exactly the same point, as a slicer does. */
function edgeUses(p: Float32Array) {
  const id = new Map<string, number>();
  const ids: number[] = [];
  for (let i = 0; i < p.length; i += 3) {
    const key = `${p[i]},${p[i + 1]},${p[i + 2]}`;
    if (!id.has(key)) id.set(key, id.size);
    ids.push(id.get(key)!);
  }
  const uses = new Map<string, number>();
  for (let t = 0; t < ids.length; t += 3) for (let k = 0; k < 3; k += 1) {
    const a = ids[t + k], b = ids[t + ((k + 1) % 3)];
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    uses.set(key, (uses.get(key) ?? 0) + 1);
  }
  const count = new Map<number, number>();
  uses.forEach((n) => count.set(n, (count.get(n) ?? 0) + 1));
  return count;
}

function cube(x: number, y: number, z: number, s = 1) {
  const c = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]].map(([a, b, d]) => [x + a * s, y + b * s, z + d * s]);
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return f.flatMap((t) => t.flatMap((i) => c[i]));
}

describe("tidying a model for the file (build 49)", () => {
  it("gives two blocks that touch along an edge their own copies of that edge", () => {
    const soup = Float32Array.from([...cube(0, 0, 0), ...cube(1, 1, 0)]);
    expect(edgeUses(soup).get(4)).toBe(1);
    const tidy = tidyForFile(soup);
    const uses = edgeUses(tidy);
    expect([...uses.keys()]).toEqual([2]);
    expect(tidy.length).toBe(soup.length);
  });

  it("gives two blocks that touch at a corner their own copies of it, and leaves a clean block alone", () => {
    const soup = Float32Array.from([...cube(0, 0, 0), ...cube(1, 1, 1)]);
    expect([...edgeUses(tidyForFile(soup)).keys()]).toEqual([2]);
    const one = Float32Array.from(cube(0, 0, 0));
    expect(Array.from(tidyForFile(one))).toEqual(Array.from(one));
  });

  it("drops triangles that collapse to a line and a triangle met by its mirror image", () => {
    const block = cube(0, 0, 0);
    const soup = Float32Array.from([...block, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0.2, 0.2, 1, 0.4, 0.2, 1, 0.2, 0.4, 1, 0.2, 0.2, 1, 0.2, 0.4, 1, 0.4, 0.2, 1]);
    const tidy = tidyForFile(soup);
    expect(tidy.length).toBe(block.length);
    expect([...edgeUses(tidy).keys()]).toEqual([2]);
  });
});
