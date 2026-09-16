<!--
  SyncedPlaybackView.svelte

  Side-by-side layout: video on the left, choreo card on the right.
  The choreo card highlights follow the video's beat map timestamps.
  Includes playback rate controls for BPM adjustment.
-->
<script lang="ts">
  import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import {
    getStepIndexFromVideo,
    seekTimeForStep,
  } from "$lib/shared/video-collaboration/utils/step-map-utils";
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import { formatTime } from "$lib/shared/sequence-viewer/utils/format-time";

  interface Props {
    videoUrl: string;
    videoDuration: number;
    sequence: SequenceData;
    beatMap: StepMap;
    onBackToMapping: () => void;
  }

  const { videoUrl, videoDuration, sequence, beatMap, onBackToMapping }: Props = $props();

  let videoEl: HTMLVideoElement | undefined = $state();
  let currentTime = $state(0);
  let isPlaying = $state(false);
  let playbackRate = $state(1.0);

  const playbackRates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  // The currently highlighted step index based on video time + beat map. Wraps
  // on a clip that runs the sequence more than once.
  const highlightedStep = $derived(getStepIndexFromVideo(currentTime, beatMap));

  // Estimate BPM from beat map (average interval between beats)
  const estimatedBpm = $derived.by(() => {
    const ts = beatMap.beatTimestamps;
    if (ts.length < 2) return 0;
    const totalInterval = ts[ts.length - 1]! - ts[0]!;
    const avgInterval = totalInterval / (ts.length - 1);
    return avgInterval > 0 ? Math.round(60 / avgInterval) : 0;
  });

  const effectiveBpm = $derived(
    estimatedBpm > 0 ? Math.round(estimatedBpm * playbackRate) : 0,
  );

  function handleTimeUpdate() {
    if (videoEl) currentTime = videoEl.currentTime;
  }

  function togglePlayPause() {
    if (!videoEl) return;
    if (isPlaying) {
      videoEl.pause();
    } else {
      videoEl.play();
    }
  }

  function handlePlay() {
    isPlaying = true;
  }

  function handlePause() {
    isPlaying = false;
  }

  function handleEnded() {
    isPlaying = false;
  }

  function setRate(rate: number) {
    playbackRate = rate;
    if (videoEl) videoEl.playbackRate = rate;
  }

  function handleSeek(event: Event) {
    const input = event.target as HTMLInputElement;
    const time = parseFloat(input.value);
    if (videoEl) {
      videoEl.currentTime = time;
      currentTime = time;
    }
  }

  function handleStepClick(stepIndex: number) {
    const at = seekTimeForStep(stepIndex, currentTime, beatMap);
    if (at === null || !videoEl) return;
    videoEl.currentTime = at;
    currentTime = at;
  }

</script>

