"use client";

import { CheckCircle2, Download, LoaderCircle, RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { PARE_BUILD, RELEASES_PAGE, parseBuildTag } from "@/lib/pareUpdate";

/** Fork: the build number, for next to the tagline ("Build 12"; "dev" for a local build). */
export function PareBuildBadge({ className = "" }: { className?: string }) {
  useLanguage();
  return <span className={`pare-build-badge ${className}`} title={t("version.badgeTitle")}>{PARE_BUILD > 0 ? t("version.build", { build: PARE_BUILD }) : t("version.dev")}</span>;
}

type Status =
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "ready"; build: number }
  | { kind: "download"; build: number }
  | { kind: "offline" }
  | { kind: "dev" };

/**
 * Fork: the home screen's update line. In the app, its own server checks GitHub when it starts and
 * downloads a new build by itself; this shows what it found. In a plain browser it asks GitHub.
 */
export function PareVersionStatus() {
  useLanguage();
  const [status, setStatus] = useState<Status>(PARE_BUILD > 0 ? { kind: "checking" } : { kind: "dev" });
  useEffect(() => {
    if (PARE_BUILD <= 0) return;
    let stopped = false;
    let timer = 0;
    let polls = 0;
    const ask = async () => {
      polls += 1;
      let next: Status | null = null;
      let again = 0;
      try {
        const response = await fetch("/__pare3d/update", { cache: "no-store", signal: AbortSignal.timeout(4000) });
        if (response.ok && response.headers.get("x-pare3d") === "1") {
          const state = (await response.json()) as { serving?: number; ready?: number; needsReinstall?: number; checking?: boolean; error?: string };
          const newest = Math.max(Number(state.serving) || 0, Number(state.ready) || 0);
          if ((Number(state.needsReinstall) || 0) > PARE_BUILD) next = { kind: "download", build: Number(state.needsReinstall) };
          else if (newest > PARE_BUILD) next = { kind: "ready", build: newest };
          else if (state.checking || (!state.error && polls < 4)) {
            // The app checks a few seconds after it starts: keep asking until it has.
            next = { kind: "checking" };
            again = 3000;
          } else next = state.error ? { kind: "offline" } : { kind: "current" };
          if (!again) again = 5 * 60 * 1000;
        }
      } catch {
        next = null;
      }
      if (!next) {
        // Not the app (a plain browser): ask GitHub directly.
        try {
          const response = await fetch("https://api.github.com/repos/rakeshjivan/pare-3d/releases/latest", { headers: { accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(8000) });
          const build = response.ok ? parseBuildTag(((await response.json()) as { tag_name?: string }).tag_name) : null;
          next = build === null ? { kind: "offline" } : build > PARE_BUILD ? { kind: "download", build } : { kind: "current" };
        } catch {
          next = { kind: "offline" };
        }
        again = 0;
      }
      if (stopped) return;
      setStatus(next);
      if (again) timer = window.setTimeout(() => void ask(), again);
    };
    void ask();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (status.kind === "dev") return null;
  return (
    <div className={`pare-version-status ${status.kind}`} role="status">
      {status.kind === "checking" ? <><LoaderCircle size={15} className="spin" aria-hidden="true" />{t("version.checking")}</> : null}
      {status.kind === "current" ? <><CheckCircle2 size={15} aria-hidden="true" />{t("version.current", { build: PARE_BUILD })}</> : null}
      {status.kind === "offline" ? <><WifiOff size={15} aria-hidden="true" />{t("version.offline", { build: PARE_BUILD })}</> : null}
      {status.kind === "ready" ? (
        <>
          <RefreshCw size={15} aria-hidden="true" />
          {t("version.ready", { build: status.build })}
          <button type="button" onClick={() => window.location.reload()}>{t("version.reload")}</button>
        </>
      ) : null}
      {status.kind === "download" ? (
        <>
          <Download size={15} aria-hidden="true" />
          {t("version.download", { build: status.build })}
          <a href={RELEASES_PAGE} target="_blank" rel="noreferrer">{t("version.getIt")}</a>
        </>
      ) : null}
    </div>
  );
}
