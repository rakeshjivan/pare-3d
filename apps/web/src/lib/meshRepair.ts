/**
 * Fork (build 30): checking and repairing triangle meshes - imported STL/3MF/OBJ files above all.
 *
 * meshHealth: is the surface watertight? Corners at the same place are joined first (a triangle soup
 *   lists every corner again); then every edge must be shared by exactly two triangles. An edge used
 *   once lies on an opening; one used three or more times is a broken (non-manifold) spot.
 * makeSolid: joins corners, drops degenerate and doubled triangles, closes every opening with a flat
 *   cap, turns all triangles the same way and outward. The caller checks the result with Manifold.
 * fillHoleAt: fills a hole - a screw hole, a bore, a hex nut trap - in a solid mesh. From the triangle
 *   clicked the hole's surface is gathered: across smooth edges and inward corners (the corners of a
 *   square hole, a blind hole's floor), stopping at outward edges, where the hole meets the faces
 *   round it. The convex hull of that surface is a plug that fits the hole; it is united with the body.
 */
import * as THREE from "three";
import { getManifoldRuntime } from "@/lib/editorMeshCore";
import { meshShapeFromPositions } from "@/lib/lithophane";
import type { WorkplaneShape } from "@/types/layerling";

const WELD = 1e4; // corners within 0.1 µm are one corner

/**
 * Parts just imported whose mesh the editor should check, by id. The import may happen on the start
 * page (a new design) or in the editor; the editor checks them when they appear. Kept for the session.
 */
export const pendingMeshChecks = new Set<string>();

export type Welded = { points: number[][]; triangles: number[][] };

/** Corners at the same place joined; triangles that collapse to a line or point dropped. */
export function weldTriangles(positions: ArrayLike<number>): Welded {
  const index = new Map<string, number>();
  const points: number[][] = [];
  const triangles: number[][] = [];
  const corner = (offset: number) => {
    const x = positions[offset], y = positions[offset + 1], z = positions[offset + 2];
    const key = `${Math.round(x * WELD)},${Math.round(y * WELD)},${Math.round(z * WELD)}`;
    let id = index.get(key);
    if (id === undefined) {
      id = points.length;
      points.push([x, y, z]);
      index.set(key, id);
    }
    return id;
  };
  for (let offset = 0; offset + 8 < positions.length; offset += 9) {
    const a = corner(offset), b = corner(offset + 3), c = corner(offset + 6);
    if (a === b || b === c || a === c) continue;
    triangles.push([a, b, c]);
  }
  return { points, triangles };
}

const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

export type MeshHealth = {
  triangles: number;
  /** Edges used by one triangle only: the rims of openings in the surface. */
  openEdges: number;
  /** Openings: closed loops of open edges. */
  openings: number;
  /** Edges shared by more than two triangles. */
  brokenEdges: number;
  /** Triangles dropped because they had no area. */
  degenerate: number;
  watertight: boolean;
};

export function meshHealth(positions: ArrayLike<number>): MeshHealth {
  const welded = weldTriangles(positions);
  const total = Math.floor(positions.length / 9);
  const uses = new Map<string, number>();
  for (const [a, b, c] of welded.triangles) {
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const key = edgeKey(p, q);
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  let openEdges = 0, brokenEdges = 0;
  for (const count of uses.values()) {
    if (count === 1) openEdges += 1;
    else if (count > 2) brokenEdges += 1;
  }
  const openings = openEdges ? boundaryLoops(welded).length : 0;
  return {
    triangles: total,
    openEdges,
    openings,
    brokenEdges,
    degenerate: total - welded.triangles.length,
    watertight: openEdges === 0 && brokenEdges === 0,
  };
}

/** The loops of open edges, each in the direction its triangle runs along it. */
function boundaryLoops({ triangles }: Welded): number[][] {
  const count = new Map<string, number>();
  for (const [a, b, c] of triangles) for (const [p, q] of [[a, b], [b, c], [c, a]]) count.set(edgeKey(p, q), (count.get(edgeKey(p, q)) ?? 0) + 1);
  const next = new Map<number, number[]>();
  for (const [a, b, c] of triangles) {
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      if (count.get(edgeKey(p, q)) !== 1) continue;
      const list = next.get(p) ?? [];
      list.push(q);
      next.set(p, list);
    }
  }
  const loops: number[][] = [];
  const used = new Set<string>();
  for (const [start, targets] of next) {
    for (const first of targets) {
      if (used.has(`${start}>${first}`)) continue;
      const loop = [start];
      let from = start, to = first;
      let guard = 0;
      while (guard++ < 1e6) {
        used.add(`${from}>${to}`);
        if (to === start) break;
        loop.push(to);
        const options = (next.get(to) ?? []).filter((candidate) => !used.has(`${to}>${candidate}`));
        if (!options.length) break;
        from = to;
        to = options[0];
      }
      if (loop.length >= 3 && to === start) loops.push(loop);
    }
  }
  return loops;
}

