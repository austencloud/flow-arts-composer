<!--
  SavedPatternList.svelte

  List of user's saved rotation direction patterns with apply and delete actions.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { RotationDirectionPattern } from "../../../domain/models/rotation-direction-pattern-data";

  interface Props {
    patterns: RotationDirectionPattern[];
    currentStepCount: number;
    applying: boolean;
    onApply: (pattern: RotationDirectionPattern) => void;
    onDelete: (pattern: RotationDirectionPattern) => void;
  }

  let { patterns, currentStepCount, applying, onApply, onDelete }: Props =
    $props();
</script>

{#if patterns.length === 0}
  <p class="empty-message">
    {t("create_review_no_saved_patterns_yet_save_a_pattern_from_the_current_sequence_or_try_a_template_above")}
  </p>
{:else}
  <div class="saved-patterns-section">
    <h3>{t("create_ui_your_patterns")}</h3>
    <div class="patterns-list">
      {#each patterns as pattern}
        {@const isDisabled = applying || currentStepCount !== pattern.stepCount}
        <div
          class="pattern-item"
          class:disabled={isDisabled}
          onclick={() => !isDisabled && onApply(pattern)}
          role="button"
          tabindex={isDisabled ? -1 : 0}
          onkeydown={(e) => {
            if (!isDisabled && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onApply(pattern);
            }
          }}
          title={currentStepCount !== pattern.stepCount
            ? t("create_pattern_requires_steps", { count: pattern.stepCount })
            : t("create_pattern_apply")}
        >
          <div class="pattern-info">
            <span class="pattern-name">{pattern.name}</span>
            <span class="pattern-steps">{t("create_pattern_steps", { count: pattern.stepCount })}</span>
          </div>
          <div class="pattern-actions">
            <button
              class="delete-btn"
              onclick={(e) => {
                e.stopPropagation();
                onDelete(pattern);
              }}
              title={t("create_ui_delete_pattern")}
              aria-label={t("create_ui_delete_pattern")}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .empty-message {
    text-align: center;
    color: var(--theme-text-muted, var(--theme-text-dim));
    padding: 32px 16px;
  }

  .saved-patterns-section {
    margin-bottom: 24px;
  }

  .saved-patterns-section h3 {
    font-size: 0.85rem;
    font-weight: 500;
    margin: 0 0 12px;
    color: var(--theme-text-muted, var(--theme-text-dim));
  }

  .patterns-list {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    container-type: inline-size;
  }

  @container (min-width: 300px) {
    .patterns-list {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @container (min-width: 450px) {
    .patterns-list {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .pattern-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    position: relative;
    padding: 12px;
    padding-right: 32px; /* Room for delete button */
    min-height: 60px;
    background: var(--theme-card-bg);
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    user-select: none;
  }

  .pattern-item:hover:not(.disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: rgba(245, 158, 11, 0.4);
  }

  .pattern-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pattern-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }

  .pattern-name {
    font-weight: 500;
    font-size: 0.9rem;
    line-height: 1.3;
  }

  .pattern-steps {
    font-size: 0.75rem;
    color: var(--theme-text-muted, var(--theme-text-dim));
    line-height: 1.4;
  }

  .pattern-actions {
    position: absolute;
    top: 6px;
    right: 6px;
  }

  .delete-btn {
    padding: 4px 6px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all var(--duration-fast);
    background: rgba(239, 68, 68, 0.15);
    color: var(--semantic-error);
    font-size: 0.75rem;
    opacity: 0.7;
  }

  .pattern-item:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    background: rgba(239, 68, 68, 0.35);
  }
</style>
