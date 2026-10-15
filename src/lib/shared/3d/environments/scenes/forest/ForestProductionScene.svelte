<script lang="ts">
  import {
    resolveThrelteScene,
    resolveThrelteRenderer,
  } from "../../../scene-boot/threlte-handles";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { useDraco, useGltf, useMeshopt, useTexture } from "@threlte/extras";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { onMount, untrack } from "svelte";
  import Stage3D from "../../../components/Stage3D.svelte";
  import { tryGetAdaptiveQualityContext } from "../../../context/adaptive-quality-context";
  import { QualityTier } from "../../../effects/types";
  import { getSceneFeatureContext } from "../../../scene-features/context/scene-feature-context";
  import { createDefaultForestFireflyConfig } from "../../domain/models/scene-configs";
  import {
    prefersReducedMotion,
    resolveMotionScale,
  } from "../../primitives/motion-preference";
  import {
    createForestEnvironmentWorld,
    FOREST_ENVIRONMENT_ASSET_URLS,
    type ForestEnvironmentWorld,
  } from "../../worlds/forest/forest-environment-world";

  interface Props {
    stageWidth?: number;
    stageDepth?: number;
    stageZOffset?: number;
    showStage?: boolean;
    clearingRadius?: number;
    active?: boolean;
  }

  let {
    stageWidth = 6,
    stageDepth = 4.5,
    stageZOffset = 0,
    showStage = true,
    clearingRadius,
    active = true,
  }: Props = $props();

  const { camera, renderer: rendererValue, scene: sceneValue } = useThrelte();
  const scene = resolveThrelteScene(sceneValue);
  const renderer = resolveThrelteRenderer(rendererValue);
  const adaptiveQuality = tryGetAdaptiveQualityContext();
  let sceneFeatures: ReturnType<typeof getSceneFeatureContext> | null = null;
  try {
    sceneFeatures = getSceneFeatureContext();
  } catch {
    // Standalone Forest consumers render the complete production world.
  }

  const environment = useGltf(FOREST_ENVIRONMENT_ASSET_URLS.environment, {
    dracoLoader: useDraco("/draco/"),
    meshoptDecoder: useMeshopt(),
  });
  const nearFrame = useGltf(FOREST_ENVIRONMENT_ASSET_URLS.nearFrame, {
    dracoLoader: useDraco("/draco/"),
    meshoptDecoder: useMeshopt(),
  });
  const campsite = useGltf(FOREST_ENVIRONMENT_ASSET_URLS.campsite, {
    meshoptDecoder: useMeshopt(),
  });
  const stage = useGltf(FOREST_ENVIRONMENT_ASSET_URLS.stage, {
    meshoptDecoder: useMeshopt(),
  });
  const moonTexture = useTexture(FOREST_ENVIRONMENT_ASSET_URLS.moon);
  const campsiteError = campsite.error;
  const stageError = stage.error;
  const config = createDefaultForestFireflyConfig();
  let world: ForestEnvironmentWorld | null = null;
  let campsiteFailureReported = false;
  let stageFailureReported = false;

  const showNearFrame = $derived(clearingRadius === undefined);
  const showCampfire = $derived(
    config.campfire?.enabled && (sceneFeatures?.isEnabled("campfire") ?? true)
  );
  const showTents = $derived(sceneFeatures?.isEnabled("tent") ?? true);
  const groundY = $derived(userProportionsState.groundY);

  $effect(() => {
    const environmentRoot = $environment?.scene;
    const nearFrameRoot = $nearFrame?.scene;
    const campsiteRoot = $campsite?.scene;
    const stageRoot = $stage?.scene;
    const failedCampsite = $campsiteError;
    const failedStage = $stageError;
    if (!environmentRoot) return;
    if (showNearFrame && !nearFrameRoot) return;
    if (showNearFrame && !campsiteRoot && !failedCampsite) return;
    if (showStage && !stageRoot && !failedStage) return;

    if (failedCampsite && !campsiteFailureReported) {
      campsiteFailureReported = true;
      console.warn(
        "[ForestScene] Forest campsite failed to load",
        failedCampsite
      );
    }
    if (failedStage && !stageFailureReported) {
      stageFailureReported = true;
      console.warn(
        "[ForestScene] Forest stage failed to load; using canonical stage",
        failedStage
      );
    }

    const next = createForestEnvironmentWorld({
      assets: {
        environmentRoot,
        nearFrameRoot,
        campsiteRoot: failedCampsite ? null : campsiteRoot,
        stageRoot: failedStage ? null : stageRoot,
        moonTexture: untrack(() => $moonTexture ?? null),
      },
      renderer,
      config,
      groundY: untrack(() => groundY),
      stageWidth,
      stageDepth,
      stageZOffset,
      showStage: showStage && !failedStage,
      clearingRadius,
      showTents,
      showCampfire,
      shadowsEnabled: adaptiveQuality?.config.enableShadows ?? true,
      qualityTier: adaptiveQuality?.tier ?? QualityTier.MEDIUM,
      motionScale: resolveMotionScale(prefersReducedMotion()),
    });
    scene.add(next.root);
    world = next;
    return () => {
      if (world === next) world = null;
      scene.remove(next.root);
      next.dispose();
    };
  });

  $effect(() => {
    world?.setGroundY(groundY);
  });

  $effect(() => {
    world?.setMoonTexture($moonTexture ?? null);
  });

  $effect(() => {
    const activeWorld = world;
    if (!active || !activeWorld) return;
    const previousFog = scene.fog;
    scene.fog = activeWorld.fog;
    return () => {
      if (scene.fog === activeWorld.fog) scene.fog = previousFog;
    };
  });

  $effect(() => {
    if (!active || !sceneFeatures) return;
    const required = [
      $environment,
      ...(showNearFrame ? [$nearFrame] : []),
      ...(showNearFrame ? [$campsite || $campsiteError] : []),
      ...(showStage ? [$stage || $stageError] : []),
    ];
    const loaded = required.filter(Boolean).length;
    sceneFeatures.reportProgress("environment", loaded / required.length);
    if (loaded === required.length && world) {
      sceneFeatures.reportReady("environment");
    }
  });

  useTask((delta) => {
    const activeCamera = camera.current;
    if (world && activeCamera) world.update(delta, activeCamera);
  });

  onMount(() => {
    const timer = setTimeout(() => {
      if (sceneFeatures && !sceneFeatures.isReady("environment")) {
        console.warn("[ForestScene] GLB loading timed out - lifting curtain");
        sceneFeatures.reportReady("environment");
      }
    }, 15_000);
    return () => clearTimeout(timer);
  });
</script>

{#if showStage && $stageError}
  <T.Group position.z={stageZOffset}>
    <Stage3D width={stageWidth} depth={stageDepth} />
  </T.Group>
{/if}
