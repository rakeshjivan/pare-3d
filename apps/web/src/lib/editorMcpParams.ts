import { type LoftMeasures } from "@/lib/loftGeometry";
import { bentTubeNaturalDimensions, normalizedBentTubeFields } from "@/lib/bentTubeGeometry";
import { defaultThreadHeadHeight, normalizeThreadHeadHeight, threadNaturalFootprint, threadSettings } from "@/lib/threadGeometry";
import { shapeExtrudeDeformPatch, shapeTaperPatch } from "@/lib/workplaneShapes";
import { normalizeShapeCustomizations } from "@/lib/workplaneSettings";
import type { ShapeCustomization, ShapeKind, WorkplaneNote, WorkplaneShape } from "@/types/layerling";

/* Reading the parameters of the editor's MCP actions: numbers, strings and lists from untrusted JSON, and the patches they make. Moved out of LayerlingEditor (build 55). */

export function mcpNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function mcpOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Die formeigenen Werte eines Befehls, durch dieselbe Muehle gedreht wie die
 * Vorgaben im Arbeitsbereich: gleiche Grenzen, gleiche erlaubten Woerter. Was
 * dort nicht durchgeht, hat auch hier nichts verloren - sonst stuende spaeter
 * ein Wert im Paket, den der Pruefer beim Speichern ablehnt, und der ganze
 * Entwurf liesse sich nicht mehr sichern. Die Masse bleiben aussen vor, die
 * gehen ihren eigenen Weg.
 */
/**
 * Die Segmente eines gebogenen Rohrs kommen als Liste - oder als der Text, den
 * `layerling_read_scene` fuer sie ausgibt. Beides wird angenommen, damit ein
 * gelesener Wert unveraendert zurueckgeschickt werden kann.
 */
export function mcpBentTubeSegments(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}


/** A command's transition values as a change of measures - the same way the settings panel takes them. */
export function mcpLoftChange(params: Record<string, unknown>): Partial<LoftMeasures> {
  const change: Partial<LoftMeasures> = {};
  const outline = (value: unknown) => (value === "round" || value === "rectangle" || value === "polygon" ? value : undefined);
  const bottomOutline = outline(params.loftBottomOutline);
  const topOutline = outline(params.loftTopOutline);
  if (bottomOutline) change.bottomOutline = bottomOutline;
  if (topOutline) change.topOutline = topOutline;
  const numbers: Array<[string, keyof LoftMeasures]> = [
    ["loftBottomWidth", "bottomWidth"], ["loftBottomDepth", "bottomDepth"], ["loftTopWidth", "topWidth"], ["loftTopDepth", "topDepth"],
    ["loftBottomCorner", "bottomCorner"], ["loftTopCorner", "topCorner"], ["loftBottomSides", "bottomSides"], ["loftTopSides", "topSides"],
    ["loftOffsetX", "offsetX"], ["loftOffsetZ", "offsetZ"], ["loftWall", "wall"],
    ["loftTwist", "twist"], ["loftTiltX", "tiltX"], ["loftTiltZ", "tiltZ"], ["loftSmooth", "smooth"],
  ];
  numbers.forEach(([param, key]) => {
    const value = mcpOptionalNumber(params[param]);
    if (value !== undefined) Object.assign(change, { [key]: value });
  });
  return change;
}

export const MCP_BENT_TUBE_KEYS = ["bentTubeProfile", "bentTubeInnerProfile", "bentTubeSize", "bentTubeWall", "bentTubeQuality", "bentTubeSegments"] as const;

/**
 * Ein gebogenes Rohr bekommt seinen Rahmen aus Profil und Segmenten. Nur wer
 * Breite, Tiefe oder Hoehe ausdruecklich angibt, dehnt es darauf.
 */
export function mcpBentTubePatch(shape: WorkplaneShape, params: Record<string, unknown>): Partial<WorkplaneShape> {
  const segments = mcpBentTubeSegments(params.bentTubeSegments);
  const fields = normalizedBentTubeFields({
    ...shape,
    bentTubeSegments: (segments as WorkplaneShape["bentTubeSegments"]) ?? shape.bentTubeSegments,
  });
  const natural = bentTubeNaturalDimensions(fields);
  const width = mcpOptionalNumber(params.width ?? params.size) ?? natural.width;
  const depth = mcpOptionalNumber(params.depth ?? params.size) ?? natural.depth;
  const height = mcpOptionalNumber(params.height ?? params.size) ?? natural.height;
  return { ...fields, width, depth, height, size: Math.max(width, depth) };
}

export function mcpShapeCustomization(kind: ShapeKind, params: Record<string, unknown>): ShapeCustomization {
  const entry = normalizeShapeCustomizations({ [kind]: params })[kind] ?? {};
  const { width: _width, depth: _depth, height: _height, maxDimension: _maxDimension, ...settings } = entry;
  // Eine Ausnahme: Die Beschriftung darf laenger sein als eine Vorgabe im
  // Arbeitsbereich, wo 24 Zeichen reichen. Ein Schild im Entwurf traegt mehr,
  // und das Paketformat begrenzt sie nicht.
  if (kind === "text" && typeof params.text === "string" && params.text.trim()) settings.text = params.text;
  return settings;
}

/**
 * Die Verjuengung steht in keiner Formvorgabe - sie gehoert dem einzelnen
 * Koerper, kommt also nicht durch `normalizeShapeCustomizations` und braucht
 * hier ihren eigenen Weg. Ohne ihn liest ein Client die vier Werte aus, setzt
 * sie zurueck und nichts geschieht. Die Grenzen sind dieselben wie im
 * Merkmalsfeld, damit ueber die Bruecke nichts entsteht, was sich dort nicht
 * mehr einstellen laesst.
 */
