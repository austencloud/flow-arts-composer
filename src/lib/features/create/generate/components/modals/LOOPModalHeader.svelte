<!--
LOOPModalHeader.svelte - Modal header for LOOP Selection
Simple header with title and close button
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";

  let { title, onClose } = $props<{
    title: string;
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

<div class="loop-modal-header">
  <h2 id="loop-title">{title}</h2>

  <button
    class="close-button"
    onclick={handleClose}
    aria-label={t("create_ui_close_loop_selection")}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  </button>
</div>

<style>
  .loop-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
    min-height: var(--min-touch-target);
  }

  .loop-modal-header h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 700;
    color: var(--theme-text, white);
    letter-spacing: 0.3px;
  }

  .close-button {
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-normal) ease;
    padding: 8px;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    flex-shrink: 0;
  }

  .close-button:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, white);
  }

  .close-button svg {
    width: 20px;
    height: 20px;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .close-button {
      transition: none;
    }
  }
</style>
