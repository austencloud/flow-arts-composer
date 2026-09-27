<script lang="ts">
  /**
   * TimelinePanel - Main DAW-style timeline editor container
   *
   * Professional NLE Layout:
   * ┌──────────────────────────────────────────────────────────────────┐
   * │ Controls Bar                                    [Media] [Preview]│
   * ├───────────────┬───────────────┬──────────────────────────────────┤
   * │    Source     │    Program    │  Media Browser (inline, toggle)  │
   * │    Monitor    │    Monitor    │                                  │
   * ├───────────────┴───────────────┴──────────────────────────────────┤
   * │ Timeline (minimap, tracks, audio)                                 │
   * └──────────────────────────────────────────────────────────────────┘
   */

  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { getTimelineState } from "$lib/shared/animation-engine/state/timeline-state.svelte";
  import { getTimelinePlayer } from "../services/timeline-playback-service";
  import { getTimelineSnapper } from "../services/timeline-snap-service";
  import {
    loadFromStorage,
    saveToStorage,
    TIMELINE_STORAGE_KEYS,
  } from "$lib/shared/animation-engine/timeline/state/timeline-storage";
  import TimelineControls from "./TimelineControls.svelte";
  import ClipInspector from "./ClipInspector.svelte";
  import MediaBrowserPanel, {
    type MediaImportType,
  } from "./media-browser/MediaBrowserPanel.svelte";
  import TimelinePreview from "./TimelinePreview.svelte";
  import SourcePreview from "./SourcePreview.svelte";
  import PanelGroup from "$lib/shared/panels/PanelGroup.svelte";
  import {
    timeToPixels,
    type TimelineTrack,
    type TimelineClip,
  } from "$lib/shared/animation-engine/domain/timeline-types";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { untrack } from "svelte";

  // Extracted components
  import TimelineBody from "./TimelineBody.svelte";
  import MonitorPanel from "./MonitorPanel.svelte";
  import LayoutToggles from "./LayoutToggles.svelte";

  // Panel layout persistence
  interface PanelLayout {
    showPreview: boolean;
    showMediaBrowser: boolean;
    verticalSizes: number[];
    monitorSizes: number[];
    mainSizes: number[];
  }

  const DEFAULT_PANEL_LAYOUT: PanelLayout = {
    showPreview: true,
    showMediaBrowser: false,
    verticalSizes: [1, 2],
    monitorSizes: [1, 1],
    mainSizes: [3, 1],
  };

  // Lazy access to state and services
  function getState() {
    return getTimelineState();
  }
  function getPlayback() {
    return getTimelinePlayer();
  }
  function getSnap() {
    return getTimelineSnapper();
  }

  // Container ref
  let panelElement: HTMLDivElement;
  let timelineBodyRef: TimelineBody;

  // Handle vertical zoom (Alt+Wheel) - called from TimelineBody
  function handleVerticalZoom(delta: number) {
    const state = getState();
    for (const track of state.project.tracks) {
      const newHeight = Math.max(40, Math.min(200, track.height + delta));
      state.updateTrack(track.id, { height: newHeight });
    }
  }

  // Local reactive state (synced via effects)
  let timelineWidth = $state(1000);
  let playheadPosition = $state(0);
  let pixelsPerSecond = $state(50);
  let totalDuration = $state(60);
  let isPlaying = $state(false);
  let hasSelection = $state(false);
  let tracks = $state<TimelineTrack[]>([]);
  let hasClips = $state(false);
  let allClips = $state<TimelineClip[]>([]);
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);

  // Load persisted panel layout
  const savedLayout = loadFromStorage<PanelLayout>(
    TIMELINE_STORAGE_KEYS.PANEL_LAYOUT,
    DEFAULT_PANEL_LAYOUT
  );

  // Panel visibility state (persisted)
  let showPreview = $state(savedLayout.showPreview ?? true);
  let showMediaBrowser = $state(savedLayout.showMediaBrowser ?? false);

  // Panel sizes as flex ratios (persisted)
  let verticalSizes = $state(savedLayout.verticalSizes ?? [1, 2]);
  let monitorSizes = $state(savedLayout.monitorSizes ?? [1, 1]);
  let mainSizes = $state(savedLayout.mainSizes ?? [3, 1]);

  // Source sequence for preview (not persisted)
  let sourceSequence = $state<SequenceData | null>(null);

  // Persist panel layout when it changes (debounced to avoid excessive writes during resize)
  let layoutSaveTimeout: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const layout: PanelLayout = {
      showPreview,
      showMediaBrowser,
      verticalSizes,
      monitorSizes,
      mainSizes,
    };
    untrack(() => {
      if (layoutSaveTimeout) {
        clearTimeout(layoutSaveTimeout);
      }
      layoutSaveTimeout = setTimeout(() => {
        saveToStorage(TIMELINE_STORAGE_KEYS.PANEL_LAYOUT, layout);
        layoutSaveTimeout = null;
      }, 300);
    });
  });

  // Sync local state from timeline state
  $effect(() => {
    const state = getState();
    const pps = state.viewport.pixelsPerSecond;
    const dur = state.totalDuration;
    const pos = state.playhead.position;
    const playing = state.playhead.isPlaying;
    const hasSel = state.hasSelection;
    const trks = state.project.tracks;
    const clips = state.allClips;
    const loading = state.isLoading;
    const error = state.loadError;

    untrack(() => {
      pixelsPerSecond = pps;
      totalDuration = dur;
      timelineWidth = timeToPixels(dur + 10, pps);
      playheadPosition = pos;
      isPlaying = playing;
      hasSelection = hasSel;
      tracks = trks;
      allClips = clips;
      hasClips = clips.length > 0;
      isLoading = loading;
      loadError = error;
    });
  });

  // Toggle media browser panel
  function toggleMediaBrowser() {
    showMediaBrowser = !showMediaBrowser;
  }

  // Handle media import from browser
  function handleMediaImport(
    sequence: SequenceData,
    mediaType: MediaImportType
  ) {
    const state = getState();
    const trackId = state.project.tracks[0]?.id;
    if (!trackId) return;

    const startTime = state.playhead.position;

    switch (mediaType) {
      case "image":
        state.addClip(sequence, trackId, startTime, {
          duration: 3,
          loop: false,
          playbackRate: 1,
          color: "#51cf66",
          label: `${sequence.word || sequence.name} (Image)`,
        });
        break;
      case "recording":
        const recordingDuration = sequence.steps?.length || 5;
        state.addClip(sequence, trackId, startTime, {
          duration: recordingDuration,
          loop: false,
          color: "#ff6b6b",
          label: `${sequence.word || sequence.name} (Recording)`,
        });
        break;
      case "animation":
      default:
        state.addClip(sequence, trackId, startTime);
        break;
    }
  }

  // Source monitor: Load a sequence for preview
  function loadSourceSequence(sequence: SequenceData) {
    sourceSequence = sequence;
  }

  // Source monitor: Add currently loaded source to timeline
  function handleAddSourceToTimeline(sequence: SequenceData) {
    const state = getState();
    const trackId = state.project.tracks[0]?.id;
    if (!trackId) return;

    const startTime = state.playhead.position;
    state.addClip(sequence, trackId, startTime);
  }

  // Header width constant
  const HEADER_WIDTH = 180;

  // Auto-scroll to keep playhead visible during playback
  $effect(() => {
    if (!isPlaying || !timelineBodyRef) return;

    const playheadX = timeToPixels(playheadPosition, pixelsPerSecond);
    const scrollInfo = timelineBodyRef.getScrollInfo();
    const visibleLeft = scrollInfo.scrollLeft;
    const visibleRight = scrollInfo.scrollLeft + scrollInfo.width;
    const padding = scrollInfo.width * 0.2;

    untrack(() => {
      if (playheadX > visibleRight - padding) {
        timelineBodyRef.scrollTo(playheadX - scrollInfo.width + padding);
      } else if (playheadX < visibleLeft + padding) {
        timelineBodyRef.scrollTo(Math.max(0, playheadX - padding));
      }
    });
  });

  // Handle wheel events for scroll/zoom
  // Note: Alt+Wheel (vertical zoom) is handled in capture phase above
  function handleWheel(e: WheelEvent) {
    // Ctrl/Cmd + Wheel = Horizontal zoom (time scale)
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      const zoomFactor = 1.15;

      const state = getState();
      const currentZoom = state.viewport.pixelsPerSecond;
      const newZoom =
        delta > 0 ? currentZoom * zoomFactor : currentZoom / zoomFactor;

      const scrollInfo = timelineBodyRef?.getScrollInfo();
      if (scrollInfo && scrollInfo.width > 0) {
        const rect = panelElement.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - HEADER_WIDTH;
        const timeAtMouse = (mouseX + scrollInfo.scrollLeft) / currentZoom;

        state.setZoom(newZoom);

        const newPixelPos = timeAtMouse * newZoom;
        timelineBodyRef?.scrollTo(newPixelPos - mouseX);
      } else {
        state.setZoom(newZoom);
      }
      return;
    }

    // Shift + Wheel = Horizontal scroll
    if (e.shiftKey && timelineBodyRef) {
      e.preventDefault();
      const scrollInfo = timelineBodyRef.getScrollInfo();
      timelineBodyRef.scrollTo(scrollInfo.scrollLeft + e.deltaY);
    }
  }

  // Ensure panel gets focus when interacting with it
  function handlePanelClick() {
    panelElement?.focus();
  }

  // Keyboard shortcuts
  function handleKeyDown(e: KeyboardEvent) {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    switch (e.key) {
      case " ":
        e.preventDefault();
        getPlayback().togglePlayPause();
        break;
      case "j":
      case "J":
        e.preventDefault();
        getPlayback().shuttleReverse();
        break;
      case "k":
      case "K":
        e.preventDefault();
        getPlayback().shuttleStop();
        break;
      case "l":
        if (!hasSelection) {
          e.preventDefault();
          getPlayback().shuttleForward();
        }
        break;
      case "L":
        e.preventDefault();
        getPlayback().shuttleForward();
        break;
      case "Home":
        e.preventDefault();
        getPlayback().goToStart();
        break;
      case "End":
        e.preventDefault();
        getPlayback().goToEnd();
        break;
      case "ArrowLeft":
        e.preventDefault();
        getPlayback().stepBackward(e.shiftKey ? 10 : 1);
        break;
      case "ArrowRight":
        e.preventDefault();
        getPlayback().stepForward(e.shiftKey ? 10 : 1);
        break;
      case "i":
      case "I":
        e.preventDefault();
        getPlayback().setInPointAtPlayhead();
        break;
      case "o":
      case "O":
        e.preventDefault();
        getPlayback().setOutPointAtPlayhead();
        break;
      case "Escape":
        if (getPlayback().hasLoopRegion) {
          e.preventDefault();
          getPlayback().clearLoopRegion();
        }
        break;
      case "Delete":
      case "Backspace":
        if (hasSelection) {
          e.preventDefault();
          getState().removeSelectedClips();
        }
        break;
      case "a":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          getState().selectAllClips();
        }
        break;
      case "=":
      case "+":
        e.preventDefault();
        getState().zoomIn();
        break;
      case "-":
        e.preventDefault();
        getState().zoomOut();
        break;
      case "0":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          getState().zoomToFit();
        }
        break;
      case "z":
      case "Z":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.shiftKey) {
            getState().redo();
          } else {
            getState().undo();
          }
        }
        break;
      case "y":
      case "Y":
        // Windows-style redo
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          getState().redo();
        }
        break;
    }
  }

  // Build main panels array based on showMediaBrowser
  const mainPanels = $derived.by(() => {
    const panels = [
      { id: "left", content: leftSideContent, defaultSize: 3, minSize: 400 },
    ];
    if (showMediaBrowser) {
      panels.push({
        id: "media",
        content: mediaBrowserContent,
        defaultSize: 1,
        minSize: 250,
      });
    }
    return panels;
  });
