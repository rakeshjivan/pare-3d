/**
 * The face tool (Modify group): a flat face of a body pushed out or cut in as a pocket, set in from
 * its edge and with rounded corners. The outline maths, with no editor state; faceToolBody.ts builds
 * the body, on a sketch body's own frame where faceToolFrame.ts finds one.
 */
import type { CrossSection, ManifoldToplevel } from "manifold-3d";
import type { FaceOutline } from "@/lib/holePattern";
import type { PerforableFace } from "@/lib/holePatternShapes";
import type { PlacementWorkplane } from "@/lib/placementWorkplane";
import { orderedCadSketchPaths } from "@/lib/sketchCadProfile";
import { sampledPath } from "@/lib/sketchStroke";
import type { SketchInset, SketchProfile } from "@/types/layerling";

/** Out adds material standing on the face, in cuts a pocket into it. */
export type FaceToolDirection = "out" | "in";

export type FaceToolSettings = {
  direction: FaceToolDirection;
  /** How far the outline stays inside the face's edge, in mm; 0 is the whole face. */
  inset: number;
  /** Radius the corners of the outline are rounded to, in mm; 0 keeps them as the face has them. */
  radius: number;
  /** How far the new body stands out of the face, or the pocket reaches into it, in mm. */
  depth: number;
  /** Leaves the new body (or the pocket's hole) as a part of its own instead of grouping it with the body (#750). */
  separate: boolean;
  /**
   * Fork (build 41): the outline moved across the face, in mm - to the right and up as the face is
   * seen from outside it (on a face that looks up or down, "up" is towards the back).
   */
  offsetX?: number;
  offsetY?: number;
};

export const DEFAULT_FACE_TOOL: FaceToolSettings = { direction: "out", inset: 0, radius: 0, depth: 2, separate: false };
export const FACE_TOOL_MAX_INSET = 50;
export const FACE_TOOL_MAX_RADIUS = 30;
export const FACE_TOOL_MIN_DEPTH = 0.2;
export const FACE_TOOL_MAX_DEPTH = 100;
export const FACE_TOOL_MAX_OFFSET = 100;
/** How far the new body reaches into the old one, or the pocket out of the face, so the two join without a skin. */
export const FACE_TOOL_OVERLAP = 0.2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Keeps every number of the settings inside what the tool offers. */
export function normalizeFaceTool(settings: Partial<FaceToolSettings>): FaceToolSettings {
  const number = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
  return {
    direction: settings.direction === "in" ? "in" : "out",
    inset: clamp(number(settings.inset, DEFAULT_FACE_TOOL.inset), 0, FACE_TOOL_MAX_INSET),
    radius: clamp(number(settings.radius, DEFAULT_FACE_TOOL.radius), 0, FACE_TOOL_MAX_RADIUS),
    depth: clamp(number(settings.depth, DEFAULT_FACE_TOOL.depth), FACE_TOOL_MIN_DEPTH, FACE_TOOL_MAX_DEPTH),
    separate: settings.separate === true,
    // Only when the shape is moved across the face, so settings without a move read as before.
    ...(number(settings.offsetX, 0) ? { offsetX: clamp(number(settings.offsetX, 0), -FACE_TOOL_MAX_OFFSET, FACE_TOOL_MAX_OFFSET) } : {}),
    ...(number(settings.offsetY, 0) ? { offsetY: clamp(number(settings.offsetY, 0), -FACE_TOOL_MAX_OFFSET, FACE_TOOL_MAX_OFFSET) } : {}),
  };
}

/**
 * The face's outline set in by `inset`, every corner rounded to `radius` (the steps the kernel route
 * in cadSketchInset.ts takes too), as a sketch of straight lines in the face's own coordinates.
 * Openings grow by the inset. Null when nothing of the face is left.
 */
export function insetFaceProfile(runtime: ManifoldToplevel, outline: FaceOutline, inset: number, radius = 0): SketchProfile | null {
  const loops = outline.loops
    .filter((loop) => loop.length >= 3)
    .map((loop) => loop.map((point): [number, number] => [point.u, point.v]));
  if (!loops.length) return null;
  const made: CrossSection[] = [];
  const keep = (section: CrossSection) => {
    made.push(section);
    return section;
  };
  let polygons: ReturnType<CrossSection["toPolygons"]>;
  try {
    const region = keep(new runtime.CrossSection(loops, "EvenOdd"));
    // Miter keeps the inner corners of the face pointed when it shrinks; its outer corners stay pointed with any join.
    const shrink = inset + radius;
    const shrunk = shrink > 0 ? keep(region.offset(-shrink, "Miter", 2, 48)) : region;
    const rounded = radius > 0
      ? keep(keep(keep(shrunk.offset(radius, "Round", 2, 48)).offset(radius, "Round", 2, 48)).offset(-radius, "Round", 2, 48))
      : shrunk;
    const result = keep(rounded.simplify(1e-6));
    if (result.area() <= 1e-9) return null;
    polygons = result.toPolygons();
    if (!polygons.length) return null;
  } finally {
    new Set(made).forEach((section) => section.delete());
  }
  const points: SketchProfile["points"] = [];
  const segments: SketchProfile["segments"] = [];
  polygons.forEach((polygon, loopIndex) => {
    const ids = polygon.map((_, index) => `face-${loopIndex}-${index}`);
    polygon.forEach(([x, z], index) => points.push({ id: ids[index], x, z }));
    ids.forEach((id, index) => segments.push({ id: `face-${loopIndex}-s${index}`, startId: id, endId: ids[(index + 1) % ids.length], kind: "line" }));
  });
  return { points, segments };
}

