import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { cadModifierGridfinityForShape } from "@/lib/cadProfileExtrusion";
import { editorHistoryEntry } from "@/lib/editorHistory";
import { meshForShape } from "@/lib/editorMeshCore";
import { mcpShapeSummary } from "@/lib/editorMcpSummary";
import { exportLylProject, importLylProject } from "@/lib/lylProject";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";
import { mcpGridfinityListParams } from "@/lib/mcpShapeSettings";
import { makeShapeFromAsset, sceneShape, toolbarShapeAssets } from "@/lib/shapeCatalog";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE, normalizeShapeCustomizations } from "@/lib/workplaneSettings";
import { shapeDefaultsFromShape } from "@/lib/shapeDefaults";
import { canonicalizeShape, workplaneShapesEqual } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";
import {
  GRIDFINITY_LABEL_WALL_KEYS,
  GRIDFINITY_LIP_HEIGHT,
  GRIDFINITY_SCOOP_WALL_KEYS,
  type GridfinityLabelCornerShape,
  type GridfinityLabelProfile,
  createGridfinityGeometry,
  gridfinityCompartmentCount,
  gridfinityCompartmentCountPatch,
  gridfinityCompartmentCornerSize,
  gridfinityCompartmentCutBound,
  gridfinityCompartmentFloorBound,
  gridfinityCompartmentLabel,
  gridfinityCompartmentLabelMaxWidth,
  gridfinityCompartmentMax,
  gridfinityCompartmentPieces,
  gridfinityCompartments,
  gridfinityDividerBound,
  gridfinityDividerFits,
  gridfinityDividerLimits,
  gridfinityDividerPositionPatch,
  gridfinityDividerPositions,
  gridfinityDividerThickness,
  gridfinityFloorFits,
  gridfinityFloorHeight,
  gridfinityFloorMaxHeight,
  gridfinityFootprintPatch,
  gridfinityLabelCornerSize,
  gridfinityLabelFits,
  gridfinityLabelLength,
  gridfinityLabelLimits,
  gridfinityLabelledTriangles,
  gridfinityLabelPieces,
  gridfinityListPatch,
  gridfinityPlan,
  gridfinityScoopFits,
  gridfinityScoopPieces,
  gridfinityScoopRadius,
  gridfinityScoopsLeftOut,
  gridfinityShapePatch,
  gridfinityTriangles,
  gridfinityUnitCompartments,
  gridfinityUnits,
  normalizeGridfinityCompartmentLabels,
  normalizeGridfinityDividerPositions,
} from "@/lib/gridfinityGeometry";

type V = [number, number, number];

function weld(triangles: V[][]) {
  const ids = new Map<string, number>();
  const id = (v: V) => {
    const key = v.map((n) => Math.round(n * 1e5)).join(",");
    if (!ids.has(key)) ids.set(key, ids.size);
    return ids.get(key)!;
  };
  return triangles.map((t) => t.map(id) as [number, number, number]);
}

/** Every directed edge appears once and its reverse once: closed, consistently wound, two-manifold. */
function edgeProblems(triangles: V[][]) {
  const faces = weld(triangles);
  const directed = new Map<string, number>();
  faces.forEach(([a, b, c]) => {
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      if (p === q) continue;
      const key = `${p}>${q}`;
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
  });
  let problems = 0;
  directed.forEach((count, key) => {
    const [p, q] = key.split(">");
    if (count !== 1 || directed.get(`${q}>${p}`) !== 1) problems += 1;
  });
  return problems;
}

function signedVolume(triangles: V[][]) {
  return triangles.reduce((sum, [a, b, c]) => sum + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6, 0);
}

function components(triangles: V[][]) {
  const faces = weld(triangles);
  const parent = new Map<number, number>();
  const find = (x: number): number => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  faces.forEach(([a, b, c]) => { parent.set(find(b), find(a)); parent.set(find(c), find(a)); });
  return new Set(faces.map(([a]) => find(a))).size;
}

function bounds(triangles: V[][]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  triangles.flat().forEach((v) => v.forEach((n, i) => { min[i] = Math.min(min[i], n); max[i] = Math.max(max[i], n); }));
  return { min, max };
}

/** Where the solid is along x at height y, on the line z = 0.5 (clear of the mesh's own vertices): the x of every wall the line crosses. */
function crossings(triangles: V[][], y: number, z = 0.5) {
  const xs: number[] = [];
  triangles.forEach((t) => {
    const points: Array<[number, number]> = [];
    for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      if ((a[2] - z) * (b[2] - z) < 0) {
        const s = (z - a[2]) / (b[2] - a[2]);
        points.push([a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1])]);
      }
    }
    if (points.length === 2) {
      const [[x1, y1], [x2, y2]] = points;
      if ((y1 - y) * (y2 - y) < 0) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
  });
  return xs.sort((a, b) => a - b);
}

const bin = (fields: Record<string, unknown> = {}) => ({ width: 83.5, depth: 41.5, height: 21 + GRIDFINITY_LIP_HEIGHT, gridfinityType: "bin" as const, gridfinityLip: true, ...fields });
const plate = (fields: Record<string, unknown> = {}) => ({ width: 84, depth: 42, height: 5, gridfinityType: "baseplate" as const, ...fields });
/** A bin of 2 x 2 x 3 units: 81.6 mm inside both ways. */
const square = { width: 83.5, depth: 83.5 };
const piecesOf = (fields: Record<string, unknown>) => gridfinityLabelPieces(bin(fields))!;

type LabelPieces = ReturnType<typeof piecesOf>;

/** Where the corner pieces stand, [x, z] each. */
function cornersAt(pieces: LabelPieces) {
  return pieces.corners.map(({ at }) => [at.x, at.z].map((n) => Number(n.toFixed(9))));
}

/** The corner piece standing at (x, z), if there is one. */
function cornerAt(pieces: LabelPieces, x: number, z: number) {
  return pieces.corners.find(({ at }) => Math.abs(at.x - x) < 1e-9 && Math.abs(at.z - z) < 1e-9);
}

/** A bin of 2 x 1 x 3 units as the editor keeps it. */
function binShape(fields: Record<string, unknown>) {
  return { id: "g", name: "bin", kind: "gridfinity", x: 0, z: 0, elevation: 0, size: 83.5, width: 83.5, depth: 41.5, height: 25.4, rotation: 0, color: "#4f7fa8", gridfinityType: "bin", ...fields } as WorkplaneShape;
}

describe("gridfinity sizes", () => {
  it("takes the grid units from the size: 42 mm a unit, a bin 0.5 mm smaller, 7 mm a height unit", () => {
    expect(gridfinityUnits(bin())).toEqual({ x: 2, z: 1, y: 3 });
    expect(gridfinityUnits(plate())).toEqual({ x: 2, z: 1, y: 1 });
    expect(gridfinityUnits(bin({ width: 125.5, depth: 125.5, height: 42, gridfinityLip: false }))).toEqual({ x: 3, z: 3, y: 6 });
  });

  it("snaps a dragged size to whole units and keeps them between 1 and 6 across", () => {
    expect(gridfinityFootprintPatch(bin({ width: 100, depth: 30, height: 30 }))).toEqual({ width: 83.5, depth: 41.5, height: 28 + GRIDFINITY_LIP_HEIGHT });
    expect(gridfinityFootprintPatch(bin({ width: 1000, depth: 1, height: 1 }))).toEqual({ width: 251.5, depth: 41.5, height: 7 + GRIDFINITY_LIP_HEIGHT });
    expect(gridfinityFootprintPatch(plate({ width: 130, depth: 40, height: 20 }))).toEqual({ width: 126, depth: 42, height: 5 });
  });

  it("is 7 mm a unit tall, and the stacking lip adds 4.4 mm: a 3 unit bin is 25.4 mm", () => {
    expect(gridfinityFootprintPatch(bin({ gridfinityLip: false, height: 21 })).height).toBe(21);
    expect(gridfinityFootprintPatch(bin()).height).toBeCloseTo(25.4, 9);
  });

  it("writes the box of whole units for a change of type, units or lip", () => {
    expect(gridfinityShapePatch(bin(), { x: 3 })).toEqual({ gridfinityType: "bin", gridfinityLip: true, width: 125.5, depth: 41.5, height: 21 + GRIDFINITY_LIP_HEIGHT });
    expect(gridfinityShapePatch(bin(), { lip: false })).toMatchObject({ gridfinityLip: false, height: 21 });
    expect(gridfinityShapePatch(bin(), { type: "baseplate" })).toMatchObject({ gridfinityType: "baseplate", width: 84, depth: 42, height: 5 });
    // A baseplate has no height units; turned into a bin it gets the default three.
    expect(gridfinityShapePatch(plate(), { type: "bin" })).toMatchObject({ gridfinityType: "bin", width: 83.5, depth: 41.5, height: 21 + GRIDFINITY_LIP_HEIGHT });
    expect(gridfinityShapePatch(bin(), { x: 9, y: 0 })).toMatchObject({ width: 251.5, height: 7 + GRIDFINITY_LIP_HEIGHT });
  });

  it("keeps the height units when only the lip is switched", () => {
    expect(gridfinityFootprintPatch(bin({ gridfinityLip: false })).height).toBe(21);
    expect(gridfinityFootprintPatch(bin({ gridfinityLip: true, height: 21 })).height).toBeCloseTo(25.4, 9);
    for (let y = 1; y <= 20; y += 1) {
      expect(gridfinityUnits(bin({ height: 7 * y, gridfinityLip: true })).y).toBe(y);
      expect(gridfinityUnits(bin({ height: 7 * y + GRIDFINITY_LIP_HEIGHT, gridfinityLip: false })).y).toBe(y);
    }
  });
});

describe("gridfinity bin", () => {
  it("is closed, wound outwards and one piece, with and without lip and magnet holes", () => {
    for (const fields of [{}, { gridfinityLip: false }, { gridfinityMagnets: true }, { width: 41.5, depth: 41.5, height: 7 + GRIDFINITY_LIP_HEIGHT }, { width: 125.5, depth: 83.5, height: 42, gridfinityLip: false, gridfinityMagnets: true }]) {
      const triangles = gridfinityTriangles(bin(fields));
      expect(edgeProblems(triangles)).toBe(0);
      expect(signedVolume(triangles)).toBeGreaterThan(0);
      expect(components(triangles)).toBe(1);
    }
  });

  it("stands on y = 0 and fills its box exactly", () => {
    const { min, max } = bounds(gridfinityTriangles(bin()));
    expect(min[0]).toBeCloseTo(-41.75, 6);
    expect(max[0]).toBeCloseTo(41.75, 6);
    expect(min[2]).toBeCloseTo(-20.75, 6);
    expect(max[2]).toBeCloseTo(20.75, 6);
    expect(min[1]).toBeCloseTo(0, 6);
    expect(max[1]).toBeCloseTo(21 + GRIDFINITY_LIP_HEIGHT, 3);
  });

  it("has the specification's foot: 0.8 at 45 degrees, 1.8 straight, 2.15 at 45 degrees", () => {
    const triangles = gridfinityTriangles(bin({ width: 41.5, depth: 41.5 }));
    // The outer wall on the line z = 0, measured in from the bin's side at x = -20.75.
    const inset = (y: number) => crossings(triangles, y)[0] + 20.75;
    expect(inset(0.4)).toBeCloseTo(2.55, 6);
    expect(inset(1.7)).toBeCloseTo(2.15, 6);
    expect(inset(3.675)).toBeCloseTo(1.075, 6);
    expect(inset(6)).toBeCloseTo(0, 6);
  });

  it("has the specification's lip: in 0.7 at 45 degrees, 1.8 straight, then 45 degrees up to a sharp top on the outer wall", () => {
    const triangles = gridfinityTriangles(bin({ width: 41.5, depth: 41.5 }));
    const innerWall = (y: number) => crossings(triangles, y)[1] + 20.75;
    expect(innerWall(21.35)).toBeCloseTo(2.25, 6);
    expect(innerWall(22.6)).toBeCloseTo(1.9, 6);
    expect(innerWall(24.4)).toBeCloseTo(1, 6);
    expect(innerWall(25.3)).toBeCloseTo(0.1, 6);
  });

  it("runs the lip's support down to the floor in a bin of one height unit, which has no straight wall inside", () => {
    // Floor at 4.75 + 1.2 = 5.95; the support slopes in 45 degrees from 2.6 at the top (7) down to 1.55 at the floor.
    const triangles = gridfinityTriangles(bin({ width: 41.5, depth: 41.5, height: 7 + GRIDFINITY_LIP_HEIGHT }));
    const innerWall = (y: number) => crossings(triangles, y)[1] + 20.75;
    expect(innerWall(6.3)).toBeCloseTo(1.9, 6);
    expect(innerWall(6.8)).toBeCloseTo(2.4, 6);
    // Under the floor the bin is solid: only its two outer walls, no wall folded back below the floor.
    expect(crossings(triangles, 5.6)).toHaveLength(2);
  });

  it("puts a magnet hole 6.5 mm wide 13 mm from each unit's middle, both ways", () => {
    const plan = gridfinityPlan(bin({ gridfinityMagnets: true }));
    expect(plan.magnetHoles).toHaveLength(8);
    expect(plan.magnetHoles).toContainEqual({ x: -21 - 13, z: -13 });
    expect(plan.magnetHoles).toContainEqual({ x: 21 + 13, z: 13 });
    const triangles = gridfinityTriangles(bin({ width: 41.5, depth: 41.5, gridfinityMagnets: true }));
    // On the line z = 13.5 at y = 1 the hole is open for its chord there: 13 -+ sqrt(3.25^2 - 0.5^2).
    const xs = crossings(triangles, 1, 13.5).filter((x) => x > 5 && x < 18);
    expect(xs[0]).toBeCloseTo(13 - Math.sqrt(3.25 ** 2 - 0.25), 1);
    expect(xs[1]).toBeCloseTo(13 + Math.sqrt(3.25 ** 2 - 0.25), 1);
  });
});

describe("gridfinity baseplate", () => {
  it("is closed, wound outwards and one piece", () => {
    for (const fields of [{}, { width: 42, depth: 42 }, { width: 252, depth: 126 }]) {
      const triangles = gridfinityTriangles(plate(fields));
      expect(edgeProblems(triangles)).toBe(0);
      expect(signedVolume(triangles)).toBeGreaterThan(0);
      expect(components(triangles)).toBe(1);
    }
  });

  it("is 5 mm tall: the specification's 0.7, 1.8 and 2.15 on a 0.35 mm band", () => {
    const triangles = gridfinityTriangles(plate());
    const { min, max } = bounds(triangles);
    expect(max[0] - min[0]).toBeCloseTo(84, 6);
    expect(max[1]).toBeCloseTo(5, 6);
    // The ridge between the two sockets at x = 0: its right face, measured from the grid line.
    const ridge = (y: number) => crossings(triangles, y).filter((x) => x > 0 && x < 5)[0];
    expect(ridge(0.2)).toBeCloseTo(2.85, 6);
    expect(ridge(0.7)).toBeCloseTo(2.5, 6);
    expect(ridge(2)).toBeCloseTo(2.15, 6);
    expect(ridge(4)).toBeCloseTo(1, 6);
  });

  it("leaves 0.25 mm all round the feet of a bin resting 0.25 mm up on the ridges between the sockets", () => {
    const binWall = (y: number) => crossings(gridfinityTriangles(bin({ width: 41.5, depth: 41.5 })), y)[0] + 21;
    const plateWall = (y: number) => crossings(gridfinityTriangles(plate({ width: 42, depth: 42 })), y)[1] + 21;
    // At the plate's height y the seated bin is at its own height y - 0.25: on both slopes and the straight part.
    for (const y of [0.75, 2, 4]) expect(binWall(y - 0.25) - plateWall(y)).toBeCloseTo(0.25, 6);
  });
});

