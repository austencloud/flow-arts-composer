<!-- FeedbackStatusHistory - Simple timeline of status changes -->
<script lang="ts">
  import type { StatusHistoryEntry } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import { STATUS_CONFIG } from "#lib/shared/feedback/domain/models/feedback-models.js";

  const { history = [] } = $props<{
    history?: StatusHistoryEntry[];
  }>();

  // Format relative time
  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Sort history by timestamp (newest first)
  const sortedHistory = $derived(
    [...history].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  );
</script>

{#if sortedHistory.length > 0}
  <section class="section">
    <h3 class="section-title">
      <i class="fas fa-history" aria-hidden="true"></i>
      Status History
    </h3>
    <div class="timeline">
      {#each sortedHistory as entry}
        {@const config =
          STATUS_CONFIG[entry.status as keyof typeof STATUS_CONFIG]}
        <div class="timeline-entry">
          <div class="timeline-dot" style="background: {config.color}">
            <i class="fas {config.icon}" aria-hidden="true"></i>
          </div>
          <div class="timeline-content">
            <div class="timeline-status" style="color: {config.color}">
              {config.label}
            </div>
            <div class="timeline-time">
              {formatRelativeTime(entry.timestamp)}
            </div>
          </div>
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: 13px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: color-mix(
      in srgb,
      var(--theme-text-dim, var(--theme-text-dim)) 65%,
      transparent
    );
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .timeline {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .timeline-entry {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .timeline-dot {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: white;
    font-size: var(--font-size-compact);
  }

  .timeline-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .timeline-status {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .timeline-time {
    font-size: 0.75rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  /* Mobile: Smaller elements */
  @media (max-width: 500px) {
    .timeline-dot {
      width: 20px;
      height: 20px;
      font-size: var(--font-size-compact);
    }

    .timeline-status {
      font-size: 0.8125rem;
    }

    .timeline-time {
      font-size: 0.75rem;
    }
  }
</style>
