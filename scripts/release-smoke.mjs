// Release smoke test: the production build in a real browser - group, cut, split, 3MF and STL export, import.
// Run against a production build: LAYERLING_MCP_REMOTE=true LAYERLING_MCP_TOKEN=measure-token-0123456789 npx next start apps/web -p 3021
// then: node scripts/release-smoke.mjs http://localhost:3021
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.argv[2] ?? "http://localhost:3021"; const TOKEN = "measure-token-0123456789";
let editorNumber;
async function mcp(action, params = {}) {
  const r = await fetch(`${BASE}/api/layerling-mcp`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ type: "command", editorNumber, action, params, timeoutMs: 300000 }) });
  const j = await r.json(); if (!j.ok) throw new Error(action + ": " + j.error); return j.data;
}
const list = async () => (await (await fetch(`${BASE}/api/layerling-mcp`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json()).editors ?? [];
function sphere(rings, segments, r = 20) { const pt = (i, j) => { const t = (i / rings) * Math.PI, p = (j / segments) * Math.PI * 2; return [r * Math.sin(t) * Math.cos(p), r + r * Math.cos(t), r * Math.sin(t) * Math.sin(p)]; }; const out = []; for (let i = 0; i < rings; i++) for (let j = 0; j < segments; j++) { const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1); if (i < rings - 1) out.push([...a, ...c, ...b]); if (i > 0) out.push([...a, ...d, ...c]); } return out; }
function stl(tris) { const buf = Buffer.alloc(84 + tris.length * 50); buf.writeUInt32LE(tris.length, 80); tris.forEach((t, i) => { for (let k = 0; k < 3; k++) { buf.writeFloatLE(t[k * 3], 84 + i * 50 + 12 + k * 12); buf.writeFloatLE(-t[k * 3 + 2], 84 + i * 50 + 16 + k * 12); buf.writeFloatLE(t[k * 3 + 1], 84 + i * 50 + 20 + k * 12); } }); return buf.toString("base64"); }
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const before = new Set((await list()).map((e) => e.editorNumber));
await page.goto(`${BASE}/?editor=1`);
for (let i = 0; i < 120 && editorNumber === undefined; i++) { const f = (await list()).filter((e) => !before.has(e.editorNumber)); if (f.length) editorNumber = f.at(-1).editorNumber; else await new Promise((r) => setTimeout(r, 500)); }
const results = [];
const step = async (name, fn) => { const t = Date.now(); try { const out = await fn(); results.push(`ok   ${name} (${Date.now() - t} ms)${out ? " " + out : ""}`); } catch (e) { results.push(`FAIL ${name}: ${e.message.slice(0, 200)}`); } };
await step("group a box with a hole", async () => { const a = (await mcp("create_shape", { kind: "box", width: 20, depth: 20, height: 10 })).object.id; const b = (await mcp("create_shape", { kind: "cylinder", x: 0, z: 0, width: 6, depth: 6, height: 20 })).object.id; await mcp("update_object", { id: b, hole: true }); const g = await mcp("group_objects", { ids: [a, b] }); return JSON.stringify(g).slice(0, 60); });
let id;
await step("import a closed 40k STL", async () => { const made = await mcp("import_file", { fileName: "s.stl", base64: stl(sphere(100, 200)) }); id = JSON.stringify(made).match(/"id":"([^"]+)"/)[1]; });
await step("cut a hole in the import", async () => { const h = (await mcp("create_shape", { kind: "cylinder", x: 0, z: 0, width: 6, depth: 6, height: 60 })).object.id; await mcp("update_object", { id: h, hole: true }); const g = await mcp("group_objects", { ids: [id, h] }); id = g.object?.id ?? JSON.stringify(g).match(/"id":"([^"]+)"/)[1]; });
await step("split it in two", async () => JSON.stringify(await mcp("split_objects", { ids: [id], axis: "x", position: 0 })).slice(0, 80));
await step("export 3MF", async () => { const f = await mcp("export_mesh", { format: "3mf" }); const bytes = Buffer.from(f.base64 ?? "", "base64"); if (bytes.length < 1000 || bytes[0] !== 0x50) throw new Error("not a zip: " + bytes.length); return bytes.length + " bytes"; });
await step("export STL", async () => { const f = await mcp("export_mesh", { format: "stl" }); return (f.base64?.length ?? 0) + " b64 chars"; });
await step("print estimate", async () => JSON.stringify(await mcp("print_estimate", {}).catch((e) => ({ skipped: e.message.slice(0, 60) }))).slice(0, 80));
console.log(results.join("\n")); console.log("page errors:", errors.slice(0, 5));
await browser.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
