---
title: Dental Studio
summary: Raw intraoral scans to printable study, ortho, aligner and crown-and-bridge models in six steps - with a printable articulator, and every setting explained with pictures.
---

An intraoral scan comes out of the scanner as an open surface: the teeth and gum, with a ragged edge where the scan stops, often a few small holes and a loose piece of cheek or tongue. **{{ui:dental.title}}** turns raw scans into printable models - one arch, or an upper and a lower with their bite - in one or two clicks: the work Meshmixer needs a dozen steps for. Full arches and quadrants (sextants) both work.

## The short way

For most cases you only need three clicks:

1. Click **{{ui:dental.title}}** in the {{ui:editor.group.dental}} group of the toolbar, and **{{ui:dental.import}}** your upper and lower scans (and the bite scan, if you have one).
2. Under **{{ui:dental.step3}}**, pick what the models are for: **{{ui:dental.study}}**, **{{ui:dental.ortho}}**, **{{ui:dental.aligner}}** or **{{ui:dental.crown}}**.
3. Click **{{ui:dental.applyPair}}**.

The download button in the panel's title bar (and the link in step 1 before any scan is in) saves this guide as a PDF of 28 pages, with every screen and setting, to keep, print or pass on.

The panel leads you through six numbered steps, top to bottom, each on a card of its own: add the scans, prepare them (trim, then check the teeth), choose the model, its base, the articulator (for a pair) and its name. Each says in one line what to do and turns green when it is done; the line above the button says what comes next. Click a step's title to fold it to one line that sums up its settings, and again to open it; the card you last worked in is marked on the left.

