/**
 * Build 102: a clean edge after a trim. Cutting a scan by its triangles (Trim's brush and
 * selection) leaves a sawtooth along the new edge - triangle by triangle - and the base the studio
 * builds from that edge follows it. Here the open edges are tidied as a technician would trim a
 * model: spikes (triangles hanging on by one edge) go, then each edge loop is smoothed along itself
 * (Taubin's lambda-mu smoothing, which does not shrink the loop), each corner moved no further than
 * EDGE_SMOOTH_MOVE_MAX. The rest of the surface is untouched.
 */
import { boundaryLoops, soup, weld, type Mesh } from "@/lib/dentalMesh";

/** Rounds of smoothing along each edge loop. */
export const EDGE_SMOOTH_ROUNDS = 20;
/** The furthest a corner of the edge is moved, mm. */
export const EDGE_SMOOTH_MOVE_MAX = 0.8;
/** Passes taking off spikes (triangles with two or three open edges). */
const SPIKE_PASSES = 3;

function openEdgeCounts(m: Mesh) {
  const uses = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (let t = 0; t < m.f.length / 3; t += 1) for (let k = 0; k < 3; k += 1) {
    const e = key(m.f[t * 3 + k], m.f[t * 3 + ((k + 1) % 3)]);
    uses.set(e, (uses.get(e) ?? 0) + 1);
  }
  return Array.from({ length: m.f.length / 3 }, (_, t) => {
    let open = 0;
    for (let k = 0; k < 3; k += 1) if (uses.get(key(m.f[t * 3 + k], m.f[t * 3 + ((k + 1) % 3)])) === 1) open += 1;
    return open;
  });
}

export type EdgeSmoothResult = { positions: Float32Array; spikes: number; moved: number };

/** The surface (a soup) with its open edges tidied: spikes off, each edge loop smoothed. */
export function smoothOpenEdges(positions: ArrayLike<number>, rounds = EDGE_SMOOTH_ROUNDS): EdgeSmoothResult {
  const m = weld(positions, 1e-5);
  let spikes = 0;
  for (let pass = 0; pass < SPIKE_PASSES; pass += 1) {
    const open = openEdgeCounts(m);
    const keep: number[] = [];
    let dropped = 0;
    for (let t = 0; t < open.length; t += 1) {
      if (open[t] >= 2) { dropped += 1; continue; }
      keep.push(m.f[t * 3], m.f[t * 3 + 1], m.f[t * 3 + 2]);
    }
    if (!dropped) break;
    m.f = keep;
    spikes += dropped;
  }
  const start = Float64Array.from(m.v);
  let moved = 0;
  for (const loop of boundaryLoops(m)) {
    if (loop.length < 6) continue;
    const n = loop.length;
    const step = (weight: number) => {
      const next = new Float64Array(n * 3);
      for (let i = 0; i < n; i += 1) {
        const a = loop[(i - 1 + n) % n], b = loop[i], c = loop[(i + 1) % n];
        for (let k = 0; k < 3; k += 1) {
          const mid = (m.v[a * 3 + k] + m.v[c * 3 + k]) / 2;
          next[i * 3 + k] = m.v[b * 3 + k] + weight * (mid - m.v[b * 3 + k]);
        }
      }
      for (let i = 0; i < n; i += 1) {
        const b = loop[i];
        // Never far from where it was.
        let dx = next[i * 3] - start[b * 3], dy = next[i * 3 + 1] - start[b * 3 + 1], dz = next[i * 3 + 2] - start[b * 3 + 2];
        const d = Math.hypot(dx, dy, dz);
        if (d > EDGE_SMOOTH_MOVE_MAX) { const s = EDGE_SMOOTH_MOVE_MAX / d; dx *= s; dy *= s; dz *= s; }
        m.v[b * 3] = start[b * 3] + dx; m.v[b * 3 + 1] = start[b * 3 + 1] + dy; m.v[b * 3 + 2] = start[b * 3 + 2] + dz;
      }
    };
    for (let r = 0; r < rounds; r += 1) { step(0.5); step(-0.53); }
    moved += n;
  }
  return { positions: soup(m), spikes, moved };
}
