"use client";

/**
 * Build 79: Dental Studio's wax-up step - a tooth set from a library set over the scan's anterior
 * teeth, placed from three landmarks, then adjusted tooth by tooth with the usual handles. The wax
 * only ever adds; Make joins it to the model.
 */
import { AlertTriangle, Check, LoaderCircle, Upload } from "lucide-react";
import { useRef } from "react";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { t } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages.en";
import { IMT_REDUCE, IMT_UNSUPPORTED, imtFirstInjection, type SmileCheck, type ToothNudge } from "@/lib/dentalWaxup";
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
  placed: Array<{ id: string; fdi: number; clearance: number | null; width: number; length: number; lengthening: number; extension: number }>;
  /** Build 79: also make a model with wax on alternate teeth only (injection moulding, first injection). */
  alternate: boolean;
  selected: string | null;
  /** Adjusting a tooth adjusts the same tooth on the other side too. */
  mirror: boolean;
  error: string | null;
  /** Build 94: the tooth finder - loaded (its file's name) or not, at work (share done). */
  finder: { name: string | null; busy: boolean; progress: number | null };
  /** Build 94: the teeth found on this arch (FDI; agreed = the network's own number), and those chosen for the wax-up. */
  found: Array<{ fdi: number; agreed: boolean }> | null;
  chosen: number[];
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
    result: { rest: Array<{ fdi: number; gap: number }>; openings: Array<{ fdi: number; mm: number }>; findings: Array<{ text: string; count: number; nonworking: boolean }>; carved: Array<{ fdi: number; mm: number }>; missing: number } | null;
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
  onRemove: () => void;
  onSelect: (id: string) => void;
  onNudge: (id: string, nudge: ToothNudge, amount: number) => void;
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

/** The landmark clicked at each step, in order. */
export const WAXUP_LANDMARKS = ["waxup.pickMidline", "waxup.pickCanine1", "waxup.pickCanine2"] as const;

export function waxupSummary(view: WaxupView) {
  if (view.placed.length) return t("waxup.summaryPlaced", { count: view.placed.length });
  if (view.setName) return t("waxup.summarySet", { name: view.setName });
  return t("waxup.summaryNone");
}

/** Build 94: teeth in arch order (upper right to left, lower left to right), for the chips. */
export const archOrder = (fdi: number) => { const q = Math.floor(fdi / 10), n = fdi % 10; return q === 1 || q === 4 ? -n : n; };

