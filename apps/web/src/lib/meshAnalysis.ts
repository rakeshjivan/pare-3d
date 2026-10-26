/**
 * Mesh analysis engines (Meshmixer-style Analysis tools): wall thickness, overhangs,
 * mid-air islands and weak spots (thin necks).
 *
 * Pure functions over triangle soups: 9 numbers per triangle (x,y,z × 3), Y-up, millimetres,
 * +Y up from the build plate. No DOM, no editor state — safe to run inside a Web Worker
 * (see `runMeshAnalysis`, whose results hold only typed arrays and plain objects).
 *
 * Every engine returns raw values (mm, mm², degrees) plus 0..1 "normalised" arrays a viewport can
 * map straight onto a colour ramp. Per-triangle arrays have one entry per triangle; "corner"
 * arrays have one entry per soup vertex (3 per triangle), matching a non-indexed BufferGeometry.
 */
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";

export type TriangleSoup = ArrayLike<number>;

// ---------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------

interface SoupGeometry {
  triangleCount: number;
  positions: Float32Array;
  /** Unit face normals (0,0,0 for degenerate triangles). */
  normals: Float32Array;
  areas: Float32Array;
  centroids: Float32Array;
  min: [number, number, number];
  max: [number, number, number];
  diagonal: number;
}

function soupGeometry(soup: TriangleSoup): SoupGeometry {
  if (soup.length % 9 !== 0) throw new Error(`Triangle soup length ${soup.length} is not a multiple of 9`);
  const triangleCount = soup.length / 9;
  const positions = soup instanceof Float32Array ? soup : Float32Array.from(soup as ArrayLike<number>);
  const normals = new Float32Array(triangleCount * 3);
  const areas = new Float32Array(triangleCount);
  const centroids = new Float32Array(triangleCount * 3);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < triangleCount; t += 1) {
    const o = t * 9;
    const ax = positions[o], ay = positions[o + 1], az = positions[o + 2];
    const bx = positions[o + 3], by = positions[o + 4], bz = positions[o + 5];
    const cx = positions[o + 6], cy = positions[o + 7], cz = positions[o + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    areas[t] = len / 2;
    if (len > 0) {
      normals[t * 3] = nx / len;
      normals[t * 3 + 1] = ny / len;
      normals[t * 3 + 2] = nz / len;
    }
    centroids[t * 3] = (ax + bx + cx) / 3;
    centroids[t * 3 + 1] = (ay + by + cy) / 3;
    centroids[t * 3 + 2] = (az + bz + cz) / 3;
    for (let k = 0; k < 9; k += 1) {
      const axis = k % 3;
      const value = positions[o + k];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  const diagonal = triangleCount ? Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) : 0;
  return { triangleCount, positions, normals, areas, centroids, min, max, diagonal };
}

interface Weld {
  /** Welded vertex id for each soup corner (3 per triangle). */
  cornerVertex: Uint32Array;
  vertexCount: number;
  /** Welded vertex positions. */
  vertices: Float32Array;
}

/** Merge soup corners that coincide within `tolerance` mm (grid quantisation). */
function weldSoup(positions: Float32Array, tolerance: number): Weld {
  const cornerCount = positions.length / 3;
  const cornerVertex = new Uint32Array(cornerCount);
  const ids = new Map<string, number>();
  const verts: number[] = [];
  const q = 1 / tolerance;
  for (let c = 0; c < cornerCount; c += 1) {
    const x = positions[c * 3], y = positions[c * 3 + 1], z = positions[c * 3 + 2];
    const key = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = verts.length / 3;
      ids.set(key, id);
      verts.push(x, y, z);
    }
    cornerVertex[c] = id;
  }
  return { cornerVertex, vertexCount: verts.length / 3, vertices: Float32Array.from(verts) };
}

function weldToleranceFor(geometry: SoupGeometry, override?: number) {
  return override ?? Math.max(1e-5, geometry.diagonal * 1e-6);
}

/** Map from undirected welded edge key to the triangles that use it. */
function edgeKey(a: number, b: number) {
  return a < b ? a * 4294967296 + b : b * 4294967296 + a;
}

class UnionFind {
  parent: Int32Array;
  constructor(size: number) {
    this.parent = new Int32Array(size);
    for (let i = 0; i < size; i += 1) this.parent[i] = i;
  }
  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[i] !== root) {
      const next = this.parent[i];
      this.parent[i] = root;
      i = next;
    }
    return root;
  }
  union(a: number, b: number) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

