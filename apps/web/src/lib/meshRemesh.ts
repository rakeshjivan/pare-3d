/**
 * Build 69: Remesh, Offset and Thicken - a part rebuilt from a distance field on a voxel grid.
 *
 *   - Remesh: the same closed solid with even triangles about the grid size apart (a scan with
 *     slivers and spikes made clean for further work).
 *   - Offset: a closed solid grown (or shrunk) by a distance all round.
 *   - Thicken: any surface, also an open scan, turned into a closed shell of a thickness, centred
 *     on the surface.
 *
 * The distance to the surface is worked out exactly near it (closest point on each triangle), so
 * the new surface follows the part to well under a voxel; inside or out comes from voxelising
 * along z, which needs a closed solid (Remesh and Offset). Manifold's level set makes the mesh.
 */
import { getManifoldRuntime } from "@/lib/editorMeshCore";
import { sampler, voxelise, type Grid } from "@/lib/meshRound";

export type RemeshMode = "remesh" | "offset" | "thicken";
export type RemeshOptions = { mode: RemeshMode; /** grid size, mm */ detail: number; /** Offset distance or Thicken thickness, mm */ amount: number };
export type RemeshResult = { positions: number[]; voxel: number; coarse: boolean; triangles: number };

/** The most voxels a grid may have (as Round a mesh). */
const MAX_VOXELS = 7_000_000;

function boundsOf(positions: ArrayLike<number>) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < positions.length; i += 3) for (let k = 0; k < 3; k += 1) {
    if (positions[i + k] < min[k]) min[k] = positions[i + k];
    if (positions[i + k] > max[k]) max[k] = positions[i + k];
  }
  return { min, max };
}

/** A sensible grid size for a part: fine enough to keep its shape, about 160 voxels on its longest side. */
export function defaultRemeshDetail(positions: ArrayLike<number>): number {
  const { min, max } = boundsOf(positions);
  const longest = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  if (!Number.isFinite(longest) || longest <= 0) return 0.5;
  return Math.max(0.05, Math.round((longest / 160) * 100) / 100);
}

/** The grid round a part, padded by `pad` mm, no finer than `detail` and no bigger than the budget. */
export function remeshGrid(positions: ArrayLike<number>, detail: number, pad: number): Grid & { coarse: boolean } {
  const { min, max } = boundsOf(positions);
  const size = [0, 1, 2].map((k) => max[k] - min[k] + 2 * pad);
  const fromBudget = Math.cbrt((size[0] + 4 * detail) * (size[1] + 4 * detail) * (size[2] + 4 * detail) / MAX_VOXELS);
  const h = Math.max(detail, fromBudget);
  const padded = pad + 2 * h;
  return {
    nx: Math.ceil((max[0] - min[0] + 2 * padded) / h),
    ny: Math.ceil((max[1] - min[1] + 2 * padded) / h),
    nz: Math.ceil((max[2] - min[2] + 2 * padded) / h),
    h,
    origin: [min[0] - padded, min[1] - padded, min[2] - padded],
    coarse: h > detail * 1.01,
  };
}

