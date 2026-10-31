import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { vertexNormals } from "@/lib/dentalArch";
import { transformSoup, weld } from "@/lib/dentalMesh";
import { fdiKind, librarySet, MIN_WAX, placeOnMarks, type ToothMarks } from "@/lib/dentalWaxup";

/** Made-up egg-shaped teeth (no library's or patient's), facing -y, edge at z = 0 (as dentalWaxup79's). */
function tooth(width: number, height: number) {
  const geometry = new THREE.SphereGeometry(1, 48, 36).toNonIndexed();
  const p = geometry.getAttribute("position").array as Float32Array;
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const up = p[i + 1];
    const depth = 3.5 - 1.5 * (up + 1) / 2;
    out[i] = (p[i] * width) / 2;
    out[i + 1] = -p[i + 2] * depth;
    out[i + 2] = (up * height) / 2 - height / 2;
  }
  return out;
}

/** Canine to canine along an arc about (0, 20): each tooth's soup and its move, and its width and height. */
function arch(scale: number, turn = 0) {
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
      .multiply(new THREE.Matrix4().makeRotationZ(angle + (i === 3 ? turn : 0)));
    return { soup: transformSoup(tooth(width, heights[i]), m), m, width, height: heights[i] };
  });
}
const join = (parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
// Arch order -x to +x is 23 22 21 11 12 13 (upper: the patient's right on +x).
const FDI = [23, 22, 21, 11, 12, 13];

describe("Build 105: library teeth fitted to the dentist's marks", () => {
  const library = librarySet("set", arch(1).map((t) => t.soup));
  // The patient's teeth: 10% larger, 11 turned 8 degrees.
  const patient = arch(1.1, THREE.MathUtils.degToRad(8));
  const mesh = weld(join(patient.map((t) => t.soup)));
  const normals = vertexNormals(mesh);
  const marks: Record<number, ToothMarks> = {};
  patient.forEach((t, i) => {
    const fdi = FDI[i];
    const { side } = fdiKind(fdi, "upper");
    const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(t.m).toArray() as [number, number, number];
    // Mesial is towards the midline: -x locally on the +x side.
    const m = -side * t.width / 2;
    marks[fdi] = { mesial: at(m, -0.5, -t.height * 0.3), distal: at(-m, -0.5, -t.height * 0.3), cervical: at(0, -2.2, -t.height * 0.95), incisal: at(0, -0.8, 0) };
  });
  const { placed, fdis } = placeOnMarks(library, mesh, normals, marks, "upper", { blend: false, arcDepth: 0.5 });

  it("fits every marked tooth", () => {
    expect([...fdis].sort()).toEqual([...FDI].sort());
  });

  it("makes each tooth about as wide as its contacts are apart, centred between them and facing out", () => {
    placed.forEach((p, k) => {
      const i = FDI.indexOf(fdis[k]);
      const t = patient[i];
      expect(Math.abs(p.width - t.width) / t.width).toBeLessThan(0.12);
      const centre = new THREE.Vector3(0, 0, 0).applyMatrix4(t.m);
      const o = new THREE.Vector3(...p.frame.origin);
      const mesial = new THREE.Vector3(...p.frame.mesial);
      expect(Math.abs(o.clone().sub(centre).dot(mesial))).toBeLessThan(0.8);
      // Out: the patient's tooth faces -y turned by its move.
      const facing = new THREE.Vector3(0, -1, 0).transformDirection(t.m);
      expect(new THREE.Vector3(...p.frame.out).dot(facing)).toBeGreaterThan(0.9);
    });
  });

  it("follows a rotated tooth", () => {
    const k = fdis.indexOf(11);
    const facing = new THREE.Vector3(0, -1, 0).transformDirection(patient[3].m);
    expect(new THREE.Vector3(...placed[k].frame.out).dot(facing)).toBeGreaterThan(0.99);
  });

  it("covers the patient's facial surfaces with the least wax", () => {
    for (const p of placed) expect(p.clearance).not.toBeNull();
    for (const p of placed) expect(p.clearance!).toBeGreaterThan(MIN_WAX - 0.1);
  });

  it("sets the edges by smile design: centrals at the patient's, laterals 0.5 short, canines the arc step up", () => {
    const top = (k: number) => Math.max(...Array.from(placed[k].positions).filter((_, i) => i % 3 === 2));
    const c = top(fdis.indexOf(11)), l = top(fdis.indexOf(12)), cn = top(fdis.indexOf(13));
    expect(Math.abs(c - 0)).toBeLessThan(0.35);
    expect(Math.abs(c - l - 0.5)).toBeLessThan(0.35);
    expect(Math.abs(c - cn - 0.5)).toBeLessThan(0.45);
  });
});
