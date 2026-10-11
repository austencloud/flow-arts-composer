<script lang="ts">
  /**
   * /test/autumn-scene
   *
   * Live verification harness for the Enchanted Autumn Dusk scene rebuild
   * (the "Ocean way"). Mounts the real 3D environment switcher
   * (Environment3D → AutumnScene) inside a Threlte <Canvas> with the same
   * renderer config + scene-feature context the real viewer uses, plus the
   * shared fixed-shot and first-person review camera.
   *
   * This keeps working as AutumnScene evolves in later tasks: it routes through
   * Environment3D rather than importing AutumnScene directly, and tolerates the
   * scene still carrying legacy content. Disposable dev-only route.
   */
  import { Canvas } from "@threlte/core";
  import { page } from "$app/state";
  import { onDestroy } from "svelte";
  import { WebGLRenderer } from "three";
  import { BackgroundType } from "@austencloud/backgrounds";

  import Environment3D from "#lib/shared/3d/environments/components/Environment3D.svelte";
  import EnvironmentReviewCamera from "#lib/shared/3d/environments/review/EnvironmentReviewCamera.svelte";
  import EnvironmentReviewViewSource from "#lib/shared/3d/environments/review/EnvironmentReviewViewSource.svelte";
  import {
    environmentReviewPresetFromPose,
    type EnvironmentReviewReading,
  } from "#lib/shared/3d/environments/review/environment-review-view-source.js";
  import { createSceneFeatureState } from "#lib/shared/3d/scene-features/state/scene-feature-state.svelte.js";
  import { setSceneFeatureContext } from "#lib/shared/3d/scene-features/context/scene-feature-context.js";
  import { createEnvironmentTransitionVisualState } from "#lib/shared/3d/environments/state/environment-transition-visual-state.svelte.js";
  import { setEnvironmentTransitionVisualContext } from "#lib/shared/3d/environments/context/environment-transition-visual-context.js";
  import ScenePostProcessing from "#lib/shared/3d/effects/post-processing/ScenePostProcessing.svelte";
  import PerfMonitor from "#lib/shared/3d/components/PerfMonitor.svelte";
  import SceneShaderWarmup from "#lib/shared/3d/components/SceneShaderWarmup.svelte";
  import InteractiveCanvasFrameBridge from "#lib/shared/3d/components/InteractiveCanvasFrameBridge.svelte";
  import type { RendererPerformanceSample } from "#lib/shared/3d/components/renderer-performance-window.js";
  import { readCameraUrlPose } from "#lib/shared/3d/domain/camera-url-pose.js";
  import AutumnProductionHarness from "./AutumnProductionHarness.svelte";
  import { autumnQualityOverride } from "#lib/shared/3d/environments/scenes/autumn/quality/autumn-quality-override.svelte.js";
  import type { AutumnQualityTier } from "#lib/shared/3d/environments/scenes/autumn/quality/autumn-quality.js";
  import {
    captureCurrentView,
    parseViewParam,
  } from "#lib/shared/review/view-capture.js";

  // The Autumn scene calls getSceneFeatureContext() (for reportReady +
  // stage gating). Provide the same state factory the real Viewer3DCanvas
  // uses so the context resolves and the scene doesn't throw.
  const sceneFeatureState = createSceneFeatureState();
  setSceneFeatureContext(sceneFeatureState);

  // Environment3D now coordinates readiness with the full viewer's transition
  // veil. The harness has no veil, so provide an always-ready visual host.
  const transitionVisual = createEnvironmentTransitionVisualState();
  transitionVisual.setRendererReady(true);
  setEnvironmentTransitionVisualContext(transitionVisual);

  const VIEW_PRESETS = {
    hero: {
      position: [0, 14, 32],
      target: [0, 1, 3],
      fov: 48,
    },
    walk: {
      position: [0, 2.1, 9],
      target: [0, 1.3, 0],
      fov: 58,
    },
    world: {
      position: [0, 48, 36],
      target: [0, 2, 0],
      fov: 52,
    },
    overlook: {
      position: [-51.21, 43.81, 25.07],
      target: [1.27, 8.56, -4.99],
      fov: 48,
    },
    reverse: {
      position: [0, 9, -30],
      target: [0, 2, 2],
      fov: 48,
    },
    depth: {
      position: [0, 9, 29],
      target: [0, 2, -42],
      fov: 46,
    },
    settlement: {
      position: [1, 7, 16],
      target: [-5, 1, -32],
      fov: 48,
    },
    shack: {
      position: [-8.6, 3.8, -43],
      target: [-11.05, 1.92, -53.92],
      fov: 46,
    },
    pond: {
      position: [-4.8, 3.2, 13.5],
      target: [-10.5, -1.25, 7],
      fov: 45,
    },
    fungi: {
      position: [4, 0.35, -7.8],
      target: [4, -1.2, -12],
      fov: 46,
    },
    ferns: {
      position: [-11.8, 0.4, -0.2],
      target: [-15.6, -1.05, -3.5],
      fov: 44,
    },
    rootContact: {
      position: [-3, 1.2, 7.5],
      target: [-12.8, -0.9, -6.5],
      fov: 52,
    },
    owlRootContact: {
      position: [0, 1.2, -2],
      target: [6.2, -0.9, -18.3],
      fov: 52,
    },
    owl: {
      position: [1.8, 6.2, -10.3],
      target: [5.7, 5.25, -17.7],
      fov: 38,
    },
  } as const;

  type ViewName = keyof typeof VIEW_PRESETS;
  const requestedView = $derived(page.url.searchParams.get("view"));
  const replayPose = $derived(parseViewParam(page.url.search));
  const cameraUrlPose = $derived(
    readCameraUrlPose(page.url.searchParams, VIEW_PRESETS.walk.fov)
  );
  const view = $derived(
    requestedView && requestedView in VIEW_PRESETS
      ? (requestedView as ViewName)
      : replayPose
        ? "walk"
        : "hero"
  );
  const cameraPreset = $derived(
    replayPose
      ? environmentReviewPresetFromPose(replayPose, VIEW_PRESETS.walk.fov)
      : cameraUrlPose
        ? {
            position: [
              cameraUrlPose.position.x,
              cameraUrlPose.position.y,
              cameraUrlPose.position.z,
            ] as [number, number, number],
            target: [
              cameraUrlPose.target.x,
              cameraUrlPose.target.y,
              cameraUrlPose.target.z,
            ] as [number, number, number],
            fov: cameraUrlPose.fov,
          }
        : VIEW_PRESETS[view]
  );
  const cameraKey = $derived(JSON.stringify(cameraPreset));
  const showPerf = $derived(page.url.searchParams.get("perf") === "1");
  const productionGraph = $derived(
    page.url.searchParams.get("graph") === "production"
  );
  const renderDpr = $derived.by(() => {
    const requested = Number(page.url.searchParams.get("dpr") ?? "1");
    return Number.isFinite(requested)
      ? Math.min(3, Math.max(0.5, requested))
      : 1;
  });
  const requestedQuality = $derived.by<AutumnQualityTier | "auto">(() => {
    const requested = page.url.searchParams.get("quality");
    return requested === "low" || requested === "medium" || requested === "high"
      ? requested
      : "auto";
  });
  let reading = $state<EnvironmentReviewReading | null>(null);
  let renderSample = $state<RendererPerformanceSample | null>(null);
  let productionReady = $state(false);
  let captureNote = $state<string | null>(null);
  let captureNoteTimer: ReturnType<typeof setTimeout> | null = null;
  const reviewReady = $derived(
    productionGraph
      ? productionReady
      : sceneFeatureState.allEnabledReady &&
          sceneFeatureState.warmupProgress >= 1 &&
          reading !== null
  );

  function recordRenderSample(sample: RendererPerformanceSample): void {
    renderSample = sample;
    (
      globalThis as typeof globalThis & {
        __autumnPerformance?: RendererPerformanceSample;
      }
    ).__autumnPerformance = sample;
  }

  const formatPoint = (value: { x: number; y: number; z: number }) =>
    `${value.x.toFixed(2)}, ${value.y.toFixed(2)}, ${value.z.toFixed(2)}`;

  const targetLabel = $derived.by(() => {
    const target = reading?.target;
    if (!target) return "No centre hit";
    const family = target.materials?.join(" + ") ?? target.object;
    return target.instance === undefined
      ? family
      : `${family} · instance ${target.instance}`;
  });

  async function copyCurrentView() {
    const capture = await captureCurrentView();
    if (captureNoteTimer) clearTimeout(captureNoteTimer);
    captureNote =
      capture.delivery === "console"
        ? "View recorded in console; clipboard unavailable"
        : "frameError" in capture && capture.frameError
          ? `Coordinates copied; frame failed: ${capture.frameError}`
          : "Exact view copied";
    captureNoteTimer = setTimeout(() => (captureNote = null), 4000);
  }

  $effect(() => {
    autumnQualityOverride.tier = requestedQuality;
    return () => {
      autumnQualityOverride.tier = "auto";
    };
  });

  onDestroy(() => {
    if (captureNoteTimer) clearTimeout(captureNoteTimer);
    delete (
      globalThis as typeof globalThis & {
        __autumnPerformance?: RendererPerformanceSample;
      }
    ).__autumnPerformance;
  });
