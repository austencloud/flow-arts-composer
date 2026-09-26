<!-- FeedbackEditDrawer - Drawer for editing user's own feedback -->
<script lang="ts">
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "$lib/shared/foundation/ui/DrawerHeader.svelte";
  import type {
    FeedbackItem,
    FeedbackType,
  } from "$lib/shared/feedback/domain/models/feedback-models";
  import { TYPE_CONFIG } from "$lib/shared/feedback/domain/models/feedback-models";
  import { responsiveLayoutManager } from "$lib/shared/create/services/responsive-layout-manager";
  import { onMount } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import {
    feedbackStatusLabel,
    feedbackTypeLabel,
    feedbackTypePlaceholder,
  } from "../../domain/feedback-display-labels";

  interface Props {
    isOpen: boolean;
    item: FeedbackItem;
    appendMode?: boolean;
    onSave: (
      updates: { type?: FeedbackType; description: string },
      appendMode: boolean
    ) => Promise<void>;
  }

  let {
    isOpen = $bindable(false),
    item,
    appendMode = false,
    onSave,
  }: Props = $props();

  // Responsive layout
  const layoutService = responsiveLayoutManager;
  let isSideBySide = $state(false);

  onMount(() => {
    if (layoutService) {
      isSideBySide = layoutService.shouldUseSideBySideLayout();
      // Subscribe to layout changes
      const unsubscribe = layoutService.onLayoutChange(() => {
        isSideBySide = layoutService!.shouldUseSideBySideLayout();
      });
      return unsubscribe;
    }
    return undefined;
  });

  const drawerPlacement = $derived(isSideBySide ? "right" : "bottom");

  // Local edit state - initialize with defaults, $effect syncs from item
  let editType = $state<FeedbackType>("bug");
  let editDescription = $state("");
  let additionalNotes = $state("");
  let isSaving = $state(false);
  let error = $state<string | null>(null);

  // Sync edit state when drawer opens or item changes
  $effect(() => {
    editType = item.type;
    editDescription = item.description;
    additionalNotes = "";
    error = null;
  });

  // Validation for full edit mode
  const isValidFullEdit = $derived(editDescription.trim().length >= 10);
  const hasChangesFullEdit = $derived(
    editType !== item.type || editDescription.trim() !== item.description.trim()
  );

  // Validation for append mode
  const isValidAppend = $derived(additionalNotes.trim().length >= 5);

  // Combined validation
  const canSave = $derived(
    appendMode ? isValidAppend : isValidFullEdit && hasChangesFullEdit
  );

  async function handleSave() {
    if (!canSave || isSaving) return;

    isSaving = true;
    error = null;

    try {
      if (appendMode) {
        await onSave({ description: additionalNotes.trim() }, true);
      } else {
        await onSave(
          {
            type: editType,
            description: editDescription.trim(),
          },
          false
        );
      }
      isOpen = false;
    } catch (err) {
      error = err instanceof Error ? err.message : t("feedback_save_failed");
    } finally {
      isSaving = false;
    }
  }

  function handleCancel() {
    isOpen = false;
  }

  const currentTypeConfig = $derived(TYPE_CONFIG[editType]);
</script>

<Drawer
  bind:isOpen
  placement={drawerPlacement}
  ariaLabel={appendMode
    ? t("feedback_add_notes_aria")
    : t("feedback_edit_aria")}
  class="feedback-edit-drawer {isSideBySide ? 'side-panel' : 'bottom-sheet'}"
  showHandle={!isSideBySide}
