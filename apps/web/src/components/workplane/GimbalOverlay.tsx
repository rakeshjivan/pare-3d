"use client";

/**
 * Build 99: the gimbal - Meshmixer's, Medit's and Bambu Studio's way of moving and turning a part: an
 * arrow along each axis (red X, green up, blue Z) to drag it along, and a ring round each axis to turn
 * it on, about its middle. No box, no sizes. The drags themselves are the view's own (beginTransform):
 * an arrow is a move along its axis, a ring a turn about it.
 *
 * Build 104 (gimbal 2): made far easier to use -
 * - type while holding a handle (or after clicking one) for an exact distance or angle, Enter to apply;
 * - rings snap in 15° steps close by and turn freely further out, Shift is finer, Ctrl (Cmd) free;
 * - a grey outer ring turns the part about the line of sight, as it is seen;
 * - rings seen nearly edge on fade, so the ones easy to take hold of stand out;
 * - a small bar of buttons: the part's own axes or the plate's, lay flat, drop to the plate, quarter turns.
 */
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { ArrowDownToLine, RotateCcw, RotateCw, SquareStack } from "lucide-react";
import { t } from "@/lib/i18n";
import type { GimbalView, RotationAxis, RotationReadout } from "@/components/workplane/transformOverlayTypes";

/** The band round an arrow, `half` pixels each side and a little past its tip, as polygon points. */
function arrowBand(x1: number, y1: number, x2: number, y2: number, half: number) {
  const length = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
  const ux = (x2 - x1) / length;
  const uy = (y2 - y1) / length;
  // Start a little out from the middle, so the middle stays free for the rings' crossing; end past the head.
  const sx = x1 + ux * 12;
  const sy = y1 + uy * 12;
  const ex = x2 + ux * 10;
  const ey = y2 + uy * 10;
  const px = -uy * half;
  const py = ux * half;
  return `${sx + px},${sy + py} ${ex + px},${ey + py} ${ex - px},${ey - py} ${sx - px},${sy - py}`;
}

