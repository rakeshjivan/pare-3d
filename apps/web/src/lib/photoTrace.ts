import type { ManifoldToplevel } from "manifold-3d";

/*
 * Fork (build 21): photo to outline. A photo of a tool, a template or a logo lying on plain
 * paper, taken straight from above, becomes its outline at its real size: the dark shape is
 * found (Otsu threshold), the biggest one away from the photo's edges is followed round
 * (Moore boundary tracing) and the outline simplified (Ramer-Douglas-Peucker). Scaled to the
 * length you give it, it is grown by a clearance and raised - as a cut-out (a hole, for a
 * Gridfinity bin or a foam-like tray) or as a solid (a stamp, a cookie cutter, a badge).
 */

export type TraceImage = { width: number; height: number; light: Float32Array };
export type Point = [number, number];

/** A threshold between the dark and light pixels that keeps each group as tight as it can (Otsu). */
export function otsuThreshold(light: Float32Array) {
  const bins = new Float64Array(256);
  for (const value of light) bins[Math.max(0, Math.min(255, Math.round(value * 255)))] += 1;
  const total = light.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * bins[i];
  let sumBack = 0, weightBack = 0, best = 0, threshold = 128;
  for (let i = 0; i < 256; i += 1) {
    weightBack += bins[i];
    if (!weightBack) continue;
    const weightFore = total - weightBack;
    if (!weightFore) break;
    sumBack += i * bins[i];
    const meanBack = sumBack / weightBack;
    const meanFore = (sum - sumBack) / weightFore;
    const between = weightBack * weightFore * (meanBack - meanFore) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return (threshold + 0.5) / 255;
}

/** Light values smoothed over each pixel's neighbours, to quiet paper texture and noise. */
function blur(image: TraceImage) {
  const { width, height, light } = image;
  const out = new Float32Array(light.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0, count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const px = x + dx, py = y + dy;
          if (px < 0 || py < 0 || px >= width || py >= height) continue;
          total += light[py * width + px];
          count += 1;
        }
      }
      out[y * width + x] = total / count;
    }
  }
  return out;
}

/**
 * The object's pixels: the biggest dark region that does not touch the photo's border (a dark
 * table round the paper does), or the biggest one if every region touches it.
 */
export function objectMask(image: TraceImage, options: { invert?: boolean } = {}) {
  const { width, height } = image;
  const light = blur(image);
  const threshold = otsuThreshold(light);
  // Plain paper alone still splits in two; with no real contrast there is nothing to trace.
  let lowSum = 0, lowCount = 0, highSum = 0, highCount = 0;
  for (const value of light) {
    if (value < threshold) { lowSum += value; lowCount += 1; } else { highSum += value; highCount += 1; }
  }
  if (!lowCount || !highCount || highSum / highCount - lowSum / lowCount < 0.18) return null;
  const dark = new Uint8Array(width * height);
  for (let i = 0; i < dark.length; i += 1) dark[i] = (options.invert ? light[i] > threshold : light[i] < threshold) ? 1 : 0;
  const label = new Int32Array(width * height).fill(-1);
  const regions: { size: number; border: boolean }[] = [];
  const stack: number[] = [];
  for (let start = 0; start < dark.length; start += 1) {
    if (!dark[start] || label[start] !== -1) continue;
    const id = regions.length;
    const region = { size: 0, border: false };
    regions.push(region);
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const index = stack.pop()!;
      region.size += 1;
      const x = index % width, y = (index - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) region.border = true;
      const neighbours = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, y > 0 ? index - width : -1, y < height - 1 ? index + width : -1];
      for (const next of neighbours) {
        if (next < 0 || !dark[next] || label[next] !== -1) continue;
        label[next] = id;
        stack.push(next);
      }
    }
  }
  if (!regions.length) return null;
  const inside = regions.map((region, id) => ({ ...region, id })).filter((region) => !region.border);
  const pool = inside.length ? inside : regions.map((region, id) => ({ ...region, id }));
  const best = pool.reduce((a, b) => (b.size > a.size ? b : a));
  if (best.size < 50) return null;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) mask[i] = label[i] === best.id ? 1 : 0;
  return { mask, size: best.size, threshold };
}

