/**
 * Wax-up lab: library teeth placed on a scanned arch.
 *
 * Works in Dental Studio's arch frame: teeth up, occlusal plane near z = 0, midline on the y axis,
 * front at -y. The library's tooth bow has the front at +y and the teeth up as well, so it comes
 * across turned half a turn about z.
 *
 * 1. A curve through the scan's crowns (median radius per 2 degrees round a centre behind the incisors).
 * 2. The bow's teeth spaced along it by arc length, scaled to the scanned arch's length.
 * 3. Each tooth keeps the bow's inclinations (tip and torque, relative to the bow's own curve).
 * 4. Seated: its cusps level with the scan's, and its buccal face just outside the scanned one
 *    (an additive wax-up covers the tooth it is waxed on).
 */
import * as THREE from "three";
import type { BowTooth, Jaw, ToothLibrary, ToothMesh } from "./library";

export type Vec2 = [number, number];
export type ArchCurve = { pts: Vec2[]; s: number[]; length: number; centre: Vec2; zTop: number; sMid: number };
export type Adjust = { mesial: number; buccal: number; up: number; rotate: number; tip: number; torque: number; width: number; length: number };
export const NO_ADJUST: Adjust = { mesial: 0, buccal: 0, up: 0, rotate: 0, tip: 0, torque: 0, width: 1, length: 1 };

export type PlacedTooth = {
  fdi: number;
  position: number; // 1..8 in the quadrant
  /** The tooth's anatomical frame in the arch: mesial, buccal, occlusal (unit), and its centre. */
  mesial: THREE.Vector3;
  buccal: THREE.Vector3;
  occlusal: THREE.Vector3;
  centre: THREE.Vector3;
  /** Uniform size from the arch fit. */
  scale: number;
  /** Seat offsets found automatically, in the tooth's own frame (mm). */
  seat: { buccal: number; up: number };
  adjust: Adjust;
  mesh: ToothMesh;
  /** Fitted onto the scanned tooth (arch frame, applied after everything else); identity when not fitted. */
  fit: THREE.Matrix4;
  /** How well it fitted: mean distance of the crown to the scan, mm (null: not fitted). */
  fitError: number | null;
  fitNote?: string;
};

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];
};

