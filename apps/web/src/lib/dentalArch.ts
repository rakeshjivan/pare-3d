/**
 * Fork (build 47): Dental Studio - the frame of an arch.
 *
 * cleanScan welds a raw intraoral scan, drops broken triangles and loose fragments and fills every
 * small hole, keeping the long open edge where the scan stops (the margin).
 *
 * archFrame turns one arch so its teeth point up and its occlusal plane - the plane through the
 * cusp tips and incisal edges - lies level at z = 0, the midline running along y with the incisors
 * towards -y (the front) and the gap between the last molars towards +y (the back).
 *
 * pairFrame does the same for an upper and a lower arch together, from where they touch in the
 * bite: one rigid move for both, so their occlusion is untouched. alignToBite moves an arch onto a
 * separate bite scan (iterative closest point), for scanners that export the arches apart.
 */
import * as THREE from "three";
import { toothZone } from "@/lib/dentalBase";
import {
  PointGrid, applyMatrix, boundaryLoops, convexHull, dropFragments, dropNonManifold, faceArea, fillLoop,
  loopLength, normalize, planeNormal, pointInPolygon, signedArea, weld,
  type Mesh, type Ring, type Vec3,
} from "@/lib/dentalMesh";

export const DENTAL_FRAGMENT_SHARE = 0.05;

export type CleanReport = { triangles: number; fragmentsRemoved: number; holesFilled: number; brokenRemoved: number };
export type CleanArch = { mesh: Mesh; margin: number[]; report: CleanReport };

export function cleanScan(positions: ArrayLike<number>): CleanArch {
  const triangles = Math.floor(positions.length / 9);
  const mesh = weld(positions);
  if (mesh.f.length < 9) throw new Error("This part has too few triangles to be a scan");
  const brokenRemoved = dropNonManifold(mesh);
  const fragmentsRemoved = dropFragments(mesh, DENTAL_FRAGMENT_SHARE);
  const loops = boundaryLoops(mesh);
  if (loops.length === 0) throw new Error("This part is already closed - it is a model, not a raw scan");
  const lengths = loops.map((loop) => loopLength(mesh, loop));
  let marginIndex = 0;
  lengths.forEach((length, i) => { if (length > lengths[marginIndex]) marginIndex = i; });
  let holesFilled = 0;
  loops.forEach((loop, i) => {
    if (i === marginIndex) return;
    fillLoop(mesh, loop);
    holesFilled += 1;
  });
  return { mesh, margin: loops[marginIndex], report: { triangles, fragmentsRemoved, holesFilled, brokenRemoved } };
}

/** The direction from the margin towards the teeth: the margin plane's normal, the way the far side of the surface lies. */
export function marginUp(m: Mesh, margin: number[]): Vec3 {
  const points = margin.map((i) => [m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]]);
  let normal = planeNormal(points);
  const c = [0, 0, 0];
  points.forEach((p) => { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; });
  c[0] /= points.length; c[1] /= points.length; c[2] /= points.length;
  let far = 0, sign = 1;
  for (let i = 0; i < m.v.length; i += 3) {
    const d = (m.v[i] - c[0]) * normal[0] + (m.v[i + 1] - c[1]) * normal[1] + (m.v[i + 2] - c[2]) * normal[2];
    if (Math.abs(d) > far) {
      far = Math.abs(d);
      sign = Math.sign(d) || 1;
    }
  }
  if (sign < 0) normal = [-normal[0], -normal[1], -normal[2]];
  return normal;
}

const rotation = (from: Vec3, to: Vec3) => new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...from), new THREE.Vector3(...to)));

function transformed(m: Mesh, matrix: THREE.Matrix4): Float64Array {
  const out = new Float64Array(m.v.length);
  const p = new THREE.Vector3();
  for (let i = 0; i < m.v.length; i += 3) {
    p.set(m.v[i], m.v[i + 1], m.v[i + 2]).applyMatrix4(matrix);
    out[i] = p.x; out[i + 1] = p.y; out[i + 2] = p.z;
  }
  return out;
}

/**
 * The cusp tips and incisal edges of an arch whose teeth point up: the highest point in each of 48
 * sectors round the arch, as far as they lie in the top 8 mm.
 */
/**
 * Cusp tips found tooth by tooth on the top surface (toothZone's tips), thinned to one per 1.5 mm;
 * the sector tips below when too few are found.
 */
