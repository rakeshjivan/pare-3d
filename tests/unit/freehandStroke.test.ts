import { describe, expect, it } from "vitest";
import { addFreehandStroke, simplifyStroke } from "@/lib/freehandStroke";
import type { SketchProfile } from "@/types/layerling";

const empty = (): SketchProfile => ({ points: [], segments: [] });
const circle = (radius: number, count: number, turn = 1) =>
  Array.from({ length: count + 1 }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 * turn;
    return { x: radius * Math.cos(angle), z: radius * Math.sin(angle) };
  });
const options = { tolerance: 0.2, stroked: false, construction: false };

describe("Scribble (freehand sketch)", () => {
  it("thins a straight run to its two ends, and keeps a corner", () => {
    const line = Array.from({ length: 50 }, (_, index) => ({ x: index, z: 0.01 * Math.sin(index) }));
    expect(simplifyStroke(line, 0.1)).toHaveLength(2);
    const corner = [...Array.from({ length: 20 }, (_, i) => ({ x: i, z: 0 })), ...Array.from({ length: 20 }, (_, i) => ({ x: 19, z: i + 1 }))];
    expect(simplifyStroke(corner, 0.1)).toHaveLength(3);
  });

  it("closes a loop drawn back to its start into a smooth shape with far fewer points", () => {
    const result = addFreehandStroke(empty(), circle(20, 400), options)!;
    expect(result.closed).toBe(true);
    expect(result.profile.points.length).toBeGreaterThanOrEqual(8);
    expect(result.profile.points.length).toBeLessThan(60);
    expect(result.profile.segments).toHaveLength(result.profile.points.length);
    expect(result.profile.segments.every((segment) => segment.kind === "smooth")).toBe(true);
    expect(result.profile.points.every((point) => point.handleIn && point.handleOut)).toBe(true);
  });

  it("closes an open scribble too, unless the sketch is a stroke or a construction line", () => {
    const arc = circle(20, 200, 0.5);
    expect(addFreehandStroke(empty(), arc, options)!.closed).toBe(true);
    const stroked = addFreehandStroke(empty(), arc, { ...options, stroked: true })!;
    expect(stroked.closed).toBe(false);
    expect(stroked.profile.segments).toHaveLength(stroked.profile.points.length - 1);
    const path = addFreehandStroke(empty(), arc, { ...options, construction: true })!;
    expect(path.closed).toBe(false);
    expect(path.profile.segments.every((segment) => segment.construction)).toBe(true);
  });

  it("ignores a click or a twitch, and leaves what was drawn before", () => {
    expect(addFreehandStroke(empty(), [{ x: 0, z: 0 }, { x: 0.1, z: 0 }], options)).toBeNull();
    const before: SketchProfile = { points: [{ id: "a", x: 0, z: 0 }, { id: "b", x: 5, z: 0 }], segments: [{ id: "s", startId: "a", endId: "b", kind: "line" }] };
    const result = addFreehandStroke(before, circle(10, 200), options)!;
    expect(result.profile.points.slice(0, 2)).toEqual(before.points);
    expect(result.profile.segments[0]).toEqual(before.segments[0]);
  });

  it("keeps an S-shaped scribble open instead of closing it across itself", () => {
    const s = Array.from({ length: 120 }, (_, i) => ({ x: i * 0.5, z: 10 * Math.sin(i / 10) }));
    const result = addFreehandStroke(empty(), s, options)!;
    expect(result.closed).toBe(false);
    // A C-shape still closes into a filled D.
    expect(addFreehandStroke(empty(), circle(20, 200, 0.5), options)!.closed).toBe(true);
  });

  it("spaces the points out instead of bunching them in the bends", () => {
    const wave = Array.from({ length: 400 }, (_, i) => ({ x: i * 0.25, z: 10 * Math.sin(i / 20) }));
    const result = addFreehandStroke(empty(), wave, { ...options, stroked: true })!;
    const pts = result.profile.points;
    const gaps = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.z - pts[i].z));
    // No two neighbours much closer than the spacing, so every point has room for its curve handles.
    expect(Math.min(...gaps)).toBeGreaterThan(Math.max(...gaps) / 6);
  });
});
