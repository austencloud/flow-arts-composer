<script lang="ts">
  import { Canvas, T } from "@threlte/core";
  import {
    PerformerRig,
    Plane,
    cmToUnits,
    userProportionsState,
  } from "@austencloud/scene-3d";
  import { onDestroy, onMount, untrack } from "svelte";

  import CanvasLifecycle from "#lib/shared/3d/components/CanvasLifecycle.svelte";
  import OrbitControls from "#lib/shared/3d/components/OrbitControls.svelte";
  import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import { toScenePropType } from "#lib/shared/3d/domain/scene-prop-type.js";
  import {
    createCharacterInstanceState,
    type CharacterInstanceState,
  } from "#lib/shared/3d/state/character-instance-state.svelte.js";
  import { makeStandaloneDefaults } from "#lib/shared/3d/state/performer-settings-types.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";

  interface Props {
    characterId: CharacterId;
    sourcePerformer: CharacterInstanceState | null;
    active: boolean;
    onReady: () => void;
  }

  let { characterId, sourcePerformer, active, onReady }: Props = $props();

  const standaloneDefaults = makeStandaloneDefaults();
  const canvasDpr =
    typeof window === "undefined"
      ? 1
      : Math.min(window.devicePixelRatio || 1, 1.25);
  const cameraTarget: [number, number, number] = [0, 1.56, 0];
  const cameraPosition: [number, number, number] = [0, 1.62, 1.16];
  const visiblePlanes = new Set([Plane.WALL]);

  let reduceMotion = $state(false);

  // The picker owns one ephemeral performer. Its defaults read from the
  // selected scope without calling the source performer's setters, so a
  // preview can never create an Undo entry or mutate the live scene.
  const previewState = createCharacterInstanceState(
    {
      id: "character-picker-preview",
      positionX: 0,
      positionZ: 0,
      characterId,
      persistent: false,
    },
    {
      getDefaults: () => ({
        prop: sourcePerformer?.effectiveProp ?? standaloneDefaults.prop,
        effortId:
          sourcePerformer?.effectiveEffortId ?? standaloneDefaults.effortId,
        planeMode:
          sourcePerformer?.effectivePlaneMode ?? standaloneDefaults.planeMode,
        customLeftPlane:
          sourcePerformer?.effectiveLeftPlane ??
          standaloneDefaults.customLeftPlane,
        customRightPlane:
          sourcePerformer?.effectiveRightPlane ??
          standaloneDefaults.customRightPlane,
      }),
    }
  );

  const groundOffset = $derived(-userProportionsState.groundY);
  const propLength = $derived.by(() => {
    const staffLengthCm = sourcePerformer?.settings.staffLengthCm;
    return staffLengthCm == null ? undefined : cmToUnits(staffLengthCm);
  });

  // Sequence identity changes are rare. Keep them separate from progress so
  // a playing source performer cannot reload this isolated loop every frame.
  $effect(() => {
    const sourceId = sourcePerformer?.id ?? null;
    const sequence = sourcePerformer?.loadedSequence ?? null;

    untrack(() => {
      void sourceId;
      if (!sequence) {
        previewState.clearSequence();
        return;
      }

      previewState.loadSequence(sequence);
      previewState.loop = true;
      previewState.speed = 0.72;
      const sourceStep = sourcePerformer?.currentStepIndex ?? 0;
      previewState.goToStep(
        Math.min(sourceStep, Math.max(0, previewState.totalSteps - 1))
      );
    });
  });

  $effect(() => {
    const shouldPlay = active && !reduceMotion && previewState.hasSequence;
    untrack(() => {
      if (shouldPlay) previewState.play();
      else previewState.pause();
    });
  });

  onMount(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => {
      reduceMotion = reducedMotion();
    };
    syncMotionPreference();
    mediaQuery.addEventListener("change", syncMotionPreference);
    return () => mediaQuery.removeEventListener("change", syncMotionPreference);
  });

  onDestroy(() => previewState.destroy());
</script>

<div class="live-preview" aria-hidden="true">
  <Canvas dpr={canvasDpr} renderMode="on-demand">
    <CanvasLifecycle />

    <T.PerspectiveCamera
      makeDefault
      position={cameraPosition}
      fov={38}
      near={0.05}
      far={12}
    >
      <OrbitControls
        enabled={false}
        enablePan={false}
        minDistance={1.16}
        maxDistance={1.16}
        minPolarAngle={Math.PI * 0.45}
        maxPolarAngle={Math.PI * 0.48}
        target={cameraTarget}
        autoRotate={active && !reduceMotion}
        autoRotateSpeed={2.4}
        oncreate={(controls) => {
          controls.update();
        }}
      />
    </T.PerspectiveCamera>

    <T.HemisphereLight color="#e9fbff" groundColor="#071118" intensity={1.25} />
    <T.DirectionalLight position={[2.5, 3.5, 3]} intensity={1.85} />
    <T.DirectionalLight
      position={[-2.5, 1.8, 1]}
      intensity={0.72}
      color="#82dff2"
    />

    <PerformerRig
      position={{ x: 0, z: 0 }}
      facingAngle={0}
      planeMode={previewState.effectivePlaneMode}
      avatarState={previewState}
      avatarId={characterId}
      showGrid={false}
      showProps={previewState.hasSequence}
      showEffects={false}
      {visiblePlanes}
      leftPropType={toScenePropType(
        sourcePerformer?.effectiveProp ?? standaloneDefaults.prop
      )}
      rightPropType={toScenePropType(
        sourcePerformer?.effectiveProp ?? standaloneDefaults.prop
      )}
      propBuild={sourcePerformer?.effectivePropBuild}
      {propLength}
      {groundOffset}
      enableLocomotion={active && !reduceMotion}
      enableFootPlanting={active && !reduceMotion}
      headDodge={true}
      isPlaying={previewState.isPlaying}
      onAvatarSwapped={onReady}
    />
  </Canvas>
</div>

<style>
  .live-preview {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background:
      radial-gradient(
        circle at 50% 42%,
        color-mix(in srgb, var(--performer-color) 20%, transparent),
        transparent 58%
      ),
      linear-gradient(160deg, #0b171c, #020506 76%);
    pointer-events: none;
  }

  .live-preview :global(canvas) {
    display: block;
    width: 100% !important;
    height: 100% !important;
  }
</style>
