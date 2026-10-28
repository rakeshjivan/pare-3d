/**
 * Build 94: a point-transformer tooth finder run in plain TypeScript - no machine-learning library.
 *
 * The network is CrossTooth's (Xi et al., "3D Dental Model Segmentation with Geometrical Boundary
 * Preserving", CVPR 2025): Point Transformer v1 with 38 layers (Zhao et al., ICCV 2021) over 16,000
 * points - a scan's triangles, each its centre and its normal - labelling each point gum or one of 16
 * teeth. Its weights are not part of Pare 3D: the user loads them (a .ptw file made from the
 * authors' release, BatchNorm folded into a scale and shift per channel).
 *
 * Everything here is the network run forward, eval mode: linear layers, per-channel scale and
 * shift, ReLU, neighbour gathers, a softmax over each point's neighbours, max pooling and
 * three-neighbour interpolation. Neighbours and the subsampled points come from toothNeighbours
 * (or, for checking against the original, from a recorded list).
 */

/** The weights: each tensor's numbers and shape. */
export type NetWeights = { meta: Record<string, unknown>; tensors: Map<string, { data: Float32Array | Int32Array; shape: number[] }> };

/** Reads a PTW1 file: "PTW1", a header length, a JSON header (name: [offset, shape, "f"|"i"]), the numbers. */
export function readWeights(buffer: ArrayBuffer): NetWeights {
  const bytes = new Uint8Array(buffer);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== "PTW1") throw new Error("Not a tooth finder weights file");
  const length = new DataView(buffer).getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + length))) as { meta: Record<string, unknown>; tensors: Record<string, [number, number[], "f" | "i"]> };
  const start = 8 + length;
  const tensors = new Map<string, { data: Float32Array | Int32Array; shape: number[] }>();
  for (const [name, [offset, shape, kind]] of Object.entries(header.tensors)) {
    const count = shape.reduce((a, b) => a * b, 1);
    const at = start + offset;
    // Copied out, so each tensor is aligned whatever the buffer.
    const data = kind === "i" ? new Int32Array(buffer.slice(at, at + count * 4)) : new Float32Array(buffer.slice(at, at + count * 4));
    tensors.set(name, { data, shape });
  }
  return { meta: header.meta, tensors };
}

/** The points and neighbours one level of the network works on. */
export type Neighbours = {
  /** At each level after the first: the points kept (indices into the level above). */
  sample(level: number, points: Float32Array, count: number, keep: number): Int32Array;
  /** For each of `queries` (n x 3), the k nearest of `points` (m x 3), nearest first. */
  nearest(points: Float32Array, queries: Float32Array, k: number, purpose: "group" | "attend"): Int32Array;
  /** The three nearest with their interpolation weights (1/d, normalised). */
  three(points: Float32Array, queries: Float32Array): { idx: Int32Array; w: Float32Array };
};

const PLANES = [32, 64, 128, 256, 512];
const NSAMPLE = [8, 16, 16, 16, 16];
const BLOCKS = [1, 2, 2, 2, 2];
const SHARE = 8;
const STRIDE = 4;

/** The tooth finder: per point, the probability of each of its 19 classes (0 gum, 1-16 teeth, 17-18 unused). */
export class ToothNet {
  private w: NetWeights["tensors"];
  readonly classes: number;
  constructor(weights: NetWeights) {
    this.w = weights.tensors;
    this.classes = this.get("cls.3.w").shape[0];
  }

  private get(name: string) {
    const t = this.w.get(name);
    if (!t) throw new Error(`Tooth finder weights lack ${name}`);
    return t;
  }

  /** x (n x cin) through a linear layer: out = x W^T + b. */
  private linear(x: Float32Array, n: number, name: string): { y: Float32Array; c: number } {
    const W = this.get(`${name}.w`);
    const out = W.shape[0], cin = W.shape[1];
    const w = W.data as Float32Array;
    const b = this.w.get(`${name}.b`)?.data as Float32Array | undefined;
    const y = new Float32Array(n * out);
    for (let r = 0; r < n; r += 1) {
      const xo = r * cin, yo = r * out;
      for (let o = 0; o < out; o += 1) {
        const wo = o * cin;
        let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
        let i = 0;
        for (; i + 3 < cin; i += 4) {
          s0 += x[xo + i] * w[wo + i];
          s1 += x[xo + i + 1] * w[wo + i + 1];
          s2 += x[xo + i + 2] * w[wo + i + 2];
          s3 += x[xo + i + 3] * w[wo + i + 3];
        }
        for (; i < cin; i += 1) s0 += x[xo + i] * w[wo + i];
        y[yo + o] = s0 + s1 + s2 + s3 + (b ? b[o] : 0);
      }
    }
    return { y, c: out };
  }

