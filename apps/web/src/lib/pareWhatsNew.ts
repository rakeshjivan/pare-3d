/*
 * Fork (build 20): what each build brought, shown once after an update ("What's new") and from
 * the Help menu. Plain words, the few things a person would notice; English, as release notes.
 */
export const WHATS_NEW: ReadonlyArray<{ build: number; items: readonly string[] }> = [
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
