"use client";

import { Info, X } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { isOlderApp } from "@/lib/pareFiles";
import { RELEASES_PAGE } from "@/lib/pareUpdate";

const DISMISS_KEY = "pare3d.olderAppNoticeDismissed";

/**
 * Fork (build 22): inside a Pare 3D app installed before build 22. Its app files update by
 * themselves, but the app around them does not, so a few things (choosing folders) need it
 * downloaded again. A small line with the link; it can be put away for this visit.
 */
export function OlderAppNotice({ dismissible = false }: { dismissible?: boolean }) {
  useLanguage();
  const [older, setOlder] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return dismissible && window.sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let live = true;
    void isOlderApp().then((value) => { if (live) setOlder(value); });
    return () => { live = false; };
  }, []);
  if (!older || dismissed) return null;
  return (
    <div className="older-app-notice" role="status">
      <Info size={15} aria-hidden="true" />
      <span>{t("olderApp.message")}</span>
      <a href={RELEASES_PAGE} target="_blank" rel="noreferrer">{t("olderApp.download")}</a>
      {dismissible ? (
        <button
          type="button"
          aria-label={t("olderApp.hide")}
          title={t("olderApp.hide")}
          onClick={() => {
            setDismissed(true);
            try {
              window.sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {
              // Hidden for now.
            }
          }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
