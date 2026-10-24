"use client";

import { ArrowLeftRight, Check, ChevronDown, LoaderCircle, Scissors, Upload, X } from "lucide-react";
import { useState } from "react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import {
  DENTAL_MAX_BASE, DENTAL_MAX_WALL, DENTAL_MIN_BASE, DENTAL_MIN_WALL,
  type DentalAnalysis, type DentalBaseStyle, type DentalInfill, type DentalInside, type DentalStudioOptions,
} from "@/lib/dentalModel";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

export type DentalPreset = "study" | "ortho" | "aligner" | "crown";
export type DentalSlot = "upper" | "lower" | "bite";

/**
 * The settings each preset starts from (docs/plans/dental-scan-to-model.md, Clinical specifications).
 * `depth` is how deep the anatomy runs below the occlusal plane (flaps and scan tails ignored), mm.
 */
export function dentalPreset(preset: DentalPreset, depth: number, pair: boolean, above = 0, teeth = 0): DentalStudioOptions {
  const common = { label: "", hinge: false, layout: "print" as const, wall: 2 };
  if (preset === "ortho") {
    // The trimmed base is about a third of the model's height (the art portion), the anatomy two thirds.
    return { ...common, keep: null, base: Math.round(Math.max(6, Math.min(15, depth / 2))), baseStyle: "ortho", inside: "solid", layout: pair ? "occlusion" : "print" };
  }
  if (preset === "aligner") {
    // Thermoforming: solid, 15-20 mm in all (Formlabs' thermoforming guide) - floor to the tallest
    // tooth about 18 mm, never keeping less than the teeth.
    const keep = Math.max(teeth, Math.min(depth, 15 - above));
    return { ...common, keep, base: Math.max(3, 18 - keep - above), baseStyle: "follow", inside: "solid" };
  }
  if (preset === "crown") {
    // Crown and bridge: solid with a plate across the arch - the most accurate (Shin 2020, Wan 2026).
    return { ...common, keep: null, base: 5, baseStyle: "plate", inside: "solid" };
  }
  // Study model: hollow and open underneath to save resin, all the anatomy kept.
  // Fork (build 49): on a clean base - trimmed to a smooth outline a few mm round the teeth, low.
  return { ...common, keep: null, base: 3, baseStyle: "clean", gum: 3, inside: "open" };
}

export type DentalPartChoice = { id: string; name: string };

/** Fork (build 48): the sides an arch can be looked at from. */
export type DentalView = "occlusal" | "front" | "left" | "right" | "lingual";
const DENTAL_VIEWS: readonly DentalView[] = ["occlusal", "front", "left", "right", "lingual"];

