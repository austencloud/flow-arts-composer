<script lang="ts">
  import { browser } from "$app/env";
  import HandMotionPlayer from "#lib/features/learn/components/interactive/foundations/HandMotionPlayer.svelte";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
  import type { DirectionValue } from "../_data/timing-direction-articles";
  import { timingDirectionPreviews as modes } from "../_state/timing-direction-state.svelte";

  // The one place a visitor picks a mode (Austen, 2026-11-01). Timing runs
  // across, direction down, so the headings name every tile and the tiles
  // carry no labels of their own. Each tile loops its mode's hand path.
  let {
    selectedSlug,
    playing,
    onselect,
  }: {
    selectedSlug: string;
    playing: boolean;
    onselect: (slug: string) => void;
  } = $props();

  const directions: readonly DirectionValue[] = ["Same", "Opposite"];
  const timings = modes
    .filter((mode) => mode.article.direction === "Same")
    .map((mode) => mode.article.timing);
</script>

<div class="mode-grid" role="group" aria-label="Mode">
  <span class="corner" aria-hidden="true"></span>
  {#each timings as timing}
    <span class="heading timing" aria-hidden="true">{timing}</span>
  {/each}
  {#each directions as direction}
    <span class="heading direction" aria-hidden="true">{direction}</span>
    {#each modes.filter((mode) => mode.article.direction === direction) as mode (mode.article.slug)}
      <button
        class="tile"
        type="button"
        class:selected={mode.article.slug === selectedSlug}
        style:--tile-accent={mode.motion.element.accentColor}
        aria-label={mode.article.name}
        aria-pressed={mode.article.slug === selectedSlug}
        onclick={() => onselect(mode.article.slug)}
      >
        {#if browser}
          <HandMotionPlayer
            primaryPropColors={DEFAULT_VIEWER_CUSTOM_COLORS}
            sequence={mode.motion.sequence}
            ariaLabel={mode.article.name}
            interactive={false}
            externalPlaying={playing}
            framed={false}
          />
        {/if}
      </button>
    {/each}
  {/each}
</div>

<style>
  /* Every length is a token, so the section above the player can be sized
     before the tiles load. --mode-grid-h is the grid's whole height. */
  .mode-grid {
    --label-w: 4.5rem;
    --tile-w: var(--mode-tile-w, 5.25rem);
    --tile-h: var(--mode-tile-h, 4.5rem);
    --heading-h: 1.5rem;
    --gap: 0.375rem;
    display: grid;
    grid-template-columns: var(--label-w) repeat(3, var(--tile-w));
    grid-template-rows: var(--heading-h) repeat(2, var(--tile-h));
    gap: var(--gap);
    align-items: center;
    width: fit-content;
  }

  .heading {
    color: var(--theme-text);
    font-size: 0.875rem;
    font-weight: 650;
    line-height: 1.2;
    text-align: center;
  }

  .direction {
    padding-right: 0.25rem;
    text-align: right;
  }

  /* Selected = a tint and an accent bar under the tile, never a solid fill. */
  .tile {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 0;
    overflow: hidden;
    border: 1px solid
      color-mix(in srgb, var(--tile-accent) 35%, var(--theme-stroke));
    border-radius: var(--radius-md, 0.5rem);
    background: color-mix(
      in srgb,
      var(--tile-accent) 6%,
      var(--theme-panel-bg)
    );
    cursor: pointer;
    transition:
      border-color var(--transition-normal),
      background-color var(--transition-normal);
  }

  .tile:hover {
    background: color-mix(
      in srgb,
      var(--tile-accent) 14%,
      var(--theme-panel-bg)
    );
  }

  .tile.selected {
    border-color: var(--tile-accent);
    background: color-mix(
      in srgb,
      var(--tile-accent) 18%,
      var(--theme-panel-bg)
    );
  }

  .tile::after {
    content: "";
    position: absolute;
    inset: auto 0 0;
    height: 3px;
    background: var(--tile-accent);
    opacity: 0;
    transition: opacity var(--transition-normal);
  }

  .tile.selected::after {
    opacity: 1;
  }

  .tile:focus-visible {
    outline: 3px solid var(--theme-text);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .tile,
    .tile::after {
      transition: none;
    }
  }
</style>
