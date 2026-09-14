<!--
  The one Shape Matrix grid: axis headers, tiles, selection, and the fit
  formula that keeps a whole matrix on screen at whole pixels.

  Generic over its axis item so the Theory surface gets the same grid rather
  than a lookalike. What differs between the two surfaces is only how a tile is
  drawn and keyed, so those four things are props; layout, the touch-target
  floor, lazy paint, and the tile-to-hero shared element stay here.
-->
<script lang="ts" generics="TAxis = Flower">
  import type { Snippet } from "svelte";
  import type { ShapeMatrixData } from "../services/shape-matrix-flowers";
  import {
    flowerKey,
    flowerLabel,
    type Flower,
  } from "../domain/flower-signature";
  import { claimedViewTransitionName } from "$lib/shared/transitions/claimed-view-transition-name";
  import {
    cellArtworkSrc,
    headerArtworkSrc,
    shapeMatrixArtworkPainterForColors,
    SHAPE_MATRIX_ACTIVE_STAGE_NAME,
    type ShapeMatrixArtworkPainter,
  } from "../services/shape-matrix-artwork";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import ShapeMatrixMandalaArt from "./ShapeMatrixMandalaArt.svelte";
  import { runShapeMatrixGridReveal } from "../app/services/shape-matrix-reveal";

  type CellVerdict = "legal" | "illegal" | "unsure";

  interface Props {
    /** Required by the default flower painters; unused when painters are given. */
    data?: ShapeMatrixData;
    /** Blue axis items to show as rows (already filtered). */
    rowAxis: TAxis[];
    /** Red axis items to show as columns (already filtered). */
    colAxis: TAxis[];
    /** Upper bound on a cell's edge; the actual size shrinks to fit the viewport. */
    maxCellPx?: number;
    onselect: (pair: { left: TAxis; right: TAxis }) => void;
    /**
     * A header was activated: that axis item alone, on that hand. Without
     * this the headers stay the plain labels they have always been.
     */
    onsolo?: (hand: "left" | "right", item: TAxis) => void;
    /** The hand a header chose, so its header reads as the chosen one. */
    soloHand?: "left" | "right" | null;
    /** Optional externally-owned selection for restored/shared app state. */
    selectedPair?: { left: TAxis; right: TAxis } | null;
    /** Alternative cell/header painter (e.g. the poi trail painter). Defaults to the club-style painter. */
    painter?: ShapeMatrixArtworkPainter;
    /** Per-cell verdict tint (poi-legality curation). Null/undefined = no tint. */
    overlayFor?: (left: TAxis, right: TAxis) => CellVerdict | null | undefined;
    /** Cells to de-emphasize (e.g. already-judged cells in a curation focus view). */
    dimFor?: (left: TAxis, right: TAxis) => boolean;
    /**
     * The selected tile owns the shared tile-to-hero `view-transition-name`
     * while this grid is the visible endpoint. Hosts that show the hero at the
     * same time (wide layouts) leave this off so the name is never doubled.
     */
    claimSelected?: boolean;
    /** Stable identity of an axis item. Defaults to the flower key. */
    keyOf?: (item: TAxis) => string;
    /** Spoken description of an axis item. Defaults to the flower label. */
    labelOf?: (item: TAxis) => string;
    /** Header artwork source at a measured size. Defaults to the flower painter. */
    paintHeader?: (
      item: TAxis,
      hand: "left" | "right",
      sizePx: number
    ) => string;
    /** Cell artwork source at a measured size. Defaults to the flower painter. */
    paintCell?: (left: TAxis, right: TAxis, sizePx: number) => string;
    /** Optional focus feedback from an external axis editor. */
    emphasizedAxis?: "left" | "right" | "both" | null;
    /** Optional guide or action for the otherwise-empty axis intersection. */
    corner?: Snippet;
    /**
     * Changes once per Surprise roll. The grid then plays its reveal over the
     * already-final headers, tiles, and selection; ordinary edits leave it be.
     */
    revealToken?: number;
  }
  let {
    data,
    rowAxis,
    colAxis,
    maxCellPx = 100,
    onselect,
    onsolo,
    soloHand = null,
    selectedPair,
    painter,
    overlayFor,
    dimFor,
    claimSelected = false,
    /*
     * The flower defaults keep every existing consumer calling this component
     * exactly as before. They are the only place the generic axis is narrowed,
     * and they only run when the caller supplied no painter of its own.
     */
    keyOf = ((item: TAxis) => flowerKey(item as Flower)) as (
      item: TAxis
    ) => string,
    labelOf = ((item: TAxis) => flowerLabel(item as Flower)) as (
      item: TAxis
    ) => string,
    paintHeader,
    paintCell,
    emphasizedAxis = null,
    corner,
    revealToken = 0,
  }: Props = $props();

  // Ordinary Matrix grids are part of the user's workspace, so their stills
  // follow the same saved hand inks as the rest of the app. Hosts that supply
  // a painter remain deliberate, fixed artwork (for example POI curation).
  const defaultPainter = $derived(
    shapeMatrixArtworkPainterForColors(getSettings().primaryPropColors)
  );
  const effectivePainter = $derived(painter ?? defaultPainter);
  const painterArtKey = $derived(effectivePainter.cacheKey ?? "");

  /* The reveal answers a token CHANGE after mount. The token the grid mounts
     with (a restored roll, or zero) is a state to show, not a roll to replay. */
  let wrap = $state<HTMLDivElement | null>(null);
  let revealedToken: number | null = null;
  $effect(() => {
    const token = revealToken;
    const host = wrap;
    if (!host) return;
    const previous = revealedToken;
    revealedToken = token;
    if (previous === null || previous === token) return;
    runShapeMatrixGridReveal(host);
  });

  // Track counts for the CSS tile formula: the row-header column and the
  // column-header row join the axes.
  const cols = $derived(colAxis.length + 1);
  const rows = $derived(rowAxis.length + 1);

  // Cells and headers are painted by shape-matrix-artwork with the animation
  // canvas's own guide painter, at each tile's measured size (the primitive
  // measures itself), so the strokes are the animator's strokes from the 44px
  // touch-target floor through the 320px 4K layout.
  const headerPaint = (f: TAxis, hand: "left" | "right") => (sizePx: number) =>
    paintHeader
      ? paintHeader(f, hand, sizePx)
      : data
        ? headerArtworkSrc(data, f as Flower, hand, sizePx, effectivePainter)
        : "";
  const cellPaint = (b: TAxis, r: TAxis) => (sizePx: number) =>
    paintCell
      ? paintCell(b, r, sizePx)
      : data
        ? cellArtworkSrc(
            data,
            b as Flower,
            r as Flower,
            sizePx,
            effectivePainter
          )
        : "";

  let observed = $state(new Set<string>());
  function watch(node: HTMLElement, key: string) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            observed = new Set(observed).add(key);
            io.unobserve(node);
          }
      },
      { rootMargin: "240px" }
    );
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }

  let sel = $state<string | null>(null);
  const selectedKey = $derived(
    soloHand
      ? null
      : selectedPair === undefined
        ? sel
        : selectedPair
          ? `${keyOf(selectedPair.left)}__${keyOf(selectedPair.right)}`
          : null
  );
  /* While one hand is on stage the chosen thing is its header, not a cell:
     the tiles are pairs and none of them is what is playing. */
  const soloKey = $derived(
    soloHand && selectedPair
      ? keyOf(soloHand === "left" ? selectedPair.left : selectedPair.right)
      : null
  );
