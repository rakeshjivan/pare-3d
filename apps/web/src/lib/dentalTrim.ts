/**
 * Fork (build 48): trimming a scan by hand in Dental Studio. The person draws a line round what to
 * keep (or what to remove) from the view they chose; every triangle whose corners all fall on the
 * wrong side goes - except the teeth, which a trim never takes. Bits the trim leaves floating on
 * their own go too.
 */
import { archFrame, cleanScan, marginUp } from "@/lib/dentalArch";
import { toothZone } from "@/lib/dentalBase";
import { applyMatrix, cloneMesh, PointGrid } from "@/lib/dentalMesh";
import { weldedVertexIds } from "@/lib/meshComponents";

export type DentalTrimMode = "keep" | "remove";

/** `keep`: one flag per triangle of the scan as it was handed in. */
export type DentalTrimResult = { keep: Uint8Array; removed: number; protectedTriangles: number };

/**
 * `positions`: the scan as a triangle soup (Z-up); `inside`: one flag per corner, whether it falls
 * inside the line drawn on screen.
 */
export function trimDentalScan(positions: Float32Array, inside: Uint8Array, mode: DentalTrimMode): DentalTrimResult {
  const triangles = Math.floor(positions.length / 9);
  const corners = triangles * 3;
  // The teeth, found as Dental Studio finds them: on the cleaned scan, teeth up.
  const clean = cleanScan(positions);
  const turned = cloneMesh(clean.mesh);
  applyMatrix(turned, archFrame(clean.mesh, marginUp(clean.mesh, clean.margin)));
  const zone = toothZone(turned);
  const grid = new PointGrid(clean.mesh.v, 0.05);
  const tooth = new Uint8Array(corners);
  for (let i = 0; i < corners; i += 1) {
    const hit = grid.nearest(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    if (hit && hit[1] < 1e-3 && zone[hit[0]]) tooth[i] = 1;
  }
  const keep = new Uint8Array(triangles);
  let protectedTriangles = 0;
  for (let t = 0; t < triangles; t += 1) {
    const a = t * 3, b = a + 1, c = a + 2;
    const wrongSide = mode === "keep" ? !inside[a] && !inside[b] && !inside[c] : inside[a] && inside[b] && inside[c];
    if (!wrongSide) keep[t] = 1;
    else if (tooth[a] || tooth[b] || tooth[c]) { keep[t] = 1; protectedTriangles += 1; }
  }
  // Pieces left on their own: under 1% of what is kept, and no tooth on them.
  const points: Float32Array[] = [];
  for (let i = 0; i < corners; i += 1) points.push(positions.subarray(i * 3, i * 3 + 3));
  const ids = weldedVertexIds(points, 1e-4);
  let most = 0;
  for (let i = 0; i < ids.length; i += 1) most = Math.max(most, ids[i]);
  const parent = new Int32Array(most + 1);
  for (let i = 0; i < parent.length; i += 1) parent[i] = i;
  const find = (start: number) => { let x = start; while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < triangles; t += 1) {
    if (!keep[t]) continue;
    const a = find(ids[t * 3]);
    for (let k = 1; k < 3; k += 1) { const b = find(ids[t * 3 + k]); if (a !== b) parent[b] = a; }
  }
  const area = new Map<number, number>(), hasTooth = new Set<number>();
  let total = 0;
  for (let t = 0; t < triangles; t += 1) {
    if (!keep[t]) continue;
    const o = t * 9;
    const ux = positions[o + 3] - positions[o], uy = positions[o + 4] - positions[o + 1], uz = positions[o + 5] - positions[o + 2];
    const wx = positions[o + 6] - positions[o], wy = positions[o + 7] - positions[o + 1], wz = positions[o + 8] - positions[o + 2];
    const value = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
    const root = find(ids[t * 3]);
    area.set(root, (area.get(root) ?? 0) + value);
    total += value;
    if (tooth[t * 3] || tooth[t * 3 + 1] || tooth[t * 3 + 2]) hasTooth.add(root);
  }
  for (let t = 0; t < triangles; t += 1) {
    if (!keep[t]) continue;
    const root = find(ids[t * 3]);
    if (!hasTooth.has(root) && (area.get(root) ?? 0) < total * 0.01) keep[t] = 0;
  }
  let removed = 0;
  for (let t = 0; t < triangles; t += 1) if (!keep[t]) removed += 1;
  return { keep, removed, protectedTriangles };
}
