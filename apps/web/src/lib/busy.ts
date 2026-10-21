/*
 * Fork (build 20): one place that knows when slow work is running - combining parts, edge and
 * face tools, preparing an export - so the editor can show it instead of looking frozen.
 */
export const BUSY_EVENT = "pare3d:busy";
export type BusyKind = "combine" | "cad" | "export";

const active = new Map<BusyKind, number>();

function announce() {
  if (typeof window === "undefined") return;
  const kinds = [...active.entries()].filter(([, count]) => count > 0).map(([kind]) => kind);
  window.dispatchEvent(new CustomEvent(BUSY_EVENT, { detail: kinds }));
}

/** Marks a job of this kind as started; call the returned function when it ends (only once). */
export function beginBusy(kind: BusyKind) {
  active.set(kind, (active.get(kind) ?? 0) + 1);
  announce();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    active.set(kind, Math.max(0, (active.get(kind) ?? 1) - 1));
    announce();
  };
}

/** For work tracked elsewhere as a count (the CAD worker's open requests). */
export function setBusyCount(kind: BusyKind, count: number) {
  if ((active.get(kind) ?? 0) === count) return;
  active.set(kind, count);
  announce();
}

export async function whileBusy<T>(kind: BusyKind, work: () => Promise<T>): Promise<T> {
  const end = beginBusy(kind);
  try {
    return await work();
  } finally {
    end();
  }
}
