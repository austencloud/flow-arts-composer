<!--
ModalActions.svelte - Premium modal action buttons
Provides consistent, beautiful button layouts for modal actions
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";

  let {
    onCancel,
    onConfirm,
    cancelLabel = "Cancel",
    confirmLabel = "Confirm",
    confirmDisabled = false,
    confirmVariant = "primary" as "primary" | "success" | "danger",
    saveShortcut = false,
  } = $props<{
    onCancel: () => void;
    onConfirm: () => void;
    cancelLabel?: string;
    confirmLabel?: string;
    confirmDisabled?: boolean;
    confirmVariant?: "primary" | "success" | "danger";
    saveShortcut?: boolean;
  }>();

  let hapticService: HapticFeedback | null = null;
  try {
    hapticService = getHapticFeedback();
  } catch {
    // Optional service
  }

  function handleCancel() {
    hapticService?.trigger("selection");
    onCancel();
  }

  function handleConfirm() {
    hapticService?.trigger("selection");
    onConfirm();
  }
</script>

<div class="modal-actions">
  <button class="action-button cancel-button" onclick={handleCancel} type="button">
    {cancelLabel}
  </button>
  <button
    data-save-shortcut={saveShortcut ? "" : undefined}
    class="action-button confirm-button {confirmVariant}"
    onclick={handleConfirm}
    disabled={confirmDisabled}
    type="button"
  >
    {confirmLabel}
  </button>
</div>

<style>
  .modal-actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
  }

  .action-button {
    flex: 1;
    padding: 12px 20px;
    min-height: var(--min-touch-target, 48px); /* WCAG AAA touch target */
    border-radius: 10px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    border: none;
    position: relative;
    overflow: hidden;
    letter-spacing: 0.01em;
  }

  .action-button::before {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(
      circle at center,
      var(--theme-stroke-strong) 0%,
      transparent 70%
    );
    opacity: 0;
    transition: opacity var(--duration-emphasis) ease;
  }

  .action-button:hover::before {
    opacity: 1;
  }

  .cancel-button {
    background: linear-gradient(
      135deg,
      var(--theme-stroke),
      var(--theme-card-bg, var(--theme-card-bg))
    );
    color: var(--theme-text);
    border: 1px solid var(--theme-stroke);
  }

  .cancel-button:hover {
    background: linear-gradient(
      135deg,
      var(--theme-card-hover-bg),
      var(--theme-stroke, var(--theme-card-bg))
    );
    border-color: var(--theme-stroke-strong);
    transform: translateY(-1px);
  }

  .cancel-button:active {
    transform: translateY(0);
  }

  .confirm-button {
    color: var(--theme-text, white);
    font-weight: 700;
  }

  .confirm-button.primary {
    background: linear-gradient(
      135deg,
      var(--theme-accent, var(--semantic-info)),
      color-mix(in srgb, var(--theme-accent, var(--semantic-info)) 85%, #1e40af)
    );
    box-shadow: 0 2px 8px
      color-mix(
        in srgb,
        var(--theme-accent, var(--semantic-info)) 30%,
        transparent
      );
  }

  .confirm-button.primary:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--theme-accent, var(--semantic-info)) 85%,
        #1e40af
      ),
      color-mix(in srgb, var(--theme-accent, var(--semantic-info)) 70%, #1e3a8a)
    );
    transform: translateY(-2px);
    box-shadow:
      0 6px 20px
        color-mix(
          in srgb,
          var(--theme-accent, var(--semantic-info)) 40%,
          transparent
        ),
      0 0 0 1px var(--theme-stroke) inset;
  }

  .confirm-button.success {
    background: linear-gradient(
      135deg,
      var(--semantic-success, var(--semantic-success)),
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 85%,
        #065f46
      )
    );
    box-shadow: 0 2px 8px
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 30%,
        transparent
      );
  }

  .confirm-button.success:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 85%,
        #065f46
      ),
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 70%,
        #064e3b
      )
    );
    transform: translateY(-2px);
    box-shadow:
      0 6px 20px
        color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 40%,
          transparent
        ),
      0 0 0 1px var(--theme-stroke) inset;
  }

  .confirm-button.danger {
    background: linear-gradient(
      135deg,
      var(--semantic-error, var(--semantic-error)),
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 85%,
        #7f1d1d
      )
    );
    box-shadow: 0 2px 8px
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 30%,
        transparent
      );
  }

  .confirm-button.danger:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 85%,
        #7f1d1d
      ),
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 70%,
        #7f1d1d
      )
    );
    transform: translateY(-2px);
    box-shadow:
      0 6px 20px
        color-mix(
          in srgb,
          var(--semantic-error, var(--semantic-error)) 40%,
          transparent
        ),
      0 0 0 1px var(--theme-stroke) inset;
  }

  .confirm-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .confirm-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    filter: saturate(0.5);
  }

  .action-button:focus-visible {
    outline: 2px solid var(--theme-accent, rgba(139, 92, 246, 0.8));
    outline-offset: 2px;
  }

  .cancel-button:focus-visible {
    outline-color: var(--theme-text, white);
  }

  /* Accessibility: Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .action-button {
      transition: none;
    }

    .cancel-button:hover,
    .confirm-button:hover:not(:disabled) {
      transform: none;
    }
  }

  @media (max-width: 640px) {
    .action-button {
      padding: 11px 16px;
      font-size: var(--font-size-sm);
    }
  }
</style>
