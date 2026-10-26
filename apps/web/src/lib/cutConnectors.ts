import type { ManifoldToplevel } from "manifold-3d";
import type { ManifoldSolid } from "@/lib/manifoldSplit";

/*
 * Fork: connectors for a cut, as Bambu Studio and OrcaSlicer offer them. A part too big for the
 * plate is split, and the two halves need to line up and hold together when glued:
 *
 * - Plug: a round peg on one half and a matching socket in the other.
 * - Dowel: a socket in both halves and a loose pin, printed separately, that joins them.
 * - Dovetail (build 71): a key with a dovetail section standing on one half and a matching slot in
 *   the other, running right across the cut face, so the halves slide together from the side and
 *   then cannot be pulled apart across the cut - they hold without glue.
 *
 * Where they go: the body is sliced at the cut to get the exact cut face, which is shrunk by
 * the socket's radius plus a wall. Any point left inside is a place where a connector fits
 * without breaking through the side. Each separate piece of the cut face gets its own
 * connectors, one or two (spread along its long direction).
 *
 * Sizes are in mm. The clearance is added to the socket's diameter (as Print fit does for
 * holes); a socket is also a little deeper than its peg so glue and the peg's tip have room.
 */

export type CutConnectorType = "none" | "plug" | "dowel" | "dovetail";
/** Auto: the editor spreads them over the cut face. Manual: where the user clicked on it. */
export type CutConnectorPlacement = "auto" | "manual";

export type CutConnectorOptions = {
  type: CutConnectorType;
  /** Diameter of the peg or pin. */
  diameter: number;
  /** Plug: length of the peg. Dowel: depth of each socket (the pin is twice this long). */
  depth: number;
  /** Added to the socket's diameter: 0.1 press, 0.2 snug, 0.4 loose. */
  clearance: number;
  placement: CutConnectorPlacement;
  /** Auto placement: connectors on each separate piece of the cut face. */
  perPiece: 1 | 2;
  /**
   * Plug: put the peg on the + half instead. By default it goes on the - half (below, behind or
   * left of the cut), which prints on its own base with the peg standing up, while the half with
   * the socket prints flat on its cut face.
   */
  flip: boolean;
};

export const DEFAULT_CUT_CONNECTORS: CutConnectorOptions = {
  type: "none",
  diameter: 5,
  depth: 5,
  clearance: 0.2,
  placement: "auto",
  perPiece: 1,
  flip: false,
};

export const CUT_CONNECTOR_LIMITS = {
  minDiameter: 1,
  maxDiameter: 50,
  minDepth: 1,
  maxDepth: 50,
  maxClearance: 1,
  /** Connectors on one body, at most. */
  maxCount: 12,
} as const;

/** The wall left between a socket and the outside of the part. */
export const CONNECTOR_WALL = 1.2;
/** How much deeper a socket is than its peg. */
export const SOCKET_EXTRA_DEPTH = 0.3;
/** The chamfer on a peg's or pin's end, so it finds the socket. */
const TIP_CHAMFER = 0.4;
/** Pegs and cutters reach this far past the cut face so the booleans never meet face to face. */
const OVERLAP = 0.05;
const SEGMENTS = 48;

type Vec3 = [number, number, number];
type Mat4 = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];