/** A flat cap for one opening: the loop laid into its best plane and cut into triangles, facing so it closes the surface. */
function capLoop(points: number[][], loop: number[]): number[][] {
  const v = loop.map((id) => new THREE.Vector3(...points[id]));
  const normal = new THREE.Vector3();
  for (let i = 0; i < v.length; i += 1) {
    const p = v[i], q = v[(i + 1) % v.length];
    normal.x += (p.y - q.y) * (p.z + q.z);
    normal.y += (p.z - q.z) * (p.x + q.x);
    normal.z += (p.x - q.x) * (p.y + q.y);
  }
  if (normal.lengthSq() < 1e-18) return [];
  normal.normalize();
  const xAxis = Math.abs(normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = xAxis.sub(normal.clone().multiplyScalar(xAxis.dot(normal))).normalize();
  const w = new THREE.Vector3().crossVectors(normal, u);
  const flat = v.map((point) => new THREE.Vector2(point.dot(u), point.dot(w)));
  const triangles = THREE.ShapeUtils.triangulateShape(flat, []);
  // The open edges run p -> q in their own triangle; the cap uses them q -> p, so it runs against the loop.
  return triangles.map(([i, j, k]) => {
    const tri = [loop[i], loop[j], loop[k]];
    const a = v[i], b = v[j], c = v[k];
    const facing = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).dot(normal);
    return facing > 0 ? [tri[0], tri[2], tri[1]] : tri;
  });
}

/**
 * Caps for all openings. Openings in one plane are taken together: one lying inside another is a
 * hole in that one's cap (the rim of a removed face with a hole in it), so the hole stays open.
 */
