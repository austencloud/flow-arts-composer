<!-- MyFeedbackTab - Tester's personal feedback dashboard -->
<script lang="ts">
  import { removeCurrentUrlParams } from "#lib/shared/navigation/services/url-state.js";
  import { onMount, onDestroy } from "svelte";
  import { createMyFeedbackState } from "../../state/my-feedback-state.svelte";
  import { myFeedbackDetailState } from "#lib/shared/feedback/state/my-feedback-detail-state.svelte.js";
  import {
    notificationTargetState,
    takeNotificationTargetFeedback,
    setNotificationTargetFeedback,
  } from "#lib/shared/feedback/state/notification-action-state.svelte.js";
  import { useUserPreview } from "#lib/shared/debug/context/user-preview-context.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import MyFeedbackList from "./MyFeedbackList.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  const state = createMyFeedbackState();
  const preview = useUserPreview();

  // Track preview user to reload when it changes
  let lastPreviewUserId: string | null = null;

  // Track pending notification target
  let pendingTargetId: string | null = null;
  let targetCheckInterval: ReturnType<typeof setInterval> | null = null;
  let targetCheckTimeout: ReturnType<typeof setTimeout> | null = null;

  // Cleanup function for target interval and timeout
  function cleanupTargetInterval() {
    if (targetCheckInterval) {
      clearInterval(targetCheckInterval);
      targetCheckInterval = null;
    }
    if (targetCheckTimeout) {
      clearTimeout(targetCheckTimeout);
      targetCheckTimeout = null;
    }
  }

  // Handle finding and selecting a target feedback item
  function setupTargetCheck(targetFeedbackId: string) {
    pendingTargetId = targetFeedbackId;
    cleanupTargetInterval();

    // Wait for items to load, then find and select the target
    targetCheckInterval = setInterval(() => {
      const targetItem = state.items.find(
        (item) => item.id === targetFeedbackId
      );
      if (targetItem) {
        myFeedbackDetailState.selectItem(targetItem);
        pendingTargetId = null;
        cleanupTargetInterval();
      }
    }, 100);

    // Cleanup interval after 10 seconds if not found (track timeout for cleanup)
    targetCheckTimeout = setTimeout(() => {
      cleanupTargetInterval();
      if (pendingTargetId) {
        console.warn(
          `[MyFeedbackTab] Could not find target feedback: ${pendingTargetId}`
        );
        pendingTargetId = null;
      }
    }, 10000);
  }

  // Load feedback when auth is ready
  async function loadWhenReady() {
    // Wait for auth to be initialized
    if (!authState.initialized) {
      // Poll for auth initialization
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (authState.initialized) {
            clearInterval(check);
            resolve();
          }
        }, 50);
        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(check);
          resolve();
        }, 5000);
      });
    }

    // Now load feedback
    await state.loadMyFeedback(true);
  }

  // Load on mount (not in $effect to avoid loops)
  onMount(() => {
    lastPreviewUserId = preview.profile?.uid ?? null;

    // Register handlers with the shared detail state
    myFeedbackDetailState.setHandlers(state.updateItem, state.deleteItem);

    // Check URL param first (from FeedbackMessageCard navigation)
    const urlParams = new URLSearchParams(window.location.search);
    const urlFeedbackId = urlParams.get("openFeedback");

    let targetFeedbackId: string | null = null;

    if (urlFeedbackId) {
      targetFeedbackId = urlFeedbackId;
      // Clear the URL param
      removeCurrentUrlParams(["openFeedback"]);
    } else {
      // Fallback to notification target state or persisted ID
      targetFeedbackId =
        takeNotificationTargetFeedback() ||
        myFeedbackDetailState.getPersistedFeedbackId();
    }

    // First, ensure auth is ready, then load feedback
    loadWhenReady().then(() => {
      // After loading, set up target check if we have one
      if (targetFeedbackId) {
        setupTargetCheck(targetFeedbackId);
      }
    });
  });

  // Reload when preview user changes
  $effect(() => {
    const currentPreviewUserId = preview.isActive
      ? (preview.profile?.uid ?? null)
      : null;

    if (currentPreviewUserId !== lastPreviewUserId) {
      lastPreviewUserId = currentPreviewUserId;
      state.cleanup();
      state.loadMyFeedback(true);
    }
  });

  // Watch for notification target changes (handles navigation while already mounted)
  $effect(() => {
    const targetId = notificationTargetState.feedbackId;
    if (targetId) {
      // Clear it immediately so we don't keep re-triggering
      setNotificationTargetFeedback(null);
      // Set up the target check to find and select the item
      setupTargetCheck(targetId);
    }
  });

  onDestroy(() => {
    cleanupTargetInterval();
    myFeedbackDetailState.clearHandlers();
    myFeedbackDetailState.close();
    state.cleanup();
  });

  // Show preview indicator
  const isPreviewMode = $derived(preview.isActive);
  const previewUserName = $derived(
    preview.profile?.displayName || preview.profile?.email || "User"
  );

  // Selected item for highlighting in list (synced from shared state)
  const selectedItemId = $derived(
    myFeedbackDetailState.selectedItem?.id ?? null
  );
