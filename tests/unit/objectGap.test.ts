import { describe, expect, it } from "vitest";
import { nearestObjectGap } from "@/lib/objectSnap";

const box = (minX: number, maxX: number, minZ: number, maxZ: number) => ({ minX, maxX, minZ, maxZ });

describe("gap to the nearest part while dragging", () => {
  it("measures the gap to a part beside it", () => {
    expect(nearestObjectGap(box(0, 10, 0, 10), [box(22, 30, 2, 8)])).toMatchObject({ axis: "x", distance: 12, from: 10, to: 22 });
  });
  it("takes the nearest of several", () => {
    expect(nearestObjectGap(box(0, 10, 0, 10), [box(40, 50, 0, 10), box(-15, -5, 0, 10)])?.distance).toBe(5);
  });
  it("measures front to back too", () => {
    expect(nearestObjectGap(box(0, 10, 0, 10), [box(0, 10, 13, 20)])).toMatchObject({ axis: "z", distance: 3 });
  });
  it("ignores parts that do not face it, touch it or are far away", () => {
    expect(nearestObjectGap(box(0, 10, 0, 10), [box(20, 30, 20, 30)])).toBeNull();
    expect(nearestObjectGap(box(0, 10, 0, 10), [box(10, 20, 0, 10)])).toBeNull();
    expect(nearestObjectGap(box(0, 10, 0, 10), [box(100, 110, 0, 10)])).toBeNull();
  });
});
