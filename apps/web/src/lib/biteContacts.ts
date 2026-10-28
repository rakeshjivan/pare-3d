/**
 * Build 84: the bite contacts & clearance map - for every point of one arch, its signed distance to
 * the other arch's surface in the scanned bite, coloured in bands, as the scanner programs and
 * Exocad's occlusion map show it. Negative is overlap (the scans run into each other: the printed
 * models would hold each other open there), positive is clearance. It is a distance, not a
 * pressure: a scan has no force in it (see the guide).
 *
 * Bands (mm): below -0.10 red, -0.10 to -0.05 orange, -0.05 to 0 yellow, 0 to 0.05 green, 0.05 to
 * 0.10 light blue, 0.10 to 0.20 blue; further than 0.20 the scan's own colour.
 */

export type ContactBand = { from: number; to: number; color: string; key: string };

export const CONTACT_BANDS: ContactBand[] = [
  { from: -Infinity, to: -0.1, color: "#d7263d", key: "overlapDeep" },
  { from: -0.1, to: -0.05, color: "#f46036", key: "overlap" },
  { from: -0.05, to: 0, color: "#f2c14e", key: "touch" },
  { from: 0, to: 0.05, color: "#3bb273", key: "close" },
  { from: 0.05, to: 0.1, color: "#7cc6fe", key: "near" },
  { from: 0.1, to: 0.2, color: "#2e86de", key: "clear" },
];
/** How far from the other arch a point is still coloured (mm). */
export const CONTACT_REACH = 0.2;

export function bandOf(distance: number): ContactBand | null {
  if (!Number.isFinite(distance) || distance >= CONTACT_REACH) return null;
  return CONTACT_BANDS.find((band) => distance >= band.from && distance < band.to) ?? null;
}

/** Squared distance from p to triangle abc, and the closest point's parameters (Ericson 5.1.5). */
function closestOnTriangle(px: number, py: number, pz: number, t: ArrayLike<number>, o: number, out: Float64Array): number {
  const ax = t[o], ay = t[o + 1], az = t[o + 2], bx = t[o + 3], by = t[o + 4], bz = t[o + 5], cx = t[o + 6], cy = t[o + 7], cz = t[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let qx: number, qy: number, qz: number;
  if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
  else {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; }
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + abx * v; qy = ay + aby * v; qz = az + abz * v; }
      else {
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; }
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + acx * w; qy = ay + acy * w; qz = az + acz * w; }
          else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); qx = bx + (cx - bx) * w; qy = by + (cy - by) * w; qz = bz + (cz - bz) * w; }
            else { const denom = 1 / (va + vb + vc); const v = vb * denom, w = vc * denom; qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w; }
          }
        }
      }
    }
  }
  out[0] = qx; out[1] = qy; out[2] = qz;
  return (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2;
}

/**
 * The signed distance from every corner of `from` (a triangle soup, 9 numbers a triangle) to the
 * surface of `to`, within `reach` mm; NaN where nothing of `to` is that near. The sign is the side of
 * `to`'s nearest triangle: positive on the side its normal points to. If most nearby points come out
 * negative, `to` is wound inside out (some scanners save it so) and the signs are turned round.
 */
