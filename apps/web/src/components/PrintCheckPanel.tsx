"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { t } from "@/lib/i18n";
import type { PrintIssue } from "@/lib/printCheck";

export const PRINT_CHECK_EVENT = "pare3d:print-check";
export const SPLIT_TO_FIT_EVENT = "pare3d:split-to-fit";
export const CUT_BELOW_BED_EVENT = "pare3d:cut-below-bed";
const CHECK_BEFORE_SEND_KEY = "pare3d.checkBeforeSend";

export function checkBeforeSending() {
  try {
    return window.localStorage.getItem(CHECK_BEFORE_SEND_KEY) !== "off";
  } catch {
    return true;
  }
}

function names(list: readonly string[]) {
  const shown = list.slice(0, 3).map((name) => `“${name || t("printCheck.unnamed")}”`).join(", ");
  return list.length > 3 ? `${shown} ${t("printCheck.andMore", { count: list.length - 3 })}` : shown;
}

function message(issue: PrintIssue, printer: string) {
  const subject = names(issue.names);
  const many = issue.ids.length > 1;
  switch (issue.kind) {
    case "nothing": return t("printCheck.nothing");
    case "outside": return t(many ? "printCheck.outsideMany" : "printCheck.outside", { names: subject, printer });
    case "belowBed": return t(many ? "printCheck.belowBedMany" : "printCheck.belowBed", { names: subject });
    case "floating": return t(many ? "printCheck.floatingMany" : "printCheck.floating", { names: subject });
    case "looseHole": return t(many ? "printCheck.looseHoleMany" : "printCheck.looseHole", { names: subject });
    case "thin": return t(many ? "printCheck.thinMany" : "printCheck.thin", { names: subject, mm: issue.amount ?? 0.8 });
    case "overhang": return t(many ? "printCheck.overhangMany" : "printCheck.overhang", { names: subject, area: issue.amount ?? 0 });
    case "hidden": return t(many ? "printCheck.hiddenMany" : "printCheck.hidden", { names: subject });
  }
}

/**
 * Fork (build 19): "Ready to print?" - what the check found, each with a button that selects
 * the parts it is about. Before Send to Bambu Studio it offers to send anyway.
 */
export function PrintCheckPanel({
  issues,
  printer,
  sending,
  onSelect,
  onSplitToFit,
  onCutBelowBed,
  onShowOverhangs,
  onSend,
  onClose,
}: {
  issues: readonly PrintIssue[];
  printer: string;
  /** Set when the check ran because of Send to Bambu Studio. */
  sending: boolean;
  onSelect: (ids: string[]) => void;
  onSplitToFit: (ids: string[]) => void;
  onCutBelowBed: (ids: string[]) => void;
  onShowOverhangs: () => void;
  onSend: () => void;
  onClose: () => void;
}) {
  const problems = issues.filter((issue) => issue.level === "problem").length;
  const clear = issues.length === 0;
  return (
    <div className="print-check-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="print-check" role="dialog" aria-modal="true" aria-label={t("printCheck.title")}>
        <header>
          {clear ? <CheckCircle2 className="ok" size={22} aria-hidden="true" /> : <AlertTriangle className={problems ? "bad" : "warn"} size={22} aria-hidden="true" />}
          <div>
            <strong>{t("printCheck.title")}</strong>
            <span>{clear ? t("printCheck.allClear") : t(issues.length === 1 ? "printCheck.foundOne" : "printCheck.foundMany", { count: issues.length })}</span>
          </div>
          <button type="button" className="print-check-close" aria-label={t("printCheck.close")} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        {issues.length ? (
          <ul>
            {issues.map((issue) => (
              <li key={issue.kind} className={issue.level}>
                {issue.level === "problem" ? <AlertTriangle size={16} aria-hidden="true" /> : <Info size={16} aria-hidden="true" />}
                <span>{message(issue, printer)}</span>
                {issue.ids.length ? (
                  <button type="button" onClick={() => onSelect(issue.ids)}>{t("printCheck.select")}</button>
                ) : null}
                {issue.kind === "outside" ? (
                  <button type="button" onClick={() => onSplitToFit(issue.ids)}>{t("splitToFit.button")}</button>
                ) : null}
                {issue.kind === "belowBed" ? (
                  <button type="button" onClick={() => onCutBelowBed(issue.ids)}>{t("cutBelowBed.button")}</button>
                ) : null}
                {issue.kind === "overhang" ? (
                  <button type="button" onClick={onShowOverhangs}>{t("printCheck.showOverhangs")}</button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <footer>
          {sending ? (
            <>
              <button type="button" className="secondary" onClick={onClose}>{t("printCheck.fixFirst")}</button>
              <button type="button" className="primary" onClick={onSend}>{clear ? t("printCheck.send") : t("printCheck.sendAnyway")}</button>
            </>
          ) : (
            <button type="button" className="primary" onClick={onClose}>{t("printCheck.close")}</button>
          )}
        </footer>
      </section>
    </div>
  );
}
