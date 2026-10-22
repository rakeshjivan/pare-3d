"use client";

import { Check, Shuffle, X } from "lucide-react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { useMemo, useState } from "react";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { DEFAULT_VORONOI, normalizeVoronoi, voronoiCells, voronoiSeeds, type VoronoiOptions } from "@/lib/voronoi";

export function VoronoiPanel({ busy, onCreate, onClose }: { busy: boolean; onCreate: (options: VoronoiOptions) => void; onClose: () => void }) {
  useLanguage();
  const [options, setOptions] = useState<VoronoiOptions>(DEFAULT_VORONOI);
  const set = (patch: Partial<VoronoiOptions>) => setOptions(normalizeVoronoi({ ...options, ...patch }));
  const cells = useMemo(() => voronoiCells(voronoiSeeds(options), options.width, options.depth), [options]);
  const scale = 240 / Math.max(options.width, options.depth);
  const viewWidth = options.width * scale;
  const viewHeight = options.depth * scale;
  return (
    <MovableToolPanel className="edge-modifier-panel shell-panel voronoi-panel" ariaLabel={t("voronoi.title")}>
      {(handleProps) => (<>
        <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
          <div>
            <strong>{t("voronoi.title")}</strong>
            <span>{t("voronoi.subtitle")}</span>
          </div>
          <div className="panel-header-actions">
            <GuideHelpLink section="makeFromPhoto" />
            <button type="button" aria-label={t("common.cancel")} onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        <div className="lithophane-preview voronoi-preview">
          <svg viewBox={`${-viewWidth / 2} ${-viewHeight / 2} ${viewWidth} ${viewHeight}`} width={viewWidth} height={viewHeight} aria-label={t("voronoi.preview")}>
            <rect x={-viewWidth / 2} y={-viewHeight / 2} width={viewWidth} height={viewHeight} className="voronoi-plate" />
            {cells.map((cell, index) => (
              <polygon key={index} points={cell.map(([x, y]) => `${x * scale},${-y * scale}`).join(" ")} className="voronoi-cell" strokeWidth={Math.max(0.6, options.strut * scale)} strokeLinejoin="round" />
            ))}
            {options.mode === "panel" && options.border > 0 ? (
              <rect x={-viewWidth / 2} y={-viewHeight / 2} width={viewWidth} height={viewHeight} className="voronoi-border" strokeWidth={options.border * scale * 2} />
            ) : null}
          </svg>
        </div>

        <div className="lithophane-field">
          <span>{t("voronoi.make")}</span>
          <div className="lithophane-choice" role="radiogroup" aria-label={t("voronoi.make")}>
            {(["panel", "pattern"] as const).map((mode) => (
              <button key={mode} type="button" role="radio" aria-checked={options.mode === mode} className={options.mode === mode ? "active" : ""} onClick={() => set({ mode })}>
                {t(mode === "panel" ? "voronoi.panel" : "voronoi.pattern")}
              </button>
            ))}
          </div>
        </div>
        <p className="lithophane-info">{t(options.mode === "panel" ? "voronoi.panelHint" : "voronoi.patternHint")}</p>

        <div className="lithophane-grid">
          <Field label={t("voronoi.width")} value={options.width} onChange={(width) => set({ width })} />
          <Field label={t("voronoi.depth")} value={options.depth} onChange={(depth) => set({ depth })} />
          <Field label={t("voronoi.thickness")} value={options.thickness} onChange={(thickness) => set({ thickness })} />
          <Field label={t("voronoi.cells")} unit="" value={options.cells} onChange={(cells) => set({ cells })} />
          <Field label={t("voronoi.strut")} value={options.strut} onChange={(strut) => set({ strut })} />
          <Field label={t("voronoi.rounding")} value={options.rounding} onChange={(rounding) => set({ rounding })} />
          {options.mode === "panel" ? <Field label={t("voronoi.border")} value={options.border} onChange={(border) => set({ border })} /> : null}
        </div>
        <label className="lithophane-slider">
          <span>{t("voronoi.evenness")}</span>
          <input type="range" min={0} max={8} step={1} value={options.evenness} aria-label={t("voronoi.evenness")} onChange={(event) => set({ evenness: event.currentTarget.valueAsNumber })} />
        </label>
        <button type="button" className="lithophane-pick" onClick={() => set({ seed: (options.seed % 99999) + 1 })}>
          <Shuffle size={16} aria-hidden="true" />
          {t("voronoi.shuffle")}
        </button>
        {options.strut < 0.8 ? <p className="lithophane-info warning">{t("voronoi.thinStrut")}</p> : null}

        <div className="edge-modifier-footer">
          <button type="button" className="secondary" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="primary" disabled={busy} onClick={() => onCreate(options)}>
            <Check size={17} />
            {busy ? t("lithophane.making") : t("voronoi.create")}
          </button>
        </div>
      </>)}
    </MovableToolPanel>
  );
}

function Field({ label, value, onChange, unit = "mm" }: { label: string; value: number; onChange: (value: number) => void; unit?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) {
      const parsed = Number(draft.replace(",", "."));
      if (Number.isFinite(parsed)) onChange(parsed);
    }
    setDraft(null);
  };
  return (
    <label className="lithophane-number">
      <span>{label}</span>
      <span>
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={draft ?? String(Math.round(value * 100) / 100)}
          onFocus={(event) => { setDraft(String(Math.round(value * 100) / 100)); event.currentTarget.select(); }}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") { setDraft(null); event.currentTarget.blur(); }
          }}
        />
        {unit ? <small>{unit}</small> : null}
      </span>
    </label>
  );
}
