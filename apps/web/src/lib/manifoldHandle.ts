import type { ManifoldToplevel } from "manifold-3d";

/**
 * The Manifold runtime once the editor has loaded it, for code that has to run without
 * awaiting - a text's display geometry is built on the spot (#215). Until then the text draws
 * plain, asks for the runtime, and is drawn again when it arrives (onManifoldReady).
 */
let loaded: ManifoldToplevel | null = null;
let loader: (() => Promise<ManifoldToplevel>) | null = null;
let requested = false;
const listeners = new Set<() => void>();
/** Fork (build 55): told when a load fails, so a wait for the runtime ends then instead of at its time limit. */
const failureListeners = new Set<() => void>();

export function rememberManifoldRuntime(runtime: ManifoldToplevel) {
  if (loaded === runtime) return;
  loaded = runtime;
  listeners.forEach((listener) => listener());
}

/** The editor says how the runtime is loaded; the request below goes through it. */
export function setManifoldLoader(load: () => Promise<ManifoldToplevel>) {
  loader = load;
}

/** Whether the editor has said how the runtime is loaded; without it nothing can be asked for. */
export function manifoldLoaderKnown() {
  return loader !== null;
}

export function loadedManifoldRuntime(): ManifoldToplevel | null {
  return loaded;
}

/** Starts loading the runtime once; the listeners hear when it is there. */
export function requestManifoldRuntime() {
  if (loaded || requested || !loader) return;
  requested = true;
  void loader().then(rememberManifoldRuntime).catch(() => {
    requested = false;
    failureListeners.forEach((listener) => listener());
  });
}

/**
 * Fork (build 55): waits until the runtime is there, its load fails, or `timeoutMs` passes -
 * whichever comes first - and says whether it is there. A load that fails no longer holds a
 * picture or SVG import up for the whole time limit.
 */
export function waitForManifoldRuntime(timeoutMs: number): Promise<boolean> {
  if (loaded) return Promise.resolve(true);
  if (!loader) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const finish = () => {
      listeners.delete(finish);
      failureListeners.delete(finish);
      globalThis.clearTimeout(timer);
      resolve(loaded !== null);
    };
    const timer = globalThis.setTimeout(finish, timeoutMs);
    listeners.add(finish);
    failureListeners.add(finish);
    requestManifoldRuntime();
  });
}

export function onManifoldReady(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For cache keys: 0 before the runtime is there, 1 after - a text with a fill is drawn again then. */
export function manifoldRevision() {
  return loaded ? 1 : 0;
}
