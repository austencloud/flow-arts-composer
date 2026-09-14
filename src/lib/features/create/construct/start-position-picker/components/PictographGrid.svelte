<!-- PictographGrid.svelte - Pictograph grid display for StartPositionPicker -->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getLetterBorderColorSafe } from "$lib/shared/pictograph/shared/utils/letter-border-utils";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { onMount } from "svelte";
  import { bootProfiler } from "$lib/shared/analytics/boot-profiler";

  const {
    pictographDataSet,
    selectedPictograph = null,
    onPictographSelect,
    leftPropTypeOverride = undefined,
    rightPropTypeOverride = undefined,
  }: {
    pictographDataSet: PictographData[];
    selectedPictograph?: PictographData | null;
    onPictographSelect: (pictograph: PictographData) => void;
    /** Explicit prop types for demo/preview rendering (bypasses global settings). */
    leftPropTypeOverride?: PropType;
    rightPropTypeOverride?: PropType;
  } = $props();

  // Animation disabled - positions appear instantly for speed
  let animatedPictographs = $state(new Set<string>());

  // Layout stabilization: Force horizontal layout briefly on mount to prevent
  // flicker during workspace collapse animation (container is transiently narrow)
  let isLayoutStabilizing = $state(true);

  // Services
  let hapticService: HapticFeedback | undefined;

  onMount(() => {
    const finishStabilizing = bootProfiler.startSpan(
      "construct:start-grid-stabilize"
    );
    hapticService = getHapticFeedback();

    // Brief stabilization to let container queries settle after layout change
    // Matches the parent's in:scale delay (200ms) so both views feel symmetric
    const stabilizationTimer = setTimeout(() => {
      isLayoutStabilizing = false;
      finishStabilizing();
      bootProfiler.milestone("construct:start-grid-reveal-start");
    }, 200);

    return () => {
      clearTimeout(stabilizationTimer);
      finishStabilizing("cancelled");
    };
  });

  // Animation handlers (kept for compatibility but never trigger)
  function handleAnimationEnd(pictographId: string) {
    animatedPictographs.add(pictographId);
    animatedPictographs = new Set(animatedPictographs);
  }

  function shouldPictographAnimate(_pictographId: string): boolean {
    return false; // Animation disabled
  }

  // Handle pictograph selection with haptic feedback
  function handlePictographSelect(pictograph: PictographData) {
    // Trigger selection haptic feedback for pictograph selection
    hapticService?.trigger("selection");

    onPictographSelect(pictograph);
  }
</script>

<div class="pictograph-row" class:layout-stabilizing={isLayoutStabilizing}>
  {#each pictographDataSet as pictographData, index (pictographData.id)}
    <div
      class="pictograph-container"
      class:selected={selectedPictograph?.id === pictographData.id}
      class:animate={shouldPictographAnimate(pictographData.id)}
      role="button"
      tabindex="0"
      data-ghost="safe"
      data-ghost-kind="start-position"
      data-ghost-label={pictographData.letter ?? ""}
      style:--letter-border-color={getLetterBorderColorSafe(
        pictographData.letter
      )}
      style:--animation-delay="{index * 80}ms"
      onclick={() => handlePictographSelect(pictographData)}
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handlePictographSelect(pictographData);
        }
      }}
      onanimationend={() => handleAnimationEnd(pictographData.id)}
    >
      <!-- Render pictograph using Pictograph component -->
      <div class="pictograph-wrapper">
        <PictographContainer
          {pictographData}
          {leftPropTypeOverride}
          {rightPropTypeOverride}
          onReady={() =>
            bootProfiler.milestone("construct:start-pictograph-ready")}
        />
      </div>
    </div>
  {/each}
</div>

