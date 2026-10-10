<script lang="ts">
  /**
   * TimelineMinimap - Overview bar showing viewport position
   *
   * Shows the full timeline duration with a draggable viewport indicator.
   * Helps users orient when zoomed in. Click to jump, drag to scroll.
   */

  import type { TimelineClip } from "#lib/shared/animation-engine/domain/timeline-types.js";
  import { getClipEndTime } from "#lib/shared/animation-engine/domain/timeline-types.js";

  interface Props {
    totalDuration: number;
    playheadPosition: number;
    viewportStartTime: number;
    pixelsPerSecond: number;
    containerWidth: number;
    clips?: TimelineClip[];
    onSeek?: (time: number) => void;
    onScroll?: (startTime: number) => void;
  }

  let {
    totalDuration,
    playheadPosition = 0,
    viewportStartTime = 0,
    pixelsPerSecond,
    containerWidth = 0,
    clips = [],
    onSeek,
    onScroll,
  }: Props = $props();

  let minimapEl: HTMLDivElement;
  let isDragging = $state(false);
  let dragStartX = $state(0);
  let dragStartViewport = $state(0);

  // Calculate visible duration based on zoom
  const visibleDuration = $derived(
    containerWidth > 0 && pixelsPerSecond > 0
      ? containerWidth / pixelsPerSecond
      : totalDuration
  );

  // Viewport position as percentage of total
  const viewportStartPercent = $derived(
    totalDuration > 0 ? (viewportStartTime / totalDuration) * 100 : 0
  );

  // Viewport width as percentage
  const viewportWidthPercent = $derived(
    totalDuration <= 0
      ? 100
      : Math.min(100, Math.max(3, (visibleDuration / totalDuration) * 100))
  );

  // Playhead position as percentage
  const playheadPercent = $derived(
    totalDuration > 0 ? (playheadPosition / totalDuration) * 100 : 0
  );

  // Handle click on minimap to seek
  function handleClick(e: MouseEvent) {
    if (isDragging) return;
    const rect = minimapEl.getBoundingClientRect();
    const clickPercent = (e.clientX - rect.left) / rect.width;
    const seekTime = clickPercent * totalDuration;
    onSeek?.(Math.max(0, Math.min(totalDuration, seekTime)));
  }

  function startDrag(clientX: number) {
    isDragging = true;
    dragStartX = clientX;
    dragStartViewport = viewportStartTime;
  }

  // Update drag position
  function updateDrag(clientX: number) {
    if (!isDragging || !minimapEl) return;

    const rect = minimapEl.getBoundingClientRect();
    const deltaX = clientX - dragStartX;
    const deltaPercent = deltaX / rect.width;
    const deltaTime = deltaPercent * totalDuration;

    const maxScroll = Math.max(0, totalDuration - visibleDuration);
    const newScrollTime = Math.max(
      0,
      Math.min(maxScroll, dragStartViewport + deltaTime)
    );

    onScroll?.(newScrollTime);
  }

  // End drag
  function endDrag() {
    isDragging = false;
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  }

  // Mouse events
  function handleViewportMouseDown(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    startDrag(e.clientX);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function handleMouseMove(e: MouseEvent) {
    updateDrag(e.clientX);
  }

  function handleMouseUp() {
    endDrag();
  }

  // Keyboard handler for accessibility
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const clickEvent = new MouseEvent("click", {
        clientX:
          minimapEl.getBoundingClientRect().left + minimapEl.offsetWidth / 2,
      });
      handleClick(clickEvent as any);
    }
  }
</script>

<div
  class="timeline-minimap"
  bind:this={minimapEl}
  onclick={handleClick}
  onkeydown={handleKeyDown}
  role="slider"
  aria-label="Timeline overview - click to seek"
  aria-valuemin={0}
  aria-valuemax={totalDuration}
  aria-valuenow={playheadPosition}
  tabindex="0"
>
  <div class="minimap-track">
    <!-- Clip indicators (simplified view - muted uniform color) -->
    <div class="clip-indicators">
      {#each clips as clip (clip.id)}
        {@const startPercent = (clip.startTime / totalDuration) * 100}
        {@const endPercent = (getClipEndTime(clip) / totalDuration) * 100}
        <div
          class="clip-indicator"
          style="left: {startPercent}%; width: {endPercent - startPercent}%;"
        ></div>
      {/each}
    </div>

    <!-- Viewport indicator -->
    <div
      class="viewport-indicator"
      class:dragging={isDragging}
      style="left: {viewportStartPercent}%; width: {viewportWidthPercent}%;"
      onmousedown={handleViewportMouseDown}
      role="button"
      aria-label="Visible region - drag to scroll"
      tabindex="-1"
    >
      <div class="viewport-edge left"></div>
      <div class="viewport-edge right"></div>
    </div>

    <!-- Playhead -->
    <div class="minimap-playhead" style="left: {playheadPercent}%;"></div>
  </div>
</div>

<style>
  .timeline-minimap {
    padding: 4px 8px;
    background: var(--theme-panel-bg, #16161e);
    border-top: 1px solid var(--theme-stroke);
    cursor: pointer;
    user-select: none;
  }

  .minimap-track {
    position: relative;
    height: 16px;
    background: var(--theme-panel-elevated-bg);
    border-radius: 3px;
    overflow: hidden;
  }

  .clip-indicators {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .clip-indicator {
    position: absolute;
    top: 4px;
    bottom: 4px;
    border-radius: 2px;
    min-width: 2px;
    /* Muted uniform color for subtle appearance */
    background: var(--theme-accent);
    opacity: 0.25;
  }

  .viewport-indicator {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 50%, transparent);
    border-radius: 2px;
    cursor: grab;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
    min-width: 8px;
  }

  .viewport-indicator:hover {
    background: color-mix(in srgb, var(--theme-accent) 30%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 70%, transparent);
  }

  .viewport-indicator.dragging {
    cursor: grabbing;
    background: color-mix(in srgb, var(--theme-accent) 35%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 90%, transparent);
  }

  .viewport-edge {
    position: absolute;
    top: 2px;
    bottom: 2px;
    width: 3px;
    background: color-mix(in srgb, var(--theme-accent) 60%, transparent);
    border-radius: 1px;
    opacity: 0;
    transition: opacity var(--duration-fast) ease;
  }

  .viewport-edge.left {
    left: 1px;
  }

  .viewport-edge.right {
    right: 1px;
  }

  .viewport-indicator:hover .viewport-edge,
  .viewport-indicator.dragging .viewport-edge {
    opacity: 1;
  }

  .minimap-playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--semantic-error, #ff4444);
    box-shadow: 0 0 4px
      color-mix(in srgb, var(--semantic-error, #ff4444) 50%, transparent);
    pointer-events: none;
    z-index: 2;
    transform: translateX(-50%);
  }
</style>
