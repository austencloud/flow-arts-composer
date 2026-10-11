<!--
  ShameQueuePanel.svelte

  Admin panel for reviewing and moderating Hall of Shame submissions.
  Shows pending queue with approve/reject actions.
-->
<script lang="ts">
  import {
    getPendingQueue,
    approveEntry,
    rejectEntry,
    setEntryFeatured,
    setEntryHidden,
    getReportedEntries,
  } from "#lib/features/hall-of-shame/services/shame-queue-manager.js";
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
  import { onMount } from "svelte";
  import type {
    HallOfShameEntry,
    ShameCategory,
  } from "#lib/features/hall-of-shame/domain/models/hall-of-shame-models.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import ModalFooter from "#lib/shared/foundation/ui/modal/ModalFooter.svelte";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";

  // State
  let pendingEntries = $state<HallOfShameEntry[]>([]);
  let reportedEntries = $state<HallOfShameEntry[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let activeTab = $state<"pending" | "reported">("pending");

  // Action state
  let processingId = $state<string | null>(null);
  let showRejectModal = $state(false);
  let rejectingEntry = $state<HallOfShameEntry | null>(null);
  let rejectReason = $state("");

  // Category selection for approval
  let categoryOverride = $state<ShameCategory | null>(null);

  const currentUser = $derived(authState.user);

  const categories: { value: ShameCategory; label: string }[] = [
    { value: "profanity", label: "Profanity" },
    { value: "sexual", label: "Crude" },
    { value: "creative", label: "Creative" },
  ];

  onMount(async () => {
    await loadQueues();
  });

  async function loadQueues() {
    isLoading = true;
    error = null;

    try {
      const [pending, reported] = await Promise.all([
        getPendingQueue(),
        getReportedEntries(),
      ]);

      pendingEntries = pending;
      reportedEntries = reported;
    } catch (e) {
      console.error("[ShameQueuePanel] Failed to load queues:", e);
      error = "Failed to load moderation queue";
    } finally {
      isLoading = false;
    }
  }

  function showModerationFailure(
    message: string,
    caught: unknown,
    action: string
  ): void {
    const failure =
      caught instanceof Error ? caught : new Error(String(caught));

    getErrorHandler().showUserError({
      message,
      technicalDetails: failure.message,
      error: failure,
      severity: "warning",
      context: {
        module: "admin",
        tab: "hall-of-shame",
        action,
      },
    });
  }

  async function handleApprove(entry: HallOfShameEntry) {
    if (!currentUser) return;

    processingId = entry.id;

    try {
      await approveEntry(
        entry.id,
        currentUser.uid,
        categoryOverride || undefined
      );

      // Remove from pending list
      pendingEntries = pendingEntries.filter(
        (e) => e.id !== entry.id
      );
      categoryOverride = null;
    } catch (e) {
      showModerationFailure(
        "Couldn't approve this entry. Try again.",
        e,
        "approveEntry"
      );
    } finally {
      processingId = null;
    }
  }

  function openRejectModal(entry: HallOfShameEntry) {
    rejectingEntry = entry;
    rejectReason = "";
    showRejectModal = true;
  }

  function closeRejectModal() {
    showRejectModal = false;
    rejectingEntry = null;
    rejectReason = "";
  }

  async function handleReject() {
    if (!currentUser || !rejectingEntry) return;

    if (!rejectReason.trim()) {
      error = "Please provide a rejection reason";
      return;
    }

    processingId = rejectingEntry.id;

    try {
      await rejectEntry(
        rejectingEntry.id,
        currentUser.uid,
        rejectReason.trim()
      );

      // Remove from pending list
      pendingEntries = pendingEntries.filter(
        (e) => e.id !== rejectingEntry?.id
      );
      closeRejectModal();
    } catch (e) {
      showModerationFailure(
        "Couldn't reject this entry. Try again.",
        e,
        "rejectEntry"
      );
    } finally {
      processingId = null;
    }
  }

  async function handleHide(entry: HallOfShameEntry) {
    if (!currentUser) return;

    processingId = entry.id;

    try {
      await setEntryHidden(entry.id, currentUser.uid, true);

      // Remove from reported list (it's now hidden)
      reportedEntries = reportedEntries.filter(
        (e) => e.id !== entry.id
      );
    } catch (e) {
      showModerationFailure(
        "Couldn't hide this entry. Try again.",
        e,
        "setEntryHidden"
      );
    } finally {
      processingId = null;
    }
  }

  async function handleFeature(entry: HallOfShameEntry, featured: boolean) {
    if (!currentUser) return;

    processingId = entry.id;

    try {
      await setEntryFeatured(
        entry.id,
        currentUser.uid,
        featured
      );

      // Update in list
      reportedEntries = reportedEntries.map((e) =>
        e.id === entry.id ? { ...e, featured } : e
      );
    } catch (e) {
      showModerationFailure(
        `Couldn't ${featured ? "feature" : "unfeature"} this entry. Try again.`,
        e,
        "setEntryFeatured"
      );
    } finally {
      processingId = null;
    }
  }

  function formatDate(timestamp: unknown): string {
    if (!timestamp) return "Unknown";
    const date =
      timestamp instanceof Date
        ? timestamp
        : (timestamp as { toDate: () => Date }).toDate?.() ||
          new Date(timestamp as string);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
</script>

<div class="shame-queue-panel">
  <header class="panel-header">
    <div class="header-content">
      <h2>
        <i class="fas fa-skull" aria-hidden="true"></i>
        Hall of Shame Moderation
      </h2>
      <p class="subtitle">Review and moderate submitted content</p>
    </div>
    <div class="tab-buttons" role="tablist">
      <button
        class="tab-button"
        class:active={activeTab === "pending"}
        onclick={() => (activeTab = "pending")}
        role="tab"
        aria-selected={activeTab === "pending"}
      >
        Pending
        {#if pendingEntries.length > 0}
          <span class="badge">{pendingEntries.length}</span>
        {/if}
      </button>
      <button
        class="tab-button"
        class:active={activeTab === "reported"}
        onclick={() => (activeTab = "reported")}
        role="tab"
        aria-selected={activeTab === "reported"}
      >
        Reported
        {#if reportedEntries.length > 0}
          <span class="badge warning">{reportedEntries.length}</span>
        {/if}
      </button>
    </div>
  </header>

  <div class="panel-body">
    {#if isLoading}
      <div class="loading" role="status">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
        <span>Loading queue...</span>
      </div>
    {:else if error}
      <div class="error" role="alert">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        <span>{error}</span>
        <button class="retry-button" onclick={loadQueues}>Retry</button>
      </div>
    {:else if activeTab === "pending"}
      {#if pendingEntries.length === 0}
        <div class="empty">
          <i class="fas fa-check-circle" aria-hidden="true"></i>
          <span>No pending submissions</span>
          <p>All caught up! Check back later.</p>
        </div>
      {:else}
        <div class="entries-list themed-scrollbar">
          {#each pendingEntries as entry (entry.id)}
            <div class="entry-card" class:processing={processingId === entry.id}>
              <div class="entry-header">
                {#if entry.thumbnails?.[0]}
                  <img
                    src={entry.thumbnails?.[0]}
                    alt="Sequence thumbnail"
                    class="entry-thumbnail"
                  />
                {:else}
                  <div class="entry-thumbnail placeholder">
                    <i class="fas fa-image" aria-hidden="true"></i>
                  </div>
                {/if}
                <div class="entry-info">
                  <h3 class="entry-word">{entry.word}</h3>
                  <p class="entry-submitter">
                    By {entry.ownerDisplayName}
                  </p>
                  <p class="entry-date">
                    Submitted {formatDate(entry.submittedAt)}
                  </p>
                </div>
              </div>

              {#if entry.flaggedTerms && entry.flaggedTerms.length > 0}
                <div class="flagged-terms">
                  <span class="terms-label">Flagged:</span>
                  {#each entry.flaggedTerms as term}
                    <span class="term-badge">{term.category}</span>
                  {/each}
                </div>
              {/if}

              <div class="entry-actions">
                <select
                  class="category-select"
                  bind:value={categoryOverride}
                  disabled={processingId === entry.id}
                >
                  <option value={null}>Auto category</option>
                  {#each categories as cat}
                    <option value={cat.value}>{cat.label}</option>
                  {/each}
                </select>
                <button
                  class="action-btn approve"
                  onclick={() => handleApprove(entry)}
                  disabled={processingId === entry.id}
                >
                  <i class="fas fa-check" aria-hidden="true"></i>
                  Approve
                </button>
                <button
                  class="action-btn reject"
                  onclick={() => openRejectModal(entry)}
                  disabled={processingId === entry.id}
                >
                  <i class="fas fa-times" aria-hidden="true"></i>
                  Reject
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      {#if reportedEntries.length === 0}
        <div class="empty">
          <i class="fas fa-flag" aria-hidden="true"></i>
          <span>No reported entries</span>
          <p>No approved entries have been flagged by users.</p>
        </div>
      {:else}
        <div class="entries-list themed-scrollbar">
          {#each reportedEntries as entry (entry.id)}
            <div class="entry-card reported" class:processing={processingId === entry.id}>
              <div class="entry-header">
                {#if entry.thumbnails?.[0]}
                  <img
                    src={entry.thumbnails?.[0]}
                    alt="Sequence thumbnail"
                    class="entry-thumbnail"
                  />
                {:else}
                  <div class="entry-thumbnail placeholder">
                    <i class="fas fa-image" aria-hidden="true"></i>
                  </div>
                {/if}
                <div class="entry-info">
                  <h3 class="entry-word">{entry.word}</h3>
                  <p class="entry-submitter">By {entry.ownerDisplayName}</p>
                  <p class="report-count">
                    <i class="fas fa-flag" aria-hidden="true"></i>
                    {entry.reportCount || 0} reports
                  </p>
                </div>
              </div>

              <div class="entry-actions">
                <button
                  class="action-btn feature"
                  class:active={entry.featured}
                  onclick={() => handleFeature(entry, !entry.featured)}
                  disabled={processingId === entry.id}
                >
                  <i
                    class="fas fa-star"
                    class:fas={entry.featured}
                    class:far={!entry.featured}
                    aria-hidden="true"
                  ></i>
                  {entry.featured ? "Unfeature" : "Feature"}
                </button>
                <button
                  class="action-btn hide"
                  onclick={() => handleHide(entry)}
                  disabled={processingId === entry.id}
                >
                  <i class="fas fa-eye-slash" aria-hidden="true"></i>
                  Hide
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<!-- Reject Modal -->
{#if rejectingEntry}
  <BaseModal bind:open={showRejectModal} onclose={closeRejectModal} size="sm" animation="pop" labelledBy="reject-modal-title">
    {#snippet header()}
      <ModalHeader
        title="Reject Submission"
        subtitle="Rejecting: {rejectingEntry?.word ?? ''}"
        icon="fa-times-circle"
        iconColor="#ef4444"
        onClose={closeRejectModal}
        id="reject-modal-title"
      />
    {/snippet}

    <div class="reject-modal-body">
      <label for="reject-reason" class="field-label">
        Rejection reason (required)
      </label>
      <textarea
        id="reject-reason"
        bind:value={rejectReason}
        placeholder="Explain why this submission is being rejected..."
        rows="3"
        class="reason-input"
      ></textarea>
    </div>

    {#snippet footer()}
      <ModalFooter align="end">
        <button class="secondary" onclick={closeRejectModal}>
          Cancel
        </button>
        <button
          class="danger"
          onclick={handleReject}
          disabled={!rejectReason.trim() || processingId === rejectingEntry?.id}
        >
          Reject
        </button>
      </ModalFooter>
    {/snippet}
  </BaseModal>
{/if}

<style>
  .shame-queue-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--theme-panel-bg);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1.5rem;
    border-bottom: 1px solid var(--theme-stroke);
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header-content h2 {
    margin: 0 0 0.25rem;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--theme-text);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .header-content h2 i {
    color: var(--semantic-error, #ef4444);
  }

  .subtitle {
    margin: 0;
    font-size: 0.875rem;
    color: var(--theme-text-dim);
  }

  .tab-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .tab-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: transparent;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.5rem;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .tab-button:hover {
    background: var(--theme-card-hover-bg);
  }

  .tab-button.active {
    background: var(--theme-accent-bg);
    border-color: var(--theme-accent);
    color: var(--theme-text);
  }

  .badge {
    padding: 0.125rem 0.5rem;
    background: var(--semantic-error, #ef4444);
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: white;
  }

  .badge.warning {
    background: var(--semantic-warning, #f59e0b);
  }

  .panel-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .loading,
  .error,
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    height: 100%;
    color: var(--theme-text-dim);
    text-align: center;
    padding: 2rem;
  }

  .error {
    color: var(--semantic-error);
  }

  .retry-button {
    margin-top: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.5rem;
    color: var(--theme-text);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .retry-button:hover {
    background: var(--theme-card-hover-bg);
  }

  .empty i {
    font-size: 2.5rem;
    opacity: 0.5;
  }

  .empty p {
    margin: 0;
    font-size: 0.875rem;
    opacity: 0.7;
  }

  .entries-list {
    padding: 1rem;
    overflow-y: auto;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .entry-card {
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    transition: all var(--duration-fast) ease;
  }

  .entry-card.processing {
    opacity: 0.6;
    pointer-events: none;
  }

  .entry-card.reported {
    border-color: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 40%,
      transparent
    );
  }

  .entry-header {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }

  .entry-thumbnail {
    width: 64px;
    height: 64px;
    border-radius: 0.5rem;
    object-fit: cover;
    background: var(--theme-card-hover-bg);
    flex-shrink: 0;
  }

  .entry-thumbnail.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-text-dim);
    font-size: 1.5rem;
  }

  .entry-info {
    flex: 1;
    min-width: 0;
  }

  .entry-word {
    margin: 0 0 0.25rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-text);
    font-family: var(--font-mono, monospace);
  }

  .entry-submitter,
  .entry-date,
  .report-count {
    margin: 0;
    font-size: 0.75rem;
    color: var(--theme-text-dim);
  }

  .report-count {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--semantic-warning, #f59e0b);
    font-weight: 500;
  }

  .flagged-terms {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .terms-label {
    font-size: 0.75rem;
    color: var(--theme-text-dim);
  }

  .term-badge {
    padding: 0.125rem 0.5rem;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
    border-radius: 0.25rem;
    font-size: 0.75rem;
    color: var(--semantic-error, #ef4444);
    text-transform: capitalize;
  }

  .entry-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .category-select {
    padding: 0.5rem 0.75rem;
    background: var(--theme-card-hover-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.375rem;
    color: var(--theme-text);
    font-size: 0.875rem;
    cursor: pointer;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.approve {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 20%,
      transparent
    );
    color: var(--semantic-success, #22c55e);
  }

  .action-btn.approve:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 30%,
      transparent
    );
  }

  .action-btn.reject {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
    color: var(--semantic-error, #ef4444);
  }

  .action-btn.reject:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 30%,
      transparent
    );
  }

  .action-btn.feature {
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 20%,
      transparent
    );
    color: var(--semantic-warning, #f59e0b);
  }

  .action-btn.feature.active {
    background: var(--semantic-warning, #f59e0b);
    color: white;
  }

  .action-btn.hide {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text-dim);
  }

  .action-btn.hide:hover:not(:disabled) {
    background: var(--theme-stroke);
    color: var(--theme-text);
  }

  /* Reject modal body */
  .reject-modal-body {
    padding: var(--modal-padding, 24px);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .field-label {
    display: block;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--theme-text);
  }

  .reason-input {
    width: 100%;
    padding: 0.75rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.5rem;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-family: inherit;
    resize: vertical;
  }

  .reason-input:focus {
    outline: none;
    border-color: var(--theme-accent);
  }

  @media (max-width: 640px) {
    .panel-header {
      flex-direction: column;
    }

    .entry-actions {
      flex-direction: column;
    }

    .action-btn,
    .category-select {
      width: 100%;
      justify-content: center;
    }
  }

</style>
