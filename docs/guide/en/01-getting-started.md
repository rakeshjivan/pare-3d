---
title: Getting started
summary: From a blank sheet to your first part for the 3D printer, in five minutes, with no account.
---

Pare 3D is a free design program for 3D printing, for Mac and Windows. You build a part from simple shapes, cut holes into it, round the edges and send it to your slicer. If you have used Tinkercad you will feel at home; if you have used Fusion you will find its push/pull, fillet, shell, pattern and loft moves. There is nothing to sign up for, and what you build stays on your computer. How to install it is in [Installing, updates and where things are saved](chapter:offline-and-install).

![The start page of Pare 3D: "Create new 3D design" at the top, your designs and the quick guide below.](shot:start-page)

## Creating a design

Open Pare 3D. The start page has three big buttons: {{ui:dashboard.createDesign}}, **Continue last design** and {{ui:dashboard.importGeometry}}. Click {{ui:dashboard.createDesign}}: the editor opens with an empty workplane - the grid on which everything takes shape - and the Shapes panel open on the right.

The first time, the start page asks **New to 3D design?**. {{ui:firstRun.beginner}} starts in Simple mode: fewer tools, each with its name under it. {{ui:firstRun.tinkercad}} opens a page that shows where everything you know from Tinkercad is. {{ui:firstRun.experienced}} shows every tool. You can switch at any time with **Simple mode** at the top right.

If you already have a file to continue with, use {{ui:dashboard.importGeometry}}. That works for Pare 3D designs (`.lyl`) as well as STL, OBJ, 3MF, STEP or SVG files.

All your designs appear on the start page with a preview picture. They are saved automatically after every change, so there is no save button; **Saved** next to the design's name shows it happened. Pare 3D also backs them all up by itself every few minutes while they change: the line above **Designs** says where and when (Documents › Pare 3D Backups at first). {{ui:backupStrip.backUpNow}} makes a backup on the spot, {{ui:backupStrip.restore}} brings one back. More in [Files and saving](chapter:files-and-saving).

## The editor at a glance

![The editor with two shapes on the workplane. The ribbon on top, the camera controls on the left, the settings of the selected shape on the right.](shot:editor-overview)

- **On top** is the toolbar. It is sorted by task: Home, {{ui:editor.group.clipboard}}, {{ui:editor.group.history}}, {{ui:editor.group.shapes}}, {{ui:editor.group.visibility}}, {{ui:editor.group.combine}}, {{ui:editor.group.modify}}, {{ui:editor.group.arrange}} and Make. Hover over an icon and a short tip says what it does; **Help › Show tool names** puts a name under every icon. Wherever you see a small question mark, in a shape's settings or in a tool's window, it leads straight to the part of this guide that explains it.
- **The Shapes panel** on the right holds the basic shapes; it is open whenever a design opens. **Ready-made parts** (in the Make group) opens its own window in the same place - see [Shapes](chapter:shapes). The pin at the top of a panel keeps it open while you place one shape after another.
- **In the middle** lies the workplane. This is where you place shapes, pull them into form and see the result.
- **The settings of the selected shape** appear beside the panel: Solid or Hole, then folded sections - {{ui:inspector.properties}}, {{ui:inspector.position}}, {{ui:inspector.rotation}} and more. They start folded so the screen stays calm; click a heading to open it. One you open stays open while you work. Typing numbers is more exact than dragging.
- **On the left** are the camera controls with the view cube above them. They move you around the scene, more in [View and workplane](chapter:view-and-workplane).
- **At the very top** you switch between {{ui:editor.modeGeometry}} and {{ui:editor.modeSketch}}, rename the design, send it to Bambu Studio, open Help, switch Simple mode and choose the colour scheme.

## The buttons around the work area

Hover over a button to see its name. If you are not sure what a button does, click {{ui:interactiveHelp.title}} in the {{ui:editor.group.help}} area ([[Shift]]+[[F1]]) and then the button. These are the ones asked about most.

### Paste

{{ui:editor.tool.paste}} ([[Ctrl]]+[[V]]) adds what you copied with {{ui:editor.tool.copy}} to the design. {{ui:common.duplicate}} copies and pastes in one step.

