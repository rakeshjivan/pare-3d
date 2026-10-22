/**
 * Fork (build 33): Round a mesh - rounds every outside edge (and, if asked, every inside edge) of a
 * part by a radius, also where the fillet tool cannot go: dense imported meshes, scans, booleans.
 *
 * It is a morphological opening (outside edges) or closing (inside edges), done on a voxel grid:
 *   1. the part is voxelised (inside or not, by ray parity along z),
 *   2. an exact Euclidean distance transform shrinks it by the radius and grows it back (or the
 *      other way round for inside edges) - a ball of that radius rolled along the surface,
 *   3. Manifold's level set turns the field into a smooth surface,
 *   4. and that surface is combined with the original part, so faces away from the edges stay
 *      exactly as they were: outside edges take original ∩ opened, inside edges original ∪ closed.
 *
 * Detail finer than the grid (the radius / 3, coarser on a big part) is lost only on the edges
 * that are rounded.
 */
import { getManifoldRuntime } from "@/lib/editorMeshCore";
import { weldTriangles } from "@/lib/meshRepair";

export type MeshRoundMode = "outside" | "inside" | "both";

/** The most voxels the grid may have: about 7 million (a 190³ cube), a few hundred MB at most. */
const MAX_VOXELS = 7_000_000;

/** Squared Euclidean distance transform along one line (Felzenszwalb & Huttenlocher). */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q += 1) {
    if (f[q] === Infinity && f[v[k]] === Infinity) continue;
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k -= 1;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  // When every entry is infinite, v[0] = 0 still points at an infinite one: the result stays infinite.
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1] < q) k += 1;
    const dq = q - v[k];
    d[q] = f[v[k]] === Infinity ? Infinity : dq * dq + f[v[k]];
  }
}

/** Squared distance (in voxels) from every voxel to the nearest voxel where `target` is set. */
export function squaredDistanceTo(target: Uint8Array, nx: number, ny: number, nz: number): Float64Array {
  const out = new Float64Array(nx * ny * nz);
  for (let i = 0; i < out.length; i += 1) out[i] = target[i] ? 0 : Infinity;
  const longest = Math.max(nx, ny, nz);
  const f = new Float64Array(longest);
  const d = new Float64Array(longest);
  const v = new Int32Array(longest);
  const zz = new Float64Array(longest + 1);
  const index = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
  // Along x, then y, then z.
  for (let z = 0; z < nz; z += 1) for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) f[x] = out[index(x, y, z)];
    edt1d(f, nx, d, v, zz);
    for (let x = 0; x < nx; x += 1) out[index(x, y, z)] = d[x];
  }
  for (let z = 0; z < nz; z += 1) for (let x = 0; x < nx; x += 1) {
    for (let y = 0; y < ny; y += 1) f[y] = out[index(x, y, z)];
    edt1d(f, ny, d, v, zz);
    for (let y = 0; y < ny; y += 1) out[index(x, y, z)] = d[y];
  }
  for (let y = 0; y < ny; y += 1) for (let x = 0; x < nx; x += 1) {
    for (let z = 0; z < nz; z += 1) f[z] = out[index(x, y, z)];
    edt1d(f, nz, d, v, zz);
    for (let z = 0; z < nz; z += 1) out[index(x, y, z)] = d[z];
  }
  return out;
}

type Grid = { nx: number; ny: number; nz: number; h: number; origin: [number, number, number] };

