<!-- FeedbackManageTab - Admin Kanban board for managing feedback -->
<script lang="ts">
  import AdminTwoPanelLayout from "#lib/shared/admin/components/AdminTwoPanelLayout.svelte";
  import { createFeedbackManageState } from "#lib/shared/feedback/state/feedback-manage-state.svelte.js";
  import { createVersionState } from "#lib/shared/feedback/state/version-state.svelte.js";
  import { featureFlagService } from "#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js";
  import {
    notificationTargetState,
    getNotificationTargetFeedback,
    setNotificationTargetFeedback,
  } from "#lib/shared/feedback/state/notification-action-state.svelte.js";
  import {
    mutateCurrentUrl,
    removeCurrentUrlParams,
  } from "#lib/shared/navigation/services/url-state.js";
  import { onMount } from "svelte";
  import FeedbackKanbanBoard from "./FeedbackKanbanBoard.svelte";
  import FeedbackDetailPanel from "./FeedbackDetailPanel.svelte";
  import PrepareReleasePanel from "./PrepareReleasePanel.svelte";
  import FeedbackArchiveView from "./FeedbackArchiveView.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  // Create manage state with real-time subscription
  const manageState = createFeedbackManageState();

  // Create version state for release management
  const versionState = createVersionState();

  // Check if user is admin
  const isAdmin = $derived(featureFlagService.isAdmin);

  // Archive view toggle
  let showArchive = $state(false);

  // Track pending target for selection
  let pendingTargetId = $state<string | null>(null);

  // Check for target on mount (handles navigation from other pages)
  onMount(() => {
    // Check URL param first (from FeedbackMessageCard navigation or page refresh)
    const urlParams = new URLSearchParams(window.location.search);
    const urlFeedbackId = urlParams.get("openFeedback");

    if (urlFeedbackId) {
      // Keep the URL param - it will persist across refresh
      pendingTargetId = urlFeedbackId;
    } else {
      // Fallback to notification target state
      const targetId = getNotificationTargetFeedback();
      if (targetId) {
        pendingTargetId = targetId;
        setNotificationTargetFeedback(null);
      }
    }

    // Cleanup: Clear openFeedback param when leaving this tab
    return () => {
      const params = new URLSearchParams(window.location.search);
      if (params.has("openFeedback")) {
        removeCurrentUrlParams(["openFeedback"]);
      }
    };
  });

  // Sync URL with selected item for persistence across refresh/navigation
  $effect(() => {
    const selectedId = manageState.selectedItem?.id;
    const urlParams = new URLSearchParams(window.location.search);
    const currentUrlId = urlParams.get("openFeedback");

    // Only update URL if it's different from current selection
    if (selectedId && selectedId !== currentUrlId) {
      mutateCurrentUrl((url) => {
        url.searchParams.set("openFeedback", selectedId);
      });
    } else if (!selectedId && currentUrlId) {
      // Clear URL param when panel is closed
      removeCurrentUrlParams(["openFeedback"]);
    }
  });

  // Subscribe to real-time feedback updates when admin status is confirmed
  $effect(() => {
    if (isAdmin) {
      // Start real-time subscription
      manageState.subscribe();

      // Cleanup subscription when component unmounts
      return () => {
        manageState.unsubscribe();
      };
    }
    return undefined;
  });

  // Watch for notification target changes (handles navigation while already mounted)
  $effect(() => {
    const targetId = notificationTargetState.feedbackId;
    if (targetId) {
      pendingTargetId = targetId;
      setNotificationTargetFeedback(null);
    }
  });

  // Watch for pendingTargetId and select when we have items
  $effect(() => {
    const target = pendingTargetId;
    if (!target) return;

    // We have a target - try to select it if we have items
    const itemCount = manageState.allItems.length;
    if (itemCount === 0) return;

    // Clear pending immediately to prevent re-runs
    pendingTargetId = null;

    // Small delay to ensure DOM is ready
    setTimeout(() => {
      manageState.selectItemById(target);
    }, 50);
  });
</script>

<div class="manage-tab">
  {#if !isAdmin}
    <div class="access-denied">
      <i class="fas fa-lock" aria-hidden="true"></i>
      <h2>{t("feedback_admin_required")}</h2>
      <p>{t("feedback_admin_required_message")}</p>
    </div>
  {:else if versionState.showPreparePanel}
    <div class="release-panel-container">
      <PrepareReleasePanel
        {versionState}
        onClose={() => versionState.closePreparePanel()}
      />
    </div>
  {:else}
    <AdminTwoPanelLayout
      hasSelection={manageState.selectedItem !== null}
      onClose={() => manageState.selectItem(null)}
    >
      {#snippet list()}
        {#if showArchive}
          <FeedbackArchiveView
            {versionState}
            onBack={() => (showArchive = false)}
          />
        {:else}
          <div class="kanban-container">
            <FeedbackKanbanBoard
              {manageState}
              onOpenArchive={() => (showArchive = true)}
            />
          </div>
        {/if}
      {/snippet}

      {#snippet detail()}
        {#if manageState.selectedItem}
          <FeedbackDetailPanel
            item={manageState.selectedItem}
            {manageState}
            onClose={() => manageState.selectItem(null)}
          />
        {/if}
      {/snippet}
    </AdminTwoPanelLayout>
  {/if}
</div>

<style>
  .manage-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }

  .kanban-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .access-denied {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;
    text-align: center;
    padding: 32px;
  }

  .access-denied i {
    font-size: var(--font-size-3xl);
    color: var(--theme-stroke);
  }

  .access-denied h2 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: 600;
    color: var(--theme-text, var(--theme-text));
  }

  .access-denied p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .release-panel-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: color-mix(in srgb, var(--theme-panel-bg) 30%, transparent);
  }

  .release-panel-container > :global(*) {
    width: 100%;
    max-width: 480px;
    max-height: 600px;
  }
</style>
