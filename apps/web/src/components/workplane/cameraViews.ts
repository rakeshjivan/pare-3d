import * as THREE from "three";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { ThreeState } from "@/components/workplane/ViewportOverlays";
import { readDesignView, readSavedViews, SAVED_VIEW_KEYS, writeDesignView, writeSavedViews, type DesignView } from "@/lib/designView";
import { t } from "@/lib/i18n";

/**
 * Where the camera of the 3D view looks, as a view that can be kept and brought back: the view a
 * design was left in (#220), the one it had before a sketch opened (#150), and the four views saved
 * under the keys 7, 8, 9 and 0.
 */

/** How far the camera may back off from what it looks at, in mm. */
export const CAMERA_MAX_DISTANCE = 9000;

/**
 * Near and far planes that follow the distance: up close a near plane of
 * 0.1 mm would cut into a 3 mm view, far out a fixed one would leave the
 * depth buffer too coarse and faces would flicker into each other.
 *
 * The flat view draws the same picture wherever the camera stands on its line
 * of sight, but the camera stays where the standard view (F) or the switch
 * left it, often closer than the parts in front of the pivot: tilted towards
 * the front, everything nearer than the camera was cut off. Its depth range
 * reaches behind the camera as far as in front, so nothing in the picture is.
 */
export function fitCameraDepthRange(camera: THREE.Camera, target: THREE.Vector3) {
  if (camera instanceof THREE.OrthographicCamera) {
    const far = camera.position.distanceTo(target) + CAMERA_MAX_DISTANCE;
    if (camera.near === -CAMERA_MAX_DISTANCE && Math.abs(camera.far - far) <= camera.far * 0.05) return;
    camera.near = -CAMERA_MAX_DISTANCE;
    camera.far = far;
    camera.updateProjectionMatrix();
    return;
  }
  if (!(camera instanceof THREE.PerspectiveCamera)) return;
  const distance = camera.position.distanceTo(target);
  const near = Math.min(5, Math.max(0.01, distance / 2000));
  const far = Math.max(6000, distance * 2 + 3000);
  if (Math.abs(camera.near - near) <= camera.near * 0.05 && Math.abs(camera.far - far) <= camera.far * 0.05) return;
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
}

/** Where the camera looked, per design, while the view was taken down for a sketch (#150). */
const rememberedCameraViews = new Map<string, DesignView>();

/** The view is taken down while a sketch is open; it comes back looking where it looked (#150). */
export function rememberCameraView(projectId: string | null | undefined, state: ThreeState) {
  rememberedCameraViews.set(projectId ?? "", cameraViewOf(state));
}

function cameraViewOf(state: ThreeState): DesignView {
  return {
    orthographic: state.camera instanceof THREE.OrthographicCamera,
    position: state.camera.position.toArray() as [number, number, number],
    target: state.controls.target.toArray() as [number, number, number],
    up: state.camera.up.toArray() as [number, number, number],
    zoom: state.camera.zoom,
  };
}

function applyCameraView(state: ThreeState, view: DesignView) {
  state.camera.up.fromArray(view.up);
  state.camera.position.fromArray(view.position);
  state.controls.target.fromArray(view.target);
  state.camera.zoom = view.zoom;
  state.camera.lookAt(state.controls.target);
  state.camera.updateProjectionMatrix();
  fitCameraDepthRange(state.camera, state.controls.target);
  state.controls.update();
  state.needsRender = true;
}

type DesignViewOptions = {
  threeRef: RefObject<ThreeState | null>;
  projectIdRef: RefObject<string | null | undefined>;
  viewCubeRef: RefObject<HTMLDivElement | null>;
  /** Set once the design's own view is on screen, so the projection preference leaves it alone. */
  designViewRestoredRef: RefObject<boolean>;
  orthographicView: boolean;
  setOrthographicView: (orthographic: boolean) => void;
  toggleCameraProjection: (state: ThreeState) => void;
  syncViewCube: (state: ThreeState, cube: HTMLDivElement | null) => void;
  onNotice?: (message: string) => void;
};

/**
 * Keeps the view of the design on screen: it opens the way it was left, and Shift+7, 8, 9 or 0
 * saves the view that the key alone brings back. The viewport's other effects that touch the camera
 * must come before this hook, as they did when its effects stood in the viewport.
 */
export function useDesignViews(options: DesignViewOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const readyRef = useRef(false);

  const showView = useCallback((state: ThreeState, view: DesignView) => {
    const { toggleCameraProjection, syncViewCube, viewCubeRef, setOrthographicView } = optionsRef.current;
    if ((state.camera instanceof THREE.OrthographicCamera) !== view.orthographic) toggleCameraProjection(state);
    applyCameraView(state, view);
    syncViewCube(state, viewCubeRef.current);
    setOrthographicView(state.camera instanceof THREE.OrthographicCamera);
  }, []);

  // Back from the sketch view: the camera looks where it looked before (#150). A design opens the
  // way it was left, too: its view is kept in the browser and in a saved file (#220).
  useEffect(() => {
    const { threeRef, projectIdRef, designViewRestoredRef } = optionsRef.current;
    const state = threeRef.current;
    const key = projectIdRef.current ?? "";
    const view = rememberedCameraViews.get(key) ?? readDesignView(projectIdRef.current);
    rememberedCameraViews.delete(key);
    if (state && view) {
      showView(state, view);
      designViewRestoredRef.current = true;
    }
    // Only now may the camera's own movements be written down: before, the standard view
    // the viewport starts in would overwrite the one the design was left in.
    readyRef.current = true;
    if (!state) return;
    let timer = 0;
    const save = () => {
      window.clearTimeout(timer);
      writeDesignView(projectIdRef.current, cameraViewOf(state));
    };
    const saveSoon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(save, 500);
    };
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") save();
    };
    state.controls.addEventListener("change", saveSoon);
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      state.controls.removeEventListener("change", saveSoon);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", saveWhenHidden);
      window.clearTimeout(timer);
      // The viewport is taken down when the design is left (or a sketch opens): its view stays.
      save();
    };
  }, [showView]);

  // The projection switch moves no control, so it asks for the view to be kept itself.
  useEffect(() => {
    if (!readyRef.current) return;
    const state = optionsRef.current.threeRef.current;
    if (state) writeDesignView(optionsRef.current.projectIdRef.current, cameraViewOf(state));
  }, [options.orthographicView]);

  /** Shift+7, 8, 9 or 0: the view as it is now - turn, pan, zoom and projection - goes into the slot. */
  const saveView = useCallback((slot: number) => {
    const { threeRef, projectIdRef, onNotice } = optionsRef.current;
    const state = threeRef.current;
    if (!state) return false;
    const views = readSavedViews(projectIdRef.current);
    views[slot] = cameraViewOf(state);
    writeSavedViews(projectIdRef.current, views);
    onNotice?.(t("camera.viewSaved", { key: SAVED_VIEW_KEYS[slot] }));
    return true;
  }, []);

  /** 7, 8, 9 or 0: back to the view saved there; an empty slot says how to fill it. */
  const showSavedView = useCallback((slot: number) => {
    const { threeRef, projectIdRef, onNotice } = optionsRef.current;
    const state = threeRef.current;
    if (!state) return false;
    const view = readSavedViews(projectIdRef.current)[slot];
    if (view) showView(state, view);
    else onNotice?.(t("camera.savedViewEmpty", { key: SAVED_VIEW_KEYS[slot] }));
    return Boolean(view);
  }, [showView]);

  return { saveView, showSavedView };
}
