"use client";

import { GraduationCap, X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Fork: "Coming from Tinkercad?" - where each Tinkercad tool lives in Pare 3D,
 * what Pare 3D adds, and what it does not have. Opened from the editor's title row
 * and the start page through OPEN_TINKERCAD_GUIDE_EVENT. Tinkercad is a trademark
 * of Autodesk, Inc.; Pare 3D is an independent project.
 */
export const OPEN_TINKERCAD_GUIDE_EVENT = "pare3d:open-tinkercad-guide";

type Row = { tinkercad: string; pare: string; keys?: string };

const SAME: Row[] = [
  { tinkercad: "Basic Shapes panel", pare: "Shapes panel on the right: drag a shape onto the plate, or click it and then the plate" },
  { tinkercad: "Paraboloid", pare: "Ready-made parts, under the basic shapes in the Shapes panel" },
  { tinkercad: "Solid / Hole", pare: "Solid / Hole at the top of the shape's panel", keys: "S / H" },
  { tinkercad: "Group", pare: "Group in the toolbar: the parts take one colour, as in Tinkercad; Multicolor (Shift+M) keeps theirs. Double-click to edit one part, click away to regroup", keys: "Ctrl+G" },
  { tinkercad: "Ungroup", pare: "Ungroup in the toolbar", keys: "Ctrl+Shift+G" },
  { tinkercad: "Bundle", pare: "Bundle in the toolbar", keys: "Ctrl+B" },
  { tinkercad: "Intersect", pare: "Intersect in the toolbar", keys: "Ctrl+I" },
  { tinkercad: "Align", pare: "Align in the toolbar", keys: "L" },
  { tinkercad: "Mirror / Flip", pare: "Mirror in the toolbar", keys: "M" },
  { tinkercad: "Drop to workplane", pare: "Drop in the toolbar", keys: "D" },
  { tinkercad: "Duplicate and repeat", pare: "Duplicate (repeats the last move); Pattern under More for rows and circles", keys: "Ctrl+D" },
  { tinkercad: "Drag a copy", pare: "The same: hold Alt while dragging", keys: "Alt+drag" },
  { tinkercad: "Workplane", pare: "Workplane on the left bar; Shift+W puts it on the selected face", keys: "W" },
  { tinkercad: "Scribble", pare: "Sketch tab, Extrude sketch, then the pen (Scribble): drag to draw. A loop becomes a shape; switch on Stroke for lines" },
  { tinkercad: "Ruler", pare: "Ruler on the left bar, or R with nothing selected", keys: "R" },
  { tinkercad: "Notes", pare: "Note at the top", keys: "N" },
  { tinkercad: "Cruise", pare: "The same: carry a shape onto another face", keys: "C" },
  { tinkercad: "Lock / Hide / Show all", pare: "The same shortcuts; Hide in the toolbar", keys: "Ctrl+L / Ctrl+H / Ctrl+Shift+H" },
  { tinkercad: "Fit view", pare: "The same", keys: "F" },
  { tinkercad: "Orbit, pan, zoom", pare: "The same mouse: right-drag orbits, middle-drag pans, scroll zooms" },
  { tinkercad: "Move by grid / raise", pare: "The same: arrow keys, Ctrl+Up/Down to raise or lower", keys: "Arrows" },
  { tinkercad: "Import / Export", pare: "Import and Export at the top; Send to Bambu Studio opens the design there in one click", keys: "Ctrl+Shift+I / Ctrl+E" },
];

const NEW: Row[] = [
  { tinkercad: "Fillet and chamfer", pare: "Round or bevel any edge, and take it off again later", keys: "B / Shift+B" },
  { tinkercad: "Hollow and split", pare: "Shell a body with an even wall, or cut it in two with a plane (under More)" },
  { tinkercad: "Cut with connectors", pare: "Split a part too big for the plate and add plugs or dowels, with a print-fit clearance; place them yourself or let Pare 3D spread them" },
  { tinkercad: "Ready-made parts", pare: "Heat-set insert holes and nut traps (M2 to M5) and a box with a lid that fits, under the basic shapes" },
  { tinkercad: "Text on a face", pare: "Ready-made parts: type it, choose Raised or Cut in, click a face, then Group it with the part" },
  { tinkercad: "Snap-fit clip, living hinge", pare: "Ready-made parts: a hook with its slot (it tells you if it will bend safely in PLA), and a hinge that folds at a thin web" },
  { tinkercad: "Mouse ears", pare: "On a solid's panel: thin discs under sharp bottom corners so they don't warp" },
  { tinkercad: "Spacing parts evenly", pare: "Align (L) with several parts selected shows Space out: equal gaps, an exact gap, or arrange them all on the plate. Pattern does rows and grids with a gap between copies" },
  { tinkercad: "Lithophane", pare: "Make, then Lithophane: choose a photo, pick flat, curved or a lamp shade, and print it standing up in white PLA" },
  { tinkercad: "Voronoi pattern", pare: "Make, then Voronoi: a panel with organic openings, or the openings alone to cut into any part" },
  { tinkercad: "Print fit for holes", pare: "Make a hole a little bigger in one click so pegs, lids and axles fit: Press, Snug or Loose" },
  { tinkercad: "Sketch", pare: "Draw a 2D outline with exact sizes, then extrude, revolve or sweep it (the Sketch tab)" },
  { tinkercad: "Threads, gears, springs", pare: "Ready-made shapes in the Shapes panel" },
  { tinkercad: "Your printer's plate", pare: "Bambu Lab A1 mini by default, overhang warnings, any of about 220 printers in Settings" },
  { tinkercad: "STEP export", pare: "Take the design on into a full CAD program" },
  { tinkercad: "Simple mode", pare: "The switch at the top hides the advanced tools" },
  { tinkercad: "Works offline", pare: "Designs stay on this computer; turn on automatic backup on the start page" },
];

const MISSING: Row[] = [
  { tinkercad: "Codeblocks, Circuits, Sim Lab", pare: "Not part of Pare 3D" },
  { tinkercad: "Cloud saving and classes", pare: "No account: designs live on this computer; use backups or save files (.lyl) to share" },
  { tinkercad: "Opening .tinkercad designs", pare: "Export from Tinkercad as OBJ or STL (colours: OBJ) and import here" },
];

function Table({ rows, first }: { rows: Row[]; first: string }) {
  return (
    <table className="tc-guide-table">
      <thead>
        <tr>
          <th>{first}</th>
          <th>In Pare 3D</th>
          <th>Keys</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.tinkercad}>
            <td>{row.tinkercad}</td>
            <td>{row.pare}</td>
            <td>{row.keys ? <kbd>{row.keys}</kbd> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TinkercadGuide() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"same" | "new" | "missing">("same");
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_TINKERCAD_GUIDE_EVENT, show);
    return () => window.removeEventListener(OPEN_TINKERCAD_GUIDE_EVENT, show);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  if (!open) return null;
  return (
    <div className="tc-guide-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="tc-guide" role="dialog" aria-modal="true" aria-labelledby="tc-guide-title">
        <header>
          <GraduationCap size={22} aria-hidden="true" />
          <h2 id="tc-guide-title">Coming from Tinkercad?</h2>
          <button type="button" className="tc-guide-close" aria-label="Close" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </header>
        <p className="tc-guide-intro">Pare 3D works the way you already know: the plate, the shapes, solids and holes, group and align, the same mouse and most of the same keys. Here is where everything is. On a Mac, ⌘ works wherever it says Ctrl.</p>
        <div className="tc-guide-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "same"} onClick={() => setTab("same")}>Where things are</button>
          <button type="button" role="tab" aria-selected={tab === "new"} onClick={() => setTab("new")}>What's new</button>
          <button type="button" role="tab" aria-selected={tab === "missing"} onClick={() => setTab("missing")}>Not here</button>
        </div>
        <div className="tc-guide-body">
          {tab === "same" ? <Table rows={SAME} first="In Tinkercad" /> : null}
          {tab === "new" ? <Table rows={NEW} first="New for you" /> : null}
          {tab === "missing" ? <Table rows={MISSING} first="In Tinkercad" /> : null}
        </div>
        <footer>Tinkercad is a trademark of Autodesk, Inc. Pare 3D is an independent project, not connected with Autodesk.</footer>
      </div>
    </div>
  );
}

/** The button for the editor's title row. */
export function TinkercadGuideButton() {
  return (
    <button
      type="button"
      className="action-icon-button tc-guide-button"
      aria-label="Coming from Tinkercad?"
      title="Coming from Tinkercad? Where everything is"
      onClick={() => window.dispatchEvent(new Event(OPEN_TINKERCAD_GUIDE_EVENT))}
    >
      <GraduationCap className="title-icon" aria-hidden="true" />
    </button>
  );
}
