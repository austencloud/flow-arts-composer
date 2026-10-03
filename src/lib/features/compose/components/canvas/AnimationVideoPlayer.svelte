<!--
  AnimationVideoPlayer.svelte

  Handles animation playback with two modes:
  1. Live Preview - Real-time rendering (shows immediately)
  2. Video Playback - Pre-rendered video (generated in background)

  Flow:
  1. User sees live preview immediately (real-time trail drawing)
  2. Cached video, when available, allows switching to video playback
  3. Video plays back smoothly, regardless of device
-->
<script lang="ts">
  import { getErrorHandler } from "$lib/shared/application/get-error-handler";
  import { onMount, onDestroy } from "svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { VideoRenderProgress, VideoRenderResult } from "$lib/shared/animation-engine/services/video-pre-renderer";
  import { getVideoPlayer } from "../../services/video-player";
  import { getVideoGenerationCoordinator } from "../../services/video-generation-coordinator";
  import VideoGenerationStatus from "../video-player/VideoGenerationStatus.svelte";
  import VideoReadyNotification from "../video-player/VideoReadyNotification.svelte";
  import PlaybackModeToggle from "../video-player/PlaybackModeToggle.svelte";

  // Props
  let {
    sequenceData = null,
    isPlaying = $bindable(false),
    speed = 1.0,
    autoGenerateVideo = false,
    onVideoReady = () => {},
    onModeChange = () => {},
    onStepChange = () => {},
  }: {
    sequenceData?: SequenceData | null;
    isPlaying?: boolean;
    speed?: number;
    autoGenerateVideo?: boolean;
    onVideoReady?: (result: VideoRenderResult) => void;
    onModeChange?: (mode: "live" | "video") => void;
    onStepChange?: (beat: number) => void;
  } = $props();

  // State
  let playbackMode = $state<"live" | "video">("live");
  let videoResult = $state<VideoRenderResult | null>(null);
  let isGeneratingVideo = $state(false);
  let videoProgress = $state<VideoRenderProgress | null>(null);
  let videoElement: HTMLVideoElement | null = $state(null);
  let hasError = $state(false);

  // Derived UX states
  const isLoading = $derived(isGeneratingVideo && videoProgress !== null);
  const isEmpty = $derived(!sequenceData);

  // Services
  const playbackService = getVideoPlayer();
  const generationCoordinator = getVideoGenerationCoordinator();
  const errorHandler = getErrorHandler();

  // Timer refs for cleanup
  let switchToVideoTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(async () => {
    if (sequenceData) {
      const cached = await generationCoordinator.checkCachedVideo(sequenceData);
      if (cached) {
        videoResult = cached;
        onVideoReady(cached);
      } else if (autoGenerateVideo) {
        startVideoGeneration();
      }
    }
  });

  // Clean up on destroy
  onDestroy(() => {
    playbackService.dispose();
    if (videoResult?.blobUrl) {
      URL.revokeObjectURL(videoResult.blobUrl);
    }
    if (switchToVideoTimer !== null) {
      clearTimeout(switchToVideoTimer);
    }
  });

  // Watch for sequence changes
  $effect(() => {
    if (sequenceData) {
      // Reset state for new sequence
      playbackMode = "live";
      videoResult = null;
      videoProgress = null;

      generationCoordinator.checkCachedVideo(sequenceData).then((cached) => {
        if (cached) {
          videoResult = cached;
          onVideoReady(cached);
        }
      });
    }
  });

  // Initialize playback service when video element is available
  $effect(() => {
    if (videoElement) {
      playbackService.initialize(videoElement);
    }
  });

  // Sync video playback with isPlaying
  $effect(() => {
    if (playbackMode === "video" && videoElement) {
      if (isPlaying) {
        playbackService.play();
        playbackService.startStepTracking(onStepChange);
      } else {
        playbackService.pause();
        playbackService.stopBeatTracking();
      }
    }
  });

  // Sync video playback rate with speed (BPM)
  $effect(() => {
    if (videoElement) {
      playbackService.setPlaybackRate(speed);
    }
  });

  /**
   * Start generating video in the background
   */
  async function startVideoGeneration() {
    if (!sequenceData || isGeneratingVideo) return;

    hasError = false;
    isGeneratingVideo = true;
    videoProgress = {
      currentFrame: 0,
      totalFrames: 0,
      percent: 0,
      estimatedTimeRemaining: 0,
      phase: "rendering",
    };

    try {
      const result = await generationCoordinator.generateVideo(
        sequenceData,
        {
          fps: 60,
          quality: 0.9,
          width: 500,
          height: 500,
        },
        (progress) => {
          videoProgress = progress;
        }
      );

      videoResult = result;
      onVideoReady(result);
    } catch (error) {
      hasError = true;
      errorHandler.showUserError({
        message: "Video generation failed. Try again or use live preview.",
        technicalDetails: error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error : new Error(String(error)),
        severity: "error",
        context: {
          module: "compose",
          action: "generateVideo",
        },
      });
    } finally {
      isGeneratingVideo = false;
      videoProgress = null;
    }
  }

  function cancelVideoGeneration() {
    generationCoordinator.cancelGeneration();
    isGeneratingVideo = false;
    videoProgress = null;
  }

  function switchToVideo() {
    if (videoResult?.blobUrl) {
      playbackMode = "video";
      onModeChange("video");
      // Auto-play video when switching to video mode
      if (switchToVideoTimer !== null) clearTimeout(switchToVideoTimer);
      switchToVideoTimer = setTimeout(() => {
        if (videoElement) {
          playbackService.seek(0);
          playbackService.play();
        }
        switchToVideoTimer = null;
      }, 50);
    }
  }

  function switchToLive() {
    playbackMode = "live";
    onModeChange("live");
  }

  function handleModeChange(mode: "live" | "video") {
    if (mode === "live") {
      switchToLive();
    } else {
      switchToVideo();
    }
  }

  // Handle video ended event - loop playback
  function handleVideoEnded() {
    if (videoElement && isPlaying) {
      playbackService.seek(0);
      playbackService.play();
    }
  }

  function handleVideoError(event: Event) {
    hasError = true;
    const video = event.target as HTMLVideoElement;
    const error = video.error;
    errorHandler.showUserError({
      message: "Video playback failed. Try switching to live preview.",
      technicalDetails: `code: ${error?.code}, message: ${error?.message}, blobUrl: ${videoResult?.blobUrl}, size: ${videoResult?.videoBlob?.size}`,
      error: error ? new Error(error.message) : new Error("Unknown video playback error"),
      severity: "error",
      context: {
        module: "compose",
        action: "videoPlayback",
        additionalData: {
          code: error?.code,
          blobUrl: videoResult?.blobUrl,
          videoSize: videoResult?.videoBlob?.size,
        },
      },
    });
  }

  // Handle video can play
  function handleCanPlay() {
    // Video is ready for playback
  }

  // Handle video loaded metadata
  function handleLoadedMetadata() {
    // Video metadata is now available
  }