function localTips(v: Float64Array, f: number[]): number[][] {
  const found: number[][] = [];
  toothZone({ v: v as unknown as number[], f }, undefined, undefined, found);
  const seen = new Set<string>();
  const thinned = found.filter(([x, y]) => { const key = `${Math.round(x / 1.5)},${Math.round(y / 1.5)}`; if (seen.has(key)) return false; seen.add(key); return true; });
  return thinned.length >= 8 ? thinned : cuspTips(v);
}

function cuspTips(v: Float64Array): number[][] {
  let top = -Infinity;
  for (let i = 2; i < v.length; i += 3) top = Math.max(top, v[i]);
  let cx = 0, cy = 0, n = 0;
  for (let i = 0; i < v.length; i += 3) if (v[i + 2] > top - 6) { cx += v[i]; cy += v[i + 1]; n += 1; }
  cx /= n || 1; cy /= n || 1;
  const sectors = 48;
  const best: Array<number[] | null> = new Array(sectors).fill(null);
  for (let i = 0; i < v.length; i += 3) {
    if (v[i + 2] < top - 8) continue;
    const s = Math.floor(((Math.atan2(v[i + 1] - cy, v[i] - cx) + Math.PI) / (2 * Math.PI)) * sectors) % sectors;
    if (!best[s] || v[i + 2] > best[s]![2]) best[s] = [v[i], v[i + 1], v[i + 2]];
  }
  return best.filter((p): p is number[] => p !== null);
}

/** A plane through points, refitted without the ones more than 0.8 mm off it; its normal points up. */
function robustPlane(points: number[][]): { normal: Vec3; height: number } | null {
  let kept = points;
  let normal: Vec3 = [0, 0, 1];
  let c = [0, 0, 0];
  for (let round = 0; round < 4; round += 1) {
    if (kept.length < 6) return null;
    normal = planeNormal(kept);
    if (normal[2] < 0) normal = [-normal[0], -normal[1], -normal[2]];
    c = [0, 0, 0];
    kept.forEach((p) => { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; });
    c = c.map((x) => x / kept.length);
    const next = kept.filter((p) => Math.abs((p[0] - c[0]) * normal[0] + (p[1] - c[1]) * normal[1] + (p[2] - c[2]) * normal[2]) < 1.5);
    // Never down to a few tips along one side: a curved arch keeps most of its tips.
    if (next.length === kept.length || next.length < points.length * 0.6) break;
    kept = next;
  }
  return { normal, height: c[0] * normal[0] + c[1] * normal[1] + c[2] * normal[2] };
}

/** How long and narrow a band of points is seen from above: a partial arch, and its long axis's angle. */
function bandShape(band: Ring): { partial: boolean; axis: number } {
  let cx = 0, cy = 0;
  band.forEach(([x, y]) => { cx += x; cy += y; });
  cx /= band.length; cy /= band.length;
  let sxx = 0, syy = 0, sxy = 0;
  band.forEach(([x, y]) => { const dx = x - cx, dy = y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det)), l2 = tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const axis = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { partial: l1 > 0 && l2 / l1 < 0.22, axis };
}

/** Whether an arch, in its frame (teeth up, occlusal plane at z = 0), is a quadrant or sextant rather than a full arch. */
export function isPartialArch(m: Mesh, frame: THREE.Matrix4): boolean {
  return teethShape(transformed(m, frame), m.f)?.partial ?? false;
}

/**
 * The shape of the teeth seen from above, from the teeth found tooth by tooth (toothZone) rather
 * than a band of height: a tilted arch, or tall front teeth, would leave only some teeth in a band.
 */
function teethShape(v: Float64Array, f: number[]): { partial: boolean; axis: number } | null {
  const zone = toothZone({ v: v as unknown as number[], f });
  const points: Ring = [];
  for (let i = 0; i < zone.length; i += 1) if (zone[i]) points.push([v[i * 3], v[i * 3 + 1]]);
  if (points.length < 10) return null;
  const shape = bandShape(points);
  // A full arch is a U: its middle is the tongue or palate, with no tooth there. A quadrant or a
  // sextant has its teeth at its middle.
  let cx = 0, cy = 0;
  points.forEach(([x, y]) => { cx += x; cy += y; });
  cx /= points.length; cy /= points.length;
  const toothAtMiddle = points.some(([x, y]) => (x - cx) ** 2 + (y - cy) ** 2 < 9);
  return { partial: shape.partial || toothAtMiddle, axis: shape.axis };
}

