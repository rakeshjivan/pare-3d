/// <reference lib="webworker" />

import { buildMessage } from "@/lib/buildStamp";
import { buildGroupedShapeFromSelection, splitShapeByPlane } from "@/lib/editorBooleans";
import { getManifoldRuntime, setManifoldAssetBase } from "@/lib/editorMeshCore";
import { packValue, packedTransfer, unpackValue } from "@/lib/geometryTransfer";
import type { GeometryWorkerRequest, GeometryWorkerResponse } from "@/lib/geometryWorkerTypes";
import { setLanguage } from "@/lib/i18n";
import type { ModelSplitPlane } from "@/lib/modelSplit";
import type { WorkplaneShape } from "@/types/layerling";

/**
 * Groups, cuts and splits off the page, so the editor keeps moving while Manifold works
 * (lib/geometryWorker.ts). The same functions as on the page, with the same arguments.
 */

function post(message: GeometryWorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer });
}

// The first thing the page hears: which build this worker is from (lib/buildStamp.ts).
self.postMessage(buildMessage());

self.onmessage = async (event: MessageEvent<GeometryWorkerRequest>) => {
  const request = event.data;
  try {
    setManifoldAssetBase(request.assetBase);
    await setLanguage(request.language, false);
    const received = new Map<unknown[], number>();
    const args = unpackValue(request.payload, request.buffers, [], received);
    let result: unknown;
    if (request.task === "group") {
      const { selected, triangleLimit } = args as { selected: WorkplaneShape[]; triangleLimit: number };
      result = await buildGroupedShapeFromSelection(selected, triangleLimit);
    } else if (request.task === "split") {
      const { shape, plane } = args as { shape: WorkplaneShape; plane: Pick<ModelSplitPlane, "axis" | "normal" | "position"> };
      result = await splitShapeByPlane(shape, plane);
    } else if (request.task === "warm") {
      await getManifoldRuntime();
      result = null;
    } else {
      throw new Error(`Unknown geometry task ${String(request.task)}`);
    }
    // Lists the result took over unchanged go back as references to the page's own arrays.
    const packed = packValue(result, received);
    post({ requestId: request.requestId, ok: true, payload: packed.value, buffers: packed.buffers }, packedTransfer(packed));
  } catch (error) {
    post({
      requestId: request.requestId,
      ok: false,
      message: error instanceof Error ? error.message : String(error ?? ""),
      name: error instanceof Error ? error.name : "Error",
    });
  }
};
