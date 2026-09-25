<!--
  SequencePreviewPanel.svelte

  @deprecated LEGACY COMPONENT - Use SequenceViewerDrawerHost (mobile) or /sequence/[id] route (desktop) instead.
  This component uses the deprecated SequenceViewer. New sequence previews
  should use the current sequence viewer with its split view and export capabilities.

  Legacy description (for reference):
  Internal sequence preview panel used within Create module and Browse gallery.
-->
<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type {
    ViewerMode,
    MediaType,
    ExportProgress,
    MediaFormat,
    ExportSettings,
    CreatorInfo,
  } from "../domain/types";
  import SequenceViewer from "./SequenceViewer.svelte";
  import ExportControlsSection from "./ExportControlsSection.svelte";
  import SequenceViewerHelpModal from "./SequenceViewerHelpModal.svelte";
  import HelpButton from "$lib/shared/components/help/HelpButton.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  let {
    sequence,
    mode,
    initialMediaType = "image" as MediaType,

    // Common callbacks
    onClose,
    onShare,

    // Preview mode props
    onExport,
    isExporting = false,
    exportProgress = null as ExportProgress | null,

    // Full mode props
    onFavorite,
    onEdit,
    onDelete,
    onNameChange,
    isFavorited = false,
    creatorInfo = null as CreatorInfo | null,
  }: {
    sequence: SequenceData;
    mode: ViewerMode;
    initialMediaType?: MediaType;
    onClose?: () => void;
    onShare?: () => void;
    onExport?: (format: MediaFormat, settings: ExportSettings) => void;
    isExporting?: boolean;
    exportProgress?: ExportProgress | null;
    onFavorite?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onNameChange?: (newName: string) => void;
    isFavorited?: boolean;
    creatorInfo?: CreatorInfo | null;
  } = $props();

  // Derived display values
  const stepCount = $derived(sequence?.steps?.length ?? 0);

  // Track current media type - updated by SequenceViewer via callback
  // Child (SequenceViewer) is source of truth - it handles sessionStorage persistence
  // We initialize with a placeholder; the actual value comes from onMediaTypeChange callback
  let currentMediaType = $state<MediaType>("image" as MediaType);
  $effect.pre(() => { currentMediaType = initialMediaType; });

  // Export format syncs with media type: image → static, animation → animation
  const selectedFormat = $derived<MediaFormat>(
    currentMediaType === "image" ? "static" : "animation"
  );

  // Name editing
  let isEditingName = $state(false);
  let editedName = $state("");

  // Help modal state
  let showHelpModal = $state(false);

  // Sync editedName with sequence displayName when not editing
  $effect(() => {
    if (!isEditingName) {
      editedName = sequence?.displayName || "";
    }
  });

  function handleMediaTypeChange(type: MediaType) {
    currentMediaType = type;
  }

  function startEditingName() {
    editedName = sequence?.displayName || "";
    isEditingName = true;
  }

  function saveNameChange() {
    if (editedName.trim() && editedName !== sequence?.displayName) {
      onNameChange?.(editedName.trim());
    }
    isEditingName = false;
  }

  function cancelNameEdit() {
    editedName = sequence?.displayName || "";
    isEditingName = false;
  }
</script>

