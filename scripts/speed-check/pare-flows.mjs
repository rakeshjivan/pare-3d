#!/usr/bin/env node
/*
 * The speed check's browser half (Pare 3D, build 81): how quick the app feels in the flows Pare 3D
 * adds - opening, a full-arch-sized scan coming in, turning the view with it, Sculpt opening and a
 * stroke, and (with scans of your own) Dental Studio making the models. Runs on the static export:
 *
 *   NEXT_PUBLIC_PARE_BUILD=81 node scripts/build-static-export.mjs
 *   (cd apps/web/.next-export && python3 -m http.server 47451 --bind 127.0.0.1) &
 *   node scripts/speed-check/pare-flows.mjs --url http://127.0.0.1:47451 --json pare-81.json
 *
 * Options: --runs <n> (default 2, medians), --scans <folder> holding upper.stl, lower.stl and
 * optionally bite.stl for the Dental Studio step (your own files: they are read, never copied).
 *
 * For each step: its duration, the longest frame gap and the longest input delay (how late a 10 ms
 * timer came - the wait a click would have). Software rendering in a container makes frame figures
 * pessimistic: compare builds on the same machine (scripts/speed-check/compare.mjs).
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const option = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = option("url", "http://127.0.0.1:47451").replace(/\/$/, "");
const RUNS = Number(option("runs", "2"));
const JSON_OUT = option("json", "");
const SCANS = option("scans", process.env.PARE_SPEED_SCANS ?? "");

/** The same made-up scan as tests/perf/speed-check.perf.ts: about 300,000 triangles, binary STL. */
function scanStl(n = 388) {
  const w = 70, d = 55;
  const height = (x, z) => {
    const arch = Math.exp(-(((Math.hypot(x, z + 20) - 28) / 6) ** 2));
    const cusps = 0.5 + 0.5 * Math.cos(x * 1.1) * Math.cos(z * 1.3);
    return 4 * arch + 2.5 * arch * cusps + 0.15 * Math.sin(x * 7.3 + z * 5.1);
  };
  // STL is z up: the surface's height goes on z.
  const at = (i, j) => { const x = -w / 2 + (w * i) / n, y = -d / 2 + (d * j) / n; return [x, y, height(x, y)]; };
  const count = n * n * 2;
  const buffer = Buffer.alloc(84 + count * 50);
  buffer.writeUInt32LE(count, 80);
  let o = 84;
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), e = at(i, j + 1);
    for (const tri of [[a, b, c], [a, c, e]]) {
      o += 12;
      for (const p of tri) for (const v of p) { buffer.writeFloatLE(v, o); o += 4; }
      o += 2;
    }
  }
  return buffer;
}

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.addInitScript(() => {
    window.__gap = 0; window.__lag = 0; window.__frames = [];
    let last = performance.now();
    const frame = (now) => { const g = now - last; window.__gap = Math.max(window.__gap, g); window.__frames.push(g); last = now; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    let due = performance.now() + 10;
    const ping = () => { const now = performance.now(); window.__lag = Math.max(window.__lag, now - due); due = now + 10; setTimeout(ping, 10); };
    setTimeout(ping, 10);
  });
  return page;
}

async function measure(page, run) {
  await page.evaluate(() => { window.__gap = 0; window.__lag = 0; window.__frames = []; });
  const start = Date.now();
  await run();
  const duration = Date.now() - start;
  const { gap, lag, frames } = await page.evaluate(() => ({ gap: window.__gap, lag: window.__lag, frames: window.__frames.slice() }));
  frames.sort((a, b) => a - b);
  const p95 = frames.length ? frames[Math.floor(frames.length * 0.95)] : 0;
  return { duration, frameGap: Math.round(gap), lag: Math.round(lag), fps: frames.length ? Math.round(1000 / frames[Math.floor(frames.length / 2)]) : 0, p95Frame: Math.round(p95) };
}

async function dropFiles(page, files) {
  const dt = await page.evaluateHandle((list) => {
    const d = new DataTransfer();
    for (const f of list) { const bin = atob(f.b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i += 1) u[i] = bin.charCodeAt(i); d.items.add(new File([u], f.n)); }
    return d;
  }, files.map(([n, bytes]) => ({ n, b: bytes.toString("base64") })));
  await page.locator(".three-workplane-host").first().dispatchEvent("drop", { dataTransfer: dt });
}

const quiet = (page, ms = 1500) => page.waitForTimeout(ms);
/** The card offering a higher triangle limit for a big scan: accepted, as a person would. */
async function acceptLargeMesh(page) {
  const card = page.locator(".large-mesh-notice button.primary");
  if (await card.count()) await card.first().click().catch(() => {});
}