  /** BatchNorm (eval): per channel, x s + t; then ReLU if asked. In place. */
  private norm(x: Float32Array, c: number, name: string, relu: boolean) {
    const s = this.get(`${name}.s`).data as Float32Array, t = this.get(`${name}.t`).data as Float32Array;
    for (let i = 0; i < x.length; i += 1) {
      const k = i % c;
      const v = x[i] * s[k] + t[k];
      x[i] = relu && v < 0 ? 0 : v;
    }
    return x;
  }

  private static relu(x: Float32Array) {
    for (let i = 0; i < x.length; i += 1) if (x[i] < 0) x[i] = 0;
    return x;
  }

  /** Point Transformer layer (vector attention over each point's `idx` neighbours). */
  private attend(name: string, p: Float32Array, x: Float32Array, n: number, idx: Int32Array, ns: number): Float32Array {
    const q = this.linear(x, n, `${name}.linear_q`).y;
    const k = this.linear(x, n, `${name}.linear_k`).y;
    const { y: v, c } = this.linear(x, n, `${name}.linear_v`);
    const groups = c / SHARE;
    // Relative positions, through linear_p: Linear(3,3), norm, ReLU, Linear(3,c).
    const rel = new Float32Array(n * ns * 3);
    for (let i = 0; i < n; i += 1) for (let t = 0; t < ns; t += 1) {
      const j = idx[i * ns + t], o = (i * ns + t) * 3;
      rel[o] = p[j * 3] - p[i * 3]; rel[o + 1] = p[j * 3 + 1] - p[i * 3 + 1]; rel[o + 2] = p[j * 3 + 2] - p[i * 3 + 2];
    }
    const p1 = this.norm(this.linear(rel, n * ns, `${name}.linear_p.0`).y, 3, `${name}.linear_p.1`, true);
    const pr = this.linear(p1, n * ns, `${name}.linear_p.3`).y; // (n ns) x c
    // r = k[j] - q[i] + pr, then linear_w: norm, ReLU, Linear(c, c/8), norm, ReLU, Linear(c/8, c/8).
    const r = new Float32Array(n * ns * c);
    for (let i = 0; i < n; i += 1) for (let t = 0; t < ns; t += 1) {
      const j = idx[i * ns + t], o = (i * ns + t) * c;
      for (let ch = 0; ch < c; ch += 1) r[o + ch] = k[j * c + ch] - q[i * c + ch] + pr[o + ch];
    }
    this.norm(r, c, `${name}.linear_w.0`, true);
    const w1 = this.norm(this.linear(r, n * ns, `${name}.linear_w.2`).y, groups, `${name}.linear_w.3`, true);
    const w = this.linear(w1, n * ns, `${name}.linear_w.5`).y; // (n ns) x groups
    // Softmax over the neighbours, per group.
    for (let i = 0; i < n; i += 1) for (let g = 0; g < groups; g += 1) {
      let max = -Infinity;
      for (let t = 0; t < ns; t += 1) max = Math.max(max, w[(i * ns + t) * groups + g]);
      let sum = 0;
      for (let t = 0; t < ns; t += 1) { const e = Math.exp(w[(i * ns + t) * groups + g] - max); w[(i * ns + t) * groups + g] = e; sum += e; }
      for (let t = 0; t < ns; t += 1) w[(i * ns + t) * groups + g] /= sum;
    }
    // out[i, ch] = sum over neighbours of (v[j] + pr)[ch] * w[ch mod groups].
    const out = new Float32Array(n * c);
    for (let i = 0; i < n; i += 1) for (let t = 0; t < ns; t += 1) {
      const j = idx[i * ns + t], o = (i * ns + t) * c, wo = (i * ns + t) * groups;
      for (let ch = 0; ch < c; ch += 1) out[i * c + ch] += (v[j * c + ch] + pr[o + ch]) * w[wo + (ch % groups)];
    }
    return out;
  }

  private bottleneck(name: string, p: Float32Array, x: Float32Array, n: number, idx: Int32Array, ns: number) {
    const c = this.get(`${name}.linear1.w`).shape[0];
    const a = this.norm(this.linear(x, n, `${name}.linear1`).y, c, `${name}.bn1`, true);
    const b = this.norm(this.attend(`${name}.transformer`, p, a, n, idx, ns), c, `${name}.bn2`, true);
    const y = this.norm(this.linear(b, n, `${name}.linear3`).y, c, `${name}.bn3`, false);
    for (let i = 0; i < y.length; i += 1) { const s = y[i] + x[i]; y[i] = s > 0 ? s : 0; }
    return y;
  }

