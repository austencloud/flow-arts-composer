<!--
  StepStrip.svelte

  Focus-locked read-ahead carousel: the active pictograph is pinned under a gold
  focus frame; the track advances one cell-stride across a horizontal rail or up
  a vertical rail. Neighbors dim + shrink with distance (spotlight). A virtualized
  window keeps the DOM lean.

  Pure view: it reads notation cells (or derives them from a sequence) plus a float
  currentStep + bpm and renders. No engine, no playback ownership. Extracted from
  the landing Infinite Spinner so landing and practice surfaces share one carousel.
  cellSize drives read-ahead depth (zoom); compact density fits the same behavior
  into smaller editorial surfaces without changing the established default.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { ElementalType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { buildNotationCells, type NotationCell } from "./notation-cell";
  import { buildStripWindow, nextLoopOffset } from "./strip-window";

  let {
    cells = null,
    sequence = null,
    includeStartPosition = true,
    currentStep,
    bpm,
    cellSize = 72,
    density = "standard",
    presentation = "spotlight",
    anchor = "center",
    orientation = "horizontal",
    fillHeight = false,
    loop = false,
    leftPropType = null,
    rightPropType = null,
    propElementalType = null,
    stepPulse = false,
    staggerCellUpdates = false,
    onCellClick = null,
  }: {
    /** Prebuilt cells for callers that already own the notation mapping. */
    cells?: NotationCell[] | null;
    /** Convenience input for lazy surfaces that should keep notation-cell
     *  derivation inside this component's deferred chunk. Ignored when cells
     *  are supplied. */
    sequence?: SequenceData | null;
    /** Keep the sequence's static start pose in the rail. Continuously playing
     *  surfaces can omit it so every visible cell represents a performed beat. */
    includeStartPosition?: boolean;
    /** Float: integer = step number, fraction = progress within step. */
    currentStep: number;
    bpm: number;
    /** Cell width/height in px. Smaller = more read-ahead visible (zoom out). */
    cellSize?: number;
    /** Standard preserves the original Play with It geometry. Compact keeps
     *  the focus treatment while fitting an editorial/card-sized rail. */
    density?: "standard" | "compact";
    /** A continuous strip keeps neighboring pictographs full size. */
    presentation?: "spotlight" | "strip";
    /** "start" pins the focus toward the leading edge so upcoming cells fill
     *  the remaining axis; "center" keeps it in the middle. */
    anchor?: "center" | "start";
    /** Horizontal is the established timeline rail. Vertical keeps the same
     *  focus and virtualization behavior in narrow portrait media columns. */
    orientation?: "horizontal" | "vertical";
    /** Size cells from the container height instead of using cellSize. Standard
     *  density leaves room around the focus in a tall practice column; compact
     *  density uses nearly all of a short rail's height. */
    fillHeight?: boolean;
    /** Seamless wrap: when the track reaches the end the first cell follows (the
     *  sequence repeats) instead of snapping back to the start. The window can
     *  then hold more than one copy of a cell; only the focus's own repeat is
     *  marked `data-cell-instance="primary"`, so a host pairing
     *  view-transition-names against cells still finds exactly one element. */
    loop?: boolean;
    leftPropType?: PropType | null;
    rightPropType?: PropType | null;
    /** Optional prop-path relationship shared by this realized sequence. */
    propElementalType?: ElementalType | null;
    /** Flash the focus frame each time the active step advances. */
    stepPulse?: boolean;
    /** Replace a reused strip one pictograph per frame. Dense live surfaces use
     *  this to keep SVG preparation out of their animation handoff; the first
     *  sequence still mounts atomically, and existing callers retain that
     *  behavior unless they opt in. */
    staggerCellUpdates?: boolean;
    /** Seek callback when a cell is tapped (receives the cell's stepNumber). */
    onCellClick?: ((stepNumber: number) => void) | null;
  } = $props();

  const GAP = $derived(presentation === "strip" ? 3 : 6);
  const BUFFER = 3;
  const renderBuffer = $derived(density === "compact" ? 1 : BUFFER);
  const resolvedCells = $derived(cells ?? buildNotationCells(sequence));
  const requestedDisplayedCells = $derived(
    includeStartPosition
      ? resolvedCells
      : resolvedCells.filter((cell) => !cell.isStart)
  );
  // This buffer is replaced atomically (or one cell at a time) and never
  // mutated in place. Keeping the notation records raw preserves their stable
  // identity, which is what the staggered handoff comparison needs.
  let stagedDisplayedCells = $state.raw<NotationCell[]>([]);
  let stagingGeneration = 0;

  function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  $effect(() => {
    const requested = requestedDisplayedCells;
    const stagger = staggerCellUpdates;
    const generation = ++stagingGeneration;
    const current = untrack(() => stagedDisplayedCells);

    if (
      !stagger ||
      current.length === 0 ||
      current.length !== requested.length
    ) {
      stagedDisplayedCells = requested;
      return;
    }

    void (async () => {
      for (let index = 0; index < requested.length; index += 1) {
        if (current[index]?.data === requested[index]?.data) continue;
        await nextFrame();
        if (generation !== stagingGeneration) return;
        stagedDisplayedCells = stagedDisplayedCells.map((cell, cellIndex) =>
          cellIndex === index ? requested[index]! : cell
        );
      }
    })();
  });

  const displayedCells = $derived(
    staggerCellUpdates ? stagedDisplayedCells : requestedDisplayedCells
  );
  const displayedStep = $derived(
    Math.max(0, (currentStep ?? 0) - (includeStartPosition ? 0 : 1))
  );
  const heroScale = $derived(
    presentation === "strip" ? 1 : density === "compact" ? 1.15 : 1.32
  );
  const vertical = $derived(orientation === "vertical");

  let currentStepNumber = $derived(Math.floor(displayedStep));
  let activeIndex = $derived(
    Math.min(
      Math.max(currentStepNumber, 0),
      Math.max(0, displayedCells.length - 1)
    )
  );

  // Smooth progress within the current step (0→1) from the float step — drives
  // the calm per-step countdown cue under the focus frame.
  let stepPhase = $derived(
    Math.min(1, Math.max(0, displayedStep - currentStepNumber))
  );

  // Monotonic virtual index for seamless looping: the raw step wraps (…N→0…), so
  // on each wrap we add cells.length — the track keeps sliding forward into a
  // repeated copy instead of snapping back. Reset when the sequence changes.
  let loopOffset = $state(0);
  let prevRawStep = -1;
  let prevSeqKey: string | undefined = undefined;
  $effect(() => {
    const raw = currentStepNumber;
    const seqKey = resolvedCells[0]?.key;
    if (seqKey !== prevSeqKey) {
      loopOffset = 0;
      prevRawStep = raw;
      prevSeqKey = seqKey;
      return;
    }
    if (loop) {
      loopOffset = nextLoopOffset(
        loopOffset,
        prevRawStep,
        raw,
        displayedCells.length
      );
    }
    prevRawStep = raw;
  });
  let virtualActive = $derived(loop ? activeIndex + loopOffset : activeIndex);

  let stepStripEl = $state<HTMLDivElement | null>(null);
  let stripContainerWidth = $state(375);
  let stripContainerHeight = $state(70);

  const stripPrimarySize = $derived(
    vertical ? stripContainerHeight : stripContainerWidth
  );

  // Focus position. "start" pins it a touch in from the leading edge so
  // upcoming cells fill the remaining axis; "center" keeps it in the middle.
  const FOCUS_MARGIN = $derived(Math.max(28, stripPrimarySize * 0.1));

  // Effective cell px. fillHeight sizes the focus to a fraction of the column
  // HEIGHT — so it stays clearly smaller than the animation canvas — but is also
  // capped by WIDTH so the next couple of cells fit fully. The smaller bound
  // wins. Otherwise the fixed cellSize prop (portrait foot).
  const HEIGHT_FILL = 0.5; // focus pictograph ≈ half the column height
  const WIDTH_CELLS = 2.4; // ≈ how many cell-widths share the row
  const COMPACT_RAIL_INSET = 4;
  const COMPACT_VISIBLE_CELLS = 5.25;
  const COMPACT_VERTICAL_CELLS = 3.4;
  const compactCell = $derived.by(() => {
    if (stripContainerWidth <= 375) return 44;
    if (stripContainerWidth <= 440) return 48;
    if (stripContainerWidth <= 600) return 56;
    return 64;
  });
  const effCell = $derived.by(() => {
    if (vertical) {
      const byWidth = (stripContainerWidth - COMPACT_RAIL_INSET) / heroScale;
      const byHeight = stripContainerHeight / COMPACT_VERTICAL_CELLS;
      return Math.max(44, Math.floor(Math.min(byWidth, byHeight)));
    }
    if (!fillHeight) return density === "compact" ? compactCell : cellSize;

    // The homepage rail is intentionally short. Its compact cells should use
    // that height instead of inheriting the practice pane's half-height rule;
    // otherwise a 79px rail displays the same tiny 48px cells as a 70px rail.
    if (density === "compact") {
      const byHeight = (stripContainerHeight - COMPACT_RAIL_INSET) / heroScale;
      const byWidth = stripContainerWidth / COMPACT_VISIBLE_CELLS;
      return Math.max(44, Math.floor(Math.min(byHeight, byWidth)));
    }

    const byHeight = (stripContainerHeight * HEIGHT_FILL) / heroScale;
    const byWidth = (stripContainerWidth - FOCUS_MARGIN) / WIDTH_CELLS;
    return Math.max(64, Math.floor(Math.min(byHeight, byWidth)));
  });
  const STRIDE = $derived(effCell + GAP);
  const FRAME = $derived(Math.round(effCell * heroScale) + 3); // gold frame hugs the scaled hero
  const verticalHeadroom = $derived(
    density === "compact" ? (effCell >= 64 ? 14 : 12) : 26
  );
  const viewportHeight = $derived(FRAME + verticalHeadroom);

  let focusOffset = $derived(
    anchor === "start" ? FOCUS_MARGIN : stripPrimarySize / 2 - effCell / 2
  );
  let frameOffset = $derived(focusOffset - (FRAME - effCell) / 2);

  // Windowed render list of virtual indices around the focus. For loop, indices
  // run past the ends and map to cells circularly (seamless wrap); otherwise they
  // clamp to the real range. Cells are absolutely placed at vi * STRIDE.
  let renderCells = $derived.by(() => {
    const window = buildStripWindow({
      activeVirtualIndex: virtualActive,
      cellCount: displayedCells.length,
      loop,
      anchor,
      primarySize: stripPrimarySize,
      focusOffset,
      stride: STRIDE,
      buffer: renderBuffer,
    });
    const out: {
      vi: number;
      cell: NotationCell;
      dist: number;
      primary: boolean;
    }[] = [];
    for (const item of window) {
      const cell = displayedCells[item.ci];
      if (cell)
        out.push({
          vi: item.vi,
          cell,
          dist: item.dist,
          primary: item.primary,
        });
    }
    return out;
  });

  let trackOffset = $state(0);
  let animateTrack = $state(false);
  let prevVirtual = -1;
  $effect(() => {
    const idx = virtualActive;
    const focus = focusOffset;
    // virtualActive only decreases on init or a backward scrub — loop wraps keep
    // increasing, so the track slides forward through the wrap with no snap.
    const isBackOrInit = prevVirtual === -1 || idx < prevVirtual;
    animateTrack = !isBackOrInit;
    prevVirtual = idx;
    trackOffset = focus - idx * STRIDE;
  });

  // Slide duration tracks the step interval (half a step, clamped) — fast tempos
  // get a shorter, less-visible travel.
  let slideDurMs = $derived(
    Math.round(
      Math.min(0.42, Math.max(0.12, (60 / Math.max(1, bpm)) * 0.5)) * 1000
    )
  );

  function cellOpacity(dist: number) {
    if (presentation === "strip") return dist === 0 ? 1 : 0.85;
    if (dist === 0) return 1;
    return Math.max(0.14, 0.66 - (dist - 1) * 0.18);
  }
  function cellScale(dist: number) {
    if (presentation === "strip") return 1;
    if (dist === 0) return heroScale;
    return Math.max(0.62, 0.84 - (dist - 1) * 0.09);
  }

  $effect(() => {
    const el = stepStripEl;
    if (!el) return;
    stripContainerWidth = el.clientWidth;
    stripContainerHeight = el.clientHeight;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        stripContainerWidth = entry.contentRect.width;
        stripContainerHeight = entry.contentRect.height;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
</script>

{#if displayedCells.length > 0}
  <div
    class="step-viewport"
    class:anchor-start={anchor === "start"}
    class:fill-height={fillHeight}
    class:vertical
    class:continuous-strip={presentation === "strip"}
    bind:this={stepStripEl}
    style="--slide-dur: {slideDurMs}ms; --cell: {effCell}px; --frame: {FRAME}px; {fillHeight
      ? 'height: 100%'
      : `height: ${viewportHeight}px`}"
  >
    <div
      class="step-focus"
      style="{vertical ? 'top' : 'left'}: {frameOffset}px"
    >
      {#if stepPulse}
        <div class="step-progress" style="transform: scaleX({stepPhase})"></div>
      {/if}
    </div>
    <div
      class="step-track"
      class:no-anim={!animateTrack}
      style="transform: {vertical
        ? `translateY(${trackOffset}px)`
        : `translateX(${trackOffset}px)`}"
    >
      {#each renderCells as item (item.vi)}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          class="step-cell"
          class:start-cell={item.cell.isStart}
          class:is-focus={item.dist === 0}
          class:clickable={!!onCellClick}
          data-step-number={item.cell.stepNumber}
          data-cell-instance={item.primary ? "primary" : "repeat"}
          style="{vertical ? 'top' : 'left'}: {item.vi *
            STRIDE}px; opacity: {cellOpacity(item.dist)}"
          role={onCellClick ? "button" : undefined}
          tabindex={onCellClick ? 0 : undefined}
          onclick={onCellClick
            ? () => onCellClick?.(item.cell.stepNumber)
            : undefined}
          onkeydown={onCellClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onCellClick?.(item.cell.stepNumber);
                }
              }
            : undefined}
        >
          <div
            class="step-pictograph"
            style="transform: scale({cellScale(item.dist)})"
          >
            <PictographContainer
              pictographData={item.cell.data}
              darkMode={true}
              disableTransitions={true}
              disableContentTransitions={true}
              leftPropTypeOverride={leftPropType ?? undefined}
              rightPropTypeOverride={rightPropType ?? undefined}
              {propElementalType}
            />
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .step-viewport {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(0, 0, 0, 0.2);
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0,
      black 10%,
      black 90%,
      transparent 100%
    );
    mask-image: linear-gradient(
      to right,
      transparent 0,
      black 10%,
      black 90%,
      transparent 100%
    );
  }
  .step-viewport.fill-height {
    height: 100%;
  }
  .step-viewport.vertical {
    height: 100%;
    border-top: 0;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    -webkit-mask-image: linear-gradient(
      to bottom,
      transparent 0,
      black 10%,
      black 90%,
      transparent 100%
    );
    mask-image: linear-gradient(
      to bottom,
      transparent 0,
      black 10%,
      black 90%,
      transparent 100%
    );
  }
  /* Start-anchored: fade only the upcoming edge. The leading edge stays solid
     so the large focus pictograph is never dimmed. */
  .step-viewport.anchor-start {
    -webkit-mask-image: linear-gradient(
      to right,
      black 0,
      black 86%,
      transparent 100%
    );
    mask-image: linear-gradient(to right, black 0, black 86%, transparent 100%);
  }
  .step-viewport.vertical.anchor-start {
    -webkit-mask-image: linear-gradient(
      to bottom,
      black 0,
      black 86%,
      transparent 100%
    );
    mask-image: linear-gradient(
      to bottom,
      black 0,
      black 86%,
      transparent 100%
    );
  }
  /* Cells are absolutely placed at vi * STRIDE inside the track; the track
     translateX slides the whole window. (Absolute, not flex, so the virtual
     window can run past the ends for seamless looping.) */
  .step-track {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    will-change: transform;
    transition: transform var(--slide-dur, 420ms) cubic-bezier(0.4, 0, 0.2, 1);
  }
  .step-viewport.vertical .step-track {
    right: 0;
  }
  .step-track.no-anim {
    transition: none;
  }
  .step-focus {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: var(--frame, 98px);
    height: var(--frame, 98px);
    border: 2px solid #d4813a;
    border-radius: 8px;
    box-shadow: 0 0 12px rgba(212, 129, 58, 0.32); /* calm steady glow — no pulse */
    pointer-events: none;
    z-index: 2;
    overflow: hidden; /* clip the countdown line to the rounded frame */
    transition: left 0.2s ease;
  }
  .step-viewport.vertical .step-focus {
    top: auto;
    left: 50%;
    transform: translateX(-50%);
    transition: top 0.2s ease;
  }
  /* Calm per-step countdown: a thin amber line fills left→right across the step,
     reaching full as the next move takes focus. Replaces the distracting border
     expand/contract — anticipatory and steady instead of flashy. */
  .step-progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: #d4813a;
    transform-origin: left center;
    will-change: transform;
  }
  .step-cell {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: var(--cell, 72px);
    height: var(--cell, 72px);
    border: 1.5px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    overflow: hidden;
    transition: opacity var(--slide-dur, 420ms) ease;
  }
  .step-viewport.vertical .step-cell {
    top: auto;
    left: 50%;
    transform: translateX(-50%);
  }
  .step-cell.clickable {
    cursor: pointer;
  }
  .step-cell.start-cell {
    border-color: rgba(255, 255, 255, 0.15);
  }
  .step-cell.is-focus {
    overflow: visible;
    border-color: transparent;
    z-index: 3;
  }
  .step-pictograph {
    width: 100%;
    height: 100%;
    transform-origin: center;
    transition: transform var(--slide-dur, 420ms) ease;
  }

  .step-viewport.continuous-strip {
    --pictograph-border: none;
    border: 0;
    background: transparent;
  }
  .continuous-strip .step-cell {
    border: 0;
    border-radius: 0;
  }
  .continuous-strip .step-focus {
    border-color: var(--semantic-warning, #d4813a);
    border-radius: 4px;
    box-shadow: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .step-track,
    .step-cell,
    .step-pictograph {
      transition: none;
    }
  }
</style>
