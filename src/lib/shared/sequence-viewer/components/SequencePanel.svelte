<!--
  SequencePanel.svelte

  @deprecated LEGACY COMPONENT - Use SequenceViewerDrawerHost (mobile) or /sequence/[id] route (desktop) instead.
  This component uses the deprecated SequenceViewer. New sequence viewing/editing
  should use the current sequence viewer which provides split view with export capabilities.

  Legacy description (for reference):
  Unified sequence viewer panel that works in both Browse (Browse) and Edit (Create) modes.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { SequenceImageSharer } from "$lib/shared/share/services/sequence-image-sharer";
  import { getSequenceImageSharer } from "$lib/shared/share/get-sequence-image-sharer";
  import type { SequenceDetailLoader } from "$lib/shared/browse/services/sequence-detail-loader";
  import type { VideoCountManager } from "$lib/shared/browse/services/video-count-manager";
  import type { MediaType, MediaFormat, ExportSettings } from "../domain/types";
  import type { CollaborativeVideo } from "$lib/shared/video-collaboration/domain/collaborative-video";
  import type { VideoExportProgress } from "$lib/shared/compose/domain/video-export-types";
  import type {
    PlaybackMode,
    StepPlaybackStepSize,
  } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";

  import { getSequenceDetailLoader } from "$lib/shared/browse/get-sequence-detail-loader";
  import { getVideoCountManager } from "$lib/shared/browse/get-video-count-manager";
  import { onMount, untrack } from "svelte";

  import SequenceViewer from "./SequenceViewer.svelte";
  import QuickShareRow from "./QuickShareRow.svelte";
  // ExportControlsSection removed - edit mode now uses inline action buttons
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { openCreatorProfile } from "$lib/features/creators/state/creators-routing.svelte";

  /**
   * Panel mode determines which features and actions are available
   * - browse: Viewing sequences in Browse (creator info, variations, favorite, fork)
   * - edit: Working with sequences in Create (export controls, save to library)
   */
  export type PanelMode = "browse" | "edit";

  /**
   * Creator information for browse mode
   */
  export interface CreatorInfo {
    ownerId: string;
    displayName: string;
    avatarUrl?: string;
  }

  let {
    // Required
    sequence,
    mode = "browse" as PanelMode,

    // Common callbacks
    onClose,

    // Browse mode props
    variations = [] as SequenceData[],
    variationIndex = 0,
    creatorInfo = null as CreatorInfo | null,
    isOwned = false,
    isFavorite = false,
    onVariationSelect,
    onFavorite,
    onFork,
    onEdit,
    onDelete,
    onMaximize,
    onCreatorClick,
    onInviteCollaborators,
    onAction,

    // Edit mode props
    initialMediaType = "image" as MediaType,
    showVisibilitySettings = false,
    isExporting = false,
    exportProgress = null as VideoExportProgress | null,
    selectedFormat = "animation" as "animation" | "static" | "performance",
    onExport,
    onSaveToLibrary,
    onNameChange,
    onFormatChange,
    onCancelExport,
  }: {
    // Required
    sequence: SequenceData;
    mode?: PanelMode;

    // Common
    onClose?: () => void;

    // Browse mode
    variations?: SequenceData[];
    variationIndex?: number;
    creatorInfo?: CreatorInfo | null;
    isOwned?: boolean;
    isFavorite?: boolean;
    onVariationSelect?: (index: number, sequence: SequenceData) => void;
    onFavorite?: () => void;
    onFork?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onMaximize?: () => void;
    onCreatorClick?: () => void;
    onInviteCollaborators?: (video: CollaborativeVideo) => void;
    onAction?: (action: string, sequence: SequenceData) => void;

    // Edit mode
    initialMediaType?: MediaType;
    showVisibilitySettings?: boolean;
    isExporting?: boolean;
    exportProgress?: VideoExportProgress | null;
    selectedFormat?: "animation" | "static" | "performance";
    onExport?: (format: MediaFormat, settings: ExportSettings) => void;
    onSaveToLibrary?: () => void;
    onNameChange?: (name: string) => void;
    onFormatChange?: (format: "animation" | "static" | "performance") => void;
    onCancelExport?: () => void;
  } = $props();

  // Services
  let hapticService: HapticFeedback | null = null;
  let imageSharer = $state<SequenceImageSharer | null>(null);
  let detailLoader: SequenceDetailLoader | null = null;
  let videoCountManager: VideoCountManager | null = null;

  // Share state
  let isShareCopying = $state(false);
  let shareSuccess = $state(false);

  // Current media type for export format sync (track changes reactively)
  let currentMediaType = $state<MediaType>("image");

  // Sync with initialMediaType prop
  $effect(() => {
    currentMediaType = initialMediaType;
  });

  // Browse mode: video state
  let videoCount = $state(0);
  let showVideosPanel = $state(false);

  // Browse mode: full sequence with steps loaded
  let fullSequence = $state<SequenceData | null>(null);
  let isLoadingFullSequence = $state(false);

  // Has multiple variations
  const hasVariations = $derived(variations.length > 1);

  // Has creator info
  const hasCreatorInfo = $derived(Boolean(creatorInfo));

  // Effective sequence (full or original)
  const effectiveSequence = $derived(fullSequence ?? sequence);

  onMount(() => {
    hapticService = getHapticFeedback();
    imageSharer = getSequenceImageSharer();

    if (mode === "browse") {
      try {
        detailLoader = getSequenceDetailLoader();
        videoCountManager = getVideoCountManager();
      } catch (e) {
        console.warn(
          "[SequencePanel] Could not resolve browse mode services:",
          e
        );
      }
    }
  });

  // Load full sequence data when sequence changes (browse mode)
  $effect(() => {
    if (mode !== "browse") return;

    const currentSequence = sequence;
    const loader = detailLoader;

    fullSequence = null;
    isLoadingFullSequence = false;

    if (!currentSequence || !loader) return;

    if (currentSequence.steps && currentSequence.steps.length > 0) {
      fullSequence = currentSequence;
      return;
    }

    untrack(() => {
      isLoadingFullSequence = true;
      loader
        .loadFullSequence(currentSequence)
        .then((loaded) => {
          if (sequence.id === currentSequence.id && loaded) {
            fullSequence = loaded;
          }
        })
        .catch((err) => {
          console.warn("[SequencePanel] Failed to load full sequence:", err);
        })
        .finally(() => {
          if (sequence.id === currentSequence.id) {
            isLoadingFullSequence = false;
          }
        });
    });
  });

  // Load video count when sequence changes (browse mode)
  $effect(() => {
    if (mode !== "browse") return;

    const currentSequence = sequence;
    const manager = videoCountManager;

    videoCount = 0;
    if (!manager || !currentSequence) return;

    untrack(() => {
      manager
        .getVideoCount(currentSequence.id)
        .then((count) => {
          if (sequence.id === currentSequence.id) {
            videoCount = count;
          }
        })
        .catch((e) => {
          console.warn("[SequencePanel] Failed to load video count:", e);
        });
    });
  });

  // Derived: can share (full sequence loaded or edit mode)
  const canShare = $derived(mode === "edit" || !isLoadingFullSequence);

  // Share handlers
  async function handleCopyImage() {
    if (isShareCopying || !imageSharer || !canShare) return;

    isShareCopying = true;
    shareSuccess = false;
    hapticService?.trigger("selection");

    const result = await imageSharer.copyToClipboard(effectiveSequence);
    isShareCopying = false;

    if (result.success) {
      shareSuccess = true;
      hapticService?.trigger("success");
      setTimeout(() => {
        shareSuccess = false;
      }, 2000);
    } else {
      hapticService?.trigger("error");
    }
  }

  async function handleDownloadImage() {
    if (!imageSharer || !canShare) return;
    hapticService?.trigger("selection");
    const result = await imageSharer.downloadImage(effectiveSequence);
    if (result.success) {
      hapticService?.trigger("success");
    } else {
      hapticService?.trigger("error");
    }
  }

  async function handleNativeShare() {
    if (!imageSharer || !canShare) return;
    hapticService?.trigger("selection");
    const result = await imageSharer.nativeShare(effectiveSequence);
    if (result.success) {
      hapticService?.trigger("success");
    } else if (result.error) {
      hapticService?.trigger("error");
    }
  }

  function handleMediaTypeChange(type: MediaType) {
    currentMediaType = type;
  }

  function handleVariationClick(index: number) {
    if (index === variationIndex) return;
    const selectedVariation = variations[index];
    if (!selectedVariation) return;
    hapticService?.trigger("selection");
    onVariationSelect?.(index, selectedVariation);
  }

  function handleMaximize() {
    hapticService?.trigger("selection");
    // Delegate fullscreen to parent - parent can decide to open the sequence viewer
    onAction?.("fullscreen", effectiveSequence);
  }

  function handleCreatorClick() {
    if (!creatorInfo?.ownerId) return;
    hapticService?.trigger("selection");
    onClose?.();
    // The profile owns its URL, so this return path survives refresh and Back.
    void openCreatorProfile(
      creatorInfo.ownerId,
      creatorInfo.displayName,
      "sequence_viewer"
    );
  }

  function handleAction(action: string) {
    hapticService?.trigger("selection");
    onAction?.(action, effectiveSequence);
  }

  function handleVideosClick() {
    hapticService?.trigger("selection");
    showVideosPanel = true;
  }

  function handleVideosPanelClose() {
    showVideosPanel = false;
    videoCountManager?.refreshCount(sequence.id).then((count) => {
      videoCount = count;
    });
  }

  // Export handler for edit mode
  function handleExportClick() {
    const format: MediaFormat =
      currentMediaType === "image" ? "static" : "animation";
    onExport?.(format, { format });
  }
