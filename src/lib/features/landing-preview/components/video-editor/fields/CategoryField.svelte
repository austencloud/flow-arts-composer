<script lang="ts">
  /**
   * CategoryField
   *
   * Reusable category selector with keyboard shortcut hints.
   */
  import type { VideoCategory } from "../../../types";

  interface Props {
    categories: VideoCategory[];
    selectedCategory: string | null;
    showAddForm: boolean;
    newLabel: string;
    newColor: string;
    disabled?: boolean;
    onSelect: (categoryId: string) => void;
    onToggleAddForm: (show: boolean) => void;
    onAdd: () => void;
    onUpdateLabel: (label: string) => void;
    onUpdateColor: (color: string) => void;
  }

  let {
    categories,
    selectedCategory,
    showAddForm,
    newLabel,
    newColor,
    disabled = false,
    onSelect,
    onToggleAddForm,
    onAdd,
    onUpdateLabel,
    onUpdateColor,
  }: Props = $props();

  const hasCategory = $derived(!!selectedCategory);
</script>

<div class="field">
  <div class="field-header">
    <span class="field-label">Category</span>
    {#if hasCategory}
      <i class="fas fa-check field-check" aria-hidden="true"></i>
    {/if}
  </div>
  <div class="chips">
    {#each categories as cat, i}
      <button
        class="chip"
        class:selected={selectedCategory === cat.id}
        style="--chip-color: {cat.color}"
        onclick={() => onSelect(cat.id)}
        {disabled}
      >
        <span class="chip-key">{i + 1}</span>
        <span class="chip-label">{cat.label}</span>
      </button>
    {/each}
    {#if !showAddForm}
      <button
        class="chip add-chip"
        onclick={() => onToggleAddForm(true)}
        {disabled}
        aria-label="Add category"
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
      </button>
    {/if}
  </div>
  {#if showAddForm}
    <div class="add-form">
      <input
        type="text"
        placeholder="Name"
        value={newLabel}
        oninput={(e) => onUpdateLabel((e.target as HTMLInputElement).value)}
        onkeydown={(e) => e.key === "Enter" && onAdd()}
      />
      <input
        type="color"
        value={newColor}
        oninput={(e) => onUpdateColor((e.target as HTMLInputElement).value)}
      />
      <button class="add-form-btn" onclick={onAdd} disabled={!newLabel.trim()}
        >Add</button
      >
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
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .chip.selected {
    background: var(--chip-color, var(--theme-accent, #6366f1));
    border-color: var(--chip-color, var(--theme-accent, #6366f1));
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
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    font-size: 10px;
    font-weight: 600;
  }

  .chip.selected .chip-key {
    background: rgba(0, 0, 0, 0.2);
  }

  .chip-label {
    font-weight: 500;
  }

  .chip.add-chip {
    border-style: dashed;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    padding: 8px 10px;
  }

  .chip.add-chip:hover:not(:disabled) {
    color: var(--theme-text, rgba(255, 255, 255, 0.6));
  }

  .add-form {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 10px;
  }

  .add-form input[type="text"] {
    flex: 1;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, white);
    font-size: 13px;
  }

  .add-form input[type="text"]::placeholder {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
  }

  .add-form input[type="color"] {
    width: 32px;
    height: 32px;
    padding: 2px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
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
      box-shadow var(--duration-fast),
      width var(--duration-fast),
      height var(--duration-fast);
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
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.12));
  }
</style>
