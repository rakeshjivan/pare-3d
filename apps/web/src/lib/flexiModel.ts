/**
 * Fork (build 33): make any model a flexi toy. The model is cut across its length into segments
 * that print in place, already joined: each cut is a print-in-place knuckle hinge - a tongue with a
 * pin hole on one side, a fork with a pin through it on the other, everything the clearance apart -
 * and the two cut faces are angled into a V, so each joint swings side to side.
 *
 * Coordinates are the editor's world: x across, y up (the plate at the model's bottom), z deep.
 * The cuts go across the longer of x and z.
 */
import { getManifoldRuntime } from "@/lib/editorMeshCore";
import { weldTriangles } from "@/lib/meshRepair";

export type FlexiModelOptions = {
  segments: number;
  clearance: number;
  /** How far each joint swings to either side, in degrees. */
  swing: number;
};
export const DEFAULT_FLEXI_MODEL: FlexiModelOptions = { segments: 6, clearance: 0.4, swing: 30 };

type Solid = {
  status(): string; isEmpty(): boolean; volume(): number; delete(): void;
  boundingBox(): { min: [number, number, number]; max: [number, number, number] };
  getMesh(): { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array };
  translate(v: [number, number, number]): Solid;
  rotate(v: [number, number, number]): Solid;
  trimByPlane(normal: [number, number, number], offset: number): Solid;
  add(other: Solid): Solid;
  subtract(other: Solid): Solid;
  intersect(other: Solid): Solid;
};

export type FlexiModelResult = { segments: number[][]; joints: number; skipped: number; axis: "x" | "z" };

function positionsOf(solid: Solid): number[] {
  const mesh = solid.getMesh();
  const out = new Array<number>(mesh.triVerts.length * 3);
  for (let i = 0; i < mesh.triVerts.length; i += 1) {
    const base = mesh.triVerts[i] * mesh.numProp;
    out[i * 3] = mesh.vertProperties[base];
    out[i * 3 + 1] = mesh.vertProperties[base + 1];
    out[i * 3 + 2] = mesh.vertProperties[base + 2];
  }
  return out;
}

/**
 * Cuts the closed mesh (world positions) into flexi segments. Throws when the mesh is not a closed
 * solid or too thin to take a joint anywhere.
 */
