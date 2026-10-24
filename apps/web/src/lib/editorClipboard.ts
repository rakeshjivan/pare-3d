import { copyViaSelectionField, decodeClipboardPayload, encodeClipboardPayload, LOCAL_CLIPBOARD_LIMIT, type ClipboardPayload } from "@/lib/clipboardPayload";
import { serializeShapesForSync } from "@/lib/workplaneShapes";
import { clipboardShape } from "@/lib/shapeCatalog";
import type { WorkplaneShape } from "@/types/layerling";

/* The editor's clipboard: shapes copied between tabs (local storage) and through the system clipboard. Moved out of LayerlingEditor (build 55). */

export const SHARED_CLIPBOARD_STORAGE_KEY = "layerling.clipboard";
export const SYSTEM_CLIPBOARD_PREFIX = "LAYERLING/1\n";
export function parseClipboardShapes(serialized: string): ClipboardPayload<WorkplaneShape> | null {
  const payload = decodeClipboardPayload(serialized);
  if (!payload) return null;
  const shapes = payload.shapes.flatMap((entry) => {
    const shape = clipboardShape(entry);
    return shape ? [shape] : [];
  });
  return { copiedAt: payload.copiedAt, shapes };
}

export function readSharedClipboard(): ClipboardPayload<WorkplaneShape> | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(SHARED_CLIPBOARD_STORAGE_KEY);
    if (!stored) return null;
    // A large copy from an older layerling may still sit here and crowd out
    // the project list; the tab and the system clipboard carry large copies.
    if (stored.length > LOCAL_CLIPBOARD_LIMIT) {
      window.localStorage.removeItem(SHARED_CLIPBOARD_STORAGE_KEY);
      return null;
    }
    return parseClipboardShapes(stored);
  } catch {
    return null;
  }
}

export async function readSystemClipboard(): Promise<ClipboardPayload<WorkplaneShape> | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    return null;
  }
  try {
    const value = await navigator.clipboard.readText();
    if (!value.startsWith(SYSTEM_CLIPBOARD_PREFIX)) return null;
    return parseClipboardShapes(value.slice(SYSTEM_CLIPBOARD_PREFIX.length));
  } catch {
    return null;
  }
}

export function copyTextWithSelectionFallback(value: string) {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return;
  }
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.readOnly = true;
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-10000px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } catch {
    // The modern Clipboard API below may still succeed.
  }
  textarea.remove();
  previousFocus?.focus({ preventScroll: true });
}

export function writeSharedClipboard(shapes: WorkplaneShape[], copiedAt: number) {
  if (typeof window === "undefined") {
    return;
  }
  const serialized = encodeClipboardPayload(serializeShapesForSync(shapes), copiedAt);
  try {
    if (serialized.length > LOCAL_CLIPBOARD_LIMIT) {
      // Too large for the small local storage: an older copy must not stay
      // behind there either, or another tab would paste that instead.
      window.localStorage.removeItem(SHARED_CLIPBOARD_STORAGE_KEY);
    } else {
      window.localStorage.setItem(SHARED_CLIPBOARD_STORAGE_KEY, serialized);
    }
  } catch {
    try {
      window.localStorage.removeItem(SHARED_CLIPBOARD_STORAGE_KEY);
    } catch {
      // storage unavailable - the tab and the system clipboard still hold the copy
    }
  }
  const systemPayload = `${SYSTEM_CLIPBOARD_PREFIX}${serialized}`;
  const hasClipboardApi = Boolean(navigator.clipboard?.writeText);
  if (copyViaSelectionField(systemPayload.length, hasClipboardApi)) copyTextWithSelectionFallback(systemPayload);
  if (hasClipboardApi) {
    void navigator.clipboard.writeText(systemPayload).catch(() => {
      // Same-origin tabs still have the local-storage fallback.
    });
  }
}
