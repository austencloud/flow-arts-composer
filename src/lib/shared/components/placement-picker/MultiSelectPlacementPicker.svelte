<!--
MultiSelectPlacementPicker.svelte - Grid for toggling placements on/off

Displays all 16 placements with toggle behavior:
- Enabled (bright): Placement will be used for generation
- Disabled (dimmed): Placement is blocked from use

Uses blocklist approach: placements in blockedPlacements are excluded.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import {
    GridMode,
    GridPlacement,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { onMount } from "svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { getLetterBorderColorSafe } from "$lib/shared/pictograph/shared/utils/letter-border-utils";
  import { createStartPlacementVariations } from "./start-placement-utils";
  import { startPlacementManager } from "$lib/shared/create/services/start-placement-manager";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import {
    blockAllExcept,
    hasSameBlockedPlacements,
    toggleBlockedPlacement,
  } from "./placement-selection";

  interface PlacementSelectionPreset {
    id: string;
    label: string;
    blockedPlacements: GridPlacement[];
  }

  let {
    blockedPlacements = [],
    onBlockedChange,
    gridMode: gridModeProp = GridMode.DIAMOND,
    leftStartOrientation = Orientation.IN,
    rightStartOrientation = Orientation.IN,
    presets = [],
  } = $props<{
    blockedPlacements: GridPlacement[];
    onBlockedChange: (blocked: GridPlacement[]) => void;
    gridMode?: GridMode;
    leftStartOrientation?: Orientation;
    rightStartOrientation?: Orientation;
    /** Named shortcuts shown beside All and Choose one. */
    presets?: PlacementSelectionPreset[];
  }>();

  // State
  let variations = $state<PictographData[]>([]);
  let hapticService: HapticFeedback | null = $state(null);
  let isLoading = $state(true);
  let selectionMode = $state<"custom" | "one" | null>(null);
  let customNeedsFirstPlacement = $state(false);

  // Convert blockedPlacements to Set for O(1) lookup
  const blockedSet = $derived(new Set(blockedPlacements));
  const allPlacements = $derived(
    variations.map((variation) => variation.startPlacement as GridPlacement)
  );

  // Load variations based on grid mode (reactive to prop changes)
  function loadVariations(mode: GridMode) {
    selectionMode = null;
    customNeedsFirstPlacement = false;
    variations = startPlacementManager.getAllStartPlacementVariations(mode);
  }

  // React to gridMode prop changes
  $effect(() => {
    if (!isLoading) {
      loadVariations(gridModeProp);
    }
  });

  onMount(async () => {
    try {
      hapticService = getHapticFeedback() ?? null;
      loadVariations(gridModeProp);
    } catch (error) {
      console.warn(
        "MultiSelectPlacementPicker: Failed to load variations, using fallback:",
        error
      );
      variations = createStartPlacementVariations(gridModeProp);
    } finally {
      isLoading = false;
    }
  });

  /**
   * Toggle a placement's blocked state
   */
  function togglePlacement(placement: GridPlacement) {
    if (selectionMode === "one") {
      hapticService?.trigger("success");
      selectionMode = null;
      onBlockedChange(blockAllExcept(allPlacements, placement));
      return;
    }

    if (selectionMode === "custom" && customNeedsFirstPlacement) {
      hapticService?.trigger("success");
      customNeedsFirstPlacement = false;
      onBlockedChange(blockAllExcept(allPlacements, placement));
      return;
    }

    const newBlocked = toggleBlockedPlacement(
      allPlacements,
      blockedPlacements,
      placement
    );
    if (newBlocked === blockedPlacements) {
      hapticService?.trigger("warning");
      return;
    }

    hapticService?.trigger("selection");
    onBlockedChange(newBlocked);
  }

  function selectAll() {
    hapticService?.trigger("selection");
    selectionMode = null;
    customNeedsFirstPlacement = false;
    onBlockedChange([]);
  }

  function selectPreset(preset: PlacementSelectionPreset) {
    hapticService?.trigger("selection");
    selectionMode = null;
    customNeedsFirstPlacement = false;
    onBlockedChange([...preset.blockedPlacements]);
  }

  function toggleChooseOne() {
    hapticService?.trigger("selection");
    selectionMode = selectionMode === "one" ? null : "one";
    customNeedsFirstPlacement = false;
  }

  function selectCustom() {
    hapticService?.trigger("selection");
    selectionMode = "custom";
    customNeedsFirstPlacement = true;
  }

  /**
   * Check if a placement is enabled (not blocked)
   */
  function isEnabled(placement: GridPlacement): boolean {
    return !blockedSet.has(placement);
  }

  function handleKeydown(e: KeyboardEvent, placement: GridPlacement) {
    if (e.key === "Escape" && selectionMode !== null) {
      e.preventDefault();
      selectionMode = null;
      customNeedsFirstPlacement = false;
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      togglePlacement(placement);
    }
  }

  // Count enabled placements
  const enabledCount = $derived(
    allPlacements.filter((placement) => !blockedSet.has(placement)).length
  );
  const matchingPreset = $derived(
    presets.find((preset) =>
      hasSameBlockedPlacements(blockedPlacements, preset.blockedPlacements)
    )
  );
  const inferredSelection = $derived(
    enabledCount === variations.length
      ? "all"
      : matchingPreset
        ? `preset:${matchingPreset.id}`
        : enabledCount === 1
          ? "one"
          : "custom"
  );
  const activeSelection = $derived(selectionMode ?? inferredSelection);

  // Re-orient each variation's props to the chosen start orientation. Start
  // placements are static holds, so start == end orientation (mirrors how the
  // engine seeds beat 0). Empty until variations load. New object identity per
  // orientation change → PictographContainer re-renders.
  const displayVariations = $derived(
    variations.map((p) => ({
      ...p,
      motions: {
        ...p.motions,
        left: p.motions?.left
          ? {
              ...p.motions.left,
              startOrientation: leftStartOrientation,
              endOrientation: leftStartOrientation,
            }
          : p.motions?.left,
        right: p.motions?.right
          ? {
              ...p.motions.right,
              startOrientation: rightStartOrientation,
              endOrientation: rightStartOrientation,
            }
          : p.motions?.right,
      },
    }))
  );
</script>

<div class="multi-select-grid">
  {#if isLoading}
    <div class="loading-placeholder">
      <span>Loading placements...</span>
    </div>
  {:else}
    <div
      class="quick-actions"
      role="toolbar"
      aria-label="Quick placement choices"
    >
      <FilterChipBase
        label="All"
        icon="fas fa-check-double"
        mode="toggle"
        size="sm"
        active={activeSelection === "all"}
        ariaLabel="Enable all placements"
        onclick={selectAll}
      />
      {#each presets as preset (preset.id)}
        <FilterChipBase
          label={preset.label}
          icon="fas fa-shapes"
          mode="toggle"
          size="sm"
          active={activeSelection === `preset:${preset.id}`}
          ariaLabel={`Use ${preset.label} placements`}
          onclick={() => selectPreset(preset)}
        />
      {/each}
      <FilterChipBase
        label="Custom"
        icon="fas fa-sliders"
        mode="toggle"
        size="sm"
        active={activeSelection === "custom"}
        ariaLabel="Select a custom mix of placements"
        onclick={selectCustom}
      />
      <FilterChipBase
        label="Choose one"
        icon="fas fa-bullseye"
        mode="toggle"
        size="sm"
        active={activeSelection === "one"}
        ariaLabel={selectionMode === "one"
          ? "Cancel choosing one placement"
          : "Choose exactly one placement"}
        onclick={toggleChooseOne}
      />
    </div>

    <!-- Status indicator -->
    <div class="status-row" aria-live="polite" aria-atomic="true">
      <span class="status-text">
        {#if selectionMode === "one"}
          Choose the one placement to keep
        {:else if selectionMode === "custom" && customNeedsFirstPlacement}
          Choose the first placement in your mix
        {:else if selectionMode === "custom"}
          {enabledCount} of {variations.length} placements selected
        {:else if enabledCount === variations.length}
          All {variations.length} placements enabled
        {:else if enabledCount === 0}
          No placements enabled
        {:else}
          {enabledCount} of {variations.length} placements enabled
        {/if}
      </span>
      <span class="hint-text"
        >{selectionMode === "one" || customNeedsFirstPlacement
          ? "Tap a placement"
          : selectionMode === "custom"
            ? "Tap to add or remove"
            : "Tap to toggle"}</span
      >
    </div>

    <!-- Placement grid -->
    <div class="variations-grid">
      {#each displayVariations as variation (variation.id)}
        {@const gridPlacement = variation.startPlacement as GridPlacement}
        {@const enabled = isEnabled(gridPlacement)}
        <button
          class="placement-cell"
          class:enabled
          class:disabled={!enabled}
          onclick={() => togglePlacement(gridPlacement)}
          onkeydown={(e) => handleKeydown(e, gridPlacement)}
          type="button"
          style:--letter-border-color={getLetterBorderColorSafe(
            variation.letter
          )}
          aria-label={selectionMode === "one"
            ? `Use only placement ${variation.startPlacement}`
            : customNeedsFirstPlacement
              ? `Start custom selection with placement ${variation.startPlacement}`
              : enabled && enabledCount === 1
                ? `Placement ${variation.startPlacement} is the only enabled placement`
                : `${enabled ? "Disable" : "Enable"} placement ${variation.startPlacement}`}
          aria-pressed={enabled}
        >
          <div class="pictograph-wrapper">
            <PictographContainer pictographData={variation} />
          </div>
          {#if !enabled}
            <div class="disabled-overlay">
              <svg
                class="x-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </div>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .multi-select-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px 0;
  }

  .quick-actions {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    min-height: var(--min-touch-target, 48px);
    overflow-x: auto;
    padding-inline: 4px;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .quick-actions::-webkit-scrollbar {
    display: none;
  }

  .status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px;
  }

  .status-text {
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text, white);
    font-weight: 500;
  }

  .hint-text {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .loading-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
  }

  .variations-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    padding: 4px;
  }

  .placement-cell {
    position: relative;
    aspect-ratio: 1 / 1;
    min-width: var(--min-touch-target, 48px);
    min-height: var(--min-touch-target, 48px);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    padding: 4px;
    transition: all var(--duration-normal) ease;
    overflow: hidden;
  }

  /* Enabled state - bright and ready */
  .placement-cell.enabled {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.12));
    border-color: var(--letter-border-color, rgba(100, 200, 255, 0.6));
    box-shadow: 0 0 8px rgba(100, 200, 255, 0.15);
  }

  .placement-cell.enabled:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.18));
    border-color: var(--letter-border-color, rgba(100, 200, 255, 0.8));
    transform: scale(1.02);
  }

  /* Disabled state - dimmed with X overlay */
  .placement-cell.disabled {
    background: rgba(0, 0, 0, 0.2);
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    opacity: 0.5;
  }

  .placement-cell.disabled:hover {
    opacity: 0.7;
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .placement-cell:active {
    transform: scale(0.96);
  }

  .pictograph-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pictograph-wrapper :global(.pictograph) {
    width: 100%;
    height: 100%;
  }

  .pictograph-wrapper :global(.pictograph svg) {
    width: 100%;
    height: 100%;
  }

  .disabled-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
  }

  .x-icon {
    width: 32px;
    height: 32px;
    color: rgba(255, 100, 100, 0.8);
  }

  /* Smaller gap on mobile */
  @media (max-width: 380px) {
    .variations-grid {
      gap: 6px;
    }

    .placement-cell {
      padding: 2px;
    }

    .x-icon {
      width: 24px;
      height: 24px;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .placement-cell {
      transition: none;
    }
  }
</style>
