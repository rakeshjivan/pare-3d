import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { vertexNormals } from "@/lib/dentalArch";
import { makeDentalStudio, type DentalStudioOptions } from "@/lib/dentalModel";
import { toManifold, transformSoup, weld } from "@/lib/dentalMesh";
import { readFileSync } from "node:fs";
import { decodeToothSet, encodeToothSet, type ToothLibraryManifest } from "@/lib/toothLibrary";
import { CONTACT_GAP, CONTACT_OVERLAP, contactGap, contralateral, fdiNumber, insideOf, librarySet, MIN_WAX, nudgeMatrix, parseObj, placeSet, splitShells, type ToothFrame, type WaxLandmarks } from "@/lib/dentalWaxup";

/**
 * Made-up teeth, no library's or patient's: closed egg shapes `width` wide, `height` tall, thinner
 * labio-lingually towards the incisal edge (+z), facing -y, the edge at z = 0.
 */
function tooth(width: number, height: number) {
  const geometry = new THREE.SphereGeometry(1, 64, 48).toNonIndexed();
  const p = geometry.getAttribute("position").array as Float32Array;
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    // SphereGeometry's poles are on y: its y becomes the tooth's height.
    const up = p[i + 1];
    const depth = 3.5 - 1.5 * (up + 1) / 2;
    out[i] = (p[i] * width) / 2;
    out[i + 1] = -p[i + 2] * depth;
    out[i + 2] = (up * height) / 2 - height / 2;
  }
  return out;
}

/** Canine, lateral, central, central, lateral, canine along an arc about (0, 20), all facing out. */
function anteriorSet(scale = 1) {
  const widths = [7.5, 6.5, 8.5, 8.5, 6.5, 7.5].map((w) => w * scale);
  const heights = [10, 9, 10.5, 10.5, 9, 10].map((h) => h * scale);
  const radius = 20 * scale;
  const total = widths.reduce((a, b) => a + b, 0);
  let s = -total / 2;
  return widths.map((width, i) => {
    const mid = s + width / 2;
    s += width;
    const angle = mid / radius;
    const m = new THREE.Matrix4().makeTranslation(radius * Math.sin(angle), 20 * scale - radius * Math.cos(angle) + 3.5, i === 0 || i === 5 ? -0.5 : 0)
      .multiply(new THREE.Matrix4().makeRotationZ(angle));
    return transformSoup(tooth(width, heights[i]), m);
  });
}

const join = (parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
};

let runtime: ManifoldToplevel;
beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
});

