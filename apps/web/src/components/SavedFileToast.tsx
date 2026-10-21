"use client";

import { CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { FILE_SAVED_EVENT, friendlyFolder, getFileSettings, showFilesFolder, type SavedFile } from "@/lib/pareFiles";

/** Fork (build 22): after an export or backup is saved in the app, where it went - and a way to see it. */
export function SavedFileToast() {
  useLanguage();
  const [saved, setSaved] = useState<(SavedFile & { label: string }) | null>(null);
  useEffect(() => {
    let timer = 0;
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<SavedFile>).detail;
      void getFileSettings().then((settings) => {
        setSaved({ ...detail, label: friendlyFolder(detail.folder, settings?.home ?? "") });
        window.clearTimeout(timer);
        timer = window.setTimeout(() => setSaved(null), 7000);
      });
    };
    window.addEventListener(FILE_SAVED_EVENT, onSaved);
    return () => {
      window.removeEventListener(FILE_SAVED_EVENT, onSaved);
      window.clearTimeout(timer);
    };
  }, []);
  if (!saved) return null;
  return (
    <div className="saved-file-toast" role="status">
      <CheckCircle2 size={17} aria-hidden="true" />
      <span>{t("files.saved", { name: saved.name, folder: saved.label })}</span>
      <button type="button" onClick={() => showFilesFolder("exports", saved.path)}>{t("files.showInFolder")}</button>
      <button type="button" className="saved-file-close" aria-label={t("olderApp.hide")} onClick={() => setSaved(null)}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
