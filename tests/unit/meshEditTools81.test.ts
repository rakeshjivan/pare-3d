import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { setManifoldAssetBase } from "@/lib/editorMeshCore";
import { growChoice, sculptMeshOf, type SculptMesh } from "@/lib/meshSculpt";
import { alignToPlate, bridgeChoice, extrudeChoice, shrinkChoice, smoothChoice } from "@/lib/meshEditTools";
import { solidPositions } from "@/lib/meshRemesh";

/** A closed box, each face an n x n grid of squares, facing out. */
function boxSoup(n: number, size = 10, skip: (face: number, i: number, j: number) => boolean = () => false): number[] {
  const out: number[] = [];
  const h = size / 2;
  // Each face: a corner, two edge directions (u x v points out).
  const faces: Array<[number[], number[], number[]]> = [
    [[h, -h, -h], [0, 1, 0], [0, 0, 1]], [[-h, -h, -h], [0, 0, 1], [0, 1, 0]],
    [[-h, h, -h], [0, 0, 1], [1, 0, 0]], [[-h, -h, -h], [1, 0, 0], [0, 0, 1]],
    [[-h, -h, h], [1, 0, 0], [0, 1, 0]], [[-h, -h, -h], [0, 1, 0], [1, 0, 0]],
  ];
  faces.forEach(([o, u, v], f) => {
    const at = (i: number, j: number) => [0, 1, 2].map((k) => o[k] + (u[k] * i + v[k] * j) * (size / n));
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
      if (skip(f, i, j)) continue;
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      out.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  });
  return out;
}

