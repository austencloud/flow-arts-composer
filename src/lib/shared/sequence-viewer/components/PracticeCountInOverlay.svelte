<!--
  PracticeCountInOverlay.svelte

  The 3·2·1 count-in shown over the animation canvas while a practice ramp is
  about to start. Presentational only — the playback controller owns the count
  value, the ~700ms cadence, and the metronome ticks; this just renders the
  number and announces it.

  Visual language mirrors Recording3DOverlay's countdown (full-bleed scrim + big
  centered numeral + pop), with two deliberate differences:
   - A darker scrim (0.6 vs 0.4): 0.4 fails 4.5:1 white-on-content over a bright
     animation backdrop; 0.6 flattens any canvas dark enough for white text.
   - The live region is decoupled from the visible glyph (the numeral is
     aria-hidden) and is assertive, not polite — at a 700ms cadence a polite
     region queues and lags behind the visuals; assertive makes each token
     interrupt the last so "three, two, one" stays locked to the beat.
-->
<script lang="ts">
  let { count }: { count: number } = $props();
</script>

{#if count > 0}
  <div class="countin-overlay" aria-hidden="true">
    {#key count}
      <div class="countin-number">{count}</div>
    {/key}
  </div>
{/if}
<!-- Decoupled assertive live region, ALWAYS mounted (empty when idle): a region
     inserted already-populated is commonly skipped by screen readers, so keeping
     it in the a11y tree lets the 0→3 transition announce the first "3". Announces
     "3" "2" "1" without reading the raw (aria-hidden) glyph or double-announcing. -->
<div class="sr-only" role="timer" aria-live="assertive" aria-atomic="true">
  {count > 0 ? count : ""}
</div>

<style>
  .countin-overlay {
    position: absolute;
    inset: 0;
    z-index: 20;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
  }

  .countin-number {
    font-size: 6rem;
    font-weight: 800;
    color: #fff;
    text-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
    font-variant-numeric: tabular-nums;
    animation: countin-pop var(--duration-dramatic)
      var(--ease-out, var(--ease-out));
  }

  /* Pops in then holds full opacity until the next {#key} swap replaces it, so
     the beat reads as a crisp tick rather than a fade. */
  @keyframes countin-pop {
    0% {
      transform: scale(1.5);
      opacity: 0;
    }
    45% {
      transform: scale(1);
      opacity: 1;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* Standard visually-hidden region for the announcement only. */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  /* The count-in is information, not decoration — under reduced motion it still
     counts at the same cadence; only the pop scale is removed. */
  @media (prefers-reduced-motion: reduce) {
    .countin-number {
      animation: none;
    }
  }
</style>
