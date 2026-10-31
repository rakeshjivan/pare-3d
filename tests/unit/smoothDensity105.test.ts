import { describe, expect, it } from "vitest";
import { LiveMesh, SMOOTH_EDGE_REF, stampBrush, type LiveBrush } from "@/lib/liveSculpt";

/** Build 105: the smoothing brushes the same in millimetres on a coarse or a fine scan, and Bubble smooth keeping its volume. */
function plate(n: number, height: (x: number, y: number) => number) {
  const soup: number[] = [];
  const s = 40 / n;
  const at = (i: number, j: number) => { const x = -20 + i * s, y = -20 + j * s; return [x, y, height(x, y)]; };
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    soup.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  return LiveMesh.fromSoup(soup);
}
function stroke(mesh: LiveMesh, brush: Exclude<LiveBrush, "move">, from: [number, number], to: [number, number], radius: number, strength: number) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  for (let d = 0; d <= length + 1e-9; d += 0.2 * radius) {
    const x = from[0] + ((to[0] - from[0]) * d) / length, y = from[1] + ((to[1] - from[1]) * d) / length;
    const hit = mesh.pick([x, y, 10], [0, 0, -1]);
    if (hit) stampBrush(mesh, brush, hit.point, [0, 0, 1], radius, hit.triangle, strength);
  }
}
/** Ridges 0.3 mm high, 2.5 mm apart, across x. */
const ridges = (x: number) => 0.15 * Math.cos((2 * Math.PI * x) / 2.5);
function ridgeLeft(mesh: LiveMesh) {
  let lo = Infinity, hi = -Infinity;
  for (let v = 0; v < mesh.vCount; v += 1) {
    const x = mesh.pos[v * 3], y = mesh.pos[v * 3 + 1];
    if (Math.abs(y) > 0.2 || Math.abs(x) > 3) continue;
    lo = Math.min(lo, mesh.pos[v * 3 + 2]); hi = Math.max(hi, mesh.pos[v * 3 + 2]);
  }
  return (hi - lo) / 0.3;
}
/** Volume under the surface down to z = -1, over the middle of the plate. */
function volume(mesh: LiveMesh) {
  let total = 0;
  for (let t = 0; t < mesh.tCount; t += 1) {
    if (!mesh.tAlive[t]) continue;
    const a = mesh.tri[t * 3], b = mesh.tri[t * 3 + 1], c = mesh.tri[t * 3 + 2];
    const p = mesh.pos;
    const ax = p[a * 3], ay = p[a * 3 + 1], bx = p[b * 3], by = p[b * 3 + 1], cx = p[c * 3], cy = p[c * 3 + 1];
    const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
    total += area * ((p[a * 3 + 2] + p[b * 3 + 2] + p[c * 3 + 2]) / 3 + 1);
  }
  return total;
}

describe("Build 105: smoothing that does not depend on the triangles' size", () => {
  it("keeps build 82's calibration on its plate (the reference edge is that plate's)", () => {
    const mesh = plate(160, (x) => ridges(x));
    expect(Math.abs(mesh.averageEdge(Array.from({ length: 500 }, (_, i) => i * 37)) - SMOOTH_EDGE_REF)).toBeLessThan(0.03);
  });

  it("takes away about as much of the ridges on a plate with triangles half and twice as long", () => {
    const left = [80, 160, 320].map((n) => {
      const mesh = plate(n, (x) => ridges(x));
      stroke(mesh, "smooth", [0, -3], [0, 3], 3, 0.5);
      return ridgeLeft(mesh);
    });
    const classic = [80, 160, 320].map((n) => {
      const mesh = plate(n, (x) => ridges(x));
      mesh.classicSmooth = true;
      stroke(mesh, "smooth", [0, -3], [0, 3], 3, 0.5);
      return ridgeLeft(mesh);
    });
    require("fs").writeFileSync("/tmp/claude-0/-home-claude/cb85eabe-15bc-5f9e-9ca7-c20b57946dce/scratchpad/smooth105.json", JSON.stringify({ left, classic }));
    // Classic: the fine plate keeps far more of its ridges than the coarse one.
    expect(classic[2] - classic[0]).toBeGreaterThan(0.2);
    // Now: within 0.15 of each other.
    expect(Math.max(...left) - Math.min(...left)).toBeLessThan(0.15);
  });

  it("Bubble smooth rounds a bump off while keeping its volume (within 3%)", () => {
    const bump = (x: number, y: number) => Math.max(0, 1 - (x * x + y * y) / 9) ** 2;
    const mesh = plate(160, bump);
    const before = volume(mesh);
    for (let k = 0; k < 4; k += 1) stroke(mesh, "bubbleSmooth", [-2, 0], [2, 0], 3, 0.8);
    const after = volume(mesh);
    const shrink = plate(160, bump);
    for (let k = 0; k < 4; k += 1) stroke(shrink, "shrinkSmooth", [-2, 0], [2, 0], 3, 0.8);
    require("fs").appendFileSync("/tmp/claude-0/-home-claude/cb85eabe-15bc-5f9e-9ca7-c20b57946dce/scratchpad/smooth105.json", "\n" + JSON.stringify({ before, after, shrunk: volume(shrink) }));
    expect(Math.abs(after - before) / (before - 1600)).toBeLessThan(0.03);
    expect(volume(shrink)).toBeLessThan(after);
  });
});
