/*
 * Fork (build 55): DXF, the drawing format laser cutters, CNC routers and 2D CAD read and write.
 *
 * Import: a DXF drawing becomes an SVG of its outlines in millimetres, and the SVG import builds the
 * body from it as it does for any drawing (even-odd fill, so a circle inside a square is a hole).
 * It reads LINE, LWPOLYLINE and POLYLINE (with bulges, the arcs between points), CIRCLE, ARC,
 * ELLIPSE, SPLINE and INSERT (blocks placed in the drawing, scaled and turned). Lines and arcs that
 * meet end to end - the way most CAD programs save a cut outline - are joined into closed outlines.
 * The units come from the header ($INSUNITS); a drawing that states none is taken as millimetres.
 *
 * Export: the outlines of the SVG export (the silhouette from above, or the footprint on the
 * workplane) written as closed polylines, one layer per part, in millimetres. It is DXF R12
 * (AC1009), the version every laser, CNC and CAD program opens.
 */

type Point = [number, number];
type Polyline = { points: Point[]; closed: boolean };
type Pair = { code: number; value: string };

/** How finely arcs and curves are followed, in mm: a laser kerf is about 0.1 mm. */
const ARC_TOLERANCE = 0.01;
/** Ends closer than this (in the drawing's units, scaled to mm) are taken as one point when joining. */
const JOIN_TOLERANCE = 0.01;
const MAX_INSERT_DEPTH = 8;

const UNIT_TO_MM: Record<number, number> = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 8: 0.0000254, 9: 0.0254, 10: 914.4, 13: 0.001, 14: 100 };

export type DxfImport = { svg: string; outlines: number; open: number; skipped: string[] };

function readPairs(text: string): Pair[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const pairs: Pair[] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number.parseInt(lines[index].trim(), 10);
    if (!Number.isFinite(code)) {
      // A stray blank line shifts the pairs; step one line and try again.
      index -= 1;
      continue;
    }
    pairs.push({ code, value: lines[index + 1].trim() });
  }
  return pairs;
}

type Entity = { type: string; pairs: Pair[]; vertices?: Entity[] };

/** The entities of a run of pairs, from one "0" to the next; POLYLINE gathers its VERTEX entities. */
function entitiesOf(pairs: readonly Pair[]): Entity[] {
  const entities: Entity[] = [];
  let current: Entity | null = null;
  let polyline: Entity | null = null;
  for (const pair of pairs) {
    if (pair.code === 0) {
      if (current) {
        if (polyline && current.type === "VERTEX") polyline.vertices!.push(current);
        else entities.push(current);
      }
      if (pair.value === "SEQEND") {
        polyline = null;
        current = null;
        continue;
      }
      current = { type: pair.value, pairs: [] };
      if (pair.value === "POLYLINE") {
        current.vertices = [];
        polyline = current;
      } else if (pair.value !== "VERTEX") {
        polyline = null;
      }
      continue;
    }
    current?.pairs.push(pair);
  }
  if (current) entities.push(current);
  return entities;
}

function sections(pairs: readonly Pair[]) {
  const found = new Map<string, Pair[]>();
  for (let index = 0; index < pairs.length; index += 1) {
    if (pairs[index].code === 0 && pairs[index].value === "SECTION" && pairs[index + 1]?.code === 2) {
      const name = pairs[index + 1].value;
      const start = index + 2;
      let end = start;
      while (end < pairs.length && !(pairs[end].code === 0 && pairs[end].value === "ENDSEC")) end += 1;
      found.set(name, pairs.slice(start, end));
      index = end;
    }
  }
  return found;
}

function number(entity: Entity, code: number, fallback = 0) {
  const pair = entity.pairs.find((entry) => entry.code === code);
  const value = pair ? Number.parseFloat(pair.value) : Number.NaN;
  return Number.isFinite(value) ? value : fallback;
}

function numbers(entity: Entity, code: number) {
  return entity.pairs.filter((entry) => entry.code === code).map((entry) => Number.parseFloat(entry.value)).filter(Number.isFinite);
}

function text(entity: Entity, code: number) {
  return entity.pairs.find((entry) => entry.code === code)?.value ?? "";
}

