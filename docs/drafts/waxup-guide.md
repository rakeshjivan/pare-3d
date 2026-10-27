<!-- Build 80: the wax-up section of the Model Builder Guide, kept for the wax-up module (test builds only). Not built into the guide. -->

## Step 3 · {{ui:waxup.step}}

A diagnostic wax-up shows the patient - and the lab - the smile a treatment aims for, and gives you the model a mock-up is made from. This step sets library teeth over the scan's front teeth, canine to canine, the way smile design does it, and joins them to the model when you make it. It is optional: skip it and the model is the scan as it is.

**Wax only adds.** Every tooth stands at least 0.3 mm proud of the patient's facial surface where it covers it, so a mock-up made from the model seats over the teeth without any being prepared first (a mock-up is only accurate from an additive wax-up). When the model is made, Pare 3D counts the scan's crown points that are under the wax apart from the rest: every point outside it is still checked to the micrometre.

1. **{{ui:waxup.setStep}}.** Choose one of the tooth sets that come with Pare 3D (the Teethy library, from teethy.org, with its owner's permission), or **{{ui:waxup.loadSet}}**: front teeth as OBJ or STL - a Meshmixer part, one file holding the teeth as separate pieces, or one file per tooth. Pare 3D finds each tooth and which way the set faces, whatever way it was saved.
2. **{{ui:waxup.markStep}}.** Click **{{ui:waxup.mark}}**, then click on the scan where the central incisors meet at their edges (the midline), then the tip of each canine. The view turns onto the biting edges, only that arch shows, and small diamonds mark your clicks; Esc stops. These three points set the teeth out about the patient's own midline, even when the scan sits turned in the scanner's frame.
3. **{{ui:waxup.placeStep}}.** **{{ui:waxup.place}}** designs the teeth in the order smile design follows:
   - **The incisal edges first.** The centrals at the patient's edges, longer by **{{ui:waxup.lengthen}}** if you set it; the laterals 0.5 mm shorter; the canine tips higher by **{{ui:waxup.arcDepth}}** - the patient's own step when it lies between 0.5 and 2 mm, otherwise 1 mm - so the edges follow a smile arc.
   - **Then the widths.** The space between the midline and each canine tip, along the arch, sets the central's width; the laterals and canines take their share of it from **{{ui:waxup.propNatural}}** (mean crown widths, Magne 2003: lateral 79% and canine 87% of the central) or **{{ui:waxup.propLibrary}}**.
   - **Then the lengths.** The central's length follows from its width and **{{ui:waxup.centralRatio}}** (80% by default, as Digital Smile Design uses; natural unworn centrals average 78%). The canines' gingival zeniths sit level with the centrals', the laterals' 1 mm coronal (Chu 2009). Where the patient's gum lies above that plan, the table shows how far (**{{ui:waxup.colLengthening}}**): the crown lengthening the design asks for - or choose a higher width/length ratio. Where the gum lies below it, the tooth runs down to the gum, so none of the patient's tooth shows below the wax.

**Blended, not stuck on.** A wax-up shows the smile after treatment, so the wax teeth are finished the way a technician finishes wax before it is shown:

- **The contacts are closed.** The teeth are moved along the arch until each meets its neighbour - the centrals at the midline first, then outwards - without changing any tooth's width, so the proportions you chose hold.
- **The cervical third is feathered into the tooth and gum.** Over the cervical third of each tooth Pare 3D measures how far the wax stands proud of the scan and sinks it back, fully at the gum and easing out towards the middle third, so the wax runs into the patient's surface with no step - the feather edge an injected composite or a mock-up needs. Every point moves straight back towards the tooth, so the surface stays smooth and cannot fold. The incisal two-thirds keep the library tooth's shape.

The table lists each tooth by its number with its width, length and width/length ratio, and **{{ui:waxup.colEdge}}**: how far the design's incisal edge stands past the patient's own (+) or short of it (-). Click a tooth's number to select it, then move, turn or size it with the handles; **{{ui:waxup.placeAgain}}** starts the design over with the current settings, and **{{ui:waxup.remove}}** takes the wax-up away. The wax teeth are parts of their own until the model is made: then they are joined to it and hidden.

### For injection moulding (GC IMT)

In the injection moulding technique the wax-up is printed, a clear silicone index (GC EXACLEAR) is made over it, and flowable composite is injected through the index onto the unprepared or minimally prepared teeth. The model Dental Studio makes is that wax-up model. GC's technique guide sets the points the step checks for you:

- **Unsupported composite.** Composite past the patient's own edge has no tooth behind it. The guide keeps it within 0.5 mm, so the panel warns about every tooth whose **{{ui:waxup.colEdge}}** is more than +0.5 mm: shorten the design there, or plan to build the edge in layers.
- **Additive only.** Where the patient's own edge stands more than 0.2 mm past the design (**{{ui:waxup.colEdge}}** below -0.2), the tooth would show through the composite and would need reducing. The panel names those teeth; **Longer** on the tooth keeps the work additive.
- **Alternate teeth.** Injecting every tooth at once fuses the contacts, so the teeth are injected alternately, the neighbours isolated with PTFE tape (GC's sequence: 14, 12, 21 and 23 first, then the rest). **{{ui:waxup.alternate}}** makes a second model beside the first, with the wax-up on the first-injection teeth only and the others as the patient has them: an index from it injects those teeth, an index from the full model the rest (the two-model technique).
- **The index needs teeth to seat on.** Make the model with the full arch, or at least two teeth distal to the last tooth treated on each side, so the index has stable stops.

**Check it in the mouth.** A wax-up is a proposal: make the mock-up from the printed model, then check the incisal edge with the lips at rest and in a smile, the F and V sounds, and the occlusion, before any tooth is prepared.

