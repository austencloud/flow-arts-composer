<script lang="ts">
  import { Canvas, T } from "@threlte/core";
  import { untrack, onDestroy } from "svelte";
  import { PerformerRig, Plane, PlaneMode, userProportionsState } from "@austencloud/scene-3d";
  import type { GridMode } from "@austencloud/scene-3d";
  import { OrbitControls } from "@threlte/extras";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    createCharacterInstanceState,
    makeStandaloneDeps,
  } from "$lib/shared/3d/state/character-instance-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { computeFramingShot } from "$lib/shared/3d/camera/compute-framing-shot";
  import type { BackgroundType } from "@austencloud/backgrounds";
  import Environment3D from "$lib/shared/3d/environments/components/Environment3D.svelte";
  import StepNumber from "$lib/shared/pictograph/shared/components/StepNumber.svelte";
  import { toScenePropType } from "$lib/shared/3d/domain/scene-prop-type";

  let { sequence, backgroundType }: { sequence: SequenceData | null; backgroundType: BackgroundType } = $props();

  const PLATFORM_HEIGHT = 0.2;
  const groundOffset = $derived(-userProportionsState.groundY + PLATFORM_HEIGHT);

  const shot = $derived(
    computeFramingShot({
      performers: [{ x: 0, z: 0 }],
      plane: "wall",
      groundOffset,
      fovDeg: 50,
      elevationDeg: 5,
    })
  );

  // Mirror camera to +Z side so we face the performer's front
  const frontEye = $derived<[number, number, number]>([
    shot.eye.x,
    shot.eye.y,
    2 * shot.target.z - shot.eye.z,
  ]);

  let performerState = $state<ReturnType<typeof createCharacterInstanceState> | null>(null);

  const displayedStepNumber = $derived(
    performerState ? performerState.currentStepIndex : null
  );
  const isStartPlacement = $derived(
    performerState !== null && performerState.currentStepIndex === 0
  );

  try {
    performerState = createCharacterInstanceState(
      { id: "quiz-performer", positionX: 0, positionZ: 0 },
      makeStandaloneDeps()
    );
  } catch (err) {
    console.warn("[QuizPerformerStage] Failed to init:", err);
  }

  $effect(() => {
    const seq = sequence;
    untrack(() => {
      if (!seq || !performerState) return;
      performerState.loadSequence(seq);
      performerState.loop = true;
      performerState.play();
    });
  });

  onDestroy(() => {
    if (performerState) {
      performerState.pause();
      performerState.destroy();
    }
  });
</script>

<div class="stage-container">
  <svg class="step-overlay" viewBox="0 0 950 950" preserveAspectRatio="xMinYMin meet">
    <StepNumber
      stepNumber={displayedStepNumber}
      {isStartPlacement}
      darkMode={true}
    />
  </svg>
  <Canvas>
    <T.PerspectiveCamera
      makeDefault
      position={frontEye}
      fov={50}
    >
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.2}
        autoRotate={false}
        target={[shot.target.x, shot.target.y, shot.target.z]}
        oncreate={(ref) => { ref.update(); }}
      />
    </T.PerspectiveCamera>

    <Environment3D {backgroundType} performerCount={1} />

    {#if performerState}
      <PerformerRig
        position={{ x: 0, z: 0 }}
        facingAngle={0}
        planeMode={PlaneMode.WALL}
        avatarState={performerState}
        showGrid={false}
        visiblePlanes={new Set([Plane.WALL])}
        gridMode={((sequence?.gridMode ?? "diamond") as GridMode)}
        leftPropType={toScenePropType(PropType.STAFF)}
        rightPropType={toScenePropType(PropType.STAFF)}
        {groundOffset}
        enableLocomotion={true}
        enableFootPlanting={true}
      />
    {/if}
  </Canvas>
</div>

<style>
  .stage-container {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 200px;
    border-radius: 16px;
    overflow: hidden;
  }

  .step-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 25%;
    height: auto;
    z-index: 10;
    pointer-events: none;
  }
</style>
