/**
 * Build 81: Meshmixer's selection and repair tools for Sculpt - on the welded copy a selection works
 * on (lib/meshSculpt), each returning the part as a new triangle soup or a new choice of triangles.
 *
 *   - shrinkChoice / smoothChoice: the selection a ring smaller, or its outline smoothed (Meshmixer's
 *     Contract and Smooth Boundary, on the choice of triangles).
 *   - extrudeChoice: the selected patch moved out (or in) - along one direction (Extrude) or each
 *     corner along its own normal (Offset) - joined back to the rest by a wall along its edge.
 *   - bridgeChoice: the open edges the selection touches joined by a strip of triangles: two openings
 *     closed into a tube (Join), or two runs of open edge bridged (Bridge).
 *   - alignToPlate: the part turned so the selected surface faces straight down, onto the plate.
 *   - solidPositions: the part made a closed solid at a chosen detail on a voxel grid, whatever its
 *     holes, overlaps and loose shells (Make Solid).
 */
import * as THREE from "three";
import type { SculptMesh } from "@/lib/meshSculpt";
import { growChoice, invertChoice, soupOf } from "@/lib/meshSculpt";

/** The choice a ring of triangles smaller: every chosen triangle touching one not chosen is dropped. */
export function shrinkChoice(mesh: SculptMesh, chosen: Uint8Array): Uint8Array {
  const outside = growChoice(mesh, invertChoice(chosen));
  return chosen.map((value, t) => (value && !outside[t] ? 1 : 0));
}

/**
 * The choice's outline smoothed: notches filled and spurs cut by growing and shrinking it by `rings`
 * (a closing, then an opening), so its edge runs smoothly without changing its extent much.
 */
export function smoothChoice(mesh: SculptMesh, chosen: Uint8Array, rings = 2): Uint8Array {
  let out = chosen;
  for (let k = 0; k < rings; k += 1) out = growChoice(mesh, out);
  for (let k = 0; k < 2 * rings; k += 1) out = shrinkChoice(mesh, out);
  for (let k = 0; k < rings; k += 1) out = growChoice(mesh, out);
  // Never more than the outline grown by the rings, never empty where the choice was.
  return out.some(Boolean) ? out : chosen.slice();
}

function triangleNormal(p: ArrayLike<number>, a: number, b: number, c: number) {
  const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
  const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx] as [number, number, number];
}

/** The area-weighted normal of the chosen triangles (its length is twice their area). */
export function choiceNormal(mesh: SculptMesh, chosen: Uint8Array): THREE.Vector3 {
  const n = new THREE.Vector3();
  const tri = mesh.triangles;
  for (let t = 0; t < chosen.length; t += 1) if (chosen[t]) {
    const [x, y, z] = triangleNormal(mesh.points, tri[t * 3], tri[t * 3 + 1], tri[t * 3 + 2]);
    n.x += x; n.y += y; n.z += z;
  }
  return n;
}

/** The edges between a chosen triangle and one not chosen (or none): [from, to] in the chosen triangle's winding. */
function choiceBorder(mesh: SculptMesh, chosen: Uint8Array) {
  const tri = mesh.triangles;
  const key = (a: number, b: number) => a * 4294967296 + b;
  const directed = new Map<number, number>();
  for (let t = 0; t < tri.length / 3; t += 1) for (let k = 0; k < 3; k += 1) directed.set(key(tri[t * 3 + k], tri[t * 3 + ((k + 1) % 3)]), t);
  const border: Array<[number, number]> = [];
  for (let t = 0; t < chosen.length; t += 1) {
    if (!chosen[t]) continue;
    for (let k = 0; k < 3; k += 1) {
      const a = tri[t * 3 + k], b = tri[t * 3 + ((k + 1) % 3)];
      const other = directed.get(key(b, a));
      if (other === undefined || !chosen[other]) border.push([a, b]);
    }
  }
  return border;
}

/**
 * The chosen patch moved by `distance` mm and joined back by a wall along its edge. "extrude": every
 * corner along the patch's mean normal; "offset": each along its own (area-weighted) normal. A
 * negative distance pushes it in. The patch's corners on an open edge of the part move too; the wall
 * is only built where the patch meets the rest.
 */
