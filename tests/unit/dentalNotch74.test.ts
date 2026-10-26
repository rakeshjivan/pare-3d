import { describe, expect, it } from "vitest";
import manifoldModule from "manifold-3d";
import { locatorNotches, NOTCH_HEIGHT, NOTCH_RADIUS } from "@/lib/dentalBase";

describe("locator notches on hollow models (build 74)", () => {
  it("grows each notch by the wall, so a hollow model keeps a collar of solid round it", async () => {
    const runtime = await (manifoldModule as unknown as () => Promise<any>)();
    runtime.setup();
    const square: Array<[number, number]> = [[-30, -30], [30, -30], [30, 30], [-30, 30]];
    const plain = locatorNotches(runtime, square, 0);
    const collar = locatorNotches(runtime, square, 0, 2);
    const count = plain.decompose().length;
    expect(count).toBeGreaterThan(0);
    expect(plain.boundingBox().max[2]).toBeCloseTo(NOTCH_HEIGHT, 1);
    expect(collar.boundingBox().max[2]).toBeCloseTo(NOTCH_HEIGHT + 2, 1);
    // Each collar holds its notch with the wall all round.
    const inside = runtime.Manifold.difference(plain, collar);
    expect(inside.volume()).toBeLessThan(1e-6);
    const one = Math.PI * NOTCH_RADIUS ** 2 * NOTCH_HEIGHT;
    expect(collar.volume()).toBeGreaterThan(count * one * 4);
  });
});
