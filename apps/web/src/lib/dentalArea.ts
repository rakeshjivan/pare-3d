/**
 * Fork (build 53): Dental Studio's tooth area, as Medit's model builder designates it. Pare 3D picks
 * the teeth on its own; the person can paint more on or off, or lasso it, before the model is made.
 * The model keeps the area and a band of gum round it (the Expand setting), and the cut follows the
 * band's edge - so what is protected is exactly what the person approved.
 */
import { archFrame, cleanScan, marginUp } from "@/lib/dentalArch";
import { CROWN_REACH, TIP_CEILING, TIP_FLOOR, TIP_LONELY, toothZone } from "@/lib/dentalBase";
import { applyMatrix, cloneMesh, PointGrid } from "@/lib/dentalMesh";

export type TrimPointLike = [number, number];

/**
 * Build 76: how far below its cusp tips a crown counts as tooth for Trim's warning, mm. Crowns show
 * 7 to 11 mm above the gum; within 6 mm of the tips is crown on every tooth, and the gum below it,
 * the flaps beside it and the palate are not.
 */
export const CROWN_DEPTH = 6;

/**
 * The teeth Pare 3D finds on a scan (Z-up soup): one flag per triangle.
 * `crownsOut` (build 76), one flag per triangle too: the crowns alone - CROWN_REACH from their tips
 * and CROWN_DEPTH below them - without the gum the teeth area takes in.
 */
export function autoDentalArea(positions: Float32Array, crownsOut?: Uint8Array): Uint8Array {
  const triangles = Math.floor(positions.length / 9);
  const clean = cleanScan(positions);
  const turned = cloneMesh(clean.mesh);
  applyMatrix(turned, archFrame(clean.mesh, marginUp(clean.mesh, clean.margin)));
  const zone = toothZone(turned, undefined, undefined, undefined, TIP_CEILING);
  const crowns = crownsOut ? toothZone(turned, CROWN_DEPTH, CROWN_REACH, undefined, TIP_CEILING, TIP_FLOOR, TIP_LONELY) : null;
  const grid = new PointGrid(clean.mesh.v, 0.05);
  const area = new Uint8Array(triangles);
  for (let t = 0; t < triangles; t += 1) {
    let inZone = 0, inCrown = 0;
    for (let k = 0; k < 3; k += 1) {
      const i = t * 3 + k;
      const hit = grid.nearest(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      if (hit && hit[1] < 1e-3 && zone[hit[0]]) {
        inZone += 1;
        if (crowns?.[hit[0]]) inCrown += 1;
      }
    }
    if (inZone >= 2) area[t] = 1;
    if (crownsOut && inCrown >= 2 && t < crownsOut.length) crownsOut[t] = 1;
  }
  return area;
}

/**
 * Per triangle of a world soup: where its middle falls on screen (`projected`, x/y pairs of its
 * three corners in page pixels), and whether it faces the camera at `eye`.
 */
export function screenTriangles(world: ArrayLike<number>, projected: Float32Array, eye: [number, number, number]) {
  const triangles = Math.floor(world.length / 9);
  const centre = new Float32Array(triangles * 2);
  const front = new Uint8Array(triangles);
  for (let t = 0; t < triangles; t += 1) {
    const o = t * 9;
    centre[t * 2] = (projected[t * 6] + projected[t * 6 + 2] + projected[t * 6 + 4]) / 3;
    centre[t * 2 + 1] = (projected[t * 6 + 1] + projected[t * 6 + 3] + projected[t * 6 + 5]) / 3;
    const ux = world[o + 3] - world[o], uy = world[o + 4] - world[o + 1], uz = world[o + 5] - world[o + 2];
    const vx = world[o + 6] - world[o], vy = world[o + 7] - world[o + 1], vz = world[o + 8] - world[o + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cx = (world[o] + world[o + 3] + world[o + 6]) / 3, cy = (world[o + 1] + world[o + 4] + world[o + 7]) / 3, cz = (world[o + 2] + world[o + 5] + world[o + 8]) / 3;
    if (nx * (eye[0] - cx) + ny * (eye[1] - cy) + nz * (eye[2] - cz) > 0) front[t] = 1;
  }
  return { centre, front };
}

/** Paints (`add`) or erases the triangles facing the camera within `radius` px of the brush path. */
export function brushArea(area: Uint8Array, centre: Float32Array, front: Uint8Array, path: TrimPointLike[], radius: number, add: boolean): number {
  let changed = 0;
  const r2 = radius * radius;
  for (let t = 0; t < area.length; t += 1) {
    if (!front[t] || Boolean(area[t]) === add) continue;
    const x = centre[t * 2], y = centre[t * 2 + 1];
    for (let k = 0; k < path.length; k += 1) {
      const [ax, ay] = path[k], [bx, by] = path[Math.min(path.length - 1, k + 1)];
      const dx = bx - ax, dy = by - ay;
      const s = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const ex = x - ax - dx * s, ey = y - ay - dy * s;
      if (ex * ex + ey * ey <= r2) { area[t] = add ? 1 : 0; changed += 1; break; }
    }
  }
  return changed;
}

/** Adds or removes the triangles facing the camera whose middle falls inside the closed line. */
export function lassoArea(area: Uint8Array, centre: Float32Array, front: Uint8Array, line: TrimPointLike[], add: boolean): number {
  let changed = 0;
  const n = line.length;
  if (n < 3) return 0;
  for (let t = 0; t < area.length; t += 1) {
    if (!front[t] || Boolean(area[t]) === add) continue;
    const x = centre[t * 2], y = centre[t * 2 + 1];
    let inside = false;
    for (let k = 0, j = n - 1; k < n; j = k, k += 1) {
      const [ax, ay] = line[k], [bx, by] = line[j];
      if ((ay > y) !== (by > y) && x < ax + ((y - ay) / (by - ay)) * (bx - ax)) inside = !inside;
    }
    if (inside) { area[t] = add ? 1 : 0; changed += 1; }
  }
  return changed;
}
