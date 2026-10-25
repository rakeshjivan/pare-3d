import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { analyseDental, looksLikeDentalScan, makeDentalStudio, pinchedEdges, type DentalStudioOptions } from "@/lib/dentalModel";
import { closeToFloor, orthoOutline } from "@/lib/dentalBase";
import { labelSection, labelText } from "@/lib/dentalLabel";
import { weld } from "@/lib/dentalMesh";
import { plyToStlBytes } from "@/lib/plyImport";
import { importedShapeFromStl } from "@/lib/stlImport";
import { cutDentalScan, trimDentalScan } from "@/lib/dentalTrim";
import { autoDentalArea } from "@/lib/dentalArea";
import { layerlingToZUp } from "@/lib/meshCoordinates";
import { dentalPreset } from "@/components/workplane/DentalStudioPanel";

/**
 * A made-up arch, no patient's: a U-shaped sheet of "teeth" (bumps along the U, the incisors in
 * front at -y) that falls away to a ragged edge, as an intraoral scan does. `teethDown` turns it
 * over like an upper arch out of the scanner; a small hole and a loose fragment come with it.
 */
function syntheticArch(options: { teethDown?: boolean; flap?: boolean; front?: number } = {}) {
  const nx = 120, ny = 60, sx = 60, sy = 30;
  const front = options.front ?? 0;
  const notch = (u: number, v: number) => Math.max(0.32 - u, u - 0.68, 0.45 - v);
  const z = (i: number, j: number) => {
    const u = i / nx, v = j / ny;
    const edge = Math.min(u, 1 - u, v, 1 - v, Math.max(0, notch(u, v)));
    const plateau = Math.min(1, edge * 8);
    const teeth = 1.5 * Math.max(0, Math.sin(u * Math.PI * 14)) * Math.max(0, Math.sin(v * Math.PI * 2));
    const ragged = 3 + 2 * Math.sin(i * 0.7) * Math.cos(j * 0.9);
    return plateau * (12 + teeth) - (1 - plateau) * ragged;
  };
  // Front at -y: the closed end of the U is at small v.
  const p = (i: number, j: number) => [(i / nx - 0.5) * sx, (j / ny - 0.5) * sy + front, z(i, j)];
  const out: number[] = [];
  const hole = (i: number, j: number) => i >= 20 && i < 22 && j >= 6 && j < 8;
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    if (notch((i + 0.5) / nx, (j + 0.5) / ny) < 0 || hole(i, j)) continue;
    const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
    out.push(...a, ...c, ...b, ...a, ...d, ...c);
  }
  if (options.flap) {
    // A cheek flap folded back under the front edge: a strip that hangs below the margin.
    for (let i = 10; i < 110; i += 1) {
      const x0 = (i / nx - 0.5) * sx, x1 = ((i + 1) / nx - 0.5) * sx, y0 = -sy / 2 + front;
      const a = [x0, y0, z(i, 0)], b = [x1, y0, z(i + 1, 0)], c = [x1, y0 + 3, -6], d = [x0, y0 + 3, -6];
      out.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  if (options.teethDown) {
    for (let t = 0; t < out.length; t += 9) {
      for (let k = 2; k < 9; k += 3) out[t + k] = -out[t + k];
      for (let k = 0; k < 3; k += 1) { const swap = out[t + 3 + k]; out[t + 3 + k] = out[t + 6 + k]; out[t + 6 + k] = swap; }
    }
  }
  out.push(80, 0, 0, 81, 0, 0, 80, 1, 0);
  return Float32Array.from(out);
}

const base: DentalStudioOptions = { keep: null, base: 4, baseStyle: "follow", inside: "solid", wall: 2, hinge: false, layout: "print", label: "" };

function closedVolume(runtime: ManifoldToplevel, positions: Float32Array) {
  const mesh = new runtime.Mesh({ numProp: 3, vertProperties: positions, triVerts: Uint32Array.from({ length: positions.length / 3 }, (_, k) => k) });
  mesh.merge();
  const solid = new runtime.Manifold(mesh);
  const result = { status: solid.status(), volume: solid.volume() };
  solid.delete();
  return result;
}

describe("Dental Studio (build 47)", () => {
  let runtime: ManifoldToplevel;
  beforeAll(async () => {
    runtime = await manifoldModule();
    runtime.setup();
  });

  it("recognises a raw scan and not a few triangles", () => {
    expect(looksLikeDentalScan(syntheticArch())).toBe(true);
    expect(looksLikeDentalScan(syntheticArch().slice(0, 900))).toBe(false);
  });

  it("cleans one arch, turns it teeth up and reports how deep the scan goes", () => {
    const analysis = analyseDental({ arches: [{ id: "a", positions: syntheticArch({ teethDown: true }) }] });
    expect(analysis.pair).toBeNull();
    const arch = analysis.arches[0];
    expect(arch.report.holesFilled).toBe(1);
    expect(arch.report.fragmentsRemoved).toBe(1);
    expect(arch.depth).toBeGreaterThan(12);
    expect(arch.depth).toBeLessThan(25);
  });

  it("makes a closed solid model with all of the scan, the floor at z = 0", async () => {
    const input = { arches: [{ id: "a", positions: syntheticArch({ teethDown: true }) }] };
    const result = await makeDentalStudio(input, base, runtime as never);
    const part = result.parts[0];
    const closed = closedVolume(runtime, part.positions);
    expect(closed.status).toBe("NoError");
    expect(closed.volume).toBeCloseTo(part.volume, 0);
    expect(pinchedEdges(part.positions)).toBe(0);
    let minZ = Infinity;
    for (let i = 2; i < part.positions.length; i += 3) minZ = Math.min(minZ, part.positions[i]);
    expect(minZ).toBeCloseTo(0, 4);
    expect(result.keptDepth[0]).toBeGreaterThan(analyseDental(input).arches[0].depth - 0.5);
  }, 60_000);

  it("wears back a folded flap instead of cutting the whole edge", () => {
    const m = weld(syntheticArch({ flap: true }));
    const closed = closeToFloor(m, -12);
    expect(closed.worn).toBeGreaterThan(50);
    expect(closed.worn).toBeLessThan(2000);
  });

  it("hollows open underneath, or closed with vents", async () => {
    const input = { arches: [{ id: "a", positions: syntheticArch({ teethDown: true }) }] };
    const solid = await makeDentalStudio(input, base, runtime as never);
    const open = await makeDentalStudio(input, { ...base, inside: "open" }, runtime as never);
    const closed = await makeDentalStudio(input, { ...base, inside: "closed" }, runtime as never);
    expect(open.parts[0].volume).toBeLessThan(solid.parts[0].volume * 0.85);
    expect(closed.parts[0].volume).toBeLessThan(solid.parts[0].volume * 0.95);
    expect(closed.parts[0].volume).toBeGreaterThan(open.parts[0].volume);
    for (const result of [open, closed]) {
      expect(closedVolume(runtime, result.parts[0].positions).status).toBe("NoError");
      expect(pinchedEdges(result.parts[0].positions)).toBe(0);
    }
    expect(closed.warnings).not.toContain("vents");
  }, 60_000);

  it("trims an orthodontic base and engraves its label", async () => {
    const input = { arches: [{ id: "a", positions: syntheticArch({ teethDown: true }) }] };
    const plain = await makeDentalStudio(input, { ...base, baseStyle: "ortho", base: 8 }, runtime as never);
    const labelled = await makeDentalStudio(input, { ...base, baseStyle: "ortho", base: 8, label: "ab 12" }, runtime as never);
    expect(closedVolume(runtime, labelled.parts[0].positions).status).toBe("NoError");
    expect(labelled.warnings).not.toContain("label");
    // Engraving takes a little away.
    expect(labelled.parts[0].volume).toBeLessThan(plain.parts[0].volume - 1);
    expect(labelled.parts[0].volume).toBeGreaterThan(plain.parts[0].volume - 60);
  }, 60_000);

  it("draws the orthodontic outlines: square back, pointed upper front, rounded lower front", () => {
    const teeth: Array<[number, number]> = [];
    for (let a = 0; a <= Math.PI; a += 0.05) teeth.push([25 * Math.cos(a), -20 * Math.sin(a) + 5]);
    const upper = orthoOutline(teeth, "upper");
    const lower = orthoOutline(teeth, "lower");
    const back = (poly: Array<[number, number]>) => Math.max(...poly.map(([, y]) => y));
    expect(back(upper)).toBeCloseTo(back(lower), 6);
    // Every tooth point at least 3 mm inside both outlines' bounding boxes.
    for (const poly of [upper, lower]) {
      const minX = Math.min(...poly.map(([x]) => x)), maxX = Math.max(...poly.map(([x]) => x));
      expect(minX).toBeLessThan(-25 - 2.9);
      expect(maxX).toBeGreaterThan(25 + 2.9);
    }
    // The upper ends in a point on the midline; the lower is rounded with many sides.
    expect(upper.length).toBeLessThan(lower.length);
  });

  it("puts a pair in occlusion, tells upper from lower by the overjet, and adds a printable hinge", async () => {
    const upper = syntheticArch({ teethDown: true, front: -2 });
    const lower = syntheticArch();
    // Lower teeth up below the upper's, touching.
    for (let i = 2; i < lower.length; i += 3) lower[i] -= 26.6;
    const input = { arches: [{ id: "x", positions: lower }, { id: "y", positions: upper }] };
    const analysis = analyseDental(input);
    expect(analysis.pair?.inOcclusion).toBe(true);
    expect(analysis.arches.find((a) => a.id === "y")?.role).toBe("upper");
    const result = await makeDentalStudio(input, { ...base, hinge: true, layout: "print" }, runtime as never);
    expect(result.parts.length).toBe(2);
    for (const part of result.parts) {
      expect(closedVolume(runtime, part.positions).status).toBe("NoError");
      expect(pinchedEdges(part.positions)).toBe(0);
    }
    // Both stand on the plate, side by side.
    const box = (p: Float32Array) => {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity;
      for (let i = 0; i < p.length; i += 3) { minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]); minZ = Math.min(minZ, p[i + 2]); }
      return { minX, maxX, minZ };
    };
    const [a, b] = result.parts.map((part) => box(part.positions));
    expect(a.minZ).toBeCloseTo(0, 3);
    expect(b.minZ).toBeCloseTo(0, 3);
    expect(Math.max(a.minX, b.minX)).toBeGreaterThan(Math.min(a.maxX, b.maxX));
  }, 60_000);

  it("starts each preset from the settings the evidence points to", () => {
    expect(dentalPreset("study", 16, false)).toMatchObject({ inside: "open", baseStyle: "clean", keep: null });
    const aligner = dentalPreset("aligner", 16, false);
    expect(aligner.inside).toBe("solid");
    expect(aligner.keep! + aligner.base).toBeGreaterThanOrEqual(15);
    expect(aligner.keep! + aligner.base).toBeLessThanOrEqual(20);
    expect(dentalPreset("crown", 16, false)).toMatchObject({ inside: "solid", baseStyle: "plate" });
    expect(dentalPreset("ortho", 16, true)).toMatchObject({ baseStyle: "ortho", inside: "solid", layout: "occlusion", base: 8 });
  });

  it("writes labels in its own font", () => {
    expect(labelText("Bonnie ünd 23/10")).toBe("BONNIE ND 23/10");
    const section = labelSection(runtime as never, "U 12", 4);
    expect(section.area()).toBeGreaterThan(5);
    section.delete();
  });

  it("reads a PLY file's triangles as an STL", () => {
    const ply = "ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nelement face 2\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n1 1 0\n0 1 0\n3 0 1 2\n3 0 2 3\n";
    const stl = plyToStlBytes(new TextEncoder().encode(ply).buffer as ArrayBuffer);
    const view = new DataView(stl.buffer);
    expect(view.getUint32(80, true)).toBe(2);
    expect(view.getFloat32(84 + 12 + 12, true)).toBe(1);
  });

  it("never loses tooth surface: a flap folded under the teeth goes, the teeth stay", async () => {
    const result = await makeDentalStudio({ arches: [{ id: "a", positions: syntheticArch({ flap: true }) }] }, base, runtime as never);
    expect(result.warnings).not.toContain("teeth");
    // -1: the share of the teeth's surface kept; -2: how much tooth surface was found, mm².
    expect(result.surface[0][-2]).toBeGreaterThan(300);
    expect(result.surface[0][-1]).toBeGreaterThanOrEqual(0.999);
    expect(result.surface[0][2]).toBeGreaterThanOrEqual(0.999);
  }, 60_000);

  it("keeps a short quadrant whole, teeth and all", async () => {
    // A quadrant: a straight strip of five teeth with only a few mm of gum below them.
    const out: number[] = [];
    const nx = 100, ny = 24, sx = 40, sy = 11;
    const z = (i: number, j: number) => {
      const u = i / nx, v = j / ny;
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const plateau = Math.min(1, edge * 6);
      const teeth = 1.2 * Math.max(0, Math.sin(u * Math.PI * 5)) * Math.sin(v * Math.PI);
      return plateau * (8 + teeth) - (1 - plateau) * (2 + Math.sin(i * 0.9) * Math.cos(j * 1.3));
    };
    const p = (i: number, j: number) => [(j / ny - 0.5) * sy, (i / nx - 0.5) * sx, z(i, j)];
    for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
      const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
      out.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    const quadrant = Float32Array.from(out);
    const analysis = analyseDental({ arches: [{ id: "q", positions: quadrant }] });
    expect(analysis.arches[0].partial).toBe(true);
    const result = await makeDentalStudio({ arches: [{ id: "q", positions: quadrant }] }, { ...base, inside: "open" }, runtime as never);
    expect(result.warnings).not.toContain("teeth");
    expect(result.surface[0][-2]).toBeGreaterThan(150);
    expect(result.surface[0][-1]).toBeGreaterThanOrEqual(0.999);
    expect(closedVolume(runtime, result.parts[0].positions).status).toBe("NoError");
  }, 60_000);

  it("remembers where an imported file's coordinates went, so scans keep the scanner's places", () => {
    const stl = (points: number[]) => {
      const n = points.length / 9;
      const buf = new ArrayBuffer(84 + n * 50);
      const view = new DataView(buf);
      view.setUint32(80, n, true);
      for (let t = 0; t < n; t += 1) for (let k = 0; k < 9; k += 1) view.setFloat32(84 + t * 50 + 12 + k * 4, points[t * 9 + k], true);
      return buf;
    };
    // A Z-up file far from the origin: import centres it and turns it Y-up.
    const file = [100, 50, 20, 110, 50, 20, 100, 60, 25, 104, 55, 30, 100, 50, 20, 110, 50, 20];
    const shape = importedShapeFromStl("upper.stl", stl(file));
    const mesh = shape.importedMesh!;
    expect(mesh.sourceOrigin).toBeDefined();
    expect(mesh.sourceTurned).toBe(true);
    const [ox, oy, oz] = mesh.sourceOrigin!;
    const back = layerlingToZUp([mesh.positions[0] + ox, mesh.positions[1] + oy, mesh.positions[2] + oz]);
    expect(back[0]).toBeCloseTo(100, 4);
    expect(back[1]).toBeCloseTo(50, 4);
    expect(back[2]).toBeCloseTo(20, 4);
  });

  it("trims by hand, but never the teeth (build 48)", () => {
    const arch = syntheticArch({ flap: true });
    const corners = arch.length / 3;
    const all = new Uint8Array(corners).fill(1);
    // Only the loose fragment that came with the scan goes.
    expect(trimDentalScan(arch, all, "keep").removed).toBeLessThanOrEqual(1);
    // A line round the right-hand third, to be removed: its gum goes, its teeth stay.
    const right = new Uint8Array(corners);
    for (let i = 0; i < corners; i += 1) right[i] = arch[i * 3] > 10 ? 1 : 0;
    const result = trimDentalScan(arch, right, "remove");
    expect(result.removed).toBeGreaterThan(100);
    expect(result.protectedTriangles).toBeGreaterThan(100);
    // What is kept still makes a model.
    const kept: number[] = [];
    for (let t = 0; t < result.keep.length; t += 1) if (result.keep[t]) for (let k = 0; k < 9; k += 1) kept.push(arch[t * 9 + k]);
    expect(kept.length / 9).toBe(result.keep.length - result.removed);
  });

  it("follows the gum line, keeping the teeth whole (build 48)", async () => {
    const input = { arches: [{ id: "a", positions: syntheticArch({ teethDown: true }) }] };
    const straight = await makeDentalStudio(input, base, runtime as never);
    const gum = await makeDentalStudio(input, { ...base, gum: 2, smooth: "high" }, runtime as never);
    expect(gum.warnings).not.toContain("teeth");
    expect(gum.surface[0][-1]).toBeGreaterThanOrEqual(0.999);
    expect(gum.parts[0].volume).toBeLessThanOrEqual(straight.parts[0].volume);
    expect(closedVolume(runtime, gum.parts[0].positions).status).toBe("NoError");
  }, 60_000);

  it("stands a scan on a clean base, and fills a hollow one with a honeycomb (build 49)", async () => {
    const input = { arches: [{ id: "a", positions: syntheticArch({ teethDown: true }) }] };
    const clean = await makeDentalStudio(input, { ...base, baseStyle: "clean", base: 3 }, runtime as never);
    expect(clean.warnings).not.toContain("teeth");
    expect(clean.surface[0][-1]).toBeGreaterThanOrEqual(0.999);
    expect(closedVolume(runtime, clean.parts[0].positions).status).toBe("NoError");
    const empty = await makeDentalStudio(input, { ...base, baseStyle: "clean", base: 3, inside: "closed", infill: "none" }, runtime as never);
    const honey = await makeDentalStudio(input, { ...base, baseStyle: "clean", base: 3, inside: "closed" }, runtime as never);
    expect(honey.parts[0].volume).toBeGreaterThan(empty.parts[0].volume);
    expect(honey.parts[0].volume).toBeLessThan(clean.parts[0].volume);
    expect(closedVolume(runtime, honey.parts[0].positions).status).toBe("NoError");
    // Build 50: a honeycomb in the base only lies between the two.
    const baseOnly = await makeDentalStudio(input, { ...base, baseStyle: "clean", base: 3, inside: "closed", infill: "base" }, runtime as never);
    expect(baseOnly.parts[0].volume).toBeGreaterThan(empty.parts[0].volume);
    expect(baseOnly.parts[0].volume).toBeLessThanOrEqual(honey.parts[0].volume + 1e-6);
    for (const part of [empty, honey, baseOnly].map((r) => r.parts[0])) expect(pinchedEdges(part.positions)).toBe(0);
  }, 60_000);
  it("finishes a clean base like a model builder: notches, a tie bar, an articulator plate (build 50)", async () => {
    const input = { arches: [{ id: "a", positions: syntheticArch({ teethDown: true }) }] };
    const plain = await makeDentalStudio(input, { ...base, baseStyle: "clean", base: 3, notches: false }, runtime as never);
    const notched = await makeDentalStudio(input, { ...base, baseStyle: "clean", base: 3 }, runtime as never);
    const barred = await makeDentalStudio(input, { ...base, baseStyle: "clean", base: 3, tieBar: true }, runtime as never);
    const plate = await makeDentalStudio(input, { ...base, baseStyle: "articulator", base: 8, inside: "open" }, runtime as never);
    for (const result of [plain, notched, barred, plate]) {
      expect(result.warnings).not.toContain("teeth");
      expect(result.surface[0][-1]).toBeGreaterThanOrEqual(0.999);
      expect(pinchedEdges(result.parts[0].positions)).toBe(0);
      expect(closedVolume(runtime, result.parts[0].positions).status).toBe("NoError");
    }
    // Notches take a little away; a tie bar adds a little (the U is open at the back).
    expect(notched.parts[0].volume).toBeLessThan(plain.parts[0].volume);
    expect(barred.parts[0].volume).toBeGreaterThanOrEqual(notched.parts[0].volume);
    // The articulator block is solid (never hollowed) and stands on its pockets.
    let lowest = Infinity;
    const p = plate.parts[0].positions;
    for (let k = 2; k < p.length; k += 3) lowest = Math.min(lowest, p[k]);
    expect(lowest).toBeCloseTo(0, 3);
  }, 120_000);
  it("cuts a scan exactly along a drawn line, smooth, never the teeth (build 52)", () => {
    const arch = syntheticArch();
    const corners = arch.length / 3;
    // A straight line at x = 10.3 (between grid columns): keep what lies left of it.
    const side = new Float32Array(corners);
    for (let i = 0; i < corners; i += 1) side[i] = 10.3 - arch[i * 3];
    const result = cutDentalScan(arch, side, "keep", arch);
    expect(result.positions).toBeDefined();
    const p = result.positions!;
    let maxX = -Infinity, onLine = 0;
    for (let i = 0; i < p.length; i += 3) { maxX = Math.max(maxX, p[i]); if (Math.abs(p[i] - 10.3) < 1e-4) onLine += 1; }
    // The edge is the line itself, where the teeth allow it: no ragged triangle edge beyond it on the gum.
    expect(onLine).toBeGreaterThan(20);
    // The teeth past the line stay whole.
    expect(maxX).toBeGreaterThan(10.3);
  });
  it("builds from a tooth area the person approved, cut a band of gum round it (build 53)", async () => {
    const positions = syntheticArch({ teethDown: true });
    const area = autoDentalArea(positions);
    let marked = 0;
    for (const flag of area) marked += flag;
    expect(marked).toBeGreaterThan(100);
    const input = { arches: [{ id: "a", positions, area }] };
    const made = await makeDentalStudio(input, { ...base, baseStyle: "clean", base: 3, margin: "manual", gum: 2 }, runtime as never);
    expect(made.warnings).not.toContain("teeth");
    expect(made.surface[0][-1]).toBeGreaterThanOrEqual(0.999);
    expect(pinchedEdges(made.parts[0].positions)).toBe(0);
    // A smaller area keeps less of the scan.
    const half = Uint8Array.from(area);
    for (let t = 0; t < half.length; t += 1) if (positions[t * 9] > 5) half[t] = 0;
    const less = await makeDentalStudio({ arches: [{ id: "a", positions, area: half }] }, { ...base, baseStyle: "clean", base: 3, margin: "manual", gum: 2 }, runtime as never);
    expect(less.parts[0].volume).toBeLessThan(made.parts[0].volume);
    expect(pinchedEdges(less.parts[0].positions)).toBe(0);
  }, 120_000);
});

