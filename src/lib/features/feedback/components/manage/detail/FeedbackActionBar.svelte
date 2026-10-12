<script lang="ts">
  import type { FeedbackDetailState } from "../../../state/feedback-detail-state.svelte";

  const { detailState, readOnly = false } = $props<{
    detailState: FeedbackDetailState;
    readOnly?: boolean;
  }>();
</script>

{#if !readOnly}
  <section class="section actions-section">
    <!-- Delete Button - Destructive action with confirmation -->
    {#if detailState.showDeleteConfirm}
      <div class="confirm-box">
        <span class="confirm-text">
          Permanently delete this feedback? This cannot be undone.
        </span>
        <div class="confirm-actions">
          <button
            type="button"
            class="cancel-btn"
            onclick={() => (detailState.showDeleteConfirm = false)}
          >
            Cancel
          </button>
          <button
            type="button"
            class="delete-confirm-btn"
            onclick={() => detailState.handleDelete()}
            disabled={detailState.isDeleting}
          >
            {#if detailState.isDeleting}
              <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
            {:else}
              <i class="fas fa-trash" aria-hidden="true"></i>
            {/if}
            Delete
          </button>
        </div>
      </div>
    {:else}
      <button
        type="button"
        class="delete-btn"
        onclick={() => (detailState.showDeleteConfirm = true)}
      >
        <i class="fas fa-trash-alt" aria-hidden="true"></i>
        Delete Forever
      </button>
    {/if}
  </section>
{/if}

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--fb-space-sm);
  }

  .actions-section {
    padding-top: var(--fb-space-md);
    border-top: 1px solid var(--fb-border);
    display: flex;
    flex-direction: column;
    gap: var(--fb-space-sm);
  }

  /* Delete button - subtle danger style */
  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--fb-space-xs);
    padding: var(--fb-space-sm) var(--fb-space-md);
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--semantic-error) 30%, transparent);
    border-radius: var(--fb-radius-md);
    color: var(--semantic-error);
    cursor: pointer;
    font-weight: 500;
    font-size: var(--fb-text-xs);
    opacity: 0.7;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard);
  }

  .delete-btn:hover {
    background: color-mix(in srgb, var(--semantic-error) 10%, transparent);
    opacity: 1;
  }

  /* Confirm box */
  .confirm-box {
    display: flex;
    flex-direction: column;
    gap: var(--fb-space-md);
    padding: var(--fb-space-md);
    background: color-mix(in srgb, var(--semantic-error) 5%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-error) 30%, transparent);
    border-radius: var(--fb-radius-md);
  }

  .confirm-text {
    font-size: var(--fb-text-sm);
    color: var(--fb-text);
    font-weight: 500;
  }

  .confirm-actions {
    display: flex;
    gap: var(--fb-space-sm);
  }

  .cancel-btn {
    flex: 1;
    padding: var(--fb-space-sm) var(--fb-space-md);
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius-md);
    color: var(--fb-text);
    cursor: pointer;
    font-weight: 500;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard);
  }

  .cancel-btn:hover {
    background: var(--fb-surface-hover);
  }

  .delete-confirm-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: var(--fb-space-sm) var(--fb-space-md);
    background: var(--semantic-error);
    border: 1px solid var(--semantic-error);
    border-radius: var(--fb-radius-md);
    color: white;
    cursor: pointer;
    font-weight: 500;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard);
  }

  .delete-confirm-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--semantic-error) 80%, black);
    border-color: color-mix(in srgb, var(--semantic-error) 80%, black);
  }

  .delete-confirm-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