describe("gridfinity label shelf", () => {
  let runtime: ManifoldToplevel;

  beforeAll(async () => {
    runtime = await manifoldModule();
    runtime.setup();
  });

  it("leaves a bin without shelves, or one too low for them, exactly as it was", () => {
    expect(gridfinityLabelledTriangles(runtime, bin())).toEqual(gridfinityTriangles(bin()));
    const low = bin({ height: 14 + GRIDFINITY_LIP_HEIGHT, gridfinityLabelBack: true });
    expect(gridfinityLabelPieces(low)).toBeNull();
    expect(gridfinityLabelledTriangles(runtime, low)).toEqual(gridfinityTriangles(low));
    expect(gridfinityLabelPieces(plate({ gridfinityLabelBack: true }))).toBeNull();
  });

  it("is closed, wound outwards and one piece on any walls, full or a set length, round, chamfered or sharp", () => {
    const big = { width: 125.5, depth: 83.5, height: 42 + GRIDFINITY_LIP_HEIGHT };
    for (const fields of [
      { gridfinityLabelBack: true },
      { gridfinityLabelBack: true, gridfinityLabelLeft: true },
      { gridfinityLabelBack: true, gridfinityLabelFront: true, gridfinityLabelLeft: true, gridfinityLabelRight: true },
      { gridfinityLabelFront: true, gridfinityLabelFrontLength: 36, gridfinityLabelFrontOffset: -10 },
      { gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelRight: true, gridfinityLabelCorner: "chamfer" },
      { gridfinityLabelBack: true, gridfinityLabelCornerSize: 0 },
      { ...big, gridfinityLabelBack: true, gridfinityLabelFront: true, gridfinityLabelLeft: true, gridfinityLabelRight: true, gridfinityLabelCornerSize: 2 },
      { ...big, gridfinityLabelRight: true, gridfinityLabelRightLength: 30, gridfinityLabelRightOffset: 100, gridfinityMagnets: true },
      { gridfinityLabelFront: true, gridfinityLabelFrontLength: 36, gridfinityLabelFrontOffset: -10, gridfinityLabelCorner: "chamfer" },
      { gridfinityLabelBack: true, gridfinityLabelBackWidth: 30 },
      { gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelBackWidth: 6, gridfinityLabelLeftWidth: 16 },
      { gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelBackWidth: 6, gridfinityLabelLeftWidth: 16, gridfinityLabelCorner: "chamfer" },
      { gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelBackWidth: 6, gridfinityLabelLeftWidth: 16, gridfinityLabelBackLength: 36 },
      { gridfinityLabelBack: true, gridfinityLip: false },
      { width: 251.5, depth: 251.5, gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelBackWidth: 17, gridfinityLabelLeftWidth: 4, gridfinityLabelCorner: "chamfer" },
      { width: 125.5, depth: 83.5, gridfinityLabelBack: true, gridfinityLabelFront: true, gridfinityLabelLeft: true, gridfinityLabelRight: true, gridfinityLabelFrontWidth: 9, gridfinityLabelRightWidth: 30 },
      {
        ...big,
        height: 70 + GRIDFINITY_LIP_HEIGHT,
        gridfinityLabelBack: true,
        gridfinityLabelRight: true,
        gridfinityLabelBackWidth: 1000,
        gridfinityLabelBackLength: 34,
        gridfinityLabelBackOffset: 30,
        gridfinityLabelRightWidth: 1000,
        gridfinityLabelRightLength: 10,
        gridfinityLabelRightOffset: -66,
        gridfinityLabelCorner: "chamfer",
        gridfinityLabelCornerSize: 10,
      },
      { gridfinityLabelBack: true, gridfinityLabelBackLength: 10, gridfinityLabelCornerSize: 10 },
      { gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelBackLength: 15, gridfinityLabelBackOffset: -100, gridfinityLabelLeftLength: 15, gridfinityLabelLeftOffset: -100, gridfinityLabelCornerSize: 4 },
      { gridfinityLabelBack: true, gridfinityLabelBackLength: 10, gridfinityLabelBackOffset: 100, gridfinityLabelCornerSize: 10 },
    ]) {
      const triangles = gridfinityLabelledTriangles(runtime, bin(fields));
      expect(edgeProblems(triangles)).toBe(0);
      expect(signedVolume(triangles)).toBeGreaterThan(signedVolume(gridfinityTriangles(bin(fields))));
      expect(components(triangles)).toBe(1);
    }
  });

  it("has a flat top 0.85 mm under the wall's top, a 1.2 mm strip at the front and an underside rising at 36 degrees", () => {
    // A 10 mm shelf on the left wall of a bin of 3 units: the inner wall at x = -41.75 + 0.95 = -40.8,
    // the top at 21 - 0.85 = 20.15, the strip down to 18.95, the underside back to the wall at 18.95 - 10 tan 36.
    const rise = Math.tan((36 * Math.PI) / 180);
    const bottom = 18.95 - 10 * rise;
    const triangles = gridfinityLabelledTriangles(runtime, bin({ gridfinityLabelLeft: true, gridfinityLabelLeftWidth: 10, gridfinityLabelCornerSize: 0 }));
    const front = (y: number) => crossings(triangles, y)[1];
    // The display mesh moves the shelf pieces by a few thousandths of a millimetre (LABEL_MESH_NUDGE_X and so on).
    expect(front(20)).toBeCloseTo(-30.8, 2);
    expect(front(19.5)).toBeCloseTo(-30.8, 2);
    expect(front(16)).toBeCloseTo(-40.8 + (16 - bottom) / rise, 2);
    expect(front(13)).toBeCloseTo(-40.8 + (13 - bottom) / rise, 2);
    expect(front(bottom - 1)).toBeCloseTo(-40.8, 5);
    // Above the top only the lip's support, 0.95 + (20.3 - 19.35) in from the outer wall.
    expect(front(20.3)).toBeCloseTo(-41.75 + 0.95 + 0.95, 5);
  });

  it("is no wider than the bin's height allows: its underside ends 0.5 mm above the floor", () => {
    // 3 units: (21 - 0.85 - 1.2 - 5.95 - 0.5) / tan 36 = 12.5 / 0.7265 = 17.2 mm, so the 14 mm default fits.
    const rise = Math.tan((36 * Math.PI) / 180);
    expect(gridfinityLabelPieces(bin({ gridfinityLabelBack: true, gridfinityLabelBackWidth: 30 }))!.shelves[0].profile.width).toBeCloseTo(12.5 / rise, 9);
    expect(gridfinityLabelPieces(bin({ gridfinityLabelBack: true }))!.shelves[0].profile.width).toBe(14);
    expect(gridfinityLabelPieces(bin({ gridfinityLabelBack: true, gridfinityLabelBackWidth: 1 }))!.shelves[0].profile.width).toBe(4);
  });

  it("leaves at least 2 mm open across the bin, between facing shelves and their corner pieces", () => {
    // A bin of 1 x 1 x 6 units would take 46 mm by its height; inside it is 39.6 mm across, so with
    // shelves facing each other and the default 2 mm corners each takes at most 19.8 - 1 - 2 = 16.8, a lone one 39.6 - 2 - 2 = 35.6.
    const tall = { width: 41.5, depth: 41.5, height: 42 + GRIDFINITY_LIP_HEIGHT, gridfinityLabelBackWidth: 40, gridfinityLabelFrontWidth: 40, gridfinityLabelLeftWidth: 40, gridfinityLabelRightWidth: 40 };
    expect(gridfinityLabelPieces(bin({ ...tall, gridfinityLabelBack: true, gridfinityLabelFront: true }))!.shelves[0].profile.width).toBeCloseTo(16.8, 9);
    expect(gridfinityLabelPieces(bin({ ...tall, gridfinityLabelBack: true }))!.shelves[0].profile.width).toBeCloseTo(35.6, 9);
    // All four walls at the widest, 1 x 1, 2 x 1 and 6 x 6, rounded and chamfered: still one piece, closed,
    // with no pocket closed off inside and no two corner pieces touching across the gap.
    const widest = {
      gridfinityLabelBack: true,
      gridfinityLabelFront: true,
      gridfinityLabelLeft: true,
      gridfinityLabelRight: true,
      gridfinityLabelBackWidth: 1000,
      gridfinityLabelFrontWidth: 1000,
      gridfinityLabelLeftWidth: 1000,
      gridfinityLabelRightWidth: 1000,
    };
    for (const size of [{ width: 41.5, depth: 41.5 }, { width: 83.5, depth: 41.5, height: 21 + GRIDFINITY_LIP_HEIGHT }, { width: 251.5, depth: 251.5, height: 140 + GRIDFINITY_LIP_HEIGHT }]) {
      for (const [gridfinityLabelCorner, gridfinityLabelCornerSize] of [["round", 2], ["chamfer", 2], ["round", 5], ["chamfer", 5], ["round", 10], ["chamfer", 10]] as const) {
        const triangles = gridfinityLabelledTriangles(runtime, bin({ ...tall, ...size, ...widest, gridfinityLabelCorner, gridfinityLabelCornerSize }));
        expect(edgeProblems(triangles)).toBe(0);
        expect(components(triangles)).toBe(1);
      }
    }
  });

  it("moves a set length along the editor's axes: right on the back and front walls, towards the front on the sides", () => {
    // 20 mm moved 10 mm: on the back wall u runs with x, on the front wall against it, so both end up at x 0 to 20.
    const pieces = piecesOf({
      gridfinityLabelBack: true,
      gridfinityLabelFront: true,
      gridfinityLabelLeft: true,
      gridfinityLabelRight: true,
      gridfinityLabelBackLength: 20,
      gridfinityLabelBackOffset: 10,
      gridfinityLabelFrontLength: 20,
      gridfinityLabelFrontOffset: 10,
      gridfinityLabelLeftLength: 20,
      gridfinityLabelLeftOffset: 10,
      gridfinityLabelRightLength: 20,
      gridfinityLabelRightOffset: 10,
    });
    const [back, front, left, right] = pieces.shelves.map(({ profile }) => profile);
    expect([back.from, back.to]).toEqual([0, 20]);
    expect([front.from, front.to]).toEqual([-20, 0]);
    // The side walls are 39.6 mm inside: a 20 mm shelf moves at most 9.8 mm, to the front wall (+z) on both,
    // and that end runs into the front wall. On the left wall u runs against z, on the right wall with it.
    expect([left.from, left.to].map((n) => Number(n.toFixed(9)))).toEqual([-20.8, 0.2]);
    expect([right.from, right.to].map((n) => Number(n.toFixed(9)))).toEqual([-0.2, 20.8]);
  });

  it("runs an end that stops less than 1 mm short of the wall into it, and a length that does so at both ends from wall to wall", () => {
    // 80.8 mm on the 81.6 mm back wall leaves 0.4 mm at each end: too narrow to print, so it is a full
    // shelf, with the corner pieces where it meets the side walls and no rounded ends.
    const pieces = gridfinityLabelPieces(bin({ gridfinityLabelBack: true, gridfinityLabelBackLength: 80.8 }))!;
    expect(pieces.shelves[0].notches).toHaveLength(0);
    expect(pieces.corners).toHaveLength(2);
    expect(pieces.shelves[0].profile.to - pieces.shelves[0].profile.from).toBeGreaterThan(81.6);
    // 30 mm moved so its left end stops 0.5 mm short runs into the left wall there and keeps its right end.
    const oneEnd = gridfinityLabelPieces(bin({ gridfinityLabelBack: true, gridfinityLabelBackLength: 30, gridfinityLabelBackOffset: -25.3 }))!.shelves[0];
    expect(oneEnd.profile.from).toBeCloseTo(-41.8, 9);
    expect(oneEnd.profile.to).toBeCloseTo(-10.3, 9);
    expect(oneEnd.notches).toHaveLength(1);
    // A length of 0.2 mm is taken as the shortest shelf, 10 mm.
    const short = gridfinityLabelPieces(bin({ gridfinityLabelBack: true, gridfinityLabelBackLength: 0.2 }))!.shelves[0].profile;
    expect(short.to - short.from).toBeCloseTo(10, 9);
  });

  it("offers a length up to the wall's own, a width up to the bin across it, and moves a shelf only as far as its wall allows", () => {
    // Back wall 81.6 mm, left wall 39.6 mm: a 30 mm shelf moves 81.6 / 2 - 15 = 25.8 mm on the back wall, offered as 25 mm.
    expect(gridfinityLabelLimits(bin({ gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelBackLength: 30 }), "back")).toEqual({ length: 81.6, offset: 25, across: 39.6 });
    // On the left wall the length goes up to that wall's 39.6 mm.
    expect(gridfinityLabelLimits(bin({ gridfinityLabelLeft: true, gridfinityLabelLeftLength: 30 }), "left")).toEqual({ length: 39.6, offset: 4, across: 81.6 });
    // A length the shelf runs wall to wall with, 80 mm on the 81.6 mm wall, has nothing to move;
    // 5 mm is built as 10 mm and moves as that.
    expect(gridfinityLabelLimits(bin({ gridfinityLabelBack: true, gridfinityLabelBackLength: 80 }), "back").offset).toBe(0);
    expect(gridfinityLabelLength(bin({ gridfinityLabelBack: true, gridfinityLabelBackLength: 5 }), "back")).toBe(10);
    expect(gridfinityLabelLimits(bin({ gridfinityLabelBack: true, gridfinityLabelBackLength: 5 }), "back").offset).toBe(35);
  });

  it("gives each wall its own width and length: a full 16 mm shelf on the left beside a 36 mm one of 6 mm at the back", () => {
    const pieces = gridfinityLabelPieces(bin({ gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelBackWidth: 6, gridfinityLabelBackLength: 36, gridfinityLabelLeftWidth: 16 }))!;
    const [back, left] = pieces.shelves.map(({ profile }) => profile);
    expect(back.width).toBe(6);
    expect(back.to - back.from).toBeCloseTo(36, 9);
    expect(left.width).toBe(16);
    // The left shelf runs wall to wall: 39.6 mm inside, and 1 mm past each end into the walls.
    expect(left.to - left.from).toBeCloseTo(41.6, 9);
  });

  it("gives each wall its own position", () => {
    // 20 mm on the back wall moved 10 mm to the right runs from x 0 to 20; on the front wall moved 5 mm to the left, from x -15 to 5.
    const fields = { gridfinityLabelBack: true, gridfinityLabelFront: true, gridfinityLabelBackLength: 20, gridfinityLabelBackOffset: 10, gridfinityLabelFrontLength: 20, gridfinityLabelFrontOffset: -5 };
    const [back, front] = piecesOf(fields).shelves.map(({ profile }) => profile);
    expect([back.from, back.to]).toEqual([0, 20]);
    expect([front.from, front.to]).toEqual([-5, 15]);
  });

  /** The welded mesh as a Manifold solid, merged as the editor merges a mesh for its booleans. */
  function solidOf(triangles: V[][]) {
    const vertProperties = new Float32Array(triangles.flat(2));
    const triVerts = new Uint32Array(triangles.flatMap((_, i) => [3 * i, 3 * i + 1, 3 * i + 2]));
    const mesh = new runtime.Mesh({ numProp: 3, vertProperties, triVerts, tolerance: 1e-4 });
    mesh.merge();
    return new runtime.Manifold(mesh);
  }

  it("fills a corner only as deep as the 1.2 mm strip, at a wall and where shelves of different widths meet", () => {
    // Back 6 and left 16 on a bin of 2 x 1 x 3 units: the left shelf's front is at x -40.8 + 16 = -24.8,
    // the back shelf's at z -19.8 + 6 = -13.8, so they meet there; the back shelf meets the right wall at (40.8, -13.8).
    const fields = { gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelBackWidth: 6, gridfinityLabelLeftWidth: 16 };
    expect(cornersAt(piecesOf(fields))).toEqual(expect.arrayContaining([[-24.8, -13.8], [40.8, -13.8]]));
    for (const gridfinityLabelCorner of ["round", "chamfer"] as const) {
      const solid = solidOf(gridfinityLabelledTriangles(runtime, bin({ ...fields, gridfinityLabelCorner })));
      // A 0.3 mm column 0.4 mm out from both faces of each corner: material from the strip's bottom, 18.95,
      // to the top, 20.15, and none in the 3 mm below it.
      const material = (x: number, z: number, y0: number, y1: number) => {
        const column = runtime.Manifold.cube([0.3, y1 - y0, 0.3]).translate([x - 0.15, y0, z - 0.15]);
        const inside = solid.intersect(column);
        const volume = inside.volume();
        column.delete();
        inside.delete();
        return volume;
      };
      for (const [x, z] of [[-24.4, -13.4], [40.4, -13.4]]) {
        expect(material(x, z, 19.05, 20.05)).toBeCloseTo(0.09, 3);
        expect(material(x, z, 15.9, 18.9)).toBe(0);
      }
      solid.delete();
    }
  });

  it("meets a shorter shelf that runs into the same corner as it meets a full one", () => {
    // Back full and 14 mm, left 20 mm long pushed to the back, 10 mm wide, on a square bin:
    // the corner between their fronts is at x -40.8 + 10 = -30.8, z -40.8 + 14 = -26.8.
    const left = { ...square, gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelLeftWidth: 10 };
    const pushed = piecesOf({ ...left, gridfinityLabelLeftLength: 20, gridfinityLabelLeftOffset: -100 });
    expect(cornersAt(pushed)).toContainEqual([-30.8, -26.8]);
    expect(cornersAt(pushed)).not.toContainEqual([-40.8, -26.8]);
    // 30 mm moved so its back end stops 5 mm from the back wall, on the back shelf: it runs on into the wall,
    // with no rounded end hidden in the back shelf, and the two meet the same way.
    const onShelf = piecesOf({ ...left, gridfinityLabelLeftLength: 30, gridfinityLabelLeftOffset: -20.8 });
    expect(onShelf.shelves[1].profile.to).toBeGreaterThan(40.8);
    expect(onShelf.shelves[1].notches).toHaveLength(1);
    expect(cornersAt(onShelf)).toContainEqual([-30.8, -26.8]);
    // 16 mm long it reaches 2 mm past the back shelf's front: chamfered, a corner of those 2 mm; rounded, its free end's
    // rounding takes those 2 mm of front, and no corner is made there.
    const just = { ...left, gridfinityLabelLeftLength: 16, gridfinityLabelLeftOffset: -100, gridfinityLabelCornerSize: 5 };
    expect(cornerAt(piecesOf({ ...just, gridfinityLabelCorner: "chamfer" }), -30.8, -26.8)?.size).toBeCloseTo(2, 9);
    expect(cornerAt(piecesOf(just), -30.8, -26.8)).toBeUndefined();
    // 17.2 mm reaches 3.2 mm past, but its 2 mm rounded end and 0.5 mm leave only 0.7 mm of straight front: too little for a corner.
    expect(cornerAt(piecesOf({ ...left, gridfinityLabelLeftLength: 17.2, gridfinityLabelLeftOffset: -100 }), -30.8, -26.8)).toBeUndefined();
    // An 18 mm back shelf pushed against the full left one reaches 8 mm past its front: a chamfer of 8 mm, not 9 (half its length).
    const backShort = piecesOf({
      ...left,
      gridfinityLabelBackLength: 18,
      gridfinityLabelBackOffset: -100,
      gridfinityLabelCorner: "chamfer",
      gridfinityLabelCornerSize: 10,
    });
    expect(cornerAt(backShort, -30.8, -26.8)?.size).toBeCloseTo(8, 9);
    // A 4 mm back shelf and the left one 12 mm long pushed to the back: the left one reaches 8 mm past the back one's
    // front, but a corner takes at most half a shelf's length, 6 mm, whichever shelf makes it.
    const narrow = piecesOf({
      ...left,
      gridfinityLabelBackWidth: 4,
      gridfinityLabelLeftLength: 12,
      gridfinityLabelLeftOffset: -100,
      gridfinityLabelCorner: "chamfer",
      gridfinityLabelCornerSize: 10,
    });
    expect(cornerAt(narrow, -30.8, -36.8)?.size).toBeCloseTo(6, 9);
    for (const fields of [{}, { gridfinityLabelCorner: "chamfer" }]) {
      const triangles = gridfinityLabelledTriangles(runtime, bin({ ...left, gridfinityLabelLeftLength: 20, gridfinityLabelLeftOffset: -100, ...fields }));
      expect(edgeProblems(triangles)).toBe(0);
      expect(components(triangles)).toBe(1);
    }
  });

  it("meets a side shelf only where it starts at this wall and reaches past this shelf's front", () => {
    // On the 2 x 1 bin a 10 mm left shelf 10 mm long in the corner does not reach past the 14 mm back shelf's front:
    // the back shelf's corner is against the bare wall in front of it.
    const shortSide = { gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelLeftWidth: 10, gridfinityLabelLeftLength: 10, gridfinityLabelLeftOffset: -100 };
    expect(cornersAt(piecesOf(shortSide))).toContainEqual([-40.8, -5.8]);
    // Nor does a 10 mm back shelf 10 mm long reach past a full 14 mm left shelf's front.
    const shortBack = piecesOf({ gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelBackWidth: 10, gridfinityLabelBackLength: 10, gridfinityLabelBackOffset: -100 });
    expect(cornersAt(shortBack)).toContainEqual([-26.8, -19.8]);
    expect(cornersAt(shortBack)).not.toContainEqual([-26.8, -9.8]);
    // A left shelf that starts 20 mm from the back wall does not meet the back shelf, however far it reaches.
    const away = piecesOf({ ...square, gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelLeftLength: 20, gridfinityLabelLeftOffset: -10.8 });
    expect(cornersAt(away)).toContainEqual([-40.8, -26.8]);
    expect(cornersAt(away)).not.toContainEqual([-26.8, -26.8]);
    // On the 2 x 1 bin a 14 mm left shelf 14.5 mm long reaches only 0.5 mm past the 14 mm back shelf's front: it is taken
    // as ending there, and the back shelf's corner stays against the wall.
    expect(cornersAt(piecesOf({ gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelLeftLength: 14.5, gridfinityLabelLeftOffset: -100 }))).toContainEqual([-40.8, -5.8]);
  });

  it("runs an end that stops on a side shelf into the wall, and leaves one that stops clear of it", () => {
    // The 10 mm left shelf 10 mm long in the corner of the 2 x 1 bin: a back shelf stopping 5 mm from the left wall stops on
    // it and runs on into the wall, leaving no slot between its end and the wall or the left shelf's underside.
    const shortSide = { gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelLeftWidth: 10, gridfinityLabelLeftLength: 10, gridfinityLabelLeftOffset: -100 };
    const beside = piecesOf({ ...shortSide, gridfinityLabelBackLength: 30, gridfinityLabelBackOffset: -20.8 });
    expect(beside.shelves[0].profile.from).toBeLessThan(-40.8);
    expect(beside.shelves[0].notches).toHaveLength(1);
    // 11 mm from the wall it stops 1 mm in front of the left shelf's front, a slot too narrow to print: it runs on.
    expect(piecesOf({ ...shortSide, gridfinityLabelBackLength: 30, gridfinityLabelBackOffset: -14.8 }).shelves[0].profile.from).toBeLessThan(-40.8);
    // An end 14.5 mm from the left wall stops on the full 14 mm left shelf, within 1 mm of its front: it runs on.
    const fullLeft = { ...square, gridfinityLabelBack: true, gridfinityLabelLeft: true };
    expect(piecesOf({ ...fullLeft, gridfinityLabelBackLength: 30, gridfinityLabelBackOffset: -11.3 }).shelves[0].profile.from).toBeLessThan(-40.8);
    // 12 mm from the wall beside a 10 mm left shelf it stops clear of it (12 > 10 + 1) and stays free.
    expect(piecesOf({ ...fullLeft, gridfinityLabelLeftWidth: 10, gridfinityLabelBackLength: 30, gridfinityLabelBackOffset: -13.8 }).shelves[0].profile.from).toBeCloseTo(-28.8, 9);
    // A left shelf 20 mm long starting 20 mm from the back wall is not there for a back end 5 mm from the left wall.
    const away = { ...fullLeft, gridfinityLabelLeftLength: 20, gridfinityLabelLeftOffset: -10.8, gridfinityLabelBackLength: 30, gridfinityLabelBackOffset: -20.8 };
    expect(piecesOf(away).shelves[0].profile.from).toBeCloseTo(-35.8, 9);
    // A short shelf at the far end of its wall is not taken for one on the side shelf at the other end.
    expect(piecesOf({ gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelBackLength: 10, gridfinityLabelBackOffset: 100 }).shelves[0].profile.from).toBeCloseTo(30.8, 9);
  });

  it("joins two shelves that each stop on the other, and leaves no hole in the corner", () => {
    const genus = (fields: Record<string, unknown>) => {
      const solid = solidOf(gridfinityLabelledTriangles(runtime, bin({ ...square, ...fields })));
      const result = solid.genus();
      solid.delete();
      return result;
    };
    // A left shelf that stops 3 mm short of the back wall and a back shelf that stops 5 mm short of the left wall: both
    // reach past the other's front, run on into the corner and join, with the corner between their fronts.
    const both = piecesOf({
      ...square,
      gridfinityLabelBack: true,
      gridfinityLabelLeft: true,
      gridfinityLabelLeftWidth: 10,
      gridfinityLabelLeftLength: 30,
      gridfinityLabelLeftOffset: -22.8,
      gridfinityLabelBackLength: 30,
      gridfinityLabelBackOffset: -20.8,
    });
    expect(both.shelves[0].profile.from).toBeLessThan(-40.8);
    expect(both.shelves[1].profile.to).toBeGreaterThan(40.8);
    expect(cornersAt(both)).toContainEqual([-30.8, -26.8]);
    // The back shelf stops 3 mm from the left wall, on the left shelf; the left shelf stops 8 mm from the back wall, on the back
    // shelf. Only the left one reaches past the other's front, yet both run on into the corner.
    const one = { gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelBackLength: 10, gridfinityLabelBackOffset: -32.8, gridfinityLabelLeftLength: 30, gridfinityLabelLeftOffset: -17.8 };
    const [oneBack, oneLeft] = piecesOf({ ...square, ...one }).shelves.map(({ profile }) => profile);
    expect(oneBack.from).toBeLessThan(-40.8);
    expect(oneLeft.to).toBeGreaterThan(40.8);
    expect(genus(one)).toBe(0);
    // Two 10 mm shelves, each 3 mm from the other's wall: neither reaches past the other's front, and they still join.
    const neither = { gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelBackLength: 10, gridfinityLabelBackOffset: -32.8, gridfinityLabelLeftLength: 10, gridfinityLabelLeftOffset: -32.8 };
    const [neitherBack, neitherLeft] = piecesOf({ ...square, ...neither }).shelves.map(({ profile }) => profile);
    expect(neitherBack.from).toBeLessThan(-40.8);
    expect(neitherLeft.to).toBeGreaterThan(40.8);
    expect(genus(neither)).toBe(0);
  });

  it("runs an end into the wall that stops within 1 mm of the lip's support, which leans 0.8 mm into the bin at the shelf's top", () => {
    // 30 mm with its left end 1.5 mm from the wall: with the lip that is 0.7 mm from the support, so it runs in; without, it stays.
    const fields = { gridfinityLabelBack: true, gridfinityLabelBackLength: 30, gridfinityLabelBackOffset: -24.3 };
    expect(piecesOf(fields).shelves[0].profile.from).toBeCloseTo(-41.8, 9);
    expect(piecesOf({ ...fields, gridfinityLip: false, height: 21 }).shelves[0].profile.from).toBeCloseTo(-39.3, 9);
  });

  it("finishes no end hidden in the shelf of the wall behind it, and keeps it inside that shelf's front", () => {
    // 12 mm pushed against a full 14 mm left shelf: its end at x -28.8 lies inside that shelf, with no rounding and no corner
    // piece, and there is no corner where it meets the left wall either: that spot is inside the left shelf too.
    const hidden = piecesOf({ gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelBackLength: 12, gridfinityLabelBackOffset: -100 });
    expect(hidden.shelves[0].profile.to).toBeCloseTo(-28.8, 9);
    expect(hidden.shelves[0].notches).toHaveLength(0);
    expect(cornersAt(hidden)).not.toContainEqual([-28.8, -19.8]);
    expect(cornersAt(hidden)).not.toContainEqual([-40.8, -5.8]);
    // A back shelf 12 mm and a left shelf 10 mm, both pushed into the corner: neither reaches past the other's front,
    // so neither end is hidden and both keep their rounded ends.
    const corner = { ...square, gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelBackLength: 12, gridfinityLabelBackOffset: -100 };
    expect(piecesOf({ ...corner, gridfinityLabelLeftLength: 10, gridfinityLabelLeftOffset: -100 }).shelves.map(({ notches }) => notches.length)).toEqual([1, 1]);
    // A left shelf that stops 20 mm short of the back wall hides nothing of the back shelf in that corner.
    expect(piecesOf({ ...corner, gridfinityLabelLeftLength: 20, gridfinityLabelLeftOffset: -10.8 }).shelves[0].notches).toHaveLength(1);
    // 14.5 mm would end 0.5 mm in front of the left shelf, at -26.3: it is kept 0.5 mm inside, at -27.3.
    expect(piecesOf({ gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelBackLength: 14.5, gridfinityLabelBackOffset: -100 }).shelves[0].profile.to).toBeCloseTo(-27.3, 9);
  });

  it("keeps corner pieces clear of a shelf on the side wall that comes near them", () => {
    // 1 x 1 x 4 units: the right shelf's back end stops 16 mm from the back wall, 2 mm in front of the 14 mm back shelf.
    // With 2 mm corners neither the back shelf's corner at the right wall nor the piece beside the right shelf's end fits there.
    const near = piecesOf({
      width: 41.5,
      depth: 41.5,
      height: 28 + GRIDFINITY_LIP_HEIGHT,
      gridfinityLabelBack: true,
      gridfinityLabelRight: true,
      gridfinityLabelRightWidth: 8,
      gridfinityLabelRightLength: 15,
      gridfinityLabelRightOffset: 3.7,
      gridfinityLabelCorner: "chamfer",
      gridfinityLabelCornerSize: 2,
    });
    expect(cornersAt(near)).not.toContainEqual([19.8, -5.8]);
    expect(cornersAt(near)).not.toContainEqual([19.8, -3.8]);
    // A 30 mm shelf whose right end stops 2.5 mm from the right wall: with 5 mm corners the piece beside that end stops
    // 0.5 mm short of the wall, at 2 mm, so its curve never meets the wall at a slant.
    const wallNear = piecesOf({ gridfinityLabelBack: true, gridfinityLabelBackLength: 30, gridfinityLabelBackOffset: 23.3, gridfinityLabelCornerSize: 5 });
    expect(wallNear.corners.map(({ size }) => Number(size.toFixed(9)))).toEqual([5, 2]);
    // A back end 6 mm from the right wall beside a 4 mm right shelf whose end, with a 2 mm corner of its own, stops 3 mm
    // from the back wall: the 2 mm piece beside the back end would leave 6 - 4 - 2 - 2 = -2 mm, so it is left out.
    const clearance = piecesOf({
      gridfinityLabelBack: true,
      gridfinityLabelRight: true,
      gridfinityLabelRightWidth: 4,
      gridfinityLabelRightLength: 10,
      gridfinityLabelRightOffset: -11.8,
      gridfinityLabelBackLength: 30,
      gridfinityLabelBackOffset: 19.8,
    });
    expect(clearance.shelves[0].profile.to).toBeCloseTo(34.8, 9);
    expect(cornerAt(clearance, 34.8, -19.8)).toBeUndefined();
    // A shelf 4 mm wide is rounded at its free ends by at most half its width.
    const thin = piecesOf({ gridfinityLabelBack: true, gridfinityLabelBackWidth: 4, gridfinityLabelBackLength: 36, gridfinityLabelCornerSize: 10 });
    expect(thin.shelves[0].notches.map(({ size }) => size)).toEqual([2, 2]);
  });

  it("tells every shelf setting apart and keeps them all through a saved project", async () => {
    // All four walls on, each with its own width, length and offset.
    const settings: Record<string, unknown> = { gridfinityLabelCorner: "chamfer", gridfinityLabelCornerSize: 3 };
    Object.values(GRIDFINITY_LABEL_WALL_KEYS).forEach((keys, i) => Object.assign(settings, { [keys.on]: true, [keys.width]: 5 + i, [keys.length]: 20 + i, [keys.offset]: [-3, 2, 4, -1][i] }));
    const shelved = canonicalizeShape(binShape(settings));
    Object.entries(settings).forEach(([key, value]) => {
      const changed = typeof value === "boolean" ? !value : typeof value === "number" ? value + 1 : "round";
      expect(workplaneShapesEqual(shelved, { ...shelved, [key]: changed })).toBe(false);
    });
    const exported = await exportLylProject({
      projectId: "shelves",
      projectName: "Shelves",
      createdAt: 1_700_000_000_000,
      modifiedAt: 1_700_000_100_000,
      shapes: [shelved],
      history: [editorHistoryEntry([shelved], [])],
      historyIndex: 0,
      assets: [],
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      snapGrid: DEFAULT_SNAP_GRID,
      placementElevation: 0,
    });
    const [loaded] = (await importLylProject(exported)).shapes;
    expect(workplaneShapesEqual(loaded, shelved)).toBe(true);
    expect(loaded).toMatchObject(settings);
    expect(sceneShape(shelved)).toMatchObject(settings);
  });

  it("hands the shelves to the exact body only once Manifold has loaded, as the display mesh has them only then", () => {
    const settings = { gridfinityLabelBack: true, gridfinityLabelBackWidth: 10, gridfinityLabelBackLength: 36, gridfinityLabelBackOffset: -5, gridfinityLabelCorner: "chamfer", gridfinityLabelCornerSize: 2 } as const;
    const shelved = binShape(settings);
    expect(cadModifierGridfinityForShape(shelved)).toBeNull();
    expect(cadModifierGridfinityForShape({ ...shelved, gridfinityLabelBack: false })).not.toBeNull();
    // So is a finger scoop, and so are dividers.
    expect(cadModifierGridfinityForShape(binShape({ gridfinityScoopFront: true }))).toBeNull();
    expect(cadModifierGridfinityForShape(binShape({ gridfinityCompartmentsX: 3 }))).toBeNull();
    rememberManifoldRuntime(runtime);
    expect(cadModifierGridfinityForShape(shelved)).toMatchObject(settings);
  });

  it("keeps a set length on its wall and runs one longer than the wall from wall to wall", () => {
    // Back wall of a bin 2 units across: 81.6 mm inside, so a 30 mm shelf moved 100 mm starts at 10.8
    // and runs into the right wall, without a rounded end there: one corner piece beside the free end,
    // one where it meets the right wall, as a full shelf has.
    const moved = gridfinityLabelPieces(bin({ gridfinityLabelBack: true, gridfinityLabelBackLength: 30, gridfinityLabelBackOffset: 100 }))!;
    expect(moved.shelves[0].profile.from).toBeCloseTo(10.8, 9);
    expect(moved.shelves[0].profile.to).toBeGreaterThan(40.8);
    expect(moved.shelves[0].notches).toHaveLength(1);
    expect(cornersAt(moved)).toEqual([[10.8, -19.8], [40.8, -5.8]]);
    // A 10 mm shelf with 10 mm corners: its rounded front corners leave 1 mm of front between them; beside its free end
    // the corner piece stops 0.5 mm short of the rounding, at 14 - 4.5 - 0.5 mm, and where it runs into the wall it takes half its length.
    const tiny = gridfinityLabelPieces(bin({ gridfinityLabelBack: true, gridfinityLabelBackLength: 10, gridfinityLabelCornerSize: 10 }))!;
    expect(tiny.shelves[0].notches.map(({ size }) => size)).toEqual([4.5, 4.5]);
    const tinyMoved = gridfinityLabelPieces(bin({ gridfinityLabelBack: true, gridfinityLabelBackLength: 10, gridfinityLabelBackOffset: 100, gridfinityLabelCornerSize: 10 }))!;
    expect(tinyMoved.corners.map(({ size }) => size)).toEqual([9, 5]);
    // Chamfered, the end has no rounding: the corner piece beside it is the full 10 mm.
    const chamfered = gridfinityLabelPieces(bin({ gridfinityLabelBack: true, gridfinityLabelBackLength: 36, gridfinityLabelCorner: "chamfer", gridfinityLabelCornerSize: 10 }))!;
    expect(chamfered.corners.map(({ size }) => size)).toEqual([10, 10]);
    const long = gridfinityLabelPieces(bin({ gridfinityLabelBack: true, gridfinityLabelBackLength: 200 }))!.shelves[0].profile;
    expect(long.to - long.from).toBeGreaterThan(81.6);
  });
});

