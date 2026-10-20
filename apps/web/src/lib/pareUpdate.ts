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

export async function checkPareUpdate(fetchFn: typeof fetch = fetch): Promise<PareUpdate | null> {
  if (PARE_BUILD <= 0 || typeof window === "undefined") return null;
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
