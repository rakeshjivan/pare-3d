import type { MeshData } from "@/lib/editorMeshCore";

/**
 * How many separate parts a mesh is made of: faces that share a corner - two corners count as
 * one when they round to the same point on a `tolerance` grid - belong to one part. The same
 * count as the parts "Separate parts" makes (meshFaceComponents in LayerlingEditor.tsx), worked
 * out without a text key per corner: the editor asks it whenever a large import is selected, and
 * the text keys took a quarter of a second for 200,000 triangles.
 */
export function meshPartCount(mesh: MeshData, tolerance: number): number {
  const { faces, vertices } = mesh;
  if (faces.length === 0) return 0;
  const vertexCount = vertices.length;
  // The corners on the grid, three numbers each; +0 makes -0 and 0 the same point, as the text key does.
  const grid = new Float64Array(vertexCount * 3);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const point = vertices[vertex];
    grid[vertex * 3] = Math.round(point[0] / tolerance) + 0;
    grid[vertex * 3 + 1] = Math.round(point[1] / tolerance) + 0;
    grid[vertex * 3 + 2] = Math.round(point[2] / tolerance) + 0;
  }

  // Each corner's representative: the first corner at the same grid point, found in an open-addressing table.
  let capacity = 1;
  while (capacity < vertexCount * 2) capacity <<= 1;
  const mask = capacity - 1;
  const table = new Int32Array(capacity).fill(-1);
  const representative = new Int32Array(vertexCount);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const x = grid[vertex * 3];
    const y = grid[vertex * 3 + 1];
    const z = grid[vertex * 3 + 2];
    // MurmurHash3's finisher mixes the three, or the points of a regular mesh would pile up.
    let hash = Math.imul(hashPart(x), 0x9e3779b1);
    hash = Math.imul(hash ^ hashPart(y), 0x85ebca6b);
    hash = Math.imul(hash ^ hashPart(z), 0xc2b2ae35);
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b);
    hash ^= hash >>> 13;
    hash &= mask;
    for (;;) {
      const entry = table[hash];
      if (entry === -1) {
        table[hash] = vertex;
        representative[vertex] = vertex;
        break;
      }
      if (sameNumber(grid[entry * 3], x) && sameNumber(grid[entry * 3 + 1], y) && sameNumber(grid[entry * 3 + 2], z)) {
        representative[vertex] = entry;
        break;
      }
      hash = (hash + 1) & mask;
    }
  }

  // Faces sharing a representative corner are joined (union-find with path halving).
  const parent = new Int32Array(vertexCount);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) parent[vertex] = vertex;
  const find = (start: number) => {
    let current = start;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  for (let index = 0; index < faces.length; index += 1) {
    const face = faces[index];
    const a = find(representative[face[0]]);
    const b = find(representative[face[1]]);
    if (a !== b) parent[b] = a;
    const c = find(representative[face[2]]);
    if (c !== a) parent[c] = a;
  }

  let count = 0;
  const counted = new Uint8Array(vertexCount);
  for (let index = 0; index < faces.length; index += 1) {
    const root = find(representative[faces[index][0]]);
    if (!counted[root]) {
      counted[root] = 1;
      count += 1;
    }
  }
  return count;
}

function hashPart(value: number) {
  return value !== value ? 0x7fc00000 : (value | 0) ^ ((value / 4294967296) | 0);
}

/** NaN meets NaN, as the text "NaN" meets itself. */
function sameNumber(a: number, b: number) {
  return a === b || (a !== a && b !== b);
}