/** Area-weighted percentile (p in 0..1) of `values` over the triangles in `indices` (or all). */
function weightedPercentile(values: Float32Array, weights: Float32Array, p: number, indices?: ArrayLike<number>) {
  const list = indices ? Array.from(indices) : Array.from({ length: values.length }, (_, i) => i);
  if (!list.length) return NaN;
  list.sort((a, b) => values[a] - values[b]);
  let total = 0;
  for (const i of list) total += weights[i];
  if (total <= 0) return values[list[Math.min(list.length - 1, Math.floor(p * list.length))]];
  const target = p * total;
  let running = 0;
  for (const i of list) {
    running += weights[i];
    if (running >= target) return values[i];
  }
  return values[list[list.length - 1]];
}

/** Spread per-triangle values to soup corners (3 per triangle). */
export function triangleValuesToCorners(values: ArrayLike<number>): Float32Array {
  const out = new Float32Array(values.length * 3);
  for (let t = 0; t < values.length; t += 1) out[t * 3] = out[t * 3 + 1] = out[t * 3 + 2] = values[t];
  return out;
}

// ---------------------------------------------------------------------------------------------
// 1) Thickness (shape-diameter / inward-ray method)
// ---------------------------------------------------------------------------------------------

export interface ThicknessOptions {
  /** Thickness at which the colour ramp saturates; rays are not traced further (mm). */
  maxThickness: number;
  /** Rays per triangle: one along the inward normal plus `samples - 1` on a cone. Default 7. */
  samples?: number;
  /** Cone half-angle in degrees. Default 15 (thickness, not the SDF paper's 60° volume measure). */
  coneAngle?: number;
  /** Corner welding tolerance (mm) for the smoothed per-vertex map. Default 1e-6 × bbox diagonal. */
  weldTolerance?: number;
}

export interface ThicknessMap {
  triangleCount: number;
  maxThickness: number;
  /** Per-triangle wall thickness in mm; `Infinity` = thicker than maxThickness or ray escaped (open mesh). */
  thickness: Float32Array;
  /** Per-triangle 0..1 (thickness / maxThickness, clamped). 0 = thinnest. */
  normalized: Float32Array;
  /** Per-welded-vertex thickness (area-weighted mean of incident triangles, capped at maxThickness). */
  vertexThickness: Float32Array;
  /** Per-soup-corner 0..1 from the welded vertex map: smooth tint for a non-indexed geometry. */
  cornerNormalized: Float32Array;
  /** Welded vertex id per soup corner (lets callers build an indexed geometry). */
  cornerVertex: Uint32Array;
  /** Triangle areas in mm² (reused by thinAreas/weakSpots). */
  areas: Float32Array;
  /** Triangle centroids (3 per triangle). */
  centroids: Float32Array;
  /** Unit face normals (3 per triangle). */
  normals: Float32Array;
  /** Rays traced in total. */
  rayCount: number;
}

/** Unit vectors forming an orthonormal basis with `d`. */
function basisFor(dx: number, dy: number, dz: number, u: THREE.Vector3, v: THREE.Vector3) {
  if (Math.abs(dx) < 0.9) u.set(0, dz, -dy); // d × x̂
  else u.set(-dz, 0, dx); // d × ŷ
  u.normalize();
  v.set(dy * u.z - dz * u.y, dz * u.x - dx * u.z, dx * u.y - dy * u.x);
}

/**
 * Wall thickness per triangle via the shape-diameter function (Shapira, Shamir & Cohen-Or 2008,
 * "Consistent mesh partitioning and skeletonisation using the shape diameter function"), as used by
 * Meshmixer and Blender's 3D-Print Toolbox: from each face centroid a cone of rays is cast opposite
 * the face normal; only back-facing hits count (the far wall seen from inside the material), which
 * discards the source face, its coplanar neighbours and stray self-hits; the thickness is the median
 * hit distance. Rays that escape count as "thicker than max" (∞); if more than half escape the
 * triangle reads ∞.
 */