/** Points along an arc from a to b, counter-clockwise when `ccw`. */
function arcPoints(cx: number, cy: number, r: number, from: number, to: number, ccw = true): Point[] {
  let sweep = ccw ? to - from : from - to;
  while (sweep <= 1e-12) sweep += Math.PI * 2;
  if (sweep > Math.PI * 2 + 1e-9) sweep = Math.PI * 2;
  const step = r > ARC_TOLERANCE ? 2 * Math.acos(Math.max(-1, 1 - ARC_TOLERANCE / r)) : Math.PI / 4;
  const count = Math.max(2, Math.min(720, Math.ceil(sweep / Math.max(step, 1e-3))));
  const points: Point[] = [];
  for (let index = 0; index <= count; index += 1) {
    const angle = from + (ccw ? 1 : -1) * (sweep * index) / count;
    points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return points;
}

/** The points of a polyline segment with a bulge (tan of a quarter of the arc's angle; + is counter-clockwise). */
function bulgePoints(a: Point, b: Point, bulge: number): Point[] {
  if (Math.abs(bulge) < 1e-9) return [b];
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (chord < 1e-12) return [b];
  const angle = 4 * Math.atan(bulge);
  const r = chord / (2 * Math.sin(Math.abs(angle) / 2));
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const sagitta = r - Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2));
  const toCentre = r - sagitta;
  // The centre lies to the left of a -> b for a counter-clockwise arc of less than half a turn.
  const nx = -(b[1] - a[1]) / chord;
  const ny = (b[0] - a[0]) / chord;
  const side = (bulge > 0 ? 1 : -1) * (Math.abs(angle) > Math.PI ? -1 : 1);
  const centre: Point = [mid[0] + nx * toCentre * side, mid[1] + ny * toCentre * side];
  const from = Math.atan2(a[1] - centre[1], a[0] - centre[0]);
  const to = Math.atan2(b[1] - centre[1], b[0] - centre[0]);
  const points = arcPoints(centre[0], centre[1], r, from, to, bulge > 0);
  points[points.length - 1] = b;
  return points.slice(1);
}

function polylineFromVertices(vertices: Array<{ x: number; y: number; bulge: number }>, closed: boolean): Polyline | null {
  if (vertices.length < 2) return null;
  const points: Point[] = [[vertices[0].x, vertices[0].y]];
  const segments = closed ? vertices.length : vertices.length - 1;
  for (let index = 0; index < segments; index += 1) {
    const a = vertices[index];
    const b = vertices[(index + 1) % vertices.length];
    points.push(...bulgePoints([a.x, a.y], [b.x, b.y], a.bulge));
  }
  if (closed) points.pop();
  return { points, closed };
}

/** A B-spline (or NURBS) by de Boor's algorithm, sampled finely; fit points stand in when there are no control points. */
function splinePoints(entity: Entity): Polyline | null {
  const degree = Math.max(1, Math.round(number(entity, 71, 3)));
  const closed = (number(entity, 70) & 1) === 1;
  const xs = numbers(entity, 10);
  const ys = numbers(entity, 20);
  const controls: Point[] = xs.map((x, index) => [x, ys[index] ?? 0]);
  const weights = numbers(entity, 41);
  const knots = numbers(entity, 40);
  if (controls.length <= degree || knots.length !== controls.length + degree + 1) {
    const fx = numbers(entity, 11);
    const fy = numbers(entity, 21);
    const fit: Point[] = fx.map((x, index) => [x, fy[index] ?? 0]);
    if (fit.length >= 2) return { points: fit, closed };
    return controls.length >= 2 ? { points: controls, closed } : null;
  }
  const start = knots[degree];
  const end = knots[knots.length - degree - 1];
  const count = Math.max(16, Math.min(2000, controls.length * 24));
  const points: Point[] = [];
  for (let step = 0; step <= count; step += 1) {
    const u = Math.min(end - 1e-12, start + ((end - start) * step) / count);
    let span = degree;
    while (span < knots.length - degree - 2 && u >= knots[span + 1]) span += 1;
    const d = Array.from({ length: degree + 1 }, (_, j) => {
      const c = controls[span - degree + j];
      const w = weights.length === controls.length ? weights[span - degree + j] : 1;
      return [c[0] * w, c[1] * w, w];
    });
    for (let r = 1; r <= degree; r += 1) {
      for (let j = degree; j >= r; j -= 1) {
        const i = span - degree + j;
        const denominator = knots[i + degree - r + 1] - knots[i];
        const alpha = denominator === 0 ? 0 : (u - knots[i]) / denominator;
        d[j] = d[j].map((value, k) => (1 - alpha) * d[j - 1][k] + alpha * value);
      }
    }
    const [x, y, w] = d[degree];
    points.push([x / (w || 1), y / (w || 1)]);
  }
  if (closed) points.pop();
  return { points, closed };
}

