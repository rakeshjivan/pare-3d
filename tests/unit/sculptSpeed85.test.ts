import { describe, expect, it } from "vitest";
import { LiveMesh, stampBrush } from "@/lib/liveSculpt";
import { readViewLook, storeViewLook } from "@/lib/viewLook";

/** A flat open sheet, n x n squares of `size` mm, as a soup. */
function sheetSoup(n: number, size: number) {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const x0 = i * size, y0 = j * size, x1 = x0 + size, y1 = y0 + size;
    out.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0);
  }
  return out;
}

describe("Sculpt speed (build 85)", () => {
  it("picks the surface a brush has just raised, without walking the whole mesh for its box", () => {
    const mesh = LiveMesh.fromSoup(sheetSoup(40, 0.5));
    mesh.geometry;
    const first = mesh.pick([10, 10, 20], [0, 0, -1]);
    expect(first?.point[2]).toBeCloseTo(0, 6);
    // Raised well above the sheet's old box by several dabs before the frame's GPU flush.
    for (let k = 0; k < 40; k += 1) {
      const hit = mesh.pick([10, 10, 20], [0, 0, -1])!;
      stampBrush(mesh, "draw", hit.point, [0, 0, 1], 3, hit.triangle, 1);
    }
    const raised = mesh.pick([10, 10, 20], [0, 0, -1])!;
    const truth = mesh.bounds().max[2];
    expect(truth).toBeGreaterThan(1);
    expect(raised.point[2]).toBeGreaterThan(truth - 0.2);
    // And after the flush, the same.
    mesh.flushGpu();
    expect(mesh.pick([10, 10, 20], [0, 0, -1])!.point[2]).toBeCloseTo(raised.point[2], 6);
  });

  it("leaves the triangles alone when refining finds nothing to split or collapse", () => {
    const mesh = LiveMesh.fromSoup(sheetSoup(30, 0.5));
    mesh.geometry;
    const centre: [number, number, number] = [7.5, 7.5, 0];
    // Already about the target size: nothing to split or collapse, so no flips or relaxing either.
    const edits = mesh.topologyEdits;
    const before = Float64Array.from(mesh.pos.subarray(0, mesh.vCount * 3));
    mesh.refine(mesh.region(centre, 3, null).keys(), 0.6, { within: { centre, radius: 3 } });
    expect(mesh.topologyEdits).toBe(edits);
    expect(Array.from(mesh.pos.subarray(0, mesh.vCount * 3))).toEqual(Array.from(before));
    // Where the triangles are too big it still splits, then evens them out.
    mesh.refine(mesh.region(centre, 3, null).keys(), 0.2, { within: { centre, radius: 3 } });
    expect(mesh.topologyEdits).toBeGreaterThan(edits);
  });

  it("remembers the view's look, the workplane by default", () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } } };
    window.localStorage.removeItem("pare3d.viewLook");
    expect(readViewLook()).toBe("plate");
    storeViewLook("dark");
    expect(readViewLook()).toBe("dark");
    storeViewLook("clear");
    expect(readViewLook()).toBe("clear");
    window.localStorage.setItem("pare3d.viewLook", "nonsense");
    expect(readViewLook()).toBe("plate");
  });
});
