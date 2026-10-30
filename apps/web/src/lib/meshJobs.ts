/**
 * Fork (build 35): runs heavy mesh work in a worker (workers/meshJobs.worker.ts). Where a worker
 * cannot start - an old browser, the tests - the same work runs here as before.
 */
import type { BiteContactMap } from "@/lib/biteContacts";
import type { MeshRoundMode, MeshRoundResult } from "@/lib/meshRound";
import type { FitReport } from "@/lib/partTools";
import type { DentalAnalysis, DentalArchPart, DentalStudioInput, DentalStudioOptions, DentalStudioResult } from "@/lib/dentalModel";
import type { DentalTrimMode, DentalTrimResult } from "@/lib/dentalTrim";
import type { WaxLandmarks, WaxupOptions, WaxupPlan } from "@/lib/dentalWaxup";
import type { ScanTeeth } from "@/lib/toothSegment";
import type { OcclusionInput, OcclusionResult } from "@/lib/waxOcclusion";
/** Build 94: fit the set tooth by tooth to the teeth found: each scan triangle's FDI, the teeth chosen. */
export type WaxTeethFit = { fdi: Uint8Array; chosen: number[]; arch: "upper" | "lower"; ideal?: number; red?: number; centralRatio?: number; arcDepth?: number; adjust?: Record<number, import("@/lib/dentalWaxup").ToothAdjust> };
import type { WorkplaneShape } from "@/types/layerling";
import type { SurfaceTextureOptions, SurfaceTextureResult } from "@/lib/surfaceTexture";
import type { RemeshOptions, RemeshResult } from "@/lib/meshRemesh";

export type MeshJobRequest =
  | { id: number; base: string; kind: "round"; positions: Float32Array; radius: number; mode: MeshRoundMode }
  | { id: number; base: string; kind: "fit"; shapes: WorkplaneShape[]; clearance: number }
  | { id: number; base: string; kind: "dentalAnalyse"; input: DentalStudioInput }
  | { id: number; base: string; kind: "dentalStudio"; input: DentalStudioInput; options: DentalStudioOptions; remoteIndex?: number }
  | { id: number; base: string; kind: "dentalArch"; input: DentalStudioInput; options: DentalStudioOptions; index: number }
  | { id: number; base: string; kind: "dentalTrim"; positions: Float32Array; side: Float32Array; mode: DentalTrimMode; local: Float32Array }
  | { id: number; base: string; kind: "dentalArea"; positions: Float32Array }
  | { id: number; base: string; kind: "waxup"; scan: Float32Array; shells: Float32Array[] | null; landmarks: WaxLandmarks | null; options: Omit<WaxupOptions, "landmarks">; teeth?: WaxTeethFit }
  | { id: number; base: string; kind: "texture"; positions: Float32Array; options: SurfaceTextureOptions }
  | { id: number; base: string; kind: "remesh"; positions: Float32Array; options: RemeshOptions }
  | { id: number; base: string; kind: "biteContacts"; upper: Float32Array; lower: Float32Array }
  | { id: number; base: string; kind: "findTeeth"; scan: Float32Array; arch: "upper" | "lower"; weights: ArrayBuffer | null }
  | { id: number; base: string; kind: "occlusion"; input: OcclusionInput };
export type MeshJobResponse =
  | { id: number; ok: true; kind?: "round"; result: { positions: Float32Array; voxel: number; coarse: boolean } }
  | { id: number; ok: true; kind: "fit"; report: FitReport }
  | { id: number; ok: true; kind: "dentalAnalyse"; analysis: DentalAnalysis }
  | { id: number; ok: true; kind: "dentalStudio"; result: DentalStudioResult }
  | { id: number; ok: true; kind: "dentalArch"; part: DentalArchPart }
  | { id: number; ok: true; kind: "dentalTrim"; trim: DentalTrimResult }
  | { id: number; ok: true; kind: "dentalArea"; area: Uint8Array; crowns: Uint8Array }
  | { id: number; ok: true; kind: "waxup"; plan: WaxupPlan | null; landmarks: WaxLandmarks | null }
  | { id: number; ok: true; kind: "texture"; texture: SurfaceTextureResult }
  | { id: number; ok: true; kind: "biteContacts"; map: BiteContactMap }
  | { id: number; ok: true; kind: "remesh"; remesh: { positions: Float32Array; voxel: number; coarse: boolean; triangles: number } }
  | { id: number; ok: true; kind: "findTeeth"; teeth: ScanTeeth }
  | { id: number; ok: true; kind: "progress"; share: number }
  | { id: number; ok: true; kind: "occlusion"; result: OcclusionResult }
  | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let failed = false;
