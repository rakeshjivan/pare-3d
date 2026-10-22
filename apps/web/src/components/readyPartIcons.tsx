/**
 * Fork (build 21): the Ready-made parts pictures, drawn the same way as the toolbar's icons
 * (forkToolbarIcons): a 48-unit grid, 3.2 lines with round ends, a soft fill for the body and the
 * accent colour on the part that matters. Original artwork.
 */
import type { ReactNode } from "react";

const ACCENT = { className: "fork-accent", stroke: "none" } as const;
const SOFT = { fill: "currentColor", opacity: 0.12, stroke: "none" } as const;

function PartIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="ready-part-icon fork-icon"
      width="32"
      height="32"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function ParaboloidPartIcon() {
  return (
    <PartIcon>
      <path d="M8 36C10 12 38 12 40 36Z" {...SOFT} />
      <path d="M8 36C10 12 38 12 40 36" />
      <ellipse cx="24" cy="36" rx="16" ry="4.5" {...ACCENT} />
    </PartIcon>
  );
}

export function InsertPartIcon() {
  return (
    <PartIcon>
      <rect x="13" y="7" width="22" height="34" rx="3" {...SOFT} />
      <rect x="13" y="7" width="22" height="34" rx="3" />
      <rect x="18" y="12" width="12" height="24" rx="2" {...ACCENT} />
    </PartIcon>
  );
}

export function NutPartIcon() {
  return (
    <PartIcon>
      <path d="M24 6 39.5 15v18L24 42 8.5 33V15Z" {...SOFT} />
      <path d="M24 6 39.5 15v18L24 42 8.5 33V15Z" />
      <circle cx="24" cy="24" r="6.5" {...ACCENT} />
    </PartIcon>
  );
}

export function BoxPartIcon() {
  return (
    <PartIcon>
      <rect x="8" y="20" width="32" height="20" rx="3" {...SOFT} />
      <rect x="8" y="20" width="32" height="20" rx="3" />
      <path d="M24 20v20" />
      <rect x="5" y="9" width="38" height="7" rx="2.5" {...ACCENT} />
    </PartIcon>
  );
}

export function TextPartIcon() {
  return (
    <PartIcon>
      <rect x="5" y="12" width="38" height="25" rx="3" {...SOFT} />
      <rect x="5" y="12" width="38" height="25" rx="3" />
      <path d="M12 19h11M17.5 19v12" />
      <path d="M26 31.5 30.6 18h2.8L38 31.5h-3.6l-1-3.2h-5l-1 3.2Z" {...ACCENT} />
    </PartIcon>
  );
}

export function SnapPartIcon() {
  return (
    <PartIcon>
      <path d="M11 41V7h7v22h6l-7.5 12Z" {...ACCENT} />
      <path d="M31 7v13M31 28v13M38 7v13M38 28v13" />
    </PartIcon>
  );
}

export function HingePartIcon() {
  return (
    <PartIcon>
      <rect x="5" y="27" width="16" height="8" rx="2" {...SOFT} />
      <rect x="5" y="27" width="16" height="8" rx="2" />
      <rect x="27" y="27" width="16" height="8" rx="2" {...SOFT} />
      <rect x="27" y="27" width="16" height="8" rx="2" />
      <rect x="20" y="31" width="8" height="4" rx="1" {...ACCENT} />
      <path d="M12 20c6-8 18-8 24 0" strokeDasharray="2.5 5.5" />
    </PartIcon>
  );
}

export function FitTestPartIcon() {
  return (
    <PartIcon>
      <rect x="4" y="17" width="40" height="15" rx="3" {...SOFT} />
      <rect x="4" y="17" width="40" height="15" rx="3" />
      <circle cx="12" cy="24.5" r="2.4" />
      <circle cx="22.5" cy="24.5" r="3" />
      <circle cx="34" cy="24.5" r="3.8" {...ACCENT} />
    </PartIcon>
  );
}

export function EnclosurePartIcon() {
  return (
    <PartIcon>
      <rect x="6" y="18" width="36" height="22" rx="3" {...SOFT} />
      <rect x="6" y="18" width="36" height="22" rx="3" />
      <rect x="4" y="9" width="40" height="6" rx="2.5" />
      <rect x="11" y="25" width="11" height="6" rx="1.5" {...ACCENT} />
      <path d="M27 33h9" />
    </PartIcon>
  );
}

export function JarPartIcon() {
  return (
    <PartIcon>
      <rect x="11" y="17" width="26" height="25" rx="4" {...SOFT} />
      <rect x="11" y="17" width="26" height="25" rx="4" />
      <rect x="9" y="6" width="30" height="7" rx="2.5" {...ACCENT} />
      <path d="M15 17v-2.5M33 17v-2.5M17 21.5h14M17 25.5h14" />
    </PartIcon>
  );
}

export function FlexiPartIcon() {
  return (
    <PartIcon>
      <rect x="4" y="18" width="10" height="12" rx="2.5" {...SOFT} />
      <rect x="4" y="18" width="10" height="12" rx="2.5" />
      <rect x="19" y="18" width="10" height="12" rx="2.5" {...SOFT} />
      <rect x="19" y="18" width="10" height="12" rx="2.5" />
      <rect x="34" y="18" width="10" height="12" rx="2.5" {...SOFT} />
      <rect x="34" y="18" width="10" height="12" rx="2.5" />
      <circle cx="16.5" cy="24" r="2.2" {...ACCENT} />
      <circle cx="31.5" cy="24" r="2.2" {...ACCENT} />
    </PartIcon>
  );
}
