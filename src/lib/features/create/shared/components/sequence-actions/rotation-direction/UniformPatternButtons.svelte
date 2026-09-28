<!--
  UniformPatternButtons.svelte

  Buttons for applying uniform rotation direction (All CW or All CCW) to a sequence.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  interface Props {
    disabled: boolean;
    onApplyUniform: (direction: "cw" | "ccw") => void;
  }

  let { disabled, onApplyUniform }: Props = $props();
</script>

<div class="uniform-section">
  <h3>{t("create_ui_uniform")}</h3>
  <p class="section-desc">{t("create_ui_apply_same_direction_to_all_steps")}</p>
  <div class="uniform-buttons">
    <button
      class="uniform-btn cw"
      onclick={() => onApplyUniform("cw")}
      {disabled}
    >
      <i class="fas fa-rotate-right" aria-hidden="true"></i>
      {t("create_review_all_cw")}
    </button>
    <button
      class="uniform-btn ccw"
      onclick={() => onApplyUniform("ccw")}
      {disabled}
    >
      <i class="fas fa-rotate-left" aria-hidden="true"></i>
      {t("create_review_all_ccw")}
    </button>
  </div>
</div>

<style>
  .uniform-section {
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  .uniform-section h3 {
    font-size: 0.85rem;
    font-weight: 500;
    margin: 0 0 4px;
    color: var(--theme-text-muted, var(--theme-text-dim));
  }

  .section-desc {
    font-size: 0.75rem;
    color: var(--theme-text-muted, var(--theme-text-dim));
    margin: 0 0 12px;
  }

  .uniform-buttons {
    display: flex;
    gap: 8px;
  }

  .uniform-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 8px;
    font-size: 0.9rem;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .uniform-btn.cw {
    background: rgba(6, 182, 212, 0.15);
    border: 1px solid rgba(6, 182, 212, 0.3);
    color: var(--theme-text);
  }

  .uniform-btn.cw:hover:not(:disabled) {
    background: rgba(6, 182, 212, 0.25);
    border-color: rgba(6, 182, 212, 0.5);
  }

  .uniform-btn.ccw {
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.3);
    color: var(--theme-text);
  }

  .uniform-btn.ccw:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.25);
    border-color: rgba(245, 158, 11, 0.5);
  }

  .uniform-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
