"use client";

/**
 * Build 94: a small bar of the selection's next actions, floating beside the selection in the view
 * (Meshmixer's selection pop-up), so the hand stays where the work is. It follows the selection as
 * the view turns (placed each frame from the selection's middle).
 */
import { useEffect, useRef } from "react";
import { t } from "@/lib/i18n";
import type { SculptSelectionAction } from "@/components/workplane/MeshSculptPanel";

const BAR_ACTIONS: SculptSelectionAction[] = ["delete", "grow", "shrink", "smooth", "smoothEdge", "invert", "clear"];

export function SculptSelectionBar({ anchor, busy, onAction, onSoft }: { anchor: [number, number, number]; busy: boolean; onAction: (action: SculptSelectionAction) => void; onSoft?: () => void }) {
  const bar = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let frame = 0;
    const place = () => {
      const el = bar.current;
      const project = window.layerlingProjectPoints;
      if (el && project) {
        const p = project(anchor);
        // Page coordinates (the projection's), kept on screen.
        if (Number.isFinite(p[0]) && Number.isFinite(p[1])) {
          el.style.left = `${Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, p[0] + 24))}px`;
          el.style.top = `${Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, p[1] - el.offsetHeight / 2))}px`;
          el.style.visibility = "visible";
        }
      }
      frame = requestAnimationFrame(place);
    };
    frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, [anchor]);
  return (
    <div ref={bar} className="sculpt-selection-bar" role="toolbar" aria-label={t("sculpt.selectionActions")} style={{ visibility: "hidden" }}>
      {BAR_ACTIONS.map((action) => (
        <button key={action} type="button" className={action === "delete" ? "danger" : undefined} disabled={busy} title={t(`sculpt.selection.${action}Hint` as "sculpt.selection.fillHint")} onClick={() => onAction(action)}>
          {t(`sculpt.selection.${action}`)}
        </button>
      ))}
      {onSoft ? <button type="button" disabled={busy} title={t("sculpt.soft.startHint")} onClick={onSoft}>{t("sculpt.soft.start")}</button> : null}
    </div>
  );
}
