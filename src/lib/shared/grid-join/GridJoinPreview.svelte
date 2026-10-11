<!--
  One pictograph drawn on one grid or on two joined grids, through the same
  preparer and Canvas 2D renderer the cards use, so a preview shows exactly
  what the sequence will look like with that join: the tinted points, both
  props and where each hand's grid sits. Transparent, so it takes the colour of
  whatever tile holds it.

  The box is square and reserved before the picture arrives. Rendered pictures
  are shared across every preview on the page, keyed by what they show.
-->
<script module lang="ts">
  import type { GridJoin } from "@tka/tka-types";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { RenderCanvas } from "#lib/shared/render/services/types.js";
  import { createRenderCanvas } from "#lib/shared/render/services/create-render-canvas.js";

  /** Enough for every tile of both grid modes in both themes. */
  const CACHE_LIMIT = 48;
  const rendered = new Map<string, Promise<string | null>>();

  function remember(key: string, url: Promise<string | null>): void {
    rendered.set(key, url);
    while (rendered.size > CACHE_LIMIT) {
      const oldest = rendered.keys().next().value as string;
      const evicted = rendered.get(oldest);
      rendered.delete(oldest);
      void evicted?.then((value) => value && URL.revokeObjectURL(value));
    }
  }

  /** Share of the crop kept clear around the drawn content. */
  const CROP_MARGIN = 0.06;

  /**
   * The square about the scene center that just holds every drawn pixel, at
   * `size`. Centered rather than tight, so one grid and both joins keep the
   * scene center in the middle of the picture.
   */
  function cropToContent(
    source: RenderCanvas,
    sourceSize: number,
    size: number
  ): RenderCanvas {
    const context = source.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    const out = createRenderCanvas(size, size);
    const outContext = out.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!context || !outContext) return source;
    const { data } = context.getImageData(0, 0, sourceSize, sourceSize);
    const center = sourceSize / 2;
    let reach = 0;
    for (let y = 0; y < sourceSize; y++) {
      for (let x = 0; x < sourceSize; x++) {
        if (data[(y * sourceSize + x) * 4 + 3]! > 8) {
          reach = Math.max(
            reach,
            Math.abs(x + 0.5 - center),
            Math.abs(y + 0.5 - center)
          );
        }
      }
    }
    if (reach === 0) return source;
    const half = Math.min(center, reach / (1 - CROP_MARGIN * 2));
    outContext.drawImage(
      source as CanvasImageSource,
      center - half,
      center - half,
      half * 2,
      half * 2,
      0,
      0,
      size,
      size
    );
    return out;
  }

  async function renderPreview(
    pictograph: PictographData,
    options: {
      join: GridJoin | null;
      gridMode: GridMode | undefined;
      darkMode: boolean;
      size: number;
      leftPropType?: PropType;
      rightPropType?: PropType;
    }
  ): Promise<string | null> {
    const [{ canvas2DDirectRenderer }, { pictographPreparer }] =
      await Promise.all([
        import("#lib/shared/render/services/canvas-2d-direct-renderer.js"),
        import("#lib/shared/pictograph/shared/services/pictograph-preparer.js"),
      ]);
    await canvas2DDirectRenderer.initialize();
    const source: PictographData = {
      ...pictograph,
      ...(options.gridMode ? { gridMode: options.gridMode } : {}),
      conjoined: options.join,
    };
    const prepared = await pictographPreparer.prepareSingle(source, {
      themeMode: options.darkMode ? "dark" : "light",
      ...(options.leftPropType ? { leftPropType: options.leftPropType } : {}),
      ...(options.rightPropType
        ? { rightPropType: options.rightPropType }
        : {}),
    });
    // Drawn larger than shown, then cropped square about the scene center to
    // what was actually drawn: a start position fills a fraction of the
    // 950-unit scene, which left a small picture adrift in a large tile.
    const drawSize = options.size * 2;
    const drawn = await canvas2DDirectRenderer.renderPictograph(prepared, {
      size: drawSize,
      ...(options.leftPropType ? { leftPropType: options.leftPropType } : {}),
      ...(options.rightPropType
        ? { rightPropType: options.rightPropType }
        : {}),
      visibility: {
        darkMode: options.darkMode,
        showBackground: false,
        showTKA: false,
        showTnD: false,
        showElemental: false,
        showPropTnD: false,
        showPlacements: false,
        showHandColorKey: false,
        showReversals: false,
        showNonRadialPoints: false,
      },
    });
    const canvas = cropToContent(drawn, drawSize, options.size);
    const blob =
      "convertToBlob" in canvas
        ? await canvas.convertToBlob({ type: "image/png" })
        : await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/png")
          );
    return blob ? URL.createObjectURL(blob) : null;
  }
</script>

<script lang="ts">
  import { gridJoinKey } from "@tka/render-core";

  let {
    pictograph,
    join,
    gridMode,
    darkMode = true,
    leftPropType,
    rightPropType,
    /** Rendered pixel size; the picture scales to its box. */
    size = 256,
    alt = "",
  }: {
    pictograph: PictographData;
    join: GridJoin | null;
    gridMode?: GridMode | undefined;
    darkMode?: boolean;
    leftPropType?: PropType;
    rightPropType?: PropType;
    size?: number;
    alt?: string;
  } = $props();

  const key = $derived(
    [
      pictograph.id,
      join ? gridJoinKey(join) : "one",
      gridMode ?? "auto",
      darkMode ? "dark" : "light",
      leftPropType ?? "-",
      rightPropType ?? "-",
      size,
    ].join("|")
  );

  let src = $state<string | null>(null);

  $effect(() => {
    const currentKey = key;
    let pending = rendered.get(currentKey);
    if (!pending) {
      pending = renderPreview(pictograph, {
        join,
        gridMode,
        darkMode,
        size,
        leftPropType,
        rightPropType,
      }).catch((error) => {
        console.warn("[GridJoinPreview] render failed", error);
        rendered.delete(currentKey);
        return null;
      });
      remember(currentKey, pending);
    }
    let live = true;
    void pending.then((url) => {
      if (live && url) src = url;
    });
    return () => {
      live = false;
    };
  });
</script>

<span class="grid-join-preview">
  {#if src}
    <img {src} {alt} draggable="false" />
  {/if}
</span>

<style>
  .grid-join-preview {
    display: block;
    width: 100%;
    aspect-ratio: 1;
  }

  .grid-join-preview img {
    display: block;
    width: 100%;
    height: 100%;
    user-select: none;
  }
</style>