/** The curve through the crowns, from one end of the arch to the other (x < 0 first). */
export function archCurve(points: Float32Array, above = 3): ArchCurve {
  // Dental Studio's frame puts the occlusal plane at z = 0, and `above` is how far the cusps reach over
  // it: points higher still are tissue flaps or scan tails, never teeth.
  const z: number[] = [];
  for (let i = 2; i < points.length; i += 3) if (points[i] > -4 && points[i] < above + 1) z.push(points[i]);
  const zTop = percentile(z, 0.99);
  const crown: [number, number, number][] = [];
  for (let i = 0; i < points.length; i += 3) if (points[i + 2] > zTop - 3 && points[i + 2] < above + 1) crown.push([points[i], points[i + 1], points[i + 2]]);
  const ys = crown.map((p) => p[1]);
  const yFront = percentile(ys, 0.01), yBack = percentile(ys, 0.99);
  const centre: Vec2 = [0, yFront + 0.62 * (yBack - yFront)];
  // The biting surfaces: top-surface cells of a 1 mm height map within 2.5 mm of the highest in their
  // part of the arch (the curve of Spee lowers the back teeth).
  const cell = new Map<string, [number, number, number]>();
  for (let i = 0; i < points.length; i += 3) {
    const zc = points[i + 2];
    if (zc <= zTop - 8 || zc >= above + 1) continue;
    const key = `${Math.round(points[i])},${Math.round(points[i + 1])}`;
    const c = cell.get(key);
    if (!c || zc > c[2]) cell.set(key, [points[i], points[i + 1], zc]);
  }
  // Every top-surface cell counts (side walls drop out of a height map); peaks alone favour one row of cusps.
  const peaks = [...cell.values()];
  const angleKey = (x: number, y: number) => Math.round(((Math.atan2(x - centre[0], -(y - centre[1])) * 180) / Math.PI) / 2);
  // The highest tip per 20-degree span sets the level for that part of the arch.
  const spanTop = new Map<number, number>();
  const spanZ = new Map<number, number[]>();
  for (const [x, y, zc] of peaks) { const k = Math.round(angleKey(x, y) / 10); (spanZ.get(k) ?? spanZ.set(k, []).get(k)!).push(zc); }
  for (const [k, zs] of spanZ) spanTop.set(k, percentile(zs, 0.97));
  const buckets = new Map<number, number[]>();
  for (const [x, y, zc] of peaks) {
    const k = angleKey(x, y);
    if (zc < (spanTop.get(Math.round(k / 10)) ?? Infinity) - 2.5) continue;
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(Math.hypot(x - centre[0], y - centre[1]));
  }
  const keys = [...buckets.keys()].filter((k) => buckets.get(k)!.length >= 3).sort((a, b) => a - b);
  let pts: Vec2[] = keys.map((k) => {
    const a = (k * 2 * Math.PI) / 180, r = percentile(buckets.get(k)!, 0.5);
    return [centre[0] + r * Math.sin(a), centre[1] - r * Math.cos(a)];
  });
  // Smooth (six passes of a 5-point average), ends kept.
  for (let pass = 0; pass < 6; pass += 1) {
    pts = pts.map((p, i) => {
      if (i < 2 || i > pts.length - 3) return p;
      const sum = [0, 0];
      for (let j = -2; j <= 2; j += 1) { sum[0] += pts[i + j][0]; sum[1] += pts[i + j][1]; }
      return [sum[0] / 5, sum[1] / 5];
    });
  }
  // Tissue tails behind the last molars reach as high as cusps but are narrow: measured across the
  // curve, a molar is 9-11 mm, a tail 3-5. Trim each end back to where the crowns are wide.
  const deep: Vec2[] = [];
  for (let i = 0; i < points.length; i += 3) if (points[i + 2] > zTop - 6 && points[i + 2] < above + 1) deep.push([points[i], points[i + 1]]);
  const widths = pts.map((p, i) => {
    const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    const tx = q[0] - o[0], ty = q[1] - o[1], l = Math.hypot(tx, ty) || 1;
    const across: number[] = [];
    for (const [x, y] of deep) {
      const dx = x - p[0], dy = y - p[1];
      const along = (dx * tx + dy * ty) / l, off = (dx * ty - dy * tx) / l;
      if (Math.abs(along) < 1.5 && Math.abs(off) < 10) across.push(off);
    }
    return across.length < 20 ? 0 : percentile(across, 0.97) - percentile(across, 0.03);
  });
  let lo = 0, hi = pts.length - 1;
  while (lo < hi && !(widths[lo] > 7.5 && widths[lo + 1] > 7.5)) lo += 1;
  while (hi > lo && !(widths[hi] > 7.5 && widths[hi - 1] > 7.5)) hi -= 1;
  if (hi - lo >= 15) pts = pts.slice(lo, hi + 1);
  const s = [0];
  for (let i = 1; i < pts.length; i += 1) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  // Where the curve crosses the midline.
  let sMid = s[s.length - 1] / 2;
  for (let i = 1; i < pts.length; i += 1) {
    if ((pts[i - 1][0] <= 0 && pts[i][0] >= 0) || (pts[i - 1][0] >= 0 && pts[i][0] <= 0)) {
      const t = pts[i][0] === pts[i - 1][0] ? 0 : -pts[i - 1][0] / (pts[i][0] - pts[i - 1][0]);
      sMid = s[i - 1] + t * (s[i] - s[i - 1]);
      break;
    }
  }
  return { pts, s, length: s[s.length - 1], centre, zTop, sMid };
}

export function curveAt(curve: ArchCurve, at: number): { p: Vec2; t: Vec2 } {
  const s = Math.max(0, Math.min(curve.length, at));
  let i = 1;
  while (i < curve.s.length - 1 && curve.s[i] < s) i += 1;
  const a = curve.pts[i - 1], b = curve.pts[i];
  const span = curve.s[i] - curve.s[i - 1] || 1;
  const f = (s - curve.s[i - 1]) / span;
  const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
  return { p: [a[0] + f * tx, a[1] + f * ty], t: [tx / l, ty / l] };
}

/** Outward (buccal) unit normal at a point of the curve. */
function outward(curve: ArchCurve, p: Vec2, t: Vec2): Vec2 {
  let n: Vec2 = [t[1], -t[0]];
  if (n[0] * (p[0] - curve.centre[0]) + n[1] * (p[1] - curve.centre[1]) < 0) n = [-n[0], -n[1]];
  return n;
}

