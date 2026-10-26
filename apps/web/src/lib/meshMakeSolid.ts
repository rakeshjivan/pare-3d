/**
 * Build 77: Make Solid - a closed, sound solid from any mesh (an open scan, overlapping shells, holes,
 * a part turned inside out in places), at a chosen detail, as Meshmixer's Edit > Make Solid.
 *
 * Inside or outside is decided on a voxel grid of spacing `detail` by six votes per voxel: rays along
 * +x, -x, +y, -y, +z and -z each count the signed crossings (the generalised winding number along that
 * ray, Jacobson et al. 2013 restricted to axis rays) from the far end of the grid to the voxel. On a
 * closed mesh all six agree; where the mesh is open a ray that escapes through the opening says outside
 * and the others say inside, and the majority (four or more) wins - an open bowl closes over its rim,
 * an open scan closes across its back. Signed counts (not parity) keep overlapping shells inside (a
 * point in two shells has winding 2), and the magnitude is used so a shell facing inwards still counts.
 *
 * The surface is drawn at the zero of a signed distance: near the mesh the exact distance to its
 * nearest triangle (so a closed input keeps its shape and volume, not a staircase), elsewhere the
 * distance between inside and outside voxels (Felzenszwalb-Huttenlocher, as dentalBase's hollowing),
 * with the sign from the vote. manifold's levelSet (marching tetrahedra) turns it into a mesh, which is
 * simplified to within detail / 4.
 */
import type { ManifoldToplevel } from "manifold-3d";
import { sampler, squaredDistanceTo, type Grid } from "@/lib/meshRound";

type ManifoldRuntime = ManifoldToplevel;
type ManifoldSolid = InstanceType<ManifoldToplevel["Manifold"]>;

/** The most voxels Make Solid samples (about 14 bytes each while it runs); past it the detail is coarsened. */
export const MAX_SOLID_VOXELS = 6_000_000;

export type MakeSolidOptions = {
  /** Voxel spacing in mm: the smallest feature kept is about this size. */
  detail: number;
  /** Grow (positive) or shrink (negative) the solid by this many mm. */
  offset?: number;
  /** A surface with nothing inside it (a sheet) is kept as a wall at least this thick (mm); 0 (default) drops it. */
  minThickness?: number;
  /** Cap on voxels (default MAX_SOLID_VOXELS). */
  maxVoxels?: number;
};

export type MakeSolidResult = {
  /** The solid as a triangle soup (9 numbers a triangle), facing outwards. */
  soup: Float32Array;
  /** The manifold solid itself; the caller owns it and must delete() it. */
  solid: ManifoldSolid;
  /** The detail actually used (larger than asked when the grid would have passed the voxel cap). */
  detail: number;
  /** Grid size in voxels. */
  voxels: number;
  /** Separate bodies in the result. */
  bodies: number;
};

/** Signed crossings along one axis: for each grid line (the other two axes), the depth and sign of every crossing. */
function axisCrossings(soup: ArrayLike<number>, grid: Grid, axis: 0 | 1 | 2) {
  const { h, origin } = grid;
  const dims = [grid.nx, grid.ny, grid.nz];
  // u, v: the line's two coordinates; w: along it.
  const u = (axis + 1) % 3, v = (axis + 2) % 3, w = axis;
  const nu = dims[u], nv = dims[v];
  const counts = new Int32Array(nu * nv + 1);
  const visit = (record: (line: number, depth: number, sign: number) => void) => {
    for (let t = 0; t + 8 < soup.length; t += 9) {
      const au = soup[t + u], av = soup[t + v], aw = soup[t + w];
      const bu = soup[t + 3 + u], bv = soup[t + 3 + v], bw = soup[t + 3 + w];
      const cu = soup[t + 6 + u], cv = soup[t + 6 + v], cw = soup[t + 6 + w];
      const det = (bu - au) * (cv - av) - (cu - au) * (bv - av);
      if (Math.abs(det) < 1e-14) continue; // edge-on to the lines
      const sign = det > 0 ? 1 : -1; // the triangle's normal along +w
      const u0 = Math.max(0, Math.ceil((Math.min(au, bu, cu) - origin[u]) / h - 0.5));
      const u1 = Math.min(nu - 1, Math.floor((Math.max(au, bu, cu) - origin[u]) / h - 0.5));
      const v0 = Math.max(0, Math.ceil((Math.min(av, bv, cv) - origin[v]) / h - 0.5));
      const v1 = Math.min(nv - 1, Math.floor((Math.max(av, bv, cv) - origin[v]) / h - 0.5));
      for (let vi = v0; vi <= v1; vi += 1) {
        // A tiny shift keeps lines off shared edges and corners, so no crossing counts twice or not at all.
        const pv = origin[v] + (vi + 0.5) * h + 1.3e-7;
        for (let ui = u0; ui <= u1; ui += 1) {
          const pu = origin[u] + (ui + 0.5) * h + 0.7e-7;
          const l1 = ((bu - pu) * (cv - pv) - (cu - pu) * (bv - pv)) / det;
          const l2 = ((cu - pu) * (av - pv) - (au - pu) * (cv - pv)) / det;
          const l3 = 1 - l1 - l2;
          if (l1 < 0 || l2 < 0 || l3 < 0) continue;
          record(vi * nu + ui, l1 * aw + l2 * bw + l3 * cw, sign);
        }
      }
    }
  };
  visit((line) => { counts[line + 1] += 1; });
  for (let i = 0; i < nu * nv; i += 1) counts[i + 1] += counts[i];
  const depth = new Float64Array(counts[nu * nv]);
  const sign = new Int8Array(counts[nu * nv]);
  const fill = counts.slice(0, nu * nv);
  visit((line, d, s) => { const at = fill[line]++; depth[at] = d; sign[at] = s; });
  return { start: counts, depth, sign, u, v, w, nu, nv };
}

