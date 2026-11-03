"use client";

/*
 * Build 106: the studio frame - Wax-up Studio and Model Builder laid out as one calm screen: the steps
 * along the top, the case (its scans and the wax, and the tooth chart) on the left, the open step's tools
 * on the right (the studio's own panel, docked there), the 3D view between them with a line of guidance
 * and a bar of views and checks, and Undo, Back and Next along the bottom. It is only the frame: the
 * panel fills the step bar, Back and Next and the guidance through slots (lib/studioSlots), and every
 * control here calls the same action the studio already has.
 */
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, EyeOff, Home, Moon, Redo2, Undo2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { setStudioSlot } from "@/lib/studioSlots";
import { STUDIO_CHART, type ChartArch } from "@/lib/studioChart";
import type { DentalView } from "./DentalStudioPanel";

export type StudioCaseObject = {
  id: string;
  name: string;
  shown: boolean;
  onToggle: () => void;
  /** 0-1; a slider only where the studio can draw it see-through. */
  opacity?: number;
  onOpacity?: (value: number) => void;
};

export type StudioChart = {
  arch: ChartArch;
  arches: ChartArch[];
  onArch: (arch: ChartArch) => void;
  /** The teeth in the wax-up, each with its colour on the chart. */
  colours: Record<number, string>;
  selected: number | null;
  onPick: (fdi: number) => void;
  /** The teeth that can be clicked (the rest are shown only). */
  pickable: (fdi: number) => boolean;
};

// Stable callbacks: a new function each render would set each slot to null and back every time.
const stepsSlot = (element: HTMLElement | null) => setStudioSlot("steps", element);
const hintSlot = (element: HTMLElement | null) => setStudioSlot("hint", element);
const navSlot = (element: HTMLElement | null) => setStudioSlot("nav", element);
const caseSlot = (element: HTMLElement | null) => setStudioSlot("case", element);

const VIEWS: Array<{ view: DentalView; label: string; icon: string }> = [
  { view: "front", label: "studio.viewFront", icon: "M7 4h10v9a5 5 0 0 1-10 0z" },
  { view: "occlusal", label: "studio.viewOcclusal", icon: "M4 18c0-8 4-13 8-13s8 5 8 13" },
  { view: "left", label: "studio.viewLeft", icon: "M15 5l-7 7 7 7" },
  { view: "right", label: "studio.viewRight", icon: "M9 5l7 7-7 7" },
];

