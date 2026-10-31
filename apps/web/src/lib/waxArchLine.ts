/**
 * Build 106: the arch line - the curve through the incisal edges of the front teeth to the canine tips,
 * found from the dentist's landmarks, and the wax-up teeth laid along it. Each tooth is only moved and
 * turned (never stretched): centrals either side of the midline, each tooth's mesial contact on its
 * neighbour's distal one, its incisal edge on the curve, its labial face square to it. A narrow arch so
 * turns the teeth more against each other than a broad one, as a technician sets them.
 *
 * The curve is a parabola symmetric about the midline, in the occlusal plane: y = c - k x^2 (x across
 * the arch, y forward), fitted to the incisal marks by least squares - so one tooth out of line is
 * smoothed over rather than copied. Each tooth keeps its own height (the smile design's edge line),
 * tip and torque; only its turn about the occlusal plane's normal and its place change.
 */
import * as THREE from "three";

type Vec3 = [number, number, number];

export type ArchLine = {
  /** The midline point on the plane, where the centrals meet. */
  centre: Vec3;
  /** Across the arch (towards the patient's left), forward (labial), and the plane's normal (towards the incisal edges). */
  across: Vec3;
  forward: Vec3;
  normal: Vec3;
  /** y = c - k x^2. */
  c: number;
  k: number;
};

export type ArchTooth = {
  id: string;
  fdi: number;
  /** Mesio-distal width, mm. */
  width: number;
  /** The tooth's frame in the scene: the middle of its incisal edge, and unit directions. */
  origin: Vec3;
  mesial: Vec3;
  out: Vec3;
  up: Vec3;
};

const v = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);
const left = (fdi: number) => { const q = Math.floor(fdi / 10); return q === 2 || q === 3; };

/**
 * The arch line through the incisal points (FDI -> point, scene coordinates). `up` is roughly the teeth's
 * incisal direction (their frames' up, averaged); `outward` roughly labial. Null with fewer than three
 * points or no spread across the arch.
 */
export function fitArchLine(points: Record<number, Vec3>, up: Vec3, outward: Vec3): ArchLine | null {
  const entries = Object.entries(points).map(([fdi, p]) => ({ fdi: Number(fdi), p: v(p) }));
  if (entries.length < 3) return null;
  const normal = v(up).normalize();
  const rightSide = entries.filter((e) => !left(e.fdi)), leftSide = entries.filter((e) => left(e.fdi));
  if (!rightSide.length || !leftSide.length) return null;
  const mean = (list: typeof entries) => list.reduce((acc, e) => acc.add(e.p), new THREE.Vector3()).divideScalar(list.length);
  const across = mean(leftSide).sub(mean(rightSide));
  across.addScaledVector(normal, -across.dot(normal));
  if (across.length() < 1e-6) return null;
  across.normalize();
  const forward = new THREE.Vector3().crossVectors(normal, across).normalize();
  if (forward.dot(v(outward)) < 0) forward.negate();
  // The midline: between the centrals if both are marked, else the middle of the points.
  const centrals = entries.filter((e) => e.fdi % 10 === 1);
  const mid = centrals.length === 2 ? mean(centrals) : mean(entries);
  const centre = mid.clone().addScaledVector(normal, -mid.clone().dot(normal) + 0);
  // Coordinates in the plane through `mid` (heights dropped).
  const xs: number[] = [], ys: number[] = [];
  for (const e of entries) {
    const d = e.p.clone().sub(mid);
    xs.push(d.dot(across));
    ys.push(d.dot(forward));
  }
  // Least squares for y = c - k x^2: unknowns c and k.
  let s1 = 0, sx2 = 0, sx4 = 0, sy = 0, syx2 = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const x2 = xs[i] * xs[i];
    s1 += 1; sx2 += x2; sx4 += x2 * x2; sy += ys[i]; syx2 += ys[i] * x2;
  }
  const det = s1 * sx4 - sx2 * sx2;
  if (Math.abs(det) < 1e-9) return null;
  const c = (sy * sx4 - syx2 * sx2) / det;
  const k = -(s1 * syx2 - sx2 * sy) / det;
  void centre;
  return { centre: mid.toArray() as Vec3, across: across.toArray() as Vec3, forward: forward.toArray() as Vec3, normal: normal.toArray() as Vec3, c, k: Math.max(0.004, k) };
}

