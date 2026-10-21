import * as THREE from "three";
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
  /** Compartments across (columns) and front to back (rows); the dividers are as thick as the wall. */
  columns: number;
  rows: number;
  /** Rounding of the compartments' corners and floors (a scoop that is easy to empty); the outside follows. */
  radius: number;
  lid: boolean;
  /** How high the dividers stand above the floor; null for the full height (less when a lid or a box above needs room). */
  dividerHeight: number | null;
  /** A stepped foot that sits inside the rim of the box below, so boxes stack without sliding. */
  stackable: boolean;
};

export const DEFAULT_BOX_WITH_LID: BoxWithLidOptions = { width: 60, depth: 40, height: 30, wall: 2, clearance: 0.2, columns: 1, rows: 1, radius: 0, lid: true, dividerHeight: null, stackable: false };
/** The stacking foot's height; the box below keeps this much (and a little) free under its rim. */
export const STACK_FOOT = 3;
export const LID_THICKNESS = 2;
export const LID_LIP_HEIGHT = 5;
export const LID_LIP_WALL = 1.6;
/** The top of the dividers below the rim: room for a lid's lip, the foot of a box stacked on top, or a lower choice. */
export function dividerDrop(o: BoxWithLidOptions) {
  const needed = Math.max(o.lid ? DIVIDER_DROP : 0, o.stackable ? STACK_FOOT + 0.5 : 0);
  const chosen = o.dividerHeight === null ? 0 : o.height - o.dividerHeight;
  return Math.min(o.height - 1, Math.max(needed, chosen));
}

/** With a lid, the dividers stop this far below the rim so the lid's lip fits in over them. */
export const DIVIDER_DROP = LID_LIP_HEIGHT + 0.5;
export const MAX_COMPARTMENTS = 12;
/** Between the box and its lid on the plate. */
const PART_GAP = 10;