/** The outline round the masked region, pixel by pixel (Moore neighbour tracing). */
export function traceBoundary(mask: Uint8Array, width: number, height: number): Point[] {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  let start = -1;
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) { start = i; break; }
  if (start < 0) return [];
  const sx = start % width, sy = (start - sx) / width;
  // The eight neighbours, clockwise from west (image y runs down).
  const dirs: Point[] = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
  const indexOf = (dx: number, dy: number) => dirs.findIndex(([x, y]) => x === dx && y === dy);
  const points: Point[] = [[sx, sy]];
  let cx = sx, cy = sy;
  // Where the search round the current pixel starts: the empty pixel we came from (west of the first one).
  let bx = sx - 1, by = sy;
  for (let guard = 0; guard < mask.length * 2; guard += 1) {
    const from = indexOf(bx - cx, by - cy);
    let moved = false;
    for (let k = 1; k <= 8; k += 1) {
      const d = (from + k) % 8;
      const nx = cx + dirs[d][0], ny = cy + dirs[d][1];
      if (at(nx, ny)) {
        const prev = (d + 7) % 8;
        bx = cx + dirs[prev][0];
        by = cy + dirs[prev][1];
        cx = nx;
        cy = ny;
        moved = true;
        break;
      }
    }
    if (!moved) break;
    if (cx === sx && cy === sy) break;
    points.push([cx, cy]);
  }
  return points;
}

/** Fewer points along nearly straight runs, keeping every one that matters to within `tolerance`. */
export function simplify(points: readonly Point[], tolerance: number): Point[] {
  if (points.length < 4) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = points[a], [bx, by] = points[b];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    let worst = -1, index = -1;
    for (let i = a + 1; i < b; i += 1) {
      const [px, py] = points[i];
      const distance = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length;
      if (distance > worst) { worst = distance; index = i; }
    }
    if (worst > tolerance && index > 0) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export type TraceResult = { outline: Point[]; widthPx: number; heightPx: number; minX: number; minY: number };

/** The traced outline in pixels, or null when no clear shape was found. */
export function traceImage(image: TraceImage, options: { invert?: boolean } = {}): TraceResult | null {
  const found = objectMask(image, options);
  if (!found) return null;
  const boundary = traceBoundary(found.mask, image.width, image.height);
  if (boundary.length < 8) return null;
  // A closed loop starts and ends on the same point, which leaves the simplifier no line to measure
  // from: split it at the point farthest from the start and simplify each half.
  const tolerance = Math.max(0.8, Math.max(image.width, image.height) / 600);
  const [sx, sy] = boundary[0];
  let far = 0;
  boundary.forEach(([x, y], index) => { if (Math.hypot(x - sx, y - sy) > Math.hypot(boundary[far][0] - sx, boundary[far][1] - sy)) far = index; });
  const first = simplify(boundary.slice(0, far + 1), tolerance);
  const second = simplify([...boundary.slice(far), boundary[0]], tolerance);
  const outline = [...first.slice(0, -1), ...second.slice(0, -1)];
  if (outline.length < 3) return null;
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  return { outline, widthPx: Math.max(...xs) - minX + 1, heightPx: Math.max(...ys) - minY + 1, minX, minY };
}

export type TraceMode = "cutout" | "solid";
export type TraceOptions = { length: number; mode: TraceMode; height: number; clearance: number; invert: boolean };
export const DEFAULT_TRACE: TraceOptions = { length: 100, mode: "cutout", height: 20, clearance: 1, invert: false };

/**
 * The outline as a solid standing on the plate (x across, y up, z towards the front), its longest
 * side `length` mm, grown by the clearance - triangle positions, centred.
 */
export function tracedSolidPositions(runtime: ManifoldToplevel, trace: TraceResult, o: TraceOptions): number[] {
  const scale = o.length / Math.max(trace.widthPx, trace.heightPx);
  const cx = trace.minX + trace.widthPx / 2, cy = trace.minY + trace.heightPx / 2;
  // Image y runs down; in the plan view y runs to the back - so the photo reads the right way round from above.
  const polygon = trace.outline.map(([x, y]) => [(x - cx) * scale, (y - cy) * scale] as [number, number]);
  const created: { delete(): void }[] = [];
  try {
    const section = runtime.CrossSection.ofPolygons([polygon], "Positive");
    created.push(section);
    // The outline runs through the edge pixels' centres: half a pixel more reaches their outer edge.
    const grow = o.clearance + scale / 2;
    const grown = grow > 0 ? section.offset(grow, o.clearance > 0 ? "Round" : "Miter", 2, 32) : section;
    if (grown !== section) created.push(grown);
    const solid = runtime.Manifold.extrude(grown, Math.max(0.4, o.height));
    created.push(solid);
    const turned = solid.rotate([-90, 0, 0]);
    created.push(turned);
    const mesh = turned.getMesh();
    const positions: number[] = [];
    for (let index = 0; index < mesh.triVerts.length; index += 1) {
      const vertex = mesh.triVerts[index] * mesh.numProp;
      positions.push(mesh.vertProperties[vertex], mesh.vertProperties[vertex + 1], mesh.vertProperties[vertex + 2]);
    }
    return positions;
  } finally {
    created.forEach((entry) => entry.delete());
  }
}
