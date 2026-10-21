"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { MmField, iconProps } from "@/components/ReadyPartsSection";
import { FIT_TEST_CLEARANCES, fitTestParts, readMyPrintFit, saveMyPrintFit } from "@/lib/fitTest";
import { DEFAULT_ENCLOSURE, enclosureParts, normalizeEnclosure, PORT_SIZES, type EnclosureOptions, type EnclosurePort, type EnclosureSide, type PortPreset } from "@/lib/enclosure";
import { METRIC_SIZES, type MetricSize, type ReadyPart } from "@/lib/readyParts";

type Insert = (parts: ReadyPart[], options?: { sink?: number; carry?: boolean }) => void;

/** Fork (build 21): the fit test - print it, try the peg in each hole, and tell Pare 3D which one fitted. */
export function FitTestCard({ onInsert }: { onInsert: Insert }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<number | null>(() => (typeof window === "undefined" ? null : readMyPrintFit()));
  return (
    <>
      <div className="ready-part ready-part-box">
        <svg {...iconProps} className="ready-part-icon">
          <rect x="3" y="12" width="26" height="9" rx="2" fill="currentColor" fillOpacity="0.18" />
          <circle cx="8" cy="16.5" r="2" /><circle cx="14" cy="16.5" r="2.3" /><circle cx="20.5" cy="16.5" r="2.6" /><circle cx="26.5" cy="16.5" r="1.6" />
        </svg>
        <div>
          <strong>{t("fitTest.title")}</strong>
          <span>{t("fitTest.hint")}</span>
        </div>
        <button type="button" className="ready-part-add" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t("readyParts.hide") : t("readyParts.setUp")}
        </button>
      </div>
      {open ? (
        <div className="ready-part-form">
          <p>{t("fitTest.steps")}</p>
          <button type="button" className="ready-part-make" onClick={() => onInsert(fitTestParts({ strip: t("fitTest.strip"), peg: t("fitTest.peg") }))}>
            {t("fitTest.make")}
          </button>
          <div className="ready-part-fit" role="group" aria-label={t("fitTest.which")}>
            <span>{t("fitTest.which")}</span>
            {FIT_TEST_CLEARANCES.map((clearance) => (
              <button
                type="button"
                key={clearance}
                className={mine === clearance ? "active" : ""}
                aria-pressed={mine === clearance}
                onClick={() => {
                  saveMyPrintFit(clearance);
                  setMine(clearance);
                }}
              >
                {clearance}
              </button>
            ))}
          </div>
          {mine !== null ? <p className="ready-part-note">{t("fitTest.saved", { mm: String(mine) })}</p> : null}
        </div>
      ) : null}
    </>
  );
}

const SIDES: EnclosureSide[] = ["front", "back", "left", "right"];
const PRESETS: PortPreset[] = ["usbC", "microUsb", "usbA", "dcJack", "hdmi", "custom"];

