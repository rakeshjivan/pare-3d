"use client";

import type { BiteContactStats } from "@/lib/biteContacts";
import { PIN_MAX, PIN_STEP, PIN_WARN, articulatorPinPatch } from "@/lib/dentalArticulator";

/** Build 78: a bite scan further than this from the scanner's bite (mm RMS) is pointed out. */
/** Build 79: the bite scan's own error is often 0.2-0.3 mm; only well beyond that is the kept bite questioned. */
const BITE_KEPT_CHECK = 0.5;

import { ArrowLeft, ArrowLeftRight, ArrowRight, Check, ChevronDown, FileDown, FilePlus2, LoaderCircle, Redo2, Undo2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { ArticulatorPicture, BaseStylePicture, ModelHeightPicture } from "@/components/workplane/DentalPictures";
import { WaxupCard, waxupSummary, type WaxupActions, type WaxupPart, type WaxupView } from "@/components/workplane/WaxupCard";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import {
  DENTAL_MAX_BASE, DENTAL_MAX_WALL, DENTAL_MIN_BASE, DENTAL_MIN_WALL,
  type DentalAnalysis, type DentalBaseStyle, type DentalInfill, type DentalInside, type DentalStudioOptions,
} from "@/lib/dentalModel";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

export type DentalPreset = "study" | "ortho" | "aligner" | "crown";
export type DentalSlot = "upper" | "lower" | "bite" | "bite2";

/**
 * The settings each preset starts from (docs/plans/dental-scan-to-model.md, Clinical specifications).
 * `depth` is how deep the anatomy runs below the occlusal plane (flaps and scan tails ignored), mm.
 */
/** Build 77: the Model Builder Guide, shipped with the app (made from the guide's own pages and screens). */
export const DENTAL_GUIDE_FILE = "Pare-3D-Model-Builder-Guide.pdf";
const DENTAL_GUIDE_PDF = `downloads/${DENTAL_GUIDE_FILE}`;

export function dentalPreset(preset: DentalPreset, depth: number, pair: boolean, above = 0, teeth = 0): DentalStudioOptions {
  const common = { label: "", hinge: false, layout: "print" as const, wall: 2 };
  if (preset === "ortho") {
    // The trimmed base is about a third of the model's height (the art portion), the anatomy two thirds.
    // Build 78: records keep the scans whole - no soft tissue trimmed (the ABO counts any change as altered records).
    return { ...common, keep: null, base: Math.round(Math.max(6, Math.min(15, depth / 2))), baseStyle: "ortho", inside: "solid", layout: pair ? "occlusion" : "print", relief: false };
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
type WaxStepId = "scans" | "trim" | "find" | "choose" | "set" | "place" | "adjust" | "occlusion" | "make";

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
  onCancel,
  patientDetails = "keep",
  onPatientDetails,
  onNewPatient,
  modelsHere = false,
  layout,
  onLayout,
  biteMap = null,
  onBiteMap,
  onFitBite,
  biteLocked = false,
  onRestore,
  areaShown = true,
  onAreaShown,
  waxup,
  waxStudio,
  onEditDesign,
  onDone,
  editing = false,
}: {
  parts: DentalPartChoice[];
  slots: Record<DentalSlot, string | null>;
  stage: "analysing" | "ready" | "making" | "trimming" | "made";
  /** Build 79: after Make - open the design again, or finish. */
  onEditDesign?: () => void;
  onDone?: () => void;
  /** Build 79: a design opened again: Make makes the models anew, in place of the ones made before. */
  editing?: boolean;
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
  /** Build 84: the bite contacts & clearance map (in occlusion). */
  biteMap?: { on: boolean; busy: boolean; upper?: BiteContactStats; lower?: BiteContactStats; error?: string } | null;
  onBiteMap?: (on: boolean) => void;
  /** Build 78: line the arches up on the bite scan instead of keeping the scanner's bite. */
  onFitBite?: () => void;
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
  onCancel: () => void;
  /** Build 71: whether the made models keep the patient's details (scan names, label) or lose them. */
  patientDetails?: "keep" | "remove";
  onPatientDetails?: (value: "keep" | "remove") => void;
  /** Build 71: a new design with the Studio open, so the next patient's scans start on their own. */
  onNewPatient?: () => void;
  /** Build 71: this design already holds models made here. */
  modelsHere?: boolean;
  /** Build 79: the wax-up step. */
  waxup?: { view: WaxupView; actions: WaxupActions };
  /** Build 94: open as Wax-up Studio - the workflow (wax-up only, or IMT with its index models) and the arches waxed. */
  waxStudio?: { flow: "waxup" | "imt"; arches: "upper" | "lower" | "both"; onFlow: (flow: "waxup" | "imt") => void; onArches: (arches: "upper" | "lower" | "both") => void };
}) {
  useLanguage();
  const title = t(waxStudio ? "waxStudio.title" : "dental.title");
  const [chosenArch, setArch] = useState<"upper" | "lower">("upper");
  const [folded, setFolded] = useState<Record<number, boolean>>({});
  const [activeCard, setActiveCard] = useState(1);
  // Build 75: a step after the first ticks once it has been worked in - its defaults alone are not a check.
  const [visited, setVisited] = useState<Record<number, boolean>>({});
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
    // Build 78: the scanner's bite, kept as it was exported; how far the bite scan stands from it.
    // Build 79: no figure (a dentist cannot judge a residual in mm, and the bite scan's own error is in it);
    // lining up again is offered only when the bite scan clearly disagrees.
    if (bite?.kept) return bite.rms > BITE_KEPT_CHECK ? { text: t(slots.bite2 ? "dental.biteKeptCheck2" : "dental.biteKeptCheck"), warn: true, fit: true } : { text: t("dental.biteKept"), warn: false };
    if (bite && !bite.fitted) return { text: t("dental.biteFailed"), warn: true };
    if (bite) return { text: t(slots.bite2 ? "dental.biteFitted2" : "dental.biteFitted"), warn: false };
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
  // Build 77: the step to do next has a green outline - once the scans are in, the first step not
  // yet worked in (a step may be left as it is: having been in it is enough, the articulator too).
  // Build 80: without the wax-up (test builds only) its card is left out and the cards after it move up.
  const n = (k: number) => (waxup || k < 3 ? k : k - 1);
  const stepCount = (pair ? 7 : 6) - (waxup ? 0 : 1);
  // Build 79: the wax-up (card 3) is optional - never the step pointed to next.
  const nextCard = scansDone ? Array.from({ length: stepCount - 1 }, (_, k) => k + 2).find((number) => (!waxup || Boolean(waxStudio) || number !== 3) && !visited[number]) ?? null : null;
  /**
   * Build 101: Wax-up Studio one step at a time - Scans, Trim, Find teeth, Choose teeth, Library set,
   * Place, Adjust, Occlusion (with both arches waxed), Make - with Back and Next. Entering Find teeth the
   * first time runs straight through to the teeth placed (the teeth found, canine to canine chosen, the
   * first library set for the arch, placed on the teeth): you adjust from there.
   */
  const waxSteps: WaxStepId[] | null = waxStudio && waxup ? ["scans", "trim", "find", "choose", "set", "place", "adjust", ...(waxup.view.occlusion.ready ? ["occlusion" as const] : []), "make"] : null;
  const [waxStepId, setWaxStepId] = useState<WaxStepId>("scans");
  const waxStep = waxSteps ? (waxSteps.includes(waxStepId) ? waxStepId : "make") : null;
  const wv = waxup?.view;
  const waxSetsHere = wv ? wv.builtIn.filter((set) => !set.arch || set.arch === wv.slot) : [];
  const waxPlaceable = Boolean(wv?.setName) && (wv?.fit === "teeth" && wv?.found?.length ? (wv?.chosen.length ?? 0) > 0 : wv?.marked === 3);
  const waxStepDone = (id: WaxStepId): boolean => {
    if (!wv) return false;
    switch (id) {
      case "scans": return scansDone;
      case "find": return Boolean(wv.found?.length);
      case "choose": return wv.chosen.length > 0;
      // Build 103: and made for this arch (an upper set is no set for the lower teeth).
      case "set": { const arch = wv.builtIn.find((set) => set.id === wv.setId)?.arch; return Boolean(wv.setName) && (!arch || arch === wv.slot); }
      case "place": return wv.placed.length > 0;
      case "adjust": return wv.stage === "adapted" && wv.placed.length > 0 && !wv.busy;
      default: return true;
    }
  };
  const waxIndex = waxSteps && waxStep ? waxSteps.indexOf(waxStep) : -1;
  const goWax = (id: WaxStepId) => setWaxStepId(id);
  // Build 103: Position shows the whole library teeth; from Adapt on they are fitted to the patient's.
  useEffect(() => {
    if (!waxStep || !waxup) return;
    const adapted = ["adjust", "occlusion", "make"].includes(waxStep);
    if ((waxup.view.stage === "adapted") !== adapted) waxup.actions.onStage(adapted ? "adapted" : "position");
  }, [waxStep]); // eslint-disable-line react-hooks/exhaustive-deps
  // Straight through from Find teeth to the teeth placed, once per arch.
  const [waxAuto, setWaxAuto] = useState(false);
  const waxAutoDone = useRef(new Set<string>());
  const waxAutoTried = useRef(new Set<string>());
  useEffect(() => {
    if (!waxStep || !wv || !waxup) return;
    // The other arch chosen further on, with nothing placed on it yet: back to Find teeth for it.
    const past = ["choose", "set", "place", "adjust", "occlusion", "make"].includes(waxStep);
    if (past && !wv.placed.length && !waxAutoDone.current.has(wv.slot)) { setWaxStepId("find"); return; }
    if (waxStep === "find" && !waxAutoDone.current.has(wv.slot)) { waxAutoDone.current.add(wv.slot); setWaxAuto(true); }
  }, [waxStep, wv?.slot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!waxAuto || !waxStep || !wv || !waxup || busy || wv.busy || wv.finder.busy) return;
    const once = (what: string, run: () => void) => { const key = `${wv.slot}:${what}`; if (waxAutoTried.current.has(key)) return false; waxAutoTried.current.add(key); run(); return true; };
    const next = () => { const i = waxSteps!.indexOf(waxStep); if (i >= 0 && i + 1 < waxSteps!.length) setWaxStepId(waxSteps![i + 1]); };
    if (waxStep === "find") { if (waxStepDone("find")) next(); else if (!once("find", waxup.actions.onFindTeeth)) setWaxAuto(false); return; }
    if (waxStep === "choose") { if (waxStepDone("choose")) next(); else if (!once("choose", () => waxup.actions.onChooseGroup("front"))) setWaxAuto(false); return; }
    if (waxStep === "set") { if (waxStepDone("set")) next(); else if (!waxSetsHere.length || !once("set", () => waxup.actions.onBuiltIn(waxSetsHere[0].id))) setWaxAuto(false); return; }
    // Build 103: the run stops at Position - the dentist confirms the teeth before they are fitted.
    if (waxStep === "place") { if (waxStepDone("place")) setWaxAuto(false); else if (!waxPlaceable || !once("place", waxup.actions.onPlace)) setWaxAuto(false); return; }
    setWaxAuto(false);
  }, [waxAuto, waxStep, busy, wv?.busy, wv?.finder.busy, wv?.found?.length, wv?.chosen.length, wv?.setName, wv?.placed.length, wv?.slot]); // eslint-disable-line react-hooks/exhaustive-deps
  const waxStepper = waxSteps && waxStep && wv && waxup ? (
    <div className="wax-stepper">
      <ol className="wax-steps" aria-label={t("waxStudio.steps")}>
        {waxSteps.map((id, i) => {
          const reachable = i <= waxIndex || waxSteps.slice(0, i).every((prev) => waxStepDone(prev));
          return (
            <li key={id}>
              <button type="button" aria-current={id === waxStep ? "step" : undefined} className={`${id === waxStep ? "current" : ""}${i < waxIndex && waxStepDone(id) ? " done" : ""}`} disabled={!reachable || stage === "making"} onClick={() => { setWaxAuto(false); goWax(id); }}>
                <span className="wax-step-number" aria-hidden="true">{i < waxIndex && waxStepDone(id) ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
                <span className="wax-step-label">{t(`waxStudio.step.${id}` as "waxStudio.step.scans")}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="wax-step-head">
        <strong>{t("waxStudio.stepOf", { n: waxIndex + 1, count: waxSteps.length, name: t(`waxStudio.step.${waxStep}` as "waxStudio.step.scans") })}</strong>
        <span className="wax-step-undo">
          <button type="button" className="icon-button" title={t("waxup.undo")} aria-label={t("waxup.undo")} disabled={!wv.canUndo || wv.busy} onClick={waxup.actions.onUndo}><Undo2 size={16} /></button>
          <button type="button" className="icon-button" title={t("waxup.redo")} aria-label={t("waxup.redo")} disabled={!wv.canRedo || wv.busy} onClick={waxup.actions.onRedo}><Redo2 size={16} /></button>
        </span>
      </div>
      <p className="blend-hint">{t(`waxStudio.stepHint.${waxStep}` as "waxStudio.stepHint.scans")}</p>
      {waxAuto ? <p className="dental-status" role="status"><LoaderCircle className="edge-modifier-spinner" size={15} /> {t("waxStudio.auto")} <button type="button" className="link-button" onClick={() => setWaxAuto(false)}>{t("waxStudio.autoStop")}</button></p> : null}
    </div>
  ) : null;
  const waxStepButtons = waxSteps && waxStep ? (
    <div className="wax-step-nav">
      <button type="button" className="secondary" disabled={waxIndex <= 0 || stage === "making"} onClick={() => { setWaxAuto(false); goWax(waxSteps[waxIndex - 1]); }}><ArrowLeft size={16} /> {t("waxStudio.back")}</button>
      {waxStep !== "make" ? (
        <button type="button" className="primary" disabled={!waxStepDone(waxStep) || busy || Boolean(wv?.busy)} onClick={() => goWax(waxSteps[waxIndex + 1])}>{t("waxStudio.next")} <ArrowRight size={16} /></button>
      ) : null}
    </div>
  ) : null;
  const inWaxStep = (id: WaxStepId) => !waxSteps || waxStep === id;
  const waxPart: WaxupPart | null = waxStep && ["find", "choose", "set", "place", "adjust", "occlusion"].includes(waxStep) ? waxStep as WaxupPart : null;
  const card = (number: number, label: string, done: boolean, hint: string | null, summary: string | null, body: ReactNode) => {
    const isFolded = !waxSteps && Boolean(folded[number]);
    return (
      <section className={`dental-section dental-card${isFolded ? " folded" : ""}${activeCard === number ? " current" : ""}${nextCard === number ? " next" : ""}`} aria-label={label} onPointerDownCapture={() => { setActiveCard(number); if (!visited[number]) setVisited((state) => ({ ...state, [number]: true })); }}>
        <button type="button" className="dental-card-head" aria-expanded={!isFolded} onClick={() => setFolded((state) => ({ ...state, [number]: !isFolded }))}>
          {step(number, label, done && (number === 1 || Boolean(visited[number])), isFolded ? null : hint)}
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
    ? [slots.upper ? t("dental.upper") : null, slots.lower ? t("dental.lower") : null, slots.bite ? t("dental.bite") : null, slots.bite2 ? t("dental.bite2") : null].filter(Boolean).join(" + ") + (biteLocked ? ` - ${t("dental.summaryLocked")}` : "")
    : null;
  const prepareSummary = scansDone ? t((options.margin ?? "auto") === "auto" ? "dental.marginAuto" : "dental.marginManual") : null;
  const modelSummary = `${presetName}${custom ? ` (${t("dental.custom")})` : ""} - ${insideName}`;
  const baseSummary = t("dental.summary", { base: baseName(options.baseStyle), inside: insideName, height: height.toFixed(1) });
  const articSummary = options.hinge ? (options.incisalPin === false ? t("dental.summaryNoPin") : t("dental.hinge")) : t("dental.summaryNoHinge");
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
          <span>{t(waxStudio ? "waxStudio.subtitle" : "dental.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          {/* Build 77: the Model Builder Guide as a PDF, to keep, print or pass on. */}
          <a className="dental-guide-download" href={DENTAL_GUIDE_PDF} download={DENTAL_GUIDE_FILE} aria-label={t("dental.guidePdf")} title={t("dental.guidePdf")}><FileDown size={18} /></a>
          <GuideHelpLink section="dentalModel" />
          <button type="button" aria-label={t("common.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      {/* Build 79: the models made - the studio stays open on them: open the design again, or finish. */}
      {stage === "made" ? (
        <div className="dental-made">
          <p className="dental-status" role="status"><Check size={15} /> {t("dental.madeHere")}</p>
          <p className="blend-hint">{t("dental.madeHint")}</p>
          <p className="dental-status warn" role="note">{t("export.dentalLayers")}</p>
          <div className="edge-modifier-footer">
            <button type="button" className="secondary" onClick={onEditDesign}>{t("dental.editDesign")}</button>
            <button type="button" className="primary" onClick={onDone}><Check size={17} /> {t("dental.doneButton")}</button>
          </div>
        </div>
      ) : (<>
      {/* Build 94: Wax-up Studio's two choices, above the steps: the workflow and the arches. */}
      {waxStepper}
      {waxStudio && inWaxStep("scans") ? (
        <div className="wax-studio-choices">
          {choice(t("waxStudio.flow"), waxStudio.flow, [["waxup", t("waxStudio.flowWaxup")], ["imt", t("waxStudio.flowImt")]], waxStudio.onFlow, t("waxStudio.flowHint"))}
          {choice(t("waxStudio.arches"), waxStudio.arches, [["upper", t("dental.upper")], ["lower", t("dental.lower")], ["both", t("waxStudio.both")]], waxStudio.onArches)}
          <p className="blend-hint">{t(waxStudio.flow === "imt" ? "waxStudio.imtHint" : "waxStudio.waxupHint")}</p>
        </div>
      ) : null}
      {/* Build 75: the Studio in step cards - scans, preparing them (trim, then the teeth), what the model
          is for, its base, the articulator (a pair), its name. A card folds to one line; the one last
          worked in is marked. */}
      {inWaxStep("scans") ? card(1, t("dental.step1"), scansDone, t("dental.step1Hint"), scansSummary, (<>
        <div className="dental-slots">
          {parts.length === 0 ? <p className="dental-status" role="status">{t("dental.noScans")}</p> : null}
          {parts.length === 0 ? <a className="dental-guide-link" href={DENTAL_GUIDE_PDF} download={DENTAL_GUIDE_FILE}><FileDown size={15} aria-hidden="true" /> {t("dental.guidePdfFirst")}</a> : null}
          <div className={onNewPatient ? "dental-import-row" : undefined}>
            <button type="button" className="dental-import" disabled={stage === "making"} onClick={onImport}><Upload size={15} /> {t("dental.import")}</button>
            {onNewPatient ? <button type="button" className="dental-import dental-new-patient" disabled={stage === "making"} title={t("dental.newPatientHint")} onClick={onNewPatient}><FilePlus2 size={15} /> {t("dental.newPatient")}</button> : null}
          </div>
          {modelsHere ? <p className="dental-status warn" role="status">{t("dental.modelsHere")}</p> : null}
          {slotRow("upper", t("dental.upper"), archInfo("upper"))}
          <button type="button" className="dental-swap" title={t("dental.swap")} aria-label={t("dental.swap")} disabled={busy || (!slots.upper && !slots.lower)} onClick={onSwap}><ArrowLeftRight size={15} /></button>
          {slotRow("lower", t("dental.lower"), archInfo("lower"))}
          {slotRow("bite", t("dental.bite"), null)}
          {/* Build 79: a second bite scan - one each side aligns the whole arch best. */}
          {slots.bite || slots.bite2 ? slotRow("bite2", t("dental.bite2"), null) : null}
          {stage === "analysing" ? <p className="dental-status" role="status"><LoaderCircle className="edge-modifier-spinner" size={15} /> {t("dental.analysing")}</p> : null}
          {pairLine ? <p className={`dental-status ${pairLine.warn ? "warn" : ""}`} role="status">{pairLine.text}{"fit" in pairLine && onFitBite ? <>{" "}<button type="button" className="link-button" disabled={busy} onClick={onFitBite}>{t(slots.bite2 ? "dental.fitBite2" : "dental.fitBite")}</button></> : null}</p> : null}
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
          {/* Build 84: the bite contacts & clearance map, in occlusion. */}
          {onBiteMap && analysis && slots.upper && slots.lower ? (
            <div className="dental-bite-map">
              <label className="edge-modifier-check" title={t("dental.biteMapHint")}>
                <input type="checkbox" checked={Boolean(biteMap?.on)} disabled={busy} onChange={(event) => onBiteMap(event.currentTarget.checked)} />
                <span>{t("dental.biteMap")}</span>
              </label>
              {biteMap?.on ? <p className="blend-hint">{t("dental.biteMapNote")}</p> : null}
            </div>
          ) : null}
        </div>
      </>)) : null}

      {inWaxStep("trim") ? card(2, t("dental.step2Prepare"), scansDone, null, prepareSummary, (<>
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
      </>)) : null}

      {/* Build 79: the digital wax-up - optional; a card of its own before the model is chosen. */}
      {/* Build 101: in Wax-up Studio's steps, the step's own part of it, on its own. */}
      {waxup && waxSteps && waxPart ? (
        <section className="dental-section dental-card current wax-step-body" aria-label={t(`waxStudio.step.${waxPart}` as "waxStudio.step.scans")}>
          <WaxupCard part={waxPart} view={waxup.view} actions={{ ...waxup.actions, onConfirm: () => { setWaxAuto(false); goWax("adjust"); } }} slots={{ upper: Boolean(slots.upper) && waxStudio?.arches !== "lower", lower: Boolean(slots.lower) && waxStudio?.arches !== "upper" }} imt={waxStudio?.flow === "imt"} busy={busy || !analysis} workspace={workspace} />
        </section>
      ) : null}
      {waxup && !waxSteps ? card(3, t(waxStudio ? "waxup.stepStudio" : "waxup.step"), waxup.view.placed.length > 0, t(waxStudio ? "waxup.stepStudioHint" : "waxup.stepHint"), waxupSummary(waxup.view), (
        <WaxupCard view={waxup.view} actions={waxup.actions} slots={{ upper: Boolean(slots.upper) && waxStudio?.arches !== "lower", lower: Boolean(slots.lower) && waxStudio?.arches !== "upper" }} imt={waxStudio?.flow === "imt"} busy={busy || !analysis} workspace={workspace} />
      )) : null}

      {inWaxStep("make") ? (<>
      {card(n(4), t("dental.step3"), scansDone, t("dental.step3Hint"), modelSummary, (<>
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

      {card(n(5), t("dental.stepBase"), scansDone, t("dental.stepBaseHint"), baseSummary, (<>
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
          <ModelHeightPicture teeth={teethHeight} gum={gumHeight} base={options.base} />
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
            {choice(t("dental.smooth"), options.smooth ?? "high", [["off", t("dental.smooth.off")], ["low", t("dental.smooth.low")], ["high", t("dental.smooth.high")]], (smooth) => onOptionsChange({ smooth }))}
            {/* Build 78: soft tissue that would stop the models closing is trimmed, as on a cast's heels;
                the orthodontic records preset keeps the scans whole. */}
            {pair ? (
              <>
                <label className="edge-modifier-check" title={t("dental.reliefHint")}>
                  <input type="checkbox" checked={options.relief !== false} disabled={busy} onChange={(event) => onOptionsChange({ relief: event.currentTarget.checked })} />
                  <span>{t("dental.relief")}</span>
                </label>
                <p className="blend-hint">{t(options.relief !== false ? "dental.reliefOn" : "dental.reliefOff")}</p>
              </>
            ) : null}

          </div>
        ) : null}
      </>))}

      {pair ? card(n(6), t("dental.step4"), options.hinge, t("dental.step4Hint"), articSummary, (<>
            <label className="edge-modifier-check dental-hinge-check" title={t("dental.hingeHint")}>
              <input type="checkbox" checked={options.hinge} disabled={busy} onChange={(event) => onOptionsChange({ hinge: event.currentTarget.checked })} />
              <span>{t("dental.hinge")}</span>
            </label>
            {options.hinge ? (
              <div className="dental-hinge-options">
                {/* Build 78: the one articulator - two seats on ball condyles and the incisal pin. */}
                <ArticulatorPicture pinRaise={options.incisalPin === false ? 0 : options.pinRaise ?? 0} pin={options.incisalPin !== false} />
                <p className="blend-hint">{t(options.incisalPin === false ? "dental.articulatorHowNoPin" : (options.pinPlace ?? (waxup?.view.placed.length ? "sides" : "midline")) === "sides" ? "dental.articulatorHowSides" : "dental.articulatorHow")}</p>
                {/* Build 82: the pin can be left out - the condyles alone, closing to the scanned bite. */}
                <label className="edge-modifier-check dental-pin-check" title={t("dental.incisalPinHint")}>
                  <input type="checkbox" checked={options.incisalPin !== false} disabled={busy} onChange={(event) => onOptionsChange(articulatorPinPatch({ incisalPin: event.currentTarget.checked }))} />
                  <span>{t("dental.incisalPin")}</span>
                </label>
                {/* Build 71: 0 (the scanned bite) to 10 mm open at the pin, in half millimetres. Build 82: above 0 turns the pin on. */}
                <EdgeModifierSlider label={t("dental.pinRaise")} value={options.incisalPin === false ? 0 : options.pinRaise ?? 0} min={0} max={PIN_MAX} step={PIN_STEP} workspace={workspace} length disabled={busy} onChange={(value) => onOptionsChange(articulatorPinPatch({ pinRaise: Math.max(0, Math.min(PIN_MAX, Math.round(value / PIN_STEP) * PIN_STEP)) }))} />
                <p className={`blend-hint ${(options.pinRaise ?? 0) > PIN_WARN ? "warn" : ""}`}>{(options.pinRaise ?? 0) > PIN_WARN ? t("dental.pinRaiseWarn", { max: PIN_WARN }) : (options.pinRaise ?? 0) > 0 ? t("dental.pinRaiseOpenHint") : t("dental.pinRaiseZeroHint")}</p>
                {/* Build 79: the pin is part of the lower, at this opening (a removable set waits for a later build). */}
                {options.incisalPin === false ? <p className="blend-hint">{t("dental.incisalPinOffHint")}</p> : (<>
                <p className="blend-hint">{t("dental.pinFusedHint")}</p>
                {/* Build 79: one pin in front of the incisors, or a post each side in the premolar region - the
                    front teeth clear; the default with a wax-up. */}
                {choice(t("dental.pinPlace"), options.pinPlace ?? (waxup?.view.placed.length ? "sides" : "midline"), [["midline", t("dental.pinMidline")], ["sides", t("dental.pinSides")]], (pinPlace) => onOptionsChange({ pinPlace }))}
                <p className="blend-hint">{t((options.pinPlace ?? (waxup?.view.placed.length ? "sides" : "midline")) === "sides" ? "dental.pinSidesHint" : "dental.pinMidlineHint")}</p>
                </>)}
              </div>
            ) : null}
            {choice(t("dental.layout"), options.layout, [["print", t("dental.layoutPrint")], ["occlusion", t("dental.layoutOcclusion")]], (layout) => onOptionsChange({ layout }))}
      </>)) : null}

      {card(n(pair ? 7 : 6), t("dental.stepName"), Boolean(options.label.trim()) || patientDetails === "remove", t("dental.stepNameHint"), nameSummary, (<>
        {onPatientDetails ? choice(t("dental.patientDetails"), patientDetails, [["keep", t("dental.patientKeep")], ["remove", t("dental.patientRemove")]], onPatientDetails, t("dental.patientDetailsHint")) : null}
        {patientDetails === "remove" ? <p className="blend-hint">{t("dental.patientRemoveHint")}</p> : (<>
        <label className="dental-label-field">
          <span>{t("dental.label")}</span>
          <input type="text" maxLength={24} value={options.label} placeholder={t("dental.labelPlaceholder")} disabled={busy} onChange={(event) => onOptionsChange({ label: event.currentTarget.value })} />
        </label>
        {options.label.trim() ? <p className="blend-hint">{t(options.baseStyle === "ortho" || options.baseStyle === "articulator" ? "dental.labelOrtho" : options.inside === "open" ? "dental.labelClosed" : "dental.labelPlate")}</p> : null}
        </>)}
      </>))}
      </>) : null}

      {notes.map((note) => <p key={note} className="dental-status warn" role="status">{note}</p>)}
      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : null}
      {/* Build 77: an error never leaves the person without a next move. */}
      {error ? <p className="dental-status dental-error-help" role="status">{t("dental.errorHelp")}</p> : null}
      {nextStep && (!waxSteps || waxStep === "make") ? <p className="dental-next" role="status">{nextStep}</p> : null}
      {waxStepButtons}
      <div className="edge-modifier-footer">
        {/* Build 79: while making, Cancel stops it. */}
        <button type="button" className="secondary" onClick={onCancel}>{stage === "making" ? t("dental.stopMaking") : t("common.cancel")}</button>
        {!waxSteps || waxStep === "make" ? <button type="button" className="primary" disabled={!ready} onClick={onApply}>
          {stage === "making" ? <LoaderCircle className="edge-modifier-spinner" size={17} /> : <Check size={17} />}
          {stage === "making" ? t("dental.working") : editing ? t("dental.updateModels") : t(pair ? "dental.applyPair" : "dental.apply")}
        </button> : null}
      </div>
      </>)}
      </>)}
    </MovableToolPanel>
  );
}
