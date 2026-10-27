/**
 * Build 79: the digital diagnostic wax-up - tooth libraries and their placement on a scan.
 *
 * A wax-up adds to the patient's teeth; it never removes any. Library teeth are closed shells set
 * over the scanned teeth and joined to the model by a solid union, so every point of the scan is
 * still where it was (only covered where wax goes). No segmentation of the scan is needed.
 *
 * Frames. Everything here works in an arch frame (lib/dentalArch archFrame): teeth up, occlusal
 * plane at z = 0, front at -y, midline on x = 0. A library set is turned into the same frame when
 * it is read (librarySet), so placing it is a scale and a move, then each tooth on its own.
 */
import * as THREE from "three";
import { archFrame, cleanScan, marginUp, vertexNormals } from "@/lib/dentalArch";
import { PointGrid, upwardness, weld, type Mesh } from "@/lib/dentalMesh";

/** One library tooth: its closed shell (triangle soup) in the set's frame, and where it sits. */
export type LibraryTooth = {
  /** Position in the set, in the order of x in the arch frame: 0 = the first. */
  index: number;
  /** "central", "lateral", "canine", "premolar1", "premolar2", "molar1", "molar2", "molar3". */
  kind: ToothKind;
  /** Which side of the midline in the set's frame (-1 or 1). */
  side: -1 | 1;
  positions: Float32Array;
  centroid: [number, number, number];
};
export type ToothKind = "central" | "lateral" | "canine" | "premolar1" | "premolar2" | "molar1" | "molar2" | "molar3";
const KINDS: ToothKind[] = ["central", "lateral", "canine", "premolar1", "premolar2", "molar1", "molar2", "molar3"];

/** A library set, turned into the arch frame: incisal edges up at z = 0, front at -y, midline x = 0. */
export type LibrarySet = { name: string; teeth: LibraryTooth[] };

// ---------------------------------------------------------------------------------------------
// Reading

/** Triangles of an OBJ file (v and f lines; faces fanned), as a soup. */
export function parseObj(text: string): Float32Array {
  const v: number[] = [];
  const out: number[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.split(/\s+/);
      v.push(Number(x), Number(y), Number(z));
    } else if (line.startsWith("f ")) {
      const ids = line.split(/\s+/).slice(1).map((token) => {
        const n = Number.parseInt(token.split("/")[0], 10);
        return n < 0 ? v.length / 3 + n : n - 1;
      });
      for (let k = 1; k + 1 < ids.length; k += 1) {
        for (const id of [ids[0], ids[k], ids[k + 1]]) out.push(v[id * 3], v[id * 3 + 1], v[id * 3 + 2]);
      }
    }
  }
  return Float32Array.from(out);
}

/** The separate shells of a triangle soup (joined where corners coincide), largest first. */
export function splitShells(positions: ArrayLike<number>, minTriangles = 50): Float32Array[] {
  const m = weld(positions, 1e-5);
  const n = m.v.length / 3;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i += 1) parent[i] = i;
  const find = (a: number) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < m.f.length; t += 3) {
    const a = find(m.f[t]);
    const b = find(m.f[t + 1]);
    if (a !== b) parent[b] = a;
    const c = find(m.f[t + 2]), r = find(a);
    if (c !== r) parent[c] = r;
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < m.f.length; t += 3) {
    const root = find(m.f[t]);
    let list = groups.get(root);
    if (!list) groups.set(root, (list = []));
    list.push(t);
  }
  const shells: Float32Array[] = [];
  for (const faces of groups.values()) {
    if (faces.length < minTriangles) continue;
    const out = new Float32Array(faces.length * 9);
    faces.forEach((t, i) => {
      for (let k = 0; k < 3; k += 1) {
        const vi = m.f[t + k] * 3;
        out[i * 9 + k * 3] = m.v[vi]; out[i * 9 + k * 3 + 1] = m.v[vi + 1]; out[i * 9 + k * 3 + 2] = m.v[vi + 2];
      }
    });
    shells.push(out);
  }
  return shells.sort((a, b) => b.length - a.length);
}

const centroidOf = (p: ArrayLike<number>): [number, number, number] => {
  let x = 0, y = 0, z = 0;
  const n = p.length / 3;
  for (let i = 0; i < p.length; i += 3) { x += p[i]; y += p[i + 1]; z += p[i + 2]; }
  return [x / n, y / n, z / n];
};

const transformSoup = (p: ArrayLike<number>, m: THREE.Matrix4) => {
  const out = new Float32Array(p.length);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 3) {
    v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(m);
    out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
  }
  return out;
};

/** Labio-lingual thickness (spread along `across`) of the points within `band` of the end of `along` that `sign` picks. */
function endThickness(p: ArrayLike<number>, along: THREE.Vector3, across: THREE.Vector3, sign: 1 | -1, band = 1.5) {
  let extreme = -Infinity;
  const q = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 3) extreme = Math.max(extreme, sign * q.set(p[i], p[i + 1], p[i + 2]).dot(along));
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    q.set(p[i], p[i + 1], p[i + 2]);
    if (sign * q.dot(along) < extreme - band) continue;
    const s = q.dot(across);
    lo = Math.min(lo, s); hi = Math.max(hi, s);
  }
  return hi - lo;
}

/**
 * Turns an arranged set of teeth (separate closed shells, as an arch segment - a Meshmixer part, an
 * OBJ or STL holding several teeth, or a folder of them in one shared frame) into the arch frame.
 * - Along the arch: the direction the teeth's centres spread furthest (x).
 * - Height: the direction across that in which the centres spread least (the set is nearly flat).
 * - Labial: the teeth in the middle of the set stand in front of those at its ends (front at -y).
 * - Incisal: the middle teeth are thinner labio-lingually at their incisal ends (incisal up, +z).
 * Then centred on its midline, with the middle teeth's incisal edges at z = 0.
 */
export function librarySet(name: string, shells: Float32Array[]): LibrarySet {
  if (shells.length < 2) throw new Error("A tooth set needs at least two separate teeth");
  const centres = shells.map(centroidOf);
  const mean = new THREE.Vector3();
  centres.forEach((c) => mean.add(new THREE.Vector3(...c)));
  mean.divideScalar(centres.length);
  // Spread of the centres: the largest direction is along the arch.
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const c of centres) {
    const d = [c[0] - mean.x, c[1] - mean.y, c[2] - mean.z];
    for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) cov[i][j] += d[i] * d[j];
  }
  const axes = principalAxes(cov);
  const along = axes[0].clone();
  let height = axes[2].clone();
  let labial = new THREE.Vector3().crossVectors(height, along).normalize();
  // Which teeth are in the middle: nearest the centre along the arch.
  const order = centres.map((c, i) => ({ i, s: new THREE.Vector3(...c).sub(mean).dot(along) })).sort((a, b) => a.s - b.s);
  const middle = order.slice(Math.floor((order.length - 1) / 2), Math.floor(order.length / 2) + 1).map((o) => o.i);
  const ends = [order[0].i, order[order.length - 1].i];
  const along2 = (i: number) => new THREE.Vector3(...centres[i]).sub(mean).dot(labial);
  // The middle teeth stand further forward (more labial) than the ends; front is -y, so labial points to -y.
  const midLab = middle.reduce((s, i) => s + along2(i), 0) / middle.length, endLab = ends.reduce((s, i) => s + along2(i), 0) / ends.length;
  if (midLab < endLab) labial.negate();
  // Incisal: thinner end of the middle teeth.
  let thinUp = 0;
  for (const i of middle) thinUp += endThickness(shells[i], height, labial, 1) - endThickness(shells[i], height, labial, -1);
  if (thinUp > 0) height.negate();
  // Right-handed: x along, y = -labial (front at -y), z = height.
  const yAxis = labial.clone().negate();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, height).normalize();
  height = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
  void yAxis;
  const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, height).transpose();
  let turned = shells.map((s) => transformSoup(s, basis));
  // Centre: midline between the two middle teeth (or on the middle tooth), incisal edges of the middle teeth at z = 0.
  const tc = turned.map(centroidOf);
  const mid = middle.reduce((s, i) => s + tc[i][0], 0) / middle.length;
  let top = -Infinity;
  for (const i of middle) for (let k = 2; k < turned[i].length; k += 3) top = Math.max(top, turned[i][k]);
  let front = Infinity;
  turned.forEach((s) => { for (let k = 1; k < s.length; k += 3) front = Math.min(front, s[k]); });
  const shift = new THREE.Matrix4().makeTranslation(-mid, -front, -top);
  turned = turned.map((s) => transformSoup(s, shift));
  const finalCentres = turned.map(centroidOf);
  // Kinds: counted out from the midline on each side.
  const sides = finalCentres.map((c) => (c[0] < 0 ? -1 : 1) as -1 | 1);
  const teeth: LibraryTooth[] = turned.map((positions, i) => {
    const sameSide = finalCentres.map((c, j) => ({ j, x: Math.abs(c[0]) })).filter(({ j }) => sides[j] === sides[i]).sort((a, b) => a.x - b.x);
    const rank = sameSide.findIndex(({ j }) => j === i);
    return { index: i, kind: KINDS[Math.min(KINDS.length - 1, rank)], side: sides[i], positions, centroid: finalCentres[i] };
  });
  teeth.sort((a, b) => a.centroid[0] - b.centroid[0]);
  teeth.forEach((tooth, i) => { tooth.index = i; });
  return { name, teeth };
}