</script>

<!-- Snippet: Monitors Area -->
{#snippet monitorsContent()}
  <div class="monitors-area">
    <PanelGroup
      direction="horizontal"
      panels={[
        {
          id: "program",
          content: programMonitorContent,
          defaultSize: 1,
          minSize: 200,
        },
        {
          id: "source",
          content: sourceMonitorContent,
          defaultSize: 1,
          minSize: 200,
        },
      ]}
      bind:sizes={monitorSizes}
    />
  </div>
{/snippet}

<!-- Snippet: Program Monitor -->
{#snippet programMonitorContent()}
  <MonitorPanel type="program">
    <TimelinePreview
      {playheadPosition}
      clips={allClips}
      {isPlaying}
      {pixelsPerSecond}
      {totalDuration}
    />
  </MonitorPanel>
{/snippet}

<!-- Snippet: Source Monitor -->
{#snippet sourceMonitorContent()}
  <MonitorPanel type="source">
    <SourcePreview
      sequence={sourceSequence}
      onAddToTimeline={handleAddSourceToTimeline}
    />
  </MonitorPanel>
{/snippet}

<!-- Snippet: Left side content -->
{#snippet leftSideContent()}
  <div class="left-side-content">
    {#if showPreview}
      <PanelGroup
        direction="vertical"
        panels={[
          {
            id: "monitors",
            content: monitorsContent,
            defaultSize: 1,
            minSize: 180,
          },
          {
            id: "timeline",
            content: timelineContent,
            defaultSize: 2,
            minSize: 100,
          },
        ]}
        bind:sizes={verticalSizes}
      />
    {:else}
      {@render timelineContent()}
    {/if}
  </div>
{/snippet}

<!-- Snippet: Media Browser Panel -->
{#snippet mediaBrowserContent()}
  <MediaBrowserPanel
    onLoadToSource={loadSourceSequence}
    onImport={handleMediaImport}
  />
{/snippet}

<!-- Snippet: Timeline Content -->
{#snippet timelineContent()}
  <TimelineBody
    bind:this={timelineBodyRef}
    {totalDuration}
    {playheadPosition}
    {pixelsPerSecond}
    {timelineWidth}
    {tracks}
    clips={allClips}
    {hasClips}
    activeSnapTime={getSnap().activeSnapTime}
    headerWidth={HEADER_WIDTH}
    onSeek={(time) => getPlayback().seek(time)}
    onAddTrack={() => getState().addTrack()}
    onBrowseLibrary={toggleMediaBrowser}
    onScrollXChange={(startTime) => getState().setScrollX(startTime)}
    onVerticalZoom={handleVerticalZoom}
  />
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="timeline-panel"
  bind:this={panelElement}
  onkeydown={handleKeyDown}
  onwheel={handleWheel}
  onclick={handlePanelClick}
  tabindex="0"
  role="application"
  aria-label="Timeline editor"
>
  {#if isLoading}
    <!-- Loading State -->
    <div class="loading-state">
      <div class="loading-skeleton">
        <div class="skeleton-controls"></div>
        <div class="skeleton-monitors"></div>
        <div class="skeleton-tracks">
          <div class="skeleton-track"></div>
          <div class="skeleton-track"></div>
        </div>
      </div>
      <span class="loading-text">{t("loading_timeline")}</span>
    </div>
  {:else}
    <!-- Error Banner (dismissible) -->
    {#if loadError}
      <div class="error-banner" role="alert">
        <i class="fa-solid fa-exclamation-triangle" aria-hidden="true"></i>
        <span>{loadError}</span>
        <button
          class="dismiss-btn"
          onclick={() => getState().clearLoadError()}
          aria-label={t("compose_ui_dismiss_error")}
        >
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
    {/if}

    <!-- Top Controls Bar -->
    <div class="controls-bar">
      <TimelineControls onOpenMediaBrowser={toggleMediaBrowser} />

      <LayoutToggles
        {showMediaBrowser}
        {showPreview}
        onToggleMediaBrowser={toggleMediaBrowser}
        onTogglePreview={() => (showPreview = !showPreview)}
      />
    </div>

    <!-- Main Content Area -->
    <div class="main-content">
      {#if showMediaBrowser}
        <PanelGroup
          direction="horizontal"
          panels={mainPanels}
          bind:sizes={mainSizes}
        />
      {:else}
        {@render leftSideContent()}
      {/if}
    </div>

    <!-- Clip Inspector Panel -->
    <ClipInspector />
  {/if}
</div>

<style>
  .timeline-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--theme-panel-bg);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    box-shadow: var(--theme-shadow, 0 14px 36px rgba(0, 0, 0, 0.4));
  }

  .controls-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--theme-card-bg);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .main-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .left-side-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }

  .monitors-area {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
    background: var(--theme-panel-elevated-bg);
  }

  /* Loading State */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;
  }

  .loading-skeleton {
    width: 80%;
    max-width: 600px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .skeleton-controls {
    height: 48px;
    background: var(--theme-card-bg);
    border-radius: 8px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .skeleton-monitors {
    height: 150px;
    background: var(--theme-card-bg);
    border-radius: 8px;
    animation: pulse 1.5s ease-in-out infinite;
    animation-delay: var(--duration-normal);
  }

  .skeleton-tracks {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skeleton-track {
    height: 60px;
    background: var(--theme-card-bg);
    border-radius: 6px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .skeleton-track:nth-child(2) {
    animation-delay: var(--duration-dramatic);
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 0.7;
    }
  }

  .loading-text {
    font-size: var(--font-size-min);
    color: var(--theme-text-dim);
  }

  /* Error Banner */
  .error-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: color-mix(in srgb, var(--semantic-warning) 15%, transparent);
    border-bottom: 1px solid var(--semantic-warning);
    color: var(--semantic-warning);
    font-size: var(--font-size-min);
  }

  .error-banner i {
    font-size: var(--font-size-sm);
  }

  .error-banner span {
    flex: 1;
  }

  .dismiss-btn {
    width: 32px;
    height: 32px;
    min-width: var(--min-touch-target, 48px);
    min-height: var(--min-touch-target, 48px);
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--semantic-warning);
    cursor: pointer;
    border-radius: 4px;
    transition: background var(--duration-fast) ease;
  }

  .dismiss-btn:hover {
    background: color-mix(in srgb, var(--semantic-warning) 20%, transparent);
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .skeleton-controls {
      animation: none;
    }
    .skeleton-monitors {
      animation: none;
    }
    .skeleton-track {
      animation: none;
    }
  }
</style>
