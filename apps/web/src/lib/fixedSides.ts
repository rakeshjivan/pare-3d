import { roundSideCount } from "@/lib/roundSideCount";
import { torusTessellation } from "@/lib/torusTessellation";
import type { WorkplaneShape } from "@/types/layerling";

/**
 * Fork (build 22): a round shape added from the panel starts with its sides set ("Sides follow the
 * size" off), at the count that size would give, so the Sides slider works straight away. People
 * who want smoother curves were turning a greyed-out slider and seeing nothing change. The sizes
 * passed are the ones the shape's settings use for the same count.
 */
export function withFixedSides(shape: WorkplaneShape): WorkplaneShape {
  if (shape.kind === "torus") {
    if (shape.sides !== undefined || shape.steps !== undefined) return shape;
    const tessellation = torusTessellation(shape, shape.width, shape.depth, shape.height);
    return { ...shape, sides: tessellation.ringSides, steps: tessellation.tubeSteps };
  }
  if (shape.sides !== undefined) return shape;
  const across = (() => {
    switch (shape.kind) {
      case "cylinder":
      case "ellipse":
      case "cone":
      case "counterbore":
      case "countersink":
      case "doubleCountersink":
        return [shape.width, shape.depth] as const;
      case "teardrop":
        return [shape.width, shape.width] as const;
      case "slot": {
        const narrow = Math.min(shape.width, shape.depth);
        return [narrow, narrow] as const;
      }
      default:
        return null;
    }
  })();
  return across ? { ...shape, sides: roundSideCount(undefined, across[0], across[1]) } : shape;
}