  /**
   * Runs the network on `input` (n x 6: centre then normal of each point, centred and scaled into the
   * unit sphere, as the network was trained). Returns n x classes probabilities.
   */
  run(input: Float32Array, n: number, nb: Neighbours, onProgress?: (share: number) => void): Float32Array {
    const levels: Array<{ p: Float32Array; x: Float32Array; n: number; attend: Int32Array }> = [];
    let p: Float32Array = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) { p[i * 3] = input[i * 6]; p[i * 3 + 1] = input[i * 6 + 1]; p[i * 3 + 2] = input[i * 6 + 2]; }
    let x: Float32Array = input;
    let count = n;
    const steps = 10;
    let done = 0;
    const tick = () => { done += 1; onProgress?.(done / steps); };
    for (let level = 0; level < 5; level += 1) {
      const name = `enc${level + 1}`;
      const ns = NSAMPLE[level];
      if (level === 0) {
        x = this.norm(this.linear(x, count, `${name}.0.linear`).y, PLANES[0], `${name}.0.bn`, true);
      } else {
        const keep = Math.floor(count / STRIDE);
        const kept = nb.sample(level, p, count, keep);
        const np = new Float32Array(keep * 3);
        for (let i = 0; i < keep; i += 1) { const j = kept[i]; np[i * 3] = p[j * 3]; np[i * 3 + 1] = p[j * 3 + 1]; np[i * 3 + 2] = p[j * 3 + 2]; }
        const idx = nb.nearest(p, np, ns, "group");
        const cin = x.length / count;
        // Each kept point's neighbours: relative position then features; Linear (no bias), norm, ReLU, max over neighbours.
        const grouped = new Float32Array(keep * ns * (3 + cin));
        for (let i = 0; i < keep; i += 1) for (let t = 0; t < ns; t += 1) {
          const j = idx[i * ns + t], o = (i * ns + t) * (3 + cin);
          grouped[o] = p[j * 3] - np[i * 3]; grouped[o + 1] = p[j * 3 + 1] - np[i * 3 + 1]; grouped[o + 2] = p[j * 3 + 2] - np[i * 3 + 2];
          grouped.set(x.subarray(j * cin, (j + 1) * cin), o + 3);
        }
        const c = PLANES[level];
        const g = this.norm(this.linear(grouped, keep * ns, `${name}.0.linear`).y, c, `${name}.0.bn`, true);
        const pooled = new Float32Array(keep * c).fill(-Infinity);
        for (let i = 0; i < keep; i += 1) for (let t = 0; t < ns; t += 1) for (let ch = 0; ch < c; ch += 1) {
          const value = g[(i * ns + t) * c + ch];
          if (value > pooled[i * c + ch]) pooled[i * c + ch] = value;
        }
        p = np; x = pooled; count = keep;
      }
      const attend = nb.nearest(p, p, ns, "attend");
      for (let b = 1; b <= BLOCKS[level]; b += 1) x = this.bottleneck(`${name}.${b}`, p, x, count, attend, ns);
      levels.push({ p, x, n: count, attend });
      tick();
    }
    // Decoder: the head on the coarsest level, then up a level at a time.
    const top = levels[4];
    {
      const c = PLANES[4];
      const mean = new Float32Array(c);
      for (let i = 0; i < top.n; i += 1) for (let ch = 0; ch < c; ch += 1) mean[ch] += top.x[i * c + ch] / top.n;
      const g = ToothNet.relu(this.linear(mean, 1, "dec5.0.linear2.0").y);
      const cat = new Float32Array(top.n * c * 2);
      for (let i = 0; i < top.n; i += 1) { cat.set(top.x.subarray(i * c, (i + 1) * c), i * 2 * c); cat.set(g, i * 2 * c + c); }
      let y = this.norm(this.linear(cat, top.n, "dec5.0.linear1.0").y, c, "dec5.0.linear1.1", true);
      y = this.bottleneck("dec5.1", top.p, y, top.n, top.attend, NSAMPLE[4]);
      x = y;
      tick();
    }
    for (let level = 3; level >= 0; level -= 1) {
      const here = levels[level], below = levels[level + 1];
      const name = `dec${level + 1}`;
      const c = PLANES[level];
      const a = this.norm(this.linear(here.x, here.n, `${name}.0.linear1.0`).y, c, `${name}.0.linear1.1`, true);
      const b = this.norm(this.linear(x, below.n, `${name}.0.linear2.0`).y, c, `${name}.0.linear2.1`, true);
      const { idx, w } = nb.three(below.p, here.p);
      for (let i = 0; i < here.n; i += 1) for (let t = 0; t < 3; t += 1) {
        const j = idx[i * 3 + t], wt = w[i * 3 + t];
        for (let ch = 0; ch < c; ch += 1) a[i * c + ch] += b[j * c + ch] * wt;
      }
      x = this.bottleneck(`${name}.1`, here.p, a, here.n, here.attend, NSAMPLE[level]);
      tick();
    }
    const h = this.norm(this.linear(x, n, "cls.0").y, PLANES[0], "cls.1", true);
    const logits = this.linear(h, n, "cls.3").y;
    const k = this.classes;
    for (let i = 0; i < n; i += 1) {
      let max = -Infinity;
      for (let j = 0; j < k; j += 1) max = Math.max(max, logits[i * k + j]);
      let sum = 0;
      for (let j = 0; j < k; j += 1) { const e = Math.exp(logits[i * k + j] - max); logits[i * k + j] = e; sum += e; }
      for (let j = 0; j < k; j += 1) logits[i * k + j] /= sum;
    }
    return logits;
  }
}
