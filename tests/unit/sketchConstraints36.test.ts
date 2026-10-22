import { describe, expect, it } from "vitest";
import { addConstraint, constraintsOnSegment, liveConstraints, movedPointIds, solveSketchConstraints } from "@/lib/sketchConstraints";
import type { SketchProfile } from "@/types/layerling";

/** A four-sided outline a-b-c-d, a little off square. */
function quad(): SketchProfile {
  return {
    points: [
      { id: "a", x: 0, z: 0 },
      { id: "b", x: 40, z: 3 },
      { id: "c", x: 42, z: 28 },
      { id: "d", x: -2, z: 25 },
    ],
    segments: [
      { id: "ab", startId: "a", endId: "b" },
      { id: "bc", startId: "b", endId: "c" },
      { id: "cd", startId: "c", endId: "d" },
      { id: "da", startId: "d", endId: "a" },
    ],
  };
}
const at = (profile: SketchProfile, id: string) => profile.points.find((point) => point.id === id)!;
const length = (profile: SketchProfile, s: string, e: string) => Math.hypot(at(profile, e).x - at(profile, s).x, at(profile, e).z - at(profile, s).z);

describe("sketch constraints (build 36)", () => {
  it("makes a line horizontal and another vertical", () => {
    const base = quad();
    const profile = { ...base, constraints: [{ id: "1", kind: "horizontal" as const, segmentId: "ab" }, { id: "2", kind: "vertical" as const, segmentId: "bc" }] };
    const { profile: solved, satisfied } = solveSketchConstraints(profile);
    expect(satisfied).toBe(true);
    expect(at(solved, "a").z).toBeCloseTo(at(solved, "b").z, 5);
    expect(at(solved, "b").x).toBeCloseTo(at(solved, "c").x, 5);
  });

  it("keeps a fixed length, and keeps the point that was dragged where it was put", () => {
    const base = quad();
    const profile: SketchProfile = { ...base, constraints: [{ id: "1", kind: "length", segmentId: "ab", value: 30 }] };
    // b was just dragged: it stays, a follows along the line.
    const { profile: solved } = solveSketchConstraints(profile, new Set(["b"]));
    expect(length(solved, "a", "b")).toBeCloseTo(30, 5);
    expect(at(solved, "b").x).toBe(40);
    expect(at(solved, "b").z).toBe(3);
  });

  it("makes two lines parallel, at right angles, and of equal length", () => {
    const base = quad();
    const parallel = solveSketchConstraints({ ...base, constraints: [{ id: "1", kind: "parallel", a: "ab", b: "cd" }] }).profile;
    const v1 = { x: at(parallel, "b").x - at(parallel, "a").x, z: at(parallel, "b").z - at(parallel, "a").z };
    const v2 = { x: at(parallel, "d").x - at(parallel, "c").x, z: at(parallel, "d").z - at(parallel, "c").z };
    expect(Math.abs(v1.x * v2.z - v1.z * v2.x)).toBeLessThan(1e-3);
    const square = solveSketchConstraints({ ...base, constraints: [{ id: "1", kind: "perpendicular", a: "ab", b: "bc" }, { id: "2", kind: "equal", a: "ab", b: "bc" }] }).profile;
    const u = { x: at(square, "b").x - at(square, "a").x, z: at(square, "b").z - at(square, "a").z };
    const w = { x: at(square, "c").x - at(square, "b").x, z: at(square, "c").z - at(square, "b").z };
    expect(Math.abs(u.x * w.x + u.z * w.z) / (Math.hypot(u.x, u.z) * Math.hypot(w.x, w.z))).toBeLessThan(1e-4);
    expect(length(square, "a", "b")).toBeCloseTo(length(square, "b", "c"), 3);
  });

  it("holds a whole rectangle when one corner is dragged", () => {
    const base = quad();
    let constraints = addConstraint(base, { id: "1", kind: "horizontal", segmentId: "ab" });
    constraints = addConstraint({ ...base, constraints }, { id: "2", kind: "horizontal", segmentId: "cd" });
    constraints = addConstraint({ ...base, constraints }, { id: "3", kind: "vertical", segmentId: "bc" });
    constraints = addConstraint({ ...base, constraints }, { id: "4", kind: "vertical", segmentId: "da" });
    const rect = solveSketchConstraints({ ...base, constraints }).profile;
    // Drag c out to (60, 40).
    const dragged = { ...rect, points: rect.points.map((point) => (point.id === "c" ? { ...point, x: 60, z: 40 } : point)) };
    const { profile: solved, satisfied } = solveSketchConstraints(dragged, movedPointIds(rect, dragged));
    expect(satisfied).toBe(true);
    expect(at(solved, "c")).toMatchObject({ x: 60, z: 40 });
    expect(at(solved, "b").x).toBeCloseTo(60, 5);
    expect(at(solved, "d").z).toBeCloseTo(40, 5);
    expect(at(solved, "a").z).toBeCloseTo(at(solved, "b").z, 5);
    // The opposite corner stays where it was.
    expect(at(solved, "a").x).toBeCloseTo(at(rect, "a").x, 1);
    expect(at(solved, "a").z).toBeCloseTo(at(rect, "a").z, 1);
  });

  it("replaces a contradicting rule and drops rules of deleted lines", () => {
    const base = quad();
    const first = addConstraint(base, { id: "1", kind: "horizontal", segmentId: "ab" });
    const second = addConstraint({ ...base, constraints: first }, { id: "2", kind: "vertical", segmentId: "ab" });
    expect(second.map((c) => c.kind)).toEqual(["vertical"]);
    const withPair = addConstraint({ ...base, constraints: second }, { id: "3", kind: "equal", a: "ab", b: "cd" });
    expect(constraintsOnSegment({ ...base, constraints: withPair }, "cd")).toHaveLength(1);
    const deleted = { ...base, segments: base.segments.filter((segment) => segment.id !== "cd"), constraints: withPair };
    expect(liveConstraints(deleted).map((c) => c.id)).toEqual(["2"]);
  });

  it("moves curve handles with their point", () => {
    const base = quad();
    base.points[1] = { ...base.points[1], handleIn: { x: 35, z: 0 } };
    const { profile } = solveSketchConstraints({ ...base, constraints: [{ id: "1", kind: "horizontal", segmentId: "ab" }] }, new Set(["a"]));
    const b = at(profile, "b");
    expect(b.z).toBeCloseTo(0, 5);
    expect(b.handleIn!.z).toBeCloseTo(-3, 5);
  });

  it("holds an angle between two lines (build 37)", () => {
    const base = quad();
    const { profile, satisfied } = solveSketchConstraints({ ...base, constraints: [{ id: "1", kind: "angle", a: "ab", b: "bc", value: 60 }] });
    expect(satisfied).toBe(true);
    const u = { x: at(profile, "b").x - at(profile, "a").x, z: at(profile, "b").z - at(profile, "a").z };
    const w = { x: at(profile, "c").x - at(profile, "b").x, z: at(profile, "c").z - at(profile, "b").z };
    const angle = (Math.acos((u.x * w.x + u.z * w.z) / (Math.hypot(u.x, u.z) * Math.hypot(w.x, w.z))) * 180) / Math.PI;
    expect(angle).toBeCloseTo(60, 2);
  });

  it("keeps a point on a line, and two points mirrored about a line (build 37)", () => {
    const base: SketchProfile = {
      points: [
        { id: "s", x: 0, z: -20 }, { id: "t", x: 0, z: 20 },
        { id: "p", x: -10, z: 4 }, { id: "q", x: 13, z: 1 },
        { id: "r", x: 3, z: 9 },
      ],
      segments: [{ id: "axis", startId: "s", endId: "t" }, { id: "pq", startId: "p", endId: "q" }, { id: "qr", startId: "q", endId: "r" }],
    };
    const { profile, satisfied } = solveSketchConstraints({ ...base, constraints: [
      { id: "1", kind: "symmetric", p: "p", q: "q", segmentId: "axis" },
      { id: "2", kind: "pointOnLine", pointId: "r", segmentId: "axis" },
    ] }, new Set(["s", "t"]));
    expect(satisfied).toBe(true);
    expect(at(profile, "p").x).toBeCloseTo(-at(profile, "q").x, 4);
    expect(at(profile, "p").z).toBeCloseTo(at(profile, "q").z, 4);
    expect(at(profile, "r").x).toBeCloseTo(0, 4);
    // The axis was held where it was.
    expect(at(profile, "s")).toMatchObject({ x: 0, z: -20 });
  });
});
