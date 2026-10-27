/*
 * Fork (build 76): Erase & Fill, as in Meshmixer - the selected triangles go, and each hole they leave
 * is closed with a smooth patch that meets the surface round it without a crease.
 *
 * The patch is made the way Liepa ("Filling Holes in Meshes", Eurographics SGP 2003) describes it:
 * an initial triangulation of the hole, refined until its triangles match the surface round it, then
 * faired - each new corner moved until the surface bends evenly across it (the bi-Laplacian "umbrella"
 * iteration of Kobbelt et al., "Interactive multi-resolution modeling on arbitrary meshes", 1998),
 * with the surface round the hole held still, so the patch carries on its curvature.
 *
 * Holes that reach the scan's own open edge are left open (there is nothing to close there), as
 * Meshmixer does.
 */
import { LiveMesh } from "@/lib/liveSculpt";

export type EraseFillResult = {
  /** The surface after the edit, a triangle soup. */
  positions: Float32Array;
  /** Holes closed, and the openings left open because they run into the surface's own edge. */
  filled: number;
  open: number;
  /** Triangles removed and added. */
  removed: number;
  added: number;
};

/**
 * Removes the chosen triangles of `points`/`triangles` (a welded mesh, as Sculpt's selection holds it)
 * and closes each hole they leave with a faired patch.
 */
export function eraseAndFill(points: ArrayLike<number>, triangles: ArrayLike<number>, chosen: Uint8Array, options: { fairing?: number } = {}): EraseFillResult {
  const n = points.length / 3;
  const kept: number[] = [];
  const cut = new Set<number>();
  const key = (a: number, b: number) => (a < b ? a * 4294967296 + b : b * 4294967296 + a);
  let removed = 0;
  for (let t = 0; t * 3 < triangles.length; t += 1) {
    const a = triangles[t * 3], b = triangles[t * 3 + 1], c = triangles[t * 3 + 2];
    if (chosen[t]) { removed += 1; cut.add(key(a, b)); cut.add(key(b, c)); cut.add(key(c, a)); }
    else kept.push(a, b, c);
  }
  // Specks left inside the area (a few triangles the brush missed) go with it: a piece whose every
  // open edge was cut, much smaller than what was removed.
  dropSpecks(kept, cut, key, removed, (dropped) => { removed += dropped; });
  // Corners no kept triangle uses stay in the mesh unused; they are dropped by `soup()`.
  const mesh = new LiveMesh(points, kept);
  const startTriangles = mesh.triangleCount();
  let filled = 0, open = 0;
  for (const loop of mesh.rimLoops()) {
    let all = true;
    for (let i = 0; i < loop.length && all; i += 1) if (!cut.has(key(loop[i], loop[(i + 1) % loop.length]))) all = false;
    if (!all) { if (loop.some((v, i) => cut.has(key(v, loop[(i + 1) % loop.length])))) open += 1; continue; }
    // A hole whose rim touches itself at a corner is closed as the simple loops it is made of.
    for (const simple of simpleLoops(loop)) {
      // Each fill is checked: should it give an edge three triangles (or two the same way round), it is taken back and the hole left open.
      mesh.beginPatch();
      const before = mesh.tCount;
      fillEvenly(mesh, simple);
      if (soundSince(mesh, before)) { mesh.endPatch(); filled += 1; }
      else { const patch = mesh.endPatch(); if (patch) mesh.applyPatch(patch.undo); open += 1; }
    }
  }
  if (filled) fairPatches(mesh, n, options.fairing ?? 1);
  const positions = mesh.soup();
  return { positions, filled, open, removed, added: mesh.triangleCount() - startTriangles };
}

/**
 * Closes a loop with triangles about the size of its own edges: the loop is cut in two along the
 * shortest chord between corners about half-way round (new corners placed along the chord at that
 * spacing), and each half again, down to loops of six corners or fewer, which are fanned from their
 * first corner. A fan from one middle corner, as a quick fill does, makes a corner with hundreds of
 * triangles round it on a large hole - slow to refine and spiky to fair.
 */
