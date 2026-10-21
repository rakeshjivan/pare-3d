"use client";

import { BookOpen, CircleHelp, GraduationCap, Keyboard, LibraryBig, MessageSquareHeart, MousePointerClick, Sparkles, Tags } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { guideHref } from "@/lib/guideLinks";
import { OPEN_TINKERCAD_GUIDE_EVENT } from "@/components/TinkercadGuide";
import { readToolNames, setToolNames } from "@/lib/toolNames";
import { OPEN_WHATS_NEW_EVENT } from "@/components/WhatsNew";

const FEEDBACK_URL = "https://github.com/rakeshjivan/pare-3d/issues/new";

/**
 * Fork: one Help button for everything that explains the app, instead of five icons side by side
 * (the audit's #4): the quick guide, keyboard shortcuts, Interactive Help, the Tinkercad guide and
 * the full user guide.
 */
export function HelpMenu({
  interactiveHelpActive,
  onGuide,
  onShortcuts,
  onInteractiveHelp,
}: {
  interactiveHelpActive: boolean;
  onGuide: () => void;
  onShortcuts: () => void;
  onInteractiveHelp: () => void;
}) {
  const language = useLanguage();
  const [open, setOpen] = useState(false);
  const [toolNames, setToolNamesState] = useState(false);
  useEffect(() => setToolNamesState(readToolNames()), [open]);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <div className="help-menu" ref={rootRef}>
      <button
        type="button"
        className={`action-icon-button help-menu-button ${open || interactiveHelpActive ? "active" : ""}`}
        aria-label={t("helpMenu.title")}
        title={t("helpMenu.title")}
        aria-haspopup="menu"
        aria-expanded={open}
        data-help-exempt
        onClick={() => setOpen(!open)}
      >
        <CircleHelp className="title-icon" aria-hidden="true" />
        <span className="help-menu-label">{t("helpMenu.title")}</span>
      </button>
      {open ? (
        <div className="help-menu-list" role="menu" aria-label={t("helpMenu.title")}>
          <button type="button" role="menuitem" onClick={pick(onGuide)}>
            <BookOpen size={17} aria-hidden="true" />
            <span><strong>{t("editor.guide")}</strong><small>{t("helpMenu.guideHint")}</small></span>
          </button>
          <button type="button" role="menuitem" onClick={pick(() => window.dispatchEvent(new Event(OPEN_TINKERCAD_GUIDE_EVENT)))}>
            <GraduationCap size={17} aria-hidden="true" />
            <span><strong>{t("helpMenu.tinkercad")}</strong><small>{t("helpMenu.tinkercadHint")}</small></span>
          </button>
          <button type="button" role="menuitem" data-help-exempt onClick={pick(onInteractiveHelp)}>
            <MousePointerClick size={17} aria-hidden="true" />
            <span><strong>{t("interactiveHelp.title")}</strong><small>{t("helpMenu.interactiveHint")}</small></span>
          </button>
          <button type="button" role="menuitem" onClick={pick(onShortcuts)}>
            <Keyboard size={17} aria-hidden="true" />
            <span><strong>{t("editor.keyboardShortcuts")}</strong><small>{t("helpMenu.shortcutsHint")}</small></span>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={toolNames}
            onClick={() => {
              setToolNames(!toolNames);
              setToolNamesState(!toolNames);
            }}
          >
            <Tags size={17} aria-hidden="true" />
            <span><strong>{t("helpMenu.toolNames")}{toolNames ? " ✓" : ""}</strong><small>{t("helpMenu.toolNamesHint")}</small></span>
          </button>
          <button type="button" role="menuitem" onClick={pick(() => window.dispatchEvent(new Event(OPEN_WHATS_NEW_EVENT)))}>
            <Sparkles size={17} aria-hidden="true" />
            <span><strong>{t("helpMenu.whatsNew")}</strong><small>{t("helpMenu.whatsNewHint")}</small></span>
          </button>
          <a role="menuitem" href={FEEDBACK_URL} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
            <MessageSquareHeart size={17} aria-hidden="true" />
            <span><strong>{t("helpMenu.feedback")}</strong><small>{t("helpMenu.feedbackHint")}</small></span>
          </a>
          <a role="menuitem" href={guideHref(language)} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
            <LibraryBig size={17} aria-hidden="true" />
            <span><strong>{t("dashboard.userGuide")}</strong><small>{t("helpMenu.userGuideHint")}</small></span>
          </a>
        </div>
      ) : null}
    </div>
  );
}
