<!--
  VideoUploadSheet.svelte

  Bottom sheet for uploading performance videos to a sequence.
  Handles: file selection → metadata extraction → upload → save to Firestore
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { getVideoUploader } from "$lib/shared/share/get-video-uploader";
  import { saveVideo } from "$lib/shared/video-collaboration/services/collaborative-video-manager";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { getAuthSync } from "$lib/shared/auth/firebase";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import {
    createVideoFromUpload,
    createTunnelRealizationFromUpload,
    getVideoFileMetadata,
  } from "../helpers/create-video-from-upload";
  import type { VideoVisibility } from "../domain/collaborative-video";
  import type { ArtifactRevisionRef } from "$lib/shared/artifact-revisions/domain/artifact-revision";
  import { getCurrentSequenceRevisionRef } from "$lib/shared/library/services/sequence-revision-reader";
  import {
    DEFAULT_VIDEO_VISIBILITY,
    VIDEO_VISIBILITY_OPTIONS,
    describeVideoVisibility,
  } from "../domain/video-visibility";
  import {
    extractVideoThumbnail,
    type ThumbnailResult,
  } from "../utils/thumbnail-extractor";

  const {
    show = false,
    sequence,
    tunnel,
    onClose,
    onUploaded,
  }: {
    show?: boolean;
    sequence?: SequenceData;
    tunnel?: {
      id: string;
      name: string;
      sourceSequenceId?: string;
      revision?: ArtifactRevisionRef;
    };
    onClose?: () => void;
    onUploaded?: () => void;
  } = $props();

  // Services
  const uploadService = getVideoUploader();
  const hapticService = getHapticFeedback();

  // State
  let selectedFile = $state<File | null>(null);
  let videoPreviewUrl = $state<string | null>(null);
  let videoDuration = $state<number>(0);
  let visibility = $state<VideoVisibility>(DEFAULT_VIDEO_VISIBILITY);
  let description = $state("");
  let thumbnail = $state<ThumbnailResult | null>(null);

  // Upload state
  let isUploading = $state(false);
  let uploadProgress = $state(0);
  let uploadError = $state<string | null>(null);

  // File input ref
  let fileInputEl: HTMLInputElement;

  // Current user
  const currentUser = $derived(getAuthSync().currentUser);
  const uploadSubject = $derived(
    sequence
      ? {
          kind: "sequence" as const,
          storageKey: sequence.id,
          label: sequence.name || sequence.word,
        }
      : tunnel
        ? {
            kind: "tunnel" as const,
            storageKey: `tunnel_${tunnel.id}`,
            label: tunnel.name,
          }
        : null
  );

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("video/")) {
      uploadError = "Please select a video file";
      return;
    }

    // Validate file size (max 500MB - files over 100MB use multipart upload automatically)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      uploadError = "Video must be under 500MB";
      return;
    }

    selectedFile = file;
    uploadError = null;

    // Create preview URL
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    videoPreviewUrl = URL.createObjectURL(file);

    // Extract duration
    getVideoFileMetadata(file)
      .then((meta) => {
        videoDuration = meta.duration;
      })
      .catch((e) => {
        console.warn("Could not extract video metadata:", e);
        videoDuration = 0;
      });

    // Extract thumbnail
    extractVideoThumbnail(file)
      .then((result) => {
        thumbnail = result;
      })
      .catch((e) => {
        console.warn("Could not extract thumbnail:", e);
        thumbnail = null;
      });

    hapticService?.trigger("selection");
  }

  function handleBrowseClick() {
    fileInputEl?.click();
  }

  async function handleUpload() {
    if (!selectedFile) {
      uploadError = "No video file selected.";
      return;
    }
    if (!uploadSubject) {
      uploadError = "Choose a sequence or saved artwork for this video.";
      return;
    }
    if (!uploadService) {
      console.error("VideoUploader not available");
      uploadError =
        "Upload service not available. Please refresh and try again.";
      return;
    }
    if (!currentUser) {
      uploadError = "Please sign in to upload videos.";
      return;
    }

    let sequenceRevision: ArtifactRevisionRef | null = null;
    if (sequence) {
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
    }
    if (tunnel && !tunnel.revision) {
      uploadError =
        "This tunnel needs an immutable revision before footage can be attached. Reopen it and try again.";
      return;
    }

    isUploading = true;
    uploadProgress = 0;
    uploadError = null;
    hapticService?.trigger("selection");

    try {
      // 1. Upload video to Firebase Storage
      const uploadResult = await uploadService.uploadAssociatedVideo(
        uploadSubject.storageKey,
        selectedFile,
        {
          onProgress: (progress: number) => {
            // Reserve 0-90% for video, 90-100% for thumbnail
            uploadProgress = Math.round(progress * 0.9);
          },
        }
      );

      // 2. Upload thumbnail if extracted
      let thumbnailUrl: string | undefined;
      if (thumbnail) {
        try {
          // Extract timestamp from video path for thumbnail matching
          const videoTimestamp = parseInt(
            uploadResult.key.split("/").pop()?.split(".")[0] || "0"
          );
          const thumbnailResult = await uploadService.uploadVideoThumbnail(
            uploadSubject.storageKey,
            thumbnail.blob,
            videoTimestamp
          );
          thumbnailUrl = thumbnailResult.url;
          uploadProgress = 100;
        } catch (e) {
          console.warn("Thumbnail upload failed, continuing without:", e);
        }
      }

      // 3. Get metadata
      const metadata = await getVideoFileMetadata(selectedFile);

      // 4. Create collaborative video
      const common = {
        uploadResult,
        duration: metadata.duration || videoDuration,
        fileSize: metadata.fileSize,
        mimeType: metadata.mimeType,
        creatorId: currentUser.uid,
        creatorDisplayName: currentUser.displayName ?? undefined,
        creatorAvatarUrl: currentUser.photoURL ?? undefined,
        visibility,
        description: description.trim() || undefined,
        thumbnailUrl,
      };
      const video = sequence
        ? createVideoFromUpload({
            ...common,
            sequence,
            ...(sequenceRevision ? { revision: sequenceRevision } : {}),
          })
        : createTunnelRealizationFromUpload({ ...common, tunnel: tunnel! });

      // 5. Save to Firestore
      await saveVideo(video);

      hapticService?.trigger("success");
      onUploaded?.();
      handleClose();
    } catch (e) {
      console.error("Upload failed:", e);
      uploadError = e instanceof Error ? e.message : "Upload failed";
      toast.error("Video upload failed. Please try again.");
      hapticService?.trigger("error");
    } finally {
      isUploading = false;
    }
  }

  function handleClose() {
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    selectedFile = null;
    videoPreviewUrl = null;
    videoDuration = 0;
    description = "";
    visibility = DEFAULT_VIDEO_VISIBILITY;
    uploadProgress = 0;
    uploadError = null;
    thumbnail = null;
    onClose?.();
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

  const canUpload = $derived(selectedFile && !isUploading && currentUser);
</script>

<Drawer
  isOpen={show}
  labelledBy="video-upload-title"
  onclose={handleClose}
  closeOnBackdrop={!isUploading}
  showHandle={true}
  placement="bottom"
  class="video-upload-sheet"
>
  <div class="upload-sheet__container">
    <!-- Header -->
    <header class="upload-sheet__header">
      <div class="header-content">
        <i class="fas fa-video header-icon" aria-hidden="true"></i>
        <h2 id="video-upload-title">
          {uploadSubject?.kind === "tunnel"
            ? "Add tunnel footage"
            : "Upload performance"}
        </h2>
      </div>
      {#if !isUploading}
        <button class="close-button" onclick={handleClose} aria-label="Close">
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      {/if}
    </header>

    <!-- Content -->
    <div class="upload-sheet__content">
      <!-- The subject stays visible while choosing publication settings so a
           tunnel realization can never be mistaken for a sequence performance. -->
      <div class="sequence-info">
        <span class="sequence-label">
          {uploadSubject?.kind === "tunnel"
            ? "Realization of:"
            : "Performance of:"}
        </span>
        <span class="sequence-name"
          >{uploadSubject?.label ?? "No subject selected"}</span
        >
      </div>

      <!-- File Selection -->
      <input
        bind:this={fileInputEl}
        type="file"
        accept="video/*"
        onchange={handleFileSelect}
        hidden
      />

      {#if !selectedFile}
        <button class="file-drop-zone" onclick={handleBrowseClick}>
          <i class="fas fa-cloud-upload-alt" aria-hidden="true"></i>
          <span class="drop-text">Select Video</span>
          <span class="drop-hint">MP4, WebM, MOV up to 500MB</span>
        </button>
      {:else}
        <!-- Video Preview -->
        <div class="video-preview">
          {#if videoPreviewUrl}
            <video src={videoPreviewUrl} controls playsinline>
              <track kind="captions" />
            </video>
          {/if}
          <div class="video-meta">
            <span class="file-name">{selectedFile.name}</span>
            <span class="file-details">
              {formatFileSize(selectedFile.size)}
              {#if videoDuration > 0}
                · {formatDuration(videoDuration)}
              {/if}
            </span>
          </div>
          {#if !isUploading}
            <button class="change-btn" onclick={handleBrowseClick}>
              <i class="fas fa-exchange-alt" aria-hidden="true"></i>
              Change
            </button>
          {/if}
        </div>
      {/if}

      <!-- Options (only show when file selected) -->
      {#if selectedFile && !isUploading}
        <div class="options">
          <!-- Visibility -->
          <div class="option-group">
            <span class="option-label" id="visibility-label">
              Who can see this in Flow Arts Composer?
            </span>
            <SegmentedControl
              options={VIDEO_VISIBILITY_OPTIONS}
              value={visibility}
              onchange={(next) => (visibility = next)}
              color="accent"
              semantics="radiogroup"
              ariaLabelledby="visibility-label"
            />
            <span class="visibility-hint" aria-live="polite">
              {describeVideoVisibility(visibility)}
            </span>
          </div>

          <!-- Description -->
          <div class="option-group">
            <label for="video-description" class="option-label"
              >Description (optional)</label
            >
            <textarea
              id="video-description"
              bind:value={description}
              placeholder="Add a note about your performance..."
              rows="2"
              maxlength="200"
            ></textarea>
            <span class="char-count">{description.length}/200</span>
          </div>
        </div>
      {/if}

      <!-- Upload Progress -->
      {#if isUploading}
        <div class="upload-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: {uploadProgress}%"></div>
          </div>
          <span class="progress-text">Uploading... {uploadProgress}%</span>
        </div>
      {/if}

      <!-- Error -->
      {#if uploadError}
        <div class="error-banner" role="alert">
          <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
          <span>{uploadError}</span>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <footer class="upload-sheet__footer">
      {#if !isUploading}
        <button class="btn btn-secondary" onclick={handleClose}>
          Cancel
        </button>
      {/if}
      <button
        class="btn btn-primary"
        onclick={handleUpload}
        disabled={!canUpload}
      >
        {#if isUploading}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          Uploading...
        {:else}
          <i class="fas fa-upload" aria-hidden="true"></i>
          Upload Video
        {/if}
      </button>
    </footer>
  </div>
</Drawer>

<style>
  .upload-sheet__container {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: 90vh;
    background: linear-gradient(
      135deg,
      rgba(20, 20, 30, 0.98) 0%,
      rgba(30, 30, 45, 0.98) 100%
    );
    border-radius: 24px 24px 0 0;
    overflow: hidden;
  }

  .upload-sheet__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--theme-stroke);
    background: rgba(255, 255, 255, 0.03);
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .header-icon {
    font-size: 1.25rem;
    color: var(--semantic-info);
  }

  .upload-sheet__header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: none;
    background: var(--theme-card-bg);
    border-radius: 8px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .close-button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--theme-text);
  }

  .upload-sheet__content {
    flex: 1;
    padding: 1.5rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .sequence-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 8px;
  }

  .sequence-label {
    font-size: 0.85rem;
    color: var(--theme-text-dim);
  }

  .sequence-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .file-drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 3rem 2rem;
    background: rgba(255, 255, 255, 0.03);
    border: 2px dashed var(--theme-stroke-strong);
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .file-drop-zone:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(59, 130, 246, 0.5);
  }

  .file-drop-zone i {
    font-size: 2.5rem;
    color: var(--semantic-info);
  }

  .drop-text {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .drop-hint {
    font-size: 0.85rem;
    color: var(--theme-text-dim);
  }

  .video-preview {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.3);
  }

  .video-preview video {
    width: 100%;
    max-height: 200px;
    object-fit: contain;
    background: black;
  }

  .video-meta {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.5);
  }

  .file-name {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--theme-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-details {
    font-size: 0.8rem;
    color: var(--theme-text-dim);
  }

  .change-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    background: rgba(0, 0, 0, 0.7);
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .change-btn:hover {
    background: rgba(0, 0, 0, 0.9);
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .option-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .option-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .visibility-hint {
    min-block-size: 1.25rem;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
    color: var(--theme-text-dim);
  }

  .option-group textarea {
    padding: 0.75rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text);
    font-size: 0.9rem;
    font-family: inherit;
    resize: none;
    transition: all var(--duration-normal) ease;
  }

  .option-group textarea:focus {
    outline: none;
    border-color: rgba(59, 130, 246, 0.5);
    background: var(--theme-card-bg);
  }

  .char-count {
    font-size: 0.75rem;
    color: var(--theme-text-dim);
    text-align: right;
  }

  .upload-progress {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .progress-bar {
    height: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--semantic-info) 0%,
      var(--theme-accent-strong) 100%
    );
    border-radius: 4px;
    transition: width var(--duration-emphasis) ease;
  }

  .progress-text {
    font-size: 0.85rem;
    color: var(--theme-text-dim);
    text-align: center;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    color: var(--semantic-error);
    font-size: 0.9rem;
  }

  .upload-sheet__footer {
    display: flex;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--theme-stroke);
    background: rgba(255, 255, 255, 0.03);
  }

  .btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem 1.5rem;
    border: none;
    border-radius: 10px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .btn-secondary {
    background: var(--theme-card-bg);
    color: var(--theme-text);
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .btn-primary {
    background: linear-gradient(135deg, var(--semantic-info) 0%, #2563eb 100%);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 640px) {
    .upload-sheet__header {
      padding: 0.75rem 1rem;
    }

    .upload-sheet__content {
      padding: 1rem;
    }

    .upload-sheet__footer {
      flex-direction: column;
    }
  }
</style>
