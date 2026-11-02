<!-- packages/shape-engine/src/app/components/ShapeMatrixRibbonCell.svelte
  One bento cell of the Shape Matrix header ribbon: a caption row over its
  control, carrying the card chrome the ribbon's cells share. Extracted when
  the Theory surface needed the same cell for Timing and Direction that the
  Matrix surface already used for Apply to. -->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    label: string;
    /** Right-aligned addendum inside the caption, e.g. a "3 of 14" readout. */
    note?: Snippet;
    /** Tray cells sit in the compact popover and always show their caption. */
    tray?: boolean;
    /** Hold the caption at full size in a compact ribbon. */
    keepLabel?: boolean;
    /** A definite width for controls whose indicator wants equal segments. */
    controlWidth?: string;
    children: Snippet;
  }
  let {
    label,
    note,
    tray = false,
    keepLabel = false,
    controlWidth,
    children,
  }: Props = $props();
</script>

<div
  class="control-cell"
  class:tray
  class:keep-label={keepLabel}
  style={controlWidth ? `--cell-control-w: ${controlWidth}` : undefined}
  class:sized={Boolean(controlWidth)}
>
  <span class="control-label">
    {label}
    {#if note}{@render note()}{/if}
  </span>
  {@render children()}
</div>

<style>
  .control-cell {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    align-items: center;
    justify-items: start;
    gap: 0.3rem;
    /* A ribbon cell holds its content width. Only the turn scroller opts into
       shrinking, because it alone can scroll what does not fit; letting every
       cell shrink squeezes the fixed controls beside it. */
    flex: 0 0 auto;
    min-width: 0;
    padding: 0.45rem 0.55rem 0.5rem;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.09));
    border-radius: 12px;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #101721) 82%,
      transparent
    );
    box-shadow: inset 0 1px 0
      color-mix(in srgb, var(--theme-text, #fff) 3.5%, transparent);
  }

  .control-label {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.52));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* SegmentedControl's sliding indicator assumes equal-width segments, so a
     caller with short labels hands it a definite width. */
  .control-cell.sized :global(.segmented-control) {
    width: var(--cell-control-w);
  }

  .control-cell.tray {
    justify-items: start;
    padding: 0.5rem 0.6rem 0.55rem;
  }

  @container shape-matrix-app (max-width: 74.99rem) or (max-height: 41.99rem) {
    /* Compact ribbons trade captions for canvas; the tray keeps them, and a
       cell may opt out when its caption is the signal it can least afford to
       drop. */
    .control-cell:not(.tray):not(.keep-label) .control-label {
      display: none;
    }

    .control-cell:not(.tray).keep-label .control-label {
      font-size: 0;
      gap: 0;
    }

    .control-cell:not(.tray) {
      gap: 0;
      padding: 0.25rem 0.35rem;
      border-radius: 10px;
    }
  }

  @container shape-matrix-app (max-width: 25rem) {
    /* The vertical stack has room for captions again, and a first-time phone
       viewer needs them more than anyone. */
    .control-cell:not(.tray) .control-label {
      display: flex;
      font-size: var(--font-size-compact, 0.75rem);
      gap: 0.4rem;
    }

    .control-cell:not(.tray) {
      gap: 0.25rem;
      padding: 0.35rem 0.45rem 0.45rem;
    }
  }
</style>
