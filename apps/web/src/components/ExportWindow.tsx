"use client";

import { FolderOpen, Info, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { installedSlicers, readBambuFormat, readExportTarget, SLICERS, slicerName, storeBambuFormat, storeExportTarget, type BambuSendFormat, type ExportTarget, type SlicerId } from "@/lib/bambuSend";
import { chooseFilesFolder, friendlyFolder, getFileSettings, type FileSettings } from "@/lib/pareFiles";
import { checkBeforeSending } from "@/components/PrintCheckPanel";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export type ExportChoice = { target: ExportTarget; format: BambuSendFormat; name: string; checkFirst: boolean };

/**
 * Build 71: the blue Export button's window - where the file opens (a slicer, or nowhere), its
 * type, its name and folder, then Export. Prefilled from the defaults, so it is two clicks.
 */
export function ExportWindow({ projectName, shapeCount, selectionLeavesOut, onSelectAll, onExport, onMoreFormats, onClose }: {
  projectName: string;
  shapeCount: number;
  /** Something is selected and visible parts are left out: only the selection is exported. */
  selectionLeavesOut: { selected: number; total: number } | null;
  onSelectAll: () => void;
  onExport: (choice: ExportChoice) => void;
  onMoreFormats: () => void;
  onClose: () => void;
}) {
  useLanguage();
  const [target, setTarget] = useState<ExportTarget>(() => readExportTarget());
  const [format, setFormat] = useState<BambuSendFormat>(() => readBambuFormat());
  const [makeDefault, setMakeDefault] = useState(false);
  const [name, setName] = useState(projectName);
  const [checkFirst, setCheckFirst] = useState(() => checkBeforeSending());
  // null: still asking; "browser": no app server (a web browser), so no slicer and no folder.
  const [installed, setInstalled] = useState<SlicerId[] | "browser" | null>(null);
  const [files, setFiles] = useState<FileSettings | null | undefined>(undefined);
  const exportRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    void installedSlicers().then((found) => setInstalled(found ?? "browser"));
    void getFileSettings(true).then(setFiles);
    exportRef.current?.focus();
  }, []);
  const inBrowser = installed === "browser";
  // A slicer that is not on this computer cannot be the target; nor any in a web browser.
  const available = (id: SlicerId) => installed !== "browser" && (installed === null || installed.includes(id));
  const chosen: ExportTarget = target !== "none" && installed !== null && !available(target) ? "none" : target;
  const run = () => {
    if (!shapeCount) return;
    storeBambuFormat(format);
    if (makeDefault) storeExportTarget(chosen);
    try {
      window.localStorage.setItem("pare3d.checkBeforeSend", checkFirst ? "on" : "off");
    } catch {
      // Holds for this export.
    }
    onExport({ target: chosen, format, name: name.trim() || projectName, checkFirst });
  };
  // The window has the keys while it is open: Escape closes it, Enter exports, and none of the
  // editor's shortcuts (Delete, arrows, letters) reach the design behind it.
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      const key = event.key.toLowerCase();
      if (event.key === "Escape" || ((event.ctrlKey || event.metaKey) && key === "e")) {
        event.preventDefault();
        onClose();
      } else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        runRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const changeFolder = async () => {
    await chooseFilesFolder("exports", t("files.chooseExports"));
    setFiles(await getFileSettings(true));
  };
  const folderText = files === undefined
    ? "…"
    : files === null
      ? t("exportWindow.browserFolder")
      : files.ask
        ? t("files.askEachTimeShort")
        : friendlyFolder(files.exports, files.home);
  const slicerRow = (id: SlicerId) => (
    <label key={id} className={`export-window-option ${chosen === id ? "active" : ""} ${available(id) ? "" : "unavailable"}`}>
      <input type="radio" name="export-target" checked={chosen === id} disabled={!available(id)} onChange={() => setTarget(id)} />
      <span>{slicerName(id)}</span>
      {installed !== null && installed !== "browser" && !available(id) ? <em>{t("slicer.notFound")}</em> : null}
    </label>
  );
  const button = chosen === "none" ? t("exportWindow.export") : t("exportWindow.exportAndOpen", { app: slicerName(chosen) });
  return (
    <div className="print-check-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="print-check export-window" role="dialog" aria-modal="true" aria-label={t("exportWindow.title")}>
        <header>
          <Upload className="ok export-window-icon" size={22} aria-hidden="true" />
          <div>
            <strong>{t("exportWindow.title")}</strong>
            <span>{shapeCount ? t("exportWindow.subtitle", { count: shapeCount }) : t("exportWindow.empty")}</span>
          </div>
          <button type="button" className="print-check-close" aria-label={t("printCheck.close")} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {selectionLeavesOut ? (
          <div className="export-holes-only-warning export-selection-note export-window-scope" role="status">
            <Info size={16} aria-hidden="true" />
            <span>
              {selectionLeavesOut.selected === 1
                ? t("export.selectionOnlyOne", { total: selectionLeavesOut.total })
                : t("export.selectionOnlyMany", { count: selectionLeavesOut.selected, total: selectionLeavesOut.total })}
            </span>
            <button type="button" className="export-select-all-button" onClick={onSelectAll}>{t("export.selectAll")}</button>
          </div>
        ) : null}
        <fieldset className="export-window-section">
          <legend>{t("exportWindow.openIn")}</legend>
          <div className="export-window-first">
            <label className={`export-window-option ${chosen === "none" ? "active" : ""}`}>
              <input type="radio" name="export-target" checked={chosen === "none"} onChange={() => setTarget("none")} />
              <span>{t("exportWindow.justSave")}</span>
            </label>
            <label className="export-window-default">
              <input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.currentTarget.checked)} />
              <span>{t("exportWindow.makeDefault")}</span>
            </label>
          </div>
          <div className="export-window-slicers">
            {(["fdm", "resin"] as const).map((kind) => (
              <div key={kind} className="export-window-kind" role="group" aria-label={t(`slicer.${kind}`)}>
                <span className="export-window-kind-label">{t(`slicer.${kind}`)}</span>
                {SLICERS.filter((entry) => entry.kind === kind).map((entry) => slicerRow(entry.id))}
              </div>
            ))}
          </div>
          {inBrowser ? <p className="export-window-note">{t("exportWindow.browserSlicer")}</p> : null}
        </fieldset>

        <fieldset className="export-window-section">
          <legend>{t("exportWindow.fileType")}</legend>
          <div className="export-window-formats">
            {(["3mf", "stl"] as const).map((value) => (
              <label key={value} className={`export-window-option ${format === value ? "active" : ""}`}>
                <input type="radio" name="export-format" checked={format === value} onChange={() => setFormat(value)} />
                <span><strong>{value.toUpperCase()}</strong><small>{t(`exportWindow.${value}Hint`)}</small></span>
              </label>
            ))}
          </div>
          <button type="button" className="export-window-more" onClick={onMoreFormats}>{t("exportWindow.moreFormats")}</button>
        </fieldset>

        <fieldset className="export-window-section">
          <legend>{t("exportWindow.saveTo")}</legend>
          <label className="export-window-name">
            <span>{t("export.fileName")}</span>
            <input type="text" value={name} maxLength={120} onChange={(event) => setName(event.currentTarget.value)} />
            <em>.{format}</em>
          </label>
          <div className="export-window-folder">
            <FolderOpen size={16} aria-hidden="true" />
            <span title={files ? files.exports : undefined}>{folderText}</span>
            {files ? <button type="button" onClick={() => void changeFolder()}>{t("files.change")}</button> : null}
          </div>
        </fieldset>

        <label className="export-window-default export-window-check">
          <input type="checkbox" checked={checkFirst} onChange={(event) => setCheckFirst(event.currentTarget.checked)} />
          <span>{t("exportWindow.checkFirst")}</span>
        </label>

        <footer>
          <button type="button" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="primary" ref={exportRef} disabled={!shapeCount} onClick={run}>
            <Upload size={16} aria-hidden="true" /> {button}
          </button>
        </footer>
      </section>
    </div>
  );
}
