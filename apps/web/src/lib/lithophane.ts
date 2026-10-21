import { createLocalId } from "@/lib/localIds";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * Fork: lithophanes - a photo printed as a thin plate that shows the picture when light shines
 * through it. Dark parts of the image are thick (little light passes), light parts are thin.
 *
 * The plate is a height map turned into one closed solid: a smooth face (towards the viewer) and a
 * relief face (towards the light), joined by walls round the edge. Flat plates stand upright, the
 * way lithophanes print best; curved ones bend round an arc, a lamp shade wraps all the way round.
 * A border of even thickness frames the picture and makes the edge strong.
 *
 * Sizes in mm. The image is given as brightness values (0 black, 1 white), row 0 at the top.
 */

export type LithophaneShape = "flat" | "curved" | "cylinder";

export type LithophaneOptions = {
  shape: LithophaneShape;
  /** Width of the picture (for a cylinder: once round); the height follows the image's proportions. */
  width: number;
  /** Thinnest (white) and thickest (black) parts. */
  minThickness: number;
  maxThickness: number;
  /** A frame round the picture, this wide, as thick as the thickest part. */
  border: number;
  /** Curved: the angle the plate bends through. */
  arcDegrees: number;
  /** Distance between the points of the height map: smaller is finer and heavier. */
  resolution: number;
  /** Image adjustments: brightness and contrast from -1 to 1, gamma above 0. */
  brightness: number;
  contrast: number;
  gamma: number;
  /** Swap light and dark (a "negative"). */
  invert: boolean;
  /** Flat: a foot so the plate stands on its own. */
  stand: boolean;
};

export const DEFAULT_LITHOPHANE: LithophaneOptions = {
  shape: "flat",
  width: 100,
  minThickness: 0.8,
  maxThickness: 3,
  border: 3,
  arcDegrees: 120,
  resolution: 0.3,
  brightness: 0,
  contrast: 0,
  gamma: 1,
  invert: false,
  stand: true,
};

/** Above this many height-map points the mesh would be too heavy to work with comfortably. */
export const LITHOPHANE_MAX_POINTS = 160_000;

export function normalizeLithophane(raw: Partial<LithophaneOptions>): LithophaneOptions {
  const o = { ...DEFAULT_LITHOPHANE, ...raw };
  const clamp = (value: number, min: number, max: number, fallback: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
  const minThickness = clamp(o.minThickness, 0.3, 10, DEFAULT_LITHOPHANE.minThickness);
  return {
    shape: o.shape === "curved" || o.shape === "cylinder" ? o.shape : "flat",
    width: clamp(o.width, 20, 400, DEFAULT_LITHOPHANE.width),
    minThickness,
    maxThickness: clamp(o.maxThickness, minThickness + 0.2, 15, Math.max(DEFAULT_LITHOPHANE.maxThickness, minThickness + 0.2)),
    border: clamp(o.border, 0, 30, DEFAULT_LITHOPHANE.border),
    arcDegrees: clamp(o.arcDegrees, 20, 300, DEFAULT_LITHOPHANE.arcDegrees),
    resolution: clamp(o.resolution, 0.15, 1, DEFAULT_LITHOPHANE.resolution),
    brightness: clamp(o.brightness, -1, 1, 0),
    contrast: clamp(o.contrast, -1, 1, 0),
    gamma: clamp(o.gamma, 0.2, 5, 1),
    invert: Boolean(o.invert),
    stand: o.stand !== false,
  };
}

/** One pixel's brightness after the adjustments, 0 to 1. */
export function adjustBrightness(value: number, o: Pick<LithophaneOptions, "brightness" | "contrast" | "gamma" | "invert">) {
  let v = Math.min(1, Math.max(0, value));
  v = Math.pow(v, 1 / o.gamma);
  const factor = o.contrast >= 0 ? 1 + o.contrast * 3 : 1 + o.contrast;
  v = (v - 0.5) * factor + 0.5 + o.brightness * 0.5;
  v = Math.min(1, Math.max(0, v));
  return o.invert ? 1 - v : v;
}

/** The picture's height for a given width, from the image's proportions. */
export function lithophaneHeight(width: number, imageWidth: number, imageHeight: number) {
  return (width * imageHeight) / Math.max(1, imageWidth);
}

/**
 * How many height-map points the picture gets across and down at this resolution (one more than
 * cells), kept under the point limit by coarsening if needed.
 */
export function lithophaneGrid(o: LithophaneOptions, imageWidth: number, imageHeight: number) {
  const pictureHeight = lithophaneHeight(o.width, imageWidth, imageHeight);
  let step = o.resolution;
  const count = (s: number) => (Math.round(o.width / s) + 1) * (Math.round(pictureHeight / s) + 1);
  while (count(step) > LITHOPHANE_MAX_POINTS) step *= 1.1;
  return { columns: Math.round(o.width / step) + 1, rows: Math.round(pictureHeight / step) + 1, step, pictureHeight };
}

/**
 * Thickness at every point of the full plate (picture and border), row by row from the top.
 * `sample(u, v)` gives the image's brightness at u, v from 0 to 1 (v down).
 */
export function lithophaneThicknessMap(o: LithophaneOptions, imageWidth: number, imageHeight: number, sample: (u: number, v: number) => number) {
  const grid = lithophaneGrid(o, imageWidth, imageHeight);
  const borderCells = o.border > 0 ? Math.max(1, Math.round(o.border / grid.step)) : 0;
  // A cylinder's left and right edges meet, so it has a border only at the top and bottom.
  const sideCells = o.shape === "cylinder" ? 0 : borderCells;
  const columns = grid.columns + 2 * sideCells;
  const rows = grid.rows + 2 * borderCells;
  const thickness = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const pictureColumn = column - sideCells;
      const pictureRow = row - borderCells;
      const inPicture = pictureColumn >= 0 && pictureColumn < grid.columns && pictureRow >= 0 && pictureRow < grid.rows;
      if (!inPicture) {
        thickness[row * columns + column] = o.maxThickness;
        continue;
      }
      const u = grid.columns > 1 ? pictureColumn / (grid.columns - 1) : 0;
      const v = grid.rows > 1 ? pictureRow / (grid.rows - 1) : 0;
      const light = adjustBrightness(sample(u, v), o);
      thickness[row * columns + column] = o.minThickness + (1 - light) * (o.maxThickness - o.minThickness);
    }
  }
  return { thickness, columns, rows, step: grid.step, width: (columns - 1) * grid.step, height: (rows - 1) * grid.step };
}

