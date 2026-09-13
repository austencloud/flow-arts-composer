<!--
MaxTurnIntensityFilterChip.svelte - Dropdown chip for max-turn-intensity (≤N) filtering.
Shows available turn-intensity ceilings with contextual counts.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import FilterChipBase from "./FilterChipBase.svelte";
  import ChipPopoverOption from "./ChipPopoverOption.svelte";
  import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import type { BrowseFilterValue } from "$lib/shared/persistence/domain/types/filtering-types";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { onMount } from "svelte";

  interface Props {
    activeIntensity: number | null;
    availableIntensities: number[];
    onSelect: (intensity: number | null) => void;
    getFilteredCount?: (candidateType: BrowseFilterType, candidateValue: BrowseFilterValue) => number;
    disabled?: boolean;
  }

  let { activeIntensity, availableIntensities, onSelect, getFilteredCount, disabled = false }: Props = $props();

  let isOpen = $state(false);
  let hapticService: HapticFeedback | null = null;

  onMount(() => {
    hapticService = getHapticFeedback() ?? null;
  });

  // Turn ceilings can be halves (1.5), so render "≤N" verbatim — never coerce to an integer.
  const fmt = (n: number) => `≤${n}`;

  const label = $derived(activeIntensity !== null ? fmt(activeIntensity) : t('browse_chip_max_turns'));
  const isActive = $derived(activeIntensity !== null);

  // Compute counts lazily when dropdown is open
  const intensityCounts = $derived.by(() => {
    if (!isOpen || !getFilteredCount) return null;
    const counts: Record<number, number> = {};
    for (const intensity of availableIntensities) {
      counts[intensity] = getFilteredCount(BrowseFilterType.MAX_TURN_INTENSITY, intensity);
    }
    return counts;
  });

  function handleToggle() {
    isOpen = !isOpen;
  }

  function handleSelect(intensity: number | null) {
    hapticService?.trigger("selection");
    onSelect(intensity);
    isOpen = false;
  }

  function handlePointerDownOutside(event: PointerEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest(".max-turn-intensity-chip-wrapper")) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (!isOpen) return;
    document.addEventListener("pointerdown", handlePointerDownOutside, true);
    return () => document.removeEventListener("pointerdown", handlePointerDownOutside, true);
  });
</script>

{#if availableIntensities.length > 0}
  <div class="max-turn-intensity-chip-wrapper">
    <FilterChipBase
      {label}
      icon="fas fa-arrows-spin"
      active={isActive}
      chipColor="var(--max-turn-intensity-chip-color)"
      mode="dropdown"
      expanded={isOpen}
      ondismiss={() => (isOpen = false)}
      {disabled}
      onclick={handleToggle}
      ghostKind="browse-filter"
    >
      {#snippet children()}
        <ChipPopoverOption
          label={t('browse_all_turn_intensities')}
          selected={activeIntensity === null}
          ghostKind="filter-option"
          onclick={() => handleSelect(null)}
        />
        {#each availableIntensities as intensity}
          {#if !intensityCounts || (intensityCounts[intensity] ?? 0) > 0}
            <ChipPopoverOption
              label={fmt(intensity)}
              selected={activeIntensity === intensity}
              count={intensityCounts ? (intensityCounts[intensity] ?? 0) : null}
              ghostKind="filter-option"
              onclick={() => handleSelect(intensity)}
            />
          {/if}
        {/each}
      {/snippet}
    </FilterChipBase>
  </div>
{/if}

<style>
  .max-turn-intensity-chip-wrapper {
    /* Single source for this chip's accent — consumed both by FilterChipBase
       (via the chipColor prop) and by the selected-option color below.
       Distinct from Level (--semantic-info, blue) and Length (#f59e0b, amber —
       the same hex as --semantic-warning, so that token would collide). */
    --max-turn-intensity-chip-color: var(--semantic-success);
    --chip-option-color: var(--max-turn-intensity-chip-color);
    position: relative;
  }
</style>