export function WaxupCard({ view, actions, slots, busy, workspace, imt = false }: { view: WaxupView; actions: WaxupActions; slots: { upper: boolean; lower: boolean }; busy: boolean; workspace: WorkplaneWorkspaceSettings; imt?: boolean }) {
  const file = useRef<HTMLInputElement>(null);
  const finderFile = useRef<HTMLInputElement>(null);
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
  const first = sorted.filter((tooth) => imtFirstInjection(tooth.fdi));
  return (
    <div className="waxup-card">
      <p className="blend-hint">{t("waxup.hint")}</p>
      {slots.upper && slots.lower ? (
        <div className="dental-trim-mode" role="radiogroup" aria-label={t("waxup.arch")}>
          {(["upper", "lower"] as const).map((slot) => (
            <button key={slot} type="button" role="radio" aria-checked={view.slot === slot} className={view.slot === slot ? "active" : ""} disabled={working} onClick={() => actions.onSlot(slot)}>
              {t(slot === "upper" ? "dental.upper" : "dental.lower")}
            </button>
          ))}
        </div>
      ) : null}

      {/* Build 94: the teeth found on the scan, and those to wax up. */}
      <div className="dental-substep">
        <h4 className="dental-substep-title">{t("waxup.findStep")}</h4>
        <input ref={finderFile} type="file" accept=".ptw" hidden onChange={(event) => { const f = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (f) actions.onLoadFinder(f); }} />
        {view.finder.name ? (
          <>
            <div className="dental-trim-buttons">
              <button type="button" className={view.found ? "" : "active"} disabled={working || view.finder.busy} onClick={actions.onFindTeeth}>
                {view.finder.busy ? <LoaderCircle className="edge-modifier-spinner" size={15} /> : null} {t(view.found ? "waxup.findAgain" : "waxup.find")}
              </button>
            </div>
            {view.finder.busy && view.finder.progress !== null ? <p className="blend-hint" role="status">{t("waxup.finding", { share: Math.round(view.finder.progress * 100) })}</p> : null}
            {view.found ? (
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
            ) : <p className="blend-hint">{t("waxup.findHint")}</p>}
            <p className="blend-hint">{t("waxup.finderLoaded", { name: view.finder.name })} <button type="button" className="link-button" disabled={working} onClick={() => finderFile.current?.click()}>{t("waxup.finderChange")}</button></p>
          </>
        ) : (
          <>
            <p className="blend-hint">{t("waxup.finderNone")}</p>
            <button type="button" className="dental-import" disabled={working} onClick={() => finderFile.current?.click()}><Upload size={15} /> {t("waxup.loadFinder")}</button>
          </>
        )}
      </div>

      <div className="dental-substep">
        <h4 className="dental-substep-title">{t("waxup.setStep")}</h4>
        <input
          ref={file}
          type="file"
          accept=".obj,.stl"
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (files.length) actions.onSet(files);
          }}
        />
        {view.builtIn.length ? (
          // Build 91: the sets as pictures, by library (Teethy, Dr Adam Nulty's).
          <div className="waxup-sets" role="radiogroup" aria-label={t("waxup.builtIn")}>
            {[...new Set(sets.map((set) => set.library ?? ""))].map((library) => (
              <div key={library} className="waxup-set-library">
                {library ? <span className="waxup-set-library-name">{library}</span> : null}
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
        {view.setId && view.builtInCredit ? <p className="blend-hint">{view.builtInCredit}</p> : null}
      </div>

      <div className="dental-substep">
        <h4 className="dental-substep-title">{t("waxup.markStep")}</h4>
        <p className="blend-hint">{view.picking !== null ? t(WAXUP_LANDMARKS[view.picking]) : view.marked === 3 ? t(view.found ? "waxup.markedFound" : "waxup.marked") : t("waxup.markHint")}</p>
        <div className="dental-trim-buttons">
          <button type="button" className={view.marked === 3 ? "" : "active"} disabled={working || view.picking !== null} onClick={actions.onMark}>{t(view.marked === 3 ? "waxup.markAgain" : "waxup.mark")}</button>
        </div>
      </div>

      <div className="dental-substep">
        <h4 className="dental-substep-title">{t("waxup.placeStep")}</h4>
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
        {view.placed.length ? (
          <>
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
              <thead><tr><th>{t("waxup.colTooth")}</th><th>{t("waxup.colWidth")}</th><th>{t("waxup.colLength")}</th><th>{t("waxup.colRatio")}</th><th>{t("waxup.colEdge")}</th><th>{t("waxup.colLengthening")}</th></tr></thead>
              <tbody>
                {[...view.placed].sort((a, b) => a.fdi - b.fdi).map((tooth) => (
                  <tr key={tooth.id}>
                    <td>{tooth.fdi}</td><td>{tooth.width.toFixed(1)}</td><td>{tooth.length.toFixed(1)}</td><td>{Math.round((tooth.width / Math.max(0.1, tooth.length)) * 100)}%</td><td className={tooth.extension > IMT_UNSUPPORTED + 1e-6 || tooth.extension < -IMT_REDUCE ? "warn" : ""}>{tooth.extension >= 0 ? "+" : ""}{tooth.extension.toFixed(1)}</td><td>{tooth.lengthening > 0 ? tooth.lengthening.toFixed(1) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {unsupported.length ? <p className="dental-status warn" role="status">{t("waxup.unsupported", { teeth: unsupported.map((tooth) => `${tooth.fdi} (${tooth.extension.toFixed(1)} mm)`).join(", "), mm: IMT_UNSUPPORTED })}</p> : null}
            {reduce.length ? <p className="dental-status warn" role="status">{t("waxup.reduce", { teeth: reduce.map((tooth) => `${tooth.fdi} (${(-tooth.extension).toFixed(1)} mm)`).join(", ") })}</p> : null}
            {lengthening.length ? <p className="dental-status warn" role="status">{t("waxup.lengthening", { teeth: lengthening.map((tooth) => `${tooth.fdi} (${tooth.lengthening.toFixed(1)} mm)`).join(", ") })}</p> : null}
            {selectedTooth ? (
              <div className="waxup-adjust" role="group" aria-label={t("waxup.adjustTooth", { fdi: selectedTooth.fdi })}>
                <h5>{t("waxup.adjustTooth", { fdi: selectedTooth.fdi })}</h5>
                {([["out", "waxup.in", "waxup.out", WAX_NUDGE], ["mesial", "waxup.distal", "waxup.mesial", WAX_NUDGE], ["longer", "waxup.shorter", "waxup.longer", WAX_NUDGE], ["wider", "waxup.narrower", "waxup.wider", WAX_NUDGE], ["turn", "waxup.turnIn", "waxup.turnOut", WAX_TURN]] as const).map(([nudge, less, more, step]) => (
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
            <p className="blend-hint">{t("waxup.adjustHint")}</p>
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
      {view.occlusion.ready ? (
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
              <p className="blend-hint">{t("waxup.openings", { list: view.occlusion.result.openings.filter((o) => o.fdi).map((o) => `${o.fdi} ${o.mm.toFixed(1)}`).join(", ") })}</p>
              <p className="blend-hint">{t("waxup.restContacts", { list: view.occlusion.result.rest.map((r) => `${r.fdi} ${r.gap.toFixed(2)}`).join(", ") })}</p>
              {view.occlusion.result.findings.length ? (
                <ul className="waxup-checks">
                  {view.occlusion.result.findings.map((f, i) => <li key={i} className="warn"><AlertTriangle size={12} aria-hidden="true" /> {f.text} ({f.count})</li>)}
                </ul>
              ) : <p className="dental-status" role="status"><Check size={15} /> {t("waxup.sweepClear")}</p>}
              {view.occlusion.result.missing ? <p className="dental-status warn" role="status">{t("waxup.guidanceMissing", { count: view.occlusion.result.missing })}</p> : null}
              {view.occlusion.result.carved.length ? <p className="blend-hint">{t("waxup.carved", { list: view.occlusion.result.carved.map((c) => `${c.fdi} ${c.mm.toFixed(2)}`).join(", ") })}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {view.placed.length ? (
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