type Vec3 = [number, number, number];

/**
 * The plate as triangle positions. x across, y up, the smooth face towards +z (the viewer) and the
 * relief going back by the thickness. Curved shapes bend about a vertical axis behind the plate,
 * the smooth face outside, so the relief is on the inside, towards the light.
 */
export function lithophanePositions(map: { thickness: Float32Array; columns: number; rows: number; step: number }, o: LithophaneOptions): number[] {
  const { thickness, columns, rows, step } = map;
  const width = (columns - 1) * step;
  const height = (rows - 1) * step;
  const closed = o.shape === "cylinder";
  const radius = o.shape === "cylinder" ? (columns * step) / (2 * Math.PI) : o.shape === "curved" ? width / ((o.arcDegrees * Math.PI) / 180) : 0;
  const place = (column: number, row: number, depth: number): Vec3 => {
    const x = column * step - width / 2;
    // Row 0 is the top of the picture.
    const y = height - row * step;
    if (!radius) return [x, y, -depth];
    const angle = x / radius;
    const r = radius - depth;
    return [r * Math.sin(angle), y, r * Math.cos(angle) - radius];
  };
  const at = (column: number, row: number) => thickness[row * columns + (closed ? column % columns : column)];
  const smooth = (column: number, row: number) => place(column, row, 0);
  const relief = (column: number, row: number) => place(column, row, at(column, row));
  const positions: number[] = [];
  const tri = (a: Vec3, b: Vec3, c: Vec3) => positions.push(...a, ...b, ...c);
  // A cylinder repeats its first column at the end, so the last cell joins the first.
  const cellColumns = closed ? columns : columns - 1;
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < cellColumns; column += 1) {
      const next = column + 1;
      // In this grid, row grows downwards; counter-clockwise seen from +z is (c, r+1), (c+1, r+1), (c+1, r).
      const s00 = smooth(column, row), s10 = smooth(next, row), s01 = smooth(column, row + 1), s11 = smooth(next, row + 1);
      tri(s01, s11, s10);
      tri(s01, s10, s00);
      const r00 = relief(column, row), r10 = relief(next, row), r01 = relief(column, row + 1), r11 = relief(next, row + 1);
      tri(r01, r10, r11);
      tri(r01, r00, r10);
    }
  }
  // Walls: the top and bottom edges, and for open shapes the left and right ones.
  for (let column = 0; column < cellColumns; column += 1) {
    const next = column + 1;
    // Bottom edge (the last row), its outside facing down.
    const bottom = rows - 1;
    tri(smooth(column, bottom), relief(column, bottom), relief(next, bottom));
    tri(smooth(column, bottom), relief(next, bottom), smooth(next, bottom));
    // Top edge (row 0), facing up.
    tri(smooth(column, 0), smooth(next, 0), relief(next, 0));
    tri(smooth(column, 0), relief(next, 0), relief(column, 0));
  }
  if (!closed) {
    for (let row = 0; row < rows - 1; row += 1) {
      const below = row + 1;
      // Left edge (column 0), facing left.
      tri(smooth(0, row), relief(0, row), relief(0, below));
      tri(smooth(0, row), relief(0, below), smooth(0, below));
      // Right edge, facing right.
      const last = columns - 1;
      tri(smooth(last, row), smooth(last, below), relief(last, below));
      tri(smooth(last, row), relief(last, below), relief(last, row));
    }
  }
  return positions;
}

/** A mesh shape standing on the plate (y from 0), centred on x and z. */
export function meshShapeFromPositions(name: string, color: string, raw: number[]): WorkplaneShape {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let index = 0; index < raw.length; index += 3) {
    minX = Math.min(minX, raw[index]); maxX = Math.max(maxX, raw[index]);
    minY = Math.min(minY, raw[index + 1]); maxY = Math.max(maxY, raw[index + 1]);
    minZ = Math.min(minZ, raw[index + 2]); maxZ = Math.max(maxZ, raw[index + 2]);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const positions = new Array<number>(raw.length);
  for (let index = 0; index < raw.length; index += 3) {
    positions[index] = raw[index] - cx;
    positions[index + 1] = raw[index + 1] - minY;
    positions[index + 2] = raw[index + 2] - cz;
  }
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const height = maxY - minY;
  return {
    id: createLocalId("mesh"),
    name,
    kind: "mesh",
    color,
    x: 0,
    z: 0,
    elevation: 0,
    size: Math.max(width, depth),
    width,
    depth,
    height,
    rotation: 0,
    importedMesh: { positions, baseWidth: width, baseDepth: depth, baseHeight: height, triangleCount: positions.length / 9, sourceFormat: "json" },
    locked: false,
    hidden: false,
  };
}

/** The foot a flat lithophane stands in: a block with the plate sunk 2 mm into it. */
export const LITHOPHANE_STAND = { height: 6, sink: 2, margin: 6 };
