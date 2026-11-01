<!--
PlaybackLine.svelte

The one progress line every player draws under its animation: the sequence
viewer's transport, Create's play-in-place, the tutorial player and the
showcase embeds all render this, and it matches the strip painted into
exported video (same thickness rule, flush with the canvas bottom, square ends,
no glow).

- Display-only (no `onSeek`): just the line. role="progressbar".
- Seekable (`onSeek`): the line plus a grab area below it. role="slider".
  With `cover`, the grab area fills the whole host box, so a transport row can
  sit on top of it: its buttons take their own taps and every empty spot in
  the row still scrubs. The knob shows only on hover, focus or while dragging.
-->
<script lang="ts">
  import { sequenceProgressStripHeightCss } from "#lib/shared/animation-engine/services/sequence-progress-renderer.js";

  const lineHeight = sequenceProgressStripHeightCss();

  let {
    progress = 0,
    onSeek = null,
    onScrubStart = null,
    onScrubEnd = null,
    stops = [],
    label,
    valueText,
    darkMode = false,
    cover = false,
    bracketKeySeeks = true,
    class: className = "",
  }: {
    /** 0..1 across the whole sequence. */
    progress?: number;
    /** Makes the line seekable; reports a 0..1 ratio across its full width. */
    onSeek?: ((ratio: number) => void) | null;
    onScrubStart?: (() => void) | null;
    onScrubEnd?: (() => void) | null;
    /** Where the arrow keys stop (beat starts, 0..1). Ends are implied. */
    stops?: readonly number[];
    label: string;
    valueText?: string;
    darkMode?: boolean;
    /** Fill the positioned host so its empty space is part of the grab area. */
    cover?: boolean;
    /** Wrap keyboard seeks in onScrubStart/onScrubEnd like a drag. A host
     *  whose scrub hooks pause and resume playback can turn this off so a key
     *  press only moves the playhead. */
    bracketKeySeeks?: boolean;
    class?: string;
  } = $props();

  const interactive = $derived(!!onSeek);

  let scrubbing = $state(false);
  let scrubRatio = $state(0);
  let rootEl: HTMLDivElement | undefined = $state();

  const clampedProgress = $derived(
    Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
  );
  // While dragging, the fill and knob follow the pointer rather than waiting
  // for the player to report the new position back.
  const shown = $derived(scrubbing ? scrubRatio : clampedProgress);
  const percent = $derived(`${(shown * 100).toFixed(2)}%`);

  function ratioFromEvent(e: PointerEvent): number {
    if (!rootEl) return 0;
    const rect = rootEl.getBoundingClientRect();
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
      rootEl?.setPointerCapture(e.pointerId);
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
      rootEl?.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    onScrubEnd?.();
  }

  // A key press is a one-shot seek; the start/end bracket lets a host pause
  // and resume around it exactly as it does for a drag.
  function seekTo(ratio: number) {
    if (bracketKeySeeks) onScrubStart?.();
    onSeek?.(Math.max(0, Math.min(1, ratio)));
    if (bracketKeySeeks) onScrubEnd?.();
  }

  function onKeydown(e: KeyboardEvent) {
    if (!interactive) return;
    const all = [0, ...stops, 1];
    let target: number | undefined;
    if (e.key === "ArrowRight") {
      target = all.find((p) => p > clampedProgress + 0.001);
    } else if (e.key === "ArrowLeft") {
      target = [...all].reverse().find((p) => p < clampedProgress - 0.001);
    } else if (e.key === "Home") {
      target = 0;
    } else if (e.key === "End") {
      target = 1;
    } else {
      return;
    }
    e.preventDefault();
    // The transport around this line also maps arrows to beat steps; one
    // press must move one step, not two.
    e.stopPropagation();
    if (target !== undefined) seekTo(target);
  }
</script>

{#if interactive}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    bind:this={rootEl}
    class="playback-line interactive {className}"
    class:cover
    class:scrubbing
    class:dark-mode={darkMode}
    style:--line-height={lineHeight}
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(shown * 100)}
    aria-valuetext={valueText}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onkeydown={onKeydown}
  >
    <div class="line">
      <div class="fill" style:width={percent}></div>
      <div class="knob" style:left={percent}></div>
    </div>
  </div>
{:else}
  <div
    class="playback-line {className}"
    class:dark-mode={darkMode}
    style:--line-height={lineHeight}
    role="progressbar"
    aria-label={label}
    aria-valuetext={valueText}
    aria-valuenow={Math.floor(shown * 100)}
    aria-valuemin={0}
    aria-valuemax={100}
  >
    <div class="line">
      <div class="fill" style:width={percent}></div>
    </div>
  </div>
{/if}

<style>
  .playback-line {
    position: relative;
    width: 100%;
    height: var(--line-height);
    box-sizing: border-box;
    /* A host's grab band colour, when the line sits in one. */
    background: var(--playback-line-band, transparent);
  }

  .playback-line.interactive {
    height: auto;
    min-height: var(--sequence-seek-target-size, 25px);
    cursor: pointer;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
  }

  .playback-line.cover {
    position: absolute;
    inset: 0;
    min-height: 0;
  }

  .playback-line.interactive:focus-visible {
    outline: none;
  }

  /* Flush with the top edge of the box, which hosts weld to the canvas
     bottom, and as wide as it: the exported strip's place and shape. */
  .line {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: var(--line-height);
    background: var(--theme-stroke, rgba(0, 0, 0, 0.08));
    transition: background var(--duration-fast) var(--ease-standard-out);
  }

  .dark-mode .line,
  :global(:root.dark) .playback-line:not(.dark-mode) .line {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .playback-line:not(.interactive) .line {
    overflow: hidden;
  }

  .interactive:focus-visible .line {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .fill {
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--theme-accent) 0%,
      var(--theme-accent-light, var(--theme-accent)) 50%,
      var(--theme-accent) 100%
    );
    /* Width follows playback every frame; only theme changes ease. */
    transition: background var(--duration-fast) var(--ease-standard-out);
  }

  /* Hidden at rest so the line reads as the clean exported strip. It sits
     centred on the line and may overhang the canvas above it. */
  .knob {
    position: absolute;
    top: 50%;
    z-index: 2;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: white;
    transform: translate(-50%, -50%);
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--duration-instant) var(--ease-standard-out);
  }

  .interactive:hover .knob,
  .interactive:focus-visible .knob,
  .scrubbing .knob {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .line,
    .fill,
    .knob {
      transition: none;
    }
  }
</style>
