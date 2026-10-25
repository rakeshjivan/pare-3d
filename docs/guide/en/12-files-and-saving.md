---
title: Files, saving and sharing
summary: Where your designs live, how to back them up, which formats Pare 3D imports and exports, and what is possible on a shared server.
---

## Where your designs live

Pare 3D saves everything on your computer - inside the app, or in the browser if you use it there. There is no account and nothing is uploaded. Every change saves itself. The preview picture on the start page shows the view you last had in front of you when you went back with {{ui:editor.homeDashboard}}. If you open Pare 3D in the same browser days later, everything is there.

In the Mac and Windows app, each design is kept as a file in the app's own folder (on a Mac, `~/Library/Application Support/Pare 3D/designs`; on Windows, `%LOCALAPPDATA%\Pare 3D\designs`). Only your disk limits how much fits. Older versions kept designs in the app's built-in browser storage, which has a size limit of its own: when it filled up, saving failed with "not enough space for domain". The first time you open a version that keeps designs on disk, Pare 3D moves your existing designs there by itself. In a web browser, designs stay in the browser's storage.

If you go back to the start page from a design with nothing in it, Pare 3D asks whether to keep it. {{ui:confirm.yes}} or [[Enter]] keeps it, {{ui:confirm.no}} removes it, so empty designs do not pile up. For a design in a shared folder on a server, {{ui:confirm.no}} deletes the file from the server, for everyone who uses it.

That has a downside: whoever clears the browser storage or switches to another computer loses the designs. **So back up important work into a file** - or let Pare 3D do it for you.

### Automatic backups

A slim line on the start page says how your designs are backed up. With automatic backup on, Pare 3D writes all your designs to a backup file in a folder you choose, every 5 minutes while designs change, and the line says when it last did. {{ui:backupStrip.turnOn}} or {{ui:backupStrip.chooseFolder}} sets it up; {{ui:backupStrip.backUpNow}} makes a backup straight away, and {{ui:backupStrip.restore}} brings designs back from one. A cloud folder such as iCloud Drive, OneDrive or Dropbox keeps the backups safe off this computer too.

## Choosing where files go

In the app, **Settings › Files** decides where Pare 3D saves on this computer:

- **{{ui:files.exportsTitle}}:** the folder every export goes to. {{ui:files.change}} picks another, {{ui:files.show}} opens it, {{ui:files.useDownloads}} goes back to the Downloads folder. Switch on {{ui:files.askEachTime}} to choose the folder and name every time instead.
- **{{ui:files.backupsTitle}}:** the folder the automatic backups go to.

After an export, a small note says where the file went, with {{ui:files.showInFolder}} to open the folder. "Send to" a slicer keeps its own copy in Documents › Pare 3D Exports. In a web browser, exports and backups go to the browser's download folder instead.

## Folders for your designs

With dozens of designs a single list is not enough. On the start page, {{ui:shared.newFolder}} makes a folder for the designs of this browser; a click on the folder opens it. Folders can hold folders.

- **Into a folder:** drag a design onto the folder, or choose {{ui:shared.moveTo}} in the design's menu, which lists every folder. A new design, and a file you open or import, made while a folder is open lands in that folder.
- **Out again:** the first tile in a folder, `..`, and the line under {{ui:dashboard.projects}} lead back; you can drop a design on them too. A folder dragged onto another folder goes inside it.
- **Rename and delete** are in the folder's menu. Deleting a folder deletes no design: what was in it moves one level up.
- **Search** looks through every folder; a design that is found shows its folder, and a click on it opens the folder.

{{ui:dashboard.backupAll}} keeps the folders: the designs sit in the backup file in their folders, and restoring the backup puts them back there. The folders of this browser are separate from the folders on a server. The card pictures go into the file too, so they are back as soon as you restore.

## Backing up and passing on

On the start page every design has a menu with the options to rename, duplicate and delete. With {{ui:dashboard.backupAll}} you pack all designs into one single file. {{ui:dashboard.restoreBackup}}, next to it in the notice about designs kept in the browser (it is there on a new computer with no designs, too), brings them back, also in another browser or on another computer; {{ui:dashboard.importGeometry}} takes the same file. The {{ui:myShapes.title}} of this browser travel in the same file, in the folder `Custom shapes`, see [Shapes](chapter:shapes). If you restore a backup into a browser that already has some of these designs, those are not added a second time; the notice says how many were already there.

