---
title: Dental Studio
summary: Raw intraoral scans to printable study, ortho, aligner and crown-and-bridge models in six steps - with a printable kinematic articulator that keeps the scanned bite, and every setting explained with pictures.
---

An intraoral scan comes out of the scanner as an open surface: the teeth and gum, with a ragged edge where the scan stops, often a few small holes and a loose piece of cheek or tongue. **{{ui:dental.title}}** turns raw scans into printable models - one arch, or an upper and a lower with their bite - in one or two clicks: the work Meshmixer needs a dozen steps for. Full arches and quadrants (sextants) both work.

## The short way

For most cases you only need three clicks:

1. Click **{{ui:dental.title}}** in the {{ui:editor.group.dental}} group of the toolbar, and **{{ui:dental.import}}** your upper and lower scans (and the bite scan, if you have one).
2. Under **{{ui:dental.step3}}**, pick what the models are for: **{{ui:dental.study}}**, **{{ui:dental.ortho}}**, **{{ui:dental.aligner}}** or **{{ui:dental.crown}}**.
3. Click **{{ui:dental.applyPair}}**.

The download button in the panel's title bar (and the link in step 1 before any scan is in) saves this guide as a PDF of 35 pages, with every screen and setting, to keep, print or pass on.

The panel leads you through six numbered steps, top to bottom, each on a card of its own: add the scans, prepare them (trim, then check the teeth), choose the model, its base, the articulator (for a pair) and its name. Each says in one line what to do and turns green when it is done; the line above the button says what comes next. Once the scans are in, the step to do next is outlined in green until you have worked in it. Click a step's title to fold it to one line that sums up its settings, and again to open it; the card you last worked in is marked on the left.

