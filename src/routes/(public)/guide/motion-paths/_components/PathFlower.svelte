<script lang="ts">
  /**
   * A flower, painted by the Shape Engine's own guide painter the way
   * /guide/ratios paints its flowers (blue hand ink, the club painter's
   * strokes). Used beside a motion path to show the flower it relates to.
   * Its size reads the screen's scale (--fit) like every Guide figure.
   */
  import { onMount } from "svelte";
  import ShapeMatrixMandalaArt from "@tka/shape-engine/components/ShapeMatrixMandalaArt.svelte";
  import {
    CLUB_ARTWORK_PAINTER,
    headerArtworkSrc,
  } from "@tka/shape-engine/services/shape-matrix-artwork.js";
  import {
    loadShapeMatrix,
    type ShapeMatrixData,
  } from "@tka/shape-engine/services/shape-matrix-flowers.js";
  import {
    flowerKey,
    flowerPetals,
    type FlowerStyle,
    type RotatingFlower,
  } from "@tka/shape-domain";

  let {
    style = "anti",
    turns = 1,
    label,
    size = 170,
  }: {
    style?: FlowerStyle;
    turns?: number;
    /** What a screen reader hears for the figure. */
    label: string;
    /** The size at the screen's designed scale; --fit grows or shrinks it. */
    size?: number;
  } = $props();

  const flower = $derived<RotatingFlower>({
    style,
    turns,
    ori: "out",
    grid: "diamond",
    petals: flowerPetals({ style, turns }),
  });
  let data = $state<ShapeMatrixData | null>(null);
  onMount(async () => {
    try {
      data = await loadShapeMatrix();
    } catch {
      data = null;
    }
  });
  const paint = (sizePx: number) =>
    data
      ? headerArtworkSrc(data, flower, "left", sizePx, CLUB_ARTWORK_PAINTER)
      : "";
</script>

<span class="flower" style:--flower={`${size}px`}>
  <ShapeMatrixMandalaArt
    {paint}
    artKey={`${flowerKey(flower)}-${data ? 1 : 0}`}
    alt={label}
  />
</span>

<style>
  .flower {
    display: block;
    flex: none;
    inline-size: min(calc(var(--flower) * var(--fit, 1)), 100%);
    aspect-ratio: 1;
    margin-inline: auto;
  }
</style>