export function normalizeBoxWithLid(options: Partial<BoxWithLidOptions>): BoxWithLidOptions {
  const merged = { ...DEFAULT_BOX_WITH_LID, ...options };
  const clamp = (value: number, min: number, max: number, fallback: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
  const width = clamp(merged.width, 10, 1000, DEFAULT_BOX_WITH_LID.width);
  const depth = clamp(merged.depth, 10, 1000, DEFAULT_BOX_WITH_LID.depth);
  const height = clamp(merged.height, 5, 1000, DEFAULT_BOX_WITH_LID.height);
  const wall = clamp(merged.wall, 0.8, 10, DEFAULT_BOX_WITH_LID.wall);
  const columns = Math.round(clamp(merged.columns, 1, MAX_COMPARTMENTS, 1));
  const rows = Math.round(clamp(merged.rows, 1, MAX_COMPARTMENTS, 1));
  // A compartment keeps at least 5 mm each way; its rounding at most half its narrow side.
  const cellWidth = (width - (columns - 1) * wall) / columns;
  const cellDepth = (depth - (rows - 1) * wall) / rows;
  const fits = cellWidth >= 5 && cellDepth >= 5;
  return {
    width,
    depth,
    height,
    wall,
    clearance: clamp(merged.clearance, 0, 1, DEFAULT_BOX_WITH_LID.clearance),
    columns: fits ? columns : 1,
    rows: fits ? rows : 1,
    radius: clamp(merged.radius, 0, Math.min(fits ? Math.min(cellWidth, cellDepth) : Math.min(width, depth), height) / 2, 0),
    lid: merged.lid !== false,
    dividerHeight: merged.dividerHeight === null || merged.dividerHeight === undefined || !Number.isFinite(merged.dividerHeight) || merged.dividerHeight >= height
      ? null
      : Math.max(1, merged.dividerHeight),
    stackable: Boolean(merged.stackable),
  };
}

/** A box, or a box with rounded corners (and floor edges) when a radius is given. */
function block(x: number, z: number, elevation: number, width: number, depth: number, height: number, corner: number, floor = 0) {
  if (corner <= 0.05 && floor <= 0.05) return makeShapeFromAsset(asset("box"), { x, z, elevation }, { width, depth, height });
  return makeShapeFromAsset(asset("roundedBox"), { x, z, elevation }, { width, depth, height, cornerFillet: round(corner), topBottomFillet: round(floor) });
}

/**
 * The box (with its compartments) and, when asked for, its lid, side by side, each as parts to
 * group. The lid lies upside down - plate on the bed, lip up - the way it prints; turned over, its
 * lip drops inside the box, over the dividers.
 */
export function boxWithLidParts(raw: Partial<BoxWithLidOptions>, names: { box: string; lid: string }): ReadyPart[] {
  const o = normalizeBoxWithLid(raw);
  const outerWidth = round(o.width + 2 * o.wall);
  const outerDepth = round(o.depth + 2 * o.wall);
  const outerHeight = round(o.height + o.wall);
  // A stackable box stands on its foot: everything above it is raised by the foot's height.
  const base = o.stackable ? STACK_FOOT : 0;
  // Box and lid side by side, or one behind the other when that takes less room on the plate.
  const sideBySide = Math.max(2 * outerWidth + PART_GAP, outerDepth) <= Math.max(outerWidth, 2 * outerDepth + PART_GAP);
  const offset = o.lid ? (sideBySide ? outerWidth : outerDepth) / 2 + PART_GAP / 2 : 0;
  const boxX = o.lid && sideBySide ? -offset : 0;
  const boxZ = o.lid && !sideBySide ? -offset : 0;
  const lidX = sideBySide ? offset : 0;
  const lidZ = sideBySide ? 0 : offset;
  const r = o.radius;
  const outerCorner = r > 0 ? r + o.wall : 0;
  const shapes: WorkplaneShape[] = [{ ...block(boxX, boxZ, base, outerWidth, outerDepth, outerHeight, outerCorner), name: names.box }];
  if (o.stackable) {
    // The foot is as big as the box's inside, less the fit, so it drops into the rim of the one below.
    const foot = block(boxX, boxZ, 0, round(o.width - 2 * o.clearance), round(o.depth - 2 * o.clearance), round(STACK_FOOT + 0.01), Math.max(0, r - o.clearance));
    shapes.push({ ...foot, name: `${names.box} (stacking foot)` });
  }

  // Every compartment is a hole from the floor up past the rim: past it by its rounding too, so the
  // rounded top of the cutter lies outside and only the floor gets the scoop.
  const cells = o.columns * o.rows;
  const drop = cells > 1 ? dividerDrop(o) : 0;
  const cellWidth = (o.width - (o.columns - 1) * o.wall) / o.columns;
  const cellDepth = (o.depth - (o.rows - 1) * o.wall) / o.rows;
  for (let column = 0; column < o.columns; column += 1) {
    for (let row = 0; row < o.rows; row += 1) {
      const x = boxX - o.width / 2 + cellWidth / 2 + column * (cellWidth + o.wall);
      const z = boxZ - o.depth / 2 + cellDepth / 2 + row * (cellDepth + o.wall);
      const cell = block(round(x), round(z), base + o.wall, round(cellWidth), round(cellDepth), round(o.height + r + 1), r, r);
      shapes.push({ ...cell, name: cells > 1 ? `${names.box} (compartment ${column + 1}-${row + 1})` : `${names.box} (inside)`, hole: true });
    }
  }
  // With a lid over dividers: the top of the box is open all round, so the lip fits in.
  if (drop > 0) {
    const ledge = block(boxX, boxZ, round(base + o.wall + o.height - drop), o.width, o.depth, round(drop + 1), r);
    shapes.push({ ...ledge, name: `${names.box} (top)`, hole: true });
  }
  const parts: ReadyPart[] = [{ name: names.box, shapes, group: true }];
  if (!o.lid) return parts;

  const lipWidth = round(o.width - 2 * o.clearance);
  const lipDepth = round(o.depth - 2 * o.clearance);
  const lipCorner = Math.max(0, r - o.clearance);
  const plate = block(lidX, lidZ, 0, outerWidth, outerDepth, LID_THICKNESS, outerCorner);
  const lip = block(lidX, lidZ, LID_THICKNESS, lipWidth, lipDepth, LID_LIP_HEIGHT, lipCorner);
  const lipInside = block(lidX, lidZ, LID_THICKNESS, round(lipWidth - 2 * LID_LIP_WALL), round(lipDepth - 2 * LID_LIP_WALL), LID_LIP_HEIGHT + 1, Math.max(0, lipCorner - LID_LIP_WALL));
  parts.push({
    // The lip's hollow is cut first, then the ring joins the plate.
    name: names.lid,
    shapes: [{ ...plate, name: names.lid }],
    group: true,
    parts: [{ name: `${names.lid} (lip)`, shapes: [{ ...lip, name: `${names.lid} (lip)` }, { ...lipInside, name: `${names.lid} (lip inside)`, hole: true }], group: true }],
  });
  return parts;
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

/*
 * Fork: profile parts - a side view, pushed out sideways by a width - built as meshes the way the
 * paraboloid is: a snap-fit hook and a living hinge. Resizing them later stretches them.
 */

type Point2D = [number, number];

/** A closed solid from a side-view outline (x across, y up, counter-clockwise) pushed out `width` along z. */
export function profileMeshShape(name: string, color: string, outline: Point2D[], width: number): WorkplaneShape {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 }).toNonIndexed();
  const source = geometry.getAttribute("position");
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let index = 0; index < source.count; index += 1) {
    minX = Math.min(minX, source.getX(index));
    maxX = Math.max(maxX, source.getX(index));
    minY = Math.min(minY, source.getY(index));
    maxY = Math.max(maxY, source.getY(index));
  }
  const positions: number[] = [];
  for (let index = 0; index < source.count; index += 1) {
    positions.push(source.getX(index) - (minX + maxX) / 2, source.getY(index) - minY, source.getZ(index) - width / 2);
  }
  geometry.dispose();
  const sizeX = round(maxX - minX);
  const sizeY = round(maxY - minY);
  return {
    id: createLocalId("profile-part"),
    name,
    kind: "mesh",
    color,
    x: 0,
    z: 0,
    elevation: 0,
    size: Math.max(sizeX, width),
    width: sizeX,
    depth: width,
    height: sizeY,
    rotation: 0,
    importedMesh: { positions, baseWidth: sizeX, baseDepth: width, baseHeight: sizeY, triangleCount: positions.length / 9, sourceFormat: "json" },
    locked: false,
    hidden: false,
  };
}

