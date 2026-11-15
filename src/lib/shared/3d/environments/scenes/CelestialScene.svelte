<script lang="ts">
  import { useTask, useThrelte } from "@threlte/core";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { onDestroy, untrack } from "svelte";
  import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";

  import { tryGetAdaptiveQualityContext } from "../../context/adaptive-quality-context";
  import { getSceneFeatureContext } from "../../scene-features/context/scene-feature-context";
  import {
    type CelestialSceneConfig,
    createDefaultCelestialConfig,
  } from "../domain/models/scene-configs";
  import {
    prefersReducedMotion,
    resolveMotionScale,
  } from "../primitives/motion-preference";
  import {
    attachCelestialEnvironmentWorld,
    createLoadedCelestialEnvironmentWorld,
    type CelestialEnvironmentWorld,
  } from "../worlds/celestial/celestial-environment-world";
  import CelestialInteraction from "./celestial/CelestialInteraction.svelte";

  interface Props {
    config?: CelestialSceneConfig;
    stageWidth?: number;
    stageDepth?: number;
    stageRadius?: number;
    stageRadiusGrowth?: number;
    stageZOffset?: number;
    /** World-space lift applied by Environment3D to the declarative scene tree. */
    worldYOffset?: number;
    /** Retained film worlds load while hidden but only the active one owns globals. */
    active?: boolean;
  }

  let {
    config,
    stageWidth = 6,
    stageDepth = 6,
    stageRadius = 3,
    stageRadiusGrowth = 0,
    stageZOffset = 0,
    worldYOffset = 0,
    active = true,
  }: Props = $props();

  const { camera, renderer, scene } = useThrelte() as unknown as {
    camera: { current: PerspectiveCamera | null };
    renderer: WebGLRenderer;
    scene: Scene;
  };
  const adaptiveQuality = tryGetAdaptiveQualityContext();
  let sceneFeatures: ReturnType<typeof getSceneFeatureContext> | null = null;
  try {
    sceneFeatures = getSceneFeatureContext();
  } catch {
    // Asset-catalog and scene-review routes can render without this context.
  }

  let world = $state.raw<CelestialEnvironmentWorld | null>(null);
  // The world on screen and how to take it off. Kept outside reactive state:
  // it is swapped only once its replacement has loaded, so a reload never
  // shows the bare build-in haze in between.
  let shown: { world: CelestialEnvironmentWorld; detach: () => void } | null =
    null;
  let elapsed = 0;
  let generation = 0;

  function releaseShown(): void {
    shown?.detach();
    shown?.world.dispose();
    shown = null;
  }

  // Only the authored config and the world's vertical frame rebuild the place.
  // Everything else is sampled once per load: the adaptive content tier steps
  // down under frame pressure and back up a minute later, and the stage grows
  // with the crew. Tracking those reloaded the 5 MB citadel each time, and the
  // scene showed the loading haze (a flat horizon-coloured fog) until it came
  // back. Ground height and stage bounds have live setters below.
  $effect(() => {
    const request = ++generation;
    const worldConfig = config ?? createDefaultCelestialConfig();
    const sampled = untrack(() => ({
      groundY: userProportionsState.groundY,
      qualityTier: adaptiveQuality?.contentTier,
      stageWidth,
      stageDepth,
      stageRadius,
      stageRadiusGrowth,
    }));
    const contentTier =
      sampled.qualityTier === "low" || sampled.qualityTier === "high"
        ? sampled.qualityTier
        : "standard";
    const motionScale = resolveMotionScale(prefersReducedMotion());
    let cancelled = false;

    sceneFeatures?.reportProgress("environment", 0);
    void createLoadedCelestialEnvironmentWorld({
      renderer,
      config: worldConfig,
      groundY: sampled.groundY,
      stageWidth: sampled.stageWidth,
      stageDepth: sampled.stageDepth,
      stageRadius: sampled.stageRadius,
      stageRadiusGrowth: sampled.stageRadiusGrowth,
      worldYOffset,
      contentTier,
      motionScale,
      onProgress(fraction) {
        if (!cancelled && request === generation) {
          sceneFeatures?.reportProgress("environment", fraction);
        }
      },
    })
      .then((next) => {
        if (cancelled || request !== generation) {
          next.dispose();
          return;
        }
        next.setActive(untrack(() => active));
        const detach = attachCelestialEnvironmentWorld(scene, next);
        const previous = shown;
        shown = { world: next, detach };
        world = next;
        elapsed = 0;
        if (previous) {
          previous.detach();
          previous.world.dispose();
        }
        sceneFeatures?.reportProgress("environment", 1);
        sceneFeatures?.reportReady("environment");
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error(
            "[CelestialScene] failed to load Olive Cloudbreak",
            error
          );
        }
      });

    return () => {
      cancelled = true;
    };
  });

  onDestroy(() => {
    generation += 1;
    world = null;
    releaseShown();
  });

  $effect(() => {
    const groundY = userProportionsState.groundY;
    world?.setGroundY(groundY);
  });

  $effect(() => {
    world?.setStageBounds(stageRadius, stageRadiusGrowth);
  });

  $effect(() => {
    const current = world;
    if (!current) return;
    current.setActive(active);
    if (!active) return;

    const previousFog = scene.fog;
    const previousBackground = scene.background;
    scene.fog = current.fog;
    scene.background = current.background;
    return () => {
      if (scene.fog === current.fog) scene.fog = previousFog;
      if (scene.background === current.background) {
        scene.background = previousBackground;
      }
    };
  });

  $effect(() => {
    if (!active || world) return;
    const timer = setTimeout(() => {
      if (sceneFeatures && !sceneFeatures.isReady("environment")) {
        console.warn("[CelestialScene] loading timed out - lifting curtain");
        sceneFeatures.reportReady("environment");
      }
    }, 15_000);
    return () => clearTimeout(timer);
  });

  useTask((delta) => {
    const current = world;
    const activeCamera = camera.current;
    if (!current || !activeCamera || !active) return;
    elapsed += delta;
    current.update(delta, elapsed, activeCamera);
  });

  function handleInteraction(): void {
    world?.pulse();
  }

  // `stageZOffset` remains accepted for saved-scene compatibility. Revision 6
  // deliberately fixes Cloudbreak to its authored coordinate frame.
  void stageZOffset;
</script>

<CelestialInteraction onActivate={handleInteraction} />
