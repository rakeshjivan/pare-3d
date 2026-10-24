/**
 * Fork: Pare 3D's own icons for the main toolbar tools - bolder and simpler than
 * the originals, drawn so people coming from beginner CAD tools recognise the idea
 * at a glance. Original artwork. The part a tool acts on is filled in the accent
 * colour (class "fork-accent"), which turns grey while the tool is unavailable.
 * Tools without an entry here keep their original icon (see FORK_TOOL_ICONS).
 */
import type { ComponentType, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function ForkIcon({ className, children, ...props }: IconProps) {
  return (
    <svg
      className={["fork-icon", className].filter(Boolean).join(" ")}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

const ACCENT = { className: "fork-accent", stroke: "none" } as const;
const SOFT = { fill: "currentColor", opacity: 0.12, stroke: "none" } as const;

export function ForkHomeIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <path d="M8 23 24 9l16 14" />
      <path d="M12 20v18h24V20" {...SOFT} />
      <path d="M12 20v18h24V20" />
      <rect x="20" y="27" width="8" height="11" rx="1.5" {...ACCENT} />
    </ForkIcon>
  );
}

export function ForkCopyIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <rect x="8" y="8" width="22" height="22" rx="4" />
      <rect x="18" y="18" width="22" height="22" rx="4" {...ACCENT} />
      <rect x="18" y="18" width="22" height="22" rx="4" />
    </ForkIcon>
  );
}

export function ForkPasteIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <rect x="10" y="10" width="28" height="31" rx="4" {...SOFT} />
      <rect x="10" y="10" width="28" height="31" rx="4" />
      <rect x="17" y="6" width="14" height="8" rx="2.5" {...ACCENT} />
      <rect x="17" y="6" width="14" height="8" rx="2.5" />
      <path d="M17 24h14M17 31h10" />
    </ForkIcon>
  );
}

export function ForkDuplicateIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <rect x="7" y="7" width="22" height="22" rx="4" {...SOFT} />
      <rect x="7" y="7" width="22" height="22" rx="4" />
      <circle cx="33" cy="33" r="10" {...ACCENT} />
      <path d="M33 28v10M28 33h10" stroke="#fff" />
    </ForkIcon>
  );
}

export function ForkDeleteIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <path d="M8 13h32" />
      <path d="M19 13V8h10v5" />
      <path d="M12 13l2 26a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3l2-26" {...SOFT} />
      <path d="M12 13l2 26a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3l2-26" />
      <path d="M20 21v13M28 21v13" />
    </ForkIcon>
  );
}

export function ForkUndoIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <path d="M14 20h16a10 10 0 0 1 0 20H18" strokeWidth="4" />
      <path d="M6 20 15 11v18Z" {...ACCENT} />
    </ForkIcon>
  );
}

export function ForkRedoIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <path d="M34 20H18a10 10 0 0 0 0 20h12" strokeWidth="4" />
      <path d="M42 20 33 11v18Z" {...ACCENT} />
    </ForkIcon>
  );
}

/** Two shapes joined into one outline. */
export function ForkGroupIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <path d="M8 10h18v8h0a10 10 0 1 1 0 20H8Z" {...ACCENT} />
      <path d="M8 10h18v8a10 10 0 1 1 0 20H8Z" />
      <path d="M26 18v20" strokeDasharray="2.5 4" opacity="0.55" />
    </ForkIcon>
  );
}

/** The same two shapes pulled apart. */
export function ForkUngroupIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <rect x="5" y="10" width="16" height="28" rx="2.5" {...SOFT} />
      <rect x="5" y="10" width="16" height="28" rx="2.5" />
      <circle cx="33" cy="28" r="10" {...ACCENT} />
      <circle cx="33" cy="28" r="10" />
      <path d="M22 8l4-4M26 12l4-4" opacity="0.6" />
    </ForkIcon>
  );
}

/** Only the overlap of two shapes is kept. */
export function ForkIntersectIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <circle cx="18" cy="24" r="12" strokeDasharray="3 3.5" />
      <circle cx="30" cy="24" r="12" strokeDasharray="3 3.5" />
      <path d="M24 13.6a12 12 0 0 1 0 20.8 12 12 0 0 1 0-20.8Z" {...ACCENT} />
      <path d="M24 13.6a12 12 0 0 1 0 20.8 12 12 0 0 1 0-20.8Z" />
    </ForkIcon>
  );
}

export function ForkMirrorIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <path d="M24 5v38" strokeDasharray="4 4" />
      <path d="M19 12 6 36h13Z" {...ACCENT} />
      <path d="M19 12 6 36h13Z" />
      <path d="M29 12l13 24H29Z" />
    </ForkIcon>
  );
}

