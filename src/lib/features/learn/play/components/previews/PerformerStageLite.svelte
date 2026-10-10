<!--
  Minimal REAL 3D performer for the hub card — the actual PerformerRig +
  avatar state the Read the Performer game plays, stripped of game chrome
  (no Environment3D scene, no OrbitControls, no step-number overlay).
  Split into its own file so PerformerPulsePreview can lazy-import it and
  the hub route doesn't pay for Three.js until this card is on screen.

  `active` gates playback (offscreen cards pause the loop); reduced-motion
  callers just never set it, leaving the loaded start pose as a still.
-->
<script lang="ts">
  import { Canvas, T } from "@threlte/core";
  import { untrack, onDestroy } from "svelte";
  import { PerformerRig, Plane, PlaneMode, userProportionsState } from "@austencloud/scene-3d";
  import type { GridMode } from "@austencloud/scene-3d";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    createCharacterInstanceState,
    makeStandaloneDeps,
  } from "#lib/shared/3d/state/character-instance-state.svelte.js";
  import { computeFramingShot } from "#lib/shared/3d/camera/compute-framing-shot.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { toScenePropType } from "#lib/shared/3d/domain/scene-prop-type.js";

  let { sequence, active = true }: { sequence: SequenceData; active?: boolean } = $props();

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

  // Same front-facing mirror as the game's QuizPerformerStage.
  const frontEye = $derived<[number, number, number]>([
    shot.eye.x,
    shot.eye.y,
    2 * shot.target.z - shot.eye.z,
  ]);

  let performerState = $state<ReturnType<typeof createCharacterInstanceState> | null>(null);

  try {
    performerState = createCharacterInstanceState(
      { id: "hub-preview-performer", positionX: 0, positionZ: 0 },
      makeStandaloneDeps()
    );
  } catch (err) {
    console.warn("[PerformerStageLite] Failed to init:", err);
  }

  $effect(() => {
    const seq = sequence;
    untrack(() => {
      if (!performerState) return;
      performerState.loadSequence(seq);
      performerState.loop = true;
    });
  });

  // Offscreen/reduced-motion pause without tearing the canvas down.
  $effect(() => {
    if (!performerState) return;
    if (active) {
      performerState.play();
    } else {
      performerState.pause();
    }
  });

  onDestroy(() => {
    if (performerState) {
      performerState.pause();
      performerState.destroy();
    }
  });
</script>

<div class="lite-stage">
  <Canvas>
    <T.PerspectiveCamera
      makeDefault
      position={frontEye}
      fov={50}
      oncreate={(ref) => {
        ref.lookAt(shot.target.x, shot.target.y, shot.target.z);
      }}
    />

    <!-- No Environment3D on a hub card: two lights are enough to read the
         rig and the props, and they cost nothing. -->
    <T.AmbientLight intensity={0.9} />
    <T.DirectionalLight position={[2, 4, 3]} intensity={1.4} />

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
  .lite-stage {
    position: absolute;
    inset: 0;
  }
</style>