/** Eigenvectors of a symmetric 3x3 matrix, largest eigenvalue first (Jacobi rotations). */
function principalAxes(a: number[][]): THREE.Vector3[] {
  const m = a.map((row) => row.slice());
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep += 1) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]] as const) {
      if (Math.abs(m[p][q]) < 1e-12) continue;
      const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k += 1) {
        const mkp = m[k][p], mkq = m[k][q];
        m[k][p] = c * mkp - s * mkq; m[k][q] = s * mkp + c * mkq;
      }
      for (let k = 0; k < 3; k += 1) {
        const mpk = m[p][k], mqk = m[q][k];
        m[p][k] = c * mpk - s * mqk; m[q][k] = s * mpk + c * mqk;
      }
      for (let k = 0; k < 3; k += 1) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return [0, 1, 2].map((i) => ({ value: m[i][i], vec: new THREE.Vector3(v[0][i], v[1][i], v[2][i]).normalize() }))
    .sort((x, y) => y.value - x.value).map((e) => e.vec);
}

// ---------------------------------------------------------------------------------------------
// Placing

/** The scan's anterior segment, measured in its arch frame (front at -y, teeth up, occlusal plane z = 0). */
export type AnteriorMeasure = {
  /** The labial surface: the frontmost y of the crowns at each x (step `step` from `x0`). */
  labial: { x0: number; step: number; y: Float64Array };
  /** The midline x: the middle of the anterior segment. */
  midline: number;
  /** Width across the anterior segment `depth` (default ANTERIOR_DEPTH) behind its front. */
  width: number;
  /** The highest crown point near the midline (the central incisors' incisal edges). */
  incisal: number;
};
/** How deep the anterior segment is measured from its front, mm: canine to canine. */
export const ANTERIOR_DEPTH = 8;

/** The labial surface and width of the crowns of `p` (a soup or vertices, in an arch frame). */
export function measureAnterior(p: ArrayLike<number>, crown = 7, step = 0.5, depth = ANTERIOR_DEPTH): AnteriorMeasure {
  let front = Infinity, minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i + 2] < -crown) continue;
    front = Math.min(front, p[i + 1]);
    minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]);
  }
  const x0 = Math.floor(minX), count = Math.ceil((maxX - x0) / step) + 1;
  const y = new Float64Array(count).fill(Infinity);
  for (let i = 0; i < p.length; i += 3) {
    if (p[i + 2] < -crown || p[i + 1] > front + ANTERIOR_DEPTH + 4) continue;
    const k = Math.round((p[i] - x0) / step);
    if (k >= 0 && k < count) y[k] = Math.min(y[k], p[i + 1]);
  }
  // Width and midline: where the crowns reach ANTERIOR_DEPTH behind the front, as canineWidth measures.
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i + 2] < -crown || Math.abs(p[i + 1] - (front + depth)) > 0.5) continue;
    lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]);
  }
  const midline = Number.isFinite(lo) ? (lo + hi) / 2 : 0;
  let incisal = -Infinity;
  for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i] - midline) < 5 && p[i + 1] < front + 4) incisal = Math.max(incisal, p[i + 2]);
  return { labial: { x0, step, y }, midline, width: Number.isFinite(lo) ? hi - lo : 0, incisal };
}


/** A library tooth placed: its move into the scan's arch frame, and the least wax over the patient's tooth's facial surface it leaves (mm; null when it is nowhere near the scan). */
export type PlacedTooth = {
  tooth: LibraryTooth;
  matrix: THREE.Matrix4;
  clearance: number | null;
  /** Its width along the arch and its length, edge to cervical end, as designed (mm). */
  width: number;
  length: number;
  /** How far the gingival plan lies apical to the patient's margin there: the crown lengthening the design asks for (mm; 0 = none). */
  lengthening: number;
  /** The tooth's own frame: the middle of its incisal edge, and unit directions outward, towards the midline and towards the edge. */
  frame: ToothFrame;
  /** The tooth as finished (contacts closed, cervical part blended), in the scan's arch frame. */
  positions: Float32Array;
  /** How far its edge reaches past the patient's own (mm; negative: the patient's edge is longer, and would need reducing). */
  extension: number;
};
export type ToothFrame = { origin: Vec3; out: Vec3; mesial: Vec3; up: Vec3 };
type Vec3 = [number, number, number];
/**
 * The three points a wax-up is set out from, on the scan in its arch frame: the midline (the contact
 * of the central incisors at their incisal edges) and the two canine tips, either order (they are
 * taken in the order of x in the arch frame). The dentist marks them; estimateLandmarks makes a first guess.
 */
export type WaxLandmarks = { midline: Vec3; canines: [Vec3, Vec3] };
export type WaxupOptions = {
  /** The least wax over the labial surface of the patient's tooth, mm. */
  minWax?: number;
  /** Where the set goes; estimated when left out. */
  landmarks?: WaxLandmarks | null;
  /** Fit each tooth's cervical end to the gingival plan and the patient's margin (default on). */
  fitHeight?: boolean;
  /** The central incisor's width over length the gingival plan aims for (default CENTRAL_RATIO). */
  centralRatio?: number;
  /** How far the canine tips stand above the centrals' edges, mm; null or left out = the patient's own step, when in range. */
  arcDepth?: number | null;
  /** The widths of the laterals and canines against the central: natural averages (Magne 2003) or the library's own. */
  proportions?: "natural" | "library";
  /** Close the contacts between neighbours and blend each tooth's cervical part onto the patient's (default on). */
  blend?: boolean;
  /** Make the teeth this much longer than the patient's (mm at the incisal edge); 0 keeps the edge where it is. */
  lengthen?: number;
};
/** Wax over the labial surface the library teeth keep by default, mm. */
export const MIN_WAX = 0.3;

/**
 * The wax-up frame from the landmarks, as a move from the arch frame: x from the first canine tip to
 * the second in plan, the midline at x = y = 0, front at -y; heights unchanged. Arches are seldom
 * symmetric about the scanner's frame; this sets the teeth out about the patient's own midline.
 */
export function landmarkFrame(l: WaxLandmarks): THREE.Matrix4 {
  const ex = new THREE.Vector3(l.canines[1][0] - l.canines[0][0], l.canines[1][1] - l.canines[0][1], 0).normalize();
  const ez = new THREE.Vector3(0, 0, 1);
  const ey = new THREE.Vector3().crossVectors(ez, ex);
  const turn = new THREE.Matrix4().makeBasis(ex, ey, ez).transpose();
  return turn.multiply(new THREE.Matrix4().makeTranslation(-l.midline[0], -l.midline[1], 0));
}

/** A first guess at the landmarks: the front of the arch for the midline, estimateCanines for the canines. */
export function estimateLandmarks(scan: ArrayLike<number>): WaxLandmarks | null {
  const canines = estimateCanines(scan);
  if (!canines) return null;
  const target = measureAnterior(scan);
  let front = Infinity;
  for (const y of target.labial.y) front = Math.min(front, y);
  return { midline: [target.midline, front, target.incisal], canines };
}

/** The highest crown point within 3 mm of x at the front of the arch: the incisal edge there. */
function incisalAt(p: ArrayLike<number>, x: number, front: number) {
  let top = -Infinity;
  for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i] - x) < 3 && p[i + 1] < front + 4) top = Math.max(top, p[i + 2]);
  return top;
}

