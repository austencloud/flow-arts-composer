<!--
  OffsetSection.svelte

  Beat offset control: decrement button, large centered number display,
  increment button, and "beats" label. Minimum value is 0.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  let {
    currentOffset,
    onSetOffset,
  }: {
    currentOffset: number;
    onSetOffset: (offset: number) => void;
  } = $props();

  function decrement() {
    if (currentOffset > 0) {
      onSetOffset(currentOffset - 1);
    }
  }

  function increment() {
    onSetOffset(currentOffset + 1);
  }
</script>

<div class="offset-section">
  <div class="offset-control">
    <button
      class="stepper-btn"
      onclick={decrement}
      disabled={currentOffset <= 0}
      aria-label={t("compose_ui_decrease_offset")}
    >
      <i class="fas fa-minus" aria-hidden="true"></i>
    </button>

    <div class="offset-display">
      <span class="offset-value">{currentOffset}</span>
      <span class="offset-unit">beats</span>
    </div>

    <button
      class="stepper-btn"
      onclick={increment}
      aria-label={t("compose_ui_increase_offset")}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
    </button>
  </div>
</div>

<style>
  .offset-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: slideDown 180ms ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .offset-control {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .stepper-btn {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: 14px;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .stepper-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: white;
  }

  .stepper-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .offset-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 52px;
  }

  .offset-value {
    font-size: 22px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text, white);
    text-align: center;
  }

  .offset-unit {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.35));
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  @media (prefers-reduced-motion: reduce) {
    .offset-section {
      animation: none;
    }

    .stepper-btn {
      transition: none;
    }
  }
</style>
