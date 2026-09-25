<script lang="ts">
  /**
   * TimelineAudioTrack - Audio waveform integrated into timeline
   *
   * Shows audio waveform synchronized with timeline zoom and scroll.
   * Beat markers overlay on the waveform for visual alignment.
   */

  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { onDestroy } from "svelte";
  import WaveSurfer from "wavesurfer.js";
  import { getTimelineState } from "$lib/shared/animation-engine/state/timeline-state.svelte";
  import { getTimelinePlayer } from "../services/timeline-playback-service";
  import { generateStepTimestamps } from "$lib/features/compose/compose/phases/audio/bpm-analyzer";
  import { timeToPixels } from "$lib/shared/animation-engine/domain/timeline-types";

  interface Props {
    headerWidth: number;
  }

  let { headerWidth }: Props = $props();

  // Lazy access to state and playback service
  function getState() {
    return getTimelineState();
  }
  function getPlayback() {
    return getTimelinePlayer();
  }

  let waveformContainer = $state<HTMLDivElement>();
  let wavesurfer: WaveSurfer | null = null;
  let isReady = $state(false);
  let isLoadingAudio = $state(false);
  let audioElement: HTMLAudioElement | null = null;

  // Local reactive state (synced via effects)
  let hasAudio = $state(false);
  let fileName = $state<string | null>(null);
  let audioBpm = $state<number | null>(null);
  let audioDuration = $state(0);
  let pixelsPerSecond = $state(50);
  let totalDuration = $state(60);
  let playheadPosition = $state(0);
  let isPlaying = $state(false);
  let beatMarkers = $state<number[]>([]);
  let downbeats = $state<number[]>([]);
  let timelineWidth = $state(1000);

  // Sync local state from timeline state
  $effect(() => {
    const state = getState();
    hasAudio = state.project.audio.hasAudio;
    fileName = state.project.audio.fileName;
    audioBpm = state.project.audio.bpm;
    audioDuration = state.project.audio.duration;
    pixelsPerSecond = state.viewport.pixelsPerSecond;
    totalDuration = state.totalDuration;
    playheadPosition = state.playhead.position;
    isPlaying = state.playhead.isPlaying;
    timelineWidth = timeToPixels(totalDuration + 10, pixelsPerSecond);

    // Generate beat markers from BPM
    if (audioBpm && audioDuration) {
      beatMarkers = generateStepTimestamps(audioBpm, audioDuration);
      downbeats = beatMarkers.filter((_, i) => i % 4 === 0);
    } else {
      beatMarkers = [];
      downbeats = [];
    }
  });

  // Sync playback position to wavesurfer
  $effect(() => {
    if (!wavesurfer || !isReady) return;

    // Don't sync if wavesurfer is the source
    const wsTime = wavesurfer.getCurrentTime();
    const diff = Math.abs(playheadPosition - wsTime);

    if (diff > 0.1 && audioDuration > 0) {
      wavesurfer.seekTo(playheadPosition / audioDuration);
    }
  });

  // Sync play state
  $effect(() => {
    if (!wavesurfer || !isReady) return;

    if (isPlaying && !wavesurfer.isPlaying()) {
      wavesurfer.play();
    } else if (!isPlaying && wavesurfer.isPlaying()) {
      wavesurfer.pause();
    }
  });

  // Apply zoom changes to wavesurfer
  $effect(() => {
    if (!wavesurfer || !isReady) return;
    wavesurfer.zoom(pixelsPerSecond);
  });

  async function loadAudio(file: File) {
    if (!waveformContainer) return;

    isLoadingAudio = true;

    try {
      const audioUrl = URL.createObjectURL(file);

      // Initialize wavesurfer if not already
      if (!wavesurfer) {
        wavesurfer = WaveSurfer.create({
          container: waveformContainer,
          waveColor: "rgba(74, 158, 255, 0.4)",
          progressColor: "rgba(74, 158, 255, 0.7)",
          cursorColor: "transparent", // We use our own playhead
          cursorWidth: 0,
          barWidth: 2,
          barGap: 1,
          barRadius: 1,
          height: 48,
          normalize: true,
          backend: "WebAudio",
          minPxPerSec: pixelsPerSecond,
          fillParent: false,
          autoScroll: false,
          hideScrollbar: true,
        });

        // Wire up events
        wavesurfer.on("ready", () => {
          isReady = true;
          const duration = wavesurfer?.getDuration() ?? 0;
          getState().setAudioDuration(duration);

          // Get the audio element for playback sync
          audioElement = wavesurfer?.getMediaElement() ?? null;
          if (audioElement) {
            getPlayback().connectAudio(audioElement);
          }
        });

        wavesurfer.on("audioprocess", (time: number) => {
          // Only update if wavesurfer is the master (playing forward)
          if (wavesurfer?.isPlaying() && getPlayback().direction === 1) {
            getState().setPlayheadPosition(time);
          }
        });

        wavesurfer.on("seeking", (progress: number) => {
          const time = progress * (audioDuration || 0);
          getPlayback().seek(time);
        });
      }

      await wavesurfer.load(audioUrl);

      // Update project state
      getState().setAudioFile(file.name, audioUrl);
    } catch (error) {
      console.error("Failed to load audio:", error);
    } finally {
      isLoadingAudio = false;
    }
  }

  function removeAudio() {
    if (wavesurfer) {
      wavesurfer.destroy();
      wavesurfer = null;
    }
    if (audioElement) {
      getPlayback().disconnectAudio();
      audioElement = null;
    }
    isReady = false;
    getState().clearAudio();
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith("audio/")) {
      loadAudio(file);
    }
  }

  /**
   * Handle file input change
   */
  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      loadAudio(file);
    }
  }

  /**
   * Set BPM manually
   */
  function setBpm(bpm: number) {
    getState().setAudioBpm(bpm);
  }

  /**
   * Analyze BPM automatically
   */
  async function analyzeBpm() {
    if (!hasAudio) return;

    try {
      const { analyzeAudioBpm } =
        await import("$lib/features/compose/compose/phases/audio/bpm-analyzer");

      // Use the audio URL from state (would need to store this)
      // For now, this is a placeholder
      // TODO: Implement BPM analysis
    } catch (error) {
      console.error("BPM analysis failed:", error);
    }
  }

  onDestroy(() => {
    if (wavesurfer) {
      wavesurfer.destroy();
      wavesurfer = null;
    }
    if (audioElement) {
      getPlayback().disconnectAudio();
    }
  });
