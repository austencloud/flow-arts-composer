<!-- packages/shape-engine/src/components/ShapeMatrixSoloCard.svelte
  What a solo shows in the place of the hand-relationship picker: every single
  flower these turns offer, one hand per column, with the one on stage marked
  and named under them. It places itself in the drill's `modes` grid area and
  answers to the same container tiers the drill does.

  A side column gets a tall card: the picker takes all the spare height, then
  the name and the readings directly under it.
  Every other tier gets one low band above the stage: the tiles in a row, the
  name and readings under them.

  The tiles are the matrix axis headers' own flowers, through the one artwork
  primitive, and they turn with the stage so a tile always looks like what it
  would put there. -->
<script lang="ts">
  import { s as t } from "../strings.svelte.js";
  import {
    Crossfade,
    DURATION,
    followHeight,
    growFade,
  } from "@austencloud/motion";
  import { claimedViewTransitionName } from "#lib/shared/transitions/claimed-view-transition-name.js";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { flowerKey, type Flower } from "@tka/shape-domain";
  import {
    headerArtworkSrc,
    SHAPE_MATRIX_SOLO_CARD_NAME,
    shapeMatrixArtworkPainterForColors,
  } from "../services/shape-matrix-artwork";
  import {
    localizedFlowerLabel,
    type SoloFlowerDescription,
  } from "../services/shape-matrix-display.js";
  import type { ShapeMatrixData } from "../services/shape-matrix-flowers";
  import ShapeMatrixMandalaArt from "./ShapeMatrixMandalaArt.svelte";

  type Hand = "left" | "right";

  let {
    description,
    flower,
    hand,
    data,
    axes,
    eighthTurns = 0,
    morphing = false,
    motion = { axis: "y" },
    onpick,
  }: {
    description: SoloFlowerDescription;
    flower: Flower;
    hand: Hand;
    data: ShapeMatrixData;
    /** The flowers on each hand's axis at the current turns. */
    axes: { left: readonly Flower[]; right: readonly Flower[] };
    /** How far the stage has turned, in eighths of a circle. */
    eighthTurns?: number;
    /** A shared-element flight is running: settle as one frame. */
    morphing?: boolean;
    /** How the card grows in and out; a flight wants it there at once. */
    motion?: { axis: "x" | "y"; duration?: number };
    onpick?: (hand: Hand, flower: Flower) => void;
  } = $props();

  const HANDS: readonly Hand[] = ["left", "right"];

  const selectedKey = $derived(flowerKey(flower));
  // The axis headers' painter, so a tile is the flower its header shows, in the
  // account's saved hand ink.
  const painter = $derived(
    shapeMatrixArtworkPainterForColors(getSettings().primaryPropColors)
  );
  const artSuffix = $derived(
    `${data.geometryKey ?? "arc:tips"}:${painter.cacheKey ?? ""}`
  );
  // The name breaks at its spaces, never inside "box-mode" or "4-petal".
  const unbrokenHeadline = $derived(description.headline.replaceAll("-", "‑"));
  const meaning = $derived(description.note ?? description.modeMeaning);
  // Picking a flower changes how long its name is and whether it has a line of
  // explanation, and the tiles above share that height. The old words leave
  // before the new ones show, since two names wrapped differently and laid over
  // each other read as a smear, and the block eases to its new height meanwhile.
  // A flight snapshots the card the frame it changes, so it wants them there at
  // once.
  const wordMotion = $derived(morphing ? 0 : DURATION.fast);
  const wordsKey = $derived(`${unbrokenHeadline}|${meaning ?? ""}`);

  // The block's height follows an invisible copy of the current words (its first
  // child), never the visible layers, so picking again mid-change always lands
  // on the right height.

  const handWord = (side: Hand) =>
    t(
      side === "left"
        ? "shape_engine_solo_hand_left"
        : "shape_engine_solo_hand_right"
    );
</script>

