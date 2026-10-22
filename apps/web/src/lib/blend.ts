/**
 * Fork (build 25): Blend - a smooth piece joining two bodies, like Fusion's loft between faces.
 *
 * The two flat faces that face each other are found (or given); their outer outlines are sampled
 * to the same number of points, lined up, and swept along a curve that leaves each face straight
 * out of it, so the new piece meets both bodies without a kink. Smoothness 0 is a straight taper;
 * 100 an S-curve that starts and ends square to the faces. The piece reaches a little into both
 * bodies so that grouping joins all three without a skin.
 */
import * as THREE from "three";
import { meshForShape } from "@/lib/editorMeshCore";
import { meshShapeFromPositions } from "@/lib/lithophane";
import { readPerforableFace, type PerforableFace } from "@/lib/holePatternShapes";
import type { Point2 } from "@/lib/holePattern";
import type { WorkplaneShape } from "@/types/layerling";

type Vec = { x: number; y: number; z: number };

export type BlendSettings = {
  /** 0 a straight taper, 100 a full S-curve square to both faces. With `linked` off, only the first part's end. */
  smoothness: number;
  /** Fork (build 29): the second part's end, used when `linked` is off - Fusion's tangency weight per profile. */
  smoothnessEnd: number;
  /** Both ends the same (the default). */
  linked: boolean;
  /** Turns where the two outlines are matched, in steps of 1/RING of a turn: undoes a twist. */
  twist: number;
  /** Fork (build 29): true joins the two parts and the piece into one group (Fusion's Join); false leaves the piece a part of its own (New body). */
  join: boolean;
  /** Fork (build 31): every slice stands square to the path, like a pipe sweep, so the piece keeps its size. */
  keepDiameter: boolean;
  /** Fork (build 28): when both faces have an opening (two hollow parts), the piece is a sleeve open through. */
  hollow: boolean;
};

export const DEFAULT_BLEND: BlendSettings = { smoothness: 70, smoothnessEnd: 70, linked: true, twist: 0, hollow: true, join: true, keepDiameter: false };
export const BLEND_RING = 96;
const BLEND_SECTIONS = 40;
/** How far the piece reaches into each body, so they join without a skin. */
export const BLEND_OVERLAP = 0.2;
/** Fork (build 29): how much the piece narrows inside each body (a share of the way to its centre). */
const BLEND_TUCK = 0;
/** A point moved `share` of the way toward `centre` (away from it when negative). */
function towards(point: THREE.Vector3, centre: THREE.Vector3, share: number) {
  return point.clone().lerp(centre, share);
}

export function normalizeBlend(settings: Partial<BlendSettings>): BlendSettings {
  const smoothness = Number.isFinite(settings.smoothness) ? Math.min(100, Math.max(0, settings.smoothness as number)) : DEFAULT_BLEND.smoothness;
  const twist = Number.isFinite(settings.twist) ? Math.round(settings.twist as number) : 0;
  const linked = settings.linked !== false;
  const end = Number.isFinite(settings.smoothnessEnd) ? Math.min(100, Math.max(0, settings.smoothnessEnd as number)) : smoothness;
  return { smoothness, smoothnessEnd: linked ? smoothness : end, linked, twist: ((twist % BLEND_RING) + BLEND_RING) % BLEND_RING, hollow: settings.hollow !== false, join: settings.join !== false, keepDiameter: settings.keepDiameter === true };
}

/** The triangles of a body in the world, nine numbers each. */
export function worldTriangles(shape: WorkplaneShape): number[] {
  const mesh = meshForShape(shape);
  const out: number[] = [];
  mesh.faces.forEach((face) => face.forEach((index) => out.push(mesh.vertices[index][0], mesh.vertices[index][1], mesh.vertices[index][2])));
  return out;
}

type Plane = { normal: THREE.Vector3; point: THREE.Vector3; centroid: THREE.Vector3; area: number; triangles: number };

