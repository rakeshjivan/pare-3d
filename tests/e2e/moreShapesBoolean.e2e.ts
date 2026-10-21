import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { buildGroupedShapeFromSelection } from "@/lib/editorBooleans";
import { MORE_SHAPE_IDS, moreShape } from "@/lib/moreShapes";
import type { WorkplaneShape } from "@/types/layerling";

function volume(shape: WorkplaneShape) {
  const positions = shape.importedMesh!.positions;
  let total = 0;
  for (let index = 0; index + 8 < positions.length; index += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(index, index + 9);
    total += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(total / 6);
}

// Fork (build 21): the new basic shapes take part in Group like any other - cut by a hole, and
// cutting as a hole themselves.
describe("the extra basic shapes in boolean groups", () => {
  for (const id of MORE_SHAPE_IDS) {
    it(`${id} can be cut by a hole`, async () => {
      const shape = moreShape(id, id);
      const whole = await buildGroupedShapeFromSelection([shape, { ...moreShape(id, id), id: "copy", x: 500 } as WorkplaneShape], 250_000);
      expect(whole.group).not.toBeNull();
      const hole = {
        id: "hole", name: "hole", kind: "box", color: "#999", x: 0, z: 0, elevation: -1, size: 4, width: 4, depth: 200, height: 200, rotation: 0, hole: true,
      } as unknown as WorkplaneShape;
      const cut = await buildGroupedShapeFromSelection([shape, hole], 250_000);
      expect(cut.group, cut.failureNotice).not.toBeNull();
      expect(volume(cut.group!)).toBeGreaterThan(0);
      expect(volume(cut.group!)).toBeLessThan(volume(whole.group!) / 2 + 1e-6);
    });
  }
});
