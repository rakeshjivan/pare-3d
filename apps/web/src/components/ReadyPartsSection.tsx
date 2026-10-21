"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import {
  DEFAULT_BOX_WITH_LID,
  INSERT_HOLES,
  METRIC_SIZES,
  NUTS,
  boxWithLidParts,
  dividerDrop,
  insertHolePart,
  normalizeBoxWithLid,
  nutTrapPart,
  paraboloidPart,
  type BoxWithLidOptions,
  type MetricSize,
  type ReadyPart,
} from "@/lib/readyParts";

/** Fork: the Shapes panel's "Ready-made parts" - built from ordinary shapes, placed with a click. */
export function ReadyPartsSection({ onInsert }: { onInsert: (parts: ReadyPart[]) => void }) {
  useLanguage();
  const [open, setOpen] = useState(true);
  const [insertSize, setInsertSize] = useState<MetricSize>("M3");
  const [nutSize, setNutSize] = useState<MetricSize>("M3");
  const [boxOpen, setBoxOpen] = useState(false);
  const [box, setBox] = useState<BoxWithLidOptions>(DEFAULT_BOX_WITH_LID);
  const insert = INSERT_HOLES[insertSize];
  const nut = NUTS[nutSize];
  return (
    <section className="ready-parts" aria-label={t("readyParts.title")}>
      <button type="button" className="ready-parts-heading" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
        {t("readyParts.title")}
      </button>
      {open ? (
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
        </div>
      ) : null}
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

function MmField({ label, value, onChange, unit = "mm" }: { label: string; value: number; onChange: (value: number) => void; unit?: string }) {
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

const iconProps = { width: 30, height: 30, viewBox: "0 0 32 32", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true } as const;

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

function BoxIcon() {
  return (
    <svg {...iconProps} className="ready-part-icon">
      <path d="M5 13h22v14H5Z" fill="currentColor" fillOpacity="0.18" />
      <path d="M3.5 8h25v3.5h-25Z" />
      <path d="M8 11.5V13M24 11.5V13" />
    </svg>
  );
}