/** How far a curve may wander off straight (mm) before an end counts as bent, and how much more one end must bend than the other. */
const END_BEND = 2.5;
const END_BEND_MARGIN = 1.5;

/**
 * How far each end of a long, narrow band (laid along y) bends away from the straight line through
 * its middle half: the band's middle across, slice by slice. Null when neither end clearly bends
 * more than the other.
 */
export function endBends(pts: ReadonlyArray<readonly [number, number]>, minY: number, maxY: number): { low: number; high: number } | null {
  const slices = 10;
  const span = maxY - minY;
  if (!(span > 1e-6)) return null;
  const xs: number[][] = Array.from({ length: slices }, () => []);
  pts.forEach(([x, y]) => xs[Math.min(slices - 1, Math.max(0, Math.floor(((y - minY) / span) * slices)))].push(x));
  const middleOf = (list: number[]) => {
    if (list.length < 5) return null;
    const sorted = [...list].sort((a, b) => a - b);
    return (sorted[Math.floor(sorted.length * 0.1)] + sorted[Math.floor(sorted.length * 0.9)]) / 2;
  };
  const centres = xs.map(middleOf);
  const at = (i: number) => minY + ((i + 0.5) / slices) * span;
  // The straight line through the middle half, by least squares.
  let n = 0, sy = 0, sx = 0, syy = 0, sxy = 0;
  for (let i = 3; i <= 6; i += 1) {
    const c = centres[i];
    if (c === null) continue;
    const y = at(i);
    n += 1; sy += y; sx += c; syy += y * y; sxy += y * c;
  }
  if (n < 3) return null;
  const slope = (n * sxy - sy * sx) / Math.max(1e-9, n * syy - sy * sy);
  const offset = (sx - slope * sy) / n;
  const off = (i: number) => {
    const c = centres[i];
    return c === null ? 0 : Math.abs(c - (offset + slope * at(i)));
  };
  const low = Math.max(off(0), off(1));
  const high = Math.max(off(slices - 1), off(slices - 2));
  if (Math.max(low, high) < END_BEND || Math.abs(low - high) < END_BEND_MARGIN) return null;
  return { low, high };
}

/**
 * The turn about z that puts the gap between the last molars at the back (+y), from the top band of
 * an arch whose teeth point up. Seen from the middle of the arch, the teeth surround it except at the
 * back: the widest empty sector of directions is the gap. When the band closes all round (a scan of
 * a palate up to the teeth), the longest edge of the outline seen from above stands in.
 */
