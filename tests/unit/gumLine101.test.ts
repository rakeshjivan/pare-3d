import { describe, expect, it } from "vitest";
import { refineGumLine } from "@/lib/gumLine";

/* Build 101: the gum line settled into the margin's groove on the full scan. */

/** A height field (z up, normals up) with a groove along x = groove. */
function surface(groove: number, h = 0.05, size = 2) {
  const n = Math.round(size / h);
  const z = (x: number) => -0.4 * Math.exp(-(((x - groove) / 0.08) ** 2));
  const tris: number[] = [];
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const x0 = -1 + i * h, y0 = -1 + j * h, x1 = x0 + h, y1 = y0 + h;
    tris.push(x0, y0, z(x0), x1, y0, z(x1), x1, y1, z(x1));
    tris.push(x0, y0, z(x0), x1, y1, z(x1), x0, y1, z(x0));
  }
  return Float32Array.from(tris);
}
const centreX = (soup: Float32Array, t: number) => (soup[t * 9] + soup[t * 9 + 3] + soup[t * 9 + 6]) / 3;
const centreY = (soup: Float32Array, t: number) => (soup[t * 9 + 1] + soup[t * 9 + 4] + soup[t * 9 + 7]) / 3;

describe("clean gum line", () => {
  it("moves a stepped border into the groove beside it", () => {
    const soup = surface(0.3);
    const count = soup.length / 9;
    // The finder's border: stepped, around x = 0.05, off the groove at 0.3.
    const labels = new Uint8Array(count);
    for (let t = 0; t < count; t += 1) labels[t] = centreX(soup, t) < 0.05 + (Math.floor((centreY(soup, t) + 1) / 0.2) % 2 ? 0.15 : 0) ? 11 : 0;
    const { labels: out, stats } = refineGumLine(soup, labels);
    expect(stats.changed).toBeGreaterThan(0);
    expect(stats.borderAfter).toBeLessThan(stats.borderBefore);
    // Away from the patch's edges, the tooth now ends at the groove (within a grid step or two).
    let off = 0, rows = 0;
    for (let t = 0; t < count; t += 1) {
      const x = centreX(soup, t), y = centreY(soup, t);
      if (Math.abs(y) > 0.7 || Math.abs(x - 0.3) < 0.1) continue;
      rows += 1;
      if ((out[t] === 11) !== (x < 0.3)) off += 1;
    }
    expect(off / rows).toBeLessThan(0.02);
  });
  it("leaves labels alone where there is no border", () => {
    const soup = surface(0.3);
    const labels = new Uint8Array(soup.length / 9).fill(21);
    const { labels: out, stats } = refineGumLine(soup, labels);
    expect(stats.changed).toBe(0);
    expect(out.every((l) => l === 21)).toBe(true);
  });
});
