"use client";

import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, LoaderCircle, Minus, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { displayStepFromMillimeters, displayToMillimeters, formatMeasurementNumber, lengthDisplayUnit, millimetersToDisplay, parseMeasurementInput } from "@/lib/measurementUnits";
import type { CadModifierKind, CadModifierQuality } from "@/lib/cadModifierTypes";
import { CAD_MODIFIER_MAX_SHARP_ANGLE, cadModifierUserErrorMessage, edgeModifierSelectionStatus } from "@/lib/cadModifierRuntime";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";
import { selectWholeValue } from "@/lib/numberField";
import { useWheelField } from "@/lib/useWheelField";
import { wheelBaseStep, wheelNextValue } from "@/lib/wheelValueStep";

const MIN_EDGE_MODIFIER_AMOUNT = 0.001;
const EDGE_MODIFIER_AMOUNT_STEP = 0.001;
/** The slider of the distance or radius moves in tenths of a millimetre and goes to 10 mm; larger values are typed. */
const EDGE_MODIFIER_SLIDER_STEP = 0.1;
const EDGE_MODIFIER_SLIDER_MAX = 10;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatSliderValue(value: number, accuracy: WorkplaneWorkspaceSettings["accuracy"], step: number) {
  if (step >= 1) return String(Math.round(value));
  return formatMeasurementNumber(value, accuracy, step);
}

export type EdgeHistoryOption = {
  id: string;
  label: string;
  kind: CadModifierKind;
  amount: number;
  edgeCount: number;
  /** Only for a deletion of faces. */
  faceCount?: number;
  targetName: string;
  removesNewerCount: number;
  /** Opens the tool again with the value and edges it had. */
  editable: boolean;
};

/** Der gespeicherte Text ist englisch - fuer die Tafel wird er neu gesetzt. */
function edgeHistoryLabel(option: EdgeHistoryOption) {
  const size = String(Number(option.amount.toFixed(2)));
  if (option.kind === "shell") return t("edge.revertShell", { size });
  if (option.kind === "draft") return t("edge.revertDraft", { size: String(Number(option.amount.toFixed(1))), count: option.faceCount ?? 0 });
  if (option.kind === "offset") return t("edge.revertOffset", { size });
  if (option.kind === "deleteFace") {
    return option.faceCount === 1 ? t("edge.revertDeleteFaceOne") : t("edge.revertDeleteFaceMany", { count: option.faceCount ?? 0 });
  }
  if (option.edgeCount === 1) {
    return t(option.kind === "fillet" ? "edge.revertFilletOne" : option.kind === "chamfillet" ? "edge.revertChamfilletOne" : "edge.revertChamferOne", { size });
  }
  return t(option.kind === "fillet" ? "edge.revertFilletMany" : option.kind === "chamfillet" ? "edge.revertChamfilletMany" : "edge.revertChamferMany", { size, count: option.edgeCount });
}

/**
 * The treatments a body already has - fillets, chamfers, hollowing, deleted faces - with "Revert" for each and
 * "Edit" where the tool can be opened again with the same values (#227). The fillet and chamfer
 * tool, the hollow tool and Delete face show the same list (#237).
 */
/**
 * Whether the list was open when it was last left. Taking a feature back opens the tool again on the restored body, which
 * builds the panel anew, and a list that shut itself after every click made taking back several in a row a chore (#517).
 */
let historyListWasOpen = false;

