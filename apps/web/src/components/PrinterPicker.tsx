"use client";

import { Printer } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { printerPresetById } from "@/lib/printBed";
import { PRINTER_PRESETS } from "@/lib/printerPresets.generated";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

/**
 * Fork: choose the printer right on the plate. The build plate takes that printer's bed
 * size at once (the same as Settings › Workplane › Printer), and the overhang warnings use
 * its build volume. My printers come first; every printer Layerling knows follows by maker.
 */
const MY_PRINTER_IDS = ["bambu-lab-a1-mini", "bambu-lab-p2s"] as const;
const COLLATOR = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
const VENDORS = [...new Set(PRINTER_PRESETS.map((preset) => preset.vendor))].sort(COLLATOR.compare);
const BY_VENDOR = new Map(VENDORS.map((vendor) => [
  vendor,
  PRINTER_PRESETS.filter((preset) => preset.vendor === vendor).sort((a, b) => COLLATOR.compare(a.model, b.model)),
]));
const NONE = "";

export function PrinterPicker({
  workspace,
  onWorkspaceChange,
}: {
  workspace: Pick<WorkplaneWorkspaceSettings, "printer" | "width" | "depth">;
  onWorkspaceChange: Dispatch<SetStateAction<WorkplaneWorkspaceSettings>>;
}) {
  const chosen = printerPresetById(workspace.printer);
  const choose = (id: string) => {
    const printer = printerPresetById(id);
    onWorkspaceChange((current) => printer
      ? { ...current, printer: printer.id, width: printer.width, depth: printer.depth, sizePreset: "Custom" }
      : { ...current, printer: NONE });
  };
  const size = chosen
    ? `${chosen.width} × ${chosen.depth} × ${chosen.height} mm`
    : `${Math.round(workspace.width)} × ${Math.round(workspace.depth)} mm`;
  return (
    <label className="printer-picker" title="Choose your printer: the build plate takes its size">
      <Printer size={16} aria-hidden="true" />
      <span className="printer-picker-text">
        <strong>{chosen ? `${chosen.vendor} ${chosen.model}` : "No printer"}</strong>
        <span>{size}</span>
      </span>
      <select aria-label="Printer" value={chosen?.id ?? NONE} onChange={(event) => choose(event.currentTarget.value)}>
        <optgroup label="My printers">
          {MY_PRINTER_IDS.map((id) => printerPresetById(id)).filter((preset) => preset !== null).map((preset) => (
            <option key={`mine-${preset.id}`} value={preset.id}>{`${preset.vendor} ${preset.model}`}</option>
          ))}
        </optgroup>
        <option value={NONE}>No printer (keep the current plate size)</option>
        {VENDORS.map((vendor) => (
          <optgroup key={vendor} label={vendor}>
            {(BY_VENDOR.get(vendor) ?? []).map((preset) => (
              <option key={preset.id} value={preset.id}>{`${preset.vendor} ${preset.model}`}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
