import { bedOverhangs, shapeBedFootprint, shapeVerticalExtent } from "@/lib/printBed";
import { overhangDownwardLimit } from "@/lib/overhangLimits";
import { isNonSolidShapeKind, shapeDepth, shapeWidth } from "@/lib/workplaneShapes";
import type { MeshData } from "@/lib/editorMeshCore";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * Fork (build 19): "Ready to print?" - a quick look at the design before it goes to the slicer, for
 * the things that most often spoil a first print. Each finding names the parts it is about, so
 * the panel can select them.
 */

export type PrintIssueKind = "nothing" | "outside" | "floating" | "looseHole" | "thin" | "overhang" | "hidden";

export type PrintIssue = {
  kind: PrintIssueKind;
  /** "problem" will most likely spoil the print; "advice" is worth a look. */
  level: "problem" | "advice";
  ids: string[];
  names: string[];
  /** The figure the message gives: mm, mm², a count. */
  amount?: number;
};

/** Thinner than this across, a wall is under two lines of a 0.4 mm nozzle. */
export const THIN_WALL_MM = 0.8;
/** Below this a part counts as resting on the plate or on another part. */
const REST_TOLERANCE = 0.2;
/** Overhang area worth mentioning, mm² - a chamfer or a small bridge does not count. */
const OVERHANG_AREA_MM2 = 40;

type Options = {
  bed?: { width: number; depth: number; height?: number } | null;
  overhangAngle: number;
  meshFor: (shape: WorkplaneShape) => MeshData;
};

function overlaps(a: ReturnType<typeof shapeBedFootprint>, b: ReturnType<typeof shapeBedFootprint>) {
  return a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
}

/** The area of a body's downward faces steeper than the printer manages, not counting the bottom resting on `base`. */
export function overhangArea(mesh: MeshData, base: number, angle: number) {
  const limit = overhangDownwardLimit(angle);
  let area = 0;
  for (const [a, b, c] of mesh.faces) {
    const p = mesh.vertices[a];
    const q = mesh.vertices[b];
    const r = mesh.vertices[c];
    if (!p || !q || !r) continue;
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
    const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-9) continue;
    if (-ny / length <= limit) continue;
    if (Math.min(p[1], q[1], r[1]) <= base + REST_TOLERANCE) continue;
    area += length / 2;
  }
  return area;
}

export function checkForPrinting(shapes: readonly WorkplaneShape[], options: Options): PrintIssue[] {
  const issues: PrintIssue[] = [];
  const visible = shapes.filter((shape) => !isNonSolidShapeKind(shape.kind));
  const printed = visible.filter((shape) => !shape.hole && !shape.hidden);
  const named = (list: readonly WorkplaneShape[]) => ({ ids: list.map((shape) => shape.id), names: list.map((shape) => shape.name) });
  if (printed.length === 0) return [{ kind: "nothing", level: "problem", ids: [], names: [] }];

  if (options.bed) {
    const outside = bedOverhangs(printed, options.bed.width, options.bed.depth, options.bed.height).map((entry) => entry.shape);
    if (outside.length) issues.push({ kind: "outside", level: "problem", ...named(outside) });
  }

  // Floating: above the lowest part, and nothing printed under it to stand on.
  const extents = new Map(printed.map((shape) => [shape.id, shapeVerticalExtent(shape)]));
  const footprints = new Map(printed.map((shape) => [shape.id, shapeBedFootprint(shape)]));
  const base = Math.min(...[...extents.values()].map((extent) => extent.minY));
  const floating = printed.filter((shape) => {
    const own = extents.get(shape.id)!;
    if (own.minY <= base + REST_TOLERANCE) return false;
    return !printed.some((other) => other.id !== shape.id
      && extents.get(other.id)!.maxY >= own.minY - REST_TOLERANCE
      && extents.get(other.id)!.minY < own.minY
      && overlaps(footprints.get(shape.id)!, footprints.get(other.id)!));
  });
  if (floating.length) issues.push({ kind: "floating", level: "problem", ...named(floating) });

  // A hole on its own is not printed and cuts nothing: it has to be grouped with what it should cut.
  const looseHoles = visible.filter((shape) => shape.hole && !shape.hidden);
  if (looseHoles.length) issues.push({ kind: "looseHole", level: "problem", ...named(looseHoles) });

  const thin = printed.filter((shape) => Math.min(shapeWidth(shape), shapeDepth(shape)) < THIN_WALL_MM);
  if (thin.length) issues.push({ kind: "thin", level: "advice", ...named(thin), amount: THIN_WALL_MM });

  const overhanging: WorkplaneShape[] = [];
  let worst = 0;
  for (const shape of printed) {
    try {
      const area = overhangArea(options.meshFor(shape), base, options.overhangAngle);
      if (area >= OVERHANG_AREA_MM2) {
        overhanging.push(shape);
        worst = Math.max(worst, area);
      }
    } catch {
      // A body whose mesh cannot be read is left out of this one check.
    }
  }
  if (overhanging.length) issues.push({ kind: "overhang", level: "advice", ...named(overhanging), amount: Math.round(worst) });

  const hidden = visible.filter((shape) => shape.hidden && !shape.hole);
  if (hidden.length) issues.push({ kind: "hidden", level: "advice", ...named(hidden) });
  return issues;
}
