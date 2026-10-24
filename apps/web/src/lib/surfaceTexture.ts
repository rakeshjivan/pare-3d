/*
 * Fork (build 55): surface textures - a pattern pressed into (or raised out of) a part's surface,
 * the way a texture is in Fusion or a slicer's "fuzzy skin", but a real part of the model.
 *
 * The part's triangles are split until none is longer than a fraction of the pattern's size, then
 * every corner is moved along the surface's normal by the pattern's height there. The mesh keeps
 * its topology - each corner is shared and moved once - so a closed part stays closed.
 *
 * Kept printable:
 * - The faces the part stands on (facing down) are left flat, so it still sits flat on the plate.
 * - Sharp edges are kept: where faces meet at more than about 30 degrees the texture fades in
 *   from nothing over twice its depth, so corners stay crisp and the walls of a corner cannot be
 *   pushed into each other.
 * - Engraved (into the part) is the default, which keeps the part's outer size; raised adds the
 *   depth outside it.
 *
 * Patterns that repeat in a plane (knurl, ribs, dimples, hexagons, bricks, weave, a picture) are
 * projected from the three directions and blended by the surface's direction, so they wrap round
 * a box and a cylinder without a hard seam. Organic ones (stone, leather, wood, fuzzy) are worked
 * out in space, with no projection at all.
 */

export type SurfaceTexturePattern = "knurl" | "ribs" | "dimples" | "hexagons" | "bricks" | "weave" | "stone" | "leather" | "wood" | "fuzzy" | "picture";

export const SURFACE_TEXTURE_PATTERNS: readonly SurfaceTexturePattern[] = ["knurl", "ribs", "dimples", "hexagons", "bricks", "weave", "stone", "leather", "wood", "fuzzy", "picture"];

export type SurfaceTextureOptions = {
  pattern: SurfaceTexturePattern;
  /** The pattern's repeat (its cell or period), mm. */
  size: number;
  /** How deep the texture goes, mm. */
  depth: number;
  /** "in": pressed into the part (keeps its size); "out": raised from it. */
  direction: "in" | "out";
  /** Also texture the faces facing up. The faces facing down are never textured. */
  top: boolean;
  /** A greyscale picture for "picture": light is high. */
  picture?: { width: number; height: number; values: Float32Array } | null;
  /** The most triangles the result may have. */
  maxTriangles?: number;
};

export type SurfaceTextureResult = { positions: Float32Array; triangles: number; edge: number; coarse: boolean };

export const DEFAULT_SURFACE_TEXTURE: SurfaceTextureOptions = { pattern: "knurl", size: 3, depth: 0.6, direction: "in", top: false };
export const SURFACE_TEXTURE_MAX_TRIANGLES = 1_500_000;
/** Faces meeting at more than this keep a crisp edge (the texture fades to nothing across it), degrees. */
const SHARP_FROM = 30;

/* ---------- patterns ---------- */

const frac = (x: number) => x - Math.floor(x);
/** 0 at the middle of a cell, 1 at its edges: a triangle wave. */
const tri = (x: number) => Math.abs(frac(x) - 0.5) * 2;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hash3(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const at = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return lerp(
    lerp(lerp(at(0, 0, 0), at(1, 0, 0), u), lerp(at(0, 1, 0), at(1, 1, 0), u), v),
    lerp(lerp(at(0, 0, 1), at(1, 0, 1), u), lerp(at(0, 1, 1), at(1, 1, 1), u), v),
    w,
  );
}

