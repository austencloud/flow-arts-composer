<!--
LengthFilterChip.svelte - Dropdown chip for sequence length filtering.
Shows available lengths with contextual counts.
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
    activeLength: number | null;
    availableLengths: number[];
    onSelect: (length: number | null) => void;
    getFilteredCount?: (candidateType: BrowseFilterType, candidateValue: BrowseFilterValue) => number;
    disabled?: boolean;
  }

  let { activeLength, availableLengths, onSelect, getFilteredCount, disabled = false }: Props = $props();

  let isOpen = $state(false);
  let hapticService: HapticFeedback | null = null;

  onMount(() => {
    hapticService = getHapticFeedback() ?? null;
  });

  const label = $derived(activeLength ? t('browse_n_steps', { count: String(activeLength) }) : t('browse_chip_length'));
  const isActive = $derived(activeLength !== null);

  // Compute counts lazily when dropdown is open
  const lengthCounts = $derived.by(() => {
    if (!isOpen || !getFilteredCount) return null;
    const counts: Record<number, number> = {};
    for (const len of availableLengths) {
      counts[len] = getFilteredCount(BrowseFilterType.LENGTH, len);
    }
    return counts;
  });

  function handleToggle() {
    isOpen = !isOpen;
  }

  function handleSelect(length: number | null) {
    hapticService?.trigger("selection");
    onSelect(length);
    isOpen = false;
  }

  function handlePointerDownOutside(event: PointerEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest(".length-chip-wrapper")) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (!isOpen) return;
    document.addEventListener("pointerdown", handlePointerDownOutside, true);
    return () => document.removeEventListener("pointerdown", handlePointerDownOutside, true);
  });
</script>

<div class="length-chip-wrapper">
  <FilterChipBase
    {label}
    icon="fas fa-ruler-horizontal"
    active={isActive}
    chipColor="var(--length-chip-color)"
    mode="dropdown"
    expanded={isOpen}
    ondismiss={() => (isOpen = false)}
    {disabled}
    onclick={handleToggle}
    ghostKind="browse-filter"
  >
    {#snippet children()}
      <ChipPopoverOption
        label={t('browse_all_lengths')}
        selected={activeLength === null}
        ghostKind="filter-option"
        onclick={() => handleSelect(null)}
      />
      {#each availableLengths as length}
        {#if !lengthCounts || (lengthCounts[length] ?? 0) > 0}
          <ChipPopoverOption
            label={t('browse_n_steps', { count: String(length) })}
            selected={activeLength === length}
            count={lengthCounts ? (lengthCounts[length] ?? 0) : null}
            ghostKind="filter-option"
            onclick={() => handleSelect(length)}
          />
        {/if}
      {/each}
    {/snippet}
  </FilterChipBase>
</div>

<style>
  .length-chip-wrapper {
    /* Single source for this chip's accent — consumed both by FilterChipBase
       (via the chipColor prop) and by every option row in the popover, which is
       a DOM child of this wrapper even though it paints on top of the page. */
    --length-chip-color: #f59e0b;
    --chip-option-color: var(--length-chip-color);
    position: relative;
  }
</style>