/** Three bars lined up against a guide on the left. */
export function ForkAlignIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <path d="M8 5v38" />
      <rect x="13" y="9" width="26" height="8" rx="2" {...ACCENT} />
      <rect x="13" y="20" width="16" height="8" rx="2" {...SOFT} />
      <rect x="13" y="20" width="16" height="8" rx="2" />
      <rect x="13" y="31" width="21" height="8" rx="2" {...SOFT} />
      <rect x="13" y="31" width="21" height="8" rx="2" />
    </ForkIcon>
  );
}

export function ForkDropIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <rect x="15" y="5" width="18" height="14" rx="2.5" {...ACCENT} />
      <path d="M24 23v11" />
      <path d="M18 29l6 6 6-6" />
      <path d="M6 41h36" strokeWidth="4" />
    </ForkIcon>
  );
}

export function ForkCenterIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <path d="M6 33 18 21h24L30 33Z" {...SOFT} />
      <path d="M6 33 18 21h24L30 33Z" />
      <rect x="18" y="11" width="12" height="12" rx="2" {...ACCENT} />
      <path d="M24 3v5M24 36v8" strokeDasharray="2 3" />
    </ForkIcon>
  );
}

export function ForkHideIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <path d="M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24Z" {...SOFT} />
      <path d="M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24Z" />
      <circle cx="24" cy="24" r="6" {...ACCENT} />
      <path d="M8 40 40 8" strokeWidth="3.6" />
    </ForkIcon>
  );
}

export function ForkNoteIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <path d="M8 8h32v24L30 42H8Z" {...SOFT} />
      <path d="M8 8h32v24L30 42H8Z" />
      <path d="M30 42V32h10" {...ACCENT} />
      <path d="M15 17h18M15 24h12" />
    </ForkIcon>
  );
}

export function ForkImportIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <path d="M8 28v10a3 3 0 0 0 3 3h26a3 3 0 0 0 3-3V28" />
      <path d="M24 5v24" strokeWidth="4" />
      <path d="M14 20l10 10 10-10" fill="none" />
      <path d="M17 30h14l-7 7Z" {...ACCENT} />
    </ForkIcon>
  );
}

export function ForkExportIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <path d="M8 28v10a3 3 0 0 0 3 3h26a3 3 0 0 0 3-3V28" />
      <path d="M24 31V12" strokeWidth="4" />
      <path d="M14 5h20l-10 10Z" {...ACCENT} transform="rotate(180 24 10)" />
    </ForkIcon>
  );
}

export function ForkShapesIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <rect x="6" y="20" width="18" height="18" rx="3" {...SOFT} />
      <rect x="6" y="20" width="18" height="18" rx="3" />
      <circle cx="31" cy="14" r="9" />
      <circle cx="35" cy="35" r="9" {...ACCENT} />
      <circle cx="35" cy="35" r="9" />
      <path d="M35 30.5v9M30.5 35h9" />
    </ForkIcon>
  );
}

/** Fork (build 37): Draft angle - a block whose sides lean in towards the top, one side in the accent colour. */
export function ForkDraftIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <path d="M10 40 15 10h18l5 30Z" {...SOFT} />
      <path d="M33 10 38 40H28l-3-30Z" {...ACCENT} />
      <path d="M10 40 15 10h18l5 30Z" />
      <path d="M33 10v30" strokeDasharray="2.5 3" />
    </ForkIcon>
  );
}

/** Fork (build 46): Dental model - a molar standing on a base block, the base in the accent colour. */
export function ForkToothIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <rect x="7" y="33" width="34" height="9" rx="2" {...ACCENT} />
      <path d="M13 9c3-3 7-2 11 0 4-2 8-3 11 0 4 4 2 11 0 15-1 3-1 6-2 9h-4l-2-7c-1-2-5-2-6 0l-2 7h-4c-1-3-1-6-2-9-2-4-4-11 0-15Z" {...SOFT} />
      <path d="M13 9c3-3 7-2 11 0 4-2 8-3 11 0 4 4 2 11 0 15-1 3-1 6-2 9h-4l-2-7c-1-2-5-2-6 0l-2 7h-4c-1-3-1-6-2-9-2-4-4-11 0-15Z" />
      <rect x="7" y="33" width="34" height="9" rx="2" />
    </ForkIcon>
  );
}

/** Fork (build 25): Blend - a wide end and a narrow end joined by a smooth flare, the flare in the accent colour. */
export function ForkBlendIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <path d="M14 15c8 0 10 5 16 6.5S34 22 34 22v4s-0 0-4 .5S22 33 14 33Z" {...ACCENT} />
      <rect x="4" y="13" width="10" height="22" rx="2" {...SOFT} />
      <rect x="4" y="13" width="10" height="22" rx="2" />
      <rect x="34" y="19" width="10" height="10" rx="2" {...SOFT} />
      <rect x="34" y="19" width="10" height="10" rx="2" />
      <path d="M14 13c9 0 11 6 20 6M14 35c9 0 11-6 20-6" />
    </ForkIcon>
  );
}

