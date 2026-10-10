<!-- TimelineBody - Main timeline tracks area with minimap, ruler, and tracks -->
<script lang="ts">
  import { untrack } from "svelte";
  import TimeRuler from "#lib/shared/timeline/TimeRuler.svelte";
  import TrackLane from "./TrackLane.svelte";
  import TrackHeader from "./TrackHeader.svelte";
  import Playhead from "./Playhead.svelte";
  import SnapGuides from "./SnapGuides.svelte";
  import TimelineEmptyState from "./TimelineEmptyState.svelte";
  import TimelineMinimap from "./TimelineMinimap.svelte";
  import TimelineAudioTrack from "./TimelineAudioTrack.svelte";
  import type { TimelineTrack, TimelineClip } from "#lib/shared/animation-engine/domain/timeline-types.js";

  interface Props {
    totalDuration: number;
    playheadPosition: number;
    pixelsPerSecond: number;
    timelineWidth: number;
    tracks: TimelineTrack[];
    clips: TimelineClip[];
    hasClips: boolean;
    activeSnapTime: number | null;
    headerWidth?: number;
    onSeek: (time: number) => void;
    onAddTrack: () => void;
    onBrowseLibrary: () => void;
    onScrollXChange: (startTime: number) => void;
    onVerticalZoom?: (delta: number) => void;
  }

  const {
    totalDuration,
    playheadPosition,
    pixelsPerSecond,
    timelineWidth,
    tracks,
    clips,
    hasClips,
    activeSnapTime,
    headerWidth = 180,
    onSeek,
    onAddTrack,
    onBrowseLibrary,
    onScrollXChange,
    onVerticalZoom,
  }: Props = $props();

  // Container refs for scroll sync
  let tracksContainer: HTMLDivElement;
  let rulerContainer: HTMLDivElement;

  // Local state
  let containerWidth = $state(0);
  let viewportStartTime = $state(0);

  // Track container width for minimap viewport calculation
  function trackWidth(node: HTMLDivElement) {
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      untrack(() => {
        containerWidth = width;
      });
    });
    observer.observe(node);
    return {
      destroy() {
        observer.disconnect();
      },
    };
  }

  // Sync horizontal scroll between ruler and tracks
  function handleTracksScroll(e: Event) {
    const target = e.target as HTMLDivElement;
    if (rulerContainer) {
      rulerContainer.scrollLeft = target.scrollLeft;
    }
    viewportStartTime = target.scrollLeft / pixelsPerSecond;
    onScrollXChange(viewportStartTime);
  }

  // Minimap seek handler
  function handleMinimapSeek(time: number) {
    onSeek(time);
  }

  // Minimap scroll handler
  function handleMinimapScroll(startTime: number) {
    if (tracksContainer) {
      tracksContainer.scrollLeft = startTime * pixelsPerSecond;
      viewportStartTime = startTime;
    }
  }

  // Click on empty area to set playhead
  function handleTimelineClick(e: MouseEvent) {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left + (tracksContainer?.scrollLeft ?? 0);
    const time = x / pixelsPerSecond;
    onSeek(time);
  }

  // Store callback ref that can be updated
  let verticalZoomCallback = $state<((delta: number) => void) | undefined>(undefined);

  $effect(() => {
    verticalZoomCallback = onVerticalZoom;
  });

  // Svelte action to attach non-passive wheel listener for Alt+Wheel vertical zoom
  function wheelHandler(node: HTMLElement) {
    function handleWheel(e: WheelEvent) {
      if (e.altKey && verticalZoomCallback) {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -10 : 10;
        verticalZoomCallback(delta);
      }
    }

    node.addEventListener('wheel', handleWheel, { passive: false });
    return {
      destroy() {
        node.removeEventListener('wheel', handleWheel);
      }
    };
  }

  // Expose scrollTo for parent auto-scroll during playback
  export function scrollTo(scrollLeft: number) {
    if (tracksContainer) {
      tracksContainer.scrollLeft = scrollLeft;
    }
  }

  export function getScrollInfo() {
    if (!tracksContainer) return { scrollLeft: 0, width: 0 };
    return {
      scrollLeft: tracksContainer.scrollLeft,
      width: tracksContainer.getBoundingClientRect().width,
    };
  }