/** Mean mesiodistal crown widths (mm), central incisor to third molar (Wheeler's Dental Anatomy). */
const NATURAL_WIDTH: Record<Jaw, number[]> = {
  upper: [8.5, 6.5, 7.5, 7.0, 6.5, 10.0, 9.0, 8.5],
  lower: [5.0, 5.5, 7.0, 7.0, 7.0, 11.0, 10.5, 10.0],
};

const FDI_QUADRANTS: Record<Jaw, [number, number]> = { upper: [1, 2], lower: [4, 3] };

/** Mesiodistal (local x) and buccolingual (local y) extent and the top (local z max) of a tooth file. */
export function toothExtent(mesh: ToothMesh) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < mesh.v.length; i += 3) {
    x0 = Math.min(x0, mesh.v[i]); x1 = Math.max(x1, mesh.v[i]);
    y0 = Math.min(y0, mesh.v[i + 1]); y1 = Math.max(y1, mesh.v[i + 1]);
    z0 = Math.min(z0, mesh.v[i + 2]); z1 = Math.max(z1, mesh.v[i + 2]);
  }
  return { width: x1 - x0, depth: y1 - y0, height: z1 - z0, top: z1, bottom: z0 };
}

/** The bow in the arch frame (half a turn about z), sorted from the x < 0 end to the x > 0 end. */
function bowInArch(bow: BowTooth[]): Array<BowTooth & { p: THREE.Vector3; o: THREE.Vector3; m: THREE.Vector3 }> {
  const turn = (v: [number, number, number]) => new THREE.Vector3(-v[0], -v[1], v[2]);
  return bow
    .map((tooth) => ({ ...tooth, p: turn(tooth.position), o: turn(tooth.occlusal).normalize(), m: turn(tooth.mesial).normalize() }))
    .sort((a, b) => Math.atan2(a.p.x, -a.p.y) - Math.atan2(b.p.x, -b.p.y));
}

export type PlaceOptions = {
  /** The last tooth position kept at each end (7 = second molars). */
  lastPosition: number;
  /** Which side of the arch frame is the patient's right: -1 (x < 0) or 1. */
  rightSide: -1 | 1;
};

/**
 * The library's teeth along the scanned arch. Returns every tooth of the span; which are waxed is the
 * caller's choice. With no bow in the library, teeth stand upright, spaced by their own widths.
 */
