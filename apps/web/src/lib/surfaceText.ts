/**
 * Fork (build 34): text on any surface, the way Bambu Studio's text tool works. The letters are
 * laid out flat on the spot that was clicked, cut into small pieces, and every point is dropped
 * onto the model along the face's direction - so the letters hug a dome, a curved body or a scan,
 * standing out of it (raised) or reaching into it (cut in) by the depth.
 *
 * The frame at the spot: W out of the surface (the clicked face's normal), V "up" along the
 * surface (the world's up, or the depth direction on a face that looks up), U to the right.
 */
import { getManifoldRuntime } from "@/lib/editorMeshCore";
import { weldTriangles } from "@/lib/meshRepair";

export type Vec = { x: number; y: number; z: number };

export type SurfaceTextPlacement = {
  /** The clicked point and the surface's direction there, in the world. */
  origin: Vec;
  normal: Vec;
  /** Which way the top of the letters points, roughly; projected onto the surface. */
  up?: Vec;
  /** Turns the letters about the normal, in degrees. */
  rotation?: number;
};

export type SurfaceTextMode = "raised" | "engraved";

/** How far raised letters reach into the surface, so they join it where it curves away. */
export const SURFACE_TEXT_SINK = 0.3;
/** How far cut-in letters reach out past the surface, so no skin is left over them. */
export const SURFACE_TEXT_OVERSHOOT = 0.5;

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec, b: Vec): Vec => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const norm = (a: Vec): Vec => scale(a, 1 / (Math.hypot(a.x, a.y, a.z) || 1));

/** U (right), V (up) and W (out) at the spot. */
export function surfaceTextFrame(placement: SurfaceTextPlacement) {
  const w = norm(placement.normal);
  // On a face that looks up or down the letters' top points to the back of the plate (-z), as text on the plate does.
  const wantedUp = placement.up && Math.abs(dot(norm(placement.up), w)) < 0.95
    ? norm(placement.up)
    : Math.abs(w.y) > 0.95 ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };
  let v = norm(sub(wantedUp, scale(w, dot(wantedUp, w))));
  let u = norm(cross(v, w));
  const angle = ((placement.rotation ?? 0) * Math.PI) / 180;
  if (angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ru = { x: u.x * cos + v.x * sin, y: u.y * cos + v.y * sin, z: u.z * cos + v.z * sin };
    const rv = { x: v.x * cos - u.x * sin, y: v.y * cos - u.y * sin, z: v.z * cos - u.z * sin };
    u = ru;
    v = rv;
  }
  return { u, v, w };
}

type Projected = { u: number[]; v: number[]; w: number[] };

/** The target's triangles in the frame, binned on a grid over the area the letters cover. */
function surfaceGrid(target: ArrayLike<number>, origin: Vec, frame: ReturnType<typeof surfaceTextFrame>, area: { minU: number; maxU: number; minV: number; maxV: number }, cell: number) {
  const nu = Math.max(1, Math.ceil((area.maxU - area.minU) / cell));
  const nv = Math.max(1, Math.ceil((area.maxV - area.minV) / cell));
  const bins: number[][] = Array.from({ length: nu * nv }, () => []);
  const tris: Projected = { u: [], v: [], w: [] };
  for (let t = 0; t + 8 < target.length; t += 9) {
    const pu: number[] = [];
    const pv: number[] = [];
    const pw: number[] = [];
    for (let k = 0; k < 3; k += 1) {
      const p = { x: target[t + 3 * k] - origin.x, y: target[t + 3 * k + 1] - origin.y, z: target[t + 3 * k + 2] - origin.z };
      pu.push(dot(p, frame.u));
      pv.push(dot(p, frame.v));
      pw.push(dot(p, frame.w));
    }
    const minU = Math.min(...pu), maxU = Math.max(...pu), minV = Math.min(...pv), maxV = Math.max(...pv);
    if (maxU < area.minU || minU > area.maxU || maxV < area.minV || minV > area.maxV) continue;
    // Seen edge-on along the projection: no point falls inside it.
    const det = (pu[1] - pu[0]) * (pv[2] - pv[0]) - (pu[2] - pu[0]) * (pv[1] - pv[0]);
    if (Math.abs(det) < 1e-12) continue;
    const index = tris.u.length / 3;
    tris.u.push(...pu);
    tris.v.push(...pv);
    tris.w.push(...pw);
    const i0 = Math.max(0, Math.floor((minU - area.minU) / cell));
    const i1 = Math.min(nu - 1, Math.floor((maxU - area.minU) / cell));
    const j0 = Math.max(0, Math.floor((minV - area.minV) / cell));
    const j1 = Math.min(nv - 1, Math.floor((maxV - area.minV) / cell));
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) bins[j * nu + i].push(index);
  }
  /** The surface's height (along W) at (u, v): the first surface met coming in from outside, within `reach` of the spot. */
  const heightAt = (u: number, v: number, reach: { above: number; below: number }): number | null => {
    const i = Math.floor((u - area.minU) / cell);
    const j = Math.floor((v - area.minV) / cell);
    if (i < 0 || j < 0 || i >= nu || j >= nv) return null;
    let best: number | null = null;
    for (const index of bins[j * nu + i]) {
      const b = index * 3;
      const u0 = tris.u[b], u1 = tris.u[b + 1], u2 = tris.u[b + 2];
      const v0 = tris.v[b], v1 = tris.v[b + 1], v2 = tris.v[b + 2];
      const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
      const l1 = ((u - u0) * (v2 - v0) - (u2 - u0) * (v - v0)) / det;
      const l2 = ((u1 - u0) * (v - v0) - (u - u0) * (v1 - v0)) / det;
      const l0 = 1 - l1 - l2;
      if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue;
      const w = l0 * tris.w[b] + l1 * tris.w[b + 1] + l2 * tris.w[b + 2];
      if (w > reach.above || w < -reach.below) continue;
      if (best === null || w > best) best = w;
    }
    return best;
  };
  return { heightAt };
}