describe("Build 79: the digital wax-up", () => {
  it("reads OBJ files: polygons fanned, negative indices", () => {
    const text = ["v 0 0 0", "v 1 0 0", "v 1 1 0", "v 0 1 0", "f 1/1/1 2/2/2 3/3/3 4/4/4", "v 0 0 1", "f -1 -5 -4"].join("\n");
    const p = parseObj(text);
    expect(p.length).toBe(27);
    expect(Array.from(p.slice(18, 21))).toEqual([0, 0, 1]);
  });

  it("splits a set into its teeth and turns any way it was saved into the arch frame", () => {
    const parts = anteriorSet();
    // Saved upside down, back to front and turned: incisal edges down, labial +y, tilted.
    const saved = new THREE.Matrix4().makeRotationX(Math.PI).multiply(new THREE.Matrix4().makeRotationZ(0.4)).setPosition(5, -7, 30);
    const shells = splitShells(transformSoup(join(parts), saved));
    expect(shells.length).toBe(6);
    const set = librarySet("made up", shells);
    expect(set.teeth.map((t) => t.kind)).toEqual(["canine", "lateral", "central", "central", "lateral", "canine"]);
    expect(set.teeth.map((t) => t.side)).toEqual([-1, -1, -1, 1, 1, 1]);
    // Front at -y: the centrals stand in front of the canines; incisal edges up at z = 0.
    const [canine, , central] = set.teeth;
    expect(central.centroid[1]).toBeLessThan(canine.centroid[1] - 2);
    let top = -Infinity;
    for (const t of [set.teeth[2], set.teeth[3]]) for (let i = 2; i < t.positions.length; i += 3) top = Math.max(top, t.positions[i]);
    expect(top).toBeCloseTo(0, 5);
    expect(central.centroid[2]).toBeLessThan(-3);
    // Mirror-symmetric about the midline, as made.
    expect(set.teeth[2].centroid[0]).toBeCloseTo(-set.teeth[3].centroid[0], 3);
  });

  it("tells points inside closed shells from points outside", () => {
    const inside = insideOf(tooth(8, 10));
    expect(inside(0, 0, -5)).toBe(true);
    expect(inside(0, -1.5, -8)).toBe(true);
    expect(inside(0, -4, -5)).toBe(false);
    expect(inside(5, 0, -5)).toBe(false);
    expect(inside(0, 0, 0.5)).toBe(false);
  });

  it("places a set on the patient's teeth from the landmarks: wax over every facial surface, no more than asked", () => {
    // The patient: the same teeth, a little larger and turned 10 degrees in the scanner's frame.
    const turn = new THREE.Matrix4().makeRotationZ(0.17).setPosition(2, -3, 0);
    const patientParts = anteriorSet(1.05).map((p) => transformSoup(p, turn));
    const scan = weld(join(patientParts), 1e-6);
    const normals = vertexNormals(scan);
    const tip = (p: Float32Array): [number, number, number] => {
      let best = 0;
      for (let i = 2; i < p.length; i += 3) if (p[i] > p[best + 2]) best = i - 2;
      return [p[best], p[best + 1], p[best + 2]];
    };
    const centrals = [patientParts[2], patientParts[3]].map(tip);
    const midline: [number, number, number] = [(centrals[0][0] + centrals[1][0]) / 2, (centrals[0][1] + centrals[1][1]) / 2, 0];
    const landmarks: WaxLandmarks = { midline, canines: [tip(patientParts[0]), tip(patientParts[5])] };
    const set = librarySet("made up", anteriorSet());
    const { placed, scale } = placeSet(set, scan, normals, { landmarks });
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThan(1.15);
    expect(placed.length).toBe(6);
    for (const { clearance, matrix, tooth: t } of placed) {
      expect(clearance).not.toBeNull();
      expect(Math.abs(clearance! - MIN_WAX)).toBeLessThan(0.05);
      // Each wax tooth stands over its own patient tooth.
      const c = new THREE.Vector3(...t.centroid).applyMatrix4(matrix);
      const own = patientParts[t.index];
      let x = 0, y = 0;
      for (let i = 0; i < own.length; i += 3) { x += own[i]; y += own[i + 1]; }
      expect(Math.hypot(c.x - x / (own.length / 3), c.y - y / (own.length / 3))).toBeLessThan(2.5);
    }
  });

  it("finishes the wax-up so it blends: contacts closed without changing widths, the cervical part sunk into the patient's surface", () => {
    // The patient's teeth spaced 1 mm apart, so the library set placed on them leaves gaps.
    const patientParts = anteriorSet(1.05).map((p, i) => transformSoup(p, new THREE.Matrix4().makeTranslation((i - 2.5) * 1, 0, 0)));
    // A gum: a block over the cervical thirds, its labial face a little behind the teeth's.
    const gum = new THREE.BoxGeometry(70, 12, 10, 140, 1, 20).toNonIndexed();
    gum.translate(0, 7, -16);
    const scan = weld(join([...patientParts, gum.getAttribute("position").array as Float32Array]), 1e-6);
    const normals = vertexNormals(scan);
    const tip = (p: Float32Array): [number, number, number] => {
      let best = 0;
      for (let i = 2; i < p.length; i += 3) if (p[i] > p[best + 2]) best = i - 2;
      return [p[best], p[best + 1], p[best + 2]];
    };
    const centrals = [patientParts[2], patientParts[3]].map(tip);
    const landmarks: WaxLandmarks = { midline: [(centrals[0][0] + centrals[1][0]) / 2, (centrals[0][1] + centrals[1][1]) / 2, 0], canines: [tip(patientParts[0]), tip(patientParts[5])] };
    const set = librarySet("made up", anteriorSet());
    const rough = placeSet(set, scan, normals, { landmarks, blend: false }).placed;
    const done = placeSet(set, scan, normals, { landmarks }).placed;
    const order = (list: typeof done) => [...list].sort((a, b) => a.frame.origin[0] - b.frame.origin[0]);
    const gaps = (list: typeof done) => order(list).slice(1).map((t, i) => contactGap(order(list)[i].positions, t.positions)!);
    expect(Math.max(...gaps(rough))).toBeGreaterThan(CONTACT_GAP + 0.1);
    for (const gap of gaps(done)) {
      expect(gap).toBeLessThan(CONTACT_GAP + 0.05);
      expect(gap).toBeGreaterThan(-CONTACT_OVERLAP - 0.05);
    }
    order(done).forEach((t, i) => expect(t.width).toBeCloseTo(order(rough)[i].width, 6));
    // The cervical part moves only straight back along the tooth's labial direction (so the surface
    // cannot fold), towards the gum; the incisal part is only slid along the arch.
    let deepest = 0;
    for (const t of done) {
      const before = rough.find((r) => r.tooth.index === t.tooth.index)!;
      const out = new THREE.Vector3(...t.frame.out), up = new THREE.Vector3(...t.frame.up), o = new THREE.Vector3(...t.frame.origin);
      const slide = new THREE.Vector3(...t.frame.origin).sub(new THREE.Vector3(...before.frame.origin));
      const q = new THREE.Vector3(), r = new THREE.Vector3();
      let incisal = 0, sideways = 0, forward = 0;
      for (let i = 0; i < t.positions.length; i += 3) {
        q.set(t.positions[i], t.positions[i + 1], t.positions[i + 2]);
        r.set(before.positions[i], before.positions[i + 1], before.positions[i + 2]).add(slide);
        const move = q.clone().sub(r);
        const back = move.dot(out);
        forward = Math.max(forward, back);
        deepest = Math.min(deepest, back);
        sideways = Math.max(sideways, move.clone().addScaledVector(out, -back).length());
        if ((q.clone().sub(o).dot(up) + t.length) / t.length > 0.6) incisal = Math.max(incisal, move.length());
      }
      expect(forward).toBeLessThan(1e-4);
      expect(sideways).toBeLessThan(1e-4);
      expect(incisal).toBeLessThan(1e-4);
    }
    expect(deepest).toBeLessThan(-0.1);
  });

  it("adjusts a tooth along its own frame: out, along the arch, longer from the gum, wider, turned", () => {
    // A tooth on the patient's left of an upper arch: outward -y, mesial -x (towards the midline at x = 0), up +z.
    const frame: ToothFrame = { origin: [10, 0, 0], out: [0, -1, 0], mesial: [-1, 0, 0], up: [0, 0, 1] };
    const at = (m: THREE.Matrix4, p: [number, number, number]) => new THREE.Vector3(...p).applyMatrix4(m).toArray().map((v) => Math.round(v * 1000) / 1000);
    expect(at(nudgeMatrix(frame, 8, 10, "out", 0.5), [10, 0, 0])).toEqual([10, -0.5, 0]);
    expect(at(nudgeMatrix(frame, 8, 10, "mesial", 0.5), [10, 0, 0])).toEqual([9.5, 0, 0]);
    // Longer by 1: the edge rises 1 mm, the cervical end (10 mm below) stays.
    const longer = nudgeMatrix(frame, 8, 10, "longer", 1);
    expect(at(longer, [10, 0, 0])).toEqual([10, 0, 1]);
    expect(at(longer, [10, 0, -10])).toEqual([10, 0, -10]);
    // Wider by 1 about its middle: each side 0.5 mm out.
    expect(at(nudgeMatrix(frame, 8, 10, "wider", 1), [6, 0, 0])).toEqual([5.5, 0, 0]);
    // Turned mesial side out: the mesial edge comes forward (-y).
    expect(at(nudgeMatrix(frame, 8, 10, "turn", 10), [6, 0, 0])[1]).toBeLessThan(0);
    expect(contralateral(11)).toBe(21);
    expect(contralateral(43)).toBe(33);
    expect(fdiNumber("central", 1, "upper")).toBe(11);
    expect(fdiNumber("canine", -1, "lower")).toBe(43);
  });

  it("packs tooth sets small and reads them back as the same closed teeth", () => {
    const soup = tooth(8, 10);
    const m = weld(soup, 1e-6);
    const bytes = encodeToothSet([{ vertices: Float32Array.from(m.v), triangles: Uint32Array.from(m.f) }]);
    const [back] = decodeToothSet(bytes);
    expect(back.length).toBe(m.f.length * 3);
    let worst = 0;
    for (let i = 0; i < back.length; i += 1) worst = Math.max(worst, Math.abs(back[i] - m.v[m.f[Math.floor(i / 3)] * 3 + (i % 3)]));
    expect(worst).toBeLessThan(0.001);
    expect(() => decodeToothSet(new Uint8Array(16))).toThrow();
  });

  it("ships the Teethy sets: each six closed teeth that read as a set", () => {
    const manifest = JSON.parse(readFileSync("apps/web/public/libraries/teethy/manifest.json", "utf8")) as ToothLibraryManifest;
    expect(manifest.sets.length).toBe(9);
    expect(manifest.credit).toMatch(/teethy\.org/);
    for (const set of manifest.sets) {
      const shells = decodeToothSet(readFileSync(`apps/web/public/libraries/teethy/${set.file}`));
      expect(shells.length).toBe(set.teeth);
      const kinds = librarySet(set.name, shells).teeth.map((t) => t.kind);
      expect(kinds).toEqual(["canine", "lateral", "central", "central", "lateral", "canine"]);
      for (const shell of shells) toManifold(runtime as never, weld(shell, 1e-6)).delete();
    }
  });

  it("joins wax to a Dental Studio model and keeps every crown point it does not cover where the scan put it", async () => {
    const arch = syntheticArch();
    // One wax "tooth" over the front of the made-up arch's teeth.
    const wax = transformSoup(tooth(10, 8), new THREE.Matrix4().makeTranslation(0, -14.5, 14.5));
    const options: DentalStudioOptions = { keep: null, base: 3, baseStyle: "clean", inside: "solid", wall: 2, hinge: false, layout: "occlusion", label: "" };
    const plain = await makeDentalStudio({ arches: [{ id: "a", positions: arch }] }, options, runtime as never);
    const waxed = await makeDentalStudio({ arches: [{ id: "a", positions: arch, wax }] }, options, runtime as never);
    expect(waxed.pieces).toEqual([1]);
    expect(waxed.warnings).not.toContain("wax");
    expect(waxed.warnings).not.toContain("teeth");
    const [before] = plain.trueness!;
    const [after] = waxed.trueness!;
    expect(after.waxed).toBeGreaterThan(0);
    expect(after.within).toBe(1);
    expect(after.points + after.waxed!).toBe(before.points);
    // The wax added material.
    const volume = (positions: Float32Array) => {
      let v = 0;
      for (let t = 0; t < positions.length; t += 9) {
        const a = new THREE.Vector3().fromArray(positions, t), b = new THREE.Vector3().fromArray(positions, t + 3), c = new THREE.Vector3().fromArray(positions, t + 6);
        v += a.dot(b.cross(c)) / 6;
      }
      return Math.abs(v);
    };
    expect(volume(waxed.parts[0].positions)).toBeGreaterThan(volume(plain.parts[0].positions) + 50);
  }, 120000);
});