function capLoops(points: number[][], loops: number[][]): number[][] {
  type Flat = { loop: number[]; normal: THREE.Vector3; offset: number; area: number };
  const flats: Flat[] = loops.map((loop) => {
    const v = loop.map((id) => new THREE.Vector3(...points[id]));
    const normal = new THREE.Vector3();
    for (let i = 0; i < v.length; i += 1) {
      const p = v[i], q = v[(i + 1) % v.length];
      normal.x += (p.y - q.y) * (p.z + q.z);
      normal.y += (p.z - q.z) * (p.x + q.x);
      normal.z += (p.x - q.x) * (p.y + q.y);
    }
    const area = normal.length() / 2;
    if (area > 0) normal.normalize();
    const centre = v.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(v.length);
    // Flat only when every corner lies on the plane: only those can share a cap.
    const flat = area > 0 && v.every((point) => Math.abs(point.clone().sub(centre).dot(normal)) < 1e-3);
    return { loop, normal: flat ? normal : new THREE.Vector3(), offset: flat ? centre.dot(normal) : NaN, area };
  });
  const used = new Set<number>();
  const caps: number[][] = [];
  flats.forEach((flat, index) => {
    if (used.has(index)) return;
    if (!Number.isFinite(flat.offset)) {
      used.add(index);
      caps.push(...capLoop(points, flat.loop));
      return;
    }
    // Every flat opening in the same plane (either way round).
    const group = flats.map((other, at) => ({ other, at })).filter(({ other, at }) => !used.has(at) && Number.isFinite(other.offset)
      && Math.abs(Math.abs(other.normal.dot(flat.normal)) - 1) < 1e-4
      && Math.abs(other.offset * Math.sign(other.normal.dot(flat.normal)) - flat.offset) < 1e-3);
    group.forEach(({ at }) => used.add(at));
    const u = (Math.abs(flat.normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).sub(flat.normal.clone().multiplyScalar(Math.abs(flat.normal.x) < 0.9 ? flat.normal.x : flat.normal.y)).normalize();
    const w = new THREE.Vector3().crossVectors(flat.normal, u);
    const to2 = (id: number) => { const point = new THREE.Vector3(...points[id]); return new THREE.Vector2(point.dot(u), point.dot(w)); };
    const rings = group.map(({ other }) => ({ loop: other.loop, flat: other.loop.map(to2), area: other.area }));
    // Nesting depth: how many other rings each ring lies inside. Even = an outline, odd = a hole in the one around it.
    const inside = (point: THREE.Vector2, polygon: THREE.Vector2[]) => {
      let hit = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i], b = polygon[j];
        if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
      }
      return hit;
    };
    const depth = rings.map((ring, i) => rings.filter((other, j) => j !== i && other.area > ring.area && inside(ring.flat[0], other.flat)).length);
    rings.forEach((ring, i) => {
      if (depth[i] % 2 === 1) return;
      // The holes of this outline: rings one level deeper that lie inside it.
      const holes = rings.filter((other, j) => depth[j] === depth[i] + 1 && inside(other.flat[0], ring.flat));
      const all = [...ring.loop, ...holes.flatMap((hole) => hole.loop)];
      THREE.ShapeUtils.triangulateShape(ring.flat, holes.map((hole) => hole.flat)).forEach(([a, b, c]) => caps.push([all[a], all[b], all[c]]));
    });
  });
  return caps;
}

