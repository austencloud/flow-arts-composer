<!-- EditableChangelogItem - A changelog entry with inline editing for admins -->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import type { ChangelogEntry } from "$lib/shared/versioning/domain/models/version-models";
  import type { Contributor } from "$lib/shared/versioning/domain/models/contributor-models";
  import { fly, scale } from "svelte/transition";
  import ContributorBadge from "./ContributorBadge.svelte";
  import ContributorPicker from "./ContributorPicker.svelte";
  import ChangelogRichText from "./ChangelogRichText.svelte";

  let {
    entry,
    canEdit,
    onSave,
    onDelete,
    onOpenFeedback,
    itemId,
    isEditing,
    onStartEdit,
    onEndEdit,
    contributors,
    allContributors,
    onUpdateContributors,
  }: {
    entry: ChangelogEntry;
    canEdit: boolean;
    onSave: (newText: string) => Promise<void>;
    onDelete?: () => Promise<void>;
    onOpenFeedback?: () => void;
    itemId: string;
    isEditing: boolean;
    onStartEdit?: (id: string) => void;
    onEndEdit?: () => void;
    contributors?: Contributor[];
    allContributors?: Contributor[];
    onUpdateContributors?: (ids: string[]) => void;
  } = $props();

  let editText = $state("");
  let isSaving = $state(false);

  // Sync editText when entry changes
  $effect(() => {
    editText = entry.text;
  });
  let isDeleting = $state(false);
  let showDeleteConfirm = $state(false);
  let error = $state<string | null>(null);
  let textareaElement = $state<HTMLTextAreaElement | null>(null);

  // Track if user has made changes
  const hasChanges = $derived(editText.trim() !== entry.text.trim());

  // Auto-resize textarea
  function autoResizeTextarea(textarea: HTMLTextAreaElement) {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  }

  // Auto-resize when text changes
  $effect(() => {
    editText; // Track changes
    if (textareaElement) {
      autoResizeTextarea(textareaElement);
    }
  });

  // Focus textarea when entering edit mode (proper alternative to autofocus)
  $effect(() => {
    if (isEditing && textareaElement) {
      textareaElement.focus();
    }
  });

  function startEdit() {
    if (!canEdit) return;
    if (onStartEdit) {
      onStartEdit(itemId);
    }
    editText = entry.text;
    error = null;
  }

  function cancelEdit() {
    if (onEndEdit) {
      onEndEdit();
    }
    editText = entry.text;
    error = null;
    showDeleteConfirm = false;
  }

  async function handleDelete() {
    if (!onDelete) return;

    isDeleting = true;
    error = null;

    try {
      await onDelete();
      if (onEndEdit) {
        onEndEdit();
      }
    } catch (err) {
      error = t("settings_delete_failed");
      showDeleteConfirm = false;
    } finally {
      isDeleting = false;
    }
  }

  async function saveEdit() {
    if (!editText.trim()) {
      error = t("settings_text_empty");
      return;
    }

    isSaving = true;
    error = null;

    try {
      await onSave(editText.trim());
      if (onEndEdit) {
        onEndEdit();
      }
    } catch (err) {
      error = t("settings_save_failed");
    } finally {
      isSaving = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void saveEdit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (showDeleteConfirm) {
        showDeleteConfirm = false;
      } else {
        cancelEdit();
      }
    } else if (event.key === "Delete" && onDelete) {
      event.preventDefault();
      if (showDeleteConfirm) {
        // Second Delete press - confirm deletion
        void handleDelete();
      } else {
        // First Delete press - show confirmation
        showDeleteConfirm = true;
      }
    }
  }

  const hasLink = $derived(!!entry.feedbackId);
</script>

