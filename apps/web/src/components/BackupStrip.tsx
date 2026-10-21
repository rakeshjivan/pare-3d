"use client";

import { Archive, ArchiveRestore, FolderOpen, ShieldCheck } from "lucide-react";
import { useSyncExternalStore } from "react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import {
  chooseAutoBackupFolder,
  getAutoBackupStatus,
  refreshAutoBackupFolder,
  resumeAutoBackup,
  subscribeAutoBackup,
  turnOffAutoBackup,
} from "@/lib/autoBackup";
import { chooseFilesFolder, showFilesFolder } from "@/lib/pareFiles";
import { useFileSettings } from "@/components/FilesSettings";
import { GuideHelpLink } from "@/components/GuideHelpLink";

const SERVER_STATUS = { state: "off" } as const;

/**
 * Fork (build 22): the home screen's backup line - one quiet row instead of a big box. It says
 * where backups go and when the last one was made, with the few things to do about it.
 */
export function BackupStrip({ hasDesigns, onBackupAll, onRestore }: { hasDesigns: boolean; onBackupAll: () => void; onRestore: () => void }) {
  useLanguage();
  const status = useSyncExternalStore(subscribeAutoBackup, getAutoBackupStatus, () => SERVER_STATUS);
  const files = useFileSettings();
  const time = status.state === "on" && status.lastBackup
    ? new Date(status.lastBackup).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  const text = status.state === "on"
    ? (status.error
      ? t("backupStrip.failed", { folder: status.folder })
      : time ? t("backupStrip.onAt", { folder: status.folder, time }) : t("backupStrip.on", { folder: status.folder }))
    : status.state === "paused"
      ? t("backupStrip.paused", { folder: status.folder })
      : status.state === "unsupported"
        ? t("backupStrip.unsupported")
        : t("backupStrip.off");
  return (
    <aside className={`backup-strip ${status.state === "on" && !status.error ? "on" : "attention"}`} aria-label={t("storageNotice.title")}>
      <ShieldCheck size={16} strokeWidth={2.4} aria-hidden="true" />
      <span className="backup-strip-text" title={status.state === "on" && status.error ? status.error : undefined}>{text}</span>
      <GuideHelpLink chapter="files" section="backingUp" className="backup-strip-help" iconSize={14} />
      <div className="backup-strip-actions">
        {status.state === "off" && status.server !== undefined ? (
          <button type="button" onClick={() => void chooseAutoBackupFolder().catch(() => undefined)}>{t("backupStrip.turnOn")}</button>
        ) : null}
        {status.state === "off" && status.server === undefined ? (
          <button type="button" onClick={() => void chooseAutoBackupFolder().catch(() => undefined)}>{t("backupStrip.chooseFolder")}</button>
        ) : null}
        {status.state === "paused" ? <button type="button" onClick={() => void resumeAutoBackup()}>{t("backupStrip.resume")}</button> : null}
        {hasDesigns ? (
          <button type="button" title={t("dashboard.backupAllTitle")} onClick={onBackupAll}>
            <Archive size={14} aria-hidden="true" />{t("backupStrip.backUpNow")}
          </button>
        ) : null}
        <button type="button" title={t("dashboard.restoreBackupTitle")} onClick={onRestore}>
          <ArchiveRestore size={14} aria-hidden="true" />{t("backupStrip.restore")}
        </button>
        {files && status.state === "on" ? (
          <>
            <button type="button" title={t("files.chooseBackups")} onClick={() => void chooseFilesFolder("backups", t("files.chooseBackups")).then(() => refreshAutoBackupFolder())}>
              <FolderOpen size={14} aria-hidden="true" />{t("backupStrip.changeFolder")}
            </button>
            <button type="button" className="quiet" onClick={() => showFilesFolder("backups")}>{t("files.show")}</button>
          </>
        ) : null}
        {status.state === "on" || status.state === "paused" ? (
          <button type="button" className="quiet" onClick={() => void turnOffAutoBackup()}>{t("backupStrip.turnOff")}</button>
        ) : null}
      </div>
    </aside>
  );
}