</script>

<div class="my-feedback-tab">
  <div class="tab-layout">
    <!-- Header with pending count -->
    <header class="tab-header" class:preview-mode={isPreviewMode}>
      {#if isPreviewMode}
        <div class="preview-banner">
          <i class="fas fa-eye" aria-hidden="true"></i>
          <span>{t("feedback_viewing_for", { name: previewUserName })}</span>
        </div>
      {/if}
      <div class="header-content">
        <div class="header-icon">
          <i class="fas fa-list-check" aria-hidden="true"></i>
        </div>
        <div class="header-text">
          <h1>
            {isPreviewMode
              ? t("feedback_user_feedback", { name: previewUserName })
              : t("feedback_my_feedback")}
          </h1>
          <p>
            {isPreviewMode
              ? t("feedback_user_feedback_subtitle")
              : t("feedback_my_feedback_subtitle")}
          </p>
        </div>
      </div>
    </header>

    <!-- Main content -->
    <div class="tab-content">
      {#if state.isLoading && state.items.length === 0}
        <div
          class="loading-state"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          <span>{t("feedback_loading")}</span>
        </div>
      {:else if state.error}
        <div class="error-state" role="alert" aria-live="assertive">
          <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
          <span>{state.error}</span>
          <button onclick={() => state.loadMyFeedback(true)}
            >{t("action_retry")}</button
          >
        </div>
      {:else if state.items.length === 0}
        <div class="empty-state">
          <i class="fas fa-inbox" aria-hidden="true"></i>
          <h2>{t("feedback_no_feedback")}</h2>
          <p>
            {t("feedback_no_feedback_message")}
          </p>
        </div>
      {:else}
        <div class="feedback-layout">
          <MyFeedbackList
            items={state.items}
            {selectedItemId}
            onSelect={(item) => myFeedbackDetailState.selectItem(item)}
            isLoading={state.isLoading}
          />
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .my-feedback-tab {
    container-type: size;
    container-name: my-feedback;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .tab-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }

  /* Header */
  .tab-header {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: clamp(12px, 3cqi, 20px);
    border-bottom: 1px solid var(--theme-stroke);
    flex-shrink: 0;
  }

  .tab-header.preview-mode {
    background: rgba(59, 130, 246, 0.05);
    border-bottom-color: rgba(59, 130, 246, 0.2);
  }

  .preview-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.25);
    border-radius: 8px;
    font-size: 0.8125rem;
    color: var(--semantic-info);
  }

  .preview-banner i {
    font-size: var(--font-size-compact);
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: rgba(59, 130, 246, 0.15);
    border-radius: 10px;
    color: var(--semantic-info);
    font-size: var(--font-size-base);
  }

  .header-text h1 {
    margin: 0;
    font-size: clamp(1rem, 2.5cqi, 1.25rem);
    font-weight: 600;
    color: var(--theme-text);
  }

  .header-text p {
    margin: 0;
    font-size: clamp(0.75rem, 1.8cqi, 0.875rem);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  /* Content area */
  .tab-content {
    flex: 1;
    overflow: hidden;
  }

  .feedback-layout {
    display: flex;
    height: 100%;
    overflow: hidden;
    position: relative;
  }

  /* States */
  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    padding: 32px;
    text-align: center;
  }

  .loading-state i {
    font-size: var(--font-size-2xl);
    color: var(--semantic-info);
  }

  .loading-state span {
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .error-state i {
    font-size: var(--font-size-3xl);
    color: var(--semantic-error);
  }

  .error-state span {
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .error-state button {
    padding: 8px 16px;
    background: rgba(59, 130, 246, 0.2);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 8px;
    color: var(--semantic-info);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .error-state button:hover {
    background: rgba(59, 130, 246, 0.3);
  }

  .empty-state i {
    font-size: var(--font-size-3xl);
    color: var(--theme-stroke);
  }

  .empty-state h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .empty-state p {
    margin: 0;
    max-width: 300px;
    font-size: 0.875rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
    line-height: 1.5;
  }

  /* Responsive: Mobile shows list, desktop shows split view */
  @container my-feedback (max-width: 600px) {
    .tab-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
