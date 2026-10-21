"use client";

import { FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { refreshAutoBackupFolder } from "@/lib/autoBackup";
import {
  chooseFilesFolder,
  FILE_SETTINGS_EVENT,
  friendlyFolder,
  getFileSettings,
  resetFilesFolder,
  setAskWhereToSave,
  showFilesFolder,
  type FileSettings,
} from "@/lib/pareFiles";
import { OlderAppNotice } from "@/components/OlderAppNotice";

/** The current folder settings, kept fresh when they change anywhere in the app. */
export function useFileSettings() {
  const [settings, setSettings] = useState<FileSettings | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const load = (fresh: boolean) => void getFileSettings(fresh).then((value) => { if (live) setSettings(value); });
    load(false);
    const onChange = () => load(false);
    window.addEventListener(FILE_SETTINGS_EVENT, onChange);
    return () => {
      live = false;
      window.removeEventListener(FILE_SETTINGS_EVENT, onChange);
    };
  }, []);
  return settings;
}

/** Fork (build 22): Settings > Files - where exports and backups go, picked with the system's own picker. */
export function FilesSettings() {
  useLanguage();
  const settings = useFileSettings();
  if (settings === undefined) return null;
  if (!settings) {
    return (
      <div className="files-settings">
        <p className="files-settings-note">{t("files.browserNote")}</p>
        <OlderAppNotice />
      </div>
    );
  }
  const exportsDefault = settings.exports === settings.downloads;
  return (
    <div className="files-settings">
      <div className="files-row">
        <FolderOpen size={18} aria-hidden="true" />
        <div className="files-row-text">
          <strong>{t("files.exportsTitle")}</strong>
          <span title={settings.exports}>{settings.ask ? t("files.askEachTimeShort") : friendlyFolder(settings.exports, settings.home)}</span>
        </div>
        <div className="files-row-actions">
          <button type="button" onClick={() => void chooseFilesFolder("exports", t("files.chooseExports"))}>{t("files.change")}</button>
          <button type="button" className="quiet" onClick={() => showFilesFolder("exports")}>{t("files.show")}</button>
          {exportsDefault ? null : <button type="button" className="quiet" onClick={() => void resetFilesFolder("exports")}>{t("files.useDownloads")}</button>}
        </div>
      </div>
      <label className="files-ask">
        <input type="checkbox" checked={settings.ask} onChange={(event) => void setAskWhereToSave(event.currentTarget.checked)} />
        <span>{t("files.askEachTime")}</span>
      </label>
      <div className="files-row">
        <FolderOpen size={18} aria-hidden="true" />
        <div className="files-row-text">
          <strong>{t("files.backupsTitle")}</strong>
          <span title={settings.backups}>{friendlyFolder(settings.backups, settings.home)}</span>
        </div>
        <div className="files-row-actions">
          <button type="button" onClick={() => void chooseFilesFolder("backups", t("files.chooseBackups")).then(() => refreshAutoBackupFolder())}>{t("files.change")}</button>
          <button type="button" className="quiet" onClick={() => showFilesFolder("backups")}>{t("files.show")}</button>
        </div>
      </div>
      <p className="files-settings-note">{t("files.bambuNote")}</p>
    </div>
  );
}
