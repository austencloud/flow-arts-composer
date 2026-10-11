<script lang="ts">
  /**
   * TimeRuler - Time scale header showing seconds/frames
   *
   * Displays time markers with major/minor ticks based on zoom level.
   * Adapts tick density to current zoom. Shared by Compose's beat timeline,
   * Stage's count ruler and Post Studio's timeline (each passes its own
   * `pixelsPerSecond`/`tickInterval`/`formatLabel`, so "seconds" here just
   * means "the timeline's unit").
   */

  import type { TimeSeconds } from "#lib/shared/animation-engine/domain/timeline-types.js";

  interface Props {
    duration: TimeSeconds;
    pixelsPerSecond: number;
    formatLabel?: (value: number) => string;
    tickInterval?: number;
    /** Added to every tick's displayed time, e.g. a ruler showing a window
     *  that starts partway through a longer timeline. Ticks still lay out at
     *  their local `x` position; only the label shifts. */
    offsetSeconds?: number;
    /** Extra class(es) on the root, for a caller that needs to position or
     *  size the ruler beyond the default 100% width/height. */
    class?: string;
    /** Labels under the time labels at times of the caller's choosing, such
     *  as a song's bar numbers. Laid out like the ticks, in the same unit. */
    marks?: readonly { seconds: number; label: string }[];
  }

  let {
    duration,
    pixelsPerSecond,
    formatLabel,
    tickInterval,
    offsetSeconds = 0,
    class: className,
    marks = [],
  }: Props = $props();

  // Calculate appropriate tick interval based on zoom
  const resolvedTickInterval = $derived.by(() => {
    if (tickInterval !== undefined) return tickInterval;
    if (pixelsPerSecond > 200) return 0.5; // Every 0.5s at high zoom
    if (pixelsPerSecond > 100) return 1; // Every 1s
    if (pixelsPerSecond > 50) return 2; // Every 2s
    if (pixelsPerSecond > 25) return 5; // Every 5s
    if (pixelsPerSecond > 10) return 10; // Every 10s
    return 30; // Every 30s at low zoom
  });

  // Every 5th minor tick is major. Ticks below only carry this out by index,
  // not by testing the accumulated time - `0.1 * 5` etc. can land a hair off
  // a whole number in floating point, so a fractional interval (e.g. 0.5s at
  // high zoom) intermittently marked the wrong tick major.
  const MAJOR_EVERY = 5;

  // Generate tick marks
  const ticks = $derived.by(() => {
    const result: Array<{
      id: string;
      time: number;
      major: boolean;
      x: number;
    }> = [];
    const interval = resolvedTickInterval;
    if (!(interval > 0) || !(duration >= 0)) return result;

    const count = Math.floor(duration / interval);
    for (let index = 0; index <= count; index++) {
      // Multiplying from the index (instead of repeatedly adding `interval`)
      // keeps each tick's time exact instead of compounding rounding error
      // over hundreds of ticks at a fine interval.
      const t = index * interval;
      result.push({
        id: `tick-${index}`,
        time: t,
        major: index % MAJOR_EVERY === 0,
        x: t * pixelsPerSecond,
      });
    }

    return result;
  });

  // Format time as MM:SS or MM:SS.ms depending on zoom
  function formatTime(seconds: number): string {
    const shown = seconds + offsetSeconds;
    if (formatLabel) return formatLabel(shown);
    const mins = Math.floor(shown / 60);
    const secs = shown % 60;

    if (pixelsPerSecond > 100) {
      // Show milliseconds at high zoom
      return `${mins}:${secs.toFixed(1).padStart(4, "0")}`;
    }
    return `${mins}:${Math.floor(secs).toString().padStart(2, "0")}`;
  }
</script>

<div class="time-ruler {className ?? ''}">
  {#each ticks as tick (tick.id)}
    <div class="tick" class:major={tick.major} style="left: {tick.x}px">
      <div class="tick-line"></div>
      {#if tick.major}
        <span class="tick-label">{formatTime(tick.time)}</span>
      {/if}
    </div>
  {/each}
  {#each marks as mark (mark.seconds)}
    <span class="mark" style="left: {mark.seconds * pixelsPerSecond}px"
      >{mark.label}</span
    >
  {/each}
</div>

<style>
  .time-ruler {
    position: relative;
    height: 100%;
    background: var(--theme-panel-elevated-bg);
  }

  .tick {
    position: absolute;
    top: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .tick-line {
    width: 1px;
    background: var(--theme-stroke, var(--theme-card-bg));
  }

  .tick:not(.major) .tick-line {
    height: 10px;
    margin-top: auto;
  }

  .tick.major .tick-line {
    height: 14px;
    margin-top: auto;
    background: var(--theme-stroke-strong);
  }

  .tick-label {
    position: absolute;
    top: 6px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    white-space: nowrap;
    transform: translateX(-50%);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }

  .mark {
    position: absolute;
    top: 22px;
    font-size: var(--font-size-compact);
    color: var(--ruler-mark-color, var(--theme-accent));
    white-space: nowrap;
    transform: translateX(-50%);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    pointer-events: none;
  }
</style>
