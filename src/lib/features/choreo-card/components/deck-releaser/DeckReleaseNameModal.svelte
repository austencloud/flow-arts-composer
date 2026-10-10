<script lang="ts">
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import ModalFooter from "#lib/shared/foundation/ui/modal/ModalFooter.svelte";

  interface Props {
    open: boolean;
    deckNumber: number;
    initialName?: string;
    initialDescription?: string;
    isReleasing?: boolean;
    onConfirm: (name: string, description: string) => void;
    onCancel: () => void;
  }

  let {
    open = $bindable(false),
    deckNumber,
    initialName = "",
    initialDescription = "",
    isReleasing = false,
    onConfirm,
    onCancel,
  }: Props = $props();

  let name = $state("");
  let description = $state("");
  let nameInput = $state<HTMLInputElement | null>(null);

  // Reset fields each time the modal opens so a prior cancel doesn't leak in.
  $effect(() => {
    if (open) {
      name = initialName;
      description = initialDescription;
      requestAnimationFrame(() => nameInput?.focus());
    }
  });

  const trimmed = $derived(name.trim());
  const canConfirm = $derived(trimmed.length > 0 && !isReleasing);
  const deckLabel = $derived(`Deck #${String(deckNumber).padStart(3, "0")}`);

  function confirm() {
    if (!canConfirm) return;
    onConfirm(trimmed, description.trim());
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) confirm();
  }
</script>

<BaseModal
  {open}
  size="sm"
  onclose={onCancel}
  closeOnBackdrop={!isReleasing}
  closeOnEscape={!isReleasing}
>
  {#snippet header()}
    <ModalHeader
      title="Name this deck"
      subtitle={deckLabel}
      icon="fa-stamp"
      iconColor="var(--semantic-success)"
      showClose={!isReleasing}
      onClose={onCancel}
    />
  {/snippet}

  <div class="form" onkeydown={handleKeydown} role="presentation">
    <label class="field">
      <span class="label-text">Deck name</span>
      <input
        bind:this={nameInput}
        class="text-input"
        type="text"
        bind:value={name}
        placeholder="e.g. Fire Drums 2026"
        maxlength="60"
        disabled={isReleasing}
      />
    </label>

    <label class="field">
      <span class="label-text"
        >Description <span class="optional">(optional)</span></span
      >
      <textarea
        class="text-input textarea"
        bind:value={description}
        placeholder="What's this deck about?"
        rows="3"
        maxlength="280"
        disabled={isReleasing}
      ></textarea>
    </label>
  </div>

  {#snippet footer()}
    <ModalFooter align="between">
      <button
        type="button"
        class="secondary"
        onclick={onCancel}
        disabled={isReleasing}
      >
        Cancel
      </button>
      <button
        type="button"
        class="primary"
        onclick={confirm}
        disabled={!canConfirm}
      >
        {#if isReleasing}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          Releasing…
        {:else}
          <i class="fas fa-stamp" aria-hidden="true"></i>
          Release {deckLabel}
        {/if}
      </button>
    </ModalFooter>
  {/snippet}
</BaseModal>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label-text {
    font-size: 13px;
    font-weight: 600;
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
  }

  .optional {
    font-weight: 400;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .text-input {
    width: 100%;
    min-height: 44px;
    padding: 10px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 10px;
    color: var(--theme-text, #fff);
    font-size: 15px;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .text-input:focus {
    outline: none;
    border-color: var(--theme-accent, #8b5cf6);
  }

  .textarea {
    resize: vertical;
    min-height: 72px;
    font-family: inherit;
    line-height: 1.4;
  }

  .text-input:disabled {
    opacity: 0.5;
  }

  .primary {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--semantic-success);
    color: var(--theme-text);
    font-weight: 700;
  }

  .primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
