// Checks the hinge test prints' motion: free to open 0-95 degrees, held at working angles, released at ~95.
import { readFileSync } from "node:fs";
const Module = (await import("manifold-3d")).default;
const wasm = await Module(); wasm.setup();
const { Manifold, Mesh } = wasm;
const dir = process.argv[2];
function load(file) {
  const b = readFileSync(`${dir}/${file}`); const n = b.readUInt32LE(80);
  const pos = new Float32Array(n * 9); for (let i = 0; i < n; i += 1) for (let j = 0; j < 9; j += 1) pos[i * 9 + j] = b.readFloatLE(84 + i * 50 + 12 + j * 4);
  // weld
  const map = new Map(), verts = [], tris = new Uint32Array(n * 3);
  for (let v = 0; v < n * 3; v += 1) { const k = `${pos[v*3].toFixed(5)},${pos[v*3+1].toFixed(5)},${pos[v*3+2].toFixed(5)}`; let id = map.get(k); if (id === undefined) { id = verts.length / 3; map.set(k, id); verts.push(pos[v*3], pos[v*3+1], pos[v*3+2]); } tris[v] = id; }
  return new Manifold(new Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: tris }));
}
const hit = (a, b) => Manifold.intersection(a, b).volume();
for (const tag of ["c05", "c10", "c15"]) {
  const lo = load(`hinge-${tag}-lower.stl`), up = load(`hinge-${tag}-upper.stl`);
  const c = Number(tag.slice(1)) / 100;
  const row = { tag };
  // Resting: dropped by c the hook's top meets the axle top.
  row.closedFree = hit(lo, up) < 1e-6;
  row.restsOnAxle = hit(lo, up.translate([0, 0, -c - 0.02])) > 0;
  let worst = 0; for (let a = 0; a <= 110; a += 5) worst = Math.max(worst, hit(lo, up.rotate([-a, 0, 0])));
  row.opensFree = worst < 1e-6; { let first = null; for (let a = 0; a <= 130; a += 1) if (hit(lo, up.rotate([-a, 0, 0])) > 1e-6) { first = a; break; } row.firstTouch = first; }
  // Held: at each working angle, lifting 1.5 mm up (world) or back is blocked.
  const held = []; for (const a of [0, 30, 60, 90]) { const r = up.rotate([-a, 0, 0]); held.push(hit(lo, r.translate([0, 0, 1.5])) > 0 && hit(lo, r.translate([0, 1.5, 0])) > 0 && hit(lo, r.translate([0, -1.5, 0])) > 0); }
  row.heldAtWork = held.every(Boolean);
  // Released at 95: the upper lifts straight off (6 mm up, in steps) without touching.
  let rel = 0; const r95 = up.rotate([-110, 0, 0]); for (let d = 0; d <= 8; d += 0.5) rel = Math.max(rel, hit(lo, r95.translate([0, 0, d])));
  row.liftsOffAt110 = rel < 1e-6;
  // Side play: x shift that collides.
  let px = 0; for (let d = 0.01; d < 1; d += 0.01) { if (hit(lo, up.translate([d, 0, 0])) > 0) { px = d; break; } }
  row.sidePlay = Number(px.toFixed(2));
  let py = 0; const rest = up.translate([0, 0, -c]); for (let d = 0.01; d < 1; d += 0.01) { if (hit(lo, rest.translate([0, d, 0])) > 0) { py = d; break; } }
  row.fwdBackPlayResting = Number(py.toFixed(2));
  // The window of openings at which it lifts off.
  const free = []; for (let a = 0; a <= 150; a += 1) { const r = up.rotate([-a, 0, 0]); let m = 0; for (let d = 0; d <= 8; d += 0.5) m = Math.max(m, hit(lo, r.translate([0, 0, d]))); if (m < 1e-6) free.push(a); }
  row.releaseWindow = free.length ? `${free[0]}-${free[free.length - 1]}` : "none";
  console.log(JSON.stringify(row));
}
