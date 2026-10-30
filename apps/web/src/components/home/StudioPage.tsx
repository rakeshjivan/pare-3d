"use client";

/*
 * Build 104: the head of a studio's own page (CAD Studio or Dental Studio) and, for Dental Studio,
 * the place to start a case: drop the scans, and Pare 3D sorts upper, lower and bite itself.
 */
import { ArrowLeftRight, CircleDot, Layers, Plus, Upload } from "lucide-react";
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
        <div className="studio-head-actions">
          <button type="button" className="home-secondary" onClick={onImport}>
            <Upload size={16} strokeWidth={2.2} aria-hidden="true" />
            {cad ? t("home.importCad") : t("home.openCaseFile")}
          </button>
          <button type="button" className={`home-primary ${studio}`} onClick={onNew}>
            <Plus size={17} strokeWidth={2.4} aria-hidden="true" />
            {cad ? t("home.newDesign") : t("home.newCase")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Dental Studio's start: a drop zone for the scans beside the list of what the studio can do. */
export function DentalStart({ onScans, onPick, waxupShown }: { onScans: (files: File[]) => void; onPick: () => void; waxupShown: boolean }) {
  useLanguage();
  const [over, setOver] = useState(false);
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length) onScans(files);
  };
  const slots = [
    { title: t("home.slotUpper"), hint: t("home.slotUpperHint") },
    { title: t("home.slotLower"), hint: t("home.slotLowerHint") },
    { title: t("home.slotBite"), hint: t("home.slotBiteHint") },
  ];
  return (
    <div className="dental-start">
      <section
        className={`dental-drop${over ? " over" : ""}`}
        aria-labelledby="dental-drop-title"
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setOver(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={onDrop}
      >
        <div className="dental-drop-head">
          <h2 id="dental-drop-title">{t("home.startCase")}</h2>
          <p>{t("home.startCaseHint")}</p>
        </div>
        <div className="dental-drop-slots">
          {slots.map((slot) => (
            <button key={slot.title} type="button" className="dental-drop-slot" onClick={onPick}>
              <Upload size={26} strokeWidth={1.6} aria-hidden="true" />
              <strong>{slot.title}</strong>
              <span>{slot.hint}</span>
            </button>
          ))}
        </div>
        <p className="dental-drop-foot">
          {t("home.scanFormats")}
          <span aria-hidden="true"> · </span>
          <button type="button" onClick={onPick}>{t("home.browseFiles")}</button>
        </p>
      </section>
      <section className="dental-tools" aria-labelledby="dental-tools-title">
        <h2 id="dental-tools-title">{t("home.tools")}</h2>
        <ul>
          <li>
            <span className="dental-tool-icon" aria-hidden="true"><Layers size={20} strokeWidth={1.8} /></span>
            <span><strong>{t("home.toolModelBuilder")}</strong><span>{t("home.toolModelBuilderHint")}</span></span>
          </li>
          <li>
            <span className="dental-tool-icon" aria-hidden="true"><CircleDot size={20} strokeWidth={1.8} /></span>
            <span><strong>{t("home.toolBite")}</strong><span>{t("home.toolBiteHint")}</span></span>
          </li>
          <li>
            <span className="dental-tool-icon" aria-hidden="true"><ArrowLeftRight size={20} strokeWidth={1.8} /></span>
            <span><strong>{t("home.toolSendTo")}</strong><span>{t("home.toolSendToHint")}</span></span>
          </li>
          {waxupShown ? (
            <li>
              <span className="dental-tool-icon test" aria-hidden="true"><Plus size={20} strokeWidth={1.8} /></span>
              <span><strong>{t("home.toolWaxup")} <em className="test-pill">{t("home.testBuild")}</em></strong><span>{t("home.toolWaxupHint")}</span></span>
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
