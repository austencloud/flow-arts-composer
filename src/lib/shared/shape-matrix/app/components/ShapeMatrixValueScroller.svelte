<!-- src/lib/shared/shape-matrix/app/components/ShapeMatrixValueScroller.svelte
  The Shape Matrix ribbon's long-list value picker: a caption with an
  "N of M" position readout, prev/next steppers, and a scrolling segmented
  control whose selection is always brought into view.

  A first-time viewer can read the turn row as a caption on the grid rather
  than as the thing that changes it, and conclude the app is one 4x4 matrix.
  The readout, steppers, and segment chrome are the signals that correct it. -->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import ShapeMatrixRibbonCell from "./ShapeMatrixRibbonCell.svelte";

  interface ScrollerOption {
    value: string;
    label: string;
    shortLabel?: string;
    tone?: string;
    disabled?: boolean;
  }

  interface Props {
    label: string;
    /** Every option shown, including any disabled "Mixed" placeholder. */
    options: ScrollerOption[];
    /** The steppable keys, in order. Placeholders are left out. */
    keys: string[];
    value: string;
    onchange: (key: string) => void;
    layout?: "ribbon" | "tray";
    ariaLabel?: string;
  }
  let {
    label,
    options,
    keys,
    value,
    onchange,
    layout = "ribbon",
    ariaLabel,
  }: Props = $props();

  const count = $derived(keys.length);
  const index = $derived(keys.indexOf(value));
  const showStepper = $derived(layout === "ribbon" && count > 1);

  function step(delta: number): void {
    const next = index + delta;
    if (index < 0 || next < 0 || next >= count) return;
    const key = keys[next];
    if (key !== undefined) onchange(key);
  }

  /*
   * Stepping past the viewport edge must bring its value into view, or the
   * button appears to do nothing on the values that are currently clipped.
   */
  let viewport = $state<HTMLDivElement | null>(null);
  $effect(() => {
    const at = index;
    const host = viewport;
    if (!host || at < 0) return;
    const optionIndex = options.findIndex(
      (option) => option.value === keys[at]
    );
    if (optionIndex < 0) return;
    const segment = host.querySelectorAll<HTMLElement>(".segment")[optionIndex];
    segment?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
      inline: "nearest",
    });
  });

  /*
   * Level 3 lists eight values and Level 4 lists thirty. One row of those in a
   * popover is a long thin scroller: the values run off the edge, and the ones
   * still on screen are the narrowest, hardest targets in the app. The tray
   * wraps them onto more rows and spends the room it saves on full-size
   * segments. The ribbon has real width on a wide screen, so it keeps one row.
   */
  const TRAY_SINGLE_ROW_LIMIT = 6;
  /** The narrowest a wrapped segment may get, holding the touch-target floor. */
  const TRAY_MIN_SEGMENT_PX = 48;
  /*
   * The popover is portalled and sized by its own content, so its box cannot
   * say how much room the row has. The window can: the popover caps itself at
   * the viewport less its collision padding.
   */
  let viewportWidth = $state(1280);
  const trayColumns = $derived.by(() => {
    if (layout !== "tray") return undefined;
    const total = options.length;
    if (total <= TRAY_SINGLE_ROW_LIMIT) return undefined;
    const room = Math.max(
      2,
      Math.floor((viewportWidth - 44) / TRAY_MIN_SEGMENT_PX)
    );
    const twoRows = Math.ceil(total / 2);
    if (room >= twoRows) return twoRows;
    // A phone cannot hold seven full-size segments side by side, so it takes
    // another row rather than shrink them under the floor.
    const rows = Math.min(6, Math.ceil(total / room));
    return Math.ceil(total / rows);
  });
</script>

<svelte:window bind:innerWidth={viewportWidth} />