/** Tool id (as in data-layerling-tool) to its Pare 3D icon. */
export function ForkReadyPartsIcon(props: IconProps) {
  // Fork (build 22): finer - a box and a nut, drawn in line; the nut's hole carries the colour.
  return (
    <ForkIcon strokeWidth="2.4" {...props}>
      <rect x="6" y="21" width="24" height="18" rx="3" {...SOFT} />
      <rect x="6" y="21" width="24" height="18" rx="3" />
      <path d="M6 27h24" />
      <path d="M34 7.5 41.5 12v9L34 25.5 26.5 21v-9Z" />
      <circle cx="34" cy="16.5" r="3.2" {...ACCENT} />
    </ForkIcon>
  );
}

export function ForkLithophaneIcon(props: IconProps) {
  // Fork (build 22): finer - a framed picture with a hill line and a sun.
  return (
    <ForkIcon strokeWidth="2.4" {...props}>
      <rect x="8" y="8" width="32" height="32" rx="3.5" {...SOFT} />
      <rect x="8" y="8" width="32" height="32" rx="3.5" />
      <path d="M12 34l8.5-10 6 7 4-4.5L36 33" />
      <circle cx="30" cy="17" r="3.4" {...ACCENT} />
    </ForkIcon>
  );
}

/** Fork (build 21): photo to outline - a photo with a traced line round a spanner shape. */
export function ForkTraceIcon(props: IconProps) {
  // Fork (build 22): finer - crop corners round a spanner outline traced in the accent colour.
  return (
    <ForkIcon strokeWidth="2.4" {...props}>
      <path d="M7 15V10a3 3 0 0 1 3-3h5M33 7h5a3 3 0 0 1 3 3v5M41 33v5a3 3 0 0 1-3 3h-5M15 41h-5a3 3 0 0 1-3-3v-5" />
      <path d="M15.5 30.5 25 21a6 6 0 1 1 3 3l-9.5 9.5a2.1 2.1 0 0 1-3-3Z" className="fork-accent-line" />
    </ForkIcon>
  );
}

export function ForkVoronoiIcon(props: IconProps) {
  // Fork (build 22): finer - a panel of cells, one of them coloured.
  return (
    <ForkIcon strokeWidth="2.4" {...props}>
      <rect x="7" y="8" width="34" height="32" rx="3.5" {...SOFT} />
      <rect x="7" y="8" width="34" height="32" rx="3.5" />
      <path d="M7 21l9-2 5-11M16 19l4 9 9 2 12-5M29 30l-3 10M20 28L7 33M29 30l4-22" strokeWidth="1.8" />
      <path d="M21.5 21.5 26 20.6l2 5.4-5.2.9Z" {...ACCENT} />
    </ForkIcon>
  );
}

export function ForkSpaceOutIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <rect x="5" y="16" width="9" height="16" rx="1.5" {...ACCENT} />
      <rect x="20" y="16" width="9" height="16" rx="1.5" {...SOFT} />
      <rect x="20" y="16" width="9" height="16" rx="1.5" />
      <rect x="35" y="16" width="8" height="16" rx="1.5" />
      <path d="M14 38h6M29 38h6M14 36v4M20 36v4M29 36v4M35 36v4" strokeWidth="2.4" />
    </ForkIcon>
  );
}

export const FORK_TOOL_ICONS: Readonly<Record<string, ComponentType<IconProps>>> = {
  readyParts: ForkReadyPartsIcon,
  blendBodies: ForkBlendIcon,
  lithophane: ForkLithophaneIcon,
  voronoi: ForkVoronoiIcon,
  spaceOut: ForkSpaceOutIcon,
  copy: ForkCopyIcon,
  paste: ForkPasteIcon,
  duplicate: ForkDuplicateIcon,
  delete: ForkDeleteIcon,
  undo: ForkUndoIcon,
  redo: ForkRedoIcon,
  group: ForkGroupIcon,
  ungroup: ForkUngroupIcon,
  intersect: ForkIntersectIcon,
  mirror: ForkMirrorIcon,
  align: ForkAlignIcon,
  drop: ForkDropIcon,
  center: ForkCenterIcon,
  "toggle-hidden": ForkHideIcon,
};

