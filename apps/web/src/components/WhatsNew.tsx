"use client";

import { Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { PARE_BUILD } from "@/lib/pareUpdate";
import { WHATS_NEW, whatsNewSince } from "@/lib/pareWhatsNew";
import { openFeedback } from "@/lib/feedback";

const STORAGE_KEY = "pare3d.lastSeenBuild";
export const OPEN_WHATS_NEW_EVENT = "pare3d:whats-new";

/**
 * Fork (build 20): after an update, once, what the new build brought. A first visit shows
 * nothing (everything is new); the Help menu, and the start page's button (build 75), open it
 * again any time with every build to scroll through.
 */
export function WhatsNew() {
  const [entries, setEntries] = useState<typeof WHATS_NEW>([]);
  // Build 75: opened by hand (the Help menu, the start page's button) it holds every build, newest first, to scroll through.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (PARE_BUILD > 0) {
      try {
        const seen = Number(window.localStorage.getItem(STORAGE_KEY) || 0);
        if (seen > 0 && seen < PARE_BUILD) { setOpened(false); setEntries(whatsNewSince(seen, PARE_BUILD).slice(0, 3)); }
        window.localStorage.setItem(STORAGE_KEY, String(PARE_BUILD));
      } catch {
        // Not shown without storage.
      }
    }
    const open = () => { setOpened(true); setEntries(whatsNewSince(0, PARE_BUILD || 999)); };
    window.addEventListener(OPEN_WHATS_NEW_EVENT, open);
    return () => window.removeEventListener(OPEN_WHATS_NEW_EVENT, open);
  }, []);
  if (!entries.length) return null;
  return (
    <div className="print-check-backdrop" onPointerDown={(event) => event.target === event.currentTarget && setEntries([])}>
      <section className="print-check whats-new" role="dialog" aria-modal="true" aria-label={t("pareWhatsNew.title")}>
        <header>
          <Sparkles className="ok" size={22} aria-hidden="true" />
          <div>
            <strong>{t("pareWhatsNew.title")}</strong>
            <span>{t(opened ? "pareWhatsNew.subtitleOpened" : "pareWhatsNew.subtitle", { build: entries[0].build })}</span>
          </div>
          <button type="button" className="print-check-close" aria-label={t("printCheck.close")} onClick={() => setEntries([])}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="whats-new-builds">
          {entries.map((entry) => (
            <div className="whats-new-build" key={entry.build}>
              <h3>
                {t("version.build", { build: entry.build })}
                {entry.build === PARE_BUILD ? <span className="whats-new-current">{t("pareWhatsNew.thisBuild")}</span> : null}
              </h3>
              <ul>
                {entry.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <footer>
          {/* Fork (build 37): testers are a click away from saying what broke or what they would like. */}
          <button type="button" onClick={() => { setEntries([]); openFeedback({ kind: "suggestion" }); }}>{t("feedback.footer")}</button>
          <button type="button" className="primary" onClick={() => setEntries([])}>{t("pareWhatsNew.gotIt")}</button>
        </footer>
      </section>
    </div>
  );
}