You back up a single design in the editor: {{ui:editor.export}}, choose the format **LYL** and click {{ui:export.saveProject}}. The LYL file is Pare 3D's own design format and contains everything: shapes, groups, sketches, CAD data, imported sources and the history, meaning the undo steps. Under {{ui:export.historyTitle}} you choose how many of the last steps travel along; it starts at what the settings (the cogwheel in the ribbon) keep under {{ui:workspace.history}}. The last stop, {{ui:export.historyNone}}, saves the design with its current state only - the way to share a file without its undo steps. The export is a copy under the {{ui:export.fileName}} you give it; the design in your browser keeps its history. Older `.skf` files from earlier versions can still be opened; they are then saved as `.lyl`.

**Saving into your own folder (Chrome and Edge).** There the button opens your system's save dialog, so you pick the folder and the name yourself, and an existing file can be replaced. Afterwards [[Ctrl]]+[[S]] saves the design into that same file again, without a dialog. A design opened from a `.lyl` file with {{ui:dashboard.importGeometry}} or the open button of the export window saves back into that file, too. The browser may ask once for permission to change the file. After the page is reloaded the design forgets its file, and the next [[Ctrl]]+[[S]] asks for it again; the dialog starts in the folder you used last. Firefox and Safari do not allow a page to write into files like this. There the file is downloaded to the Downloads folder as before, and [[Ctrl]]+[[S]] downloads it again; Firefox can be set to ask for the folder each time under Settings, General, Downloads.

## Exporting

Click {{ui:editor.export}} or press [[Ctrl]]+[[E]].

![The export window with the formats STL, 3MF, OBJ, STEP, SVG, DXF, PNG, LYL and 2D.](shot:export-panel)

At the top is the file name, below it you choose the format. With something selected, only the selection is exported, otherwise the whole design. If the selection leaves out visible parts, a note in the window says so plainly, and {{ui:export.selectAll}} selects everything visible in one click. Once the file is written, the window closes by itself; if the export fails, it stays open with the message.

| Format | For | What to know |
| --- | --- | --- |
| **STL** | slicer and 3D printing | A triangle mesh. The simplest and most widespread format. An STL has no parts: bodies that overlap are joined into one mesh. To keep them as separate parts, export 3MF. In Chrome and Edge the first STL export asks where to save, and later STL exports of the design write into that file, until you type another name in the file name field or press {{ui:export.stlSaveAs}}. |
| **3MF** | slicer with colours | Every body stays a part of its own with name and colour. Overlapping bodies are only joined when they share a colour; where a shape sits inside one of another colour, say a logo in a plate, the one built first leaves room for the later one. Suited to PrusaSlicer, Bambu Studio, OrcaSlicer and Cura. Bambu Studio and OrcaSlicer ask on opening how to map the colours onto your filaments, and call the file "not from Bambu" - the message is harmless. |
| **OBJ** | modelling and exchange | A widely supported mesh format. Colours are stored as vertex colours in the same file, with no extra `.mtl`. Bambu Studio and OrcaSlicer read them and ask, as with 3MF, how to map them onto your filaments; other programs see only the shape. As with 3MF, overlapping bodies are only joined when they share a colour. |
| **STEP** | a full CAD program | Keeps boxes, cylinders, spheres and cones as exact geometry, and so shapes made from an outline (star, heart, ellipse, tube, half sphere, round roof, rounded box, dovetail, the bores and more), the bent tube, threads, springs and gears, plus fillets and chamfers. The first STEP export in a session loads the CAD kernel (about 22 MB) once. |
| **SVG** | laser cutter and plotter | A clean top view in millimetres, including holes and curved outlines. Under {{ui:export.svg.view}}, {{ui:export.svg.viewFootprint}} writes only the outlines where the objects stand on the workplane. |
| **DXF** | laser cutter, CNC router, 2D CAD | The same outlines as the SVG - the top view, or with {{ui:export.svg.viewFootprint}} only where the objects stand on the workplane - as closed polylines in millimetres, one layer per part, in DXF R12, which every laser, CNC and CAD program opens. |
| **PNG** | forum posts, print sites, questions | A picture of the view as it is, at twice the resolution and without handles, selection frames and dimensions. {{ui:export.png.plate}} and {{ui:export.png.transparent}} are chosen in the window. Turn and zoom first until the picture is right; the selection does not matter here. |
| **LYL** | Pare 3D itself | The editable design with everything that belongs to it. |
| **2D** | workshop, lathe and mill, documentation | A drawing at 1:1 as PDF or SVG: front, top and right-side views on an ISO sheet. See below. |