{#snippet nameWords()}
  <strong class="headline">{unbrokenHeadline}</strong>
  {#if meaning}
    <span class="meaning">{meaning}</span>
  {/if}
{/snippet}

<div
  class="solo-card"
  class:right={hand === "right"}
  role="group"
  aria-label={t("shape_engine_solo_about")}
  data-focus-mode-chrome
  data-drill-region="modes"
  use:claimedViewTransitionName={{
    name: SHAPE_MATRIX_SOLO_CARD_NAME,
    enabled: morphing,
  }}
  transition:growFade={motion}
>
  <div
    class="picker"
    class:turned={eighthTurns % 2 !== 0}
    role="group"
    aria-label={t("shape_engine_solo_picker")}
    style:--solo-turn={`${eighthTurns * 45}deg`}
  >
    {#each HANDS as side (side)}
      <div class="hand-column" class:right={side === "right"}>
        <span class="hand-label">{handWord(side)}</span>
        {#each axes[side] as item (flowerKey(item))}
          {@const key = flowerKey(item)}
          {@const selected = side === hand && key === selectedKey}
          <button
            type="button"
            class="tile"
            class:selected
            aria-pressed={selected}
            aria-label={t(
              side === "left"
                ? "shape_engine_solo_left"
                : "shape_engine_solo_right",
              { flower: localizedFlowerLabel(item) }
            )}
            title={localizedFlowerLabel(item)}
            onclick={() => onpick?.(side, item)}
          >
            <span class="tile-art">
              <ShapeMatrixMandalaArt
                paint={(sizePx) =>
                  headerArtworkSrc(data, item, side, sizePx, painter)}
                artKey={`${side}:${key}:${artSuffix}`}
              />
            </span>
          </button>
        {/each}
      </div>
    {/each}
  </div>

  <div class="name">
    <span class="eyebrow">
      <Crossfade key={description.hand} mode="swap" duration={wordMotion}>
        {description.hand}
      </Crossfade>
    </span>
    <div class="words" use:followHeight={true}>
      <div class="name-words sizer" aria-hidden="true">
        {@render nameWords()}
      </div>
      <div class="words-live">
        <Crossfade key={wordsKey} fill mode="swap" duration={wordMotion}>
          <div class="name-words">
            {@render nameWords()}
          </div>
        </Crossfade>
      </div>
    </div>
  </div>

  <dl class="readings">
    <div class="reading">
      <dt>{description.tka.system}</dt>
      <dd>
        <Crossfade
          key={description.tka.value}
          mode="swap"
          duration={wordMotion}
        >
          {description.tka.value}
        </Crossfade>
      </dd>
    </div>
    <div class="reading">
      <dt>{description.vtg.system}</dt>
      <dd>
        <Crossfade
          key={description.vtg.value}
          mode="swap"
          duration={wordMotion}
        >
          {description.vtg.value}
        </Crossfade>
      </dd>
    </div>
  </dl>
</div>

<style>
  /* The band is the default: a row of tiles over a row of words. Only the
     inline size is contained here, since this card is sized by its content. */
  .solo-card {
    --solo-hand: var(--prop-blue-text, #818cf8);
    grid-area: modes;
    container: solo-flower-card / inline-size;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "picker picker"
      "name readings";
    align-items: center;
    gap: 0.375rem 0.75rem;
    min-width: 0;
    min-height: 0;
    padding: 0.375rem 0.75rem 0.5rem;
    box-sizing: border-box;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    border-radius: 16px;
    background: var(--theme-card-bg, #0a0f14);
  }
  .solo-card.right {
    --solo-hand: var(--prop-red-text, #f87171);
  }

  .picker {
    grid-area: picker;
    display: flex;
    justify-content: center;
    gap: 0.75rem;
    min-width: 0;
    min-height: 0;
  }
  .hand-column {
    --tile-hand: var(--prop-blue-text, #818cf8);
    flex: 1 1 0;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 4.5rem);
    justify-content: center;
    gap: 0.25rem;
    min-width: 0;
    min-height: 0;
  }
  .hand-column.right {
    --tile-hand: var(--prop-red-text, #f87171);
  }
  .hand-label {
    display: none;
    color: var(--tile-hand);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 650;
    line-height: 1.2;
    text-align: center;
  }

  .tile {
    container-type: size;
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    min-width: 0;
    min-height: 0;
    padding: 0.125rem;
    box-sizing: border-box;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    border-radius: 10px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard);
  }
  .tile:hover {
    border-color: color-mix(in srgb, var(--tile-hand) 55%, transparent);
    background: color-mix(in srgb, var(--tile-hand) 8%, transparent);
  }
  .tile:focus-visible {
    outline: 2px solid var(--tile-hand);
    outline-offset: -2px;
  }
  .tile.selected {
    border-color: var(--tile-hand);
    background: color-mix(in srgb, var(--tile-hand) 16%, transparent);
  }
  /* A size container's units read inside its padding, so the art stays square
     whichever side of the tile runs out first. */
  .tile-art {
    display: block;
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    pointer-events: none;
    rotate: var(--solo-turn, 0deg);
    transition:
      rotate var(--duration-emphasis) var(--ease-standard),
      scale var(--duration-emphasis) var(--ease-standard);
  }
  /* A flower is fitted to its square. A corner petal turned onto an axis would
     reach out of the tile, so a turned tile draws it smaller. */
  .picker.turned .tile-art {
    scale: 0.72;
  }

  .name {
    grid-area: name;
    display: grid;
    align-content: center;
    min-width: 0;
  }
  .eyebrow {
    color: var(--solo-hand);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 650;
    line-height: 1.2;
    transition: color var(--duration-emphasis) var(--ease-standard);
  }
  /* Clipped at its own edge, so words are revealed by the block as it grows and
     never run over the readings. The padding keeps the headline's descenders,
     which hang just past its box, inside that edge. Border-box, because
     followHeight eases to the height padding included. */
  .words {
    position: relative;
    box-sizing: border-box;
    min-width: 0;
    padding-block-end: 0.2em;
    margin-block-end: -0.2em;
    overflow: clip;
  }
  .words-live {
    position: absolute;
    inset: 0;
  }
  .name-words {
    display: grid;
    min-width: 0;
  }
  .sizer {
    visibility: hidden;
  }
  .headline {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    min-width: 0;
    color: var(--theme-text, #fff);
    font-size: clamp(1.05rem, 2.6cqi, 1.35rem);
    font-weight: 750;
    line-height: 1.1;
    text-wrap: balance;
    /* The clamp's overflow would shave the descenders off its last line. */
    padding-block-end: 0.15em;
    margin-block-end: -0.15em;
  }
  /* A band has no room for the explanation; the side column does. */
  .meaning {
    display: none;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.65));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.3;
  }

  /* Two columns across both rows, so the labels and the values each align. */
  .readings {
    grid-area: readings;
    display: grid;
    grid-template-columns: auto auto;
    justify-content: end;
    gap: 0.05rem 0.5rem;
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.25;
  }
  .reading {
    display: contents;
  }
  .reading dt {
    color: var(--theme-text-dim, rgb(255 255 255 / 0.65));
    font-weight: 650;
  }
  .reading dd {
    margin: 0;
    color: var(--theme-text, #fff);
    text-align: right;
    white-space: nowrap;
  }
  /* Room for the longest spin reading, so "prospin" and "antispin" leave the
     labels beside them where they are. */
  .reading:first-child dd {
    min-width: 8.5em;
  }

  /* A stage this short has nothing to spare, so the band keeps its words and
     the matrix keeps the choosing. */
  @container shape-matrix-drill (max-height: 30rem) {
    .picker {
      display: none;
    }
  }

  /* A phone gives the canvas every pixel it can: small tiles, and the readings
     join the text column as one line. */
  @container shape-matrix-drill (max-width: 25rem) {
    .solo-card {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "picker"
        "name"
        "readings";
      gap: 0.1875rem;
      padding: 0.25rem 0.5rem 0.3125rem;
    }
    .picker {
      gap: 0.5rem;
    }
    .hand-column {
      gap: 0.125rem;
    }
    .tile {
      border-radius: 8px;
      padding: 0.0625rem;
    }
    .eyebrow {
      line-height: 1.05;
    }
    .headline {
      font-size: 1rem;
      line-height: 1.05;
    }
    .readings {
      display: flex;
      flex-wrap: wrap;
      justify-content: start;
      gap: 0 0.75rem;
      line-height: 1.05;
    }
    .reading {
      display: flex;
      gap: 0.3rem;
    }
    .reading dd {
      text-align: start;
    }
  }

  /* The side column: a tall card, whose height is the row's to give. The picker
     is the one flexible zone and takes all of it, a column of tiles per hand,
     so the tiles are as big as the column allows. */
  @container shape-matrix-drill-compact (min-width: 42rem) and (min-aspect-ratio: 5 / 6) {
    .solo-card {
      container-type: size;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: center;
      gap: 0.75rem;
      padding: 1rem;
    }
    .picker {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      flex: 1 1 0;
      gap: 0.5rem;
    }
    .hand-column {
      grid-auto-flow: row;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto;
      grid-auto-rows: minmax(0, 1fr);
      gap: 0.375rem;
    }
    .hand-label {
      display: block;
    }
    .tile {
      aspect-ratio: auto;
      padding: 0.25rem;
    }
    .name {
      flex: none;
    }
    .name,
    .name-words {
      row-gap: 0.25rem;
    }
    .headline {
      display: block;
      overflow: visible;
      padding-block-end: 0;
      margin-block-end: 0;
      font-size: clamp(1.35rem, 9cqi, 1.75rem);
    }
    .meaning {
      display: block;
    }
    .readings {
      flex: none;
      display: block;
    }
    .reading {
      display: grid;
      grid-template-columns: 2.5rem minmax(0, 1fr);
      column-gap: 0.5rem;
      padding-block: 0.45rem;
      border-block-start: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    }
    .reading:last-child {
      padding-block-end: 0;
    }
    .reading dd {
      text-align: start;
      white-space: normal;
    }
  }

  /* Short side columns, read inside the card's padding. First the two hands
     stack as rows of tiles, then the words tighten, and below that the matrix
     has the room the picker does not. */
  @container solo-flower-card (max-height: 30rem) {
    .picker {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.375rem;
    }
    .hand-column {
      grid-auto-flow: column;
      grid-template-columns: none;
      grid-template-rows: minmax(0, 1fr);
      grid-auto-columns: minmax(0, 1fr);
    }
    .hand-label {
      display: none;
    }
  }
  @container solo-flower-card (max-height: 22rem) {
    .solo-card {
      gap: 0.5rem;
    }
    .meaning {
      display: none;
    }
    .headline {
      font-size: 1.15rem;
      line-height: 1.1;
    }
    .readings {
      display: flex;
      flex-wrap: wrap;
      justify-content: start;
      gap: 0 0.75rem;
    }
    .reading {
      display: flex;
      gap: 0.3rem;
      padding-block: 0;
      border-block-start: 0;
    }
    .reading dd {
      text-align: start;
    }
  }
  /* Too short for two rows of tiles that still read as flowers, so both hands
     share one row of square tiles and the words keep the rest. */
  @container solo-flower-card (max-height: 13rem) {
    .picker {
      flex: none;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .hand-column {
      grid-template-rows: none;
      gap: 0.25rem;
    }
    .tile {
      aspect-ratio: 1;
      padding: 0.125rem;
    }
  }
  @container solo-flower-card (max-height: 9rem) {
    .picker {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tile,
    .tile-art,
    .eyebrow {
      transition: none;
    }
  }
</style>