</script>

<div
  class="sequence-panel"
  class:browse-mode={mode === "browse"}
  class:edit-mode={mode === "edit"}
>
  <!-- Header -->
  <header class="panel-header">
    <div class="header-left">
      {#if onClose}
        <button
          type="button"
          class="icon-btn close-btn"
          onclick={() => onClose?.()}
          aria-label={t("compose_close_panel")}
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      {/if}
    </div>

    <h2 class="panel-title">{t("browse_sequence_details")}</h2>

    <div class="header-right">
      {#if mode === "browse"}
        <button
          type="button"
          class="icon-btn"
          onclick={handleMaximize}
          aria-label={t("browse_maximize")}
        >
          <i class="fas fa-expand" aria-hidden="true"></i>
        </button>
      {/if}
    </div>
  </header>

  <!-- Variation Strip (Browse mode only) -->
  {#if mode === "browse" && hasVariations}
    <div class="variation-strip">
      {#each variations as variation, index}
        <button
          type="button"
          class="variation-thumb"
          class:active={index === variationIndex}
          onclick={() => handleVariationClick(index)}
          aria-label={`Variation ${index + 1}`}
          aria-pressed={index === variationIndex}
        >
          <span class="variation-number">{index + 1}</span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Media Viewer -->
  <div class="media-container">
    {#if mode === "browse" && hasCreatorInfo && creatorInfo}
      <button
        type="button"
        class="creator-badge"
        onclick={handleCreatorClick}
        aria-label={`View ${creatorInfo.displayName}'s profile`}
      >
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
      </button>
    {/if}

    <SequenceViewer
      sequence={effectiveSequence}
      {initialMediaType}
      controlsLevel={mode === "edit" ? "full" : "standard"}
      showVisibilitySettings={true}
      onMediaTypeChange={handleMediaTypeChange}
    />
  </div>

  <!-- Quick Share Row - Always visible -->
  <QuickShareRow
    isCopying={isShareCopying}
    copySuccess={shareSuccess}
    canNativeShare={imageSharer?.canNativeShare() ?? false}
    disabled={!canShare}
    onCopy={handleCopyImage}
    onDownload={handleDownloadImage}
    onNativeShare={handleNativeShare}
  />

  <!-- Browse Mode: Action Buttons -->
  {#if mode === "browse"}
    <div class="action-buttons">
      {#if onFavorite}
        <button
          type="button"
          class="action-btn"
          class:active={isFavorite}
          onclick={() => {
            hapticService?.trigger("selection");
            onFavorite?.();
          }}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={isFavorite}
        >
          <i class="fas fa-heart" aria-hidden="true"></i>
          <span>{isFavorite ? "Favorited" : "Favorite"}</span>
        </button>
      {/if}

      {#if !isOwned && onFork}
        <button
          type="button"
          class="action-btn"
          onclick={() => {
            hapticService?.trigger("selection");
            onFork?.();
          }}
          aria-label="Fork this sequence"
        >
          <i class="fas fa-code-branch" aria-hidden="true"></i>
          <span>Fork</span>
        </button>
      {/if}

      <!-- Remix - opens sequence in the Constructor as a starting point -->
      <button
        type="button"
        class="action-btn primary"
        onclick={() => handleAction("edit")}
        aria-label={t("viewer_ui_remix")}
      >
        <i class="fas fa-pen-to-square" aria-hidden="true"></i>
        <span>{t("viewer_ui_remix")}</span>
      </button>

      {#if videoCount > 0 || isOwned}
        <button
          type="button"
          class="action-btn"
          onclick={handleVideosClick}
          aria-label={t("browse_view_videos")}
        >
          <i class="fas fa-video" aria-hidden="true"></i>
          <span>Videos{videoCount > 0 ? ` (${videoCount})` : ""}</span>
        </button>
      {/if}

      {#if isOwned && onDelete}
        <button
          type="button"
          class="action-btn danger"
          onclick={() => {
            hapticService?.trigger("selection");
            onDelete?.();
          }}
          aria-label={t("viewer_ui_delete_sequence")}
        >
          <i class="fas fa-trash" aria-hidden="true"></i>
          <span>{t("action_delete")}</span>
        </button>
      {/if}
    </div>
  {/if}

  <!-- Edit Mode: Action Buttons -->
  {#if mode === "edit"}
    <div class="action-buttons">
      {#if onSaveToLibrary}
        <button
          data-save-shortcut
          type="button"
          class="action-btn primary"
          onclick={() => {
            hapticService?.trigger("selection");
            onSaveToLibrary?.();
          }}
          aria-label="Save to library"
        >
          <i class="fas fa-bookmark" aria-hidden="true"></i>
          <span>{t("browse_save")}</span>
        </button>
      {/if}

      {#if onFavorite}
        <button
          type="button"
          class="action-btn"
          class:active={isFavorite}
          onclick={() => {
            hapticService?.trigger("selection");
            onFavorite?.();
          }}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={isFavorite}
        >
          <i class="fas fa-heart" aria-hidden="true"></i>
          <span>{isFavorite ? "Favorited" : "Favorite"}</span>
        </button>
      {/if}

      {#if onExport}
        <button
          type="button"
          class="action-btn"
          onclick={handleExportClick}
          disabled={isExporting}
          aria-label="Export sequence"
        >
          <i class="fas fa-file-export" aria-hidden="true"></i>
          <span>{isExporting ? "Exporting..." : "Export"}</span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<!-- Videos Panel (Browse mode) -->
{#if mode === "browse" && showVideosPanel}
  {#await import("$lib/shared/video-collaboration/components/VideosPanel.svelte") then { default: VideosPanel }}
    <VideosPanel
      sequence={effectiveSequence}
      onClose={handleVideosPanelClose}
      {onInviteCollaborators}
    />
  {/await}
{/if}

<style>
  .sequence-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    color: var(--theme-text, white);
    container-type: inline-size;
    container-name: sequence-panel;
  }

  /* Header */
  .panel-header {
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
    gap: 8px;
    min-width: var(--min-touch-target);
    z-index: 1;
  }

  .panel-title {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    margin: 0;
    white-space: nowrap;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    cursor: pointer;
    transition: all var(--duration-normal, 200ms) ease;
  }

  .icon-btn:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    color: var(--theme-text, white);
  }

  .icon-btn i {
    font-size: 18px;
  }

  /* Variation Strip */
  .variation-strip {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    overflow-x: auto;
    flex-shrink: 0;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    -webkit-overflow-scrolling: touch;
  }

  .variation-thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--min-touch-target);
    height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    transition: all var(--duration-normal, 200ms) ease;
    flex-shrink: 0;
  }

  .variation-thumb:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, white);
  }

  .variation-thumb.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 20%,
      transparent
    );
    border-color: var(--theme-accent, #6366f1);
    color: white;
  }

  .variation-number {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
  }

  /* Media Container */
  .media-container {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    padding: 12px 16px;
    overflow: hidden;
  }

  /* Creator Badge */
  .creator-badge {
    position: absolute;
    top: 20px;
    left: 24px;
    z-index: 10;
    padding: 0;
    background: color-mix(in srgb, var(--theme-shadow) 50%, transparent);
    border: 2px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: 50%;
    cursor: pointer;
    transition: all var(--duration-normal, 200ms) ease;
    box-shadow: 0 2px 8px var(--theme-shadow);
  }

  .creator-badge:hover {
    transform: scale(1.05);
    border-color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .creator-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    object-fit: cover;
    display: block;
  }

  .creator-avatar.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  /* Action Buttons */
  .action-buttons {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .action-btn {
    flex: 1;
    min-width: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal, 200ms) ease;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .action-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-btn.active {
    color: var(--semantic-error, #ef4444);
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 40%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
  }

  .action-btn.danger {
    color: var(--semantic-error, #ef4444);
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 30%,
      transparent
    );
  }

  .action-btn.danger:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
  }

  .action-btn.primary {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 50%,
      transparent
    );
    color: white;
  }

  .action-btn.primary:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 35%,
      transparent
    );
    border-color: var(--theme-accent, #6366f1);
  }

  .action-btn i {
    font-size: 16px;
  }

  /* Responsive */
  @container sequence-panel (max-width: 400px) {
    .action-buttons {
      flex-direction: column;
    }

    .action-btn {
      min-width: 100%;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .icon-btn,
    .action-btn,
    .variation-thumb,
    .creator-badge {
      transition: none;
    }

    .action-btn:active:not(:disabled),
    .creator-badge:hover {
      transform: none;
    }
  }
</style>
