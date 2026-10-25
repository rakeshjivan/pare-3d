---
title: Preparing for 3D printing
summary: Choosing your printer, checking the design before you print, splitting parts that are too big, holes that fit, and sending the design to Bambu Studio.
---

## Choosing your printer

Open the settings (the cogwheel in the ribbon, {{ui:editor.workspaceSettings}}) and switch to the area {{ui:workspace.workplane}}. Under {{ui:workspace.printer}} you pick your printer from a list of over 220 common models, including Bambu Lab, Prusa, Creality, Anycubic, Elegoo and many more.

![The workplane settings with a printer chosen. Print bed and maximum print height come from the slicer profile.](shot:settings-workplane)

Three things happen:

- The workplane takes the size of the print bed.
- In the corner of the workplane appear the printer's name and its build volume. If the writing gets in the way, switch it off with {{ui:workspace.showPlateLabels}} under {{ui:workspace.workplane}}; that also goes for the design's name at the front left.
- Pare 3D **warns** when something does not fit.

The printer profiles come from OrcaSlicer, so they are the same ones your slicer knows. If you would rather work without a printer, choose {{ui:workspace.printerNone}}. You can also set the size of the workplane by hand.

## When something does not fit

A body that sticks out over the edge of the print plate is marked. A message tells you which sides overhang and by how much. It is the same if the part is **too tall**: the height counts from the lowest body, just as the slicer sets the model down.

![The box is wider than the print bed of the Bambu Lab A1 mini. The message at the bottom says by how much.](shot:printer-overhang)

The warning does not stop you from working on. It is a hint so you do not find out only in the slicer that the part is too big. A part that is too big can be split: {{ui:splitToFit.button}} (in the {{ui:printCheck.title}} check, below, or from [[Ctrl]]+[[K]]) cuts it into as few pieces as fit the plate and adds dowel pins and matching holes so the pieces line up when you glue them. To choose the cut yourself, use {{ui:editor.tool.split}}.

If you park parts beside the plate on purpose, click the small cross in the message. The warning is then gone for exactly these bodies. Once one of them fits again and you move it out later, or another body sticks out, the message comes back. Hidden bodies never count, so hiding the parked parts works as well.

## Laying the part right

How a part lies on the plate decides its strength and looks. Two tools in the {{ui:editor.group.arrange}} area help:

- {{ui:editor.tool.layFlat}}: click a face and the part lies with that side down. The best print direction in one click.
- {{ui:editor.tool.dropToWorkplane}} ([[D]]): sets the part on the workplane when it floats somewhere in the air.

A few rules of thumb for direction:

- Large flat faces down. They stick best.
- Lay long, loaded parts so the layers do not run perpendicular to the load. Layers are the weakest direction.
- Avoid overhangs steeper than 45°, or give them supports in the slicer.

## Finding overhangs

In the menu next to the eye ({{ui:editor.group.visibility}}), **Show overhangs** switches the overhangs on. Every face that points down more steeply than 45° is then hatched red and white - that is where the printer would need supports. What rests on the plate stays clear. So you see while designing whether a sphere, an arch or a horizontal hole prints without supports; the [teardrop hole](chapter:threads-and-mechanics) is made for exactly that. Turn the part or lay it on another face with {{ui:editor.tool.layFlat}}, and the hatching follows at once.

How steep your printer manages is set in the settings under {{ui:workspace.appearance}}: from 30° (careful) to 70° (for printers with good part cooling). A face resting on another body is still marked - Pare 3D only looks at the face itself.

## Cut below the bed

Sometimes you sink a part partly below the plate on purpose, to give a round or uneven part a flat base. The slicer cuts off whatever is below the plate. {{ui:cutBelowBed.button}} does the same in Pare 3D, so you see what will print: each part that sinks below the plate is grouped with a hole box filling everything under the plate beneath it. With nothing selected, every part is cut; otherwise the selected ones. It stays an ordinary group - {{ui:editor.tool.ungroup}} takes the cut back. Find it in {{ui:printCheck.title}}, or search for it with [[Ctrl]]+[[K]].

## Fit check: overlaps and tight gaps

