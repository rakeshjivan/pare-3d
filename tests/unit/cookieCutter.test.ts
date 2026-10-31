import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { COOKIE_CUTTER_DEFAULTS, MAX_COOKIE_CUTTER_POINTS, cookieCutterProfiles, normalizeCookieCutterOptions, outlineFromLoops, unitedFootprint } from "@/lib/cookieCutter";
import type { SketchProfile } from "@/types/layerling";

const square: SketchProfile = {
  points: [[-10, -10], [10, -10], [10, 10], [-10, 10]].map(([x, z], index) => ({ id: `p${index}`, x, z, mode: "corner" as const })),
  segments: [0, 1, 2, 3].map((index) => ({ id: `s${index}`, startId: `p${index}`, endId: `p${(index + 1) % 4}`, kind: "line" as const })),
  // What a cutter drops from its source: a fill mode of its own and the key ring.
  stroke: { width: 3, align: "inside", join: "miter", cap: "flat" },
  keyring: { x: 0, z: 0, diameter: 4 } as SketchProfile["keyring"],
};

describe("cookie cutter", () => {
  it("builds the wall and the rim as lines outside the silhouette of the same outline", () => {
    const { wall, rim } = cookieCutterProfiles(square, { ...COOKIE_CUTTER_DEFAULTS, mirror: false });
    for (const profile of [wall, rim]) {
      expect(profile.silhouette).toBe(true);
      expect(profile.stroke?.align).toBe("outside");
      expect(profile.points).toEqual(square.points.map((point) => ({ ...point })));
      expect(profile.segments).toEqual(square.segments.map((segment) => ({ ...segment })));
      expect(profile.keyring).toBeUndefined();
    }
    expect(wall.stroke?.width).toBeCloseTo(COOKIE_CUTTER_DEFAULTS.wall, 9);
    // The rim's line also covers the wall's, so the wall stands on it.
    expect(rim.stroke?.width).toBeCloseTo(COOKIE_CUTTER_DEFAULTS.wall + COOKIE_CUTTER_DEFAULTS.rim, 9);
    // Only the wall cuts: its top runs in to the edge, the rim stays flat.
    expect(wall.stroke?.edge).toBeCloseTo(COOKIE_CUTTER_DEFAULTS.edge, 9);
    expect(rim.stroke?.edge).toBeUndefined();
  });

  it("mirrors the outline left to right by default, the curves' handles with their points (#982)", () => {
    const letter: SketchProfile = {
      points: [
        { id: "a", x: 2, z: -5, mode: "corner" },
        { id: "b", x: 9, z: 0, mode: "smooth", handleIn: { x: 9, z: -3 }, handleOut: { x: 9, z: 3 } },
        { id: "c", x: 2, z: 5, mode: "corner" },
      ],
      segments: [
        { id: "s0", startId: "a", endId: "b", kind: "bezier" },
        { id: "s1", startId: "b", endId: "c", kind: "bezier" },
        { id: "s2", startId: "c", endId: "a", kind: "line" },
      ],
    };
    const { wall, rim } = cookieCutterProfiles(letter, COOKIE_CUTTER_DEFAULTS);
    for (const profile of [wall, rim]) {
      expect(profile.points.map((point) => [point.x, point.z])).toEqual([[-2, -5], [-9, 0], [-2, 5]]);
      expect(profile.points[1].handleIn).toEqual({ x: -9, z: -3 });
      expect(profile.points[1].handleOut).toEqual({ x: -9, z: 3 });
      expect(profile.segments).toEqual(letter.segments);
    }
    expect(cookieCutterProfiles(letter, { ...COOKIE_CUTTER_DEFAULTS, mirror: false }).wall.points.map((point) => point.x)).toEqual([2, 9, 2]);
  });

  it("gives the wall a flat top for an edge of 0, or one as wide as the wall", () => {
    expect(cookieCutterProfiles(square, normalizeCookieCutterOptions({ edge: 0 })).wall.stroke?.edge).toBeUndefined();
    expect(normalizeCookieCutterOptions({ wall: 1, edge: 1.5 }).edge).toBe(0);
    expect(normalizeCookieCutterOptions({ wall: 2, edge: 0.6 }).edge).toBe(0.6);
  });

  it("leaves the sketch it is made from as it was", () => {
    const before = JSON.stringify(square);
    cookieCutterProfiles(square, COOKIE_CUTTER_DEFAULTS);
    expect(JSON.stringify(square)).toBe(before);
  });

  it("takes the options as given within their limits, and the nearest allowed value outside", () => {
    expect(normalizeCookieCutterOptions()).toEqual(COOKIE_CUTTER_DEFAULTS);
    expect(normalizeCookieCutterOptions({ wall: 2, height: 20, rim: 6, rimHeight: 3, edge: 0.8, mirror: false })).toEqual({ wall: 2, height: 20, rim: 6, rimHeight: 3, edge: 0.8, mirror: false });
    expect(normalizeCookieCutterOptions({ mirror: "no" }).mirror).toBe(true);
    expect(normalizeCookieCutterOptions({ wall: 0, height: 5000, rim: -1 })).toMatchObject({ wall: 0.4, height: 100, rim: 0.5 });
    expect(normalizeCookieCutterOptions({ wall: "abc", height: "", rim: null })).toEqual(COOKIE_CUTTER_DEFAULTS);
    expect(normalizeCookieCutterOptions({ wall: "1.5" }).wall).toBe(1.5);
  });

  it("keeps the rim no higher than the cutter", () => {
    expect(normalizeCookieCutterOptions({ height: 3, rimHeight: 10 }).rimHeight).toBe(3);
  });
});

