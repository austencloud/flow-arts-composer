<!--
SequenceProgressBar.svelte

Linear progress indicator for animation sequences.
Shows current position within the sequence and resets on loop.

Two modes (chosen by whether `onSeek` is provided):
- Display-only (default): a thin progress LINE. role="progressbar".
- Seekable: pass `onSeek` and it becomes a thin scrubber — click/drag to seek,
  keyboard arrows, a knob on hover/scrub. role="slider". The visible track stays
  3px; the hit area grows so it's easy to grab. Pointer behaviour mirrors
  UnifiedTimeline (pause on grab via onScrubStart, resume on release via
  onScrubEnd). onSeek reports a 0..1 ratio across the full sequence.

Design:
- Thin horizontal bar (3px height)
- Smooth CSS transitions for fluid updates
- Theme-aware colors with subtle glow
- Respects prefers-reduced-motion
- Fully accessible with ARIA labels
-->
<script lang="ts">
  import { fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import TransportControls from "../controls/TransportControls.svelte";

  let {
    currentStep = 0,
    totalSteps = 0,
    visible = true,
    darkMode = false,
    onSeek = null,
    onScrubStart = null,
    onScrubEnd = null,
    showPlaybackControl = false,
    isPlaying = false,
    onPlaybackToggle = null,
  }: {
    /** Current beat/step number (can exceed totalSteps for looping sequences) */
    currentStep?: number;
    /** Total number of steps in the sequence */
    totalSteps?: number;
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
   * Formula: (currentStep - 1) / totalSteps converts to 0-based progress
   */
  const progress = $derived.by(() => {
    if (totalSteps <= 0) return 0;
    // Convert 1-based beat number to 0-based progress before modulo
    // currentStep 0.0-0.99 = start position hold (no progress yet)
    const zeroBasedStep = currentStep < 1 ? 0 : currentStep - 1;
    // Use modulo to wrap progress on loop
    const normalizedStep = zeroBasedStep % totalSteps;
    return Math.max(0, Math.min(1, normalizedStep / totalSteps));
  });

  // While scrubbing, show the dragged ratio immediately so the fill/knob track
  // the pointer without waiting for the seek round-trip to update currentStep.
  let scrubbing = $state(false);
  let scrubRatio = $state(0);
  const displayProgress = $derived(scrubbing ? scrubRatio : progress);

  /**
   * Percentage string for CSS (0% to 100%)
   */
  const progressPercent = $derived(`${(displayProgress * 100).toFixed(2)}%`);

  /**
   * Format for screen readers
   * currentStep is 1-based: 1.5 means beat 1, halfway through
   */
  const ariaLabel = $derived.by(() => {
    if (totalSteps <= 0) return "Sequence progress: no sequence loaded";
    // Convert to 0-based, modulo for looping, then back to 1-based for display
    const zeroBasedStep = currentStep < 1 ? 0 : currentStep - 1;
    const step = Math.floor(zeroBasedStep % totalSteps) + 1;
    return `Sequence progress: step ${step} of ${totalSteps}`;
  });

  // ── Seek gesture (only wired when interactive) ──
  let trackEl: HTMLDivElement | undefined = $state();
  let containerEl: HTMLDivElement | undefined = $state();

  function ratioFromEvent(e: PointerEvent): number {
    if (!trackEl) return 0;
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }

  function onPointerDown(e: PointerEvent) {
    if (!interactive || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    scrubbing = true;
    scrubRatio = ratioFromEvent(e);
    onScrubStart?.();
    try {
      containerEl?.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic/uncapturable pointer */
    }
    onSeek?.(scrubRatio);
  }

  function onPointerMove(e: PointerEvent) {
    if (!scrubbing) return;
    e.preventDefault();
    e.stopPropagation();
    scrubRatio = ratioFromEvent(e);
    onSeek?.(scrubRatio);
  }

  function onPointerUp(e: PointerEvent) {
    if (!scrubbing) return;
    e.stopPropagation();
    scrubbing = false;
    try {
      containerEl?.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    onScrubEnd?.();
  }

  function seekTo(ratio: number) {
    const clamped = Math.max(0, Math.min(1, ratio));
    // Discrete (keyboard) seek: brief pause/resume bracket keeps parity with drag.
    onScrubStart?.();
    onSeek?.(clamped);
    onScrubEnd?.();
  }

  function onKeydown(e: KeyboardEvent) {
    if (!interactive || totalSteps <= 0) return;
    const stepRatio = 1 / totalSteps;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      seekTo(progress + stepRatio);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      seekTo(progress - stepRatio);
    } else if (e.key === "Home") {
      e.preventDefault();
      seekTo(0);
    } else if (e.key === "End") {
      e.preventDefault();
      seekTo(1);
    }
  }
</script>

{#if visible && totalSteps > 0}
  <div class="progress-row" class:with-playback-control={showPlaybackControl}>
    {#if showPlaybackControl && onPlaybackToggle}
      <TransportControls appearance="inline" {isPlaying} {onPlaybackToggle} />
    {/if}
    {#if interactive}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        bind:this={containerEl}
        class="progress-bar-container interactive"
        class:dark-mode={darkMode}
        class:scrubbing
        transition:fade={fadeParams}
        role="slider"
        tabindex="0"
        aria-label="Seek position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(displayProgress * 100)}
        aria-valuetext={ariaLabel}
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
        onkeydown={onKeydown}
      >
        <div class="progress-track" bind:this={trackEl}>
          <div
            class="progress-fill"
            style="--progress: {progressPercent}"
          ></div>
          <div class="progress-knob" style="left: {progressPercent}"></div>
        </div>
      </div>
    {:else}
      <div
        class="progress-bar-container"
        class:dark-mode={darkMode}
        transition:fade={fadeParams}
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuenow={Math.floor(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div class="progress-track">
          <div
            class="progress-fill"
            style="--progress: {progressPercent}"
          ></div>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Container: full-width, minimal padding */
  .progress-bar-container {
    width: 100%;
    padding: 0 clamp(8px, 4cqw, 16px);
    padding-top: clamp(4px, 2cqw, 8px);
    padding-bottom: clamp(6px, 3cqw, 12px);
    box-sizing: border-box;
    /* Match WordHeader background for seamless integration */
    background: var(--theme-panel-bg, rgba(240, 240, 240, 0.98));
    transition: background 150ms ease-out;
  }

  /* Seekable: bigger, comfortable hit area (≥~24px) while the line stays 3px,
     plus pointer affordances. */
  .progress-bar-container.interactive {
    /* Reading pages can enlarge the target without thickening the track. */
    min-height: var(--sequence-seek-target-size, 25px);
    display: flex;
    align-items: center;
    padding-top: 10px;
    padding-bottom: 12px;
    cursor: pointer;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
  }

  .progress-bar-container.interactive:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
    border-radius: 6px;
  }

  /* Dark mode background */
  .progress-bar-container.dark-mode {
    background: var(--theme-panel-bg, rgba(15, 15, 20, 0.98));
  }

  /* Global dark class fallback */
  :global(:root.dark) .progress-bar-container:not(.dark-mode) {
    background: var(--theme-panel-bg, rgba(15, 15, 20, 0.98));
  }

  /* Progress track: rounded pill background */
  .progress-track {
    width: 100%;
    height: 3px;
    background: var(--theme-stroke, rgba(0, 0, 0, 0.08));
    border-radius: 999px; /* Pill shape */
    position: relative;
    transition: background 150ms ease-out;
  }

  /* Display-only track clips its fill; the seekable track lets the knob overflow. */
  .progress-bar-container:not(.interactive) .progress-track {
    overflow: hidden;
  }

  .dark-mode .progress-track {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  :global(:root.dark) .progress-bar-container:not(.dark-mode) .progress-track {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  /* Progress fill: animated gradient with glow */
  .progress-fill {
    height: 100%;
    width: var(--progress, 0%);
    background: linear-gradient(
      90deg,
      var(--theme-accent) 0%,
      var(--theme-accent-light, var(--theme-accent)) 50%,
      var(--theme-accent) 100%
    );
    box-shadow: 0 0 8px color-mix(in srgb, var(--theme-accent) 40%, transparent);
    border-radius: 999px;
    /* NO transition on width - let browser render smooth float updates directly from requestAnimationFrame */
    /* Only transition theme changes (background, shadow) */
    transition:
      background 150ms ease-out,
      box-shadow 150ms ease-out;
  }

  .dark-mode .progress-fill {
    background: linear-gradient(
      90deg,
      var(--theme-accent) 0%,
      var(--theme-accent-light, var(--theme-accent)) 50%,
      var(--theme-accent) 100%
    );
    box-shadow: 0 0 12px
      color-mix(in srgb, var(--theme-accent) 50%, transparent);
  }

  :global(:root.dark) .progress-bar-container:not(.dark-mode) .progress-fill {
    background: linear-gradient(
      90deg,
      var(--theme-accent) 0%,
      var(--theme-accent-light, var(--theme-accent)) 50%,
      var(--theme-accent) 100%
    );
    box-shadow: 0 0 12px
      color-mix(in srgb, var(--theme-accent) 50%, transparent);
  }

  /* Knob: hidden until hover/scrub so the resting state stays a clean line. */
  .progress-knob {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: white;
    transform: translate(-50%, -50%);
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
    pointer-events: none;
    opacity: 0;
    transition: opacity 120ms ease-out;
  }

  .progress-bar-container.interactive:hover .progress-knob,
  .progress-bar-container.interactive:focus-visible .progress-knob,
  .progress-bar-container.scrubbing .progress-knob {
    opacity: 1;
  }

  /* Accessibility: respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .progress-fill {
      transition: none;
    }
    .progress-track,
    .progress-bar-container,
    .progress-knob {
      transition: none;
    }
  }
  .progress-row {
    width: 100%;
  }
  .progress-row.with-playback-control {
    display: flex;
    align-items: center;
    gap: var(--space-1, 4px);
    /* The toggle's 44px hit box already pads its glyph, so the row's start
       inset shrinks to keep the glyph and the track end optically aligned. */
    padding-inline: clamp(2px, 1cqw, 4px) clamp(8px, 4cqw, 16px);
    box-sizing: border-box;
    background: var(--theme-panel-bg, rgba(240, 240, 240, 0.98));
  }
  .with-playback-control .progress-bar-container,
  .with-playback-control .progress-bar-container.dark-mode,
  :global(:root.dark) .with-playback-control .progress-bar-container {
    flex: 1;
    min-width: 0;
    padding-inline: 0;
    padding-block: 0;
    /* The row paints the panel background once; a second translucent coat
       here would darken the track area against the toggle beside it. */
    background: transparent;
  }
</style>
