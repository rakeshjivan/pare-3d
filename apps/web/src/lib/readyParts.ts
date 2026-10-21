import { createLocalId } from "@/lib/localIds";
import { libraryShapeAssets, makeShapeFromAsset } from "@/lib/shapeCatalog";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * Fork: ready-made parts for 3D printing, built from the editor's own shapes so they save,
 * export, undo and edit like anything else:
 *
 * - Paraboloid: a smooth dome with a flat base (a Tinkercad basic shape), as a mesh.
 * - Heat-set insert hole: a round hole sized for a brass insert (M2 to M5).
 * - Nut trap: a hexagonal pocket for a nut with the bolt's clearance hole through it.
 * - Box with lid: a box with even walls and a lift-off lid whose lip fits inside it.
 *
 * Sizes are in mm. All parts stand on the plate (elevation 0) around x = z = 0; the editor then
 * lets them hang on the pointer and sit down where the user clicks.
 */

export type MetricSize = "M2" | "M2.5" | "M3" | "M4" | "M5";
export const METRIC_SIZES: MetricSize[] = ["M2", "M2.5", "M3", "M4", "M5"];

/**
 * Heat-set inserts: the hole the common brass inserts (the short "standard" kind sold for 3D
 * prints) are pressed into, and how deep it is - the insert's length plus 1 mm for the plastic
 * it pushes ahead of it. Makers differ by a few tenths; the hole can be resized like any shape.
 */
export const INSERT_HOLES: Record<MetricSize, { diameter: number; depth: number }> = {
  M2: { diameter: 3.2, depth: 5 },
  "M2.5": { diameter: 3.6, depth: 6.7 },
  M3: { diameter: 4.0, depth: 6.7 },
  M4: { diameter: 5.6, depth: 9.1 },
  M5: { diameter: 6.4, depth: 10.5 },
};

/**
 * Hex nuts (ISO 4032): across flats and thickness, and the bolt's clearance hole (ISO 273,
 * medium). The pocket is made 0.3 mm wider and deeper than the nut so it drops in.
 */
export const NUTS: Record<MetricSize, { acrossFlats: number; thickness: number; clearance: number }> = {
  M2: { acrossFlats: 4.0, thickness: 1.6, clearance: 2.4 },
  "M2.5": { acrossFlats: 5.0, thickness: 2.0, clearance: 2.9 },
  M3: { acrossFlats: 5.5, thickness: 2.4, clearance: 3.4 },
  M4: { acrossFlats: 7.0, thickness: 3.2, clearance: 4.5 },
  M5: { acrossFlats: 8.0, thickness: 4.7, clearance: 5.5 },
};
export const NUT_POCKET_CLEARANCE = 0.3;
export const NUT_TRAP_BOLT_LENGTH = 12;

const SMOOTH_SIDES = 64;