export function normalizeCutConnectors(options: Partial<CutConnectorOptions> | null | undefined): CutConnectorOptions {
  const merged = { ...DEFAULT_CUT_CONNECTORS, ...(options ?? {}) };
  const clamp = (value: number, min: number, max: number, fallback: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
  return {
    type: merged.type === "plug" || merged.type === "dowel" || merged.type === "dovetail" ? merged.type : "none",
    diameter: clamp(merged.diameter, CUT_CONNECTOR_LIMITS.minDiameter, CUT_CONNECTOR_LIMITS.maxDiameter, DEFAULT_CUT_CONNECTORS.diameter),
    depth: clamp(merged.depth, CUT_CONNECTOR_LIMITS.minDepth, CUT_CONNECTOR_LIMITS.maxDepth, DEFAULT_CUT_CONNECTORS.depth),
    clearance: clamp(merged.clearance, 0, CUT_CONNECTOR_LIMITS.maxClearance, DEFAULT_CUT_CONNECTORS.clearance),
    placement: merged.placement === "manual" ? "manual" : "auto",
    perPiece: merged.perPiece === 2 ? 2 : 1,
    flip: Boolean(merged.flip),
  };
}

/** Two directions in the plane and its normal, as a right-handed frame. */
export function planeFrame(normal: readonly number[]) {
  const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
  const n: Vec3 = [normal[0] / length, normal[1] / length, normal[2] / length];
  const helper: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const uRaw = cross(helper, n);
  const uLength = Math.hypot(...uRaw);
  const u: Vec3 = [uRaw[0] / uLength, uRaw[1] / uLength, uRaw[2] / uLength];
  const v = cross(n, u);
  // Column-major, as Manifold takes it: world to plane (rows u, v, n) and back (columns u, v, n).
  const toLocal: Mat4 = [u[0], v[0], n[0], 0, u[1], v[1], n[1], 0, u[2], v[2], n[2], 0, 0, 0, 0, 1];
  const toWorld: Mat4 = [u[0], u[1], u[2], 0, v[0], v[1], v[2], 0, n[0], n[1], n[2], 0, 0, 0, 0, 1];
  return { u, v, n, toLocal, toWorld };
}

/** A point in the plane's frame, back in the scene. */
export function planePointToWorld(frame: ReturnType<typeof planeFrame>, x: number, y: number, z: number): Vec3 {
  return [
    frame.u[0] * x + frame.v[0] * y + frame.n[0] * z,
    frame.u[1] * x + frame.v[1] * y + frame.n[1] * z,
    frame.u[2] * x + frame.v[2] * y + frame.n[2] * z,
  ];
}

type Point2 = [number, number];
type CrossSection = ReturnType<ManifoldSolid["slice"]>;

function polygonCentroid(contours: readonly (readonly Point2[])[]): Point2 | null {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (const contour of contours) {
    for (let index = 0; index < contour.length; index += 1) {
      const [x0, y0] = contour[index];
      const [x1, y1] = contour[(index + 1) % contour.length];
      const cross = x0 * y1 - x1 * y0;
      area += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
  }
  if (Math.abs(area) < 1e-9) return null;
  return [cx / (3 * area), cy / (3 * area)];
}

function contains(runtime: ManifoldToplevel, region: CrossSection, point: Point2) {
  const probe = 1e-3;
  const square = runtime.CrossSection.square([probe, probe], true).translate(point);
  const inside = region.intersect(square);
  try {
    return inside.area() > probe * probe * 0.99;
  } finally {
    square.delete();
    inside.delete();
  }
}

/** A point inside the region: its middle when that is inside, otherwise the nearest corner of its outline. */
function interiorPoint(runtime: ManifoldToplevel, region: CrossSection): Point2 | null {
  const polygons = region.toPolygons() as Point2[][];
  if (!polygons.length) return null;
  const centre = polygonCentroid(polygons);
  if (centre && contains(runtime, region, centre)) return centre;
  const target = centre ?? polygons[0][0];
  let best: Point2 | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const contour of polygons) {
    for (const point of contour) {
      const distance = Math.hypot(point[0] - target[0], point[1] - target[1]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = [point[0], point[1]];
      }
    }
  }
  return best;
}

/** Where a scene point lands in the plane's frame (its distance along the normal dropped). */
export function worldPointToPlane(frame: ReturnType<typeof planeFrame>, point: readonly number[]): Point2 {
  return [
    frame.u[0] * point[0] + frame.u[1] * point[1] + frame.u[2] * point[2],
    frame.v[0] * point[0] + frame.v[1] * point[1] + frame.v[2] * point[2],
  ];
}

/** The minimum distance between two connectors' centres: two sockets and a wall between them. */
export function connectorSpacing(options: CutConnectorOptions) {
  return options.diameter + options.clearance + CONNECTOR_WALL;
}

export type ManualConnectorCheck = {
  /** Points with room for a connector on this body's cut face. */
  fits: Point2[];
  /** Indexes (into the points given) that fit on this body. */
  fitIndexes: number[];
};

/**
 * Which of the user's points have room for a connector on this body's cut face, with a wall
 * around the socket. Points on the cut face of another body, or off it, are left out.
 */
export function checkManualConnectors(
  runtime: ManifoldToplevel,
  solid: ManifoldSolid,
  normal: readonly number[],
  position: number,
  options: CutConnectorOptions,
  points: readonly Point2[],
): ManualConnectorCheck {
  const frame = planeFrame(normal);
  const created: { delete(): void }[] = [];
  try {
    const local = solid.transform(frame.toLocal);
    created.push(local);
    const face = local.slice(position);
    created.push(face);
    if (face.isEmpty()) return { fits: [], fitIndexes: [] };
    const allowed = face.offset(-((options.diameter + options.clearance) / 2 + CONNECTOR_WALL), "Round", 2, SEGMENTS);
    created.push(allowed);
    const fits: Point2[] = [];
    const fitIndexes: number[] = [];
    points.forEach((point, index) => {
      if (!allowed.isEmpty() && contains(runtime, allowed, point)) {
        fits.push([point[0], point[1]]);
        fitIndexes.push(index);
      }
    });
    return { fits, fitIndexes };
  } finally {
    created.forEach((entry) => entry.delete());
  }
}

/** Pairs of points closer than two sockets and a wall, as indexes. */
export function crowdedConnectors(points: readonly Point2[], options: CutConnectorOptions) {
  const spacing = connectorSpacing(options);
  const crowded = new Set<number>();
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      if (Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1]) < spacing - 1e-6) {
        crowded.add(a);
        crowded.add(b);
      }
    }
  }
  return crowded;
}

