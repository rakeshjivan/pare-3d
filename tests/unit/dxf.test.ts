// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { dxfToSvg, joinOutlines, svgOutlinesToDxf } from "@/lib/dxf";
import { importModelFiles } from "@/lib/modelImport";

/* Fork (build 55): DXF in and out. */

const dxf = (header: string, entities: string) => ["0", "SECTION", "2", "HEADER", header, "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", entities, "0", "ENDSEC", "0", "EOF"].join("\n");
const units = (code: number) => `9\n$INSUNITS\n70\n${code}`;
const line = (x1: number, y1: number, x2: number, y2: number) => `0\nLINE\n8\n0\n10\n${x1}\n20\n${y1}\n11\n${x2}\n21\n${y2}`;
const circle = (x: number, y: number, r: number) => `0\nCIRCLE\n8\n0\n10\n${x}\n20\n${y}\n40\n${r}`;
const box = (w: number, h: number) => [line(0, 0, w, 0), line(w, 0, w, h), line(w, h, 0, h), line(0, h, 0, 0)].join("\n");

function viewBox(svg: string) {
  return /viewBox="([^"]+)"/.exec(svg)![1].split(" ").map(Number);
}

describe("DXF (build 55)", () => {
  it("joins loose lines end to end into one closed outline", () => {
    const joined = joinOutlines([
      { points: [[0, 0], [10, 0]], closed: false },
      { points: [[10, 5], [10, 0]], closed: false },
      { points: [[0, 5], [10, 5]], closed: false },
      { points: [[0, 0], [0, 5]], closed: false },
    ]);
    expect(joined).toHaveLength(1);
    expect(joined[0].closed).toBe(true);
    expect(joined[0].points).toHaveLength(4);
  });

  it("reads a plate with a hole at its size in mm, and in inches", () => {
    const mm = dxfToSvg(dxf(units(4), [box(40, 20), circle(20, 10, 5)].join("\n")));
    expect(mm.outlines).toBe(2);
    expect(viewBox(mm.svg).slice(2)).toEqual([40, 20]);
    const inches = dxfToSvg(dxf(units(1), box(2, 1)));
    expect(viewBox(inches.svg).slice(2)).toEqual([50.8, 25.4]);
  });

  it("follows polyline bulges, arcs and blocks placed with INSERT", () => {
    // A slot: two straight sides and two half-circle ends as bulges of 1.
    const slot = "0\nLWPOLYLINE\n8\n0\n90\n4\n70\n1\n10\n0\n20\n0\n10\n20\n20\n0\n42\n1\n10\n20\n20\n10\n10\n0\n20\n10\n42\n1";
    const result = dxfToSvg(dxf(units(4), slot));
    expect(viewBox(result.svg).slice(2).map((v) => Math.round(v * 10) / 10)).toEqual([30, 10]);
    const blocks = ["0", "SECTION", "2", "BLOCKS", "0\nBLOCK\n2\nSQ\n10\n0\n20\n0", box(5, 5), "0\nENDBLK", "0", "ENDSEC"].join("\n");
    const placed = ["0", "SECTION", "2", "HEADER", units(4), "0", "ENDSEC", blocks, "0", "SECTION", "2", "ENTITIES", "0\nINSERT\n2\nSQ\n10\n100\n20\n0\n41\n2\n42\n2", "0\nINSERT\n2\nSQ\n10\n0\n20\n0", "0", "ENDSEC", "0", "EOF"].join("\n");
    const inserted = dxfToSvg(placed);
    expect(inserted.outlines).toBe(2);
    expect(viewBox(inserted.svg).slice(2)).toEqual([110, 10]);
  });

  it("says so when nothing closes", () => {
    expect(() => dxfToSvg(dxf(units(4), line(0, 0, 10, 0)))).toThrow(/no closed outline/);
    expect(() => dxfToSvg("not a drawing")).toThrow(/not a DXF/);
  });

  it("comes in through the import window as a body of its size", async () => {
    const file = new File([dxf(units(4), [box(40, 20), circle(20, 10, 5)].join("\n"))], "plate.dxf");
    const result = (await importModelFiles([file]))!;
    expect(result.failures).toEqual([]);
    expect(result.shapes[0].width).toBeCloseTo(40, 1);
    expect(result.shapes[0].depth).toBeCloseTo(20, 1);
    expect(result.assets[0].name).toBe("plate.svg");
  });

  it("writes an exported SVG's outlines as a DXF that reads back the same", () => {
    const svg = '<svg viewBox="0 0 40 20"><path data-name="Plate" d="M0 0 L40 0 L40 20 L0 20 Z M15 5 L25 5 L25 15 L15 15 Z" fill="#d41721"/></svg>';
    const { dxf: written, outlines } = svgOutlinesToDxf(svg);
    expect(outlines).toBe(2);
    expect(written).toContain("AC1009");
    expect(written).toContain("\r\nPlate\r\n");
    const back = dxfToSvg(written);
    expect(back.outlines).toBe(2);
    expect(viewBox(back.svg).slice(2)).toEqual([40, 20]);
  });
});
