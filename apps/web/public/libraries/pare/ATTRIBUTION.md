# Pare tooth library

The tooth sets in this folder are made from Christian Brenes's tooth libraries, included in Pare 3D
with his permission. Credit: Christian Brenes.

- **Elchi library** (exocad): the Square, Round and Square Round forms (upper teeth and pontics) and
  the lower teeth and pontics, each set on its own ideal arch. In Pare 3D: Pare Square, Pare Oval,
  Pare Square-Oval and Pare Lower.
- **3D Smile Overlay**: two of its anterior designs. In Pare 3D: Pare Tapered and Pare Youthful.

They are converted to Pare 3D's compact tooth-set format (src/lib/toothLibrary.ts) by
tests/tools/buildPareLibrary.tool.ts, the Elchi files read by Pare 3D's own exocad reader
(src/lib/exocadLibrary.ts): each crown closed at its neck, simplified to within 0.01 mm of the original
surface and stored in its place in the arch. The pictures (*.png) are drawn from the sets by the same tool.

The permission covers Pare 3D. Anyone redistributing these files outside Pare 3D should ask
Christian Brenes first.
