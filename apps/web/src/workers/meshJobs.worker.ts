/// <reference lib="webworker" />
/**
 * Fork (build 35): heavy mesh work off the page's own thread, so the window keeps answering - and
 * the spinner keeps turning - while a big scan is rounded (that can take half a minute).
 */
import type { MeshJobRequest, MeshJobResponse } from "@/lib/meshJobs";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<MeshJobRequest>) => {
  const job = event.data;
  // The mesh helpers find their wasm next to the page, as they do in the window.
  const holder = globalThis as unknown as { window?: { location: { href: string } } };
  holder.window ??= { location: { href: job.base } };
  try {
    if (job.kind === "round") {
      const { roundMeshPositions } = await import("@/lib/meshRound");
      const result = await roundMeshPositions(job.positions, job.radius, job.mode);
      const positions = Float32Array.from(result.positions);
      const reply: MeshJobResponse = { id: job.id, ok: true, result: { positions, voxel: result.voxel, coarse: result.coarse } };
      scope.postMessage(reply, [positions.buffer]);
    } else if (job.kind === "dentalPrepare") {
      const { prepareDentalScan } = await import("@/lib/dentalModel");
      const prepared = prepareDentalScan(job.positions);
      const reply: MeshJobResponse = { id: job.id, ok: true, kind: "dentalPrepare", prepared };
      scope.postMessage(reply, [prepared.positions.buffer]);
    } else if (job.kind === "dentalModel") {
      const { makeDentalModel } = await import("@/lib/dentalModel");
      const model = await makeDentalModel(job.positions, job.options);
      const reply: MeshJobResponse = { id: job.id, ok: true, kind: "dentalModel", model };
      scope.postMessage(reply, [model.positions.buffer]);
    } else if (job.kind === "fit") {
      const { checkFit } = await import("@/lib/partTools");
      const report = await checkFit(job.shapes, job.clearance);
      const reply: MeshJobResponse = { id: job.id, ok: true, kind: "fit", report };
      scope.postMessage(reply);
    }
  } catch (error) {
    const reply: MeshJobResponse = { id: job.id, ok: false, error: error instanceof Error ? error.message : String(error) };
    scope.postMessage(reply);
  }
};
