"use client";

import { Check, RotateCcw, RotateCw, X } from "lucide-react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { MoreOptions } from "@/components/workplane/MoreOptions";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { BlendSettings } from "@/lib/blend";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

/**
 * Fork (build 25): Blend - a smooth piece from a flat face of one body to a flat face of the other.
 * The facing faces are found by themselves; a click on another flat face of either body uses that one.
 */
export function BlendPanel({
  names,
  ready,
  canHollow,
  editing = false,
  keepShortfall = null,
  settings,
  workspace,
  busy,
  onChange,
  onApply,
  onCancel,
}: {
  names: [string, string];
  /** Both faces are known and the piece can be built. */
  ready: boolean;
  /** Both faces have an opening: the piece can be a sleeve. */
  canHollow: boolean;
  /** Fork (build 31): Keep the diameter with the parts too close - the mm more it needs (0: fits; null: never). */
  keepShortfall?: number | null;
  /** Fork (build 29): reopened on a blend made earlier - Create reads Update. */
  editing?: boolean;
  settings: BlendSettings;
  workspace: WorkplaneWorkspaceSettings;
  busy: boolean;
  onChange: (patch: Partial<BlendSettings>) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = t("blend.title");
  return (
    <MovableToolPanel className="edge-modifier-panel blend-panel" ariaLabel={title}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t("blend.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="blend" />
          <button type="button" aria-label={t("blend.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      <div className="edge-modifier-target">
        <strong>{names[0]} → {names[1]}</strong>
        <span role="status">{ready ? t("blend.ready") : t("blend.pick")}</span>
      </div>

      {settings.linked ? (
        <EdgeModifierSlider
          label={t("blend.smoothness")}
          value={settings.smoothness}
          min={0}
          max={100}
          step={5}
          unit="%"
          workspace={workspace}
          onChange={(value) => onChange({ smoothness: value, smoothnessEnd: value })}
        />
      ) : (
        <>
          <EdgeModifierSlider
            label={t("blend.smoothnessAt", { name: names[0] })}
            value={settings.smoothness}
            min={0}
            max={100}
            step={5}
            unit="%"
            workspace={workspace}
            onChange={(value) => onChange({ smoothness: value })}
          />
          <EdgeModifierSlider
            label={t("blend.smoothnessAt", { name: names[1] })}
            value={settings.smoothnessEnd}
            min={0}
            max={100}
            step={5}
            unit="%"
            workspace={workspace}
            onChange={(value) => onChange({ smoothnessEnd: value })}
          />
        </>
      )}
      <p className="blend-hint">{t(settings.linked ? "blend.smoothnessHint" : "blend.endsHint")}</p>
      {/* Fork (build 32): Smoothness and Create up front; the rest folds away. */}
      <MoreOptions id="blend" forceOpen={!settings.linked || settings.twist !== 0 || settings.keepDiameter || !settings.join || (canHollow && !settings.hollow)}>
      <label className="blend-hollow">
        <input type="checkbox" checked={settings.linked} onChange={(event) => onChange({ linked: event.currentTarget.checked, smoothnessEnd: settings.smoothness })} />
        <span><strong>{t("blend.linkEnds")}</strong></span>
      </label>

      <div className="edge-modifier-field blend-twist">
        <span>{t("blend.twist")}</span>
        <div className="blend-twist-buttons">
          <button type="button" aria-label={t("blend.twistLeft")} title={t("blend.twistLeft")} onClick={() => onChange({ twist: settings.twist - 1 })}><RotateCcw size={16} /></button>
          <button type="button" aria-label={t("blend.twistRight")} title={t("blend.twistRight")} onClick={() => onChange({ twist: settings.twist + 1 })}><RotateCw size={16} /></button>
          {settings.twist ? <button type="button" className="quiet" onClick={() => onChange({ twist: 0 })}>{t("blend.twistReset")}</button> : null}
        </div>
      </div>

      <label className="blend-hollow">
        <input type="checkbox" checked={settings.keepDiameter} onChange={(event) => onChange({ keepDiameter: event.currentTarget.checked })} />
        <span>
          <strong>{t("blend.keepDiameter")}</strong>
          <small>{t("blend.keepDiameterHint")}</small>
        </span>
      </label>
      {settings.keepDiameter && keepShortfall !== 0 ? (
        <p className="blend-hint blend-warning" role="status">
          {keepShortfall === null ? t("blend.keepDiameterNever") : t("blend.keepDiameterTight", { gap: keepShortfall })}
        </p>
      ) : null}
      {canHollow ? (
        <label className="edge-modifier-toggle blend-hollow">
          <input type="checkbox" checked={settings.hollow} onChange={(event) => onChange({ hollow: event.currentTarget.checked })} />
          <span>
            <strong>{t("blend.hollow")}</strong>
            <small>{t("blend.hollowHint")}</small>
          </span>
        </label>
      ) : null}

      <label className="blend-hollow">
        <input type="checkbox" checked={settings.join} onChange={(event) => onChange({ join: event.currentTarget.checked })} />
        <span>
          <strong>{t("blend.join")}</strong>
          <small>{t("blend.joinHint")}</small>
        </span>
      </label>
      </MoreOptions>

      <div className="edge-modifier-footer">
        <button type="button" className="secondary" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="button" className="primary" disabled={!ready || busy} onClick={onApply}>
          <Check size={17} />
          {t(editing ? "blend.update" : "blend.apply")}
        </button>
      </div>
      </>)}
    </MovableToolPanel>
  );
}
