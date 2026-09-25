<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  /**
   * PanelSpinner - Pulse dots loading indicator.
   *
   * Three dots that bounce in sequence, providing a calm
   * "something is happening" signal without a spinning wheel.
   */

  interface Props {
    /** Dot diameter in pixels. Default 10. */
    size?: number;
    /** Dot color. Defaults to theme accent. */
    color?: string;
  }

  let { size = 10, color }: Props = $props();
</script>

<div
  class="pulse-dots"
  style:--dot-size="{size}px"
  style:--dot-color={color}
  role="status"
  aria-label={t("common_loading")}
>
  <span class="dot"></span>
  <span class="dot"></span>
  <span class="dot"></span>
</div>

<style>
  .pulse-dots {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--dot-size, 10px) * 0.8);
  }

  .dot {
    width: var(--dot-size, 10px);
    height: var(--dot-size, 10px);
    border-radius: 50%;
    background: var(--dot-color, var(--theme-accent, #6366f1));
    opacity: 0.3;
    animation: pulse-bounce 1.4s ease-in-out infinite;
  }

  .dot:nth-child(2) {
    animation-delay: 0.16s;
  }

  .dot:nth-child(3) {
    animation-delay: 0.32s;
  }

  @keyframes pulse-bounce {
    0%,
    80%,
    100% {
      opacity: 0.3;
      transform: scale(1);
    }
    40% {
      opacity: 1;
      transform: scale(1.2);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
    }

    .dot:nth-child(1) {
      opacity: 1;
    }

    .dot:nth-child(2) {
      opacity: 0.6;
    }

    .dot:nth-child(3) {
      opacity: 0.3;
    }
  }
</style>
