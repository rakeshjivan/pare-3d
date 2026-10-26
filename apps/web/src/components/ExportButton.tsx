"use client";

import { Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { EXPORT_TARGET_EVENT, OPEN_EXPORT_WINDOW_EVENT, readExportTarget, slicerName, type ExportTarget } from "@/lib/bambuSend";
import { t } from "@/lib/i18n";
import { COMMAND_SHORTCUTS } from "@/lib/commandKeywords";

/**
 * Build 71: the blue Export button. It opens the Export window - where the file opens, its type,
 * its name and folder - in place of build 70's Send button and the small export icon.
 */
export function ExportButton() {
  const [target, setTarget] = useState<ExportTarget>("none");
  useEffect(() => {
    const refresh = () => setTarget(readExportTarget());
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener(EXPORT_TARGET_EVENT, refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener(EXPORT_TARGET_EVENT, refresh);
    };
  }, []);
  const title = target === "none" ? t("exportWindow.buttonTitle") : t("exportWindow.buttonTitleSlicer", { app: slicerName(target) });
  return (
    <div className="bambu-send export-button">
      <button type="button" className="bambu-send-main" data-layerling-tool="export" title={`${title} (${COMMAND_SHORTCUTS.export})`} onClick={() => window.dispatchEvent(new Event(OPEN_EXPORT_WINDOW_EVENT))}>
        <Upload size={16} aria-hidden="true" />
        <span>{t("editor.export")}</span>
      </button>
    </div>
  );
}
