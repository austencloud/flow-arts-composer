<!--
MotionVisualizer - Animated visualization of hand motions on 4-point diamond grid
Shows shift (adjacent), dash (opposite), and static (stay) motions with animated arrows
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { onMount } from "svelte";
  import {
    GRID_POINTS_4,
    lerp,
    type HandPosition4,
    type MotionType,
    type MotionTypeNumber,
  } from "../../../domain/constants/motion-visualizer-data";
  import MotionTypeBadge from "./motion-visualizer/MotionTypeBadge.svelte";
  import MotionLegend from "./motion-visualizer/MotionLegend.svelte";
  import MotionPlayButton from "./motion-visualizer/MotionPlayButton.svelte";
  import MotionGridSvg from "./motion-visualizer/MotionGridSvg.svelte";

  interface Props {
    leftStart?: HandPosition4;
    leftEnd?: HandPosition4;
    rightStart?: HandPosition4;
    rightEnd?: HandPosition4;
    leftMotion?: MotionType;
    rightMotion?: MotionType;
    motionType?: MotionTypeNumber;
    autoPlay?: boolean;
    showLabels?: boolean;
    showMotionType?: boolean;
  }

  const {
    leftStart = "N",
    leftEnd = "E",
    rightStart = "S",
    rightEnd = "W",
    leftMotion = "shift",
    rightMotion = "shift",
    motionType = 1,
    autoPlay = false,
    showLabels = true,
    showMotionType = true,
  }: Props = $props();

  const hapticService = getHapticFeedback();

  let animating = $state(false);
  let animationProgress = $state(0);

  const leftCurrentPos = $derived.by(() => {
    if (!animating || animationProgress === 0) return GRID_POINTS_4[leftStart];
    if (animationProgress >= 1) return GRID_POINTS_4[leftEnd];
    const start = GRID_POINTS_4[leftStart];
    const end = GRID_POINTS_4[leftEnd];
    return {
      x: lerp(start.x, end.x, animationProgress),
      y: lerp(start.y, end.y, animationProgress),
    };
  });

  const rightCurrentPos = $derived.by(() => {
    if (!animating || animationProgress === 0) return GRID_POINTS_4[rightStart];
    if (animationProgress >= 1) return GRID_POINTS_4[rightEnd];
    const start = GRID_POINTS_4[rightStart];
    const end = GRID_POINTS_4[rightEnd];
    return {
      x: lerp(start.x, end.x, animationProgress),
      y: lerp(start.y, end.y, animationProgress),
    };
  });

  function playAnimation() {
    if (animating) return;

    animating = true;
    animationProgress = 0;
    hapticService?.trigger("selection");

    const duration = 800;
    const startTime = Date.now();

    function animate() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      animationProgress =
        progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        animationProgress = 1;
        animating = false;
      }
    }

    requestAnimationFrame(animate);
  }

  onMount(() => {
    if (autoPlay) {
      const timer = setTimeout(playAnimation, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  });
</script>

<div class="motion-visualizer">
  {#if showMotionType}
    <MotionTypeBadge {motionType} />
  {/if}

  <MotionGridSvg
    {leftStart}
    {leftEnd}
    {rightStart}
    {rightEnd}
    {leftMotion}
    {rightMotion}
    {leftCurrentPos}
    {rightCurrentPos}
    {animating}
    {animationProgress}
    {showLabels}
  />

  <MotionLegend {leftMotion} {rightMotion} />

  <MotionPlayButton
    {animating}
    hasCompleted={animationProgress >= 1}
    onclick={playAnimation}
  />
</div>

<style>
  .motion-visualizer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
  }

  @media (max-width: 400px) {
    .motion-visualizer {
      padding: 1rem;
    }
  }
</style>