/**
 * Where each tooth goes on the arch line: a rigid move for each (scene coordinates), by its id. `curve`
 * scales the curvature (1 = the patient's arch line; less is broader, more is narrower); `forward` moves
 * the whole line labially (mm). Teeth are set out from the midline in order on each side.
 */
export function layOnArchLine(teeth: ArchTooth[], line: ArchLine, options: { curve?: number; forward?: number; keepDepth?: boolean } = {}): Map<string, THREE.Matrix4> {
  const curve = Math.max(0.2, options.curve ?? 1), shift = options.forward ?? 0;
  const k = line.k * curve;
  const centre = v(line.centre), across = v(line.across), forward = v(line.forward), normal = v(line.normal);
  let c = line.c + shift;
  // keepDepth: the line as far forward, on average, as the teeth stand now - the shape from the
  // patient's marks, the place from the wax (which stands clear of the patient's teeth).
  if (options.keepDepth !== false && teeth.length) {
    const now = teeth.reduce((sum, tooth) => sum + v(tooth.origin).sub(centre).dot(forward), 0) / teeth.length;
    const laid = layOnArchLine(teeth, { ...line, c: 0 }, { curve, keepDepth: false });
    let at = 0;
    for (const tooth of teeth) at += v(tooth.origin).applyMatrix4(laid.get(tooth.id)!).sub(centre).dot(forward);
    c = now - at / teeth.length + shift;
  }
  const y = (x: number) => c - k * x * x;
  const point = (x: number) => new THREE.Vector2(x, y(x));
  // From x0 outwards (sign s), the x whose point is `chord` from x0's.
  const step = (x0: number, s: number, chord: number) => {
    const p0 = point(x0);
    let lo = x0, hi = x0 + s * chord;
    while (point(hi).distanceTo(p0) < chord) hi += s * chord;
    for (let i = 0; i < 50; i += 1) {
      const m = (lo + hi) / 2;
      if (point(m).distanceTo(p0) < chord) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  };
  const out = new Map<string, THREE.Matrix4>();
  for (const s of [1, -1]) {
    const side = teeth.filter((tooth) => left(tooth.fdi) === (s === 1)).sort((a, b) => (a.fdi % 10) - (b.fdi % 10));
    let x = 0;
    for (const tooth of side) {
      const xm = x, xd = step(xm, s, Math.max(1, tooth.width));
      const pm = point(xm), pd = point(xd);
      // The incisal middle: on the curve, halfway along the tooth.
      const xc = step(xm, s, Math.max(0.5, tooth.width) / 2);
      const pc = point(xc);
      const mesial2 = new THREE.Vector2().subVectors(pm, pd).normalize();
      // The tooth now: its place and its mesial direction in the plane.
      const origin = v(tooth.origin);
      const height = origin.clone().sub(centre).dot(normal);
      const mesialNow = v(tooth.mesial);
      const nowAngle = Math.atan2(mesialNow.dot(forward), mesialNow.dot(across));
      const wantAngle = Math.atan2(mesial2.y, mesial2.x);
      const turn = new THREE.Matrix4().makeRotationAxis(normal, wantAngle - nowAngle);
      const target = centre.clone().addScaledVector(across, pc.x).addScaledVector(forward, pc.y).addScaledVector(normal, height);
      const move = new THREE.Matrix4().makeTranslation(target.x, target.y, target.z)
        .multiply(turn)
        .multiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
      out.set(tooth.id, move);
      x = xd;
    }
  }
  return out;
}
