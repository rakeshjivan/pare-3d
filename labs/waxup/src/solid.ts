/**
 * Wax-up lab: library crowns made solid, and printable models with the wax-up on them.
 *
 * A library tooth is a crown shell open along its cervical line. To join it to a model it is
 * extended down (along its own occlusal axis) into the gum and closed, so it is a solid that
 * reaches into the model wherever the wax-up sits.
 */
import * as THREE from "three";
import type { ManifoldToplevel } from "manifold-3d";
import { makeDentalStudio, preparedDental, type DentalStudioOptions } from "@/lib/dentalModel";
import type { ToothMesh } from "./library";

type Runtime = ManifoldToplevel;

/** The crown closed: its open cervical edge(s) carried `depth` mm down local -z and capped. */
export function closedTooth(mesh: ToothMesh, depth = 4): ToothMesh {
  const v = Array.from(mesh.v);
  const f = Array.from(mesh.f);
  // Boundary half-edges: a -> b where no triangle has b -> a.
  const half = new Map<string, [number, number]>();
  for (let t = 0; t < mesh.f.length; t += 3) {
    for (let k = 0; k < 3; k += 1) {
      const a = mesh.f[t + k], b = mesh.f[t + ((k + 1) % 3)];
      half.set(`${a}_${b}`, [a, b]);
    }
  }
  const next = new Map<number, number>();
  for (const [a, b] of half.values()) if (!half.has(`${b}_${a}`)) next.set(a, b);
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: number[] = [];
    let at: number | undefined = start;
    while (at !== undefined && !seen.has(at)) { seen.add(at); loop.push(at); at = next.get(at); }
    if (loop.length < 3) continue;
    // The loop's lowest point sets the floor: the extension ends level, `depth` below it.
    let floor = Infinity, cx = 0, cy = 0;
    for (const i of loop) { floor = Math.min(floor, mesh.v[i * 3 + 2]); cx += mesh.v[i * 3]; cy += mesh.v[i * 3 + 1]; }
    cx /= loop.length; cy /= loop.length;
    floor -= depth;
    const lower = loop.map((i) => {
      v.push(mesh.v[i * 3], mesh.v[i * 3 + 1], floor);
      return v.length / 3 - 1;
    });
    // Sides: boundary half-edge a -> b (as it runs in its triangle) gets b -> a -> a' and b -> a' -> b'.
    for (let k = 0; k < loop.length; k += 1) {
      const a = loop[k], b = loop[(k + 1) % loop.length], a2 = lower[k], b2 = lower[(k + 1) % loop.length];
      f.push(b, a, a2, b, a2, b2);
    }
    v.push(cx, cy, floor);
    const c = v.length / 3 - 1;
    for (let k = 0; k < loop.length; k += 1) f.push(c, lower[(k + 1) % loop.length], lower[k]);
  }
  return { v: Float32Array.from(v), f: Uint32Array.from(f) };
}

/** An indexed mesh transformed (triangles turned over when the matrix mirrors). */
export function transformed(mesh: ToothMesh, m: THREE.Matrix4): ToothMesh {
  const v = new Float32Array(mesh.v.length);
  const p = new THREE.Vector3();
  for (let i = 0; i < mesh.v.length; i += 3) {
    p.set(mesh.v[i], mesh.v[i + 1], mesh.v[i + 2]).applyMatrix4(m);
    v[i] = p.x; v[i + 1] = p.y; v[i + 2] = p.z;
  }
  let f = mesh.f;
  if (m.determinant() < 0) {
    f = Uint32Array.from(mesh.f);
    for (let t = 0; t < f.length; t += 3) { const s = f[t + 1]; f[t + 1] = f[t + 2]; f[t + 2] = s; }
  }
  return { v, f };
}

export function toManifold(runtime: Runtime, mesh: ToothMesh) {
  const m = new runtime.Mesh({ numProp: 3, vertProperties: mesh.v, triVerts: mesh.f });
  m.merge();
  return new runtime.Manifold(m);
}