describe("Build 55: a quadrant's front is the end that bends", () => {
  it("finds the hooked end of a J-shaped band, and nothing on a straight one", async () => {
    const { endBends } = await import("@/lib/dentalArch");
    // Laid along y: straight from y = 0 to 30 (the molars), then curving off to x = 10 by y = -10 (the incisors).
    const pts: Array<[number, number]> = [];
    for (let y = -10; y <= 30; y += 0.25) {
      const x = y < 0 ? (y * y) / 10 : 0;
      for (let w = -4; w <= 4; w += 1) pts.push([x + w, y]);
    }
    const bends = endBends(pts, -10, 30)!;
    expect(bends.low).toBeGreaterThan(bends.high);
    const straight: Array<[number, number]> = [];
    for (let y = 0; y <= 40; y += 0.25) for (let w = -4; w <= 4; w += 1) straight.push([w, y]);
    expect(endBends(straight, 0, 40)).toBeNull();
  });
});

describe("Build 58: the hinge sits on two wide bearings, fits close and stops at the bite", () => {
  let runtime: ManifoldToplevel;
  beforeAll(async () => {
    runtime = await manifoldModule();
    runtime.setup();
  });
  it("puts a bearing behind each side of a full arch and one in the middle of a quadrant", async () => {
    const { hingeParts } = await import("@/lib/dentalBase");
    const count = (solid: { decompose: () => Array<{ delete: () => void }> }) => { const parts = solid.decompose(); parts.forEach((p) => p.delete()); return parts.length; };
    const wide = hingeParts(runtime, 25, -25, 25, 20, -20);
    const narrow = hingeParts(runtime, 25, -10, 2, 20, -20);
    // Upper: a bar with its clips - one piece either way; the clips are what differ.
    const box = (solid: { boundingBox: () => { min: number[]; max: number[] } }) => solid.boundingBox();
    expect(box(wide.lower).max[0] - box(wide.lower).min[0]).toBeCloseTo(50, 0);
    expect(count(wide.upper)).toBe(1);
    // Two clips under the upper's bar on a full arch: the upper, cut level with the axle, shows two pieces.
    const slice = (solid: { slice: (z: number) => { toPolygons: () => unknown[]; delete?: () => void } }) => solid.slice(0).toPolygons().length;
    expect(slice(wide.upper as never)).toBeGreaterThanOrEqual(2);
    expect(slice(narrow.upper as never)).toBeLessThan(slice(wide.upper as never));
    // The halves never overlap: the axle turns in the clip with room all round.
    const overlap = runtime.Manifold.intersection(wide.upper, wide.lower);
    expect(overlap.volume()).toBeLessThan(0.01);
    overlap.delete();
    [wide.upper, wide.lower, narrow.upper, narrow.lower].forEach((s) => s.delete());
  });

  it("closes the clip round the axle by the chosen fit, and the stop meets in the occlusal plane", async () => {
    const { hingeParts } = await import("@/lib/dentalBase");
    const tight = hingeParts(runtime, 25, -25, 25, 20, -20, 0.15, { y: -30, x: 0 });
    const loose = hingeParts(runtime, 25, -25, 25, 20, -20, 0.3, { y: -30, x: 0 });
    // A looser fit takes more out of the clips.
    expect(loose.upper.volume()).toBeLessThan(tight.upper.volume());
    // The stop: the upper reaches down to z = 0 in front of the arch, the lower up to it.
    const at = (solid: typeof tight.upper, y: number) => {
      const piece = runtime.Manifold.intersection(solid, runtime.Manifold.cube([6, 2, 60]).translate([-3, y - 1, -30]));
      const b = piece.boundingBox();
      piece.delete();
      return b;
    };
    expect(at(tight.upper, -35).min[2]).toBeCloseTo(0, 5);
    expect(at(tight.lower, -35).max[2]).toBeCloseTo(0, 5);
    [tight.upper, tight.lower, loose.upper, loose.lower].forEach((s) => s.delete());
  });
});

