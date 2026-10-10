<script lang="ts">
  import { onDestroy } from "svelte";
  /**
   * TimelineClip - A single clip on the timeline
   *
   * Visual representation of a sequence placed in time.
   * Supports: selection, move, trim, resize operations.
   *
   * Decomposed from 627 lines to ~200 lines + 3 interaction utilities + 1 overlay component.
   */

  import type { TimelineClip as ClipType } from "#lib/shared/animation-engine/domain/timeline-types.js";
  import { getTimelineState } from "#lib/shared/animation-engine/state/timeline-state.svelte.js";
  import { timeToPixels } from "#lib/shared/animation-engine/domain/timeline-types.js";
  import { createClipMove } from "./clip-interactions/create-clip-move";
  import { createClipTrim } from "./clip-interactions/create-clip-trim";
  import { createClipResize } from "./clip-interactions/create-clip-resize";
  import ClipStatusOverlays from "./ClipStatusOverlays.svelte";

  interface Props {
    clip: ClipType;
    pixelsPerSecond: number;
    selected?: boolean;
  }

  let { clip, pixelsPerSecond, selected = false }: Props = $props();

  function getState() {
    return getTimelineState();
  }

  // Drag mode state
  let dragMode = $state<"move" | "trim-left" | "trim-right" | "resize" | null>(
    null
  );
  let isChangingTrack = $state(false);

  // Computed dimensions
  const left = $derived(timeToPixels(clip.startTime, pixelsPerSecond));
  const width = $derived(
    Math.max(20, timeToPixels(clip.duration, pixelsPerSecond))
  );

  // Display info
  const displayName = $derived(clip.label || clip.sequence.name || "Untitled");
  const speedLabel = $derived(
    clip.playbackRate !== 1 ? `${clip.playbackRate.toFixed(1)}x` : null
  );
  const trimLabel = $derived(
    clip.inPoint > 0 || clip.outPoint < 1
      ? `${Math.round(clip.inPoint * 100)}%-${Math.round(clip.outPoint * 100)}%`
      : null
  );

  // Visual states
  const isDragging = $derived(dragMode !== null);
  const isMoveDragging = $derived(dragMode === "move");
  const isTrimming = $derived(
    dragMode === "trim-left" || dragMode === "trim-right"
  );
  const isResizing = $derived(dragMode === "resize");

  // Initialize interaction handlers
  const { handleMoveStart, dispose: disposeMove } = createClipMove(
    () => clip,
    () => pixelsPerSecond,
    {
      onDragStart: () => (dragMode = "move"),
      onDragEnd: () => {
        dragMode = null;
        isChangingTrack = false;
      },
      onTrackChange: (targetTrackId) => {
        isChangingTrack =
          targetTrackId !== null && targetTrackId !== clip.trackId;
      },
    }
  );

  // Separate callbacks for left and right trim to set correct mode
  const trimLeftCallbacks = {
    onDragStart: () => (dragMode = "trim-left"),
    onDragEnd: () => (dragMode = null),
  };
  const trimRightCallbacks = {
    onDragStart: () => (dragMode = "trim-right"),
    onDragEnd: () => (dragMode = null),
  };
  const { handleTrimLeftStart, dispose: disposeTrimLeft } = createClipTrim(
    () => clip,
    () => width,
    trimLeftCallbacks
  );
  const { handleTrimRightStart, dispose: disposeTrimRight } = createClipTrim(
    () => clip,
    () => width,
    trimRightCallbacks
  );

  const { handleResizeStart, dispose: disposeResize } = createClipResize(
    () => clip,
    () => pixelsPerSecond,
    {
      onDragStart: () => (dragMode = "resize"),
      onDragEnd: () => (dragMode = null),
    }
  );

  onDestroy(() => {
    // A cross-track move remounts this component while its window listener
    // continues the same gesture until mouseup or window blur.
    if (!isChangingTrack) disposeMove();
    disposeTrimLeft();
    disposeTrimRight();
    disposeResize();
  });

  // Event handlers
  function handleClick(e: MouseEvent) {
    e.stopPropagation();
    if (!isDragging) {
      getState().selectClip(clip.id, e.shiftKey || e.ctrlKey || e.metaKey);
      // Focus the parent timeline panel so keyboard shortcuts work
      const panel = (e.currentTarget as HTMLElement).closest(
        ".timeline-panel"
      ) as HTMLElement;
      panel?.focus();
    }
  }

  function handleDoubleClick(e: MouseEvent) {
    e.stopPropagation();
    getState().openClipInspector(clip.id);
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    getState().selectClip(clip.id);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!selected) return;

    // Nudge amount: 0.1s normal, 1s with shift
    const nudgeAmount = e.shiftKey ? 1 : 0.1;

    switch (e.key) {
      case "Delete":
      case "Backspace":
        e.preventDefault();
        getState().removeClip(clip.id);
        break;
      case "d":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          getState().duplicateClip(clip.id);
        }
        break;
      case "m":
        e.preventDefault();
        getState().updateClip(clip.id, { muted: !clip.muted });
        break;
      case "l":
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          getState().updateClip(clip.id, { locked: !clip.locked });
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        e.stopPropagation();
        getState().moveClip(
          clip.id,
          Math.max(0, clip.startTime - nudgeAmount),
          undefined,
          { skipSnap: true }
        );
        break;
      case "ArrowRight":
        e.preventDefault();
        e.stopPropagation();
        getState().moveClip(clip.id, clip.startTime + nudgeAmount, undefined, {
          skipSnap: true,
        });
        break;
      case "ArrowUp":
        e.preventDefault();
        e.stopPropagation();
        moveToAdjacentTrack(-1);
        break;
      case "ArrowDown":
        e.preventDefault();
        e.stopPropagation();
        moveToAdjacentTrack(1);
        break;
    }
  }

  // Move clip to adjacent track (up = -1, down = +1)
  function moveToAdjacentTrack(direction: -1 | 1) {
    const state = getState();
    const tracks = state.project.tracks;
    const currentTrackIndex = tracks.findIndex((t) => t.id === clip.trackId);
    const targetIndex = currentTrackIndex + direction;

    if (targetIndex >= 0 && targetIndex < tracks.length) {
      const targetTrack = tracks[targetIndex];
      if (targetTrack && !targetTrack.locked) {
        state.moveClip(clip.id, clip.startTime, targetTrack.id, {
          skipSnap: true,
        });
      }
    }
  }
