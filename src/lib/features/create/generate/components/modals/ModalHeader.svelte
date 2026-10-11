<!--
ModalHeader.svelte - Reusable modal header component
Displays modal title and close button
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";

  let {
    title,
    icon = "",
    onClose,
  } = $props<{
    title: string;
    icon?: string;
    onClose: () => void;
  }>();

  let hapticService: HapticFeedback | null = null;
  try {
    hapticService = getHapticFeedback();
  } catch {
    // Optional service
  }

  function handleClose() {
    hapticService?.trigger("selection");
    onClose();
  }
</script>

<div class="modal-header">
  <h2 id="modal-title">
    {icon}{#if icon}&nbsp;{/if}{title}
  </h2>
  <button
    class="close-button"
    onclick={handleClose}
    aria-label={t("create_ui_close_modal")}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  </button>
</div>

<style>
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--theme-stroke, var(--theme-stroke));
    flex-shrink: 0;
  }

  h2 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: 700;
    color: var(--theme-text, white);
  }

  .close-button {
    /* 48px minimum for touch targets on mobile */
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    padding: 0;
    background: var(--theme-stroke);
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 8px;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .close-button svg {
    width: 20px;
    height: 20px;
    color: var(--theme-text, white);
  }

  .close-button:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 30%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 50%,
      transparent
    );
    transform: scale(1.05);
  }

  .close-button:active {
    transform: scale(0.95);
  }

  /* Mobile responsive - maintain 48px minimum */
  @media (max-width: 640px) {
    .modal-header {
      padding: 16px 20px 12px;
    }

    h2 {
      font-size: var(--font-size-xl);
    }

    .close-button {
      width: var(--min-touch-target); /* Maintain 48px minimum */
      height: var(--min-touch-target);
    }

    .close-button svg {
      width: 18px;
      height: 18px;
    }
  }

  /* Optimize for very narrow devices - still 48px minimum */
  @media (max-width: 380px) {
    .modal-header {
      padding: 14px 16px 10px;
    }

    h2 {
      font-size: var(--font-size-lg);
    }

    .close-button {
      width: var(--min-touch-target); /* NEVER below 48px for accessibility */
      height: var(--min-touch-target);
    }

    .close-button svg {
      width: 16px;
      height: 16px;
    }
  }
</style>
