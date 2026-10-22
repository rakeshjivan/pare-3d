/**
 * Fork (build 35): runs heavy mesh work in a worker (workers/meshJobs.worker.ts). Where a worker
 * cannot start - an old browser, the tests - the same work runs here as before.
 */
import type { MeshRoundMode, MeshRoundResult } from "@/lib/meshRound";

export type MeshJobRequest = { id: number; base: string; kind: "round"; positions: Float32Array; radius: number; mode: MeshRoundMode };
export type MeshJobResponse =
  | { id: number; ok: true; result: { positions: Float32Array; voxel: number; coarse: boolean } }
  | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let failed = false;
let nextId = 1;
const pending = new Map<number, { resolve: (value: MeshRoundResult) => void; reject: (error: Error) => void }>();

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
      if (reply.ok) waiting.resolve({ positions: Array.from(reply.result.positions), voxel: reply.result.voxel, coarse: reply.result.coarse });
      else waiting.reject(new Error(reply.error));
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
      pending.set(id, { resolve, reject });
      const request: MeshJobRequest = { id, base: new URL(".", window.location.href).href, kind: "round", positions: data, radius, mode };
      target.postMessage(request, [data.buffer]);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "worker-unavailable") return roundHere(positions, radius, mode);
    throw error;
  }
}