function yawToBack(v: Float64Array, bandTop: number, plane = bandTop, teeth: { partial: boolean; axis: number } | null = null): { angle: number; centreX: number; centreY: number } {
  // The teeth near the occlusal plane: tall front teeth on their own would look like a sextant.
  const level = Math.min(bandTop - 5, plane - 4);
  const band: Ring = [];
  for (let i = 0; i < v.length; i += 3) if (v[i + 2] > level) band.push([v[i], v[i + 1]]);
  if (band.length < 10) return { angle: 0, centreX: 0, centreY: 0 };
  let cx = 0, cy = 0;
  band.forEach(([x, y]) => { cx += x; cy += y; });
  cx /= band.length; cy /= band.length;
  // A quadrant or sextant (crown and bridge scans) is long and narrow seen from above: it is laid
  // along y with its wider end - the molars - at the back.
  const shape = teeth ?? bandShape(band);
  if (shape.partial) {
    let angle = Math.PI / 2 - shape.axis;
    const rot = (x: number, y: number, a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    let pts = band.map(([x, y]) => rot(x - cx, y - cy, angle));
    let minY = Infinity, maxY = -Infinity;
    pts.forEach(([, y]) => { minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
    const span = maxY - minY;
    const width = (lo: number, hi: number) => {
      let a = Infinity, b = -Infinity;
      pts.forEach(([x, y]) => { if (y >= lo && y <= hi) { a = Math.min(a, x); b = Math.max(b, x); } });
      return Number.isFinite(a) ? b - a : 0;
    };
    // Build 55: a quadrant that reaches the front teeth bends round the canine towards the midline,
    // and that bend is the front - the molar end runs straight. Only when neither end bends (a
    // premolar-to-molar segment) does the wider end tell the molars. The bend made the front end
    // look the wider one, which laid such quadrants backwards and put the hinge on the incisors.
    const bend = endBends(pts, minY, maxY);
    const frontAtMax = bend ? bend.high > bend.low : width(minY, minY + span * 0.25) > width(maxY - span * 0.25, maxY);
    if (frontAtMax) {
      angle += Math.PI;
      pts = band.map(([x, y]) => rot(x - cx, y - cy, angle));
    }
    let minX = Infinity, maxX = -Infinity;
    minY = Infinity; maxY = -Infinity;
    pts.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
    // Centre of the band in the turned frame, with the band's own centre (cx, cy) turned too.
    const [ccx, ccy] = rot(cx, cy, angle);
    return { angle, centreX: ccx + (minX + maxX) / 2, centreY: ccy + (minY + maxY) / 2 };
  }
  const bins = 72;
  const filled = new Uint8Array(bins);
  band.forEach(([x, y]) => { filled[Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI)) * bins) % bins] = 1; });
  let bestStart = -1, bestLength = 0;
  for (let start = 0; start < bins; start += 1) {
    if (filled[start] || !filled[(start + bins - 1) % bins]) continue;
    let length = 0;
    while (length < bins && !filled[(start + length) % bins]) length += 1;
    if (length > bestLength) { bestLength = length; bestStart = start; }
  }
  let back: number;
  if (bestStart >= 0 && bestLength >= 4) {
    back = ((bestStart + bestLength / 2) / bins) * 2 * Math.PI - Math.PI;
  } else {
    const hull = convexHull(band);
    let longest = 0, a = hull[0], b = hull[1];
    for (let i = 0; i < hull.length; i += 1) {
      const p = hull[i], q = hull[(i + 1) % hull.length];
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (length > longest) { longest = length; a = p; b = q; }
    }
    back = Math.atan2(-(b[0] - a[0]), b[1] - a[1]);
  }
  const angle = Math.PI / 2 - back;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of band) {
    const rx = x * cos - y * sin, ry = x * sin + y * cos;
    minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
    minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
  }
  return { angle, centreX: (minX + maxX) / 2, centreY: (minY + maxY) / 2 };
}

/** Turns, levels and centres one arch: teeth up, occlusal plane at z = 0, midline on y, front at -y. */
export function archFrame(m: Mesh, up: Vec3): THREE.Matrix4 {
  const turn = rotation(up, [0, 0, 1]);
  let v = transformed(m, turn);
  const plane = robustPlane(localTips(v, m.f));
  let level = new THREE.Matrix4();
  // The occlusal plane is used when it is plausibly near level with the margin's; otherwise the margin's stands.
  if (plane && plane.normal[2] > Math.cos((25 * Math.PI) / 180)) level = rotation(plane.normal, [0, 0, 1]);
  const leveled = level.clone().multiply(turn);
  v = transformed(m, leveled);
  const tips = robustPlane(localTips(v, m.f));
  let top = -Infinity;
  for (let i = 2; i < v.length; i += 3) top = Math.max(top, v[i]);
  const height = tips ? tips.height : top;
  const yaw = yawToBack(v, top, height, teethShape(v, m.f));
  const spin = new THREE.Matrix4().makeRotationZ(yaw.angle);
  const shift = new THREE.Matrix4().makeTranslation(-yaw.centreX, -yaw.centreY, -height);
  return shift.multiply(spin).multiply(leveled);
}

/**
 * How much an arch with its teeth up looks like an upper: the share of the inside of the arch
 * covered by surface well below the teeth (the palate). A lower has the tongue there: nothing.
 */
