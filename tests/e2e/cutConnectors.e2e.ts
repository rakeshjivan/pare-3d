import { beforeAll, describe, expect, it, vi } from "vitest";
import manifoldModule from "manifold-3d";
import type { WorkplaneShape } from "@/types/layerling";
import { exportSolidVolume, planCutConnectors, splitShapesByPlane } from "@/lib/editorBooleans";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";
import { normalizeCutConnectors, SOCKET_EXTRA_DEPTH } from "@/lib/cutConnectors";

/** Fork: plugs and dowels on a cut, measured by volume against a plain split of the same box. */
const kernel = vi.hoisted(() => ({ runtime: null as Promise<unknown> | null }));
vi.mock("@/lib/editorMeshCore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/editorMeshCore")>()),
  getManifoldRuntime: () => kernel.runtime,
}));

beforeAll(async () => {
  kernel.runtime = manifoldModule().then((runtime) => {
    runtime.setup();
    rememberManifoldRuntime(runtime);
    return runtime;
  });
  await kernel.runtime;
});

// 60 wide (x), 20 deep, 20 high, cut across x at its middle.
const box = (): WorkplaneShape => ({ id: "box", name: "Box", kind: "box", color: "#2f7de1", x: 0, z: 0, elevation: 0, rotation: 0, width: 60, depth: 20, size: 60, height: 20 }) as WorkplaneShape;
const plane = { axis: "x" as const, normal: [1, 0, 0] as [number, number, number], position: 0 };
const volume = async (shape: WorkplaneShape) => (await exportSolidVolume([shape])).volumeMm3;
const cylinder = (diameter: number, length: number) => Math.PI * (diameter / 2) ** 2 * length;

async function split(connectors?: Parameters<typeof normalizeCutConnectors>[0]) {
  const outcome = await splitShapesByPlane([box()], plane, () => true, connectors ? normalizeCutConnectors(connectors) : undefined);
  if (outcome.status !== "done") throw new Error(JSON.stringify(outcome.status === "failed" ? outcome.error : outcome.status));
  const [positive, negative] = outcome.replacements.get("box")!;
  return { positive, negative, outcome, vp: await volume(positive), vn: await volume(negative) };
}

describe("cut connectors", () => {
  it("plug: a peg on the - half (it prints standing on its base), a looser, deeper socket in the + half", async () => {
    const plain = await split();
    const plug = await split({ type: "plug", diameter: 6, depth: 5, clearance: 0.2 });
    expect(plug.outcome.status === "done" && plug.outcome.connectorCount).toBe(1);
    // The peg's tip is chamfered, so it adds a little less than a full cylinder.
    const added = plug.vn - plain.vn;
    expect(added).toBeLessThan(cylinder(6, 5));
    expect(added).toBeGreaterThan(cylinder(6, 5) * 0.93);
    const removed = plain.vp - plug.vp;
    expect(removed).toBeCloseTo(cylinder(6.2, 5 + SOCKET_EXTRA_DEPTH), -0.3);
    // The - half now reaches 5 mm past the cut.
    expect(plug.negative.width).toBeCloseTo(35, 1);
  });

  it("plug flipped: the peg moves to the + half", async () => {
    const plain = await split();
    const plug = await split({ type: "plug", diameter: 6, depth: 5, flip: true });
    expect(plug.vp).toBeGreaterThan(plain.vp);
    expect(plug.vn).toBeLessThan(plain.vn);
  });

  it("dowel: a socket in each half and a separate pin twice the depth", async () => {
    const plain = await split();
    const dowel = await split({ type: "dowel", diameter: 4, depth: 6, clearance: 0.2, perPiece: 2 });
    expect(dowel.outcome.status === "done" && dowel.outcome.pins.length).toBe(2);
    const socket = cylinder(4.2, 6 + SOCKET_EXTRA_DEPTH);
    expect(plain.vp - dowel.vp).toBeCloseTo(2 * socket, -0.5);
    expect(plain.vn - dowel.vn).toBeCloseTo(2 * socket, -0.5);
    const pin = dowel.outcome.status === "done" ? dowel.outcome.pins[0] : null;
    expect(pin?.height).toBeCloseTo(12, 3);
    expect(pin?.width).toBeCloseTo(4, 1);
  });

  it("previews two points spread along the long side of the face", async () => {
    const plan = await planCutConnectors([box()], plane, normalizeCutConnectors({ type: "plug", diameter: 4, perPiece: 2 }));
    expect(plan.points).toHaveLength(2);
    plan.points.forEach(([x]) => expect(x).toBeCloseTo(0, 5));
  });

  it("refuses a connector too big for the face, and one that would break through", async () => {
    const big = await splitShapesByPlane([box()], plane, () => true, normalizeCutConnectors({ type: "plug", diameter: 20 }));
    expect(big.status).toBe("failed");
    const long = await splitShapesByPlane([box()], plane, () => true, normalizeCutConnectors({ type: "dowel", diameter: 5, depth: 40 }));
    expect(long.status).toBe("failed");
  });

  describe("placed by hand", () => {
    // The cut face is the 20 x 20 square at x = 0: y 0..20 (up), z -10..10.
    const manual = (extra: Parameters<typeof normalizeCutConnectors>[0] = {}) => normalizeCutConnectors({ type: "plug", diameter: 4, placement: "manual", ...extra });

    it("puts plugs exactly where they were clicked", async () => {
      const points: [number, number, number][] = [[0, 5, -5], [0, 15, 5], [0, 10, 0]];
      const outcome = await splitShapesByPlane([box()], plane, () => true, manual(), points);
      expect(outcome.status).toBe("done");
      if (outcome.status === "done") expect(outcome.connectorCount).toBe(3);
      const plan = await planCutConnectors([box()], plane, manual(), points);
      expect(plan.points).toHaveLength(3);
      expect(plan.invalid).toHaveLength(0);
    });

    it("marks a point with no room for its socket, and refuses the split", async () => {
      const points: [number, number, number][] = [[0, 10, 0], [0, 1, 0]];
      const plan = await planCutConnectors([box()], plane, manual(), points);
      expect(plan.points).toHaveLength(1);
      expect(plan.invalid).toHaveLength(1);
      const outcome = await splitShapesByPlane([box()], plane, () => true, manual(), points);
      expect(outcome.status).toBe("failed");
    });

    it("marks two points too close for a wall between their sockets", async () => {
      const points: [number, number, number][] = [[0, 10, 0], [0, 10, 4]];
      const plan = await planCutConnectors([box()], plane, manual(), points);
      expect(plan.invalid).toHaveLength(2);
      expect((await splitShapesByPlane([box()], plane, () => true, manual(), points)).status).toBe("failed");
      // 6 mm apart leaves room: 4.2 mm socket plus a 1.2 mm wall.
      const apart = await planCutConnectors([box()], plane, manual(), [[0, 10, -3], [0, 10, 3]]);
      expect(apart.points).toHaveLength(2);
    });

    it("refuses to split with none placed", async () => {
      expect((await splitShapesByPlane([box()], plane, () => true, manual(), [])).status).toBe("failed");
    });
  });
});
