/**
 * Pare 3D Wax-up Lab - an isolated test bench for a digital diagnostic wax-up (not part of Pare 3D).
 * Everything runs in this page: scans and libraries are read from the person's own files and never leave it.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MeshBVH } from "three-mesh-bvh";
import manifoldModule from "manifold-3d";
import manifoldWasm from "../../../node_modules/manifold-3d/manifold.wasm";
import { preparedDental, type Prepared } from "@/lib/dentalModel";
import { filesFromRar, libraryFromFiles, type Jaw, type LibraryFile, type ToothLibrary } from "./library";
import { findTeeth, type FoundTeeth } from "./teeth";
import { archCurve, coverTooth, frameCorrection, fitTooth, NO_ADJUST, placeTeeth, PointGrid2, seatTooth, toothExtent, toothMatrix, type Adjust, type ArchCurve, type PlacedTooth } from "./arch";
import { archModel, closedTooth, modelWithTeeth, stlBytes, transformed } from "./solid";

// ---------------------------------------------------------------------------------------------
// State

type ArchState = {
  jaw: Jaw;
  /** Shared (bite) coordinates -> this arch's frame (teeth up). */
  frame: THREE.Matrix4;
  /** The cleaned scan as triangles in shared coordinates. */
  sharedSoup: Float32Array;
  /** The patient's teeth found on the scan, and each scan triangle's first vertex (for colouring). */
  found: (FoundTeeth & { curve: ArchCurve }) | null;
  faces: Uint32Array;
  /** A quadrant or sextant scan: a diagnostic wax-up needs the full arch, so none is placed. */
  partial: boolean;
  /** The same in the arch frame. */
  soup: Float32Array;
  points: Float32Array;
  curve: ArchCurve;
  grid: PointGrid2;
  bvh: MeshBVH;
  bite?: THREE.Matrix4;
  teeth: PlacedTooth[];
  waxed: Set<number>;
};

const state: {
  prepared: Prepared | null;
  arches: Partial<Record<Jaw, ArchState>>;
  inOcclusion: boolean;
  library: ToothLibrary | null;
  libraries: ToothLibrary[];
  jaw: Jaw;
  selected: number | null;
  mirror: boolean;
  lastPosition: number;
  rightSide: -1 | 1;
  colour: "wax" | "contact" | "off";
  showAntagonist: boolean;
  fitTeeth: boolean;
} = { prepared: null, arches: {}, inOcclusion: false, library: null, libraries: [], jaw: "upper", selected: null, mirror: true, lastPosition: 7, rightSide: 1, colour: "wax", showAntagonist: false, fitTeeth: true };

let manifold: Awaited<ReturnType<typeof manifoldModule>> | null = null;
async function runtime() {
  if (!manifold) {
    manifold = await manifoldModule({ wasmBinary: manifoldWasm.slice().buffer } as never);
    manifold.setup();
  }
  return manifold;
}

// ---------------------------------------------------------------------------------------------
// Scene

const view = document.getElementById("view") as HTMLDivElement;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef1f5);
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2000);
camera.up.set(0, 0, 1);
camera.position.set(0, -160, 120);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(-60, -120, 160);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.6);
fill.position.set(80, 100, 60);
scene.add(fill);
const scanGroup = new THREE.Group(), toothGroup = new THREE.Group(), antagonistGroup = new THREE.Group();
scene.add(scanGroup, toothGroup, antagonistGroup);

function resize(): void {
  const r = view.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.updateProjectionMatrix();
  redraw();
}
new ResizeObserver(resize).observe(view);
resize();
// Drawn only when something changes: a full scan is hundreds of thousands of triangles.
var drawQueued = false; // eslint-disable-line no-var -- read by resize() before this line runs
function redraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; renderer.render(scene, camera); });
}
controls.addEventListener("change", redraw);
new MutationObserver(redraw).observe(document.body, { subtree: true, childList: true });

function soupGeometry(soup: Float32Array) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(soup, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------
// UI helpers

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = (text: string, busy = false) => { $("status").textContent = text; $("status").classList.toggle("busy", busy); };
const later = () => new Promise((done) => setTimeout(done, 30));
function anchorDownload(name: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "model/stl" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** A zip with the files stored as they are (STL compresses little and the models are large). */
function zipStored(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  const crc = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i += 1) c = table[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = enc.encode(file.name), sum = crc(file.bytes), size = file.bytes.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint32(14, sum, true); local.setUint32(18, size, true); local.setUint32(22, size, true); local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, file.bytes);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, sum, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + size;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of all) { out.set(b, at); at += b.length; }
  return out;
}

type Downloads = { save(request: { filename: string; data: Blob }): Promise<unknown> };
let downloadsCapability: Promise<Downloads | null> | null = null;
function downloads(): Promise<Downloads | null> {
  const claude = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
  if (!claude?.use) return Promise.resolve(null);
  return (downloadsCapability ??= claude.use("downloads").then((d) => (d as Downloads | null) ?? null).catch(() => null));
}

/**
 * Hand the files to the person. As a published page the viewer saves them through Claude (one zip:
 * STL is not a type it hands over on its own); opened as a plain file, each STL downloads.
 */
