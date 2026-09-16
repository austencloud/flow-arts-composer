<!--
Type1LetterVisualizer - Displays a Type 1 (Dual-Shift) letter using the Pictograph component
Shows letters A-V with their start/end placements and prospin/antispin motions
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { Type1LetterData } from "./type1-letter-data";
  import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";
  import {
    GridMode,
    GridPlacementGroup,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { MotionType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { onMount } from "svelte";

  let {
    letterData,
    showLabels = true,
    showPictograph = true,
    size = "medium",
  } = $props<{
    letterData: Type1LetterData;
    showLabels?: boolean;
    showPictograph?: boolean;
    size?: "small" | "medium" | "large";
  }>();

  const hapticService = getHapticFeedback();

  // State for loaded pictograph data
  let pictographData = $state<PictographData | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  // Load pictograph data for the letter
  onMount(async () => {
    try {
      const data = await letterQueryHandler.getPictographByLetter(
        letterData.letter,
        GridMode.DIAMOND
      );

      if (data) {
        pictographData = data;
      } else {
        error = `No pictograph found for letter ${letterData.letter}`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load pictograph";
      console.error(
        "Failed to load pictograph for letter:",
        letterData.letter,
        e
      );
    } finally {
      isLoading = false;
    }
  });

  // Motion type colors for labels
  const MOTION_COLORS: Record<MotionType, string> = {
    [MotionType.PRO]: "var(--theme-accent, #22D3EE)", // Cyan for prospin
    [MotionType.ANTI]: "var(--prop-red, #A855F7)", // Purple for antispin
    [MotionType.STATIC]: "var(--theme-text-dim, #6B7280)", // Gray for static
    [MotionType.DASH]: "var(--semantic-warning)", // Amber for dash
    [MotionType.FLOAT]: "var(--semantic-success)", // Emerald for float
  };

  // Placement group colors - domain-specific visualization colors, no global theme equivalent
  const PLACEMENT_COLORS: Record<GridPlacementGroup, string> = {
    [GridPlacementGroup.ALPHA]: "#FF6B6B", // Red/coral for opposite
    [GridPlacementGroup.BETA]: "#4ECDC4", // Teal for same
    [GridPlacementGroup.GAMMA]: "#FFE66D", // Yellow for right angle
    [GridPlacementGroup.ZETA]: "#9B59B6", // Purple for zeta
    [GridPlacementGroup.ETA]: "#3498DB", // Blue for eta
    [GridPlacementGroup.TAU]: "#06b6d4", // Cyan for tau
    [GridPlacementGroup.TERRA]: "#fbbf24", // Amber/gold for terra
  };

  // Hand colors
  const BLUE_COLOR = "var(--prop-blue, #4A9EFF)";
  const RED_COLOR = "var(--prop-red, #FF4A9E)";

  // Get motion type label
  function getMotionLabel(type: MotionType): string {
    switch (type) {
      case MotionType.PRO:
        return "Prospin";
      case MotionType.ANTI:
        return "Antispin";
      case MotionType.STATIC:
        return "Static";
      case MotionType.DASH:
        return "Dash";
      case MotionType.FLOAT:
        return "Float";
      default:
        return type;
    }
  }

  // Get placement group label
  function getPlacementLabel(group: GridPlacementGroup): string {
    switch (group) {
      case GridPlacementGroup.ALPHA:
        return "Alpha (Opposite)";
      case GridPlacementGroup.BETA:
        return "Beta (Same)";
      case GridPlacementGroup.GAMMA:
        return "Gamma (Right Angle)";
      default:
        return group;
    }
  }

  // Derived: Check if motion is hybrid (different blue/red motions)
  const isHybrid = $derived(letterData.leftMotion !== letterData.rightMotion);

  // Size configuration
  type SizeKey = "small" | "medium" | "large";
  const sizeConfig: Record<
    SizeKey,
    { pictographSize: number; fontSize: string }
  > = {
    small: { pictographSize: 100, fontSize: "1.25rem" },
    medium: { pictographSize: 160, fontSize: "1.75rem" },
    large: { pictographSize: 220, fontSize: "2.25rem" },
  };

  const currentSize = $derived(sizeConfig[size as SizeKey]);
</script>

<div class="type1-visualizer size-{size}">
  <!-- Letter display header -->
  {#if letterData}
    {@const startGroup = letterData.startPlacementGroup as GridPlacementGroup}
    {@const endGroup = letterData.endPlacementGroup as GridPlacementGroup}
    <div class="letter-header">
      <span class="letter-name" style="font-size: {currentSize.fontSize}">
        {letterData.letter}
      </span>
      <span
        class="placement-transition"
        style="color: {PLACEMENT_COLORS[startGroup]}"
      >
        {startGroup} → {endGroup}
      </span>
    </div>
  {/if}

  <!-- Pictograph Display -->
  {#if showPictograph}
    <div
      class="pictograph-container"
      style="width: {currentSize.pictographSize}px; height: {currentSize.pictographSize}px;"
    >
      {#if isLoading}
        <div class="loading-state">
          <ProgressRing percent={-1} size={24} strokeWidth={2} />
        </div>
      {:else if error}
        <div class="error-state" role="alert" aria-live="assertive">
          <span class="error-icon">⚠</span>
          <span class="error-text">{error}</span>
        </div>
      {:else if pictographData}
        <PictographContainer
          {pictographData}
          showTKA={true}
          showReversals={false}
          disableTransitions={true}
        />
      {/if}
    </div>
  {/if}

  <!-- Motion info labels -->
  {#if showLabels && letterData}
    {@const leftMotion = letterData.leftMotion as MotionType}
    {@const rightMotion = letterData.rightMotion as MotionType}
    <div class="motion-info">
      <div class="hand-info">
        <span class="hand-dot" style="background: {BLUE_COLOR}"></span>
        <span class="motion-type" style="color: {MOTION_COLORS[leftMotion]}">
          {getMotionLabel(leftMotion)}
        </span>
      </div>
      <div class="hand-info">
        <span class="hand-dot" style="background: {RED_COLOR}"></span>
        <span class="motion-type" style="color: {MOTION_COLORS[rightMotion]}">
          {getMotionLabel(rightMotion)}
        </span>
      </div>
    </div>

    <!-- Motion pattern badge -->
    <div class="pattern-info">
      {#if isHybrid && letterData.leaderRotation}
        <span class="pattern-badge hybrid">Hybrid · leads {letterData.leaderRotation}</span>
      {:else if isHybrid}
        <span class="pattern-badge hybrid">Hybrid</span>
      {:else if letterData.leftMotion === MotionType.PRO}
        <span class="pattern-badge pro">Pro-Pro</span>
      {:else}
        <span class="pattern-badge anti">Anti-Anti</span>
      {/if}
    </div>

    <!-- Description -->
    {#if letterData.description}
      <p class="description">{letterData.description}</p>
    {/if}
  {/if}
</div>

<style>
  .type1-visualizer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    transition: all var(--duration-emphasis) ease;
  }

  .type1-visualizer:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-bg);
  }

  /* Size variants */
  .size-small {
    padding: 0.5rem;
    gap: 0.5rem;
  }

  .size-large {
    padding: 1.5rem;
    gap: 1rem;
  }

  /* Letter header */
  .letter-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .letter-name {
    font-weight: 800;
    color: white;
    line-height: 1;
  }

  .placement-transition {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.8;
  }

  /* Pictograph container */
  .pictograph-container {
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 8px var(--theme-shadow);
  }

  /* Loading state */
  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  /* Error state */
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    height: 100%;
    padding: 1rem;
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
    color: var(--semantic-error);
  }

  .error-icon {
    font-size: 1.5rem;
  }

  .error-text {
    font-size: 0.75rem;
    text-align: center;
  }

  /* Motion info */
  .motion-info {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .hand-info {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .hand-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .motion-type {
    font-size: 0.8125rem;
    font-weight: 600;
  }

  /* Pattern badge */
  .pattern-info {
    display: flex;
    justify-content: center;
  }

  .pattern-badge {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .pattern-badge.pro {
    background: color-mix(in srgb, var(--theme-accent, #22d3ee) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent);
    color: var(--theme-accent, #22d3ee);
  }

  .pattern-badge.anti {
    --anti-color: #a855f7;
    background: color-mix(in srgb, var(--anti-color) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--anti-color) 40%, transparent);
    color: var(--anti-color);
  }

  .pattern-badge.hybrid {
    --anti-color: #a855f7;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 15%, transparent),
      color-mix(in srgb, var(--anti-color) 15%, transparent)
    );
    border: 1px solid color-mix(in srgb, var(--anti-color) 40%, transparent);
    color: var(--anti-color);
  }

  /* Description */
  .description {
    font-size: 0.8125rem;
    color: var(--theme-text-dim);
    text-align: center;
    margin: 0;
    max-width: 252px;
    line-height: 1.4;
  }

</style>
