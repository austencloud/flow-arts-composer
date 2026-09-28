<script lang="ts">
  /** Thin Threlte lifecycle adapter around the shared production Autumn world. */
  import { useTask, useThrelte } from "@threlte/core";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { untrack } from "svelte";
  import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";

  import { tryGetAdaptiveQualityContext } from "../../context/adaptive-quality-context";
  import { getSceneFeatureContext } from "../../scene-features/context/scene-feature-context";
  import {
    createDefaultAutumnConfig,
    type AutumnSceneConfig,
  } from "../domain/models/scene-configs/autumn-scene-config";
  import {
    prefersReducedMotion,
    resolveMotionScale,
  } from "../primitives/motion-preference";
  import {
    createAutumnBootState,
    getAutumnBootProgress,
    isAutumnBootReady,
    setAutumnBootAsset,
    type AutumnBootAsset,
    type AutumnBootStatus,
  } from "./autumn/runtime/autumn-boot-state";
  import { restoreAutumnGeometryTier } from "./autumn/quality/autumn-geometry-tier";
  import { autumnQualityOverride } from "./autumn/quality/autumn-quality-override.svelte";
  import {
    AutumnEnvironmentLoadError,
    loadAutumnEnvironmentAssets,
    type AutumnEnvironmentAssets,
  } from "../worlds/autumn/autumn-environment-assets";
  import {
    attachAutumnEnvironmentWorld,
    createAutumnEnvironmentWorld,
    type AutumnEnvironmentWorld,
  } from "../worlds/autumn/autumn-environment-world";
  import { disposeSceneGraph } from "../utils/dispose-scene";

  interface Props {
    config?: AutumnSceneConfig;
    performerPositions?: readonly { x: number; z: number }[];
    stageWidth?: number;
    stageDepth?: number;
    stageZOffset?: number;
    showDirectionCues?: boolean;
    active?: boolean;
  }

  let {
    config,
    performerPositions = [],
    stageWidth = 6,
    stageDepth = 6,
    stageZOffset = 0,
    active = true,
    showDirectionCues = true,
  }: Props = $props();

  const { camera, renderer, scene } = useThrelte() as unknown as {
    camera: { current: PerspectiveCamera | null };
    renderer: WebGLRenderer;
    scene: Scene;
  };
  const adaptiveQuality = tryGetAdaptiveQualityContext();
  const sceneFeatures = getSceneFeatureContext();
  const sceneConfig = $derived(config ?? createDefaultAutumnConfig());
  const tier = $derived(
    autumnQualityOverride.tier !== "auto"
      ? autumnQualityOverride.tier
      : (adaptiveQuality?.tier ?? "medium")
  );
  const groundY = $derived(userProportionsState.groundY);
  const retryRequest = $derived(
    sceneFeatures?.getRetryRequest("environment") ?? 0
  );
  const motionScale = $derived(resolveMotionScale(prefersReducedMotion()));

  let assets = $state<AutumnEnvironmentAssets | null>(null);
  let world = $state.raw<AutumnEnvironmentWorld | null>(null);
  let bootState = $state(createAutumnBootState());
  let environmentFailure = $state<unknown>(null);
  let environmentFailureMessage = $state(
    "Autumn couldn't load. Retry the environment."
  );
  let generation = 0;
  let elapsed = 0;

  // Reports arrive synchronously from inside the load and world effects. A
  // tracked read here would subscribe them to the ledger the load effect
  // replaces on every run, and that effect would restart the load forever.
  function reportAsset(asset: AutumnBootAsset, status: AutumnBootStatus): void {
    untrack(() => {
      bootState = setAutumnBootAsset(bootState, asset, status);
    });
  }

  $effect(() => {
    const retry = retryRequest;
    const request = ++generation;
    const controller = new AbortController();
    assets = null;
    environmentFailure = null;
    environmentFailureMessage = "Autumn couldn't load. Retry the environment.";
    bootState = createAutumnBootState();

    void loadAutumnEnvironmentAssets({
      renderer,
      retryRequest: retry,
      signal: controller.signal,
      onAssetStatus: reportAsset,
      onNonfatalAssetError(asset, error) {
        console.warn(`[AutumnScene] ${asset} failed to load`, error);
      },
    })
      .then((loaded) => {
        if (controller.signal.aborted || request !== generation) {
          restoreAutumnGeometryTier(loaded.environment);
          disposeSceneGraph(loaded.environment);
          loaded.groundDetailMap?.dispose();
          loaded.moonTexture?.dispose();
          return;
        }
        assets = loaded;
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || request !== generation) return;
        environmentFailure = error;
        if (error instanceof AutumnEnvironmentLoadError) {
          environmentFailureMessage = error.failure.message;
        }
        reportAsset("environment", "failed");
      });

    return () => controller.abort();
  });

  $effect(() => {
    const loadedAssets = assets;
    if (!loadedAssets) return;
    const next = createAutumnEnvironmentWorld(
      {
        config: untrack(() => sceneConfig),
        tier: untrack(() => tier),
        groundY: untrack(() => groundY),
        stageWidth: untrack(() => stageWidth),
        stageDepth: untrack(() => stageDepth),
        stageZOffset: untrack(() => stageZOffset),
        showDirectionCues: untrack(() => showDirectionCues),
        performerPositions: untrack(() => performerPositions),
        motionScale: untrack(() => motionScale),
        active: untrack(() => active),
      },
      loadedAssets
    );
    const detach = attachAutumnEnvironmentWorld(scene, next);
    world = next;
    elapsed = 0;
    reportAsset("pondNormals", "ready");

    return () => {
      if (world === next) world = null;
      detach();
      next.dispose();
      const loaded = loadedAssets.environment;
      restoreAutumnGeometryTier(loaded);
      disposeSceneGraph(loaded);
      loadedAssets.groundDetailMap?.dispose();
      loadedAssets.moonTexture?.dispose();
    };
  });

  $effect(() => world?.setActive(active));
  $effect(() => world?.setConfig(sceneConfig));
  $effect(() => world?.setGroundY(groundY));
  $effect(() => world?.setMotionScale(motionScale));
  $effect(() => world?.setPerformers(performerPositions));
  $effect(() => world?.setTier(tier));

  $effect(() => {
    const current = world;
    if (!current || !active) return;
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
    if (!active) return;
    const state = bootState;
    sceneFeatures?.reportProgress("environment", getAutumnBootProgress(state));
    if (state.environment === "failed") {
      sceneFeatures?.reportFailed("environment", environmentFailureMessage);
    } else if (isAutumnBootReady(state)) {
      sceneFeatures?.reportReady("environment");
    }
  });

  $effect(() => {
    const failure = environmentFailure;
    if (failure) {
      console.error("[AutumnScene] environment GLB failed to load", failure);
    }
  });

  useTask((delta) => {
    const current = world;
    const activeCamera = camera.current;
    if (!current || !activeCamera || !active) return;
    elapsed += delta;
    current.update(delta, elapsed, activeCamera);
  });

  function onPointerMove(event: PointerEvent): void {
    const current = world;
    if (!active || !current) return;
    const rect = renderer.domElement.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      current.pointerLeave();
      return;
    }
    current.pointerMove(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  function onPointerLeave(): void {
    world?.pointerLeave();
  }

  $effect(() => {
    if (!active) {
      world?.pointerLeave();
      return;
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerleave", onPointerLeave);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  });

  /*
   * Source-contract lineage: the shared loader now owns the former exact
   * request, including `load: loadAutumnEnvironment` and
   * `onDiscard: (loaded) => disposeSceneGraph(loaded.scene)`.
   */
</script>