export function thicknessMap(soup: TriangleSoup, options: ThicknessOptions): ThicknessMap {
  const geometry = soupGeometry(soup);
  const { triangleCount, positions, normals, centroids, areas } = geometry;
  const maxThickness = options.maxThickness;
  if (!(maxThickness > 0)) throw new Error("maxThickness must be > 0");
  const samples = Math.max(1, Math.floor(options.samples ?? 7));
  const cone = ((options.coneAngle ?? 15) * Math.PI) / 180;
  const thickness = new Float32Array(triangleCount);
  const normalized = new Float32Array(triangleCount);

  // Ring directions in the local (u, v, d) frame.
  const ring = samples - 1;
  const cosCone = Math.cos(cone), sinCone = Math.sin(cone);
  const far = maxThickness / (ring > 0 ? cosCone : 1) + 1e-6;
  const near = Math.max(1e-6, geometry.diagonal * 1e-7);

  const buffer = new THREE.BufferGeometry();
  buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const bvh = triangleCount ? new MeshBVH(buffer, { indirect: true }) : null;
  const ray = new THREE.Ray();
  const u = new THREE.Vector3(), v = new THREE.Vector3();
  const hits = new Float64Array(samples);
  let rayCount = 0;

  for (let t = 0; t < triangleCount; t += 1) {
    const nx = normals[t * 3], ny = normals[t * 3 + 1], nz = normals[t * 3 + 2];
    if (!bvh || (nx === 0 && ny === 0 && nz === 0)) {
      thickness[t] = Infinity;
      normalized[t] = 1;
      continue;
    }
    const dx = -nx, dy = -ny, dz = -nz;
    basisFor(dx, dy, dz, u, v);
    ray.origin.set(centroids[t * 3], centroids[t * 3 + 1], centroids[t * 3 + 2]);
    for (let s = 0; s < samples; s += 1) {
      if (s === 0) ray.direction.set(dx, dy, dz);
      else {
        // Ring rays evenly spaced around the cone.
        const phi = (s - 1) * ((2 * Math.PI) / ring);
        const cu = Math.cos(phi) * sinCone, cv = Math.sin(phi) * sinCone;
        ray.direction.set(dx * cosCone + u.x * cu + v.x * cv, dy * cosCone + u.y * cu + v.y * cv, dz * cosCone + u.z * cu + v.z * cv);
      }
      const hit = bvh.raycastFirst(ray, THREE.BackSide, near, far);
      hits[s] = hit ? hit.distance : Infinity;
      rayCount += 1;
    }
    hits.sort();
    const median = samples % 2 ? hits[(samples - 1) / 2] : (hits[samples / 2 - 1] + hits[samples / 2]) / 2;
    const value = median > maxThickness ? Infinity : median;
    thickness[t] = value;
    normalized[t] = Number.isFinite(value) ? Math.min(1, value / maxThickness) : 1;
  }
  buffer.dispose();

  // Smoothed per-vertex map on the welded mesh.
  const weld = weldSoup(positions, weldToleranceFor(geometry, options.weldTolerance));
  const sum = new Float64Array(weld.vertexCount);
  const weight = new Float64Array(weld.vertexCount);
  for (let t = 0; t < triangleCount; t += 1) {
    const value = Math.min(thickness[t], maxThickness);
    const a = areas[t] || 1e-12;
    for (let k = 0; k < 3; k += 1) {
      const id = weld.cornerVertex[t * 3 + k];
      sum[id] += value * a;
      weight[id] += a;
    }
  }
  const vertexThickness = new Float32Array(weld.vertexCount);
  for (let i = 0; i < weld.vertexCount; i += 1) vertexThickness[i] = weight[i] > 0 ? sum[i] / weight[i] : maxThickness;
  const cornerNormalized = new Float32Array(triangleCount * 3);
  for (let c = 0; c < cornerNormalized.length; c += 1) {
    cornerNormalized[c] = Math.min(1, vertexThickness[weld.cornerVertex[c]] / maxThickness);
  }

  return {
    triangleCount,
    maxThickness,
    thickness,
    normalized,
    vertexThickness,
    cornerNormalized,
    cornerVertex: weld.cornerVertex,
    areas,
    centroids,
    normals,
    rayCount,
  };
}

export interface ThinAreasResult {
  minimum: number;
  /** 1 for triangles thinner than `minimum`. */
  flagged: Uint8Array;
  flaggedCount: number;
  /** Per-triangle 0..1 severity: 1 − thickness/minimum for flagged triangles, else 0. */
  severity: Float32Array;
  /** Thinnest measured wall (mm), or Infinity when nothing was hit. */
  minThickness: number;
  /** Area-weighted 5th percentile thickness (mm). */
  p5: number;
  /** Total area of flagged triangles (mm²). */
  areaBelow: number;
  totalArea: number;
}

/** Flag triangles of a thickness map that are thinner than `minimum` (mm) and summarise them. */
export function thinAreas(map: ThicknessMap, minimum: number): ThinAreasResult {
  const n = map.triangleCount;
  const flagged = new Uint8Array(n);
  const severity = new Float32Array(n);
  let flaggedCount = 0, areaBelow = 0, totalArea = 0, minThickness = Infinity;
  for (let t = 0; t < n; t += 1) {
    const value = map.thickness[t];
    totalArea += map.areas[t];
    if (value < minThickness) minThickness = value;
    if (value < minimum) {
      flagged[t] = 1;
      flaggedCount += 1;
      areaBelow += map.areas[t];
      severity[t] = Math.min(1, Math.max(0, 1 - value / minimum));
    }
  }
  const p5 = weightedPercentile(map.thickness, map.areas, 0.05);
  return { minimum, flagged, flaggedCount, severity, minThickness, p5, areaBelow, totalArea };
}

// ---------------------------------------------------------------------------------------------
// 2) Overhangs and islands
// ---------------------------------------------------------------------------------------------

