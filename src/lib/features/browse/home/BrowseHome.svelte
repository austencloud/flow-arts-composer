<!--
  Browse's home screen, the sibling of Create's "How do you want to create?"
  board. Opening the Browse module lands here; each tile opens one place:
  Explore by content type, or your own library. The visuals tile carries
  chips for its types so a named type is one tap away without becoming a
  peer tile of its own.
-->
<script module lang="ts">
  import type { BrowseVisualType } from "#lib/shared/browse/navigation/browse-route-resolver.js";

  export type BrowseHomeDestination =
    | { kind: "sequences" }
    | { kind: "collections" }
    | { kind: "visuals"; visualType?: BrowseVisualType }
    | { kind: "you" };
</script>

<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";

  let {
    visualsVisible,
    onSelect,
  }: {
    /** Explore > Visuals is promotion-gated; its tile follows the gate. */
    visualsVisible: boolean;
    onSelect: (destination: BrowseHomeDestination) => void;
  } = $props();

  interface Tile {
    id: "sequences" | "collections" | "visuals" | "you";
    labelKey: TranslationKey;
    descKey: TranslationKey;
    icon: string;
    color: string;
  }

  const ALL_TILES: readonly Tile[] = [
    {
      id: "sequences",
      labelKey: "browse_home_sequences",
      descKey: "browse_home_sequences_desc",
      icon: "fa-table-cells-large",
      color: "#a855f7",
    },
    {
      id: "collections",
      labelKey: "browse_home_collections",
      descKey: "browse_home_collections_desc",
      icon: "fa-folder-open",
      color: "#6366f1",
    },
    {
      id: "visuals",
      labelKey: "browse_home_visuals",
      descKey: "browse_home_visuals_desc",
      icon: "fa-palette",
      color: "#ec4899",
    },
    {
      id: "you",
      labelKey: "tab_browse_you",
      descKey: "tab_desc_browse_you",
      icon: "fa-user",
      color: "#14b8a6",
    },
  ];

  /** The published visual types, in the order the visuals wall lists them. */
  const VISUAL_TYPES: ReadonlyArray<{
    type: BrowseVisualType;
    labelKey: TranslationKey;
    icon: string;
  }> = [
    { type: "tunnels", labelKey: "browse_home_tunnels", icon: "fa-fan" },
    {
      type: "mandalas",
      labelKey: "browse_home_mandalas",
      icon: "fa-dharmachakra",
    },
  ];

  const tiles = $derived(
    ALL_TILES.filter((tile) => tile.id !== "visuals" || visualsVisible)
  );

  function select(tile: Tile): void {
    onSelect({ kind: tile.id });
  }
</script>

