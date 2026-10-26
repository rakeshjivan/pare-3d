import manifoldModule, { type Manifold, type ManifoldToplevel } from "manifold-3d";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { islands, overhangMap, runMeshAnalysis, thicknessMap, thinAreas, weakSpots } from "@/lib/meshAnalysis";

let runtime: ManifoldToplevel;

beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
});

function manifoldSoup(solid: Manifold): Float32Array {
  const mesh = solid.getMesh();
  const stride = mesh.numProp;
  const out = new Float32Array(mesh.triVerts.length * 3);
  for (let i = 0; i < mesh.triVerts.length; i += 1) {
    const v = mesh.triVerts[i];
    out[i * 3] = mesh.vertProperties[v * stride];
    out[i * 3 + 1] = mesh.vertProperties[v * stride + 1];
    out[i * 3 + 2] = mesh.vertProperties[v * stride + 2];
  }
  return out;
}

function threeSoup(geometry: THREE.BufferGeometry): Float32Array {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  return Float32Array.from(flat.getAttribute("position").array as ArrayLike<number>);
}

/** Box [x0,x1]×[y0,y1]×[z0,z1]. */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  return runtime.Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
}

function weightedMedian(values: Float32Array, weights: Float32Array, pick: (t: number) => boolean) {
  const list: number[] = [];
  for (let t = 0; t < values.length; t += 1) if (pick(t)) list.push(t);
  list.sort((a, b) => values[a] - values[b]);
  const total = list.reduce((sum, t) => sum + weights[t], 0);
  let running = 0;
  for (const t of list) {
    running += weights[t];
    if (running >= total / 2) return values[t];
  }
  return NaN;
}

describe("thicknessMap", () => {
  it("reads a 1 mm hollow-box wall as ~1 mm", () => {
    const soup = manifoldSoup(box(-10, 0, -10, 10, 20, 10).subtract(box(-9, 1, -9, 9, 19, 9)));
    const map = thicknessMap(soup, { maxThickness: 5 });
    const median = weightedMedian(map.thickness, map.areas, () => true);
    expect(median).toBeGreaterThan(0.9);
    expect(median).toBeLessThan(1.1);
    const thin = thinAreas(map, 1.5);
    expect(thin.areaBelow / thin.totalArea).toBeGreaterThan(0.9);
    expect(thin.p5).toBeGreaterThan(0.85);
    expect(thin.minThickness).toBeLessThan(1.1);
    expect(map.cornerNormalized.length).toBe(soup.length / 3);
    for (const value of map.normalized) expect(value).toBeGreaterThanOrEqual(0);
  });

  it("reads a 10 mm solid cube as ~10 mm in its middle faces", () => {
    const soup = threeSoup(new THREE.BoxGeometry(10, 10, 10, 5, 5, 5));
    const map = thicknessMap(soup, { maxThickness: 20 });
    let checked = 0;
    for (let t = 0; t < map.triangleCount; t += 1) {
      const c = [map.centroids[t * 3], map.centroids[t * 3 + 1], map.centroids[t * 3 + 2]];
      const n = [map.normals[t * 3], map.normals[t * 3 + 1], map.normals[t * 3 + 2]];
      // Middle of each face: both in-plane coordinates within 2 mm of the face centre.
      const inPlane = c.filter((_, i) => Math.abs(n[i]) < 0.5);
      if (inPlane.every((value) => Math.abs(value) < 2)) {
        expect(map.thickness[t]).toBeGreaterThan(9);
        expect(map.thickness[t]).toBeLessThan(11);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(6);
    // Beyond maxThickness everything saturates.
    const capped = thicknessMap(soup, { maxThickness: 5 });
    expect(capped.thickness.every((value) => value === Infinity)).toBe(true);
    expect(capped.normalized.every((value) => value === 1)).toBe(true);
  });

  it("reads a sphere's thickness as its diameter", () => {
    const soup = threeSoup(new THREE.SphereGeometry(10, 48, 32));
    const map = thicknessMap(soup, { maxThickness: 30 });
    const median = weightedMedian(map.thickness, map.areas, () => true);
    expect(median).toBeGreaterThan(18);
    expect(median).toBeLessThan(22);
  });

  it("times a ~200k-triangle mesh", () => {
    const soup = threeSoup(new THREE.SphereGeometry(10, 320, 320));
    const triangles = soup.length / 9;
    expect(triangles).toBeGreaterThan(190_000);
    const start = performance.now();
    const map = thicknessMap(soup, { maxThickness: 30, samples: 3 });
    const thickness = performance.now() - start;
    const overStart = performance.now();
    overhangMap(soup);
    islands(soup);
    const overhangs = performance.now() - overStart;
    console.info(`[meshAnalysis] ${triangles} triangles: thickness (3 rays) ${thickness.toFixed(0)} ms, ${map.rayCount} rays; overhangs+islands ${overhangs.toFixed(0)} ms`);
    expect(weightedMedian(map.thickness, map.areas, () => true)).toBeGreaterThan(18);
  }, 60_000);
});

describe("overhangMap / islands", () => {
  // Stem 4×10×4 on the plate, bar 20×4×4 on top: a T.
  const tShape = () => manifoldSoup(box(-2, 0, -2, 2, 10, 2).add(box(-10, 10, -2, 10, 14, 2)));

  it("flags the underside of a T's bar and not the walls or the foot", () => {
    const soup = tShape();
    const result = overhangMap(soup, { angle: 45 });
    expect(result.plateY).toBeCloseTo(0, 6);
    for (let t = 0; t < result.triangleCount; t += 1) {
      const o = t * 9;
      const ys = [soup[o + 1], soup[o + 4], soup[o + 7]];
      const underside = ys.every((y) => Math.abs(y - 10) < 1e-4) && result.overhangAngle[t] > 89;
      expect(result.flagged[t]).toBe(underside ? 1 : 0);
      if (underside) expect(result.severity[t]).toBeCloseTo(1, 4);
    }
    expect(result.area).toBeCloseTo(20 * 4 - 4 * 4, 3);
    expect(result.projectedArea).toBeCloseTo(64, 3);
    // A steeper critical angle than 90° flags nothing; the foot is never flagged.
    expect(overhangMap(soup, { angle: 89.9 }).flaggedCount).toBeGreaterThan(0);
    expect(islands(soup).islands).toHaveLength(0);
  });

  it("grades a 30° chamfer underside against the angle", () => {
    // Wedge whose underside slopes 60° from vertical (30° from the plate) — an overhang at 45°, fine at 70°.
    const shape = new THREE.Shape([new THREE.Vector2(0, 5), new THREE.Vector2(10, 5 + 10 * Math.tan(Math.PI / 6)), new THREE.Vector2(10, 15), new THREE.Vector2(0, 15)]);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false });
    const soup = threeSoup(geometry);
    const at45 = overhangMap(soup, { angle: 45 });
    const at70 = overhangMap(soup, { angle: 70 });
    expect(at45.flaggedCount).toBeGreaterThan(0);
    expect(at70.flaggedCount).toBe(0);
    let maxAngle = 0;
    for (let t = 0; t < at45.triangleCount; t += 1) if (at45.flagged[t]) maxAngle = Math.max(maxAngle, at45.overhangAngle[t]);
    expect(maxAngle).toBeCloseTo(60, 3);
  });

  it("finds a floating part as an island, and ignores a cavity floor", () => {
    const base = box(-5, 0, -5, 5, 2, 5);
    const floating = box(10, 5, -2, 14, 9, 2);
    const result = islands(manifoldSoup(base.add(floating)));
    expect(result.islands).toHaveLength(1);
    const [island] = result.islands;
    expect(island.y).toBeCloseTo(5, 4);
    expect(island.height).toBeCloseTo(5, 4);
    expect(island.point[0]).toBeGreaterThan(9.9);
    expect(island.point[0]).toBeLessThan(14.1);
    expect(island.area).toBeCloseTo(16, 3);
    expect(result.flagged.some((value) => value === 1)).toBe(true);

    const hollow = manifoldSoup(box(-10, 0, -10, 10, 20, 10).subtract(box(-9, 1, -9, 9, 19, 9)));
    expect(islands(hollow).islands).toHaveLength(0);
    // Downward-pointing cone tip in mid-air is an island too.
    const cone = threeSoup(new THREE.ConeGeometry(3, 6, 24).rotateX(Math.PI).translate(20, 8, 0));
    const withCone = new Float32Array([...manifoldSoup(base), ...cone]);
    const coneIslands = islands(withCone).islands;
    expect(coneIslands).toHaveLength(1);
    expect(coneIslands[0].y).toBeCloseTo(5, 4);
    expect(coneIslands[0].area).toBe(0);
  });
});

