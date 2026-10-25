# What blocks the main thread

While the page's main thread works, the editor cannot answer a click, a key or the mouse: it
freezes. This note records how long the heavy actions block it, measured, before and after each
step that moves work into a worker. No step without a number.

## How it is measured

`scripts/measure-main-thread.mjs` runs each action in a fresh editor of a production build, in
headless Chromium, through the MCP bridge (and the real buttons for STEP export and opening a
.lyl file). It makes its own test data, the same at every run: a UV sphere of about 300,000
triangles as binary STL and as OBJ, 200,000 and 100,000 for the cuts, 60 boxes with 20 cylinder
holes, and so on. Set-up is not measured, only the action.

```
npm run build
LAYERLING_MCP_REMOTE=true LAYERLING_MCP_TOKEN=measure-token-0123456789 npx next start apps/web -p 3021
node scripts/measure-main-thread.mjs --url http://localhost:3021 --token measure-token-0123456789 [--only cut-mesh,split-mesh] [--runs 3] [--json out.json] [--profile dir]
```

The columns:

- **Duration**: from sending the command to its answer.
- **Main thread blocked / longest block**: the long tasks (50 ms or more) the browser reports.
- **Longest input delay**: how late a 10 ms timer came at worst - the wait a click or a key would
  have had. This decides **freezes**: 200 ms or more. The long-task count alone misses work the
  browser does not report as a task (the 3MF export and the print estimate show 0 ms there, yet a
  click waits over a second).
- **Longest frame gap**: the longest wait between two painted frames. Without input delay it is
  the GPU or the compositor, not the main thread (software rendering in the container).

`--profile dir` writes a CPU profile of each run (open it in Chrome DevTools, Performance).

Machine: a container with 4 cores, Chromium with SwiftShader (no GPU). Absolute numbers are for
comparing steps on the same machine, not for what a user's computer takes. The table shows the
median of the runs (2 for the baseline, 3 after step 1).

## Baseline (main at 83aba9cc)

| Action | Duration | Blocked | Longest block | Input delay | Frame gap | Freezes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Import STL, 300k triangles (binary) | 2,257 ms | 2,929 ms | 1,137 ms | 1,236 ms | 1,133 ms | yes |
| Import OBJ, 300k triangles | 2,430 ms | 2,764 ms | 1,574 ms | 1,585 ms | 1,567 ms | yes |
| Import 3MF, 100k triangles | 922 ms | 1,171 ms | 814 ms | 1,000 ms | 800 ms | yes |
| Group 60 boxes with 20 cylinder holes | 188 ms | 278 ms | 175 ms | 208 ms | 183 ms | yes |
| Group 40 cylinders with 20 sphere holes | 591 ms | 848 ms | 570 ms | 651 ms | 483 ms | yes |
| Cut a cylinder out of an imported 200k sphere | 1,898 ms | 2,625 ms | 1,887 ms | 2,245 ms | 1,267 ms | yes |
| Group two overlapping imported 100k spheres | 1,594 ms | 2,066 ms | 1,579 ms | 1,856 ms | 1,567 ms | yes |
| Split an imported 300k sphere in two | 3,873 ms | 4,369 ms | 3,861 ms | 3,869 ms | 3,850 ms | yes |
| Export STL (300k import and 40 boxes) | 1,223 ms | 189 ms | 189 ms | 1,143 ms | 1,100 ms | yes |
| Export 3MF of the same | 2,280 ms | 0 ms | 0 ms | 2,274 ms | 2,267 ms | yes |
| Print estimate of a 300k import | 1,157 ms | 0 ms | 0 ms | 1,145 ms | 1,133 ms | yes |
| Section view on (300k import and 40 boxes) | 11 ms | 581 ms | 512 ms | 538 ms | 567 ms | yes |
| Simplify a 300k import to 20 % | 345 ms | 579 ms | 330 ms | 332 ms | 317 ms | yes |
| Save a .lyl (300k import, 60 boxes, 60 undo steps) | 887 ms | 285 ms | 165 ms | 170 ms | 150 ms | no |
| Open that .lyl | 6,430 ms | 4,540 ms | 2,113 ms | 2,138 ms | 2,133 ms | yes |
| Export STEP of 60 bodies (loads the CAD kernel) | 1,630 ms | 0 ms | 0 ms | 123 ms | 117 ms | no |
| Import that STEP file | 60 ms | 0 ms | 0 ms | 44 ms | 183 ms | no |

The STEP export and import already run in the CAD worker; everything else that freezes runs on
the page.

## Step 1: grouping, cutting and splitting in a worker

