import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildImportedMeshGeometry, smoothNormals } from "@/lib/importedMeshDisplay";

const soupOf = (geometry: THREE.BufferGeometry) => Float32Array.from((geometry.toNonIndexed().getAttribute("position") as THREE.BufferAttribute).array as Float32Array);

describe("Smooth drawing of meshes (build 87)", () => {
  it("draws a sphere smooth: each corner's normal points out from the centre, not along its face", () => {
    const soup = soupOf(new THREE.IcosahedronGeometry(10, 3));
    const n = smoothNormals(soup);
    let worst = 1;
    for (let c = 0; c < soup.length / 3; c += 1) {
      const p = new THREE.Vector3(soup[c * 3], soup[c * 3 + 1], soup[c * 3 + 2]).normalize();
      worst = Math.min(worst, p.dot(new THREE.Vector3(n[c * 3], n[c * 3 + 1], n[c * 3 + 2])));
    }
    expect(worst).toBeGreaterThan(0.995);
  });

  it("keeps a box's edges sharp: each corner keeps its face's normal", () => {
    const soup = soupOf(new THREE.BoxGeometry(10, 10, 10));
    const n = smoothNormals(soup);
    for (let t = 0; t < soup.length / 9; t += 1) {
      const a = new THREE.Vector3(soup[t * 9], soup[t * 9 + 1], soup[t * 9 + 2]);
      const b = new THREE.Vector3(soup[t * 9 + 3], soup[t * 9 + 4], soup[t * 9 + 5]);
      const c = new THREE.Vector3(soup[t * 9 + 6], soup[t * 9 + 7], soup[t * 9 + 8]);
      const face = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      for (let k = 0; k < 3; k += 1) expect(face.dot(new THREE.Vector3(n[(t * 3 + k) * 3], n[(t * 3 + k) * 3 + 1], n[(t * 3 + k) * 3 + 2]))).toBeGreaterThan(0.999);
    }
  });

  it("ignores an STL's facet normals and draws the scan smooth", () => {
    const soup = soupOf(new THREE.IcosahedronGeometry(10, 2));
    const facets: number[] = [];
    for (let t = 0; t < soup.length / 9; t += 1) {
      const a = new THREE.Vector3(soup[t * 9], soup[t * 9 + 1], soup[t * 9 + 2]);
      const f = new THREE.Vector3(soup[t * 9 + 3], soup[t * 9 + 4], soup[t * 9 + 5]).sub(a).cross(new THREE.Vector3(soup[t * 9 + 6], soup[t * 9 + 7], soup[t * 9 + 8]).sub(a)).normalize();
      for (let k = 0; k < 3; k += 1) facets.push(f.x, f.y, f.z);
    }
    const geometry = buildImportedMeshGeometry({ positions: Array.from(soup), normals: facets, baseWidth: 20, baseDepth: 20, baseHeight: 20, triangleCount: soup.length / 9 } as never);
    const n = geometry.getAttribute("normal").array as Float32Array;
    // The three corners of a triangle no longer share one normal.
    expect(Math.abs(n[0] - n[3]) + Math.abs(n[1] - n[4]) + Math.abs(n[2] - n[5])).toBeGreaterThan(1e-3);
  });

  it("is quick on a full-arch-sized scan", () => {
    const soup = soupOf(new THREE.PlaneGeometry(70, 55, 470, 470));
    const started = performance.now();
    smoothNormals(soup);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
