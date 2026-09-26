<!--
  ConfirmDialog.svelte - MIGRATED TO BITS UI

  A classy confirmation dialog with glassmorphism styling.
  Now built on Bits UI Dialog for better accessibility and maintainability.

  BENEFITS:
  - WCAG AAA compliant accessibility out of the box
  - Better focus management and keyboard navigation
  - Portal rendering (no z-index issues)
  - Automatic ARIA attributes
  - Better screen reader support
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { Dialog as DialogPrimitive } from "bits-ui";
  import type { HapticFeedback } from "../../application/services/haptic-feedback";
  import { onMount } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  let {
    isOpen = $bindable(false),
    title,
    message,
    confirmText,
    cancelText,
    onConfirm,
    onCancel,
    variant = "warning",
    showDontAskAgain = false,
    onDontAskAgainChange,
    confirmDelay = 0,
    ghostConfirm = false,
  } = $props<{
    isOpen?: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    variant?: "warning" | "danger" | "info";
    showDontAskAgain?: boolean;
    onDontAskAgainChange?: (checked: boolean) => void;
    /** Delay in seconds before confirm button becomes clickable. Default: 0 (no delay) */
    confirmDelay?: number;
    /**
     * Let the presentation-mode ghost go through with this dialog
     * (`.claude/rules` → attract annotations; default-deny, so it is opt-in per
     * call site). Only for confirmations that are safe to demonstrate and
     * undoable — clearing a sequence, applying a LOOP. NEVER for anything that
     * deletes saved work, spends money, or touches an account: an unattended
     * laptop at a jam must not be able to confirm those.
     *
     * Without this, a dialog the ghost raises and cannot dismiss is the worst
     * state in the system — the backdrop fails every other control's hit-test,
     * so the whole intention bag goes quiet until a human intervenes.
     */
    ghostConfirm?: boolean;
  }>();

  let dontAskAgainChecked = $state(false);
  let delayRemaining = $state(0);
  let delayTimer: ReturnType<typeof setInterval> | null = null;

  // Start countdown when dialog opens with a delay
  $effect(() => {
    if (isOpen && confirmDelay > 0) {
      delayRemaining = confirmDelay;
      delayTimer = setInterval(() => {
        delayRemaining--;
        if (delayRemaining <= 0 && delayTimer) {
          clearInterval(delayTimer);
          delayTimer = null;
        }
      }, 1000);
    } else if (!isOpen) {
      // Reset when dialog closes
      if (delayTimer) {
        clearInterval(delayTimer);
        delayTimer = null;
      }
      delayRemaining = 0;
    }

    return () => {
      if (delayTimer) {
        clearInterval(delayTimer);
        delayTimer = null;
      }
    };
  });

  const isConfirmDisabled = $derived(delayRemaining > 0);

  // Services
  let hapticService: HapticFeedback;

  onMount(async () => {
    hapticService = getHapticFeedback();
  });

  // Handle confirm button
  function handleConfirm() {
    // Trigger appropriate haptic feedback based on variant
    if (variant === "danger") {
      hapticService?.trigger("warning");
    } else {
      hapticService?.trigger("success");
    }

    // Notify about "Don't ask again" if checked
    if (dontAskAgainChecked && onDontAskAgainChange) {
      onDontAskAgainChange(true);
    }

    onConfirm();
    isOpen = false;
  }

  // Handle cancel button
  function handleCancel() {
    // Trigger navigation haptic feedback for cancel
    hapticService?.trigger("selection");

    onCancel();
    isOpen = false;
  }

  // Handle open change from Bits UI
  function handleOpenChange(open: boolean) {
    if (!open && isOpen) {
      // User closed via escape or backdrop
      handleCancel();
    }
    isOpen = open;
  }
</script>

<DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class="dialog-backdrop" />
    <DialogPrimitive.Content class="dialog-container {variant}">
      <!-- Icon -->
      <div class="dialog-icon">
        {#if variant === "warning"}
          <i
            class="fa-solid fa-triangle-exclamation icon warning-icon"
            aria-hidden="true"
          ></i>
        {:else if variant === "danger"}
          <i class="fa-solid fa-trash icon danger-icon" aria-hidden="true"></i>
        {:else}
          <i class="fa-solid fa-circle-info icon info-icon" aria-hidden="true"
          ></i>
        {/if}
      </div>

      <!-- Content -->
      <div class="dialog-content">
        <DialogPrimitive.Title class="dialog-title"
          >{title}</DialogPrimitive.Title
        >
        <DialogPrimitive.Description class="dialog-message">
          {message}
        </DialogPrimitive.Description>
      </div>

      <!-- Don't Ask Again Chip -->
      {#if showDontAskAgain}
        <div class="dont-ask-wrapper">
          <button
            type="button"
            class="dont-ask-chip"
            class:selected={dontAskAgainChecked}
            onclick={() => (dontAskAgainChecked = !dontAskAgainChecked)}
            aria-pressed={dontAskAgainChecked}
          >
            {#if dontAskAgainChecked}
              <i class="fa-solid fa-check chip-icon" aria-hidden="true"></i>
            {/if}
            <span>{t("common_dont_ask_again")}</span>
          </button>
        </div>
      {/if}

      <!-- Actions -->
      <div class="dialog-actions">
        <button class="dialog-button cancel-button" onclick={handleCancel}>
          {cancelText ?? t("common_cancel")}
        </button>
        <button
          class="dialog-button confirm-button"
          class:delayed={isConfirmDisabled}
          data-ghost={ghostConfirm && !isConfirmDisabled ? "safe" : undefined}
          data-ghost-kind={ghostConfirm && !isConfirmDisabled
            ? "confirm"
            : undefined}
          data-ghost-label={confirmText ?? t("common_continue")}
          onclick={handleConfirm}
          disabled={isConfirmDisabled}
        >
          {#if isConfirmDisabled}
            {confirmText ?? t("common_continue")} ({delayRemaining}s)
          {:else}
            {confirmText ?? t("common_continue")}
          {/if}
        </button>
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>

<style>
  :global(.dialog-backdrop) {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal, 600);
    padding: 20px;
  }

  :global(.dialog-container) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 16px;
    padding: 32px;
    max-width: 480px;
    width: 100%;
    box-shadow: var(--theme-shadow, 0 20px 60px rgba(0, 0, 0, 0.5));
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    z-index: calc(var(--z-modal, 600) + 1);
  }

  :global(.dialog-container.warning) {
    border-color: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 30%,
      transparent
    );
  }

  :global(.dialog-container.danger) {
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 30%,
      transparent
    );
  }

  :global(.dialog-container.info) {
    border-color: color-mix(
      in srgb,
      var(--semantic-info, #3b82f6) 30%,
      transparent
    );
  }

  .dialog-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
  }

  .icon {
    font-size: 2.5rem;
    line-height: 1;
  }

  .warning-icon {
    color: var(--semantic-warning, #f59e0b);
  }

  .danger-icon {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .info-icon {
    color: var(--semantic-info, #3b82f6);
  }

  .dialog-content {
    text-align: center;
    margin-bottom: 28px;
  }

  :global(.dialog-title) {
    margin: 0 0 12px 0;
    font-size: var(--font-size-2xl);
    font-weight: 600;
    color: var(--text-color, #ffffff);
    font-family:
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      Roboto,
      sans-serif;
  }

  :global(.dialog-message) {
    margin: 0;
    font-size: var(--font-size-base);
    line-height: 1.6;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .dont-ask-wrapper {
    display: flex;
    justify-content: center;
    margin-bottom: 20px;
  }

  .dont-ask-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 100px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    background: transparent;
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--theme-text-dim);
    transition: all var(--duration-fast) ease;
    user-select: none;
  }

  .dont-ask-chip:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
  }

  .dont-ask-chip:active {
    transform: scale(0.97);
  }

  .dont-ask-chip.selected {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 15%,
      transparent
    );
    border-color: var(--theme-accent, #6366f1);
    color: var(--theme-accent, #6366f1);
  }

  .dont-ask-chip.selected:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 22%,
      transparent
    );
  }

  .dont-ask-chip:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .chip-icon {
    font-size: 0.875rem;
    flex-shrink: 0;
  }

  .dialog-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
  }

  .dialog-button {
    padding: 12px 32px;
    border-radius: 8px;
    font-size: var(--font-size-base);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    border: 2px solid transparent;
    min-width: 120px;
  }

  .cancel-button {
    background: var(--theme-card-bg);
    color: var(--theme-text, var(--theme-text));
    border-color: var(--theme-stroke);
  }

  .cancel-button:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    transform: translateY(-1px);
  }

  .confirm-button {
    background: linear-gradient(
      135deg,
      var(--theme-accent) 0%,
      var(--theme-accent-strong) 100%
    );
    color: white;
    border-color: var(--theme-stroke);
  }

  .confirm-button:hover {
    background: linear-gradient(
      135deg,
      var(--theme-accent-strong) 0%,
      var(--theme-accent) 100%
    );
    border-color: var(--theme-stroke-strong);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--theme-accent) 40%, transparent);
  }

  :global(.dialog-container.warning) .confirm-button {
    background: linear-gradient(
      135deg,
      var(--semantic-warning, #f59e0b) 0%,
      color-mix(in srgb, var(--semantic-warning, #f59e0b) 80%, #000) 100%
    );
  }

  :global(.dialog-container.warning) .confirm-button:hover {
    background: linear-gradient(
      135deg,
      var(--semantic-warning, #f59e0b) 0%,
      var(--semantic-warning, #f59e0b) 100%
    );
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--semantic-warning, #f59e0b) 40%, transparent);
  }

  :global(.dialog-container.danger) .confirm-button {
    background: linear-gradient(
      135deg,
      var(--semantic-error, #ef4444) 0%,
      var(--semantic-error, #ef4444) 100%
    );
  }

  :global(.dialog-container.danger) .confirm-button:hover {
    background: linear-gradient(
      135deg,
      var(--semantic-error, #ef4444) 0%,
      var(--semantic-error, #ef4444) 100%
    );
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--semantic-error, #ef4444) 40%, transparent);
  }

  /* Delayed confirm button - visually distinct waiting state */
  .confirm-button.delayed {
    opacity: 0.5;
    cursor: not-allowed;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
  }

  .confirm-button.delayed:hover {
    transform: none;
    box-shadow: none;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    :global(.dialog-container) {
      padding: 24px;
      max-width: 90%;
    }

    :global(.dialog-title) {
      font-size: var(--font-size-xl);
    }

    :global(.dialog-message) {
      font-size: var(--font-size-sm);
    }

    .dialog-button {
      padding: 10px 24px;
      font-size: var(--font-size-sm);
      min-width: 100px;
    }

    .icon {
      font-size: 2rem;
    }
  }
</style>