`buildGroupedShapeFromSelection` and `splitShapeByPlane` (lib/editorBooleans.ts) run in
`workers/geometry.worker.ts`, called through `lib/geometryWorker.ts`. Everything the editor
groups, cuts or splits goes there: Group, the boolean cut, hole patterns, push/pull of a face,
rebuilding a group after its parts changed, honeycomb bodies, the QR code plate, and the same
through the MCP bridge.

- The shapes cross as Float64Arrays whose buffers are transferred (`lib/geometryTransfer.ts`): a
  Float64Array holds every number exactly, so the answer is the one the page would have worked
  out. A number list shared by several shapes goes once; one the answer takes over unchanged comes
  back as the page's own array.
- Every request has a number; an answer nobody waits for any more is dropped. A new split calls
  off the one before, leaving the editor calls off what it had running, and a worker with nothing
  else to do is stopped.
- Watchdog: a worker that has not said hello in 15 s, or takes over 180 s for one request, is
  stopped. A stuck request answers "The calculation took too long"; the next one starts a fresh
  worker.
- The worker says which build it is from first (lib/buildStamp.ts). No worker in the browser, a
  worker file that will not load (an old offline copy), one from another build, or one that
  crashes on the way: the work runs on the page as before. After two crashes in a visit the page
  stops trying.
- Text stays on the page (its fonts live there), and so does a grouping without a hole or an
  imported mesh, which only puts the parts together and is quicker done than sent away.
- From 300 ms on, the status line says "Calculating… you can keep working". The worker starts and
  loads Manifold when the editor is idle, as the page does, so the first cut does not wait for it.

| Action | Duration | Blocked | Longest block | Input delay | Freezes | Before: longest block / input delay |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Group 60 boxes with 20 cylinder holes | 351 ms | 103 ms | 103 ms | 104 ms | no | 175 / 208 ms |
| Group 40 cylinders with 20 sphere holes | 660 ms | 243 ms | 164 ms | 173 ms | no | 570 / 651 ms |
| Cut a cylinder out of an imported 200k sphere | 2,322 ms | 956 ms | 476 ms | 574 ms | yes | 1,887 / 2,245 ms |
| Group two overlapping imported 100k spheres | 1,854 ms | 579 ms | 283 ms | 362 ms | yes | 1,579 / 1,856 ms |
| Split an imported 300k sphere in two | 3,264 ms | 572 ms | 436 ms | 508 ms | yes | 3,861 / 3,869 ms |

The longest block fell from 1,887 to 476 ms for the cut, from 1,579 to 283 ms for the merge and
from 3,861 to 436 ms for the split; the two primitive groupings no longer freeze. The small
groupings take longer from start to answer (the shapes go to the worker and back), and that time
varies by about 100 ms from run to run.

What still blocks after the answer, from a CPU profile of the 200k cut (`--profile`), is not the
cut but what the editor does with its result:

- building the result's mesh for the view (three.js geometry, normals, bounds) - about 130 ms;
- counting the result's separate parts for "Separate parts" (`meshFaceComponents` in
  LayerlingEditor.tsx, string keys per vertex) - about 250 ms on 200k triangles; it runs whenever
  such a mesh is selected, not only after a cut;
- the scene fingerprint taken before and after the cut (`projectShapesFingerprint`) - about 80 ms;
- unpacking the answer into number lists - about 20 ms for 1.8 million numbers.

Checked:

- tests/e2e/geometryWorkerTransfer.e2e.ts: the worker's way (pack, unpack, compute, pack, unpack)
  gives the same result to the bit as the direct call, for a cut of an imported mesh, a merge of
  two and a split.
- tests/unit/geometryWorker.test.ts: the fallbacks - no worker, a worker that will not start, never
  says hello, is from another build, crashes during a request, gets stuck - and calling off.
- In the browser (production build): the same cut, split and grouping with the worker and with
  its file blocked give byte-identical STL exports; the blocked case works on the page without an
  error; the status line shows the notice during the 200k cut.
- Static export: the worker file is in the export, in the service worker's offline list, and is
  checked by `npm run verify:static-worker-assets`; with the network off, a reload loads it and
  Manifold from the offline copy.

Not checked: other browsers than Chromium, a real slow computer, a page update while a request
runs (the build stamp covers a worker from another build, not one replaced mid-request), and the
memory a large cut now takes twice (page and worker each hold the mesh while it runs). Workers do
not raise the memory limit of a tab (#683).

## Still on the main thread

Not profiled yet, so without a cause:

| Action | Longest input delay |
| --- | ---: |
| Export 3MF | 2,274 ms |
| Open a .lyl | 2,138 ms |
| Import OBJ / STL / 3MF | 1,585 / 1,236 / 1,000 ms |
| Print estimate | 1,145 ms |
| Export STL | 1,143 ms |
| Section view on | 538 ms |
| Simplify | 332 ms |
| After a large cut, merge or split: view mesh, part count, fingerprint (step 1) | 362-574 ms |