async function saveFiles(files: { name: string; bytes: Uint8Array }[], zipName: string): Promise<boolean> {
  const viewer = await downloads();
  if (!viewer) { files.forEach((file) => anchorDownload(file.name, file.bytes)); return true; }
  try {
    await viewer.save({ filename: zipName, data: new Blob([zipStored(files) as BlobPart]) });
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    status(code === "declined" ? "Not saved." : code === "rate_limited" ? "A save is already waiting for an answer." : "Saving files is not available in this view.");
    return false;
  }
}

function stlSoup(bytes: Uint8Array): Float32Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = dv.getUint32(80, true);
  if (84 + n * 50 === bytes.length) {
    const out = new Float32Array(n * 9);
    for (let t = 0; t < n; t += 1) for (let k = 0; k < 9; k += 1) out[t * 9 + k] = dv.getFloat32(84 + t * 50 + 12 + k * 4, true);
    return out;
  }
  const text = new TextDecoder().decode(bytes);
  const out: number[] = [];
  for (const m of text.matchAll(/vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g)) out.push(+m[1], +m[2], +m[3]);
  return Float32Array.from(out);
}

// ---------------------------------------------------------------------------------------------
// Step 1: scans

async function loadScans(files: File[]) {
  const named = await Promise.all(files.map(async (file) => ({ name: file.name, soup: stlSoup(new Uint8Array(await file.arrayBuffer())) })));
  const bite = named.find((f) => /bite|occlusion|buccal/i.test(f.name));
  const arches = named.filter((f) => f !== bite).slice(0, 2);
  if (!arches.length) { status("Choose the upper and lower scans (STL), and the bite scan if there is one."); return; }
  status(`Setting up ${arches.length === 2 ? "the pair" : "the arch"}${bite ? " on the bite scan" : ""}...`, true);
  await later();
  const roles: Record<string, "upper" | "lower"> = {};
  arches.forEach((f, i) => { if (/upper|maxill|_u[_.]/i.test(f.name)) roles[`a${i}`] = "upper"; else if (/lower|mandib|_l[_.]/i.test(f.name)) roles[`a${i}`] = "lower"; });
  const input = { arches: arches.map((f, i) => ({ id: `a${i}`, positions: f.soup })), bite: bite?.soup ?? null, roles };
  const started = performance.now();
  const prepared = preparedDental(input);
  state.prepared = prepared;
  state.arches = {};
  state.inOcclusion = Boolean(prepared.analysis.pair?.inOcclusion && !prepared.analysis.pair?.apart);
  const frameNotes: string[] = [];
  // Each arch's frame correction. In a pair the turns mirror each other (the upper's frame is the
  // lower's turned over), so when they disagree the arch with the clearer open back decides.
  const studioPointsOf = (arch: (typeof prepared.arches)[number]) => {
    const m = arch.clean.mesh, p = new THREE.Vector3(), out = new Float32Array(m.v.length);
    for (let i = 0; i < m.v.length; i += 3) { p.set(m.v[i], m.v[i + 1], m.v[i + 2]).applyMatrix4(arch.frame); out[i] = p.x; out[i + 1] = p.y; out[i + 2] = p.z; }
    return out;
  };
  const corrections = prepared.arches.map((arch) => frameCorrection(studioPointsOf(arch), Math.max(1, Math.min(4, arch.above))));
  if (corrections.length === 2) {
    const [c0, c1] = corrections;
    const apart = Math.abs(Math.atan2(Math.sin(c0.turn + c1.turn), Math.cos(c0.turn + c1.turn)));
    if (apart > (30 * Math.PI) / 180) {
      // A partial scan (a quadrant or a sextant) has no open back to find: the full arch decides.
      const score = (i: number) => (prepared.arches[i].partial ? -1 : corrections[i].gap);
      const lead = score(0) >= score(1) ? 0 : 1, other = 1 - lead;
      const arch = prepared.arches[other];
      corrections[other] = frameCorrection(studioPointsOf(arch), Math.max(1, Math.min(4, arch.above)), -corrections[lead].turn);
    }
  }
  for (const [index, arch] of prepared.arches.entries()) {
    const jaw: Jaw = arch.role === "upper" ? "upper" : "lower";
    const m = arch.clean.mesh;
    const shared = new Float32Array(m.f.length * 3);
    for (let t = 0; t < m.f.length; t += 1) { shared[t * 3] = m.v[m.f[t] * 3]; shared[t * 3 + 1] = m.v[m.f[t] * 3 + 1]; shared[t * 3 + 2] = m.v[m.f[t] * 3 + 2]; }
    const p = new THREE.Vector3();
    // Cusps lie within a few mm of the occlusal plane; a taller "above" is a tissue flap or the tongue.
    const correction = corrections[index];
    const frame = correction.fix.clone().multiply(arch.frame);
    if (correction.note) frameNotes.push(`${jaw} ${correction.note}`);
    const soup = shared.slice();
    for (let i = 0; i < soup.length; i += 3) { p.set(soup[i], soup[i + 1], soup[i + 2]).applyMatrix4(frame); soup[i] = p.x; soup[i + 1] = p.y; soup[i + 2] = p.z; }
    const points = new Float32Array(m.v.length);
    for (let i = 0; i < m.v.length; i += 3) { p.set(m.v[i], m.v[i + 1], m.v[i + 2]).applyMatrix4(frame); points[i] = p.x; points[i + 1] = p.y; points[i + 2] = p.z; }
    const curve = archCurve(points, Math.max(1, Math.min(4, correction.above)));
    // A full arch reaches well out on both sides of the midline; a quadrant or sextant does not.
    const ends = [curve.pts[0][0], curve.pts[curve.pts.length - 1][0]];
    const isPartial = !(Math.min(...ends) < -12 && Math.max(...ends) > 12);
    if (isPartial) frameNotes.push(`the ${jaw} is a partial scan, so it is shown but not waxed`);
    const geometry = soupGeometry(soup);
    state.arches[jaw] = { jaw, frame, sharedSoup: shared, soup, points, curve, grid: new PointGrid2(points, 1), bvh: new MeshBVH(geometry), bite: arch.bite, partial: isPartial, found: isPartial ? null : findTeeth(points, curve, jaw, -1), faces: m.f, teeth: [], waxed: new Set() };
  }
  const pair = prepared.analysis.pair;
  const fit = pair?.bite ? (pair.bite.fitted ? `fitted to the bite scan (RMS ${pair.bite.rms.toFixed(2)} mm)` : "the bite scan could not be fitted") : pair ? (pair.inOcclusion ? "in occlusion as scanned" : "not in occlusion") : "one arch";
  status(`Scans set up in ${((performance.now() - started) / 1000).toFixed(1)} s: ${Object.keys(state.arches).join(" and ")}, ${fit}${frameNotes.length ? ` (${frameNotes.join("; ")})` : ""}.`);
  state.jaw = state.arches.upper ? "upper" : "lower";
  renderArchChoice();
  showArch();
  if (state.library) autoPlace();
}

