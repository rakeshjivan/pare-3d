/**
 * Build 73: live Sculpt - a mesh that can be shaped while the brush moves, as in Meshmixer.
 *
 * The working copy of a part is an editable triangle mesh (corners shared, triangles that can be
 * split, collapsed and flipped). Two uniform grids index it: one of corners, for "every corner within
 * the brush", and one of triangles, for "where does this ray meet the surface". A brush stroke is a
 * stream of dabs; each dab moves only the corners within the brush that are joined (over the surface)
 * to the point under the cursor, then refreshes their normals and the few changed parts of the GPU
 * buffers. Nothing walks the whole mesh during a stroke.
 *
 * Refine (dynamic topology): after each dab the triangles under the brush are kept near a target edge
 * length - edges longer than 4/3 of it split, shorter than 4/5 collapse, edges flipped towards six
 * neighbours a corner, corners relaxed along the surface (Botsch & Kobbelt 2004, "A remeshing approach
 * to multiresolution modeling"; the method of Ryan Schmidt's Meshmixer and geometry3Sharp Remesher).
 * The same steps over the whole part, with corners pulled back onto the original surface, are Remesh.
 */
import * as THREE from "three";

export type LiveBrush = "draw" | "inflate" | "deflate" | "smooth" | "flatten" | "pinch" | "crease" | "move";
export type Vec3 = [number, number, number];

const K = 131072, OFF = 65536;

/** A uniform grid of items by cell (cell size `h`). */
class Grid {
  cells = new Map<number, number[]>();
  constructor(public h: number) {}
  key(ix: number, iy: number, iz: number) { return ((ix + OFF) * K + (iy + OFF)) * K + (iz + OFF); }
  cellOf(x: number, y: number, z: number) { return this.key(Math.floor(x / this.h), Math.floor(y / this.h), Math.floor(z / this.h)); }
  add(key: number, item: number) { const list = this.cells.get(key); if (list) list.push(item); else this.cells.set(key, [item]); }
  remove(key: number, item: number) {
    const list = this.cells.get(key);
    if (!list) return;
    const at = list.indexOf(item);
    if (at < 0) return;
    list[at] = list[list.length - 1];
    list.pop();
    if (!list.length) this.cells.delete(key);
  }
}

export class LiveMesh {
  /** Corner positions (x y z), capacity-sized; `vCount` in use, `vAlive` 0 for removed corners. */
  pos: Float64Array;
  vCount = 0;
  vAlive: Uint8Array;
  /** Triangles (three corner numbers), capacity-sized; `tCount` in use, `tAlive` 0 for removed ones. */
  tri: Int32Array;
  tCount = 0;
  tAlive: Uint8Array;
  /** The triangles at each corner. */
  vTris: number[][] = [];
  private vCell: Float64Array;
  private tCells: number[][] = [];
  /** Each triangle's grid box when last binned (x0 y0 z0 x1 y1 z1), so an unchanged box is skipped. */
  private tBox: Int32Array;
  private vGrid: Grid;
  private tGrid: Grid;
  /** For drawing: Float32 positions and normals per corner, an index per triangle. */
  geometry: THREE.BufferGeometry;
  private gPos!: THREE.BufferAttribute;
  private gNrm!: THREE.BufferAttribute;
  private gIdx!: THREE.BufferAttribute;
  private dirtyV = new Set<number>();
  private dirtyT = new Set<number>();
  /** Set when triangles were added or removed (the index buffer and draw range change). */
  topologyChanged = false;
  /** Counts every change to the triangles (split, collapse, flip): a stroke compares it to know whether it changed them. */
  topologyEdits = 0;

  constructor(points: ArrayLike<number>, triangles: ArrayLike<number>) {
    const n = points.length / 3, m = triangles.length / 3;
    this.pos = new Float64Array(Math.ceil(n * 1.5 + 4096) * 3);
    this.pos.set(points);
    this.vCount = n;
    this.vAlive = new Uint8Array(this.pos.length / 3).fill(1, 0, n);
    this.tri = new Int32Array(Math.ceil(m * 1.5 + 8192) * 3);
    this.tri.set(triangles);
    this.tCount = m;
    this.tAlive = new Uint8Array(this.tri.length / 3).fill(1, 0, m);
    this.vCell = new Float64Array(this.pos.length / 3);
    this.tBox = new Int32Array(this.tri.length * 2).fill(2147483647);
    // The grid cell: about three edges, at least 0.5 mm.
    let edge = 0;
    const sample = Math.min(m, 20000);
    for (let s = 0; s < sample; s += 1) {
      const t = Math.floor((s * m) / sample) * 3;
      edge += this.dist(this.tri[t], this.tri[t + 1]);
    }
    const h = Math.max(0.5, (sample ? edge / sample : 1) * 3);
    this.vGrid = new Grid(h);
    this.tGrid = new Grid(h);
    for (let v = 0; v < n; v += 1) this.vTris.push([]);
    for (let t = 0; t < m; t += 1) for (let k = 0; k < 3; k += 1) this.vTris[this.tri[t * 3 + k]].push(t);
    for (let v = 0; v < n; v += 1) { this.vCell[v] = this.cellOfVertex(v); this.vGrid.add(this.vCell[v], v); }
    for (let t = 0; t < m; t += 1) { this.tCells.push([]); this.binTriangle(t); }
    this.geometry = new THREE.BufferGeometry();
    this.allocateGpu();
    this.refreshAllNormals();
  }

  /** A mesh from a triangle soup (9 numbers a triangle), corners welded within 1e-5 mm. */
  static fromSoup(soup: ArrayLike<number>): LiveMesh {
    const key = new Map<string, number>();
    const points: number[] = [];
    const tris: number[] = [];
    for (let i = 0; i + 8 < soup.length; i += 9) {
      const ids: number[] = [];
      for (let k = 0; k < 3; k += 1) {
        const x = soup[i + k * 3], y = soup[i + k * 3 + 1], z = soup[i + k * 3 + 2];
        const name = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
        let id = key.get(name);
        if (id === undefined) { id = points.length / 3; key.set(name, id); points.push(x, y, z); }
        ids.push(id);
      }
      if (ids[0] !== ids[1] && ids[1] !== ids[2] && ids[0] !== ids[2]) tris.push(ids[0], ids[1], ids[2]);
    }
    return new LiveMesh(points, tris);
  }

