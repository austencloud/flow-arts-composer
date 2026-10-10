<!--
  UsernameEditor Component

  Inline editor for username with real-time availability checking and suggestions.
  Extracted from AccountSettingsSection for single responsibility.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { checkUsernameAvailability } from "#lib/shared/auth/services/username-validator.js";
  import type { HapticFeedback } from "../../../application/services/haptic-feedback";
  import type { User } from "firebase/auth";
  import { authState } from "../../../auth/state/auth-state.svelte";
  import { toast } from "../../../toast/state/toast-state.svelte";
  import { doc, getDoc } from "firebase/firestore";
  import { getFirestoreInstance } from "../../../auth/firebase";
  import { onMount, tick } from "svelte";
  import AccountValueRow from "./AccountValueRow.svelte";

  interface Props {
    user: User;
    hapticService: HapticFeedback | null;
    onUsernameChanged?: (username: string) => void;
  }

  let { user, hapticService, onUsernameChanged }: Props = $props();

  // Local state
  let currentUsername = $state("");
  let editedUsername = $state("");
  let isEditing = $state(false);
  let isSaving = $state(false);
  let isChecking = $state(false);
  let error = $state("");
  let saveError = $state("");
  let isAvailable = $state(false);
  let suggestions = $state<string[]>([]);
  let checkTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let usernameInput = $state<HTMLInputElement | null>(null);
  let editButton = $state<HTMLButtonElement | null>(null);

  // Load current username from Firestore on mount
  onMount(async () => {
    try {
      const firestore = await getFirestoreInstance();
      const userDocRef = doc(firestore, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        currentUsername = userDoc.data()?.username || "";
      }
    } catch (err) {
      console.error("Failed to load username:", err);
    }
  });

  const isSaveDisabled = $derived(
    isSaving ||
      isChecking ||
      !isAvailable ||
      !editedUsername.trim() ||
      editedUsername.trim().toLowerCase() === currentUsername.toLowerCase()
  );
  const feedbackError = $derived(saveError || error);

  function startEditing() {
    editedUsername = currentUsername;
    isEditing = true;
    error = "";
    saveError = "";
    isAvailable = false;
    suggestions = [];
    hapticService?.trigger("selection");
    void tick().then(() => usernameInput?.focus());
  }

  async function cancelEditing() {
    isEditing = false;
    editedUsername = "";
    error = "";
    saveError = "";
    isAvailable = false;
    suggestions = [];
    if (checkTimeoutId) {
      clearTimeout(checkTimeoutId);
      checkTimeoutId = null;
    }
    await tick();
    editButton?.focus();
  }

  function handleInput() {
    // Clear previous timeout
    if (checkTimeoutId) {
      clearTimeout(checkTimeoutId);
    }

    error = "";
    saveError = "";
    isAvailable = false;
    suggestions = [];

    const username = editedUsername.trim();
    if (!username) return;

    // Debounce the availability check
    checkTimeoutId = setTimeout(() => {
      checkAvailability(username);
    }, 500);
  }

  async function checkAvailability(username: string) {
    // Skip check if unchanged
    if (username.toLowerCase() === currentUsername.toLowerCase()) {
      isAvailable = true;
      return;
    }

    isChecking = true;
    try {
      const result = await checkUsernameAvailability(username, user.uid);
      if (result.isValid) {
        isAvailable = true;
        error = "";
      } else {
        isAvailable = false;
        error = result.error || t("nav_ui_username_unavailable");
        suggestions = result.suggestions || [];
      }
    } catch (err) {
      console.error("Failed to check username:", err);
      error = t("nav_ui_unable_to_check_availability");
    } finally {
      isChecking = false;
    }
  }

  async function save() {
    const trimmedUsername = editedUsername.trim();
    if (!trimmedUsername || !isAvailable) {
      cancelEditing();
      return;
    }

    // Don't save if unchanged
    if (trimmedUsername.toLowerCase() === currentUsername.toLowerCase()) {
      cancelEditing();
      return;
    }

    isSaving = true;
    saveError = "";
    try {
      await authState.updateUsername(trimmedUsername);
      currentUsername = trimmedUsername;
      onUsernameChanged?.(trimmedUsername);
      hapticService?.trigger("success");
      toast.success(t("nav_ui_username_updated_successfully"));
      isEditing = false;
      await tick();
      editButton?.focus();
    } catch (err) {
      console.error("Failed to update username:", err);
      hapticService?.trigger("error");
      saveError = t("nav_ui_username_couldn_t_be_saved_try_again");
      toast.error(
        err instanceof Error
          ? err.message
          : t("nav_ui_failed_to_update_username")
      );
    } finally {
      isSaving = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && isAvailable && !isChecking) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  }

  function selectSuggestion(suggestion: string) {
    editedUsername = suggestion;
    handleInput();
  }
