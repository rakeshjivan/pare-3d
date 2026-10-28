import { describe, expect, it } from "vitest";
import { LiveMesh, stampBrush, type LiveBrush } from "@/lib/liveSculpt";

/** A 40 mm plate on an n x n grid, heights from `height`; `jitter` moves the grid's corners about in the plane. */
function plate(n: number, height: (x: number, y: number) => number, jitter = 0) {
  const soup: number[] = []; const s = 40 / n;
  const at = (i: number, j: number) => {
    const inside = i > 0 && j > 0 && i < n && j < n;
    const jx = inside ? jitter * s * Math.sin(i * 12.9898 + j * 78.233) : 0, jy = inside ? jitter * s * Math.cos(i * 39.346 + j * 11.135) : 0;
    const x = -20 + i * s + jx, y = -20 + j * s + jy; return [x, y, height(x, y)];
  };
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) { const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1); soup.push(...a, ...b, ...c, ...a, ...c, ...d); }
  return LiveMesh.fromSoup(soup);
}
const stroke = (mesh: LiveMesh, brush: Exclude<LiveBrush, "move">, s: number, y = 0, from = -8, to = 8) => {
  mesh.beginStroke();
  for (let d = from; d <= to + 1e-9; d += 0.6) { const hit = mesh.pick([d, y, 10], [0, 0, -1]); if (hit) stampBrush(mesh, brush, hit.point, [0, 0, 1], 3, hit.triangle, s); }
};
const top = (mesh: LiveMesh) => { let z = -Infinity; for (let v = 0; v < mesh.vCount; v += 1) z = Math.max(z, mesh.pos[v * 3 + 2]); return z; };
const dome = (x: number, y: number) => Math.max(0, 1 - (x * x + y * y) / 9);

describe("Meshmixer's brushes (build 89)", () => {
  it("RobustSmooth leaves an uneven flat patch where it is; the plain (shrink) smooth slides its corners about", () => {
    const drift = (brush: "smooth" | "shrinkSmooth") => {
      const mesh = plate(80, () => 0, 0.3);
      const before = Float64Array.from(mesh.pos.subarray(0, mesh.vCount * 3));
      stroke(mesh, brush, 1);
      let most = 0;
      for (let v = 0; v < mesh.vCount; v += 1) most = Math.max(most, Math.hypot(mesh.pos[v * 3] - before[v * 3], mesh.pos[v * 3 + 1] - before[v * 3 + 1], mesh.pos[v * 3 + 2] - before[v * 3 + 2]));
      return most;
    };
    expect(drift("smooth")).toBeLessThan(1e-6);
    expect(drift("shrinkSmooth")).toBeGreaterThan(0.02);
  });

  it("BubbleSmooth keeps a bump's volume better than the shrinking smooth", () => {
    const sunk = (brush: "shrinkSmooth" | "bubbleSmooth") => {
      const mesh = plate(160, dome);
      for (let k = 0; k < 3; k += 1) stroke(mesh, brush, 0.5, -1.2 + k * 1.2);
      return top(mesh);
    };
    expect(sunk("bubbleSmooth")).toBeGreaterThan(sunk("shrinkSmooth") + 0.08);
  });

  it("Draw 2 builds to a set height and no further, however often a stroke goes over the same place", () => {
    const once = plate(160, () => 0);
    stroke(once, "draw2", 0.5);
    const over = plate(160, () => 0);
    over.beginStroke();
    for (let pass = 0; pass < 4; pass += 1) for (let d = -8; d <= 8; d += 0.6) { const hit = over.pick([d, 0, 10], [0, 0, -1]); if (hit) stampBrush(over, "draw2", hit.point, [0, 0, 1], 3, hit.triangle, 0.5); }
    expect(top(once)).toBeGreaterThan(0.2);
    expect(top(over)).toBeLessThan(top(once) * 1.6);
    // Plain Draw keeps building.
    const draw = plate(160, () => 0);
    draw.beginStroke();
    for (let pass = 0; pass < 4; pass += 1) for (let d = -8; d <= 8; d += 0.6) { const hit = draw.pick([d, 0, 10], [0, 0, -1]); if (hit) stampBrush(draw, "draw", hit.point, [0, 0, 1], 3, hit.triangle, 0.5); }
    expect(top(draw)).toBeGreaterThan(top(over) * 1.5);
  });

  it("Flatten works up with the strength as Meshmixer's does (16 / 44 / 84% there in a quick stroke)", () => {
    const removed = [0.25, 0.53, 1].map((s) => {
      const mesh = plate(160, (x) => 0.3 * Math.sin((2 * Math.PI * x) / 2.5));
      stroke(mesh, "flatten", s);
      let lo = Infinity, hi = -Infinity;
      for (let v = 0; v < mesh.vCount; v += 1) { if (Math.abs(mesh.pos[v * 3 + 1]) > 0.15 || Math.abs(mesh.pos[v * 3]) > 3) continue; lo = Math.min(lo, mesh.pos[v * 3 + 2]); hi = Math.max(hi, mesh.pos[v * 3 + 2]); }
      return 1 - (hi - lo) / 0.6;
    });
    expect(removed[0]).toBeGreaterThan(0.15); expect(removed[0]).toBeLessThan(0.35);
    expect(removed[1]).toBeGreaterThan(0.5); expect(removed[1]).toBeLessThan(0.72);
    expect(removed[2]).toBeGreaterThan(0.8); expect(removed[2]).toBeLessThan(0.95);
  });

  it("Drag pulls the surface along the stroke", () => {
    const mesh = plate(160, dome);
    stroke(mesh, "drag", 0.5, 0, -1, 5);
    let cx = 0, w = 0;
    for (let v = 0; v < mesh.vCount; v += 1) { const z = mesh.pos[v * 3 + 2]; if (z > 0.5) { cx += mesh.pos[v * 3] * z; w += z; } }
    expect(cx / w).toBeGreaterThan(0.5);
  });
});
