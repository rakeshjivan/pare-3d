"use client";

import { Check, LoaderCircle, Redo2, Undo2, X } from "lucide-react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { SelectReach } from "@/lib/meshSculpt";
import type { LiveBrush } from "@/lib/liveSculpt";
import type { RemeshMode } from "@/lib/meshRemesh";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

export type SculptTool = "select" | "unselect" | LiveBrush;
/** Build 73: how finely the triangles under a brush are remade as it goes (Meshmixer's Refine). */
export type SculptRefine = "off" | "coarse" | "medium" | "fine";
/** Build 73: a brush also works mirrored across the part's middle, left-right (x) or front-back (z). */
export type SculptSymmetry = "off" | "x" | "z";
export type SculptSelectionAction = "fill" | "delete" | "smooth" | "flatten" | "grow" | "invert" | "clear";

/** Remesh, Offset and Thicken in the panel: on again in build 73 (they keep the part's surface now). */
export const WHOLE_PART_TOOLS = true;

export const SCULPT_TOOLS: SculptTool[] = ["draw", "inflate", "deflate", "smooth", "flatten", "pinch", "crease", "move", "select", "unselect"];
/** Build 75: Trim (Dental Studio's step 2a) - only selecting and deleting. */
export const TRIM_TOOLS: SculptTool[] = ["select", "unselect"];
/** Build 76: Erase & Fill (fill) sits beside Delete in Trim and Sculpt. */
const TRIM_ACTIONS = ["delete", "fill", "grow", "invert", "clear"] as const;
const SCULPT_ACTIONS = ["fill", "delete", "smooth", "flatten", "grow", "invert", "clear"] as const;

