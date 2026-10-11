
import { Vector3, type Object3D } from "three";
import type CameraControls from "camera-controls";
import type { ObjectDefinition } from "../procedural-engine/objects/object-catalog";
import type {
  ComposerPlacement,
  SceneObjectAdapter,
  SceneObjectHandle,
} from "./types";
import { CommandStack } from "#lib/shared/history/command-stack.svelte.js";

export type ComposerMode = "browse" | "select" | "place";

export interface NativeComposerSelection {
  adapter: SceneObjectAdapter;
  handle: SceneObjectHandle;
  target: Object3D;
}

const CAMERA_KEY = "composer-editor-camera";

interface EditorCamera {
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
}

export function createComposerEditorState() {
  let mode = $state<ComposerMode>("browse");
  let active = $state(false);
  let selectedObject: Object3D | null = $state(null);
  let nativeSelection: NativeComposerSelection | null = $state(null);
  let gizmoMode: "translate" | "rotate" | "scale" = $state("translate");
  let activeCatalogItem: ObjectDefinition | null = $state(null);
  let ghostValid = $state(false);
  let gizmoDragging = $state(false);
  let placements = $state<ComposerPlacement[]>([]);
  let nativeScenePlacements = $state<ComposerPlacement[]>([]);
  let dirty = $state(false);
  let orbitControls: CameraControls | null = null;

  const commands = new CommandStack();

  return {
    commands,

    get active() {
      return active;
    },
    get mode() {
      return mode;
    },
    get selectedObject() {
      return selectedObject;
    },
    get nativeSelection() {
      return nativeSelection;
    },
    get selectedLocked() {
      return nativeSelection?.handle.locked ?? false;
    },
    get gizmoMode() {
      return gizmoMode;
    },
    get activeCatalogItem() {
      return activeCatalogItem;
    },
    get ghostValid() {
      return ghostValid;
    },
    get gizmoDragging() {
      return gizmoDragging;
    },
    get placements() {
      return placements;
    },
    get validationPlacements() {
      const merged = new Map(
        nativeScenePlacements.map((placement) => [placement.id, placement])
      );
      for (const placement of placements) merged.set(placement.id, placement);
      return [...merged.values()];
    },
    get composedObjectCount() {
      const ids = new Set(
        nativeScenePlacements.map((placement) => placement.id)
      );
      for (const placement of placements) ids.add(placement.id);
      return ids.size;
    },
    get dirty() {
      return dirty;
    },

    setActive(v: boolean) {
      active = v;
      if (!v) {
        this.setGizmoDragging(false);
        mode = "browse";
        this.deselect();
        activeCatalogItem = null;
        ghostValid = false;
        gizmoMode = "translate";
      }
    },

    toggle() {
      this.setActive(!active);
    },

    select(obj: Object3D) {
      this.deselect();
      selectedObject = obj;
      mode = "select";
      activeCatalogItem = null;
      if (orbitControls && obj) {
        const pos = new Vector3();
        obj.getWorldPosition(pos);
        orbitControls.setTarget(pos.x, pos.y, pos.z, true);
      }
    },

    selectNative(adapter: SceneObjectAdapter, handle: SceneObjectHandle) {
      this.deselect();
      const target = adapter.createTransformTarget(handle);
      nativeSelection = { adapter, handle, target };
      selectedObject = target;
      mode = "select";
      activeCatalogItem = null;
      if (orbitControls) {
        const pos = new Vector3();
        target.getWorldPosition(pos);
        orbitControls.setTarget(pos.x, pos.y, pos.z, true);
      }
    },

    deselect() {
      if (nativeSelection) {
        nativeSelection.adapter.disposeTransformTarget(
          nativeSelection.handle,
          nativeSelection.target
        );
        nativeSelection = null;
      }
      selectedObject = null;
      mode = active ? "select" : "browse";
    },

    setGizmoMode(m: "translate" | "rotate" | "scale") {
      gizmoMode = m;
    },

    startPlacement(def: ObjectDefinition) {
      activeCatalogItem = def;
      mode = "place";
      selectedObject = null;
      ghostValid = false;
    },

    stopPlacement() {
      activeCatalogItem = null;
      mode = active ? "select" : "browse";
      ghostValid = false;
    },

    setGhostValid(v: boolean) {
      ghostValid = v;
    },

    setGizmoDragging(v: boolean) {
      gizmoDragging = v;
      if (!orbitControls) return;
      if (v) orbitControls.stop();
      orbitControls.enabled = !v;
    },

    setPlacements(p: ComposerPlacement[]) {
      placements = p;
      dirty = false;
      commands.clear();
    },

    setNativeScenePlacements(p: ComposerPlacement[]) {
      nativeScenePlacements = p;
    },

    addPlacement(p: ComposerPlacement) {
      placements.push(p);
      dirty = true;
    },

    removePlacement(id: string) {
      const idx = placements.findIndex((p) => p.id === id);
      if (idx !== -1) {
        placements.splice(idx, 1);
        dirty = true;
      }
    },

    updatePlacement(id: string, update: Partial<ComposerPlacement>) {
      const p = placements.find((p) => p.id === id);
      if (p) {
        Object.assign(p, update);
        dirty = true;
      }
    },

    upsertPlacement(placement: ComposerPlacement) {
      const current = placements.find((item) => item.id === placement.id);
      if (current) Object.assign(current, placement);
      else placements.push(placement);
      dirty = true;
    },

    markClean() {
      dirty = false;
    },

    setOrbitControls(controls: CameraControls | null) {
      orbitControls = controls;
      if (orbitControls) orbitControls.enabled = !gizmoDragging;
    },

    focusOnPoint(x: number, y: number, z: number) {
      orbitControls?.setTarget(x, y, z, true);
    },

    panTarget(dx: number, dy: number, dz: number) {
      if (!orbitControls) return;
      const v = new Vector3();
      orbitControls.getTarget(v);
      orbitControls.setTarget(v.x + dx, v.y + dy, v.z + dz, false);
    },

    loadCamera(): EditorCamera | null {
      try {
        const raw = sessionStorage.getItem(CAMERA_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },

    saveCamera(cam: EditorCamera) {
      try {
        sessionStorage.setItem(CAMERA_KEY, JSON.stringify(cam));
      } catch {
        /* non-critical */
      }
    },
  };
}

export type ComposerEditorState = ReturnType<typeof createComposerEditorState>;
