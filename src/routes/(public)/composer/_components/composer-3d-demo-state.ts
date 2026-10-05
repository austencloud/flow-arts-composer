import { Plane } from "@austencloud/scene-3d";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  SceneEnvironmentId,
  type SceneEnvironmentId as SceneEnvironmentIdValue,
} from "$lib/shared/3d/environments/domain/scene-environment";
import { SCENE_FEATURES } from "$lib/shared/3d/scene-features/domain/scene-feature-registry";
import type {
  Viewer3DState,
  Viewer3DStateSeed,
} from "$lib/shared/3d/state/viewer-3d-state.svelte";

const DEMO_SCENE_FEATURES = Object.fromEntries(
  SCENE_FEATURES.map((feature) => [feature.key, feature.defaultEnabled])
);

/**
 * The marketing viewer never inherits an account's last 3D setup. Every
 * persistable field is present, including the easy-to-miss camera, plane,
 * effect, selection, and scene-feature fields.
 */
export const COMPOSER_3D_DEMO_SEED: Viewer3DStateSeed = {
  renderMode: "3d",
  environmentId: SceneEnvironmentId.COSMIC,
  camera: null,
  performers: [
    {
      position: { x: 0, z: 0 },
      facingAngle: 0,
      customLeftPlane: Plane.WALL,
      customRightPlane: Plane.WALL,
      name: null,
      settings: {
        prop: PropType.STAFF,
        effortId: "linear",
        effect: null,
        staffLengthCm: null,
      },
    },
  ],
  selectedPerformerIndex: null,
  activeFormation: "line",
  defaultProp: PropType.STAFF,
  oceanVariant: "abyss",
  navMode: "orbit",
  activePreset: null,
  activeCameraPreset: "main",
  showGridLabels: false,
  visiblePlanes: [],
  effectToggles: {
    fire: false,
    led: false,
    trails: false,
    charcoal: false,
  },
  sceneFeatures: DEMO_SCENE_FEATURES,
};

/**
 * The establishing pose the page's 3D poster was rendered from: twice the solo
 * opening shot's distance back and a little raised, looking down at the stage.
 * The entrance starts the live camera here so the poster dissolves into the
 * same view before the glide in. A portrait window frames its opening shot
 * further back, still short of this pose, so the glide always moves forward.
 * Re-render the poster if this changes.
 */
export const COMPOSER_3D_ENTRANCE_CAMERA = {
  position: { x: 0, y: 1.1, z: 6.2 },
  target: { x: 0, y: 0.15, z: 0 },
} as const;

/**
 * Older viewer fields still initialize from storage even on a seeded viewer.
 * Correct them through the viewer's public API after enter3D. Seeded writers
 * are no-ops, so this changes the demonstration without changing the account.
 */
export function normalizeComposer3DDemoState(
  viewer: Viewer3DState,
  environmentId: SceneEnvironmentIdValue = SceneEnvironmentId.COSMIC
): void {
  viewer.setEnvironmentId(environmentId);
  viewer.selectPerformerScope(null);
  viewer.setNavMode("orbit");
  viewer.setDefaultProp(PropType.STAFF);
  viewer.setActivePreset(null);
  viewer.setActiveCameraPreset("main");
  viewer.hideAllPlanes();
  if (viewer.showGridLabels) viewer.toggleGridLabels();
  viewer.applyFormationFromUI("line");
}