  // ---------------------------------------------------------------------------------------------
  // Basics

  dist(a: number, b: number) {
    const p = this.pos;
    return Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
  }
  private cellOfVertex(v: number) { return this.vGrid.cellOf(this.pos[v * 3], this.pos[v * 3 + 1], this.pos[v * 3 + 2]); }
  private binTriangle(t: number) {
    const cells = this.tCells[t];
    const box = this.tBox, o = t * 6;
    if (!this.tAlive[t]) {
      for (const c of cells) this.tGrid.remove(c, t);
      cells.length = 0;
      box[o] = 2147483647;
      return;
    }
    const h = this.tGrid.h, p = this.pos, a = this.tri[t * 3] * 3, b = this.tri[t * 3 + 1] * 3, c = this.tri[t * 3 + 2] * 3;
    const x0 = Math.floor(Math.min(p[a], p[b], p[c]) / h), x1 = Math.floor(Math.max(p[a], p[b], p[c]) / h);
    const y0 = Math.floor(Math.min(p[a + 1], p[b + 1], p[c + 1]) / h), y1 = Math.floor(Math.max(p[a + 1], p[b + 1], p[c + 1]) / h);
    const z0 = Math.floor(Math.min(p[a + 2], p[b + 2], p[c + 2]) / h), z1 = Math.floor(Math.max(p[a + 2], p[b + 2], p[c + 2]) / h);
    if (box[o] === x0 && box[o + 1] === y0 && box[o + 2] === z0 && box[o + 3] === x1 && box[o + 4] === y1 && box[o + 5] === z1 && cells.length) return;
    box[o] = x0; box[o + 1] = y0; box[o + 2] = z0; box[o + 3] = x1; box[o + 4] = y1; box[o + 5] = z1;
    for (const key of cells) this.tGrid.remove(key, t);
    cells.length = 0;
    // A huge triangle (a base plate) in at most 4000 cells; past that only its corners' cells.
    if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 4000) {
      for (const v of [a, b, c]) { const key = this.tGrid.cellOf(p[v], p[v + 1], p[v + 2]); if (!cells.includes(key)) { cells.push(key); this.tGrid.add(key, t); } }
      return;
    }
    for (let ix = x0; ix <= x1; ix += 1) for (let iy = y0; iy <= y1; iy += 1) for (let iz = z0; iz <= z1; iz += 1) {
      const key = this.tGrid.key(ix, iy, iz);
      cells.push(key);
      this.tGrid.add(key, t);
    }
  }
  /** The triangles round the given corners put in their grid cells again, each once. */
  private rebin(corners: number[]) {
    const seen = new Set<number>();
    for (const v of corners) for (const t of this.vTris[v]) if (!seen.has(t)) { seen.add(t); this.binTriangle(t); }
  }
  /** After a corner moved: its grid cell, and the cells of its triangles. */
  private moved(v: number) {
    const cell = this.cellOfVertex(v);
    if (cell !== this.vCell[v]) { this.vGrid.remove(this.vCell[v], v); this.vGrid.add(cell, v); this.vCell[v] = cell; }
    this.dirtyV.add(v);
  }
  private growVertices(extra: number) {
    if ((this.vCount + extra) * 3 <= this.pos.length) return;
    const cap = Math.ceil((this.vCount + extra) * 1.5);
    const pos = new Float64Array(cap * 3); pos.set(this.pos); this.pos = pos;
    const alive = new Uint8Array(cap); alive.set(this.vAlive); this.vAlive = alive;
    const cell = new Float64Array(cap); cell.set(this.vCell); this.vCell = cell;
    this.allocateGpu();
  }
  private growTriangles(extra: number) {
    if ((this.tCount + extra) * 3 <= this.tri.length) return;
    const cap = Math.ceil((this.tCount + extra) * 1.5);
    const tri = new Int32Array(cap * 3); tri.set(this.tri); this.tri = tri;
    const box = new Int32Array(cap * 6).fill(2147483647); box.set(this.tBox); this.tBox = box;
    const alive = new Uint8Array(cap); alive.set(this.tAlive); this.tAlive = alive;
    this.allocateGpu();
  }
  private addVertex(x: number, y: number, z: number) {
    this.growVertices(1);
    const v = this.vCount++;
    this.pos[v * 3] = x; this.pos[v * 3 + 1] = y; this.pos[v * 3 + 2] = z;
    this.vAlive[v] = 1;
    this.vTris[v] = [];
    this.vCell[v] = this.cellOfVertex(v);
    this.vGrid.add(this.vCell[v], v);
    this.dirtyV.add(v);
    return v;
  }
  private addTriangle(a: number, b: number, c: number) {
    this.growTriangles(1);
    const t = this.tCount++;
    this.tri[t * 3] = a; this.tri[t * 3 + 1] = b; this.tri[t * 3 + 2] = c;
    this.tAlive[t] = 1;
    this.vTris[a].push(t); this.vTris[b].push(t); this.vTris[c].push(t);
    this.tCells[t] = [];
    this.binTriangle(t);
    this.dirtyT.add(t);
    this.topologyChanged = true;
    this.topologyEdits += 1;
    return t;
  }
  private removeTriangle(t: number) {
    if (!this.tAlive[t]) return;
    this.tAlive[t] = 0;
    for (let k = 0; k < 3; k += 1) {
      const list = this.vTris[this.tri[t * 3 + k]];
      const at = list.indexOf(t);
      if (at >= 0) { list[at] = list[list.length - 1]; list.pop(); }
    }
    this.binTriangle(t);
    this.dirtyT.add(t);
    this.topologyChanged = true;
    this.topologyEdits += 1;
  }
  /** Replaces corner `from` with `to` in triangle t. */
  private retarget(t: number, from: number, to: number) {
    for (let k = 0; k < 3; k += 1) if (this.tri[t * 3 + k] === from) this.tri[t * 3 + k] = to;
    const list = this.vTris[from], at = list.indexOf(t);
    if (at >= 0) { list[at] = list[list.length - 1]; list.pop(); }
    this.vTris[to].push(t);
    this.binTriangle(t);
    this.dirtyT.add(t);
  }
  /** The corners joined to v by an edge. */
  neighbours(v: number): number[] {
    if (this.stamp.length < this.vCount) { const next = new Int32Array(this.pos.length / 3); next.set(this.stamp); this.stamp = next; }
    this.stampNow += 1;
    const out: number[] = [];
    const stamp = this.stamp, now = this.stampNow, tri = this.tri;
    stamp[v] = now;
    for (const t of this.vTris[v]) for (let k = 0; k < 3; k += 1) { const w = tri[t * 3 + k]; if (stamp[w] !== now) { stamp[w] = now; out.push(w); } }
    return out;
  }
  private stamp = new Int32Array(0);
  private stampNow = 0;
  /** The (one or two) triangles on edge a-b. */
  edgeTriangles(a: number, b: number): number[] {
    const out: number[] = [];
    for (const t of this.vTris[a]) { const i = t * 3; if (this.tri[i] === b || this.tri[i + 1] === b || this.tri[i + 2] === b) out.push(t); }
    return out;
  }
  /** Whether v is on an open edge (a scan's rim). */
  onBoundary(v: number) {
    // Round an inner corner there are as many neighbours as triangles; on a rim, one more (or the fan
    // is not a single disc).
    return this.neighbours(v).length !== this.vTris[v].length;
  }
  private faceNormal(t: number, out = new THREE.Vector3()) {
    const p = this.pos, a = this.tri[t * 3] * 3, b = this.tri[t * 3 + 1] * 3, c = this.tri[t * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    return out.set(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  /** Area-weighted unit normal at v. */
  vertexNormal(v: number, out = new THREE.Vector3()) {
    out.set(0, 0, 0);
    const n = new THREE.Vector3();
    for (const t of this.vTris[v]) out.add(this.faceNormal(t, n));
    return out.lengthSq() > 0 ? out.normalize() : out.set(0, 0, 1);
  }

  // ---------------------------------------------------------------------------------------------
  // Drawing

  private allocateGpu() {
    const vCap = this.pos.length / 3, tCap = this.tri.length / 3;
    const positions = new Float32Array(vCap * 3), normals = new Float32Array(vCap * 3);
    for (let i = 0; i < this.vCount * 3; i += 1) positions[i] = this.pos[i];
    if (this.gNrm) normals.set((this.gNrm.array as Float32Array).subarray(0, Math.min(normals.length, this.gNrm.array.length)));
    const index = new Uint32Array(tCap * 3);
    for (let t = 0; t < this.tCount; t += 1) if (this.tAlive[t]) index.set(this.tri.subarray(t * 3, t * 3 + 3), t * 3);
    this.gPos = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.gNrm = new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage);
    this.gIdx = new THREE.BufferAttribute(index, 1).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("position", this.gPos);
    this.geometry.setAttribute("normal", this.gNrm);
    this.geometry.setIndex(this.gIdx);
    this.geometry.setDrawRange(0, this.tCount * 3);
    this.dirtyV.clear(); this.dirtyT.clear();
  }
  private refreshAllNormals() {
    const n = new THREE.Vector3(), arr = this.gNrm.array as Float32Array;
    for (let v = 0; v < this.vCount; v += 1) { if (!this.vAlive[v]) continue; this.vertexNormal(v, n); arr[v * 3] = n.x; arr[v * 3 + 1] = n.y; arr[v * 3 + 2] = n.z; }
    this.gNrm.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
  /** Copies what changed since the last call into the GPU buffers (as runs of indices). */
  flushGpu() {
    if (!this.dirtyV.size && !this.dirtyT.size) return false;
    // Normals of the changed corners and of their neighbours (their fans changed).
    const normalSet = new Set<number>();
    for (const v of this.dirtyV) { if (!this.vAlive[v]) continue; normalSet.add(v); for (const t of this.vTris[v]) for (let k = 0; k < 3; k += 1) normalSet.add(this.tri[t * 3 + k]); }
    for (const t of this.dirtyT) for (let k = 0; k < 3; k += 1) normalSet.add(this.tri[t * 3 + k]);
    const p = this.gPos.array as Float32Array, nArr = this.gNrm.array as Float32Array, idx = this.gIdx.array as Uint32Array;
    const n = new THREE.Vector3();
    for (const v of this.dirtyV) { p[v * 3] = this.pos[v * 3]; p[v * 3 + 1] = this.pos[v * 3 + 1]; p[v * 3 + 2] = this.pos[v * 3 + 2]; }
    for (const v of normalSet) { if (!this.vAlive[v]) continue; this.vertexNormal(v, n); nArr[v * 3] = n.x; nArr[v * 3 + 1] = n.y; nArr[v * 3 + 2] = n.z; }
    for (const t of this.dirtyT) {
      if (this.tAlive[t]) idx.set(this.tri.subarray(t * 3, t * 3 + 3), t * 3);
      else { idx[t * 3] = 0; idx[t * 3 + 1] = 0; idx[t * 3 + 2] = 0; }
    }
    const ranges = (set: Iterable<number>, attribute: THREE.BufferAttribute, width: number) => {
      const sorted = Float64Array.from(set).sort();
      attribute.clearUpdateRanges();
      let start = -1, end = -1;
      for (const i of sorted) {
        if (start < 0) { start = i; end = i; continue; }
        if (i - end <= 64) { end = i; continue; }
        attribute.addUpdateRange(start * width, (end - start + 1) * width);
        start = i; end = i;
      }
      if (start >= 0) attribute.addUpdateRange(start * width, (end - start + 1) * width);
      attribute.needsUpdate = true;
    };
    ranges(this.dirtyV, this.gPos, 3);
    ranges(normalSet, this.gNrm, 3);
    if (this.dirtyT.size) ranges(this.dirtyT, this.gIdx, 3);
    this.geometry.setDrawRange(0, this.tCount * 3);
    this.dirtyV.clear(); this.dirtyT.clear();
    this.topologyChanged = false;
    return true;
  }

  // ---------------------------------------------------------------------------------------------
  // Queries

  /** Where the ray first meets the surface: point, triangle and distance along the ray, or null. */
  pick(origin: Vec3, direction: Vec3): { point: Vec3; triangle: number; t: number } | null {
    const h = this.tGrid.h;
    const d = new THREE.Vector3(...direction).normalize();
    // Start where the ray enters the mesh's box.
    const box = this.bounds();
    const ray = new THREE.Ray(new THREE.Vector3(...origin), d);
    const enter = ray.intersectBox(new THREE.Box3(new THREE.Vector3(...box.min).subScalar(h), new THREE.Vector3(...box.max).addScalar(h)), new THREE.Vector3());
    if (!enter) return null;
    let s = enter.distanceTo(ray.origin);
    const tested = new Set<number>();
    let best: { point: Vec3; triangle: number; t: number } | null = null;
    const steps = Math.ceil((new THREE.Vector3(...box.max).sub(new THREE.Vector3(...box.min)).length() + 4 * h) / (h * 0.5)) + 4;
    const p = new THREE.Vector3();
    for (let step = 0; step < steps; step += 1) {
      ray.at(s, p);
      const cx = Math.floor(p.x / h), cy = Math.floor(p.y / h), cz = Math.floor(p.z / h);
      for (let ox = -1; ox <= 1; ox += 1) for (let oy = -1; oy <= 1; oy += 1) for (let oz = -1; oz <= 1; oz += 1) {
        const list = this.tGrid.cells.get(this.tGrid.key(cx + ox, cy + oy, cz + oz));
        if (!list) continue;
        for (const t of list) {
          if (tested.has(t)) continue;
          tested.add(t);
          const hit = this.rayTriangle(origin, [d.x, d.y, d.z], t);
          if (hit !== null && (!best || hit < best.t)) best = { t: hit, triangle: t, point: [origin[0] + d.x * hit, origin[1] + d.y * hit, origin[2] + d.z * hit] };
        }
      }
      const found = best as { t: number } | null;
      if (found && found.t < s - h) break;
      s += h * 0.5;
    }
    return best;
  }
  private rayTriangle(o: Vec3, d: Vec3, t: number): number | null {
    const p = this.pos, a = this.tri[t * 3] * 3, b = this.tri[t * 3 + 1] * 3, c = this.tri[t * 3 + 2] * 3;
    const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
    const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) return null;
    const inv = 1 / det;
    const tx = o[0] - p[a], ty = o[1] - p[a + 1], tz = o[2] - p[a + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) return null;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < 0 || u + v > 1) return null;
    const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return dist > 1e-9 ? dist : null;
  }
  bounds() {
    const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < this.vCount; v += 1) {
      if (!this.vAlive[v]) continue;
      for (let k = 0; k < 3; k += 1) { const x = this.pos[v * 3 + k]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x; }
    }
    return { min, max };
  }
  /**
   * The corners within `radius` of `centre` joined to `seed` (a triangle) over the surface without
   * leaving the ball, with their distance from the centre. A thin wall's other side is not joined.
   */
  region(centre: Vec3, radius: number, seed: number | null): Map<number, number> {
    const out = new Map<number, number>();
    const r2 = radius * radius;
    const d2 = (v: number) => (this.pos[v * 3] - centre[0]) ** 2 + (this.pos[v * 3 + 1] - centre[1]) ** 2 + (this.pos[v * 3 + 2] - centre[2]) ** 2;
    let seeds: number[] = [];
    if (seed !== null && this.tAlive[seed]) seeds = [this.tri[seed * 3], this.tri[seed * 3 + 1], this.tri[seed * 3 + 2]];
    else {
      // No triangle given: the nearest corner.
      let best = -1, bd = Infinity;
      this.forCornersNear(centre, radius, (v) => { const dd = d2(v); if (dd < bd) { bd = dd; best = v; } });
      if (best >= 0) seeds = [best];
    }
    const queue: number[] = [];
    for (const v of seeds) { out.set(v, Math.sqrt(d2(v))); queue.push(v); }
    for (let q = 0; q < queue.length; q += 1) {
      const v = queue[q];
      for (const t of this.vTris[v]) for (let k = 0; k < 3; k += 1) {
        const w = this.tri[t * 3 + k];
        if (out.has(w)) continue;
        const dd = d2(w);
        if (dd > r2) continue;
        out.set(w, Math.sqrt(dd));
        queue.push(w);
      }
    }
    return out;
  }
  forCornersNear(centre: Vec3, radius: number, each: (v: number) => void) {
    const h = this.vGrid.h;
    const x0 = Math.floor((centre[0] - radius) / h), x1 = Math.floor((centre[0] + radius) / h);
    const y0 = Math.floor((centre[1] - radius) / h), y1 = Math.floor((centre[1] + radius) / h);
    const z0 = Math.floor((centre[2] - radius) / h), z1 = Math.floor((centre[2] + radius) / h);
    for (let ix = x0; ix <= x1; ix += 1) for (let iy = y0; iy <= y1; iy += 1) for (let iz = z0; iz <= z1; iz += 1) {
      const list = this.vGrid.cells.get(this.vGrid.key(ix, iy, iz));
      if (list) for (const v of list) each(v);
    }
  }
  /** The average edge length round the given corners. */
  averageEdge(corners: Iterable<number>) {
    let total = 0, count = 0;
    for (const v of corners) for (const w of this.neighbours(v)) { total += this.dist(v, w); count += 1; }
    return count ? total / count : 0;
  }

  // ---------------------------------------------------------------------------------------------
  // Brushes

  /**
   * One dab: the corners in `region` (distance from the centre) moved by `brush`. `normal` is the
   * surface's facing at the centre, `step` the most a corner moves (mm), `strength` 0..1.
   */
  dab(brush: Exclude<LiveBrush, "move">, centre: Vec3, normal: Vec3, radius: number, region: Map<number, number>, strength: number, step: number) {
    if (!region.size) return;
    const weight = (d: number) => { const x = 1 - (d / radius) ** 2; return x > 0 ? x * x * strength : 0; };
    const p = this.pos;
    const n = new THREE.Vector3();
    // The brush's own facing: the weighted normal of what it covers.
    const area = new THREE.Vector3();
    const cen = new THREE.Vector3();
    let total = 0;
    for (const [v, d] of region) {
      const w = weight(d);
      this.vertexNormal(v, n);
      area.addScaledVector(n, w);
      cen.x += p[v * 3] * w; cen.y += p[v * 3 + 1] * w; cen.z += p[v * 3 + 2] * w;
      total += w;
    }
    if (!total) return;
    cen.divideScalar(total);
    if (area.lengthSq() < 1e-12) area.set(...normal);
    area.normalize();
    // Moves are worked out from the positions before the dab, then applied together.
    const moves: Array<[number, number, number, number]> = [];
    for (const [v, d] of region) {
      const w = weight(d);
      if (!w) continue;
      const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
      let dx = 0, dy = 0, dz = 0;
      if (brush === "smooth" || brush === "pinch" || brush === "crease") {
        if (brush === "smooth") {
          const around = this.neighbours(v);
          if (!around.length) continue;
          let ax = 0, ay = 0, az = 0;
          for (const u of around) { ax += p[u * 3]; ay += p[u * 3 + 1]; az += p[u * 3 + 2]; }
          dx = (ax / around.length - x) * Math.min(1, w * 1.5); dy = (ay / around.length - y) * Math.min(1, w * 1.5); dz = (az / around.length - z) * Math.min(1, w * 1.5);
        } else {
          // Pinch: towards the brush's middle, across the surface (not along its facing).
          let tx = centre[0] - x, ty = centre[1] - y, tz = centre[2] - z;
          const along = tx * area.x + ty * area.y + tz * area.z;
          tx -= area.x * along; ty -= area.y * along; tz -= area.z * along;
          dx = tx * w * 0.25; dy = ty * w * 0.25; dz = tz * w * 0.25;
          if (brush === "crease") { dx -= area.x * step * w * 0.6; dy -= area.y * step * w * 0.6; dz -= area.z * step * w * 0.6; }
        }
      } else if (brush === "flatten") {
        const off = (x - cen.x) * area.x + (y - cen.y) * area.y + (z - cen.z) * area.z;
        const k = Math.min(1, w * 1.2);
        dx = -area.x * off * k; dy = -area.y * off * k; dz = -area.z * off * k;
      } else if (brush === "draw") {
        dx = area.x * step * w; dy = area.y * step * w; dz = area.z * step * w;
      } else {
        this.vertexNormal(v, n);
        const s = brush === "inflate" ? step : -step;
        dx = n.x * s * w; dy = n.y * s * w; dz = n.z * s * w;
      }
      moves.push([v, dx, dy, dz]);
    }
    for (const [v, dx, dy, dz] of moves) { p[v * 3] += dx; p[v * 3 + 1] += dy; p[v * 3 + 2] += dz; this.moved(v); }
    this.rebin(moves.map((m) => m[0]));
  }

  /** Puts corners back where they were (undo of a stroke that only moved corners). */
  setPositions(corners: ArrayLike<number>, values: ArrayLike<number>) {
    const moved: number[] = [];
    for (let k = 0; k < corners.length; k += 1) {
      const v = corners[k];
      if (v >= this.vCount || !this.vAlive[v]) continue;
      this.pos[v * 3] = values[k * 3]; this.pos[v * 3 + 1] = values[k * 3 + 1]; this.pos[v * 3 + 2] = values[k * 3 + 2];
      this.moved(v);
      moved.push(v);
    }
    this.rebin(moved);
  }

  /** Move brush: corners grabbed at the stroke's start (with their weights) follow the cursor by `delta`. */
  drag(grabbed: Array<[number, number, number, number, number]>, delta: Vec3) {
    const p = this.pos;
    for (const [v, w, x, y, z] of grabbed) {
      if (!this.vAlive[v]) continue;
      p[v * 3] = x + delta[0] * w; p[v * 3 + 1] = y + delta[1] * w; p[v * 3 + 2] = z + delta[2] * w;
      this.moved(v);
    }
    this.rebin(grabbed.map((g) => g[0]).filter((v) => this.vAlive[v]));
  }

  // ---------------------------------------------------------------------------------------------
  // Refine: split, collapse, flip, relax (Botsch & Kobbelt)

  /** Splits edge a-b at its middle; returns the new corner. */
  splitEdge(a: number, b: number): number | null {
    const tris = this.edgeTriangles(a, b);
    if (!tris.length || tris.length > 2) return null;
    const p = this.pos;
    const m = this.addVertex((p[a * 3] + p[b * 3]) / 2, (p[a * 3 + 1] + p[b * 3 + 1]) / 2, (p[a * 3 + 2] + p[b * 3 + 2]) / 2);
    for (const t of tris) {
      const i = t * 3;
      const corners = [this.tri[i], this.tri[i + 1], this.tri[i + 2]];
      // Rotate so the triangle reads (x, y, c) with x-y being the edge in this triangle's order.
      let k = 0;
      while (!((corners[k] === a && corners[(k + 1) % 3] === b) || (corners[k] === b && corners[(k + 1) % 3] === a))) k += 1;
      const x = corners[k], y = corners[(k + 1) % 3], c = corners[(k + 2) % 3];
      // (x, y, c) becomes (x, m, c) and (m, y, c).
      this.retarget(t, y, m);
      this.addTriangle(m, y, c);
      this.dirtyV.add(c);
    }
    return m;
  }

  /** Collapses edge a-b to its middle, when that keeps the surface sound; returns whether it did. */
  collapseEdge(a: number, b: number, maxEdge: number): boolean {
    const shared = this.edgeTriangles(a, b);
    if (shared.length !== 2) return false;
    if (this.onBoundary(a) || this.onBoundary(b)) return false;
    const na = this.neighbours(a), nb = this.neighbours(b);
    // Link condition: a and b share exactly the two corners opposite the edge.
    let common = 0;
    for (const v of na) if (nb.includes(v)) common += 1;
    if (common !== 2) return false;
    const p = this.pos;
    const mx = (p[a * 3] + p[b * 3]) / 2, my = (p[a * 3 + 1] + p[b * 3 + 1]) / 2, mz = (p[a * 3 + 2] + p[b * 3 + 2]) / 2;
    // No new edge longer than the limit, no triangle turned over.
    for (const v of nb) if (v !== a && Math.hypot(p[v * 3] - mx, p[v * 3 + 1] - my, p[v * 3 + 2] - mz) > maxEdge) return false;
    const before = new THREE.Vector3(), after = new THREE.Vector3();
    const saved = [p[a * 3], p[a * 3 + 1], p[a * 3 + 2], p[b * 3], p[b * 3 + 1], p[b * 3 + 2]];
    const fans = [...new Set([...this.vTris[a], ...this.vTris[b]])].filter((t) => !shared.includes(t));
    const normalsBefore = fans.map((t) => this.faceNormal(t, new THREE.Vector3()).normalize());
    p[a * 3] = mx; p[a * 3 + 1] = my; p[a * 3 + 2] = mz; p[b * 3] = mx; p[b * 3 + 1] = my; p[b * 3 + 2] = mz;
    let ok = true;
    fans.forEach((t, k) => {
      this.faceNormal(t, after);
      if (after.lengthSq() < 1e-14) { ok = false; return; }
      before.copy(normalsBefore[k]);
      if (after.normalize().dot(before) < 0.3) ok = false;
    });
    if (!ok) { p[a * 3] = saved[0]; p[a * 3 + 1] = saved[1]; p[a * 3 + 2] = saved[2]; p[b * 3] = saved[3]; p[b * 3 + 1] = saved[4]; p[b * 3 + 2] = saved[5]; return false; }
    for (const t of shared) this.removeTriangle(t);
    for (const t of [...this.vTris[b]]) this.retarget(t, b, a);
    this.vAlive[b] = 0;
    this.vGrid.remove(this.vCell[b], b);
    this.vTris[b] = [];
    this.moved(a);
    for (const t of this.vTris[a]) this.binTriangle(t);
    return true;
  }

  /** Flips edge a-b when that brings the four corners nearer six neighbours each. */
  flipEdge(a: number, b: number): boolean {
    const tris = this.edgeTriangles(a, b);
    if (tris.length !== 2) return false;
    const opposite = (t: number) => { for (let k = 0; k < 3; k += 1) { const v = this.tri[t * 3 + k]; if (v !== a && v !== b) return v; } return -1; };
    // t1 has a->b in order, t2 has b->a.
    let [t1, t2] = tris;
    const order = (t: number) => { for (let k = 0; k < 3; k += 1) if (this.tri[t * 3 + k] === a) return this.tri[t * 3 + ((k + 1) % 3)] === b; return false; };
    if (!order(t1)) [t1, t2] = [t2, t1];
    if (!order(t1) || order(t2)) return false;
    const c = opposite(t1), d = opposite(t2);
    if (c < 0 || d < 0 || c === d) return false;
    if (this.edgeTriangles(c, d).length) return false;
    const target = (v: number) => (this.onBoundary(v) ? 4 : 6);
    const va = this.vTris[a].length, vb = this.vTris[b].length, vc = this.vTris[c].length, vd = this.vTris[d].length;
    // Interior valence is the triangle count round a corner.
    const dev = (x: number, v: number) => (x - target(v)) ** 2;
    const now = dev(va, a) + dev(vb, b) + dev(vc, c) + dev(vd, d);
    const then = dev(va - 1, a) + dev(vb - 1, b) + dev(vc + 1, c) + dev(vd + 1, d);
    if (then >= now) return false;
    // The two new triangles must face the same way as the old pair.
    const n1 = this.faceNormal(t1, new THREE.Vector3()).normalize(), n2 = this.faceNormal(t2, new THREE.Vector3()).normalize();
    const p = this.pos;
    const normalOf = (x: number, y: number, z: number) => {
      const ux = p[y * 3] - p[x * 3], uy = p[y * 3 + 1] - p[x * 3 + 1], uz = p[y * 3 + 2] - p[x * 3 + 2];
      const vx = p[z * 3] - p[x * 3], vy = p[z * 3 + 1] - p[x * 3 + 1], vz = p[z * 3 + 2] - p[x * 3 + 2];
      return new THREE.Vector3(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    };
    const m1 = normalOf(c, a, d), m2 = normalOf(d, b, c);
    if (m1.lengthSq() < 1e-14 || m2.lengthSq() < 1e-14) return false;
    m1.normalize(); m2.normalize();
    if (n1.dot(n2) < 0.5 || m1.dot(n1) < 0.5 || m2.dot(n2) < 0.5 || m1.dot(m2) < 0.5) return false;
    // (a, b, c) -> (c, a, d); (b, a, d) -> (d, b, c)
    this.retarget(t1, b, d); // t1: a,d,c in some rotation -> set exactly
    this.tri[t1 * 3] = c; this.tri[t1 * 3 + 1] = a; this.tri[t1 * 3 + 2] = d;
    this.retarget(t2, a, c);
    this.tri[t2 * 3] = d; this.tri[t2 * 3 + 1] = b; this.tri[t2 * 3 + 2] = c;
    this.binTriangle(t1); this.binTriangle(t2);
    this.dirtyV.add(a); this.dirtyV.add(b); this.dirtyV.add(c); this.dirtyV.add(d);
    this.topologyChanged = true;
    this.topologyEdits += 1;
    return true;
  }

  /**
   * Keeps the triangles touching `corners` near `target` edge length: splits, collapses, flips, then a
   * relax along the surface. `project` (optional) puts a moved corner back onto a surface. Bounded work.
   */
  refine(corners: Iterable<number>, target: number, options: { relax?: boolean; project?: (p: THREE.Vector3) => void; budget?: number; fixed?: (v: number) => boolean; within?: { centre: Vec3; radius: number }; milliseconds?: number } = {}) {
    // Splitting makes new edges out to the corners beyond: without a bound the refinement would creep
    // over the whole part. Only edges whose middle is inside `within` (the brush's ball) are split.
    const ball = options.within;
    const inside = (a: number, b: number) => {
      if (!ball) return true;
      const p = this.pos, c = ball.centre;
      return ((p[a * 3] + p[b * 3]) / 2 - c[0]) ** 2 + ((p[a * 3 + 1] + p[b * 3 + 1]) / 2 - c[1]) ** 2 + ((p[a * 3 + 2] + p[b * 3 + 2]) / 2 - c[2]) ** 2 <= ball.radius * ball.radius;
    };
    const hi = target * (4 / 3), lo = target * (4 / 5);
    let work = options.budget ?? 20000;
    const until = options.milliseconds ? performance.now() + options.milliseconds : Infinity;
    const late = () => performance.now() > until;
    const region = new Set<number>();
    for (const v of corners) if (this.vAlive[v]) region.add(v);
    const edgesOf = () => {
      const out: Array<[number, number]> = [];
      const seen = new Set<number>();
      for (const v of region) {
        if (!this.vAlive[v]) continue;
        for (const w of this.neighbours(v)) {
          const a = Math.min(v, w), b = Math.max(v, w), key = a * 4294967296 + b;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push([a, b]);
        }
      }
      return out;
    };
    // Split, longest first, re-queueing the halves.
    const queue = edgesOf().filter(([a, b]) => this.dist(a, b) > hi && inside(a, b)).sort((e, f) => this.dist(f[0], f[1]) - this.dist(e[0], e[1]));
    for (let q = 0; q < queue.length && work > 0; q += 1) {
      if ((q & 31) === 0 && late()) break;
      const [a, b] = queue[q];
      if (!this.vAlive[a] || !this.vAlive[b] || this.dist(a, b) <= hi) continue;
      if (options.fixed && (options.fixed(a) || options.fixed(b))) continue;
      const m = this.splitEdge(a, b);
      work -= 1;
      if (m === null) continue;
      region.add(m);
      if (options.project) { const q = new THREE.Vector3(this.pos[m * 3], this.pos[m * 3 + 1], this.pos[m * 3 + 2]); options.project(q); this.pos[m * 3] = q.x; this.pos[m * 3 + 1] = q.y; this.pos[m * 3 + 2] = q.z; this.moved(m); }
      for (const w of this.neighbours(m)) if (this.dist(m, w) > hi && inside(m, w)) queue.push([Math.min(m, w), Math.max(m, w)]);
    }
    // Collapse the short ones.
    for (const [a, b] of late() ? [] : edgesOf()) {
      if (work <= 0 || late()) break;
      if (!this.vAlive[a] || !this.vAlive[b] || this.dist(a, b) >= lo || !inside(a, b)) continue;
      if (options.fixed && (options.fixed(a) || options.fixed(b))) continue;
      if (this.collapseEdge(a, b, hi)) { work -= 1; region.delete(b); }
    }
    // Flip towards six neighbours a corner.
    for (const [a, b] of late() ? [] : edgesOf()) {
      if (work <= 0 || late()) break;
      if (!this.vAlive[a] || !this.vAlive[b]) continue;
      if (this.flipEdge(a, b)) work -= 1;
    }
    // Relax: each corner towards the middle of its neighbours, along the surface only.
    if (options.relax !== false && !late()) {
      const n = new THREE.Vector3(), q = new THREE.Vector3();
      const moves: Array<[number, number, number, number]> = [];
      for (const v of region) {
        if (!this.vAlive[v] || this.onBoundary(v) || (options.fixed && options.fixed(v))) continue;
        const around = this.neighbours(v);
        if (around.length < 3) continue;
        let ax = 0, ay = 0, az = 0;
        for (const u of around) { ax += this.pos[u * 3]; ay += this.pos[u * 3 + 1]; az += this.pos[u * 3 + 2]; }
        ax /= around.length; ay /= around.length; az /= around.length;
        this.vertexNormal(v, n);
        let dx = ax - this.pos[v * 3], dy = ay - this.pos[v * 3 + 1], dz = az - this.pos[v * 3 + 2];
        const along = dx * n.x + dy * n.y + dz * n.z;
        dx -= n.x * along; dy -= n.y * along; dz -= n.z * along;
        moves.push([v, this.pos[v * 3] + dx * 0.5, this.pos[v * 3 + 1] + dy * 0.5, this.pos[v * 3 + 2] + dz * 0.5]);
      }
      for (const [v, x, y, z] of moves) {
        q.set(x, y, z);
        if (options.project) options.project(q);
        this.pos[v * 3] = q.x; this.pos[v * 3 + 1] = q.y; this.pos[v * 3 + 2] = q.z;
        this.moved(v);
      }
      this.rebin(moves.map((m) => m[0]));
    }
    return region;
  }

  // ---------------------------------------------------------------------------------------------
  // Out

  /** Living corners and triangles, renumbered from zero. */
  compact(): { points: Float64Array; triangles: Uint32Array } {
    const map = new Int32Array(this.vCount).fill(-1);
    let n = 0;
    for (let v = 0; v < this.vCount; v += 1) if (this.vAlive[v] && this.vTris[v].length) map[v] = n++;
    const points = new Float64Array(n * 3);
    for (let v = 0; v < this.vCount; v += 1) if (map[v] >= 0) { points[map[v] * 3] = this.pos[v * 3]; points[map[v] * 3 + 1] = this.pos[v * 3 + 1]; points[map[v] * 3 + 2] = this.pos[v * 3 + 2]; }
    const tris: number[] = [];
    for (let t = 0; t < this.tCount; t += 1) if (this.tAlive[t]) tris.push(map[this.tri[t * 3]], map[this.tri[t * 3 + 1]], map[this.tri[t * 3 + 2]]);
    return { points, triangles: Uint32Array.from(tris) };
  }
  /** The surface as a triangle soup (9 numbers a triangle), in triangle order. */
  soup(): Float32Array {
    let m = 0;
    for (let t = 0; t < this.tCount; t += 1) if (this.tAlive[t]) m += 1;
    const out = new Float32Array(m * 9);
    let o = 0;
    for (let t = 0; t < this.tCount; t += 1) {
      if (!this.tAlive[t]) continue;
      for (let k = 0; k < 3; k += 1) { const v = this.tri[t * 3 + k] * 3; out[o++] = this.pos[v]; out[o++] = this.pos[v + 1]; out[o++] = this.pos[v + 2]; }
    }
    return out;
  }
  triangleCount() { let m = 0; for (let t = 0; t < this.tCount; t += 1) if (this.tAlive[t]) m += 1; return m; }
  dispose() { this.geometry.dispose(); }
}