</script>

<!-- Empty state: no sequence data provided -->
{#if isEmpty}
  <!-- No content to render - parent provides sequence data -->
{/if}

<!-- Loading state: video generation in progress -->
{#if isLoading}
  <VideoGenerationStatus
    progress={videoProgress!}
    onCancel={cancelVideoGeneration}
  />
{/if}

<!-- Video ready notification -->
{#if videoResult?.success && playbackMode === "live" && !isGeneratingVideo}
  <VideoReadyNotification onSwitchToVideo={switchToVideo} />
{/if}

<!-- Mode toggle (when video exists) -->
{#if videoResult?.success}
  <PlaybackModeToggle
    bind:currentMode={playbackMode}
    onModeChange={handleModeChange}
  />
{/if}

<!-- Video element (hidden when in live mode) -->
{#if videoResult?.blobUrl}
  <video
    bind:this={videoElement}
    src={videoResult.blobUrl}
    playsinline
    muted
    class="video-player"
    class:hidden={playbackMode !== "video"}
    onended={handleVideoEnded}
    onerror={handleVideoError}
    oncanplay={handleCanPlay}
    onloadedmetadata={handleLoadedMetadata}
  >
    <track kind="captions" />
  </video>
{/if}

<style>
  .video-player {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: inherit;
  }

  .video-player.hidden {
    display: none;
  }
</style>