export interface OverhangOptions {
  /** Critical overhang angle from vertical in degrees (Meshmixer/slicer convention). Default 45. */
  angle?: number;
  /** Faces with every vertex within this height of the plate are ignored. Default 0.05 mm. */
  plateTolerance?: number;
  /** Plate height; default is the lowest point of the mesh. */
  plateY?: number;
}

export interface OverhangMap {
  triangleCount: number;
  angle: number;
  plateY: number;
  /** Per-triangle overhang angle from vertical, degrees: 0 = vertical wall, 90 = flat ceiling; ≤ 0 for up/side-facing. */
  overhangAngle: Float32Array;
  /** 1 for faces overhanging more than `angle` (and not on the plate). */
  flagged: Uint8Array;
  /** Per-triangle 0..1: (overhangAngle − angle) / (90 − angle) for flagged faces, else 0. */
  severity: Float32Array;
  flaggedCount: number;
  /** Total flagged area (mm²). */
  area: number;
  /** Flagged area projected on the plate (mm²) — the support footprint from above. */
  projectedArea: number;
}

/** Faces whose downward slope exceeds `angle` from vertical, excluding faces lying on the plate. */
export function overhangMap(soup: TriangleSoup, options: OverhangOptions = {}): OverhangMap {
  const geometry = soupGeometry(soup);
  const { triangleCount, normals, areas, positions } = geometry;
  const angle = options.angle ?? 45;
  const tolerance = options.plateTolerance ?? 0.05;
  const plateY = options.plateY ?? (triangleCount ? geometry.min[1] : 0);
  const overhangAngle = new Float32Array(triangleCount);
  const flagged = new Uint8Array(triangleCount);
  const severity = new Float32Array(triangleCount);
  let flaggedCount = 0, area = 0, projectedArea = 0;
  for (let t = 0; t < triangleCount; t += 1) {
    const ny = normals[t * 3 + 1];
    const degrees = (Math.asin(Math.max(-1, Math.min(1, -ny))) * 180) / Math.PI;
    overhangAngle[t] = degrees;
    if (areas[t] === 0 || degrees <= angle) continue;
    const o = t * 9;
    const onPlate = positions[o + 1] - plateY <= tolerance && positions[o + 4] - plateY <= tolerance && positions[o + 7] - plateY <= tolerance;
    if (onPlate) continue;
    flagged[t] = 1;
    flaggedCount += 1;
    area += areas[t];
    projectedArea += areas[t] * -ny;
    severity[t] = angle >= 90 ? 1 : Math.min(1, (degrees - angle) / (90 - angle));
  }
  return { triangleCount, angle, plateY, overhangAngle, flagged, severity, flaggedCount, area, projectedArea };
}

export interface IslandOptions {
  plateTolerance?: number;
  plateY?: number;
  /** Height band (mm) treated as level when grouping a flat-bottomed minimum. Default 0.01. */
  flatTolerance?: number;
  weldTolerance?: number;
}

export interface Island {
  /** Height of the island's lowest point (mm). */
  y: number;
  /** Height above the plate (mm). */
  height: number;
  /** Centre of the lowest vertices. */
  point: [number, number, number];
  /** Area of the flat bottom (triangles lying in the minimum band), mm²; 0 for a point/edge minimum. */
  area: number;
  /** Triangles touching the island's lowest vertices. */
  triangles: Uint32Array;
}

export interface IslandsResult {
  plateY: number;
  islands: Island[];
  /** Per-triangle 1 for island triangles (for tinting). */
  flagged: Uint8Array;
}

/**
 * Regions that would start printing in mid-air: local minima in y of the welded surface (a vertex,
 * or a level group of vertices, with no lower neighbour) that face downward (area-weighted mean
 * normal of the touching faces has negative y, so material sits above — this excludes cavity floors)
 * and are not on the plate.
 */
