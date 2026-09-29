<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { getVideoTrailsContext } from "../context/video-trails-context";
  import {
    historyForSource,
    recordGuidedPlacement,
    undoGuidedPlacement,
    type GuidedPlacementUndoEntry,
  } from "./guided-placement-undo";
  import EndpointEditor from "../components/EndpointEditor.svelte";
  import EndpointSidebar from "../components/EndpointSidebar.svelte";
  import FrameStepper from "../components/FrameStepper.svelte";
  import TimelineScrubber from "../components/TimelineScrubber.svelte";
  import TrainingDataPanel from "../components/TrainingDataPanel.svelte";
  import DetectorEvaluator from "../components/DetectorEvaluator.svelte";

  type ToolMode = "select" | "place" | "occlude" | "guided";

  interface GuidedStep {
    propIndex: 0 | 1;
    tipIndex: number;
    label: string;
    color: string;
  }

  // Blue = viewer's left prop, Red = viewer's right prop.
  // Thumb end = the end nearest the performer's thumb (consistent grip reference).
  // Pinky end = the opposite end.
  const GUIDED_SEQUENCE: GuidedStep[] = [
    { propIndex: 0, tipIndex: 0, label: "Left prop (blue) - thumb end", color: "#4a90d9" },
    { propIndex: 0, tipIndex: 1, label: "Left prop (blue) - pinky end", color: "#4a90d9" },
    { propIndex: 1, tipIndex: 0, label: "Right prop (red) - thumb end", color: "#d94a4a" },
    { propIndex: 1, tipIndex: 1, label: "Right prop (red) - pinky end", color: "#d94a4a" },
  ];

  const { state: trailsState } = getVideoTrailsContext();

  let videoElement: HTMLVideoElement | undefined = $state();
  let canvasWidth = $state(640);
  let canvasHeight = $state(360);
  let toolMode = $state<ToolMode>("guided");
  let selectedEndpointIdx = $state(-1);
  let slowPlaying = $state(false);
  let slowPlayTimer = $state<ReturnType<typeof setInterval> | null>(null);
  let showAdvancedPanel = $state(false);

  // Guided placement state
  let guidedStepIdx = $state(0);
  let guidedFrameStep = $state(5);
  let currentGuidedStep = $derived<GuidedStep | null>(
    toolMode === "guided" ? (GUIDED_SEQUENCE[guidedStepIdx] ?? null) : null,
  );

  let undoStack = $state<GuidedPlacementUndoEntry[]>([]);
  let historySourceUrl = trailsState.source?.url;

  $effect(() => {
    const sourceUrl = trailsState.source?.url;
    if (sourceUrl === historySourceUrl) return;
    historySourceUrl = sourceUrl;
    undoStack = untrack(() => historyForSource(undoStack, sourceUrl ?? null));
    guidedStepIdx = 0;
  });

  function handleGuidedPlacement(x: number, y: number): void {
    const step = GUIDED_SEQUENCE[guidedStepIdx];
    if (!step) return;
    undoStack = recordGuidedPlacement(undoStack, trailsState, {
      sourceUrl: trailsState.source?.url ?? null,
      frame: trailsState.currentFrame,
      propIndex: step.propIndex,
      tipIndex: step.tipIndex,
      previousGuidedStepIdx: guidedStepIdx,
      previousFrame: trailsState.currentFrame,
    });

    trailsState.correctEndpoint(trailsState.currentFrame, {
      propIndex: step.propIndex,
      tipIndex: step.tipIndex,
      detected: null,
      corrected: { x, y },
      status: "corrected",
    });

    // Advance to next step
    const nextIdx = guidedStepIdx + 1;
    if (nextIdx >= GUIDED_SEQUENCE.length) {
      guidedStepIdx = 0;
      const nextFrame = Math.min(
        trailsState.totalFrames - 1,
        trailsState.currentFrame + guidedFrameStep,
      );
      trailsState.setCurrentFrame(nextFrame);
    } else {
      guidedStepIdx = nextIdx;
    }
  }

  function undo(): void {
    const result = undoGuidedPlacement(undoStack, trailsState, trailsState.source?.url ?? null);
    undoStack = result.stack;
    const entry = result.entry;
    if (!entry) return;

    // Restore guided step and frame
    guidedStepIdx = entry.previousGuidedStepIdx;
    if (entry.previousFrame !== trailsState.currentFrame) {
      trailsState.setCurrentFrame(entry.previousFrame);
    }
  }

  // Force canvas redraw counter - incremented when video seeks to a new frame,
  // since videoElement.currentTime is a DOM property that Svelte can't track.
  let redrawTick = $state(0);

  // Wire video element to source URL
  $effect(() => {
    if (!videoElement || !trailsState.source?.url) return;
    const url = trailsState.source.url;
    if (videoElement.src === url) return;

    videoElement.src = url;
    videoElement.onloadedmetadata = () => {
      if (!videoElement) return;
      canvasWidth = videoElement.videoWidth;
      canvasHeight = videoElement.videoHeight;
    };
    // After each seek completes, bump the redraw counter so the canvas updates
    videoElement.onseeked = () => { redrawTick++; };
    // Draw first frame as soon as video can display
    videoElement.oncanplay = () => { redrawTick++; };
  });

  // Seek the hidden video element to the current frame whenever it changes
  $effect(() => {
    if (!videoElement || !trailsState.source) return;
    const time = trailsState.currentFrame / trailsState.source.fps;
    if (Math.abs(videoElement.currentTime - time) > 0.01) {
      videoElement.currentTime = time;
    }
  });

  // Keyboard handler for the entire studio (frame navigation)
  function handleKeydown(e: KeyboardEvent): void {
    // Don't capture keyboard events from the canvas/editor (it has its own handler)
    const target = e.target as HTMLElement;
    if (target.tagName === "CANVAS" || target.closest("[role='application']")) return;

    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      trailsState.setCurrentFrame(Math.max(0, trailsState.currentFrame - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      trailsState.setCurrentFrame(
        Math.min(trailsState.totalFrames - 1, trailsState.currentFrame + step),
      );
    } else if (e.key === " ") {
      e.preventDefault();
      toggleSlowPlay();
    }
  }

  // Frame navigation
  function stepBack1(): void {
    trailsState.setCurrentFrame(Math.max(0, trailsState.currentFrame - 1));
  }

  function stepBack10(): void {
    trailsState.setCurrentFrame(Math.max(0, trailsState.currentFrame - 10));
  }

  function stepForward1(): void {
    trailsState.setCurrentFrame(Math.min(trailsState.totalFrames - 1, trailsState.currentFrame + 1));
  }

  function stepForward10(): void {
    trailsState.setCurrentFrame(
      Math.min(trailsState.totalFrames - 1, trailsState.currentFrame + 10),
    );
  }

  // Slow play: advance ~4 frames per second
  function toggleSlowPlay(): void {
    if (slowPlaying) {
      stopSlowPlay();
    } else {
      slowPlaying = true;
      slowPlayTimer = setInterval(() => {
        if (trailsState.currentFrame >= trailsState.totalFrames - 1) {
          stopSlowPlay();
          return;
        }
        trailsState.setCurrentFrame(trailsState.currentFrame + 1);
      }, 250);
    }
  }

  function stopSlowPlay(): void {
    slowPlaying = false;
    if (slowPlayTimer) {
      clearInterval(slowPlayTimer);
      slowPlayTimer = null;
    }
  }

  function handleSelectEndpoint(idx: number): void {
    selectedEndpointIdx = idx;
  }

  onDestroy(() => {
    stopSlowPlay();
    if (videoElement) {
      videoElement.pause();
      videoElement.src = "";
    }
  });
</script>

{#if !trailsState.source}
  <div class="no-video">
    <i class="fas fa-film" aria-hidden="true"></i>
    <p>No video loaded. Go to the Workspace tab to load a source.</p>
  </div>
{:else}
  <!-- Hidden video element for reliable frame seeking -->
  <video
    bind:this={videoElement}
    crossorigin="anonymous"
    playsinline
    muted
    preload="auto"
    class="hidden-video"
  ></video>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="studio"
    onkeydown={handleKeydown}
    tabindex="0"
    data-edit-history-shortcut-scope
  >
    <!-- Toolbar strip -->
    <div class="toolbar-strip">
      <div class="tool-group">
        <button
          class="tool-btn"
          class:active={toolMode === "select"}
          onclick={() => (toolMode = "select")}
          title="Select / drag endpoints (S)"
          aria-label="Select mode"
        >
          <i class="fas fa-mouse-pointer" aria-hidden="true"></i>
          <span class="tool-label">Select</span>
        </button>
        <button
          class="tool-btn"
          class:active={toolMode === "place"}
          onclick={() => (toolMode = "place")}
          title="Click to place new endpoint (P)"
          aria-label="Place mode"
        >
          <i class="fas fa-crosshairs" aria-hidden="true"></i>
          <span class="tool-label">Place</span>
        </button>
        <button
          class="tool-btn"
          class:active={toolMode === "occlude"}
          onclick={() => (toolMode = "occlude")}
          title="Click endpoint to mark occluded (X)"
          aria-label="Occlude mode"
        >
          <i class="fas fa-eye-slash" aria-hidden="true"></i>
          <span class="tool-label">Occlude</span>
        </button>

        <div class="tool-divider"></div>

        <button
          class="tool-btn guide-btn"
          class:active={toolMode === "guided"}
          onclick={() => { toolMode = "guided"; guidedStepIdx = 0; }}
          title="Guided placement: click 4 endpoints per frame, auto-advance"
          aria-label="Guided placement mode"
        >
          <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
          <span class="tool-label">Guide</span>
        </button>
      </div>

      {#if toolMode === "guided"}
        <div class="guided-controls">
          <span class="guided-step-label" style="color: {currentGuidedStep?.color ?? '#fff'}">
            {guidedStepIdx + 1}/4: {currentGuidedStep?.label ?? "Done"}
          </span>
          <span class="guided-sep">|</span>
          <span class="guided-advance-label">Every</span>
          {#each [1, 3, 5, 10] as step}
            <button
              class="frame-step-pill"
              class:active={guidedFrameStep === step}
              onclick={() => { guidedFrameStep = step; }}
            >
              {step}f
            </button>
          {/each}
        </div>
      {/if}

      <div class="toolbar-spacer"></div>

      <div class="toolbar-info">
        <button
          data-undo-shortcut
          data-undo-shortcut-label="Last placement"
          class="tool-btn compact"
          onclick={undo}
          disabled={undoStack.length === 0}
          title="Undo last placement (Ctrl+Z)"
          aria-label="Undo"
        >
          <i class="fas fa-undo" aria-hidden="true"></i>
        </button>
        <span class="info-badge">
          <i class="fas fa-crosshairs" aria-hidden="true"></i>
          {trailsState.currentEndpoints.length} endpoints
        </span>
        <button
          class="tool-btn compact"
          class:active={showAdvancedPanel}
          onclick={() => (showAdvancedPanel = !showAdvancedPanel)}
          title="Toggle advanced panels"
          aria-label="Toggle advanced panels"
        >
          <i class="fas fa-chart-bar" aria-hidden="true"></i>
        </button>
      </div>
    </div>

    <!-- Main content area -->
    <div class="content-area">
      <!-- Canvas area -->
      <div class="canvas-area">
        <EndpointEditor
          videoElement={videoElement ?? null}
          width={canvasWidth}
          height={canvasHeight}
          {toolMode}
          selectedIdx={selectedEndpointIdx}
          onSelectEndpoint={handleSelectEndpoint}
          guidedStep={currentGuidedStep}
          onGuidedPlacement={handleGuidedPlacement}
          {redrawTick}
        />
      </div>

      <!-- Sidebar -->
      <div class="sidebar">
        <EndpointSidebar
          selectedEndpointIdx={selectedEndpointIdx}
          onSelectEndpoint={handleSelectEndpoint}
        />
      </div>
    </div>

    <!-- Advanced panels (collapsible) -->
    {#if showAdvancedPanel}
      <div class="advanced-panels">
        <TrainingDataPanel videoElement={videoElement ?? null} />
        <DetectorEvaluator videoElement={videoElement ?? null} />
      </div>
    {/if}

    <!-- Frame stepper + timeline -->
    <div class="bottom-controls">
      <FrameStepper
        currentFrame={trailsState.currentFrame}
        totalFrames={trailsState.totalFrames}
        {slowPlaying}
        onStepBack1={stepBack1}
        onStepBack10={stepBack10}
        onStepForward1={stepForward1}
        onStepForward10={stepForward10}
        onToggleSlowPlay={toggleSlowPlay}
      />
      <TimelineScrubber />
    </div>
  </div>
{/if}

<style>
  .no-video {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .no-video i {
    font-size: 48px;
    opacity: 0.3;
  }

  .no-video p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
  }

  .hidden-video {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .studio {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0;
    overflow: hidden;
  }

  .studio:focus-visible {
    outline: none;
  }

  /* Toolbar strip */
  .toolbar-strip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .tool-group {
    display: flex;
    gap: 2px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-radius: 6px;
    padding: 2px;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: all 0.1s;
  }

  .tool-btn:hover {
    color: var(--theme-text, #ffffff);
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
  }

  .tool-btn.active {
    color: var(--theme-accent, #f43f5e);
    background: color-mix(in srgb, var(--theme-accent, #f43f5e) 12%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent, #f43f5e) 30%, transparent);
  }

  .tool-btn.compact {
    padding: 5px 8px;
  }


  .tool-label {
    font-weight: 500;
  }

  .tool-divider {
    width: 1px;
    height: 20px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    margin: 0 4px;
  }

  .guide-btn.active {
    background: rgba(168, 85, 247, 0.15);
    border-color: rgba(168, 85, 247, 0.4);
    color: #a855f7;
  }

  .guided-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    font-size: var(--font-size-compact, 12px);
  }

  .guided-step-label {
    font-weight: 600;
    white-space: nowrap;
  }

  .guided-sep {
    color: var(--theme-stroke, rgba(255, 255, 255, 0.15));
  }

  .guided-advance-label {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    white-space: nowrap;
  }

  .frame-step-pill {
    padding: 2px 8px;
    border: none;
    border-radius: 4px;
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
  }

  .frame-step-pill.active {
    background: var(--theme-accent, #f43f5e);
    color: white;
  }

  .toolbar-spacer {
    flex: 1;
  }

  .toolbar-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .info-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  /* Content area */
  .content-area {
    display: grid;
    grid-template-columns: 1fr 260px;
    gap: 0;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .canvas-area {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    padding: 8px;
  }

  .sidebar {
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    padding: 8px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2)) transparent;
  }

  /* Advanced panels */
  .advanced-panels {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    max-height: 300px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2)) transparent;
  }

  /* Bottom controls */
  .bottom-controls {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 12px 8px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    flex-shrink: 0;
  }

  /* Responsive: stack vertically on narrow containers */
  @container (max-width: 700px) {
    .content-area {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr auto;
    }

    .sidebar {
      border-left: none;
      border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
      max-height: 200px;
    }

    .advanced-panels {
      grid-template-columns: 1fr;
    }

    .tool-label {
      display: none;
    }
  }
</style>
