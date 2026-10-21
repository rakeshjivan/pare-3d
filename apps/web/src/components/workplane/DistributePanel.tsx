"use client";

import { AlignHorizontalSpaceAround, LayoutGrid, MoveHorizontal } from "lucide-react";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { DistributeAxis } from "@/lib/distribute";

export type DistributeAction = { kind: "even"; axis: DistributeAxis } | { kind: "gap"; axis: DistributeAxis; gap: number } | { kind: "arrange"; gap: number };

/** Fork: spacing the selected parts out, shown with the Align tool. */
export function DistributePanel({ count, onApply }: { count: number; onApply: (action: DistributeAction) => void }) {
  useLanguage();
  const [axis, setAxis] = useState<DistributeAxis>("x");
  const [gap, setGap] = useState(5);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) {
      const value = Number(draft.replace(",", "."));
      if (Number.isFinite(value)) setGap(Math.max(-50, Math.min(200, value)));
    }
    setDraft(null);
  };
  return (
    <div className="distribute-panel" role="group" aria-label={t("distribute.title")}>
      <strong>{t("distribute.title")}</strong>
      <div className="distribute-row">
        <span>{t("distribute.along")}</span>
        <div className="distribute-choice" role="radiogroup" aria-label={t("distribute.along")}>
          {(["x", "y"] as const).map((option) => (
            <button key={option} type="button" role="radio" aria-checked={axis === option} className={axis === option ? "active" : ""} onClick={() => setAxis(option)}>
              {option.toUpperCase()}
            </button>
          ))}
        </div>
        <span>{t("distribute.gap")}</span>
        <span className="distribute-input">
          <input
            type="text"
            inputMode="decimal"
            aria-label={t("distribute.gap")}
            value={draft ?? String(gap)}
            onFocus={(event) => { setDraft(String(gap)); event.currentTarget.select(); }}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") { setDraft(null); event.currentTarget.blur(); }
            }}
          />
          <small>mm</small>
        </span>
      </div>
      <div className="distribute-actions">
        <button type="button" disabled={count < 3} title={t("distribute.evenHint")} onClick={() => onApply({ kind: "even", axis })}>
          <AlignHorizontalSpaceAround size={16} aria-hidden="true" />
          {t("distribute.even")}
        </button>
        <button type="button" title={t("distribute.gapHint", { gap })} onClick={() => onApply({ kind: "gap", axis, gap })}>
          <MoveHorizontal size={16} aria-hidden="true" />
          {t("distribute.setGap", { gap })}
        </button>
        <button type="button" title={t("distribute.arrangeHint", { gap })} onClick={() => onApply({ kind: "arrange", gap })}>
          <LayoutGrid size={16} aria-hidden="true" />
          {t("distribute.arrange")}
        </button>
      </div>
    </div>
  );
}
