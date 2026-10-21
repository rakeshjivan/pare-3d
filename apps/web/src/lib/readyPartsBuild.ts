import { buildGroupedShapeFromSelection } from "@/lib/editorBooleans";
import type { ReadyPart } from "@/lib/readyParts";
import type { WorkplaneShape } from "@/types/layerling";

/**
 * Fork: a ready-made part as the bodies it adds to the scene. Grouped parts are built the way the
 * Group tool builds them, so their holes are cut and they can be ungrouped and edited later.
 */
export async function buildReadyPart(part: ReadyPart, triangleLimit: number): Promise<WorkplaneShape> {
  const nested = await Promise.all((part.parts ?? []).map((inner) => buildReadyPart(inner, triangleLimit)));
  const members = [...part.shapes, ...nested];
  if (!part.group || members.length < 2) return members[0];
  const result = await buildGroupedShapeFromSelection(members, triangleLimit);
  if (!result.group) throw new Error(result.failureNotice);
  return { ...result.group, name: part.name };
}
