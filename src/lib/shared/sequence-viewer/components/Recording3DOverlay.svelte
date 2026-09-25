<!--
  Recording3DOverlay.svelte

  Floating overlay for 3D video recording & export:
  - Countdown (3, 2, 1) before recording starts
  - Recording indicator (red dot + elapsed timer + stop button) during capture
  - Full-screen progress overlay during Pass 2 (deterministic render)
-->
<script lang="ts">
  import type { VideoExportProgress } from "$lib/shared/compose/domain/video-export-types";
  import ExportTakeover from "$lib/shared/video-export/components/ExportTakeover.svelte";
  import {
    toExportTakeoverPhase,
    exportPhaseLabelKey,
  } from "$lib/shared/video-export/services/export-takeover-phase";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import RenderFilmCard from "./record-scene/RenderFilmCard.svelte";
  import { getExportOptionsState } from "$lib/shared/animation-panel/state/export-options-state.svelte";
  interface Props {
    countdownValue: number;
    isRecording: boolean;
    elapsed: number;
    onStop: () => void;
    /** Pass 2 export state - when non-null, show full progress overlay */
    exportProgress: VideoExportProgress | null;
    isExporting: boolean;
    onCancelExport: () => void;
    /** Non-null between Stop and the offline render: the person is choosing
     *  how good the render should be, or backing out to record again. */
    pendingRender: { durationSeconds: number } | null;
    onConfirmRender: () => void;
    onDiscardRender: () => void;
  }

  let {
    countdownValue,
    isRecording,
    elapsed,
    onStop,
    exportProgress,
    isExporting,
    onCancelExport,
    pendingRender,
    onConfirmRender,
    onDiscardRender,
  }: Props = $props();

  const exportOptions = getExportOptionsState();

  // Pass 2 hands off to the shared, app-wide export takeover. Blocking the 3D
  // container alone was the bug: every control outside it stayed live while the
  // deterministic render read from the scene.
  const takeover = $derived(
    toExportTakeoverPhase(exportProgress, isExporting && !isRecording)
  );
  const takeoverLabel = $derived(takeover.labelKey ? t(takeover.labelKey) : "");

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m > 0
      ? `${m}:${String(s).padStart(2, "0")}`
      : `0:${String(s).padStart(2, "0")}`;
  }
</script>

{#if countdownValue > 0}
  <div class="overlay countdown-overlay" aria-live="assertive">
    {#key countdownValue}
      <div class="countdown-number">
        {countdownValue}
      </div>
    {/key}
  </div>
{/if}

{#if isRecording}
  <div class="overlay recording-badge" aria-live="polite">
    <div class="rec-dot"></div>
    <span class="rec-label">REC</span>
    <span class="rec-timer">{formatTime(elapsed)}</span>
    <button
      class="stop-btn"
      onclick={onStop}
      aria-label={t("viewer_ui_stop_recording")}
    >
      <div class="stop-icon"></div>
    </button>
  </div>
{/if}

{#if pendingRender && !isRecording}
  <div class="overlay export-overlay">
    <RenderFilmCard
      durationSeconds={pendingRender.durationSeconds}
      {exportOptions}
      onRender={onConfirmRender}
      onDiscard={onDiscardRender}
    />
  </div>
{/if}

<ExportTakeover
  phase={takeover.phase}
  progress={exportProgress?.progress ?? 0}
  phaseLabel={takeoverLabel}
  error={exportProgress?.error ?? null}
  onCancel={onCancelExport}
  label="Rendering your film"
/>

<style>
  .overlay {
    position: absolute;
    z-index: 20;
    pointer-events: none;
  }

  .countdown-overlay {
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
  }

  .countdown-number {
    font-size: 6rem;
    font-weight: 800;
    color: white;
    text-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
    animation: countdown-pop 0.8s ease-out;
    font-variant-numeric: tabular-nums;
  }

  @keyframes countdown-pop {
    0% {
      transform: scale(1.6);
      opacity: 0;
    }
    30% {
      transform: scale(1);
      opacity: 1;
    }
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0.3;
    }
  }

  .recording-badge {
    /* Anchored where the Record Scene pill lives, so recording reads as that
       control changing state. The top-left corner belongs to the performer
       selector and must stay visible while the camera path is captured. */
    bottom: var(--record-scene-bottom, 80px);
    right: var(--record-scene-right, 12px);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    border-radius: 20px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    pointer-events: auto;
  }

  .rec-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ef4444;
    box-shadow: 0 0 8px #ef4444;
    animation: rec-pulse 1.2s ease-in-out infinite;
  }

  @keyframes rec-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  .rec-label {
    font-size: 12px;
    font-weight: 700;
    color: #ef4444;
    letter-spacing: 0.5px;
  }

  .rec-timer {
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
    font-variant-numeric: tabular-nums;
  }

  .stop-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: none;
    background: #ef4444;
    cursor: pointer;
    margin-left: 4px;
    transition: background 0.15s;
  }

  .stop-btn:hover {
    background: #dc2626;
  }

  .stop-icon {
    width: 8px;
    height: 8px;
    background: white;
    border-radius: 1px;
  }

  .export-overlay {
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(12px);
    pointer-events: auto;
  }

  @media (max-width: 600px) {
    .recording-badge {
      right: 8px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .countdown-number {
      animation: none;
    }
    .rec-dot {
      animation: none;
    }
  }
</style>
