/**
 * Fork (build 30): the print-in-place flexi joint, and a flexi chain built from it.
 *
 * A joint links segment A (before it, along x) to segment B (after it). A gets a tongue: the middle
 * third of the thickness, rounded round the joint's axis, with a vertical hole. B gets a fork: a
 * prong under the tongue and one over it, rounded the same way, and a pin through the tongue's hole
 * joining them. Every gap is the clearance, so nothing fuses: printed flat, in one go, it swings
 * side to side once broken free. Each segment is its own group, so the parts stay apart.
 *
 * Coordinates: the joint's axis stands at x = at (y up, z across). The segment bodies stop short of
 * it by the joint's radius plus the clearance, so the rounded ends can turn past them.
 */
import { libraryShapeAssets, makeShapeFromAsset } from "@/lib/shapeCatalog";
import type { ReadyPart } from "@/lib/readyParts";
import type { WorkplaneShape } from "@/types/layerling";

export type FlexiJointSize = {
  /** Thickness of the segments (y). */
  thickness: number;
  /** Width of the tongue and prongs (z). */
  width: number;
  /** Gap between parts that move against each other. */
  clearance: number;
};

const round = (value: number) => Math.round(value * 1000) / 1000;
const SIDES = 48;

function asset(id: string) {
  const found = libraryShapeAssets.find((entry) => entry.id === id);
  if (!found) throw new Error(`No ${id} shape in the library`);
  return found;
}

/** The joint's measures from its size: the pin, the hole round it and the rounded end's radius. */
export function flexiJointMeasures(size: FlexiJointSize) {
  const layer = size.thickness / 3;
  const radius = size.width / 2;
  const pin = Math.max(1.2, Math.min(radius * 0.9, size.width * 0.35));
  return {
    layer,
    radius,
    pin,
    hole: pin + 2 * size.clearance,
    /** How far a segment body stays back from the axis. */
    setBack: radius + size.clearance,
  };
}

function box(x0: number, x1: number, y0: number, y1: number, z: number, width: number, name: string, hole = false): WorkplaneShape {
  const shape = makeShapeFromAsset(asset("box"), { x: round((x0 + x1) / 2), z: round(z), elevation: round(y0) }, { width: round(x1 - x0), depth: round(width), height: round(y1 - y0) });
  return { ...shape, name, ...(hole ? { hole: true } : {}) };
}

function disc(x: number, y0: number, y1: number, z: number, diameter: number, name: string, hole = false): WorkplaneShape {
  const shape = makeShapeFromAsset(asset("cylinder"), { x: round(x), z: round(z), elevation: round(y0) }, { width: round(diameter), depth: round(diameter), height: round(y1 - y0), sides: SIDES });
  return { ...shape, name, ...(hole ? { hole: true } : {}) };
}

/**
 * The joint's parts at x = at, centred on z: the tongue for segment A (with its hole) and the fork
 * and pin for segment B. A's body ends at at - setBack, B's begins at at + setBack.
 */
export function flexiJointParts(at: number, z: number, size: FlexiJointSize, names: { a: string; b: string }): { a: WorkplaneShape[]; b: WorkplaneShape[] } {
  const m = flexiJointMeasures(size);
  const c = size.clearance;
  const t = size.thickness;
  // A's tongue: the middle layer, from its body to the axis and rounded round it.
  const tongueLow = m.layer;
  const tongueHigh = 2 * m.layer;
  const a = [
    box(at - m.setBack - 0.01, at, tongueLow, tongueHigh, z, size.width, `${names.a} (tongue)`),
    disc(at, tongueLow, tongueHigh, z, size.width, `${names.a} (tongue end)`),
    disc(at, tongueLow - 0.5, tongueHigh + 0.5, z, m.hole, `${names.a} (pin hole)`, true),
  ];
  // B's fork: a prong under the tongue and one over it, the clearance away, and the pin joining them.
  const lowTop = tongueLow - c;
  const highBottom = tongueHigh + c;
  const b = [
    box(at, at + m.setBack + 0.01, 0, lowTop, z, size.width, `${names.b} (lower prong)`),
    disc(at, 0, lowTop, z, size.width, `${names.b} (lower prong end)`),
    box(at, at + m.setBack + 0.01, highBottom, t, z, size.width, `${names.b} (upper prong)`),
    disc(at, highBottom, t, z, size.width, `${names.b} (upper prong end)`),
    disc(at, 0, t, z, m.pin, `${names.b} (pin)`),
  ];
  return { a, b };
}

export type FlexiChainOptions = {
  segments: number;
  /** Each segment's body, along the chain. */
  length: number;
  /** Across the chain. */
  width: number;
  thickness: number;
  clearance: number;
};

export const DEFAULT_FLEXI_CHAIN: FlexiChainOptions = { segments: 8, length: 12, width: 14, thickness: 6, clearance: 0.4 };

export function normalizeFlexiChain(raw: Partial<FlexiChainOptions>): FlexiChainOptions {
  const o = { ...DEFAULT_FLEXI_CHAIN, ...raw };
  const clamp = (value: number, min: number, max: number, fallback: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
  const thickness = clamp(o.thickness, 3, 30, DEFAULT_FLEXI_CHAIN.thickness);
  return {
    segments: Math.round(clamp(o.segments, 2, 40, DEFAULT_FLEXI_CHAIN.segments)),
    length: clamp(o.length, 4, 100, DEFAULT_FLEXI_CHAIN.length),
    width: clamp(o.width, 6, 100, DEFAULT_FLEXI_CHAIN.width),
    thickness,
    clearance: clamp(o.clearance, 0.2, 1, DEFAULT_FLEXI_CHAIN.clearance),
  };
}

/** A chain of segments along x, linked by flexi joints, centred on the origin; each segment one group. */
export function flexiChainParts(raw: Partial<FlexiChainOptions>, name: string): ReadyPart[] {
  const o = normalizeFlexiChain(raw);
  const size: FlexiJointSize = { thickness: o.thickness, width: o.width * 0.6, clearance: o.clearance };
  const m = flexiJointMeasures(size);
  // Body, then the gap to the next joint's axis and on to the next body: the pitch of the chain.
  const pitch = o.length + 2 * m.setBack;
  const total = o.segments * o.length + (o.segments - 1) * 2 * m.setBack;
  const start = -total / 2;
  const segments: WorkplaneShape[][] = Array.from({ length: o.segments }, (_, index) => {
    const x0 = start + index * pitch;
    return [box(x0, x0 + o.length, 0, o.thickness, 0, o.width, `${name} ${index + 1}`)];
  });
  for (let index = 0; index < o.segments - 1; index += 1) {
    const at = start + index * pitch + o.length + m.setBack;
    const joint = flexiJointParts(at, 0, size, { a: `${name} ${index + 1}`, b: `${name} ${index + 2}` });
    segments[index].push(...joint.a);
    segments[index + 1].push(...joint.b);
  }
  return segments.map((shapes, index) => ({ name: `${name} ${index + 1}`, shapes, group: true }));
}
