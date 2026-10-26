import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { getManifoldRuntime } from "@/lib/editorMeshCore";
import { applyBrush, applyToSelection, brushChoice, cornerNormals, growChoice, invertChoice, millimetresPerPixel, sculptMeshOf, soupOf, strokeWeights, withoutTriangles } from "@/lib/meshSculpt";
import { defaultRemeshDetail, pointTriangleDistance2, remeshPositions } from "@/lib/meshRemesh";
import { meshHealth } from "@/lib/meshRepair";

const volume = (p: ArrayLike<number>) => {
  let v = 0;
  for (let i = 0; i < p.length; i += 9) v += (p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6])) / 6;
  return v;
};
const soup = (m: { getMesh(): { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array } }) => {
  const mesh = m.getMesh();
  return [...mesh.triVerts].flatMap((i) => [mesh.vertProperties[i * mesh.numProp], mesh.vertProperties[i * mesh.numProp + 1], mesh.vertProperties[i * mesh.numProp + 2]]);
};
/** Seen from straight above (y up): 10 px a millimetre, x to the right, z down the screen. */
const fromAbove = (points: Float64Array) => {
  const out = new Float32Array((points.length / 3) * 2);
  for (let i = 0; i * 3 < points.length; i += 1) { out[i * 2] = 500 + points[i * 3] * 10; out[i * 2 + 1] = 500 + points[i * 3 + 2] * 10; }
  return out;
};
const eye: [number, number, number] = [0, 1000, 0];
const top = (points: Float64Array) => { let y = -Infinity; for (let i = 1; i < points.length; i += 3) y = Math.max(y, points[i]); return y; };

describe("sculpt brushes and selection (build 69)", () => {
  it("inflates and deflates only the top of a sphere, under the brush, without tearing it", async () => {
    const m = await getManifoldRuntime();
    const sphere = soup(m.Manifold.sphere(10, 64));
    const mesh = sculptMeshOf(sphere);
    const before = top(mesh.points);
    const projected = fromAbove(mesh.points);
    const weights = strokeWeights(mesh, projected, eye, [[500, 500]], 30, 1);
    // Only corners on the top, within the 3 mm brush and the two rings it fades out over.
    for (let i = 0; i < weights.length; i += 1) if (weights[i]) {
      expect(mesh.points[i * 3 + 1]).toBeGreaterThan(0);
      expect(Math.hypot(mesh.points[i * 3], mesh.points[i * 3 + 2])).toBeLessThan(5.5);
      if (Math.hypot(mesh.points[i * 3], mesh.points[i * 3 + 2]) > 3.01) expect(weights[i]).toBeLessThan(0.5);
    }
    expect(millimetresPerPixel(mesh, projected, weights)).toBeCloseTo(0.1, 1);
    applyBrush(mesh, "inflate", weights, 1);
    expect(top(mesh.points)).toBeGreaterThan(before + 0.5);
    expect(meshHealth(soupOf(mesh)).openEdges).toBe(0);
    const bumped = top(mesh.points);
    applyBrush(mesh, "deflate", strokeWeights(mesh, fromAbove(mesh.points), eye, [[500, 500]], 30, 1), 2);
    expect(top(mesh.points)).toBeLessThan(bumped - 1);
    expect(Math.abs(volume(soupOf(mesh)))).toBeGreaterThan(3500);
  });

  it("brushes the surface in sight - also the back of an open sheet - and not what is hidden behind it", async () => {
    const m = await getManifoldRuntime();
    // Two flat sheets, 5 mm apart, both facing down (away from the camera above), like the inside of a scan.
    const plate = soup(m.Manifold.cube([20, 1, 20], true).refine(6));
    const bottom: number[] = [];
    for (let t = 0; t < plate.length; t += 9) if (plate[t + 1] < -0.49 && plate[t + 4] < -0.49 && plate[t + 7] < -0.49) bottom.push(...plate.slice(t, t + 9));
    const upper = bottom.map((v, i) => (i % 3 === 1 ? v + 5.5 : v));
    const mesh = sculptMeshOf([...bottom, ...upper]);
    const weights = strokeWeights(mesh, fromAbove(mesh.points), eye, [[500, 500]], 80, 1);
    let near = 0, far = 0;
    for (let i = 0; i < weights.length; i += 1) if (weights[i]) { if (mesh.points[i * 3 + 1] > 2) near += 1; else far += 1; }
    expect(near).toBeGreaterThan(5);
    expect(far).toBe(0);
  });

  it("selects the surface in sight, the back side, or every layer through (build 71)", async () => {
    const m = await getManifoldRuntime();
    const mesh = sculptMeshOf(soup(m.Manifold.cube([20, 20, 20], true).refine(4)));
    const projected = fromAbove(mesh.points);
    const pick = (reach: "front" | "back" | "through") => {
      const chosen = new Uint8Array(mesh.triangles.length / 3);
      brushChoice(mesh, projected, eye, [[480, 480], [520, 520]], 60, chosen, true, reach);
      let top = 0, bottom = 0;
      for (let t = 0; t < chosen.length; t += 1) {
        if (!chosen[t]) continue;
        const y = (mesh.points[mesh.triangles[t * 3] * 3 + 1] + mesh.points[mesh.triangles[t * 3 + 1] * 3 + 1] + mesh.points[mesh.triangles[t * 3 + 2] * 3 + 1]) / 3;
        if (y > 9.9) top += 1; else if (y < -9.9) bottom += 1;
      }
      return { top, bottom };
    };
    const front = pick("front"), back = pick("back"), through = pick("through");
    expect(front.top).toBeGreaterThan(0);
    expect(front.bottom).toBe(0);
    expect(back.top).toBe(0);
    expect(back.bottom).toBeGreaterThan(0);
    expect(through.top).toBe(front.top);
    expect(through.bottom).toBe(back.bottom);
  });

  it("smooths a spike away and flattens a dome", async () => {
    const m = await getManifoldRuntime();
    const mesh = sculptMeshOf(soup(m.Manifold.sphere(10, 48)));
    // A spike: the topmost corner pulled 5 mm up.
    let peak = 0;
    for (let i = 0; i * 3 < mesh.points.length; i += 1) if (mesh.points[i * 3 + 1] > mesh.points[peak * 3 + 1]) peak = i;
    mesh.points[peak * 3 + 1] += 5;
    applyBrush(mesh, "smooth", strokeWeights(mesh, fromAbove(mesh.points), eye, [[500, 500]], 25, 1), 0);
    expect(top(mesh.points)).toBeLessThan(12);
    const before = top(mesh.points);
    applyBrush(mesh, "flatten", strokeWeights(mesh, fromAbove(mesh.points), eye, [[460, 500], [540, 500]], 40, 1), 0);
    expect(top(mesh.points)).toBeLessThan(before - 0.2);
  });

  it("deletes, grows, inverts and smooths a chosen patch", async () => {
    const m = await getManifoldRuntime();
    const mesh = sculptMeshOf(soup(m.Manifold.cube([20, 20, 20], true).refine(4)));
    const triangles = mesh.triangles.length / 3;
    const world = soupOf(mesh);
    const chosen = new Uint8Array(triangles);
    for (let t = 0; t < triangles; t += 1) if (world[t * 9 + 1] > 9.99 && world[t * 9 + 4] > 9.99 && world[t * 9 + 7] > 9.99) chosen[t] = 1;
    const top = chosen.reduce((a, b) => a + b, 0);
    expect(top).toBe(triangles / 6);
    expect(growChoice(mesh, chosen).reduce((a, b) => a + b, 0)).toBeGreaterThan(top);
    expect(invertChoice(chosen).reduce((a, b) => a + b, 0)).toBe(triangles - top);
    const opened = withoutTriangles(world, chosen);
    expect(opened.length / 9).toBe(triangles - top);
    expect(meshHealth(opened).openEdges).toBeGreaterThan(0);
    // Smoothing the top face of a cube rounds it into the sides; the rest stays put.
    applyToSelection(mesh, chosen, "smooth");
    const normals = cornerNormals(mesh);
    expect(normals.length).toBe(mesh.points.length);
    let below = 0;
    for (let i = 1; i < mesh.points.length; i += 3) if (mesh.points[i] < -9.99) below += 1;
    expect(below).toBeGreaterThan(0);
    expect(top).toBeGreaterThan(0);
  });
});

