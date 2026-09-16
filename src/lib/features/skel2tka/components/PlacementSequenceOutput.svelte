<!--
  PlacementSequenceOutput - Beat sequence displayed as placement badges

  Shows each detected beat as a badge with the placement label (alpha, beta, gamma)
  and the blue/red grid locations. Provides a textual summary of the sequence.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import type { DetectedBeat } from "../domain/models";

  interface Props {
    beats: DetectedBeat[];
  }

  const { beats }: Props = $props();

  function formatTime(seconds: number): string {
    const s = seconds.toFixed(1);
    return `${s}s`;
  }

  /** Color for placement labels */
  function placementColor(label: string | null): string {
    switch (label) {
      case "alpha":
        return "#3b82f6";
      case "beta":
        return "#22c55e";
      case "gamma":
        return "#f59e0b";
      default:
        return "#6b7280";
    }
  }
</script>

<div class="sequence-output">
  <h3 class="section-title">{t('skel2tka_detected_beats', { count: String(beats.length) })}</h3>

  {#if beats.length === 0}
    <p class="empty-state">{t('skel2tka_no_beats')}</p>
  {:else}
    <div class="beat-list">
      {#each beats as beat}
        <div class="step-card">
          <div class="beat-header">
            <span class="beat-number">{t('skel2tka_beat_number', { beat: String(beat.index + 1) })}</span>
            <span class="beat-time">
              {formatTime(beat.startTime)} - {formatTime(beat.endTime)}
            </span>
          </div>

          <div class="beat-body">
            {#if beat.placementLabel}
              <span
                class="placement-badge"
                style="--badge-color: {placementColor(beat.placementLabel)}"
              >
                {beat.placementLabel}
              </span>
            {:else}
              <span class="placement-badge unknown">?</span>
            {/if}

            <div class="hand-positions">
              {#each beat.positions as pos}
                <span class="hand-label" class:blue={pos.hand === "left"} class:red={pos.hand === "right"}>
                  {pos.hand}: {pos.location.toUpperCase()}
                  <span class="confidence">({(pos.confidence * 100).toFixed(0)}%)</span>
                </span>
              {/each}
            </div>
          </div>

          <div class="beat-meta">
            {t('skel2tka_frame_count', { count: String(beat.frameCount) })}
          </div>
        </div>
      {/each}
    </div>

    <div class="summary">
      <span class="summary-label">{t('skel2tka_sequence_label')}</span>
      <span class="summary-value">
        {beats.map((b) => b.placementLabel ?? "?").join(" -> ")}
      </span>
    </div>
  {/if}
</div>

<style>
  .sequence-output {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    margin: 0;
  }

  .empty-state {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    margin: 0;
  }

  .beat-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .step-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    min-width: 120px;
  }

  .beat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .beat-number {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .beat-time {
    font-size: var(--font-size-xs, 11px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .beat-body {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .placement-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: white;
    background: var(--badge-color, #6b7280);
    text-transform: capitalize;
  }

  .placement-badge.unknown {
    background: #6b7280;
  }

  .hand-positions {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .hand-label {
    font-size: var(--font-size-xs, 11px);
    text-transform: capitalize;
  }

  .hand-label.blue {
    color: var(--prop-blue, #4a90d9);
  }

  .hand-label.red {
    color: var(--prop-red, #d94a4a);
  }

  .confidence {
    opacity: 0.6;
  }

  .beat-meta {
    font-size: var(--font-size-xs, 11px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.35));
  }

  .summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .summary-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    white-space: nowrap;
  }

  .summary-value {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text, #ffffff);
    font-family: monospace;
    word-break: break-all;
  }
</style>