let nextId = 1;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const progress = new Map<number, (share: number) => void>();

function meshWorker(): Worker | null {
  if (failed || typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/meshJobs.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<MeshJobResponse>) => {
      const reply = event.data;
      if (reply.ok && reply.kind === "progress") { progress.get(reply.id)?.(reply.share); return; }
      const waiting = pending.get(reply.id);
      if (!waiting) return;
      pending.delete(reply.id);
      progress.delete(reply.id);
      if (!reply.ok) waiting.reject(new Error(reply.error));
      else if (reply.kind === "fit") waiting.resolve(reply.report);
      else if (reply.kind === "dentalAnalyse") waiting.resolve(reply.analysis);
      else if (reply.kind === "dentalStudio") waiting.resolve(reply.result);
      else if (reply.kind === "dentalArch") waiting.resolve(reply.part);
      else if (reply.kind === "dentalTrim") waiting.resolve(reply.trim);
      else if (reply.kind === "dentalArea") waiting.resolve({ area: reply.area, crowns: reply.crowns });
      else if (reply.kind === "waxup") waiting.resolve(reply.plan ?? reply.landmarks);
      else if (reply.kind === "texture") waiting.resolve(reply.texture);
      else if (reply.kind === "biteContacts") waiting.resolve(reply.map);
      else if (reply.kind === "findTeeth") waiting.resolve(reply.teeth);
      else if (reply.kind === "occlusion") waiting.resolve(reply.result);
      else if (reply.kind === "remesh") waiting.resolve({ ...reply.remesh, positions: Array.from(reply.remesh.positions) });
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

/** Build 69: Remesh, Offset or Thicken a part (world positions), in the worker when one runs. */
export async function remeshInBackground(positions: ArrayLike<number>, options: RemeshOptions): Promise<RemeshResult> {
  const here = async () => (await import("@/lib/meshRemesh")).remeshPositions(positions, options);
  const target = meshWorker();
  if (!target) return here();
  const id = nextId;
  nextId += 1;
  const data = Float32Array.from(positions as ArrayLike<number>);
  try {
    return await new Promise<RemeshResult>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      const request: MeshJobRequest = { id, base: new URL(".", window.location.href).href, kind: "remesh", positions: data, options };
      target.postMessage(request, [data.buffer]);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "worker-unavailable") return here();
    throw error;
  }
}

/** Fork (build 55): a surface texture on a part (world positions), in the worker when one runs. */
export async function textureMeshInBackground(positions: ArrayLike<number>, options: SurfaceTextureOptions): Promise<SurfaceTextureResult> {
  const here = async () => (await import("@/lib/surfaceTexture")).textureMeshPositions(positions, options);
  const target = meshWorker();
  if (!target) return here();
  const id = nextId;
  nextId += 1;
  const data = Float32Array.from(positions as ArrayLike<number>);
  try {
    return await new Promise<SurfaceTextureResult>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      const request: MeshJobRequest = { id, base: new URL(".", window.location.href).href, kind: "texture", positions: data, options };
      target.postMessage(request, [data.buffer]);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "worker-unavailable") return here();
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

/** Copies of the scans, so the caller's arrays are not handed over to the worker. */
function copiedInput(input: DentalStudioInput): DentalStudioInput {
  return {
    // Build 68: the tooth area fixed by hand goes along too - it was left behind, so in the worker a
    // corrected area was not used.
    // Build 79: and the arch's wax-up teeth.
    arches: input.arches.map((arch) => ({ id: arch.id, positions: Float32Array.from(arch.positions as ArrayLike<number>), ...(arch.area ? { area: Uint8Array.from(arch.area) } : {}), ...(arch.wax?.length ? { wax: Float32Array.from(arch.wax) } : {}), ...(arch.cuts?.length ? { cuts: arch.cuts.map((c) => ({ positions: Float32Array.from(c.positions), facing: [...c.facing] as [number, number, number], through: [...c.through] as [number, number, number], ...(c.cover ? { cover: Float32Array.from(c.cover) } : {}), ...(c.up ? { up: [...c.up] as [number, number, number] } : {}), ...(c.beside ? { beside: c.beside.map((d) => [...d] as [number, number, number]) } : {}) })) } : {}) })),
    bite: input.bite ? Float32Array.from(input.bite as ArrayLike<number>) : null,
    ...(input.bite2 ? { bite2: Float32Array.from(input.bite2 as ArrayLike<number>) } : {}),
    roles: input.roles,
    // Build 74: the bite locked into the arches goes along (dropping it here made the worker fit again).
    ...(input.locked ? { locked: true } : {}),
    // Build 79: "Line up on the bite scan" goes along too - left behind, the worker kept the scanner's bite.
    ...(input.biteMode ? { biteMode: input.biteMode } : {}),
    // Build 101: Wax-up Studio's opened bite goes along too - left behind, the worker made the models closed.
    ...(input.open ? { open: { id: input.open.id, matrix: [...input.open.matrix] } } : {}),
  };
}

/** Runs a Dental Studio job in the worker when one runs, here otherwise (build 47). */
async function dentalJob<T>(request: (id: number, base: string, input: DentalStudioInput) => MeshJobRequest, input: DentalStudioInput, here: (input: DentalStudioInput) => Promise<T>): Promise<T> {
  const target = meshWorker();
  if (!target) return here(input);
  const id = nextId;
  nextId += 1;
  const data = copiedInput(input);
  const buffers = [...data.arches.map((arch) => (arch.positions as Float32Array).buffer), ...(data.bite ? [(data.bite as Float32Array).buffer] : [])];
  try {
    return await new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      target.postMessage(request(id, new URL(".", window.location.href).href, data), buffers);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "worker-unavailable") return here(input);
    throw error;
  }
}

/** Dental Studio: cleans the scans, tells upper from lower, finds the bite (Z-up positions). */
export function analyseDentalInBackground(input: DentalStudioInput): Promise<DentalAnalysis> {
  return dentalJob((id, base, data) => ({ id, base, kind: "dentalAnalyse", input: data }), input, async (data) => (await import("@/lib/dentalModel")).analyseDental(data));
}

/**
 * Build 68: a second worker for Dental Studio, which makes the lower of a pair while the first
 * worker makes the upper and then puts the two together. Started once, kept for the next pair.
 */
let helper: Worker | null = null;
let helperFailed = false;
const helperJobs = new Set<number>();

function helperWorker(): Worker | null {
  if (helperFailed || typeof Worker === "undefined") return null;
  if (helper) return helper;
  try {
    helper = new Worker(new URL("../workers/meshJobs.worker.ts", import.meta.url), { type: "module" });
    helper.onmessage = (event: MessageEvent<MeshJobResponse>) => {
      const reply = event.data;
      if (reply.ok && reply.kind === "progress") { progress.get(reply.id)?.(reply.share); return; }
      const waiting = pending.get(reply.id);
      if (!waiting) return;
      pending.delete(reply.id);
      progress.delete(reply.id);
      if (!reply.ok) waiting.reject(new Error(reply.error));
      else if (reply.kind === "dentalArch") waiting.resolve(reply.part);
      else waiting.reject(new Error("unexpected reply"));
    };
    helper.onerror = () => {
      // The arch it was making is made by the main worker instead.
      helperFailed = true;
      helper?.terminate();
      helper = null;
      helperJobs.forEach((jobId) => {
        const waiting = pending.get(jobId);
        pending.delete(jobId);
        waiting?.reject(new Error("worker-unavailable"));
      });
      helperJobs.clear();
    };
    return helper;
  } catch {
    helperFailed = true;
    return null;
  }
}

/**
 * Build 79: stops every job running in the background (Dental Studio's Cancel while making): the
 * workers are ended, so the work stops at once, and what was waiting is turned down with "stopped".
 * The next job starts fresh workers.
 */
export function stopMeshJobs() {
  worker?.terminate();
  worker = null;
  helper?.terminate();
  helper = null;
  helperJobs.clear();
  const stranded = [...pending.values()];
  pending.clear();
  stranded.forEach((waiting) => waiting.reject(new Error("stopped")));
}

function archPartBuffers(part: DentalArchPart): ArrayBuffer[] {
  const buffers = [part.mesh.vertProperties.buffer, part.mesh.triVerts.buffer];
  if (part.mesh.mergeFromVert) buffers.push(part.mesh.mergeFromVert.buffer);
  if (part.mesh.mergeToVert) buffers.push(part.mesh.mergeToVert.buffer);
  return buffers as ArrayBuffer[];
}

/** Dental Studio: makes the models (Z-up positions) - a pair's two arches side by side in two workers (build 68). */
export async function makeDentalStudioInBackground(input: DentalStudioInput, options: DentalStudioOptions): Promise<DentalStudioResult> {
  const main = meshWorker();
  const second = input.arches.length === 2 && main ? helperWorker() : null;
  if (!main || !second) {
    return dentalJob((id, base, data) => ({ id, base, kind: "dentalStudio", input: data, options }), input, async (data) => (await import("@/lib/dentalModel")).makeDentalStudio(data, options));
  }
  const base = new URL(".", window.location.href).href;
  const id = nextId;
  const partId = nextId + 1;
  nextId += 2;
  const buffersOf = (data: DentalStudioInput) => [
    ...data.arches.flatMap((arch) => [(arch.positions as Float32Array).buffer, ...(arch.area ? [arch.area.buffer] : [])]),
    ...(data.bite ? [(data.bite as Float32Array).buffer] : []),
  ] as ArrayBuffer[];
  // The lower (index 1) in the helper; whatever it brings, or that it failed, goes on to the main worker.
  const forHelper = copiedInput(input);
  new Promise<DentalArchPart>((resolve, reject) => {
    helperJobs.add(partId);
    pending.set(partId, { resolve: (value: unknown) => { helperJobs.delete(partId); resolve(value as DentalArchPart); }, reject: (error: Error) => { helperJobs.delete(partId); reject(error); } });
    second.postMessage({ id: partId, base, kind: "dentalArch", input: forHelper, options, index: 1 } satisfies MeshJobRequest, buffersOf(forHelper));
  }).then(
    (part) => main.postMessage({ archPartFor: id, part }, archPartBuffers(part)),
    (error) => main.postMessage({ archPartFor: id, error: error instanceof Error ? error.message : String(error) }),
  );
  const data = copiedInput(input);
  try {
    return await new Promise<DentalStudioResult>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      main.postMessage({ id, base, kind: "dentalStudio", input: data, options, remoteIndex: 1 } satisfies MeshJobRequest, buffersOf(data));
    });
  } catch (error) {
    if (error instanceof Error && error.message === "worker-unavailable") return (await import("@/lib/dentalModel")).makeDentalStudio(input, options);
    throw error;
  }
}