/** The flat faces of a body (two or more triangles in one plane), with the normal pointing out of it. */
export function flatFaces(positions: number[]): Plane[] {
  const count = Math.floor(positions.length / 9);
  const center = new THREE.Vector3();
  for (let index = 0; index < positions.length; index += 3) center.add(new THREE.Vector3(positions[index], positions[index + 1], positions[index + 2]));
  center.divideScalar(Math.max(1, positions.length / 3));
  const planes = new Map<string, Plane>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let index = 0; index < count; index += 1) {
    const o = index * 9;
    a.set(positions[o], positions[o + 1], positions[o + 2]);
    b.set(positions[o + 3], positions[o + 4], positions[o + 5]);
    c.set(positions[o + 6], positions[o + 7], positions[o + 8]);
    const cross = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const area = cross.length() / 2;
    if (area < 1e-9) continue;
    const normal = cross.normalize();
    const mid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
    // Outward: away from the body's middle (the winding of a mesh is not always to be trusted).
    if (normal.dot(new THREE.Vector3().subVectors(mid, center)) < 0) normal.negate();
    const offset = normal.dot(a);
    const key = `${normal.x.toFixed(3)},${normal.y.toFixed(3)},${normal.z.toFixed(3)},${offset.toFixed(2)}`;
    const plane = planes.get(key);
    if (plane) {
      plane.centroid.addScaledVector(mid, area);
      plane.area += area;
      plane.triangles += 1;
    } else {
      planes.set(key, { normal: normal.clone(), point: mid.clone(), centroid: mid.clone().multiplyScalar(area), area, triangles: 1 });
    }
  }
  const flat = [...planes.values()].filter((plane) => plane.triangles >= 2);
  // A round side is many thin flat strips: only faces of a real size next to the body's biggest flat
  // face count (a cylinder's ends, a box's sides), never one strip of a curve.
  const biggest = Math.max(0, ...flat.map((plane) => plane.area));
  return flat
    .filter((plane) => plane.area >= biggest * 0.2)
    .map((plane) => ({ ...plane, centroid: plane.centroid.divideScalar(plane.area) }));
}

export type BlendFace = { shapeId: string; face: PerforableFace; normal: Vec };

/** The pair of flat faces, one on each body, that face each other best; null when there is none. */
export function facingFaces(a: WorkplaneShape, b: WorkplaneShape): { a: BlendFace; b: BlendFace } | null {
  const pa = worldTriangles(a);
  const pb = worldTriangles(b);
  const facesA = flatFaces(pa);
  const facesB = flatFaces(pb);
  let best: { fa: Plane; fb: Plane; score: number } | null = null;
  for (const fa of facesA) {
    for (const fb of facesB) {
      const between = new THREE.Vector3().subVectors(fb.centroid, fa.centroid);
      const distance = between.length();
      if (distance < 1e-6) continue;
      between.divideScalar(distance);
      const outOfA = fa.normal.dot(between);
      const outOfB = -fb.normal.dot(between);
      if (outOfA < 0.25 || outOfB < 0.25) continue;
      // Facing well matters most; then the bigger faces; then the nearer pair.
      const score = outOfA + outOfB + 0.15 * Math.log1p(Math.min(fa.area, fb.area)) - 0.002 * distance;
      if (!best || score > best.score) best = { fa, fb, score };
    }
  }
  if (!best) return null;
  const readA = readPerforableFace(pa, best.fa.point, best.fa.normal);
  const readB = readPerforableFace(pb, best.fb.point, best.fb.normal);
  if (!readA.ok || !readB.ok) return null;
  return {
    a: { shapeId: a.id, face: readA.face, normal: { x: best.fa.normal.x, y: best.fa.normal.y, z: best.fa.normal.z } },
    b: { shapeId: b.id, face: readB.face, normal: { x: best.fb.normal.x, y: best.fb.normal.y, z: best.fb.normal.z } },
  };
}

function loopArea(loop: Point2[]) {
  let area = 0;
  for (let index = 0; index < loop.length; index += 1) {
    const p = loop[index];
    const q = loop[(index + 1) % loop.length];
    area += p.u * q.v - q.u * p.v;
  }
  return area / 2;
}

