"use client";

/**
 * Build 102: a small gimbal over the wax tooth being adjusted - easier than the buttons, and precise.
 * Arrows move it along the arch (mesial), out of the arch and up; rings turn it about its long axis,
 * tip it mesio-distally and torque it labio-lingually; two squares make it wider (at its distal side)
 * and longer (below the crown).
 *
 * Fine from the first pixel, whatever the zoom: a drag moves the tooth 0.1 mm per 10 px (a ring, 1°
 * per 10 px, dragged straight along it), Shift five times as fast, Alt five times as fine. The scroll
 * wheel over a handle steps it 0.05 mm or 0.5° a notch, without holding a button; the arrow keys step
 * the selected tooth (← → along the arch, ↑ ↓ out and in, Page Up/Down up and down, [ ] turn, 0.1 mm
 * or 1°, Shift 0.5 mm or 5°, Alt 0.02 mm or 0.2°); and the readout takes an exact value typed in.
 * The tooth follows at once (`onPreview`); a drag is kept when let go, steps a moment after the last
 * (`onCommit`) - on the patient's teeth, placed again so it keeps its contacts and the margin.
 *
 * Drawn over the view in screen space each frame from the tooth's frame (in the scene), so it follows
 * the camera; at least GIMBAL_MIN_PX across however far out the view is. In the tooth's own frame:
 * mesial towards the midline, out of the arch, up towards the edge; the other side's frame is the
 * mirror image, so a turn reads the same way on both sides (and a change mirrored to the other side's
 * tooth mirrors it).
 */
import { useEffect, useRef, useState } from "react";
import type { ToothAdjust, ToothFrame } from "@/lib/dentalWaxup";
import { t } from "@/lib/i18n";

type V = [number, number, number];
export type GimbalHandle = "mesial" | "out" | "up" | "turn" | "tip" | "torque" | "wider" | "longer";
const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The gimbal's reach in the scene, mm, before it is grown to stay readable. */
const ARROW = 7;
const RING = 5;
const RING_STEPS = 48;
/** The arrows are never shorter than this on the screen, px. */
export const GIMBAL_MIN_PX = 70;
/** A drag: mm per pixel, and degrees per pixel - the same at every zoom. */
export const GIMBAL_MM_PER_PX = 0.01;
export const GIMBAL_DEG_PER_PX = 0.1;
/** A wheel notch, and a key press. */
export const GIMBAL_WHEEL = { mm: 0.05, deg: 0.5 };
export const GIMBAL_KEY = { mm: 0.1, deg: 1 };
/** Shift and Alt: coarse and extra fine. */
const COARSE = 5, FINE = 0.2;
/** Steps (wheel, keys) are kept this long after the last, ms. */
const SETTLE_MS = 650;
/** One gesture moves a tooth at most this far, turns it this much, sizes it within this. */
const MOVE_MAX = 5, TURN_MAX = 30, SIZE_MIN = 0.6, SIZE_MAX = 1.5;

const COLOURS: Record<GimbalHandle, string> = {
  mesial: "#e5484d", out: "#30a46c", up: "#3e63dd",
  turn: "#3e63dd", tip: "#30a46c", torque: "#e5484d",
  wider: "#f5f5f5", longer: "#f5f5f5",
};
const ANGLES: GimbalHandle[] = ["turn", "tip", "torque"];
const SIZES: GimbalHandle[] = ["wider", "longer"];

/** Two changes one after the other: moves and turns add, sizes multiply. */
export function composeAdjust(a: ToothAdjust, b: ToothAdjust): ToothAdjust {
  const out: ToothAdjust = { ...a };
  for (const key of ["mesial", "out", "up", "turn", "tip", "torque"] as const) if (b[key]) out[key] = (out[key] ?? 0) + b[key]!;
  for (const key of ["wider", "longer"] as const) if (b[key] !== undefined) out[key] = (out[key] ?? 1) * b[key]!;
  return out;
}
export function clampAdjustChange(c: ToothAdjust): ToothAdjust {
  const out: ToothAdjust = {};
  for (const key of ["mesial", "out", "up"] as const) if (c[key] !== undefined) out[key] = Math.max(-MOVE_MAX, Math.min(MOVE_MAX, c[key]!));
  for (const key of ["turn", "tip", "torque"] as const) if (c[key] !== undefined) out[key] = Math.max(-TURN_MAX, Math.min(TURN_MAX, c[key]!));
  for (const key of ["wider", "longer"] as const) if (c[key] !== undefined) out[key] = Math.max(SIZE_MIN, Math.min(SIZE_MAX, c[key]!));
  return out;
}
const isEmpty = (c: ToothAdjust) => !Object.entries(c).some(([key, v]) => typeof v === "number" && (SIZES.includes(key as GimbalHandle) ? Math.abs(v - 1) > 1e-5 : Math.abs(v) > 1e-6));
const gainOf = (event: { shiftKey: boolean; altKey: boolean }) => (event.shiftKey ? COARSE : event.altKey ? FINE : 1);

