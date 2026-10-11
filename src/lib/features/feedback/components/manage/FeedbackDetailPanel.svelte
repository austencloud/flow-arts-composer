<!-- FeedbackDetailPanel - Refactored with service-based architecture and Svelte 5 runes -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type {
    FeedbackItem,
    FeedbackPriority,
  } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import type { FeedbackManageState } from "#lib/shared/feedback/state/feedback-manage-state.svelte.js";
  import { createFeedbackDetailState } from "../../state/feedback-detail-state.svelte";
  import { PRIORITY_CONFIG } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import FeedbackHeader from "./detail/FeedbackHeader.svelte";
  import FeedbackMetadataCard from "./detail/FeedbackMetadataCard.svelte";
  import FeedbackSubtaskPanel from "./detail/FeedbackSubtaskPanel.svelte";
  import FeedbackStatusSelector from "./detail/FeedbackStatusSelector.svelte";
  import FeedbackActionBar from "./detail/FeedbackActionBar.svelte";
  import FeedbackStatusHistory from "./detail/FeedbackStatusHistory.svelte";
  import FeedbackAssigneeSelector from "./detail/FeedbackAssigneeSelector.svelte";
  import MediaSpotlight from "#lib/components/media/spotlight/MediaSpotlight.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    item: FeedbackItem;
    manageState?: FeedbackManageState | null;
    onClose: () => void;
    readOnly?: boolean;
  }

  const {
    item,
    manageState = null,
    onClose,
    readOnly = false,
  }: Props = $props();

  // Create state wrapper ONCE - do NOT use $derived as it recreates state on every item change
  // This was causing showDeleteConfirm to reset when real-time updates arrived
  // Use factory function to avoid state_referenced_locally warning
  const createState = () => createFeedbackDetailState(item, manageState, readOnly);
  const detailState = createState();

  // Sync item updates (state internally handles ID-based change detection)
  $effect(() => {
    detailState.updateItem(item);
  });

  // Mobile detection
  let isMobile = $state(false);
  onMount(() => {
    const mediaQuery = window.matchMedia("(max-width: 500px)");
    isMobile = mediaQuery.matches;
    const handler = (e: MediaQueryListEvent) => (isMobile = e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  });

  // Image viewer state
  let isImageViewerOpen = $state(false);
  let imageViewerIndex = $state(0);

  function openImageViewer(index: number = 0) {
    imageViewerIndex = index;
    isImageViewerOpen = true;
  }

  // Priority cycling for mobile
  const priorityOrder: (FeedbackPriority | "")[] = [
    "",
    "low",
    "medium",
    "high",
    "critical",
  ];
  const currentPriorityIndex = $derived(
    priorityOrder.indexOf(detailState.editPriority || "")
  );

  function cyclePriority(direction: "up" | "down") {
    const newIndex =
      direction === "up"
        ? Math.min(currentPriorityIndex + 1, priorityOrder.length - 1)
        : Math.max(currentPriorityIndex - 1, 0);
    detailState.editPriority = priorityOrder[newIndex] as FeedbackPriority;
    void detailState.saveChanges();
  }

  const currentPriorityConfig = $derived(
    detailState.editPriority
      ? PRIORITY_CONFIG[detailState.editPriority as FeedbackPriority]
      : null
  );

  // Update state when item changes (real-time updates from parent)
  $effect(() => {
    detailState.updateItem(item);
  });

  // Auto-resize textarea
  let descriptionTextarea: HTMLTextAreaElement;
  function autoResizeTextarea(textarea: HTMLTextAreaElement) {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  }

  $effect(() => {
    detailState.editDescription;
    if (descriptionTextarea) {
      autoResizeTextarea(descriptionTextarea);
    }
  });

  // Keyboard shortcut: Delete key twice to delete feedback
  // First press shows confirmation, second press confirms deletion
  function handleKeyDown(event: KeyboardEvent) {
    // Only handle Delete key
    if (event.key !== "Delete") return;

    // Don't intercept if user is typing in an input/textarea
    const target = event.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      return;
    }

    // Don't handle if read-only
    if (readOnly) return;

    event.preventDefault();

    if (detailState.showDeleteConfirm) {
      // Second Delete press - confirm deletion
      void detailState.handleDelete();
    } else {
      // First Delete press - show confirmation
      detailState.showDeleteConfirm = true;
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleKeyDown);
  });
</script>

