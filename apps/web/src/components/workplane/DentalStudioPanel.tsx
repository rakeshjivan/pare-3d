"use client";

import { HINGE_CLEARANCE, HINGE_CONDYLE_ANGLES, HINGE_FITS, INCISAL_PIN_MAX, INCISAL_PIN_STEP } from "@/lib/dentalBase";
import { readMyHingeFit, saveMyHingeFit } from "@/lib/hingeFitTest";

import { ArrowLeftRight, Check, ChevronDown, FilePlus2, LoaderCircle, Upload, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { ArticulatorPicture, BaseStylePicture, JointPicture } from "@/components/workplane/DentalPictures";
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

export type DentalAreaTool = "paint" | "erase" | "lassoAdd" | "lassoRemove";

/** Fork (build 47): Dental Studio - raw intraoral scans to printable models, one arch or a pair with its bite. */
export function DentalStudioPanel({
  parts,
  slots,
  stage,
  trimming,
  trimMode,
  onTrimModeChange,
  onTrim,
  areaTool,
  areaBusy,
  brushSize,
  onAreaTool,
  onBrushSize,
  onResetArea,
  onSculpt,
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
  onHingeTest,
  onCancel,
  patientDetails = "keep",
  onPatientDetails,
  onNewPatient,
  modelsHere = false,
  layout,
  onLayout,
  biteLocked = false,
  onRestore,
  areaShown = true,
  onAreaShown,
}: {
  parts: DentalPartChoice[];
  slots: Record<DentalSlot, string | null>;
  stage: "analysing" | "ready" | "making" | "trimming";
  trimming: { slot: "upper" | "lower"; mode: "keep" | "remove" } | null;
  trimMode: "keep" | "remove";
  onTrimModeChange: (mode: "keep" | "remove") => void;
  onTrim: (slot: "upper" | "lower") => void;
  areaTool: { slot: "upper" | "lower"; tool: DentalAreaTool } | null;
  areaBusy: boolean;
  brushSize: number;
  onAreaTool: (slot: "upper" | "lower", tool: DentalAreaTool | null) => void;
  onBrushSize: (size: number) => void;
  onResetArea: (slot: "upper" | "lower") => void;
  /** Build 69: opens Sculpt on that scan. */
  onSculpt?: (slot: "upper" | "lower", mode?: "sculpt" | "trim") => void;
  onView: (slot: "upper" | "lower", view: DentalView) => void;
  /** Build 74: how the scans stand on the plate, and the button that changes it. */
  layout?: "side" | "occlusion";
  onLayout?: (layout: "side" | "occlusion") => void;
  /** Build 74: the bite is locked into the arches (edits can no longer move it). */
  biteLocked?: boolean;
  /** Build 74: puts an arch's original scan back. */
  onRestore?: (slot: "upper" | "lower") => void;
  /** Build 74: whether the teeth tint shows over the scans. */
  areaShown?: boolean;
  onAreaShown?: (shown: boolean) => void;
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
  /** Build 60: put the hinge fit test in the design. */
  onHingeTest?: () => void;
  onCancel: () => void;
  /** Build 71: whether the made models keep the patient's details (scan names, label) or lose them. */
  patientDetails?: "keep" | "remove";
  onPatientDetails?: (value: "keep" | "remove") => void;
  /** Build 71: a new design with the Studio open, so the next patient's scans start on their own. */
  onNewPatient?: () => void;
  /** Build 71: this design already holds models made here. */
  modelsHere?: boolean;
}) {
  useLanguage();
  const title = t("dental.title");
  const [chosenArch, setArch] = useState<"upper" | "lower">("upper");
  const [folded, setFolded] = useState<Record<number, boolean>>({});
  const [activeCard, setActiveCard] = useState(1);
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
  // Build 64: the height in its three parts - the teeth (to the deepest a tooth reaches, never cut),
  // the gum kept below them, and the base.
  const teethHeight = (analysis ? Math.max(...analysis.arches.map((arch) => arch.above)) : 0) + minKeep;
  const gumHeight = Math.max(0, keep - minKeep);
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
    // Build 74: a locked bite has its own line (biteLocked) - nothing was fitted again.
    if (bite?.locked) return null;
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
  // Build 59: the next thing to do, said in one line above the button.
  const nextStep = !slots.upper && !slots.lower
    ? t("dental.next.import")
    : stage === "analysing" ? t("dental.next.wait")
    : stage === "making" ? null
    : trimming || areaTool ? t("dental.next.editing")
    : t("dental.next.ready", { button: t(pair ? "dental.applyPair" : "dental.apply") });
  const scansDone = Boolean(analysis) && Boolean(slots.upper || slots.lower);
  const baseName = (style: DentalBaseStyle) => t(style === "clean" ? "dental.cleanBase" : style === "follow" ? "dental.follow" : style === "plate" ? "dental.plate" : style === "ortho" ? "dental.orthoBase" : "dental.articulatorBase");
  const insideName = t(options.inside === "solid" ? "dental.solid" : options.inside === "open" ? "dental.hollowOpen" : "dental.hollowClosed");
  const step = (number: number, label: string, done: boolean, hint: string | null) => (
    <div className="dental-step-head">
      <span className={`dental-step-number ${done ? "done" : ""}`} aria-hidden="true">{done ? <Check size={12} strokeWidth={3} /> : number}</span>
      <div>
        <h3 className="dental-step">{label}</h3>
        {hint ? <p className="dental-step-hint">{hint}</p> : null}
      </div>
    </div>
  );
  // Build 75: each step a card that folds to a one-line summary; the card last worked in is marked.
  const card = (number: number, label: string, done: boolean, hint: string | null, summary: string | null, body: ReactNode) => {
    const isFolded = Boolean(folded[number]);
    return (
      <section className={`dental-section dental-card${isFolded ? " folded" : ""}${activeCard === number ? " current" : ""}`} aria-label={label} onPointerDownCapture={() => setActiveCard(number)}>
        <button type="button" className="dental-card-head" aria-expanded={!isFolded} onClick={() => setFolded((state) => ({ ...state, [number]: !isFolded }))}>
          {step(number, label, done, isFolded ? null : hint)}
          <ChevronDown size={16} className="dental-card-chevron" aria-hidden="true" />
        </button>
        {isFolded ? (summary ? <p className="dental-card-summary">{summary}</p> : null) : body}
      </section>
    );
  };
  const presetBase = ({ study: "clean", ortho: "ortho", aligner: "follow", crown: "plate" } as const)[preset];
  // Build 75: the base changed in step 4 from the one the model type set.
  const custom = options.baseStyle !== presetBase;
  const presetName = t(({ study: "dental.study", ortho: "dental.ortho", aligner: "dental.aligner", crown: "dental.crown" } as const)[preset]);
  const scansSummary = scansDone
    ? [slots.upper ? t("dental.upper") : null, slots.lower ? t("dental.lower") : null, slots.bite ? t("dental.bite") : null].filter(Boolean).join(" + ") + (biteLocked ? ` - ${t("dental.summaryLocked")}` : "")
    : null;
  const prepareSummary = scansDone ? t((options.margin ?? "auto") === "auto" ? "dental.marginAuto" : "dental.marginManual") : null;
  const modelSummary = `${presetName}${custom ? ` (${t("dental.custom")})` : ""} - ${insideName}`;
  const baseSummary = t("dental.summary", { base: baseName(options.baseStyle), inside: insideName, height: height.toFixed(1) });
  const articSummary = options.hinge ? t("dental.hinge") : t("dental.summaryNoHinge");
  const nameSummary = patientDetails === "remove" ? t("dental.patientRemove") : options.label.trim() || t("dental.summaryNoLabel");
  const choice = <T extends string>(label: string, value: T, choices: Array<[T, string]>, onPick: (value: T) => void, title?: string, showLabel = true) => (
    <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={label} title={title}>
      {showLabel ? <span className="edge-modifier-label">{label}</span> : null}
      <div className="shell-opening-options">
        {choices.map(([option, text]) => (
          <button key={option} type="button" role="radio" aria-checked={value === option} className={value === option ? "active" : ""} disabled={busy} onClick={() => onPick(option)}>{text}</button>
        ))}
      </div>
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

      {/* Build 75: the Studio in step cards - scans, preparing them (trim, then the teeth), what the model
          is for, its base, the articulator (a pair), its name. A card folds to one line; the one last
          worked in is marked. */}
      {card(1, t("dental.step1"), scansDone, t("dental.step1Hint"), scansSummary, (<>
        <div className="dental-slots">
          {parts.length === 0 ? <p className="dental-status" role="status">{t("dental.noScans")}</p> : null}
          <div className={onNewPatient ? "dental-import-row" : undefined}>
            <button type="button" className="dental-import" disabled={stage === "making"} onClick={onImport}><Upload size={15} /> {t("dental.import")}</button>
            {onNewPatient ? <button type="button" className="dental-import dental-new-patient" disabled={stage === "making"} title={t("dental.newPatientHint")} onClick={onNewPatient}><FilePlus2 size={15} /> {t("dental.newPatient")}</button> : null}
          </div>
          {modelsHere ? <p className="dental-status warn" role="status">{t("dental.modelsHere")}</p> : null}
          {slotRow("upper", t("dental.upper"), archInfo("upper"))}
          <button type="button" className="dental-swap" title={t("dental.swap")} aria-label={t("dental.swap")} disabled={busy || (!slots.upper && !slots.lower)} onClick={onSwap}><ArrowLeftRight size={15} /></button>
          {slotRow("lower", t("dental.lower"), archInfo("lower"))}
          {slotRow("bite", t("dental.bite"), null)}
          {stage === "analysing" ? <p className="dental-status" role="status"><LoaderCircle className="edge-modifier-spinner" size={15} /> {t("dental.analysing")}</p> : null}
          {pairLine ? <p className={`dental-status ${pairLine.warn ? "warn" : ""}`} role="status">{pairLine.text}</p> : null}
          {biteLocked ? <p className="dental-status" role="status">{t("dental.biteLocked")}</p> : null}
          {onLayout && analysis && slots.upper && slots.lower ? (
            <div className="dental-trim-mode" role="radiogroup" aria-label={t("dental.scanLayout")}>
              {(["side", "occlusion"] as const).map((value) => (
                <button key={value} type="button" role="radio" aria-checked={layout === value} className={layout === value ? "active" : ""} disabled={busy} onClick={() => onLayout(value)}>
                  {t(value === "side" ? "dental.scanSide" : "dental.scanOcclusion")}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </>))}

      {card(2, t("dental.step2Prepare"), scansDone, null, prepareSummary, (<>
        <div className="dental-substep">
          <h4 className="dental-substep-title">{t("dental.trimStep")}</h4>
          <p className="blend-hint">{t("dental.trimHint")}</p>
          <div className="dental-trim-buttons" role="group" aria-label={t("dental.trimStep")}>
            {(["upper", "lower"] as const).filter((slot) => slots[slot]).map((slot) => (
              <button key={slot} type="button" disabled={busy || !analysis || !onSculpt} onClick={() => onSculpt?.(slot, "trim")}>
                {t(slot === "upper" ? "dental.trimUpper" : "dental.trimLower")}
              </button>
            ))}
          </div>
          {onRestore && analysis ? (
            <div className="dental-trim-buttons" role="group" aria-label={t("dental.restore")}>
              {(["upper", "lower"] as const).filter((slot) => slots[slot]).map((slot) => (
                <button key={slot} type="button" disabled={busy} title={t("dental.restoreHint")} onClick={() => onRestore(slot)}>
                  {t(slot === "upper" ? "dental.restoreUpper" : "dental.restoreLower")}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="dental-substep">
          <h4 className="dental-substep-title">{t("dental.step2")}</h4>
        <div className="dental-trim-mode" role="radiogroup" aria-label={t("dental.step2")}>
          {(["auto", "manual"] as const).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={(options.margin ?? "auto") === value} className={(options.margin ?? "auto") === value ? "active" : ""} disabled={busy || Boolean(trimming)} onClick={() => onOptionsChange({ margin: value })}>
              {t(value === "auto" ? "dental.marginAuto" : "dental.marginManual")}
            </button>
          ))}
        </div>
        <p className="blend-hint">{t((options.margin ?? "auto") === "auto" ? "dental.marginAutoHint" : "dental.marginManualHint")}</p>
        {(options.margin ?? "auto") === "manual" ? (<>
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
        {/* Build 53: the tooth area, as Medit designates it - picked by Pare 3D, painted on or off by hand. */}
        <div className="dental-trim-mode dental-area-tools" role="radiogroup" aria-label={t("dental.areaTools")}>
          {(["paint", "erase", "lassoAdd", "lassoRemove"] as const).map((tool) => (
            <button key={tool} type="button" role="radio" aria-checked={areaTool?.tool === tool && areaTool.slot === arch} className={areaTool?.tool === tool && areaTool.slot === arch ? "active" : ""} disabled={busy || !slots[arch] || !analysis || areaBusy} onClick={() => onAreaTool(arch, areaTool?.tool === tool && areaTool.slot === arch ? null : tool)}>
              {t(`dental.area.${tool}`)}
            </button>
          ))}
        </div>
        {areaTool?.tool === "paint" || areaTool?.tool === "erase" ? (
          <EdgeModifierSlider label={t("dental.brushSize")} value={brushSize} min={4} max={80} step={1} workspace={workspace} disabled={busy} onChange={onBrushSize} />
        ) : null}
        <EdgeModifierSlider label={t("dental.expand")} value={options.gum ?? 3} min={0.5} max={10} step={0.5} workspace={workspace} length disabled={busy} onChange={(value) => onOptionsChange({ gum: value })} />
        {onAreaShown ? (
          <label className="edge-modifier-check">
            <input type="checkbox" checked={areaShown} onChange={(event) => onAreaShown(event.target.checked)} /> {t("dental.areaShown")}
          </label>
        ) : null}
        <div className="dental-trim-buttons">
          <button type="button" disabled={busy || !slots[arch] || areaBusy} onClick={() => onResetArea(arch)}>{t("dental.areaReset")}</button>
          {onSculpt ? <button type="button" disabled={busy || !slots[arch] || areaBusy} onClick={() => onSculpt(arch)}>{t("dental.sculpt")}</button> : null}
        </div>
        {areaBusy ? <p className="dental-status" role="status"><LoaderCircle className="edge-modifier-spinner" size={15} /> {t("dental.areaFinding")}</p> : <p className="blend-hint">{t("dental.areaInfo")}</p>}
        </>) : null}
        </div>
      </>))}

      {card(3, t("dental.step3"), scansDone, t("dental.step3Hint"), modelSummary, (<>
        <div className="dental-presets" role="radiogroup" aria-label={t("dental.purpose")}>
          {([
            ["study", t("dental.study"), t("dental.studyHint")],
            ["ortho", t("dental.ortho"), t("dental.orthoHint")],
            ["aligner", t("dental.aligner"), t("dental.alignerHint")],
            ["crown", t("dental.crown"), t("dental.crownHint")],
          ] as const).map(([value, label, hint]) => (
            <button key={value} type="button" role="radio" aria-checked={preset === value} className={preset === value ? (custom ? "active custom" : "active") : ""} disabled={busy} onClick={() => onPresetChange(value)}>
              {/* Build 66: the base each choice makes, from above. */}
              <BaseStylePicture style={({ study: "clean", ortho: "ortho", aligner: "follow", crown: "plate" } as const)[value]} />
              <strong>{label}</strong>
              <span>{hint}</span>
            </button>
          ))}
        </div>
        <p className="dental-summary" data-testid="dental-summary">{t("dental.summary", { base: baseName(options.baseStyle), inside: insideName, height: height.toFixed(1) })}</p>
        {custom ? <p className="blend-hint dental-custom">{t("dental.customHint")}</p> : null}
        <h4 className="dental-group">{t("dental.inside")}</h4>
        {choice(t("dental.inside"), options.inside, [["solid", t("dental.solid")], ["open", t("dental.hollowOpen")], ["closed", t("dental.hollowClosed")]] as Array<[DentalInside, string]>, (inside) => onOptionsChange({ inside }), undefined, false)}
        {options.inside !== "solid" ? (
          <>
            <EdgeModifierSlider label={t("dental.wall")} value={options.wall} min={DENTAL_MIN_WALL} max={DENTAL_MAX_WALL} step={0.1} coarse={{ step: 0.5, max: DENTAL_MAX_WALL }} workspace={workspace} length disabled={busy} onChange={(value) => onOptionsChange({ wall: value })} />
            {choice(t("dental.infill"), options.infill ?? "honeycomb", [["none", t("dental.infillNone")], ["base", t("dental.infillBase")], ["honeycomb", t("dental.infillFull")]] as Array<[DentalInfill, string]>, (infill) => onOptionsChange({ infill }), t("dental.infillHint"))}
          </>
        ) : null}
        <p className="blend-hint">{t(options.inside === "solid" ? (options.baseStyle === "ortho" ? "dental.orthoNote" : options.baseStyle === "plate" ? "dental.crownNote" : "dental.solidNote") : options.inside === "open" ? "dental.hollowNote" : "dental.closedNote")}</p>
      </>))}

      {card(4, t("dental.stepBase"), scansDone, t("dental.stepBaseHint"), baseSummary, (<>
        {/* Build 66: each base as it looks from above. */}
        <div className="dental-picture-tiles" role="radiogroup" aria-label={t("dental.baseStyle")}>
          {([["clean", t("dental.cleanBase")], ["follow", t("dental.follow")], ["plate", t("dental.plate")], ["ortho", t("dental.orthoBase")], ["articulator", t("dental.articulatorBase")]] as Array<[DentalBaseStyle, string]>).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={options.baseStyle === value} className={options.baseStyle === value ? "active" : ""} disabled={busy} onClick={() => onOptionsChange({ baseStyle: value })}>
              <BaseStylePicture style={value} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        {options.baseStyle !== "articulator" ? (
          <label className="edge-modifier-check" title={t("dental.bevelHint")}>
            <input type="checkbox" checked={options.bevel !== false} disabled={busy} onChange={(event) => onOptionsChange({ bevel: event.currentTarget.checked })} />
            <span>{t("dental.bevel")}</span>
          </label>
        ) : null}
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

        {/* Build 64: the model's height in one place, as it stacks up - the teeth (never cut), the gum
            kept below them, and the base - with a picture of the three and their sizes. Both arches. */}
        <div className="dental-height-box" role="group" aria-label={t("dental.heightTitle")}>
          <svg className="dental-height-figure" viewBox="0 0 64 120" aria-hidden="true">
            {(() => {
              const total = Math.max(1, teethHeight + gumHeight + options.base);
              const scale = 108 / total;
              const tH = teethHeight * scale, gH = gumHeight * scale, bH = options.base * scale;
              return (
                <>
                  <path className="teeth" d={`M8 ${6 + tH} L8 10 Q14 2 20 10 Q26 2 32 10 Q38 2 44 10 Q50 2 56 10 L56 ${6 + tH} Z`} />
                  <rect className="gum" x="6" y={6 + tH} width="52" height={Math.max(0.5, gH)} />
                  <rect className="base" x="2" y={6 + tH + gH} width="60" height={Math.max(0.5, bH)} />
                </>
              );
            })()}
          </svg>
          <div className="dental-height-rows">
            <p className="dental-height-row teeth"><span>{t("dental.heightTeeth")}</span><strong>{`${teethHeight.toFixed(1)} mm`}</strong></p>
            <EdgeModifierSlider
              label={t("dental.gumHeight")}
              value={gumHeight}
              min={following ? 0.5 : 0}
              max={following ? 10 : Math.max(0.1, maxKeep - minKeep)}
              step={0.1}
              coarse={{ step: 0.5, max: following ? 10 : Math.max(0.5, maxKeep - minKeep) }}
              workspace={workspace}
              length
              disabled={busy || !analysis}
              onChange={(value) => onOptionsChange(following ? { gum: value } : { keep: minKeep + value })}
            />
            <EdgeModifierSlider label={t(options.baseStyle === "ortho" ? "dental.orthoHeight" : "dental.base")} value={options.base} min={DENTAL_MIN_BASE} max={DENTAL_MAX_BASE} step={0.5} coarse={{ step: 0.5, max: 20 }} workspace={workspace} length disabled={busy} onChange={(value) => onOptionsChange({ base: value })} />
            {options.baseStyle !== "ortho" ? (
              <div className="shell-opening-options dental-base-presets" role="radiogroup" aria-label={t("dental.basePresets")} title={t("dental.basePresetsHint")}>
                {[3, 5, 10, 15].map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={Math.abs(options.base - value) < 1e-6} className={Math.abs(options.base - value) < 1e-6 ? "active" : ""} disabled={busy} onClick={() => onOptionsChange({ base: value })}>{`${value} mm`}</button>
                ))}
              </div>
            ) : null}
            <p className="dental-height-row total"><span>{t("dental.heightTotal")}</span><strong>{`${height.toFixed(1)} mm`}</strong></p>
          </div>
        </div>
        <p className="blend-hint">{t("dental.gumHeightHint")}</p>
        <button type="button" className={`dental-more ${advanced ? "open" : ""}`} aria-expanded={advanced} onClick={() => onAdvancedChange(!advanced)}>
          <ChevronDown size={15} /> {t("dental.moreScan")}
        </button>
        {advanced ? (
          <div className="dental-advanced">
            <label className="edge-modifier-check">
              <input type="checkbox" checked={following} disabled={busy} onChange={(event) => onOptionsChange({ gum: event.currentTarget.checked ? 3 : null })} />
              <span>{t("dental.gumFollow")}</span>
            </label>
            {choice(t("dental.smooth"), options.smooth ?? "low", [["off", t("dental.smooth.off")], ["low", t("dental.smooth.low")], ["high", t("dental.smooth.high")]], (smooth) => onOptionsChange({ smooth }))}

          </div>
        ) : null}
      </>))}

      {pair ? card(5, t("dental.step4"), options.hinge, t("dental.step4Hint"), articSummary, (<>
            <label className="edge-modifier-check dental-hinge-check" title={t("dental.hingeHint")}>
              <input type="checkbox" checked={options.hinge} disabled={busy} onChange={(event) => {
                const on = event.currentTarget.checked;
                // Build 60: the fit found with the hinge fit test, once there is one.
                const mine = readMyHingeFit();
                onOptionsChange({ hinge: on, ...(on && options.hingeFit === undefined && mine !== null ? { hingeFit: mine } : {}) });
              }} />
              <span>{t("dental.hinge")}</span>
            </label>
            {options.hinge ? (
              <div className="dental-hinge-options">
                {/* Build 66: the articulator from the side, drawn from the settings below as they change. */}
                <ArticulatorPicture joint={options.hingeJoint ?? "ball"} condyle={options.condyle ?? 0} stop={options.incisalStop !== false} pinRaise={options.incisalStop !== false ? options.pinRaise ?? 0 : 0} table={options.incisalTable ?? "flat"} />
                <span className="edge-modifier-label">{t("dental.hingeJoint")}</span>
                <div className="dental-picture-tiles joints" role="radiogroup" aria-label={t("dental.hingeJoint")} title={t("dental.hingeJointHint")}>
                  {([["ball", t("dental.hingeJointBall")], ["dropin", t("dental.hingeJointDropIn")], ["axle", t("dental.hingeJointAxle")]] as const).map(([value, label]) => (
                    <button key={value} type="button" role="radio" aria-checked={(options.hingeJoint ?? "ball") === value} className={(options.hingeJoint ?? "ball") === value ? "active" : ""} disabled={busy} onClick={() => onOptionsChange({ hingeJoint: value })}>
                      <JointPicture joint={value} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                <p className="blend-hint">{t("dental.hingeJointHint")}</p>
                {/* Fork (build 58): how tight the hinge turns; build 60: and a test to find it. */}
                <label className="dental-label-field" title={t("dental.hingeFitHint")}>
                  <span>{t("dental.hingeFit")}</span>
                  <select value={options.hingeFit ?? HINGE_CLEARANCE} disabled={busy} onChange={(event) => { const fit = Number(event.currentTarget.value); saveMyHingeFit(fit); onOptionsChange({ hingeFit: fit }); }}>
                    {HINGE_FITS.map((fit) => <option key={fit} value={fit}>{t(fit === HINGE_CLEARANCE ? "dental.hingeFitDefault" : "dental.hingeFitOption", { fit: String(fit) })}</option>)}
                  </select>
                </label>
                {onHingeTest ? (
                  <p className="blend-hint dental-hinge-test">
                    {t("dental.hingeTestHint")}{" "}
                    <button type="button" className="link-button" disabled={busy} onClick={onHingeTest}>{t("dental.hingeTest")}</button>
                  </p>
                ) : null}
                <label className="dental-label-field" title={t("dental.condyleHint")}>
                  <span>{t("dental.condyle")}</span>
                  <select value={options.condyle ?? 0} disabled={busy} onChange={(event) => onOptionsChange({ condyle: Number(event.currentTarget.value) })}>
                    {HINGE_CONDYLE_ANGLES.map((angle) => <option key={angle} value={angle}>{angle === 0 ? t("dental.condyleOff") : t("dental.condyleOption", { angle })}</option>)}
                  </select>
                </label>
                {(options.condyle ?? 0) > 0 ? <p className="blend-hint">{t("dental.condyleHint")}</p> : null}
                <label className="edge-modifier-check" title={t("dental.incisalStopHint")}>
                  <input type="checkbox" checked={options.incisalStop !== false} disabled={busy} onChange={(event) => onOptionsChange({ incisalStop: event.currentTarget.checked })} />
                  <span>{t("dental.incisalStop")}</span>
                </label>
                {options.incisalStop !== false ? (
                  <>
                    {/* Build 71: 0 (the scanned bite) to 10 mm open at the pin, in half millimetres. */}
                    <EdgeModifierSlider label={t("dental.pinRaise")} value={options.pinRaise ?? 0} min={0} max={INCISAL_PIN_MAX} step={INCISAL_PIN_STEP} workspace={workspace} length disabled={busy} onChange={(value) => onOptionsChange({ pinRaise: Math.max(0, Math.min(INCISAL_PIN_MAX, Math.round(value / INCISAL_PIN_STEP) * INCISAL_PIN_STEP)) })} />
                    <p className="blend-hint">{(options.pinRaise ?? 0) > 0 ? t("dental.pinRaiseOpenHint") : t("dental.pinRaiseZeroHint")}</p>
                    {choice(t("dental.incisalTable"), options.incisalTable ?? "flat", [["flat", t("dental.incisalTableFlat")], ["guide", t("dental.incisalTableGuide")]], (incisalTable) => onOptionsChange({ incisalTable }), t("dental.incisalTableHint"))}
                  </>
                ) : null}
              </div>
            ) : null}
            {choice(t("dental.layout"), options.layout, [["print", t("dental.layoutPrint")], ["occlusion", t("dental.layoutOcclusion")]], (layout) => onOptionsChange({ layout }))}
      </>)) : null}

      {card(pair ? 6 : 5, t("dental.stepName"), Boolean(options.label.trim()) || patientDetails === "remove", t("dental.stepNameHint"), nameSummary, (<>
        {onPatientDetails ? choice(t("dental.patientDetails"), patientDetails, [["keep", t("dental.patientKeep")], ["remove", t("dental.patientRemove")]], onPatientDetails, t("dental.patientDetailsHint")) : null}
        {patientDetails === "remove" ? <p className="blend-hint">{t("dental.patientRemoveHint")}</p> : (<>
        <label className="dental-label-field">
          <span>{t("dental.label")}</span>
          <input type="text" maxLength={24} value={options.label} placeholder={t("dental.labelPlaceholder")} disabled={busy} onChange={(event) => onOptionsChange({ label: event.currentTarget.value })} />
        </label>
        {options.label.trim() ? <p className="blend-hint">{t(options.baseStyle === "ortho" || options.baseStyle === "articulator" ? "dental.labelOrtho" : options.inside === "open" ? "dental.labelClosed" : "dental.labelPlate")}</p> : null}
        </>)}
      </>))}

      {notes.map((note) => <p key={note} className="dental-status warn" role="status">{note}</p>)}
      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : null}
      {nextStep ? <p className="dental-next" role="status">{nextStep}</p> : null}
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