/**
 * Places a library set on the scan's anterior segment (`scan`: the scan in its arch frame, with its
 * outward vertex `normals`), in the frame of the landmarks, in the order a smile is designed
 * (facially generated planning: Spear; Digital Smile Design: Coachman et al. 2017):
 * 1. The incisal edges: the centrals' at the patient's (plus `lengthen`), the laterals' LATERAL_STEP
 *    short of them, the canine tips `arcDepth` above them - the smile arc.
 * 2. The widths: the central's from the space between the midline and the canine tips, the others
 *    as a share of it (`proportions`); each side's spacing stretched to meet its own canine tip.
 * 3. The gingival plan: the central's length from its width and `centralRatio`, the canines' zenith
 *    level with it and the laterals' LATERAL_ZENITH coronal (Chu et al. 2009). Where the patient's
 *    margin lies coronal to the plan the design asks for crown lengthening (reported, `lengthening`);
 *    where it lies apical, the tooth runs down to it, so no tooth shows below the wax.
 * 4. Then each tooth on its own, straight out from the arch: until the incisal part of its facial
 *    surface stands `minWax` proud of the patient's tooth at the closest point - so the wax covers
 *    the tooth there and never cuts into it, and adds no more than it must.
 * Each tooth is turned to face out from the patient's arch where it stands. Returns each tooth with
 * its move (set frame to the scan's arch frame) and what was designed.
 */
export function placeSet(set: LibrarySet, scan: Mesh, normals: ArrayLike<number>, options: WaxupOptions = {}): { placed: PlacedTooth[]; scale: number; landmarks: WaxLandmarks | null; arcDepth: number; centralWidth: number } {
  const minWax = options.minWax ?? MIN_WAX;
  let landmarks = options.landmarks === undefined ? estimateLandmarks(scan.v) : options.landmarks;
  // Work in the landmarks' frame.
  if (landmarks && landmarks.canines[0][0] > landmarks.canines[1][0]) landmarks = { ...landmarks, canines: [landmarks.canines[1], landmarks.canines[0]] };
  const frame = landmarks ? landmarkFrame(landmarks) : new THREE.Matrix4();
  const back = frame.clone().invert();
  const v = transformSoup(scan.v, frame);
  const turnOnly = new THREE.Matrix3().setFromMatrix4(frame);
  const n = new Float32Array(normals.length);
  const q = new THREE.Vector3();
  for (let i = 0; i < n.length; i += 3) {
    q.set(normals[i], normals[i + 1], normals[i + 2]).applyMatrix3(turnOnly);
    n[i] = q.x; n[i + 1] = q.y; n[i + 2] = q.z;
  }
  const mesh: Mesh = { v: Array.from(v), f: scan.f };
  const tips = landmarks?.canines.map((tip) => new THREE.Vector3(...tip).applyMatrix4(frame));
  const target = measureAnterior(v);
  let front = Infinity;
  for (const y of target.labial.y) front = Math.min(front, y);
  if (!Number.isFinite(front)) front = 0;
  const midline = landmarks ? 0 : target.midline;
  const incisal = incisalAt(v, midline, front);
  const all = new Float32Array(set.teeth.reduce((count, t) => count + t.positions.length, 0));
  let offset = 0;
  for (const tooth of set.teeth) { all.set(tooth.positions, offset); offset += tooth.positions.length; }
  const own = measureAnterior(all);
  const ownFront = 0;
  // A first scale, for the set's curve centre: the set as wide as the scan ANTERIOR_DEPTH behind the front.
  let scale = own.width > 0 && target.width > 0 ? target.width / own.width : 1;
  const patient = archCurve(v, midline, front + CURVE_CENTRE, incisal);
  const setCurve = archCurve(all, own.midline, ownFront + CURVE_CENTRE / scale, 0);
  const lift = incisal + (options.lengthen ?? 0);
  const grid = new PointGrid(mesh.v, PLACE_REACH);
  // Each library tooth where it stands on its set's curve: the curve point and direction there, and
  // its width along the arch and its top and bottom.
  const library = set.teeth.map((tooth) => {
    const along = curveNearest(setCurve, tooth.centroid[0], tooth.centroid[1]);
    const normal = along.point ? along.normal : -Math.PI / 2;
    const tx = -Math.sin(normal), ty = Math.cos(normal);
    const at = along.point ?? [tooth.centroid[0], tooth.centroid[1]];
    let lo = Infinity, hi = -Infinity, top = -Infinity, bottom = Infinity;
    for (let i = 0; i < tooth.positions.length; i += 3) {
      const t = (tooth.positions[i] - at[0]) * tx + (tooth.positions[i + 1] - at[1]) * ty;
      lo = Math.min(lo, t); hi = Math.max(hi, t);
      top = Math.max(top, tooth.positions[i + 2]); bottom = Math.min(bottom, tooth.positions[i + 2]);
    }
    // The tooth's middle across its width, on the line along the arch through the curve point.
    const middle: [number, number] = [at[0] + tx * (lo + hi) / 2, at[1] + ty * (lo + hi) / 2];
    return { tooth, normal, middle, width: hi - lo, top, bottom };
  });
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const libWidth = (kind: ToothKind) => mean(library.filter((entry) => entry.tooth.kind === kind).map((entry) => entry.width));
  // Widths: the central's, and the others as a share of it (the chosen proportions).
  const ratios: Record<ToothKind, number> = { ...NATURAL_WIDTHS };
  if (options.proportions === "library") for (const kind of KINDS) if (libWidth(kind) > 0 && libWidth("central") > 0) ratios[kind] = libWidth(kind) / libWidth("central");
  const kinds = KINDS.filter((kind) => set.teeth.some((tooth) => tooth.kind === kind));
  // Arch length from the midline to the middle of the last tooth, in central widths.
  const toLast = kinds.reduce((sum, kind, i) => sum + ratios[kind] * (i === kinds.length - 1 ? 0.5 : 1), 0);
  // The space: along the patient's arch, midline to each canine tip (the last tooth's middle).
  const contacts = insetCurve(patient, CONTACT_INSET);
  const space = tips ? tips.map((tip) => Math.abs(curveNearest(contacts, tip.x, tip.y).length)) : null;
  const usable = space && space.every((length) => length > 5) ? space : null;
  let central = usable ? mean(usable) / toLast : libWidth("central") * scale;
  if (!(central > 0)) central = 8.5;
  scale = libWidth("central") > 0 ? central / libWidth("central") : 1;
  const stretch = usable ? usable.map((length) => length / (central * toLast)) : [1, 1];
  // Heights: the edges (the smile arc), then the gingival plan from the central's width/length.
  const canineStep = (() => {
    if (options.arcDepth !== undefined && options.arcDepth !== null) return options.arcDepth;
    const own = tips ? lift - (options.lengthen ?? 0) - mean(tips.map((tip) => tip.z)) : NaN;
    return own >= ARC_DEPTH_RANGE[0] && own <= ARC_DEPTH_RANGE[1] ? own : ARC_DEPTH_DEFAULT;
  })();
  const edgeOf = (kind: ToothKind) => lift - (kind === "central" ? 0 : kind === "lateral" ? LATERAL_STEP : kind === "canine" ? canineStep : canineStep + LATERAL_STEP);
  const centralRatio = options.centralRatio ?? CENTRAL_RATIO;
  const zenith = lift - central / centralRatio;
  const cervicalOf = (kind: ToothKind) => zenith + (kind === "lateral" ? LATERAL_ZENITH : 0);
  const placed: PlacedTooth[] = [];
  for (const entry of library) {
    const { tooth } = entry;
    const side = tooth.side < 0 ? 0 : 1;
    // The tooth's middle along the patient's arch.
    let before = 0;
    for (const kind of kinds) { if (kind === tooth.kind) break; before += ratios[kind]; }
    const width = central * ratios[tooth.kind];
    const along = curveAtLength(contacts, tooth.side * (before * central + width / 2) * stretch[side]);
    const there = along.point ? curveSample(patient, along.k) : along;
    const at: [number, number] = there.point ?? [midline + tooth.side * (before * central + width / 2), front];
    const out = there.point ? new THREE.Vector3(Math.cos(there.normal), Math.sin(there.normal), 0) : new THREE.Vector3(0, -1, 0);
    const turn = there.point ? there.normal - entry.normal : 0;
    const plan = entry.width > 0 ? width / entry.width : scale;
    // Height: the edge where the smile arc puts it; the cervical end at the gingival plan, or at the
    // patient's own margin where the plan would leave tooth showing below the wax.
    const edge = edgeOf(tooth.kind);
    let cervical = cervicalOf(tooth.kind);
    let lengthening = 0;
    if (options.fitHeight !== false && there.point) {
      const trial = new THREE.Matrix4().makeTranslation(at[0], at[1], edge).multiply(new THREE.Matrix4().makeRotationZ(turn)).multiply(new THREE.Matrix4().makeScale(plan, plan, 1)).multiply(new THREE.Matrix4().makeTranslation(-entry.middle[0], -entry.middle[1], -entry.top));
      const margin = marginUnder(transformSoup(tooth.positions, trial), v, at, out, edge);
      if (margin !== null) {
        if (margin > cervical + LENGTHENING_SHOWN) lengthening = margin - cervical;
        else if (margin < cervical) cervical = margin;
      }
    }
    const k = (edge - cervical) / Math.max(1, entry.top - entry.bottom);
    const base = new THREE.Matrix4().makeTranslation(at[0], at[1], edge)
      .multiply(new THREE.Matrix4().makeRotationZ(turn))
      .multiply(new THREE.Matrix4().makeScale(plan, plan, k))
      .multiply(new THREE.Matrix4().makeTranslation(-entry.middle[0], -entry.middle[1], -entry.top));
    const { samples } = facialSamples(transformSoup(tooth.positions, base));
    let shift = 0, clearance: number | null = null;
    for (let round = 0; round < 8; round += 1) {
      const least = leastClearance(samples, out.clone().multiplyScalar(shift), mesh, n, grid);
      clearance = least;
      if (least === null) break;
      const move = minWax - least;
      if (Math.abs(move) < 0.01) break;
      shift = Math.max(-PLACE_REACH, Math.min(PLACE_REACH, shift + move));
    }
    const matrix = back.clone().multiply(new THREE.Matrix4().makeTranslation(out.x * shift, out.y * shift, 0)).multiply(base);
    // The tooth's own frame, for adjusting it later: the middle of its incisal edge, outward, towards
    // the midline (mesial) and up (towards the edge), in the scan's arch frame.
    const mesialSign = tooth.side < 0 ? 1 : -1;
    const toArch = (v: THREE.Vector3, point: boolean) => (point ? v.applyMatrix4(back) : v.transformDirection(back));
    const frameOut = {
      origin: toArch(new THREE.Vector3(at[0] + out.x * shift, at[1] + out.y * shift, edge), true).toArray() as Vec3,
      out: toArch(out.clone(), false).toArray() as Vec3,
      mesial: toArch(new THREE.Vector3(-out.y * mesialSign, out.x * mesialSign, 0), false).toArray() as Vec3,
      up: toArch(new THREE.Vector3(0, 0, 1), false).toArray() as Vec3,
    };
    // The patient's own edge under this tooth: how far the design reaches past it (lengthening, in
    // composite unsupported by tooth) or stops short of it (the patient's tooth would show: reduction).
    let patientEdge = -Infinity;
    for (let i = 0; i < v.length; i += 3) {
      const dx = v[i] - at[0], dy = v[i + 1] - at[1];
      if (Math.abs(dx * -out.y + dy * out.x) > width * 0.3 || dx * out.x + dy * out.y < -6) continue;
      patientEdge = Math.max(patientEdge, v[i + 2]);
    }
    placed.push({ tooth, matrix, positions: transformSoup(tooth.positions, back.clone().multiply(new THREE.Matrix4().makeTranslation(out.x * shift, out.y * shift, 0)).multiply(base)), clearance, width, length: edge - cervical, lengthening, extension: Number.isFinite(patientEdge) ? edge - patientEdge : 0, frame: frameOut });
  }
  // Finishing, so the wax-up blends rather than sits on the teeth: neighbours meet at their
  // contacts, and each tooth's cervical part runs out onto the patient's tooth and gum.
  if (options.blend !== false) {
    closeContacts(placed);
    for (const entry of placed) drapeCervical(entry, scan, normals);
  }
  return { placed, scale, landmarks, arcDepth: canineStep, centralWidth: central };
}

