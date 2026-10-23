import { describe, expect, it } from "vitest";
import { keyringTabShape, keyringTabTag } from "@/lib/editorTextTags";
import { shapeBedFootprint } from "@/lib/printBed";
import { restoreGroupedChildren } from "@/lib/editorBooleans";
import type { WorkplaneShape } from "@/types/layerling";

// #598: "Free" puts a key ring tab of its own beside a tag, an ordinary group to move and turn.
const tag = (overrides: Partial<WorkplaneShape> = {}): WorkplaneShape => ({
  id: "tag", name: "Tag", kind: "cube", color: "#2b2b2b", x: 10, z: -4, elevation: 2, rotation: 0,
  width: 40, depth: 16, height: 5.4, size: 40, ...overrides,
});

describe("the key ring tab of its own (#598)", () => {
  it.each([3, 5])("has the side tab's measures round a %s mm hole, in the bottom layer's colour and height", (diameter) => {
    const tab = keyringTabShape(tag(), { color: "#123456", height: 3, elevation: 2 }, diameter, "Key ring tab");
    const radius = diameter / 2 + 1.75;
    expect(tab.name).toBe("Key ring tab");
    expect(tab.color).toBe("#123456");
    expect(tab.hole).toBe(false);
    expect(tab.elevation).toBeCloseTo(2, 6);
    expect(tab.height).toBeCloseTo(3, 6);
    const parts = restoreGroupedChildren(tab);
    const capsule = parts.find((part) => part.kind === "slot")!;
    const hole = parts.find((part) => part.kind === "cylinder")!;
    expect(capsule.hole).toBe(false);
    expect(hole.hole).toBe(true);
    // As wide as the hole and a 1.75 mm wall either side; the hole the size asked for.
    expect(capsule.depth).toBeCloseTo(2 * radius, 3);
    expect(hole.width).toBeCloseTo(diameter, 6);
    expect(hole.depth).toBeCloseTo(diameter, 6);
    const footprint = shapeBedFootprint(tag());
    // The hole's edge 2 mm beyond the tag's left side, level with its middle.
    expect(hole.x).toBeCloseTo(footprint.minX - 2 - diameter / 2, 3);
    expect(hole.z).toBeCloseTo((footprint.minZ + footprint.maxZ) / 2, 3);
    // The round end round the hole, the straight end half the tab's width on the tag.
    expect(capsule.x - capsule.width! / 2).toBeCloseTo(hole.x - radius, 3);
    expect(capsule.x + capsule.width! / 2).toBeCloseTo(footprint.minX + radius, 3);
  });

  it("is a group of its own that moves and turns like any shape", () => {
    const tab = keyringTabShape(tag({ rotation: 30 }), { color: "#2b2b2b", height: 3, elevation: 0 }, 3, "Key ring tab");
    expect(tab.groupedShapes).toHaveLength(2);
    expect(tab.groupOperation).toBeUndefined();
    expect(tab.rotation).toBe(0);
    expect(tab.id).not.toBe("tag");
    expect(tab.keyringTab).toBe(true);
  });

  it("is kept with the nearest name tag or icon tag that is neither locked nor hidden", () => {
    const tab = keyringTabShape(tag(), { color: "#2b2b2b", height: 3, elevation: 0 }, 3, "Key ring tab");
    const bundle = (id: string, x: number, extra: Partial<WorkplaneShape> = {}) => tag({ id, x, groupOperation: "bundle", groupedShapes: [tag({ id: `${id}-part` })], ...extra });
    const near = bundle("near", 10, { layeredText: true });
    const far = bundle("far", 200, { layeredIcon: true });
    const plain = bundle("plain", 5);
    const box = tag({ id: "box", x: 0 });
    expect(keyringTabTag(tab, [far, near, plain, box, tab])?.id).toBe("near");
    expect(keyringTabTag(tab, [far, { ...near, locked: true }])?.id).toBe("far");
    expect(keyringTabTag(tab, [far, { ...near, hidden: true }])?.id).toBe("far");
    expect(keyringTabTag(tab, [plain, box, tab])).toBeNull();
  });
});
