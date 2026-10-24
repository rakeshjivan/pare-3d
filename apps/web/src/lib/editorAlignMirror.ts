import * as THREE from "three";
import { t } from "@/lib/i18n";
import { cuboidAlongAxes, shiftAlongAxis, type AlignAxes } from "@/lib/alignFrame";
import { cleanNearZero } from "@/lib/workplaneShapes";
import { alignNaturalCenter, type AlignPoint } from "@/lib/alignCenter";
import type { AlignAxis, AlignHandleStatus, AlignTarget, WorkplaneShape } from "@/types/layerling";
import { type Cuboid, meshForShape, shapeAabb, boundsForShapes, boundsForCuboids, meshAabb } from "@/lib/editorMeshCore";
import { quaternionForShape, rotationFromQuaternion } from "@/lib/editorBooleans";

/* Align and Mirror for a selection: where each part goes, the labels the tools show, and the mirrored shapes. Moved out of LayerlingEditor (build 55). */

export const ALIGN_EPSILON = 0.0005;
export const ALIGN_AXES: AlignAxis[] = ["x", "y", "z"];
export const ALIGN_TARGETS: AlignTarget[] = ["min", "center", "max"];

export function alignCoordinate(bounds: Cuboid, axis: AlignAxis, target: AlignTarget, natural: AlignPoint | null = null, axes: AlignAxes | null = null) {
  const min = axis === "x" ? bounds.minX : axis === "y" ? bounds.minY : bounds.minZ;
  const max = axis === "x" ? bounds.maxX : axis === "y" ? bounds.maxY : bounds.maxZ;
  if (target === "min") {
    return min;
  }
  if (target === "max") {
    return max;
  }
  // The middle of a pentagon or a star is not the middle of its box (#268).
  if (natural) {
    if (!axes) return natural[axis];
    const direction = axes[axis];
    return natural.x * direction.x + natural.y * direction.y + natural.z * direction.z;
  }
  return (min + max) / 2;
}

export function alignmentLabel(axis: AlignAxis, target: AlignTarget) {
  if (axis === "x") {
    return target === "min" ? t("align.left") : target === "max" ? t("align.right") : t("align.center");
  }
  if (axis === "z") {
    return target === "min" ? t("align.front") : target === "max" ? t("align.back") : t("align.middle");
  }
  return target === "min" ? t("align.bottom") : target === "max" ? t("align.top") : t("align.middle");
}

/** The box of a part along a workplane's axes, as the alignment measures it there (#232). */
export function frameAabb(shape: WorkplaneShape, axes: AlignAxes): Cuboid {
  const mesh = shape.cylinderWrap && shape.importedMesh ? null : meshForShape(shape);
  const own = mesh && mesh.vertices.length > 0 ? cuboidAlongAxes(mesh.vertices, axes) : null;
  if (own) return own;
  const box = shapeAabb(shape);
  const corners: Array<[number, number, number]> = [];
  for (const x of [box.minX, box.maxX]) for (const y of [box.minY, box.maxY]) for (const z of [box.minZ, box.maxZ]) corners.push([x, y, z]);
  return cuboidAlongAxes(corners, axes) ?? box;
}

export function alignmentStatuses(selection: WorkplaneShape[], anchorId: string | null, axes: AlignAxes | null = null): AlignHandleStatus[] {
  if (selection.length < 2) {
    return [];
  }

  const boundsById = new Map(selection.map((shape) => [shape.id, axes ? frameAabb(shape, axes) : meshAabb(shape)]));
  const naturalById = new Map(selection.map((shape) => [shape.id, alignNaturalCenter(shape)]));
  const anchorBounds = anchorId ? boundsById.get(anchorId) ?? null : null;
  const referenceBounds = anchorBounds ?? boundsForCuboids(Array.from(boundsById.values()));
  const referenceNatural = anchorBounds && anchorId ? naturalById.get(anchorId) ?? null : null;

  return ALIGN_AXES.flatMap((axis) =>
    ALIGN_TARGETS.map((target) => {
      const targetValue = alignCoordinate(referenceBounds, axis, target, referenceNatural, axes);
      const aligned = selection.every((shape) => {
        const bounds = boundsById.get(shape.id);
        return bounds ? Math.abs(alignCoordinate(bounds, axis, target, naturalById.get(shape.id) ?? null, axes) - targetValue) <= ALIGN_EPSILON : true;
      });
      const wouldMove = selection.some((shape) => {
        if (shape.locked || shape.id === anchorId) {
          return false;
        }
        const bounds = boundsById.get(shape.id);
        return bounds ? Math.abs(alignCoordinate(bounds, axis, target, naturalById.get(shape.id) ?? null, axes) - targetValue) > ALIGN_EPSILON : false;
      });
      const label = alignmentLabel(axis, target);
      return {
        axis,
        target,
        aligned,
        disabled: !wouldMove,
        title: aligned ? t("align.already", { label }) : t("align.do", { label }),
      };
    }),
  );
}

