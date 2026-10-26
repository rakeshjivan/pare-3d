/**
 * Fork (build 46, Dental Studio in build 47): raw intraoral scans to printable models.
 *
 * analyseDental cleans each scan (dentalArch), tells an upper from a lower, puts a pair in its bite
 * (moving both onto a bite scan when one is given) and finds the frame each model is built in: teeth
 * up, occlusal plane level at z = 0, midline on y, front at -y.
 *
 * makeDentalStudio builds the models: as much of the scan as can be kept (dentalBase.closeToFloor),
 * a base that follows the scan, with a plate across the arch, or trimmed the orthodontic way; solid,
 * hollow and open underneath, or hollow with a closed floor and vent holes; an engraved label; and
 * for a pair, matching bases in occlusion and, if wanted, a snap-on hinge. The kept scan surface is
 * never moved relative to itself: only turned and shifted as a whole.
 *
 * All coordinates here are Z-up millimetres, 9 numbers a triangle; the editor converts.
 */
import * as THREE from "three";
import { getManifoldRuntime } from "@/lib/editorMeshCore";
import { alignToBite, archFrame, canineWidth, cleanScan, frontOf, isPartialArch, marginUp, pairFrame, palateScore, type CleanArch, type CleanReport } from "@/lib/dentalArch";
import { blockOutline, cleanOutline, closeToFloor, distanceFrom, distanceFromEdge, honeycombIn, HONEYCOMB_BASE_HEIGHT, prismOf, articulatorOutline, articulatorPockets, locatorNotches, tieBar, EDGE_FRINGE, bevelCutter, hingeOpening, hingeParts, HINGE_CLEARANCE, withoutDebris, hollowCavity, orthoOutline, outlineSide, prism, smoothEdge, CROWN_REACH, TOOTH_CROWN, TOOTH_REACH, TIP_CEILING, TIP_FLOOR, TIP_LONELY, toothZone } from "@/lib/dentalBase";
import { labelSection, labelText, labelWidth } from "@/lib/dentalLabel";
import {
  applyMatrix, boundaryLoops, cloneMesh, convexHull, cutAlongField, cutBelow, dropFragments, smoothField, faceArea, loopLength, surfaceKept, pinchedEdges, PointGrid, solidPositions, toManifold, upwardness, weld,
  type ManifoldRuntime, type ManifoldSolid, type Mesh, type Ring,
} from "@/lib/dentalMesh";

export { pinchedEdges };

export const DENTAL_MIN_BASE = 1;
export const DENTAL_MAX_BASE = 30;
export const DENTAL_MIN_WALL = 1;
export const DENTAL_MAX_WALL = 5;
export const DENTAL_PLATE_THICKNESS = 3;
export const DENTAL_VENT_RADIUS = 1.5;

export type DentalRole = "upper" | "lower";
/** Fork (build 49): "clean" - the scan trimmed to a smooth outline round the teeth on a low block. */
export type DentalInfill = "honeycomb" | "base" | "none";
export type DentalBaseStyle = "follow" | "plate" | "ortho" | "clean" | "articulator";
export type DentalInside = "solid" | "open" | "closed";

/** `area` (build 53): the tooth area the person approved - one flag per triangle of `positions`. */
export type DentalArchInput = { id: string; positions: ArrayLike<number>; area?: Uint8Array };
export type DentalStudioInput = {
  arches: DentalArchInput[];
  bite?: ArrayLike<number> | null;
  /** Roles the person chose; the rest are worked out. */
  roles?: Record<string, DentalRole>;
  /**
   * Build 74: the arches already stand in occlusion as the bite scan placed them (the fit was locked
   * into them once), so no bite scan is needed and none is fitted again - trimming, sculpting or
   * cutting the palate away cannot move the bite.
   */
  locked?: boolean;
};

/** `depth`: how much of the scan is kept by default below the occlusal plane; `teeth`: the least that may be kept - 2 mm under the lowest tooth surface; `above`: how far the tallest tooth stands above the occlusal plane (mm). */
/** `axes`: the arch's directions in the input's axes - teeth, front and the patient's left. */
export type DentalArchAxes = { up: [number, number, number]; front: [number, number, number]; left: [number, number, number] };
export type DentalArchInfo = { id: string; role: DentalRole; report: CleanReport; depth: number; teeth: number; above: number; palate: number; canines: number; partial: boolean; axes: DentalArchAxes };
export type DentalAnalysis = {
  arches: DentalArchInfo[];
  /** `apart`: the two scans do not share the scanner's coordinates, so each is set up on its own. */
  pair: null | { inOcclusion: boolean; apart: boolean; contacts: number; bite: null | { rms: number; overlap: number; fitted: boolean; locked?: boolean; fit?: Record<string, number[]> } };
};

export type DentalStudioOptions = {
  /** How much of the scan to keep, mm down from the occlusal plane; null keeps all of it. */
  keep: number | null;
  /** Base height below the deepest kept part (for the orthodontic base: the trimmed block), mm. */
  base: number;
  baseStyle: DentalBaseStyle;
  inside: DentalInside;
  wall: number;
  /** A pair only: the printed snap-on hinge. */
  hinge: boolean;
  /** Build 58: the fit round the hinge's axle, mm (HINGE_FITS); 0.15 when left out. */
  hingeFit?: number;
  /** Build 58: the stop at the front that sets the closed bite; on when left out. */
  incisalStop?: boolean;
  /** Build 63: snap-in ball condyles (the default), drop-in ball condyles, or the clip and axle. */
  hingeJoint?: "ball" | "dropin" | "axle";
  /** Build 62: a bevel round the foot of the base for the build plate; on when left out. */
  bevel?: boolean;
  /** Build 60: the protrusion path, degrees (HINGE_CONDYLE_ANGLES); 0 or left out for a plain hinge. */
  condyle?: number;
  /** Build 60: the incisal pin raised this much, mm, at the pin (build 71: 0 to INCISAL_PIN_MAX); 0 when left out. */
  pinRaise?: number;
  /** Build 60: a flat incisal table, or one sloped as a guide; flat when left out. */
  incisalTable?: "flat" | "guide";
  /** A pair only: laid out base-down for printing, or upper on lower in occlusion. */
  layout: "print" | "occlusion";
  /** Engraved on the base; U or L goes in front for a pair. Empty for none. */
  label: string;
  /**
   * Fork (build 48): follow the gum line - keep this much gum below the teeth, all round, and no
   * more (palate and floor of the mouth go). Null or left out: cut straight across at `keep`.
   */
  gum?: number | null;
  /** Fork (build 48): smooth the scan's ragged edge before the base goes on (never the teeth). */
  smooth?: DentalSmooth;
  /** Fork (build 49/50): what fills a hollow model - a honeycomb all the way up (the default), a
   * honeycomb in the base only (stiff where it matters, empty above), or nothing. */
  infill?: DentalInfill;
  /** Fork (build 50): half-round notches round the foot of a clean base, for seating it. On unless false. */
  notches?: boolean;
  /** Fork (build 50): a bar joining the back ends of a full arch, so it cannot spread while it prints. */
  tieBar?: boolean;
  /** Fork (build 52): the margin found by Pare 3D (a smooth band of gum below the teeth), or drawn by hand with the trim. */
  margin?: "auto" | "manual";
};