export function placeTeeth(lib: ToothLibrary, jaw: Jaw, curve: ArchCurve, options: PlaceOptions): PlacedTooth[] {
  const [rightQ, leftQ] = FDI_QUADRANTS[jaw];
  const files = lib.teeth[jaw];
  const sideOf = (x: number) => (Math.sign(x || 1e-9) === options.rightSide ? rightQ : leftQ);
  type Slot = { fdi: number; position: number; mesh: ToothMesh; width: number; o: THREE.Vector3; m: THREE.Vector3; bowT: THREE.Vector3; bowN: THREE.Vector3 };
  const slots: Slot[] = [];
  const bow = lib.bow[jaw];
  if (bow && bow.length >= 4) {
    const arch = bowInArch(bow);
    const mid = new THREE.Vector3();
    const centrals = arch.filter((t) => t.fdi % 10 === 1);
    centrals.forEach((t) => mid.add(t.p));
    mid.divideScalar(Math.max(1, centrals.length));
    // The bow's own centre, for its outward direction: behind the incisors as for the scan.
    const ys = arch.map((t) => t.p.y);
    const bowCentre = new THREE.Vector3(0, Math.min(...ys) + 0.62 * (Math.max(...ys) - Math.min(...ys)), 0);
    arch.forEach((tooth, i) => {
      const position = tooth.fdi % 10;
      const mesh = files.get(position);
      if (!mesh || position > options.lastPosition) return;
      const prev = arch[Math.max(0, i - 1)].p, next = arch[Math.min(arch.length - 1, i + 1)].p;
      const t = new THREE.Vector3(next.x - prev.x, next.y - prev.y, 0).normalize();
      if (t.dot(new THREE.Vector3(mid.x - tooth.p.x, mid.y - tooth.p.y, 0)) < 0) t.negate();
      let n = new THREE.Vector3(t.y, -t.x, 0);
      if (n.dot(new THREE.Vector3(tooth.p.x - bowCentre.x, tooth.p.y - bowCentre.y, 0)) < 0) n.negate();
      // Re-number by the side the tooth lands on in the arch frame.
      const fdi = sideOf(tooth.p.x) * 10 + position;
      slots.push({ fdi, position, mesh, width: toothExtent(mesh).width, o: tooth.o, m: tooth.m, bowT: t, bowN: n });
    });
  } else {
    // No bow: upright teeth, 7..1 then 1..7 across the arch.
    const order = [...Array(options.lastPosition).keys()].map((k) => options.lastPosition - k);
    const sideA = options.rightSide < 0 ? rightQ : leftQ, sideB = sideA === rightQ ? leftQ : rightQ;
    for (const [q, positions] of [[sideA, order], [sideB, [...order].reverse()]] as const) {
      for (const position of positions) {
        const mesh = files.get(position);
        if (!mesh) continue;
        slots.push({ fdi: q * 10 + position, position, mesh, width: toothExtent(mesh).width, o: new THREE.Vector3(0, 0, 1), m: new THREE.Vector3(1, 0, 0), bowT: new THREE.Vector3(1, 0, 0), bowN: new THREE.Vector3(0, 1, 0) });
      }
    }
  }
  if (!slots.length) return [];
  // Size: the library brought to natural mean mesiodistal widths (libraries differ: M.O.D Round's
  // upper teeth are ~1.35x natural). The arch's scanned length is not used: where a scan ends is
  // unreliable (tissue tails, flanges), and the fit onto each scanned tooth adapts the crown anyway.
  const total = slots.reduce((sum, slot) => sum + slot.width, 0);
  const natural = slots.reduce((sum, slot) => sum + NATURAL_WIDTH[jaw][slot.position - 1], 0);
  const scale = Math.max(0.6, Math.min(1.4, natural / total));
  // Spaced by width from the midline outward: the contact between the centrals sits on the midline.
  const firstQuadrant = Math.floor(slots[0].fdi / 10);
  const sideA = slots.filter((slot) => Math.floor(slot.fdi / 10) === firstQuadrant).reduce((sum, slot) => sum + slot.width, 0);
  let s = curve.sMid - sideA * scale;
  return slots.map((slot) => {
    const at = s + (slot.width * scale) / 2;
    s += slot.width * scale;
    const { p, t } = curveAt(curve, at);
    let mesialT = new THREE.Vector3(t[0], t[1], 0);
    if (at > curve.sMid) mesialT.negate();
    const n2 = outward(curve, p, t);
    const n = new THREE.Vector3(n2[0], n2[1], 0), zUp = new THREE.Vector3(0, 0, 1);
    // The bow's inclinations, carried over in the curve's own frame.
    const carry = (axis: THREE.Vector3) => new THREE.Vector3()
      .addScaledVector(mesialT, axis.dot(slot.bowT))
      .addScaledVector(n, axis.dot(slot.bowN))
      .addScaledVector(zUp, axis.z);
    const occlusal = carry(slot.o).normalize();
    const mesial = carry(slot.m);
    mesial.addScaledVector(occlusal, -mesial.dot(occlusal)).normalize();
    let buccal = new THREE.Vector3().crossVectors(occlusal, mesial);
    if (buccal.dot(n) < 0) buccal.negate();
    const top = toothExtent(slot.mesh).top * scale;
    const centre = new THREE.Vector3(p[0], p[1], curve.zTop - top);
    mesialT = mesial;
    return { fdi: slot.fdi, position: slot.position, mesial: mesialT, buccal, occlusal, centre, scale, seat: { buccal: 0, up: 0 }, adjust: { ...NO_ADJUST }, mesh: slot.mesh, fit: new THREE.Matrix4(), fitError: null };
  });
}

/** Tooth-file coordinates to the arch, with the seat and the person's adjustments. */
export function toothMatrix(tooth: PlacedTooth): THREE.Matrix4 {
  const a = tooth.adjust;
  const basis = new THREE.Matrix4().makeBasis(tooth.mesial, tooth.buccal, tooth.occlusal);
  const offset = new THREE.Vector3(a.mesial, tooth.seat.buccal + a.buccal, tooth.seat.up + a.up).applyMatrix4(basis);
  const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler((a.torque * Math.PI) / 180, (a.tip * Math.PI) / 180, (a.rotate * Math.PI) / 180, "ZYX"));
  const size = new THREE.Matrix4().makeScale(tooth.scale * a.width, tooth.scale, tooth.scale * a.length);
  return tooth.fit.clone().multiply(new THREE.Matrix4().makeTranslation(tooth.centre.x + offset.x, tooth.centre.y + offset.y, tooth.centre.z + offset.z).multiply(basis).multiply(rot).multiply(size));
}

