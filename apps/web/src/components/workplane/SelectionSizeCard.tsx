"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { scaleShapesByPercent, worldBoxOfShapes, SCALE_PERCENT_MAX, SCALE_PERCENT_MIN } from "@/lib/scaleByPercent";
import type { WorkplaneShape } from "@/types/layerling";

type Axis = "width" | "depth" | "height";

/**
 * Fork (build 19): the overall size of several selected parts, as Tinkercad shows it. Typing a
 * new length, width or height scales all of them together, keeping their proportions and the
 * gaps between them in step (the same scaling as "Scale by percent"), in one undo step.
 */
export function SelectionSizeCard({
  shapes,
  units,
  disabled,
  onUpdateShapes,
}: {
  shapes: readonly WorkplaneShape[];
  units: string;
  disabled: boolean;
  onUpdateShapes: (changes: readonly { id: string; patch: Partial<WorkplaneShape> }[], message?: string) => void;
}) {
  const imperial = units === "Imperial";
  const factor = imperial ? 25.4 : 1;
  const box = worldBoxOfShapes(shapes);
  // In the scene, x runs across, z towards the viewer (depth) and y up.
  const size: Record<Axis, number> = { width: box.max.x - box.min.x, depth: box.max.z - box.min.z, height: box.max.y - box.min.y };
  const shown = (value: number) => String(Math.round((value / factor) * (imperial ? 1000 : 100)) / (imperial ? 1000 : 100));
  const [drafts, setDrafts] = useState<Record<Axis, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = shapes.map((shape) => `${shape.id}:${shape.width}:${shape.depth}:${shape.height}:${shape.x}:${shape.z}`).join("|");
  useEffect(() => {
    setDrafts(null);
    setError(null);
  }, [key]);
  if (!Number.isFinite(size.width) || shapes.length < 2) return null;

  const apply = (axis: Axis) => {
    const text = drafts?.[axis];
    if (text === undefined) return;
    const wanted = Number(text.replace(",", ".")) * factor;
    if (!Number.isFinite(wanted) || wanted <= 0 || size[axis] <= 0) {
      setDrafts(null);
      return;
    }
    const percent = (wanted / size[axis]) * 100;
    if (Math.abs(percent - 100) < 0.01) {
      setDrafts(null);
      return;
    }
    if (percent < SCALE_PERCENT_MIN || percent > SCALE_PERCENT_MAX) {
      setError(t("scalePercent.errorPercent"));
      return;
    }
    const result = scaleShapesByPercent(shapes.filter((shape) => !shape.locked), percent, "together", () => 1000);
    if (!result.ok) {
      setError(result.reason === "percent" ? t("scalePercent.errorPercent") : t(result.reason === "tooSmall" ? "scalePercent.errorTooSmall" : "scalePercent.errorTooLarge", { name: result.name ?? "" }));
      return;
    }
    onUpdateShapes(result.patches, t("selectionSize.scaled", { percent: Math.round(percent * 10) / 10, count: result.patches.length }));
    setDrafts(null);
    setError(null);
  };

  const field = (axis: Axis, label: string) => (
    <label className="selection-size-field" key={axis}>
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={drafts?.[axis] ?? shown(size[axis])}
        onChange={(event) => setDrafts({ width: shown(size.width), depth: shown(size.depth), height: shown(size.height), ...drafts, [axis]: event.target.value })}
        onBlur={() => apply(axis)}
        onKeyDown={(event) => {
          // Enter applies and leaves the field, so Ctrl+Z undoes the scaling rather than the typing.
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDrafts(null);
          event.stopPropagation();
        }}
        aria-label={`${label} (${imperial ? "in" : "mm"})`}
      />
      <small>{imperial ? "in" : "mm"}</small>
    </label>
  );

  return (
    <div className="property-card selection-size-card" role="group" aria-label={t("selectionSize.title")}>
      <div className="selection-size-heading">
        <strong>{t("selectionSize.title")}</strong>
        <span>{t("selectionSize.hint")}</span>
      </div>
      <div className="selection-size-fields">
        {/* As on a single part's panel: Length runs front to back, Width across. */}
        {field("depth", t("prop.length"))}
        {field("width", t("prop.width"))}
        {field("height", t("prop.height"))}
      </div>
      {error ? <p className="selection-size-error" role="alert">{error}</p> : null}
    </div>
  );
}