</script>

<div class="timeline-body-wrapper">
  <TimelineMinimap
    {totalDuration}
    {playheadPosition}
    {viewportStartTime}
    {pixelsPerSecond}
    {containerWidth}
    {clips}
    onSeek={handleMinimapSeek}
    onScroll={handleMinimapScroll}
  />

  <div class="timeline-body">
    <div class="track-headers" style="width: {headerWidth}px">
      <div class="header-spacer">
        <button
          class="add-track-btn"
          onclick={onAddTrack}
          title="Add Track"
          aria-label="Add track"
        >
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
        </button>
      </div>
      {#each tracks as track (track.id)}
        <TrackHeader {track} />
      {/each}
    </div>

    <div class="timeline-content">
      <div class="ruler-container" bind:this={rulerContainer}>
        <div class="ruler-scroll-content" style="width: {timelineWidth}px">
          <TimeRuler duration={totalDuration + 10} {pixelsPerSecond} />
        </div>
      </div>

      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="tracks-container"
        bind:this={tracksContainer}
        use:trackWidth
        use:wheelHandler
        onscroll={handleTracksScroll}
        onclick={handleTimelineClick}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleTimelineClick(e as any);
          }
        }}
        role="application"
        aria-label="Timeline tracks"
        tabindex="0"
      >
        <div class="tracks-scroll-content" style="width: {timelineWidth}px">
          <SnapGuides {activeSnapTime} height={tracks.length * 80 + 60} />
          <Playhead
            position={playheadPosition}
            {pixelsPerSecond}
            height={tracks.length * 80}
          />

          {#each tracks as track (track.id)}
            <TrackLane {track} {pixelsPerSecond} />
          {/each}

          {#if !hasClips}
            <TimelineEmptyState {onBrowseLibrary} />
          {:else}
            <div class="drop-zone">
              <span class="drop-hint">Drag sequences here to add clips</span>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <TimelineAudioTrack {headerWidth} />
</div>

<style>
  .timeline-body-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .timeline-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .track-headers {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--theme-card-bg);
    border-right: 1px solid var(--theme-stroke);
  }

  .header-spacer {
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-panel-elevated-bg);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .add-track-btn {
    width: 36px;
    height: 36px;
    min-width: var(--min-touch-target, 48px);
    min-height: var(--min-touch-target, 48px);
    border-radius: 10px;
    border: 1px dashed var(--theme-stroke-strong);
    background: transparent;
    color: var(--theme-text-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-min);
    transition: all var(--duration-normal) ease;
  }

  .add-track-btn:hover {
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border-style: solid;
    border-color: var(--theme-accent);
    color: var(--theme-accent);
    box-shadow: 0 0 10px
      color-mix(in srgb, var(--theme-accent) 25%, transparent);
  }

  .timeline-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .ruler-container {
    flex-shrink: 0;
    height: 36px;
    overflow: hidden;
    background: var(--theme-panel-elevated-bg);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .ruler-scroll-content {
    height: 100%;
  }

  .tracks-container {
    flex: 1;
    overflow-x: scroll;
    overflow-y: auto;
    position: relative;
    background: var(--theme-panel-bg);
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  .tracks-container::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  .tracks-container::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
  }

  .tracks-container::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 6px;
    border: 2px solid var(--scrollbar-track);
  }

  .tracks-container::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-accent-hover);
    box-shadow: 0 0 8px color-mix(in srgb, var(--theme-accent) 30%, transparent);
  }

  .tracks-scroll-content {
    position: relative;
    min-height: 100%;
  }

  .drop-zone {
    height: 70px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px dashed var(--theme-stroke-strong);
    border-radius: 12px;
    margin: 12px;
    opacity: 0.5;
    transition: all var(--duration-normal) ease;
    background: var(--theme-card-bg);
  }

  .drop-zone:hover {
    opacity: 1;
    border-color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
    box-shadow: 0 0 12px
      color-mix(in srgb, var(--theme-accent) 20%, transparent);
  }

  .drop-hint {
    font-size: var(--font-size-min);
    color: var(--theme-text-dim);
    font-weight: 500;
  }
</style>