export function EdgeFeatureHistory({
  appliedFeatureCount,
  reversibleFeatureCount,
  historyOptions,
  onRemoveFeature,
  onEditFeature,
}: {
  appliedFeatureCount: number;
  reversibleFeatureCount: number;
  historyOptions: EdgeHistoryOption[];
  onRemoveFeature: (id: string) => void;
  onEditFeature?: (id: string) => void;
}) {
  const [historyOpen, setHistoryOpenState] = useState(historyListWasOpen);
  const setHistoryOpen = (update: (open: boolean) => boolean) => {
    setHistoryOpenState((open) => {
      const next = update(open);
      historyListWasOpen = next;
      return next;
    });
  };
  if (appliedFeatureCount === 0) return null;
  return (
    <div className="edge-modifier-history-actions">
      <button
        className="edge-modifier-history-toggle"
        type="button"
        aria-expanded={historyOpen}
        disabled={reversibleFeatureCount === 0}
        onClick={() => setHistoryOpen((open) => !open)}
      >
        {historyOpen ? <Minus size={15} /> : <Plus size={15} />}
        <span>{t("edge.featureHistory")}</span>
      </button>
      {reversibleFeatureCount === 0 ? <span>{t("edge.noStoredHistory")}</span> : null}
      {historyOpen && historyOptions.length > 0 ? (
        <div className="edge-modifier-history-list">
          <p className="edge-modifier-history-hint">{t("edge.revertHint")}</p>
          {historyOptions.map((option) => (
            <div className="edge-modifier-history-row" key={option.id}>
              <button className="edge-modifier-history-item" type="button" onClick={() => onRemoveFeature(option.id)}>
                <RotateCcw size={14} />
                <span>
                  <strong>{`${t("edge.revertAction")}: ${edgeHistoryLabel(option)}`}</strong>
                  <small>{option.targetName}</small>
                  {option.removesNewerCount > 0 ? (
                    <small className="edge-modifier-history-warning">{t("edge.alsoRemovesNewer", { count: option.removesNewerCount })}</small>
                  ) : null}
                </span>
              </button>
              {option.editable && onEditFeature ? (
                <button className="edge-modifier-history-edit" type="button" title={t("edge.editHint")} onClick={() => onEditFeature(option.id)}>
                  <Pencil size={14} />
                  <span>{t("edge.editAction")}</span>
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function EdgeModifierSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  workspace,
  length = false,
  disabled = false,
  coarse,
  autoFocus = false,
  onEnter,
  onChange,
  title,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  workspace: WorkplaneWorkspaceSettings;
  length?: boolean;
  disabled?: boolean;
  /**
   * The slider moves in these larger steps and goes only as far as `max`, in millimetres for a length, while the field
   * still takes the exact value and anything up to the full range: a slider of 3,000 steps gives crooked values (forum, DrJones).
   */
  coarse?: { step: number; max: number };
  /** The field takes the focus when it appears, so a tool opened from the keyboard can be typed into at once (#760). */
  autoFocus?: boolean;
  /** Enter takes the typed value and then calls this with it, for a window that applies on Enter (#760). */
  onEnter?: (value: number) => void;
  onChange: (value: number) => void;
  /** Build 92: what the slider does, shown when the pointer rests on it. */
  title?: string;
}) {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Math.max(safeMin, Number.isFinite(max) ? max : safeMin);
  const actualValue = Number.isFinite(value) ? value : safeMin;
  const controlValue = length ? millimetersToDisplay(actualValue, workspace) : actualValue;
  const controlMin = length ? millimetersToDisplay(safeMin, workspace) : safeMin;
  const controlMax = length ? millimetersToDisplay(safeMax, workspace) : safeMax;
  const controlStep = length ? displayStepFromMillimeters(step, workspace) : step;
  // The slider's own range: counted from 0 in coarse steps, so its values are whole steps (0.1, 0.2 ...), not 0.001 + n * 0.1.
  const rangeMin = coarse ? 0 : controlMin;
  const rangeMax = coarse ? Math.max(controlMin, Math.min(controlMax, length ? millimetersToDisplay(coarse.max, workspace) : coarse.max)) : controlMax;
  const rangeStep = coarse ? (length ? displayStepFromMillimeters(coarse.step, workspace) : coarse.step) : controlStep;
  const sliderValue = clamp(controlValue, rangeMin, rangeMax);
  const position = ((sliderValue - rangeMin) / Math.max(Number.EPSILON, rangeMax - rangeMin)) * 100;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatSliderValue(controlValue, workspace.accuracy, controlStep));
  const unitLabel = length ? lengthDisplayUnit(workspace).label : unit;

  useEffect(() => {
    if (!editing) {
      setDraft(formatSliderValue(controlValue, workspace.accuracy, controlStep));
    }
  }, [controlStep, controlValue, editing, workspace.accuracy]);

  const toModelValue = (nextValue: number) => length ? displayToMillimeters(nextValue, workspace) : nextValue;

  // The mouse wheel in the clicked field (#536). What the wheel wrote stays as it is when the field is left, so
  // the rounded reading does not replace the exact value.
  const numberInputRef = useRef<HTMLInputElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const pressRef = useRef<{ x: number; onBubble: boolean } | null>(null);
  useEffect(() => {
    if (autoFocus) numberInputRef.current?.focus();
  }, [autoFocus]);
  const wheelShownRef = useRef<string | null>(null);
  useWheelField(numberInputRef, editing && !disabled, ({ direction, keys }) => {
    const parsed = parseMeasurementInput(draft);
    const current = Number.isFinite(parsed) ? parsed : controlValue;
    const next = clamp(wheelNextValue(current, direction, wheelBaseStep(controlMin, controlMax, controlStep, length && unitLabel === "in"), keys), controlMin, controlMax);
    const shown = formatSliderValue(next, workspace.accuracy, controlStep);
    wheelShownRef.current = shown;
    setDraft(shown);
    onChange(clamp(toModelValue(next), safeMin, safeMax));
  });

  const commitDraft = () => {
    if (wheelShownRef.current !== null && draft === wheelShownRef.current) {
      wheelShownRef.current = null;
      setEditing(false);
      return;
    }
    wheelShownRef.current = null;
    const next = parseMeasurementInput(draft);
    const finiteNext = Number.isFinite(next) ? next : controlValue;
    const committed = clamp(toModelValue(finiteNext), safeMin, safeMax);
    // Leaving the field without a change is no change: reporting it threw the preview
    // away and nothing computed a new one, so Apply spun for good (#204).
    if (Math.abs(committed - actualValue) > 1e-9) onChange(committed);
    setEditing(false);
  };

  const handleSliderChange = (nextValue: number) => {
    const next = clamp(Number.isFinite(nextValue) ? nextValue : controlMin, controlMin, controlMax);
    onChange(clamp(toModelValue(next), safeMin, safeMax));
    setDraft(formatSliderValue(next, workspace.accuracy, controlStep));
  };

  // Fork (build 32): the compact row of the properties panel - the value box rides on the slider as its handle.
  return (
    <label title={title} className={`edge-modifier-field edge-modifier-slider range-property compact${editing ? " editing" : ""}`} style={{ "--slider-pos": `${position}%`, "--slider-frac": String(position / 100) } as CSSProperties}>
      <span className="range-property-header">
        <span className="range-property-name">{label}</span>
      </span>
      <div className="range-control">
        <input
          type="range"
          min={rangeMin}
          max={rangeMax}
          step={rangeStep}
          value={sliderValue}
          disabled={disabled}
          onPointerDown={(event) => {
            const box = bubbleRef.current?.getBoundingClientRect();
            pressRef.current = { x: event.clientX, onBubble: Boolean(box && event.clientX >= box.left && event.clientX <= box.right) };
          }}
          onPointerUp={(event) => {
            const press = pressRef.current;
            pressRef.current = null;
            // A click on the value box, not a drag: type the value.
            if (press?.onBubble && Math.abs(event.clientX - press.x) < 4 && !disabled) window.setTimeout(() => numberInputRef.current?.focus(), 0);
          }}
          onChange={(event) => handleSliderChange(Number(event.currentTarget.value))}
        />
        <span className="range-value-control range-bubble" ref={bubbleRef}>
          <input
            ref={numberInputRef}
            type="text"
            value={editing ? draft : formatSliderValue(controlValue, workspace.accuracy, controlStep)}
            inputMode="decimal"
            disabled={disabled}
            onFocus={(event) => {
              wheelShownRef.current = null;
              setDraft(formatSliderValue(controlValue, workspace.accuracy, controlStep));
              setEditing(true);
              selectWholeValue(event.currentTarget);
            }}
            onChange={(event) => {
              wheelShownRef.current = null;
              setDraft(event.currentTarget.value);
            }}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                // What the field holds now, as commitDraft will take it (a wheel step is already in the value).
                const typed = parseMeasurementInput(draft);
                const entered = wheelShownRef.current !== null && draft === wheelShownRef.current || !Number.isFinite(typed)
                  ? actualValue
                  : clamp(toModelValue(typed), safeMin, safeMax);
                event.currentTarget.blur();
                onEnter?.(entered);
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setDraft(formatSliderValue(controlValue, workspace.accuracy, controlStep));
                setEditing(false);
              }
            }}
          />
          {unitLabel ? <span className={`range-value-unit${unitLabel === "°" ? " degree" : ""}`}>{unitLabel}</span> : null}
        </span>
      </div>
    </label>
  );
}

export type EdgeChamferStyle = "equal" | "angle" | "distances";
type EdgeQuickPick = "all" | "top" | "bottom" | "vertical" | "horizontal" | "outside" | "inside";

/** Fork (build 32): sizes a beginner can just click, in millimetres; the ones past the body's limit are left out. */
const SIZE_PRESETS = [0.5, 1, 2, 3, 5];
/** Whether "More options" was open when the window was last left: it opens the same way next time. */
let moreOptionsWasOpen = false;

/**
 * The fillet and chamfer window. Fork (build 32): one window for all three edge shapes - Round,
 * Chamfer and Chamfillet - switched at the top; sizes to click; Outside and Inside edges; "Largest
 * that fits" when a size is too big. The fine controls, a chamfer of two distances and a radius that
 * changes along the edge are under "More options".
 */
export function EdgeModifierPanel({
  kind,
  amount,
  maxAmount,
  chamferAngle,
  chamferStyle = Math.abs(chamferAngle - 45) < 1e-6 ? "equal" : "angle",
  endAmount,
  quality,
  sharpAngle,
  workspace,
  tangentChain,
  onlyVisibleEdges,
  impliedEdgeCount = 0,
  preserveEdgeSize,
  targetName,
  groupedCount,
  appliedFeatureCount,
  reversibleFeatureCount,
  historyOptions,
  selectedCount,
  availableCount,
  busy,
  searching = false,
  prepared,
  error,
  canTellInside = false,
  onAmountChange,
  onChamferAngleChange,
  onChamferStyleChange,
  onSwapChamferSides,
  onEndAmountChange,
  onKindChange,
  onQualityChange,
  onSharpAngleChange,
  onTangentChainChange,
  onOnlyVisibleEdgesChange,
  onPreserveEdgeSizeChange,
  onSelectAll,
  onSelectTop,
  onSelectBottom,
  onSelectVertical,
  onSelectHorizontal,
  onSelectOutside,
  onSelectInside,
  onFindLargest,
  activeQuickSelection = [],
  onClear,
  onRemoveFeature,
  onEditFeature,
  onApply,
  onCancel,
}: {
  kind: CadModifierKind;
  amount: number;
  maxAmount: number;
  chamferAngle: number;
  /** How the chamfer's shape is set: equal sides, a distance and an angle, or two distances. */
  chamferStyle?: EdgeChamferStyle;
  /** A fillet's radius at the end of the edge, when it changes along it; missing for one radius. */
  endAmount?: number;
  quality: CadModifierQuality;
  sharpAngle: number;
  workspace: WorkplaneWorkspaceSettings;
  tangentChain: boolean;
  /** Hide the edges the body covers from this view instead of drawing them through it. */
  onlyVisibleEdges: boolean;
  /** Edges the kernel will treat as well, because they run on smoothly from a picked one (#161). */
  impliedEdgeCount?: number;
  preserveEdgeSize: boolean;
  targetName: string;
  groupedCount: number;
  appliedFeatureCount: number;
  reversibleFeatureCount: number;
  historyOptions: EdgeHistoryOption[];
  selectedCount: number;
  availableCount: number;
  busy: boolean;
  /** "Largest that fits" is trying sizes. */
  searching?: boolean;
  prepared: boolean;
  error: string | null;
  /** The worker told outside edges from inside ones: the two buttons can be offered. */
  canTellInside?: boolean;
  onAmountChange: (value: number) => void;
  onChamferAngleChange: (value: number) => void;
  onChamferStyleChange?: (style: EdgeChamferStyle) => void;
  onSwapChamferSides?: () => void;
  onEndAmountChange?: (value: number | undefined) => void;
  onKindChange?: (kind: "fillet" | "chamfer" | "chamfillet") => void;
  onQualityChange: (value: CadModifierQuality) => void;
  onSharpAngleChange: (value: number) => void;
  onTangentChainChange: (value: boolean) => void;
  onOnlyVisibleEdgesChange: (value: boolean) => void;
  onPreserveEdgeSizeChange: (value: boolean) => void;
  onSelectAll: () => void;
  /** The quick buttons: a click picks their edges, Shift, Ctrl or Cmd with the click adds them to the ones picked (#538). */
  onSelectTop?: (add: boolean) => void;
  onSelectBottom?: (add: boolean) => void;
  onSelectVertical?: (add: boolean) => void;
  onSelectHorizontal?: (add: boolean) => void;
  onSelectOutside?: (add: boolean) => void;
  onSelectInside?: (add: boolean) => void;
  /** Tries sizes on the picked edges and takes the largest one the kernel accepts. */
  onFindLargest?: () => void;
  /** Which of the quick buttons made the edges picked now, to light it up (#517). */
  activeQuickSelection?: ReadonlyArray<EdgeQuickPick>;
  onClear: () => void;
  onRemoveFeature: (id: string) => void;
  /** Takes a treatment back and opens the tool again with its value and edges (#227). */
  onEditFeature?: (id: string) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = kind === "fillet" ? t("edge.filletTitle") : kind === "chamfillet" ? t("edge.chamfilletTitle") : t("edge.chamferTitle");
  const amountMin = Math.min(MIN_EDGE_MODIFIER_AMOUNT, Math.max(Number.EPSILON, maxAmount));
  const amountMax = Math.max(amountMin, maxAmount);
  const [moreOpen, setMoreOpenState] = useState(moreOptionsWasOpen || chamferStyle !== "equal" || endAmount !== undefined);
  const setMoreOpen = (open: boolean) => {
    moreOptionsWasOpen = open;
    setMoreOpenState(open);
  };
  // On a short screen the panel scrolls, and the error sits at its foot under
  // the buttons: bring the whole bottom into view whenever a message appears.
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = errorRef.current?.closest<HTMLElement>(".edge-modifier-panel");
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [error]);
  const disabled = !prepared || searching;
  const inch = lengthDisplayUnit(workspace).label === "in";
  const presets = SIZE_PRESETS.filter((size) => size <= amountMax);
  const presetLabel = (size: number) => inch ? formatMeasurementNumber(millimetersToDisplay(size, workspace), workspace.accuracy, 0.001) : String(size);
  const secondDistance = amount * Math.tan((chamferAngle * Math.PI) / 180);
  const quick = (key: EdgeQuickPick, label: string, hint: string | undefined, handler: ((add: boolean) => void) | undefined) => handler ? (
    <button
      type="button"
      className={activeQuickSelection.includes(key) ? "active" : ""}
      aria-pressed={activeQuickSelection.includes(key)}
      disabled={disabled}
      title={hint}
      onClick={(event) => handler(event.shiftKey || event.ctrlKey || event.metaKey)}
    >
      {label}
    </button>
  ) : null;
  return (
    <MovableToolPanel className="edge-modifier-panel" ariaLabel={title}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{edgeModifierSelectionStatus(prepared, selectedCount, availableCount)}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="edgeTreatment" />
          <button type="button" aria-label={kind === "fillet" ? t("edge.cancelFillet") : t("edge.cancelChamfer")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      <div className={`edge-modifier-target ${groupedCount > 0 ? "grouped" : ""}`}>
        <strong>{targetName}</strong>
        <span>
          {groupedCount > 0 ? t("edge.groupedObjects", { count: groupedCount }) : t("edge.singleObject")}
          {appliedFeatureCount === 0
            ? ""
            : appliedFeatureCount === 1
              ? t("edge.existingFeatureOne")
              : t("edge.existingFeatureMany", { count: appliedFeatureCount })}
        </span>
      </div>

      {onKindChange ? (
        <div className="edge-modifier-field edge-kind-switch shell-openings" role="radiogroup" aria-label={t("edge.shapeLabel")}>
          <div className="shell-opening-options">
            {([
              ["fillet", t("edge.kindRound"), t("edge.kindRoundHint")],
              ["chamfer", t("editor.tool.chamfer"), t("edge.kindChamferHint")],
              ["chamfillet", t("edge.chamfillet"), t("edge.chamfilletHint")],
            ] as const).map(([value, label, hint]) => (
              <button key={value} type="button" role="radio" aria-checked={kind === value} className={kind === value ? "active" : ""} disabled={disabled} title={hint} onClick={() => onKindChange(value)}>
                {label}
              </button>
            ))}
          </div>
          {kind === "chamfillet" ? <span className="shell-openings-summary">{t("edge.chamfilletHint")}</span> : null}
        </div>
      ) : null}

      <div className="edge-modifier-selection-help">
        {!prepared ? t("edge.loading") : searching ? t("edge.searching") : busy ? t("edge.previewBusy") : t("edge.selectionHelp")}
      </div>

      <div className="edge-modifier-quick-actions" title={t("edge.quickAddHint")}>
        <button type="button" className={activeQuickSelection.includes("all") ? "active" : ""} aria-pressed={activeQuickSelection.includes("all")} disabled={disabled} onClick={onSelectAll}>{t("edge.allSharpEdges")}</button>
        {canTellInside ? quick("outside", t("edge.outsideEdges"), t("edge.outsideEdgesHint"), onSelectOutside) : null}
        {canTellInside ? quick("inside", t("edge.insideEdges"), t("edge.insideEdgesHint"), onSelectInside) : null}
        {quick("top", t("edge.topEdges"), t("edge.topEdgesHint"), onSelectTop)}
        {quick("bottom", t("edge.bottomEdges"), t("edge.bottomEdgesHint"), onSelectBottom)}
        {quick("vertical", t("edge.verticalEdges"), t("edge.verticalEdgesHint"), onSelectVertical)}
        {quick("horizontal", t("edge.horizontalEdges"), t("edge.horizontalEdgesHint"), onSelectHorizontal)}
        <button type="button" disabled={disabled} onClick={onClear}>{t("edge.clear")}</button>
      </div>

      <EdgeModifierSlider
        label={kind === "fillet" ? (endAmount !== undefined ? t("edge.startRadius") : t("edge.radius")) : t("edge.distance")}
        value={amount}
        min={amountMin}
        max={amountMax}
        step={EDGE_MODIFIER_AMOUNT_STEP}
        coarse={{ step: inch ? 25.4 / 64 : EDGE_MODIFIER_SLIDER_STEP, max: EDGE_MODIFIER_SLIDER_MAX }}
        workspace={workspace}
        length
        disabled={disabled}
        onChange={onAmountChange}
      />
      <div className="edge-size-presets" role="group" aria-label={t("edge.sizePresets")}>
        {presets.map((size) => (
          <button key={size} type="button" className={Math.abs(amount - size) < 1e-6 ? "active" : ""} disabled={disabled} onClick={() => onAmountChange(size)}>
            {presetLabel(size)}
          </button>
        ))}
        {onFindLargest ? (
          <button type="button" className="edge-size-largest" disabled={disabled || selectedCount === 0} title={t("edge.largestHint")} onClick={onFindLargest}>
            {searching ? <LoaderCircle className="edge-modifier-spinner" size={14} /> : null}
            {t("edge.largest")}
          </button>
        ) : null}
      </div>

      {error && availableCount === 0 && appliedFeatureCount > 0 ? (
        // Fork (build 37): every edge already treated is a finished state, not a failure.
        <p className="edge-modifier-selection-help" role="status">{t("edge.allEdgesTreated")}</p>
      ) : error ? (
        <div ref={errorRef} className="edge-modifier-error" role="alert">
          {cadModifierUserErrorMessage(error)}
          {onFindLargest && selectedCount > 0 && !searching ? (
            <button type="button" className="edge-modifier-error-action" onClick={onFindLargest}>{t("edge.largestAction")}</button>
          ) : null}
        </div>
      ) : null}

      <EdgeFeatureHistory
        appliedFeatureCount={appliedFeatureCount}
        reversibleFeatureCount={reversibleFeatureCount}
        historyOptions={historyOptions}
        onRemoveFeature={onRemoveFeature}
        onEditFeature={onEditFeature}
      />

      <button type="button" className="edge-more-toggle" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
        {moreOpen ? <Minus size={15} /> : <Plus size={15} />}
        <span>{t("common.moreOptions")}</span>
      </button>

      {moreOpen ? (
        <div className="edge-more-options">
          {kind === "chamfer" && onChamferStyleChange ? (
            <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("edge.chamferShape")}>
              <span>{t("edge.chamferShape")}</span>
              <div className="shell-opening-options three">
                {([
                  ["equal", t("edge.styleEqual")],
                  ["angle", t("edge.styleAngle")],
                  ["distances", t("edge.styleDistances")],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={chamferStyle === value} className={chamferStyle === value ? "active" : ""} disabled={disabled} onClick={() => onChamferStyleChange(value)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {kind === "chamfillet" || (kind === "chamfer" && chamferStyle === "angle") ? (
            <EdgeModifierSlider label={t("edge.angle")} value={chamferAngle} min={kind === "chamfillet" ? 15 : 5} max={kind === "chamfillet" ? 75 : 85} step={1} unit="°" workspace={workspace} disabled={disabled} onChange={onChamferAngleChange} />
          ) : null}
          {kind === "chamfer" && chamferStyle === "distances" ? (
            <EdgeModifierSlider
              label={t("edge.secondDistance")}
              value={secondDistance}
              min={amount * Math.tan((5 * Math.PI) / 180)}
              max={amount * Math.tan((85 * Math.PI) / 180)}
              step={EDGE_MODIFIER_AMOUNT_STEP}
              coarse={{ step: inch ? 25.4 / 64 : EDGE_MODIFIER_SLIDER_STEP, max: EDGE_MODIFIER_SLIDER_MAX }}
              workspace={workspace}
              length
              disabled={disabled}
              onChange={(value) => onChamferAngleChange((Math.atan2(value, amount) * 180) / Math.PI)}
            />
          ) : null}
          {kind === "chamfer" && chamferStyle !== "equal" && onSwapChamferSides ? (
            <button type="button" className="edge-modifier-secondary-action" disabled={disabled} title={t("edge.swapSidesHint")} onClick={onSwapChamferSides}>{t("edge.swapSides")}</button>
          ) : null}
          {kind === "fillet" && onEndAmountChange ? (
            <>
              <label className="edge-modifier-check" title={t("edge.variableRadiusHint")}>
                <input type="checkbox" checked={endAmount !== undefined} disabled={disabled} onChange={(event) => onEndAmountChange(event.currentTarget.checked ? Math.min(amountMax, amount * 2) : undefined)} />
                <span>{t("edge.variableRadius")}</span>
              </label>
              {endAmount !== undefined ? (
                <>
                  <EdgeModifierSlider
                    label={t("edge.endRadius")}
                    value={endAmount}
                    min={amountMin}
                    max={amountMax}
                    step={EDGE_MODIFIER_AMOUNT_STEP}
                    coarse={{ step: inch ? 25.4 / 64 : EDGE_MODIFIER_SLIDER_STEP, max: EDGE_MODIFIER_SLIDER_MAX }}
                    workspace={workspace}
                    length
                    disabled={disabled}
                    onChange={(value) => onEndAmountChange(value)}
                  />
                  <button type="button" className="edge-modifier-secondary-action" disabled={disabled} onClick={() => { const start = amount; onAmountChange(endAmount); onEndAmountChange(start); }}>{t("edge.swapEnds")}</button>
                </>
              ) : null}
            </>
          ) : null}

          <EdgeModifierSlider label={t("edge.sharpThreshold")} value={sharpAngle} min={1} max={CAD_MODIFIER_MAX_SHARP_ANGLE} step={1} unit="°" workspace={workspace} disabled={disabled} onChange={onSharpAngleChange} />

          <label className="edge-modifier-check" title={t("edge.onlyVisibleEdgesHint")}>
            <input type="checkbox" checked={onlyVisibleEdges} disabled={disabled} onChange={(event) => onOnlyVisibleEdgesChange(event.currentTarget.checked)} />
            <span>{t("edge.onlyVisibleEdges")}</span>
          </label>

          <label className="edge-modifier-check" title={t("edge.tangentChainsHint")}>
            <input type="checkbox" checked={tangentChain} disabled={disabled} onChange={(event) => onTangentChainChange(event.currentTarget.checked)} />
            <span>{t("edge.tangentChains")}</span>
          </label>

          <label className="edge-modifier-check">
            <input type="checkbox" checked={preserveEdgeSize} disabled={disabled} onChange={(event) => onPreserveEdgeSizeChange(event.currentTarget.checked)} />
            <span>{t("edge.keepSize")}</span>
          </label>

          <label className="edge-modifier-field">
            <span>{t("edge.previewQuality")}</span>
            <select value={quality} disabled={disabled} onChange={(event) => onQualityChange(event.currentTarget.value as CadModifierQuality)}>
              <option value="draft">{t("edge.draft")}</option>
              <option value="standard">{t("edge.standard")}</option>
              <option value="fine">{t("edge.fine")}</option>
            </select>
          </label>
        </div>
      ) : null}

      {impliedEdgeCount > 0 ? (
        // The kernel always carries a chamfer or fillet on along edges that continue smoothly;
        // the switch only decides what a click picks, so say what will happen (#161).
        <p className="edge-modifier-note" role="note">
          {t(impliedEdgeCount === 1 ? "edge.tangentImpliedOne" : "edge.tangentImpliedMany", { count: impliedEdgeCount })}
        </p>
      ) : null}

      <div className="edge-modifier-footer">
        <button type="button" className="secondary" onClick={onCancel}>{t(selectedCount === 0 && !busy ? "edge.done" : "common.cancel")}</button>
        <button type="button" className="primary" disabled={!prepared || busy || searching || selectedCount === 0 || Boolean(error)} onClick={onApply}>
          {busy ? <LoaderCircle className="edge-modifier-spinner" size={17} /> : <Check size={17} />}
          {t("edge.apply")}
        </button>
      </div>
      </>)}
    </MovableToolPanel>
  );
}
