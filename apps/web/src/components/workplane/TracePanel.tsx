"use client";

import { Check, ImagePlus, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { Field, readImage, type LithophaneImage } from "@/components/workplane/LithophanePanel";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { DEFAULT_TRACE, traceImage, type TraceOptions, type TraceResult } from "@/lib/photoTrace";

/**
 * Fork (build 21): photo to outline - choose a photo of a tool, a template or a logo on plain paper,
 * check the traced line over it, give its real length, and add it as a cut-out or a solid.
 */
export function TracePanel({ busy, onCreate, onClose }: { busy: boolean; onCreate: (trace: TraceResult, options: TraceOptions, name: string) => void; onClose: () => void }) {
  useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<(LithophaneImage & { url: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [o, setO] = useState<TraceOptions>(DEFAULT_TRACE);
  const set = (patch: Partial<TraceOptions>) => setO((current) => ({ ...current, ...patch }));
  const trace = useMemo(() => (image ? traceImage(image, { invert: o.invert }) : null), [image, o.invert]);
  const mmPerPixel = trace ? o.length / Math.max(trace.widthPx, trace.heightPx) : 0;
  return (
    <MovableToolPanel className="edge-modifier-panel shell-panel lithophane-panel trace-panel" ariaLabel={t("trace.title")}>
      {(handleProps) => (<>
        <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
          <div>
            <strong>{t("trace.title")}</strong>
            <span>{t("trace.subtitle")}</span>
          </div>
          <div className="panel-header-actions">
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
              {trace ? <polygon points={trace.outline.map(([x, y]) => `${x},${y}`).join(" ")} fill="rgba(224, 52, 124, 0.18)" stroke="#e0347c" strokeWidth={Math.max(1.5, image.width / 250)} /> : null}
            </svg>
            <span>{trace ? t("trace.found", { width: (trace.widthPx * mmPerPixel).toFixed(1), depth: (trace.heightPx * mmPerPixel).toFixed(1), points: trace.outline.length }) : t("trace.notFound")}</span>
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
            {(["cutout", "solid"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={o.mode === mode}
                className={o.mode === mode ? "active" : ""}
                onClick={() => set(mode === "cutout" ? { mode, height: 20, clearance: 1 } : { mode, height: 3, clearance: 0 })}
              >
                {t(mode === "cutout" ? "trace.cutout" : "trace.solid")}
              </button>
            ))}
          </div>
        </div>
        <div className="lithophane-grid">
          <Field label={t("trace.length")} value={o.length} onChange={(length) => set({ length: Math.max(1, Math.min(1000, length)) })} />
          <Field label={t(o.mode === "cutout" ? "trace.depth" : "trace.height")} value={o.height} onChange={(height) => set({ height: Math.max(0.4, Math.min(300, height)) })} />
          <Field label={t("trace.clearance")} value={o.clearance} onChange={(clearance) => set({ clearance: Math.max(0, Math.min(10, clearance)) })} />
        </div>
        <p className="lithophane-info">{t(o.mode === "cutout" ? "trace.cutoutTip" : "trace.solidTip")}</p>
        <div className="edge-modifier-footer">
          <button type="button" className="secondary" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="primary" disabled={!trace || busy} onClick={() => trace && image && onCreate(trace, o, image.name)}>
            <Check size={17} />
            {busy ? t("lithophane.making") : t("trace.create")}
          </button>
        </div>
      </>)}
    </MovableToolPanel>
  );
}
