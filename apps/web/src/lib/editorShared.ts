import { libraryShapeAssets } from "@/lib/shapeCatalog";

/* Names the editor and its toolbars share: the events tools are opened with, the commands that stay awake in the history view, and the toolbar mode. Moved out of LayerlingEditor (build 55). */

/** Opens the design's Parameters window (build 37). */
export const OPEN_PARAMETERS_EVENT = "pare3d:parameters";
// Fork (build 30): the mesh check and Fill a hole, from the command search.
export const MESH_CHECK_EVENT = "pare3d:mesh-check";
export const FILL_HOLE_EVENT = "pare3d:fill-hole";
export const DENTAL_MODEL_EVENT = "pare3d:dental-model";
/** Fork (build 21): which library shapes are on show, so a new shape whose neighbour is missing still appears. */
export const libraryShapeIds: ReadonlySet<string> = new Set(libraryShapeAssets.map((shape) => shape.id));

/** The commands of the search that stay awake in the history view: they change nothing in the design. */
export const HISTORY_VIEW_COMMANDS = new Set(["history", "export", "guide", "shortcuts"]);
export type ToolbarMode = "geometry" | "sketch";