<div class="scroller-host" class:tray={layout === "tray"}>
  <ShapeMatrixRibbonCell {label} tray={layout === "tray"} keepLabel>
    {#snippet note()}
      {#if showStepper && index >= 0}
        <span class="position"
          >{t("shape_engine_value_position", {
            current: index + 1,
            total: count,
          })}</span
        >
      {/if}
    {/snippet}
    <div class="value-row">
      {#if showStepper}
        <button
          type="button"
          class="value-step"
          onclick={() => step(-1)}
          disabled={index <= 0}
          aria-label={t("shape_engine_previous_generic", {
            label,
          })}
        >
          <i class="fas fa-chevron-left" aria-hidden="true"></i>
        </button>
      {/if}
      <div class="value-viewport themed-scrollbar-accent" bind:this={viewport}>
        <div
          class="value-control"
          style="--value-option-count: {options.length}; --value-columns: {trayColumns ??
            options.length}"
        >
          <!-- The value is read and chosen, not a caption, so it keeps the
               14px essential-text step in both layouts. Tight density is what
               keeps a long band on one line. -->
          <SegmentedControl
            {options}
            {value}
            onchange={(key: string) => onchange(key)}
            columns={trayColumns}
            size="md"
            density={trayColumns ? "standard" : "tight"}
            color="accent"
            semantics="radiogroup"
            ariaLabel={ariaLabel ?? label}
          />
        </div>
      </div>
      {#if showStepper}
        <button
          type="button"
          class="value-step"
          onclick={() => step(1)}
          disabled={index < 0 || index >= count - 1}
          aria-label={t("shape_engine_next_generic", {
            label,
          })}
        >
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
      {/if}
    </div>
  </ShapeMatrixRibbonCell>
</div>

<style>
  .scroller-host {
    display: contents;
  }

  /* The one cell in the ribbon that yields: it owns a scrolling viewport, so
     it can give room back to its neighbours and still reach every value. */
  .scroller-host:not(.tray) :global(.control-cell) {
    flex: 0 1 auto;
    min-width: 0;
  }

  /* The caption carries the count. "1 of 14" is the whole correction: it says
     out loud that the grid on screen is one of fourteen, which the row of
     values alone never managed to. */
  .position {
    color: color-mix(in srgb, var(--theme-accent, #f59e0b) 82%, #fff);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    text-transform: none;
  }

  .value-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
    /* The cell justifies its rows to the start, which sizes them to content.
       A thirty-value band's content is wider than the cell, so without this
       the row spills over Timing and Direction instead of scrolling. */
    width: 100%;
  }

  /* Only the values scroll. The steppers sit outside the scrolling box so they
     stay reachable at both ends of a long list. */
  .value-viewport {
    min-width: 0;
    overflow-x: auto;
    scrollbar-gutter: stable;
  }

  .scroller-host.tray .value-viewport {
    overflow: visible;
    scrollbar-gutter: auto;
  }

  .value-step {
    display: inline-flex;
    flex: 0 0 auto;
    width: var(--min-touch-target, 44px);
    min-width: var(--min-touch-target, 44px);
    align-self: stretch;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.16));
    border-radius: 8px;
    background: color-mix(in srgb, var(--theme-text, #fff) 6%, transparent);
    color: var(--theme-text, #fff);
    font-size: 0.8rem;
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast);
  }

  .value-step:hover:not(:disabled) {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 62%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 16%,
      transparent
    );
  }

  .value-step:disabled {
    opacity: 0.34;
    cursor: default;
  }

  .value-step:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }

  /* Unselected values were bare text on the panel, which reads as a printed
     scale rather than a row of buttons. A hairline and a lifted ground make
     each one look pressable; the selected indicator still outranks them. */
  .scroller-host:not(.tray) .value-control :global(.segment:not(.selected)) {
    border-radius: 8px;
    background: color-mix(in srgb, var(--theme-text, #fff) 4%, transparent);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--theme-text, #fff) 11%, transparent);
  }

  .scroller-host:not(.tray)
    .value-control
    :global(.segment:not(.selected):hover) {
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 14%,
      transparent
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--theme-accent, #f59e0b) 45%, transparent);
  }

  .value-control {
    width: min(100%, calc(var(--value-option-count, 4) * 3rem));
    justify-self: start;
    /* Level changes rewrite the option count, so the control's width is an
       intentional structural change: ease it instead of snapping. */
    transition: width var(--transition-normal);
  }

  /* Ribbon only: the row is allowed to grow past its cell and scroll. In the
     tray the same floor would force a long palette to 42rem, which is what
     made the popover a horizontal scroller. */
  .scroller-host:not(.tray) .value-control :global(.segmented-control) {
    min-width: calc(var(--count) * 3rem);
    /* The segments carry their own chrome now, so the group's own track would
       double the border under every value. */
    gap: 0.2rem;
  }

  /* Sized by COLUMNS, not by option count, and capped so the popover it sits
     in still fits a 375px phone beside its own padding. */
  .scroller-host.tray .value-control {
    width: min(calc(100vw - 2.75rem), calc(var(--value-columns, 4) * 3.4rem));
    max-width: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    .value-control {
      transition: none;
    }
  }
</style>