// ---------------------------------------------------------------------------------------------
// Step 2: library

async function loadLibraries(files: File[]) {
  status("Reading the library...", true);
  await later();
  const loose: LibraryFile[] = [];
  for (const file of files) {
    const data = new Uint8Array(await file.arrayBuffer());
    if (/\.rar$/i.test(file.name)) {
      try {
        const inner = await filesFromRar(data);
        const lib = libraryFromFiles(inner, file.name.replace(/\.rar$/i, ""));
        if (!state.libraries.some((l) => l.name === lib.name)) state.libraries.push(lib);
      } catch (error) {
        status(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      loose.push({ path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, data });
    }
  }
  if (loose.length) {
    try {
      const lib = libraryFromFiles(loose, "Library");
      if (!state.libraries.some((l) => l.name === lib.name)) state.libraries.push(lib);
    } catch (error) {
      status(error instanceof Error ? error.message : String(error));
    }
  }
  state.library = state.libraries.at(-1) ?? null;
  renderLibraries();
  if (state.library) {
    status(`Library "${state.library.name}": ${state.library.teeth.upper.size} upper and ${state.library.teeth.lower.size} lower teeth${state.library.bow.upper ? ", with its tooth bow" : ", no tooth bow (teeth stand upright)"}.`);
    if (Object.keys(state.arches).length) autoPlace();
  }
}

function renderLibraries() {
  const list = $("libraries");
  list.innerHTML = "";
  for (const lib of state.libraries) {
    const b = document.createElement("button");
    b.className = `lib ${lib === state.library ? "active" : ""}`;
    b.innerHTML = `${lib.preview ? `<img src="${lib.preview}" alt="">` : ""}<span>${lib.name}</span>`;
    b.onclick = () => { state.library = lib; renderLibraries(); if (Object.keys(state.arches).length) autoPlace(); };
    list.appendChild(b);
  }
}

// ---------------------------------------------------------------------------------------------
// Step 3: the wax-up

function current(): ArchState | undefined {
  return state.arches[state.jaw];
}

function autoPlace() {
  const arch = current();
  if (!arch || !state.library) return;
  if (!state.library.teeth[state.jaw].size) { status(`This library has no ${state.jaw} teeth.`); return; }
  if (arch.partial) { arch.teeth = []; arch.waxed = new Set(); renderTeeth(); renderChips(); status(`The ${state.jaw} scan is a partial arch. A diagnostic wax-up needs a full-arch scan, so no teeth are placed on it.`); return; }
  const started = performance.now();
  arch.teeth = placeTeeth(state.library, state.jaw, arch.curve, { lastPosition: state.lastPosition, rightSide: state.rightSide });
  if (!arch.waxed.size || ![...arch.waxed].some((fdi) => arch.teeth.some((t) => t.fdi === fdi))) arch.waxed = new Set(arch.teeth.filter((t) => t.position <= 3).map((t) => t.fdi));
  let fitted = 0;
  for (const tooth of arch.teeth) if (settle(tooth, arch)) fitted += 1;
  state.selected = null;
  status(`${arch.teeth.length} teeth placed along the arch (${arch.curve.length.toFixed(0)} mm, size ${(arch.teeth[0]?.scale * 100).toFixed(0)}%)${state.fitTeeth ? `, ${fitted} fitted onto the scanned teeth` : ""} in ${(performance.now() - started).toFixed(0)} ms. Waxing ${arch.waxed.size}.`);
  renderTeeth();
  renderChips();
  renderSelected();
}

/** Seated over the scanned tooth, fitted onto it (when on), then moved out to cover it. */
function settle(tooth: PlacedTooth, arch: ArchState): boolean {
  seatTooth(tooth, arch.grid);
  const fitted = state.fitTeeth && fitTooth(tooth, arch.bvh as never);
  coverTooth(tooth, (p) => signedDistance(arch.bvh, p), 0.3);
  return fitted;
}

function showArch() {
  const arch = current();
  scanGroup.clear();
  antagonistGroup.clear();
  if (!arch) return;
  const geometry = soupGeometry(arch.soup);
  scanGroup.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xd9c9c2, roughness: 0.75, metalness: 0, vertexColors: Boolean(arch.found && $<HTMLInputElement>("show-found").checked) })));
  // The arch curve the teeth are spaced along, just above the cusps.
  const shown = arch.found && $<HTMLInputElement>("show-found").checked ? arch.found.curve : arch.curve;
  const line = new THREE.BufferGeometry().setFromPoints(shown.pts.map(([x, y]) => new THREE.Vector3(x, y, arch.curve.zTop + 0.5)));
  scanGroup.add(new THREE.Line(line, new THREE.LineBasicMaterial({ color: 0x2f6fde })));
  if (arch.found && $<HTMLInputElement>("show-found").checked) showFound(arch, geometry);
  const other = state.arches[state.jaw === "upper" ? "lower" : "upper"];
  if (other && state.inOcclusion && state.showAntagonist) {
    const soup = other.sharedSoup.slice();
    const p = new THREE.Vector3();
    for (let i = 0; i < soup.length; i += 3) { p.set(soup[i], soup[i + 1], soup[i + 2]).applyMatrix4(arch.frame); soup[i] = p.x; soup[i + 1] = p.y; soup[i + 2] = p.z; }
    antagonistGroup.add(new THREE.Mesh(soupGeometry(soup), new THREE.MeshStandardMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.45, depthWrite: false })));
  }
  renderTeeth();
  setView("occlusal");
}

