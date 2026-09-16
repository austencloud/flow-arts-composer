<script lang="ts">
  import type { CatalogFamily } from "../../domain/models/Catalog";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";

  interface Props {
    families: readonly CatalogFamily[];
    selectedFamilyIds: string[];
    activePlacement: string | null;
    totalFiltered: number;
    totalSequences: number;
    isLargeCatalog: boolean;
    onFamilyChange: (familyIds: string[]) => void;
    onPlacementChange: (placement: string | null) => void;
  }

  let {
    families,
    selectedFamilyIds,
    activePlacement,
    totalFiltered,
    totalSequences,
    isLargeCatalog,
    onFamilyChange,
    onPlacementChange,
  }: Props = $props();

  const placements = ['alpha', 'beta', 'gamma'] as const;

  function toggleFamily(id: string) {
    const current = new Set(selectedFamilyIds);
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    onFamilyChange([...current]);
  }

  function togglePlacement(placement: string) {
    onPlacementChange(activePlacement === placement ? null : placement);
  }
</script>

<div class="filter-bar">
  <div class="filter-section">
    <span class="filter-label">Family</span>
    <div class="chip-row">
      {#each families as family (family.id)}
        <FilterChipBase
          mode="toggle"
          size="sm"
          label={family.label}
          count={family.sequenceIds.length}
          active={selectedFamilyIds.includes(family.id)}
          onclick={() => toggleFamily(family.id)}
        />
      {/each}
    </div>
  </div>

  <div class="filter-section">
    <span class="filter-label">Start</span>
    <div class="chip-row">
      {#each placements as placement (placement)}
        <FilterChipBase
          mode="toggle"
          size="sm"
          label={placement}
          active={activePlacement === placement}
          onclick={() => togglePlacement(placement)}
        />
      {/each}
    </div>
  </div>

  <div class="count-badge">
    {totalFiltered} of {totalSequences.toLocaleString()} cards
  </div>

  {#if isLargeCatalog && selectedFamilyIds.length === 0}
    <div class="large-catalog-hint">
      Select a family to view cards ({totalSequences.toLocaleString()} total)
    </div>
  {/if}
</div>

<style>
  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
  }

  .filter-section {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .filter-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .count-badge {
    margin-left: auto;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .large-catalog-hint {
    width: 100%;
    text-align: center;
    padding: 12px;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-style: italic;
  }
</style>