![Dental Studio with an upper and a lower scan in: the steps, each on its card with its instruction, ticks on the steps that are done, the model's height and the button at the bottom.](shot:dental-studio-steps)

## Step 1 · {{ui:dental.step1}}

Click **{{ui:dental.title}}** in the {{ui:editor.group.dental}} group of the toolbar, or search for it with [[Ctrl]]+[[K]]. With no scans in the design yet, click **{{ui:dental.import}}** in the panel and pick the upper, lower and bite scans (STL, OBJ, PLY or 3MF) together; they go straight into the slots. Scans already in the design are picked up when the panel opens: file names with upper, lower or bite in them say which is which; otherwise Pare 3D works it out (scanners put the upper above the lower, and a palate or the width across the canines says upper). **{{ui:dental.swap}}** swaps them if it guessed wrong.

**As the panel opens** Pare 3D welds each scan, removes broken triangles and loose pieces, fills the small holes and sets each arch up teeth up, with the occlusal plane level and the midline straight. A quadrant is recognised as one and set up along its own length. The arches stay exactly where the scanner put them, which is in occlusion when they came from the same scan. The panel says what it found for each scan and whether the arches are in occlusion.

**The scanner's bite is kept.** When the arches arrive in occlusion, as Medit, 3Shape and other scanners export them, Pare 3D keeps that bite exactly: it does not fit them again, so the models are made in the jaw relationship your scanning software recorded. With a bite scan the panel shows **{{ui:dental.biteKept}}** and checks the bite against the bite scan in the background. A buccal bite scan carries scanning and stitching error of its own (typically 0.1 to 0.3 mm), so a small difference is normal and is not shown. Only when the bite scan clearly disagrees - more than 0.5 mm - does the panel warn and offer **{{ui:dental.fitBite}}**, which fits each arch to the buccal bite scan. Use it, too, when the arches arrive apart.

**One bite scan, two, or none.** Many clinicians take a buccal bite scan on each side; put the second in **{{ui:dental.bite2}}** (a second file with "bite" in its name goes there by itself). Each is checked against the scanner's bite on its own, so one side that disagrees cannot hide behind the other, and **{{ui:dental.fitBite2}}** fits the arches to both together, never to one side alone. That is the better record: bilateral buccal registration aligns the whole arch more accurately than one side, whose accuracy falls with distance from where it was taken (Matta et al. 2026; Mei et al. 2022), and fitting to one side alone tilts the bite - on one patient's scans here, one side's bite scan moved each arch about 0.3 mm, the other's about 0.25 mm the other way, both together about 0.07 mm. With no bite scan, arches that arrive in occlusion are made in that bite; arches that arrive apart are made without an articulator. That fit is then stored with the arches and never made again ({{ui:dental.biteLocked}}): trimming, sculpting or cutting the palate away cannot move it.

**Side by side.** The scans are then laid out side by side on the plate - the upper on the left, the lower on the right, each teeth up with its front towards you - and the bite scan is hidden: it is only needed for the fit. **{{ui:dental.scanOcclusion}}** puts the pair in occlusion to check the bite, **{{ui:dental.scanSide}}** back side by side for trimming. Neither changes the scans. Sculpting one of the scans hides the other until Sculpt closes, and the orange teeth area moves with its scan when you drag it.

**Bite contacts & clearance.** With the arches in occlusion, tick **{{ui:dental.biteMap}}** to colour both arches by how far each point is from the other arch in the scanned bite, as scanner software and Exocad's occlusion map do: red, orange and yellow where the scans overlap (more than 0.10 mm, 0.05 to 0.10 mm, up to 0.05 mm), green, light blue and blue where there is clearance (up to 0.05, 0.10 and 0.20 mm); further than 0.20 mm the scan keeps its own colour. The panel gives the largest overlap and the area of each arch within 0.05 mm of the other. It is a distance, not a pressure - a scan records no force - so it shows where the teeth meet in the recorded bite, not how hard. Overlap is where the scans run into each other: printed models would hold each other open there. Small red and orange spots on the cusps are normal (scanning and stitching error); a broad band of overlap means the bite is worth checking with the bite scan. The contacts face each other, so hide one arch to see the other's.

**The original scans stay in the design.** **{{ui:dental.restoreUpper}}** and **{{ui:dental.restoreLower}}** put the scan back as it was imported - every trim, sculpt and cut of it undone at once - still in the locked bite. Only the files themselves are kept (about the size of the STL files), not a copy after every edit.

## Step 2 · {{ui:dental.step2Prepare}}

### {{ui:dental.trimStep}}

Cut away scan you do not want before the teeth are checked - a rough edge, excess gum, a tag of cheek or tongue, or the palate - or close over a bubble, spike or void in it. **{{ui:dental.trimUpper}}** or **{{ui:dental.trimLower}}** opens **{{ui:sculpt.trimTitle}}** on that scan, with only what this needs: **{{ui:sculpt.tool.select}}** paints over the area (**{{ui:sculpt.tool.unselect}}** takes it back), then

- **{{ui:sculpt.selection.delete}}** cuts it away and leaves the scan's edge open there - for what should not be in the model at all;
- **{{ui:sculpt.selection.fill}}** removes it and closes the hole with a smooth patch that carries on the surface round it, as Meshmixer's Erase & Fill does - for a bubble, a spike or a void on the gum. A hole that reaches the scan's own edge is left open: there is nothing to close it against.

**{{ui:sculpt.reach.through}}** (the default in Trim) selects right through the scan, so a palate or a flap goes in one stroke with no hidden layer left behind; **{{ui:sculpt.reach.front}}** selects only what faces you. After each cut, anything a slicer would call non-manifold - an edge three triangles share, a corner where the scan only touches itself, a loose speck - is tidied away; the scan stays open. **{{ui:sculpt.selection.grow}}**, **{{ui:sculpt.selection.invert}}** and **{{ui:sculpt.selection.clear}}** change the selection. The other scan steps aside while you trim, and the panel stands on the left of the work area, clear of Dental Studio.

- **{{ui:sculpt.selection.delete}}** and **{{ui:sculpt.selection.fill}}** act at once on what you selected (build 85: there is no warning about the teeth any more), so check the selection before pressing them - [[Ctrl]]+[[Z]] takes a cut back.
- **Trim first, then check the teeth.** Trimming makes the scan anew, so the teeth area below starts again after it - paint it once the scan is trimmed.
- **{{ui:sculpt.undo}} and {{ui:sculpt.redo}}** in the panel take back each delete or fill, and do it again ([[Ctrl]]+[[Z]] and [[Ctrl]]+[[Shift]]+[[Z]] too). They go back only as far as when the panel opened. The bite stays locked through every trim; **{{ui:dental.restoreUpper}}** and **{{ui:dental.restoreLower}}** put the whole scan back as it was imported.

### {{ui:dental.step2}}

Leave it on **{{ui:dental.marginAuto}}** unless the scan needs help: Pare 3D finds the teeth, keeps a smooth band of gum below them and cuts the scan exactly along it. **{{ui:dental.marginManual}}** lets you check and correct what is kept as teeth, the way a lab's model builder does:

![Fix by hand on a lower arch seen from the occlusal side: the teeth Pare 3D found tinted orange, the paint, erase and lasso tools in the panel.](shot:dental-fix-by-hand)

- Pare 3D picks the teeth and tints them orange on the scan. Choose the arch and turn the view with the view buttons ({{ui:dental.view.occlusal}}, {{ui:dental.view.front}}, {{ui:dental.view.left}}, {{ui:dental.view.right}}, {{ui:dental.view.lingual}}).
- **{{ui:dental.area.paint}}** paints more on, **{{ui:dental.area.erase}}** takes off tissue that was taken for teeth (a pad behind the last molar, a flap of cheek) - press and drag; the {{ui:dental.brushSize}} sets how wide. **{{ui:dental.area.lassoAdd}}** and **{{ui:dental.area.lassoRemove}}** take everything inside a line you draw. Only the side facing you is painted; turn the view between strokes. Esc puts the tool away.
- **{{ui:dental.areaShown}}** hides the orange tint while you look at the scan or trim it; it comes back while you paint. It is never shown while a scan is being trimmed.
- **{{ui:dental.expand}}** sets the band of gum kept round the area (3 mm by default). The model keeps the area and that band and nothing else, cut smoothly along the band's edge. **{{ui:dental.areaReset}}** starts the area again.

What you approve is protected: nothing inside the area is ever cut.

## Step 3 · {{ui:dental.step3}}

Choose what the models are for - each choice shows its base from above - and the line below the choices sums up what you will get (base, inside, height).

- **{{ui:dental.study}}:** on a **{{ui:dental.cleanBase}}** base, hollow with 2 mm walls and open underneath. The gum is kept as a band 3 mm deep below the teeth, cut along a smooth margin (the band's edge smoothed along the surface and the scan split exactly on it), and cut level; the base follows the scan as kept in a smooth, rounded outline - the line itself smoothed, so the wall turns gently - with straight walls and a flat floor, 3 mm under the cut, and never within 1 mm of a tooth. Half-round locator notches sit at the foot of the wall, front and sides. Models come out about 18-26 mm tall. It saves about a third of the resin; no resin is trapped and no drain holes are needed.
- **{{ui:dental.ortho}}:** solid, on a base trimmed the orthodontic way - back square to the midline, heels and buccal sides angled, the upper's front pointed and the lower's rounded, 3 mm clear of the teeth, and symmetric about the midline as the ABO trims study models, so both sides match even on a lopsided arch. A pair is placed in occlusion. Quadrants get a square block instead.
- **{{ui:dental.aligner}}:** solid, about 18 mm tall in all - models for thermoforming should be 15-20 mm tall, as taller models stretch the sheet too thin.
- **{{ui:dental.crown}}:** solid, with a plate across the palate or tongue space. Studies of printed models find solid models with a cross-arch plate the most accurate, and hollow ones the least.

Each choice sets the base in step 4 too. Change the base there and the choice is marked {{ui:dental.custom}}; pick the model again to go back to its settings.

**{{ui:dental.inside}}** sits under the choices: solid or hollow (open underneath, or closed with vent holes), the {{ui:dental.wall}} and **{{ui:dental.infill}}** ({{ui:dental.infillNone}}, a {{ui:dental.infillBase}} 6 mm high, or a full {{ui:dental.infillFull}}). A hollow model keeps its full wall round the locator notches.

## Step 4 · {{ui:dental.stepBase}}

Always open: the base's shape, each with a picture of it from above ({{ui:dental.cleanBase}}, {{ui:dental.follow}}, {{ui:dental.plate}}, {{ui:dental.orthoBase}} or {{ui:dental.articulatorBase}}), **{{ui:dental.bevel}}** (a 0.8 mm bevel round the foot so the model comes off the build plate easily; on unless you turn it off), {{ui:dental.notches}} and a **{{ui:dental.tieBar}}** (a bar joining the back ends of a full arch at the floor so it cannot spread while it prints; cut it off afterwards).

### How tall the model is

The **{{ui:dental.heightTitle}}** box shows the model as it stacks up, with a picture of the three parts and their sizes. Both arches change together.

![The model height box: a picture of the teeth, the gum below them and the base, with the size of each, the sliders for the gum and the base, and the whole model's height.](shot:dental-model-height)

- **{{ui:dental.heightTeeth}}**: the crowns and the gum right beside them, down to where the deepest tooth reaches. This part is never cut.
- **{{ui:dental.gumHeight}}**: how much more gum and wall stand between the teeth and the base. Slide it down to make that wall shorter, up to show more of the sulcus.
- **{{ui:dental.base}}** (**{{ui:dental.orthoHeight}}** on the orthodontic base): the plate under it all, with 3, 5, 10 and 15 mm one click away.
- **{{ui:dental.heightTotal}}**: the three together, from the base's floor to the tallest tooth.

> **Tip:** If the wall between the gum and the base looks too tall, lower **{{ui:dental.gumHeight}}** first, then **{{ui:dental.base}}**. On the orthodontic base most of that height is the trimmed base itself.

### {{ui:dental.moreScan}}

**{{ui:dental.moreScan}}**, under the height, holds the last two: **{{ui:dental.gumFollow}}** - a band of gum all round the teeth and nothing more, so the palate and the floor of the mouth go and the model is a horseshoe (its depth is then the {{ui:dental.gumHeight}} slider) - and **{{ui:dental.smooth}}** (smoothing the ragged edge where the scan stops, never the teeth).

## Step 5 · {{ui:dental.step4}}

Only for a pair - with a single arch this step is left out. **{{ui:dental.hinge}}** prints the pair as an articulator built so that it cannot change the scanned bite. A side view above the slider follows the pin as you move it.

![The Articulator step: the articulator in a side view, the pin slider and how the models are placed.](shot:dental-articulator)

**How it holds the bite.** Two things, and nothing else:

- **Behind, two ball condyles** on the lower, 10 mm across, one behind each heel and as far apart as the models allow. Each drops into a cup under the upper, the ball's own shape a tenth of a millimetre bigger all round, by a channel open at the back that slants down. The ball slips in without being forced, and the upper turns on it smoothly with very little play. Nothing snaps: earlier builds snapped the balls into seats, which was stiff to assemble and could crack in resin.
- **In front, the split pin**, as on a lab articulator: a 5 mm rod in two halves, one printed on each model on an arm along the bottom of its base. The upper half ends in a rounded dome; the top of the lower half has a shallow dish a little wider than the dome, so the dome settles in its middle every time without binding. The pin, not the cups, sets the height of the bite.
- It opens about the line through the two balls, to 90°. To take it apart, open it a little and lift the upper back off the balls; to put it together, hold the upper tilted open behind the balls, lower the cups onto them and close it.
- The pin and its arms stand at least 2 mm in front of the most forward tooth, so they do not crowd the incisors.

**{{ui:dental.pinPlace}}: {{ui:dental.pinMidline}} or {{ui:dental.pinSides}}.** **{{ui:dental.pinMidline}}** is the layout above: one split pin in front of the incisors. **{{ui:dental.pinSides}}** puts a post each side in the premolar region instead, so the front teeth are clear to see, photograph and seat an index on. Then the condyles in their cups make a true hinge and a split pin each side - the same as the one in front - stops it closing. The pins stand about halfway between the hinge and the incisors, so any height error in a printed pin shows about twice as large at the incisal edges: for the most accurate vertical dimension, use **{{ui:dental.pinMidline}}**. Either way, every pin stands at least 2 mm clear of the teeth and bases: Pare 3D looks at the furthest-forward (or furthest-out) point of either model, teeth included, so proclined incisors or a wide arch never meet it.

**The incisal pin.** Each half of the pin prints as part of its own model: nothing to lose or fit. To hold the bite open, the upper half is made longer. **{{ui:dental.pinRaise}}** sets the opening it is made at, 0 (the scanned bite) to 10 mm in half millimetres, read at the incisal pin's place in front of the incisors (with posts either side too) - to plan a higher occlusal vertical dimension for a splint or a rehabilitation, say. As on an articulator the figure is read at the pin, and the bite opens by turning about the condyles: the front teeth part by a little less than the pin and the back teeth by less again; after **{{ui:dental.applyPair}}** the note says exactly how far, for example "the front teeth 2.7 mm and the back teeth 1.2 mm" at 3 mm. To work at another opening, use **{{ui:dental.editDesign}}** (below) and make the models again.

**Without a pin.** Untick **{{ui:dental.incisalPin}}** for articulated models with no pin: the upper turns on the two condyles in their cups as a true hinge and the teeth stop it closing, at the scanned bite. The front is left clear and nothing stands in front of the incisors. With no pin there is nothing to hold an opening, so the opening goes to 0; moving **{{ui:dental.pinRaise}}** above 0 mm ticks **{{ui:dental.incisalPin}}** again, since the pin is what holds the bite open. The setting is kept with the design, so **{{ui:dental.editDesign}}** brings it back.

- Above 6 mm the arc is less like the patient's own: the condyles stand on an average hinge axis, not the patient's, and in a pilot study average-value mounting matched the patient's opening at 3 and 6 mm but not at 9 mm. Confirm the vertical dimension clinically.

**What it does not do.** It is a hinge: no protrusive or lateral excursions, no condylar guidance and no facebow transfer. For gnathological work - a full-mouth rehabilitation, say - mount the models on an adjustable articulator with a facebow ({{ui:dental.articulatorBase}} in step 4 makes a base for a metal articulator's magnetic plate).

**Printing it.** Print the models flat, base down, as Pare 3D lays them out. Keep supports off the contact surfaces - the inside of the cups, the top half of each ball, the pin's dome and the dish on the lower half: a support mark there changes where the models close. Printed flat, these surfaces all face away from the build plate and need none. The fit then comes down to the print itself - smooth, round balls and cups - and is made for resin; so use your printer's finest validated layer height for the models. **Layer height matters for the tooth surfaces too:** print at 25-50 microns (0.025-0.05 mm). Coarser layers leave layer lines - steps like contour lines - across the teeth; a silicone index taken from the model copies them, and composite injected through it for the injectable composite technique (IMT) then needs a lot of smoothing by hand. Pare 3D's models are smooth; the steps come from the print. The panel and the Export window say so whenever Dental Studio models are exported.

**A quadrant against a full arch** (teeth missing on one side, or a quadrant scan opposite a full arch) is articulated as a full pair. The pair is levelled and laid out by the full arch, so there is a condyle behind each side of it and the incisal pin stands in front of its central incisors. The quadrant's base grows into a horseshoe 8 mm wide following the full arch's base, with the tongue space left open; it carries both condyles and the pin, so the models cannot rock or flex on the side with no opposing teeth.

- Models placed in occlusion touch, but an export keeps them apart: the 3MF (or STL) holds the upper, the lower and the pins as separate bodies.
- Once an articulated pair is made, Pare 3D says how far it opens before the models meet, and warns if that is less than 30°.

![An articulated pair made from a scan, in occlusion: the ball condyles behind the molars and the incisal pin in front.](shot:dental-articulated-models)

## Step 6 · {{ui:dental.stepName}}

### {{ui:dental.label}}

Type a **{{ui:dental.label}}** (a patient code or a date) to engrave it on the base: on the front of the orthodontic and articulator bases, under the floor on the others. A hollow model that is open underneath has nowhere to carry it, so with a label its floor is closed (with vent holes) for you.

### {{ui:dental.patientDetails}}

**{{ui:dental.patientKeep}}** names the models after the scan files (often the patient's name) and engraves the label. **{{ui:dental.patientRemove}}** names them {{ui:dental.upperModelPlain}} and {{ui:dental.lowerModelPlain}}, renames the bite scan {{ui:dental.biteScanPlain}} and engraves no label, so the models and the files you export or send to a slicer carry nothing that identifies the patient. The design's own name is yours: give it a case number rather than a name. Pare 3D remembers the choice.

### One patient per design

Keep each patient's scans in a design of their own. **{{ui:dental.newPatient}}**, beside **{{ui:dental.import}}**, starts a new design with Dental Studio open, so the next patient's scans cannot mix with the last one's. Models already made are never offered as scans again, and once a design holds models the panel reminds you to start a new one.

## After making: {{ui:dental.editDesign}}

When the models are made the panel stays open on them. **{{ui:dental.doneButton}}** closes it. **{{ui:dental.editDesign}}** brings back the scans and every setting as they were when the models were made; change anything - trim, the base, the pin's opening - and **{{ui:dental.updateModels}}** makes the models again in place of the old ones. Close the panel instead and the models come back as they were.

The scans are kept with the models, hidden. Later, select a model and open **{{ui:dental.title}}**: its design opens again the same way. **{{ui:dental.stopMaking}}** (the Cancel button while the models are being made) stops the making at once and leaves everything as it was.

## {{ui:waxStudio.title}}

**{{ui:waxStudio.command}}**, beside **{{ui:dental.title}}** on the toolbar, opens the same steps with a diagnostic wax-up in them. It is in test builds only for now, while its steps are made clearer. For now it waxes the anterior teeth - canine to canine, or premolar to premolar, the range IMT is used for; a posterior studio, for occlusal wax-ups, is to follow. Two choices sit above the steps: **{{ui:waxStudio.flow}}** - **{{ui:waxStudio.flowWaxup}}** or **{{ui:waxStudio.flowImt}}** - and **{{ui:waxStudio.arches}}**.

1. Load and trim the scans as for any model.
2. **{{ui:waxup.findStep}}**: **{{ui:waxup.find}}** marks and numbers every tooth on the scan, in colour, in about ten seconds. The canine-to-canine teeth are chosen at first; click a tooth to add or leave it out. A number shown dashed was put right by the tooth's place in the arch - the network called it something else - so check it. The midline and canine tips are set from the teeth found; **{{ui:waxup.markAgain}}** sets them by hand instead.
3. **{{ui:waxup.setStep}}**: a set from the libraries that come with Pare 3D, or your own.
4. **{{ui:waxup.placeStep}}**: with the teeth found, **{{ui:waxup.fitTeeth}}** fits each library tooth to the patient's own - turned, sized and registered onto its crown (tip, torque, rotation, position), the wax 0.3 mm proud and the contacts closed. **{{ui:waxup.ideal}}** moves the front teeth from the patient's own towards a smile design: a level edge on the patient's central, an upright midline, a symmetric arch just in front of the teeth, natural width steps (lateral 2 mm and canine 1 mm narrower than the central) or the RED proportion, the central's width/length, the laterals 1 mm short and the canines on the smile arc. **{{ui:waxup.ghost}}** shows the scan through the wax. The smile checks list what to look at (left-right differences of 0.5 mm, a cant, the axial inclinations). Adjust tooth by tooth, or with Sculpt.
5. **{{ui:waxup.occlusionStep}}** (both arches): the bite opened at the incisors on an average articulator, the posterior wax brought into even contact and the lower front teeth to touch the upper's palatal surfaces, then the jaw moved forward and to each side with canine guidance or group function; interferences on posterior wax are carved back (up to 0.5 mm), the rest - and any on the patient's own teeth - reported.
6. Make the models. With **{{ui:waxStudio.flowImt}}** Make also makes, for each arch waxed, the pre-op model and the alternate-tooth wax-up (the series 1 index); the full wax-up model is the series 2 index. Print them at a 25-50 micron layer height and make the clear silicone index chairside on them.

The tooth finder is a trained network (CrossTooth, Xi et al., CVPR 2025) that is not part of Pare 3D: load its file (.ptw) once with **{{ui:waxup.loadFinder}}** and this browser keeps it. It runs on your computer; the scan never leaves it. Without it, mark the midline and canines by hand.

## Accuracy

The Model Builder does not change the scanned tooth surfaces. Bases, hinges, pins and plates are added around the scan, and the teeth are carried through as the scanner recorded them. The accuracy of a finished model therefore depends mainly on:

- **The intraoral scan.** Trueness and precision are set by the scanner, the scanning technique and the clinical conditions. Refer to your scanner manufacturer's specifications.
- **The bite record.** By default, the Model Builder keeps the jaw relationship exactly as your scanning software exported it. Use **{{ui:dental.fitBite}}** only when the arches arrive unaligned or the exported bite is clearly wrong. It fits each arch to the buccal bite scan and reports the fit residual, so check the occlusion before printing. Published studies show digital bite records are generally more accurate than conventional silicone or wax records. Accuracy falls with fewer teeth, quadrant records, large edentulous spans and scans taken away from the bite record site.
- **The printer, resin and post-processing.** Dimensional accuracy depends on the printer's calibration, layer height, resin, orientation, washing and curing. Follow the resin manufacturer's validated settings.
- **The articulator.** Hinge models reproduce the closed intercuspal position only. They do not record or reproduce jaw movements, condylar guidance or a facebow transfer.

Before you use a printed model for any restoration, appliance or diagnosis, check the result. Compare the on-screen occlusion with the patient's scans, confirm the printed teeth seat correctly against each other, and verify critical fits clinically. Pare 3D is a model-building tool, not a medical device. The clinician remains responsible for confirming that a model is fit for its intended use.

### What Pare 3D checks for you

- **The teeth.** Every crown point of each scan is checked against the finished model before it is handed over, and the note after making says how many there were and that they are all where the scan put them - or, if any are not, how many and by how much (a speck of scan too small to print at a torn edge, say), so you can check that area.
- **The bite.** The scanner's bite is kept; with a bite scan, it is checked against it, and the panel warns only when they clearly disagree (more than 0.5 mm).
- **Soft tissue in the way.** Soft tissue behind the last teeth - the retromolar pad and the tuberosity - that would meet the other model's soft tissue in the bite is cut back 0.5 mm, as a technician trims a cast's heels; otherwise it, not the teeth, would hold the models open. Gum that the other arch's teeth meet, such as the palate under a deep overbite, is never trimmed: that contact shows how far the bite can be opened, and the note after making says where teeth meet gum. The teeth are never touched. The orthodontic records preset keeps the scans exactly as captured (alteration of tooth or soft tissue anatomy in any form invalidates board records); the setting is under {{ui:dental.moreScan}}.
- **Where the scans overlap.** Where the scanner's own bite has teeth overlapping slightly (registration error in the bite record, typically a few tenths of a cubic millimetre at the incisors), the printed teeth touch there first, as stone casts from the same records would. On a fixed hinge axis this cannot make the models rock; it can only stop them closing a fraction early.

### Checking a printed articulator

No manufacturer publishes how accurately its printed articulator closes, and there is no ISO standard for printed models or articulators. If you want to know for your own printer and resin, this is the protocol Pare 3D is being validated with (in vitro, on a typodont or a patient's casts with their consent):

1. **Reference.** Scan a set of arches with a bilateral buccal bite as usual. Mark the canine cusp tips and the first molars' mesiobuccal cusp tips on the scans.
2. **Print.** Make the articulated pair, print it flat on your printer and resin with their validated settings, wash and cure it as directed, and measure within a day.
3. **Repeatability.** Open and close the articulator 20 times. Each time, measure the gap at the incisal pin and at a molar with a dial indicator or feeler gauges. Target: a standard deviation of 25 µm or less.
4. **Trueness of the bite.** Scan the closed pair with a lab or intraoral scanner and register each printed arch to its source scan. Measure the distances between the marked points across the arches and compare them with the same distances in the scanned bite. Target: 150 µm RMS or less (hand-articulated printed casts were about 149 µm out in the one study that measured them; casts on CAD-designed pins, about 333 µm).
5. **Contacts.** At the contacts the screen shows, 12 µm shimstock should hold; where it shows none, it should pull through.
6. **Pin steps.** With models made at 2, 4 and 6 mm, measure the opening at the incisal edges and the first molars. Target: within 0.15 mm of the figures in the note after making.
7. **Durability.** Repeat step 3 after 500 open-close cycles, and after 7 and 14 days.

Publish the printer, resin, settings and every measurement with the results, so others can repeat them.

## What Pare 3D always does

- **No tooth is ever cut off.** Pare 3D finds the teeth on each scan - everything within reach of a cusp tip and down to 10 mm below it, measured tooth by tooth, so a tilted arch or a quadrant is covered as well as a full arch - and no cut or trim goes into them. Where the scan's ragged edge folds under the teeth (a cheek flap tucked under the sulcus), what is under the teeth goes, not the teeth. Only the ragged fringe right at the scan's edge, at most 1.2 mm wide, may be trimmed beside a tooth - at the end of a quadrant, where the scan stops partway across a tooth. Every model is checked against its scan before it is handed over, and Pare 3D says so if any tooth surface could not be kept. Every model is also written as one clean closed surface, with no pinched or open edges, as a slicer reads it.
- Before a model is handed over, scan debris is cleaned away: loose flecks of less than 5 mm³, which would float in a resin vat, and tiny bubbles sealed inside, which would trap liquid resin. Real hollows stay.
- How deep the scan is kept is measured from the occlusal plane. By default Pare 3D keeps the scan down to where almost all of it ends - long tails of tissue that hang far below the gum are left out - and never more than 22 mm.
- The teeth and gum you keep are the scan itself, untouched; the base is built from straight walls down to a flat floor. A pair stands equally tall.
- A hollow model is hollowed on a fine grid of a fifth of the wall: the walls come out at least as thick as set (a little more in places). Inside, by default, a honeycomb (6 mm cells, 0.8 mm walls) stands on the floor and carries the shell, so a hollow model is as stiff as a solid one for a fraction of the resin. {{ui:dental.infillBase}} keeps the honeycomb to the bottom 6 mm, stiff where the model sits and empty above; {{ui:dental.infillNone}} leaves it empty. Two or three slots at the foot of every honeycomb wall join the cells, so resin drains out through the vent holes of a closed model or the open bottom of an open one.
- Each model is one closed solid that replaces its scan; [[Ctrl]]+[[Z]] brings the scans back and [[Ctrl]]+[[Y]] makes the models again.