/** Dental Studio (build 48/52): a scan cut along a trim line (Z-up soup, how far inside the line each corner is, and the soup in the part's own coordinates). */
export async function trimDentalScanInBackground(positions: Float32Array, side: Float32Array, mode: DentalTrimMode, local: Float32Array): Promise<DentalTrimResult> {
  const here = async () => (await import("@/lib/dentalTrim")).cutDentalScan(positions, side, mode, local);
  const target = meshWorker();
  if (!target) return here();
  const id = nextId;
  nextId += 1;
  const data = Float32Array.from(positions), sides = Float32Array.from(side), own = Float32Array.from(local);
  try {
    return await new Promise<DentalTrimResult>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      target.postMessage({ id, base: new URL(".", window.location.href).href, kind: "dentalTrim", positions: data, side: sides, mode, local: own } satisfies MeshJobRequest, [data.buffer, sides.buffer, own.buffer]);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "worker-unavailable") return here();
    throw error;
  }
}

/**
 * Dental Studio (build 53): the teeth Pare 3D finds on a scan (Z-up soup), one flag per triangle;
 * with (build 76) the crowns alone, for Trim's warning.
 */
/** Build 84: the bite contacts & clearance map of two arches in the bite (world triangle soups), off the page. */
export async function biteContactsInBackground(upper: Float32Array, lower: Float32Array): Promise<BiteContactMap> {
  const here = async () => (await import("@/lib/biteContacts")).biteContactMap(upper, lower);
  const target = meshWorker();
  if (!target) return here();
  const id = nextId;
  nextId += 1;
  const a = Float32Array.from(upper), b = Float32Array.from(lower);
  try {
    return await new Promise<BiteContactMap>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      target.postMessage({ id, base: new URL(".", window.location.href).href, kind: "biteContacts", upper: a, lower: b } satisfies MeshJobRequest, [a.buffer, b.buffer]);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "worker-unavailable") return here();
    throw error;
  }
}

