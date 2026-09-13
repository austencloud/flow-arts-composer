<!--
  VideoRecordPanel.svelte

  Camera recording panel with optional reference views (animation or grid).
  Clean layout focused on camera + media with settings in a sheet.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { getCameraManager } from "$lib/shared/train/get-camera-manager";
  import {
    isCameraAcquisitionCancelled,
    type CameraAcquisition,
  } from "$lib/shared/train/services/camera-manager";
  import { getVideoRecorder } from "../services/video-recorder";
  import type {
    RecordingProgress,
    RecordingResult,
  } from "../services/types";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { createVideoRecordSettings } from "../state/video-record-settings.svelte";
  import GridPreview from "./GridPreview.svelte";
  import VideoRecordSettingsSheet from "./VideoRecordSettingsSheet.svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";

  let {
    sequence = null,
    onClose = () => {},
    onSave = () => {},
  }: {
    sequence?: SequenceData | null;
    onClose?: () => void;
    onSave?: (recording: RecordingResult) => void;
  } = $props();

  // Share state
  let isSharing = $state(false);
  let settingsOpen = $state(false);

  // Services
  const cameraService = getCameraManager();
  const recordService = getVideoRecorder();

  // Settings
  const settings = createVideoRecordSettings();

  // Detect mobile layout
  let isMobile = $state(false);

  function detectLayout() {
    if (!browser) return;
    isMobile = window.innerWidth < 768;
  }

  // Camera state
  let cameraInitialized = $state(false);
  let cameraError = $state<string | null>(null);
  let videoElement = $state<HTMLVideoElement | null>(null);
  let cameraStream = $state<MediaStream | null>(null);

  // Recording state
  let recordingId = $state<string | null>(null);
  let recordingState = $state<"idle" | "recording" | "paused" | "stopped">(
    "idle"
  );
  let recordingDuration = $state(0);
  let recordedVideo = $state<RecordingResult | null>(null);
  let playbackVideoElement = $state<HTMLVideoElement | null>(null);

  // Computed: Should show reference panel?
  const showReferencePanel = $derived(
    isMobile ? true : settings.current.referenceView !== "none"
  );

  // Extract prop types from sequence for bilateral toggle
  const leftPropType = $derived.by(() => {
    const firstStep = sequence?.steps?.[0];
    return firstStep?.motions?.left?.propType ?? null;
  });

  const rightPropType = $derived.by(() => {
    const firstStep = sequence?.steps?.[0];
    return firstStep?.motions?.right?.propType ?? null;
  });

  // Computed: Which reference view to show?
  const activeReferenceView = $derived.by(() => {
    if (!showReferencePanel) return null;
    if (isMobile) {
      return settings.current.referenceView === "grid" ? "grid" : "animation";
    } else {
      return settings.current.referenceView === "animation"
        ? "animation"
        : settings.current.referenceView === "grid"
          ? "grid"
          : null;
    }
  });

  // Acquiring a camera is two awaits long: initialize() enumerates devices and
  // start() sits on getUserMedia, which can wait on an unanswered permission
  // prompt for as long as the user ignores it. Teardown can land anywhere in
  // there, and onDestroy has nothing to close yet when it does. Without this
  // flag the camera opens after the panel is gone and stays open.
  let destroyed = false;

  // The manager is one shared instance: PerformancePreview reaches the same one
  // through getCameraManager(), and its stop() releases whatever that instance
  // currently holds, whoever opened it. This panel never calls it. Every
  // release here is scoped to this panel's own handshake instead: the
  // acquisition handle for a camera that has not opened yet, the stream itself
  // once one has. Both are no-ops on the manager's state once another surface
  // has taken the instance over, so a late teardown cannot close their camera.
  let acquisition: CameraAcquisition | null = null;

  function releaseOwnCamera() {
    if (cameraStream) {
      // Stops these tracks always, and clears the manager's _stream and
      // _isActive only while this is still the stream it handed out. Stopping
      // the tracks by hand would leave those fields pointing at a dead camera.
      cameraService?.releaseStream(cameraStream);
      cameraStream = null;
    } else if (acquisition) {
      cameraService?.abandonAcquisition(acquisition);
    }
    acquisition = null;
  }

  async function initializeCamera() {
    if (!cameraService) {
      cameraError = "Camera service not loaded";
      return;
    }

    try {
      acquisition = await cameraService.initialize({
        facingMode: "user",
        width: 1280,
        height: 720,
        frameRate: 30,
      });
      if (destroyed) {
        // Teardown ran while devices were being enumerated, so it had no handle
        // to give up. Give it up now.
        releaseOwnCamera();
        return;
      }

      const stream = await cameraService.start(acquisition);
      if (destroyed) {
        cameraService.releaseStream(stream);
        acquisition = null;
        return;
      }

      cameraStream = stream;
      cameraInitialized = true;
    } catch (error) {
      acquisition = null;
      // A cancelled acquisition is this panel closing, or another surface
      // taking the camera; the manager has already released whatever it opened.
      // Not something to show the user, and never something to answer with a
      // stop() that would close the camera somebody else is now using.
      if (destroyed || isCameraAcquisitionCancelled(error)) return;
      cameraError =
        error instanceof Error ? error.message : "Failed to access camera";
    }
  }

  // Attach stream to video element
  $effect(() => {
    if (cameraStream && videoElement && !recordedVideo) {
      videoElement.srcObject = cameraStream;
      videoElement.play().catch(() => {});
    }
  });

  /**
   * Recording controls
   */
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
    } catch (error) {
      console.error("Failed to start recording:", error);
      toast.error("Failed to start recording. Please try again.");
    }
  }

  function pauseRecording() {
    if (!recordingId) return;
    recordService.pauseRecording(recordingId);
    recordingState = "paused";
  }

  function resumeRecording() {
    if (!recordingId) return;
    recordService.resumeRecording(recordingId);
    recordingState = "recording";
  }

  async function stopRecording() {
    if (!recordingId) return;

    try {
      const result = await recordService.stopRecording(recordingId);
      if (result.success) {
        recordedVideo = result;
        recordingState = "stopped";
        if (videoElement) videoElement.pause();
      }
    } catch (error) {
      console.error("Failed to stop recording:", error);
      toast.error("Failed to stop recording. Please try again.");
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

  function saveRecording() {
    if (!recordedVideo) return;
    onSave(recordedVideo);
  }

  async function shareRecording() {
    if (!recordedVideo || isSharing || !navigator.share) return;

    try {
      isSharing = true;
      const sequenceName = sequence?.word || sequence?.name || "recording";

      if (recordedVideo.videoBlob && navigator.canShare) {
        const filename = `tka-${sequenceName}-${Date.now()}.webm`;
        const file = new File([recordedVideo.videoBlob], filename, {
          type: "video/webm",
        });
        const shareData: ShareData = {
          title: `TKA Recording: ${sequenceName}`,
          text: `Check out my flow recording: ${sequenceName}`,
          files: [file],
        };
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return;
        }
      }

      await navigator.share({
        title: `TKA Recording: ${sequenceName}`,
        text: `Check out my flow recording: ${sequenceName}`,
        url: window.location.href,
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Failed to share:", error);
        toast.error("Failed to share recording.");
      }
    } finally {
      isSharing = false;
    }
  }

  function handleProgress(progress: RecordingProgress) {
    recordingDuration = progress.currentDuration;
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  // Initialize
  onMount(async () => {
    detectLayout();
    if (browser) {
      window.addEventListener("resize", detectLayout);
    }

    try {
      await initializeCamera();
    } catch (error) {
      cameraError = "Failed to load camera service";
    }
  });

  // Cleanup
  onDestroy(() => {
    destroyed = true;
    if (recordingId) recordService.cancelRecording(recordingId);
    if (recordedVideo?.blobUrl) URL.revokeObjectURL(recordedVideo.blobUrl);
    if (browser) window.removeEventListener("resize", detectLayout);
    // Scoped to this panel: the stream if one arrived, otherwise the handshake
    // that is still in flight, which cancels the start queued behind it instead
    // of letting it open a camera nobody will close.
    releaseOwnCamera();
  });
</script>

<div class="video-record-panel">
  {#if cameraError}
    <div class="error-state" role="alert">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      <p>Camera Error</p>
      <p class="error-detail">{cameraError}</p>
      <button class="retry-btn" onclick={() => window.location.reload()}>
        <i class="fas fa-redo" aria-hidden="true"></i> Retry
      </button>
    </div>
  {:else if !cameraInitialized}
    <div class="loading-state">
      <ProgressRing percent={-1} size={32} strokeWidth={3} />
      <p>Initializing camera...</p>
    </div>
  {:else}
    <!-- Settings Button (Top Right) -->
    <button
      class="settings-fab"
      onclick={() => (settingsOpen = true)}
      aria-label="Settings"
    >
      <i class="fas fa-cog" aria-hidden="true"></i>
    </button>

    <!-- Main Content: Split View -->
    <div class="split-view" class:has-reference={showReferencePanel}>
      <!-- Camera Section -->
      <div class="media-panel camera-panel">
        <div class="panel-label">
          <i class="fas fa-video" aria-hidden="true"></i>
          Camera
        </div>
        <div class="video-wrapper">
          <div class="square-crop">
            {#if recordedVideo}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video
                bind:this={playbackVideoElement}
                src={recordedVideo.blobUrl}
                controls
                autoplay
                loop
                class="video-preview"
                aria-label="Recorded performance video"
              ></video>
            {:else}
              <video
                bind:this={videoElement}
                autoplay
                playsinline
                muted
                class="video-preview mirror"
                aria-hidden="true"
              ></video>
            {/if}
          </div>
        </div>
      </div>

      <!-- Reference Section -->
      {#if showReferencePanel && activeReferenceView && sequence}
        <div class="media-panel reference-panel">
          <div class="panel-label">
            <i
              class="fas {activeReferenceView === 'animation'
                ? 'fa-play-circle'
                : 'fa-th'}"
              aria-hidden="true"
            ></i>
            {activeReferenceView === "animation" ? "Animation" : "Grid"}
          </div>
          <div class="reference-wrapper">
            {#if activeReferenceView === "animation"}
              {#await import("$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte") then mod}
                <mod.default
                  {sequence}
                  autoPlay={true}
                  showControls={false}
                />
              {/await}
            {:else if activeReferenceView === "grid"}
              <GridPreview
                {sequence}
                settings={settings.current.gridSettings}
                onSettingsChange={(s) => {
                  settings.setGridAnimated(s.animated);
                  settings.setGridBpm(s.bpm);
                }}
              />
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Recording Controls (in layout flow) -->
    <div class="controls-bar">
      {#if recordedVideo}
        <!-- Playback State -->
        <div class="control-group">
          <span class="duration-badge"
            >{formatDuration(recordedVideo.duration || 0)}</span
          >
          <div class="control-buttons">
            <button
              class="control-btn secondary"
              onclick={discardRecording}
              aria-label="Record Again"
            >
              <i class="fas fa-redo" aria-hidden="true"></i>
            </button>
            <button
              class="control-btn primary"
              onclick={shareRecording}
              disabled={isSharing}
              aria-label="Share"
            >
              <i
                class="fas {isSharing
                  ? 'fa-spinner fa-spin'
                  : 'fa-share-nodes'}"
                aria-hidden="true"
              ></i>
            </button>
            <button
              data-save-shortcut
              class="control-btn success"
              onclick={saveRecording}
              aria-label="Save"
            >
              <i class="fas fa-download" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      {:else if recordingState === "idle"}
        <!-- Ready to Record -->
        <button
          class="record-btn"
          onclick={startRecording}
          aria-label="Start Recording"
        >
          <span class="record-dot"></span>
        </button>
      {:else if recordingState === "recording"}
        <!-- Recording -->
        <div class="control-group">
          <span class="duration-badge recording">
            <i class="fas fa-circle pulse" aria-hidden="true"></i>
            {formatDuration(recordingDuration)}
          </span>
          <div class="control-buttons">
            <button
              class="control-btn secondary"
              onclick={pauseRecording}
              aria-label="Pause"
            >
              <i class="fas fa-pause" aria-hidden="true"></i>
            </button>
            <button
              class="control-btn primary"
              onclick={stopRecording}
              aria-label="Stop"
            >
              <i class="fas fa-stop" aria-hidden="true"></i>
            </button>
            <button
              class="control-btn danger"
              onclick={cancelRecording}
              aria-label="Cancel"
            >
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      {:else if recordingState === "paused"}
        <!-- Paused -->
        <div class="control-group">
          <span class="duration-badge paused">
            <i class="fas fa-pause" aria-hidden="true"></i>
            {formatDuration(recordingDuration)}
          </span>
          <div class="control-buttons">
            <button
              class="control-btn success"
              onclick={resumeRecording}
              aria-label="Resume"
            >
              <i class="fas fa-play" aria-hidden="true"></i>
            </button>
            <button
              class="control-btn primary"
              onclick={stopRecording}
              aria-label="Stop"
            >
              <i class="fas fa-stop" aria-hidden="true"></i>
            </button>
            <button
              class="control-btn danger"
              onclick={cancelRecording}
              aria-label="Cancel"
            >
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Settings Sheet -->
<VideoRecordSettingsSheet
  isOpen={settingsOpen}
  {isMobile}
  referenceView={settings.current.referenceView}
  gridSettings={settings.current.gridSettings}
  {leftPropType}
  {rightPropType}
  onClose={() => (settingsOpen = false)}
  onReferenceViewChange={(v) => settings.setReferenceView(v)}
  onGridSettingsChange={(s) => {
    settings.setGridAnimated(s.animated);
    settings.setGridBpm(s.bpm);
  }}
/>

<style>
  .video-record-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--theme-panel-bg);
  }

  /* Settings FAB */
  .settings-fab {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 10;
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke-strong));
    border-radius: 50%;
    color: var(--theme-text-dim);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .settings-fab:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, white);
    transform: rotate(45deg);
  }

  /* Split View */
  .split-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    min-height: 0;
  }

  .split-view.has-reference .media-panel {
    flex: 1;
    min-height: 0;
  }

  .split-view:not(.has-reference) .camera-panel {
    flex: 1;
  }

  /* Media Panels */
  .media-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    overflow: hidden;
    background: var(--theme-panel-elevated-bg);
  }

  .panel-label {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: var(--theme-card-bg);
    border-radius: 6px;
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: var(--theme-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .panel-label i {
    font-size: var(--font-size-compact);
  }

  .video-wrapper,
  .reference-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    overflow: hidden;
  }

  /* Square crop container for video */
  .square-crop {
    position: relative;
    width: 100%;
    max-width: 100%;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    border-radius: 8px;
    background: black;
  }

  .video-preview {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    min-width: 100%;
    min-height: 100%;
    width: auto;
    height: auto;
    object-fit: cover;
    background: black;
  }

  .video-preview.mirror {
    transform: translate(-50%, -50%) scaleX(-1);
  }

  /* Controls Bar (in layout flow) */
  .controls-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px 8px;
    background: var(--theme-panel-bg);
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: var(--theme-panel-elevated-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 24px;
  }

  .duration-badge {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text, white);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .duration-badge.recording {
    color: var(--semantic-error, var(--semantic-error));
  }

  .duration-badge.paused {
    color: var(--semantic-warning, var(--semantic-warning));
  }

  .duration-badge i.pulse {
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .control-buttons {
    display: flex;
    gap: 8px;
  }

  .control-btn {
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    font-size: var(--font-size-base);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .control-btn.primary {
    background: linear-gradient(
      135deg,
      var(--theme-accent, var(--semantic-info)) 0%,
      var(--theme-accent-strong) 100%
    );
    color: var(--theme-text, white);
  }

  .control-btn.secondary {
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    color: var(--theme-text, white);
  }

  .control-btn.success {
    background: linear-gradient(
      135deg,
      var(--semantic-success, var(--semantic-success)) 0%,
      color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 70%,
          black
        )
        100%
    );
    color: var(--theme-text, white);
  }

  .control-btn.danger {
    background: var(--semantic-error, var(--semantic-error));
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 80%,
        black
      );
    color: white;
  }

  .control-btn:hover:not(:disabled) {
    transform: scale(1.08);
  }

  .control-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .control-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Record Button */
  .record-btn {
    width: 72px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-panel-elevated-bg);
    border: 3px solid var(--theme-stroke-strong);
    border-radius: 50%;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .record-btn:hover {
    border-color: color-mix(in srgb, var(--theme-stroke-strong) 70%, white);
    transform: scale(1.05);
  }

  .record-btn:active {
    transform: scale(0.95);
  }

  .record-dot {
    width: 32px;
    height: 32px;
    background: var(--semantic-error, var(--semantic-error));
    border-radius: 50%;
    transition: all var(--duration-normal) ease;
  }

  .record-btn:hover .record-dot {
    transform: scale(1.1);
    box-shadow: 0 0 20px
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 50%,
        transparent
      );
  }

  /* Loading/Error States */
  .loading-state,
  .error-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 32px;
    text-align: center;
  }

  .loading-state p,
  .error-state p {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--theme-text);
  }

  .error-state i {
    font-size: var(--font-size-3xl);
    color: var(--semantic-warning, var(--semantic-warning));
  }

  .error-detail {
    font-size: var(--font-size-sm) !important;
    color: var(--theme-text-dim, var(--theme-text-dim)) !important;
  }

  .retry-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .retry-btn:hover {
    background: var(--theme-card-hover-bg);
  }

  /* Responsive */
  @media (min-width: 768px) {
    .split-view.has-reference {
      flex-direction: row;
    }

    .square-crop {
      max-height: 100%;
      width: auto;
      height: 100%;
    }
  }

  @media (max-width: 640px) {
    .split-view {
      gap: 6px;
      padding: 6px;
    }

    .controls-bar {
      padding: 8px;
    }

    .control-btn {
      width: var(--min-touch-target); /* WCAG AAA touch target */
      height: var(--min-touch-target);
      font-size: var(--font-size-sm);
    }

    .record-btn {
      width: 56px;
      height: 56px;
    }

    .record-dot {
      width: 24px;
      height: 24px;
    }

    .control-group {
      gap: 8px;
      padding: 6px 12px;
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .pulse {
      animation: none;
    }
  }
</style>
