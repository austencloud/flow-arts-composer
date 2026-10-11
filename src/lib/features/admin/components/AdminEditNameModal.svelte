<script lang="ts">
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";

  interface Props {
    open: boolean;
    currentName: string;
    pending: boolean;
    onclose: () => void;
    onsave: (name: string) => void;
  }

  let { open, currentName, pending, onclose, onsave }: Props = $props();
  let value = $state("");

  $effect(() => {
    if (open) value = currentName;
  });

  function save() {
    if (pending) return;
    const name = value.trim();
    if (name) onsave(name);
  }
</script>

<!-- Keep nested admin dialogs in the same native top-layer modal system as the
     user-detail shell. Portal-based dialogs would sit behind its <dialog>. -->
<BaseModal
  {open}
  onclose={() => !pending && onclose()}
  closeOnBackdrop={!pending}
  closeOnEscape={!pending}
  size="sm"
  labelledBy="edit-name-title"
>
  <h4 id="edit-name-title">Edit Display Name</h4>
  <label class="sr-only" for="edit-display-name">Display name</label>
  <input
    id="edit-display-name"
    bind:value
    placeholder="Display name"
    maxlength="50"
    onkeydown={(event) => event.key === "Enter" && save()}
  />
  <div class="actions">
    <button class="cancel" onclick={onclose} disabled={pending}>Cancel</button>
    <button class="save" onclick={save} disabled={pending || !value.trim()}>
      {#if pending}
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        Saving…
      {:else}
        Save
      {/if}
    </button>
  </div>
</BaseModal>

<style>
  h4 {
    margin: 0 0 16px;
    color: var(--theme-text);
    font-size: var(--font-size-base);
  }

  input {
    width: 100%;
    min-height: 44px;
    padding: 12px 14px;
    margin-bottom: 20px;
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
    min-width: 88px;
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

  .save {
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 40%, transparent);
    color: var(--theme-accent);
  }
</style>