/**
 * Build 79: GC's injection moulding technique (EXACLEAR index). Composite past the patient's own
 * edge is unsupported; the technique guide keeps it within IMT_UNSUPPORTED mm. Where the patient's
 * edge stands past the design by more than IMT_REDUCE mm the work is no longer additive: the tooth
 * would need reducing there.
 */
export const IMT_UNSUPPORTED = 0.5;
export const IMT_REDUCE = 0.2;
/**
 * Build 79: the teeth injected first when alternate teeth are moulded (GC's sequence: 14, 12, 21, 23
 * first, then the rest): on the patient's right even teeth, on the left odd ones.
 */
export function imtFirstInjection(fdi: number) {
  const quadrant = Math.floor(fdi / 10), unit = fdi % 10;
  return quadrant === 1 || quadrant === 4 ? unit % 2 === 0 : unit % 2 === 1;
}

/**
 * Build 79: mean crown widths of unworn maxillary teeth, as a share of the central incisor's
 * (Magne, Gallucci & Belser 2003: central 9.17, lateral 7.23, canine 7.98 mm; premolar 7.84).
 */
export const NATURAL_WIDTHS: Record<ToothKind, number> = { central: 1, lateral: 0.79, canine: 0.87, premolar1: 0.85, premolar2: 0.85, molar1: 1.1, molar2: 1.0, molar3: 0.95 };
/** The central incisor's width over its length the gingival plan aims for (Digital Smile Design: about 80%, within 70-90%). */
export const CENTRAL_RATIO = 0.8;
export const CENTRAL_RATIO_RANGE = [0.7, 0.9] as const;
/** The lateral incisors' edges stand this far short of the centrals', mm. */
export const LATERAL_STEP = 0.5;
/** The laterals' gingival zenith stands this far coronal to the line joining the centrals' and canines' (Chu et al. 2009), mm. */
export const LATERAL_ZENITH = 1;
/** The canine tips stand this far above the centrals' edges unless the patient's own step lies in the range (a smile arc parallel to the lower lip: Sarver 2001; 1-2 mm as commonly taught), mm. */
export const ARC_DEPTH_DEFAULT = 1;
export const ARC_DEPTH_RANGE = [0.5, 2] as const;
/** A gingival plan this far (or more) apical to the patient's margin is reported as crown lengthening, mm. */
export const LENGTHENING_SHOWN = 0.5;

/** The patient's gingival margin under a placed tooth: the lowest margin found across its width (the gum scallops; the lowest point is the zenith). */
function marginUnder(p: Float32Array, v: ArrayLike<number>, at: [number, number], out: THREE.Vector3, edge: number): number | null {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const t = (p[i] - at[0]) * -out.y + (p[i + 1] - at[1]) * out.x;
    lo = Math.min(lo, t); hi = Math.max(hi, t);
  }
  let margin: number | null = null;
  for (const share of [-0.3, -0.15, 0, 0.15, 0.3]) {
    const t = (lo + hi) / 2 + share * (hi - lo);
    const found = gingivalMargin(v, [at[0] - out.y * t, at[1] + out.x * t], out, edge);
    if (found !== null && (margin === null || found < margin)) margin = found;
  }
  return margin;
}
/** The least clearance of a placed tooth's facial surface (its incisal part) over the scan, mm; null when it is nowhere near the scan. */
export function facialClearance(positions: Float32Array, scan: Mesh, normals: ArrayLike<number>): number | null {
  const { samples } = facialSamples(positions);
  return leastClearance(samples, new THREE.Vector3(), scan, normals, new PointGrid(scan.v, PLACE_REACH));
}
/** How far behind the front the arch curves' centres stand, mm (an anterior segment's radius). */
const CURVE_CENTRE = 18;
/** The angular step of an arch curve, radians. */
const CURVE_STEP = (2 * Math.PI) / 180;

/**
 * The labial arch curve of crowns `p` in an arch frame: the furthest crown point from `centre` in
 * each direction (front = -y), angle 0 straight ahead, positive towards +x. Smoothed; with the
 * arc length from angle 0 (signed) at each step.
 */