// -----------------------------------------------------------------------------------------------
// Whole-part tools on the same engine

/** Closest point on the original surface, for keeping a remeshed part on it. */
export function surfaceProjector(source: LiveMesh) {
  const snapshot = source.compact();
  const h = Math.max(0.5, source.averageEdge(sampleCorners(source, 2000)) * 3);
  const grid = new Map<number, number[]>();
  const key = (ix: number, iy: number, iz: number) => ((ix + OFF) * K + (iy + OFF)) * K + (iz + OFF);
  const P = snapshot.points, T = snapshot.triangles;
  for (let t = 0; t < T.length / 3; t += 1) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k += 1) { const v = T[t * 3 + k] * 3; x0 = Math.min(x0, P[v]); x1 = Math.max(x1, P[v]); y0 = Math.min(y0, P[v + 1]); y1 = Math.max(y1, P[v + 1]); z0 = Math.min(z0, P[v + 2]); z1 = Math.max(z1, P[v + 2]); }
    for (let ix = Math.floor(x0 / h); ix <= Math.floor(x1 / h); ix += 1) for (let iy = Math.floor(y0 / h); iy <= Math.floor(y1 / h); iy += 1) for (let iz = Math.floor(z0 / h); iz <= Math.floor(z1 / h); iz += 1) {
      const k = key(ix, iy, iz); const list = grid.get(k); if (list) list.push(t); else grid.set(k, [t]);
    }
  }
  const tri = new THREE.Triangle(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3();
  return (p: THREE.Vector3) => {
    let best = Infinity;
    const out = p.clone();
    const ix = Math.floor(p.x / h), iy = Math.floor(p.y / h), iz = Math.floor(p.z / h);
    for (let ring = 1; ring <= 3 && !Number.isFinite(best); ring += 1) {
      for (let ox = -ring; ox <= ring; ox += 1) for (let oy = -ring; oy <= ring; oy += 1) for (let oz = -ring; oz <= ring; oz += 1) {
        const list = grid.get(key(ix + ox, iy + oy, iz + oz));
        if (!list) continue;
        for (const t of list) {
          a.fromArray(P, T[t * 3] * 3); b.fromArray(P, T[t * 3 + 1] * 3); c.fromArray(P, T[t * 3 + 2] * 3);
          tri.set(a, b, c).closestPointToPoint(p, q);
          const d = q.distanceToSquared(p);
          if (d < best) { best = d; out.copy(q); }
        }
      }
    }
    p.copy(out);
  };
}