const TOOTH_COLOURS = [0xe8b4a0, 0x9fc4e8, 0xb8dca0, 0xe8d58f, 0xc9a9e0, 0x8fd6cf, 0xf0a8c0, 0xa8b4f0];
/** The teeth found on the scan: each crown in its own colour, contacts, long axes and numbers. */
function showFound(arch: ArchState, geometry: THREE.BufferGeometry) {
  const found = arch.found!;
  const colours = new Float32Array(arch.soup.length);
  const gum = new THREE.Color(0xd9c9c2), c = new THREE.Color();
  for (let t = 0; t < arch.faces.length / 3; t += 1) {
    const owner = found.vertexTooth[arch.faces[t * 3]];
    if (owner >= 0) c.setHex(TOOTH_COLOURS[found.teeth[owner].position % TOOTH_COLOURS.length] ?? 0xffffff); else c.copy(gum);
    for (let k = 0; k < 3; k += 1) { colours[t * 9 + k * 3] = c.r; colours[t * 9 + k * 3 + 1] = c.g; colours[t * 9 + k * 3 + 2] = c.b; }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const dot = new THREE.SphereGeometry(0.45, 12, 8);
  const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xd23c3c });
  for (const tooth of found.teeth) {
    for (const p of [tooth.mesial, tooth.distal]) { const m = new THREE.Mesh(dot, dotMaterial); m.position.copy(p); scanGroup.add(m); }
    const axis = new THREE.BufferGeometry().setFromPoints([tooth.tip.clone().addScaledVector(tooth.axis, -tooth.height), tooth.tip.clone().addScaledVector(tooth.axis, 2)]);
    scanGroup.add(new THREE.Line(axis, new THREE.LineBasicMaterial({ color: 0x1d2430 })));
    scanGroup.add(label(String(tooth.fdi), tooth.tip.clone().add(new THREE.Vector3(0, 0, 3))));
  }
}
function label(text: string, at: THREE.Vector3) {
  const canvas = document.createElement("canvas");
  canvas.width = 64; canvas.height = 40;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillRect(0, 0, 64, 40);
  ctx.fillStyle = "#1d2430"; ctx.font = "bold 26px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 32, 21);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.position.copy(at);
  sprite.scale.set(4.2, 2.6, 1);
  return sprite;
}

let antagonistBvh: { jaw: Jaw; bvh: MeshBVH } | null = null;
function antagonist(): MeshBVH | null {
  const arch = current();
  const other = state.arches[state.jaw === "upper" ? "lower" : "upper"];
  if (!arch || !other || !state.inOcclusion) return null;
  if (antagonistBvh?.jaw === state.jaw) return antagonistBvh.bvh;
  const soup = other.sharedSoup.slice();
  const p = new THREE.Vector3();
  for (let i = 0; i < soup.length; i += 3) { p.set(soup[i], soup[i + 1], soup[i + 2]).applyMatrix4(arch.frame); soup[i] = p.x; soup[i + 1] = p.y; soup[i + 2] = p.z; }
  antagonistBvh = { jaw: state.jaw, bvh: new MeshBVH(soupGeometry(soup)) };
  return antagonistBvh.bvh;
}

