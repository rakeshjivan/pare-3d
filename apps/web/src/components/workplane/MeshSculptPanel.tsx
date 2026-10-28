"use client";

import { Check, LoaderCircle, Redo2, Undo2, X, Gauge, ListChecks } from "lucide-react";
import { useState } from "react";
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
export type SculptSelectionAction = "fill" | "delete" | "smooth" | "flatten" | "grow" | "shrink" | "smoothEdge" | "connected" | "invertConnected" | "tidy" | "invert" | "clear" | "extrude" | "offset" | "bridge" | "align" | "remeshPart" | "reducePart";

/** Build 92: a soft transform's settings - a move (mm, and out along the selection's facing), turns (degrees), a scale (%) and the soft edge (mm). */
export type SoftTransform = { x: number; y: number; z: number; out: number; tilt: number; turn: number; roll: number; scale: number; soft: number };
const SOFT_MOVES = [["x", "sculpt.soft.x"], ["y", "sculpt.soft.y"], ["z", "sculpt.soft.z"], ["out", "sculpt.soft.out"]] as const;
const SOFT_TURNS = [["tilt", "sculpt.soft.tilt"], ["turn", "sculpt.soft.turn"], ["roll", "sculpt.soft.roll"]] as const;

/** Build 92: the brushes' options, as Meshmixer's brush properties. */
export type SculptBrushOptions = { falloff: "smooth" | "sharp" | "flat"; lazy: number; hold: boolean; depth: number };

/** Build 90: Freeze (Meshmixer's mask) - from the selection, turned the other way round, or cleared. */
export type SculptFreezeAction = "selection" | "invert" | "clear";
const FREEZE_ACTIONS: SculptFreezeAction[] = ["selection", "invert", "clear"];

/** Remesh, Offset and Thicken in the panel: on again in build 73 (they keep the part's surface now). */
export const WHOLE_PART_TOOLS = true;

// Build 89: Meshmixer's brushes, in its order where it has them.
export const SCULPT_TOOLS: SculptTool[] = ["drag", "draw", "draw2", "attract", "flatten", "inflate", "deflate", "pinch", "move", "crease", "smooth", "shrinkSmooth", "bubbleSmooth", "mask", "select", "unselect"];
/** Build 75: Trim (Dental Studio's step 2a) - only selecting and deleting. */
export const TRIM_TOOLS: SculptTool[] = ["select", "unselect"];
/** Build 76: Erase & Fill (fill) sits beside Delete in Trim and Sculpt. */
const TRIM_ACTIONS = ["delete", "fill", "grow", "connected", "invert", "clear"] as const;
/** Build 83: Connected and Tidy edge (Meshmixer's Expand to Connected and Optimize Boundary). */
const SCULPT_ACTIONS = ["fill", "delete", "smooth", "flatten", "grow", "shrink", "smoothEdge", "tidy", "connected", "invert", "clear"] as const;
/**
 * Build 94: dental presets - a brush with settings tuned for one job, so the right tool is one click.
 * Size in pixels, strength 0-1.
 */