export async function flexiModelSegments(positions: ArrayLike<number>, raw: Partial<FlexiModelOptions> = {}): Promise<FlexiModelResult> {
  const o = { ...DEFAULT_FLEXI_MODEL, ...raw };
  const segmentsWanted = Math.max(2, Math.min(30, Math.round(o.segments)));
  const c = Math.max(0.2, Math.min(1, o.clearance));
  const half = (Math.max(5, Math.min(45, o.swing)) / 2) * (Math.PI / 180);
  const m = await getManifoldRuntime();
  const made: Solid[] = [];
  const keep = <T extends Solid>(solid: T) => {
    made.push(solid);
    return solid;
  };
  try {
    const welded = weldTriangles(positions);
    let model = keep(new m.Manifold(new m.Mesh({ numProp: 3, vertProperties: new Float32Array(welded.points.flat()), triVerts: new Uint32Array(welded.triangles.flat()) })) as unknown as Solid);
    if (model.status() !== "NoError" || model.volume() <= 0) throw new Error("This part is not a closed solid - use Make solid first");
    const box0 = model.boundingBox();
    // Work along x; a model longer in z is turned a quarter round first and back at the end.
    const axis: "x" | "z" = box0.max[2] - box0.min[2] > box0.max[0] - box0.min[0] ? "z" : "x";
    if (axis === "z") model = keep(model.rotate([0, 90, 0]));
    const box = model.boundingBox();
    const [x0, y0] = [box.min[0], box.min[1]];
    const length = box.max[0] - x0;
    const pitch = length / segmentsWanted;
    let pieces: Solid[] = [model];
    let joints = 0;
    let skipped = 0;
    for (let k = 1; k < segmentsWanted; k += 1) {
      const a = x0 + k * pitch;
      const last = pieces[pieces.length - 1];
      // What the model is like at the cut: across (z) and how high it reaches from the bottom.
      const slab = keep(last.intersect(keep(m.Manifold.cube([1, box.max[1] - y0 + 2, box.max[2] - box.min[2] + 2], false).translate([a - 0.5, y0 - 1, box.min[2] - 1]) as unknown as Solid)));
      if (slab.isEmpty()) {
        skipped += 1;
        continue;
      }
      const sb = slab.boundingBox();
      const across = sb.max[2] - sb.min[2];
      const height = sb.max[1] - y0;
      const width = Math.min(16, across * 0.6);
      const thickness = Math.min(12, height);
      if (width < 5 || thickness < 4.5) {
        skipped += 1;
        continue;
      }
      const z0 = (sb.min[2] + sb.max[2]) / 2;
      const r = width / 2;
      const layer = thickness / 3;
      const pin = Math.max(1.2, Math.min(r * 0.9, width * 0.35));
      const hole = pin + 2 * c;
      // The V: two planes through the axis, each turned by half the swing; the halves keep c/2 off each.
      const nA1: [number, number, number] = [-Math.cos(half), 0, -Math.sin(half)];
      const nA2: [number, number, number] = [-Math.cos(half), 0, Math.sin(half)];
      const offset = (n: [number, number, number]) => n[0] * a + n[2] * z0 + c / 2;
      // trimByPlane keeps the side the normal points to: n·p >= offset.
      let sideA = keep(keep(last.trimByPlane(nA1, offset(nA1))).trimByPlane(nA2, offset(nA2)));
      const nB1: [number, number, number] = [Math.cos(half), 0, Math.sin(half)];
      const nB2: [number, number, number] = [Math.cos(half), 0, -Math.sin(half)];
      let sideB = keep(keep(last.trimByPlane(nB1, offset(nB1))).trimByPlane(nB2, offset(nB2)));
      // The knuckle's room, the height of the joint, cleared from both; then each gets its part.
      const room = keep(m.Manifold.cylinder(thickness + 0.02, r + c, r + c, 64).rotate([-90, 0, 0]).translate([a, y0 - 0.01, z0]) as unknown as Solid);
      sideA = keep(sideA.subtract(room));
      sideB = keep(sideB.subtract(room));
      const disc = (y: number, h: number, radius: number) => keep(m.Manifold.cylinder(h, radius, radius, 64).rotate([-90, 0, 0]).translate([a, y, z0]) as unknown as Solid);
      const bar = (fromX: number, toX: number, y: number, h: number) => keep(m.Manifold.cube([toX - fromX, h, width], false).translate([fromX, y, z0 - r]) as unknown as Solid);
      const reach = r + c + 0.6;
      // A: the tongue in the middle layer, round at the axis, with the hole for the pin.
      const tongue = keep(keep(bar(a - reach, a, y0 + layer, layer).add(disc(y0 + layer, layer, r))).subtract(disc(y0 + layer - 0.5, layer + 1, hole / 2)));
      sideA = keep(sideA.add(tongue));
      // B: a prong under and one over the tongue, the clearance away, and the pin joining them.
      const lowTop = layer - c;
      const highBottom = 2 * layer + c;
      const fork = keep(keep(keep(keep(bar(a, a + reach, y0, lowTop).add(disc(y0, lowTop, r))).add(bar(a, a + reach, y0 + highBottom, thickness - highBottom))).add(disc(y0 + highBottom, thickness - highBottom, r))).add(disc(y0, thickness, pin / 2)));
      sideB = keep(sideB.add(fork));
      if (sideA.isEmpty() || sideB.isEmpty() || sideA.status() !== "NoError" || sideB.status() !== "NoError") {
        skipped += 1;
        continue;
      }
      pieces = [...pieces.slice(0, -1), sideA, sideB];
      joints += 1;
    }
    if (joints === 0) throw new Error("This model is too thin or narrow for flexi joints (they need about 5 mm across and 4.5 mm of height)");
    const turnedBack = axis === "z" ? pieces.map((piece) => keep(piece.rotate([0, -90, 0]))) : pieces;
    return { segments: turnedBack.map(positionsOf), joints, skipped, axis };
  } finally {
    new Set(made).forEach((solid) => {
      try {
        solid.delete();
      } catch {
        // already freed
      }
    });
  }
}
