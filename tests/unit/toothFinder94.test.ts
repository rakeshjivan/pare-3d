import { describe, expect, it } from "vitest";
import { readWeights, ToothNet } from "@/lib/toothNet";
import { classNumber, cleanRegions, liveNeighbours, numberTeeth, transferLabels, toothColour } from "@/lib/toothSegment";
import { archOrder } from "@/components/workplane/WaxupCard";
import { fdiKind, fdiNumber } from "@/lib/dentalWaxup";

/* Build 94: the tooth finder's parts that do not need its (separate) weights. */

const rand = (seed: number) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

describe("tooth finder neighbours", () => {
  it("finds the same k nearest as brute force", () => {
    const r = rand(7);
    const n = 3000;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) { const a = r() * Math.PI * 2; p[i * 3] = Math.cos(a) * (0.5 + 0.1 * r()); p[i * 3 + 1] = Math.sin(a) * 0.6; p[i * 3 + 2] = 0.1 * r(); }
    const q = p.subarray(0, 300 * 3);
    const idx = liveNeighbours().nearest(p, q, 8, "attend");
    for (let i = 0; i < 300; i += 1) {
      const d = Array.from({ length: n }, (_, j) => [Math.hypot(p[j * 3] - q[i * 3], p[j * 3 + 1] - q[i * 3 + 1], p[j * 3 + 2] - q[i * 3 + 2]), j]).sort((a, b) => a[0] - b[0]);
      const want = d.slice(0, 8).map((x) => x[1]);
      // Same set (ties aside: compare distances).
      const got = Array.from(idx.subarray(i * 8, i * 8 + 8));
      expect(got[0]).toBe(i);
      const dist = (j: number) => Math.hypot(p[j * 3] - q[i * 3], p[j * 3 + 1] - q[i * 3 + 1], p[j * 3 + 2] - q[i * 3 + 2]);
      expect(dist(got[7])).toBeCloseTo(dist(want[7]), 6);
    }
  });
  it("samples furthest points from the first", () => {
    const p = Float32Array.from([0, 0, 0, 1, 0, 0, 10, 0, 0, 5, 0, 0, 9, 0, 0]);
    expect(Array.from(liveNeighbours().sample(1, p, 5, 3))).toEqual([0, 2, 3]);
  });
  it("weights three neighbours by inverse distance", () => {
    const p = Float32Array.from([0, 0, 0, 2, 0, 0, 0, 4, 0, 9, 9, 9]);
    const { idx, w } = liveNeighbours().three(p, Float32Array.from([1, 0, 0]));
    expect(Array.from(idx).sort()).toEqual([0, 1, 2]);
    expect(w[0] + w[1] + w[2]).toBeCloseTo(1, 6);
  });
});

describe("numbering the teeth", () => {
  // Eight teeth a side round a U, network votes given.
  const arch = (votes: number[][]) => votes.map((v, k) => {
    const side = k < votes.length / 2 ? -1 : 1, i = side < 0 ? votes.length / 2 - 1 - k : k - votes.length / 2;
    const a = side * (0.15 + i * 0.25);
    const centre: [number, number, number] = [Math.sin(a) * 25, -Math.cos(a) * 25 + 10, 0];
    const votesArr = new Float64Array(9); v.forEach((n) => { votesArr[n] += 1; });
    return { centre, votes: votesArr, area: i >= 5 ? 220 : 100 };
  });
  it("numbers out from the midline, upper right at +x", () => {
    const teeth = arch([[7], [6], [5], [4], [3], [2], [1], [1], [2], [3], [4], [5], [6], [7]]);
    const out = numberTeeth(teeth, "upper");
    // +x side (second half) is the upper right: 11..17.
    expect(out.slice(7).map((o) => o.fdi)).toEqual([11, 12, 13, 14, 15, 16, 17]);
    expect(out.slice(0, 7).map((o) => o.fdi)).toEqual([27, 26, 25, 24, 23, 22, 21]);
  });
  it("puts a repeated number right by its place", () => {
    // The network calls two neighbours 5 on the lower left.
    const teeth = arch([[6], [5], [5], [4], [3], [2], [1], [1], [2], [3], [4], [5], [6], [7]]);
    const out = numberTeeth(teeth, "lower");
    const left = out.slice(7).map((o) => o.fdi);
    expect(new Set(left).size).toBe(left.length);
    for (let k = 1; k < left.length; k += 1) expect(left[k]).toBeGreaterThan(left[k - 1]);
    expect(Math.floor(left[0] / 10)).toBe(3);
  });
});

