/// <reference lib="webworker" />
/**
 * Fork (build 35): heavy mesh work off the page's own thread, so the window keeps answering - and
 * the spinner keeps turning - while a big scan is rounded (that can take half a minute).
 */
import type { DentalArchPart } from "@/lib/dentalModel";
import type { MeshJobRequest, MeshJobResponse } from "@/lib/meshJobs";

const scope = self as unknown as DedicatedWorkerGlobalScope;
/** Build 94: the tooth finder, kept once its weights have come. */
let finder: import("@/lib/toothNet").ToothNet | null = null;

/** Build 68: arches made in the second worker, waited for by the job that puts the pair together. */
const archParts = new Map<number, { resolve: (part: DentalArchPart) => void; reject: (error: Error) => void }>();
const earlyParts = new Map<number, { part?: DentalArchPart; error?: string }>();
function archPartFor(jobId: number): Promise<DentalArchPart> {
  const early = earlyParts.get(jobId);
  if (early) {
    earlyParts.delete(jobId);
    return early.part ? Promise.resolve(early.part) : Promise.reject(new Error(early.error ?? "no arch"));
  }
  return new Promise((resolve, reject) => archParts.set(jobId, { resolve, reject }));
}

scope.onmessage = async (event: MessageEvent<MeshJobRequest | { archPartFor: number; part?: DentalArchPart; error?: string }>) => {
  if ("archPartFor" in event.data) {
    const { archPartFor: jobId, part, error } = event.data;
    const waiting = archParts.get(jobId);
    if (!waiting) { earlyParts.set(jobId, { part, error }); return; }
    archParts.delete(jobId);
    if (part) waiting.resolve(part); else waiting.reject(new Error(error ?? "no arch"));
    return;
  }
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
    } else if (job.kind === "dentalAnalyse") {
      const { analyseDental } = await import("@/lib/dentalModel");
      const analysis = analyseDental(job.input);
      const reply: MeshJobResponse = { id: job.id, ok: true, kind: "dentalAnalyse", analysis };
      scope.postMessage(reply);
    } else if (job.kind === "dentalStudio") {
      const { makeDentalStudio } = await import("@/lib/dentalModel");
      const remote = job.remoteIndex !== undefined ? { index: job.remoteIndex, part: archPartFor(job.id) } : undefined;
      const result = await makeDentalStudio(job.input, job.options, undefined, remote);
      const reply: MeshJobResponse = { id: job.id, ok: true, kind: "dentalStudio", result };
      scope.postMessage(reply, result.parts.map((part) => part.positions.buffer));
    } else if (job.kind === "dentalArch") {
      const { makeDentalArchPart } = await import("@/lib/dentalModel");
      const part = await makeDentalArchPart(job.input, job.options, job.index);
      const reply: MeshJobResponse = { id: job.id, ok: true, kind: "dentalArch", part };
      const buffers: ArrayBuffer[] = [part.mesh.vertProperties.buffer as ArrayBuffer, part.mesh.triVerts.buffer as ArrayBuffer];
      if (part.mesh.mergeFromVert) buffers.push(part.mesh.mergeFromVert.buffer as ArrayBuffer);
      if (part.mesh.mergeToVert) buffers.push(part.mesh.mergeToVert.buffer as ArrayBuffer);
      scope.postMessage(reply, buffers);
    } else if (job.kind === "dentalTrim") {
      const { cutDentalScan } = await import("@/lib/dentalTrim");
      const trim = cutDentalScan(job.positions, job.side, job.mode, job.local);
      delete (trim as { toothCorners?: Uint8Array }).toothCorners;
      const reply: MeshJobResponse = { id: job.id, ok: true, kind: "dentalTrim", trim };
      scope.postMessage(reply, trim.positions ? [trim.keep.buffer, trim.positions.buffer] : [trim.keep.buffer]);
    } else if (job.kind === "waxup") {
      const { guessLandmarks, planWaxup } = await import("@/lib/dentalWaxup");
      const plan = job.shells ? planWaxup(job.scan, job.shells, job.landmarks, job.options) : null;
      const reply: MeshJobResponse = { id: job.id, ok: true, kind: "waxup", plan, landmarks: plan ? plan.landmarks : guessLandmarks(job.scan) };
      scope.postMessage(reply, plan ? plan.teeth.map((tooth) => tooth.positions.buffer as ArrayBuffer) : []);
    } else if (job.kind === "findTeeth") {
      const { readWeights, ToothNet } = await import("@/lib/toothNet");
      const { findTeethOnScan } = await import("@/lib/toothSegment");
      if (job.weights) finder = new ToothNet(readWeights(job.weights));
      if (!finder) throw new Error("tooth-finder-missing");
      const teeth = await findTeethOnScan(job.scan, job.arch, finder, (share) => scope.postMessage({ id: job.id, ok: true, kind: "progress", share } satisfies MeshJobResponse));
      const reply: MeshJobResponse = { id: job.id, ok: true, kind: "findTeeth", teeth };
      scope.postMessage(reply, [teeth.fdi.buffer]);
    } else if (job.kind === "dentalArea") {
      const { autoDentalArea } = await import("@/lib/dentalArea");
      const crowns = new Uint8Array(Math.floor(job.positions.length / 9));
      const area = autoDentalArea(job.positions, crowns);
      const reply: MeshJobResponse = { id: job.id, ok: true, kind: "dentalArea", area, crowns };
      scope.postMessage(reply, [area.buffer, crowns.buffer]);
    } else if (job.kind === "biteContacts") {
      const { biteContactMap } = await import("@/lib/biteContacts");
      const map = biteContactMap(job.upper, job.lower);
      const reply: MeshJobResponse = { id: job.id, ok: true, kind: "biteContacts", map };
      scope.postMessage(reply, [map.upper.buffer as ArrayBuffer, map.lower.buffer as ArrayBuffer]);
    } else if (job.kind === "remesh") {
      const { remeshPositions } = await import("@/lib/meshRemesh");
      const result = await remeshPositions(job.positions, job.options);
      const positions = Float32Array.from(result.positions);
      const reply: MeshJobResponse = { id: job.id, ok: true, kind: "remesh", remesh: { positions, voxel: result.voxel, coarse: result.coarse, triangles: result.triangles } };
      scope.postMessage(reply, [positions.buffer]);
    } else if (job.kind === "texture") {
      const { textureMeshPositions } = await import("@/lib/surfaceTexture");
      const texture = textureMeshPositions(job.positions, job.options);
      const reply: MeshJobResponse = { id: job.id, ok: true, kind: "texture", texture };
      scope.postMessage(reply, [texture.positions.buffer]);
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
