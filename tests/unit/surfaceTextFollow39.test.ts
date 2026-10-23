import { describe, expect, it } from "vitest";
import { anchorMotion, movePositions, surfaceAnchors } from "../../apps/web/src/lib/surfaceTextFollow";

const cube = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]];
// Turned 90 degrees about y through (5, 0, 5), then moved 20 along x.
const turn = (v: number[]) => [5 + (v[2] - 5) + 20, v[1], 5 - (v[0] - 5)];

describe("surface text follows its part", () => {
  it("finds the exact motion of a turned and moved part", () => {
    const anchors = surfaceAnchors(cube)!;
    expect(anchors).toHaveLength(3);
    const motion = anchorMotion(anchors, cube.map(turn));
    expect(motion).not.toBe("changed");
    if (motion === "changed") return;
    expect(motion.identity).toBe(false);
    const p = motion.point({ x: 10, y: 5, z: 5 });
    expect(p.x).toBeCloseTo(25 + 20 - 20 + 0, 6); // (10,5,5) -> x = 5 + 0 + 20 = 25
    expect(p.z).toBeCloseTo(0, 6);
    const n = motion.direction({ x: 1, y: 0, z: 0 });
    expect(n.x).toBeCloseTo(0, 6);
    expect(n.z).toBeCloseTo(-1, 6);
    expect(movePositions([10, 5, 5], motion).map((value) => Math.round(value * 1e6) / 1e6)).toEqual([25, 5, 0]);
  });

  it("sees a part that did not move", () => {
    const motion = anchorMotion(surfaceAnchors(cube), cube);
    expect(motion !== "changed" && motion.identity).toBe(true);
  });

  it("says when the part changed size instead", () => {
    expect(anchorMotion(surfaceAnchors(cube), cube.map((v) => v.map((value) => value * 1.5)))).toBe("changed");
    expect(anchorMotion(surfaceAnchors(cube), cube.slice(0, 2))).toBe("changed");
  });
});
