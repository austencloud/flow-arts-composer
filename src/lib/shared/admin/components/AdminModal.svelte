<script lang="ts">
  /**
   * AdminModal
   * Confirmation modal dialog
   */

  import type { Snippet } from "svelte";
  import type { ModalVariant } from "../types/admin-component-types";

  interface AdminModalProps {
    title: string;
    message?: string;
    variant?: ModalVariant;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
    loading?: boolean;
    class?: string;
    children?: Snippet;
  }

  let {
    title,
    message,
    variant = "confirm",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    onConfirm,
    onCancel,
    loading = false,
    class: className = "",
    children,
  }: AdminModalProps = $props();

  async function handleConfirm() {
    await onConfirm();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  }

  function handleDialogKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onCancel();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-overlay" role="presentation" onclick={handleBackdropClick}>
  <div
    class="admin-modal variant-{variant} {className}"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
    onkeydown={handleDialogKeydown}
  >
    <h3 id="modal-title" class="modal-title">{title}</h3>

    {#if children}
      <div class="modal-content">
        {@render children()}
      </div>
    {:else if message}
      <p class="modal-message">{message}</p>
    {/if}

    <div class="modal-actions">
      <button class="cancel-btn" onclick={onCancel} disabled={loading}>
        {cancelLabel}
      </button>
      <button
        class="confirm-btn"
        class:danger={variant === "danger"}
        class:warning={variant === "warning"}
        onclick={handleConfirm}
        disabled={loading}
      >
        {#if loading}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        {:else}
          {confirmLabel}
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: var(
      --sheet-backdrop-bg,
      var(--backdrop-medium, rgba(0, 0, 0, 0.7))
    );
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    padding: 24px;
  }

  .admin-modal {
    background: var(--theme-panel-elevated-bg);
    border-radius: 16px;
    padding: 24px;
    max-width: 400px;
    width: 100%;
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  .modal-title {
    margin: 0 0 12px 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--theme-text);
  }

  .modal-message {
    margin: 0 0 24px 0;
    color: var(--theme-text-dim, var(--theme-text-dim));
    line-height: 1.5;
  }

  .modal-content {
    margin-bottom: 24px;
  }

  .modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .cancel-btn,
  .confirm-btn {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--duration-normal),
      border-color var(--duration-normal),
      color var(--duration-normal),
      opacity var(--duration-normal),
      transform var(--duration-normal),
      box-shadow var(--duration-normal);
    border: none;
  }

  .cancel-btn {
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    color: var(--theme-text);
  }

  .cancel-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
  }

  .confirm-btn {
    background: var(--theme-accent, var(--semantic-info));
    color: white;
  }

  .confirm-btn:hover:not(:disabled) {
    background: var(--theme-accent-strong);
  }

  .confirm-btn.danger {
    background: var(--semantic-error, var(--semantic-error));
  }

  .confirm-btn.danger:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 85%,
      black
    );
  }

  .confirm-btn.warning {
    background: var(--semantic-warning, var(--semantic-warning));
  }

  .confirm-btn.warning:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-warning, var(--semantic-warning)) 80%,
      black
    );
  }

  .cancel-btn:disabled,
  .confirm-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
</style>
