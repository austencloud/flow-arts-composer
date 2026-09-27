<!--
  DisplayNameEditor Component

  Inline editor for user display name with edit/save/cancel flow.
  Extracted from AccountSettingsSection for single responsibility.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { HapticFeedback } from "../../../application/services/haptic-feedback";
  import type { User } from "firebase/auth";
  import { authState } from "../../../auth/state/auth-state.svelte";
  import { tick } from "svelte";
  import AccountValueRow from "./AccountValueRow.svelte";

  interface Props {
    user: User;
    hapticService: HapticFeedback | null;
    editRequest?: number;
  }

  let { user, hapticService, editRequest = 0 }: Props = $props();

  // Local state
  let editedName = $state("");
  let isEditing = $state(false);
  let isSaving = $state(false);
  let saveError = $state("");
  let nameInput = $state<HTMLInputElement | null>(null);
  let editButton = $state<HTMLButtonElement | null>(null);
  let handledEditRequest = 0;

  // Sync editedName when user changes (and not editing)
  $effect(() => {
    if (!isEditing) {
      editedName = user.displayName || "";
    }
  });

  function startEditing(triggerHaptic = true) {
    editedName = user.displayName || "";
    isEditing = true;
    saveError = "";
    if (triggerHaptic) hapticService?.trigger("selection");
    void tick().then(() => nameInput?.focus());
  }

  $effect(() => {
    if (editRequest <= handledEditRequest) return;
    handledEditRequest = editRequest;
    startEditing(false);
    void tick().then(() => nameInput?.focus());
  });

  async function cancelEditing() {
    isEditing = false;
    editedName = user.displayName || "";
    saveError = "";
    await tick();
    editButton?.focus();
  }

  async function save() {
    const trimmedName = editedName.trim();
    if (!trimmedName || trimmedName === user.displayName) {
      cancelEditing();
      return;
    }

    isSaving = true;
    saveError = "";
    try {
      await authState.updateDisplayName(trimmedName);
      hapticService?.trigger("success");
      isEditing = false;
      await tick();
      editButton?.focus();
    } catch (error) {
      console.error("Failed to update display name:", error);
      saveError = t("nav_ui_display_name_couldn_t_be_saved_try_again");
      hapticService?.trigger("error");
    } finally {
      isSaving = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  }
</script>

<div data-save-shortcut-scope class="section">
  {#if isEditing}
    <label class="label" for="display-name">{t("nav_ui_display_name")}</label>
    <p class="helper-text">
      {t("nav_ui_this_name_appears_on_your_sequences_comments_and_profile")}
    </p>
    <div class="input-row">
      <input
        id="display-name"
        type="text"
        class="input"
        bind:this={nameInput}
        bind:value={editedName}
        onkeydown={handleKeydown}
        maxlength="50"
        placeholder={t("nav_ui_your_display_name")}
        disabled={isSaving}
        aria-invalid={saveError ? "true" : "false"}
        aria-describedby={saveError ? "display-name-error" : undefined}
      />
      <div class="inline-actions">
        <button
          data-save-shortcut
          class="icon-btn save"
          onclick={save}
          disabled={isSaving || !editedName.trim()}
          aria-label={t("nav_ui_save_display_name")}
        >
          {#if isSaving}
            <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {:else}
            <i class="fas fa-check" aria-hidden="true"></i>
          {/if}
        </button>
        <button
          class="icon-btn cancel"
          onclick={cancelEditing}
          disabled={isSaving}
          aria-label={t("nav_ui_cancel_editing")}
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
    </div>
    {#if saveError}
      <p id="display-name-error" class="error-message" role="alert">
        <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
        {saveError}
      </p>
    {/if}
  {:else}
    <AccountValueRow
      label={t("nav_ui_display_name")}
      value={user.displayName || t("profile_pronouns_not_set")}
      empty={!user.displayName}
      onEdit={() => startEditing()}
      bind:buttonRef={editButton}
    />
  {/if}
</div>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text);
  }

  .helper-text {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
    line-height: 1.4;
  }

  .input-row {
    display: flex;
    width: min(100%, 34rem);
    align-items: center;
    gap: 0.5rem;
  }

  .inline-actions {
    display: flex;
    gap: 0.125rem;
    flex-shrink: 0;
    padding: 0.125rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border-radius: 0.5rem;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .icon-btn.save {
    background: transparent;
    color: var(--semantic-success, #22c55e);
  }

  .icon-btn.save:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 12%,
      transparent
    );
  }

  .icon-btn.cancel {
    background: transparent;
    color: var(--theme-text-dim);
  }

  .icon-btn.cancel:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    color: var(--theme-text);
  }

  .icon-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .input {
    flex: 1;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    border: 1.5px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    border-radius: 0.5rem;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    transition: all var(--duration-normal) ease;
  }

  .input:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--theme-accent) 60%, transparent);
    background: color-mix(in srgb, var(--theme-text) 11%, transparent);
  }

  .input::placeholder {
    color: var(--theme-text-dim);
    opacity: 0.6;
  }

  .input:disabled {
    opacity: 0.6;
  }

  /* Accessibility */
  .input:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .icon-btn:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-min, 0.875rem);
  }

  @media (prefers-reduced-motion: reduce) {
    .icon-btn {
      transition: none;
    }
  }
</style>