const toothMaterial = new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.45, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
const ghostMaterial = new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.5, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });

/** Signed distance of each corner from a surface: + outside (along its face normal), - inside. */
function signedDistances(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, bvh: MeshBVH, limit = 3): Float32Array {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const out = new Float32Array(pos.count);
  const p = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const scanPos = (bvh.geometry.getAttribute("position") as THREE.BufferAttribute);
  const index = bvh.geometry.index;
  for (let i = 0; i < pos.count; i += 1) {
    p.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    const hit = bvh.closestPointToPoint(p, target as never, 0, limit) as typeof target | null;
    if (!hit) { out[i] = limit; continue; }
    const f = hit.faceIndex * 3;
    const ia = index ? index.getX(f) : f, ib = index ? index.getX(f + 1) : f + 1, ic = index ? index.getX(f + 2) : f + 2;
    a.fromBufferAttribute(scanPos, ia); b.fromBufferAttribute(scanPos, ib); c.fromBufferAttribute(scanPos, ic);
    n.subVectors(b, a).cross(c.sub(a));
    out[i] = Math.sign(p.clone().sub(hit.point).dot(n) || 1) * hit.distance;
  }
  return out;
}

/** Signed distance of one point from a scan (+ outside along its face normal), within 3 mm. */
function signedDistance(bvh: MeshBVH, p: THREE.Vector3): number {
  const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const hit = bvh.closestPointToPoint(p, target as never, 0, 3) as typeof target | null;
  if (!hit) return 3;
  const pos = bvh.geometry.getAttribute("position") as THREE.BufferAttribute;
  const index = bvh.geometry.index;
  const f = hit.faceIndex * 3;
  const a = new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(f) : f);
  const b = new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(f + 1) : f + 1);
  const c = new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(f + 2) : f + 2);
  const n = b.sub(a).cross(c.sub(a));
  return Math.sign(p.clone().sub(hit.point).dot(n) || 1) * hit.distance;
}

const COLD = new THREE.Color(0xf4efe4);
function colourTooth(mesh: THREE.Mesh, tooth: PlacedTooth) {
  const arch = current();
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const count = geometry.getAttribute("position").count;
  const colours = new Float32Array(count * 3);
  const set = (i: number, c: THREE.Color) => { colours[i * 3] = c.r; colours[i * 3 + 1] = c.g; colours[i * 3 + 2] = c.b; };
  for (let i = 0; i < count; i += 1) set(i, COLD);
  const matrix = toothMatrix(tooth);
  if (arch && state.colour === "wax") {
    // Wax thickness over the scanned tooth: grey where the library tooth lies inside it (no wax there).
    const d = signedDistances(geometry, matrix, arch.bvh);
    const grey = new THREE.Color(0xa7a29a), thin = new THREE.Color(0xf2c94c), mid = new THREE.Color(0x7bc67e), thick = new THREE.Color(0x4a90d9), tmp = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const t = d[i];
      if (t < 0) set(i, grey);
      else if (t < 0.3) set(i, tmp.copy(thin));
      else if (t < 1) set(i, tmp.copy(thin).lerp(mid, (t - 0.3) / 0.7));
      else set(i, tmp.copy(mid).lerp(thick, Math.min(1, (t - 1) / 1.5)));
    }
  } else if (state.colour === "contact") {
    const bvh = antagonist();
    if (bvh) {
      const d = signedDistances(geometry, matrix, bvh);
      const red = new THREE.Color(0xd64545), amber = new THREE.Color(0xf2994a), green = new THREE.Color(0x7bc67e);
      for (let i = 0; i < count; i += 1) {
        const t = d[i];
        if (t < 0) set(i, red);
        else if (t < 0.1) set(i, amber);
        else if (t < 0.5) set(i, green);
      }
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
}

const meshes = new Map<number, THREE.Mesh>();
function renderTeeth(only?: number[]) {
  const arch = current();
  if (!only) { toothGroup.clear(); meshes.clear(); }
  if (!arch) return;
  for (const tooth of arch.teeth) {
    if (only && !only.includes(tooth.fdi)) continue;
    const waxed = arch.waxed.has(tooth.fdi);
    let mesh = meshes.get(tooth.fdi);
    if (!mesh) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(tooth.mesh.v, 3));
      g.setIndex(new THREE.BufferAttribute(tooth.mesh.f, 1));
      g.computeVertexNormals();
      mesh = new THREE.Mesh(g, waxed ? toothMaterial : ghostMaterial);
      mesh.matrixAutoUpdate = false;
      mesh.userData.fdi = tooth.fdi;
      meshes.set(tooth.fdi, mesh);
      toothGroup.add(mesh);
    }
    mesh.material = waxed ? toothMaterial : ghostMaterial;
    mesh.visible = waxed || $<HTMLInputElement>("show-unwaxed").checked;
    mesh.matrix.copy(toothMatrix(tooth));
    mesh.matrixWorldNeedsUpdate = true;
    if (waxed) colourTooth(mesh, tooth);
    const selected = state.selected === tooth.fdi;
    (mesh as THREE.Mesh & { outline?: THREE.LineSegments }).outline?.removeFromParent();
    if (selected) {
      const box = new THREE.BoxHelper(mesh, 0x2f6fde);
      (mesh as THREE.Mesh & { outline?: THREE.LineSegments }).outline = box;
      toothGroup.add(box);
    }
  }
  redraw();
}