/** Every edge used once each way: a closed, consistently wound surface. */
function closed(positions: ArrayLike<number>) {
  const mesh = sculptMeshOf(positions);
  const count = new Map<string, number>();
  const tri = mesh.triangles;
  for (let t = 0; t < tri.length / 3; t += 1) for (let k = 0; k < 3; k += 1) {
    const key = `${tri[t * 3 + k]}>${tri[t * 3 + ((k + 1) % 3)]}`;
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  for (const [key, c] of count) {
    if (c !== 1) return false;
    const [a, b] = key.split(">");
    if (count.get(`${b}>${a}`) !== 1) return false;
  }
  return true;
}

function volume(p: ArrayLike<number>) {
  let v = 0;
  for (let i = 0; i < p.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from({ length: 9 }, (_, k) => p[i + k]);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

/** The triangles whose centre passes a test. */
function choose(mesh: SculptMesh, test: (x: number, y: number, z: number) => boolean) {
  const chosen = new Uint8Array(mesh.triangles.length / 3);
  const p = mesh.points, tri = mesh.triangles;
  for (let t = 0; t < chosen.length; t += 1) {
    const c = [0, 1, 2].map((k) => (p[tri[t * 3] * 3 + k] + p[tri[t * 3 + 1] * 3 + k] + p[tri[t * 3 + 2] * 3 + k]) / 3);
    chosen[t] = test(c[0], c[1], c[2]) ? 1 : 0;
  }
  return chosen;
}
const count = (c: Uint8Array) => c.reduce((s, v) => s + v, 0);

describe("Meshmixer edit tools (build 81)", () => {
  it("the test box is closed with a volume of 1000 mm3", () => {
    const box = boxSoup(4);
    expect(closed(box)).toBe(true);
    expect(volume(box)).toBeCloseTo(1000, 6);
  });

  it("Shrink drops the outer ring; Smooth boundary keeps a square patch and fills a notch", () => {
    const mesh = sculptMeshOf(boxSoup(6));
    const top = choose(mesh, (_x, y) => y > 4.99);
    const shrunk = shrinkChoice(mesh, top);
    expect(count(shrunk)).toBeGreaterThan(0);
    expect(count(shrunk)).toBeLessThan(count(top));
    // A top face with one square missing from its middle: smoothing fills it back.
    const notched = choose(mesh, (x, y, z) => y > 4.99 && !(Math.abs(x) < 0.8 && Math.abs(z) < 0.8));
    const smooth = smoothChoice(mesh, notched, 1);
    const notch = choose(mesh, (x, y, z) => y > 4.99 && Math.abs(x) < 0.8 && Math.abs(z) < 0.8);
    expect(count(notch)).toBeGreaterThan(0);
    for (let t = 0; t < smooth.length; t += 1) if (notch[t]) expect(smooth[t]).toBe(1);
    // Never past the outline grown by the rings, and about the same size.
    const grown = growChoice(mesh, notched);
    for (let t = 0; t < smooth.length; t += 1) if (smooth[t]) expect(grown[t]).toBe(1);
    expect(Math.abs(count(smooth) - count(notched))).toBeLessThanOrEqual(4);
  });

  it("Extrude moves the top out by the distance and the part stays closed", () => {
    const mesh = sculptMeshOf(boxSoup(4));
    const top = choose(mesh, (_x, y) => y > 4.99);
    const out = extrudeChoice(mesh, top, 2, "extrude");
    expect(closed(out)).toBe(true);
    expect(volume(out)).toBeCloseTo(1200, 4);
    const inward = extrudeChoice(mesh, top, -3, "extrude");
    expect(closed(inward)).toBe(true);
    expect(volume(inward)).toBeCloseTo(700, 4);
    // A patch in the middle of a face: a boss 2 mm high on a 5 x 5 mm square.
    const patch = choose(mesh, (x, y, z) => y > 4.99 && Math.abs(x) < 2.5 && Math.abs(z) < 2.5);
    const boss = extrudeChoice(mesh, patch, 2, "offset");
    expect(closed(boss)).toBe(true);
    expect(volume(boss)).toBeCloseTo(1050, 4);
  });

  it("Bridge joins two holes into a closed tunnel through the box", () => {
    // A 2 x 2 mm opening in the middle of the top and the bottom.
    const holes = boxSoup(5, 10, (f, i, j) => (f === 2 || f === 3) && i === 2 && j === 2);
    expect(closed(holes)).toBe(false);
    const mesh = sculptMeshOf(holes);
    const near = choose(mesh, (x, _y, z) => Math.abs(x) < 3.1 && Math.abs(z) < 3.1);
    const bridged = bridgeChoice(mesh, near);
    expect("error" in bridged).toBe(false);
    if ("error" in bridged) return;
    expect(bridged.joined).toBe("loops");
    expect(closed(bridged.positions)).toBe(true);
    // The tunnel takes its 2 x 2 x 10 mm out of the box.
    expect(volume(bridged.positions)).toBeCloseTo(1000 - 40, 4);
    // No open edges chosen: says how many it found.
    const none = bridgeChoice(sculptMeshOf(boxSoup(3)), new Uint8Array(108).fill(1));
    expect(none).toEqual({ error: "count", found: 0 });
  });

  it("Align turns the chosen face onto the plate", () => {
    const mesh = sculptMeshOf(boxSoup(2));
    const side = choose(mesh, (x) => x > 4.99);
    const out = alignToPlate(mesh, side)!;
    const after = sculptMeshOf(out);
    // The face that was on +x now lies flat at y = 0.
    let low = 0, flat = 0;
    for (let i = 0; i < out.length; i += 3) low = Math.min(low, out[i + 1]);
    expect(low).toBeCloseTo(0, 6);
    const chosen = Array.from(side);
    for (let t = 0; t < chosen.length; t += 1) if (chosen[t]) for (let k = 0; k < 3; k += 1) flat = Math.max(flat, Math.abs(after.points[after.triangles[t * 3 + k] * 3 + 1]));
    expect(flat).toBeLessThan(1e-6);
    expect(volume(out)).toBeCloseTo(1000, 4);
    expect(alignToPlate(mesh, new Uint8Array(side.length))).toBeNull();
  });

  it("Make Solid closes a box with a hole and two overlapping shells", async () => {
    setManifoldAssetBase(pathToFileURL(resolve("apps/web/public") + "/").href);
    const open = boxSoup(4, 10, (f, i, j) => f === 2 && i === 1 && j === 1);
    const other = boxSoup(2, 6).map((v, i) => (i % 3 === 0 ? v + 6 : v));
    const result = await solidPositions([...open, ...other], 0.5);
    expect(closed(result.positions)).toBe(true);
    // One 10 mm box and a 6 mm box overlapping it by 2 mm in x: 1000 + 216 - 2 * 6 * 6.
    expect(volume(result.positions)).toBeGreaterThan(1104 * 0.95);
    expect(volume(result.positions)).toBeLessThan(1104 * 1.05);
    // A flat sheet encloses nothing.
    await expect(solidPositions([0, 0, 0, 10, 0, 0, 0, 0, 10], 0.5)).rejects.toThrow(/encloses nothing/);
  }, 120000);
});