export function solidMesh(solid: { getMesh(): { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array } }): ToothMesh {
  const mesh = solid.getMesh();
  const v = new Float32Array((mesh.vertProperties.length / mesh.numProp) * 3);
  for (let i = 0, j = 0; i < mesh.vertProperties.length; i += mesh.numProp, j += 3) { v[j] = mesh.vertProperties[i]; v[j + 1] = mesh.vertProperties[i + 1]; v[j + 2] = mesh.vertProperties[i + 2]; }
  return { v, f: Uint32Array.from(mesh.triVerts) };
}

export function stlBytes(mesh: ToothMesh): Uint8Array {
  const n = mesh.f.length / 3;
  const out = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(out);
  new Uint8Array(out).set(new TextEncoder().encode("Pare 3D wax-up lab"), 0);
  dv.setUint32(80, n, true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let t = 0; t < n; t += 1) {
    const o = 84 + t * 50;
    const ia = mesh.f[t * 3] * 3, ib = mesh.f[t * 3 + 1] * 3, ic = mesh.f[t * 3 + 2] * 3;
    a.fromArray(mesh.v, ia); b.fromArray(mesh.v, ib); c.fromArray(mesh.v, ic);
    nrm.subVectors(b, a).cross(c.clone().sub(a)).normalize();
    [nrm, a, b, c].forEach((vec, k) => { dv.setFloat32(o + k * 12, vec.x, true); dv.setFloat32(o + k * 12 + 4, vec.y, true); dv.setFloat32(o + k * 12 + 8, vec.z, true); });
  }
  return new Uint8Array(out);
}

/** Dental Studio's crown-and-bridge base: solid on a plate, the most accurate print. */
export const MODEL_OPTIONS: DentalStudioOptions = { label: "", hinge: false, layout: "print", wall: 2, keep: null, base: 5, baseStyle: "plate", inside: "solid" };

/**
 * A printable model of one arch: the scan as Dental Studio makes it, and a function that takes
 * teeth from the lab's frame into the model's. `scan` = the arch's cleaned triangles in the shared
 * (bite) coordinates; `labFrame` = the lab's arch frame for them.
 */
export async function archModel(runtime: Runtime, scan: Float32Array, labFrame: THREE.Matrix4, options: DentalStudioOptions = MODEL_OPTIONS) {
  const input = { arches: [{ id: "arch", positions: scan }] };
  const single = preparedDental(input).arches[0];
  const made = await makeDentalStudio(input, options, runtime as never);
  const part = made.parts[0];
  // The model stands on the plate: its tallest cusp is the scan's, raised by the base.
  let outTop = -Infinity;
  for (let i = 2; i < part.positions.length; i += 3) outTop = Math.max(outTop, part.positions[i]);
  let scanTop = -Infinity;
  const p = new THREE.Vector3();
  for (let i = 0; i < single.clean.mesh.v.length; i += 3) scanTop = Math.max(scanTop, p.set(single.clean.mesh.v[i], single.clean.mesh.v[i + 1], single.clean.mesh.v[i + 2]).applyMatrix4(single.frame).z);
  const toModel = new THREE.Matrix4().makeTranslation(0, 0, outTop - scanTop).multiply(single.frame).multiply(labFrame.clone().invert());
  const soup = Float32Array.from(part.positions);
  const model = { v: soup, f: Uint32Array.from({ length: soup.length / 3 }, (_, i) => i) };
  return { model, toModel, warnings: made.warnings };
}

/** The model joined with the given teeth (each already closed and in the model's frame). */
export function modelWithTeeth(runtime: Runtime, model: ToothMesh, teeth: ToothMesh[]): ToothMesh {
  const solids = [toManifold(runtime, model), ...teeth.map((tooth) => toManifold(runtime, tooth))];
  const joined = runtime.Manifold.union(solids);
  const out = solidMesh(joined);
  solids.forEach((solid) => solid.delete());
  joined.delete();
  return out;
}
