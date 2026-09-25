<!--
  StaggerControls.svelte

  Simple beat offset adjustment for timing stagger.
  Shown in a popover/modal when user clicks the timing button on a layer.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";

  let {
    open = false,
    layerName,
    currentOffset,
    maxOffset,
    onClose,
    onSave,
  }: {
    open: boolean;
    layerName: string;
    currentOffset: number;
    maxOffset: number;
    onClose: () => void;
    onSave: (offset: number) => void;
  } = $props();

  // Local state for editing
  let editOffset = $state(0);

  // Reset when opened with new layer
  $effect(() => {
    if (open) {
      editOffset = currentOffset;
    }
  });

  function handleDecrement() {
    editOffset = Math.max(0, editOffset - 1);
  }

  function handleIncrement() {
    editOffset = Math.min(maxOffset, editOffset + 1);
  }

  function handlePreset(value: number) {
    editOffset = Math.min(maxOffset, Math.max(0, value));
  }

  function handleSave() {
    onSave(editOffset);
    onClose();
  }

  function handleCancel() {
    onClose();
  }
</script>

<BaseModal
  {open}
  onclose={handleCancel}
  size="fit"
  class="stagger-controls-modal"
  labelledBy="stagger-controls-title"
>
  <div class="stagger-controls">
    <div class="header">
      <h3 id="stagger-controls-title">{t("compose_ui_timing_offset")}</h3>
      <p class="layer-label">{layerName}</p>
    </div>

    <p class="description">Shift this sequence by beats relative to others</p>

    <!-- Offset selector -->
    <div class="offset-selector">
      <button
        class="step-btn"
        onclick={handleDecrement}
        disabled={editOffset <= 0}
        aria-label={t("compose_ui_decrease_offset")}
      >
        <i class="fas fa-minus" aria-hidden="true"></i>
      </button>

      <div class="offset-display">
        <span class="offset-value">{editOffset}</span>
        <span class="offset-unit">step{editOffset !== 1 ? "s" : ""}</span>
      </div>

      <button
        class="step-btn"
        onclick={handleIncrement}
        disabled={editOffset >= maxOffset}
        aria-label={t("compose_ui_increase_offset")}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
      </button>
    </div>

    <!-- Preset buttons -->
    <div class="presets">
      <button
        class="preset-btn"
        class:active={editOffset === 0}
        onclick={() => handlePreset(0)}
      >
        In Sync
      </button>
      <button
        class="preset-btn"
        class:active={editOffset === 1}
        onclick={() => handlePreset(1)}
      >
        +1 Beat
      </button>
      <button
        class="preset-btn"
        class:active={editOffset === Math.floor(maxOffset / 2)}
        onclick={() => handlePreset(Math.floor(maxOffset / 2))}
      >
        Half
      </button>
    </div>

    <!-- Actions -->
    <div class="actions">
      <button class="cancel-btn" onclick={handleCancel}> Cancel </button>
      <button class="save-btn" onclick={handleSave}> Apply </button>
    </div>
  </div>
</BaseModal>

<style>
  .stagger-controls {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    padding: var(--spacing-lg);
    min-width: 280px;
  }

  .header {
    text-align: center;
  }

  .header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .layer-label {
    margin: var(--spacing-xs) 0 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .description {
    margin: 0;
    text-align: center;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .offset-selector {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-lg);
  }

  .step-btn {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: 50%;
    color: white;
    font-size: 1rem;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .step-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.2));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
  }

  .step-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .step-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .offset-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 80px;
  }

  .offset-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--theme-text, white);
    line-height: 1;
  }

  .offset-unit {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    margin-top: 2px;
  }

  .presets {
    display: flex;
    justify-content: center;
    gap: var(--spacing-sm);
  }

  .preset-btn {
    min-height: 36px;
    padding: var(--spacing-xs) var(--spacing-md);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-md);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .preset-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, white);
  }

  .preset-btn.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 40%,
      transparent
    );
    color: var(--theme-accent-light, #a78bfa);
  }

  .preset-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 1px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    padding-top: var(--spacing-md);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .cancel-btn,
  .save-btn {
    min-height: var(--min-touch-target);
    padding: var(--spacing-sm) var(--spacing-lg);
    border-radius: var(--border-radius-md);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .cancel-btn {
    background: transparent;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .cancel-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.05));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    color: var(--theme-text, white);
  }

  .save-btn {
    background: linear-gradient(
      135deg,
      var(--theme-accent, #8b5cf6),
      var(--accent-pink, #ec4899)
    );
    border: none;
    color: white;
  }

  .save-btn:hover {
    box-shadow: 0 2px 12px
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 40%, transparent);
  }

  .cancel-btn:focus-visible,
  .save-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  /* Accessibility: Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .step-btn,
    .preset-btn,
    .cancel-btn,
    .save-btn {
      transition: none;
    }
  }

  /* Modal styling */
  :global(.stagger-controls-modal) {
    --modal-bg: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }
</style>