/** Squared distance from p to triangle abc (Ericson, Real-Time Collision Detection 5.1.5). */
export function pointTriangleDistance2(px: number, py: number, pz: number, t: ArrayLike<number>, o: number): number {
  const ax = t[o], ay = t[o + 1], az = t[o + 2];
  const bx = t[o + 3], by = t[o + 4], bz = t[o + 5];
  const cx = t[o + 6], cy = t[o + 7], cz = t[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const at = (x: number, y: number, z: number) => (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
  if (d1 <= 0 && d2 <= 0) return at(ax, ay, az);
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return at(bx, by, bz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return at(ax + abx * v, ay + aby * v, az + abz * v); }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return at(cx, cy, cz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return at(ax + acx * w, ay + acy * w, az + acz * w); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return at(bx + (cx - bx) * w, by + (cy - by) * w, bz + (cz - bz) * w);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return at(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w);
}

/** Distance (mm) from every voxel centre to the surface, exact up to `band` mm and `band` beyond it. */
export function surfaceDistance(positions: ArrayLike<number>, grid: Grid, band: number): Float32Array {
  const { nx, ny, nz, h, origin } = grid;
  const out = new Float32Array(nx * ny * nz).fill(band * band);
  for (let o = 0; o + 8 < positions.length; o += 9) {
    let lo0 = Infinity, lo1 = Infinity, lo2 = Infinity, hi0 = -Infinity, hi1 = -Infinity, hi2 = -Infinity;
    for (let k = 0; k < 9; k += 3) {
      lo0 = Math.min(lo0, positions[o + k]); hi0 = Math.max(hi0, positions[o + k]);
      lo1 = Math.min(lo1, positions[o + k + 1]); hi1 = Math.max(hi1, positions[o + k + 1]);
      lo2 = Math.min(lo2, positions[o + k + 2]); hi2 = Math.max(hi2, positions[o + k + 2]);
    }
    const x0 = Math.max(0, Math.ceil((lo0 - band - origin[0]) / h - 0.5)), x1 = Math.min(nx - 1, Math.floor((hi0 + band - origin[0]) / h - 0.5));
    const y0 = Math.max(0, Math.ceil((lo1 - band - origin[1]) / h - 0.5)), y1 = Math.min(ny - 1, Math.floor((hi1 + band - origin[1]) / h - 0.5));
    const z0 = Math.max(0, Math.ceil((lo2 - band - origin[2]) / h - 0.5)), z1 = Math.min(nz - 1, Math.floor((hi2 + band - origin[2]) / h - 0.5));
    for (let z = z0; z <= z1; z += 1) {
      const pz = origin[2] + (z + 0.5) * h;
      for (let y = y0; y <= y1; y += 1) {
        const py = origin[1] + (y + 0.5) * h;
        const row = (z * ny + y) * nx;
        for (let x = x0; x <= x1; x += 1) {
          const d2 = pointTriangleDistance2(origin[0] + (x + 0.5) * h, py, pz, positions, o);
          if (d2 < out[row + x]) out[row + x] = d2;
        }
      }
    }
  }
  for (let i = 0; i < out.length; i += 1) out[i] = Math.sqrt(out[i]);
  return out;
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

/**
 * Build 73: Remesh, Offset and Thicken on the surface itself (the live Sculpt engine), so a scan keeps
 * its detail: Remesh evens the triangles to about `detail` mm while pulling every corner back onto the
 * part's own surface; Offset moves the surface along its (smoothed) normals and evens it again;
 * Thicken makes a shell centred on the surface, its rims joined. The voxel version (below) is kept.
 */
export async function remeshPositions(positions: ArrayLike<number>, options: RemeshOptions): Promise<RemeshResult> {
  const { mode } = options;
  const amount = mode === "remesh" ? 0 : options.amount;
  if (mode === "thicken" && !(amount > 0)) throw new Error("Choose a thickness above 0 mm");
  if (mode === "offset" && amount === 0) throw new Error("Choose a distance other than 0 mm");
  const { LiveMesh, offsetLive, remeshLive, thickenSoup } = await import("@/lib/liveSculpt");
  const detail = Math.max(0.03, options.detail);
  const mesh = LiveMesh.fromSoup(positions);
  if (!mesh.triangleCount()) throw new Error("This part has no surface to work on");
  let out: Float32Array;
  if (mode === "remesh") {
    remeshLive(mesh, detail, 5);
    out = mesh.soup();
  } else if (mode === "offset") {
    // Even first at the detail, so a long sliver does not tear when its corners move apart.
    remeshLive(mesh, detail, 2);
    const before = signedVolume(mesh.soup());
    offsetLive(mesh, amount);
    out = mesh.soup();
    // Shrunk through itself, a closed part turns inside out (its volume changes sign) or to nothing.
    const after = signedVolume(out);
    if (amount < 0 && Math.abs(before) > 1e-6 && (Math.sign(after) !== Math.sign(before) || Math.abs(after) < Math.abs(before) * 0.02)) {
      throw new Error("Nothing is left after shrinking by that much - try a smaller distance");
    }
    remeshLive(mesh, detail, 2);
    out = mesh.soup();
  } else {
    remeshLive(mesh, Math.min(detail, amount), 2);
    out = thickenSoup(mesh, amount);
  }
  mesh.dispose();
  return { positions: Array.from(out), voxel: detail, coarse: false, triangles: out.length / 9 };
}

function signedVolume(p: ArrayLike<number>) {
  let v = 0;
  for (let i = 0; i + 8 < p.length; i += 9) v += (p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6])) / 6;
  return v;
}

/** Rebuilds a part (world positions) as Remesh, Offset or Thicken say, on a voxel grid (build 69). Throws with a message for the person. */
export async function voxelRemeshPositions(positions: ArrayLike<number>, options: RemeshOptions): Promise<RemeshResult> {
  const { mode } = options;
  const amount = mode === "remesh" ? 0 : options.amount;
  if (mode === "thicken" && !(amount > 0)) throw new Error("Choose a thickness above 0 mm");
  if (mode === "offset" && amount === 0) throw new Error("Choose a distance other than 0 mm");
  const reach = mode === "thicken" ? amount / 2 : Math.max(0, amount);
  // Never coarser than a third of the thickness, or the shell would come out with holes.
  const detail = Math.max(0.03, mode === "thicken" ? Math.min(options.detail, amount / 3) : options.detail);
  const grid = remeshGrid(positions, detail, reach);
  if (mode === "thicken" && grid.h > amount / 1.5) throw new Error(`This part is too big for a ${amount.toFixed(1)} mm shell - try at least ${(grid.h * 1.5).toFixed(1)} mm`);
  if (mode === "offset" && Math.abs(amount) < grid.h / 4) throw new Error(`The distance is too small for a part this size - try at least ${(grid.h / 4).toFixed(2)} mm`);
  const band = (mode === "thicken" ? amount / 2 : Math.abs(amount)) + 2 * grid.h;
  const distance = surfaceDistance(positions, grid, band);
  const field = new Float32Array(distance.length);
  if (mode === "thicken") {
    for (let i = 0; i < field.length; i += 1) field[i] = amount / 2 - distance[i];
  } else {
    const inside = voxelise(positions, grid);
    let any = 0;
    for (let i = 0; i < inside.length; i += 1) any += inside[i];
    if (!any) throw new Error("This part is not a closed solid - use Make solid or Thicken first");
    for (let i = 0; i < field.length; i += 1) field[i] = (inside[i] ? distance[i] : -distance[i]) + amount;
  }
  const runtime = await getManifoldRuntime();
  const bounds = {
    min: [grid.origin[0], grid.origin[1], grid.origin[2]] as [number, number, number],
    max: [grid.origin[0] + grid.nx * grid.h, grid.origin[1] + grid.ny * grid.h, grid.origin[2] + grid.nz * grid.h] as [number, number, number],
  };
  const solid = runtime.Manifold.levelSet(sampler(field, grid, -band), bounds, grid.h, 0);
  try {
    if (solid.status() !== "NoError" || solid.isEmpty()) throw new Error(mode === "offset" && amount < 0 ? "Nothing is left after shrinking by that much - try a smaller distance" : "This did not make a closed solid - try a finer detail");
    const out = meshPositions(solid);
    return { positions: out, voxel: grid.h, coarse: grid.coarse, triangles: out.length / 9 };
  } finally {
    try { solid.delete(); } catch { /* already gone */ }
  }
}
