"use client";

import type { BiteContactStats } from "@/lib/biteContacts";
import { PIN_CLEAR, PIN_GAP_MAX, PIN_MAX, PIN_STEP, PIN_WARN, articulatorPinPatch } from "@/lib/dentalArticulator";
import { biteOpenings } from "@/lib/waxOcclusion";

/** Build 78: a bite scan further than this from the scanner's bite (mm RMS) is pointed out. */
/** Build 79: the bite scan's own error is often 0.2-0.3 mm; only well beyond that is the kept bite questioned. */
const BITE_KEPT_CHECK = 0.5;

import { ArrowLeft, ArrowLeftRight, ArrowRight, Check, ChevronDown, FileDown, FilePlus2, LoaderCircle, Redo2, Undo2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { setStudioSlot, useStudioSlot } from "@/lib/studioSlots";
const toolSlot = (element: HTMLElement | null) => setStudioSlot("tool", element);
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { EdgeModifierSlider, SmoothSliders } from "@/components/workplane/EdgeModifierPanel";
import { ArticulatorPicture, ArticulatorSidesPicture, BaseStylePicture, ModelHeightPicture } from "@/components/workplane/DentalPictures";
import { WaxupCard, archOrder, defaultMarkTeeth, waxupSummary, type WaxupActions, type WaxupPart, type WaxupView } from "@/components/workplane/WaxupCard";
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
  // Build 107: 3 mm walls when hollow (the accuracy of hollow models falls off below 3 mm - Yurdakurban et al. 2024).
  const common = { label: "", hinge: false, layout: "print" as const, wall: 3 };
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
  // Build 104: hollow with the honeycomb in the base only, by default.
  return { ...common, keep: null, base: 3, baseStyle: "clean", gum: 3, inside: "open", infill: "base" };
}

export type DentalPartChoice = { id: string; name: string };

/** Fork (build 48): the sides an arch can be looked at from. */
export type DentalView = "occlusal" | "front" | "left" | "right" | "lingual";
const DENTAL_VIEWS: readonly DentalView[] = ["occlusal", "front", "left", "right", "lingual"];

export type DentalAreaTool = "paint" | "erase" | "lassoAdd" | "lassoRemove";

/** Fork (build 47): Dental Studio - raw intraoral scans to printable models, one arch or a pair with its bite. */
type ModelStepId = "scans" | "prepare" | "model" | "base" | "articulator" | "label";
type WaxStepId = "scans" | "trim" | "bite" | "margin" | "keep" | "gum" | "select" | "teeth" | "find" | "choose" | "set" | "place" | "adjust" | "occlusion" | "sculpt" | "make";

/** Build 106: a step's explanation, kept behind a small (?) - shown on hover or focus. */
/**
 * Build 106: small cut-through pictures of the model for the frame's Model options - the shell, what
 * fills it, and its base. A section through the arch: teeth along the top, the base along the bottom.
 */
type BodyPicture = "hollow" | "honeycomb" | "solid" | "open" | "honeycombBase";
const BODY_OUTER = "M5 31V14Q8 8 12 10Q15 4 19 8Q24 3 29 8Q33 4 36 10Q40 8 43 14V31Z";
function BodyPictureSvg({ kind }: { kind: BodyPicture }) {
  const id = `hc-${kind}`;
  // The hollow inside the shell, open at the bottom (a 3 mm wall all round, drawn 4 units).
  const inner = "M9 31V16Q12 13 15 14Q19 10 24 12Q29 10 33 14Q36 13 39 16V31Z";
  return (
    <svg className="studio-body-pic" viewBox="0 0 48 34" aria-hidden="true">
      <defs>
        <pattern id={id} width="6" height="5.2" patternUnits="userSpaceOnUse">
          <path d="M1.5 0.2L4.5 0.2L6 2.6L4.5 5L1.5 5L0 2.6Z" fill="none" stroke="currentColor" strokeWidth="0.8" />
        </pattern>
        <clipPath id={`${id}-in`}><path d={inner} /></clipPath>
      </defs>
      <path d={BODY_OUTER} className="studio-body-shell" />
      {kind !== "solid" ? <path d={inner} className="studio-body-hollow" /> : null}
      {kind === "honeycomb" ? <rect x="0" y="0" width="48" height="34" fill={`url(#${id})`} clipPath={`url(#${id}-in)`} className="studio-body-cells" /> : null}
      {kind === "honeycombBase" ? <rect x="0" y="25" width="48" height="6" fill={`url(#${id})`} clipPath={`url(#${id}-in)`} className="studio-body-cells" /> : null}
      <path d="M2 31H46" className="studio-body-ground" />
    </svg>
  );
}

/**
 * Build 106: the model's height in the frame - a cut through a molar: the crown, the gum either side and
 * the base beneath (hatched, as a cut face), the base drawn to its thickness, the heights marked beside.
 */
function StudioHeightPicture({ scan, base, scanLabel, baseLabel }: { scan: number; base: number; scanLabel: string; baseLabel: string }) {
  const baseH = Math.max(12, Math.min(48, (base / Math.max(1, scan + base)) * 120));
  const bottom = 130, baseTop = bottom - baseH;
  const mid = (10 + baseTop) / 2;
  return (
    <svg className="studio-height-pic" viewBox="0 0 280 140" role="img" aria-label={`${scanLabel} ${scan.toFixed(1)} mm, ${baseLabel} ${base.toFixed(1)} mm`}>
      <defs>
        <linearGradient id="shp-tooth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fdfbf5" /><stop offset="1" stopColor="#e4dbc6" /></linearGradient>
        <linearGradient id="shp-gum" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f1b8b1" /><stop offset="1" stopColor="#d98d88" /></linearGradient>
        <pattern id="shp-cut" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V6" stroke="#7489a6" strokeWidth="0.9" /></pattern>
      </defs>
      <path d={`M40 ${baseTop}V60Q44 44 60 42Q66 42 68 50V${baseTop}Z`} fill="url(#shp-gum)" stroke="#c7827c" />
      <path d={`M150 ${baseTop}V50Q152 42 158 42Q174 44 178 60V${baseTop}Z`} fill="url(#shp-gum)" stroke="#c7827c" />
      <path d={`M68 ${baseTop}V56H150V${baseTop}Z`} fill="#f3cdc8" />
      <path d="M58 46Q56 22 70 14Q80 9 88 16Q96 25 109 25Q122 25 130 16Q138 9 148 14Q162 22 160 46Q146 60 109 60Q72 60 58 46Z" fill="url(#shp-tooth)" stroke="#b3a68b" />
      <path d="M70 22Q78 15 86 20" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="36" y={baseTop} width="146" height={baseH} rx="2" fill="#a9b9d0" />
      <rect x="36" y={baseTop} width="146" height={baseH} fill="url(#shp-cut)" opacity="0.5" />
      <rect x="36" y={baseTop} width="146" height={baseH} rx="2" fill="none" stroke="#6b7a90" />
      <path d={`M188 10H196M192 10V${baseTop - 2}M188 ${baseTop - 2}H196M188 ${baseTop + 2}H196M192 ${baseTop + 2}V${bottom}M188 ${bottom}H196`} fill="none" stroke="#2f7d6d" strokeWidth="1.4" />
      <text x="202" y={mid - 4} className="studio-height-lab">{scanLabel}</text>
      <text x="202" y={mid + 12} className="studio-height-val">{`${scan.toFixed(1)} mm`}</text>
      <text x="202" y={baseTop + baseH / 2 - 3} className="studio-height-lab">{baseLabel}</text>
      <text x="202" y={baseTop + baseH / 2 + 12} className="studio-height-val">{`${base.toFixed(1)} mm`}</text>
    </svg>
  );
}

