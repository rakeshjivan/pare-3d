"use client";

/**
 * Fork (build 48): Dental Studio's trim line. While it is up, a press and drag over the view draws
 * a freehand line; letting go closes it. Points are in page pixels. Esc gives up.
 */
import { useEffect, useRef, useState } from "react";
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
      onPointerDown={(event) => {
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
