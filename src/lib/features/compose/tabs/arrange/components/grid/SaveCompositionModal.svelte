<!--
  SaveCompositionModal.svelte - Modal for naming and saving compositions

  Uses BaseModal for native dialog behavior (backdrop, escape, focus, animations).
  Auto-focuses name input, Enter to save.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { onMount } from "svelte";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/features/create/generate/components/modals/ModalHeader.svelte";
  import ModalActions from "#lib/features/create/generate/components/modals/ModalActions.svelte";

  let {
    open = $bindable(false),
    suggestedName = "",
    onSave,
    onClose,
  }: {
    open?: boolean;
    suggestedName?: string;
    onSave: (name: string) => void;
    onClose: () => void;
  } = $props();

  let hapticService: HapticFeedback;
  let nameInput: HTMLInputElement;

  let compositionName = $state("");
  $effect.pre(() => {
    compositionName = suggestedName;
  });

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  // Auto-focus input when modal opens
  $effect(() => {
    if (open) {
      // Wait for dialog to render content
      requestAnimationFrame(() => {
        nameInput?.focus();
        if (suggestedName) nameInput?.select();
      });
    }
  });

  function handleSave() {
    const trimmed = compositionName.trim();
    if (!trimmed) return;

    hapticService?.trigger("selection");
    onSave(trimmed);
  }

  function handleClose() {
    hapticService?.trigger("selection");
    onClose();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && compositionName.trim()) {
      handleSave();
    }
  }

  const canSave = $derived(compositionName.trim().length > 0);
</script>

<BaseModal
  bind:open
  onclose={() => handleClose()}
  size="fit"
  animation="pop"
  labelledBy="modal-title"
>
  {#snippet header()}
    <ModalHeader
      title={t("compose_ui_save_composition")}
      onClose={handleClose}
    />
  {/snippet}

  <div class="modal-body">
    <div class="form-section">
      <label for="composition-name" class="form-label"
        >{t("compose_ui_name")}</label
      >
      <input
        id="composition-name"
        type="text"
        class="name-input"
        bind:value={compositionName}
        bind:this={nameInput}
        onkeydown={handleKeydown}
        placeholder={t("compose_ui_e_g_kaleidoscope_12_step_fire_opener")}
        maxlength="80"
        autocomplete="off"
        data-form-type="other"
        data-lpignore="true"
        data-1p-ignore
      />
    </div>
  </div>

  {#snippet footer()}
    <ModalActions
      onCancel={handleClose}
      onConfirm={handleSave}
      cancelLabel="Cancel"
      confirmLabel="Save"
      confirmDisabled={!canSave}
      confirmVariant="primary"
      saveShortcut
    />
  {/snippet}
</BaseModal>

<style>
  .modal-body {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .form-label {
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .name-input {
    width: 100%;
    padding: 12px 16px;
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.3));
    border: 2px solid var(--theme-stroke-strong);
    border-radius: 10px;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm);
    font-family: inherit;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .name-input:focus {
    outline: none;
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 60%,
      transparent
    );
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.4));
  }

  .name-input::placeholder {
    color: var(--theme-text-dim);
  }

  @media (max-width: 640px) {
    .modal-body {
      padding: 20px;
      gap: 16px;
    }

    .name-input {
      padding: 11px 14px;
      font-size: var(--font-size-sm);
    }
  }
</style>
