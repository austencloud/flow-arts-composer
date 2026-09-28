<!--
  SaveModePanel.svelte

  Panel for saving the current sequence's rotation direction pattern.
  Shows a preview grid of the current pattern and a save form.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import { formatRotationValue } from "../../../domain/models/rotation-direction-pattern-data";

  interface Props {
    sequence: SequenceData | null;
    patternName: string;
    saving: boolean;
    onSave: () => void;
    onNameChange: (name: string) => void;
  }

  let { sequence, patternName, saving, onSave, onNameChange }: Props = $props();

  function getRotationColorClass(value: string): string {
    if (value === "CW") return "cw";
    if (value === "CC") return "ccw";
    return "none";
  }
</script>

<div class="save-section">
  {#if !sequence || sequence.steps.length === 0}
    <p class="empty-message">
      {t("create_ui_no_sequence_to_save_pattern_from")}
    </p>
  {:else}
    <div class="pattern-preview">
      <h3>{t(
        sequence.steps.length === 1
          ? "create_rotation_current_pattern_one_step"
          : "create_rotation_current_pattern_steps",
        { count: sequence.steps.length }
      )}</h3>
      <div class="preview-grid">
        {#each sequence.steps as beat, i}
          <!-- Invisible placeholder = hand not really there: null (no-motion
               display state), never "none" (motion present, no rotation). -->
          {@const leftMotion = isVisibleMotion(beat.motions?.left)
            ? beat.motions.left
            : null}
          {@const rightMotion = isVisibleMotion(beat.motions?.right)
            ? beat.motions.right
            : null}
          {@const leftRotation = formatRotationValue(
            leftMotion?.rotationDirection === "cw"
              ? "cw"
              : leftMotion?.rotationDirection === "ccw"
                ? "ccw"
                : leftMotion
                  ? "none"
                  : null
          )}
          {@const rightRotation = formatRotationValue(
            rightMotion?.rotationDirection === "cw"
              ? "cw"
              : rightMotion?.rotationDirection === "ccw"
                ? "ccw"
                : rightMotion
                  ? "none"
                  : null
          )}
          <div class="preview-beat">
            <span class="beat-num">{i + 1}</span>
            <div class="rotation-pair">
              <span
                class="rotation-value {getRotationColorClass(
                  leftRotation
                )} blue"
              >
                {leftRotation}
              </span>
              <span class="separator">|</span>
              <span
                class="rotation-value {getRotationColorClass(
                  rightRotation
                )} red"
              >
                {rightRotation}
              </span>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div class="save-form">
      <input
        type="text"
        placeholder={t("create_ui_pattern_name_optional")}
        value={patternName}
        oninput={(e) => onNameChange(e.currentTarget.value)}
        maxlength={50}
      />
      <button
        data-save-shortcut
        class="save-btn"
        onclick={onSave}
        disabled={saving}
      >
        {#if saving}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        {:else}
          <i class="fas fa-save" aria-hidden="true"></i>
        {/if}
        {t("create_review_save_pattern")}
      </button>
    </div>
  {/if}
</div>

<style>
  .save-section {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .empty-message {
    text-align: center;
    color: var(--theme-text-muted, var(--theme-text-dim));
    padding: 32px 16px;
  }

  .pattern-preview {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 10px 12px;
    overflow-y: auto;
  }

  .pattern-preview h3 {
    font-size: 0.85rem;
    font-weight: 500;
    margin: 0 0 12px;
    color: var(--theme-text-muted, var(--theme-text-dim));
  }

  .preview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
    gap: 6px;
  }

  .preview-beat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 4px;
    background: var(--theme-card-bg);
    border-radius: 6px;
    font-size: 0.75rem;
    gap: 4px;
  }

  .beat-num {
    font-weight: 600;
    color: var(--theme-text-muted, var(--theme-text-dim));
  }

  .rotation-pair {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .separator {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .rotation-value {
    font-family: monospace;
    display: inline-block;
    min-width: 20px;
    text-align: center;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
  }

  .rotation-value.cw {
    color: #06b6d4;
  }

  .rotation-value.ccw {
    color: var(--semantic-warning);
  }

  .rotation-value.none {
    color: rgba(255, 255, 255, 0.4);
  }

  .save-form {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    padding: 8px 12px 10px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #10131a) 94%,
      transparent
    );
  }

  .save-form input {
    box-sizing: border-box;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 0 10px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke-strong));
    border-radius: 8px;
    color: var(--theme-text);
    font-size: 0.9rem;
  }

  .save-form input::placeholder {
    color: var(--theme-text-dim);
  }

  .save-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 0 14px;
    background: linear-gradient(
      135deg,
      var(--semantic-warning) 0%,
      #d97706 100%
    );
    border: none;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .save-btn:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @container sequence-action-subview (max-width: 599px) and (max-height: 430px) {
    .save-form {
      padding: 4px 10px;
    }

    .pattern-preview {
      padding: 8px 10px;
    }

    .pattern-preview h3 {
      margin-bottom: 6px;
    }

    .preview-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 4px;
    }

    .preview-beat {
      min-height: var(--min-touch-target, 44px);
      box-sizing: border-box;
      padding: 4px 2px;
      gap: 2px;
    }
  }
</style>
