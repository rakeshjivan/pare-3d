# Speed check

Pare 3D keeps a speed check so new features do not make the app slower. It runs every three
builds (82, 85, 88, ...) and before any release that touches the mesh engine, Sculpt or Dental Studio.

## What it measures

**Engine** (`tests/perf/speed-check.perf.ts`): the heavy steps on a generated scan the size of a
full-arch intraoral scan (about 300,000 triangles; no patient data):

- importing it from STL
- saving the design
- welding
- opening Sculpt
- a 60-dab stroke
- 1,000 surface picks
- the selection copy, Grow and Extrude
- Remesh (2 passes)
- capping holes, Thicken, and Make solid

**Browser** (`scripts/speed-check/pare-flows.mjs`): the flows a person uses, on the static export:

- opening the editor
- dropping the scan in
- turning the view
- opening Sculpt, one stroke, Done
- Undo
- with `--scans <folder>` (upper.stl, lower.stl, bite.stl of your own), Dental Studio's import and Make

For each flow it records:

- the time taken
- the longest frame gap
- the longest input delay: how late a 10 ms timer came, which is the wait a click would have

## Running it

```sh
SPEED_CHECK_BUILD=85 SPEED_CHECK_OUT=docs/perf/engine-85.json \
  npx vitest run --config tests/vitest.perf.config.ts tests/perf/speed-check.perf.ts

NEXT_PUBLIC_PARE_BUILD=85 node scripts/build-static-export.mjs
(cd apps/web/.next-export && python3 -m http.server 47451 --bind 127.0.0.1) &
SPEED_CHECK_BUILD=85 node scripts/speed-check/pare-flows.mjs --url http://127.0.0.1:47451 \
  --runs 2 --scans <folder of your scans> --json docs/perf/pare-flows-85.json

node scripts/speed-check/compare.mjs docs/perf/engine-82.json docs/perf/engine-85.json
node scripts/speed-check/compare.mjs docs/perf/pare-flows-82.json docs/perf/pare-flows-85.json
```

`compare.mjs` flags a step that is both 25% and 100 ms slower (frame and input-delay figures: 25%
and 30 ms; script size: 10%). It exits 1 when anything is flagged. Compare runs made on the same
machine only: absolute times differ several-fold between machines.

The cloud workspace draws in software (no graphics card), so its frame figures (fps, frame gap
while turning the view) are far worse than on a Mac and only mean something against each other.
Input delay and engine times are the CPU and do compare.

Patient scans are never committed: only the numbers are.

## Baseline (build 82, cloud workspace)

| Engine step | ms |
|---|---|
| Import a 300k-triangle STL | 440 |
| Save the design (JSON) | 960 |
| Open Sculpt (live copy) | 423 |
| Sculpt stroke (60 dabs) | 178 |
| Pick the surface (1,000 rays) | 1,110 |
| Extrude a selection | 900 |
| Remesh (live, 2 passes) | 10,451 |
| Cap holes | 3,026 |
| Thicken 1 mm (voxel) | 5,015 |
| Make solid (0.3 mm) | 8,528 |

Found and fixed while setting this up: Remesh on a surface rougher than its triangles split without
end. A 97,000-triangle part came out at 1.46 million triangles after eight minutes. It is now
seconds, with a regression test (tests/unit/remeshRunaway82.test.ts).

Watch list (input delay over a second in the browser run), checked with a CPU profile:

- **Dental Studio import of three full-arch scans:** 3.3 s of input delay. About 5 s of real main-thread work: welding, hole filling and garbage collection. This is the candidate for moving into a worker.
- **Undo after a Sculpt stroke on a full-arch scan:** 2.8 s of input delay, but only about 0.4 s of it is script. The rest is software drawing re-uploading the mesh, which a graphics card does at once. Not a problem on a Mac.
- **Opening the editor:** 1.6 s of input delay, while the scripts load.
