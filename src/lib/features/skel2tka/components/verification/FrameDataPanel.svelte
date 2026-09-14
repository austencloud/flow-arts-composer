<!--
  FrameDataPanel - Structured data display for the current frame

  Shows hand positions, confidence values, grid locations,
  and which beat the current frame belongs to.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import type { DetectionFrame } from "$lib/shared/train/domain/detection-frame";
  import type { DetectedBeat } from "../../domain/models";

  let {
    frame,
    frameIndex,
    totalFrames,
    timestamp,
    beats,
  }: {
    frame: DetectionFrame | null;
    frameIndex: number;
    totalFrames: number;
    timestamp: number;
    beats: DetectedBeat[];
  } = $props();

  const currentStep = $derived(
    beats.find((b) => timestamp >= b.startTime && timestamp <= b.endTime) ?? null
  );

  function formatConfidence(confidence: number): string {
    return `${Math.round(confidence * 100)}%`;
  }

  function confidenceClass(confidence: number): string {
    if (confidence >= 0.8) return "high";
    if (confidence >= 0.6) return "medium";
    return "low";
  }
</script>

<div class="frame-data-panel">
  <div class="panel-header">
    <span class="frame-counter">
      {t('skel2tka_frame_counter', { current: String(frameIndex + 1), total: String(totalFrames) })}
    </span>
    <span class="timestamp">{timestamp.toFixed(3)}s</span>
  </div>

  {#if frame}
    <div class="hand-data">
      {#each [{ key: "left" as const, label: "Left", color: "var(--prop-blue, #3b82f6)" }, { key: "right" as const, label: "Right", color: "var(--prop-red, #ef4444)" }] as hand}
        {@const detection = frame[hand.key]}
        <div class="hand-row">
          <span class="hand-dot" style="background: {hand.color}"></span>
          {#if detection}
            <span class="grid-location">{detection.quadrant.toUpperCase()}</span>
            <span class="confidence {confidenceClass(detection.confidence)}">
              {formatConfidence(detection.confidence)}
            </span>
            <span class="raw-pos">
              ({detection.rawPosition.x.toFixed(2)}, {detection.rawPosition.y.toFixed(2)})
            </span>
          {:else}
            <span class="not-detected">{t('skel2tka_not_detected')}</span>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="no-data">{t('skel2tka_no_detection_data')}</div>
  {/if}

  {#if currentStep}
    <div class="beat-info">
      <span class="beat-label">{t('skel2tka_beat_label', { beat: String(currentStep.index + 1) })}</span>
      {#if currentStep.positionLabel}
        <span class="position-label {currentStep.positionLabel}">
          {currentStep.positionLabel}
        </span>
      {/if}
      <span class="beat-time">
        {currentStep.startTime.toFixed(2)}s - {currentStep.endTime.toFixed(2)}s
      </span>
    </div>
  {/if}
</div>

<style>
  .frame-data-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    font-size: var(--font-size-compact, 12px);
    font-family: monospace;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .frame-counter {
    font-variant-numeric: tabular-nums;
  }

  .timestamp {
    font-variant-numeric: tabular-nums;
  }

  .hand-data {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .hand-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--theme-text, #ffffff);
  }

  .hand-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .grid-location {
    font-weight: 600;
    min-width: 24px;
  }

  .confidence {
    font-variant-numeric: tabular-nums;
  }

  .confidence.high {
    color: var(--semantic-success, #22c55e);
  }

  .confidence.medium {
    color: var(--semantic-warning, #f59e0b);
  }

  .confidence.low {
    color: var(--semantic-error, #ef4444);
  }

  .raw-pos {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    margin-left: auto;
  }

  .not-detected {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
    font-style: italic;
  }

  .no-data {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
    font-style: italic;
    text-align: center;
    padding: 8px;
  }

  .beat-info {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 6px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #ffffff);
  }

  .step-label {
    font-weight: 600;
  }

  .position-label {
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: capitalize;
  }

  .position-label.alpha {
    background: rgba(59, 130, 246, 0.2);
    color: #3b82f6;
  }

  .position-label.beta {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .position-label.gamma {
    background: rgba(245, 158, 11, 0.2);
    color: #f59e0b;
  }

  .beat-time {
    margin-left: auto;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-variant-numeric: tabular-nums;
  }
</style>
