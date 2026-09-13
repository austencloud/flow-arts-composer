<!--
  PerformancePreview.svelte

  Performance video format preview with inline controls.
  Displays camera feed or uploaded video with record/upload toggle.

  Features:
  - Live camera preview using CameraManager
  - Video recording using VideoRecorder
  - File upload with video preview
  - Record/Upload mode toggle
  - Recording state with duration indicator

  Domain: Export Panel - Single Media - Performance Video Format
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import { getExportPanelState } from "../../state/export-panel-state.svelte";
  import { getCameraManager } from "$lib/shared/train/get-camera-manager";
  import {
    isCameraAcquisitionCancelled,
    type CameraAcquisition,
    type CameraManager,
  } from "$lib/shared/train/services/camera-manager";
  import { getVideoRecorder } from "$lib/shared/video-record/services/video-recorder";
  import type {
    RecordingProgress,
    RecordingResult,
  } from "$lib/shared/video-record/services/types";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";

  const hubState = getExportPanelState();

  // Services
  let cameraService = $state<CameraManager | null>(null);
  const recordService = getVideoRecorder();

  // Camera state
  let loading = $state(true);
  let error = $state<string | null>(null);
  let cameraInitialized = $state(false);
  let videoElement = $state<HTMLVideoElement | null>(null);
  let cameraStream = $state<MediaStream | null>(null);
  // Plain flag, not state: it only guards the async acquisition below.
  let destroyed = false;

  // Recording state
  let recordingId = $state<string | null>(null);
  let recordingState = $state<"idle" | "recording" | "paused" | "stopped">(
    "idle"
  );
  let recordingDuration = $state(0);
  let recordedVideo = $state<RecordingResult | null>(null);
  let playbackVideoElement = $state<HTMLVideoElement | null>(null);

  // Upload state
  let fileInputElement = $state<HTMLInputElement | null>(null);
  let uploadedVideoUrl = $state<string | null>(null);

  // Derived
  const modeIcon = $derived(
    hubState.performanceSettings.mode === "record" ? "fa-video" : "fa-upload"
  );

  const modeLabel = $derived(
    hubState.performanceSettings.mode === "record" ? "Record" : "Upload"
  );

  async function initializeCamera() {
    if (!cameraService) {
      error = "Camera service not loaded";
      return;
    }

    try {
      const acquisition = await cameraService.initialize({
        facingMode: "user",
        width: 1280,
        height: 720,
        frameRate: 30,
      });

      // Acquiring the camera takes two awaits, and the panel can close in
      // between — this one shares its CameraManager with other surfaces, so the
      // stream must not be opened (or kept) for a panel that is already gone:
      // teardown has already run by then and would never stop it. Everything
      // here is scoped to this panel's own handshake and stream, never the
      // instance-wide stop(), which would switch off a camera another surface
      // opened in the meantime.
      if (destroyed) {
        cameraService.abandonAcquisition(acquisition);
        return;
      }

      const stream = await cameraService.start(acquisition);
      if (destroyed) {
        cameraService.releaseStream(stream);
        return;
      }

      cameraStream = stream;
      cameraInitialized = true;
      error = null;
    } catch (err) {
      // A start the manager cancelled for us is not a failure to report.
      if (isCameraAcquisitionCancelled(err)) return;
      error = err instanceof Error ? err.message : "Failed to access camera";
    }
  }

  // Attach stream to video element
  $effect(() => {
    if (cameraStream && videoElement && !recordedVideo) {
      videoElement.srcObject = cameraStream;
      videoElement.play().catch(() => {});
    }
  });

  // Recording controls
  async function startRecording() {
    if (!videoElement?.srcObject) return;

    try {
      const stream = videoElement.srcObject as MediaStream;
      recordingId = await recordService.startRecording(
        stream,
        { format: "webm", quality: 0.9, maxDuration: 120 },
        handleProgress
      );
      recordingState = "recording";
    } catch (err) {
      console.error("Failed to start recording:", err);
      error =
        err instanceof Error ? err.message : "Failed to start recording";
    }
  }

  async function stopRecording() {
    if (!recordingId) return;

    try {
      const result = await recordService.stopRecording(recordingId);
      if (result.success) {
        recordedVideo = result;
        recordingState = "stopped";
        if (videoElement) videoElement.pause();
      } else {
        error = result.error ?? "Recording failed";
        recordingId = null;
        recordingState = "idle";
        recordingDuration = 0;
      }
    } catch (err) {
      console.error("Failed to stop recording:", err);
      error = err instanceof Error ? err.message : "Failed to stop recording";
      recordingId = null;
      recordingState = "idle";
      recordingDuration = 0;
    }
  }

  function cancelRecording() {
    if (!recordingId) return;
    recordService.cancelRecording(recordingId);
    recordingId = null;
    recordingState = "idle";
    recordingDuration = 0;
  }

  function discardRecording() {
    if (recordedVideo?.blobUrl) {
      URL.revokeObjectURL(recordedVideo.blobUrl);
    }
    recordedVideo = null;
    recordingId = null;
    recordingState = "idle";
    recordingDuration = 0;
    if (videoElement) videoElement.play();
  }

  function handleProgress(progress: RecordingProgress) {
    recordingDuration = progress.currentDuration;
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  // Upload handling
  function triggerFileSelect() {
    fileInputElement?.click();
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Clean up old URL
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
    }

    // Update state
    hubState.performanceSettings = {
      ...hubState.performanceSettings,
      uploadedFile: file,
    };
    uploadedVideoUrl = URL.createObjectURL(file);
  }

  function clearUploadedFile() {
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
      uploadedVideoUrl = null;
    }
    hubState.performanceSettings = {
      ...hubState.performanceSettings,
      uploadedFile: null,
    };
  }

  // Mode toggle
  function toggleMode() {
    const newMode =
      hubState.performanceSettings.mode === "record" ? "upload" : "record";
    hubState.performanceSettings = {
      ...hubState.performanceSettings,
      mode: newMode,
    };

    // Stop any recording when switching modes
    if (recordingState === "recording") {
      cancelRecording();
    }
  }

  function handleSettingsClick() {
    hubState.settingsPanelOpen = true;
    hubState.settingsContext = { format: "performance" };
  }

  // Initialize
  onMount(async () => {
    if (!browser) return;

    try {
      cameraService = getCameraManager();
      await initializeCamera();
    } catch (err) {
      error = "Failed to load camera service";
    } finally {
      loading = false;
    }

    // Create URL for uploaded file if exists
    if (hubState.performanceSettings.uploadedFile) {
      uploadedVideoUrl = URL.createObjectURL(
        hubState.performanceSettings.uploadedFile
      );
    }
  });

  // Cleanup
  onDestroy(() => {
    destroyed = true;
    if (recordingId) recordService.cancelRecording(recordingId);
    if (recordedVideo?.blobUrl) URL.revokeObjectURL(recordedVideo.blobUrl);
    if (uploadedVideoUrl) URL.revokeObjectURL(uploadedVideoUrl);
    // Release only the stream this panel holds. The CameraManager is shared, so
    // an instance-wide stop() here would switch off a camera another surface
    // opened; anything still in flight is released by the acquisition path
    // above, which knows which handshake is ours.
    if (cameraService && cameraStream) cameraService.releaseStream(cameraStream);
  });
