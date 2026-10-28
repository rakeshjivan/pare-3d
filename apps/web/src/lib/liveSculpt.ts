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

/**
 * Build 89: Meshmixer's brushes. "smooth" is RobustSmooth (weighted by the triangles' shape, so uneven
 * triangles do not throw it off); "shrinkSmooth" the plain smooth of builds 73-88 (each corner to its
 * neighbours' plain average, which pulls the surface in), "bubbleSmooth" smooths
 * and keeps the volume (bumps round off rather than sink); "drag" pulls the surface along the stroke;
 * "draw2" raises the surface to a set height above where it was when the stroke began, and no further.
 */
export type LiveBrush = "draw" | "draw2" | "drag" | "inflate" | "deflate" | "smooth" | "shrinkSmooth" | "bubbleSmooth" | "flatten" | "pinch" | "crease" | "move";
type DabBrush = Exclude<LiveBrush, "move">;
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

/** Corners (x y z alive, four numbers each) and triangles (a b c alive) to put back, with the counts in use. */
export type LivePatch = { vCount: number; tCount: number; verts: Int32Array; vData: Float64Array; tris: Int32Array; tData: Int32Array };

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
    // Build 75: welded through a numeric hash table on the rounded corner, not a Map of text keys -
    // a full-arch scan (a million corners) opens in a fraction of the time.
    const corners = Math.floor(soup.length / 9) * 3;
    let cap = 1024;
    while (cap < corners * 2) cap *= 2;
    const mask = cap - 1;
    const table = new Int32Array(cap).fill(-1);
    const keys = new Float64Array(corners * 3);
    const points = new Float64Array(corners * 3);
    const tris = new Int32Array(corners);
    let count = 0, made = 0;
    const ids = [0, 0, 0];
    for (let i = 0; i + 8 < soup.length; i += 9) {
      for (let k = 0; k < 3; k += 1) {
        const x = soup[i + k * 3], y = soup[i + k * 3 + 1], z = soup[i + k * 3 + 2];
        const rx = Math.round(x * 1e5), ry = Math.round(y * 1e5), rz = Math.round(z * 1e5);
        let h = (Math.imul(rx | 0, 73856093) ^ Math.imul(ry | 0, 19349663) ^ Math.imul(rz | 0, 83492791)) & mask;
        let id = -1;
        for (;;) {
          const at = table[h];
          if (at < 0) break;
          if (keys[at * 3] === rx && keys[at * 3 + 1] === ry && keys[at * 3 + 2] === rz) { id = at; break; }
          h = (h + 1) & mask;
        }
        if (id < 0) {
          id = count; count += 1; table[h] = id;
          keys[id * 3] = rx; keys[id * 3 + 1] = ry; keys[id * 3 + 2] = rz;
          points[id * 3] = x; points[id * 3 + 1] = y; points[id * 3 + 2] = z;
        }
        ids[k] = id;
      }
      if (ids[0] !== ids[1] && ids[1] !== ids[2] && ids[0] !== ids[2]) { tris[made] = ids[0]; tris[made + 1] = ids[1]; tris[made + 2] = ids[2]; made += 3; }
    }
    return new LiveMesh(points.subarray(0, count * 3), tris.subarray(0, made));
  }

  // ---------------------------------------------------------------------------------------------
  // Basics

  dist(a: number, b: number) {
    const p = this.pos;
    const x = p[a * 3] - p[b * 3], y = p[a * 3 + 1] - p[b * 3 + 1], z = p[a * 3 + 2] - p[b * 3 + 2];
    return Math.sqrt(x * x + y * y + z * z);
  }
  private cellOfVertex(v: number) { return this.vGrid.cellOf(this.pos[v * 3], this.pos[v * 3 + 1], this.pos[v * 3 + 2]); }
  private binTriangle(t: number) {
    if (this.bulk) return;
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
  private rebin(corners: ArrayLike<number>, count = corners.length) {
    // Build 85: each triangle once, by a stamp per triangle rather than a set made on every dab.
    if (this.binMark.length < this.tri.length / 3) this.binMark = new Int32Array(this.tri.length / 3);
    const mark = this.binMark, stamp = ++this.binStamp;
    for (let i = 0; i < count; i += 1) for (const t of this.vTris[corners[i]]) if (mark[t] !== stamp) { mark[t] = stamp; this.binTriangle(t); }
  }
  private binMark = new Int32Array(0);
  private binStamp = 0;
  /** Build 85: scratch for the brushes, kept between dabs so a stroke makes next to no garbage. */
  private faceScratch = new THREE.Vector3();
  private normalMark = new Int32Array(0);
  private normalStamp = 0;
  private normalList = new Int32Array(4096);
  private dabN = new THREE.Vector3();
  private dabArea = new THREE.Vector3();
  private dabCen = new THREE.Vector3();
  private dabMoves = new Float64Array(4096);
  private dabCorners = new Int32Array(1024);
  /** After a corner moved: its grid cell, and the cells of its triangles. */
  private moved(v: number) {
    if (this.bulk) { this.dirtyV.add(v); return; }
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
    if (v < this.rim.length) this.rim[v] = -1;
    if (!this.bulk) { this.vCell[v] = this.cellOfVertex(v); this.vGrid.add(this.vCell[v], v); }
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
    this.note(t);
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
    this.note(t);
    for (let k = 0; k < 3; k += 1) if (this.tri[t * 3 + k] === from) this.tri[t * 3 + k] = to;
    const list = this.vTris[from], at = list.indexOf(t);
    if (at >= 0) { list[at] = list[list.length - 1]; list.pop(); }
    this.vTris[to].push(t);
    this.binTriangle(t);
    this.dirtyT.add(t);
  }
  // ---------------------------------------------------------------------------------------------
  // Undo: a stroke's changes as a pair of small patches (before and after), so a step back costs what
  // the stroke touched, not a rebuild of the whole part.

  private journal: Map<number, [number, number, number, number]> | null = null;
  private journalT = 0;
  private journalV = 0;
  private journalPos: Float64Array | null = null;
  private journalAlive: Uint8Array | null = null;
  /** Triangle t as it was when the patch began, the first time it changes. */
  private note(t: number) {
    if (this.journal && t < this.journalT && !this.journal.has(t)) this.journal.set(t, [this.tri[t * 3], this.tri[t * 3 + 1], this.tri[t * 3 + 2], this.tAlive[t]]);
  }
  /** Starts recording changes (call before a stroke). */
  beginPatch() {
    this.beginStroke();
    this.journal = new Map();
    this.journalT = this.tCount;
    this.journalV = this.vCount;
    // Build 87: the copy goes into buffers kept from stroke to stroke - a fresh 5 MB copy at every
    // stroke's start (on a full-arch scan) was garbage the browser then had to clear up.
    if (this.patchPos.length < this.vCount * 3) this.patchPos = new Float64Array(Math.ceil(this.vCount * 1.25) * 3);
    if (this.patchAlive.length < this.vCount) this.patchAlive = new Uint8Array(Math.ceil(this.vCount * 1.25));
    this.patchPos.set(this.pos.subarray(0, this.vCount * 3));
    this.patchAlive.set(this.vAlive.subarray(0, this.vCount));
    this.journalPos = this.patchPos;
    this.journalAlive = this.patchAlive;
  }
  private patchPos = new Float64Array(0);
  private patchAlive = new Uint8Array(0);
  /** Ends recording: the patches that take the mesh back to the start and forward again, or null if nothing changed. */
  endPatch(): { undo: LivePatch; redo: LivePatch } | null {
    const journal = this.journal, oldPos = this.journalPos, oldAlive = this.journalAlive;
    this.journal = null; this.journalPos = null; this.journalAlive = null;
    if (!journal || !oldPos || !oldAlive) return null;
    const oldV = this.journalV, oldT = this.journalT, p = this.pos;
    const changed: number[] = [];
    for (let v = 0; v < oldV; v += 1) {
      if (p[v * 3] !== oldPos[v * 3] || p[v * 3 + 1] !== oldPos[v * 3 + 1] || p[v * 3 + 2] !== oldPos[v * 3 + 2] || this.vAlive[v] !== oldAlive[v]) changed.push(v);
    }
    if (!changed.length && !journal.size && this.vCount === oldV && this.tCount === oldT) return null;
    const vertexData = (list: number[], from: Float64Array, alive: Uint8Array) => {
      const out = new Float64Array(list.length * 4);
      list.forEach((v, k) => { out[k * 4] = from[v * 3]; out[k * 4 + 1] = from[v * 3 + 1]; out[k * 4 + 2] = from[v * 3 + 2]; out[k * 4 + 3] = alive[v]; });
      return out;
    };
    const undoTris = [...journal.keys()];
    const undoTData = new Int32Array(undoTris.length * 4);
    undoTris.forEach((t, k) => undoTData.set(journal.get(t)!, k * 4));
    const redoVerts = changed.slice();
    for (let v = oldV; v < this.vCount; v += 1) redoVerts.push(v);
    const redoTris = undoTris.slice();
    for (let t = oldT; t < this.tCount; t += 1) redoTris.push(t);
    const redoTData = new Int32Array(redoTris.length * 4);
    redoTris.forEach((t, k) => { redoTData[k * 4] = this.tri[t * 3]; redoTData[k * 4 + 1] = this.tri[t * 3 + 1]; redoTData[k * 4 + 2] = this.tri[t * 3 + 2]; redoTData[k * 4 + 3] = this.tAlive[t]; });
    return {
      undo: { vCount: oldV, tCount: oldT, verts: Int32Array.from(changed), vData: vertexData(changed, oldPos, oldAlive), tris: Int32Array.from(undoTris), tData: undoTData },
      redo: { vCount: this.vCount, tCount: this.tCount, verts: Int32Array.from(redoVerts), vData: vertexData(redoVerts, p, this.vAlive), tris: Int32Array.from(redoTris), tData: redoTData },
    };
  }
  /** Puts the corners and triangles a patch lists back as it has them. */
  applyPatch(patch: LivePatch) {
    this.box = null;
    // Past the patch's counts: gone.
    for (let t = patch.tCount; t < this.tCount; t += 1) if (this.tAlive[t]) this.removeTriangle(t);
    for (let v = patch.vCount; v < this.vCount; v += 1) {
      if (this.vAlive[v]) { this.vGrid.remove(this.vCell[v], v); this.vAlive[v] = 0; }
      this.vTris[v] = [];
    }
    if (patch.vCount > this.vCount) {
      this.growVertices(patch.vCount - this.vCount);
      for (let v = this.vCount; v < patch.vCount; v += 1) { this.vAlive[v] = 0; this.vTris[v] = []; }
    }
    this.vCount = patch.vCount;
    if (patch.tCount > this.tCount) {
      this.growTriangles(patch.tCount - this.tCount);
      for (let t = this.tCount; t < patch.tCount; t += 1) { this.tAlive[t] = 0; this.tCells[t] = []; this.tBox[t * 6] = 2147483647; }
    }
    this.tCount = patch.tCount;
    // Corners first (positions, alive), then the triangles off their old corners and on to the new.
    const moved: number[] = [];
    for (let k = 0; k < patch.verts.length; k += 1) {
      const v = patch.verts[k], d = patch.vData;
      const was = this.vAlive[v], now = d[k * 4 + 3];
      if (was) this.vGrid.remove(this.vCell[v], v);
      this.pos[v * 3] = d[k * 4]; this.pos[v * 3 + 1] = d[k * 4 + 1]; this.pos[v * 3 + 2] = d[k * 4 + 2];
      this.vAlive[v] = now;
      if (now) { this.vCell[v] = this.cellOfVertex(v); this.vGrid.add(this.vCell[v], v); moved.push(v); }
      this.dirtyV.add(v);
    }
    for (let k = 0; k < patch.tris.length; k += 1) {
      const t = patch.tris[k];
      if (!this.tAlive[t]) continue;
      for (let j = 0; j < 3; j += 1) { const list = this.vTris[this.tri[t * 3 + j]], at = list.indexOf(t); if (at >= 0) { list[at] = list[list.length - 1]; list.pop(); } }
    }
    for (let k = 0; k < patch.tris.length; k += 1) {
      const t = patch.tris[k], d = patch.tData;
      this.tri[t * 3] = d[k * 4]; this.tri[t * 3 + 1] = d[k * 4 + 1]; this.tri[t * 3 + 2] = d[k * 4 + 2];
      this.tAlive[t] = d[k * 4 + 3];
      if (this.tAlive[t]) for (let j = 0; j < 3; j += 1) this.vTris[this.tri[t * 3 + j]].push(t);
    }
    for (let k = 0; k < patch.tris.length; k += 1) {
      const t = patch.tris[k];
      if (!this.tCells[t]) this.tCells[t] = [];
      // A triangle given new corners in the same grid box keeps its cells: they are still right.
      this.binTriangle(t);
      this.dirtyT.add(t);
      for (let j = 0; j < 3; j += 1) this.dirtyV.add(this.tri[t * 3 + j]);
    }
    this.rebin(moved);
    this.rim.fill(-1);
    if (patch.tris.length) { this.topologyChanged = true; this.topologyEdits += 1; }
  }

  /**
   * Build 76: closes an open loop of corners (in the order its edges run along the surface's rim) with
   * a fan from a new corner at its middle, facing the way the surface round it does. Returns the new corner.
   */
  fillLoop(loop: number[]): number {
    let x = 0, y = 0, z = 0;
    for (const v of loop) { x += this.pos[v * 3]; y += this.pos[v * 3 + 1]; z += this.pos[v * 3 + 2]; }
    const c = this.addVertex(x / loop.length, y / loop.length, z / loop.length);
    // A rim edge a -> b belongs to a triangle on the surface; the patch takes it the other way round.
    for (let i = 0; i < loop.length; i += 1) this.addTriangle(loop[(i + 1) % loop.length], loop[i], c);
    return c;
  }
  /**
   * Build 76: the open edges, as loops in the direction their triangles run (a loop's edge a -> b is a
   * triangle's own). At a corner two holes touch (a bow-tie) the next edge is found by walking round
   * that corner's triangles from the one the loop came in on, so each hole comes out as its own loop.
   */
  rimLoops(): number[][] {
    const key = (a: number, b: number) => a * 4294967296 + b;
    // Triangle owning each directed edge.
    const owner = new Map<number, number>();
    for (let t = 0; t < this.tCount; t += 1) {
      if (!this.tAlive[t]) continue;
      for (let k = 0; k < 3; k += 1) owner.set(key(this.tri[t * 3 + k], this.tri[t * 3 + ((k + 1) % 3)]), t);
    }
    const rim: Array<[number, number]> = [];
    for (const [k, t] of owner) {
      const a = Math.floor(k / 4294967296), b = k - a * 4294967296;
      if (!owner.has(key(b, a))) rim.push([a, b]);
      void t;
    }
    const used = new Set<number>();
    const third = (t: number, a: number, b: number) => { for (let k = 0; k < 3; k += 1) { const v = this.tri[t * 3 + k]; if (v !== a && v !== b) return v; } return -1; };
    /** From the rim edge u -> v, the rim edge that leaves v next, walking round v. */
    const nextOf = (u: number, v: number): number => {
      let t = owner.get(key(u, v))!;
      let from = u;
      for (let guard = 0; guard < 256; guard += 1) {
        const w = third(t, from, v);
        if (w < 0) return -1;
        // Leaving v in t is v -> w; the triangle on its other side holds w -> v.
        const across = owner.get(key(w, v));
        if (across === undefined) return w;
        from = w;
        t = across;
      }
      return -1;
    };
    const loops: number[][] = [];
    for (const [a0, b0] of rim) {
      if (used.has(key(a0, b0))) continue;
      const loop: number[] = [];
      let a = a0, b = b0, ok = false;
      for (let guard = 0; guard < 1_000_000; guard += 1) {
        used.add(key(a, b));
        loop.push(a);
        const c = nextOf(a, b);
        if (c < 0) break;
        if (b === a0 && c === b0) { ok = true; break; }
        if (used.has(key(b, c))) { ok = b === a0; break; }
        a = b; b = c;
      }
      if (ok && loop.length >= 3) loops.push(loop);
    }
    return loops;
  }
  /** Build 76: a new corner, and a new triangle (corners in the order the surface faces). */
  addCorner(x: number, y: number, z: number) { return this.addVertex(x, y, z); }
  addFace(a: number, b: number, c: number) { return this.addTriangle(a, b, c); }
  /** Build 76: the corners joined to v (the public form of the neighbour walk, for fairing). */
  around(v: number): number[] { return this.neighbours(v); }
  /** Build 76: moves corner v to (x, y, z), keeping the grids and drawing right. */
  moveTo(v: number, x: number, y: number, z: number) {
    this.pos[v * 3] = x; this.pos[v * 3 + 1] = y; this.pos[v * 3 + 2] = z;
    this.moved(v);
  }
  /** Build 76: puts the triangles round these corners in their grid cells again after `moveTo`. */
  settle(corners: number[]) { this.rebin(corners); }

  /** Whole-part work (Remesh, Offset): the grids are left alone while it runs and made again once at the end. */
  private bulk = false;
  beginBulk() { this.bulk = true; this.box = null; }
  endBulk() {
    this.box = null;
    this.bulk = false;
    let edge = 0, n = 0;
    for (let t = 0; t < this.tCount && n < 20000; t += Math.max(1, Math.floor(this.tCount / 20000))) if (this.tAlive[t]) { edge += this.dist(this.tri[t * 3], this.tri[t * 3 + 1]); n += 1; }
    const h = Math.max(0.5, (n ? edge / n : 1) * 3);
    this.vGrid = new Grid(h);
    this.tGrid = new Grid(h);
    for (let v = 0; v < this.vCount; v += 1) if (this.vAlive[v]) { this.vCell[v] = this.cellOfVertex(v); this.vGrid.add(this.vCell[v], v); this.dirtyV.add(v); }
    this.tBox.fill(2147483647);
    for (let t = 0; t < this.tCount; t += 1) { this.tCells[t] = []; if (this.tAlive[t]) this.binTriangle(t); }
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
  private regionMark = new Int32Array(0);
  private regionNow = 0;
  /** Whether each corner is on a rim: 1 yes, 0 no, -1 not known yet. A corner's own answer never changes
   * under split, collapse or flip (they keep rims as rims), so it is worked out once. */
  private rim = new Int8Array(0);
  /** The (one or two) triangles on edge a-b. */
  /** Build 85: whether a and b share a triangle (an edge), without making a list. */
  private hasEdge(a: number, b: number) {
    const tri = this.tri;
    for (const t of this.vTris[a]) { const i = t * 3; if (tri[i] === b || tri[i + 1] === b || tri[i + 2] === b) return true; }
    return false;
  }
  /** Whether triangle t runs a then b. */
  private runsAB(t: number, a: number, b: number) {
    const tri = this.tri;
    for (let k = 0; k < 3; k += 1) if (tri[t * 3 + k] === a) return tri[t * 3 + ((k + 1) % 3)] === b;
    return false;
  }
  /** The corner of t that is neither a nor b. */
  private oppositeOf(t: number, a: number, b: number) {
    for (let k = 0; k < 3; k += 1) { const v = this.tri[t * 3 + k]; if (v !== a && v !== b) return v; }
    return -1;
  }
  private flipN1 = new THREE.Vector3();
  private flipN2 = new THREE.Vector3();
  private flipM1 = new THREE.Vector3();
  private flipM2 = new THREE.Vector3();
  edgeTriangles(a: number, b: number): number[] {
    const out: number[] = [];
    for (const t of this.vTris[a]) { const i = t * 3; if (this.tri[i] === b || this.tri[i + 1] === b || this.tri[i + 2] === b) out.push(t); }
    return out;
  }
  /** Whether v is on an open edge (a scan's rim). */
  onBoundary(v: number) {
    if (this.rim.length <= v) { const next = new Int8Array(this.pos.length / 3).fill(-1); next.set(this.rim); this.rim = next; }
    if (this.rim[v] >= 0) return this.rim[v] === 1;
    // Round an inner corner there are as many neighbours as triangles; on a rim, one more (or the fan
    // is not a single disc).
    const on = this.neighbours(v).length !== this.vTris[v].length;
    this.rim[v] = on ? 1 : 0;
    return on;
  }
  private faceNormal(t: number, out = new THREE.Vector3()) {
    const p = this.pos, a = this.tri[t * 3] * 3, b = this.tri[t * 3 + 1] * 3, c = this.tri[t * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    return out.set(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  /** Whether t is a sliver: twice its area under 2% of its longest edge squared. `n` is its raw face normal. */
  private isSliver(t: number, n: THREE.Vector3) {
    const a = this.tri[t * 3], b = this.tri[t * 3 + 1], c = this.tri[t * 3 + 2];
    const l2 = Math.max(this.dist2(a, b), this.dist2(b, c), this.dist2(c, a));
    return n.lengthSq() < 0.0004 * l2 * l2;
  }
  private dist2(a: number, b: number) {
    const p = this.pos;
    const x = p[a * 3] - p[b * 3], y = p[a * 3 + 1] - p[b * 3 + 1], z = p[a * 3 + 2] - p[b * 3 + 2];
    return x * x + y * y + z * z;
  }
  private isSliverOf(a: number, b: number, c: number) {
    const p = this.pos;
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const l2 = Math.max(this.dist2(a, b), this.dist2(b, c), this.dist2(c, a));
    return (uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2 < 0.0004 * l2 * l2;
  }
  /** Area-weighted unit normal at v. */
  vertexNormal(v: number, out = new THREE.Vector3()) {
    out.set(0, 0, 0);
    const n = this.faceScratch;
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
    this.growBox(this.dirtyV);
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
    // Build 85: each corner once, by a stamp per corner, into a list kept between frames.
    if (this.normalMark.length < this.pos.length / 3) this.normalMark = new Int32Array(this.pos.length / 3);
    const mark = this.normalMark, stamp = ++this.normalStamp;
    let list = this.normalList, count = 0;
    const add = (v: number) => {
      if (mark[v] === stamp) return;
      mark[v] = stamp;
      if (count === list.length) { const next = new Int32Array(list.length * 2); next.set(list); list = this.normalList = next; }
      list[count++] = v;
    };
    for (const v of this.dirtyV) { if (!this.vAlive[v]) continue; add(v); for (const t of this.vTris[v]) for (let k = 0; k < 3; k += 1) add(this.tri[t * 3 + k]); }
    for (const t of this.dirtyT) for (let k = 0; k < 3; k += 1) add(this.tri[t * 3 + k]);
    const normalSet = list.subarray(0, count);
    const p = this.gPos.array as Float32Array, nArr = this.gNrm.array as Float32Array, idx = this.gIdx.array as Uint32Array;
    const n = this.dabN;
    for (const v of this.dirtyV) { p[v * 3] = this.pos[v * 3]; p[v * 3 + 1] = this.pos[v * 3 + 1]; p[v * 3 + 2] = this.pos[v * 3 + 2]; }
    for (const v of normalSet) { if (!this.vAlive[v]) continue; this.vertexNormal(v, n); nArr[v * 3] = n.x; nArr[v * 3 + 1] = n.y; nArr[v * 3 + 2] = n.z; }
    for (const t of this.dirtyT) {
      if (this.tAlive[t]) idx.set(this.tri.subarray(t * 3, t * 3 + 3), t * 3);
      else { idx[t * 3] = 0; idx[t * 3 + 1] = 0; idx[t * 3 + 2] = 0; }
    }
    const ranges = (set: Iterable<number>, attribute: THREE.BufferAttribute, width: number) => {
      const sorted = Int32Array.from(set).sort();
      attribute.clearUpdateRanges();
      let start = -1, end = -1;
      for (const i of sorted) {
        if (start < 0) { start = i; end = i; continue; }
        // Build 85: runs joined across gaps of up to 8192 entries, so a frame sends a few larger pieces
        // instead of dozens of small ones - each piece is a separate call to the graphics card, and in
        // the Mac app (WebKit) every call crosses to another process, which cost more than the bytes.
        if (i - end <= 8192) { end = i; continue; }
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
    const box = this.pickBounds();
    const ray = new THREE.Ray(new THREE.Vector3(...origin), d);
    const enter = ray.intersectBox(new THREE.Box3(new THREE.Vector3(...box.min).subScalar(h), new THREE.Vector3(...box.max).addScalar(h)), new THREE.Vector3());
    if (!enter) return null;
    let s = enter.distanceTo(ray.origin);
    // Triangles already tried, by a stamp per triangle instead of a set made on every pick.
    if (this.pickMark.length < this.tri.length / 3) this.pickMark = new Int32Array(this.tri.length / 3);
    const mark = this.pickMark, stamp = ++this.pickStamp;
    const dir: Vec3 = [d.x, d.y, d.z];
    let best: { point: Vec3; triangle: number; t: number } | null = null;
    const steps = Math.ceil((new THREE.Vector3(...box.max).sub(new THREE.Vector3(...box.min)).length() + 4 * h) / (h * 0.5)) + 4;
    const p = new THREE.Vector3();
    for (let step = 0; step < steps; step += 1) {
      ray.at(s, p);
      const cx = Math.floor(p.x / h), cy = Math.floor(p.y / h), cz = Math.floor(p.z / h);
      for (let ox = -1; ox <= 1; ox += 1) for (let oy = -1; oy <= 1; oy += 1) for (let oz = -1; oz <= 1; oz += 1) {
        const list = this.tGrid.cells.get(this.tGrid.key(cx + ox, cy + oy, cz + oz));
        if (!list) continue;
        for (let li = 0; li < list.length; li += 1) {
          const t = list[li];
          if (mark[t] === stamp) continue;
          mark[t] = stamp;
          const hit = this.rayTriangle(origin, dir, t);
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
  /**
   * Build 85: the box picking starts from, kept as corners move instead of found afresh by walking
   * every corner of the mesh on every dab (that walk was most of a dab's time on a full-arch scan).
   * It only grows while a stroke goes on - a box a little too big costs a step or two of the ray.
   */
  private box: { min: Vec3; max: Vec3 } | null = null;
  private pickMark = new Int32Array(0);
  private pickStamp = 0;
  private growBox(corners: Iterable<number>) {
    const box = this.box;
    if (!box) return;
    for (const v of corners) {
      if (!this.vAlive[v]) continue;
      for (let k = 0; k < 3; k += 1) { const x = this.pos[v * 3 + k]; if (x < box.min[k]) box.min[k] = x; if (x > box.max[k]) box.max[k] = x; }
    }
  }
  pickBounds() {
    if (!this.box) { const b = this.bounds(); this.box = { min: [...b.min] as Vec3, max: [...b.max] as Vec3 }; }
    else this.growBox(this.dirtyV);
    return this.box;
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
  dab(brush: DabBrush, centre: Vec3, normal: Vec3, radius: number, region: Map<number, number>, strength: number, step: number) {
    if (!region.size) return;
    const weight = (d: number) => { const x = 1 - (d / radius) ** 2; return x > 0 ? x * x * strength : 0; };
    const p = this.pos;
    const n = this.dabN;
    // The brush's own facing: the weighted normal of what it covers.
    const area = this.dabArea.set(0, 0, 0);
    const cen = this.dabCen.set(0, 0, 0);
    let total = 0;
    region.forEach((d, v) => {
      const w = weight(d);
      this.vertexNormal(v, n);
      area.addScaledVector(n, w);
      cen.x += p[v * 3] * w; cen.y += p[v * 3 + 1] * w; cen.z += p[v * 3 + 2] * w;
      total += w;
    });
    if (!total) return;
    cen.divideScalar(total);
    if (area.lengthSq() < 1e-12) area.set(...normal);
    area.normalize();
    // Moves are worked out from the positions before the dab, then applied together.
    if (this.dabMoves.length < region.size * 3) this.dabMoves = new Float64Array(region.size * 6);
    if (this.dabCorners.length < region.size) this.dabCorners = new Int32Array(region.size * 2);
    const moves = this.dabMoves, corners = this.dabCorners;
    let count = 0;
    for (const v of region.keys()) {
      const w = weight(region.get(v)!);
      if (!w) continue;
      const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
      let dx = 0, dy = 0, dz = 0;
      if (brush === "smooth" || brush === "shrinkSmooth" || brush === "bubbleSmooth" || brush === "pinch" || brush === "crease") {
        if (brush !== "pinch" && brush !== "crease") {
          let ax = 0, ay = 0, az = 0;
          if (brush === "smooth") {
            // RobustSmooth: the neighbours weighted by the shape of the triangles between them (the
            // cotangent weights of mean-curvature flow, Desbrun et al. 1999), so long thin triangles and
            // uneven spacing - a scan's, or a refined patch's - do not drag the corner sideways.
            if (!this.cotanMiddle(v, this.dabMid)) continue;
            ax = this.dabMid.x; ay = this.dabMid.y; az = this.dabMid.z;
          } else {
            const around = this.neighbours(v);
            if (!around.length) continue;
            for (const u of around) { ax += p[u * 3]; ay += p[u * 3 + 1]; az += p[u * 3 + 2]; }
            ax /= around.length; ay /= around.length; az /= around.length;
          }
          const k = Math.min(1, w * 1.5);
          dx = (ax - x) * k; dy = (ay - y) * k; dz = (az - z) * k;
          if (brush === "smooth") {
            // ...and only across the surface's facing: bumps and dents go, but nothing slides along the
            // surface, so the triangles stay where they are and a flat or gently curved patch stays put.
            this.vertexNormal(v, n);
            const along = dx * n.x + dy * n.y + dz * n.z;
            dx = n.x * along; dy = n.y * along; dz = n.z * along;
          }
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
      } else if (brush === "draw2") {
        // Up to `step` x 6 above where the corner was when the stroke began, along the facing it had then.
        let base = this.layerBase.get(v);
        if (!base) { this.vertexNormal(v, n); base = [x, y, z, n.x, n.y, n.z]; this.layerBase.set(v, base); }
        const desired = step * 6 * (w / Math.max(1e-6, strength));
        const gap = desired - ((x - base[0]) * base[3] + (y - base[1]) * base[4] + (z - base[2]) * base[5]);
        if (step >= 0 ? gap <= 0 : gap >= 0) continue;
        const rise = gap * 0.35;
        dx = base[3] * rise; dy = base[4] * rise; dz = base[5] * rise;
      } else if (brush === "drag") {
        // Along the stroke: the corners under the brush follow the brush's move since the last dab.
        const prev = this.dragPrev;
        if (!prev) continue;
        const k = Math.min(1, w * 1.4);
        dx = (centre[0] - prev[0]) * k; dy = (centre[1] - prev[1]) * k; dz = (centre[2] - prev[2]) * k;
      } else {
        this.vertexNormal(v, n);
        const s = brush === "inflate" ? step : -step;
        dx = n.x * s * w; dy = n.y * s * w; dz = n.z * s * w;
      }
      corners[count] = v; moves[count * 3] = dx; moves[count * 3 + 1] = dy; moves[count * 3 + 2] = dz;
      count += 1;
    }
    if (brush === "bubbleSmooth" && count) {
      // BubbleSmooth: whatever the smoothing took in along the brush's facing is given back evenly, so the
      // patch keeps its volume - a bump rounds off instead of sinking.
      let sunk = 0, spread = 0;
      for (let i = 0; i < count; i += 1) {
        const v = corners[i], w = weight(region.get(v)!);
        sunk += moves[i * 3] * area.x + moves[i * 3 + 1] * area.y + moves[i * 3 + 2] * area.z;
        spread += w;
      }
      if (spread > 0) {
        const back = -sunk / spread;
        for (let i = 0; i < count; i += 1) {
          const w = weight(region.get(corners[i])!);
          moves[i * 3] += area.x * back * w; moves[i * 3 + 1] += area.y * back * w; moves[i * 3 + 2] += area.z * back * w;
        }
      }
    }
    for (let i = 0; i < count; i += 1) { const v = corners[i]; p[v * 3] += moves[i * 3]; p[v * 3 + 1] += moves[i * 3 + 1]; p[v * 3 + 2] += moves[i * 3 + 2]; this.moved(v); }
    this.rebin(corners, count);
    if (brush === "drag") this.dragPrev = [centre[0], centre[1], centre[2]];
  }
  /** Build 89: Draw2's starting surface and Drag's last brush centre, for the stroke under way. */
  private dabMid = new THREE.Vector3();
  /**
   * The cotangent-weighted middle of v's neighbours: each neighbour weighted by the cotangents of the two
   * angles facing the edge to it (negative weights, from obtuse triangles, taken as none). False when v
   * has no usable neighbours.
   */
  private cotanMiddle(v: number, out: THREE.Vector3) {
    const p = this.pos, tri = this.tri;
    let sx = 0, sy = 0, sz = 0, sw = 0;
    const cot = (o: number, a: number, b: number) => {
      // The cotangent of the angle at o in the triangle o, a, b.
      const ux = p[a * 3] - p[o * 3], uy = p[a * 3 + 1] - p[o * 3 + 1], uz = p[a * 3 + 2] - p[o * 3 + 2];
      const vx = p[b * 3] - p[o * 3], vy = p[b * 3 + 1] - p[o * 3 + 1], vz = p[b * 3 + 2] - p[o * 3 + 2];
      const dot = ux * vx + uy * vy + uz * vz;
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      const cross = Math.sqrt(cx * cx + cy * cy + cz * cz);
      return cross > 1e-12 ? dot / cross : 0;
    };
    for (const t of this.vTris[v]) {
      const i = t * 3;
      // The triangle's other two corners, a and b: the angle at b faces edge v-a, the angle at a faces v-b.
      let a = tri[i], b = tri[i + 1];
      if (a === v) { a = tri[i + 1]; b = tri[i + 2]; } else if (b === v) { b = tri[i + 2]; }
      const wa = Math.max(0, cot(b, v, a)) / 2, wb = Math.max(0, cot(a, v, b)) / 2;
      sx += p[a * 3] * wa + p[b * 3] * wb; sy += p[a * 3 + 1] * wa + p[b * 3 + 1] * wb; sz += p[a * 3 + 2] * wa + p[b * 3 + 2] * wb;
      sw += wa + wb;
    }
    if (!(sw > 1e-12)) return false;
    out.set(sx / sw, sy / sw, sz / sw);
    return true;
  }
  private layerBase = new Map<number, [number, number, number, number, number, number]>();
  private dragPrev: Vec3 | null = null;
  /** Starts a stroke for the brushes that remember it (Draw2, Drag). beginPatch does this too. */
  beginStroke() { this.layerBase.clear(); this.dragPrev = null; }

  /** Puts corners back where they were (undo of a stroke that only moved corners). */
  setPositions(corners: ArrayLike<number>, values: ArrayLike<number>) {
    this.box = null;
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
  collapseEdge(a: number, b: number, maxEdge: number, at?: Vec3): boolean {
    const shared = this.edgeTriangles(a, b);
    if (shared.length !== 2) return false;
    if (this.onBoundary(a) || this.onBoundary(b)) return false;
    const na = this.neighbours(a), nb = this.neighbours(b);
    // Link condition: a and b share exactly the two corners opposite the edge.
    let common = 0;
    for (const v of na) if (nb.includes(v)) common += 1;
    if (common !== 2) return false;
    const p = this.pos;
    const mx = at ? at[0] : (p[a * 3] + p[b * 3]) / 2, my = at ? at[1] : (p[a * 3 + 1] + p[b * 3 + 1]) / 2, mz = at ? at[2] : (p[a * 3 + 2] + p[b * 3 + 2]) / 2;
    // No new edge longer than the limit, no triangle turned over.
    for (const v of nb) if (v !== a && Math.hypot(p[v * 3] - mx, p[v * 3 + 1] - my, p[v * 3 + 2] - mz) > maxEdge) return false;
    if (at) for (const v of na) if (v !== b && Math.hypot(p[v * 3] - mx, p[v * 3 + 1] - my, p[v * 3 + 2] - mz) > maxEdge) return false;
    const before = new THREE.Vector3(), after = new THREE.Vector3();
    const saved = [p[a * 3], p[a * 3 + 1], p[a * 3 + 2], p[b * 3], p[b * 3 + 1], p[b * 3 + 2]];
    const fans = [...new Set([...this.vTris[a], ...this.vTris[b]])].filter((t) => !shared.includes(t));
    // A sliver (thinner than about 1% of its length) has no facing worth keeping: a brush that pinched
    // the surface into a line leaves them, and refusing to collapse them would leave them for good.
    const normalsBefore = fans.map((t) => { const n = this.faceNormal(t, new THREE.Vector3()); return this.isSliver(t, n) ? null : n.normalize(); });
    p[a * 3] = mx; p[a * 3 + 1] = my; p[a * 3 + 2] = mz; p[b * 3] = mx; p[b * 3 + 1] = my; p[b * 3 + 2] = mz;
    let ok = true;
    fans.forEach((t, k) => {
      const was = normalsBefore[k];
      if (!was) return;
      this.faceNormal(t, after);
      if (after.lengthSq() < 1e-14) { ok = false; return; }
      before.copy(was);
      if (after.normalize().dot(before) < 0.3) ok = false;
    });
    if (!ok) { p[a * 3] = saved[0]; p[a * 3 + 1] = saved[1]; p[a * 3 + 2] = saved[2]; p[b * 3] = saved[3]; p[b * 3 + 1] = saved[4]; p[b * 3 + 2] = saved[5]; return false; }
    for (const t of shared) this.removeTriangle(t);
    for (const t of [...this.vTris[b]]) this.retarget(t, b, a);
    this.vAlive[b] = 0;
    if (!this.bulk) this.vGrid.remove(this.vCell[b], b);
    this.vTris[b] = [];
    this.moved(a);
    for (const t of this.vTris[a]) this.binTriangle(t);
    return true;
  }

  /** Flips edge a-b when that brings the four corners nearer six neighbours each. */
  flipEdge(a: number, b: number): boolean {
    // Build 85: no arrays, closures or vectors made before the (usual) early refusals - a refining
    // stroke tries hundreds of flips a frame, and their garbage was the biggest share of a stroke's.
    const tri = this.tri;
    let t1 = -1, t2 = -1, found = 0;
    for (const t of this.vTris[a]) {
      const i = t * 3;
      if (tri[i] === b || tri[i + 1] === b || tri[i + 2] === b) { if (found === 0) t1 = t; else t2 = t; found += 1; }
    }
    if (found !== 2) return false;
    // t1 has a->b in order, t2 has b->a.
    if (!this.runsAB(t1, a, b)) { const swap = t1; t1 = t2; t2 = swap; }
    if (!this.runsAB(t1, a, b) || this.runsAB(t2, a, b)) return false;
    const c = this.oppositeOf(t1, a, b), d = this.oppositeOf(t2, a, b);
    if (c < 0 || d < 0 || c === d) return false;
    if (this.hasEdge(c, d)) return false;
    const n1 = this.faceNormal(t1, this.flipN1), n2 = this.faceNormal(t2, this.flipN2);
    // A pair with a sliver: flipped when that makes the shared edge shorter (towards Delaunay), whatever the valences.
    const sliver = this.isSliver(t1, n1) || this.isSliver(t2, n2);
    const target = (v: number) => (this.onBoundary(v) ? 4 : 6);
    const va = this.vTris[a].length, vb = this.vTris[b].length, vc = this.vTris[c].length, vd = this.vTris[d].length;
    // Interior valence is the triangle count round a corner.
    const dev = (x: number, v: number) => (x - target(v)) ** 2;
    const now = dev(va, a) + dev(vb, b) + dev(vc, c) + dev(vd, d);
    const then = dev(va - 1, a) + dev(vb - 1, b) + dev(vc + 1, c) + dev(vd + 1, d);
    if (sliver ? this.dist(c, d) >= this.dist(a, b) : then >= now) return false;
    // The two new triangles must face the same way as the old pair (a sliver's own facing does not count).
    n1.normalize(); n2.normalize();
    const p = this.pos;
    const normalOf = (x: number, y: number, z: number, out: THREE.Vector3) => {
      const ux = p[y * 3] - p[x * 3], uy = p[y * 3 + 1] - p[x * 3 + 1], uz = p[y * 3 + 2] - p[x * 3 + 2];
      const vx = p[z * 3] - p[x * 3], vy = p[z * 3 + 1] - p[x * 3 + 1], vz = p[z * 3 + 2] - p[x * 3 + 2];
      return out.set(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    };
    const m1 = normalOf(c, a, d, this.flipM1), m2 = normalOf(d, b, c, this.flipM2);
    if (m1.lengthSq() < 1e-14 || m2.lengthSq() < 1e-14) return false;
    m1.normalize(); m2.normalize();
    if (sliver) { if (m1.dot(m2) < 0.5 || this.isSliverOf(c, a, d) || this.isSliverOf(d, b, c)) return false; }
    else if (n1.dot(n2) < 0.5 || m1.dot(n1) < 0.5 || m2.dot(n2) < 0.5 || m1.dot(m2) < 0.5) return false;
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
  refine(corners: Iterable<number>, target: number, options: { relax?: boolean; project?: (p: THREE.Vector3) => void; budget?: number; fixed?: (v: number) => boolean; within?: { centre: Vec3; radius: number }; milliseconds?: number; creaseAngle?: number; collapseBelow?: number; /** Build 85: flip and relax even when nothing was split or collapsed (Remesh). */ always?: boolean } = {}) {
    // Sharp edges (faces meeting at more than `creaseAngle` degrees) are kept, as in VCG's isotropic
    // remeshing (MeshLab): never flipped, collapsed only along their line, and their corners slide only
    // along it; where three or more meet (a box's corner) the corner stays put.
    const creaseCos = options.creaseAngle ? Math.cos((options.creaseAngle * Math.PI) / 180) : null;
    const na = new THREE.Vector3(), nb = new THREE.Vector3();
    const isCrease = (a: number, b: number) => {
      if (creaseCos === null) return false;
      const ts = this.edgeTriangles(a, b);
      if (ts.length !== 2) return true;
      this.faceNormal(ts[0], na); this.faceNormal(ts[1], nb);
      const l = na.length() * nb.length();
      return l > 0 && na.dot(nb) / l < creaseCos;
    };
    const creaseNeighbours = (v: number) => { const out: number[] = []; if (creaseCos !== null) for (const w of this.neighbours(v)) if (isCrease(v, w)) out.push(w); return out; };
    // Splitting makes new edges out to the corners beyond: without a bound the refinement would creep
    // over the whole part. Only edges whose middle is inside `within` (the brush's ball) are split.
    const ball = options.within;
    const inside = (a: number, b: number) => {
      if (!ball) return true;
      const p = this.pos, c = ball.centre;
      return ((p[a * 3] + p[b * 3]) / 2 - c[0]) ** 2 + ((p[a * 3 + 1] + p[b * 3 + 1]) / 2 - c[1]) ** 2 + ((p[a * 3 + 2] + p[b * 3 + 2]) / 2 - c[2]) ** 2 <= ball.radius * ball.radius;
    };
    // `collapseBelow` keeps detail finer than the target that was there before (a scan's own triangles):
    // only edges shorter than it are collapsed.
    const hi = target * (4 / 3), lo = Math.min(target * (4 / 5), options.collapseBelow ?? Infinity);
    let work = options.budget ?? 20000;
    const until = options.milliseconds ? performance.now() + options.milliseconds : Infinity;
    const late = () => performance.now() > until;
    const region = new Set<number>();
    for (const v of corners) if (this.vAlive[v]) region.add(v);
    /** The edges at the region's corners that pass `keep`, each once, as pairs (a < b) in a flat list. */
    const edgesOf = (keep?: (a: number, b: number) => boolean) => {
      const out: number[] = [];
      const mark = this.regionMark.length >= this.vCount ? this.regionMark : (this.regionMark = new Int32Array(this.pos.length / 3));
      const now = ++this.regionNow;
      for (const v of region) if (this.vAlive[v]) mark[v] = now;
      for (const v of region) {
        if (!this.vAlive[v]) continue;
        // Each edge once: from its smaller corner, or from the corner in the region when only one is.
        for (const w of this.neighbours(v)) {
          if (mark[w] === now && w < v) continue;
          const a = v < w ? v : w, b = v < w ? w : v;
          if (!keep || keep(a, b)) out.push(a, b);
        }
      }
      return out;
    };
    // Split, longest first, re-queueing the halves.
    const long = edgesOf((a, b) => this.dist(a, b) > hi && inside(a, b));
    const order = Array.from({ length: long.length / 2 }, (_, k) => k);
    const lengths = new Float64Array(order.length);
    for (let k = 0; k < order.length; k += 1) lengths[k] = this.dist(long[k * 2], long[k * 2 + 1]);
    order.sort((e, f) => lengths[f] - lengths[e]);
    const queue: Array<[number, number]> = order.map((k) => [long[k * 2], long[k * 2 + 1]]);
    // A guard against a run-away: never more splits in one call than eight per corner it started with.
    work = Math.min(work, Math.max(256, region.size * 8));
    const startWork = work;
    for (let q = 0; q < queue.length && work > 0; q += 1) {
      if ((q & 31) === 0 && late()) break;
      const [a, b] = queue[q];
      if (!this.vAlive[a] || !this.vAlive[b]) continue;
      const parent = this.dist(a, b);
      if (parent <= hi) continue;
      // A split moves neither end: only an edge between two held corners stays whole.
      if (options.fixed && options.fixed(a) && options.fixed(b)) continue;
      const m = this.splitEdge(a, b);
      work -= 1;
      if (m === null) continue;
      region.add(m);
      if (options.project) { const q = new THREE.Vector3(this.pos[m * 3], this.pos[m * 3 + 1], this.pos[m * 3 + 2]); options.project(q); this.pos[m * 3] = q.x; this.pos[m * 3 + 1] = q.y; this.pos[m * 3 + 2] = q.z; this.moved(m); }
      // Build 82: only an edge that came out shorter than the one split goes back in the queue. Pulled back
      // onto a rough surface (a ridge finer than the triangles), a new corner can land where its edges are
      // as long as before, and splitting on would never end (a full-arch Remesh ran for minutes).
      for (const w of this.neighbours(m)) { const d = this.dist(m, w); if (d > hi && d < parent * 0.95 && inside(m, w)) queue.push([Math.min(m, w), Math.max(m, w)]); }
    }
    // Collapse the short ones.
    const short = late() ? [] : edgesOf((a, b) => this.dist(a, b) < lo && inside(a, b));
    for (let e = 0; e < short.length; e += 2) {
      const a = short[e], b = short[e + 1];
      if (work <= 0 || ((e & 63) === 0 && late())) break;
      if (!this.vAlive[a] || !this.vAlive[b] || this.dist(a, b) >= lo || !inside(a, b)) continue;
      if (options.fixed && (options.fixed(a) || options.fixed(b))) continue;
      if (creaseCos !== null) {
        const ca = creaseNeighbours(a).length, cb = creaseNeighbours(b).length;
        if (ca || cb) {
          // Into the sharper corner, or along a sharp line between two of its corners; never two corners together.
          let keep = -1, gone = -1;
          if (!cb) { keep = a; gone = b; } else if (!ca) { keep = b; gone = a; }
          else if (isCrease(a, b)) { if (ca === 2 && cb !== 2) { keep = b; gone = a; } else if (cb === 2) { keep = a; gone = b; } }
          if (keep < 0) continue;
          const both = ca === 2 && cb === 2 && isCrease(a, b);
          const at: Vec3 = both ? [(this.pos[a * 3] + this.pos[b * 3]) / 2, (this.pos[a * 3 + 1] + this.pos[b * 3 + 1]) / 2, (this.pos[a * 3 + 2] + this.pos[b * 3 + 2]) / 2] : [this.pos[keep * 3], this.pos[keep * 3 + 1], this.pos[keep * 3 + 2]];
          if (this.collapseEdge(keep, gone, hi, at)) { work -= 1; region.delete(gone); }
          continue;
        }
      }
      if (this.collapseEdge(a, b, hi)) { work -= 1; region.delete(b); }
    }
    // Build 85: as Meshmixer's refinement - when nothing under the brush was split or collapsed, the
    // triangles are as they were after the last dab: flipping and relaxing them again every frame was
    // most of a refining stroke's time and changed nothing a person could see.
    if (options.always !== true && work === startWork) return region;
    // Flip towards six neighbours a corner.
    const all = late() ? [] : edgesOf();
    for (let e = 0; e < all.length; e += 2) {
      const a = all[e], b = all[e + 1];
      if (work <= 0 || ((e & 63) === 0 && late())) break;
      if (!this.vAlive[a] || !this.vAlive[b]) continue;
      if (creaseCos !== null && isCrease(a, b)) continue;
      if (options.fixed && options.fixed(a) && options.fixed(b)) continue;
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
        const sharp = creaseNeighbours(v);
        if (sharp.length) {
          // On a sharp line: along it, between its two neighbours on the line; a corner stays.
          if (sharp.length !== 2) continue;
          const [u, w] = sharp;
          const mx = (this.pos[u * 3] + this.pos[w * 3]) / 2, my = (this.pos[u * 3 + 1] + this.pos[w * 3 + 1]) / 2, mz = (this.pos[u * 3 + 2] + this.pos[w * 3 + 2]) / 2;
          moves.push([v, this.pos[v * 3] + (mx - this.pos[v * 3]) * 0.5, this.pos[v * 3 + 1] + (my - this.pos[v * 3 + 1]) * 0.5, this.pos[v * 3 + 2] + (mz - this.pos[v * 3 + 2]) * 0.5]);
          continue;
        }
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
    // Typed arrays throughout: this runs at the start of every refining stroke, on meshes of 300k+ triangles.
    const map = new Int32Array(this.vCount).fill(-1);
    let m = 0;
    for (let t = 0; t < this.tCount; t += 1) if (this.tAlive[t]) m += 1;
    const triangles = new Uint32Array(m * 3);
    let n = 0, o = 0;
    for (let t = 0; t < this.tCount; t += 1) {
      if (!this.tAlive[t]) continue;
      for (let k = 0; k < 3; k += 1) {
        const v = this.tri[t * 3 + k];
        if (map[v] < 0) map[v] = n++;
        triangles[o++] = map[v];
      }
    }
    const points = new Float64Array(n * 3);
    for (let v = 0; v < this.vCount; v += 1) {
      const w = map[v];
      if (w >= 0) { points[w * 3] = this.pos[v * 3]; points[w * 3 + 1] = this.pos[v * 3 + 1]; points[w * 3 + 2] = this.pos[v * 3 + 2]; }
    }
    return { points, triangles };
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
  // Cells about two edges across: a corner near the surface finds its closest point in its own cell,
  // and a neighbouring cell is only looked in when it could hold something nearer.
  const h = Math.max(0.05, source.averageEdge(sampleCorners(source, 2000)) * 2);
  const grid = new Map<number, number[]>();
  const key = (ix: number, iy: number, iz: number) => ((ix + OFF) * K + (iy + OFF)) * K + (iz + OFF);
  const P = snapshot.points, T = snapshot.triangles;
  for (let t = 0; t < T.length / 3; t += 1) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k += 1) { const v = T[t * 3 + k] * 3; x0 = Math.min(x0, P[v]); x1 = Math.max(x1, P[v]); y0 = Math.min(y0, P[v + 1]); y1 = Math.max(y1, P[v + 1]); z0 = Math.min(z0, P[v + 2]); z1 = Math.max(z1, P[v + 2]); }
    const cx0 = Math.floor(x0 / h), cx1 = Math.floor(x1 / h), cy0 = Math.floor(y0 / h), cy1 = Math.floor(y1 / h), cz0 = Math.floor(z0 / h), cz1 = Math.floor(z1 / h);
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) * (cz1 - cz0 + 1) > 4000) continue; // a huge base triangle: found by the wide search below
    for (let ix = cx0; ix <= cx1; ix += 1) for (let iy = cy0; iy <= cy1; iy += 1) for (let iz = cz0; iz <= cz1; iz += 1) {
      const k = key(ix, iy, iz); const list = grid.get(k); if (list) list.push(t); else grid.set(k, [t]);
    }
  }
  const huge: number[] = [];
  for (let t = 0; t < T.length / 3; t += 1) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k += 1) { const v = T[t * 3 + k] * 3; x0 = Math.min(x0, P[v]); x1 = Math.max(x1, P[v]); y0 = Math.min(y0, P[v + 1]); y1 = Math.max(y1, P[v + 1]); z0 = Math.min(z0, P[v + 2]); z1 = Math.max(z1, P[v + 2]); }
    if ((Math.floor(x1 / h) - Math.floor(x0 / h) + 1) * (Math.floor(y1 / h) - Math.floor(y0 / h) + 1) * (Math.floor(z1 / h) - Math.floor(z0 / h) + 1) > 4000) huge.push(t);
  }
  const seen = new Int32Array(T.length / 3);
  let stamp = 0;
  let bx = 0, by = 0, bz = 0, best = Infinity;
  /** Closest point on triangle t to (px py pz) (Ericson, Real-Time Collision Detection 5.1.5), kept if nearer. */
  const test = (t: number, px: number, py: number, pz: number) => {
    const ia = T[t * 3] * 3, ib = T[t * 3 + 1] * 3, ic = T[t * 3 + 2] * 3;
    const ax = P[ia], ay = P[ia + 1], az = P[ia + 2];
    const abx = P[ib] - ax, aby = P[ib + 1] - ay, abz = P[ib + 2] - az;
    const acx = P[ic] - ax, acy = P[ic + 1] - ay, acz = P[ic + 2] - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    let qx: number, qy: number, qz: number;
    if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
    else {
      const bpx = px - P[ib], bpy = py - P[ib + 1], bpz = pz - P[ib + 2];
      const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
      const cpx = px - P[ic], cpy = py - P[ic + 1], cpz = pz - P[ic + 2];
      const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
      const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
      if (d3 >= 0 && d4 <= d3) { qx = P[ib]; qy = P[ib + 1]; qz = P[ib + 2]; }
      else if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + abx * v; qy = ay + aby * v; qz = az + abz * v; }
      else if (d6 >= 0 && d5 <= d6) { qx = P[ic]; qy = P[ic + 1]; qz = P[ic + 2]; }
      else if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + acx * w; qy = ay + acy * w; qz = az + acz * w; }
      else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); qx = P[ib] + (P[ic] - P[ib]) * w; qy = P[ib + 1] + (P[ic + 1] - P[ib + 1]) * w; qz = P[ib + 2] + (P[ic + 2] - P[ib + 2]) * w; }
      else { const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w; }
    }
    const d = (qx - px) ** 2 + (qy - py) ** 2 + (qz - pz) ** 2;
    if (d < best) { best = d; bx = qx; by = qy; bz = qz; }
  };
  return (p: THREE.Vector3) => {
    best = Infinity;
    stamp += 1;
    const px = p.x, py = p.y, pz = p.z;
    const ix = Math.floor(px / h), iy = Math.floor(py / h), iz = Math.floor(pz / h);
    const cell = (ox: number, oy: number, oz: number) => {
      const list = grid.get(key(ix + ox, iy + oy, iz + oz));
      if (list) for (const t of list) if (seen[t] !== stamp) { seen[t] = stamp; test(t, px, py, pz); }
    };
    cell(0, 0, 0);
    // Rings outwards; a cell is looked in only when its nearest side is nearer than the best so far.
    for (let ring = 1; ring <= 3; ring += 1) {
      const reach = (ring - 1) * h + Math.min(px - ix * h, (ix + 1) * h - px, py - iy * h, (iy + 1) * h - py, pz - iz * h, (iz + 1) * h - pz);
      if (best <= reach * reach) break;
      for (let ox = -ring; ox <= ring; ox += 1) for (let oy = -ring; oy <= ring; oy += 1) for (let oz = -ring; oz <= ring; oz += 1) {
        if (Math.max(Math.abs(ox), Math.abs(oy), Math.abs(oz)) !== ring) continue;
        // Distance from p to that cell's box.
        const gx = ox > 0 ? (ix + ox) * h - px : ox < 0 ? px - (ix + ox + 1) * h : 0;
        const gy = oy > 0 ? (iy + oy) * h - py : oy < 0 ? py - (iy + oy + 1) * h : 0;
        const gz = oz > 0 ? (iz + oz) * h - pz : oz < 0 ? pz - (iz + oz + 1) * h : 0;
        if (gx * gx + gy * gy + gz * gz < best) cell(ox, oy, oz);
      }
    }
    for (const t of huge) test(t, px, py, pz);
    if (Number.isFinite(best)) p.set(bx, by, bz);
  };
}

function sampleCorners(mesh: LiveMesh, count: number) {
  const out: number[] = [];
  const stride = Math.max(1, Math.floor(mesh.vCount / count));
  for (let v = 0; v < mesh.vCount; v += stride) if (mesh.vAlive[v]) out.push(v);
  return out;
}

/** A sensible target edge for Remesh: the part's present average edge. */
/**
 * Build 82: how hard a brush works at a strength (0..1), set against Meshmixer 3.5 on a test plate
 * (16 mm strokes, a 3 mm brush, the same plate in both). Meshmixer's Draw grows with about the
 * square of its Strength and its Inflate more gently; one pass of its RobustSmooth takes away 19%,
 * 50% and 86% of 0.3 mm ridges at Strength 25, 53 and 100. Meshmixer puts down a dab at every
 * pointer event, so a slow stroke there builds up more than a quick one (0.13 to 0.83 mm at full
 * Strength); Pare 3D spaces its dabs by distance, so a stroke does the same whatever its speed, and
 * full strength is set between Meshmixer's quick and slow strokes.
 *   - strength: the weight each dab uses (lib dab multiplies its falloff by it)
 *   - step: the most a corner moves in one dab, as a share of the brush radius
 *   - passes: how many times each dab is applied (Smooth: more passes, not a bigger move)
 */
/** Build 85: how much more a stroke does than build 82's calibration - Meshmixer at a person's pace. */
export const BRUSH_PACE = 3.34;
export function brushResponse(brush: LiveBrush, strength: number): { strength: number; step: number; passes: number } {
  const s = Math.max(0, Math.min(1, strength));
  // Build 85: matched to Meshmixer at an ordinary, unhurried stroke (its slow stroke, a dab at each of
  // about 80 pointer events over 16 mm) rather than between its quick and slow ones - 1.67 times the
  // build 82 figures. Build 86: twice that again (3.34 times) - a hand stroke on a trackpad or a fast
  // mouse sends Meshmixer far more events than the test did, and side by side Pare 3D still felt weak.
  if (brush === "draw" || brush === "crease" || brush === "draw2") return { strength: s, step: BRUSH_PACE * 0.031 * s, passes: 1 };
  if (brush === "drag") return { strength: s, step: 0, passes: 1 };
  // Build 89: Flatten as Meshmixer's - one stroke over 0.3 mm ridges took away 16 / 44 / 84% at Strength
  // 25 / 51 / 100 there (a quick stroke); here about 25 / 60 / 88%, at a person's pace (it took away
  // 84% even at 25 before, far too strong at low settings).
  if (brush === "flatten") return { strength: 0.29 * Math.pow(s, 1.43), step: 0.06, passes: 1 };
  if (brush === "inflate" || brush === "deflate") return { strength: s, step: BRUSH_PACE * 0.021 * Math.pow(s, 0.3), passes: 1 };
  if (brush === "smooth" || brush === "shrinkSmooth" || brush === "bubbleSmooth") {
    // One pass at weight u takes away about 1 - exp(-0.87 u^0.73) of fine ridges; Meshmixer's
    // 19 / 50 / 86% at 25 / 53 / 100 is work W = 2.26 s^1.6 in those units, spread over passes
    // (build 85: times the same pace, capped so a full-strength stroke cannot wipe out a cusp in one go).
    const work = Math.min(3.4, BRUSH_PACE * 2.26 * Math.pow(s, 1.6));
    // No single pass past 0.8 of the work unit, so no corner moves past its neighbours' average.
    const passes = Math.max(1, Math.ceil(work / 0.8));
    return { strength: Math.pow(work / passes, 1 / 0.73), step: 0.06, passes };
  }
  return { strength: s, step: 0.06, passes: 1 };
}

/** Build 82: one dab of a brush at a point, as brushResponse sets it (Ctrl: Draw and Crease dig in). */
export function stampBrush(mesh: LiveMesh, brush: Exclude<LiveBrush, "move">, centre: Vec3, normal: Vec3, radius: number, triangle: number, strength: number, dig = false) {
  const response = brushResponse(brush, strength);
  const step = radius * response.step * (dig ? -1 : 1);
  for (let k = 0; k < response.passes; k += 1) {
    mesh.dab(brush, centre, normal, radius, mesh.region(centre, radius, triangle), response.strength, step);
  }
}

export function averageEdgeOf(mesh: LiveMesh) { return mesh.averageEdge(sampleCorners(mesh, 5000)); }

/**
 * Remesh: the whole part to triangles of about `edge` mm, kept on its own surface (corners pulled back
 * onto the original after every move), the rim of an open scan kept where it is.
 */
/** Faces meeting at more than this (degrees) make a sharp edge that Remesh keeps (a model's base, a cut). */
export const REMESH_CREASE_ANGLE = 40;
export function remeshLive(mesh: LiveMesh, edge: number, passes = 5, onProgress?: (fraction: number) => void) {
  const project = surfaceProjector(mesh);
  mesh.beginBulk();
  try { remeshPasses(mesh, edge, passes, project, onProgress); } finally { mesh.endBulk(); }
}
function remeshPasses(mesh: LiveMesh, edge: number, passes: number, project: (p: THREE.Vector3) => void, onProgress?: (fraction: number) => void) {
  for (let pass = 0; pass < passes; pass += 1) {
    const all: number[] = [];
    for (let v = 0; v < mesh.vCount; v += 1) if (mesh.vAlive[v]) all.push(v);
    mesh.refine(all, edge, { project, budget: Number.MAX_SAFE_INTEGER, fixed: (v) => mesh.onBoundary(v), creaseAngle: REMESH_CREASE_ANGLE, always: true });
    onProgress?.((pass + 1) / passes);
  }
}

/** Offset: every corner moved `amount` mm along its smoothed normal, then evened out (Remesh, one pass). */
export function offsetLive(mesh: LiveMesh, amount: number) {
  const normals = smoothedNormals(mesh);
  mesh.beginBulk();
  for (let v = 0; v < mesh.vCount; v += 1) {
    if (!mesh.vAlive[v]) continue;
    mesh.pos[v * 3] += normals[v * 3] * amount; mesh.pos[v * 3 + 1] += normals[v * 3 + 1] * amount; mesh.pos[v * 3 + 2] += normals[v * 3 + 2] * amount;
  }
  mesh.endBulk();
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
