<script lang="ts">
  import type { PostItem } from "#lib/shared/media-composition/domain/post-project.js";
  import { formatPostClock } from "../../builder/post-builder-format";
  import { secondsToPixels } from "./post-timeline-geometry";

  /**
   * One cell's row under the selected arrangement: the clip's span as a
   * dashed outline and the cell's bar where its beats fall. Like the key lane
   * it only reports what was pressed; the timeline does the drag math and the
   * workspace makes the edit.
   */
  interface Props {
    item: PostItem;
    cellId: string;
    label: string;
    startSeconds: number;
    endSeconds: number;
    /** The cell starts after the clip ends; the bar is a stub at the end. */
    pinned: boolean;
    beatOffset: number;
    heightPx: number;
    pixelsPerSecond: number;
    selected: boolean;
    locked: boolean;
    onSeek: (seconds: number) => void;
    onBarPointerDown: (event: PointerEvent) => void;
    onBarClick: () => void;
    /** How the bar's start reads to a screen reader; the post's clock by default. */
    formatTime?: (seconds: number) => string;
  }

  let {
    item,
    cellId,
    label,
    startSeconds,
    endSeconds,
    pinned,
    beatOffset,
    heightPx,
    pixelsPerSecond,
    selected,
    locked,
    onSeek,
    onBarPointerDown,
    onBarClick,
    formatTime = formatPostClock,
  }: Props = $props();

  /** How far a press may travel and still count as a tap on the empty row. */
  const TAP_SLOP_PX = 6;

  const spanLeftPx = $derived(secondsToPixels(item.start, pixelsPerSecond));
  const spanWidthPx = $derived(secondsToPixels(item.duration, pixelsPerSecond));
  const barLeftPx = $derived(secondsToPixels(startSeconds, pixelsPerSecond));
  const barWidthPx = $derived(
    secondsToPixels(endSeconds - startSeconds, pixelsPerSecond)
  );
  const offsetText = $derived(
    beatOffset === 0
      ? "starts with the grid"
      : `starts ${beatOffset} ${beatOffset === 1 ? "beat" : "beats"} after the grid`
  );

  let tapStart: { x: number; y: number; pointerId: number } | null = null;

  // A tap on the empty row moves the playhead there. A swipe that scrolls the
  // timeline is not a tap: the browser cancels the pointer, or it travels.
  function handleRowPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    tapStart = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
  }

  function handleRowPointerUp(event: PointerEvent): void {
    const start = tapStart;
    tapStart = null;
    if (!start || start.pointerId !== event.pointerId) return;
    if (
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX
    )
      return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    onSeek(Math.max(0, (event.clientX - rect.left) / pixelsPerSecond));
  }

  function handleBarPointerDown(event: PointerEvent): void {
    event.stopPropagation();
    if (locked) return;
    event.preventDefault();
    onBarPointerDown(event);
  }
</script>

<div
  class="cell-lane"
  class:selected
  style="height: {heightPx}px"
  role="group"
  aria-label="{label} cell"
  data-cell-lane={cellId}
  data-beat-offset={beatOffset}
  onpointerdown={handleRowPointerDown}
  onpointerup={handleRowPointerUp}
  onpointercancel={() => (tapStart = null)}
>
  <div
    class="lane-span"
    style="left: {spanLeftPx}px; width: {spanWidthPx}px"
    aria-hidden="true"
  ></div>

  <button
    type="button"
    class="cell-bar"
    class:pinned
    class:locked
    style="left: {barLeftPx}px; width: {barWidthPx}px"
    aria-pressed={selected}
    aria-label="{label}, {offsetText}, from {formatTime(startSeconds)}"
    data-cell-id={cellId}
    data-start-seconds={startSeconds}
    onpointerdown={handleBarPointerDown}
    onclick={(event) => {
      event.stopPropagation();
      onBarClick();
    }}
  >
    <span class="bar-text">{label}</span>
  </button>
</div>

<style>
  .cell-lane {
    position: relative;
    box-sizing: border-box;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    background: color-mix(in srgb, var(--theme-bg, #101018) 70%, #000);
  }

  .lane-span {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--theme-accent) 6%, transparent);
    border-inline: 1px dashed
      color-mix(in srgb, var(--theme-accent) 30%, transparent);
    pointer-events: none;
  }

  .cell-lane.selected .lane-span {
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  }

  /* The cell's bar: one cycle of the cell, from its first beat. It never
     drops under the touch target, so a short cycle or a stub past the clip's
     end stays easy to grab. */
  .cell-bar {
    position: absolute;
    top: 7px;
    bottom: 7px;
    z-index: 1;
    display: flex;
    box-sizing: border-box;
    align-items: center;
    min-width: var(--min-touch-target, 44px);
    overflow: hidden;
    padding: 0 0.5rem;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 35%, transparent);
    border-radius: 0.375rem;
    background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
    color: var(--theme-text, #fff);
    cursor: grab;
    font: inherit;
    text-align: left;
    touch-action: none;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .cell-lane.selected .cell-bar {
    border-color: var(--theme-accent);
    background: var(--theme-accent, #d4813a);
    color: var(--theme-on-accent, #111);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-accent) 35%, transparent);
  }

  .cell-bar.pinned {
    border-style: dashed;
    background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
  }

  .cell-bar.locked {
    cursor: default;
  }

  @media (hover: hover) {
    .cell-bar:not(.locked):hover {
      border-color: var(--theme-accent);
      background: color-mix(in srgb, var(--theme-accent) 28%, transparent);
    }

    .cell-lane.selected .cell-bar:not(.locked):hover {
      background: color-mix(in srgb, var(--theme-accent) 88%, #fff);
    }
  }

  .cell-bar:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 1px;
  }

  .bar-text {
    overflow: hidden;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .cell-bar {
      transition: none;
    }
  }
</style>