/** Adds this axis's two votes (from each end) to `votes`. */
function voteAlong(soup: ArrayLike<number>, grid: Grid, axis: 0 | 1 | 2, votes: Uint8Array) {
  const { nx, ny } = grid;
  const dims = [grid.nx, grid.ny, grid.nz];
  const { start, depth, sign, u, v, w, nu, nv } = axisCrossings(soup, grid, axis);
  const nw = dims[w];
  const stride = [1, nx, nx * ny];
  const order: number[] = [];
  for (let vi = 0; vi < nv; vi += 1) for (let ui = 0; ui < nu; ui += 1) {
    const line = vi * nu + ui, s = start[line], e = start[line + 1];
    if (s === e) continue;
    order.length = 0;
    for (let k = s; k < e; k += 1) order.push(k);
    order.sort((a, b) => depth[a] - depth[b]);
    let total = 0;
    for (const k of order) total += sign[k];
    const base = ui * stride[u] + vi * stride[v];
    // Sweep along the line: `before` is the signed sum of the crossings passed.
    let k = 0, before = 0;
    for (let wi = 0; wi < nw; wi += 1) {
      const at = grid.origin[w] + (wi + 0.5) * grid.h;
      while (k < order.length && depth[order[k]] < at) { before += sign[order[k]]; k += 1; }
      // From the low end the winding is -before (entering a solid crosses a face whose normal points
      // back at the ray); from the high end it is what is still to come, total - before.
      const fromLow = Math.min(1, Math.abs(before)), fromHigh = Math.min(1, Math.abs(total - before));
      votes[base + wi * stride[w]] += fromLow + fromHigh;
    }
  }
}

/** For each voxel within `band` voxels of a triangle, its exact distance (mm) to the nearest triangle; Infinity elsewhere. */
function nearDistance(soup: ArrayLike<number>, grid: Grid, band: number) {
  const { nx, ny, nz, h, origin } = grid;
  const out = new Float32Array(nx * ny * nz).fill(Infinity);
  const reach = band * h;
  for (let t = 0; t + 8 < soup.length; t += 9) {
    const ax = soup[t], ay = soup[t + 1], az = soup[t + 2];
    const bx = soup[t + 3], by = soup[t + 4], bz = soup[t + 5];
    const cx = soup[t + 6], cy = soup[t + 7], cz = soup[t + 8];
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - reach - origin[0]) / h - 0.5)), x1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) + reach - origin[0]) / h - 0.5));
    const y0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - reach - origin[1]) / h - 0.5)), y1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) + reach - origin[1]) / h - 0.5));
    const z0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - reach - origin[2]) / h - 0.5)), z1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) + reach - origin[2]) / h - 0.5));
    const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
    for (let zi = z0; zi <= z1; zi += 1) for (let yi = y0; yi <= y1; yi += 1) for (let xi = x0; xi <= x1; xi += 1) {
      const px = origin[0] + (xi + 0.5) * h, py = origin[1] + (yi + 0.5) * h, pz = origin[2] + (zi + 0.5) * h;
      // Closest point on the triangle (Ericson, Real-Time Collision Detection 5.1.5).
      const apx = px - ax, apy = py - ay, apz = pz - az;
      const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
      let qx: number, qy: number, qz: number;
      if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
      else {
        const bpx = px - bx, bpy = py - by, bpz = pz - bz;
        const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
        if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; }
        else if (vc <= 0 && d1 >= 0 && d3 <= 0) { const s = d1 / (d1 - d3); qx = ax + abx * s; qy = ay + aby * s; qz = az + abz * s; }
        else if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; }
        else if (vb <= 0 && d2 >= 0 && d6 <= 0) { const s = d2 / (d2 - d6); qx = ax + acx * s; qy = ay + acy * s; qz = az + acz * s; }
        else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const s = (d4 - d3) / (d4 - d3 + (d5 - d6)); qx = bx + (cx - bx) * s; qy = by + (cy - by) * s; qz = bz + (cz - bz) * s; }
        else { const den = 1 / (va + vb + vc), s = vb * den, r = vc * den; qx = ax + abx * s + acx * r; qy = ay + aby * s + acy * r; qz = az + abz * s + acz * r; }
      }
      const d = Math.sqrt((qx - px) ** 2 + (qy - py) ** 2 + (qz - pz) ** 2);
      const i = (zi * ny + yi) * nx + xi;
      if (d < out[i]) out[i] = d;
    }
  }
  return out;
}

