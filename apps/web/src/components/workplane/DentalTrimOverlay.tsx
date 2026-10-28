"use client";

/**
 * Fork (build 48): Dental Studio's trim line. While it is up, a press and drag over the view draws
 * a freehand line; letting go closes it. Points are in page pixels. Esc gives up.
 */
import { smoothRing } from "@/lib/dentalBase";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { createPortal } from "react-dom";

export type TrimPoint = [number, number];

export function DentalTrimOverlay({ hint, onDone, onCancel }: { hint: string; onDone: (points: TrimPoint[]) => void; onCancel: () => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [points, setPoints] = useState<TrimPoint[]>([]);
  const drawing = useRef(false);
  const line = useRef<TrimPoint[]>([]);
  const box = useRef<DOMRect | null>(null);
  useEffect(() => {
    setHost(document.querySelector<HTMLElement>(".workplane-plane"));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);
  if (!host) return null;
  const local = (x: number, y: number): TrimPoint => {
    const rect = box.current ?? host.getBoundingClientRect();
    return [x - rect.left, y - rect.top];
  };
  const shown = points.map((p) => local(p[0], p[1]).join(",")).join(" ");
  return createPortal(
    <div
      className="dental-trim-overlay"
      role="application"
      aria-label={hint}
      onWheel={passToView.wheel}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (passToView.pointerDown(event)) return;
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        box.current = host.getBoundingClientRect();
        drawing.current = true;
        line.current = [[event.clientX, event.clientY]];
        setPoints(line.current);
      }}
      onPointerMove={(event) => {
        if (!drawing.current) return;
        const x = event.clientX, y = event.clientY;
        const last = line.current[line.current.length - 1];
        if (last && Math.hypot(last[0] - x, last[1] - y) < 3) return;
        line.current = [...line.current, [x, y]];
        setPoints(line.current);
      }}
      onPointerUp={(event) => {
        if (!drawing.current) return;
        drawing.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
        const drawn = line.current;
        line.current = [];
        setPoints([]);
        if (drawn.length >= 3) onDone(drawn);
      }}
    >
      <p className="dental-trim-hint">{hint}</p>
      <svg aria-hidden="true">
        {points.length > 1 ? <polygon points={shown} /> : null}
      </svg>
    </div>,
    host,
  );
}

/** Which of the projected points (x, y pairs in page pixels) fall inside the closed line. */
export function insideTrimLine(projected: Float32Array, line: TrimPoint[]): Uint8Array {
  const count = projected.length / 2;
  const inside = new Uint8Array(count);
  if (line.length < 3) return inside;
  // Drawn into a mask once, then each point is a lookup.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of line) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const width = Math.max(1, Math.ceil(maxX - minX) + 2), height = Math.max(1, Math.ceil(maxY - minY) + 2);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return inside;
  context.beginPath();
  line.forEach(([x, y], index) => (index ? context.lineTo(x - minX + 1, y - minY + 1) : context.moveTo(x - minX + 1, y - minY + 1)));
  context.closePath();
  context.fillStyle = "#fff";
  context.fill();
  const mask = context.getImageData(0, 0, width, height).data;
  for (let i = 0; i < count; i += 1) {
    const px = Math.floor(projected[i * 2] - minX + 1), py = Math.floor(projected[i * 2 + 1] - minY + 1);
    if (px >= 0 && py >= 0 && px < width && py < height && mask[(py * width + px) * 4 + 3] > 127) inside[i] = 1;
  }
  return inside;
}

/**
 * Build 52: how far each projected point (x, y pairs in page pixels) lies inside the closed line,
 * in pixels - negative outside - after the line itself is smoothed, so a cut along zero follows a
 * clean curve rather than the hand's wobble.
 */
