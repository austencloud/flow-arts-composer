import type { Viewer3DState } from "#lib/shared/3d/context/viewer-3d-context.js";
import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
import { captureTunnelPoster } from "#lib/shared/sequence-viewer/tunnel/tunnel-poster.js";
import type {
  Scene3DGroupId,
  Scene3DSnapshot,
  StoredPerformerSnapshot,
} from "../domain/scene-3d-collection-types";

const SCENE_FEATURES_STORAGE_KEY = "tka-scene-features";

function readSceneFeatures(): Record<string, boolean> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(SCENE_FEATURES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object")
      return parsed as Record<string, boolean>;
    return {};
  } catch {
    return {};
  }
}

/**
 * Build a reproducible snapshot from the viewer's own serialize() plus the
 * remaining owners outside it: global prop defaults and persisted scene-feature
 * toggles. The 3D environment belongs to the viewer itself.
 */
export interface CaptureScene3DOptions {
  /** Playback tempo, threaded from the playback seam when available. */
  bpm?: number;
  /** Packing-list group mask. Absent = save everything. */
  groups?: Record<Scene3DGroupId, boolean>;
}

export function captureScene3DSnapshot(
  viewer3DState: Viewer3DState,
  options: CaptureScene3DOptions = {}
): Scene3DSnapshot {
  const cfg = viewer3DState.serialize();
  const d = viewer3DState.defaultSettings;
  const settings = settingsService.settings;

  const performers: StoredPerformerSnapshot[] = cfg.performers.map((p) => ({
    position: { x: p.position.x, z: p.position.z },
    facingAngle: p.facingAngle,
    customLeftPlane: String(p.customLeftPlane),
    customRightPlane: String(p.customRightPlane),
    name: p.name ?? null,
    ...(p.settings ? { settings: { ...p.settings } } : {}),
  }));

  return {
    version: 3,
    scene: {
      environmentId: cfg.environmentId,
      oceanVariant: cfg.oceanVariant,
    },
    camera: cfg.camera,
    performers,
    selectedPerformerIndex: cfg.selectedPerformerIndex,
    selectedPerformerIndices: cfg.selectedPerformerIndices,
    activeFormation: String(cfg.activeFormation),
    propSizeLinked: viewer3DState.propSizeLinked,
    defaultSettings: {
      prop: cfg.defaultProp,
      effortId: String(d.effortId),
      planeMode: String(d.planeMode),
      customLeftPlane: String(d.customLeftPlane),
      customRightPlane: String(d.customRightPlane),
    },
    visiblePlanes: cfg.visiblePlanes,
    showGridLabels: cfg.showGridLabels,
    navMode: cfg.navMode,
    activePreset: cfg.activePreset,
    activeCameraPreset: cfg.activeCameraPreset,
    stageGroundOffset: viewer3DState.stageGroundOffset,
    effectToggles: cfg.effectToggles ?? {},
    sceneFeatures: readSceneFeatures(),
    props: {
      leftPropType: settings.leftPropType
        ? String(settings.leftPropType)
        : undefined,
      rightPropType: settings.rightPropType
        ? String(settings.rightPropType)
        : undefined,
    },
    ...(options.bpm !== undefined ? { bpm: options.bpm } : {}),
    ...(options.groups ? { groups: { ...options.groups } } : {}),
  };
}

/** Grab a ~200px WebP poster after the final-frame owner renders on demand. */
export function captureScene3DPoster(viewer3DState: Viewer3DState): string {
  const canvas = viewer3DState.webglCanvas;
  if (!canvas) return "";
  return captureTunnelPoster(canvas);
}
