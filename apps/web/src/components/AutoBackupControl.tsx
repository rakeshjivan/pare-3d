"use client";

import { FolderSync } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  chooseAutoBackupFolder,
  getAutoBackupStatus,
  resumeAutoBackup,
  subscribeAutoBackup,
  turnOffAutoBackup,
} from "@/lib/autoBackup";

const SERVER_STATUS = { state: "off" } as const;

/** Fork: the automatic-backup line under the storage notice. */
export function AutoBackupControl() {
  const status = useSyncExternalStore(subscribeAutoBackup, getAutoBackupStatus, () => SERVER_STATUS);
  const time = status.state === "on" && status.lastBackup
    ? new Date(status.lastBackup).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <div className="auto-backup-control">
      <FolderSync size={16} aria-hidden="true" />
      {status.state === "unsupported" ? (
        <span>Automatic backup needs Chrome or Edge. Use “Back up all” in this browser.</span>
      ) : status.state === "off" ? (
        <>
          <span>Automatic backup is off.</span>
          <button type="button" onClick={() => void chooseAutoBackupFolder().catch(() => undefined)}>Choose a backup folder…</button>
        </>
      ) : status.state === "paused" ? (
        <>
          <span>Automatic backup to “{status.folder}” is paused until you allow it again.</span>
          <button type="button" onClick={() => void resumeAutoBackup()}>Resume</button>
          <button type="button" className="quiet" onClick={() => void turnOffAutoBackup()}>Turn off</button>
        </>
      ) : (
        <>
          <span>
            Backing up to “{status.folder}” every 5 minutes while designs change
            {time ? ` · last backup ${time}` : ""}
            {status.error ? ` · last attempt failed: ${status.error}` : ""}
          </span>
          <button type="button" className="quiet" onClick={() => void chooseAutoBackupFolder().catch(() => undefined)}>Change folder</button>
          <button type="button" className="quiet" onClick={() => void turnOffAutoBackup()}>Turn off</button>
        </>
      )}
    </div>
  );
}
