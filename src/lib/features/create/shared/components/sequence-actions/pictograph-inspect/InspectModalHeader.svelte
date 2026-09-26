<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  /**
   * Inspect Modal Header
   *
   * Header with title, badges, and copy buttons for the pictograph inspector.
   */
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import CopyForAIButton from "$lib/shared/foundation/ui/CopyForAIButton.svelte";

  interface Props {
    displayData: StepData | null;
    stepData: StepData;
    isCalculating: boolean;
    getCopyAllData: () => string | Promise<string>;
    getCopyJsonData: () => string;
    onClose: () => void;
  }

  let {
    displayData,
    stepData,
    isCalculating,
    getCopyAllData,
    getCopyJsonData,
    onClose,
  }: Props = $props();
</script>

<header class="modal-header">
  <div class="header-left">
    <span class="title-icon"
      ><i class="fas fa-magnifying-glass" aria-hidden="true"></i></span
    >
    <h2>{t("create_ui_inspect")}</h2>
    <span class="beat-chip"
      >Step {displayData?.stepNumber ?? stepData.stepNumber}</span
    >
    {#if displayData?.letter ?? stepData.letter}
      <span class="letter-chip">{displayData?.letter ?? stepData.letter}</span>
    {/if}
    {#if isCalculating}
      <span class="calculating">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      </span>
    {/if}
  </div>
  <div class="header-actions">
    <CopyForAIButton
      getData={getCopyAllData}
      ariaLabel="Copy all data for AI"
      variant="icon-text"
      size="sm"
      idleIcon="fa-robot"
      labels={{ idle: "Copy AI", success: "Copied!" }}
      disabled={isCalculating}
    />
    <CopyForAIButton
      getData={getCopyJsonData}
      ariaLabel="Copy JSON"
      variant="icon-text"
      size="sm"
      idleIcon="fa-code"
      labels={{ idle: "JSON", success: "Copied!" }}
      disabled={isCalculating}
    />
    <button class="close-btn" onclick={onClose} aria-label={t("action_close")}>
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
  </div>
</header>

<style>
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    background: transparent;
    flex-wrap: wrap;
    gap: 10px;
    font-family: inherit;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .title-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #58a6ff) 16%,
      transparent
    );
    color: var(--theme-accent, #58a6ff);
    font-size: var(--font-size-compact, 12px);
  }

  .header-left h2 {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    font-weight: 700;
    color: var(--theme-text, #fff);
    letter-spacing: 0.2px;
  }

  .beat-chip,
  .letter-chip {
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
  }

  .beat-chip {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .letter-chip {
    color: var(--theme-text, #fff);
    font-weight: 700;
  }

  .calculating {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .close-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast, 0.15s) ease;
    margin-left: 4px;
    font-size: var(--font-size-compact, 12px);
  }

  .close-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #fff);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .close-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #58a6ff);
    outline-offset: 1px;
  }

  @media (max-width: 600px) {
    .header-left h2 {
      display: none;
    }
  }
</style>
