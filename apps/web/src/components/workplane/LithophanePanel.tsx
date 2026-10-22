"use client";

import { Check, ImagePlus, X } from "lucide-react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { useEffect, useRef, useState } from "react";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { DEFAULT_LITHOPHANE, adjustBrightness, lithophaneGrid, lithophaneHeight, normalizeLithophane, type LithophaneOptions, type LithophaneShape } from "@/lib/lithophane";

/** A photo's brightness, 0 to 1, as many points across and down as it was read at. */
export type LithophaneImage = { name: string; width: number; height: number; light: Float32Array };

const READ_SIZE = 1000;
const RESOLUTIONS = [
  { value: 0.5, label: "lithophane.resDraft" },
  { value: 0.3, label: "lithophane.resNormal" },
  { value: 0.2, label: "lithophane.resFine" },
] as const;

/** Reads an image file into brightness values, at most READ_SIZE points on its long side. */
export async function readImage(file: File): Promise<LithophaneImage> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(t("lithophane.badImage")));
      element.src = url;
    });
    const scale = Math.min(1, READ_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(2, Math.round(image.naturalWidth * scale));
    const height = Math.max(2, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error(t("lithophane.badImage"));
    // Transparent parts count as white (thin).
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    const light = new Float32Array(width * height);
    for (let index = 0; index < light.length; index += 1) {
      light[index] = (0.299 * data[index * 4] + 0.587 * data[index * 4 + 1] + 0.114 * data[index * 4 + 2]) / 255;
    }
    return { name: file.name.replace(/\.[^.]+$/, ""), width, height, light };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The brightness at u, v (0 to 1, v down), smoothly between the points it was read at. */
export function sampleImage(image: LithophaneImage, u: number, v: number) {
  const x = Math.min(image.width - 1, Math.max(0, u * (image.width - 1)));
  const y = Math.min(image.height - 1, Math.max(0, v * (image.height - 1)));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(image.width - 1, x0 + 1), y1 = Math.min(image.height - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const at = (px: number, py: number) => image.light[py * image.width + px];
  return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
}

export function LithophanePanel({ busy, onCreate, onClose }: { busy: boolean; onCreate: (image: LithophaneImage, options: LithophaneOptions) => void; onClose: () => void }) {
  useLanguage();
  const [image, setImage] = useState<LithophaneImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<LithophaneOptions>(DEFAULT_LITHOPHANE);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const set = (patch: Partial<LithophaneOptions>) => setOptions(normalizeLithophane({ ...options, ...patch }));

  // The preview: how the plate looks lit from behind - light where thin, dark where thick.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !image) return;
    const width = 240;
    const height = Math.max(20, Math.round((width * image.height) / image.width));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const pixels = context.createImageData(width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const light = adjustBrightness(sampleImage(image, x / (width - 1), y / (height - 1)), options);
        const thickness = options.minThickness + (1 - light) * (options.maxThickness - options.minThickness);
        // Light through the plate falls off with thickness; warm, like a lamp behind it.
        const through = Math.exp(-1.1 * (thickness - options.minThickness));
        const index = (y * width + x) * 4;
        pixels.data[index] = Math.round(255 * through);
        pixels.data[index + 1] = Math.round(236 * through);
        pixels.data[index + 2] = Math.round(200 * through);
        pixels.data[index + 3] = 255;
      }
    }
    context.putImageData(pixels, 0, 0);
  }, [image, options]);

  const pictureHeight = image ? lithophaneHeight(options.width, image.width, image.height) : 0;
  const grid = image ? lithophaneGrid(options, image.width, image.height) : null;
  const shapes = [
    { value: "flat", label: "lithophane.flat" },
    { value: "curved", label: "lithophane.curved" },
    { value: "cylinder", label: "lithophane.cylinder" },
  ] as const satisfies ReadonlyArray<{ value: LithophaneShape; label: string }>;

  return (
    <MovableToolPanel className="edge-modifier-panel shell-panel lithophane-panel" ariaLabel={t("lithophane.title")}>
      {(handleProps) => (<>
        <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
          <div>
            <strong>{t("lithophane.title")}</strong>
            <span>{t("lithophane.subtitle")}</span>
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
            void readImage(file).then(setImage).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
          }}
        />
        <button type="button" className="lithophane-pick" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={18} aria-hidden="true" />
          {image ? t("lithophane.changePhoto", { name: image.name }) : t("lithophane.choosePhoto")}
        </button>
        {error ? <div className="split-panel-error" role="alert">{error}</div> : null}
        {image ? (
          <div className="lithophane-preview">
            <canvas ref={previewRef} aria-label={t("lithophane.preview")} />
            <span>{t("lithophane.previewHint")}</span>
          </div>
        ) : null}

        <div className="lithophane-field">
          <span>{t("lithophane.shape")}</span>
          <div className="lithophane-choice" role="radiogroup" aria-label={t("lithophane.shape")}>
            {shapes.map((entry) => (
              <button key={entry.value} type="button" role="radio" aria-checked={options.shape === entry.value} className={options.shape === entry.value ? "active" : ""} onClick={() => set({ shape: entry.value })}>
                {t(entry.label)}
              </button>
            ))}
          </div>
        </div>

        <div className="lithophane-grid">
          <Field label={t(options.shape === "cylinder" ? "lithophane.around" : "lithophane.width")} value={options.width} onChange={(width) => set({ width })} />
          <Field label={t("lithophane.border")} value={options.border} onChange={(border) => set({ border })} />
          <Field label={t("lithophane.thinnest")} value={options.minThickness} onChange={(minThickness) => set({ minThickness })} />
          <Field label={t("lithophane.thickest")} value={options.maxThickness} onChange={(maxThickness) => set({ maxThickness })} />
          {options.shape === "curved" ? <Field label={t("lithophane.arc")} unit="°" value={options.arcDegrees} onChange={(arcDegrees) => set({ arcDegrees })} /> : null}
        </div>

        <Slider label={t("lithophane.brightness")} value={options.brightness} onChange={(brightness) => set({ brightness })} />
        <Slider label={t("lithophane.contrast")} value={options.contrast} onChange={(contrast) => set({ contrast })} />

        <div className="lithophane-field">
          <span>{t("lithophane.detail")}</span>
          <div className="lithophane-choice" role="radiogroup" aria-label={t("lithophane.detail")}>
            {RESOLUTIONS.map((entry) => (
              <button key={entry.value} type="button" role="radio" aria-checked={Math.abs(options.resolution - entry.value) < 1e-6} className={Math.abs(options.resolution - entry.value) < 1e-6 ? "active" : ""} onClick={() => set({ resolution: entry.value })}>
                {t(entry.label)}
              </button>
            ))}
          </div>
        </div>

        <label className="lithophane-check">
          <input type="checkbox" checked={options.invert} onChange={(event) => set({ invert: event.currentTarget.checked })} />
          {t("lithophane.invert")}
        </label>
        {options.shape === "flat" ? (
          <label className="lithophane-check">
            <input type="checkbox" checked={options.stand} onChange={(event) => set({ stand: event.currentTarget.checked })} />
            {t("lithophane.stand")}
          </label>
        ) : null}

        {image && grid ? (
          <p className="lithophane-info">
            {t("lithophane.size", { width: (options.width + (options.shape === "cylinder" ? 0 : 2 * options.border)).toFixed(0), height: (pictureHeight + 2 * options.border).toFixed(0), thick: options.maxThickness.toFixed(1) })}
            {" "}
            {t("lithophane.printTip")}
          </p>
        ) : (
          <p className="lithophane-info">{t("lithophane.intro")}</p>
        )}

        <div className="edge-modifier-footer">
          <button type="button" className="secondary" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="primary" disabled={!image || busy} onClick={() => image && onCreate(image, options)}>
            <Check size={17} />
            {busy ? t("lithophane.making") : t("lithophane.create")}
          </button>
        </div>
      </>)}
    </MovableToolPanel>
  );
}

export function Field({ label, value, onChange, unit = "mm" }: { label: string; value: number; onChange: (value: number) => void; unit?: string }) {
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
        <small>{unit}</small>
      </span>
    </label>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="lithophane-slider">
      <span>{label}</span>
      <input type="range" min={-1} max={1} step={0.05} value={value} aria-label={label} onChange={(event) => onChange(event.currentTarget.valueAsNumber)} />
    </label>
  );
}