/**
 * A watertight solid from any triangle soup at about `detail` mm (see the file's note). `runtime` is the
 * loaded manifold module (getManifoldRuntime() in the app). Throws when the soup has no triangles or
 * nothing inside it at all (a lone sheet with minThickness 0).
 */
export function makeSolid(soup: ArrayLike<number>, options: MakeSolidOptions, runtime: ManifoldRuntime): MakeSolidResult {
  if (!(options.detail > 0)) throw new Error("Make Solid needs a detail above 0 mm");
  if (soup.length < 9) throw new Error("There is nothing to make solid");
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i + 2 < soup.length; i += 3) {
    const x = soup[i], y = soup[i + 1], z = soup[i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new Error("The mesh has a corner that is not a number");
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const offset = options.offset ?? 0;
  const half = Math.max(0, (options.minThickness ?? 0) / 2);
  const grow = Math.max(0, offset) + half;
  const cap = options.maxVoxels ?? MAX_SOLID_VOXELS;
  // Grid: the box, padded by the growth and two voxels; coarsened until under the cap.
  let h = options.detail;
  const size = (hh: number) => {
    const pad = grow + 2 * hh;
    return [Math.ceil((maxX - minX + 2 * pad) / hh), Math.ceil((maxY - minY + 2 * pad) / hh), Math.ceil((maxZ - minZ + 2 * pad) / hh)];
  };
  for (let guard = 0; guard < 60; guard += 1) {
    const [a, b, c] = size(h);
    if (a * b * c <= cap) break;
    h *= Math.max(1.02, Math.cbrt((a * b * c) / cap));
  }
  const [nx, ny, nz] = size(h);
  const pad = grow + 2 * h;
  const grid: Grid = { nx, ny, nz, h, origin: [minX - pad, minY - pad, minZ - pad] };
  const total = nx * ny * nz;
  // Six votes a voxel; four or more is inside.
  const votes = new Uint8Array(total);
  voteAlong(soup, grid, 0, votes);
  voteAlong(soup, grid, 1, votes);
  voteAlong(soup, grid, 2, votes);
  const inside = new Uint8Array(total);
  const outside = new Uint8Array(total);
  let any = false;
  for (let i = 0; i < total; i += 1) { if (votes[i] >= 4) { inside[i] = 1; any = true; } else outside[i] = 1; }
  if (!any && half <= 0) throw new Error("The mesh encloses nothing at this detail - give it a minimum thickness or a finer detail");
  // Distances (mm): between inside and outside voxels everywhere, exact to the surface near it.
  const toOutside = squaredDistanceTo(outside, nx, ny, nz);
  const toInside = squaredDistanceTo(inside, nx, ny, nz);
  const near = nearDistance(soup, grid, 1.5 + half / h);
  const field = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    // A voxel centre stands half a voxel from the faces between it and its other-side neighbour.
    const coarse = inside[i] ? (Math.sqrt(toOutside[i]) - 0.5) * h : -(Math.sqrt(toInside[i]) - 0.5) * h;
    let d = coarse;
    // The exact distance where it is nearer than the voxel estimate (an open rim's cap has no triangle: the coarse one stands).
    if (near[i] < Math.abs(coarse)) d = inside[i] ? near[i] : -near[i];
    d += offset;
    if (half > 0 && near[i] !== Infinity) d = Math.max(d, half - near[i]);
    field[i] = d;
  }
  // levelSet's own lattice is shifted off the voxel grid by an odd fraction of a voxel: a lattice point
  // landing exactly on a face (round CAD sizes, value 0) is nudged by the mesher and moves that face.
  const shift = 0.2371 * h;
  const bounds = {
    min: [grid.origin[0] + shift, grid.origin[1] + shift, grid.origin[2] + shift] as [number, number, number],
    max: [grid.origin[0] + nx * h - h + shift, grid.origin[1] + ny * h - h + shift, grid.origin[2] + nz * h - h + shift] as [number, number, number],
  };
  const raw = runtime.Manifold.levelSet(sampler(field, grid, -h), bounds, h, 0);
  const solid = raw.simplify(h / 4);
  raw.delete();
  if (solid.status() !== "NoError" || solid.isEmpty()) {
    const status = solid.status();
    solid.delete();
    throw new Error(`Make Solid did not come out closed (${status})`);
  }
  const mesh = solid.getMesh();
  const out = new Float32Array(mesh.triVerts.length * 3);
  const np = mesh.numProp;
  for (let i = 0; i < mesh.triVerts.length; i += 1) {
    const v = mesh.triVerts[i] * np;
    out[i * 3] = mesh.vertProperties[v]; out[i * 3 + 1] = mesh.vertProperties[v + 1]; out[i * 3 + 2] = mesh.vertProperties[v + 2];
  }
  const pieces = solid.decompose();
  const bodies = pieces.length;
  pieces.forEach((piece) => piece.delete());
  return { soup: out, solid, detail: h, voxels: total, bodies };
}
