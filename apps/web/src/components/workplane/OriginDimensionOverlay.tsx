"use client";

import type { CSSProperties } from "react";
import type { OriginDimensionOverlayData } from "@/lib/originDimensionLines";
import { t } from "@/lib/i18n";

/** Rein ablesbare Anzeige - das Eintippen ist bewusst ein spaeterer Schritt, siehe layerling-lineal.md. */
export function OriginDimensionOverlay({ overlay }: { overlay: OriginDimensionOverlayData }) {
  const styleForLine = (line: OriginDimensionOverlayData["lines"][number]) => ({
    "--overlay-x": `${line.labelX}px`,
    "--overlay-y": `${line.labelY}px`,
  }) as CSSProperties;

  return (
    <div className="origin-dimension-overlay" aria-label={t("aria.originDimensions")}>
      {overlay.lines.map((line) => (
        <span
          key={line.axis}
          className="dimension-label origin-dimension-value"
          style={styleForLine(line)}
          title={t("originDimension.hint")}
        >
          {/* Fork (build 15): say which way the number runs - the scene's z is the user's Y. */}
          <span className="origin-dimension-axis">{line.axis === "x" ? "X" : "Y"}</span> {line.label}
        </span>
      ))}
    </div>
  );
}
