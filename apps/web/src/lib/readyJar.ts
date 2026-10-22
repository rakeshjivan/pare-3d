/**
 * Fork (build 30): a jar with a screw-on lid, built from shapes Pare 3D already makes exactly - a
 * cylinder body, a threaded rod for the neck, a cylinder hole for the inside, and a lid with a
 * tapped hole of the same thread and some clearance. Both stay editable groups; the lid lies
 * top-down beside the jar, the way it prints.
 *
 * The neck's thread core is the inside plus a wall all round, so the opening is the full inside
 * and the wall under the thread is as thick as the jar's wall.
 */
import { libraryShapeAssets, makeShapeFromAsset } from "@/lib/shapeCatalog";
import { threadSettings } from "@/lib/threadGeometry";
import type { ReadyPart } from "@/lib/readyParts";

export type JarOptions = {
  /** The inside diameter, the opening too. */
  inside: number;
  /** The inside height, floor to rim. */
  height: number;
  wall: number;
  /** How far the lid screws on. */
  neck: number;
  pitch: number;
  /** Room in the lid's thread, across the diameter. */
  clearance: number;
};

export const DEFAULT_JAR: JarOptions = { inside: 50, height: 60, wall: 2, neck: 12, pitch: 3, clearance: 0.5 };

const SIDES = 96;
const GAP = 10;
const round = (value: number) => Math.round(value * 100) / 100;

function asset(id: string) {
  const found = libraryShapeAssets.find((entry) => entry.id === id);
  if (!found) throw new Error(`No ${id} shape in the library`);
  return found;
}

export function normalizeJar(raw: Partial<JarOptions>): JarOptions {
  const o = { ...DEFAULT_JAR, ...raw };
  const clamp = (value: number, min: number, max: number, fallback: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
  const inside = clamp(o.inside, 10, 140, DEFAULT_JAR.inside);
  const pitch = clamp(o.pitch, 1.5, 6, DEFAULT_JAR.pitch);
  const neck = clamp(o.neck, 2 * pitch, 40, DEFAULT_JAR.neck);
  return {
    inside,
    height: clamp(o.height, neck + 5, 300, DEFAULT_JAR.height),
    wall: clamp(o.wall, 1.2, 6, DEFAULT_JAR.wall),
    neck,
    pitch,
    clearance: clamp(o.clearance, 0.2, 1.2, DEFAULT_JAR.clearance),
  };
}

/** The thread's diameter for these options: its core is the inside plus a wall all round. */
export function jarThread(o: JarOptions) {
  // The depth depends a little on the diameter, so it is worked out on a first guess.
  const guess = o.inside + 2 * o.wall + 1.2 * o.pitch;
  const depth = threadSettings({ threadRole: "rod", threadDiameter: guess, threadPitch: o.pitch, threadProfile: "trapezoidal" }).depth;
  const diameter = round(o.inside + 2 * o.wall + 2 * depth);
  return { diameter, depth };
}

export function jarParts(raw: Partial<JarOptions>, names: { jar: string; lid: string }): ReadyPart[] {
  const o = normalizeJar(raw);
  const thread = jarThread(o);
  const outer = round(thread.diameter + 2 * o.wall + o.clearance);
  const bodyHeight = round(o.wall + o.height - o.neck);
  const jarX = -(outer / 2 + GAP / 2);
  const lidX = outer / 2 + GAP / 2;
  const threadFields = { threadDiameter: thread.diameter, threadPitch: o.pitch, threadProfile: "trapezoidal" as const };

  const body = makeShapeFromAsset(asset("cylinder"), { x: jarX, z: 0, elevation: 0 }, { width: outer, depth: outer, height: bodyHeight, sides: SIDES });
  // The neck reaches half a millimetre into the body, so they join without a skin.
  const neck = makeShapeFromAsset(asset("thread"), { x: jarX, z: 0, elevation: round(bodyHeight - 0.5) }, { ...threadFields, threadRole: "rod", height: round(o.neck + 0.5) });
  const inside = makeShapeFromAsset(asset("cylinder"), { x: jarX, z: 0, elevation: o.wall }, { width: o.inside, depth: o.inside, height: round(o.height + 1), sides: SIDES });

  const lidHeight = round(o.wall + o.neck + 0.5);
  const cap = makeShapeFromAsset(asset("cylinder"), { x: lidX, z: 0, elevation: 0 }, { width: outer, depth: outer, height: lidHeight, sides: SIDES });
  const bore = makeShapeFromAsset(asset("thread"), { x: lidX, z: 0, elevation: o.wall }, { ...threadFields, threadRole: "bore", threadClearance: o.clearance, height: round(o.neck + 1) });

  return [
    { name: names.jar, group: true, shapes: [{ ...body, name: names.jar }, { ...neck, name: `${names.jar} (neck)` }, { ...inside, name: `${names.jar} (inside)`, hole: true }] },
    { name: names.lid, group: true, shapes: [{ ...cap, name: names.lid }, { ...bore, name: `${names.lid} (thread)`, hole: true }] },
  ];
}
