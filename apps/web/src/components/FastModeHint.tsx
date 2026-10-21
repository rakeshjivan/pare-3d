"use client";

import { Gauge, X } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";

const STORAGE_KEY = "pare3d.fastModeHint";
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen/i;

/** The graphics chip's name, where the browser tells it - a software renderer means no real 3D chip. */
function rendererName() {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return "";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return name;
  } catch {
    return "";
  }
}

/**
 * Fork (build 19): offers Fast mode once, on a computer that looks too slow for the full view -
 * one drawing 3D without a graphics chip, or one where the view keeps stalling in the first minute.
 */
export function FastModeHint({ fastMode, onTurnOn }: { fastMode: boolean; onTurnOn: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (fastMode) return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return;
    }
    if (SOFTWARE_RENDERER.test(rendererName())) {
      setShow(true);
      return;
    }
    // Otherwise watch the first minute: many long stalls mean the view is too heavy for this computer.
    let last = performance.now();
    let stalls = 0;
    let frame = 0;
    const started = last;
    const tick = (now: number) => {
      if (now - last > 120 && document.visibilityState === "visible") stalls += 1;
      last = now;
      if (stalls >= 12) {
        setShow(true);
        return;
      }
      if (now - started < 60000) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [fastMode]);
  if (!show || fastMode) return null;
  const remember = (answer: string) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, answer);
    } catch {
      // Asked again next time.
    }
    setShow(false);
  };
  return (
    <div className="fast-mode-hint" role="status">
      <Gauge size={20} aria-hidden="true" />
      <span>
        <strong>{t("fastModeHint.title")}</strong>
        <small>{t("fastModeHint.body")}</small>
      </span>
      <button
        type="button"
        className="primary"
        onClick={() => {
          onTurnOn();
          remember("on");
        }}
      >
        {t("fastModeHint.turnOn")}
      </button>
      <button type="button" className="fast-mode-hint-close" aria-label={t("fastModeHint.noThanks")} title={t("fastModeHint.noThanks")} onClick={() => remember("declined")}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
