<!--
CustomizeOverview.svelte - the Customize panel's landing screen.

Three tiles, one per setting, each holding the real thing rather than a
picture of it. The Style tile holds the same three segmented controls the
Style screen used to open, so Props, Hands and Dashes change right here. The
Start and End tiles show the sixteen placement pictographs drawn by the same
renderer the picker uses, in the picker's order, bright when allowed and
dimmed when blocked; tapping one opens that picker.

The tiles replace the drill panel's plain text rows through its `listContent`
slot. Navigation still belongs to SettingsDrillPanel: a placement tile only
reports which setting was chosen.

Layout follows the panel, not the window, and never scrolls on a panel with
room for the rows: fitOverview (customize-overview-layout.ts) measures the box
and picks the arrangement that draws the previews largest. Where none draws
them readably, the placement tiles drop their previews and open their pickers
like rows; on the smallest panels Style becomes a row too. A preview that is
dropped stays mounted, hidden, so the panel never rebuilds its pictographs
when it moves between a small box and a large one.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type {
    GenerationDashChoice,
    GenerationMotionTypeFilter,
    GenerationStyleAxis,
    GenerationStylePolicy,
  } from "#lib/shared/create/domain/generation-style.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import {
    GridMode,
    type GridPlacement,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { getLetterBorderColorSafe } from "#lib/shared/pictograph/shared/utils/letter-border-utils.js";
  import {
    loadStartPlacementVariations,
    orientStartPlacementVariations,
  } from "#lib/shared/components/placement-picker/placement-variations.js";
  import GenerationStylePanel from "#lib/shared/create/components/GenerationStylePanel.svelte";
  import {
    fitOverview,
    type OverviewLayout,
  } from "./customize-overview-layout";

  type OverviewScreen = "style" | "startPos" | "endPos";

  let {
    gridMode = GridMode.DIAMOND,
    constraintPreset,
    handPathMode,
    motionTypeFilter,
    styleBaseline,
    haptic,
    onPropsChange,
    onHandsChange,
    onDashesChange,
    styleValue,
    startBlocked,
    startValue,
    leftStartOrientation = Orientation.IN,
    rightStartOrientation = Orientation.IN,
    endAllowed,
    endValue,
    endLocked,
    onOpen,
  }: {
    gridMode?: GridMode;
    constraintPreset: GenerationStyleAxis;
    handPathMode: GenerationStyleAxis;
    motionTypeFilter: GenerationMotionTypeFilter;
    styleBaseline?: GenerationStylePolicy;
    haptic: HapticFeedback | null;
    onPropsChange: (v: GenerationStyleAxis) => void;
    onHandsChange: (v: GenerationStyleAxis) => void;
    onDashesChange: (v: GenerationDashChoice) => void;
    /** The three style choices in words, for the Style row on a small panel. */
    styleValue: string;
    /** Start placements the generator may NOT use. */
    startBlocked: readonly GridPlacement[];
    startValue: string;
    /** Start orientation per hand, so the preview props point the way the
     *  picker's will. */
    leftStartOrientation?: Orientation;
    rightStartOrientation?: Orientation;
    /** End placements the generator may use. Empty means any. */
    endAllowed: readonly GridPlacement[];
    endValue: string;
    /** LOOP decides where a sequence ends, so the tile explains and stays put. */
    endLocked: boolean;
    onOpen: (screen: OverviewScreen) => void;
  } = $props();

  // The same sixteen pictographs the picker draws, loaded through the helper
  // it loads them with. Effects do not run on the server, so the grid starts
  // empty there and fills on the client; the art box reserves its square
  // either way.
  let variations = $state<PictographData[]>([]);

  $effect(() => {
    variations = loadStartPlacementVariations(gridMode);
  });

  const displayVariations = $derived(
    orientStartPlacementVariations(
      variations,
      leftStartOrientation,
      rightStartOrientation
    )
  );

  const startBlockedSet = $derived(new Set(startBlocked));
  const endAllowedSet = $derived(new Set(endAllowed));

  function startOn(p: GridPlacement) {
    return !startBlockedSet.has(p);
  }

  function endOn(p: GridPlacement) {
    return endAllowedSet.size === 0 || endAllowedSet.has(p);
  }

  let frame = $state<HTMLElement | null>(null);
  let styleTile = $state<HTMLElement | null>(null);
  let note = $state<HTMLElement | null>(null);
  let startHead = $state<HTMLElement | null>(null);
  let layout = $state<OverviewLayout>("top");
  let gridSize = $state(0);
  let styleColumn = $state(0);

  // The Style tile's height at another width: set the width, read the
  // height, put it back. Two reads per resize, on a tile of a few controls.
  function styleHeightAt(width: number): number {
    if (!styleTile) return 0;
    const previous = styleTile.style.width;
    styleTile.style.width = `${width}px`;
    const height = styleTile.offsetHeight;
    styleTile.style.width = previous;
    return height;
  }

  function fit() {
    if (!frame || !note || !startHead) return;
    const width = frame.clientWidth;
    const height = frame.clientHeight;
    // Parked out of sight between opens (ExpandedCardStage): keep the last
    // arrangement, so the next open in the same panel changes nothing.
    if (width === 0 || height === 0) return;
    const next = fitOverview({
      width,
      height,
      rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
      noteHeight: note.offsetHeight,
      headHeight: startHead.offsetHeight,
      styleHeightAt,
    });
    layout = next.layout;
    gridSize = next.gridSize;
    styleColumn = next.styleColumn;
  }

  // A ResizeObserver reports after layout and before paint, so the panel is
  // first drawn already arranged, including on the frame it moves into a
  // stage.
  $effect(() => {
    if (!frame) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(frame);
    return () => observer.disconnect();
  });