export function trimLineDistance(projected: Float32Array, line: TrimPoint[]): Float32Array {
  const count = projected.length / 2;
  const out = new Float32Array(count).fill(-1e6);
  if (line.length < 3) return out;
  const ring = smoothRing(line.map(([x, y]) => [x, y] as [number, number]), 3, 18, 3);
  const n = ring.length;
  // Inside or out from the smoothed line drawn into a mask; the distance only matters near the
  // line, so segments are looked up in a grid, and anything further than `far` counts as `far`.
  const inside = insideTrimLine(projected, ring);
  const far = 24, cell = 24;
  const buckets = new Map<string, number[]>();
  for (let k = 0; k < n; k += 1) {
    const [ax, ay] = ring[k], [bx, by] = ring[(k + 1) % n];
    for (let gx = Math.floor(Math.min(ax, bx) / cell); gx <= Math.floor(Math.max(ax, bx) / cell); gx += 1) for (let gy = Math.floor(Math.min(ay, by) / cell); gy <= Math.floor(Math.max(ay, by) / cell); gy += 1) {
      const key = `${gx},${gy}`;
      const list = buckets.get(key);
      if (list) list.push(k); else buckets.set(key, [k]);
    }
  }
  for (let i = 0; i < count; i += 1) {
    const px = projected[i * 2], py = projected[i * 2 + 1];
    let best = far;
    const gx = Math.floor(px / cell), gy = Math.floor(py / cell);
    for (let dx0 = -1; dx0 <= 1; dx0 += 1) for (let dy0 = -1; dy0 <= 1; dy0 += 1) {
      const list = buckets.get(`${gx + dx0},${gy + dy0}`);
      if (!list) continue;
      for (const k of list) {
        const [ax, ay] = ring[k], [bx, by] = ring[(k + 1) % n];
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(px - ax - dx * t, py - ay - dy * t));
      }
    }
    out[i] = inside[i] ? Math.max(best, 1e-3) : -Math.max(best, 1e-3);
  }
  return out;
}

/**
 * Fork (build 53): Dental Studio's brush for the tooth area. Press and drag to paint a stroke of
 * `radius` pixels; letting go hands the stroke over. Esc gives up.
 */
/**
 * Fork (build 56): the drawing overlays keep the left button for drawing and hand everything else
 * to the 3D view under them - right or middle drag turns and pans it, the wheel zooms - so the
 * model can be looked at from every side while its tooth area or margin is edited.
 */
function viewCanvas(overlay: HTMLElement) {
  return overlay.parentElement?.querySelector<HTMLCanvasElement>("canvas") ?? null;
}

export const passToView = {
  pointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button === 0) return false;
    const overlay = event.currentTarget;
    const canvas = viewCanvas(overlay);
    if (!canvas) return false;
    event.preventDefault();
    // Out of the way until the button comes up, so the drag goes to the view.
    overlay.style.pointerEvents = "none";
    const restore = () => {
      overlay.style.pointerEvents = "";
      window.removeEventListener("pointerup", restore, true);
      window.removeEventListener("pointercancel", restore, true);
    };
    window.addEventListener("pointerup", restore, true);
    window.addEventListener("pointercancel", restore, true);
    const native = event.nativeEvent;
    canvas.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, composed: true,
      pointerId: native.pointerId, pointerType: native.pointerType, isPrimary: native.isPrimary,
      button: native.button, buttons: native.buttons, clientX: native.clientX, clientY: native.clientY,
      screenX: native.screenX, screenY: native.screenY, ctrlKey: native.ctrlKey, shiftKey: native.shiftKey, altKey: native.altKey, metaKey: native.metaKey,
    }));
    return true;
  },
  wheel(event: ReactWheelEvent<HTMLElement>) {
    const canvas = viewCanvas(event.currentTarget);
    if (!canvas) return;
    const native = event.nativeEvent;
    canvas.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true, cancelable: true, composed: true,
      deltaX: native.deltaX, deltaY: native.deltaY, deltaZ: native.deltaZ, deltaMode: native.deltaMode,
      clientX: native.clientX, clientY: native.clientY, screenX: native.screenX, screenY: native.screenY,
      ctrlKey: native.ctrlKey, shiftKey: native.shiftKey, altKey: native.altKey, metaKey: native.metaKey,
    }));
  },
};

