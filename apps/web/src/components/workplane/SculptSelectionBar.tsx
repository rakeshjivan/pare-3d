"use client";

/**
 * Build 94: a small bar of the selection's next actions (Meshmixer's selection pop-up).
 * Build 96: it no longer follows the selection round the view, where it covered the work - it sits at
 * the top of the view, and can be dragged anywhere by its grip (where it was left is remembered;
 * double-click the grip to put it back). It is split into what changes the selection (Grow, Shrink,
 * Smooth edge, Invert - the selection stays, to be changed again) and what changes the part (Smooth,
 * Soft transform, Delete - done with the selection, which then clears). Done clears the selection
 * and closes the bar, ready for a new one.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, GripVertical } from "lucide-react";
import { t } from "@/lib/i18n";
import type { SculptSelectionAction } from "@/components/workplane/MeshSculptPanel";

const REFINE_ACTIONS: SculptSelectionAction[] = ["grow", "shrink", "smoothEdge", "invert"];
const STORE_KEY = "pare3d.sculptSelectionBar";

function storedPlace(): { x: number; y: number } | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { x?: unknown; y?: unknown };
    return typeof p.x === "number" && typeof p.y === "number" ? { x: p.x, y: p.y } : null;
  } catch { return null; }
}
function storePlace(place: { x: number; y: number } | null) {
  try {
    if (place) window.localStorage.setItem(STORE_KEY, JSON.stringify(place));
    else window.localStorage.removeItem(STORE_KEY);
  } catch { /* the place is a convenience */ }
}

export function SculptSelectionBar({ count, busy, onAction, onSoft, onDone }: { count: number; busy: boolean; onAction: (action: SculptSelectionAction) => void; onSoft?: () => void; onDone: () => void }) {
  const bar = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<{ x: number; y: number } | null>(() => (typeof window === "undefined" ? null : storedPlace()));
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  // Kept on screen when the window gets smaller.
  useEffect(() => {
    const keep = () => setPlace((current) => {
      const el = bar.current;
      if (!current || !el) return current;
      const x = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, current.x));
      const y = Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, current.y));
      return x === current.x && y === current.y ? current : { x, y };
    });
    keep();
    window.addEventListener("resize", keep);
    return () => window.removeEventListener("resize", keep);
  }, []);
  const onGripDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const el = bar.current;
    if (!el || event.button !== 0) return;
    const box = el.getBoundingClientRect();
    drag.current = { dx: event.clientX - box.left, dy: event.clientY - box.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onGripMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const el = bar.current;
    if (!drag.current || !el) return;
    const x = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, event.clientX - drag.current.dx));
    const y = Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, event.clientY - drag.current.dy));
    setPlace({ x, y });
  };
  const onGripUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setPlace((current) => { storePlace(current); return current; });
  };
  const button = (action: SculptSelectionAction) => (
    <button key={action} type="button" className={action === "delete" ? "danger" : undefined} disabled={busy} title={t(`sculpt.selection.${action}Hint` as "sculpt.selection.fillHint")} onClick={() => onAction(action)}>
      {t(`sculpt.selection.${action}`)}
    </button>
  );
  return (
    <div ref={bar} className={`sculpt-selection-bar${place ? " placed" : ""}`} role="toolbar" aria-label={t("sculpt.selectionActions")}
      style={place ? { left: place.x, top: place.y } : undefined}
      onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" className="sculpt-bar-grip" title={t("sculpt.bar.move")} aria-label={t("sculpt.bar.move")}
        onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripUp}
        onDoubleClick={() => { setPlace(null); storePlace(null); }}>
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <span className="sculpt-bar-count" role="status">{t("sculpt.bar.selected", { count: count.toLocaleString() })}</span>
      <div className="sculpt-bar-group" role="group" aria-label={t("sculpt.bar.refine")}>
        {REFINE_ACTIONS.map(button)}
      </div>
      <div className="sculpt-bar-group" role="group" aria-label={t("sculpt.bar.act")}>
        {button("smooth")}
        {onSoft ? <button type="button" disabled={busy} title={t("sculpt.soft.startHint")} onClick={onSoft}>{t("sculpt.soft.start")}</button> : null}
        {button("delete")}
      </div>
      <button type="button" className="sculpt-bar-done" disabled={busy} title={t("sculpt.bar.doneHint")} onClick={onDone}><Check size={14} aria-hidden="true" /> {t("sculpt.bar.done")}</button>
    </div>
  );
}
