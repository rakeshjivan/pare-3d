/*
 * Fork (build 20): what each build brought, shown once after an update ("What's new") and from
 * the Help menu. Plain words, the few things a person would notice; English, as release notes.
 */
export const WHATS_NEW: ReadonlyArray<{ build: number; items: readonly string[] }> = [
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