type ArchCurve = { centre: [number, number]; angle0: number; radius: Float64Array; length: Float64Array };
function archCurve(p: ArrayLike<number>, cx: number, cy: number, incisal: number): ArchCurve {
  const bins = Math.round(Math.PI / CURVE_STEP) + 1; // -90..90 degrees
  const angle0 = -Math.PI / 2;
  const raw = new Float64Array(bins).fill(NaN);
  for (let i = 0; i < p.length; i += 3) {
    const z = p[i + 2];
    if (z < incisal - CURVE_BAND || z > incisal + 1) continue;
    const dx = p[i] - cx, dy = p[i + 1] - cy;
    const a = Math.atan2(dx, -dy);
    const k = Math.round((a - angle0) / CURVE_STEP);
    if (k < 0 || k >= bins) continue;
    const r = Math.hypot(dx, dy);
    if (!(raw[k] >= r)) raw[k] = r;
  }
  const radius = new Float64Array(bins).fill(NaN);
  for (let k = 0; k < bins; k += 1) {
    let sum = 0, n = 0;
    for (let j = k - CURVE_SMOOTH; j <= k + CURVE_SMOOTH; j += 1) if (j >= 0 && j < bins && Number.isFinite(raw[j])) { sum += raw[j]; n += 1; }
    if (Number.isFinite(raw[k]) && n) radius[k] = sum / n;
  }
  return withLengths({ centre: [cx, cy], angle0, radius, length: new Float64Array(bins) });
}
/** The curve's arc length from straight ahead (angle 0), signed, at each step. */
function withLengths(c: ArchCurve): ArchCurve {
  const length = new Float64Array(c.radius.length).fill(NaN);
  const mid = Math.round(-c.angle0 / CURVE_STEP);
  if (Number.isFinite(c.radius[mid])) {
    length[mid] = 0;
    for (const dir of [1, -1]) {
      for (let k = mid + dir; k >= 0 && k < c.radius.length; k += dir) {
        if (!Number.isFinite(c.radius[k]) || !Number.isFinite(length[k - dir])) break;
        const [ax, ay] = curvePoint(c, k - dir), [bx, by] = curvePoint(c, k);
        length[k] = length[k - dir] + dir * Math.hypot(bx - ax, by - ay);
      }
    }
  }
  return { ...c, length };
}
/**
 * The curve `inset` mm inside another, along the same directions: the line the teeth's contacts run
 * along. Tooth widths are measured contact to contact, and the labial surface runs further out, so
 * widths laid along the labial curve itself would come out too wide on a curved arch.
 */
function insetCurve(c: ArchCurve, inset: number): ArchCurve {
  return withLengths({ ...c, radius: c.radius.map((r) => r - inset) });
}
/** How far inside the labial curve the contacts between the front teeth run, mm. */
const CONTACT_INSET = 0.75;
/** Steps either side the curve's radius is smoothed over, and its tangent taken across. */
const CURVE_SMOOTH = 3;
const CURVE_TANGENT = 4;
/** The height of the band of crown below the incisal edges that the arch curves are traced in, mm. */
const CURVE_BAND = 5;

const curvePoint = (c: ArchCurve, k: number): [number, number] => {
  const a = c.angle0 + k * CURVE_STEP;
  return [c.centre[0] + c.radius[k] * Math.sin(a), c.centre[1] - c.radius[k] * Math.cos(a)];
};
/** The curve's point, outward normal angle (radians, atan2 y/x) and arc length at fractional step k. */
function curveSample(c: ArchCurve, k: number) {
  const last = c.radius.length - 1;
  const i = Math.max(0, Math.min(last, Math.round(k)));
  if (!Number.isFinite(c.radius[i]) || !Number.isFinite(c.length[i])) return { point: null, normal: 0, length: 0, k };
  // The tangent over a few steps either side (as far as the curve goes): embrasures make it ragged.
  let lo = i, hi = i;
  while (lo > 0 && i - lo < CURVE_TANGENT && Number.isFinite(c.length[lo - 1])) lo -= 1;
  while (hi < last && hi - i < CURVE_TANGENT && Number.isFinite(c.length[hi + 1])) hi += 1;
  if (hi === lo) return { point: null, normal: 0, length: 0, k };
  const [ax, ay] = curvePoint(c, lo), [bx, by] = curvePoint(c, hi);
  // Tangent runs towards +x along the front; outward is to its right in plan (front = -y).
  const tx = bx - ax, ty = by - ay;
  const normal = Math.atan2(-tx, ty);
  const t = k - Math.floor(k), k0 = Math.floor(k);
  const lerp = (u: number, v: number) => u + (v - u) * t;
  const p0 = curvePoint(c, k0), p1 = curvePoint(c, Math.min(c.radius.length - 1, k0 + 1));
  const point: [number, number] = Number.isFinite(p1[0]) ? [lerp(p0[0], p1[0]), lerp(p0[1], p1[1])] : p0;
  const length = Number.isFinite(c.length[k0 + 1]) ? lerp(c.length[k0], c.length[k0 + 1]) : c.length[k0];
  return { point, normal, length, k };
}
/** The curve at its point nearest (x, y) in plan: where a tooth or tip stands along it. */
function curveNearest(c: ArchCurve, x: number, y: number) {
  let best = -1, dist = Infinity;
  for (let k = 0; k < c.radius.length; k += 1) {
    if (!Number.isFinite(c.radius[k]) || !Number.isFinite(c.length[k])) continue;
    const [px, py] = curvePoint(c, k);
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < dist) { dist = d; best = k; }
  }
  if (best < 0) return { point: null, normal: 0, length: 0, k: 0 };
  // Refine between the neighbouring steps.
  let k = best;
  if (best > 0 && best + 1 < c.radius.length && Number.isFinite(c.radius[best - 1]) && Number.isFinite(c.radius[best + 1])) {
    const [ax, ay] = curvePoint(c, best - 1), [bx, by] = curvePoint(c, best + 1);
    const tx = bx - ax, ty = by - ay, [px, py] = curvePoint(c, best);
    const t = ((x - px) * tx + (y - py) * ty) / (tx * tx + ty * ty);
    k = best + Math.max(-1, Math.min(1, 2 * t));
  }
  return curveSample(c, k);
}
/** The curve where its arc length from the front is `length`. */
function curveAtLength(c: ArchCurve, length: number) {
  for (let k = 0; k + 1 < c.length.length; k += 1) {
    const a = c.length[k], b = c.length[k + 1];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if ((length - a) * (length - b) <= 0) return curveSample(c, k + (b === a ? 0 : (length - a) / (b - a)));
  }
  return { point: null, normal: 0, length: 0, k: 0 };
}

/**
 * A first guess at the patient's canine tips, in the arch frame: on each side, the highest crown
 * point near the labial curve between CANINE_ANGLES about the curve's centre. The canine is
 * usually the longest tooth at the corner of the arch; the user moves the marks where it is not.
 */
export function estimateCanines(scan: ArrayLike<number>): [[number, number, number], [number, number, number]] | null {
  const target = measureAnterior(scan);
  let front = Infinity;
  for (const y of target.labial.y) front = Math.min(front, y);
  if (!Number.isFinite(front)) return null;
  const curve = archCurve(scan, target.midline, front + CURVE_CENTRE, target.incisal);
  const best: Array<[number, number, number] | null> = [null, null];
  for (let i = 0; i < scan.length; i += 3) {
    const z = scan[i + 2];
    if (z < target.incisal - 4) continue;
    const dx = scan[i] - curve.centre[0], dy = scan[i + 1] - curve.centre[1];
    const a = Math.atan2(dx, -dy);
    const deg = Math.abs(a) * 180 / Math.PI;
    if (deg < CANINE_ANGLES[0] || deg > CANINE_ANGLES[1]) continue;
    const k = Math.round((a - curve.angle0) / CURVE_STEP);
    if (!(Math.hypot(dx, dy) > curve.radius[k] - CANINE_INSIDE)) continue;
    const arc = Math.abs(curve.length[k]);
    if (!(arc >= CANINE_ARC[0] && arc <= CANINE_ARC[1])) continue;
    const side = a < 0 ? 0 : 1;
    if (!best[side] || z > best[side]![2]) best[side] = [scan[i], scan[i + 1], z];
  }
  return best[0] && best[1] ? [best[0], best[1]] : null;
}
/** Where canine tips are looked for: degrees either side of straight ahead, about the arch curve's centre. */
const CANINE_ANGLES = [25, 80] as const;
/** How far along the labial curve from the midline a canine tip may be, mm (central, lateral and half a canine: about 19). */
const CANINE_ARC = [14, 25] as const;
/** How far inside the labial curve a canine tip may be, mm. */
const CANINE_INSIDE = 4;

/** The least depth of the crease at the gingival margin, mm. */
const MARGIN_NOTCH = 0.1;

/**
 * The patient's gingival margin on the facial surface at `at` (plan, on the labial curve; `out` its
 * outward direction): down a strip 2 mm wide, the frontmost surface at each height has a crease
 * where crown meets gum. The deepest crease (at least MARGIN_NOTCH, measured over 2 mm either side)
 * between 5 and 12 mm below the incisal edge (searched 3 to 14 mm, 2 mm either side).
 */
