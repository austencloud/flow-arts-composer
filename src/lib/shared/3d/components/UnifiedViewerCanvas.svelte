<script lang="ts">
  /**
   * UnifiedViewerCanvas
   *
   * Single Threlte Canvas that supports two camera modes:
   * - orthographic-2d: OrthographicCamera for flat 2D grid view (replaces Canvas2D AnimatorCanvas)
   * - perspective-3d: PerspectiveCamera for 3D view (delegates to Viewer3DCamera + Viewer3DScene)
   *
   * Both modes share the same WebGL context, enabling the render-graph GPU effects
   * pipeline to overlay effects on either view without a second canvas.
   */

  import { Canvas } from "@threlte/core";
  import { WebGLRenderer } from "three";

  import Viewer3DCamera from "./Viewer3DCamera.svelte";
  import Viewer3DScene from "./Viewer3DScene.svelte";
  import Viewer3DCanvasRef from "./Viewer3DCanvasRef.svelte";
  import PerfMonitor from "./PerfMonitor.svelte";
  import Viewer2DCamera from "./Viewer2DCamera.svelte";
  import Viewer2DScene from "./Viewer2DScene.svelte";
  import SceneLoadingCurtain from "../scene-features/components/SceneLoadingCurtain.svelte";
  import SceneShaderWarmup from "./SceneShaderWarmup.svelte";
  import RenderGraphBridge from "./RenderGraphBridge.svelte";
  import { getViewer3DContext } from "../context/viewer-3d-context";
  import { createSceneFeatureState } from "../scene-features/state/scene-feature-state.svelte";
  import { setSceneFeatureContext } from "../scene-features/context/scene-feature-context";
  import { createViewerCameraPlayerState } from "@austencloud/camera-3d";
  import EnvironmentTransitionRenderPass from "../environments/components/EnvironmentTransitionRenderPass.svelte";
  import { setEnvironmentTransitionVisualContext } from "../environments/context/environment-transition-visual-context";
  import { createEnvironmentTransitionVisualState } from "../environments/state/environment-transition-visual-state.svelte";

  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";

  export type CameraMode = "orthographic-2d" | "perspective-3d";

  interface Props {
    cameraMode: CameraMode;
    sequenceData: SequenceData | null;
    currentStep: number;
    isPlaying: boolean;
    bpm?: number;
    onBpmChange?: (bpm: number) => void;
    leftPropType?: string | null;
    rightPropType?: string | null;
    /** Current blue prop state for 2D mode positioning */
    leftPropState?: PropState | null;
    /** Current red prop state for 2D mode positioning */
    rightPropState?: PropState | null;
    /** Grid mode for 2D mode rendering */
    gridMode?: string | null;
    hideOverlays?: boolean;
    fullScreen?: boolean;
    onExitFullScreen?: () => void;
    onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  }

  let {
    cameraMode,
    sequenceData,
    currentStep,
    isPlaying,
    bpm = 60,
    onBpmChange = () => {},
    leftPropType = null,
    rightPropType = null,
    leftPropState = null,
    rightPropState = null,
    gridMode = null,
    hideOverlays = false,
    fullScreen = false,
    onExitFullScreen,
    onCanvasReady,
  }: Props = $props();

  const viewer3DState = getViewer3DContext();
  const sceneFeatureState = createSceneFeatureState();
  setSceneFeatureContext(sceneFeatureState);
  const environmentTransitionVisual = createEnvironmentTransitionVisualState();
  setEnvironmentTransitionVisualContext(environmentTransitionVisual);

  const characterState = $derived(
    viewer3DState.performerManager.performers[0] ?? null
  );
  const cameraPlayer = createViewerCameraPlayerState({ spawnY: -1.5 });

  let canvasMountReady = $state(false);

  $effect(() => {
    if (cameraMode === "orthographic-2d") {
      canvasMountReady = true;
    } else {
      if (characterState && sequenceData && !canvasMountReady) {
        requestAnimationFrame(() => {
          canvasMountReady = true;
        });
      }
      if (!characterState || !sequenceData) {
        canvasMountReady = false;
      }
    }
  });

  const is2D = $derived(cameraMode === "orthographic-2d");
</script>

<div class="unified-viewer-canvas" data-mode={cameraMode}>
  {#if is2D || (characterState && sequenceData)}
    {#if canvasMountReady}
      <Canvas
        createRenderer={(canvas) => {
          const renderer = new WebGLRenderer({
            canvas,
            preserveDrawingBuffer: true,
            alpha: true,
          });
          onCanvasReady?.(canvas);
          return renderer;
        }}
      >
        <PerfMonitor visible={viewer3DState.showPerf} />
        {#if is2D}
          <Viewer2DCamera />
          <Viewer2DScene
            {leftPropState}
            {rightPropState}
            {leftPropType}
            {rightPropType}
            {gridMode}
            {currentStep}
          />
        {:else}
          <SceneShaderWarmup
            onReadyChange={(ready) =>
              environmentTransitionVisual.setRendererReady(ready)}
          />
          <EnvironmentTransitionRenderPass />
          <Viewer3DCanvasRef />
          <Viewer3DCamera
            cameraPlayerAvatar={cameraPlayer.avatarState}
            cameraPlayerPhysics={cameraPlayer.physicsProvider}
          />
          {#if characterState}
            <Viewer3DScene
              {sequenceData}
              {currentStep}
              {isPlaying}
              {characterState}
            />
          {/if}
        {/if}
      </Canvas>
    {/if}
    <RenderGraphBridge enabled={canvasMountReady} />
    {#if !is2D}
      <SceneLoadingCurtain />
    {/if}
  {:else}
    <div class="unified-viewer-loading">Loading viewer...</div>
  {/if}
</div>

<style>
  .unified-viewer-canvas {
    width: 100%;
    height: 100%;
    position: relative;
  }

  .unified-viewer-canvas[data-mode="perspective-3d"] {
    background: #1a1a2e;
  }

  .unified-viewer-canvas[data-mode="orthographic-2d"] {
    background: #0a0a0f;
  }

  .unified-viewer-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: rgba(255, 255, 255, 0.4);
    font-size: var(--font-size-min, 14px);
  }
</style>
