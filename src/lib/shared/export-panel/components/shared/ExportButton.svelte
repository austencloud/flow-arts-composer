<!--
  ExportButton.svelte

  Primary export CTA button, reused across Single Media and Composite modes.
  Fixed at bottom of Export Panel panel.

  Features:
  - Loading state with spinner
  - Disabled state
  - Progress display (optional)
  - Pulsing animation on hover
  - Full-width on mobile, max-width on desktop

  Domain: Export Panel - Export Action
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  let {
    label = "Export",
    loading = false,
    disabled = false,
    progress = null,
    saveShortcut = false,
    onclick,
  }: {
    label?: string;
    loading?: boolean;
    disabled?: boolean;
    progress?: number | null; // 0-100 percentage
    saveShortcut?: boolean;
    onclick?: () => void;
  } = $props();

  const showProgress = $derived(progress !== null && progress >= 0);
</script>

<button
  data-save-shortcut={saveShortcut ? "" : undefined}
  class="export-button"
  class:loading
  {disabled}
  {onclick}
  aria-label={loading ? "Exporting..." : label}
  aria-busy={loading}
>
  {#if loading}
    <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
    <span>{t("export_exporting")}</span>
  {:else}
    <i class="fas fa-download" aria-hidden="true"></i>
    <span>{label}</span>
  {/if}

  {#if showProgress}
    <div class="progress-bar">
      <div class="progress-fill" style:width="{progress}%"></div>
    </div>
  {/if}
</button>

<style>
  .export-button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    max-width: 400px;
    margin: 0 auto;
    padding: 16px 32px;
    background: var(--theme-accent);
    border: none;
    border-radius: 12px;
    font-size: var(--font-size-min);
    font-weight: 700;
    color: white;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    box-shadow:
      0 4px 16px var(--theme-shadow),
      0 0 0 1px var(--theme-accent-glow);
    overflow: hidden;
  }

  .export-button i {
    font-size: var(--font-size-lg);
  }

  .export-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow:
      0 6px 20px color-mix(in srgb, #000 40%, transparent),
      0 0 0 1px var(--theme-accent-glow);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .export-button:active:not(:disabled) {
    transform: translateY(0) scale(0.98);
  }

  .export-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .export-button.loading {
    cursor: wait;
  }

  /* Progress bar */
  .progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 4px;
    background: color-mix(in srgb, #000 20%, transparent);
  }

  .progress-fill {
    height: 100%;
    background: color-mix(in srgb, #fff 80%, transparent);
    transition: width var(--duration-emphasis) ease;
  }

  /* Pulse animation */
  @keyframes pulse {
    0%,
    100% {
      box-shadow:
        0 6px 20px color-mix(in srgb, #000 40%, transparent),
        0 0 0 1px var(--theme-accent-glow);
    }
    50% {
      box-shadow:
        0 6px 24px color-mix(in srgb, #000 50%, transparent),
        0 0 20px var(--theme-accent-glow);
    }
  }

  /* Mobile optimization */
  @media (max-width: 600px) {
    .export-button {
      max-width: none;
      padding: 14px 28px;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .export-button {
      transition: none;
      animation: none !important;
    }

    .export-button:hover:not(:disabled) {
      transform: none;
      animation: none !important;
    }

    .progress-fill {
      transition: none;
    }
  }
</style>
