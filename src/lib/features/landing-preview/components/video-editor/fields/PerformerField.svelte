<script lang="ts">
  /**
   * PerformerField
   *
   * Reusable performer selector with keyboard shortcut hints.
   */
  import PerformerSearchInput from "../../PerformerSearchInput.svelte";
  import type { UserProfile, VideoPerformer } from "../../../types";

  interface Props {
    quickPerformers: UserProfile[];
    performerKeys: string;
    showAddForm: boolean;
    disabled?: boolean;
    isSelected: (id: string) => boolean;
    hasPerformers: boolean;
    onToggle: (performer: UserProfile) => void;
    onAdd: (performer: VideoPerformer) => void;
    onRemove: (id: string) => void;
    onToggleAddForm: (show: boolean) => void;
  }

  let {
    quickPerformers,
    performerKeys,
    showAddForm,
    disabled = false,
    isSelected,
    hasPerformers,
    onToggle,
    onAdd,
    onRemove,
    onToggleAddForm,
  }: Props = $props();
</script>

<div class="field">
  <div class="field-header">
    <span class="field-label">Performer</span>
    {#if hasPerformers}
      <i class="fas fa-check field-check" aria-hidden="true"></i>
    {/if}
  </div>
  <div class="chips">
    {#each quickPerformers as performer, i}
      <div class="chip-wrapper">
        <button
          class="chip"
          class:selected={isSelected(performer.id)}
          onclick={() => !disabled && onToggle(performer)}
          {disabled}
        >
          <span class="chip-key">{performerKeys[i]?.toUpperCase() || ""}</span>
          <span class="chip-label">{performer.displayName}</span>
          {#if isSelected(performer.id)}
            <i class="fas fa-check chip-selected-icon" aria-hidden="true"></i>
          {/if}
        </button>
        <button
          class="chip-remove"
          onclick={() => onRemove(performer.id)}
          aria-label="Remove"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
    {/each}
    {#if !showAddForm}
      <button
        class="chip add-chip"
        onclick={() => onToggleAddForm(true)}
        {disabled}
        aria-label="Add performer"
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
      </button>
    {/if}
  </div>
  {#if showAddForm}
    <div class="add-form column">
      <PerformerSearchInput
        onSelect={(performer) => onAdd(performer)}
        autofocus={true}
        excludeUserIds={quickPerformers.map((p) => p.id)}
      />
      <button class="add-form-btn cancel" onclick={() => onToggleAddForm(false)}
        >Cancel</button
      >
    </div>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .field-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .field-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.35));
  }

  .field-check {
    font-size: 10px;
    color: var(--semantic-success, #10b981);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip-wrapper {
    position: relative;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, rgba(255, 255, 255, 0.8));
    cursor: pointer;
    font-size: 13px;
    transition:
      background var(--duration-fast),
      border-color var(--duration-fast),
      color var(--duration-fast),
      opacity var(--duration-fast),
      transform var(--duration-fast),
      box-shadow var(--duration-fast);
  }

  .chip:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .chip.selected {
    background: var(--theme-accent, #6366f1);
    border-color: var(--theme-accent, #6366f1);
    color: white;
  }

  .chip:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .chip-key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
    font-size: 10px;
    font-weight: 600;
  }

  .chip.selected .chip-key {
    background: rgba(0, 0, 0, 0.2);
  }

  .chip-label {
    font-weight: 500;
  }

  .chip-selected-icon {
    font-size: 10px;
    margin-left: 2px;
  }

  .chip.add-chip {
    border-style: dashed;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    padding: 8px 10px;
  }

  .chip.add-chip:hover:not(:disabled) {
    color: var(--theme-text, rgba(255, 255, 255, 0.6));
  }

  .chip-remove {
    position: absolute;
    top: -5px;
    right: -5px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: none;
    background: var(--semantic-error, #ef4444);
    color: white;
    font-size: 9px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transform: scale(0.8);
    transition:
      background var(--duration-fast),
      border-color var(--duration-fast),
      color var(--duration-fast),
      opacity var(--duration-fast),
      transform var(--duration-fast),
      box-shadow var(--duration-fast),
      width var(--duration-fast),
      height var(--duration-fast);
  }

  .chip-wrapper:hover .chip-remove {
    opacity: 1;
    transform: scale(1);
  }

  .add-form {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 10px;
  }

  .add-form.column {
    flex-direction: column;
    align-items: stretch;
  }

  .add-form-btn {
    padding: 8px 12px;
    border-radius: 6px;
    border: none;
    background: var(--semantic-success, #10b981);
    color: white;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--duration-fast),
      border-color var(--duration-fast),
      color var(--duration-fast),
      opacity var(--duration-fast),
      transform var(--duration-fast),
      box-shadow var(--duration-fast);
  }

  .add-form-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .add-form-btn.cancel {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .add-form-btn.cancel:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .add-form.column .add-form-btn.cancel {
    align-self: flex-start;
  }
</style>