export function palateScore(m: Mesh, frame: THREE.Matrix4): number {
  const v = transformed(m, frame);
  const band: Ring = [];
  for (let i = 0; i < v.length; i += 3) if (v[i + 2] > -6) band.push([v[i], v[i + 1]]);
  if (band.length < 10) return 0;
  const hull = convexHull(band);
  const hullArea = Math.abs(signedArea(hull));
  const grid = new PointGrid(Float64Array.from(band.flatMap(([x, y]) => [x, y, 0])), 8);
  let covered = 0;
  for (let t = 0; t < m.f.length; t += 3) {
    const a = m.f[t] * 3, b = m.f[t + 1] * 3, c = m.f[t + 2] * 3;
    const x = (v[a] + v[b] + v[c]) / 3, y = (v[a + 1] + v[b + 1] + v[c + 1]) / 3, z = (v[a + 2] + v[b + 2] + v[c + 2]) / 3;
    if (z > -8 || !pointInPolygon(x, y, hull)) continue;
    if (grid.within(x, y, 0, 8)) continue; // within 8 mm of the teeth: gum, not palate
    covered += faceArea(m, t / 3);
  }
  return hullArea > 0 ? covered / hullArea : 0;
}

/**
 * Width of the arch 8 mm behind its front, across the canines, in an arch frame (front at -y). An
 * upper arch is broader there than a lower: canine to canine about 34 mm against 26 mm.
 */
export function canineWidth(m: Mesh, frame: THREE.Matrix4): number {
  const v = transformed(m, frame);
  let front = Infinity;
  for (let i = 0; i < v.length; i += 3) if (v[i + 2] > -3) front = Math.min(front, v[i + 1]);
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < v.length; i += 3) {
    if (v[i + 2] < -3 || Math.abs(v[i + 1] - (front + 8)) > 0.5) continue;
    minX = Math.min(minX, v[i]);
    maxX = Math.max(maxX, v[i]);
  }
  return Number.isFinite(minX) ? maxX - minX : 0;
}

/** The frontmost point (least y) of the arch within `band` mm of the occlusal plane, in a frame. */
export function frontOf(m: Mesh, frame: THREE.Matrix4, band = 6): number {
  const v = transformed(m, frame);
  let front = Infinity;
  for (let i = 0; i < v.length; i += 3) if (Math.abs(v[i + 2]) < band) front = Math.min(front, v[i + 1]);
  return front;
}

/** Points of `lower` within `reach` mm of a point of `upper`: where the arches touch. */
export function contacts(upper: Mesh, lower: Mesh, reach = 0.6): number[][] {
  const grid = new PointGrid(upper.v, reach);
  const out: number[][] = [];
  for (let i = 0; i < lower.v.length; i += 3) {
    const hit = grid.nearest(lower.v[i], lower.v[i + 1], lower.v[i + 2]);
    if (hit && hit[1] <= reach) out.push([lower.v[i], lower.v[i + 1], lower.v[i + 2]]);
  }
  return out;
}

export type PairFrame = { frame: THREE.Matrix4; contacts: number; inOcclusion: boolean };

/**
 * One frame for an upper and a lower in their bite: the lower's teeth up, the occlusal plane - fitted
 * through where the arches touch - level at z = 0, midline on y, front at -y.
 */
export function pairFrame(upper: CleanArch, lower: CleanArch): PairFrame {
  const upU = marginUp(upper.mesh, upper.margin);
  const upL = marginUp(lower.mesh, lower.margin);
  const common = normalize([upL[0] - upU[0], upL[1] - upU[1], upL[2] - upU[2]]);
  const touching = contacts(upper.mesh, lower.mesh);
  const inOcclusion = touching.length >= 30;
  // Level by the lower's cusp tips and incisal edges, as for a single arch; the contacts set the height.
  let turn = rotation(common, [0, 0, 1]);
  const tilted = robustPlane(localTips(transformed(lower.mesh, turn), lower.mesh.f));
  if (tilted && tilted.normal[2] > Math.cos((25 * Math.PI) / 180)) turn = rotation(tilted.normal, [0, 0, 1]).multiply(turn);
  let height: number | null = null;
  if (inOcclusion) {
    const zs = touching.map((p) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(turn).z);
    height = zs.reduce((sum, z) => sum + z, 0) / zs.length;
  }
  const v = transformed(lower.mesh, turn);
  let top = -Infinity;
  for (let i = 2; i < v.length; i += 3) top = Math.max(top, v[i]);
  if (height === null) {
    const tips = robustPlane(localTips(v, lower.mesh.f));
    height = tips ? tips.height : top;
  }
  const yaw = yawToBack(v, top, height, teethShape(v, lower.mesh.f));
  const spin = new THREE.Matrix4().makeRotationZ(yaw.angle);
  const shift = new THREE.Matrix4().makeTranslation(-yaw.centreX, -yaw.centreY, -height);
  return { frame: shift.multiply(spin).multiply(turn), contacts: touching.length, inOcclusion };
}

