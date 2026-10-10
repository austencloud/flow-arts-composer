<script lang="ts">
  import { BackgroundType } from "@austencloud/backgrounds";
  import { Canvas, T } from "@threlte/core";
  import { AgXToneMapping, PCFSoftShadowMap, WebGLRenderer } from "three";
  import { onDestroy, onMount, untrack } from "svelte";

  import OrbitControls from "#lib/shared/3d/components/OrbitControls.svelte";
  import PerfMonitor from "#lib/shared/3d/components/PerfMonitor.svelte";
  import { setAdaptiveQualityContext } from "#lib/shared/3d/context/adaptive-quality-context.js";
  import { getQualityTierDetector } from "#lib/shared/3d/effects/quality/get-quality-tier-detector.js";
  import { setSceneFeatureContext } from "#lib/shared/3d/scene-features/context/scene-feature-context.js";
  import { createSceneFeatureState } from "#lib/shared/3d/scene-features/state/scene-feature-state.svelte.js";
  import { createAdaptiveQualityState } from "#lib/shared/3d/state/adaptive-quality-state.svelte.js";

  import PreviewEnvironment from "./PreviewEnvironment.svelte";
  import { getShowroomTheme } from "./theme-showroom-data";

  interface Props {
    backgroundType: BackgroundType;
    allowAutomaticOrbit?: boolean;
    onReadyChange?: (ready: boolean) => void;
    onRenderError?: (error: unknown) => void;
  }

  let {
    backgroundType,
    allowAutomaticOrbit = true,
    onReadyChange = () => {},
    onRenderError = () => {},
  }: Props = $props();

  const IDLE_RESUME_DELAY_MS = 3200;
  const RESUME_RAMP_MS = 1800;
  const TARGET_ORBIT_SPEED = 0.55;

  const camera = $derived(getShowroomTheme(backgroundType).camera);
  let automaticOrbit = $state(allowAutomaticOrbit);
  let automaticOrbitSpeed = $state(
    allowAutomaticOrbit ? TARGET_ORBIT_SPEED : 0
  );
  let resumeTimer: ReturnType<typeof setTimeout> | null = null;
  let rampFrame: number | null = null;

  // Preview controls and scene features stay isolated from the main 3D viewer.
  const sceneFeatures = createSceneFeatureState(
    {
      audience: false,
      environment: true,
      stage: true,
      campfire: true,
      tent: true,
    },
    { isolated: true }
  );
  setSceneFeatureContext(sceneFeatures);

  const adaptiveQuality = createAdaptiveQualityState(getQualityTierDetector());
  setAdaptiveQualityContext(adaptiveQuality);

  function cancelResume(): void {
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = null;
    }
    if (rampFrame !== null) {
      cancelAnimationFrame(rampFrame);
      rampFrame = null;
    }
  }

  function stopAutomaticOrbit(): void {
    cancelResume();
    automaticOrbit = false;
    automaticOrbitSpeed = 0;
  }

  function beginAutomaticOrbitRamp(): void {
    if (!allowAutomaticOrbit) return;

    const startedAt = performance.now();
    automaticOrbit = true;
    automaticOrbitSpeed = 0;

    const ramp = (now: number) => {
      const progress = Math.min((now - startedAt) / RESUME_RAMP_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      automaticOrbitSpeed = TARGET_ORBIT_SPEED * eased;
      if (progress < 1) {
        rampFrame = requestAnimationFrame(ramp);
      } else {
        rampFrame = null;
      }
    };

    rampFrame = requestAnimationFrame(ramp);
  }

  function scheduleAutomaticOrbit(): void {
    cancelResume();
    if (!allowAutomaticOrbit) return;
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      beginAutomaticOrbitRamp();
    }, IDLE_RESUME_DELAY_MS);
  }

  function handleSceneLoadError(error: unknown): void {
    stopAutomaticOrbit();
    onRenderError(error);
  }

  function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
    try {
      const renderer = new WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFSoftShadowMap;
      renderer.toneMapping = AgXToneMapping;
      renderer.toneMappingExposure = 1;
      return renderer;
    } catch (error) {
      onRenderError(error);
      throw error;
    }
  }

  $effect(() => {
    backgroundType;
    untrack(() => {
      sceneFeatures.resetReady("environment");
      onReadyChange(false);
    });
  });

  $effect(() => {
    const ready = sceneFeatures.isReady("environment");
    untrack(() => onReadyChange(ready));
  });

  $effect(() => {
    if (!allowAutomaticOrbit) {
      untrack(stopAutomaticOrbit);
    }
  });

  onMount(() => {
    if (allowAutomaticOrbit) {
      automaticOrbit = true;
      automaticOrbitSpeed = TARGET_ORBIT_SPEED;
    }
  });

  onDestroy(cancelResume);
</script>

<div
  class="scene-canvas"
  data-orbit-state={automaticOrbit ? "automatic" : "manual"}
  data-orbit-speed={automaticOrbitSpeed.toFixed(3)}
  aria-hidden="true"
>
  <Canvas
    {createRenderer}
    dpr={adaptiveQuality.pixelRatio}
    shadows={adaptiveQuality.config.enableShadows}
  >
    <PerfMonitor adaptive />

    {#key backgroundType}
      <T.PerspectiveCamera
        makeDefault
        position={camera.position}
        fov={camera.fov}
        near={0.1}
        far={240}
      >
        <OrbitControls
          enableDamping
          smoothTime={0.1}
          draggingSmoothTime={0.06}
          target={camera.target}
          minDistance={camera.minDistance ?? 2.5}
          maxDistance={camera.maxDistance ?? 30}
          maxPolarAngle={Math.PI / 2 + 0.04}
          rotateSpeed={0.55}
          zoomSpeed={1.2}
          enablePan={false}
          autoRotate={automaticOrbit}
          autoRotateSpeed={automaticOrbitSpeed}
          oncontrolstart={stopAutomaticOrbit}
          oncontrolend={scheduleAutomaticOrbit}
        />
      </T.PerspectiveCamera>
    {/key}

    <PreviewEnvironment {backgroundType} onLoadError={handleSceneLoadError} />
  </Canvas>
</div>

<style>
  .scene-canvas {
    position: absolute;
    inset: 0;
  }

  .scene-canvas :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
    cursor: grab;
    touch-action: none;
  }

  .scene-canvas :global(canvas:active) {
    cursor: grabbing;
  }
</style>
