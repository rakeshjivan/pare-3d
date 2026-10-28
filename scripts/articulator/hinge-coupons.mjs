#!/usr/bin/env node
/*
 * Test prints for the build 85 articulator (Pare 3D): the drop-on hinge at three clearances and the
 * slim blade pin. No teeth, no patient data - small pieces to print in resin and feel.
 *
 *   node scripts/articulator/hinge-coupons.mjs <output folder>
 *
 * Hinge: a short axle each side on the lower, flat on its front and back (4.5 mm tall, 2.6 mm across);
 * the upper's hook has a 3.6 mm slot. The axle only passes the slot when the upper is
 * opened to about 110 degrees - like a removable oven door - so at every working angle it is held, yet
 * nothing snaps. The upper's weight rests on the round top of each axle.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const Module = (await import("manifold-3d")).default;
const wasm = await Module();
wasm.setup();
const { Manifold } = wasm;
const out = process.argv[2] ?? "coupons";
mkdirSync(out, { recursive: true });

const box = (x0, x1, y0, y1, z0, z1) => Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
/** A cylinder along x from x0 to x1 about (y, z). */
const rod = (x0, x1, r, y = 0, z = 0, n = 96) => Manifold.cylinder(x1 - x0, r, r, n).rotate([0, 90, 0]).translate([x0, y, z]);

function stl(m, file) {
  const mesh = m.getMesh();
  const p = mesh.vertProperties, t = mesh.triVerts, k = mesh.numProp;
  const n = t.length / 3;
  const b = Buffer.alloc(84 + n * 50);
  b.writeUInt32LE(n, 80);
  let o = 84;
  for (let i = 0; i < n; i += 1) {
    o += 12;
    for (let j = 0; j < 3; j += 1) { const v = t[i * 3 + j]; for (let a = 0; a < 3; a += 1) { b.writeFloatLE(p[v * k + a], o); o += 4; } }
    o += 2;
  }
  writeFileSync(join(out, file), b);
  return { file, triangles: n, volume: Number((m.volume() / 1000).toFixed(2)) };
}

// ---- The hinge ------------------------------------------------------------------------------------
export const AXLE_R = 2.25;     // 4.5 mm round
export const AXLE_FLAT = 1.3;   // flats front and back: 2.6 mm across
export const HOOK_WALL = 1.8;
export const HOOK_LEN = 5;
export const RELEASE = 110;     // the opening at which the slot faces straight down (it lifts off within about 15 degrees of it)
export const SLOT_ANGLE = RELEASE - 90; // so with the models closed the slot points back, 20 degrees up
export const SLOT = 3.6;        // the slot's width: wider than the flats, narrower than the 4.5 mm round
const POST_X = 20;              // the post's outer face; the axle runs out from it

/** Notches on the front edge: 1, 2 or 3, so the clearances can be told apart. */
function notches(m, count, y, z) {
  const cuts = [];
  for (let i = 0; i < count; i += 1) cuts.push(Manifold.cube([1.4, 1.4, 20], true).rotate([0, 0, 45]).translate([-4 + i * 4, y, z]));
  return Manifold.difference(m, Manifold.union(cuts));
}

function hingeLower(c, mark) {
  const parts = [box(-22, 22, -8, 4, -12, -6)];
  for (const s of [1, -1]) {
    // The post, rounded over the top, and its axle (flats front and back).
    parts.push(box(s > 0 ? POST_X - 4 : -POST_X, s > 0 ? POST_X : -POST_X + 4, -3, 3, -6.5, 0));
    parts.push(rod(s > 0 ? POST_X - 4 : -POST_X, s > 0 ? POST_X : -POST_X + 4, 3, 0, 0));
    const x0 = s > 0 ? POST_X - 0.5 : -POST_X - HOOK_LEN - c - 0.6, x1 = s > 0 ? POST_X + HOOK_LEN + c + 0.6 : -POST_X + 0.5;
    parts.push(Manifold.intersection(rod(x0, x1, AXLE_R), box(x0, x1, -AXLE_FLAT, AXLE_FLAT, -5, 5)));
  }
  return notches(Manifold.union(parts), mark, -8, -9);
}