describe("outline of what a body stands on", () => {
  const ring = (cx: number, cv: number, half: number) => ({
    closed: true,
    points: [[-half, -half], [half, -half], [half, half], [-half, half]].map(([u, v]) => ({ u: cx + u, v: cv + v })),
  });

  it("is a sketch round the middle of the box, and that middle in the world", () => {
    const outline = outlineFromLoops([ring(30, -12, 10)]);
    expect(outline?.x).toBeCloseTo(30, 9);
    expect(outline?.z).toBeCloseTo(-12, 9);
    expect(outline?.profile.points).toHaveLength(4);
    expect(outline?.profile.segments).toHaveLength(4);
    expect(Math.min(...outline!.profile.points.map((point) => point.x))).toBeCloseTo(-10, 9);
    expect(Math.max(...outline!.profile.points.map((point) => point.z))).toBeCloseTo(10, 9);
  });

  it("joins every outline as one sketch, ring after ring, and leaves open lines and specks out", () => {
    const outline = outlineFromLoops([ring(0, 0, 10), ring(0, 0, 4), { closed: false, points: [{ u: 0, v: 0 }, { u: 5, v: 5 }, { u: 9, v: 1 }] }, { closed: true, points: [{ u: 0, v: 0 }, { u: 0.01, v: 0 }, { u: 0, v: 0.01 }] }]);
    expect(outline?.profile.points).toHaveLength(8);
    expect(new Set(outline?.profile.points.map((point) => point.id)).size).toBe(8);
    // Each segment joins two points of the sketch.
    const ids = new Set(outline?.profile.points.map((point) => point.id));
    expect(outline?.profile.segments.every((segment) => ids.has(segment.startId) && ids.has(segment.endId))).toBe(true);
  });

  it("drops a point that lies on the one before, and the last one when it closes onto the first", () => {
    const outline = outlineFromLoops([{ closed: true, points: [{ u: 0, v: 0 }, { u: 0.01, v: 0 }, { u: 10, v: 0 }, { u: 10, v: 10 }, { u: 0, v: 10 }, { u: 0, v: 0.02 }] }]);
    expect(outline?.profile.points).toHaveLength(4);
  });

  it("is null without a closed outline and refuses one that is too large", () => {
    expect(outlineFromLoops([])).toBeNull();
    expect(outlineFromLoops([{ closed: false, points: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }] }])).toBeNull();
    const many = { closed: true, points: Array.from({ length: MAX_COOKIE_CUTTER_POINTS + 10 }, (_, index) => ({ u: Math.cos(index) * 50 + index, v: Math.sin(index) * 50 })) };
    expect(() => outlineFromLoops([many])).toThrow();
  });
});

describe("what several bodies stand on together (#982)", () => {
  let runtime: ManifoldToplevel;
  beforeAll(async () => {
    runtime = await manifoldModule();
    runtime.setup();
  });

  const square = (cu: number, cv: number, half: number, clockwise = false) => {
    const points = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([u, v]) => ({ u: cu + u, v: cv + v }));
    return { closed: true, points: clockwise ? points.reverse() : points };
  };
  const area = (loop: { points: ReadonlyArray<{ u: number; v: number }> }) =>
    Math.abs(loop.points.reduce((sum, point, index, all) => {
      const next = all[(index + 1) % all.length];
      return sum + point.u * next.v - next.u * point.v;
    }, 0) / 2);

  it("joins two bodies that overlap into one outline round both", () => {
    // A box and a second box over its corner, as a box and a cylinder were in the report: one outline, not two crossing.
    const loops = unitedFootprint(runtime, [[square(0, 0, 10)], [square(15, 0, 10)]]);
    expect(loops).toHaveLength(1);
    expect(area(loops[0])).toBeCloseTo(20 * 35, 6);
  });

  it("keeps bodies apart that do not touch, and a hole inside a body, whichever way its outlines run", () => {
    const loops = unitedFootprint(runtime, [[square(0, 0, 10), square(0, 0, 4)], [square(40, 0, 5, true)]]);
    expect(loops).toHaveLength(3);
    expect(loops.map(area).sort((a, b) => a - b)).toEqual([expect.closeTo(64, 6), expect.closeTo(100, 6), expect.closeTo(400, 6)]);
  });

  it("leaves out open lines and gives nothing for nothing", () => {
    expect(unitedFootprint(runtime, [[{ closed: false, points: [{ u: 0, v: 0 }, { u: 5, v: 0 }, { u: 5, v: 5 }] }]])).toEqual([]);
    expect(unitedFootprint(runtime, [])).toEqual([]);
  });
});
