"use client";

/*
 * Build 104: the head of a studio's own page (CAD Studio or Dental Studio) and, for Dental Studio,
 * the place to start a case: drop the scans, and Pare 3D sorts upper, lower and bite itself.
 */
import { Plus, Upload } from "lucide-react";
import { useState, type DragEvent, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { PareStudio } from "@/lib/pareStudio";

export function StudioHeader({
  studio,
  onHome,
  onNew,
  onImport,
  extra,
}: {
  studio: PareStudio;
  onHome: () => void;
  onNew: () => void;
  onImport: () => void;
  extra?: ReactNode;
}) {
  useLanguage();
  const cad = studio === "cad";
  return (
    <div className={`studio-head ${studio}`}>
      <div className="studio-head-inner">
        <div className="studio-head-text">
          <nav className="studio-crumbs" aria-label={t("home.breadcrumb")}>
            <button type="button" onClick={onHome}>{t("home.tabHome")}</button>
            <span aria-hidden="true">/</span>
            <span>{cad ? t("home.cadStudio") : t("home.dentalStudio")}</span>
          </nav>
          <h1><span className={`home-studio-mark ${studio}`} aria-hidden="true" />{cad ? t("home.cadStudio") : t("home.dentalStudio")}</h1>
          <p>{cad ? t("home.cadPageSummary") : t("home.dentalPageSummary")}</p>
          {extra}
        </div>
        {/* Build 104: Dental Studio starts its cases from the workflow cards below, so its head has no buttons. */}
        {cad ? (
          <div className="studio-head-actions">
            <button type="button" className="home-secondary" onClick={onImport}>
              <Upload size={16} strokeWidth={2.2} aria-hidden="true" />
              {t("home.importCad")}
            </button>
            <button type="button" className="home-primary cad" onClick={onNew}>
              <Plus size={17} strokeWidth={2.4} aria-hidden="true" />
              {t("home.newDesign")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Dental Studio's start: a drop zone for the scans beside the list of what the studio can do. */
/**
 * Build 104: Dental Studio's page offers its two workflows side by side, as Home offers the studios -
 * Model Builder and Digital Wax-Up. Each starts a new case open in that workflow; scans dropped on a
 * card (or opened from it) start the case with them.
 */
export function DentalStart({ onStart, onScans, waxupShown }: { onStart: (tool: "model" | "wax") => void; onScans: (files: File[], tool: "model" | "wax") => void; waxupShown: boolean }) {
  useLanguage();
  const [over, setOver] = useState<"model" | "wax" | null>(null);
  const card = (tool: "model" | "wax") => {
    const wax = tool === "wax";
    const chips = wax
      ? [t("dentalStart.waxChip1"), t("dentalStart.waxChip2"), t("dentalStart.waxChip3"), t("dentalStart.waxChip4")]
      : [t("dentalStart.modelChip1"), t("dentalStart.modelChip2"), t("dentalStart.modelChip3"), t("dentalStart.modelChip4")];
    const inputId = `dental-start-files-${tool}`;
    return (
      <section
        key={tool}
        className={`home-studio-card dental dental-workflow ${tool}${over === tool ? " over" : ""}`}
        aria-labelledby={`dental-workflow-${tool}`}
        onDragOver={(event: DragEvent) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setOver(tool);
        }}
        onDragLeave={(event: DragEvent) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
        }}
        onDrop={(event: DragEvent) => {
          event.preventDefault();
          setOver(null);
          const files = Array.from(event.dataTransfer.files ?? []);
          if (files.length) onScans(files, tool);
        }}
      >
        <div className="home-studio-stage">
          <img src={wax ? "/assets/home/dental-hero.webp" : "/assets/home/model-builder-hero.webp"} alt="" draggable={false} />
          <span className="home-studio-kicker"><span className="home-studio-dot dental" aria-hidden="true" />{t("dentalStart.workflow")}</span>
          {over === tool ? <span className="dental-workflow-drop">{t("dentalStart.dropHere")}</span> : null}
        </div>
        <div className="home-studio-body">
          <div className="home-studio-text">
            <h2 id={`dental-workflow-${tool}`}>
              {wax ? t("dentalStart.waxTitle") : t("dentalStart.modelTitle")}
              {wax ? <em className="test-pill">{t("home.testBuild")}</em> : null}
            </h2>
            <p>{wax ? t("dentalStart.waxSummary") : t("dentalStart.modelSummary")}</p>
          </div>
          <ul className="home-chips" aria-label={t("home.includes")}>
            {chips.map((chip) => <li key={chip}>{chip}</li>)}
          </ul>
          <div className="home-studio-actions">
            <button type="button" className="home-primary dental" onClick={() => onStart(tool)}>
              <Plus size={17} strokeWidth={2.4} aria-hidden="true" />
              {t("home.newCase")}
            </button>
            <label className="home-secondary" htmlFor={inputId}>
              <Upload size={16} strokeWidth={2.2} aria-hidden="true" />
              {t("dentalStart.openScans")}
            </label>
            <input
              id={inputId}
              type="file"
              multiple
              accept=".stl,.ply,.obj,.3mf"
              hidden
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                if (files.length) onScans(files, tool);
              }}
            />
          </div>
        </div>
      </section>
    );
  };
  return (
    <div className={`dental-workflows${waxupShown ? "" : " single"}`}>
      {card("model")}
      {waxupShown ? card("wax") : null}
    </div>
  );
}
