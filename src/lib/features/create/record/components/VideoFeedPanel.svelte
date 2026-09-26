<!--
VideoFeedPanel.svelte

Camera feed component for the Record tab.
Handles camera access using MediaDevices API with support for both mobile and desktop.
Features square aspect ratio for consistent layout and settings dialog for camera controls.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { onDestroy, onMount } from "svelte";
  import CameraSettingsDialog from "./CameraSettingsDialog.svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { showToast } from "$lib/shared/toast/state/toast-state.svelte";

  // Props
  const {
    onCameraReady = () => {},
    onCameraError = (_error: Error) => {},
  }: {
    onCameraReady?: () => void;
    onCameraError?: (error: Error) => void;
  } = $props();

  // State
  let videoElement: HTMLVideoElement | null = $state(null);
  let stream: MediaStream | null = $state(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let isCameraActive = $state(false);
  let availableCameras = $state<MediaDeviceInfo[]>([]);
  let selectedCameraId = $state<string | null>(null);
  let isMirrored = $state(true); // Default to mirrored for front-facing cameras
  let isSettingsOpen = $state(false); // Settings dialog state

  // Set on unmount so an in-flight getUserMedia doesn't leak live tracks
  // when it resolves after the component is gone (no reactivity needed).
  let isDestroyed = false;

  // Camera constraints - square aspect ratio for consistent layout
  function getCameraConstraints(deviceId?: string): MediaStreamConstraints {
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: 720 }, // Square aspect ratio
      height: { ideal: 720 }, // Square aspect ratio
      facingMode: isMobile ? "environment" : "user",
    };

    if (deviceId) {
      videoConstraints.deviceId = { exact: deviceId };
    }

    return {
      video: videoConstraints,
      audio: false,
    };
  }

  // Settings dialog handlers
  function openSettings() {
    isSettingsOpen = true;
  }

  function closeSettings() {
    isSettingsOpen = false;
  }

  function toggleMirror() {
    isMirrored = !isMirrored;
  }

  function handleCameraChange(deviceId: string) {
    switchCamera(deviceId);
  }

  async function getAvailableCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      availableCameras = devices.filter(
        (device) => device.kind === "videoinput"
      );
    } catch (err) {
      console.error("Failed to enumerate cameras:", err);
      // Non-fatal: the default camera can still start, but switching is unavailable
      showToast(
        "Couldn't list your cameras. Switching cameras won't be available.",
        "warning"
      );
    }
  }

  async function startCamera(deviceId?: string) {
    try {
      isLoading = true;
      error = null;

      // Stop existing stream if any
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }

      // Request camera access
      const constraints = getCameraConstraints(deviceId);
      const acquiredStream =
        await navigator.mediaDevices.getUserMedia(constraints);

      // Component unmounted while getUserMedia was pending — release the
      // tracks immediately or the camera stays live with no owner.
      if (isDestroyed) {
        acquiredStream.getTracks().forEach((track) => track.stop());
        return;
      }

      stream = acquiredStream;

      // Attach stream to video element
      if (videoElement) {
        videoElement.srcObject = stream;

        // Wait for video to be ready
        videoElement.onloadedmetadata = () => {
          videoElement
            ?.play()
            .then(() => {
              isCameraActive = true;
              isLoading = false;
              onCameraReady();
            })
            .catch((playErr) => {
              console.error("❌ Failed to play video:", playErr);
              error =
                "Failed to play video: " +
                (playErr instanceof Error ? playErr.message : String(playErr));
              isLoading = false;
            });
        };
      } else {
        console.error("❌ No video element found");
        error = "Video element not ready";
        isLoading = false;
      }
    } catch (err) {
      console.error("❌ Failed to access camera:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to access camera. Please check permissions.";
      error = errorMessage;
      isLoading = false;
      onCameraError(err instanceof Error ? err : new Error(errorMessage));
    }
  }

  async function switchCamera(deviceId: string) {
    selectedCameraId = deviceId;
    await startCamera(deviceId);
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      stream = null;
    }

    if (videoElement) {
      videoElement.srcObject = null;
    }

    isCameraActive = false;
  }

  // Effect to attach stream when video element becomes available
  $effect(() => {
    if (videoElement && stream && !videoElement.srcObject) {
      videoElement.srcObject = stream;
      videoElement
        .play()
        .then(() => {
          isCameraActive = true;
        })
        .catch((err) => {
          console.error("❌ Failed to play video in effect:", err);
          // Without this the user is stuck on "Camera initializing..." with
          // no explanation — surface the failure and offer the retry path.
          error =
            "Couldn't start the camera preview: " +
            (err instanceof Error ? err.message : String(err));
          isLoading = false;
        });
    }
  });

  // Lifecycle
  onMount(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      error = "Camera access is not supported in this browser.";
      isLoading = false;
      return;
    }

    await getAvailableCameras();
    await startCamera();
  });

  onDestroy(() => {
    isDestroyed = true;
    stopCamera();
  });
</script>