**STL into your own folder (Chrome and Edge).** There the first STL export of a design opens your system's save dialog, so you pick the folder and the name yourself and can replace an existing file. After that every STL export of the design writes into that same file without a dialog; the export window shows which file, and **Save as…** next to the export button picks another. The dialog remembers its own folder, apart from the one for designs, so the slicer files can stay with the slicer. After the page is reloaded the design forgets its STL file and the next export asks again. Firefox and Safari download the file as before.

A hole you have not grouped is taken out of every body it reaches when you export, as the view shows it. So there is no need to group before each export. With a selection, only the selected holes count. A hole cannot be exported on its own; Pare 3D points that out.

STEP only carries exact CAD bodies. What cannot be written exactly, such as a mesh imported as STL, is left out. The message after the export names those bodies and says why. For the printer, use STL or 3MF, which carry everything.

### A drawing for the workshop

Choose the format **2D** (hover over it and it says Drawing) and, below the file name, PDF or SVG. With something selected, only the selection is drawn, otherwise the whole visible design; holes you have not grouped still cut the parts they reach.

Pare 3D draws the front, top and right-side views in first-angle layout (the right side to the left of the front view, the top view below it) on the smallest ISO sheet that fits, from A4 to A0, or a larger one if the part needs it. It is always at 1:1. Each view carries its overall width and height, and edges you cannot see are dashed. Round bores that run parallel to a view direction get a centre cross and a label (F1, T1, R1), and a table at the bottom lists their diameter and position, measured from the lower-left corner of the view. The title block in the lower-right corner holds the name, scale, units, date and sheet number.

Print at 100 % or "actual size", or the lengths will not match. What the drawing does not do: threads, depths, tolerances and bores at an angle are not dimensioned, and the sizes come from the model as a mesh, so they are nominal. A very detailed part (over 100,000 triangles) or more than 200 bores is refused with a message; choose fewer objects then.

The projection is based on the drawing work of Cadverix-3D by WC3D.

### How much filament does it take?

For STL, 3MF, OBJ and STEP the {{ui:export.estimateTitle}} box shows the volume, weight and length of 1.75 mm filament of what is exported. It counts like the file: visible bodies only, holes taken off, overlaps only once. On the right you pick the filament - PLA, PETG, ABS, ASA, TPU or PA (nylon) - and the weight follows its density. The volume is the body's own. Weight and filament are a rough estimate for a print with walls and infill: you set the {{ui:export.estimateInfillLabel}} (15 % to begin with) and the {{ui:export.estimateWallsLabel}} (2) under the heading, and the box says what it counted and what the same part would weigh solid. Your slicer's own settings decide the real number, so take it as a guide: good for comparing designs and for whether the spool will last. At 100 % infill the box counts the part as solid, the upper bound. The box works out its numbers when you press {{ui:export.estimateCalculate}}, so the export window opens at once even for a finely traced model.

## Importing

With {{ui:editor.import}} or [[Ctrl]]+[[I]] you bring foreign files into the design.

![The import window: open or insert designs and drop geometry.](shot:import-panel)