function renderChips() {
  const arch = current();
  const box = $("chips");
  box.innerHTML = "";
  if (!arch) return;
  for (const tooth of arch.teeth) {
    const b = document.createElement("button");
    b.textContent = String(tooth.fdi);
    b.className = `chip ${arch.waxed.has(tooth.fdi) ? "on" : ""} ${state.selected === tooth.fdi ? "sel" : ""}`;
    b.title = "Click: wax it or not. Shift-click: select it to adjust.";
    b.onclick = (event) => {
      if (event.shiftKey || arch.waxed.has(tooth.fdi) && state.selected !== tooth.fdi && event.altKey) { select(tooth.fdi); return; }
      if (arch.waxed.has(tooth.fdi)) arch.waxed.delete(tooth.fdi); else arch.waxed.add(tooth.fdi);
      renderTeeth([tooth.fdi]);
      renderChips();
    };
    box.appendChild(b);
  }
}

function select(fdi: number | null) {
  state.selected = fdi;
  renderTeeth();
  renderChips();
  renderSelected();
}

const SLIDERS: Array<[keyof Adjust, string, number, number, number, string]> = [
  ["buccal", "Buccal / lingual", -2, 2, 0.05, "mm"],
  ["up", "Incisal / gingival", -3, 3, 0.05, "mm"],
  ["mesial", "Mesial / distal", -2, 2, 0.05, "mm"],
  ["rotate", "Rotation", -25, 25, 0.5, "°"],
  ["tip", "Tip (angulation)", -15, 15, 0.5, "°"],
  ["torque", "Torque (inclination)", -15, 15, 0.5, "°"],
  ["width", "Width", 0.8, 1.25, 0.01, "×"],
  ["length", "Length", 0.8, 1.25, 0.01, "×"],
];

function partner(fdi: number) {
  const q = Math.floor(fdi / 10), n = fdi % 10;
  const other = { 1: 2, 2: 1, 3: 4, 4: 3 }[q as 1 | 2 | 3 | 4];
  return other * 10 + n;
}

