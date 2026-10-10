<script lang="ts">
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";

  interface Action {
    type: "disable" | "delete";
    message: string;
  }

  interface Props {
    action: Action | null;
    profileName: string;
    pending: boolean;
    onclose: () => void;
    onconfirm: () => void;
  }

  let { action, profileName, pending, onclose, onconfirm }: Props = $props();
  let deleteConfirmText = $state("");

  $effect(() => {
    action;
    deleteConfirmText = "";
  });

  const canConfirm = $derived(
    action?.type !== "delete" || deleteConfirmText === profileName
  );
</script>

<!-- This modal is nested inside UserDetailModal. BaseModal uses the native
     top layer, unlike portal-based dialogs that render behind a parent dialog. -->
<BaseModal
  open={action !== null}
  onclose={() => !pending && onclose()}
  closeOnBackdrop={!pending}
  closeOnEscape={!pending}
  size="sm"
  labelledBy="admin-confirm-title"
  describedBy={action?.type === "delete" ? "admin-delete-warning" : undefined}
>
  {#if action}
    <h4 id="admin-confirm-title">{action.message}</h4>

    {#if action.type === "delete"}
      <div id="admin-delete-warning" class="delete-warning">
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        <span
          >Deletes this account and its app data. This cannot be undone.</span
        >
      </div>
      <label for="delete-confirm-input">
        Type <strong>{profileName}</strong> to confirm
      </label>
      <input
        id="delete-confirm-input"
        bind:value={deleteConfirmText}
        placeholder={profileName}
        autocomplete="off"
      />
    {/if}

    <div class="actions">
      <button class="cancel" onclick={onclose} disabled={pending}>Cancel</button
      >
      <button
        class="confirm"
        onclick={onconfirm}
        disabled={pending || !canConfirm}
        aria-label="Confirm action"
      >
        {#if pending}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          Working…
        {:else if action.type === "delete"}
          Delete User
        {:else}
          Confirm
        {/if}
      </button>
    </div>
  {/if}
</BaseModal>

<style>
  h4 {
    margin: 0 0 20px;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    font-weight: 500;
  }

  .delete-warning {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    margin-bottom: 16px;
    background: color-mix(in srgb, var(--semantic-error) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-error) 25%, transparent);
    border-radius: 8px;
    color: var(--semantic-error);
    font-size: var(--font-size-compact);
    line-height: 1.5;
  }

  label {
    display: block;
    margin-bottom: 8px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
  }

  input {
    width: 100%;
    min-height: 44px;
    padding: 10px 14px;
    margin-bottom: 16px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
  }

  input:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  button {
    min-height: 44px;
    min-width: 96px;
    padding: 10px 18px;
    border-radius: 8px;
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cancel {
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    color: var(--theme-text-dim);
  }

  .confirm {
    background: color-mix(in srgb, var(--semantic-error) 20%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-error) 40%, transparent);
    color: var(--semantic-error);
  }
</style>
