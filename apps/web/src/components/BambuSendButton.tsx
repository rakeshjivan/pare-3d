"use client";

import { ChevronDown, ListChecks, Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { readBambuFormat, SEND_TO_BAMBU_EVENT, storeBambuFormat, type BambuSendFormat } from "@/lib/bambuSend";
import { t } from "@/lib/i18n";
import { checkBeforeSending, PRINT_CHECK_EVENT } from "@/components/PrintCheckPanel";

/** Fork: one click from the design to Bambu Studio, as STL or as 3MF (keeps colours and parts). */
export function BambuSendButton() {
  const [format, setFormat] = useState<BambuSendFormat>("stl");
  const [menuOpen, setMenuOpen] = useState(false);
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
      <button type="button" className="bambu-send-main" onClick={send} title={`Export the design as ${format.toUpperCase()} and open it in Bambu Studio`}>
        <Printer size={16} aria-hidden="true" />
        <span className="bambu-send-long">Send to Bambu Studio</span>
        <span className="bambu-send-short">Bambu Studio</span>
      </button>
      <button
        type="button"
        className="bambu-send-format"
        aria-label="File type for Bambu Studio"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {format.toUpperCase()}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {menuOpen ? (
        <div className="bambu-send-menu" role="menu">
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