export type ConnectorPlacement =
  | { status: "ok"; centres: Point2[] }
  | { status: "tooSmall" }
  | { status: "noFace" };

/**
 * Where the connectors go on one body cut at `position` along the plane's normal, as points in the
 * plane's frame (see planeFrame). `solid` is in scene coordinates.
 */
export function placeCutConnectors(
  runtime: ManifoldToplevel,
  solid: ManifoldSolid,
  normal: readonly number[],
  position: number,
  options: CutConnectorOptions,
): ConnectorPlacement {
  const frame = planeFrame(normal);
  const created: { delete(): void }[] = [];
  try {
    const local = solid.transform(frame.toLocal);
    created.push(local);
    const face = local.slice(position);
    created.push(face);
    if (face.isEmpty() || face.area() < 1e-6) return { status: "noFace" };
    const socketRadius = (options.diameter + options.clearance) / 2;
    const allowed = face.offset(-(socketRadius + CONNECTOR_WALL), "Round", 2, SEGMENTS);
    created.push(allowed);
    if (allowed.isEmpty()) return { status: "tooSmall" };
    const pieces = allowed.decompose().sort((a, b) => b.area() - a.area());
    created.push(...pieces);
    const centres: Point2[] = [];
    for (const piece of pieces) {
      if (centres.length >= CUT_CONNECTOR_LIMITS.maxCount) break;
      if (options.perPiece === 2) {
        const bounds = piece.bounds();
        const wide = bounds.max[0] - bounds.min[0] >= bounds.max[1] - bounds.min[1];
        const halves: Point2[] = [];
        for (const side of [0, 1]) {
          const min: Point2 = [bounds.min[0], bounds.min[1]];
          const max: Point2 = [bounds.max[0], bounds.max[1]];
          const axis = wide ? 0 : 1;
          const middle = (bounds.min[axis] + bounds.max[axis]) / 2;
          if (side === 0) max[axis] = middle; else min[axis] = middle;
          const box = runtime.CrossSection.square([max[0] - min[0], max[1] - min[1]]).translate(min);
          const half = piece.intersect(box);
          created.push(box, half);
          const point = half.isEmpty() ? null : interiorPoint(runtime, half);
          if (point) halves.push(point);
        }
        // Two sockets need a wall between them too; too close, one in the middle does.
        const apart = halves.length === 2 && Math.hypot(halves[0][0] - halves[1][0], halves[0][1] - halves[1][1]) >= 2 * socketRadius + CONNECTOR_WALL;
        if (apart) {
          centres.push(...halves);
          continue;
        }
      }
      const point = interiorPoint(runtime, piece);
      if (point) centres.push(point);
    }
    return centres.length ? { status: "ok", centres: centres.slice(0, CUT_CONNECTOR_LIMITS.maxCount) } : { status: "tooSmall" };
  } finally {
    created.forEach((entry) => entry.delete());
  }
}

/** A round rod along the plane's normal from `from` to `to`, its end at `to` chamfered when asked. */
function rod(runtime: ManifoldToplevel, frame: ReturnType<typeof planeFrame>, centre: Point2, radius: number, from: number, to: number, chamferAt: "none" | "to" | "both") {
  const low = Math.min(from, to);
  const length = Math.abs(to - from);
  const chamfer = chamferAt === "none" ? 0 : Math.min(TIP_CHAMFER, radius * 0.4, length / 4);
  const parts: ManifoldSolid[] = [];
  const pointsUp = to >= from;
  const chamferLow = chamferAt === "both" || (chamferAt === "to" && !pointsUp);
  const chamferHigh = chamferAt === "both" || (chamferAt === "to" && pointsUp);
  const bodyStart = chamferLow ? chamfer : 0;
  const bodyEnd = length - (chamferHigh ? chamfer : 0);
  parts.push(runtime.Manifold.cylinder(bodyEnd - bodyStart, radius, radius, SEGMENTS).translate([0, 0, bodyStart]));
  if (chamferHigh) parts.push(runtime.Manifold.cylinder(chamfer, radius, radius - chamfer, SEGMENTS).translate([0, 0, bodyEnd]));
  if (chamferLow) parts.push(runtime.Manifold.cylinder(chamfer, radius - chamfer, radius, SEGMENTS));
  const joined = parts.length === 1 ? parts[0] : runtime.Manifold.union(parts);
  const placed = joined.translate([centre[0], centre[1], low]).transform(frame.toWorld);
  if (parts.length > 1) parts.forEach((part) => part.delete());
  joined.delete();
  return placed;
}

