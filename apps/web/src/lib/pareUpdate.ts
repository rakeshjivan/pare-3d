/**
 * Fork: tells the installed Pare 3D app when a newer build is published as a
 * GitHub release (tags "pare-<build>", made by .github/workflows/pare3d-release.yml).
 * Asks GitHub at most every six hours; a build of 0 (a local build) never asks.
 */
export const PARE_BUILD = Number(process.env.NEXT_PUBLIC_PARE_BUILD || 0) || 0;
const RELEASES_API = "https://api.github.com/repos/rakeshjivan/pare-3d/releases/latest";
export const RELEASES_PAGE = "https://github.com/rakeshjivan/pare-3d/releases/latest";
const CACHE_KEY = "pare3d.updateCheck";
const DISMISS_KEY = "pare3d.updateDismissed";
const CACHE_MS = 6 * 60 * 60 * 1000;

export type PareUpdate = { build: number; url: string };

export function parseBuildTag(tag: unknown): number | null {
  const match = typeof tag === "string" ? /^pare-(\d+)$/.exec(tag.trim()) : null;
  return match ? Number(match[1]) : null;
}

/**
 * Running from the Pare 3D app, its server updates the app files by itself; the page is told only
 * when an update needs a fresh download (a newer launcher). Returns undefined when no Pare 3D
 * server answers (a plain browser or a hosted copy), so the GitHub check below takes over.
 */
async function serverUpdateState(fetchFn: typeof fetch): Promise<PareUpdate | null | undefined> {
  try {
    const response = await fetchFn("/__pare3d/update", { cache: "no-store" });
    if (!response.ok || response.headers.get("x-pare3d") !== "1") return undefined;
    const state = (await response.json()) as { serving?: number; needsReinstall?: number };
    const needs = Number(state.needsReinstall) || 0;
    return needs > (Number(state.serving) || 0) ? { build: needs, url: RELEASES_PAGE } : null;
  } catch {
    return undefined;
  }
}

export async function checkPareUpdate(fetchFn: typeof fetch = fetch): Promise<PareUpdate | null> {
  if (PARE_BUILD <= 0 || typeof window === "undefined") return null;
  const fromServer = await serverUpdateState(fetchFn);
  if (fromServer !== undefined) {
    if (!fromServer) return null;
    try {
      if (Number(window.localStorage.getItem(DISMISS_KEY)) >= fromServer.build) return null;
    } catch {
      // Shown anyway.
    }
    return fromServer;
  }
  let latest: { build: number; url: string; at: number } | null = null;
  try {
    const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null");
    if (cached && Date.now() - cached.at < CACHE_MS) latest = cached;
  } catch {
    latest = null;
  }
  if (!latest) {
    try {
      const response = await fetchFn(RELEASES_API, { headers: { accept: "application/vnd.github+json" } });
      if (!response.ok) return null;
      const release = (await response.json()) as { tag_name?: string; html_url?: string };
      const build = parseBuildTag(release.tag_name);
      if (build === null) return null;
      latest = { build, url: release.html_url || RELEASES_PAGE, at: Date.now() };
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(latest));
      } catch {
        // Asks again next time.
      }
    } catch {
      return null;
    }
  }
  if (latest.build <= PARE_BUILD) return null;
  try {
    if (Number(window.localStorage.getItem(DISMISS_KEY)) >= latest.build) return null;
  } catch {
    // Shown anyway.
  }
  return { build: latest.build, url: latest.url };
}

export function dismissPareUpdate(build: number) {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(build));
  } catch {
    // Shown again next time.
  }
}