describe("cleaning the network's labels", () => {
  it("joins a small island to what surrounds it", () => {
    // A strip of 20 triangles: 0-9 class 1, 10-19 class 2, with triangle 4 wrongly class 3.
    const count = 20, classes = 19;
    const prob = new Float32Array(count * classes);
    for (let t = 0; t < count; t += 1) prob[t * classes + (t === 4 ? 3 : t < 10 ? 1 : 2)] = 1;
    const nb = Array.from({ length: count }, (_, t) => [t - 1, t + 1].filter((o) => o >= 0 && o < count).map((o) => [o, 1] as [number, number]));
    const areas = new Float32Array(count).fill(2);
    const { region, regions } = cleanRegions(prob, classes, count, areas, nb);
    expect(regions).toBe(2);
    expect(region[4]).toBe(region[0]);
  });
  it("maps classes to tooth numbers", () => {
    expect([0, 1, 8, 9, 16, 17].map(classNumber)).toEqual([0, 1, 8, 1, 8, 0]);
  });
});

describe("tooth finder helpers", () => {
  it("carries labels to another tiling of the surface", () => {
    const from = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 0, 0, 6, 0, 0, 5, 1, 0]);
    const out = transferLabels(from, Uint8Array.from([11, 21]), Float32Array.from([5.1, 0, 0, 5.9, 0, 0, 5.1, 0.9, 0]));
    expect(Array.from(out)).toEqual([21]);
  });
  it("orders chips round the arch and colours teeth apart", () => {
    expect([21, 11, 12, 22].sort((a, b) => archOrder(a) - archOrder(b))).toEqual([12, 11, 21, 22]);
    expect(toothColour(11)).not.toEqual(toothColour(21));
  });
  it("refuses a file that is not a weights file", () => {
    expect(() => readWeights(new Uint8Array([1, 2, 3, 4, 0, 0, 0, 0]).buffer)).toThrow();
  });
  it("runs a tiny network of the same shape", () => {
    // A network with every weight small: the run must give probabilities that sum to one.
    const r = rand(3);
    const shapes: Record<string, number[]> = {};
    const PL = [32, 64, 128, 256, 512];
    const lin = (name: string, o: number, i: number, bias = true) => { shapes[`${name}.w`] = [o, i]; if (bias) shapes[`${name}.b`] = [o]; };
    const bn = (name: string, c: number) => { shapes[`${name}.s`] = [c]; shapes[`${name}.t`] = [c]; };
    const block = (name: string, c: number) => {
      lin(`${name}.linear1`, c, c, false); bn(`${name}.bn1`, c); bn(`${name}.bn2`, c); lin(`${name}.linear3`, c, c, false); bn(`${name}.bn3`, c);
      const tr = `${name}.transformer`;
      lin(`${tr}.linear_q`, c, c); lin(`${tr}.linear_k`, c, c); lin(`${tr}.linear_v`, c, c);
      lin(`${tr}.linear_p.0`, 3, 3); bn(`${tr}.linear_p.1`, 3); lin(`${tr}.linear_p.3`, c, 3);
      bn(`${tr}.linear_w.0`, c); lin(`${tr}.linear_w.2`, c / 8, c); bn(`${tr}.linear_w.3`, c / 8); lin(`${tr}.linear_w.5`, c / 8, c / 8);
    };
    const blocks = [1, 2, 2, 2, 2];
    let cin = 6;
    PL.forEach((c, l) => {
      lin(`enc${l + 1}.0.linear`, c, l ? cin + 3 : cin, false); bn(`enc${l + 1}.0.bn`, c);
      for (let b = 1; b <= blocks[l]; b += 1) block(`enc${l + 1}.${b}`, c);
      cin = c;
    });
    lin("dec5.0.linear2.0", 512, 512); lin("dec5.0.linear1.0", 512, 1024); bn("dec5.0.linear1.1", 512); block("dec5.1", 512);
    for (let l = 3; l >= 0; l -= 1) { const c = PL[l]; lin(`dec${l + 1}.0.linear1.0`, c, c); bn(`dec${l + 1}.0.linear1.1`, c); lin(`dec${l + 1}.0.linear2.0`, c, PL[l + 1]); bn(`dec${l + 1}.0.linear2.1`, c); block(`dec${l + 1}.1`, c); }
    lin("cls.0", 32, 32); bn("cls.1", 32); lin("cls.3", 19, 32);
    const tensors = new Map<string, { data: Float32Array; shape: number[] }>();
    for (const [name, shape] of Object.entries(shapes)) {
      const data = new Float32Array(shape.reduce((a, b) => a * b, 1));
      for (let i = 0; i < data.length; i += 1) data[i] = name.endsWith(".s") ? 1 : (r() - 0.5) * 0.1;
      tensors.set(name, { data, shape });
    }
    const net = new ToothNet({ meta: {}, tensors });
    const n = 1024;
    const input = new Float32Array(n * 6);
    for (let i = 0; i < input.length; i += 1) input[i] = r() - 0.5;
    const prob = net.run(input, n, liveNeighbours());
    expect(prob.length).toBe(n * 19);
    let sum = 0;
    for (let j = 0; j < 19; j += 1) sum += prob[j];
    expect(sum).toBeCloseTo(1, 5);
  });
});