export function DentalBrushOverlay({ hint, radius, erase, onDone, onCancel, live, onStrengthWheel, onDouble }: {
  hint: string;
  radius: number;
  erase: boolean;
  /** Build 82: Ctrl + wheel changes the strength (Meshmixer); true is up. */
  onStrengthWheel?: (up: boolean) => void;
  onDone: (points: TrimPoint[]) => void;
  onCancel: () => void;
  /** Build 73: a live brush - each pointer move is handed over as it happens, and no path is drawn. */
  live?: { start: (x: number, y: number, keys?: { ctrl: boolean; shift: boolean }) => void; move: (x: number, y: number) => void; end: () => void };
  /** Build 94: a double-click (Sculpt: the face group under it). */
  onDouble?: (x: number, y: number, keys: { ctrl: boolean; shift: boolean }) => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [points, setPoints] = useState<TrimPoint[]>([]);
  // Build 87: the brush ring moves by itself (no React render per mouse move), placed against the view's
  // box measured once per stroke rather than at every move.
  // Build 94: the ring and its centre dot (exactly where the brush works) move together.
  const ring = useRef<SVGGElement | null>(null);
  const hostBox = useRef<DOMRect | null>(null);
  const placeRing = (x: number, y: number) => {
    const circle = ring.current;
    if (!circle) return;
    const box = hostBox.current ?? (hostBox.current = host?.getBoundingClientRect() ?? null);
    if (!box) return;
    circle.setAttribute("transform", `translate(${x - box.left} ${y - box.top})`);
    circle.style.visibility = "visible";
  };
  const drawing = useRef(false);
  const line = useRef<TrimPoint[]>([]);
  const overlay = useRef<HTMLDivElement | null>(null);
  const strengthWheel = useRef(onStrengthWheel);
  strengthWheel.current = onStrengthWheel;
  // Ctrl + wheel would zoom the page: caught here, not passively, so it changes the strength instead.
  useEffect(() => {
    const element = overlay.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!strengthWheel.current || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      if (event.deltaY) strengthWheel.current(event.deltaY < 0);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [host]);
  useEffect(() => {
    setHost(document.querySelector<HTMLElement>(".workplane-plane"));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
    };
    window.addEventListener("keydown", onKey, true);
    const forget = () => { hostBox.current = null; };
    window.addEventListener("resize", forget);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("resize", forget); };
  }, [onCancel]);
  if (!host) return null;
  const rect = host.getBoundingClientRect();
  const local = (p: TrimPoint) => `${p[0] - rect.left},${p[1] - rect.top}`;
  return createPortal(
    <div
      className={`dental-trim-overlay dental-brush-overlay${erase ? " erase" : ""}`}
      role="application"
      aria-label={hint}
      onPointerDown={(event) => {
        if (passToView.pointerDown(event)) return;
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = true;
        hostBox.current = null;
        if (live) { live.start(event.clientX, event.clientY, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey }); return; }
        line.current = [[event.clientX, event.clientY]];
        setPoints(line.current);
      }}
      ref={overlay}
      onWheel={(event) => { if (!(onStrengthWheel && (event.ctrlKey || event.metaKey))) passToView.wheel(event); }}
      onContextMenu={(event) => event.preventDefault()}
      onDoubleClick={(event) => { if (onDouble) { event.preventDefault(); onDouble(event.clientX, event.clientY, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey }); } }}
      onPointerMove={(event) => {
        placeRing(event.clientX, event.clientY);
        if (!drawing.current) return;
        if (live) {
          // Every coalesced point, so a quick stroke keeps its shape.
          const all = typeof event.nativeEvent.getCoalescedEvents === "function" ? event.nativeEvent.getCoalescedEvents() : [];
          if (all.length) for (const e of all) live.move(e.clientX, e.clientY);
          else live.move(event.clientX, event.clientY);
          return;
        }
        const last = line.current[line.current.length - 1];
        if (last && Math.hypot(last[0] - event.clientX, last[1] - event.clientY) < 2) return;
        line.current = [...line.current, [event.clientX, event.clientY]];
        setPoints(line.current);
      }}
      onPointerLeave={() => { if (ring.current) ring.current.style.visibility = "hidden"; hostBox.current = null; }}
      onPointerUp={(event) => {
        if (!drawing.current) return;
        drawing.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
        if (live) { live.end(); return; }
        const drawn = line.current;
        line.current = [];
        setPoints([]);
        if (drawn.length) onDone(drawn);
      }}
    >
      <p className="dental-trim-hint">{hint}</p>
      <svg aria-hidden="true">
        {points.length ? <polyline points={points.map(local).join(" ")} style={{ strokeWidth: radius * 2 }} /> : null}
        <g ref={ring} style={{ visibility: "hidden" }}>
          <circle r={radius} />
          <circle className="brush-dot" r={2.5} />
        </g>
      </svg>
    </div>,
    host,
  );
}

/**
 * Build 82: Meshmixer's lasso for the Select tool. Drag to draw a loop freehand (letting go closes
 * it), or click to set corners one by one and click the first one again (or double-click, or press
 * Enter) to close. A new lasso replaces the selection; Shift held at its start adds, Ctrl (Cmd)
 * takes away. Backspace drops the last corner; Esc drops the loop, and with none, ends the tool.
 * Right and middle buttons and the wheel still turn, pan and zoom the view.
 */
