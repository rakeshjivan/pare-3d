"use client";

import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import { MORE_SHAPE_IDS, type MoreShapeId } from "@/lib/moreShapes";

/** Small line drawings in the style of the shape pictures: grey faces, a darker outline. */
const ICONS: Record<MoreShapeId, ReactNode> = {
  roundedCylinder: <><path d="M10 14c0-4 30-4 30 0v20c0 4-30 4-30 0z" fill="#c9cdd2" /><path d="M10 16c0-6 4-8 15-8s15 2 15 8" fill="#e6e8eb" /><path d="M10 14c0-4 30-4 30 0v20c0 4-30 4-30 0z M10 16c0-6 4-8 15-8s15 2 15 8" fill="none" stroke="#5f6670" strokeWidth="1.6" /></>,
  chamferedCylinder: <><path d="M10 16l4-6h22l4 6v18c0 4-30 4-30 0z" fill="#c9cdd2" /><path d="M14 10h22l4 6c-4 3-26 3-30 0z" fill="#e6e8eb" /><path d="M10 16l4-6h22l4 6v18c0 4-30 4-30 0zM10 16c4 3 26 3 30 0" fill="none" stroke="#5f6670" strokeWidth="1.6" /></>,
  pieSlice: <><path d="M14 32 L40 20 A28 28 0 0 1 40 40 Z" fill="#c9cdd2" /><path d="M14 28 L40 16 A28 28 0 0 1 40 36 Z" fill="#e6e8eb" stroke="#5f6670" strokeWidth="1.6" /></>,
  ringSegment: <><path d="M8 34 A20 20 0 0 1 42 34 L34 34 A12 12 0 0 0 16 34 Z" fill="#c9cdd2" transform="translate(0 4)" /><path d="M8 30 A20 20 0 0 1 42 30 L34 30 A12 12 0 0 0 16 30 Z" fill="#e6e8eb" stroke="#5f6670" strokeWidth="1.6" /></>,
  gusset: <><path d="M12 38 L12 10 L40 38 Z" fill="#e6e8eb" stroke="#5f6670" strokeWidth="1.6" /><path d="M12 38 L16 35 L16 13 L12 10" fill="#c9cdd2" stroke="#5f6670" strokeWidth="1.2" /></>,
  arrow: <><path d="M6 22h22v-7l16 10-16 10v-7H6z" fill="#e6e8eb" stroke="#5f6670" strokeWidth="1.6" strokeLinejoin="round" /></>,
  spiralRamp: <><path d="M25 40c-11 0-17-5-17-11s7-10 17-10 17 4 17 10" fill="none" stroke="#c9cdd2" strokeWidth="6" /><path d="M8 24c0-6 7-10 17-10s17 4 17 10-6 11-17 11" fill="none" stroke="#9aa1a9" strokeWidth="6" strokeLinecap="round" /></>,
  geodesicBall: <><circle cx="25" cy="25" r="16" fill="#e6e8eb" stroke="#5f6670" strokeWidth="1.6" /><path d="M25 9l-9 9 9 7 9-7zM16 18l-6 12 15-5M34 18l6 12-15-5M10 30l9 9 6-14M40 30l-9 9-6-14M19 39h12" fill="none" stroke="#5f6670" strokeWidth="1.1" strokeLinejoin="round" /></>,
};

/** Fork (build 21): the extra basic shapes, under the library's own, added like them. */
export function MoreShapesSection({ onAdd }: { onAdd: (id: MoreShapeId) => void }) {
  return (
    <>
      <div className="shape-menu-subtitle">{t("moreShapes.title")}</div>
      <div className="shape-menu-list more-shapes-list">
        {MORE_SHAPE_IDS.map((id) => (
          <button key={id} type="button" className="shape-menu-item" data-more-shape={id} title={t(`moreShapes.${id}Hint`)} aria-label={t(`moreShapes.${id}`)} onClick={() => onAdd(id)}>
            <svg viewBox="0 0 50 50" width="50" height="50" aria-hidden="true">{ICONS[id]}</svg>
            <span>{t(`moreShapes.${id}`)}</span>
          </button>
        ))}
      </div>
    </>
  );
}