/** Fork (build 21): a box for a circuit board - standoffs, port cut-outs and a vented lid. */
export function EnclosureCard({ onInsert }: { onInsert: Insert }) {
  const [open, setOpen] = useState(false);
  const [o, setO] = useState<EnclosureOptions>(DEFAULT_ENCLOSURE);
  const set = (patch: Partial<EnclosureOptions>) => setO(normalizeEnclosure({ ...o, ...patch }));
  const setPort = (index: number, patch: Partial<EnclosurePort>) => {
    const ports = o.ports.map((port, i) => {
      if (i !== index) return port;
      const next = { ...port, ...patch };
      if (patch.preset && patch.preset !== "custom") Object.assign(next, PORT_SIZES[patch.preset]);
      return next;
    });
    set({ ports });
  };
  return (
    <>
      <div className="ready-part ready-part-box">
        <svg {...iconProps} className="ready-part-icon">
          <path d="M4 12h24v14H4z" fill="currentColor" fillOpacity="0.18" />
          <path d="M3 9h26v3H3z" />
          <rect x="8" y="17" width="16" height="5" rx="0.6" />
          <path d="M4 20h3" />
        </svg>
        <div>
          <strong>{t("enclosure.title")}</strong>
          <span>{t("enclosure.hint")}</span>
        </div>
        <button type="button" className="ready-part-add" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t("readyParts.hide") : t("readyParts.setUp")}
        </button>
      </div>
      {open ? (
        <div className="ready-part-form">
          <p>{t("enclosure.board")}</p>
          <div className="ready-part-fields">
            <MmField label={t("readyParts.boxWidth")} value={o.boardWidth} onChange={(boardWidth) => set({ boardWidth })} />
            <MmField label={t("readyParts.boxDepth")} value={o.boardDepth} onChange={(boardDepth) => set({ boardDepth })} />
            <MmField label={t("enclosure.thickness")} value={o.boardThickness} onChange={(boardThickness) => set({ boardThickness })} />
            <MmField label={t("enclosure.components")} value={o.components} onChange={(components) => set({ components })} />
            <MmField label={t("enclosure.standoff")} value={o.standoff} onChange={(standoff) => set({ standoff })} />
            <MmField label={t("readyParts.boxWall")} value={o.wall} onChange={(wall) => set({ wall })} />
            <MmField label={t("enclosure.gap")} value={o.gap} onChange={(gap) => set({ gap })} />
            <MmField label={t("enclosure.holeInset")} value={o.holeInset} onChange={(holeInset) => set({ holeInset })} />
          </div>
          <div className="ready-part-fit enclosure-mounting" role="group" aria-label={t("enclosure.screws")}>
            <span>{t("enclosure.screws")}</span>
            <select className="ready-part-size" value={o.screw} aria-label={t("enclosure.screws")} onChange={(event) => set({ screw: event.currentTarget.value as MetricSize | "none" })}>
              <option value="none">{t("enclosure.noScrews")}</option>
              {METRIC_SIZES.slice(0, 3).map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            {o.screw !== "none" ? (["insert", "screw"] as const).map((fixing) => (
              <button type="button" key={fixing} className={o.fixing === fixing ? "active" : ""} aria-pressed={o.fixing === fixing} onClick={() => set({ fixing })}>
                {t(fixing === "insert" ? "enclosure.insert" : "enclosure.selfTapping")}
              </button>
            )) : null}
          </div>
          <p>{t("enclosure.ports")}</p>
          {o.ports.map((port, index) => (
            <div className="enclosure-port" key={index}>
              <select aria-label={t("enclosure.portType")} value={port.preset} onChange={(event) => setPort(index, { preset: event.currentTarget.value as PortPreset })}>
                {PRESETS.map((preset) => <option key={preset} value={preset}>{t(`enclosure.preset.${preset}`)}</option>)}
              </select>
              <select aria-label={t("enclosure.side")} value={port.side} onChange={(event) => setPort(index, { side: event.currentTarget.value as EnclosureSide })}>
                {SIDES.map((side) => <option key={side} value={side}>{t(`enclosure.side.${side}`)}</option>)}
              </select>
              <MmField label={t("enclosure.offset")} value={port.offset} onChange={(offset) => setPort(index, { offset })} />
              <MmField label={t("enclosure.above")} value={port.above} onChange={(above) => setPort(index, { above })} />
              {port.preset === "custom" ? (
                <>
                  <MmField label={t("readyParts.boxWidth")} value={port.width} onChange={(width) => setPort(index, { width })} />
                  <MmField label={t("readyParts.boxHeight")} value={port.height} onChange={(height) => setPort(index, { height })} />
                </>
              ) : null}
              <button type="button" className="enclosure-port-remove" aria-label={t("enclosure.removePort")} title={t("enclosure.removePort")} onClick={() => set({ ports: o.ports.filter((_, i) => i !== index) })}>×</button>
            </div>
          ))}
          {o.ports.length < 6 ? (
            <button type="button" className="enclosure-port-add" onClick={() => set({ ports: [...o.ports, { side: "back", preset: "usbC", offset: 0, above: 0, ...PORT_SIZES.usbC }] })}>
              + {t("enclosure.addPort")}
            </button>
          ) : null}
          <p className="ready-part-note">{t("enclosure.portNote")}</p>
          <label className="ready-part-check">
            <input type="checkbox" checked={o.lid} onChange={(event) => set({ lid: event.currentTarget.checked })} />
            {t("readyParts.withLid")}
          </label>
          {o.lid ? (
            <label className="ready-part-check">
              <input type="checkbox" checked={o.vents} onChange={(event) => set({ vents: event.currentTarget.checked })} />
              {t("enclosure.vents")}
            </label>
          ) : null}
          <button
            type="button"
            className="ready-part-make"
            onClick={() => onInsert(enclosureParts(o, { box: t("enclosure.box"), lid: t("readyParts.lidName"), standoff: t("enclosure.standoffName"), port: t("enclosure.portName"), vent: t("enclosure.ventName") }))}
          >
            {t("enclosure.make")}
          </button>
        </div>
      ) : null}
    </>
  );
}
