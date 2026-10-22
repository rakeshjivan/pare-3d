"use client";

import { BoxPartIcon, FlexiPartIcon, HingePartIcon, InsertPartIcon, JarPartIcon, NutPartIcon, ParaboloidPartIcon, SnapPartIcon, TextPartIcon } from "@/components/readyPartIcons";
import { DEFAULT_JAR, jarParts, normalizeJar, type JarOptions } from "@/lib/readyJar";
import { DEFAULT_FLEXI_CHAIN, flexiChainParts, normalizeFlexiChain, type FlexiChainOptions } from "@/lib/flexiJoint";
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
  const [openForm, setOpenForm] = useState<"snap" | "hinge" | "text" | "jar" | "flexi" | null>(null);
  const [jar, setJar] = useState<JarOptions>(DEFAULT_JAR);
  const [flexi, setFlexi] = useState<FlexiChainOptions>(DEFAULT_FLEXI_CHAIN);
  const [snap, setSnap] = useState<SnapFitOptions>(DEFAULT_SNAP_FIT);
  const [hinge, setHinge] = useState<LivingHingeOptions>(DEFAULT_LIVING_HINGE);
  const [faceText, setFaceText] = useState<FaceTextOptions>(DEFAULT_FACE_TEXT);
  const toggleForm = (form: "snap" | "hinge" | "text" | "jar" | "flexi") => setOpenForm(openForm === form ? null : form);
  const safeBend = snapFitSafeBend(snap);
  const insert = INSERT_HOLES[insertSize];
  const nut = NUTS[nutSize];
  return (
    <section className="ready-parts" aria-label={t("readyParts.title")}>
      <p className="ready-parts-intro">{t("readyParts.intro")}</p>
      {(
        <div className="ready-parts-list">
          <div className="ready-part">
            <ParaboloidPartIcon />
            <div>
              <strong>{t("readyParts.paraboloid")}</strong>
              <span>{t("readyParts.paraboloidHint")}</span>
            </div>
            <button type="button" className="ready-part-add" onClick={() => onInsert([paraboloidPart(t("readyParts.paraboloid"), "#0098c7")])}>{t("readyParts.add")}</button>
          </div>

          <div className="ready-part has-size">
            <InsertPartIcon />
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
            <NutPartIcon />
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
            <BoxPartIcon />
            <div>
              <strong>{t("readyParts.box")}</strong>
              <span>{t("readyParts.boxHint")}</span>
            </div>
            <button type="button" className="ready-part-add" aria-expanded={boxOpen} onClick={() => setBoxOpen(!boxOpen)}>
              {boxOpen ? t("readyParts.hide") : t("readyParts.setUp")}
            </button>
          </div>
          <div className="ready-part ready-part-box">
            <TextPartIcon />
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
            <SnapPartIcon />
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
            <HingePartIcon />
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

          <div className="ready-part ready-part-box">
            <JarPartIcon />
            <div>
              <strong>{t("readyParts.jar")}</strong>
              <span>{t("readyParts.jarHint")}</span>
            </div>
            <button type="button" className="ready-part-add" aria-expanded={openForm === "jar"} onClick={() => toggleForm("jar")}>
              {openForm === "jar" ? t("readyParts.hide") : t("readyParts.setUp")}
            </button>
          </div>
          {openForm === "jar" ? (
            <div className="ready-part-form">
              <div className="ready-part-fields">
                <MmField label={t("readyParts.jarInside")} value={jar.inside} onChange={(inside) => setJar(normalizeJar({ ...jar, inside }))} />
                <MmField label={t("readyParts.jarHeight")} value={jar.height} onChange={(height) => setJar(normalizeJar({ ...jar, height }))} />
                <MmField label={t("readyParts.boxWall")} value={jar.wall} onChange={(wall) => setJar(normalizeJar({ ...jar, wall }))} />
                <MmField label={t("readyParts.jarNeck")} value={jar.neck} onChange={(neck) => setJar(normalizeJar({ ...jar, neck }))} />
                <MmField label={t("readyParts.jarPitch")} value={jar.pitch} onChange={(pitch) => setJar(normalizeJar({ ...jar, pitch }))} />
                <MmField label={t("readyParts.jarClearance")} value={jar.clearance} onChange={(clearance) => setJar(normalizeJar({ ...jar, clearance }))} />
              </div>
              <p className="ready-part-note">{t("readyParts.jarNote")}</p>
              <button type="button" className="ready-part-make" onClick={() => onInsert(jarParts(jar, { jar: t("readyParts.jar"), lid: t("readyParts.lidName") }))}>
                {t("readyParts.makeJar")}
              </button>
            </div>
          ) : null}

          <div className="ready-part ready-part-box">
            <FlexiPartIcon />
            <div>
              <strong>{t("readyParts.flexi")}</strong>
              <span>{t("readyParts.flexiHint")}</span>
            </div>
            <button type="button" className="ready-part-add" aria-expanded={openForm === "flexi"} onClick={() => toggleForm("flexi")}>
              {openForm === "flexi" ? t("readyParts.hide") : t("readyParts.setUp")}
            </button>
          </div>
          {openForm === "flexi" ? (
            <div className="ready-part-form">
              <div className="ready-part-fields">
                <MmField label={t("readyParts.flexiSegments")} unit="" value={flexi.segments} onChange={(segments) => setFlexi(normalizeFlexiChain({ ...flexi, segments }))} />
                <MmField label={t("readyParts.flexiLength")} value={flexi.length} onChange={(length) => setFlexi(normalizeFlexiChain({ ...flexi, length }))} />
                <MmField label={t("readyParts.flexiWidth")} value={flexi.width} onChange={(width) => setFlexi(normalizeFlexiChain({ ...flexi, width }))} />
                <MmField label={t("readyParts.flexiThickness")} value={flexi.thickness} onChange={(thickness) => setFlexi(normalizeFlexiChain({ ...flexi, thickness }))} />
                <MmField label={t("readyParts.flexiClearance")} value={flexi.clearance} onChange={(clearance) => setFlexi(normalizeFlexiChain({ ...flexi, clearance }))} />
              </div>
              <p className="ready-part-note">{t("readyParts.flexiNote")}</p>
              <button type="button" className="ready-part-make" onClick={() => onInsert(flexiChainParts(flexi, t("readyParts.flexi")))}>
                {t("readyParts.makeFlexi")}
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

