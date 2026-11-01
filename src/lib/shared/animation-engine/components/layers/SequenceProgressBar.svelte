<!--
SequenceProgressBar.svelte

The sequence's progress under an animation, drawn with the shared
PlaybackLine so every player shows the same line as exported video: flush with
the canvas bottom, edge to edge, as thick as the export strip.

Two modes (chosen by whether `onSeek` is provided):
- Display-only (default): just the line. role="progressbar".
- Seekable: pass `onSeek` and the line becomes the scrubber, with a grab band
  under it (`--sequence-seek-target-size`). Pointer behaviour mirrors
  UnifiedTimeline (pause on grab via onScrubStart, resume on release via
  onScrubEnd). onSeek reports a 0..1 ratio across the full sequence.

A playback toggle or trailing control rides in the band, on top of the grab
area, so the gaps between them still scrub.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { opaqueFade } from "#lib/shared/transitions/motion.js";
  import { cubicOut } from "svelte/easing";
  import { motionDuration } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import TransportControls from "../controls/TransportControls.svelte";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { sequenceFrameAt } from "#lib/shared/media-composition/domain/sequence-frame.js";
  import PlaybackLine from "#lib/shared/timeline/PlaybackLine.svelte";

  let {
    currentStep = 0,
    totalSteps = 0,
    stepDurations = [],
    normalizedProgress,
    visible = true,
    darkMode = false,
    onSeek = null,
    onScrubStart = null,
    onScrubEnd = null,
    showPlaybackControl = false,
    isPlaying = false,
    onPlaybackToggle = null,
    trailing,
  }: {
    /** Current beat/step number (can exceed totalSteps for looping sequences) */
    currentStep?: number;
    /** Total number of steps in the sequence */
    totalSteps?: number;
    stepDurations?: readonly number[];
    /** Mapped pass progress, including a final landing or hold at 1. */
    normalizedProgress?: number;
    /** Whether the progress bar should be visible */
    visible?: boolean;
    /** Dark mode override (matches WordHeader pattern) */
    darkMode?: boolean;
    /** When provided, the bar becomes a seekable scrubber. Reports a 0..1 ratio
     *  across the full sequence. Absent → display-only progress line. */
    onSeek?: ((ratio: number) => void) | null;
    /** Called when a scrub gesture begins (consumer pauses playback). */
    onScrubStart?: (() => void) | null;
    /** Called when a scrub gesture ends (consumer resumes if it was playing). */
    onScrubEnd?: (() => void) | null;
    /** Optional transport action that stays adjacent to this scrubber. */
    showPlaybackControl?: boolean;
    isPlaying?: boolean;
    onPlaybackToggle?: (() => void) | null;
    /** A control that sits after the scrubber, at the row's far end (the
     *  Create preview's effect button). The row's end inset shrinks for it the
     *  way the start inset does for the playback toggle. */
    trailing?: Snippet;
    /** Kept for existing callers: every line is now the flush strip. */
    strip?: boolean;
  } = $props();

  const interactive = $derived(!!onSeek);

  const fadeParams = $derived({
    duration: motionDuration(DURATION.normal),
    easing: cubicOut,
  });

  /**
   * Progress within current loop (0-1)
   * Wraps using modulo so progress resets on each loop iteration
   *
   * IMPORTANT: currentStep is 1-based (1.0 = beat 1 starting, 2.0 = beat 2 starting)
   * - currentStep = 0 or 1: at/before beat 1 start = 0% progress
   * - currentStep = 2.0: beat 2 just starting (33% for 3-step sequence)
   *
   * The shared frame mapper weights durations and preserves the final landing.
   */
  const progress = $derived.by(() => {
    if (normalizedProgress !== undefined)
      return Number.isFinite(normalizedProgress)
        ? Math.max(0, Math.min(1, normalizedProgress))
        : 0;
    if (totalSteps <= 0) return 0;
    const durations = Array.from({ length: totalSteps }, (_, index) => {
      const duration = stepDurations[index] ?? 1;
      return Number.isFinite(duration) && duration > 0 ? duration : 1;
    });
    return sequenceFrameAt(Math.max(0, currentStep - 1), durations)
      .passBeatProgress;
  });

  /**
   * Format for screen readers
   * currentStep is 1-based: 1.5 means beat 1, halfway through
   */
  const ariaLabel = $derived.by(() => {
    if (totalSteps <= 0) return tDynamic("guide_runtime_progress_empty");
    // Convert to 0-based, modulo for looping, then back to 1-based for display
    const zeroBasedStep = currentStep < 1 ? 0 : currentStep - 1;
    const step =
      progress === 1 ? totalSteps : Math.floor(zeroBasedStep % totalSteps) + 1;
    return tDynamic("guide_runtime_progress_step", { step, total: totalSteps });
  });

  // Arrow keys step one beat's share of the bar.
  const stops = $derived(
    totalSteps > 1
      ? Array.from({ length: totalSteps - 1 }, (_, i) => (i + 1) / totalSteps)
      : []
  );

  const hasPlaybackControl = $derived(
    showPlaybackControl && !!onPlaybackToggle
  );
  // A seekable line or one with controls beside it needs a band under the
  // line; a plain display-only line is just the strip.
  const band = $derived(interactive || hasPlaybackControl || !!trailing);
