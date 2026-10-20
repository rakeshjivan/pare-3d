"use client";

import { Heart, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { LANGUAGE_INFO, t, type Language } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { SOURCE_CODE_URL, releaseNotesUrl, type AppUpdateInfo } from "@/lib/appUpdate";
import { useAppUpdate } from "@/lib/useAppUpdate";
import { SHOW_WHATS_NEW_EVENT } from "@/lib/useWhatsNew";
import { InstallAppHint } from "@/components/InstallAppHint";
import { TabletHint } from "@/components/TabletHint";
import { PenHoverTips } from "@/components/PenHoverTips";
import { SupportNudge } from "@/components/SupportNudge";
import { supportCardEnabled, supportLink, type SupportSettings } from "@/lib/supportLink";

export { SOURCE_CODE_URL };

/** Der Verweis in der Fußzeile zeigt auf die Anleitung in der gewählten Sprache. */
function readmeUrl(language: Language) {
  return `${SOURCE_CODE_URL.replace(/\/+$/, "")}/blob/main/${LANGUAGE_INFO[language].readme}`;
}

// German readers are already gathered in the drucktipps3d forum this project
// grew out of; everyone else is pointed at GitHub Discussions instead, since
// a German forum means nothing to them. Which is which sits with the language
// (languages.ts).
function communityUrl(language: Language) {
  return LANGUAGE_INFO[language].communityUrl;
}

// Whoever operates a layerling installation may be required to publish a legal
// notice - in Germany every business site needs an Impressum. The pages differ
// per operator and are not part of this project, so they are linked through
// build-time variables and the links disappear when nothing is configured. An
// operator-supplied label wins outright, in whichever language they wrote it;
// only the built-in fallback follows the reader's own language.
const LEGAL_LINK_SOURCES = [
  {
    url: process.env.NEXT_PUBLIC_IMPRINT_URL,
    label: process.env.NEXT_PUBLIC_IMPRINT_LABEL,
    fallbackLabel: "imprint",
  },
  {
    url: process.env.NEXT_PUBLIC_PRIVACY_URL,
    label: process.env.NEXT_PUBLIC_PRIVACY_LABEL,
    fallbackLabel: "privacy",
  },
] as const;

function legalLinks(language: Language) {
  return LEGAL_LINK_SOURCES.map((link) => ({
    href: link.url?.trim() ?? "",
    label: link.label?.trim() || LANGUAGE_INFO[language].legal[link.fallbackLabel],
  })).filter((link) => link.href.length > 0);
}

// Everyone sees the way to support the project. Whoever runs an installation
// may name an address of their own through build-time variables, just like the
// legal pages, or switch the built-in link and the reminder card off.
const SUPPORT_SETTINGS: SupportSettings = {
  url: process.env.NEXT_PUBLIC_SPONSOR_URL,
  label: process.env.NEXT_PUBLIC_SPONSOR_LABEL,
  hint: process.env.NEXT_PUBLIC_SUPPORT_HINT,
};

// The footer reads as two halves: what this installation is on the left, where
// the project lives on the right. Middle dots separate the parts and sit in
// their own spans, so they are neither clickable nor read aloud. Entries that
// are not configured drop out without leaving a stray dot behind.
function joinWithDots(items: ReactNode[]) {
  return items
    .filter(Boolean)
    .flatMap((item, index) =>
      index === 0
        ? [item]
        : [
            <span className="dashboard-legal-dot" aria-hidden="true" key={`dot-${index}`}>
              &middot;
            </span>,
            item,
          ],
    );
}

// The anchor of the Windows quickstart section, which also explains updating.
function updateStepsUrl(language: Language) {
  return `${readmeUrl(language)}#${LANGUAGE_INFO[language].quickstartAnchor}`;
}

/**
 * Dieselbe Zeile auf der Startseite und unter dem Arbeitsbereich. Im Editor
 * liegt sie als schmales Band am unteren Rand, deshalb bekommt sie dort eine
 * zweite Klasse statt einer eigenen Kopie des Markups.
 */
export function AppFooter({
  variant = "dashboard",
  version,
  updateInfo,
  onBugReport,
}: {
  variant?: "dashboard" | "editor";
  version: string;
  updateInfo?: AppUpdateInfo | null;
  /** Im Editor: den Entwurf als Fehlerbericht speichern. */
  onBugReport?: () => void;
}) {
  const language = useLanguage();
  const sponsor = supportLink(SUPPORT_SETTINGS, language);
  const { update: hookUpdate } = useAppUpdate(version);
  const update = updateInfo !== undefined ? updateInfo : hookUpdate;
  // On someone's own computer the release page does not say how to update,
  // so the notice points at the steps instead. Decided after mount: the
  // exported page cannot know where it will be opened.
  const [runsLocally, setRunsLocally] = useState(false);
  useEffect(() => {
    setRunsLocally(["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname));
  }, []);

  // Trimmed build: the user guide and, as the AGPL asks, a link to the source.
  void sponsor; void update; void runsLocally; void onBugReport; void communityUrl; void legalLinks; void updateStepsUrl;
  return (
    <>
    {variant === "editor" ? <PenHoverTips /> : null}
    <footer className={variant === "editor" ? "dashboard-legal editor-legal" : "dashboard-legal"}>
      <div className="dashboard-legal-group">
        <a href={t("welcome.guideUrl")} target="_blank" rel="noreferrer">
          {t("dashboard.userGuide")}
        </a>
      </div>
      <div className="dashboard-legal-group">
        <a href={SOURCE_CODE_URL} target="_blank" rel="noreferrer" title="Based on layerling (AGPL-3.0)">
          Source (AGPL-3.0) &middot; v{version}
        </a>
      </div>
    </footer>
    </>
  );
}
