# Scan to Printable Model: Research and Design

Oct 23, 2026 · Rakesh Jivan

> **Status (23 Oct 2026):** research done, plan agreed in principle. **On hold until Rakesh receives 10–20 real anonymised scans.** When they arrive, start Build 46 (Open scan). Live copy of this plan: https://claude.ai/artifact/EzhkAYNsWSR9D63T1d64Ch

## Summary

**Recommendation:** build a two-step **Dental model** tool in Pare 3D. Step 1, *Open scan*, cleans and orients the scan by itself. Step 2, *Make model*, trims it, builds the base and hollows it from one panel with a purpose preset. Everything Meshmixer does by hand in 8 to 15 steps becomes two clicks plus an optional slider.

- **The gap is real.** Meshmixer has had no update since 2018 and Autodesk stopped supporting it in 2023. The free replacements are tied to one brand of scanner (3Shape Model Maker needs a TRIOS) or charge for STL export (Medit Model Builder).
- **Clinical defaults should depend on what the model is for.** Hollow models are measurably less accurate than solid ones (Shin 2020, Ma 2023). A cross-arch plate improves accuracy whatever the inside (Shin 2020). Formlabs recommends solid models for thermoforming, or walls of at least 3 mm when hollow. So the tool should ask what the model is for, not just how thick the wall is.
- **Pare 3D already has most of the engine:** STL, OBJ and 3MF import, mesh health checks, makeSolid, island removal, simplification, Manifold booleans and a voxel distance-field pipeline (Round a mesh). The current Hollow tool cannot handle a scan. It runs on the exact CAD kernel and stops at 4,000 triangles, while a full-arch scan has hundreds of thousands. So hollowing needs a new mesh path, not the existing tool.
- **Selling points:** it's free, it works with any scanner, and patient scans never leave the computer.

## The workflow today

