"use client";

/*
 * Build 104: Dental Studio's workspace, laid out as Meshmixer is - a slim bar along the top, a column of
 * tools down the left (icon over its name), the open tool's settings docked beside the column, and the
 * scans and models in an object list. It is only the frame: every button calls the same tool CAD Studio
 * uses, on the same engine, so nothing about the models changes.
 */
import { ArrowLeftRight, Brush, ChevronRight, Download, Home, Layers, ListTree, Redo2, Ruler, Scissors, Undo2, Upload, Wand2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { ForkToothIcon, ForkWaxupIcon } from "@/components/forkToolbarIcons";

export type DentalChromeAction = {
  id: string;
  label: string;
  onClick: () => void;
  enabled?: boolean;
  active?: boolean;
  hint?: string;
};

type ColumnTool = {
  id: string;
  label: string;
  icon: ReactNode;
  /** A tool that opens straight away... */
  onClick?: () => void;
  /** ...or a flyout of actions, as Meshmixer's Edit and Analysis. */
  actions?: DentalChromeAction[];
  active?: boolean;
  enabled?: boolean;
  test?: boolean;
};

export function DentalChrome({
  caseName,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onHome,
  onSendToCad,
  onImport,
  onExport,
  modelBuilder,
  waxup,
  sculpt,
  editActions,
  analysisActions,
  objectsOpen,
  onObjects,
}: {
  caseName: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onHome?: () => void;
  onSendToCad?: () => void;
  onImport: () => void;
  onExport: () => void;
  modelBuilder: { active: boolean; onClick: () => void };
  /** Only in test builds. */
  waxup: { active: boolean; onClick: () => void } | null;
  sculpt: { active: boolean; enabled: boolean; onClick: () => void };
  editActions: DentalChromeAction[];
  analysisActions: DentalChromeAction[];
  objectsOpen: boolean;
  onObjects: () => void;
}) {
  useLanguage();
  const [flyout, setFlyout] = useState<string | null>(null);
  const columnRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!flyout) return;
    const away = (event: PointerEvent) => {
      if (columnRef.current && !columnRef.current.contains(event.target as Node)) setFlyout(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFlyout(null);
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
    };
  }, [flyout]);

  const tools: ColumnTool[] = [
    { id: "import", label: t("dentalChrome.import"), icon: <Upload size={22} strokeWidth={1.7} />, onClick: onImport },
    { id: "model", label: t("dentalChrome.modelBuilder"), icon: <ForkToothIcon width={24} height={24} />, onClick: modelBuilder.onClick, active: modelBuilder.active },
    ...(waxup ? [{ id: "waxup", label: t("dentalChrome.waxup"), icon: <ForkWaxupIcon width={24} height={24} />, onClick: waxup.onClick, active: waxup.active, test: true }] : []),
    { id: "sculpt", label: t("dentalChrome.sculpt"), icon: <Brush size={22} strokeWidth={1.7} />, onClick: sculpt.onClick, active: sculpt.active, enabled: sculpt.enabled },
    { id: "edit", label: t("dentalChrome.edit"), icon: <Scissors size={22} strokeWidth={1.7} />, actions: editActions, active: editActions.some((action) => action.active) },
    { id: "analysis", label: t("dentalChrome.analysis"), icon: <Ruler size={22} strokeWidth={1.7} />, actions: analysisActions, active: analysisActions.some((action) => action.active) },
    { id: "objects", label: t("dentalChrome.objects"), icon: <ListTree size={22} strokeWidth={1.7} />, onClick: onObjects, active: objectsOpen },
    { id: "export", label: t("dentalChrome.export"), icon: <Download size={22} strokeWidth={1.7} />, onClick: onExport },
  ];

  return (
    <>
      <header className="dental-chrome-bar">
        {onHome ? (
          <button type="button" className="dental-chrome-icon" onClick={onHome} aria-label={t("editor.homeDashboard")} title={t("editor.homeDashboard")}>
            <Home size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        ) : null}
        <span className="dental-chrome-title">
          <span className="dental-chrome-mark" aria-hidden="true" />
          <span className="dental-chrome-studio">{t("home.dentalStudio")}</span>
          <span className="dental-chrome-sep" aria-hidden="true">/</span>
          <span className="dental-chrome-case" translate="no">{caseName}</span>
        </span>
        <span className="dental-chrome-spacer" />
        <button type="button" className="dental-chrome-icon" onClick={onUndo} disabled={!canUndo} aria-label={t("editor.tool.undo")} title={t("editor.tool.undo")}>
          <Undo2 size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <button type="button" className="dental-chrome-icon" onClick={onRedo} disabled={!canRedo} aria-label={t("editor.tool.redo")} title={t("editor.tool.redo")}>
          <Redo2 size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
        {onSendToCad ? (
          <button type="button" className="dental-chrome-button" onClick={onSendToCad} title={t("dentalChrome.sendToCadHint")}>
            <ArrowLeftRight size={16} strokeWidth={1.9} aria-hidden="true" />
            {t("home.sendToCad")}
          </button>
        ) : null}
        <button type="button" className="dental-chrome-button primary" onClick={onExport}>
          <Download size={16} strokeWidth={1.9} aria-hidden="true" />
          {t("dentalChrome.export")}
        </button>
      </header>
      <nav className="dental-chrome-column" aria-label={t("dentalChrome.tools")} ref={columnRef}>
        {tools.map((tool) => (
          <div key={tool.id} className="dental-chrome-tool-wrap">
            <button
              type="button"
              className={`dental-chrome-tool${tool.active ? " active" : ""}${flyout === tool.id ? " open" : ""}`}
              disabled={tool.enabled === false}
              aria-pressed={tool.actions ? undefined : Boolean(tool.active)}
              aria-expanded={tool.actions ? flyout === tool.id : undefined}
              onClick={() => {
                if (tool.actions) {
                  setFlyout((current) => (current === tool.id ? null : tool.id));
                  return;
                }
                setFlyout(null);
                tool.onClick?.();
              }}
            >
              <span className="dental-chrome-tool-icon" aria-hidden="true">{tool.icon}</span>
              <span className="dental-chrome-tool-label">{tool.label}</span>
              {tool.test ? <span className="dental-chrome-test">{t("home.testBuild")}</span> : null}
              {tool.actions ? <ChevronRight className="dental-chrome-more" size={12} aria-hidden="true" /> : null}
            </button>
            {tool.actions && flyout === tool.id ? (
              <div className="dental-chrome-flyout" role="menu" aria-label={tool.label}>
                <div className="dental-chrome-flyout-title">{tool.label}</div>
                {tool.actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    className={action.active ? "active" : undefined}
                    disabled={action.enabled === false}
                    onClick={() => {
                      setFlyout(null);
                      action.onClick();
                    }}
                  >
                    <Wand2 size={15} strokeWidth={1.8} aria-hidden="true" />
                    <span>
                      <strong>{action.label}</strong>
                      {action.hint ? <small>{action.hint}</small> : null}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        <span className="dental-chrome-column-foot" aria-hidden="true">
          <Layers size={14} strokeWidth={1.8} />
        </span>
      </nav>
    </>
  );
}
