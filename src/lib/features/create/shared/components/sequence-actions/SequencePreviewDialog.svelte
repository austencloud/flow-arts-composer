<!--
  SequencePreviewDialog.svelte

  A confirmation dialog that shows what sequence will be replaced and what it's being replaced with.
  Used when replacing an existing sequence in the Construct tab.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { Dialog as DialogPrimitive } from "bits-ui";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { onMount } from "svelte";
  import StepGrid from "../../workspace-panel/sequence-display/components/StepGrid.svelte";
  import { sequenceGridJoin } from "#lib/shared/grid-join/sequence-grid-join.js";

  let {
    isOpen = $bindable(false),
    currentSequence,
    incomingSequence,
    onConfirm,
    onCancel,
  } = $props<{
    isOpen?: boolean;
    currentSequence: SequenceData | null | undefined;
    incomingSequence: SequenceData | null;
    onConfirm: () => void;
    onCancel: () => void;
  }>();

  // Services
  let hapticService: HapticFeedback;

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  // Helper to get sequence display name
  function getSequenceName(seq: SequenceData | null | undefined): string {
    if (!seq) return t("create_sequence_preview_unknown");
    if (seq.word) return seq.word;
    if (seq.name) return seq.name;
    const count = seq.steps?.length ?? 0;
    return count > 0
      ? t(count === 1
          ? "create_sequence_preview_unnamed_one_step"
          : "create_sequence_preview_unnamed_steps", { count })
      : t("create_sequence_preview_empty");
  }

  function stepCountLabel(count: number): string {
    return t(count === 1
      ? "create_sequence_preview_one_step"
      : "create_sequence_preview_steps", { count });
  }

  // Derive display info
  const currentName = $derived(getSequenceName(currentSequence));
  const currentStepCount = $derived(currentSequence?.steps?.length ?? 0);
  const incomingName = $derived(getSequenceName(incomingSequence));
  const incomingStepCount = $derived(incomingSequence?.steps?.length ?? 0);

  // Calculate dynamic preview height based on sequence size
  function calcPreviewHeight(stepCount: number): number {
    if (stepCount === 0) return 120;
    const columns = Math.min(stepCount, 4);
    const rows = Math.ceil(stepCount / columns);
    // Smaller per-row height since we're showing two grids
    return Math.max(120, Math.min(250, rows * 55 + 20));
  }

  const currentPreviewHeight = $derived(calcPreviewHeight(currentStepCount));
  const incomingPreviewHeight = $derived(calcPreviewHeight(incomingStepCount));

  // Handle confirm button
  function handleConfirm() {
    hapticService?.trigger("success");
    onConfirm();
    isOpen = false;
  }

  // Handle cancel button
  function handleCancel() {
    hapticService?.trigger("selection");
    onCancel();
    isOpen = false;
  }

  // Handle open change from Bits UI
  function handleOpenChange(open: boolean) {
    if (!open && isOpen) {
      handleCancel();
    }
    isOpen = open;
  }
</script>

<DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class="preview-dialog-backdrop" />
    <DialogPrimitive.Content
      class="preview-dialog-container"
      data-testid="sequence-preview-dialog"
    >
      <!-- Header -->
      <div class="dialog-header">
        <span class="icon">⚠️</span>
        <DialogPrimitive.Title class="dialog-title">
          {t("create_review_replace_construct_sequence")}
        </DialogPrimitive.Title>
      </div>

      <!-- Two-column preview -->
      <div class="sequences-comparison">
        <!-- Current sequence (will be replaced) -->
        <div class="sequence-panel current" data-testid="current-sequence">
          <div class="panel-header">
            <span class="panel-label">{t("create_ui_will_be_replaced")}</span>
            <span class="step-count" data-testid="current-beat-count"
              >{stepCountLabel(currentStepCount)}</span
            >
          </div>
          <div class="sequence-name" data-testid="current-sequence-name">
            {currentName}
          </div>
          {#if currentSequence && (currentSequence.steps?.length > 0 || currentSequence.startPlacement)}
            <div
              class="beat-grid-preview"
              style:height="{currentPreviewHeight}px"
              data-testid="current-beat-grid"
            >
              <StepGrid
                steps={currentSequence.steps ?? []}
                gridJoin={sequenceGridJoin(currentSequence)}
                startPlacement={currentSequence.startPlacement ??
                  currentSequence.startingPlacement ??
                  null}
              />
            </div>
          {/if}
        </div>

        <!-- Arrow indicator -->
        <div class="arrow-indicator">
          <i class="fas fa-arrow-right" aria-hidden="true"></i>
        </div>

        <!-- Incoming sequence (will replace) -->
        <div class="sequence-panel incoming" data-testid="incoming-sequence">
          <div class="panel-header">
            <span class="panel-label">{t("create_ui_new_sequence")}</span>
            <span class="step-count" data-testid="incoming-beat-count"
              >{stepCountLabel(incomingStepCount)}</span
            >
          </div>
          <div class="sequence-name" data-testid="incoming-sequence-name">
            {incomingName}
          </div>
          {#if incomingSequence && (incomingSequence.steps?.length > 0 || incomingSequence.startPlacement)}
            <div
              class="beat-grid-preview"
              style:height="{incomingPreviewHeight}px"
              data-testid="incoming-beat-grid"
            >
              <StepGrid
                steps={incomingSequence.steps ?? []}
                gridJoin={sequenceGridJoin(incomingSequence)}
                startPlacement={incomingSequence.startPlacement ??
                  incomingSequence.startingPlacement ??
                  null}
              />
            </div>
          {/if}
        </div>
      </div>

      <!-- Message -->
      <DialogPrimitive.Description class="dialog-message">
        {t("create_review_this_will_overwrite_your_current_work_in_construct")}
      </DialogPrimitive.Description>

      <!-- Actions -->
      <div class="dialog-actions">
        <button
          class="dialog-button cancel-button"
          onclick={handleCancel}
          data-testid="cancel-replace"
        >
          {t("create_review_keep_current")}
        </button>
        <button
          class="dialog-button confirm-button"
          onclick={handleConfirm}
          data-testid="confirm-replace"
        >
          {t("create_review_replace_edit")}
        </button>
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>

<style>
  :global(.preview-dialog-backdrop) {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    padding: 20px;
  }

  :global(.preview-dialog-container) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(30, 30, 35, 0.95);
    border: 1px solid rgba(255, 193, 7, 0.3);
    border-radius: 16px;
    padding: 24px;
    max-width: 700px;
    width: 95%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    z-index: calc(var(--z-modal) + 1);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }

  .icon {
    font-size: var(--font-size-3xl);
    line-height: 1;
  }

  :global(.dialog-title) {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 600;
    color: var(--text-color, #ffffff);
    font-family:
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      Roboto,
      sans-serif;
  }

  .sequences-comparison {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 16px;
  }

  .sequence-panel {
    flex: 1;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 12px;
    padding: 12px;
    min-width: 0;
  }

  .sequence-panel.current {
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .sequence-panel.incoming {
    border: 1px solid rgba(34, 197, 94, 0.3);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .panel-label {
    font-size: var(--font-size-compact);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .sequence-panel.current .panel-label {
    color: var(--semantic-error);
  }

  .sequence-panel.incoming .panel-label {
    color: var(--semantic-success);
  }

  .step-count {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .sequence-name {
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: #fff;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .arrow-indicator {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.4);
    font-size: var(--font-size-base);
  }

  :global(.dialog-message) {
    margin: 0 0 20px 0;
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--theme-text-dim);
    text-align: center;
  }

  .dialog-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
  }

  .dialog-button {
    padding: 12px 24px;
    border-radius: 8px;
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    border: 2px solid transparent;
    min-width: 120px;
  }

  .cancel-button {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .cancel-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.15));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    transform: translateY(-1px);
  }

  .confirm-button {
    background: linear-gradient(
      135deg,
      var(--semantic-warning) 0%,
      #d97706 100%
    );
    color: white;
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .confirm-button:hover {
    background: linear-gradient(
      135deg,
      var(--semantic-warning) 0%,
      var(--semantic-warning) 100%
    );
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
  }

  /* Mobile responsive - stack vertically */
  @media (max-width: 600px) {
    :global(.preview-dialog-container) {
      padding: 20px;
    }

    .sequences-comparison {
      flex-direction: column;
    }

    .arrow-indicator {
      transform: rotate(90deg);
      width: 24px;
      height: 24px;
    }

    .sequence-panel {
      width: 100%;
    }

    :global(.dialog-title) {
      font-size: var(--font-size-lg);
    }

    .dialog-button {
      padding: 10px 20px;
      font-size: var(--font-size-compact);
      min-width: 100px;
    }
  }
</style>
