<!-- StatusTimeline - Visual timeline showing feedback status history -->
<script lang="ts">
  import type {
    StatusHistoryEntry,
    FeedbackStatus,
  } from "$lib/shared/feedback/domain/models/feedback-models";
  import { STATUS_CONFIG } from "$lib/shared/feedback/domain/models/feedback-models";
  import { getLocale, t } from "$lib/shared/i18n/i18n.svelte.js";
  import { feedbackStatusLabel } from "../../domain/feedback-display-labels";

  let {
    history = [],
    currentStatus,
    createdAt,
    userFacingNotes,
    fixedInVersion,
  } = $props<{
    history?: StatusHistoryEntry[];
    currentStatus: FeedbackStatus;
    createdAt: Date;
    userFacingNotes?: string;
    fixedInVersion?: string;
  }>();

  // Timeline entry type
  type TimelineEntry = {
    status: FeedbackStatus;
    timestamp: Date;
    notes?: string;
    actor?: string;
  };

  // Build timeline entries from history, or create a simple one if no history
  const timelineEntries = $derived((): TimelineEntry[] => {
    if (history && history.length > 0) {
      return history.map(
        (entry: StatusHistoryEntry): TimelineEntry => ({
          status: entry.status,
          timestamp: entry.timestamp,
          notes: entry.notes,
          actor: entry.actorName,
        })
      );
    }

    // Fallback: create minimal timeline from current state
    const entries: TimelineEntry[] = [{ status: "new", timestamp: createdAt }];

    if (currentStatus !== "new") {
      entries.push({
        status: currentStatus,
        timestamp: new Date(), // Approximate
      });
    }

    return entries;
  });

  function formatDate(date: Date): string {
    return date.toLocaleDateString(getLocale(), {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function getStatusLabel(status: FeedbackStatus): string {
    return feedbackStatusLabel(status);
  }

  function getStatusColor(status: FeedbackStatus): string {
    return STATUS_CONFIG[status]?.color || "#6b7280";
  }

  function getStatusIcon(status: FeedbackStatus): string {
    return STATUS_CONFIG[status]?.icon || "fa-circle";
  }
</script>

<div class="timeline-container">
  <h3 class="timeline-header">
    <i class="fas fa-history" aria-hidden="true"></i>
    {t("feedback_status_history")}
  </h3>

  <div class="timeline">
    {#each timelineEntries() as entry, index}
      {@const isLast = index === timelineEntries().length - 1}
      {@const config = STATUS_CONFIG[entry.status]}
      <div class="timeline-entry" class:is-last={isLast}>
        <div class="timeline-line" class:hidden={isLast}></div>
        <div
          class="timeline-dot"
          style="--status-color: {getStatusColor(entry.status)}"
        >
          <i class="fas {getStatusIcon(entry.status)}" aria-hidden="true"></i>
        </div>
        <div class="timeline-content">
          <div class="timeline-status">
            <span
              class="status-label"
              style="color: {getStatusColor(entry.status)}"
            >
              {getStatusLabel(entry.status)}
            </span>
            <span class="timestamp">{formatDate(entry.timestamp)}</span>
          </div>
          {#if entry.notes}
            <p class="timeline-notes">{entry.notes}</p>
          {/if}
          {#if entry.actor}
            <span class="actor"
              >{t("feedback_by_actor", { name: entry.actor })}</span
            >
          {/if}
        </div>
      </div>
    {/each}

    <!-- Show user-facing notes if present and completed/archived -->
    {#if userFacingNotes && ["completed", "archived"].includes(currentStatus)}
      <div class="resolution-summary">
        <i class="fas fa-check-circle" aria-hidden="true"></i>
        <div class="resolution-content">
          <span class="resolution-label">{t("feedback_what_was_done")}</span>
          <p class="resolution-text">{userFacingNotes}</p>
          {#if fixedInVersion}
            <span class="version-tag">
              <i class="fas fa-tag" aria-hidden="true"></i>
              v{fixedInVersion}
            </span>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .timeline-container {
    margin-bottom: 20px;
  }

  .timeline-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 12px 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--theme-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .timeline {
    position: relative;
    padding-left: 8px;
  }

  .timeline-entry {
    position: relative;
    display: flex;
    gap: 12px;
    padding-bottom: 16px;
  }

  .timeline-entry.is-last {
    padding-bottom: 0;
  }

  .timeline-line {
    position: absolute;
    left: 11px;
    top: 24px;
    bottom: 0;
    width: 2px;
    background: linear-gradient(
      to bottom,
      var(--status-color, var(--theme-stroke)),
      var(--theme-stroke)
    );
    opacity: 0.3;
  }

  .timeline-line.hidden {
    display: none;
  }

  .timeline-dot {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--status-color) 30%, var(--theme-card-bg)),
      color-mix(in srgb, var(--status-color) 15%, var(--theme-card-bg))
    );
    border: 2px solid var(--status-color);
    border-radius: 50%;
    flex-shrink: 0;
    z-index: 1;
  }

  .timeline-dot i {
    font-size: 0.625rem;
    color: var(--status-color);
  }

  .timeline-content {
    flex: 1;
    min-width: 0;
  }

  .timeline-status {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .status-label {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .timestamp {
    font-size: 0.75rem;
    color: var(--theme-text-dim);
  }

  .timeline-notes {
    margin: 4px 0 0 0;
    font-size: 0.8125rem;
    color: var(--theme-text);
    line-height: 1.4;
  }

  .actor {
    font-size: 0.6875rem;
    color: var(--theme-text-dim);
    opacity: 0.7;
  }

  /* Resolution summary */
  .resolution-summary {
    display: flex;
    gap: 10px;
    margin-top: 12px;
    padding: 12px;
    background: linear-gradient(
      135deg,
      rgba(16, 185, 129, 0.15),
      rgba(16, 185, 129, 0.08)
    );
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 10px;
  }

  .resolution-summary > i {
    flex-shrink: 0;
    font-size: 1rem;
    color: #10b981;
    margin-top: 2px;
  }

  .resolution-content {
    flex: 1;
    min-width: 0;
  }

  .resolution-label {
    display: block;
    font-size: 0.6875rem;
    font-weight: 600;
    color: #10b981;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
  }

  .resolution-text {
    margin: 0;
    font-size: 0.875rem;
    color: var(--theme-text);
    line-height: 1.5;
  }

  .version-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    padding: 3px 8px;
    background: rgba(16, 185, 129, 0.2);
    border-radius: 4px;
    font-size: 0.6875rem;
    font-weight: 600;
    color: #10b981;
  }

  .version-tag i {
    font-size: 0.5625rem;
  }
</style>