function gingivalMargin(v: ArrayLike<number>, at: [number, number], out: THREE.Vector3, incisal: number): number | null {
  const step = 0.25, top = incisal - 3, low = incisal - 14;
  const count = Math.round((top - low) / step) + 1;
  const front = new Float64Array(count).fill(-Infinity);
  const tx = -out.y, ty = out.x;
  for (let i = 0; i < v.length; i += 3) {
    const z = v[i + 2];
    if (z > top || z < low) continue;
    const dx = v[i] - at[0], dy = v[i + 1] - at[1];
    if (Math.abs(dx * tx + dy * ty) > 1) continue;
    const f = dx * out.x + dy * out.y;
    if (f < -6) continue;
    const k = Math.round((z - low) / step);
    if (f > front[k]) front[k] = f;
  }
  // How far the surface stands back from the higher of its lowest neighbours either side, at each height.
  const w = Math.round(2 / step);
  const depth = new Float64Array(count).fill(-Infinity);
  for (let k = w; k + w < count; k += 1) {
    if (!Number.isFinite(front[k])) continue;
    let below = -Infinity, above = -Infinity;
    for (let j = k - w; j < k; j += 1) below = Math.max(below, front[j]);
    for (let j = k + 1; j <= k + w; j += 1) above = Math.max(above, front[j]);
    depth[k] = Math.min(below, above) - front[k];
  }
  // The most cervical crease (the margin; creases nearer the edge are the crown's own lobes).
  let best = -1;
  for (let k = w; k + w < count; k += 1) {
    if (!(depth[k] >= MARGIN_NOTCH) || depth[k] < depth[k - 1] || depth[k] < depth[k + 1]) continue;
    best = k;
    break;
  }
  if (best < 0) return null;
  return low + best * step;
}

/** How far a library tooth may move to meet the patient's, mm. */
const PLACE_REACH = 5;
/** The share of a tooth's height, from its incisal edge, whose facial surface must clear the patient's tooth. */
const FACIAL_SHARE = 0.6;

/** A placed tooth's facial direction (level, outward) and the centres of the triangles of the incisal part of its facial surface. */
function facialSamples(p: Float32Array) {
  const facial = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  let top = -Infinity, bottom = Infinity;
  for (let i = 2; i < p.length; i += 3) { top = Math.max(top, p[i]); bottom = Math.min(bottom, p[i]); }
  const normals: number[] = [];
  for (let t = 0; t < p.length; t += 9) {
    a.fromArray(p, t); b.fromArray(p, t + 3); c.fromArray(p, t + 6);
    n.subVectors(b, a).cross(c.clone().sub(a)); // length = twice the area
    normals.push(n.x, n.y, n.z);
    if (n.y < 0) facial.add(new THREE.Vector3(n.x, n.y, 0));
  }
  facial.setZ(0).normalize();
  if (facial.lengthSq() === 0) facial.set(0, -1, 0);
  const floor = top - FACIAL_SHARE * (top - bottom);
  const samples: number[] = [];
  for (let t = 0, k = 0; t < p.length; t += 9, k += 3) {
    n.set(normals[k], normals[k + 1], normals[k + 2]).normalize();
    if (n.dot(facial) < 0.5) continue;
    const x = (p[t] + p[t + 3] + p[t + 6]) / 3, y = (p[t + 1] + p[t + 4] + p[t + 7]) / 3, z = (p[t + 2] + p[t + 5] + p[t + 8]) / 3;
    if (z < floor) continue;
    samples.push(x, y, z);
  }
  return { facial, samples };
}

/** The least signed clearance of `samples` (moved by `by`) over the scan; null where none comes near it. */
function leastClearance(samples: number[], by: THREE.Vector3, scan: Mesh, normals: ArrayLike<number>, grid: PointGrid): number | null {
  let least: number | null = null;
  for (let i = 0; i < samples.length; i += 3) {
    const x = samples[i] + by.x, y = samples[i + 1] + by.y, z = samples[i + 2] + by.z;
    const hit = grid.nearest(x, y, z);
    if (!hit) continue;
    const q = hit[0] * 3;
    const side = (x - scan.v[q]) * normals[q] + (y - scan.v[q + 1]) * normals[q + 1] + (z - scan.v[q + 2]) * normals[q + 2];
    const d = side < 0 ? -hit[1] : hit[1];
    if (least === null || d < least) least = d;
  }
  return least;
}

// ---------------------------------------------------------------------------------------------
// The addition map

/**
 * How far each corner of a wax tooth (`positions`, placed) stands proud of the scan, mm: its
 * distance to the nearest scan point, signed negative where it lies inside the patient's tooth
 * (`normals`: the scan's vertex normals, outward). Corners further than `reach` read `reach`.
 */
export function waxThickness(positions: ArrayLike<number>, scan: Mesh, normals: ArrayLike<number>, reach = 3): Float32Array {
  const grid = new PointGrid(scan.v, reach);
  const out = new Float32Array(positions.length / 3);
  for (let i = 0; i < out.length; i += 1) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const hit = grid.nearest(x, y, z);
    if (!hit || hit[1] > reach) { out[i] = reach; continue; }
    const q = hit[0] * 3;
    const side = (x - scan.v[q]) * normals[q] + (y - scan.v[q + 1]) * normals[q + 1] + (z - scan.v[q + 2]) * normals[q + 2];
    out[i] = side < 0 ? -hit[1] : hit[1];
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Inside the wax

/** The plan cell the triangles of insideOf are filed by, mm. */
const INSIDE_CELL = 0.5;

/**
 * A test for points inside a closed shell (`positions`, a soup): a ray straight up from the point
 * crosses the surface an odd number of times. Triangles are filed by plan cell, so each test looks
 * at a handful. Used to tell the scan's crown points the wax covers (meant) from points a model lost.
 */
export function insideOf(positions: ArrayLike<number>): (x: number, y: number, z: number) => boolean {
  const cells = new Map<number, number[]>();
  const key = (i: number, j: number) => i * 1_000_003 + j;
  for (let t = 0; t < positions.length; t += 9) {
    const i0 = Math.floor(Math.min(positions[t], positions[t + 3], positions[t + 6]) / INSIDE_CELL);
    const i1 = Math.floor(Math.max(positions[t], positions[t + 3], positions[t + 6]) / INSIDE_CELL);
    const j0 = Math.floor(Math.min(positions[t + 1], positions[t + 4], positions[t + 7]) / INSIDE_CELL);
    const j1 = Math.floor(Math.max(positions[t + 1], positions[t + 4], positions[t + 7]) / INSIDE_CELL);
    for (let i = i0; i <= i1; i += 1) for (let j = j0; j <= j1; j += 1) {
      const k = key(i, j);
      let list = cells.get(k);
      if (!list) cells.set(k, (list = []));
      list.push(t);
    }
  }
  return (px, py, pz) => {
    const list = cells.get(key(Math.floor(px / INSIDE_CELL), Math.floor(py / INSIDE_CELL)));
    if (!list) return false;
    // A hair off the point, so the ray never runs exactly through an edge.
    const x = px + 1.3e-7, y = py + 0.7e-7;
    let above = 0;
    for (const t of list) {
      const ax = positions[t], ay = positions[t + 1], bx = positions[t + 3], by = positions[t + 4], cx = positions[t + 6], cy = positions[t + 7];
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(area) < 1e-14) continue;
      const u = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / area;
      const v = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) / area;
      const w = 1 - u - v;
      if (u < 0 || v < 0 || w < 0) continue;
      if (u * positions[t + 2] + v * positions[t + 5] + w * positions[t + 8] > pz) above += 1;
    }
    return above % 2 === 1;
  };
}

// ---------------------------------------------------------------------------------------------
// The whole job

/** A wax-up worked out on a scan: each tooth's shell where it goes, in the scan's own coordinates. */
export type WaxupPlan = {
  /** The landmarks used (given or estimated), in the scan's coordinates; null when none could be found. */
  landmarks: WaxLandmarks | null;
  scale: number;
  /** The smile arc used: canine tips above the centrals' edges, mm. */
  arcDepth: number;
  centralWidth: number;
  teeth: Array<{ kind: ToothKind; side: -1 | 1; positions: Float32Array; clearance: number | null; width: number; length: number; lengthening: number; extension: number; frame: ToothFrame }>;
};

/** A scan in its arch frame (teeth up, front at -y), with outward vertex normals and the move into it. */
export function scanInArchFrame(scan: ArrayLike<number>) {
  const clean = cleanScan(scan);
  const frame = archFrame(clean.mesh, marginUp(clean.mesh, clean.margin));
  const v = transformSoup(clean.mesh.v, frame);
  const mesh: Mesh = { v: Array.from(v), f: clean.mesh.f };
  const normals = vertexNormals(mesh);
  // Outward faces point away from the tissue: with the teeth up, on the whole up. Some exports run the other way.
  if (upwardness(mesh) < 0) for (let i = 0; i < normals.length; i += 1) normals[i] = -normals[i];
  return { mesh, normals, frame };
}

