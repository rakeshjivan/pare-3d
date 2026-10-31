"use client";

/*
 * Build 104: the Home page - the two studios side by side, and the work most recently touched in
 * either of them below. Everything else the start page used to show in big boxes now lives in the
 * bar's menus (see HomeTopBar).
 */
import { ArrowRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
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
  useEffect(() => setHour(new Date().getHours()), []);
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
        <div className="home-studio-stage">
          <img
            src={cad ? "/assets/home/cad-hero.webp" : "/assets/home/dental-hero.webp"}
            alt={cad ? t("home.cadImageAlt") : t("home.dentalImageAlt")}
            draggable={false}
          />
          <span className="home-studio-kicker"><span className={`home-studio-dot ${studio}`} aria-hidden="true" />{t("home.studio")}</span>
        </div>
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
            <button type="button" className={`home-primary ${studio}`} onClick={() => onNew(studio)}>
              <Plus size={17} strokeWidth={2.4} aria-hidden="true" />
              {cad ? t("home.newDesign") : t("home.newCase")}
            </button>
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
        <p>{searching ? t("home.searchHint") : t("home.helloHint")}</p>
      </div>
      {notice}
      {searching ? null : (
        <div className="home-studios">
          {studioCard("cad")}
          {dentalAvailable ? studioCard("dental") : null}
        </div>
      )}
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
