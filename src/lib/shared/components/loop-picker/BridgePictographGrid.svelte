<!--
  BridgePictographGrid.svelte

  Displays bridge pictograph options in a responsive grid.
  Shows letters that bring a sequence to a loopable position.
  Groups options by rotation type and shows resulting sequence length.

  Pattern follows: PictographGrid from StartPlacementPicker
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { CircularizationOption } from "../../../features/create/shared/services/sequence-extender";
  import { getLetterBorderColorSafe } from "$lib/shared/pictograph/shared/utils/letter-border-utils";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { onMount } from "svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";

  interface Props {
    /** Bridge options with their pictograph data */
    options: CircularizationOption[];
    /** Called when user selects a bridge pictograph */
    onSelect: (option: CircularizationOption) => void;
    /** Loading state */
    isLoading?: boolean;
  }

  let { options, onSelect, isLoading = false }: Props = $props();

  // Services
  let hapticService: HapticFeedback | undefined;

  // Layout stabilization to prevent flicker
  let isLayoutStabilizing = $state(true);

  onMount(() => {
    hapticService = getHapticFeedback();

    // Allow layout to settle
    const stabilizationTimer = setTimeout(() => {
      isLayoutStabilizing = false;
    }, 200);

    return () => clearTimeout(stabilizationTimer);
  });

  // Handle bridge selection with haptic feedback
  function handleBridgeSelect(option: CircularizationOption) {
    if (isLoading) return;
    hapticService?.trigger("selection");
    onSelect(option);
  }

  // Group options by rotation type for visual separation
  const halfRotationOptions = $derived(
    options.filter((o) => o.rotationRelation === "half")
  );
  const quarterRotationOptions = $derived(
    options.filter((o) => o.rotationRelation === "quarter")
  );
  const exactOptions = $derived(
    options.filter((o) => o.rotationRelation === "exact" || !o.rotationRelation)
  );

  // Get group description with length info
  function getGroupDescription(
    rotation: "half" | "quarter" | "exact",
    sampleOption: CircularizationOption | undefined
  ): string {
    if (!sampleOption?.resultingLength) {
      if (rotation === "half") return "180° → doubles length";
      if (rotation === "quarter") return "90° → quadruples length";
      return "Same position";
    }
    const len = sampleOption.resultingLength;
    if (rotation === "half") return `180° rotation → ${len} steps`;
    if (rotation === "quarter") return `90° rotation → ${len} steps`;

    // For exact, check orientation alignment
    const align = sampleOption.orientationAlignment;
    if (align && !align.matches) {
      return `×${align.repetitionsNeeded} to align → ${len} steps`;
    }
    return `True loop → ${len} steps`;
  }

  // Get badge info for exact position options
  function getExactBadgeInfo(option: CircularizationOption): {
    label: string;
    class: string;
    tooltip: string;
  } {
    const align = option.orientationAlignment;
    if (!align) {
      return { label: "1×", class: "exact", tooltip: "Same position" };
    }
    if (align.matches) {
      return {
        label: "✓",
        class: "exact-match",
        tooltip: "Perfect loop - orientations match",
      };
    }
    return {
      label: `${align.repetitionsNeeded}×`,
      class: align.repetitionsNeeded === 2 ? "repeat-2" : "repeat-4",
      tooltip: `Repeat ${align.repetitionsNeeded}× to align orientations`,
    };
  }
</script>

<div
  class="bridge-container"
  class:layout-stabilizing={isLayoutStabilizing}
  class:loading={isLoading}