export type DentalSmooth = "off" | "low" | "high";
const SMOOTH_ROUNDS: Record<DentalSmooth, number> = { off: 0, low: 3, high: 10 };

export type DentalPart = { id: string; role: DentalRole; positions: Float32Array; height: number; volume: number };
/** `surface`: per part, the share of the scan's surface kept above each depth (mm below the occlusal plane). */
export type DentalStudioResult = { parts: DentalPart[]; worn: number; keptDepth: number[]; voxel: number | null; warnings: string[]; surface: Array<Record<number, number>>; /** Build 60: how far the printed articulator opens, degrees. */ opening?: number; /** Build 65: the solid pieces each part is made of - 1 when it holds together. */ pieces?: number[]; /** Build 71: a raised pin holds the bite open this much, mm: at the pin, the front teeth and the back teeth. */ held?: { pin: number; front: number; back: number } };

/** Whether a mesh looks like a raw scan: an open surface with one long open edge. */
export function looksLikeDentalScan(positions: ArrayLike<number>): boolean {
  if (positions.length < 9 * 2000) return false;
  const m = weld(positions);
  const loops = boundaryLoops(m);
  if (loops.length === 0) return false;
  const lengths = loops.map((loop) => loopLength(m, loop)).sort((a, b) => b - a);
  return lengths[0] > 40;
}

// ---------------------------------------------------------------------------------------------
// Analysis

type Prepared = {
  arches: Array<{ id: string; role: DentalRole; clean: CleanArch; frame: THREE.Matrix4; depth: number; teeth: number; above: number; palate: number; canines: number; partial: boolean }>;
  analysis: DentalAnalysis;
};

const FLIP = new THREE.Matrix4().makeRotationY(Math.PI);

/** Deepest anatomy worth keeping: tissue flaps and scan tails that hang far below the gum are thin and
 * small, so the depth is taken where 98% of the surface (by area) lies above, and never over 22 mm. */
export const DENTAL_MAX_DEPTH = 22;
function robustDepth(m: Mesh, frame: THREE.Matrix4) {
  const p = new THREE.Vector3();
  const z = new Float64Array(m.v.length / 3);
  for (let i = 0; i < z.length; i += 1) z[i] = p.set(m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]).applyMatrix4(frame).z;
  const faces: Array<[number, number]> = [];
  let total = 0;
  for (let t = 0; t < m.f.length; t += 3) {
    const a = m.f[t], b = m.f[t + 1], c = m.f[t + 2];
    const area = faceArea(m, t / 3);
    if (!(area > 0)) continue;
    faces.push([Math.min(z[a], z[b], z[c]), area]);
    total += area;
  }
  faces.sort((x, y) => x[0] - y[0]);
  let below = 0, low = faces.length ? faces[0][0] : 0;
  for (const [fz, area] of faces) { below += area; low = fz; if (below >= total * 0.02) break; }
  return Math.max(1, Math.min(DENTAL_MAX_DEPTH, -low));
}

/** The default depth kept and the least depth that keeps every tooth whole, in an arch's frame. */
function depthIn(m: Mesh, frame: THREE.Matrix4): { depth: number; teeth: number; above: number } {
  const turned = cloneMesh(m);
  applyMatrix(turned, frame);
  const zone = toothZone(turned, undefined, undefined, undefined, TIP_CEILING);
  let lowest = Infinity;
  for (let i = 0; i < zone.length; i += 1) if (zone[i]) lowest = Math.min(lowest, turned.v[i * 3 + 2]);
  // 2 mm under the lowest tooth surface: clear of the fringe the cut's own edge may lose.
  const teeth = Number.isFinite(lowest) ? Math.max(1, -lowest + 2) : 1;
  let above = 0;
  for (let i = 2; i < turned.v.length; i += 3) above = Math.max(above, turned.v[i]);
  return { depth: Math.max(robustDepth(m, frame), teeth), teeth, above };
}

/**
 * An arch's directions in the input's axes. In its frame the teeth point up (+z) and the front is at
 * -y; seen from the front the patient's left is on the right (+x) for a lower, and for an upper,
 * turned over to stand teeth up, on the left.
 */
function archAxes(frame: THREE.Matrix4, role: DentalRole): DentalArchAxes {
  const back = new THREE.Matrix3().setFromMatrix4(frame).transpose();
  const axis = (x: number, y: number, z: number): [number, number, number] => {
    const v = new THREE.Vector3(x, y, z).applyMatrix3(back).normalize();
    return [v.x, v.y, v.z];
  };
  return { up: axis(0, 0, 1), front: axis(0, -1, 0), left: role === "upper" ? axis(-1, 0, 0) : axis(1, 0, 0) };
}

/** How deep an arch is kept below the occlusal plane: never into the teeth; following the gum, no deeper than it. */
function keptDepthFor(arch: { depth: number; teeth: number }, options: DentalStudioOptions) {
  const keep = options.keep === null ? arch.depth : Math.max(arch.teeth, Math.min(options.keep, arch.depth));
  if (options.gum === null || options.gum === undefined) return keep;
  return Math.max(arch.teeth, Math.min(keep, arch.teeth + Math.max(0.5, options.gum)));
}

/** Gum kept below the teeth by a clean base when none is set, mm. */
export const CLEAN_GUM = 3;
/** Rounds of smoothing the margin's line gets along the surface before the cut (build 52). */
export const MARGIN_SMOOTHING = 40;

function signedRing(ring: Ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) area += ring[i][0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * ring[i][1];
  return area / 2;
}

function zSpan(m: Mesh, frame: THREE.Matrix4) {
  const p = new THREE.Vector3();
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < m.v.length; i += 3) {
    const z = p.set(m.v[i], m.v[i + 1], m.v[i + 2]).applyMatrix4(frame).z;
    low = Math.min(low, z); high = Math.max(high, z);
  }
  return high - low;
}

