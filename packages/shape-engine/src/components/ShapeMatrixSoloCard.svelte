<!-- packages/shape-engine/src/components/ShapeMatrixSoloCard.svelte
  What a solo shows in the place of the hand-relationship picker: one flower's
  card, the stage's sibling. It places itself in the drill's `modes` grid area
  and answers to the same container tiers the drill does.

  A side column gets a tall card: the plate in a well that takes all the spare
  height, then the name and the readings directly under it.
  Every other tier gets one low band above the stage.

  The plate is the matrix axis header's own flower, through the one artwork
  primitive. Over it, the marks show why the flower has its name: a 4-petal
  box-mode flower's dots join into a box. -->
<script lang="ts">
  import { s as t } from "../strings.svelte.js";
  import { growFade } from "@austencloud/motion";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { mandalaGuideScale } from "#lib/shared/mandala/services/mandala-guide-image.js";
  import { flowerKey, type Flower } from "@tka/shape-domain";
  import { flowerPetalMarks } from "../services/flower-petal-anchor.js";
  import {
    headerArtworkSrc,
    shapeMatrixArtworkPainterForColors,
  } from "../services/shape-matrix-artwork";
  import type { SoloFlowerDescription } from "../services/shape-matrix-display.js";
  import type { ShapeMatrixData } from "../services/shape-matrix-flowers";
  import ShapeMatrixMandalaArt from "./ShapeMatrixMandalaArt.svelte";

  let {
    description,
    flower,
    hand,
    data,
  }: {
    description: SoloFlowerDescription;
    flower: Flower;
    hand: "left" | "right";
    data: ShapeMatrixData;
  } = $props();

  const key = $derived(flowerKey(flower));
  const paths = $derived(data[hand].get(key) ?? null);
  // The axis headers' painter, so the plate is the flower that was pressed, in
  // the account's saved hand ink.
  const painter = $derived(
    shapeMatrixArtworkPainterForColors(getSettings().primaryPropColors)
  );
  const paint = $derived((sizePx: number) =>
    paths ? headerArtworkSrc(data, flower, hand, sizePx, painter) : ""
  );

  /**
   * Petal marks as percentages of the plate. The painter strokes each point at
   * the box's centre plus the point times the extent fit's scale, so asking
   * that same scale for a box of 1 puts a mark on the stroke at any plate size.
   * Float and Extension have no petals to mark.
   */
  const marks = $derived.by(() => {
    if (!paths || flower.style === "float" || flower.petals === 0) return [];
    const read = flowerPetalMarks(paths[hand], flower.style, flower.petals);
    if (!read) return [];
    const scale = mandalaGuideScale(paths, {
      size: 1,
      fit: "extent",
      show: hand,
      tipDx: data.clubTipDx,
    });
    return read.points.map((point) => ({
      x: 50 + point.x * scale * 100,
      y: 50 + point.y * scale * 100,
    }));
  });
  const outline = $derived(
    marks.length >= 3
      ? marks.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")
      : null
  );
</script>

<div
  class="solo-card"
  class:right={hand === "right"}
  role="group"
  aria-label={t("shape_engine_solo_about")}
  data-focus-mode-chrome
  data-drill-region="modes"
  transition:growFade={{ axis: "y" }}