export function extrudeChoice(mesh: SculptMesh, chosen: Uint8Array, distance: number, mode: "extrude" | "offset"): number[] {
  const tri = mesh.triangles, p = mesh.points;
  const n = p.length / 3;
  const inPatch = new Uint8Array(n);
  for (let t = 0; t < chosen.length; t += 1) if (chosen[t]) for (let k = 0; k < 3; k += 1) inPatch[tri[t * 3 + k]] = 1;
  const along = choiceNormal(mesh, chosen).normalize();
  const normals = new Float64Array(n * 3);
  if (mode === "offset") {
    for (let t = 0; t < chosen.length; t += 1) if (chosen[t]) {
      const [x, y, z] = triangleNormal(p, tri[t * 3], tri[t * 3 + 1], tri[t * 3 + 2]);
      for (let k = 0; k < 3; k += 1) { const i = tri[t * 3 + k]; normals[i * 3] += x; normals[i * 3 + 1] += y; normals[i * 3 + 2] += z; }
    }
    for (let i = 0; i < n; i += 1) {
      const l = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) || 1;
      normals[i * 3] /= l; normals[i * 3 + 1] /= l; normals[i * 3 + 2] /= l;
    }
  }
  // The patch gets corners of its own, moved; the rest keeps the old ones.
  const moved = new Float64Array(p.length);
  moved.set(p);
  const newIndex = new Int32Array(n).fill(-1);
  const extra: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (!inPatch[i]) continue;
    const d = mode === "offset" ? [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]] : [along.x, along.y, along.z];
    newIndex[i] = n + extra.length / 3;
    extra.push(p[i * 3] + d[0] * distance, p[i * 3 + 1] + d[1] * distance, p[i * 3 + 2] + d[2] * distance);
  }
  const points = new Float64Array(p.length + extra.length);
  points.set(moved);
  points.set(extra, p.length);
  const triangles: number[] = [];
  for (let t = 0; t < tri.length / 3; t += 1) {
    const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
    if (chosen[t]) triangles.push(newIndex[a], newIndex[b], newIndex[c]);
    else triangles.push(a, b, c);
  }
  // The wall: along each edge where the patch meets the rest, a quad from the old edge to the moved one.
  const tri2 = mesh.triangles;
  const key = (a: number, b: number) => a * 4294967296 + b;
  const directed = new Map<number, number>();
  for (let t = 0; t < tri2.length / 3; t += 1) for (let k = 0; k < 3; k += 1) directed.set(key(tri2[t * 3 + k], tri2[t * 3 + ((k + 1) % 3)]), t);
  for (const [a, b] of choiceBorder(mesh, chosen)) {
    const other = directed.get(key(b, a));
    if (other === undefined) continue; // an open edge of the part: nothing to join to
    const na = newIndex[a], nb = newIndex[b];
    // The rest's triangle runs b -> a; the patch's now runs na -> nb. The wall closes the gap between.
    triangles.push(a, b, nb, a, nb, na);
  }
  // A corner on the patch's edge belongs to both: the rest keeps the old corner (where the wall starts).
  const out = new Array<number>(triangles.length * 3);
  for (let k = 0; k < triangles.length; k += 1) {
    const i = triangles[k] * 3;
    out[k * 3] = points[i]; out[k * 3 + 1] = points[i + 1]; out[k * 3 + 2] = points[i + 2];
  }
  return out;
}

/** The part's open edges, as chains of corners (closed loops come back to their start). */
function openChains(mesh: SculptMesh, keep: (a: number, b: number) => boolean) {
  const tri = mesh.triangles;
  const key = (a: number, b: number) => a * 4294967296 + b;
  const directed = new Set<number>();
  for (let t = 0; t < tri.length / 3; t += 1) for (let k = 0; k < 3; k += 1) directed.add(key(tri[t * 3 + k], tri[t * 3 + ((k + 1) % 3)]));
  // An open edge a -> b has no b -> a. Following them, the opening runs round the hole.
  const next = new Map<number, number>();
  const prev = new Map<number, number>();
  for (let t = 0; t < tri.length / 3; t += 1) for (let k = 0; k < 3; k += 1) {
    const a = tri[t * 3 + k], b = tri[t * 3 + ((k + 1) % 3)];
    if (directed.has(key(b, a)) || !keep(a, b)) continue;
    // The hole's edge runs the other way from the triangle's.
    next.set(b, a);
    prev.set(a, b);
  }
  const used = new Set<number>();
  const chains: Array<{ corners: number[]; closed: boolean }> = [];
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    // Back to the chain's beginning (or round a loop).
    let first = start;
    while (prev.has(first) && prev.get(first) !== start && !used.has(prev.get(first)!)) {
      first = prev.get(first)!;
      if (first === start) break;
    }
    const corners = [first];
    used.add(first);
    let at = first;
    let closed = false;
    while (next.has(at)) {
      const to = next.get(at)!;
      if (to === first) { closed = true; break; }
      if (used.has(to)) break;
      corners.push(to);
      used.add(to);
      at = to;
    }
    if (corners.length >= 2) chains.push({ corners, closed });
  }
  return chains;
}

/**
 * Joins the open edges the selection touches with a strip of triangles: two whole openings (holes)
 * into a tube, or two runs of open edge across the gap between them. The selection only says which:
 * open edges with a corner in it. Null with a reason when there are not exactly two.
 */