describe("gridfinity finger scoop", () => {
  let runtime: ManifoldToplevel;

  beforeAll(async () => {
    runtime = await manifoldModule();
    runtime.setup();
  });

  // What the scoops (and any shelves) add to the bin's own mesh, which has the floor rounding already.
  const added = (fields: Record<string, unknown>) => signedVolume(gridfinityLabelledTriangles(runtime, bin(fields))) - signedVolume(gridfinityTriangles(bin(fields)));

  it("leaves a bin without a scoop exactly as it was, also with a radius set", () => {
    expect(gridfinityScoopPieces(bin({ gridfinityScoopRadius: 5 }))).toBeNull();
    expect(gridfinityLabelledTriangles(runtime, bin({ gridfinityScoopRadius: 5 }))).toEqual(gridfinityTriangles(bin()));
    expect(gridfinityScoopPieces(plate({ gridfinityScoopFront: true }))).toBeNull();
    // A bin of one height unit has no room for a scoop of 3.5 mm, with the lip or without (1.05 mm of wall).
    expect(gridfinityScoopPieces(bin({ height: 7 + GRIDFINITY_LIP_HEIGHT, gridfinityScoopFront: true }))).toBeNull();
    expect(gridfinityScoopPieces(bin({ height: 7, gridfinityLip: false, gridfinityScoopFront: true }))).toBeNull();
    expect(gridfinityScoopFits(bin({ height: 14 + GRIDFINITY_LIP_HEIGHT }))).toBe(true);
  });

  it("is half the depth up to the lip's support unless set, at least 3.5 mm, keeps 0.5 mm of straight wall above it, and leaves 2 mm of floor between two", () => {
    // 3 units with the lip: 21 - 5.95 - 1.65 = 13.4 deep; without the lip 15.05; 6 units 34.4.
    expect(gridfinityScoopRadius(bin({ gridfinityScoopFront: true }))).toBeCloseTo(6.7, 9);
    expect(gridfinityScoopRadius(bin({ gridfinityScoopFront: true, gridfinityLip: false, height: 21 }))).toBeCloseTo(7.525, 9);
    expect(gridfinityScoopRadius(bin({ gridfinityScoopFront: true, height: 42 + GRIDFINITY_LIP_HEIGHT }))).toBeCloseTo(17.2, 9);
    expect(gridfinityScoopRadius(bin({ gridfinityScoopFront: true, gridfinityScoopRadius: 4 }))).toBe(4);
    expect(gridfinityScoopRadius(bin({ gridfinityScoopFront: true, gridfinityScoopRadius: 30 }))).toBeCloseTo(12.9, 9);
    // Two height units with the lip: 14 - 5.95 - 1.65 = 6.4 deep, half of it under the smallest radius, at most 5.9.
    expect(gridfinityScoopRadius(bin({ gridfinityScoopFront: true, height: 14 + GRIDFINITY_LIP_HEIGHT }))).toBe(3.5);
    expect(gridfinityScoopRadius(bin({ gridfinityScoopFront: true, height: 14 + GRIDFINITY_LIP_HEIGHT, gridfinityScoopRadius: 30 }))).toBeCloseTo(5.9, 9);
    // Never under 3.5 mm, clear of the floor's 2.8 mm rounding.
    expect(gridfinityScoopRadius(bin({ gridfinityScoopFront: true, gridfinityScoopRadius: 0.1 }))).toBe(3.5);
    // 12 units high: 84 - 7.6 = 76.4 deep, but the bin is 39.6 deep inside: one scoop stops 2 mm short of the wall opposite,
    // two facing each other 1 mm short of the middle.
    expect(gridfinityScoopRadius(bin({ gridfinityScoopFront: true, height: 84 + GRIDFINITY_LIP_HEIGHT, gridfinityScoopRadius: 50 }))).toBeCloseTo(37.6, 9);
    expect(gridfinityScoopRadius(bin({ gridfinityScoopFront: true, gridfinityScoopBack: true, height: 84 + GRIDFINITY_LIP_HEIGHT, gridfinityScoopRadius: 50 }))).toBeCloseTo(18.8, 9);
  });

  it("draws a radius within 0.03 mm of the one through the corner of the floor's rounding 0.03 mm below that", () => {
    // The sunk circle runs through the point 2.8 mm out from the scoop's wall and up from the floor, where the end wall's
    // corner rounding meets the floor's, at (2.8 + 0.02) / (1 - 1/sqrt(2)) = 9.6281 mm.
    const drawn = (gridfinityScoopRadius: number) => gridfinityScoopPieces(bin({ height: 28 + GRIDFINITY_LIP_HEIGHT, gridfinityScoopBack: true, gridfinityScoopRadius }))!.radius;
    for (const r of [9.6, 9.628, 9.65]) expect(drawn(r)).toBeCloseTo(9.5981, 4);
    for (const r of [9.5, 9.59, 9.67, 10]) expect(drawn(r)).toBe(r);
  });

  it("is closed, wound outwards and one piece on any walls, with the lip or without, beside label shelves and magnets", () => {
    for (const fields of [
      { gridfinityScoopFront: true },
      { gridfinityScoopBack: true },
      { gridfinityScoopLeft: true },
      { gridfinityScoopRight: true },
      { gridfinityScoopFront: true, gridfinityScoopLeft: true },
      { gridfinityScoopFront: true, gridfinityScoopBack: true, gridfinityScoopLeft: true, gridfinityScoopRight: true },
      { gridfinityScoopFront: true, gridfinityLip: false, height: 21 },
      { gridfinityScoopFront: true, gridfinityLip: false, height: 14 },
      { gridfinityScoopFront: true, height: 14 + GRIDFINITY_LIP_HEIGHT },
      { gridfinityScoopFront: true, gridfinityScoopRadius: 3.5 },
      { gridfinityScoopFront: true, gridfinityScoopBack: true, height: 140 + GRIDFINITY_LIP_HEIGHT, gridfinityScoopRadius: 100 },
      { gridfinityScoopFront: true, gridfinityLabelBack: true },
      { gridfinityScoopFront: true, gridfinityLabelFront: true, gridfinityLabelFrontWidth: 17 },
      { gridfinityScoopLeft: true, gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityMagnets: true },
      { width: 251.5, depth: 251.5, height: 42 + GRIDFINITY_LIP_HEIGHT, gridfinityScoopFront: true, gridfinityScoopRight: true, gridfinityLabelBack: true },
      // Two scoops meeting on the crease of a round corner, which a move of the pieces onto it would pinch (LABEL_MESH_NUDGE).
      { width: 41.5, depth: 41.5, height: 14 + GRIDFINITY_LIP_HEIGHT, gridfinityScoopBack: true, gridfinityScoopRight: true, gridfinityScoopRadius: 5.9 },
      { width: 41.5, depth: 41.5, height: 14 + GRIDFINITY_LIP_HEIGHT, gridfinityScoopBack: true, gridfinityScoopLeft: true, gridfinityScoopRadius: 5.9 },
      { gridfinityScoopFront: true, height: 14 + GRIDFINITY_LIP_HEIGHT, width: 41.5 },
      { gridfinityScoopFront: true, gridfinityScoopBack: true, gridfinityScoopLeft: true, gridfinityScoopRight: true, gridfinityScoopRadius: 12 },
      { gridfinityScoopLeft: true, gridfinityLip: false, height: 14 },
      { gridfinityScoopBack: true, gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityMagnets: true },
      { width: 251.5, depth: 251.5, height: 140 + GRIDFINITY_LIP_HEIGHT, gridfinityScoopFront: true, gridfinityScoopRadius: 100 },
    ]) {
      // The bin's own mesh, with its floor rounded, is closed too.
      const plain = gridfinityTriangles(bin(fields));
      expect(edgeProblems(plain)).toBe(0);
      expect(components(plain)).toBe(1);
      const triangles = gridfinityLabelledTriangles(runtime, bin(fields));
      expect(edgeProblems(triangles)).toBe(0);
      expect(components(triangles)).toBe(1);
      expect(added(fields)).toBeGreaterThan(0.5);
    }
  });

  it("draws the scoops in the viewport once Manifold has loaded", () => {
    rememberManifoldRuntime(runtime);
    const count = (fields: Record<string, unknown>) => createGridfinityGeometry(bin(fields)).getAttribute("position").count;
    expect(count({ gridfinityScoopFront: true })).toBeGreaterThan(count({}));
    // And in the mesh that booleans and the exact body's check use, with every wall and the radius passed on.
    const all = { gridfinityScoopBack: true, gridfinityScoopFront: true, gridfinityScoopLeft: true, gridfinityScoopRight: true, gridfinityScoopRadius: 4 };
    const mesh = meshForShape(binShape(all));
    const volume = signedVolume(mesh.faces.map((face) => face.map((i) => mesh.vertices[i]) as V[]));
    expect(volume).toBeCloseTo(signedVolume(gridfinityLabelledTriangles(runtime, bin(all))), 3);
  });

  it("adds a quarter circle's corner along the whole wall: about r squared times (1 - pi / 4) over the inside length", () => {
    // Over the floor's 2.8 mm rounding, which the wall has anyway: 2 x 1 x 3 units without the lip, r 7.525 with its circle
    // sunk 0.02 mm, 11.87 mm2, less the rounding's 1.68 mm2, over the back wall's 81.6 mm (831 mm3), less what the round
    // inner corners take off.
    const volume = added({ gridfinityScoopBack: true, gridfinityLip: false, height: 21 });
    expect(volume).toBeGreaterThan(800);
    expect(volume).toBeLessThan(840);
    // With the lip, r 6.7: 9.38 - 1.68 mm2, 628 mm3 at most.
    const lipped = added({ gridfinityScoopBack: true });
    expect(lipped).toBeGreaterThan(600);
    expect(lipped).toBeLessThan(632);
  });

  it("rounds into the wall: the floor rises along a quarter circle to the wall, which stands straight above it", () => {
    // The left wall of a 2 x 1 x 3 bin without the lip: inside at x = -40.8, floor at 5.95, r 7.525, the centre
    // r - 0.02 out from the wall and up from the floor.
    const r = 7.525;
    const c = r - 0.02;
    const triangles = gridfinityLabelledTriangles(runtime, bin({ gridfinityScoopLeft: true, gridfinityLip: false, height: 21 }));
    const wall = (y: number) => crossings(triangles, y)[1];
    for (const rise of [1, 3, 6]) expect(wall(5.95 + rise)).toBeCloseTo(-40.8 + c - Math.sqrt(r * r - (c - rise) ** 2), 2);
    expect(wall(5.95 + r + 1)).toBeCloseTo(-40.8, 2);
    // The right wall has no scoop, only the floor's 2.8 mm rounding: at 1.05 mm up, 2.8 - sqrt(2.8^2 - 1.75^2) = 0.614 in.
    expect(crossings(triangles, 7).at(-2)).toBeCloseTo(40.8 - 0.614, 1);
  });

  it("rounds every floor edge of a bin with a scoop by 2.8 mm, the inner corners' radius, and leaves a bin without one sharp", () => {
    // Across the middle of a 2 x 1 x 3 bin with a front scoop, at 1 mm above the floor (5.95): the left and right walls
    // (no scoop) stand 0.95 + 2.8 - sqrt(2.8^2 - 1.8^2) = 1.605 in from the outline at 41.75.
    const rounded = gridfinityLabelledTriangles(runtime, bin({ gridfinityScoopFront: true }));
    const walls = crossings(rounded, 6.95);
    expect(walls[1]).toBeCloseTo(-41.75 + 1.605, 1);
    expect(walls.at(-2)).toBeCloseTo(41.75 - 1.605, 1);
    // 3 mm up the walls stand straight again.
    expect(crossings(rounded, 9)[1]).toBeCloseTo(-40.8, 5);
    // Without a scoop the floor meets the wall in a sharp edge, as before.
    expect(crossings(gridfinityTriangles(bin()), 6.95)[1]).toBeCloseTo(-40.8, 5);
    expect(gridfinityPlan(bin()).floorRounding).toBe(0);
    expect(gridfinityPlan(bin({ gridfinityScoopFront: true })).floorRounding).toBeCloseTo(2.8, 9);
    // A bin with no room for a scoop is not rounded either.
    expect(gridfinityPlan(bin({ gridfinityScoopFront: true, gridfinityLip: false, height: 7 })).floorRounding).toBe(0);
  });

  it("tells every scoop setting apart and keeps them all through a saved project", async () => {
    const settings: Record<string, unknown> = { gridfinityScoopRadius: 4.5 };
    Object.values(GRIDFINITY_SCOOP_WALL_KEYS).forEach((key) => Object.assign(settings, { [key]: true }));
    const scooped = canonicalizeShape(binShape(settings));
    Object.entries(settings).forEach(([key, value]) => {
      expect(workplaneShapesEqual(scooped, { ...scooped, [key]: typeof value === "boolean" ? !value : (value as number) + 1 })).toBe(false);
    });
    const exported = await exportLylProject({
      projectId: "scoops",
      projectName: "Scoops",
      createdAt: 1_700_000_000_000,
      modifiedAt: 1_700_000_100_000,
      shapes: [scooped],
      history: [editorHistoryEntry([scooped], [])],
      historyIndex: 0,
      assets: [],
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      snapGrid: DEFAULT_SNAP_GRID,
      placementElevation: 0,
    });
    const [loaded] = (await importLylProject(exported)).shapes;
    expect(workplaneShapesEqual(loaded, scooped)).toBe(true);
    expect(loaded).toMatchObject(settings);
    expect(sceneShape(scooped)).toMatchObject(settings);
    expect(cadModifierGridfinityForShape(scooped)).toMatchObject(settings);
    // The settings an MCP action passes on keep them, and so does a bin kept as the default for new ones.
    expect(normalizeShapeCustomizations({ gridfinity: settings }, {})).toMatchObject({ gridfinity: settings });
    expect(shapeDefaultsFromShape(scooped)).toMatchObject(settings);
    const asset = toolbarShapeAssets.find((entry) => entry.kind === "gridfinity")!;
    expect(makeShapeFromAsset(asset, { x: 0, z: 0 }, settings)).toMatchObject(settings);
  });
});

