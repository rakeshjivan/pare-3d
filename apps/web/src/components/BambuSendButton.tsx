"use client";

import { ChevronDown, ListChecks, Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { installedSlicers, readBambuFormat, readSlicer, SEND_TO_BAMBU_EVENT, SLICERS, slicerName, storeBambuFormat, storeSlicer, type BambuSendFormat, type SlicerId } from "@/lib/bambuSend";
import { t } from "@/lib/i18n";
import { checkBeforeSending, PRINT_CHECK_EVENT } from "@/components/PrintCheckPanel";

/**
 * Fork: one click from the design to the slicer, as STL or as 3MF (keeps colours and parts).
 * Build 70: Bambu Studio, OrcaSlicer, PrusaSlicer, PreForm, CHITUBOX or Lychee Slicer, chosen in the menu.
 */
export function BambuSendButton() {
  const [format, setFormat] = useState<BambuSendFormat>("stl");
  const [slicer, setSlicer] = useState<SlicerId>("bambu");
  const [installed, setInstalled] = useState<SlicerId[] | null>(null);
  useEffect(() => setSlicer(readSlicer()), []);
  const pickSlicer = (next: SlicerId) => {
    setSlicer(next);
    storeSlicer(next);
  };
  const app = slicerName(slicer);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (menuOpen) void installedSlicers().then(setInstalled);
  }, [menuOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const [checkFirst, setCheckFirst] = useState(true);
  useEffect(() => setCheckFirst(checkBeforeSending()), [menuOpen]);
  const toggleCheckFirst = () => {
    const next = !checkFirst;
    setCheckFirst(next);
    try {
      window.localStorage.setItem("pare3d.checkBeforeSend", next ? "on" : "off");
    } catch {
      // Applies for this visit.
    }
  };
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setFormat(readBambuFormat()), []);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuOpen]);
  const send = () => window.dispatchEvent(new CustomEvent(SEND_TO_BAMBU_EVENT, { detail: { format } }));
  const choose = (next: BambuSendFormat) => {
    setFormat(next);
    storeBambuFormat(next);
    setMenuOpen(false);
  };
  return (
    <div className="bambu-send" ref={ref}>
      <button type="button" className="bambu-send-main" onClick={send} title={t("slicer.sendTitle", { format: format.toUpperCase(), app })}>
        <Printer size={16} aria-hidden="true" />
        <span className="bambu-send-long">{t("slicer.sendTo", { app })}</span>
        <span className="bambu-send-short">{app}</span>
      </button>
      <button
        type="button"
        className="bambu-send-format"
        aria-label={t("slicer.fileType", { app })}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {format.toUpperCase()}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {menuOpen ? (
        <div className="bambu-send-menu" role="menu">
          <p className="bambu-send-heading">{t("slicer.menuTitle")}</p>
          <div className="bambu-send-slicers">
            {(["fdm", "resin"] as const).map((kind) => (
              <div key={kind} className="bambu-send-slicer-group" role="group" aria-label={t(`slicer.${kind}`)}>
                <span className="bambu-send-kind">{t(`slicer.${kind}`)}</span>
                {SLICERS.filter((entry) => entry.kind === kind).map((entry) => (
                  <button key={entry.id} type="button" role="menuitemradio" aria-checked={slicer === entry.id} className={slicer === entry.id ? "active" : ""} onClick={() => pickSlicer(entry.id)}>
                    {entry.name}
                    {installed && !installed.includes(entry.id) ? <em>{t("slicer.notFound")}</em> : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <button type="button" role="menuitemradio" aria-checked={format === "stl"} onClick={() => choose("stl")}>
            <strong>STL</strong>
            <span>One merged body, as most models are shared</span>
          </button>
          <button type="button" role="menuitemradio" aria-checked={format === "3mf"} onClick={() => choose("3mf")}>
            <strong>3MF</strong>
            <span>Keeps each part and its colour, for multicolour prints</span>
          </button>
          {/* Fork (build 19): the "Ready to print?" check, run on its own or before every send. */}
          <button type="button" role="menuitemcheckbox" aria-checked={checkFirst} onClick={toggleCheckFirst}>
            <strong>{t("printCheck.menuItem")}{checkFirst ? " ✓" : ""}</strong>
            <span>{t("printCheck.menuItemHint")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              window.dispatchEvent(new Event(PRINT_CHECK_EVENT));
            }}
          >
            <strong><ListChecks size={14} aria-hidden="true" /> {t("printCheck.title")}</strong>
            <span>{t("printCheck.command")}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
