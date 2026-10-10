<!--
  PronounsEditor Component

  Inline editor for pronouns with preset chip shortcuts.
  Supports free-text input and common preset options.
-->
<script lang="ts">
  import type { HapticFeedback } from "../../../application/services/haptic-feedback";
  import type { User } from "firebase/auth";
  import { authState } from "../../../auth/state/auth-state.svelte";
  import { toast } from "../../../toast/state/toast-state.svelte";
  import { doc, getDoc } from "firebase/firestore";
  import { getFirestoreInstance } from "../../../auth/firebase";
  import { onMount, tick } from "svelte";
  import { t } from "../../../i18n/i18n.svelte.js";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import AccountValueRow from "./AccountValueRow.svelte";

  interface Props {
    user: User;
    hapticService: HapticFeedback | null;
    onPronounsChanged?: (pronouns: string) => void;
  }

  let { user, hapticService, onPronounsChanged }: Props = $props();

  // Local state
  let currentPronouns = $state("");
  let editedPronouns = $state("");
  let isEditing = $state(false);
  let isSaving = $state(false);
  let saveError = $state("");
  let pronounsInput = $state<HTMLInputElement | null>(null);
  let editButton = $state<HTMLButtonElement | null>(null);

  // Preset options
  const PRESETS = $derived([
    { key: "he/him", label: t("pronoun_preset_he_him") },
    { key: "she/her", label: t("pronoun_preset_she_her") },
    { key: "they/them", label: t("pronoun_preset_they_them") },
  ]);

  // Load current pronouns from Firestore on mount
  onMount(async () => {
    try {
      const firestore = await getFirestoreInstance();
      const userDocRef = doc(firestore, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        currentPronouns = userDoc.data()?.pronouns || "";
      }
    } catch (err) {
      console.error("Failed to load pronouns:", err);
    }
  });

  // Derived: can save if changed
  const isSaveDisabled = $derived(
    isSaving || editedPronouns.trim() === currentPronouns
  );

  function startEditing() {
    editedPronouns = currentPronouns;
    isEditing = true;
    saveError = "";
    hapticService?.trigger("selection");
    void tick().then(() => pronounsInput?.focus());
  }

  async function cancelEditing() {
    isEditing = false;
    editedPronouns = "";
    saveError = "";
    await tick();
    editButton?.focus();
  }

  function selectPreset(preset: string) {
    hapticService?.trigger("selection");
    // Toggle: if already selected, clear it
    if (editedPronouns.trim() === preset) {
      editedPronouns = "";
    } else {
      editedPronouns = preset;
    }
  }

  async function save() {
    const trimmed = editedPronouns.trim();

    // Don't save if unchanged
    if (trimmed === currentPronouns) {
      cancelEditing();
      return;
    }

    isSaving = true;
    saveError = "";
    try {
      await authState.updatePronouns(trimmed);
      currentPronouns = trimmed;
      hapticService?.trigger("success");
      toast.success(
        trimmed ? t("profile_pronouns_updated") : t("profile_pronouns_cleared")
      );
      onPronounsChanged?.(trimmed);
      isEditing = false;
      await tick();
      editButton?.focus();
    } catch (err) {
      console.error("Failed to update pronouns:", err);
      hapticService?.trigger("error");
      saveError = t("profile_pronouns_update_failed");
      toast.error(
        err instanceof Error ? err.message : t("profile_pronouns_update_failed")
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
    <div class="label-row">
      <label class="label" for="pronouns-input"
        >{t("profile_pronouns_label")}</label
      >
      <span class="optional-badge">{t("profile_optional")}</span>
    </div>

    <div
      class="preset-chips"
      role="group"
      aria-label={t("nav_ui_pronoun_presets")}
    >
      {#each PRESETS as preset}
        <FilterChipBase
          label={preset.label}
          mode="toggle"
          size="sm"
          active={editedPronouns.trim() === preset.key}
          onclick={() => selectPreset(preset.key)}
          disabled={isSaving}
        />
      {/each}
    </div>

    <div class="input-row">
      <input
        id="pronouns-input"
        type="text"
        class="input"
        bind:this={pronounsInput}
        bind:value={editedPronouns}
        onkeydown={handleKeydown}
        maxlength="50"
        placeholder={t("profile_pronouns_placeholder")}
        disabled={isSaving}
        aria-invalid={saveError ? "true" : "false"}
        aria-describedby={saveError ? "pronouns-save-error" : undefined}
      />
      <div class="inline-actions">
        <button
          data-save-shortcut
          class="icon-btn save"
          onclick={save}
          disabled={isSaveDisabled}
          aria-label={t("nav_ui_save_pronouns")}
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
      <p id="pronouns-save-error" class="error-message" role="alert">
        <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
        {saveError}
      </p>
    {/if}
  {:else}
    <AccountValueRow
      label={t("profile_pronouns_label")}
      value={currentPronouns || t("profile_pronouns_not_set")}
      optional={true}
      empty={!currentPronouns}
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

  .label-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text);
  }

  .optional-badge {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    font-weight: 400;
    font-style: italic;
  }

  .preset-chips {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
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
    .icon-btn,
    .input {
      transition: none;
    }
  }
</style>