describe("fitting to the teeth found", () => {
  it("reads kind and side back from an FDI number", () => {
    for (const arch of ["upper", "lower"] as const) for (const q of arch === "upper" ? [1, 2] : [3, 4]) for (let n = 1; n <= 8; n += 1) {
      const { kind, side } = fdiKind(q * 10 + n, arch);
      expect(fdiNumber(kind, side, arch)).toBe(q * 10 + n);
    }
  });
});

describe("tooth sets the right way up", () => {
  it("every shipped set has its incisors' wide incisal third at the top (the edge), both arches", async () => {
    const { readFileSync } = await import("node:fs");
    const { librarySet } = await import("@/lib/dentalWaxup");
    const { decodeToothSet } = await import("@/lib/toothLibrary");
    for (const lib of ["nulty", "teethy"]) {
      const manifest = JSON.parse(readFileSync(`apps/web/public/libraries/${lib}/manifest.json`, "utf8")) as { sets: Array<{ id: string; file: string }> };
      for (const entry of manifest.sets) {
        const set = librarySet(entry.id, decodeToothSet(readFileSync(`apps/web/public/libraries/${lib}/${entry.file}`)));
        for (const t of set.teeth.filter((x) => x.kind === "central")) {
          const p = t.positions;
          let top = -Infinity, bottom = Infinity;
          for (let i = 2; i < p.length; i += 3) { top = Math.max(top, p[i]); bottom = Math.min(bottom, p[i]); }
          const h = top - bottom;
          const width = (z0: number, z1: number) => { let a = Infinity, b = -Infinity; for (let i = 0; i < p.length; i += 3) if (p[i + 2] >= z0 && p[i + 2] <= z1) { a = Math.min(a, p[i]); b = Math.max(b, p[i]); } return b - a; };
          expect(width(top - 0.3 * h, top), entry.id).toBeGreaterThan(width(bottom, bottom + 0.3 * h));
        }
      }
    }
  });
});