export async function dentalAreaInBackground(positions: Float32Array): Promise<{ area: Uint8Array; crowns: Uint8Array }> {
  const here = async () => {
    const crowns = new Uint8Array(Math.floor(positions.length / 9));
    return { area: (await import("@/lib/dentalArea")).autoDentalArea(positions, crowns), crowns };
  };
  const target = meshWorker();
  if (!target) return here();
  const id = nextId;
  nextId += 1;
  const data = Float32Array.from(positions);
  try {
    return await new Promise<{ area: Uint8Array; crowns: Uint8Array }>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      target.postMessage({ id, base: new URL(".", window.location.href).href, kind: "dentalArea", positions: data } satisfies MeshJobRequest, [data.buffer]);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "worker-unavailable") return here();
    throw error;
  }
}

/**
 * Build 79: the wax-up of a tooth set on a scan (Z-up soup, the studio's input coordinates), from the
 * landmarks in those coordinates; without `shells`, only the first guess at the landmarks.
 */
export function waxupInBackground(scan: Float32Array, shells: Float32Array[], landmarks: WaxLandmarks | null, options?: Omit<WaxupOptions, "landmarks">, teeth?: WaxTeethFit): Promise<WaxupPlan>;
export function waxupInBackground(scan: Float32Array, shells: null): Promise<WaxLandmarks | null>;
export async function waxupInBackground(scan: Float32Array, shells: Float32Array[] | null, landmarks: WaxLandmarks | null = null, options: Omit<WaxupOptions, "landmarks"> = {}, teeth?: WaxTeethFit): Promise<WaxupPlan | WaxLandmarks | null> {
  const here = async () => {
    const { guessLandmarks, planWaxup, planWaxupOnTeeth } = await import("@/lib/dentalWaxup");
    if (shells && teeth) return planWaxupOnTeeth(scan, shells, teeth.fdi, teeth.chosen, teeth.arch, { lengthen: options.lengthen, ideal: teeth.ideal, red: teeth.red, centralRatio: teeth.centralRatio, arcDepth: teeth.arcDepth, adjust: teeth.adjust });
    return shells ? planWaxup(scan, shells, landmarks, options) : guessLandmarks(scan);
  };
  const target = meshWorker();
  if (!target) return here();
  const id = nextId;
  nextId += 1;
  try {
    return await new Promise<WaxupPlan | WaxLandmarks | null>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      target.postMessage({ id, base: new URL(".", window.location.href).href, kind: "waxup", scan, shells, landmarks, options, ...(teeth ? { teeth } : {}) } satisfies MeshJobRequest);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "worker-unavailable") return here();
    throw error;
  }
}

