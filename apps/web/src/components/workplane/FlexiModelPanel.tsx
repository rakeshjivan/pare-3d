"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { FlexiModelOptions } from "@/lib/flexiModel";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

/** Fork (build 33): Make it flexi - the selected model cut into segments joined by print-in-place joints. */
export function FlexiModelPanel({
  targetName,
  options,
  segmentLength,
  busy,
  error,
  workspace,
  onChange,
  onApply,
  onCancel,
}: {
  targetName: string;
  options: FlexiModelOptions;
  /** How long each segment comes out, in mm. */
  segmentLength: number;
  busy: boolean;
  error: string | null;
  workspace: WorkplaneWorkspaceSettings;
  onChange: (patch: Partial<FlexiModelOptions>) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = t("flexiModel.title");
  return (
    <MovableToolPanel className="edge-modifier-panel flexi-model-panel" ariaLabel={title}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{targetName}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="flexiModel" />
          <button type="button" aria-label={t("common.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>
      <p className="edge-modifier-selection-help">{t("flexiModel.help")}</p>
      <EdgeModifierSlider label={t("flexiModel.segments")} value={options.segments} min={2} max={30} step={1} workspace={workspace} disabled={busy} onChange={(segments) => onChange({ segments: Math.round(segments) })} />
      <p className="blend-hint">{t("flexiModel.segmentLength", { length: segmentLength.toFixed(1) })}</p>
      <EdgeModifierSlider label={t("fitCheck.clearance")} value={options.clearance} min={0.2} max={1} step={0.05} coarse={{ step: 0.05, max: 1 }} workspace={workspace} length disabled={busy} onChange={(clearance) => onChange({ clearance })} />
      <EdgeModifierSlider label={t("flexiModel.swing")} value={options.swing} min={5} max={45} step={1} unit="°" workspace={workspace} disabled={busy} onChange={(swing) => onChange({ swing: Math.round(swing) })} />
      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : null}
      <div className="edge-modifier-footer">
        <button type="button" className="secondary" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="button" className="primary" disabled={busy} onClick={onApply}>
          {busy ? <LoaderCircle className="edge-modifier-spinner" size={17} /> : <Check size={17} />}
          {busy ? t("flexiModel.working") : t("flexiModel.apply")}
        </button>
      </div>
      </>)}
    </MovableToolPanel>
  );
}
