import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { looksLikeDentalScan, makeDentalModel, pinchedEdges, prepareDentalScan } from "@/lib/dentalModel";
import { plyToStlBytes } from "@/lib/plyImport";
import { dentalPreset } from "@/components/workplane/DentalModelPanel";

/**
 * A made-up scan, no patient's: a U-shaped sheet of "teeth" that falls away to a ragged edge, as an
 * intraoral scan does, turned teeth down like an upper arch, with one small hole in it and one loose
 * fragment beside it.
 */
function syntheticScan() {
  const nx = 120, ny = 60, sx = 60, sy = 30;
  // The notch between the two sides of the U, in the sheet's 0..1 coordinates.
  const notch = (u: number, v: number) => Math.max(0.32 - u, u - 0.68, 0.45 - v);
  const inU = (i: number, j: number) => notch(i / nx, j / ny) >= 0;
  const z = (i: number, j: number) => {
    const u = i / nx, v = j / ny;
    const edge = Math.min(u, 1 - u, v, 1 - v, Math.max(0, notch(u, v)));
    const plateau = Math.min(1, edge * 8);
    const teeth = 1.5 * Math.max(0, Math.sin(u * Math.PI * 14)) * Math.max(0, Math.sin(v * Math.PI * 2));
    // The edge where the scan stops is ragged: 2-5 mm lower here and there.
    const ragged = 3 + 2 * Math.sin(i * 0.7) * Math.cos(j * 0.9);
    return plateau * (12 + teeth) - (1 - plateau) * ragged;
  };
  const p = (i: number, j: number) => [(i / nx - 0.5) * sx, (j / ny - 0.5) * sy, z(i, j)];
  const out: number[] = [];
  const hole = (i: number, j: number) => i >= 20 && i < 22 && j >= 20 && j < 22;
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    if (notch((i + 0.5) / nx, (j + 0.5) / ny) < 0) continue;
    if (hole(i, j)) continue;
    const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
    out.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  // Teeth down, as an upper scan comes out of the scanner: mirror z and keep the faces outward.
  for (let t = 0; t < out.length; t += 9) {
    for (let k = 2; k < 9; k += 3) out[t + k] = -out[t + k];
    for (let k = 0; k < 3; k += 1) {
      const swap = out[t + 3 + k];
      out[t + 3 + k] = out[t + 6 + k];
      out[t + 6 + k] = swap;
    }
  }
  // A loose fragment, well away from the arch.
  out.push(80, 0, 0, 81, 0, 0, 80, 1, 0);
  return Float32Array.from(out);
}

