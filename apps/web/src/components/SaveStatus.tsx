"use client";

import { CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";

export const SAVE_STATE_EVENT = "pare3d:save-state";

/**
 * Fork (build 20): "Saving…" / "Saved" beside the design name, so it is plain that the work is
 * kept - designs save themselves on this computer, with no button to press.
 */
export function SaveStatus() {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(() => {
    let timer = 0;
    const onState = (event: Event) => {
      const next = (event as CustomEvent<"saving" | "saved" | "error">).detail;
      window.clearTimeout(timer);
      // A save that ends quickly shows "Saved" straight away rather than flickering "Saving…".
      if (next === "saving") timer = window.setTimeout(() => setState("saving"), 400);
      else setState(next);
    };
    window.addEventListener(SAVE_STATE_EVENT, onState);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(SAVE_STATE_EVENT, onState);
    };
  }, []);
  if (state === "idle") return null;
  return (
    <span className={`save-status ${state}`} role="status" aria-live="polite" title={state === "error" ? t("saveStatus.errorHint") : t("saveStatus.hint")}>
      {state === "saving" ? <LoaderCircle size={13} className="spin" aria-hidden="true" /> : state === "error" ? <CircleAlert size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
      <span className="save-status-text">{t(state === "saving" ? "saveStatus.saving" : state === "error" ? "saveStatus.error" : "saveStatus.saved")}</span>
    </span>
  );
}
