---
title: Licences and credits
summary: Pare 3D's licence, where its code comes from, and the people and projects whose work is in it.
---

## Pare 3D's licence

Pare 3D is free software: you may use it, study it, share it and change it under the terms of the **GNU Affero General Public License, version 3 only** (AGPL-3.0-only). Its source code is on [GitHub](https://github.com/rakeshjivan/pare-3d); the licence's full text is in the `LICENSE` file there. If you change Pare 3D and let other people use your version over a network, the licence asks you to offer them its source code too.

Pare 3D comes with **no warranty**, to the extent the law allows - see sections 15 and 16 of the licence. It is a tool for making models; it does not replace a clinician's judgement, and nothing it shows is a diagnosis.

## Where the code comes from

Pare 3D began as a modified version of **layerling** (copyright 2026 layerling contributors), which in turn is a modified version of **SketchForge-3D** by Formsmith746 and the SketchForge contributors (copyright 2026 SketchForge contributors). Both are licensed under the AGPL-3.0, as Pare 3D is. Pare 3D has been changed substantially since, with its own Dental Studio, Wax-up Studio, Sculpt tools, printer integration and design; the history of every change is in the source code. Their copyright notices are kept in the source as the licence requires.

## Dental data and models

- **Tooth libraries:** by Dr Adam Nulty, used with his permission (CC BY-NC-ND 4.0); and by [teethy.org](https://teethy.org), redistributed with written permission.
- **Tooth finder:** the trained network is CrossTooth - Xi et al., *3D Dental Model Segmentation with Geometrical Boundary Preserving*, CVPR 2025 - used with the authors' permission.

## Open-source libraries

Pare 3D is built with, among others: [three.js](https://threejs.org) (MIT), [Manifold](https://github.com/elalish/manifold) (Apache-2.0), [OpenCascade](https://dev.opencascade.org) through occt-wasm and brepjs (LGPL-2.1 with exception), [meshoptimizer](https://github.com/zeux/meshoptimizer) (MIT), three-mesh-bvh and three-bvh-csg (MIT), [opentype.js](https://opentype.js.org) (MIT), fflate (MIT), qrcode-generator (MIT), React and Next.js (MIT) and Lucide icons (ISC). Each keeps its own licence; the full list with versions is in the source code's `package.json` and `package-lock.json`.

## Trademarks

Tinkercad is a trademark of Autodesk, Inc.; Meshmixer of Autodesk, Inc.; 3Shape and TRIOS of 3Shape A/S; Medit of Medit Corp.; exocad of exocad GmbH; Bambu Lab and Bambu Studio of Bambu Lab. Pare 3D is an independent project and is not affiliated with, endorsed or sponsored by any of them; their names are used only to describe how Pare 3D compares or works with their products.