/** Rigid transform taking points `p` onto `q` (least squares; Horn's quaternion method). */
function rigidFit(p: THREE.Vector3[], q: THREE.Vector3[]): THREE.Matrix4 {
  const cp = new THREE.Vector3(), cq = new THREE.Vector3();
  p.forEach((v) => cp.add(v)); q.forEach((v) => cq.add(v));
  cp.divideScalar(p.length); cq.divideScalar(q.length);
  let sxx = 0, sxy = 0, sxz = 0, syx = 0, syy = 0, syz = 0, szx = 0, szy = 0, szz = 0;
  for (let i = 0; i < p.length; i += 1) {
    const a = p[i].clone().sub(cp), b = q[i].clone().sub(cq);
    sxx += a.x * b.x; sxy += a.x * b.y; sxz += a.x * b.z;
    syx += a.y * b.x; syy += a.y * b.y; syz += a.y * b.z;
    szx += a.z * b.x; szy += a.z * b.y; szz += a.z * b.z;
  }
  const n = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ];
  // Largest eigenvector by power iteration on N + cI (shifted to be positive definite).
  const shift = Math.abs(sxx) + Math.abs(syy) + Math.abs(szz) + Math.abs(sxy) + Math.abs(sxz) + Math.abs(syx) + Math.abs(syz) + Math.abs(szx) + Math.abs(szy) + 1e-9;
  let v = [1, 0, 0, 0];
  for (let it = 0; it < 60; it += 1) {
    const w = [0, 1, 2, 3].map((r) => n[r][0] * v[0] + n[r][1] * v[1] + n[r][2] * v[2] + n[r][3] * v[3] + shift * v[r]);
    const l = Math.hypot(...w) || 1;
    v = w.map((x) => x / l);
  }
  const rotation = new THREE.Quaternion(v[1], v[2], v[3], v[0]).normalize();
  const m = new THREE.Matrix4().makeRotationFromQuaternion(rotation);
  const t = cq.clone().sub(cp.clone().applyQuaternion(rotation));
  return m.setPosition(t);
}

type Closest = { closestPointToPoint(p: THREE.Vector3, target: { point: THREE.Vector3; distance: number }, min?: number, max?: number): { point: THREE.Vector3; distance: number } | null };

/**
 * Fits the tooth onto the scanned tooth under it (closest-point iterations, its upper crown only):
 * for a wax-up over existing teeth the library crown then follows the patient's tooth, and the wax is
 * what the library shape adds. Refused (left as seated) when it would move more than 3 mm or turn more
 * than 12 degrees (25 when the crown fits within 0.7 mm) - over a gap, say.
 */
export function fitTooth(tooth: PlacedTooth, scan: Closest, iterations = 16): boolean {
  tooth.fit = new THREE.Matrix4();
  tooth.fitError = null;
  tooth.fitNote = "";
  const ext = toothExtent(tooth.mesh);
  const floor = ext.bottom + 0.45 * ext.height;
  const local: THREE.Vector3[] = [];
  const step = Math.max(1, Math.floor(tooth.mesh.v.length / 3 / 900));
  for (let i = 0; i < tooth.mesh.v.length / 3; i += step) if (tooth.mesh.v[i * 3 + 2] > floor) local.push(new THREE.Vector3(tooth.mesh.v[i * 3], tooth.mesh.v[i * 3 + 1], tooth.mesh.v[i * 3 + 2]));
  if (local.length < 30) { tooth.fitNote = "too few points"; return false; }
  const start = toothMatrix(tooth);
  const centre0 = new THREE.Vector3().setFromMatrixPosition(start);
  let fit = new THREE.Matrix4();
  const target = { point: new THREE.Vector3(), distance: 0 };
  let error = Infinity;
  for (let it = 0; it < iterations; it += 1) {
    const m = fit.clone().multiply(start);
    const p: THREE.Vector3[] = [], q: THREE.Vector3[] = [];
    let sum = 0, n = 0;
    // Pairs closer than 2.5 mm early on, 1.2 mm once it has settled.
    const reach = it < 6 ? 2.5 : 1.2;
    for (const v of local) {
      const w = v.clone().applyMatrix4(m);
      const hit = scan.closestPointToPoint(w, target, 0, 3);
      if (!hit) continue;
      sum += hit.distance; n += 1;
      if (hit.distance > reach) continue;
      p.push(w); q.push(hit.point.clone());
    }
    if (p.length < local.length * 0.2) { tooth.fitNote = `only ${Math.round((100 * p.length) / local.length)}% of the crown near the scan`; return false; }
    error = sum / Math.max(1, n);
    // Shift only for the first iterations, then shift and turn.
    if (it < 6) {
      const d = new THREE.Vector3();
      for (let i = 0; i < p.length; i += 1) d.add(q[i].clone().sub(p[i]));
      d.divideScalar(p.length);
      fit = new THREE.Matrix4().makeTranslation(d.x, d.y, d.z).multiply(fit);
    } else fit = rigidFit(p, q).multiply(fit);
  }
  const moved = new THREE.Vector3().setFromMatrixPosition(fit.clone().multiply(start)).distanceTo(centre0);
  const turn = 2 * Math.acos(Math.min(1, Math.abs(new THREE.Quaternion().setFromRotationMatrix(fit).w))) * 180 / Math.PI;
  // A close fit may turn further: levelled on its cusps, a back tooth's long axis leans with the curve of Spee.
  if (moved > 3 || turn > (error < 0.7 ? 25 : 12)) { tooth.fitNote = `would move ${moved.toFixed(1)} mm / turn ${turn.toFixed(0)} degrees`; tooth.fit = new THREE.Matrix4(); return false; }
  tooth.fit = fit;
  tooth.fitError = error;
  tooth.fitNote = `moved ${moved.toFixed(1)} mm, turned ${turn.toFixed(0)} degrees`;
  return true;
}

