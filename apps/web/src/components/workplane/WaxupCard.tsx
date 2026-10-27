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
import { IMT_REDUCE, IMT_UNSUPPORTED, imtFirstInjection, type ToothNudge } from "@/lib/dentalWaxup";
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
  builtIn: Array<{ id: string; name: string }>;
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

export function WaxupCard({ view, actions, slots, busy, workspace }: { view: WaxupView; actions: WaxupActions; slots: { upper: boolean; lower: boolean }; busy: boolean; workspace: WorkplaneWorkspaceSettings }) {
  const file = useRef<HTMLInputElement>(null);
  const working = busy || view.busy;
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
          <label className="dental-label-field">
            <span>{t("waxup.builtIn")}</span>
            <select value={view.setId ?? ""} disabled={working} onChange={(event) => { if (event.currentTarget.value) actions.onBuiltIn(event.currentTarget.value); }}>
              <option value="">{t(view.setName && !view.setId ? "waxup.ownSet" : "waxup.chooseSet")}</option>
              {view.builtIn.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
            </select>
          </label>
        ) : null}
        <button type="button" className="dental-import" disabled={working} onClick={() => file.current?.click()}><Upload size={15} /> {t("waxup.loadSet")}</button>
        <p className="blend-hint">{view.setName ? t("waxup.setLoaded", { name: view.setName, count: view.teeth }) : t("waxup.setHint")}</p>
        {view.setId && view.builtInCredit ? <p className="blend-hint">{view.builtInCredit}</p> : null}
      </div>

      <div className="dental-substep">
        <h4 className="dental-substep-title">{t("waxup.markStep")}</h4>
        <p className="blend-hint">{view.picking !== null ? t(WAXUP_LANDMARKS[view.picking]) : view.marked === 3 ? t("waxup.marked") : t("waxup.markHint")}</p>
        <div className="dental-trim-buttons">
          <button type="button" className={view.marked === 3 ? "" : "active"} disabled={working || view.picking !== null} onClick={actions.onMark}>{t(view.marked === 3 ? "waxup.markAgain" : "waxup.mark")}</button>
        </div>
      </div>

      <div className="dental-substep">
        <h4 className="dental-substep-title">{t("waxup.placeStep")}</h4>
        <p className="blend-hint">{t("waxup.designHint")}</p>
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
        <EdgeModifierSlider label={t("waxup.lengthen")} value={view.lengthen} min={WAX_LENGTHEN.min} max={WAX_LENGTHEN.max} step={WAX_LENGTHEN.step} workspace={workspace} length disabled={working} onChange={(value) => actions.onLengthen(Math.max(WAX_LENGTHEN.min, Math.min(WAX_LENGTHEN.max, Math.round(value / WAX_LENGTHEN.step) * WAX_LENGTHEN.step)))} />
        <div className="dental-trim-buttons">
          <button type="button" className={view.setName && view.marked === 3 ? "active" : ""} disabled={working || !view.setName || view.marked < 3 || view.picking !== null} onClick={actions.onPlace}>
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
            {first.length && first.length < sorted.length ? (
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
      {view.error ? <div className="edge-modifier-error" role="alert">{view.error}</div> : null}
    </div>
  );
}
