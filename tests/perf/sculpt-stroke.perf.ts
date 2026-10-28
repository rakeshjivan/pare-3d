import { PerformanceObserver } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { LiveMesh, stampBrush, averageEdgeOf } from "@/lib/liveSculpt";

/**
 * Build 85: Sculpt's stroke loop without the drawing - a full-arch-sized scan (about 440,000 triangles,
 * no patient data), one long Draw stroke as the editor runs it: per frame, a few dabs (pick, brush),
 * refine round them (as Refine is set), and the GPU buffers' changed parts. Reports the time per frame
 * and the garbage collection during the stroke, per Refine setting.
 */
function scan(n = 470) {
  const w = 70, d = 55;
  const height = (x: number, z: number) => {
    const arch = Math.exp(-(((Math.hypot(x, z + 20) - 28) / 6) ** 2));
    const cusps = 0.5 + 0.5 * Math.cos(x * 1.1) * Math.cos(z * 1.3);
    return 4 * arch + 2.5 * arch * cusps + 0.15 * Math.sin(x * 7.3 + z * 5.1);
  };
  const out = new Float32Array(n * n * 18);
  let o = 0;
  const at = (i: number, j: number) => { const x = -w / 2 + (w * i) / n, y = -d / 2 + (d * j) / n; return [x, y, height(x, y)]; };
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), e = at(i, j + 1);
    for (const p of [a, b, c, a, c, e]) { out[o++] = p[0]; out[o++] = p[1]; out[o++] = p[2]; }
  }
  return out;
}

it("profiles one long stroke per Refine setting", () => {
  const results: Record<string, unknown>[] = [];
  const soup = scan();
  for (const refine of (process.env.SCULPT_REFINES ?? "off,coarse,medium,fine").split(",")) {
    const mesh = LiveMesh.fromSoup(soup);
    mesh.geometry;
    const base = averageEdgeOf(mesh);
    const gcs: number[] = [];
    const observer = new PerformanceObserver((list) => { for (const e of list.getEntries()) gcs.push(e.duration); });
    observer.observe({ entryTypes: ["gc"] });
    mesh.beginPatch();
    const frames: number[] = [];
    const radius = 1.5, factor = refine === "fine" ? 0.06 : refine === "coarse" ? 0.2 : 0.11;
    let x = -20;
    for (let f = 0; f < 240; f += 1) {
      const t0 = performance.now();
      const balls: Array<[number, number, number]> = [];
      for (let k = 0; k < 3; k += 1) {
        x += 0.1;
        const y = -8 + Math.sin(x / 3) * 4;
        const hit = mesh.pick([x, y, 30], [0, 0, -1]);
        if (!hit) continue;
        const nrm = mesh.vertexNormal(mesh.tri[hit.triangle * 3]);
        stampBrush(mesh, "draw", hit.point, [nrm.x, nrm.y, nrm.z], radius, hit.triangle, 0.29);
        balls.push(hit.point);
      }
      if (refine !== "off") for (const c of balls.slice(0, 1)) mesh.refine(mesh.region(c, radius * 1.15, null).keys(), Math.max(0.03, radius * factor), { within: { centre: c, radius: radius * 1.15 }, budget: 600, milliseconds: 12, collapseBelow: base * 0.5 });
      mesh.flushGpu();
      frames.push(performance.now() - t0);
    }
    const t1 = performance.now();
    mesh.endPatch();
    const endMs = performance.now() - t1;
    observer.disconnect();
    const sorted = [...frames].sort((a, b) => a - b);
    results.push({
      refine, frameAvg: +(frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(2), frameP95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1), frameMax: +sorted[sorted.length - 1].toFixed(1),
      over16: frames.filter((f) => f > 16).length, gcCount: gcs.length, gcMs: Math.round(gcs.reduce((a, b) => a + b, 0)), gcLongest: Math.round(Math.max(0, ...gcs)), endPatchMs: Math.round(endMs), triangles: mesh.triangleCount(),
    });
  }
  console.table(results);
  if (process.env.SCULPT_OUT) writeFileSync(process.env.SCULPT_OUT, JSON.stringify(results, null, 2));
}, 600_000);
