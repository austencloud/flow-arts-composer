<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
  import {
    isVisibleMotion,
    type MotionData,
  } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    MotionType,
    HandSide,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { getPathD } from "$lib/features/hand-paths/hand-path-builder/services/hand-path-animator";
  import {
    getAnimationVisibilityManager,
    type AnimationVisibilityStateManager,
  } from "../../state/animation-visibility-state.svelte";
  import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import type { ViewerCustomColorPair } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import { fade } from "svelte/transition";
  import { cubicInOut, cubicOut } from "svelte/easing";
  import { Tween } from "svelte/motion";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import type { GridJoin } from "@tka/tka-types";
  import { gridJoinShiftViewBox } from "../../services/animation-grid-join";
  import { GRID_JOIN_TWEEN_MS } from "$lib/shared/grid-join/grid-join-tween";

  let {
    sequenceData = null,
    currentStep = 0,
    stepData = null,
    showLeft = false,
    showRight = false,
    primaryPropColors,
    gridJoin = null,
    vm = null,
  }: {
    sequenceData?: SequenceData | null;
    currentStep?: number;
    /** Parent-attributed step (same object the glyph shows). When it's one of
     *  sequenceData's step refs, path lines follow it — keeping them in sync
     *  with the glyph during step-playback dwells, where the integer boundary
     *  is attributed to the COMPLETED beat rather than the upcoming one. */
    stepData?: StepData | StartPlacementData | null;
    showLeft?: boolean;
    showRight?: boolean;
    primaryPropColors?: ViewerCustomColorPair | null;
    /** The sequence's join: blue's path on its grid, red's on the other. */
    gridJoin?: GridJoin | null;
    /** Per-surface visibility manager; falls back to the global singleton. */
    vm?: AnimationVisibilityStateManager | null;
  } = $props();

  function resolvePathTypeForMotion(
    motion: MotionData
  ): "arc" | "linear" | "concave" {
    if (motion.pathShape) return motion.pathShape;
    if (motion.motionType === MotionType.DASH) return "linear";
    if (motion.motionType === MotionType.STATIC) return "arc";

    const manager = vm ?? getAnimationVisibilityManager();
    const pathPolicy = manager.getPathPolicy();
    if (pathPolicy.motionAwarePaths) {
      if (motion.motionType === MotionType.PRO) return "arc";
      if (motion.motionType === MotionType.ANTI) return "concave";
    }
    return pathPolicy.pathShape;
  }

  function buildPathD(motion: MotionData): string | null {
    if (motion.startLocation === motion.endLocation) return null;
    if (motion.motionType === MotionType.STATIC) return null;
    const pathType = resolvePathTypeForMotion(motion);
    return getPathD(motion.startLocation, motion.endLocation, pathType);
  }

  const stepIndex = $derived(Math.floor(currentStep) - 1);

  const currentStepData = $derived.by(() => {
    if (!sequenceData?.steps?.length) return null;
    // Prefer the parent's attribution when stepData is one of the sequence's
    // step refs (glyph and path lines then can never disagree). Start position
    // draws no path lines.
    if (stepData) {
      const idx = sequenceData.steps.indexOf(stepData as StepData);
      if (idx >= 0) return sequenceData.steps[idx] ?? null;
      if (
        sequenceData.startPlacement &&
        stepData === sequenceData.startPlacement
      )
        return null;
    }
    if (stepIndex < 0 || stepIndex >= sequenceData.steps.length) return null;
    return sequenceData.steps[stepIndex] ?? null;
  });

  const leftPathD = $derived.by(() => {
    const motion = currentStepData?.motions?.left;
    return isVisibleMotion(motion) ? buildPathD(motion) : null;
  });

  const rightPathD = $derived.by(() => {
    const motion = currentStepData?.motions?.right;
    return isVisibleMotion(motion) ? buildPathD(motion) : null;
  });

  const colors = $derived(
    primaryPropColors !== undefined
      ? primaryPropColors
      : getSettings().primaryPropColors
  );
  const leftColor = $derived(
    colors?.left ?? getMotionColor(HandSide.LEFT, "dark")
  );
  const rightColor = $derived(
    colors?.right ?? getMotionColor(HandSide.RIGHT, "dark")
  );
  // Each hand's path shift in the viewBox. A new join on the same sequence
  // slides the paths with the grids, props and trails (the engine's slide
  // uses the same length and easing); a new sequence snaps.
  const shift = new Tween(
    { lx: 0, ly: 0, rx: 0, ry: 0 },
    { duration: GRID_JOIN_TWEEN_MS, easing: cubicInOut }
  );
  let shiftSequenceId: string | null | undefined = undefined;
  $effect(() => {
    const left = gridJoin ? gridJoinShiftViewBox(gridJoin, 0) : null;
    const right = gridJoin ? gridJoinShiftViewBox(gridJoin, 1) : null;
    const sequenceId = sequenceData?.id ?? null;
    const snap = sequenceId !== shiftSequenceId;
    shiftSequenceId = sequenceId;
    void shift.set(
      {
        lx: left?.x ?? 0,
        ly: left?.y ?? 0,
        rx: right?.x ?? 0,
        ry: right?.y ?? 0,
      },
      { duration: snap ? 0 : motionDuration(GRID_JOIN_TWEEN_MS) }
    );
  });
  const leftTransform = $derived.by(() => {
    const { lx, ly } = shift.current;
    return lx === 0 && ly === 0 ? undefined : `translate(${lx} ${ly})`;
  });
  const rightTransform = $derived.by(() => {
    const { rx, ry } = shift.current;
    return rx === 0 && ry === 0 ? undefined : `translate(${rx} ${ry})`;
  });
  const drawLeft = $derived(showLeft && leftPathD !== null);
  const drawRight = $derived(showRight && rightPathD !== null);
</script>

<!-- Gate the overlay on the TOGGLE intent (showLeft/showRight), not on whether
     this step happens to have path geometry — so turning Paths on/off fades the
     whole overlay once, while per-step geometry swaps (drawBlue/drawRed) stay
     instant and never trigger a fade mid-playback. -->
{#if showLeft || showRight}
  <svg
    class="path-lines-overlay"
    viewBox="0 0 950 950"
    preserveAspectRatio="xMidYMid meet"
    transition:fade={{
      duration: motionDuration(DURATION.normal),
      easing: cubicOut,
    }}
  >
    {#if drawLeft}
      <path
        d={leftPathD}
        transform={leftTransform}
        fill="none"
        stroke={leftColor}
        stroke-width="3"
        stroke-linecap="round"
        stroke-dasharray="8 6"
        opacity="0.5"
      />
    {/if}
    {#if drawRight}
      <path
        d={rightPathD}
        transform={rightTransform}
        fill="none"
        stroke={rightColor}
        stroke-width="3"
        stroke-linecap="round"
        stroke-dasharray="8 6"
        opacity="0.5"
      />
    {/if}
  </svg>
{/if}

<style>
  .path-lines-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 4;
    pointer-events: none;
  }
</style>
