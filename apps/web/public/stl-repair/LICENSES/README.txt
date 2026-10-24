Third-party components shipped in Pare Mesh (all permissive, no cost):

- manifold-3d 3.5.4 (manifold.wasm + glue)   Apache-2.0     manifold-3d-Apache-2.0.txt
    manifold.wasm includes Clipper2 (Boost Software License 1.0, included as Clipper2-Boost-1.0.txt): https://github.com/elalish/manifold
- three.js (3D preview)                      MIT            three-MIT.txt
- pako (3MF zip)                             MIT AND Zlib   pako-MIT-Zlib.txt

Everything else (reading, checking, hole filling, rebuilding, thickness) is Pare's own code.
Methods from published papers: Liepa 2003 "Filling Holes in Meshes" (hole triangulation);
Ericson, "Real-Time Collision Detection" (point–triangle distance); Möller–Trumbore (ray–triangle).

Benchmark only (never shipped): MeshFix via pymeshfix (GPL), MeshLab via pymeshlab (GPL), ADMesh (GPL),
trimesh (MIT), manifold3d Python (Apache-2.0). Test models from alecjacobson/common-3d-test-models
(each under its own terms; used for measurement only, not included in dist/).