export type GimbalTooth = { frame: ToothFrame; width: number; length: number };

export function ToothGimbal({ tooth, disabled, totals, onPreview, onCommit }: {
  tooth: GimbalTooth;
  disabled?: boolean;
  /** The tooth's change so far and its sizes, shown when nothing is being moved. */
  totals?: string;
  /** The change so far while it is being moved (null: nothing is). */
  onPreview: (change: ToothAdjust | null) => void;
  /** The change, kept. */
  onCommit: (change: ToothAdjust) => void;
}) {
  const [, setTick] = useState(0);
  const drag = useRef<{ handle: GimbalHandle; start: [number, number]; along: [number, number]; sign: number; gain: number; base: ToothAdjust } | null>(null);
  /** Steps from the wheel and keys, waiting to be kept. */
  const pending = useRef<ToothAdjust>({});
  const settle = useRef<number | null>(null);
  const [active, setActive] = useState<GimbalHandle | null>(null);
  const [readout, setReadout] = useState<string | null>(null);
  const [typing, setTyping] = useState<{ handle: GimbalHandle; value: string } | null>(null);
  const lastHandle = useRef<GimbalHandle>("out");
  const svgRef = useRef<SVGSVGElement>(null);
  const wheelRef = useRef<((handle: GimbalHandle, event: WheelEvent) => void) | null>(null);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      const handle = (event.target as Element | null)?.closest?.("[data-handle]")?.getAttribute("data-handle") as GimbalHandle | null;
      if (!handle) return;
      event.preventDefault();
      event.stopPropagation();
      wheelRef.current?.(handle, event);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  });
  const geometry = useRef<{ mesialOnScreen: [number, number] | null } | null>(null);
  const live = useRef({ onPreview, onCommit, disabled, tooth });
  live.current = { onPreview, onCommit, disabled, tooth };

  // Follows the camera: drawn again every frame while it is shown.
  useEffect(() => {
    let frame = 0;
    const run = () => { setTick((n) => (n + 1) % 1_000_000); frame = requestAnimationFrame(run); };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, []);

  const amountFor = (handle: GimbalHandle, mm: number, deg: number): ToothAdjust => {
    const { width, length } = live.current.tooth;
    if (ANGLES.includes(handle)) return { [handle]: deg };
    if (handle === "wider") return { wider: (width + mm) / Math.max(0.5, width) };
    if (handle === "longer") return { longer: (length + mm) / Math.max(0.5, length) };
    return { [handle]: mm };
  };
  const describe = (handle: GimbalHandle, change: ToothAdjust) => {
    const { width, length } = live.current.tooth;
    const v = change[handle as keyof ToothAdjust] ?? (SIZES.includes(handle) ? 1 : 0);
    if (ANGLES.includes(handle)) return `${t(`toothGimbal.short.${handle}`)} ${v >= 0 ? "+" : ""}${v.toFixed(1)}°`;
    const mm = handle === "wider" ? (v - 1) * width : handle === "longer" ? (v - 1) * length : v;
    return `${t(`toothGimbal.short.${handle}`)} ${mm >= 0 ? "+" : ""}${mm.toFixed(2)} mm`;
  };
  const flush = () => {
    if (settle.current) { window.clearTimeout(settle.current); settle.current = null; }
    const change = pending.current;
    pending.current = {};
    setReadout(null);
    if (!isEmpty(change)) live.current.onCommit(change);
    live.current.onPreview(null);
  };
  /** Wheel and key steps: shown at once, kept a moment after the last. */
  const step = (handle: GimbalHandle, change: ToothAdjust) => {
    if (live.current.disabled || drag.current) return;
    lastHandle.current = handle;
    pending.current = clampAdjustChange(composeAdjust(pending.current, change));
    setReadout(describe(handle, pending.current));
    live.current.onPreview(pending.current);
    if (settle.current) window.clearTimeout(settle.current);
    settle.current = window.setTimeout(flush, SETTLE_MS);
  };
  // Kept if the gimbal goes (another tooth chosen, the studio closed) before the steps settle.
  useEffect(() => () => { if (settle.current) flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The arrow keys step the selected tooth (ahead of the editor's own nudges, which would move the part).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.metaKey || event.ctrlKey) return;
      const k = gainOf(event);
      // Left and right along the arch as it shows on the screen.
      const rightIsMesial = (geometry.current?.mesialOnScreen?.[0] ?? 1) >= 0;
      let handle: GimbalHandle | null = null, change: ToothAdjust = {};
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { handle = "mesial"; change = { mesial: GIMBAL_KEY.mm * k * ((event.key === "ArrowRight") === rightIsMesial ? 1 : -1) }; }
      else if (event.key === "ArrowUp" || event.key === "ArrowDown") { handle = "out"; change = { out: GIMBAL_KEY.mm * k * (event.key === "ArrowUp" ? 1 : -1) }; }
      else if (event.key === "PageUp" || event.key === "PageDown") { handle = "up"; change = { up: GIMBAL_KEY.mm * k * (event.key === "PageUp" ? 1 : -1) }; }
      else if (event.code === "BracketLeft" || event.code === "BracketRight") { handle = "turn"; change = { turn: GIMBAL_KEY.deg * k * (event.code === "BracketRight" ? 1 : -1) }; }
      if (!handle) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      step(handle, change);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const project = window.layerlingProjectPoints;
  if (!project) return null;
  const { frame, width, length } = tooth;
  const { mesial, out, up } = frame;
  // The middle of the crown: half its length below the edge.
  const centre = add(frame.origin, up, -length / 2);
  // Grown when the view is far out, so the handles stay big enough to take.
  const probe = project(Float32Array.from([...centre, ...add(centre, up, ARROW), ...add(centre, mesial, ARROW), ...add(centre, out, ARROW)]));
  const span = Math.max(...[1, 2, 3].map((i) => Math.hypot(probe[i * 2] - probe[0], probe[i * 2 + 1] - probe[1])));
  const grow = Math.max(1, Math.min(8, GIMBAL_MIN_PX / Math.max(1, span)));
  const arrowMm = ARROW * grow, ringMm = RING * grow;
  const widerAt = add(centre, mesial, -Math.max(width / 2 + 1.5, arrowMm * 0.55));
  const longerAt = add(centre, up, -Math.max(length / 2 + 1.5, arrowMm * 0.55));
  const ringPoints = (a: V, b: V) => Array.from({ length: RING_STEPS + 1 }, (_, i) => {
    const angle = (i / RING_STEPS) * Math.PI * 2;
    return add(add(centre, a, Math.cos(angle) * ringMm), b, Math.sin(angle) * ringMm);
  });
  const all: V[] = [centre, add(centre, mesial, arrowMm), add(centre, out, arrowMm), add(centre, up, arrowMm), widerAt, longerAt, ...ringPoints(mesial, out), ...ringPoints(mesial, up), ...ringPoints(out, up)];
  const flat = new Float32Array(all.length * 3);
  all.forEach((p, i) => flat.set(p, i * 3));
  const screen = project(flat);
  const at = (i: number): [number, number] => [screen[i * 2], screen[i * 2 + 1]];
  const c = at(0);
  if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
  /** A point's direction from the centre on the screen; none for an axis pointing at the eye. */
  const towards = (i: number): [number, number] | null => {
    const p = at(i), dx = p[0] - c[0], dy = p[1] - c[1], l = Math.hypot(dx, dy);
    return l > 8 ? [dx / l, dy / l] : null;
  };
  const mesialOnScreen = towards(1);
  geometry.current = { mesialOnScreen };
  const camera = (window.layerlingCameraPosition?.() ?? [0, 0, 0]) as V;
  const toCamera: V = [camera[0] - centre[0], camera[1] - centre[1], camera[2] - centre[2]];
  // The frame's handedness: each side's frame is the other's mirror image.
  const handed = Math.sign(dot(cross(mesial, out), up)) || 1;
  const RING_AT = 6;
  const ringPath = (index: number) => {
    let d = "";
    for (let i = 0; i <= RING_STEPS; i += 1) { const p = at(RING_AT + index * (RING_STEPS + 1) + i); d += `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`; }
    return d;
  };
  const ringSign = (handle: GimbalHandle) => {
    const axis: V = handle === "turn" ? up : handle === "tip" ? out : mesial;
    // Anticlockwise on the screen turns the tooth about the axis pointing at the eye.
    return (Math.sign(dot(axis, toCamera)) || 1) * handed;
  };
  const current = (d: NonNullable<typeof drag.current>, x: number, y: number): ToothAdjust => {
    const px = (x - d.start[0]) * d.along[0] + (y - d.start[1]) * d.along[1];
    const mm = px * GIMBAL_MM_PER_PX * d.gain, deg = px * GIMBAL_DEG_PER_PX * d.gain * d.sign;
    // The distal square widens the tooth about its middle: twice what its side moves.
    return amountFor(d.handle, d.handle === "wider" ? mm * 2 : mm, deg);
  };
  const begin = (handle: GimbalHandle, event: React.PointerEvent) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    if (settle.current) flush();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    let along: [number, number];
    if (ANGLES.includes(handle)) {
      // A ring is dragged straight along it where it was taken: anticlockwise on the screen is positive.
      const rx = event.clientX - c[0], ry = event.clientY - c[1], l = Math.hypot(rx, ry) || 1;
      along = [ry / l, -rx / l];
    } else {
      // Along its arrow as it shows (the squares: away from the crown); up the screen if it points at the eye.
      const index = handle === "mesial" ? 1 : handle === "out" ? 2 : handle === "up" ? 3 : handle === "wider" ? 4 : 5;
      along = towards(index) ?? [0, -1];
    }
    drag.current = { handle, start: [event.clientX, event.clientY], along, sign: ANGLES.includes(handle) ? ringSign(handle) : 1, gain: gainOf(event), base: {} };
    lastHandle.current = handle;
    setActive(handle);
  };
  const move = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    event.preventDefault();
    // Shift or Alt pressed or let go mid-drag: from here on at the new rate.
    const gain = gainOf(event);
    if (gain !== d.gain) { d.base = composeAdjust(d.base, current(d, event.clientX, event.clientY)); d.start = [event.clientX, event.clientY]; d.gain = gain; }
    const change = clampAdjustChange(composeAdjust(d.base, current(d, event.clientX, event.clientY)));
    setReadout(describe(d.handle, change));
    onPreview(change);
  };
  const end = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setActive(null);
    setReadout(null);
    try { (event.currentTarget as Element).releasePointerCapture(event.pointerId); } catch { /* already released */ }
    const change = clampAdjustChange(composeAdjust(d.base, current(d, event.clientX, event.clientY)));
    // Kept first, so the tooth can stay where it was moved while it is placed again.
    if (!isEmpty(change) && event.type !== "pointercancel") onCommit(change);
    onPreview(null);
  };
  // The wheel over a handle (a native listener, so the view does not zoom as well).
  wheelRef.current = (handle: GimbalHandle, event: WheelEvent) => {
    if (disabled) return;
    const delta = event.deltaY || event.deltaX;
    if (!delta) return;
    const k = gainOf(event) * (delta < 0 ? 1 : -1);
    step(handle, amountFor(handle, GIMBAL_WHEEL.mm * k, GIMBAL_WHEEL.deg * k * (ANGLES.includes(handle) ? ringSign(handle) : 1)));
  };
  const handlers = (handle: GimbalHandle) => ({
    "data-handle": handle,
    onPointerDown: (event: React.PointerEvent) => begin(handle, event),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
  });
  const arrow = (handle: "mesial" | "out" | "up", index: number) => {
    const tip = at(index);
    const vx = tip[0] - c[0], vy = tip[1] - c[1], len = Math.hypot(vx, vy) || 1;
    const ux = vx / len, uy = vy / len;
    const head = `M${tip[0] + ux * 9},${tip[1] + uy * 9} L${tip[0] - uy * 5},${tip[1] + ux * 5} L${tip[0] + uy * 5},${tip[1] - ux * 5} Z`;
    const dim = active && active !== handle;
    return (
      <g key={handle} className={`tooth-gimbal-handle${active === handle ? " active" : ""}`} opacity={dim ? 0.35 : 1} {...handlers(handle)}>
        <title>{t(`toothGimbal.${handle}`)}</title>
        <line x1={c[0]} y1={c[1]} x2={tip[0]} y2={tip[1]} stroke="transparent" strokeWidth={18} />
        <line x1={c[0]} y1={c[1]} x2={tip[0]} y2={tip[1]} stroke={COLOURS[handle]} strokeWidth={2.5} />
        <path d={head} fill={COLOURS[handle]} />
      </g>
    );
  };
  const ring = (handle: "turn" | "tip" | "torque", index: number) => {
    const d = ringPath(index);
    const dim = active && active !== handle;
    return (
      <g key={handle} className={`tooth-gimbal-handle${active === handle ? " active" : ""}`} opacity={dim ? 0.25 : 0.9} {...handlers(handle)}>
        <title>{t(`toothGimbal.${handle}`)}</title>
        <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
        <path d={d} fill="none" stroke={COLOURS[handle]} strokeWidth={active === handle ? 3 : 1.8} />
      </g>
    );
  };
  const square = (handle: "wider" | "longer", index: number) => {
    const p = at(index);
    const dim = active && active !== handle;
    return (
      <g key={handle} className={`tooth-gimbal-handle${active === handle ? " active" : ""}`} opacity={dim ? 0.35 : 1} {...handlers(handle)}>
        <title>{t(`toothGimbal.${handle}`)}</title>
        <rect x={p[0] - 10} y={p[1] - 10} width={20} height={20} fill="transparent" />
        <rect x={p[0] - 5} y={p[1] - 5} width={10} height={10} rx={2} fill={COLOURS[handle]} stroke="#1f2328" strokeWidth={1.5} />
      </g>
    );
  };
  const typed = () => {
    if (!typing) return;
    const value = Number(typing.value.replace(",", ".").replace(/[^0-9.+-]/g, ""));
    setTyping(null);
    if (!Number.isFinite(value) || !value) return;
    lastHandle.current = typing.handle;
    const change = clampAdjustChange(amountFor(typing.handle, value, value));
    if (!isEmpty(change)) onCommit(change);
  };
  const label = readout ?? totals ?? null;
  return (
    <>
      <svg ref={svgRef} className={`tooth-gimbal${disabled ? " disabled" : ""}`} aria-label={t("toothGimbal.label")} role="group">
        {ring("turn", 0)}
        {ring("tip", 1)}
        {ring("torque", 2)}
        {arrow("mesial", 1)}
        {arrow("out", 2)}
        {arrow("up", 3)}
        {square("wider", 4)}
        {square("longer", 5)}
        <circle cx={c[0]} cy={c[1]} r={3} fill="#1f2328" stroke="#fff" strokeWidth={1} />
      </svg>
      <div className="tooth-gimbal-panel" style={{ left: c[0] + 22, top: c[1] - 48 }}>
        {typing ? (
          <form onSubmit={(event) => { event.preventDefault(); typed(); }}>
            <select value={typing.handle} onChange={(event) => { const handle = event.currentTarget.value as GimbalHandle; setTyping((now) => (now ? { ...now, handle } : now)); }} aria-label={t("toothGimbal.what")}>
              {(["mesial", "out", "up", "turn", "tip", "torque", "wider", "longer"] as const).map((h) => <option key={h} value={h}>{t(`toothGimbal.short.${h}`)}</option>)}
            </select>
            <input autoFocus value={typing.value} inputMode="decimal" placeholder="+0.3" aria-label={t("toothGimbal.value")} onChange={(event) => { const value = event.currentTarget.value; setTyping((now) => (now ? { ...now, value } : now)); }} onKeyDown={(event) => { if (event.key === "Escape") setTyping(null); }} />
            <span>{ANGLES.includes(typing.handle) ? "°" : "mm"}</span>
            <button type="submit">{t("toothGimbal.apply")}</button>
          </form>
        ) : (
          <button type="button" className="tooth-gimbal-readout" title={t("toothGimbal.typeHint")} disabled={disabled} onClick={() => setTyping({ handle: lastHandle.current, value: "" })}>
            {label ?? t("toothGimbal.type")}
          </button>
        )}
      </div>
    </>
  );
}
