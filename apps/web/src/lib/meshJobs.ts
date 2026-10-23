/**
 * Fork (build 35): runs heavy mesh work in a worker (workers/meshJobs.worker.ts). Where a worker
 * cannot start - an old browser, the tests - the same work runs here as before.
 */
import type { MeshRoundMode, MeshRoundResult } from "@/lib/meshRound";
import type { FitReport } from "@/lib/partTools";
import type { DentalModelOptions, DentalModelResult, PreparedDentalScan } from "@/lib/dentalModel";
import type { WorkplaneShape } from "@/types/layerling";

export type MeshJobRequest =
  | { id: number; base: string; kind: "round"; positions: Float32Array; radius: number; mode: MeshRoundMode }
  | { id: number; base: string; kind: "fit"; shapes: WorkplaneShape[]; clearance: number }
  | { id: number; base: string; kind: "dentalPrepare"; positions: Float32Array }
  | { id: number; base: string; kind: "dentalModel"; positions: Float32Array; options: DentalModelOptions };
export type MeshJobResponse =
  | { id: number; ok: true; kind?: "round"; result: { positions: Float32Array; voxel: number; coarse: boolean } }
  | { id: number; ok: true; kind: "fit"; report: FitReport }
  | { id: number; ok: true; kind: "dentalPrepare"; prepared: PreparedDentalScan }
  | { id: number; ok: true; kind: "dentalModel"; model: DentalModelResult }
  | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let failed = false;
let nextId = 1;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

function meshWorker(): Worker | null {
  if (failed || typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/meshJobs.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<MeshJobResponse>) => {
      const reply = event.data;
      const waiting = pending.get(reply.id);
      if (!waiting) return;
      pending.delete(reply.id);
      if (!reply.ok) waiting.reject(new Error(reply.error));
      else if (reply.kind === "fit") waiting.resolve(reply.report);
      else if (reply.kind === "dentalPrepare") waiting.resolve(reply.prepared);
      else if (reply.kind === "dentalModel") waiting.resolve(reply.model);
      else waiting.resolve({ positions: Array.from(reply.result.positions), voxel: reply.result.voxel, coarse: reply.result.coarse });
    };
    worker.onerror = () => {
      // A worker that cannot load: everything waiting runs here instead, and later jobs too.
      failed = true;
      worker?.terminate();
      worker = null;
      const stranded = [...pending.values()];
      pending.clear();
      stranded.forEach((waiting) => waiting.reject(new Error("worker-unavailable")));
    };
    return worker;
  } catch {
    failed = true;
    return null;
  }
}

async function roundHere(positions: ArrayLike<number>, radius: number, mode: MeshRoundMode) {
  const { roundMeshPositions } = await import("@/lib/meshRound");
  return roundMeshPositions(positions, radius, mode);
}

/** Rounds a closed mesh (world positions) - in the worker when one runs. */
export async function roundMeshInBackground(positions: ArrayLike<number>, radius: number, mode: MeshRoundMode): Promise<MeshRoundResult> {
  const target = meshWorker();
  if (!target) return roundHere(positions, radius, mode);
  const id = nextId;
  nextId += 1;
  const data = Float32Array.from(positions as ArrayLike<number>);
  try {
    return await new Promise<MeshRoundResult>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      const request: MeshJobRequest = { id, base: new URL(".", window.location.href).href, kind: "round", positions: data, radius, mode };
      target.postMessage(request, [data.buffer]);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "worker-unavailable") return roundHere(positions, radius, mode);
    throw error;
  }
}

/** Fit check (build 37) in the worker when one runs, so a big assembly keeps the window working. */
export async function checkFitInBackground(shapes: readonly WorkplaneShape[], clearance: number): Promise<FitReport> {
  const here = async () => (await import("@/lib/partTools")).checkFit(shapes, clearance);
  const target = meshWorker();
  if (!target) return here();
  const id = nextId;
  nextId += 1;
  try {
    return await new Promise<FitReport>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      const request: MeshJobRequest = { id, base: new URL(".", window.location.href).href, kind: "fit", shapes: shapes as WorkplaneShape[], clearance };
      target.postMessage(request);
    });
  } catch {
    // Whatever went wrong in the worker, the check is run here instead.
    return here();
  }
}

/** Runs a dental job in the worker when one runs, here otherwise (build 46). */
async function dentalJob<T>(request: (id: number, base: string, data: Float32Array) => MeshJobRequest, positions: ArrayLike<number>, here: () => Promise<T>): Promise<T> {
  const target = meshWorker();
  if (!target) return here();
  const id = nextId;
  nextId += 1;
  const data = Float32Array.from(positions as ArrayLike<number>);
  try {
    return await new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      target.postMessage(request(id, new URL(".", window.location.href).href, data), [data.buffer]);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "worker-unavailable") return here();
    throw error;
  }
}

/** Step 1 of Dental model: cleans and turns a raw scan (Z-up positions). */
export function prepareDentalScanInBackground(positions: ArrayLike<number>): Promise<PreparedDentalScan> {
  const copy = Float32Array.from(positions as ArrayLike<number>);
  return dentalJob((id, base, data) => ({ id, base, kind: "dentalPrepare", positions: data }), positions, async () => (await import("@/lib/dentalModel")).prepareDentalScan(copy));
}

/** Step 2 of Dental model: trims, adds the base and hollows a prepared scan (Z-up positions). */
export function makeDentalModelInBackground(positions: ArrayLike<number>, options: DentalModelOptions): Promise<DentalModelResult> {
  const copy = Float32Array.from(positions as ArrayLike<number>);
  return dentalJob((id, base, data) => ({ id, base, kind: "dentalModel", positions: data, options }), positions, async () => (await import("@/lib/dentalModel")).makeDentalModel(copy, options));
}