### Delete

{{ui:common.delete}} ([[Delete]]) removes the selected shapes. {{ui:editor.tool.undo}} brings them back.

### Ungroup

{{ui:editor.tool.ungroup}} ([[Ctrl]]+[[Shift]]+[[G]]) takes the selected group apart again into the shapes it was made of.

### Workspace settings

{{ui:editor.workspaceSettings}} opens the settings of the work area: unit, size of the plate, printer, grid, colours, light and more. More in [View and workplane](chapter:view-and-workplane).

### Theme

{{ui:common.theme}} at the very top chooses how Pare 3D looks: as your system, light, dark or graphite.

### Rename design

{{ui:editor.renameProject}}: the pencil beside the name at the very top. Type the new name and press [[Enter]].

### Design name

The name of the design ({{ui:confirm.projectName}}) stands at the very top. Click it, type, and [[Enter]] keeps the name.

### Visibility options

{{ui:editor.visibilityOptions}}, the arrow beside the eye icon, holds what you can show or hide: the list of objects, everything you hid, the notes and the overhangs of the print. More in [Select and arrange](chapter:select-and-arrange).

### Hide selected

{{ui:editor.tool.hideSelected}} ([[Ctrl]]+[[H]]) hides the selected shapes. They stay in the design and in the object list; {{ui:editor.visibilityOptions}} shows them again.

### Search commands

{{ui:palette.open}}: type what you look for, a tool, a shape or a setting, and click the result.

### Hide camera controls

{{ui:camera.hide}} folds the camera controls on the left away and gives the work area more room; {{ui:camera.show}} brings them back.

### Snap Grid

{{ui:inspector.snapGrid}}, at the bottom of the properties, is the step that moving and resizing snaps to. Beside it the small switch **mm | in** changes the unit. More in [View and workplane](chapter:view-and-workplane).

### Unit: millimetres or inches

The switch **mm | in** beside {{ui:inspector.snapGrid}} changes the unit, the plate's grid and the snap step, for this design.

### The footer

At the foot of the window: {{ui:dashboard.userGuide}} opens this guide, and **Based on layerling · Source** leads to the free software Pare 3D is built on and to Pare 3D's own source code.

## Your first part

As an example, we build a cube with a hole.

1. Click {{ui:editor.addShape}} in the ribbon and pick {{ui:shape.box}}. The shape now hangs on your mouse pointer. A click on the workplane sets it down.
2. On the right, set the dimensions, for example 40 mm long, 40 mm wide and 20 mm high.
3. Place a {{ui:shape.cylinder}} in the middle the same way, 14 mm across and 30 mm high. It should be taller than the cube so it reaches all the way through.
4. Select the cylinder and click {{ui:inspector.hole}} on the right. It turns see-through: the solid has become a tool that takes material away.
5. Select both shapes and click {{ui:editor.tool.group}}. The cube now has a hole.

![The cylinder is a hole and sticks out of the top of the cube.](shot:hole-before)

![After grouping, the cube has a bore.](shot:hole-after)

This is how bores, slots and pockets are made. The chapter [Solids and holes](chapter:solids-and-holes) explains it in detail.

## New since your last visit

After Pare 3D has updated itself, a **What's new** card on the start page lists what the new build brought; {{ui:pareWhatsNew.gotIt}} puts it away. **Help › What's new** shows the latest builds again at any time. How updates work is in [Installing, updates and where things are saved](chapter:offline-and-install).

## From design to print

When your part is done, click **Bambu Studio** at the top: Pare 3D first checks the design ({{ui:printCheck.title}}) and then opens it in Bambu Studio. For another slicer - PrusaSlicer, OrcaSlicer, Cura - click {{ui:editor.export}}, choose STL or 3MF and open the file there. If you choose your printer in the settings, you see while building whether the part fits on the print bed. More in [Printing](chapter:printing).

> **Tip:** If you come from Tinkercad you will find your way quickly: plate, shapes, solid and hole, group, align and mirror work almost the same, and most keyboard shortcuts too. **Help › Coming from Tinkercad?** shows where everything is. What is new is mostly chamfer and fillet, hollowing, push/pull, blending, threads and sketches.