const moveLandmarks = (l: WaxLandmarks, m: THREE.Matrix4): WaxLandmarks => {
  const at = (p: Vec3): Vec3 => new THREE.Vector3(...p).applyMatrix4(m).toArray() as Vec3;
  return { midline: at(l.midline), canines: [at(l.canines[0]), at(l.canines[1])] };
};

/**
 * The first guess at the landmarks on a scan (a soup in its own coordinates), in those coordinates.
 * The canines come in the order of x in the arch frame.
 */
export function guessLandmarks(scan: ArrayLike<number>): WaxLandmarks | null {
  const { mesh, frame } = scanInArchFrame(scan);
  const found = estimateLandmarks(mesh.v);
  return found ? moveLandmarks(found, frame.clone().invert()) : null;
}

/**
 * The wax-up of a tooth set (`shells`: its teeth as saved, any way round) on a scan (a soup in its own
 * coordinates), from landmarks in those coordinates (estimated when left out).
 */
export function planWaxup(scan: ArrayLike<number>, shells: Float32Array[], landmarks?: WaxLandmarks | null, options: Omit<WaxupOptions, "landmarks"> = {}): WaxupPlan {
  const set = librarySet("set", shells);
  const { mesh, normals, frame } = scanInArchFrame(scan);
  const back = frame.clone().invert();
  const marks = landmarks ? moveLandmarks(landmarks, frame) : estimateLandmarks(mesh.v);
  const { placed, scale, arcDepth, centralWidth } = placeSet(set, mesh, normals, { ...options, landmarks: marks });
  return {
    landmarks: marks ? moveLandmarks(marks, back) : null,
    scale,
    arcDepth,
    centralWidth,
    teeth: placed.map(({ tooth, positions, clearance, width, length, lengthening, extension, frame }) => ({ kind: tooth.kind, side: tooth.side, positions: transformSoup(positions, back), clearance, width, length, lengthening, extension, frame: moveFrame(frame, back) })),
  };
}

/** A tooth frame moved by `m` (a rigid move: directions turned, kept unit length). */
export function moveFrame(f: ToothFrame, m: THREE.Matrix4): ToothFrame {
  const dir = (v: Vec3) => new THREE.Vector3(...v).transformDirection(m).toArray() as Vec3;
  return { origin: new THREE.Vector3(...f.origin).applyMatrix4(m).toArray() as Vec3, out: dir(f.out), mesial: dir(f.mesial), up: dir(f.up) };
}

/** Ways to adjust a placed wax tooth: along its frame, mm (or degrees for `turn`). */
export type ToothNudge = "out" | "mesial" | "longer" | "wider" | "turn";

/**
 * The move that adjusts a wax tooth by `amount` (mm; degrees for "turn"), in the coordinates of its
 * `frame`, given its `width` along the arch and `length` from edge to cervical end:
 * - out: straight out from the arch (negative: in); mesial: along the arch towards the midline;
 * - longer: the incisal edge further out of the gum, the cervical end staying where it is;
 * - wider: wider along the arch about its middle; turn: about its long axis, mesial side outward.
 */
export function nudgeMatrix(frame: ToothFrame, width: number, length: number, nudge: ToothNudge, amount: number): THREE.Matrix4 {
  const o = new THREE.Vector3(...frame.origin), out = new THREE.Vector3(...frame.out), mesial = new THREE.Vector3(...frame.mesial), up = new THREE.Vector3(...frame.up);
  if (nudge === "out") return new THREE.Matrix4().makeTranslation(out.x * amount, out.y * amount, out.z * amount);
  if (nudge === "mesial") return new THREE.Matrix4().makeTranslation(mesial.x * amount, mesial.y * amount, mesial.z * amount);
  // A scale along one direction about a point: the frame's basis, scaled on one axis.
  const basis = new THREE.Matrix4().makeBasis(mesial, out, up).setPosition(o);
  const inverse = basis.clone().invert();
  if (nudge === "longer") {
    const k = Math.max(0.3, (length + amount) / Math.max(0.5, length));
    // About the cervical end (length below the edge): the edge moves `amount` out of the gum.
    const about = new THREE.Matrix4().makeTranslation(0, 0, -length).multiply(new THREE.Matrix4().makeScale(1, 1, k)).multiply(new THREE.Matrix4().makeTranslation(0, 0, length));
    return basis.clone().multiply(about).multiply(inverse);
  }
  if (nudge === "wider") {
    const k = Math.max(0.3, (width + amount) / Math.max(0.5, width));
    return basis.clone().multiply(new THREE.Matrix4().makeScale(k, 1, 1)).multiply(inverse);
  }
  return basis.clone().multiply(new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(amount))).multiply(inverse);
}

/** The FDI number of the same tooth on the other side (11 and 21, 33 and 43...). */
export function contralateral(fdi: number) {
  const quadrant = Math.floor(fdi / 10), tooth = fdi % 10;
  const other = ({ 1: 2, 2: 1, 3: 4, 4: 3 } as Record<number, number>)[quadrant];
  return other ? other * 10 + tooth : fdi;
}

/**
 * The tooth number (FDI) of a library tooth on an arch: quadrant 1 the upper right, 2 the upper left,
 * 3 the lower left, 4 the lower right. In the arch frame (teeth up, front at -y) the patient's right
 * is at -x for a lower scan (facing -y, standing up) and at +x for an upper one (turned over).
 */
export function fdiNumber(kind: ToothKind, side: -1 | 1, arch: "upper" | "lower") {
  // A rotation turns the upper's teeth up (half a turn about y), so its right ends at +x.
  const right = arch === "upper" ? side > 0 : side < 0;
  const quadrant = arch === "upper" ? (right ? 1 : 2) : right ? 4 : 3;
  return quadrant * 10 + KINDS.indexOf(kind) + 1;
}

// ---------------------------------------------------------------------------------------------
// Blending

/** Neighbours further apart than this at their contact are moved together, mm. */
export const CONTACT_GAP = 0.05;
/** Neighbours overlapping deeper than this are eased apart, mm (a little overlap is a broad contact). */
export const CONTACT_OVERLAP = 0.25;
const CONTACT_PASSES = 10;
/** The share of a tooth's length, from its cervical end, that runs out onto the patient's surface. */
export const BLEND_SHARE = 0.35;
/** How far out over the scan (mm) the cervical wax may stand and still be draped onto it. */
const BLEND_REACH = 2.5;
/** The least the scan must face the tooth's labial direction to be draped onto (cosine). */
const BLEND_FACING = 0.3;
/** How far (mm) the draped edge sinks under the scan's surface, so the wax ends in it, not on it. */
const BLEND_SINK = 0.05;
/** The strips (mm wide) across a tooth in which the drape is measured. */
const BLEND_BIN = 0.75;
/** The cervical share of a tooth's length in which the drape is measured. */
const BLEND_MEASURE = 0.12;

/**
 * Closes the contacts between neighbouring wax teeth without changing their widths (a smile is
 * designed symmetric, and widths set by the proportions stay so): the centrals move together to
 * meet at the midline, then each tooth further out moves along the arch to meet the one before it.
 * Where two overlap deeply they move apart until the overlap is a broad contact. Up to CONTACT_PASSES
 * passes, as the gaps are measured in three dimensions and a move along the arch closes them only in part.
 */
function closeContacts(placed: PlacedTooth[]) {
  const order = [...placed].sort((a, b) => a.frame.origin[0] - b.frame.origin[0]);
  const mid = order.findIndex((tooth, i) => i + 1 < order.length && tooth.tooth.side < 0 && order[i + 1].tooth.side > 0);
  if (mid < 0) return;
  const move = (tooth: PlacedTooth, toward: PlacedTooth, amount: number) => {
    const dir = new THREE.Vector3(...tooth.frame.mesial);
    if (new THREE.Vector3(...toward.frame.origin).sub(new THREE.Vector3(...tooth.frame.origin)).dot(dir) < 0) dir.negate();
    const m = new THREE.Matrix4().makeTranslation(dir.x * amount, dir.y * amount, dir.z * amount);
    tooth.positions = transformSoup(tooth.positions, m);
    tooth.matrix = m.clone().multiply(tooth.matrix);
    tooth.frame = { ...tooth.frame, origin: new THREE.Vector3(...tooth.frame.origin).applyMatrix4(m).toArray() as Vec3 };
  };
  const need = (a: PlacedTooth, b: PlacedTooth) => {
    const gap = contactGap(a.positions, b.positions);
    if (gap === null) return 0;
    // An overlap is eased by half its excess at a time: gaps and depths are read at the corners, so
    // a full step can jump a contact from one side of the tolerance to the other.
    return gap > CONTACT_GAP ? gap : gap < -CONTACT_OVERLAP ? (gap + CONTACT_OVERLAP) / 2 : 0;
  };
  for (let pass = 0; pass < CONTACT_PASSES; pass += 1) {
    let moved = false;
    const centre = need(order[mid], order[mid + 1]);
    if (centre) { move(order[mid], order[mid + 1], centre / 2); move(order[mid + 1], order[mid], centre / 2); moved = true; }
    for (let i = mid; i > 0; i -= 1) { const g = need(order[i - 1], order[i]); if (g) { move(order[i - 1], order[i], g); moved = true; } }
    for (let i = mid + 1; i + 1 < order.length; i += 1) { const g = need(order[i], order[i + 1]); if (g) { move(order[i + 1], order[i], g); moved = true; } }
    if (!moved) break;
  }
}

