"use client";

import { t } from "@/lib/i18n";
import { MORE_SHAPE_AFTER, MORE_SHAPE_IDS, moreShapeDragId, moreShapeIcon, type MoreShapeId } from "@/lib/moreShapes";

/**
 * Fork (build 21): the extra basic shapes, in the same grid as the library's own, each just after
 * the shape it is a variant of (`after`); with `after` unset, the ones whose neighbour is not on show.
 * Click to place, or drag onto the plate, like the others.
 */
export function MoreShapesSection({
  after,
  present,
  onAdd,
  onDragDone,
}: {
  after: string | undefined;
  present: ReadonlySet<string>;
  onAdd: (id: MoreShapeId) => void;
  onDragDone?: () => void;
}) {
  const ids = MORE_SHAPE_IDS.filter((id) => (after === undefined ? !present.has(MORE_SHAPE_AFTER[id]) : MORE_SHAPE_AFTER[id] === after));
  return (
    <>
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          className="shape-menu-item"
          data-more-shape={id}
          title={t(`moreShapes.${id}Hint`)}
          aria-label={t(`moreShapes.${id}`)}
          draggable
          onClick={() => onAdd(id)}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setData("application/x-layerling-my-shape", moreShapeDragId(id));
          }}
          onDragEnd={onDragDone}
        >
          <img src={moreShapeIcon(id)} alt="" draggable={false} />
          <span>{t(`moreShapes.${id}`)}</span>
        </button>
      ))}
    </>
  );
}
