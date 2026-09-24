<script lang="ts">
  import { untrack } from "svelte";
  import {
    getVideosForSequence,
    updateStepMap,
  } from "$lib/shared/video-collaboration/services/collaborative-video-manager";
  import type { CollaborativeVideo } from "$lib/shared/video-collaboration/domain/collaborative-video";
  import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";
  import VideoUploadSheet from "$lib/shared/video-collaboration/components/VideoUploadSheet.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceRevisionRef } from "$lib/shared/media-composition/domain/sequence-time-map";
  import StepMapEditor from "$lib/shared/sequence-viewer/components/step-mapping/StepMapEditor.svelte";
  import {
    createCatalogPerformanceSelection,
    createUnmappedPerformanceSelection,
    type LocalPerformanceInfo,
    type PostStudioPerformanceSelection,
  } from "./post-studio-performance-selection";

  interface Props {
    open: boolean;
    sequence: SequenceData;
    sequenceRef: SequenceRevisionRef;
    bpm: number;
    currentUrl: string | null;
    onClose: () => void;
    onSelect: (selection: PostStudioPerformanceSelection) => void;
    onChooseFile: (file: File) => Promise<void>;
    /** The current performance's local-file info, or null when it is a
     *  catalog video, a linked-but-uncataloged URL, or nothing chosen yet. */
    localPerformance: LocalPerformanceInfo | null;
    onLocalStepMap: (stepMap: StepMap) => void;
    /** Skips the video list and opens straight into tapping the current local
     *  file's beats - set when "Tap beats" was reached from outside the
     *  picker, e.g. the transport bar's nudge. */
    mapCurrentOnOpen?: boolean;
    /** Where a fresh marking run should seek before the first tap - a hint
     *  for where the interesting footage starts. Ignored once a draft or an
     *  existing map gives the editor a real position to resume from. */
    tapStartSeconds?: number;
  }

  let {
    open,
    sequence,
    sequenceRef,
    bpm,
    currentUrl,
    onClose,
    onSelect,
    onChooseFile,
    localPerformance,
    onLocalStepMap,
    mapCurrentOnOpen = false,
    tapStartSeconds,
  }: Props = $props();

  let videos = $state<CollaborativeVideo[]>([]);
  let loading = $state(false);
  let loadError = $state("");
  let actionError = $state("");
  let uploadOpen = $state(false);
  let mappingVideo = $state<CollaborativeVideo | null>(null);
  /** Mapping the CURRENT local performance rather than a catalog video - see
   *  `localPerformance`. Mutually exclusive with `mappingVideo`. */
  let mappingLocal = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);
  let requestVersion = 0;

  async function loadVideos(sequenceId = sequence.id): Promise<void> {
    const version = ++requestVersion;
    loading = true;
    loadError = "";
    try {
      const nextVideos = await getVideosForSequence(sequenceId);
      if (version === requestVersion) {
        videos = nextVideos;
        if (mapCurrentOnOpen && !localPerformance && currentUrl) {
          mappingVideo =
            nextVideos.find((video) => video.videoUrl === currentUrl) ?? null;
        }
      }
    } catch (error) {
      if (version !== requestVersion) return;
      loadError =
        error instanceof Error
          ? error.message
          : "The video library could not be loaded.";
    } finally {
      if (version === requestVersion) loading = false;
    }
  }

  $effect(() => {
    if (!open) return;
    const sequenceId = sequence.id;
    actionError = "";
    mappingVideo = null;
    // Untracked: this should fire only on the open transition, not every time
    // mapCurrentOnOpen or localPerformance happens to change while the picker
    // stays open (saving a local map updates localPerformance, and re-running
    // this at that instant would fight the deliberate close in saveLocalMap).
    untrack(() => {
      mappingLocal = mapCurrentOnOpen && localPerformance !== null;
    });
    void loadVideos(sequenceId);
  });

  $effect(() => {
    if (!open) return;
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || uploadOpen) return;
      if (mappingVideo || mappingLocal) {
        mappingVideo = null;
        mappingLocal = false;
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  function selectVideo(video: CollaborativeVideo): void {
    onSelect(createCatalogPerformanceSelection(video, sequenceRef));
  }

  function closePicker(): void {
    mappingVideo = null;
    mappingLocal = false;
    onClose();
  }

  /** Step back from either mapping workspace to the video list. */
  function backFromMapping(): void {
    mappingVideo = null;
    mappingLocal = false;
  }

  async function saveLocalMap(stepMap: StepMap): Promise<void> {
    onLocalStepMap(stepMap);
    mappingLocal = false;
  }

  function selectLinkedVideo(): void {
    const catalogVideo = uniqueVideos.find(
      (video) => video.videoUrl === sequence.performanceVideoUrl
    );
    if (catalogVideo) {
      selectVideo(catalogVideo);
      return;
    }
    onSelect(
      createUnmappedPerformanceSelection({
        id: `linked-performance:${sequence.id}`,
        url: sequence.performanceVideoUrl!,
        label: "Linked performance video",
      })
    );
  }

  async function saveMappedVideo(beatMap: StepMap): Promise<void> {
    if (!mappingVideo) return;
    const video = mappingVideo;
    await updateStepMap(video.id, beatMap);
    const updatedVideo: CollaborativeVideo = {
      ...video,
      beatMap,
      updatedAt: new Date(),
    };
    videos = videos.map((candidate) =>
      candidate.id === video.id ? updatedVideo : candidate
    );
    mappingVideo = null;
    onSelect(createCatalogPerformanceSelection(updatedVideo, sequenceRef));
  }

  function alignmentLabel(video: CollaborativeVideo): string {
    if (!video.beatMap) return "Unmapped";
    return video.beatMap.source === "manual"
      ? "Saved manual map"
      : "Assisted candidate";
  }

  async function chooseFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    actionError = "";
    try {
      await onChooseFile(file);
    } catch (error) {
      actionError =
        error instanceof Error
          ? error.message
          : "That video could not be opened.";
    }
  }

  function formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${minutes}:${remainder.toString().padStart(2, "0")}`;
  }

  function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const uniqueVideos = $derived(
    videos.filter(
      (video, index, all) =>
        all.findIndex((candidate) => candidate.videoUrl === video.videoUrl) ===
        index
    )
  );
</script>

{#if open}
  <div class="picker-layer">
    <button
      type="button"
      class="picker-backdrop"
      aria-label="Close performance video picker"
      onclick={closePicker}
    ></button>
    <div
      class="performance-picker themed-scrollbar"
      role="dialog"
      aria-modal="true"
      aria-labelledby="performance-picker-title"
    >
      {#if mappingVideo || mappingLocal}
        <header>
          <div>
            <span class="eyebrow">Performance timing</span>
            <h2 id="performance-picker-title">Match the video to the card</h2>
            <p>
              Mark each move as it happens. Saving applies this timing to
              preview and export.
            </p>
          </div>
          <button
            type="button"
            class="close-button"
            aria-label="Back to performance videos"
            onclick={backFromMapping}
          >
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          </button>
        </header>
        <div class="mapping-workspace">
          {#if mappingVideo}
            <StepMapEditor
              videoUrl={mappingVideo.videoUrl}
              videoDuration={mappingVideo.duration}
              steps={sequence.steps}
              startPlacement={sequence.startPlacement ??
                sequence.startingPlacement}
              initialStepMap={mappingVideo.beatMap}
              initialTime={tapStartSeconds}
              {bpm}
              onSave={saveMappedVideo}
              onClose={backFromMapping}
            />
          {:else if localPerformance}
            <StepMapEditor
              videoUrl={localPerformance.url}
              videoDuration={localPerformance.duration}
              steps={sequence.steps}
              startPlacement={sequence.startPlacement ??
                sequence.startingPlacement}
              initialStepMap={localPerformance.stepMap ?? undefined}
              draftKey={`post-studio-local:${localPerformance.key}`}
              initialTime={tapStartSeconds}
              {bpm}
              onSave={saveLocalMap}
              onClose={backFromMapping}
            />
          {/if}
        </div>
      {:else}
        <header>
          <div>
            <span class="eyebrow">Performance source</span>
            <h2 id="performance-picker-title">
              Choose the video for this post
            </h2>
            <p>
              Use a linked performance or bring in a video from this device.
            </p>
          </div>
          <button
            type="button"
            class="close-button"
            aria-label="Close performance video picker"
            onclick={closePicker}
          >
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </header>

        <div class="picker-actions">
          <button
            type="button"
            class="primary-action"
            onclick={() => fileInput?.click()}
          >
            <i class="fa-solid fa-folder-open" aria-hidden="true"></i>
            Use a video from this device
          </button>
          <button
            type="button"
            class="secondary-action"
            disabled={!sequence.id}
            onclick={() => (uploadOpen = true)}
          >
            <i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i>
            Upload to Flow Arts Composer
          </button>
          <input
            bind:this={fileInput}
            class="file-input"
            type="file"
            accept="video/*"
            onchange={chooseFile}
          />
        </div>

        {#if actionError}
          <p class="error-message" role="alert">{actionError}</p>
        {/if}

        {#if localPerformance}
          <section
            class="linked-video"
            aria-labelledby="local-performance-title"
          >
            <div class="section-heading">
              <h3 id="local-performance-title">This device</h3>
            </div>
            <article class="video-card local-performance-card">
              <div class="video-card-main static">
                <span class="thumbnail">
                  <i class="fa-solid fa-mobile-screen" aria-hidden="true"></i>
                  <span>{formatDuration(localPerformance.duration)}</span>
                </span>
                <span class="video-copy">
                  <strong>{localPerformance.label}</strong>
                  <small>From this device</small>
                  <span
                    class:mapped={!!localPerformance.stepMap}
                    class="alignment-badge"
                  >
                    {localPerformance.stepMap
                      ? "Tapped on this device"
                      : "Not tapped yet"}
                  </span>
                </span>
                {#if currentUrl === localPerformance.url}
                  <i class="fa-solid fa-check selected-check" aria-hidden="true"
                  ></i>
                {/if}
              </div>
              <button
                type="button"
                class="map-action"
                onclick={() => (mappingLocal = true)}
              >
                <i class="fa-solid fa-hand-pointer" aria-hidden="true"></i>
                {localPerformance.stepMap ? "Re-tap beats" : "Tap beats"}
              </button>
            </article>
          </section>
        {/if}

        {#if sequence.performanceVideoUrl}
          <section class="linked-video" aria-labelledby="linked-video-title">
            <div class="section-heading">
              <h3 id="linked-video-title">Linked to this sequence</h3>
            </div>
            <button
              type="button"
              class:selected={currentUrl === sequence.performanceVideoUrl}
              class="video-row"
              aria-label="Use the performance video linked to this sequence"
              onclick={selectLinkedVideo}
            >
              <span class="video-icon">
                <i class="fa-solid fa-link" aria-hidden="true"></i>
              </span>
              <span>
                <strong>Linked performance video</strong>
                <small>Already attached to this sequence</small>
              </span>
              {#if currentUrl === sequence.performanceVideoUrl}
                <i class="fa-solid fa-check selected-check" aria-hidden="true"
                ></i>
              {/if}
            </button>
          </section>
        {/if}

        <section class="library-section" aria-labelledby="tka-video-library">
          <div class="section-heading">
            <h3 id="tka-video-library">Video library</h3>
            {#if !loading}
              <span>{uniqueVideos.length}</span>
            {/if}
          </div>

          {#if loading}
            <div class="state-panel" role="status">
              <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"
              ></i>
              Loading performance videos
            </div>
          {:else if loadError}
            <div class="state-panel error-state">
              <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"
              ></i>
              <p>{loadError}</p>
              <button type="button" onclick={() => void loadVideos()}
                >Try again</button
              >
            </div>
          {:else if uniqueVideos.length === 0}
            <div class="state-panel">
              <i class="fa-solid fa-video-slash" aria-hidden="true"></i>
              <p>No performance videos are attached to this sequence yet.</p>
              <button type="button" onclick={() => (uploadOpen = true)}>
                Upload the first one
              </button>
            </div>
          {:else}
            <div class="video-grid">
              {#each uniqueVideos as video (video.id)}
                <article
                  class:selected={currentUrl === video.videoUrl}
                  class="video-card"
                >
                  <button
                    type="button"
                    class="video-card-main"
                    aria-label={`Use performance video from ${formatDate(video.createdAt)}, ${formatDuration(video.duration)}`}
                    onclick={() => selectVideo(video)}
                  >
                    <span class="thumbnail">
                      {#if video.thumbnailUrl}
                        <img src={video.thumbnailUrl} alt="" />
                      {:else}
                        <i class="fa-solid fa-play" aria-hidden="true"></i>
                      {/if}
                      <span>{formatDuration(video.duration)}</span>
                    </span>
                    <span class="video-copy">
                      <strong
                        >{video.description?.trim() ||
                          "Performance video"}</strong
                      >
                      <small>{formatDate(video.createdAt)}</small>
                      <span
                        class:mapped={!!video.beatMap}
                        class="alignment-badge"
                      >
                        {alignmentLabel(video)}
                      </span>
                    </span>
                    {#if currentUrl === video.videoUrl}
                      <i
                        class="fa-solid fa-check selected-check"
                        aria-hidden="true"
                      ></i>
                    {/if}
                  </button>
                  <button
                    type="button"
                    class="map-action"
                    onclick={() => (mappingVideo = video)}
                  >
                    <i class="fa-solid fa-wave-square" aria-hidden="true"></i>
                    {video.beatMap ? "Edit timing" : "Map timing"}
                  </button>
                </article>
              {/each}
            </div>
          {/if}
        </section>
      {/if}
    </div>
  </div>
{/if}

<VideoUploadSheet
  show={uploadOpen}
  {sequence}
  onClose={() => (uploadOpen = false)}
  onUploaded={() => void loadVideos()}
/>

<style>
  .picker-layer {
    position: absolute;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: var(--spacing-lg);
  }

  .picker-backdrop {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: color-mix(in srgb, var(--theme-panel-bg) 78%, transparent);
    cursor: default;
  }

  .performance-picker {
    position: relative;
    display: grid;
    gap: var(--spacing-lg);
    width: min(52rem, 100%);
    max-height: min(48rem, calc(100% - 2rem));
    padding: var(--spacing-lg);
    overflow: auto;
    border: 1px solid var(--theme-stroke-strong);
    border-radius: var(--radius-2026-lg);
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    box-shadow: 0 1.5rem 5rem var(--theme-shadow);
  }

  .performance-picker:has(.mapping-workspace) {
    grid-template-rows: auto minmax(0, 1fr);
    width: min(92rem, 100%);
    height: min(68rem, calc(100% - 2rem));
    overflow: hidden;
  }

  .mapping-workspace {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-2026-md);
  }

  header,
  .section-heading,
  .picker-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-md);
  }

  header > div {
    display: grid;
    gap: var(--spacing-xs);
  }

  .eyebrow {
    color: var(--theme-accent);
    font-size: var(--font-size-compact);
    font-weight: 750;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: 1.45rem;
  }

  h3 {
    font-size: 1rem;
  }

  header p,
  .state-panel p {
    color: var(--theme-text-dim);
    font-size: var(--font-size-min);
    line-height: 1.4;
  }

  .close-button,
  .primary-action,
  .secondary-action,
  .state-panel button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    min-height: 2.75rem;
    padding: 0.55rem 0.8rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-2026-sm);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-min);
    font-weight: 700;
    cursor: pointer;
  }

  .close-button {
    width: 2.75rem;
    padding: 0;
  }

  .primary-action {
    border-color: var(--theme-accent);
    background: var(--theme-accent);
  }

  .secondary-action:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  .close-button:focus-visible,
  .primary-action:focus-visible,
  .secondary-action:focus-visible,
  .video-row:focus-visible,
  .video-card-main:focus-visible,
  .map-action:focus-visible,
  .state-panel button:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .file-input {
    display: none;
  }

  .error-message {
    color: var(--semantic-error);
    font-size: var(--font-size-min);
  }

  .linked-video,
  .library-section {
    display: grid;
    gap: 0.75rem;
  }

  .section-heading > span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-variant-numeric: tabular-nums;
  }

  .video-row {
    position: relative;
    display: grid;
    align-items: center;
    gap: 0.75rem;
    min-height: 4rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-2026-sm);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .video-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    padding: 0.625rem 0.75rem;
  }

  .video-row > span:nth-child(2),
  .video-copy {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  .video-row small,
  .video-copy small {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .video-icon {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--radius-2026-sm);
    background: color-mix(
      in srgb,
      var(--theme-accent) 12%,
      var(--theme-card-bg)
    );
    color: var(--theme-accent);
  }

  .video-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .video-card {
    display: grid;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-2026-sm);
    background: var(--theme-card-bg);
  }

  .video-card-main {
    display: grid;
    grid-template-columns: 6rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    padding: var(--spacing-sm);
    border: 0;
    background: transparent;
    color: var(--theme-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  /* The local-performance card's info area is a plain div, not a button - it
     is already the current performance, so there is nothing to select. */
  .video-card-main.static {
    cursor: default;
  }

  .alignment-badge {
    justify-self: start;
    margin-top: 0.25rem;
    padding: 0.2rem 0.4rem;
    border-radius: var(--radius-2026-full);
    background: color-mix(in srgb, var(--semantic-warning) 13%, transparent);
    color: var(--semantic-warning);
    font-size: var(--font-size-compact);
    font-weight: 700;
  }

  .alignment-badge.mapped {
    background: color-mix(in srgb, var(--semantic-success) 13%, transparent);
    color: var(--semantic-success);
  }

  .map-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    min-height: 2.75rem;
    border: 0;
    border-top: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-accent) 7%, transparent);
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-min);
    font-weight: 700;
    cursor: pointer;
  }

  .thumbnail {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: var(--radius-2026-xs);
    background: color-mix(
      in srgb,
      var(--theme-accent) 8%,
      var(--theme-card-bg)
    );
    color: var(--theme-accent);
  }

  .thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumbnail span {
    position: absolute;
    right: var(--spacing-xs);
    bottom: var(--spacing-xs);
    padding: 0.1rem 0.3rem;
    border-radius: var(--radius-2026-xs);
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    font-size: var(--font-size-compact);
    font-variant-numeric: tabular-nums;
  }

  .video-row.selected,
  .video-card.selected {
    border-color: var(--theme-accent);
  }

  .selected-check {
    color: var(--semantic-success);
  }

  .state-panel {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    padding: var(--spacing-xl);
    border: 1px dashed var(--theme-stroke-strong);
    border-radius: var(--radius-2026-md);
    color: var(--theme-text-dim);
    text-align: center;
  }

  .state-panel > i {
    color: var(--theme-accent);
    font-size: 1.4rem;
  }

  .error-state > i {
    color: var(--semantic-error);
  }

  @media (max-width: 46rem) {
    .picker-layer {
      padding: 0;
    }

    .performance-picker {
      width: 100%;
      max-height: 100%;
      height: 100%;
      border: 0;
      border-radius: 0;
    }

    .picker-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .video-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @container post-studio (min-width: 180rem) {
    .performance-picker {
      width: min(74rem, 100%);
      padding: 2rem;
    }

    .performance-picker:has(.mapping-workspace) {
      width: min(140rem, 100%);
      height: min(92rem, calc(100% - 3rem));
    }

    h2 {
      font-size: 2rem;
    }

    h3,
    .primary-action,
    .secondary-action,
    .video-card-main,
    .map-action,
    .state-panel {
      font-size: 1.125rem;
    }

    header p,
    .video-row small,
    .video-copy small,
    .alignment-badge,
    .section-heading > span {
      font-size: 1rem;
    }
  }
</style>