describe("gridfinity half-size grid", () => {
  let runtime: ManifoldToplevel;

  beforeAll(async () => {
    runtime = await manifoldModule();
    runtime.setup();
  });

  const half = (fields: Record<string, unknown> = {}) => bin({ gridfinityHalfGrid: true, ...fields });

  it("leaves a bin with the setting off, and every baseplate, exactly as it was", () => {
    expect(gridfinityTriangles(bin({ gridfinityHalfGrid: false }))).toEqual(gridfinityTriangles(bin()));
    expect(gridfinityTriangles(plate({ gridfinityHalfGrid: true }))).toEqual(gridfinityTriangles(plate()));
    expect(gridfinityPlan(plate({ gridfinityHalfGrid: true })).size).toEqual({ width: 84, depth: 42, height: 5 });
  });

  it("counts cells of 21 mm, a bin 0.5 mm smaller, up to 12 of them: the 251.5 mm of 6 whole units", () => {
    expect(gridfinityPlan(half({ width: 20.5, depth: 62.5 })).size).toEqual({ width: 20.5, depth: 62.5, height: 25.4 });
    expect(gridfinityUnits(half({ width: 20.5, depth: 62.5 }))).toEqual({ x: 1, z: 3, y: 3 });
    expect(gridfinityUnits(half({ width: 1000, depth: 1 }))).toMatchObject({ x: 12, z: 1 });
    expect(gridfinityFootprintPatch(half({ width: 1000, depth: 1 }))).toMatchObject({ width: 251.5, depth: 20.5 });
    // A drag snaps to 21 mm cells: 30 mm is 1.45 cells, 33 mm 1.6.
    expect(gridfinityFootprintPatch(half({ width: 30, depth: 33 }))).toMatchObject({ width: 20.5, depth: 41.5 });
  });

  it("keeps the outline when switched on, and rounds to whole units when switched off", () => {
    // 2 x 1 whole units are 4 x 2 half units of the same 83.5 x 41.5; 6 x 6 are 12 x 12, and 12 is as many as there can be.
    expect(gridfinityShapePatch(bin(), { halfGrid: true })).toMatchObject({ gridfinityHalfGrid: true, width: 83.5, depth: 41.5 });
    expect(gridfinityShapePatch(bin({ width: 251.5, depth: 251.5 }), { halfGrid: true })).toMatchObject({ width: 251.5, depth: 251.5 });
    expect(gridfinityShapePatch(half(), { x: 12, z: 13 })).toMatchObject({ width: 251.5, depth: 251.5 });
    // 3 half units (62.5) round to 2 whole ones, 1 half unit to 1.
    expect(gridfinityShapePatch(half({ width: 62.5, depth: 20.5 }), { halfGrid: false })).toMatchObject({ gridfinityHalfGrid: false, width: 83.5, depth: 41.5 });
    // A half bin turned into a baseplate keeps its outline in whole units, and back again; an odd count is read as the
    // baseplate reads a size given to it, without the bin's 0.5 mm: 62.5 mm is 1 unit, as canonicalizeShape makes it.
    expect(gridfinityShapePatch(half(), { type: "baseplate" })).toMatchObject({ width: 84, depth: 42, height: 5 });
    expect(gridfinityShapePatch(half({ width: 62.5 }), { type: "baseplate" })).toMatchObject({ width: 42 });
    expect(gridfinityFootprintPatch({ ...half({ width: 62.5 }), gridfinityType: "baseplate" })).toMatchObject({ width: 42 });
    expect(gridfinityShapePatch(plate({ gridfinityHalfGrid: true }), { type: "bin" })).toMatchObject({ width: 83.5, depth: 41.5 });
    // Other changes leave the setting as it is.
    expect(gridfinityShapePatch(bin(), { lip: false })).not.toHaveProperty("gridfinityHalfGrid");
  });

  it("puts a foot under every 21 mm cell: 20.5 mm at the top, the specification's steps, 14.6 mm at the bottom", () => {
    // 2 x 1 half units: cells at x = -10.5 and 10.5. On the straight step (y 2) a foot is 10.25 - 2.15 = 8.1 from its middle;
    // at the bottom 10.25 - 2.95 = 7.3, widening at 45 degrees to 7.7 at y 0.4.
    const triangles = gridfinityTriangles(half({ width: 41.5, depth: 20.5 }));
    crossings(triangles, 2).forEach((x, i) => expect(x).toBeCloseTo([-18.6, -2.4, 2.4, 18.6][i], 9));
    crossings(triangles, 0.4).forEach((x, i) => expect(x).toBeCloseTo([-10.5 - 7.7, -10.5 + 7.7, 10.5 - 7.7, 10.5 + 7.7][i], 9));
    expect(crossings(triangles, 2)).toHaveLength(4);
  });

  it("is closed, wound outwards and one piece, with the lip, magnets, label shelves and scoops", () => {
    for (const fields of [
      { width: 20.5, depth: 20.5 },
      { width: 20.5, depth: 20.5, gridfinityLip: false, gridfinityMagnets: true },
      { width: 62.5, depth: 41.5, gridfinityMagnets: true },
      { width: 251.5, depth: 251.5, height: 7 + GRIDFINITY_LIP_HEIGHT, gridfinityMagnets: true },
      { width: 20.5, depth: 20.5, gridfinityLabelBack: true, gridfinityLabelFront: true, gridfinityLabelLeft: true, gridfinityLabelRight: true, gridfinityLabelCornerSize: 10 },
      { width: 62.5, depth: 20.5, gridfinityLabelBack: true, gridfinityScoopFront: true, gridfinityScoopLeft: true },
    ]) {
      const triangles = gridfinityLabelledTriangles(runtime, half(fields));
      expect(edgeProblems(triangles)).toBe(0);
      expect(signedVolume(triangles)).toBeGreaterThan(0);
      expect(components(triangles)).toBe(1);
    }
  });

  it("drills the magnet holes where a baseplate has them: one a foot, 2.5 mm towards its cell's corner on the 42 mm grid", () => {
    const holes = (fields: Record<string, unknown>) => gridfinityPlan(half({ gridfinityMagnets: true, ...fields })).magnetHoles.map(({ x, z }) => [x, z].map((n) => Number(n.toFixed(9))));
    // 2 x 2 half units: where a bin of one whole unit has them.
    expect(holes({ width: 41.5, depth: 41.5 }).sort()).toEqual([[-13, -13], [-13, 13], [13, -13], [13, 13]].sort());
    expect(holes({ width: 20.5, depth: 20.5 })).toEqual([[-2.5, -2.5]]);
    // 3 x 1: cells at x = -21, 0 and 21; the middle one's grid corner is on its right.
    expect(holes({ width: 62.5, depth: 20.5 })).toEqual([[-23.5, -2.5], [2.5, -2.5], [18.5, -2.5]]);
  });

  it("keeps the shelves' corners small enough in a bin of one half unit to leave 2 mm open between facing shelves", () => {
    // 18.6 mm inside: shelves of 4 mm on both sides and corner pieces of at most 9.3 - 1 - 4 = 4.3 mm.
    const pieces = gridfinityLabelPieces(half({ width: 20.5, depth: 20.5, gridfinityLabelBack: true, gridfinityLabelFront: true, gridfinityLabelCornerSize: 10 }))!;
    expect(pieces.shelves.map(({ profile }) => profile.width)).toEqual([4, 4]);
    pieces.corners.forEach(({ size }) => expect(size).toBeLessThanOrEqual(4.3 + 1e-9));
    // The Corner size field shows what is built.
    expect(gridfinityLabelCornerSize(half({ width: 20.5, depth: 20.5, gridfinityLabelCornerSize: 10 }))).toBeCloseTo(4.3, 9);
    // A bin of whole units keeps its 10 mm corners.
    expect(Math.max(...gridfinityLabelPieces(bin({ gridfinityLabelBack: true, gridfinityLabelCornerSize: 10 }))!.corners.map(({ size }) => size))).toBe(10);
  });

  it("keeps a half bin's size through a saved project, a new shape and the exact body", async () => {
    const shape = canonicalizeShape(binShape({ gridfinityHalfGrid: true, width: 20.5, depth: 62.5, size: 62.5 }));
    expect(shape).toMatchObject({ width: 20.5, depth: 62.5 });
    expect(workplaneShapesEqual(shape, { ...shape, gridfinityHalfGrid: false })).toBe(false);
    const exported = await exportLylProject({
      projectId: "half",
      projectName: "Half",
      createdAt: 1_700_000_000_000,
      modifiedAt: 1_700_000_100_000,
      shapes: [shape],
      history: [editorHistoryEntry([shape], [])],
      historyIndex: 0,
      assets: [],
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      snapGrid: DEFAULT_SNAP_GRID,
      placementElevation: 0,
    });
    const [loaded] = (await importLylProject(exported)).shapes;
    expect(loaded).toMatchObject({ gridfinityHalfGrid: true, width: 20.5, depth: 62.5 });
    expect(sceneShape(shape)).toMatchObject({ gridfinityHalfGrid: true });
    const asset = toolbarShapeAssets.find((entry) => entry.kind === "gridfinity")!;
    expect(canonicalizeShape(makeShapeFromAsset(asset, { x: 0, z: 0 }, { gridfinityHalfGrid: true, width: 20.5, depth: 20.5 }))).toMatchObject({ width: 20.5, depth: 20.5, gridfinityHalfGrid: true });
    expect(cadModifierGridfinityForShape(shape)).toMatchObject({ gridfinityHalfGrid: true, width: 20.5, depth: 62.5 });
    // The mesh that booleans and the exact body's check use has a foot under every cell: three under this bin, one under a whole one.
    const lowest = (s: WorkplaneShape) => meshForShape(s).vertices.filter(([, y]) => Math.abs(y) < 1e-6).length;
    expect(lowest(shape)).toBe(3 * lowest(canonicalizeShape(binShape({ width: 41.5, depth: 41.5, size: 41.5 }))));
    // The settings an MCP action passes on keep it, and so does a half bin kept as the default for new ones.
    expect(normalizeShapeCustomizations({ gridfinity: { gridfinityHalfGrid: true } }, {})).toMatchObject({ gridfinity: { gridfinityHalfGrid: true } });
    expect(shapeDefaultsFromShape(shape)).toMatchObject({ gridfinityHalfGrid: true, width: 20.5, depth: 62.5 });
  });
});

