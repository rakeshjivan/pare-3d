"use client";

/**
 * Build 94: hold Space in Sculpt for a ring of brushes at the pointer; let go over one (or click it)
 * to pick it. Quicker than reaching for the panel, and the hand stays on the work.
 */
import { t } from "@/lib/i18n";
import type { SculptTool } from "@/components/workplane/MeshSculptPanel";

export const RADIAL_TOOLS: SculptTool[] = ["draw", "smooth", "inflate", "flatten", "deflate", "pinch", "drag", "select"];
const RADIUS = 92;

/** Which item of the ring a point is over (index), or -1 near the middle. */
export function radialIndex(dx: number, dy: number, count = RADIAL_TOOLS.length) {
  if (Math.hypot(dx, dy) < 28) return -1;
  const angle = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(angle / ((Math.PI * 2) / count)) % count;
}

export function SculptRadialMenu({ x, y, hover, current, onPick }: { x: number; y: number; hover: number; current: SculptTool | null; onPick: (tool: SculptTool) => void }) {
  return (
    <div className="sculpt-radial" style={{ left: x, top: y }} role="menu" aria-label={t("sculpt.radial")}>
      {RADIAL_TOOLS.map((tool, i) => {
        const a = (i / RADIAL_TOOLS.length) * Math.PI * 2;
        return (
          <button key={tool} type="button" role="menuitem" className={`${i === hover ? "hover" : ""}${tool === current ? " active" : ""}`} style={{ left: Math.sin(a) * RADIUS, top: -Math.cos(a) * RADIUS }} onPointerDown={(event) => { event.preventDefault(); onPick(tool); }}>
            {t(`sculpt.tool.${tool}`)}
          </button>
        );
      })}
      <span className="sculpt-radial-hint">{t("sculpt.radialHint")}</span>
    </div>
  );
}