function sampleCorners(mesh: LiveMesh, count: number) {
  const out: number[] = [];
  const stride = Math.max(1, Math.floor(mesh.vCount / count));
  for (let v = 0; v < mesh.vCount; v += stride) if (mesh.vAlive[v]) out.push(v);
  return out;
}

/** A sensible target edge for Remesh: the part's present average edge. */
export function averageEdgeOf(mesh: LiveMesh) { return mesh.averageEdge(sampleCorners(mesh, 5000)); }

/**
 * Remesh: the whole part to triangles of about `edge` mm, kept on its own surface (corners pulled back
 * onto the original after every move), the rim of an open scan kept where it is.
 */
export function remeshLive(mesh: LiveMesh, edge: number, passes = 5, onProgress?: (fraction: number) => void) {
  const project = surfaceProjector(mesh);
  for (let pass = 0; pass < passes; pass += 1) {
    const all: number[] = [];
    for (let v = 0; v < mesh.vCount; v += 1) if (mesh.vAlive[v]) all.push(v);
    mesh.refine(all, edge, { project, budget: Number.MAX_SAFE_INTEGER, fixed: (v) => mesh.onBoundary(v) });
    onProgress?.((pass + 1) / passes);
  }
}

/** Offset: every corner moved `amount` mm along its smoothed normal, then evened out (Remesh, one pass). */
export function offsetLive(mesh: LiveMesh, amount: number) {
  const normals = smoothedNormals(mesh);
  for (let v = 0; v < mesh.vCount; v += 1) {
    if (!mesh.vAlive[v]) continue;
    mesh.pos[v * 3] += normals[v * 3] * amount; mesh.pos[v * 3 + 1] += normals[v * 3 + 1] * amount; mesh.pos[v * 3 + 2] += normals[v * 3 + 2] * amount;
  }
}

