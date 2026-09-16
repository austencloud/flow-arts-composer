<!--
  PhaseVerificationPanel - Accept, correct, or reject phase output

  Three actions:
  1. "Looks right" - accept the output as-is (training pair saved as accepted)
  2. "Wrong at beat N" - open correction UI for a specific beat
  3. "Try again" - reject and re-run the pipeline

  When correcting, shows a GridPlacementPicker for each hand per beat.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { DetectedBeat } from "../../domain/models";
  import type { PhaseVerdict, UserCorrection } from "../../domain/verification-models";
  import GridPlacementPicker from "./GridPlacementPicker.svelte";

  let {
    beats,
    onVerdict,
  }: {
    beats: DetectedBeat[];
    onVerdict: (verdict: PhaseVerdict, corrections: UserCorrection[]) => void;
  } = $props();

  let mode = $state<"choose" | "correcting">("choose");
  let correctingBeatIndex = $state(0);
  let corrections = $state<UserCorrection[]>([]);

  // Track corrected positions for the current beat
  let correctedLeft = $state<GridLocation | null>(null);
  let correctedRight = $state<GridLocation | null>(null);

  const currentStep = $derived(beats[correctingBeatIndex] ?? null);

  const detectedLeft = $derived<GridLocation | null>(
    currentStep?.positions.find((p) => p.hand === "left")?.location ?? null
  );

  const detectedRight = $derived<GridLocation | null>(
    currentStep?.positions.find((p) => p.hand === "right")?.location ?? null
  );

  function handleAccept() {
    onVerdict("accepted", []);
  }

  function handleReject() {
    onVerdict("rejected", []);
  }

  function startCorrection(stepNumber: number) {
    mode = "correcting";
    correctingBeatIndex = stepNumber;
    // Initialize with detected values
    correctedLeft = detectedLeft;
    correctedRight = detectedRight;
  }

  function saveCorrection() {
    if (!currentStep) return;

    // Only add corrections where the value actually changed
    if (correctedLeft && correctedLeft !== detectedLeft) {
      corrections.push({
        stepNumber: correctingBeatIndex,
        field: "hand_position",
        hand: "left",
        detectedValue: detectedLeft ?? "none",
        correctedValue: correctedLeft,
      });
    }

    if (correctedRight && correctedRight !== detectedRight) {
      corrections.push({
        stepNumber: correctingBeatIndex,
        field: "hand_position",
        hand: "right",
        detectedValue: detectedRight ?? "none",
        correctedValue: correctedRight,
      });
    }

    mode = "choose";
  }

  function submitCorrections() {
    onVerdict("corrected", corrections);
  }

  function cancelCorrection() {
    mode = "choose";
  }
</script>

