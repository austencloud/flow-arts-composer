<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { BackgroundType } from "@austencloud/backgrounds";
  import { Plane } from "@austencloud/scene-3d";
  import Viewer3DCanvas from "#lib/shared/3d/components/Viewer3DCanvas.svelte";
  import type { RendererPerformanceSample } from "#lib/shared/3d/components/renderer-performance-window.js";
  import {
    createViewer3DState,
    type StoredPerformerSnapshot,
  } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
  import { setViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import { createScene3DRenderState } from "#lib/shared/3d/scene-features/state/scene-3d-render-state.svelte.js";
  import { setScene3DRenderContext } from "#lib/shared/3d/scene-features/state/scene-3d-render-context.js";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import demoSequenceJson from "#lib/shared/landing/data/demo-sequence.json";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { EnvironmentReviewCameraPreset } from "#lib/shared/3d/environments/review/environment-review-camera.js";

  interface Props {
    onSample?: (sample: RendererPerformanceSample) => void;
    onReadyChange?: (ready: boolean) => void;
    cameraPreset: EnvironmentReviewCameraPreset;
  }

  let { onSample, onReadyChange, cameraPreset }: Props = $props();

  const REVIEW_PERFORMERS: StoredPerformerSnapshot[] = [
    {
      position: { x: -2.4, z: 0 },
      facingAngle: 0,
      customLeftPlane: Plane.WALL,
      customRightPlane: Plane.WALL,
      settings: {
        prop: "staff",
        effortId: "glide",
        effect: "trails",
        staffLengthCm: 150,
      },
    },
    {
      position: { x: 0, z: 0 },
      facingAngle: 0,
      customLeftPlane: Plane.WALL,
      customRightPlane: Plane.WALL,
      settings: {
        prop: "staff",
        effortId: "punch",
        effect: "fire",
        staffLengthCm: 150,
      },
    },
    {
      position: { x: 2.4, z: 0 },
      facingAngle: 0,
      customLeftPlane: Plane.WALL,
      customRightPlane: Plane.WALL,
      settings: {
        prop: "staff",
        effortId: "elastic",
        effect: "led",
        staffLengthCm: 150,
      },
    },
  ];

  const [cameraX, cameraY, cameraZ] = cameraPreset.position;
  const [targetX, targetY, targetZ] = cameraPreset.target;

  const viewer = createViewer3DState({
    renderMode: "3d",
    environmentId: BackgroundType.AUTUMN,
    performers: REVIEW_PERFORMERS,
    camera: {
      position: { x: cameraX, y: cameraY, z: cameraZ },
      rotation: { x: 0, y: 0, z: 0 },
      fov: cameraPreset.fov,
      target: { x: targetX, y: targetY, z: targetZ },
      timestamp: 0,
    },
  });
  setViewer3DContext(viewer);
  setEffectsConfigContext(
    createEffectsConfigState(undefined, { persist: false })
  );
  setScene3DRenderContext(createScene3DRenderState());

  const sequence = demoSequenceJson as unknown as SequenceData;
  viewer.enter3D(sequence);
  let currentStep = $state(0);
  let animationFrame = 0;
  const bpm = 60;
  const harnessControl = {
    async setEnvironment(environmentId: string): Promise<void> {
      viewer.setEnvironmentId(environmentId);
      await settingsService.updateSetting(
        "backgroundType",
        environmentId as BackgroundType
      );
    },
    getEnvironment(): string {
      return viewer.environmentId;
    },
  };

  onMount(() => {
    (
      globalThis as typeof globalThis & {
        __autumnProductionHarness?: typeof harnessControl;
      }
    ).__autumnProductionHarness = harnessControl;
    void harnessControl.setEnvironment(BackgroundType.AUTUMN);
    let previousTime = performance.now();
    const advance = (time: number): void => {
      const elapsedSeconds = Math.min((time - previousTime) / 1_000, 0.1);
      previousTime = time;
      currentStep =
        (currentStep + elapsedSeconds * (bpm / 60)) % sequence.steps.length;
      animationFrame = requestAnimationFrame(advance);
    };
    animationFrame = requestAnimationFrame(advance);
  });

  onDestroy(() => {
    if (animationFrame !== 0 && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(animationFrame);
    }
    const root = globalThis as typeof globalThis & {
      __autumnProductionHarness?: typeof harnessControl;
    };
    if (root.__autumnProductionHarness === harnessControl) {
      delete root.__autumnProductionHarness;
    }
  });
</script>

<Viewer3DCanvas
  sequenceData={sequence}
  {currentStep}
  isPlaying={true}
  {bpm}
  leftPropType="staff"
  rightPropType="staff"
  hideOverlays={true}
  hidePerformerBadges={true}
  fullScreen={true}
  performanceWarmupMs={5_000}
  onPerformanceSample={onSample}
  onSceneReadyChange={onReadyChange}
  cameraMaxOrbitDistance={128}
  cameraFov={cameraPreset.fov}
/>