describe("gridfinity floor height", () => {
  let runtime: ManifoldToplevel;

  beforeAll(async () => {
    runtime = await manifoldModule();
    runtime.setup();
  });

  /** The inside of a 2 x 1 bin: 81.6 x 39.6 mm with corners of 2.8 mm. */
  const insideArea = 81.6 * 39.6 - (4 - Math.PI) * 2.8 * 2.8;

  it("leaves a bin with the floor unset or at 5.95 mm, a bin of 1 height unit with the lip and a baseplate exactly as they were", () => {
    expect(gridfinityTriangles(bin({ gridfinityFloorHeight: 5.95 }))).toEqual(gridfinityTriangles(bin()));
    expect(gridfinityTriangles(bin({ gridfinityFloorHeight: 2 }))).toEqual(gridfinityTriangles(bin()));
    // 1 unit with the lip: its support reaches the wall at 7 - 1.65 = 5.35, under the floor, so there is nothing to raise.
    const low = { height: 7 + GRIDFINITY_LIP_HEIGHT };
    expect(gridfinityFloorFits(bin(low))).toBe(false);
    expect(gridfinityTriangles(bin({ ...low, gridfinityFloorHeight: 20 }))).toEqual(gridfinityTriangles(bin(low)));
    expect(gridfinityTriangles(plate({ gridfinityFloorHeight: 4 }))).toEqual(gridfinityTriangles(plate()));
  });

  it("rises to where the lip's support leaves the wall, 1.65 mm under the top, or to the top of a bin without the lip", () => {
    expect(gridfinityFloorHeight(bin())).toBeCloseTo(5.95, 9);
    expect(gridfinityFloorMaxHeight(bin())).toBeCloseTo(19.35, 9);
    expect(gridfinityFloorHeight(bin({ gridfinityFloorHeight: 30 }))).toBeCloseTo(19.35, 9);
    expect(gridfinityFloorHeight(bin({ gridfinityFloorHeight: 12 }))).toBe(12);
    expect(gridfinityFloorMaxHeight(bin({ gridfinityLip: false, height: 21 }))).toBe(21);
    expect(gridfinityFloorFits(bin({ gridfinityLip: false, height: 7 }))).toBe(true);
    expect(gridfinityFloorMaxHeight(bin({ gridfinityLip: false, height: 7 }))).toBe(7);
    // The feet of a bin stacked on the lip reach 0.35 mm into it: the highest floor stays 1.3 mm under them.
    expect(gridfinityFloorMaxHeight(bin())).toBeLessThanOrEqual(21 - 0.35 - 1.3 + 1e-9);
    // Within 0.05 mm of the highest it is raised onto it, so no sliver of wall is left.
    expect(gridfinityFloorHeight(bin({ gridfinityFloorHeight: 19.32 }))).toBeCloseTo(19.35, 9);
    expect(gridfinityFloorHeight(bin({ gridfinityFloorHeight: 19.2 }))).toBe(19.2);
    expect(gridfinityFloorHeight(bin({ gridfinityLip: false, height: 21, gridfinityFloorHeight: 20.99 }))).toBe(21);
    // 0.05 under the highest, where the field's 0.05 mm steps end, is raised onto it too.
    expect(gridfinityFloorHeight(bin({ gridfinityLip: false, height: 21, gridfinityFloorHeight: 20.95 }))).toBe(21);
    expect(gridfinityFloorHeight(bin({ gridfinityLip: false, height: 21, gridfinityFloorHeight: 20.9 }))).toBe(20.9);
  });

  it("fills the bin up to the floor: the inside's area times the rise", () => {
    // Within 0.1 %: the mesh draws the 2.8 mm corners as polygons.
    const plain = signedVolume(gridfinityTriangles(bin()));
    const raised = (gridfinityFloorHeight: number) => signedVolume(gridfinityTriangles(bin({ gridfinityFloorHeight }))) - plain;
    expect(raised(10) / (insideArea * (10 - 5.95))).toBeCloseTo(1, 3);
    expect(raised(30) / (insideArea * (19.35 - 5.95))).toBeCloseTo(1, 3);
  });

  it("leaves a bin without the lip raised to the top as one solid block", () => {
    const triangles = gridfinityTriangles(bin({ gridfinityLip: false, height: 21, gridfinityFloorHeight: 21 }));
    // At 15 mm up the only walls a line crosses are the outer ones.
    expect(crossings(triangles, 15)).toHaveLength(2);
    crossings(triangles, 15).forEach((x, i) => expect(x).toBeCloseTo([-41.75, 41.75][i], 9));
    expect(bounds(triangles).max[1]).toBe(21);
  });

  it("is closed, wound outwards and one piece at any height, with the lip or without, shelves, scoops, magnets and the half-size grid", () => {
    for (const fields of [
      { gridfinityFloorHeight: 10 },
      { gridfinityFloorHeight: 19.35 },
      { gridfinityFloorHeight: 19.345 },
      { gridfinityFloorHeight: 19.34 },
      { gridfinityFloorHeight: 30, gridfinityMagnets: true },
      { gridfinityLip: false, height: 21, gridfinityFloorHeight: 21 },
      { gridfinityLip: false, height: 21, gridfinityFloorHeight: 20.99 },
      { gridfinityLip: false, height: 21, gridfinityFloorHeight: 20.999 },
      { gridfinityLip: false, height: 7, gridfinityFloorHeight: 7 },
      { gridfinityFloorHeight: 9, gridfinityScoopFront: true, gridfinityScoopLeft: true, gridfinityLabelBack: true },
      { height: 42 + GRIDFINITY_LIP_HEIGHT, gridfinityFloorHeight: 20, gridfinityScoopBack: true, gridfinityLabelFront: true, gridfinityLabelLeft: true },
      { gridfinityFloorHeight: 15.5, gridfinityLabelBack: true, gridfinityLabelFront: true },
      { gridfinityHalfGrid: true, width: 20.5, depth: 41.5, gridfinityFloorHeight: 12, gridfinityMagnets: true },
    ]) {
      const triangles = gridfinityLabelledTriangles(runtime, bin(fields));
      expect(edgeProblems(triangles)).toBe(0);
      expect(signedVolume(triangles)).toBeGreaterThan(0);
      expect(components(triangles)).toBe(1);
    }
  });

  it("starts the scoops on the raised floor, narrows the shelves above it, and leaves both out once it leaves them no room", () => {
    // A scoop rises from the floor to the lip's support: 21 - 10 - 1.65 = 9.35 mm, half of it by default.
    expect(gridfinityScoopRadius(bin({ gridfinityScoopFront: true, gridfinityFloorHeight: 10 }))).toBeCloseTo(4.675, 9);
    expect(gridfinityScoopPieces(bin({ gridfinityScoopFront: true, gridfinityFloorHeight: 10 }))!.floor).toBe(10);
    // It needs 3.5 + 0.5 mm: up to a floor of 21 - 1.65 - 4 = 15.35.
    expect(gridfinityScoopFits(bin({ gridfinityFloorHeight: 15.35 }))).toBe(true);
    expect(gridfinityScoopFits(bin({ gridfinityFloorHeight: 15.4 }))).toBe(false);
    expect(gridfinityScoopPieces(bin({ gridfinityScoopFront: true, gridfinityFloorHeight: 15.4 }))).toBeNull();
    // A shelf's underside ends 0.5 mm above the floor and the narrowest shelf is 4 mm: up to a floor of
    // 21 - 0.85 - 1.2 - 0.5 - 4 tan 36 = 15.54.
    expect(gridfinityLabelPieces(bin({ gridfinityLabelBack: true, gridfinityFloorHeight: 15.5 }))!.floor).toBe(15.5);
    // With the floor at 10 the widest shelf is (21 - 0.85 - 1.2 - 10 - 0.5) / tan 36 = 11.70 mm, under the 14 mm it has by default.
    const [shelf] = gridfinityLabelPieces(bin({ gridfinityLabelBack: true, gridfinityFloorHeight: 10 }))!.shelves;
    expect(shelf.profile.width).toBeCloseTo((21 - 0.85 - 1.2 - 10 - 0.5) / Math.tan((36 * Math.PI) / 180), 9);
    expect(gridfinityLabelFits(bin({ gridfinityFloorHeight: 15.5 }))).toBe(true);
    expect(gridfinityLabelFits(bin({ gridfinityFloorHeight: 15.6 }))).toBe(false);
    expect(gridfinityLabelPieces(bin({ gridfinityLabelBack: true, gridfinityFloorHeight: 15.6 }))).toBeNull();
    expect(gridfinityLabelledTriangles(runtime, bin({ gridfinityLabelBack: true, gridfinityScoopFront: true, gridfinityFloorHeight: 16 }))).toEqual(gridfinityTriangles(bin({ gridfinityFloorHeight: 16 })));
  });

  it("keeps the floor height through a saved project, the settings and the exact body", async () => {
    const settings = { gridfinityFloorHeight: 12.5 };
    const shape = canonicalizeShape(binShape(settings));
    expect(workplaneShapesEqual(shape, { ...shape, gridfinityFloorHeight: 13 })).toBe(false);
    const exported = await exportLylProject({
      projectId: "floor",
      projectName: "Floor",
      createdAt: 1_700_000_000_000,
      modifiedAt: 1_700_000_100_000,
      shapes: [shape],
      history: [editorHistoryEntry([shape], [])],
      historyIndex: 0,
      assets: [],
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      snapGrid: DEFAULT_SNAP_GRID,
      placementElevation: 0,
    });
    const [loaded] = (await importLylProject(exported)).shapes;
    expect(workplaneShapesEqual(loaded, shape)).toBe(true);
    expect(loaded).toMatchObject(settings);
    expect(sceneShape(shape)).toMatchObject(settings);
    expect(cadModifierGridfinityForShape(shape)).toMatchObject(settings);
    expect(normalizeShapeCustomizations({ gridfinity: settings }, {})).toMatchObject({ gridfinity: settings });
    expect(shapeDefaultsFromShape(shape)).toMatchObject(settings);
    const asset = toolbarShapeAssets.find((entry) => entry.kind === "gridfinity")!;
    expect(makeShapeFromAsset(asset, { x: 0, z: 0 }, settings)).toMatchObject(settings);
    // The mesh that booleans and the exact body's check use has the raised floor.
    const meshVolume = (s: WorkplaneShape) => { const { vertices, faces } = meshForShape(s); return signedVolume(faces.map((face) => face.map((i) => vertices[i]) as V[])); };
    expect((meshVolume(shape) - meshVolume(canonicalizeShape(binShape({})))) / (insideArea * (12.5 - 5.95))).toBeCloseTo(1, 3);
  });
});

describe("gridfinity bins without compartments, unchanged by them", () => {
  let runtime: ManifoldToplevel;

  beforeAll(async () => {
    runtime = await manifoldModule();
    runtime.setup();
  });

  const round9 = (n: number) => Number(n.toFixed(9));
  /** A shelf as [wall, width, from, to] and its strip setting where it has one. */
  const profileOf = ({ wall, width, from, to, strip }: GridfinityLabelProfile) => [wall, round9(width), round9(from), round9(to), ...(strip === undefined ? [] : [strip])];
  /** A corner piece or rounded end as [x, z, a.x, a.z, b.x, b.z, size, round, reach along a, reach along b]. */
  const cornerOf = ({ at, a, b, size, round, reachA, reachB }: GridfinityLabelCornerShape) => [round9(at.x), round9(at.z), round9(a.x), round9(a.z), round9(b.x), round9(b.z), round9(size), round, round9(reachA), round9(reachB)];
  /** Every field of the shelf pieces, to 1e-9: each shelf with its rounded ends, each corner piece with the shelves it lies under. */
  const shelvesOf = (fields: Record<string, unknown>) => {
    const pieces = gridfinityLabelPieces(bin(fields));
    return pieces && {
      top: round9(pieces.top),
      floor: round9(pieces.floor),
      inside: [round9(pieces.inside.hx), round9(pieces.inside.hz), round9(pieces.inside.radius)],
      shelves: pieces.shelves.map(({ profile, notches }) => [profileOf(profile), notches.map(cornerOf)]),
      corners: pieces.corners.map((corner) => [...cornerOf(corner), corner.under.map(profileOf)]),
    };
  };

  it("builds the same mesh and shelves for every bin of one compartment and every baseplate as before dividers came in", () => {
    // Taken before dividers came in: triangles and volume of the bin's own mesh and of the display mesh, and the
    // shelf pieces. A bin without dividers must come out exactly as it did then.
    const big = { width: 125.5, depth: 83.5, height: 42 + GRIDFINITY_LIP_HEIGHT };
    for (const [fields, triangles, volume, labelledTriangles, labelledVolume, shelves] of [
      [{}, 1084, 23244.7224, 1084, 23244.7224, null],
      [{ gridfinityLip: false, height: 21 }, 832, 21309.5035, 832, 21309.5035, null],
      [{ gridfinityMagnets: true }, 2108, 22611.6933, 2108, 22611.6933, null],
      [{ width: 41.5, depth: 41.5 }, 716, 12402.4573, 716, 12402.4573, null],
      [{ gridfinityHalfGrid: true, width: 20.5, depth: 20.5 }, 716, 3459.6073, 716, 3459.6073, null],
      [{ gridfinityFloorHeight: 12.5 }, 1084, 44365.0148, 1084, 44365.0148, null],
      [{ gridfinityScoopFront: true }, 1692, 23646.8348, 1456, 24251.216, null],
      [{ gridfinityScoopFront: true, gridfinityScoopBack: true, gridfinityScoopLeft: true, gridfinityScoopRight: true }, 1692, 23646.8348, 1328, 25374.4196, null],
      [
        { gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelRight: true },
        1084, 23244.7224, 1316, 35465.5396,
        {
          top: 20.15,
          floor: 5.95,
          inside: [40.8, 19.8, 2.8],
          shelves: [[["back", 14, -41.8, 41.8], []], [["left", 14, -20.8, 20.8], []], [["right", 14, -20.8, 20.8], []]],
          corners: [
            [-26.8, -5.8, 1, 0, 0, 1, 2, true, 1, 0, [["back", 14, -41.8, 41.8], ["back", 16, -41.8, 41.8, true], ["left", 14, -20.8, 20.8], ["left", 16, -20.8, 20.8, true]]],
            [26.8, -5.8, -1, 0, 0, 1, 2, true, 1, 0, [["back", 14, -41.8, 41.8], ["back", 16, -41.8, 41.8, true], ["right", 14, -20.8, 20.8], ["right", 16, -20.8, 20.8, true]]],
            [-26.8, 19.8, 0, -1, 1, 0, 2, true, 1, 0, [["left", 14, -20.8, 20.8], ["left", 16, -20.8, 20.8, true]]],
            [26.8, 19.8, 0, -1, -1, 0, 2, true, 1, 0, [["right", 14, -20.8, 20.8], ["right", 16, -20.8, 20.8, true]]],
          ],
        },
      ],
      [
        { gridfinityLabelFront: true, gridfinityLabelFrontLength: 36, gridfinityLabelFrontOffset: -10, gridfinityLabelCorner: "chamfer" },
        1084, 23244.7224, 1044, 26443.5113,
        {
          top: 20.15,
          floor: 5.95,
          inside: [40.8, 19.8, 2.8],
          shelves: [[["front", 14, -8, 28], []]],
          corners: [
            [8, 19.8, 1, 0, 0, -1, 2, false, 0, 1, [["front", 14, -41.8, 41.8]]],
            [-28, 19.8, -1, 0, 0, -1, 2, false, 0, 1, [["front", 14, -41.8, 41.8]]],
          ],
        },
      ],
      [
        { gridfinityLabelBack: true, gridfinityLabelBackLength: 30, gridfinityLabelBackOffset: 100 },
        1084, 23244.7224, 1166, 25861.2635,
        {
          top: 20.15,
          floor: 5.95,
          inside: [40.8, 19.8, 2.8],
          shelves: [[["back", 14, 10.8, 41.8], [[10.8, -5.8, 1, 0, 0, -1, 2, true, 1, 1]]]],
          corners: [
            [10.8, -19.8, -1, 0, 0, 1, 2, true, 0, 1, [["back", 14, -41.8, 41.8]]],
            [40.8, -5.8, -1, 0, 0, 1, 2, true, 1, 0, [["back", 14, -41.8, 41.8], ["back", 16, -41.8, 41.8, true]]],
          ],
        },
      ],
      [
        { gridfinityLabelBack: true, gridfinityLabelLeft: true, gridfinityLabelBackWidth: 6, gridfinityLabelLeftWidth: 16 },
        1084, 23244.7224, 1252, 28951.8788,
        {
          top: 20.15,
          floor: 5.95,
          inside: [40.8, 19.8, 2.8],
          shelves: [[["back", 6, -41.8, 41.8], []], [["left", 16, -20.8, 20.8], []]],
          corners: [
            [-24.8, -13.8, 1, 0, 0, 1, 2, true, 1, 0, [["back", 6, -41.8, 41.8], ["back", 8, -41.8, 41.8, true], ["left", 16, -20.8, 20.8], ["left", 18, -20.8, 20.8, true]]],
            [40.8, -13.8, -1, 0, 0, 1, 2, true, 1, 0, [["back", 6, -41.8, 41.8], ["back", 8, -41.8, 41.8, true]]],
            [-24.8, 19.8, 0, -1, 1, 0, 2, true, 1, 0, [["left", 16, -20.8, 20.8], ["left", 18, -20.8, 20.8, true]]],
          ],
        },
      ],
      [
        { ...big, gridfinityLabelBack: true, gridfinityLabelFront: true, gridfinityLabelLeft: true, gridfinityLabelRight: true },
        2416, 71039.5996, 2558, 103354.7915,
        {
          top: 41.15,
          floor: 5.95,
          inside: [61.8, 40.8, 2.8],
          shelves: [[["back", 14, -62.8, 62.8], []], [["front", 14, -62.8, 62.8], []], [["left", 14, -41.8, 41.8], []], [["right", 14, -41.8, 41.8], []]],
          corners: [
            [-47.8, -26.8, 1, 0, 0, 1, 2, true, 1, 0, [["back", 14, -62.8, 62.8], ["back", 16, -62.8, 62.8, true], ["left", 14, -41.8, 41.8], ["left", 16, -41.8, 41.8, true]]],
            [47.8, -26.8, -1, 0, 0, 1, 2, true, 1, 0, [["back", 14, -62.8, 62.8], ["back", 16, -62.8, 62.8, true], ["right", 14, -41.8, 41.8], ["right", 16, -41.8, 41.8, true]]],
            [47.8, 26.8, -1, 0, 0, -1, 2, true, 1, 0, [["front", 14, -62.8, 62.8], ["front", 16, -62.8, 62.8, true], ["right", 14, -41.8, 41.8], ["right", 16, -41.8, 41.8, true]]],
            [-47.8, 26.8, 1, 0, 0, -1, 2, true, 1, 0, [["front", 14, -62.8, 62.8], ["front", 16, -62.8, 62.8, true], ["left", 14, -41.8, 41.8], ["left", 16, -41.8, 41.8, true]]],
          ],
        },
      ],
    ] as const) {
      const context = JSON.stringify(fields);
      const plain = gridfinityTriangles(bin(fields));
      const labelled = gridfinityLabelledTriangles(runtime, bin(fields));
      expect(plain.length, context).toBe(triangles);
      expect(signedVolume(plain), context).toBeCloseTo(volume, 3);
      expect(labelled.length, context).toBe(labelledTriangles);
      expect(signedVolume(labelled), context).toBeCloseTo(labelledVolume, 3);
      expect(shelvesOf(fields), context).toEqual(shelves);
    }
    const baseplate = gridfinityTriangles(plate());
    expect(baseplate.length).toBe(812);
    expect(signedVolume(baseplate)).toBeCloseTo(2826.9698, 3);
    expect(gridfinityLabelledTriangles(runtime, plate())).toEqual(baseplate);
  });
});

