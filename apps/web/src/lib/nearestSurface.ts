/**
 * Build 92: the nearest point on a surface (a triangle soup, 9 numbers a triangle) to a point, within
 * `reach` mm - for Sculpt's Attract brush, which pulls a part onto another (the opposing arch, a tooth
 * beside it). The triangles are kept in a grid of cells `reach` across, each in every cell its box
 * touches, so a query looks in its own cell and the 26 round it.
 */
export class NearestSurface {
  private cells = new Map<number, number[]>();
  private readonly cell: number;
  private readonly q = new Float64Array(3);
  /** Build 105: the triangle the last nearest() found (its index in the soup), -1 for none. */
  lastTriangle = -1;
  constructor(private readonly soup: Float32Array, readonly reach: number) {
    this.cell = Math.max(0.25, reach);
    const c = this.cell;
    for (let t = 0; t * 9 + 8 < soup.length; t += 1) {
      const o = t * 9;
      const x0 = Math.floor(Math.min(soup[o], soup[o + 3], soup[o + 6]) / c), x1 = Math.floor(Math.max(soup[o], soup[o + 3], soup[o + 6]) / c);
      const y0 = Math.floor(Math.min(soup[o + 1], soup[o + 4], soup[o + 7]) / c), y1 = Math.floor(Math.max(soup[o + 1], soup[o + 4], soup[o + 7]) / c);
      const z0 = Math.floor(Math.min(soup[o + 2], soup[o + 5], soup[o + 8]) / c), z1 = Math.floor(Math.max(soup[o + 2], soup[o + 5], soup[o + 8]) / c);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 512) continue; // a huge base triangle: never the nearest to a tooth
      for (let ix = x0; ix <= x1; ix += 1) for (let iy = y0; iy <= y1; iy += 1) for (let iz = z0; iz <= z1; iz += 1) {
        const k = key(ix, iy, iz);
        const list = this.cells.get(k);
        if (list) list.push(t); else this.cells.set(k, [t]);
      }
    }
  }
  /** Build 105: triangle t's normal (unit; as wound) into `out`. */
  triangleNormal(t: number, out: Float64Array | number[]) {
    const s = this.soup, o = t * 9;
    const ux = s[o + 3] - s[o], uy = s[o + 4] - s[o + 1], uz = s[o + 5] - s[o + 2];
    const vx = s[o + 6] - s[o], vy = s[o + 7] - s[o + 1], vz = s[o + 8] - s[o + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    out[0] = nx / len; out[1] = ny / len; out[2] = nz / len;
  }
  /** The nearest point on the surface to (x, y, z) within reach, written to `out`; its distance, or Infinity. */
  nearest(x: number, y: number, z: number, out: Float64Array | number[]): number {
    const c = this.cell, cx = Math.floor(x / c), cy = Math.floor(y / c), cz = Math.floor(z / c);
    let best = this.reach * this.reach, found = false;
    this.lastTriangle = -1;
    for (let ox = -1; ox <= 1; ox += 1) for (let oy = -1; oy <= 1; oy += 1) for (let oz = -1; oz <= 1; oz += 1) {
      const list = this.cells.get(key(cx + ox, cy + oy, cz + oz));
      if (!list) continue;
      for (let i = 0; i < list.length; i += 1) {
        const d2 = closest(x, y, z, this.soup, list[i] * 9, this.q);
        if (d2 < best) { best = d2; found = true; this.lastTriangle = list[i]; out[0] = this.q[0]; out[1] = this.q[1]; out[2] = this.q[2]; }
      }
    }
    return found ? Math.sqrt(best) : Infinity;
  }
}

const key = (ix: number, iy: number, iz: number) => (((ix & 1023) * 1024 + (iy & 1023)) * 1024 + (iz & 1023));

/** Squared distance from p to the triangle at `o`, its closest point in `out` (Ericson, Real-Time Collision Detection 5.1.5). */
function closest(px: number, py: number, pz: number, t: ArrayLike<number>, o: number, out: Float64Array): number {
  const ax = t[o], ay = t[o + 1], az = t[o + 2];
  const abx = t[o + 3] - ax, aby = t[o + 4] - ay, abz = t[o + 5] - az, acx = t[o + 6] - ax, acy = t[o + 7] - ay, acz = t[o + 8] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let qx: number, qy: number, qz: number;
  if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
  else {
    const bpx = px - t[o + 3], bpy = py - t[o + 4], bpz = pz - t[o + 5];
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { qx = t[o + 3]; qy = t[o + 4]; qz = t[o + 5]; }
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + abx * v; qy = ay + aby * v; qz = az + abz * v; }
      else {
        const cpx = px - t[o + 6], cpy = py - t[o + 7], cpz = pz - t[o + 8];
        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { qx = t[o + 6]; qy = t[o + 7]; qz = t[o + 8]; }
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + acx * w; qy = ay + acy * w; qz = az + acz * w; }
          else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); qx = t[o + 3] + (t[o + 6] - t[o + 3]) * w; qy = t[o + 4] + (t[o + 7] - t[o + 4]) * w; qz = t[o + 5] + (t[o + 8] - t[o + 5]) * w; }
            else { const den = 1 / (va + vb + vc); const v = vb * den, w = vc * den; qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w; }
          }
        }
      }
    }
  }
  out[0] = qx; out[1] = qy; out[2] = qz;
  return (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2;
}

/**
 * Build 95: the deviation map's look-up, fast on a scan of 300,000 triangles. Corners that have not
 * moved (still exactly at one of the original's corners - nearly all of them) answer at once; the
 * rest search the original's triangles near them (to 0.6 mm, past which the map's colour is full
 * anyway), and only those further still look wider, to tell added from taken away.
 */
export class DeviationProbe {
  private corners = new Set<number>();
  private near: NearestSurface;
  private far: NearestSurface | null = null;
  constructor(private readonly soup: Float32Array) {
    for (let i = 0; i + 2 < soup.length; i += 3) this.corners.add(DeviationProbe.hash(soup[i], soup[i + 1], soup[i + 2]));
    this.near = new NearestSurface(soup, 0.6);
  }
  private static hash(x: number, y: number, z: number) {
    const ix = Math.round(x * 1e4), iy = Math.round(y * 1e4), iz = Math.round(z * 1e4);
    return ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) >>> 0;
  }
  nearest(x: number, y: number, z: number, out: Float64Array | number[]): number {
    if (this.corners.has(DeviationProbe.hash(x, y, z))) { out[0] = x; out[1] = y; out[2] = z; return 0; }
    const d = this.near.nearest(x, y, z, out);
    if (d < Infinity) return d;
    this.far ??= new NearestSurface(this.soup, 3);
    return this.far.nearest(x, y, z, out);
  }
}