</script>

<div data-save-shortcut-scope class="section">
  {#if isEditing}
    <label class="label" for="username">{t("nav_ui_username")}</label>
    <div class="input-row">
      <div
        class="username-input-wrapper"
        class:error
        class:success={isAvailable && !isChecking}
      >
        <span class="username-prefix">@</span>
        <input
          id="username"
          type="text"
          class="input username-input"
          bind:this={usernameInput}
          bind:value={editedUsername}
          oninput={handleInput}
          onkeydown={handleKeydown}
          maxlength="20"
          placeholder={t("nav_ui_your_username")}
          disabled={isSaving}
          aria-invalid={feedbackError ? "true" : "false"}
          aria-describedby={feedbackError ? "username-error" : undefined}
        />
      </div>
      <div class="inline-actions">
        <button
          data-save-shortcut
          class="icon-btn save"
          onclick={save}
          disabled={isSaveDisabled}
          aria-label={t("nav_ui_save_username")}
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
    {#if isChecking}
      <p class="hint-message checking">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        {t("nav_ui_checking_availability")}
      </p>
    {:else if feedbackError}
      <p id="username-error" class="hint-message error" role="alert">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        {feedbackError}
      </p>
      {#if error && suggestions.length > 0}
        <div class="suggestions">
          <span class="suggestions-label">{t("poi_lab_try_label")}</span>
          {#each suggestions as suggestion}
            <button
              type="button"
              class="suggestion-btn"
              onclick={() => selectSuggestion(suggestion)}
            >
              @{suggestion}
            </button>
          {/each}
        </div>
      {/if}
    {:else if isAvailable && editedUsername.trim()}
      <p class="hint-message success">
        <i class="fas fa-check-circle" aria-hidden="true"></i>
        {t("nav_ui_username_available")}
      </p>
    {/if}
  {:else}
    <AccountValueRow
      label={t("nav_ui_username")}
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

  /* Username input wrapper */
  .username-input-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    border: 1.5px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    border-radius: 0.5rem;
    transition: all var(--duration-normal) ease;
  }

  .username-input-wrapper:focus-within {
    border-color: color-mix(in srgb, var(--theme-accent) 60%, transparent);
    background: color-mix(in srgb, var(--theme-text) 11%, transparent);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--theme-accent) 22%, transparent);
  }

  .username-input-wrapper.error {
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 60%,
      transparent
    );
  }

  .username-input-wrapper.success {
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 60%,
      transparent
    );
  }

  .username-prefix {
    padding: 0.75rem 0 0.75rem 1rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
    user-select: none;
  }

  .username-input {
    border: none;
    background: transparent;
    padding-left: 4px;
  }

  .username-input:focus {
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

  .hint-message.checking {
    color: var(--theme-text-dim);
  }

  .hint-message.error {
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 90%, transparent);
  }

  .hint-message.success {
    color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 90%,
      transparent
    );
  }

  /* Suggestions */
  .suggestions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }

  .suggestions-label {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .suggestion-btn {
    min-height: var(--min-touch-target, 44px);
    padding: 0.5rem 0.75rem;
    font-size: var(--font-size-compact);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .suggestion-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    color: var(--theme-text);
  }

  /* Accessibility */
  .input:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .username-input:focus-visible {
    outline: none;
  }

  .icon-btn:focus-visible,
  .suggestion-btn:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .icon-btn,
    .suggestion-btn {
      transition: none;
    }
  }
</style>