Parts that move against each other - a lid, a hinge, a print-in-place joint, a gear on a shaft - need a gap between them, or they fuse when printed. **{{ui:fitCheck.title}}** in the Arrange group finds where that goes wrong:

- With two or more parts selected it checks those; otherwise every visible part.
- Where parts **overlap**, what they share shows in red on the plate, and the list gives its volume.
- Where parts come **closer than the {{ui:fitCheck.clearance}}** (0.3 mm to begin with), the list says how far apart they are. 0.2 to 0.4 mm suits most printers for parts that print together and must move; the fit test under "Holes that fit" below tells you what yours needs.

Click a line in the list to select its two parts. The check runs again by itself whenever a part moves, so you can nudge parts apart with the window open and watch the list empty. {{ui:edge.done}} closes it.

## Holes that fit

A printed hole comes out a little smaller than drawn, so a 5 mm peg will not go into a 5 mm hole. Give the hole the clearance in its size - for a 5 mm peg that should slide, make the hole 5.2 to 5.4 mm - or let the slicer do it for every hole at once (in Bambu Studio: X-Y hole compensation, under Quality).

As a rule of thumb:

- about 0.1 mm larger: the part goes in firmly and stays put;
- about 0.2 mm: slides in and out, for lids and pegs;
- about 0.4 mm: turns or moves freely, for hinges and axles.

### Finding your printer's own fit

Every printer is a little different. {{ui:fitTest.title}} in **Ready-made parts** finds yours: {{ui:fitTest.make}} puts a strip of holes, each a little bigger than the last, and a peg on the plate. Print both and try the peg in each hole: the tightest one it slides into without forcing tells you the clearance your printer needs.

Brims and mouse ears against warping are set in the slicer too, so Pare 3D leaves them to it.

## Ready to print?

Before you send a design to the printer, {{ui:printCheck.title}} looks it over for the things that spoil a print, and says which part each one is on:

- a part that goes past the edge of the plate - with {{ui:splitToFit.button}} right there;
- a part that sinks below the plate - the slicer cuts that off - with {{ui:cutBelowBed.button}} right there;
- a part floating in the air with nothing under it;
- a hole on its own, which cuts nothing until it is grouped with a part;
- a wall too thin to print;
- overhangs that will need supports ({{ui:printCheck.showOverhangs}} hatches them);
- hidden parts, which are not exported.

{{ui:printCheck.select}} selects the part in question so you can fix it. Open the check from the menu next to **Send to Bambu Studio**, or search for it with [[Ctrl]]+[[K]].

## Sending to Bambu Studio

**Send to Bambu Studio** in the title row exports the design and opens it in your slicer in one step. The small menu beside it chooses the slicer - for filament Bambu Studio, OrcaSlicer or PrusaSlicer, for resin PreForm (Formlabs), CHITUBOX or Lychee Slicer; the button then says "Send to" that slicer, and a slicer the app cannot find on this computer is marked "not found" - and the file type: **STL** (one merged body) or **3MF** (each part with its colour, for multicolour prints; the resin slicers read 3MF too). The app keeps a copy in Documents › Pare 3D Exports. In a web browser the file is downloaded instead, and you open it in the slicer yourself. An app installed before build 70 sends only to Bambu Studio; download the app again once for the others.

Switch on {{ui:printCheck.menuItem}} in the same menu and {{ui:printCheck.title}} runs each time you send. If it finds something, you can fix it first or choose {{ui:printCheck.sendAnyway}}.

## Wall thickness, clearance and chamfers

- Walls should be at least two extrusion lines wide, so 0.8 mm with a 0.4 mm nozzle. Sturdy parts need 1.2 to 2 mm.
- Where two parts fit into each other you need clearance: usually 0.2 to 0.4 mm, depending on the printer. The fit test above tells you what your printer needs.
- Many people lightly chamfer the lower edge that sits on the plate. That keeps the first layer from spreading ("elephant foot").

## When you are ready

Choose {{ui:editor.export}} and then **STL** or **3MF**. STL is the simplest format. 3MF keeps names and colours of the individual bodies and is therefore handy when you print in several colours. The export window also shows how many grams and metres of filament the part would take printed solid. More in [Files and saving](chapter:files-and-saving).
