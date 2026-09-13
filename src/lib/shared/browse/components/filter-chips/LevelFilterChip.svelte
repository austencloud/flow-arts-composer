<!--
LevelFilterChip.svelte - Dropdown chip for difficulty level filtering.
Options: All, Level 1, Level 2, Level 3. Each shows contextual count.
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
    activeLevel: number | null;
    onSelect: (level: number | null) => void;
    getFilteredCount?: (candidateType: BrowseFilterType, candidateValue: BrowseFilterValue) => number;
  }

  let { activeLevel, onSelect, getFilteredCount }: Props = $props();

  let isOpen = $state(false);
  let hapticService: HapticFeedback | null = null;

  onMount(() => {
    hapticService = getHapticFeedback() ?? null;
  });

  const label = $derived(activeLevel ? t('browse_filter_level', { level: String(activeLevel) }) : t('browse_chip_level'));
  const isActive = $derived(activeLevel !== null);

  // Compute counts lazily when dropdown is open
  const levelCounts = $derived.by(() => {
    if (!isOpen || !getFilteredCount) return null;
    return {
      1: getFilteredCount(BrowseFilterType.DIFFICULTY, 1),
      2: getFilteredCount(BrowseFilterType.DIFFICULTY, 2),
      3: getFilteredCount(BrowseFilterType.DIFFICULTY, 3),
    };
  });

  const levels: { value: number | null; label: string }[] = [
    { value: null, label: t('browse_all_levels') },
    { value: 1, label: t('browse_level_n', { n: '1' }) },
    { value: 2, label: t('browse_level_n', { n: '2' }) },
    { value: 3, label: t('browse_level_n', { n: '3' }) },
  ];

  function handleToggle() {
    isOpen = !isOpen;
  }

  function handleSelect(level: number | null) {
    hapticService?.trigger("selection");
    onSelect(level);
    isOpen = false;
  }

  function handlePointerDownOutside(event: PointerEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest(".level-chip-wrapper")) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (!isOpen) return;
    document.addEventListener("pointerdown", handlePointerDownOutside, true);
    return () => document.removeEventListener("pointerdown", handlePointerDownOutside, true);
  });
</script>

<div class="level-chip-wrapper">
  <FilterChipBase
    {label}
    icon="fas fa-layer-group"
    active={isActive}
    chipColor="var(--semantic-info)"
    mode="dropdown"
    expanded={isOpen}
    ondismiss={() => (isOpen = false)}
    onclick={handleToggle}
    ghostKind="browse-filter"
  >
    {#snippet children()}
      {#each levels as level}
        <ChipPopoverOption
          label={level.label}
          selected={activeLevel === level.value}
          count={level.value !== null && levelCounts
            ? levelCounts[level.value as 1 | 2 | 3]
            : null}
          ghostKind="filter-option"
          onclick={() => handleSelect(level.value)}
        />
      {/each}
    {/snippet}
  </FilterChipBase>
</div>

<style>
  /* The chip's accent, inherited by every option row in its popover — the
     popover is a DOM child of this wrapper even though it paints on top of the
     page. */
  .level-chip-wrapper {
    --chip-option-color: var(--semantic-info);
    position: relative;
  }
</style>