/** The settings as they are built on a face: a pocket goes no deeper than the body behind the face. */
export function faceToolSettingsOn(face: { thickness: number }, settings: FaceToolSettings): FaceToolSettings {
  if (settings.direction === "out" || settings.depth <= face.thickness) return settings;
  return { ...settings, depth: Math.max(FACE_TOOL_MIN_DEPTH, face.thickness) };
}

/** The height of the body the tool builds: the depth plus the overlap that joins it to the face. */
export function faceToolHeight(settings: Pick<FaceToolSettings, "depth">) {
  return settings.depth + FACE_TOOL_OVERLAP;
}

/**
 * The workplane the new body stands on: the face's own, moved along its normal so that a body
 * going out starts a little inside the old one, and a pocket going in starts at its bottom and
 * reaches a little out of the face.
 */
export function faceToolWorkplane(face: Pick<PerforableFace, "workplane">, settings: Pick<FaceToolSettings, "direction" | "depth" | "offsetX" | "offsetY">): PlacementWorkplane {
  const { origin, normal } = face.workplane;
  const shift = settings.direction === "out" ? -FACE_TOOL_OVERLAP : -settings.depth;
  return shiftedAcrossFace({
    ...face.workplane,
    origin: { x: origin.x + normal.x * shift, y: origin.y + normal.y * shift, z: origin.z + normal.z * shift },
  }, settings);
}

/**
 * Fork (build 41): which way is right and which is up on a face, as it is seen from outside: up is
 * the world's up laid onto the face (towards the back, -z, on a face that looks up or down).
 */
export function faceScreenAxes(normal: { x: number; y: number; z: number }) {
  const length = Math.hypot(normal.x, normal.y, normal.z) || 1;
  const n = { x: normal.x / length, y: normal.y / length, z: normal.z / length };
  const wanted = Math.abs(n.y) > 0.95 ? { x: 0, y: 0, z: -Math.sign(n.y) } : { x: 0, y: 1, z: 0 };
  const along = wanted.x * n.x + wanted.y * n.y + wanted.z * n.z;
  let up = { x: wanted.x - n.x * along, y: wanted.y - n.y * along, z: wanted.z - n.z * along };
  const upLength = Math.hypot(up.x, up.y, up.z) || 1;
  up = { x: up.x / upLength, y: up.y / upLength, z: up.z / upLength };
  // Looking at the face means looking along -n: right = (-n) x up.
  const right = { x: -(n.y * up.z - n.z * up.y), y: -(n.z * up.x - n.x * up.z), z: -(n.x * up.y - n.y * up.x) };
  return { right, up };
}

/** The workplane moved across the face by the settings' offsets (its normal and axes unchanged). */
export function shiftedAcrossFace(workplane: PlacementWorkplane, settings: Pick<FaceToolSettings, "offsetX" | "offsetY">): PlacementWorkplane {
  const dx = settings.offsetX ?? 0;
  const dy = settings.offsetY ?? 0;
  if (!dx && !dy) return workplane;
  const { right, up } = faceScreenAxes(workplane.normal);
  const o = workplane.origin;
  return { ...workplane, origin: { x: o.x + right.x * dx + up.x * dy, y: o.y + right.y * dx + up.y * dy, z: o.z + right.z * dx + up.z * dy } };
}

/**
 * A sketch's own closed outlines set in by an inset, as straight lines: the route a sketch body
 * with an inset takes where the kernel cannot move its outlines (cadSketchInset.ts).
 */
export function insetSketchProfile(runtime: ManifoldToplevel, profile: SketchProfile, inset: SketchInset): SketchProfile | null {
  const loops = orderedCadSketchPaths(profile)
    .filter((path) => path.closed)
    .map((path) => sampledPath(path).map((point) => ({ u: point.x, v: point.z })));
  return insetFaceProfile(runtime, { loops }, inset.distance, inset.radius);
}