function fbm(x: number, y: number, z: number, octaves: number) {
  let sum = 0, amplitude = 0.5, norm = 0, f = 1;
  for (let i = 0; i < octaves; i += 1) {
    sum += amplitude * valueNoise(x * f, y * f, z * f);
    norm += amplitude;
    amplitude *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/** Distance to the nearest and second nearest of points scattered one per unit cell (Worley). */
function worley(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let d1 = Infinity, d2 = Infinity;
  for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
    const cx = ix + dx, cy = iy + dy, cz = iz + dz;
    const px = cx + hash3(cx, cy, cz), py = cy + hash3(cy, cz, cx), pz = cz + hash3(cz, cx, cy);
    const d = Math.hypot(px - x, py - y, pz - z);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return { d1, d2 };
}

/** The height of a flat pattern at (u, v), in cells, 0 to 1. */
function planar(pattern: SurfaceTexturePattern, u: number, v: number, picture: SurfaceTextureOptions["picture"]): number {
  switch (pattern) {
    case "knurl":
      // Diamonds: two crossing rows of grooves.
      return Math.min(tri(u + v), tri(u - v));
    case "ribs":
      return 0.5 + 0.5 * Math.cos(2 * Math.PI * u);
    case "dimples": {
      // Round dimples on a staggered grid.
      const row = Math.floor(v / 0.866);
      const x = u + (row % 2 ? 0.5 : 0), y = v / 0.866;
      const dx = frac(x) - 0.5, dy = (frac(y) - 0.5) * 0.866;
      const r = Math.hypot(dx, dy) / 0.42;
      return 1 - (r < 1 ? Math.sqrt(1 - r * r) : 0);
    }
    case "hexagons": {
      // Raised walls round hexagonal cells.
      const q = (2 / 3) * u, r = (-1 / 3) * u + (Math.sqrt(3) / 3) * v;
      let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
      const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry + q + r);
      if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
      const centreU = 1.5 * rx, centreV = Math.sqrt(3) * (rz + rx / 2);
      const pu = Math.abs(u - centreU), pv = Math.abs(v - centreV);
      const toEdge = Math.max(pv / (Math.sqrt(3) / 2), (pu * 1.5 + pv * (Math.sqrt(3) / 2)) / (Math.sqrt(3)));
      return smooth(0.78, 0.92, toEdge);
    }
    case "bricks": {
      const row = Math.floor(v * 2);
      const x = u + (row % 2 ? 0.5 : 0);
      const mortar = Math.min(Math.abs(frac(x) - 0.5) < 0.46 ? 1 : 0, Math.abs(frac(v * 2) - 0.5) < 0.42 ? 1 : 0);
      const edgeU = 0.5 - Math.abs(frac(x) - 0.5), edgeV = (0.5 - Math.abs(frac(v * 2) - 0.5)) / 2;
      return mortar ? 1 - 0.5 * (1 - smooth(0, 0.06, Math.min(edgeU, edgeV))) : 0;
    }
    case "weave": {
      // Over-under strands, like a carbon or basket weave.
      const cellU = Math.floor(u * 2), cellV = Math.floor(v * 2);
      const along = (cellU + cellV) % 2 === 0;
      const t = along ? frac(v * 2) : frac(u * 2);
      return Math.sin(Math.PI * t) * 0.85 + 0.15;
    }
    case "picture": {
      if (!picture || picture.width < 1 || picture.height < 1) return 0;
      const x = frac(u) * (picture.width - 1), y = (1 - frac(v)) * (picture.height - 1);
      const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(picture.width - 1, x0 + 1), y1 = Math.min(picture.height - 1, y0 + 1);
      const tx = x - x0, ty = y - y0;
      const at = (px: number, py: number) => picture.values[py * picture.width + px];
      return (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
    }
    default:
      return 0;
  }
}

/** The pattern's height at a point on the surface with normal n, 0 to 1. Positions in mm. */
export function textureHeight(o: Pick<SurfaceTextureOptions, "pattern" | "size" | "picture">, x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
  const s = Math.max(0.2, o.size);
  switch (o.pattern) {
    case "stone":
      return smooth(0.25, 0.75, fbm(x / s, y / s, z / s, 4));
    case "leather": {
      const { d1, d2 } = worley(x / s, y / s, z / s);
      return 1 - smooth(0, 0.18, d2 - d1);
    }
    case "wood": {
      // Rings round the upright axis, wavering a little.
      const r = Math.hypot(x, z) / s + 0.6 * fbm(x / (4 * s), y / (12 * s), z / (4 * s), 3);
      return Math.pow(tri(r), 2);
    }
    case "fuzzy":
      return fbm((x / s) * 3, (y / s) * 3, (z / s) * 3, 2);
    default: {
      // Projected from the three directions, blended by the surface's direction.
      const ax = nx ** 4, ay = ny ** 4, az = nz ** 4;
      const sum = ax + ay + az || 1;
      let h = 0;
      if (ax > 1e-4) h += (ax / sum) * planar(o.pattern, z / s, y / s, o.picture);
      if (ay > 1e-4) h += (ay / sum) * planar(o.pattern, x / s, z / s, o.picture);
      if (az > 1e-4) h += (az / sum) * planar(o.pattern, x / s, y / s, o.picture);
      return h;
    }
  }
}

/* ---------- mesh ---------- */

type Indexed = { v: number[]; f: number[] };

function weld(positions: ArrayLike<number>): Indexed {
  const map = new Map<string, number>();
  const v: number[] = [];
  const f: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
    let index = map.get(key);
    if (index === undefined) {
      index = v.length / 3;
      map.set(key, index);
      v.push(x, y, z);
    }
    f.push(index);
  }
  // Triangles squashed to a line or a point by the weld carry nothing.
  const kept: number[] = [];
  for (let t = 0; t < f.length; t += 3) if (f[t] !== f[t + 1] && f[t + 1] !== f[t + 2] && f[t] !== f[t + 2]) kept.push(f[t], f[t + 1], f[t + 2]);
  return { v, f: kept };
}

function area(m: Indexed) {
  let sum = 0;
  for (let t = 0; t < m.f.length; t += 3) {
    const a = m.f[t] * 3, b = m.f[t + 1] * 3, c = m.f[t + 2] * 3;
    const ux = m.v[b] - m.v[a], uy = m.v[b + 1] - m.v[a + 1], uz = m.v[b + 2] - m.v[a + 2];
    const wx = m.v[c] - m.v[a], wy = m.v[c + 1] - m.v[a + 1], wz = m.v[c + 2] - m.v[a + 2];
    sum += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  }
  return sum;
}

/**
 * Splits every edge longer than `edge` at its middle, pass after pass, and each triangle by how
 * many of its edges were split. An edge is split or not the same way from both its triangles, so
 * no crack opens.
 */
function subdivide(m: Indexed, edge: number, maxTriangles: number): Indexed {
  let { v, f } = m;
  const limit = edge * edge;
  for (let pass = 0; pass < 24; pass += 1) {
    const mids = new Map<number, number>();
    const key = (a: number, b: number) => (a < b ? a * 0x4000000 + b : b * 0x4000000 + a);
    const long = (a: number, b: number) => {
      const dx = v[a * 3] - v[b * 3], dy = v[a * 3 + 1] - v[b * 3 + 1], dz = v[a * 3 + 2] - v[b * 3 + 2];
      return dx * dx + dy * dy + dz * dz > limit;
    };
    const mid = (a: number, b: number) => {
      const k = key(a, b);
      let index = mids.get(k);
      if (index === undefined) {
        index = v.length / 3;
        v.push((v[a * 3] + v[b * 3]) / 2, (v[a * 3 + 1] + v[b * 3 + 1]) / 2, (v[a * 3 + 2] + v[b * 3 + 2]) / 2);
        mids.set(k, index);
      }
      return index;
    };
    let any = false;
    for (let t = 0; t < f.length && !any; t += 3) if (long(f[t], f[t + 1]) || long(f[t + 1], f[t + 2]) || long(f[t + 2], f[t])) any = true;
    if (!any) break;
    const next: number[] = [];
    for (let t = 0; t < f.length; t += 3) {
      const a = f[t], b = f[t + 1], c = f[t + 2];
      const sab = long(a, b), sbc = long(b, c), sca = long(c, a);
      const n = Number(sab) + Number(sbc) + Number(sca);
      if (n === 0) { next.push(a, b, c); continue; }
      if (n === 3) {
        const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
        continue;
      }
      if (n === 1) {
        if (sab) { const m1 = mid(a, b); next.push(a, m1, c, m1, b, c); }
        else if (sbc) { const m1 = mid(b, c); next.push(a, b, m1, a, m1, c); }
        else { const m1 = mid(c, a); next.push(a, b, m1, m1, b, c); }
        continue;
      }
      // Two edges split: the corner between them gets its own triangle, the rest is a quad cut in two.
      if (!sab) { const bc = mid(b, c), ca = mid(c, a); next.push(c, ca, bc, a, b, bc, a, bc, ca); }
      else if (!sbc) { const ab = mid(a, b), ca = mid(c, a); next.push(a, ab, ca, ab, b, c, ab, c, ca); }
      else { const ab = mid(a, b), bc = mid(b, c); next.push(b, bc, ab, a, ab, bc, a, bc, c); }
    }
    f = next;
    if (f.length / 3 > maxTriangles) break;
  }
  return { v, f };
}

/**
 * The distance along the mesh's edges from each corner to the nearest corner on a sharp edge (where
 * its faces turn by more than about SHARP_FROM degrees), up to `limit`. Corners further
 * away get `limit`.
 */
function distanceFromSharp(m: Indexed, sharp: Float64Array, limit: number): Float64Array {
  const count = m.v.length / 3;
  const distance = new Float64Array(count).fill(limit);
  const neighbours: number[][] = Array.from({ length: count }, () => []);
  for (let t = 0; t < m.f.length; t += 3) {
    const a = m.f[t], b = m.f[t + 1], c = m.f[t + 2];
    neighbours[a].push(b, c); neighbours[b].push(c, a); neighbours[c].push(a, b);
  }
  // Dijkstra from every sharp corner at once, with a binary heap.
  const heap: Array<[number, number]> = [];
  const push = (d: number, i: number) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (heap[parent][0] <= heap[k][0]) break;
      [heap[parent], heap[k]] = [heap[k], heap[parent]];
      k = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let smallest = k;
        if (l < heap.length && heap[l][0] < heap[smallest][0]) smallest = l;
        if (r < heap.length && heap[r][0] < heap[smallest][0]) smallest = r;
        if (smallest === k) break;
        [heap[smallest], heap[k]] = [heap[k], heap[smallest]];
        k = smallest;
      }
    }
    return top;
  };
  // A corner counts as on a sharp edge when its faces turn by more than SHARP_FROM degrees from its normal.
  for (let i = 0; i < count; i += 1) if (sharp[i] * 2 > SHARP_FROM) { distance[i] = 0; push(0, i); }
  while (heap.length) {
    const [d, i] = pop();
    if (d > distance[i]) continue;
    for (const j of neighbours[i]) {
      const step = Math.hypot(m.v[i * 3] - m.v[j * 3], m.v[i * 3 + 1] - m.v[j * 3 + 1], m.v[i * 3 + 2] - m.v[j * 3 + 2]);
      const next = d + step;
      if (next < distance[j] && next < limit) { distance[j] = next; push(next, j); }
    }
  }
  return distance;
}

