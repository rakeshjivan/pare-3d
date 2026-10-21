"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { BUSY_EVENT, type BusyKind } from "@/lib/busy";

const LABELS: Record<BusyKind, "busy.combine" | "busy.cad" | "busy.export"> = { combine: "busy.combine", cad: "busy.cad", export: "busy.export" };

/** Fork (build 20): a small "Working…" pill while slow work runs, shown only if it takes longer than a moment. */
export function BusyIndicator() {
  const [kinds, setKinds] = useState<BusyKind[]>([]);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onBusy = (event: Event) => setKinds((event as CustomEvent<BusyKind[]>).detail);
    window.addEventListener(BUSY_EVENT, onBusy);
    return () => window.removeEventListener(BUSY_EVENT, onBusy);
  }, []);
  useEffect(() => {
    if (!kinds.length) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), 350);
    return () => window.clearTimeout(timer);
  }, [kinds.length]);
  if (!visible || !kinds.length) return null;
  return (
    <div className="busy-indicator" role="status" aria-live="polite">
      <LoaderCircle size={15} className="spin" aria-hidden="true" />
      {t(LABELS[kinds[0]])}
    </div>
  );
}
