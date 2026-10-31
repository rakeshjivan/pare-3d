import * as THREE from "three";
import { createContourPrismAlongZ } from "@/lib/teardropGeometry";

/*
 * The port opening: the hole a USB socket or a similar plug needs in the wall
 * of a box (Discussion #1049). Seen from the front it is a rectangle with
 * rounded corners - a USB-C socket is one with fully round ends - pushed
 * through the wall along the shape's own z axis, like the teardrop.
 *
 * Width and height are the opening as seen from the front, depth is how far
 * it reaches into the wall, cornerFillet the radius of its four corners. The
 * presets carry the socket's size from its standard plus about 0.25 mm on
 * every side, the room a printed opening needs.
 */

export type PortPreset = "usbC" | "usbCPlug" | "microUsb" | "usbA";

export const PORT_PRESETS: Record<PortPreset, { width: number; height: number; corner: number }> = {
  // Receptacle shell 8.94 x 3.26 mm: the ends fully round.
  usbC: { width: 9.4, height: 3.7, corner: 1.85 },
  // Plug overmold up to 12.35 x 6.5 mm, for a socket sitting behind the wall.
  usbCPlug: { width: 12.8, height: 7, corner: 3.5 },
  // Micro-B receptacle about 7.5 x 2.6 mm.
  microUsb: { width: 8, height: 3.1, corner: 0.6 },
  // Type A receptacle shell 12.5 x 5.12 mm.
  usbA: { width: 13, height: 5.6, corner: 0.5 },
};

export const PORT_PRESET_ORDER: PortPreset[] = ["usbC", "usbCPlug", "microUsb", "usbA"];
export const DEFAULT_PORT_PRESET: PortPreset = "usbC";
/** How far a new opening reaches through: more than most walls, so it cuts through when placed on one. */
export const DEFAULT_PORT_DEPTH = 10;
/** Arc steps of a full circle in the display mesh; each corner gets a quarter. */
const PORT_CIRCLE_SEGMENTS = 32;

export function normalizePortCorner(corner: number | undefined, width: number, height: number) {
  const max = Math.max(0, Math.min(width, height) / 2);
  const value = corner === undefined || !Number.isFinite(corner) ? PORT_PRESETS[DEFAULT_PORT_PRESET].corner : corner;
  return Math.min(max, Math.max(0, value));
}

/** The preset this opening matches, or null when its size was changed by hand. */
export function portPresetFor(width: number, height: number, corner: number | undefined): PortPreset | null {
  const close = (a: number, b: number) => Math.abs(a - b) < 0.005;
  return PORT_PRESET_ORDER.find((key) => {
    const preset = PORT_PRESETS[key];
    return close(width, preset.width) && close(height, preset.height) && close(normalizePortCorner(corner, width, height), preset.corner);
  }) ?? null;
}

/** The outline seen from the front (x right, y up), counter-clockwise, x centred, from y = 0 to y = height. */
export function portContourPoints(width: number, height: number, corner: number | undefined, circleSegments = PORT_CIRCLE_SEGMENTS) {
  const w = Math.max(0.01, width);
  const h = Math.max(0.01, height);
  const r = normalizePortCorner(corner, w, h);
  const hw = w / 2;
  if (r <= 1e-4) return [{ x: hw, y: 0 }, { x: hw, y: h }, { x: -hw, y: h }, { x: -hw, y: 0 }];
  const steps = Math.max(2, Math.ceil(Math.max(4, circleSegments) / 4));
  const centres = [
    { x: hw - r, y: r, start: -Math.PI / 2 },
    { x: hw - r, y: h - r, start: 0 },
    { x: -(hw - r), y: h - r, start: Math.PI / 2 },
    { x: -(hw - r), y: r, start: Math.PI },
  ];
  const points: { x: number; y: number }[] = [];
  centres.forEach((centre) => {
    for (let i = 0; i <= steps; i += 1) {
      const angle = centre.start + (Math.PI / 2) * (i / steps);
      const point = { x: centre.x + r * Math.cos(angle), y: centre.y + r * Math.sin(angle) };
      const last = points[points.length - 1];
      // Where two arcs meet (a fully round end) the point is there already.
      if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 1e-9) points.push(point);
    }
  });
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.hypot(first.x - last.x, first.y - last.y) <= 1e-9) points.pop();
  return points;
}

export type PortGeometryOptions = { width: number; depth: number; height: number; cornerFillet?: number };

/** A closed, watertight opening body: the outline pushed along z, centred on the origin, from y = 0 to y = height. */
export function createPortGeometry({ width, depth, height, cornerFillet }: PortGeometryOptions): THREE.BufferGeometry {
  return createContourPrismAlongZ(portContourPoints(width, height, cornerFillet), depth);
}