describe("weakSpots", () => {
  it("flags a thin neck between two blocks but not a broad thin plate", () => {
    const left = box(-13, 0, -5, -3, 10, 5);
    const right = box(3, 0, -5, 13, 10, 5);
    const neck = runtime.Manifold.cylinder(6.2, 0.5, 0.5, 32).rotate([0, 90, 0]).translate([-3.1, 5, 0]);
    const plate = box(-15, 20, -10, 15, 21, 10); // 1 mm thick, 30 × 20 — thin but broad
    const soup = manifoldSoup(left.add(right).add(neck).add(plate));
    const result = weakSpots(soup, { minThickness: 2 });
    const weak = result.regions.filter((region) => region.weak);
    expect(weak).toHaveLength(1);
    const [spot] = weak;
    expect(spot.kind).toBe("rod");
    expect(Math.abs(spot.axis[0])).toBeGreaterThan(0.95);
    expect(spot.centroid[0]).toBeGreaterThan(-3.2);
    expect(spot.centroid[0]).toBeLessThan(3.2);
    expect(spot.centroid[1]).toBeCloseTo(5, 0);
    expect(spot.minThickness).toBeLessThan(1.1);
    expect(spot.crossSection).toBeGreaterThan(0.7);
    expect(spot.crossSection).toBeLessThan(0.8); // π·0.5² ≈ 0.785 (32-gon 0.78)
    expect(spot.area).toBeGreaterThan(15);

    const plateRegion = result.regions.find((region) => !region.weak);
    expect(plateRegion).toBeDefined();
    expect(plateRegion!.kind).toBe("sheet");
    expect(plateRegion!.crossSection).toBeGreaterThan(19);
    expect(plateRegion!.crossSection).toBeLessThan(21);
    expect(result.flagged.reduce((sum, value) => sum + value, 0)).toBe(spot.triangles.length);
    for (const t of spot.triangles) expect(result.severity[t]).toBeGreaterThan(0);
  });

  it("dispatches through the worker entry", () => {
    const soup = threeSoup(new THREE.BoxGeometry(10, 10, 10));
    const response = runMeshAnalysis({ kind: "thickness", soup, options: { maxThickness: 20 }, minimum: 2 });
    expect(response.kind).toBe("thickness");
    if (response.kind === "thickness") expect(response.thin?.flaggedCount).toBe(0);
  });
});
