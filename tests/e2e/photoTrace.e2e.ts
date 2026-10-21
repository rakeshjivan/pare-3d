import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { getManifoldRuntime } from "@/lib/editorMeshCore";
import { tracedSolidPositions, traceImage, DEFAULT_TRACE } from "@/lib/photoTrace";

function rectanglePhoto() {
  const width = 300, height = 200;
  const light = new Float32Array(width * height).fill(0.92);
  for (let y = 60; y < 140; y += 1) for (let x = 50; x < 250; x += 1) light[y * width + x] = 0.12;
  return { width, height, light };
}

describe("photo to outline as a solid (build 21)", () => {
  it("makes a cut-out the traced length plus the clearance", async () => {
    const runtime = await getManifoldRuntime();
    const trace = traceImage(rectanglePhoto())!;
    const positions = tracedSolidPositions(runtime, trace, { ...DEFAULT_TRACE, length: 100, clearance: 1, height: 20 });
    const xs = positions.filter((_, i) => i % 3 === 0), ys = positions.filter((_, i) => i % 3 === 1), zs = positions.filter((_, i) => i % 3 === 2);
    // 200 x 80 pixels traced to 100 mm long: 100 x 40 mm, grown by 1 mm all round.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(102, 0);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(42, 0);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(20, 1);
  });
});
