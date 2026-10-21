import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { buildReadyPart } from "@/lib/readyPartsBuild";
import { DEFAULT_ENCLOSURE, enclosureInside, enclosureParts } from "@/lib/enclosure";
import { fitTestParts } from "@/lib/fitTest";
import { loadTextFonts } from "@/lib/textFonts";
import type { WorkplaneShape } from "@/types/layerling";

function volume(shape: WorkplaneShape) {
  const positions = shape.importedMesh!.positions;
  let total = 0;
  for (let index = 0; index + 8 < positions.length; index += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(index, index + 9);
    total += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(total / 6);
}
const names = { box: "Enclosure", lid: "Lid", standoff: "Standoff", port: "Port", vent: "Vent" };

describe("electronics enclosure (build 21)", () => {
  it("builds a box with standoffs and a lid, both solid", async () => {
    const parts = enclosureParts(DEFAULT_ENCLOSURE, names);
    expect(parts).toHaveLength(2);
    const [box, lid] = await Promise.all(parts.map((part) => buildReadyPart(part, 250_000)));
    const inside = enclosureInside(DEFAULT_ENCLOSURE);
    // Outside size: the inside plus a wall each side.
    expect(box.width).toBeCloseTo(inside.width + 4, 0);
    expect(box.depth).toBeCloseTo(inside.depth + 4, 0);
    expect(volume(box)).toBeGreaterThan(0);
    expect(volume(lid)).toBeGreaterThan(0);
  });

  it("standoffs add material and a port takes some away", async () => {
    const plain = await buildReadyPart(enclosureParts({ ...DEFAULT_ENCLOSURE, screw: "none", ports: [] }, names)[0], 250_000);
    const withPosts = await buildReadyPart(enclosureParts({ ...DEFAULT_ENCLOSURE, ports: [] }, names)[0], 250_000);
    const withPort = await buildReadyPart(enclosureParts({ ...DEFAULT_ENCLOSURE, screw: "none" }, names)[0], 250_000);
    expect(volume(withPosts)).toBeGreaterThan(volume(plain) + 50);
    expect(volume(withPort)).toBeLessThan(volume(plain) - 10);
  });
});

describe("fit test (build 21)", () => {
  beforeAll(async () => {
    await loadTextFonts();
  });
  it("builds a strip with five holes and a peg", async () => {
    const [strip, peg] = await Promise.all(fitTestParts({ strip: "Fit test", peg: "Peg" }).map((part) => buildReadyPart(part, 250_000)));
    expect(strip.width).toBeCloseTo(64, 0);
    // The strip is 64 x 20 x 4 less five holes of about 6 mm and the cut-in labels.
    const solidStrip = 64 * 20 * 4;
    expect(volume(strip)).toBeLessThan(solidStrip - 5 * Math.PI * 9 * 4 + 50);
    expect(peg.height).toBeCloseTo(12, 0);
  });
});