function loopWorld(face: PerforableFace, loop: Point2[]): THREE.Vector3[] {
  const { origin, xAxis, zAxis } = face.workplane;
  return loop.map((point) => new THREE.Vector3(
    origin.x + xAxis.x * point.u + zAxis.x * point.v,
    origin.y + xAxis.y * point.u + zAxis.y * point.v,
    origin.z + xAxis.z * point.u + zAxis.z * point.v,
  ));
}

/** Fork (build 28): the face's biggest opening (the bore of a hollow part), in the world, or null. */
function openingLoopWorld(face: PerforableFace): THREE.Vector3[] | null {
  const loops = face.outline.loops.filter((loop) => loop.length >= 3).sort((p, q) => Math.abs(loopArea(q)) - Math.abs(loopArea(p)));
  return loops.length >= 2 ? loopWorld(face, loops[1]) : null;
}

/**
 * Fork (build 29): a point on the face, in its material, to find the face again later: a corner of its
 * outline moved a little in toward the middle (the middle itself may be the opening of a ring).
 */
export function blendFacePoint(face: BlendFace): { x: number; y: number; z: number } {
  const outer = outerLoopWorld(face.face);
  const middle = centroidOf(outer);
  const corner = outer[0];
  const toward = middle.clone().sub(corner);
  const step = Math.min(0.3, toward.length() * 0.02);
  const point = toward.lengthSq() > 0 ? corner.clone().addScaledVector(toward.normalize(), step) : corner.clone();
  return { x: point.x, y: point.y, z: point.z };
}

/** True when both faces have an opening, so the piece can be a sleeve. */
export function blendCanBeHollow(a: BlendFace, b: BlendFace): boolean {
  return Boolean(openingLoopWorld(a.face) && openingLoopWorld(b.face));
}

/** The face's outer edge (the loop with the largest area), in the world. */
function outerLoopWorld(face: PerforableFace): THREE.Vector3[] {
  const loops = face.outline.loops.filter((loop) => loop.length >= 3);
  const outer = loops.reduce((best, loop) => (Math.abs(loopArea(loop)) > Math.abs(loopArea(best)) ? loop : best), loops[0]);
  const { origin, xAxis, zAxis } = face.workplane;
  return outer.map((point) => new THREE.Vector3(
    origin.x + xAxis.x * point.u + zAxis.x * point.v,
    origin.y + xAxis.y * point.u + zAxis.y * point.v,
    origin.z + xAxis.z * point.u + zAxis.z * point.v,
  ));
}

/** `count` points evenly along a closed loop. */
export function resampleLoop(loop: THREE.Vector3[], count: number): THREE.Vector3[] {
  const lengths = [0];
  for (let index = 1; index <= loop.length; index += 1) lengths.push(lengths[index - 1] + loop[index - 1].distanceTo(loop[index % loop.length]));
  const total = lengths[lengths.length - 1];
  const out: THREE.Vector3[] = [];
  let segment = 0;
  for (let index = 0; index < count; index += 1) {
    const at = (total * index) / count;
    while (segment < loop.length - 1 && lengths[segment + 1] < at) segment += 1;
    const span = lengths[segment + 1] - lengths[segment] || 1;
    out.push(loop[segment].clone().lerp(loop[(segment + 1) % loop.length], (at - lengths[segment]) / span));
  }
  return out;
}

function centroidOf(points: THREE.Vector3[]) {
  return points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
}

/** Which way a loop turns, seen along `axis`: +1 or -1. */
function windingAlong(points: THREE.Vector3[], axis: THREE.Vector3) {
  const normal = new THREE.Vector3();
  for (let index = 0; index < points.length; index += 1) {
    const p = points[index];
    const q = points[(index + 1) % points.length];
    normal.x += (p.y - q.y) * (p.z + q.z);
    normal.y += (p.z - q.z) * (p.x + q.x);
    normal.z += (p.x - q.x) * (p.y + q.y);
  }
  return normal.dot(axis) >= 0 ? 1 : -1;
}