function prepare(input: DentalStudioInput): Prepared {
  if (!input.arches.length || input.arches.length > 2) throw new Error("Choose one or two arch scans");
  const cleaned = input.arches.map((arch) => ({ id: arch.id, clean: cleanScan(arch.positions) }));
  const singles = cleaned.map(({ clean }) => archFrame(clean.mesh, marginUp(clean.mesh, clean.margin)));
  const palates = cleaned.map(({ clean }, i) => palateScore(clean.mesh, singles[i]));
  const canines = cleaned.map(({ clean }, i) => canineWidth(clean.mesh, singles[i]));
  const partials = cleaned.map(({ clean }, i) => isPartialArch(clean.mesh, singles[i]));
  // Scanners put the upper above the lower: an upper's teeth point down. Failing that (a scan lying
  // on its side), a scanned palate says upper, then the width across the canines of a full arch.
  const ups = cleaned.map(({ clean }) => marginUp(clean.mesh, clean.margin));
  // Build 74: a file still in its scanner's Y-up axes (as Medit and 3Shape export) reads its vertical on Y.
  const vertical = (up: number[]) => (Math.abs(up[2]) > 0.5 ? up[2] : Math.abs(up[1]) > 0.5 ? up[1] : 0);
  const upperness = cleaned.map((_, i) => -vertical(ups[i]) * 100 + (palates[i] > 0.06 ? 10 : 0) + (partials[i] ? 0 : (canines[i] - 30) / 4));
  const roles: DentalRole[] = cleaned.map(({ id }, i) => input.roles?.[id] ?? (upperness[i] > 0 ? "upper" : "lower"));
  if (cleaned.length === 2) {
    const [a, b] = cleaned.map(({ id }) => input.roles?.[id]);
    if (!a && !b) {
      roles[0] = upperness[0] >= upperness[1] ? "upper" : "lower";
      roles[1] = roles[0] === "upper" ? "lower" : "upper";
    } else if (a && !b) roles[1] = a === "upper" ? "lower" : "upper";
    else if (b && !a) roles[0] = b === "upper" ? "lower" : "upper";
    if (roles[0] === roles[1]) throw new Error("One scan must be the upper and the other the lower");
  }
  if (cleaned.length === 1) {
    const frame = singles[0];
    const measured = depthIn(cleaned[0].clean.mesh, frame);
    return {
      arches: [{ id: cleaned[0].id, role: roles[0], clean: cleaned[0].clean, frame, ...measured, palate: palates[0], canines: canines[0], partial: partials[0] }],
      analysis: {
        arches: [{ id: cleaned[0].id, role: roles[0], report: cleaned[0].clean.report, ...measured, palate: palates[0], canines: canines[0], partial: partials[0], axes: archAxes(frame, roles[0]) }],
        pair: null,
      },
    };
  }
  let upperIndex = roles[0] === "upper" ? 0 : 1;
  let upper = cleaned[upperIndex].clean, lower = cleaned[1 - upperIndex].clean;
  let bite: NonNullable<DentalAnalysis["pair"]>["bite"] = null;
  if (input.locked) bite = { rms: 0, overlap: 1, fitted: true, locked: true };
  else if (input.bite && input.bite.length >= 9 * 100) {
    const biteMesh = weld(input.bite);
    const fitUpper = alignToBite(upper.mesh, biteMesh);
    const fitLower = alignToBite(lower.mesh, biteMesh);
    const fitted = fitUpper.rms < 0.35 && fitLower.rms < 0.35 && fitUpper.overlap > 0.02 && fitLower.overlap > 0.02;
    if (fitted) {
      applyMatrix(upper.mesh, fitUpper.matrix);
      applyMatrix(lower.mesh, fitLower.matrix);
    }
    // Build 74: the fit, in the input's coordinates, handed back so the editor can lock it into the scans.
    const fit = fitted ? { [cleaned[upperIndex].id]: fitUpper.matrix.toArray(), [cleaned[1 - upperIndex].id]: fitLower.matrix.toArray() } : undefined;
    bite = { rms: Math.max(fitUpper.rms, fitLower.rms), overlap: Math.min(fitUpper.overlap, fitLower.overlap), fitted, ...(fit ? { fit } : {}) };
  }
  let pair = pairFrame(upper, lower);
  // Worked out roles are checked by the overjet: in the bite the upper incisors stand in front of the lower.
  const chosen = input.roles?.[cleaned[0].id] || input.roles?.[cleaned[1].id];
  const byDirection = Math.abs(ups[0][2]) > 0.5 && Math.abs(ups[1][2]) > 0.5 && Math.sign(ups[0][2]) !== Math.sign(ups[1][2]);
  if (!chosen && !byDirection && pair.inOcclusion && !partials[0] && !partials[1]) {
    const upperFront = frontOf(upper.mesh, FLIP.clone().multiply(pair.frame)), lowerFront = frontOf(lower.mesh, pair.frame);
    if (upperFront > lowerFront + 0.3) {
      upperIndex = 1 - upperIndex;
      roles[upperIndex] = "upper";
      roles[1 - upperIndex] = "lower";
      [upper, lower] = [lower, upper];
      pair = pairFrame(upper, lower);
    }
  }
  let lowerFrame = pair.frame;
  let upperFrame = FLIP.clone().multiply(pair.frame);
  // Scans moved apart or turned on their own no longer face each other: the shared frame then
  // stands an arch on its side. Each is then set up on its own (teeth up), and nothing is in occlusion.
  const own = (arch: CleanArch) => archFrame(arch.mesh, marginUp(arch.mesh, arch.margin));
  const ownUpper = own(upper), ownLower = own(lower);
  const apart = zSpan(upper.mesh, upperFrame) > zSpan(upper.mesh, ownUpper) * 1.4 + 2 || zSpan(lower.mesh, lowerFrame) > zSpan(lower.mesh, ownLower) * 1.4 + 2;
  if (apart) {
    lowerFrame = ownLower;
    upperFrame = ownUpper;
  }
  const arches = cleaned.map(({ id, clean }, i) => {
    const frame = i === upperIndex ? upperFrame : lowerFrame;
    return { id, role: roles[i], clean, frame, ...depthIn(clean.mesh, frame), palate: palates[i], canines: canines[i], partial: partials[i] };
  });
  return {
    arches,
    analysis: {
      arches: arches.map(({ id, role, clean, frame, depth, teeth, above, palate, canines: width, partial }) => ({ id, role, report: clean.report, depth, teeth, above, palate, canines: width, partial, axes: archAxes(frame, role) })),
      pair: { inOcclusion: pair.inOcclusion && !apart, apart, contacts: apart ? 0 : pair.contacts, bite },
    },
  };
}

// The last analysis is kept, so making the models after analysing does not clean the scans again.
let lastKey = "";
let lastPrepared: Prepared | null = null;

function inputKey(input: DentalStudioInput) {
  const sum = (p: ArrayLike<number>) => {
    let s = 0;
    const step = Math.max(1, Math.floor(p.length / 997));
    for (let i = 0; i < p.length; i += step) s += p[i] * ((i % 7) + 1);
    return `${p.length}:${s.toFixed(4)}`;
  };
  return JSON.stringify([input.arches.map((a) => [a.id, sum(a.positions)]), input.bite ? sum(input.bite) : null, input.roles ?? {}, Boolean(input.locked)]);
}

function prepared(input: DentalStudioInput): Prepared {
  const key = inputKey(input);
  if (key !== lastKey || !lastPrepared) {
    lastPrepared = prepare(input);
    lastKey = key;
  }
  return lastPrepared;
}

