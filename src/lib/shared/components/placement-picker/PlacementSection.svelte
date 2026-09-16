<!--
PlacementSection.svelte - Collapsible section for selecting a placement (start or end)
Uses 4x4 pictograph grid with all 16 variations
50px touch targets, modern Material 2026 design
-->
<script lang="ts">
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import PlacementPickerGrid from "./PlacementPickerGrid.svelte";

  let {
    title,
    description,
    currentPlacement,
    onPlacementChange,
    gridMode = GridMode.DIAMOND,
    disabled = false,
    disabledReason = "",
  } = $props<{
    title: string;
    description: string;
    currentPlacement: PictographData | null;
    onPlacementChange: (placement: PictographData | null) => void;
    gridMode?: GridMode;
    disabled?: boolean;
    disabledReason?: string;
  }>();

  let isExpanded = $state(false);

  function toggleExpanded() {
    if (disabled) return;
    isExpanded = !isExpanded;
  }

  // Get display value from the current placement
  const displayValue = $derived.by(() => {
    if (!currentPlacement) return "Any";
    // Show the start placement name (e.g., "Alpha1", "Beta3", "Gamma11")
    return currentPlacement.startPlacement || currentPlacement.letter || "?";
  });

  const hasSelection = $derived(currentPlacement !== null);
</script>

<section class="placement-section" class:disabled>
  <button
    class="section-header"
    onclick={toggleExpanded}
    aria-expanded={isExpanded}
    aria-controls="placement-section-content"
    aria-disabled={disabled}
    type="button"
    {disabled}
  >
    <div class="header-content">
      <h3 class="section-title">{title}</h3>
      <p class="section-description">
        {#if disabled && disabledReason}
          {disabledReason}
        {:else}
          {description}
        {/if}
      </p>
    </div>
    <div class="header-value">
      {#if disabled}
        <span class="value-locked">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d="M12 17a2 2 0 002-2v-2a2 2 0 00-4 0v2a2 2 0 002 2zm6-9h-1V6a5 5 0 00-10 0v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zM8.9 6a3.1 3.1 0 016.2 0v2H8.9V6z"
            />
          </svg>
        </span>
      {:else if hasSelection}
        <span class="value-badge">{displayValue}</span>
      {:else}
        <span class="value-any">Any</span>
      {/if}
      {#if !disabled}
        <svg
          class="chevron"
          class:expanded={isExpanded}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      {/if}
    </div>
  </button>

  {#if isExpanded && !disabled}
    <div id="placement-section-content" class="section-content">
      <PlacementPickerGrid {currentPlacement} {onPlacementChange} {gridMode} />
    </div>
  {/if}
</section>

<style>
  .placement-section {
    background: var(--theme-card-bg);
  }

  .placement-section.disabled {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .section-header {
    width: 100%;
    min-height: 72px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    transition: background var(--duration-normal) ease;
    text-align: left;
  }

  .section-header:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.05));
  }

  .section-header:active:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .section-header:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .header-content {
    flex: 1;
    min-width: 0;
  }

  .section-title {
    font-size: var(--font-size-base);
    font-weight: 600;
    margin: 0 0 4px 0;
    color: white;
  }

  .section-description {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    margin: 0;
  }

  .header-value {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .value-badge {
    padding: 6px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.2));
    border-radius: 16px;
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .value-any {
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  .value-locked {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border-radius: 50%;
    color: var(--theme-text-dim);
  }

  .value-locked svg {
    width: 18px;
    height: 18px;
  }

  .chevron {
    width: 24px;
    height: 24px;
    transition: transform var(--duration-normal) ease;
  }

  .chevron.expanded {
    transform: rotate(180deg);
  }

  .section-content {
    padding: 0 24px 20px;
  }

  /* Mobile responsiveness */
  @media (max-width: 380px) {
    .section-header {
      padding: 14px 20px;
    }

    .section-content {
      padding: 0 20px 16px;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .chevron {
      transition: none;
    }
  }
</style>
