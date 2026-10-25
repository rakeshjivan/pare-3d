// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ShapeInspector } from "@/components/workplane/ShapeInspector";
import { makeShapeFromAsset, toolbarShapeAssets } from "@/lib/shapeCatalog";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import type { WorkplaneShape } from "@/types/layerling";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A Gridfinity baseplate's padding in its settings (#455): a row for each side on a baseplate and
 * none on a bin, and a change of padding writes the plate's size with it, keeping the units.
 */
beforeAll(() => {
  // jsdom lays nothing out; the panel only scrolls itself back to the top.
  Element.prototype.scrollTo ??= () => {};
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

/** The settings panel for a Gridfinity part with these fields. */
function mount(fields: Partial<WorkplaneShape>, onUpdate: (patch: Partial<WorkplaneShape>) => void = () => {}) {
  const asset = toolbarShapeAssets.find((entry) => entry.kind === "gridfinity")!;
  const shape = { ...makeShapeFromAsset(asset, { x: 0, z: 0 }), ...fields } as WorkplaneShape;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(ShapeInspector, { shape, snap: DEFAULT_SNAP_GRID, snapOpen: false, workspace: DEFAULT_WORKPLANE_WORKSPACE, onUpdate, onSnapChange: () => {}, onSnapOpenChange: () => {} }));
  });
  return container;
}

const rowNamed = (panel: HTMLElement, name: string) => [...panel.querySelectorAll<HTMLLabelElement>("label.range-property")].find((row) => row.querySelector(".range-property-name")?.textContent === name);

function type(input: HTMLInputElement, value: string) {
  act(() => input.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => input.blur());
}

const sides = ["Padding at the back", "Padding at the front", "Padding on the left", "Padding on the right"];
const plate = { gridfinityType: "baseplate" as const, width: 252, depth: 42, height: 5 };

describe("a Gridfinity baseplate's padding in its settings", () => {
  it("has a row for each side on a baseplate, showing its padding", () => {
    const panel = mount({ ...plate, width: 266.2, gridfinityPaddingRight: 14.2 });
    sides.forEach((side) => expect(rowNamed(panel, side), side).toBeDefined());
    expect(rowNamed(panel, "Padding on the right")!.querySelector<HTMLInputElement>("input:not([type=range])")!.value).toContain("14.2");
  });

  it("has no padding rows on a bin, which keeps the setting", () => {
    const panel = mount({ gridfinityType: "bin", gridfinityPaddingRight: 14.2 });
    sides.forEach((side) => expect(rowNamed(panel, side), side).toBeUndefined());
  });

  it("writes the plate's size with a new padding, keeping its six units", () => {
    const updates: Partial<WorkplaneShape>[] = [];
    const panel = mount(plate, (patch) => updates.push(patch));
    type(rowNamed(panel, "Padding on the right")!.querySelector<HTMLInputElement>("input:not([type=range])")!, "41");
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ gridfinityPaddingRight: 41, width: 293, depth: 42 });
  });
});