export function GimbalOverlay({ view, width, height, active, viewTurn, readout, locked, onMove, onTurn, onDrag, onEnd, onBeginCameraDrag, onCameraWheel, space, onToggleSpace, onQuarterTurn, onLayFlat, onDrop, axisLabels }: {
  view: GimbalView;
  width: number;
  height: number;
  /** The part held, while it is dragged: the others go faint. */
  active: { kind: "move" | "turn"; axis: RotationAxis } | null;
  /** The outer ring is held. */
  viewTurn?: boolean;
  readout: RotationReadout;
  locked: boolean;
  onMove: (axis: RotationAxis, event: ReactPointerEvent<Element>) => void;
  onTurn: (axis: RotationAxis | "view", event: ReactPointerEvent<Element>) => void;
  onDrag: (clientX: number, clientY: number, shift: boolean, alt: boolean) => void;
  onEnd: (event: ReactPointerEvent<Element>) => void;
  onBeginCameraDrag: (event: ReactPointerEvent<Element>) => void;
  onCameraWheel: (event: ReactWheelEvent<Element>) => void;
  space: "local" | "world";
  onToggleSpace: () => void;
  onQuarterTurn: (direction: 1 | -1) => void;
  onLayFlat?: () => void;
  onDrop?: () => void;
  /** Names shown at the arrow tips (Dental Studio: the mouth's directions). */
  axisLabels?: Partial<Record<RotationAxis, string>>;
}) {
  const drag = {
    onPointerMove: (event: ReactPointerEvent<Element>) => onDrag(event.clientX, event.clientY, event.shiftKey, event.altKey),
    onPointerUp: onEnd,
    onPointerCancel: onEnd,
  };
  const faint = (kind: "move" | "turn", axis: RotationAxis) =>
    (viewTurn || (active && (active.kind !== kind || active.axis !== axis)) ? " faint" : "");
  const viewRadius = view.viewRadius ?? 104;
  const viewRingPath = `M${view.x - viewRadius} ${view.y} a${viewRadius} ${viewRadius} 0 1 0 ${viewRadius * 2} 0 a${viewRadius} ${viewRadius} 0 1 0 ${-viewRadius * 2} 0`;
  // The bar of buttons sits under the gimbal, kept inside the view.
  const chipsX = Math.max(8, Math.min(width - 256, view.x - 118));
  const chipsY = Math.max(8, Math.min(height - 44, view.y + viewRadius + 14));
  return (
    <div
      className={`gimbal-overlay${locked ? " locked" : ""}`}
      onPointerDownCapture={(event) => { if (event.button === 1 || event.button === 2) onBeginCameraDrag(event); }}
      onWheelCapture={onCameraWheel}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
    >
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          {(["x", "y", "z"] as const).map((axis) => (
            <marker key={axis} id={`gimbal-head-${axis}`} className={`gimbal-head axis-${axis}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" />
            </marker>
          ))}
        </defs>
        <g className={`gimbal-ring gimbal-view-ring${active && !viewTurn ? " faint" : ""}`}>
          <path className="gimbal-hit" d={viewRingPath} aria-label={t("gimbal.turnView")}
            onPointerDown={(event) => { if (event.button === 0 && !locked) onTurn("view", event); }} {...drag}>
            <title>{t("gimbal.turnView")}</title>
          </path>
          <path className="gimbal-line" d={viewRingPath} />
        </g>
        {view.rings.map((ring) => (
          <g key={`ring-${ring.axis}`} className={`gimbal-ring axis-${ring.axis}${faint("turn", ring.axis)}`} style={{ opacity: active ? undefined : ring.opacity }}>
            <path className="gimbal-hit" d={ring.path} aria-label={t("gimbal.turn")}
              onPointerDown={(event) => { if (event.button === 0 && !locked) onTurn(ring.axis, event); }} {...drag}>
              <title>{t("gimbal.turn")}</title>
            </path>
            <path className="gimbal-line" d={ring.path} />
          </g>
        ))}
        {view.arrows.map((arrow) => (
          <g key={`arrow-${arrow.axis}`} className={`gimbal-arrow axis-${arrow.axis}${faint("move", arrow.axis)}`}>
            {/* A filled band, not a stroked line: an upright or level line has no width, and the browser
                then finds nothing under the pointer (the up arrow could not be taken hold of). */}
            <polygon className="gimbal-hit gimbal-hit-area" points={arrowBand(view.x, view.y, arrow.x, arrow.y, 10)}
              onPointerDown={(event) => { if (event.button === 0 && !locked) onMove(arrow.axis, event); }} {...drag}>
              <title>{t("gimbal.move")}</title>
            </polygon>
            <line className="gimbal-line" x1={view.x} y1={view.y} x2={arrow.x} y2={arrow.y} markerEnd={`url(#gimbal-head-${arrow.axis})`} />
            {axisLabels?.[arrow.axis] ? (() => {
              const length = Math.max(1, Math.hypot(arrow.x - view.x, arrow.y - view.y));
              const lx = arrow.x + ((arrow.x - view.x) / length) * 22;
              const ly = arrow.y + ((arrow.y - view.y) / length) * 22;
              return <text className="gimbal-label" x={lx} y={ly} textAnchor="middle" dominantBaseline="middle">{axisLabels[arrow.axis]}</text>;
            })() : null}
          </g>
        ))}
        <circle className="gimbal-middle" cx={view.x} cy={view.y} r={4} />
        {/* The buttons sit in the drawing itself, so they stay under the gimbal however the view is scaled. */}
        {!active && !locked ? (
          <foreignObject x={chipsX} y={chipsY} width={256} height={40} className="gimbal-chips-holder">
            <div className="gimbal-chips" role="toolbar" aria-label={t("gimbal.tools")}>
              <button type="button" className="gimbal-space" onClick={onToggleSpace} title={t(space === "local" ? "gimbal.spaceLocalHint" : "gimbal.spaceWorldHint")}>
                {t(space === "local" ? "gimbal.spaceLocal" : "gimbal.spaceWorld")}
              </button>
              {onLayFlat ? (
                <button type="button" onClick={onLayFlat} title={t("gimbal.layFlat")} aria-label={t("gimbal.layFlat")}><SquareStack size={15} /></button>
              ) : null}
              {onDrop ? (
                <button type="button" onClick={onDrop} title={t("gimbal.drop")} aria-label={t("gimbal.drop")}><ArrowDownToLine size={15} /></button>
              ) : null}
              <button type="button" onClick={() => onQuarterTurn(1)} title={t("gimbal.turnLeft")} aria-label={t("gimbal.turnLeft")}><RotateCcw size={15} /></button>
              <button type="button" onClick={() => onQuarterTurn(-1)} title={t("gimbal.turnRight")} aria-label={t("gimbal.turnRight")}><RotateCw size={15} /></button>
            </div>
          </foreignObject>
        ) : null}
      </svg>
      {readout ? (
        <div className="rotation-readout gimbal-readout" style={{ "--overlay-x": `${readout.x}px`, "--overlay-y": `${readout.y}px` } as CSSProperties}>{readout.text}</div>
      ) : null}
    </div>
  );
}
