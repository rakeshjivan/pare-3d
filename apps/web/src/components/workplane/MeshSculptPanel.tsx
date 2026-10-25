"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { SculptBrush } from "@/lib/meshSculpt";
import type { RemeshMode } from "@/lib/meshRemesh";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

export type SculptTool = "select" | "unselect" | SculptBrush;
export type SculptSelectionAction = "delete" | "smooth" | "flatten" | "grow" | "invert" | "clear";

/** Remesh, Offset and Thicken in the panel: off for now (see below). */
export const WHOLE_PART_TOOLS = false;

export const SCULPT_TOOLS: SculptTool[] = ["smooth", "flatten", "inflate", "deflate", "select", "unselect"];

/** Build 69: Sculpt - brushes that shape a mesh, a brush that selects a patch of it, and the whole part rebuilt. */
export function MeshSculptPanel({
  targetName,
  tool,
  size,
  strength,
  chosen,
  remeshMode,
  detail,
  amount,
  busy,
  error,
  workspace,
  onTool,
  onSize,
  onStrength,
  onSelection,
  onRemeshMode,
  onDetail,
  onAmount,
  onRemesh,
  onClose,
}: {
  targetName: string;
  tool: SculptTool | null;
  size: number;
  strength: number;
  chosen: number;
  remeshMode: RemeshMode;
  detail: number;
  amount: number;
  busy: boolean;
  error: string | null;
  workspace: WorkplaneWorkspaceSettings;
  onTool: (tool: SculptTool | null) => void;
  onSize: (value: number) => void;
  onStrength: (value: number) => void;
  onSelection: (action: SculptSelectionAction) => void;
  onRemeshMode: (mode: RemeshMode) => void;
  onDetail: (value: number) => void;
  onAmount: (value: number) => void;
  onRemesh: () => void;
  onClose: () => void;
}) {
  useLanguage();
  const title = t("sculpt.title");
  return (
    <MovableToolPanel className="edge-modifier-panel mesh-sculpt-panel" ariaLabel={title}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{targetName}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="meshSculpt" />
          <button type="button" aria-label={t("sculpt.done")} onClick={onClose}><X size={20} /></button>
        </div>
      </div>
      <p className="edge-modifier-selection-help">{t("sculpt.help")}</p>
      <div className="dental-trim-mode dental-area-tools sculpt-tools" role="radiogroup" aria-label={t("sculpt.brushes")}>
        {SCULPT_TOOLS.map((value) => (
          <button key={value} type="button" role="radio" aria-checked={tool === value} className={tool === value ? "active" : ""} disabled={busy} onClick={() => onTool(tool === value ? null : value)}>
            {t(`sculpt.tool.${value}`)}
          </button>
        ))}
      </div>
      <EdgeModifierSlider label={t("sculpt.size")} value={size} min={4} max={150} step={1} workspace={workspace} disabled={busy} onChange={onSize} />
      {tool !== "select" && tool !== "unselect" ? (
        <EdgeModifierSlider label={t("sculpt.strength")} value={Math.round(strength * 100)} min={5} max={100} step={5} unit="%" workspace={workspace} disabled={busy} onChange={(value) => onStrength(value / 100)} />
      ) : null}
      <p className="blend-hint" role="status">{chosen ? t("sculpt.chosen", { count: chosen.toLocaleString() }) : t("sculpt.noneChosen")}</p>
      <div className="dental-trim-buttons sculpt-selection" role="group" aria-label={t("sculpt.selection")}>
        {(["delete", "smooth", "flatten", "grow", "invert", "clear"] as const).map((action) => (
          <button key={action} type="button" disabled={busy || (!chosen && action !== "invert")} onClick={() => onSelection(action)}>
            {t(`sculpt.selection.${action}`)}
          </button>
        ))}
      </div>
      {/* Build 69: Remesh, Offset and Thicken stay out of the panel until they keep a scan's detail
          (on a voxel grid the teeth come out lumpy); the code and tests are kept for that. */}
      {WHOLE_PART_TOOLS ? (<>
      <div className="dental-section-divider" />
      <strong className="sculpt-subtitle">{t("sculpt.wholePart")}</strong>
      <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("sculpt.wholePart")}>
        <div className="shell-opening-options">
          {(["remesh", "offset", "thicken"] as const).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={remeshMode === value} className={remeshMode === value ? "active" : ""} disabled={busy} onClick={() => onRemeshMode(value)}>
              {t(`sculpt.mode.${value}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="blend-hint">{t(`sculpt.mode.${remeshMode}Hint`)}</p>
      <EdgeModifierSlider label={t("sculpt.detail")} value={detail} min={0.05} max={5} step={0.05} workspace={workspace} length disabled={busy} onChange={onDetail} />
      {remeshMode !== "remesh" ? (
        <EdgeModifierSlider
          label={t(remeshMode === "offset" ? "sculpt.distance" : "sculpt.thickness")}
          value={amount}
          min={remeshMode === "offset" ? -10 : 0.2}
          max={10}
          step={0.1}
          workspace={workspace}
          length
          disabled={busy}
          onChange={onAmount}
        />
      ) : null}
      </>) : null}
      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : null}
      <div className="edge-modifier-footer">
        {WHOLE_PART_TOOLS ? (<>
        <button type="button" className="secondary" disabled={busy} onClick={onClose}>{t("sculpt.done")}</button>
        <button type="button" className="primary" disabled={busy} onClick={onRemesh}>
          {busy ? <LoaderCircle className="edge-modifier-spinner" size={17} /> : <Check size={17} />}
          {busy ? t("sculpt.working") : t(`sculpt.apply.${remeshMode}`)}
        </button>
        </>) : (
        <button type="button" className="primary" disabled={busy} onClick={onClose}><Check size={17} /> {t("sculpt.done")}</button>
        )}
      </div>
      </>)}
    </MovableToolPanel>
  );
}
