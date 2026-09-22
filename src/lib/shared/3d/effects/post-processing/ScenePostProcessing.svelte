<script lang="ts">
  import type { Snippet } from "svelte";
  import { onDestroy } from "svelte";
  import { useTask, useThrelte } from "@threlte/core";
  import type { Camera, Scene, WebGLRenderer } from "three";
  import { BackgroundType } from "@austencloud/backgrounds";
  import { tryGetViewer3DContext } from "../../context/viewer-3d-context";
  import { getSceneEnvironmentRendererKey } from "../../environments/domain/scene-environment";
  import { oceanDebugToggles } from "$lib/shared/3d/environments/scenes/ocean/quality/ocean-debug-toggles.svelte";
  import { getQualityTierDetector } from "../quality/get-quality-tier-detector";
  import { tryGetAdaptiveQualityContext } from "../../context/adaptive-quality-context";
  import { QualityTier } from "../types";
  import { tryGetEnvironmentTransitionVisualContext } from "../../environments/context/environment-transition-visual-context";
  import { registerInteractiveCanvasFrameProvider } from "../../rendering/interactive-canvas-frame";
  // The pipeline restores oceanRendererState.shadowMapEnabled before Threlte
  // resumes base rendering, so pausing the composer never drops Autumn shadows.
  import {
    ScenePostProcessingPipeline,
    type ScenePostProcessingPipelineConfig,
  } from "./scene-post-processing-pipeline";

  interface Props {
    children?: Snippet;
    bloomResolutionScale?: number;
    bloomLevels?: number;
    enableBloom?: boolean;
    enableChromaticAberration?: boolean;
    backgroundType?: BackgroundType;
    forceBloom?: boolean;
  }

  let {
    children,
    bloomResolutionScale = 1.0,
    bloomLevels = 8,
    enableBloom = true,
    enableChromaticAberration = true,
    backgroundType,
    forceBloom,
  }: Props = $props();

  const _ctx = useThrelte() as any;
  const renderer: WebGLRenderer = _ctx.renderer;
  const canvas: HTMLCanvasElement = _ctx.canvas;
  const camera: { current: Camera } = _ctx.camera;
  const scene: Scene = _ctx.scene;
  const autoRender: { current: boolean; set: (v: boolean) => void } =
    _ctx.autoRender;
  const renderStage = _ctx.renderStage;
  const autoRenderTask = _ctx.autoRenderTask;
  const viewer3DState = tryGetViewer3DContext();
  const adaptiveQuality = tryGetAdaptiveQualityContext();
  const qualityTierDetector = getQualityTierDetector();
  const transitionVisual = tryGetEnvironmentTransitionVisualContext();

  const isOcean = $derived(
    (viewer3DState
      ? getSceneEnvironmentRendererKey(viewer3DState.environmentId)
      : backgroundType) === BackgroundType.OCEAN
  );

  // Hardware-gated glow: on HIGH/MEDIUM the detected visual tier enables bloom, so
  // the consolidated 3D trail (HDR-emissive ribbon) blooms in ANY scene, not
  // just ocean. On LOW the trail's in-shader halo alone carries the glow and no
  // composer runs. Trails default-on in the viewer, so tier is the right gate.
  const tierConfig = $derived(
    adaptiveQuality?.config ?? qualityTierDetector.currentConfig
  );
  const tierBloom = $derived(forceBloom ?? tierConfig.enableBloom);
  // A device detected LOW at startup keeps the original composer-free budget.
  // Frame pressure may lower DPR, but it never removes authored post-processing
  // or rebuilds the composer around a cheaper visual tier mid-session.
  const allowOceanComposer = $derived(
    isOcean &&
      (adaptiveQuality
        ? adaptiveQuality.contentTier !== QualityTier.LOW
        : qualityTierDetector.currentTier !== QualityTier.LOW)
  );
  const shouldCompose = $derived(
    (allowOceanComposer || tierBloom) && !(viewer3DState?.isExporting ?? false)
  );

  type CurrentScene = Scene & { current?: Scene };
  const currentScene = $derived((scene as CurrentScene).current ?? scene);
  const pipelineConfig = $derived<ScenePostProcessingPipelineConfig>({
    enabled: shouldCompose,
    isOcean,
    tierBloom,
    enableShadows: tierConfig.enableShadows,
    bloomResolutionScale,
    bloomLevels,
    tierBloomResolutionScale: tierConfig.bloomResolutionScale,
    tierBloomLevels: tierConfig.bloomLevels,
    enableBloom,
    enableChromaticAberration,
    forceBloom,
    oceanBloom: oceanDebugToggles.bloom,
    oceanWaterTint: oceanDebugToggles.waterTint,
    oceanWaterTintStrength: oceanDebugToggles.waterTintStrength,
    oceanUnderwaterDistortion: oceanDebugToggles.underwaterDistortion,
  });

  let pipeline = $state.raw<ScenePostProcessingPipeline | null>(null);

  $effect(() => {
    const cam = camera.current;
    const scn = currentScene;
    const config = pipelineConfig;
    if (!cam || !scn) {
      pipeline?.dispose();
      pipeline = null;
      return;
    }

    if (pipeline) pipeline.updateConfig(config, scn, cam);
    else {
      pipeline = new ScenePostProcessingPipeline({
        renderer,
        scene: scn,
        camera: cam,
        config,
      });
    }
  });

  $effect(() => {
    if (!shouldCompose || !pipeline) return;

    const previousAutoRender = autoRender.current;
    autoRender.set(false);
    return () => {
      autoRender.set(previousAutoRender);
    };
  });

  function renderCurrentFrame(delta: number, forceBaseRender = false): void {
    pipeline?.render(delta, {
      forceBaseRender,
      transitionOpacity: transitionVisual?.opacity ?? 0,
      transitionPhase: transitionVisual?.phase ?? "idle",
    });
  }

  const unregisterCanvasFrameProvider = registerInteractiveCanvasFrameProvider(
    canvas,
    () => renderCurrentFrame(0, true)
  );

  const unregisterFrameCapture = transitionVisual?.registerFrameCapture(() =>
    pipeline?.captureTransitionFrame()
  );

  useTask((delta) => renderCurrentFrame(delta), {
    stage: renderStage,
    after: autoRenderTask,
    autoInvalidate: false,
  });

  onDestroy(() => {
    unregisterCanvasFrameProvider();
    unregisterFrameCapture?.();
    pipeline?.dispose();
    pipeline = null;
  });
</script>

{#if children}
  {@render children()}
{/if}
