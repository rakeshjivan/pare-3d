"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { MOUSE_EAR_SIZES } from "@/lib/readyParts";
import type { WorkplaneShape } from "@/types/layerling";

/** Fork: asks the editor to add mouse ears under the selected part's sharp bottom corners. */
export const MOUSE_EARS_EVENT = "pare3d:mouse-ears";
export type MouseEarsRequest = { id: string; diameter: number };

export function MouseEarsCard({ shape, locked }: { shape: WorkplaneShape; locked: boolean }) {
  const [diameter, setDiameter] = useState<number>(12);
  if (shape.hole) return null;
  return (
    <div className="mouse-ears-card">
      <div className="print-fit-heading">
        <strong>{t("mouseEars.title")}</strong>
        <span>{t("mouseEars.intro")}</span>
      </div>
      <div className="mouse-ears-row">
        <select aria-label={t("mouseEars.size")} value={diameter} disabled={locked} onChange={(event) => setDiameter(Number(event.currentTarget.value))}>
          {MOUSE_EAR_SIZES.map((size) => <option key={size} value={size}>{t("mouseEars.sizeOption", { size })}</option>)}
        </select>
        <button
          type="button"
          disabled={locked}
          onClick={() => window.dispatchEvent(new CustomEvent<MouseEarsRequest>(MOUSE_EARS_EVENT, { detail: { id: shape.id, diameter } }))}
        >
          {t("mouseEars.add")}
        </button>
      </div>
    </div>
  );
}