export type SnapFitOptions = {
  /** Height of the flexing arm, from where it stands to the top of the hook. */
  length: number;
  /** The arm's thickness: thicker is stiffer and bends less before it breaks. */
  thickness: number;
  width: number;
  /** How far the hook reaches out: what holds the parts together. */
  catchDepth: number;
  clearance: number;
};

export const DEFAULT_SNAP_FIT: SnapFitOptions = { length: 15, thickness: 2, width: 6, catchDepth: 1, clearance: 0.2 };

/**
 * How far the arm's tip can bend before PLA is at risk, in mm: a cantilever's deflection at a
 * strain of 2 % (PLA tolerates about 2.5 to 3 %, a margin is kept): y = strain * L^2 / (1.5 * t).
 */
export function snapFitSafeBend(o: SnapFitOptions, strain = 0.02) {
  return (strain * o.length * o.length) / (1.5 * o.thickness);
}

export function normalizeSnapFit(raw: Partial<SnapFitOptions>): SnapFitOptions {
  const merged = { ...DEFAULT_SNAP_FIT, ...raw };
  const clamp = (value: number, min: number, max: number, fallback: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
  const length = clamp(merged.length, 4, 100, DEFAULT_SNAP_FIT.length);
  return {
    length,
    thickness: clamp(merged.thickness, 0.8, 10, DEFAULT_SNAP_FIT.thickness),
    width: clamp(merged.width, 2, 100, DEFAULT_SNAP_FIT.width),
    catchDepth: clamp(merged.catchDepth, 0.2, 5, DEFAULT_SNAP_FIT.catchDepth),
    clearance: clamp(merged.clearance, 0, 1, DEFAULT_SNAP_FIT.clearance),
  };
}

/**
 * A snap-fit hook (stands on the plate; set it down on one part) and the window it clicks into (a
 * hole for the other part). The hook's top slopes so it slides in; its underside is square, so it holds.
 */
export function snapFitParts(raw: Partial<SnapFitOptions>, names: { hook: string; slot: string }): ReadyPart[] {
  const o = normalizeSnapFit(raw);
  // The catch's lead-in: three times as tall as it reaches out, so the arm bends gently on the way in.
  const lead = Math.min(o.length * 0.45, Math.max(1.5, o.catchDepth * 3));
  const outline: Point2D[] = [
    [0, 0],
    [o.thickness, 0],
    [o.thickness, o.length - lead],
    [o.thickness + o.catchDepth, o.length - lead],
    [o.thickness, o.length],
    [0, o.length],
  ];
  const hook = profileMeshShape(names.hook, "#33983d", outline, o.width);
  const slotWidth = round(o.width + 2 * o.clearance);
  const slotReach = round(o.thickness + o.catchDepth + 2 * o.clearance);
  const slot = makeShapeFromAsset(asset("box"), { x: round(hook.width / 2 + 8 + slotReach / 2), z: 0, elevation: 0 }, { width: slotReach, depth: slotWidth, height: 10 });
  return [
    { name: names.hook, shapes: [hook], group: false },
    { name: names.slot, shapes: [{ ...slot, name: names.slot, hole: true }], group: false },
  ];
}

export type LivingHingeOptions = {
  /** Each leaf, along the hinge's length (x). */
  leaf: number;
  width: number;
  thickness: number;
  /** The gap the thin web spans. */
  gap: number;
  /** The web that bends: thinner flexes more and lasts longer, if it prints well. */
  web: number;
};

export const DEFAULT_LIVING_HINGE: LivingHingeOptions = { leaf: 20, width: 20, thickness: 3, gap: 3, web: 0.4 };

export function normalizeLivingHinge(raw: Partial<LivingHingeOptions>): LivingHingeOptions {
  const merged = { ...DEFAULT_LIVING_HINGE, ...raw };
  const clamp = (value: number, min: number, max: number, fallback: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
  const thickness = clamp(merged.thickness, 0.8, 20, DEFAULT_LIVING_HINGE.thickness);
  return {
    leaf: clamp(merged.leaf, 3, 300, DEFAULT_LIVING_HINGE.leaf),
    width: clamp(merged.width, 3, 300, DEFAULT_LIVING_HINGE.width),
    thickness,
    gap: clamp(merged.gap, 0.5, 20, DEFAULT_LIVING_HINGE.gap),
    web: clamp(merged.web, 0.2, thickness * 0.8, DEFAULT_LIVING_HINGE.web),
  };
}

/** Two leaves joined by a thin web along the bottom: printed flat, it folds at the web. */
export function livingHingePart(raw: Partial<LivingHingeOptions>, name: string): ReadyPart {
  const o = normalizeLivingHinge(raw);
  const total = 2 * o.leaf + o.gap;
  const outline: Point2D[] = [
    [0, 0],
    [total, 0],
    [total, o.thickness],
    [o.leaf + o.gap, o.thickness],
    [o.leaf + o.gap, o.web],
    [o.leaf, o.web],
    [o.leaf, o.thickness],
    [0, o.thickness],
  ];
  return { name, shapes: [profileMeshShape(name, "#3f8f6b", outline, o.width)], group: false };
}

export type FaceTextOptions = { text: string; letterHeight: number; depth: number; mode: "raised" | "engraved" };
export const DEFAULT_FACE_TEXT: FaceTextOptions = { text: "PARE", letterHeight: 8, depth: 1, mode: "engraved" };
/** Cut-in letters reach this far out of the face too, so the cut is clean. */
export const ENGRAVE_OVERSHOOT = 1;

/**
 * Text to set down on a face: raised letters sit on it; cut-in letters are a hole that reaches
 * `depth` into the face (the editor sinks it that far as it sets it down) - group it with the part.
 */
export function faceTextPart(raw: Partial<FaceTextOptions>, name: string): ReadyPart & { sink: number } {
  const o = { ...DEFAULT_FACE_TEXT, ...raw };
  const text = (o.text || "TEXT").slice(0, 24);
  const letterHeight = Math.min(200, Math.max(2, Number.isFinite(o.letterHeight) ? o.letterHeight : DEFAULT_FACE_TEXT.letterHeight));
  const depth = Math.min(20, Math.max(0.2, Number.isFinite(o.depth) ? o.depth : DEFAULT_FACE_TEXT.depth));
  const width = round(Math.max(letterHeight, text.length * letterHeight * 0.8));
  const engraved = o.mode === "engraved";
  const shape = makeShapeFromAsset(asset("text"), { x: 0, z: 0, elevation: 0 }, { text, width, depth: letterHeight, height: engraved ? depth + ENGRAVE_OVERSHOOT : depth });
  return { name, shapes: [{ ...shape, text, name, hole: engraved || undefined }], group: false, sink: engraved ? depth : 0 };
}

/**
 * Mouse ears: where the bottom outline of a part has a sharp corner (90 degrees or tighter by
 * default), a thin disc under it, so the corner holds to the bed instead of lifting.
 */
export function mouseEarCorners(bottom: readonly Point2D[], maxAngle = 120): Point2D[] {
  // The outline's convex hull (monotone chain): ears go on the outside corners.
  const points = [...bottom].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (points.length < 3) return [];
  const cross = (o: Point2D, a: Point2D, b: Point2D) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point2D[] = [];
  for (const point of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 1e-9) lower.pop();
    lower.push(point);
  }
  const upper: Point2D[] = [];
  for (const point of [...points].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 1e-9) upper.pop();
    upper.push(point);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  const corners: Point2D[] = [];
  hull.forEach((point, index) => {
    const previous = hull[(index - 1 + hull.length) % hull.length];
    const next = hull[(index + 1) % hull.length];
    const a = [previous[0] - point[0], previous[1] - point[1]];
    const b = [next[0] - point[0], next[1] - point[1]];
    const lengths = Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]);
    if (lengths < 1e-12) return;
    const angle = (Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / lengths))) * 180) / Math.PI;
    if (angle <= maxAngle) corners.push(point);
  });
  return corners;
}

export const MOUSE_EAR_THICKNESS = 0.4;
export const MOUSE_EAR_SIZES = [8, 12, 16] as const;

/** Discs on the plate under a part's sharp bottom corners, grouped as one body; null when it has none. */
export function mouseEarsPart(bottom: readonly Point2D[], elevation: number, diameter: number, name: string, color?: string): ReadyPart | null {
  const corners = mouseEarCorners(bottom);
  // Corners closer than half an ear share one.
  const kept: Point2D[] = [];
  corners.forEach((corner) => {
    if (!kept.some((other) => Math.hypot(other[0] - corner[0], other[1] - corner[1]) < diameter / 2)) kept.push(corner);
  });
  if (!kept.length) return null;
  const ears = kept.map(([x, z], index) => ({
    ...makeShapeFromAsset(asset("cylinder"), { x: round(x), z: round(z), elevation }, { width: diameter, depth: diameter, height: MOUSE_EAR_THICKNESS, sides: 48 }),
    name: `${name} ${index + 1}`,
    ...(color ? { color } : {}),
  }));
  return { name, shapes: ears, group: ears.length > 1 };
}
