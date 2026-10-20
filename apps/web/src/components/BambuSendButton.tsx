"use client";

import { ChevronDown, Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { readBambuFormat, SEND_TO_BAMBU_EVENT, storeBambuFormat, type BambuSendFormat } from "@/lib/bambuSend";

/** Fork: one click from the design to Bambu Studio, as STL or as 3MF (keeps colours and parts). */
export function BambuSendButton() {
  const [format, setFormat] = useState<BambuSendFormat>("stl");
  const [menuOpen, setMenuOpen] = useState(false);
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
        <span>Send to Bambu Studio</span>
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
        </div>
      ) : null}
    </div>
  );
}
