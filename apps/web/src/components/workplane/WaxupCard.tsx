"use client";

/**
 * Build 79: Dental Studio's wax-up step - a tooth set from a library set over the scan's anterior
 * teeth, placed from three landmarks, then adjusted tooth by tooth with the usual handles. The wax
 * only ever adds; Make joins it to the model.
 */
import { AlertTriangle, Check, LoaderCircle, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { EGGSHELL_MAX_WALL, EGGSHELL_MIN_WALL, EGGSHELL_WALL } from "@/lib/dentalEggshell";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { t } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages.en";
import { IMT_REDUCE, IMT_UNSUPPORTED, imtFirstInjection, type SmileCheck, type ToothAdjust, type ToothNudge } from "@/lib/dentalWaxup";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

/** How long the wax can make the teeth, mm (negative shortens). */
export const WAX_LENGTHEN = { min: -2, max: 3, step: 0.25 } as const;
/** Wax over the patient's tooth below this, mm, is pointed out. */
export const WAX_THIN = 0.2;

export type WaxupView = {
  slot: "upper" | "lower";
  /** The tooth set loaded, and how many teeth it has. */
  setName: string | null;
  /** Build 79: the sets that ship with Pare 3D, and the one chosen (null = none, or one loaded from a file). */
  builtIn: Array<{ id: string; name: string; library?: string; credit?: string; preview?: string | null; arch?: "upper" | "lower" }>;
  builtInCredit: string | null;
  setId: string | null;
  teeth: number;
  /** Landmarks marked so far (0-3), and the one being clicked now. */
  marked: number;
  picking: number | null;
  lengthen: number;
  /** The central's width over length the plan aims for (0.7-0.9). */
  centralRatio: number;
  /** Canine tips above the centrals' edges, mm; null = the patient's own step when in range. */
  arcDepth: number | null;
  /** The step the last placing used. */
  arcUsed: number | null;
  proportions: "natural" | "library";
  busy: boolean;
  placed: Array<{ id: string; fdi: number; clearance: number | null; width: number; length: number; lengthening: number; extension: number; /** Build 102: the reduction it asks of the patient's tooth, mm. */ reduce?: number }>;
  /** Build 103: Position (the whole library teeth) or adapted to the patient's teeth. */
  stage: "position" | "adapted";
  setMove: WaxSetMove;
  chain: boolean;
  /** Build 79: also make a model with wax on alternate teeth only (injection moulding, first injection). */
  alternate: boolean;
  selected: string | null;
  /** Build 103: the selected tooth's change from where it was placed (null: not on the patient's teeth). */
  selectedAdjust?: ToothAdjust | null;
  /** Adjusting a tooth adjusts the same tooth on the other side too. */
  mirror: boolean;
  error: string | null;
  /** Build 94: the tooth finder - loaded (its file's name) or not, at work (share done). */
  finder: { name: string | null; busy: boolean; progress: number | null };
  /** Build 94: the teeth found on this arch (FDI; agreed = the network's own number), and those chosen for the wax-up. */
  found: Array<{ fdi: number; agreed: boolean }> | null;
  chosen: number[];
  /** Build 101: the wax-up's own Undo and Redo. */
  canUndo?: boolean;
  canRedo?: boolean;
  /** The teeth shown in colour over the scan. */
  teethShown: boolean;
  /** Build 94: each library tooth fitted to the patient's own (teeth found), or the set laid out by smile design from the landmarks. */
  fit: "teeth" | "smile";
  /** Build 94: the ghost view - how solid the wax is drawn (1 solid; less shows the scan through it). */
  ghost: number;
  /** Build 94: on the patient's teeth, how far towards the smile design (0 the patient's own, 1 the design). */
  ideal: number;
  /** Widths in the smile design: natural steps (null), or the RED proportion. */
  red: number | null;
  /** Build 94: the smile checked after placing (fitted on the teeth found). */
  checks: SmileCheck[] | null;
  /** Build 94: occlusion at the opened bite - shown when both arches are in the studio. */
  occlusion: {
    ready: boolean; busy: boolean;
    raise: number; scheme: "canine" | "group"; guidance: number; bennett: number;
    result: { rest: Array<{ fdi: number; gap: number }>; openings: Array<{ fdi: number; mm: number }>; findings: Array<{ text: string; count: number; nonworking: boolean }>; carved: Array<{ fdi: number; mm: number }>; fitted?: Array<{ fdi: number; mm: number }>; missing: number; lowerPose?: number[]; raise: number; waxKey?: string } | null;
  };
};

export type WaxupActions = {
  onSet: (files: File[]) => void;
  onBuiltIn: (id: string) => void;
  onSlot: (slot: "upper" | "lower") => void;
  onMark: () => void;
  onLengthen: (mm: number) => void;
  onCentralRatio: (ratio: number) => void;
  onArcDepth: (mm: number | null) => void;
  onProportions: (value: "natural" | "library") => void;
  onPlace: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onRemove: () => void;
  onSelect: (id: string) => void;
  onNudge: (id: string, nudge: ToothNudge, amount: number) => void;
  /** Build 102: the one-click helpers. */
  onHelper: (kind: "level" | "arc" | "mirrorTooth" | "mirrorSide" | "resetTooth" | "resetAll") => void;
  /** Build 103: the whole set moved (mm), chain or single-tooth moves, and the position confirmed (on to Adapt). */
  onSetMove: (patch: Partial<WaxSetMove>) => void;
  onChain: (on: boolean) => void;
  onConfirm: () => void;
  onStage: (stage: "position" | "adapted") => void;
  /** Build 103: a change to a tooth (exact values, steps). */
  onAdjust: (id: string, change: ToothAdjust) => void;
  /** Build 103: an eggshell provisional from the adapted teeth, with this wall (mm). */
  onEggshell: (wall: number) => void;
  onMirror: (on: boolean) => void;
  onAlternate: (on: boolean) => void;
  onLoadFinder: (file: File) => void;
  onFindTeeth: () => void;
  onChoose: (fdi: number) => void;
  onChooseGroup: (group: "front" | "front-premolars" | "none") => void;
  onTeethShown: (shown: boolean) => void;
  onFit: (fit: "teeth" | "smile") => void;
  onGhost: (opacity: number) => void;
  onIdeal: (share: number) => void;
  onRed: (red: number | null) => void;
  onOcclusion: (patch: Partial<{ raise: number; scheme: "canine" | "group"; guidance: number; bennett: number }>) => void;
  onWorkOcclusion: () => void;
};

/** One click of an adjusting button: mm, or degrees for a turn. */
export const WAX_NUDGE = 0.25;
export const WAX_TURN = 2;
/** Build 103: thicker and the whole tooth larger, a share a click (5%). */
export const WAX_SCALE_STEP = 0.05;

/** The landmark clicked at each step, in order. */
export const WAXUP_LANDMARKS = ["waxup.pickMidline", "waxup.pickCanine1", "waxup.pickCanine2"] as const;

export function waxupSummary(view: WaxupView) {
  if (view.placed.length) return t("waxup.summaryPlaced", { count: view.placed.length });
  if (view.setName) return t("waxup.summarySet", { name: view.setName });
  return t("waxup.summaryNone");
}

/** Build 94: teeth in arch order (upper right to left, lower left to right), for the chips. */
export const archOrder = (fdi: number) => { const q = Math.floor(fdi / 10), n = fdi % 10; return q === 1 || q === 4 ? -n : n; };

/** Build 101: Wax-up Studio's steps that live in this card (shown one at a time; all of them without a step). */
/** Build 103: the whole set's move - intercanine width, forward/back, midline (to the patient's left), edges longer. */
export type WaxSetMove = { width: number; depth: number; midline: number; height: number };
export type WaxupPart = "find" | "choose" | "set" | "place" | "adjust" | "occlusion";

/** Build 102: reductions shown from this, mm (less is within a scan's own noise). */
const WAX_REDUCE_SHOWN = 0.2;

/**
 * Build 103: the selected tooth's exact values - each move, turn and size as a number to read and to
 * type, with fine steps either side (Shift: five times, Alt: a fifth). Moves and turns are from where
 * the tooth was placed; width and length are the tooth's own, mm.
 */
const VALUE_ROWS = [
  { key: "mesial", unit: "mm", step: 0.1 }, { key: "out", unit: "mm", step: 0.1 }, { key: "up", unit: "mm", step: 0.1 },
  { key: "turn", unit: "°", step: 1 }, { key: "tip", unit: "°", step: 1 }, { key: "torque", unit: "°", step: 1 },
  { key: "wider", unit: "mm", step: 0.1 }, { key: "longer", unit: "mm", step: 0.1 }, { key: "thicker", unit: "%", step: 2 }, { key: "size", unit: "%", step: 2 },
] as const;
function ToothValues({ tooth, adjust, disabled, onAdjust }: { tooth: { width: number; length: number }; adjust: ToothAdjust; disabled: boolean; onAdjust: (change: ToothAdjust) => void }) {
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const shown = (key: (typeof VALUE_ROWS)[number]["key"]) => {
    if (key === "wider") return tooth.width;
    if (key === "longer") return tooth.length;
    if (key === "thicker") return (adjust.thicker ?? 1) * 100;
    // The whole tooth's size: the three factors' geometric mean.
    if (key === "size") return Math.cbrt((adjust.wider ?? 1) * (adjust.longer ?? 1) * (adjust.thicker ?? 1)) * 100;
    return adjust[key] ?? 0;
  };
  /** The change that takes a value from what it is to `to`. */
  const changeTo = (key: (typeof VALUE_ROWS)[number]["key"], to: number): ToothAdjust | null => {
    const now = shown(key);
    if (!Number.isFinite(to) || Math.abs(to - now) < 1e-6) return null;
    if (key === "wider" || key === "longer") return to > 0.5 ? { [key]: to / Math.max(0.5, now) } : null;
    if (key === "thicker") return to > 30 ? { thicker: to / Math.max(1, now) } : null;
    if (key === "size") { if (to <= 30) return null; const k = to / Math.max(1, now); return { wider: k, longer: k, thicker: k }; }
    return { [key]: to - now };
  };
  const commit = () => {
    if (!editing) return;
    const row = VALUE_ROWS.find((r) => r.key === editing.key)!;
    const value = Number(editing.value.replace(",", ".").replace(/[^0-9.+-]/g, ""));
    setEditing(null);
    const change = changeTo(row.key, value);
    if (change) onAdjust(change);
  };
  return (
    <div className="waxup-values" role="group">
      {VALUE_ROWS.map((row) => {
        const value = shown(row.key);
        const text = row.key === "wider" || row.key === "longer" ? value.toFixed(2) : row.unit === "%" ? value.toFixed(0) : `${value >= 0 ? "+" : ""}${value.toFixed(row.unit === "°" ? 1 : 2)}`;
        const stepBy = (sign: number, event: React.MouseEvent) => {
          const k = event.shiftKey ? 5 : event.altKey ? 0.2 : 1;
          const change = changeTo(row.key, value + sign * row.step * k);
          if (change) onAdjust(change);
        };
        return (
          <div key={row.key} className="waxup-value-row">
            <span className="waxup-value-label">{t(`toothGimbal.short.${row.key}`)}</span>
            <button type="button" disabled={disabled} aria-label={t("waxup.valueLess", { what: t(`toothGimbal.short.${row.key}`) })} onClick={(event) => stepBy(-1, event)}>−</button>
            <input
              type="text"
              inputMode="decimal"
              disabled={disabled}
              value={editing?.key === row.key ? editing.value : text}
              onFocus={(event) => { setEditing({ key: row.key, value: text }); event.currentTarget.select(); }}
              onChange={(event) => { const v = event.currentTarget.value; setEditing({ key: row.key, value: v }); }}
              onBlur={commit}
              onKeyDown={(event) => { if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur(); else if (event.key === "Escape") { setEditing(null); (event.currentTarget as HTMLInputElement).blur(); } }}
              aria-label={t(`toothGimbal.short.${row.key}`)}
            />
            <span className="waxup-value-unit">{row.unit}</span>
            <button type="button" disabled={disabled} aria-label={t("waxup.valueMore", { what: t(`toothGimbal.short.${row.key}`) })} onClick={(event) => stepBy(1, event)}>+</button>
          </div>
        );
      })}
      <p className="blend-hint">{t("waxup.valuesHint")}</p>
    </div>
  );
}

export function WaxupCard({ view, actions, slots, busy, workspace, imt = false, part }: { view: WaxupView; actions: WaxupActions; slots: { upper: boolean; lower: boolean }; busy: boolean; workspace: WorkplaneWorkspaceSettings; imt?: boolean; part?: WaxupPart }) {
  const show = (which: WaxupPart) => !part || part === which;
  const file = useRef<HTMLInputElement>(null);
  const finderFile = useRef<HTMLInputElement>(null);
  const [eggshellWall, setEggshellWall] = useState(EGGSHELL_WALL);
  const working = busy || view.busy;
  // Build 94: the sets for the arch being waxed (and any whose arch is not known).
  const sets = view.builtIn.filter((set) => !set.arch || set.arch === view.slot);
  // Build 94: fitted to the teeth found needs teeth chosen; set out by smile design, the three landmarks.
  const fitTeeth = view.fit === "teeth" && Boolean(view.found?.length);
  const placeable = Boolean(view.setName) && (fitTeeth ? view.chosen.length > 0 : view.marked === 3);
  const thin = view.placed.filter((tooth) => tooth.clearance !== null && tooth.clearance < WAX_THIN);
  const selectedTooth = view.placed.find((tooth) => tooth.id === view.selected) ?? null;
  const lengthening = [...view.placed].filter((tooth) => tooth.lengthening > 0).sort((a, b) => a.fdi - b.fdi);
  const sorted = [...view.placed].sort((a, b) => a.fdi - b.fdi);
  const unsupported = sorted.filter((tooth) => tooth.extension > IMT_UNSUPPORTED + 1e-6);
  const reduce = sorted.filter((tooth) => tooth.extension < -IMT_REDUCE);
  const cutBack = sorted.filter((tooth) => (tooth.reduce ?? 0) >= WAX_REDUCE_SHOWN);
  const first = sorted.filter((tooth) => imtFirstInjection(tooth.fdi));
  return (
    <div className="waxup-card">
      {part ? null : <p className="blend-hint">{t("waxup.hint")}</p>}
      {slots.upper && slots.lower && part !== "occlusion" ? (
        <div className="dental-trim-mode" role="radiogroup" aria-label={t("waxup.arch")}>
          {(["upper", "lower"] as const).map((slot) => (
            <button key={slot} type="button" role="radio" aria-checked={view.slot === slot} className={view.slot === slot ? "active" : ""} disabled={working} onClick={() => actions.onSlot(slot)}>
              {t(slot === "upper" ? "dental.upper" : "dental.lower")}
            </button>
          ))}
        </div>
      ) : null}

      {/* Build 94: the teeth found on the scan, and those to wax up. */}
      {show("find") || show("choose") ? (
      <div className="dental-substep">
        {part ? null : <h4 className="dental-substep-title">{t("waxup.findStep")}</h4>}
        <input ref={finderFile} type="file" accept=".ptw" hidden onChange={(event) => { const f = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (f) actions.onLoadFinder(f); }} />
        {view.finder.name ? (
          <>
            {show("find") ? (<>
            <div className="dental-trim-buttons">
              <button type="button" className={view.found ? "" : "active"} disabled={working || view.finder.busy} onClick={actions.onFindTeeth}>
                {view.finder.busy ? <LoaderCircle className="edge-modifier-spinner" size={15} /> : null} {t(view.found ? "waxup.findAgain" : "waxup.find")}
              </button>
            </div>
            {view.finder.busy && view.finder.progress !== null ? <p className="blend-hint" role="status">{t("waxup.finding", { share: Math.round(view.finder.progress * 100) })}</p> : null}
            </>) : null}
            {view.found && part === "find" ? <p className="blend-hint">{t(view.found.length ? "waxup.foundHint" : "waxup.foundNone", { count: view.found.length })}</p> : null}
            {view.found && show("choose") ? (
              <>
                <p className="blend-hint">{t(view.found.length ? "waxup.foundHint" : "waxup.foundNone", { count: view.found.length })}</p>
                <div className="waxup-teeth waxup-found" role="group" aria-label={t("waxup.chooseTeeth")}>
                  {/* Build 94: phase 1 is the anterior wax-up - premolar to premolar at most (IMT's range); molars wait for the posterior studio. */}
                  {[...view.found].filter((tooth) => tooth.fdi % 10 <= 5).sort((a, b) => archOrder(a.fdi) - archOrder(b.fdi)).map((tooth) => (
                    <button key={tooth.fdi} type="button" aria-pressed={view.chosen.includes(tooth.fdi)} className={`waxup-tooth${view.chosen.includes(tooth.fdi) ? " active" : ""}${tooth.agreed ? "" : " unsure"}`} title={t(tooth.agreed ? "waxup.toothFound" : "waxup.toothRenumbered", { fdi: tooth.fdi })} disabled={working} onClick={() => actions.onChoose(tooth.fdi)}>
                      {tooth.fdi}
                    </button>
                  ))}
                </div>
                <div className="dental-trim-buttons waxup-groups">
                  {(["front", "front-premolars", "none"] as const).map((group) => (
                    <button key={group} type="button" className="secondary" disabled={working} onClick={() => actions.onChooseGroup(group)}>{t(`waxup.group.${group}`)}</button>
                  ))}
                </div>
                <label className="edge-modifier-check">
                  <input type="checkbox" checked={view.teethShown} onChange={(event) => actions.onTeethShown(event.currentTarget.checked)} />
                  <span>{t("waxup.showTeeth")}</span>
                </label>
              </>
            ) : show("find") && !view.found ? <p className="blend-hint">{t("waxup.findHint")}</p> : show("choose") && !view.found ? <p className="blend-hint">{t("waxup.chooseNeedsFind")}</p> : null}
            {show("find") ? <p className="blend-hint">{t("waxup.finderLoaded", { name: view.finder.name })} <button type="button" className="link-button" disabled={working} onClick={() => finderFile.current?.click()}>{t("waxup.finderChange")}</button></p> : null}
          </>
        ) : (
          <>
            <p className="blend-hint">{t("waxup.finderNone")}</p>
            <button type="button" className="dental-import" disabled={working} onClick={() => finderFile.current?.click()}><Upload size={15} /> {t("waxup.loadFinder")}</button>
          </>
        )}
      </div>
      ) : null}

      {show("set") ? (
      <div className="dental-substep">
        {part ? null : <h4 className="dental-substep-title">{t("waxup.setStep")}</h4>}
        <input
          ref={file}
          type="file"
          accept=".obj,.stl,.zip,.eoff,.xml"
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (files.length) actions.onSet(files);
          }}
        />
        {view.builtIn.length ? (
          // Build 91: the sets as pictures. Build 102: Pare's own sets by their Pare names (no heading); an
          // exocad library the user loads, under "Your library".
          <div className="waxup-sets" role="radiogroup" aria-label={t("waxup.builtIn")}>
            {[...new Set(sets.map((set) => set.library ?? ""))].map((library) => (
              <div key={library} className="waxup-set-library">
                {library ? <span className="waxup-set-library-name">{library === "own" ? t("waxup.ownLibrary") : library}</span> : null}
                <div className="waxup-set-grid">
                  {sets.filter((set) => (set.library ?? "") === library).map((set) => (
                    <button key={set.id} type="button" role="radio" aria-checked={view.setId === set.id} className={`waxup-set${view.setId === set.id ? " active" : ""}`} disabled={working} title={set.name} onClick={() => actions.onBuiltIn(set.id)}>
                      {set.preview ? <img src={set.preview} alt="" loading="lazy" /> : <span className="waxup-set-blank" aria-hidden="true" />}
                      <span>{set.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <button type="button" className="dental-import" disabled={working} onClick={() => file.current?.click()}><Upload size={15} /> {t("waxup.loadSet")}</button>
        <p className="blend-hint">{view.setName ? t("waxup.setLoaded", { name: view.setName, count: view.teeth }) : t("waxup.setHint")}</p>
      </div>
      ) : null}

      {!part || (part === "place" && !fitTeeth) ? (
      <div className="dental-substep">
        <h4 className="dental-substep-title">{t("waxup.markStep")}</h4>
        <p className="blend-hint">{view.picking !== null ? t(WAXUP_LANDMARKS[view.picking]) : view.marked === 3 ? t(view.found ? "waxup.markedFound" : "waxup.marked") : t("waxup.markHint")}</p>
        <div className="dental-trim-buttons">
          <button type="button" className={view.marked === 3 ? "" : "active"} disabled={working || view.picking !== null} onClick={actions.onMark}>{t(view.marked === 3 ? "waxup.markAgain" : "waxup.mark")}</button>
        </div>
      </div>
      ) : null}

      {show("place") || show("adjust") ? (
      <div className="dental-substep">
        {part ? null : <h4 className="dental-substep-title">{t("waxup.placeStep")}</h4>}
        {show("place") ? (<>
        {view.found?.length ? (
          <div className="dental-trim-mode" role="radiogroup" aria-label={t("waxup.fit")}>
            {(["teeth", "smile"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={view.fit === value} className={view.fit === value ? "active" : ""} disabled={working} onClick={() => actions.onFit(value)}>{t(value === "teeth" ? "waxup.fitTeeth" : "waxup.fitSmile")}</button>
            ))}
          </div>
        ) : null}
        <p className="blend-hint">{t(fitTeeth ? "waxup.fitTeethHint" : "waxup.designHint")}</p>
        {fitTeeth ? (
          <>
            <EdgeModifierSlider label={t("waxup.ideal")} value={Math.round(view.ideal * 100)} min={0} max={100} step={5} unit="%" workspace={workspace} disabled={working} onChange={(value) => actions.onIdeal(Math.max(0, Math.min(1, Math.round(value) / 100)))} />
            <p className="blend-hint">{t("waxup.idealHint")}</p>
            {view.ideal > 0 ? (
              <>
                <EdgeModifierSlider label={t("waxup.centralRatio")} value={Math.round(view.centralRatio * 100)} min={70} max={90} step={1} unit="%" workspace={workspace} disabled={working} onChange={(value) => actions.onCentralRatio(Math.max(0.7, Math.min(0.9, Math.round(value) / 100)))} />
                <EdgeModifierSlider label={t("waxup.arcDepth")} value={view.arcDepth ?? 1} min={0} max={3} step={0.25} workspace={workspace} length disabled={working} onChange={(value) => actions.onArcDepth(Math.max(0, Math.min(3, Math.round(value / 0.25) * 0.25)))} />
                <div className="dental-trim-mode" role="radiogroup" aria-label={t("waxup.proportions")}>
                  <button type="button" role="radio" aria-checked={view.red === null} className={view.red === null ? "active" : ""} disabled={working} onClick={() => actions.onRed(null)}>{t("waxup.propSteps")}</button>
                  <button type="button" role="radio" aria-checked={view.red !== null} className={view.red !== null ? "active" : ""} disabled={working} onClick={() => actions.onRed(0.7)}>{t("waxup.propRed")}</button>
                </div>
                {view.red !== null ? <EdgeModifierSlider label={t("waxup.red")} value={Math.round(view.red * 100)} min={62} max={80} step={1} unit="%" workspace={workspace} disabled={working} onChange={(value) => actions.onRed(Math.max(0.62, Math.min(0.8, Math.round(value) / 100)))} /> : null}
                <p className="blend-hint">{t(view.red === null ? "waxup.propStepsHint" : "waxup.propRedHint")}</p>
              </>
            ) : null}
          </>
        ) : null}
        {fitTeeth ? null : (<>
        <EdgeModifierSlider label={t("waxup.centralRatio")} value={Math.round(view.centralRatio * 100)} min={70} max={90} step={1} unit="%" workspace={workspace} disabled={working} onChange={(value) => actions.onCentralRatio(Math.max(0.7, Math.min(0.9, Math.round(value) / 100)))} />
        <EdgeModifierSlider label={t("waxup.arcDepth")} value={view.arcDepth ?? view.arcUsed ?? 1} min={0} max={3} step={0.25} workspace={workspace} length disabled={working} onChange={(value) => actions.onArcDepth(Math.max(0, Math.min(3, Math.round(value / 0.25) * 0.25)))} />
        <p className="blend-hint">{view.arcDepth === null ? t("waxup.arcAuto") : <>{t("waxup.arcSet")}{" "}<button type="button" className="link-button" disabled={working} onClick={() => actions.onArcDepth(null)}>{t("waxup.arcBack")}</button></>}</p>
        <div className="dental-trim-mode" role="radiogroup" aria-label={t("waxup.proportions")}>
          {(["natural", "library"] as const).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={view.proportions === value} className={view.proportions === value ? "active" : ""} disabled={working} onClick={() => actions.onProportions(value)}>
              {t(value === "natural" ? "waxup.propNatural" : "waxup.propLibrary")}
            </button>
          ))}
        </div>
        </>)}
        <EdgeModifierSlider label={t("waxup.lengthen")} value={view.lengthen} min={WAX_LENGTHEN.min} max={WAX_LENGTHEN.max} step={WAX_LENGTHEN.step} workspace={workspace} length disabled={working} onChange={(value) => actions.onLengthen(Math.max(WAX_LENGTHEN.min, Math.min(WAX_LENGTHEN.max, Math.round(value / WAX_LENGTHEN.step) * WAX_LENGTHEN.step)))} />
        <div className="dental-trim-buttons">
          <button type="button" className={placeable ? "active" : ""} disabled={working || !placeable || view.picking !== null} onClick={actions.onPlace}>
            {view.busy ? <LoaderCircle className="edge-modifier-spinner" size={15} /> : <Check size={15} />} {t(view.placed.length ? "waxup.placeAgain" : "waxup.place")}
          </button>
          {view.placed.length ? <button type="button" className="secondary" disabled={working} onClick={actions.onRemove}>{t("waxup.remove")}</button> : null}
        </div>
        {view.placed.length && part === "place" ? <p className="blend-hint">{t("waxup.placedLive", { count: view.placed.length })}</p> : null}
        {view.placed.length && part === "place" ? (
          <>
            {/* Build 103: Position - the whole library teeth, moved as a set, as a chain or one by one, then confirmed. */}
            <h5 className="waxup-subhead">{t("waxup.setMove")}</h5>
            {([["width", -4, 4], ["depth", -3, 3], ["midline", -3, 3], ["height", -2, 2]] as const).map(([key, min, max]) => (
              <EdgeModifierSlider key={key} label={t(`waxup.setMove.${key}`)} value={view.setMove[key]} min={min} max={max} step={0.1} workspace={workspace} length disabled={working} onChange={(value) => actions.onSetMove({ [key]: Math.max(min, Math.min(max, Math.round(value * 10) / 10)) })} />
            ))}
            <p className="blend-hint">{t("waxup.setMoveHint")}</p>
            <div className="waxup-teeth" role="group" aria-label={t("waxup.teeth")}>
              {[...view.placed].sort((a, b) => a.fdi - b.fdi).map((tooth) => {
                const low = tooth.clearance !== null && tooth.clearance < WAX_THIN;
                return (
                  <button
                    key={tooth.id}
                    type="button"
                    className={`waxup-tooth${view.selected === tooth.id ? " active" : ""}${low ? " warn" : ""}`}
                    title={t("waxup.toothInfo", { fdi: tooth.fdi, width: tooth.width.toFixed(1), length: tooth.length.toFixed(1), ratio: Math.round((tooth.width / Math.max(0.1, tooth.length)) * 100), wax: tooth.clearance === null ? "-" : tooth.clearance.toFixed(2) })}
                    onClick={() => actions.onSelect(tooth.id)}
                  >
                    {low ? <AlertTriangle size={12} aria-hidden="true" /> : null}{tooth.fdi}
                  </button>
                );
              })}
            </div>
            <EdgeModifierSlider label={t("waxup.ghost")} value={Math.round(view.ghost * 100)} min={10} max={100} step={5} unit="%" workspace={workspace} onChange={(value) => actions.onGhost(Math.max(0.1, Math.min(1, Math.round(value) / 100)))} />
            <p className="blend-hint">{t("waxup.ghostHint")}</p>
            <div className="dental-trim-mode" role="radiogroup" aria-label={t("waxup.moveMode")}>
              {([true, false] as const).map((chain) => (
                <button key={String(chain)} type="button" role="radio" aria-checked={view.chain === chain} className={view.chain === chain ? "active" : ""} disabled={working} onClick={() => actions.onChain(chain)}>{t(chain ? "waxup.chain" : "waxup.single")}</button>
              ))}
            </div>
            <p className="blend-hint">{t(view.chain ? "waxup.chainHint" : "waxup.singleHint")}</p>
            {selectedTooth ? (
              <div className="waxup-adjust" role="group" aria-label={t("waxup.adjustTooth", { fdi: selectedTooth.fdi })}>
                <h5>{t("waxup.adjustTooth", { fdi: selectedTooth.fdi })}</h5>
                {view.selectedAdjust ? <ToothValues tooth={selectedTooth} adjust={view.selectedAdjust} disabled={working} onAdjust={(change) => actions.onAdjust(selectedTooth.id, change)} /> : null}
                {view.selectedAdjust ? null : ([["out", "waxup.in", "waxup.out", WAX_NUDGE], ["mesial", "waxup.distal", "waxup.mesial", WAX_NUDGE], ["longer", "waxup.shorter", "waxup.longer", WAX_NUDGE], ["wider", "waxup.narrower", "waxup.wider", WAX_NUDGE], ["thicker", "waxup.thinner", "waxup.thicker", WAX_SCALE_STEP], ["size", "waxup.smaller", "waxup.larger", WAX_SCALE_STEP], ["turn", "waxup.turnIn", "waxup.turnOut", WAX_TURN]] as const).map(([nudge, less, more, step]) => (
                  <div key={nudge} className="waxup-adjust-row">
                    <button type="button" disabled={working} onClick={() => actions.onNudge(selectedTooth.id, nudge, -step)}>{t(less)}</button>
                    <button type="button" disabled={working} onClick={() => actions.onNudge(selectedTooth.id, nudge, step)}>{t(more)}</button>
                  </div>
                ))}
                <label className="edge-modifier-check">
                  <input type="checkbox" checked={view.mirror} onChange={(event) => actions.onMirror(event.currentTarget.checked)} />
                  <span>{t("waxup.mirror")}</span>
                </label>
              </div>
            ) : null}
            {/* Build 102: most alignment in a click - the edges levelled or on the smile arc, a side mirrored. */}
            <div className="waxup-helpers" role="group" aria-label={t("waxup.helpers")}>
              <h5>{t("waxup.helpers")}</h5>
              <div className="dental-trim-buttons">
                {(["level", "arc"] as const).map((kind) => (
                  <button key={kind} type="button" className="secondary" disabled={working} title={t(`waxup.helper.${kind}Hint`)} onClick={() => actions.onHelper(kind)}>{t(`waxup.helper.${kind}`)}</button>
                ))}
                {(["mirrorTooth", "mirrorSide"] as const).map((kind) => (
                  <button key={kind} type="button" className="secondary" disabled={working || !selectedTooth} title={t(`waxup.helper.${kind}Hint`)} onClick={() => actions.onHelper(kind)}>{t(`waxup.helper.${kind}`)}</button>
                ))}
                {view.fit === "teeth" ? (["resetTooth", "resetAll"] as const).map((kind) => (
                  <button key={kind} type="button" className="secondary" disabled={working || (kind === "resetTooth" && !selectedTooth)} title={t(`waxup.helper.${kind}Hint`)} onClick={() => actions.onHelper(kind)}>{t(`waxup.helper.${kind}`)}</button>
                )) : null}
              </div>
            </div>
            <p className="blend-hint">{t("waxup.positionHint")}</p>
            <div className="dental-trim-buttons">
              <button type="button" className="active" disabled={working} onClick={actions.onConfirm}><Check size={15} /> {t("waxup.confirm")}</button>
            </div>
          </>
        ) : null}
        </>) : null}
        {part === "adjust" && !view.placed.length ? <p className="blend-hint">{t("waxup.adjustNeedsPlace")}</p> : null}
        {view.placed.length && show("adjust") ? (
          <>
            {/* Build 103: Adapt - the confirmed teeth fitted to the patient's: the neck on the margin, the model cut back. */}
            {view.stage === "adapted" && !view.busy ? <p className="dental-status" role="status"><Check size={15} /> {t("waxup.adapted", { count: view.placed.length })}</p> : <p className="blend-hint" role="status"><LoaderCircle className="edge-modifier-spinner" size={15} /> {t("waxup.adapting")}</p>}
            {view.checks?.length ? (
              <details className="waxup-checks" open={view.checks.some((c) => c.level === "warn")}>
                <summary>{t("waxup.checks", { warn: view.checks.filter((c) => c.level === "warn").length, all: view.checks.length })}</summary>
                <ul>
                  {view.checks.map((check, i) => (
                    <li key={i} className={check.level}>{check.level === "warn" ? <AlertTriangle size={12} aria-hidden="true" /> : <Check size={12} aria-hidden="true" />} {t(check.key as MessageKey, check.values)}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            <table className="waxup-table">
              <thead><tr><th>{t("waxup.colTooth")}</th><th>{t("waxup.colWidth")}</th><th>{t("waxup.colLength")}</th><th>{t("waxup.colRatio")}</th><th>{t("waxup.colEdge")}</th><th>{t("waxup.colLengthening")}</th><th>{t("waxup.colReduce")}</th></tr></thead>
              <tbody>
                {[...view.placed].sort((a, b) => a.fdi - b.fdi).map((tooth) => (
                  <tr key={tooth.id}>
                    <td>{tooth.fdi}</td><td>{tooth.width.toFixed(1)}</td><td>{tooth.length.toFixed(1)}</td><td>{Math.round((tooth.width / Math.max(0.1, tooth.length)) * 100)}%</td><td className={tooth.extension > IMT_UNSUPPORTED + 1e-6 || tooth.extension < -IMT_REDUCE ? "warn" : ""}>{tooth.extension >= 0 ? "+" : ""}{tooth.extension.toFixed(1)}</td><td>{tooth.lengthening > 0 ? tooth.lengthening.toFixed(1) : "-"}</td><td>{(tooth.reduce ?? 0) >= WAX_REDUCE_SHOWN ? tooth.reduce!.toFixed(1) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {unsupported.length ? <p className="dental-status warn" role="status">{t("waxup.unsupported", { teeth: unsupported.map((tooth) => `${tooth.fdi} (${tooth.extension.toFixed(1)} mm)`).join(", "), mm: IMT_UNSUPPORTED })}</p> : null}
            {reduce.length ? <p className="dental-status warn" role="status">{t("waxup.reduce", { teeth: reduce.map((tooth) => `${tooth.fdi} (${(-tooth.extension).toFixed(1)} mm)`).join(", ") })}</p> : null}
            {/* Build 102: where the wax-up model is cut back - the patient's tooth in front of the design. */}
            {cutBack.length ? <p className="dental-status" role="status">{t("waxup.cutBack", { teeth: cutBack.map((tooth) => `${tooth.fdi} (${tooth.reduce!.toFixed(1)} mm)`).join(", ") })}</p> : null}
            {lengthening.length ? <p className="dental-status warn" role="status">{t("waxup.lengthening", { teeth: lengthening.map((tooth) => `${tooth.fdi} (${tooth.lengthening.toFixed(1)} mm)`).join(", ") })}</p> : null}
            <p className="blend-hint">{t("waxup.adaptHint")}</p>
            {/* Build 103: the eggshell provisional - the adapted teeth as a thin shell, open at the necks. */}
            {view.stage === "adapted" ? (
              <div className="waxup-helpers" role="group" aria-label={t("waxup.eggshell")}>
                <h5>{t("waxup.eggshell")}</h5>
                <EdgeModifierSlider label={t("waxup.eggshellWall")} value={eggshellWall} min={EGGSHELL_MIN_WALL} max={EGGSHELL_MAX_WALL} step={0.1} unit="mm" workspace={workspace} onChange={(value) => setEggshellWall(Math.max(EGGSHELL_MIN_WALL, Math.min(EGGSHELL_MAX_WALL, value)))} />
                <div className="dental-trim-buttons">
                  <button type="button" className="secondary" disabled={working} title={t("waxup.eggshellHint")} onClick={() => actions.onEggshell(eggshellWall)}>{t("waxup.eggshellMake")}</button>
                </div>
                <p className="blend-hint">{t("waxup.eggshellHint")}</p>
              </div>
            ) : null}
            {thin.length ? <p className="dental-status warn" role="status">{t("waxup.thin", { teeth: thin.map((tooth) => tooth.fdi).sort().join(", "), mm: WAX_THIN })}</p> : null}
            {imt ? <p className="dental-status" role="note">{t("waxup.imtModels", { first: first.map((tooth) => tooth.fdi).join(", ") || "-" })}</p> : null}
            {!imt && first.length && first.length < sorted.length ? (
              <>
                <label className="edge-modifier-check">
                  <input type="checkbox" checked={view.alternate} disabled={working} onChange={(event) => actions.onAlternate(event.currentTarget.checked)} />
                  <span>{t("waxup.alternate", { teeth: first.map((tooth) => tooth.fdi).join(", ") })}</span>
                </label>
                <p className="blend-hint">{t("waxup.alternateHint")}</p>
              </>
            ) : null}
          </>
        ) : null}
      </div>
      ) : null}
      {view.occlusion.ready && show("occlusion") ? (
        <div className="dental-substep">
          <h4 className="dental-substep-title">{t("waxup.occlusionStep")}</h4>
          <p className="blend-hint">{t("waxup.occlusionHint")}</p>
          <EdgeModifierSlider label={t("waxup.raise")} value={view.occlusion.raise} min={0} max={5} step={0.25} workspace={workspace} length disabled={working || view.occlusion.busy} onChange={(value) => actions.onOcclusion({ raise: Math.max(0, Math.min(5, Math.round(value / 0.25) * 0.25)) })} />
          <div className="dental-trim-mode" role="radiogroup" aria-label={t("waxup.scheme")}>
            {(["canine", "group"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={view.occlusion.scheme === value} className={view.occlusion.scheme === value ? "active" : ""} disabled={working || view.occlusion.busy} onClick={() => actions.onOcclusion({ scheme: value })}>{t(value === "canine" ? "waxup.schemeCanine" : "waxup.schemeGroup")}</button>
            ))}
          </div>
          <details className="sculpt-brush-options">
            <summary>{t("waxup.articulator")}</summary>
            <EdgeModifierSlider label={t("waxup.condylar")} value={view.occlusion.guidance} min={15} max={55} step={1} unit="°" workspace={workspace} disabled={working || view.occlusion.busy} onChange={(value) => actions.onOcclusion({ guidance: Math.max(15, Math.min(55, Math.round(value))) })} />
            <EdgeModifierSlider label={t("waxup.bennett")} value={view.occlusion.bennett} min={0} max={30} step={1} unit="°" workspace={workspace} disabled={working || view.occlusion.busy} onChange={(value) => actions.onOcclusion({ bennett: Math.max(0, Math.min(30, Math.round(value))) })} />
            <p className="blend-hint">{t("waxup.articulatorHint")}</p>
          </details>
          <div className="dental-trim-buttons">
            <button type="button" className="active" disabled={working || view.occlusion.busy} onClick={actions.onWorkOcclusion}>{view.occlusion.busy ? <LoaderCircle className="edge-modifier-spinner" size={15} /> : <Check size={15} />} {t("waxup.workOcclusion")}</button>
          </div>
          {view.occlusion.result ? (
            <div className="waxup-occlusion">
              {/* Build 101: only what there is to say - no openings at the bite as scanned, no list without the opposing teeth found. */}
              {view.occlusion.result.raise > 0 && view.occlusion.result.openings.some((o) => o.fdi) ? <p className="blend-hint">{t("waxup.openings", { list: view.occlusion.result.openings.filter((o) => o.fdi).map((o) => `${o.fdi} ${o.mm.toFixed(1)}`).join(", ") })}</p> : null}
              {view.occlusion.result.rest.length ? <p className="blend-hint">{t("waxup.restContacts", { list: view.occlusion.result.rest.map((r) => `${r.fdi} ${r.gap.toFixed(2)}`).join(", ") })}</p> : null}
              {view.occlusion.result.findings.length ? (
                <ul className="waxup-checks">
                  {view.occlusion.result.findings.map((f, i) => <li key={i} className="warn"><AlertTriangle size={12} aria-hidden="true" /> {f.text} ({f.count})</li>)}
                </ul>
              ) : <p className="dental-status" role="status"><Check size={15} /> {t("waxup.sweepClear")}</p>}
              {view.occlusion.result.missing ? <p className="dental-status warn" role="status">{t("waxup.guidanceMissing", { count: view.occlusion.result.missing })}</p> : null}
              {view.occlusion.result.raise > 0 ? <p className="dental-status" role="note">{t("waxup.fixedBite", { mm: view.occlusion.result.raise })}</p> : null}
              {view.occlusion.result.fitted?.length ? <p className="blend-hint">{t("waxup.fitted", { list: view.occlusion.result.fitted.map((c) => `${c.fdi} ${c.mm.toFixed(2)}`).join(", ") })}</p> : null}
              {view.occlusion.result.raise === 0 ? <p className="dental-status" role="note"><Check size={15} /> {t("waxup.keptBite")}</p> : null}
              {view.occlusion.result.carved.length ? <p className="blend-hint">{t("waxup.carved", { list: view.occlusion.result.carved.map((c) => `${c.fdi} ${c.mm.toFixed(2)}`).join(", ") })}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {view.placed.length && (show("adjust") || part === "occlusion") ? (
        // Build 94: what only the patient can tell - checked chairside with the mock-up (Spear, Vig & Brundo, Abduo).
        <details className="waxup-checks">
          <summary>{t("waxup.chairside")}</summary>
          <ul>
            {(["display", "fv", "s", "ovd", "photo"] as const).map((key) => <li key={key} className="ok">{t(`waxup.chairside.${key}`)}</li>)}
          </ul>
        </details>
      ) : null}
      {view.error ? <div className="edge-modifier-error" role="alert">{view.error}</div> : null}
    </div>
  );
}