<div class="sequence-viewer-panel" class:preview-mode={mode === "preview"}>
  <!-- Header -->
  <header class="viewer-header">
    <div class="header-left">
      {#if onClose}
        <button
          class="icon-btn close-btn"
          onclick={() => onClose?.()}
          aria-label={t("viewer_close")}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      {/if}
    </div>

    <h2 class="title">{t("viewer_sequence_viewer")}</h2>

    <div class="header-right">
      <!-- Help button -->
      <HelpButton
        onclick={() => (showHelpModal = true)}
        ariaLabel={t("viewer_detail_help_with_sequence_viewer")}
      />

      {#if mode === "full" && onFavorite}
        <button
          class="icon-btn favorite-btn"
          class:active={isFavorited}
          onclick={() => onFavorite?.()}
          aria-label={isFavorited
            ? t("viewer_remove_from_favorites")
            : t("viewer_add_to_favorites")}
        >
          <i class="fas fa-heart" aria-hidden="true"></i>
        </button>
      {/if}

      {#if onShare}
        <button
          class="icon-btn share-btn"
          onclick={() => onShare?.()}
          aria-label={t("viewer_share")}
        >
          <i class="fas fa-share-alt" aria-hidden="true"></i>
        </button>
      {/if}
    </div>
  </header>

  <!-- Media Viewer -->
  <div class="media-section">
    <SequenceViewer
      {sequence}
      {initialMediaType}
      controlsLevel={mode === "preview" ? "full" : "standard"}
      onMediaTypeChange={handleMediaTypeChange}
    />
  </div>

  <!-- Mode-specific content -->
  {#if mode === "preview"}
    <!-- Export Controls Section -->
    <ExportControlsSection
      {selectedFormat}
      {isExporting}
      {exportProgress}
      onExport={(format, settings) => onExport?.(format, settings)}
    />
  {:else}
    <!-- Full Mode: Metadata & Actions -->
    <div class="metadata-section">
      <!-- Custom Name Editor -->
      {#if onNameChange}
        <div class="name-editor-section">
          <label for="custom-name" class="name-label">
            <i class="fas fa-tag" aria-hidden="true"></i>
            <span>{t("viewer_custom_name")}</span>
          </label>
          {#if isEditingName}
            <div class="name-edit-container">
              <input
                id="custom-name"
                type="text"
                class="name-input"
                bind:value={editedName}
                placeholder={sequence?.word || t("viewer_detail_enter_custom_name")}
                maxlength="50"
              />
              <div class="name-edit-actions">
                <button
                  class="name-action-btn save"
                  onclick={saveNameChange}
                  aria-label={t("viewer_save_name")}
                >
                  <i class="fas fa-check" aria-hidden="true"></i>
                </button>
                <button
                  class="name-action-btn cancel"
                  onclick={cancelNameEdit}
                  aria-label={t("common_cancel")}
                >
                  <i class="fas fa-times" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          {:else}
            <div class="name-display-container">
              <span class="name-display">
                {sequence?.displayName || sequence?.word || t("viewer_unnamed_sequence")}
              </span>
              <button
                class="name-edit-btn"
                onclick={startEditingName}
                aria-label={t("viewer_edit_custom_name")}
              >
                <i class="fas fa-edit" aria-hidden="true"></i>
              </button>
            </div>
          {/if}
        </div>
      {/if}

      {#if creatorInfo}
        <div class="creator-info">
          {#if creatorInfo.avatarUrl}
            <img
              src={creatorInfo.avatarUrl}
              alt={creatorInfo.displayName}
              class="creator-avatar"
            />
          {:else}
            <div class="creator-avatar placeholder">
              <i class="fas fa-user" aria-hidden="true"></i>
            </div>
          {/if}
          <span class="creator-name">{creatorInfo.displayName}</span>
        </div>
      {/if}

      <div class="sequence-stats">
        <span class="stat">
          <i class="fas fa-music" aria-hidden="true"></i>
          {t("viewer_beats_count", { count: stepCount })}
        </span>
      </div>
    </div>

    <!-- Action Buttons (full mode) -->
    <div class="action-buttons">
      {#if onEdit}
        <button class="action-btn" onclick={() => onEdit?.()}>
          <i class="fas fa-edit" aria-hidden="true"></i>
          <span>{t("viewer_edit")}</span>
        </button>
      {/if}
      {#if onDelete}
        <button class="action-btn danger" onclick={() => onDelete?.()}>
          <i class="fas fa-trash" aria-hidden="true"></i>
          <span>{t("viewer_delete")}</span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<!-- Help Modal -->
<SequenceViewerHelpModal
  bind:show={showHelpModal}
  onClose={() => (showHelpModal = false)}
/>

<style>
  .sequence-viewer-panel {
    display: flex;
    flex-direction: column;
    /* Ensure panel fills parent completely */
    height: 100%;
    min-height: 0;
    flex: 1;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    color: var(--theme-text, white);
  }

  /* Header */
  .viewer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
    position: relative;
  }

  .header-left,
  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    z-index: 1; /* Keep buttons above the centered title */
  }

  .header-left {
    min-width: 56px; /* Reserve space for close button */
  }

  .title {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-size: var(--font-size-lg);
    font-weight: 600;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: calc(100% - 160px); /* Prevent overlap with buttons */
    text-align: center;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .icon-btn svg {
    width: 20px;
    height: 20px;
  }

  .icon-btn i {
    font-size: 18px;
  }

  .icon-btn:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    color: var(--theme-text, white);
  }

  .favorite-btn.active {
    color: var(--semantic-error, #ef4444);
    border-color: var(--semantic-error, #ef4444);
  }

  /* Media Section - fills remaining space after header and controls */
  .media-section {
    flex: 1;
    min-height: 0;
    min-width: 0; /* Critical for flex overflow containment */
    display: flex;
    flex-direction: column;
    padding: 12px 16px;
    overflow: hidden; /* Contain all children within bounds */
  }

  /* Metadata Section (full mode) */
  .metadata-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 12px 16px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  /* Name Editor */
  .name-editor-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .name-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    margin: 0;
  }

  .name-label i {
    font-size: 16px;
  }

  .name-display-container {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
  }

  .name-display {
    flex: 1;
    font-size: var(--font-size-md, 15px);
    color: var(--theme-text, white);
  }

  .name-edit-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .name-edit-btn:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, white);
  }

  .name-edit-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .name-input {
    flex: 1;
    padding: 10px 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-accent, rgba(59, 130, 246, 0.5));
    border-radius: 8px;
    color: var(--theme-text, white);
    font-size: var(--font-size-md, 15px);
    outline: none;
    transition: border-color var(--duration-normal) ease;
  }

  .name-input:focus {
    border-color: var(--theme-accent, rgba(59, 130, 246, 1));
  }

  .name-input::placeholder {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .name-edit-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .name-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--theme-text, white);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .name-action-btn.save {
    background: var(--semantic-success, rgba(34, 197, 94, 0.15));
    border-color: var(--semantic-success, #22c55e);
    color: var(--semantic-success, #22c55e);
  }

  .name-action-btn.save:hover {
    background: var(--semantic-success, rgba(34, 197, 94, 0.25));
  }

  .name-action-btn.cancel {
    background: var(--semantic-error, rgba(239, 68, 68, 0.15));
    border-color: var(--semantic-error, #ef4444);
    color: var(--semantic-error, #ef4444);
  }

  .name-action-btn.cancel:hover {
    background: var(--semantic-error, rgba(239, 68, 68, 0.25));
  }

  /* Creator Info */
  .creator-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .creator-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
  }

  .creator-avatar.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .creator-name {
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
  }

  .sequence-stats {
    display: flex;
    gap: 16px;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .stat i {
    font-size: 12px;
  }

  /* Action Buttons (full mode) */
  .action-buttons {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .action-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .action-btn.danger {
    color: var(--semantic-error, #ef4444);
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 30%,
      transparent
    );
  }

  .action-btn.danger:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .icon-btn,
    .action-btn {
      transition: none;
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
    }
  }
</style>
