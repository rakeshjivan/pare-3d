/*
 * Fork (build 20): what each build brought, shown once after an update ("What's new") and from
 * the Help menu. Plain words, the few things a person would notice; English, as release notes.
 */
export const WHATS_NEW: ReadonlyArray<{ build: number; items: readonly string[] }> = [
  {
    build: 56,
    items: [
      "Clicker in one click each: Add the Clicker base, click the base's flat face, and the pocket goes into the middle of the face and is cut in at once; the same for the Clicker top. No moving, centring or grouping by hand.",
      "The clicker now hides the switch: the base pocket takes the whole switch, its top level with the face (build 54's held only the part under a keyboard plate, so the switch stood out). The top is a post that pushes onto the stem, as long as the gap you choose between the halves: 2.5 mm by default (enough for a blue switch to click), up to 4.5 mm for the full 4 mm press.",
      "Dental Studio: models made in occlusion now stand on the workplane instead of hanging below it, still in their bite.",
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