/**
 * Build 94: finds the teeth on a scan (its soup, own coordinates) with the tooth finder, in the
 * worker. `weights` (a PTW1 file's bytes) are sent the first time; the worker keeps the network.
 * Without a worker it runs here.
 */
let finderHere: import("@/lib/toothNet").ToothNet | null = null;
let finderSent = false;
export async function findTeethInBackground(scan: Float32Array, arch: "upper" | "lower", weights: () => Promise<ArrayBuffer | null>, onProgress?: (share: number) => void): Promise<ScanTeeth> {
  const here = async () => {
    const { readWeights, ToothNet } = await import("@/lib/toothNet");
    const { findTeethOnScan } = await import("@/lib/toothSegment");
    if (!finderHere) { const bytes = await weights(); if (!bytes) throw new Error("tooth-finder-missing"); finderHere = new ToothNet(readWeights(bytes)); }
    return findTeethOnScan(scan, arch, finderHere, onProgress);
  };
  const target = meshWorker();
  if (!target) return here();
  const send = async (withWeights: boolean): Promise<ScanTeeth> => {
    const bytes = withWeights ? await weights() : null;
    if (withWeights && !bytes) throw new Error("tooth-finder-missing");
    const id = nextId;
    nextId += 1;
    return new Promise<ScanTeeth>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      if (onProgress) progress.set(id, onProgress);
      const data = scan.slice();
      const request: MeshJobRequest = { id, base: new URL(".", window.location.href).href, kind: "findTeeth", scan: data, arch, weights: bytes };
      target.postMessage(request, bytes ? [data.buffer, bytes] : [data.buffer]);
    });
  };
  try {
    try {
      const result = await send(!finderSent);
      finderSent = true;
      return result;
    } catch (error) {
      // The worker started afresh and lost the network: send the weights again.
      if (error instanceof Error && error.message === "tooth-finder-missing" && finderSent) { finderSent = false; const result = await send(true); finderSent = true; return result; }
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "worker-unavailable") return here();
    throw error;
  }
}

/** Build 94: new weights loaded - the next finding sends them. */
export function resetToothFinder() { finderHere = null; finderSent = false; }

/** Build 94: the wax-up's occlusion (lib/waxOcclusion, in the studio's coordinates), in the worker when one runs. */
export async function occlusionInBackground(input: OcclusionInput): Promise<OcclusionResult> {
  const here = async () => (await import("@/lib/waxOcclusion")).occlusionInScanFrame(input);
  const target = meshWorker();
  if (!target) return here();
  const id = nextId;
  nextId += 1;
  try {
    return await new Promise<OcclusionResult>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      target.postMessage({ id, base: new URL(".", window.location.href).href, kind: "occlusion", input } satisfies MeshJobRequest);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "worker-unavailable") return here();
    throw error;
  }
}