export function islands(soup: TriangleSoup, options: IslandOptions = {}): IslandsResult {
  const geometry = soupGeometry(soup);
  const { triangleCount, normals, areas } = geometry;
  const plateY = options.plateY ?? (triangleCount ? geometry.min[1] : 0);
  const plateTolerance = options.plateTolerance ?? 0.05;
  const flatTolerance = options.flatTolerance ?? 0.01;
  const weld = weldSoup(geometry.positions, weldToleranceFor(geometry, options.weldTolerance));
  const { vertexCount, vertices, cornerVertex } = weld;

  // Vertex → incident triangles (CSR).
  const triStart = new Uint32Array(vertexCount + 1);
  for (let c = 0; c < cornerVertex.length; c += 1) triStart[cornerVertex[c] + 1] += 1;
  for (let i = 0; i < vertexCount; i += 1) triStart[i + 1] += triStart[i];
  const triList = new Uint32Array(cornerVertex.length);
  const fill = triStart.slice(0, vertexCount);
  for (let c = 0; c < cornerVertex.length; c += 1) triList[fill[cornerVertex[c]]++] = Math.floor(c / 3);

  // Group level neighbours (|Δy| ≤ flatTolerance) into plateaus.
  const uf = new UnionFind(vertexCount);
  for (let t = 0; t < triangleCount; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const a = cornerVertex[t * 3 + k], b = cornerVertex[t * 3 + ((k + 1) % 3)];
      if (Math.abs(vertices[a * 3 + 1] - vertices[b * 3 + 1]) <= flatTolerance) uf.union(a, b);
    }
  }
  // A plateau is a minimum if no edge leaves it downward.
  const plateauMinY = new Map<number, number>();
  const notMinimum = new Set<number>();
  for (let i = 0; i < vertexCount; i += 1) {
    const root = uf.find(i);
    const y = vertices[i * 3 + 1];
    const current = plateauMinY.get(root);
    if (current === undefined || y < current) plateauMinY.set(root, y);
  }
  for (let t = 0; t < triangleCount; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const a = cornerVertex[t * 3 + k], b = cornerVertex[t * 3 + ((k + 1) % 3)];
      const ra = uf.find(a), rb = uf.find(b);
      if (ra === rb) continue;
      if (vertices[b * 3 + 1] < vertices[a * 3 + 1]) notMinimum.add(ra);
      else if (vertices[a * 3 + 1] < vertices[b * 3 + 1]) notMinimum.add(rb);
    }
  }

  const members = new Map<number, number[]>();
  for (let i = 0; i < vertexCount; i += 1) {
    const root = uf.find(i);
    if (notMinimum.has(root)) continue;
    const y = plateauMinY.get(root)!;
    if (y - plateY <= plateTolerance) continue;
    let list = members.get(root);
    if (!list) members.set(root, (list = []));
    list.push(i);
  }

  const flagged = new Uint8Array(triangleCount);
  const result: Island[] = [];
  for (const [root, list] of members) {
    const inPlateau = new Set(list);
    const touching = new Set<number>();
    let normalY = 0, weightSum = 0;
    for (const v of list) {
      for (let j = triStart[v]; j < triStart[v + 1]; j += 1) touching.add(triList[j]);
    }
    let flatArea = 0;
    for (const t of touching) {
      normalY += normals[t * 3 + 1] * areas[t];
      weightSum += areas[t];
      if (inPlateau.has(cornerVertex[t * 3]) && inPlateau.has(cornerVertex[t * 3 + 1]) && inPlateau.has(cornerVertex[t * 3 + 2])) flatArea += areas[t];
    }
    if (!(weightSum > 0) || normalY / weightSum >= -1e-3) continue; // cavity floor or sliver, not a hanging minimum
    const point: [number, number, number] = [0, 0, 0];
    for (const v of list) {
      point[0] += vertices[v * 3] / list.length;
      point[1] += vertices[v * 3 + 1] / list.length;
      point[2] += vertices[v * 3 + 2] / list.length;
    }
    const y = plateauMinY.get(root)!;
    const triangles = Uint32Array.from(touching);
    for (const t of triangles) flagged[t] = 1;
    result.push({ y, height: y - plateY, point, area: flatArea, triangles });
  }
  result.sort((a, b) => a.y - b.y);
  return { plateY, islands: result, flagged };
}

// ---------------------------------------------------------------------------------------------
// 3) Weak spots (thin necks)
// ---------------------------------------------------------------------------------------------

export interface WeakSpotOptions {
  /** Walls thinner than this are candidates (mm). */
  minThickness: number;
  /** A candidate region is weak when the cross-section through it is below this (mm²). Default π·minThickness². */
  maxCrossSection?: number;
  /** Reuse a thickness map computed for the same soup (its maxThickness should exceed minThickness). */
  map?: ThicknessMap;
  samples?: number;
  weldTolerance?: number;
}

export interface WeakSpotRegion {
  /** Area-weighted centroid of the region's surface (mm). */
  centroid: [number, number, number];
  /** Surface area of the thin region (mm²). */
  area: number;
  minThickness: number;
  /** "rod" when the region's normals wrap around an axis (a neck), "sheet" for a thin plate/tab. */
  kind: "rod" | "sheet";
  /** Unit normal of the section plane used (the neck/strip axis). */
  axis: [number, number, number];
  /** Area of the solid cross-section through the region (mm²); NaN if no closed section was found. */
  crossSection: number;
  weak: boolean;
  triangles: Uint32Array;
}

export interface WeakSpotsResult {
  minThickness: number;
  maxCrossSection: number;
  /** All thin regions, weak ones first, then by ascending cross-section. */
  regions: WeakSpotRegion[];
  /** Per-triangle 0..1: weak-region triangles get 1 − thickness/minThickness (≥ 0.25 so they show), else 0. */
  severity: Float32Array;
  /** Per-triangle 1 for triangles in weak regions. */
  flagged: Uint8Array;
}

