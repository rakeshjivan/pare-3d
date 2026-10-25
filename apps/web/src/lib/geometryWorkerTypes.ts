import type { Language } from "@/lib/i18n";

/** What the page asks the geometry worker (workers/geometry.worker.ts) to work out. */
export type GeometryTask = "group" | "split" | "warm";

export interface GeometryWorkerRequest {
  requestId: number;
  task: GeometryTask;
  /** Messages in the result (failure notices, split errors) come in the page's language. */
  language: Language;
  /** Where manifold.js lies; a worker cannot tell from its own address. */
  assetBase: string;
  /** The task's arguments, packed by lib/geometryTransfer.ts. */
  payload: unknown;
  buffers: Float64Array[];
}

export type GeometryWorkerResponse =
  | { requestId: number; ok: true; payload: unknown; buffers: Float64Array[] }
  | { requestId: number; ok: false; message: string; name: string };
