"use client";

import { useEffect, useState } from "react";
import { getLanguage } from "@/lib/i18n";

/**
 * Fork: instant names on the camera bar down the left of the view, instead of the browser's slow
 * tooltip - with a few plain words on what each button does (English). The button's own title is
 * set aside while the pointer is on it, so the two never show together.
 */
const HINTS_EN: Readonly<Record<string, string>> = {
  "Home": "back to the starting view",
  "Center view on selection": "zoom to the selected parts",
  "Zoom in": "closer",
  "Zoom out": "further away",
  "Orthographic view": "no perspective - handy for lining things up",
  "Back to perspective view": "the normal 3D view",
  "Section view": "cut the view open to see inside parts",
  "Tape measure": "measure between points, edges and faces",
  "Set square": "a right-angle guide to measure from",
  "Show camera controls": "",
  "Hide camera controls": "",
};

const SCOPE = ".camera-controls";

type Tip = { text: string; x: number; y: number };

export function InstantTips() {
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    let current: HTMLElement | null = null;
    const restore = () => {
      if (current?.dataset.tipTitle !== undefined) {
        current.setAttribute("title", current.dataset.tipTitle);
        delete current.dataset.tipTitle;
      }
      current = null;
      setTip(null);
    };
    const over = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest?.(`${SCOPE} [title]`) as HTMLElement | null;
      if (target === current) return;
      restore();
      if (!target) return;
      const title = target.getAttribute("title") ?? "";
      if (!title) return;
      current = target;
      target.dataset.tipTitle = title;
      target.removeAttribute("title");
      const keys = title.match(/\s*(\([^)]*\))\s*$/)?.[1] ?? "";
      const base = keys ? title.slice(0, title.lastIndexOf(keys)).trim() : title;
      const hint = getLanguage() === "en" ? HINTS_EN[base] : "";
      const rect = target.getBoundingClientRect();
      setTip({ text: hint ? `${base} – ${hint}${keys ? ` ${keys}` : ""}` : title, x: rect.right + 10, y: rect.top + rect.height / 2 });
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerdown", restore, true);
    window.addEventListener("blur", restore);
    return () => {
      restore();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerdown", restore, true);
      window.removeEventListener("blur", restore);
    };
  }, []);
  if (!tip) return null;
  return (
    <div className="instant-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  );
}
