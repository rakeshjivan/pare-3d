/**
 * The speed check (build 81): the engine's heavy steps timed on a made-up scan the size of a
 * full-arch intraoral scan (about 300,000 triangles), so builds can be compared on one machine.
 *
 *   npm run perf -- tests/perf/speed-check.perf.ts
 *
 * Writes the medians as JSON to SPEED_CHECK_OUT when set (scripts/speed-check/compare.mjs compares two).
 * No patient data: the surface is generated here.
 */
import { writeFileSync } from "node:fs";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Row = { step: string; ms: number; runs: number };

/** A bumpy open surface, 70 x 55 mm, cusps like a dental arch's, `n` x `n` squares. */
function scanSoup(n: number): Float32Array {
  const out = new Float32Array(n * n * 18);
  const w = 70, d = 55;
  const height = (x: number, z: number) => {
    const arch = Math.exp(-(((Math.hypot(x, z + 20) - 28) / 6) ** 2));
    const cusps = 0.5 + 0.5 * Math.cos(x * 1.1) * Math.cos(z * 1.3);
    return 4 * arch + 2.5 * arch * cusps + 0.15 * Math.sin(x * 7.3 + z * 5.1);
  };
  const at = (i: number, j: number) => {
    const x = -w / 2 + (w * i) / n, z = -d / 2 + (d * j) / n;
    return [x, height(x, z), z];
  };
  let k = 0;
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), e = at(i, j + 1);
    for (const p of [a, e, c, a, c, b]) { out[k++] = p[0]; out[k++] = p[1]; out[k++] = p[2]; }
  }
  return out;
}

function binaryStl(soup: Float32Array): ArrayBuffer {
  const count = soup.length / 9;
  const buffer = new ArrayBuffer(84 + count * 50);
  const view = new DataView(buffer);
  view.setUint32(80, count, true);
  let o = 84;
  for (let t = 0; t < count; t += 1) {
    o += 12;
    for (let k = 0; k < 9; k += 1) { view.setFloat32(o, soup[t * 9 + k], true); o += 4; }
    o += 2;
  }
  return buffer;
}

async function time(rows: Row[], step: string, runs: number, fn: () => unknown | Promise<unknown>) {
  const times: number[] = [];
  let value: unknown;
  process.stderr.write(`speed-check: ${step} ...\n`);
  for (let r = 0; r < runs; r += 1) {
    const start = performance.now();
    value = await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  rows.push({ step, ms: Math.round(times[Math.floor(times.length / 2)]), runs });
  process.stderr.write(`speed-check: ${step} ${Math.round(times[Math.floor(times.length / 2)])} ms\n`);
  return value;
}

describe("speed check", () => {
  it("times the heavy steps on a full-arch-sized scan", async () => {
    const { setManifoldAssetBase } = await import("@/lib/editorMeshCore");
    setManifoldAssetBase(pathToFileURL(resolve("apps/web/public") + "/").href);
    const { importedShapeFromStl } = await import("@/lib/stlImport");
    const { weldTriangles, makeSolidPositions } = await import("@/lib/meshRepair");
    const { sculptMeshOf, growChoice } = await import("@/lib/meshSculpt");
    const { LiveMesh, remeshLive } = await import("@/lib/liveSculpt");
    const { remeshPositions, solidPositions } = await import("@/lib/meshRemesh");
    const { extrudeChoice } = await import("@/lib/meshEditTools");

    const rows: Row[] = [];
    const soup = scanSoup(388);
    const triangles = soup.length / 9;
    expect(triangles).toBeGreaterThan(290000);
    const stl = binaryStl(soup);

    const shape = await time(rows, "Import a 300k-triangle STL", 3, () => importedShapeFromStl("scan.stl", stl.slice(0)));
    await time(rows, "Save the design (JSON)", 3, () => JSON.stringify(shape));
    await time(rows, "Weld the triangles", 3, () => weldTriangles(soup));
    const live = (await time(rows, "Open Sculpt (live copy)", 3, () => LiveMesh.fromSoup(soup))) as InstanceType<typeof LiveMesh>;
    // A stroke: 60 dabs of a 3 mm brush across the arch, as the pointer moves.
    await time(rows, "Sculpt stroke (60 dabs)", 3, () => {
      for (let k = 0; k < 60; k += 1) {
        const x = -20 + k * 0.6;
        const hit = live.pick([x, 40, -8], [0, -1, 0]);
        if (!hit) continue;
        live.dab("smooth", hit.point, [0, 1, 0], 3, live.region(hit.point, 3, hit.triangle), 0.5, 0.05);
      }
    });
    await time(rows, "Pick the surface (1,000 rays)", 3, () => { for (let k = 0; k < 1000; k += 1) live.pick([-30 + (k % 50) * 1.2, 40, -20 + Math.floor(k / 50) * 2], [0, -1, 0]); });
    const welded = (await time(rows, "Sculpt selection copy", 3, () => sculptMeshOf(soup))) as ReturnType<typeof sculptMeshOf>;
    const chosen = new Uint8Array(welded.triangles.length / 3);
    for (let t = 0; t < chosen.length; t += 1) {
      const p = welded.points, i = welded.triangles[t * 3] * 3;
      chosen[t] = Math.hypot(p[i], p[i + 2] + 5) < 6 ? 1 : 0;
    }
    await time(rows, "Grow the selection", 3, () => growChoice(welded, chosen));
    await time(rows, "Extrude a selection", 1, () => extrudeChoice(welded, chosen, 1, "extrude"));
    await time(rows, "Remesh (live, 2 passes)", 1, () => { const copy = LiveMesh.fromSoup(soup); remeshLive(copy, 0.2, 2); copy.dispose(); });
    await time(rows, "Cap holes (Make solid prep)", 1, () => makeSolidPositions(soup));
    await time(rows, "Thicken 1 mm (voxel)", 1, () => remeshPositions(soup, { mode: "thicken", detail: 0.3, amount: 1 }));
    await time(rows, "Make solid (0.3 mm)", 1, () => solidPositions(soup, 0.3));
    live.dispose();

    console.table(rows);
    const out = process.env.SPEED_CHECK_OUT;
    if (out) {
      writeFileSync(out, JSON.stringify({
        kind: "engine",
        build: Number(process.env.SPEED_CHECK_BUILD || 0) || null,
        date: new Date().toISOString(),
        machine: { cpus: os.cpus().length, model: os.cpus()[0]?.model ?? "", node: process.version },
        triangles,
        results: Object.fromEntries(rows.map((r) => [r.step, r.ms])),
      }, null, 2));
    }
  }, 600000);
});
