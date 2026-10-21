import { boxWithLidParts, INSERT_HOLES, type MetricSize, type ReadyPart } from "@/lib/readyParts";
import { libraryShapeAssets, makeShapeFromAsset } from "@/lib/shapeCatalog";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * Fork (build 21): an enclosure for a circuit board. Give the board's size and its mounting
 * holes; out comes a box with standoffs (holes for heat-set inserts or self-tapping screws),
 * cut-outs for its ports, and a lid that fits, with vents. Built from ordinary shapes, so
 * every part of it can still be moved and resized. Sizes in mm.
 */

export type EnclosureSide = "front" | "back" | "left" | "right";
export type PortPreset = "usbC" | "microUsb" | "usbA" | "dcJack" | "hdmi" | "custom";
export type EnclosurePort = { side: EnclosureSide; preset: PortPreset; offset: number; width: number; height: number; above: number };
export type EnclosureOptions = {
  boardWidth: number;
  boardDepth: number;
  boardThickness: number;
  /** Space under the board: the standoffs' height. */
  standoff: number;
  /** The tallest part on the board. */
  components: number;
  wall: number;
  /** Room between the board and the walls. */
  gap: number;
  screw: MetricSize | "none";
  fixing: "insert" | "screw";
  /** Mounting holes this far in from the board's edges (a hole in each corner). */
  holeInset: number;
  lid: boolean;
  vents: boolean;
  ports: EnclosurePort[];
};

/** The opening each port needs, a little larger than the plug's housing. */
export const PORT_SIZES: Record<Exclude<PortPreset, "custom">, { width: number; height: number }> = {
  usbC: { width: 9.6, height: 3.8 },
  microUsb: { width: 8.6, height: 3.6 },
  usbA: { width: 13.6, height: 6.4 },
  dcJack: { width: 9.6, height: 11.5 },
  hdmi: { width: 15.6, height: 6.6 },
};

export const DEFAULT_ENCLOSURE: EnclosureOptions = {
  boardWidth: 60,
  boardDepth: 40,
  boardThickness: 1.6,
  standoff: 5,
  components: 15,
  wall: 2,
  gap: 1.5,
  screw: "M2.5",
  fixing: "insert",
  holeInset: 3.5,
  lid: true,
  vents: true,
  ports: [{ side: "front", preset: "usbC", offset: 0, width: PORT_SIZES.usbC.width, height: PORT_SIZES.usbC.height, above: 0 }],
};

/** Pilot holes for self-tapping (plastite) screws. */
const PILOT: Record<MetricSize, number> = { M2: 1.6, "M2.5": 2.1, M3: 2.5, M4: 3.4, M5: 4.2 };

function asset(id: string) {
  const found = libraryShapeAssets.find((entry) => entry.id === id);
  if (!found) throw new Error(`No ${id} shape in the library`);
  return found;
}

const round = (value: number) => Math.round(value * 100) / 100;
const clampTo = (value: number, min: number, max: number, fallback: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);

export function normalizeEnclosure(raw: Partial<EnclosureOptions>): EnclosureOptions {
  const o = { ...DEFAULT_ENCLOSURE, ...raw };
  return {
    boardWidth: clampTo(o.boardWidth, 10, 300, DEFAULT_ENCLOSURE.boardWidth),
    boardDepth: clampTo(o.boardDepth, 10, 300, DEFAULT_ENCLOSURE.boardDepth),
    boardThickness: clampTo(o.boardThickness, 0.4, 5, 1.6),
    standoff: clampTo(o.standoff, 2, 40, 5),
    components: clampTo(o.components, 1, 150, 15),
    wall: clampTo(o.wall, 1.2, 6, 2),
    gap: clampTo(o.gap, 0.3, 20, 1.5),
    screw: o.screw,
    fixing: o.fixing === "screw" ? "screw" : "insert",
    holeInset: clampTo(o.holeInset, 1.5, Math.min(o.boardWidth, o.boardDepth) / 2, 3.5),
    lid: o.lid !== false,
    vents: Boolean(o.vents),
    ports: (o.ports ?? []).slice(0, 6).map((port) => ({
      ...port,
      width: clampTo(port.width, 1, 100, 10),
      height: clampTo(port.height, 1, 100, 4),
      above: clampTo(port.above, -o.boardThickness - o.standoff, 100, 0),
      offset: Number.isFinite(port.offset) ? port.offset : 0,
    })),
  };
}