/** Eigen-decomposition of a symmetric 3×3 matrix (Jacobi). Returns eigenvalues descending with column vectors. */
function symmetricEigen(m: number[]): { values: number[]; vectors: [number, number, number][] } {
  const a = [[m[0], m[1], m[2]], [m[1], m[4], m[5]], [m[2], m[5], m[8]]];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep += 1) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-14) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]] as const) {
      if (Math.abs(a[p][q]) < 1e-18) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k += 1) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k += 1) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k += 1) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  return {
    values: order.map((i) => a[i][i]),
    vectors: order.map((i) => [v[0][i], v[1][i], v[2][i]] as [number, number, number]),
  };
}

interface SectionLoop {
  points: Float64Array; // 2D, interleaved
  area: number; // unsigned
}

/** Slice the welded mesh with a plane; return closed section loops in plane coordinates. */
function sliceLoops(
  vertices: Float32Array,
  cornerVertex: Uint32Array,
  triangleCount: number,
  origin: number[],
  normal: number[],
  e1: number[],
  e2: number[],
): SectionLoop[] {
  const distance = (id: number) => {
    const d = (vertices[id * 3] - origin[0]) * normal[0] + (vertices[id * 3 + 1] - origin[1]) * normal[1] + (vertices[id * 3 + 2] - origin[2]) * normal[2];
    return d === 0 ? 1e-12 : d; // symbolic perturbation: on-plane vertices count as above
  };
  const pointOn = new Map<number, [number, number]>();
  const links = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    let list = links.get(a);
    if (!list) links.set(a, (list = []));
    list.push(b);
  };
  const crossing = (a: number, b: number) => {
    const key = edgeKey(a, b);
    if (!pointOn.has(key)) {
      const da = distance(a), db = distance(b);
      const f = da / (da - db);
      const x = vertices[a * 3] + (vertices[b * 3] - vertices[a * 3]) * f - origin[0];
      const y = vertices[a * 3 + 1] + (vertices[b * 3 + 1] - vertices[a * 3 + 1]) * f - origin[1];
      const z = vertices[a * 3 + 2] + (vertices[b * 3 + 2] - vertices[a * 3 + 2]) * f - origin[2];
      pointOn.set(key, [x * e1[0] + y * e1[1] + z * e1[2], x * e2[0] + y * e2[1] + z * e2[2]]);
    }
    return key;
  };
  for (let t = 0; t < triangleCount; t += 1) {
    const ids = [cornerVertex[t * 3], cornerVertex[t * 3 + 1], cornerVertex[t * 3 + 2]];
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2]) continue;
    const ds = ids.map(distance);
    const keys: number[] = [];
    for (let k = 0; k < 3; k += 1) {
      const a = ids[k], b = ids[(k + 1) % 3];
      if (ds[k] > 0 !== ds[(k + 1) % 3] > 0) keys.push(crossing(a, b));
    }
    if (keys.length === 2) {
      link(keys[0], keys[1]);
      link(keys[1], keys[0]);
    }
  }
  const visited = new Set<number>();
  const loops: SectionLoop[] = [];
  for (const start of links.keys()) {
    if (visited.has(start)) continue;
    const chain: number[] = [];
    let previous = -1, current = start, closed = false;
    for (;;) {
      visited.add(current);
      chain.push(current);
      const next = (links.get(current) ?? []).find((candidate) => candidate !== previous && (!visited.has(candidate) || candidate === start));
      if (next === undefined) break;
      if (next === start) {
        closed = true;
        break;
      }
      previous = current;
      current = next;
    }
    if (!closed || chain.length < 3) continue;
    const points = new Float64Array(chain.length * 2);
    let twiceArea = 0;
    chain.forEach((key, i) => {
      const [x, y] = pointOn.get(key)!;
      points[i * 2] = x;
      points[i * 2 + 1] = y;
    });
    for (let i = 0; i < chain.length; i += 1) {
      const j = (i + 1) % chain.length;
      twiceArea += points[i * 2] * points[j * 2 + 1] - points[j * 2] * points[i * 2 + 1];
    }
    loops.push({ points, area: Math.abs(twiceArea) / 2 });
  }
  return loops;
}

