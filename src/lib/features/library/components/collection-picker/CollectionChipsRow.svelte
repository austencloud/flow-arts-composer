<!--
CollectionChipsRow.svelte

Collection chips over a picker's browse engine: All (no collection filter) +
one chip per collection, driving the engine's COLLECTION filter. Collections
are the PRIMARY organization of the library, so pickers surface them here — a
persistent row above the grid — not buried in the filter sheet.

OWNERSHIP routes the chips: My Library shows your own collections, Community
shows every public collection (their members are public sequences). Counts never
route — your published work also lives in the
community pool, so count-based routing surfaced your own collections on
Community, which reads as a bug. Within the routed set, a chip only renders
when its live count against the current pool (and current filters) is
nonzero — the drill's never-a-dead-end rule. That keeps the row quiet: apply
Favorites and only collections with favorited members remain.

Exactly-one-or-none semantics: the engine keys COLLECTION one-per-type, so
picking a chip replaces the previous pick; re-tapping the active chip (or
tapping All) clears it. Chip-primitives routing: at-most-one-that-clears =
FilterChipBase toggles, not SegmentedControl. The active chip always renders,
even at zero, so it can be dismissed.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { BrowseEngine } from "$lib/shared/browse/engine/types";
  import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import { collectionsState } from "$lib/features/library/state/collections-state.svelte";
  import { communityCollectionsState } from "$lib/features/browse/collections/state/community-collections-state.svelte";

  let {
    engine,
    onAddCollection,
    addCollectionBusy = false,
  }: {
    engine: BrowseEngine;
    onAddCollection?: (collectionId: string) => void;
    addCollectionBusy?: boolean;
  } = $props();

  $effect(() => {
    collectionsState.ensureStarted();
    void communityCollectionsState.ensureLoaded();
  });

  let lastCommunitySignature: string | null = null;
  $effect(() => {
    const signature = communityCollectionsState.items
      .map(
        (item) =>
          `${item.ownerId}/${item.collection.id}:${item.collection.updatedAt.getTime()}:${item.collection.sequenceCount}`
      )
      .join("|");
    if (
      engine.source !== "community" ||
      !engine.sectionsReady ||
      communityCollectionsState.loading ||
      signature === lastCommunitySignature
    ) {
      return;
    }

    lastCommunitySignature = signature;
    void engine.refresh();
  });

  const COLLECTION_KEY = String(BrowseFilterType.COLLECTION);

  const activeCollectionId = $derived.by(() => {
    const f = engine.activeFilters.get(COLLECTION_KEY);
    return f ? String(f.value) : null;
  });

  const candidates = $derived(
    engine.source === "my-library"
      ? collectionsState.collections.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          totalCount: c.sequenceCount,
        }))
      : communityCollectionsState.items.map((i) => ({
          id: i.collection.id,
          name: i.collection.name,
          color: i.collection.color,
          totalCount: i.collection.sequenceCount,
        }))
  );

  const chips = $derived(
    candidates
      .map((c) => ({
        ...c,
        count: engine.getFilteredCount(BrowseFilterType.COLLECTION, c.id),
      }))
      .filter((c) => c.count > 0 || c.id === activeCollectionId)
  );
  const activeCandidate = $derived(
    candidates.find((candidate) => candidate.id === activeCollectionId) ?? null
  );

  // Switching pools with a collection applied would leave a filter for a
  // collection the new pool doesn't offer — a zero-result grid explained
  // only by a chip in the filter bar. Clear it instead. (Also covers
  // unfollowing / deleting the applied collection.) Skipped while either
  // list is still loading, so a restore doesn't clear a valid filter.
  $effect(() => {
    const id = activeCollectionId;
    if (!id) return;
    if (collectionsState.loading || communityCollectionsState.loading) return;
    if (!candidates.some((c) => c.id === id)) {
      engine.removeFilter(COLLECTION_KEY);
    }
  });

  function pick(collectionId: string, name: string, color?: string) {
    if (activeCollectionId === collectionId) {
      engine.removeFilter(COLLECTION_KEY);
    } else {
      engine.addFilter(
        BrowseFilterType.COLLECTION,
        collectionId,
        name,
        color ?? "#c084fc"
      );
    }
  }
</script>

{#if chips.length > 0}
  <div
    class="collection-chips-row"
    role="group"
    aria-label={t("library_ui_filter_by_collection")}
  >
    <FilterChipBase
      mode="toggle"
      label="All"
      active={!activeCollectionId}
      onclick={() => engine.removeFilter(COLLECTION_KEY)}
      size="sm"
    />
    {#each chips as col (col.id)}
      <FilterChipBase
        mode="toggle"
        label={col.name}
        count={col.count}
        active={activeCollectionId === col.id}
        chipColor={col.color ?? "#c084fc"}
        onclick={() => pick(col.id, col.name, col.color)}
        size="sm"
      />
    {/each}
    {#if activeCandidate && onAddCollection}
      <FilterChipBase
        mode="action"
        icon="fa-solid fa-plus"
        label="Add collection"
        count={activeCandidate.totalCount}
        chipColor={activeCandidate.color ?? "#c084fc"}
        disabled={addCollectionBusy}
        onclick={() => onAddCollection?.(activeCandidate.id)}
        size="sm"
      />
    {/if}
  </div>
{/if}

<style>
  /* Owns its spacing so hosts render it bare — when the row doesn't render
	   (community source / no collections) there's no ghost wrapper padding.
	   Capped so a long collection list can't crowd out the grid below. */
  .collection-chips-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    flex: 0 0 auto;
    padding: 10px 12px 0;
    max-height: 30%;
    overflow-y: auto;
  }
</style>
