"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { EnclosureCard, FitTestCard } from "@/components/ReadyPartsMore";
import {
  DEFAULT_BOX_WITH_LID,
  INSERT_HOLES,
  METRIC_SIZES,
  NUTS,
  DEFAULT_FACE_TEXT,
  DEFAULT_LIVING_HINGE,
  DEFAULT_SNAP_FIT,
  boxWithLidParts,
  dividerDrop,
  faceTextPart,
  livingHingePart,
  normalizeLivingHinge,
  normalizeSnapFit,
  snapFitParts,
  snapFitSafeBend,
  type FaceTextOptions,
  type LivingHingeOptions,
  type SnapFitOptions,
  insertHolePart,
  normalizeBoxWithLid,
  nutTrapPart,
  paraboloidPart,
  type BoxWithLidOptions,
  type MetricSize,
  type ReadyPart,
} from "@/lib/readyParts";

/** Fork: the Shapes panel's "Ready-made parts" - built from ordinary shapes, placed with a click. */
export function ReadyPartsSection({ onInsert }: { onInsert: (parts: ReadyPart[], options?: { sink?: number; carry?: boolean }) => void }) {
  useLanguage();
  const [insertSize, setInsertSize] = useState<MetricSize>("M3");
  const [nutSize, setNutSize] = useState<MetricSize>("M3");
  const [boxOpen, setBoxOpen] = useState(false);
  const [box, setBox] = useState<BoxWithLidOptions>(DEFAULT_BOX_WITH_LID);
  const [openForm, setOpenForm] = useState<"snap" | "hinge" | "text" | null>(null);
  const [snap, setSnap] = useState<SnapFitOptions>(DEFAULT_SNAP_FIT);
  const [hinge, setHinge] = useState<LivingHingeOptions>(DEFAULT_LIVING_HINGE);
  const [faceText, setFaceText] = useState<FaceTextOptions>(DEFAULT_FACE_TEXT);
  const toggleForm = (form: "snap" | "hinge" | "text") => setOpenForm(openForm === form ? null : form);
  const safeBend = snapFitSafeBend(snap);
  const insert = INSERT_HOLES[insertSize];
  const nut = NUTS[nutSize];
  return (
    <section className="ready-parts" aria-label={t("readyParts.title")}>
      <p className="ready-parts-intro">{t("readyParts.intro")}</p>
      {(
        <div className="ready-parts-list">
          <div className="ready-part">
            <ParaboloidIcon />
            <div>
              <strong>{t("readyParts.paraboloid")}</strong>
              <span>{t("readyParts.paraboloidHint")}</span>
            </div>
            <button type="button" className="ready-part-add" onClick={() => onInsert([paraboloidPart(t("readyParts.paraboloid"), "#0098c7")])}>{t("readyParts.add")}</button>
          </div>

          <div className="ready-part has-size">
            <InsertIcon />
            <div>
              <strong>{t("readyParts.insert")}</strong>
              <span>{t("readyParts.insertHint", { diameter: insert.diameter.toFixed(1), depth: insert.depth.toFixed(1) })}</span>
            </div>
            <SizePicker label={t("readyParts.insert")} value={insertSize} onChange={setInsertSize} />
            <button
              type="button"
              className="ready-part-add"
              onClick={() => onInsert([insertHolePart(insertSize, t("readyParts.insertName", { size: insertSize }))])}
            >
              {t("readyParts.add")}
            </button>
          </div>

          <div className="ready-part has-size">
            <NutIcon />
            <div>
              <strong>{t("readyParts.nutTrap")}</strong>
              <span>{t("readyParts.nutTrapHint", { flats: nut.acrossFlats.toFixed(1), bolt: nut.clearance.toFixed(1) })}</span>
            </div>
            <SizePicker label={t("readyParts.nutTrap")} value={nutSize} onChange={setNutSize} />
            <button
              type="button"
              className="ready-part-add"
              onClick={() => onInsert([nutTrapPart(nutSize, t("readyParts.nutTrapName", { size: nutSize }))])}
            >
              {t("readyParts.add")}
            </button>
          </div>

          <div className="ready-part ready-part-box">
            <BoxIcon />
            <div>
              <strong>{t("readyParts.box")}</strong>
              <span>{t("readyParts.boxHint")}</span>
            </div>
            <button type="button" className="ready-part-add" aria-expanded={boxOpen} onClick={() => setBoxOpen(!boxOpen)}>
              {boxOpen ? t("readyParts.hide") : t("readyParts.setUp")}
            </button>
          </div>
          <div className="ready-part ready-part-box">
            <TextIcon />
            <div>
              <strong>{t("readyParts.faceText")}</strong>
              <span>{t("readyParts.faceTextHint")}</span>
            </div>
            <button type="button" className="ready-part-add" aria-expanded={openForm === "text"} onClick={() => toggleForm("text")}>
              {openForm === "text" ? t("readyParts.hide") : t("readyParts.setUp")}
            </button>
          </div>
          {openForm === "text" ? (
            <div className="ready-part-form">
              <label className="ready-part-field">
                <span>{t("readyParts.textLabel")}</span>
                <span className="ready-part-input">
                  <input type="text" aria-label={t("readyParts.textLabel")} value={faceText.text} maxLength={24} onKeyDown={(event) => event.stopPropagation()} onChange={(event) => setFaceText({ ...faceText, text: event.currentTarget.value })} style={{ textAlign: "left" }} />
                </span>
              </label>
              <div className="ready-part-fields">
                <MmField label={t("readyParts.letterHeight")} value={faceText.letterHeight} onChange={(letterHeight) => setFaceText({ ...faceText, letterHeight: Math.max(2, Math.min(200, letterHeight)) })} />
                <MmField label={t("readyParts.textDepth")} value={faceText.depth} onChange={(depth) => setFaceText({ ...faceText, depth: Math.max(0.2, Math.min(20, depth)) })} />
              </div>
              <div className="ready-part-fit" role="group" aria-label={t("readyParts.textMode")}>
                {(["engraved", "raised"] as const).map((mode) => (
                  <button type="button" key={mode} className={faceText.mode === mode ? "active" : ""} aria-pressed={faceText.mode === mode} onClick={() => setFaceText({ ...faceText, mode })}>
                    {t(mode === "engraved" ? "readyParts.engraved" : "readyParts.raised")}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="ready-part-make"
                onClick={() => {
                  const part = faceTextPart(faceText, faceText.text || "TEXT");
                  onInsert([part], { sink: part.sink, carry: true });
                }}
              >
                {t("readyParts.placeText")}
              </button>
            </div>
          ) : null}

          <div className="ready-part ready-part-box">
            <SnapIcon />
            <div>
              <strong>{t("readyParts.snapFit")}</strong>
              <span>{t("readyParts.snapFitHint")}</span>
            </div>
            <button type="button" className="ready-part-add" aria-expanded={openForm === "snap"} onClick={() => toggleForm("snap")}>
              {openForm === "snap" ? t("readyParts.hide") : t("readyParts.setUp")}
            </button>
          </div>
          {openForm === "snap" ? (
            <div className="ready-part-form">
              <div className="ready-part-fields">
                <MmField label={t("readyParts.snapLength")} value={snap.length} onChange={(length) => setSnap(normalizeSnapFit({ ...snap, length }))} />
                <MmField label={t("readyParts.snapThickness")} value={snap.thickness} onChange={(thickness) => setSnap(normalizeSnapFit({ ...snap, thickness }))} />
                <MmField label={t("readyParts.snapWidth")} value={snap.width} onChange={(width) => setSnap(normalizeSnapFit({ ...snap, width }))} />
                <MmField label={t("readyParts.snapCatch")} value={snap.catchDepth} onChange={(catchDepth) => setSnap(normalizeSnapFit({ ...snap, catchDepth }))} />
              </div>
              <p className={`ready-part-note ${snap.catchDepth > safeBend ? "warning" : ""}`}>
                {t(snap.catchDepth > safeBend ? "readyParts.snapTooStiff" : "readyParts.snapOk", { bend: safeBend.toFixed(1), catch: snap.catchDepth.toFixed(1) })}
              </p>
              <button type="button" className="ready-part-make" onClick={() => onInsert(snapFitParts(snap, { hook: t("readyParts.snapHook"), slot: t("readyParts.snapSlot") }))}>
                {t("readyParts.makeSnapFit")}
              </button>
            </div>
          ) : null}

          <div className="ready-part ready-part-box">
            <HingeIcon />
            <div>
              <strong>{t("readyParts.livingHinge")}</strong>
              <span>{t("readyParts.livingHingeHint")}</span>
            </div>
            <button type="button" className="ready-part-add" aria-expanded={openForm === "hinge"} onClick={() => toggleForm("hinge")}>
              {openForm === "hinge" ? t("readyParts.hide") : t("readyParts.setUp")}
            </button>
          </div>
          {openForm === "hinge" ? (
            <div className="ready-part-form">
              <div className="ready-part-fields">
                <MmField label={t("readyParts.hingeLeaf")} value={hinge.leaf} onChange={(leaf) => setHinge(normalizeLivingHinge({ ...hinge, leaf }))} />
                <MmField label={t("readyParts.snapWidth")} value={hinge.width} onChange={(width) => setHinge(normalizeLivingHinge({ ...hinge, width }))} />
                <MmField label={t("readyParts.snapThickness")} value={hinge.thickness} onChange={(thickness) => setHinge(normalizeLivingHinge({ ...hinge, thickness }))} />
                <MmField label={t("readyParts.hingeGap")} value={hinge.gap} onChange={(gap) => setHinge(normalizeLivingHinge({ ...hinge, gap }))} />
                <MmField label={t("readyParts.hingeWeb")} value={hinge.web} onChange={(web) => setHinge(normalizeLivingHinge({ ...hinge, web }))} />
              </div>
              <p className="ready-part-note">{t("readyParts.hingeNote")}</p>
              <button type="button" className="ready-part-make" onClick={() => onInsert([livingHingePart(hinge, t("readyParts.livingHinge"))])}>
                {t("readyParts.makeHinge")}
              </button>
            </div>
          ) : null}

          {boxOpen ? (
            <div className="ready-part-form">
              <p>{t("readyParts.boxInside")}</p>
              <div className="ready-part-fields">
                <MmField label={t("readyParts.boxWidth")} value={box.width} onChange={(width) => setBox(normalizeBoxWithLid({ ...box, width }))} />
                <MmField label={t("readyParts.boxDepth")} value={box.depth} onChange={(depth) => setBox(normalizeBoxWithLid({ ...box, depth }))} />
                <MmField label={t("readyParts.boxHeight")} value={box.height} onChange={(height) => setBox(normalizeBoxWithLid({ ...box, height }))} />
                <MmField label={t("readyParts.boxWall")} value={box.wall} onChange={(wall) => setBox(normalizeBoxWithLid({ ...box, wall }))} />
                <MmField label={t("readyParts.columns")} unit="" value={box.columns} onChange={(columns) => setBox(normalizeBoxWithLid({ ...box, columns }))} />
                <MmField label={t("readyParts.rows")} unit="" value={box.rows} onChange={(rows) => setBox(normalizeBoxWithLid({ ...box, rows }))} />
                <MmField label={t("readyParts.radius")} value={box.radius} onChange={(radius) => setBox(normalizeBoxWithLid({ ...box, radius }))} />
                {box.columns * box.rows > 1 ? (
                  <MmField label={t("readyParts.dividerHeight")} value={box.dividerHeight ?? box.height} onChange={(dividerHeight) => setBox(normalizeBoxWithLid({ ...box, dividerHeight }))} />
                ) : null}
              </div>
              <label className="ready-part-check">
                <input type="checkbox" checked={box.stackable} onChange={(event) => setBox(normalizeBoxWithLid({ ...box, stackable: event.currentTarget.checked }))} />
                {t("readyParts.stackable")}
              </label>
              <label className="ready-part-check">
                <input type="checkbox" checked={box.lid} onChange={(event) => setBox(normalizeBoxWithLid({ ...box, lid: event.currentTarget.checked }))} />
                {t("readyParts.withLid")}
              </label>
              {box.columns * box.rows > 1 && (box.lid || box.stackable) && dividerDrop({ ...box, dividerHeight: null }) > (box.dividerHeight === null ? 0 : box.height - box.dividerHeight) ? (
                <p className="ready-part-note">{t("readyParts.dividerNote", { mm: String(Math.round(dividerDrop(box) * 10) / 10) })}</p>
              ) : null}
              {box.lid ? (
              <div className="ready-part-fit" role="group" aria-label={t("readyParts.lidFit")}>
                <span>{t("readyParts.lidFit")}</span>
                {([0.1, 0.2, 0.4] as const).map((clearance) => (
                  <button
                    type="button"
                    key={clearance}
                    className={Math.abs(box.clearance - clearance) < 1e-6 ? "active" : ""}
                    aria-pressed={Math.abs(box.clearance - clearance) < 1e-6}
                    title={t(clearance === 0.1 ? "printFit.pressHint" : clearance === 0.2 ? "printFit.snugHint" : "printFit.looseHint")}
                    onClick={() => setBox({ ...box, clearance })}
                  >
                    {t(clearance === 0.1 ? "printFit.press" : clearance === 0.2 ? "printFit.snug" : "printFit.loose")}
                  </button>
                ))}
              </div>
              ) : null}
              <button
                type="button"
                className="ready-part-make"
                onClick={() => onInsert(boxWithLidParts(box, { box: t("readyParts.boxName"), lid: t("readyParts.lidName") }))}
              >
                {t(box.lid ? "readyParts.makeBox" : "readyParts.makeBoxOnly")}
              </button>
            </div>
          ) : null}
          {/* Fork (build 21): the fit test and the enclosure maker. */}
          <FitTestCard onInsert={onInsert} />
          <EnclosureCard onInsert={onInsert} />
        </div>
      )}
    </section>
  );
}

function SizePicker({ label, value, onChange }: { label: string; value: MetricSize; onChange: (size: MetricSize) => void }) {
  return (
    <select className="ready-part-size" aria-label={t("readyParts.sizeOf", { name: label })} value={value} onChange={(event) => onChange(event.currentTarget.value as MetricSize)}>
      {METRIC_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
    </select>
  );
}

export function MmField({ label, value, onChange, unit = "mm" }: { label: string; value: number; onChange: (value: number) => void; unit?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) {
      const parsed = Number(draft.replace(",", "."));
      if (Number.isFinite(parsed)) onChange(parsed);
    }
    setDraft(null);
  };
  return (
    <label className="ready-part-field">
      <span>{label}</span>
      <span className="ready-part-input">
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={draft ?? String(value)}
          onFocus={(event) => { setDraft(String(value)); event.currentTarget.select(); }}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") { setDraft(null); event.currentTarget.blur(); }
          }}
        />
        {unit ? <small>{unit}</small> : null}
      </span>
    </label>
  );
}

export const iconProps = { width: 30, height: 30, viewBox: "0 0 32 32", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true } as const;

function ParaboloidIcon() {
  return (
    <svg {...iconProps} className="ready-part-icon">
      <path d="M4 26 C 7 4, 25 4, 28 26 Z" fill="currentColor" fillOpacity="0.18" />
      <ellipse cx="16" cy="26" rx="12" ry="2.5" />
    </svg>
  );
}

function InsertIcon() {
  return (
    <svg {...iconProps} className="ready-part-icon">
      <rect x="10" y="5" width="12" height="22" rx="1.5" fill="currentColor" fillOpacity="0.18" />
      <path d="M10 10h12M10 14h12M10 18h12M10 22h12" />
      <circle cx="16" cy="5.5" r="2.2" />
    </svg>
  );
}

function NutIcon() {
  return (
    <svg {...iconProps} className="ready-part-icon">
      <path d="M16 3 27 9.5v13L16 29 5 22.5v-13Z" fill="currentColor" fillOpacity="0.18" />
      <circle cx="16" cy="16" r="5" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg {...iconProps} className="ready-part-icon">
      <rect x="3" y="9" width="26" height="15" rx="2" fill="currentColor" fillOpacity="0.18" />
      <path d="M9 13h8M13 13v8M19 21l2.5-8 2.5 8M20 18.5h3" />
    </svg>
  );
}

function SnapIcon() {
  return (
    <svg {...iconProps} className="ready-part-icon">
      <path d="M8 28V6h4v14h3l-3 5" fill="currentColor" fillOpacity="0.18" />
      <path d="M20 4v10M20 18v10M24 4v10M24 18v10" />
    </svg>
  );
}

function HingeIcon() {
  return (
    <svg {...iconProps} className="ready-part-icon">
      <path d="M3 20h11v4H3ZM18 20h11v4H18Z" fill="currentColor" fillOpacity="0.18" />
      <path d="M14 23.3h4" strokeWidth="1" />
      <path d="M8 16c4-6 12-6 16 0" strokeDasharray="2 2" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg {...iconProps} className="ready-part-icon">
      <path d="M5 13h22v14H5Z" fill="currentColor" fillOpacity="0.18" />
      <path d="M3.5 8h25v3.5h-25Z" />
      <path d="M8 11.5V13M24 11.5V13" />
    </svg>
  );
}