// Each case builds whole bins through Manifold; on a slow CI runner one took longer than the default 5 s (PR #657).
describe("gridfinity dividers", { timeout: 30_000 }, () => {
  let runtime: ManifoldToplevel;

  beforeAll(async () => {
    runtime = await manifoldModule();
    runtime.setup();
  });

  /** A bin of 6 x 6 x 3 units. */
  const large = { width: 251.5, depth: 251.5 };
  const count = (fields: Record<string, unknown>) => [gridfinityCompartmentCount(bin(fields), "x"), gridfinityCompartmentCount(bin(fields), "z")];
  const cellsOf = (fields: Record<string, unknown>) => gridfinityCompartments(bin(fields))!.cells;

  it("leaves a bin of one compartment, a bin too low for dividers and a baseplate exactly as they were", () => {
    const divided = { gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2 };
    for (const fields of [{}, { gridfinityCompartmentsX: 1, gridfinityCompartmentsZ: 1, gridfinityDividerPositionsX: [20] }, { gridfinityDividerThickness: 2 }]) {
      expect(gridfinityTriangles(bin(fields)), JSON.stringify(fields)).toEqual(gridfinityTriangles(bin()));
      expect(gridfinityLabelledTriangles(runtime, bin(fields)), JSON.stringify(fields)).toEqual(gridfinityTriangles(bin()));
      expect(gridfinityCompartments(bin(fields)), JSON.stringify(fields)).toBeNull();
    }
    // 1 height unit with the lip, and 3 units with the floor raised to 17.2: no room for a divider.
    for (const fields of [{ height: 7 + GRIDFINITY_LIP_HEIGHT }, { gridfinityFloorHeight: 17.2 }]) {
      expect(gridfinityLabelledTriangles(runtime, bin({ ...fields, ...divided })), JSON.stringify(fields)).toEqual(gridfinityTriangles(bin(fields)));
      expect(gridfinityCompartments(bin({ ...fields, ...divided })), JSON.stringify(fields)).toBeNull();
      expect(count({ ...fields, ...divided }), JSON.stringify(fields)).toEqual([1, 1]);
    }
    expect(gridfinityLabelledTriangles(runtime, plate(divided))).toEqual(gridfinityTriangles(plate()));
    expect(gridfinityCompartments(plate(divided))).toBeNull();
  });

  it("is offered only while the divider top, 0.85 mm under the top, stands at least 3 mm above the floor", () => {
    // 1 unit: 7 - 0.85 - 5.95 = 0.2; 2 units: 7.2; 3 units with the floor at 17.15: 3.0, at 17.2: 2.95.
    expect(gridfinityDividerFits(bin({ height: 7 + GRIDFINITY_LIP_HEIGHT }))).toBe(false);
    expect(gridfinityDividerFits(bin({ height: 14 + GRIDFINITY_LIP_HEIGHT }))).toBe(true);
    expect(gridfinityDividerFits(bin({ gridfinityFloorHeight: 17.15 }))).toBe(true);
    expect(gridfinityDividerFits(bin({ gridfinityFloorHeight: 17.2 }))).toBe(false);
    // Without the lip the same.
    expect(gridfinityDividerFits(bin({ gridfinityLip: false, height: 7 }))).toBe(false);
    expect(gridfinityDividerFits(bin({ gridfinityLip: false, height: 14 }))).toBe(true);
    expect(gridfinityDividerFits(bin({ gridfinityLip: false, height: 21, gridfinityFloorHeight: 17.15 }))).toBe(true);
    expect(gridfinityDividerFits(bin({ gridfinityLip: false, height: 21, gridfinityFloorHeight: 17.2 }))).toBe(false);
    expect(gridfinityDividerFits(plate())).toBe(false);
  });

  it("spaces the dividers evenly unless they were moved, measured from the inside of the wall to their middle", () => {
    const fields = { gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2 };
    // 81.6 x 39.6 inside: compartments of (81.6 - 2 x 1.2) / 3 = 26.4 across and (39.6 - 1.2) / 2 = 19.2 deep.
    gridfinityDividerPositions(bin(fields), "x").forEach((p, i) => expect(p).toBeCloseTo([27, 54.6][i], 9));
    gridfinityDividerPositions(bin(fields), "z").forEach((p, i) => expect(p).toBeCloseTo([19.8][i], 9));
    expect(gridfinityDividerPositions(bin(fields), "x")).toHaveLength(2);
    expect(gridfinityDividerPositions(bin(fields), "z")).toHaveLength(1);
    const compartments = gridfinityCompartments(bin(fields))!;
    expect(compartments.thickness).toBe(1.2);
    compartments.xs.forEach((x, i) => expect(x).toBeCloseTo([-13.8, 13.8][i], 9));
    compartments.zs.forEach((z, i) => expect(z).toBeCloseTo([0][i], 9));
    expect(compartments.cells).toHaveLength(6);
    const xs = [[-40.8, -14.4], [-13.2, 13.2], [14.4, 40.8]];
    const zs = [[-19.8, -0.6], [0.6, 19.8]];
    compartments.cells.forEach((cell) => {
      const context = `${cell.column},${cell.row}`;
      expect(cell.x0, context).toBeCloseTo(xs[cell.column][0], 9);
      expect(cell.x1, context).toBeCloseTo(xs[cell.column][1], 9);
      expect(cell.z0, context).toBeCloseTo(zs[cell.row][0], 9);
      expect(cell.z1, context).toBeCloseTo(zs[cell.row][1], 9);
      expect(cell.hx, context).toBeCloseTo(13.2, 9);
      expect(cell.hz, context).toBeCloseTo(9.6, 9);
      expect(cell.centre.x, context).toBeCloseTo((xs[cell.column][0] + xs[cell.column][1]) / 2, 9);
      expect(cell.centre.z, context).toBeCloseTo((zs[cell.row][0] + zs[cell.row][1]) / 2, 9);
      expect(cell.onWall, context).toEqual({ back: cell.row === 0, front: cell.row === 1, left: cell.column === 0, right: cell.column === 2 });
    });
    // Counted from the back left, row by row.
    expect(compartments.cells.map(({ column, row }) => [column, row])).toEqual([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]);
    for (const t of [0.8, 3]) {
      cellsOf({ gridfinityCompartmentsX: 3, gridfinityDividerThickness: t }).forEach((cell) => expect(cell.x1 - cell.x0, `${t}`).toBeCloseTo((81.6 - 2 * t) / 3, 9));
    }
  });

  it("takes the divider thickness between 0.8 and 3 mm, 1.2 unless set, and whole numbers of compartments", () => {
    expect(gridfinityDividerThickness(bin())).toBe(1.2);
    expect(gridfinityDividerThickness(bin({ gridfinityDividerThickness: 2 }))).toBe(2);
    expect(gridfinityDividerThickness(bin({ gridfinityDividerThickness: 0.5 }))).toBe(0.8);
    expect(gridfinityDividerThickness(bin({ gridfinityDividerThickness: 5 }))).toBe(3);
    expect(gridfinityDividerThickness(bin({ gridfinityDividerThickness: Number.NaN }))).toBe(1.2);
    expect(count({ gridfinityCompartmentsX: 1.5, gridfinityCompartmentsZ: 2.4 })).toEqual([2, 2]);
    expect(count({ gridfinityCompartmentsX: 0, gridfinityCompartmentsZ: -3 })).toEqual([1, 1]);
    expect(count({ gridfinityCompartmentsX: Number.NaN })).toEqual([1, 1]);
    expect(count({})).toEqual([1, 1]);
  });

  it("takes at most 4 compartments a grid unit each way and 40 in all, lowering the number across first", () => {
    expect(gridfinityUnitCompartments(bin({ width: 41.5 }), "x")).toBe(4);
    expect(gridfinityUnitCompartments(bin({ width: 41.5, gridfinityDividerThickness: 3 }), "x")).toBe(4);
    expect(gridfinityUnitCompartments(bin({ gridfinityHalfGrid: true, width: 20.5, depth: 20.5 }), "x")).toBe(2);
    expect(gridfinityUnitCompartments(bin(large), "z")).toBe(24);
    expect(gridfinityUnitCompartments(bin({ gridfinityHalfGrid: true, width: 125.5, depth: 20.5 }), "x")).toBe(12);
    // At that many with 3 mm dividers every compartment still has room: (39.6 - 3 x 3) / 4 = 7.65 and (18.6 - 3) / 2 = 7.8.
    cellsOf({ width: 41.5, gridfinityCompartmentsX: 9, gridfinityDividerThickness: 3 }).forEach((cell) => expect(cell.x1 - cell.x0).toBeCloseTo(7.65, 9));
    cellsOf({ gridfinityHalfGrid: true, width: 20.5, depth: 20.5, gridfinityCompartmentsX: 9, gridfinityDividerThickness: 3 }).forEach((cell) => expect(cell.x1 - cell.x0).toBeCloseTo(7.8, 9));
    for (const [fields, built] of [
      [{ ...large, gridfinityCompartmentsX: 10, gridfinityCompartmentsZ: 10 }, [4, 10]],
      [{ ...large, gridfinityCompartmentsX: 20, gridfinityCompartmentsZ: 5 }, [8, 5]],
      [{ ...large, gridfinityCompartmentsX: 24, gridfinityCompartmentsZ: 24 }, [1, 24]],
      [{ ...large, gridfinityCompartmentsX: 20, gridfinityCompartmentsZ: 6 }, [6, 6]],
      [{ ...large, gridfinityCompartmentsX: 30, gridfinityCompartmentsZ: 1 }, [24, 1]],
      [{ width: 251.5, gridfinityCompartmentsX: 24, gridfinityCompartmentsZ: 4 }, [10, 4]],
      [{ width: 41.5, depth: 41.5, gridfinityCompartmentsZ: 9 }, [1, 4]],
    ] as const) {
      expect(count(fields), JSON.stringify(fields)).toEqual(built);
      expect(cellsOf(fields), JSON.stringify(fields)).toHaveLength(built[0] * built[1]);
    }
    // What the settings window offers: with 5 deep at most 8 across, and with 8 across at most 5 deep.
    expect(gridfinityCompartmentMax(bin({ ...large, gridfinityCompartmentsZ: 5 }), "x")).toBe(8);
    expect(gridfinityCompartmentMax(bin({ ...large, gridfinityCompartmentsX: 8, gridfinityCompartmentsZ: 5 }), "z")).toBe(5);
    expect(gridfinityCompartmentMax(bin(large), "x")).toBe(24);
    expect(gridfinityCompartmentMax(bin(), "z")).toBe(4);
  });

  it("keeps every compartment at least 6 mm wide however the dividers were moved, and spaces a list of the wrong length evenly", () => {
    // 2 deep in 39.6 mm: a divider's middle stays between 6.6 and 33.
    const deep = (positions: number[]) => gridfinityDividerPositions(bin({ gridfinityCompartmentsZ: 2, gridfinityDividerPositionsZ: positions }), "z");
    expect(deep([3])[0]).toBeCloseTo(6.6, 9);
    expect(deep([36])[0]).toBeCloseTo(33, 9);
    expect(deep([12.5])).toEqual([12.5]);
    // Three across pushed onto one another keep 6 mm and a divider between their middles.
    const across = (positions: number[]) => gridfinityDividerPositions(bin({ gridfinityCompartmentsX: 3, gridfinityDividerPositionsX: positions }), "x");
    across([40, 40]).forEach((p, i) => expect(p).toBeCloseTo([40, 47.2][i], 9));
    across([80, 80]).forEach((p, i) => expect(p).toBeCloseTo([67.8, 75][i], 9));
    across([50, 20]).forEach((p, i) => expect(p).toBeCloseTo([20, 50][i], 9));
    across([30]).forEach((p, i) => expect(p).toBeCloseTo([27, 54.6][i], 9));
    across([30, 40, 50]).forEach((p, i) => expect(p).toBeCloseTo([27, 54.6][i], 9));
    cellsOf({ gridfinityCompartmentsX: 3, gridfinityDividerPositionsX: [0, 0] }).forEach((cell) => expect(cell.x1 - cell.x0).toBeGreaterThanOrEqual(6 - 1e-9));
  });

  it("offers each divider the room between its neighbours in steps of 0.1 mm", () => {
    const limits = (fields: Record<string, unknown>, axis: "x" | "z", index: number) => {
      const { min, max } = gridfinityDividerLimits(bin(fields), axis, index)!;
      return [Number(min.toFixed(9)), Number(max.toFixed(9))];
    };
    expect(limits({ gridfinityCompartmentsZ: 2 }, "z", 0)).toEqual([6.6, 33]);
    expect(limits({ gridfinityCompartmentsX: 3 }, "x", 0)).toEqual([6.6, 47.4]);
    expect(limits({ gridfinityCompartmentsX: 3 }, "x", 1)).toEqual([34.2, 75]);
    // 1.25 mm thick: 6.625 and 32.975 are rounded inwards onto the slider's steps.
    expect(limits({ gridfinityCompartmentsZ: 2, gridfinityDividerThickness: 1.25 }, "z", 0)).toEqual([6.7, 32.9]);
    expect(gridfinityDividerLimits(bin({ gridfinityCompartmentsZ: 2 }), "x", 0)).toBeNull();
    expect(gridfinityDividerLimits(bin({ gridfinityCompartmentsZ: 2 }), "z", 1)).toBeNull();
    // 1.7 mm thick in one unit: the dividers built at 6.85 and 14.55 sit off the steps, the first with no room at all.
    // Its slider keeps it where it is instead of offering 6.9 to 6.8, and the second's starts at it.
    const tight = bin({ width: 41.5, gridfinityCompartmentsX: 3, gridfinityDividerThickness: 1.7, gridfinityDividerPositionsX: [6.6, 13.8] });
    expect(gridfinityDividerPositions(tight, "x").map((p) => Number(p.toFixed(9)))).toEqual([6.85, 14.55]);
    expect(limits({ width: 41.5, gridfinityCompartmentsX: 3, gridfinityDividerThickness: 1.7, gridfinityDividerPositionsX: [6.6, 13.8] }, "x", 0)).toEqual([6.85, 6.85]);
    expect(limits({ width: 41.5, gridfinityCompartmentsX: 3, gridfinityDividerThickness: 1.7, gridfinityDividerPositionsX: [6.6, 13.8] }, "x", 1)).toEqual([14.55, 32.7]);
    gridfinityDividerPositions(tight, "x").forEach((p, i) => {
      const { min, max } = gridfinityDividerLimits(tight, "x", i)!;
      expect(min, `${i}`).toBeLessThanOrEqual(p);
      expect(max, `${i}`).toBeGreaterThanOrEqual(p);
    });
    // Moving the first one anywhere writes the places it already has.
    gridfinityDividerPositionPatch(tight, "x", 0, 6.9).gridfinityDividerPositionsX!.forEach((p, i) => expect(p).toBeCloseTo([6.85, 14.55][i], 9));
  });

  it("puts the dividers' top 0.85 mm under the top, with the lip or without", () => {
    expect(gridfinityCompartments(bin({ gridfinityCompartmentsX: 2 }))!.top).toBeCloseTo(20.15, 9);
    expect(gridfinityCompartments(bin({ gridfinityCompartmentsX: 2, gridfinityLip: false, height: 21 }))!.top).toBeCloseTo(20.15, 9);
    expect(gridfinityCompartments(bin({ gridfinityCompartmentsX: 2, height: 14 + GRIDFINITY_LIP_HEIGHT }))!.top).toBeCloseTo(13.15, 9);
  });

  it("rounds every compartment's floor by 2.8 mm with a scoop or without, and repeats each scoop in every compartment on its side", () => {
    const fields = { gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2 };
    for (const scoop of [{}, { gridfinityScoopFront: true }]) {
      const pieces = gridfinityCompartmentPieces(bin({ ...fields, ...scoop }))!;
      expect(pieces.floorRounding, JSON.stringify(scoop)).toBeCloseTo(2.8, 9);
      expect(pieces.top, JSON.stringify(scoop)).toBeCloseTo(20.15, 9);
      expect(pieces.floor, JSON.stringify(scoop)).toBeCloseTo(5.95, 9);
      expect(pieces.thickness, JSON.stringify(scoop)).toBe(1.2);
      expect(pieces.cells.map(({ column, row }) => [column, row])).toEqual([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]);
    }
    expect(gridfinityCompartmentPieces(bin(fields))!.cells.every((cell) => cell.scoops === null)).toBe(true);
    expect(gridfinityCompartmentPieces(bin())).toBeNull();
    expect(gridfinityCompartmentPieces(bin({ ...fields, height: 7 + GRIDFINITY_LIP_HEIGHT }))).toBeNull();
    // The front scoop against the front wall in the front row and against the middle divider's back face in the back
    // row, each in the compartment's own frame, with the bin's radius, 6.7 for 3 units.
    expect(gridfinityScoopRadius(bin({ ...fields, gridfinityScoopFront: true }))).toBeCloseTo(6.7, 9);
    gridfinityCompartmentPieces(bin({ ...fields, gridfinityScoopFront: true }))!.cells.forEach((cell) => {
      const context = `${cell.column},${cell.row}`;
      expect(cell.inside.hx, context).toBeCloseTo(13.2, 9);
      expect(cell.inside.hz, context).toBeCloseTo(9.6, 9);
      expect(cell.inside.radius, context).toBeCloseTo(2.8, 9);
      expect(cell.centre.x, context).toBeCloseTo([-27.6, 0, 27.6][cell.column], 9);
      expect(cell.centre.z, context).toBeCloseTo([-10.2, 10.2][cell.row], 9);
      expect(cell.scoops!.radius, context).toBeCloseTo(6.7, 9);
      expect(cell.scoops!.floor, context).toBeCloseTo(5.95, 9);
      expect(cell.scoops!.centre[0], context).toBeCloseTo(6.68, 9);
      expect(cell.scoops!.centre[1], context).toBeCloseTo(12.63, 9);
      expect(cell.scoops!.inside, context).toEqual(cell.inside);
      expect(cell.scoops!.scoops, context).toHaveLength(1);
      expect(cell.scoops!.scoops[0].wall, context).toBe("front");
      expect(cell.scoops!.scoops[0].from, context).toBeCloseTo(-14.2, 9);
      expect(cell.scoops!.scoops[0].to, context).toBeCloseTo(14.2, 9);
    });
    // A left scoop runs along each compartment's left side, its depth.
    gridfinityCompartmentPieces(bin({ ...fields, gridfinityScoopLeft: true }))!.cells.forEach((cell) => {
      expect(cell.scoops!.scoops.map((s) => [s.wall, Number(s.from.toFixed(9)), Number(s.to.toFixed(9))])).toEqual([["left", -10.6, 10.6]]);
    });
  });

  it("makes a compartment's scoops smaller where they would leave less than 2 mm of floor, and leaves them out where even 3.5 mm would", () => {
    const cells = (fields: Record<string, unknown>) => gridfinityCompartmentPieces(bin({ gridfinityCompartmentsZ: 2, ...fields }))!.cells;
    const radius = (fields: Record<string, unknown>) => cells(fields).map((cell) => (cell.scoops ? Number(cell.scoops.radius.toFixed(9)) : null));
    const walls = (fields: Record<string, unknown>) => cells(fields).map((cell) => cell.scoops?.scoops.map((s) => s.wall) ?? null);
    // The divider 8.1 mm from the back wall leaves a back row 7.5 mm deep: a front scoop there takes 7.5 - 2 = 5.5 mm,
    // the front row (30.9 mm) keeps the bin's 6.7.
    expect(radius({ gridfinityScoopFront: true, gridfinityDividerPositionsZ: [8.1] })).toEqual([5.5, 6.7]);
    // Front and back scoops facing each other take half the row less 1 mm: 2.75 in the 7.5 mm row, under the smallest
    // radius, so both go; 9 mm keeps both at 3.5; 8.9 mm loses them.
    const facing = { gridfinityScoopFront: true, gridfinityScoopBack: true };
    expect(walls({ ...facing, gridfinityDividerPositionsZ: [8.1] })).toEqual([null, ["back", "front"]]);
    expect(radius({ ...facing, gridfinityDividerPositionsZ: [8.1] })).toEqual([null, 6.7]);
    expect(radius({ ...facing, gridfinityDividerPositionsZ: [9.6] })).toEqual([3.5, 6.7]);
    expect(walls({ ...facing, gridfinityDividerPositionsZ: [9.6] })).toEqual([["back", "front"], ["back", "front"]]);
    expect(walls({ ...facing, gridfinityDividerPositionsZ: [9.5] })).toEqual([null, ["back", "front"]]);
    // Each way on its own: in a column 7.5 mm wide the left and right scoops go and the front one stays, at the bin's radius.
    const column = gridfinityCompartmentPieces(bin({ gridfinityCompartmentsX: 2, gridfinityDividerPositionsX: [8.1], gridfinityScoopFront: true, gridfinityScoopLeft: true, gridfinityScoopRight: true }))!.cells;
    expect(column.map((cell) => cell.scoops!.scoops.map((s) => s.wall))).toEqual([["front"], ["front", "left", "right"]]);
    expect(column[0].scoops!.radius).toBeCloseTo(6.7, 9);
    // A radius a compartment makes smaller is kept off the 9.63 mm that runs through the corner of its roundings, as the bin's is.
    const corner = radius({ gridfinityScoopFront: true, gridfinityScoopRadius: 12, gridfinityDividerPositionsZ: [12.22] });
    expect(corner[0]).toBeCloseTo((2.8 + 0.02) / (1 - Math.SQRT1_2) - 0.03, 6);
    expect(corner[1]).toBe(12);
  });

  it("tells when a compartment is left without some of its scoops, not when a scoop is only made smaller", () => {
    const leftOut = (fields: Record<string, unknown>) => gridfinityScoopsLeftOut(bin({ gridfinityCompartmentsZ: 2, ...fields }));
    const facing = { gridfinityScoopFront: true, gridfinityScoopBack: true };
    expect(leftOut({ ...facing, gridfinityDividerPositionsZ: [8.1] })).toBe(true);
    expect(leftOut({ ...facing, gridfinityDividerPositionsZ: [9.6] })).toBe(false);
    expect(leftOut({ gridfinityScoopFront: true, gridfinityDividerPositionsZ: [8.1] })).toBe(false);
    expect(gridfinityScoopsLeftOut(bin({ gridfinityCompartmentsX: 2, gridfinityDividerPositionsX: [8.1], gridfinityScoopFront: true, gridfinityScoopLeft: true, gridfinityScoopRight: true }))).toBe(true);
    // Without dividers, or without scoops, nothing is left out.
    expect(gridfinityScoopsLeftOut(bin(facing))).toBe(false);
    expect(leftOut({ gridfinityDividerPositionsZ: [8.1] })).toBe(false);
  });

  it("bounds the volume the compartments' cut and the dividers must have, so the exact body can refuse one the kernel got wrong", () => {
    const fields = { gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2 };
    // 81.6 x 39.6 inside less six compartments of 26.4 x 19.2, each with its four corners rounded by 2.8 mm and the bin's
    // the same: 3224.63 - 6 x 500.15 = 223.73 mm² of dividers, standing straight from the floor at 5.95 to where the
    // lip's support leaves the wall, 19.35, or to their top at 20.15 without the lip. With the lip, from 19.35 to 20.15
    // the dividers 0.8 mm clear of the walls: 80 x 38 less compartments of 25.6 / 26.4 / 25.6 by 18.4, 184.32 mm².
    const corners = (4 - Math.PI) * 2.8 ** 2;
    const dividers = 81.6 * 39.6 - corners - 6 * (26.4 * 19.2 - corners);
    expect(dividers).toBeCloseTo(223.73, 2);
    const pieces = gridfinityCompartmentPieces(bin(fields))!;
    // There, the 8 rounded corners where two dividers meet count too.
    expect(gridfinityDividerBound(gridfinityPlan(bin(fields)), pieces)).toBeCloseTo(dividers * 13.4 + (184.32 + 2 * corners) * 0.8, 6);
    const open = bin({ ...fields, gridfinityLip: false, height: 21 });
    expect(gridfinityDividerBound(gridfinityPlan(open), gridfinityCompartmentPieces(open)!)).toBeCloseTo(dividers * 14.2, 6);
    // Each compartment's floor rounding: 68.8 mm of fillet, r² (1 - pi / 4) in section, and four corners of pi r³ / 12.
    const fillet = 2.8 ** 2 * (1 - Math.PI / 4);
    const rounding = 68.8 * fillet + (Math.PI * 2.8 ** 3) / 3;
    expect(gridfinityCompartmentFloorBound(gridfinityPlan(open), gridfinityCompartmentPieces(open)!)).toBeCloseTo(6 * rounding, 6);
    expect(6 * rounding).toBeCloseTo(832.456, 3);
    // A front scoop of 6.7 mm, its circle 6.68 out and up: at least 6.68² - pi 6.7² / 4 over the fillet, along the 20.8 mm
    // between the compartment's corners.
    const scooped = bin({ ...fields, gridfinityScoopFront: true });
    expect(gridfinityCompartmentFloorBound(gridfinityPlan(scooped), gridfinityCompartmentPieces(scooped)!)).toBeCloseTo(6 * (rounding + (6.68 ** 2 - (Math.PI * 6.7 ** 2) / 4 - fillet) * 20.8), 6);
    // A floor raised to 17.15, 2.2 mm under the lip's support: along the walls (179.2 mm) only the fillet under 2.2 mm,
    // along the dividers (233.6 mm) all of it; the 8 corners where two dividers meet whole, the 16 at a wall up to 2.2 mm.
    const raised = bin({ ...fields, gridfinityFloorHeight: 17.15 });
    const low = 2.8 * 2.2 - ((Math.PI * 2.8 ** 2) / 4 - (0.6 * Math.sqrt(2.8 ** 2 - 0.36) + 2.8 ** 2 * Math.asin(0.6 / 2.8)) / 2);
    expect(low).toBeCloseTo(1.6695, 4);
    expect(gridfinityCompartmentFloorBound(gridfinityPlan(raised), gridfinityCompartmentPieces(raised)!)).toBeCloseTo(179.2 * low + 233.6 * fillet + (8 * Math.PI * 2.8 ** 3) / 12 + (16 * Math.PI * (2.8 ** 3 - 0.6 ** 3)) / 12, 6);
    // Each compartment's cutter reaches 0.3 mm over the top, at most its section of 26.4 x 19.2 less the four corners.
    const section = 26.4 * 19.2 - (4 - Math.PI) * 2.8 ** 2;
    expect(gridfinityCompartmentCutBound(pieces, { box: 1000, cutters: [100, 100, 100, 100, 100, 100] })).toBeCloseTo(1000 + 600 - 6 * section * 0.3, 9);
    expect(gridfinityCompartmentCutBound(pieces, { box: 1000, cutters: [100, 100, 100, 100, 100, 100] })).toBeCloseTo(699.72984, 4);
  });

  /**
   * The mesh of a bin with dividers is closed, wound outwards and one piece, and really has them: the plain bin's mesh
   * is what Manifold falls back on, so it must hold the dividers' bound more than the plain bin and differ from it.
   */
  const expectDivided = (fields: Record<string, unknown>) => {
    const shape = bin(fields);
    const mesh = gridfinityLabelledTriangles(runtime, shape) as V[][];
    const plain = gridfinityTriangles(shape) as V[][];
    const context = JSON.stringify(fields);
    expect(edgeProblems(mesh), context).toBe(0);
    expect(components(mesh), context).toBe(1);
    expect(mesh, context).not.toEqual(plain);
    expect(signedVolume(mesh), context).toBeGreaterThan(signedVolume(plain) + gridfinityDividerBound(gridfinityPlan(shape), gridfinityCompartmentPieces(shape)!));
    return { mesh, plain };
  };

  it("draws bins of 3 x 2 compartments with dividers and scoops, closed and in one piece", () => {
    for (const fields of [
      { gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2, gridfinityScoopFront: true },
      { gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2 },
      { gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2, gridfinityLip: false, height: 21 },
      { gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2, gridfinityDividerPositionsX: [10, 60.3], gridfinityDividerPositionsZ: [25.5] },
      { gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2, gridfinityDividerThickness: 0.8 },
      { gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2, gridfinityDividerThickness: 3 },
      { gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2, gridfinityMagnets: true },
      { gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2, gridfinityFloorHeight: 10, gridfinityScoopFront: true },
      { gridfinityCompartmentsX: 2, gridfinityCompartmentsZ: 2, gridfinityHalfGrid: true, width: 41.5, depth: 41.5 },
      { gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2, height: 14 + GRIDFINITY_LIP_HEIGHT, gridfinityScoopFront: true },
      // Narrow rows: a scoop made smaller, and facing scoops left out.
      { gridfinityCompartmentsZ: 2, gridfinityDividerPositionsZ: [8.1], gridfinityScoopFront: true },
      { gridfinityCompartmentsZ: 2, gridfinityDividerPositionsZ: [8.1], gridfinityScoopFront: true, gridfinityScoopBack: true },
      // Wall shelves are not built in a bin with dividers: its labels are the compartments' own.
      { gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2, gridfinityLabelBack: true },
    ]) expectDivided(fields);
  });

  it("draws a scoop on each wall, and on all four, in every compartment on its side", () => {
    for (const wall of ["back", "front", "left", "right"] as const) expectDivided({ gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2, [GRIDFINITY_SCOOP_WALL_KEYS[wall]]: true });
    expectDivided({ gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2, gridfinityScoopFront: true, gridfinityScoopBack: true, gridfinityScoopLeft: true, gridfinityScoopRight: true });
    // The front scoop in each of the six compartments adds about 183 mm³ over the floor's rounding, as in the exact body.
    const { mesh } = expectDivided({ gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2, gridfinityScoopFront: true });
    const flat = expectDivided({ gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2 }).mesh;
    expect(signedVolume(mesh) - signedVolume(flat)).toBeCloseTo(6 * 183, -2);
  });

  for (const deep of [[1, 2, 3], [4, 5, 6]]) {
    it(`draws 1 to 6 compartments across in a bin of 3 x 2 x 4 units, ${deep[0]} to ${deep[2]} deep, with a front scoop`, () => {
      for (const nz of deep) {
        for (let nx = 1; nx <= 6; nx += 1) {
          if (nx > 1 || nz > 1) expectDivided({ width: 125.5, depth: 83.5, height: 28 + GRIDFINITY_LIP_HEIGHT, gridfinityScoopFront: true, gridfinityCompartmentsX: nx, gridfinityCompartmentsZ: nz });
        }
      }
    }, 20_000);
  }

  it("draws 40 compartments in a bin of 6 x 6 x 3 units, 4 x 10 and 8 x 5", () => {
    expectDivided({ ...large, gridfinityScoopFront: true, gridfinityCompartmentsX: 4, gridfinityCompartmentsZ: 10 });
    expectDivided({ ...large, gridfinityCompartmentsX: 8, gridfinityCompartmentsZ: 5 });
  }, 20_000);

  it("adds the dividers and every compartment's rounded floor to the mesh of a bin without the lip, as calculated by hand", () => {
    // As in the exact body: 3176.96 mm³ of dividers and 832.46 of floor rounding, the mesh's polygons within 1 %.
    const { mesh, plain } = expectDivided({ gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2, gridfinityLip: false, height: 21 });
    expect(Math.abs(signedVolume(mesh) - signedVolume(plain) - 4009.42) / 4009.42).toBeLessThan(0.01);
  });

  /** A bin of 2 x 1 x 3 units with 3 x 2 compartments of 26.4 x 19.2 and labels; the label pieces of one compartment. */
  const labelled = (labels: Record<string, unknown>[], fields: Record<string, unknown> = {}) => bin({ gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2, gridfinityCompartmentLabels: labels, ...fields });
  const labelOf = (shape: ReturnType<typeof bin>, column: number, row: number) => gridfinityCompartmentPieces(shape)!.cells.find((cell) => cell.column === column && cell.row === row)!.labels;

  it("builds the wall shelves of a bin with dividers no more, and keeps them for a bin without", () => {
    const shelves = { gridfinityLabelBack: true, gridfinityLabelLeft: true };
    expect(gridfinityLabelPieces(bin({ ...shelves, gridfinityCompartmentsX: 3 }))).toBeNull();
    expect(gridfinityLabelPieces(bin({ ...shelves, gridfinityCompartmentsX: 1 }))).not.toBeNull();
  });

  it("caps a compartment's label corner and width so that 6 mm of it stays open, and offers no label where that leaves less than 4 mm", () => {
    const shape = labelled([{ column: 1, row: 0, side: "back" }], { gridfinityLabelCornerSize: 10 });
    const cell = gridfinityCompartments(shape)!.cells[1];
    // min(10, 9.6 - 1 - 4) = 4.6; the width min(17.2048, 19.2 - 6 - 2) = 11.2 with the corner at 2.
    expect(gridfinityCompartmentCornerSize(shape, cell)).toBeCloseTo(4.6, 9);
    expect(gridfinityCompartmentCornerSize(labelled([]), cell)).toBe(2);
    expect(gridfinityCompartmentLabelMaxWidth(labelled([]), cell, "back")).toBeCloseTo(11.2, 9);
    expect(gridfinityCompartmentLabelMaxWidth(labelled([]), cell, "left")).toBeCloseTo(17.2048, 4);
    expect(gridfinityCompartmentLabel(labelled([{ column: 1, row: 0, side: "back" }]), 1, 0)).toMatchObject({ side: "back", length: 100, align: "middle" });
    expect(gridfinityCompartmentLabel(labelled([{ column: 1, row: 0, side: "back" }]), 1, 0)!.width).toBeCloseTo(11.2, 9);
    expect(gridfinityCompartmentLabel(labelled([{ column: 1, row: 0, side: "back", width: 30 }]), 1, 0)!.width).toBeCloseTo(11.2, 9);
    expect(gridfinityCompartmentLabel(labelled([{ column: 1, row: 0, side: "back", width: 1 }]), 1, 0)!.width).toBe(4);
    const back = labelOf(labelled([{ column: 1, row: 0, side: "back" }]), 1, 0)!;
    expect(back.shelves).toHaveLength(1);
    expect(back.shelves[0].profile.width).toBeCloseTo(11.2, 9);
    // A row 6 mm deep: no corner and no room for a back label, but a left one along it.
    const shallow = { gridfinityDividerPositionsZ: [6.6] };
    expect(labelOf(labelled([{ column: 0, row: 0, side: "back" }], shallow), 0, 0)).toBeNull();
    expect(gridfinityCompartmentLabel(labelled([{ column: 0, row: 0, side: "back" }], shallow), 0, 0)).toBeNull();
    expect(labelOf(labelled([{ column: 0, row: 0, side: "left" }], shallow), 0, 0)).not.toBeNull();
  });

  it("takes a compartment label's first entry, ignores those outside the compartments, and builds none in a bin under 3 height units", () => {
    const two = [{ column: 2, row: 1, side: "right" }, { column: 2, row: 1, side: "front" }, { column: 5, row: 0, side: "back" }];
    expect(gridfinityCompartmentLabel(labelled(two), 2, 1)!.side).toBe("right");
    expect(gridfinityCompartmentPieces(labelled(two))!.cells.filter((cell) => cell.labels)).toHaveLength(1);
    expect(gridfinityCompartmentPieces(labelled(two, { height: 14 + GRIDFINITY_LIP_HEIGHT }))!.cells.every((cell) => !cell.labels)).toBe(true);
  });

  it("builds a compartment label from 10 % to the full length of its side, hides one under 4 mm, and runs one into the corners from the snap", () => {
    const span = (label: Record<string, unknown>) => {
      const pieces = labelOf(labelled([{ column: 1, row: 0, side: "back", ...label }]), 1, 0);
      return pieces ? pieces.shelves[0].profile : null;
    };
    // 30 % of 26.4 is 7.92 mm, centred; 150 % is the full length, run 1 mm into the dividers.
    expect(span({ length: 30 })!.to - span({ length: 30 })!.from).toBeCloseTo(7.92, 9);
    expect(span({ length: 150 })!.from).toBeCloseTo(-14.2, 9);
    expect(span({ length: 150 })!.to).toBeCloseTo(14.2, 9);
    // 10 % at the least, 2.64 mm, and 15 %, 3.96 mm, are under 4 mm and hidden; 16 % is 4.22.
    expect(span({ length: 5 })).toBeNull();
    expect(span({ length: 15 })).toBeNull();
    expect(span({ length: 16 })!.to - span({ length: 16 })!.from).toBeCloseTo(4.224, 9);
    // Start and end: one end runs into the divider, towards -x and towards +x on a back side.
    expect(span({ length: 50, align: "start" })!.from).toBeCloseTo(-14.2, 9);
    expect(span({ length: 50, align: "start" })!.to).toBeCloseTo(0, 9);
    expect(span({ length: 50, align: "end" })!.from).toBeCloseTo(0, 9);
    // On a left side start is towards -z, the back: the label's u runs towards the back there.
    const left = labelOf(labelled([{ column: 1, row: 0, side: "left", length: 50, align: "start" }]), 1, 0)!.shelves[0].profile;
    expect(left.to).toBeCloseTo(10.6, 9);
    expect(left.from).toBeCloseTo(0, 9);
  });

  it("snaps a label's end, or its end piece's outer edge, within 0.05 mm of the compartment's corner rounding onto it", () => {
    const ends = (length: number, align: string) => {
      const { from, to } = labelOf(labelled([{ column: 1, row: 0, side: "back", length, align }]), 1, 0)!.shelves[0].profile;
      return [Number(from.toFixed(9)), Number(to.toFixed(9))];
    };
    // The middle compartment's rounding starts 2.8 mm in from its sides, at x -10.4 and 10.4.
    expect(ends(78.9, "middle")).toEqual([-10.4, 10.4]);
    expect(ends(79.5, "middle")).toEqual([-10.494, 10.494]);
    // A 2 mm end piece beside a free end: its outer edge 2 mm further out, onto the rounding, puts the end at 8.4.
    expect(ends(81.85, "start")).toEqual([-14.2, 8.4]);
    expect(ends(89.39, "start")).toEqual([-14.2, 10.4]);
    expect(ends(89.5, "start")).toEqual([-14.2, 10.4]);
    expect(ends(89.8, "start")[1]).toBeCloseTo(10.5072, 9);
    expect(ends(81.85, "end")).toEqual([-8.4, 14.2]);
  });

  it("draws compartment labels on every side, round and chamfered, closed and in one piece, kept to their compartment", () => {
    for (const side of ["back", "front", "left", "right"]) {
      for (const corner of [{}, { gridfinityLabelCorner: "chamfer" }, { gridfinityLabelCornerSize: 0 }, { gridfinityLabelCornerSize: 10 }]) {
        const labels = [0, 1, 2].flatMap((column) => [0, 1].map((row) => ({ column, row, side, length: [100, 50, 30][column], align: ["middle", "start", "end"][(column + row) % 3], width: 8 })));
        const shape = labelled(labels, { gridfinityScoopFront: true, ...corner });
        const { mesh } = expectDivided({ gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2, gridfinityCompartmentLabels: labels, gridfinityScoopFront: true, ...corner });
        const plainLabels = gridfinityLabelledTriangles(runtime, labelled([], { gridfinityScoopFront: true, ...corner })) as V[][];
        expect(signedVolume(mesh), `${side} ${JSON.stringify(corner)}`).toBeGreaterThan(signedVolume(plainLabels) + 6 * 25);
        // Every piece stays within its compartment and LABEL_PAST behind its side.
        gridfinityCompartmentPieces(shape)!.cells.forEach((cell) => {
          const pieces = cell.labels!;
          const along = side === "back" || side === "front" ? cell.inside.hx : cell.inside.hz;
          pieces.shelves.forEach(({ profile }) => {
            expect(profile.from, side).toBeGreaterThanOrEqual(-along - 1 - 1e-9);
            expect(profile.to, side).toBeLessThanOrEqual(along + 1 + 1e-9);
          });
          [...pieces.corners, ...pieces.shelves.flatMap((shelf) => shelf.notches)].forEach((c) => {
            expect(Math.abs(c.at.x), side).toBeLessThanOrEqual(cell.inside.hx + 1e-9);
            expect(Math.abs(c.at.z), side).toBeLessThanOrEqual(cell.inside.hz + 1e-9);
          });
        });
      }
    }
  });

  it("writes a count of 1 as unset and puts that axis's dividers back evenly spaced when the count changes", () => {
    // Written as undefined, not left out, so that applying the patch takes the stored places away.
    expect(gridfinityCompartmentCountPatch("x", 1)).toStrictEqual({ gridfinityCompartmentsX: undefined, gridfinityDividerPositionsX: undefined });
    expect(gridfinityCompartmentCountPatch("x", 3)).toStrictEqual({ gridfinityCompartmentsX: 3, gridfinityDividerPositionsX: undefined });
    expect(gridfinityCompartmentCountPatch("z", 2)).toStrictEqual({ gridfinityCompartmentsZ: 2, gridfinityDividerPositionsZ: undefined });
    // A divider moved, then 3 across made 4 and 3 again: the dividers are evenly spaced once more.
    let shape: Record<string, unknown> = { gridfinityCompartmentsX: 3 };
    shape = { ...shape, ...gridfinityDividerPositionPatch(bin(shape), "x", 0, 30) };
    expect(gridfinityDividerPositions(bin(shape), "x")[0]).toBeCloseTo(30, 9);
    shape = { ...shape, ...gridfinityCompartmentCountPatch("x", 4) };
    shape = { ...shape, ...gridfinityCompartmentCountPatch("x", 3) };
    gridfinityDividerPositions(bin(shape), "x").forEach((p, i) => expect(p).toBeCloseTo([27, 54.6][i], 9));
    // The other axis's dividers stay where they were moved.
    expect(gridfinityCompartmentCountPatch("x", 3)).not.toHaveProperty("gridfinityDividerPositionsZ");
    expect(gridfinityCompartmentCountPatch("z", 1)).not.toHaveProperty("gridfinityDividerPositionsX");
  });

  it("keeps moved dividers where they are when the bin is resized, and spaces those never moved evenly", () => {
    const fields = { gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2 };
    const close = (positions: number[], expected: number[], context = "") => {
      expect(positions, context).toHaveLength(expected.length);
      positions.forEach((p, i) => expect(p, context).toBeCloseTo(expected[i], 9));
    };
    close(gridfinityDividerPositions(bin(fields), "x"), [27, 54.6]);
    // Never moved, 3 units across: (123.6 - 2.4) / 3 = 40.4 a compartment.
    close(gridfinityDividerPositions(bin({ ...fields, width: 125.5 }), "x"), [41, 82.6]);
    // Moving one divider writes its axis's whole list, the others where they are built.
    const moved = gridfinityDividerPositionPatch(bin(fields), "x", 0, 30);
    expect(Object.keys(moved)).toEqual(["gridfinityDividerPositionsX"]);
    close(moved.gridfinityDividerPositionsX!, [30, 54.6]);
    close(gridfinityDividerPositions(bin({ ...fields, ...moved, width: 125.5 }), "x"), [30, 54.6]);
    close(gridfinityDividerPositions(bin({ ...fields, ...moved, width: 125.5 }), "z"), [19.8]);
    // The deep axis was never moved: 2 units deep, (81.6 - 1.2) / 2 = 40.2 a compartment.
    close(gridfinityDividerPositions(bin({ ...fields, ...moved, depth: 83.5 }), "z"), [40.8]);
    // A moved divider is kept within the room its neighbours leave it, also in a bin made smaller.
    close(gridfinityDividerPositionPatch(bin(fields), "x", 1, 10).gridfinityDividerPositionsX!, [27, 34.2]);
    close(gridfinityDividerPositions(bin({ width: 41.5, gridfinityCompartmentsX: 2, gridfinityDividerPositionsX: [120] }), "x"), [33]);
    expect(gridfinityDividerPositionPatch(bin(fields), "x", 2, 30)).toEqual({});
  });

  it("takes the lists of dividers and labels as lists, and [] as unset", () => {
    expect(normalizeGridfinityDividerPositions([20, 40.5])).toEqual([20, 40.5]);
    expect(normalizeGridfinityDividerPositions("[20,40.5]")).toBeUndefined();
    expect(normalizeGridfinityDividerPositions([20, "x", Number.NaN, 30])).toEqual([20, 30]);
    expect(normalizeGridfinityDividerPositions([])).toEqual([]);
    expect(normalizeGridfinityDividerPositions(Array.from({ length: 30 }, (_, i) => i))).toHaveLength(23);
    expect(normalizeGridfinityDividerPositions("not a list")).toBeUndefined();
    expect(normalizeGridfinityDividerPositions(20)).toBeUndefined();
    const label = { column: 1, row: 0, side: "back", length: 50, align: "start", width: 8 };
    expect(normalizeGridfinityCompartmentLabels([label])).toEqual([label]);
    expect(normalizeGridfinityCompartmentLabels(JSON.stringify([label]))).toBeUndefined();
    // A label on an unknown side or without its compartment is left out; a value of the wrong kind is left unset.
    expect(normalizeGridfinityCompartmentLabels([{ column: 0, row: 0, side: "top" }, { row: 0, side: "back" }, "back", { column: 1.2, row: 2, side: "left", align: "up", width: "8" }])).toEqual([{ column: 1, row: 2, side: "left" }]);
    // One for each compartment any count could give, 24 x 24, so labels outside the current counts survive a change of count.
    expect(normalizeGridfinityCompartmentLabels(Array.from({ length: 600 }, (_, i) => ({ column: i % 24, row: Math.floor(i / 24), side: "front" })))).toHaveLength(576);
    expect(normalizeGridfinityCompartmentLabels({ column: 0 })).toBeUndefined();
    // What the MCP writes: only the lists it was given, an empty one as unset.
    expect(gridfinityListPatch({ gridfinityDividerPositionsX: [30, 54.6], gridfinityCompartmentLabels: [] })).toStrictEqual({ gridfinityDividerPositionsX: [30, 54.6], gridfinityCompartmentLabels: undefined });
    expect(gridfinityListPatch({ gridfinityDividerPositionsZ: [] })).toStrictEqual({ gridfinityDividerPositionsZ: undefined });
    expect(gridfinityListPatch({ gridfinityDividerPositionsZ: "nonsense", width: 40 })).toEqual({});
    // A count puts that axis's dividers back evenly spaced, as the settings window does, unless the same action places them.
    expect(gridfinityListPatch({ gridfinityCompartmentsX: 3 })).toStrictEqual({ gridfinityCompartmentsX: 3, gridfinityDividerPositionsX: undefined });
    expect(gridfinityListPatch({ gridfinityCompartmentsZ: 1 })).toStrictEqual({ gridfinityCompartmentsZ: undefined, gridfinityDividerPositionsZ: undefined });
    expect(gridfinityListPatch({ gridfinityCompartmentsX: 2.6, gridfinityDividerPositionsX: [30, 50] })).toEqual({ gridfinityCompartmentsX: 3, gridfinityDividerPositionsX: [30, 50] });
    expect(gridfinityListPatch({ gridfinityCompartmentsX: "3" })).toEqual({});
    // Through the MCP the lists also come as the JSON text layerling_read_scene reports them in; text that is no list is unset.
    const params = mcpGridfinityListParams({ gridfinityDividerPositionsX: "[30,54.6]", gridfinityDividerPositionsZ: "not a list", gridfinityCompartmentLabels: [label], gridfinityCompartmentsX: 3, width: 40 });
    expect(params).toStrictEqual({ gridfinityDividerPositionsX: [30, 54.6], gridfinityDividerPositionsZ: undefined, gridfinityCompartmentLabels: [label], gridfinityCompartmentsX: 3, width: 40 });
    expect(mcpGridfinityListParams({ gridfinityCompartmentLabels: JSON.stringify([label]), gridfinityDividerPositionsZ: "{}" })).toStrictEqual({ gridfinityCompartmentLabels: [label], gridfinityDividerPositionsZ: undefined });
    expect(gridfinityListPatch(params)).toStrictEqual({ gridfinityCompartmentsX: 3, gridfinityDividerPositionsX: [30, 54.6], gridfinityCompartmentLabels: [label] });
    expect(mcpGridfinityListParams({ width: 40 })).toStrictEqual({ width: 40 });
  });

  it("tells every divider setting apart and keeps them through a saved project, and keeps only the counts and the thickness as settings", async () => {
    const counts = { gridfinityCompartmentsX: 3, gridfinityCompartmentsZ: 2, gridfinityDividerThickness: 1.6 };
    const lists = {
      gridfinityDividerPositionsX: [25, 55],
      gridfinityDividerPositionsZ: [18],
      gridfinityCompartmentLabels: [{ column: 0, row: 0, side: "back" as const, length: 50, align: "start" as const, width: 8 }, { column: 2, row: 1, side: "right" as const }],
    };
    const settings = { ...counts, ...lists };
    const shape = canonicalizeShape(binShape(settings));
    const [label, other] = lists.gridfinityCompartmentLabels;
    for (const change of [
      { gridfinityCompartmentsX: 4 },
      { gridfinityCompartmentsZ: 1 },
      { gridfinityDividerThickness: 2 },
      { gridfinityDividerPositionsX: [25, 56] },
      { gridfinityDividerPositionsX: [25] },
      { gridfinityDividerPositionsZ: undefined },
      { gridfinityCompartmentLabels: [label] },
      { gridfinityCompartmentLabels: [{ ...label, column: 1 }, other] },
      { gridfinityCompartmentLabels: [{ ...label, row: 1 }, other] },
      { gridfinityCompartmentLabels: [{ ...label, side: "front" as const }, other] },
      { gridfinityCompartmentLabels: [{ ...label, length: 60 }, other] },
      { gridfinityCompartmentLabels: [{ ...label, align: "end" as const }, other] },
      { gridfinityCompartmentLabels: [{ ...label, width: 9 }, other] },
    ]) {
      expect(workplaneShapesEqual(shape, { ...shape, ...change }), JSON.stringify(change)).toBe(false);
    }
    expect(workplaneShapesEqual(shape, { ...shape, gridfinityDividerPositionsX: [25, 55], gridfinityCompartmentLabels: [{ ...label }, { ...other }] })).toBe(true);
    const save = (shapes: WorkplaneShape[]) => exportLylProject({
      projectId: "dividers",
      projectName: "Dividers",
      createdAt: 1_700_000_000_000,
      modifiedAt: 1_700_000_100_000,
      shapes,
      history: [editorHistoryEntry(shapes, [])],
      historyIndex: 0,
      assets: [],
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      snapGrid: DEFAULT_SNAP_GRID,
      placementElevation: 0,
    });
    const [loaded] = (await importLylProject(await save([shape]))).shapes;
    expect(workplaneShapesEqual(loaded, shape)).toBe(true);
    expect(loaded).toMatchObject(settings);
    // A count that is not whole loads as it was saved and is built rounded.
    const [halfCount] = (await importLylProject(await save([canonicalizeShape(binShape({ gridfinityCompartmentsX: 1.5 }))]))).shapes;
    expect(halfCount.gridfinityCompartmentsX).toBe(1.5);
    expect(gridfinityCompartmentCount(halfCount, "x")).toBe(2);
    for (const wrong of [{ gridfinityCompartmentLabels: [{ column: 0, row: 0, side: "top" }] }, { gridfinityDividerPositionsX: ["x"] }, { gridfinityDividerPositionsX: 20 }, { gridfinityDividerPositionsX: [-1] }, { gridfinityDividerPositionsX: [2e6] }, { gridfinityDividerPositionsX: Array(65).fill(10) }, { gridfinityCompartmentLabels: [{ column: -1, row: 0, side: "back" }] }]) {
      await expect(importLylProject(await save([{ ...shape, ...wrong } as WorkplaneShape])), JSON.stringify(wrong)).rejects.toThrow();
    }
    expect(sceneShape(shape)).toMatchObject(settings);
    expect(cadModifierGridfinityForShape(shape)).toMatchObject(settings);
    // The settings a new shape or an MCP action takes and a bin kept as the default have the counts and the thickness;
    // the dividers' places and the labels belong to one bin's size.
    const kept = normalizeShapeCustomizations({ gridfinity: settings }, {}).gridfinity!;
    expect(kept).toMatchObject(counts);
    Object.keys(lists).forEach((key) => expect(kept, key).not.toHaveProperty(key));
    const defaults = shapeDefaultsFromShape(shape)!;
    expect(defaults).toMatchObject(counts);
    Object.keys(lists).forEach((key) => expect(defaults, key).not.toHaveProperty(key));
    const asset = toolbarShapeAssets.find((entry) => entry.kind === "gridfinity")!;
    expect(makeShapeFromAsset(asset, { x: 0, z: 0 }, counts)).toMatchObject(counts);
  });

  it("keeps what the MCP gives within what a saved project takes, so it opens again and builds as it did", async () => {
    const save = (shapes: WorkplaneShape[]) => exportLylProject({ projectId: "p", projectName: "P", createdAt: 1, modifiedAt: 2, shapes, history: [editorHistoryEntry(shapes, [])], historyIndex: 0, assets: [], workspace: DEFAULT_WORKPLANE_WORKSPACE, snapGrid: DEFAULT_SNAP_GRID, placementElevation: 0 });
    for (const params of [
      { gridfinityCompartmentsX: 3, gridfinityDividerPositionsX: [-5, 50] },
      { gridfinityCompartmentsX: 3, gridfinityDividerPositionsX: [20, 2e6] },
      { gridfinityCompartmentsX: 3, gridfinityCompartmentLabels: [{ column: 0, row: 0, side: "back", width: -2 }] },
      { gridfinityCompartmentsX: 3, gridfinityCompartmentLabels: [{ column: 0, row: 0, side: "back", length: -10 }] },
      { gridfinityCompartmentsX: 3, gridfinityCompartmentLabels: [{ column: 2e6, row: 0, side: "back" }, { column: 1, row: 0, side: "back", length: 1e7, width: 2e6 }] },
      { gridfinityCompartmentsX: 5e6, gridfinityCompartmentsZ: -4 },
    ] as Array<Record<string, unknown>>) {
      const context = JSON.stringify(params);
      const raw = canonicalizeShape(binShape(params));
      const shape = canonicalizeShape(binShape({ ...normalizeShapeCustomizations({ gridfinity: params }, {}).gridfinity, ...gridfinityListPatch(mcpGridfinityListParams(params)) }));
      const [loaded] = (await importLylProject(await save([shape]))).shapes;
      expect(workplaneShapesEqual(loaded, shape), context).toBe(true);
      // Kept within range only where the bin would clamp it anyway.
      for (const axis of ["x", "z"] as const) expect(gridfinityDividerPositions(loaded, axis), context).toEqual(gridfinityDividerPositions(raw, axis));
      expect(JSON.stringify(gridfinityCompartmentPieces(loaded)?.cells.map((cell) => cell.labels)), context).toBe(JSON.stringify(gridfinityCompartmentPieces(raw)?.cells.map((cell) => cell.labels)));
    }
  });

  it("reports the counts and the thickness to the MCP as numbers and the lists as JSON text", () => {
    const shape = canonicalizeShape(binShape({ gridfinityCompartmentsX: 3, gridfinityDividerThickness: 1.6, gridfinityDividerPositionsX: [25, 55], gridfinityCompartmentLabels: [{ column: 0, row: 0, side: "back" }] }));
    const { settings } = mcpShapeSummary(shape);
    expect(settings).toMatchObject({ gridfinityCompartmentsX: 3, gridfinityDividerThickness: 1.6, gridfinityDividerPositionsX: "[25,55]", gridfinityCompartmentLabels: '[{"column":0,"row":0,"side":"back"}]' });
    expect(normalizeGridfinityDividerPositions(JSON.parse(String(settings!.gridfinityDividerPositionsX)))).toEqual([25, 55]);
  });
});
