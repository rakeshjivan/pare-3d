"use client";

import { ChevronUp } from "lucide-react";
import { useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";

const STORAGE_KEY = "pare3d.printHelpersOpen";

function readOpen() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Fork (build 15): Print fit and Mouse ears in one folded card below the sizes, so a beginner sees
 * the part's sizes first. It remembers whether it was left open.
 */
export function PrintHelpers({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(readOpen);
  const toggle = () => {
    setOpen((value) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, value ? "0" : "1");
      } catch {
        /* storage blocked: the card still opens and closes */
      }
      return !value;
    });
  };
  return (
    <div className={`property-card print-helpers ${open ? "" : "collapsed"}`}>
      <button className="property-card-header" type="button" aria-expanded={open} onClick={toggle} title={t("printHelpers.hint")}>
        <span>{t("printHelpers.title")}</span>
        <ChevronUp className={open ? "" : "collapsed"} size={25} strokeWidth={2.8} />
      </button>
      {open ? <div className="print-helpers-body">{children}</div> : null}
    </div>
  );
}