describe("remesh, offset and thicken (build 69)", () => {
  it("measures the distance to a triangle exactly", () => {
    const t = [0, 0, 0, 10, 0, 0, 0, 10, 0];
    expect(pointTriangleDistance2(2, 2, 3, t, 0)).toBeCloseTo(9);
    expect(pointTriangleDistance2(-3, -4, 0, t, 0)).toBeCloseTo(25);
    expect(pointTriangleDistance2(10, 10, 0, t, 0)).toBeCloseTo(50);
  });

  it("remeshes a cube into a closed solid of about the same size", async () => {
    const m = await getManifoldRuntime();
    const cube = soup(m.Manifold.cube([20, 20, 20], true));
    const result = await remeshPositions(cube, { mode: "remesh", detail: 0.5, amount: 0 });
    expect(meshHealth(result.positions).openEdges).toBe(0);
    expect(volume(result.positions)).toBeGreaterThan(7700);
    expect(volume(result.positions)).toBeLessThan(8100);
    expect(result.triangles).toBeGreaterThan(1000);
    expect(defaultRemeshDetail(cube)).toBeCloseTo(0.13, 2);
  });

  it("grows and shrinks a sphere by the distance asked for", async () => {
    const m = await getManifoldRuntime();
    const sphere = soup(m.Manifold.sphere(10, 96));
    const grown = await remeshPositions(sphere, { mode: "offset", detail: 0.4, amount: 2 });
    const r = (p: number[]) => Math.cbrt((3 * volume(p)) / (4 * Math.PI));
    expect(r(grown.positions)).toBeCloseTo(12, 0);
    const shrunk = await remeshPositions(sphere, { mode: "offset", detail: 0.4, amount: -3 });
    expect(r(shrunk.positions)).toBeCloseTo(7, 0);
    await expect(remeshPositions(sphere, { mode: "offset", detail: 0.4, amount: -20 })).rejects.toThrow(/Nothing is left/);
  });

  it("thickens an open surface into a closed shell", async () => {
    const m = await getManifoldRuntime();
    // A square plate's top face only: an open surface, like a scan.
    const plate = soup(m.Manifold.cube([30, 1, 30], true).refine(3)).filter(() => true);
    const top: number[] = [];
    for (let t = 0; t < plate.length; t += 9) if (plate[t + 1] > 0.49 && plate[t + 4] > 0.49 && plate[t + 7] > 0.49) top.push(...plate.slice(t, t + 9));
    expect(meshHealth(top).openEdges).toBeGreaterThan(0);
    await expect(remeshPositions(top, { mode: "remesh", detail: 0.5, amount: 0 })).rejects.toThrow(/closed solid/);
    const shell = await remeshPositions(top, { mode: "thicken", detail: 0.5, amount: 2 });
    expect(meshHealth(shell.positions).openEdges).toBe(0);
    // 30 x 30 x 2, with rounded rims.
    expect(volume(shell.positions)).toBeGreaterThan(1750);
    expect(volume(shell.positions)).toBeLessThan(2000);
  });
});
