import { describe, expect, it } from "vitest";
import { cutAlongField, type Mesh } from "@/lib/dentalMesh";

/** A flat grid, 0.25 mm squares, each split in two. */
function grid(n = 80, step = 0.25): Mesh {
  const v: number[] = [], f: number[] = [];
  for (let j = 0; j <= n; j += 1) for (let i = 0; i <= n; i += 1) v.push(i * step, j * step, 0);
  for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    f.push(a, b, d, a, d, c);
  }
  return { v, f };
}
const smallestAngles = (m: Mesh) => {
  const out: number[] = [];
  for (let t = 0; t < m.f.length; t += 3) {
    const p = [0, 1, 2].map((k) => m.f[t + k] * 3);
    let least = 180;
    for (let k = 0; k < 3; k += 1) {
      const o = p[k], a = p[(k + 1) % 3], b = p[(k + 2) % 3];
      const u = [m.v[a] - m.v[o], m.v[a + 1] - m.v[o + 1]], w = [m.v[b] - m.v[o], m.v[b + 1] - m.v[o + 1]];
      const cos = (u[0] * w[0] + u[1] * w[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1]));
      least = Math.min(least, (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI);
    }
    out.push(least);
  }
  return out;
};
const area = (m: Mesh) => { let s = 0; for (let t = 0; t < m.f.length; t += 3) { const [a, b, c] = [m.f[t] * 3, m.f[t + 1] * 3, m.f[t + 2] * 3]; s += Math.abs((m.v[b] - m.v[a]) * (m.v[c + 1] - m.v[a + 1]) - (m.v[c] - m.v[a]) * (m.v[b + 1] - m.v[a + 1])) / 2; } return s; };

describe("gum cut without slivers (build 76)", () => {
  // A wavy margin, like a gum line, across the grid: keep what lies below it.
  const m = grid();
  const corners = m.v.length / 3;
  const field = new Float64Array(corners);
  for (let i = 0; i < corners; i += 1) field[i] = 10 + Math.sin(m.v[i * 3] * 0.7) * 2.3 - m.v[i * 3 + 1];
  it("leaves no triangle with a corner under 1° along the line, and keeps the same area", () => {
    const before = cutAlongField(m, field, undefined, 0);
    const after = cutAlongField(m, field);
    const slivers = (x: Mesh) => smallestAngles(x).filter((a) => a < 1).length;
    expect(slivers(before)).toBeGreaterThan(0);
    expect(slivers(after)).toBe(0);
    expect(Math.abs(area(after) - area(before)) / area(before)).toBeLessThan(0.002);
    // One piece of surface: no edge shared by more than two triangles, and the open edge one line.
    const uses = new Map<string, number>();
    for (let t = 0; t < after.f.length; t += 3) for (let k = 0; k < 3; k += 1) { const a = after.f[t + k], b = after.f[t + (k + 1) % 3]; const key = a < b ? `${a},${b}` : `${b},${a}`; uses.set(key, (uses.get(key) ?? 0) + 1); }
    expect([...uses.values()].filter((n) => n > 2).length).toBe(0);
    const open = (x: Mesh) => { const u = new Map<string, number>(); for (let t = 0; t < x.f.length; t += 3) for (let k = 0; k < 3; k += 1) { const a = x.f[t + k], b = x.f[t + (k + 1) % 3]; const key = a < b ? `${a},${b}` : `${b},${a}`; u.set(key, (u.get(key) ?? 0) + 1); } return [...u.values()].filter((n) => n === 1).length; };
    expect(open(after)).toBeLessThanOrEqual(open(before));
  });
  it("never moves the teeth", () => {
    const keep = new Uint8Array(corners);
    for (let i = 0; i < corners; i += 1) if (Math.abs(field[i]) < 0.1) keep[i] = 1;
    const after = cutAlongField(m, field, keep);
    for (let i = 0; i < corners; i += 1) if (keep[i]) for (let k = 0; k < 3; k += 1) expect(after.v[i * 3 + k]).toBe(m.v[i * 3 + k]);
  });
});