/** The two outlines with the same number of points, turning the same way, matched point to point. */
export function matchedLoops(a: THREE.Vector3[], b: THREE.Vector3[], axis: THREE.Vector3, twist: number, count = BLEND_RING) {
  const ringA = resampleLoop(a, count);
  let ringB = resampleLoop(b, count);
  if (windingAlong(ringA, axis) !== windingAlong(ringB, axis)) ringB = ringB.reverse();
  const ca = centroidOf(ringA);
  const cb = centroidOf(ringB);
  // Start B where it lines up best with A, then turn it by the twist asked for.
  let bestShift = 0;
  let bestCost = Infinity;
  for (let shift = 0; shift < count; shift += 1) {
    let cost = 0;
    for (let index = 0; index < count; index += 8) {
      const da = ringA[index].clone().sub(ca);
      const db = ringB[(index + shift) % count].clone().sub(cb);
      cost += da.distanceToSquared(db);
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestShift = shift;
    }
  }
  const shift = (bestShift + twist) % count;
  return { ringA, ringB: ringA.map((_, index) => ringB[(index + shift) % count]), ca, cb };
}

/** The sections of the blend piece: outer rings, the inner rings of a sleeve, and their centres along the path. */
/** `straight`: keep every slice parallel to the faces (no turning across the path) - the fallback when turned slices would cross. */
function blendSlices(a: BlendFace, b: BlendFace, settings: BlendSettings, straight = false, extraGap = 0) {
  const loopA = outerLoopWorld(a.face);
  const loopB = outerLoopWorld(b.face);
  if (loopA.length < 3 || loopB.length < 3) return null;
  const nA = new THREE.Vector3(a.normal.x, a.normal.y, a.normal.z).normalize();
  const nB = new THREE.Vector3(b.normal.x, b.normal.y, b.normal.z).normalize();
  const matched = matchedLoops(loopA, loopB, nA, settings.twist);
  const { ringA, ca } = matched;
  // extraGap: B as if moved that much further away along its own axis (to find how far a kept
  // diameter needs).
  const shiftB = nB.clone().multiplyScalar(-extraGap);
  const ringB = matched.ringB.map((point) => point.clone().add(shiftB));
  const cb = matched.cb.clone().add(shiftB);
  const distance = ca.distanceTo(cb);
  if (distance < 0.05) return null;
  // How smoothly each end leaves its face; one value for both when linked. The middle of the piece
  // takes their mean.
  const kA = settings.smoothness / 100;
  const kB = (settings.linked === false ? settings.smoothnessEnd : settings.smoothness) / 100;
  const k = (kA + kB) / 2;
  // The path: a curve from face to face leaving each one straight out; at 0 a straight line.
  const reachA = kA * 0.5 * distance;
  const reachB = kB * 0.5 * distance;
  const pathFor = (ra: number, rb: number) => new THREE.CubicBezierCurve3(ca, ca.clone().addScaledVector(nA, ra), cb.clone().addScaledVector(nB, rb), cb);
  let curve = pathFor(reachA, reachB);
  const offsetsA = ringA.map((point) => point.clone().sub(ca));
  const offsetsB = ringB.map((point) => point.clone().sub(cb));
  // Fork (build 28): the openings of two hollow parts, swept the same way - the inner wall of a sleeve.
  const openA = settings.hollow ? openingLoopWorld(a.face) : null;
  const openB = settings.hollow ? openingLoopWorld(b.face) : null;
  const inner = openA && openB ? matchedLoops(openA, openB, nA, settings.twist) : null;
  const innerA = inner ? inner.ringA : null;
  const innerB = inner ? inner.ringB.map((point) => point.clone().add(shiftB)) : null;
  const innerOffsetsA = innerA ? innerA.map((point) => point.clone().sub(ca)) : null;
  const innerOffsetsB = innerB ? innerB.map((point) => point.clone().sub(cb)) : null;
  const towardB = nB.clone().negate();
  // The slices along the path, each turned by `amount` (0..1) of the way to stand across the path.
  const slices = (amount: number, square = false) => {
    const rings: THREE.Vector3[][] = [];
    const innerRings: THREE.Vector3[][] = [];
    const centres: THREE.Vector3[] = [];
    const tangents: THREE.Vector3[] = [];
    // A little into body A, then the sweep, then a little into body B.
    // Inside the body the piece narrows a little (and a sleeve's bore widens), so its sides do not lie
    // on the body's own sides there - coinciding faces are what the CAD kernel cannot fuse.
    rings.push(ringA.map((point) => towards(point, ca, BLEND_TUCK).addScaledVector(nA, -BLEND_OVERLAP)));
    if (innerA) innerRings.push(innerA.map((point) => towards(point, ca, -BLEND_TUCK).addScaledVector(nA, -BLEND_OVERLAP)));
    centres.push(ca.clone().addScaledVector(nA, -BLEND_OVERLAP));
    tangents.push(nA.clone());
    for (let section = 0; section <= BLEND_SECTIONS; section += 1) {
      const t = section / BLEND_SECTIONS;
      // From one outline to the other: a cubic leaving each end with slope 1 - k there - a straight
      // taper at 0, flat (square to the face) at 100. Both ends alike, it is the smoothstep blend of before.
      const s = (t * t * t - 2 * t * t + t) * (1 - kA) + (-2 * t * t * t + 3 * t * t) + (t * t * t - t * t) * (1 - kB);
      const at = curve.getPoint(t);
      const tangent = curve.getTangent(t).normalize();
      // As in Fusion's loft, a slice stands across the path; otherwise a path that runs sideways
      // between two level faces flattens the piece. At the two ends it lies exactly on the faces.
      const facing = nA.clone().multiplyScalar(1 - s).addScaledVector(towardB, s);
      const turn = new THREE.Quaternion();
      if (amount > 0 && facing.lengthSq() > 1e-9) {
        turn.setFromUnitVectors(facing.normalize(), tangent);
        // Square: all the way, everywhere (a pipe sweep); otherwise most in the middle, none at the ends.
        turn.slerp(new THREE.Quaternion(), square ? 0 : 1 - amount * Math.sin(Math.PI * t));
      }
      rings.push(offsetsA.map((offset, index) => offset.clone().multiplyScalar(1 - s).addScaledVector(offsetsB[index], s).applyQuaternion(turn).add(at)));
      if (innerOffsetsA && innerOffsetsB) innerRings.push(innerOffsetsA.map((offset, index) => offset.clone().multiplyScalar(1 - s).addScaledVector(innerOffsetsB[index], s).applyQuaternion(turn).add(at)));
      centres.push(at);
      tangents.push(tangent);
    }
    rings.push(ringB.map((point) => towards(point, cb, BLEND_TUCK).addScaledVector(nB, -BLEND_OVERLAP)));
    if (innerB) innerRings.push(innerB.map((point) => towards(point, cb, -BLEND_TUCK).addScaledVector(nB, -BLEND_OVERLAP)));
    centres.push(cb.clone().addScaledVector(nB, -BLEND_OVERLAP));
    tangents.push(towardB.clone());
    return { rings, innerRings, centres, tangents };
  };
  // Slices that cross each other fold the piece inside out: every point of a slice must lie further
  // along the path than the same point of the slice before.
  const folds = ({ rings, innerRings, tangents }: ReturnType<typeof slices>) => [rings, innerRings].some((set) => set.some((ring, index) => index > 0 && ring.some((point, at) => point.clone().sub(rings[index - 1][at]).dot(tangents[index - 1].clone().add(tangents[index]).normalize()) <= 1e-6)));
  // Keep the diameter: every slice square to the path. The path's handles are tried at several
  // lengths for one whose bends are gentle enough; when none is, the parts are too close for it.
  if (settings.keepDiameter && !straight) {
    for (const share of [0.5, 0.65, 0.8, 1, 1.25, 0.35]) {
      curve = pathFor(share * distance, share * distance);
      const tried = slices(1, true);
      if (!folds(tried)) return { ...tried, sleeve: tried.innerRings.length === tried.rings.length, nA, nB, ringA };
    }
    return null;
  }
  // A straight taper (smoothness 0) joins matching points with straight lines: no turning. Smoother
  // ones turn as far as they can without a fold.
  let built = slices(0);
  for (const amount of (straight ? [] : [1, 0.75, 0.5, 0.25]).map((value) => value * k)) {
    if (amount <= 0) break;
    const tried = slices(amount);
    if (!folds(tried)) {
      built = tried;
      break;
    }
  }
  return { ...built, sleeve: built.innerRings.length === built.rings.length, nA, nB, ringA };
}

