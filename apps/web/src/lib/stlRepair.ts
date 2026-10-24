/**
 * Fork (build 49): the repair engine of Pare's STL View, Repair & Resize (parepdf.app), run in its own
 * worker (public/stl-repair). It joins loose corners, removes broken and doubled triangles, separates
 * edges shared by too many triangles, turns triangles the right way, fills holes, drops loose crumbs,
 * untangles folds and joins the pieces into one solid - rebuilding small areas only where it must.
 * Positions go in and come out as a triangle soup in the caller's axes.
 */
type Reply = { id: number; ok: boolean; error?: string; progress?: string; [key: string]: unknown };

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (value: Reply) => void; reject: (error: Error) => void; progress?: (text: string) => void }>();

function call(type: string, data: Record<string, unknown> = {}, transfer: Transferable[] = [], progress?: (text: string) => void): Promise<Reply> {
  if (!worker) throw new Error("The repair engine is not running");
  const id = nextId;
  nextId += 1;
  return new Promise<Reply>((resolve, reject) => {
    pending.set(id, { resolve, reject, progress });
    worker!.postMessage({ id, type, ...data }, transfer);
  });
}

function start(): Promise<void> {
  if (ready) return ready;
  const base = new URL("/stl-repair/", window.location.href).href;
  worker = new Worker(new URL("pare-mesh-worker.mjs", base), { type: "module" });
  worker.onmessage = (event: MessageEvent<Reply>) => {
    const waiting = pending.get(event.data.id);
    if (!waiting) return;
    if (event.data.progress) { waiting.progress?.(event.data.progress); return; }
    pending.delete(event.data.id);
    if (event.data.ok) waiting.resolve(event.data);
    else waiting.reject(new Error(event.data.error || "The repair failed"));
  };
  worker.onerror = () => {
    pending.forEach((waiting) => waiting.reject(new Error("The repair engine stopped")));
    pending.clear();
    worker?.terminate();
    worker = null;
    ready = null;
  };
  ready = call("init", { base }).then(() => undefined).catch((error) => { ready = null; throw error; });
  return ready;
}

function binaryStl(positions: ArrayLike<number>): ArrayBuffer {
  const count = Math.floor(positions.length / 9);
  const buffer = new ArrayBuffer(84 + count * 50);
  const view = new DataView(buffer);
  view.setUint32(80, count, true);
  for (let t = 0; t < count; t += 1) for (let k = 0; k < 9; k += 1) view.setFloat32(84 + t * 50 + 12 + k * 4, positions[t * 9 + k], true);
  return buffer;
}

function readBinaryStl(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const out = new Float32Array(count * 9);
  for (let t = 0; t < count; t += 1) for (let k = 0; k < 9; k += 1) out[t * 9 + k] = view.getFloat32(84 + t * 50 + 12 + k * 4, true);
  return out;
}

function bounds(positions: ArrayLike<number>) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < positions.length; i += 3) for (let k = 0; k < 3; k += 1) { min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]); }
  return { min, max };
}

export type StlRepairResult = {
  positions: Float32Array;
  /** Nothing needed doing: the part was already a closed, clean solid. */
  unchanged: boolean;
  /** What was done, as the engine words it, with counts. */
  log: Array<[string, number]>;
  /** How far the surface moved, mm. */
  deviation: { max: number; mean: number } | null;
};

export async function repairStlPositions(positions: ArrayLike<number>, onProgress?: (text: string) => void): Promise<StlRepairResult> {
  await start();
  const bytes = binaryStl(positions);
  const opened = await call("open", { bytes, name: "part.stl" }, [bytes], onProgress);
  const report = opened.report as { printable?: boolean; selfIntersecting?: number } | undefined;
  if (report?.printable && !(Number(report.selfIntersecting) > 0)) {
    return { positions: Float32Array.from(positions as ArrayLike<number>), unchanged: true, log: [], deviation: null };
  }
  const repaired = await call("repair", { opts: { fillHoles: true, dropCrumbs: true, rebuild: "auto", cells: 160 } }, [], onProgress);
  const exported = await call("export", { format: "stl" }, [], onProgress);
  const data = exported.data as ArrayBuffer | Uint8Array;
  const out = readBinaryStl(data instanceof Uint8Array ? data : new Uint8Array(data));
  // The engine sets the part down on its centre and floor; it goes back where it was.
  const before = bounds(positions), after = bounds(out);
  const shift = [
    (before.min[0] + before.max[0]) / 2 - (after.min[0] + after.max[0]) / 2,
    (before.min[1] + before.max[1]) / 2 - (after.min[1] + after.max[1]) / 2,
    before.min[2] - after.min[2],
  ];
  for (let i = 0; i + 2 < out.length; i += 3) { out[i] += shift[0]; out[i + 1] += shift[1]; out[i + 2] += shift[2]; }
  const deviation = repaired.deviation as { max: number; mean: number } | undefined;
  return { positions: out, unchanged: false, log: (repaired.log as Array<[string, number]>) ?? [], deviation: deviation ?? null };
}
