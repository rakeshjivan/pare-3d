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
      <path d="M35 30v10M30 35h10" stroke="#fff" />
    </ForkIcon>
  );
}

/** Tool id (as in data-layerling-tool) to its Pare 3D icon. */
export function ForkReadyPartsIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <rect x="7" y="20" width="22" height="18" rx="2" {...SOFT} />
      <rect x="7" y="20" width="22" height="18" rx="2" />
      <path d="M7 26h22M18 20v18" />
      <path d="M32 10l8 4.5v9L32 28l-8-4.5v-9Z" {...ACCENT} />
    </ForkIcon>
  );
}

export function ForkLithophaneIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <rect x="9" y="7" width="26" height="32" rx="2" {...SOFT} />
      <rect x="9" y="7" width="26" height="32" rx="2" />
      <path d="M13 33l7-9 5 6 3-4 5 7" />
      <circle cx="26" cy="15" r="3" {...ACCENT} />
      <path d="M40 14l4-3M41 22h4M40 30l4 3" />
    </ForkIcon>
  );
}

export function ForkVoronoiIcon(props: IconProps) {
  return (
    <ForkIcon {...props}>
      <rect x="6" y="8" width="36" height="32" rx="3" {...SOFT} />
      <rect x="6" y="8" width="36" height="32" rx="3" />
      <path d="M6 20l9-2 6-10M15 18l4 10 9 2 14-6M28 30l-3 10M19 28l-13 6M28 30l5-22" />
      <path d="M21 21l5-1 2 6-6 1Z" {...ACCENT} />
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
  readyParts: "Parts",
  lithophane: "Lithophane",
  voronoi: "Voronoi",
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
  bundle: "Together",
  ungroup: "Ungroup",
  intersect: "Overlap",
  "intersect-preview": "Preview",
  mirror: "Mirror",
  pivot: "Turn point",
  array: "Pattern",
  holePattern: "Holes",
  faceTool: "Face",
  split: "Split",
  chamfer: "Chamfer",
  fillet: "Fillet",
  hollow: "Hollow",
  deleteFace: "Remove",
  simplify: "Reduce",
  align: "Align",
  snap: "Snap",
  drop: "Drop",
  layFlat: "Lay flat",
  mateFaces: "Stick",
  center: "Center",
};

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
  "simplify",
  "snap",
  "layFlat",
  "mateFaces",
]);
