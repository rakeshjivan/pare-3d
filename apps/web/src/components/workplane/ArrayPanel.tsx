"use client";

import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { Check, X } from "lucide-react";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { MoreOptions } from "@/components/workplane/MoreOptions";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { ARRAY_MAX_COUNT, ARRAY_MIN_COUNT, GRID_MAX_SIDE, type ArrayDirection, type ArrayMode, type ArraySettings } from "@/lib/shapeArray";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

const ARRAY_MODES: readonly ArrayMode[] = ["row", "grid", "circle"];
const GAP_DIRECTIONS: readonly ArrayDirection[] = ["x", "y", "z"];
const MAX_GAP = 100;
const MAX_SPACING = 300;
const MAX_SPIRAL_STEP = 100;
/** The row steps along all three axes at once; each has its own spacing. */
const ROW_AXES = [
  { key: "spacingX", label: "array.spacingX" },
  { key: "spacingY", label: "array.spacingY" },
  { key: "spacingZ", label: "array.spacingZ" },
] as const;

/**
 * Repeating the selection n times in a row or around a circle. The copies
 * show on the workplane while the numbers change and only land in the design
 * with "Create".
 */
export function ArrayPanel({
  targetName,
  settings,
  workspace,
  pivotSet,
  onChange,
  onApply,
  onCancel,
}: {
  targetName: string;
  settings: ArraySettings;
  workspace: WorkplaneWorkspaceSettings;
  /** A rotation pivot is set - the circle centre was taken from it. */
  pivotSet: boolean;
  onChange: (patch: Partial<ArraySettings>) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = t("array.title");
  const halfPlate = Math.max(workspace.width, workspace.depth) / 2;
  return (
    <MovableToolPanel className="edge-modifier-panel shell-panel array-panel" ariaLabel={title}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t("array.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="pattern" />
          <button type="button" aria-label={t("array.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      <div className="edge-modifier-target">
        <strong>{targetName}</strong>
        <span>{t(settings.mode === "grid" ? "array.helpGrid" : settings.mode === "row" ? (settings.measure === "gap" ? "array.helpRowGap" : "array.helpRow") : pivotSet ? "array.helpCirclePivot" : "array.helpCircle")}</span>
        {settings.mode === "grid" ? null : <span>{t(settings.mode === "row" ? "array.dragHintRow" : "array.dragHintCircle")}</span>}
      </div>

      <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("array.mode")}>
        <span>{t("array.mode")}</span>
        <div className="shell-opening-options">
          {ARRAY_MODES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={settings.mode === option}
              className={settings.mode === option ? "active" : ""}
              onClick={() => onChange({ mode: option })}
            >
              {t(`array.mode.${option}`)}
            </button>
          ))}
        </div>
      </div>

      {settings.mode !== "grid" ? (
        <EdgeModifierSlider
          label={t("array.count")}
          value={settings.count}
          min={ARRAY_MIN_COUNT}
          max={ARRAY_MAX_COUNT}
          step={1}
          workspace={workspace}
          onChange={(value) => onChange({ count: Math.round(value) })}
        />
      ) : (
        <>
          <EdgeModifierSlider label={t("array.columns")} value={settings.columns ?? 3} min={1} max={GRID_MAX_SIDE} step={1} workspace={workspace} onChange={(value) => onChange({ columns: Math.round(value) })} />
          <EdgeModifierSlider label={t("array.rows")} value={settings.rows ?? 2} min={1} max={GRID_MAX_SIDE} step={1} workspace={workspace} onChange={(value) => onChange({ rows: Math.round(value) })} />
        </>
      )}

      {settings.mode !== "circle" ? (
        <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("array.measure")}>
          <span>{t("array.measure")}</span>
          <div className="shell-opening-options">
            {(["gap", "centre"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={(settings.measure ?? "centre") === option}
                className={(settings.measure ?? "centre") === option ? "active" : ""}
                onClick={() => onChange({ measure: option })}
              >
                {t(option === "gap" ? "array.measure.gap" : "array.measure.centre")}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {settings.mode !== "circle" && settings.measure === "gap" ? (
        <>
          {settings.mode === "row" ? (
            <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("array.direction")}>
              <span>{t("array.direction")}</span>
              <div className="shell-opening-options">
                {GAP_DIRECTIONS.map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    role="radio"
                    aria-checked={(settings.gapDirection ?? "x") === direction}
                    className={(settings.gapDirection ?? "x") === direction ? "active" : ""}
                    onClick={() => onChange({ gapDirection: direction })}
                  >
                    {direction.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <EdgeModifierSlider label={t("array.gap")} value={settings.gap ?? 5} min={-MAX_GAP} max={MAX_GAP} step={0.5} workspace={workspace} length onChange={(value) => onChange({ gap: value })} />
        </>
      ) : settings.mode === "grid" ? (
        <>
          {ROW_AXES.slice(0, 2).map(({ key, label }) => (
            <EdgeModifierSlider key={key} label={t(label)} value={settings[key]} min={-MAX_SPACING} max={MAX_SPACING} step={0.5} workspace={workspace} length onChange={(value) => onChange({ [key]: value })} />
          ))}
        </>
      ) : settings.mode === "row" ? (
        <>
          {ROW_AXES.map(({ key, label }) => (
            <EdgeModifierSlider
              key={key}
              label={t(label)}
              value={settings[key]}
              min={-MAX_SPACING}
              max={MAX_SPACING}
              step={0.5}
              workspace={workspace}
              length
              onChange={(value) => onChange({ [key]: value })}
            />
          ))}
        </>
      ) : (
        <>
          <EdgeModifierSlider
            label={t("array.angle")}
            value={settings.angle}
            min={-360}
            max={360}
            step={1}
            unit="°"
            workspace={workspace}
            onChange={(value) => onChange({ angle: value })}
          />
          {/* Fork (build 32): the count and the angle up front; spirals, the centre and turning the copies fold away. */}
          <MoreOptions id="pattern-circle" forceOpen={settings.rise !== 0 || settings.radiusChange !== 0}>
          <EdgeModifierSlider
            label={t("array.rise")}
            value={settings.rise}
            min={-MAX_SPIRAL_STEP}
            max={MAX_SPIRAL_STEP}
            step={0.5}
            workspace={workspace}
            length
            onChange={(value) => onChange({ rise: value })}
          />
          <EdgeModifierSlider
            label={t("array.radiusChange")}
            value={settings.radiusChange}
            min={-MAX_SPIRAL_STEP}
            max={MAX_SPIRAL_STEP}
            step={0.5}
            workspace={workspace}
            length
            onChange={(value) => onChange({ radiusChange: value })}
          />
          <EdgeModifierSlider
            label={t("array.centerX")}
            value={settings.centerX}
            min={-halfPlate}
            max={halfPlate}
            step={0.5}
            workspace={workspace}
            length
            onChange={(value) => onChange({ centerX: value })}
          />
          <EdgeModifierSlider
            label={t("array.centerY")}
            value={settings.centerY}
            min={-halfPlate}
            max={halfPlate}
            step={0.5}
            workspace={workspace}
            length
            onChange={(value) => onChange({ centerY: value })}
          />
          <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("array.rotateCopies")}>
            <span>{t("array.rotateCopies")}</span>
            <div className="shell-opening-options">
              {[true, false].map((option) => (
                <button
                  key={String(option)}
                  type="button"
                  role="radio"
                  aria-checked={settings.rotateCopies === option}
                  className={settings.rotateCopies === option ? "active" : ""}
                  onClick={() => onChange({ rotateCopies: option })}
                >
                  {t(option ? "array.rotateCopies.yes" : "array.rotateCopies.no")}
                </button>
              ))}
            </div>
          </div>
          </MoreOptions>
        </>
      )}

      <div className="edge-modifier-footer">
        <button type="button" className="secondary" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="button" className="primary" onClick={onApply}>
          <Check size={17} />
          {t("array.apply")}
        </button>
      </div>
      </>)}
    </MovableToolPanel>
  );
}