<div class="verification-panel">
  {#if mode === "choose"}
    <div class="verdict-actions">
      <button class="verdict-btn accept" onclick={handleAccept}>
        <i class="fas fa-check"></i>
        {t('skel2tka_looks_right')}
      </button>

      <div class="beat-correction-list">
        <span class="section-label">{t('skel2tka_wrong_at_beat')}</span>
        <div class="beat-buttons">
          {#each beats as beat, i}
            <button
              class="beat-btn"
              class:has-correction={corrections.some((c) => c.stepNumber === i)}
              onclick={() => startCorrection(i)}
            >
              {i + 1}
            </button>
          {/each}
        </div>
      </div>

      {#if corrections.length > 0}
        <div class="correction-summary">
          <span>{t('skel2tka_corrections_pending', { count: String(corrections.length) })}</span>
          <button class="verdict-btn corrected" onclick={submitCorrections}>
            <i class="fas fa-paper-plane"></i>
            {t('skel2tka_submit_corrections')}
          </button>
        </div>
      {/if}

      <button class="verdict-btn reject" onclick={handleReject}>
        <i class="fas fa-redo"></i>
        {t('skel2tka_try_again')}
      </button>
    </div>

  {:else if mode === "correcting" && currentStep}
    <div class="correction-ui">
      <div class="correction-header">
        <h4>{t('skel2tka_correct_beat', { beat: String(correctingBeatIndex + 1) })}</h4>
        <span class="beat-time">
          {currentStep.startTime.toFixed(2)}s - {currentStep.endTime.toFixed(2)}s
        </span>
      </div>

      <div class="hand-pickers">
        <div class="picker-group">
          <span class="picker-label" style="color: var(--semantic-info);">{t('skel2tka_blue_hand')}</span>
          <span class="detected-value">
            {t('skel2tka_detected_value', { value: detectedLeft?.toUpperCase() ?? t('skel2tka_none') })}
          </span>
          <GridPlacementPicker
            selected={correctedLeft}
            hand="left"
            onSelect={(loc) => (correctedLeft = loc)}
          />
        </div>

        <div class="picker-group">
          <span class="picker-label" style="color: var(--semantic-error);">{t('skel2tka_red_hand')}</span>
          <span class="detected-value">
            {t('skel2tka_detected_value', { value: detectedRight?.toUpperCase() ?? t('skel2tka_none') })}
          </span>
          <GridPlacementPicker
            selected={correctedRight}
            hand="right"
            onSelect={(loc) => (correctedRight = loc)}
          />
        </div>
      </div>

      <div class="correction-actions">
        <button class="action-btn save" onclick={saveCorrection}>
          <i class="fas fa-save"></i>
          {t('skel2tka_save_correction')}
        </button>
        <button class="action-btn cancel" onclick={cancelCorrection}>
          {t('skel2tka_cancel')}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .verification-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
  }

  .verdict-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .verdict-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .verdict-btn.accept {
    background: color-mix(in srgb, var(--semantic-success, #22c55e) 10%, transparent);
    border-color: color-mix(in srgb, var(--semantic-success, #22c55e) 30%, transparent);
    color: var(--semantic-success, #22c55e);
  }

  .verdict-btn.accept:hover {
    background: color-mix(in srgb, var(--semantic-success, #22c55e) 20%, transparent);
  }

  .verdict-btn.corrected {
    background: color-mix(in srgb, var(--semantic-warning, #f59e0b) 10%, transparent);
    border-color: color-mix(in srgb, var(--semantic-warning, #f59e0b) 30%, transparent);
    color: var(--semantic-warning, #f59e0b);
  }

  .verdict-btn.corrected:hover {
    background: color-mix(in srgb, var(--semantic-warning, #f59e0b) 20%, transparent);
  }

  .verdict-btn.reject {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 6%, transparent);
    border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, transparent);
  }

  .verdict-btn.reject:hover {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 12%, transparent);
  }

  .beat-correction-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .beat-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .beat-btn {
    width: 32px;
    height: 32px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .beat-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .beat-btn.has-correction {
    border-color: color-mix(in srgb, var(--semantic-warning, #f59e0b) 50%, transparent);
    background: color-mix(in srgb, var(--semantic-warning, #f59e0b) 10%, transparent);
    color: var(--semantic-warning, #f59e0b);
  }

  .correction-summary {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--semantic-warning, #f59e0b);
  }

  .correction-ui {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .correction-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .correction-header h4 {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .beat-time {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-variant-numeric: tabular-nums;
  }

  .hand-pickers {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }

  .picker-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
  }

  .picker-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
  }

  .detected-value {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .correction-actions {
    display: flex;
    gap: 8px;
  }

  .action-btn {
    padding: 8px 16px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition: background 0.15s;
  }

  .action-btn.save {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.3);
    color: #3b82f6;
  }

  .action-btn.save:hover {
    background: rgba(59, 130, 246, 0.25);
  }

  .action-btn.cancel {
    background: transparent;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .action-btn.cancel:hover {
    background: rgba(255, 255, 255, 0.06);
  }
</style>