/** Build 69: Sculpt - brushes that shape a mesh, a brush that selects a patch of it, and the whole part rebuilt. */
export function MeshSculptPanel({
  targetName,
  tool,
  size,
  strength,
  reach,
  chosen,
  refine,
  symmetry,
  remeshMode,
  detail,
  amount,
  busy,
  preparing = false,
  trim = false,
  teethWarning = 0,
  warnedAction = "delete",
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  error,
  workspace,
  onTool,
  onSize,
  onStrength,
  onReach,
  onRefine,
  onSymmetry,
  onSelection,
  onRemeshMode,
  onDetail,
  onAmount,
  onRemesh,
  onClose,
  besideDental = false,
}: {
  targetName: string;
  tool: SculptTool | null;
  size: number;
  strength: number;
  reach: SelectReach;
  chosen: number;
  refine: SculptRefine;
  symmetry: SculptSymmetry;
  remeshMode: RemeshMode;
  detail: number;
  amount: number;
  busy: boolean;
  /** Build 75: the live copy of the mesh is still being made. */
  preparing?: boolean;
  /** Build 75: Trim - the selection brushes and Delete only, for cutting away what is not wanted. */
  trim?: boolean;
  /** Build 75: the chosen triangles hold this many of the teeth - Delete again cuts them anyway. */
  teethWarning?: number;
  /** Build 76: which button the teeth warning is about (Delete or Erase & Fill). */
  warnedAction?: SculptSelectionAction;
  /** Build 76: Undo and Redo in the panel - strokes, deletes and fills made since it opened. */
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  error: string | null;
  workspace: WorkplaneWorkspaceSettings;
  onTool: (tool: SculptTool | null) => void;
  onSize: (value: number) => void;
  onStrength: (value: number) => void;
  onReach: (reach: SelectReach) => void;
  onRefine: (refine: SculptRefine) => void;
  onSymmetry: (symmetry: SculptSymmetry) => void;
  onSelection: (action: SculptSelectionAction) => void;
  onRemeshMode: (mode: RemeshMode) => void;
  onDetail: (value: number) => void;
  onAmount: (value: number) => void;
  onRemesh: () => void;
  onClose: () => void;
  /** Build 71: opened from Dental Studio - stands beside its panel instead of over it. */
  besideDental?: boolean;
}) {
  useLanguage();
  const title = t(trim ? "sculpt.trimTitle" : "sculpt.title");
  return (
    <MovableToolPanel className={`edge-modifier-panel mesh-sculpt-panel${besideDental ? " beside-dental" : ""}`} ariaLabel={title}>
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
      {preparing ? (
        <p className="edge-modifier-selection-help sculpt-preparing" role="status"><LoaderCircle className="edge-modifier-spinner" size={16} aria-hidden="true" /> {t("sculpt.preparing")}</p>
      ) : (
        <p className="edge-modifier-selection-help">{t(trim ? "sculpt.trimHelp" : "sculpt.help")}</p>
      )}
      <div className="dental-trim-mode dental-area-tools sculpt-tools" role="radiogroup" aria-label={t("sculpt.brushes")}>
        {(trim ? TRIM_TOOLS : SCULPT_TOOLS).map((value) => (
          <button key={value} type="button" role="radio" aria-checked={tool === value} className={tool === value ? "active" : ""} disabled={busy} onClick={() => onTool(tool === value ? null : value)}>
            {t(`sculpt.tool.${value}`)}
          </button>
        ))}
      </div>
      <EdgeModifierSlider label={t("sculpt.size")} value={size} min={4} max={150} step={1} workspace={workspace} disabled={busy} onChange={onSize} />
      {tool !== "select" && tool !== "unselect" ? (
        <EdgeModifierSlider label={t("sculpt.strength")} value={Math.round(strength * 100)} min={5} max={100} step={5} unit="%" workspace={workspace} disabled={busy} onChange={(value) => onStrength(value / 100)} />
      ) : null}
      {tool !== "select" && tool !== "unselect" ? (<>
        <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("sculpt.refine")}>
          <span className="sculpt-reach-label">{t("sculpt.refine")}</span>
          <div className="shell-opening-options four">
            {(["off", "coarse", "medium", "fine"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={refine === value} className={refine === value ? "active" : ""} disabled={busy} onClick={() => onRefine(value)}>
                {t(`sculpt.refine.${value}`)}
              </button>
            ))}
          </div>
          <p className="blend-hint">{t(refine === "off" ? "sculpt.refine.offHint" : "sculpt.refine.onHint")}</p>
        </div>
        <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("sculpt.symmetry")}>
          <span className="sculpt-reach-label">{t("sculpt.symmetry")}</span>
          <div className="shell-opening-options">
            {(["off", "x", "z"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={symmetry === value} className={symmetry === value ? "active" : ""} disabled={busy} onClick={() => onSymmetry(value)}>
                {t(`sculpt.symmetry.${value}`)}
              </button>
            ))}
          </div>
        </div>
      </>) : null}
      {tool === "select" || tool === "unselect" ? (
        <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("sculpt.reach")}>
          <span className="sculpt-reach-label">{t("sculpt.reach")}</span>
          <div className="shell-opening-options">
            {(["front", "back", "through"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={reach === value} className={reach === value ? "active" : ""} disabled={busy} title={t(`sculpt.reach.${value}Hint`)} onClick={() => onReach(value)}>
                {t(`sculpt.reach.${value}`)}
              </button>
            ))}
          </div>
          <p className="blend-hint">{t(`sculpt.reach.${reach}Hint`)}</p>
        </div>
      ) : null}
      <p className="blend-hint" role="status">{chosen ? t("sculpt.chosen", { count: chosen.toLocaleString() }) : t("sculpt.noneChosen")}</p>
      {teethWarning > 0 ? <p className="dental-status warn sculpt-teeth-warning" role="status" aria-live="assertive">{t("sculpt.trimTeeth", { count: teethWarning.toLocaleString() })}</p> : null}
      <div className="dental-trim-buttons sculpt-selection" role="group" aria-label={t("sculpt.selection")}>
        {(trim ? TRIM_ACTIONS : SCULPT_ACTIONS).map((action) => (
          <button key={action} type="button" className={trim && (action === "delete" || action === "fill") ? "danger" : undefined} title={action === "fill" ? t("sculpt.selection.fillHint") : undefined} disabled={busy || (!chosen && action !== "invert")} onClick={() => onSelection(action)}>
            {teethWarning > 0 && action === warnedAction ? t(action === "fill" ? "sculpt.fillAnyway" : "sculpt.deleteAnyway") : t(`sculpt.selection.${action}`)}
          </button>
        ))}
      </div>
      {/* Build 69: Remesh, Offset and Thicken stay out of the panel until they keep a scan's detail
          (on a voxel grid the teeth come out lumpy); the code and tests are kept for that. */}
      {onUndo || onRedo ? (
        <div className="dental-trim-buttons sculpt-history" role="group" aria-label={t("sculpt.history")}>
          <button type="button" disabled={busy || !canUndo} title={t("sculpt.undoHint")} onClick={onUndo}><Undo2 size={16} aria-hidden="true" /> {t("sculpt.undo")}</button>
          <button type="button" disabled={busy || !canRedo} title={t("sculpt.redoHint")} onClick={onRedo}><Redo2 size={16} aria-hidden="true" /> {t("sculpt.redo")}</button>
        </div>
      ) : null}
      {trim ? <p className="blend-hint">{t("sculpt.trimUndo")}</p> : null}
      {WHOLE_PART_TOOLS && !trim ? (<>
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
        {WHOLE_PART_TOOLS && !trim ? (<>
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
