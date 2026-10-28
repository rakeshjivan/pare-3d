#!/usr/bin/env node
/*
 * Sculpt stroke profile (build 85): a full-arch-sized scan in the static export, Sculpt opened, one
 * long Draw stroke drawn at 60 Hz, per Refine setting. Reports per-frame brush and GPU-upload times
 * (window.layerlingSculptStats), frame gaps, input delay, and garbage collection from a trace.
 *
 *   node scripts/speed-check/sculpt-stroke.mjs --url http://127.0.0.1:47451 [--refine off,coarse,medium,fine]
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const option = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const BASE = option("url", "http://127.0.0.1:47451").replace(/\/$/, "");
const REFINES = option("refine", "off,coarse,medium,fine").split(",");
const N = Number(option("n", "470"));

function scanStl(n) {
  const w = 70, d = 55;
  const height = (x, z) => {
    const arch = Math.exp(-(((Math.hypot(x, z + 20) - 28) / 6) ** 2));
    const cusps = 0.5 + 0.5 * Math.cos(x * 1.1) * Math.cos(z * 1.3);
    return 4 * arch + 2.5 * arch * cusps + 0.15 * Math.sin(x * 7.3 + z * 5.1);
  };
  const at = (i, j) => { const x = -w / 2 + (w * i) / n, y = -d / 2 + (d * j) / n; return [x, y, height(x, y)]; };
  const count = n * n * 2;
  const buffer = Buffer.alloc(84 + count * 50);
  buffer.writeUInt32LE(count, 80);
  let o = 84;
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), e = at(i, j + 1);
    for (const tri of [[a, b, c], [a, c, e]]) { o += 12; for (const p of tri) for (const v of p) { buffer.writeFloatLE(v, o); o += 4; } o += 2; }
  }
  return buffer;
}

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const stl = scanStl(N);
const results = [];
for (const refine of REFINES) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.addInitScript((r) => {
    try { localStorage.setItem("pare3d.sculptRefine", r); localStorage.setItem("pare3d.sculptRefine85", r); } catch {}
    window.__lag = 0; window.__gaps = [];
    let last = performance.now();
    const frame = (now) => { window.__gaps.push(now - last); last = now; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    let due = performance.now() + 10;
    const ping = () => { const now = performance.now(); window.__lag = Math.max(window.__lag, now - due); due = now + 10; setTimeout(ping, 10); };
    setTimeout(ping, 10);
  }, refine);
  await page.goto(`${BASE}/?editor=1`, { timeout: 300000 });
  await page.waitForSelector(".workplane-plane canvas", { timeout: 300000 });
  await page.waitForTimeout(2000);
  const dt = await page.evaluateHandle((b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i += 1) u[i] = bin.charCodeAt(i); const d = new DataTransfer(); d.items.add(new File([u], "scan.stl")); return d; }, stl.toString("base64"));
  await page.locator(".three-workplane-host").first().dispatchEvent("drop", { dataTransfer: dt });
  await page.waitForSelector(".mesh-check-card, .large-mesh-notice", { timeout: 300000 });
  await page.locator(".mesh-check-card button", { hasText: "Leave it" }).click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const big = page.locator(".large-mesh-notice button.primary"); if (await big.count()) await big.first().click().catch(() => {});
  await page.waitForTimeout(1000);
  await page.locator('[data-layerling-tool="sculpt"]').first().click();
  await page.waitForSelector(".mesh-sculpt-panel", { timeout: 60000 });
  await page.waitForSelector(".sculpt-preparing", { state: "detached", timeout: 120000 });
  await page.locator(".mesh-sculpt-panel button", { hasText: /^Draw$/ }).first().click();
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.layerlingSculptStats = []; window.__lag = 0; window.__gaps = []; });
  await browser.startTracing(page, { categories: ["disabled-by-default-v8.gc", "v8"] });
  const t0 = Date.now();
  await page.mouse.move(520, 470); await page.mouse.down();
  for (let k = 0; k <= 120; k += 1) { await page.mouse.move(520 + k * 3.5, 470 + Math.sin(k / 9) * 60); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(500);
  const strokeMs = Date.now() - t0;
  const trace = JSON.parse((await browser.stopTracing()).toString());
  const gc = { minor: 0, major: 0, ms: 0, longest: 0 };
  for (const e of trace.traceEvents ?? []) {
    if (e.ph !== "X" || !e.dur) continue;
    if (/^(MinorGC|Scavenge|V8.GC_SCAVENGER$)/.test(e.name) || e.name === "MinorGC") { gc.minor += 1; gc.ms += e.dur / 1000; gc.longest = Math.max(gc.longest, e.dur / 1000); }
    else if (/^(MajorGC|V8.GC_MARK_COMPACTOR$)/.test(e.name) || e.name === "MajorGC") { gc.major += 1; gc.ms += e.dur / 1000; gc.longest = Math.max(gc.longest, e.dur / 1000); }
  }
  const { stats, gaps, lag, tris } = await page.evaluate(() => ({ stats: window.layerlingSculptStats ?? [], gaps: window.__gaps, lag: window.__lag, tris: (window.layerlingSculptStats ?? []).slice(-1)[0]?.[3] }));
  const frames = stats.filter((s) => s[0] === "frame");
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const sorted = [...gaps].sort((a, b) => a - b);
  results.push({
    refine, frames: frames.length,
    workAvg: +(sum(frames.map((f) => f[1])) / Math.max(1, frames.length)).toFixed(1), workMax: Math.max(0, ...frames.map((f) => f[1])),
    gpuAvg: +(sum(frames.map((f) => f[2])) / Math.max(1, frames.length)).toFixed(1), gpuMax: Math.max(0, ...frames.map((f) => f[2])),
    end: stats.find((s) => s[0] === "end")?.[1], gapP95: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0), gapMax: Math.round(sorted[sorted.length - 1] ?? 0),
    lag: Math.round(lag), gcCount: gc.minor + gc.major, gcMajor: gc.major, gcMs: Math.round(gc.ms), gcLongest: Math.round(gc.longest), triangles: tris, strokeMs,
  });
  await page.close();
}
await browser.close();
console.table(results);
console.log(JSON.stringify(results));
