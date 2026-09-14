<!--
  VideoUploadFlow.svelte

  One performance video, from a dropped file to a saved record: pick, preview,
  upload, report. Extracted from the retired VideoPanel, which carried this
  alongside a second copy of the gallery.

  It owns the file and nothing else. The list it lands in belongs to
  SequenceVideos, which receives the finished record through onUploaded.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { getVideoUploader } from "$lib/shared/share/get-video-uploader";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { getAuthSync } from "$lib/shared/auth/firebase";
  import {
    createVideoFromUpload,
    getVideoFileMetadata,
  } from "$lib/shared/video-collaboration/helpers/create-video-from-upload";
  import {
    extractVideoThumbnail,
    type ThumbnailResult,
  } from "$lib/shared/video-collaboration/utils/thumbnail-extractor";
  import { saveSequenceVideo } from "$lib/shared/video-collaboration/state/sequence-videos-store.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { CollaborativeVideo } from "$lib/shared/video-collaboration/domain/collaborative-video";
  import { getCurrentSequenceRevisionRef } from "$lib/shared/library/services/sequence-revision-reader";
  import type { ArtifactRevisionRef } from "$lib/shared/artifact-revisions/domain/artifact-revision";
  import {
    DEFAULT_VIDEO_VISIBILITY,
    VIDEO_VISIBILITY_OPTIONS,
    describeVideoVisibility,
    type VideoVisibility,
  } from "$lib/shared/video-collaboration/domain/video-visibility";

  interface Props {
    sequence: SequenceData;
    /** Videos attach to saved sequences, so an unsaved one asks for a save. */
    isOwned: boolean;
    /** Changes the invitation copy: a first performance reads differently. */
    hasExistingVideos: boolean;
    onSaveFirst?: () => Promise<void>;
    onUploaded: (video: CollaborativeVideo) => void;
    onCancel: () => void;
  }

  let {
    sequence,
    isOwned,
    hasExistingVideos,
    onSaveFirst,
    onUploaded,
    onCancel,
  }: Props = $props();

  type FlowState = "empty" | "preview" | "uploading";

  let flowState = $state<FlowState>("empty");
  let isSaving = $state(false);

  let selectedFile = $state<File | null>(null);
  let videoPreviewUrl = $state<string | null>(null);
  let videoDuration = $state(0);
  let thumbnail = $state<ThumbnailResult | null>(null);
  let visibility = $state<VideoVisibility>(DEFAULT_VIDEO_VISIBILITY);

  let uploadProgress = $state(0);
  let uploadError = $state<string | null>(null);
  let isDragOver = $state(false);

  let fileInputEl: HTMLInputElement;

  const uploadService = getVideoUploader();
  const hapticService = getHapticFeedback() as HapticFeedback | undefined;

  const currentUser = $derived(getAuthSync().currentUser);
  const canUpload = $derived(
    !!selectedFile && flowState !== "uploading" && !!currentUser
  );

  async function handleSaveFirst() {
    if (!onSaveFirst) return;
    isSaving = true;
    try {
      await onSaveFirst();
    } catch {
      // The parent surfaces its own save failure.
    } finally {
      isSaving = false;
    }
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) processFile(file);
  }

  function processFile(file: File) {
    if (!file.type.startsWith("video/")) {
      uploadError = "Please select a video file";
      return;
    }

    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      uploadError = "Video must be under 500MB";
      return;
    }

    selectedFile = file;
    uploadError = null;

    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    videoPreviewUrl = URL.createObjectURL(file);

    getVideoFileMetadata(file)
      .then((meta) => {
        videoDuration = meta.duration;
      })
      .catch(() => {
        videoDuration = 0;
      });

    extractVideoThumbnail(file)
      .then((result) => {
        thumbnail = result;
      })
      .catch(() => {
        thumbnail = null;
      });

    hapticService?.trigger("selection");
    flowState = "preview";
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    const file = event.dataTransfer?.files[0];
    if (file) processFile(file);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragOver = true;
  }

  async function handleUpload() {
    if (!selectedFile || !currentUser) return;

    let sequenceRevision: ArtifactRevisionRef | null = null;
    try {
      sequenceRevision = await getCurrentSequenceRevisionRef(sequence.id);
    } catch (error) {
      console.warn("Could not resolve the sequence revision:", error);
    }
    if (visibility === "public" && !sequenceRevision) {
      uploadError =
        "Publish this sequence before sharing a public performance of it.";
      return;
    }

    flowState = "uploading";
    uploadProgress = 0;
    uploadError = null;
    hapticService?.trigger("selection");

    try {
      const uploadResult = await uploadService.uploadPerformanceVideo(
        sequence.id,
        selectedFile,
        {
          // Report the real transfer. Scaling it to 90% left the bar stuck
          // there through the whole upload, and permanently so when the
          // optional thumbnail step failed.
          onProgress: (progress: number) => {
            uploadProgress = Math.min(99, Math.round(progress));
          },
        }
      );

      let thumbnailUrl: string | undefined;
      if (thumbnail) {
        try {
          const videoTimestamp = parseInt(
            uploadResult.key.split("/").pop()?.split(".")[0] || "0"
          );
          const thumbnailResult = await uploadService.uploadVideoThumbnail(
            sequence.id,
            thumbnail.blob,
            videoTimestamp
          );
          thumbnailUrl = thumbnailResult.url;
        } catch {
          // A missing thumbnail costs a poster frame, not the upload.
        }
      }

      const metadata = await getVideoFileMetadata(selectedFile);

      const video = createVideoFromUpload({
        uploadResult,
        sequence,
        duration: metadata.duration || videoDuration,
        fileSize: metadata.fileSize,
        mimeType: metadata.mimeType,
        creatorId: currentUser.uid,
        creatorDisplayName: currentUser.displayName ?? undefined,
        creatorAvatarUrl: currentUser.photoURL ?? undefined,
        visibility,
        thumbnailUrl,
        ...(sequenceRevision ? { revision: sequenceRevision } : {}),
      });

      await saveSequenceVideo(video);
      uploadProgress = 100;

      hapticService?.trigger("success");
      toast.success("Video uploaded");

      cleanupFileState();
      onUploaded(video);
    } catch (cause) {
      console.error("Upload failed:", cause);
      uploadError = cause instanceof Error ? cause.message : "Upload failed";
      toast.error("Video upload failed. Please try again.");
      hapticService?.trigger("error");
      // Back to the preview so the same file can be sent again.
      flowState = "preview";
    }
  }

  function cleanupFileState() {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    selectedFile = null;
    videoPreviewUrl = null;
    videoDuration = 0;
    uploadProgress = 0;
    thumbnail = null;
    visibility = DEFAULT_VIDEO_VISIBILITY;
  }

  function handleCancel() {
    cleanupFileState();
    uploadError = null;
    onCancel();
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="upload-flow">
  <input
    bind:this={fileInputEl}
    type="file"
    accept="video/*"
    onchange={handleFileSelect}
    hidden
  />

  {#if !isOwned}
    <div class="center-state">
      <div class="state-icon">
        <i class="fas fa-bookmark" aria-hidden="true"></i>
      </div>
      <span class="state-title">Save to library first</span>
      <span class="state-hint">
        Videos are attached to saved sequences. Save this one to your library,
        then you can upload a performance video.
      </span>
      {#if onSaveFirst}
        <button
          data-save-shortcut
          type="button"
          class="primary-btn"
          onclick={handleSaveFirst}
          disabled={isSaving}
        >
          {#if isSaving}
            <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            Saving...
          {:else}
            <i class="fas fa-bookmark" aria-hidden="true"></i>
            Save to Library
          {/if}
        </button>
      {/if}
    </div>
  {:else if flowState === "empty"}
    <button
      class="drop-zone"
      class:drag-over={isDragOver}
      onclick={() => fileInputEl?.click()}
      ondrop={handleDrop}
      ondragover={handleDragOver}
      ondragleave={() => (isDragOver = false)}
      type="button"
    >
      <i class="fas fa-cloud-upload-alt drop-icon" aria-hidden="true"></i>
      <span class="drop-title">
        {hasExistingVideos
          ? "Add another performance"
          : "Upload your first performance"}
      </span>
      <span class="drop-hint">MP4, WebM, MOV up to 500MB</span>
    </button>
  {:else if flowState === "preview"}
    <div class="preview-stage">
      {#if videoPreviewUrl}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video src={videoPreviewUrl} controls playsinline></video>
      {/if}
    </div>

    <div class="preview-meta">
      <span class="file-name">{selectedFile?.name}</span>
      <span class="file-details">
        {selectedFile ? formatFileSize(selectedFile.size) : ""}
        {#if videoDuration > 0}
          &middot; {formatDuration(videoDuration)}
        {/if}
      </span>
    </div>

    <div class="visibility-choice">
      <span class="visibility-label" id="performance-visibility-label">
        Who can see this in Flow Arts Composer?
      </span>
      <SegmentedControl
        options={VIDEO_VISIBILITY_OPTIONS}
        value={visibility}
        onchange={(next) => (visibility = next)}
        color="accent"
        semantics="radiogroup"
        ariaLabelledby="performance-visibility-label"
      />
      <span class="visibility-hint" aria-live="polite">
        {describeVideoVisibility(visibility)}
      </span>
    </div>

    <div class="preview-actions">
      <button
        class="secondary-btn"
        onclick={() => fileInputEl?.click()}
        type="button"
      >
        <i class="fas fa-exchange-alt" aria-hidden="true"></i>
        Change file
      </button>
      <button
        class="primary-btn"
        onclick={handleUpload}
        disabled={!canUpload}
        type="button"
      >
        <i class="fas fa-upload" aria-hidden="true"></i>
        Upload performance
      </button>
    </div>
  {:else}
    <div class="center-state">
      <div class="progress-section">
        <div class="progress-info">
          <span class="progress-label">Uploading...</span>
          <span class="progress-pct">{uploadProgress}%</span>
        </div>
        <div
          class="progress-bar"
          role="progressbar"
          aria-valuenow={uploadProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Upload progress"
        >
          <div class="progress-fill" style="width: {uploadProgress}%"></div>
        </div>
      </div>
    </div>
  {/if}

  {#if uploadError}
    <div class="error-banner" role="alert">
      <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
      <span>{uploadError}</span>
    </div>
  {/if}

  {#if flowState !== "uploading"}
    <button type="button" class="cancel-btn" onclick={handleCancel}>
      Cancel
    </button>
  {/if}
</div>

<style>
  .upload-flow {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    /* Centred rather than stretched: the flow is a short object, and letting it
       fill the viewer body turned the drop zone into an eight-hundred-pixel
       dashed rectangle with three lines of copy adrift in the middle of it. */
    justify-content: center;
    gap: 1rem;
    /* The flow reads as one object rather than spanning a 4K panel edge to
       edge, and stays centred as the viewer body grows. */
    inline-size: min(46rem, 100%);
    margin-inline: auto;
  }

  .center-state {
    display: flex;
    flex: 0 1 auto;
    min-height: 12.5rem;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1.5rem;
    text-align: center;
  }

  .state-icon {
    font-size: 2.25rem;
    color: var(--theme-accent, #6366f1);
    opacity: 0.7;
  }

  .state-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .state-hint {
    max-width: 22rem;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .primary-btn,
  .secondary-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.625rem 1.5rem;
    border-radius: 0.75rem;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .primary-btn {
    border: none;
    background: var(--theme-accent, #6366f1);
    color: #fff;
  }

  .primary-btn:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .primary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .secondary-btn {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, #fff);
  }

  .secondary-btn:hover {
    border-color: var(--theme-accent, #6366f1);
    color: var(--theme-accent, #6366f1);
  }

  .drop-zone {
    display: flex;
    flex: 0 1 auto;
    block-size: clamp(12.5rem, 34vh, 22rem);
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem 1.5rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    border: 2px dashed var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 1rem;
    cursor: pointer;
    transition: all 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .drop-zone:hover,
  .drop-zone.drag-over {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.04));
    border-color: var(--theme-accent, #6366f1);
  }

  .drop-icon {
    font-size: 2.5rem;
    color: var(--theme-accent, #6366f1);
    opacity: 0.7;
  }

  .drop-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .drop-hint {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
  }

  /* Hugs the footage. A full-width black box around a portrait clip reads as
     dead panel rather than as a player. */
  .preview-stage {
    display: grid;
    place-items: center;
    inline-size: fit-content;
    max-inline-size: 100%;
    margin-inline: auto;
    border-radius: 0.75rem;
    overflow: hidden;
    background: #000;
  }

  .preview-stage video {
    display: block;
    inline-size: auto;
    max-inline-size: 100%;
    /* Definite before layout, so the intrinsic ratio resolves the width. */
    block-size: clamp(11rem, 34vh, 28rem);
    object-fit: contain;
  }

  .preview-meta {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    text-align: center;
  }

  .visibility-choice {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .visibility-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .visibility-hint {
    min-block-size: 1.25rem;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .file-name {
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--theme-text, #fff);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-details {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .preview-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.75rem;
  }

  .progress-section {
    display: flex;
    width: 100%;
    max-width: 18.75rem;
    flex-direction: column;
    gap: 0.5rem;
  }

  .progress-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .progress-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .progress-pct {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text, #fff);
    font-variant-numeric: tabular-nums;
  }

  .progress-bar {
    width: 100%;
    height: 0.375rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 0.1875rem;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--theme-accent, #6366f1);
    border-radius: 0.1875rem;
    transition: width 0.2s ease;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.875rem;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    border-radius: 0.625rem;
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-min, 14px);
  }

  .cancel-btn {
    align-self: center;
    min-height: var(--min-touch-target, 44px);
    padding: 0.5rem 1.25rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.75rem;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
  }

  .cancel-btn:hover {
    color: var(--theme-text, #fff);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  @media (prefers-reduced-motion: reduce) {
    .drop-zone,
    .primary-btn,
    .secondary-btn,
    .progress-fill {
      transition: none !important;
    }
  }
</style>
