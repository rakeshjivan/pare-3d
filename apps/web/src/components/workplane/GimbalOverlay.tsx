"use client";

/**
 * Build 99: the gimbal - Meshmixer's, Medit's and Bambu Studio's way of moving and turning a part: an
 * arrow along each axis (red X, green up, blue Z) to drag it along, and a ring round each axis to turn
 * it on, about its middle. No box, no sizes. The drags themselves are the view's own (beginTransform):
 * an arrow is a move along its axis, a ring a turn about it.
 */
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { t } from "@/lib/i18n";
import type { GimbalView, RotationAxis, RotationReadout } from "@/components/workplane/transformOverlayTypes";

export function GimbalOverlay({ view, width, height, active, readout, locked, onMove, onTurn, onDrag, onEnd, onBeginCameraDrag, onCameraWheel }: {
  view: GimbalView;
  width: number;
  height: number;
  /** The part held, while it is dragged: the others go faint. */
  active: { kind: "move" | "turn"; axis: RotationAxis } | null;
  readout: RotationReadout;
  locked: boolean;
  onMove: (axis: RotationAxis, event: ReactPointerEvent<Element>) => void;
  onTurn: (axis: RotationAxis, event: ReactPointerEvent<Element>) => void;
  onDrag: (clientX: number, clientY: number, shift: boolean, alt: boolean) => void;
  onEnd: (event: ReactPointerEvent<Element>) => void;
  onBeginCameraDrag: (event: ReactPointerEvent<Element>) => void;
  onCameraWheel: (event: ReactWheelEvent<Element>) => void;
}) {
  const drag = {
    onPointerMove: (event: ReactPointerEvent<Element>) => onDrag(event.clientX, event.clientY, event.shiftKey, event.altKey),
    onPointerUp: onEnd,
    onPointerCancel: onEnd,
  };
  const faint = (kind: "move" | "turn", axis: RotationAxis) => (active && (active.kind !== kind || active.axis !== axis) ? " faint" : "");
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
        {view.rings.map((ring) => (
          <g key={`ring-${ring.axis}`} className={`gimbal-ring axis-${ring.axis}${faint("turn", ring.axis)}`}>
            <path className="gimbal-hit" d={ring.path} aria-label={t("gimbal.turn")}
              onPointerDown={(event) => { if (event.button === 0 && !locked) onTurn(ring.axis, event); }} {...drag}>
              <title>{t("gimbal.turn")}</title>
            </path>
            <path className="gimbal-line" d={ring.path} />
          </g>
        ))}
        {view.arrows.map((arrow) => (
          <g key={`arrow-${arrow.axis}`} className={`gimbal-arrow axis-${arrow.axis}${faint("move", arrow.axis)}`}>
            <line className="gimbal-hit" x1={view.x} y1={view.y} x2={arrow.x} y2={arrow.y}
              onPointerDown={(event) => { if (event.button === 0 && !locked) onMove(arrow.axis, event); }} {...drag}>
              <title>{t("gimbal.move")}</title>
            </line>
            <line className="gimbal-line" x1={view.x} y1={view.y} x2={arrow.x} y2={arrow.y} markerEnd={`url(#gimbal-head-${arrow.axis})`} />
          </g>
        ))}
        <circle className="gimbal-middle" cx={view.x} cy={view.y} r={4} />
      </svg>
      {readout ? (
        <div className="rotation-readout" style={{ "--overlay-x": `${readout.x}px`, "--overlay-y": `${readout.y}px` } as CSSProperties}>{readout.text}</div>
      ) : null}
    </div>
  );
}