function hingeUpper(c, mark) {
  const hole = AXLE_R + c, outer = hole + HOOK_WALL;
  const parts = [box(-POST_X - HOOK_LEN - c, POST_X + HOOK_LEN + c, -8, 4, 6, 12)];
  const cuts = [];
  for (const s of [1, -1]) {
    const x0 = s > 0 ? POST_X + c : -POST_X - c - HOOK_LEN, x1 = x0 + HOOK_LEN;
    parts.push(rod(x0, x1, outer), box(x0, x1, -outer, outer, 0, 6.5));
    cuts.push(rod(x0 - 1, x1 + 1, hole));
    // The slot, 3 mm + clearance wide, from the hole out of the back of the hook.
    const w = SLOT;
    cuts.push(box(x0 - 1, x1 + 1, 0, 12, -w / 2, w / 2).rotate([SLOT_ANGLE, 0, 0]));
  }
  return notches(Manifold.difference(Manifold.union(parts), Manifold.union(cuts)), mark, -8, 9);
}

// ---- The blade pin ----------------------------------------------------------------------------------
/** A blade swept along a path in the y-z plane: thin (t) across x, deep (d) along the path's normal, its edges round. */
function blade(stations) {
  const slice = ({ y, z, t, d, ny, nz }) => {
    const h = Math.max(0, d / 2 - t / 2);
    const a = Manifold.sphere(t / 2, 48).translate([0, y + ny * h, z + nz * h]);
    return h > 0 ? Manifold.hull([a, Manifold.sphere(t / 2, 48).translate([0, y - ny * h, z - nz * h])]) : a;
  };
  const withNormals = stations.map((s, i) => {
    const a = stations[Math.max(0, i - 1)], b = stations[Math.min(stations.length - 1, i + 1)];
    const ty = b.y - a.y, tz = b.z - a.z, l = Math.hypot(ty, tz) || 1;
    return { ...s, ny: -tz / l, nz: ty / l };
  });
  const segs = [];
  for (let i = 0; i + 1 < withNormals.length; i += 1) segs.push(Manifold.hull([slice(withNormals[i]), slice(withNormals[i + 1])]));
  return Manifold.union(segs);
}
/** Points along a smooth curve through `points` (Catmull-Rom), with t and d interpolated. */
function sweep(points, steps = 6) {
  const out = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 0; k < steps; k += 1) {
      const u = k / steps, u2 = u * u, u3 = u2 * u;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      out.push({ y: cr(p0.y, p1.y, p2.y, p3.y), z: cr(p0.z, p1.z, p2.z, p3.z), t: p1.t + (p2.t - p1.t) * u, d: p1.d + (p2.d - p1.d) * u });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const TIP = 1.75, TIP_Z = 17;
function pinLower(t) {
  const base = box(-8, 8, 0, 10, 0, 6);
  // Out of the base's front face, forward and up in one S-curve, flared at the root, to a rounded tip.
  const path = sweep([
    { y: 5, z: 3, t: 5.5, d: 6 }, { y: -1, z: 3.2, t: t + 1.5, d: 7.5 }, { y: -5.5, z: 6, t: t + 0.3, d: 6.5 },
    { y: -7.5, z: 10.5, t, d: 5.5 }, { y: -8, z: 14, t, d: 4.5 }, { y: -8, z: TIP_Z - 0.5, t: 2 * TIP, d: 2 * TIP },
  ]);
  return Manifold.union([base, blade(path), Manifold.sphere(TIP, 64).translate([0, -8, TIP_Z])]);
}
function pinUpper(t) {
  const base = box(-8, 8, 0, 10, 24, 30);
  const path = sweep([
    { y: 5, z: 27, t: 5.5, d: 6 }, { y: -1, z: 26.8, t: t + 1.5, d: 7.5 }, { y: -5.5, z: 24.5, t: t + 0.3, d: 6.5 },
    { y: -7.5, z: 21.5, t: t + 0.5, d: 5.5 }, { y: -8, z: 18, t: 5, d: 5.5 },
  ]);
  // A flat pad for the tip to stop on: the hinge already places the upper, so a cup would only fight it.
  const pad = Manifold.difference(Manifold.union([base, blade(path)]), box(-10, 10, -20, 20, -5, TIP_Z + TIP));
  return pad;
}

const report = [];
[[0.05, 1], [0.1, 2], [0.15, 3]].forEach(([c, mark]) => {
  const tag = `c${String(Math.round(c * 100)).padStart(2, "0")}`;
  report.push(stl(hingeLower(c, mark), `hinge-${tag}-lower.stl`), stl(hingeUpper(c, mark), `hinge-${tag}-upper.stl`));
});
for (const t of [2.5, 3]) report.push(stl(pinLower(t), `pin-blade-${String(t).replace(".", "")}-lower.stl`));
report.push(stl(pinUpper(3), "pin-blade-upper.stl"));
console.table(report);
