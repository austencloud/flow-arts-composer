<!-- MyFeedbackDetail - Detail view with responsive drawer (bottom sheet on mobile, side panel on desktop) -->
<script lang="ts">
  import { onMount } from "svelte";
  import type {
    FeedbackItem,
    FeedbackType,
    FeedbackStatus,
    FeedbackPriority,
  } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import {
    STATUS_CONFIG,
    TYPE_CONFIG,
    PRIORITY_CONFIG,
  } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import FeedbackEditDrawer from "./FeedbackEditDrawer.svelte";
  import FeedbackReplyPanel from "./FeedbackReplyPanel.svelte";
  import MediaSpotlight from "#lib/components/media/spotlight/MediaSpotlight.svelte";
  import StatusTimeline from "./StatusTimeline.svelte";
  import { useUserPreview } from "#lib/shared/debug/context/user-preview-context.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { getLocale, t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    feedbackPriorityLabel,
    feedbackStatusLabel,
    feedbackTypeLabel,
  } from "../../domain/feedback-display-labels";

  let {
    item,
    isOpen = false,
    onClose,
    onUpdate,
    onDelete,
  } = $props<{
    item: FeedbackItem | null;
    isOpen?: boolean;
    onClose: () => void;
    onUpdate: (
      feedbackId: string,
      updates: { type?: FeedbackType; description?: string },
      appendMode?: boolean
    ) => Promise<FeedbackItem>;
    onDelete: (feedbackId: string) => Promise<void>;
  }>();

  // Local drawer state that syncs with parent's isOpen
  let drawerOpen = $state(false);

  // Sync with parent prop
  $effect(() => {
    drawerOpen = isOpen;
  });

  // Responsive placement
  let isMobile = $state(false);
  const placement = $derived(isMobile ? "bottom" : "right") as
    | "bottom"
    | "right";

  onMount(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    isMobile = mediaQuery.matches;
    const handler = (e: MediaQueryListEvent) => {
      isMobile = e.matches;
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  });

  // Get preview context for read-only checks
  const preview = useUserPreview();

  let isEditDrawerOpen = $state(false);
  let showDeleteConfirm = $state(false);
  let isDeleting = $state(false);
  let deleteDialogRef = $state<HTMLDialogElement | null>(null);

  // Show/hide delete dialog using native dialog API
  $effect(() => {
    if (showDeleteConfirm && deleteDialogRef) {
      deleteDialogRef.showModal();
    } else if (!showDeleteConfirm && deleteDialogRef?.open) {
      deleteDialogRef.close();
    }
  });

  const typeConfig = $derived(
    item ? TYPE_CONFIG[item.type as FeedbackType] : null
  );
  const statusConfig = $derived(
    item ? STATUS_CONFIG[item.status as FeedbackStatus] : null
  );
  const priorityConfig = $derived(
    item?.priority ? PRIORITY_CONFIG[item.priority as FeedbackPriority] : null
  );

  // Preview mode = read-only, no editing allowed
  const isPreviewMode = $derived(preview.isReadOnly);

  // Can edit if new, in-progress, or in-review (not completed/archived) AND not in preview mode
  const canEdit = $derived(
    item &&
      !isPreviewMode &&
      ["new", "in-progress", "in-review"].includes(item.status)
  );

  // Full edit mode only for "new" status, otherwise append mode
  const isAppendMode = $derived(item ? item.status !== "new" : false);

  // Can delete only when status is "new" (not yet picked up by admin)
  const canDelete = $derived(item && !isPreviewMode && item.status === "new");

  // Check if should show reply panel (for feedback-needs-info or feedback-response statuses)
  const shouldShowReplyPanel = $derived(
    item && ["feedback-needs-info", "feedback-response"].includes(item.status)
  );

  let isReplySubmitting = $state(false);

  // Image viewer state
  let isImageViewerOpen = $state(false);
  let imageViewerIndex = $state(0);

  function openImageViewer(index: number) {
    imageViewerIndex = index;
    isImageViewerOpen = true;
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString(getLocale(), {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  async function handleSave(
    updates: { type?: FeedbackType; description: string },
    appendMode: boolean
  ) {
    if (!item) return;
    await onUpdate(item.id, updates, appendMode);
  }

  async function handleReplySubmit(reply: string) {
    if (!item) return;
    isReplySubmitting = true;
    try {
      await onUpdate(item.id, { description: reply }, true);
    } finally {
      isReplySubmitting = false;
    }
  }

  async function handleDelete() {
    if (!item) return;
    isDeleting = true;
    try {
      await onDelete(item.id);
      // Panel will close automatically when item is removed
    } catch (err) {
      console.error("Failed to delete feedback:", err);
      showDeleteConfirm = false;
    } finally {
      isDeleting = false;
    }
  }

  function handleClose() {
    showDeleteConfirm = false;
    onClose();
  }
</script>

<Drawer
  bind:isOpen={drawerOpen}
  {placement}
  showHandle={isMobile}
  closeOnBackdrop={true}
  closeOnEscape={true}
  onclose={handleClose}
  class="feedback-detail-drawer"
  backdropClass="feedback-detail-backdrop"
  ariaLabel={t("feedback_details")}
>
  {#if item && typeConfig && statusConfig}
    <div class="detail-container">
      <!-- Header -->
      <header class="panel-header">
        <div class="header-row">
          <div class="header-meta">
            <span class="type-badge" style="--badge-color: {typeConfig.color}">
              <i class="fas {typeConfig.icon}" aria-hidden="true"></i>
              <span class="badge-label">{feedbackTypeLabel(item.type)}</span>
            </span>
            <span
              class="status-badge"
              style="--badge-color: {statusConfig.color}"
            >
              <i class="fas {statusConfig.icon}" aria-hidden="true"></i>
              <span class="badge-label">{feedbackStatusLabel(item.status)}</span
              >
            </span>
            {#if priorityConfig}
              <span
                class="priority-badge"
                style="--badge-color: {priorityConfig.color}"
              >
                <i class="fas {priorityConfig.icon}" aria-hidden="true"></i>
                <span class="badge-label"
                  >{feedbackPriorityLabel(item.priority!)}</span
                >
              </span>
            {/if}
          </div>
          <div class="header-actions">
            {#if canEdit}
              <button
                class="action-button edit"
                onclick={() => (isEditDrawerOpen = true)}
                type="button"
                aria-label={t("feedback_edit_aria")}
              >
                <i class="fas fa-pen" aria-hidden="true"></i>
              </button>
            {/if}
            {#if canDelete}
              <button
                class="action-button delete"
                onclick={() => (showDeleteConfirm = true)}
                type="button"
                aria-label={t("feedback_delete")}
              >
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            {/if}
            <button
              class="action-button close"
              onclick={handleClose}
              type="button"
              aria-label={t("feedback_close_panel")}
            >
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </header>

      <!-- Content -->
      <div class="feedback-detail-body">
        <h2 class="item-title">{item.title}</h2>

        <div class="meta-row">
          <span class="date">
            <i class="fas fa-calendar" aria-hidden="true"></i>
            {formatDate(item.createdAt)}
          </span>
          {#if item.updatedAt}
            <span class="updated">
              <i class="fas fa-clock" aria-hidden="true"></i>
              {t("feedback_updated_date", { date: formatDate(item.updatedAt) })}
            </span>
          {/if}
        </div>

        <div class="description-section">
          <h3>{t("feedback_your_feedback")}</h3>
          <p class="description">{item.description}</p>
        </div>

        <!-- Status Timeline - Show history of status changes -->
        {#if item.statusHistory || item.status !== "new"}
          <StatusTimeline
            history={item.statusHistory}
            currentStatus={item.status}
            createdAt={item.createdAt}
            userFacingNotes={item.userFacingNotes}
            fixedInVersion={item.fixedInVersion}
          />
        {/if}

        <!-- Screenshots -->
        {#if item.imageUrls && item.imageUrls.length > 0}
          <div class="screenshots-section">
            <h3>
              <i class="fas fa-images" aria-hidden="true"></i>
              {t("feedback_screenshots_count", {
                count: item.imageUrls.length,
              })}
            </h3>
            <div class="screenshots-grid">
              {#each item.imageUrls as imageUrl, index}
                <button
                  type="button"
                  class="screenshot-btn"
                  onclick={() => openImageViewer(index)}
                  aria-label={t("feedback_view_screenshot", { n: index + 1 })}
                >
                  <img
                    src={imageUrl}
                    alt={t("feedback_screenshot_alt", { n: index + 1 })}
                    class="screenshot-thumb"
                  />
                  <div class="screenshot-overlay">
                    <i class="fas fa-expand" aria-hidden="true"></i>
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Context info -->
        {#if item.capturedModule}
          <div class="context-section">
            <h3>{t("feedback_context")}</h3>
            <div class="context-tags">
              <span class="context-tag">
                <i class="fas fa-cube" aria-hidden="true"></i>
                {item.capturedModule}
              </span>
              {#if item.capturedTab}
                <span class="context-tag">
                  <i class="fas fa-folder" aria-hidden="true"></i>
                  {item.capturedTab}
                </span>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Resolution Notes - Show user-facing notes if available, otherwise admin notes -->
        {#if item.userFacingNotes || item.adminNotes}
          <div class="response-section">
            <h3>
              <i class="fas fa-check-circle" aria-hidden="true"></i>
              {t("feedback_resolution")}
            </h3>
            <div class="response-card resolution">
              <p class="response-message">
                {item.userFacingNotes || item.adminNotes}
              </p>
              <div class="resolution-meta">
                {#if item.updatedAt}
                  <span class="response-date">
                    {t("feedback_resolved_date", {
                      date: formatDate(item.updatedAt),
                    })}
                  </span>
                {/if}
                {#if item.fixedInVersion}
                  <span class="version-badge">
                    <i class="fas fa-tag" aria-hidden="true"></i>
                    v{item.fixedInVersion}
                  </span>
                {/if}
              </div>
            </div>
          </div>
        {/if}

        <!-- Reply Panel (for feedback-needs-info and feedback-response) -->
        {#if shouldShowReplyPanel && !isPreviewMode}
          <FeedbackReplyPanel
            {item}
            onSubmit={handleReplySubmit}
            isLoading={isReplySubmitting}
          />
        {/if}
      </div>

      <!-- Delete Confirmation Dialog -->
      <dialog
        class="delete-confirm-dialog"
        bind:this={deleteDialogRef}
        onclose={() => (showDeleteConfirm = false)}
        onclick={(e) => {
          // Close when clicking backdrop (the dialog element itself, not its contents)
          if (e.target === e.currentTarget) {
            deleteDialogRef?.close();
          }
        }}
      >
        <div class="dialog-content">
          <div class="dialog-icon">
            <i class="fas fa-trash-alt" aria-hidden="true"></i>
          </div>
          <h3>{t("feedback_delete_confirm_title")}</h3>
          <p>
            {t("feedback_delete_confirm_message")}
          </p>
          <div class="dialog-actions">
            <button
              class="cancel-btn"
              onclick={() => deleteDialogRef?.close()}
              disabled={isDeleting}
              type="button"
            >
              {t("feedback_cancel")}
            </button>
            <button
              class="confirm-btn"
              onclick={handleDelete}
              disabled={isDeleting}
              type="button"
            >
              {#if isDeleting}
                <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                {t("feedback_deleting")}
              {:else}
                {t("feedback_delete")}
              {/if}
            </button>
          </div>
        </div>
      </dialog>

      <!-- Edit Drawer -->
      <FeedbackEditDrawer
        bind:isOpen={isEditDrawerOpen}
        {item}
        appendMode={isAppendMode}
        onSave={handleSave}
      />

      <!-- Image Viewer Modal -->
      {#if item.imageUrls && item.imageUrls.length > 0}
        <MediaSpotlight
          open={isImageViewerOpen}
          items={item.imageUrls.map((url: string, i: number) => ({
            id: `screenshot-${i}`,
            url,
            type: "image" as const,
            alt: `Screenshot ${i + 1}`,
          }))}
          currentIndex={imageViewerIndex}
          onclose={() => (isImageViewerOpen = false)}
          showFilmstrip={item.imageUrls.length > 1}
        />
      {/if}
    </div>
  {/if}
</Drawer>

<style>
  /* Drawer sizing and z-index (must be above bottom nav z-index: 100) */
  :global(.drawer-content.feedback-detail-drawer) {
    --sheet-width: min(520px, 95vw);
    --sheet-bg: linear-gradient(
      135deg,
      rgba(0, 0, 0, 0.85),
      rgba(0, 0, 0, 0.92)
    );
    --sheet-filter: none;
    --sheet-z-index: 110;
  }

  :global(.drawer-overlay.feedback-detail-backdrop) {
    /* Drawer.css derives overlay z-index as calc(--sheet-z-index - 1) = 109 */
    --sheet-z-index: 110;
    --sheet-backdrop-bg: rgba(0, 0, 0, 0.5);
  }

  @media (max-width: 768px) {
    :global(.drawer-content.feedback-detail-drawer) {
      --sheet-width: 100%;
      max-height: 90vh;
      max-height: 90dvh;
    }
  }

  .detail-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 300px;
  }

  /* Header */
  .panel-header {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-stroke);
    flex-shrink: 0;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .action-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke, var(--theme-stroke-strong));
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .action-button:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    transform: translateY(-1px);
  }

  .action-button.edit:hover {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 50%,
      transparent
    );
    color: var(--theme-accent, var(--semantic-info));
  }

  .action-button.delete:hover {
    border-color: color-mix(in srgb, var(--semantic-error) 50%, transparent);
    color: var(--semantic-error);
  }

  .header-meta {
    display: flex;
    flex-wrap: nowrap;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }

  .type-badge,
  .status-badge,
  .priority-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--badge-color) 40%, var(--theme-card-bg)),
      color-mix(in srgb, var(--badge-color) 25%, var(--theme-card-bg))
    );
    border: 1px solid color-mix(in srgb, var(--badge-color) 30%, transparent);
    border-radius: 14px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--badge-color);
    box-shadow: 0 2px 6px
      color-mix(
        in srgb,
        var(--badge-color) 20%,
        var(--theme-shadow-color, black)
      );
    white-space: nowrap;
    flex-shrink: 0;
  }

  .badge-label {
    display: inline;
  }

  /* Mobile: compact badges - hide labels, show only icons */
  @media (max-width: 420px) {
    .type-badge,
    .status-badge,
    .priority-badge {
      padding: 6px 8px;
      gap: 0;
    }

    .badge-label {
      display: none;
    }

    .action-button {
      width: 28px;
      height: 28px;
      font-size: 0.75rem;
    }
  }

  /* Content */
  .feedback-detail-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .item-title {
    margin: 0 0 12px 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-text);
    line-height: 1.4;
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 20px;
    font-size: 0.8125rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .meta-row span {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* Sections */
  .description-section,
  .context-section,
  .response-section {
    margin-bottom: 20px;
  }

  .description-section h3,
  .context-section h3,
  .response-section h3 {
    margin: 0 0 8px 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .response-section h3 {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--theme-accent, var(--semantic-info));
  }

  .description {
    margin: 0;
    font-size: 0.9375rem;
    color: var(--theme-text);
    line-height: 1.6;
    white-space: pre-wrap;
  }

  /* Context tags */
  .context-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .context-tag {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 6px;
    font-size: 0.8125rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .context-tag i {
    font-size: 0.75rem;
    opacity: 0.6;
  }

  /* Response card */
  .response-card {
    padding: 12px;
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--theme-accent, var(--semantic-info)) 25%,
          transparent
        )
        0%,
      color-mix(
          in srgb,
          var(--theme-accent, var(--semantic-info)) 15%,
          transparent
        )
        100%
    );
    border: 1.5px solid
      color-mix(
        in srgb,
        var(--theme-accent, var(--semantic-info)) 50%,
        transparent
      );
    border-radius: 10px;
    box-shadow:
      0 4px 16px
        color-mix(
          in srgb,
          var(--theme-accent, var(--semantic-info)) 20%,
          transparent
        ),
      0 0 0 1px
        color-mix(
          in srgb,
          var(--theme-accent, var(--semantic-info)) 15%,
          transparent
        );
  }

  .response-message {
    margin: 0 0 8px 0;
    font-size: 0.9375rem;
    color: var(--theme-text, var(--theme-text));
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .response-date {
    font-size: 0.75rem;
    color: var(--theme-text-dim);
  }

  /* Resolution card styling */
  .response-card.resolution {
    background: linear-gradient(
      135deg,
      rgba(16, 185, 129, 0.25) 0%,
      rgba(16, 185, 129, 0.15) 100%
    );
    border: 1.5px solid rgba(16, 185, 129, 0.5);
    box-shadow:
      0 4px 16px rgba(16, 185, 129, 0.2),
      0 0 0 1px rgba(16, 185, 129, 0.15);
  }

  .resolution-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 8px;
  }

  .version-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: rgba(16, 185, 129, 0.25);
    border: 1px solid rgba(16, 185, 129, 0.4);
    border-radius: 4px;
    font-size: 0.6875rem;
    font-weight: 600;
    color: #10b981;
  }

  .version-badge i {
    font-size: 0.5625rem;
  }

  /* Screenshots */
  .screenshots-section {
    margin-bottom: 20px;
  }

  .screenshots-section h3 {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 10px 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .screenshots-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .screenshot-btn {
    position: relative;
    display: block;
    width: 64px;
    height: 64px;
    padding: 0;
    border-radius: 8px;
    overflow: hidden;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke, var(--theme-stroke));
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .screenshot-btn:hover {
    border-color: var(--theme-accent, var(--semantic-info));
    transform: scale(1.05);
  }

  .screenshot-btn:active {
    transform: scale(0.98);
  }

  .screenshot-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .screenshot-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    opacity: 0;
    transition: opacity var(--duration-normal) ease;
  }

  .screenshot-btn:hover .screenshot-overlay {
    opacity: 1;
  }

  .screenshot-overlay i {
    font-size: 1.125rem;
    color: white;
  }

  /* On mobile, always show the overlay slightly for browseability */
  @media (max-width: 768px) {
    .screenshot-overlay {
      opacity: 0.4;
    }

    .screenshot-btn:active .screenshot-overlay {
      opacity: 0.8;
    }
  }

  /* Scrollbar */
  .feedback-detail-body::-webkit-scrollbar {
    width: 6px;
  }

  .feedback-detail-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .feedback-detail-body::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
  }

  /* Delete Confirmation Dialog (native dialog element) */
  .delete-confirm-dialog {
    padding: 0;
    border: none;
    background: transparent;
    max-width: 320px;
  }

  .delete-confirm-dialog::backdrop {
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    animation: fadeIn var(--duration-fast) ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .delete-confirm-dialog .dialog-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 24px 32px;
    background: var(--theme-panel-bg);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    text-align: center;
    animation: slideUp var(--duration-normal) ease;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dialog-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    background: rgba(239, 68, 68, 0.15);
    border-radius: 12px;
    color: var(--semantic-error);
    font-size: var(--font-size-xl);
  }

  .delete-confirm-dialog .dialog-content h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .delete-confirm-dialog .dialog-content p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
    line-height: 1.5;
  }

  .dialog-actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
  }

  .cancel-btn,
  .confirm-btn {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .cancel-btn {
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke-strong));
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .cancel-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, var(--theme-text));
  }

  .confirm-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--semantic-error);
    border: 1px solid var(--semantic-error);
    color: white;
  }

  .confirm-btn:hover:not(:disabled) {
    background: var(--semantic-error);
  }

  .cancel-btn:disabled,
  .confirm-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .dialog-content {
      animation: none;
    }
    .delete-confirm-dialog {
      animation: none;
    }
  }
</style>
