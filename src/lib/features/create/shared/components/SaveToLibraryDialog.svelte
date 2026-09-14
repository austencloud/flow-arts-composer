<!--
SaveToLibraryDialog.svelte

Dialog for configuring sequence metadata before saving to library.
Allows user to set name, visibility, tags, collections, and notes.
-->
<script lang="ts" module>
  import type { SequenceVisibility } from "$lib/shared/library/domain/models/library-sequence";

  import type { ResolvedPropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";
  export interface SaveMetadata {
    propConfig: ResolvedPropConfig;
    name: string;
    visibility: SequenceVisibility;
    tags: string[];
    collectionIds: string[];
    notes: string;
  }
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import PropPairField from "$lib/shared/pictograph/prop/components/PropPairField.svelte";
  import { captureActivePropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import CollectionPickerContent from "$lib/features/library/components/collection-picker/CollectionPickerContent.svelte";
  import { collectionsState } from "$lib/features/library/state/collections-state.svelte";

  let {
    isOpen = false,
    sequence,
    onSave,
    onCancel,
  } = $props<{
    isOpen: boolean;
    sequence: SequenceData | null;
    onSave?: (metadata: SaveMetadata) => void;
    onCancel?: () => void;
  }>();

  // Form state
  let saveProps = $state(captureActivePropConfig(getSettings()));
  let name = $state("");
  let tagInput = $state("");
  let tags = $state<string[]>([]);
  let notes = $state("");
  // Select mode: the sequence isn't saved yet, so we collect chosen collection
  // ids here and apply them after the save (see VideoRecordCoordinator).
  let selectedCollectionIds = $state<string[]>([]);

  // Always public - no private sequences for sharing
  const visibility: SequenceVisibility = "public";

  // Derived state
  const currentUser = $derived(authState.user);
  const displayName = $derived(
    currentUser?.displayName || currentUser?.email || "Anonymous"
  );

  // Reset form when sequence changes
  $effect(() => {
    if (sequence && isOpen) {
      saveProps = untrack(() => captureActivePropConfig(getSettings()));
      name = sequence.name || sequence.word || "";
      tags = [];
      tagInput = "";
      notes = "";
      selectedCollectionIds = [];
      collectionsState.ensureStarted();
    }
  });

  function handleAddTag() {
    const trimmedTag = tagInput.trim().toLowerCase();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      tags = [...tags, trimmedTag];
      tagInput = "";
    }
  }

  function handleRemoveTag(tag: string) {
    tags = tags.filter((t) => t !== tag);
  }

  function handleTagKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddTag();
    }
  }

  function handleSave() {
    if (!name.trim()) {
      // Could show validation error
      return;
    }

    const metadata: SaveMetadata = {
      propConfig: saveProps,
      name: name.trim(),
      visibility: "public", // Always public
      tags,
      collectionIds: selectedCollectionIds,
      notes: notes.trim(),
    };

    onSave?.(metadata);
  }

  function handleCancel() {
    onCancel?.();
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      onCancel?.();
    }
  }
</script>

<Drawer
  {isOpen}
  onOpenChange={handleOpenChange}
  labelledBy="save-to-library-title"
  closeOnBackdrop={true}
  showHandle={true}
  respectLayoutMode={false}
  placement="bottom"
  trapFocus={true}
  preventScroll={true}
  class="save-to-library-dialog"