export type SurfaceTextResult = {
  positions: number[];
  /** Share of the letters' points that found no surface under them (they run off the part). */
  offSurface: number;
};

/**
 * The letters on the surface. `letters` is the flat text as the editor builds it: x to the right,
 * y the thickness (0 at the bottom), z towards the front (the top of the letters at -z); its
 * thickness must be `depth` for raised text and `depth + SURFACE_TEXT_OVERSHOOT` for cut-in text.
 * `target` is the part's surface in the world. Both are triangle lists, 9 numbers a triangle.
 */
export async function surfaceTextPositions(letters: ArrayLike<number>, target: ArrayLike<number>, placement: SurfaceTextPlacement, options: { depth: number; mode: SurfaceTextMode; letterHeight: number }): Promise<SurfaceTextResult> {
  const frame = surfaceTextFrame(placement);
  // The letters cut into small pieces, so they can bend with the surface.
  const runtime = await getManifoldRuntime();
  const welded = weldTriangles(letters);
  const pieceLength = Math.max(0.15, Math.min(0.8, options.letterHeight / 14));
  let refined: number[] = [];
  const made: Array<{ delete(): void }> = [];
  try {
    const solid = new runtime.Manifold(new runtime.Mesh({ numProp: 3, vertProperties: new Float32Array(welded.points.flat()), triVerts: new Uint32Array(welded.triangles.flat()) }));
    made.push(solid);
    if (solid.status() !== "NoError" || solid.isEmpty()) throw new Error("The letters do not make a closed body");
    const fine = solid.refineToLength(pieceLength);
    made.push(fine);
    const mesh = fine.getMesh();
    refined = new Array(mesh.triVerts.length * 3);
    for (let i = 0; i < mesh.triVerts.length; i += 1) {
      const base = mesh.triVerts[i] * mesh.numProp;
      refined[i * 3] = mesh.vertProperties[base];
      refined[i * 3 + 1] = mesh.vertProperties[base + 1];
      refined[i * 3 + 2] = mesh.vertProperties[base + 2];
    }
  } finally {
    made.forEach((item) => item.delete());
  }
  // The letters' middle on the spot.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i + 2 < refined.length; i += 3) {
    minX = Math.min(minX, refined[i]); maxX = Math.max(maxX, refined[i]);
    minY = Math.min(minY, refined[i + 1]); maxY = Math.max(maxY, refined[i + 1]);
    minZ = Math.min(minZ, refined[i + 2]); maxZ = Math.max(maxZ, refined[i + 2]);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const halfU = (maxX - minX) / 2 + 1;
  const halfV = (maxZ - minZ) / 2 + 1;
  const thickness = Math.max(1e-6, maxY - minY);
  const grid = surfaceGrid(target, placement.origin, frame, { minU: -halfU, maxU: halfU, minV: -halfV, maxV: halfV }, Math.max(0.5, pieceLength * 2));
  // A surface further out than the letters are tall, or deeper in than four times that, is another part of the model.
  const reach = { above: options.letterHeight * 1.5, below: options.letterHeight * 4 };
  const heights = new Map<string, number | null>();
  let missing = 0;
  let points = 0;
  const out = new Array<number>(refined.length);
  for (let i = 0; i + 2 < refined.length; i += 3) {
    const u = refined[i] - cx;
    const v = -(refined[i + 2] - cz);
    const h = (refined[i + 1] - minY) / thickness;
    const key = `${u.toFixed(5)}_${v.toFixed(5)}`;
    let surface = heights.get(key);
    if (surface === undefined) {
      surface = grid.heightAt(u, v, reach);
      heights.set(key, surface);
      points += 1;
      if (surface === null) missing += 1;
    }
    // Raised: from just under the surface to the depth over it. Cut in: from the depth under it to just over it.
    const along = options.mode === "raised"
      ? -SURFACE_TEXT_SINK + h * (options.depth + SURFACE_TEXT_SINK)
      : -options.depth + h * (options.depth + SURFACE_TEXT_OVERSHOOT);
    const w = (surface ?? 0) + along;
    out[i] = placement.origin.x + frame.u.x * u + frame.v.x * v + frame.w.x * w;
    out[i + 1] = placement.origin.y + frame.u.y * u + frame.v.y * v + frame.w.y * w;
    out[i + 2] = placement.origin.z + frame.u.z * u + frame.v.z * v + frame.w.z * w;
  }
  return { positions: out, offSurface: points ? missing / points : 0 };
}
