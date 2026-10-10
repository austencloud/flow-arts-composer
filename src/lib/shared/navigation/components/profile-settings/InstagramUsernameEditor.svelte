<!--
  InstagramUsernameEditor Component

  Inline editor for Instagram username with format validation.
  Simpler than UsernameEditor - no availability checking needed.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { HapticFeedback } from "../../../application/services/haptic-feedback";
  import type { User } from "firebase/auth";
  import { authState } from "../../../auth/state/auth-state.svelte";
  import { toast } from "../../../toast/state/toast-state.svelte";
  import { doc, getDoc } from "firebase/firestore";
  import { getFirestoreInstance } from "../../../auth/firebase";
  import { onMount, tick } from "svelte";
  import InstagramIcon from "#lib/shared/auth/components/icons/InstagramIcon.svelte";
  import AccountValueRow from "./AccountValueRow.svelte";

  interface Props {
    user: User;
    hapticService: HapticFeedback | null;
  }

  let { user, hapticService }: Props = $props();

  // Local state
  let currentUsername = $state("");
  let editedUsername = $state("");
  let isEditing = $state(false);
  let isSaving = $state(false);
  let error = $state("");
  let saveError = $state("");
  let usernameInput = $state<HTMLInputElement | null>(null);
  let editButton = $state<HTMLButtonElement | null>(null);

  // Instagram username validation: alphanumeric, underscores, periods, 1-30 chars
  const INSTAGRAM_REGEX = /^[a-zA-Z0-9._]{1,30}$/;

  // Load current Instagram username from Firestore on mount
  onMount(async () => {
    try {
      const firestore = await getFirestoreInstance();
      const userDocRef = doc(firestore, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        currentUsername = userDoc.data()?.instagramUsername || "";
      }
    } catch (err) {
      console.error("Failed to load Instagram username:", err);
    }
  });

  // Derived: can save if valid format and changed
  const isSaveDisabled = $derived(
    isSaving ||
      !!error ||
      (editedUsername.trim() !== "" &&
        !validateFormat(editedUsername.trim())) ||
      editedUsername.trim() === currentUsername
  );
  const feedbackError = $derived(saveError || error);

  function validateFormat(username: string): boolean {
    if (!username) return true; // Empty is valid (clears the field)
    return INSTAGRAM_REGEX.test(username);
  }

  function startEditing() {
    editedUsername = currentUsername;
    isEditing = true;
    error = "";
    saveError = "";
    hapticService?.trigger("selection");
    void tick().then(() => usernameInput?.focus());
  }

  async function cancelEditing() {
    isEditing = false;
    editedUsername = "";
    error = "";
    saveError = "";
    await tick();
    editButton?.focus();
  }

  function handleInput() {
    error = "";
    saveError = "";

    // Strip @ if user enters it
    if (editedUsername.startsWith("@")) {
      editedUsername = editedUsername.slice(1);
    }

    // Validate format
    const username = editedUsername.trim();
    if (username && !validateFormat(username)) {
      error = t(
        "nav_ui_letters_numbers_underscores_and_periods_only_1_30_chars"
      );
    }
  }

  async function save() {
    const trimmedUsername = editedUsername.trim();

    // Validate format
    if (trimmedUsername && !validateFormat(trimmedUsername)) {
      error = t("nav_ui_invalid_format");
      return;
    }

    // Don't save if unchanged
    if (trimmedUsername === currentUsername) {
      cancelEditing();
      return;
    }

    isSaving = true;
    saveError = "";
    try {
      await authState.updateInstagramUsername(trimmedUsername);
      currentUsername = trimmedUsername;
      hapticService?.trigger("success");
      toast.success(
        trimmedUsername
          ? t("nav_ui_instagram_username_updated")
          : t("nav_ui_instagram_username_cleared")
      );
      isEditing = false;
      await tick();
      editButton?.focus();
    } catch (err) {
      console.error("Failed to update Instagram username:", err);
      hapticService?.trigger("error");
      saveError = t("nav_ui_instagram_username_couldn_t_be_saved_try_again");
      toast.error(
        err instanceof Error
          ? err.message
          : t("nav_ui_failed_to_update_instagram")
      );
    } finally {
      isSaving = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !isSaveDisabled) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  }
</script>

<div data-save-shortcut-scope class="section">
  {#if isEditing}
    <label class="label" for="instagram-username">Instagram</label>
    <div class="input-row">
      <div
        class="instagram-input-wrapper"
        class:error
        class:success={editedUsername.trim() && !error}
      >
        <span class="instagram-icon"><InstagramIcon /></span>
        <input
          id="instagram-username"
          type="text"
          class="input instagram-input"
          bind:this={usernameInput}
          bind:value={editedUsername}
          oninput={handleInput}
          onkeydown={handleKeydown}
          maxlength="30"
          placeholder={t("nav_ui_your_username")}
          disabled={isSaving}
          aria-invalid={feedbackError ? "true" : "false"}
          aria-describedby={feedbackError ? "instagram-error" : undefined}
        />
      </div>
      <div class="inline-actions">
        <button
          data-save-shortcut
          class="icon-btn save"
          onclick={save}
          disabled={isSaveDisabled}
          aria-label={t("nav_ui_save_instagram_username")}
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

    <!-- Real-time feedback -->
    {#if feedbackError}
      <p id="instagram-error" class="hint-message error" role="alert">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        {feedbackError}
      </p>
    {/if}
  {:else}
    <AccountValueRow
      label="Instagram"
      value={currentUsername
        ? `@${currentUsername}`
        : t("profile_pronouns_not_set")}
      empty={!currentUsername}
      onEdit={startEditing}
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

  .instagram-icon {
    display: grid;
    width: 1.25rem;
    height: 1.25rem;
    flex: 0 0 auto;
    place-items: center;
    color: #e4405f;
  }

  .instagram-icon :global(svg) {
    width: 1.25rem;
    height: 1.25rem;
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

  /* Instagram input wrapper */
  .instagram-input-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    border: 1.5px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    border-radius: 0.5rem;
    transition: all var(--duration-normal) ease;
    padding-left: 12px;
  }

  .instagram-input-wrapper:focus-within {
    border-color: color-mix(in srgb, var(--theme-accent) 60%, transparent);
    background: color-mix(in srgb, var(--theme-text) 11%, transparent);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--theme-accent) 22%, transparent);
  }

  .instagram-input-wrapper.error {
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 60%,
      transparent
    );
  }

  .instagram-input-wrapper.success {
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 60%,
      transparent
    );
  }

  .instagram-input {
    border: none;
    background: transparent;
    padding-left: 8px;
  }

  .instagram-input:focus {
    border: none;
    background: transparent;
    outline: none;
  }

  /* Hint messages */
  .hint-message {
    font-size: var(--font-size-compact);
    margin: 6px 0 0 0;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .hint-message.error {
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 90%, transparent);
  }

  /* Accessibility */
  .input:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .instagram-input:focus-visible {
    outline: none;
  }

  .icon-btn:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .icon-btn {
      transition: none;
    }
  }
</style>
