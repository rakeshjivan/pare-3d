import * as THREE from "three";
import { MeshBVH, type SerializedBVH } from "three-mesh-bvh";
import type { WorkplaneShape } from "@/types/layerling";

type ImportedMesh = NonNullable<WorkplaneShape["importedMesh"]>;

/** The raycasting index of an imported mesh, as the viewport builds it (enableAcceleratedMeshPicking). */
export const IMPORTED_MESH_BVH_OPTIONS = { targetLeafSize: 12 } as const;

/** Normals for every corner, the lowest point on the plate: how a shape's mesh is drawn. */
export function putGeometryOnBase(geometry: THREE.BufferGeometry, preserveNormals = false) {
  if (!preserveNormals || !geometry.getAttribute("normal")) {
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();
  const minY = geometry.boundingBox?.min.y ?? 0;
  geometry.translate(0, -minY, 0);
  return geometry;
}

/**
 * The view's geometry of an imported mesh (WorkplaneViewport's getImportedMeshCache). Its own
 * normals when it brings them; without, putGeometryOnBase works them out.
 */
export function buildImportedMeshGeometry(mesh: ImportedMesh) {
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.Float32BufferAttribute(mesh.positions, 3);
  geometry.setAttribute("position", position);
  const hasNormals = Boolean(mesh.normals && mesh.normals.length === mesh.positions.length);
  // Build 87: a mesh is drawn smooth, as Meshmixer draws a scan - each corner's normal the average of
  // the faces round it - unless it brings normals of its own that are not simply its faces' (an STL's
  // are). Drawn flat, every triangle of a scan showed, and a sculpted surface looked rough.
  if (hasNormals && mesh.normals && !facetNormals(mesh.normals)) {
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.normals, 3));
  } else {
    geometry.setAttribute("normal", new THREE.BufferAttribute(smoothNormals(position.array as Float32Array), 3));
  }
  return putGeometryOnBase(geometry, true);
}

/** Whether normals given per corner are just each triangle's own (all three alike), checked on a sample. */
function facetNormals(normals: ArrayLike<number>) {
  const triangles = Math.floor(normals.length / 9);
  const step = Math.max(1, Math.floor(triangles / 2000));
  for (let t = 0; t < triangles; t += step) {
    const o = t * 9;
    for (let k = 1; k < 3; k += 1) {
      if (Math.abs(normals[o] - normals[o + k * 3]) > 1e-4 || Math.abs(normals[o + 1] - normals[o + k * 3 + 1]) > 1e-4 || Math.abs(normals[o + 2] - normals[o + k * 3 + 2]) > 1e-4) return false;
    }
  }
  return true;
}

/** Faces meeting at more than this keep a sharp edge (a model's base, a cut): degrees. */
export const SMOOTH_CREASE_ANGLE = 50;
/**
 * Build 87: smooth normals for a triangle soup (nine numbers a triangle): corners at the same place
 * joined, and each triangle's corner given the area-weighted average of the faces round it that turn
 * from that triangle by no more than SMOOTH_CREASE_ANGLE, so sharp edges stay sharp. Typed arrays and an open-addressing table throughout - a full-arch scan's
 * 1.3 million corners take a fraction of a second.
 */
export function smoothNormals(positions: Float32Array): Float32Array {
  const corners = Math.floor(positions.length / 3);
  const bits = new Uint32Array(positions.buffer, positions.byteOffset, corners * 3);
  let size = 1;
  while (size < corners * 2) size <<= 1;
  const mask = size - 1;
  const table = new Int32Array(size).fill(-1);
  const id = new Int32Array(corners);
  const first: number[] = [];
  let unique = 0;
  for (let c = 0; c < corners; c += 1) {
    const x = bits[c * 3], y = bits[c * 3 + 1], z = bits[c * 3 + 2];
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask;
    for (;;) {
      const slot = table[h];
      if (slot < 0) { table[h] = unique; first.push(c); id[c] = unique; unique += 1; break; }
      const f = first[slot];
      if (bits[f * 3] === x && bits[f * 3 + 1] === y && bits[f * 3 + 2] === z) { id[c] = slot; break; }
      h = (h + 1) & mask;
    }
  }
  // Each face's normal (its length twice its area), and the faces at each joined corner.
  const triangles = Math.floor(corners / 3);
  const face = new Float64Array(triangles * 3), unit = new Float32Array(triangles * 3);
  const p = positions;
  const count = new Int32Array(unique + 1);
  for (let t = 0; t < triangles; t += 1) {
    const a = t * 9;
    const ux = p[a + 3] - p[a], uy = p[a + 4] - p[a + 1], uz = p[a + 5] - p[a + 2];
    const vx = p[a + 6] - p[a], vy = p[a + 7] - p[a + 1], vz = p[a + 8] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    face[t * 3] = nx; face[t * 3 + 1] = ny; face[t * 3 + 2] = nz;
    const l = Math.hypot(nx, ny, nz) || 1;
    unit[t * 3] = nx / l; unit[t * 3 + 1] = ny / l; unit[t * 3 + 2] = nz / l;
    for (let k = 0; k < 3; k += 1) count[id[t * 3 + k] + 1] += 1;
  }
  for (let v = 0; v < unique; v += 1) count[v + 1] += count[v];
  const fill = count.slice(0, unique), faces = new Int32Array(corners);
  for (let c = 0; c < corners; c += 1) faces[fill[id[c]]++] = Math.floor(c / 3);
  // A corner's normal: the faces round it that turn from its own face by no more than the crease angle.
  const crease = Math.cos((SMOOTH_CREASE_ANGLE * Math.PI) / 180);
  const out = new Float32Array(corners * 3);
  for (let c = 0; c < corners; c += 1) {
    const t = Math.floor(c / 3), v = id[c];
    const fx = unit[t * 3], fy = unit[t * 3 + 1], fz = unit[t * 3 + 2];
    let sx = 0, sy = 0, sz = 0;
    for (let i = count[v]; i < count[v + 1]; i += 1) {
      const g = faces[i];
      if (unit[g * 3] * fx + unit[g * 3 + 1] * fy + unit[g * 3 + 2] * fz < crease) continue;
      sx += face[g * 3]; sy += face[g * 3 + 1]; sz += face[g * 3 + 2];
    }
    const sl = Math.hypot(sx, sy, sz);
    if (sl > 0) { out[c * 3] = sx / sl; out[c * 3 + 1] = sy / sl; out[c * 3 + 2] = sz / sl; }
    else { out[c * 3] = fx; out[c * 3 + 1] = fy; out[c * 3 + 2] = fz; }
  }
  return out;
}