function asset(id: string) {
  const found = libraryShapeAssets.find((entry) => entry.id === id);
  if (!found) throw new Error(`No ${id} shape in the library`);
  return found;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * One body to add, or several to group into one (holes cut the solids). `parts` are grouped
 * first and join the group as one body each.
 */
export type ReadyPart = { name: string; shapes: WorkplaneShape[]; group: boolean; parts?: ReadyPart[] };

export function insertHolePart(size: MetricSize, name: string): ReadyPart {
  const { diameter, depth } = INSERT_HOLES[size];
  const hole = makeShapeFromAsset(asset("cylinder"), { x: 0, z: 0, elevation: 0 }, { width: diameter, depth: diameter, height: depth, sides: SMOOTH_SIDES });
  return { name, shapes: [{ ...hole, name, hole: true }], group: false };
}

export function nutTrapPart(size: MetricSize, name: string): ReadyPart {
  const nut = NUTS[size];
  const flats = round(nut.acrossFlats + NUT_POCKET_CLEARANCE);
  // A six-sided polygon is as wide as its flats and as deep as its corners.
  const corners = round(flats * 2 / Math.sqrt(3));
  const pocket = makeShapeFromAsset(asset("polygon"), { x: 0, z: 0, elevation: 0 }, { width: flats, depth: corners, height: round(nut.thickness + NUT_POCKET_CLEARANCE), sides: 6 });
  const bolt = makeShapeFromAsset(asset("cylinder"), { x: 0, z: 0, elevation: 0 }, { width: nut.clearance, depth: nut.clearance, height: NUT_TRAP_BOLT_LENGTH, sides: SMOOTH_SIDES });
  return {
    name,
    shapes: [{ ...pocket, name: `${name} (nut)`, hole: true }, { ...bolt, name: `${name} (bolt)`, hole: true }],
    group: true,
  };
}

export type BoxWithLidOptions = {
  /** Inside of the box. */
  width: number;
  depth: number;
  height: number;
  wall: number;
  /** Added between the lid's lip and the box's inside, all round: 0.1 press, 0.2 snug, 0.4 loose. */
  clearance: number;
};

export const DEFAULT_BOX_WITH_LID: BoxWithLidOptions = { width: 60, depth: 40, height: 30, wall: 2, clearance: 0.2 };
export const LID_THICKNESS = 2;
export const LID_LIP_HEIGHT = 5;
export const LID_LIP_WALL = 1.6;
/** Between the box and its lid on the plate. */
const PART_GAP = 10;

export function normalizeBoxWithLid(options: Partial<BoxWithLidOptions>): BoxWithLidOptions {
  const merged = { ...DEFAULT_BOX_WITH_LID, ...options };
  const clamp = (value: number, min: number, max: number, fallback: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
  return {
    width: clamp(merged.width, 10, 1000, DEFAULT_BOX_WITH_LID.width),
    depth: clamp(merged.depth, 10, 1000, DEFAULT_BOX_WITH_LID.depth),
    height: clamp(merged.height, 5, 1000, DEFAULT_BOX_WITH_LID.height),
    wall: clamp(merged.wall, 0.8, 10, DEFAULT_BOX_WITH_LID.wall),
    clearance: clamp(merged.clearance, 0, 1, DEFAULT_BOX_WITH_LID.clearance),
  };
}

/**
 * The box and its lid, side by side, each as parts to group. The lid lies upside down - plate on
 * the bed, lip up - the way it prints; turned over, its lip drops inside the box.
 */
export function boxWithLidParts(raw: Partial<BoxWithLidOptions>, names: { box: string; lid: string }): ReadyPart[] {
  const o = normalizeBoxWithLid(raw);
  const outerWidth = round(o.width + 2 * o.wall);
  const outerDepth = round(o.depth + 2 * o.wall);
  const boxCentre = -(outerWidth / 2 + PART_GAP / 2);
  const lidCentre = outerWidth / 2 + PART_GAP / 2;
  const box = makeShapeFromAsset(asset("box"), { x: boxCentre, z: 0, elevation: 0 }, { width: outerWidth, depth: outerDepth, height: round(o.height + o.wall) });
  // The inside reaches 1 mm past the rim so the cut leaves no skin at the top.
  const inside = makeShapeFromAsset(asset("box"), { x: boxCentre, z: 0, elevation: o.wall }, { width: o.width, depth: o.depth, height: round(o.height + 1) });

  const plate = makeShapeFromAsset(asset("box"), { x: lidCentre, z: 0, elevation: 0 }, { width: outerWidth, depth: outerDepth, height: LID_THICKNESS });
  const lipWidth = round(o.width - 2 * o.clearance);
  const lipDepth = round(o.depth - 2 * o.clearance);
  const lip = makeShapeFromAsset(asset("box"), { x: lidCentre, z: 0, elevation: LID_THICKNESS }, { width: lipWidth, depth: lipDepth, height: LID_LIP_HEIGHT });
  const lipInside = makeShapeFromAsset(asset("box"), { x: lidCentre, z: 0, elevation: LID_THICKNESS }, { width: round(lipWidth - 2 * LID_LIP_WALL), depth: round(lipDepth - 2 * LID_LIP_WALL), height: LID_LIP_HEIGHT + 1 });
  return [
    { name: names.box, shapes: [{ ...box, name: names.box }, { ...inside, name: `${names.box} (inside)`, hole: true }], group: true },
    // The lip's hollow is cut first, then the ring joins the plate.
    {
      name: names.lid,
      shapes: [{ ...plate, name: names.lid }],
      group: true,
      parts: [{ name: `${names.lid} (lip)`, shapes: [{ ...lip, name: `${names.lid} (lip)` }, { ...lipInside, name: `${names.lid} (lip inside)`, hole: true }], group: true }],
    },
  ];
}

/**
 * A paraboloid with a flat base: radius r(y) = R * sqrt(1 - y / H), as a closed triangle mesh
 * standing on y = 0. Resizing keeps it a paraboloid (an elliptic one when width and depth differ).
 */
export function paraboloidPart(name: string, color: string, size = 20, height = 20, sides = 64, rings = 32): ReadyPart {
  const radius = size / 2;
  const positions: number[] = [];
  const ring = (index: number) => {
    const y = (index / rings) * height;
    return { y, r: radius * Math.sqrt(Math.max(0, 1 - y / height)) };
  };
  const point = (r: number, y: number, step: number): [number, number, number] => {
    const angle = (step / sides) * Math.PI * 2;
    return [r * Math.cos(angle), y, r * Math.sin(angle)];
  };
  // Every triangle faces outwards: away from the axis on the side, down on the base.
  const push = (a: number[], b: number[], c: number[], outward: number[]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const flip = n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0;
    positions.push(...a, ...(flip ? c : b), ...(flip ? b : c));
  };
  for (let index = 0; index < rings; index += 1) {
    const low = ring(index);
    const high = ring(index + 1);
    for (let step = 0; step < sides; step += 1) {
      const a = point(low.r, low.y, step);
      const b = point(low.r, low.y, step + 1);
      const middle = point(1, 0, step + 0.5);
      // The outward direction: away from the axis, tilted up as the dome closes.
      const slope = high.r < 1e-9 ? 1 : (low.r - high.r) / (high.y - low.y);
      const outward = [middle[0], slope, middle[2]];
      if (high.r < 1e-9) {
        push(a, b, [0, high.y, 0], outward);
      } else {
        const c = point(high.r, high.y, step);
        const d = point(high.r, high.y, step + 1);
        push(a, b, d, outward);
        push(a, d, c, outward);
      }
    }
  }
  for (let step = 0; step < sides; step += 1) {
    push([0, 0, 0], point(radius, 0, step), point(radius, 0, step + 1), [0, -1, 0]);
  }
  const shape: WorkplaneShape = {
    id: createLocalId("paraboloid"),
    name,
    kind: "mesh",
    color,
    x: 0,
    z: 0,
    elevation: 0,
    size,
    width: size,
    depth: size,
    height,
    rotation: 0,
    importedMesh: {
      positions,
      baseWidth: size,
      baseDepth: size,
      baseHeight: height,
      triangleCount: positions.length / 9,
      sourceFormat: "json",
    },
    locked: false,
    hidden: false,
  };
  return { name, shapes: [shape], group: false };
}