<style>
  .pictograph-row {
    display: grid;
    /* Default: 1x3 horizontal grid layout */
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: 1fr;
    gap: min(2cqmin, 1rem);

    flex: 1;
    width: 100%;
    height: 100%;
    padding: 0;

    /* Center items instead of stretching them */
    align-items: center;
    justify-items: center;
    align-content: center;

    /* Enable container queries for children */
    container-type: size;

    /* Smooth transition for layout changes (prevents jarring snap during animations) */
    transition:
      grid-template-columns 300ms cubic-bezier(0.4, 0, 0.2, 1),
      grid-template-rows 300ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* During layout stabilization, hide content until container dimensions settle */
  .pictograph-row.layout-stabilizing {
    opacity: 0;
  }

  /* Fade in once stabilization complete */
  .pictograph-row:not(.layout-stabilizing) {
    animation: fadeInGrid var(--duration-normal) ease-out forwards;
  }

  @keyframes fadeInGrid {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* Tall container (portrait): Use 3x1 column layout */
  @container (aspect-ratio < 0.75) {
    .pictograph-row {
      grid-template-columns: 1fr;
      grid-template-rows: repeat(3, 1fr);
    }
  }

  /* Wide container remains horizontal (same as default) */
  @container (aspect-ratio > 1.5) {
    .pictograph-row {
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: 1fr;
    }
  }

  .pictograph-container {
    /* Fill the grid cell rather than shrink-wrapping. A `fit-content` cell made
       the wrapper's `width: 100%` circular — it resolved against a parent whose
       size came from the wrapper — which collapsed the card on wide screens and
       overflowed it on short ones. Filling the cell gives that percentage a real
       box to resolve against; the inner flex still centers the card. */
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    min-width: 0; /* Allow shrinking below default minimums */
    min-height: 0;
    position: relative;
    cursor: pointer;
    padding: min(2cqmin, 0.5rem); /* Add padding for aesthetics */
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible; /* Allow wrapper effects to show */
    box-sizing: border-box;
    /* Initial state for animation - start invisible */
    opacity: 0;
    transform: scale(0.6) translateY(20px);
  }

  /* After animation completes, ensure visible state */
  .pictograph-container:not(.animate) {
    opacity: 1;
    transform: scale(1) translateY(0);
  }

  /* Entrance animation similar to StepCell */
  .pictograph-container.animate {
    animation: scaleInStaggered 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    animation-delay: var(--animation-delay, 0ms);
  }

  .pictograph-wrapper {
    /*
     * The card is square, so it is bounded by whichever runs out first: the
     * width of its grid cell, or the height of the row. `min(100%, 100cqh)`
     * says exactly that in one rule and holds at every shape — a short, wide
     * Fold-landscape strip and a 4K expanse both land correctly, where the old
     * cqmin/cqw/cqh trio disagreed with each other at the extremes.
     */
    width: min(100%, 100cqh);
    height: auto;
    /* Constrain to maintain square aspect ratio matching the SVG */
    aspect-ratio: 1 / 1;
    max-width: 100%;
    max-height: 100%;
    min-width: 0;
    min-height: 0;
    display: block; /* Use block instead of flex to avoid sizing conflicts */
    position: relative;
    box-sizing: border-box;
    transition: all var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1);
    border: 2px solid transparent;
    border-radius: 0px;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.1),
      0 2px 4px rgba(0, 0, 0, 0.06);
  }

  /* Stacked (portrait) layout: each of the three rows owns a third of the
     height, so the height bound is a third of the container, not all of it. */
  @container (aspect-ratio < 0.75) {
    .pictograph-wrapper {
      width: min(100%, 31cqh);
    }
  }

  /* Ensure the pictograph inside fills the wrapper exactly */
  .pictograph-wrapper :global(.pictograph) {
    width: 100%;
    height: 100%;
    display: block;
  }

  .pictograph-wrapper :global(.pictograph svg) {
    width: 100%;
    height: 100%;
    display: block;
  }

  /* Desktop hover - only on hover-capable devices */
  @media (hover: hover) {
    .pictograph-container:hover .pictograph-wrapper {
      transform: scale(1.05);
      border-color: var(--letter-border-color, var(--primary));
      box-shadow:
        0 2px 4px rgba(0, 0, 0, 0.12),
        0 4px 8px rgba(0, 0, 0, 0.08),
        0 8px 16px rgba(0, 0, 0, 0.06);
      filter: brightness(1.05);
    }
  }

  /* Mobile/universal active state */
  .pictograph-container:active .pictograph-wrapper {
    transform: scale(0.97);
    transition: transform var(--duration-instant) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .pictograph-container.selected .pictograph-wrapper {
    border-color: var(--letter-border-color, var(--primary));
    background: var(--primary) / 10;
    box-shadow:
      0 0 12px rgba(100, 200, 255, 0.3),
      0 2px 4px rgba(0, 0, 0, 0.12),
      0 4px 8px rgba(0, 0, 0, 0.08);
  }

  /* Focus styles for accessibility */
  .pictograph-container:focus-visible .pictograph-wrapper {
    outline: 2px solid var(--primary-color, #6366f1);
    outline-offset: 2px;
  }

  /* Big-screen tiers at the shared 1680 seam (.claude/rules/4k-native-layout.md).
     Two things go wrong at 4K without these:
     1. The row spans the whole shell, so three centered cards land at the far
        left, middle, and far right with a screen of gutter between them.
     2. `min(100%, 30cqw)` resolves its 100% against a `fit-content` parent —
        circular sizing that collapses each card to ~300px no matter how much
        room there is. Stretching the cell gives the percentage something real
        to resolve against, and the height cap keeps the square from
        overflowing a short-but-wide region. */
  @media (min-width: 1680px) {
    /* max-width, not width: the row is a flex item with `flex: 1`, and grow
       beats a plain width. max-width still clamps it, and the parent's
       justify-content keeps the group centered. */
    .pictograph-row {
      max-width: 105rem;
      margin-inline: auto;
      gap: clamp(1.5rem, 3cqw, 4rem);
    }
  }

  @media (min-width: 2600px) {
    .pictograph-row {
      max-width: 150rem;
    }
  }

  @media (max-width: 768px) {
    .pictograph-row {
      flex-direction: row;
      gap: var(--spacing-md);
    }
  }

  /* Even smaller on very small screens */
  @media (max-width: 480px) {
    .pictograph-row {
      gap: var(--spacing-sm);
    }
  }

  /* Reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .pictograph-row {
      transition: none;
    }

    .pictograph-row:not(.layout-stabilizing) {
      animation: none;
      opacity: 1;
    }
  }

  /* Keyframe animation for staggered entrance effect */
  @keyframes scaleInStaggered {
    0% {
      opacity: 0;
      transform: scale(0.6) translateY(20px);
    }
    60% {
      opacity: 0.8;
      transform: scale(1.1) translateY(-5px);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
</style>