/**
 * Fork (build 31): with Keep the diameter on and the parts too close for it, how much further apart
 * (along the second part's axis) they need to be, in mm, rounded up; 0 when it already fits, null when
 * no distance helps (the faces do not face each other, say).
 */
export function blendKeepDiameterShortfall(a: BlendFace, b: BlendFace, settings: BlendSettings): number | null {
  const keep = { ...settings, keepDiameter: true };
  if (blendSlices(a, b, keep)) return 0;
  const size = Math.max(...outerLoopWorld(a.face).map((point) => point.distanceTo(centroidOf(outerLoopWorld(a.face))))) * 2;
  let high = Math.max(5, size);
  let tries = 0;
  while (!blendSlices(a, b, keep, false, high)) {
    high *= 2;
    if (++tries > 4) return null;
  }
  let low = 0;
  for (let step = 0; step < 12; step += 1) {
    const middle = (low + high) / 2;
    if (blendSlices(a, b, keep, false, middle)) high = middle;
    else low = middle;
  }
  return Math.ceil(high);
}

/**
 * Fork (build 29): what the CAD worker needs to build the piece as an exact loft (cadBlendLoft.ts):
 * every section of the sweep, and for a
 * sleeve the inner sections reaching a further half millimetre out at both ends.
 */
export function blendLoftInput(a: BlendFace, b: BlendFace, settings: BlendSettings, straight = false): { rings: number[][]; innerRings?: number[][] } | null {
  const built = blendSlices(a, b, settings, straight);
  if (!built) return null;
  const last = built.rings.length - 1;
  // Every section: fewer lets the smooth loft bulge away from the preview where the piece turns.
  const keep = built.rings.map((_, index) => index);
  void last;
  const flat = (ring: THREE.Vector3[]) => ring.flatMap((point) => [point.x, point.y, point.z]);
  const rings = keep.map((index) => flat(built.rings[index]));
  if (!built.sleeve) return { rings };
  const inner = keep.map((index) => built.innerRings[index]);
  const reach = 0.5;
  inner[0] = inner[0].map((point) => point.clone().addScaledVector(built.nA, -reach));
  inner[inner.length - 1] = inner[inner.length - 1].map((point) => point.clone().addScaledVector(built.nB, -reach));
  return { rings, innerRings: inner.map(flat) };
}