<section class="browse-home" aria-labelledby="browse-home-title">
  <div class="browse-home-inner">
    <header class="browse-home-header">
      <h1 id="browse-home-title">{t("browse_home_title")}</h1>
    </header>

    <div
      class="tile-index"
      role="list"
      aria-label={t("browse_home_destinations")}
      data-tile-count={tiles.length}
    >
      {#each tiles as tile (tile.id)}
        <div
          class="tile"
          class:has-chips={tile.id === "visuals"}
          data-tile-id={tile.id}
          role="listitem"
          style:--tile-color={tile.color}
        >
          <button
            type="button"
            class="tile-main"
            data-browse-home-tile={tile.id}
            onclick={() => select(tile)}
          >
            <span class="tile-stage" aria-hidden="true">
              {#if tile.id === "visuals"}
                <span class="emblem-cycle">
                  {#each VISUAL_TYPES as visual (visual.type)}
                    <i class="fas {visual.icon} emblem"></i>
                  {/each}
                </span>
              {:else}
                <i class="fas {tile.icon}"></i>
              {/if}
            </span>
            <span class="tile-copy">
              <span class="tile-name">{t(tile.labelKey)}</span>
              <span class="tile-description">{t(tile.descKey)}</span>
            </span>
          </button>

          {#if tile.id === "visuals"}
            <div
              class="tile-chips"
              role="group"
              aria-label={t("browse_home_visual_types")}
            >
              {#each VISUAL_TYPES as visual (visual.type)}
                <button
                  type="button"
                  class="tile-chip"
                  data-browse-home-chip={visual.type}
                  onclick={() =>
                    onSelect({ kind: "visuals", visualType: visual.type })}
                >
                  <i class="fas {visual.icon}" aria-hidden="true"></i>
                  {t(visual.labelKey)}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  .browse-home {
    width: 100%;
    height: 100%;
    overflow: auto;
    container: browse-home / size;
  }

  .browse-home-inner {
    width: calc(100% - clamp(20px, 3cqi, 80px));
    min-height: 100%;
    margin: 0 auto;
    padding-block: clamp(20px, 4cqh, 52px);
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto auto;
    align-content: start;
    gap: clamp(16px, 2.5cqh, 24px);
  }

  h1 {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-3xl, 1.875rem);
    font-weight: 720;
    line-height: 1.08;
    letter-spacing: -0.025em;
    text-wrap: balance;
  }

  /* One column on a phone: each tile sets its icon square beside its words. */
  .tile-index {
    --stage-side: clamp(48px, 13cqi, 64px);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    padding-top: 4px;
  }

  .tile {
    position: relative;
    min-width: 0;
    display: grid;
    grid-template-rows: 1fr auto;
    border: 1px solid
      color-mix(in srgb, var(--tile-color) 30%, var(--theme-stroke));
    border-radius: var(--radius-2026-md, 14px);
    background: color-mix(in srgb, var(--tile-color) 11%, var(--theme-card-bg));
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal);
  }
  .tile:has(.tile-main:hover) {
    background: color-mix(in srgb, var(--tile-color) 18%, var(--theme-card-bg));
    border-color: color-mix(
      in srgb,
      var(--tile-color) 58%,
      var(--theme-stroke-strong)
    );
  }
  .tile:has(.tile-main:active) {
    background: color-mix(in srgb, var(--tile-color) 22%, var(--theme-card-bg));
  }

  .tile-main {
    min-width: 0;
    min-height: 92px;
    display: grid;
    grid-template-columns: var(--stage-side) minmax(0, 1fr);
    align-items: center;
    gap: 14px;
    padding: 14px;
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: var(--theme-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .tile-main:focus-visible,
  .tile-chip:focus-visible {
    outline: 3px solid
      color-mix(in srgb, var(--tile-color) 76%, var(--theme-text));
    outline-offset: 2px;
  }

  .tile-stage {
    width: var(--stage-side);
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border: 1px solid
      color-mix(in srgb, var(--tile-color) 42%, var(--theme-stroke));
    border-radius: var(--radius-2026-sm, 10px);
    background: color-mix(in srgb, var(--tile-color) 20%, var(--theme-card-bg));
    color: var(--tile-color);
    font-size: calc(var(--stage-side) * 0.38);
  }

  /* The visuals emblem shows each published type in turn. */
  .emblem-cycle {
    display: grid;
    place-items: center;
  }
  .emblem {
    grid-area: 1 / 1;
    animation: emblem-turn 6s ease-in-out infinite;
  }
  .emblem:nth-child(2) {
    animation-delay: -3s;
  }
  @keyframes emblem-turn {
    0%,
    42% {
      opacity: 1;
      transform: rotate(0deg) scale(1);
    }
    50%,
    92% {
      opacity: 0;
      transform: rotate(45deg) scale(0.8);
    }
    100% {
      opacity: 1;
      transform: rotate(0deg) scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .emblem {
      animation: none;
    }
    .emblem:nth-child(2) {
      opacity: 0;
    }
  }

  .tile-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .tile-name {
    color: var(--theme-text);
    font-size: var(--font-size-lg, 1.125rem);
    font-weight: 720;
    line-height: 1.15;
  }
  .tile-description {
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    line-height: 1.42;
    text-wrap: pretty;
  }

  /* Chips sit under the words, aligned with them rather than the icon. */
  .tile-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 14px 14px calc(14px + var(--stage-side) + 14px);
  }
  .tile-chip {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    border: 1px solid
      color-mix(in srgb, var(--tile-color) 40%, var(--theme-stroke));
    border-radius: 999px;
    background: color-mix(in srgb, var(--tile-color) 14%, var(--theme-card-bg));
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-min, 14px);
    font-weight: 620;
    cursor: pointer;
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal);
  }
  .tile-chip i {
    color: var(--tile-color);
  }
  .tile-chip:hover {
    background: color-mix(in srgb, var(--tile-color) 26%, var(--theme-card-bg));
    border-color: color-mix(
      in srgb,
      var(--tile-color) 62%,
      var(--theme-stroke-strong)
    );
  }

  /* Two columns once a tile has room for its square and a readable line.
     An odd count lets the last tile (You) take the full row. */
  @container browse-home (min-width: 600px) {
    .browse-home-inner {
      width: calc(100% - 28px);
    }
    .tile-index {
      --stage-side: clamp(56px, 9cqi, 84px);
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .tile-index[data-tile-count="3"] .tile:last-child {
      grid-column: 1 / -1;
    }
    /* Tiles side by side share two rows, words then chips, so a tile with
       chips keeps its icon and title level with its neighbours. */
    .tile {
      grid-row: span 2;
      grid-template-rows: subgrid;
      row-gap: 0;
    }
    .tile-main {
      grid-row: 1;
    }
    .tile-chips {
      grid-row: 2;
    }
    .tile-main {
      min-height: 132px;
      gap: 16px;
      padding: 18px;
    }
    .tile-chips {
      padding: 0 18px 18px calc(18px + var(--stage-side) + 16px);
    }
    .tile-name {
      font-size: clamp(1.125rem, 2.6cqi, 1.5rem);
    }
    .tile-description {
      font-size: clamp(14px, 1.8cqi, 1rem);
      /* Two lines reserved so a short description keeps titles level. */
      min-height: 2lh;
    }
  }

  /* A tall two-column board (a portrait tablet) fills its height the way
     Create's board does: tall tiles with the icon centred above the words. */
  @container browse-home (min-width: 600px) and (min-height: 760px) {
    .tile-index {
      --stage-side: clamp(72px, 11cqi, 112px);
    }
    .tile-main {
      min-height: clamp(220px, 30cqh, 360px);
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 1fr auto;
      align-items: start;
      gap: 18px;
      padding: 22px;
    }
    .tile-stage {
      align-self: center;
      justify-self: center;
    }
    .tile-chips {
      padding: 0 22px 22px;
    }
  }

  /* A wide board puts every tile in one row, icon above words, centred in
     the height like Create's board. */
  @container browse-home (min-width: 1100px) {
    .browse-home-inner {
      width: calc(100% - clamp(48px, 6cqi, 160px));
      max-width: 1600px;
      align-content: center;
      gap: 28px;
      padding-block: 40px;
    }
    /* Text grows with very large screens so a 4K board reads like Create's. */
    h1 {
      font-size: clamp(1.875rem, 1.3cqi, 3rem);
    }
    .tile-name {
      font-size: clamp(1.5rem, 0.9cqi, 2.25rem);
    }
    .tile-description,
    .tile-chip {
      font-size: clamp(1rem, 0.5cqi, 1.25rem);
    }
    .tile-index {
      --stage-side: clamp(72px, 6.5cqi, 112px);
      grid-template-columns: repeat(var(--tile-columns, 4), minmax(0, 1fr));
      gap: 16px;
    }
    .tile-index[data-tile-count="3"] {
      --tile-columns: 3;
    }
    .tile-index[data-tile-count="3"] .tile:last-child {
      grid-column: auto;
    }
    .tile-main {
      min-height: clamp(220px, 34cqh, 360px);
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 1fr auto;
      align-items: start;
      gap: 18px;
      padding: 22px;
    }
    .tile-stage {
      align-self: center;
      justify-self: center;
    }
    .tile-chips {
      padding: 0 22px 22px;
    }
  }
</style>
