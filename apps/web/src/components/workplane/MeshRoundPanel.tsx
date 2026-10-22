"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { MeshRoundMode } from "@/lib/meshRound";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

/** Fork (build 33): Round a mesh - every outside edge, inside edge or both, by one radius. */
export function MeshRoundPanel({
  targetName,
  radius,
  minRadius,
  maxRadius,
  mode,
  busy,
  error,
  workspace,
  onRadiusChange,
  onModeChange,
  onApply,
  onCancel,
}: {
  targetName: string;
  radius: number;
  minRadius: number;
  maxRadius: number;
  mode: MeshRoundMode;
  busy: boolean;
  error: string | null;
  workspace: WorkplaneWorkspaceSettings;
  onRadiusChange: (value: number) => void;
  onModeChange: (mode: MeshRoundMode) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = t("meshRound.title");
  return (
    <MovableToolPanel className="edge-modifier-panel mesh-round-panel" ariaLabel={title}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{targetName}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="meshRound" />
          <button type="button" aria-label={t("common.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>
      <p className="edge-modifier-selection-help">{t("meshRound.help")}</p>
      <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("meshRound.which")}>
        <div className="shell-opening-options">
          {([
            ["outside", t("meshRound.outside")],
            ["inside", t("meshRound.inside")],
            ["both", t("meshRound.both")],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={mode === value} className={mode === value ? "active" : ""} disabled={busy} onClick={() => onModeChange(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <EdgeModifierSlider
        label={t("edge.radius")}
        value={radius}
        min={minRadius}
        max={maxRadius}
        step={0.1}
        coarse={{ step: 0.1, max: Math.min(maxRadius, 10) }}
        workspace={workspace}
        length
        disabled={busy}
        onChange={onRadiusChange}
      />
      <p className="blend-hint">{t("meshRound.note", { min: minRadius.toFixed(1) })}</p>
      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : null}
      <div className="edge-modifier-footer">
        <button type="button" className="secondary" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="button" className="primary" disabled={busy} onClick={onApply}>
          {busy ? <LoaderCircle className="edge-modifier-spinner" size={17} /> : <Check size={17} />}
          {busy ? t("meshRound.working") : t("meshRound.apply")}
        </button>
      </div>
      </>)}
    </MovableToolPanel>
  );
}