</script>

<div class="performance-preview">
  <!-- Hidden file input for uploads -->
  <input
    bind:this={fileInputElement}
    type="file"
    accept="video/*"
    class="hidden-input"
    onchange={handleFileSelect}
  />

  <!-- Preview Area -->
  <div class="preview-area">
    {#if hubState.performanceSettings.mode === "record"}
      <!-- Camera Mode -->
      {#if loading}
        <div class="loading-state">
          <ProgressRing percent={-1} size={32} strokeWidth={3} />
          <p>Initializing camera...</p>
        </div>
      {:else if error}
        <div class="error-state">
          <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
          <p>{error}</p>
          <button class="retry-button" onclick={initializeCamera}>
            <i class="fas fa-redo" aria-hidden="true"></i> Retry
          </button>
        </div>
      {:else if recordedVideo}
        <!-- Recorded video playback -->
        <div class="video-container">
          <video
            bind:this={playbackVideoElement}
            src={recordedVideo.blobUrl}
            controls
            autoplay
            muted
            loop
            class="video-preview"
            aria-label="Recorded performance video"
          ></video>
        </div>
      {:else if cameraInitialized}
        <!-- Live camera feed -->
        <div class="video-container">
          {#if recordingState === "recording"}
            <div class="recording-indicator">
              <i class="fas fa-circle" aria-hidden="true"></i>
              <span>{formatDuration(recordingDuration)}</span>
            </div>
          {/if}
          <video
            bind:this={videoElement}
            autoplay
            playsinline
            muted
            class="video-preview mirror"
            aria-hidden="true"
          ></video>
        </div>
      {/if}
    {:else}
      <!-- Upload Mode -->
      {#if uploadedVideoUrl}
        <div class="video-container">
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            src={uploadedVideoUrl}
            controls
            class="video-preview"
            aria-label="Uploaded performance video"
          ></video>
          <button
            class="clear-upload"
            onclick={clearUploadedFile}
            aria-label="Remove video"
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>
      {:else}
        <button class="upload-dropzone" onclick={triggerFileSelect}>
          <i class="fas fa-cloud-upload-alt" aria-hidden="true"></i>
          <p>Click to upload a video</p>
          <span class="hint">MP4, WebM, MOV (max 100MB)</span>
        </button>
      {/if}
    {/if}
  </div>

  <!-- Inline Controls -->
  <div class="inline-controls">
    <button class="control-button mode-toggle" onclick={toggleMode}>
      <i class="fas {modeIcon}" aria-hidden="true"></i>
      <span>{modeLabel}</span>
    </button>

    {#if hubState.performanceSettings.mode === "record"}
      {#if recordedVideo}
        <!-- Playback controls -->
        <button class="control-button secondary" onclick={discardRecording}>
          <i class="fas fa-redo" aria-hidden="true"></i>
          <span>Re-record</span>
        </button>
      {:else if recordingState === "idle"}
        <button
          class="control-button record-button"
          onclick={startRecording}
          disabled={!cameraInitialized}
        >
          <i class="fas fa-circle" aria-hidden="true"></i>
          <span>Record</span>
        </button>
      {:else if recordingState === "recording"}
        <div class="recording-controls">
          <span class="duration-badge">
            <i class="fas fa-circle pulse" aria-hidden="true"></i>
            {formatDuration(recordingDuration)}
          </span>
          <button
            class="control-button stop-button"
            onclick={stopRecording}
            aria-label="Stop recording"
          >
            <i class="fas fa-stop" aria-hidden="true"></i>
          </button>
          <button
            class="control-button cancel-button"
            onclick={cancelRecording}
            aria-label="Cancel recording"
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>
      {/if}
    {:else if !uploadedVideoUrl}
      <button class="control-button upload-button" onclick={triggerFileSelect}>
        <i class="fas fa-folder-open" aria-hidden="true"></i>
        <span>Browse</span>
      </button>
    {/if}

    <button
      class="control-button settings-button"
      onclick={handleSettingsClick}
      aria-label="Performance video settings"
    >
      <i class="fas fa-cog" aria-hidden="true"></i>
    </button>
  </div>
</div>

<style>
  .performance-preview {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 16px;
  }

  .hidden-input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .preview-area {
    flex: 1;
    min-height: 0;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Video container */
  .video-container {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: black;
  }

  .video-preview {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: black;
  }

  .video-preview.mirror {
    transform: scaleX(-1);
  }

  /* Recording indicator overlay */
  .recording-indicator {
    position: absolute;
    top: 16px;
    left: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 90%,
      transparent
    );
    border-radius: 20px;
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: white;
    z-index: 10;
  }

  .recording-indicator i {
    font-size: var(--font-size-compact);
    animation: blink 1s ease-in-out infinite;
  }

  /* Clear upload button */
  .clear-upload {
    position: absolute;
    top: 12px;
    right: 12px;
    width: var(--min-touch-target); /* WCAG AA touch target */
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    color: white;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .clear-upload:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 80%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 80%,
      transparent
    );
  }

  /* Upload dropzone */
  .upload-dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    height: 100%;
    background: transparent;
    border: 2px dashed var(--theme-stroke);
    border-radius: 8px;
    margin: 16px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .upload-dropzone:hover {
    border-color: var(--theme-accent);
    background: var(--theme-card-bg);
  }

  .upload-dropzone i {
    font-size: var(--font-size-3xl);
    opacity: 0.5;
  }

  .upload-dropzone p {
    font-size: var(--font-size-min);
    margin: 0;
    font-weight: 500;
  }

  .upload-dropzone .hint {
    font-size: var(--font-size-compact);
    opacity: 0.7;
  }

  /* Loading/Error states */
  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: var(--theme-text-dim);
    padding: 32px;
  }

  .loading-state p,
  .error-state p {
    font-size: var(--font-size-min);
    margin: 0;
  }

  .error-state i {
    font-size: var(--font-size-3xl);
    opacity: 0.5;
    color: var(--semantic-warning);
  }

  .retry-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text, white);
    font-size: var(--font-size-min);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .retry-button:hover {
    background: var(--theme-card-hover-bg);
  }

  /* Inline controls */
  .inline-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    flex-wrap: wrap;
  }

  .recording-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .duration-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
    border-radius: 8px;
    font-size: var(--font-size-min);
    font-weight: 600;
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 55%, white);
  }

  .duration-badge i.pulse {
    animation: blink 1s ease-in-out infinite;
    color: var(--semantic-error, #ef4444);
  }

  .control-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    min-height: var(--min-touch-target); /* WCAG 2.1 AA touch target */
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    font-size: var(--font-size-min);
    font-weight: 500;
    color: var(--theme-text);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    white-space: nowrap;
  }

  .control-button i {
    font-size: var(--font-size-base);
  }

  .control-button:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-accent);
  }

  .control-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .control-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .mode-toggle {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
  }

  .mode-toggle:hover {
    background: var(--theme-accent-hover);
  }

  .record-button {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 50%,
      transparent
    );
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 55%, white);
  }

  .record-button:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 30%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 70%,
      transparent
    );
  }

  .stop-button {
    background: var(--semantic-error, #ef4444);
    border-color: var(--semantic-error, #ef4444);
    color: white;
    padding: 8px 12px;
  }

  .stop-button:hover {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 80%, black);
  }

  .cancel-button {
    background: color-mix(in srgb, #fff 10%, transparent);
    border-color: color-mix(in srgb, #fff 20%, transparent);
    padding: 8px 12px;
  }

  .upload-button {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
  }

  .secondary {
    background: color-mix(in srgb, #fff 10%, transparent);
    border-color: color-mix(in srgb, #fff 20%, transparent);
  }

  .settings-button {
    margin-left: auto;
  }

  /* Animations */
  @keyframes blink {
    0%,
    50%,
    100% {
      opacity: 1;
    }
    25%,
    75% {
      opacity: 0.3;
    }
  }

  /* Mobile optimization */
  @media (max-width: 600px) {
    .inline-controls {
      gap: 8px;
    }

    .control-button span {
      display: none;
    }

    .control-button {
      padding: 8px 12px;
    }

    .upload-dropzone {
      margin: 8px;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .control-button,
    .retry-button,
    .clear-upload,
    .upload-dropzone {
      transition: none;
    }

    .recording-indicator i,
    .duration-badge i.pulse {
      animation: none;
    }
  }
</style>
