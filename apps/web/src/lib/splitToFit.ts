import { splitShapesByPlane } from "@/lib/editorBooleans";
import { meshForShape } from "@/lib/editorMeshCore";
import { arrangeOnPlate } from "@/lib/distribute";
import { DEFAULT_CUT_CONNECTORS, type CutConnectorOptions } from "@/lib/cutConnectors";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * Fork (build 21): Split to fit - a part too big for the printer is cut into the fewest equal
 * pieces that each fit (across, front to back and up), with dowel holes and pins on every cut
 * so the pieces line up when glued, then laid out on the plate.
 */

export type Bed = { width: number; depth: number; height: number };
type Box = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };

/** Room kept free round each piece: the printer's edge is rarely usable right up to it. */
export const SPLIT_TO_FIT_MARGIN = 6;

function boundsOf(shape: WorkplaneShape): Box {
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const [x, y, z] of meshForShape(shape).vertices) {
    box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x);
    box.minY = Math.min(box.minY, y); box.maxY = Math.max(box.maxY, y);
    box.minZ = Math.min(box.minZ, z); box.maxZ = Math.max(box.maxZ, z);
  }
  return box;
}

export type SplitToFitPlan = { axis: "x" | "y" | "z"; position: number }[];

/** Where to cut so every piece fits the bed: equal pieces, as few as possible along each direction. */
export function planSplitToFit(box: Box, bed: Bed, margin = SPLIT_TO_FIT_MARGIN): SplitToFitPlan {
  const plan: SplitToFitPlan = [];
  const cut = (axis: "x" | "y" | "z", min: number, max: number, room: number) => {
    const size = max - min;
    const pieces = Math.ceil(size / Math.max(10, room) - 1e-6);
    for (let index = 1; index < pieces; index += 1) plan.push({ axis, position: min + (size * index) / pieces });
  };
  cut("x", box.minX, box.maxX, bed.width - margin);
  cut("z", box.minZ, box.maxZ, bed.depth - margin);
  cut("y", box.minY, box.maxY, bed.height - margin);
  return plan;
}

const NORMALS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } as const;

export type SplitToFitResult =
  | { status: "fits" }
  | { status: "done"; pieces: WorkplaneShape[]; pins: WorkplaneShape[]; connectorCount: number }
  | { status: "failed"; error: string };

export async function splitToFit(shape: WorkplaneShape, bed: Bed, connectors: CutConnectorOptions = { ...DEFAULT_CUT_CONNECTORS, type: "dowel" }): Promise<SplitToFitResult> {
  const plan = planSplitToFit(boundsOf(shape), bed);
  if (!plan.length) return { status: "fits" };
  let pieces: WorkplaneShape[] = [shape];
  const pins: WorkplaneShape[] = [];
  let connectorCount = 0;
  for (const step of plan) {
    const next: WorkplaneShape[] = [];
    for (const piece of pieces) {
      const outcome = await splitShapesByPlane([piece], { axis: step.axis, normal: [...NORMALS[step.axis]] as [number, number, number], position: step.position }, () => true, connectors);
      if (outcome.status === "failed") return { status: "failed", error: outcome.error };
      if (outcome.status !== "done") return { status: "failed", error: "stale" };
      const parts = outcome.replacements.get(piece.id);
      if (parts?.length) {
        next.push(...parts);
        pins.push(...outcome.pins);
        connectorCount += outcome.connectorCount;
      } else {
        next.push(piece);
      }
    }
    pieces = next;
  }
  return { status: "done", pieces, pins, connectorCount };
}

/** Every piece set down on the plate and the lot arranged side by side (pins at the end). */
export function layOutOnPlate(shapes: readonly WorkplaneShape[], plateWidth: number, gap = 6): WorkplaneShape[] {
  const dropped = shapes.map((shape) => {
    const box = boundsOf(shape);
    return { shape: { ...shape, elevation: (shape.elevation ?? 0) - box.minY }, box };
  });
  const moves = arrangeOnPlate(dropped.map(({ shape, box }) => ({ id: shape.id, minX: box.minX, maxX: box.maxX, minZ: box.minZ, maxZ: box.maxZ })), gap, plateWidth);
  return dropped.map(({ shape }) => {
    const move = moves?.get(shape.id);
    return move ? { ...shape, x: shape.x + move.dx, z: shape.z + move.dz } : shape;
  });
}
