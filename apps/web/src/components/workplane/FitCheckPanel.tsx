"use client";

import { LoaderCircle, X } from "lucide-react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { FitReport } from "@/lib/partTools";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

/**
 * Fork (build 33): Fit check - which parts overlap (shown in red on the plate) and which come closer
 * than the clearance. It checks again by itself whenever a part moves, so parts can be nudged apart
 * while it is open.
 */
export function FitCheckPanel({
  clearance,
  report,
  busy,
  scope,
  names,
  workspace,
  onClearanceChange,
  onSelectPair,
  onClose,
}: {
  clearance: number;
  report: FitReport | null;
  busy: boolean;
  /** "selected" checks the selected parts, "all" every visible part. */
  scope: { kind: "selected" | "all"; count: number };
  names: ReadonlyMap<string, string>;
  workspace: WorkplaneWorkspaceSettings;
  onClearanceChange: (value: number) => void;
  onSelectPair: (a: string, b: string) => void;
  onClose: () => void;
}) {
  useLanguage();
  const title = t("fitCheck.title");
  const mm = (value: number) => `${value < 0.1 ? value.toFixed(2) : value.toFixed(1)} mm`;
  const findings = report?.findings ?? [];
  return (
    <MovableToolPanel className="edge-modifier-panel fit-check-panel" ariaLabel={title}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t(scope.kind === "selected" ? "fitCheck.scopeSelected" : "fitCheck.scopeAll", { count: scope.count })}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="fitCheck" />
          <button type="button" aria-label={t("fitCheck.close")} onClick={onClose}><X size={20} /></button>
        </div>
      </div>
      <p className="edge-modifier-selection-help">{t("fitCheck.help")}</p>
      <EdgeModifierSlider
        label={t("fitCheck.clearance")}
        value={clearance}
        min={0}
        max={2}
        step={0.05}
        coarse={{ step: 0.05, max: 2 }}
        workspace={workspace}
        length
        onChange={onClearanceChange}
      />
      <div className="fit-check-results" role="status" aria-live="polite">
        {busy ? (
          <p className="fit-check-summary"><LoaderCircle className="edge-modifier-spinner" size={15} /> {t("fitCheck.checking")}</p>
        ) : report ? (
          findings.length === 0 ? (
            <p className="fit-check-summary ok">{t(clearance > 0 ? "fitCheck.allClear" : "fitCheck.noOverlap", { clearance: mm(clearance) })}</p>
          ) : (
            <>
              <p className="fit-check-summary">{t("fitCheck.found", { count: findings.length })}</p>
              <ul className="fit-check-list">
                {findings.map((finding) => (
                  <li key={`${finding.a}-${finding.b}`}>
                    <button type="button" className={`fit-check-item ${finding.kind}`} title={t("fitCheck.selectPair")} onClick={() => onSelectPair(finding.a, finding.b)}>
                      <span className="fit-check-dot" aria-hidden="true" />
                      <span>
                        <strong>{names.get(finding.a) ?? "?"} + {names.get(finding.b) ?? "?"}</strong>
                        <small>
                          {finding.kind === "overlap"
                            ? t("fitCheck.overlap", { volume: (finding.overlap ?? 0) < 1 ? (finding.overlap ?? 0).toFixed(2) : Math.round(finding.overlap ?? 0).toString() })
                            : t("fitCheck.tight", { gap: mm(finding.gap ?? 0), clearance: mm(clearance) })}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )
        ) : null}
        {report && report.skipped > 0 ? <p className="fit-check-note">{t("fitCheck.skipped", { count: report.skipped })}</p> : null}
      </div>
      <div className="edge-modifier-footer">
        <button type="button" className="primary" onClick={onClose}>{t("edge.done")}</button>
      </div>
      </>)}
    </MovableToolPanel>
  );
}
