<script lang="ts">
  import type { FeedbackType } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import type { FeedbackDetailState } from "../../../state/feedback-detail-state.svelte";
  import CopyForAIButton from "#lib/shared/foundation/ui/CopyForAIButton.svelte";

  const {
    detailState,
    readOnly = false,
    onClose,
  } = $props<{
    detailState: FeedbackDetailState;
    readOnly?: boolean;
    onClose: () => void;
  }>();

  function cycleType() {
    if (readOnly) return;
    const types: FeedbackType[] = ["bug", "feature", "general"];
    const currentIndex = types.indexOf(detailState.editType);
    const nextIndex = (currentIndex + 1) % types.length;
    detailState.editType = types[nextIndex] ?? "general";
    void detailState.saveChanges();
  }

  /**
   * Get feedback formatted as a prompt for Claude Code agents
   */
  function getClaudePrompt(): string {
    const item = detailState.item;
    const priorityText = item.priority
      ? item.priority.charAt(0).toUpperCase() + item.priority.slice(1)
      : "None";
    const typeText = item.type.charAt(0).toUpperCase() + item.type.slice(1);

    return `Work on feedback ID: ${item.id}

**${item.title}**
Type: ${typeText} | Priority: ${priorityText}
Module: ${item.capturedModule || "Unknown"} | Tab: ${item.capturedTab || "Unknown"}

${item.description}

---
Claim this item by updating its status to "in-progress" in Firebase (collection: feedback, doc: ${item.id}), then investigate and fix the issue. Follow the /fb workflow documented in .claude/rules/workflows.md.`;
  }
</script>

<header class="panel-header">
  <!-- Type badge (clickable to cycle types) -->
  <button
    type="button"
    class="header-badge clickable"
    style="--badge-color: {detailState.typeConfig.color}"
    onclick={cycleType}
    disabled={readOnly}
    title={readOnly ? detailState.typeConfig.label : "Click to change type"}
  >
    <i class="fas {detailState.typeConfig.icon}" aria-hidden="true"></i>
    <span>{detailState.typeConfig.label}</span>
    {#if !readOnly}
      <i class="fas fa-exchange-alt type-switcher-icon" aria-hidden="true"></i>
    {/if}
  </button>

  <div class="header-actions">
    <!-- Copy for Claude Code button -->
    <CopyForAIButton
      getData={getClaudePrompt}
      ariaLabel="Copy feedback for Claude Code"
      variant="icon-only"
      size="md"
      class="header-btn"
    />
    {#if detailState.hasChanges || detailState.isSaving}
      <button
        type="button"
        class="header-btn restore-btn"
        onclick={() => detailState.restoreOriginal()}
        disabled={detailState.isSaving}
        aria-label="Restore original"
        title="Restore original"
      >
        <i class="fas fa-undo" aria-hidden="true"></i>
      </button>
      <button
        data-save-shortcut
        type="button"
        class="header-btn save-btn"
        onclick={() => detailState.saveChanges()}
        disabled={detailState.isSaving}
        aria-label="Save changes"
        title="Save changes"
      >
        {#if detailState.isSaving}
          <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
        {:else}
          <i class="fas fa-check" aria-hidden="true"></i>
        {/if}
      </button>
    {/if}
    <button
      type="button"
      class="close-btn"
      onclick={onClose}
      aria-label="Close panel"
    >
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
  </div>
</header>

<style>
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fb-space-md);
    padding: var(--fb-space-md);
    border-bottom: 1px solid var(--fb-border);
    background: var(--fb-surface);
  }

  .header-badge {
    display: flex;
    align-items: center;
    gap: var(--fb-space-xs);
    padding: var(--fb-space-xs) var(--fb-space-sm);
    background: color-mix(in srgb, var(--badge-color) 15%, transparent);
    border: 1px solid transparent;
    border-radius: var(--fb-radius-sm);
    font-size: var(--fb-text-sm);
    font-weight: 600;
    color: var(--badge-color);
    transition: all var(--duration-normal) ease;
  }

  .header-badge.clickable {
    cursor: pointer;
  }

  .header-badge.clickable:hover:not(:disabled) {
    background: color-mix(in srgb, var(--badge-color) 25%, transparent);
    border-color: var(--badge-color);
    transform: scale(1.02);
  }

  .header-badge.clickable:active:not(:disabled) {
    transform: scale(0.98);
  }

  .header-badge:disabled {
    cursor: default;
  }

  .type-switcher-icon {
    font-size: 0.75em;
    opacity: 0.6;
    margin-left: var(--fb-space-2xs);
  }

  .header-badge.clickable:hover .type-switcher-icon {
    opacity: 1;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--fb-space-xs);
  }

  .header-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius-md);
    color: var(--fb-text-muted);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .header-btn:hover:not(:disabled) {
    background: var(--fb-surface-hover);
    color: var(--fb-text);
  }

  .header-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .header-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .restore-btn:hover {
    border-color: var(--fb-warning);
    color: var(--fb-warning);
  }

  .save-btn {
    background: var(--fb-primary);
    border-color: var(--fb-primary);
    color: white;
  }

  .save-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--fb-primary) 80%, black);
    border-color: color-mix(in srgb, var(--fb-primary) 80%, black);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    margin: calc(var(--fb-space-xs) * -1);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--fb-radius-md);
    color: var(--fb-text-muted);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .close-btn:hover {
    background: var(--fb-surface-hover);
    border-color: var(--fb-border);
    color: var(--fb-text);
  }

  .close-btn:active {
    transform: scale(0.95);
  }
</style>
