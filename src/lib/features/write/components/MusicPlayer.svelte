<!--
  MusicPlayer.svelte - Compact music player with playback controls

  Features:
  - Play/Pause/Stop transport controls
  - Timeline scrubber with seek
  - Time display (current / total)
  - Music file status indicator
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type { MusicPlayerState } from "../domain/types/write";
  import {
    createDefaultMusicPlayerState,
    formatTime,
  } from "../domain/types/write";
  import { onMount } from "svelte";

  interface Props {
    playerState?: MusicPlayerState;
    disabled?: boolean;
    compact?: boolean;
    onPlayRequested?: () => void;
    onPauseRequested?: () => void;
    onStopRequested?: () => void;
    onSeekRequested?: (position: number) => void;
  }

  let {
    playerState = createDefaultMusicPlayerState(),
    disabled = false,
    compact = false,
    onPlayRequested,
    onPauseRequested,
    onStopRequested,
    onSeekRequested,
  }: Props = $props();

  let isSeeking = $state(false);
  let seekPosition = $state(0);
  let hapticService: HapticFeedback;

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  function handlePlay() {
    if (disabled || !playerState.isLoaded) return;
    hapticService?.trigger("selection");
    onPlayRequested?.();
  }

  function handlePause() {
    if (disabled) return;
    hapticService?.trigger("selection");
    onPauseRequested?.();
  }

  function handleStop() {
    if (disabled) return;
    hapticService?.trigger("selection");
    onStopRequested?.();
  }

  function handleSeekStart() {
    if (disabled || !playerState.isLoaded) return;
    hapticService?.trigger("selection");
    isSeeking = true;
    seekPosition = playerState.currentTime;
  }

  function handleSeekEnd() {
    if (disabled || !playerState.isLoaded) return;
    hapticService?.trigger("selection");
    isSeeking = false;
    onSeekRequested?.(seekPosition);
  }

  function handleSliderInput(event: Event) {
    if (disabled || !playerState.isLoaded) return;
    const target = event.target as HTMLInputElement;
    const value = parseFloat(target.value);
    seekPosition = (value / 1000) * playerState.duration;
  }

  const sliderValue = $derived(
    !playerState.isLoaded || playerState.duration === 0
      ? 0
      : ((isSeeking ? seekPosition : playerState.currentTime) /
          playerState.duration) *
          1000
  );

  const currentTimeDisplay = $derived(
    formatTime(isSeeking ? seekPosition : playerState.currentTime)
  );

  const totalTimeDisplay = $derived(formatTime(playerState.duration));
</script>

<div class="music-player" class:disabled class:compact>
  <!-- Header row -->
  <div class="player-header">
    <div class="title">
      <i class="fas fa-music" aria-hidden="true"></i>
      <span>Music</span>
    </div>
    <div
      class="status"
      class:loaded={playerState.isLoaded}
      class:error={!!playerState.error}
    >
      {#if playerState.error}
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <span class="error-message" role="alert">{playerState.error}</span>
      {:else if playerState.isLoaded}
        <i class="fas fa-circle-check" aria-hidden="true"></i>
        <span class="filename">{playerState.filename || "Loaded"}</span>
      {:else}
        <span class="no-music">No music loaded</span>
      {/if}
    </div>
  </div>

  <!-- Timeline -->
  <div class="timeline">
    <input
      type="range"
      class="scrubber"
      min="0"
      max="1000"
      value={sliderValue}
      disabled={disabled || !playerState.isLoaded}
      oninput={handleSliderInput}
      onmousedown={handleSeekStart}
      onmouseup={handleSeekEnd}
      ontouchstart={handleSeekStart}
      ontouchend={handleSeekEnd}
      aria-label="Playback position"
    />
    <div class="time-display">
      <span class="current">{currentTimeDisplay}</span>
      <span class="separator">/</span>
      <span class="total">{totalTimeDisplay}</span>
    </div>
  </div>

  <!-- Transport controls -->
  <div class="transport">
    <button
      class="transport-btn"
      class:active={playerState.isPlaying}
      disabled={disabled || !playerState.isLoaded || playerState.isPlaying}
      onclick={handlePlay}
      aria-label="Play"
    >
      <i class="fas fa-play" aria-hidden="true"></i>
    </button>

    <button
      class="transport-btn"
      disabled={disabled || !playerState.isPlaying}
      onclick={handlePause}
      aria-label="Pause"
    >
      <i class="fas fa-pause" aria-hidden="true"></i>
    </button>

    <button
      class="transport-btn"
      disabled={disabled || !playerState.isLoaded}
      onclick={handleStop}
      aria-label="Stop"
    >
      <i class="fas fa-stop" aria-hidden="true"></i>
    </button>
  </div>
</div>

<style>
  .music-player {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-lg, 12px);
    transition: opacity var(--duration-normal) ease;
  }

  .music-player.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .music-player.compact {
    display: grid;
    grid-template-areas:
      "header transport"
      "timeline transport";
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px var(--spacing-xs);
    padding: var(--spacing-xs);
  }

  .music-player.compact .player-header {
    grid-area: header;
    min-width: 0;
  }

  .music-player.compact .title {
    display: none;
  }

  .music-player.compact .status,
  .music-player.compact .status > span {
    min-width: 0;
  }

  .music-player.compact .timeline {
    grid-area: timeline;
    gap: 2px;
    min-width: 0;
  }

  .music-player.compact .transport {
    grid-area: transport;
    align-self: center;
    gap: 4px;
  }

  /* Header */
  .player-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-md);
  }

  .title {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
  }

  .title i {
    color: var(--theme-accent, #f43f5e);
    font-size: 0.9rem;
  }

  .status {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .status.loaded {
    color: var(--semantic-success, #22c55e);
  }

  .status.error {
    color: var(--semantic-error, #ef4444);
  }

  .status.loaded i,
  .status.error i {
    font-size: 0.8rem;
  }

  .filename,
  .error-message {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .no-music {
    font-style: italic;
  }

  /* Timeline */
  .timeline {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .scrubber {
    width: 100%;
    height: 6px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 3px;
    outline: none;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    transition: opacity var(--duration-normal) ease;
  }

  .scrubber:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .scrubber::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    background: var(--theme-accent, #f43f5e);
    border: 2px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    border-radius: 50%;
    cursor: pointer;
    transition: transform var(--duration-fast) ease;
  }

  .scrubber:not(:disabled)::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }

  .scrubber::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: var(--theme-accent, #f43f5e);
    border: 2px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    border-radius: 50%;
    cursor: pointer;
  }

  .time-display {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .current {
    color: var(--theme-text, #ffffff);
  }

  .separator {
    opacity: 0.5;
  }

  /* Transport controls */
  .transport {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
  }

  .transport-btn {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 50%;
    color: var(--theme-text, #ffffff);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .transport-btn:hover:not(:disabled) {
    background: var(--theme-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    transform: scale(1.05);
  }

  .transport-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .transport-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .transport-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .transport-btn.active {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 40%,
      transparent
    );
    color: var(--semantic-success, #22c55e);
  }

  /* Responsive */
  @media (max-width: 480px) {
    .music-player {
      padding: var(--spacing-sm);
    }

    .player-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-xs);
    }

    .filename {
      max-width: 200px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .transport-btn,
    .scrubber::-webkit-slider-thumb {
      transition: none;
    }

    .transport-btn:hover:not(:disabled),
    .scrubber:not(:disabled)::-webkit-slider-thumb:hover {
      transform: none;
    }
  }
</style>
