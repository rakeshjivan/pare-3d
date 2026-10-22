"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bug, Check, LoaderCircle, Lightbulb, MessageSquare, Send, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { OPEN_FEEDBACK_EVENT, openFeedback, sendFeedback, type FeedbackKind, type FeedbackRequest } from "@/lib/feedback";

/** The name of the tool window that is open, if any - the tool a report is most likely about. */
function openToolName(): string {
  const header = document.querySelector(".edge-modifier-header strong, .movable-tool-panel h2, .array-panel .edge-modifier-header strong");
  return header?.textContent?.trim() ?? "";
}

/**
 * Fork (build 37): the "Report a problem or suggest something" form, and the chip that offers it
 * whenever a tool window shows an error. The chip only watches the page - it adds nothing to the
 * tool windows themselves - so every tool, present and future, gets it.
 */
export function FeedbackDialog() {
  useLanguage();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("broken");
  const [tool, setTool] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [failure, setFailure] = useState("");
  const messageRef = useRef<HTMLTextAreaElement>(null);
  // The error a tool window shows right now, with that tool's name - for the chip.
  const [visibleError, setVisibleError] = useState<{ text: string; tool: string } | null>(null);
  const dismissedRef = useRef("");

  useEffect(() => {
    const onOpen = (event: Event) => {
      const request = (event as CustomEvent<FeedbackRequest>).detail ?? {};
      setKind(request.kind ?? (request.error ? "broken" : "suggestion"));
      setTool(request.tool ?? openToolName());
      setError(request.error);
      setState("idle");
      setFailure("");
      setOpen(true);
      window.setTimeout(() => messageRef.current?.focus(), 50);
    };
    window.addEventListener(OPEN_FEEDBACK_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, onOpen);
  }, []);

  useEffect(() => {
    // A light look every second for an error in a tool window, rather than watching every change.
    const look = () => {
      const alert = [...document.querySelectorAll(".edge-modifier-error[role=alert], .edge-modifier-panel [role=alert]")]
        .find((element) => element instanceof HTMLElement && element.offsetParent !== null && element.textContent?.trim());
      const text = alert?.textContent?.trim().slice(0, 600) ?? "";
      if (!text || text === dismissedRef.current) {
        setVisibleError((current) => (current ? null : current));
        return;
      }
      const panel = alert?.closest(".edge-modifier-panel, .movable-tool-panel");
      const name = panel?.querySelector(".edge-modifier-header strong, h2")?.textContent?.trim() ?? "";
      setVisibleError((current) => (current?.text === text && current.tool === name ? current : { text, tool: name }));
    };
    const timer = window.setInterval(look, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state !== "sending") setOpen(false);
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, state]);

  const submit = async () => {
    if (!message.trim() || state === "sending") return;
    setState("sending");
    try {
      await sendFeedback({ kind, tool: tool.trim(), message: message.trim(), email: email.trim(), error });
      setState("sent");
      setMessage("");
      if (error) dismissedRef.current = error;
    } catch (sendError) {
      setState("failed");
      setFailure(sendError instanceof Error && sendError.message === "offline" ? t("feedback.offline") : t("feedback.failed"));
    }
  };

  const kinds: Array<{ id: FeedbackKind; label: string; icon: ReactNode }> = [
    { id: "broken", label: t("feedback.kind.broken"), icon: <Bug size={16} /> },
    { id: "suggestion", label: t("feedback.kind.suggestion"), icon: <Lightbulb size={16} /> },
    { id: "other", label: t("feedback.kind.other"), icon: <MessageSquare size={16} /> },
  ];
  const emailLooksWrong = email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <>
      {visibleError && !open ? (
        <div className="feedback-chip" role="status">
          <button type="button" className="feedback-chip-main" onClick={() => openFeedback({ kind: "broken", tool: visibleError.tool, error: visibleError.text })}>
            <Bug size={15} />
            <span>{t("feedback.reportThis")}</span>
          </button>
          <button type="button" className="feedback-chip-close" aria-label={t("common.cancel")} onClick={() => { dismissedRef.current = visibleError.text; setVisibleError(null); }}>
            <X size={14} />
          </button>
        </div>
      ) : null}
      {open ? (
        <div className="feedback-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && state !== "sending") setOpen(false); }}>
          <div className="feedback-dialog" role="dialog" aria-modal="true" aria-label={t("feedback.title")}>
            <header>
              <div>
                <strong>{t("feedback.title")}</strong>
                <span>{t("feedback.subtitle")}</span>
              </div>
              <button type="button" aria-label={t("common.cancel")} onClick={() => setOpen(false)} disabled={state === "sending"}><X size={20} /></button>
            </header>
            {state === "sent" ? (
              <div className="feedback-sent">
                <Check size={28} />
                <strong>{t("feedback.thanks")}</strong>
                <span>{t(email.trim() ? "feedback.thanksReply" : "feedback.thanksNoReply")}</span>
                <button type="button" className="primary" onClick={() => setOpen(false)}>{t("feedback.close")}</button>
              </div>
            ) : (
              <>
                <div className="feedback-kinds" role="radiogroup" aria-label={t("feedback.kindLabel")}>
                  {kinds.map((entry) => (
                    <button key={entry.id} type="button" role="radio" aria-checked={kind === entry.id} className={kind === entry.id ? "active" : ""} onClick={() => setKind(entry.id)}>
                      {entry.icon}
                      <span>{entry.label}</span>
                    </button>
                  ))}
                </div>
                <label className="feedback-field">
                  <span>{t("feedback.tool")}</span>
                  <input type="text" value={tool} maxLength={80} placeholder={t("feedback.toolPlaceholder")} onChange={(event) => setTool(event.currentTarget.value)} />
                </label>
                <label className="feedback-field">
                  <span>{t(kind === "suggestion" ? "feedback.messageSuggestion" : "feedback.message")}</span>
                  <textarea ref={messageRef} value={message} rows={5} maxLength={4000} placeholder={t(kind === "suggestion" ? "feedback.placeholderSuggestion" : "feedback.placeholder")} onChange={(event) => setMessage(event.currentTarget.value)} />
                </label>
                {error ? (
                  <div className="feedback-error-sent">
                    <span>{t("feedback.errorIncluded")}</span>
                    <q>{error}</q>
                  </div>
                ) : null}
                <label className="feedback-field">
                  <span>{t("feedback.email")}</span>
                  <input type="email" value={email} maxLength={120} placeholder={t("feedback.emailPlaceholder")} onChange={(event) => setEmail(event.currentTarget.value)} />
                </label>
                <p className="feedback-privacy">{t("feedback.privacy")}</p>
                {state === "failed" ? <div className="edge-modifier-error feedback-failure">{failure}</div> : null}
                <footer>
                  <button type="button" className="secondary" onClick={() => setOpen(false)} disabled={state === "sending"}>{t("common.cancel")}</button>
                  <button type="button" className="primary" disabled={!message.trim() || state === "sending" || emailLooksWrong} onClick={() => void submit()}>
                    {state === "sending" ? <LoaderCircle className="edge-modifier-spinner" size={16} /> : <Send size={16} />}
                    <span>{state === "sending" ? t("feedback.sending") : t("feedback.send")}</span>
                  </button>
                </footer>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
