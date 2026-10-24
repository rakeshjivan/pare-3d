import { t } from "@/lib/i18n";
import { getFileSettings, saveUserFile } from "@/lib/pareFiles";
import { displayShapeName } from "@/lib/shapeCatalog";
import { toSvgProjection, type SvgProjectionLayer } from "@/lib/svgExport";
import { footprintCutOffset, sectionSvgDocument, sliceMeshContours } from "@/lib/sectionSvg";
import type { WorkplaneShape } from "@/types/layerling";
import { type MeshData, type ManifoldSolid, getManifoldRuntime } from "@/lib/editorMeshCore";
import { meshDataToManifoldMesh, shapeToManifoldSolid, exportBodiesWithLooseHoles, colorSeparatedExportMeshes, disposeManifold } from "@/lib/editorBooleans";

/* Files in and out of the editor: reading pictures, the SVG drawings of a design, and downloads. Moved out of LayerlingEditor (build 55). */

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Image could not be read"));
      }
    });
    reader.addEventListener("error", () => reject(new Error("Image could not be read")));
    reader.readAsDataURL(file);
  });
}

export function loadImageElement(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Image could not be decoded")));
    image.src = dataUrl;
  });
}

export async function prepareImportedImage(file: File) {
  const sourceUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(sourceUrl);
  const pixelWidth = image.naturalWidth || image.width;
  const pixelHeight = image.naturalHeight || image.height;

  if (!pixelWidth || !pixelHeight) {
    throw new Error("Image has no readable dimensions");
  }

  const maxTextureSide = 2048;
  const textureScale = Math.min(1, maxTextureSide / Math.max(pixelWidth, pixelHeight));
  if (textureScale >= 1) {
    return {
      dataUrl: sourceUrl,
      mimeType: file.type || "image/png",
      pixelWidth,
      pixelHeight,
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(pixelWidth * textureScale));
  canvas.height = Math.max(1, Math.round(pixelHeight * textureScale));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Image could not be prepared");
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const mimeType = file.type === "image/jpeg" || file.type === "image/webp" ? file.type : "image/png";
  return {
    dataUrl: canvas.toDataURL(mimeType, 0.92),
    mimeType,
    pixelWidth,
    pixelHeight,
  };
}

export function imagePlateDimensions(pixelWidth: number, pixelHeight: number) {
  const aspect = pixelWidth / Math.max(1, pixelHeight);
  const targetMax = 72;
  const minVisibleSide = 14;
  const maxAllowedSide = 110;
  let width = aspect >= 1 ? targetMax : targetMax * aspect;
  let depth = aspect >= 1 ? targetMax / aspect : targetMax;
  const minSide = Math.min(width, depth);

  if (minSide < minVisibleSide) {
    const boost = minVisibleSide / Math.max(0.001, minSide);
    width *= boost;
    depth *= boost;
  }

  const maxSide = Math.max(width, depth);
  if (maxSide > maxAllowedSide) {
    const shrink = maxAllowedSide / maxSide;
    width *= shrink;
    depth *= shrink;
  }

  return {
    width: Number(width.toFixed(2)),
    depth: Number(depth.toFixed(2)),
    height: 1.6,
  };
}

/**
 * The SVG of only what stands on the workplane (#692): the outlines of the section a hair above the lowest
 * point, drawn as lines in their colours. `shapes` are the visible ones to export, loose holes among them.
 */
export async function footprintSvg(shapes: readonly WorkplaneShape[], title: string) {
  const { solids, meshes: cut } = await exportBodiesWithLooseHoles(shapes);
  const { meshes, quellen } = await colorSeparatedExportMeshes(solids, cut);
  const offset = footprintCutOffset(meshes);
  const bodies = offset === null ? [] : meshes.map((mesh, index) => {
    const body = solids[quellen[index]];
    return { name: body ? displayShapeName(body) : mesh.name, color: body?.color ?? "#000000", loops: sliceMeshContours(mesh, "y", offset) };
  });
  const result = offset === null ? null : sectionSvgDocument(bodies, "y", offset, title);
  if (!result) throw new Error(t("status.sectionSvgNothing"));
  return result;
}

/** `cutMeshes` holds a body's mesh where loose holes have cut it (#203); the others are built from the shape. */
export async function toSvg(shapes: WorkplaneShape[], title: string, cutMeshes: ReadonlyArray<MeshData | null> = []) {
  const runtime = await getManifoldRuntime();
  const layers: SvgProjectionLayer[] = [];

  for (const [index, shape] of shapes.entries()) {
    const created: ManifoldSolid[] = [];
    const projectedObjects: unknown[] = [];
    try {
      const cut = cutMeshes[index];
      let solid: ManifoldSolid | null;
      if (cut) {
        const manifoldMesh = meshDataToManifoldMesh(runtime, cut);
        try {
          solid = runtime.Manifold.ofMesh(manifoldMesh);
          created.push(solid);
        } finally {
          disposeManifold(manifoldMesh);
        }
      } else {
        solid = shapeToManifoldSolid(runtime, shape, created);
      }
      if (!solid || solid.status() !== "NoError" || solid.numTri() < 1) {
        throw new Error(`Could not convert ${shape.name} into a watertight SVG outline`);
      }

      // Seen from above with the front at the bottom, as the top view shows it: the plate's z runs
      // down the page. Turned the other way, every export came out mirrored top to bottom (#197).
      const topView = solid.rotate([-90, 0, 0]);
      if (topView !== solid) created.push(topView);
      const projection = topView.project();
      projectedObjects.push(projection);
      const simplified = projection.simplify(0.00001);
      if (simplified !== projection) projectedObjects.push(simplified);
      const polygons = simplified.toPolygons();
      if (!polygons.length) throw new Error(`Top view of ${shape.name} has no exportable area`);
      layers.push({ name: shape.name, color: shape.color, polygons });
    } finally {
      [...new Set([...projectedObjects, ...created])].reverse().forEach(disposeManifold);
    }
  }

  return toSvgProjection(layers, title);
}

// Fork (build 22): known before the first export click, which may not wait for it.
if (typeof window !== "undefined") void getFileSettings();

export function triggerBrowserDownload(filename: string, content: string, type: string) {
  void saveUserFile(filename, new Blob([content], { type }), t("files.saveExport"));
}

export async function downloadTextFile(filename: string, content: string, type: string) {
  await saveUserFile(filename, new Blob([content], { type }), t("files.saveExport"));
}

export async function downloadBlobFile(filename: string, blob: Blob) {
  // Fork (build 22): into the folder chosen in Settings, or where the save dialog says.
  await saveUserFile(filename, blob, t("files.saveExport"));
}
