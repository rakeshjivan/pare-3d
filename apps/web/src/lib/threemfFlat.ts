import type { ThreeMfExportMesh } from "@/lib/threemfExport";

/**
 * Build 68: a 3MF body as flat number lists, to cross to the geometry worker in a few transferred
 * buffers instead of as hundreds of thousands of little corner arrays.
 */
export type FlatThreeMfMesh = { name: string; color?: string; faceColors?: readonly string[]; vertices: number[]; faces: number[] };

export function flattenThreeMfMeshes(meshes: readonly ThreeMfExportMesh[]): FlatThreeMfMesh[] {
  return meshes.map((mesh) => {
    const vertices = new Array<number>(mesh.vertices.length * 3);
    mesh.vertices.forEach((point, index) => {
      vertices[index * 3] = point[0];
      vertices[index * 3 + 1] = point[1];
      vertices[index * 3 + 2] = point[2];
    });
    const faces = new Array<number>(mesh.faces.length * 3);
    mesh.faces.forEach((face, index) => {
      faces[index * 3] = face[0];
      faces[index * 3 + 1] = face[1];
      faces[index * 3 + 2] = face[2];
    });
    return { name: mesh.name, ...(mesh.color !== undefined ? { color: mesh.color } : {}), ...(mesh.faceColors ? { faceColors: mesh.faceColors } : {}), vertices, faces };
  });
}

export function unflattenThreeMfMeshes(meshes: readonly FlatThreeMfMesh[]): ThreeMfExportMesh[] {
  return meshes.map((mesh) => {
    const vertices: [number, number, number][] = [];
    for (let index = 0; index + 2 < mesh.vertices.length; index += 3) vertices.push([mesh.vertices[index], mesh.vertices[index + 1], mesh.vertices[index + 2]]);
    const faces: [number, number, number][] = [];
    for (let index = 0; index + 2 < mesh.faces.length; index += 3) faces.push([mesh.faces[index], mesh.faces[index + 1], mesh.faces[index + 2]]);
    return { name: mesh.name, ...(mesh.color !== undefined ? { color: mesh.color } : {}), ...(mesh.faceColors ? { faceColors: mesh.faceColors } : {}), vertices, faces };
  });
}