export function mcpTaperPatch(shape: WorkplaneShape, params: Record<string, unknown>, maxDimension: number): Partial<WorkplaneShape> {
  return shapeTaperPatch(shape, {
    topWidth: mcpOptionalNumber(params.taperTopWidth),
    topDepth: mcpOptionalNumber(params.taperTopDepth),
    bottomWidth: mcpOptionalNumber(params.taperBottomWidth),
    bottomDepth: mcpOptionalNumber(params.taperBottomDepth),
  }, maxDimension);
}

/**
 * Verdrehung und Neigung sind wie die Verjuengung Eigenschaften des einzelnen
 * Koerpers, nicht der Formvorgabe - derselbe eigene Weg wie `mcpTaperPatch`,
 * sonst nimmt die Bruecke die drei Werte zwar in ihr Schema auf, setzt sie
 * aber nie tatsaechlich am Koerper.
 */
export function mcpExtrudeDeformPatch(shape: WorkplaneShape, params: Record<string, unknown>): Partial<WorkplaneShape> {
  return shapeExtrudeDeformPatch(shape, {
    twist: mcpOptionalNumber(params.extrudeTwist),
    offsetX: mcpOptionalNumber(params.extrudeTopOffsetX),
    offsetZ: mcpOptionalNumber(params.extrudeTopOffsetZ),
  });
}

/**
 * Ein Gewinde haengt an seinem Durchmesser: Breite und Tiefe gehoeren ihm, nicht
 * umgekehrt. Alle Gewindewerte gehen deshalb einmal durch `threadSettings` -
 * das ist dieselbe Pruefung wie im Merkmalsfeld - und der Platzbedarf wird neu
 * daraus gerechnet. Ohne diesen Schritt liest `canonicalizeShape` den alten
 * Rahmen als Zug am Anfasser und rechnet einen frisch gesetzten Durchmesser
 * wieder weg. Wer Breite oder Tiefe selbst angibt, meint genau das und behaelt
 * sie.
 */
export function applyMcpThreadSettings(
  shape: WorkplaneShape,
  params: Record<string, unknown>,
  headFollowsStandard: boolean,
): WorkplaneShape {
  const requestedHead = mcpOptionalNumber(params.threadHeadHeight);
  const merged = threadSettings({ ...shape, threadHeadHeight: requestedHead ?? shape.threadHeadHeight });
  // Stand der Kopf auf seinem Normmass, waechst er mit dem Durchmesser mit -
  // sonst saesse nach einem Wechsel von M8 auf M5 der Kopf einer M8 auf einer
  // duenneren Schraube. Wer die Hoehe selbst angibt, behaelt sie.
  const settings = requestedHead === undefined && headFollowsStandard
    ? { ...merged, headHeight: normalizeThreadHeadHeight(defaultThreadHeadHeight(merged), merged) }
    : merged;
  const footprint = threadNaturalFootprint(settings);
  const keepFootprint = params.width !== undefined || params.depth !== undefined || params.size !== undefined;
  return {
    ...shape,
    threadRole: settings.role,
    threadHead: settings.head,
    threadHand: settings.hand,
    threadProfile: settings.profile,
    threadDiameter: settings.diameter,
    threadPitch: settings.pitch,
    threadClearance: settings.clearance,
    threadBoltClearance: settings.boltClearance,
    threadAxialClearance: settings.axialClearance,
    threadDepth: settings.depth,
    threadFlankAngle: settings.flankAngle,
    threadQuality: settings.quality,
    threadHeadHeight: settings.headHeight,
    threadChamfer: settings.chamfer,
    threadChamferBottom: settings.chamferLow,
    threadHeadChamfer: settings.headChamfer,
    ...(keepFootprint ? {} : {
      width: footprint.width,
      depth: footprint.depth,
      size: Math.max(footprint.width, footprint.depth),
    }),
  };
}

export function mcpString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

/** A reference point as an AI sees it: x and z on the plate, elevation as the height. */
export function mcpPointInfo(note: WorkplaneNote) {
  const round = (value: number) => Number(value.toFixed(4));
  return { id: note.id, x: round(note.x), z: round(note.z), elevation: round(note.y) };
}

export function mcpStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  }
  return typeof value === "string" && value.length > 0 ? [value] : [];
}

export function mcpNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number" && Number.isInteger(entry)) : [];
}

export function mcpFiniteNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry)) : [];
}

export function readMcpEditorIdentity() {
  const storageKey = "layerling.mcp.editorIdentity";
  try {
    const existing = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null") as { editorId?: unknown; editorNumber?: unknown } | null;
    if (typeof existing?.editorId === "string" && typeof existing.editorNumber === "number") {
      return { editorId: existing.editorId, editorNumber: existing.editorNumber };
    }
  } catch {
    // Session identity is best-effort; fall through and create a new one.
  }

  const randomValues = new Uint32Array(1);
  window.crypto?.getRandomValues?.(randomValues);
  const editorNumber = 10000 + ((randomValues[0] || Math.floor(Math.random() * 90000)) % 90000);
  const editorId = window.crypto?.randomUUID?.() ?? `layerling-editor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const identity = { editorId, editorNumber };
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(identity));
  } catch {
    // Private browsing can block sessionStorage; the in-memory identity is enough for this tab.
  }
  return identity;
}
