import { describe, expect, it } from "vitest";
import { ATTRACT_STROKE, LiveMesh, stampBrush } from "@/lib/liveSculpt";
import { NearestSurface } from "@/lib/nearestSurface";

/** Build 105: Attract onto what the surface faces, stopping at the clearance, within its limits. */
function plate(n: number) {
  const soup: number[] = [];
  const s = 20 / n;
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const x = -10 + i * s, y = -10 + j * s;
    soup.push(x, y, 0, x + s, y, 0, x + s, y + s, 0, x, y, 0, x + s, y + s, 0, x, y + s, 0);
  }
  return LiveMesh.fromSoup(soup);
}
const sheet = (z: number, down: boolean) => {
  const out: number[] = [];
  for (let i = -10; i < 10; i += 1) for (let j = -10; j < 10; j += 1) {
    const a = [i, j, z], b = [i + 1, j, z], c = [i + 1, j + 1, z], d = [i, j + 1, z];
    if (down) out.push(...a, ...c, ...b, ...a, ...d, ...c); else out.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  return Float32Array.from(out);
};
function strokes(mesh: LiveMesh, count: number) {
  for (let k = 0; k < count; k += 1) {
    mesh.beginPatch();
    for (let x = -2; x <= 2; x += 0.3) { const hit = mesh.pick([x, 0, 5], [0, 0, -1]); if (hit) stampBrush(mesh, "attract", hit.point, [0, 0, 1], 2, hit.triangle, 1); }
    mesh.endPatch();
  }
}
const top = (mesh: LiveMesh) => { let z = -Infinity; for (let v = 0; v < mesh.vCount; v += 1) z = Math.max(z, mesh.pos[v * 3 + 2]); return z; };
const bottom = (mesh: LiveMesh) => { let z = Infinity; for (let v = 0; v < mesh.vCount; v += 1) z = Math.min(z, mesh.pos[v * 3 + 2]); return z; };

describe("Build 105: Attract", () => {
  it("comes up to the opposing surface and stops at the clearance", () => {
    const mesh = plate(80);
    mesh.attractTarget = new NearestSurface(sheet(1, true), 4);
    mesh.attractGap = 0.1;
    strokes(mesh, 20);
    expect(top(mesh)).toBeGreaterThan(0.85);
    expect(top(mesh)).toBeLessThan(0.9 + 1e-3);
  });

  it("moves no more than its limit in one stroke", () => {
    const mesh = plate(80);
    mesh.attractTarget = new NearestSurface(sheet(3.5, true), 4);
    strokes(mesh, 1);
    expect(top(mesh)).toBeLessThan(ATTRACT_STROKE + 1e-3);
  });

  it("does not pull through the part onto a surface behind it", () => {
    const mesh = plate(80);
    mesh.attractTarget = new NearestSurface(sheet(-1, false), 4);
    strokes(mesh, 5);
    expect(bottom(mesh)).toBeGreaterThan(-1e-6);
  });

  it("as before build 105 it does pull onto it", () => {
    const mesh = plate(80);
    mesh.classicAttract = true;
    mesh.attractTarget = new NearestSurface(sheet(-1, false), 4);
    strokes(mesh, 5);
    expect(bottom(mesh)).toBeLessThan(-0.2);
  });
});