/** Which voxel centres lie inside the closed triangle mesh: rays along z, counting crossings. */
export function voxelise(positions: ArrayLike<number>, grid: Grid): Uint8Array {
  const { nx, ny, nz, h, origin } = grid;
  const crossings: number[][] = Array.from({ length: nx * ny }, () => []);
  for (let t = 0; t + 8 < positions.length; t += 9) {
    const ax = positions[t], ay = positions[t + 1], az = positions[t + 2];
    const bx = positions[t + 3], by = positions[t + 4], bz = positions[t + 5];
    const cx = positions[t + 6], cy = positions[t + 7], cz = positions[t + 8];
    const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(det) < 1e-12) continue; // seen edge-on from above: no crossing
    const x0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - origin[0]) / h - 0.5));
    const x1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - origin[0]) / h - 0.5));
    const y0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - origin[1]) / h - 0.5));
    const y1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - origin[1]) / h - 0.5));
    for (let yi = y0; yi <= y1; yi += 1) {
      // A tiny shift keeps rays off shared edges and vertices, so no crossing counts twice.
      const py = origin[1] + (yi + 0.5) * h + 1.3e-7;
      for (let xi = x0; xi <= x1; xi += 1) {
        const px = origin[0] + (xi + 0.5) * h + 0.7e-7;
        const u = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / det;
        const w = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / det;
        const s = 1 - u - w;
        if (u < 0 || w < 0 || s < 0) continue;
        crossings[yi * nx + xi].push(u * az + w * bz + s * cz);
      }
    }
  }
  const inside = new Uint8Array(nx * ny * nz);
  for (let yi = 0; yi < ny; yi += 1) for (let xi = 0; xi < nx; xi += 1) {
    const list = crossings[yi * nx + xi];
    if (list.length < 2) continue;
    list.sort((a, b) => a - b);
    for (let k = 0; k + 1 < list.length; k += 2) {
      const z0 = Math.max(0, Math.ceil((list[k] - origin[2]) / h - 0.5));
      const z1 = Math.min(nz - 1, Math.floor((list[k + 1] - origin[2]) / h - 0.5));
      for (let zi = z0; zi <= z1; zi += 1) inside[(zi * ny + yi) * nx + xi] = 1;
    }
  }
  return inside;
}

/** The grid for a part: the radius / 3, coarser when the part is big. Null if the radius is too small for it. */
export function roundingGrid(positions: ArrayLike<number>, radius: number): (Grid & { coarse: boolean }) | null {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
  }
  if (!Number.isFinite(minX) || radius <= 0) return null;
  const wanted = radius / 3;
  const pad = radius + 2 * wanted;
  const size = [maxX - minX + 2 * pad, maxY - minY + 2 * pad, maxZ - minZ + 2 * pad];
  const fromBudget = Math.cbrt((size[0] * size[1] * size[2]) / MAX_VOXELS);
  const h = Math.max(wanted, fromBudget);
  // A radius under a voxel and a half would not round anything visible.
  if (radius < 1.5 * h) return null;
  const padded = radius + 2 * h;
  const origin: [number, number, number] = [minX - padded, minY - padded, minZ - padded];
  return {
    nx: Math.ceil((maxX - minX + 2 * padded) / h),
    ny: Math.ceil((maxY - minY + 2 * padded) / h),
    nz: Math.ceil((maxZ - minZ + 2 * padded) / h),
    h,
    origin,
    coarse: h > wanted * 1.01,
  };
}

/** The smallest radius that rounds visibly on this part, in mm. */
export function smallestRoundingRadius(positions: ArrayLike<number>) {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const volume = (maxX - minX) * (maxY - minY) * (maxZ - minZ);
  return Math.max(0.2, 1.5 * Math.cbrt(volume / MAX_VOXELS) * 1.1);
}

/** Trilinear sample of a voxel field (values at voxel centres), in world coordinates. */
function sampler(field: Float32Array, grid: Grid, outside: number) {
  const { nx, ny, nz, h, origin } = grid;
  return (p: [number, number, number]) => {
    const gx = (p[0] - origin[0]) / h - 0.5;
    const gy = (p[1] - origin[1]) / h - 0.5;
    const gz = (p[2] - origin[2]) / h - 0.5;
    const x0 = Math.floor(gx), y0 = Math.floor(gy), z0 = Math.floor(gz);
    if (x0 < 0 || y0 < 0 || z0 < 0 || x0 + 1 >= nx || y0 + 1 >= ny || z0 + 1 >= nz) return outside;
    const fx = gx - x0, fy = gy - y0, fz = gz - z0;
    const at = (x: number, y: number, z: number) => field[(z * ny + y) * nx + x];
    const c00 = at(x0, y0, z0) * (1 - fx) + at(x0 + 1, y0, z0) * fx;
    const c10 = at(x0, y0 + 1, z0) * (1 - fx) + at(x0 + 1, y0 + 1, z0) * fx;
    const c01 = at(x0, y0, z0 + 1) * (1 - fx) + at(x0 + 1, y0, z0 + 1) * fx;
    const c11 = at(x0, y0 + 1, z0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1, z0 + 1) * fx;
    return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
  };
}