export type BiteFit = { matrix: THREE.Matrix4; rms: number; overlap: number };

/** Area-weighted vertex normals. */
function vertexNormals(m: Mesh): Float64Array {
  const n = new Float64Array(m.v.length);
  for (let t = 0; t < m.f.length; t += 3) {
    const a = m.f[t] * 3, b = m.f[t + 1] * 3, c = m.f[t + 2] * 3;
    const ux = m.v[b] - m.v[a], uy = m.v[b + 1] - m.v[a + 1], uz = m.v[b + 2] - m.v[a + 2];
    const wx = m.v[c] - m.v[a], wy = m.v[c + 1] - m.v[a + 1], wz = m.v[c + 2] - m.v[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    for (const v of [a, b, c]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/** Solves the 6 x 6 system A x = b (Gaussian elimination with pivoting); null when singular. */
function solve6(A: number[][], b: number[]): number[] | null {
  const n = 6;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let k = col; k <= n; k += 1) M[r][k] -= factor * M[col][k];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

/**
 * Moves an arch onto a bite scan by point-to-plane iterative closest point, from where the scanner
 * left it (the arches and the bite usually share the scanner's coordinates). A point pairs only with
 * a bite point facing the same way, so an upper's cusp never pairs with the lower cusp touching it.
 */
export function alignToBite(arch: Mesh, bite: Mesh): BiteFit {
  const grid = new PointGrid(bite.v, 2);
  const biteNormals = vertexNormals(bite);
  const archNormals = vertexNormals(arch);
  const count = arch.v.length / 3;
  const step = Math.max(1, Math.floor(count / 8000));
  const sample: number[] = [];
  for (let i = 0; i < count; i += step) sample.push(i);
  let total = new THREE.Matrix4();
  let rms = Infinity, overlap = 0;
  const p = new THREE.Vector3(), np = new THREE.Vector3();
  for (let iteration = 0; iteration < 50; iteration += 1) {
    const reach = iteration < 10 ? 2 : iteration < 25 ? 1 : 0.5;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(total);
    const A = Array.from({ length: 6 }, () => new Array(6).fill(0));
    const b = new Array(6).fill(0);
    let pairs = 0, squared = 0;
    for (const i of sample) {
      p.set(arch.v[i * 3], arch.v[i * 3 + 1], arch.v[i * 3 + 2]).applyMatrix4(total);
      np.set(archNormals[i * 3], archNormals[i * 3 + 1], archNormals[i * 3 + 2]).applyMatrix3(normalMatrix).normalize();
      const hit = grid.nearest(p.x, p.y, p.z);
      if (!hit || hit[1] > reach) continue;
      const q = hit[0] * 3;
      const nx = biteNormals[q], ny = biteNormals[q + 1], nz = biteNormals[q + 2];
      if (np.x * nx + np.y * ny + np.z * nz < 0.6) continue;
      const e = (p.x - bite.v[q]) * nx + (p.y - bite.v[q + 1]) * ny + (p.z - bite.v[q + 2]) * nz;
      // d/d(omega) of n . (omega x p) is p x n.
      const row = [p.y * nz - p.z * ny, p.z * nx - p.x * nz, p.x * ny - p.y * nx, nx, ny, nz];
      for (let r = 0; r < 6; r += 1) {
        b[r] -= row[r] * e;
        for (let c = 0; c < 6; c += 1) A[r][c] += row[r] * row[c];
      }
      pairs += 1;
      squared += e * e;
    }
    overlap = pairs / sample.length;
    if (pairs < 50) break;
    rms = Math.sqrt(squared / pairs);
    const x = solve6(A, b);
    if (!x) break;
    const angle = Math.hypot(x[0], x[1], x[2]);
    const turn = angle > 1e-12 ? new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(x[0] / angle, x[1] / angle, x[2] / angle), angle) : new THREE.Matrix4();
    const stepMatrix = new THREE.Matrix4().makeTranslation(x[3], x[4], x[5]).multiply(turn);
    total = stepMatrix.multiply(total);
    if (angle < 1e-6 && Math.hypot(x[3], x[4], x[5]) < 1e-5 && iteration > 25) break;
  }
  return { matrix: total, rms, overlap };
}

export { applyMatrix };
