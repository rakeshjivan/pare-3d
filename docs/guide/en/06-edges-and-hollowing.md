---
title: Breaking edges and hollowing bodies
summary: Chamfer and fillet on chosen edges, walls of equal thickness for boxes, cups and cases.
---

## Chamfering and filleting edges

Sharp edges rarely look good on a printed part, and they are not particularly strong either. A **fillet** rounds an edge, a **chamfer** cuts it off at a slant, and a **chamfillet** makes a printable foot (a chamfer at the plate that blends into a curve). All three live in one window and act on the edges you pick.

### The quick way

1. Select the body (or the group).
2. Click {{ui:editor.tool.fillet}} or {{ui:editor.tool.chamfer}} in the ribbon, press [[B]] for the fillet or [[Shift+B]] for the chamfer, or right-click the body and pick it from the menu. At the top of the window you can switch between {{ui:edge.kindRound}}, {{ui:editor.tool.chamfer}} and {{ui:edge.chamfillet}} at any time.
3. Pick the edges. {{ui:edge.allSharpEdges}} takes every edge; {{ui:edge.outsideEdges}} takes the edges that stick out (a box's corners), {{ui:edge.insideEdges}} the ones tucked in (where a wall meets the floor of a pocket - rounding those makes a part much stronger). Or click edges one by one: another click takes an edge out again, and a click on a **face** picks all its edges at once.
4. Click a size: **0.5**, **1**, **2**, **3** or **5** mm. Or drag the size box along its slider, click it to type an exact value, or press on a picked edge and drag it into the part (hold [[Shift]] for finer steps).
5. Confirm with {{ui:edge.apply}} or [[Enter]]. The window stays open on the new body with the same size, so the next fillet or chamfer can follow at once; {{ui:edge.done}}, [[Esc]] or the cross closes it.

**{{ui:edge.largest}}** tries sizes on the picked edges and takes the largest one that works - handy when you want an edge as round as it can be. When a size is too big, the message offers the same thing: {{ui:edge.largestAction}}.

Pare 3D remembers the last size you applied with each kind, so the next part starts from it.

![The "Fillet edges" tool: all sharp edges are selected, the picture shows the preview with a 4 mm radius.](shot:fillet-preview)

The panel sits at the top right. If it covers edges you want to click, drag it away by its title bar; it opens there next time too, and so do {{ui:editor.tool.hollow}} and {{ui:editor.tool.array}}. Double-click the title bar to put it back.

Picking a shape from the shape list while the panel is open closes it without applying anything, and the edges you clicked are forgotten. The click then places the new shape instead of picking edges.

### More picks

- {{ui:edge.topEdges}} picks only the edges along the very top of the body - the quick way for a cookie cutter: build the outline in a sketch as a stroke, then chamfer the top edges.
- {{ui:edge.bottomEdges}} picks only the edges along the very bottom, to round or chamfer the foot of a part. With {{ui:edge.chamfillet}} it makes the printable foot: the first layers need no support and the edge still ends soft. {{ui:edge.distance}} is the height the foot takes up.
- {{ui:edge.verticalEdges}} picks the edges that stand straight up, {{ui:edge.horizontalEdges}} the ones that lie flat.
- With [[Shift]] or [[Ctrl]] a click on one of these buttons adds its edges to the ones picked instead of replacing them. {{ui:edge.clear}} empties the selection.

### More options

The window keeps the fine controls under **{{ui:common.moreOptions}}**:

- **{{ui:edge.chamferShape}}** for a chamfer: {{ui:edge.styleEqual}} (45°), {{ui:edge.styleAngle}} (a distance and an angle) or {{ui:edge.styleDistances}} - a different distance on each face, such as 2 mm down the side and 5 mm across the top. {{ui:edge.swapSides}} puts the longer side on the other face. For a chamfillet, {{ui:edge.angle}} (15° to 75°) sets how steep the chamfer at the plate is.
- **{{ui:edge.variableRadius}}** for a fillet: the rounding starts at {{ui:edge.startRadius}} and ends at {{ui:edge.endRadius}}, like a variable radius fillet in Fusion. {{ui:edge.swapEnds}} turns it round. Pick a few edges at a time; each is rounded in turn.
- {{ui:edge.sharpThreshold}} decides which edges count as sharp at all. A value of 25° treats only clear kinks as edges and leaves flat transitions alone.
- {{ui:edge.onlyVisibleEdges}} hides the edges that lie behind the body from where you look, so you see, and can click, only the edges facing you. An edge drawn in red (see below) always shows.
- {{ui:edge.tangentChains}}: a click then also picks edges that flow smoothly into each other, for example all edges around a face with rounded corners. The CAD kernel always carries a chamfer or fillet on along such smoothly continuing edges; the panel tells you along how many more edges that happens.
- {{ui:edge.keepSize}} keeps the chamfer or fillet as large as it is, even if you scale the body later.
- {{ui:edge.previewQuality}} ({{ui:edge.draft}}, {{ui:edge.standard}} or {{ui:edge.fine}}) decides how finely the preview is calculated. For difficult parts {{ui:edge.draft}} is faster.

While you adjust the size, Pare 3D recalculates the preview. It can take a moment. You may keep adjusting; the last value you chose is what gets calculated.

If the size is too large for the edge, Pare 3D says so and offers {{ui:edge.largestAction}}. Often one or two millimetres less will do. At sharp angles a fillet needs more room than its radius suggests. On a small screen the panel scrolls down by itself so the message is in view.

When a selection that worked fails after you click one more edge, that edge turns red and is drawn wider: it is the one that cannot be treated together with the others at this size. Click it again to take it out, or make the size smaller. If you click more edges while the message stands, the first one stays red. When there is no earlier selection that worked - the very first click, or a size you just raised - the edges that fail even on their own turn red, or all of them if it is only their combination.

The edge under the pointer is drawn wider too, so you can see which one a click will pick.

### Taking an edge treatment back

A treated body can always be treated again. Select it again and open the tool - Fillet, Chamfer or Hollow, each shows the list: under {{ui:edge.featureHistory}} you see what is already on it. {{ui:edge.revertAction}} takes back a single treatment. Note: if newer treatments lie on top, they go with it, and the panel tells you how many.

Next to a chamfer, a fillet or a hollowing there is also {{ui:edge.editAction}}. It takes the treatment back the same way, but opens the tool again at once with the same edges and the old value. You change the value and apply it again: a 3 mm fillet becomes a 5 mm one without clicking the edges once more. If newer treatments lie on top, they go with it here too. This holds for edge treatments you make from now on; older ones only offer taking back, and so do single parts of a group.

On a group, say a cylinder with a hole, the treated edge belongs to the finished body, not to one of its parts. So the group becomes a single body. {{ui:editor.tool.ungroup}} still works on it: it takes the edge features back first and then dissolves the group, in one step that [[Ctrl]]+[[Z]] undoes. Take the treatment back as described above and the group returns with all its parts. The easiest way is to treat edges last. That goes for threads too: the edge tool takes a thread as its exact body, so a block with a tapped hole in it gets its edges rounded with the thread in place. Working out a thread's edges takes longer than for a plain shape, a few seconds for an M6 and about half a minute for a G1/2 pipe thread.

> **Good to know:** Pare 3D works with real CAD geometry for fillets and chamfers, not just a triangle mesh. That is why a rounded edge is still a rounded edge in the STEP export.

A part imported as STEP keeps its CAD geometry too: chamfers, fillets and hollowing work on the body from the file, however finely the part is drawn on screen. STL, OBJ and 3MF bring only triangles, and a finely drawn part can be too dense for the edge tool. If a part is also available as STEP, import that.

## Hollowing bodies

Boxes, cups, cases and covers have one thing in common: they are empty inside, with walls of equal thickness. That is exactly what {{ui:editor.tool.hollow}} does.

1. Select the body and click {{ui:editor.tool.hollow}}, or right-click the body and pick it from the menu.
2. Set the {{ui:shell.wall}} - or drag it: press on a face and drag inward, and the wall thickness follows, shown beside the pointer.
3. Click the faces that should stay open, right on the part. The first click makes that face the opening (the top is only the starting choice); further clicks add more faces, and a click on an open face closes it again. Only a face pointing straight up, down, front, back, left or right can be left open. Every side that will be left open stays shaded grey on the part until you press {{ui:shell.apply}}, so you can see what you picked. Or under {{ui:shell.openings}}, switch on the sides that stay open: {{ui:shell.side.top}}, {{ui:shell.side.bottom}}, {{ui:shell.side.front}}, {{ui:shell.side.back}}, {{ui:shell.side.left}} or {{ui:shell.side.right}}, as many as you like - {{ui:shell.side.front}} alone makes a slot for a drawer, {{ui:shell.side.left}} and {{ui:shell.side.right}} a tunnel. With no side switched on the body stays closed all round, with a cavity in the middle.
4. Decide whether the {{ui:shell.edges}} should be {{ui:shell.edges.round}} or {{ui:shell.edges.sharp}}.
5. Click {{ui:shell.apply}} or press [[Enter]].

![The hollowing panel with wall thickness, a switch for each side that stays open, and the inner edges.](shot:hollow-panel)

The walls grow inward. The outside stays as it is.

With no side open, the cavity is sealed inside and the part looks just as solid as before; the message after hollowing says so. To change it, select the part and click {{ui:editor.tool.hollow}} again: the tool opens with the hollowing it already has - its open sides shaded grey - and a click on another face adds that side, so a cup open at the top can be opened at the bottom too. {{ui:shell.apply}} replaces the hollowing - with a different wall, other open sides, or after the part was resized.

The {{ui:shell.edges}} only matter where the inner walls move apart - at a step in the body or around an opening. The corners of the cavity of a plain box are always sharp, with both settings. For a rounded inside, round the outside edges of the body first (see above), then hollow it: the inside follows with the radius minus the wall thickness. If the rounded inside cannot be built, which can happen with an outline made of very many short straight pieces such as a traced drawing, Pare 3D builds the same hollow body with sharp inner corners instead.

![The result: a shell with a 3 mm wall, open at the top.](shot:hollow-result)

![The same box with only the front side open: a slot for a drawer.](shot:hollow-sides)

For every open side, the body needs a flat face at its very edge on that side. Spheres and free-form shapes therefore cannot be hollowed this way. If the wall is too thick for the body, Pare 3D tells you and asks for a thinner one. A rounded box whose top and bottom edges are rounded as well is such a case: its wall has to be clearly thinner than that rounding, or set the rounding to 0 first.

A body with a pocket - a block with a hole that does not go all the way through, made by grouping a box with a raised hole - can be hollowed too, with the top open: the walls round the pocket are hollowed as well, so a ring of cavity stays between the outer wall and the pocket, open at the top, and a thin cavity lies under the pocket's floor.

**Bodies that end in a point,** such as a cone or a revolved triangle, have no flat face on top that could stay open. A fully closed cavity does not work there either, because a point cannot be offset inwards: even with a 1 mm wall you get the message that the walls cannot be this thick. Draw the wall into the profile before revolving instead: duplicate the outline, scale the copy down evenly, put it in the middle of the large outline and cut the large one with it, then revolve the whole (chapter Sketches, section Revolve). The distance between the two outlines is the wall thickness.

If you resize a hollowed body later, Pare 3D hollows it again at the new size right away. The wall stays as thick as you chose, round bodies included. A cylinder you pull further one way than the other becomes an ellipse.

> **Tip:** With a 0.4 mm nozzle, 1.2 to 2 mm of wall is a good start: thin enough to save material, thick enough for a sturdy part.

## Deleting faces

A fillet in the way, a hole in the wrong place, a boss you no longer need: {{ui:editor.tool.deleteFace}} takes it off the body again, without building the body anew.

1. Select the body and click {{ui:editor.tool.deleteFace}}, or right-click the body and pick it from the menu.
2. Click every face of what should go: the faces of a rounded edge, the wall of a hole, the side and the top of a boss. A picked face lights up; another click takes it out again. The panel counts the faces.
3. Click {{ui:deleteFace.apply}} or press [[Delete]]. [[Esc]] closes the tool without changing anything.

The faces around the deleted ones grow until the gap is closed. A box with rounded top edges gets its sharp edges back, a hole is filled, a boss is gone. The body stays exact, so it can be filleted and chamfered again and the STEP export keeps its true faces. [[Ctrl]]+[[Z]] takes the deletion back in one step. It is also listed under {{ui:edge.featureHistory}} with the fillets and chamfers, where {{ui:edge.revertAction}} takes it back; there is no {{ui:edge.editAction}} for it. On a group, the result is a single body, as with an edge treatment.

Pick all the faces of what should go, and only those. If the faces around them cannot close the gap, Pare 3D says so and nothing changes: a main side of a box, for example, has no neighbour that could take its place. Deleting only the floor of a pocket turns it into a hole straight through, because the walls of the pocket run on to the other side.

{{ui:editor.tool.deleteFace}} needs exact faces: it works on parts imported as STEP and on Pare 3D's shapes. Whatever Pare 3D keeps as a mesh has none: an imported STL, OBJ or 3MF, a split, wrapped or simplified body, or a very detailed shape such as a long text. Import a part as STEP if you can. On a detailed imported part, a few faces can be too much for the CAD kernel: after 45 seconds the deletion is stopped and nothing changes. A body resized after an edge treatment while keeping its edge size has no exact faces at its new size until the resize is taken back.
