<!-- ActionToast - Toast with optional undo/redo button -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  let {
    message,
    showUndo = false,
    showRedo = false,
    onUndo,
    onRedo,
  }: {
    message: string;
    showUndo?: boolean;
    showRedo?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
  } = $props();
</script>

<div class="toast">
  <span>{message}</span>
  {#if showUndo && onUndo}
    <button type="button" class="toast-btn" onclick={onUndo}>{t("settings_undo")}</button>
  {:else if showRedo && onRedo}
    <button type="button" class="toast-btn" onclick={onRedo}>{t("settings_redo")}</button>
  {/if}
</div>

<style>
  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: rgba(30, 30, 35, 0.95);
    border: 1px solid var(--theme-stroke, var(--theme-stroke-strong));
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    font-size: var(--font-size-compact);
    color: var(--theme-text, var(--theme-text));
    z-index: var(--z-toast);
    animation: slideUp var(--duration-normal) ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  .toast-btn {
    padding: 6px 12px;
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent-strong)) 20%,
      transparent
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent-strong)) 40%,
        transparent
      );
    border-radius: 6px;
    color: var(--theme-accent);
    font-size: var(--font-size-compact);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .toast-btn:hover {
    background: color-mix(in srgb, var(--theme-accent) 30%, transparent);
    color: var(--theme-accent-strong);
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }
  }
</style>