<div class="detail-panel">
  <FeedbackHeader {detailState} {readOnly} {onClose} />

  <div class="admin-feedback-body">
    <!-- Resolution Summary - Show for in-review/completed/archived feedback -->
    {#if (item.status === "in-review" || item.status === "completed" || item.status === "archived") && item.adminNotes}
      <section class="section resolution-section">
        <h3 class="section-title">
          <i class="fas fa-check-circle" aria-hidden="true"></i>
          {t("feedback_resolution")}
        </h3>
        <div class="resolution-card">
          <p class="resolution-text">{item.adminNotes}</p>
          {#if item.fixedInVersion}
            <span class="version-badge">
              <i class="fas fa-tag" aria-hidden="true"></i>
              v{item.fixedInVersion}
            </span>
          {/if}
        </div>
      </section>
    {/if}

    <!-- Title - Simple inline edit at top, click to edit -->
    <input
      type="text"
      class="title-input"
      bind:value={detailState.editTitle}
      onblur={() => detailState.handleFieldBlur()}
      placeholder={t("feedback_untitled_placeholder")}
      readonly={readOnly}
    />

    <!-- Metadata Card - User info -->
    <FeedbackMetadataCard {detailState} {isMobile} />

    <!-- Description Section - Primary content -->
    <section class="section">
      <h3 class="section-title">{t("feedback_description")}</h3>
      <textarea
        class="inline-edit-textarea auto-resize"
        bind:this={descriptionTextarea}
        bind:value={detailState.editDescription}
        onblur={() => detailState.handleFieldBlur()}
        oninput={(e) => autoResizeTextarea(e.currentTarget)}
        placeholder="Describe the feedback..."
        readonly={readOnly}
      ></textarea>
    </section>

    <!-- Screenshots Section -->
    {#if item.imageUrls && item.imageUrls.length > 0}
      <section class="section screenshots-section">
        {#if isMobile}
          <!-- Mobile: Button to open image viewer -->
          <button
            type="button"
            class="screenshots-button"
            onclick={() => openImageViewer(0)}
          >
            <i class="fas fa-images" aria-hidden="true"></i>
            <span
              >View {item.imageUrls.length} screenshot{item.imageUrls.length > 1
                ? "s"
                : ""}</span
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
          </button>
        {:else}
          <!-- Desktop: Inline grid -->
          <h3 class="section-title">Screenshots ({item.imageUrls.length})</h3>
          <div class="screenshots-grid">
            {#each item.imageUrls as imageUrl, index}
              <button
                type="button"
                class="screenshot-btn"
                onclick={() => openImageViewer(index)}
              >
                <img
                  src={imageUrl}
                  alt="Screenshot {index + 1}"
                  class="screenshot-thumb"
                />
                <div class="screenshot-overlay">
                  <i class="fas fa-expand" aria-hidden="true"></i>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <!-- Status Selector - Click to change -->
    <FeedbackStatusSelector {detailState} {readOnly} {isMobile} />

    <!-- Priority Section -->
    <section class="section">
      <h3 class="section-title">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        Priority
      </h3>
      {#if isMobile}
        <!-- Mobile: Arrow cycling -->
        <div class="priority-cycling">
          <button
            type="button"
            class="cycle-btn"
            onclick={() => cyclePriority("down")}
            disabled={readOnly || currentPriorityIndex <= 0}
            aria-label="Lower priority"
          >
            <i class="fas fa-chevron-down" aria-hidden="true"></i>
          </button>
          <span
            class="priority-value"
            style="--priority-color: {currentPriorityConfig?.color ||
              '#6b7280'}"
          >
            {#if currentPriorityConfig}
              <i class="fas {currentPriorityConfig.icon}" aria-hidden="true"
              ></i>
              {currentPriorityConfig.label}
            {:else}
              None
            {/if}
          </span>
          <button
            type="button"
            class="cycle-btn"
            onclick={() => cyclePriority("up")}
            disabled={readOnly ||
              currentPriorityIndex >= priorityOrder.length - 1}
            aria-label="Raise priority"
          >
            <i class="fas fa-chevron-up" aria-hidden="true"></i>
          </button>
        </div>
      {:else}
        <!-- Desktop: Chip row -->
        <div class="priority-row">
          <button
            type="button"
            class="priority-chip"
            class:active={detailState.editPriority === ""}
            onclick={() => {
              detailState.editPriority = "";
              void detailState.saveChanges();
            }}
          >
            None
          </button>
          {#each Object.entries(PRIORITY_CONFIG) as [priority, config]}
            <button
              type="button"
              class="priority-chip"
              class:active={detailState.editPriority === priority}
              style="--priority-color: {config.color}"
              onclick={() => {
                detailState.editPriority = priority as any;
                void detailState.saveChanges();
              }}
            >
              <i class="fas {config.icon}" aria-hidden="true"></i>
              {config.label}
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Assignee Selector -->
    <FeedbackAssigneeSelector {detailState} {readOnly} />

    <!-- Subtasks Panel -->
    <FeedbackSubtaskPanel subtasks={item.subtasks || []} />

    <!-- Status History -->
    <FeedbackStatusHistory history={item.statusHistory} />

    <!-- Action Bar - Delete functionality -->
    <FeedbackActionBar {detailState} {readOnly} />
  </div>

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

<style>
  /* ═══════════════════════════════════════════════════════════════════════════
     DESIGN TOKENS
     ═══════════════════════════════════════════════════════════════════════════ */
  .detail-panel {
    --fb-space-3xs: 4px;
    --fb-space-2xs: 6px;
    --fb-space-xs: 8px;
    --fb-space-sm: 13px;
    --fb-space-md: 21px;
    --fb-space-lg: 34px;
    --fb-space-xl: 55px;

    --fb-text-xs: 0.75rem;
    --fb-text-sm: 0.875rem;
    --fb-text-base: 1rem;
    --fb-text-lg: 1.25rem;
    --fb-text-xl: 1.5rem;

    --fb-radius-sm: 8px;
    --fb-radius-md: 12px;
    --fb-radius-lg: 16px;

    --fb-primary: var(--semantic-success, var(--semantic-success));
    --fb-error: var(--semantic-error, var(--semantic-error));
    --fb-purple: var(--theme-accent-strong);
    --fb-surface: var(--theme-card-bg);
    --fb-surface-hover: var(--theme-card-hover-bg);
    --fb-border: var(--theme-stroke);
    --fb-text: var(--theme-text);
    --fb-text-muted: var(--theme-text-dim);
    --fb-text-subtle: color-mix(
      in srgb,
      var(--theme-text-dim) 65%,
      transparent
    );
    --fb-warning: var(--semantic-warning);

    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background, #0f0f14);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     CONTENT
     ═══════════════════════════════════════════════════════════════════════════ */
  .admin-feedback-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--fb-space-md);
    padding-bottom: calc(var(--fb-space-lg) + env(safe-area-inset-bottom, 0px));
    display: flex;
    flex-direction: column;
    gap: var(--fb-space-lg);
  }

  /* Mobile: Tighter spacing */
  @media (max-width: 500px) {
    .admin-feedback-body {
      padding: var(--fb-space-sm);
      gap: var(--fb-space-md);
    }
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--fb-space-sm);
  }

  @media (max-width: 500px) {
    .section {
      gap: var(--fb-space-xs);
    }
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--fb-space-xs);
    margin: 0;
    font-size: var(--fb-text-xs);
    font-weight: 600;
    color: var(--fb-text-subtle);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     TITLE INPUT (Simple inline edit)
     ═══════════════════════════════════════════════════════════════════════════ */
  .title-input {
    width: 100%;
    padding: var(--fb-space-xs) 0;
    background: transparent;
    border: none;
    border-bottom: 1px solid transparent;
    color: var(--fb-text);
    font-size: var(--fb-text-lg);
    font-weight: 700;
    font-family: inherit;
    transition: border-color var(--duration-normal) ease;
  }

  .title-input:focus {
    outline: none;
    border-bottom-color: var(--fb-primary);
  }

  .title-input:hover:not(:focus):not(:readonly) {
    border-bottom-color: var(--fb-border);
  }

  .title-input:readonly {
    cursor: default;
  }

  .title-input::placeholder {
    color: var(--fb-text-muted);
    font-weight: 500;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     INLINE EDIT STYLES
     ═══════════════════════════════════════════════════════════════════════════ */
  .inline-edit-textarea {
    width: 100%;
    padding: var(--fb-space-sm);
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius-md);
    color: var(--fb-text);
    font-size: var(--fb-text-base);
    font-family: inherit;
    resize: none;
    min-height: 80px;
    transition: all var(--duration-normal) ease;
  }

  .inline-edit-textarea:focus {
    outline: none;
    border-color: var(--fb-primary);
    background: var(--fb-surface);
  }

  .inline-edit-textarea:readonly {
    opacity: 0.6;
    cursor: default;
  }

  /* Mobile: smaller min-height for textarea */
  @media (max-width: 500px) {
    .inline-edit-textarea {
      min-height: 60px;
      padding: var(--fb-space-xs);
      font-size: var(--fb-text-sm);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RESOLUTION SECTION
     ═══════════════════════════════════════════════════════════════════════════ */
  .resolution-section {
    padding: var(--fb-space-md);
    background: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 8%,
      transparent
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 30%,
        transparent
      );
    border-radius: var(--fb-radius-md);
  }

  .resolution-card {
    display: flex;
    flex-direction: column;
    gap: var(--fb-space-sm);
  }

  .resolution-text {
    margin: 0;
    color: var(--fb-text);
    font-size: var(--fb-text-sm);
    line-height: 1.5;
  }

  .version-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 15%,
      transparent
    );
    border-radius: 999px;
    color: var(--semantic-success, var(--semantic-success));
    font-size: var(--fb-text-xs);
    font-weight: 600;
    width: fit-content;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     PRIORITY ROW (Compact single-line)
     ═══════════════════════════════════════════════════════════════════════════ */
  .priority-row {
    display: flex;
    flex-wrap: nowrap;
    gap: var(--fb-space-xs);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .priority-row::-webkit-scrollbar {
    display: none;
  }

  .priority-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: 999px;
    color: var(--fb-text-muted);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    font-size: var(--fb-text-xs);
    font-weight: 500;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .priority-chip:hover {
    background: var(--fb-surface-hover);
    border-color: var(--priority-color, var(--fb-text-muted));
    color: var(--priority-color, var(--fb-text));
  }

  .priority-chip.active {
    background: color-mix(
      in srgb,
      var(--priority-color, #6b7280) 15%,
      transparent
    );
    border-color: var(--priority-color, #6b7280);
    color: var(--priority-color, #6b7280);
    font-weight: 600;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SCREENSHOTS
     ═══════════════════════════════════════════════════════════════════════════ */
  .screenshots-section {
    margin-bottom: 0;
  }

  /* Mobile: Button to open viewer */
  .screenshots-button {
    display: flex;
    align-items: center;
    gap: var(--fb-space-sm);
    width: 100%;
    padding: var(--fb-space-sm) var(--fb-space-md);
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius-md);
    color: var(--fb-text);
    font-size: var(--fb-text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .screenshots-button:hover {
    background: var(--fb-surface-hover);
    border-color: var(--fb-purple);
  }

  .screenshots-button span {
    flex: 1;
    text-align: left;
  }

  .screenshots-button i:first-child {
    color: var(--fb-purple);
  }

  .screenshots-button i:last-child {
    color: var(--fb-text-muted);
    font-size: 0.75em;
  }

  /* Desktop: Grid of thumbnails */
  .screenshots-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fb-space-xs);
  }

  .screenshot-btn {
    position: relative;
    display: block;
    width: 72px;
    height: 72px;
    padding: 0;
    border-radius: var(--fb-radius-sm);
    overflow: hidden;
    border: 1px solid var(--fb-border);
    background: transparent;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .screenshot-btn:hover {
    transform: scale(1.05);
    border-color: var(--fb-purple);
  }

  .screenshot-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .screenshot-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 1rem;
    opacity: 0;
    transition: opacity var(--duration-normal) ease;
  }

  .screenshot-btn:hover .screenshot-overlay {
    opacity: 1;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     PRIORITY CYCLING (Mobile)
     ═══════════════════════════════════════════════════════════════════════════ */
  .priority-cycling {
    display: flex;
    align-items: center;
    gap: var(--fb-space-sm);
    justify-content: center;
  }

  .cycle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius-sm);
    color: var(--fb-text);
    font-size: 1rem;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .cycle-btn:hover:not(:disabled) {
    background: var(--fb-surface-hover);
    border-color: var(--fb-purple);
    color: var(--fb-purple);
  }

  .cycle-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .priority-value {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    min-width: 100px;
    justify-content: center;
    background: color-mix(in srgb, var(--priority-color) 15%, transparent);
    border: 1px solid var(--priority-color);
    border-radius: var(--fb-radius-md);
    color: var(--priority-color);
    font-size: var(--fb-text-sm);
    font-weight: 600;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     REDUCED MOTION
     ═══════════════════════════════════════════════════════════════════════════ */
  @media (prefers-reduced-motion: reduce) {
    .section-title,
    .inline-edit-textarea,
    .title-input,
    .priority-chip,
    .screenshot-link {
      transition: none;
    }
  }
</style>