>
  {#if isLoading}
    <div class="loading-state">
      <ProgressRing percent={-1} size={24} strokeWidth={2} />
      <span>Finding bridge options...</span>
    </div>
  {:else if options.length === 0}
    <div class="empty-state">
      <i class="fas fa-info-circle" aria-hidden="true"></i>
      <p>No bridge options available</p>
    </div>
  {:else}
    <!-- Half Rotation Group (2x length) -->
    {#if halfRotationOptions.length > 0}
      <div class="rotation-group">
        <div class="group-header">
          <span class="multiplier-badge half">2×</span>
          <span class="group-label"
            >{getGroupDescription("half", halfRotationOptions[0])}</span
          >
        </div>
        <div class="bridge-grid">
          {#each halfRotationOptions as option, index (option.bridgeLetters[0] + "-" + option.endPlacement)}
            {@const pictograph = option.pictographData}
            {#if pictograph}
              <button
                class="bridge-option"
                onclick={() => handleBridgeSelect(option)}
                disabled={isLoading}
                style:--letter-border-color={getLetterBorderColorSafe(
                  pictograph.letter
                )}
                style:--animation-delay="{index * 40}ms"
                aria-label="Add {option
                  .bridgeLetters[0]} → {option.resultingLength || ''} steps"
                title="{option.bridgeLetters[0]} → {option.endPlacement}"
              >
                <div class="pictograph-wrapper">
                  <PictographContainer pictographData={pictograph} />
                </div>
                <span class="letter-badge">{option.bridgeLetters[0]}</span>
              </button>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    <!-- Quarter Rotation Group (4x length) -->
    {#if quarterRotationOptions.length > 0}
      <div class="rotation-group">
        <div class="group-header">
          <span class="multiplier-badge quarter">4×</span>
          <span class="group-label"
            >{getGroupDescription("quarter", quarterRotationOptions[0])}</span
          >
        </div>
        <div class="bridge-grid">
          {#each quarterRotationOptions as option, index (option.bridgeLetters[0] + "-" + option.endPlacement)}
            {@const pictograph = option.pictographData}
            {#if pictograph}
              <button
                class="bridge-option"
                onclick={() => handleBridgeSelect(option)}
                disabled={isLoading}
                style:--letter-border-color={getLetterBorderColorSafe(
                  pictograph.letter
                )}
                style:--animation-delay="{index * 40}ms"
                aria-label="Add {option
                  .bridgeLetters[0]} → {option.resultingLength || ''} steps"
                title="{option.bridgeLetters[0]} → {option.endPlacement}"
              >
                <div class="pictograph-wrapper">
                  <PictographContainer pictographData={pictograph} />
                </div>
                <span class="letter-badge">{option.bridgeLetters[0]}</span>
              </button>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    <!-- Exact Match Group -->
    {#if exactOptions.length > 0}
      <div class="rotation-group">
        <div class="group-header">
          <span class="multiplier-badge exact">↺</span>
          <span class="group-label"
            >{getGroupDescription("exact", exactOptions[0])}</span
          >
        </div>
        <div class="bridge-grid">
          {#each exactOptions as option, index (option.bridgeLetters[0] + "-" + option.endPlacement)}
            {@const pictograph = option.pictographData}
            {@const badgeInfo = getExactBadgeInfo(option)}
            {#if pictograph}
              <button
                class="bridge-option"
                onclick={() => handleBridgeSelect(option)}
                disabled={isLoading}
                style:--letter-border-color={getLetterBorderColorSafe(
                  pictograph.letter
                )}
                style:--animation-delay="{index * 40}ms"
                aria-label="Add {option
                  .bridgeLetters[0]} → {option.resultingLength ||
                  ''} steps ({badgeInfo.tooltip})"
                title={badgeInfo.tooltip}
              >
                <div class="pictograph-wrapper">
                  <PictographContainer pictographData={pictograph} />
                </div>
                <div class="option-info">
                  <span class="letter-badge">{option.bridgeLetters[0]}</span>
                  <span class="repeat-badge {badgeInfo.class}"
                    >{badgeInfo.label}</span
                  >
                </div>
              </button>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .bridge-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    padding: 0.5rem;
  }

  /* Fade in after stabilization */
  .bridge-container.layout-stabilizing {
    opacity: 0;
  }

  .bridge-container:not(.layout-stabilizing) {
    animation: fadeIn var(--duration-normal) ease-out forwards;
  }

  /* Rotation group section */
  .rotation-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.25rem;
  }

  .multiplier-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.75rem;
    padding: 0.125rem 0.5rem;
    border-radius: 0.375rem;
    font-size: var(--font-size-sm, 14px);
    font-weight: 700;
    font-family: monospace;
  }

  .multiplier-badge.half {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 20%,
      transparent
    );
    color: var(--semantic-success, #22c55e);
    border: 1px solid
      color-mix(in srgb, var(--semantic-success, #22c55e) 30%, transparent);
  }

  .multiplier-badge.quarter {
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f97316) 20%,
      transparent
    );
    color: var(--semantic-warning, #f97316);
    border: 1px solid
      color-mix(in srgb, var(--semantic-warning, #f97316) 30%, transparent);
  }

  .multiplier-badge.exact {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 20%,
      transparent
    );
    color: var(--theme-accent, #6366f1);
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 30%, transparent);
  }

  .group-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  /* Grid with ~1/4 panel width per pictograph */
  .bridge-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
    width: 100%;
  }

  /* 3 columns on medium-narrow containers */
  @media (max-width: 360px) {
    .bridge-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  /* 2 columns on very narrow containers */
  @media (max-width: 280px) {
    .bridge-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .loading-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem 1rem;
    text-align: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 0.875rem; /* 14px */
  }

  .empty-state i {
    font-size: 1.5rem;
    opacity: 0.6;
  }

  .bridge-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);

    /* Entrance animation */
    opacity: 0;
    transform: scale(0.9);
    animation: scaleIn var(--duration-normal) cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    animation-delay: var(--animation-delay, 0ms);

    /* Larger touch target for bigger pictographs */
    min-height: 80px;
  }

  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .bridge-option:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Hover state for desktop */
  @media (hover: hover) {
    .bridge-option:hover:not(:disabled) {
      border-color: var(--letter-border-color, var(--theme-accent, #6366f1));
      background: var(--theme-hover-bg, rgba(255, 255, 255, 0.08));
      transform: scale(1.05);
    }
  }

  /* Active/pressed state */
  .bridge-option:active:not(:disabled) {
    transform: scale(0.95);
    transition-duration: var(--duration-instant);
  }

  /* Focus state for accessibility */
  .bridge-option:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .pictograph-wrapper {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 0.25rem;
    overflow: hidden;
  }

  /* Ensure pictograph fills wrapper */
  .pictograph-wrapper :global(.pictograph),
  .pictograph-wrapper :global(.pictograph svg) {
    width: 100%;
    height: 100%;
    display: block;
  }

  .letter-badge {
    font-size: 0.75rem; /* 12px minimum */
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    line-height: 1;
  }

  .option-info {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .repeat-badge {
    font-size: 0.75rem; /* 12px minimum */
    font-weight: 700;
    padding: 0.0625rem 0.25rem;
    border-radius: 0.25rem;
    line-height: 1.2;
  }

  .repeat-badge.exact-match {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 30%,
      transparent
    );
    color: var(--semantic-success, #22c55e);
  }

  .repeat-badge.repeat-2 {
    background: color-mix(
      in srgb,
      var(--semantic-warning, #fbbf24) 30%,
      transparent
    );
    color: var(--semantic-warning, #fbbf24);
  }

  .repeat-badge.repeat-4 {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 30%,
      transparent
    );
    color: var(--semantic-error, #ef4444);
  }

  .repeat-badge.exact {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 20%,
      transparent
    );
    color: var(--theme-accent, #6366f1);
  }

  /* Reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .bridge-container:not(.layout-stabilizing) {
      animation: none;
      opacity: 1;
    }

    .bridge-option {
      animation: none;
      opacity: 1;
      transform: scale(1);
    }

    .bridge-option:hover:not(:disabled),
    .bridge-option:active:not(:disabled) {
      transform: none;
    }

  }
</style>
