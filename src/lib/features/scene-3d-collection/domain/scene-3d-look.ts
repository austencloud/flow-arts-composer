import type {
  Collected3DScene,
  StoredPerformerSettings,
} from "./scene-3d-collection-types";
import {
  getScene3DEnvironmentId,
  isGroupSaved,
} from "./scene-3d-collection-types";
import type {
  Viewer3DPersistConfig,
  ViewerNavMode,
} from "#lib/shared/3d/state/viewer-3d-state.svelte.js";

/**
 * Group-filtered mapping from a saved scene's snapshot to the viewer's
 * persist config. Per-performer cascade overrides are split across groups:
 * fields whose group is off are stripped so applying "performers only"
 * doesn't smuggle prop/effort/effect data in.
 */
export function buildScene3DPersistConfig(
  scene: Collected3DScene
): Partial<Viewer3DPersistConfig> {
  const snap = scene.snapshot;
  const saved = (g: Parameters<typeof isGroupSaved>[1]) =>
    isGroupSaved(snap, g);

  const config: Partial<Viewer3DPersistConfig> = {};

  if (saved("performers")) {
    config.performers = snap.performers.map((p) => ({
      position: p.position,
      facingAngle: p.facingAngle,
      // Stored plane strings are the Plane enum's string values; the viewer
      // reads them back through the same untyped JSON path.
      customLeftPlane: p.customLeftPlane as never,
      customRightPlane: p.customRightPlane as never,
      name: p.name ?? null,
      ...(p.settings
        ? { settings: filterPerformerSettings(p.settings, saved) }
        : {}),
    }));
    config.selectedPerformerIndex = snap.selectedPerformerIndex;
    config.selectedPerformerIndices = snap.selectedPerformerIndices;
    config.activeFormation = snap.activeFormation as never;
  }
  if (saved("props")) {
    config.defaultProp = snap.defaultSettings.prop;
  }
  if (saved("effects")) {
    config.effectToggles = snap.effectToggles;
  }
  if (saved("scene")) {
    config.environmentId = getScene3DEnvironmentId(snap);
    config.oceanVariant = snap.scene.oceanVariant;
  }
  if (saved("camera")) {
    config.camera = snap.camera;
    config.navMode = snap.navMode as ViewerNavMode;
    config.activePreset = snap.activePreset;
    config.activeCameraPreset = snap.activeCameraPreset;
    config.showGridLabels = snap.showGridLabels;
    config.visiblePlanes = snap.visiblePlanes;
  }

  return config;
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
