"use client";

/**
 * Build 96: the bite contacts & clearance map's scale and summary (shared by Dental Studio and the
 * floating card), and the floating card itself - shown whenever two dental scans or models are
 * selected, or the studio has both arches, so the contacts are always one click away.
 */
import { ArrowDownToLine, ArrowUpToLine, LoaderCircle, ScanFace, X } from "lucide-react";
import { CONTACT_RANGES, contactGradient, contactTicks, type BiteContactStats } from "@/lib/biteContacts";
import { t } from "@/lib/i18n";

export type BiteMapView = { on: boolean; busy: boolean; upper?: BiteContactStats; lower?: BiteContactStats; error?: string; contactOnly?: boolean; upperOpacity?: number; lowerOpacity?: number; range?: number } | null;

/** Build 96: the scale as the scanner programs show it - a bar from 2 mm (green) down to contact (red) and overlap (blue to purple). */
function ContactScale({ contactOnly, range }: { contactOnly: boolean; range: number }) {
  const top = range, bottom = -0.2;
  const pos = (value: number) => `${((top - value) / (top - bottom)) * 100}%`;
  return (
    <div className={`bite-scale${contactOnly ? " contact-only" : ""}`} aria-label={t("dental.biteMapLegend")}
      style={{ ["--contact-only-at" as string]: pos(0.1) }}>
      <div className="bite-scale-bar" style={{ background: contactGradient(top, bottom, range) }} aria-hidden="true" />
      <ol className="bite-scale-ticks">
        {contactTicks(range).map((tick) => (
          <li key={tick} style={{ top: pos(tick) }}>{tick.toFixed(2)}</li>
        ))}
      </ol>
      <ul className="bite-scale-words">
        <li style={{ top: "0%" }}>{t("dental.biteScaleFar", { range: range.toString() })}</li>
        <li style={{ top: pos(0) }}>{t("dental.biteScaleContact")}</li>
        <li style={{ top: "100%" }}>{t("dental.biteScaleOverlap")}</li>
      </ul>
    </div>
  );
}

export function BiteContactsDetails({ biteMap, onContactOnly, onRange }: { biteMap: NonNullable<BiteMapView>; onContactOnly?: (on: boolean) => void; onRange?: (range: number) => void }) {
  const range = biteMap.range ?? 2;
  const overlap = biteMap.upper && biteMap.lower ? Math.max(biteMap.upper.maxOverlap, biteMap.lower.maxOverlap) : 0;
  const contact = biteMap.upper && biteMap.lower ? (biteMap.upper.contactArea + biteMap.lower.contactArea) / 2 : 0;
  return (<>
    <ContactScale contactOnly={Boolean(biteMap.contactOnly)} range={range} />
    {onRange ? (
      <div className="dental-trim-mode bite-range" role="radiogroup" aria-label={t("dental.biteRange")} title={t("dental.biteRangeHint")}>
        <span>{t("dental.biteRange")}</span>
        {CONTACT_RANGES.map((value) => (
          <button key={value} type="button" role="radio" aria-checked={range === value} className={range === value ? "active" : ""} onClick={() => onRange(value)}>{value} mm</button>
        ))}
      </div>
    ) : null}
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

/**
 * The floating card: a button while off; the scale and summary while on. Build 97: in occlusion, a
 * slider for each arch's opacity and views from above and below, to look through one arch at the
 * contacts on the other (as Exocad's viewer does); laid side by side, each arch shows the contacts it
 * makes in the bite.
 */
export function BiteContactsCard({ biteMap, inBite, onToggle, onContactOnly, onRange, onOpacity, onLook }: {
  biteMap: BiteMapView;
  inBite: boolean;
  onToggle: (on: boolean) => void;
  onContactOnly: (on: boolean) => void;
  onRange: (range: number) => void;
  onOpacity: (arch: "upper" | "lower", value: number) => void;
  onLook: (from: "above" | "below" | "front") => void;
}) {
  const on = Boolean(biteMap?.on);
  if (!on) {
    return (
      <div className="bite-contacts-card closed">
        <button type="button" className="bite-contacts-open" title={t("dental.biteMapHint")} onClick={() => onToggle(true)}>
          <span className="bite-contacts-swatch" aria-hidden="true" style={{ background: contactGradient(2, 0).replace("to bottom", "to right") }} />
          {t("dental.biteMapShow")}
        </button>
      </div>
    );
  }
  const slider = (arch: "upper" | "lower") => {
    const value = Math.round(((arch === "upper" ? biteMap?.upperOpacity : biteMap?.lowerOpacity) ?? 1) * 100);
    const label = t(arch === "upper" ? "dental.biteOpacityUpper" : "dental.biteOpacityLower");
    return (
      <label className="bite-opacity">
        <span>{label}</span>
        <input type="range" min={0} max={100} step={5} value={value} aria-label={label} onChange={(event) => onOpacity(arch, Number(event.currentTarget.value) / 100)} />
        <output>{value}%</output>
      </label>
    );
  };
  return (
    <div className="bite-contacts-card" role="region" aria-label={t("dental.biteMap")}>
      <div className="bite-contacts-head">
        <strong>{t("dental.biteMap")}</strong>
        <button type="button" className="icon-button" title={t("dental.biteMapHide")} aria-label={t("dental.biteMapHide")} onClick={() => onToggle(false)}><X size={14} /></button>
      </div>
      <BiteContactsDetails biteMap={biteMap!} onContactOnly={onContactOnly} onRange={onRange} />
      {inBite ? (
        <div className="bite-see-through" role="group" aria-label={t("dental.biteSeeThrough")}>
          {slider("upper")}
          {slider("lower")}
          <div className="bite-look">
            <button type="button" title={t("dental.biteLookAboveHint")} onClick={() => onLook("above")}><ArrowDownToLine size={14} aria-hidden="true" /> {t("dental.biteLookAbove")}</button>
            <button type="button" title={t("dental.biteLookBelowHint")} onClick={() => onLook("below")}><ArrowUpToLine size={14} aria-hidden="true" /> {t("dental.biteLookBelow")}</button>
            <button type="button" onClick={() => onLook("front")}><ScanFace size={14} aria-hidden="true" /> {t("dental.biteLookFront")}</button>
          </div>
        </div>
      ) : <p className="blend-hint">{t("dental.biteSideNote")}</p>}
    </div>
  );
}