function fillEvenly(mesh: LiveMesh, loop: number[]) {
  let total = 0;
  for (let i = 0; i < loop.length; i += 1) total += mesh.dist(loop[i], loop[(i + 1) % loop.length]);
  const spacing = Math.max(1e-6, total / loop.length);
  const stack: number[][] = [loop];
  while (stack.length) {
    const ring = stack.pop()!;
    const m = ring.length;
    if (m < 3) continue;
    if (m <= 6) { fanRing(mesh, ring); continue; }
    // The shortest chord between corners at least a third of the way round from each other.
    let bi = 0, bj = Math.floor(m / 2), best = Infinity;
    const step = Math.max(1, Math.floor(m / 400));
    const span = Math.max(2, Math.floor(m / 3));
    for (let i = 0; i < m; i += step) for (let d = span; d <= m - span; d += step) {
      const j = (i + d) % m;
      const dd = mesh.dist(ring[i], ring[j]);
      if (dd < best) { best = dd; bi = i; bj = j; }
    }
    const a = ring[bi], b = ring[bj];
    // A chord on an edge the surface already has (two rim corners joined outside the hole) would
    // give that edge three triangles: such a chord always gets a corner in its middle.
    const count = Math.max(mesh.edgeTriangles(a, b).length ? 1 : 0, Math.round(best / spacing) - 1);
    const chain: number[] = [];
    // Read afresh: adding corners can move the mesh's position array.
    const p = mesh.pos;
    for (let k = 1; k <= count; k += 1) {
      const f = k / (count + 1);
      chain.push(mesh.addCorner(p[a * 3] + (p[b * 3] - p[a * 3]) * f, p[a * 3 + 1] + (p[b * 3 + 1] - p[a * 3 + 1]) * f, p[a * 3 + 2] + (p[b * 3 + 2] - p[a * 3 + 2]) * f));
    }
    // a .. b along the loop, then back to a along the chord; and b .. a along the loop, then the chord a -> b.
    const first: number[] = [], second: number[] = [];
    for (let k = bi; k !== bj; k = (k + 1) % m) first.push(ring[k]);
    first.push(b, ...[...chain].reverse());
    for (let k = bj; k !== bi; k = (k + 1) % m) second.push(ring[k]);
    second.push(a, ...chain);
    if (first.length >= m || second.length >= m) { fanRing(mesh, ring); continue; }
    stack.push(first, second);
  }
}

/**
 * A small loop closed as a fan: from a corner whose diagonals the surface does not already have (an
 * edge shared by three triangles would break the surface), else from a new corner in its middle.
 * The rim edge a -> b is the surface's own; the patch runs each the other way round.
 */
function fanRing(mesh: LiveMesh, ring: number[]) {
  const m = ring.length;
  const p = mesh.pos;
  // Build 76: twice the area of triangle (a, b, c), squared - a fan from a corner in line with two
  // others (the corners along a chord are) would give a flat triangle, whose edge a later split
  // puts a corner on top of another.
  const flat = (a: number, b: number, c: number) => {
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const scale = (ux * ux + uy * uy + uz * uz) * (vx * vx + vy * vy + vz * vz);
    return cx * cx + cy * cy + cz * cz <= scale * 1e-6;
  };
  for (let r = 0; r < m; r += 1) {
    let clear = true;
    for (let k = 2; k < m - 1 && clear; k += 1) if (mesh.edgeTriangles(ring[r], ring[(r + k) % m]).length) clear = false;
    for (let k = 1; k + 1 < m && clear; k += 1) if (flat(ring[r], ring[(r + k + 1) % m], ring[(r + k) % m])) clear = false;
    if (!clear) continue;
    for (let k = 1; k + 1 < m; k += 1) mesh.addFace(ring[r], ring[(r + k + 1) % m], ring[(r + k) % m]);
    return;
  }
  let x = 0, y = 0, z = 0;
  for (const v of ring) { x += p[v * 3]; y += p[v * 3 + 1]; z += p[v * 3 + 2]; }
  const c = mesh.addCorner(x / m, y / m, z / m);
  for (let i = 0; i < m; i += 1) mesh.addFace(ring[(i + 1) % m], ring[i], c);
}

