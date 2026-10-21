import { describe, expect, it } from "vitest";
import { pullDistanceAlongNormal, pullToFaceTool, snapPullDistance, typedPull } from "@/lib/facePull";

describe("push/pull by dragging a face (build 23)", () => {
  const origin = { x: 0, y: 10, z: 0 };
  const up = { x: 0, y: 1, z: 0 };

  it("reads how far along the face's normal the pointer's ray passes", () => {
    // A ray from the side, level with y = 15: the face is pulled out 5 mm.
    expect(pullDistanceAlongNormal(origin, up, { x: -100, y: 15, z: 0 }, { x: 1, y: 0, z: 0 })).toBeCloseTo(5);
    // Level with y = 4: pushed in 6 mm.
    expect(pullDistanceAlongNormal(origin, up, { x: -100, y: 4, z: 3 }, { x: 1, y: 0, z: 0 })).toBeCloseTo(-6);
  });

  it("works for a slanted view too", () => {
    const value = pullDistanceAlongNormal(origin, up, { x: -50, y: 60, z: 0 }, { x: 1, y: -1, z: 0 });
    // The ray passes x = 0 at y = 10: no pull.
    expect(value).toBeCloseTo(0);
  });

  it("gives up when looking straight down the normal", () => {
    expect(pullDistanceAlongNormal(origin, up, { x: 0, y: 100, z: 0 }, { x: 0, y: -1, z: 0 })).toBeNull();
  });

  it("snaps to the grid, or finely with Shift", () => {
    expect(snapPullDistance(4.6, 1, false)).toBe(5);
    expect(snapPullDistance(-2.26, 0.5, false)).toBe(-2.5);
    expect(snapPullDistance(4.63, 1, true)).toBe(4.6);
    expect(Object.is(snapPullDistance(-0.04, 1, false), -0)).toBe(false);
  });

  it("turns the pull into out or in", () => {
    expect(pullToFaceTool(5, 0.2)).toEqual({ direction: "out", depth: 5 });
    expect(pullToFaceTool(-3, 0.2)).toEqual({ direction: "in", depth: 3 });
    expect(pullToFaceTool(0, 0.2)).toEqual({ direction: "out", depth: 0.2 });
  });

  it("reads a typed depth", () => {
    expect(typedPull("12")).toBe(12);
    expect(typedPull("1.5")).toBe(1.5);
    expect(typedPull("-3")).toBe(-3);
    expect(typedPull("-")).toBeNull();
    expect(typedPull("1.2.3")).toBeNull();
  });
});