export const SCULPT_PRESETS = [
  { id: "margin", tool: "smooth", size: 18, strength: 0.35, falloff: "smooth" },
  { id: "bubble", tool: "bubbleSmooth", size: 14, strength: 0.8, falloff: "smooth" },
  { id: "contact", tool: "inflate", size: 12, strength: 0.25, falloff: "smooth" },
  { id: "occlusal", tool: "flatten", size: 40, strength: 0.45, falloff: "flat" },
  { id: "undercut", tool: "deflate", size: 20, strength: 0.35, falloff: "smooth" },
  { id: "groove", tool: "crease", size: 10, strength: 0.3, falloff: "sharp" },
] as const;
export type SculptPreset = (typeof SCULPT_PRESETS)[number];
/** Build 94: the selection's actions in the Select tab, Delete first. */
const SCULPT_ACTIONS_ORDERED = ["delete", "fill", "smooth", "flatten", "grow", "shrink", "smoothEdge", "tidy", "connected", "invert", "clear"] as const;
/** Build 81: Meshmixer's Edit tools on the selection. */
const EDIT_ACTIONS = ["extrude", "offset", "bridge", "align", "remeshPart", "reducePart"] as const;

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
  onSpeed,
  speedShown = false,
  besideDental = false,
  editAmount = 1,
  onEditAmount,
  selectShape = "brush",
  onSelectShape,
  frozen = 0,
  onFreeze,
  soft = null,
  deviation = null,
  onDeviation,
  groupsShown = false,
  groupAngle = 30,
  groupCount = 0,
  onGroups,
  brushOptions,
  onBrushOptions,
  onSoftStart,
  onSoft,
  onSoftEnd,
  onPreset,
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
  /** Build 85: shows or hides the speed readout (the ` key too). */
  onSpeed?: () => void;
  speedShown?: boolean;
  /** Build 71: opened from Dental Studio - stands beside its panel instead of over it. */
  besideDental?: boolean;
  /** Build 82: the Select tool paints (brush) or draws a loop (lasso). */
  selectShape?: "brush" | "lasso" | "group";
  onSelectShape?: (shape: "brush" | "lasso" | "group") => void;
  /** Build 92: the deviation map - its figures while shown (mm added and taken away), and the switch. */
  deviation?: { added: number; removed: number } | null;
  onDeviation?: (show: boolean) => void;
  /** Build 92: face groups - shown or not, the angle that splits them, how many there are, and the button. */
  groupsShown?: boolean;
  groupAngle?: number;
  groupCount?: number;
  onGroups?: (show: boolean, angle?: number) => void;
  /** Build 81: Extrude and Offset's distance, mm. */
  editAmount?: number;
  onEditAmount?: (value: number) => void;
  /** Build 90: corners frozen, and Freeze from selection / Invert / Clear. */
  frozen?: number;
  onFreeze?: (action: SculptFreezeAction) => void;
  /** Build 92: Soft Transform of the selection - open while `soft` is set. */
  soft?: SoftTransform | null;
  brushOptions?: SculptBrushOptions;
  onBrushOptions?: (value: SculptBrushOptions) => void;
  onSoftStart?: () => void;
  onSoft?: (value: SoftTransform) => void;
  onSoftEnd?: (keep: boolean) => void;
  /** Build 94: a dental preset picked. */
  onPreset?: (preset: SculptPreset) => void;
}) {
  useLanguage();
  // Build 92: a list of every tool and button with a line on what it does, opened from the header.
  const [helpOpen, setHelpOpen] = useState(false);
  const title = t(trim ? "sculpt.trimTitle" : "sculpt.title");
  // Build 94: the tab in view - Select while a select tool is in hand.
  const [tabChosen, setTab] = useState<"brush" | "select" | "part">(tool === "select" || tool === "unselect" ? "select" : "brush");
  const tab = tool === "select" || tool === "unselect" ? "select" : tabChosen === "select" ? "brush" : tabChosen;
  const [lastBrush, setLastBrush] = useState<SculptTool>("draw");
  if (tool && tool !== "select" && tool !== "unselect" && tool !== lastBrush) setLastBrush(tool);
  const chooseTab = (value: "brush" | "select" | "part") => {
    setTab(value);
    if (value === "select") onTool(tool === "unselect" ? "unselect" : "select");
    else if (value === "brush") onTool(lastBrush);
    else onTool(null);
  };

  // Build 94: the panel's pieces, shared by its tabs (and the Trim panel's single page).
  const SIZE_SLIDER = <EdgeModifierSlider label={t("sculpt.size")} title={t("sculpt.tip.size")} value={size} min={4} max={150} step={1} workspace={workspace} disabled={busy} onChange={onSize} />;
  const BRUSH_OPTIONS = tool && tool !== "select" && tool !== "unselect" && brushOptions && onBrushOptions ? (
        <details className="sculpt-brush-options">
          <summary>{t("sculpt.options.title")}</summary>
          <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("sculpt.options.falloff")}>
            <span className="sculpt-reach-label">{t("sculpt.options.falloff")}</span>
            <div className="shell-opening-options">
              {(["smooth", "sharp", "flat"] as const).map((value) => (
                <button key={value} type="button" role="radio" aria-checked={brushOptions.falloff === value} className={brushOptions.falloff === value ? "active" : ""} disabled={busy} title={t(`sculpt.options.falloff.${value}Hint`)} onClick={() => onBrushOptions({ ...brushOptions, falloff: value })}>
                  {t(`sculpt.options.falloff.${value}`)}
                </button>
              ))}
            </div>
          </div>
          <EdgeModifierSlider label={t("sculpt.options.lazy")} title={t("sculpt.tip.lazy")} value={brushOptions.lazy} min={0} max={60} step={1} unit="px" workspace={workspace} disabled={busy} onChange={(value) => onBrushOptions({ ...brushOptions, lazy: value })} />
          {tool === "flatten" ? <EdgeModifierSlider label={t("sculpt.options.depth")} value={brushOptions.depth} min={-2} max={2} step={0.05} workspace={workspace} length disabled={busy} onChange={(value) => onBrushOptions({ ...brushOptions, depth: value })} /> : null}
          <label className="edge-modifier-check" title={t("sculpt.options.holdHint")}>
            <input type="checkbox" checked={brushOptions.hold} disabled={busy} onChange={(event) => onBrushOptions({ ...brushOptions, hold: event.currentTarget.checked })} />
            <span>{t("sculpt.options.hold")}</span>
          </label>
        </details>
  ) : null;
  const REFINE_AND_SYMMETRY = (<>
        <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("sculpt.refine")}>
          <span className="sculpt-reach-label" title={t("sculpt.tip.refine")}>{t("sculpt.refine")}</span>
          <div className="shell-opening-options four">
            {(["off", "coarse", "medium", "fine"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={refine === value} className={refine === value ? "active" : ""} disabled={busy} title={t("sculpt.tip.refine")} onClick={() => onRefine(value)}>
                {t(`sculpt.refine.${value}`)}
              </button>
            ))}
          </div>
          <p className="blend-hint">{t(refine === "off" ? "sculpt.refine.offHint" : "sculpt.refine.onHint")}</p>
        </div>
        <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("sculpt.symmetry")}>
          <span className="sculpt-reach-label" title={t("sculpt.tip.symmetry")}>{t("sculpt.symmetry")}</span>
          <div className="shell-opening-options">
            {(["off", "x", "z"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={symmetry === value} className={symmetry === value ? "active" : ""} disabled={busy} title={t("sculpt.tip.symmetry")} onClick={() => onSymmetry(value)}>
                {t(`sculpt.symmetry.${value}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("sculpt.symmetry")}>
          <span className="sculpt-reach-label" title={t("sculpt.tip.symmetry")}>{t("sculpt.symmetry")}</span>
          <div className="shell-opening-options">
            {(["off", "x", "z"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={symmetry === value} className={symmetry === value ? "active" : ""} disabled={busy} title={t("sculpt.tip.symmetry")} onClick={() => onSymmetry(value)}>
                {t(`sculpt.symmetry.${value}`)}
              </button>
            ))}
          </div>
        </div>
  </>);
  const FREEZE = !trim && onFreeze ? (<>
        <p className="blend-hint" role="status">{frozen ? t("sculpt.freeze.count", { count: frozen.toLocaleString() }) : t("sculpt.freeze.none")}</p>
        <div className="dental-trim-buttons sculpt-selection sculpt-freeze" role="group" aria-label={t("sculpt.freeze.title")}>
          {FREEZE_ACTIONS.map((action) => (
            <button key={action} type="button" title={t(`sculpt.freeze.${action}Hint`)} disabled={busy || (action === "selection" ? !chosen : action === "clear" ? !frozen : false)} onClick={() => onFreeze(action)}>
              {t(`sculpt.freeze.${action}`)}
            </button>
          ))}
        </div>
</>) : null;
  const DEVIATION = !trim && onDeviation ? (
        <div className="sculpt-deviation">
          <label className="edge-modifier-check" title={t("sculpt.deviation.hint")}>
            <input type="checkbox" checked={Boolean(deviation)} disabled={busy} onChange={(event) => onDeviation(event.currentTarget.checked)} />
            <span>{t("sculpt.deviation.show")}</span>
          </label>
          {deviation ? <p className="blend-hint" role="status">{t("sculpt.deviation.figures", { added: deviation.added.toFixed(2), removed: deviation.removed.toFixed(2) })}</p> : null}
        </div>
     
  ) : null;
  const GROUPS = !trim && onGroups ? (
        <div className="sculpt-groups">
          <label className="edge-modifier-check" title={t("sculpt.groups.hint")}>
            <input type="checkbox" checked={groupsShown} disabled={busy} onChange={(event) => onGroups(event.currentTarget.checked)} />
            <span>{groupsShown && groupCount ? t("sculpt.groups.shownCount", { count: groupCount.toLocaleString() }) : t("sculpt.groups.show")}</span>
          </label>
          {groupsShown ? <EdgeModifierSlider label={t("sculpt.groups.angle")} value={groupAngle} min={5} max={60} step={1} unit="°" workspace={workspace} disabled={busy} onChange={(value) => onGroups(true, value)} /> : null}
        </div>
     
  ) : null;
  const SELECT_SHAPE = (
        <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("sculpt.selectShape")}>
          <div className="shell-opening-options">
            {(["brush", "lasso", "group"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={selectShape === value} className={selectShape === value ? "active" : ""} disabled={busy} title={t(`sculpt.tip.selectShape.${value}` as "sculpt.tip.selectShape.brush")} onClick={() => onSelectShape?.(value)}>
                {t(`sculpt.selectShape.${value}`)}
              </button>
            ))}
          </div>
          {selectShape === "lasso" ? <p className="blend-hint">{t("sculpt.lassoHelp")}</p> : null}
          {selectShape === "group" ? <p className="blend-hint">{t("sculpt.groupHelp")}</p> : null}
        </div>
  );
  const REACH = (
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
          <p className="blend-hint sculpt-keys">{t("sculpt.selectKeys")}</p>
        </div>
  );
  const EDIT_BLOCK = (<>
        <EdgeModifierSlider label={t("sculpt.editDistance")} title={t("sculpt.tip.distance")} value={editAmount} min={-10} max={10} step={0.1} workspace={workspace} length disabled={busy} onChange={(value) => onEditAmount?.(value)} />
        {soft && onSoft ? (
          // Build 92: Soft Transform - the selection moved, turned and scaled, the surface round it following.
          <div className="sculpt-soft" role="group" aria-label={t("sculpt.soft.title")}>
            <strong className="sculpt-subtitle">{t("sculpt.soft.title")}</strong>
            <p className="blend-hint">{t("sculpt.soft.hint")}</p>
            <EdgeModifierSlider label={t("sculpt.soft.edge")} value={soft.soft} min={0} max={15} step={0.25} workspace={workspace} length disabled={busy} onChange={(value) => onSoft({ ...soft, soft: value })} />
            {SOFT_MOVES.map(([key, label]) => (
              <EdgeModifierSlider key={key} label={t(label)} value={soft[key]} min={-5} max={5} step={0.05} workspace={workspace} length disabled={busy} onChange={(value) => onSoft({ ...soft, [key]: value })} />
            ))}
            {SOFT_TURNS.map(([key, label]) => (
              <EdgeModifierSlider key={key} label={t(label)} value={soft[key]} min={-45} max={45} step={0.5} unit="°" workspace={workspace} disabled={busy} onChange={(value) => onSoft({ ...soft, [key]: value })} />
            ))}
            <EdgeModifierSlider label={t("sculpt.soft.scale")} value={soft.scale} min={50} max={150} step={0.5} unit="%" workspace={workspace} disabled={busy} onChange={(value) => onSoft({ ...soft, scale: value })} />
            <div className="dental-trim-buttons">
              <button type="button" disabled={busy} onClick={() => onSoftEnd?.(false)}>{t("sculpt.soft.cancel")}</button>
              <button type="button" className="active" disabled={busy} onClick={() => onSoftEnd?.(true)}>{t("sculpt.soft.apply")}</button>
            </div>
          </div>
        ) : null}
        <div className="dental-trim-buttons sculpt-selection" role="group" aria-label={t("sculpt.edit")}>
          {onSoftStart && !soft ? <button type="button" title={t("sculpt.soft.startHint")} disabled={busy || !chosen} onClick={onSoftStart}>{t("sculpt.soft.start")}</button> : null}
          {EDIT_ACTIONS.map((action) => (
            <button key={action} type="button" title={t(`sculpt.selection.${action}Hint`)} disabled={busy || !chosen || ((action === "extrude" || action === "offset") && !editAmount)} onClick={() => onSelection(action)}>
              {t(`sculpt.selection.${action}`)}
            </button>
          ))}
        </div>

  </>);
  const WHOLE_PART = (<>
      <div className="dental-section-divider" />
      <strong className="sculpt-subtitle">{t("sculpt.wholePart")}</strong>
      <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("sculpt.wholePart")}>
        <div className="shell-opening-options">
          {(["remesh", "offset", "thicken", "solid"] as const).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={remeshMode === value} className={remeshMode === value ? "active" : ""} disabled={busy} title={t(`sculpt.mode.${value}Hint`)} onClick={() => onRemeshMode(value)}>
              {t(`sculpt.mode.${value}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="blend-hint">{t(`sculpt.mode.${remeshMode}Hint`)}</p>
      <EdgeModifierSlider label={t("sculpt.detail")} title={t("sculpt.tip.detail")} value={detail} min={0.05} max={5} step={0.05} workspace={workspace} length disabled={busy} onChange={onDetail} />
      {remeshMode === "offset" || remeshMode === "thicken" ? (
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
  </>);
  const TRIM_BODY = (<>
      {preparing ? (
        <p className="edge-modifier-selection-help sculpt-preparing" role="status"><LoaderCircle className="edge-modifier-spinner" size={16} aria-hidden="true" /> {t("sculpt.preparing")}</p>
      ) : (
        <p className="edge-modifier-selection-help">{t(trim ? "sculpt.trimHelp" : "sculpt.help")}</p>
      )}
      <div className="dental-trim-mode dental-area-tools sculpt-tools" role="radiogroup" aria-label={t("sculpt.brushes")}>
        {(trim ? TRIM_TOOLS : SCULPT_TOOLS).map((value) => (
          <button key={value} type="button" role="radio" aria-checked={tool === value} className={tool === value ? "active" : ""} disabled={busy} title={t(`sculpt.tip.${value}` as "sculpt.tip.draw")} onClick={() => onTool(tool === value ? null : value)}>
            {t(`sculpt.tool.${value}`)}
          </button>
        ))}
      </div>
      {tool === "select" || tool === "unselect" ? (
        <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("sculpt.selectShape")}>
          <div className="shell-opening-options">
            {(["brush", "lasso", "group"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={selectShape === value} className={selectShape === value ? "active" : ""} disabled={busy} title={t(`sculpt.tip.selectShape.${value}` as "sculpt.tip.selectShape.brush")} onClick={() => onSelectShape?.(value)}>
                {t(`sculpt.selectShape.${value}`)}
              </button>
            ))}
          </div>
          {selectShape === "lasso" ? <p className="blend-hint">{t("sculpt.lassoHelp")}</p> : null}
          {selectShape === "group" ? <p className="blend-hint">{t("sculpt.groupHelp")}</p> : null}
        </div>
      ) : null}
      {(tool === "select" || tool === "unselect") && selectShape === "lasso" ? null : <EdgeModifierSlider label={t("sculpt.size")} title={t("sculpt.tip.size")} value={size} min={4} max={150} step={1} workspace={workspace} disabled={busy} onChange={onSize} />}
      {tool !== "select" && tool !== "unselect" ? (
        <EdgeModifierSlider label={t("sculpt.strength")} title={t("sculpt.tip.strength")} value={Math.round(strength * 100)} min={1} max={100} step={1} workspace={workspace} disabled={busy} onChange={(value) => onStrength(value / 100)} />
      ) : null}
      {tool && tool !== "select" && tool !== "unselect" ? <p className="blend-hint sculpt-keys">{t(tool === "mask" ? "sculpt.freeze.keys" : "sculpt.keysHint")}</p> : null}
      {tool && tool !== "select" && tool !== "unselect" && brushOptions && onBrushOptions ? (
        // Build 92: Meshmixer's brush properties - falloff, lazy mouse, hold boundary, Flatten's depth.
        <details className="sculpt-brush-options">
          <summary>{t("sculpt.options.title")}</summary>
          <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("sculpt.options.falloff")}>
            <span className="sculpt-reach-label">{t("sculpt.options.falloff")}</span>
            <div className="shell-opening-options">
              {(["smooth", "sharp", "flat"] as const).map((value) => (
                <button key={value} type="button" role="radio" aria-checked={brushOptions.falloff === value} className={brushOptions.falloff === value ? "active" : ""} disabled={busy} title={t(`sculpt.options.falloff.${value}Hint`)} onClick={() => onBrushOptions({ ...brushOptions, falloff: value })}>
                  {t(`sculpt.options.falloff.${value}`)}
                </button>
              ))}
            </div>
          </div>
          <EdgeModifierSlider label={t("sculpt.options.lazy")} title={t("sculpt.tip.lazy")} value={brushOptions.lazy} min={0} max={60} step={1} unit="px" workspace={workspace} disabled={busy} onChange={(value) => onBrushOptions({ ...brushOptions, lazy: value })} />
          {tool === "flatten" ? <EdgeModifierSlider label={t("sculpt.options.depth")} value={brushOptions.depth} min={-2} max={2} step={0.05} workspace={workspace} length disabled={busy} onChange={(value) => onBrushOptions({ ...brushOptions, depth: value })} /> : null}
          <label className="edge-modifier-check" title={t("sculpt.options.holdHint")}>
            <input type="checkbox" checked={brushOptions.hold} disabled={busy} onChange={(event) => onBrushOptions({ ...brushOptions, hold: event.currentTarget.checked })} />
            <span>{t("sculpt.options.hold")}</span>
          </label>
        </details>
      ) : null}
      {!trim && onFreeze ? (<>
        <p className="blend-hint" role="status">{frozen ? t("sculpt.freeze.count", { count: frozen.toLocaleString() }) : t("sculpt.freeze.none")}</p>
        <div className="dental-trim-buttons sculpt-selection sculpt-freeze" role="group" aria-label={t("sculpt.freeze.title")}>
          {FREEZE_ACTIONS.map((action) => (
            <button key={action} type="button" title={t(`sculpt.freeze.${action}Hint`)} disabled={busy || (action === "selection" ? !chosen : action === "clear" ? !frozen : false)} onClick={() => onFreeze(action)}>
              {t(`sculpt.freeze.${action}`)}
            </button>
          ))}
        </div>
      </>) : null}
      {tool !== "select" && tool !== "unselect" && tool !== "mask" ? (<>
        <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("sculpt.refine")}>
          <span className="sculpt-reach-label" title={t("sculpt.tip.refine")}>{t("sculpt.refine")}</span>
          <div className="shell-opening-options four">
            {(["off", "coarse", "medium", "fine"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={refine === value} className={refine === value ? "active" : ""} disabled={busy} title={t("sculpt.tip.refine")} onClick={() => onRefine(value)}>
                {t(`sculpt.refine.${value}`)}
              </button>
            ))}
          </div>
          <p className="blend-hint">{t(refine === "off" ? "sculpt.refine.offHint" : "sculpt.refine.onHint")}</p>
        </div>
        <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("sculpt.symmetry")}>
          <span className="sculpt-reach-label" title={t("sculpt.tip.symmetry")}>{t("sculpt.symmetry")}</span>
          <div className="shell-opening-options">
            {(["off", "x", "z"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={symmetry === value} className={symmetry === value ? "active" : ""} disabled={busy} title={t("sculpt.tip.symmetry")} onClick={() => onSymmetry(value)}>
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
          <p className="blend-hint sculpt-keys">{t("sculpt.selectKeys")}</p>
        </div>
      ) : null}
      <p className="blend-hint" role="status">{chosen ? t("sculpt.chosen", { count: chosen.toLocaleString() }) : t("sculpt.noneChosen")}</p>
      {!trim && onDeviation ? (
        // Build 92: Meshmixer's Analysis > Deviation, against the part as Sculpt took it.
        <div className="sculpt-deviation">
          <label className="edge-modifier-check" title={t("sculpt.deviation.hint")}>
            <input type="checkbox" checked={Boolean(deviation)} disabled={busy} onChange={(event) => onDeviation(event.currentTarget.checked)} />
            <span>{t("sculpt.deviation.show")}</span>
          </label>
          {deviation ? <p className="blend-hint" role="status">{t("sculpt.deviation.figures", { added: deviation.added.toFixed(2), removed: deviation.removed.toFixed(2) })}</p> : null}
        </div>
      ) : null}
      {!trim && onGroups ? (
        // Build 92: Meshmixer's Generate Face Groups - shown in colour; Select > Group picks one with a click.
        <div className="sculpt-groups">
          <label className="edge-modifier-check" title={t("sculpt.groups.hint")}>
            <input type="checkbox" checked={groupsShown} disabled={busy} onChange={(event) => onGroups(event.currentTarget.checked)} />
            <span>{groupsShown && groupCount ? t("sculpt.groups.shownCount", { count: groupCount.toLocaleString() }) : t("sculpt.groups.show")}</span>
          </label>
          {groupsShown ? <EdgeModifierSlider label={t("sculpt.groups.angle")} value={groupAngle} min={5} max={60} step={1} unit="°" workspace={workspace} disabled={busy} onChange={(value) => onGroups(true, value)} /> : null}
        </div>
      ) : null}
      {teethWarning > 0 ? <p className="dental-status warn sculpt-teeth-warning" role="status" aria-live="assertive">{t("sculpt.trimTeeth", { count: teethWarning.toLocaleString() })}</p> : null}
      <div className="dental-trim-buttons sculpt-selection" role="group" aria-label={t("sculpt.selection")}>
        {(trim ? TRIM_ACTIONS : SCULPT_ACTIONS).map((action) => (
          <button key={action} type="button" className={trim && (action === "delete" || action === "fill") ? "danger" : undefined} title={t(`sculpt.selection.${action}Hint` as "sculpt.selection.fillHint")} disabled={busy || (!chosen && action !== "invert")} onClick={() => onSelection(action)}>
            {teethWarning > 0 && action === warnedAction ? t(action === "fill" ? "sculpt.fillAnyway" : "sculpt.deleteAnyway") : t(`sculpt.selection.${action}`)}
          </button>
        ))}
      </div>
      {!trim ? (<>
        <strong className="sculpt-subtitle">{t("sculpt.edit")}</strong>
        <EdgeModifierSlider label={t("sculpt.editDistance")} title={t("sculpt.tip.distance")} value={editAmount} min={-10} max={10} step={0.1} workspace={workspace} length disabled={busy} onChange={(value) => onEditAmount?.(value)} />
        {soft && onSoft ? (
          // Build 92: Soft Transform - the selection moved, turned and scaled, the surface round it following.
          <div className="sculpt-soft" role="group" aria-label={t("sculpt.soft.title")}>
            <strong className="sculpt-subtitle">{t("sculpt.soft.title")}</strong>
            <p className="blend-hint">{t("sculpt.soft.hint")}</p>
            <EdgeModifierSlider label={t("sculpt.soft.edge")} value={soft.soft} min={0} max={15} step={0.25} workspace={workspace} length disabled={busy} onChange={(value) => onSoft({ ...soft, soft: value })} />
            {SOFT_MOVES.map(([key, label]) => (
              <EdgeModifierSlider key={key} label={t(label)} value={soft[key]} min={-5} max={5} step={0.05} workspace={workspace} length disabled={busy} onChange={(value) => onSoft({ ...soft, [key]: value })} />
            ))}
            {SOFT_TURNS.map(([key, label]) => (
              <EdgeModifierSlider key={key} label={t(label)} value={soft[key]} min={-45} max={45} step={0.5} unit="°" workspace={workspace} disabled={busy} onChange={(value) => onSoft({ ...soft, [key]: value })} />
            ))}
            <EdgeModifierSlider label={t("sculpt.soft.scale")} value={soft.scale} min={50} max={150} step={0.5} unit="%" workspace={workspace} disabled={busy} onChange={(value) => onSoft({ ...soft, scale: value })} />
            <div className="dental-trim-buttons">
              <button type="button" disabled={busy} onClick={() => onSoftEnd?.(false)}>{t("sculpt.soft.cancel")}</button>
              <button type="button" className="active" disabled={busy} onClick={() => onSoftEnd?.(true)}>{t("sculpt.soft.apply")}</button>
            </div>
          </div>
        ) : null}
        <div className="dental-trim-buttons sculpt-selection" role="group" aria-label={t("sculpt.edit")}>
          {onSoftStart && !soft ? <button type="button" title={t("sculpt.soft.startHint")} disabled={busy || !chosen} onClick={onSoftStart}>{t("sculpt.soft.start")}</button> : null}
          {EDIT_ACTIONS.map((action) => (
            <button key={action} type="button" title={t(`sculpt.selection.${action}Hint`)} disabled={busy || !chosen || ((action === "extrude" || action === "offset") && !editAmount)} onClick={() => onSelection(action)}>
              {t(`sculpt.selection.${action}`)}
            </button>
          ))}
        </div>
      </>) : null}
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
          {(["remesh", "offset", "thicken", "solid"] as const).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={remeshMode === value} className={remeshMode === value ? "active" : ""} disabled={busy} title={t(`sculpt.mode.${value}Hint`)} onClick={() => onRemeshMode(value)}>
              {t(`sculpt.mode.${value}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="blend-hint">{t(`sculpt.mode.${remeshMode}Hint`)}</p>
      <EdgeModifierSlider label={t("sculpt.detail")} title={t("sculpt.tip.detail")} value={detail} min={0.05} max={5} step={0.05} workspace={workspace} length disabled={busy} onChange={onDetail} />
      {remeshMode === "offset" || remeshMode === "thicken" ? (
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

  </>);
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
          <button type="button" className={helpOpen ? "active" : undefined} aria-pressed={helpOpen} aria-label={t("sculpt.help.toggle")} title={t("sculpt.help.toggle")} onClick={() => setHelpOpen((open) => !open)}><ListChecks size={18} /></button>
          {onSpeed ? <button type="button" className={speedShown ? "active" : undefined} aria-pressed={speedShown} aria-label={t("sculpt.speed.toggle")} title={t("sculpt.speed.toggle")} onClick={onSpeed}><Gauge size={18} /></button> : null}
          <button type="button" aria-label={t("sculpt.done")} onClick={onClose}><X size={20} /></button>
        </div>
      </div>
      {helpOpen ? (
        <div className="sculpt-help-list" role="region" aria-label={t("sculpt.help.toggle")}>
          {([
            ["sculpt.help.brushes", (trim ? [] : SCULPT_TOOLS.filter((v) => v !== "select" && v !== "unselect")).map((v) => [t(`sculpt.tool.${v}`), t(`sculpt.tip.${v}` as "sculpt.tip.draw")])],
            ["sculpt.help.select", [(["select", "unselect"] as const).map((v) => [t(`sculpt.tool.${v}`), t(`sculpt.tip.${v}` as "sculpt.tip.draw")]), (["brush", "lasso", "group"] as const).map((v) => [t(`sculpt.selectShape.${v}`), t(`sculpt.tip.selectShape.${v}`)]), (["front", "back", "through"] as const).map((v) => [t(`sculpt.reach.${v}`), t(`sculpt.reach.${v}Hint`)])].flat()],
            ["sculpt.help.selection", (trim ? TRIM_ACTIONS : SCULPT_ACTIONS).map((a) => [t(`sculpt.selection.${a}`), t(`sculpt.selection.${a}Hint` as "sculpt.selection.fillHint")])],
            ...(trim ? [] : [
              ["sculpt.help.edit", [[t("sculpt.soft.start"), t("sculpt.soft.startHint")], ...EDIT_ACTIONS.map((a) => [t(`sculpt.selection.${a}`), t(`sculpt.selection.${a}Hint`)])]],
              ["sculpt.help.freeze", FREEZE_ACTIONS.map((a) => [t(`sculpt.freeze.${a}`), t(`sculpt.freeze.${a}Hint`)])],
              ["sculpt.help.keys", [["Space", t("sculpt.help.keySpace")], ["Delete / Backspace", t("sculpt.help.keyDelete")], ["Esc", t("sculpt.help.keyEsc")], ["Ctrl+A", t("sculpt.help.keyAll")], [t("sculpt.help.double"), t("sculpt.help.doubleHint")], ...SCULPT_PRESETS.map((p) => [t(`sculpt.preset.${p.id}`), t(`sculpt.preset.${p.id}Hint`)])]],
              ["sculpt.help.whole", (["remesh", "offset", "thicken", "solid"] as const).map((m) => [t(`sculpt.mode.${m}`), t(`sculpt.mode.${m}Hint`)])],
              ["sculpt.help.settings", [[t("sculpt.size"), t("sculpt.tip.size")], [t("sculpt.strength"), t("sculpt.tip.strength")], [t("sculpt.refine"), t("sculpt.tip.refine")], [t("sculpt.symmetry"), t("sculpt.tip.symmetry")], [t("sculpt.options.falloff"), t("sculpt.options.falloff.smoothHint") + " " + t("sculpt.options.falloff.sharpHint") + " " + t("sculpt.options.falloff.flatHint")], [t("sculpt.options.lazy"), t("sculpt.tip.lazy")], [t("sculpt.options.hold"), t("sculpt.options.holdHint")], [t("sculpt.groups.show"), t("sculpt.groups.hint")], [t("sculpt.deviation.show"), t("sculpt.deviation.hint")], [t("sculpt.undo"), t("sculpt.tip.undo")], [t("sculpt.done"), t("sculpt.tip.done")]]],
            ]),
          ] as Array<[string, string[][]]>).map(([heading, rows]) => rows.length ? (
            <section key={heading}>
              <h5>{t(heading as "sculpt.help.brushes")}</h5>
              <dl>{rows.map(([name, text]) => (<div key={name}><dt>{name}</dt><dd>{text}</dd></div>))}</dl>
            </section>
          ) : null)}
        </div>
      ) : null}
      {preparing ? (
        <p className="edge-modifier-selection-help sculpt-preparing" role="status"><LoaderCircle className="edge-modifier-spinner" size={16} aria-hidden="true" /> {t("sculpt.preparing")}</p>
      ) : null}
      {trim ? (<>{TRIM_BODY}</>) : (<>
      {/* Build 94: three tabs - the brushes, the selection and what is done with it, and the whole part -
          so only what the job in hand needs is in view, and a selection's actions sit by its tools. */}
      <div className="sculpt-tabs" role="tablist" aria-label={t("sculpt.tabs")}>
        {(["brush", "select", "part"] as const).map((value) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? "active" : ""} disabled={busy} title={t(`sculpt.tab.${value}Hint`)} onClick={() => chooseTab(value)}>{t(`sculpt.tab.${value}`)}</button>
        ))}
      </div>
      {onUndo || onRedo ? (
        <div className="dental-trim-buttons sculpt-history" role="group" aria-label={t("sculpt.history")}>
          <button type="button" disabled={busy || !canUndo} title={t("sculpt.undoHint")} onClick={onUndo}><Undo2 size={16} aria-hidden="true" /> {t("sculpt.undo")}</button>
          <button type="button" disabled={busy || !canRedo} title={t("sculpt.redoHint")} onClick={onRedo}><Redo2 size={16} aria-hidden="true" /> {t("sculpt.redo")}</button>
        </div>
      ) : null}
      {tab === "brush" ? (<>
        <p className="edge-modifier-selection-help">{t("sculpt.help")}</p>
        <div className="dental-trim-mode dental-area-tools sculpt-tools" role="radiogroup" aria-label={t("sculpt.brushes")}>
          {SCULPT_TOOLS.filter((value) => value !== "select" && value !== "unselect").map((value) => (
            <button key={value} type="button" role="radio" aria-checked={tool === value} className={tool === value ? "active" : ""} disabled={busy} title={t(`sculpt.tip.${value}` as "sculpt.tip.draw")} onClick={() => onTool(tool === value ? null : value)}>
              {t(`sculpt.tool.${value}`)}
            </button>
          ))}
        </div>
        {onPreset ? (
          <details className="sculpt-brush-options sculpt-presets" open>
            <summary>{t("sculpt.presets")}</summary>
            <div className="dental-trim-buttons sculpt-selection">
              {SCULPT_PRESETS.map((preset) => (
                <button key={preset.id} type="button" disabled={busy} title={t(`sculpt.preset.${preset.id}Hint`)} onClick={() => onPreset(preset)}>{t(`sculpt.preset.${preset.id}`)}</button>
              ))}
            </div>
          </details>
        ) : null}
        {SIZE_SLIDER}
        <EdgeModifierSlider label={t("sculpt.strength")} title={t("sculpt.tip.strength")} value={Math.round(strength * 100)} min={1} max={100} step={1} workspace={workspace} disabled={busy} onChange={(value) => onStrength(value / 100)} />
        {tool ? <p className="blend-hint sculpt-keys">{t(tool === "mask" ? "sculpt.freeze.keys" : "sculpt.keysHint")}</p> : null}
        {BRUSH_OPTIONS}
        {tool !== "mask" ? REFINE_AND_SYMMETRY : null}
        {FREEZE}
        <div className="sculpt-view-aids">
          <strong className="sculpt-subtitle">{t("sculpt.viewAids")}</strong>
          {DEVIATION}
          {GROUPS}
        </div>
      </>) : null}
      {tab === "select" ? (<>
        <p className="edge-modifier-selection-help">{t("sculpt.selectHelp")}</p>
        <div className="dental-trim-mode dental-area-tools sculpt-tools two" role="radiogroup" aria-label={t("sculpt.selection")}>
          {(["select", "unselect"] as const).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={tool === value} className={tool === value ? "active" : ""} disabled={busy} title={t(`sculpt.tip.${value}`)} onClick={() => onTool(value)}>
              {t(`sculpt.tool.${value}`)}
            </button>
          ))}
        </div>
        {SELECT_SHAPE}
        {selectShape === "lasso" ? null : SIZE_SLIDER}
        {REACH}
        <p className="blend-hint" role="status">{chosen ? t("sculpt.chosen", { count: chosen.toLocaleString() }) : t("sculpt.noneChosen")}</p>
        {teethWarning > 0 ? <p className="dental-status warn sculpt-teeth-warning" role="status" aria-live="assertive">{t("sculpt.trimTeeth", { count: teethWarning.toLocaleString() })}</p> : null}
        <strong className="sculpt-subtitle">{t("sculpt.selectionActions")}</strong>
        <div className="dental-trim-buttons sculpt-selection" role="group" aria-label={t("sculpt.selection")}>
          {SCULPT_ACTIONS_ORDERED.map((action) => (
            <button key={action} type="button" className={action === "delete" ? "danger" : undefined} title={t(`sculpt.selection.${action}Hint` as "sculpt.selection.fillHint")} disabled={busy || (!chosen && action !== "invert")} onClick={() => onSelection(action)}>
              {teethWarning > 0 && action === warnedAction ? t(action === "fill" ? "sculpt.fillAnyway" : "sculpt.deleteAnyway") : t(`sculpt.selection.${action}`)}
            </button>
          ))}
        </div>
        <p className="blend-hint sculpt-keys">{t("sculpt.selectionKeys")}</p>
        <strong className="sculpt-subtitle">{t("sculpt.edit")}</strong>
        {EDIT_BLOCK}
        {onFreeze ? (
          <div className="dental-trim-buttons sculpt-selection" role="group" aria-label={t("sculpt.freeze.title")}>
            <button type="button" title={t("sculpt.freeze.selectionHint")} disabled={busy || !chosen} onClick={() => onFreeze("selection")}>{t("sculpt.freeze.selection")}</button>
          </div>
        ) : null}
        <div className="sculpt-view-aids">{GROUPS}</div>
      </>) : null}
      {tab === "part" && WHOLE_PART_TOOLS ? (<>{WHOLE_PART}</>) : null}
      </>)}
      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : null}
      {error ? <p className="blend-hint" role="status">{t("sculpt.errorHelp")}</p> : null}
      <div className="edge-modifier-footer">
        {WHOLE_PART_TOOLS && !trim && tab === "part" ? (<>
        <button type="button" className="secondary" disabled={busy} title={t("sculpt.tip.done")} onClick={onClose}>{t("sculpt.done")}</button>
        <button type="button" className="primary" disabled={busy} title={t(`sculpt.mode.${remeshMode}Hint`)} onClick={onRemesh}>
          {busy ? <LoaderCircle className="edge-modifier-spinner" size={17} /> : <Check size={17} />}
          {busy ? t("sculpt.working") : t(`sculpt.apply.${remeshMode}`)}
        </button>
        </>) : (
        <button type="button" className="primary" disabled={busy} title={t("sculpt.tip.done")} onClick={onClose}><Check size={17} /> {t("sculpt.done")}</button>
        )}
      </div>
      </>)}
    </MovableToolPanel>
  );
}