/** Removes, in place, the connected pieces of `kept` that lie wholly inside the cut and are small. */
function dropSpecks(kept: number[], cut: Set<number>, key: (a: number, b: number) => number, removed: number, report: (dropped: number) => void) {
  const m = kept.length / 3;
  if (!m || !removed) return;
  const parent = new Map<number, number>();
  const find = (v: number): number => { let r = v; while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!; let c = v; while (c !== r) { const nx = parent.get(c)!; parent.set(c, r); c = nx; } return r; };
  const join = (a: number, b: number) => { if (!parent.has(a)) parent.set(a, a); if (!parent.has(b)) parent.set(b, b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (let t = 0; t < m; t += 1) { join(kept[t * 3], kept[t * 3 + 1]); join(kept[t * 3 + 1], kept[t * 3 + 2]); }
  const uses = new Map<number, number>();
  for (let t = 0; t < m; t += 1) for (let k = 0; k < 3; k += 1) { const e = key(kept[t * 3 + k], kept[t * 3 + ((k + 1) % 3)]); uses.set(e, (uses.get(e) ?? 0) + 1); }
  const size = new Map<number, number>(), original = new Set<number>();
  for (let t = 0; t < m; t += 1) {
    const r = find(kept[t * 3]);
    size.set(r, (size.get(r) ?? 0) + 1);
    for (let k = 0; k < 3; k += 1) { const e = key(kept[t * 3 + k], kept[t * 3 + ((k + 1) % 3)]); if (uses.get(e) === 1 && !cut.has(e)) original.add(r); }
  }
  let biggest = 0;
  for (const c of size.values()) biggest = Math.max(biggest, c);
  const speck = (r: number) => !original.has(r) && size.get(r)! < biggest && size.get(r)! < Math.max(50, removed * 0.2);
  const out: number[] = [];
  let dropped = 0;
  for (let t = 0; t < m; t += 1) { if (speck(find(kept[t * 3]))) { dropped += 1; continue; } out.push(kept[t * 3], kept[t * 3 + 1], kept[t * 3 + 2]); }
  if (!dropped) return;
  // The specks' edges count as cut too, so the hole round them is one.
  for (let t = 0; t < m; t += 1) if (speck(find(kept[t * 3]))) for (let k = 0; k < 3; k += 1) cut.add(key(kept[t * 3 + k], kept[t * 3 + ((k + 1) % 3)]));
  // In place, without spreading: a scan's list runs to millions, beyond what a call can take.
  kept.length = out.length;
  for (let i = 0; i < out.length; i += 1) kept[i] = out[i];
  report(dropped);
}

/** A loop that passes a corner more than once, cut into loops that pass each corner once. */
function simpleLoops(loop: number[]): number[][] {
  const out: number[][] = [];
  const stack: number[] = [];
  const at = new Map<number, number>();
  for (const v of loop) {
    const seen = at.get(v);
    if (seen !== undefined) {
      const cycle = stack.splice(seen);
      cycle.forEach((c) => at.delete(c));
      if (cycle.length >= 3) out.push(cycle);
    }
    at.set(v, stack.length);
    stack.push(v);
  }
  if (stack.length >= 3) out.push(stack);
  return out;
}

/** Whether the triangles added since `from` keep every edge to at most two triangles, running opposite ways. */
function soundSince(mesh: LiveMesh, from: number) {
  for (let t = from; t < mesh.tCount; t += 1) {
    if (!mesh.tAlive[t]) continue;
    for (let k = 0; k < 3; k += 1) {
      const a = mesh.tri[t * 3 + k], b = mesh.tri[t * 3 + ((k + 1) % 3)];
      const tris = mesh.edgeTriangles(a, b);
      if (tris.length > 2) return false;
      let same = 0;
      for (const u of tris) for (let j = 0; j < 3; j += 1) if (mesh.tri[u * 3 + j] === a && mesh.tri[u * 3 + ((j + 1) % 3)] === b) same += 1;
      if (same > 1) return false;
    }
  }
  return true;
}

/** The corners added after the first `n` (the patches), alive. */
function patchCorners(mesh: LiveMesh, n: number) {
  const out: number[] = [];
  for (let v = n; v < mesh.vCount; v += 1) if (mesh.vAlive[v]) out.push(v);
  return out;
}

/** Refines the patches to the size of the triangles round them, then fairs them, twice over. */
function fairPatches(mesh: LiveMesh, n: number, strength: number) {
  // The patches already have triangles about the size of their rims' edges (fillEvenly): faired,
  // tidied once (split, collapse, flip and relax at that size), and faired again.
  let sum = 0, count = 0;
  for (const v of patchCorners(mesh, n)) for (const w of mesh.around(v)) if (w < n) for (const u of mesh.around(w)) if (u < n) { sum += mesh.dist(w, u); count += 1; }
  const target = count ? sum / count : 1;
  const fixed = (v: number) => v < n;
  // Build 76: not tidied with Refine between - on a big patch its splits left corners on top of one
  // another (the soup then has edges shared by three triangles); the patch is already even.
  void target; void fixed;
  fair(mesh, patchCorners(mesh, n), n, Math.round(600 * strength));
}

/**
 * Fairing: the patch corners placed so the "umbrella" U(v) - the mean of v's neighbours less v - is as
 * small as can be on the patch and on its ring of held corners, in the least-squares sense. That is
 * the discrete thin-plate (bi-Laplacian) surface with the ring's curvature carried in, as Liepa and
 * Kobbelt use; it is solved directly (conjugate gradients on the normal equations, CGLS) rather than
 * by relaxation, which needs thousands of sweeps to bulge a large patch out.
 */
function fair(mesh: LiveMesh, corners: number[], n: number, iterations: number) {
  if (!corners.length) return;
  void n;
  const unknown = new Map<number, number>();
  corners.forEach((v, i) => unknown.set(v, i));
  const rows = new Set<number>(corners);
  for (const v of corners) for (const w of mesh.around(v)) rows.add(w);
  const rowList = [...rows];
  // Each row: U(v) = sum_w (1/k) x_w - x_v, split into unknown terms and a fixed right-hand side.
  const rowCols: Int32Array[] = [], rowVals: Float64Array[] = [];
  const rhs = [new Float64Array(rowList.length), new Float64Array(rowList.length), new Float64Array(rowList.length)];
  const p = mesh.pos;
  rowList.forEach((v, r) => {
    const around = mesh.around(v);
    const k = around.length || 1;
    const cols: number[] = [], vals: number[] = [];
    const add = (w: number, c: number) => {
      const j = unknown.get(w);
      if (j !== undefined) { cols.push(j); vals.push(c); }
      else for (let d = 0; d < 3; d += 1) rhs[d][r] -= c * p[w * 3 + d];
    };
    for (const w of around) add(w, 1 / k);
    add(v, -1);
    rowCols.push(Int32Array.from(cols)); rowVals.push(Float64Array.from(vals));
  });
  const m = corners.length;
  const multiply = (x: Float64Array, out: Float64Array) => { for (let r = 0; r < rowList.length; r += 1) { let s = 0; const c = rowCols[r], val = rowVals[r]; for (let i = 0; i < c.length; i += 1) s += val[i] * x[c[i]]; out[r] = s; } };
  const multiplyT = (y: Float64Array, out: Float64Array) => { out.fill(0); for (let r = 0; r < rowList.length; r += 1) { const c = rowCols[r], val = rowVals[r], yr = y[r]; for (let i = 0; i < c.length; i += 1) out[c[i]] += val[i] * yr; } };
  for (let d = 0; d < 3; d += 1) {
    // CGLS for min |A x - b|, from the current positions.
    const x = new Float64Array(m);
    corners.forEach((v, i) => { x[i] = p[v * 3 + d]; });
    const r = new Float64Array(rowList.length), ax = new Float64Array(rowList.length);
    multiply(x, ax);
    for (let i = 0; i < r.length; i += 1) r[i] = rhs[d][i] - ax[i];
    const s = new Float64Array(m); multiplyT(r, s);
    const q = new Float64Array(rowList.length);
    const dir = Float64Array.from(s);
    let gamma = s.reduce((a, b) => a + b * b, 0);
    const stop = gamma * 1e-16;
    for (let it = 0; it < iterations && gamma > stop; it += 1) {
      multiply(dir, q);
      const qq = q.reduce((a, b) => a + b * b, 0);
      if (qq <= 0) break;
      const alpha = gamma / qq;
      for (let i = 0; i < m; i += 1) x[i] += alpha * dir[i];
      for (let i = 0; i < r.length; i += 1) r[i] -= alpha * q[i];
      multiplyT(r, s);
      const next = s.reduce((a, b) => a + b * b, 0);
      const beta = next / gamma;
      gamma = next;
      for (let i = 0; i < m; i += 1) dir[i] = s[i] + beta * dir[i];
    }
    corners.forEach((v, i) => { p[v * 3 + d] = x[i]; });
  }
  for (const v of corners) mesh.moveTo(v, p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
  mesh.settle(corners);
}
