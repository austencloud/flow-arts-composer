<script lang="ts">
  /**
   * VideoEditorOverlay
   *
   * Unified full-screen overlay for video editing.
   * Supports three modes: browse, curate, and link.
   * Curate mode uses 3-column layout: sequence | video | metadata
   */
  import { onMount } from "svelte";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import VideoStage from "./VideoStage.svelte";
  import KeyboardHintsBar from "./KeyboardHintsBar.svelte";
  import BrowsePanel from "./panels/BrowsePanel.svelte";
  import CuratePanel from "./panels/CuratePanel.svelte";
  import CurateSequencePanel from "./panels/CurateSequencePanel.svelte";
  import CurateMetadataPanel from "./panels/CurateMetadataPanel.svelte";
  import LinkPanel from "./panels/LinkPanel.svelte";
  import RenamePanel from "./panels/RenamePanel.svelte";
  import type { VideoEditorController } from "../../state/video-editor-controller.svelte";

  interface Props {
    controller: VideoEditorController;
    formatDate: (date: Date | null) => string;
  }

  let { controller, formatDate }: Props = $props();

  // Video element reference for playback preservation
  let videoEl: HTMLVideoElement | null = $state(null);
  let lastVideoSrc = $state<string | null>(null);
  let savedCurrentTime = 0;

  const currentVideoSrc = $derived(controller.videoUrl || controller.currentVideo?.videoUrl || null);

  // Reset saved time when video source changes
  $effect(() => {
    if (currentVideoSrc !== lastVideoSrc) {
      lastVideoSrc = currentVideoSrc;
      savedCurrentTime = 0;
    }
  });

  // Restore playback position after DOM updates
  $effect(() => {
    if (videoEl && savedCurrentTime > 0 && videoEl.currentTime < 1) {
      videoEl.currentTime = savedCurrentTime;
    }
  });

  function savePlaybackPosition() {
    if (videoEl) {
      savedCurrentTime = videoEl.currentTime;
    }
  }

  // Keyboard handler
  onMount(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      controller.handleKeydown(e);
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  const mode = $derived(controller.mode);
  const currentVideo = $derived(controller.currentVideo);
  const progress = $derived(controller.curationProgress);
  const stats = $derived(controller.stats);
</script>

{#if mode !== "closed" && currentVideo}
  <div class="editor-overlay">
    <!-- Header -->
    <header class="header">
      <button class="back-btn" onclick={controller.close} aria-label="Exit">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>

      <!-- Mode label for mobile -->
      <div class="mode-label">
        {#if mode === "browse"}
          Edit Video
        {:else if mode === "curate"}
          Curate
        {:else if mode === "link"}
          Link Sequences
        {:else if mode === "rename"}
          Rename Videos
        {/if}
      </div>

      <!-- Progress (curate/link/rename modes) -->
      {#if mode === "curate"}
        <div class="progress-pill">
          <span class="progress-num">{progress.done}</span>
          <span class="progress-sep">/</span>
          <span class="progress-total">{stats.total}</span>
        </div>
      {:else if mode === "link"}
        <div class="progress-pill">
          <span class="progress-num">{controller.linkingProgress.linked}</span>
          <span class="progress-sep">/</span>
          <span class="progress-total">{stats.withWord}</span>
          <span class="progress-suffix">linked</span>
        </div>
      {:else if mode === "rename"}
        <div class="progress-pill rename">
          <span class="progress-num">{controller.renamingProgress.named}</span>
          <span class="progress-sep">/</span>
          <span class="progress-total">{controller.renamingProgress.named + controller.unnamedVideos.length}</span>
          <span class="progress-suffix">named</span>
        </div>
      {:else}
        <div class="header-spacer"></div>
      {/if}
    </header>

    <!-- Main content -->
    <main class="main" class:curate-layout={mode === "curate"} class:rename-layout={mode === "rename"}>
      {#if mode === "curate"}
        <!-- Curate: 3-column layout -->
        <div class="side-panel left-panel">
          <CurateSequencePanel video={currentVideo} {controller} />
        </div>

        <VideoStage
          video={currentVideo}
          videoUrl={controller.videoUrl}
          saving={controller.saving}
          onOpenCrop={controller.openCropMode}
          onClearCrop={controller.clearCrop}
          onOpenSnip={controller.openSnipMode}
          onClearSnip={controller.clearSnip}
          bind:videoElement={videoEl}
          onTimeUpdate={savePlaybackPosition}
        />

        <div class="side-panel right-panel">
          <CurateMetadataPanel video={currentVideo} {controller} {formatDate} />
        </div>
      {:else if mode === "rename"}
        <!-- Rename: centered 2-column layout -->
        <VideoStage
          video={currentVideo}
          videoUrl={controller.videoUrl}
          saving={controller.saving}
          onOpenCrop={controller.openCropMode}
          onClearCrop={controller.clearCrop}
          onOpenSnip={controller.openSnipMode}
          onClearSnip={controller.clearSnip}
          bind:videoElement={videoEl}
          onTimeUpdate={savePlaybackPosition}
        />

        <div class="side-panel rename-panel-container">
          <RenamePanel
            video={currentVideo}
            {controller}
            {formatDate}
          />
        </div>
      {:else}
        <!-- Browse/Link: 2-column layout -->
        <VideoStage
          video={currentVideo}
          videoUrl={controller.videoUrl}
          saving={controller.saving}
          onOpenCrop={controller.openCropMode}
          onClearCrop={controller.clearCrop}
          onOpenSnip={controller.openSnipMode}
          onClearSnip={controller.clearSnip}
          bind:videoElement={videoEl}
          onTimeUpdate={savePlaybackPosition}
        />

        <div class="info-panel">
          {#if mode === "browse"}
            <BrowsePanel
              video={currentVideo}
              {controller}
              {formatDate}
            />
          {:else if mode === "link"}
            <LinkPanel
              video={currentVideo}
              {controller}
              {formatDate}
            />
          {/if}
        </div>
      {/if}
    </main>

    <!-- Keyboard hints -->
    <KeyboardHintsBar
      {mode}
      categoryCount={controller.categories.length}
      performerKeys={controller.performerKeys}
      hasSelectedSequence={!!controller.selectedSequenceForLink}
    />

    <!-- Saving indicator -->
    {#if controller.saving}
      <div class="saving-indicator">
        <ProgressRing percent={-1} size={24} strokeWidth={2} />
      </div>
    {/if}
  </div>
{/if}

<style>
  .editor-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-toast);
    background: var(--theme-panel-bg, #0a0a12);
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .header {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    z-index: 10;
    pointer-events: none;
  }

  .header > * {
    pointer-events: auto;
  }

  .back-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    transition: all 0.2s;
    backdrop-filter: blur(8px);
  }

  .back-btn:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, white);
  }

  .mode-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .progress-pill {
    display: flex;
    align-items: baseline;
    gap: 2px;
    padding: 8px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border-radius: 20px;
    backdrop-filter: blur(8px);
  }

  .progress-num {
    font-size: 18px;
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .progress-sep {
    font-size: 14px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    margin: 0 2px;
  }

  .progress-total {
    font-size: 14px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .progress-suffix {
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    margin-left: 4px;
  }

  .progress-pill.rename {
    background: color-mix(in srgb, #f59e0b 15%, rgba(255, 255, 255, 0.06));
    border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent);
  }

  .progress-pill.rename .progress-num {
    color: #f59e0b;
  }

  .header-spacer {
    width: 44px;
  }

  /* Main layout */
  .main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 40px;
    padding: 80px 40px 60px;
    overflow: hidden;
  }

  /* 3-column curate layout - centered group */
  .main.curate-layout {
    gap: 24px;
    padding: 80px 24px 60px;
    justify-content: center;
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
  }

  /* 2-column rename layout - centered group */
  .main.rename-layout {
    gap: 24px;
    padding: 80px 24px 60px;
    justify-content: center;
    max-width: 1000px;
    margin: 0 auto;
    width: 100%;
  }

  .rename-panel-container {
    width: 340px;
  }

  /* Side panels for curate mode */
  .side-panel {
    width: 300px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    padding: 20px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-radius: 16px;
    max-height: calc(100vh - 180px);
    overflow-y: auto;
  }

  /* Side panel notes: left-panel is for sequences (slightly narrower is fine), right-panel is for metadata */

  /* Info panel (for browse/link modes) */
  .info-panel {
    width: 340px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    padding: 24px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-radius: 20px;
    max-height: calc(100vh - 200px);
    overflow-y: auto;
    position: relative;
  }

  /* Saving indicator */
  .saving-indicator {
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 20px;
    background: rgba(0, 0, 0, 0.8);
    border-radius: 12px;
    backdrop-filter: blur(8px);
  }

  /* Responsive - 3-column curate layout */
  @media (max-width: 1200px) {
    .main.curate-layout {
      gap: 16px;
      padding: 80px 16px 60px;
    }

    .side-panel {
      width: 260px;
      padding: 16px;
    }
  }

  @media (max-width: 1000px) {
    .main.curate-layout {
      flex-direction: column;
      overflow-y: auto;
      align-items: stretch;
      gap: 20px;
    }

    .side-panel {
      width: 100%;
      max-width: 500px;
      max-height: none;
      align-self: center;
    }
  }

  /* Responsive - 2-column browse/link layout */
  @media (max-width: 900px) {
    .main:not(.curate-layout) {
      flex-direction: column;
      padding: 70px 20px 60px;
      gap: 24px;
      overflow-y: auto;
    }

    .info-panel {
      width: 100%;
      max-width: 400px;
      max-height: none;
    }

    .mode-label {
      font-size: 12px;
    }
  }

  @media (max-width: 500px) {
    .header {
      padding: 16px;
    }

    .main {
      padding: 60px 16px 60px;
    }

    .main.curate-layout {
      padding: 70px 12px 60px;
    }

    .info-panel,
    .side-panel {
      padding: 16px;
    }

    .progress-pill {
      padding: 6px 12px;
    }

    .progress-num {
      font-size: 16px;
    }
  }
</style>