>
  <div class="plate">
    <div class="plate-square">
      <ShapeMatrixMandalaArt
        {paint}
        artKey={`${hand}:${key}:${data.geometryKey ?? "arc:tips"}:${painter.cacheKey ?? ""}`}
      />
      {#if marks.length > 0}
        <!-- The outer drawing has no viewBox, so its dots keep one size at any
             plate size while their percentages stay on the artwork's scale. -->
        <svg class="plate-marks" aria-hidden="true">
          {#if outline}
            <svg viewBox="0 0 100 100" width="100%" height="100%">
              <polygon points={outline} />
            </svg>
          {/if}
          {#each marks as { x, y }, index (index)}
            <circle cx={`${x}%`} cy={`${y}%`} r="2.5" />
          {/each}
        </svg>
      {/if}
    </div>
  </div>

  <div class="name">
    <span class="eyebrow">{description.hand}</span>
    <strong class="headline">{description.headline}</strong>
    {#if description.note ?? description.modeMeaning}
      <span class="meaning">{description.note ?? description.modeMeaning}</span>
    {/if}
  </div>

  <dl class="readings">
    <div class="reading">
      <dt>{description.tka.system}</dt>
      <dd>{description.tka.value}</dd>
    </div>
    <div class="reading">
      <dt>{description.vtg.system}</dt>
      <dd>{description.vtg.value}</dd>
    </div>
  </dl>
</div>

<style>
  /* The band is the default: one low row above the stage. Its height comes from
     the fixed thumbnail, so it is settled before the image arrives. Only the
     inline size is contained here, since this row is sized by its content. */
  .solo-card {
    --solo-hand: var(--prop-blue-text, #818cf8);
    --solo-tint-at: 2.25rem 50%;
    grid-area: modes;
    container: solo-flower-card / inline-size;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 0.75rem;
    min-width: 0;
    min-height: 0;
    padding: 0.1875rem 0.75rem 0.1875rem 0.375rem;
    box-sizing: border-box;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    border-radius: 16px;
    background:
      radial-gradient(
        circle at var(--solo-tint-at),
        color-mix(in srgb, var(--solo-hand) 9%, transparent),
        transparent 54%
      ),
      var(--theme-card-bg, #0a0f14);
  }
  .solo-card.right {
    --solo-hand: var(--prop-red-text, #f87171);
  }

  .plate {
    width: 3.5rem;
    height: 3.5rem;
    min-width: 0;
    min-height: 0;
  }
  .plate-square {
    position: relative;
    isolation: isolate;
    width: 100%;
    height: 100%;
  }
  .plate-marks {
    position: absolute;
    z-index: 1;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }
  .plate-marks polygon {
    fill: none;
    stroke: var(--theme-text, #fff);
    stroke-width: 1.25px;
    stroke-opacity: 0.45;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .plate-marks circle {
    fill: var(--theme-text, #fff);
  }

  .name {
    display: grid;
    align-content: center;
    min-width: 0;
  }
  .eyebrow {
    color: var(--solo-hand);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 650;
    line-height: 1.2;
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

  /* A phone gives the canvas every pixel it can: the plate shrinks past the
     size the marks can be read at, and the readings join the text column as
     one line. Three tight lines against today's two cost the stage about 12px. */
  @container shape-matrix-drill (max-width: 25rem) {
    .solo-card {
      --solo-tint-at: 1.5rem 50%;
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-areas:
        "plate name"
        "plate readings";
      column-gap: 0.5rem;
      padding: 0.0625rem 0.5rem 0.0625rem 0.25rem;
    }
    .plate {
      grid-area: plate;
      width: 2.5rem;
      height: 2.5rem;
    }
    .plate-marks {
      display: none;
    }
    .name {
      grid-area: name;
    }
    .eyebrow {
      line-height: 1.05;
    }
    .headline {
      font-size: 1rem;
      line-height: 1.05;
    }
    .readings {
      grid-area: readings;
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
  }

  /* The side column: a tall card, whose height is the row's to give. The well
     is the one flexible zone and takes all of it, so nothing but the well ever
     stretches. With the well hidden, the name and readings centre as a pair.
     The panel surface over the card's own is a step darker in every theme. */
  @container shape-matrix-drill-compact (min-width: 42rem) and (min-aspect-ratio: 5 / 6) {
    .solo-card {
      container-type: size;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: center;
      gap: 0.75rem;
      padding: 1rem;
      background: var(--theme-card-bg, #0a0f14);
    }
    .plate {
      container-type: size;
      display: grid;
      place-items: center;
      flex: 1 1 0;
      box-sizing: border-box;
      width: auto;
      height: auto;
      padding: 0.75rem;
      border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
      border-radius: 12px;
      background:
        radial-gradient(
          circle at center,
          color-mix(in srgb, var(--solo-hand) 9%, transparent),
          transparent 70%
        ),
        var(--theme-panel-bg, #101721);
    }
    /* A size container's units read inside its padding, so this is the well
       less its inset, and stays square whichever side runs out first. */
    .plate-square {
      width: min(100cqw, 100cqh);
      height: min(100cqw, 100cqh);
    }
    .name {
      flex: none;
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

  /* The one rule for the whole side column, its short tiers included. Container
     sizes are read inside the padding, so 15rem here is a 17rem card and 11.5rem
     is a 13.5rem card. Below those the well or the meaning would squeeze the
     name and readings, which never clip. */
  @container solo-flower-card (max-height: 15rem) {
    .plate {
      display: none;
    }
  }
  @container solo-flower-card (max-height: 11.5rem) {
    .meaning {
      display: none;
    }
  }
</style>
