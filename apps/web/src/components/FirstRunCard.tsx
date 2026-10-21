"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { applySimpleMode } from "@/components/SimpleModeSwitch";
import { OPEN_TINKERCAD_GUIDE_EVENT } from "@/components/TinkercadGuide";
import { setToolNames } from "@/lib/toolNames";

const STORAGE_KEY = "pare3d.firstRunAnswered";
const ANSWERED_EVENT = "pare3d:first-run-answered";

function answeredAlready() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return true;
  }
}

/** Whether the first-run question has been answered - the home screen waits with the Tinkercad card till then. */
export function useFirstRunAnswered() {
  const [answered, setAnswered] = useState(true);
  useEffect(() => {
    setAnswered(answeredAlready());
    const onAnswer = () => setAnswered(true);
    window.addEventListener(ANSWERED_EVENT, onAnswer);
    return () => window.removeEventListener(ANSWERED_EVENT, onAnswer);
  }, []);
  return answered;
}

/**
 * Fork (build 16): asked once, on the home screen - "New to 3D design?". A beginner gets Simple
 * mode with the tools' names under them; a Tinkercad user gets the Tinkercad guide; anyone
 * experienced gets everything. Every choice can be changed later (the Simple switch, Help menu).
 */
export function FirstRunCard() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(window.localStorage.getItem(STORAGE_KEY) === null);
    } catch {
      setShow(false);
    }
  }, []);
  if (!show) return null;
  const answer = (choice: "beginner" | "tinkercad" | "experienced") => {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
      window.localStorage.setItem("pare3d.simpleMode", choice === "beginner" ? "on" : "off");
    } catch {
      // Still applies for this visit.
    }
    applySimpleMode(choice === "beginner");
    setToolNames(choice !== "experienced");
    if (choice === "tinkercad") window.dispatchEvent(new Event(OPEN_TINKERCAD_GUIDE_EVENT));
    setShow(false);
    window.dispatchEvent(new Event(ANSWERED_EVENT));
  };
  return (
    <section className="first-run-card" aria-label={t("firstRun.title")}>
      <Sparkles size={22} aria-hidden="true" />
      <div className="first-run-text">
        <strong>{t("firstRun.title")}</strong>
        <span>{t("firstRun.body")}</span>
      </div>
      <div className="first-run-actions">
        <button type="button" className="primary" onClick={() => answer("beginner")}>{t("firstRun.beginner")}</button>
        <button type="button" onClick={() => answer("tinkercad")}>{t("firstRun.tinkercad")}</button>
        <button type="button" onClick={() => answer("experienced")}>{t("firstRun.experienced")}</button>
      </div>
    </section>
  );
}
