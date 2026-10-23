/**
 * Fork (build 47): labels engraved on dental models - a small single-stroke font of its own, so a
 * label can be made in the worker without loading a typeface. Capitals, digits and - / . : only;
 * small letters are written as capitals.
 */
import type { ManifoldToplevel } from "manifold-3d";

type Stroke = Array<[number, number]>;

const O: Stroke = [[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]];
const P: Stroke = [[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]];

/** Strokes on a 4 x 6 grid, y up. */
const GLYPHS: Record<string, Stroke[]> = {
  A: [[[0, 0], [2, 6], [4, 0]], [[0.8, 2.4], [3.2, 2.4]]],
  B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1]]],
  D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2.2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[1, 6], [3, 6]], [[2, 6], [2, 0]], [[1, 0], [3, 0]]],
  J: [[[4, 6], [4, 1], [3, 0], [1, 0], [0, 1]]],
  K: [[[0, 0], [0, 6]], [[4, 6], [0, 2.5]], [[1.3, 3.6], [4, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [O],
  P: [P],
  Q: [O, [[2.5, 1.5], [4, 0]]],
  R: [P, [[2, 3], [4, 0]]],
  S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
  V: [[[0, 6], [2, 0], [4, 6]]],
  W: [[[0, 6], [1, 0], [2, 4], [3, 0], [4, 6]]],
  X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]],
  Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
  Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  "0": [O, [[3.5, 5], [0.5, 1]]],
  "1": [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
  "2": [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]],
  "3": [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1.5, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  "4": [[[3, 0], [3, 6], [0, 2], [4, 2]]],
  "5": [[[4, 6], [0, 6], [0, 3.5], [3, 3.5], [4, 2.5], [4, 1], [3, 0], [1, 0], [0, 1]]],
  "6": [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3.5]]],
  "7": [[[0, 6], [4, 6], [1.5, 0]]],
  "8": [[[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
  "9": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 3.5], [1, 2.5], [4, 2.5]]],
  "-": [[[1, 3], [3, 3]]],
  "/": [[[0, 0], [4, 6]]],
  ".": [[[1.9, 0], [2.1, 0]]],
  ":": [[[2, 1], [2, 1.05]], [[2, 4], [2, 4.05]]],
  " ": [],
};

const ADVANCE = 5.6;

/** The label's text as the font can write it. */
export function labelText(text: string) {
  return text.toUpperCase().split("").filter((c) => c in GLYPHS).join("").replace(/\s+/g, " ").trim();
}

/** Width of a label of this height, in mm. */
export function labelWidth(text: string, height: number) {
  const clean = labelText(text);
  return clean.length ? ((clean.length - 1) * ADVANCE + 4) * (height / 6) : 0;
}

/**
 * The label as a CrossSection, centred on the origin, `height` mm tall, reading along +x with its
 * top towards +y. Strokes are `height` x 0.14 wide with round ends.
 */
export function labelSection(runtime: ManifoldToplevel, text: string, height: number) {
  const clean = labelText(text);
  const unit = height / 6;
  const half = Math.max(0.2, height * 0.07);
  const total = labelWidth(clean, height);
  const polygons: Array<Array<[number, number]>> = [];
  const circle = (cx: number, cy: number) => {
    const ring: Array<[number, number]> = [];
    for (let k = 0; k < 12; k += 1) ring.push([cx + half * Math.cos((k / 12) * Math.PI * 2), cy + half * Math.sin((k / 12) * Math.PI * 2)]);
    polygons.push(ring);
  };
  clean.split("").forEach((char, index) => {
    const ox = index * ADVANCE * unit - total / 2;
    for (const stroke of GLYPHS[char] ?? []) {
      const points = stroke.map(([x, y]) => [ox + x * unit, (y - 3) * unit] as [number, number]);
      points.forEach(([x, y]) => circle(x, y));
      for (let k = 0; k + 1 < points.length; k += 1) {
        const [ax, ay] = points[k];
        const [bx, by] = points[k + 1];
        const length = Math.hypot(bx - ax, by - ay);
        if (length < 1e-6) continue;
        const nx = (-(by - ay) / length) * half, ny = ((bx - ax) / length) * half;
        polygons.push([[ax + nx, ay + ny], [ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny]]);
      }
    }
  });
  // Every ring the same way round, so the Positive fill rule unites them.
  const oriented = polygons.map((ring) => {
    let area = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      area += x1 * y2 - x2 * y1;
    }
    return area < 0 ? ring.slice().reverse() : ring;
  });
  return new runtime.CrossSection(oriented, "Positive");
}
