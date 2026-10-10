<script lang="ts">
  // WING 5 — Library & Browse. Three real primitives, all static-safe:
  //  · filter bar   → SegmentedControl + FilterChipBase (the sanctioned chip
  //                   primitives; independent toggles + one single-select group)
  //  · browse grid  → GuidePictograph tiles fed from the CHOSEN_MANDALAS fixture
  //                   already in this harness (no Firestore, eager render)
  //  · shelf        → CollectionCard (readonly) over the four FOUNDING smart
  //                   collections, built in-memory by toSyntheticCollection — the
  //                   real production TKA 1/2/3 + Book decks, zero Firestore round-trip.
  // On the live /composer the grid/chips bind to a BrowseEngine; here the chips
  // are a visual tease (local state) so the section evaluates signed-out.
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import CollectionCard from "#lib/features/browse/collections/components/CollectionCard.svelte";
  import {
    FOUNDING_SMART_COLLECTIONS,
    toSyntheticCollection,
  } from "#lib/features/browse/collections/config/founding-collections.js";
  import GuidePictograph from "../../guide/level-1/_components/GuidePictograph.svelte";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { CHOSEN_MANDALAS } from "./chosen-mandalas";

  // One representative pictograph per curated sequence → a browse-grid tease.
  const tiles = CHOSEN_MANDALAS.slice(0, 12).map((m) => ({
    id: m.id,
    step: (m.steps[1] ?? m.steps[0]) as unknown as PictographData,
  }));

  // The real production smart collections (TKA 1/2/3 + Book), in-memory.
  const collections = FOUNDING_SMART_COLLECTIONS.map(toSyntheticCollection);

  // Filter-bar tease — local visual state; the live page wires these to the engine.
  let gridMode = $state<"all" | "diamond" | "box">("all");
  let loopsOnly = $state(false);
  let level2 = $state(false);
  let reversed = $state(false);
</script>

<div class="library">
  <div class="filter-bar">
    <div class="seg-wrap">
      <SegmentedControl
        options={[
          { value: "all", label: "All" },
          { value: "diamond", label: "Diamond" },
          { value: "box", label: "Box" },
        ]}
        value={gridMode}
        onchange={(v) => (gridMode = v)}
        color="accent"
        size="sm"
      />
    </div>
    <FilterChipBase label="Loops only" mode="toggle" size="sm" active={loopsOnly} onclick={() => (loopsOnly = !loopsOnly)} chipColor="var(--semantic-success)" />
    <FilterChipBase label="Level 2" mode="toggle" size="sm" count={57} active={level2} onclick={() => (level2 = !level2)} />
    <FilterChipBase label="Reversed" mode="toggle" size="sm" active={reversed} onclick={() => (reversed = !reversed)} chipColor="var(--semantic-info)" />
  </div>

  <div class="browse-grid">
    {#each tiles as t (t.id)}
      <div class="tile">
        <GuidePictograph data={t.step} size="md" eager={true} bordered />
      </div>
    {/each}
  </div>

  <p class="shelf-head">Collections, including Smart Collections that fill themselves</p>
  <div class="shelf">
    {#each collections as c (c.id)}
      <CollectionCard collection={c} readonly onOpen={() => {}} />
    {/each}
  </div>
</div>

<style>
  .library {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: clamp(1.4rem, 2vw, 2.4rem);
  }

  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
  }
  /* Keep the single-select group compact instead of stretching the full band. */
  .seg-wrap {
    width: min(340px, 100%);
  }

  .browse-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: clamp(0.6rem, 1vw, 1rem);
  }
  .tile {
    aspect-ratio: 1;
    min-width: 0;
  }
  .tile :global(> *) {
    width: 100%;
    height: 100%;
  }

  .shelf-head {
    margin: 0.4rem 0 0;
    font-size: clamp(0.9rem, 0.85rem + 0.2vw, 1.05rem);
    font-weight: 600;
    color: oklch(0.82 0.012 270);
  }
  .shelf {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: clamp(0.8rem, 1.2vw, 1.2rem);
  }
</style>
