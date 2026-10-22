"use client";

import { Check, ImagePlus, X } from "lucide-react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { useMemo, useRef, useState } from "react";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { Field, readImage, type LithophaneImage } from "@/components/workplane/LithophanePanel";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { DEFAULT_TOOL_BIN, DEFAULT_TRACE, traceImage, traceImageAll, type ToolBinOptions, type TraceOptions, type TraceResult } from "@/lib/photoTrace";

/**
 * Fork (build 21): photo to outline - choose a photo of a tool, a template or a logo on plain paper,
 * check the traced line over it, give its real length, and add it as a cut-out or a solid.
 */
export function TracePanel({ busy, onCreate, onCreateBin, onClose }: { busy: boolean; onCreate: (trace: TraceResult, options: TraceOptions, name: string) => void; onCreateBin?: (traces: TraceResult[], options: ToolBinOptions, name: string) => void; onClose: () => void }) {
  useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<(LithophaneImage & { url: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [o, setO] = useState<TraceOptions>(DEFAULT_TRACE);
  const set = (patch: Partial<TraceOptions>) => setO((current) => ({ ...current, ...patch }));
  // Fork (build 33): "Gridfinity bin" - every tool in the photo, each in a pocket of its own.
  const [binMode, setBinMode] = useState(false);
  const [bin, setBin] = useState<ToolBinOptions>(DEFAULT_TOOL_BIN);
  const setB = (patch: Partial<ToolBinOptions>) => setBin((current) => ({ ...current, ...patch }));
  const trace = useMemo(() => (image ? traceImage(image, { invert: o.invert }) : null), [image, o.invert]);
  const traces = useMemo(() => (image && binMode ? traceImageAll(image, { invert: o.invert }) : []), [binMode, image, o.invert]);
  const mmPerPixel = binMode
    ? (traces[0] ? bin.length / Math.max(traces[0].widthPx, traces[0].heightPx) : 0)
    : trace ? o.length / Math.max(trace.widthPx, trace.heightPx) : 0;
  return (
    <MovableToolPanel className="edge-modifier-panel shell-panel lithophane-panel trace-panel" ariaLabel={t("trace.title")}>
      {(handleProps) => (<>
        <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
          <div>
            <strong>{t("trace.title")}</strong>
            <span>{t("trace.subtitle")}</span>
          </div>
          <div className="panel-header-actions">
            <GuideHelpLink section="makeFromPhoto" />
            <button type="button" aria-label={t("common.cancel")} onClick={onClose}><X size={20} /></button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            setError(null);
            const url = URL.createObjectURL(file);
            void readImage(file).then((read) => setImage({ ...read, url })).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
          }}
        />
        <button type="button" className="lithophane-pick" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={18} aria-hidden="true" />
          {image ? t("lithophane.changePhoto", { name: image.name }) : t("trace.choose")}
        </button>
        {error ? <div className="split-panel-error" role="alert">{error}</div> : null}
        {image ? (
          <div className="trace-preview">
            <svg viewBox={`0 0 ${image.width} ${image.height}`} aria-label={t("trace.preview")}>
              <image href={image.url} x="0" y="0" width={image.width} height={image.height} preserveAspectRatio="none" opacity="0.75" />
              {(binMode ? traces : trace ? [trace] : []).map((shown, index) => (
                <polygon key={index} points={shown.outline.map(([x, y]) => `${x},${y}`).join(" ")} fill="rgba(224, 52, 124, 0.18)" stroke="#e0347c" strokeWidth={Math.max(1.5, image.width / 250)} />
              ))}
            </svg>
            <span>
              {binMode
                ? traces.length ? t("trace.foundTools", { count: traces.length, width: (traces[0].widthPx * mmPerPixel).toFixed(0), depth: (traces[0].heightPx * mmPerPixel).toFixed(0) }) : t("trace.notFound")
                : trace ? t("trace.found", { width: (trace.widthPx * mmPerPixel).toFixed(1), depth: (trace.heightPx * mmPerPixel).toFixed(1), points: trace.outline.length }) : t("trace.notFound")}
            </span>
          </div>
        ) : (
          <p className="lithophane-info">{t("trace.intro")}</p>
        )}
        <label className="lithophane-check">
          <input type="checkbox" checked={o.invert} onChange={(event) => set({ invert: event.currentTarget.checked })} />
          {t("trace.invert")}
        </label>
        <div className="lithophane-field">
          <span>{t("trace.makeAs")}</span>
          <div className="lithophane-choice" role="radiogroup" aria-label={t("trace.makeAs")}>
            {(["cutout", "solid", ...(onCreateBin ? ["bin" as const] : [])] as const).map((mode) => {
              const active = mode === "bin" ? binMode : !binMode && o.mode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={active ? "active" : ""}
                  onClick={() => {
                    if (mode === "bin") {
                      setBinMode(true);
                      return;
                    }
                    setBinMode(false);
                    set(mode === "cutout" ? { mode, height: 20, clearance: 1 } : { mode, height: 3, clearance: 0 });
                  }}
                >
                  {t(mode === "cutout" ? "trace.cutout" : mode === "solid" ? "trace.solid" : "trace.bin")}
                </button>
              );
            })}
          </div>
        </div>
        {binMode ? (
          <>
            <div className="lithophane-grid">
              <Field label={t("trace.binLength")} value={bin.length} onChange={(length) => setB({ length: Math.max(5, Math.min(1000, length)) })} />
              <Field label={t("trace.depth")} value={bin.depth} onChange={(depth) => setB({ depth: Math.max(2, Math.min(120, depth)) })} />
              <Field label={t("trace.clearance")} value={bin.clearance} onChange={(clearance) => setB({ clearance: Math.max(0, Math.min(10, clearance)) })} />
            </div>
            <label className="lithophane-check">
              <input type="checkbox" checked={bin.fingerNotches} onChange={(event) => setB({ fingerNotches: event.currentTarget.checked })} />
              {t("trace.fingerNotches")}
            </label>
            <p className="lithophane-info">{t("trace.binTip")}</p>
          </>
        ) : (
          <>
            <div className="lithophane-grid">
              <Field label={t("trace.length")} value={o.length} onChange={(length) => set({ length: Math.max(1, Math.min(1000, length)) })} />
              <Field label={t(o.mode === "cutout" ? "trace.depth" : "trace.height")} value={o.height} onChange={(height) => set({ height: Math.max(0.4, Math.min(300, height)) })} />
              <Field label={t("trace.clearance")} value={o.clearance} onChange={(clearance) => set({ clearance: Math.max(0, Math.min(10, clearance)) })} />
            </div>
            <p className="lithophane-info">{t(o.mode === "cutout" ? "trace.cutoutTip" : "trace.solidTip")}</p>
          </>
        )}
        <div className="edge-modifier-footer">
          <button type="button" className="secondary" onClick={onClose}>{t("common.cancel")}</button>
          <button
            type="button"
            className="primary"
            disabled={(binMode ? traces.length === 0 : !trace) || busy}
            onClick={() => {
              if (!image) return;
              if (binMode) onCreateBin?.(traces, { ...bin, invert: o.invert }, image.name);
              else if (trace) onCreate(trace, o, image.name);
            }}
          >
            <Check size={17} />
            {busy ? t("lithophane.making") : t(binMode ? "trace.createBin" : "trace.create")}
          </button>
        </div>
      </>)}
    </MovableToolPanel>
  );
}
