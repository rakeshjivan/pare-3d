/**
 * Fork (build 39): how a text laid on a part follows that part. Three points of the part's mesh
 * are remembered when the text is laid; after any move or turn the same three points give the
 * exact rigid motion (whatever the pivot), and the text gets the same motion. A part that changed
 * size or shape has no rigid motion: the caller lays the text again instead.
 */
export type Vec = { x: number; y: number; z: number };
export type SurfaceAnchor = { index: number; at: Vec };

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec, b: Vec): Vec => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (a: Vec) => Math.hypot(a.x, a.y, a.z);
const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const unit = (a: Vec): Vec => scale(a, 1 / (len(a) || 1));
const vec = (v: readonly number[]): Vec => ({ x: v[0], y: v[1], z: v[2] });

/** Three well-spread vertices: the first, the one farthest from it, and the one farthest off that line. */
export function surfaceAnchors(vertices: ReadonlyArray<readonly number[]>): SurfaceAnchor[] | undefined {
  if (vertices.length < 3) return undefined;
  const p0 = vec(vertices[0]);
  let i1 = 0;
  let best = -1;
  vertices.forEach((v, index) => {
    const d = len(sub(vec(v), p0));
    if (d > best) {
      best = d;
      i1 = index;
    }
  });
  const p1 = vec(vertices[i1]);
  const axis = unit(sub(p1, p0));
  let i2 = 0;
  best = -1;
  vertices.forEach((v, index) => {
    const d = len(cross(sub(vec(v), p0), axis));
    if (d > best) {
      best = d;
      i2 = index;
    }
  });
  if (best < 1e-6 || len(sub(p1, p0)) < 1e-6) return undefined;
  return [0, i1, i2].map((index) => ({ index, at: vec(vertices[index]) }));
}

function frame(a: Vec, b: Vec, c: Vec) {
  const e1 = unit(sub(b, a));
  const e3 = unit(cross(e1, sub(c, a)));
  const e2 = cross(e3, e1);
  return [e1, e2, e3] as const;
}

export type RigidMotion = { point: (p: Vec) => Vec; direction: (d: Vec) => Vec; identity: boolean };

/**
 * The rigid motion that carried the remembered anchors to where the same vertices are now, or
 * "changed" when the part changed size or shape (or its mesh is a different one), so no rigid
 * motion explains it.
 */
export function anchorMotion(anchors: readonly SurfaceAnchor[] | undefined, vertices: ReadonlyArray<readonly number[]>): RigidMotion | "changed" {
  if (!anchors || anchors.length !== 3 || anchors.some((anchor) => anchor.index >= vertices.length)) return "changed";
  const [a, b, c] = anchors.map((anchor) => anchor.at);
  const [a2, b2, c2] = anchors.map((anchor) => vec(vertices[anchor.index]));
  const tolerance = 1e-3 + 1e-4 * len(sub(b, a));
  if (Math.abs(len(sub(b2, a2)) - len(sub(b, a))) > tolerance || Math.abs(len(sub(c2, a2)) - len(sub(c, a))) > tolerance || Math.abs(len(sub(c2, b2)) - len(sub(c, b))) > tolerance) return "changed";
  const identity = len(sub(a2, a)) < 1e-4 && len(sub(b2, b)) < 1e-4 && len(sub(c2, c)) < 1e-4;
  const from = frame(a, b, c);
  const to = frame(a2, b2, c2);
  // R = to * from^T
  const direction = (d: Vec): Vec => {
    const local = { x: dot(d, from[0]), y: dot(d, from[1]), z: dot(d, from[2]) };
    return add(add(scale(to[0], local.x), scale(to[1], local.y)), scale(to[2], local.z));
  };
  return { point: (p: Vec) => add(a2, direction(sub(p, a))), direction, identity };
}

/** Moves a flat list of triangle corners (x, y, z, ...) by the motion. */
export function movePositions(positions: ArrayLike<number>, motion: RigidMotion): number[] {
  const out = new Array<number>(positions.length);
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const p = motion.point({ x: positions[i], y: positions[i + 1], z: positions[i + 2] });
    out[i] = p.x;
    out[i + 1] = p.y;
    out[i + 2] = p.z;
  }
  return out;
}
