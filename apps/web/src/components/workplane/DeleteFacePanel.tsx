"use client";

import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { Check, LoaderCircle, X } from "lucide-react";
import { EdgeFeatureHistory, type EdgeHistoryOption } from "@/components/workplane/EdgeModifierPanel";
import { cadModifierUserErrorMessage } from "@/lib/cadModifierRuntime";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

/**
 * Deleting faces of a body (#451): the faces are clicked on the body, the
 * panel counts them, and Delete lets the faces around them close the gap.
 */
export function DeleteFacePanel({
  mode = "delete",
  angle = 3,
  onAngleChange,
  workspace,
  targetName,
  faceCount,
  preparing,
  busy,
  error,
  appliedFeatureCount,
  reversibleFeatureCount,
  historyOptions,
  onRemoveFeature,
  onClear,
  onApply,
  onCancel,
}: {
  /** Fork (build 37): "draft" leans the picked faces in by `angle` degrees instead of deleting them. */
  mode?: "delete" | "draft";
  angle?: number;
  onAngleChange?: (angle: number) => void;
  workspace?: WorkplaneWorkspaceSettings;
  targetName: string;
  faceCount: number;
  /** The worker is still reading the body's faces. */
  preparing: boolean;
  busy: boolean;
  error: string | null;
  /** The treatments the body already has, to revert. */
  appliedFeatureCount: number;
  reversibleFeatureCount: number;
  historyOptions: EdgeHistoryOption[];
  onRemoveFeature: (id: string) => void;
  onClear: () => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const drafting = mode === "draft";
  const title = t(drafting ? "draft.title" : "deleteFace.title");
  const count = faceCount === 0 ? t("deleteFace.countNone") : faceCount === 1 ? t("deleteFace.countOne") : t("deleteFace.countMany", { count: faceCount });
  return (
    <MovableToolPanel className="edge-modifier-panel delete-face-panel" ariaLabel={title}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t(drafting ? "draft.subtitle" : "deleteFace.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section={drafting ? "draft" : "deleteFace"} />
          <button type="button" aria-label={t("deleteFace.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      <div className="edge-modifier-target">
        <strong>{targetName}</strong>
        <span>{t(drafting ? "draft.help" : "deleteFace.help")}</span>
      </div>

      <div className="edge-modifier-selection-help">{preparing ? t("deleteFace.preparing") : count}</div>
      <div className="edge-modifier-quick-actions">
        <button type="button" disabled={busy || faceCount === 0} onClick={onClear}>{t("edge.clear")}</button>
      </div>
      {drafting && onAngleChange && workspace ? (
        <>
          <EdgeModifierSlider label={t("draft.angle")} value={angle} min={-30} max={30} step={0.5} unit="°" workspace={workspace} disabled={busy} onChange={(value) => onAngleChange(Math.round(value * 10) / 10)} />
          <div className="edge-size-presets" role="group" aria-label={t("draft.angle")}>
            {[1, 2, 3, 5].map((preset) => (
              <button key={preset} type="button" className={angle === preset ? "active" : ""} disabled={busy} onClick={() => onAngleChange(preset)}>{preset}°</button>
            ))}
          </div>
          <p className="blend-hint">{t("draft.hint")}</p>
        </>
      ) : null}

      <EdgeFeatureHistory
        appliedFeatureCount={appliedFeatureCount}
        reversibleFeatureCount={reversibleFeatureCount}
        historyOptions={historyOptions}
        onRemoveFeature={onRemoveFeature}
      />

      {error ? <div className="edge-modifier-error" role="alert">{cadModifierUserErrorMessage(error)}</div> : null}
      <div className="edge-modifier-footer">
        <button type="button" className="secondary" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="button" className="primary" disabled={busy || preparing || faceCount === 0} onClick={onApply}>
          {busy ? <LoaderCircle className="edge-modifier-spinner" size={17} /> : <Check size={17} />}
          {busy ? t(drafting ? "draft.working" : "deleteFace.working") : t(drafting ? "draft.apply" : "deleteFace.apply")}
        </button>
      </div>
      </>)}
    </MovableToolPanel>
  );
}
