<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  /**
   * TransferConfirmDialog - Confirmation dialog for sequence transfer
   * Renders as bottom sheet on mobile, modal dialog on desktop
   */
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import ConfirmDialog from "$lib/shared/foundation/ui/ConfirmDialog.svelte";

  let {
    isOpen = $bindable(false),
    isMobile = false,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    isMobile: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();

  function handleConfirm() {
    onConfirm();
    isOpen = false;
  }

  function handleCancel() {
    onCancel();
    isOpen = false;
  }
</script>

{#if isMobile}
  <!-- Mobile: Bottom Sheet -->
  <Drawer
    {isOpen}
    onclose={handleCancel}
    ariaLabel={t("create_review_replace_construct_content")}
  >
    {#snippet children()}
      <div class="transfer-confirmation-content">
        <h3 class="confirmation-title">
          {t("create_ui_replace_construct_content")}
        </h3>
        <p class="confirmation-message">
          {t("create_review_the_construct_workspace_already_has_content_transferring_this_sequence_will_replace_it")}
        </p>
        <div class="confirmation-actions">
          <button class="cancel-button" onclick={handleCancel}
            >{t("action_cancel")}</button
          >
          <button class="confirm-button" onclick={handleConfirm}>
            {t("create_review_replace_transfer")}
          </button>
        </div>
      </div>
    {/snippet}
  </Drawer>
{:else}
  <!-- Desktop: Confirm Dialog -->
  <ConfirmDialog
    bind:isOpen
    title={t("create_ui_replace_construct_content")}
    message={t("create_review_the_construct_workspace_already_has_content_transferring_this_sequence_will_replace_it")}
    confirmText={t("create_review_replace_transfer")}
    cancelText={t("create_review_cancel")}
    variant="warning"
    onConfirm={handleConfirm}
    onCancel={handleCancel}
  />
{/if}

<style>
  .transfer-confirmation-content {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 24px;
  }

  .confirmation-title {
    color: rgba(255, 255, 255, 0.95);
    font-size: var(--font-size-xl);
    font-weight: 600;
    margin: 0;
    line-height: 1.3;
  }

  .confirmation-message {
    color: var(--theme-text);
    font-size: var(--font-size-base);
    line-height: 1.6;
    margin: 0;
  }

  .confirmation-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .confirmation-actions button {
    padding: 12px 24px;
    border-radius: 8px;
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    border: 2px solid transparent;
    min-width: 120px;
  }

  .cancel-button {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .cancel-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.15));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    transform: translateY(-1px);
  }

  .confirm-button {
    background: linear-gradient(
      135deg,
      var(--semantic-warning) 0%,
      #d97706 100%
    );
    color: white;
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .confirm-button:hover {
    background: linear-gradient(
      135deg,
      var(--semantic-warning) 0%,
      var(--semantic-warning) 100%
    );
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
  }

  @media (max-width: 768px) {
    .confirmation-actions {
      flex-direction: column;
    }

    .confirmation-actions button {
      width: 100%;
    }
  }
</style>
