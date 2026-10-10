<!--
  FanStyleOptions.svelte
  The fan look (Pictograph, DoodleGrip Fire, Lotus Fire, DoodleGrip Day,
  Moon LED, plus the cover where a build has one), opened from the prop
  grid's look chip once a fan is selected. Bound to the shared fanAppearance
  setting, which the 2D canvas and the 3D scene both read. The frame color
  is a 3D-only detail and stays out of this 2D control.
-->
<script lang="ts">
  import {
    getSettings,
    updateSettings,
  } from "#lib/shared/application/state/app-state.svelte.js";
  import FanAppearancePicker from "#lib/shared/pictograph/prop/components/FanAppearancePicker.svelte";
  import {
    normalizeFanAppearance,
    type FanAppearance,
  } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";

  let {
    fill = false,
  }: {
    /**
     * The host has given this chooser a definite height (the drilled view of
     * a bounded picker). The build and cover cards then share that height
     * instead of sitting at their natural size above empty space.
     */
    fill?: boolean;
  } = $props();

  const settings = $derived(getSettings());
  const appearance = $derived(normalizeFanAppearance(settings.fanAppearance));
  const showCover = $derived(
    appearance.build === "fire" || appearance.build === "day"
  );

  let rootEl = $state<HTMLDivElement | null>(null);
  let box = $state({ width: 0, height: 0 });

  $effect(() => {
    if (!fill || !rootEl) return;
    const root = rootEl;
    const measure = () =>
      (box = { width: root.clientWidth, height: root.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    measure();
    return () => observer.disconnect();
  });

  // Approximate card chrome, in px: the heading above a card row, the label
  // strip below each picture, the gap between cards, and the gap between
  // the build block and the cover block. They only steer a column choice,
  // so a few px of drift does not matter.
  const HEADING = 31;
  const LABEL = 38;
  const GAP = 10;
  const BLOCK_GAP = 12;
  const BUILD_COUNT = 5;

  /**
   * Builds per row in a bounded host: two if the taller two-column cards
   * (three rows, the last one centred) fit the height at their pictures'
   * own 8:3 shape, else three. Rows then share the height, so the cards
   * stretch by at most a fraction of one row.
   */
  const fillLayout = $derived.by(() => {
    if (!fill) return null;
    const { width, height } = box;
    const coverHeight = showCover
      ? HEADING + ((width - GAP) / 2) * (3 / 8) + LABEL
      : 0;
    const natural = (cols: number) => {
      const rows = Math.ceil(BUILD_COUNT / cols);
      const cardHeight = ((width - GAP * (cols - 1)) / cols) * (3 / 8) + LABEL;
      return HEADING + rows * cardHeight + (rows - 1) * GAP;
    };
    let cols = 3;
    if (width > 0 && height > 0) {
      cols =
        [2, 3].find(
          (candidate) =>
            natural(candidate) + (showCover ? BLOCK_GAP + coverHeight : 0) <=
            height
        ) ?? 3;
    }
    // The two blocks split the height in the ratio of their natural
    // heights, so both stretch by the same factor instead of the build
    // cards ballooning while the cover cards stay tight.
    const rows = showCover
      ? `minmax(0, ${Math.round(natural(cols))}fr) minmax(0, ${Math.round(coverHeight)}fr)`
      : "minmax(0, 1fr)";
    return { cols, rows };
  });

  function change(next: FanAppearance): void {
    void updateSettings({ fanAppearance: normalizeFanAppearance(next) });
  }
</script>

<div
  class="fan-style-options"
  class:fill
  class:cols-2={fillLayout?.cols === 2}
  class:cols-3={fillLayout?.cols === 3}
  style:--fill-rows={fillLayout?.rows}
  bind:this={rootEl}
  data-testid="fan-style-options"
>
  <FanAppearancePicker
    value={appearance}
    onchange={change}
    frameColor={false}
  />
</div>

<style>
  .fan-style-options {
    container-type: inline-size;
    flex: 0 0 auto;
    min-width: 0;
    width: 100%;
  }

  /* Three builds per row even on a phone, so the five builds and the cover
     fit inside the chooser without an inner scrollbar; one row of five once
     the chooser is wide enough. */
  .fan-style-options :global(.fan-appearance-picker) {
    --build-option-count: 3;
  }

  @container (max-width: 539px) {
    .fan-style-options :global(.option-label) {
      min-height: 0;
      padding: 6px 8px;
      font-size: 11.5px;
      line-height: 1.15;
      white-space: normal;
    }
  }

  @container (min-width: 540px) {
    .fan-style-options :global(.fan-appearance-picker) {
      --build-option-count: 5;
    }

    /* Details are a footnote to the build; small cards keep them from
       dominating the chooser's height. */
    .fan-style-options :global(.picker.secondary .option-grid) {
      grid-template-columns: repeat(2, minmax(0, 150px));
    }
  }

  /* Five build names share one row here, so the label runs tighter than
     the inspector's full-width cards. */
  .fan-style-options :global(.option-label) {
    padding-inline: 10px;
    font-size: 12.5px;
  }

  /* Bounded host (see fillLayout): the build block and the cover block
     share the height in proportion to their card rows, every card fills
     its row, and the builds sit on a twelve-track grid so the last row's
     odd cards centre instead of hugging the left edge. */
  .fan-style-options.fill {
    height: 100%;
    min-height: 0;
  }

  .fan-style-options.fill :global(.fan-appearance-picker) {
    --build-option-count: 3;
    height: 100%;
    min-height: 0;
    grid-template-rows: var(--fill-rows, minmax(0, 1fr));
  }

  .fan-style-options.fill :global(.build-choice),
  .fan-style-options.fill :global(.modifier-grid),
  .fan-style-options.fill :global(.modifier-grid > div) {
    height: 100%;
    min-height: 0;
  }

  .fan-style-options.fill :global(.picker) {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .fan-style-options.fill :global(.option-grid) {
    flex: 1;
    min-height: 0;
    grid-auto-rows: minmax(0, 1fr);
  }

  .fan-style-options.fill :global(.picker:not(.secondary) .option-grid) {
    grid-template-columns: repeat(12, minmax(0, 1fr));
  }

  .fan-style-options.fill.cols-3 :global(.picker:not(.secondary) .option) {
    grid-column: span 4;
  }

  .fan-style-options.fill.cols-3
    :global(.picker:not(.secondary) .option:nth-child(4)) {
    grid-column: 3 / span 4;
  }

  .fan-style-options.fill.cols-2 :global(.picker:not(.secondary) .option) {
    grid-column: span 6;
  }

  .fan-style-options.fill.cols-2
    :global(.picker:not(.secondary) .option:nth-child(5)) {
    grid-column: 4 / span 6;
  }

  .fan-style-options.fill :global(.picker.secondary .option-grid) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .fan-style-options.fill :global(.option) {
    height: 100%;
    min-height: 0;
  }

  .fan-style-options.fill :global(.preview-frame) {
    height: 100%;
    min-height: 0;
    aspect-ratio: auto;
  }
</style>
