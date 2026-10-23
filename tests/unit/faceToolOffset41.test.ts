import { describe, expect, it } from "vitest";
import { faceScreenAxes, normalizeFaceTool, shiftedAcrossFace } from "../../apps/web/src/lib/faceTool";

describe("push/pull: moving the shape across the face (build 41)", () => {
  it("knows right and up on the front face (looking at it from the front)", () => {
    // The front face looks towards +z: seen from the front, right is +x and up is +y.
    const { right, up } = faceScreenAxes({ x: 0, y: 0, z: 1 });
    expect(right.x).toBeCloseTo(1); expect(up.y).toBeCloseTo(1);
  });
  it("on the right face right points to the back, and on the top face up points to the back", () => {
    const side = faceScreenAxes({ x: 1, y: 0, z: 0 });
    expect(side.right.z).toBeCloseTo(-1); expect(side.up.y).toBeCloseTo(1);
    const top = faceScreenAxes({ x: 0, y: 1, z: 0 });
    expect(top.up.z).toBeCloseTo(-1); expect(top.right.x).toBeCloseTo(1);
  });
  it("moves the workplane by the offsets and keeps them within range", () => {
    const plane = { origin: { x: 0, y: 5, z: 10 }, normal: { x: 0, y: 0, z: 1 }, xAxis: { x: 1, y: 0, z: 0 }, zAxis: { x: 0, y: -1, z: 0 } };
    const moved = shiftedAcrossFace(plane as never, { offsetX: 3, offsetY: -2 });
    expect(moved.origin).toEqual({ x: 3, y: 3, z: 10 });
    expect(shiftedAcrossFace(plane as never, {})).toBe(plane);
    expect(normalizeFaceTool({ offsetX: 500, offsetY: -500 })).toMatchObject({ offsetX: 100, offsetY: -100 });
  });
});