>
  <div
    class="edit-drawer-content"
    style="--active-type-color: {currentTypeConfig.color}"
  >
    <DrawerHeader
      title={appendMode ? t("feedback_add_notes") : t("feedback_edit_feedback")}
      onClose={handleCancel}
    />

    <div class="edit-form">
      {#if appendMode}
        <!-- Append Mode: Show original + add notes -->
        <div class="append-info">
          <i class="fas fa-info-circle" aria-hidden="true"></i>
          <span
            >{t("feedback_append_info", {
              status: feedbackStatusLabel(item.status).toLowerCase(),
            })}</span
          >
        </div>

        <!-- Original Description (read-only) -->
        <div class="field">
          <span class="field-label">{t("feedback_original_feedback")}</span>
          <div class="original-description">
            <span
              class="type-indicator"
              style="--type-color: {currentTypeConfig.color}"
            >
              <i class="fas {currentTypeConfig.icon}" aria-hidden="true"></i>
              {feedbackTypeLabel(editType, true)}
            </span>
            <p>{item.description}</p>
          </div>
        </div>

        <!-- Additional Notes -->
        <div class="field">
          <label for="additional-notes" class="field-label"
            >{t("feedback_additional_notes")}</label
          >
          <div class="textarea-wrapper">
            <textarea
              id="additional-notes"
              class="field-textarea"
              bind:value={additionalNotes}
              placeholder={t("feedback_additional_notes_placeholder")}
              rows="4"
            ></textarea>
          </div>
          <div class="field-hint">
            <span
              class="char-count"
              class:met={additionalNotes.trim().length >= 5}
            >
              {#if additionalNotes.trim().length < 5}
                {t("feedback_chars_needed", {
                  count: 5 - additionalNotes.trim().length,
                })}
              {:else}
                <i class="fas fa-check" aria-hidden="true"></i>
              {/if}
            </span>
          </div>
        </div>
      {:else}
        <!-- Full Edit Mode -->
        <!-- Type Selector -->
        <fieldset class="type-selector">
          <legend class="sr-only">{t("feedback_type")}</legend>
          <div class="segment-control">
            {#each Object.entries(TYPE_CONFIG) as [type, config]}
              <button
                type="button"
                class="segment"
                class:selected={editType === type}
                onclick={() => (editType = type as FeedbackType)}
                style="--type-color: {config.color}"
                aria-pressed={editType === type}
              >
                <i class="fas {config.icon}" aria-hidden="true"></i>
                <span class="segment-label">
                  {feedbackTypeLabel(type as FeedbackType, true)}
                </span>
              </button>
            {/each}
          </div>
        </fieldset>

        <!-- Description Field -->
        <div class="field">
          <label for="edit-description" class="field-label"
            >{t("feedback_description")}</label
          >
          <div class="textarea-wrapper">
            <textarea
              id="edit-description"
              class="field-textarea"
              bind:value={editDescription}
              placeholder={feedbackTypePlaceholder(editType)}
              rows="6"
            ></textarea>
          </div>
          <div class="field-hint">
            <span
              class="char-count"
              class:met={editDescription.trim().length >= 10}
            >
              {#if editDescription.trim().length < 10}
                {t("feedback_chars_needed", {
                  count: 10 - editDescription.trim().length,
                })}
              {:else}
                <i class="fas fa-check" aria-hidden="true"></i>
              {/if}
            </span>
          </div>
        </div>
      {/if}

      <!-- Error message -->
      {#if error}
        <div class="error-message" role="alert" aria-live="assertive">
          <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
          {error}
        </div>
      {/if}

      <!-- Actions -->
      <div class="form-actions">
        <button type="button" class="cancel-btn" onclick={handleCancel}>
          {t("feedback_cancel")}
        </button>
        <button
          data-save-shortcut
          type="button"
          class="save-btn"
          onclick={handleSave}
          disabled={!canSave || isSaving}
          aria-busy={isSaving}
        >
          {#if isSaving}
            <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
            <span>{t("feedback_saving")}</span>
          {:else}
            <i
              class="fas {appendMode ? 'fa-plus' : 'fa-check'}"
              aria-hidden="true"
            ></i>
            <span
              >{appendMode
                ? t("feedback_add_notes")
                : t("feedback_save_changes")}</span
            >
          {/if}
        </button>
      </div>
    </div>
  </div>
</Drawer>

<style>
  /* Side panel (desktop) styling */
  :global(.drawer-content.feedback-edit-drawer.side-panel) {
    width: 400px;
    max-width: 90vw;
    height: 100%;
    max-height: 100vh;
    max-height: 100dvh;
    background: var(--theme-panel-bg);
    border-left: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  /* Bottom sheet (mobile) styling */
  :global(.drawer-content.feedback-edit-drawer.bottom-sheet) {
    max-height: 85vh;
    max-height: 85dvh;
    background: var(--theme-panel-bg);
    border-top: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  .edit-drawer-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px));
    flex: 1;
    min-height: 0;
  }

  /* Side panel: No scroll on content, let flex handle expansion */
  :global(.drawer-content.feedback-edit-drawer.side-panel)
    .edit-drawer-content {
    overflow: visible;
    height: 100%;
  }

  /* Bottom sheet: Allow scroll for limited height */
  :global(.drawer-content.feedback-edit-drawer.bottom-sheet)
    .edit-drawer-content {
    overflow-y: auto;
    max-height: calc(85vh - 40px);
  }

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
    min-height: 0;
  }

  /* Append mode info banner */
  .append-info {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 10%,
      transparent
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, var(--semantic-info)) 25%,
        transparent
      );
    border-radius: 10px;
    font-size: 0.875rem;
    color: var(--theme-text);
    line-height: 1.4;
  }

  .append-info i {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--theme-accent, var(--semantic-info));
  }

  /* Original description display */
  .original-description {
    padding: 12px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
  }

  .original-description .type-indicator {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    padding: 4px 10px;
    background: color-mix(in srgb, var(--type-color) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--type-color) 30%, transparent);
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--type-color);
  }

  .original-description p {
    margin: 0;
    font-size: 0.9375rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
    line-height: 1.5;
    white-space: pre-wrap;
  }

  /* Type Selector */
  .type-selector {
    border: none;
    padding: 0;
    margin: 0;
    flex-shrink: 0;
  }

  .segment-control {
    display: flex;
    gap: 6px;
    padding: 4px;
    background: var(--theme-card-bg);
    border-radius: 10px;
    border: 1px solid var(--theme-stroke);
  }

  .segment {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    padding: 8px 12px;
    background: transparent;
    border: 1.5px solid transparent;
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .segment:hover:not(.selected) {
    color: var(--theme-text-dim);
    border-color: color-mix(in srgb, var(--type-color) 35%, transparent);
  }

  .segment:hover:not(.selected) i {
    color: var(--type-color);
  }

  .segment.selected {
    color: var(--theme-text);
    border-color: var(--type-color);
    background: color-mix(in srgb, var(--type-color) 15%, transparent);
  }

  .segment.selected i {
    color: var(--type-color);
  }

  .segment-label {
    font-size: 0.8125rem;
  }

  /* Field */
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Make description field expand to fill available space */
  .field:has(.field-textarea) {
    flex: 1;
    min-height: 0;
  }

  .field-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--theme-text-dim, var(--theme-text-dim));
    flex-shrink: 0;
  }

  .textarea-wrapper {
    background: var(--theme-card-bg);
    border: 1.5px solid
      color-mix(
        in srgb,
        var(--active-type-color) 20%,
        var(--theme-stroke, var(--theme-stroke))
      );
    border-radius: 10px;
    transition: border-color var(--duration-normal) ease;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .textarea-wrapper:focus-within {
    border-color: var(--active-type-color);
  }

  .field-textarea {
    width: 100%;
    padding: 12px;
    background: transparent;
    border: none;
    color: var(--theme-text);
    font-size: 1rem;
    font-family: inherit;
    min-height: 120px;
    resize: none;
    line-height: 1.5;
    flex: 1;
  }

  .field-textarea:focus {
    outline: none;
  }

  .field-textarea::placeholder {
    color: var(--theme-text-dim);
  }

  .field-hint {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .char-count {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--theme-text-dim);
  }

  .char-count.met {
    color: var(--semantic-success, var(--semantic-success));
  }

  /* Error */
  .error-message {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 15%,
      transparent
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 30%,
        transparent
      );
    border-radius: 8px;
    color: var(--semantic-error, var(--semantic-error));
    font-size: 0.875rem;
  }

  /* Actions */
  .form-actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
    flex-shrink: 0;
  }

  .cancel-btn,
  .save-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--min-touch-target);
    padding: 12px 20px;
    border-radius: 10px;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .cancel-btn {
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke-strong));
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .cancel-btn:hover {
    background: var(--theme-stroke);
    color: var(--theme-text, var(--theme-text));
  }

  .save-btn {
    background: linear-gradient(
      135deg,
      var(--active-type-color),
      color-mix(in srgb, var(--active-type-color), black 10%)
    );
    border: none;
    color: white;
  }

  .save-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--active-type-color) 30%, transparent);
  }

  .save-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }
</style>
