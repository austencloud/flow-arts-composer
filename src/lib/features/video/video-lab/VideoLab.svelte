<!--
  VideoLab.svelte

  Experimental workspace for beat mapping, BPM-synced playback, and
  video-to-notation alignment. Three views:
    1. Upload & Select - pick a local video + library sequence
    2. Beat Mapping - annotate beat timestamps using StepMapEditor
    3. Synced Playback - side-by-side video + choreo card preview
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { updateStepMap } from "$lib/shared/video-collaboration/services/collaborative-video-manager";

  import UploadSelectView from "./views/UploadSelectView.svelte";
  import StepMappingView from "./views/StepMappingView.svelte";
  import SyncedPlaybackView from "./views/SyncedPlaybackView.svelte";

  type VideoLabView = "upload" | "mapping" | "preview";
  let activeView = $state<VideoLabView>("upload");

  // Video source (local file blob URL or pasted URL)
  let videoUrl = $state<string | null>(null);
  let videoDuration = $state(0);
  let videoFileSize = $state(0);
  let collaborativeVideoId = $state<string | null>(null);

  // Selected sequence from library
  let selectedSequence = $state<SequenceData | null>(null);

  // Beat map produced by the mapping view
  let beatMap = $state<StepMap | null>(null);

  function handleStartMapping(
    url: string,
    duration: number,
    fileSize: number,
    sequence: SequenceData,
    existingStepMap?: StepMap,
    videoId?: string
  ): void {
    releaseVideoUrl();
    videoUrl = url;
    videoDuration = duration;
    videoFileSize = fileSize;
    selectedSequence = sequence;
    beatMap = existingStepMap ?? null;
    collaborativeVideoId = videoId ?? null;
    activeView = "mapping";
  }

  // The lab owns the handed-off blob URL for as long as any view can play it.
  // The setup view used to revoke it when it unmounted, which left the mapping
  // view with a dead <video>.
  function releaseVideoUrl(): void {
    if (videoUrl?.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    videoUrl = null;
  }

  onDestroy(releaseVideoUrl);

  async function handleStepMapSaved(saved: StepMap): Promise<void> {
    if (collaborativeVideoId) {
      await updateStepMap(collaborativeVideoId, saved);
    }
    beatMap = saved;
    activeView = "preview";
  }

  /**
   * A saved TKA video is its own identity. A local file has no id, so the
   * sequence plus the file's size and length stand in: pick the same clip
   * again after a reload and the half-finished run is waiting.
   */
  const draftKey = $derived(
    collaborativeVideoId
      ? `video:${collaborativeVideoId}`
      : selectedSequence
        ? `lab:${selectedSequence.id}:${videoFileSize}:${videoDuration}`
        : undefined
  );

  function handleBackToUpload() {
    activeView = "upload";
  }

  function handleBackToMapping() {
    activeView = "mapping";
  }
</script>

<div class="video-lab-root">
  <header class="lab-header">
    <i class="fas fa-film" aria-hidden="true"></i>
    <h2>Video Lab</h2>
    <span class="lab-badge">Sequence-linked</span>
  </header>

  <div class="view-container">
    {#if activeView === "upload"}
      <UploadSelectView onStartMapping={handleStartMapping} />
    {:else if activeView === "mapping" && videoUrl && selectedSequence?.steps?.length}
      <StepMappingView
        {videoUrl}
        {videoDuration}
        stepCount={selectedSequence.steps.length}
        sequence={selectedSequence}
        existingStepMap={beatMap}
        {draftKey}
        onSave={handleStepMapSaved}
        onBack={handleBackToUpload}
      />
    {:else if activeView === "preview" && videoUrl && selectedSequence && beatMap}
      <SyncedPlaybackView
        {videoUrl}
        {videoDuration}
        sequence={selectedSequence}
        {beatMap}
        onBackToMapping={handleBackToMapping}
      />
    {:else}
      <div class="fallback">
        <p>Missing required data. Returning to upload.</p>
        <button class="back-btn" onclick={handleBackToUpload} type="button">
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          Back
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .video-lab-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    color: var(--theme-text, #ffffff);
  }

  @media (min-width: 162.5rem) {
    .lab-header {
      gap: 1rem;
      padding: 1.25rem 2rem;
    }

    .lab-header i,
    .lab-header h2 {
      font-size: 1.5rem;
    }

    .lab-badge {
      padding: 0.35rem 0.75rem;
      font-size: 1rem;
    }
  }

  .lab-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .lab-header i {
    font-size: 18px;
    color: var(--theme-accent, #6366f1);
  }

  .lab-header h2 {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .lab-badge {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 15%,
      transparent
    );
    color: var(--theme-accent, #6366f1);
  }

  .view-container {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .fallback {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
  }

  .back-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  @media (prefers-reduced-motion: reduce) {
    .back-btn {
      transition: none !important;
    }
  }
</style>