</script>

<svelte:head>
  <title>Autumn Scene — verification harness</title>
</svelte:head>

<div class="page" data-autumn-ready={reviewReady ? "true" : "false"}>
  {#if productionGraph}
    {#key cameraKey}
      <AutumnProductionHarness
        onSample={recordRenderSample}
        onReadyChange={(ready) => (productionReady = ready)}
        {cameraPreset}
      />
    {/key}
  {:else}
    <Canvas
      dpr={renderDpr}
      shadows
      createRenderer={(canvas) =>
        new WebGLRenderer({ canvas, preserveDrawingBuffer: false })}
    >
      <InteractiveCanvasFrameBridge />
      <SceneShaderWarmup waitForAllFeatures={true} cacheKey="autumn-review" />
      <ScenePostProcessing
        backgroundType={BackgroundType.AUTUMN}
        forceBloom={requestedQuality !== "low"}
        bloomResolutionScale={requestedQuality === "high" ? 1 : 0.5}
        bloomLevels={requestedQuality === "high" ? 8 : 5}
        enableChromaticAberration={false}
      />
      <PerfMonitor
        visible={showPerf}
        active={showPerf}
        warmupMs={5_000}
        onSample={recordRenderSample}
      />

      {#key cameraKey}
        <EnvironmentReviewCamera
          destinationId="autumn-scene-review"
          preset={cameraPreset}
          walk={view === "walk" || Boolean(replayPose)}
          terrainSafeOrbit
        />
      {/key}

      <EnvironmentReviewViewSource
        sceneId="autumn-scene"
        state={() => ({
          shot: view,
          quality: requestedQuality,
          dpr: renderDpr,
        })}
        onReading={(nextReading) => (reading = nextReading)}
      />

      <!-- Real environment switcher. AUTUMN routes to AutumnScene, which
         supplies its own sky, ground, fog, trees, leaves and lighting. -->
      <Environment3D
        backgroundType={BackgroundType.AUTUMN}
        performerCount={1}
        stageWidth={6}
        stageDepth={6}
        stageZOffset={0}
      />
    </Canvas>

    <aside class="view-inspector" aria-label="Autumn review coordinates">
      <button type="button" onclick={copyCurrentView}>
        <span>Copy exact view</span>
        <kbd>U</kbd>
      </button>
      {#if reading}
        <dl>
          <div>
            <dt>Camera</dt>
            <dd>{formatPoint(reading.camera)}</dd>
          </div>
          <div class="target-reading">
            <dt>Centre target</dt>
            <dd>{targetLabel}</dd>
          </div>
          {#if reading.target}
            <div>
              <dt>Target origin</dt>
              <dd>{formatPoint(reading.target.origin)}</dd>
            </div>
            <div>
              <dt>Surface hit</dt>
              <dd>{formatPoint(reading.target.point)}</dd>
            </div>
          {/if}
        </dl>
      {:else}
        <span class="waiting">Reading camera…</span>
      {/if}
      {#if captureNote}
        <span class="capture-note" role="status" aria-live="polite"
          >{captureNote}</span
        >
      {/if}
    </aside>
  {/if}

  {#if showPerf && renderSample}
    <aside class="perf-readout" aria-label="Autumn renderer performance">
      <span>{renderSample.fps} FPS</span>
      <span>P95 {renderSample.frameP95Ms.toFixed(1)}ms</span>
      <span>P99 {renderSample.frameP99Ms.toFixed(1)}ms</span>
      <span
        >GPU95 {renderSample.gpuTimingSupported
          ? `${renderSample.gpuP95Ms.toFixed(1)}ms`
          : "n/a"}</span
      >
      <span>{(renderSample.longFrameRate * 100).toFixed(2)}% long</span>
      <span>{(renderSample.thermalDrift * 100).toFixed(1)}% drift</span>
      <span>{renderSample.drawCalls} draws</span>
      <span>{(renderSample.triangles / 1_000_000).toFixed(3)}M tris</span>
      <span>{renderSample.geometries} geo</span>
      <span>{renderSample.textures} tex</span>
      <span>{renderSample.programs} programs</span>
    </aside>
  {/if}
</div>

<style>
  .page {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    /* Warm dusk gradient backs the transparent canvas while the scene's
       own sky dome paints in. */
    background: linear-gradient(#1a1206 0%, #3a2410 60%, #5a3a1c 100%);
  }

  .view-inspector {
    position: absolute;
    inset-block-end: clamp(0.75rem, 1.5vw, 1.5rem);
    inset-inline-start: clamp(0.75rem, 1.5vw, 1.5rem);
    z-index: 20;
    display: grid;
    gap: 0.65rem;
    inline-size: min(25rem, calc(100vw - 1.5rem));
    padding: 0.75rem;
    border: 1px solid rgba(255, 210, 153, 0.18);
    border-radius: 0.85rem;
    background: rgba(20, 10, 8, 0.78);
    box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, 0.32);
    color: #fff7ed;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    backdrop-filter: blur(0.7rem);
  }

  .perf-readout {
    position: absolute;
    inset-block-start: clamp(0.75rem, 1.5vw, 1.5rem);
    inset-inline-end: clamp(0.75rem, 1.5vw, 1.5rem);
    z-index: 20;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.35rem 0.75rem;
    max-inline-size: min(32rem, calc(100vw - 1.5rem));
    padding: 0.55rem 0.7rem;
    border: 1px solid rgba(255, 210, 153, 0.18);
    border-radius: 0.7rem;
    background: rgba(20, 10, 8, 0.78);
    color: #ffedd5;
    font:
      700 0.72rem/1.35 ui-monospace,
      "SFMono-Regular",
      Consolas,
      monospace;
    backdrop-filter: blur(0.7rem);
  }

  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-block-size: 2.75rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid rgba(251, 146, 60, 0.4);
    border-radius: 0.6rem;
    background: linear-gradient(145deg, #5f2411, #32140c);
    color: #fff7ed;
    font: inherit;
    font-weight: 720;
    cursor: pointer;
  }

  button:hover {
    border-color: rgba(253, 186, 116, 0.8);
    background: linear-gradient(145deg, #7c2d12, #431407);
  }

  button:focus-visible {
    outline: 2px solid #fed7aa;
    outline-offset: 2px;
  }

  kbd {
    min-inline-size: 1.8rem;
    padding: 0.18rem 0.38rem;
    border: 1px solid rgba(255, 237, 213, 0.25);
    border-radius: 0.35rem;
    background: rgba(0, 0, 0, 0.32);
    color: #fed7aa;
    font:
      700 0.76rem ui-monospace,
      "SFMono-Regular",
      Consolas,
      monospace;
    text-align: center;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem 0.8rem;
    margin: 0;
  }

  dl div {
    min-inline-size: 0;
  }

  dt {
    color: #fdba74;
    font-size: 0.68rem;
    font-weight: 720;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  dd {
    margin: 0.16rem 0 0;
    overflow: hidden;
    color: #ffedd5;
    font:
      0.76rem/1.35 ui-monospace,
      "SFMono-Regular",
      Consolas,
      monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .target-reading {
    grid-column: 1 / -1;
  }

  .target-reading dd {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }

  .waiting,
  .capture-note {
    color: #fed7aa;
    font-size: 0.8rem;
  }

  @media (min-width: 1680px) {
    .view-inspector {
      inline-size: 29rem;
      padding: 0.9rem;
    }

    button {
      min-block-size: 3rem;
      font-size: 1rem;
    }

    dt {
      font-size: 0.75rem;
    }

    dd,
    .waiting,
    .capture-note {
      font-size: 0.88rem;
    }
  }

  @media (min-width: 2600px) {
    .view-inspector {
      inline-size: 39rem;
      gap: 0.95rem;
      padding: 1.2rem;
      border-radius: 1.2rem;
    }

    button {
      min-block-size: 4rem;
      padding-inline: 1rem;
      border-radius: 0.9rem;
      font-size: 1.3rem;
    }

    kbd {
      min-inline-size: 2.5rem;
      font-size: 1rem;
    }

    dt {
      font-size: 0.95rem;
    }

    dd,
    .waiting,
    .capture-note {
      font-size: 1.1rem;
    }
  }

  @media (max-width: 42rem), (max-height: 31rem) {
    .view-inspector {
      inline-size: min(17rem, calc(100vw - 1.5rem));
    }

    dl div:nth-child(n + 2) {
      display: none;
    }

    dl {
      grid-template-columns: 1fr;
    }

    .perf-readout {
      justify-content: flex-start;
      font-size: 0.65rem;
    }
  }
</style>