{#if isEditing}
  <!-- Edit Mode -->
  <div class="edit-container">
    <textarea
      bind:this={textareaElement}
      bind:value={editText}
      onkeydown={handleKeydown}
      placeholder={t("settings_enter_changelog_text")}
      disabled={isSaving}
    ></textarea>

    {#if allContributors && onUpdateContributors}
      <ContributorPicker
        {allContributors}
        selectedIds={entry.contributorIds ?? []}
        onUpdate={onUpdateContributors}
      />
    {/if}

    {#if error}
      <div class="error-message" in:fly={{ y: -10, duration: 200 }}>
        {error}
      </div>
    {/if}

    {#if showDeleteConfirm}
      <div class="delete-confirm" in:fly={{ y: 10, duration: 200 }}>
        <span class="confirm-text"
          >{t("settings_delete_confirm")} <span class="hint">{t("settings_delete_confirm_hint")}</span></span
        >
        <div class="confirm-actions">
          <button
            type="button"
            class="glass-btn danger"
            onclick={() => void handleDelete()}
            disabled={isDeleting}
          >
            {#if isDeleting}
              <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            {:else}
              <i class="fas fa-trash" aria-hidden="true"></i>
            {/if}
            {t("settings_yes")}
          </button>
          <button
            type="button"
            class="glass-btn"
            onclick={() => (showDeleteConfirm = false)}
            disabled={isDeleting}
          >
            {t("common_no")}
          </button>
        </div>
      </div>
    {:else}
      <div class="edit-actions" in:fly={{ y: 10, duration: 200 }}>
        {#if onDelete}
          <button
            type="button"
            class="glass-btn danger"
            onclick={() => (showDeleteConfirm = true)}
            disabled={isSaving}
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
            {t("action_delete")}
          </button>
        {/if}

        {#if hasChanges}
          <button
            type="button"
            class="glass-btn primary flex-2"
            onclick={() => void saveEdit()}
            disabled={isSaving}
          >
            {#if isSaving}
              <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            {:else}
              <i class="fas fa-check" aria-hidden="true"></i>
            {/if}
            {t("action_save")}
          </button>
        {/if}

        <button
          type="button"
          class="glass-btn"
          onclick={cancelEdit}
          disabled={isSaving}
        >
          <i class="fas fa-times" aria-hidden="true"></i>
          {hasChanges ? t("action_cancel") : t("action_close")}
        </button>
      </div>
    {/if}
  </div>
{:else}
  <!-- View Mode -->
  <div class="change-item-container">
    <!-- div, not button: entry text can contain real links, and anchors
         can't nest inside a button. Role/tabindex only when editing is live. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="change-item"
      class:clickable={canEdit}
      class:editable={canEdit}
      role={canEdit ? "button" : undefined}
      tabindex={canEdit ? 0 : undefined}
      onclick={(e) => {
        if (canEdit) {
          e.stopPropagation();
          startEdit();
        }
      }}
      onkeydown={(e) => {
        if (canEdit && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          startEdit();
        }
      }}
    >
      <span class="bullet"></span>
      <div class="change-item-content">
        <span class="change-text"><ChangelogRichText text={entry.text} /></span>
        {#if contributors && contributors.length > 0}
          <div class="entry-contributors">
            {#each contributors as c (c.id)}
              <ContributorBadge contributor={c} />
            {/each}
          </div>
        {/if}
      </div>
    </div>

    {#if hasLink && onOpenFeedback}
      <button
        type="button"
        class="feedback-link-icon"
        onclick={(e) => {
          e.stopPropagation();
          onOpenFeedback();
        }}
        aria-label={t("settings_view_linked_feedback")}
        title={t("settings_view_linked_feedback")}
      >
        <i class="fas fa-external-link-alt" aria-hidden="true"></i>
      </button>
    {/if}
  </div>
{/if}

<style>
  /* View Mode Container */
  .change-item-container {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  /* View Mode */
  .change-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    flex: 1;
    padding: 10px 12px;
    background: var(--theme-card-bg);
    border: none;
    border-radius: 8px;
    text-align: left;
    cursor: default;
    transition:
      background 0.2s,
      transform 0.2s;
    position: relative;
  }

  .change-item.clickable {
    cursor: pointer;
  }

  .change-item.clickable:hover {
    background: var(--theme-card-hover-bg);
  }

  .change-item.clickable:active {
    transform: scale(0.99);
  }

  .change-item:disabled {
    cursor: default;
  }

  .bullet {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    margin-top: 6px;
    background: var(--theme-stroke-strong);
    border-radius: 50%;
  }

  .change-item-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .change-text {
    flex: 1;
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--theme-text);
  }

  .entry-contributors {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .feedback-link-icon {
    flex-shrink: 0;
    padding: 8px 10px;
    background: var(--theme-card-bg);
    border: none;
    color: var(--theme-stroke-strong);
    font-size: var(--font-size-compact);
    cursor: pointer;
    border-radius: 8px;
    transition: all var(--duration-normal);
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--min-touch-target); /* WCAG AA touch target */
    height: var(--min-touch-target);
  }

  .feedback-link-icon:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-accent);
    transform: scale(1.05);
  }

  .feedback-link-icon:active {
    transform: scale(0.95);
  }

  /* Edit Mode */
  .edit-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    padding: 10px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent-strong)) 30%,
        transparent
      );
    border-radius: 8px;
  }

  textarea {
    width: 100%;
    padding: 8px;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 6px;
    color: var(--theme-text, var(--theme-text));
    font-size: var(--font-size-sm);
    line-height: 1.5;
    font-family: inherit;
    resize: vertical;
    min-height: 60px;
  }

  textarea:focus {
    outline: none;
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent-strong)) 50%,
      transparent
    );
  }

  textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error-message {
    font-size: var(--font-size-compact);
    color: var(--semantic-error, var(--semantic-error));
    padding: 6px 10px;
    background: var(--semantic-error-dim);
    border-radius: 6px;
  }

  .edit-actions {
    display: flex;
    gap: 8px;
  }

  /* Glass morphism buttons - unified style */
  .glass-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: var(--min-touch-target); /* WCAG AA touch target */
    padding: 0 14px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    font-size: var(--font-size-compact);
    font-weight: 500;
    color: var(--theme-text);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .glass-btn.flex-2 {
    flex: 2;
  }

  .glass-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
    transform: translateY(-1px);
  }

  .glass-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .glass-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .glass-btn i {
    font-size: var(--font-size-compact);
  }

  /* Primary variant (accent) */
  .glass-btn.primary {
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent-strong)) 15%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent-strong)) 30%,
      transparent
    );
    color: var(--theme-accent);
  }

  .glass-btn.primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent-strong)) 45%,
      transparent
    );
    color: var(--theme-accent-strong);
  }

  /* Danger variant (error) */
  .glass-btn.danger {
    background: var(--semantic-error-dim);
    border-color: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 25%,
      transparent
    );
    color: color-mix(in srgb, var(--semantic-error) 90%, white);
  }

  .glass-btn.danger:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 18%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 40%,
      transparent
    );
    color: var(--semantic-error);
  }

  /* Delete confirmation bar */
  .delete-confirm {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px;
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 8%,
      transparent
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 20%,
        transparent
      );
    border-radius: 8px;
  }

  .confirm-text {
    font-size: var(--font-size-compact);
    color: var(--semantic-error);
    font-weight: 500;
  }

  .confirm-text .hint {
    font-weight: 400;
    opacity: 0.7;
    font-size: var(--font-size-compact);
  }

  .confirm-actions {
    display: flex;
    gap: 8px;
  }
</style>
