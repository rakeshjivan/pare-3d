import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { analyseDental, makeDentalStudio, pinchedEdges, type DentalStudioOptions } from "@/lib/dentalModel";
import { articulatorParts, CONDYLE_RADIUS, incisalPins, PIN, PIN_BAND, PIN_CLEAR, PIN_SET, pinTipAt } from "@/lib/dentalArticulator";
import type { ArticulatorSides } from "@/lib/dentalArticulator";
import { hingeOpening } from "@/lib/dentalBase";
import { weld, toManifold } from "@/lib/dentalMesh";

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


let runtime: ManifoldToplevel;
beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
});

const base: DentalStudioOptions = { keep: null, base: 4, baseStyle: "clean", inside: "solid", wall: 2, hinge: true, layout: "occlusion", label: "" };
const heels = [{ x: -22, y: 20 }, { x: 22, y: 20 }];
const front = { x: 0, upperY: -30, lowerY: -28 };

describe("Build 78: the kinematic articulator", () => {
  it("seats the upper on exactly six points (build 79, Kelvin's layout): the pin in its cup, a ball in a groove aimed at it, a ball on a flat", () => {
    const a = articulatorParts(runtime as never, 20, -25, 25, 18, -18, front, 0, { upper: heels, lower: heels });
    expect(runtime.Manifold.intersection(a.upper, a.lower).volume()).toBe(0);
    // Grown by 10 microns, each ball meets its seat: two points in the groove, one on the flat.
    const contactsOf = (c: number) => runtime.Manifold.intersection(a.upper, runtime.Manifold.sphere(CONDYLE_RADIUS + 0.01, 96).translate([c, a.axleY, 0])).decompose().length;
    expect(contactsOf(a.centres[0])).toBe(2);
    expect(contactsOf(a.centres[1])).toBe(1);
    // The pin's tip, grown the same, meets the cup all round (one ring) and nothing else.
    const [tipY, tipZ] = pinTipAt(0, a.axleY, a.pinY);
    expect(tipY).toBeCloseTo(a.pinY, 6);
    expect(tipZ).toBeCloseTo(0, 6);
    const tip = runtime.Manifold.intersection(a.upper, runtime.Manifold.sphere(PIN.tip + 0.01, 64).translate([front.x, tipY, tipZ]));
    expect(tip.decompose().length).toBe(1);
    expect(tip.boundingBox().min[2]).toBeGreaterThan(0.5);
    // As wide apart as the models allow.
    expect(a.centres[1] - a.centres[0]).toBeGreaterThan(25);
  });

  it("keeps the upper on: lifted, it meets the keepers; closed, they never touch (build 78)", () => {
    const a = articulatorParts(runtime as never, 20, -25, 25, 18, -18, front, 0, { upper: heels, lower: heels });
    // Closed, a ball grown by a quarter of a millimetre still touches only the seat faces above it.
    const balls = (grow: number) => runtime.Manifold.union(a.centres.map((c) => runtime.Manifold.sphere(CONDYLE_RADIUS + grow, 96).translate([c, a.axleY, 0])));
    const hit = runtime.Manifold.intersection(a.upper, balls(0.25));
    expect(hit.boundingBox().min[2]).toBeGreaterThan(0);
    // Lifted straight up by 0.6 mm, the keepers catch the balls.
    expect(runtime.Manifold.intersection(a.upper.translate([0, 0, 0.6]), a.lower).volume()).toBeGreaterThan(0);
    expect(runtime.Manifold.intersection(a.upper.translate([0, 0, 0.2]), a.lower).volume()).toBeLessThan(1e-9);
  });

  it("opens 90 degrees about the condyles", () => {
    const a = articulatorParts(runtime as never, 20, -25, 25, 18, -18, front, 0, { upper: heels, lower: heels });
    expect(hingeOpening(runtime as never, a.upper, a.lower, a.axleY, 90, 0)).toBe(90);
  });

  it("stands the pin and its cup clear of proclined incisors that overhang the base (build 79)", () => {
    // Teeth 5 mm in front of the bases across the pin's band.
    const flared = { ...front, teethY: front.upperY - 5 };
    const a = articulatorParts(runtime as never, 20, -25, 25, 18, -18, flared, 0, { upper: heels, lower: heels });
    // The cup's block (5 mm each side of the pin) and the boss behind the pin stand PIN_CLEAR in front of the teeth.
    expect(PIN_BAND).toBeGreaterThan(5);
    expect(a.pinY + PIN.foot + 1).toBeLessThanOrEqual(flared.teethY - PIN_CLEAR + 1e-9);
    const cupBack = a.pinY + 5;
    expect(cupBack).toBeLessThanOrEqual(flared.teethY - PIN_CLEAR + 1e-9);
  });

  it("with posts either side (build 79): a hinge on the condyles, and each post's tip on its pad at every opening", () => {
    const sides: ArticulatorSides = { y: -18, posts: [-32, 32], bases: { upper: [-24, 24], lower: [-24, 24] } };
    for (const raise of [0, 3, 6]) {
      const a = articulatorParts(runtime as never, 20, -25, 25, 18, -18, { ...front, sides }, raise, { upper: heels, lower: heels });
      if (raise === 0) {
        // Closed: the condyles hold it as a hinge - three points on one ball, two on the other.
        const contactsOf = (c: number) => runtime.Manifold.intersection(a.upper, runtime.Manifold.sphere(CONDYLE_RADIUS + 0.01, 96).translate([c, a.axleY, 0])).decompose().length;
        expect([contactsOf(a.centres[0]), contactsOf(a.centres[1])]).toEqual([3, 2]);
        // Nothing in front of the incisors.
        expect(runtime.Manifold.intersection(a.upper, runtime.Manifold.cube([30, 20, 60]).translate([-15, front.upperY - 20, -30])).isEmpty()).toBe(true);
        expect(runtime.Manifold.intersection(a.lower, runtime.Manifold.cube([30, 20, 60]).translate([-15, front.lowerY - 20, -30])).isEmpty()).toBe(true);
      }
      const turned = (down: number) => a.upper.translate([0, -a.axleY, 0]).rotate([-a.rest, 0, 0]).translate([0, a.axleY, -down]);
      expect(runtime.Manifold.intersection(turned(0), a.lower).volume()).toBeLessThan(1e-9);
      // Lowered a hair, both posts meet their pads (two touches, one each side).
      // (the seats meet the balls too - those are behind, at the axis).
      const touches = runtime.Manifold.intersection(turned(0.02), a.lower).decompose().filter((t) => t.boundingBox().max[1] < a.axleY - 12);
      expect(touches.length).toBe(2);
      expect(touches.map((t) => Math.sign(t.boundingBox().min[0])).sort()).toEqual([-1, 1]);
    }
  });

  it("closes on the fused pin exactly at each opening: the tip in the cup, turned open about the condyles", () => {
    for (const raise of [0, 3, 6]) {
      const a = articulatorParts(runtime as never, 20, -25, 25, 18, -18, front, raise, null);
      const turned = (down: number) => a.upper.translate([0, -a.axleY, 0]).rotate([-a.rest, 0, 0]).translate([0, a.axleY, -down]);
      expect(runtime.Manifold.intersection(turned(0), a.lower).volume()).toBeLessThan(1e-9);
      expect(runtime.Manifold.intersection(turned(0.02), a.lower).volume()).toBeGreaterThan(0);
    }
  });

  it("seats each removable pin on three domes by three grooves, exactly where the fused pin stands", () => {
    for (const raise of [0, 3, 6]) {
      const a = articulatorParts(runtime as never, 20, -25, 25, 18, -18, front, raise, null, "set");
      const fused = articulatorParts(runtime as never, 20, -25, 25, 18, -18, front, raise, null, "fused");
      // The pin as printed (on its disc, at the origin), put back on its boss.
      const pin = incisalPins(runtime as never, [raise], a.axleY, a.pinY, a.bossTop).translate([front.x, a.pinY, a.bossTop + PIN.discClear]);
      const meets = (down: number) => runtime.Manifold.intersection(a.lower, pin.translate([0, 0, -down])).volume();
      expect(meets(0)).toBeLessThan(1e-9);
      expect(meets(0.02)).toBeGreaterThan(0);
      // Raised by 30 microns (the domes are facetted to about that), they meet the grooves at six points and nothing else.
      const domes = runtime.Manifold.intersection(a.lower.translate([0, 0, 0.03]), pin);
      expect(domes.decompose().length).toBe(6);
      // Its tip stands where the fused pin's does: the upper, turned open, rests on it.
      const turned = a.upper.translate([0, -a.axleY, 0]).rotate([-a.rest, 0, 0]).translate([0, a.axleY, 0]);
      expect(runtime.Manifold.intersection(turned, pin).volume()).toBeLessThan(1e-9);
      expect(runtime.Manifold.intersection(turned.translate([0, 0, -0.02]), pin).volume()).toBeGreaterThan(0);
      expect(fused.bossTop).toBeCloseTo(a.bossTop, 9);
    }
  });

  it("makes a pair whose teeth come through untouched, with the pin set and what each pin does", async () => {
    const upper = syntheticArch({ teethDown: true, front: -2 });
    const lower = syntheticArch();
    for (let i = 2; i < lower.length; i += 3) lower[i] -= 26.6;
    const result = await makeDentalStudio({ arches: [{ id: "x", positions: lower }, { id: "y", positions: upper }] }, { ...base, pinStyle: "set" }, runtime as never);
    expect(result.parts.length).toBe(2);
    for (const part of result.parts) expect(pinchedEdges(part.positions)).toBe(0);
    expect(result.pieces).toEqual([1, 1]);
    expect(result.opening).toBe(90);
    // Every crown point is where the scan put it.
    expect(result.trueness?.length).toBe(2);
    for (const part of result.trueness!) {
      expect(part.points).toBeGreaterThan(500);
      expect(part.within).toBe(1);
    }
    // The pins: 0 to 6 mm, printable as one closed part; each opens the front more than the back.
    expect(result.pins?.raises).toEqual([...PIN_SET]);
    expect(toManifold(runtime as never, weld(result.pins!.positions)).status()).toBe("NoError");
    const table = result.pinTable!;
    expect(table[0]).toEqual({ pin: 0, front: 0, back: 0 });
    for (let i = 1; i < table.length; i += 1) {
      expect(table[i].front).toBeGreaterThan(table[i - 1].front);
      expect(table[i].front).toBeLessThan(table[i].pin);
      expect(table[i].back).toBeLessThan(table[i].front);
    }
  }, 120_000);

  it("keeps the scanner's bite when the arches come in occlusion, and fits it only when asked", () => {
    const upper = syntheticArch({ teethDown: true, front: -2 });
    const lower = syntheticArch();
    for (let i = 2; i < lower.length; i += 3) lower[i] -= 26.6;
    // The bite scan: both arches' outer faces as the scanner saw them, moved 0.3 mm off.
    const bite = Float32Array.from([...upper, ...lower].map((v, i) => (i % 3 === 0 ? v + 0.3 : v)));
    const input = { arches: [{ id: "x", positions: lower }, { id: "y", positions: upper }], bite };
    const kept = analyseDental(input).pair?.bite;
    expect(kept?.kept).toBe(true);
    expect(kept?.fitted).toBe(false);
    expect(kept?.fit).toBeUndefined();
    const fitted = analyseDental({ ...input, biteMode: "fit" }).pair?.bite;
    expect(fitted?.kept).toBeUndefined();
    expect(fitted?.fitted).toBe(true);
  }, 60_000);

  it("checks each of two bite scans on its own, and lines up on both together (build 79)", () => {
    const upper = syntheticArch({ teethDown: true, front: -2 });
    const lower = syntheticArch();
    for (let i = 2; i < lower.length; i += 3) lower[i] -= 26.6;
    const whole = [...upper, ...lower];
    // Two bite scans: the left and right halves of the arches' outer faces, as the scanner saw them.
    const half = (left: boolean, shift: number) => {
      const out: number[] = [];
      for (let t = 0; t < whole.length; t += 9) if ((whole[t] < 0) === left) for (let k = 0; k < 9; k += 1) out.push(k % 3 === 0 ? whole[t + k] + shift : whole[t + k]);
      return Float32Array.from(out);
    };
    const arches = [{ id: "x", positions: lower }, { id: "y", positions: upper }];
    const good = analyseDental({ arches, bite: half(true, 0.05), bite2: half(false, 0.05) }).pair?.bite;
    expect(good?.kept).toBe(true);
    expect(good?.scans).toBe(2);
    expect(good!.rms).toBeLessThan(0.15);
    // One side 0.4 mm off: seen, though the other side agrees.
    const oneOff = analyseDental({ arches, bite: half(true, 0.05), bite2: half(false, 0.4) }).pair?.bite;
    expect(oneOff!.rms).toBeGreaterThan(0.2);
    expect(oneOff!.rms).toBeGreaterThan(2 * good!.rms);
    const fitted = analyseDental({ arches, bite: half(true, 0.3), bite2: half(false, 0.3), biteMode: "fit" }).pair?.bite;
    expect(fitted?.fitted).toBe(true);
  }, 120_000);
});