function smoothedNormals(mesh: LiveMesh) {
  const out = new Float64Array(mesh.vCount * 3);
  const n = new THREE.Vector3();
  for (let v = 0; v < mesh.vCount; v += 1) { if (!mesh.vAlive[v]) continue; mesh.vertexNormal(v, n); out[v * 3] = n.x; out[v * 3 + 1] = n.y; out[v * 3 + 2] = n.z; }
  // Two passes of averaging with the neighbours keep a sharp edge from tearing.
  for (let pass = 0; pass < 2; pass += 1) {
    const next = out.slice();
    for (let v = 0; v < mesh.vCount; v += 1) {
      if (!mesh.vAlive[v]) continue;
      let x = out[v * 3], y = out[v * 3 + 1], z = out[v * 3 + 2];
      for (const w of mesh.neighbours(v)) { x += out[w * 3]; y += out[w * 3 + 1]; z += out[w * 3 + 2]; }
      const l = Math.hypot(x, y, z) || 1;
      next[v * 3] = x / l; next[v * 3 + 1] = y / l; next[v * 3 + 2] = z / l;
    }
    out.set(next);
  }
  return out;
}

/**
 * Thicken: a surface (an open scan too) made a closed shell `thickness` mm thick, centred on it - one
 * side moved out by half, a copy moved in by half and turned over, the open rims joined by a strip.
 * Returns the shell as a soup.
 */