/** The box's inside: the board with its gap all round, and from the floor to the top of its tallest part. */
export function enclosureInside(o: EnclosureOptions) {
  return { width: round(o.boardWidth + 2 * o.gap), depth: round(o.boardDepth + 2 * o.gap), height: round(o.standoff + o.boardThickness + o.components + 1) };
}

export function enclosureParts(raw: Partial<EnclosureOptions>, names: { box: string; lid: string; standoff: string; port: string; vent: string }): ReadyPart[] {
  const o = normalizeEnclosure(raw);
  const inside = enclosureInside(o);
  const [boxPart, lidPart] = boxWithLidParts({ width: inside.width, depth: inside.depth, height: inside.height, wall: o.wall, radius: 2, lid: o.lid }, { box: names.box, lid: names.lid });
  const outer = boxPart.shapes[0];
  const cx = outer.x;
  const cz = outer.z;
  const floor = o.wall;
  const extras: WorkplaneShape[] = [];

  if (o.screw !== "none") {
    const holeDiameter = o.fixing === "insert" ? INSERT_HOLES[o.screw].diameter : PILOT[o.screw];
    const standoffDiameter = round(Math.max(holeDiameter + 3, 5));
    const dx = o.boardWidth / 2 - o.holeInset;
    const dz = o.boardDepth / 2 - o.holeInset;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = round(cx + sx * dx);
        const z = round(cz + sz * dz);
        // The standoff starts a little inside the floor so the two join.
        const post = makeShapeFromAsset(asset("cylinder"), { x, z, elevation: floor - 0.2 }, { width: standoffDiameter, depth: standoffDiameter, height: round(o.standoff + 0.2) });
        extras.push({ ...post, name: names.standoff, color: outer.color });
        // The hole stops 0.6 mm above the outside so the floor stays closed.
        const depth = round(o.standoff + floor - 0.6);
        const hole = makeShapeFromAsset(asset("cylinder"), { x, z, elevation: round(floor + o.standoff - depth) }, { width: holeDiameter, depth: holeDiameter, height: round(depth + 1) });
        extras.push({ ...hole, name: `${names.standoff} hole`, hole: true });
      }
    }
  }

  const outerWidth = inside.width + 2 * o.wall;
  const outerDepth = inside.depth + 2 * o.wall;
  const boardTop = floor + o.standoff + o.boardThickness;
  o.ports.forEach((port) => {
    const through = o.wall + 4;
    const elevation = round(boardTop + port.above);
    const along = port.side === "front" || port.side === "back";
    const x = along ? round(cx + port.offset) : round(cx + (port.side === "right" ? 1 : -1) * (outerWidth / 2 - o.wall / 2));
    const z = along ? round(cz + (port.side === "front" ? 1 : -1) * (outerDepth / 2 - o.wall / 2)) : round(cz + port.offset);
    const cut = makeShapeFromAsset(asset("box"), { x, z, elevation }, { width: along ? port.width : through, depth: along ? through : port.width, height: port.height });
    extras.push({ ...cut, name: names.port, hole: true });
  });

  const parts: ReadyPart[] = [{ name: names.box, shapes: extras, group: true, parts: [boxPart] }];
  if (lidPart) {
    if (o.vents) {
      const plate = lidPart.shapes[0];
      const slots = Math.max(1, Math.floor((inside.width * 0.6) / 4));
      for (let index = 0; index < slots; index += 1) {
        const x = round(plate.x - ((slots - 1) * 4) / 2 + index * 4);
        const slot = makeShapeFromAsset(asset("box"), { x, z: plate.z, elevation: -1 }, { width: 1.8, depth: round(inside.depth * 0.5), height: 6 });
        lidPart.shapes.push({ ...slot, name: names.vent, hole: true });
      }
    }
    parts.push(lidPart);
  }
  return parts;
}
