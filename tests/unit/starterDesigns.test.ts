import { describe, expect, it } from "vitest";
import { PHONE_STAND_OUTLINE, STARTER_IDS, starterParts } from "@/lib/starterDesigns";

describe("starter designs", () => {
  it("gives every starter at least one part with bodies in it", () => {
    for (const id of STARTER_IDS) {
      const parts = starterParts(id);
      expect(parts.length, id).toBeGreaterThan(0);
      for (const part of parts) expect(part.shapes.length, `${id}: ${part.name}`).toBeGreaterThan(0);
    }
  });

  it("draws the phone stand counter-clockwise, without crossing itself", () => {
    const points = PHONE_STAND_OUTLINE;
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
      const [x0, y0] = points[index];
      const [x1, y1] = points[(index + 1) % points.length];
      area += x0 * y1 - x1 * y0;
    }
    expect(area).toBeGreaterThan(0);
    const crosses = (a: number[], b: number[], c: number[], d: number[]) => {
      const side = (p: number[], q: number[], r: number[]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
      return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
    };
    const edges = points.map((point, index) => [point, points[(index + 1) % points.length]]);
    for (let i = 0; i < edges.length; i += 1) {
      for (let j = i + 2; j < edges.length; j += 1) {
        if (i === 0 && j === edges.length - 1) continue;
        expect(crosses(edges[i][0], edges[i][1], edges[j][0], edges[j][1]), `${i}-${j}`).toBe(false);
      }
    }
  });

  it("makes the keyring's ring hole a hole", () => {
    const [tag] = starterParts("keyring");
    expect(tag.group).toBe(true);
    expect(tag.shapes.some((shape) => shape.hole)).toBe(true);
  });
});
