/**
 * Fork (build 41): which faces of a mesh form separate pieces (for Separate Parts), with points
 * closer than `tolerance` counted as one. The points are welded through an open-addressing hash of
 * their rounded coordinates held in typed arrays, with an exact compare, and the faces are joined
 * with a union-find - a 600,000-triangle scan took over a second with a text key for every point.
 */
export function weldedVertexIds(vertices: ReadonlyArray<ArrayLike<number>>, tolerance: number): Int32Array {
  const n = vertices.length;
  let size = 1;
  while (size < n * 2) size <<= 1;
  const mask = size - 1;
  const slotX = new Int32Array(size);
  const slotY = new Int32Array(size);
  const slotZ = new Int32Array(size);
  const slotId = new Int32Array(size).fill(-1);
  const ids = new Int32Array(n);
  let next = 0;
  for (let i = 0; i < n; i += 1) {
    const v = vertices[i];
    const x = Math.round(v[0] / tolerance), y = Math.round(v[1] / tolerance), z = Math.round(v[2] / tolerance);
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask;
    for (;;) {
      if (slotId[h] === -1) {
        slotX[h] = x;
        slotY[h] = y;
        slotZ[h] = z;
        slotId[h] = next;
        ids[i] = next;
        next += 1;
        break;
      }
      if (slotX[h] === x && slotY[h] === y && slotZ[h] === z) {
        ids[i] = slotId[h];
        break;
      }
      h = (h + 1) & mask;
    }
  }
  return ids;
}

/** The face indices of each separate piece. */
export function faceComponents(vertices: ReadonlyArray<ArrayLike<number>>, faces: ReadonlyArray<ArrayLike<number>>, tolerance: number): number[][] {
  if (faces.length === 0) return [];
  const ids = weldedVertexIds(vertices, tolerance);
  const parent = new Int32Array(vertices.length);
  for (let i = 0; i < parent.length; i += 1) parent[i] = i;
  const find = (start: number) => {
    let a = start;
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  for (const face of faces) {
    const a = find(ids[face[0]]);
    for (let k = 1; k < face.length; k += 1) {
      const b = find(ids[face[k]]);
      if (a !== b) parent[b] = a;
    }
  }
  const byRoot = new Map<number, number[]>();
  faces.forEach((face, faceIndex) => {
    const root = find(ids[face[0]]);
    const list = byRoot.get(root);
    if (list) list.push(faceIndex);
    else byRoot.set(root, [faceIndex]);
  });
  return [...byRoot.values()];
}