/**
 * An additive wax-up covers the tooth: the crown is moved out along its buccal axis until 90% of its
 * labial (buccal) face lies `wax` mm or more outside the scanned tooth. `signed` = distance from the
 * scan, + outside. Returns the move, mm (never more than 2).
 */
export function coverTooth(tooth: PlacedTooth, signed: (p: THREE.Vector3) => number, wax = 0.3): number {
  const ext = toothExtent(tooth.mesh);
  const floor = ext.bottom + 0.4 * ext.height;
  const m = toothMatrix(tooth);
  const d: number[] = [];
  const step = Math.max(1, Math.floor(tooth.mesh.v.length / 3 / 1500));
  const v = new THREE.Vector3();
  for (let i = 0; i < tooth.mesh.v.length / 3; i += step) {
    // The buccal half of the crown, above its cervical third.
    if (tooth.mesh.v[i * 3 + 1] < ext.depth * 0.1 || tooth.mesh.v[i * 3 + 2] < floor) continue;
    d.push(signed(v.set(tooth.mesh.v[i * 3], tooth.mesh.v[i * 3 + 1], tooth.mesh.v[i * 3 + 2]).applyMatrix4(m)));
  }
  if (d.length < 20) return 0;
  const tenth = percentile(d, 0.1);
  const move = Math.max(0, Math.min(2, wax - tenth));
  if (move > 0) {
    const out = tooth.buccal.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(tooth.fit)).normalize().multiplyScalar(move);
    tooth.fit = new THREE.Matrix4().makeTranslation(out.x, out.y, out.z).multiply(tooth.fit);
  }
  return move;
}

/** A 1 mm grid of the scan's points, for footprints. */
export class PointGrid2 {
  cells = new Map<string, number[]>();
  constructor(public points: Float32Array, public cell = 1) {
    for (let i = 0; i < points.length; i += 3) {
      const key = `${Math.floor(points[i] / cell)},${Math.floor(points[i + 1] / cell)}`;
      (this.cells.get(key) ?? this.cells.set(key, []).get(key)!).push(i);
    }
  }
  near(x: number, y: number, r: number): number[] {
    const out: number[] = [];
    const c = this.cell;
    for (let gx = Math.floor((x - r) / c); gx <= Math.floor((x + r) / c); gx += 1) {
      for (let gy = Math.floor((y - r) / c); gy <= Math.floor((y + r) / c); gy += 1) {
        const list = this.cells.get(`${gx},${gy}`);
        if (list) out.push(...list);
      }
    }
    return out;
  }
}

/**
 * Seats a tooth over the scanned one: its cusp tips level with the scan's, its buccal face 0.3 mm
 * outside the scanned buccal face - an additive wax-up. Uses the tooth as it now stands (adjustments too).
 */
