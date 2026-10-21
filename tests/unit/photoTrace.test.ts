import { describe, expect, it } from "vitest";
import { otsuThreshold, simplify, traceImage, type TraceImage } from "@/lib/photoTrace";

/** A white "photo" with a dark shape drawn where `inside` says, and a dark table round the paper. */
function photo(width: number, height: number, inside: (x: number, y: number) => boolean, table = 0): TraceImage {
  const light = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const onTable = x < table || y < table || x >= width - table || y >= height - table;
      light[y * width + x] = onTable ? 0.1 : inside(x, y) ? 0.15 + ((x * 7 + y * 13) % 10) / 100 : 0.9 + ((x * 3 + y * 5) % 8) / 100;
    }
  }
  return { width, height, light };
}

describe("photo to outline (build 21)", () => {
  it("finds a threshold between dark and light", () => {
    const value = otsuThreshold(new Float32Array([0.1, 0.12, 0.15, 0.85, 0.9, 0.95]));
    expect(value).toBeGreaterThan(0.15);
    expect(value).toBeLessThan(0.85);
  });

  it("traces a rectangle to about four corners at its size", () => {
    const result = traceImage(photo(200, 150, (x, y) => x >= 40 && x < 160 && y >= 50 && y < 100));
    expect(result).not.toBeNull();
    expect(result!.widthPx).toBeCloseTo(120, -1);
    expect(result!.heightPx).toBeCloseTo(50, -1);
    expect(result!.outline.length).toBeLessThanOrEqual(10);
  });

  it("traces a circle as a round outline", () => {
    const result = traceImage(photo(200, 200, (x, y) => (x - 100) ** 2 + (y - 100) ** 2 < 60 ** 2));
    expect(result).not.toBeNull();
    expect(result!.widthPx).toBeCloseTo(120, -1);
    expect(result!.outline.length).toBeGreaterThan(12);
  });

  it("ignores a dark table round the paper and finds the object", () => {
    const result = traceImage(photo(240, 200, (x, y) => x >= 90 && x < 150 && y >= 80 && y < 120, 15));
    expect(result).not.toBeNull();
    expect(result!.widthPx).toBeCloseTo(60, -1);
  });

  it("gives up on a blank photo", () => {
    expect(traceImage(photo(100, 100, () => false))).toBeNull();
  });

  it("simplifies a straight run to its ends", () => {
    expect(simplify([[0, 0], [1, 0.01], [2, 0], [3, 0.01], [4, 0]], 0.5)).toEqual([[0, 0], [4, 0]]);
  });
});