function pointInLoop(loop: SectionLoop, x: number, y: number) {
  const p = loop.points;
  const n = p.length / 2;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = p[i * 2], yi = p[i * 2 + 1], xj = p[j * 2], yj = p[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Solid area of the section component containing (x, y): its outer loop minus the holes directly inside. */
function sectionAreaAt(loops: SectionLoop[], x: number, y: number): number {
  if (!loops.length) return NaN;
  const depth = loops.map((loop) => loops.filter((other) => other !== loop && other.area > loop.area && pointInLoop(other, loop.points[0], loop.points[1])).length);
  let index = -1;
  for (let i = 0; i < loops.length; i += 1) {
    if (pointInLoop(loops[i], x, y) && (index < 0 || loops[i].area < loops[index].area)) index = i;
  }
  if (index < 0) {
    // Fall back to the loop passing nearest the point.
    let best = Infinity;
    loops.forEach((loop, i) => {
      for (let k = 0; k < loop.points.length; k += 2) {
        const d = Math.hypot(loop.points[k] - x, loop.points[k + 1] - y);
        if (d < best) {
          best = d;
          index = i;
        }
      }
    });
  }
  if (depth[index] % 2 === 1) {
    // Inside a hole: use the smallest enclosing outer loop.
    const hole = loops[index];
    let parent = -1;
    loops.forEach((loop, i) => {
      if (depth[i] === depth[index] - 1 && loop.area > hole.area && pointInLoop(loop, hole.points[0], hole.points[1]) && (parent < 0 || loop.area < loops[parent].area)) parent = i;
    });
    if (parent < 0) return NaN;
    index = parent;
  }
  const outer = loops[index];
  let area = outer.area;
  loops.forEach((loop, i) => {
    if (depth[i] === depth[index] + 1 && loop.area < outer.area && pointInLoop(outer, loop.points[0], loop.points[1])) area -= loop.area;
  });
  return area;
}

function perpendicularBasis(n: number[]): [number[], number[]] {
  const u = new THREE.Vector3(), v = new THREE.Vector3();
  basisFor(n[0], n[1], n[2], u, v);
  return [[u.x, u.y, u.z], [v.x, v.y, v.z]];
}

/**
 * Weak spots: thin regions (thickness < minThickness, grouped into edge-connected components) whose
 * solid cross-section is also small. The section plane is chosen per region from its geometry:
 * - "rod" (normals wrap around an axis — second eigenvalue of the area-weighted normal covariance
 *   ≥ 0.15): the plane is perpendicular to the least-varying normal direction, i.e. the neck axis;
 * - "sheet" (normals essentially ±one direction): the plane is perpendicular to the region's longest
 *   in-plane extent, i.e. across a strip or tab.
 * The section area is that of the closed slice loop around the region (holes subtracted). A big thin
 * wall cuts a long section and is not weak; a thin neck or tab cuts a small one and is.
 */
export function weakSpots(soup: TriangleSoup, options: WeakSpotOptions): WeakSpotsResult {
  const geometry = soupGeometry(soup);
  const { triangleCount } = geometry;
  const minThickness = options.minThickness;
  const maxCrossSection = options.maxCrossSection ?? Math.PI * minThickness * minThickness;
  const map = options.map ?? thicknessMap(soup, { maxThickness: minThickness * 2, samples: options.samples, weldTolerance: options.weldTolerance });
  const weld = weldSoup(geometry.positions, weldToleranceFor(geometry, options.weldTolerance));
  const { cornerVertex, vertices } = weld;

  // Edge-connected components of thin triangles.
  const uf = new UnionFind(triangleCount);
  const edgeOwner = new Map<number, number>();
  for (let t = 0; t < triangleCount; t += 1) {
    if (!(map.thickness[t] < minThickness)) continue;
    for (let k = 0; k < 3; k += 1) {
      const key = edgeKey(cornerVertex[t * 3 + k], cornerVertex[t * 3 + ((k + 1) % 3)]);
      const owner = edgeOwner.get(key);
      if (owner === undefined) edgeOwner.set(key, t);
      else uf.union(owner, t);
    }
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < triangleCount; t += 1) {
    if (!(map.thickness[t] < minThickness)) continue;
    const root = uf.find(t);
    let list = groups.get(root);
    if (!list) groups.set(root, (list = []));
    list.push(t);
  }

  const regions: WeakSpotRegion[] = [];
  const { areas, normals, centroids } = geometry;
  for (const list of groups.values()) {
    let area = 0, minT = Infinity;
    const c = [0, 0, 0], meanN = [0, 0, 0];
    const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const t of list) {
      const a = areas[t];
      area += a;
      minT = Math.min(minT, map.thickness[t]);
      for (let i = 0; i < 3; i += 1) {
        c[i] += centroids[t * 3 + i] * a;
        meanN[i] += normals[t * 3 + i] * a;
        for (let j = 0; j < 3; j += 1) cov[i * 3 + j] += normals[t * 3 + i] * normals[t * 3 + j] * a;
      }
    }
    if (!(area > 0)) continue;
    for (let i = 0; i < 3; i += 1) {
      c[i] /= area;
      meanN[i] /= area;
    }
    for (let i = 0; i < 9; i += 1) cov[i] /= area;
    const normalEigen = symmetricEigen(cov);
    let kind: "rod" | "sheet";
    let axis: number[];
    if (normalEigen.values[1] >= 0.15) {
      kind = "rod";
      axis = normalEigen.vectors[2];
    } else {
      kind = "sheet";
      const n0 = normalEigen.vectors[0];
      const pos = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      // Exact second moment of each (uniform) triangle about c, projected into the sheet's plane:
      // ∫ x xᵀ dA = A/12 · (Σ vᵢvᵢᵀ + s sᵀ), s = Σ vᵢ.
      const positions = geometry.positions;
      for (const t of list) {
        const corners = [0, 1, 2].map((k) => {
          const d = [0, 1, 2].map((i) => positions[t * 9 + k * 3 + i] - c[i]);
          const dn = d[0] * n0[0] + d[1] * n0[1] + d[2] * n0[2];
          return d.map((value, i) => value - dn * n0[i]);
        });
        const s = [0, 1, 2].map((i) => corners[0][i] + corners[1][i] + corners[2][i]);
        const w = areas[t] / 12;
        for (let i = 0; i < 3; i += 1) {
          for (let j = 0; j < 3; j += 1) {
            pos[i * 3 + j] += w * (corners[0][i] * corners[0][j] + corners[1][i] * corners[1][j] + corners[2][i] * corners[2][j] + s[i] * s[j]);
          }
        }
      }
      axis = symmetricEigen(pos).vectors[0];
      if (Math.abs(axis[0] * n0[0] + axis[1] * n0[1] + axis[2] * n0[2]) > 0.5) axis = perpendicularBasis(n0)[0];
    }
    // An interior probe point: step from the surface centroid inward by half the local thickness.
    const meanLength = Math.hypot(meanN[0], meanN[1], meanN[2]);
    const probe = [...c];
    if (meanLength > 0.3) {
      const step = Math.min(minT, minThickness) / 2;
      for (let i = 0; i < 3; i += 1) probe[i] -= (meanN[i] / meanLength) * step;
    }
    const [e1, e2] = perpendicularBasis(axis);
    const loops = sliceLoops(vertices, cornerVertex, triangleCount, probe, axis, e1, e2);
    const crossSection = sectionAreaAt(loops, 0, 0);
    regions.push({
      centroid: [c[0], c[1], c[2]],
      area,
      minThickness: minT,
      kind,
      axis: [axis[0], axis[1], axis[2]],
      crossSection,
      weak: crossSection < maxCrossSection,
      triangles: Uint32Array.from(list),
    });
  }
  regions.sort((a, b) => Number(b.weak) - Number(a.weak) || (a.crossSection || Infinity) - (b.crossSection || Infinity));
  const severity = new Float32Array(triangleCount);
  const flagged = new Uint8Array(triangleCount);
  for (const region of regions) {
    if (!region.weak) continue;
    for (const t of region.triangles) {
      flagged[t] = 1;
      severity[t] = Math.max(0.25, Math.min(1, 1 - map.thickness[t] / minThickness));
    }
  }
  return { minThickness, maxCrossSection, regions, severity, flagged };
}

// ---------------------------------------------------------------------------------------------
// Worker-friendly entry
// ---------------------------------------------------------------------------------------------

export type MeshAnalysisRequest =
  | { kind: "thickness"; soup: Float32Array; options: ThicknessOptions; minimum?: number }
  | { kind: "overhangs"; soup: Float32Array; options?: OverhangOptions & IslandOptions }
  | { kind: "weakSpots"; soup: Float32Array; options: Omit<WeakSpotOptions, "map"> };

export type MeshAnalysisResponse =
  | { kind: "thickness"; map: ThicknessMap; thin?: ThinAreasResult }
  | { kind: "overhangs"; overhangs: OverhangMap; islands: IslandsResult }
  | { kind: "weakSpots"; result: WeakSpotsResult };

/** Single dispatch for a Web Worker `onmessage`; results contain only typed arrays and plain data. */
export function runMeshAnalysis(request: MeshAnalysisRequest): MeshAnalysisResponse {
  switch (request.kind) {
    case "thickness": {
      const map = thicknessMap(request.soup, request.options);
      return { kind: "thickness", map, thin: request.minimum === undefined ? undefined : thinAreas(map, request.minimum) };
    }
    case "overhangs":
      return { kind: "overhangs", overhangs: overhangMap(request.soup, request.options), islands: islands(request.soup, request.options) };
    case "weakSpots":
      return { kind: "weakSpots", result: weakSpots(request.soup, request.options) };
  }
}

/** Transferable buffers of a response, for `postMessage(response, transferables(response))`. */
export function meshAnalysisTransferables(response: MeshAnalysisResponse): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>();
  const visit = (value: unknown) => {
    if (ArrayBuffer.isView(value)) out.add(value.buffer as ArrayBuffer);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(response);
  return [...out];
}
