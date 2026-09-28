<!--
RecordPanel.svelte

Main panel for the Record tab.
Combines video feed with playback controls for practicing sequences.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
  import { onDestroy, onMount } from "svelte";
  import { Metronome } from "$lib/shared/audio/metronome";
  import { createRecordTabState } from "../state/record-tab-state.svelte";
  import RecordControls from "./RecordControls.svelte";
  import VideoFeedPanel from "./VideoFeedPanel.svelte";

  // Props
  const {
    sequence,
    onStepIndexChange,
  }: {
    sequence: SequenceData | null;
    onStepIndexChange?: (stepIndex: number) => void;
  } = $props();

  // State - initialized with null, $effect below syncs sequence prop
  const recordState = createRecordTabState(null);
  let metronome: Metronome | null = null;
  let playbackIntervalId: number | null = null;

  // Sync sequence changes (handles both initial and subsequent updates)
  $effect(() => {
    recordState.setSequence(sequence);
  });

  // Handle beat progression during playback
  $effect(() => {
    if (recordState.isPlaying) {
      startPlayback();
    } else {
      stopPlayback();
    }
  });

  // Notify parent of beat index changes
  $effect(() => {
    if (onStepIndexChange) {
      onStepIndexChange(recordState.currentStepIndex);
    }
  });

  function startPlayback() {
    if (playbackIntervalId !== null) {
      return; // Already playing
    }

    // Calculate interval based on BPM
    const millisecondsPerBeat = (60 / recordState.bpm) * 1000;

    // Start metronome if enabled
    if (recordState.isMetronomeEnabled && metronome) {
      const started = metronome.start(recordState.bpm, (_stepNumber) => {
        // Metronome handles its own beat scheduling
        // We sync our visual beat progression with it
      });
      if (!started) {
        showToast(
          "Metronome audio couldn't start. Playback continues without clicks.",
          "warning"
        );
      }
    }

    // Start visual beat progression
    playbackIntervalId = window.setInterval(() => {
      recordState.nextStep();

      // Stop if we've reached the end and looped back
      if (recordState.currentStepIndex === 0 && !recordState.isPlaying) {
        stopPlayback();
      }
    }, millisecondsPerBeat);
  }

  function stopPlayback() {
    if (playbackIntervalId !== null) {
      window.clearInterval(playbackIntervalId);
      playbackIntervalId = null;
    }

    if (metronome) {
      metronome.stop();
    }
  }

  function handlePlayPause() {
    recordState.togglePlayPause();
  }

  function handleSpeedChange(newBpm: number) {
    const wasPlaying = recordState.isPlaying;

    // Stop current playback
    if (wasPlaying) {
      recordState.pause();
    }

    // Update BPM
    recordState.setBpm(newBpm);

    // Restart if was playing
    if (wasPlaying) {
      recordState.play();
    }
  }

  function handleReset() {
    recordState.reset();
  }

  function handleMetronomeToggle(enabled: boolean) {
    recordState.setMetronomeEnabled(enabled);

    if (metronome) {
      metronome.setEnabled(enabled);
    }
  }

  // Lifecycle
  onMount(() => {
    metronome = new Metronome();
  });

  onDestroy(() => {
    stopPlayback();
    if (metronome) {
      metronome.dispose();
      metronome = null;
    }
  });
</script>

<div class="record-panel">
  {#if recordState.hasSequence}
    <div class="record-controls-body">
      <!-- Video feed -->
      <div class="video-section">
        <VideoFeedPanel
          onCameraReady={() => {}}
          onCameraError={(error) => console.error("Camera error:", error)}
        />
      </div>

      <!-- Controls -->
      <div class="controls-section">
        <RecordControls
          isPlaying={recordState.isPlaying}
          bpm={recordState.bpm}
          isMetronomeEnabled={recordState.isMetronomeEnabled}
          onPlayPause={handlePlayPause}
          onSpeedChange={handleSpeedChange}
          onReset={handleReset}
          onMetronomeToggle={handleMetronomeToggle}
        />
      </div>

      <!-- Beat progress indicator -->
      <div class="progress-section">
        <div class="progress-bar">
          <div
            class="progress-fill"
            style="width: {recordState.totalSteps > 0
              ? ((recordState.currentStepIndex + 1) / recordState.totalSteps) *
                100
              : 0}%"
          ></div>
        </div>
        <div class="progress-text">
          {t("create_record_beat_of", { number: recordState.currentStepIndex + 1, total: recordState.totalSteps })}
        </div>
      </div>
    </div>
  {:else}
    <div class="empty-state">
      <div class="empty-icon">🎥</div>
      <h3>{t("create_ui_no_sequence_to_practice")}</h3>
      <p>
        {t("create_review_create_or_select_a_sequence_from_the_construct_or_generate_tab_to_start_practicing")}
      </p>
    </div>
  {/if}
</div>

<style>
  .record-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--spacing-sm, 24px);
    background: var(
      --theme-panel-elevated-bg,
      var(--surface-glass, rgba(0, 0, 0, 0.3))
    );
    backdrop-filter: blur(10px);
    border-radius: var(--border-radius-lg, 12px);
    overflow-y: auto;
  }

  .record-controls-body {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .video-section {
    flex: 1;
    min-height: 300px;
  }

  .controls-section {
    flex-shrink: 0;
  }

  .progress-section {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background: var(--theme-card-bg, var(--surface-light, #333));
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(
      --gradient-primary,
      linear-gradient(
        90deg,
        var(--theme-accent, var(--semantic-info)),
        var(--theme-accent-strong, var(--theme-accent-strong))
      )
    );
    transition: width var(--duration-emphasis) ease;
  }

  .progress-text {
    text-align: center;
    font-size: var(--font-size-sm);
    color: var(
      --theme-text-dim,
      var(--foreground-muted, var(--theme-text-dim))
    );
    font-weight: 600;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    padding: var(--spacing-xl, 48px);
    color: var(--theme-text, var(--foreground, #ffffff));
  }

  .empty-icon {
    font-size: var(--font-size-3xl);
    opacity: 0.5;
    margin-bottom: var(--spacing-lg, 24px);
  }

  .empty-state h3 {
    font-size: var(--font-size-xl);
    font-weight: 700;
    margin-bottom: var(--spacing-md, 16px);
  }

  .empty-state p {
    font-size: var(--font-size-md);
    color: var(
      --theme-text-dim,
      var(--foreground-muted, var(--theme-text-dim))
    );
    max-width: 500px;
    line-height: 1.6;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .record-panel {
      padding: var(--spacing-md, 16px);
    }

    .video-section {
      min-height: 200px;
    }
  }
</style>