/** Fork (build 47): Dental Studio - raw intraoral scans to printable models, one arch or a pair with its bite. */
export function DentalStudioPanel({
  parts,
  slots,
  stage,
  trimming,
  trimMode,
  onTrimModeChange,
  onTrim,
  onView,
  analysis,
  preset,
  options,
  advanced,
  error,
  notes,
  workspace,
  onSlotChange,
  onSwap,
  onPresetChange,
  onOptionsChange,
  onAdvancedChange,
  onApply,
  onImport,
  onCancel,
}: {
  parts: DentalPartChoice[];
  slots: Record<DentalSlot, string | null>;
  stage: "analysing" | "ready" | "making" | "trimming";
  trimming: { slot: "upper" | "lower"; mode: "keep" | "remove" } | null;
  trimMode: "keep" | "remove";
  onTrimModeChange: (mode: "keep" | "remove") => void;
  onTrim: (slot: "upper" | "lower") => void;
  onView: (slot: "upper" | "lower", view: DentalView) => void;
  analysis: DentalAnalysis | null;
  preset: DentalPreset;
  options: DentalStudioOptions;
  advanced: boolean;
  error: string | null;
  notes: string[];
  workspace: WorkplaneWorkspaceSettings;
  onSlotChange: (slot: DentalSlot, id: string | null) => void;
  onSwap: () => void;
  onPresetChange: (preset: DentalPreset) => void;
  onOptionsChange: (patch: Partial<DentalStudioOptions>) => void;
  onAdvancedChange: (open: boolean) => void;
  onApply: () => void;
  onImport: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = t("dental.title");
  const [chosenArch, setArch] = useState<"upper" | "lower">("upper");
  const arch = trimming?.slot ?? (slots[chosenArch] ? chosenArch : slots.upper ? "upper" : "lower");
  const busy = stage !== "ready";
  const pair = Boolean(slots.upper && slots.lower);
  const depth = analysis ? Math.max(...analysis.arches.map((arch) => arch.depth)) : 10;
  const maxKeep = Math.max(1, Math.floor(depth * 10) / 10);
  // Never less than keeps every tooth whole.
  const minKeep = Math.min(maxKeep, analysis ? Math.ceil(Math.max(...analysis.arches.map((arch) => arch.teeth)) * 10) / 10 : 1);
  const following = options.gum !== null && options.gum !== undefined;
  const straight = options.keep === null ? maxKeep : Math.max(minKeep, Math.min(options.keep, maxKeep));
  const keep = following ? Math.max(minKeep, Math.min(straight, minKeep + (options.gum ?? 3))) : straight;
  // Floor to the tallest tooth.
  const height = keep + options.base + (analysis ? Math.max(...analysis.arches.map((arch) => arch.above)) : 0);
  const ready = Boolean(analysis) && !busy && Boolean(slots.upper || slots.lower);
  const archInfo = (slot: "upper" | "lower") => {
    const id = slots[slot];
    const info = analysis?.arches.find((arch) => arch.id === id);
    if (!id) return null;
    if (!info) return stage === "analysing" ? t("dental.checking") : null;
    return t("dental.archInfo", { holes: info.report.holesFilled, pieces: info.report.fragmentsRemoved + info.report.brokenRemoved, depth: info.depth.toFixed(1) });
  };
  const pairInfo = () => {
    if (!pair || !analysis?.pair) return null;
    const { inOcclusion, bite, apart } = analysis.pair;
    if (apart) return { text: t("dental.apart"), warn: true };
    if (bite && !bite.fitted) return { text: t("dental.biteFailed"), warn: true };
    if (bite) return { text: t("dental.biteFitted", { error: bite.rms.toFixed(2) }), warn: false };
    if (inOcclusion) return { text: t("dental.inOcclusion"), warn: false };
    return { text: t("dental.notTouching"), warn: true };
  };
  const pairLine = pairInfo();
  const slotRow = (slot: DentalSlot, label: string, info: string | null) => (
    <div className="dental-slot" key={slot}>
      <label>
        <span>{label}</span>
        <select value={slots[slot] ?? ""} disabled={busy} onChange={(event) => onSlotChange(slot, event.currentTarget.value || null)}>
          <option value="">{t("dental.none")}</option>
          {parts.map((part) => <option key={part.id} value={part.id}>{part.name}</option>)}
        </select>
      </label>
      {info ? <p className="dental-slot-info">{info}</p> : null}
    </div>
  );
  return (
    <MovableToolPanel className="edge-modifier-panel dental-studio-panel" ariaLabel={title}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t("dental.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="dentalModel" />
          <button type="button" aria-label={t("common.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>
      <h3 className="dental-step">{t("dental.step1")}</h3>
      <div className="dental-slots">
        {parts.length === 0 ? <p className="dental-status" role="status">{t("dental.noScans")}</p> : null}
        <button type="button" className="dental-import" disabled={stage === "making"} onClick={onImport}><Upload size={15} /> {t("dental.import")}</button>
        {slotRow("upper", t("dental.upper"), archInfo("upper"))}
        <button type="button" className="dental-swap" title={t("dental.swap")} aria-label={t("dental.swap")} disabled={busy || (!slots.upper && !slots.lower)} onClick={onSwap}><ArrowLeftRight size={15} /></button>
        {slotRow("lower", t("dental.lower"), archInfo("lower"))}
        {slotRow("bite", t("dental.bite"), null)}
        {stage === "analysing" ? <p className="dental-status" role="status"><LoaderCircle className="edge-modifier-spinner" size={15} /> {t("dental.analysing")}</p> : null}
        {pairLine ? <p className={`dental-status ${pairLine.warn ? "warn" : ""}`} role="status">{pairLine.text}</p> : null}
      </div>
      <div className="dental-trim">
        <h3 className="dental-step">{t("dental.step2")}</h3>
        <div className="dental-trim-mode" role="radiogroup" aria-label={t("dental.trimArch")}>
          {(["upper", "lower"] as const).map((slot) => (
            <button key={slot} type="button" role="radio" aria-checked={arch === slot} className={arch === slot ? "active" : ""} disabled={!slots[slot] || Boolean(trimming)} onClick={() => setArch(slot)}>
              {t(slot === "upper" ? "dental.upper" : "dental.lower")}
            </button>
          ))}
        </div>
        <div className="dental-views" role="group" aria-label={t("dental.views")}>
          {DENTAL_VIEWS.map((view) => (
            <button key={view} type="button" disabled={!slots[arch] || !analysis} onClick={() => onView(arch, view)}>{t(`dental.view.${view}`)}</button>
          ))}
        </div>
        <div className="dental-trim-mode" role="radiogroup" aria-label={t("dental.trimTitle")}>
          {(["keep", "remove"] as const).map((mode) => (
            <button key={mode} type="button" role="radio" aria-checked={trimMode === mode} className={trimMode === mode ? "active" : ""} disabled={busy || Boolean(trimming)} onClick={() => onTrimModeChange(mode)}>
              {t(mode === "keep" ? "dental.trimKeep" : "dental.trimRemove")}
            </button>
          ))}
        </div>
        <div className="dental-trim-buttons">
          <button type="button" className={trimming ? "active" : ""} disabled={(busy && !trimming) || !slots[arch] || !analysis} onClick={() => onTrim(arch)}>
            <Scissors size={15} /> {t(trimming ? "dental.trimStop" : "dental.trimDraw")}
          </button>
        </div>
        {stage === "trimming" ? <p className="dental-status" role="status"><LoaderCircle className="edge-modifier-spinner" size={15} /> {t("dental.trimming")}</p> : <p className="blend-hint">{t("dental.trimInfo")}</p>}
      </div>
      <h3 className="dental-step">{t("dental.step3")}</h3>
      <div className="dental-presets" role="radiogroup" aria-label={t("dental.purpose")}>
        {([
          ["study", t("dental.study"), t("dental.studyHint")],
          ["ortho", t("dental.ortho"), t("dental.orthoHint")],
          ["aligner", t("dental.aligner"), t("dental.alignerHint")],
          ["crown", t("dental.crown"), t("dental.crownHint")],
        ] as const).map(([value, label, hint]) => (
          <button key={value} type="button" role="radio" aria-checked={preset === value} className={preset === value ? "active" : ""} disabled={busy} onClick={() => onPresetChange(value)}>
            <strong>{label}</strong>
            <span>{hint}</span>
          </button>
        ))}
      </div>
      <p className="blend-hint dental-height">{t("dental.height", { height: height.toFixed(1) })}</p>
      <button type="button" className={`dental-more ${advanced ? "open" : ""}`} aria-expanded={advanced} onClick={() => onAdvancedChange(!advanced)}>
        <ChevronDown size={15} /> {t("dental.more")}
      </button>
      {advanced ? (
        <div className="dental-advanced">
          <label className="edge-modifier-check">
            <input type="checkbox" checked={following} disabled={busy} onChange={(event) => onOptionsChange({ gum: event.currentTarget.checked ? 3 : null })} />
            <span>{t("dental.gumFollow")}</span>
          </label>
          {following ? (
            <EdgeModifierSlider label={t("dental.gum")} value={options.gum ?? 3} min={0.5} max={10} step={0.1} coarse={{ step: 0.5, max: 10 }} workspace={workspace} length disabled={busy} onChange={(value) => onOptionsChange({ gum: value })} />
          ) : (
            <>
              <label className="edge-modifier-check">
                <input type="checkbox" checked={options.keep === null} disabled={busy} onChange={(event) => onOptionsChange({ keep: event.currentTarget.checked ? null : maxKeep })} />
                <span>{t("dental.keepAll")}</span>
              </label>
              {options.keep !== null ? (
                <EdgeModifierSlider label={t("dental.keep")} value={keep} min={minKeep} max={maxKeep} step={0.1} coarse={{ step: 0.5, max: maxKeep }} workspace={workspace} length disabled={busy} onChange={(value) => onOptionsChange({ keep: value })} />
              ) : null}
            </>
          )}
          <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("dental.smooth")}>
            <span className="edge-modifier-label">{t("dental.smooth")}</span>
            <div className="shell-opening-options">
              {(["off", "low", "high"] as const).map((value) => (
                <button key={value} type="button" role="radio" aria-checked={(options.smooth ?? "low") === value} className={(options.smooth ?? "low") === value ? "active" : ""} disabled={busy} onClick={() => onOptionsChange({ smooth: value })}>{t(`dental.smooth.${value}`)}</button>
              ))}
            </div>
          </div>
          <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("dental.baseStyle")}>
            <span className="edge-modifier-label">{t("dental.baseStyle")}</span>
            <div className="shell-opening-options">
              {([["clean", t("dental.cleanBase")], ["follow", t("dental.follow")], ["plate", t("dental.plate")], ["ortho", t("dental.orthoBase")]] as Array<[DentalBaseStyle, string]>).map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={options.baseStyle === value} className={options.baseStyle === value ? "active" : ""} disabled={busy} onClick={() => onOptionsChange({ baseStyle: value })}>{label}</button>
              ))}
            </div>
          </div>
          {options.baseStyle === "clean" || options.baseStyle === "articulator" ? (
            <>
              {options.baseStyle === "clean" ? (
                <label className="edge-modifier-check" title={t("dental.notchesHint")}>
                  <input type="checkbox" checked={options.notches !== false} disabled={busy} onChange={(event) => onOptionsChange({ notches: event.currentTarget.checked })} />
                  <span>{t("dental.notches")}</span>
                </label>
              ) : <p className="blend-hint">{t("dental.articulatorHint")}</p>}
              <label className="edge-modifier-check" title={t("dental.tieBarHint")}>
                <input type="checkbox" checked={Boolean(options.tieBar)} disabled={busy} onChange={(event) => onOptionsChange({ tieBar: event.currentTarget.checked })} />
                <span>{t("dental.tieBar")}</span>
              </label>
            </>
          ) : null}
          <EdgeModifierSlider label={t(options.baseStyle === "ortho" ? "dental.orthoHeight" : "dental.base")} value={options.base} min={DENTAL_MIN_BASE} max={DENTAL_MAX_BASE} step={0.5} coarse={{ step: 0.5, max: 20 }} workspace={workspace} length disabled={busy} onChange={(value) => onOptionsChange({ base: value })} />
          {options.baseStyle !== "ortho" ? (
            <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("dental.basePresets")} title={t("dental.basePresetsHint")}>
              <span className="edge-modifier-label">{t("dental.basePresets")}</span>
              <div className="shell-opening-options">
                {[3, 5, 10, 15].map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={Math.abs(options.base - value) < 1e-6} className={Math.abs(options.base - value) < 1e-6 ? "active" : ""} disabled={busy} onClick={() => onOptionsChange({ base: value })}>{`${value} mm`}</button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("dental.inside")}>
            <span className="edge-modifier-label">{t("dental.inside")}</span>
            <div className="shell-opening-options">
              {([["solid", t("dental.solid")], ["open", t("dental.hollowOpen")], ["closed", t("dental.hollowClosed")]] as Array<[DentalInside, string]>).map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={options.inside === value} className={options.inside === value ? "active" : ""} disabled={busy} onClick={() => onOptionsChange({ inside: value })}>{label}</button>
              ))}
            </div>
          </div>
          {options.inside !== "solid" ? (
            <>
              <EdgeModifierSlider label={t("dental.wall")} value={options.wall} min={DENTAL_MIN_WALL} max={DENTAL_MAX_WALL} step={0.1} coarse={{ step: 0.5, max: DENTAL_MAX_WALL }} workspace={workspace} length disabled={busy} onChange={(value) => onOptionsChange({ wall: value })} />
              <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("dental.infill")} title={t("dental.infillHint")}>
                <span className="edge-modifier-label">{t("dental.infill")}</span>
                <div className="shell-opening-options">
                  {([["none", t("dental.infillNone")], ["base", t("dental.infillBase")], ["honeycomb", t("dental.infillFull")]] as Array<[DentalInfill, string]>).map(([value, label]) => (
                    <button key={value} type="button" role="radio" aria-checked={(options.infill ?? "honeycomb") === value} className={(options.infill ?? "honeycomb") === value ? "active" : ""} disabled={busy} onClick={() => onOptionsChange({ infill: value })}>{label}</button>
                  ))}
                </div>
              </div>
            </>
          ) : null}
          {pair ? (
            <>
              <label className="edge-modifier-check" title={t("dental.hingeHint")}>
                <input type="checkbox" checked={options.hinge} disabled={busy} onChange={(event) => onOptionsChange({ hinge: event.currentTarget.checked })} />
                <span>{t("dental.hinge")}</span>
              </label>
              <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("dental.layout")}>
                <span className="edge-modifier-label">{t("dental.layout")}</span>
                <div className="shell-opening-options">
                  {([["print", t("dental.layoutPrint")], ["occlusion", t("dental.layoutOcclusion")]] as const).map(([value, label]) => (
                    <button key={value} type="button" role="radio" aria-checked={options.layout === value} className={options.layout === value ? "active" : ""} disabled={busy} onClick={() => onOptionsChange({ layout: value })}>{label}</button>
                  ))}
                </div>
              </div>
            </>
          ) : null}
          <label className="dental-label-field">
            <span>{t("dental.label")}</span>
            <input type="text" maxLength={24} value={options.label} placeholder={t("dental.labelPlaceholder")} disabled={busy} onChange={(event) => onOptionsChange({ label: event.currentTarget.value })} />
          </label>
          <p className="blend-hint">{t(options.baseStyle === "ortho" ? "dental.labelOrtho" : options.baseStyle === "plate" && options.inside !== "open" ? "dental.labelPlate" : "dental.labelNone")}</p>
        </div>
      ) : null}
      <p className="blend-hint">{t(options.inside === "solid" ? (options.baseStyle === "ortho" ? "dental.orthoNote" : options.baseStyle === "plate" ? "dental.crownNote" : "dental.solidNote") : options.inside === "open" ? "dental.hollowNote" : "dental.closedNote")}</p>
      {notes.map((note) => <p key={note} className="dental-status warn" role="status">{note}</p>)}
      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : null}
      <div className="edge-modifier-footer">
        <button type="button" className="secondary" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="button" className="primary" disabled={!ready} onClick={onApply}>
          {stage === "making" ? <LoaderCircle className="edge-modifier-spinner" size={17} /> : <Check size={17} />}
          {stage === "making" ? t("dental.working") : t(pair ? "dental.applyPair" : "dental.apply")}
        </button>
      </div>
      </>)}
    </MovableToolPanel>
  );
}