export function signedDistances(from: ArrayLike<number>, to: ArrayLike<number>, reach = CONTACT_REACH): Float32Array {
  const corners = from.length / 3;
  const out = new Float32Array(corners).fill(Number.NaN);
  const count = Math.floor(to.length / 9);
  if (!count || !corners) return out;
  // The target's triangles in a grid of cells `cell` mm across, each in every cell its box touches.
  const cell = Math.max(0.25, reach * 2);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < to.length; i += 3) {
    minX = Math.min(minX, to[i]); maxX = Math.max(maxX, to[i]);
    minY = Math.min(minY, to[i + 1]); maxY = Math.max(maxY, to[i + 1]);
    minZ = Math.min(minZ, to[i + 2]); maxZ = Math.max(maxZ, to[i + 2]);
  }
  const key = (ix: number, iy: number, iz: number) => (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791);
  const cells = new Map<number, number[]>();
  for (let t = 0; t < count; t += 1) {
    const o = t * 9;
    const x0 = Math.floor((Math.min(to[o], to[o + 3], to[o + 6]) - reach) / cell), x1 = Math.floor((Math.max(to[o], to[o + 3], to[o + 6]) + reach) / cell);
    const y0 = Math.floor((Math.min(to[o + 1], to[o + 4], to[o + 7]) - reach) / cell), y1 = Math.floor((Math.max(to[o + 1], to[o + 4], to[o + 7]) + reach) / cell);
    const z0 = Math.floor((Math.min(to[o + 2], to[o + 5], to[o + 8]) - reach) / cell), z1 = Math.floor((Math.max(to[o + 2], to[o + 5], to[o + 8]) + reach) / cell);
    for (let ix = x0; ix <= x1; ix += 1) for (let iy = y0; iy <= y1; iy += 1) for (let iz = z0; iz <= z1; iz += 1) {
      const k = key(ix, iy, iz);
      const list = cells.get(k);
      if (list) list.push(t); else cells.set(k, [t]);
    }
  }
  const q = new Float64Array(3);
  const r2 = reach * reach;
  let positive = 0, negative = 0;
  for (let c = 0; c < corners; c += 1) {
    const px = from[c * 3], py = from[c * 3 + 1], pz = from[c * 3 + 2];
    if (px < minX - reach || px > maxX + reach || py < minY - reach || py > maxY + reach || pz < minZ - reach || pz > maxZ + reach) continue;
    const list = cells.get(key(Math.floor(px / cell), Math.floor(py / cell), Math.floor(pz / cell)));
    if (!list) continue;
    let best = r2, bestT = -1, bx = 0, by = 0, bz = 0;
    for (const t of list) {
      const d2 = closestOnTriangle(px, py, pz, to, t * 9, q);
      if (d2 < best) { best = d2; bestT = t; bx = q[0]; by = q[1]; bz = q[2]; }
    }
    if (bestT < 0) continue;
    const o = bestT * 9;
    const ux = to[o + 3] - to[o], uy = to[o + 4] - to[o + 1], uz = to[o + 5] - to[o + 2];
    const vx = to[o + 6] - to[o], vy = to[o + 7] - to[o + 1], vz = to[o + 8] - to[o + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const side = (px - bx) * nx + (py - by) * ny + (pz - bz) * nz;
    const d = Math.sqrt(best);
    out[c] = side < 0 ? -d : d;
    if (d > 0.05) { if (side < 0) negative += 1; else positive += 1; }
  }
  if (negative > positive) for (let c = 0; c < corners; c += 1) out[c] = -out[c];
  return out;
}

export type BiteContactStats = {
  /** The deepest overlap (mm, positive), 0 if none. */
  maxOverlap: number;
  /** The area of this arch's surface in overlap, and within 0.05 mm (touching), mm². */
  overlapArea: number;
  contactArea: number;
};

/** Area of the triangles whose three corners pass `test`. */
function areaWhere(soup: ArrayLike<number>, distances: Float32Array, test: (d: number) => boolean) {
  let area = 0;
  for (let t = 0; t * 9 < soup.length; t += 1) {
    if (!test(distances[t * 3]) || !test(distances[t * 3 + 1]) || !test(distances[t * 3 + 2])) continue;
    const o = t * 9;
    const ux = soup[o + 3] - soup[o], uy = soup[o + 4] - soup[o + 1], uz = soup[o + 5] - soup[o + 2];
    const vx = soup[o + 6] - soup[o], vy = soup[o + 7] - soup[o + 1], vz = soup[o + 8] - soup[o + 2];
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return area;
}

export function contactStats(soup: ArrayLike<number>, distances: Float32Array): BiteContactStats {
  let deepest = 0;
  for (const d of distances) if (Number.isFinite(d) && d < deepest) deepest = d;
  return {
    maxOverlap: -deepest,
    overlapArea: areaWhere(soup, distances, (d) => Number.isFinite(d) && d < 0),
    contactArea: areaWhere(soup, distances, (d) => Number.isFinite(d) && d < 0.05),
  };
}

/** Per-corner colours (r, g, b in 0..1) for a soup: the band colours, `base` beyond reach. */
export function contactColors(distances: Float32Array, base: string): Float32Array {
  const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
  const fallback = rgb(base);
  const bands = CONTACT_BANDS.map((band) => rgb(band.color));
  const out = new Float32Array(distances.length * 3);
  for (let c = 0; c < distances.length; c += 1) {
    const band = bandOf(distances[c]);
    const color = band ? bands[CONTACT_BANDS.indexOf(band)] : fallback;
    out[c * 3] = color[0]; out[c * 3 + 1] = color[1]; out[c * 3 + 2] = color[2];
  }
  return out;
}

export type BiteContactMap = { upper: Float32Array; lower: Float32Array; upperStats: BiteContactStats; lowerStats: BiteContactStats };

/** Both arches against each other. */
export function biteContactMap(upper: ArrayLike<number>, lower: ArrayLike<number>, reach = CONTACT_REACH): BiteContactMap {
  const up = signedDistances(upper, lower, reach);
  const low = signedDistances(lower, upper, reach);
  return { upper: up, lower: low, upperStats: contactStats(upper, up), lowerStats: contactStats(lower, low) };
}
