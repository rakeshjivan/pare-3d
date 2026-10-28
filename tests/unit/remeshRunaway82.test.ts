import { describe, expect, it } from "vitest";
import { LiveMesh, remeshLive } from "@/lib/liveSculpt";

/**
 * Build 82: Remesh on a surface rougher than its triangles (a ripple 0.7 mm across under 0.32 mm
 * triangles) split without end - new corners pulled back onto the surface kept their edges long -
 * and a 97,000-triangle part came out at 1.46 million triangles after eight minutes. Splitting now
 * only carries on while the edges get shorter.
 */
function rippled(n: number): Float32Array {
  const out = new Float32Array(n * n * 18);
  const w = 70, d = 55;
  const height = (x: number, z: number) => {
    const arch = Math.exp(-(((Math.hypot(x, z + 20) - 28) / 6) ** 2));
    return 4 * arch + 2.5 * arch * (0.5 + 0.5 * Math.cos(x * 1.1) * Math.cos(z * 1.3)) + 0.15 * Math.sin(x * 7.3 + z * 5.1);
  };
  const at = (i: number, j: number) => { const x = -w / 2 + (w * i) / n, z = -d / 2 + (d * j) / n; return [x, height(x, z), z]; };
  let k = 0;
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), e = at(i, j + 1);
    for (const p of [a, e, c, a, c, b]) { out[k++] = p[0]; out[k++] = p[1]; out[k++] = p[2]; }
  }
  return out;
}

describe("Remesh does not run away on a rough surface (build 82)", () => {
  it("keeps the triangle count near what the size asks for", () => {
    const soup = rippled(220);
    const mesh = LiveMesh.fromSoup(soup);
    remeshLive(mesh, 70 / 220, 2);
    // Before the fix: 1.46 million. The surface's own area at this size is about 90-150 thousand.
    expect(mesh.triangleCount()).toBeLessThan(250000);
    expect(mesh.triangleCount()).toBeGreaterThan(50000);
  }, 120000);
});