/** Short names under the icons (English; other languages show their full name, shortened). */
export const FORK_SHORT_LABELS_EN: Readonly<Record<string, string>> = {
  readyParts: "Make",
  lithophane: "Lithophane",
  voronoi: "Voronoi",
  trace: "Trace",
  blendBodies: "Blend",
  spaceOut: "Space out",
  copy: "Copy",
  paste: "Paste",
  duplicate: "Duplicate",
  delete: "Delete",
  undo: "Undo",
  redo: "Redo",
  history: "History",
  outliner: "Objects",
  "toggle-hidden": "Hide",
  group: "Group",
  bundle: "Bundle",
  ungroup: "Ungroup",
  intersect: "Intersect",
  "intersect-preview": "Preview",
  mirror: "Mirror",
  pivot: "Pivot",
  array: "Pattern",
  holePattern: "Holes",
  faceTool: "Push/pull",
  split: "Split",
  chamfer: "Chamfer",
  fillet: "Fillet",
  hollow: "Hollow",
  deleteFace: "Del face",
  simplify: "Simplify",
  meshCheck: "Repair",
  fillHole: "Fill hole",
  cutBelowBed: "Cut below",
  hull: "Hull",
  fitCheck: "Fit check",
  roundMesh: "Round",
  dentalModel: "Dental",
  roundAll: "Round all",
  surfaceText: "Text",
  align: "Align",
  snap: "Snap",
  drop: "Drop",
  layFlat: "Lay flat",
  mateFaces: "Mate",
  center: "Center",
};

/**
 * Fork (build 33): Modify tools kept under a "More" button. Since build 35 there is room for all of
 * them on the row (the Mesh group is one button), so none are hidden; the button shows only if a
 * tool is listed here again.
 */
export const FORK_OVERFLOW_TOOLS: ReadonlySet<string> = new Set<string>();

/** The advanced tools shown in the toolbar's "More" menu rather than on the row itself. */
export const FORK_MORE_TOOLS: ReadonlySet<string> = new Set([
  "intersect-preview",
  "pivot",
  "array",
  "holePattern",
  "faceTool",
  "split",
  "hollow",
  "deleteFace",
  "roundAll",
  "snap",
  "layFlat",
  "mateFaces",
]);

/**
 * Fork: a few plain words after each tool's name in its hover tip (English only), so the usual
 * names stay on the buttons - the ones tutorials and other CAD programs use - and a newcomer still
 * learns what each one does.
 */
export const FORK_TOOL_HINTS_EN: Readonly<Record<string, string>> = {
  copy: "copy the selection",
  paste: "paste what you copied",
  duplicate: "make a copy in place",
  delete: "remove the selection",
  undo: "step back",
  redo: "step forward again",
  history: "look back at earlier versions",
  outliner: "list every part in the design",
  "toggle-hidden": "hide or show the selection",
  group: "join parts into one; holes cut the solids",
  bundle: "keep parts together without merging them",
  ungroup: "take a group apart again",
  intersect: "keep only where the parts overlap",
  "intersect-preview": "see where the parts overlap, without changing them",
  mirror: "flip the selection",
  pivot: "choose the point a part turns around",
  array: "repeat a part in a row, grid or circle",
  holePattern: "a pattern of holes or slots, such as a vent",
  faceTool: "thicken a flat face, or sink a pocket into it",
  split: "cut a part in two with a plane",
  chamfer: "cut an edge at an angle",
  fillet: "round off an edge",
  hollow: "make a part hollow with walls",
  deleteFace: "remove a fillet, hole or boss and close the gap",
  simplify: "fewer triangles, for heavy imported models",
  meshCheck: "repair an imported model so it prints: holes, broken and doubled triangles, folds and loose pieces",
  fillHole: "click the wall of a hole in an imported model to fill it in",
  cutBelowBed: "trim off what sinks below the plate",
  hull: "wrap the selected parts in one smooth body - two cylinders become a rounded slot",
  fitCheck: "find parts that overlap or sit too close to print apart or move",
  roundMesh: "round every edge by one radius, also on imported meshes",
  dentalModel: "raw intraoral scans (upper, lower and bite; full arches or quadrants) to printable models",
  roundAll: "round every edge by one radius, also where the fillet tool cannot",
  surfaceText: "click any part to put text on it - it hugs flat and curved surfaces, raised or cut in",
  align: "line parts up with each other",
  mateFaces: "put one part's face flat against another's",
  readyParts: "ready-made parts (boxes, inserts, clips, hinges, jars) and makers that start from a picture",
  lithophane: "a photo that shows when light shines through",
  voronoi: "an organic web pattern for panels and vents",
  trace: "photo of a tool or logo on paper to an outline at its real size",
  blendBodies: "join two selected parts with a smooth piece between their facing flat faces",
  spaceOut: "space parts evenly or arrange them on the plate",
};
