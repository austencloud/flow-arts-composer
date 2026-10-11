import type {
  Collected3DScene,
  StoredPerformerSettings,
} from "../domain/scene-3d-collection-types";
import {
  getScene3DEnvironmentId,
  isGroupSaved,
} from "../domain/scene-3d-collection-types";
import type {
  Viewer3DStateSeed,
  ViewerNavMode,
} from "#lib/shared/3d/state/viewer-3d-state.svelte.js";

/**
 * Build a self-contained construction seed from a saved 3D scene.
 *
 * This is the non-destructive twin of `applyScene3DLook`. Both read the same
 * snapshot through the same packing-list group mask; the difference is where
 * the config lands. A preview remains isolated while an applied scene writes
 * the persistent viewer draft. Neither path touches the application theme.
 *
 * A seed goes straight into `createViewer3DState(seed)` instead. Nothing global
 * is read or written, so N previews can render N different scenes side by side.
 *
 * Fields left `undefined` (their group was not saved) deliberately fall through
 * to the viewer's normal storage defaults — the same behaviour an unsaved group
 * has when applied.
 */
export function buildScene3DSeed(
  scene: Collected3DScene,
  options: { autoOrbit?: boolean; autoOrbitSpeed?: number } = {}
): Viewer3DStateSeed {
  const snap = scene.snapshot;
  const saved = (g: Parameters<typeof isGroupSaved>[1]) =>
    isGroupSaved(snap, g);

  const seed: Viewer3DStateSeed = {
    // A preview is 3D by definition, wherever the user left the real viewer.
    renderMode: "3d",
    autoOrbit: options.autoOrbit ?? false,
    ...(options.autoOrbitSpeed !== undefined
      ? { autoOrbitSpeed: options.autoOrbitSpeed }
      : {}),
  };

  if (saved("performers")) {
    seed.performers = snap.performers.map((p) => ({
      position: p.position,
      facingAngle: p.facingAngle,
      // Stored plane strings are the Plane enum's string values; the viewer
      // reads them back through the same untyped JSON path applyScene3DLook uses.
      customLeftPlane: p.customLeftPlane as never,
      customRightPlane: p.customRightPlane as never,
      name: p.name ?? null,
      ...(p.settings
        ? { settings: filterPerformerSettings(p.settings, saved) }
        : {}),
    }));
    seed.selectedPerformerIndex = snap.selectedPerformerIndex;
    seed.selectedPerformerIndices = snap.selectedPerformerIndices;
    seed.activeFormation = snap.activeFormation as never;
  }
  if (saved("props")) {
    seed.defaultProp = snap.defaultSettings.prop;
  }
  if (saved("effects")) {
    seed.effectToggles = snap.effectToggles;
  }
  if (saved("scene")) {
    seed.oceanVariant = snap.scene.oceanVariant;
    // The whole point of seeding rather than applying: the environment lives
    // inside this viewer instead of repainting the entire page.
    seed.environmentId = getScene3DEnvironmentId(snap);
    seed.sceneFeatures = snap.sceneFeatures;
  }
  if (saved("camera")) {
    seed.camera = snap.camera;
    seed.navMode = snap.navMode as ViewerNavMode;
    seed.activePreset = snap.activePreset;
    seed.activeCameraPreset = snap.activeCameraPreset;
    seed.showGridLabels = snap.showGridLabels;
    seed.visiblePlanes = snap.visiblePlanes;
  }

  return seed;
}

function filterPerformerSettings(
  settings: StoredPerformerSettings,
  saved: (g: "props" | "efforts" | "effects") => boolean
): StoredPerformerSettings {
  return {
    prop: saved("props") ? settings.prop : null,
    staffLengthCm: saved("props") ? settings.staffLengthCm : null,
    effortId: saved("efforts") ? settings.effortId : null,
    effect: saved("effects") ? settings.effect : null,
  };
}