![Dental Studio with an upper and a lower scan in: the steps, each on its card with its instruction, ticks on the steps that are done, the model's height and the button at the bottom.](shot:dental-studio-steps)

## Step 1 · {{ui:dental.step1}}

Click **{{ui:dental.title}}** in the {{ui:editor.group.dental}} group of the toolbar, or search for it with [[Ctrl]]+[[K]]. With no scans in the design yet, click **{{ui:dental.import}}** in the panel and pick the upper, lower and bite scans (STL, OBJ, PLY or 3MF) together; they go straight into the slots. Scans already in the design are picked up when the panel opens: file names with upper, lower or bite in them say which is which; otherwise Pare 3D works it out (scanners put the upper above the lower, and a palate or the width across the canines says upper). **{{ui:dental.swap}}** swaps them if it guessed wrong.

**As the panel opens** Pare 3D welds each scan, removes broken triangles and loose pieces, fills the small holes and sets each arch up teeth up, with the occlusal plane level and the midline straight. A quadrant is recognised as one and set up along its own length. With a bite scan the two arches are fitted onto it; without one they stay where the scanner put them, which is in occlusion when both came from the same scan. The panel says what it found for each scan and whether the arches are in occlusion.

**The bite is locked in.** The first time a set is looked at, the bite the bite scan gives is stored with the two arches, and Pare 3D never fits it again. Move the scans apart, turn them, trim rough edges, cut the palate away or sculpt them - the models and the articulator are made in the bite as it was scanned. (Fitting again after an edit would move it: on a full-arch set, cutting the palate away and fitting again moved the upper up to 0.3 mm against the lower.) The panel shows {{ui:dental.biteLocked}}

**Side by side.** The scans are then laid out side by side on the plate - the upper on the left, the lower on the right, each teeth up with its front towards you - and the bite scan is hidden: it is only needed for the fit. **{{ui:dental.scanOcclusion}}** puts the pair in occlusion to check the bite, **{{ui:dental.scanSide}}** back side by side for trimming. Neither changes the scans. Sculpting one of the scans hides the other until Sculpt closes, and the orange teeth area moves with its scan when you drag it.

**The original scans stay in the design.** **{{ui:dental.restoreUpper}}** and **{{ui:dental.restoreLower}}** put the scan back as it was imported - every trim, sculpt and cut of it undone at once - still in the locked bite. Only the files themselves are kept (about the size of the STL files), not a copy after every edit.

## Step 2 · {{ui:dental.step2Prepare}}

### {{ui:dental.trimStep}}

Cut away scan you do not want before the teeth are checked - a rough edge, excess gum, a tag of cheek or tongue, or the palate - or close over a bubble, spike or void in it. **{{ui:dental.trimUpper}}** or **{{ui:dental.trimLower}}** opens **{{ui:sculpt.trimTitle}}** on that scan, with only what this needs: **{{ui:sculpt.tool.select}}** paints over the area (**{{ui:sculpt.tool.unselect}}** takes it back), then

- **{{ui:sculpt.selection.delete}}** cuts it away and leaves the scan's edge open there - for what should not be in the model at all;
- **{{ui:sculpt.selection.fill}}** removes it and closes the hole with a smooth patch that carries on the surface round it, as Meshmixer's Erase & Fill does - for a bubble, a spike or a void on the gum. A hole that reaches the scan's own edge is left open: there is nothing to close it against.

**{{ui:sculpt.reach.front}}** selects only what faces you; **{{ui:sculpt.reach.through}}** right through the scan, which is the quick way to take a palate. **{{ui:sculpt.selection.grow}}**, **{{ui:sculpt.selection.invert}}** and **{{ui:sculpt.selection.clear}}** change the selection. The other scan steps aside while you trim, and the panel stands on the left of the work area, clear of Dental Studio.

- **The crowns are guarded.** If what you selected takes in the crowns of the teeth - within 6 mm of the cusp tips - **{{ui:sculpt.selection.delete}}** and **{{ui:sculpt.selection.fill}}** say how many of its triangles lie on them and change nothing; unselect them, or press the button again ({{ui:sculpt.deleteAnyway}}, {{ui:sculpt.fillAnyway}}) to go ahead. The gum, the palate and flaps of tissue do not count, nor a few triangles at the edge of a stroke. A tall tag of tissue standing right behind the last molar can still be taken for a tooth.
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

Only for a pair - with a single arch this step is left out. With an upper and a lower, **{{ui:dental.hinge}}** joins the pair at the back so the printed models open and close on the bite. A side view of the articulator above its settings follows them as you change them: the joint, the protrusion path at its angle, the incisal pin and its table. Each joint has a picture of it in section.

![The Articulator step: the joint choice, hinge fit and its test, the protrusion path, the incisal stop with its pin and table, and how the models are placed.](shot:dental-articulator)

- **{{ui:dental.hingeJoint}}** sets how the two models join at the back. **{{ui:dental.hingeJointBall}}** (the default): a 10 mm ball condyle behind each last molar on the lower, in a cup on the upper held by two tongues that flex as the ball snaps in - it centres itself, so it neither slides from side to side nor rocks, and suits brittle model resins. **{{ui:dental.hingeJointDropIn}}**: the same balls slide into their cups through a channel slanting down and back and lift out the same way; nothing flexes, the upper's weight keeps them seated, and the upper lifts off if pulled. **{{ui:dental.hingeJointAxle}}**: the hinge described next.
- Every joint sits behind the last molars of a pair in occlusion: on a full arch one behind each side's last molar, set wide like the two joints of the jaw, on a quadrant one. With **{{ui:dental.hingeJointAxle}}** each bearing is a pair of posts with an axle on the lower and a clip on the upper that snaps over it and only turns on it. **{{ui:dental.hingeFit}}** sets the room round the ball or the axle: 0.10 mm (the standard; 0.05 to 0.3 mm offered) turns without play on a well-tuned printer, and the same room is left along the axle, so the 14 mm clips neither rock nor slide; if the clip is too stiff or will not snap on, choose a looser fit and make the models again. The **{{ui:dental.incisalStop}}** (on unless you turn it off) is an incisal pin, as on an articulator: a slim 3 mm pin on the midline, 6 mm in front of the models, meets a small table as they close, so they close to the scanned bite every time and the pin, not the teeth, takes the load. Each is carried on a thin arm along the bottom of its own model's base, so the front teeth stay in view. Print both, snap (or drop) the upper onto the lower, and the models open and close in their bite.
- **{{ui:dental.condyle}}** (off unless you choose an angle) stretches the cup (or the clip's bore) into a slot running forward and down at that angle below the occlusal plane (10° to 45°; about 30° on average) so the lower can slide forward the way the condyle runs down the eminence, to check protrusive contacts. The bearings still hold it square, but it adds forward movement; leave it off for a plain hinge with no play. With the incisal stop on, **{{ui:dental.pinRaise}}** opens the bite (to set the occlusal vertical dimension higher, say for a splint or a rehabilitation): a slider from 0, the scanned bite, to 10 mm in half millimetres. As on an articulator, the figure is read at the pin, and the bite opens by turning: the pin is made longer by that much and the table stays where it is, so the upper stands turned up about the hinge with the pin on the table - it is not lifted straight up. The teeth therefore part by less than the pin, and less at the back than at the front (a rough rule is pin : front teeth : back molars = 3 : 2 : 1); after **{{ui:dental.applyPair}}** the note says exactly how far, for example "Held open 3.0 mm at the pin: about 2.7 mm at the front teeth and 1.2 mm at the back teeth". With **{{ui:dental.layoutOcclusion}}** the upper is placed standing open on its pin, as it will stand when printed. Models placed in occlusion touch, but an export keeps them apart: the 3MF (or STL) holds the upper and the lower as two bodies, and a part you put on one model (a label, say) joins that model only. And **{{ui:dental.incisalTable}}** is {{ui:dental.incisalTableFlat}} or a {{ui:dental.incisalTableGuide}} that slopes up towards the back, so the models part as the lower slides forward.
- **Finding your fit.** Click **{{ui:dental.hingeTest}}** beside {{ui:dental.hingeFit}} (or use **{{ui:hingeTest.title}}** in Ready-made parts): the joint you chose, small: a strip with five balls (or axles) and five cups (or clips), one for each fit from 0.05 to 0.2 mm, each with its fit cut into it. Ready-made parts has all three. Print them, turn each cup or clip over and fit it onto its ball or axle, and choose the tightest one that snaps on and turns freely without play. Dental Studio remembers it and uses it the next time you turn the hinge on.
- Once an articulated pair is made, Pare 3D says how far it opens before the models meet, and warns if that is less than 30°.

![An articulated pair made from a scan, in occlusion: the ball joints behind the molars and the slim incisal pin in front.](shot:dental-articulated-models)

## Step 6 · {{ui:dental.stepName}}

### {{ui:dental.label}}

Type a **{{ui:dental.label}}** (a patient code or a date) to engrave it on the base: on the front of the orthodontic and articulator bases, under the floor on the others. A hollow model that is open underneath has nowhere to carry it, so with a label its floor is closed (with vent holes) for you.

### {{ui:dental.patientDetails}}

**{{ui:dental.patientKeep}}** names the models after the scan files (often the patient's name) and engraves the label. **{{ui:dental.patientRemove}}** names them {{ui:dental.upperModelPlain}} and {{ui:dental.lowerModelPlain}}, renames the bite scan {{ui:dental.biteScanPlain}} and engraves no label, so the models and the files you export or send to a slicer carry nothing that identifies the patient. The design's own name is yours: give it a case number rather than a name. Pare 3D remembers the choice.

### One patient per design

Keep each patient's scans in a design of their own. **{{ui:dental.newPatient}}**, beside **{{ui:dental.import}}**, starts a new design with Dental Studio open, so the next patient's scans cannot mix with the last one's. Models already made are never offered as scans again, and once a design holds models the panel reminds you to start a new one.

## What Pare 3D always does

- **No tooth is ever cut off.** Pare 3D finds the teeth on each scan - everything within reach of a cusp tip and down to 10 mm below it (Trim's warning counts the crowns alone, down to 6 mm), measured tooth by tooth, so a tilted arch or a quadrant is covered as well as a full arch - and no cut or trim goes into them. Where the scan's ragged edge folds under the teeth (a cheek flap tucked under the sulcus), what is under the teeth goes, not the teeth. Only the ragged fringe right at the scan's edge, at most 1.2 mm wide, may be trimmed beside a tooth - at the end of a quadrant, where the scan stops partway across a tooth. Every model is checked against its scan before it is handed over, and Pare 3D says so if any tooth surface could not be kept. Every model is also written as one clean closed surface, with no pinched or open edges, as a slicer reads it.
- Before a model is handed over, scan debris is cleaned away: loose flecks of less than 5 mm³, which would float in a resin vat, and tiny bubbles sealed inside, which would trap liquid resin. Real hollows stay.
- How deep the scan is kept is measured from the occlusal plane. By default Pare 3D keeps the scan down to where almost all of it ends - long tails of tissue that hang far below the gum are left out - and never more than 22 mm.
- The teeth and gum you keep are the scan itself, untouched; the base is built from straight walls down to a flat floor. A pair stands equally tall.
- A hollow model is hollowed on a fine grid of a fifth of the wall: the walls come out at least as thick as set (a little more in places). Inside, by default, a honeycomb (6 mm cells, 0.8 mm walls) stands on the floor and carries the shell, so a hollow model is as stiff as a solid one for a fraction of the resin or filament. {{ui:dental.infillBase}} keeps the honeycomb to the bottom 6 mm, stiff where the model sits and empty above; {{ui:dental.infillNone}} leaves it empty. Two or three slots at the foot of every honeycomb wall join the cells, so resin drains out through the vent holes of a closed model or the open bottom of an open one.
- Each model is one closed solid that replaces its scan; [[Ctrl]]+[[Z]] brings the scans back and [[Ctrl]]+[[Y]] makes the models again.