<div class="video-feed-panel">
  <div class="video-container">
    <!-- Video element - ALWAYS render so it's available for stream attachment -->
    <video
      bind:this={videoElement}
      class="video-feed"
      class:active={isCameraActive}
      class:mirrored={isMirrored}
      autoplay
      playsinline
      muted
      aria-hidden="true"
    ></video>

    <!-- Settings button - always visible when camera is active -->
    {#if isCameraActive}
      <button
        class="settings-button"
        onclick={openSettings}
        title={t("create_ui_camera_settings")}
        aria-label={t("create_ui_open_camera_settings")}
      >
        <span class="settings-icon" aria-hidden="true">⚙️</span>
      </button>
    {/if}

    <!-- Overlays for different states -->
    {#if isLoading}
      <div class="state-overlay loading-state">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
        <p>{t("create_ui_accessing_camera")}</p>
      </div>
    {:else if error}
      <div class="state-overlay error-state" role="alert" aria-live="assertive">
        <div class="error-icon">📷</div>
        <p class="error-message">{error}</p>
        <button class="retry-button" onclick={() => startCamera()}>
          Try Again
        </button>
      </div>
    {:else if !isCameraActive}
      <div class="state-overlay inactive-overlay">
        <p>{t("create_ui_camera_initializing")}</p>
      </div>
    {/if}
  </div>

  <!-- Camera Settings Dialog -->
  <CameraSettingsDialog
    isOpen={isSettingsOpen}
    {isMirrored}
    {availableCameras}
    {selectedCameraId}
    onClose={closeSettings}
    onMirrorToggle={toggleMirror}
    onCameraChange={handleCameraChange}
  />
</div>

<style>
  .video-feed-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--surface-dark, #1a1a1a);
    border-radius: var(--border-radius-lg, 12px);
    overflow: hidden;
  }

  .video-container {
    position: relative;
    width: 100%;
    aspect-ratio: 1; /* Square aspect ratio for consistent layout */
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-darker, #0a0a0a);
    border-radius: var(--border-radius-lg, 12px);
    overflow: hidden;
  }

  .video-feed {
    width: 100%;
    height: 100%;
    object-fit: cover; /* Cover to fill square container */
    background: #000;
    display: block;
    transition: transform var(--duration-emphasis) ease;
  }

  .video-feed.active {
    opacity: 1;
  }

  .video-feed.mirrored {
    transform: scaleX(-1);
  }

  .settings-button {
    position: absolute;
    top: var(--spacing-md, 16px);
    right: var(--spacing-md, 16px);
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    background: var(--surface-glass, rgba(0, 0, 0, 0.6));
    border: 1px solid var(--theme-stroke);
    border-radius: var(--border-radius-md, 8px);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-normal) ease;
    z-index: 10;
  }

  .settings-button:hover {
    background: var(--surface-glass-hover, rgba(0, 0, 0, 0.8));
    border-color: var(
      --theme-accent,
      var(--primary-color, var(--semantic-info))
    );
    transform: translateY(-2px);
  }

  .settings-button:active {
    transform: translateY(0);
  }

  .settings-icon {
    font-size: var(--font-size-2xl);
  }

  .state-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 1;
  }

  .state-overlay > * {
    pointer-events: auto;
  }

  .inactive-overlay {
    background: color-mix(in srgb, var(--theme-shadow) 70%, transparent);
    color: var(--theme-text, white);
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md, 16px);
    color: var(--theme-text, var(--foreground, #ffffff));
    padding: var(--spacing-xl, 32px);
    text-align: center;
  }

  .error-icon {
    font-size: var(--font-size-3xl);
    opacity: 0.5;
  }

  .error-message {
    max-width: 400px;
    line-height: 1.5;
    color: var(--semantic-error, var(--error, var(--semantic-error)));
  }

  .retry-button {
    padding: var(--spacing-sm, 8px) var(--spacing-lg, 24px);
    background: var(--primary-color, var(--semantic-info));
    color: var(--theme-text, white);
    border: none;
    border-radius: var(--border-radius-md, 8px);
    cursor: pointer;
    font-size: var(--font-size-md);
    transition: all var(--duration-normal) ease;
  }

  .retry-button:hover {
    background: var(--primary-color-hover, #2563eb);
    transform: translateY(-2px);
  }

  .retry-button:active {
    transform: translateY(0);
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .settings-button {
      width: var(--min-touch-target);
      height: var(--min-touch-target);
      top: var(--spacing-sm, 8px);
      right: var(--spacing-sm, 8px);
    }

    .settings-icon {
      font-size: var(--font-size-xl);
    }
  }

  .settings-button:focus-visible {
    outline: 2px solid var(--theme-accent, var(--semantic-info));
    outline-offset: 2px;
  }

  .retry-button:focus-visible {
    outline: 2px solid var(--theme-accent, var(--semantic-info));
    outline-offset: 2px;
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .video-feed,
    .settings-button,
    .retry-button {
      transition: none;
    }
  }
</style>
