"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { SurfaceTextMode } from "@/lib/surfaceText";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

export type SurfaceTextSettings = { text: string; font: string; letterHeight: number; depth: number; mode: SurfaceTextMode; rotation: number };

export const SURFACE_TEXT_FONTS = ["Multilanguage", "Sans", "Serif", "Rounded", "Script", "Monospace", "Stencil"] as const;

/**
 * Fork (build 34): text on any surface. Type the text, click where it goes on any part - flat, curved,
 * a dome, a scan - and it hugs the surface, raised or cut in. Click elsewhere to move it; every
 * setting can be changed after placing, and again later by selecting the text.
 */
export function SurfaceTextPanel({
  settings,
  placed,
  targetName,
  editing,
  busy,
  offSurface,
  error,
  workspace,
  onChange,
  onApply,
  onCancel,
}: {
  settings: SurfaceTextSettings;
  placed: boolean;
  targetName: string | null;
  editing: boolean;
  busy: boolean;
  /** Share of the letters that found no surface under them. */
  offSurface: number;
  error: string | null;
  workspace: WorkplaneWorkspaceSettings;
  onChange: (patch: Partial<SurfaceTextSettings>) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = t("surfaceText.title");
  return (
    <MovableToolPanel className="edge-modifier-panel surface-text-panel" ariaLabel={title}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{placed && targetName ? t("surfaceText.onPart", { name: targetName }) : t("surfaceText.clickToPlace")}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="surfaceText" />
          <button type="button" aria-label={t("common.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>
      <label className="surface-text-field">
        <span>{t("readyParts.textLabel")}</span>
        <input
          type="text"
          value={settings.text}
          maxLength={40}
          autoFocus
          onKeyDown={(event) => event.stopPropagation()}
          onChange={(event) => onChange({ text: event.currentTarget.value })}
        />
      </label>
      <label className="surface-text-field">
        <span>{t("surfaceText.font")}</span>
        <select value={settings.font} onChange={(event) => onChange({ font: event.currentTarget.value })}>
          {SURFACE_TEXT_FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
        </select>
      </label>
      <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("readyParts.textMode")}>
        <div className="shell-opening-options">
          {(["raised", "engraved"] as const).map((mode) => (
            <button key={mode} type="button" role="radio" aria-checked={settings.mode === mode} className={settings.mode === mode ? "active" : ""} onClick={() => onChange({ mode })}>
              {t(mode === "engraved" ? "readyParts.engraved" : "readyParts.raised")}
            </button>
          ))}
        </div>
      </div>
      <EdgeModifierSlider label={t("readyParts.letterHeight")} value={settings.letterHeight} min={2} max={60} step={0.5} coarse={{ step: 0.5, max: 40 }} workspace={workspace} length onChange={(letterHeight) => onChange({ letterHeight })} />
      <EdgeModifierSlider label={t("readyParts.textDepth")} value={settings.depth} min={0.2} max={10} step={0.1} coarse={{ step: 0.1, max: 5 }} workspace={workspace} length onChange={(depth) => onChange({ depth })} />
      <EdgeModifierSlider label={t("surfaceText.rotation")} value={settings.rotation} min={-180} max={180} step={1} unit="°" workspace={workspace} onChange={(rotation) => onChange({ rotation: Math.round(rotation) })} />
      <p className="edge-modifier-selection-help">
        {busy ? <><LoaderCircle className="edge-modifier-spinner" size={14} /> {t("surfaceText.working")}</> : placed ? t("surfaceText.moveHint") : t("surfaceText.help")}
      </p>
      {offSurface > 0.02 ? <p className="blend-hint blend-warning" role="status">{t("surfaceText.offSurface", { share: Math.round(offSurface * 100) })}</p> : null}
      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : null}
      <div className="edge-modifier-footer">
        <button type="button" className="secondary" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="button" className="primary" disabled={!placed || busy || !settings.text.trim()} onClick={onApply}>
          <Check size={17} />
          {t(editing ? "surfaceText.update" : "surfaceText.apply")}
        </button>
      </div>
      </>)}
    </MovableToolPanel>
  );
}