export function thickenSoup(mesh: LiveMesh, thickness: number): Float32Array {
  const normals = smoothedNormals(mesh);
  const { points, triangles } = mesh.compact();
  // compact() renumbers; normals follow the same order.
  const order: number[] = [];
  for (let v = 0; v < mesh.vCount; v += 1) if (mesh.vAlive[v] && mesh.vTris[v].length) order.push(v);
  const n = points.length / 3;
  const half = thickness / 2;
  const outer = new Float64Array(n * 3), inner = new Float64Array(n * 3);
  order.forEach((v, i) => {
    for (let k = 0; k < 3; k += 1) {
      outer[i * 3 + k] = points[i * 3 + k] + normals[v * 3 + k] * half;
      inner[i * 3 + k] = points[i * 3 + k] - normals[v * 3 + k] * half;
    }
  });
  const soup: number[] = [];
  const put = (arr: Float64Array, i: number) => soup.push(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2];
    put(outer, a); put(outer, b); put(outer, c);
    put(inner, a); put(inner, c); put(inner, b);
  }
  // The rim: edges with one triangle, joined outer to inner.
  const count = new Map<string, number>();
  for (let t = 0; t < triangles.length; t += 3) for (let k = 0; k < 3; k += 1) {
    const a = triangles[t + k], b = triangles[t + ((k + 1) % 3)];
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  for (let t = 0; t < triangles.length; t += 3) for (let k = 0; k < 3; k += 1) {
    const a = triangles[t + k], b = triangles[t + ((k + 1) % 3)];
    if (count.get(a < b ? `${a},${b}` : `${b},${a}`) !== 1) continue;
    // Edge a->b runs this way on the outer side: the strip is (outer b, outer a, inner a) and (outer b, inner a, inner b).
    put(outer, b); put(outer, a); put(inner, a);
    put(outer, b); put(inner, a); put(inner, b);
  }
  return Float32Array.from(soup);
}
