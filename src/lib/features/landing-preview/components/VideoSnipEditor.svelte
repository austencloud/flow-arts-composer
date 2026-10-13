<script lang="ts">
  /**
   * VideoSnipEditor
   *
   * Timeline-based editor for setting video in/out points.
   * Drag handles to define the playback range.
   */
  import type { VideoSnipData } from "../types";

  interface Props {
    videoUrl: string;
    initialSnip?: VideoSnipData;
    onApply: (snip: VideoSnipData) => void;
    onCancel: () => void;
  }

  let { videoUrl, initialSnip, onApply, onCancel }: Props = $props();

  // Video element and state
  let videoEl: HTMLVideoElement | undefined = $state();
  let duration = $state(0);
  let currentTime = $state(0);
  let isPlaying = $state(false);

  // Snip state (in seconds)
  let inPoint = $state(0);
  let outPoint = $state(0);
  $effect.pre(() => {
    inPoint = initialSnip?.inPoint ?? 0;
    outPoint = initialSnip?.outPoint ?? 0;
  });

  // Drag state
  let dragging: "in" | "out" | "playhead" | null = $state(null);
  let timelineEl: HTMLDivElement | undefined = $state();

  // Derived values
  const inPercent = $derived(duration > 0 ? (inPoint / duration) * 100 : 0);
  const outPercent = $derived(duration > 0 ? (outPoint / duration) * 100 : 100);
  const currentPercent = $derived(
    duration > 0 ? (currentTime / duration) * 100 : 0
  );
  const snippedDuration = $derived(outPoint - inPoint);

  // Format time as MM:SS.s
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(1).padStart(4, "0")}`;
  }

  // Handle video metadata loaded
  function handleLoadedMetadata() {
    if (videoEl) {
      duration = videoEl.duration;
      // Initialize out-point to end if not set
      if (!initialSnip) {
        outPoint = duration;
      }
    }
  }

  function handleTimeUpdate() {
    if (videoEl) {
      currentTime = videoEl.currentTime;

      // Enforce boundaries during playback
      if (currentTime >= outPoint) {
        videoEl.currentTime = inPoint;
      }
    }
  }

  // Timeline interaction
  function getTimeFromPosition(clientX: number): number {
    if (!timelineEl) return 0;
    const rect = timelineEl.getBoundingClientRect();
    const percent = Math.max(
      0,
      Math.min(1, (clientX - rect.left) / rect.width)
    );
    return percent * duration;
  }

  function handlePointerDown(
    e: PointerEvent,
    target: "in" | "out" | "playhead"
  ) {
    e.preventDefault();
    dragging = target;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!dragging) return;

    const time = getTimeFromPosition(e.clientX);

    if (dragging === "in") {
      // In-point can't go past out-point minus 0.5s minimum
      inPoint = Math.max(0, Math.min(time, outPoint - 0.5));
    } else if (dragging === "out") {
      // Out-point can't go before in-point plus 0.5s minimum
      outPoint = Math.min(duration, Math.max(time, inPoint + 0.5));
    } else if (dragging === "playhead") {
      // Playhead moves freely within snip range
      const clampedTime = Math.max(inPoint, Math.min(time, outPoint));
      if (videoEl) {
        videoEl.currentTime = clampedTime;
      }
    }
  }

  function handlePointerUp() {
    dragging = null;
  }

  // Playback controls
  function togglePlay() {
    if (!videoEl) return;

    if (isPlaying) {
      videoEl.pause();
    } else {
      // Start from in-point if before it
      if (videoEl.currentTime < inPoint || videoEl.currentTime >= outPoint) {
        videoEl.currentTime = inPoint;
      }
      videoEl.play();
    }
    isPlaying = !isPlaying;
  }

  function seekToIn() {
    if (videoEl) {
      videoEl.currentTime = inPoint;
      currentTime = inPoint;
    }
  }

  function seekToOut() {
    if (videoEl) {
      videoEl.currentTime = outPoint - 0.1;
      currentTime = outPoint - 0.1;
    }
  }

  function setInAtCurrent() {
    if (currentTime < outPoint - 0.5) {
      inPoint = currentTime;
    }
  }

  function setOutAtCurrent() {
    if (currentTime > inPoint + 0.5) {
      outPoint = currentTime;
    }
  }

  // Apply snip
  function handleApply() {
    onApply({
      inPoint,
      outPoint,
      duration,
    });
  }

  // Keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onCancel();
    } else if (e.key === " ") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "i" || e.key === "I") {
      setInAtCurrent();
    } else if (e.key === "o" || e.key === "O") {
      setOutAtCurrent();
    } else if (e.key === "Enter") {
      handleApply();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="snip-editor">
  <header class="snip-header">
    <h2>Trim Video</h2>
    <button class="close-btn" onclick={onCancel} aria-label="Cancel">
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
  </header>

  <div class="video-container">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={videoEl}
      src={videoUrl}
      onloadedmetadata={handleLoadedMetadata}
      ontimeupdate={handleTimeUpdate}
      onplay={() => (isPlaying = true)}
      onpause={() => (isPlaying = false)}
      playsinline
    ></video>
  </div>

  <div class="controls">
    <!-- Playback controls -->
    <div class="playback-controls">
      <button class="control-btn" onclick={seekToIn} title="Go to in-point">
        <i class="fas fa-step-backward" aria-hidden="true"></i>
      </button>
      <button
        class="control-btn play-btn"
        onclick={togglePlay}
        title={isPlaying ? "Pause" : "Play"}
      >
        <i class="fas {isPlaying ? 'fa-pause' : 'fa-play'}" aria-hidden="true"
        ></i>
      </button>
      <button class="control-btn" onclick={seekToOut} title="Go to out-point">
        <i class="fas fa-step-forward" aria-hidden="true"></i>
      </button>
    </div>

    <!-- Timeline -->
    <div
      class="timeline"
      bind:this={timelineEl}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointerleave={handlePointerUp}
      role="slider"
      tabindex="0"
      aria-label="Video timeline"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={currentTime}
    >
      <!-- Selected range -->
      <div
        class="selected-range"
        style="left: {inPercent}%; width: {outPercent - inPercent}%;"
      ></div>

      <!-- In handle -->
      <button
        class="handle in-handle"
        style="left: {inPercent}%;"
        onpointerdown={(e) => handlePointerDown(e, "in")}
        aria-label="In point: {formatTime(inPoint)}"
      >
        <span class="handle-label">I</span>
      </button>

      <!-- Out handle -->
      <button
        class="handle out-handle"
        style="left: {outPercent}%;"
        onpointerdown={(e) => handlePointerDown(e, "out")}
        aria-label="Out point: {formatTime(outPoint)}"
      >
        <span class="handle-label">O</span>
      </button>

      <!-- Playhead -->
      <button
        class="playhead"
        style="left: {currentPercent}%;"
        onpointerdown={(e) => handlePointerDown(e, "playhead")}
        aria-label="Current time: {formatTime(currentTime)}"
      ></button>
    </div>

    <!-- Time display -->
    <div class="time-display">
      <span class="time-value in-time">{formatTime(inPoint)}</span>
      <span class="time-separator">→</span>
      <span class="time-value out-time">{formatTime(outPoint)}</span>
      <span class="duration">({formatTime(snippedDuration)})</span>
    </div>

    <!-- Set in/out buttons -->
    <div class="mark-controls">
      <button
        class="mark-btn"
        onclick={setInAtCurrent}
        title="Set in-point at current time (I)"
      >
        <i class="fas fa-sign-in-alt" aria-hidden="true"></i>
        Mark In
      </button>
      <span class="current-time">{formatTime(currentTime)}</span>
      <button
        class="mark-btn"
        onclick={setOutAtCurrent}
        title="Set out-point at current time (O)"
      >
        Mark Out
        <i class="fas fa-sign-out-alt" aria-hidden="true"></i>
      </button>
    </div>
  </div>

  <footer class="snip-footer">
    <button class="cancel-btn" onclick={onCancel}>Cancel</button>
    <button class="apply-btn" onclick={handleApply}>
      <i class="fas fa-check" aria-hidden="true"></i>
      Apply Trim
    </button>
  </footer>
</div>

<style>
  .snip-editor {
    position: fixed;
    inset: 0;
    z-index: var(--z-toast);
    background: rgba(0, 0, 0, 0.95);
    display: flex;
    flex-direction: column;
    color: var(--theme-text, white);
  }

  .snip-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .snip-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .close-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, white);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  }

  .close-btn:hover {
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .video-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    min-height: 0;
  }

  .video-container video {
    max-width: 100%;
    max-height: 100%;
    border-radius: 8px;
  }

  .controls {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
  }

  .playback-controls {
    display: flex;
    justify-content: center;
    gap: 12px;
  }

  .control-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, white);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard),
      filter var(--duration-fast) var(--ease-standard),
      width var(--duration-fast) var(--ease-standard),
      height var(--duration-fast) var(--ease-standard);
  }

  .control-btn:hover {
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
  }

  .control-btn.play-btn {
    width: 56px;
    height: 56px;
    font-size: 18px;
    background: var(--theme-accent, #6366f1);
    border-color: var(--theme-accent, #6366f1);
  }

  .control-btn.play-btn:hover {
    filter: brightness(1.1);
  }

  /* Timeline */
  .timeline {
    position: relative;
    height: 48px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    cursor: pointer;
    touch-action: none;
  }

  .selected-range {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 30%,
      transparent
    );
    border-radius: 8px;
  }

  .handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 16px;
    margin-left: -8px;
    background: var(--theme-accent, #6366f1);
    border: none;
    border-radius: 4px;
    cursor: ew-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
  }

  .handle:hover {
    filter: brightness(1.2);
  }

  .handle-label {
    font-size: 10px;
    font-weight: bold;
    color: white;
  }

  .in-handle {
    border-radius: 4px 0 0 4px;
  }

  .out-handle {
    border-radius: 0 4px 4px 0;
  }

  .playhead {
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 4px;
    margin-left: -2px;
    background: white;
    border: none;
    border-radius: 2px;
    cursor: ew-resize;
    box-shadow: 0 0 8px rgba(0, 0, 0, 0.5);
    touch-action: none;
  }

  .playhead::before {
    content: "";
    position: absolute;
    top: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 8px solid white;
  }

  /* Time display */
  .time-display {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    font-family: monospace;
    font-size: 16px;
  }

  .time-value {
    padding: 4px 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border-radius: 4px;
  }

  .in-time {
    color: var(--theme-accent-light, #a5b4fc);
  }

  .out-time {
    color: var(--theme-accent-light, #a5b4fc);
  }

  .time-separator {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .duration {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 14px;
  }

  /* Mark controls */
  .mark-controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
  }

  .mark-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, white);
    cursor: pointer;
    font-size: 14px;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
  }

  .mark-btn:hover {
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-color: var(--theme-accent, #6366f1);
  }

  .current-time {
    font-family: monospace;
    font-size: 14px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    min-width: 60px;
    text-align: center;
  }

  /* Footer */
  .snip-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 20px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .cancel-btn {
    padding: 12px 24px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: transparent;
    color: var(--theme-text, white);
    cursor: pointer;
    font-size: 14px;
  }

  .cancel-btn:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
  }

  .apply-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    border-radius: 8px;
    border: none;
    background: var(--theme-accent, #6366f1);
    color: white;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
  }

  .apply-btn:hover {
    filter: brightness(1.1);
  }
</style>