describe("Build 60: protrusion path, incisal pin and guide table, opening check", () => {
  let runtime: ManifoldToplevel;
  beforeAll(async () => {
    runtime = await manifoldModule();
    runtime.setup();
  });
  /** Whether `solid` has material in a 0.4 mm cube round (x, y, z). */
  const filled = (solid: { volume: () => number }, x: number, y: number, z: number) => {
    const probe = runtime.Manifold.cube([0.4, 0.4, 0.4], true).translate([x, y, z]);
    const piece = runtime.Manifold.intersection(solid as never, probe);
    const v = piece.volume();
    piece.delete(); probe.delete();
    return v > 0.03;
  };
  it("opens the clip into a slot along the condylar path, and keeps a plain hinge a round bore", async () => {
    const { hingeParts, hingeAxleY, HINGE_PATH_LENGTH } = await import("@/lib/dentalBase");
    const plain = hingeParts(runtime, 25, -25, 25, 20, -20);
    const path = hingeParts(runtime, 25, -25, 25, 20, -20, 0.15, null, { condyle: 30 });
    const ay = hingeAxleY(25, { condyle: 30 });
    expect(path.axleY).toBeCloseTo(ay, 6);
    expect(plain.axleY).toBeCloseTo(31, 6);
    // The far end of the path, in the upper's clip: open with the path, solid without it.
    const c = -25 + 9.5;
    const ey = ay - HINGE_PATH_LENGTH * Math.cos(Math.PI / 6), ez = -HINGE_PATH_LENGTH * Math.sin(Math.PI / 6);
    expect(filled(path.upper, c, ey, ez)).toBe(false);
    expect(filled(plain.upper, c, plain.axleY - HINGE_PATH_LENGTH * Math.cos(Math.PI / 6), ez)).toBe(true);
    // Still a clip round the slot: material under it and the halves never overlap.
    expect(filled(path.upper, c, ey, ez - 2.15 - 1)).toBe(true);
    const overlap = runtime.Manifold.intersection(path.upper, path.lower);
    expect(overlap.volume()).toBeLessThan(0.01);
    overlap.delete();
    [plain.upper, plain.lower, path.upper, path.lower].forEach((s) => s.delete());
  });

  it("raises the incisal pin and slopes the guide table up towards the back", async () => {
    const { hingeParts } = await import("@/lib/dentalBase");
    const raised = hingeParts(runtime, 25, -25, 25, 20, -20, 0.15, { y: -30, x: 0 }, { pinRaise: 2 });
    const guide = hingeParts(runtime, 25, -25, 25, 20, -20, 0.15, { y: -30, x: 0 }, { table: "guide" });
    const top = (solid: typeof raised.lower, y: number) => {
      const piece = runtime.Manifold.intersection(solid, runtime.Manifold.cube([2, 0.4, 60]).translate([-1, y - 0.2, -30]));
      const b = piece.boundingBox();
      piece.delete();
      return b;
    };
    // The pin meets the table 2 mm up.
    expect(top(raised.lower, -35).max[2]).toBeCloseTo(2, 4);
    expect(top(raised.upper, -35).min[2]).toBeCloseTo(2, 4);
    // The table: level with the bite at its front edge, 30 degrees up towards the back.
    expect(top(guide.lower, -37.6).max[2]).toBeLessThan(0.5);
    expect(top(guide.lower, -32.4).max[2]).toBeGreaterThan(2.5);
    // The pin touches only at its front edge: clear of the table everywhere behind it.
    const overlap = runtime.Manifold.intersection(guide.upper, guide.lower);
    expect(overlap.volume()).toBeLessThan(0.01);
    overlap.delete();
    [raised.upper, raised.lower, guide.upper, guide.lower].forEach((s) => s.delete());
  });

  it("finds how far the hinge opens before the parts meet", async () => {
    const { hingeParts, hingeOpening } = await import("@/lib/dentalBase");
    const parts = hingeParts(runtime, 25, -25, 25, 20, -20);
    expect(hingeOpening(runtime, parts.upper, parts.lower, parts.axleY)).toBe(90);
    // A wall behind the axle on the lower, standing up into the way of the upper's back bar as it turns down.
    const wall = runtime.Manifold.cube([50, 2, 40]).translate([-25, parts.axleY + 6, -20]);
    const blocked = runtime.Manifold.union(parts.lower, wall);
    const angle = hingeOpening(runtime, parts.upper, blocked, parts.axleY);
    expect(angle).toBeGreaterThan(0);
    expect(angle).toBeLessThan(90);
    [parts.upper, parts.lower, wall, blocked].forEach((s) => s.delete());
  });
});