export function alignedShapesForSelection(
  shapes: WorkplaneShape[],
  selectedIds: string[],
  selectedShapes: WorkplaneShape[],
  anchorId: string | null,
  axis: AlignAxis,
  target: AlignTarget,
  axes: AlignAxes | null = null,
) {
  const selected = new Set(selectedIds);
  const boundsById = new Map(selectedShapes.map((shape) => [shape.id, axes ? frameAabb(shape, axes) : meshAabb(shape)]));
  const naturalById = new Map(selectedShapes.map((shape) => [shape.id, alignNaturalCenter(shape)]));
  const anchorBounds = anchorId ? boundsById.get(anchorId) ?? null : null;
  const referenceBounds = anchorBounds ?? boundsForCuboids(Array.from(boundsById.values()));
  const referenceNatural = anchorBounds && anchorId ? naturalById.get(anchorId) ?? null : null;
  const targetValue = alignCoordinate(referenceBounds, axis, target, referenceNatural, axes);
  let moved = 0;

  const nextShapes = shapes.map((shape) => {
    if (!selected.has(shape.id) || shape.locked || shape.id === anchorId) {
      return shape;
    }
    const bounds = boundsById.get(shape.id);
    if (!bounds) {
      return shape;
    }
    const delta = targetValue - alignCoordinate(bounds, axis, target, naturalById.get(shape.id) ?? null, axes);
    if (Math.abs(delta) <= ALIGN_EPSILON) {
      return shape;
    }
    moved += 1;
    if (axes) {
      // Along a workplane's axes the part moves along that axis of the world (#232).
      const shift = shiftAlongAxis(axes, axis, delta);
      return {
        ...shape,
        x: cleanNearZero(Number((shape.x + shift.x).toFixed(4)), ALIGN_EPSILON),
        z: cleanNearZero(Number((shape.z + shift.z).toFixed(4)), ALIGN_EPSILON),
        elevation: cleanNearZero(Number(((shape.elevation ?? 0) + shift.y).toFixed(4)), ALIGN_EPSILON),
      };
    }
    if (axis === "x") {
      return { ...shape, x: cleanNearZero(Number((shape.x + delta).toFixed(4)), ALIGN_EPSILON) };
    }
    if (axis === "z") {
      return { ...shape, z: cleanNearZero(Number((shape.z + delta).toFixed(4)), ALIGN_EPSILON) };
    }
    return { ...shape, elevation: cleanNearZero(Number(((shape.elevation ?? 0) + delta).toFixed(4)), ALIGN_EPSILON) };
  });

  return { nextShapes, moved };
}

export function effectiveAlignmentAnchorId(selection: WorkplaneShape[], requestedAnchorId: string | null) {
  return selection.find((shape) => shape.locked)?.id
    ?? (requestedAnchorId && selection.some((shape) => shape.id === requestedAnchorId) ? requestedAnchorId : null);
}

export function mirrorAxisLabel(axis: AlignAxis) {
  return axis === "x" ? t("mirror.leftRight") : axis === "z" ? t("mirror.frontBack") : t("mirror.topBottom");
}

export function mirrorFlagPatch(shape: WorkplaneShape, axis: AlignAxis) {
  if (axis === "x") {
    return { mirrorX: !shape.mirrorX };
  }
  if (axis === "z") {
    return { mirrorZ: !shape.mirrorZ };
  }
  return { mirrorY: !shape.mirrorY };
}

export function reflectionMatrixForAxis(axis: AlignAxis) {
  return new THREE.Matrix4().makeScale(axis === "x" ? -1 : 1, axis === "y" ? -1 : 1, axis === "z" ? -1 : 1);
}

export function mirroredShapePatch(shape: WorkplaneShape, axis: AlignAxis, pivot: number): Partial<WorkplaneShape> {
  const centerY = (shape.elevation ?? 0) + shape.height / 2;
  const nextCenter = axis === "x" ? 2 * pivot - shape.x : axis === "z" ? 2 * pivot - shape.z : 2 * pivot - centerY;
  const worldReflection = reflectionMatrixForAxis(axis);
  const localReflection = reflectionMatrixForAxis(axis);
  const currentRotation = new THREE.Matrix4().makeRotationFromQuaternion(quaternionForShape(shape));
  const nextRotationMatrix = worldReflection.multiply(currentRotation).multiply(localReflection);
  const nextQuaternion = new THREE.Quaternion().setFromRotationMatrix(nextRotationMatrix);
  const rotationPatch = rotationFromQuaternion(nextQuaternion);
  const positionPatch =
    axis === "x"
      ? { x: cleanNearZero(Number(nextCenter.toFixed(4)), ALIGN_EPSILON) }
      : axis === "z"
        ? { z: cleanNearZero(Number(nextCenter.toFixed(4)), ALIGN_EPSILON) }
        : { elevation: cleanNearZero(Number((nextCenter - shape.height / 2).toFixed(4)), ALIGN_EPSILON) };

  return {
    ...shape,
    ...positionPatch,
    ...rotationPatch,
    ...mirrorFlagPatch(shape, axis),
  };
}

export function mirroredShapesForSelection(shapes: WorkplaneShape[], selectedIds: string[], selectedShapes: WorkplaneShape[], axis: AlignAxis) {
  if (selectedShapes.length === 0) {
    return { nextShapes: shapes, moved: 0 };
  }

  const selected = new Set(selectedIds);
  const selectionBounds = boundsForShapes(selectedShapes);
  const pivot = axis === "x" ? (selectionBounds.minX + selectionBounds.maxX) / 2 : axis === "z" ? (selectionBounds.minZ + selectionBounds.maxZ) / 2 : (selectionBounds.minY + selectionBounds.maxY) / 2;
  let moved = 0;
  const nextShapes = shapes.map((shape) => {
    if (!selected.has(shape.id) || shape.locked) {
      return shape;
    }
    moved += 1;
    return {
      ...shape,
      ...mirroredShapePatch(shape, axis, pivot),
    };
  });

  return { nextShapes, moved };
}