function HelpTip({ text }: { text: string }) {
  return (
    <span className="studio-help" tabIndex={0} role="note" aria-label={text} onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
      ?
      <span className="studio-help-tip" aria-hidden="true">{text}</span>
    </span>
  );
}

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
  onSaveExport,
  exporting = false,
  onExit,
  editing = false,
  shell = false,
  onMbStep,
  onWaxStep,
  trimSlot = null,
  trimmedDone = null,
  nextSignal = 0,
}: {
  parts: DentalPartChoice[];
  slots: Record<DentalSlot, string | null>;
  stage: "analysing" | "ready" | "making" | "trimming" | "made";
  /** Build 79: after Make - open the design again, or finish. */
  onEditDesign?: () => void;
  onDone?: () => void;
  /** Build 106: the frame's Save & export (in place of Done once the models are made). */
  onSaveExport?: () => void;
  exporting?: boolean;
  /** Build 106: after Save & export - back to Dental Studio's page. */
  onExit?: () => void;
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
  waxStudio?: { flow: "waxup" | "imt"; arches: "upper" | "lower" | "both"; chosen?: boolean; onFlow: (flow: "waxup" | "imt") => void; onArches: (arches: "upper" | "lower" | "both") => void };
  /** Build 106: shown in the studio frame - the steps along its top, Back and Next along its bottom. */
  shell?: boolean;
  /** Build 106: a scan nudged by accident put back (the design's own Undo and Redo), under the layout buttons. */
  /** Build 106: the Model Builder step open, for the editor's right-click menu. */
  onMbStep?: (step: ModelStepId | null) => void;
  /** Build 106: the Wax-up step open, likewise. */
  onWaxStep?: (step: string | null) => void;
  /** Build 106: the arch being trimmed (its Trim button shows it), and a count that moves Prepare on to the next step. */
  trimSlot?: "upper" | "lower" | null;
  /** Build 106: the arches finished in Trim and tidy (Done pressed) - Next waits for each one there is. */
  trimmedDone?: Array<"upper" | "lower"> | null;
  nextSignal?: number;
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
  const slotRow = (slot: DentalSlot, label: string, info: string | null, extra?: ReactNode) => (
    <div className={`dental-slot${extra ? " with-extra" : ""}`} key={slot}>
      <label>
        <span>{label}</span>
        <select value={slots[slot] ?? ""} disabled={busy} onChange={(event) => onSlotChange(slot, event.currentTarget.value || null)}>
          <option value="">{slot === "bite2" ? t("dental.optional") : t("dental.none")}</option>
          {parts.map((part) => <option key={part.id} value={part.id}>{part.name}</option>)}
        </select>
      </label>
      {extra}
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
  /** Build 108: Wax-up Studio - the arches being waxed picked by the dentist (asked before the scans). */
  const archesChosen = !waxStudio || waxStudio.chosen !== false;
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
  // Build 103: as Meshmixer (manual) - the teeth positioned, then sculpted, then the model made; nothing fitted for you.
  const waxSteps: WaxStepId[] | null = waxStudio && waxup ? (waxup.view.manual ? ["scans", "trim", ...(slots.upper && slots.lower ? ["bite" as const] : []), ...(waxup.view.marginOn ? ["margin" as const] : []), "set", "place", "keep", "sculpt", "gum", "make"] : ["scans", "trim", "teeth", "set", "place", "adjust", ...(waxup.view.occlusion.ready ? ["occlusion" as const] : []), "make"]) : null;
  const [waxStepId, setWaxStepId] = useState<WaxStepId>("scans");
  const waxStepName = (id: WaxStepId) => t(`waxStudio.step.${id}` as "waxStudio.step.scans");
  const waxStep = waxSteps ? (waxSteps.includes(waxStepId) ? waxStepId : "make") : null;
  const wv = waxup?.view;
  const waxSetsHere = wv ? wv.builtIn.filter((set) => !set.arch || set.arch === wv.slot) : [];
  // Build 105: Wax-up Studio fits the library teeth to the four marks on each tooth.
  // Build 107: as Meshmixer, the set is dropped whole on the arch - no marks needed first.
  const waxPlaceable = Boolean(wv?.setName) && (Boolean(wv?.manual) || (wv?.markedTeeth.length ?? 0) > 0);
  /** Build 108: both arches waxed (each with its own set, both adjusted to their models). */
  const bothArches = Boolean(waxStudio && waxStudio.arches === "both" && slots.upper && slots.lower);
  /** Build 108: Open bite's slider freed to move although wax teeth are placed. */
  const [biteUnlocked, setBiteUnlocked] = useState(false);
  const waxStepDone = (id: WaxStepId): boolean => {
    if (!wv) return false;
    switch (id) {
      // Build 106: and, in the frame, each arch trimmed (or accepted as it is) - Next waits for that.
      // (The arches being waxed only: an opposing arch need not be trimmed for a wax-up.)
      // Build 107: Import is the scans brought in; Trim (its own step now) waits for each waxed arch accepted.
      // Build 108: the arches chosen, and the scans of each of them in.
      case "scans": return scansDone && archesChosen && (!waxStudio || (waxStudio.arches === "both" ? Boolean(slots.upper && slots.lower) : Boolean(slots[waxStudio.arches])));
      case "trim": return scansDone && (!shell || !trimmedDone || (["upper", "lower"] as const).every((slot) => !slots[slot] || (waxStudio && waxStudio.arches !== "both" && waxStudio.arches !== slot) || trimmedDone.includes(slot)));
      // Build 105: the teeth to wax up chosen, each with its four marks.
      case "teeth": return wv.markedTeeth.length > 0 && !wv.markPick;
      // Build 106: the teeth to wax up chosen (canine to canine to start with).
      case "select": return wv.markTeeth.length > 0;
      case "find": return Boolean(wv.found?.length);
      case "choose": return wv.chosen.length > 0;
      // Build 103: and made for this arch (an upper set is no set for the lower teeth).
      // Build 108: both arches waxed - a set for each.
      case "set": { const arch = wv.builtIn.find((set) => set.id === wv.setId)?.arch; return Boolean(wv.setName) && (!arch || arch === wv.slot) && (!bothArches || (Boolean(wv.setIds?.upper) && Boolean(wv.setIds?.lower))); }
      case "place": return wv.placed.length > 0;
      // Build 108: the articulator set up on the scans (0, the bite as scanned, is a choice too).
      case "bite": return !wv.bite?.busy;
      case "adjust": return wv.stage === "adapted" && wv.placed.length > 0 && !wv.busy;
      default: return true;
    }
  };
  const waxIndex = waxSteps && waxStep ? waxSteps.indexOf(waxStep) : -1;
  const goWax = (id: WaxStepId) => setWaxStepId(id);
  useEffect(() => { onWaxStep?.(waxStep); }, [waxStep, onWaxStep]);
  useEffect(() => () => onWaxStep?.(null), [onWaxStep]);
  // Build 103: Position shows the whole library teeth; from Adapt on they are fitted to the patient's.
  useEffect(() => {
    if (!waxStep || !waxup) return;
    // (As Meshmixer, Sculpt and Make show the teeth solid and still; nothing is fitted - see placeWaxup.)
    const adapted = ["adjust", "occlusion", "keep", "sculpt", "gum", "make"].includes(waxStep);
    if ((waxup.view.stage === "adapted") !== adapted) waxup.actions.onStage(adapted ? "adapted" : "position");
  }, [waxStep]); // eslint-disable-line react-hooks/exhaustive-deps
  // Straight through from Find teeth to the teeth placed, once per arch.
  const [waxAuto, setWaxAuto] = useState(false);
  const waxAutoDone = useRef(new Set<string>());
  const waxAutoTried = useRef(new Set<string>());
  useEffect(() => {
    if (!waxStep || !wv || !waxup) return;
    // The other arch chosen further on, with nothing placed on it yet: back to Find teeth for it.
    // Build 107: in Wax-up Studio (as Meshmixer) back to Library - and Library itself is never "past" it.
    const past = (wv.manual ? ["place", "adjust", "occlusion", "keep", "sculpt", "gum", "make"] : ["set", "place", "adjust", "occlusion", "sculpt", "make"]).includes(waxStep);
    // Build 108: both arches waxed, the other arch's set already chosen - its teeth are placed here instead.
    // (Once an arch has been through Library - its set picked there - Position is no jump ahead for it.)
    if (past && !wv.placed.length && !waxAutoDone.current.has(wv.slot)) {
      const target: WaxStepId = wv.manual ? (bothArches && wv.setIds?.[wv.slot] ? "place" : "set") : "teeth";
      if (target !== waxStep) { setWaxStepId(target); return; }
    }
    // Build 107: each step does its own work the first time it is entered (teeth found, marked, a set
    // chosen, the teeth placed) and then waits for Next - as Model Builder, it never moves on by itself.
    const key = `${wv.slot}:${waxStep}`;
    if (["select", "teeth", "set", "place"].includes(waxStep) && !waxAutoDone.current.has(key)) { waxAutoDone.current.add(key); waxAutoDone.current.add(wv.slot); setWaxAuto(true); }
  }, [waxStep, wv?.slot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!waxAuto || !waxStep || !wv || !waxup || busy || wv.busy || wv.finder.busy) return;
    const once = (what: string, run: () => void) => { const key = `${wv.slot}:${what}`; if (waxAutoTried.current.has(key)) return false; waxAutoTried.current.add(key); run(); return true; };
    const next = () => setWaxAuto(false);
    // Build 105: the teeth found and marked for the dentist; without the finder (or nothing found) the dentist marks them.
    if (waxStep === "select") { if (waxStepDone("select")) next(); else setWaxAuto(false); return; }
    // Build 107: nothing marked for the dentist - marking starts, tooth by tooth, from the patient's right.
    if (waxStep === "teeth") { if (!wv.markPick && wv.markedTeeth.length < wv.markTeeth.length) once("guide", () => waxup.actions.onMarkTeeth?.()); setWaxAuto(false); return; }
    // Build 107: in Wax-up Studio the dentist picks the set - nothing is chosen for them.
    if (waxStep === "set") { if (waxStepDone("set") || wv.manual) next(); else if (!waxSetsHere.length || !once("set", () => waxup.actions.onBuiltIn(waxSetsHere[0].id))) setWaxAuto(false); return; }
    // Build 103: the run stops at Position - the dentist confirms the teeth before they are fitted.
    // Build 108: the other arch's set still loading (both arches) - wait for it rather than stop.
    if (waxStep === "place") { if (waxStepDone("place")) setWaxAuto(false); else if (!waxPlaceable && bothArches && wv.setIds?.[wv.slot]) return; else if (!waxPlaceable || !once("place", waxup.actions.onPlace)) setWaxAuto(false); return; }
    setWaxAuto(false);
  }, [waxAuto, waxStep, busy, wv?.busy, wv?.finder.busy, wv?.found?.length, wv?.chosen.length, wv?.markedTeeth.length, wv?.setName, wv?.placed.length, wv?.slot]); // eslint-disable-line react-hooks/exhaustive-deps
  // Build 108: a different set chosen in Library after this arch's teeth were placed - back at Position its
  // teeth are dropped in place of the old set's (one step, so Undo brings the old set back).
  const waxPlacedWith = useRef<Record<string, string | null>>({});
  useEffect(() => {
    if (!wv || !waxup || !waxStudio) return;
    if (!wv.placed.length) { delete waxPlacedWith.current[wv.slot]; return; }
    if (waxStep !== "place" || wv.busy || !wv.setId) return;
    const was = waxPlacedWith.current[wv.slot];
    waxPlacedWith.current[wv.slot] = wv.setId;
    if (was && was !== wv.setId) waxup.actions.onDropAgain?.();
  }, [waxStep, wv?.slot, wv?.setId, wv?.placed.length, wv?.busy]); // eslint-disable-line react-hooks/exhaustive-deps
  // Build 111: The margin line opens drawing the first tooth with no line yet (once each time the step is entered).
  const marginOpened = useRef<string | null>(null);
  useEffect(() => {
    if (waxStep !== "margin" || !wv || !waxup) { marginOpened.current = null; return; }
    if (marginOpened.current === wv.slot || wv.marginPick || busy) return;
    marginOpened.current = wv.slot;
    const lines = wv.margins?.[wv.slot]?.lines ?? {};
    const first = defaultMarkTeeth(wv.slot).slice().sort((a, b) => archOrder(a) - archOrder(b)).find((fdi) => !lines[fdi]);
    if (first !== undefined) window.setTimeout(() => waxup.actions.onMarginTooth?.(first), 120);
  }, [waxStep, wv?.slot, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const waxStepper = waxSteps && waxStep && wv && waxup ? (
    <div className="wax-stepper">
      <ol className="wax-steps" aria-label={t("waxStudio.steps")}>
        {waxSteps.map((id, i) => {
          const reachable = i <= waxIndex || waxSteps.slice(0, i).every((prev) => waxStepDone(prev));
          return (
            <li key={id}>
              <button type="button" aria-current={id === waxStep ? "step" : undefined} className={`${id === waxStep ? "current" : ""}${i < waxIndex && waxStepDone(id) ? " done" : ""}`} disabled={!reachable || stage === "making"} onClick={() => { setWaxAuto(false); goWax(id); }}>
                <span className="wax-step-number" aria-hidden="true">{i < waxIndex && waxStepDone(id) ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
                <span className="wax-step-label">{waxStepName(id)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="wax-step-head">
        <strong>{t("waxStudio.stepOf", { n: waxIndex + 1, count: waxSteps.length, name: waxStepName(waxStep) })}</strong>
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
  /**
   * Build 104: Model Builder one step at a time too - Scans, Prepare, Model, Base, Articulator (a pair)
   * and Label, with Back and Next, as Wax-up - instead of every card at once. Make models is on the last.
   */
  // Build 104: the articulator and the label share the last step.
  const mbSteps: ModelStepId[] | null = !waxStudio ? ["scans", "prepare", "model", "base", "label"] : null;
  const mbStepName = (id: ModelStepId) => t(id === "label" && pair ? "modelBuilder.step.finish" : `modelBuilder.step.${id}` as "modelBuilder.step.scans");
  const [mbStepId, setMbStepId] = useState<ModelStepId>("scans");
  const mbStep = mbSteps ? (mbSteps.includes(mbStepId) ? mbStepId : "label") : null;
  useEffect(() => { onMbStep?.(mbStep); }, [mbStep, onMbStep]);
  // Build 106: in the frame the scan is used as trimmed - no gum line followed, nothing more cut across
  // (aligner models keep their set height for thermoforming).
  const trimmedAsIs = shell && (mbStep === "base" || waxStep === "make");
  // Build 106: aligner models follow the gum line by default - an even 2 mm of gum below the teeth, the
  // palate and floor of the mouth gone - with the base making the model about 18 mm tall.
  const alignerBase = (gum: number | null) => Math.max(3, Math.round((18 - teethHeight - (gum ?? 0)) * 2) / 2);
  useEffect(() => {
    if (!shell || preset !== "aligner" || options.gum !== undefined || !analysis) return;
    onOptionsChange({ gum: 2, base: alignerBase(2) });
  }, [shell, preset, options.gum, Boolean(analysis)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!trimmedAsIs) return;
    const gumSet = options.gum !== null && options.gum !== undefined && preset !== "aligner";
    const keepSet = options.keep !== null && preset !== "aligner";
    if (gumSet || keepSet) onOptionsChange({ gum: null, ...(keepSet ? { keep: null } : {}) });
  }, [trimmedAsIs, options.gum, options.keep, preset]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (shell && (mbStep === "label" || waxStep === "make") && options.layout !== "print") onOptionsChange({ layout: "print" });
  }, [shell, mbStep, options.layout]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (shell && patientDetails === "remove") onPatientDetails?.("keep"); }, [shell, patientDetails]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextSeen = useRef(nextSignal);
  useEffect(() => {
    if (nextSignal === nextSeen.current) return;
    nextSeen.current = nextSignal;
    if (mbSteps && mbStep === "prepare" && mbIndex >= 0 && mbIndex < mbSteps.length - 1) setMbStepId(mbSteps[mbIndex + 1]);
  }, [nextSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onMbStep?.(null), [onMbStep]);
  const mbIndex = mbSteps && mbStep ? mbSteps.indexOf(mbStep) : -1;
  const mbStepDone = (id: ModelStepId) => (id === "scans" ? scansDone : id === "prepare" && shell && trimmedDone ? (["upper", "lower"] as const).every((slot) => !slots[slot] || trimmedDone.includes(slot)) : true);
  const inMb = (id: ModelStepId) => !mbSteps || mbStep === id;
  const mbLast = !mbSteps || mbIndex === mbSteps.length - 1;
  const mbStepper = mbSteps && mbStep ? (
    <div className="wax-stepper mb-stepper">
      <ol className="wax-steps" aria-label={t("modelBuilder.steps")}>
        {mbSteps.map((id, i) => {
          const reachable = i <= mbIndex || mbSteps.slice(0, i).every((prev) => mbStepDone(prev));
          return (
            <li key={id}>
              <button type="button" aria-current={id === mbStep ? "step" : undefined} className={`${id === mbStep ? "current" : ""}${i < mbIndex ? " done" : ""}`} disabled={!reachable || stage === "making"} onClick={() => setMbStepId(id)}>
                <span className="wax-step-number" aria-hidden="true">{i < mbIndex ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
                <span className="wax-step-label">{mbStepName(id)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="wax-step-head">
        <strong>{t("waxStudio.stepOf", { n: mbIndex + 1, count: mbSteps.length, name: mbStepName(mbStep) })}</strong>
      </div>
    </div>
  ) : null;
  const mbStepButtons = mbSteps && mbStep ? (
    <div className="wax-step-nav">
      <button type="button" className="secondary" disabled={mbIndex <= 0 || stage === "making"} onClick={() => setMbStepId(mbSteps[mbIndex - 1])}><ArrowLeft size={16} /> {t("waxStudio.back")}</button>
      {!mbLast ? (
        <button type="button" className="primary" disabled={!mbStepDone(mbStep) || busy} onClick={() => setMbStepId(mbSteps[mbIndex + 1])}>{t("waxStudio.next")} <ArrowRight size={16} /></button>
      ) : null}
    </div>
  ) : null;
  // Build 106: in the studio frame - the steps along its top, Back and Next along its bottom, the step's
  // guidance over the 3D view; the panel keeps the step's own tools.
  const stepsSlot = useStudioSlot("steps");
  const navSlot = useStudioSlot("nav");
  const hintSlot = useStudioSlot("hint");
  const framed = shell && Boolean(stepsSlot);
  // Build 108: Trim opens on the arch being waxed straight away (the upper with both), its tools in view - once
  // each time the step is entered, and not over an arch already being trimmed.
  const trimOpened = useRef(false);
  useEffect(() => {
    if (waxStep !== "trim" || !framed) { trimOpened.current = false; return; }
    if (trimOpened.current || trimSlot || busy || !analysis || !onSculpt || !waxStudio) return;
    const arch = waxStudio.arches === "lower" ? "lower" : "upper";
    if (!slots[arch]) return;
    trimOpened.current = true;
    onSculpt(arch, "trim");
  }, [waxStep, framed, trimSlot, busy, analysis]); // eslint-disable-line react-hooks/exhaustive-deps
  // Build 116: Model Builder's Trim step opens the trim tool the same way - on the upper (the lower with only a lower),
  // once each time the step is entered, and not over an arch already being trimmed.
  const mbTrimOpened = useRef(false);
  useEffect(() => {
    if (mbStep !== "prepare" || !framed) { mbTrimOpened.current = false; return; }
    if (mbTrimOpened.current || trimSlot || busy || !analysis || !onSculpt) return;
    const arch = slots.upper ? "upper" : slots.lower ? "lower" : null;
    if (!arch) return;
    mbTrimOpened.current = true;
    onSculpt(arch, "trim");
  }, [mbStep, framed, trimSlot, busy, analysis]); // eslint-disable-line react-hooks/exhaustive-deps
  const frameStep = (key: string, label: string, n: number, state: "done" | "auto" | "current" | "", disabled: boolean, onClick: () => void) => (
    <button key={key} type="button" className={`studio-step ${state}`} aria-current={state === "current" ? "step" : undefined} disabled={disabled} onClick={onClick}>
      <span className="studio-step-n" aria-hidden="true">{state === "done" || state === "auto" ? <Check size={13} strokeWidth={3} /> : n}</span>
      <span className="studio-step-label">{label}</span>
    </button>
  );
  const waxName = waxStepName;
  const waxAutoStep = (id: WaxStepId) => Boolean(wv) && (id === "teeth" ? wv!.autoMarked.some((fdi) => wv!.markTeeth.includes(fdi)) : (id === "select" || id === "set") && waxAutoDone.current.has(wv!.slot));
  const frameSteps = !framed ? null : waxSteps && waxStep && wv ? waxSteps.map((id, i) => {
    const reachable = i <= waxIndex || waxSteps.slice(0, i).every((prev) => waxStepDone(prev));
    // Build 108: once the models are made, the wax teeth are in them (hidden, used) - every step before is done.
    const state = id === waxStep ? "current" : i < waxIndex && (stage === "made" || waxStepDone(id)) ? (waxAutoStep(id) ? "auto" : "done") : "";
    return frameStep(id, waxName(id), i + 1, state, !reachable || stage === "making", () => { setWaxAuto(false); goWax(id); });
  }) : mbSteps && mbStep ? mbSteps.map((id, i) => {
    const reachable = i <= mbIndex || mbSteps.slice(0, i).every((prev) => mbStepDone(prev));
    return frameStep(id, mbStepName(id), i + 1, id === mbStep ? "current" : i < mbIndex ? "done" : "", !reachable || stage === "making", () => setMbStepId(id));
  }) : null;
  const mbHintKey: Record<ModelStepId, string> = { scans: "dental.step1Hint", prepare: "dental.trimHint", model: "dental.step3Hint", base: "dental.stepBaseHint", articulator: "dental.step4Hint", label: pair ? "dental.step4Hint" : "dental.stepNameHint" };
  const longHint = !framed ? null : stage === "made" ? t("dental.madeHint") : waxStep ? t(`waxStudio.stepHint.${waxStep}` as "waxStudio.stepHint.scans") : mbStep ? t(mbHintKey[mbStep] as "dental.step1Hint") : null;
  // The line over the 3D view: what to do now, in a few words; the rest is behind the (?).
  const frameHint = !framed ? null : stage === "made" ? t("studio.hint.made") : waxStep ? t(`studio.hint.${waxStep}` as "studio.hint.scans") : mbStep ? t(mbStep === "scans" && scansDone ? "studio.hint.mb.scansLoaded" : `studio.hint.mb.${mbStep}` as "studio.hint.mb.scans") : null;
  // Build 116: while the models are being made (and, in Wax-up Studio, while the wax is fitted to the bite first) the
  // button stays, fills slowly and says what is happening - the work can hold the screen for a minute.
  const fitting = Boolean(waxup?.view.occlusion.busy);
  const makingNow = stage === "making" || fitting;
  const makeButton = (
    <button type="button" className={`primary${makingNow ? " studio-make-filling" : ""}`} disabled={!ready || makingNow} aria-busy={makingNow} onClick={onApply}>
      {makingNow ? <LoaderCircle className="edge-modifier-spinner" size={17} /> : <Check size={17} />}
      <span>{fitting ? t("waxup.fittingBiteShort") : stage === "making" ? t("dental.working") : editing ? t("dental.updateModels") : t(pair ? "dental.applyPair" : "dental.apply")}</span>
    </button>
  );
  const frameNav = !framed ? null : stage === "made" ? (<>
    <button type="button" className="secondary" onClick={onEditDesign}>{t("dental.editDesign")}</button>
    {onExit && !exporting ? <button type="button" className="primary" onClick={onExit}>{t("studio.exit")} <ArrowRight size={18} /></button> : onSaveExport ? <button type="button" className={`primary${exporting ? " studio-filling" : ""}`} disabled={exporting} aria-busy={exporting} onClick={onSaveExport}><FileDown size={17} /> {t(exporting ? "studio.exporting" : "studio.saveExport")}</button> : <button type="button" className="primary" onClick={onDone}><Check size={17} /> {t("dental.doneButton")}</button>}
  </>) : stage === "making" ? (<>
    <button type="button" className="secondary" onClick={onCancel}>{t("dental.stopMaking")}</button>
    {makeButton}
  </>) : waxSteps && waxStep ? (<>
    <button type="button" className="secondary" disabled={waxIndex <= 0} onClick={() => { setWaxAuto(false); goWax(waxSteps[waxIndex - 1]); }}>{t("waxStudio.back")}</button>
    {waxStep !== "make" ? (
      <button type="button" className="primary" disabled={!waxStepDone(waxStep) || busy || Boolean(wv?.busy)} onClick={() => goWax(waxSteps[waxIndex + 1])}>{t("studio.nextTo", { step: waxName(waxSteps[waxIndex + 1]) })} <ArrowRight size={18} /></button>
    ) : null}
  </>) : mbSteps && mbStep ? (<>
    <button type="button" className="secondary" disabled={mbIndex <= 0} onClick={() => setMbStepId(mbSteps[mbIndex - 1])}>{t("waxStudio.back")}</button>
    {!mbLast ? (
      <button type="button" className="primary" disabled={!mbStepDone(mbStep) || busy} onClick={() => setMbStepId(mbSteps[mbIndex + 1])}>{t("studio.nextTo", { step: mbStepName(mbSteps[mbIndex + 1]) })} <ArrowRight size={18} /></button>
    ) : null}
  </>) : null;
  const frameHead = framed && stage !== "made" ? (
    <div className="studio-panel-head">
      <strong>{waxStep ? waxName(waxStep) : mbStep ? mbStepName(mbStep) : title}{longHint ? <HelpTip text={longHint} /> : null}</strong>
      <span>{waxSteps && waxStep ? t("studio.stepOf", { n: waxIndex + 1, count: waxSteps.length }) : mbSteps && mbStep ? t("studio.stepOf", { n: mbIndex + 1, count: mbSteps.length }) : null}</span>
      {waxAuto ? <p className="dental-status" role="status"><LoaderCircle className="edge-modifier-spinner" size={15} /> {t("waxStudio.auto")} <button type="button" className="link-button" onClick={() => setWaxAuto(false)}>{t("waxStudio.autoStop")}</button></p> : null}
    </div>
  ) : null;
  const waxPart: WaxupPart | null = waxStep && ["select", "teeth", "find", "choose", "set", "place", "adjust", "occlusion", "sculpt"].includes(waxStep) ? waxStep as WaxupPart : null;
  const card = (number: number, label: string, done: boolean, hint: string | null, summary: string | null, body: ReactNode) => {
    const isFolded = !waxSteps && !mbSteps && Boolean(folded[number]);
    return (
      <section className={`dental-section dental-card${isFolded ? " folded" : ""}${activeCard === number ? " current" : ""}${nextCard === number ? " next" : ""}`} aria-label={label} onPointerDownCapture={() => { setActiveCard(number); if (!visited[number]) setVisited((state) => ({ ...state, [number]: true })); }}>
        <button type="button" className="dental-card-head" aria-expanded={!isFolded} onClick={() => setFolded((state) => ({ ...state, [number]: !isFolded }))}>
          {step(number, label, done && (number === 1 || Boolean(visited[number])), isFolded ? null : hint)}
          {framed && hint ? <HelpTip text={hint} /> : null}
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
    <MovableToolPanel className={`edge-modifier-panel dental-studio-panel${mbSteps ? " mb-steps" : ""}${waxSteps ? " wax-steps-on" : ""}${framed ? " studio-framed" : ""}`} ariaLabel={title}>
      {(handleProps) => (<SmoothSliders.Provider value={framed}>
      {framed && stepsSlot ? createPortal(frameSteps, stepsSlot) : null}
      {framed && navSlot ? createPortal(frameNav, navSlot) : null}
      {framed && hintSlot && frameHint ? createPortal(<span>{frameHint}</span>, hintSlot) : null}
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
          <p className="dental-status" role="status"><Check size={15} /> {t("dental.madeHere")}{framed ? <HelpTip text={`${t("dental.madeHint")} ${t("export.dentalLayers")}`} /> : null}</p>
          {framed ? null : <p className="blend-hint">{t("dental.madeHint")}</p>}
          {framed ? null : <p className="dental-status warn" role="note">{t("export.dentalLayers")}</p>}
          <div className="edge-modifier-footer">
            <button type="button" className="secondary" onClick={onEditDesign}>{t("dental.editDesign")}</button>
            <button type="button" className="primary" onClick={onDone}><Check size={17} /> {t("dental.doneButton")}</button>
          </div>
        </div>
      ) : (<>
      {/* Build 94: Wax-up Studio's two choices, above the steps: the workflow and the arches. */}
      {framed ? frameHead : (<>{waxStepper}{mbStepper}</>)}
      {waxStudio && inWaxStep("scans") ? (
        <div className="wax-studio-choices">
          {choice(t("waxStudio.flow"), waxStudio.flow, [["waxup", t("waxStudio.flowWaxup")], ["imt", t("waxStudio.flowImt")]], waxStudio.onFlow, t("waxStudio.flowHint"))}
          {/* Build 108: which arches are waxed - asked first, before the scans (none chosen until the dentist picks). */}
          {choice(t("waxStudio.arches"), (archesChosen ? waxStudio.arches : "") as "upper" | "lower" | "both", [["upper", t("dental.upper")], ["lower", t("dental.lower")], ["both", t("waxStudio.both")]], waxStudio.onArches)}
          {!archesChosen ? <p className="dental-status warn" role="status">{t("waxStudio.archesFirst")}</p> : null}
          {/* Build 111: two ways of working, side by side while they are tried - Keep & erase alone, or with a palatal margin line first. */}
          {waxup && waxStudio.flow !== "imt" ? choice(t("waxStudio.margin"), waxup.view.marginOn ? "on" : "off", [["off", t("waxStudio.marginOff")], ["on", t("waxStudio.marginOnLabel")]], (value) => waxup.actions.onMarginOn?.(value === "on"), t("waxStudio.marginHint")) : null}
          <p className="blend-hint">{t(waxStudio.flow === "imt" ? "waxStudio.imtHint" : "waxStudio.waxupHint")}</p>
        </div>
      ) : null}
      {/* Build 75: the Studio in step cards - scans, preparing them (trim, then the teeth), what the model
          is for, its base, the articulator (a pair), its name. A card folds to one line; the one last
          worked in is marked. */}
      {inWaxStep("scans") && inMb("scans") ? card(1, t("dental.step1"), scansDone, t("dental.step1Hint"), scansSummary, (<>
        <div className="dental-slots">
          {parts.length === 0 ? <a className="dental-guide-link" href={DENTAL_GUIDE_PDF} download={DENTAL_GUIDE_FILE}><FileDown size={15} aria-hidden="true" /> {t("dental.guidePdfFirst")}</a> : null}
          <div className={onNewPatient ? "dental-import-row" : undefined}>
            <button type="button" className="dental-import" disabled={stage === "making" || !archesChosen} title={archesChosen ? undefined : t("waxStudio.archesFirst")} onClick={onImport}><Upload size={15} /> {t("dental.import")}</button>
            {onNewPatient ? <button type="button" className="dental-import dental-new-patient" disabled={stage === "making"} title={t("dental.newPatientHint")} onClick={onNewPatient}><FilePlus2 size={15} /> {t("dental.newPatient")}</button> : null}
          </div>
          {modelsHere ? <p className="dental-status warn" role="status">{t("dental.modelsHere")}</p> : null}
          {/* Build 104: compact - one line a scan, no cleaning report (what was filled and removed is applied
              anyway), the swap beside the lower, and both bite scans always offered. */}
          {slotRow("upper", t("dental.upper"), null)}
          {slotRow("lower", t("dental.lower"), null, <button type="button" className="dental-swap" title={t("dental.swap")} aria-label={t("dental.swap")} disabled={busy || (!slots.upper && !slots.lower)} onClick={onSwap}><ArrowLeftRight size={15} /></button>)}
          {slotRow("bite", t("dental.bite"), null)}
          {/* Build 79: a second bite scan - one each side aligns the whole arch best. */}
          {slotRow("bite2", t("dental.bite2"), null)}
          {stage === "analysing" ? <p className="dental-status" role="status"><LoaderCircle className="edge-modifier-spinner" size={15} /> {t("dental.analysing")}</p> : null}
          {pairLine ? <p className={`dental-status ${pairLine.warn ? "warn" : ""}`} role="status">{pairLine.text}{"fit" in pairLine && onFitBite ? <>{" "}<button type="button" className="link-button" disabled={busy} onClick={onFitBite}>{t(slots.bite2 ? "dental.fitBite2" : "dental.fitBite")}</button></> : null}</p> : null}
          {biteLocked ? <p className="dental-status" role="status">{t("dental.biteLocked")}</p> : null}
          {onLayout && analysis && slots.upper && slots.lower ? (<>
            {/* Build 108: named, so it reads as a choice of how the scans are shown. */}
            {waxStudio ? <span className="edge-modifier-label dental-view-title">{t("dental.changeView")}</span> : null}
            <div className="dental-trim-mode" role="radiogroup" aria-label={t("dental.scanLayout")}>
              {(["side", "occlusion"] as const).map((value) => (
                <button key={value} type="button" role="radio" aria-checked={layout === value} className={layout === value ? "active" : ""} disabled={busy} onClick={() => onLayout(value)}>
                  {t(value === "side" ? "dental.scanSide" : "dental.scanOcclusion")}
                </button>
              ))}
            </div>
          </>) : null}
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

      {/* Build 106: Wax-up Studio's Import step holds the trim too. */}
      {/* Build 108: Open the bite - Model Builder's Increase OVD (its side view opening on the condyles, its slider), the
          lower scan turning open in the view as it moves; the teeth are then placed and made at this opening. */}
      {waxSteps && waxStep === "bite" && wv && waxup ? card(3, t("waxup.biteTitle"), true, t("waxStudio.stepHint.bite"), null, (<>
        <div className="studio-artic-picture"><ArticulatorPicture pinRaise={wv.bite?.raise ?? 0} pin pinGap={PIN_CLEAR} /></div>
        {/* Build 108: with wax teeth already placed, the opening is changed only once the dentist says so. */}
        {wv.anyWax && !biteUnlocked ? (
          <div className="wax-guide">
            <strong>{t("waxup.biteLockedTitle")}</strong>
            <span>{t("waxup.biteLocked")}</span>
            <div className="dental-trim-buttons"><button type="button" className="secondary" onClick={() => setBiteUnlocked(true)}>{t("waxup.biteUnlock")}</button></div>
          </div>
        ) : null}
        <EdgeModifierSlider label={t("waxup.biteSlider")} title={t("waxup.biteHint")} value={wv.bite?.raise ?? 0} min={0} max={PIN_MAX} step={PIN_STEP} workspace={workspace} length disabled={busy || Boolean(wv.bite?.busy) || (Boolean(wv.anyWax) && !biteUnlocked)} onChange={(value) => waxup.actions.onBite?.(value)} />
        {/* Build 108: what the opening does at the front and at the back. */}
        <div className="wax-bite-openings" role="status">
          <span><b>{(wv.bite?.hinge ? biteOpenings(wv.bite.hinge, wv.bite.raise ?? 0).front : 0).toFixed(1)} mm</b>{t("waxup.biteFront")}</span>
          <span><b>{(wv.bite?.hinge ? biteOpenings(wv.bite.hinge, wv.bite.raise ?? 0).back : 0).toFixed(1)} mm</b>{t("waxup.biteBack")}</span>
        </div>
        {wv.bite?.busy ? <p className="dental-status" role="status"><LoaderCircle className="edge-modifier-spinner" size={15} aria-hidden="true" /> {t("waxup.biteWorking")}</p> : null}
        {(wv.bite?.raise ?? 0) > PIN_WARN ? <p className="blend-hint warn">{t("dental.pinRaiseWarn", { max: PIN_WARN })}</p> : <p className="blend-hint">{t("waxup.biteHint")}</p>}
      </>)) : null}
      {/* Build 111: the palatal (lingual) margin line, tooth by tooth (the second way of working). */}
      {waxSteps && waxStep === "margin" && wv && waxup ? card(3, waxStepName("margin"), true, t("waxStudio.stepHint.margin"), null, (() => {
        const teeth = defaultMarkTeeth(wv.slot).slice().sort((a, b) => archOrder(a) - archOrder(b));
        const lines = wv.margins?.[wv.slot]?.lines ?? {};
        const pick = wv.marginPick ?? null;
        const found = new Set((wv.found ?? []).map((tooth) => tooth.fdi));
        const done = teeth.filter((fdi) => (lines[fdi]?.length ?? 0) >= 3 || found.has(fdi));
        // Build 114: the margins found by the tooth finder (each tooth's own surface on the scan), drawn by hand only to correct one.
        const finding = Boolean(wv.finder?.busy);
        return (<>
          <div className="dental-trim-buttons">
            <button type="button" className="primary" disabled={busy || finding} title={t("waxup.marginFindHint")} onClick={() => { if (pick) waxup.actions.onMarginCancel?.(); waxup.actions.onFindTeeth?.(); }}>{finding ? <LoaderCircle className="edge-modifier-spinner" size={15} aria-hidden="true" /> : null} {t(found.size ? "waxup.marginFindAgain" : "waxup.marginFind")}</button>
          </div>
          {finding ? <p className="dental-status" role="status">{t("waxup.marginFinding", { n: Math.round((wv.finder?.progress ?? 0) * 100) })}</p> : found.size ? <p className="blend-hint" role="status">{t("waxup.marginFound", { n: teeth.filter((fdi) => found.has(fdi)).length })}</p> : null}
          {bothArches ? (
            <div className="dental-trim-mode" role="radiogroup" aria-label={t("waxup.arch")}>
              {(["upper", "lower"] as const).map((slot) => (
                <button key={slot} type="button" role="radio" aria-checked={wv.slot === slot} className={wv.slot === slot ? "active" : ""} disabled={busy} onClick={() => { waxup.actions.onMarginCancel?.(); waxup.actions.onSlot(slot); }}>{t(slot === "upper" ? "dental.upper" : "dental.lower")}</button>
              ))}
            </div>
          ) : null}
          <div className="waxup-teeth waxup-found wax-landmark-teeth" role="group" aria-label={t("waxup.marginTeeth")}>
            {teeth.map((fdi) => {
              const has = done.includes(fdi), current = pick?.fdi === fdi;
              return (
                <button key={fdi} type="button" aria-current={current ? "step" : undefined} className={`waxup-tooth${current ? " current" : ""}${has ? " active" : ""}`} title={t(has ? "waxup.marginRedraw" : "waxup.marginDraw", { fdi })} disabled={busy} onClick={() => waxup.actions.onMarginTooth?.(fdi)}>
                  {has && !current ? <Check size={12} aria-hidden="true" /> : null}{fdi}
                </button>
              );
            })}
          </div>
          <p className="blend-hint wax-landmarks-count" role="status">{pick ? t("waxup.marginDrawing", { fdi: pick.fdi, n: pick.points.length }) : t("waxup.marginCount", { done: done.length, all: teeth.length })}</p>
          {pick ? (
            <div className="dental-trim-buttons">
              <button type="button" className="primary" disabled={pick.points.length < 3} onClick={() => waxup.actions.onMarginDone?.()}>{t("waxup.marginKeep")}</button>
              <button type="button" className="secondary" disabled={!pick.points.length} onClick={() => waxup.actions.onMarginUndo?.()}>{t("waxup.marginUndo")}</button>
              {pick.points.length || (lines[pick.fdi]?.length ?? 0) ? <button type="button" className="secondary" onClick={() => waxup.actions.onMarginClear?.(pick.fdi)}>{t("waxup.marginClear")}</button> : null}
              <button type="button" className="secondary" onClick={() => waxup.actions.onMarginCancel?.()}>{t("waxup.marginCancel")}</button>
            </div>
          ) : (
            <p className="blend-hint">{t(done.length ? "waxup.marginAfter" : "waxup.marginNone")}</p>
          )}
        </>);
      })()) : null}
      {/* Build 110: Keep & erase - paint the wax to keep on each tooth, then erase the rest: it goes just under the
          patient's surface. An Erase brush does the same where it is brushed; kept wax is never erased. */}
      {waxSteps && waxStep === "keep" && wv && waxup ? card(7, waxStepName("keep"), true, t("waxStudio.stepHint.keep"), null, (() => {
        const teeth = wv.placed;
        const painted = teeth.filter((tooth) => (wv.erase?.[tooth.id]?.keep.length ?? 0) > 0);
        const erased = teeth.filter((tooth) => wv.erase?.[tooth.id]?.rest);
        const brush = wv.eraseBrush ?? { tool: "keep" as const, size: 1.5 };
        return (<>
          {bothArches ? (
            <div className="dental-trim-mode" role="radiogroup" aria-label={t("waxup.arch")}>
              {(["upper", "lower"] as const).map((slot) => (
                <button key={slot} type="button" role="radio" aria-checked={wv.slot === slot} className={wv.slot === slot ? "active" : ""} disabled={busy || wv.busy} onClick={() => waxup.actions.onSlot(slot)}>{t(slot === "upper" ? "dental.upper" : "dental.lower")}</button>
              ))}
            </div>
          ) : null}
          <div className="studio-mm-choice two wax-erase-tools" role="radiogroup" aria-label={t("waxup.erase.brush")}>
            {(["keep", "unkeep", "erase", "unerase"] as const).map((tool) => (
              <button key={tool} type="button" role="radio" aria-checked={brush.tool === tool} className={brush.tool === tool ? "active" : ""} title={t(`waxup.erase.${tool}Hint`)} onClick={() => waxup.actions.onEraseBrush?.(tool)}>{t(`waxup.erase.${tool}`)}</button>
            ))}
          </div>
          <p className="blend-hint" role="status">{t(`waxup.erase.${brush.tool}Hint`)}</p>
          <EdgeModifierSlider label={t("waxup.erase.size")} value={brush.size} min={0.5} max={4} step={0.25} workspace={workspace} length onChange={(value) => waxup.actions.onEraseSize?.(value)} />
          <p className="blend-hint wax-landmarks-count" role="status">{t("waxup.erase.count", { painted: painted.length, all: teeth.length })}</p>
          <div className="dental-trim-buttons">
            <button type="button" className="primary" disabled={!painted.length || busy} onClick={() => waxup.actions.onEraseRest?.(true)}>{t("waxup.erase.rest")}</button>
            {erased.length ? <button type="button" className="secondary" disabled={busy} onClick={() => waxup.actions.onEraseRest?.(false)}>{t("waxup.erase.back")}</button> : null}
            {painted.length || teeth.some((tooth) => wv.erase?.[tooth.id]) ? <button type="button" className="secondary" disabled={busy} onClick={() => waxup.actions.onEraseClear?.()}>{t("waxup.erase.clear")}</button> : null}
          </div>
          <p className="blend-hint">{t(erased.length ? "waxup.erase.after" : "waxup.erase.before")}</p>
        </>);
      })()) : null}
      {/* Build 108: Gum line - how the wax teeth meet the gum: the patient's gum as it is, or an even, mirrored line
          (gum trimmed back, never added). The wax teeth show the patient's gum line on them in red; with the even
          line, the gum that goes in amber and the new margin in green. */}
      {waxSteps && waxStep === "gum" && wv && waxup ? card(8, t("waxup.gumTitle"), true, t("waxStudio.stepHint.gum"), null, (<>
        <div className="studio-mm-choice two" role="radiogroup" aria-label={t("waxup.gumTitle")}>
          {(["follow", "even"] as const).map((mode) => (
            <button key={mode} type="button" role="radio" aria-checked={(wv.gum?.mode ?? "follow") === mode} className={(wv.gum?.mode ?? "follow") === mode ? "active" : ""} disabled={busy} title={t(`waxup.gum.${mode}Hint`)} onClick={() => waxup.actions.onGumMode?.(mode)}>{t(`waxup.gum.${mode}`)}</button>
          ))}
        </div>
        <p className="blend-hint" role="status">{t(`waxup.gum.${wv.gum?.mode ?? "follow"}Hint`)}</p>
        <ul className="waxup-gum-key">
          <li><span style={{ background: "#d6403a" }} /> {t("waxup.gum.keyMargin")}</li>
          <li><span style={{ background: "#9eb3c7" }} /> {t("waxup.gum.keyCovered")}</li>
          {wv.gum?.mode === "even" ? (<>
            <li><span style={{ background: "#f2b34c" }} /> {t("waxup.gum.keyTrimmed")}</li>
            <li><span style={{ background: "#2e9e5c" }} /> {t("waxup.gum.keyLine")}</li>
          </>) : null}
        </ul>
        {wv.gum?.mode === "even" ? (<>
          {Object.keys(wv.gum.keep).sort((a, b) => (a.startsWith("upper") === b.startsWith("upper") ? Number(a.slice(-1)) - Number(b.slice(-1)) : a.startsWith("upper") ? -1 : 1)).map((pair) => {
            const [arch, k] = pair.split(":");
            const label = arch === "upper" ? `1${k} | 2${k}` : `4${k} | 3${k}`;
            return <EdgeModifierSlider key={pair} label={t("waxup.gum.pair", { teeth: label })} title={t("waxup.gum.pairHint")} value={wv.gum!.keep[pair]} min={0} max={14} step={0.1} workspace={workspace} length disabled={busy} onChange={(value) => waxup.actions.onGumKeep?.(pair, value)} />;
          })}
          <div className="dental-trim-buttons"><button type="button" className="secondary" disabled={busy} title={t("waxup.gum.idealHint")} onClick={() => waxup.actions.onGumIdeal?.()}>{t("waxup.gum.ideal")}</button></div>
        </>) : null}
      </>)) : null}
      {inWaxStep("trim") && inMb("prepare") ? card(2, t(framed ? "studio.trimTitle" : "dental.step2Prepare"), scansDone, null, prepareSummary, (<>
        <div className="dental-substep">
          <h4 className="dental-substep-title">{t(framed ? "studio.trimArch" : "dental.trimStep")}</h4>
          <p className="blend-hint">{t("dental.trimHint")}</p>
          <div className="dental-trim-buttons" role="group" aria-label={t("dental.trimStep")}>
            {(["upper", "lower"] as const).filter((slot) => slots[slot]).map((slot) => (
              <button key={slot} type="button" className={framed && trimSlot === slot ? "active" : undefined} aria-pressed={framed ? trimSlot === slot : undefined} disabled={busy || !analysis || !onSculpt} onClick={() => onSculpt?.(slot, "trim")}>
                {t(slot === "upper" ? "dental.trimUpper" : "dental.trimLower")}
              </button>
            ))}
          </div>
          {onRestore && analysis ? (
            <div className="dental-trim-buttons" role="group" aria-label={t("dental.restore")}>
              {(["upper", "lower"] as const).filter((slot) => slots[slot]).map((slot) => (
                <button key={slot} type="button" disabled={busy} title={t("dental.restoreHint")} onClick={() => onRestore(slot)}>
                  {t(framed ? (slot === "upper" ? "studio.resetUpper" : "studio.resetLower") : slot === "upper" ? "dental.restoreUpper" : "dental.restoreLower")}
                </button>
              ))}
            </div>
          ) : null}
          {/* Build 106: in the frame, Trim's own tools open here, under the arch's buttons. */}
          {framed ? <div className="studio-tool-slot" ref={toolSlot} /> : null}
        </div>
        <div className="dental-substep">
          {/* Build 104: the teeth are found automatically; fixing them by hand is a link, not a choice up front. */}
        {(options.margin ?? "auto") === "auto" ? (
          <button type="button" className="link-button dental-fix-link" disabled={busy || Boolean(trimming)} onClick={() => onOptionsChange({ margin: "manual" })}>{t("dental.fixByHandLink")}</button>
        ) : (<>
        <h4 className="dental-substep-title">{t("dental.marginManual")}</h4>
        <p className="blend-hint">{t("dental.marginManualHint")} <button type="button" className="link-button" disabled={busy || Boolean(trimming)} onClick={() => onOptionsChange({ margin: "auto" })}>{t("dental.backToAuto")}</button></p>
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
        </>)}
        </div>
      </>)) : null}

      {/* Build 79: the digital wax-up - optional; a card of its own before the model is chosen. */}
      {/* Build 101: in Wax-up Studio's steps, the step's own part of it, on its own. */}
      {waxup && waxSteps && waxPart ? (
        <section className="dental-section dental-card current wax-step-body" aria-label={t(`waxStudio.step.${waxPart}` as "waxStudio.step.scans")}>
          <WaxupCard part={waxPart} toolSlot={framed && waxPart === "sculpt" ? toolSlot : undefined} view={waxup.view} actions={{ ...waxup.actions, onConfirm: () => { setWaxAuto(false); goWax(waxup.view.manual ? "sculpt" : "adjust"); }, ...(waxStudio && waxPart === "place" ? { onChangeSet: () => { setWaxAuto(false); goWax("set"); } } : {}) }} slots={{ upper: Boolean(slots.upper) && waxStudio?.arches !== "lower", lower: Boolean(slots.lower) && waxStudio?.arches !== "upper" }} imt={waxStudio?.flow === "imt"} busy={busy || !analysis} workspace={workspace} />
        </section>
      ) : null}
      {waxup && !waxSteps && !mbSteps ? card(3, t(waxStudio ? "waxup.stepStudio" : "waxup.step"), waxup.view.placed.length > 0, t(waxStudio ? "waxup.stepStudioHint" : "waxup.stepHint"), waxupSummary(waxup.view), (
        <WaxupCard view={waxup.view} actions={waxup.actions} slots={{ upper: Boolean(slots.upper) && waxStudio?.arches !== "lower", lower: Boolean(slots.lower) && waxStudio?.arches !== "upper" }} imt={waxStudio?.flow === "imt"} busy={busy || !analysis} workspace={workspace} />
      )) : null}

      {inWaxStep("make") ? (<>
      {inMb("model") ? card(n(4), t("dental.step3"), scansDone, t("dental.step3Hint"), modelSummary, (<>
        <div className="dental-presets" role="radiogroup" aria-label={t("dental.purpose")}>
          {([
            ["study", t("dental.study"), t("dental.studyHint")],
            ["ortho", t("dental.ortho"), t("dental.orthoHint")],
            ["aligner", t("dental.aligner"), t("dental.alignerHint")],
            ["crown", t("dental.crown"), t("dental.crownHint")],
          ] as const).map(([value, label, hint]) => (
            <button key={value} type="button" role="radio" aria-checked={preset === value} className={preset === value ? (custom ? "active custom" : "active") : ""} disabled={busy} title={framed ? hint : undefined} onClick={() => onPresetChange(value)}>
              {/* Build 66: the base each choice makes, from above. */}
              <BaseStylePicture style={({ study: "clean", ortho: "ortho", aligner: "follow", crown: "plate" } as const)[value]} />
              <strong>{label}</strong>
              {/* Build 106: in the frame the line under each is its hover text instead. */}
              {framed ? null : <span>{hint}</span>}
            </button>
          ))}
        </div>
        {/* Build 104: the base's options sit with the model type (its picture already shows the base). */}
        {/* Build 106: in the frame, three buttons that stay pressed while on. */}
        {framed ? (<>
          <h4 className="dental-group">{t("studio.modelOptions")}</h4>
          <div className="studio-toggle-buttons" role="group" aria-label={t("studio.modelOptions")}>
            {options.baseStyle !== "articulator" ? (
              <button type="button" aria-pressed={options.bevel !== false} className={options.bevel !== false ? "active" : ""} disabled={busy} title={t("dental.bevelHint")} onClick={() => onOptionsChange({ bevel: options.bevel === false })}>
                {options.bevel !== false ? <Check size={15} aria-hidden="true" /> : null}{t("studio.bevel")}
              </button>
            ) : null}
            {options.baseStyle === "clean" ? (
              <button type="button" aria-pressed={options.notches !== false} className={options.notches !== false ? "active" : ""} disabled={busy} title={t("dental.notchesHint")} onClick={() => onOptionsChange({ notches: options.notches === false })}>
                {options.notches !== false ? <Check size={15} aria-hidden="true" /> : null}{t("studio.notches")}
              </button>
            ) : null}
            {preset === "aligner" ? (
              <button type="button" aria-pressed={following} className={following ? "active" : ""} disabled={busy} title={t("studio.followGumHint")} onClick={() => onOptionsChange(following ? { gum: null, base: alignerBase(null) } : { gum: 2, base: alignerBase(2) })}>
                {following ? <Check size={15} aria-hidden="true" /> : null}{t("studio.followGum")}
              </button>
            ) : null}
            {options.baseStyle === "clean" || options.baseStyle === "articulator" ? (
              <button type="button" aria-pressed={Boolean(options.tieBar)} className={options.tieBar ? "active" : ""} disabled={busy} title={t("dental.tieBarHint")} onClick={() => onOptionsChange({ tieBar: !options.tieBar })}>
                {options.tieBar ? <Check size={15} aria-hidden="true" /> : null}{t("studio.tieBar")}
              </button>
            ) : null}
          </div>
        </>) : null}
        {!framed && options.baseStyle !== "articulator" ? (
          <label className="edge-modifier-check" title={t("dental.bevelHint")}>
            <input type="checkbox" checked={options.bevel !== false} disabled={busy} onChange={(event) => onOptionsChange({ bevel: event.currentTarget.checked })} />
            <span>{t("dental.bevel")}</span>
          </label>
        ) : null}
        {!framed && (options.baseStyle === "clean" || options.baseStyle === "articulator") ? (
          <>
            {options.baseStyle === "clean" ? (
              <label className="edge-modifier-check" title={t("dental.notchesHint")}>
                <input type="checkbox" checked={options.notches !== false} disabled={busy} onChange={(event) => onOptionsChange({ notches: event.currentTarget.checked })} />
                <span>{t("dental.notches")}</span>
              </label>
            ) : null}
            <label className="edge-modifier-check" title={t("dental.tieBarHint")}>
              <input type="checkbox" checked={Boolean(options.tieBar)} disabled={busy} onChange={(event) => onOptionsChange({ tieBar: event.currentTarget.checked })} />
              <span>{t("dental.tieBar")}</span>
            </label>
          </>
        ) : null}

        {framed ? (<>
          {/* Build 106: the frame's Model options - what is inside, the wall, and the base underneath. */}
          {custom ? <p className="blend-hint dental-custom">{t("dental.customHint")}</p> : null}
          <h4 className="dental-group">{t("studio.body")} <HelpTip text={t("studio.bodyHint")} /></h4>
          {(() => {
            const body = options.inside === "solid" ? "solid" : options.infill === "honeycomb" ? "honeycomb" : "hollow";
            const pick = (value: "hollow" | "honeycomb" | "solid") => onOptionsChange(value === "solid" ? { inside: "solid" } : { inside: options.inside === "solid" ? "open" : options.inside, infill: value === "honeycomb" ? "honeycomb" : options.infill === "honeycomb" || !options.infill ? "base" : options.infill });
            return (
              <div className="studio-pic-choice" role="radiogroup" aria-label={t("studio.body")}>
                {(["hollow", "honeycomb", "solid"] as const).map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={body === value} className={body === value ? "active" : ""} disabled={busy} title={t(`studio.body.${value}Hint` as "studio.body.hollowHint")} onClick={() => pick(value)}>
                    <BodyPictureSvg kind={value} />
                    <span>{t(`studio.body.${value}` as "studio.body.hollow")}</span>
                  </button>
                ))}
              </div>
            );
          })()}
          {options.inside !== "solid" ? (<>
            <h4 className="dental-group">{t("dental.wall")}</h4>
            <div className="studio-mm-choice" role="radiogroup" aria-label={t("dental.wall")}>
              {[2, 3, 4, 5].map((mm) => (
                <button key={mm} type="button" role="radio" aria-checked={Math.abs(options.wall - mm) < 0.05} className={Math.abs(options.wall - mm) < 0.05 ? "active" : ""} disabled={busy} onClick={() => onOptionsChange({ wall: mm })}>{`${mm} mm`}</button>
              ))}
            </div>
          </>) : null}
          {options.inside !== "solid" && options.infill !== "honeycomb" ? (<>
            <h4 className="dental-group">{t("studio.underside")} <HelpTip text={t("studio.undersideHint")} /></h4>
            <div className="studio-pic-choice two" role="radiogroup" aria-label={t("studio.underside")}>
              {([["open", "none"], ["honeycombBase", "base"]] as const).map(([pic, infill]) => {
                const on = (options.infill ?? "base") === infill;
                return (
                  <button key={pic} type="button" role="radio" aria-checked={on} className={on ? "active" : ""} disabled={busy} onClick={() => onOptionsChange({ infill })}>
                    <BodyPictureSvg kind={pic} />
                    <span>{t(pic === "open" ? "studio.underside.open" : "studio.underside.honeycomb")}</span>
                  </button>
                );
              })}
            </div>
          </>) : null}
        </>) : (<>
        <p className="dental-summary" data-testid="dental-summary">{t("dental.summary", { base: baseName(options.baseStyle), inside: insideName, height: height.toFixed(1) })}</p>
        {custom ? <p className="blend-hint dental-custom">{t("dental.customHint")}</p> : null}
        <h4 className="dental-group">{t("dental.inside")}</h4>
        {choice(t("dental.inside"), options.inside, [["solid", t("dental.solid")], ["open", t("dental.hollowOpen")], ["closed", t("dental.hollowClosed")]] as Array<[DentalInside, string]>, (inside) => onOptionsChange({ inside }), undefined, false)}
        {options.inside !== "solid" ? (
          <>
            <EdgeModifierSlider label={t("dental.wall")} value={options.wall} min={DENTAL_MIN_WALL} max={DENTAL_MAX_WALL} step={0.1} coarse={{ step: 0.5, max: DENTAL_MAX_WALL }} workspace={workspace} length disabled={busy} onChange={(value) => onOptionsChange({ wall: value })} />
            {choice(t("dental.infill"), options.infill ?? "base", [["none", t("dental.infillNone")], ["base", t("dental.infillBase")], ["honeycomb", t("dental.infillFull")]] as Array<[DentalInfill, string]>, (infill) => onOptionsChange({ infill }))}
          </>
        ) : null}
        </>)}
        {/* Build 104: no note under the choices - the presets already pick solid where accuracy matters. */}
      </>)) : null}

      {inMb("base") ? card(n(5), t("dental.stepBase"), scansDone, t("dental.stepBaseHint"), baseSummary, (<>
        {/* Build 64: the model's height in one place, as it stacks up - the teeth (never cut), the gum
            kept below them, and the base - with a picture of the three and their sizes. Both arches. */}
        {framed ? (<>
          {/* Build 106: the scan is used as trimmed (no gum height to set, no gum line to follow) - only the
              base's thickness is chosen, from four. */}
          <div className="studio-height-box" role="group" aria-label={t("dental.heightTitle")}>
            <StudioHeightPicture scan={teethHeight + gumHeight} base={options.base} scanLabel={t("studio.heightScan")} baseLabel={t(options.baseStyle === "ortho" ? "dental.orthoHeight" : "studio.heightBase")} />
            <p className="studio-height-total"><span>{t(pair ? "studio.heightTotalEach" : "dental.heightTotal")}</span><strong>{`${height.toFixed(1)} mm`}</strong></p>
          </div>
          <h4 className="dental-group">{t("studio.baseThickness")}</h4>
          <div className="studio-mm-choice" role="radiogroup" aria-label={t("studio.baseThickness")}>
            {[3, 5, 10, 15].map((mm) => (
              <button key={mm} type="button" role="radio" aria-checked={Math.abs(options.base - mm) < 1e-6} className={Math.abs(options.base - mm) < 1e-6 ? "active" : ""} disabled={busy} onClick={() => onOptionsChange({ base: mm })}>{`${mm} mm`}</button>
            ))}
          </div>
        </>) : null}
        {!framed ? (<>
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
        </>) : null}
      </>)) : null}

      {pair && inMb("label") ? card(n(6), t("dental.step4"), options.hinge, t("dental.step4Hint"), articSummary, framed ? (() => {
        // Build 106: separate or articulated; articulated - the picture, then pin or no pin; with a pin,
        // where it stands, how far from the teeth, and how much it opens the bite (OVD).
        const pinOn = options.incisalPin !== false;
        const place = options.pinPlace ?? (waxup?.view.placed.length ? "sides" : "midline");
        const two = <T extends string>(label: string, value: T, pairs: Array<[T, string, string?]>, onPick: (value: T) => void) => (
          <div className="studio-mm-choice two" role="radiogroup" aria-label={label}>
            {pairs.map(([v, text, tip]) => <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "active" : ""} disabled={busy} title={tip} onClick={() => onPick(v)}>{text}</button>)}
          </div>
        );
        return (<>
          {two(t("dental.step4"), options.hinge ? "artic" : "separate", [["separate", t("studio.separateModels")], ["artic", t("studio.articulatedModels"), t("dental.hingeHint")]], (v) => onOptionsChange(v === "artic" ? { hinge: true, ...(options.hinge ? {} : articulatorPinPatch({ incisalPin: false })) } : { hinge: false }))}
          {options.hinge ? (<>
            {/* Build 106: the picture leads; with a pin it moves down to the Increase OVD slider (below). */}
            {pinOn ? null : (
              <div className="studio-artic-picture"><ArticulatorPicture pinRaise={0} pin={false} pinGap={options.pinGap ?? PIN_CLEAR} /></div>
            )}
            {two(t("dental.incisalPin"), pinOn ? "pin" : "none", [["none", t("studio.noPin"), t("dental.incisalPinOffHint")], ["pin", t("studio.pin"), t("dental.incisalPinHint")]], (v) => onOptionsChange(articulatorPinPatch({ incisalPin: v === "pin" })))}
            {pinOn ? (<>
              {two(t("dental.pinPlace"), place, [["midline", t("studio.pinFront"), t("dental.pinMidlineHint")], ["sides", t("studio.pinSides"), t("dental.pinSidesHint")]], (pinPlace) => onOptionsChange({ pinPlace }))}
              {/* Build 106: as with the pins at the sides - a picture of where the pin stands above its distance,
                  then the side view that opens above Increase OVD. */}
              <div className="studio-artic-picture">{place === "sides" ? <ArticulatorSidesPicture pinGap={options.pinGap ?? PIN_CLEAR} /> : <ArticulatorPicture pinRaise={0} pin pinGap={options.pinGap ?? PIN_CLEAR} />}</div>
              <EdgeModifierSlider label={t("dental.pinGap")} value={options.pinGap ?? PIN_CLEAR} min={PIN_CLEAR} max={PIN_GAP_MAX} step={0.5} workspace={workspace} length disabled={busy} onChange={(value) => onOptionsChange({ pinGap: Math.max(PIN_CLEAR, Math.min(PIN_GAP_MAX, Math.round(value * 2) / 2)) })} />
              {/* Build 106: the models from the side, opening on the condyles as Increase OVD moves. */}
              <div className="studio-artic-picture"><ArticulatorPicture pinRaise={options.pinRaise ?? 0} pin={place !== "sides"} pinGap={options.pinGap ?? PIN_CLEAR} /></div>
              <EdgeModifierSlider label={t("studio.increaseOvd")} title={t("studio.increaseOvdHint")} value={options.pinRaise ?? 0} min={0} max={PIN_MAX} step={PIN_STEP} workspace={workspace} length disabled={busy} onChange={(value) => onOptionsChange(articulatorPinPatch({ pinRaise: Math.max(0, Math.min(PIN_MAX, Math.round(value / PIN_STEP) * PIN_STEP)) }))} />
              {(options.pinRaise ?? 0) > PIN_WARN ? <p className="blend-hint warn">{t("dental.pinRaiseWarn", { max: PIN_WARN })}</p> : null}
            </>) : null}
          </>) : null}
        </>);
      })() : (<>
            <label className="edge-modifier-check dental-hinge-check" title={t("dental.hingeHint")}>
              <input type="checkbox" checked={options.hinge} disabled={busy} onChange={(event) => onOptionsChange({ hinge: event.currentTarget.checked })} />
              <span>{t("dental.hinge")}</span>
            </label>
            {options.hinge ? (
              <div className="dental-hinge-options">
                {/* Build 78: the one articulator - two seats on ball condyles and the incisal pin. */}
                {/* Build 104: the pin either side is drawn from the front; the pictures follow the sliders. */}
                {options.incisalPin !== false && (options.pinPlace ?? (waxup?.view.placed.length ? "sides" : "midline")) === "sides"
                  ? <ArticulatorSidesPicture pinGap={options.pinGap ?? PIN_CLEAR} />
                  : <ArticulatorPicture pinRaise={options.incisalPin === false ? 0 : options.pinRaise ?? 0} pin={options.incisalPin !== false} pinGap={options.pinGap ?? PIN_CLEAR} />}
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
                {/* Build 104: the pin (or the side posts) can stand further from the teeth than the least. */}
                <EdgeModifierSlider label={t("dental.pinGap")} value={options.pinGap ?? PIN_CLEAR} min={PIN_CLEAR} max={PIN_GAP_MAX} step={0.5} workspace={workspace} length disabled={busy} onChange={(value) => onOptionsChange({ pinGap: Math.max(PIN_CLEAR, Math.min(PIN_GAP_MAX, Math.round(value * 2) / 2)) })} />
                </>)}
              </div>
            ) : null}
            {choice(t("dental.layout"), options.layout, [["print", t("dental.layoutPrint")], ["occlusion", t("dental.layoutOcclusion")]], (layout) => onOptionsChange({ layout }))}
      </>)) : null}
      {/* Build 104: the plate base for a metal articulator, here beside the printed one (it was a base picture). */}
      {inMb("label") && !framed ? (
        <label className="edge-modifier-check" title={t("dental.articulatorHint")}>
          <input type="checkbox" checked={options.baseStyle === "articulator"} disabled={busy} onChange={(event) => onOptionsChange({ baseStyle: event.currentTarget.checked ? "articulator" : presetBase })} />
          <span>{t("dental.articulatorBase")}</span>
        </label>
      ) : null}

      {inMb("label") ? card(n(pair ? 7 : 6), t(framed ? "studio.nameLabel" : "dental.stepName"), Boolean(options.label.trim()) || patientDetails === "remove", t("dental.stepNameHint"), nameSummary, (<>
        {/* Build 106: in the frame, just the patient's details for the label (and the files) - always kept. */}
        {framed ? (
          <label className="studio-label-field">
            <span>{t("dental.patientDetails")}</span>
            <input type="text" maxLength={24} value={options.label} placeholder={t("studio.labelPlaceholder")} disabled={busy} onChange={(event) => onOptionsChange({ label: event.currentTarget.value })} />
          </label>
        ) : null}
        {!framed && onPatientDetails ? choice(t("dental.patientDetails"), patientDetails, [["keep", t("dental.patientKeep")], ["remove", t("dental.patientRemove")]], onPatientDetails, t("dental.patientDetailsHint")) : null}
        {framed ? null : patientDetails === "remove" ? <p className="blend-hint">{t("dental.patientRemoveHint")}</p> : (<>
        <label className="dental-label-field">
          <span>{t("dental.label")}</span>
          <input type="text" maxLength={24} value={options.label} placeholder={t("dental.labelPlaceholder")} disabled={busy} onChange={(event) => onOptionsChange({ label: event.currentTarget.value })} />
        </label>
        {options.label.trim() ? <p className="blend-hint">{t(options.baseStyle === "ortho" || options.baseStyle === "articulator" ? "dental.labelOrtho" : options.inside === "open" ? "dental.labelClosed" : "dental.labelPlate")}</p> : null}
        </>)}
        {/* Build 106: in the frame, Make models closes the step's panel (not the bar below). */}
        {framed ? <div className="studio-make">{makeButton}</div> : null}
      </>)) : null}
      </>) : null}

      {notes.map((note) => <p key={note} className="dental-status warn" role="status">{note}</p>)}
      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : null}
      {/* Build 77: an error never leaves the person without a next move. */}
      {error ? <p className="dental-status dental-error-help" role="status">{t("dental.errorHelp")}</p> : null}
      {nextStep && (!waxSteps || waxStep === "make") && mbLast ? <p className="dental-next" role="status">{nextStep}</p> : null}
      {framed ? null : waxStepButtons}
      {framed || mbLast ? null : mbStepButtons}
      {!framed && mbLast ? <div className="edge-modifier-footer">
        {/* Build 79: while making, Cancel stops it. Build 104: in Model Builder's steps, Back stands here on the last one (the panel's X closes it). */}
        {mbSteps && stage !== "making" ? (
          <button type="button" className="secondary" disabled={mbIndex <= 0} onClick={() => setMbStepId(mbSteps[mbIndex - 1])}><ArrowLeft size={16} /> {t("waxStudio.back")}</button>
        ) : (
          <button type="button" className="secondary" onClick={onCancel}>{stage === "making" ? t("dental.stopMaking") : t("common.cancel")}</button>
        )}
        {(!waxSteps || waxStep === "make") && mbLast ? <button type="button" className="primary" disabled={!ready} onClick={onApply}>
          {stage === "making" ? <LoaderCircle className="edge-modifier-spinner" size={17} /> : <Check size={17} />}
          {stage === "making" ? t("dental.working") : editing ? t("dental.updateModels") : t(pair ? "dental.applyPair" : "dental.apply")}
        </button> : null}
      </div> : null}
      </>)}
      </SmoothSliders.Provider>)}
    </MovableToolPanel>
  );
}
