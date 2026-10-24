/**
 * Fork (build 48): trimming a scan by hand in Dental Studio. The person draws a line round what to
 * keep (or what to remove) from the view they chose; every triangle whose corners all fall on the
 * wrong side goes - except the teeth, which a trim never takes. Bits the trim leaves floating on
 * their own go too.
 */
import { archFrame, cleanScan, marginUp } from "@/lib/dentalArch";
import { TIP_CEILING, toothZone } from "@/lib/dentalBase";
import { applyMatrix, cloneMesh, cutAlongField, PointGrid } from "@/lib/dentalMesh";
import { weldedVertexIds } from "@/lib/meshComponents";

export type DentalTrimMode = "keep" | "remove";

/**
 * `keep`: one flag per triangle of the scan as it was handed in. `positions` (build 52): the scan
 * cut exactly along the line, in the coordinates of `local` - when given, it replaces the scan.
 */
export type DentalTrimResult = { keep: Uint8Array; removed: number; protectedTriangles: number; positions?: Float32Array };

/**
 * Build 52: the scan cut exactly along the (smoothed) line drawn - triangles that cross it are split
 * on it - so the trimmed edge is clean. `side`: per corner, how far inside the line it falls
 * (negative outside); `local`: the same soup in the part's own coordinates, which the result is in.
 */
export function cutDentalScan(positions: Float32Array, side: Float32Array, mode: DentalTrimMode, local: Float32Array): DentalTrimResult {
  const triangles = Math.floor(positions.length / 9);
  const corners = triangles * 3;
  const inside = new Uint8Array(corners);
  for (let i = 0; i < corners; i += 1) if (side[i] > 0) inside[i] = 1;
  // The teeth and the floating bits, decided as before.
  const plain = trimDentalScan(positions, inside, mode);
  const tooth = plain.toothCorners!;
  const points: Float32Array[] = [];
  for (let i = 0; i < corners; i += 1) points.push(positions.subarray(i * 3, i * 3 + 3));
  const ids = weldedVertexIds(points, 1e-4);
  let count = 0;
  for (let i = 0; i < ids.length; i += 1) count = Math.max(count, ids[i] + 1);
  const v = new Array<number>(count * 3).fill(0);
  const field = new Float64Array(count).fill(-1e6);
  const keepCorner = new Uint8Array(count);
  for (let i = 0; i < corners; i += 1) {
    const id = ids[i];
    v[id * 3] = local[i * 3]; v[id * 3 + 1] = local[i * 3 + 1]; v[id * 3 + 2] = local[i * 3 + 2];
    field[id] = mode === "keep" ? side[i] : -side[i];
    if (tooth[i]) keepCorner[id] = 1;
  }
  const f: number[] = [];
  let crossed = 0;
  // Triangles the plain trim dropped as floating bits stay dropped; the rest are cut on the line.
  for (let t = 0; t < triangles; t += 1) {
    const a = ids[t * 3], b = ids[t * 3 + 1], c = ids[t * 3 + 2];
    const crosses = (field[a] > 0) !== (field[b] > 0) || (field[b] > 0) !== (field[c] > 0);
    if (crosses) crossed += 1;
    if (plain.keep[t] || crosses) f.push(a, b, c);
  }
  const cut = cutAlongField({ v, f }, field, keepCorner);
  const out = new Float32Array(cut.f.length * 3);
  for (let i = 0; i < cut.f.length; i += 1) for (let k = 0; k < 3; k += 1) out[i * 3 + k] = cut.v[cut.f[i] * 3 + k];
  return { keep: plain.keep, removed: plain.removed + crossed, protectedTriangles: plain.protectedTriangles, positions: out };
}

/**
 * `positions`: the scan as a triangle soup (Z-up); `inside`: one flag per corner, whether it falls
 * inside the line drawn on screen.
 */
export function trimDentalScan(positions: Float32Array, inside: Uint8Array, mode: DentalTrimMode): DentalTrimResult & { toothCorners?: Uint8Array } {
  const triangles = Math.floor(positions.length / 9);
  const corners = triangles * 3;
  // The teeth, found as Dental Studio finds them: on the cleaned scan, teeth up.
  const clean = cleanScan(positions);
  const turned = cloneMesh(clean.mesh);
  applyMatrix(turned, archFrame(clean.mesh, marginUp(clean.mesh, clean.margin)));
  const zone = toothZone(turned, undefined, undefined, undefined, TIP_CEILING);
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
  return { keep, removed, protectedTriangles, toothCorners: tooth };
}
