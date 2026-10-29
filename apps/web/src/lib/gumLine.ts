/**
 * Build 101: a clean gum line. The tooth finder labels 16,000 triangles; the full scan takes each label
 * from the nearest of them, so the border between a tooth and the gum (and between two teeth) comes out
 * as steps the size of the reduced triangles, a little off the real margin.
 *
 * Here the border is settled again on the full scan. Each triangle near a border may take its own label
 * or a neighbour's, whichever costs least: a border costs its length, but much less where it runs along
 * a valley (the gingival margin, the gap between teeth are concave), and moving away from what the
 * finder said costs a little. A few rounds of this (iterated conditional modes) smooth the steps out
 * and pull the border into the margin's groove, a few tenths of a millimetre at most.
 */

/** How far from the finder's border the line may move, in triangle rings. */
export const GUM_BAND_RINGS = 10;
/** Rounds of relabelling. */
export const GUM_ROUNDS = 10;
/** How much cheaper a border is along a sharp valley (1 / (1 + this × (1 - cos))). */
export const VALLEY_PULL = 40;
/** How much slower a flooding front crosses a sharp valley (1 + this × (1 - cos) times its length). */
export const VALLEY_STOP = 60;
/** The cost of leaving the finder's label, in mean edge lengths. */
export const KEEP_COST = 0.5;

/** A binary min-heap of (item, key). */
class MinHeap {
  private items: Int32Array;
  private keys: Float32Array;
  size = 0;
  constructor(capacity: number) { this.items = new Int32Array(capacity); this.keys = new Float32Array(capacity); }
  push(item: number, key: number) {
    if (this.size === this.items.length) {
      const items = new Int32Array(this.size * 2); items.set(this.items); this.items = items;
      const keys = new Float32Array(this.size * 2); keys.set(this.keys); this.keys = keys;
    }
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= key) break;
      this.items[i] = this.items[parent]; this.keys[i] = this.keys[parent]; i = parent;
    }
    this.items[i] = item; this.keys[i] = key;
  }
  pop(): [number, number] {
    const item = this.items[0], key = this.keys[0];
    const lastItem = this.items[--this.size], lastKey = this.keys[this.size];
    let i = 0;
    for (;;) {
      let child = i * 2 + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.keys[child + 1] < this.keys[child]) child += 1;
      if (this.keys[child] >= lastKey) break;
      this.items[i] = this.items[child]; this.keys[i] = this.keys[child]; i = child;
    }
    this.items[i] = lastItem; this.keys[i] = lastKey;
    return [item, key];
  }
}

export type GumLineStats = { changed: number; band: number; borderBefore: number; borderAfter: number; seconds: number };

/** Triangle neighbours across shared edges, with each edge's weight (its length, cut down along a valley). */
function adjacency(soup: Float32Array) {
  const n = soup.length / 9;
  // Weld corners by position (to 1e-4 mm).
  const ids = new Int32Array(n * 3);
  const index = new Map<string, number>();
  for (let c = 0; c < n * 3; c += 1) {
    const o = c * 3;
    const key = `${Math.round(soup[o] * 1e4)},${Math.round(soup[o + 1] * 1e4)},${Math.round(soup[o + 2] * 1e4)}`;
    let id = index.get(key);
    if (id === undefined) { id = index.size; index.set(key, id); }
    ids[c] = id;
  }
  const vertices = index.size;
  index.clear();
  // Normals and centres.
  const normal = new Float32Array(n * 3), centre = new Float32Array(n * 3);
  for (let t = 0; t < n; t += 1) {
    const o = t * 9;
    const ux = soup[o + 3] - soup[o], uy = soup[o + 4] - soup[o + 1], uz = soup[o + 5] - soup[o + 2];
    const vx = soup[o + 6] - soup[o], vy = soup[o + 7] - soup[o + 1], vz = soup[o + 8] - soup[o + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    normal[t * 3] = nx / len; normal[t * 3 + 1] = ny / len; normal[t * 3 + 2] = nz / len;
    for (let k = 0; k < 3; k += 1) centre[t * 3 + k] = (soup[o + k] + soup[o + 3 + k] + soup[o + 6 + k]) / 3;
  }
  // Edges: each joins the two triangles that share it (a third, on a non-manifold edge, is left out).
  const first = new Map<number, number>();
  const nbStart = new Int32Array(n + 1);
  const pairs: number[] = [];
  const weights: number[] = [];
  const crossings: number[] = [];
  let lengthSum = 0, lengthCount = 0;
  for (let t = 0; t < n; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const a = ids[t * 3 + k], b = ids[t * 3 + ((k + 1) % 3)];
      if (a === b) continue;
      const key = a < b ? a * vertices + b : b * vertices + a;
      const other = first.get(key);
      if (other === undefined) { first.set(key, t); continue; }
      if (other < 0) continue;
      first.set(key, -1);
      const pa = t * 9 + k * 3;
      const pb = t * 9 + ((k + 1) % 3) * 3;
      const len = Math.hypot(soup[pa] - soup[pb], soup[pa + 1] - soup[pb + 1], soup[pa + 2] - soup[pb + 2]);
      lengthSum += len; lengthCount += 1;
      const cos = normal[t * 3] * normal[other * 3] + normal[t * 3 + 1] * normal[other * 3 + 1] + normal[t * 3 + 2] * normal[other * 3 + 2];
      // A valley: the other triangle's centre stands above this one's plane.
      const dx = centre[other * 3] - centre[t * 3], dy = centre[other * 3 + 1] - centre[t * 3 + 1], dz = centre[other * 3 + 2] - centre[t * 3 + 2];
      const concave = dx * normal[t * 3] + dy * normal[t * 3 + 1] + dz * normal[t * 3 + 2] > 0;
      const bend = Math.max(0, 1 - cos);
      const weight = len * (concave ? 1 / (1 + VALLEY_PULL * bend) : 1);
      pairs.push(t, other);
      weights.push(weight);
      crossings.push(len * (concave ? 1 + VALLEY_STOP * bend : 1));
      nbStart[t + 1] += 1; nbStart[other + 1] += 1;
    }
  }
  for (let t = 0; t < n; t += 1) nbStart[t + 1] += nbStart[t];
  const fill = nbStart.slice(0, n);
  const nb = new Int32Array(nbStart[n]);
  const w = new Float32Array(nbStart[n]);
  const cross = new Float32Array(nbStart[n]);
  for (let e = 0; e < weights.length; e += 1) {
    const a = pairs[e * 2], b = pairs[e * 2 + 1];
    nb[fill[a]] = b; w[fill[a]] = weights[e]; cross[fill[a]] = crossings[e]; fill[a] += 1;
    nb[fill[b]] = a; w[fill[b]] = weights[e]; cross[fill[b]] = crossings[e]; fill[b] += 1;
  }
  return { n, nbStart, nb, w, cross, meanEdge: lengthCount ? lengthSum / lengthCount : 0.1 };
}