</script>

{#if visible && totalSteps > 0}
  <div
    class="progress-row"
    class:band
    class:dark-mode={darkMode}
    class:with-playback-control={hasPlaybackControl}
    class:with-trailing={!!trailing}
    data-progress-row
    transition:opaqueFade={fadeParams}
  >
    <PlaybackLine
      class="progress-bar-container{interactive ? ' interactive' : ''}"
      cover={band}
      {darkMode}
      {progress}
      {onSeek}
      {onScrubStart}
      {onScrubEnd}
      {stops}
      label={interactive ? tDynamic("guide_runtime_seek_position") : ariaLabel}
      valueText={interactive ? ariaLabel : undefined}
    />
    {#if hasPlaybackControl || trailing}
      <div class="progress-controls">
        {#if hasPlaybackControl && onPlaybackToggle}
          <TransportControls
            appearance="inline"
            {isPlaying}
            {onPlaybackToggle}
          />
        {/if}
        {#if trailing}
          {@render trailing()}
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .progress-row {
    position: relative;
    width: 100%;
  }

  /* The grab band under a seekable line. Its colour reaches the line through
     a variable so a host can still clear it on `.progress-bar-container`. */
  .progress-row.band {
    min-height: var(--sequence-seek-target-size, 25px);
    --playback-line-band: var(--theme-panel-bg, rgba(240, 240, 240, 0.98));
  }

  .progress-row.band.dark-mode,
  :global(:root.dark) .progress-row.band:not(.dark-mode) {
    --playback-line-band: var(--theme-panel-bg, rgba(15, 15, 20, 0.98));
  }

  /* Controls float over the grab area: only they take pointer input, so the
     space between them still scrubs. */
  .progress-controls {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1, 4px);
    min-height: inherit;
    /* The toggle's 44px hit box already pads its glyph, so the row's start
       inset shrinks to keep the glyph and the line's end optically aligned. */
    padding-inline: clamp(2px, 1cqw, 4px) clamp(8px, 4cqw, 16px);
    box-sizing: border-box;
    pointer-events: none;
  }

  .progress-controls > :global(*) {
    pointer-events: auto;
  }

  /* With no toggle, the trailing control still belongs at the far end. */
  .progress-row:not(.with-playback-control) .progress-controls {
    justify-content: flex-end;
  }

  /* The trailing control's hit box pads its own glyph too. */
  .progress-row.with-trailing .progress-controls {
    padding-inline-end: clamp(2px, 1cqw, 4px);
  }
</style>