</script>

<!-- The tile size is container math, not a measurement: it is right in the
     same layout pass that sizes the pane. A shared-element transition captures
     the frame the compact view flips, when a ResizeObserver-fed size would
     still describe the pane the grid was collapsed in. -->
<div
  class="wrap"
  bind:this={wrap}
  style="--cols:{cols}; --rows:{rows}; --cell-max:{maxCellPx}px"
>
  {#if rowAxis.length === 0 || colAxis.length === 0}
    <div class="empty">No flowers match the current filters.</div>
  {:else}
    <table
      class="matrix"
      aria-label="Shape matrix: left-hand flower rows by right-hand flower columns; activate a cell for its TKA realizations"
    >
      <thead>
        <tr>
          <th
            class="corner"
            class:interactive-corner={Boolean(corner)}
            scope="col"
            aria-label={corner ? undefined : "left rows by right columns"}
          >
            {@render corner?.()}
          </th>
          {#each colAxis as rf, colIndex (colIndex)}
            <th
              class="colhead"
              class:axis-emphasized={emphasizedAxis === "right" ||
                emphasizedAxis === "both"}
              scope="col"
              title={labelOf(rf)}
            >
              {#if onsolo}
                <button
                  type="button"
                  class="head-button"
                  class:solo={soloHand === "right" && soloKey === keyOf(rf)}
                  aria-label={`Play right ${labelOf(rf)} on its own`}
                  aria-pressed={soloHand === "right" && soloKey === keyOf(rf)}
                  onclick={() => onsolo("right", rf)}
                >
                  <ShapeMatrixMandalaArt
                    paint={headerPaint(rf, "right")}
                    artKey={`right:${keyOf(rf)}:${painterArtKey}`}
                    alt={`right ${labelOf(rf)}`}
                  />
                </button>
              {:else}
                <ShapeMatrixMandalaArt
                  paint={headerPaint(rf, "right")}
                  artKey={`right:${keyOf(rf)}:${painterArtKey}`}
                  alt={`right ${labelOf(rf)}`}
                />
              {/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rowAxis as bf, rowIndex (rowIndex)}
          <tr>
            <th
              class="rowhead"
              class:axis-emphasized={emphasizedAxis === "left" ||
                emphasizedAxis === "both"}
              scope="row"
              title={labelOf(bf)}
            >
              {#if onsolo}
                <button
                  type="button"
                  class="head-button"
                  class:solo={soloHand === "left" && soloKey === keyOf(bf)}
                  aria-label={`Play left ${labelOf(bf)} on its own`}
                  aria-pressed={soloHand === "left" && soloKey === keyOf(bf)}
                  onclick={() => onsolo("left", bf)}
                >
                  <ShapeMatrixMandalaArt
                    paint={headerPaint(bf, "left")}
                    artKey={`left:${keyOf(bf)}:${painterArtKey}`}
                    alt={`left ${labelOf(bf)}`}
                  />
                </button>
              {:else}
                <ShapeMatrixMandalaArt
                  paint={headerPaint(bf, "left")}
                  artKey={`left:${keyOf(bf)}:${painterArtKey}`}
                  alt={`left ${labelOf(bf)}`}
                />
              {/if}
            </th>
            {#each colAxis as rf, colIndex (colIndex)}
              {@const key = `${keyOf(bf)}__${keyOf(rf)}`}
              {@const slotKey = `${rowIndex}:${colIndex}`}
              {@const verdict = overlayFor?.(bf, rf) ?? null}
              <td class="cell-td">
                <button
                  type="button"
                  class="cell"
                  class:sel={selectedKey === key}
                  class:v-legal={verdict === "legal"}
                  class:v-illegal={verdict === "illegal"}
                  class:v-unsure={verdict === "unsure"}
                  class:dim={dimFor?.(bf, rf) ?? false}
                  use:watch={slotKey}
                  use:claimedViewTransitionName={{
                    name: SHAPE_MATRIX_ACTIVE_STAGE_NAME,
                    enabled: claimSelected && selectedKey === key,
                  }}
                  aria-label={`left ${labelOf(bf)} over right ${labelOf(rf)}`}
                  aria-pressed={selectedKey === key}
                  onclick={() => {
                    sel = key;
                    onselect({ left: bf, right: rf });
                  }}
                >
                  {#if observed.has(slotKey)}
                    <span class="artwork">
                      <ShapeMatrixMandalaArt
                        paint={cellPaint(bf, rf)}
                        artKey={`${key}:${painterArtKey}`}
                        claim={claimSelected && selectedKey === key}
                      />
                    </span>
                  {/if}
                  <!-- Colour alone did not name the chosen crossing among
                       sixteen red and blue mandalas. As on the relationship
                       chips, the mark sits on the corner of every tile and
                       shows on the chosen one, so choosing moves nothing. -->
                  <span class="sel-mark" aria-hidden="true">
                    <i class="fas fa-check"></i>
                  </span>
                </button>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .wrap {
    overflow: auto;
    display: grid;
    height: 100%;
    place-content: safe center;
    background: var(--theme-panel-bg, #0a0f14);
    container-type: size;
    /* The header row and column each carry a 1px stroke outside the tile
       tracks; the fit formula leaves room for it or the table overflows by
       a pixel and grows a scrollbar. */
    --header-stroke: 2px;
    /* Fit the whole grid (headers + cells) into the viewport at whole pixels,
       never below the 44px AAA touch-target floor. When it cannot fit at 44px
       (a large axis on a small viewport) it overflows and scrolls. */
    --cell: round(
      down,
      clamp(
        44px,
        min(
          (100cqw - var(--header-stroke)) / var(--cols),
          (100cqh - var(--header-stroke)) / var(--rows)
        ),
        var(--cell-max)
      ),
      1px
    );
  }
  .empty {
    padding: 48px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.82));
    text-align: center;
    font-size: var(--font-size-min, 14px);
  }

  table.matrix {
    border-collapse: separate;
    border-spacing: 0;
    width: max-content;
    margin: auto;
  }
  th,
  td {
    padding: 0;
  }

  /* The table needs this cell to align its sticky row and column headers. It is
     visually neutral because the colored flower headers already identify both
     axes; another left/right legend reads like a selectable matrix result. */
  .corner {
    position: sticky;
    top: 0;
    left: 0;
    z-index: 5;
    width: var(--cell);
    height: var(--cell);
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, #111922);
  }

  .corner.interactive-corner {
    overflow: hidden;
  }

  .colhead {
    position: sticky;
    top: 0;
    z-index: 4;
    width: var(--cell);
    height: var(--cell);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, #111922);
  }
  .rowhead {
    position: sticky;
    left: 0;
    z-index: 3;
    width: var(--cell);
    height: var(--cell);
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, #111922);
  }

  .colhead,
  .rowhead {
    transition:
      background var(--duration-fast, 150ms) var(--transition-easing, ease),
      box-shadow var(--duration-fast, 150ms) var(--transition-easing, ease);
  }

  .colhead.axis-emphasized {
    background: color-mix(
      in srgb,
      var(--prop-red, #ed1c24) 14%,
      var(--theme-card-bg, #111922)
    );
    box-shadow: inset 0 0 0 2px
      color-mix(in srgb, var(--prop-red-text, #f87171) 72%, transparent);
  }

  .rowhead.axis-emphasized {
    background: color-mix(
      in srgb,
      var(--prop-blue, #2e3192) 18%,
      var(--theme-card-bg, #111922)
    );
    box-shadow: inset 0 0 0 2px
      color-mix(in srgb, var(--prop-blue-text, #818cf8) 72%, transparent);
  }
  /* The art fills the header's content box. Sized to the tile itself it sat
     one border wider than its cell and the whole table overflowed its
     viewport by a few pixels, which is a scrollbar under a grid that fits. */
  /* A header is a button when the host offers the solo: the whole cell, so
     the artwork is the target, with the pressed ring the tiles use. */
  .head-button {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition:
      border-color var(--duration-fast, 150ms) ease,
      background var(--duration-fast, 150ms) ease;
  }

  .head-button:hover {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 45%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 8%,
      transparent
    );
  }

  .head-button:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: -2px;
  }

  .head-button.solo {
    border-color: var(--theme-accent, #f59e0b);
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 14%,
      transparent
    );
  }

  @media (prefers-reduced-motion: reduce) {
    .head-button {
      transition: none;
    }
  }

  .colhead :global(.mandala-art),
  .rowhead :global(.mandala-art) {
    width: 100%;
    height: 100%;
    aspect-ratio: 1;
  }

  .cell-td {
    width: var(--cell);
    height: var(--cell);
  }
  .cell {
    position: relative;
    width: var(--cell);
    height: var(--cell);
    aspect-ratio: 1;
    display: block;
    padding: 0;
    margin: 0;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    background: transparent;
    cursor: pointer;
    /* Hover and focus answer inside the cell's own box: a background wash and
       an inset ring, so the grid never shifts. Named properties only. */
    transition:
      background var(--duration-fast, 150ms) var(--transition-easing, ease),
      box-shadow var(--duration-fast, 150ms) var(--transition-easing, ease);
  }
  .artwork {
    position: absolute;
    inset: 0;
    display: block;
    transform-origin: 50% 50%;
    transition: transform var(--duration-fast, 150ms)
      var(--transition-easing, ease);
  }
  .cell:hover,
  .cell:focus-visible {
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 18%,
      transparent
    );
    box-shadow: inset 0 0 0 2px var(--theme-accent, #f59e0b);
    z-index: 2;
  }
  /* The artwork itself answers the pointer, but only where hovering is a
     deliberate act. Touch pointers get the ring and wash alone. */
  @media (hover: hover) and (pointer: fine) {
    .cell:hover .artwork,
    .cell:focus-visible .artwork {
      transform: scale(1.08);
    }
  }
  /* The chosen crossing advances on four axes at once, as the chosen
     relationship chip does: ring, wash, glow, mark. A hairline ring alone
     was lost among sixteen red and blue mandalas. */
  .cell.sel {
    outline: none;
    z-index: 2;
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 16%,
      transparent
    );
  }
  .cell.sel::after {
    content: "";
    position: absolute;
    inset: 1px;
    z-index: 2;
    border: 2px solid var(--theme-accent, #f59e0b);
    border-radius: 3px;
    box-shadow:
      inset 0 0 1rem
        color-mix(in srgb, var(--theme-accent, #f59e0b) 30%, transparent),
      0 0 0.75rem
        color-mix(in srgb, var(--theme-accent, #f59e0b) 45%, transparent);
    pointer-events: none;
    transition: opacity var(--duration-fast, 150ms)
      var(--transition-easing, ease);
  }
  .sel-mark {
    position: absolute;
    top: 0.3rem;
    inset-inline-end: 0.3rem;
    z-index: 3;
    display: grid;
    place-items: center;
    width: clamp(0.85rem, calc(var(--cell) * 0.13), 1.5rem);
    height: clamp(0.85rem, calc(var(--cell) * 0.13), 1.5rem);
    border-radius: 999px;
    /* A light tint of the accent, as on the chips: the accent at full
       strength is mid-dark in several themes and a small mark on it read
       as a coloured dot rather than a check. */
    background: color-mix(in srgb, var(--theme-accent, #f59e0b) 32%, white);
    box-shadow: 0 0 0 2px var(--theme-panel-bg, #101721);
    color: #06090d;
    font-size: clamp(0.5rem, calc(var(--cell) * 0.065), 0.8rem);
    opacity: 0;
    transform: scale(0.5);
    pointer-events: none;
    transition:
      opacity var(--duration-fast, 150ms) var(--transition-easing, ease),
      transform var(--duration-fast, 150ms) var(--transition-easing, ease);
  }
  .cell.sel .sel-mark {
    opacity: 1;
    transform: scale(1);
  }
  /* The selected tile's box is the rectangle that flies to the detail stage.
     Its hairline rings would scale into thick bands mid-flight; the flat
     wash scales cleanly, so only the rings step aside for the morph. */
  :global(html.shape-matrix-morph) .cell.sel::after {
    opacity: 0;
  }
  :global(html.shape-matrix-morph) .cell.sel .sel-mark {
    opacity: 0;
  }
  :global(html.shape-matrix-morph) .cell:hover,
  :global(html.shape-matrix-morph) .cell:focus-visible {
    box-shadow: none;
  }
  .cell:focus-visible {
    outline: 2px solid var(--theme-text, #fff);
    outline-offset: -2px;
    z-index: 2;
    position: relative;
  }

  /* Verdict tints: inset ring + wash, so the cell box never changes size. */
  .cell.v-legal {
    box-shadow: inset 0 0 0 2px
      color-mix(in srgb, var(--semantic-success, #4ade80) 85%, transparent);
    background: color-mix(
      in srgb,
      var(--semantic-success, #4ade80) 12%,
      transparent
    );
  }
  .cell.v-illegal {
    box-shadow: inset 0 0 0 2px
      color-mix(in srgb, var(--semantic-error, #f87171) 85%, transparent);
    background: color-mix(
      in srgb,
      var(--semantic-error, #f87171) 14%,
      transparent
    );
  }
  .cell.v-unsure {
    box-shadow: inset 0 0 0 2px
      color-mix(in srgb, var(--semantic-warning, #facc15) 80%, transparent);
    background: color-mix(
      in srgb,
      var(--semantic-warning, #facc15) 10%,
      transparent
    );
  }
  .cell.dim {
    opacity: 0.25;
  }

  /* The Surprise reveal names the chosen crossing: its row and column
     headers light in their hand colour and the tile's ring brightens, then
     all three settle back to the ordinary selection. */
  .rowhead:global(.reveal-chosen) {
    background: color-mix(
      in srgb,
      var(--prop-blue, #2e3192) 34%,
      var(--theme-card-bg, #111922)
    );
    box-shadow: inset 0 0 0 2px var(--prop-blue-text, #818cf8);
  }
  .colhead:global(.reveal-chosen) {
    background: color-mix(
      in srgb,
      var(--prop-red, #ed1c24) 26%,
      var(--theme-card-bg, #111922)
    );
    box-shadow: inset 0 0 0 2px var(--prop-red-text, #f87171);
  }
  .cell:global(.reveal-chosen) {
    z-index: 3;
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 22%,
      transparent
    );
    box-shadow: inset 0 0 0 2px var(--theme-accent, #f59e0b);
  }

  @media (prefers-reduced-motion: reduce) {
    .cell,
    .artwork,
    .sel-mark,
    .colhead,
    .rowhead {
      transition: none;
    }
    /* The ring and wash still answer; only the artwork motion is dropped. */
    .cell:hover .artwork,
    .cell:focus-visible .artwork {
      transform: none;
    }
  }
</style>