export function SculptLassoOverlay({ hint, erase, onDone, onCancel }: {
  hint: string;
  /** Unselect: the lasso always takes away. */
  erase: boolean;
  onDone: (loop: TrimPoint[], mode: "replace" | "add" | "remove") => void;
  onCancel: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [loop, setLoop] = useState<TrimPoint[]>([]);
  const [cursor, setCursor] = useState<TrimPoint | null>(null);
  const corners = useRef<TrimPoint[]>([]);
  const press = useRef<{ x: number; y: number; freehand: boolean } | null>(null);
  const drawn = useRef<TrimPoint[]>([]);
  const mode = useRef<"replace" | "add" | "remove">("replace");
  const finish = useRef<(points: TrimPoint[]) => void>(() => {});
  finish.current = (points) => {
    corners.current = [];
    press.current = null;
    setLoop([]);
    if (points.length >= 3) onDone(points, mode.current);
  };
  useEffect(() => {
    setHost(document.querySelector<HTMLElement>(".workplane-plane"));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        if (corners.current.length) { corners.current = []; press.current = null; setLoop([]); } else onCancel();
      } else if (event.key === "Enter" && corners.current.length >= 3) {
        event.preventDefault(); event.stopPropagation();
        finish.current(corners.current);
      } else if (event.key === "Backspace" && corners.current.length) {
        event.preventDefault(); event.stopPropagation();
        corners.current = corners.current.slice(0, -1);
        setLoop(corners.current);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);
  if (!host) return null;
  const rect = host.getBoundingClientRect();
  const local = (p: TrimPoint) => `${p[0] - rect.left},${p[1] - rect.top}`;
  const near = (a: TrimPoint, x: number, y: number) => Math.hypot(a[0] - x, a[1] - y) <= 10;
  const first = loop[0];
  const closing = Boolean(first && cursor && loop.length >= 3 && !press.current?.freehand && near(first, cursor[0], cursor[1]));
  return createPortal(
    <div
      className={`dental-trim-overlay sculpt-lasso-overlay${erase ? " erase" : ""}`}
      role="application"
      aria-label={hint}
      onWheel={passToView.wheel}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (passToView.pointerDown(event)) return;
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const x = event.clientX, y = event.clientY;
        if (corners.current.length) {
          // Setting corners: the first one again closes the loop.
          if (corners.current.length >= 3 && near(corners.current[0], x, y)) { finish.current(corners.current); return; }
          press.current = { x, y, freehand: false };
          return;
        }
        mode.current = erase ? "remove" : event.ctrlKey || event.metaKey ? "remove" : event.shiftKey ? "add" : "replace";
        press.current = { x, y, freehand: false };
        drawn.current = [[x, y]];
        setLoop(drawn.current);
      }}
      onPointerMove={(event) => {
        const x = event.clientX, y = event.clientY;
        setCursor([x, y]);
        const down = press.current;
        if (!down || corners.current.length) return;
        // Moving with the button down: a freehand loop.
        if (!down.freehand && Math.hypot(x - down.x, y - down.y) < 5) return;
        down.freehand = true;
        const last = drawn.current[drawn.current.length - 1];
        if (last && Math.hypot(last[0] - x, last[1] - y) < 3) return;
        drawn.current = [...drawn.current, [x, y]];
        setLoop(drawn.current);
      }}
      onPointerUp={(event) => {
        const down = press.current;
        if (!down) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        if (down.freehand) { finish.current(drawn.current); drawn.current = []; return; }
        // A click: one more corner.
        press.current = null;
        corners.current = [...corners.current, [event.clientX, event.clientY]];
        setLoop(corners.current);
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        // The double click's two clicks set the same corner twice: one is enough.
        const points = corners.current.filter((p, k, all) => k === 0 || Math.hypot(p[0] - all[k - 1][0], p[1] - all[k - 1][1]) > 3);
        if (points.length >= 3) finish.current(points);
      }}
    >
      <p className="dental-trim-hint">{hint}</p>
      <svg aria-hidden="true">
        {loop.length > 1 && press.current?.freehand ? <polygon points={loop.map(local).join(" ")} /> : null}
        {loop.length && !press.current?.freehand ? <polyline points={[...loop, ...(cursor ? [cursor] : [])].map(local).join(" ")} /> : null}
        {first && !press.current?.freehand && loop.length > 1 ? <circle className={closing ? "closing" : undefined} cx={first[0] - rect.left} cy={first[1] - rect.top} r={6} /> : null}
      </svg>
    </div>,
    host,
  );
}