/**
 * Build 79: the move (an affine matrix) that takes a soup's corners to where they stand in another
 * soup of the same triangles - a scan laid out again or its bite locked in. Read from four corners
 * spread across it; null when the two do not have the same corners, or the move is not rigid.
 */
export function rigidMoveBetween(before: ArrayLike<number>, after: ArrayLike<number>): THREE.Matrix4 | null {
  if (before.length !== after.length || before.length < 12) return null;
  const n = before.length / 3;
  const pick = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
  // Spread: the corners furthest along x, y and z from the first.
  let best = [0, 0, 0];
  const at = (p: ArrayLike<number>, i: number) => new THREE.Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  const p0 = at(before, 0);
  for (let i = 0; i < n; i += 1) for (let k = 0; k < 3; k += 1) {
    const d = Math.abs(before[i * 3 + k] - p0.getComponent(k));
    if (d > Math.abs(before[best[k] * 3 + k] - p0.getComponent(k))) best[k] = i;
  }
  pick.splice(1, 3, ...best);
  const a = pick.map((i) => at(before, i)), b = pick.map((i) => at(after, i));
  const A = new THREE.Matrix4().makeBasis(a[1].clone().sub(a[0]), a[2].clone().sub(a[0]), a[3].clone().sub(a[0])).setPosition(a[0]);
  const B = new THREE.Matrix4().makeBasis(b[1].clone().sub(b[0]), b[2].clone().sub(b[0]), b[3].clone().sub(b[0])).setPosition(b[0]);
  if (Math.abs(A.determinant()) < 1e-6) return null;
  const move = B.multiply(A.invert());
  // Rigid: every other corner lands where the move puts it.
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 50))) if (at(before, i).applyMatrix4(move).distanceTo(at(after, i)) > 0.01) return null;
  return move;
}

/**
 * How far apart two shells stand (mm), negative when they overlap (how deep the corners of either lie
 * inside the other); null when they are nowhere near.
 */
export function contactGap(a: Float32Array, b: Float32Array): number | null {
  const depthIn = (from: Float32Array, into: Float32Array) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < into.length; i += 3) for (let k = 0; k < 3; k += 1) { lo[k] = Math.min(lo[k], into[i + k]); hi[k] = Math.max(hi[k], into[i + k]); }
    const inside = insideOf(into);
    const grid = new PointGrid(into, 3);
    let depth = 0;
    for (let i = 0; i < from.length; i += 3) {
      if (from[i] < lo[0] || from[i] > hi[0] || from[i + 1] < lo[1] || from[i + 1] > hi[1] || from[i + 2] < lo[2] || from[i + 2] > hi[2]) continue;
      if (!inside(from[i], from[i + 1], from[i + 2])) continue;
      const hit = grid.nearest(from[i], from[i + 1], from[i + 2]);
      depth = Math.max(depth, hit ? hit[1] : 0);
    }
    return depth;
  };
  const depth = Math.max(depthIn(a, b), depthIn(b, a));
  if (depth > 0) return -depth;
  const grid = new PointGrid(b, 3);
  let least = Infinity;
  for (let i = 0; i < a.length; i += 3) {
    const hit = grid.nearest(a[i], a[i + 1], a[i + 2]);
    if (hit && hit[1] < least) least = hit[1];
  }
  return Number.isFinite(least) ? least : null;
}

/**
 * Sinks a tooth's cervical part into the patient's surface, as a technician feathers wax into the
 * tooth and gum. Across the tooth (in BLEND_BIN strips from mesial to distal) it measures how far the
 * labial face of the cervical end stands proud of the scan, straight back along the tooth's labial
 * direction; the strips are smoothed into one profile, and the cervical part moves back by it -
 * fully at the cervical end and less and less towards BLEND_SHARE of the tooth's length (a smooth
 * ease). The wax then runs into the tooth and gum without a step (a feather edge, as an injected
 * composite or a mock-up needs), and as every corner moves the same way the surface cannot fold.
 */
function drapeCervical(tooth: PlacedTooth, scan: Mesh, normals: ArrayLike<number>) {
  const grid = new PointGrid(scan.v, 3);
  const o = new THREE.Vector3(...tooth.frame.origin), up = new THREE.Vector3(...tooth.frame.up);
  const out = new THREE.Vector3(...tooth.frame.out).normalize(), mesial = new THREE.Vector3(...tooth.frame.mesial).normalize();
  const p = tooth.positions;
  const half = tooth.width / 2 + 1;
  const bins = Math.ceil((half * 2) / BLEND_BIN);
  const binOf = (q: THREE.Vector3) => Math.max(0, Math.min(bins - 1, Math.floor((q.clone().sub(o).dot(mesial) + half) / BLEND_BIN)));
  const shareOf = (q: THREE.Vector3) => (q.clone().sub(o).dot(up) + tooth.length) / Math.max(1, tooth.length);
  // How far each strip's labial cervical face stands proud of the scan.
  const found: number[][] = Array.from({ length: bins }, () => []);
  const q = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 3) {
    q.set(p[i], p[i + 1], p[i + 2]);
    if (shareOf(q) > BLEND_MEASURE) continue;
    const hit = grid.nearest(q.x, q.y, q.z);
    if (!hit) continue;
    const k = hit[0] * 3;
    const side = (q.x - scan.v[k]) * normals[k] + (q.y - scan.v[k + 1]) * normals[k + 1] + (q.z - scan.v[k + 2]) * normals[k + 2];
    const facing = normals[k] * out.x + normals[k + 1] * out.y + normals[k + 2] * out.z;
    if (side <= 0 || facing < BLEND_FACING) continue;
    const back = side / facing;
    if (back <= BLEND_REACH) found[binOf(q)].push(back);
  }
  let profile = found.map((list) => (list.length ? list.sort((x, y) => x - y)[Math.floor(list.length * 0.75)] : NaN));
  if (profile.every((v) => Number.isNaN(v))) return;
  // Strips with nothing to measure take their nearest neighbours'; then the profile is smoothed.
  for (let pass = 0; pass < bins && profile.some((v) => Number.isNaN(v)); pass += 1) {
    profile = profile.map((v, i) => (Number.isNaN(v) ? [profile[i - 1], profile[i + 1]].filter((x) => x !== undefined && !Number.isNaN(x)).reduce((sum, x, _, all) => sum + x / all.length, NaN) : v));
    profile = profile.map((v, i) => (Number.isNaN(v) ? ([profile[i - 1], profile[i + 1]].find((x) => x !== undefined && !Number.isNaN(x)) ?? NaN) : v));
  }
  for (let pass = 0; pass < 3; pass += 1) profile = profile.map((v, i) => (profile[Math.max(0, i - 1)] + 2 * v + profile[Math.min(bins - 1, i + 1)]) / 4);
  for (let i = 0; i < p.length; i += 3) {
    q.set(p[i], p[i + 1], p[i + 2]);
    const share = shareOf(q);
    if (share >= BLEND_SHARE) continue;
    const t = Math.max(0, Math.min(1, 1 - share / BLEND_SHARE));
    // The strip's depth read between its neighbours, so the move has no steps across the tooth.
    const f = (q.clone().sub(o).dot(mesial) + half) / BLEND_BIN - 0.5;
    const i0 = Math.max(0, Math.min(bins - 1, Math.floor(f))), i1 = Math.min(bins - 1, i0 + 1), u = Math.max(0, Math.min(1, f - i0));
    const back = (profile[i0] * (1 - u) + profile[i1] * u + BLEND_SINK) * t * t * (3 - 2 * t);
    p[i] -= out.x * back; p[i + 1] -= out.y * back; p[i + 2] -= out.z * back;
  }
}
