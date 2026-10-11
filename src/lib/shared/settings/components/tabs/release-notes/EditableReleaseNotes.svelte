<!-- EditableReleaseNotes - Release notes with inline editing for admins -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { fly, scale } from "svelte/transition";

  let {
    text,
    canEdit,
    onSave,
    itemId,
    isEditing,
    onStartEdit,
    onEndEdit,
  }: {
    text: string;
    canEdit: boolean;
    onSave: (newText: string) => Promise<void>;
    itemId: string;
    isEditing: boolean;
    onStartEdit?: (id: string) => void;
    onEndEdit?: () => void;
  } = $props();

  let editText = $state("");
  let isSaving = $state(false);

  // Sync editText when text prop changes
  $effect(() => {
    editText = text;
  });
  let error = $state<string | null>(null);
  let textareaElement = $state<HTMLTextAreaElement | null>(null);

  // Track if user has made changes
  const hasChanges = $derived(editText.trim() !== text.trim());

  // Auto-resize textarea based on content
  function autoResizeTextarea(textarea: HTMLTextAreaElement) {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  }

  // Trigger resize when text changes
  $effect(() => {
    editText;
    if (textareaElement) {
      autoResizeTextarea(textareaElement);
    }
  });

  // Focus textarea when entering edit mode (proper alternative to autofocus attribute)
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
    editText = text;
    error = null;
  }

  function cancelEdit() {
    if (onEndEdit) {
      onEndEdit();
    }
    editText = text;
    error = null;
  }

  async function saveEdit() {
    if (!editText.trim()) {
      error = t("settings_release_notes_empty");
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
    // Enter to save (Shift+Enter for newlines)
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void saveEdit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelEdit();
    }
  }
</script>

{#if isEditing}
  <!-- Edit Mode -->
  <div class="edit-container">
    <textarea
      bind:this={textareaElement}
      bind:value={editText}
      onkeydown={handleKeydown}
      placeholder={t("settings_enter_release_notes")}
      disabled={isSaving}
    ></textarea>

    {#if error}
      <div class="error-message" in:fly={{ y: -10, duration: 200 }}>
        {error}
      </div>
    {:else if !hasChanges}
      <div class="hint" in:fly={{ y: -10, duration: 200 }}>
        {t("settings_edit_hint")}
      </div>
    {/if}

    {#if hasChanges}
      <div class="edit-actions" in:fly={{ y: 10, duration: 200 }}>
        <button
          type="button"
          class="action-btn save"
          onclick={() => void saveEdit()}
          disabled={isSaving}
        >
          {#if isSaving}
            <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            {t("settings_avatar_saving")}
          {:else}
            <i class="fas fa-check" aria-hidden="true"></i>
            {t("action_save")}
          {/if}
        </button>

        <button
          type="button"
          class="action-btn cancel"
          onclick={cancelEdit}
          disabled={isSaving}
        >
          <i class="fas fa-times" aria-hidden="true"></i>
          {t("action_cancel")}
        </button>
      </div>
    {/if}
  </div>
{:else}
  <!-- View Mode -->
  <button
    type="button"
    class="release-notes-text"
    class:clickable={canEdit}
    onclick={(e) => {
      if (canEdit) {
        e.stopPropagation(); // Prevent panel click handler from immediately closing
        startEdit();
      }
    }}
    disabled={!canEdit}
  >
    {text}
  </button>
{/if}

<style>
  /* View Mode */
  .release-notes-text {
    display: block;
    width: 100%;
    margin: 0;
    padding: 16px;
    background: var(--theme-card-bg);
    border: 1px solid transparent;
    border-radius: 12px;
    font-size: var(--font-size-sm);
    line-height: 1.6;
    color: var(--theme-text);
    white-space: pre-wrap;
    text-align: left;
    cursor: default;
    transition:
      background 0.2s,
      border-color 0.2s;
  }

  .release-notes-text.clickable {
    cursor: pointer;
  }

  .release-notes-text.clickable:hover {
    background: var(--theme-card-hover-bg);
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent-strong)) 30%,
      transparent
    );
  }

  .release-notes-text:disabled {
    cursor: default;
  }

  /* Edit Mode */
  .edit-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent-strong)) 30%,
        transparent
      );
    border-radius: 12px;
  }

  textarea {
    width: 100%;
    padding: 12px;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
    color: var(--theme-text, var(--theme-text));
    font-size: var(--font-size-sm);
    line-height: 1.6;
    font-family: inherit;
    resize: vertical;
    min-height: 100px;
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

  .hint {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    padding: 4px 8px;
  }

  kbd {
    display: inline-block;
    padding: 2px 5px;
    background: var(--theme-card-hover-bg);
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 3px;
    font-family: monospace;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .error-message {
    font-size: var(--font-size-compact);
    color: var(--semantic-error, var(--semantic-error));
    padding: 6px 8px;
    background: var(--semantic-error-dim);
    border-radius: 6px;
  }

  .edit-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    font-size: var(--font-size-compact);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-btn.save {
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent-strong)) 20%,
      transparent
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent-strong)) 40%,
        transparent
      );
    color: var(--theme-accent);
  }

  .action-btn.save:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent) 30%, transparent);
    color: var(--theme-accent-strong);
  }

  .action-btn.cancel {
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    color: var(--theme-text, var(--theme-text-dim));
  }

  .action-btn.cancel:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, var(--theme-text));
  }
</style>