/**
 * That geometry and its raycasting index, worked out in the geometry worker for a mesh it has just
 * made, so the page only has to put them together. Built by the same code as on the page, from
 * the same numbers: the same geometry comes out.
 */
export type PreparedImportedMeshDisplay = {
  position: Float32Array;
  normal: Float32Array;
  box: [number, number, number, number, number, number];
  bvh: SerializedBVH;
};

export function prepareImportedMeshDisplay(mesh: ImportedMesh): { display: PreparedImportedMeshDisplay; transfer: ArrayBuffer[] } {
  const geometry = buildImportedMeshGeometry(mesh);
  const box = geometry.boundingBox ?? new THREE.Box3();
  const position = geometry.getAttribute("position").array as Float32Array;
  const normal = geometry.getAttribute("normal").array as Float32Array;
  // Built before the index exists, as on the page; the BVH adds it.
  const bvh = MeshBVH.serialize(new MeshBVH(geometry, IMPORTED_MESH_BVH_OPTIONS), { cloneBuffers: false });
  const transfer = [position.buffer, normal.buffer, ...bvh.roots, ...(bvh.index ? [bvh.index.buffer] : [])] as ArrayBuffer[];
  return {
    display: { position, normal, box: [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z], bvh },
    transfer: Array.from(new Set(transfer)),
  };
}

/**
 * Kept by the mesh's position list: the geometry is made from its positions and normals alone, and
 * a copy of the mesh with something added (its asset id after an import) keeps both lists.
 */
const preparedDisplays = new WeakMap<object, { display: PreparedImportedMeshDisplay; normals: number[] | undefined }>();
const preparedTrees = new WeakMap<THREE.BufferGeometry, SerializedBVH>();

/** Keeps what the worker prepared for a mesh until the view draws it. */
export function rememberPreparedDisplay(mesh: ImportedMesh, display: PreparedImportedMeshDisplay) {
  preparedDisplays.set(mesh.positions, { display, normals: mesh.normals });
}

/** The view's geometry from what the worker prepared, or null when nothing was. Used once. */
export function takePreparedImportedMeshGeometry(mesh: ImportedMesh): THREE.BufferGeometry | null {
  const prepared = preparedDisplays.get(mesh.positions);
  if (!prepared || prepared.normals !== mesh.normals) return null;
  preparedDisplays.delete(mesh.positions);
  const { display } = prepared;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(display.position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(display.normal, 3));
  const [minX, minY, minZ, maxX, maxY, maxZ] = display.box;
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
  preparedTrees.set(geometry, display.bvh);
  return geometry;
}

/**
 * The raycasting index for a geometry: the one the worker built for exactly this geometry, or a new
 * one. Only ever asked where the page would build it, so nothing else changes.
 */
export function computeImportedBoundsTree(geometry: THREE.BufferGeometry) {
  const prepared = preparedTrees.get(geometry);
  const target = geometry as THREE.BufferGeometry & { boundsTree?: MeshBVH };
  if (prepared && !geometry.getIndex()) {
    preparedTrees.delete(geometry);
    target.boundsTree = MeshBVH.deserialize(prepared, geometry);
    return;
  }
  target.boundsTree = new MeshBVH(geometry, IMPORTED_MESH_BVH_OPTIONS);
}