export function StudioShell({
  title,
  caseTitle,
  objects,
  colour,
  dark,
  layoutView,
  chart,
  onView,
  contacts,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClose,
  onHome,
  sideTabs = false,
  contactsPanel = false,
  helpSection,
}: {
  title: string;
  caseTitle?: string;
  objects: StudioCaseObject[];
  colour?: { on: boolean; onChange: (on: boolean) => void } | null;
  /** The 3D view's dark ground (the panels stay light). */
  dark?: { on: boolean; onChange: (on: boolean) => void } | null;
  /** Build 106: the made models laid out to print, or in the bite. */
  layoutView?: { occlusion: boolean; onChange: (occlusion: boolean) => void } | null;
  chart?: StudioChart | null;
  onView?: (view: DentalView) => void;
  /** legend false: the studio shows its own key (the bite map's, in the case panel). */
  contacts?: { on: boolean; busy?: boolean; onToggle: () => void; legend?: boolean } | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClose: () => void;
  /** Back to Dental Studio's home page; the close button's way out when not given. */
  onHome?: () => void;
  /** Build 108: Wax-up Studio's tabs that put each side window away (Model Builder is left as it is). */
  sideTabs?: boolean;
  /** Build 108: Wax-up's Position - the bite contacts as a panel on the left (in place of the teeth chart), off until switched on there. */
  contactsPanel?: boolean;
  helpSection?: Parameters<typeof GuideHelpLink>[0]["section"];
}) {
  useLanguage();
  const [caseOpen, setCaseOpen] = useState(true);
  const [view, setView] = useState<DentalView | null>(null);
  // Build 108: each side window can be put away for room to work - a small tab in the middle of its inner edge
  // (pointing the way it goes); the tab stays at the edge to bring it back. Build 108: for this session only - every
  // new wax-up starts with both windows out, so no step's controls are hidden from the start.
  const [sides, setSides] = useState({ left: false, right: false });
  useEffect(() => {
    try { window.localStorage.removeItem("pare.studioLeftHidden"); window.localStorage.removeItem("pare.studioRightHidden"); } catch { /* nothing kept */ }
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (!sideTabs) { root.classList.remove("studio-left-hidden", "studio-right-hidden"); return; }
    root.classList.toggle("studio-left-hidden", sides.left);
    root.classList.toggle("studio-right-hidden", sides.right);
    // The 3D view takes the room: its canvas follows the window's size.
    window.dispatchEvent(new Event("resize"));
    return () => { root.classList.remove("studio-left-hidden", "studio-right-hidden"); };
  }, [sides, sideTabs]);
  const sideTab = (side: "left" | "right") => {
    const hidden = sides[side];
    const label = t(hidden ? (side === "left" ? "studio.showCase" : "studio.showPanel") : side === "left" ? "studio.hideCase" : "studio.hidePanel");
    const pointsLeft = side === "left" ? !hidden : hidden;
    return (
      <button type="button" className={`studio-side-tab ${side}${hidden ? " hidden" : ""}`} aria-label={label} title={label} aria-expanded={!hidden} onClick={() => setSides((now) => ({ ...now, [side]: !now[side] }))}>
        {pointsLeft ? <ChevronLeft size={14} strokeWidth={2.2} aria-hidden="true" /> : <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />}
      </button>
    );
  };
  return (
    <>
      {sideTabs ? sideTab("left") : null}
      {sideTabs ? sideTab("right") : null}
      <header className="studio-top">
        <div className="studio-brand">
          <b>Pare<span>3D</span></b>
          <i aria-hidden="true" />
          {/* Build 107: one click back to Dental Studio's home page, on every step. */}
          <button type="button" className="studio-icon studio-home" onClick={onHome ?? onClose} aria-label={t("studio.home")} title={t("studio.home")}>
            <Home size={19} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <em>{title}</em>
        </div>
        <nav className="studio-steps" aria-label={t("studio.steps")} ref={stepsSlot} />
        <div className="studio-top-icons">
          {dark ? (
            <div className="studio-dark-toggle" title={t("studio.darkViewHint")}>
              <Moon size={17} strokeWidth={1.8} aria-hidden="true" />
              <span id="studio-dark-label">{t("studio.darkView")}</span>
              <button type="button" role="switch" aria-checked={dark.on} aria-labelledby="studio-dark-label" className={`studio-switch${dark.on ? " on" : ""}`} onClick={() => dark.onChange(!dark.on)}><i /></button>
            </div>
          ) : null}
          <GuideHelpLink section={helpSection} className="studio-icon" iconSize={20} strokeWidth={1.8} />
          <button type="button" className="studio-icon" onClick={onClose} aria-label={t("studio.close")} title={t("studio.close")}><X size={20} strokeWidth={1.8} /></button>
        </div>
      </header>

      <aside className="studio-left" aria-label={t("studio.case")}>
        <button type="button" className="studio-sec studio-sec-toggle" aria-expanded={caseOpen} onClick={() => setCaseOpen((open) => !open)}>
          {caseTitle ?? t("studio.caseObjects")} {caseOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
        {caseOpen ? (
          <div className="studio-objects">
            {objects.map((object) => (
              <div className="studio-object" key={object.id}>
                <div className="studio-object-row">
                  <button type="button" className={`studio-eye${object.shown ? "" : " off"}`} aria-pressed={object.shown} aria-label={t(object.shown ? "studio.hide" : "studio.show", { name: object.name })} title={t(object.shown ? "studio.hide" : "studio.show", { name: object.name })} onClick={object.onToggle}>
                    {object.shown ? <Eye size={19} aria-hidden="true" /> : <EyeOff size={19} aria-hidden="true" />}
                  </button>
                  <span>{object.name}</span>
                </div>
                {object.onOpacity ? (
                  <label className="studio-slide">
                    <span>{t("studio.opacity")}</span>
                    <input type="range" min={10} max={100} step={1} value={Math.round((object.opacity ?? 1) * 100)} onChange={(event) => object.onOpacity?.(Number(event.currentTarget.value) / 100)} />
                    <span>{`${Math.round((object.opacity ?? 1) * 100)}%`}</span>
                  </label>
                ) : null}
              </div>
            ))}
            {objects.length === 0 ? <p className="studio-muted">{t("studio.noObjects")}</p> : null}
            {colour ? (
              <div className="studio-toggle">
                <span id="studio-colour-label">{t("studio.colour")}</span>
                <button type="button" role="switch" aria-checked={colour.on} aria-labelledby="studio-colour-label" className={`studio-switch${colour.on ? " on" : ""}`} onClick={() => colour.onChange(!colour.on)}><i /></button>
              </div>
            ) : null}
          </div>
        ) : null}
        {/* Build 106: the bite contacts & clearance, when on, under the objects. */}
        <div className="studio-case-extra" ref={caseSlot} />
        {contactsPanel && contacts ? (
          <div className="studio-contacts-panel">
            <p className="studio-sec">{t("studio.biteContacts")}</p>
            <div className="studio-toggle">
              <span id="studio-contacts-label">{t("studio.showContacts")}</span>
              <button type="button" role="switch" aria-checked={contacts.on} aria-labelledby="studio-contacts-label" disabled={contacts.busy} className={`studio-switch${contacts.on ? " on" : ""}`} onClick={contacts.onToggle}><i /></button>
            </div>
            {contacts.on ? (
              <div className="studio-contacts-key" role="img" aria-label={t("studio.contactsKey")}>
                <div className="studio-cbar" />
                <div className="studio-cticks"><span>{t("studio.contactsInto")}</span><span>{t("studio.contactsTouch")}</span><span>{t("studio.contactsClear")}</span></div>
              </div>
            ) : <p className="studio-muted">{t("studio.contactsOffHint")}</p>}
          </div>
        ) : chart ? <ToothChart chart={chart} /> : null}
      </aside>

      <div className="studio-hint" role="status" ref={hintSlot} />

      {onView || contacts || layoutView ? (
        <div className="studio-viewbar" role="toolbar" aria-label={t("studio.viewChecks")}>
          {layoutView ? (<>
            <div className="studio-layout-toggle" role="radiogroup" aria-label={t("studio.printView")}>
              <button type="button" role="radio" aria-checked={!layoutView.occlusion} className={!layoutView.occlusion ? "on" : ""} onClick={() => layoutView.onChange(false)}>{t("studio.printView")}</button>
              <button type="button" role="radio" aria-checked={layoutView.occlusion} className={layoutView.occlusion ? "on" : ""} onClick={() => layoutView.onChange(true)}>{t("studio.occlusionView")}</button>
            </div>
            <span className="studio-vsep" aria-hidden="true" />
          </>) : null}
          {onView ? VIEWS.map((entry) => (
            <button key={entry.view} type="button" className={`studio-vb${view === entry.view ? " on" : ""}`} aria-label={t(entry.label as "studio.viewFront")} title={t(entry.label as "studio.viewFront")} onClick={() => { setView(entry.view); onView(entry.view); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={entry.icon} /></svg>
            </button>
          )) : null}
          {onView && contacts && !contactsPanel ? <span className="studio-vsep" aria-hidden="true" /> : null}
          {contacts && !contactsPanel ? (
            <button type="button" className={`studio-vb wide${contacts.on ? " on" : ""}`} aria-pressed={contacts.on} disabled={contacts.busy} onClick={contacts.onToggle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="9" cy="12" r="6" /><circle cx="15" cy="12" r="6" /></svg>
              {t("studio.contacts")}
            </button>
          ) : null}
        </div>
      ) : null}
      {contacts?.on && contacts.legend !== false && !contactsPanel ? (
        <div className="studio-clegend" role="img" aria-label={t("studio.contactsKey")}>
          <b>{t("studio.contacts")}</b>
          <div className="studio-cbar" />
          <div className="studio-cticks"><span>{t("studio.contactsInto")}</span><span>{t("studio.contactsTouch")}</span><span>{t("studio.contactsClear")}</span></div>
        </div>
      ) : null}

      <footer className="studio-bottom">
        <div className="studio-undo">
          <button type="button" className="studio-ub" disabled={!canUndo} onClick={onUndo}><Undo2 size={19} strokeWidth={1.8} aria-hidden="true" /> {t("studio.undo")}</button>
          <button type="button" className="studio-ub" disabled={!canRedo} onClick={onRedo}><Redo2 size={19} strokeWidth={1.8} aria-hidden="true" /> {t("studio.redo")}</button>
        </div>
        <div className="studio-nav" ref={navSlot} />
      </footer>
    </>
  );
}

function ToothChart({ chart }: { chart: StudioChart }): ReactNode {
  // Build 108: with both arches, both charts at once - the upper, and below it the lower turned over, as an open
  // mouth (the two arches facing each other, the patient's right on the left on both); a tooth on either picks it.
  const arches = chart.arches.length > 1 ? chart.arches : [chart.arch];
  return (
    <div className="studio-chart-wrap">
      <p className="studio-sec">{t("studio.teeth")}</p>
      {arches.map((arch) => {
        const data = STUDIO_CHART[arch];
        const cx = data.w / 2, cy = data.h * 0.62;
        const flip = arch === "lower" && arches.length > 1;
        const y = (v: number) => (flip ? data.h - v : v);
        return (
          <div key={arch} className={`studio-chart${arches.length > 1 && chart.arch === arch ? " active" : ""}`}>
            <svg viewBox={`-46 -30 ${data.w + 92} ${data.h + 60}`} role="img" aria-label={t(arch === "upper" ? "studio.chartUpper" : "studio.chartLower")}>
              <g transform={flip ? `translate(0 ${data.h}) scale(1 -1)` : undefined}>
                <image href={data.src} x={0} y={0} width={data.w} height={data.h} />
                {Object.entries(data.teeth).map(([key, tooth]) => {
                  const fdi = Number(key);
                  const fill = chart.colours[fdi];
                  const pick = chart.pickable(fdi);
                  return (
                    <g key={key}>
                      {fill ? <path d={tooth.d} fill={fill} opacity={0.72} style={{ mixBlendMode: "multiply" }} /> : null}
                      <path d={tooth.d} className={`studio-chart-tooth${chart.selected === fdi ? " selected" : ""}${pick ? " pickable" : ""}`} fill="transparent" onClick={pick ? () => chart.onPick(fdi) : undefined}>
                        <title>{t("studio.toothN", { fdi })}</title>
                      </path>
                    </g>
                  );
                })}
              </g>
              {Object.entries(data.teeth).map(([key, tooth]) => {
                const fdi = Number(key);
                const dx = tooth.c[0] - cx, dy = tooth.c[1] - cy, d = Math.hypot(dx, dy) || 1;
                const off = fdi % 10 >= 6 ? 66 : fdi % 10 >= 4 ? 58 : 50;
                // The numbers stay upright: placed where the turned-over tooth is.
                const ty = y(tooth.c[1] + (dy / d) * off) + 9;
                return <text key={key} x={tooth.c[0] + (dx / d) * off} y={ty} textAnchor="middle" className={`studio-chart-num${chart.selected === fdi ? " selected" : ""}`}>{fdi}</text>;
              })}
            </svg>
          </div>
        );
      })}
      <div className="studio-legend"><span><i style={{ background: Object.values(chart.colours)[0] ?? "#a8c3ea" }} />{t("studio.legendWax")}</span><span><i className="ring" />{t("studio.legendSelected")}</span></div>
    </div>
  );
}
