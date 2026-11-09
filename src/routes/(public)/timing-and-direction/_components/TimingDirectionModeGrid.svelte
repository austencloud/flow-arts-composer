<script lang="ts">
  import { browser } from "$app/env";
  import HandMotionPlayer from "#lib/features/learn/components/interactive/foundations/HandMotionPlayer.svelte";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
  import type { DirectionValue } from "../_data/timing-direction-articles";
  import { timingDirectionPreviews as modes } from "../_state/timing-direction-state.svelte";

  // The one place a visitor picks a mode (Austen, 2026-11-01). A wide header
  // lays the six out in one row, Same direction then Opposite (his ask,
  // 2026-11-08); a narrow one keeps timing across and direction down. Either
  // way the labels name every tile, and each tile loops its mode's hand path.
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
</script>

<div class="mode-picker">
  <div class="mode-grid" role="group" aria-label="Mode">
    <span class="corner" aria-hidden="true"></span>
    {#each directions as direction, d}
      <span class="direction-label d{d}" aria-hidden="true"
        >{direction}<span class="word">{" direction"}</span></span
      >
      {#each modes.filter((mode) => mode.article.direction === direction) as mode, t (mode.article.slug)}
        <span class="timing-label d{d} t{t}" aria-hidden="true"
          >{mode.article.timing}</span
        >
        <button
          class="tile d{d} t{t}"
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
</div>

<style>
  /* Every length is a token, so the section above the player can be sized
     before the tiles load. The page sizes its header from the same tokens:
     a narrow grid is a heading row and two tile rows, a wide one a label
     row, a timing row and one row of tiles. */
  .mode-picker {
    width: 100%;
  }

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
    margin-inline: auto;
  }

  .direction-label,
  .timing-label {
    color: var(--theme-text);
    font-size: 0.875rem;
    font-weight: 650;
    line-height: 1.2;
    text-align: center;
  }

  /* Narrow: timing heads the columns once, direction heads the rows. */
  .corner {
    grid-area: 1 / 1;
  }
  .direction-label {
    grid-column: 1;
    padding-right: 0.25rem;
    text-align: right;
  }
  .direction-label.d0,
  .tile.d0 {
    grid-row: 2;
  }
  .direction-label.d1,
  .tile.d1 {
    grid-row: 3;
  }
  .direction-label .word {
    display: none;
  }
  .timing-label {
    grid-row: 1;
  }
  .timing-label.d1 {
    display: none;
  }
  .t0 {
    grid-column: 2;
  }
  .t1 {
    grid-column: 3;
  }
  .t2 {
    grid-column: 4;
  }

  /* Wide: one row across the header, the two directions side by side, each
     named once over its three timings. The page sizes its player with the
     same query (TimingDirectionModeExplorer's --grid-h); a short landscape
     window puts the header in a narrow column, so it stays two rows. */
  @media (min-width: 760px) and (min-height: 600px) {
    .mode-grid {
      --tile-h: var(--mode-row-tile-h, 6.5rem);
      --group-gap: 1.5rem;
      grid-template-columns:
        repeat(3, minmax(0, 1fr)) var(--group-gap)
        repeat(3, minmax(0, 1fr));
      grid-template-rows: 1.25rem 1.125rem var(--tile-h);
      column-gap: var(--gap);
      row-gap: var(--gap);
      width: 100%;
    }
    .corner {
      display: none;
    }
    .direction-label.d0,
    .direction-label.d1 {
      grid-row: 1;
      padding-right: 0;
      text-align: center;
      font-size: 0.9375rem;
    }
    .direction-label .word {
      display: inline;
    }
    .direction-label.d0 {
      grid-column: 1 / span 3;
    }
    .direction-label.d1 {
      grid-column: 5 / span 3;
    }
    .timing-label,
    .timing-label.d1 {
      display: block;
      grid-row: 2;
      color: var(--theme-text-dim);
      font-size: 0.8125rem;
      font-weight: 600;
    }
    .tile.d0,
    .tile.d1 {
      grid-row: 3;
    }
    .d0.t0 {
      grid-column: 1;
    }
    .d0.t1 {
      grid-column: 2;
    }
    .d0.t2 {
      grid-column: 3;
    }
    .d1.t0 {
      grid-column: 5;
    }
    .d1.t1 {
      grid-column: 6;
    }
    .d1.t2 {
      grid-column: 7;
    }
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