>
  <div
    class="dialog-content"
    role="dialog"
    aria-labelledby="save-to-library-title"
  >
    <!-- Close button -->
    <button
      class="close-button"
      onclick={handleCancel}
      aria-label="Close dialog"
    >
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>

    <!-- Header -->
    <div class="dialog-header">
      <h2 id="save-to-library-title">Add to Gallery</h2>
      <p class="subtitle">Your sequence will be published to the gallery</p>
    </div>

    <!-- Form -->
    <div class="dialog-body">
      <PropPairField bind:value={saveProps} />
      <p>Used when someone chooses As saved.</p>
      <!-- Sequence Name -->
      <div class="form-group">
        <label for="sequence-name">
          Sequence Name <span class="required">*</span>
        </label>
        <input
          id="sequence-name"
          type="text"
          bind:value={name}
          placeholder="Enter sequence name"
          class="input-field"
          maxlength="100"
        />
      </div>

      <!-- Creator Info (compact) -->
      <div class="info-chip">
        <i class="fas fa-user" aria-hidden="true"></i>
        <span>By {displayName}</span>
        <span class="separator">•</span>
        <i class="fas fa-globe" aria-hidden="true"></i>
        <span>Public</span>
      </div>

      <!-- Tags -->
      <div class="form-group">
        <label for="tag-input">Tags</label>
        <div class="tag-input-container">
          <input
            id="tag-input"
            type="text"
            bind:value={tagInput}
            onkeydown={handleTagKeydown}
            placeholder="Add tags (press Enter)"
            class="input-field"
            maxlength="50"
          />
          <button
            type="button"
            class="add-tag-button"
            onclick={handleAddTag}
            disabled={!tagInput.trim()}
            aria-label="Add tag"
          >
            <i class="fas fa-plus" aria-hidden="true"></i>
          </button>
        </div>

        {#if tags.length > 0}
          <div class="tags-list">
            {#each tags as tag}
              <div class="tag-chip">
                <span class="tag-text">{tag}</span>
                <button
                  type="button"
                  class="tag-remove"
                  onclick={() => handleRemoveTag(tag)}
                  aria-label="Remove tag {tag}"
                >
                  <i class="fas fa-times" aria-hidden="true"></i>
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Collections -->
      <div class="form-group">
        <span class="form-label">Collections</span>
        <CollectionPickerContent
          mode="select"
          bind:selectedIds={selectedCollectionIds}
        />
      </div>

      <!-- Notes -->
      <div class="form-group">
        <label for="notes">Notes (optional)</label>
        <textarea
          id="notes"
          bind:value={notes}
          placeholder="Add personal notes about this sequence"
          class="textarea-field"
          rows="3"
          maxlength="500"
        ></textarea>
      </div>
    </div>

    <!-- Footer Actions -->
    <div class="dialog-footer">
      <button
        type="button"
        class="button button-secondary"
        onclick={handleCancel}
      >
        Cancel
      </button>
      <button
        data-save-shortcut
        type="button"
        class="button button-primary"
        onclick={handleSave}
        disabled={!name.trim()}
      >
        <i class="fas fa-globe" aria-hidden="true"></i>
        Publish & Continue
      </button>
    </div>
  </div>
</Drawer>

<style>
  /* Dialog Container */
  :global(.drawer-content.save-to-library-dialog) {
    --sheet-bg: var(--sheet-bg-gradient);
    --sheet-border: var(--sheet-border-medium);
    --sheet-shadow: none;
    max-height: 85vh;
  }

  .dialog-content {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
    padding-bottom: env(safe-area-inset-bottom);
  }

  /* Close Button */
  .close-button {
    position: absolute;
    top: 16px;
    right: 16px;
    width: var(--sheet-close-size-small);
    height: var(--sheet-close-size-small);
    border: none;
    border-radius: 50%;
    background: var(--sheet-close-bg);
    color: var(--theme-text, var(--theme-text));
    cursor: pointer;
    transition: all var(--sheet-transition-smooth);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-lg);
    z-index: 10;
  }

  .close-button:hover {
    background: var(--sheet-close-bg-hover);
    transform: scale(1.05);
  }

  .close-button:active {
    transform: scale(0.95);
  }

  /* Header */
  .dialog-header {
    padding: 24px 24px 16px;
    border-bottom: var(--sheet-header-border);
    background: var(--sheet-header-bg);
  }

  .dialog-header h2 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: 600;
    color: var(--theme-text);
  }

  .subtitle {
    margin: 4px 0 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  /* Body */
  .dialog-body {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* Form Groups */
  .form-group {
    margin-bottom: 24px;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  label,
  .form-label {
    display: block;
    margin-bottom: 8px;
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--theme-text, var(--theme-text));
  }

  .required {
    color: var(--semantic-error, var(--semantic-error));
  }

  /* Input Fields */
  .input-field,
  .textarea-field {
    width: 100%;
    padding: 12px 16px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
    color: var(--theme-text, var(--theme-text));
    font-size: var(--font-size-sm);
    font-family: inherit;
    transition: all var(--duration-normal) ease;
    box-sizing: border-box;
  }

  .input-field:focus,
  .textarea-field:focus {
    outline: none;
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
    border-color: color-mix(in srgb, var(--theme-accent) 50%, transparent);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--theme-accent) 10%, transparent);
  }

  .input-field::placeholder,
  .textarea-field::placeholder {
    color: color-mix(in srgb, var(--theme-text-dim) 70%, transparent);
  }

  .textarea-field {
    resize: vertical;
    min-height: 80px;
  }

  /* Info Chip */
  .info-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-sm);
    margin-bottom: 24px;
  }

  .info-chip i {
    opacity: 0.6;
  }

  .separator {
    opacity: 0.3;
  }

  /* Tag Input */
  .tag-input-container {
    display: flex;
    gap: 8px;
  }

  .tag-input-container .input-field {
    flex: 1;
  }

  .add-tag-button {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    flex-shrink: 0;
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, var(--theme-accent-strong)) 20%,
      transparent
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 30%,
        transparent
      );
    border-radius: 8px;
    color: var(--theme-accent-strong, var(--theme-accent-strong));
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .add-tag-button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent-strong) 30%, transparent);
    border-color: color-mix(
      in srgb,
      var(--theme-accent-strong, var(--theme-accent-strong)) 50%,
      transparent
    );
  }

  .add-tag-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* Tags List */
  .tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .tag-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, var(--theme-accent-strong)) 20%,
      transparent
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 30%,
        transparent
      );
    border-radius: 16px;
    color: var(--theme-accent-strong, var(--theme-accent-strong));
    font-size: var(--font-size-compact);
  }

  .tag-text {
    font-weight: 500;
  }

  .tag-remove {
    width: 16px;
    height: 16px;
    padding: 0;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
    transition: opacity var(--duration-normal) ease;
  }

  .tag-remove:hover {
    opacity: 1;
  }

  /* Footer */
  .dialog-footer {
    display: flex;
    gap: 12px;
    padding: 16px 24px;
    border-top: var(--sheet-header-border);
    background: var(--sheet-header-bg);
  }

  .button {
    flex: 1;
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .button-secondary {
    background: var(--theme-card-bg, var(--theme-card-bg));
    color: var(--theme-text-dim, var(--theme-text-dim));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  .button-secondary:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, var(--theme-text));
  }

  .button-primary {
    background: linear-gradient(
      135deg,
      var(--theme-accent-strong, var(--theme-accent-strong)) 0%,
      var(--theme-accent-strong) 100%
    );
    color: white;
    box-shadow: 0 4px 12px
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 40%,
        transparent
      );
  }

  .button-primary:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      var(--theme-accent-strong) 0%,
      var(--theme-accent-strong) 100%
    );
    box-shadow: 0 6px 16px
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 60%,
        transparent
      );
    transform: translateY(-1px);
  }

  .button-primary:active:not(:disabled) {
    transform: translateY(0);
  }

  .button-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* Mobile Responsiveness */
  @media (max-width: 640px) {
    .dialog-header {
      padding: 20px 20px 12px;
    }

    .dialog-header h2 {
      font-size: var(--font-size-xl);
    }

    .dialog-body {
      padding: 20px;
    }

    .dialog-footer {
      padding: 12px 20px;
    }
  }

  /* Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    .button,
    .add-tag-button,
    .input-field,
    .textarea-field {
      transition: none;
    }
  }
</style>