/** The triangles of the blend piece, in the world, outward-facing. Null when the faces cannot be joined. */
export function blendPositions(a: BlendFace, b: BlendFace, settings: BlendSettings, straight = false): number[] | null {
  const built = blendSlices(a, b, settings, straight);
  if (!built) return null;
  const { rings, innerRings, centres, sleeve, nA, nB, ringA } = built;

  const positions: number[] = [];
  // Each triangle is turned to face `outward` (any vector on its outer side).
  const push = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, outward: THREE.Vector3) => {
    const normal = new THREE.Vector3().subVectors(q, p).cross(new THREE.Vector3().subVectors(r, p));
    const [second, third] = normal.dot(outward) >= 0 ? [q, r] : [r, q];
    positions.push(p.x, p.y, p.z, second.x, second.y, second.z, third.x, third.y, third.z);
  };
  const count = ringA.length;
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    const middle = centres[ring].clone().add(centres[ring + 1]).multiplyScalar(0.5);
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      const p = rings[ring][index];
      const q = rings[ring][next];
      const r = rings[ring + 1][next];
      const u = rings[ring + 1][index];
      const away = p.clone().add(q).add(r).add(u).multiplyScalar(0.25).sub(middle);
      push(p, q, r, away);
      push(p, r, u, away);
    }
  }
  // The inner wall of a sleeve faces in, towards the path.
  if (sleeve) {
    const innerCount = innerRings[0].length;
    for (let ring = 0; ring < innerRings.length - 1; ring += 1) {
      const middle = centres[ring].clone().add(centres[ring + 1]).multiplyScalar(0.5);
      for (let index = 0; index < innerCount; index += 1) {
        const next = (index + 1) % innerCount;
        const p = innerRings[ring][index];
        const q = innerRings[ring][next];
        const r = innerRings[ring + 1][next];
        const u = innerRings[ring + 1][index];
        const inward = middle.clone().sub(p.clone().add(q).add(r).add(u).multiplyScalar(0.25));
        push(p, q, r, inward);
        push(p, r, u, inward);
      }
    }
  }
  // The two end caps, laid flat in their face's plane to be cut into triangles; each faces into its body.
  // A sleeve's caps are rings round the opening.
  const cap = (ring: THREE.Vector3[], face: PerforableFace, outward: THREE.Vector3, hole: THREE.Vector3[] | null) => {
    const { xAxis, zAxis } = face.workplane;
    const x = new THREE.Vector3(xAxis.x, xAxis.y, xAxis.z);
    const z = new THREE.Vector3(zAxis.x, zAxis.y, zAxis.z);
    const flat = ring.map((point) => new THREE.Vector2(point.dot(x), point.dot(z)));
    const flatHole = hole ? hole.map((point) => new THREE.Vector2(point.dot(x), point.dot(z))) : null;
    const all = hole ? [...ring, ...hole] : ring;
    const triangles = THREE.ShapeUtils.triangulateShape(flat, flatHole ? [flatHole] : []);
    triangles.forEach(([i, j, l]) => push(all[i], all[j], all[l], outward));
  };
  cap(rings[0], a.face, nA.clone().negate(), sleeve ? innerRings[0] : null);
  cap(rings[rings.length - 1], b.face, nB.clone().negate(), sleeve ? innerRings[innerRings.length - 1] : null);

  // Facing out: a closed body has a positive volume that way round.
  let volume = 0;
  for (let index = 0; index < positions.length; index += 9) {
    const p = new THREE.Vector3(positions[index], positions[index + 1], positions[index + 2]);
    const q = new THREE.Vector3(positions[index + 3], positions[index + 4], positions[index + 5]);
    const r = new THREE.Vector3(positions[index + 6], positions[index + 7], positions[index + 8]);
    volume += p.dot(q.clone().cross(r)) / 6;
  }
  if (volume < 0) {
    for (let index = 0; index < positions.length; index += 9) {
      for (let axis = 0; axis < 3; axis += 1) {
        const keep = positions[index + 3 + axis];
        positions[index + 3 + axis] = positions[index + 6 + axis];
        positions[index + 6 + axis] = keep;
      }
    }
  }
  return positions;
}

/** The volume enclosed by triangles given nine numbers each (outward-facing). */
export function meshPositionsVolume(positions: ArrayLike<number>): number {
  let volume = 0;
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return volume;
}

/** The blend piece as a body standing where it was built. */
export function blendShape(a: BlendFace, b: BlendFace, settings: BlendSettings, look: { name: string; color: string; id?: string }): WorkplaneShape | null {
  const positions = blendPositions(a, b, settings);
  if (!positions) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]); maxX = Math.max(maxX, positions[index]);
    minY = Math.min(minY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]); maxZ = Math.max(maxZ, positions[index + 2]);
  }
  const shape = meshShapeFromPositions(look.name, look.color, positions);
  return { ...shape, ...(look.id ? { id: look.id } : {}), x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, elevation: minY };
}
