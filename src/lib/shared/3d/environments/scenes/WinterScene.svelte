<script lang="ts">
  import {
    resolveThrelteScene,
    resolveThrelteRenderer,
  } from "../../scene-boot/threlte-handles";
  import { useTask, useThrelte } from "@threlte/core";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { untrack } from "svelte";
  import { prefersReducedMotion } from "../primitives/motion-preference";
  import type { Object3D } from "three";
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
  import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
  import { tryGetAdaptiveQualityContext } from "../../context/adaptive-quality-context";
  import { getSceneFeatureContext } from "../../scene-features/context/scene-feature-context";
  import type { WinterSceneConfig } from "../domain/models/scene-configs";
  import {
    createWinterEnvironmentWorld,
    WINTER_ENVIRONMENT_URL,
    type WinterEnvironmentWorld,
  } from "../worlds/winter/winter-environment-world";
  import { detectWinterQuality } from "./winter/quality/winter-quality";
  import { disposeSceneGraph } from "../utils/dispose-scene";

  interface Props {
    config?: WinterSceneConfig;
    stageRadius?: number;
    stageRadiusGrowth?: number;
    stageZOffset?: number;
    platformVisible?: boolean;
    worldYOffset?: number;
  }
  let {
    config,
    stageRadius = 3,
    stageRadiusGrowth = 0,
    stageZOffset = 0,
    platformVisible = true,
    worldYOffset = 0,
  }: Props = $props();
  const { camera, scene: sceneValue, renderer: rendererValue } = useThrelte();
  const scene = resolveThrelteScene(sceneValue);
  const renderer = resolveThrelteRenderer(rendererValue);
  const quality = tryGetAdaptiveQualityContext();
  const features = getSceneFeatureContext();

  const retry = $derived(features?.getRetryRequest("environment") ?? 0);
  let world = $state.raw<WinterEnvironmentWorld | null>(null);

  $effect(() => {
    void retry;
    const currentConfig = config ? $state.snapshot(config) : undefined;
    const visible = platformVisible;
    const motionScale = untrack(() => (prefersReducedMotion() ? 0 : 1));
    let cancelled = false;
    let mounted: WinterEnvironmentWorld | null = null;
    let asset: Object3D | null = null;
    let restore: (() => void) | null = null;
    features?.reportProgress("environment", 0);
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    void loader
      .loadAsync(WINTER_ENVIRONMENT_URL, (event) => {
        if (!cancelled)
          features?.reportProgress(
            "environment",
            event.total > 0 ? (event.loaded / event.total) * 0.9 : 0.2
          );
      })
      .then((gltf) => {
        if (cancelled) {
          disposeSceneGraph(gltf.scene);
          return;
        }
        asset = gltf.scene;
        const next = createWinterEnvironmentWorld({
          environmentRoot: asset,
          config: currentConfig,
          groundY: untrack(() => userProportionsState.groundY),
          stageRadius: untrack(() => stageRadius),
          stageRadiusGrowth: untrack(() => stageRadiusGrowth),
          stageZOffset: untrack(() => stageZOffset),
          platformVisible: visible,
          deviceTier: untrack(
            () => quality?.contentTier ?? detectWinterQuality(renderer)
          ),
          motionScale,
          outputColorSpace: renderer.outputColorSpace,
        });
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
        features?.reportProgress("environment", 1);
        features?.reportReady("environment");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[WinterScene] Blue Hour Lodge could not load", error);
        features?.reportFailed(
          "environment",
          "Winter couldn't load. Try again or choose another scene."
        );
      });
    return () => {
      cancelled = true;
      if (world === mounted) world = null;
      restore?.();
      mounted?.dispose();
      if (asset) disposeSceneGraph(asset);
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
  $effect(() => world?.setMotionScale(prefersReducedMotion() ? 0 : 1));
  useTask((delta) => {
    if (world && camera.current) world.update(delta, camera.current);
  });
</script>
