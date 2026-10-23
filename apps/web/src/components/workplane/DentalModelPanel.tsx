"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { DENTAL_MAX_BASE, DENTAL_MAX_WALL, DENTAL_MIN_BASE, DENTAL_MIN_WALL, type DentalModelOptions, type DentalScanReport } from "@/lib/dentalModel";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

export type DentalPurpose = "study" | "aligner" | "crown";

/** The settings each purpose starts from (see docs/plans/dental-scan-to-model.md, Clinical specifications). */
export function dentalPreset(purpose: DentalPurpose, maxKeep: number): DentalModelOptions {
  if (purpose === "aligner") {
    // Thermoforming: solid, 15-20 mm in all (Formlabs' thermoforming guide).
    const keep = Math.min(maxKeep, 15);
    return { keep, base: Math.max(3, 18 - keep), plate: false, hollow: false, wall: 3 };
  }
  if (purpose === "crown") {
    // Crown and bridge: solid with a plate across the arch - the most accurate (Shin 2020, Wan 2026).
    return { keep: maxKeep, base: 5, plate: true, hollow: false, wall: 2 };
  }
  // Study model: hollow and open underneath to save resin.
  return { keep: maxKeep, base: 4, plate: false, hollow: true, wall: 2 };
}

/** Fork (build 46): Dental model - a raw intraoral scan made into a printable model in two steps. */
export function DentalModelPanel({
  targetName,
  stage,
  report,
  purpose,
  options,
  error,
  workspace,
  onPurposeChange,
  onOptionsChange,
  onApply,
  onCancel,
}: {
  targetName: string;
  stage: "preparing" | "ready" | "making";
  report: DentalScanReport | null;
  purpose: DentalPurpose;
  options: DentalModelOptions;
  error: string | null;
  workspace: WorkplaneWorkspaceSettings;
  onPurposeChange: (purpose: DentalPurpose) => void;
  onOptionsChange: (patch: Partial<DentalModelOptions>) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = t("dental.title");
  const busy = stage !== "ready";
  const maxKeep = report ? Math.max(0.5, Math.floor(report.maxKeep * 10) / 10) : 1;
  const keep = Math.min(options.keep, maxKeep);
  const total = keep + options.base;
  return (
    <MovableToolPanel className="edge-modifier-panel dental-model-panel" ariaLabel={title}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{targetName}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="dentalModel" />
          <button type="button" aria-label={t("common.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>
      {stage === "preparing" || !report ? (
        <p className="edge-modifier-selection-help dental-status" role="status">
          <LoaderCircle className="edge-modifier-spinner" size={15} /> {t("dental.preparing")}
        </p>
      ) : (
        <>
          <p className="edge-modifier-selection-help dental-report" role="status">
            {t("dental.report", {
              holes: report.holesFilled,
              fragments: report.fragmentsRemoved + report.brokenRemoved,
              keep: report.maxKeep.toFixed(1),
            })}
          </p>
          <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("dental.purpose")}>
            <span className="edge-modifier-label">{t("dental.purpose")}</span>
            <div className="shell-opening-options">
              {([
                ["study", t("dental.study")],
                ["aligner", t("dental.aligner")],
                ["crown", t("dental.crown")],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={purpose === value} className={purpose === value ? "active" : ""} disabled={busy} onClick={() => onPurposeChange(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <EdgeModifierSlider
            label={t("dental.keep")}
            value={keep}
            min={0.5}
            max={maxKeep}
            step={0.1}
            coarse={{ step: 0.5, max: maxKeep }}
            workspace={workspace}
            length
            disabled={busy}
            onChange={(value) => onOptionsChange({ keep: value })}
          />
          <EdgeModifierSlider
            label={t("dental.base")}
            value={options.base}
            min={DENTAL_MIN_BASE}
            max={DENTAL_MAX_BASE}
            step={0.5}
            coarse={{ step: 0.5, max: 15 }}
            workspace={workspace}
            length
            disabled={busy}
            onChange={(value) => onOptionsChange({ base: value })}
          />
          <p className="blend-hint dental-height">{t("dental.height", { height: total.toFixed(1) })}</p>
          <label className="edge-modifier-check" title={t("dental.plateHint")}>
            <input type="checkbox" checked={options.plate} disabled={busy} onChange={(event) => onOptionsChange({ plate: event.currentTarget.checked })} />
            <span>{t("dental.plate")}</span>
          </label>
          <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("dental.inside")}>
            <span className="edge-modifier-label">{t("dental.inside")}</span>
            <div className="shell-opening-options">
              {([
                [false, t("dental.solid")],
                [true, t("dental.hollow")],
              ] as const).map(([value, label]) => (
                <button key={String(value)} type="button" role="radio" aria-checked={options.hollow === value} className={options.hollow === value ? "active" : ""} disabled={busy} onClick={() => onOptionsChange({ hollow: value })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {options.hollow ? (
            <EdgeModifierSlider
              label={t("dental.wall")}
              value={options.wall}
              min={DENTAL_MIN_WALL}
              max={DENTAL_MAX_WALL}
              step={0.1}
              coarse={{ step: 0.5, max: DENTAL_MAX_WALL }}
              workspace={workspace}
              length
              disabled={busy}
              onChange={(value) => onOptionsChange({ wall: value })}
            />
          ) : null}
          <p className="blend-hint">{t(options.hollow ? "dental.hollowNote" : purpose === "crown" ? "dental.crownNote" : "dental.solidNote")}</p>
        </>
      )}
      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : null}
      <div className="edge-modifier-footer">
        <button type="button" className="secondary" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="button" className="primary" disabled={busy || !report} onClick={onApply}>
          {stage === "making" ? <LoaderCircle className="edge-modifier-spinner" size={17} /> : <Check size={17} />}
          {stage === "making" ? t("dental.working") : t("dental.apply")}
        </button>
      </div>
      </>)}
    </MovableToolPanel>
  );
}
