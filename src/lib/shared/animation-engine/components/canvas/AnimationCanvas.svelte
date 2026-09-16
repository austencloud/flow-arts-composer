<!--
  AnimationCanvas.svelte

  Wraps AnimatorCanvas with styling container.
  Handles canvas display and container styling.

  Now includes AnimationVideoPlayer for video generation/playback.
-->
<script lang="ts">
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import { Letter } from "$lib/shared/foundation/domain/models/letter";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
  import type { TrailSettings } from "$lib/shared/animation-engine/domain/types/trail-types";
  import type { VideoRenderResult } from "$lib/shared/animation-engine/services/video-pre-renderer";
  import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

  let {
    leftProp = null,
    rightProp = null,
    gridVisible = true,
    gridMode = null,
    letter = null,
    stepData = null,
    sequenceData = null,
    isPlaying = false,
    speed = 1.0,
    trailSettings = $bindable(),
    onCanvasReady = () => {},
    onVideoStepChange = () => {},
    onPlaybackToggle = () => {},
  }: {
    leftProp?: PropState | null;
    rightProp?: PropState | null;
    gridVisible?: boolean;
    gridMode?: GridMode | null | undefined;
    letter?: Letter | null;
    stepData?: StartPlacementData | StepData | null;
    sequenceData?: SequenceData | null;
    isPlaying?: boolean;
    speed?: number;
    trailSettings?: TrailSettings;
    onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
    onVideoStepChange?: (beat: number) => void;
    onPlaybackToggle?: () => void;
  } = $props();

  // Video player state
  let playbackMode = $state<"live" | "video">("live");

  function handleVideoReady(result: VideoRenderResult) {
    // Video render complete - result available
  }

  function handleModeChange(mode: "live" | "video") {
    playbackMode = mode;
  }
</script>

<div class="canvas-area">
  <!-- Live canvas (hidden when video mode is active) -->
  <div class="animation-canvas-wrapper" class:hidden={playbackMode === "video"}>
    <AnimatorCanvas
      {leftProp}
      {rightProp}
      {gridVisible}
      {gridMode}
      {letter}
      {stepData}
      {sequenceData}
      {isPlaying}
      {onCanvasReady}
      {onPlaybackToggle}
      bind:trailSettings
    />
  </div>

  <!-- Video player overlay -->
  {#await import("$lib/features/compose/components/canvas/AnimationVideoPlayer.svelte") then mod}
    <mod.default
      {sequenceData}
      {isPlaying}
      {speed}
      autoGenerateVideo={false}
      onVideoReady={handleVideoReady}
      onModeChange={handleModeChange}
      onStepChange={onVideoStepChange}
    />
  {/await}
</div>

<style>
  .canvas-area {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 200px; /* Ensure canvas is always visible */
    min-width: 0;
    /* Canvas expands aggressively to fill available space */
    flex: 1 1 auto;
    container-type: size;
    container-name: canvas-zone;
    background: var(--theme-card-bg);
    border-radius: 12px;
    border: 1px solid var(--theme-stroke);
    overflow: hidden;
  }

  .animation-canvas-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .animation-canvas-wrapper.hidden {
    display: none;
  }
</style>
