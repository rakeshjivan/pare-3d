"use client";

/**
 * Build 96: the bite contacts & clearance map's legend and summary (shared by Dental Studio and the
 * floating card), and the floating card itself - shown whenever two dental scans or models are
 * selected, or the studio has both arches, so the contacts are always one click away.
 */
import { LoaderCircle, X } from "lucide-react";
import { CONTACT_BANDS, type BiteContactStats } from "@/lib/biteContacts";
import { t } from "@/lib/i18n";

export type BiteMapView = { on: boolean; busy: boolean; upper?: BiteContactStats; lower?: BiteContactStats; error?: string } | null;

export function BiteContactsDetails({ biteMap }: { biteMap: NonNullable<BiteMapView> }) {
  const overlap = biteMap.upper && biteMap.lower ? Math.max(biteMap.upper.maxOverlap, biteMap.lower.maxOverlap) : 0;
  const contact = biteMap.upper && biteMap.lower ? (biteMap.upper.contactArea + biteMap.lower.contactArea) / 2 : 0;
  return (<>
    <ul className="dental-bite-legend" aria-label={t("dental.biteMapLegend")}>
      {CONTACT_BANDS.map((band) => (
        <li key={band.key}><span className="swatch" style={{ background: band.color }} aria-hidden="true" />{t(`dental.biteBand.${band.key}` as "dental.biteBand.close")}</li>
      ))}
    </ul>
    {biteMap.busy ? <p className="dental-status" role="status"><LoaderCircle className="edge-modifier-spinner" size={15} /> {t("dental.biteMapWorking")}</p> : null}
    {biteMap.error ? <p className="dental-status warn" role="status">{biteMap.error}</p> : null}
    {!biteMap.busy && biteMap.upper && biteMap.lower ? (
      <p className={`dental-status ${overlap > 0.1 ? "warn" : ""}`} role="status">{overlap > 0.005
        ? t("dental.biteMapOverlap", { overlap: overlap.toFixed(2), area: contact.toFixed(1) })
        : contact > 0 ? t("dental.biteMapClear", { area: contact.toFixed(1) }) : t("dental.biteMapApart")}</p>
    ) : null}
  </>);
}

/** The floating card: a button while off; the legend and summary while on. */
export function BiteContactsCard({ biteMap, onToggle, hint }: { biteMap: BiteMapView; onToggle: (on: boolean) => void; hint?: string | null }) {
  const on = Boolean(biteMap?.on);
  if (!on) {
    return (
      <div className="bite-contacts-card closed">
        <button type="button" className="bite-contacts-open" title={t("dental.biteMapHint")} onClick={() => onToggle(true)}>
          <span className="bite-contacts-dots" aria-hidden="true">{CONTACT_BANDS.slice(0, 4).map((band) => <i key={band.key} style={{ background: band.color }} />)}</span>
          {t("dental.biteMapShow")}
        </button>
        {hint ? <p className="blend-hint">{hint}</p> : null}
      </div>
    );
  }
  return (
    <div className="bite-contacts-card" role="region" aria-label={t("dental.biteMap")}>
      <div className="bite-contacts-head">
        <strong>{t("dental.biteMap")}</strong>
        <button type="button" className="icon-button" title={t("dental.biteMapHide")} aria-label={t("dental.biteMapHide")} onClick={() => onToggle(false)}><X size={14} /></button>
      </div>
      <BiteContactsDetails biteMap={biteMap!} />
    </div>
  );
}