/** A made-up arch, as in articulator78: a U-shaped sheet of "teeth" (bumps along the U, front at -y) to a ragged edge. */
function syntheticArch() {
  const nx = 120, ny = 60, sx = 60, sy = 30;
  const notch = (u: number, v: number) => Math.max(0.32 - u, u - 0.68, 0.45 - v);
  const z = (i: number, j: number) => {
    const u = i / nx, v = j / ny;
    const edge = Math.min(u, 1 - u, v, 1 - v, Math.max(0, notch(u, v)));
    const plateau = Math.min(1, edge * 8);
    const teeth = 1.5 * Math.max(0, Math.sin(u * Math.PI * 14)) * Math.max(0, Math.sin(v * Math.PI * 2));
    const ragged = 3 + 2 * Math.sin(i * 0.7) * Math.cos(j * 0.9);
    return plateau * (12 + teeth) - (1 - plateau) * ragged;
  };
  const p = (i: number, j: number) => [(i / nx - 0.5) * sx, (j / ny - 0.5) * sy, z(i, j)];
  const out: number[] = [];
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    if (notch((i + 0.5) / nx, (j + 0.5) / ny) < 0) continue;
    const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
    out.push(...a, ...c, ...b, ...a, ...d, ...c);
  }
  return Float32Array.from(out);
}