describe("Dental model (build 46)", () => {
  let runtime: ManifoldToplevel;
  beforeAll(async () => {
    runtime = await manifoldModule();
    runtime.setup();
  });

  it("recognises a raw scan and not a closed part", () => {
    expect(looksLikeDentalScan(syntheticScan())).toBe(true);
    // A few triangles are not a scan.
    expect(looksLikeDentalScan(syntheticScan().slice(0, 900))).toBe(false);
  });

  it("cleans the scan, fills the hole, drops the fragment and turns it teeth up", () => {
    const prepared = prepareDentalScan(syntheticScan());
    expect(prepared.report.holesFilled).toBe(1);
    expect(prepared.report.fragmentsRemoved).toBe(1);
    expect(prepared.report.top).toBeGreaterThan(15);
    expect(prepared.report.maxKeep).toBeGreaterThan(10);
    // Teeth up: most of the surface lies in the top part of the height.
    const zs: number[] = [];
    for (let i = 2; i < prepared.positions.length; i += 3) zs.push(prepared.positions[i]);
    const median = zs.sort((a, b) => a - b)[Math.floor(zs.length / 2)];
    expect(median).toBeGreaterThan(prepared.report.top * 0.6);
    expect(Math.min(...zs)).toBeCloseTo(0, 5);
  });

  it("makes a closed solid model that keeps the scan above the cut exactly", async () => {
    const prepared = prepareDentalScan(syntheticScan());
    const options = { keep: 99, base: 5, plate: false, hollow: false, wall: 2 };
    const model = await makeDentalModel(prepared.positions, options, runtime as never);
    expect(model.keep).toBeCloseTo(prepared.report.maxKeep, 1);
    expect(model.height).toBeCloseTo(model.keep + 5, 3);
    expect(model.volume).toBeGreaterThan(1000);
    expect(pinchedEdges(model.positions)).toBe(0);
    const mesh = new runtime.Mesh({ numProp: 3, vertProperties: model.positions, triVerts: Uint32Array.from({ length: model.positions.length / 3 }, (_, k) => k) });
    mesh.merge();
    const closed = new runtime.Manifold(mesh);
    expect(closed.status()).toBe("NoError");
    expect(closed.volume()).toBeCloseTo(model.volume, 0);
    closed.delete();
    // Every scan point above the cut is a corner of the model, shifted by the same height.
    const shift = prepared.report.top - model.height;
    const corners = new Set<string>();
    for (let i = 0; i < model.positions.length; i += 3) corners.add(`${model.positions[i].toFixed(3)},${model.positions[i + 1].toFixed(3)},${(model.positions[i + 2] + shift).toFixed(3)}`);
    let checked = 0, found = 0;
    for (let i = 0; i < prepared.positions.length; i += 27) {
      if (prepared.positions[i + 2] <= prepared.report.top - model.keep + 0.01) continue;
      checked += 1;
      if (corners.has(`${prepared.positions[i].toFixed(3)},${prepared.positions[i + 1].toFixed(3)},${prepared.positions[i + 2].toFixed(3)}`)) found += 1;
    }
    expect(checked).toBeGreaterThan(100);
    expect(found / checked).toBeGreaterThan(0.99);
  });

  it("hollows the model, open underneath, and the plate adds a bridge across the arch", async () => {
    const prepared = prepareDentalScan(syntheticScan());
    const base = { keep: 99, base: 5, plate: false, hollow: false, wall: 2 };
    const solid = await makeDentalModel(prepared.positions, base, runtime as never);
    const hollow = await makeDentalModel(prepared.positions, { ...base, hollow: true }, runtime as never);
    expect(hollow.voxel).toBeCloseTo(0.4, 5);
    expect(hollow.volume).toBeLessThan(solid.volume * 0.8);
    expect(pinchedEdges(hollow.positions)).toBe(0);
    // Open underneath: less floor faces down at z = 0 than on the solid model.
    const floorArea = (positions: Float32Array) => {
      let area = 0;
      for (let t = 0; t < positions.length; t += 9) {
        if (Math.max(positions[t + 2], positions[t + 5], positions[t + 8]) > 1e-4) continue;
        const ux = positions[t + 3] - positions[t], uy = positions[t + 4] - positions[t + 1];
        const vx = positions[t + 6] - positions[t], vy = positions[t + 7] - positions[t + 1];
        area += Math.abs(ux * vy - uy * vx) / 2;
      }
      return area;
    };
    expect(floorArea(hollow.positions)).toBeLessThan(floorArea(solid.positions) * 0.7);
    const plated = await makeDentalModel(prepared.positions, { ...base, plate: true }, runtime as never);
    expect(plated.volume).toBeGreaterThan(solid.volume + 50);
    expect(pinchedEdges(plated.positions)).toBe(0);
  });

  it("starts each purpose from the settings the evidence points to", () => {
    expect(dentalPreset("study", 13)).toMatchObject({ hollow: true, wall: 2, plate: false });
    const aligner = dentalPreset("aligner", 13);
    expect(aligner.hollow).toBe(false);
    expect(aligner.keep + aligner.base).toBeGreaterThanOrEqual(15);
    expect(aligner.keep + aligner.base).toBeLessThanOrEqual(20);
    expect(dentalPreset("crown", 13)).toMatchObject({ hollow: false, plate: true, keep: 13 });
  });

  it("reads a PLY file's triangles as an STL", () => {
    const ply = "ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nelement face 2\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n1 1 0\n0 1 0\n3 0 1 2\n3 0 2 3\n";
    const stl = plyToStlBytes(new TextEncoder().encode(ply).buffer as ArrayBuffer);
    const view = new DataView(stl.buffer);
    expect(view.getUint32(80, true)).toBe(2);
    expect(stl.byteLength).toBe(84 + 2 * 50);
    expect(view.getFloat32(84 + 12 + 12, true)).toBe(1);
  });
});
