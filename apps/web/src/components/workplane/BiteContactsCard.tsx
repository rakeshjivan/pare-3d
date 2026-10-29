"use client";

/**
 * Build 96: the bite contacts & clearance map's scale and summary (shared by Dental Studio and the
 * floating card), and the floating card itself - shown whenever two dental scans or models are
 * selected, or the studio has both arches, so the contacts are always one click away.
 */
import { LoaderCircle, X } from "lucide-react";
import { CONTACT_TICKS, contactGradient, type BiteContactStats } from "@/lib/biteContacts";
import { t } from "@/lib/i18n";

export type BiteMapView = { on: boolean; busy: boolean; upper?: BiteContactStats; lower?: BiteContactStats; error?: string; contactOnly?: boolean } | null;

/** Build 96: the scale as the scanner programs show it - a bar from 2 mm (green) down to contact (red) and overlap (blue to purple). */
function ContactScale({ contactOnly }: { contactOnly: boolean }) {
  const top = 2, bottom = -0.2;
  return (
    <div className={`bite-scale${contactOnly ? " contact-only" : ""}`} aria-label={t("dental.biteMapLegend")}>
      <div className="bite-scale-bar" style={{ background: contactGradient(top, bottom) }} aria-hidden="true" />
      <ol className="bite-scale-ticks">
        {CONTACT_TICKS.map((tick) => (
          <li key={tick} style={{ top: `${((top - tick) / (top - bottom)) * 100}%` }}>{tick.toFixed(2)}</li>
        ))}
      </ol>
      <ul className="bite-scale-words">
        <li style={{ top: "0%" }}>{t("dental.biteScaleFar")}</li>
        <li style={{ top: `${(top / (top - bottom)) * 100}%` }}>{t("dental.biteScaleContact")}</li>
        <li style={{ top: "100%" }}>{t("dental.biteScaleOverlap")}</li>
      </ul>
    </div>
  );
}

export function BiteContactsDetails({ biteMap, onContactOnly }: { biteMap: NonNullable<BiteMapView>; onContactOnly?: (on: boolean) => void }) {
  const overlap = biteMap.upper && biteMap.lower ? Math.max(biteMap.upper.maxOverlap, biteMap.lower.maxOverlap) : 0;
  const contact = biteMap.upper && biteMap.lower ? (biteMap.upper.contactArea + biteMap.lower.contactArea) / 2 : 0;
  return (<>
    <ContactScale contactOnly={Boolean(biteMap.contactOnly)} />
    {onContactOnly ? (
      <label className="edge-modifier-check" title={t("dental.biteContactOnlyHint")}>
        <input type="checkbox" checked={Boolean(biteMap.contactOnly)} onChange={(event) => onContactOnly(event.currentTarget.checked)} />
        <span>{t("dental.biteContactOnly")}</span>
      </label>
    ) : null}
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
export function BiteContactsCard({ biteMap, onToggle, onContactOnly, hint }: { biteMap: BiteMapView; onToggle: (on: boolean) => void; onContactOnly: (on: boolean) => void; hint?: string | null }) {
  const on = Boolean(biteMap?.on);
  if (!on) {
    return (
      <div className="bite-contacts-card closed">
        <button type="button" className="bite-contacts-open" title={t("dental.biteMapHint")} onClick={() => onToggle(true)}>
          <span className="bite-contacts-swatch" aria-hidden="true" style={{ background: contactGradient(2, 0).replace("to bottom", "to right") }} />
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
      <BiteContactsDetails biteMap={biteMap!} onContactOnly={onContactOnly} />
    </div>
  );
}
