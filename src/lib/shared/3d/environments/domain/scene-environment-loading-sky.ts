/**
 * Each 3D environment's sky as three colours, so the viewer's loading screen
 * can show the place that is about to appear before any 3D code or asset has
 * arrived. They are the environments' default skies (top, middle, horizon),
 * copied here rather than imported so the loading screen stays out of the
 * scene bundles; scene-environment-loading-sky.test.ts keeps them in step.
 */
import {
  normalizeSceneEnvironmentId,
  VIEWER_3D_ENVIRONMENT_STORAGE_KEY,
  type SceneEnvironmentId,
} from "./scene-environment";

export interface SceneLoadingSky {
  top: string;
  mid: string;
  horizon: string;
}

export const SCENE_ENVIRONMENT_LOADING_SKY: Record<
  SceneEnvironmentId,
  SceneLoadingSky
> = {
  // createDefaultCosmicNightConfig
  cosmic: { top: "#050510", mid: "#0d0d2a", horizon: "#1a1040" },
  // createDefaultWinterConfig
  winter: { top: "#07152c", mid: "#344e68", horizon: "#617487" },
  // ocean-depth-gradient: shallow, mid, deep (the view is under water)
  ocean: { top: "#123c55", mid: "#0a2438", horizon: "#01060b" },
  // createDefaultEmberConfig (blackglass-inferno)
  ember: { top: "#05070e", mid: "#341a15", horizon: "#7d2a10" },
  // createDefaultBlossomConfig
  blossom: { top: "#091421", mid: "#1c344e", horizon: "#354b63" },
  // createDefaultForestFireflyConfig
  forest: { top: "#0c1632", mid: "#1a4a5a", horizon: "#0d2218" },
  // createDefaultAutumnConfig
  autumn: { top: "#120b2b", mid: "#38265a", horizon: "#3b2948" },
  // rainbow-environment-world background (a night sky the bands cross)
  rainbow: { top: "#07111f", mid: "#0c1a2e", horizon: "#15253b" },
  // createDefaultCelestialConfig
  celestial: { top: "#6797cf", mid: "#a9c9e7", horizon: "#f4d6ab" },
  // void-environment-world: black, lit only by its platform grid
  void: { top: "#000000", mid: "#030507", horizon: "#07101a" },
};

/** The environment the viewer will open with: the user's last choice. */
export function rememberedSceneEnvironmentId(): SceneEnvironmentId {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(VIEWER_3D_ENVIRONMENT_STORAGE_KEY);
  } catch {
    stored = null;
  }
  return normalizeSceneEnvironmentId(stored);
}
