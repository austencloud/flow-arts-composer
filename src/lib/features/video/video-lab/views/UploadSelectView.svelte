<!--
  UploadSelectView.svelte

  Setup screen for Video Lab. Pick a video + sequence, then start mapping.
  Persists selected sequence to localStorage across refreshes.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { getLibraryRepository } from "$lib/shared/library/get-library-repository";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { hydrate } from "$lib/shared/foundation/services/sequence-hydrator";
  import SequencePickerModal from "$lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import PropAwareThumbnail from "$lib/shared/browse/components/PropAwareThumbnail.svelte";
  import type { LibraryRepository } from "$lib/shared/library/services/library-repository";
  import type {
    CollaborativeVideo,
    StepMap,
  } from "$lib/shared/video-collaboration/domain/collaborative-video";
  import { getVideosForSequence } from "$lib/shared/video-collaboration/services/collaborative-video-manager";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";

  const STORAGE_KEY = "video-lab-sequence";

  interface Props {
    onStartMapping: (
      videoUrl: string,
      duration: number,
      fileSize: number,
      sequence: SequenceData,
      existingStepMap?: StepMap,
      collaborativeVideoId?: string
    ) => void;
  }

  const { onStartMapping }: Props = $props();

  let videoUrl = $state<string | null>(null);
  let videoDuration = $state(0);
  let videoFileSize = $state(0);
  let videoFileName = $state("");
  let selectedVideoId = $state<string | null>(null);
  let selectedStepMap = $state<StepMap | undefined>(undefined);
  let videoEl: HTMLVideoElement | undefined = $state();
  let fileInputEl: HTMLInputElement | undefined = $state();
  let dragActive = $state(false);
  let fileError = $state("");
  let videoRatio = $state("16 / 9");
  // Set once the blob URL is handed to the mapping view, which then owns it.
  // Revoking it here on unmount left the mapping view with a dead <video>.
  let handedOff = false;

  let selectedSequence = $state<SequenceData | null>(null);
  let pickerOpen = $state(false);
  let savedVideos = $state<CollaborativeVideo[]>([]);
  let videosLoading = $state(false);
  let videosError = $state("");
  let videoRequest = 0;

  const stepCount = $derived(selectedSequence?.steps?.length ?? 0);
  const canStart = $derived(
    !!videoUrl && !!selectedSequence && videoDuration > 0 && stepCount > 0
  );
  const sequenceLabel = $derived(
    selectedSequence
      ? simplifyRepeatedWord(
          selectedSequence.word ?? selectedSequence.name ?? ""
        )
      : ""
  );

  $effect(() => {
    const sequenceId = selectedSequence?.id;
    const request = ++videoRequest;
    savedVideos = [];
    videosError = "";
    if (!sequenceId) return;
    videosLoading = true;
    void getVideosForSequence(sequenceId)
      .then((videos) => {
        if (request === videoRequest) savedVideos = videos;
      })
      .catch((error) => {
        if (request !== videoRequest) return;
        videosError =
          error instanceof Error
            ? error.message
            : "Saved performance videos could not be loaded.";
      })
      .finally(() => {
        if (request === videoRequest) videosLoading = false;
      });
  });

  // ---- Persistence: restore sequence on mount ----
  onMount(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const { sequenceId } = JSON.parse(saved);
      if (!sequenceId) return;

      // Load the full sequence from library
      const repo = getLibraryRepository() as LibraryRepository;
      repo
        .getSequence(sequenceId)
        .then((seq) => {
          if (seq) {
            try {
              selectedSequence = hydrate(seq);
            } catch {
              selectedSequence = seq;
            }
          }
        })
        .catch(() => {
          localStorage.removeItem(STORAGE_KEY);
        });
    } catch {
      // ignore
    }
  });

  function selectSequence(seq: SequenceData) {
    if (selectedSequence?.id !== seq.id) cleanupVideo();
    selectedSequence = seq;
    pickerOpen = false;
    // Persist sequence ID
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sequenceId: seq.id }));
    } catch {
      /* ignore */
    }
  }

  function acceptFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      fileError = `${file.name} is not a video. Choose an MP4, WebM, or MOV file.`;
      return;
    }
    cleanupVideo();
    fileError = "";
    videoUrl = URL.createObjectURL(file);
    videoFileName = file.name;
    videoFileSize = file.size;
    selectedVideoId = null;
    selectedStepMap = undefined;
  }

  function handleFileSelect(event: Event) {
    acceptFile((event.target as HTMLInputElement).files?.[0]);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragActive = false;
    acceptFile(event.dataTransfer?.files?.[0]);
  }

  function handleVideoLoaded() {
    if (!videoEl) return;
    videoDuration = videoEl.duration;
    if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
      videoRatio = `${videoEl.videoWidth} / ${videoEl.videoHeight}`;
    }
    if (videoEl.currentTime === 0) videoEl.currentTime = 0.1;
  }

  function cleanupVideo() {
    // A handed-off URL belongs to the mapping view now; revoking it here would
    // kill the video that view is about to play.
    if (!handedOff && videoUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(videoUrl);
    }
    handedOff = false;
    videoUrl = null;
    videoRatio = "16 / 9";
    videoDuration = 0;
    videoFileSize = 0;
    videoFileName = "";
    selectedVideoId = null;
    selectedStepMap = undefined;
  }

  function selectSavedVideo(video: CollaborativeVideo): void {
    cleanupVideo();
    videoUrl = video.videoUrl;
    videoDuration = video.duration;
    videoFileSize = video.fileSize;
    videoFileName = video.description?.trim() || "Saved performance video";
    selectedVideoId = video.id;
    selectedStepMap = video.beatMap;
  }

  function clearVideo() {
    cleanupVideo();
    fileError = "";
    if (fileInputEl) fileInputEl.value = "";
  }

  function handleStart() {
    if (!canStart || !videoUrl || !selectedSequence) return;
    handedOff = videoUrl.startsWith("blob:");
    onStartMapping(
      videoUrl,
      videoDuration,
      videoFileSize,
      selectedSequence,
      selectedStepMap,
      selectedVideoId ?? undefined
    );
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  onDestroy(cleanupVideo);
</script>

<div class="setup-page">
  <div class="setup-heading">
    <span>Performance timing</span>
    <h3>Choose the sequence and the video that performs it</h3>
    <p>
      Saved Flow Arts Composer videos keep their markers. A local file stays on this device
      until you upload it.
    </p>
  </div>
  <div class="setup-content">
    <!-- Left: Video -->
    <div class="panel">
      <h3 class="panel-title">
        <i class="fas fa-video" aria-hidden="true"></i>
        Video
      </h3>

      {#if videoUrl}
        <div class="card">
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            bind:this={videoEl}
            src={videoUrl}
            onloadedmetadata={handleVideoLoaded}
            controls
            preload="auto"
            class="video-player"
            style="--video-ratio: {videoRatio}"
          ></video>
          <div class="card-footer">
            <div class="card-info">
              <span class="card-name">{videoFileName}</span>
              <span class="card-sub">
                {#if videoFileSize > 0}{formatFileSize(videoFileSize)}{/if}
                {#if videoDuration > 0}
                  · {formatDuration(videoDuration)}{/if}
              </span>
            </div>
            <button type="button" class="text-btn" onclick={clearVideo}
              >Change</button
            >
          </div>
        </div>
      {:else}
        <label
          class="drop-zone"
          class:drag-active={dragActive}
          ondragover={(event) => {
            event.preventDefault();
            dragActive = true;
          }}
          ondragleave={() => (dragActive = false)}
          ondrop={handleDrop}
        >
          <input
            bind:this={fileInputEl}
            type="file"
            accept="video/*"
            onchange={handleFileSelect}
            class="file-input"
          />
          <i class="fas fa-film drop-icon" aria-hidden="true"></i>
          <span class="drop-label">Drop a video here or click to browse</span>
          <span class="drop-hint">MP4, WebM, MOV</span>
        </label>
        {#if fileError}
          <p class="field-error" role="alert">{fileError}</p>
        {/if}
      {/if}
    </div>

    <!-- Right: Sequence -->
    <div class="panel">
      <h3 class="panel-title">
        <i class="fas fa-th" aria-hidden="true"></i>
        Sequence
      </h3>

      {#if selectedSequence}
        <div class="card">
          {#if selectedSequence.steps && selectedSequence.steps.length > 0}
            <div class="choreo-preview">
              <PropAwareThumbnail
                sequence={selectedSequence}
                variant="gallery"
                eager
              />
            </div>
          {/if}
          <div class="card-footer">
            <div class="card-info">
              <span class="card-name">{sequenceLabel}</span>
              <span class="card-sub"
                >{stepCount}
                {stepCount === 1 ? "step" : "steps"}</span
              >
            </div>
            <button
              type="button"
              class="text-btn"
              onclick={() => (pickerOpen = true)}>Change</button
            >
          </div>
        </div>
      {:else}
        <button
          type="button"
          class="drop-zone"
          onclick={() => (pickerOpen = true)}
        >
          <i class="fas fa-th-large drop-icon" aria-hidden="true"></i>
          <span class="drop-label">Choose a sequence</span>
          <span class="drop-hint">Pick the sequence this video performs</span>
        </button>
      {/if}
    </div>

    {#if selectedSequence}
      <section class="library-panel" aria-labelledby="saved-performance-title">
        <div class="library-heading">
          <div>
            <span>From your Flow Arts Composer library</span>
            <h3 id="saved-performance-title">Saved performances</h3>
          </div>
          {#if !videosLoading}<strong>{savedVideos.length}</strong>{/if}
        </div>

        {#if videosLoading}
          <div class="library-state" role="status">
            <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
            Loading saved performances
          </div>
        {:else if videosError}
          <div class="library-state error" role="alert">
            <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
            {videosError}
          </div>
        {:else if savedVideos.length === 0}
          <div class="library-state">
            <i class="fas fa-video-slash" aria-hidden="true"></i>
            {#if videoUrl}
              No saved performances for this sequence yet. Map the video you
              chose to add the first one.
            {:else}
              No saved performances for this sequence yet. Choose a local video
              above to begin.
            {/if}
          </div>
        {:else}
          <div class="saved-grid">
            {#each savedVideos as video (video.id)}
              <button
                type="button"
                class:selected={selectedVideoId === video.id}
                class="saved-video"
                aria-pressed={selectedVideoId === video.id}
                onclick={() => selectSavedVideo(video)}
              >
                <span class="saved-thumb">
                  {#if video.thumbnailUrl}
                    <img src={video.thumbnailUrl} alt="" />
                  {:else}
                    <i class="fas fa-play" aria-hidden="true"></i>
                  {/if}
                  <small>{formatDuration(video.duration)}</small>
                </span>
                <span class="saved-copy">
                  <strong
                    >{video.description?.trim() || "Performance video"}</strong
                  >
                  <small class:mapped={!!video.beatMap}>
                    {video.beatMap ? "Timing saved" : "Needs timing"}
                  </small>
                </span>
                {#if selectedVideoId === video.id}
                  <i class="fas fa-check" aria-hidden="true"></i>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  </div>

  {#if canStart}
    <div class="start-area">
      <button type="button" class="start-btn" onclick={handleStart}>
        <i class="fas fa-play" aria-hidden="true"></i>
        {selectedStepMap ? "Review saved timing" : "Map performance"}
      </button>
    </div>
  {/if}
</div>

<SequencePickerModal
  bind:open={pickerOpen}
  onClose={() => (pickerOpen = false)}
  onSelect={selectSequence}
  title="Select Sequence"
/>

<style>
  .setup-page {
    --setup-preview-height: clamp(13rem, 26vh, 20rem);

    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    align-content: start;
    gap: 1.5rem;
    width: min(100%, 162rem);
    margin-inline: auto;
    padding: clamp(1rem, 1.5vw, 2.5rem);
    height: 100%;
    overflow-y: auto;
  }

  .setup-heading {
    display: grid;
    gap: 0.35rem;
  }

  .setup-heading > span,
  .library-heading span {
    color: var(--theme-accent);
    font-size: var(--font-size-compact);
    font-weight: 750;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .setup-heading h3,
  .setup-heading p,
  .library-heading h3 {
    margin: 0;
  }

  .setup-heading h3 {
    font-size: clamp(1.35rem, 1rem + 0.55vw, 2.25rem);
  }

  .setup-heading p {
    color: var(--theme-text-muted);
    font-size: var(--font-size-min);
    line-height: 1.45;
  }

  .setup-content {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(1rem, 1.25vw, 2rem);
    width: 100%;
    min-height: 0;
    align-content: start;
  }

  @media (max-width: 48rem) {
    .setup-content {
      grid-template-columns: 1fr;
    }
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .library-panel {
    grid-column: 1 / -1;
    display: grid;
    gap: 0.9rem;
    min-width: 0;
    padding-top: 0.5rem;
  }

  .library-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
  }

  .library-heading > div {
    display: grid;
    gap: 0.25rem;
  }

  .library-heading h3 {
    font-size: 1.25rem;
  }

  .library-heading > strong {
    display: grid;
    place-items: center;
    min-width: 2.75rem;
    min-height: 2.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-2026-full);
    font-variant-numeric: tabular-nums;
  }

  .saved-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .saved-video {
    display: grid;
    grid-template-columns: minmax(6rem, 34%) minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    min-height: 5.5rem;
    padding: 0.65rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-2026-sm);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .saved-video.selected {
    border-color: var(--theme-accent);
    background: color-mix(
      in srgb,
      var(--theme-accent) 11%,
      var(--theme-card-bg)
    );
  }

  .saved-video:focus-visible,
  .drop-zone:focus-visible,
  .text-btn:focus-visible,
  .start-btn:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .saved-thumb {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: var(--radius-2026-xs);
    background: var(--theme-panel-bg);
    color: var(--theme-accent);
  }

  .saved-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .saved-thumb small {
    position: absolute;
    right: 0.25rem;
    bottom: 0.25rem;
    padding: 0.1rem 0.3rem;
    border-radius: var(--radius-2026-xs);
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    font-size: var(--font-size-compact);
  }

  .saved-copy {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }

  .saved-copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .saved-copy small {
    justify-self: start;
    color: var(--semantic-warning);
    font-size: var(--font-size-compact);
    font-weight: 700;
  }

  .saved-copy small.mapped {
    color: var(--semantic-success);
  }

  .library-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-height: 7rem;
    padding: 1.5rem;
    border: 1px dashed var(--theme-stroke);
    border-radius: var(--radius-2026-md);
    color: var(--theme-text-muted);
    font-size: var(--font-size-min);
    text-align: center;
  }

  .library-state.error {
    border-color: color-mix(in srgb, var(--semantic-error) 42%, transparent);
    color: var(--semantic-error);
  }

  .panel-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #fff);
    margin: 0;
  }

  .panel-title i {
    color: var(--theme-accent, #6366f1);
  }


  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    height: var(--setup-preview-height);
    min-height: 0;
    padding: 2rem 1.5rem;
    border: 2px dashed var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }

  .drop-zone:hover,
  .drop-zone.drag-active {
    border-color: var(--theme-accent, #6366f1);
    background: rgba(99, 102, 241, 0.04);
  }

  /* `hidden` would take the input out of the tab order, leaving no keyboard
     path to choosing a video. This keeps it focusable and label-named. */
  .file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .drop-zone:has(.file-input:focus-visible) {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .field-error {
    margin: 0;
    color: var(--semantic-error);
    font-size: var(--font-size-compact);
  }

  .drop-icon {
    font-size: 28px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
  }
  .drop-label {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }
  .drop-hint {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
  }


  .card {
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    overflow: hidden;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
  }

  /* Performance video is usually shot in portrait. A fixed-height landscape box
     pillarboxed it to ~81% black, so the box takes the source's own ratio and
     is centred. The 16/9 default reserves the box before metadata arrives, so
     nothing reflows on load. */
  .video-player {
    display: block;
    width: auto;
    max-width: 100%;
    height: var(--setup-preview-height);
    aspect-ratio: var(--video-ratio, 16 / 9);
    margin-inline: auto;
    background: #000;
    object-fit: contain;
  }

  .choreo-preview {
    container-name: image-container;
    container-type: size;
    display: grid;
    place-items: center;
    width: 100%;
    height: var(--setup-preview-height);
    overflow: hidden;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
  }

  .card-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .card-name {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #fff);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-sub {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .text-btn {
    padding: 6px 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 6px;
    background: none;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    font-size: var(--font-size-compact, 12px);
    flex-shrink: 0;
  }

  .text-btn:hover {
    color: var(--theme-text, #fff);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }


  .start-area {
    display: flex;
    justify-content: center;
  }

  .start-btn {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 14px 48px;
    border: none;
    border-radius: 12px;
    background: var(--theme-accent, #6366f1);
    color: #fff;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition:
      transform 0.1s,
      box-shadow 0.15s;
  }

  .start-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px
      color-mix(in srgb, var(--theme-accent, #6366f1) 35%, transparent);
  }

  .start-btn:active {
    transform: translateY(0);
  }

  @media (prefers-reduced-motion: reduce) {
    .drop-zone,
    .start-btn,
    .text-btn {
      transition: none;
    }
    .start-btn:hover {
      transform: none;
    }
  }

  @media (min-width: 105rem) {
    .setup-page {
      --setup-preview-height: clamp(16rem, 27vh, 28rem);

      gap: 2rem;
      padding: 2rem 3rem;
    }

    .saved-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @media (min-width: 162.5rem) {
    .setup-page {
      --setup-preview-height: clamp(24rem, 28vh, 36rem);

      gap: 3rem;
      padding: 3rem 4rem;
    }

    .setup-heading p,
    .panel-title,
    .drop-label,
    .card-name,
    .saved-video,
    .library-state {
      font-size: 1.125rem;
    }

    .drop-hint,
    .card-sub,
    .saved-copy small,
    .saved-thumb small {
      font-size: 1rem;
    }

    .saved-grid {
      gap: 1.25rem;
    }

    .saved-video {
      min-height: 8rem;
      padding: 1rem;
    }
  }

  @media (max-width: 48rem) {
    .saved-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .setup-page {
      height: auto;
      min-height: 100%;
    }
  }
</style>