export type ConnectedHalves = {
  positive: ManifoldSolid;
  negative: ManifoldSolid;
  /** Dowel: one pin per connector, each standing on its end. */
  pins: number;
  count: number;
  created: ManifoldSolid[];
};

/** How much a dovetail widens from the cut face to its far end, each side: 15° flanks. */
export const DOVETAIL_FLANK = Math.tan((15 * Math.PI) / 180);

/**
 * A dovetail prism: `width` wide at the cut face, wider by the flanks at `depth` into the half the
 * key reaches into (`into` = +1 along the normal, -1 against it), running along the plane's first
 * direction from `uMin` to `uMax`. Built in the plane's frame, returned in the scene.
 */
function dovetailPrism(runtime: ManifoldToplevel, frame: ReturnType<typeof planeFrame>, v: number, width: number, depth: number, position: number, into: number, uMin: number, uMax: number, start: number) {
  const far = width + 2 * depth * DOVETAIL_FLANK;
  // In the prism's own axes: x = v (across), y = n (along the normal), z = u (along the slot).
  const section = new runtime.CrossSection([
    [
      [v - width / 2, position + into * start],
      [v + width / 2, position + into * start],
      [v + far / 2, position + into * depth],
      [v - far / 2, position + into * depth],
    ],
  ], "NonZero");
  const prism = section.extrude(uMax - uMin).translate([0, 0, uMin]);
  section.delete();
  // x -> v, y -> n, z -> u, then the plane's frame back to the scene.
  const axes: Mat4 = [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1];
  const local = prism.transform(axes);
  prism.delete();
  const placed = local.transform(frame.toWorld);
  local.delete();
  return placed;
}

/** Fraction of a socket's volume that must lie inside its half; less and it breaks through. */
const SOCKET_INSIDE = 0.97;

/**
 * Adds the connectors to the two halves of a cut. `positive` is the half on the normal's side.
 * Returns an error key when a socket would break through the side of its half (the part narrows
 * behind the cut face): the connector is then too long for the part.
 */