</script>

<div class="audio-track">
  <!-- Header (fixed left) -->
  <div class="audio-header" style="width: {headerWidth}px">
    <div class="header-content">
      <i class="fa-solid fa-waveform-lines" aria-hidden="true"></i>
      <span class="track-name">Audio</span>
    </div>

    <div class="header-controls">
      {#if hasAudio}
        <!-- BPM display/edit -->
        <div class="bpm-control">
          <input
            type="number"
            class="bpm-input"
            value={audioBpm ?? ""}
            placeholder="BPM"
            onchange={(e) =>
              setBpm(parseInt((e.target as HTMLInputElement).value))}
            min="40"
            max="240"
          />
        </div>

        <!-- Remove audio -->
        <button
          class="icon-btn danger"
          onclick={removeAudio}
          title={t("compose_ui_remove_audio")}
          aria-label={t("compose_ui_remove_audio")}
        >
          <i class="fa-solid fa-trash" aria-hidden="true"></i>
        </button>
      {:else}
        <!-- Add audio button -->
        <label class="add-audio-btn">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
          <input
            type="file"
            accept="audio/*"
            onchange={handleFileSelect}
            hidden
          />
        </label>
      {/if}
    </div>
  </div>

  <!-- Waveform content (scrolls with timeline) -->
  <div
    class="audio-content"
    ondragover={(e) => e.preventDefault()}
    ondrop={handleDrop}
    role="region"
    aria-label="Audio waveform"
  >
    {#if hasAudio}
      <div class="waveform-wrapper" style="width: {timelineWidth}px">
        <!-- Beat markers overlay -->
        {#if audioBpm}
          <div class="beat-markers">
            {#each downbeats as beatTime, index}
              {@const x = timeToPixels(beatTime, pixelsPerSecond)}
              <div
                class="beat-marker"
                style="left: {x}px"
                title="Measure {index + 1}"
              >
                <span class="measure-num">{index + 1}</span>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Wavesurfer container -->
        <div class="waveform-container" bind:this={waveformContainer}></div>

        <!-- Loading overlay -->
        {#if isLoadingAudio}
          <div class="loading-overlay">
            <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
            <span>{t("loading_audio")}</span>
          </div>
        {/if}
      </div>
    {:else}
      <!-- Empty state / drop zone -->
      <div class="empty-state">
        <i class="fa-solid fa-music" aria-hidden="true"></i>
        <span>Drop audio file here or click + to add</span>
      </div>
    {/if}
  </div>

  <!-- File name display -->
  {#if hasAudio && fileName}
    <div class="audio-footer">
      <span class="file-name">{fileName}</span>
      {#if audioBpm}
        <span class="bpm-badge">{audioBpm} BPM</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .audio-track {
    display: flex;
    flex-direction: column;
    background: var(--theme-card-bg);
    border-top: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  .audio-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border-right: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .header-content i {
    font-size: var(--font-size-compact);
    color: var(--theme-accent);
    opacity: 0.8;
  }

  .track-name {
    font-size: var(--font-size-compact);
    font-weight: 500;
    color: var(--theme-text);
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .bpm-control {
    display: flex;
    align-items: center;
  }

  .bpm-input {
    width: 48px;
    padding: 2px 4px;
    font-size: var(--font-size-compact);
    background: var(--theme-input-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 4px;
    color: var(--theme-text, var(--theme-text));
    text-align: center;
  }

  .bpm-input:focus {
    outline: none;
    border-color: var(--theme-accent);
  }

  .icon-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--theme-text-muted, var(--theme-text-dim));
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .icon-btn:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, var(--theme-text));
  }

  .icon-btn.danger:hover {
    background: rgba(255, 68, 68, 0.2);
    color: #ff6b6b;
  }

  .add-audio-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-accent);
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-size: var(--font-size-compact);
    transition: all var(--duration-fast) ease;
  }

  .add-audio-btn:hover {
    opacity: 0.8;
  }

  .audio-content {
    flex: 1;
    position: relative;
    min-height: 60px;
    overflow: hidden;
  }

  .waveform-wrapper {
    position: relative;
    height: 60px;
  }

  .waveform-container {
    height: 100%;
  }

  .beat-markers {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
  }

  .beat-marker {
    position: absolute;
    top: 0;
    width: 1px;
    height: 100%;
    background: rgba(139, 92, 246, 0.5);
  }

  .measure-num {
    position: absolute;
    top: 2px;
    left: 4px;
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: rgba(139, 92, 246, 0.8);
    user-select: none;
  }

  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.6);
    color: var(--theme-text-muted, var(--theme-text-dim));
    font-size: var(--font-size-compact);
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 100%;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    border: 2px dashed var(--theme-stroke, var(--theme-stroke));
    margin: 4px;
    border-radius: 4px;
    transition: all var(--duration-normal) ease;
  }

  .empty-state:hover {
    border-color: var(--theme-accent);
    color: var(--theme-text-muted, var(--theme-text-dim));
  }

  .audio-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    background: rgba(0, 0, 0, 0.2);
    border-top: 1px solid var(--theme-stroke);
  }

  .file-name {
    font-size: var(--font-size-compact);
    color: var(--theme-text-muted, var(--theme-text-dim));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bpm-badge {
    padding: 1px 6px;
    background: rgba(139, 92, 246, 0.25);
    border-radius: 4px;
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: rgba(167, 139, 250, 0.95);
  }
</style>
