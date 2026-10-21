import { describe, expect, it } from "vitest";
import { MORE_SHAPE_IDS, moreShape } from "@/lib/moreShapes";

/** Every edge of a closed solid is shared by exactly two triangles, once each way. */
function isClosed(positions: number[]) {
  const key = (i: number) => [positions[i], positions[i + 1], positions[i + 2]].map((v) => (Math.round(v * 1e4) / 1e4 + 0).toFixed(4)).join(",");
  const edges = new Map<string, number>();
  for (let t = 0; t < positions.length; t += 9) {
    const v = [key(t), key(t + 3), key(t + 6)];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    for (let e = 0; e < 3; e += 1) {
      const a = v[e], b = v[(e + 1) % 3];
      edges.set(`${a}|${b}`, (edges.get(`${a}|${b}`) ?? 0) + 1);
    }
  }
  for (const [edge, count] of edges) {
    const [a, b] = edge.split("|");
    if (count !== 1 || edges.get(`${b}|${a}`) !== 1) return false;
  }
  return true;
}

describe("more basic shapes", () => {
  for (const id of MORE_SHAPE_IDS) {
    it(`${id} stands on the plate with a sensible size`, () => {
      const shape = moreShape(id, id);
      expect(shape.kind).toBe("mesh");
      expect(shape.height).toBeGreaterThan(1);
      expect(shape.width).toBeGreaterThan(1);
      const positions = shape.importedMesh!.positions;
      const minY = Math.min(...positions.filter((_, index) => index % 3 === 1));
      expect(minY).toBeCloseTo(0, 5);
    });
    it(`${id} is a closed solid, faces outward`, () => {
      const positions = moreShape(id, id).importedMesh!.positions;
      expect(isClosed(positions)).toBe(true);
      let volume = 0;
      for (let t = 0; t < positions.length; t += 9) {
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(t, t + 9);
        volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      }
      expect(volume).toBeGreaterThan(0);
    });
  }
});
