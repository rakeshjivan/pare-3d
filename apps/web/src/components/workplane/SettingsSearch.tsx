"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { t } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages.en";

export type SettingsSection = "appearance" | "measurement" | "workplane" | "shapes" | "history" | "files";

/** Where each setting lives, and whether it is behind "Show advanced settings". */
const INDEX: ReadonlyArray<{ key: MessageKey; section: SettingsSection; advanced?: boolean }> = [
  { key: "workspace.fastMode", section: "appearance" },
  { key: "workspace.theme", section: "appearance" },
  { key: "workspace.toolbarSize", section: "appearance" },
  { key: "workspace.viewCubePosition", section: "appearance" },
  { key: "workspace.showMoveDimensions", section: "appearance" },
  { key: "workspace.showOriginDimensions", section: "appearance" },
  ...(["workspace.backgroundColor", "workspace.surfaceColor", "workspace.showAxes", "workspace.edgeLines", "workspace.edgeColor",
    "workspace.sketchBackground", "workspace.sketchPlateColor", "workspace.sketchGridColor", "workspace.dimensionsAlwaysVisible",
    "workspace.showRotationAngles", "workspace.startInPerspective", "workspace.selectBeforeMoving", "workspace.frameByDirection",
    "workspace.doubleClickOpensSketch", "workspace.doubleClickOpensGroup", "workspace.objectSnap", "workspace.showShadows",
    "workspace.shadowStrength", "workspace.shadowSoftness", "workspace.lightAzimuth", "workspace.lightElevation", "workspace.shadeContrast",
    "workspace.overhangAngle", "workspace.cruise", "workspace.zoomSpeed", "workspace.cameraInertia", "workspace.booleanTriangleLimit"] as const)
    .map((key) => ({ key, section: "appearance" as const, advanced: true })),
  ...(["workspace.units", "workspace.inchFormat", "workspace.scale", "workspace.accuracy", "workspace.snapGrid"] as const).map((key) => ({ key, section: "measurement" as const })),
  ...(["workspace.printer", "workspace.showPlateLabels", "workspace.gridLinesGrow", "workspace.size", "workspace.showGrid", "workspace.gridBlockSize",
    "workspace.gridColor", "workspace.gridMajorEvery", "workspace.gridMajorColor"] as const).map((key) => ({ key, section: "workplane" as const })),
  ...(["workspace.shapeDefaults", "workspace.customLimit"] as const).map((key) => ({ key, section: "shapes" as const })),
  ...(["workspace.savedHistory", "workspace.actionsToRetain", "workspace.customSnapGrids"] as const).map((key) => ({ key, section: "history" as const })),
  ...(["files.exportsTitle", "files.backupsTitle", "files.askEachTime"] as const).map((key) => ({ key, section: "files" as const })),
];

function fold(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Fork (build 20): a search box over every setting. Picking a result opens its section (and the
 * advanced settings when it is one of those) and points at it.
 */
export function SettingsSearch({ onPick }: { onPick: (section: SettingsSection, advanced: boolean, label: string) => void }) {
  const [query, setQuery] = useState("");
  const words = fold(query).split(/\s+/).filter(Boolean);
  const results = words.length
    ? INDEX.map((entry) => ({ ...entry, label: t(entry.key) })).filter((entry) => words.every((word) => fold(entry.label).includes(word))).slice(0, 8)
    : [];
  return (
    <div className="settings-search">
      <label>
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder={t("settings.searchPlaceholder")}
          aria-label={t("settings.searchPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter" && results[0]) {
              onPick(results[0].section, Boolean(results[0].advanced), results[0].label);
              setQuery("");
            }
            if (event.key === "Escape") setQuery("");
          }}
        />
      </label>
      {words.length ? (
        <ul className="settings-search-results" role="listbox">
          {results.length ? results.map((entry) => (
            <li key={entry.key}>
              <button type="button" onClick={() => { onPick(entry.section, Boolean(entry.advanced), entry.label); setQuery(""); }}>
                {entry.label}
              </button>
            </li>
          )) : <li className="empty">{t("settings.searchNone")}</li>}
        </ul>
      ) : null}
    </div>
  );
}