export function analyseDental(input: DentalStudioInput): DentalAnalysis {
  return prepared(input).analysis;
}

// ---------------------------------------------------------------------------------------------
// Building

function transformSolid(solid: ManifoldSolid, matrix: THREE.Matrix4): ManifoldSolid {
  return solid.transform(matrix.elements as unknown as Parameters<ManifoldSolid["transform"]>[0]);
}

/** Points of the teeth in the pair's (or single arch's) frame, seen from above. */
/** The scan seen from above down to `depth` below the occlusal plane - at least down to the teeth. */
function teethFootprint(m: Mesh, frame: THREE.Matrix4, toCommon: THREE.Matrix4, depth = 11): Ring {
  const p = new THREE.Vector3();
  const out: Ring = [];
  for (let i = 0; i < m.v.length; i += 3) {
    p.set(m.v[i], m.v[i + 1], m.v[i + 2]).applyMatrix4(frame);
    if (p.z < -depth) continue;
    p.applyMatrix4(toCommon);
    out.push([p.x, p.y]);
  }
  return out;
}

const mirrorRing = (ring: Ring): Ring => ring.map(([x, y]) => [-x, y] as [number, number]).reverse();

function engrave(runtime: ManifoldRuntime, solid: ManifoldSolid, text: string, height: number, origin: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, into: THREE.Vector3, depth = 0.6): ManifoldSolid {
  const section = labelSection(runtime, text, height);
  const cutter = section.extrude(depth + 1);
  section.delete();
  // Local x along `right`, y along `up`, z into the face; the cutter starts 1 mm outside the face.
  const start = origin.clone().addScaledVector(into, -1);
  const matrix = new THREE.Matrix4().makeBasis(right, up, into).setPosition(start);
  const placed = transformSolid(cutter, matrix);
  cutter.delete();
  const result = runtime.Manifold.difference(solid, placed);
  placed.delete();
  return result;
}

type Built = { solid: ManifoldSolid; floor: number; top: number; footprint: Ring[]; worn: number; keptDepth: number; voxel: number | null; warnings: string[]; kept: Record<number, number> };