A raw intraoral scan is an **open surface**, not a solid. It has one large ragged opening where the scan stops on the gingiva or vestibule. It often also has small holes in undercuts or interproximal areas, loose fragments (tongue, cheek, cotton roll), and sometimes folds or self-intersections at the edge. It cannot be printed until it is closed, trimmed and given a base. The Meshmixer route that clinics follow ([Formlabs guide](https://formlabs.com/latam/blog/fabricacion-modelos-con-escaneos-3d-intraorales-dentales/), [FacFox](https://facfox.com/docs/?p=163169)):

1. Import the STL, set orthographic view and orient the arch by hand, occlusal up.
2. **Plane Cut** away the ragged rear and vestibular edges. Then brush-select and delete the smaller bad areas.
3. **Analysis > Inspector** to find holes. Fill the small ones, but deliberately *not* the big opening around the perimeter.
4. **Select All > Smooth Boundary** to tidy the open edge.
5. **Edit > Extrude**, end type *Flat*, then drag a negative offset until the extrusion clears the whole edge. This is the "extrude the margins" step. It turns the open edge into vertical walls with a flat floor.
6. **Edit > Hollow** (or Make Solid, then Hollow), set the offset, and add drain holes by hand.
7. **Plane Cut** again to flatten the base. Optionally emboss a label in another program; Meshmixer cannot label ([Kravitz, Groth & Shannon, JCO 2018](https://www.jco-online.com/archive/2018/01/22-cadcam-software-for-three-dimensional-printing/)).
8. Export as binary STL and orient on the build plate in the slicer.

**Where it goes wrong.** None of these steps has a number attached, so each user picks their own: how far to extrude, how thick the wall, how big the drain hole. Hollowing and then plane-cutting often leaves double walls, or the model prints solid. The usual cause is a self-intersection in the extruded edge, fixed only by hand-smoothing and re-cutting ([Autodesk forum](https://forums.autodesk.com/t5/meshmixer/dental-model/td-p/8496687)). A self-intersecting margin also makes the flat-end extrusion fold through itself. Every arch goes through the same long manual sequence, and it can't be repeated exactly from one patient to the next.

## What the dedicated tools do

The commercial tools all follow the same order: **orient, trim, base, hollow, label**. The good ones run it automatically from presets. Each is tied to a scanner, a printer or a paid tier.

| Tool | Automatic steps | Base options | Hollowing | Catch |
| --- | --- | --- | --- | --- |
| [3Shape Model Builder](https://support.3shape.com/lab-model-builder-how-to/hollowing-possibilities-in-model-builder) / [Model Maker](https://dentistry.co.uk/2022/03/11/3shape-model-maker-create-dental-models-from-3shape-trios-scans-in-minutes/) | Trim and base from settings | Set in Virtual Trimming Settings | 5 variants: solid, open bottom, open bottom + grid, no grid, internal hole. Example wall 1.5 mm, bottom drain hole 10 mm | Model Maker is free but needs a TRIOS scanner ([IDD](https://instituteofdigitaldentistry.com/news/autodesk-discontinues-meshmixer-3d-software/)) |
| [exocad Model Creator](https://wiki.exocad.com/wiki/index.php/Model_Creator_Module) | Alignment wizard, saved default model type | Model with plate, plateless, vendor presets (Formlabs, Baumann, Dreve and others), articulator rods | Drain-hole interval option | Paid lab CAD module |
| [Medit Model Builder](https://medit.document360.io/docs/workflow-7) | **Auto Creation** from preset parameters | [ABO, Plate, Plateless (horseshoe)](https://medit.document360.io/docs/base-creation); height up to 99 mm; bevel; border for edentulous | Wall 2 to 4 mm, 1 to 15 drain holes per arch, honeycomb infill | Saving and exporting STL is a paid feature |
| [Formlabs PreForm Scan to Model](https://formlabs.com/support/Preparing-dental-scans-for-printing-with-Scan-to-Model/) | Orientation and trim plane set automatically | Base height slider, default 0 mm; [3 mm suggested for narrow arches](https://dental.formlabs.com/indications/diagnostic-models/guide/) | One checkbox: honeycomb plus drain holes added automatically | Only on Formlabs dental printers |
| [SprintRay RayWare Cloud](https://sprintray.com/design-and-3d-print-dental-models/) | AI design in about 5 minutes | Aligner, bleaching tray, fit-check with dies | Not documented publicly | Cloud service, SprintRay ecosystem |
| [DEXIS IS Model](https://dexis.com/en-uk/cs-model) | Automatic base, trims and occlusion | Orthodontic | Not documented | Carestream / DEXIS scanners |
| [MeshInspector](https://meshinspector.com/knowledge-base/mesh-editing/preparing-a-dental-model-for-3d-printing-in-meshinspector-a-workflow/) | None (manual tools) | Extrude Base with Fix Undercuts | Offset −2 mm, then gyroid lattice | Manual, many steps |
| [Blender for Dental / ODC](https://github.com/patmo141/odc_public) | None | Solid and hollow base making | Yes | Blender learning curve |

**What to copy:** Medit's *Auto Creation* (one click from presets) and Formlabs' three screens (orient, trim, base) are the closest to what we want. 3Shape's open-bottom variant, which leaves the hollow open at the base, removes the need for drain holes and stops suction cupping. Every tool treats hollowing, wall thickness and base height as preset values, not hand-dragged handles.

## Clinical specifications

The evidence agrees on one point: **hollowing and thin walls cost accuracy, and a cross-arch connection buys it back**. A study model can be hollow. A model for crowns, bridges or articulator mounting should be solid, or thick-walled with a plate. The effect varies by printer, so no single wall value is right for everyone.

| Study | Design | Key finding |
| --- | --- | --- |
| [Shin et al., *Materials* 2020](https://www.mdpi.com/1996-1944/13/23/5433) | DLP, 100 µm layers; U-arch vs U-arch + 1.5 mm cross-arch plate; 1.5 mm and 4 mm shells, hexagon fill, rough fill, solid | Plate improved trueness from 135.2 to 85.6 µm. 1.5 mm shell was least accurate (143.1 µm) vs solid (106.7 µm) while using about 55–63% of the resin. Authors: hollow U-arch for consultation, plate + solid for prostheses |
| [Ma et al., *J Adv Prosthodont* 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10333097) | 14-tooth crown-prep arch; solid vs 2 mm hollow vs grid; three DLP printers | Hollow models were the least accurate on every printer, including at the margins. Grid infill matched or beat solid on some printers |
| [Wan et al., *J Dent* 2026](https://jaehyunlee.snu.ac.kr/publication/printing-accuracy-and-post-mounting-dimensional-stability-of-3d-printed-hollow-dental-models-with-varying-shell-thicknesses-and-cross-arch-bars/) | DLP; 1 mm vs 4 mm shell, with or without cross-arch bar; articulator mounting with plaster | 1 mm without bar deviated most (899.2 µm linear); 4 mm with bar was most accurate and most stable after mounting. Plaster expansion distorts thin unbraced models |
| [Yurdakurban et al., *Aust Orthod J* 2024](https://reference-global.com/article/10.2478/aoj-2024-0023) | Aligner models; 1, 2, 3 mm shells vs solid; SLA, DLP, PolyJet | Accuracy varied by region, shell and technology; choose the design for the printer and the use |

**Numbers the tools and printer makers use:**

- **Wall thickness:** 2 mm is the common default (Ma 2023 system default; [Formlabs hollowing guide](https://formlabs.com/global/blog/how-to-hollow-out-3d-models/); MeshInspector). Medit allows 2–4 mm; 3Shape's example is 1.5 mm. For **thermoforming**, [Formlabs](https://dental.formlabs.com/indications/thermoformed-clear-aligners-retainers/guide/) recommends solid, or **at least 3 mm** if hollow.
- **Model height for thermoforming:** **15–20 mm**. Taller models stretch the sheet thinner and make the appliance harder to remove (Formlabs).
- **Base below the teeth:** the trim plane sits about **3 mm below the lowest point of the teeth on the gingiva**. Adding a 3 mm base is advised for narrow arches such as the lower jaw ([Formlabs diagnostic guide](https://dental.formlabs.com/indications/diagnostic-models/guide/)).
- **Drain and vent holes:** a hollow model printed flat must be open to the outside, or suction cupping and trapped resin follow (Formlabs, [Asiga](https://support.asiga.com/?p=9308)). Holes go at the base. 3Shape's example bottom hole is 10 mm; Medit allows 1–15 per arch. Hollow models also hold liquid resin and dirty the wash faster, which is why Asiga suggests printing solid.
- **Orientation:** flat on the plate gives the best accuracy, speed and resin use. Near vertical (65–75°) fits more models per print (Formlabs).
- **Layer height:** 100 µm for diagnostic models; 160 µm is the default for thermoforming models in Fast Model Resin (Formlabs).

**What this means for the presets:**

| Purpose | Inside | Wall | Base | Height | Why |
| --- | --- | --- | --- | --- | --- |
| Study / consultation | Hollow, open bottom | 2 mm | Horseshoe | Teeth + 3 mm | Saves resin; accuracy matters least (Shin 2020) |
| Aligner / retainer / tray (thermoforming) | Solid (hollow 3 mm allowed) | 3 mm if hollow | Horseshoe, vent if hollow | 15–20 mm total | Formlabs thermoforming guide |
| Crown, bridge, articulator | Solid | n/a | Plate across the palate or tongue space | Teeth + 3 mm or more | Plate and solid are most accurate (Shin 2020; Wan 2026) |

## What Pare 3D has and the gaps

About two-thirds of the engine exists. The missing third is scan-specific: closing an open surface onto a base, hollowing a large mesh, and finding the occlusal plane.

| Need | In Pare 3D today | Gap |
| --- | --- | --- |
| Import scan | STL, OBJ (with colour), 3MF | **PLY** missing: many newer scanners export it, often with colour ([imes-icore](https://www.imes-icore.com/knowledge/dental-wiki/topic/digital-file-formats-stl-ply-obj)) |
| Weld, check health | `weldTriangles`, `meshHealth` (openings, non-manifold edges) | None |
| Remove fragments | `faceComponents`, `removeLooseSplinters` | Rule to keep only the arch: drop pieces under a share of the largest |
| Fill small holes | `makeSolid` caps every opening flat | Must cap only the small holes and leave the big margin open; flat caps sag in curved holes |
| Decimate | `simplifyTrianglePositions` (meshoptimizer) | None; useful above about 500k triangles |
| Orient occlusal up | None | New: find the open margin's best-fit plane and point the teeth away from it |
| Trim plane + extrude margin to a flat floor | Manifold `splitByPlane` / `trimByPlane`; face tool extrudes planar faces | New: walls from the margin down to the floor, with smoothing and fold repair |
| Base shapes | Box, cylinder; boolean union | New: horseshoe outline from the arch footprint, plate across the palate or tongue space |
| Hollow | Hollow tool on the exact CAD kernel, **stops at 4,000 triangles** | New mesh path: voxel distance field + `Manifold.levelSet`, the same pipeline as Round a mesh (7M-voxel budget) |
| Drain / vent holes | Hole cylinders + boolean subtract | Automatic placement at the base |
| Label | Text, embossed or engraved, including on curved surfaces | None |
| Export | STL, 3MF; Bambu send | None |

**Two engineering notes.** First, the outer tooth surface must stay byte-for-byte the scan: only the inside cavity and the base can come from the voxel grid. The hollow is made as *model minus (model eroded by the wall)*, so the voxel resolution affects only the inner wall, never the occlusal anatomy. Second, every step has to run in a worker on meshes of hundreds of thousands of triangles (Kravitz 2018 uses a 200,000-triangle arch as its example). Manifold handles that size; the CAD kernel does not.

## Proposed design: two steps

The dentist opens a scan, picks what the model is for, and clicks **Make model**. Everything else is a default they can override.

```
Raw scan (STL, OBJ or PLY)
  -> Step 1 · Open scan (automatic): Clean -> Fill small holes -> Repair margin -> Orient
  -> Step 2 · Make model (purpose preset, one click): Trim -> Extrude margin -> Base -> Hollow (if preset allows) -> Label
  -> Printable model, ready to slice
```

Step 1 runs by itself when the scan is opened; step 2 is one panel and one click, and only the purpose preset decides whether the model is hollowed.

### Step 1: Open scan (automatic on import)

Dropping an STL, OBJ or PLY that looks like a scan (one large open boundary, typically hundreds of thousands of triangles) offers **Prepare as dental scan**. It then runs, in a worker:

1. **Weld and clean.** Weld matching corners, drop degenerate and duplicate triangles, and remove fragments under 2% of the largest piece's area (tongue, cheek, cotton roll). Remove non-manifold fans by deleting the fewest triangles.
2. **Fill small holes only.** Find every boundary loop and keep the longest open: that is the margin. Fill the others with a smooth fill that follows the surrounding curvature (fan, then a few rounds of smoothing), not a flat cap.
3. **Repair the margin.** Smooth the boundary loop (a few passes of Laplacian smoothing on the boundary vertices only), cut off spikes and slivers along it, and untangle folds where the edge doubles back. This replaces Meshmixer's Smooth Boundary and the hand-deleting.
4. **Orient.** Fit a plane to the margin loop. The occlusal direction is the plane normal pointing away from the margin towards the bulk of the teeth. Rotate so it points up and the arch's long axis runs left to right. Upper and lower scans from the same session keep their bite relation: both are rotated by the same transform.
5. **Simplify if huge.** Above about 500k triangles, offer to reduce. Flat gingiva is thinned first; cusps and margins keep their density.
6. **Report.** A one-line health card: holes filled, fragments removed, triangles, and whether it looks like an upper or lower arch. One-click flip if the orientation guess is wrong.

### Step 2: Make model (one panel)

The panel opens with a live ghost of the finished model. Controls, top to bottom:

- **Purpose:** Study model · Aligner / retainer / tray · Crown and bridge. This sets everything below to the values in *Clinical specifications*.
- **Base:** Horseshoe · Plate (fills the palate or tongue space) · Flat block.
- **Height:** total model height in mm, with the trim plane shown as a draggable line. The default is 3 mm below the lowest margin point.
- **Inside:** Solid · Hollow, open bottom · Hollow, closed with vent holes; plus a wall thickness slider.
- **Label:** optional text engraved on the base side (patient code, U/L, date).
- **Both arches:** when two scans are open, one click makes both with matching bases.

**Make model** runs:

1. **Trim.** Cut the scan with the trim plane. Above the plane the scan is kept exactly; below it is discarded.
2. **Extrude the margin.** Each margin vertex above the floor drops straight down to the floor plane, joined by vertical wall strips. If the drop would cross another part of the wall (a margin that leans outward), those vertices move outward onto the arch's 2D silhouette first. The silhouette comes from Manifold's projection of the scan, so the walls can never fold through each other.
3. **Floor and base.** Close the bottom with the 2D outline of the walls, triangulated. Horseshoe: offset that outline outward 1–2 mm and extrude it as a plinth. Plate: fill the outline's inner hole across the palate or tongue space. Union with Manifold and check the result is a valid solid.
4. **Hollow.** Voxelise the solid at a resolution of about wall ÷ 4, erode it by the wall thickness with the exact distance transform, and turn that into a cavity surface with `Manifold.levelSet`. Then subtract the cavity, so the outer surface is untouched. Open bottom: the cavity is extended through the floor, so no drain holes are needed and no suction cupping happens. Closed: automatic vent holes, placed at the lowest points of the cavity.
5. **Label and export.** Engrave the label, then hand off to the normal Export (STL or 3MF) or Bambu send.

**Time target:** under 10 seconds for a single arch on a recent Mac. Round a mesh already uses the same voxel and levelSet steps within its 7M-voxel budget; a 70 × 60 × 25 mm arch at 0.5 mm voxels is about 0.8M voxels.

## Risks, validation and build plan

The biggest risk is the margin extrusion on messy real scans, so we need real scans before anything ships.

| Risk | Mitigation |
| --- | --- |
| Margin folds, spikes or self-intersections break the walls | Smooth and untangle the margin first; snap overhanging margin points to the projected silhouette; Manifold validity check with a voxel fallback for the base only |
| Wrong orientation on partial-arch or quadrant scans | Show the guess with a one-click flip and a free-rotate; never block |
| Hollow models less accurate than users expect | Purpose presets default Crown and bridge to solid with a plate; a short note in the panel citing why |
| Very large scans (1M+ triangles) slow the editor | All steps in a worker; offer to simplify on import; the editor shows a lighter preview mesh |
| Clinical claims | Pare 3D makes printable models; it is not a medical device and does not diagnose. The guide says so plainly |

**Validation before release:**

- [ ] Collect 10–20 real anonymised scans, upper and lower, from at least three scanner brands (TRIOS, Medit, iTero, Primescan). Rakesh to supply.
- [ ] Every scan must produce a valid manifold solid with no manual fixing.
- [ ] Deviation check: the outer surface of the made model against the original scan above the trim plane must be 0 µm (unchanged), measured automatically in the test suite.
- [ ] Print test on Rakesh's printer: one study model (hollow 2 mm), one thermoforming model (solid, 18 mm), and one crown-and-bridge model (solid with plate). Check for cupping, trapped resin and base flatness.
- [ ] Time each step on the test iMac.

**Build phases:**

1. **Build 46 – Open scan.** PLY import, scan detection, clean, small-hole fill, margin repair, orientation, health card.
2. **Build 47 – Make model.** Trim, margin extrusion, horseshoe and plate bases, solid output, label, both arches.
3. **Build 48 – Hollow.** Voxel hollow with open bottom and vent holes, purpose presets complete, guide chapter.

## Sources

**Peer-reviewed**

- [Shin S-H, Lim J-H, Kang Y-J, et al. Evaluation of the 3D printing accuracy of a dental model according to its internal structure and cross-arch plate design. *Materials* 2020;13(23):5433](https://www.mdpi.com/1996-1944/13/23/5433)
- [Ma T, Peng T, Lin Y, Zhang M, Ren G. Effect of internal structures on the accuracy of 3D printed full-arch dentition preparation models in different printing systems. *J Adv Prosthodont* 2023;15(3):145–154](https://pmc.ncbi.nlm.nih.gov/articles/PMC10333097)
- [Wan Q, Riera C, Tran TT-N, Fehmer V, Sailer I, Lee J-H. Printing accuracy and post-mounting dimensional stability of 3D printed hollow dental models with varying shell thicknesses and cross-arch bars. *J Dent* 2026;164:106234](https://jaehyunlee.snu.ac.kr/publication/printing-accuracy-and-post-mounting-dimensional-stability-of-3d-printed-hollow-dental-models-with-varying-shell-thicknesses-and-cross-arch-bars/)
- [Yurdakurban E, Topsakal KG, Duran GS, Görgülü S. Evaluating the accuracy between hollow and solid dental aligner models. *Aust Orthod J* 2024;40(2):51–62](https://reference-global.com/article/10.2478/aoj-2024-0023)
- [Kravitz ND, Groth C, Shannon T. CAD/CAM software for three-dimensional printing. *J Clin Orthod* 2018](https://www.jco-online.com/archive/2018/01/22-cadcam-software-for-three-dimensional-printing/)

**Manufacturer and software documentation**

- [3Shape: Hollowing possibilities in Model Builder](https://support.3shape.com/lab-model-builder-how-to/hollowing-possibilities-in-model-builder)
- [exocad wiki: Model Creator Module](https://wiki.exocad.com/wiki/index.php/Model_Creator_Module)
- [Medit: Base Creation](https://medit.document360.io/docs/base-creation) and [Model Builder workflow](https://medit.document360.io/docs/workflow-7)
- [Formlabs: Preparing dental scans with Scan to Model](https://formlabs.com/support/Preparing-dental-scans-for-printing-with-Scan-to-Model/)
- [Formlabs: Diagnostic models guide](https://dental.formlabs.com/indications/diagnostic-models/guide/)
- [Formlabs: Thermoformed aligners and retainers guide](https://dental.formlabs.com/indications/thermoformed-clear-aligners-retainers/guide/)
- [Formlabs: Making models from intraoral scans (Meshmixer)](https://formlabs.com/latam/blog/fabricacion-modelos-con-escaneos-3d-intraorales-dentales/)
- [Formlabs: How to hollow out 3D models](https://formlabs.com/global/blog/how-to-hollow-out-3d-models/)
- [Asiga support: hollow models and drain holes](https://support.asiga.com/?p=9308)
- [SprintRay: Design and 3D print dental models](https://sprintray.com/design-and-3d-print-dental-models/)
- [DEXIS IS Model](https://dexis.com/en-uk/cs-model)
- [MeshInspector: Preparing a dental model for 3D printing](https://meshinspector.com/knowledge-base/mesh-editing/preparing-a-dental-model-for-3d-printing-in-meshinspector-a-workflow/)
- [Open Dental CAD for Blender (ODC)](https://github.com/patmo141/odc_public)

**Industry and community**

- [Institute of Digital Dentistry: Autodesk discontinues Meshmixer (Feb 2023)](https://instituteofdigitaldentistry.com/news/autodesk-discontinues-meshmixer-3d-software/)
- [Autodesk Meshmixer forum: dental model](https://forums.autodesk.com/t5/meshmixer/dental-model/td-p/8496687)
- [FacFox: How to make dental models from 3D intraoral scans](https://facfox.com/docs/?p=163169)
- [3Shape Model Maker launch (Dentistry.co.uk, 2022)](https://dentistry.co.uk/2022/03/11/3shape-model-maker-create-dental-models-from-3shape-trios-scans-in-minutes/)
- [imes-icore: Digital file formats STL, PLY, OBJ](https://www.imes-icore.com/knowledge/dental-wiki/topic/digital-file-formats-stl-ply-obj)
