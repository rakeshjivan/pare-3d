/*
 * Fork (build 20): what each build brought, shown once after an update ("What's new") and from
 * the Help menu. Plain words, the few things a person would notice; English, as release notes.
 */
export const WHATS_NEW: ReadonlyArray<{ build: number; items: readonly string[] }> = [
  {
    build: 92,
    items: [
      "Soft transform in Sculpt (Meshmixer's Transform with a soft edge): select a cusp, an edge or a tooth and move, turn or resize it with sliders, live, the surface round it following smoothly.",
      "The Attract brush pulls the surface onto another part - the opposing arch, a tooth beside it - and stops on it, never through it.",
      "Brush options: falloff (smooth, sharp, flat), lazy mouse for steady lines, hold boundary for a scan's open edge, and Flatten's depth.",
      "Face groups: the surface split into patches at its creases, shown in colour; Select > Group picks a whole patch with one click.",
      "Deviation from the original: the part coloured by what was added (warm) and taken away (cool) since Sculpt opened, updated after every stroke.",
      "Remesh selection and Reduce selection make only the selected triangles again, the rest of the part untouched.",
      "Every Sculpt tool, button and setting is explained when the pointer rests on it, and the list button at the top of the panel shows what each one does.",
      "Exporting Dental Studio models reminds you to print them at a 25-50 micron layer height: coarser layers leave lines on the tooth surfaces that a silicone index copies into IMT composite.",
      "Faster sculpting: Smooth about a third faster, fewer pauses on refining strokes, and the panel no longer copies the whole mesh at every slider step while something is selected.",
    ],
  },
  {
    build: 91,
    items: [
      "Sculpt makes far less garbage for the browser to clear up: a brush gathers the surface under it into the same arrays every time instead of new ones for every dab, and the editor is no longer drawn again after every stroke - the pause when you let go is gone.",
      "Refining strokes do less work: the triangles a stroke changes are put back in their place in the search grid once, when it is next used, not every time they change.",
      "Dental Studio holds the page far less while scans come in - about half a second at most instead of two and a half seconds on two full-arch scans.",
      "Bite contacts & clearance in Dental Studio: with the arches in occlusion, colours both by how far each point is from the other arch (overlap in red, orange and yellow; clearance in green and blues), with the largest overlap and the contact area.",
    ],
  },
  {
    build: 90,
    items: [
      "Freeze in Sculpt (Meshmixer's mask): paint over what the brushes must leave alone and it turns blue - no brush moves it and refining leaves its triangles be. Ctrl frees it again; Freeze selection, Invert freeze and Clear freeze in the panel.",
      "Pinch matched to Meshmixer: it draws a ridge in gently and keeps its height (it took away half a ridge's width at 50 before).",
      "The resize and turn handles, sizes and their lines are put away while Sculpt is open, so a scan cannot be resized by accident, and come back when it closes. Right-click → Hide handles and sizes does the same for the mesh tools (until Pare 3D is opened again).",
      "Right-click a scan or other mesh → Sculpt… opens Sculpt with its brushes straight away (it was under Surface ›).",
      "The Shapes panel opens by itself when a design opens only while it is pinned; unpinned, it stays closed until you click Shapes.",
    ],
  },
  {
    build: 89,
    items: [
      "More of Meshmixer's sculpt brushes: Draw 2 (an even layer, however often you go over it), Drag (pulls the surface along the stroke), Shrink smooth and Bubble smooth (keeps the volume, so rounded shapes stay rounded).",
      "Smooth now works as Meshmixer's RobustSmooth: it evens the surface without shrinking it, so a cusp or a ridge keeps its size.",
      "Flatten grows with the strength as Meshmixer's does - gentle at low settings, nearly flat in one stroke at 100 (it flattened almost everything even at 25 before).",
    ],
  },
  {
    build: 88,
    items: [
      "Scans look as they do in Meshmixer: a near-white grey with a soft sheen, lit from just above and to the left of your eye, so faces turned to you are bright and creases and hollows fall dark (in the dark look, which Model Builder opens in).",
      "The 3D view draws no more pixels than it needs, whatever the display setting - with a Mac set to More Space it filled 40% more every frame, and Sculpt lagged.",
      "Scans brought in with the colours of earlier builds take the new grey when Model Builder lays them out.",
    ],
  },
  {
    build: 87,
    items: [
      "Scans and every other mesh are drawn smooth, as Meshmixer draws them: the light flows across the surface instead of showing every triangle (sharp edges, such as a model's base, stay sharp). Sculpted surfaces look as smooth as they are.",
      "Sculpt strokes show in the same frame as your hand moves - they were drawn a frame late (about 17 ms behind).",
      "While you sculpt, the handles, measures and other on-screen marks are not worked out again every frame, and the brush ring moves without redrawing the panel around it.",
      "No change of sharpness at the start and end of a stroke (build 85 drew strokes at a lower resolution; switching cost a hitch).",
      "On a 120 Hz ProMotion screen the Mac app can now draw at 120 frames a second where macOS allows it, and the brush paces its work to the screen.",
      "Less memory thrown away at the start of each stroke.",
    ],
  },
  {
    build: 86,
    items: [
      "Sculpt's brushes are twice as strong again: side by side with Meshmixer they still did too little at the same setting, because a hand stroke sends Meshmixer far more dabs than a quick test does. At Strength 29 a Draw stroke with a 3 mm brush now raises the surface about 0.14 mm.",
      "Dental Studio opens on Meshmixer's dark background, so scans read as they do there from the start; the switch at the top of the window changes it back.",
      "The speed readout has a button (the gauge at the top of the Sculpt panel), and the key also works where ` is § or an accent key.",
    ],
  },
  {
    build: 85,
    items: [
      "Sculpt is quicker: each dab of the brush takes a fraction of the time it did (finding the surface under the cursor no longer walks the whole scan), Refine only reworks the triangles when there is something to split or merge, far less throwaway memory is made (fewer pauses to clean it up), and the changes go to the graphics card in a few larger pieces - on a full-arch scan a Coarse stroke now does a frame's work in about a third of the time.",
      "While a Sculpt stroke goes on the view draws at standard resolution, as when turning it, and is sharp again the moment you stop.",
      "Strokes are evenly spaced however fast you move, and a quick stroke catches up a frame later instead of leaving gaps.",
      "Sculpt opens as Meshmixer's brushes do: Strength 29, Refine Coarse - and the brushes are as strong as Meshmixer's at an ordinary, unhurried stroke (about 1.7 times build 84's; they felt weak beside it).",
      "A switch at the top of the window sets the view's look: the workplane, no workplane, or Meshmixer's dark grey background with a light that follows the camera.",
      "Imported STL files come in Meshmixer's light grey, a little glossy, so a scan's surface reads; in Dental Studio the scans and models take the same grey.",
      "Trim in Dental Studio deletes (or erases and fills) what you selected at once: the warning about the teeth, which came up even with the teeth well clear, is gone.",
      "Press ` in Sculpt for a speed readout of the last stroke - frames a second, the longest wait, and where the time went.",
    ],
  },
  {
    build: 84,
    items: [
      "Dental Studio's articulator is back to the drop-in ball and cup of builds 63-77, which printed easily, located well and had the least play: each ball slips into a cup a tenth of a millimetre bigger than it, with nothing to snap or force.",
      "The pin is a split rod, as on a lab articulator: 5 mm halves on the upper and lower models, the upper half's rounded end resting in a shallow dish on the lower half. It is the same in front of the incisors and either side; to hold an opening, the upper half is longer.",
    ],
  },
  {
    build: 83,
    items: [
      "Remesh no longer runs away on a rough surface: a full-arch scan with detail finer than its triangles could grow to over a million triangles and take minutes; it now takes seconds.",
      "Select in Sculpt has Meshmixer's extras: Connected (the whole of every piece the selection touches), Tidy edge (single triangles sticking out let go, notches filled), Invert connected, and the keys > < E I Shift+I O.",
    ],
  },
  {
    build: 82,
    items: [
      "Select in Sculpt (and Trim in Dental Studio) has a Lasso, as in Meshmixer: drag a loop freehand, or click its corners and click the first to close it. A new loop replaces the selection, Shift adds, Ctrl takes away; Surface I see, Back side and Through apply as for the brush.",
      "Meshmixer's brush keys: [ and ] for the brush size, Ctrl + wheel for the strength, Ctrl while stroking for the opposite effect, Shift to smooth.",
      "Sculpt's brush strength now works like Meshmixer's, measured side by side on the same test plates: Draw grows with about the square of the strength (fine control at low settings; the old brushes were up to seven times stronger), Inflate more gently, and Smooth takes away what Meshmixer's does at the same setting. Strength runs 1 to 100 in steps of 1. A stroke does the same whatever its speed.",
      "Dental Studio: articulated models without the pin again - untick Incisal pin and the models hinge on the condyles alone and close on the teeth to the scanned bite. Moving the opening above 0 mm puts the pin back, since the pin is what holds an opening.",
    ],
  },
  {
    build: 81,
    items: [
      "Sculpt has Meshmixer's edit tools for a selection: Extrude and Offset (a patch moved out or in, joined back by a wall), Bridge (two holes joined into a tube, or two open edges bridged) and Face down on the plate (the part turned so the selected surface sits on the plate).",
      "The selection can be shrunk by a ring and its outline smoothed, as well as grown.",
      "Make solid (under Whole part) rebuilds any part as one closed solid at a chosen detail - holes capped, overlapping shells joined - ready to print or combine.",
    ],
  },
  {
    build: 80,
    items: [
      "The digital wax-up has been taken out of Dental Studio while it is developed further as a module of its own; it is in test builds only for now. Everything else from build 79 stays: the pin in a cup or posts either side, always clear of the teeth; one or two bite scans; Edit design after making; Stop while making; grey scans.",
      "The Model Builder Guide (PDF and in-app) is updated to match.",
    ],
  },
  {
    build: 79,
    items: [
      "Dental Studio has a digital diagnostic wax-up (step 3, optional): library teeth set over the front teeth, canine to canine, and joined to the model when you make it. Wax only adds, so a mock-up from the printed model seats over the teeth without preparing any.",
      "The wax-up follows the order smile design does: you click the midline and the two canine tips; the incisal edges come first (the laterals 0.5 mm shorter, the canine tips following the patient's own smile arc); widths from the space between the midline and the canines; lengths from the central's width-to-length ratio (80%, adjustable). Each tooth stands at least 0.3 mm proud of the patient's.",
      "A table gives every wax tooth's width, length and ratio, and where the design reaches above the gum: the crown lengthening it asks for. Select a tooth to move it in or out, along the arch, longer or shorter, wider or narrower, or turn it, in 0.25 mm and 2 degree steps - the same tooth on the other side follows unless you turn that off.",
      "Nine anterior tooth sets from teethy.org come with Pare 3D, with their owner's permission; you can load your own sets too (OBJ or STL, a Meshmixer part, or one file per tooth).",
      "Every crown point of the scan outside the wax is still checked to the micrometre when the model is made; the points under the wax are counted apart.",
      "The wax-up blends rather than sitting on the teeth: the contacts are closed without changing any tooth's width, and each tooth's cervical third is feathered into the patient's tooth and gum, with no step, as a technician finishes wax.",
      "For injection moulding (GC IMT): the table shows how far each design edge stands past the patient's own; the panel warns where unsupported composite would exceed 0.5 mm, and where the patient's edge would show through (reduction needed). An alternate-tooth model (12, 21, 23 first, as GC's sequence) can be made beside the full model for the two-index technique.",
      "The articulator now locates like a lab articulator: the incisal pin's rounded tip sits in a cone-shaped cup under the upper, one condyle in a groove aimed at it and the other on a flat - six contacts, nothing held twice, so it cannot bind whatever the printer shrinks.",
      "The incisal pin is now part of the lower model, set to the opening you choose (0 to 10 mm at the pin), so there is nothing to lose or fit. The separate pin set and the pin fit test have gone; to work at another opening, edit the design and make the models again.",
      "After Make the panel stays open: Edit design brings back the scans, the wax-up and every setting, and Update models makes the models again in place of the old ones. The scans are kept, hidden, with the models: select a model and open Dental Studio to edit its design later.",
      "Cancel now stops the models being made, at once, leaving everything as it was.",
      "The pin can stand either side instead: a post each side in the premolar region leaves the front teeth clear to see, photograph and seat an index on (chosen for you with a wax-up). The condyles make a true hinge and the posts only stop it closing. Either way the pin and posts now always stand clear of the teeth - proclined incisors could meet the pin before.",
      "A second bite scan: take one each side, as the literature recommends, and Dental Studio checks each against the scanner's bite on its own and lines up on both together, never one side alone.",
      "Scans in Dental Studio, and the models made from them, are grey (#919191); the bite scan stays blue.",
      "The bite message is plain: a tick when the scanner's bite is kept, with no figure; the warning and Line up on the bite scan appear only when the bite scan clearly disagrees. Line up on the bite scan also works again: the choice was dropped on its way to the background worker.",
      "The Model Builder Guide covers the wax-up, injection moulding, the new articulator and pins, and editing a design after making it.",
    ],
  },
  {
    build: 78,
    items: [
      "One articulator in Dental Studio, built so it cannot change the scanned bite: the upper rests on three supports and nothing else - a three-point seat on one ball condyle, a groove on the other and the incisal pin - so it closes to the same place every time and cannot rock. No bands or clips: a keeper under each ball, clear of it while closed, stops the upper lifting off. It opens to 90°. The three joint types, the hinge fit, the protrusion path and the guide table are gone.",
      "The incisal pins print with the models as a set - 0 (the scanned bite) to 6 mm, engraved - and drop into a keyed socket, one way only. Swap a pin to open the bite; the note after making says how far each pin parts the front and back teeth. Ready-made parts has a pin fit test to set the socket for your printer.",
      "The bite is kept exactly as your scanner exported it: arches that arrive in occlusion are no longer fitted to the bite scan again (that moved the lower 0.2 to 0.7 mm on our test sets). The panel says how closely the bite scan agrees, warns when it is more than 0.2 mm off, and offers Line up on the bite scan.",
      "Every model is checked against its scan before it is handed over: the note says how many crown points there were and that every one is where the scan put it, or, if not, how many and where to look.",
      "Retromolar pads and tuberosities that would meet the other model's soft tissue in the bite are trimmed 0.5 mm, as a technician trims a cast's heels, so soft tissue cannot hold the models open. Gum that teeth meet, such as the palate under a deep overbite, is never trimmed, and the note says where it happens. The orthodontic records preset keeps the scans exactly as captured.",
      "The Articulator plate base is now called Plate base (metal articulator), so it is not mistaken for the printed articulator.",
      "The Model Builder Guide has an Accuracy section, how to print and use the articulator, and a protocol for checking how accurately a printed articulator closes.",
      "English is now the master of the interface's wording: other languages show the English sentence wherever theirs has not caught up.",
    ],
  },
  {
    build: 77,
    items: [
      "Dental Studio has the Model Builder Guide as a PDF to download, 28 pages with every screen and setting: the download button in its title bar, and a link in the first step before any scan is in.",
      "A quadrant against a full arch is articulated as a full pair: the hinge has a condyle behind each side of the full arch, on its midline, and the quadrant's base grows into a horseshoe following the full arch's base, carrying both condyle posts and the incisal table. Hinge, hinge and pin hold the models in the bite, so they cannot rock, with or without the pin; the incisal stop is always on for such a pair.",
      "A scan that stops partway round the arch - a quadrant, a half arch, a posterior segment - is set teeth up reliably: its up was read from the plane of its open edge, which also climbs the cut end, and on a cut lower that plane could lie on its side, so the pair was taken as moved apart and the lower came out empty. Tested on a full pair with either arch cut at the midline, past it, or to a posterior segment.",
      "A quadrant against a full arch is levelled and laid out by the full arch, not by the quadrant: levelled by the quadrant alone, the occlusal plane tilted and the other side's teeth of the full arch could be taken for tissue and cut away.",
      "Trim reaches right through the scan by default (Through), so a palate or flap goes in one stroke with no hidden layer left behind; your own choice is remembered. After each cut, what a slicer would call non-manifold - an edge three triangles share, a corner where the scan only touches itself, a loose speck - is tidied away, and the scan stays open.",
      "Dental Studio outlines the step to do next in green once the scans are in, until you have worked in it.",
      "An unexpected error in Dental Studio, Trim or Sculpt now says what to do: try again, Undo or Restore original, trim a ragged edge, and if it happens again, Report this problem.",
      "Trim's crown warning no longer brings up \"Report this problem\": it is a caution, not a fault.",
    ],
  },
  {
    build: 76,
    items: [
      "Right-click a selection for a new Align menu: centre parts on one another or on the workplane (X and Y) in one click, flip over or turn around 180° (set back down on the workplane), mirror left-right or front-back without picking an axis, and the Align, Mirror and Drop tools.",
      "Trim in Dental Studio warns only about the crowns of the teeth - within 6 mm of the cusp tips - not the gum, palate or flaps of tissue it counted before; a few triangles at the edge of a stroke are not warned about. A tall tag of tissue right behind the last molar can still be taken for a tooth.",
      "Erase & Fill, in Trim and in Sculpt: removes what you selected and closes the hole with a smooth patch that carries on the surface round it, for a bubble, spike or void on a scan. The crown warning covers it too.",
      "Import a mesh with more triangles than cutting and grouping handle - a full-arch scan is over the standard 250,000 - and a card offers to raise the limit for that design, to twice the mesh (at least 1,000,000), in one click. It asks once a session; the setting stays in Workspace settings under Show advanced settings.",
      "Undo and Redo buttons in the Trim and Sculpt panel step back through strokes, deletes and fills made since the panel opened - never further back than that.",
      "The gum cut no longer splits thin slivers off along the margin: the line now moves a corner onto itself where it passes close by. On real scans, slivers fell by about a fifth; the rest are on the flat floor, where they make no difference to the print.",
    ],
  },
  {
    build: 75,
    items: [
      "Drag files from your desktop straight onto the editor to import them - no trip through the Import window. A frame shows while you hold them over it; a .lyl design dropped this way opens.",
      "What's new has its own button on the start page, and opens with every build to scroll back through, newest first.",
      "Sculpt opens at once: the panel shows straight away while a big scan is got ready, and getting it ready takes about half the time it did.",
      "Dental Studio in six steps, each on a card of its own that folds to one line: add the scans, prepare them, choose the model, its base (now always open), the articulator (for a pair only) and the name.",
      "Prepare the scans starts with Trim: only Select and Delete, to cut away rough edges, excess gum, tags or the palate before the teeth are checked - the bite stays locked. If what you selected takes in teeth, Delete says so and cuts nothing until you press Delete anyway.",
      "Change the base after choosing a model and the model is marked custom; solid or hollow is chosen with the model, not hidden under more settings.",
      "The articulator picture is redrawn from the side as a dentist reads it: incisors in profile with overjet and overbite, canines and molars in Class I along a curve of Spee, the joint behind the last molar and the incisal pin on its table. With the pin raised the upper turns up about the joint - the front opens, the molars barely part.",
      "A full arch is no longer taken for a quadrant because of a scrap of scan in its middle: on some scans (a tag of tongue, or what a trim left) every base came out as a quadrant's rectangular block, the ortho base among them.",
      "A small tag of scan standing free beside a model (a sliver of cheek or tongue at the end of an arch) is left out and said, rather than the model coming out in two pieces; a loose piece without an articulator is no longer blamed on the hinge.",
      "The model height picture is a section through a molar in its gum on the base, with a bracket for the teeth, the gum kept below them and the base, each to scale.",
      "The model's height shown before it is made is now right: it was measured from the tallest scrap of scan rather than the teeth, and took the depth and the height from different arches - on a real set it said 34 mm for models that came out 26 mm.",
    ],
  },
  {
    build: 74,
    items: [
      "Dental Studio locks the bite in: the first time a set is looked at, the bite the bite scan gives is stored with the two arches and never fitted again. Move the scans apart, trim them, sculpt them or cut the palate away - the models and the articulator keep the bite as scanned. Before, any trim or sculpt could lose it, and fitting again after cutting the palate away moved a real full-arch set by up to 0.3 mm.",
      "Scans are laid out side by side on the plate, teeth up with the front towards you, the bite scan hidden; one click puts them in occlusion and back. Sculpting one scan hides the other, and the orange teeth area moves with its scan and can be switched off.",
      "Restore original upper and lower put a scan back as it was imported, still in the locked bite - the original files stay in the design.",
      "Hollow models are made faster with about 30% fewer triangles: the hidden cavity is simplified, and set a little further in so the wall is never thinner than you asked.",
      "Hollow models with a clean base keep their full wall round the locator notches - cut straight into the shell, the wall there was left about 1 mm.",
      "A single scan still in its scanner's own axes is told upper or lower by which way its teeth point; a lower could be read as an upper before.",
    ],
  },
  {
    build: 73,
    items: [
      "Sculpt works in real time, as in Meshmixer: the surface changes under the brush as you drag, also on a full-arch scan of 300,000 triangles. New brushes: Draw, Pinch, Crease and Move (grab the surface and pull it).",
      "Sculpt's Refine adds triangles where the brush works (Fine, Medium or Coarse), so detail can be shaped on a coarse part, and Symmetry repeats each stroke on the other side, left-right or front-back. Ctrl+Z and Ctrl+Y step through strokes at once, and the view cube can be clicked between strokes.",
      "Remesh, Offset and Thicken run on the same engine: a full-arch scan remeshes in about ten seconds without a voxel rebuild, an open scan stays open with its rim in place, and sharp edges (a model's base, a cut) are kept exactly, as in MeshLab's isotropic remeshing.",
    ],
  },
  {
    build: 72,
    items: [
      "The Export window's slicers can always be chosen. Where the app could not say which slicers are installed - in a web browser, or in a Pare 3D app older than its pages - build 71 greyed them all out. Now the window says which it is: in a browser the file is downloaded for the slicer you pick; an older app is asked to be downloaded again once.",
      "Export has a Parts choice for 3MF and STL: Separate (one file; parts that touch become one, the rest stay apart - the default), Joined (one body) or A file per part (an upper and a lower model as two files, say).",
      "Dental models placed In occlusion export as two bodies again. The upper and lower touch there - cusps between cusps, the incisal pin on its table - and the export joined touching parts of one colour, so a 3MF or STL held the pair as one solid. Models made in Dental Studio are now never joined with each other; a part you put on a model (a label, say) still joins that model.",
    ],
  },
  {
    build: 71,
    items: [
      "Dental Studio's incisal pin really opens the bite now. Before, a raised pin made the table taller and the pin shorter by the same amount, so the printed models still closed on the scanned bite. Now the pin is longer by the raise and the upper stands turned up about the hinge with the pin on its table - a rotation, as on an articulator, not a lift - also when placed In occlusion. The raise is a slider from 0 to 10 mm in half millimetres, read at the pin, and after Make models the note says how far the front and back teeth part.",
      "Export is one blue button now (or Ctrl+E): its window asks where the file opens - a slicer, or nowhere - with Make default to keep that choice, then 3MF or STL, then the file name and folder (Change... picks another), and Export. With a slicer chosen the file is saved in your folder and opened from there. More formats opens the full panel for STEP, OBJ, SVG, DXF, drawings, pictures and design files.",
      "Sculpt's Select brush has a Reach choice, as in Meshmixer: the surface you see, the back side (the side facing away from you, such as the underside of a scan), or through every layer under the brush.",
      "On a laptop the toolbar stays in one row: when the groups would wrap, the least used (Arrange, then Mesh, Combine, ...) fold into one button each with their tools in a list. The plate keeps its height.",
      "The right-click menu is about half as long: the tools sit in four sub-menus - Edges and faces, Surface, Mesh and Mark points.",
      "Split has a Dovetail connector: a key on one half and a slot across the other, so the halves slide together from the side and hold without glue.",
      "Dental Studio: a label typed for a study model now engraves - its open floor is closed for the label (before, the label was silently left off). A Patient details choice keeps the scan names and label on the models, or removes them for plain names (Upper model, Lower model) and no label. New patient starts a new design with the Studio open, so the next patient's scans never mix with the last, and models already made are no longer offered as scans.",
      "The side panel always shows the selected part's size; Sculpt opened from Dental Studio stands beside the Studio panel instead of over it; and the home page counts designs \"on this computer\".",
    ],
  },
  {
    build: 70,
    items: [
      "Send to your slicer, not only Bambu Studio: the menu beside the Send button now picks OrcaSlicer or PrusaSlicer for filament, or PreForm (Formlabs), CHITUBOX or Lychee Slicer for resin. The button says where it sends, and a slicer that is not on this computer is marked. (An app installed before this build sends only to Bambu Studio - download it again once.)",
      "Dental models from scans: a new tile on the home page opens a new design with Dental Studio ready to import the scans.",
      "Dental Studio's Make models button is always on screen now; on a smaller window it was below the bottom edge.",
      "The right-click menu scrolls on a short window instead of running off the bottom, Escape closes Text on a surface from its text box, command search (Ctrl+K) finds Dental Studio, Sculpt and sending by the words you would type (articulator, PreForm, resin...), sizes in the selection card are no longer cut off, and the footer shows Pare 3D's build number.",
    ],
  },
  {
    build: 69,
    items: [
      "New: Sculpt, for imported meshes and scans (Mesh menu, right-click, and Sculpt this scan in Dental Studio's Fix by hand). Brushes smooth, flatten, inflate and deflate the surface you see; the Select brush paints an area to delete, smooth or flatten in one go. Strokes show at once on the full-detail mesh, Ctrl+Z takes them back one at a time, and the part is rebuilt once when you press Done.",
    ],
  },
  {
    build: 68,
    items: [
      "Dental Studio makes the upper and lower of a pair at the same time, in two background workers, instead of one after the other. On a computer with four or more cores an articulated pair comes out about a third sooner.",
      "Importing a scan is quicker: the check that the mesh is closed runs about nine times faster, with the same result.",
      "3MF files - for export and for Send to Bambu Studio - are now made in the background, so the editor keeps answering while a large model is packed.",
      "Fixed: a tooth area corrected by hand in Dental Studio (Fix by hand) was left out when the models were made in the background, so the automatic area was used instead. It is used now.",
    ],
  },
  {
    build: 67,
    items: [
      "Big meshes no longer hold the editor up: grouping, cutting and splitting, reading STL and OBJ files, packing 3MF files (Send to Bambu Studio too), the print estimate and simplifying now run in the background, so the view keeps turning and the buttons keep answering while a large scan is worked on. Opening a project no longer starts hundreds of helpers at once.",
      "An open mesh with small holes in it has them closed before it is cut, split or grouped, and you are told how many; deeply nested groups no longer run out of memory.",
      "Placing and measuring: a new shape snaps to the middle of a face (hold Alt not to), Center on workplane works on a face, Align faces lines up holes on one axis, the right-click menu can select a body hidden behind another, a length typed in the tape measure moves the body, a stood-up ruler measures along itself, and Up and Down (Shift larger, Alt finer) change the number in a field.",
      "Also new: Curve through points in a sketch, Alt and the lift arrow makes a copy upwards, a pattern can group its pieces, a multi-colour SVG comes in as one body per colour, a start view of your own (Settings), a search in the keyboard shortcuts, Shift+N shows or hides notes, and Paste in the middle.",
      "Gridfinity: wall thickness, a chamfer on the stacking lip, sides opened fully or partly, and baseplates padded, fitted to a drawer and with rounded or square corners.",
      "Safer when Pare 3D is hosted on a web server: the store folder refuses direct requests and every saved file is checked.",
    ],
  },
  {
    build: 66,
    items: [
      "Dental Studio shows what each choice makes before you make it: the four model choices and every base (Clean, Follows the scan, With a plate, Orthodontic and Articulator plate - now offered under Adjust the settings too) have a small picture of the base from above.",
      "The Articulator step has a side view of the articulator that follows its settings - the joint behind the molars, the protrusion path drawn at its angle, the incisal pin raised and its table flat or sloped - and each joint (ball snap-in, ball drop-in, clip and axle) has a picture of it in section.",
    ],
  },
  {
    build: 65,
    items: [
      "Fixed: when the two heels of a horseshoe model ended at different places, the articulator's bar at the back could miss the shorter one, leaving that side of the hinge loose. The bar now reaches each heel of each model.",
      "Every model is now checked to be one piece before it is handed over; if any part of the hinge or the incisal stop came out loose, Dental Studio says so instead of letting it go to the printer.",
    ],
  },
  {
    build: 64,
    items: [
      "Dental Studio shows the model's height in one place: a small picture of the teeth (always kept), the gum below them and the base, with the size of each and the whole model's height. Gum below the teeth and the base are set right there, for both arches at once, instead of under Adjust the settings.",
      "Dental Studio has its own chapter in the guide, step by step with pictures: the short way, each of the four steps, the model height, the articulator and its joints, and what Pare 3D always does. The question mark in the panel opens it.",
    ],
  },
  {
    build: 63,
    items: [
      "Ball condyles: the printed articulator's joint is now a 10 mm ball on the lower, behind each last molar like a condyle, seated in a cup on the upper. A ball in a cup centres itself, so the hinge neither slides from side to side nor rocks. Two tongues either side of each cup, freed by slits, bend to let the ball in and hold it just under its widest point - they bend rather than the resin stretching, so it suits brittle model resins. The clip and axle stays as a choice (Joint, in step 4).",
      "The protrusion path, incisal pin and guide table work with the ball condyles: along a path the cup runs forward and down with the ball.",
      "A ball joint fit test joins the hinge fit test (Ready-made parts, and the link beside Hinge fit, which prints the test for the joint you have chosen).",
    ],
  },
  {
    build: 63,
    items: [
      "The articulator's joint is now a choice, under Articulator > Joint. Ball, snap-in (the new default): a 10 mm ball condyle behind each last molar on the lower, held in a cup on the upper by two tongues that flex as it snaps in - it centres itself, so it neither slides from side to side nor rocks, and the tongues bend instead of the resin stretching, for brittle model resins.",
      "Ball, drop-in: the same balls slide into their cups through a channel slanting down and back, and lift out the same way. Nothing snaps or flexes, so nothing can crack; the upper's weight keeps it seated, and it lifts off if pulled. Clip and axle: the hinge of builds 58 to 62.",
      "Each joint has its own fit test: Print a hinge fit test in Dental Studio prints the one for the joint chosen; Ready-made parts > Hinge fit test has all three.",
    ],
  },
  {
    build: 62,
    items: [
      "Dental Studio bevels the bottom edge of the base (0.8 mm at 45 degrees), as 3Shape does, so a scraper gets under the model and it comes off the build plate without chipping. Bevel the bottom edge, under Adjust the settings > Base, turns it off.",
      "Models are cleaned of scan debris before they are handed over: loose flecks under 5 mm³ that would float in the resin vat, and tiny bubbles sealed inside the model that would trap liquid resin. Real hollows stay.",
      "The articulator's protrusion path now starts at 10 degrees, the same 10 to 45 degree range as Medit's.",
      "Tighter hinge: clips are 14 mm long (they were 9.6), so they cannot rock on the axle, and the room along the axle is the fit itself (it was 0.2 mm each side), so they cannot slide from side to side. The standard fit is 0.10 mm, with 0.05 and 0.075 mm offered for printers that can hold them; the hinge fit test prints 0.05 to 0.2 mm."
    ],
  },
  {
    build: 61,
    items: [
      "Dental Studio makes models about 40% faster - a study model pair that took 39 seconds now takes about 23 - and the scans are checked faster as the panel opens. The models come out exactly the same, point for point: only the bookkeeping behind them changed (joining corners, checking the teeth are kept, and the final clean-up for the file).",
      "The articulator's incisal stop is a slim pin now, like an articulator's: a 3 mm pin on the midline between the central incisors onto a small table, 6 mm in front of the models, carried on thin arms along the bottom of the bases - the front teeth stay in view. (It was a wall of two 6 mm posts the full height of the models.)",
      "Fixed: when one arch reached further forward or further back than the other, the shorter model's half of the incisal stop, or its part of the hinge, could miss its base and print loose. Each half now reaches into its own model's base.",
    ],
  },
  {
    build: 60,
    items: [
      "Hinge fit test: Dental Studio's articulator bearing printed small, once for each fit (0.1 to 0.3 mm). Snap each clip onto its axle, pick the tightest that turns without play, and Dental Studio uses that fit from then on. It is under Ready-made parts, and one click away from Hinge fit in Dental Studio.",
      "Protrusion path: the printed articulator can let the lower slide forward along a condylar path, 15 to 45 degrees below the occlusal plane, to check protrusive contacts. Off by default, so the hinge stays a plain hinge with no play.",
      "Incisal pin: raise it 0.5 to 3 mm to hold the models open at the front, and choose a flat table or a 30-degree guide table that parts the models as the lower slides forward.",
      "After making an articulated pair, Dental Studio says how far it opens, and warns if the models would meet before 30 degrees.",
    ],
  },
  {
    build: 59,
    items: [
      "Dental Studio is laid out as four numbered steps - Add the scans, Check the teeth, Choose the model, Articulator - each with one line saying what to do, a tick when it is done, and a line above the button saying what comes next.",
      "Choosing what the model is for now shows the result in one line (base, inside, height); the finer settings are grouped under Adjust the settings (Base, How much scan is kept, Inside), and the label and the printable articulator are no longer hidden there.",
      "Smoother base walls: the outline no longer carries the small ripples and steps it picked up from the scan's footprint, and the corners where it bends round the teeth are rounded off. Teeth are kept exactly as before.",
      "The orthodontic base is symmetric about the midline, as the ABO trims study models: both sides, heels and the back match left and right even when the arch is lopsided.",
    ],
  },
  {
    build: 58,
    items: [
      "Dental Studio's hinge is rebuilt the way printable articulators are: on a full arch a bearing behind each side's last molar, set wide like the jaw's joints, instead of one short clip in the middle - so it turns but does not rock or slide.",
      "The hinge fits close: 0.15 mm round the axle by default (a Hinge fit setting offers 0.1 to 0.3 mm for your printer), 0.2 mm along it, and a firmer snap.",
      "An incisal stop (on by default) adds posts in front of the models that meet as they close, so they close to the scanned bite every time and the posts, not the teeth, take the load.",
    ],
  },
  {
    build: 57,
    items: [
      "Clicker top is the inset clicker kit's top cutter again: a recess with a dowel in the middle whose cross hole pushes onto the switch's stem (build 56's post standing out of the face was wrong).",
      "The gap between the clicker's halves is now chosen on the Clicker base: the pocket sinks the switch so only that much stands out - 2.5 mm by default, enough for a blue switch to click, up to 4.5 mm.",
    ],
  },
  {
    build: 56,
    items: [
      "Clicker in one click each: Add the Clicker base, click the base's flat face, and the pocket goes into the middle of the face and is cut in at once; the same for the Clicker top. No moving, centring or grouping by hand.",
      "The clicker now hides the switch: the base pocket takes the whole switch, its top level with the face (build 54's held only the part under a keyboard plate, so the switch stood out). The top is a post that pushes onto the stem, as long as the gap you choose between the halves: 2.5 mm by default (enough for a blue switch to click), up to 4.5 mm for the full 4 mm press.",
      "Dental Studio: models made in occlusion now stand on the workplane instead of hanging below it, still in their bite.",
      "Dental Studio, editing the tooth area: right-drag turns the model, middle-drag pans and the wheel zooms while a brush or lasso is active, so you can look round the teeth as you paint or erase.",
      "Dental Studio: the painted tooth area turns and moves with its model, and your edits are kept when the model is turned.",
    ],
  },
  {
    build: 55,
    items: [
      "Texture: a new Modify tool presses a pattern into a part's surface, or raises it out of it - knurl, ribs, dimples, hexagons, bricks, weave, stone, leather, wood, fuzzy, or a picture of your own. The faces it stands on stay flat and sharp edges stay crisp.",
      "DXF: import DXF drawings from CAD programs and laser files (lines, arcs, circles, polylines, splines and blocks become a body at real size, holes and all), and export DXF outlines for laser cutters and CNC from the Export window.",
      "Dental Studio: the hinge now always sits behind the molars. On quadrant scans that reach the front teeth the arch was sometimes laid backwards, which put the hinge on the incisors; the hinge is also centred on the molars now instead of on the midline.",
      "Pictures (PNG, JPG) and SVGs import straight away: they no longer wait up to 10 seconds when the geometry engine cannot load.",
      "Under the hood: the editor's biggest file was split into smaller ones (the toolbar, the top bar, clipboard, align and mirror, files), with no change in how anything works.",
    ],
  },
  {
    build: 54,
    items: [
      "Make a clicker: Ready-made parts has a new Clicker group with a Clicker base (the pocket a keyboard switch presses into) and a Clicker top (the recess over the switch, with a keycap socket for its stem). Click Add, then click the flat face of each half: the cutter goes in level with it. Group to cut.",
      "The clicker cutters keep their size so they fit standard Cherry MX style switches: no resize handles, and no taper, twist or wrap.",
    ],
  },
  {
    build: 53,
    items: [
      "Dental Studio's Margin step can now edit the tooth area, the way Medit's model builder does: Pare 3D picks the teeth and tints them orange on the scan; paint more on, erase tissue it took for teeth, or lasso areas in or out, turning the view between strokes.",
      "The model keeps exactly the area you approved plus a band of gum round it (Expand into the gum, 3 mm by default), and cuts the scan smoothly along the band's edge. Back to automatic starts the area again.",
      "The Mesh tools (Repair, Fill hole, Simplify, Cut below, Round) sit on the toolbar as their own buttons instead of in a menu; Repair, Fill hole and Simplify are for imported meshes; Round works on any one solid part, and Cut below on any solid parts, or on every part when nothing is selected.",
      "Cut below the workplane is also in the right-click menu on empty space, where it trims every part.",
    ],
  },
  {
    build: 52,
    items: [
      "Dental Studio cuts the gum along a smooth margin: the edge of the band to keep is smoothed along the surface and the scan is cut exactly on it (triangles split there), so the model's margin is clean instead of ragged. The teeth are never cut.",
      "Step 2 is now Margin: Automatic (Pare 3D finds a smooth margin through the gum and cuts exactly on it) or Draw by hand (you draw the margin; the scan is cut smoothly along your line and nothing more is taken).",
      "Trimming by hand cuts exactly along the line you draw, smoothed: no jagged edge of whole triangles left behind.",
    ],
  },
  {
    build: 51,
    items: [
      "Fixed: build 50's Clean base could cut into the front of proclined teeth. The Clean base is back to build 49's shape, built from the scan's own margin, and the check that no tooth is cut measures the whole tooth zone again.",
      "The base's outline is smoothed before the wall goes up, so the wall below the gum turns gently instead of in rows of vertical stripes.",
      "The Articulator plate base is taken out until it is rebuilt on the same safe margin.",
      "Choose how far the base reaches below the trimmed margin: 3, 5, 10 or 15 mm, or any height on the slider.",
    ],
  },
  {
    build: 50,
    items: [
      "Dental Studio's Clean base now looks like a model builder's: the outline is drawn round the crowns in a smooth band, the wall rises straight from a flat floor to meet the gum all round, the hollow under curving gum is filled, and flaps of tongue or cheek beside the teeth are cut away.",
      "Choose what fills a hollow model: Empty, a Honeycomb base (the bottom 6 mm only) or a full Honeycomb - now with two or three drain slots at the foot of every wall.",
      "Half-round locator notches at the foot of a Clean base, and an optional tie bar across the back of a full arch so it cannot spread while it prints.",
      "A new, optional Articulator plate base: a solid block with square pockets underneath for a magnetic articulator plate.",
      "The height shown for each model is the model's own, not the scan's highest point.",
    ],
  },
  {
    build: 49,
    items: [
      "Dental Studio makes cleaner models: the new Clean base (now the default for study models) cuts the gum level a set depth below the teeth and stands the scan on a smooth, rounded base with straight walls - no rough walls built from the scan's edge.",
      "Hollow models get a honeycomb inside: as stiff as solid for a fraction of the resin or filament, with slots so resin drains through the vents.",
      "Arches are levelled on the cusp tips of every tooth, and a full arch with tall front teeth is no longer taken for a quadrant.",
      "Every Dental Studio model is written as one clean, closed surface with no pinched or open edges, checked on 15 real scans, and a fold of cheek or tongue standing high above the teeth is no longer taken for a tooth.",
      "Make solid now runs Pare's own STL repair engine (from Pare's STL View, Repair & Resize): holes, broken and doubled triangles, folds, pinches and loose crumbs. The Mesh group stays on the toolbar.",
      "Cut below the workplane is in the right-click menu of every solid part.",
    ],
  },
  {
    build: 48,
    items: [
      "Dental Studio: trim a scan by hand - choose the arch, turn the view and draw a line round what to keep (or what to remove). Teeth are never trimmed, even inside the line, and Ctrl+Z takes a trim back.",
      "Named views for each arch: Occlusal, Front, Left, Right and Lingual, each framed on that arch.",
      "Follow the gum line: keep a band of gum of the depth you set all round the teeth and nothing more - the palate and floor of the mouth go.",
      "The scan's ragged edge is smoothed before the base goes on (Off, Low or High; never the teeth), and the panel reads as three steps: scans, trim, model.",
    ],
  },
  {
    build: 47,
    items: [
      "New: Dental Studio, with a place of its own in the toolbar (Dental). It makes printable models from raw intraoral scans - one arch, or an upper and a lower with their bite scan - full arches and quadrants alike. Import the scans from the panel, choose Study model, Ortho study models, Aligner models or Crown & bridge, and click Make model.",
      "No tooth is ever cut off: everything down to below the gum line of the teeth is protected, and every model is checked against its scan before it is handed over.",
      "Upper and lower are fitted onto the bite scan and can be placed in occlusion; orthodontic bases are trimmed the classic way, and a printable snap-on hinge can be added behind the molars.",
      "Quadrant scans are recognised and kept whole, on a base of their own, instead of coming out as a few small blocks of teeth.",
      "Imported files remember where their coordinates were, so scans of one patient keep their places from the scanner. Ctrl+Z brings the scans back after Make model.",
    ],
  },
  {
    build: 46,
    items: [
      "New: Dental model turns a raw intraoral scan into a printable model in two steps. Import the scan (STL, OBJ, PLY or 3MF) and click Dental model on the card that appears, or in the Mesh group. Pare 3D cleans the scan, fills its small holes and turns it teeth up; then choose Study model, Aligner / tray or Crown & bridge and click Make model.",
      "The teeth and gum you keep are the scan itself, untouched; Pare 3D adds straight walls down to a flat base, an optional plate across the arch, and hollows study models with walls of the thickness you set, open underneath so no resin is trapped.",
      "PLY files can be imported.",
    ],
  },
  {
    build: 45,
    items: [
      "The best of layerling 1.100 to 1.103, picked for Pare 3D: the view cube turns the view smoothly instead of jumping, the shape library shows each shape in the colour it will be added in, and the sketch reads and types in your unit (inches too).",
      "Push/pull face: As a body of its own (not grouped) leaves the new part beside the body, ready to resize, move or use as a hole.",
      "Scale by percent works from the keyboard (Ctrl+K, the number, Enter), and the export window works out the material estimate only when you click Calculate, so it opens at once.",
      "Fixes: a cone keeps its radius after ungrouping a resized group, a star keeps its shape when scaled, a text's height no longer changes its letters with Keep proportions on, STEP export includes groups, a turned hollow body and a bent tube keep their stretch, the mouse wheel zooms properly in Firefox and Edge, a fillet no longer leaves a strip over a bay of an imported part or shifts a tapered and leaned body, and OBJ files are written much faster.",
    ],
  },
  {
    build: 44,
    items: [
      "Brought across from layerling 1.96 to 1.99, on top of everything Pare 3D adds: Shift+7, 8, 9 or 0 saves the view, and 7, 8, 9 or 0 brings it back.",
      "Sketches: change a sketch between extrude, revolve and sweep from the badge at the top; close a gap by dragging one open end onto the other; Separate Parts splits a sketch body by its outlines; Esc puts the drawing tool down first.",
      "Key ring holes on name and icon tags can sit on a tab of their own (Free) and be fixed to the tag where you put it, or slide along their side.",
      "Hollow has a Closed (cavity inside) button; holes can be shown more clearly (Settings, Appearance); the history view steps with the mouse wheel; SVG export can write just the footprint on the plate; hinges have an opening angle; gears go up to 500 teeth.",
      "Fixes: tall parts follow the mouse when dragged, trackpad pinch zooms properly in Chrome, imported parts thinner than 1 mm keep their size, SVG files saved as UTF-16 open, deleted designs stay deleted after a backup is restored, a renamed design keeps its name in backups, and phones and tablets get a minus key for negative values.",
    ],
  },
  {
    build: 43,
    items: [
      "Smoother first moments: the brief pause the first time you drag, undo or open a tool in a session (while the graphics card prepares what it draws) is gone or much shorter.",
      "Round a mesh opens straight away on big imported models, the second time and after.",
    ],
  },
  {
    build: 42,
    items: [
      "Push/pull face: the Depth slider is called Height when pulling out, and two new sliders - Move left or right, Move up or down - slide the pulled shape across the face for fine tuning (Back to the middle resets them).",
      "Big imported models (scans of hundreds of thousands of triangles) no longer freeze the window for seconds after a move or an undo, and selecting them is quicker; saving no longer re-reads the whole file each time.",
    ],
  },
  {
    build: 41,
    items: [
      "Detailed parts are much quicker to work with: selecting a sphere at the highest step count, typing a new size or undoing no longer freezes the window for a second or two, and Split opens faster.",
    ],
  },
  {
    build: 40,
    items: [
      "Text that runs past an edge now folds over onto the next face, like a sticker pressed round a corner, instead of sticking out into the air - handy for a short label near the corner of a box.",
      "Dragging text over a detailed part is far smoother: on a sphere at the highest step count each update is about 25 times quicker. The letters are laid a little coarser while you drag and at full detail when you let go.",
    ],
  },
  {
    build: 39,
    items: [
      "Turn a part and the text on it turns with it, exactly - round, tipped over or both. Hollow, fillet or resize the part and the text is laid again on the same spot.",
    ],
  },
  {
    build: 38,
    items: [
      "Placed text sticks to surfaces like a magnet: drag it and it slides over the part under the pointer - curved or flat, round a sphere or onto another part - and is laid there when you let go. No double-click needed.",
      "Move or resize the part and its text goes with it. Text nudged with the arrow keys or the Position fields is laid again on the part where it ends up.",
    ],
  },
  {
    build: 37,
    items: [
      "Thank you for testing Pare 3D! Please try everything - and when something breaks or could be better, use Report a problem / suggest (bottom left, in the Help menu, or the button that appears when a tool shows an error). It goes straight to the person who makes Pare 3D.",
      "Parameters (title row, next to Export): name a size - wall = 2, width = 60 - and type the name into any number field, alone or in a sum (width - 2 * wall). Change it once and every part that uses it follows.",
      "Draft angle (Modify): pick side walls and lean them in by a few degrees, so a part comes out of a mould or a press cleanly.",
      "More sketch rules: hold the angle between two lines, keep a point on a line, and keep two points mirrored about a line.",
      "Fit check runs in the background, so a big assembly keeps the window working; tool windows are tidier and match the properties panel.",
    ],
  },
  {
    build: 36,
    items: [
      "Sketch rules, as in Fusion: select a line (or right-click it) to keep it Horizontal or Vertical or to Lock its length; with two lines selected, keep them Parallel, at right angles or the Same length. Drag a point and the rest of the sketch moves just enough to keep every rule - one corner of a rectangle moves, the far corner stays put.",
      "Each rule shows as a small mark beside its line; click a mark to remove it. Typing a new length on a locked line changes the locked length.",
      "Round a mesh says straight away when a part is only a few millimetres across (usually imported at the wrong scale) instead of working for minutes and failing.",
      "Every guide picture is up to date with the new toolbar, including the sketch pictures.",
    ],
  },
  {
    build: 35,
    items: [
      "A new look for the toolbar: every icon drawn the same way - a thin dark line and a grey fill - each group framed in its own colour, and the tool in use tinted softly in that colour.",
      "Text on a surface works like Bambu Studio's: double-click placed text to change anything - raised or cut in, font, size, depth - drag the letters to slide them across the part, and choose Follow surface, Flat or Wrap around (right round a mug or bottle). A Curve slider bends the line into an arc, and you can add a font file of your own.",
      "Text that runs past an edge no longer falls apart or cuts through the model, and the window says plainly that the text is a preview until you press Add.",
      "Hollow now works after rounding or chamfering the edges, even with walls thicker than the rounding.",
      "Fillet: a size too big for the picked edges drops to the largest that fits by itself, and says so.",
      "Sketches: drag any point with whichever tool is picked (no need to press Select first), double-click a line to add a point, and right-click a line or a point for add, remove, curve, straighten, corner, smooth, fillet and chamfer.",
      "A smaller, tidier properties panel: Properties, Position, Rotation, Taper, Twist & Lean, then Wrap around a cylinder. Print helpers is gone - brims and hole compensation are set in the slicer.",
      "Every Modify tool has its own button again (Push/pull face is back in view), Round a mesh keeps the window working while it runs, and Make it flexi and the duplicate Text on a face are gone.",
    ],
  },
  {
    build: 34,
    items: [
      "Text on any surface, like Bambu Studio: click the T in Modify (or right-click a part > Add text here), type, click anywhere on a part - the letters hug flat, curved, domed and imported surfaces, raised or cut in. Click elsewhere to move it; font, size, depth and turn change it at once.",
      "The text stays editable: select it and click T again to change the words or move it, then Update. Group it with the part when it is final.",
      "On the side of a cylinder or tube the text wraps exactly round it; raised text now sits a little into the wall so it always joins it.",
    ],
  },
  {
    build: 33,
    items: [
      "Tool tracing into a Gridfinity bin: lay several tools on one sheet of paper, photograph them, and Photo to outline > Gridfinity bin makes a bin just big enough, with a pocket (and a finger notch) for each tool.",
      "Make it flexi: cut any model into segments joined by print-in-place joints - a flexi toy that prints in one go (Modify, or right-click).",
      "Hull (Combine): wrap the selected parts in one smooth body - two cylinders become a rounded slot.",
      "Fit check (Arrange): overlaps show in red, and pairs closer than the clearance are listed; it checks again as you move parts.",
      "Round a mesh: round every edge of an imported model, a scan or any part by one radius - outside edges, inside corners or both - where the fillet tool cannot go.",
      "Text on curved faces: Text on a face set down on the side of a cylinder or tube now wraps round it, raised or cut in.",
      "The Mesh tools are one button with a menu, so the toolbar no longer wraps when an imported model is selected.",
    ],
  },
  {
    build: 32,
    items: [
      "Saving no longer runs out of room in the Mac and Windows app: designs are now kept as files on your disk, and those saved before are moved there by themselves. (This needs the new download once - the auto-update cannot replace the part that stores them.)",
      "Fillet and chamfer in one window: switch between Round, Chamfer and Chamfillet at the top; click a size (0.5 to 5 mm) or Largest that fits; pick Outside edges or Inside edges in one click. The last size you used comes back next time.",
      "For fine work, under More options: a chamfer with two different distances (and Swap sides), and a fillet whose radius changes along the edge.",
      "Tinkercad-style property rows: the value box rides on its slider - drag it, or click it and type. Length, width, height and the rest take half the room.",
      "One Make button: ready-made parts in groups (fixings, containers, moving parts, print helpers), with Lithophane, Photo to outline and Voronoi in the same window.",
      "A Mesh group appears in the toolbar while an imported model is selected: Make solid, Fill hole, Simplify and Cut below.",
      "Blend, Hollow and Pattern show the main settings first; the rest is under More options.",
      "A Linux version: Pare-3D-Linux.tar.gz on the releases page, beside the Mac and Windows downloads.",
    ],
  },
  {
    build: 31,
    items: [
      "Blend: Keep the diameter - every slice stands square to the path like a pipe, so an S-bend between two offset parts stays as thick as the parts instead of thinning. If the parts are too close for that, the Blend window says how many mm further apart they need to be.",
    ],
  },
  {
    build: 30,
    items: [
      "Imported meshes are checked: if an STL, OBJ or 3MF is not watertight, a card says so and Make solid repairs it (a face with a hole in it closes as a ring, the hole stays open). Right-click > Check and make solid runs it any time.",
      "Fill a hole: right-click an imported part > Fill a hole, then click the inside wall of a screw hole, bore or nut trap - it is filled flush. Round, square and hex holes, through or blind.",
      "Cut below the bed: trims what sinks under the plate (as the slicer would) - from Ready to print? or the command search. Ungroup takes it back.",
      "New ready-made parts: a jar with a screw-on lid, and a flexi chain of segments with print-in-place joints.",
      "An STL whose file has no normals no longer shows up black.",
    ],
  },
  {
    build: 29,
    items: [
      "Blend makes an exact CAD piece: fillet, chamfer and hollow now work on blended parts (before, they stopped at \"This mesh has 16,512 triangles\"), and STEP keeps the blend exact.",
      "Change a blend later: select it and click Blend again - its settings and faces come back; change them and click Update.",
      "Smoothness per end: switch off \"Same at both ends\" to flare out square from one part and ease gently into the other, like the tangency weight of a Fusion loft.",
      "Join into one part, or keep the piece separate (Fusion's Join / New body).",
      "Opening Pare 3D after installing a new download no longer shows an older build: an older copy still running in the background is replaced. (If an app from before build 29 shows an old build, restart your computer once.)",
    ],
  },
  {
    build: 28,
    items: [
      "Blend keeps hollows: blending two hollow parts (tubes, a hollowed box and a hollowed cylinder) makes a sleeve, so the result is one tube open all the way through. \"Hollow through\" in the Blend window switches it off for a solid piece.",
      "Hollow at will: on a part that is already hollow, clicking another face adds that side - a cup open at the top can be opened at the bottom too, without the top filling in.",
      "The sides Hollow will leave open stay shaded grey on the part until you press Hollow.",
      "Rotation rows match the arrows: About X is red, About Y green, About Z blue - the same colours as the turning arrows on the workplane.",
    ],
  },
  {
    build: 27,
    items: [
      "Hollow fixed: clicking a face of the part now opens that side. Before, clicking the top (already open by default) closed it, so the box came out sealed and looked unchanged.",
      "Hollowing a part that is already hollow - or one hollowed and then resized - now replaces its hollowing instead of failing with \"This body cannot be hollowed\".",
      "A sealed hollow (no side open) says so after hollowing, since it looks solid from outside.",
    ],
  },
  {
    build: 26,
    items: [
      "Pare 3D is now English only: the language menu is gone, and the app and its guide speak one language.",
      "The user guide (in Help) is rewritten for every tool: push/pull by dragging, Blend, Pattern by dragging, fillet and hollow on faces, Space out, Ready-made parts, Lithophane, Voronoi, Photo to outline, Ready to print?, Print fit and the fit test, Send to Bambu Studio, and where files and backups go.",
      "The ? in the Blend, Lithophane, Voronoi and Photo to outline windows opens the part of the guide about them.",
    ],
  },
  {
    build: 25,
    items: [
      "Blend (Combine group): select two parts and get a smooth piece joining their facing flat faces - two cylinders of different sizes flare into each other, square to both ends. Set the smoothness, then Enter.",
      "Fillet and chamfer: click a face to pick all its edges, and drag a picked edge into the part to set the size, with the live preview.",
      "Hollow: click a face of the part to open or close that side, and drag a face inward to set the wall thickness. Enter hollows.",
      "Pattern: drag a copy to space a row out or swing a circle round; + and − while dragging change the count. Enter creates.",
    ],
  },
  {
    build: 24,
    items: [
      "Push/pull works like Fusion's Press Pull: after you drag a face and let go, the new part stays a live preview. Change the depth, corner radius or inset, or drag it again, then Create (or Enter). Esc cancels.",
      "The preview keeps up with the drag much more smoothly.",
    ],
  },
  {
    build: 23,
    items: [
      "Push/pull by dragging: with Push/pull face on, press on a flat face and drag it out to add material or in to cut a pocket. The depth shows beside the pointer; Shift for fine steps, type a number for an exact depth, Esc to stop.",
      "The \"older app\" note is gone from the home screen. Settings > Files mentions it only where choosing folders needs the newer app.",
    ],
  },
  {
    build: 22,
    items: [
      "A calmer home screen: the backup box is now one quiet line, and the examples panel is gone.",
      "Choose where exports and backups are saved (Settings > Files), or have Pare 3D ask each time. After a save, \"Show in folder\" takes you there.",
      "The Shapes panel is open whenever a design opens.",
      "Round shapes start with \"Sides follow the size\" off, so the Sides slider works straight away for smoother curves.",
    ],
  },
  {
    build: 21,
    items: [
      "Eight new basic shapes, each next to its nearest relative: rounded and bevelled cylinders, pie slice, ring segment, gusset, arrow, spiral ramp and a geodesic ball.",
      "Photo to outline (Make > Trace): turn a photo of a tool or template into a cut-out for a tray, or a solid shape.",
      "Electronics enclosure in Ready-made parts: a box for a circuit board with standoffs, port cut-outs and a vented lid.",
      "Fit test: print it once, pick the hole that fits, and Print fit offers it as \"My printer\".",
      "Split to fit: a part too big for the plate is cut into pieces with dowel holes, from Ready to print?",
      "Ready-made parts has its own window: its button in the Make group opens and closes it, with clearer pictures.",
      "A part's settings start folded up: open only the sections you need.",
    ],
  },
  {
    build: 20,
    items: [
      "A calmer toolbar: quiet group tiles instead of coloured frames.",
      "Smart guides: while you drag, lines show when edges or centres line up, with the gap in mm.",
      "\"Saved\" next to the design name, so you can see your work is kept.",
      "A spinner while slow jobs (grouping, fillets, exports) are working.",
      "The view glides when you use the view cube, Home or Center view.",
      "Clearer greyed-out tools, stronger keyboard focus, and Send feedback in the Help menu.",
      "A search box in Settings, and Multicolour, Centre and Colour spelt the Australian way.",
    ],
  },
  {
    build: 19,
    items: [
      "Ready to print? - Send to Bambu Studio first checks for floating parts, loose holes, thin walls, big overhangs and parts past the plate.",
      "Select several parts to see their overall size, and type a new size to scale them all together.",
      "Examples open zoomed to fit; clearer \"over the left edge\" warnings.",
    ],
  },
  {
    build: 18,
    items: [
      "Instant tips with plain words on every toolbar and camera button.",
      "The shape panel floats over the view; Push/pull face; Open or import.",
      "Origin distances are off by default (turn them on in Settings).",
    ],
  },
  {
    build: 17,
    items: [
      "One Help menu, tool names under icons (Help > Show tool names), and a \"New to 3D design?\" start.",
      "Three examples to start from: a box with a lid, a name keyring and a phone stand.",
      "Sketch: draw first, then choose Pull up, Spin round or Follow a path.",
      "Settings: the everyday choices first, the rest under Show advanced settings.",
    ],
  },
];

/** The notes for the builds after `since` up to `current`, newest first. */
export function whatsNewSince(since: number, current: number) {
  return WHATS_NEW.filter((entry) => entry.build > since && entry.build <= current).sort((a, b) => b.build - a.build);
}