function renderSelected() {
  const arch = current();
  const panel = $("selected");
  const tooth = arch?.teeth.find((t) => t.fdi === state.selected);
  if (!tooth || !arch) { panel.innerHTML = `<p class="hint">Click a tooth in the view to adjust it.</p>`; return; }
  const ext = toothExtent(tooth.mesh);
  panel.innerHTML = `<div class="sel-head"><strong>Tooth ${tooth.fdi}</strong><span>${(ext.width * tooth.scale * tooth.adjust.width).toFixed(1)} mm wide, ${(ext.height * tooth.scale * tooth.adjust.length).toFixed(1)} mm long</span></div>`;
  for (const [key, label, min, max, step, unit] of SLIDERS) {
    const row = document.createElement("label");
    row.className = "slider";
    const value = tooth.adjust[key];
    row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output>${value.toFixed(step < 0.1 ? 2 : 1)}${unit}</output>`;
    const input = row.querySelector("input")!, out = row.querySelector("output")!;
    input.oninput = () => {
      const v = Number(input.value);
      const targets = [tooth, ...(state.mirror ? arch.teeth.filter((t) => t.fdi === partner(tooth.fdi)) : [])];
      targets.forEach((t) => { t.adjust[key] = v; });
      out.textContent = `${v.toFixed(step < 0.1 ? 2 : 1)}${unit}`;
      renderTeeth(targets.map((t) => t.fdi));
    };
    panel.appendChild(row);
  }
  const reset = document.createElement("button");
  reset.textContent = "Reset this tooth";
  reset.onclick = () => {
    const targets = [tooth, ...(state.mirror ? arch.teeth.filter((t) => t.fdi === partner(tooth.fdi)) : [])];
    targets.forEach((t) => { t.adjust = { ...NO_ADJUST }; settle(t, arch); });
    renderTeeth(targets.map((t) => t.fdi));
    renderSelected();
  };
  const reseat = document.createElement("button");
  reseat.textContent = "Seat on the scan again";
  reseat.title = "Level the cusps with the scanned tooth and set the buccal face 0.3 mm outside it, keeping your adjustments.";
  reseat.onclick = () => {
    const targets = [tooth, ...(state.mirror ? arch.teeth.filter((t) => t.fdi === partner(tooth.fdi)) : [])];
    targets.forEach((t) => { const keep = { ...t.adjust }; t.adjust = { ...keep, up: 0, buccal: 0 }; settle(t, arch); t.adjust = keep; });
    renderTeeth(targets.map((t) => t.fdi));
  };
  const row = document.createElement("div");
  row.className = "buttons";
  row.append(reset, reseat);
  panel.appendChild(row);
}

// Arch-wide changes
function archWide(key: keyof Adjust, delta: number) {
  const arch = current();
  if (!arch) return;
  for (const tooth of arch.teeth) if (arch.waxed.has(tooth.fdi)) tooth.adjust[key] = (tooth.adjust[key] as number) + delta;
  renderTeeth();
  renderSelected();
}

// Picking
const ray = new THREE.Raycaster();
renderer.domElement.addEventListener("pointerdown", (event) => { (renderer.domElement as HTMLCanvasElement & { down?: [number, number] }).down = [event.clientX, event.clientY]; });
renderer.domElement.addEventListener("pointerup", (event) => {
  const down = (renderer.domElement as HTMLCanvasElement & { down?: [number, number] }).down;
  if (!down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 4) return;
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1), camera);
  const hits = ray.intersectObjects([...meshes.values()].filter((m) => m.visible), false);
  select(hits.length ? (hits[0].object.userData.fdi as number) : null);
});

function setView(which: "occlusal" | "front" | "left" | "right") {
  const arch = current();
  const c = arch ? new THREE.Vector3(0, (arch.curve.pts[0]?.[1] ?? 0) * 0.3, arch.curve.zTop - 4) : new THREE.Vector3();
  controls.target.copy(c);
  const d = 150;
  const dirs = { occlusal: new THREE.Vector3(0, -0.15, 1), front: new THREE.Vector3(0, -1, 0.12), left: new THREE.Vector3(-1, -0.1, 0.12), right: new THREE.Vector3(1, -0.1, 0.12) };
  camera.position.copy(c).addScaledVector(dirs[which].normalize(), d);
  camera.up.set(0, which === "occlusal" ? 1 : 0, which === "occlusal" ? 0 : 1);
  if (which === "occlusal") camera.up.set(0, -1, 0);
  controls.update();
  redraw();
}

function renderArchChoice() {
  const box = $("arch-choice");
  box.innerHTML = "";
  for (const jaw of ["upper", "lower"] as const) {
    if (!state.arches[jaw]) continue;
    const b = document.createElement("button");
    b.textContent = jaw === "upper" ? "Upper" : "Lower";
    b.className = state.jaw === jaw ? "active" : "";
    b.onclick = () => { state.jaw = jaw; antagonistBvh = null; renderArchChoice(); showArch(); if (state.library && !current()!.teeth.length) autoPlace(); else { renderChips(); renderSelected(); } };
    box.appendChild(b);
  }
  $<HTMLInputElement>("antagonist").disabled = !state.inOcclusion;
}

// ---------------------------------------------------------------------------------------------
// Step 4: export

function waxedTeethIn(arch: ArchState, filter: (t: PlacedTooth) => boolean, into: THREE.Matrix4) {
  return arch.teeth.filter((t) => arch.waxed.has(t.fdi) && filter(t)).map((t) => transformed(closedTooth(t.mesh), into.clone().multiply(toothMatrix(t))));
}

function concat(meshes: Array<{ v: Float32Array; f: Uint32Array }>) {
  let nv = 0, nf = 0;
  meshes.forEach((m) => { nv += m.v.length; nf += m.f.length; });
  const v = new Float32Array(nv), f = new Uint32Array(nf);
  let ov = 0, of = 0;
  for (const m of meshes) { v.set(m.v, ov); for (let i = 0; i < m.f.length; i += 1) f[of + i] = m.f[i] + ov / 3; ov += m.v.length; of += m.f.length; }
  return { v, f };
}

async function exportTeeth() {
  const arch = current();
  if (!arch) return;
  // In the scan files' own coordinates (before the bite fit), so they line up with the original scans.
  const toScan = (arch.bite ? arch.bite.clone().invert() : new THREE.Matrix4()).multiply(arch.frame.clone().invert());
  const teeth = waxedTeethIn(arch, () => true, toScan);
  const name = `Wax-up ${state.jaw} teeth (scan coordinates)`;
  if (await saveFiles([{ name: `${name}.stl`, bytes: stlBytes(concat(teeth)) }], `${name}.zip`)) status(`Exported ${teeth.length} waxed teeth, closed, in the scan files' coordinates.`);
}

const builtModels = new Map<Jaw, Awaited<ReturnType<typeof archModel>>>();
async function modelFor(jaw: Jaw) {
  const arch = state.arches[jaw]!;
  if (!builtModels.has(jaw)) {
    status(`Making the ${jaw} model (Dental Studio, solid on a plate)...`, true);
    await later();
    builtModels.set(jaw, await archModel(await runtime(), arch.sharedSoup, arch.frame));
  }
  return builtModels.get(jaw)!;
}

async function exportModels(kind: "total" | "partial-odd" | "partial-even" | "imt") {
  const jaws: Jaw[] = kind === "imt" ? (["upper", "lower"] as Jaw[]).filter((j) => state.arches[j]?.teeth.length && state.arches[j]!.waxed.size) : [state.jaw];
  if (!jaws.length) { status("Place and wax teeth on an arch first."); return; }
  const rt = await runtime();
  const started = performance.now();
  const files: { name: string; bytes: Uint8Array }[] = [];
  const loose: string[] = [];
  for (const jaw of jaws) {
    const arch = state.arches[jaw]!;
    const { model, toModel } = await modelFor(jaw);
    const sets: Array<[string, (t: PlacedTooth) => boolean]> = kind === "total" ? [["total", () => true]]
      : kind === "partial-odd" ? [["partial (odd teeth)", (t) => t.position % 2 === 1]]
        : kind === "partial-even" ? [["partial (even teeth)", (t) => t.position % 2 === 0]]
          : [["total", () => true], [`partial (${$<HTMLSelectElement>("imt-start").value === "odd" ? "odd" : "even"} teeth)`, (t) => (t.position % 2 === 1) === ($<HTMLSelectElement>("imt-start").value === "odd")]];
    for (const [label, filter] of sets) {
      status(`Joining the ${jaw} model with its ${label} wax-up...`, true);
      await later();
      const teeth = waxedTeethIn(arch, filter, toModel);
      const out = modelWithTeeth(rt, model, teeth);
      if (out.pieces > 1) loose.push(`${jaw} ${label}: ${out.pieces - 1} loose`);
      files.push({ name: `${jaw === "upper" ? "Upper" : "Lower"} model - ${label} wax-up.stl`, bytes: stlBytes(out.mesh) });
    }
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  if (await saveFiles(files, kind === "imt" ? "IMT wax-up models.zip" : `${state.jaw === "upper" ? "Upper" : "Lower"} wax-up model.zip`)) status(loose.length
    ? `Models saved in ${seconds} s, but some waxed teeth do not touch the model (${loose.join("; ")}). Move them onto the scanned teeth, or leave them unwaxed, and export again.`
    : `Models saved in ${seconds} s.`);
}

// ---------------------------------------------------------------------------------------------
// Wiring

$<HTMLInputElement>("scans").onchange = (e) => { const f = [...((e.target as HTMLInputElement).files ?? [])]; if (f.length) void loadScans(f); };
$<HTMLInputElement>("library").onchange = (e) => { const f = [...((e.target as HTMLInputElement).files ?? [])]; if (f.length) void loadLibraries(f); };
$<HTMLInputElement>("library-folder").onchange = (e) => { const f = [...((e.target as HTMLInputElement).files ?? [])]; if (f.length) void loadLibraries(f); };
$("auto").onclick = () => autoPlace();
$<HTMLInputElement>("fit").onchange = (e) => { state.fitTeeth = (e.target as HTMLInputElement).checked; autoPlace(); };
$<HTMLSelectElement>("span").onchange = (e) => { state.lastPosition = Number((e.target as HTMLSelectElement).value); autoPlace(); };
$<HTMLInputElement>("show-found").onchange = () => showArch();
$("swap").onclick = () => { state.rightSide = state.rightSide === 1 ? -1 : 1; autoPlace(); };
$<HTMLInputElement>("mirror").onchange = (e) => { state.mirror = (e.target as HTMLInputElement).checked; };
$<HTMLInputElement>("antagonist").onchange = (e) => { state.showAntagonist = (e.target as HTMLInputElement).checked; showArch(); };
$<HTMLInputElement>("show-unwaxed").onchange = () => renderTeeth();
$<HTMLSelectElement>("colour").onchange = (e) => { state.colour = (e.target as HTMLSelectElement).value as typeof state.colour; renderTeeth(); };
$("wax-all").onclick = () => { const a = current(); if (!a) return; a.teeth.forEach((t) => a.waxed.add(t.fdi)); renderTeeth(); renderChips(); };
$("wax-anterior").onclick = () => { const a = current(); if (!a) return; a.waxed = new Set(a.teeth.filter((t) => t.position <= 3).map((t) => t.fdi)); renderTeeth(); renderChips(); };
$("wax-none").onclick = () => { const a = current(); if (!a) return; a.waxed.clear(); renderTeeth(); renderChips(); };
for (const [id, k, d] of [["w-buccal-plus", "buccal", 0.2], ["w-buccal-minus", "buccal", -0.2], ["w-up-plus", "up", 0.25], ["w-up-minus", "up", -0.25]] as const) $(id).onclick = () => archWide(k, d);
$("w-size-plus").onclick = () => archWide("width", 0.02);
$("w-size-minus").onclick = () => archWide("width", -0.02);
for (const v of ["occlusal", "front", "left", "right"] as const) $(`v-${v}`).onclick = () => setView(v);
$("export-teeth").onclick = () => void exportTeeth();
$("export-total").onclick = () => void exportModels("total");
$("export-imt").onclick = () => void exportModels("imt");
for (const zone of [document.body]) {
  zone.addEventListener("dragover", (e) => e.preventDefault());
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files ?? [])];
    const libs = files.filter((f) => /\.(rar|eoff|xml)$/i.test(f.name));
    const scans = files.filter((f) => /\.stl$/i.test(f.name));
    if (libs.length) void loadLibraries(libs);
    else if (scans.length) void loadScans(scans);
  });
}
// For the test scripts.
(window as unknown as { waxLab: unknown }).waxLab = { state, loadScans, loadLibraries, autoPlace, select, exportModels, setView, current };
status("Choose a case's scans (upper, lower and bite STL), then a tooth library (.rar).");
