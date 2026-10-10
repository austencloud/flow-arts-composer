<!--
  PovAnimatorPreview.svelte

  Motion preview for the POV Pattern Lab. Wraps AnimatorCanvas with the
  pattern-lab's shared clock so the avatar's props move through the loaded
  sequence in sync with the LED staves, spin disc, and pattern timeline.

  Nothing in here drives its own playback. The pattern timeline owns the
  rAF loop and advances poi.playheadBeat; this component just reads that
  fractional beat reactively, maps it to a step + interpolation fraction,
  and feeds the resulting prop angles into AnimatorCanvas. That keeps
  every preview tied to exactly one clock - the same pattern used by
  PovSpinPreview and LedStaffPreview.

  When no sequence is loaded, the preview hides itself (the lab is still
  useful in abstract-beat mode; we just have nothing to animate).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { getPoiContext } from "../context/poi-context";
  import AnimatorCanvas from "#lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

  import { interpolatePropAngles } from "#lib/shared/animation-engine/services/prop-interpolator.js";

  const poi = getPoiContext();

  const DEFAULT_PROP_STATE: PropState = {
    centerPathAngle: 0,
    staffRotationAngle: 0,
  };

  // Interpolation runs through the shared module functions once mounted.
  let servicesReady = $state(false);

  onMount(() => {
    servicesReady = true;
  });

  // ── Playhead → step derivation ──────────────────────────────────
  // poi.playheadBeat is a 0-based fractional beat (0 .. loadedSteps.length).
  // AnimatorCanvas wants a 0-based step index + a [0, 1) progress through
  // that step, which is exactly what Math.floor / subtract gives us.
  const loadedSteps = $derived(poi.loadedSteps);
  const stepCount = $derived(loadedSteps.length);
  const currentStepIndex = $derived(
    stepCount === 0
      ? 0
      : Math.min(stepCount - 1, Math.max(0, Math.floor(poi.playheadBeat))),
  );
  const stepProgress = $derived(
    stepCount === 0
      ? 0
      : Math.max(0, Math.min(0.9999, poi.playheadBeat - Math.floor(poi.playheadBeat))),
  );

  const currentStepData = $derived<StepData | null>(
    stepCount > 0 ? (loadedSteps[currentStepIndex] ?? null) : null,
  );
  const currentLetter = $derived<Letter | null>(
    (currentStepData?.letter ?? null) as Letter | null,
  );

  // Prop angles are recomputed whenever the step, its progress, or the
  // interpolator changes. We hold a local copy in $state so AnimatorCanvas
  // sees stable PropState objects rather than re-deriving on every access.
  let leftProp = $state<PropState>({ ...DEFAULT_PROP_STATE });
  let rightProp = $state<PropState>({ ...DEFAULT_PROP_STATE });

  $effect(() => {
    if (!servicesReady || !currentStepData) {
      leftProp = { ...DEFAULT_PROP_STATE };
      rightProp = { ...DEFAULT_PROP_STATE };
      return;
    }

    const result = interpolatePropAngles(
      currentStepData,
      stepProgress,
    );
    if (result.isValid) {
      leftProp = result.leftAngles ?? { ...DEFAULT_PROP_STATE };
      rightProp = result.rightAngles ?? { ...DEFAULT_PROP_STATE };
    }
  });

  const sequence = $derived(poi.loadedSequence);
  const gridMode = $derived(sequence?.gridMode ?? GridMode.DIAMOND);
  const sequenceWord = $derived(sequence?.word ?? sequence?.name ?? null);
  const isPlaying = $derived(poi.isTimelinePlaying);
  // AnimatorCanvas uses a 1-based currentStep for its progress overlay.
  const currentStepOneBased = $derived(currentStepIndex + 1);
</script>

{#if sequence && stepCount > 0}
  <div class="pov-animator-preview">
    <AnimatorCanvas
      {leftProp}
      {rightProp}
      {gridMode}
      letter={currentLetter}
      stepData={currentStepData}
      sequenceData={sequence}
      currentStep={currentStepOneBased}
      {isPlaying}
      word={sequenceWord}
      disableContextMenu={true}
      hideProgressBar={true}
      fillContainer={true}
      fireConfig={{ disableFrameCache: true }}
    />
  </div>
{/if}

<style>
  .pov-animator-preview {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255 255 255 / 0.03));
    overflow: hidden;
  }
</style>
