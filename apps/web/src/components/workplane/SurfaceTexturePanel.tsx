"use client";

import { Check, ImageUp, LoaderCircle, X } from "lucide-react";
import { useRef } from "react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { t, type MessageKey } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { SURFACE_TEXTURE_PATTERNS, type SurfaceTextureOptions, type SurfaceTexturePattern } from "@/lib/surfaceTexture";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

/** Fork (build 55): Texture - a pattern pressed into or raised out of a part's surface. */
export function SurfaceTexturePanel({
  targetName,
  options,
  pictureName,
  busy,
  error,
  workspace,
  onChange,
  onPicture,
  onApply,
  onCancel,
}: {
  targetName: string;
  options: SurfaceTextureOptions;
  pictureName: string | null;
  busy: boolean;
  error: string | null;
  workspace: WorkplaneWorkspaceSettings;
  onChange: (patch: Partial<SurfaceTextureOptions>) => void;
  onPicture: (file: File) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const pictureInput = useRef<HTMLInputElement>(null);
  const title = t("texture.title");
  const needsPicture = options.pattern === "picture" && !options.picture;
  return (
    <MovableToolPanel className="edge-modifier-panel surface-texture-panel" ariaLabel={title}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{targetName}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="texture" />
          <button type="button" aria-label={t("common.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>
      <p className="edge-modifier-selection-help">{t("texture.help")}</p>
      <div className="surface-texture-patterns" role="radiogroup" aria-label={t("texture.pattern")}>
        {SURFACE_TEXTURE_PATTERNS.map((pattern: SurfaceTexturePattern) => (
          <button
            key={pattern}
            type="button"
            role="radio"
            data-texture={pattern}
            aria-checked={options.pattern === pattern}
            className={options.pattern === pattern ? "active" : ""}
            disabled={busy}
            onClick={() => onChange({ pattern })}
          >
            <span className={`surface-texture-swatch swatch-${pattern}`} aria-hidden="true" />
            <span>{t(`texture.pattern.${pattern}` as MessageKey)}</span>
          </button>
        ))}
      </div>
      {options.pattern === "picture" ? (
        <div className="surface-texture-picture">
          <input
            ref={pictureInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) onPicture(file);
            }}
          />
          <button type="button" className="secondary" disabled={busy} onClick={() => pictureInput.current?.click()}>
            <ImageUp size={16} />
            {pictureName ?? t("texture.choosePicture")}
          </button>
          <p className="blend-hint">{t("texture.pictureHint")}</p>
        </div>
      ) : null}
      <EdgeModifierSlider
        label={t(options.pattern === "picture" ? "texture.pictureSize" : "texture.size")}
        value={options.size}
        min={0.5}
        max={options.pattern === "picture" ? 200 : 30}
        step={0.1}
        coarse={{ step: 0.5, max: 30 }}
        workspace={workspace}
        length
        disabled={busy}
        onChange={(size) => onChange({ size })}
      />
      <EdgeModifierSlider
        label={t("texture.depth")}
        value={options.depth}
        min={0.1}
        max={3}
        step={0.05}
        coarse={{ step: 0.1, max: 3 }}
        workspace={workspace}
        length
        disabled={busy}
        onChange={(depth) => onChange({ depth })}
      />
      <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("texture.direction")}>
        <div className="shell-opening-options">
          {([
            ["in", t("texture.in")],
            ["out", t("texture.out")],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={options.direction === value} className={options.direction === value ? "active" : ""} disabled={busy} onClick={() => onChange({ direction: value })}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="edge-modifier-check">
        <input type="checkbox" checked={options.top} disabled={busy} onChange={(event) => onChange({ top: event.currentTarget.checked })} />
        <span>{t("texture.top")}</span>
      </label>
      <p className="blend-hint">{t("texture.note")}</p>
      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : null}
      <div className="edge-modifier-footer">
        <button type="button" className="secondary" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="button" className="primary" disabled={busy || needsPicture} onClick={onApply}>
          {busy ? <LoaderCircle className="edge-modifier-spinner" size={17} /> : <Check size={17} />}
          {busy ? t("texture.working") : t("texture.apply")}
        </button>
      </div>
      </>)}
    </MovableToolPanel>
  );
}
