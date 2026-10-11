<script lang="ts">
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import { onMount } from "svelte";
  import { getPending, approve, reject } from "../../services/festival-submission-reviewer";
  import { getFestivalContext } from "../../context/festival-context";
  import type { FestivalSubmission } from "../../domain/models/festival";

  // Destructure as festivalState to avoid conflict with Svelte 5 $state rune
  const { state: festivalState } = getFestivalContext();

  let pending = $state<FestivalSubmission[]>([]);
  let isLoading = $state(true);
  let loadError = $state("");
  let actionErrors = $state<Record<string, string>>({});
  let actingOn = $state<Record<string, boolean>>({});

  onMount(async () => {
    await loadPending();
  });

  async function loadPending() {
    isLoading = true;
    loadError = "";
    try {
      pending = await getPending();
    } catch (err) {
      loadError = err instanceof Error ? err.message : "Failed to load submissions.";
    } finally {
      isLoading = false;
    }
  }

  async function handleApprove(id: string) {
    actingOn = { ...actingOn, [id]: true };
    actionErrors = { ...actionErrors, [id]: "" };
    try {
      await approve(id);
      pending = pending.filter((s) => s.id !== id);
    } catch (err) {
      actionErrors = {
        ...actionErrors,
        [id]: err instanceof Error ? err.message : "Approve failed.",
      };
    } finally {
      actingOn = { ...actingOn, [id]: false };
    }
  }

  async function handleReject(id: string) {
    actingOn = { ...actingOn, [id]: true };
    actionErrors = { ...actionErrors, [id]: "" };
    try {
      await reject(id);
      pending = pending.filter((s) => s.id !== id);
    } catch (err) {
      actionErrors = {
        ...actionErrors,
        [id]: err instanceof Error ? err.message : "Reject failed.",
      };
    } finally {
      actingOn = { ...actingOn, [id]: false };
    }
  }

  function formatDate(ts: { toDate?: () => Date; seconds?: number } | null | undefined): string {
    if (!ts) return "-";
    // Firebase Timestamp has toDate(); plain objects from tests may have seconds
    if (typeof ts.toDate === "function") return ts.toDate().toLocaleDateString();
    if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleDateString();
    return "-";
  }
</script>

<section class="moderation-queue" aria-label="Festival submission moderation queue">
  <header class="queue-header">
    <h3>
      <i class="fas fa-inbox" aria-hidden="true"></i>
      Pending submissions
      {#if !isLoading && pending.length > 0}
        <span class="badge">{pending.length}</span>
      {/if}
    </h3>
    <button
      type="button"
      class="refresh-btn"
      onclick={loadPending}
      disabled={isLoading}
      aria-label="Refresh list"
    >
      <i class="fas fa-rotate" class:fa-spin={isLoading} aria-hidden="true"></i>
    </button>
  </header>

  {#if isLoading}
    <div class="queue-loading">
      <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
      Loading…
    </div>
  {:else if loadError}
    <div class="queue-error" role="alert">
      <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
      {loadError}
    </div>
  {:else if pending.length === 0}
    <div class="queue-empty">
      <i class="fas fa-check-circle" aria-hidden="true"></i>
      Nothing pending.
    </div>
  {:else}
    <ul class="submission-list" role="list">
      {#each pending as submission (submission.id)}
        <li class="submission-card" role="listitem">
          <div class="submission-info">
            <span class="submission-name">{submission.name}</span>
            <span class="submission-location">
              {submission.city}, {submission.country}
              {#if submission.venue}
                · {submission.venue}
              {/if}
            </span>
            <span class="submission-dates">
              {formatDate(submission.dates?.start)} – {formatDate(submission.dates?.end)}
            </span>
            <LinkChip
              class="submission-website"
              wrap
              href={submission.websiteUrl}>{submission.websiteUrl}</LinkChip
            >

            {#if submission.seekingInstructors || submission.seekingPerformers}
              <div class="submission-flags">
                {#if submission.seekingInstructors}
                  <span class="flag">
                    <i class="fas fa-chalkboard-teacher" aria-hidden="true"></i>
                    Seeking instructors
                  </span>
                {/if}
                {#if submission.seekingPerformers}
                  <span class="flag">
                    <i class="fas fa-fire" aria-hidden="true"></i>
                    Seeking performers
                  </span>
                {/if}
              </div>
            {/if}

            {#if submission.tags?.length}
              <div class="submission-tags">
                {#each submission.tags as tag}
                  <span class="tag">{tag}</span>
                {/each}
              </div>
            {/if}

            {#if submission.description}
              <p class="submission-desc">{submission.description}</p>
            {/if}
          </div>

          {#if actionErrors[submission.id]}
            <div class="action-error" role="alert">
              <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
              {actionErrors[submission.id]}
            </div>
          {/if}

          <div class="submission-actions">
            <button
              type="button"
              class="btn-reject"
              onclick={() => handleReject(submission.id)}
              disabled={!!actingOn[submission.id]}
              aria-label="Reject {submission.name}"
            >
              {#if actingOn[submission.id]}
                <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
              {:else}
                <i class="fas fa-xmark" aria-hidden="true"></i>
              {/if}
              Reject
            </button>
            <button
              type="button"
              class="btn-approve"
              onclick={() => handleApprove(submission.id)}
              disabled={!!actingOn[submission.id]}
              aria-label="Approve {submission.name}"
            >
              {#if actingOn[submission.id]}
                <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
              {:else}
                <i class="fas fa-check" aria-hidden="true"></i>
              {/if}
              Approve
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .moderation-queue {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 12px);
    overflow: hidden;
  }


  .queue-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .queue-header h3 {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .queue-header h3 i {
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.5));
    font-size: 13px;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    background: var(--theme-accent, #3b82f6);
    border-radius: 10px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: #ffffff;
    line-height: 1;
  }

  .refresh-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm, 6px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    transition: color 0.15s ease, background-color 0.15s ease;
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #ffffff);
  }

  .refresh-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }


  .queue-loading,
  .queue-empty,
  .queue-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 24px 16px;
    font-size: var(--font-size-min, 14px);
    justify-content: center;
  }

  .queue-loading {
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.5));
  }

  .queue-empty {
    color: var(--semantic-success, #22c55e);
  }

  .queue-error {
    color: var(--semantic-error, #ef4444);
  }


  .submission-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .submission-card {
    padding: 14px 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .submission-card:last-child {
    border-bottom: none;
  }

  .submission-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .submission-name {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .submission-location,
  .submission-dates {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
  }

  .submission-card :global(.submission-website) {
    align-self: flex-start;
  }

  .submission-flags {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 2px;
  }

  .flag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    padding: 2px 8px;
  }

  .submission-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 2px;
  }

  .tag {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.5));
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    padding: 2px 7px;
  }

  .submission-desc {
    margin: 2px 0 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
    line-height: 1.5;
  }


  .action-error {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-md, 8px);
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-compact, 12px);
  }


  .submission-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .btn-reject,
  .btn-approve {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: var(--radius-md, 8px);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    min-height: 36px;
    border: none;
  }

  .btn-reject {
    background: rgba(239, 68, 68, 0.12);
    color: var(--semantic-error, #ef4444);
  }

  .btn-reject:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.22);
  }

  .btn-approve {
    background: rgba(34, 197, 94, 0.12);
    color: var(--semantic-success, #22c55e);
  }

  .btn-approve:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.22);
  }

  .btn-reject:disabled,
  .btn-approve:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }
  }
</style>
