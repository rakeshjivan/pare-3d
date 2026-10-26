/**
 * Build 77: Align to plate - turns a part so a chosen patch of its surface (the underside, a model's
 * base, a tooth row's occlusal surface) faces straight down onto the build plate, as Meshmixer's
 * Analysis > Orientation / Edit > Align with a selection.
 *
 * The patch's plane is the least-squares plane of its surface, every triangle weighted by its area:
 * through the area centroid, its normal the eigenvector of least spread of the area second-moment
 * matrix (each triangle integrated exactly, not just its centroid), turned to agree with the patch's
 * area-weighted facing. The part is then turned about that centroid so the normal points down (-Y),
 * and lifted so its lowest point rests at y = 0.
 */
import * as THREE from "three";

export type SelectionPlane = {
  /** Area-weighted centroid of the chosen triangles. */
  centre: THREE.Vector3;
  /** Unit normal of the least-squares plane, facing the way the chosen triangles face on the whole. */
  normal: THREE.Vector3;
  /** Total area of the chosen triangles (mm^2). */
  area: number;
  /** RMS distance of the patch from its plane (mm): 0 for a flat patch. */
  spread: number;
};

/** Eigenvalues and eigenvectors (columns) of a symmetric 3x3 matrix by Jacobi rotations. */
function symmetricEigen(m: number[][]): { values: number[]; vectors: number[][] } {
  const a = m.map((row) => row.slice());
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep += 1) {
    const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
    if (off < 1e-30 * (a[0][0] ** 2 + a[1][1] ** 2 + a[2][2] ** 2 + 1e-300)) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k += 1) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k += 1) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k += 1) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: v };
}

/**
 * The least-squares plane of the chosen triangles of `soup` (9 numbers a triangle; `chosen` one entry a
 * triangle, non-zero for chosen), area-weighted. Null when the choice has no area.
 */
export function planeOfSelection(soup: ArrayLike<number>, chosen: ArrayLike<number>): SelectionPlane | null {
  const count = Math.min(chosen.length, Math.floor(soup.length / 9));
  let area = 0;
  const centre = new THREE.Vector3();
  const facing = new THREE.Vector3();
  // Second moment about the origin, sum over triangles of the integral of x x^T dA.
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  // Coordinates are taken about the first chosen corner, so a part far from the origin keeps its precision.
  let ref: THREE.Vector3 | null = null;
  for (let t = 0; t < count; t += 1) {
    if (!chosen[t]) continue;
    const i = t * 9;
    a.set(soup[i], soup[i + 1], soup[i + 2]);
    b.set(soup[i + 3], soup[i + 4], soup[i + 5]);
    c.set(soup[i + 6], soup[i + 7], soup[i + 8]);
    if (!ref) ref = a.clone();
    a.sub(ref); b.sub(ref); c.sub(ref);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const A = n.length() / 2;
    if (!(A > 0) || !Number.isFinite(A)) continue;
    area += A;
    facing.add(n);
    centre.addScaledVector(a.clone().add(b).add(c), A / 3);
    // Integral over the triangle of x x^T = A/12 (sum v v^T + (sum v)(sum v)^T).
    const s = [a.x + b.x + c.x, a.y + b.y + c.y, a.z + b.z + c.z];
    const pts = [[a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z]];
    for (let r = 0; r < 3; r += 1) for (let k = 0; k < 3; k += 1) {
      let sum = s[r] * s[k];
      for (const p of pts) sum += p[r] * p[k];
      M[r][k] += (A / 12) * sum;
    }
  }
  if (!ref || !(area > 0)) return null;
  centre.divideScalar(area);
  const g = [centre.x, centre.y, centre.z];
  const C = M.map((row, r) => row.map((x, k) => x / area - g[r] * g[k]));
  const { values, vectors } = symmetricEigen(C);
  let least = 0;
  for (let k = 1; k < 3; k += 1) if (values[k] < values[least]) least = k;
  const normal = new THREE.Vector3(vectors[0][least], vectors[1][least], vectors[2][least]).normalize();
  if (normal.dot(facing) < 0) normal.negate();
  return { centre: centre.add(ref), normal, area, spread: Math.sqrt(Math.max(0, values[least])) };
}

/**
 * The rigid transform that turns the chosen patch's plane to face straight down (-Y), turning about the
 * patch's centre, then lifts the part so its lowest point is at y = 0. Null when nothing with area is chosen.
 */
export function alignToPlate(soup: ArrayLike<number>, chosen: ArrayLike<number>): THREE.Matrix4 | null {
  const plane = planeOfSelection(soup, chosen);
  if (!plane) return null;
  const turn = new THREE.Quaternion().setFromUnitVectors(plane.normal, new THREE.Vector3(0, -1, 0));
  const matrix = new THREE.Matrix4().makeTranslation(-plane.centre.x, -plane.centre.y, -plane.centre.z)
    .premultiply(new THREE.Matrix4().makeRotationFromQuaternion(turn))
    .premultiply(new THREE.Matrix4().makeTranslation(plane.centre.x, plane.centre.y, plane.centre.z));
  // Lowest corner of the whole part after the turn.
  const e = matrix.elements;
  let lowest = Infinity;
  for (let i = 0; i + 2 < soup.length; i += 3) {
    const y = e[1] * soup[i] + e[5] * soup[i + 1] + e[9] * soup[i + 2] + e[13];
    if (y < lowest) lowest = y;
  }
  return matrix.premultiply(new THREE.Matrix4().makeTranslation(0, -lowest, 0));
}
