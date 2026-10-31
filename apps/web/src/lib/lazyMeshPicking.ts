import * as THREE from "three";
import { acceleratedRaycast } from "three-mesh-bvh";
import { computeImportedBoundsTree } from "@/lib/importedMeshDisplay";

export function geometryTriangleCount(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  return geometry.getIndex()?.count
    ? Math.floor((geometry.getIndex()?.count ?? 0) / 3)
    : Math.floor((position?.count ?? 0) / 3);
}

/** From this size a treated body's mesh gets a picking tree: a ray then costs 0.01 ms instead of 1 ms and up (14 ms at 400,000). */
export const TREATED_BVH_TRIANGLE_THRESHOLD = 20_000;

/**
 * Ported from layerling 1.120: a body with edge treatments is rebuilt for every preview and every change, so it gets
 * no tree up front. A large one builds it the first time a ray is cast against it (the tape measure, placing a shape on it).
 */
export function enableLazyMeshPicking(mesh: THREE.Mesh, geometry: THREE.BufferGeometry) {
  if (geometryTriangleCount(geometry) < TREATED_BVH_TRIANGLE_THRESHOLD) return;
  mesh.raycast = function lazyAcceleratedRaycast(this: THREE.Mesh, raycaster, intersects) {
    if (!(geometry as THREE.BufferGeometry & { boundsTree?: unknown }).boundsTree) computeImportedBoundsTree(geometry);
    acceleratedRaycast.call(this, raycaster, intersects);
  };
}