/** Every triangle turned the same way as its neighbours, then all of them outward (positive volume). */
function orient(points: number[][], triangles: number[][]): number[][] {
  const out = triangles.map((tri) => [...tri]);
  const byEdge = new Map<string, number[]>();
  out.forEach((tri, index) => {
    for (const [p, q] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
      const key = edgeKey(p, q);
      const list = byEdge.get(key) ?? [];
      list.push(index);
      byEdge.set(key, list);
    }
  });
  const runs = (tri: number[], p: number, q: number) => (tri[0] === p && tri[1] === q) || (tri[1] === p && tri[2] === q) || (tri[2] === p && tri[0] === q);
  const seen = new Uint8Array(out.length);
  for (let seed = 0; seed < out.length; seed += 1) {
    if (seen[seed]) continue;
    const component: number[] = [seed];
    seen[seed] = 1;
    for (let at = 0; at < component.length; at += 1) {
      const tri = out[component[at]];
      for (const [p, q] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
        const neighbours = byEdge.get(edgeKey(p, q)) ?? [];
        if (neighbours.length !== 2) continue;
        for (const other of neighbours) {
          if (seen[other]) continue;
          // A neighbour running the shared edge the same way faces the other way: turn it.
          if (runs(out[other], p, q)) out[other].reverse();
          seen[other] = 1;
          component.push(other);
        }
      }
    }
    let volume = 0;
    for (const index of component) {
      const [a, b, c] = out[index].map((id) => points[id]);
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    if (volume < 0) for (const index of component) out[index].reverse();
  }
  return out;
}

function flatten(points: number[][], triangles: number[][]): number[] {
  const positions: number[] = [];
  for (const tri of triangles) for (const id of tri) positions.push(points[id][0], points[id][1], points[id][2]);
  return positions;
}

/** The mesh made watertight as far as that can be done: corners joined, openings capped, faces outward. */
export function makeSolidPositions(positions: ArrayLike<number>): { positions: number[]; capped: number } {
  const welded = weldTriangles(positions);
  // Doubled triangles (the same three corners twice) go: they make edges used four times.
  const seen = new Set<string>();
  const triangles = welded.triangles.filter((tri) => {
    const key = [...tri].sort((a, b) => a - b).join("_");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const loops = boundaryLoops({ points: welded.points, triangles });
  const caps = capLoops(welded.points, loops);
  return { positions: flatten(welded.points, orient(welded.points, [...triangles, ...caps])), capped: loops.length };
}

/** Whether Manifold takes the triangles as a closed solid. */
export async function isManifoldSolid(positions: ArrayLike<number>): Promise<boolean> {
  const runtime = await getManifoldRuntime();
  const welded = weldTriangles(positions);
  const mesh = new runtime.Mesh({ numProp: 3, vertProperties: new Float32Array(welded.points.flat()), triVerts: new Uint32Array(welded.triangles.flat()) });
  let solid: InstanceType<typeof runtime.Manifold> | null = null;
  try {
    solid = new runtime.Manifold(mesh);
    return solid.status() === "NoError" && solid.volume() > 0;
  } catch {
    return false;
  } finally {
    solid?.delete();
  }
}

/** The part with new triangles (in the world), keeping its name, colour and settings; turned and mirrored into the mesh. */
export function shapeWithWorldPositions(shape: WorkplaneShape, positions: number[]): WorkplaneShape {
  const rebuilt = meshShapeFromPositions(shape.name, shape.color, positions);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
  }
  return {
    ...shape,
    kind: "mesh",
    importedMesh: rebuilt.importedMesh,
    width: rebuilt.width,
    depth: rebuilt.depth,
    height: rebuilt.height,
    size: rebuilt.size,
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
    elevation: minY,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    mirrorX: undefined,
    mirrorY: undefined,
    mirrorZ: undefined,
    cadBrep: undefined,
    cadBrepFrame: undefined,
    cadDisplayEdges: undefined,
    edgeTreatments: undefined,
    edgeTreatmentHistory: undefined,
  } as WorkplaneShape;
}

/** Sharper than this between two triangles is an edge the wall of a hole stops at. */
const WALL_CREASE = Math.cos(THREE.MathUtils.degToRad(40));

export type FillHoleResult =
  | { ok: true; positions: number[] }
  | { ok: false; reason: "missed" | "notHole" | "tooBig" | "failed" };

/**
 * Fills the hole whose wall was clicked: `point` and `normal` from the pick, `positions` the body's
 * triangles in the world. The plug is the convex hull of the smooth wall around the click; it fills a
 * round, square or hexagonal hole, a counterbore or countersink step, flush with the faces around it.
 */
export async function fillHoleAt(positions: ArrayLike<number>, point: { x: number; y: number; z: number }, normal: { x: number; y: number; z: number }): Promise<FillHoleResult> {
  const welded = weldTriangles(positions);
  const { points, triangles } = welded;
  const normals = triangles.map(([a, b, c]) => {
    const pa = new THREE.Vector3(...points[a]), pb = new THREE.Vector3(...points[b]), pc = new THREE.Vector3(...points[c]);
    return new THREE.Vector3().subVectors(pb, pa).cross(new THREE.Vector3().subVectors(pc, pa));
  });
  const areas = normals.map((n) => n.length() / 2);
  normals.forEach((n) => n.normalize());
  // The triangle clicked: the nearest one facing the way the pick did.
  const at = new THREE.Vector3(point.x, point.y, point.z);
  const facing = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
  const closest = new THREE.Vector3();
  const tri = new THREE.Triangle();
  let start = -1, best = Infinity;
  triangles.forEach(([a, b, c], index) => {
    if (normals[index].dot(facing) < 0.5) return;
    tri.set(new THREE.Vector3(...points[a]), new THREE.Vector3(...points[b]), new THREE.Vector3(...points[c]));
    tri.closestPointToPoint(at, closest);
    const distance = closest.distanceToSquared(at);
    if (distance < best) {
      best = distance;
      start = index;
    }
  });
  if (start < 0 || best > 0.25) return { ok: false, reason: "missed" };

  // The hole's surface around it: across smooth edges and inward corners; outward edges stop it.
  const byEdge = new Map<string, number[]>();
  triangles.forEach(([a, b, c], index) => {
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const key = edgeKey(p, q);
      const list = byEdge.get(key) ?? [];
      list.push(index);
      byEdge.set(key, list);
    }
  });
  const inWall = new Uint8Array(triangles.length);
  inWall[start] = 1;
  const queue = [start];
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    const [a, b, c] = triangles[current];
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      for (const other of byEdge.get(edgeKey(p, q)) ?? []) {
        if (inWall[other]) continue;
        if (normals[other].dot(normals[current]) < WALL_CREASE) {
          // Sharp: carry on only into an inward corner - the other triangle's far corner stands on the
          // outer side of this one's plane.
          const far = triangles[other].find((id) => id !== p && id !== q);
          if (far === undefined) continue;
          const offset = new THREE.Vector3(...points[far]).sub(new THREE.Vector3(...points[p]));
          if (offset.dot(normals[current]) <= 1e-6) continue;
        }
        inWall[other] = 1;
        queue.push(other);
      }
    }
  }
  const total = areas.reduce((sum, area) => sum + area, 0);
  const wallArea = queue.reduce((sum, index) => sum + areas[index], 0);
  // A flat face is no hole; a "wall" that is most of the part is its outside.
  if (queue.length < 4) return { ok: false, reason: "notHole" };
  if (wallArea > 0.4 * total) return { ok: false, reason: "tooBig" };
  // A hole's walls face each other round it: their directions largely cancel. Two faces of an inside
  // corner (an L bracket) do not - that is no hole to fill.
  const facingSum = new THREE.Vector3();
  for (const index of queue) facingSum.addScaledVector(normals[index], areas[index]);
  if (facingSum.length() > 0.6 * wallArea) return { ok: false, reason: "notHole" };
  const wallPoints = new Map<number, number[]>();
  for (const index of queue) for (const id of triangles[index]) wallPoints.set(id, points[id]);

  const runtime = await getManifoldRuntime();
  const body = new runtime.Manifold(new runtime.Mesh({ numProp: 3, vertProperties: new Float32Array(points.flat()), triVerts: new Uint32Array(triangles.flat()) }));
  let plug: InstanceType<typeof runtime.Manifold> | null = null;
  let united: InstanceType<typeof runtime.Manifold> | null = null;
  try {
    if (body.status() !== "NoError") return { ok: false, reason: "failed" };
    plug = runtime.Manifold.hull([...wallPoints.values()].map(([x, y, z]) => [x, y, z] as [number, number, number]));
    united = body.add(plug);
    if (united.status() !== "NoError") return { ok: false, reason: "failed" };
    // The plug must stay inside the part's own box: a hole is filled, nothing is added outside it.
    const before = body.boundingBox(), after = united.boundingBox();
    const grew = [0, 1, 2].some((axis) => after.min[axis] < before.min[axis] - 0.01 || after.max[axis] > before.max[axis] + 0.01);
    if (grew || !(united.volume() > body.volume() + 1e-6)) return { ok: false, reason: grew ? "tooBig" : "notHole" };
    const mesh = united.getMesh();
    const out: number[] = [];
    for (let i = 0; i < mesh.triVerts.length; i += 1) {
      const v = mesh.triVerts[i] * mesh.numProp;
      out.push(mesh.vertProperties[v], mesh.vertProperties[v + 1], mesh.vertProperties[v + 2]);
    }
    return { ok: true, positions: out };
  } catch {
    return { ok: false, reason: "failed" };
  } finally {
    body.delete();
    plug?.delete();
    united?.delete();
  }
}
