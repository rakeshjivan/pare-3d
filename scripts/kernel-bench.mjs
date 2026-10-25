#!/usr/bin/env node
// Build 69: the single-threaded and the parallel geometry kernel side by side, on made-up meshes
// (no scans). node scripts/kernel-bench.mjs [path to the parallel manifold.js]
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { availableParallelism } from "node:os";
const parPath = process.argv[2] ?? resolve("apps/web/public/par/manifold.js");
const kernels = { single: (await import("manifold-3d")).default, parallel: (await import(pathToFileURL(parPath).href)).default };
const results = {};
for (const [name, factory] of Object.entries(kernels)) {
  const wasm = await factory(); wasm.setup();
  const { Manifold } = wasm;
  const time = (label, fn) => { const t = performance.now(); const out = fn(); const ms = performance.now() - t; (results[label] ??= {})[name] = Math.round(ms); return out; };
  const a = Manifold.sphere(40, 600), b = Manifold.sphere(40, 600).translate([30, 0, 0]);
  const tris = a.numTri();
  time("union of two spheres", () => a.add(b).numTri());
  time("subtract 20 cylinders", () => { let s = a; for (let i = 0; i < 20; i++) s = s.subtract(Manifold.cylinder(100, 3, 3, 64, true).translate([-40 + i * 4, 0, 0])); return s.numTri(); });
  time("split by a plane", () => a.splitByPlane([1, 0.2, 0], 1).map((p) => p.numTri()));
  time("level set (hollow)", () => Manifold.levelSet(([x, y, z]) => 30 - Math.hypot(x, y, z), { min: [-35, -35, -35], max: [35, 35, 35] }, 0.6).numTri());
  time("smooth and refine", () => a.refine(2).numTri());
  results.triangles = tris;
}
console.log(`cores: ${availableParallelism()}`);
console.log("| Operation | Single-threaded (ms) | Parallel (ms) | Speed-up |\n| --- | --- | --- | --- |");
for (const [label, r] of Object.entries(results)) if (typeof r === "object") console.log(`| ${label} | ${r.single} | ${r.parallel} | ${(r.single / r.parallel).toFixed(1)}x |`);
process.exit(0);
