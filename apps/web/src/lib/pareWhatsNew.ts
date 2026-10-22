/*
 * Fork (build 20): what each build brought, shown once after an update ("What's new") and from
 * the Help menu. Plain words, the few things a person would notice; English, as release notes.
 */
export const WHATS_NEW: ReadonlyArray<{ build: number; items: readonly string[] }> = [
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