export function connectCutHalves(
  runtime: ManifoldToplevel,
  positive: ManifoldSolid,
  negative: ManifoldSolid,
  normal: readonly number[],
  position: number,
  centres: readonly Point2[],
  options: CutConnectorOptions,
): ConnectedHalves | { error: "breaksThrough" } {
  const frame = planeFrame(normal);
  const created: ManifoldSolid[] = [];
  const pegRadius = options.diameter / 2;
  const socketRadius = (options.diameter + options.clearance) / 2;
  const socketDepth = options.depth + SOCKET_EXTRA_DEPTH;
  const withinHalf = (half: ManifoldSolid, socket: ManifoldSolid) => {
    const inside = half.intersect(socket);
    created.push(inside);
    return inside.volume() >= socket.volume() * SOCKET_INSIDE;
  };
  let nextPositive = positive;
  let nextNegative = negative;
  if (options.type === "plug") {
    // The peg stands on one half and reaches into the other (see `flip`).
    const pegOnPositive = options.flip;
    const into = pegOnPositive ? -1 : 1;
    const pegs: ManifoldSolid[] = [];
    const sockets: ManifoldSolid[] = [];
    for (const centre of centres) {
      pegs.push(rod(runtime, frame, centre, pegRadius, position - into * OVERLAP, position + into * options.depth, "to"));
      sockets.push(rod(runtime, frame, centre, socketRadius, position - into * OVERLAP, position + into * socketDepth, "none"));
    }
    created.push(...pegs, ...sockets);
    const socketHalf = pegOnPositive ? negative : positive;
    // Only the part of each socket past the cut face has to sit inside its half.
    for (const centre of centres) {
      const deep = rod(runtime, frame, centre, socketRadius, position + into * OVERLAP, position + into * socketDepth, "none");
      created.push(deep);
      if (!withinHalf(socketHalf, deep)) return { error: "breaksThrough" };
    }
    const pegUnion = pegs.length === 1 ? pegs[0] : runtime.Manifold.union(pegs);
    const socketUnion = sockets.length === 1 ? sockets[0] : runtime.Manifold.union(sockets);
    created.push(pegUnion, socketUnion);
    if (pegOnPositive) {
      nextPositive = positive.add(pegUnion);
      nextNegative = negative.subtract(socketUnion);
    } else {
      nextNegative = negative.add(pegUnion);
      nextPositive = positive.subtract(socketUnion);
    }
  } else if (options.type === "dovetail") {
    // The key stands on the - half (the + half with `flip`) and reaches into the other; its slot is
    // open at both ends so the other half slides on along the cut.
    const keyOnPositive = options.flip;
    const into = keyOnPositive ? -1 : 1;
    const local = (keyOnPositive ? positive : negative).transform(frame.toLocal);
    created.push(local);
    // Just inside the key's own half: exactly on its cut face the slice can come out empty.
    const face = local.slice(position - into * 1e-3);
    const bounds = face.bounds();
    const uMin = bounds.min[0], uMax = bounds.max[0];
    const keys: ManifoldSolid[] = [];
    const slots: ManifoldSolid[] = [];
    const reach = face.extrude(options.depth + 2 * OVERLAP).translate([0, 0, into > 0 ? position - OVERLAP : position - options.depth - OVERLAP]);
    face.delete();
    const reachWorld = reach.transform(frame.toWorld);
    reach.delete();
    created.push(reachWorld);
    for (const centre of centres) {
      const prism = dovetailPrism(runtime, frame, centre[1], options.diameter, options.depth, position, into, uMin - 1, uMax + 1, -OVERLAP);
      // The key only where the half's cut face is, so it never stands out past the part's outline.
      const key = prism.intersect(reachWorld);
      prism.delete();
      const slot = dovetailPrism(runtime, frame, centre[1], options.diameter + options.clearance, options.depth + SOCKET_EXTRA_DEPTH, position, into, uMin - 5, uMax + 5, -OVERLAP);
      keys.push(key);
      slots.push(slot);
      created.push(key, slot);
    }
    if (keys.some((key) => key.isEmpty() || key.volume() < 1e-6)) return { error: "breaksThrough" };
    const keyUnion = keys.length === 1 ? keys[0] : runtime.Manifold.union(keys);
    const slotUnion = slots.length === 1 ? slots[0] : runtime.Manifold.union(slots);
    created.push(keyUnion, slotUnion);
    if (keyOnPositive) {
      nextPositive = positive.add(keyUnion);
      nextNegative = negative.subtract(slotUnion);
    } else {
      nextNegative = negative.add(keyUnion);
      nextPositive = positive.subtract(slotUnion);
    }
  } else if (options.type === "dowel") {
    const positiveSockets: ManifoldSolid[] = [];
    const negativeSockets: ManifoldSolid[] = [];
    for (const centre of centres) {
      const up = rod(runtime, frame, centre, socketRadius, position - OVERLAP, position + socketDepth, "none");
      const down = rod(runtime, frame, centre, socketRadius, position + OVERLAP, position - socketDepth, "none");
      positiveSockets.push(up);
      negativeSockets.push(down);
      created.push(up, down);
      const deepUp = rod(runtime, frame, centre, socketRadius, position + OVERLAP, position + socketDepth, "none");
      const deepDown = rod(runtime, frame, centre, socketRadius, position - OVERLAP, position - socketDepth, "none");
      created.push(deepUp, deepDown);
      if (!withinHalf(positive, deepUp) || !withinHalf(negative, deepDown)) return { error: "breaksThrough" };
    }
    const up = positiveSockets.length === 1 ? positiveSockets[0] : runtime.Manifold.union(positiveSockets);
    const down = negativeSockets.length === 1 ? negativeSockets[0] : runtime.Manifold.union(negativeSockets);
    created.push(up, down);
    nextPositive = positive.subtract(up);
    nextNegative = negative.subtract(down);
  }
  created.push(nextPositive, nextNegative);
  return {
    positive: nextPositive,
    negative: nextNegative,
    pins: options.type === "dowel" ? centres.length : 0,
    count: centres.length,
    created: created.filter((entry) => entry !== nextPositive && entry !== nextNegative && entry !== positive && entry !== negative),
  };
}

/** A dowel pin standing on its end: a round rod twice the socket depth, chamfered at both ends. */
export function dowelPinSize(options: CutConnectorOptions) {
  return { diameter: options.diameter, length: options.depth * 2 };
}