- **{{ui:import.openProject}}:** A Pare 3D design (`.lyl`, or an older `.skf`) comes back as a new design.
- **{{ui:import.insertProject}}:** The bodies of a Pare 3D design are added to the open one. Handy for basic shapes you need again and again: build them once, save them and bring them in every time.
- **Add geometry:** Drop STL, OBJ, PLY, 3MF, STEP, SVG, DXF, PNG or JPG files in the window or click to choose a file. Imported meshes can be turned, moved, cut with holes and built upon. An SVG comes in as a sketch body, one from a tracer such as picsvg.com or Inkscape's "Trace Bitmap" as well: its outlines become the lines and curves of a sketch, 4 mm high and reading from above as in the drawing. In the properties you set its {{ui:prop.sketchFill}}, an area or a stroke outside, inside or centred, and {{ui:prop.sketchSilhouette}} leaves the holes out, see [Sketches](chapter:sketches), "Fill and silhouette". You change the points themselves in sketch mode. If it should come in at a size of your own, type the width in the import window under **SVG and picture: width in mm** first, as in Tinkercad: the drawing is scaled to it, height and depth with it, and the field is empty again after that one import; left empty, an SVG comes in at its own size and a picture 50 mm wide. Only a very intricate SVG with more than 2500 lines and curves comes in as a fixed mesh. A PNG or JPG picture is traced into an outline and comes in the same way, as a sketch body 50 mm wide that you can resize afterwards: the part of the picture that is not its background, the background being the part that takes up more of the picture's edge. An SVG that holds nothing but one picture is traced the same way. A shape that cannot be built into a solid, such as an outline that crosses itself or touches itself at a point, is left out, and after the import Pare 3D says how many there were. Then it helps to join overlapping pieces in the drawing program, close the outlines and save the file again. Drawings made on one page, such as the layers of one document exported as separate files, line up again when you switch on {{ui:import.keepSvgPage}} in the import window before you import them: each keeps its place on the page, where otherwise each is centred on itself. A coloured OBJ or 3MF comes in as one body per colour, each in its place. In an OBJ the colours sit either in the file itself, as in an OBJ from Pare 3D, or in an `.mtl` beside it. Select that one too, or import the whole ZIP the way Tinkercad hands out its OBJ. A 3MF carries its colours itself, and in a project from Bambu Studio, OrcaSlicer or PrusaSlicer each part takes the colour of its filament. A 3MF with several objects, such as a project with one object per plate, comes in as one body per object; modifiers, negative volumes and support blockers from the slicer are left out. Colour painted onto faces in the slicer is not read.

A design saved with a **newer Pare 3D** may hold things your version does not know yet, such as a new shape, a new setting or fonts of one's own. If Pare 3D cannot open it for that reason, the message names both versions. If it opens, the notice says that newer things may look different here. Either way, reloading the page helps: layerling.com always serves the newest version. The installed app picks it up the next time it starts; on your own server you install the update.

Template pictures are added in sketch mode, see [Sketches](chapter:sketches).

## Checking and repairing an imported mesh

Downloaded STL, OBJ and 3MF files are often not quite solid: a face is missing, so the surface has an opening, or triangles are doubled or face the wrong way. A slicer may print such a file wrongly or not at all. Pare 3D checks every mesh you import. When one is not watertight, a card at the bottom of the work area says how many openings and broken spots it found:

- **{{ui:meshCheck.makeSolid}}** runs Pare's own repair engine, the one in Pare's STL View, Repair & Resize: it joins loose corners, removes broken, doubled and two-sided triangles, separates edges shared by too many triangles and pinched corners, turns every triangle the right way, fills the holes, drops loose crumbs, untangles places where the surface passes through itself and joins overlapping pieces into one closed solid - rebuilding a small area only where nothing else works. The message lists what it did. If it can only be partly repaired, the message says so. [[Ctrl]]+[[Z]] takes the repair back.
- **{{ui:meshCheck.leave}}** keeps the mesh as it is.

You can run the repair any time: select the part and choose **{{ui:meshCheck.command}}** in the {{ui:editor.group.mesh}} group of the toolbar - the group is always there, and its tools (with **Fill hole**, **Simplify** and **Cut below**) work on the imported mesh you select - or right-click the part and choose {{ui:contextMenu.makeSolid}}, or search for it with [[Ctrl]]+[[K]].

**{{ui:contextMenu.cutBelow}}** is in the right-click menu of every solid part: whatever hangs below the workplane is cut off, so the part stands flat on the plate.

### Filling a hole

