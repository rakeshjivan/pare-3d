import { describe, expect, it } from "vitest";
import { KeyTable, PointGrid, samePointIds, tidyForFile } from "@/lib/dentalMesh";

/** A repeatable random stream. */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("Build 61: faster model making gives the same answers", () => {
  it("joins corners at the same 32-bit point as a string key does, -0 with 0", () => {
    const next = random(7);
    const n = 20_000;
    const coords = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      // A third of the corners repeat an earlier one; some sit on -0.
      const from = i > 10 && next() < 0.33 ? Math.floor(next() * i) : -1;
      for (let k = 0; k < 3; k += 1) coords[i * 3 + k] = from >= 0 ? coords[from * 3 + k] : next() < 0.05 ? (next() < 0.5 ? -0 : 0) : Math.round(next() * 200 - 100) / 8;
    }
    const at = new Map<string, number>();
    const expected = new Int32Array(n);
    for (let i = 0; i < n; i += 1) {
      const key = `${coords[i * 3]},${coords[i * 3 + 1]},${coords[i * 3 + 2]}`;
      let id = at.get(key);
      if (id === undefined) { id = at.size; at.set(key, id); }
      expected[i] = id;
    }
    const got = samePointIds(coords);
    expect(got.count).toBe(at.size);
    expect(Array.from(got.ids)).toEqual(Array.from(expected));
  });

  it("keeps whole-number keys like a Map, growing as it fills", () => {
    const next = random(11);
    const table = new KeyTable(4);
    const map = new Map<number, number>();
    for (let i = 0; i < 50_000; i += 1) {
      const key = Math.floor(next() * 2 ** 20) * 4294967296 + Math.floor(next() * 3000);
      table.add(key);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    expect(table.size).toBe(map.size);
    map.forEach((value, key) => expect(table.get(key)).toBe(value));
    expect(table.get(-5)).toBeUndefined();
  });

  it("answers within() exactly as nearest() under the reach, near cell edges too", () => {
    const next = random(3);
    const points = new Float64Array(30_000);
    for (let i = 0; i < points.length; i += 1) points[i] = Math.round(next() * 400) / 100;
    for (const [cell, reach] of [[0.05, 0.01], [8, 8], [0.5, 0.3]] as const) {
      const grid = new PointGrid(points, cell);
      for (let q = 0; q < 3000; q += 1) {
        // Half the questions right next to a point, the rest anywhere.
        const i = Math.floor(next() * 10_000) * 3;
        const close = next() < 0.5;
        const x = close ? points[i] + (next() - 0.5) * reach * 2.2 : next() * 4, y = close ? points[i + 1] + (next() - 0.5) * reach * 0.5 : next() * 4, z = close ? points[i + 2] : next() * 4;
        const hit = grid.nearest(x, y, z);
        expect(grid.within(x, y, z, reach)).toBe(Boolean(hit && hit[1] < reach));
      }
    }
  });

  it("tidies a soup with shared, doubled and mirrored triangles as before", () => {
    // Two tetrahedra touching at one corner, one face doubled the wrong way round.
    const tet = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const faces = [[0, 2, 1], [0, 1, 3], [1, 2, 3], [0, 3, 2]];
    const soup: number[] = [];
    // The second turned through the shared corner (a point reflection), so its faces run the other way.
    for (const flip of [false, true]) {
      const v = tet.map(([x, y, z]) => (flip ? [-x, -y, -z] : [x, y, z]));
      for (const f of faces) for (const k of flip ? [f[0], f[2], f[1]] : f) soup.push(...v[k]);
    }
    soup.push(5, 5, 5, 6, 5, 5, 5, 6, 5, 5, 5, 5, 5, 6, 5, 6, 5, 5);
    const out = tidyForFile(Float32Array.from(soup));
    // The mirrored pair goes, the two tetrahedra stay (8 faces), the shared corner split in two.
    expect(out.length / 9).toBe(8);
    const corners = new Set<string>();
    for (let i = 0; i < out.length; i += 3) corners.add(`${out[i]},${out[i + 1]},${out[i + 2]}`);
    expect(corners.size).toBe(8);
  });
});
