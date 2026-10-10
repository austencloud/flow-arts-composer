<script lang="ts">
  import { TRAIL_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/trail-presets.js";
  import { FIRE_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/fire-presets.js";
  import { BLOOM_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/bloom-presets.js";
  import TrailThumbnail from "#lib/shared/animation-engine/components/effects-panel/thumbnails/TrailThumbnail.svelte";
  import FireThumbnail from "#lib/shared/animation-engine/components/effects-panel/thumbnails/FireThumbnail.svelte";
  import BloomThumbnail from "#lib/shared/animation-engine/components/effects-panel/thumbnails/BloomThumbnail.svelte";
  import { CHARCOAL_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/charcoal-presets.js";
  import CoalThumbnail from "#lib/shared/animation-engine/components/effects-panel/thumbnails/CoalThumbnail.svelte";
</script>

<div class="page">
  <h2>Coal</h2>
  <div class="grid">
    {#each CHARCOAL_PRESETS as preset (preset.id)}
      <figure>
        <figcaption>{preset.name}</figcaption>
        <div class="tile"><CoalThumbnail {preset} /></div>
      </figure>
    {/each}
  </div>

  <h2>Trails</h2>
  <div class="grid">
    {#each TRAIL_PRESETS as preset (preset.id)}
      <figure>
        <figcaption>{preset.name}</figcaption>
        <div class="tile"><TrailThumbnail {preset} /></div>
      </figure>
    {/each}
  </div>

  <h2>Fire</h2>
  <div class="grid">
    {#each FIRE_PRESETS as preset (preset.id)}
      <figure>
        <figcaption>{preset.name}</figcaption>
        <div class="tile"><FireThumbnail {preset} /></div>
      </figure>
    {/each}
  </div>

  <h2>Bloom</h2>
  <div class="grid">
    {#each BLOOM_PRESETS as preset (preset.id)}
      <figure>
        <figcaption>{preset.name}</figcaption>
        <div class="tile"><BloomThumbnail {preset} /></div>
      </figure>
    {/each}
  </div>
</div>

<style>
  .page {
    padding: 24px;
    background: #0b0d14;
    min-height: 100vh;
    color: #e6e8ef;
    font-family: system-ui, sans-serif;
  }

  h2 {
    margin: 0 0 12px;
    font-size: 1rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #8b91a4;
  }

  .grid {
    display: grid;
    /* 304px is the width the tile actually gets inside the effects panel. */
    grid-template-columns: repeat(auto-fill, 304px);
    gap: 18px;
    margin-bottom: 32px;
  }

  figcaption {
    padding-bottom: 6px;
    font-size: 0.9375rem;
    font-weight: 600;
  }

  .tile {
    width: 304px;
    height: 114px;
  }
</style>
