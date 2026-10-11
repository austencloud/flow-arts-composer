import { BackgroundType } from "@austencloud/backgrounds";
import type { Component } from "svelte";
import { PRIDE_BACKGROUND_TYPE } from "#lib/shared/settings/domain/background-type-migration.js";

export interface PreviewSceneProps {
  variant?: "firefly" | "night";
  performerCount?: number;
  stageWidth: number;
  stageDepth: number;
  stageZOffset?: number;
}

export type PreviewSceneComponent = Component<PreviewSceneProps>;

type SceneModule = { default: PreviewSceneComponent };
type SceneLoader = () => Promise<SceneModule>;

const SCENE_LOADERS = {
  [BackgroundType.FOREST]: () =>
    import("#lib/shared/3d/environments/scenes/ForestScene.svelte") as Promise<SceneModule>,
  [BackgroundType.AUTUMN]: () =>
    import("#lib/shared/3d/environments/scenes/AutumnScene.svelte") as Promise<SceneModule>,
  [BackgroundType.COSMIC]: () =>
    import("#lib/shared/3d/environments/scenes/CosmicScene.svelte") as Promise<SceneModule>,
  [BackgroundType.WINTER]: () =>
    import("#lib/shared/3d/environments/scenes/WinterScene.svelte") as Promise<SceneModule>,
  [BackgroundType.OCEAN]: () =>
    import("#lib/shared/3d/environments/scenes/ocean/OceanScene.svelte") as Promise<SceneModule>,
  [BackgroundType.EMBER]: () =>
    import("#lib/shared/3d/environments/scenes/EmberScene.svelte") as Promise<SceneModule>,
  [BackgroundType.BLOSSOM]: () =>
    import("#lib/shared/3d/environments/scenes/BlossomScene.svelte") as Promise<SceneModule>,
  [PRIDE_BACKGROUND_TYPE]: () =>
    import("#lib/shared/3d/environments/scenes/RainbowScene.svelte") as Promise<SceneModule>,
  [BackgroundType.CELESTIAL]: () =>
    import("#lib/shared/3d/environments/scenes/CelestialScene.svelte") as Promise<SceneModule>,
  [BackgroundType.VOID]: () =>
    import("#lib/shared/3d/environments/scenes/VoidScene.svelte") as Promise<SceneModule>,
} as Record<BackgroundType, SceneLoader>;

export function loadThemeScene(
  backgroundType: BackgroundType
): Promise<SceneModule> {
  return SCENE_LOADERS[backgroundType]();
}

export function preloadThemeScene(backgroundType: BackgroundType): void {
  void loadThemeScene(backgroundType).catch(() => {
    // The mounted preview owns the visible fallback if this scene cannot load.
  });
}