To fill a screw hole, a bore or a nut trap in an imported part - to drill it again somewhere else, say - click **Fill hole** in the {{ui:editor.group.mesh}} group (or right-click the part and choose {{ui:contextMenu.fillHole}}) and click the inside wall of the hole. Pare 3D finds the hole's surface around your click, makes a plug that fits it and joins it to the part, flush with the faces around it. Round, square and hexagonal holes work, through or blind; a counterbore or countersink is filled one step at a time, a click for each. Click the next hole, or press [[Esc]] when you are done. A click on an outside face or into an inside corner is refused - that is not a hole.

Fill a hole is for imported meshes. In a part built in Pare 3D the hole is a part of its own: open the group with [[E]] and delete it.

## Simplifying an imported mesh

A scanned or sculpted mesh often has far more triangles than its shape needs, and every one of them is carried along while you move, cut and save. {{ui:simplify.title}} in the {{ui:editor.group.mesh}} group (or in the right-click menu of the body) shows the mesh as it is next to what a chosen share of its triangles would leave of it; both views turn and zoom together with the mouse buttons of the workplane. Set how much to keep as a percentage or a number of triangles, and {{ui:simplify.apply}} takes the lighter mesh. The result is a plain mesh: for the result of a cut or merge, {{ui:group.edit}} and its original parts are given up.

Cutting, merging and intersecting an imported mesh is calculated in your browser, so the workspace settings limit how many triangles such a mesh may have ({{ui:workspace.booleanTriangleLimit}}). A mesh above the limit is not processed, and the message names its triangle count; simplify the mesh first, or raise the limit if your computer can take it.

### DXF drawings

A DXF from a CAD program or a laser-cutting file comes in like an SVG: every closed outline becomes a face, a closed outline inside another is a hole, and the face is pushed up into a body at its real size. Pare 3D reads lines, polylines (with their arcs), circles, arcs, ellipses, splines and blocks placed in the drawing; lines and arcs that meet end to end, the way most CAD programs save an outline, are joined into one. The drawing's units come from the file; one that states none is read as millimetres. Text, dimensions and hatching are left out, and so are lines that never close - the notice says how many. Save the DXF as ASCII (text), not binary.

## Rounding a mesh

The fillet tool needs exact CAD geometry, so a dense imported mesh, a scan or a part made from many booleans can be too much for it. **{{ui:meshRound.title}}** rounds every edge of such a part by one radius instead - as if a ball of that size were rolled along the surface. It is in the {{ui:editor.group.mesh}} menu, under {{ui:editor.group.modify}} › {{ui:editor.more}} for any part, and in the right-click menu as {{ui:meshRound.menu}}.

- {{ui:meshRound.outside}} rounds the edges that stick out, {{ui:meshRound.inside}} fills the inside corners with a curve (which makes a part stronger), {{ui:meshRound.both}} does both.
- The faces away from the edges stay exactly as they were; only the edges change.
- It works on a grid of a third of the radius, so a big part with a small radius takes a few seconds, and the window says the smallest radius that rounds visibly. On a very big part the grid gets coarser, and the message says so.
- The result is a mesh. [[Ctrl]]+[[Z]] takes it back.

For a part built in Pare 3D, the fillet tool gives exact, smoother results - use {{ui:meshRound.title}} where that tool cannot go.

## Sculpting a mesh

**{{ui:sculpt.title}}** shapes an imported mesh or a scan by hand, as in Meshmixer or Medit's editing tools. It is in the {{ui:editor.group.mesh}} menu and in the right-click menu as {{ui:sculpt.menu}}; in Dental Studio, {{ui:dental.marginManual}} has a {{ui:dental.sculpt}} button.

- Pick a brush and drag over the part: {{ui:sculpt.tool.smooth}} evens out bumps and spikes, {{ui:sculpt.tool.flatten}} pulls the surface onto a flat plane, {{ui:sculpt.tool.inflate}} pushes it out and {{ui:sculpt.tool.deflate}} pushes it in. {{ui:sculpt.size}} is the brush on the screen; {{ui:sculpt.strength}} is how much one stroke moves.
- Only the surface you can see is touched, not what is hidden behind it. Drag with the right or middle mouse button to turn the view between strokes; [[Ctrl]]+[[Z]] takes strokes back one at a time. The full-detail mesh changes as you stroke; the part itself is rebuilt once, when you press {{ui:sculpt.done}} (or pick another part or tool), and the strokes become one step of undo.
- {{ui:sculpt.tool.select}} paints triangles orange and {{ui:sculpt.tool.unselect}} takes them off. The selected area can be deleted (to cut away a part of a scan), smoothed or flattened as a whole, grown by a ring, or inverted.