type Transform = { a: number; b: number; c: number; d: number; e: number; f: number };
const IDENTITY: Transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const applyTo = (t: Transform, [x, y]: Point): Point => [t.a * x + t.c * y + t.e, t.b * x + t.d * y + t.f];
const compose = (outer: Transform, inner: Transform): Transform => ({
  a: outer.a * inner.a + outer.c * inner.b,
  b: outer.b * inner.a + outer.d * inner.b,
  c: outer.a * inner.c + outer.c * inner.d,
  d: outer.b * inner.c + outer.d * inner.d,
  e: outer.a * inner.e + outer.c * inner.f + outer.e,
  f: outer.b * inner.e + outer.d * inner.f + outer.f,
});

/** The outlines of a list of entities, blocks placed by INSERT followed into. */
function outlinesOf(entities: readonly Entity[], blocks: ReadonlyMap<string, { base: Point; entities: Entity[] }>, transform: Transform, depth: number, skipped: Set<string>): Polyline[] {
  const result: Polyline[] = [];
  const add = (line: Polyline | null) => {
    if (line && line.points.length >= 2) result.push({ closed: line.closed, points: line.points.map((point) => applyTo(transform, point)) });
  };
  for (const entity of entities) {
    switch (entity.type) {
      case "LINE":
        add({ points: [[number(entity, 10), number(entity, 20)], [number(entity, 11), number(entity, 21)]], closed: false });
        break;
      case "LWPOLYLINE": {
        const vertices: Array<{ x: number; y: number; bulge: number }> = [];
        for (const pair of entity.pairs) {
          if (pair.code === 10) vertices.push({ x: Number.parseFloat(pair.value), y: 0, bulge: 0 });
          else if (pair.code === 20 && vertices.length) vertices[vertices.length - 1].y = Number.parseFloat(pair.value);
          else if (pair.code === 42 && vertices.length) vertices[vertices.length - 1].bulge = Number.parseFloat(pair.value) || 0;
        }
        add(polylineFromVertices(vertices, (number(entity, 70) & 1) === 1));
        break;
      }
      case "POLYLINE": {
        const flags = number(entity, 70);
        if (flags & (16 | 64)) {
          skipped.add("POLYLINE mesh");
          break;
        }
        const vertices = (entity.vertices ?? []).map((vertex) => ({ x: number(vertex, 10), y: number(vertex, 20), bulge: number(vertex, 42) }));
        add(polylineFromVertices(vertices, (flags & 1) === 1));
        break;
      }
      case "CIRCLE": {
        const points = arcPoints(number(entity, 10), number(entity, 20), number(entity, 40), 0, Math.PI * 2);
        points.pop();
        add({ points, closed: true });
        break;
      }
      case "ARC": {
        const rad = Math.PI / 180;
        add({ points: arcPoints(number(entity, 10), number(entity, 20), number(entity, 40), number(entity, 50) * rad, number(entity, 51) * rad), closed: false });
        break;
      }
      case "ELLIPSE": {
        const cx = number(entity, 10);
        const cy = number(entity, 20);
        const mx = number(entity, 11);
        const my = number(entity, 21);
        const ratio = number(entity, 40, 1);
        let from = number(entity, 41, 0);
        let to = number(entity, 42, Math.PI * 2);
        while (to <= from) to += Math.PI * 2;
        const major = Math.hypot(mx, my);
        const rotation = Math.atan2(my, mx);
        const full = to - from >= Math.PI * 2 - 1e-6;
        const count = Math.max(24, Math.min(720, Math.ceil(((to - from) * major) / 0.5)));
        const points: Point[] = [];
        for (let index = 0; index <= count; index += 1) {
          const t = from + ((to - from) * index) / count;
          const x = major * Math.cos(t);
          const y = major * ratio * Math.sin(t);
          points.push([cx + x * Math.cos(rotation) - y * Math.sin(rotation), cy + x * Math.sin(rotation) + y * Math.cos(rotation)]);
        }
        if (full) points.pop();
        add({ points, closed: full });
        break;
      }
      case "SPLINE":
        add(splinePoints(entity));
        break;
      case "INSERT": {
        const block = blocks.get(text(entity, 2));
        if (!block || depth >= MAX_INSERT_DEPTH) break;
        const sx = number(entity, 41, 1);
        const sy = number(entity, 42, 1);
        const angle = (number(entity, 50) * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const columns = Math.max(1, Math.round(number(entity, 70, 1)));
        const rows = Math.max(1, Math.round(number(entity, 71, 1)));
        for (let row = 0; row < rows; row += 1) {
          for (let column = 0; column < columns; column += 1) {
            const ox = number(entity, 10) + column * number(entity, 44) * cos - row * number(entity, 45) * sin;
            const oy = number(entity, 20) + column * number(entity, 44) * sin + row * number(entity, 45) * cos;
            // Block point p goes to insertion + R * S * (p - base).
            const local: Transform = { a: cos * sx, b: sin * sx, c: -sin * sy, d: cos * sy, e: 0, f: 0 };
            local.e = ox - (local.a * block.base[0] + local.c * block.base[1]);
            local.f = oy - (local.b * block.base[0] + local.d * block.base[1]);
            for (const line of outlinesOf(block.entities, blocks, IDENTITY, depth + 1, skipped)) {
              result.push({ closed: line.closed, points: line.points.map((point) => applyTo(compose(transform, local), point)) });
            }
          }
        }
        break;
      }
      case "TEXT":
      case "MTEXT":
      case "DIMENSION":
      case "HATCH":
      case "POINT":
      case "SOLID":
      case "3DFACE":
        skipped.add(entity.type);
        break;
      default:
        break;
    }
  }
  return result;
}

const samePoint = (a: Point, b: Point, tolerance: number) => Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;

/** Open pieces that meet end to end are joined; a chain whose ends meet is closed. */
export function joinOutlines(lines: readonly Polyline[], tolerance = JOIN_TOLERANCE): Polyline[] {
  const closed: Polyline[] = [];
  const open: Point[][] = [];
  for (const line of lines) {
    if (line.closed) closed.push(line);
    else if (line.points.length >= 2 && samePoint(line.points[0], line.points[line.points.length - 1], tolerance) && line.points.length > 3) closed.push({ points: line.points.slice(0, -1), closed: true });
    else open.push([...line.points]);
  }
  const used = new Array(open.length).fill(false);
  for (let index = 0; index < open.length; index += 1) {
    if (used[index]) continue;
    used[index] = true;
    let chain = open[index];
    let grew = true;
    while (grew && !samePoint(chain[0], chain[chain.length - 1], tolerance)) {
      grew = false;
      for (let other = 0; other < open.length; other += 1) {
        if (used[other]) continue;
        const piece = open[other];
        const head = chain[0];
        const tail = chain[chain.length - 1];
        if (samePoint(tail, piece[0], tolerance)) chain = [...chain, ...piece.slice(1)];
        else if (samePoint(tail, piece[piece.length - 1], tolerance)) chain = [...chain, ...[...piece].reverse().slice(1)];
        else if (samePoint(head, piece[piece.length - 1], tolerance)) chain = [...piece.slice(0, -1), ...chain];
        else if (samePoint(head, piece[0], tolerance)) chain = [...[...piece].reverse().slice(0, -1), ...chain];
        else continue;
        used[other] = true;
        grew = true;
      }
    }
    const isClosed = chain.length > 3 && samePoint(chain[0], chain[chain.length - 1], tolerance);
    closed.push(isClosed ? { points: chain.slice(0, -1), closed: true } : { points: chain, closed: false });
  }
  return closed;
}

const fmt = (value: number) => {
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

/** A DXF drawing as an SVG of its outlines, in mm, ready for the SVG import. */
export function dxfToSvg(source: string): DxfImport {
  const pairs = readPairs(source);
  if (!pairs.some((pair) => pair.code === 0 && pair.value === "SECTION")) throw new Error("This is not a DXF drawing (no sections found). Binary DXF is not supported: save it as ASCII DXF.");
  const found = sections(pairs);
  const header = found.get("HEADER") ?? [];
  const unitsAt = header.findIndex((pair) => pair.code === 9 && pair.value === "$INSUNITS");
  const unitCode = unitsAt >= 0 ? Number.parseInt(header[unitsAt + 1]?.value ?? "0", 10) : 0;
  const scale = UNIT_TO_MM[unitCode] ?? 1;

  const blocks = new Map<string, { base: Point; entities: Entity[] }>();
  const blockEntities = entitiesOf(found.get("BLOCKS") ?? []);
  let open: { name: string; base: Point; entities: Entity[] } | null = null;
  for (const entity of blockEntities) {
    if (entity.type === "BLOCK") open = { name: text(entity, 2), base: [number(entity, 10), number(entity, 20)], entities: [] };
    else if (entity.type === "ENDBLK") {
      if (open) blocks.set(open.name, { base: open.base, entities: open.entities });
      open = null;
    } else open?.entities.push(entity);
  }

  const skipped = new Set<string>();
  const scaled = outlinesOf(entitiesOf(found.get("ENTITIES") ?? []), blocks, { a: scale, b: 0, c: 0, d: scale, e: 0, f: 0 }, 0, skipped);
  const outlines = joinOutlines(scaled).filter((line) => line.points.length >= 2);
  const closed = outlines.filter((line) => line.closed && line.points.length >= 3);
  if (!closed.length) {
    throw new Error(outlines.length
      ? "The DXF has lines but no closed outline to build a body from. Join the outline into a closed shape and save it again."
      : "The DXF has no lines, arcs, circles or polylines Pare 3D can read.");
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const line of closed) for (const [x, y] of line.points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const width = Math.max(maxX - minX, 1e-6);
  const height = Math.max(maxY - minY, 1e-6);
  // DXF's y runs up the page, SVG's down: the drawing is turned over so it reads the same way.
  const d = closed.map((line) => line.points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${fmt(x - minX)} ${fmt(maxY - y)}`).join(" ") + " Z").join(" ");
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${fmt(width)}mm" height="${fmt(height)}mm" viewBox="0 0 ${fmt(width)} ${fmt(height)}">`,
    `  <path d="${d}" fill="#000000" fill-rule="evenodd"/>`,
    "</svg>",
  ].join("\n");
  return { svg, outlines: closed.length, open: outlines.length - closed.length, skipped: [...skipped] };
}

/* ---------- export ---------- */

/** The outlines of an SVG made of straight lines (M, L, Z), per path, with the path's name. */
function svgPathOutlines(svg: string): Array<{ name: string; color: string; lines: Polyline[] }> {
  const result: Array<{ name: string; color: string; lines: Polyline[] }> = [];
  const pathPattern = /<path\b([^>]*?)(?:\/>|>([\s\S]*?)<\/path>)/g;
  let match: RegExpExecArray | null;
  while ((match = pathPattern.exec(svg))) {
    const attributes = match[1];
    const attribute = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1];
    const d = attribute("d");
    if (!d) continue;
    const title = /<title>([\s\S]*?)<\/title>/.exec(match[2] ?? "")?.[1];
    const name = (attribute("data-name") ?? title ?? `Part ${result.length + 1}`).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    const color = attribute("fill") && attribute("fill") !== "none" ? attribute("fill")! : attribute("stroke") ?? "#000000";
    const lines: Polyline[] = [];
    let current: Point[] = [];
    const tokens = d.match(/[MLZmlz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
    let command = "";
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (/^[MLZmlz]$/.test(token)) {
        command = token.toUpperCase();
        if (command === "Z") {
          if (current.length >= 2) lines.push({ points: current, closed: true });
          current = [];
        } else if (command === "M" && current.length >= 2) {
          lines.push({ points: current, closed: false });
          current = [];
        }
        continue;
      }
      const x = Number.parseFloat(token);
      const y = Number.parseFloat(tokens[index + 1] ?? "NaN");
      index += 1;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (command === "M" && current.length >= 2) {
        lines.push({ points: current, closed: false });
        current = [];
      }
      current.push([x, y]);
      if (command === "M") command = "L";
    }
    if (current.length >= 2) lines.push({ points: current, closed: false });
    if (lines.length) result.push({ name, color, lines });
  }
  return result;
}

/** DXF layer names: letters, digits, spaces, - and _, at most 255 characters, and unique. */
function layerNames(names: readonly string[]) {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const base = name.replace(/[<>/\\":;?*|=,`]/g, "_").trim().slice(0, 200) || "Part";
    const count = seen.get(base.toUpperCase()) ?? 0;
    seen.set(base.toUpperCase(), count + 1);
    return count ? `${base} ${count + 1}` : base;
  });
}

/** The nearest of the AutoCAD colour index's first nine colours, for programs that read only those. */
function aciColor(hex: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 7;
  const value = Number.parseInt(match[1], 16);
  const rgb = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const palette: Array<[number, number[]]> = [[1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]], [4, [0, 255, 255]], [5, [0, 0, 255]], [6, [255, 0, 255]], [7, [0, 0, 0]], [8, [128, 128, 128]], [9, [192, 192, 192]]];
  let best = 7;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [index, color] of palette) {
    const distance = color.reduce((sum, channel, k) => sum + (channel - rgb[k]) ** 2, 0);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The outlines of an exported SVG (the silhouette or the footprint) as a DXF R12 drawing in mm:
 * one closed polyline per outline, one layer per part, the y axis turned back to run up the page.
 */
export function svgOutlinesToDxf(svg: string): { dxf: string; outlines: number } {
  const parts = svgPathOutlines(svg);
  if (!parts.length) throw new Error("There is no outline to write as DXF.");
  let maxY = Number.NEGATIVE_INFINITY;
  let minX = Number.POSITIVE_INFINITY;
  for (const part of parts) for (const line of part.lines) for (const [x, y] of line.points) {
    maxY = Math.max(maxY, y);
    minX = Math.min(minX, x);
  }
  const names = layerNames(parts.map((part) => part.name));
  const out: string[] = [];
  const put = (code: number, value: string | number) => out.push(String(code), typeof value === "number" ? fmt(value) : value);
  put(0, "SECTION"); put(2, "HEADER");
  put(9, "$ACADVER"); put(1, "AC1009");
  put(9, "$INSUNITS"); put(70, "4");
  put(9, "$MEASUREMENT"); put(70, "1");
  put(0, "ENDSEC");
  put(0, "SECTION"); put(2, "TABLES");
  put(0, "TABLE"); put(2, "LAYER"); put(70, String(names.length + 1));
  put(0, "LAYER"); put(2, "0"); put(70, "0"); put(62, "7"); put(6, "CONTINUOUS");
  parts.forEach((part, index) => {
    put(0, "LAYER"); put(2, names[index]); put(70, "0"); put(62, String(aciColor(part.color))); put(6, "CONTINUOUS");
  });
  put(0, "ENDTAB");
  put(0, "ENDSEC");
  put(0, "SECTION"); put(2, "ENTITIES");
  let outlines = 0;
  parts.forEach((part, index) => {
    for (const line of part.lines) {
      put(0, "POLYLINE"); put(8, names[index]); put(66, "1"); put(10, 0); put(20, 0); put(30, 0); put(70, line.closed ? "1" : "0");
      for (const [x, y] of line.points) {
        put(0, "VERTEX"); put(8, names[index]); put(10, x - minX); put(20, maxY - y); put(30, 0);
      }
      put(0, "SEQEND"); put(8, names[index]);
      outlines += 1;
    }
  });
  put(0, "ENDSEC");
  put(0, "EOF");
  return { dxf: out.join("\r\n") + "\r\n", outlines };
}