<div class="synced-playback-view">
  <!-- Header -->
  <div class="playback-header">
    <button class="back-btn" onclick={onBackToMapping} type="button">
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
      Back to Mapping
    </button>
    <span class="header-title">Synced Preview</span>
  </div>

  <!-- Main content: side-by-side -->
  <div class="content-grid">
    <!-- Left: Video -->
    <div class="video-panel">
      <video
        bind:this={videoEl}
        src={videoUrl}
        playsinline
        ontimeupdate={handleTimeUpdate}
        onplay={handlePlay}
        onpause={handlePause}
        onended={handleEnded}
      >
        <track kind="captions" />
      </video>
    </div>

    <!-- Right: Choreo Card -->
    <div class="choreo-panel">
      <ChoreoCard
        {sequence}
        highlightedStepIndex={highlightedStep}
        showHighlight={true}
        onStepClick={handleStepClick}
        showWord={true}
        showStepNumbers={true}
        showDifficultyLevel={false}
        showNotes={false}
        showLoopGlyph={false}
        includeStartPlacement={true}
        darkMode={true}
      />
    </div>
  </div>

  <!-- Transport controls -->
  <div class="transport-bar">
    <button
      class="transport-btn play-btn"
      onclick={togglePlayPause}
      type="button"
      aria-label={isPlaying ? "Pause" : "Play"}
    >
      <i class="fas {isPlaying ? 'fa-pause' : 'fa-play'}" aria-hidden="true"></i>
    </button>

    <input
      type="range"
      class="seek-bar"
      min="0"
      max={videoDuration}
      step="0.01"
      value={currentTime}
      oninput={handleSeek}
      aria-label="Seek"
    />

    <span class="transport-time">
      {formatTime(currentTime)} / {formatTime(videoDuration)}
    </span>
  </div>

  <!-- BPM and playback rate controls -->
  <div class="rate-controls">
    <div class="rate-buttons">
      {#each playbackRates as rate}
        <button
          class="rate-btn"
          class:active={playbackRate === rate}
          onclick={() => setRate(rate)}
          type="button"
        >
          {rate}x
        </button>
      {/each}
    </div>

    {#if estimatedBpm > 0}
      <div class="bpm-display">
        {#if playbackRate !== 1.0}
          <span class="bpm-original">Original: {estimatedBpm} BPM</span>
          <span class="bpm-arrow">&#8594;</span>
        {/if}
        <span class="bpm-current">
          {effectiveBpm} BPM
        </span>
      </div>
    {/if}
  </div>

  <!-- Beat indicator -->
  <div class="beat-indicator">
    <!-- One dot per step, not per mark: a clip that runs the sequence four
         times holds four marks for every one of these. -->
    {#each { length: beatMap.stepCount || beatMap.beatTimestamps.length } as _dot, i}
      <div
        class="beat-dot"
        class:active={highlightedStep === i}
        class:past={highlightedStep > i}
      ></div>
    {/each}
  </div>
</div>

<style>
  .synced-playback-view {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    padding: 12px 16px;
  }


  .playback-header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    background: transparent;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
  }

  .back-btn:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #ffffff);
  }

  .header-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-text, #ffffff);
  }


  .content-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    flex: 1;
    min-height: 0;
  }

  .video-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
    border-radius: 10px;
    overflow: hidden;
    min-height: 0;
  }

  .video-panel video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .choreo-panel {
    display: flex;
    align-items: stretch;
    min-height: 0;
    overflow: auto;
    border-radius: 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
  }


  .transport-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .transport-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: filter 0.15s;
  }

  .transport-btn.play-btn {
    background: var(--theme-accent, #6366f1);
    color: #ffffff;
    font-size: 16px;
  }

  .transport-btn.play-btn:hover {
    filter: brightness(1.15);
  }

  .seek-bar {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    appearance: none;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    cursor: pointer;
  }

  .seek-bar::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--theme-accent, #6366f1);
    cursor: pointer;
  }

  .seek-bar::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: none;
    border-radius: 50%;
    background: var(--theme-accent, #6366f1);
    cursor: pointer;
  }

  .transport-time {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }


  .rate-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
  }

  .rate-buttons {
    display: flex;
    gap: 4px;
  }

  .rate-btn {
    padding: 6px 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: background 0.1s, border-color 0.1s;
  }

  .rate-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #ffffff);
  }

  .rate-btn.active {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 20%, transparent);
    border-color: var(--theme-accent, #6366f1);
    color: var(--theme-accent, #6366f1);
  }

  .bpm-display {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-compact, 12px);
  }

  .bpm-original {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .bpm-arrow {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
  }

  .bpm-current {
    color: var(--theme-accent, #6366f1);
    font-weight: 700;
  }


  .beat-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    flex-shrink: 0;
    padding: 4px 0;
  }

  .beat-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    transition: background 0.1s, transform 0.1s;
  }

  .beat-dot.past {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 40%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
  }

  .beat-dot.active {
    background: var(--theme-accent, #6366f1);
    border-color: var(--theme-accent, #6366f1);
    transform: scale(1.4);
    box-shadow: 0 0 8px color-mix(in srgb, var(--theme-accent, #6366f1) 60%, transparent);
  }

  /* ---- Responsive: stack on narrow screens ---- */

  @media (max-width: 640px) {
    .content-grid {
      grid-template-columns: 1fr;
    }

    .video-panel {
      max-height: 240px;
    }

    .choreo-panel {
      max-height: 300px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .beat-dot,
    .rate-btn,
    .back-btn,
    .transport-btn {
      transition: none !important;
    }

    .beat-dot.active {
      transform: none !important;
    }
  }
</style>