## Surface textures

**{{ui:texture.title}}** in the Modify group presses a pattern into a part's surface, or raises it out of it - a grip on a handle, a stone or wood look, a picture of your own. Select one part, choose a pattern and set:

- **{{ui:texture.size}}:** how big one repeat of the pattern is. For {{ui:texture.pattern.picture}}, how wide the picture is printed; it repeats across the part.
- **{{ui:texture.depth}}:** how deep the texture goes. 0.4 to 0.8 mm shows well on a 0.4 mm nozzle.
- **{{ui:texture.in}}** (the default) keeps the part's outer size, so it still fits what it fits; **{{ui:texture.out}}** adds the depth outside it.
- **{{ui:texture.top}}** textures the faces facing up too. The faces facing down are never textured, so the part still sits flat on the plate.

Sharp edges stay crisp: the texture grows in from nothing near them. The patterns are {{ui:texture.pattern.knurl}}, {{ui:texture.pattern.ribs}}, {{ui:texture.pattern.dimples}}, {{ui:texture.pattern.hexagons}}, {{ui:texture.pattern.bricks}}, {{ui:texture.pattern.weave}}, {{ui:texture.pattern.stone}}, {{ui:texture.pattern.leather}}, {{ui:texture.pattern.wood}}, {{ui:texture.pattern.fuzzy}} and {{ui:texture.pattern.picture}} (a photo or drawing: light parts stand high, dark parts low). The result is a mesh with many small triangles; [[Ctrl]]+[[Z]] takes it back. Very big parts with a fine pattern are textured a little coarser, and the notice says so.

## Dental models from a scan

Intraoral scans become printable study, ortho, aligner and crown-and-bridge models in **{{ui:dental.title}}** - see [Dental Studio](chapter:dental-studio).

## Reporting a bug

If Pare 3D does something unexpected, save a {{ui:editor.bugReport}}: the link sits in the footer at the bottom, next to the forum. It is a ZIP file, because GitHub and many forums refuse a bare .lyl: inside are your design as a .lyl and a short text file with the version, browser, screen size, the last messages and any errors. The start page opens the ZIP like a backup, or you unpack it and open the .lyl. Nothing personal is in it. Attach the file to your post in the forum or on GitHub, so the problem can be followed with exactly your design.

If Pare 3D stops with an error, a window with the error message shows instead of a blank page. From it you can save the state of the design last stored in the browser as a .lyl file, go back to the overview, or start a new design. The error message from the window and the saved file help when you report it.

## Shared designs on a server

When Pare 3D runs on your own computer or web server, it can offer a shared folder in which all users keep designs. On the start page it then appears as {{ui:dashboard.sharedProjects}}. You create folders there, move designs by dragging and search across the whole folder. A design that lives there saves itself back to it. A design from this browser goes onto the server by dragging its card onto the server tile, or with {{ui:dashboard.sendToServer}} in the card's menu. A backup you open lands in this browser first, like any design you open; put the designs on the server from there. The start page shows a design by its file name, so renaming a design, on its card or at the top of the editor, renames the file on the server too. Deleting a design or a folder removes it for good, together with its working copy in this browser. Custom shapes kept on the server sit in its folder `Custom shapes`, see [Shapes](chapter:shapes).

Two things make that quicker: {{ui:dashboard.sendAllToServer}} on the start page puts every design of this browser on the server in one go, and ticking {{ui:dashboard.newOnServer}} makes every new design start in the server folder, so it is saved there from the first change on. The tick is kept in this browser. A design that cannot go - its name is taken on the server, say - stays in the browser, and the message says how many.

That is not simultaneous editing: whoever opens a file works on a copy of their own. If somebody else has changed the file in the meantime, Pare 3D refuses to overwrite it.

On layerling.com this function is not switched on. How to set it up on your own server is described in the [README on GitHub](https://github.com/henmedia/layerling/blob/main/README.md).