export function seatTooth(tooth: PlacedTooth, grid: PointGrid2, wax = 0.3) {
  tooth.seat = { buccal: 0, up: 0 };
  tooth.fit = new THREE.Matrix4();
  const ext = toothExtent(tooth.mesh);
  for (let pass = 0; pass < 2; pass += 1) {
    const m = toothMatrix(tooth);
    const centre = new THREE.Vector3().setFromMatrixPosition(m);
    const halfW = (ext.width * tooth.scale * tooth.adjust.width) / 2 * 0.8;
    const halfD = (ext.depth * tooth.scale) / 2;
    const v = new THREE.Vector3();
    let toothTop = -Infinity;
    const toothB: Array<[number, number]> = [];
    for (let i = 0; i < tooth.mesh.v.length; i += 3 * 3) {
      v.set(tooth.mesh.v[i], tooth.mesh.v[i + 1], tooth.mesh.v[i + 2]).applyMatrix4(m).sub(centre);
      const along = v.dot(tooth.mesial), b = v.dot(tooth.buccal);
      if (Math.abs(along) > halfW) continue;
      toothTop = Math.max(toothTop, v.z + centre.z);
      toothB.push([b, v.z + centre.z]);
    }
    const ids = grid.near(centre.x, centre.y, Math.max(halfW, halfD) * 1.6);
    const zs: number[] = [];
    const scanB: Array<[number, number]> = [];
    for (const i of ids) {
      v.set(grid.points[i], grid.points[i + 1], grid.points[i + 2]).sub(centre);
      const along = v.dot(tooth.mesial), b = v.dot(tooth.buccal);
      if (Math.abs(along) > halfW || b < -halfD || b > halfD * 1.5) continue;
      zs.push(v.z + centre.z);
      scanB.push([b, v.z + centre.z]);
    }
    if (zs.length < 20 || !Number.isFinite(toothTop)) return;
    const scanTop = percentile(zs, 0.97);
    tooth.seat.up += scanTop - toothTop;
    // Buccal faces compared over the crown's upper band (below the cusps, above the gum: molar crowns
    // are short, and the gum below them otherwise reads as the tooth), never moved more than 1.5 mm.
    const reach = tooth.position >= 4 ? 3.5 : 5;
    const band = (z: number, top: number) => z < top - 0.8 && z > top - reach;
    const sb = scanB.filter(([b, z]) => band(z, scanTop) && b < halfD * 1.1).map(([b]) => b);
    const tb = toothB.filter(([, z]) => band(z + (scanTop - toothTop), scanTop)).map(([b]) => b);
    if (sb.length > 10 && tb.length > 10) tooth.seat.buccal = Math.max(-1.5, Math.min(1.5, tooth.seat.buccal + percentile(sb, 0.97) - percentile(tb, 0.97) + wax));
  }
}

/**
 * A correction for the arch frame when Dental Studio's is off: the occlusal plane tilted (a quadrant
 * of cusps above the rest) or the arch turned (its open back not toward +y). Levels on the cusp tips
 * of eight sectors around the arch, then turns the largest empty sector of the tooth band to the
 * back. Small errors are left alone: only a tilt over 1.5 degrees or a turn over 20 degrees is
 * corrected. Returns the matrix (to apply before the frame) and the cusp height above z = 0.
 */