/** The part with the texture on it. `positions`: its triangles in the world, Y up (the plate is y = lowest). */
export function textureMeshPositions(positions: ArrayLike<number>, options: SurfaceTextureOptions): SurfaceTextureResult {
  const o = { ...DEFAULT_SURFACE_TEXTURE, ...options };
  const budget = Math.max(10_000, o.maxTriangles ?? SURFACE_TEXTURE_MAX_TRIANGLES);
  const welded = weld(positions);
  if (welded.f.length < 3) throw new Error("The part has no surface to texture.");
  const depth = Math.max(0.05, Math.min(5, o.depth));
  const size = Math.max(0.3, o.size);
  // Six corners across a cell follow the pattern; finer where the budget allows.
  const total = area(welded);
  const wanted = size / 6;
  const affordable = Math.sqrt((total * 2.3) / budget);
  const edge = Math.max(wanted, affordable, 0.08);
  const m = subdivide(welded, edge, budget);
  const vertexCount = m.v.length / 3;
  // Normals at the corners, area weighted, and how sharp the edge through each corner is.
  const normal = new Float64Array(vertexCount * 3);
  const faceNormals = new Float64Array(m.f.length);
  for (let t = 0; t < m.f.length; t += 3) {
    const a = m.f[t] * 3, b = m.f[t + 1] * 3, c = m.f[t + 2] * 3;
    const ux = m.v[b] - m.v[a], uy = m.v[b + 1] - m.v[a + 1], uz = m.v[b + 2] - m.v[a + 2];
    const wx = m.v[c] - m.v[a], wy = m.v[c + 1] - m.v[a + 1], wz = m.v[c + 2] - m.v[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const length = Math.hypot(nx, ny, nz) || 1;
    faceNormals[t] = nx / length; faceNormals[t + 1] = ny / length; faceNormals[t + 2] = nz / length;
    for (const i of [m.f[t], m.f[t + 1], m.f[t + 2]]) { normal[i * 3] += nx; normal[i * 3 + 1] += ny; normal[i * 3 + 2] += nz; }
  }
  for (let i = 0; i < vertexCount; i += 1) {
    const length = Math.hypot(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]) || 1;
    normal[i * 3] /= length; normal[i * 3 + 1] /= length; normal[i * 3 + 2] /= length;
  }
  // The sharpest turn between a corner's faces and its normal: flat surfaces 0, a box corner 55.
  const sharp = new Float64Array(vertexCount);
  for (let t = 0; t < m.f.length; t += 3) {
    for (const i of [m.f[t], m.f[t + 1], m.f[t + 2]]) {
      const dot = faceNormals[t] * normal[i * 3] + faceNormals[t + 1] * normal[i * 3 + 1] + faceNormals[t + 2] * normal[i * 3 + 2];
      const angle = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
      if (angle > sharp[i]) sharp[i] = angle;
    }
  }
  // How far each corner is from the nearest sharp edge, along the surface (up to `fade`): the
  // texture grows from nothing there, slowly enough (fade > 1.5 x depth) that the two walls of a
  // corner cannot be pushed into each other.
  const fade = Math.max(depth * 2, edge * 2);
  const away = distanceFromSharp(m, sharp, fade);
  const sign = o.direction === "out" ? 1 : -1;
  const out = new Float32Array(m.f.length * 3);
  const moved = new Float64Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i += 1) {
    const x = m.v[i * 3], y = m.v[i * 3 + 1], z = m.v[i * 3 + 2];
    const nx = normal[i * 3], ny = normal[i * 3 + 1], nz = normal[i * 3 + 2];
    // Faces facing down stay flat; facing up only when asked.
    let weight = 1 - smooth(0.6, 0.85, -ny);
    if (!o.top) weight *= 1 - smooth(0.6, 0.85, ny);
    weight *= smooth(0, fade, away[i]);
    const h = weight > 0 ? textureHeight({ pattern: o.pattern, size, picture: o.picture }, x, y, z, nx, ny, nz) : 0;
    // Pressed in: the surface stays where it was at the pattern's top, and goes in by the depth at its bottom.
    const d = sign * depth * weight * (o.direction === "out" ? h : 1 - h);
    moved[i * 3] = x + nx * d;
    moved[i * 3 + 1] = y + ny * d;
    moved[i * 3 + 2] = z + nz * d;
  }
  for (let t = 0; t < m.f.length; t += 1) {
    const i = m.f[t] * 3;
    out[t * 3] = moved[i];
    out[t * 3 + 1] = moved[i + 1];
    out[t * 3 + 2] = moved[i + 2];
  }
  return { positions: out, triangles: m.f.length / 3, edge, coarse: edge > wanted * 1.5 };
}

/** A picture as heights for the "picture" pattern: its brightness, 0 (dark) to 1 (light), at most 512 px a side. */
export function pictureHeights(data: ArrayLike<number>, width: number, height: number): { width: number; height: number; values: Float32Array } {
  const values = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const alpha = data[i * 4 + 3] / 255;
    const light = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
    values[i] = light * alpha + (1 - alpha);
  }
  return { width, height, values };
}