function buildArch(
  runtime: ManifoldRuntime,
  arch: Prepared["arches"][number],
  options: DentalStudioOptions,
  floor: number,
  ortho: Ring | null,
  labelLine: string,
  area?: Uint8Array,
): Built {
  const warnings: string[] = [];
  const m = cloneMesh(arch.clean.mesh);
  applyMatrix(m, arch.frame);
  // Outward faces point away from the tissue: with the teeth up, on the whole up. Some exports run the other way.
  if (upwardness(m) < 0) for (let t = 0; t < m.f.length; t += 3) { const b = m.f[t + 1]; m.f[t + 1] = m.f[t + 2]; m.f[t + 2] = b; }
  let top = -Infinity, low = Infinity;
  for (let i = 2; i < m.v.length; i += 3) { top = Math.max(top, m.v[i]); low = Math.min(low, m.v[i]); }
  const keep = keptDepthFor(arch, options);
  // The cut never passes through a tooth: keep is never less than arch.teeth.
  // Build 53: the tooth area the person approved, when there is one, is the teeth.
  const scanTeeth = area ?? toothZone(m, undefined, undefined, undefined, TIP_CEILING);
  // Build 50: the crowns - what is promised, and what the clean outline is drawn round.
  // Within the teeth found as before: with a tip set aside, the crown's depth is measured from a
  // lower tip, and must not reach below the depth the cut keeps.
  const crowns = toothZone(m, TOOTH_CROWN, CROWN_REACH, undefined, TIP_CEILING, TIP_FLOOR, TIP_LONELY).map((inZone, i) => (inZone && scanTeeth[i] ? 1 : 0));
  // The cut never passes through the approved area either.
  let areaLow = Infinity;
  if (area) for (let i = 0; i < area.length; i += 1) if (area[i]) areaLow = Math.min(areaLow, m.v[i * 3 + 2]);
  const level = Math.min(-keep, areaLow - 1);
  const cut = level <= low + 1e-6 ? m : cutBelow(m, level);
  // A mark on the scan's corners, carried over to the corners of the cut (which keeps them in place).
  const onCut = (mark: Uint8Array) => {
    if (cut === m) return mark;
    const was = new Set<string>();
    for (let i = 0; i < mark.length; i += 1) if (mark[i]) was.add(`${m.v[i * 3]},${m.v[i * 3 + 1]},${m.v[i * 3 + 2]}`);
    const out = new Uint8Array(cut.v.length / 3);
    for (let i = 0; i < out.length; i += 1) if (was.has(`${cut.v[i * 3]},${cut.v[i * 3 + 1]},${cut.v[i * 3 + 2]}`)) out[i] = 1;
    return out;
  };
  // The teeth: never cut and never worn away - nor dropped as a loose piece.
  let teeth = area ? new Uint8Array(cut.v.length / 3) : toothZone(cut, undefined, undefined, undefined, TIP_CEILING);
  // What was teeth on the whole scan stays teeth: cutting the tissue away below can move the lowest
  // ground a tip is measured against, and must never shrink the teeth.
  {
    const was = onCut(scanTeeth);
    for (let i = 0; i < teeth.length; i += 1) if (was[i]) teeth[i] = 1;
  }
  // Guarded: the teeth, all but the fringe right at the scan's own edge (not edges a trim makes here).
  const scanEdge = distanceFromEdge(cut, EDGE_FRINGE);
  const guard = teeth.map((inZone, i) => (inZone && scanEdge[i] > EDGE_FRINGE ? 1 : 0));
  dropFragments(cut, 0.05, teeth);
  if (options.gum !== null && options.gum !== undefined) {
    // Following the gum line: what lies further below the teeth than the gum asked for goes.
    // As far out as down: the gum round the teeth, plus room for the edge's fringe.
    const gum = Math.max(0.5, options.gum);
    // Build 52: cut exactly along a smooth margin - the band's edge as a smooth field over the
    // surface, cut along its zero line (triangles split there), never through the teeth.
    const field = new Float64Array(cut.v.length / 3);
    if (area) {
      // Build 53: the band is `gum` wide round the approved area, measured over the surface.
      const along = distanceFrom(cut, teeth, gum + 3);
      for (let i = 0; i < field.length; i += 1) field[i] = gum - Math.min(along[i], gum + 3);
    } else toothZone(cut, TOOTH_CROWN + gum, TOOTH_REACH + gum + EDGE_FRINGE, undefined, TIP_CEILING, -Infinity, Infinity, field);
    const smoothed = smoothField(cut, field, MARGIN_SMOOTHING, teeth);
    const trimmed = cutAlongField(cut, smoothed, teeth);
    const grown = new Uint8Array(trimmed.v.length / 3);
    grown.set(teeth.subarray(0, Math.min(teeth.length, grown.length)));
    cut.v = trimmed.v;
    cut.f = trimmed.f;
    teeth = grown;
    dropFragments(cut, 0.05, teeth);
  }
  smoothEdge(cut, SMOOTH_ROUNDS[options.smooth ?? "low"], teeth);
  let closed;
  try {
    closed = closeToFloor(cut, floor, 400, guard, 0);
  } catch {
    // The ragged edge would not settle: cut where the edge is complete all round - never into the teeth.
    const loops = boundaryLoops(m);
    let complete = -Infinity;
    for (const loop of loops) for (const i of loop) complete = Math.max(complete, m.v[i * 3 + 2]);
    const fallback = cutBelow(m, Math.max(level, complete + 0.01));
    dropFragments(fallback, 0.05, toothZone(fallback, undefined, undefined, undefined, TIP_CEILING));
    try {
      closed = closeToFloor(fallback, floor, 600, toothZone(fallback, undefined, undefined, undefined, TIP_CEILING));
      warnings.push("edge");
    } catch {
      closed = closeToFloor(fallback, floor, 600);
      warnings.push("edge");
    }
  }
  let keptLow = Infinity;
  for (let t = 0; t < closed.mesh.f.length; t += 1) {
    const z = closed.mesh.v[closed.mesh.f[t] * 3 + 2];
    if (z > floor + 1e-6) keptLow = Math.min(keptLow, z);
  }
  const made: ManifoldSolid[] = [];
  const keepSolid = (solid: ManifoldSolid) => { made.push(solid); return solid; };
  let solid = keepSolid(toManifold(runtime, closed.mesh));
  let footprint: Ring[] = closed.outline;
  // The outline whose front face carries the label (orthodontic and articulator bases).
  let labelRing: Ring | null = options.baseStyle === "ortho" ? ortho : null;
  if (options.baseStyle === "ortho" && ortho) {
    const block = keepSolid(prism(runtime, ortho, floor, floor + Math.max(DENTAL_MIN_BASE, options.base)));
    solid = keepSolid(runtime.Manifold.union(solid, block));
    const trim = keepSolid(prism(runtime, ortho, floor - 0.001, top + 5));
    solid = keepSolid(runtime.Manifold.intersection(solid, trim));
    footprint = [ortho];
  } else if (options.baseStyle === "clean" || options.baseStyle === "articulator") {
    // The block fills the outline up to where the scan was cut; above it only the scan shows,
    // trimmed to the same outline.
    const rings = cleanOutline(runtime, cut, teeth, Math.max(0.5, options.gum ?? CLEAN_GUM), { mesh: m, crowns, partial: arch.partial });
    if (rings.length) {
      const blockTop = Math.max(floor + Math.max(DENTAL_MIN_BASE, options.base), level);
      if (options.baseStyle === "articulator") {
        // The scan trimmed to its outline, standing on a block for a magnetic articulator plate.
        const trim = keepSolid(prismOf(runtime, rings, floor - 0.001, top + 5));
        solid = keepSolid(runtime.Manifold.intersection(solid, trim));
        // Build 51: shaped as an orthodontic base round the arch (back square, heels angled, the
        // upper's front pointed and the lower's rounded); a quadrant gets a square block.
        const around = rings.filter((ring) => signedRing(ring) > 0).flat();
        const plate = arch.partial ? articulatorOutline(rings) : orthoOutline(around, arch.role, 2);
        labelRing = plate;
        const block = keepSolid(prism(runtime, plate, floor, blockTop));
        solid = keepSolid(runtime.Manifold.union(solid, block));
        solid = keepSolid(runtime.Manifold.difference(solid, keepSolid(articulatorPockets(runtime, plate, floor))));
        footprint = [plate];
      } else {
        const block = keepSolid(prismOf(runtime, rings, floor, blockTop));
        solid = keepSolid(runtime.Manifold.union(solid, block));
        const trim = keepSolid(prismOf(runtime, rings, floor - 0.001, top + 5));
        solid = keepSolid(runtime.Manifold.intersection(solid, trim));
        footprint = rings.filter((ring) => signedRing(ring) > 0);
      }
    }
  } else if (options.baseStyle === "plate") {
    const hull = convexHull(closed.outline.flat());
    const outer = new runtime.CrossSection([hull], "Positive");
    const inset = outer.offset(-0.3, "Round");
    outer.delete();
    const slab = keepSolid(inset.extrude(Math.min(DENTAL_PLATE_THICKNESS, Math.max(DENTAL_MIN_BASE, options.base))).translate([0, 0, floor]));
    inset.delete();
    solid = keepSolid(runtime.Manifold.union(solid, slab));
    footprint = [hull];
  }
  let voxel: number | null = null;
  // Build 74: the model before hollowing, and the wall, so cuts made after it keep a wall round them.
  let unhollowed: ManifoldSolid | null = null;
  let hollowWall = 0;
  if (options.inside !== "solid" && options.baseStyle !== "articulator") {
    const open = options.inside === "open";
    const wall = Math.max(DENTAL_MIN_WALL, Math.min(DENTAL_MAX_WALL, options.wall));
    unhollowed = solid;
    hollowWall = wall;
    const before = solidPositions(solid);
    const cavity = hollowCavity(runtime, before, floor, wall, open, DENTAL_VENT_RADIUS);
    made.push(cavity.solid);
    voxel = cavity.voxel;
    if (!cavity.solid.isEmpty()) {
      // Fork (build 49): a honeycomb inside carries the shell, so hollow is as stiff as solid.
      const infill = options.infill ?? "honeycomb";
      const taken = infill === "none" ? cavity.solid : keepSolid(honeycombIn(runtime, cavity.solid, floor, open, infill === "base" ? floor + HONEYCOMB_BASE_HEIGHT : Infinity));
      solid = keepSolid(runtime.Manifold.difference(solid, taken.isEmpty() ? cavity.solid : taken));
      if (!open) {
        if (!cavity.vents.length) warnings.push("vents");
        for (const [x, y] of cavity.vents) {
          const vent = keepSolid(runtime.Manifold.cylinder(wall + 3, DENTAL_VENT_RADIUS, DENTAL_VENT_RADIUS, 32).translate([x, y, floor - 1]));
          solid = keepSolid(runtime.Manifold.difference(solid, vent));
        }
      }
    }
  }
  // Build 50: the finishing touches of a clean base - locator notches, and a tie bar if asked for.
  if (options.baseStyle === "clean" || options.baseStyle === "articulator") {
    const outer = footprint.reduce<Ring | null>((best, ring) => (!best || Math.abs(signedRing(ring)) > Math.abs(signedRing(best)) ? ring : best), null);
    if (outer && options.tieBar && !arch.partial) {
      const bar = tieBar(runtime, outer, floor);
      if (bar) solid = keepSolid(runtime.Manifold.union(solid, keepSolid(bar)));
    }
    if (outer && options.baseStyle === "clean" && options.notches !== false) {
      // Build 74: on a hollow model each notch is cut from a collar of solid a wall thick, so the
      // wall round it stays as thick as asked (cut straight into the shell, it was left 1 mm).
      if (unhollowed && hollowWall > 0) {
        const collar = keepSolid(runtime.Manifold.intersection(keepSolid(locatorNotches(runtime, outer, floor, hollowWall)), unhollowed));
        solid = keepSolid(runtime.Manifold.union(solid, collar));
      }
      solid = keepSolid(runtime.Manifold.difference(solid, keepSolid(locatorNotches(runtime, outer, floor))));
    }
  }
  // Build 62: a bevel round the foot, so the model comes off the build plate easily.
  if (options.bevel !== false && options.baseStyle !== "articulator") {
    const cutter = bevelCutter(runtime, footprint, floor);
    if (cutter) solid = keepSolid(runtime.Manifold.difference(solid, keepSolid(cutter)));
  }
  const text = labelText(labelLine);
  if (text) {
    if ((options.baseStyle === "ortho" || options.baseStyle === "articulator") && labelRing && options.base >= 3) {
      const side = outlineSide(labelRing, arch.partial ? 0 : arch.role === "upper" ? -25 : -35);
      const sideLength = Math.hypot(side.b[0] - side.a[0], side.b[1] - side.a[1]);
      let height = Math.min(5, options.base * 0.55);
      const width = labelWidth(text, height);
      if (width > sideLength * 0.8) height *= (sideLength * 0.8) / width;
      const into = new THREE.Vector3(-side.nx, -side.ny, 0);
      const up = new THREE.Vector3(0, 0, 1);
      const right = new THREE.Vector3(-side.ny, side.nx, 0);
      const origin = new THREE.Vector3((side.a[0] + side.b[0]) / 2, (side.a[1] + side.b[1]) / 2, floor + options.base / 2);
      if (height >= 1.5) solid = keepSolid(engrave(runtime, solid, text, height, origin, right, up, into));
      else warnings.push("label");
    } else if ((options.baseStyle === "plate" || options.baseStyle === "clean" || options.baseStyle === "follow") && options.inside !== "open") {
      const hull = footprint[0];
      let cx = 0, cy = 0;
      hull.forEach(([x, y]) => { cx += x; cy += y; });
      cx /= hull.length; cy /= hull.length;
      let minY = Infinity, maxY = -Infinity;
      hull.forEach(([, y]) => { minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
      let height = 5;
      const width = labelWidth(text, height);
      const room = (maxY - minY) * 0.5;
      if (width > room) height *= room / width;
      // Read from below with the front at the top.
      if (height >= 1.5) solid = keepSolid(engrave(runtime, solid, text, height, new THREE.Vector3(cx, cy, floor), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1)));
      else warnings.push("label");
    } else {
      warnings.push("label");
    }
  }
  if (solid.status() !== "NoError" || solid.isEmpty()) throw new Error("The model did not come out as a closed solid");
  // Hand the result out; free everything else.
  const result = solid;
  made.filter((item) => item !== result).forEach((item) => { try { item.delete(); } catch { /* gone */ } });
  // How much of the scan's surface came through, band by band below the occlusal plane.
  const out = solidPositions(result);
  const kept: Record<number, number> = {};
  // What is promised: the teeth, all but the ragged fringe right at the scan's edge.
  const fromEdge = distanceFromEdge(m, EDGE_FRINGE);
  // Build 50: the crowns (CROWN_REACH from their tips), not the gum or flaps of tissue beside them.
  // Build 51: the teeth as found on the whole scan - within TOOTH_REACH of every cusp tip and down
  // to TOOTH_CROWN below it - not the narrower crowns the outline is drawn round.
  const promised = scanTeeth.map((inZone, i) => (inZone && fromEdge[i] > EDGE_FRINGE ? 1 : 0));
  for (const depth of [2, 4, 6, 8, 10, 12]) kept[depth] = surfaceKept(m, out, -depth, scanTeeth);
  kept[-3] = surfaceKept(m, out, -Infinity, scanTeeth);
  kept[-1] = surfaceKept(m, out, -Infinity, promised);
  // The teeth as found before build 50 (wider: within TOOTH_REACH of every tip), all but the fringe.
  kept[-4] = surfaceKept(m, out, -Infinity, scanTeeth.map((inZone, i) => (inZone && fromEdge[i] > EDGE_FRINGE ? 1 : 0)));
  let toothArea = 0;
  for (let t = 0; t < m.f.length / 3; t += 1) if (scanTeeth[m.f[t * 3]] && scanTeeth[m.f[t * 3 + 1]] && scanTeeth[m.f[t * 3 + 2]]) toothArea += faceArea(m, t);
  kept[-2] = toothArea;
  if (kept[-1] < 0.999) warnings.push("teeth");
  return { solid: result, floor, top, footprint, worn: closed.worn, keptDepth: Number.isFinite(keptLow) ? -keptLow : keep, voxel, warnings, kept };
}

/**
 * Build 68: one arch of a pair made on its own - in a second worker, beside the first - and handed
 * over as its mesh. `makeDentalStudio` takes it with `remote`, so a pair takes about as long as its
 * slower arch instead of both one after the other.
 */
export type DentalArchPart = Omit<Built, "solid"> & { mesh: { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array; mergeFromVert?: Uint32Array; mergeToVert?: Uint32Array } };

function archPartOf(built: Built): DentalArchPart {
  const mesh = built.solid.getMesh();
  const { solid, ...rest } = built;
  void solid;
  return {
    ...rest,
    mesh: {
      numProp: mesh.numProp,
      vertProperties: Float32Array.from(mesh.vertProperties),
      triVerts: Uint32Array.from(mesh.triVerts),
      ...(mesh.mergeFromVert?.length ? { mergeFromVert: Uint32Array.from(mesh.mergeFromVert), mergeToVert: Uint32Array.from(mesh.mergeToVert) } : {}),
    },
  };
}

function builtOf(runtime: ManifoldRuntime, part: DentalArchPart): Built {
  const { mesh, ...rest } = part;
  const solid = new runtime.Manifold(new runtime.Mesh({ numProp: mesh.numProp, vertProperties: mesh.vertProperties, triVerts: mesh.triVerts, ...(mesh.mergeFromVert ? { mergeFromVert: mesh.mergeFromVert, mergeToVert: mesh.mergeToVert } : {}) }));
  return { ...rest, solid };
}

/** Build 68: only the arch at `index` of the pair, as makeDentalStudio would make it, as its mesh. */
export async function makeDentalArchPart(input: DentalStudioInput, options: DentalStudioOptions, index: number, given?: ManifoldRuntime): Promise<DentalArchPart> {
  let part: DentalArchPart | null = null;
  await studio(input, options, given, { only: index, take: (made) => { part = made; } });
  if (!part) throw new Error("No such arch");
  return part;
}

export async function makeDentalStudio(input: DentalStudioInput, options: DentalStudioOptions, given?: ManifoldRuntime, remote?: { index: number; part: Promise<DentalArchPart> }): Promise<DentalStudioResult> {
  return (await studio(input, options, given, { remote }))!;
}

/**
 * Build 71: a label typed for a base that is open underneath used to be left off (a label needs a
 * floor). Now the floor is closed for it - hollow with vents - and the label goes under it; the
 * orthodontic and articulator bases keep theirs on the side.
 */
export function labelledOptions(options: DentalStudioOptions): DentalStudioOptions {
  if (!options.label.trim() || options.inside !== "open") return options;
  if (options.baseStyle === "ortho" || options.baseStyle === "articulator") return options;
  return { ...options, inside: "closed" };
}

async function studio(input: DentalStudioInput, given_options: DentalStudioOptions, given: ManifoldRuntime | undefined, mode: { only?: number; take?: (part: DentalArchPart) => void; remote?: { index: number; part: Promise<DentalArchPart> } }): Promise<DentalStudioResult | null> {
  let options = labelledOptions(given_options);
  const prep = prepared(input);
  // Build 53: an approved tooth area, carried from the scan's triangles to the cleaned scan's corners.
  const areaOn = (id: string, mesh: Mesh): Uint8Array | undefined => {
    const given = input.arches.find((entry) => entry.id === id);
    if (!given?.area || options.margin !== "manual") return undefined;
    const grid = new PointGrid(mesh.v, 0.05);
    const out = new Uint8Array(mesh.v.length / 3);
    let any = 0;
    for (let t = 0; t < given.area.length; t += 1) {
      if (!given.area[t]) continue;
      for (let k = 0; k < 3; k += 1) {
        const i = t * 9 + k * 3;
        const hit = grid.nearest(given.positions[i], given.positions[i + 1], given.positions[i + 2]);
        if (hit && hit[1] < 1e-3) { out[hit[0]] = 1; any += 1; }
      }
    }
    return any ? out : undefined;
  };
  // A clean base keeps a band of gum round the teeth, and no more.
  // Build 52: a margin drawn by hand is the margin - no gum band is cut on top of it.
  // Build 53: with an approved area, the gum band (Expand) runs round it; otherwise round the teeth found.
  if ((options.margin === "manual" || options.baseStyle === "clean") && (options.gum === null || options.gum === undefined)) options = { ...options, gum: CLEAN_GUM };
  const apart = Boolean(prep.analysis.pair?.apart);
  if (apart) options = { ...options, layout: "print", hinge: false };
  const runtime = given ?? (await getManifoldRuntime());
  const base = Math.max(DENTAL_MIN_BASE, Math.min(DENTAL_MAX_BASE, options.base));
  const keeps = prep.arches.map((arch) => keptDepthFor(arch, options));
  // A pair stands equally tall: both floors as far from the occlusal plane.
  const depth = Math.max(...keeps) + base;
  const pair = prep.arches.length === 2;
  // Orthodontic outlines from both arches' teeth, so the bases match.
  let footprint: Ring = [];
  // Scans set up apart each get an outline of their own.
  const shared = pair && !apart;
  for (const arch of prep.arches) {
    const toCommon = arch.role === "upper" && shared ? FLIP : new THREE.Matrix4();
    footprint = footprint.concat(teethFootprint(arch.clean.mesh, arch.frame, toCommon, Math.max(11, arch.teeth)));
  }
  const userLabel = options.label.trim();
  const built: Array<{ arch: (typeof prep.arches)[number]; built: Built }> = [];
  for (const [index, arch] of prep.arches.entries()) {
    if (mode.only !== undefined && index !== mode.only) continue;
    if (mode.remote && mode.remote.index === index) {
      // Made in the other worker; if that failed, made here after all.
      const part = await mode.remote.part.catch(() => null);
      if (part) { built.push({ arch, built: builtOf(runtime, part) }); continue; }
    }
    let ortho: Ring | null = null;
    if (options.baseStyle === "ortho") {
      // A quadrant or sextant gets a block: square all round, 3 mm clear of the teeth.
      const prints = shared ? footprint : teethFootprint(arch.clean.mesh, arch.frame, new THREE.Matrix4(), Math.max(11, arch.teeth));
      const common = prep.arches.some((a) => a.partial) ? blockOutline(prints) : orthoOutline(prints, arch.role);
      ortho = arch.role === "upper" && shared ? mirrorRing(common) : common;
    }
    const line = userLabel ? (pair ? `${arch.role === "upper" ? "U" : "L"} ${userLabel}` : userLabel) : "";
    const made = buildArch(runtime, arch, { ...options, base }, -depth, ortho, line, areaOn(arch.id, arch.clean.mesh));
    if (mode.only !== undefined) {
      mode.take?.(archPartOf(made));
      made.solid.delete();
      return null;
    }
    built.push({ arch, built: made });
  }
  const warnings = [...new Set([...(apart ? ["apart"] : []), ...built.flatMap(({ built: b }) => b.warnings)])];
  const voxel = built.find(({ built: b }) => b.voxel !== null)?.built.voxel ?? null;
  const toFree: ManifoldSolid[] = [];
  let opening: number | undefined;
  let rest: { degrees: number; axleY: number } | null = null;
  let held: { pin: number; front: number; back: number } | undefined;
  let solids = built.map(({ arch, built: b }) => {
    if (!pair || arch.role === "lower") return b.solid;
    const moved = transformSolid(b.solid, FLIP);
    toFree.push(b.solid);
    return moved;
  });
  if (pair && options.hinge) {
    // Footprints in the pair's frame: the upper's mirrored back.
    const rings = built.flatMap(({ arch, built: b }) => (arch.role === "upper" ? b.footprint.map(mirrorRing) : b.footprint));
    let back = -Infinity;
    rings.forEach((ring) => ring.forEach(([, y]) => { back = Math.max(back, y); }));
    let xMin = Infinity, xMax = -Infinity;
    rings.forEach((ring) => ring.forEach(([x, y]) => { if (y > back - 8) { xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); } }));
    // Build 58: the incisal stop goes in front of the arch's front, in the middle of what is there.
    let front = Infinity;
    rings.forEach((ring) => ring.forEach(([, y]) => { front = Math.min(front, y); }));
    let fMin = Infinity, fMax = -Infinity;
    rings.forEach((ring) => ring.forEach(([x, y]) => { if (y < front + 4) { fMin = Math.min(fMin, x); fMax = Math.max(fMax, x); } }));
    // Build 61: where each base's own outline crosses the pin's line, so each arm joins its own model.
    // On the midline (x = 0 in the pair's frame), between the central incisors, where the front reaches it.
    const stopX = fMin < 0 && fMax > 0 ? 0 : (fMin + fMax) / 2;
    const frontAt = (role: "upper" | "lower") => {
      let least = Infinity;
      built.forEach(({ arch, built: b }) => {
        if (arch.role !== role) return;
        for (const ring of role === "upper" ? b.footprint.map(mirrorRing) : b.footprint) {
          for (let i = 0; i < ring.length; i += 1) {
            const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
            if ((ax - stopX) * (bx - stopX) > 0 || ax === bx) continue;
            least = Math.min(least, ay + ((stopX - ax) / (bx - ax)) * (by - ay));
          }
        }
      });
      return least;
    };
    const upperY = frontAt("upper"), lowerY = frontAt("lower");
    const stop = options.incisalStop !== false && Number.isFinite(upperY) && Number.isFinite(lowerY) ? { x: stopX, upperY, lowerY } : null;
    const motion = { condyle: options.condyle ?? 0, pinRaise: options.pinRaise ?? 0, table: options.incisalTable ?? "flat", joint: options.hingeJoint ?? "ball" } as const;
    // Build 65: each model's heels - its rearmost point either side of the middle - so the hinge's
    // bar reaches both, however unevenly a horseshoe's two ends stop.
    const mid = (xMin + xMax) / 2;
    const heelsOf = (role: "upper" | "lower") => {
      const best: Array<{ x: number; y: number } | null> = [null, null];
      built.forEach(({ arch, built: b }) => {
        if (arch.role !== role) return;
        (role === "upper" ? b.footprint.map(mirrorRing) : b.footprint).forEach((ring) => ring.forEach(([x, y]) => {
          const side = x < mid ? 0 : 1;
          if (!best[side] || y > best[side]!.y) best[side] = { x, y };
        }));
      });
      return best.filter((heel): heel is { x: number; y: number } => heel !== null);
    };
    const parts = hingeParts(runtime, back, xMin, xMax, depth, -depth, options.hingeFit ?? HINGE_CLEARANCE, stop, motion, { upper: heelsOf("upper"), lower: heelsOf("lower") });
    solids = built.map(({ arch }, i) => {
      const joined = runtime.Manifold.union(solids[i], arch.role === "upper" ? parts.upper : parts.lower);
      toFree.push(solids[i]);
      return joined;
    });
    toFree.push(parts.upper, parts.lower);
    // Build 60: how far it opens, the whole models turned on the axle.
    const upperIndex = built.findIndex(({ arch }) => arch.role === "upper");
    opening = hingeOpening(runtime, solids[upperIndex], solids[1 - upperIndex], parts.axleY, 90, parts.rest);
    // Build 71: on a raised pin the upper rests turned open about the axle; how far the teeth part.
    if (parts.rest > 0 && stop) {
      rest = { degrees: parts.rest, axleY: parts.axleY };
      const sin = Math.sin(parts.rest * Math.PI / 180);
      // At the teeth: the incisal edges and the last molars' cusps - the upper's points within
      // 1.5 mm of the occlusal plane, the furthest forward and (5 mm in) the furthest back.
      let teethFront = Infinity, teethBack = -Infinity;
      const upperArch = built.find(({ arch }) => arch.role === "upper")?.arch;
      if (upperArch) {
        teethFootprint(upperArch.clean.mesh, upperArch.frame, shared ? FLIP : new THREE.Matrix4(), 1.5).forEach(([, y]) => { teethFront = Math.min(teethFront, y); teethBack = Math.max(teethBack, y); });
      }
      if (!Number.isFinite(teethFront)) { teethFront = stop.upperY; teethBack = Math.max(...heelsOf("upper").map((heel) => heel.y)); }
      const at = (y: number) => Math.round(Math.max(0, parts.axleY - y) * sin * 10) / 10;
      held = { pin: options.pinRaise ?? 0, front: at(teethFront), back: at(teethBack - 5) };
    }
    if (opening < 30) warnings.push("opening");
  }
  // Lay out: base down on the plate, the upper turned over beside the lower; or upper on lower.
  const out: DentalPart[] = [];
  const pieces: number[] = [];
  let offsetX = 0;
  built.forEach(({ arch }, i) => {
    let solid = solids[i];
    // Build 62: no loose flecks of scan to float in the vat.
    const clean = withoutDebris(runtime, solid);
    if (clean.solid !== solid) { toFree.push(solid); solid = clean.solid; }
    // Build 65: a model must be one piece - a part of the hinge or the stop standing free of its
    // base would print loose. Counted, and said.
    const split = solid.decompose();
    const loose = split.filter((piece) => piece.volume() > 0).length;
    split.forEach((piece) => piece.delete());
    pieces.push(loose);
    if (loose > 1 && !warnings.includes("loose")) warnings.push("loose");
    // The model's own height, as built (the scan's highest point may have been trimmed away).
    const own = solid.boundingBox();
    // Build 71: in occlusion, the upper stands open on its raised pin - turned about the axle, not lifted.
    if (pair && options.layout !== "print" && rest && arch.role === "upper") {
      const turned = solid.translate([0, -rest.axleY, 0]).rotate([-rest.degrees, 0, 0]).translate([0, rest.axleY, 0]);
      toFree.push(solid);
      solid = turned;
    }
    if (!pair || options.layout === "print") {
      if (pair && arch.role === "upper") {
        const turned = transformSolid(solid, FLIP);
        toFree.push(solid);
        solid = turned;
      }
      const lifted = solid.translate([0, 0, depth]);
      toFree.push(solid);
      solid = lifted;
      const box = solid.boundingBox();
      if (pair) {
        const placed = solid.translate([offsetX - box.min[0], 0, 0]);
        toFree.push(solid);
        solid = placed;
        offsetX += box.max[0] - box.min[0] + 8;
      }
    }
    out.push({ id: arch.id, role: arch.role, positions: solidPositions(solid), height: own.max[2] - own.min[2], volume: solid.volume() });
    toFree.push(solid);
  });
  if (pair && options.layout === "print") {
    // Centre the pair on the origin.
    let minX = Infinity, maxX = -Infinity;
    out.forEach((part) => { for (let i = 0; i < part.positions.length; i += 3) { minX = Math.min(minX, part.positions[i]); maxX = Math.max(maxX, part.positions[i]); } });
    const mid = (minX + maxX) / 2;
    out.forEach((part) => { for (let i = 0; i < part.positions.length; i += 3) part.positions[i] -= mid; });
  }
  toFree.forEach((solid) => { try { solid.delete(); } catch { /* gone */ } });
  return {
    parts: out,
    worn: built.reduce((sum, { built: b }) => sum + b.worn, 0),
    keptDepth: built.map(({ built: b }) => b.keptDepth),
    surface: built.map(({ built: b }) => b.kept),
    voxel,
    warnings,
    ...(opening !== undefined ? { opening } : {}),
    ...(held ? { held } : {}),
    pieces,
  };
}