export function bridgeChoice(mesh: SculptMesh, chosen: Uint8Array): { positions: number[]; joined: "loops" | "edges"; added: number } | { error: "count"; found: number } {
  const inChoice = new Uint8Array(mesh.points.length / 3);
  for (let t = 0; t < chosen.length; t += 1) if (chosen[t]) for (let k = 0; k < 3; k += 1) inChoice[mesh.triangles[t * 3 + k]] = 1;
  const whole = openChains(mesh, () => true).filter((chain) => chain.corners.some((c) => inChoice[c]));
  const loops = whole.filter((chain) => chain.closed);
  let pair: Array<{ corners: number[]; closed: boolean }>;
  let joined: "loops" | "edges";
  if (whole.length === 2 && loops.length === 2) { pair = whole; joined = "loops"; }
  else {
    // The runs of open edge inside the selection.
    const runs = openChains(mesh, (a, b) => Boolean(inChoice[a] && inChoice[b]));
    if (runs.length !== 2) return { error: "count", found: runs.length };
    pair = runs.map((run) => ({ ...run, closed: false }));
    joined = "edges";
  }
  const p = mesh.points;
  const at = (i: number) => new THREE.Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  let [a, b] = pair.map((chain) => chain.corners.slice());
  // Hole edges run round their holes; joined, the second runs the other way round to face the first.
  b.reverse();
  if (joined === "loops") {
    // Start the second where it is nearest the first's start.
    const s = at(a[0]);
    let best = 0;
    b.forEach((c, i) => { if (at(c).distanceToSquared(s) < at(b[best]).distanceToSquared(s)) best = i; });
    b = [...b.slice(best), ...b.slice(0, best)];
    a = [...a, a[0]];
    b = [...b, b[0]];
  } else if (at(a[0]).distanceTo(at(b[0])) + at(a[a.length - 1]).distanceTo(at(b[b.length - 1])) > at(a[0]).distanceTo(at(b[b.length - 1])) + at(a[a.length - 1]).distanceTo(at(b[0]))) {
    b.reverse();
  }
  // Walk both chains by arc length, adding the shorter step each time (a ribbon of triangles).
  const length = (chain: number[]) => { const out = [0]; for (let i = 1; i < chain.length; i += 1) out.push(out[i - 1] + at(chain[i - 1]).distanceTo(at(chain[i]))); return out.map((v) => v / (out[out.length - 1] || 1)); };
  const la = length(a), lb = length(b);
  const added: number[] = [];
  let i = 0, j = 0;
  while (i < a.length - 1 || j < b.length - 1) {
    const stepA = i < a.length - 1 ? la[i + 1] : Infinity, stepB = j < b.length - 1 ? lb[j + 1] : Infinity;
    if (stepA <= stepB) { added.push(a[i], a[i + 1], b[j]); i += 1; }
    else { added.push(a[i], b[j + 1], b[j]); j += 1; }
  }
  // The strip's winding follows the hole edges' (so it faces the same way as the surface round it).
  const all = [...Array.from(mesh.triangles), ...added];
  const out = new Array<number>(all.length * 3);
  for (let k = 0; k < all.length; k += 1) { const q = all[k] * 3; out[k * 3] = p[q]; out[k * 3 + 1] = p[q + 1]; out[k * 3 + 2] = p[q + 2]; }
  return { positions: out, joined, added: added.length / 3 };
}

/**
 * The part (a soup in the world, y up) turned so the chosen surface faces straight down, about its
 * middle, and set on the plate (its lowest point at y = 0). Null when the choice has no direction.
 */
export function alignToPlate(mesh: SculptMesh, chosen: Uint8Array): number[] | null {
  const n = choiceNormal(mesh, chosen);
  if (n.lengthSq() < 1e-18) return null;
  const turn = new THREE.Quaternion().setFromUnitVectors(n.normalize(), new THREE.Vector3(0, -1, 0));
  const soup = soupOf(mesh);
  const centre = new THREE.Vector3();
  for (let i = 0; i < soup.length; i += 3) centre.add(new THREE.Vector3(soup[i], soup[i + 1], soup[i + 2]));
  centre.divideScalar(soup.length / 3);
  const v = new THREE.Vector3();
  let low = Infinity;
  for (let i = 0; i < soup.length; i += 3) {
    v.set(soup[i], soup[i + 1], soup[i + 2]).sub(centre).applyQuaternion(turn).add(centre);
    soup[i] = v.x; soup[i + 1] = v.y; soup[i + 2] = v.z;
    low = Math.min(low, v.y);
  }
  for (let i = 1; i < soup.length; i += 3) soup[i] -= low;
  return soup;
}