export function frameCorrection(points: Float32Array, above: number, forceTurn?: number): { fix: THREE.Matrix4; above: number; note: string; turn: number; gap: number } {
  // Height map: the highest point per 1 mm cell (below tall flaps).
  const cells = new Map<string, [number, number, number]>();
  for (let i = 0; i < points.length; i += 3) {
    const z = points[i + 2];
    if (z > above + 4) continue;
    const key = `${Math.round(points[i])},${Math.round(points[i + 1])}`;
    const c = cells.get(key);
    if (!c || z > c[2]) cells.set(key, [points[i], points[i + 1], z]);
  }
  const list = [...cells.values()];
  if (list.length < 200) return { fix: new THREE.Matrix4(), above, note: "", turn: 0, gap: 0 };
  let cx = 0, cy = 0;
  for (const [x, y] of list) { cx += x; cy += y; }
  cx /= list.length; cy /= list.length;
  const sectorOf = (x: number, y: number) => Math.min(7, Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI)) * 8));
  // Cusp tips: the top 8% of cells in each sector, each sector weighted the same.
  const tips: [number, number, number, number][] = [];
  for (let s = 0; s < 8; s += 1) {
    const inSector = list.filter(([x, y]) => sectorOf(x, y) === s);
    if (inSector.length < 20) continue;
    const top = percentile(inSector.map((c) => c[2]), 0.92);
    const chosen = inSector.filter((c) => c[2] >= top);
    for (const c of chosen) tips.push([c[0] - cx, c[1] - cy, c[2], 1 / chosen.length]);
  }
  // Least squares z = a x + b y + c.
  let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, sw = 0, sxz = 0, syz = 0, sz = 0;
  for (const [x, y, z, w] of tips) { sxx += w * x * x; sxy += w * x * y; syy += w * y * y; sx += w * x; sy += w * y; sw += w; sxz += w * x * z; syz += w * y * z; sz += w * z; }
  const m = new THREE.Matrix3().set(sxx, sxy, sx, sxy, syy, sy, sx, sy, sw);
  const sol = new THREE.Vector3(sxz, syz, sz).applyMatrix3(m.clone().invert());
  let a = sol.x, b = sol.y;
  const tilt = (Math.atan(Math.hypot(a, b)) * 180) / Math.PI;
  const notes: string[] = [];
  const fix = new THREE.Matrix4();
  if (tilt > 1.5 && tilt < 20) {
    const normal = new THREE.Vector3(-a, -b, 1).normalize();
    // About the middle of the cusp tips, so they stay at the height the rest of the lab expects.
    const pivot = new THREE.Vector3(cx, cy, sol.z);
    fix.makeTranslation(pivot.x, pivot.y, pivot.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(normal, new THREE.Vector3(0, 0, 1))))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    notes.push(`levelled ${tilt.toFixed(1)} degrees`);
  } else { a = 0; b = 0; }
  // The tooth band after levelling: cells within 3.5 mm of their sector's cusp height.
  const p = new THREE.Vector3();
  const level = list.map(([x, y, z]) => p.set(x, y, z).applyMatrix4(fix).toArray() as [number, number, number]);
  const sectorTop = new Array<number>(8).fill(-Infinity);
  for (let s = 0; s < 8; s += 1) {
    const zs = level.filter(([x, y]) => sectorOf(x, y) === s).map((c) => c[2]);
    if (zs.length >= 20) sectorTop[s] = percentile(zs, 0.92);
  }
  const band = level.filter(([x, y, z]) => z > sectorTop[sectorOf(x, y)] - 3.5);
  let bx = 0, by = 0;
  for (const [x, y] of band) { bx += x; by += y; }
  bx /= band.length; by /= band.length;
  // The largest run of empty 5-degree bins around the band's centre is the open back of the arch.
  const bins = new Array<number>(72).fill(0);
  for (const [x, y] of band) bins[Math.floor(((Math.atan2(y - by, x - bx) + Math.PI) / (2 * Math.PI)) * 72) % 72] += 1;
  const empty = bins.map((n) => n < Math.max(2, band.length / 72 / 10));
  let bestStart = -1, bestLen = 0;
  for (let start = 0; start < 72; start += 1) {
    if (!empty[start] || empty[(start + 71) % 72]) continue;
    let len = 0;
    while (len < 72 && empty[(start + len) % 72]) len += 1;
    if (len > bestLen) { bestLen = len; bestStart = start; }
  }
  let turn = 0;
  if (forceTurn !== undefined) turn = forceTurn;
  else if (bestLen >= 3 && bestLen < 72) {
    const backAngle = ((bestStart + bestLen / 2) / 72) * 2 * Math.PI - Math.PI;
    // Turn the back to +y (angle pi/2).
    turn = Math.PI / 2 - backAngle;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  }
  {
    const rot = new THREE.Matrix4();
    if (Math.abs(turn) > (12 * Math.PI) / 180) {
      rot.makeRotationZ(turn);
      notes.push(`turned ${((turn * 180) / Math.PI).toFixed(0)} degrees`);
    }
    // Centre the arch on x = 0 (the midline runs through the middle of the band of teeth).
    const c = new THREE.Vector3(bx, by, 0).applyMatrix4(rot);
    fix.premultiply(rot);
    if (Math.abs(c.x) > 3) { fix.premultiply(new THREE.Matrix4().makeTranslation(-c.x, 0, 0)); notes.push(`centred ${c.x.toFixed(0)} mm`); }
  }
  // Cusp height after the correction.
  const tops = list.map(([x, y, z]) => p.set(x, y, z).applyMatrix4(fix).z);
  const newAbove = notes.length ? percentile(tops, 0.97) : above;
  return { fix, above: newAbove, note: notes.join(", "), turn, gap: bestLen };
}
