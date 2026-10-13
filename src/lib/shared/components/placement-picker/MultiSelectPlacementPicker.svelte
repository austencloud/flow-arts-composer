<!--
MultiSelectPlacementPicker.svelte - Grid for toggling placements on/off

Displays all 16 placements with toggle behavior:
- Enabled (bright): Placement will be used for generation
- Disabled (dimmed): Placement is blocked from use

Uses blocklist approach: placements in blockedPlacements are excluded.

Two layouts. `stack` (default) puts the quick choices and status line above
the grid and any `aside` content below it. `split` does the same on a narrow
pane, and from 40rem of its own width moves the grid to the left and the
choices, status and aside into a column beside it, so a wide pane spends its
height on the grid instead of on a band of chips. The host sizes the grid
through two custom properties, --placement-grid-size (stacked) and
--placement-grid-split-size (side by side); both default to the full width.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import {
    GridMode,
    GridPlacement,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { onMount, type Snippet } from "svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { getLetterBorderColorSafe } from "#lib/shared/pictograph/shared/utils/letter-border-utils.js";
  import {
    loadStartPlacementVariations,
    orientStartPlacementVariations,
  } from "./placement-variations";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
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
    layout = "stack",
    aside,
  } = $props<{
    blockedPlacements: GridPlacement[];
    onBlockedChange: (blocked: GridPlacement[]) => void;
    gridMode?: GridMode;
    leftStartOrientation?: Orientation;
    rightStartOrientation?: Orientation;
    /** Named shortcuts shown beside All and Choose one. */
    presets?: PlacementSelectionPreset[];
    /** `split` moves the controls beside the grid when there is room. */
    layout?: "stack" | "split";
    /** Extra controls that belong with the grid, such as start orientation. */
    aside?: Snippet;
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
    variations = loadStartPlacementVariations(mode);
  }

  // React to gridMode prop changes
  $effect(() => {
    if (!isLoading) {
      loadVariations(gridModeProp);
    }
  });

  onMount(() => {
    hapticService = getHapticFeedback() ?? null;
    loadVariations(gridModeProp);
    isLoading = false;
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

  // Re-orient each variation's props to the chosen start orientation (shared
  // with the Customize overview, so its preview matches this grid). Empty
  // until variations load.
  const displayVariations = $derived(
    orientStartPlacementVariations(
      variations,
      leftStartOrientation,
      rightStartOrientation
    )
  );
</script>

<div class="multi-select-grid" class:split={layout === "split"}>
  {#if isLoading}
    <div class="loading-placeholder">
      <span>{t("shared_placement_loading")}</span>
    </div>
  {:else}
    <div class="picker-layout">
      <div class="picker-controls">
        <div
          class="quick-actions"
          role="toolbar"
          aria-label={t("shared_placement_quick_choices")}
        >
          <FilterChipBase
            label={t("create_option_all")}
            icon="fas fa-check-double"
            mode="toggle"
            size="sm"
            active={activeSelection === "all"}
            ariaLabel={t("shared_placement_enable_all")}
            onclick={selectAll}
          />
          {#each presets as preset (preset.id)}
            <FilterChipBase
              label={preset.label}
              icon="fas fa-shapes"
              mode="toggle"
              size="sm"
              active={activeSelection === `preset:${preset.id}`}
              ariaLabel={t("shared_placement_use_preset", {
                name: preset.label,
              })}
              onclick={() => selectPreset(preset)}
            />
          {/each}
          <FilterChipBase
            label={t("compose_custom")}
            icon="fas fa-sliders"
            mode="toggle"
            size="sm"
            active={activeSelection === "custom"}
            ariaLabel={t("shared_placement_custom_mix")}
            onclick={selectCustom}
          />
          <FilterChipBase
            label={t("shared_placement_choose_one")}
            icon="fas fa-bullseye"
            mode="toggle"
            size="sm"
            active={activeSelection === "one"}
            ariaLabel={selectionMode === "one"
              ? t("shared_placement_cancel_one")
              : t("shared_placement_exactly_one")}
            onclick={toggleChooseOne}
          />
        </div>

        <!-- Status indicator -->
        <div class="status-row" aria-live="polite" aria-atomic="true">
          <span class="status-text">
            {#if selectionMode === "one"}
              {t("shared_placement_keep_one")}
            {:else if selectionMode === "custom" && customNeedsFirstPlacement}
              {t("shared_placement_first")}
            {:else if selectionMode === "custom"}
              {t("shared_placement_selected", {
                count: enabledCount,
                total: variations.length,
              })}
            {:else if enabledCount === variations.length}
              {t("shared_placement_all_enabled", { total: variations.length })}
            {:else if enabledCount === 0}
              {t("shared_placement_none")}
            {:else}
              {t("shared_placement_enabled", {
                count: enabledCount,
                total: variations.length,
              })}
            {/if}
          </span>
          <span class="hint-text"
            >{selectionMode === "one" || customNeedsFirstPlacement
              ? t("shared_placement_tap")
              : selectionMode === "custom"
                ? t("shared_placement_add_remove")
                : t("shared_placement_toggle")}</span
          >
        </div>
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
              ? t("shared_placement_only", {
                  position: gridPlacement,
                })
              : customNeedsFirstPlacement
                ? t("shared_placement_start", {
                    position: gridPlacement,
                  })
                : enabled && enabledCount === 1
                  ? t("shared_placement_last", {
                      position: gridPlacement,
                    })
                  : t(
                      enabled
                        ? "shared_placement_disable"
                        : "shared_placement_enable",
                      { position: gridPlacement }
                    )}
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

      {#if aside}
        <div class="picker-aside">{@render aside()}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .multi-select-grid {
    container: placement-picker / inline-size;
    padding: 8px 0;
  }

  .picker-layout {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .picker-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  /* Wraps rather than scrolls: a sideways scroller hid "Choose one" past the
     edge of a 375px phone with nothing to say it was there. */
  .quick-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    min-height: var(--min-touch-target, 48px);
    padding-inline: 4px;
  }

  .status-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    column-gap: 12px;
    row-gap: 2px;
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
    width: var(--placement-grid-size, 100%);
    margin-inline: auto;
  }

  /* Side by side. The grid takes what the host allows, leaving the control
     column at least 16rem; the column sits at the grid's top edge so the
     chips stay next to the cells they act on. */
  @container placement-picker (min-width: 40rem) {
    .split .picker-layout {
      display: grid;
      grid-template-columns: auto minmax(16rem, 24rem);
      grid-template-rows: auto 1fr;
      grid-template-areas:
        "grid controls"
        "grid aside";
      justify-content: center;
      align-items: start;
      column-gap: 24px;
      row-gap: 16px;
    }

    .split .variations-grid {
      grid-area: grid;
      width: min(
        var(--placement-grid-split-size, 100cqw),
        calc(100cqw - 16rem - 24px)
      );
      margin-inline: 0;
    }

    .split .picker-controls {
      grid-area: controls;
    }

    .split .picker-aside {
      grid-area: aside;
    }

    .split .status-row {
      flex-direction: column;
      align-items: flex-start;
    }
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
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard);
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
