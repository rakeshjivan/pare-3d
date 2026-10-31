"use client";

/*
 * Build 104: the Home page - the two studios side by side, and the work most recently touched in
 * either of them below. Everything else the start page used to show in big boxes now lives in the
 * bar's menus (see HomeTopBar).
 */
import { ArrowRight, Lightbulb, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages.en";
import { useLanguage } from "@/lib/useLanguage";
import type { PareStudio } from "@/lib/pareStudio";

export type LauncherProject = {
  id: string;
  name: string;
  updatedAt: number;
  studio: PareStudio;
  thumbnail: ReactNode;
  meta: string;
};

type Filter = "all" | PareStudio;

/** "Good morning" up to noon, "Good afternoon" to six, "Good evening" after - by the computer's clock. */
function greetingKey(hour: number) {
  if (hour < 12) return "home.greetingMorning" as const;
  if (hour < 18) return "home.greetingAfternoon" as const;
  return "home.greetingEvening" as const;
}

/**
 * Build 104: the days since the last visit, read once per page load (before this visit is written down),
 * so the Home page can say welcome back after a long break.
 */
const LAST_VISIT_KEY = "pare3d.lastVisit";
const AWAY_DAYS = 7;
let awayThisLoad: number | null | undefined;
function daysAway(): number | null {
  if (awayThisLoad !== undefined) return awayThisLoad;
  awayThisLoad = null;
  try {
    const last = Number(window.localStorage.getItem(LAST_VISIT_KEY));
    if (last > 0) {
      const days = Math.floor((Date.now() - last) / 86_400_000);
      if (days >= AWAY_DAYS) awayThisLoad = days;
    }
    window.localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
  } catch {
    // No memory of visits: no welcome back.
  }
  return awayThisLoad;
}

/** Build 104: a tip of the day on Home - one line, a new one each day, "Next tip" for another, and it can be hidden. */
const TIPS: Array<{ key: MessageKey; wax?: boolean }> = [
  { key: "tips.gimbalType" },
  { key: "tips.commandSearch" },
  { key: "tips.undoNames" },
  { key: "tips.dentalViews" },
  { key: "tips.waxKeys", wax: true },
  { key: "tips.dropOnWorkflow" },
  { key: "tips.ringSnap" },
  { key: "tips.drop" },
  { key: "tips.modifyMore" },
  { key: "tips.sendToCad" },
  { key: "tips.freeRotate" },
  { key: "tips.selectDelete" },
  { key: "tips.readyParts" },
  { key: "tips.holeSolid" },
  { key: "tips.studioPicture" },
];
const TIPS_HIDDEN_KEY = "pare3d.tipsHidden";

/** How many recent designs the Home page shows: two rows on a wide window. */
const RECENT_COUNT = 8;

export function HomeLauncher({
  projects,
  searching,
  waxupShown,
  dentalAvailable,
  onOpenProject,
  onNew,
  onOpenStudio,
  notice,
}: {
  /** Already sorted, newest first; when searching, the matches from both studios. */
  projects: LauncherProject[];
  searching: boolean;
  waxupShown: boolean;
  dentalAvailable: boolean;
  onOpenProject: (id: string) => void;
  onNew: (studio: PareStudio) => void;
  onOpenStudio: (studio: PareStudio) => void;
  notice?: ReactNode;
}) {
  useLanguage();
  const [filter, setFilter] = useState<Filter>("all");
  // The greeting follows the clock only once the page runs in the browser (the served HTML is the same for everyone).
  const [hour, setHour] = useState<number | null>(null);
  const [away, setAway] = useState<number | null>(null);
  const tips = useMemo(() => TIPS.filter((tip) => !tip.wax || waxupShown), [waxupShown]);
  const [tip, setTip] = useState<number | null>(null);
  const [tipsHidden, setTipsHidden] = useState(false);
  useEffect(() => {
    const now = new Date();
    setHour(now.getHours());
    setAway(daysAway());
    // The day's tip: the same all day, the next one tomorrow.
    const day = Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000);
    setTip(day % Math.max(1, tips.length));
    try { setTipsHidden(window.localStorage.getItem(TIPS_HIDDEN_KEY) === "1"); } catch { /* shown */ }
  }, [tips.length]);
  const hideTips = () => {
    setTipsHidden(true);
    try { window.localStorage.setItem(TIPS_HIDDEN_KEY, "1"); } catch { /* hidden for this visit */ }
  };
  const shown = useMemo(() => {
    const matching = filter === "all" ? projects : projects.filter((project) => project.studio === filter);
    return searching ? matching : matching.slice(0, RECENT_COUNT);
  }, [filter, projects, searching]);
  const counts = useMemo(() => ({
    cad: projects.filter((project) => project.studio === "cad").length,
    dental: projects.filter((project) => project.studio === "dental").length,
  }), [projects]);

  const studioCard = (studio: PareStudio) => {
    const cad = studio === "cad";
    const chips = cad
      ? [t("home.cadChip1"), t("home.cadChip2"), t("home.cadChip3"), t("home.cadChip4")]
      : [t("home.dentalChip1"), t("home.dentalChip2"), t("home.dentalChip3"), t("home.dentalChip4")];
    return (
      <section className={`home-studio-card ${studio}`} aria-labelledby={`home-${studio}-title`}>
        {/* Build 104: the picture opens the studio - where the hand goes first. */}
        <button type="button" className="home-studio-stage" aria-label={cad ? t("home.openCad") : t("home.openDental")} onClick={() => onOpenStudio(studio)}>
          <img
            src={cad ? "/assets/home/cad-hero.webp" : "/assets/home/dental-hero.webp"}
            alt={cad ? t("home.cadImageAlt") : t("home.dentalImageAlt")}
            draggable={false}
          />
          <span className="home-studio-kicker"><span className={`home-studio-dot ${studio}`} aria-hidden="true" />{t("home.studio")}</span>
        </button>
        <div className="home-studio-body">
          <div className="home-studio-text">
            <h2 id={`home-${studio}-title`}>{cad ? t("home.cadStudio") : t("home.dentalStudio")}</h2>
            <p>{cad ? t("home.cadSummary") : t("home.dentalSummary")}</p>
          </div>
          <ul className="home-chips" aria-label={t("home.includes")}>
            {chips.map((chip) => <li key={chip}>{chip}</li>)}
            {!cad && waxupShown ? <li className="test">{t("home.waxupTestChip")}</li> : null}
          </ul>
          <div className="home-studio-actions">
            {/* Build 104: Dental Studio starts its cases from its own page, where the workflow is chosen. */}
            {cad ? (
              <button type="button" className="home-primary cad" onClick={() => onNew(studio)}>
                <Plus size={17} strokeWidth={2.4} aria-hidden="true" />
                {t("home.newDesign")}
              </button>
            ) : null}
            <button type="button" className="home-secondary" onClick={() => onOpenStudio(studio)}>
              {cad ? t("home.openCad") : t("home.openDental")}
              <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="home-page">
      <div className="home-hello">
        <h1>{searching ? t("home.searchResults") : hour === null ? t("home.welcome") : t(greetingKey(hour))}</h1>
        <p>{searching ? t("home.searchHint") : away ? t("home.welcomeBack", { days: away }) : t("home.helloHint")}</p>
      </div>
      {notice}
      {searching ? null : (
        <div className="home-studios">
          {studioCard("cad")}
          {dentalAvailable ? studioCard("dental") : null}
        </div>
      )}
      {!searching && !tipsHidden && tip !== null && tips.length ? (
        <aside className="home-tip" aria-label={t("tips.label")}>
          <Lightbulb size={17} strokeWidth={2} aria-hidden="true" />
          <span><strong>{t("tips.label")}</strong> {t(tips[tip % tips.length].key)}</span>
          <span className="home-spacer" />
          <button type="button" className="home-tip-next" onClick={() => setTip((current) => ((current ?? 0) + 1) % tips.length)}>{t("tips.next")}</button>
          <button type="button" className="home-tip-hide" aria-label={t("tips.hide")} title={t("tips.hide")} onClick={hideTips}><X size={15} aria-hidden="true" /></button>
        </aside>
      ) : null}
      {/* Build 104: no Recent list on Home - designs and cases are in their studios; the grid shows search results only. */}
      {searching ? (
      <section className="home-recent" aria-labelledby="home-recent-title">
        <div className="home-section-head">
          <h2 id="home-recent-title">{searching ? t("home.matches") : t("home.recent")}</h2>
          <div className="home-spacer" />
          {dentalAvailable && (counts.cad > 0 && counts.dental > 0) ? (
            <div className="home-segmented" role="group" aria-label={t("home.show")}>
              {(["all", "cad", "dental"] as Filter[]).map((id) => (
                <button key={id} type="button" aria-pressed={filter === id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>
                  {id === "all" ? t("home.filterAll") : id === "cad" ? t("home.filterCad") : t("home.filterDental")}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {shown.length ? (
          <div className="home-recent-grid">
            {shown.map((project) => (
              <button key={project.id} type="button" className="home-recent-card" onClick={() => onOpenProject(project.id)}>
                <span className="home-recent-thumb">{project.thumbnail}</span>
                <span className="home-recent-text">
                  <strong translate="no">{project.name}</strong>
                  <span className="home-recent-meta">
                    <span className={`home-recent-tag ${project.studio}`}>
                      <span className={`home-studio-dot ${project.studio}`} aria-hidden="true" />
                      {project.studio === "cad" ? t("home.filterCad") : t("home.filterDental")}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{project.meta}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="home-empty">
            <strong>{searching ? t("home.noMatches") : t("home.nothingYet")}</strong>
            <span>{searching ? t("home.noMatchesHint") : t("home.nothingYetHint")}</span>
          </div>
        )}
      </section>
      ) : null}
    </div>
  );
}
