<!--
CameraPreview.svelte

Camera feed component for the Train module.
Displays the camera feed and integrates with the CameraManager.
Features frame processing loop for pose estimation and overlay support.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    CameraManager,
    CAMERA_START_CANCELLED,
  } from "$lib/shared/train/services/camera-manager";
  import type { Snippet } from "svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  interface Props {
    onCameraReady?: () => void;
    onCameraError?: (error: string) => void;
    onFrame?: (video: HTMLVideoElement) => void;
    mirrored?: boolean;
    children?: Snippet;
  }

  let {
    onCameraReady,
    onCameraError,
    onFrame,
    mirrored = true,
    children,
  }: Props = $props();

  let videoContainer: HTMLDivElement;
  let videoElement: HTMLVideoElement | null = $state(null);
  let cameraService: CameraManager | null = $state(null);
  let isInitializing = $state(true);
  let errorMessage = $state<string | null>(null);
  let isActive = $state(false);
  // Guards the async init against unmount: if the component is destroyed while
  // getUserMedia is still pending (permission prompt open, fast toggle-off),
  // the resolved stream has no owner left — release it here or the camera
  // light stays on until page reload.
  let destroyed = false;

  async function initCamera() {
    isInitializing = true;
    errorMessage = null;

    try {
      cameraService = new CameraManager();
      await cameraService.initialize({ facingMode: "user" });
      if (destroyed) {
        cameraService.stop();
        return;
      }
      await cameraService.start();
      if (destroyed) {
        cameraService.stop();
        return;
      }

      videoElement = cameraService.getVideoElement();

      if (videoElement && videoContainer) {
        // Style the video element
        videoElement.style.width = "100%";
        videoElement.style.height = "100%";
        videoElement.style.objectFit = "cover";
        if (mirrored) {
          videoElement.style.transform = "scaleX(-1)";
        }
        videoContainer.appendChild(videoElement);
      }

      isActive = true;
      isInitializing = false;

      onCameraReady?.();

      // Pass video element to parent for external detection loop
      // (parent will start its own RAF loop - don't create a second one here)
      if (onFrame && videoElement) {
        onFrame(videoElement);
      }
    } catch (error) {
      isInitializing = false;
      // A start the manager cancelled for us — the preview unmounted, or a
      // newer start replaced this one — is not a failure the user should read
      // about. The camera it opened was already released.
      if (
        error instanceof Error &&
        error.name === CAMERA_START_CANCELLED
      ) {
        return;
      }
      const message =
        error instanceof Error ? error.message : t('train_camera_failed');
      errorMessage = message;
      onCameraError?.(message);
    }
  }

  function stopCamera() {
    isActive = false;
    if (cameraService) {
      cameraService.stop();
    }
    if (videoElement && videoContainer?.contains(videoElement)) {
      videoContainer.removeChild(videoElement);
    }
    videoElement = null;
  }

  onMount(() => {
    initCamera();
  });

  onDestroy(() => {
    destroyed = true;
    stopCamera();
  });
</script>

<!-- data-ghost-state="camera-live" is set only once the stream has actually
     started and the video element is attached — `isActive`, not "we pressed the
     button". The presentation-mode ghost says "Wait — can it see me?" and that
     line must never appear over a black rectangle or a permission failure.
     Austen (2026-08-05): "that should only happen if the camera properly
     connects." -->
<div
  class="camera-preview"
  data-ghost-state={isActive ? "camera-live" : undefined}
>
  <div class="video-container" bind:this={videoContainer}>
    {#if isInitializing}
      <div class="loading-state">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
        <p>{t('train_camera_initializing')}</p>
      </div>
    {/if}

    {#if errorMessage}
      <div class="error-state">
        <svg
          class="error-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p>{errorMessage}</p>
        <button class="retry-button" onclick={initCamera}> {t('train_camera_retry')} </button>
      </div>
    {/if}
  </div>

  <!-- Render children for overlays (like GridOverlay) -->
  <div class="overlay-container">
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>

<style>
  .camera-preview {
    position: relative;
    width: 100%;
    height: 100%;
    background: var(--theme-panel-bg);
    border-radius: var(--border-radius-lg, 12px);
    overflow: hidden;
  }

  .video-container {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .video-container :global(video) {
    border-radius: var(--border-radius-lg, 12px);
  }

  .loading-state,
  .error-state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md, 16px);
    color: var(--theme-text);
    background: color-mix(in srgb, var(--theme-shadow) 80%, transparent);
  }

  .error-icon {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    color: var(--semantic-error, var(--semantic-error));
  }

  .error-state p {
    text-align: center;
    max-width: 80%;
    opacity: 0.9;
  }

  .retry-button {
    padding: var(--spacing-sm, 8px) var(--spacing-lg, 24px);
    background: var(--semantic-info, var(--semantic-info));
    color: var(--theme-text, white);
    border: none;
    border-radius: var(--border-radius-md, 8px);
    cursor: pointer;
    font-size: var(--font-size-md);
    transition: all var(--duration-normal) ease;
  }

  .retry-button:hover {
    background: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 85%,
      #000
    );
    transform: translateY(-2px);
  }

  .retry-button:active {
    transform: translateY(0);
  }

  .overlay-container {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 10;
  }

  .overlay-container :global(*) {
    pointer-events: auto;
  }

</style>
