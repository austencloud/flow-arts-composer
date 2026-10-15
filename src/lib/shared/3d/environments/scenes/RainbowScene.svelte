<script lang="ts">
  import { resolveThrelteScene } from "../../scene-boot/threlte-handles";
  import { useTask, useThrelte } from "@threlte/core";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { getSceneFeatureContext } from "../../scene-features/context/scene-feature-context";
  import { tryGetAdaptiveQualityContext } from "../../context/adaptive-quality-context";
  import type { RainbowSceneConfig } from "../domain/models/scene-configs/rainbow-scene-config";
  import {
    createLoadedRainbowEnvironmentWorld,
    type RainbowEnvironmentWorld,
  } from "../worlds/rainbow/rainbow-environment-world";

  interface Props {
    config?: RainbowSceneConfig;
    stageRadius?: number;
    stageRadiusGrowth?: number;
    worldYOffset?: number;
  }
  let {
    config,
    stageRadius = 3,
    stageRadiusGrowth = 0,
    worldYOffset = 0,
  }: Props = $props();
  const { camera, scene: sceneValue } = useThrelte();
  const scene = resolveThrelteScene(sceneValue);
  const sceneFeatures = getSceneFeatureContext();
  const quality = tryGetAdaptiveQualityContext();
  const reducedMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  let world = $state.raw<RainbowEnvironmentWorld | null>(null);
  const retryRequest = $derived(
    sceneFeatures?.getRetryRequest("environment") ?? 0
  );

  $effect(() => {
    void retryRequest;
    const currentConfig = untrack(() =>
      config ? $state.snapshot(config) : undefined
    );
    let cancelled = false;
    let mounted: RainbowEnvironmentWorld | null = null;
    let restore: (() => void) | null = null;
    sceneFeatures?.reportProgress("environment", 0);
    void createLoadedRainbowEnvironmentWorld({
      config: currentConfig,
      groundY: untrack(() => userProportionsState.groundY),
      reflectionResolution: untrack(() =>
        quality?.contentTier === "low" ? 256 : 512
      ),
      onProgress: (fraction) => {
        if (!cancelled)
          sceneFeatures?.reportProgress("environment", fraction * 0.9);
      },
    })
      .then((next) => {
        if (cancelled) {
          next.dispose();
          return;
        }
        mounted = next;
        const previousFog = scene.fog;
        const previousBackground = scene.background;
        scene.add(next.root);
        scene.fog = next.fog;
        scene.background = next.background;
        restore = () => {
          scene.remove(next.root);
          if (scene.fog === next.fog) scene.fog = previousFog;
          if (scene.background === next.background)
            scene.background = previousBackground;
        };
        world = next;
        sceneFeatures?.reportReady("environment");
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error(
            "[RainbowScene] Spectrum Commons could not load",
            error
          );
          sceneFeatures?.reportFailed(
            "environment",
            "Rainbow couldn't load. Try again or choose another scene."
          );
        }
      });
    return () => {
      cancelled = true;
      if (world === mounted) world = null;
      restore?.();
      mounted?.dispose();
    };
  });
  $effect(() =>
    world?.setLayout(
      userProportionsState.groundY,
      stageRadius,
      stageRadiusGrowth,
      worldYOffset
    )
  );
  $effect(() => world?.setMotionScale(reducedMotion.current ? 0 : 1));
  $effect(() => world?.setConfig(config ? $state.snapshot(config) : undefined));
  useTask((delta) => {
    if (world && camera.current) world.update(delta, 0, camera.current);
  });
</script>