async function oneRun(browser, stl) {
  const out = {};
  const page = await openPage(browser);
  // Opening the editor: the page to a drawn workplane.
  let bytes = 0;
  page.on("response", async (r) => { if (/\.(js|wasm|css)(\?|$)/.test(r.url())) { const len = Number(r.headers()["content-length"] || 0); bytes += len; } });
  out.open = await measure(page, async () => {
    await page.goto(`${BASE}/?editor=1`, { timeout: 300000 });
    await page.waitForSelector(".workplane-plane canvas", { timeout: 300000 });
  });
  out.open.scriptMb = Number((bytes / 1048576).toFixed(1));
  await quiet(page, 3000);
  // A 300k-triangle scan dropped in, until it stands selected on the workplane.
  out.importScan = await measure(page, async () => {
    await dropFiles(page, [["scan.stl", stl]]);
    await page.waitForSelector(".mesh-check-card, .large-mesh-notice", { timeout: 300000 });
  });
  await page.locator(".mesh-check-card button", { hasText: "Leave it" }).click({ timeout: 3000 }).catch(() => {});
  await quiet(page);
  await acceptLargeMesh(page);
  // Turning the view with the scan in it: a right-button drag for about three seconds.
  out.orbit = await measure(page, async () => {
    await page.mouse.move(600, 450); await page.mouse.down({ button: "right" });
    for (let k = 0; k < 90; k += 1) { await page.mouse.move(600 + Math.sin(k / 10) * 200, 450 + Math.cos(k / 14) * 80); await page.waitForTimeout(30); }
    await page.mouse.up({ button: "right" });
  });
  await quiet(page);
  // Sculpt opening on the scan, then one Smooth stroke, then Done (the part rebuilt).
  out.sculptOpen = await measure(page, async () => {
    await page.locator('[data-layerling-tool="sculpt"]').first().click();
    await page.waitForSelector(".mesh-sculpt-panel", { timeout: 60000 });
    await page.waitForSelector(".sculpt-preparing", { state: "detached", timeout: 120000 });
  });
  await quiet(page);
  out.sculptStroke = await measure(page, async () => {
    await page.mouse.move(560, 470); await page.mouse.down();
    for (let k = 0; k <= 40; k += 1) { await page.mouse.move(560 + k * 5, 470 + Math.sin(k / 4) * 20); await page.waitForTimeout(16); }
    await page.mouse.up();
  });
  await quiet(page);
  out.sculptDone = await measure(page, async () => {
    await page.locator(".mesh-sculpt-panel button", { hasText: /^Done$/ }).first().click();
    await page.waitForSelector(".mesh-sculpt-panel", { state: "detached", timeout: 120000 });
  });
  await quiet(page);
  // Undo of that, as a person would.
  out.undo = await measure(page, async () => { await page.keyboard.press("Control+z"); await page.waitForTimeout(300); });
  await page.close();

  if (SCANS && existsSync(join(SCANS, "upper.stl")) && existsSync(join(SCANS, "lower.stl"))) {
    const studio = await openPage(browser);
    await studio.goto(`${BASE}/?editor=1`, { timeout: 300000 });
    await studio.waitForSelector(".workplane-plane canvas", { timeout: 300000 });
    await quiet(studio, 3000);
    await studio.locator('[data-layerling-tool="dentalModel"]').first().click();
    await studio.waitForSelector(".dental-studio-panel", { timeout: 60000 });
    const names = ["upper", "lower", "bite"].filter((n) => existsSync(join(SCANS, `${n}.stl`)));
    out.studioImport = await measure(studio, async () => {
      await dropFiles(studio, names.map((n) => [`${n}.stl`, readFileSync(join(SCANS, `${n}.stl`))]));
      await studio.waitForFunction(() => (document.querySelector(".dental-studio-panel")?.innerText.match(/Holes filled/g) ?? []).length >= 2, null, { timeout: 600000 });
    });
    await studio.waitForSelector(".large-mesh-notice", { timeout: 15000 }).catch(() => {});
    await acceptLargeMesh(studio);
    await quiet(studio, 3000);
    await acceptLargeMesh(studio);
    out.studioMake = await measure(studio, async () => {
      await studio.locator(".dental-studio-panel .edge-modifier-footer button.primary").last().click({ timeout: 600000 });
      await studio.waitForSelector(".dental-made", { timeout: 1800000 });
    });
    await studio.close();
  }
  return out;
}

const median = (values) => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const stl = scanStl();
const runs = [];
for (let r = 0; r < RUNS; r += 1) runs.push(await oneRun(browser, stl));
await browser.close();
const steps = Object.keys(runs[0]);
const results = {};
for (const step of steps) {
  results[step] = {};
  for (const key of Object.keys(runs[0][step])) results[step][key] = median(runs.map((run) => run[step]?.[key] ?? 0));
}
console.table(Object.fromEntries(steps.map((s) => [s, results[s]])));
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ kind: "pare-flows", build: Number(process.env.SPEED_CHECK_BUILD || 0) || null, date: new Date().toISOString(), machine: { cpus: os.cpus().length, model: os.cpus()[0]?.model ?? "" }, runs: RUNS, scans: Boolean(SCANS), results }, null, 2));