</script>

<div
  class="timeline-clip"
  class:selected
  class:muted={clip.muted}
  class:locked={clip.locked}
  class:looping={clip.loop}
  class:dragging={isDragging}
  class:move-dragging={isMoveDragging}
  class:changing-track={isChangingTrack}
  class:trimming={isTrimming}
  class:resizing={isResizing}
  style="left: {left}px; width: {width}px; --clip-color: {clip.color};"
  onclick={handleClick}
  ondblclick={handleDoubleClick}
  oncontextmenu={handleContextMenu}
  onkeydown={handleKeyDown}
  role="option"
  aria-label="{displayName} clip"
  aria-selected={selected}
  tabindex="0"
>
  <!-- Trim handle: left (in-point) -->
  <div
    class="trim-handle left"
    onmousedown={handleTrimLeftStart}
    role="slider"
    aria-label="Trim start"
    aria-valuenow={clip.inPoint * 100}
    aria-valuemin="0"
    aria-valuemax="99"
    tabindex="0"
    title="Drag to trim start"
  >
    <div class="handle-grip"></div>
  </div>

  <!-- Main clip body -->
  <div
    class="clip-body"
    onmousedown={handleMoveStart}
    role="button"
    tabindex="0"
    aria-label="Drag to move clip"
  >
    <div class="clip-preview">
      {#if clip.sequence.thumbnails?.[0]}
        <img src={clip.sequence.thumbnails[0]} alt="" draggable="false" />
      {:else}
        <div class="preview-pattern"></div>
      {/if}

      {#if clip.inPoint > 0}
        <div
          class="trim-indicator left"
          style="width: {clip.inPoint * 100}%"
        ></div>
      {/if}
      {#if clip.outPoint < 1}
        <div
          class="trim-indicator right"
          style="width: {(1 - clip.outPoint) * 100}%"
        ></div>
      {/if}
    </div>

    <div class="clip-info">
      <span class="clip-name">{displayName}</span>
      <div class="clip-badges">
        {#if speedLabel}<span class="clip-badge speed">{speedLabel}</span>{/if}
        {#if trimLabel}<span class="clip-badge trim">{trimLabel}</span>{/if}
        {#if clip.loop}<span class="clip-badge loop" title="Looping"
            ><i class="fa-solid fa-repeat" aria-hidden="true"></i></span
          >{/if}
      </div>
    </div>
  </div>

  <!-- Trim handle: right (out-point) -->
  <div
    class="trim-handle right"
    onmousedown={handleTrimRightStart}
    role="slider"
    aria-label="Trim end"
    aria-valuenow={clip.outPoint * 100}
    aria-valuemin="1"
    aria-valuemax="100"
    tabindex="0"
    title="Drag to trim end"
  >
    <div class="handle-grip"></div>
  </div>

  <!-- Resize handle -->
  <div
    class="resize-handle right"
    onmousedown={handleResizeStart}
    role="slider"
    aria-label="Resize clip"
    aria-valuenow={clip.duration}
    aria-valuemin="0"
    aria-valuemax="100"
    tabindex="0"
    title="Drag to resize"
  >
    <div class="resize-grip"></div>
  </div>

  <ClipStatusOverlays muted={clip.muted} locked={clip.locked} />
</div>

<style>
  .timeline-clip {
    position: absolute;
    top: 6px;
    bottom: 6px;
    min-width: 20px;
    background: var(--clip-color, var(--theme-accent));
    border-radius: 6px;
    cursor: grab;
    display: flex;
    overflow: hidden;
    transition: all var(--duration-normal) ease;
    user-select: none;
    border: 1px solid
      color-mix(in srgb, var(--clip-color, var(--theme-accent)) 70%, white);
  }

  .timeline-clip:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    transform: translateY(-1px);
  }

  .timeline-clip.selected {
    outline: 2px solid var(--theme-text, white);
    outline-offset: -2px;
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.5),
      0 0 12px color-mix(in srgb, var(--theme-text, white) 30%, transparent);
  }

  .timeline-clip:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .timeline-clip.muted {
    opacity: 0.4;
  }

  .timeline-clip.locked {
    cursor: not-allowed;
  }

  .timeline-clip.dragging {
    z-index: 100;
  }

  .timeline-clip.move-dragging {
    cursor: grabbing;
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.6),
      0 0 16px color-mix(in srgb, var(--theme-accent) 40%, transparent);
  }

  .timeline-clip.changing-track {
    outline: 2px solid var(--feature-edit, #cc5de8);
    outline-offset: -2px;
    box-shadow:
      0 6px 20px
        color-mix(in srgb, var(--feature-edit, #cc5de8) 50%, transparent),
      0 0 16px color-mix(in srgb, var(--feature-edit, #cc5de8) 40%, transparent);
    opacity: 0.85;
  }

  .timeline-clip.trimming {
    outline: 2px solid var(--semantic-warning, #ffd43b);
    outline-offset: -2px;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.4),
      0 0 12px
        color-mix(in srgb, var(--semantic-warning, #ffd43b) 30%, transparent);
  }

  .timeline-clip.resizing {
    outline: 2px solid var(--semantic-success);
    outline-offset: -2px;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.4),
      0 0 12px
        color-mix(in srgb, var(--semantic-success, #51cf66) 30%, transparent);
  }

  .clip-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    position: relative;
    cursor: grab;
  }

  .clip-body:active {
    cursor: grabbing;
  }

  .clip-body:focus-visible {
    outline: 2px solid var(--primary-color, #6366f1);
    outline-offset: 2px;
  }

  .clip-preview {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .clip-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.3;
    pointer-events: none;
  }

  .preview-pattern {
    width: 100%;
    height: 100%;
    background: repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.1) 0px,
      rgba(255, 255, 255, 0.1) 2px,
      transparent 2px,
      transparent 8px
    );
  }

  .trim-indicator {
    position: absolute;
    top: 0;
    bottom: 0;
    background: repeating-linear-gradient(
      45deg,
      rgba(0, 0, 0, 0.3) 0px,
      rgba(0, 0, 0, 0.3) 2px,
      transparent 2px,
      transparent 4px
    );
  }

  .trim-indicator.left {
    left: 0;
  }

  .trim-indicator.right {
    right: 0;
  }

  .clip-info {
    position: relative;
    z-index: 1;
    padding: 4px 8px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
  }

  .clip-name {
    font-size: var(--font-size-compact);
    font-weight: 500;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .clip-badges {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .clip-badge {
    font-size: var(--font-size-compact);
    padding: 2px 5px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.5);
    color: rgba(255, 255, 255, 0.95);
    white-space: nowrap;
    font-weight: 500;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .clip-badge.speed {
    background: color-mix(in srgb, var(--semantic-success) 25%, transparent);
    color: var(--semantic-success);
    border-color: var(--semantic-success);
  }

  .clip-badge.trim {
    background: color-mix(in srgb, var(--semantic-warning) 25%, transparent);
    color: var(--semantic-warning);
    border-color: var(--semantic-warning);
  }

  .clip-badge.loop {
    background: color-mix(in srgb, var(--semantic-info) 25%, transparent);
    color: var(--semantic-info);
    border-color: var(--semantic-info);
  }

  .trim-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 12px;
    cursor: ew-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition:
      opacity 0.15s ease,
      background 0.15s ease;
    z-index: 10;
  }

  /* Invisible touch target for accessibility */
  .trim-handle::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    width: var(--min-touch-target);
    left: 50%;
    transform: translateX(-50%);
  }

  .timeline-clip:hover .trim-handle,
  .timeline-clip.selected .trim-handle,
  .timeline-clip.trimming .trim-handle {
    opacity: 1;
  }

  .trim-handle.left {
    left: 0;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--semantic-warning, #ffd43b) 60%, transparent),
      transparent
    );
    border-radius: 4px 0 0 4px;
  }

  .trim-handle.right {
    right: 12px;
    background: linear-gradient(
      -90deg,
      color-mix(in srgb, var(--semantic-warning, #ffd43b) 60%, transparent),
      transparent
    );
  }

  .trim-handle:hover {
    background: color-mix(
      in srgb,
      var(--semantic-warning, #ffd43b) 40%,
      transparent
    );
  }

  .handle-grip {
    width: 2px;
    height: 24px;
    background: rgba(255, 255, 255, 0.8);
    border-radius: 1px;
  }

  .resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 12px;
    cursor: col-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity var(--duration-fast) ease;
    z-index: 11;
  }

  /* Invisible touch target for accessibility */
  .resize-handle::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    width: var(--min-touch-target);
    left: 50%;
    transform: translateX(-50%);
  }

  .resize-handle.right {
    right: 0;
    background: linear-gradient(
      -90deg,
      color-mix(in srgb, var(--semantic-success, #51cf66) 60%, transparent),
      transparent
    );
    border-radius: 0 4px 4px 0;
  }

  .timeline-clip:hover .resize-handle,
  .timeline-clip.selected .resize-handle,
  .timeline-clip.resizing .resize-handle {
    opacity: 1;
  }

  .resize-handle:hover {
    background: color-mix(
      in srgb,
      var(--semantic-success, #51cf66) 40%,
      transparent
    );
  }

  .resize-grip {
    width: 4px;
    height: 20px;
    background: repeating-linear-gradient(
      0deg,
      rgba(255, 255, 255, 0.8) 0px,
      rgba(255, 255, 255, 0.8) 2px,
      transparent 2px,
      transparent 4px
    );
    border-radius: 1px;
  }
</style>