</script>

{#snippet chevron()}
  <svg
    class="tile-chevron"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    aria-hidden="true"
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
{/snippet}

{#snippet lock()}
  <svg
    class="tile-lock"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      d="M12 17a2 2 0 002-2v-2a2 2 0 00-4 0v2a2 2 0 002 2zm6-9h-1V6a5 5 0 00-10 0v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zM8.9 6a3.1 3.1 0 016.2 0v2H8.9V6z"
    />
  </svg>
{/snippet}

<!-- The picker's cells, minus the toggle: same renderer, same order, same
     bright/dim treatment, so the tile is a faithful preview of the screen it
     opens. Decorative here; the tile's words carry the accessible name. -->
{#snippet placementGrid(isOn: (p: GridPlacement) => boolean)}
  <span class="tile-art" aria-hidden="true">
    <span class="placement-grid">
      {#each displayVariations as variation (variation.id)}
        {@const placement = variation.startPlacement as GridPlacement}
        {@const on = isOn(placement)}
        <span
          class="placement-cell"
          class:on
          class:off={!on}
          style:--letter-border-color={getLetterBorderColorSafe(
            variation.letter
          )}
        >
          <span class="pictograph-wrapper">
            <!-- No per-pictograph fade: the tiles arrive inside the card's
                 morph, which already fades the panel in, and thirty-two fades
                 starting in its first frames cost the morph frames. -->
            <PictographContainer
              pictographData={variation}
              disableContentTransitions
            />
          </span>
          {#if !on}
            <span class="off-overlay">
              <svg
                class="x-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </span>
          {/if}
        </span>
      {/each}
    </span>
  </span>
{/snippet}

<div class="customize-overview drill-grow" bind:this={frame}>
  <div
    class="overview-body"
    data-layout={layout}
    style:--grid-size={gridSize ? `${gridSize}px` : null}
    style:--style-column={styleColumn ? `${styleColumn}px` : null}
  >
    <div class="tiles">
      {#if layout === "rows"}
        <button
          class="tile placement-tile style-row"
          type="button"
          onclick={() => onOpen("style")}
        >
          <span class="tile-head">
            <span class="tile-text">
              <span class="tile-name">{t("create_ui_style_label")}</span>
              <span class="tile-value">{styleValue}</span>
            </span>
            {@render chevron()}
          </span>
        </button>
      {/if}

      <!-- Kept in the layout when Style is a row, out of sight and out of the
           tab order, because fitting measures it to decide when it returns. -->
      <section
        class="tile style-tile"
        bind:this={styleTile}
        inert={layout === "rows"}
        aria-hidden={layout === "rows" ? "true" : undefined}
      >
        <span class="tile-head">
          <span class="tile-text">
            <span class="tile-name">{t("create_ui_style_label")}</span>
          </span>
        </span>
        <GenerationStylePanel
          arrangement="columns"
          {constraintPreset}
          {handPathMode}
          {motionTypeFilter}
          baseline={styleBaseline}
          {haptic}
          {onPropsChange}
          {onHandsChange}
          {onDashesChange}
        />
      </section>

      <button
        class="tile placement-tile start-tile"
        type="button"
        onclick={() => onOpen("startPos")}
      >
        <span class="tile-head" bind:this={startHead}>
          <span class="tile-text">
            <span class="tile-name">{t("create_ui_start_placement_label")}</span
            >
            <span class="tile-value">{startValue}</span>
          </span>
          {@render chevron()}
        </span>
        {@render placementGrid(startOn)}
      </button>

      <!-- Locked rather than removed: dropping the tile would shift the layout
         and leave someone who saw the setting once with no explanation. It
         stays focusable so a screen reader still hears why. -->
      <button
        class="tile placement-tile end-tile"
        class:locked={endLocked}
        type="button"
        aria-disabled={endLocked}
        onclick={() => {
          if (!endLocked) onOpen("endPos");
        }}
      >
        <span class="tile-head">
          <span class="tile-text">
            <span class="tile-name">{t("create_ui_end_placement_label")}</span>
            {#if endLocked}
              <span class="tile-value locked-reason">
                {@render lock()}
                {t("create_ui_set_by_loop")}
              </span>
            {:else}
              <span class="tile-value">{endValue}</span>
            {/if}
          </span>
          {#if !endLocked}
            {@render chevron()}
          {/if}
        </span>
        {@render placementGrid(endOn)}
      </button>
    </div>

    <!-- These settings persist across sessions, which is what made a saved
       Choppy props value look like a broken generator. -->
    <p class="overview-note" bind:this={note}>
      {t("create_deep_settings_persist_note")}
    </p>
  </div>
</div>

<style>
  .customize-overview {
    /* Size containment: the overview takes the drill body's box whatever its
       tiles hold, so the box it measures is the box it was given. On a panel
       too small even for the rows, the tiles overflow into the body's
       scroller. */
    contain: size;
  }

  .overview-body {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    height: 100%;
  }

  .tiles {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 0.75rem;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    margin: 0;
    padding: 0.875rem;
    background: color-mix(in srgb, var(--theme-text, white) 6%, transparent);
    border: 1px solid
      color-mix(in srgb, var(--theme-text, white) 12%, transparent);
    border-radius: 1rem;
    color: var(--theme-text, white);
    font: inherit;
    text-align: start;
  }

  .placement-tile {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      background-color var(--duration-fast) ease,
      border-color var(--duration-fast) ease,
      transform var(--duration-fast) ease;
  }

  @media (hover: hover) {
    .placement-tile:not(.locked):hover {
      background: color-mix(in srgb, var(--theme-text, white) 10%, transparent);
      border-color: color-mix(
        in srgb,
        var(--customize-accent, var(--theme-accent)) 55%,
        transparent
      );
    }
  }

  .placement-tile:not(.locked):active {
    transform: scale(0.99);
    transition-duration: var(--duration-instant);
  }

  .placement-tile:focus-visible {
    outline: 2px solid var(--theme-text, white);
    outline-offset: 2px;
  }

  .placement-tile.locked {
    cursor: default;
  }

  .placement-tile.locked .tile-art {
    opacity: 0.45;
  }

  .tile-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
  }

  .tile-text {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .tile-name {
    font-size: var(--font-size-base, 1rem);
    font-weight: 600;
    line-height: 1.25;
  }

  .tile-value {
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.35;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    overflow-wrap: anywhere;
  }

  .locked-reason {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
  }

  .tile-lock {
    flex: 0 0 auto;
    width: 0.875rem;
    height: 0.875rem;
  }

  .tile-chevron {
    flex: 0 0 auto;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  /* ── Placement preview: the picker's sixteen cells in its own order ── */

  /* Square, reserved before the pictographs arrive, so the tile never grows
     when they do. */
  .tile-art {
    display: block;
    width: var(--grid-size, min(100%, 20rem));
    aspect-ratio: 1;
    margin-inline: auto;
  }

  /* Rows: the preview stays mounted but takes no room, and the tile reads as
     its head alone, a row that opens the picker. */
  [data-layout="style-rows"] .tile-art,
  [data-layout="rows"] .tile-art {
    display: none;
  }

  [data-layout="rows"] .style-tile {
    position: absolute;
    inset-inline: 0;
    visibility: hidden;
  }

  .placement-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.25rem;
    width: 100%;
    height: 100%;
  }

  .placement-cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    min-width: 0;
    padding: 2px;
    border: 1.5px solid transparent;
    border-radius: 0.375rem;
    overflow: hidden;
    transition:
      background-color var(--duration-normal) ease,
      border-color var(--duration-normal) ease,
      opacity var(--duration-normal) ease;
  }

  .placement-cell.on {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.12));
    border-color: var(--letter-border-color, rgba(100, 200, 255, 0.6));
  }

  .placement-cell.off {
    background: rgba(0, 0, 0, 0.2);
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    opacity: 0.5;
  }

  .pictograph-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .pictograph-wrapper :global(.pictograph),
  .pictograph-wrapper :global(.pictograph svg) {
    width: 100%;
    height: 100%;
  }

  .off-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
  }

  .x-icon {
    width: 40%;
    height: 40%;
    color: rgba(255, 100, 100, 0.8);
  }

  .overview-note {
    flex: 0 0 auto;
    margin: auto 0 0;
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.4;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    text-align: center;
  }

  /* Style across the top, the two placement tiles side by side under it. */
  [data-layout="top"] .tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-areas:
      "style style"
      "start end";
    gap: 1rem;
  }

  /* Style in a column on the left, the placement tiles beside it: a wide,
     short panel has the width for three columns and not the height for two
     rows. */
  [data-layout="side"] .tiles {
    grid-template-columns: var(--style-column) repeat(2, minmax(0, 1fr));
    grid-template-areas: "style start end";
    gap: 1rem;
  }

  [data-layout="top"] .style-tile,
  [data-layout="side"] .style-tile {
    grid-area: style;
  }

  [data-layout="top"] .start-tile,
  [data-layout="side"] .start-tile {
    grid-area: start;
  }

  [data-layout="top"] .end-tile,
  [data-layout="side"] .end-tile {
    grid-area: end;
  }

  @media (prefers-reduced-motion: reduce) {
    .placement-tile,
    .placement-cell {
      transition: none;
    }
  }
</style>
