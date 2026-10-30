"use client";

/*
 * Build 104: the one bar across the top of the start pages - the brand, the three places (Home,
 * CAD Studio, Dental Studio), search, and small icons for what used to stand in big boxes on the
 * start page: the shared folder, learning, notifications and settings. No side menu, so everything
 * below the bar has the window's full width.
 */
import { Bell, BookOpen, Folder, Search, Settings, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { PareStudio } from "@/lib/pareStudio";

export type HomePlace = "home" | PareStudio | "shared";

/** A small menu under one of the bar's icons, closed by a click elsewhere or Escape. */
function BarMenu({ label, icon, badge = 0, children, wide = false }: { label: string; icon: ReactNode; badge?: number; children: (close: () => void) => ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className="home-bar-menu" ref={ref}>
      <button
        type="button"
        className={`home-bar-icon${open ? " open" : ""}`}
        aria-label={badge ? `${label} (${badge})` : label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {icon}
        {badge ? <span className="home-bar-badge" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div className={`home-bar-popover${wide ? " wide" : ""}`} role="dialog" aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function HomeTopBar({
  place,
  onPlace,
  query,
  onQueryChange,
  sharedEnabled,
  dentalAvailable,
  notifications,
  notificationCount,
  settings,
  learn,
}: {
  place: HomePlace;
  onPlace: (place: HomePlace) => void;
  query: string;
  onQueryChange: (value: string) => void;
  sharedEnabled: boolean;
  dentalAvailable: boolean;
  /** What the bell holds: an update, the backup line, what is new. */
  notifications: (close: () => void) => ReactNode;
  notificationCount: number;
  settings: (close: () => void) => ReactNode;
  learn: (close: () => void) => ReactNode;
}) {
  useLanguage();
  const searchRef = useRef<HTMLInputElement>(null);
  // Cmd/Ctrl+K goes to the search field, as in most professional software.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const tab = (id: HomePlace, label: string, dot?: PareStudio) => (
    <button
      type="button"
      className={`home-tab${place === id ? " active" : ""}`}
      aria-current={place === id ? "page" : undefined}
      onClick={() => onPlace(id)}
    >
      {dot ? <span className={`home-studio-dot ${dot}`} aria-hidden="true" /> : null}
      {label}
    </button>
  );
  return (
    <header className="home-bar">
      <button type="button" className="home-brand" onClick={() => onPlace("home")} aria-label={t("brand.home")}>
        <img src="/assets/pare3d/pare3d-icon.svg" alt="" width={28} height={28} />
        <span>Pare 3D</span>
      </button>
      <nav className="home-tabs" aria-label={t("home.places")}>
        {tab("home", t("home.tabHome"))}
        {tab("cad", t("home.cadStudio"), "cad")}
        {dentalAvailable ? tab("dental", t("home.dentalStudio"), "dental") : null}
      </nav>
      <div className="home-bar-spacer" />
      <label className="home-search">
        <Search size={16} strokeWidth={2.2} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder={t("home.searchPlaceholder")}
          aria-label={t("home.searchPlaceholder")}
        />
        {query ? (
          <button type="button" className="home-search-clear" aria-label={t("home.clearSearch")} onClick={() => onQueryChange("")}>
            <X size={14} aria-hidden="true" />
          </button>
        ) : (
          <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
        )}
      </label>
      <div className="home-bar-icons">
        {sharedEnabled ? (
          <button
            type="button"
            className={`home-bar-icon${place === "shared" ? " open" : ""}`}
            aria-label={t("dashboard.sharedProjects")}
            title={t("dashboard.sharedProjects")}
            onClick={() => onPlace("shared")}
          >
            <Folder size={19} strokeWidth={1.9} aria-hidden="true" />
          </button>
        ) : null}
        <BarMenu label={t("home.learn")} icon={<BookOpen size={19} strokeWidth={1.9} aria-hidden="true" />}>{learn}</BarMenu>
        <BarMenu label={t("home.notifications")} icon={<Bell size={19} strokeWidth={1.9} aria-hidden="true" />} badge={notificationCount} wide>{notifications}</BarMenu>
        <BarMenu label={t("home.settings")} icon={<Settings size={19} strokeWidth={1.9} aria-hidden="true" />}>{settings}</BarMenu>
      </div>
    </header>
  );
}
