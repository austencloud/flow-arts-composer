<!--
  Gallery Redesign — test harness for the unified gallery front door.

  Renders the real GalleryDrill (page variant) handing off to the real
  BrowsePanel, mirroring BrowseModule's wiring: one browse grammar for
  everything, Timing & Direction included (family filter + alphabet band +
  turn explorer live in GalleryTab; this harness exercises drill → grid).
  persistKey: null so this harness never touches the real gallery's saved
  state. Real components throughout — no fakes.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import GalleryDrill from "#lib/features/browse/gallery-home/GalleryDrill.svelte";
  import BrowsePanel from "#lib/shared/browse/components/BrowsePanel.svelte";
  import { createBrowseEngine } from "#lib/shared/browse/engine/create-browse-engine.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  let mode = $state<"drill" | "grid">("drill");

  const engine = createBrowseEngine({
    persistKey: null,
    initialSource: "community",
    sections: true,
    allowSourceToggle: true,
    sources: ["community", "my-library"],
  });

  onMount(() => {
    engine.initialize();
    return () => engine.destroy();
  });

  function handleSelect(_sequence: SequenceData) {}
</script>

<svelte:head><title>Gallery — front door · test</title></svelte:head>

<div class="wrap">
  {#if mode === "drill"}
    <GalleryDrill
      pool={engine.allSequences}
      getCount={(type, value) => engine.getFilteredCount(type, value)}
      onApply={(type, value, label, color) => {
        engine.clearUserFilters();
        engine.addFilter(type, value, label, color ?? "#6aa0ff");
        mode = "grid";
      }}
      onShowAll={() => {
        engine.clearUserFilters();
        mode = "grid";
      }}
      onSearch={(q) => {
        engine.clearUserFilters();
        engine.setSearch(q);
        mode = "grid";
      }}
    />
  {:else}
    <BrowsePanel
      {engine}
      layout="fullpage"
      onSelect={handleSelect}
      onBack={() => {
        engine.clearUserFilters();
        engine.setSearch("");
        mode = "drill";
      }}
      backLabel="Start here"
    />
  {/if}
</div>

<style>
  .wrap {
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--theme-bg, #0b0e16);
    overflow: hidden;
  }
  .wrap :global(.browse-panel) { flex: 1; min-height: 0; }
</style>
