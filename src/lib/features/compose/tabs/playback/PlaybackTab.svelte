<!--
  PlaybackTab.svelte

  Unified playback view that consolidates all animation rendering.
  Switches renderers based on current mode and provides unified controls.
-->
<script lang="ts">
  import { getDeviceDetector } from "#lib/shared/device/get-device-detector.js";
  import { getPlaybackState } from "./state/playback-state.svelte";
  import { getComposeModuleState } from "../../shared/state/compose-module-state.svelte";
  import type { DeviceDetector } from "#lib/shared/device/services/device-detector.js";
  import { onMount } from "svelte";
  import PlaybackHeader from "./components/PlaybackHeader.svelte";
  import PlaybackControls from "./components/PlaybackControls.svelte";
  import MobilePlaybackToolbar from "./components/MobilePlaybackToolbar.svelte";
  import MobilePlaybackStepGrid from "./components/MobilePlaybackStepGrid.svelte";
  import TrailSettingsSheet from "../../components/controls/TrailSettingsSheet.svelte";
  import SingleRenderer from "./renderers/SingleRenderer.svelte";
  import TunnelRenderer from "./renderers/TunnelRenderer.svelte";
  import MirrorRenderer from "./renderers/MirrorRenderer.svelte";
  import GridRenderer from "./renderers/GridRenderer.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { getMotionColor } from "#lib/shared/utils/svg-color-utils.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

  // Get state instances
  const playbackState = getPlaybackState();
  const moduleState = getComposeModuleState();

  // Device detection for mobile layout
  let deviceDetector: DeviceDetector | null = $state(null);
  let isMobile = $state(false);

  onMount(() => {
    deviceDetector = getDeviceDetector();
    // Check initial state
    isMobile = deviceDetector?.isMobile() ?? false;

    // Listen for viewport changes
    const handleResize = () => {
      isMobile = deviceDetector?.isMobile() ?? false;
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  // Trail settings sheet
  let isTrailSettingsOpen = $state(false);

  // Tunnel colors - uses centralized getMotionColor (dark mode for animation canvas)
  const tunnelColors = {
    primary: {
      left: getMotionColor(HandSide.LEFT, "dark"),
      right: getMotionColor(HandSide.RIGHT, "dark"),
    },
    secondary: {
      left: "#06b6d4",
      right: "#ec4899",
    },
  };

  // Grid state (placeholder - should come from grid tab state)
  const gridSequences = $state<(SequenceData | null)[]>([]);
  const gridRotationOffsets = $state<number[]>([0, 90, 180, 270]);

  // Handlers
  function handleClose() {
    moduleState.closePlayback();
  }

  function handlePlayPause() {
    if (playbackState.isPlaying) {
      playbackState.pause();
    } else {
      playbackState.play();
    }
  }

  function handleToggleMobileView() {
    playbackState.toggleMobileToolView();
  }

  function handleSave() {
    // TODO: Implement save functionality
  }

  function handleOpenSettings(_canvasId: string) {
    isTrailSettingsOpen = true;
  }

  function handleGridSelectCell(index: number) {
    // TODO: Open sequence browser for this grid cell
  }

  function handleGridRemoveCell(index: number) {
    // TODO: Remove sequence from grid cell
  }

  // Get primary and secondary sequences for tunnel mode
  const primarySequence = $derived(() => {
    return playbackState.sequences[0]?.sequence || null;
  });

  const secondarySequence = $derived(() => {
    return playbackState.sequences[1]?.sequence || null;
  });

  // Get single sequence
  const singleSequence = $derived(() => {
    return playbackState.sequences[0]?.sequence || null;
  });

  // Get mirror sequence
  const mirrorSequence = $derived(() => {
    return playbackState.sequences[0]?.sequence || null;
  });
</script>

<div class="playback-tab" class:mobile={isMobile}>
  {#if isMobile}
    <!-- Mobile Layout: Toolbar at top, canvas, then tool area -->
    <MobilePlaybackToolbar
      isPlaying={playbackState.isPlaying}
      activeView={playbackState.mobileToolView}
      sequence={playbackState.sequences[0]?.sequence ?? null}
      onPlayPause={handlePlayPause}
      onToggleView={handleToggleMobileView}
      onClose={handleClose}
    />
  {:else}
    <!-- Desktop Layout: Header with mode/actions -->
    <PlaybackHeader
      currentMode={playbackState.currentMode}
      sequence={playbackState.sequences[0]?.sequence ?? null}
      onSave={handleSave}
      onClose={handleClose}
    />
  {/if}

  <!-- Renderer Area -->
  <div class="renderer-area">
    {#if playbackState.currentMode === "single"}
      <SingleRenderer
        sequence={singleSequence()}
        isPlaying={playbackState.isPlaying}
        speed={playbackState.speed}
        shouldLoop={playbackState.shouldLoop}
        playbackMode={playbackState.playbackMode}
        stepPlaybackPauseMs={playbackState.stepPlaybackPauseMs}
        stepPlaybackStepSize={playbackState.stepPlaybackStepSize}
        visible={playbackState.sequences[0]?.visible ?? true}
        leftVisible={playbackState.sequences[0]?.leftVisible ?? true}
        rightVisible={playbackState.sequences[0]?.rightVisible ?? true}
        onOpenSettings={handleOpenSettings}
      />
    {:else if playbackState.currentMode === "tunnel"}
      <TunnelRenderer
        primarySequence={primarySequence()}
        secondarySequence={secondarySequence()}
        {tunnelColors}
        isPlaying={playbackState.isPlaying}
        speed={playbackState.speed}
        shouldLoop={playbackState.shouldLoop}
        playbackMode={playbackState.playbackMode}
        stepPlaybackPauseMs={playbackState.stepPlaybackPauseMs}
        stepPlaybackStepSize={playbackState.stepPlaybackStepSize}
        primaryVisible={playbackState.sequences[0]?.visible ?? true}
        primaryLeftVisible={playbackState.sequences[0]?.leftVisible ?? true}
        primaryRightVisible={playbackState.sequences[0]?.rightVisible ?? true}
        secondaryVisible={playbackState.sequences[1]?.visible ?? true}
        secondaryLeftVisible={playbackState.sequences[1]?.leftVisible ?? true}
        secondaryRightVisible={playbackState.sequences[1]?.rightVisible ?? true}
        onOpenSettings={handleOpenSettings}
      />
    {:else if playbackState.currentMode === "mirror"}
      <MirrorRenderer
        sequence={mirrorSequence()}
        axis="vertical"
        onOpenSettings={handleOpenSettings}
      />
    {:else if playbackState.currentMode === "grid"}
      <GridRenderer
        {gridSequences}
        {gridRotationOffsets}
        isPlaying={playbackState.isPlaying}
        speed={playbackState.speed}
        shouldLoop={playbackState.shouldLoop}
        playbackMode={playbackState.playbackMode}
        stepPlaybackPauseMs={playbackState.stepPlaybackPauseMs}
        stepPlaybackStepSize={playbackState.stepPlaybackStepSize}
        onSelectCell={handleGridSelectCell}
        onRemoveCell={handleGridRemoveCell}
        onOpenSettings={handleOpenSettings}
      />
    {/if}
  </div>

  <!-- Tool Area: Beat Grid or Controls -->
  {#if isMobile}
    <div class="mobile-tool-area">
      {#if playbackState.mobileToolView === "step-grid"}
        <MobilePlaybackStepGrid
          sequence={singleSequence()}
          currentStep={playbackState.currentStep}
          isPlaying={playbackState.isPlaying}
        />
      {:else}
        <PlaybackControls
          isPlaying={playbackState.isPlaying}
          speed={playbackState.speed}
          shouldLoop={playbackState.shouldLoop}
          playbackMode={playbackState.playbackMode}
          stepPlaybackPauseMs={playbackState.stepPlaybackPauseMs}
          stepPlaybackStepSize={playbackState.stepPlaybackStepSize}
          onPlay={() => playbackState.play()}
          onPause={() => playbackState.pause()}
          onStop={() => playbackState.stop()}
          onSpeedChange={(speed) => playbackState.setSpeed(speed)}
          onLoopToggle={(loop) => playbackState.setLoop(loop)}
          onPlaybackModeChange={(mode) => playbackState.setPlaybackMode(mode)}
          onStepPlaybackPauseMsChange={(pauseMs) =>
            playbackState.setStepPlaybackPauseMs(pauseMs)}
          onStepPlaybackStepSizeChange={(stepSize) =>
            playbackState.setStepPlaybackStepSize(stepSize)}
        />
      {/if}
    </div>
  {:else}
    <!-- Desktop: Always show controls -->
    <PlaybackControls
      isPlaying={playbackState.isPlaying}
      speed={playbackState.speed}
      shouldLoop={playbackState.shouldLoop}
      playbackMode={playbackState.playbackMode}
      stepPlaybackPauseMs={playbackState.stepPlaybackPauseMs}
      stepPlaybackStepSize={playbackState.stepPlaybackStepSize}
      onPlay={() => playbackState.play()}
      onPause={() => playbackState.pause()}
      onStop={() => playbackState.stop()}
      onSpeedChange={(speed) => playbackState.setSpeed(speed)}
      onLoopToggle={(loop) => playbackState.setLoop(loop)}
      onPlaybackModeChange={(mode) => playbackState.setPlaybackMode(mode)}
      onStepPlaybackPauseMsChange={(pauseMs) =>
        playbackState.setStepPlaybackPauseMs(pauseMs)}
      onStepPlaybackStepSizeChange={(stepSize) =>
        playbackState.setStepPlaybackStepSize(stepSize)}
    />
  {/if}

  <!-- Trail Settings Sheet -->
  <TrailSettingsSheet bind:isOpen={isTrailSettingsOpen} />
</div>

<style>
  .playback-tab {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--color-background-primary, #1a1a1a);
    overflow: hidden;
  }

  .renderer-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    min-height: 0;
  }

  /* Mobile tool area */
  .mobile-tool-area {
    flex-shrink: 0;
    min-height: 140px;
    max-height: 200px;
    background: var(--theme-panel-bg);
    border-top: 1px solid var(--theme-stroke);
  }

  /* Mobile: Give more space to canvas */
  .playback-tab.mobile .renderer-area {
    flex: 1;
    min-height: 50%;
  }

  /* Safe area for mobile tool area */
  @supports (padding-bottom: env(safe-area-inset-bottom)) {
    .mobile-tool-area {
      padding-bottom: env(safe-area-inset-bottom);
    }
  }
</style>