/** The labels with the border settled into the margin; `labels` itself is left as it was. */
export function refineGumLine(soup: Float32Array, labels: Uint8Array, options: { rings?: number; rounds?: number } = {}): { labels: Uint8Array; stats: GumLineStats } {
  const started = Date.now();
  const { n, nbStart, nb, w, cross, meanEdge } = adjacency(soup);
  const borderLength = (l: Uint8Array) => {
    let sum = 0;
    for (let t = 0; t < n; t += 1) for (let e = nbStart[t]; e < nbStart[t + 1]; e += 1) if (nb[e] > t && l[nb[e]] !== l[t]) sum += 1;
    return sum;
  };
  // The band: triangles within so many rings of a border.
  const ring = new Int16Array(n).fill(-1);
  let front: number[] = [];
  for (let t = 0; t < n; t += 1) {
    for (let e = nbStart[t]; e < nbStart[t + 1]; e += 1) if (labels[nb[e]] !== labels[t]) { ring[t] = 0; front.push(t); break; }
  }
  const rings = options.rings ?? GUM_BAND_RINGS;
  for (let r = 1; r <= rings && front.length; r += 1) {
    const next: number[] = [];
    for (const t of front) for (let e = nbStart[t]; e < nbStart[t + 1]; e += 1) { const u = nb[e]; if (ring[u] < 0) { ring[u] = r; next.push(u); } }
    front = next;
  }
  const band: number[] = [];
  for (let t = 0; t < n; t += 1) if (ring[t] >= 0) band.push(t);
  const borderBefore = borderLength(labels);
  // 1. The band is flooded again from the labels around it, each front slowed by valleys (a watershed):
  //    the fronts meet in the margin's groove, wherever the finder's steps had put the border.
  const flood = labels.slice();
  {
    const dist = new Float32Array(n).fill(Infinity);
    const heap = new MinHeap(band.length + 16);
    for (const t of band) {
      if (ring[t] !== rings) continue;
      dist[t] = 0; heap.push(t, 0);
    }
    // The band's inner triangles wait to be reached.
    const open = new Uint8Array(n);
    for (const t of band) if (ring[t] < rings) open[t] = 1;
    while (heap.size) {
      const [t, d] = heap.pop();
      if (d > dist[t]) continue;
      for (let e = nbStart[t]; e < nbStart[t + 1]; e += 1) {
        const u = nb[e];
        if (!open[u]) continue;
        const nd = d + cross[e];
        if (nd < dist[u]) { dist[u] = nd; flood[u] = flood[t]; heap.push(u, nd); }
      }
    }
  }
  const out = flood;
  const keep = KEEP_COST * meanEdge;
  const candidates: number[] = [];
  const costs: number[] = [];
  const rounds = options.rounds ?? GUM_ROUNDS;
  for (let round = 0; round < rounds; round += 1) {
    let moved = 0;
    for (const t of band) {
      candidates.length = 0;
      candidates.push(out[t]);
      for (let e = nbStart[t]; e < nbStart[t + 1]; e += 1) { const l = out[nb[e]]; if (!candidates.includes(l)) candidates.push(l); }
      if (candidates.length < 2) continue;
      costs.length = 0;
      for (const l of candidates) {
        let cost = l === labels[t] ? 0 : keep;
        // Never further than the band: a triangle at its edge keeps the finder's label.
        if (ring[t] === rings && l !== labels[t]) cost += Infinity;
        for (let e = nbStart[t]; e < nbStart[t + 1]; e += 1) if (out[nb[e]] !== l) cost += w[e];
        costs.push(cost);
      }
      let best = 0;
      for (let i = 1; i < candidates.length; i += 1) if (costs[i] < costs[best] - 1e-9) best = i;
      if (candidates[best] !== out[t]) { out[t] = candidates[best]; moved += 1; }
    }
    if (!moved) break;
  }
  let changed = 0;
  for (let t = 0; t < n; t += 1) if (out[t] !== labels[t]) changed += 1;
  return { labels: out, stats: { changed, band: band.length, borderBefore, borderAfter: borderLength(out), seconds: (Date.now() - started) / 1000 } };
}