/** Opening: shrink by r, grow back by r. Positive inside, in mm. */
function openingField(inside: Uint8Array, grid: Grid, radius: number) {
  const { nx, ny, nz, h } = grid;
  const r = radius / h;
  const outsideMask = new Uint8Array(inside.length);
  for (let i = 0; i < inside.length; i += 1) outsideMask[i] = inside[i] ? 0 : 1;
  const toOutside = squaredDistanceTo(outsideMask, nx, ny, nz);
  const eroded = new Uint8Array(inside.length);
  for (let i = 0; i < inside.length; i += 1) eroded[i] = inside[i] && toOutside[i] > r * r ? 1 : 0;
  const toEroded = squaredDistanceTo(eroded, nx, ny, nz);
  const field = new Float32Array(inside.length);
  for (let i = 0; i < inside.length; i += 1) field[i] = (r - Math.sqrt(toEroded[i])) * h;
  return field;
}

/** Closing: grow by r, shrink back by r. Positive inside, in mm. */
function closingField(inside: Uint8Array, grid: Grid, radius: number) {
  const { nx, ny, nz, h } = grid;
  const r = radius / h;
  const toInside = squaredDistanceTo(inside, nx, ny, nz);
  const notDilated = new Uint8Array(inside.length);
  for (let i = 0; i < inside.length; i += 1) notDilated[i] = toInside[i] <= r * r ? 0 : 1;
  const toOutside = squaredDistanceTo(notDilated, nx, ny, nz);
  const field = new Float32Array(inside.length);
  for (let i = 0; i < inside.length; i += 1) field[i] = (Math.sqrt(toOutside[i]) - r) * h;
  return field;
}

export type MeshRoundResult = { positions: number[]; voxel: number; coarse: boolean };

/**
 * Rounds the edges of a closed triangle mesh (world positions, 9 numbers a triangle). Throws when
 * the mesh is not a closed solid or the radius is too small for the part's size.
 */
export async function roundMeshPositions(positions: ArrayLike<number>, radius: number, mode: MeshRoundMode = "outside"): Promise<MeshRoundResult> {
  const grid = roundingGrid(positions, radius);
  if (!grid) throw new Error(`The radius is too small for a part this size - try at least ${smallestRoundingRadius(positions).toFixed(1)} mm`);
  const runtime = await getManifoldRuntime();
  const welded = weldTriangles(positions);
  const original = new runtime.Manifold(new runtime.Mesh({ numProp: 3, vertProperties: new Float32Array(welded.points.flat()), triVerts: new Uint32Array(welded.triangles.flat()) }));
  const made: Array<{ delete(): void }> = [original];
  try {
    if (original.status() !== "NoError" || original.volume() <= 0) throw new Error("This part is not a closed solid - use Make solid first");
    const inside = voxelise(positions, grid);
    const bounds = {
      min: [grid.origin[0], grid.origin[1], grid.origin[2]] as [number, number, number],
      max: [grid.origin[0] + grid.nx * grid.h, grid.origin[1] + grid.ny * grid.h, grid.origin[2] + grid.nz * grid.h] as [number, number, number],
    };
    // The level set is shifted by most of a voxel past the original faces, so the faces that are not
    // rounded come from the original exactly and only the edges come from the grid.
    const margin = grid.h * 0.75;
    let result = original;
    if (mode === "outside" || mode === "both") {
      const opened = runtime.Manifold.levelSet(sampler(openingField(inside, grid, radius), grid, -radius), bounds, grid.h, -margin);
      made.push(opened);
      result = runtime.Manifold.intersection(result, opened);
      made.push(result);
    }
    if (mode === "inside" || mode === "both") {
      const solid = mode === "both" ? voxelise(meshPositions(result), grid) : inside;
      const closed = runtime.Manifold.levelSet(sampler(closingField(solid, grid, radius), grid, -radius), bounds, grid.h, margin);
      made.push(closed);
      result = runtime.Manifold.union(result, closed);
      made.push(result);
    }
    if (result.status() !== "NoError" || result.isEmpty()) throw new Error("Rounding did not leave a closed solid - try a smaller radius");
    return { positions: meshPositions(result), voxel: grid.h, coarse: grid.coarse };
  } finally {
    made.forEach((item) => {
      try {
        item.delete();
      } catch {
        // already gone
      }
    });
  }
}

/** A Manifold's triangles as world positions, 9 numbers a triangle. */
function meshPositions(solid: { getMesh(): { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array } }): number[] {
  const mesh = solid.getMesh();
  const out = new Array<number>(mesh.triVerts.length * 3);
  for (let i = 0; i < mesh.triVerts.length; i += 1) {
    const base = mesh.triVerts[i] * mesh.numProp;
    out[i * 3] = mesh.vertProperties[base];
    out[i * 3 + 1] = mesh.vertProperties[base + 1];
    out[i * 3 + 2] = mesh.vertProperties[base + 2];
  }
  return out;
}
